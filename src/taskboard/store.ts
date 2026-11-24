/**
 * Durable task board: the truth layer for two-level team management.
 *
 * Model (aligns with the dsh-agent-team shared task board):
 *
 * - The dispatcher (upper level) creates rows: id, title, and `blocked_by`
 *   dependency wiring. Workers (lower level) only move rows through the
 *   state machine. What is on disk decides who owns what — never memory.
 * - Task ids are globally unique per board; creating a duplicate id fails.
 * - Every mutation goes through compare-and-swap on `version`: the caller
 *   passes the version it read, the board applies the change only when the
 *   stored version still matches, and a mismatch fails with
 *   `TaskboardError('version-conflict')` carrying both versions. There is no
 *   last-writer-wins anywhere.
 * - The guard is checked against the file, not against a stale in-memory
 *   copy: each mutation takes the board's exclusive lock file, re-reads
 *   `store.jsonl`, checks the row against what is on disk, applies the
 *   change, and persists. Two workers that read the same version therefore
 *   cannot both win — the loser sees `version-conflict` — and concurrent
 *   claims on different rows cannot erase each other (a whole-file rewrite
 *   without the lock could). `get`/`list` still serve the last loaded
 *   snapshot; a read-only observer calls `reload()` to see other writers.
 * - State machine: `pending → in_progress → completed | failed | blocked`;
 *   `blocked → pending` requeues a task; `failed → pending` retries it;
 *   `completed` rows are immutable and reject every mutation.
 * - Dependencies: `blocked_by` lists predecessor ids. `claim` (and
 *   `requeue` back into `pending` when the task was `blocked`/`failed`)
 *   refuses while any predecessor is missing or not `completed`, with
 *   `TaskboardError('dependency-blocked')` naming the unmet ids.
 * - Every row — id, title, status, owner, blocked_by, version, timestamps,
 *   detail — is persisted to `store.jsonl`. Reopening the same directory
 *   recovers all of it, so a restart loses nothing.
 *
 * Durability (same idea as `src/checkpoint/writer.ts`, taskboard-local):
 * the whole board (one JSON object per line, each carrying the schema tag
 * and a sha-256 checksum over its canonical payload) is serialized, written
 * to a hidden `*.tmp` file in the board directory with an fsync, and only
 * then renamed over `store.jsonl`. A reader therefore never sees a
 * half-written store, and a failed write leaves the previous store intact.
 * Lines whose checksum no longer matches are refused on open.
 *
 * Crash recovery, concretely: a process killed between the `*.tmp` write and
 * the rename leaves the previous `store.jsonl` authoritative and one hidden
 * temporary file behind, which no reader ever opens. A process killed while
 * holding the claim lock leaves the lock file behind; the next writer treats
 * an unreleased lock older than `lockStaleMs` (default 5 s) as abandoned,
 * removes it, and proceeds. A store whose last line was torn by a
 * non-atomic writer is refused with `TaskboardError('integrity')` rather
 * than silently dropped.
 */

import { createHash, randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  assertTaskRecord,
  TASKBOARD_LIMITS,
  TASKBOARD_LOCK,
  TASKBOARD_LOCK_FILE,
  TASKBOARD_SCHEMA,
  TASKBOARD_STORE_FILE,
  type CloseOptions,
  type CreateTaskInput,
  type TaskboardOptions,
  type TaskRecord,
} from './types.js'

export type { CloseOptions, CreateTaskInput, TaskRecord, TaskStatus, TaskboardOptions } from './types.js'
export { TASKBOARD_LIMITS, TASKBOARD_LOCK, TASKBOARD_LOCK_FILE, TASKBOARD_SCHEMA, TASKBOARD_STORE_FILE } from './types.js'
export { assertTaskRecord } from './types.js'

/** Machine-readable failure reasons; every method throws only these. */
export type TaskboardErrorCode =
  | 'duplicate-id'
  | 'not-found'
  | 'version-conflict'
  | 'invalid-transition'
  | 'immutable'
  | 'dependency-blocked'
  | 'invalid-input'
  | 'too-large'
  | 'io'
  | 'integrity'

/** Error thrown by every `TaskBoard` failure, with a stable `code`. */
export class TaskboardError extends Error {
  readonly code: TaskboardErrorCode
  /** The version the caller passed as its CAS guard, when relevant. */
  readonly expectedVersion?: number | undefined
  /** The version actually stored, when relevant. */
  readonly actualVersion?: number | undefined
  /** Dependency ids that are missing or not completed, for `dependency-blocked`. */
  readonly unmet?: readonly string[] | undefined

  constructor(
    code: TaskboardErrorCode,
    message: string,
    extra?: { expectedVersion?: number | undefined, actualVersion?: number | undefined, unmet?: readonly string[] | undefined },
  ) {
    super(message)
    this.name = 'TaskboardError'
    this.code = code
    this.expectedVersion = extra?.expectedVersion
    this.actualVersion = extra?.actualVersion
    this.unmet = extra?.unmet
  }
}

/** Returned alongside a snapshot so callers can distinguish stale reads. */
export interface TaskSnapshot {
  task: TaskRecord
}

interface StoredLine {
  schema: string
  checksum: string
  task: TaskRecord
}

/** Sort object keys so the checksum is reproducible offline. */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
}

function checksumOf(task: TaskRecord): string {
  return createHash('sha256').update(canonicalJson(task), 'utf8').digest('hex')
}

function checkId(id: string): void {
  if (id === '' || id.length > TASKBOARD_LIMITS.idChars) {
    throw new TaskboardError('invalid-input', `task id must be 1..${TASKBOARD_LIMITS.idChars} characters`)
  }
}

function checkTitle(title: string): void {
  if (title === '' || title.length > TASKBOARD_LIMITS.titleChars) {
    throw new TaskboardError('invalid-input', `task title must be 1..${TASKBOARD_LIMITS.titleChars} characters`)
  }
}

function checkOwner(owner: string): void {
  if (owner === '' || owner.length > TASKBOARD_LIMITS.ownerChars) {
    throw new TaskboardError('invalid-input', `task owner must be 1..${TASKBOARD_LIMITS.ownerChars} characters`)
  }
}

function checkDetail(detail: string): void {
  if (detail.length > TASKBOARD_LIMITS.detailChars) {
    throw new TaskboardError('invalid-input', `task detail must be at most ${TASKBOARD_LIMITS.detailChars} characters`)
  }
}

function checkBlockedBy(blockedBy: readonly string[]): string[] {
  if (blockedBy.length > TASKBOARD_LIMITS.blockedByItems) {
    throw new TaskboardError(
      'invalid-input',
      `task blocked_by must hold at most ${TASKBOARD_LIMITS.blockedByItems} ids`,
    )
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of blockedBy) {
    checkId(entry)
    if (!seen.has(entry)) {
      seen.add(entry)
      out.push(entry)
    }
  }
  return out
}

function nowIso(): string {
  return new Date().toISOString()
}

function clone(task: TaskRecord): TaskRecord {
  return { ...task, blocked_by: [...task.blocked_by] }
}

function parseLine(line: string, lineNo: number): TaskRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    throw new TaskboardError('integrity', `store.jsonl line ${lineNo} is not valid JSON`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new TaskboardError('integrity', `store.jsonl line ${lineNo} is not an object`)
  }
  const envelope = parsed as Record<string, unknown>
  if (envelope['schema'] !== TASKBOARD_SCHEMA) {
    throw new TaskboardError('integrity', `store.jsonl line ${lineNo} carries an unknown schema`)
  }
  if (typeof envelope['checksum'] !== 'string') {
    throw new TaskboardError('integrity', `store.jsonl line ${lineNo} carries no checksum`)
  }
  const task = assertTaskRecord(envelope['task'])
  if (checksumOf(task) !== envelope['checksum']) {
    throw new TaskboardError('integrity', `store.jsonl line ${lineNo} fails its checksum (task ${task.id})`)
  }
  return task
}

/**
 * One durable board: one directory, one `store.jsonl`, every mutation
 * persisted before it returns. Every mutation re-reads the store under the
 * board's exclusive lock, so two handles (in one process or several) can
 * never both win the same claim and cannot drop each other's rows.
 */
export class TaskBoard {
  private readonly dir: string
  private readonly file: string
  private readonly lockFile: string
  private readonly lockTimeoutMs: number
  private readonly lockStaleMs: number
  private readonly tasks = new Map<string, TaskRecord>()

  private constructor(dir: string, options: TaskboardOptions) {
    this.dir = dir
    this.file = join(dir, TASKBOARD_STORE_FILE)
    this.lockFile = join(dir, TASKBOARD_LOCK_FILE)
    this.lockTimeoutMs = checkLockMs('lockTimeoutMs', options.lockTimeoutMs, TASKBOARD_LOCK.defaultTimeoutMs)
    this.lockStaleMs = checkLockMs('lockStaleMs', options.lockStaleMs, TASKBOARD_LOCK.defaultStaleMs)
  }

  /** Open the board at `dir`, creating it (empty) when no store exists. */
  static async open(dir: string, options: TaskboardOptions = {}): Promise<TaskBoard> {
    const board = new TaskBoard(dir, options)
    await board.load()
    return board
  }

  /** Directory holding `store.jsonl`. */
  get directory(): string {
    return this.dir
  }

  /** Number of rows on the board. */
  get size(): number {
    return this.tasks.size
  }

  /**
   * Re-read `store.jsonl` so this handle's `get`/`list` see rows another
   * handle wrote. Mutations already re-read under the lock; this is for
   * read-only observers.
   */
  async reload(): Promise<void> {
    await this.load()
  }

  /** Read one row; throws `not-found` for an unknown id. The result is a copy. */
  get(id: string): TaskRecord {
    const task = this.tasks.get(id)
    if (task === undefined) throw new TaskboardError('not-found', `unknown task: ${id}`)
    return clone(task)
  }

  /** True when a row with this id exists; never throws. */
  has(id: string): boolean {
    return this.tasks.has(id)
  }

  /** List every row, sorted by id. Each entry is a copy. */
  list(): TaskRecord[] {
    return [...this.tasks.values()].sort((left, right) => (left.id < right.id ? -1 : 1)).map(clone)
  }

  /**
   * List every row in arrival order (`seq`, then id), each entry a copy.
   *
   * WHY a second order: `list()` is sorted by id for a deterministic read,
   * but a queue is ordered by arrival. `seq` is persisted on the row, so this
   * order is the same before and after a restart — which the file order is
   * not, because rows are written sorted by id.
   */
  arrival(): TaskRecord[] {
    return [...this.tasks.values()]
      .sort((left, right) => {
        const delta = (left.seq ?? Number.MAX_SAFE_INTEGER) - (right.seq ?? Number.MAX_SAFE_INTEGER)
        if (delta !== 0) return delta
        return left.id < right.id ? -1 : 1
      })
      .map(clone)
  }

  /**
   * Create one `pending`, unowned row. The id must be globally unique on
   * this board — across handles and restarts, because the duplicate check
   * runs against the store under the lock; a duplicate fails with
   * `duplicate-id` and changes nothing.
   */
  async create(input: CreateTaskInput): Promise<TaskRecord> {
    checkId(input.id)
    checkTitle(input.title)
    const blockedBy = checkBlockedBy(input.blocked_by ?? [])
    if (blockedBy.includes(input.id)) {
      throw new TaskboardError('invalid-input', `task ${input.id} cannot depend on itself`)
    }
    return this.withLock(async () => {
      await this.load()
      if (this.tasks.has(input.id)) {
        throw new TaskboardError('duplicate-id', `task id already exists: ${input.id}`)
      }
      if (this.tasks.size + 1 > TASKBOARD_LIMITS.maxTasks) {
        throw new TaskboardError('too-large', `board holds at most ${TASKBOARD_LIMITS.maxTasks} tasks`)
      }
      const stamped = nowIso()
      const task: TaskRecord = {
        id: input.id,
        title: input.title,
        status: 'pending',
        owner: null,
        blocked_by: blockedBy,
        version: 1,
        // Arrival number, taken from what is on disk under the lock, so two
        // creators (in this process or another) cannot draw the same one.
        seq: this.nextSeq(),
        createdAt: stamped,
        updatedAt: stamped,
        detail: null,
      }
      this.tasks.set(task.id, task)
      try {
        await this.persist()
      } catch (error) {
        this.tasks.delete(task.id)
        throw error
      }
      return clone(task)
    })
  }

  /**
   * Claim a `pending` row: assign `owner` and move it to `in_progress`.
   * Refuses while any `blocked_by` predecessor is missing or not
   * `completed` (`dependency-blocked`), and refuses a stale CAS guard
   * (`version-conflict`).
   */
  async claim(id: string, owner: string, expectedVersion?: number): Promise<TaskRecord> {
    checkOwner(owner)
    return this.mutate(id, expectedVersion, (task) => {
      if (task.status !== 'pending') {
        throw new TaskboardError(
          'invalid-transition',
          `task ${id} cannot be claimed from status ${task.status}`,
        )
      }
      this.requireDependencies(task)
      return { ...task, status: 'in_progress', owner }
    })
  }

  /** Mark an `in_progress` row `completed`. Completed rows are immutable. */
  async complete(id: string, expectedVersion?: number): Promise<TaskRecord> {
    return this.mutate(id, expectedVersion, (task) => {
      if (task.status !== 'in_progress') {
        throw new TaskboardError(
          'invalid-transition',
          `task ${id} cannot complete from status ${task.status}`,
        )
      }
      return { ...task, status: 'completed' }
    })
  }

  /** Mark an `in_progress` row `failed`, optionally recording why. */
  async fail(id: string, options?: CloseOptions): Promise<TaskRecord> {
    if (options?.detail !== undefined) checkDetail(options.detail)
    return this.mutate(id, options?.expectedVersion, (task) => {
      if (task.status !== 'in_progress') {
        throw new TaskboardError(
          'invalid-transition',
          `task ${id} cannot fail from status ${task.status}`,
        )
      }
      return { ...task, status: 'failed', detail: options?.detail ?? task.detail }
    })
  }

  /** Mark an `in_progress` row `blocked`, optionally recording why. */
  async blockTask(id: string, options?: CloseOptions): Promise<TaskRecord> {
    if (options?.detail !== undefined) checkDetail(options.detail)
    return this.mutate(id, options?.expectedVersion, (task) => {
      if (task.status !== 'in_progress') {
        throw new TaskboardError(
          'invalid-transition',
          `task ${id} cannot block from status ${task.status}`,
        )
      }
      return { ...task, status: 'blocked', detail: options?.detail ?? task.detail }
    })
  }

  /**
   * Return a `blocked` or `failed` row to `pending` so it can be
   * reassigned. `completed` rows are immutable and refuse this with
   * `immutable`; claiming the requeued row re-checks dependencies.
   */
  async requeue(id: string, expectedVersion?: number): Promise<TaskRecord> {
    return this.mutate(id, expectedVersion, (task) => {
      if (task.status === 'completed') {
        throw new TaskboardError('immutable', `task ${id} is completed and cannot change`)
      }
      if (task.status !== 'blocked' && task.status !== 'failed') {
        throw new TaskboardError(
          'invalid-transition',
          `task ${id} cannot be requeued from status ${task.status}`,
        )
      }
      return { ...task, status: 'pending', owner: null }
    })
  }

  /**
   * Change one `pending` row's owner without starting it (dispatcher
   * pre-assignment). Refuses while dependencies are unmet.
   */
  async assign(id: string, owner: string, expectedVersion?: number): Promise<TaskRecord> {
    checkOwner(owner)
    return this.mutate(id, expectedVersion, (task) => {
      if (task.status === 'completed') {
        throw new TaskboardError('immutable', `task ${id} is completed and cannot change`)
      }
      if (task.status !== 'pending') {
        throw new TaskboardError(
          'invalid-transition',
          `task ${id} cannot be assigned from status ${task.status}`,
        )
      }
      this.requireDependencies(task)
      return { ...task, owner }
    })
  }

  /**
   * Replace one `pending` row's dependency list. Completed rows refuse
   * with `immutable`; re-claiming afterwards re-checks the new wiring.
   */
  async setDependencies(id: string, blockedBy: readonly string[], expectedVersion?: number): Promise<TaskRecord> {
    const next = checkBlockedBy(blockedBy)
    if (next.includes(id)) {
      throw new TaskboardError('invalid-input', `task ${id} cannot depend on itself`)
    }
    return this.mutate(id, expectedVersion, (task) => {
      if (task.status === 'completed') {
        throw new TaskboardError('immutable', `task ${id} is completed and cannot change`)
      }
      return { ...task, blocked_by: next }
    })
  }

  private requireDependencies(task: TaskRecord): void {
    const unmet = task.blocked_by.filter((dep) => {
      const predecessor = this.tasks.get(dep)
      return predecessor === undefined || predecessor.status !== 'completed'
    })
    if (unmet.length > 0) {
      throw new TaskboardError(
        'dependency-blocked',
        `task ${task.id} waits on unfinished predecessors: ${unmet.join(', ')}`,
        { unmet },
      )
    }
  }

  private async mutate(
    id: string,
    expectedVersion: number | undefined,
    next: (task: TaskRecord) => TaskRecord,
  ): Promise<TaskRecord> {
    return this.withLock(async () => {
      await this.load()
      const current = this.tasks.get(id)
      if (current === undefined) throw new TaskboardError('not-found', `unknown task: ${id}`)
      if (current.status === 'completed') {
        throw new TaskboardError('immutable', `task ${id} is completed and cannot change`)
      }
      if (expectedVersion !== undefined && current.version !== expectedVersion) {
        throw new TaskboardError(
          'version-conflict',
          `task ${id} changed underneath you: expected version ${expectedVersion}, stored version ${current.version}`,
          { expectedVersion, actualVersion: current.version },
        )
      }
      const updated: TaskRecord = { ...next(current), version: current.version + 1, updatedAt: nowIso() }
      this.tasks.set(id, updated)
      try {
        await this.persist()
      } catch (error) {
        this.tasks.set(id, current)
        throw error
      }
      return clone(updated)
    })
  }

  /**
   * Run `work` holding the board's exclusive lock file, releasing it on every
   * path including a throw. The lock is what makes the read → check → write
   * sequence atomic across handles and processes; without it a whole-file
   * rewrite from two writers would silently drop one of them.
   */
  private async withLock<T>(work: () => Promise<T>): Promise<T> {
    await mkdir(this.dir, { recursive: true })
    const deadline = Date.now() + this.lockTimeoutMs
    for (;;) {
      let acquired = false
      try {
        const handle = await open(this.lockFile, 'wx')
        try {
          await handle.writeFile(`${process.pid}\n`, 'utf8')
        } finally {
          await handle.close()
        }
        acquired = true
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code
        if (code !== 'EEXIST') {
          throw new TaskboardError('io', `taskboard lock failed: ${describe(error)}`)
        }
        if (await this.clearAbandonedLock()) continue
        if (Date.now() >= deadline) {
          throw new TaskboardError(
            'io',
            `taskboard is held by another writer for longer than ${this.lockTimeoutMs} ms: ${this.lockFile}`,
          )
        }
        await sleep(TASKBOARD_LOCK.retryMs)
      }
      if (!acquired) continue
      try {
        return await work()
      } finally {
        await rm(this.lockFile, { force: true }).catch(() => undefined)
      }
    }
  }

  /** Remove a lock left by a crashed writer; false while it is still young. */
  private async clearAbandonedLock(): Promise<boolean> {
    try {
      const info = await stat(this.lockFile)
      if (Date.now() - info.mtimeMs < this.lockStaleMs) return false
      await rm(this.lockFile, { force: true })
      return true
    } catch (error) {
      // Vanished between the failed open and this stat: the lock is already gone.
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true
      throw new TaskboardError('io', `taskboard lock check failed: ${describe(error)}`)
    }
  }

  private async load(): Promise<void> {
    let info
    try {
      info = await stat(this.file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        this.tasks.clear()
        return
      }
      throw new TaskboardError('io', `taskboard stat failed: ${describe(error)}`)
    }
    if (!info.isFile()) throw new TaskboardError('io', `taskboard path is not a regular file: ${this.file}`)
    if (info.size > TASKBOARD_LIMITS.maxBytes) {
      throw new TaskboardError(
        'too-large',
        `taskboard store is ${info.size} bytes, above the ${TASKBOARD_LIMITS.maxBytes} bound`,
      )
    }
    let text: string
    try {
      text = await readFile(this.file, 'utf8')
    } catch (error) {
      throw new TaskboardError('io', `taskboard read failed: ${describe(error)}`)
    }
    const next = new Map<string, TaskRecord>()
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      if (line.trim() === '') return
      const task = parseLine(line, index + 1)
      if (next.has(task.id)) throw new TaskboardError('integrity', `store.jsonl holds task ${task.id} twice`)
      next.set(task.id, task)
    })
    if (next.size > TASKBOARD_LIMITS.maxTasks) {
      throw new TaskboardError('too-large', `taskboard store holds more than ${TASKBOARD_LIMITS.maxTasks} tasks`)
    }
    this.tasks.clear()
    for (const [id, task] of next) this.tasks.set(id, task)
    this.stampLegacyArrival()
  }

  /**
   * Stamp `seq` onto rows that were written before the arrival marker existed.
   *
   * WHY the file position: a store written by an older build has no arrival
   * numbers, and its file order (sorted by id) is the only order it ever had —
   * so keeping that order and letting new rows follow it is the only way to
   * upgrade without silently reordering a queue. The stamps are in memory
   * until the next persist writes them, which is the upgrade itself.
   */
  private stampLegacyArrival(): void {
    if (![...this.tasks.values()].some((task) => task.seq === undefined)) return
    let index = 0
    for (const [id, task] of this.tasks) {
      index += 1
      this.tasks.set(id, { ...task, seq: task.seq ?? index })
    }
  }

  /** Next arrival number: one past the highest on the board (1 for a new board). */
  private nextSeq(): number {
    let highest = 0
    for (const task of this.tasks.values()) {
      if (task.seq !== undefined && task.seq > highest) highest = task.seq
    }
    return highest + 1
  }

  /**
   * Serialize the whole board (one checksummed JSON object per line) and
   * swap it over `store.jsonl` atomically: hidden `*.tmp` write, fsync,
   * then rename. A failed write leaves the previous store intact.
   */
  private async persist(): Promise<void> {
    const rows: StoredLine[] = [...this.tasks.values()]
      .sort((left, right) => (left.id < right.id ? -1 : 1))
      .map((task) => ({ schema: TASKBOARD_SCHEMA, checksum: checksumOf(task), task }))
    const file = rows.length === 0 ? '' : `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    const fileBytes = Buffer.byteLength(file, 'utf8')
    if (fileBytes > TASKBOARD_LIMITS.maxBytes) {
      throw new TaskboardError(
        'too-large',
        `taskboard store would be ${fileBytes} bytes, above the ${TASKBOARD_LIMITS.maxBytes} bound`,
      )
    }
    const dir = dirname(this.file)
    const tmp = join(dir, `.${basename(this.file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
    try {
      await mkdir(dir, { recursive: true })
      const handle = await open(tmp, 'w')
      try {
        await handle.writeFile(file, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined)
      throw new TaskboardError('io', `taskboard temporary write failed: ${describe(error)}`)
    }
    try {
      await rename(tmp, this.file)
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined)
      throw new TaskboardError('io', `taskboard rename failed: ${describe(error)}`)
    }
    try {
      const dirHandle = await open(dir, 'r')
      try {
        await dirHandle.sync()
      } finally {
        await dirHandle.close()
      }
    } catch {
      // The rename already landed; directory fsync is best-effort on
      // platforms that refuse to open a directory.
    }
  }
}

/** Open (or create) the board at `dir`. Reopening recovers every row. */
export async function openTaskboard(dir: string, options: TaskboardOptions = {}): Promise<TaskBoard> {
  return TaskBoard.open(dir, options)
}

/** Clamp and validate one lock tunable; a bad value is refused, not defaulted. */
function checkLockMs(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value < 0) {
    throw new TaskboardError('invalid-input', `${name} must be a non-negative number of milliseconds`)
  }
  return value
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
