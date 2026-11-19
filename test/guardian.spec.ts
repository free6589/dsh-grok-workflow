/**
 * Resident parallel guardian: state machine, stall handling, unload cleanup.
 *
 * What this pins (and what it deliberately does not):
 * - The guardian is parallel supervision, not the serial `supervisor` role:
 *   it starts observing before the run exists, judges liveness (never
 *   quality), and acts only by cancelling the run once — it never calls
 *   `agent()`, so it costs zero model calls and adds no agent role.
 * - Stuck = timeout or heartbeat-loss: one open child older than its budget
 *   fires, the run is cancelled at most once, and the finding lands in the
 *   terminal report as a `Guardian` error (evidence, not a verdict).
 * - Unload leaves nothing behind: `dispose()`/`finish()` disarm the timer,
 *   `unloadRunGuardians(state)` disposes every live guardian of one instance.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  GUARDIAN_LIMITS,
  createRunGuardian,
  guardianChildBudgetMs,
  registeredRunGuardians,
  unloadRunGuardians,
} from '../src/guardian.js'
import { createActiveState } from '../src/run.js'
import { resolveConfig } from '../src/config.js'
import { runWorkflow } from '../src/run.js'
import { Session } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'

function info(id: string) {
  return { id }
}

function start(seq: number, label = `child-${seq}`) {
  return { seq, label, childId: `child-${seq}` }
}

function end(seq: number, outcome = 'completed') {
  return { seq, outcome }
}

function manualClock(startAt = 1_000_000) {
  let now = startAt
  return {
    now: () => now,
    advance: (ms: number) => { now += ms },
  }
}

describe('guardian child budget', () => {
  it('derives one child budget from the run deadline, capped and floored', () => {
    expect(guardianChildBudgetMs(3_600_000)).toBe(GUARDIAN_LIMITS.childTimeoutCapMs)
    expect(guardianChildBudgetMs(60_000)).toBe(60_000)
    expect(guardianChildBudgetMs(0)).toBe(0)
    expect(guardianChildBudgetMs(-1)).toBe(0)
    // Below the floor the timer would be noise, not signal: disarmed.
    expect(guardianChildBudgetMs(1_000)).toBe(0)
    expect(guardianChildBudgetMs(GUARDIAN_LIMITS.childTimeoutFloorMs)).toBe(GUARDIAN_LIMITS.childTimeoutFloorMs)
  })
})

describe('resident guardian state machine', () => {
  it('starts with the run and stays parallel: a settling child never fires', () => {
    const clock = manualClock()
    const guardian = createRunGuardian({ runId: 'run-1', childBudgetMs: 10_000, now: clock.now })
    // Created before the engine hands back a run: observing already works.
    guardian.agentStart(info('run-1'), start(1, 'worker'))
    // Adopt binds the live run and replays the buffered row — the guardian
    // was resident from the start, not a serial stage after the child.
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    expect(guardian.stats.children).toBe(1)
    expect(guardian.stats.open).toBe(1)
    clock.advance(2_000)
    guardian.agentEnd(info('run-1'), end(1))
    clock.advance(60_000)
    const settlement = guardian.finish('completed')
    expect(settlement.findings).toEqual([])
    expect(settlement.cancelled).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('ignores foreign runs and duplicate settlements, like the progress recorder', () => {
    const clock = manualClock()
    const guardian = createRunGuardian({ runId: 'run-1', childBudgetMs: 10_000, now: clock.now })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-other'), start(7, 'foreign'))
    guardian.agentStart(info('run-1'), start(1, 'worker'))
    guardian.agentStart(info('run-1'), start(1, 'worker'))
    guardian.agentEnd(info('run-1'), end(1))
    guardian.agentEnd(info('run-1'), end(1))
    expect(guardian.stats.children).toBe(1)
    expect(guardian.stats.settled).toBe(1)
    clock.advance(120_000)
    const settlement = guardian.finish('completed')
    expect(settlement.findings).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
  })

  it('an end before its start still settles the row once the start arrives', () => {
    const guardian = createRunGuardian({ runId: 'run-1', childBudgetMs: 10_000 })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentEnd(info('run-1'), end(3))
    guardian.agentStart(info('run-1'), start(3, 'late'))
    const stats = guardian.stats
    expect(stats.children).toBe(1)
    expect(stats.settled).toBe(1)
    const settlement = guardian.finish('completed')
    expect(settlement.findings).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('stuck-child handling', () => {
  it('discovers a hung child and cancels the run once, with a bounded finding', () => {
    const clock = manualClock()
    const warnings: string[] = []
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      logger: { warn: (message: string) => { warnings.push(message) } },
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), start(1, 'stuck worker'))
    clock.advance(9_999)
    expect(guardian.check().length).toBe(0)
    clock.advance(1)
    const findings = guardian.check()
    expect(findings.length).toBe(1)
    expect(findings[0]?.seq).toBe(1)
    expect(findings[0]?.label).toBe('stuck worker')
    expect(findings[0]?.action).toBe('cancel-run')
    expect(findings[0]?.reason).toContain('within 10000 ms')
    expect(cancel).toHaveBeenCalledTimes(1)
    // A second sweep appends no second finding and cancels no second time:
    // the bound is structural (at most one cancel per run).
    clock.advance(120_000)
    expect(guardian.check().length).toBe(1)
    expect(cancel).toHaveBeenCalledTimes(1)
    const settlement = guardian.finish('cancelled')
    expect(settlement.cancelled).toBe(true)
    expect(settlement.cancelReason).toContain('stuck worker')
    expect(warnings).toEqual([])
  })

  it('a heartbeat-loss names the run-wide silence, a lone stall names timeout', () => {
    const clock = manualClock()
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    // Staggered starts: the first child is older than the budget while the
    // second is still fresh — a lone stall, not a silent run.
    guardian.agentStart(info('run-1'), start(1, 'first'))
    clock.advance(5_000)
    guardian.agentStart(info('run-1'), start(2, 'second'))
    clock.advance(9_000)
    const findings = guardian.check()
    expect(findings.length).toBe(1)
    // The first child starved while the run still showed life: a timeout.
    expect(findings[0]?.seq).toBe(1)
    expect(findings[0]?.signal).toBe('timeout')
    expect(cancel).toHaveBeenCalledTimes(1)
    // Let the run itself go silent: the second child then fires as a
    // heartbeat-loss, still without a second cancel.
    clock.advance(2_000)
    const later = guardian.check()
    expect(later.length).toBe(2)
    expect(later[1]?.seq).toBe(2)
    expect(later[1]?.signal).toBe('heartbeat-loss')
    expect(cancel).toHaveBeenCalledTimes(1)
    guardian.finish('cancelled')
  })

  it('an unlimited run deadline disarms the guardian instead of second-guessing it', () => {
    const clock = manualClock()
    const guardian = createRunGuardian({ runId: 'run-1', childBudgetMs: guardianChildBudgetMs(0), now: clock.now })
    expect(guardian.stats.armed).toBe(false)
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), start(1, 'worker'))
    clock.advance(3_600_000)
    expect(guardian.check()).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('completed')
  })

  it('a cancel that throws is contained as a warning, never as a failed run', () => {
    const clock = manualClock()
    const warnings: string[] = []
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 5_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      logger: { warn: (message: string) => { warnings.push(message) } },
    })
    guardian.adopt({
      id: 'run-1',
      cancel: () => { throw new Error('engine gone') },
    })
    guardian.agentStart(info('run-1'), start(1, 'worker'))
    clock.advance(6_000)
    const findings = guardian.check()
    expect(findings.length).toBe(1)
    expect(warnings.some(message => message.includes('could not cancel run run-1'))).toBe(true)
    guardian.finish('cancelled')
  })
})

describe('guardian unload cleanup', () => {
  it('runWorkflow wires a resident guardian next to progress and archiver', async () => {
    // Parallel existence, through the real run path: the guardian subscribes
    // alongside progress/archiver before the run exists, so its three
    // listeners are present when the engine hands the run back. The run then
    // settles on its own (one completed child, no hang) so this case asserts
    // wiring — not a real wait for the 6 s deadline.
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    const on = (name: string, fn: (...args: unknown[]) => void): (() => void) => {
      const rows = listeners.get(name) ?? []
      rows.push(fn)
      listeners.set(name, rows)
      return () => {
        listeners.set(name, (listeners.get(name) ?? []).filter(entry => entry !== fn))
      }
    }
    const emit = (name: string, ...args: unknown[]): void => {
      for (const fn of listeners.get(name) ?? []) fn(...args)
    }
    let startListenerPeak = 0
    let endListenerPeak = 0
    const cancels: string[] = []
    const engine = {
      async start(request: WorkflowStartRequest): Promise<{ id: string, meta: WorkflowStartRequest['meta'], result: Promise<{ value: unknown, stopReason: string, agentsStarted: number }>, cancel: (reason?: string) => void, dispose: () => Promise<void> }> {
        let resolve!: (value: { value: unknown, stopReason: string, agentsStarted: number }) => void
        const result = new Promise<{ value: unknown, stopReason: string, agentsStarted: number }>(accept => { resolve = accept })
        // Settle on the next microtask: one child that starts and ends cleanly,
        // so the run completes without the guardian ever firing.
        queueMicrotask(() => {
          startListenerPeak = (listeners.get('workflow/agent-start') ?? []).length
          endListenerPeak = (listeners.get('workflow/agent-end') ?? []).length
          emit('workflow/agent-start', { id: 'run-parallel-1' }, { seq: 1, label: 'quick worker', childId: 'child-1' })
          emit('workflow/agent-end', { id: 'run-parallel-1' }, { seq: 1, outcome: 'completed' })
          resolve({ value: null, stopReason: 'completed', agentsStarted: 1 })
        })
        return {
          id: 'run-parallel-1',
          meta: request.meta,
          result,
          cancel: (reason?: string) => { cancels.push(reason ?? '') },
          dispose: async () => {},
        }
      },
    }
    const ctx = { workflowEngine: engine, logger: () => ({ warn: () => {} }), on } as never
    const state = createActiveState()
    const agent = { session: Session.create('sess-guardian-parallel' as SessionId) } as never
    const pending = runWorkflow({
      ctx,
      config: resolveConfig({ timeoutMs: 6_000 }),
      state,
      logger: { warn: () => {} },
      agent,
      objective: 'parallel supervision exists',
      failureMode: 'report',
    })
    const outcome = await pending
    // Parallel existence is proven by the subscription snapshot taken while
    // the run was live (below): all three observers — progress, archiver,
    // guardian — held agent-start/agent-end listeners on the same bus.
    expect(startListenerPeak).toBeGreaterThanOrEqual(3)
    expect(endListenerPeak).toBeGreaterThanOrEqual(3)
    // Listeners are released in the run's finally: by the time the run
    // settles the subscriptions are gone — which is itself the residue check.
    expect(outcome.report).toBeDefined()
    // A clean child means no firing, no cancel, and no residue afterwards.
    expect(cancels).toEqual([])
    expect(registeredRunGuardians(state)).toBe(0)
    expect(listeners.get('workflow/agent-start') ?? []).toEqual([])
    expect(listeners.get('workflow/agent-end') ?? []).toEqual([])
  })

  it('dispose clears the timer and leaves no residue behind', () => {
    let cleared = 0
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      schedule: () => ({ unref() {} }) as unknown,
      cancelSchedule: () => { cleared += 1 },
    })
    guardian.adopt({ id: 'run-1', cancel: () => {} })
    expect(guardian.stats.timerArmed).toBe(true)
    guardian.agentStart(info('run-1'), start(1, 'worker'))
    guardian.dispose()
    const stats = guardian.stats
    expect(stats.disposed).toBe(true)
    expect(stats.timerArmed).toBe(false)
    expect(cleared).toBe(1)
    // Events after disposal are ignored, never buffered.
    guardian.agentStart(info('run-1'), start(2, 'late'))
    expect(guardian.stats.children).toBe(1)
  })

  it('unloadRunGuardians disposes every live guardian of one instance', () => {
    const state = {}
    const first = createRunGuardian({ runId: 'run-1', childBudgetMs: 10_000, state })
    const second = createRunGuardian({ runId: 'run-2', childBudgetMs: 10_000, state })
    // Adopting joins the instance registry; a guardian that never saw a run
    // joins nothing, so an idle instance holds no supervision.
    expect(registeredRunGuardians(state)).toBe(0)
    const other = createRunGuardian({ runId: 'run-9', childBudgetMs: 10_000 })
    expect(registeredRunGuardians({})).toBe(0)
    void other
    first.adopt({ id: 'run-1', cancel: () => {} })
    second.adopt({ id: 'run-2', cancel: () => {} })
    expect(registeredRunGuardians(state)).toBe(2)
    expect(unloadRunGuardians(state)).toBe(2)
    expect(registeredRunGuardians(state)).toBe(0)
    expect(first.stats.disposed).toBe(true)
    expect(second.stats.disposed).toBe(true)
    // Second unload is a no-op, not a double dispose.
    expect(unloadRunGuardians(state)).toBe(0)
  })

  it('finish releases the registry entry so a settled run holds no guardian', () => {
    const state = {}
    const guardian = createRunGuardian({ runId: 'run-1', childBudgetMs: 10_000, state })
    guardian.adopt({ id: 'run-1', cancel: () => {} })
    expect(registeredRunGuardians(state)).toBe(1)
    guardian.finish('completed')
    expect(registeredRunGuardians(state)).toBe(0)
  })
})
