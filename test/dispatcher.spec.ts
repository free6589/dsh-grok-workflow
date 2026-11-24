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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  resultRecipient,
} from '../src/dispatcher/dispatcher.js'
import type { DispatcherTask, TaskReader } from '../src/dispatcher/dispatcher.js'
import { openTaskboard } from '../src/taskboard/index.js'

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
      owner: 'lead/agent-8',
    })
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.op).toBe('create')
    expect(decision.effect).toMatchObject({
      kind: 'insert',
      task: { id: 'task-1', title: 'Wire the board', status: 'pending', owner: 'lead/agent-8' },
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
      reader({ id: 'task-1', title: 'T', status: 'pending', owner: 'lead/agent-8' }),
      { op: 'reassign', id: 'task-1', owner: 'lead/agent-9' },
    )
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.effect).toMatchObject({
      kind: 'patch',
      id: 'task-1',
      patch: { owner: 'lead/agent-9' },
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
          ? { op, id: 'done-1', owner: 'lead/agent-9' }
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
          ? { op, id: 'run-1', owner: 'lead/agent-9' }
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
        owner: 'lead/agent-8',
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
        owner: 'lead/agent-9',
      })
      expect(reclaimed.ok).toBe(true)
      expect(second.get('task-1')).toMatchObject({ status: 'pending', owner: 'lead/agent-9' })
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

describe('dispatcher queue: arrival order survives a restart', () => {
  it('resume restores every pending task in arrival order, losing none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dispatcher-queue-'))
    try {
      const first = new DispatcherSession(dir)
      first.start()
      // Deliberately not alphabetical: a queue is ordered by arrival, not by id.
      for (const [id, title] of [
        ['beta', 'Second in the alphabet, first in the queue'],
        ['alpha', 'First in the alphabet, second in the queue'],
        ['gamma', 'Third in both'],
      ] as const) {
        expect((await handleDispatcherIntent(first, { op: 'create', id, title })).ok).toBe(true)
      }
      expect(first.pending().map(task => task.id)).toEqual(['beta', 'alpha', 'gamma'])
      await stopDispatcherSession(first)

      const second = new DispatcherSession(dir)
      const resumed = await resumeDispatcherBoard(second)
      expect(resumed.restored).toBe(true)
      expect(resumed.tasks).toBe(3)
      expect(resumed.pending).toBe(3)
      // The store file is written sorted by id, so this order can only come
      // from the row itself — it is the same order the first session left.
      expect(second.pending().map(task => task.id)).toEqual(['beta', 'alpha', 'gamma'])
      expect(second.list().map(task => task.id)).toEqual(['alpha', 'beta', 'gamma'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses to rewrite a corrupt store instead of guessing (fail closed)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dispatcher-corrupt-'))
    try {
      // A store that exists but is unreadable must never be replaced by an
      // empty one, and the session must stay inactive after the refusal.
      writeFileSync(join(dir, 'store.jsonl'), '{not json', 'utf8')
      const session = new DispatcherSession(dir)
      const error = await resumeDispatcherBoard(session).catch((cause: unknown) => cause)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(/store\.jsonl line 1/)
      expect(session.isActive).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('dispatcher addressing: full subagent path, results to the creator', () => {
  it('refuses a bare name and a malformed path, accepts a full path', () => {
    const board = reader({ id: 'task-1', title: 'T', status: 'pending', owner: 'lead/agent-8' })
    for (const owner of ['agent-9', 'lead/', '/agent-9', 'lead/agent 9', 'Lead/Agent-9', 'lead//agent-9']) {
      const decision = decideRawIntent(board, { op: 'reassign', id: 'task-1', owner })
      expect(decision.ok, owner).toBe(false)
      if (decision.ok) continue
      expect(decision.code).toBe('invalid:bad-address')
    }
    const accepted = decideRawIntent(board, { op: 'reassign', id: 'task-1', owner: 'lead/review/agent-9' })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.effect).toMatchObject({ patch: { owner: 'lead/review/agent-9' } })
  })

  it('records the creator and sends results to the creator, not the owner', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dispatcher-creator-'))
    try {
      const session = createDispatcherSession(dir)
      const created = await handleDispatcherRawIntent(session, {
        op: 'create',
        id: 'task-1',
        title: 'T',
        creator: 'lead',
        owner: 'lead/worker-1',
      })
      expect(created.ok).toBe(true)
      expect(session.get('task-1')).toMatchObject({ creator: 'lead', owner: 'lead/worker-1' })
      expect(resultRecipient(session.get('task-1') as DispatcherTask)).toBe('lead')

      // The result address must not follow reassignment: the owner executes,
      // the creator still receives.
      expect((await handleDispatcherRawIntent(session, {
        op: 'reassign',
        id: 'task-1',
        owner: 'lead/worker-2',
      })).ok).toBe(true)
      const after = session.get('task-1') as DispatcherTask
      expect(after.owner).toBe('lead/worker-2')
      expect(resultRecipient(after)).toBe('lead')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('clears the stale block reason when a blocked task is reassigned', async () => {
    const session = createDispatcherSession()
    expect((await handleDispatcherIntent(session, { op: 'create', id: 'task-1', title: 'T' })).ok).toBe(true)
    expect((await handleDispatcherRawIntent(session, {
      op: 'mark-blocked',
      id: 'task-1',
      reason: 'waiting',
    })).ok).toBe(true)
    expect(session.get('task-1')?.blockedReason).toBe('waiting')
    expect((await handleDispatcherRawIntent(session, {
      op: 'reassign',
      id: 'task-1',
      owner: 'lead/agent-9',
    })).ok).toBe(true)
    expect(session.get('task-1')).toMatchObject({ status: 'pending', owner: 'lead/agent-9' })
    expect(session.get('task-1')?.blockedReason).toBeUndefined()
  })
})

describe('dispatcher is bookkeeping only: no execution, no judgment', () => {
  it('refuses every execution or judgment operation a worker or verifier owns', () => {
    for (const op of ['claim', 'complete', 'fail', 'verify', 'run', 'execute', 'set-status', 'set-verdict']) {
      const decision = decideRawIntent(reader({ id: 'task-1', title: 'T', status: 'pending' }), { op, id: 'task-1' })
      expect(decision.ok, op).toBe(false)
      if (decision.ok) continue
      // set-verdict is the verdict ban; everything else is outside the whitelist.
      expect(['invalid:unknown-op', 'forbidden:verdict-immutable']).toContain(decision.code)
    }
  })

  it('changes nothing when it refuses a completed task or a verdict write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dispatcher-refusal-'))
    try {
      // A completed row cannot be produced through the dispatcher (it may not
      // execute), so the board is driven directly and the session only reads it.
      const board = await openTaskboard(dir)
      await board.create({ id: 'done-1', title: 'Done' })
      await board.claim('done-1', 'lead/agent-8')
      await board.complete('done-1')

      const session = new DispatcherSession(dir)
      expect((await resumeDispatcherBoard(session)).tasks).toBe(1)
      const before = JSON.stringify(session.list())

      const edited = await handleDispatcherRawIntent(session, { op: 'update-pending', id: 'done-1', title: 'Rewrite' })
      expect(edited.ok).toBe(false)
      if (!edited.ok) expect(edited.code).toBe('forbidden:completed-immutable')

      const verdict = await handleDispatcherRawIntent(session, { op: 'update-pending', id: 'done-1', verdict: 'pass' })
      expect(verdict.ok).toBe(false)
      if (!verdict.ok) expect(verdict.code).toBe('forbidden:verdict-immutable')

      expect(JSON.stringify(session.list())).toBe(before)
      expect(session.get('done-1')?.verdict).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('never writes a verdict when recording or reassigning a task', async () => {
    const session = createDispatcherSession()
    expect((await handleDispatcherRawIntent(session, { op: 'create', id: 'task-1', title: 'T' })).ok).toBe(true)
    expect((await handleDispatcherRawIntent(session, {
      op: 'reassign',
      id: 'task-1',
      owner: 'lead/agent-9',
    })).ok).toBe(true)
    expect(session.get('task-1')?.verdict).toBeUndefined()
    expect(session.list().every(task => task.verdict === undefined)).toBe(true)
  })
})
