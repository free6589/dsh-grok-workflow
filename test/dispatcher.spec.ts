/**
 * L1 dispatcher: whitelist, prohibitions, and session lifecycle.
 *
 * The dispatcher is a pure decision layer the gate can call: it records,
 * dispatches and reclaims tasks, never executes or judges them. Task-8's
 * store (`src/taskboard/`) satisfies the `TaskReader` surface (`get`/`has`
 * by id), so the policy functions below plug straight into it; the bundled
 * `DispatcherSession` is the self-contained board until task-8 lands.
 *
 * - Four whitelisted operations pass: create, update-pending, reassign,
 *   mark-blocked.
 * - Three prohibitions are refused with explicit errors: editing completed
 *   tasks, editing running tasks, writing the verifier's verdict.
 * - Start/stop/resume: `start()` opens empty, `stop()` persists and
 *   deactivates, `resume()` reloads the persisted board.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createDispatcherSession,
  DispatcherSession,
  handleDispatcherIntent,
  handleDispatcherRawIntent,
  resumeDispatcherBoard,
  stopDispatcherSession,
  decideRawIntent,
} from '../src/dispatcher/dispatcher.js'
import type { DispatcherTask, TaskReader } from '../src/dispatcher/dispatcher.js'

function readerOf(tasks: DispatcherTask[]): TaskReader {
  const byId = new Map(tasks.map(task => [task.id, task]))
  return {
    get: (id: string) => byId.get(id),
    has: (id: string) => byId.has(id),
  }
}

const reader = (...tasks: DispatcherTask[]): TaskReader => readerOf(tasks)

describe('dispatcher whitelist (four allowed operations)', () => {
  it('create inserts a pending task', () => {
    const decision = decideRawIntent(reader(), {
      op: 'create',
      id: 'task-1',
      title: 'Wire the board',
      owner: 'agent-8',
    })
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.op).toBe('create')
    expect(decision.effect).toMatchObject({
      kind: 'insert',
      task: { id: 'task-1', title: 'Wire the board', status: 'pending', owner: 'agent-8' },
    })
  })

  it('update-pending edits a task that has not started', () => {
    const decision = decideRawIntent(
      reader({ id: 'task-1', title: 'Old title', status: 'pending' }),
      { op: 'update-pending', id: 'task-1', title: 'New title' },
    )
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.effect).toMatchObject({
      kind: 'patch',
      id: 'task-1',
      patch: { title: 'New title' },
    })
  })

  it('reassign hands a pending task to another owner', () => {
    const decision = decideRawIntent(
      reader({ id: 'task-1', title: 'T', status: 'pending', owner: 'agent-8' }),
      { op: 'reassign', id: 'task-1', owner: 'agent-9' },
    )
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.effect).toMatchObject({
      kind: 'patch',
      id: 'task-1',
      patch: { owner: 'agent-9' },
    })
  })

  it('mark-blocked flags a pending task with a reason', () => {
    const decision = decideRawIntent(
      reader({ id: 'task-1', title: 'T', status: 'pending' }),
      { op: 'mark-blocked', id: 'task-1', reason: 'waiting on task-8 store' },
    )
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.effect).toMatchObject({
      kind: 'patch',
      id: 'task-1',
      patch: { status: 'blocked', blockedReason: 'waiting on task-8 store' },
    })
  })
})

describe('dispatcher prohibitions (three hard refusals)', () => {
  it('refuses to modify a completed task', () => {
    for (const op of ['update-pending', 'reassign', 'mark-blocked'] as const) {
      const payload: Record<string, unknown> =
        op === 'reassign'
          ? { op, id: 'done-1', owner: 'agent-9' }
          : op === 'mark-blocked'
            ? { op, id: 'done-1', reason: 'late reason' }
            : { op, id: 'done-1', title: 'rewrite history' }
      const decision = decideRawIntent(
        reader({ id: 'done-1', title: 'Done', status: 'completed' }),
        payload,
      )
      expect(decision.ok).toBe(false)
      if (decision.ok) continue
      expect(decision.code).toBe('forbidden:completed-immutable')
      expect(decision.message).not.toBe('')
    }
  })

  it('refuses to modify a running task', () => {
    for (const op of ['update-pending', 'reassign', 'mark-blocked'] as const) {
      const payload: Record<string, unknown> =
        op === 'reassign'
          ? { op, id: 'run-1', owner: 'agent-9' }
          : op === 'mark-blocked'
            ? { op, id: 'run-1', reason: 'late reason' }
            : { op, id: 'run-1', title: 'mid-run edit' }
      const decision = decideRawIntent(
        reader({ id: 'run-1', title: 'Running', status: 'running' }),
        payload,
      )
      expect(decision.ok).toBe(false)
      if (decision.ok) continue
      expect(decision.code).toBe('forbidden:running-immutable')
      expect(decision.message).not.toBe('')
    }
  })

  it('refuses any write to the verifier verdict', () => {
    const board = reader({ id: 'task-1', title: 'T', status: 'pending' })
    const attempts: Record<string, unknown>[] = [
      { op: 'set-verdict', id: 'task-1', verdict: 'pass' },
      { op: 'verdict', id: 'task-1', verdict: 'fail' },
      { op: 'update-pending', id: 'task-1', title: 'T2', patch: { verdict: 'pass' } },
      { op: 'update-pending', id: 'task-1', title: 'T2', verdict: 'pass' },
    ]
    for (const raw of attempts) {
      const decision = decideRawIntent(board, raw)
      expect(decision.ok).toBe(false)
      if (decision.ok) continue
      expect(decision.code).toBe('forbidden:verdict-immutable')
      expect(decision.message).not.toBe('')
    }
  })

  it('refuses unknown operations outside the whitelist', () => {
    const decision = decideRawIntent(reader(), { op: 'execute', id: 'task-1' })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.code).toBe('invalid:unknown-op')
  })
})

describe('dispatcher session lifecycle', () => {
  it('start/stop deactivates the session and refuses new intents', async () => {
    const session = createDispatcherSession()
    expect(session.isActive).toBe(true)
    expect((await handleDispatcherIntent(session, {
      op: 'create',
      id: 'task-1',
      title: 'First',
    })).ok).toBe(true)
    await stopDispatcherSession(session)
    expect(session.isActive).toBe(false)
    const refused = await handleDispatcherIntent(session, {
      op: 'create',
      id: 'task-2',
      title: 'Second',
    })
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.code).toBe('invalid:session-inactive')
  })

  it('resume restores the persisted board from disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dispatcher-resume-'))
    try {
      const first = new DispatcherSession(dir)
      first.start()
      expect((await handleDispatcherIntent(first, {
        op: 'create',
        id: 'task-1',
        title: 'Persisted',
        owner: 'agent-8',
      })).ok).toBe(true)
      expect((await handleDispatcherRawIntent(first, {
        op: 'mark-blocked',
        id: 'task-1',
        reason: 'waiting on store',
      })).ok).toBe(true)
      await stopDispatcherSession(first)

      const second = new DispatcherSession(dir)
      const resumed = await resumeDispatcherBoard(second)
      expect(resumed.restored).toBe(true)
      expect(resumed.tasks).toBe(1)
      expect(second.isActive).toBe(true)
      expect(second.get('task-1')).toMatchObject({ status: 'blocked' })

      // The restored board still enforces the policy: reclaim via reassign.
      const reclaimed = await handleDispatcherRawIntent(second, {
        op: 'reassign',
        id: 'task-1',
        owner: 'agent-9',
      })
      expect(reclaimed.ok).toBe(true)
      expect(second.get('task-1')).toMatchObject({ status: 'pending', owner: 'agent-9' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resume on a fresh directory starts empty without pretending to restore', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dispatcher-fresh-'))
    try {
      const session = new DispatcherSession(dir)
      const resumed = await resumeDispatcherBoard(session)
      expect(resumed.restored).toBe(false)
      expect(resumed.tasks).toBe(0)
      expect(session.isActive).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
