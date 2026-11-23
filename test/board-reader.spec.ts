/**
 * Round-56: TaskBoard → TaskReader read adapter (`src/dispatcher/board-reader.ts`).
 *
 * Two cases only: missing-id passthrough (undefined, other errors rethrown)
 * and the status mapping (in_progress→running, failed→blocked with reason).
 * All fixtures are fake (run-1/fail-1/ghost); the real `TaskBoard` store is
 * used, tmp dirs only.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boardReader } from '../src/dispatcher/dispatcher.js'
import { TaskBoard, TaskboardError, openTaskboard } from '../src/taskboard/index.js'

let scratch: string

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'board-reader-'))
})

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true })
})

describe('boardReader (TaskBoard → TaskReader)', () => {
  it('returns undefined for a missing id without throwing, but rethrows non-not-found errors', async () => {
    const board = await openTaskboard(join(scratch, 'missing'))
    await board.create({ id: 'run-1', title: 'Fake running seed' })
    const read = boardReader(board)
    expect(read.has('ghost')).toBe(false)
    expect(read.get('ghost')).toBeUndefined()

    const corrupt = {
      has: () => true,
      get: () => {
        throw new TaskboardError('integrity', 'fake corrupt store')
      },
    } as unknown as TaskBoard
    expect(() => boardReader(corrupt).get('run-1')).toThrowError(TaskboardError)
  })

  it('maps in_progress→running and failed→blocked with the detail as blockedReason', async () => {
    const board = await openTaskboard(join(scratch, 'mapping'))
    await board.create({ id: 'pend-1', title: 'Fake pending' })
    await board.create({ id: 'run-1', title: 'Fake running' })
    await board.claim('run-1', 'agent-x')
    await board.create({ id: 'fail-1', title: 'Fake failed' })
    await board.claim('fail-1', 'agent-y')
    await board.fail('fail-1', { detail: 'fake boom reason' })

    const read = boardReader(board)
    expect(read.get('pend-1')).toMatchObject({ id: 'pend-1', status: 'pending' })
    expect(read.get('pend-1')).not.toHaveProperty('owner')
    expect(read.get('run-1')).toMatchObject({ id: 'run-1', status: 'running', owner: 'agent-x' })
    expect(read.get('fail-1')).toMatchObject({
      id: 'fail-1',
      status: 'blocked',
      blockedReason: 'fake boom reason',
    })
    expect(read.get('fail-1')).not.toHaveProperty('verdict')
  })
})
