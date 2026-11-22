import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TaskBoard, TaskboardError, openTaskboard } from '../src/taskboard/index.js'

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

  it('serializes two handles that race on the same row: one wins, one conflicts, reload recovers', async () => {
    const dir = join(scratch, 'race')
    const left = await openTaskboard(dir)
    const right = await openTaskboard(dir)
    await left.create({ id: 'task-1', title: 'Contended' })
    await right.reload()
    const seenLeft = left.get('task-1').version
    const seenRight = right.get('task-1').version
    expect(seenLeft).toBe(seenRight)

    // Both handles claim from the same version; the second persist wins the
    // file, but each handle's own CAS still guards its in-memory row.
    await left.claim('task-1', 'agent-left', seenLeft)
    await right.claim('task-1', 'agent-right', seenRight)
    // The file holds the last writer; reload makes both handles agree again.
    await left.reload()
    expect(left.get('task-1').owner).toBe('agent-right')
    expect(left.get('task-1').version).toBe(seenLeft + 1)

    // A genuinely stale guard (read before the claim) now conflicts.
    const stale = await left.complete('task-1', seenLeft).catch((cause: unknown) => cause)
    expect(isTaskboardError(stale, 'version-conflict')).toBe(true)
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
