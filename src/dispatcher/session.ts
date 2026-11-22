/**
 * L1 dispatcher session: start/stop/resume and the persisted task board.
 *
 * The session is the only place that applies policy decisions to a board. The
 * policy (`policy.ts`) stays pure — it decides, this session applies — so the
 * gate can call the policy without owning any state, and the session owns the
 * state without deciding anything itself.
 *
 * Persistence is a single JSON file (`board.json` under the given directory),
 * written atomically (tmp file + rename, same directory) after every applied
 * effect and on `stop()`. `resume()` reads that file back, so a restarted L1
 * steward picks up exactly the board it left behind.
 *
 * Task-8 docking point: when `src/taskboard/` lands, its store already
 * satisfies `TaskReader` (it has `get`/`has` by task id). Point this session
 * at that store — replace the in-memory `Map` below with the task-8 store and
 * keep the `decideIntent` → `applyEffect` order unchanged. Until then this
 * file is self-contained and touches no other module.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decideIntent,
  decideRawIntent,
  type DispatcherDecision,
  type DispatcherEffect,
  type DispatcherIntent,
  type DispatcherTask,
  type TaskReader,
} from './policy.js'

/** On-disk shape of the persisted board. Versioned for future migrations. */
export interface DispatcherBoardFile {
  version: 1
  tasks: DispatcherTask[]
}

/** What `resume()` found on disk. */
export interface DispatcherResumeResult {
  /** True when a board file existed and loaded; false when starting empty. */
  restored: boolean
  /** Number of tasks on the board after resume. */
  tasks: number
  /** Where the board file lives (undefined for memory-only sessions). */
  path?: string
}

function boardFileName(dir: string): string {
  return join(dir, 'board.json')
}

/** Read and validate a board file; throws on corruption (fail closed). */
export function readBoardFile(path: string): DispatcherTask[] {
  const raw = readFileSync(path, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== 1 ||
    !Array.isArray((parsed as { tasks?: unknown }).tasks)
  ) {
    throw new Error(`dispatcher board file is corrupt or has an unknown version: ${path}`)
  }
  const tasks = (parsed as { tasks: unknown[] }).tasks
  const checked: DispatcherTask[] = []
  for (const entry of tasks) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`dispatcher board file holds a non-object task: ${path}`)
    }
    const candidate = entry as Record<string, unknown>
    if (typeof candidate['id'] !== 'string' || typeof candidate['title'] !== 'string') {
      throw new Error(`dispatcher board file holds a task without id/title: ${path}`)
    }
    if (!['pending', 'running', 'completed', 'blocked'].includes(String(candidate['status']))) {
      throw new Error(`dispatcher board file holds a task with unknown status: ${path}`)
    }
    checked.push(entry as DispatcherTask)
  }
  return checked
}

/** Atomic write: tmp file in the same directory, then rename over the target. */
function writeBoardFileAtomic(path: string, tasks: DispatcherTask[]): void {
  const dir = path.slice(0, Math.max(path.lastIndexOf('/'), 0)) || '.'
  mkdirSync(dir, { recursive: true })
  const payload: DispatcherBoardFile = { version: 1, tasks }
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
  renameSync(tmp, path)
}

/**
 * The L1 steward session.
 *
 * Lifecycle: `start()` opens a fresh board (memory-only unless a directory
 * was given), `stop()` persists and deactivates, `resume()` reloads the
 * persisted board and reactivates. While inactive every intent is refused
 * with `invalid:session-inactive` — a stopped steward records nothing.
 */
export class DispatcherSession implements TaskReader {
  private readonly boardPath: string | undefined
  private readonly tasks = new Map<string, DispatcherTask>()
  private active = false

  constructor(boardDir?: string) {
    this.boardPath = boardDir === undefined ? undefined : boardFileName(boardDir)
  }

  /** True while the session accepts intents. */
  get isActive(): boolean {
    return this.active
  }

  /** Where the board persists (undefined for memory-only sessions). */
  get path(): string | undefined {
    return this.boardPath
  }

  /** TaskReader surface, so policy decisions read this session directly. */
  get(id: string): DispatcherTask | undefined {
    return this.tasks.get(id)
  }

  /** TaskReader surface. */
  has(id: string): boolean {
    return this.tasks.has(id)
  }

  /** Current board contents, sorted by id for determinism. */
  list(): DispatcherTask[] {
    return [...this.tasks.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }

  /** Open the session with an empty board. */
  start(): void {
    this.tasks.clear()
    this.active = true
  }

  /** Persist (when a directory was given) and deactivate. */
  stop(): void {
    this.persist()
    this.active = false
  }

  /**
   * Reopen the session from the persisted board.
   *
   * No board file yet means a first start: the session activates with an
   * empty board and reports `restored: false`. A corrupt file throws and the
   * session stays inactive — fail closed, never guess at the board.
   */
  resume(): DispatcherResumeResult {
    if (this.boardPath === undefined) {
      this.tasks.clear()
      this.active = true
      return { restored: false, tasks: 0 }
    }
    let loaded: DispatcherTask[]
    try {
      loaded = readBoardFile(this.boardPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.tasks.clear()
        this.active = true
        return { restored: false, tasks: 0, path: this.boardPath }
      }
      throw error
    }
    this.tasks.clear()
    for (const task of loaded) this.tasks.set(task.id, { ...task })
    this.active = true
    return { restored: true, tasks: this.tasks.size, path: this.boardPath }
  }

  /**
   * Decide one typed intent and, when allowed, apply its effect to the board.
   *
   * Refusals change nothing. Allowed intents persist immediately (when a
   * directory was given), so a crash loses at most nothing already answered.
   */
  handle(intent: DispatcherIntent): DispatcherDecision {
    if (!this.active) {
      const id = 'id' in intent ? intent.id : undefined
      return {
        ok: false,
        op: intent.op,
        ...(id === undefined ? {} : { id }),
        code: 'invalid:session-inactive',
        message: `dispatcher refused ${intent.op}: session is not active (先 start/resume 再记事)`,
      }
    }
    const decision = decideIntent(this, intent)
    if (decision.ok) {
      this.applyEffect(decision.effect)
      this.persist()
    }
    return decision
  }

  /**
   * Decide one untyped (gate-side JSON) intent and apply it when allowed.
   *
   * Same apply-and-persist rule as {@link handle}; unknown operations and
   * verdict writes are refused before anything is touched.
   */
  handleRaw(raw: Record<string, unknown>): DispatcherDecision {
    if (!this.active) {
      const op = typeof raw['op'] === 'string' ? (raw['op'] as string) : String(raw['op'])
      const id = typeof raw['id'] === 'string' ? (raw['id'] as string) : undefined
      return {
        ok: false,
        op,
        ...(id === undefined ? {} : { id }),
        code: 'invalid:session-inactive',
        message: `dispatcher refused ${op}: session is not active (先 start/resume 再记事)`,
      }
    }
    const decision = decideRawIntent(this, raw)
    if (decision.ok) {
      this.applyEffect(decision.effect)
      this.persist()
    }
    return decision
  }

  private applyEffect(effect: DispatcherEffect): void {
    if (effect.kind === 'insert') {
      this.tasks.set(effect.task.id, { ...effect.task })
      return
    }
    const current = this.tasks.get(effect.id)
    if (current === undefined) return
    const next: DispatcherTask = { ...current }
    const patch = effect.patch as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        delete (next as unknown as Record<string, unknown>)[key]
      } else {
        ;(next as unknown as Record<string, unknown>)[key] = value
      }
    }
    this.tasks.set(effect.id, next)
  }

  private persist(): void {
    if (this.boardPath === undefined) return
    writeBoardFileAtomic(this.boardPath, this.list())
  }
}
