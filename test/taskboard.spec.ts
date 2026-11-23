import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  openDefaultTaskboard,
  openTaskboard,
  TaskBoard,
  TaskboardError,
  TASKBOARD_DIR_ENV,
  TASKBOARD_SCHEMA,
  taskboardDir,
  taskboardFile,
} from '../src/taskboard/index.js'

let scratch: string

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'taskboard-'))
})

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true })
})

async function freshBoard(name: string): Promise<TaskBoard> {
  return openTaskboard(join(scratch, name))
}

function isTaskboardError(error: unknown, code: string): error is TaskboardError {
  return error instanceof TaskboardError && error.code === code
}

/** Poll `check` until it returns a value; a bounded wait, never a bare sleep. */
async function waitFor<T>(check: () => Promise<T | undefined> | T | undefined, what: string, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * Mirror of the store's canonical JSON (sorted keys, `undefined` dropped) and
 * its sha-256, so a test can hand-write a store line the store itself accepts.
 * Needed only for the "written before arrival numbers existed" case: such a
 * line's checksum is over exactly what was stored, and that store is by
 * definition not producible through the current writer.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
}

function lineChecksum(task: unknown): string {
  return createHash('sha256').update(canonical(task), 'utf8').digest('hex')
}

const WRITER = fileURLToPath(new URL('./fixtures/taskboard/writer.mjs', import.meta.url))

interface WriterHandle {
  child: ChildProcess
  done: Promise<NodeJS.Signals | null>
}

/** Start a real node process against a real board directory. */
function spawnWriter(dir: string, mode: 'loop' | 'hold-lock', progress: string): WriterHandle {
  const child = spawn(process.execPath, [WRITER], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      TASKBOARD_DIR: dir,
      TASKBOARD_MODE: mode,
      TASKBOARD_PROGRESS: progress,
      TASKBOARD_PREFIX: 'crash',
    },
  })
  const done = new Promise<NodeJS.Signals | null>((resolve) => {
    child.once('exit', (_code, signal) => resolve(signal))
  })
  return { child, done }
}

async function progressLines(progress: string): Promise<number> {
  try {
    const text = await readFile(progress, 'utf8')
    return text.split('\n').filter((line) => line.trim() !== '').length
  } catch {
    return 0
  }
}

async function lockPresent(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, '.store.jsonl.lock'))
    return true
  } catch {
    return false
  }
}

/* ---------------------------------------------------------- CRUD + schema -- */

describe('taskboard CRUD and schema v1', () => {
  it('creates a pending unowned row at version 1 and persists status/owner/deps/version', async () => {
    const board = await freshBoard('crud')
    const created = await board.create({ id: 'task-1', title: 'First', blocked_by: [] })
    expect(created).toMatchObject({ id: 'task-1', status: 'pending', owner: null, version: 1, blocked_by: [] })

    const claimed = await board.claim('task-1', 'agent-a')
    expect(claimed).toMatchObject({ status: 'in_progress', owner: 'agent-a', version: 2 })

    const done = await board.complete('task-1', claimed.version)
    expect(done).toMatchObject({ status: 'completed', version: 3 })

    // Every row is a defensive copy: mutating a return value changes nothing.
    const listed = board.list()
    expect(listed).toHaveLength(1)
    listed[0]!.id = 'hacked'
    expect(board.get('task-1').id).toBe('task-1')
  })

  it('rejects a duplicate task id', async () => {
    const board = await freshBoard('dup')
    await board.create({ id: 'task-1', title: 'Original' })
    const error = await board.create({ id: 'task-1', title: 'Clone' }).catch((cause: unknown) => cause)
    expect(isTaskboardError(error, 'duplicate-id')).toBe(true)
    expect(board.size).toBe(1)
  })

  it('walks the full state machine, including blocked requeue to pending', async () => {
    const board = await freshBoard('machine')
    await board.create({ id: 'task-1', title: 'Journey' })
    // pending cannot complete/fail/block directly.
    for (const run of [
      () => board.complete('task-1'),
      () => board.fail('task-1'),
      () => board.blockTask('task-1'),
    ]) {
      const error = await run().catch((cause: unknown) => cause)
      expect(isTaskboardError(error, 'invalid-transition')).toBe(true)
    }
    await board.claim('task-1', 'agent-a')
    const blocked = await board.blockTask('task-1', { detail: 'waiting on infra' })
    expect(blocked).toMatchObject({ status: 'blocked', detail: 'waiting on infra' })
    // A blocked row cannot be claimed until it returns to pending.
    const early = await board.claim('task-1', 'agent-b').catch((cause: unknown) => cause)
    expect(isTaskboardError(early, 'invalid-transition')).toBe(true)
    const requeued = await board.requeue('task-1')
    expect(requeued).toMatchObject({ status: 'pending', owner: null })
    const reclaimed = await board.claim('task-1', 'agent-b')
    expect(reclaimed.owner).toBe('agent-b')
    const failed = await board.fail('task-1', { detail: 'flaky test' })
    expect(failed.status).toBe('failed')
    await board.requeue('task-1')
    await board.claim('task-1', 'agent-c')
    await board.complete('task-1')
    expect(board.get('task-1').status).toBe('completed')
  })

  it('treats completed rows as immutable', async () => {
    const board = await freshBoard('immutable')
    await board.create({ id: 'task-1', title: 'Done' })
    await board.claim('task-1', 'agent-a')
    await board.complete('task-1')
    const version = board.get('task-1').version
    for (const run of [
      () => board.claim('task-1', 'agent-b'),
      () => board.complete('task-1'),
      () => board.fail('task-1'),
      () => board.blockTask('task-1'),
      () => board.requeue('task-1'),
      () => board.assign('task-1', 'agent-b'),
      () => board.setDependencies('task-1', []),
    ]) {
      const error = await run().catch((cause: unknown) => cause)
      expect(error instanceof TaskboardError).toBe(true)
      expect((error as TaskboardError).code === 'immutable' || (error as TaskboardError).code === 'invalid-transition').toBe(true)
    }
    // No failed mutation moved the version.
    expect(board.get('task-1').version).toBe(version)
  })

  it('rejects unknown ids and bad input', async () => {
    const board = await freshBoard('input')
    const missing = await board.claim('nope', 'agent-a').catch((cause: unknown) => cause)
    expect(isTaskboardError(missing, 'not-found')).toBe(true)
    const emptyId = await board.create({ id: '', title: 'x' }).catch((cause: unknown) => cause)
    expect(isTaskboardError(emptyId, 'invalid-input')).toBe(true)
    const emptyTitle = await board.create({ id: 't', title: '' }).catch((cause: unknown) => cause)
    expect(isTaskboardError(emptyTitle, 'invalid-input')).toBe(true)
    const selfDep = await board.create({ id: 't', title: 'T', blocked_by: ['t'] }).catch((cause: unknown) => cause)
    expect(isTaskboardError(selfDep, 'invalid-input')).toBe(true)
  })

  it('has reports presence by id and agrees with get', async () => {
    const board = await freshBoard('has')
    await board.create({ id: 'task-1', title: 'Present' })
    expect(board.has('task-1')).toBe(true)
    expect(board.get('task-1').id).toBe('task-1')
    expect(board.has('ghost')).toBe(false)
    let missing: unknown
    try {
      board.get('ghost')
    } catch (cause) {
      missing = cause
    }
    expect(isTaskboardError(missing, 'not-found')).toBe(true)
  })
})

/* ------------------------------------------------------------------ CAS -- */

describe('taskboard compare-and-swap', () => {
  it('applies only on a matching expectedVersion and reports both versions on conflict', async () => {
    const board = await freshBoard('cas')
    const created = await board.create({ id: 'task-1', title: 'Race' })
    const claimed = await board.claim('task-1', 'agent-a', created.version)
    expect(claimed.version).toBe(2)
    const stale = await board.complete('task-1', created.version).catch((cause: unknown) => cause)
    expect(isTaskboardError(stale, 'version-conflict')).toBe(true)
    expect((stale as TaskboardError).expectedVersion).toBe(created.version)
    expect((stale as TaskboardError).actualVersion).toBe(claimed.version)
    // The failed mutation left the row untouched.
    expect(board.get('task-1')).toMatchObject({ status: 'in_progress', version: claimed.version })
    // Omitting the guard always applies (single-writer path).
    const done = await board.complete('task-1')
    expect(done.version).toBe(claimed.version + 1)
  })

  it('two handles claiming the same row: exactly one wins, the other conflicts', async () => {
    const dir = join(scratch, 'race')
    const left = await openTaskboard(dir)
    const right = await openTaskboard(dir)
    await left.create({ id: 'task-1', title: 'Contended' })
    await right.reload()
    expect(left.get('task-1').version).toBe(right.get('task-1').version)

    // Both read version 1 and both claim it. A whole-file rewrite without the
    // claim lock would let both "succeed" and silently keep one owner; the
    // disk-checked CAS under the lock must pick exactly one winner.
    const results = await Promise.allSettled([
      left.claim('task-1', 'agent-left', 1),
      right.claim('task-1', 'agent-right', 1),
    ])
    const winners = results.filter((entry) => entry.status === 'fulfilled')
    const losers = results.filter((entry) => entry.status === 'rejected')
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(isTaskboardError((losers[0] as PromiseRejectedResult).reason, 'version-conflict')).toBe(true)
    const winner = (winners[0] as PromiseFulfilledResult<{ owner: string | null }>).value
    expect(['agent-left', 'agent-right']).toContain(winner.owner)

    // The file agrees with the winner: one owner, version 2, no double claim.
    const reopened = await openTaskboard(dir)
    expect(reopened.get('task-1')).toMatchObject({
      status: 'in_progress',
      owner: winner.owner,
      version: 2,
    })
  })

  it('concurrent claims on different rows keep both rows (no lost update)', async () => {
    const dir = join(scratch, 'race-rows')
    const left = await openTaskboard(dir)
    await left.create({ id: 'a', title: 'A' })
    await left.create({ id: 'b', title: 'B' })
    const right = await openTaskboard(dir)

    const [first, second] = await Promise.all([
      left.claim('a', 'agent-left', 1),
      right.claim('b', 'agent-right', 1),
    ])
    expect(first.owner).toBe('agent-left')
    expect(second.owner).toBe('agent-right')

    // The second writer re-read the store, so the first claim is not erased.
    const reopened = await openTaskboard(dir)
    expect(reopened.get('a')).toMatchObject({ owner: 'agent-left', status: 'in_progress' })
    expect(reopened.get('b')).toMatchObject({ owner: 'agent-right', status: 'in_progress' })
  })
})

/* -------------------------------------------------------------- restart -- */

describe('taskboard restart recovery', () => {
  it('reopening the same directory recovers status/owner/dependencies/version', async () => {
    const dir = join(scratch, 'restart')
    const first = await openTaskboard(dir)
    await first.create({ id: 'base', title: 'Base' })
    await first.create({ id: 'next', title: 'Next', blocked_by: ['base'] })
    await first.claim('base', 'agent-a')
    await first.complete('base')
    const claimed = await first.claim('next', 'agent-b')
    expect(claimed.version).toBe(2)

    const second = await openTaskboard(dir)
    expect(second.size).toBe(2)
    expect(second.get('base')).toMatchObject({ status: 'completed', owner: 'agent-a', version: 3 })
    expect(second.get('next')).toMatchObject({
      status: 'in_progress',
      owner: 'agent-b',
      blocked_by: ['base'],
      version: 2,
    })
    // The recovered board keeps enforcing CAS from the restored versions.
    const stale = await second.complete('next', 1).catch((cause: unknown) => cause)
    expect(isTaskboardError(stale, 'version-conflict')).toBe(true)
    await second.complete('next', 2)
    expect(second.get('next').status).toBe('completed')
  })

  it('opens empty when no store exists and refuses a checksum-tampered store', async () => {
    const board = await freshBoard('empty')
    expect(board.size).toBe(0)
    expect(board.list()).toEqual([])

    const dir = join(scratch, 'tamper')
    const writer = await openTaskboard(dir)
    await writer.create({ id: 'task-1', title: 'Sealed' })
    const storePath = join(dir, 'store.jsonl')
    const raw = await readFile(storePath, 'utf8')
    // Tamper with the payload while keeping the envelope checksum: the
    // reader must refuse the line instead of loading a forged row.
    const forged = raw.replace('"status":"pending"', '"status":"completed"')
    expect(forged).not.toBe(raw)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(storePath, forged, 'utf8')
    const error = await openTaskboard(dir).catch((cause: unknown) => cause)
    expect(isTaskboardError(error, 'integrity')).toBe(true)
  })
})

/* ---------------------------------------------------------- dependencies -- */

describe('taskboard dependencies', () => {
  it('blocks claim while a predecessor is unfinished and releases it when done', async () => {
    const board = await freshBoard('deps')
    await board.create({ id: 'a', title: 'A' })
    await board.create({ id: 'b', title: 'B', blocked_by: ['a'] })

    const early = await board.claim('b', 'agent-b').catch((cause: unknown) => cause)
    expect(isTaskboardError(early, 'dependency-blocked')).toBe(true)
    expect((early as TaskboardError).unmet).toEqual(['a'])

    await board.claim('a', 'agent-a')
    const stillBlocked = await board.claim('b', 'agent-b').catch((cause: unknown) => cause)
    expect(isTaskboardError(stillBlocked, 'dependency-blocked')).toBe(true)

    await board.complete('a')
    const released = await board.claim('b', 'agent-b')
    expect(released).toMatchObject({ status: 'in_progress', owner: 'agent-b' })
  })

  it('names every unmet predecessor, including missing ids', async () => {
    const board = await freshBoard('deps-missing')
    await board.create({ id: 'x', title: 'X', blocked_by: ['ghost', 'gap'] })
    const error = await board.claim('x', 'agent-x').catch((cause: unknown) => cause)
    expect(isTaskboardError(error, 'dependency-blocked')).toBe(true)
    expect((error as TaskboardError).unmet).toEqual(['ghost', 'gap'])
  })

  it('assign and setDependencies re-check the wiring', async () => {
    const board = await freshBoard('deps-assign')
    await board.create({ id: 'a', title: 'A' })
    await board.create({ id: 'b', title: 'B', blocked_by: ['a'] })
    const earlyAssign = await board.assign('b', 'agent-b').catch((cause: unknown) => cause)
    expect(isTaskboardError(earlyAssign, 'dependency-blocked')).toBe(true)

    await board.claim('a', 'agent-a')
    await board.complete('a')
    const assigned = await board.assign('b', 'agent-b')
    expect(assigned.owner).toBe('agent-b')
    expect(assigned.status).toBe('pending')

    // Rewiring in a new unfinished predecessor blocks the next claim again.
    await board.create({ id: 'c', title: 'C' })
    await board.setDependencies('b', ['c'], assigned.version)
    expect(board.get('b').blocked_by).toEqual(['c'])
    const rewired = await board.claim('b', 'agent-b').catch((cause: unknown) => cause)
    expect(isTaskboardError(rewired, 'dependency-blocked')).toBe(true)
  })

  it('failed rows requeue to pending and keep their dependency gate', async () => {
    const board = await freshBoard('deps-retry')
    await board.create({ id: 'a', title: 'A' })
    await board.create({ id: 'b', title: 'B', blocked_by: ['a'] })
    await board.claim('a', 'agent-a')
    await board.complete('a')
    await board.claim('b', 'agent-b')
    await board.fail('b', { detail: 'flaky' })
    const requeued = await board.requeue('b')
    expect(requeued).toMatchObject({ status: 'pending', owner: null })
    const retried = await board.claim('b', 'agent-c')
    expect(retried.owner).toBe('agent-c')
  })
})

/* ------------------------------------------------------------ arrival -- */

describe('taskboard arrival order', () => {
  it('keeps arrival order across a restart, which id order does not', async () => {
    const dir = join(scratch, 'arrival')
    const board = await openTaskboard(dir)
    // Ids chosen so id order and arrival order disagree: 'task-10' sorts before
    // 'task-9' as text, and 'b' before 'a'. A queue must not follow id order.
    for (const id of ['task-9', 'task-10', 'b', 'a']) await board.create({ id, title: id })
    expect(board.list().map((row) => row.id)).toEqual(['a', 'b', 'task-10', 'task-9'])
    expect(board.arrival().map((row) => row.id)).toEqual(['task-9', 'task-10', 'b', 'a'])
    expect(board.arrival().map((row) => row.seq)).toEqual([1, 2, 3, 4])

    // The store file is written sorted by id, so arrival order can only come
    // from the row itself — that is what makes it survive the reopen.
    const reopened = await openTaskboard(dir)
    expect(reopened.arrival().map((row) => row.id)).toEqual(['task-9', 'task-10', 'b', 'a'])

    // A later row takes the next arrival number, after everything already there,
    // even though its id sorts first.
    await reopened.create({ id: '0-late', title: 'late' })
    const third = await openTaskboard(dir)
    expect(third.arrival().map((row) => row.id)).toEqual(['task-9', 'task-10', 'b', 'a', '0-late'])
    expect(third.get('0-late').seq).toBe(5)
  })

  it('opens a store written without arrival numbers without reordering it, and appends new rows after', async () => {
    const dir = join(scratch, 'arrival-legacy')
    await mkdir(dir, { recursive: true })
    const stamp = '2026-11-23T00:00:00.000Z'
    const legacy = [
      { id: 'beta', title: 'B' },
      { id: 'alpha', title: 'A' },
    ].map(({ id, title }) => ({
      id,
      title,
      status: 'pending',
      owner: null,
      blocked_by: [],
      version: 1,
      createdAt: stamp,
      updatedAt: stamp,
      detail: null,
    }))
    const text = legacy
      .map((task) => JSON.stringify({ schema: TASKBOARD_SCHEMA, checksum: lineChecksum(task), task }))
      .join('\n')
    await writeFile(join(dir, 'store.jsonl'), `${text}\n`, 'utf8')

    const board = await openTaskboard(dir)
    // The upgrade keeps the only order such a store ever had: its file order.
    expect(board.arrival().map((row) => row.id)).toEqual(['beta', 'alpha'])

    await board.create({ id: 'gamma', title: 'C' })
    const reopened = await openTaskboard(dir)
    expect(reopened.arrival().map((row) => row.id)).toEqual(['beta', 'alpha', 'gamma'])
    expect(reopened.get('gamma').seq).toBe(3)
    expect(reopened.get('beta').seq).toBe(1)
  })
})

/* ------------------------------------------------------- crash recovery -- */

describe('taskboard crash recovery', () => {
  it('an interrupted write leaves the last committed store authoritative and its temp file inert', async () => {
    const dir = join(scratch, 'crash-tmp')
    const board = await openTaskboard(dir)
    await board.create({ id: 'kept', title: 'Kept' })
    await board.claim('kept', 'agent-a')

    // The crash window: the write landed in a hidden *.tmp and never reached the
    // rename, and a second temp file was torn mid-line. Neither may be read.
    await writeFile(join(dir, '.store.jsonl.999.deadbeef.tmp'), '{"schema":"grok-workflow.taskb', 'utf8')
    await writeFile(join(dir, '.store.jsonl.998.cafe.tmp'), '', 'utf8')

    const reopened = await openTaskboard(dir)
    expect(reopened.list().map((row) => row.id)).toEqual(['kept'])
    expect(reopened.get('kept')).toMatchObject({ status: 'in_progress', owner: 'agent-a', version: 2 })

    // The board is still writable, and the orphans stay inert across a third open.
    await reopened.complete('kept', 2)
    const third = await openTaskboard(dir)
    expect(third.get('kept').status).toBe('completed')
  })

  it('refuses a torn store instead of silently dropping the torn row', async () => {
    const dir = join(scratch, 'crash-torn')
    const board = await openTaskboard(dir)
    await board.create({ id: 'first', title: 'First' })
    await board.create({ id: 'second', title: 'Second' })
    const storePath = join(dir, 'store.jsonl')
    const raw = await readFile(storePath, 'utf8')
    // A non-atomic writer cut the file mid-line: the trailing row is incomplete.
    await writeFile(storePath, raw.slice(0, raw.length - 40), 'utf8')
    const error = await openTaskboard(dir).catch((cause: unknown) => cause)
    expect(isTaskboardError(error, 'integrity')).toBe(true)
  })

  it('recovers a real board after a writer process is SIGKILLed mid-mutation', async () => {
    const dir = join(scratch, 'crash-kill')
    const progress = join(scratch, 'crash-kill.log')
    const writer = spawnWriter(dir, 'loop', progress)
    try {
      await waitFor(async () => ((await progressLines(progress)) >= 2 ? true : undefined), 'two persisted rows')
    } finally {
      writer.child.kill('SIGKILL')
    }
    const signal = await writer.done
    expect(signal).toBe('SIGKILL')
    const persisted = await progressLines(progress)

    // A killed writer may have left the claim lock behind. A lock older than the
    // configured stale window is abandoned, not ownership: the board must open
    // and stay writable without manual cleanup.
    const board = await openTaskboard(dir, { lockStaleMs: 200, lockTimeoutMs: 5_000 })
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(board.size).toBeGreaterThanOrEqual(persisted)

    // Every recovered row is a complete, checksummed row (open validates each
    // one) and its status, owner and version still agree: the kill can land
    // between mutations, never inside one.
    for (const row of board.list()) {
      if (row.status === 'pending') {
        expect({ version: row.version, owner: row.owner }).toEqual({ version: 1, owner: null })
      } else if (row.status === 'in_progress') {
        expect(row.version).toBe(2)
        expect(row.owner).toMatch(/^worker-/)
      } else {
        expect(row.status).toBe('completed')
        expect(row.version).toBe(3)
        expect(row.owner).toMatch(/^worker-/)
      }
    }

    // The board accepts new work and the abandoned lock is gone.
    await board.create({ id: 'after-crash', title: 'After crash' })
    await board.claim('after-crash', 'agent-a')
    expect(await lockPresent(dir)).toBe(false)
    const reopened = await openTaskboard(dir)
    expect(reopened.get('after-crash')).toMatchObject({ status: 'in_progress', owner: 'agent-a' })
  })

  it('breaks a lock left by a process killed while holding it', async () => {
    const dir = join(scratch, 'crash-lock')
    const progress = join(scratch, 'crash-lock.log')
    const writer = spawnWriter(dir, 'hold-lock', progress)
    try {
      await waitFor(async () => ((await progressLines(progress)) >= 1 ? true : undefined), 'the held lock')
      expect(await lockPresent(dir)).toBe(true)
    } finally {
      writer.child.kill('SIGKILL')
    }
    expect(await writer.done).toBe('SIGKILL')
    // The lock survives the kill — that is exactly the abandoned state.
    expect(await lockPresent(dir)).toBe(true)

    const board = await openTaskboard(dir, { lockStaleMs: 150, lockTimeoutMs: 5_000 })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await board.create({ id: 'unlocked', title: 'Unlocked' })
    expect(await lockPresent(dir)).toBe(false)
    expect((await openTaskboard(dir)).get('unlocked').status).toBe('pending')
  })

  it('keeps a fresh lock respected and fails the mutation when the wait runs out', async () => {
    const dir = join(scratch, 'crash-lock-live')
    const board = await openTaskboard(dir, { lockStaleMs: 60_000, lockTimeoutMs: 40 })
    await mkdir(dir, { recursive: true })
    const lockPath = join(dir, '.store.jsonl.lock')
    const now = new Date()
    await writeFile(lockPath, '4242\n', 'utf8')
    await utimes(lockPath, now, now)

    const blocked = await board.create({ id: 'blocked', title: 'Blocked' }).catch((cause: unknown) => cause)
    expect(isTaskboardError(blocked, 'io')).toBe(true)
    expect((blocked as TaskboardError).message).toContain('held by another writer')

    await rm(lockPath, { force: true })
    await board.create({ id: 'unblocked', title: 'Unblocked' })
    expect(board.get('unblocked').status).toBe('pending')
  })

  it('keeps task ids unique across a restart', async () => {
    const dir = join(scratch, 'crash-dup')
    const first = await openTaskboard(dir)
    await first.create({ id: 'task-1', title: 'Original' })

    const second = await openTaskboard(dir)
    const error = await second.create({ id: 'task-1', title: 'Clone' }).catch((cause: unknown) => cause)
    expect(isTaskboardError(error, 'duplicate-id')).toBe(true)
    expect(second.get('task-1').title).toBe('Original')
  })

  it('guards a claim after restart with the version that is actually stored', async () => {
    const dir = join(scratch, 'crash-cas')
    const first = await openTaskboard(dir)
    await first.create({ id: 'task-1', title: 'Guarded' })
    await first.claim('task-1', 'agent-a', 1)
    await first.blockTask('task-1')

    const second = await openTaskboard(dir)
    // A caller that remembered version 1 (the create) must not win.
    const stale = await second.requeue('task-1', 1).catch((cause: unknown) => cause)
    expect(isTaskboardError(stale, 'version-conflict')).toBe(true)
    expect((stale as TaskboardError).expectedVersion).toBe(1)
    expect((stale as TaskboardError).actualVersion).toBe(3)
    await second.requeue('task-1', 3)
    expect(second.get('task-1')).toMatchObject({ status: 'pending', owner: null, version: 4 })
  })
})

/* ------------------------------------------------------------- location -- */

describe('taskboard location', () => {
  it('resolves explicit dir, then the env override, then $DSH_HOME/taskboards', () => {
    const savedOverride = process.env[TASKBOARD_DIR_ENV]
    const savedHome = process.env.DSH_HOME
    try {
      expect(taskboardDir({ dir: '/explicit/board' })).toBe('/explicit/board')
      process.env[TASKBOARD_DIR_ENV] = '/env/board'
      expect(taskboardDir()).toBe('/env/board')
      expect(taskboardDir({ dir: '/explicit/board' })).toBe('/explicit/board')
      delete process.env[TASKBOARD_DIR_ENV]
      process.env.DSH_HOME = '/dsh-home'
      expect(taskboardDir()).toBe(join('/dsh-home', 'taskboards', 'grok-workflow'))
      expect(taskboardFile()).toBe(join('/dsh-home', 'taskboards', 'grok-workflow', 'store.jsonl'))
    } finally {
      if (savedOverride === undefined) delete process.env[TASKBOARD_DIR_ENV]
      else process.env[TASKBOARD_DIR_ENV] = savedOverride
      if (savedHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = savedHome
    }
  })

  it('openDefaultTaskboard writes store.jsonl into the resolved directory', async () => {
    const dir = join(scratch, 'default-loc')
    const board = await openDefaultTaskboard({ dir })
    await board.create({ id: 't', title: 'T' })
    expect(existsSync(join(dir, 'store.jsonl'))).toBe(true)
    expect((await openTaskboard(dir)).get('t').title).toBe('T')
  })
})
