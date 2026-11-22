/**
 * Resident parallel guardian: state machine, stall handling, unload cleanup.
 *
 * What this pins (and what it deliberately does not):
 * - The guardian is parallel supervision, not the serial `supervisor` role:
 *   it starts observing before the run exists, judges liveness (never
 *   quality), and nudges a stalled child without cancelling the parent — it never calls
 *   `agent()`, so it costs zero model calls and adds no agent role.
 * - Stuck = timeout or heartbeat-loss: one open child older than its budget
 *   receives one rescue nudge (or an observation if rescue is unavailable);
 *   the parent run is never cancelled by liveness detection.
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
import { runWorkflow, writesPathsForPhase } from '../src/run.js'
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
  it('discovers a hung child and records a non-destructive rescue/observation finding', () => {
    const clock = manualClock()
    const warnings: string[] = []
    const recorded: Array<{ seq: number, action: string }> = []
    const rescued: Array<{ childId: string, guidance: string }> = []
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      logger: { warn: (message: string) => { warnings.push(message) } },
      rescue: (childId, guidance) => { rescued.push({ childId, guidance }) },
      onFinding: finding => { recorded.push(finding) },
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
    expect(findings[0]?.action).toBe('rescue')
    expect(recorded).toHaveLength(1)
    expect(rescued).toHaveLength(1)
    expect(rescued[0]?.childId).toBe('child-1')
    expect(rescued[0]?.guidance).toContain('Do not terminate the workflow')
    expect(recorded[0]).toMatchObject({
      seq: 1,
      label: 'stuck worker',
      signal: 'heartbeat-loss',
      action: 'rescue',
      reason: expect.stringContaining('within 10000 ms'),
      atMs: expect.any(Number),
    })
    expect(findings[0]?.reason).toContain('within 10000 ms')
    expect(cancel).not.toHaveBeenCalled()
    // A second sweep does not interrupt or cancel the still-running workflow.
    clock.advance(120_000)
    expect(guardian.check().length).toBe(1)
    expect(cancel).not.toHaveBeenCalled()
    const settlement = guardian.finish('cancelled')
    expect(settlement.cancelled).toBe(false)
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
    expect(cancel).not.toHaveBeenCalled()
    // Let the run itself go silent: the second child then fires as a
    // heartbeat-loss, still without a second cancel.
    clock.advance(2_000)
    const later = guardian.check()
    expect(later.length).toBe(2)
    expect(later[1]?.seq).toBe(2)
    expect(later[1]?.signal).toBe('heartbeat-loss')
    expect(cancel).not.toHaveBeenCalled()
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

  it('never invokes the run cancel handle when a child stalls', () => {
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
    expect(warnings).toEqual([])
    guardian.finish('cancelled')
  })
})

describe('rescue: interrupt and steer instead of killing', () => {  it('a rescue log line interrupts the child and delivers the guidance', () => {
    const clock = manualClock()
    const rescued: Array<{ childId: string, guidance: string }> = []
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      rescue: (childId: string, guidance: string) => { rescued.push({ childId, guidance }) },
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), start(3, 'lost worker'))
    clock.advance(11_000)
    guardian.noteRescue(info('run-1'), 'guardian rescue seq=3 label=lost worker guidance=stop waiting, continue with what you have')
    // The child is steered with a queued message, not interrupted or killed.
    expect(rescued).toEqual([{ childId: 'child-3', guidance: 'stop waiting, continue with what you have' }])
    expect(cancel).not.toHaveBeenCalled()
    const findings = guardian.check()
    const rescue = findings.find(finding => finding?.action === 'rescue')
    expect(rescue?.seq).toBe(3)
    expect(rescue?.reason).toContain('stop waiting')
    guardian.finish('completed')
  })

  it('a rescue for an unknown or settled child is a contained no-op', () => {
    const clock = manualClock()
    const rescued: string[] = []
    const warnings: string[] = []
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      logger: { warn: (message: string) => { warnings.push(message) } },
      rescue: (childId: string) => { rescued.push(childId) },
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), start(1, 'worker'))
    guardian.noteRescue(info('run-1'), 'guardian rescue seq=9 label=ghost guidance=go on')
    guardian.agentEnd(info('run-1'), end(1))
    guardian.noteRescue(info('run-1'), 'guardian rescue seq=1 label=done guidance=go on')
    guardian.noteRescue(info('run-1'), 'not a rescue line')
    expect(rescued).toEqual([])
    expect(warnings).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('completed')
  })

  it('a throwing rescue executor is contained as a warning', () => {
    const clock = manualClock()
    const warnings: string[] = []
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      logger: { warn: (message: string) => { warnings.push(message) } },
      rescue: () => { throw new Error('seam down') },
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), start(2, 'worker'))
    guardian.noteRescue(info('run-1'), 'guardian rescue seq=2 label=worker guidance=keep going')
    expect(cancel).not.toHaveBeenCalled()
    expect(warnings.some(message => message.includes('rescue failed'))).toBe(true)
    guardian.finish('completed')
  })
})

describe('session heartbeat: a child with a fresh turn is alive', () => {
  it('a fresh child-session turn keeps its child alive past budget', () => {
    const clock = manualClock()
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      // The child's own session says its turn moved 1.5s ago: only the
      // timestamp is read, never the content.
      sessionHeartbeat: () => ({ atMs: clock.now() - 1_500 }),
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), start(1, 'talking worker'))
    clock.advance(11_000)
    expect(guardian.check()).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('completed')
  })

  it('a stale child-session turn degrades to the old behaviour (fires)', () => {
    const clock = manualClock()
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      sessionHeartbeat: () => ({ atMs: clock.now() - 30_000 }),
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), start(1, 'silent worker'))
    clock.advance(11_000)
    expect(guardian.check().length).toBe(1)
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('cancelled')
  })

  it('an unreadable session degrades to the old behaviour (fires)', () => {
    const clock = manualClock()
    let calls = 0
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      sessionHeartbeat: () => { calls += 1; return undefined },
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), start(1, 'gone worker'))
    clock.advance(11_000)
    expect(guardian.check().length).toBe(1)
    expect(calls).toBeGreaterThan(0)
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('cancelled')
  })
})

describe('liveness signals: a child that shows life must not fire', () => {
  it('a run-level phase/log event refreshes run liveness, downgrading heartbeat-loss', () => {
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
    guardian.agentStart(info('run-1'), start(1, 'slow worker'))
    guardian.agentStart(info('run-1'), start(2, 'other worker'))
    clock.advance(11_000)
    // The run itself narrated a phase 1s ago: the run is alive, so both
    // quiet children fire as their own lone stalls (timeout) — neither
    // may claim the run went silent (heartbeat-loss).
    guardian.runHeartbeat(info('run-1'), clock.now() - 1_000)
    const findings = guardian.check()
    expect(findings.length).toBe(2)
    expect(findings.every(finding => finding?.signal === 'timeout')).toBe(true)
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('cancelled')
  })

  it('a declared write path with a fresh mtime keeps its child alive past budget', () => {
    const clock = manualClock()
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      // Absolute epoch ms, like a stat mtime: the declared file moved 1.5s ago.
      fileHeartbeat: () => ({ path: 'docs/evidence.md', atMs: clock.now() - 1_500 }),
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), { ...start(1, 'writing worker'), writesPaths: ['docs/evidence.md'] })
    clock.advance(11_000)
    // The child's declared file moved 1.5s ago: it is writing, not wedged.
    expect(guardian.check()).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('completed')
  })

  it('an unreadable file heartbeat degrades to the old behaviour (fires)', () => {
    const clock = manualClock()
    let calls = 0
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      fileHeartbeat: () => { calls += 1; throw new Error('EPERM') },
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), { ...start(1, 'worker'), writesPaths: ['x.md'] })
    clock.advance(11_000)
    expect(guardian.check().length).toBe(1)
    expect(calls).toBeGreaterThan(0)
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('cancelled')
  })

  it('rebuilds declared paths from the phase header when the event carries none', () => {
    const clock = manualClock()
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      // The engine forwards only {seq,label,phase,childId}: the host maps
      // phase `任务 2 · …` back to the caller plan's second task.
      writesPathsForPhase: (phase: string) => phase.includes('任务 2') ? ['docs/evidence.md'] : [],
      fileHeartbeat: () => ({ path: 'docs/evidence.md', atMs: clock.now() - 1_500 }),
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    // No writesPaths on the event itself — the host leg must supply them.
    guardian.agentStart(info('run-1'), { seq: 2, label: '执行', phase: '任务 2 · 进度任务带', childId: 'child-2' })
    clock.advance(11_000)
    expect(guardian.check()).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('completed')
  })

  it('a phase the plan does not know keeps the old budget-only rule', () => {
    const clock = manualClock()
    let lookups = 0
    const guardian = createRunGuardian({
      runId: 'run-1',
      childBudgetMs: 10_000,
      now: clock.now,
      schedule: () => ({}) as unknown,
      cancelSchedule: () => {},
      writesPathsForPhase: () => { lookups += 1; return [] },
      fileHeartbeat: () => ({ path: 'x.md', atMs: clock.now() - 1_000 }),
    })
    const cancel = vi.fn()
    guardian.adopt({ id: 'run-1', cancel })
    guardian.agentStart(info('run-1'), { seq: 3, label: '执行', phase: '任务 9 · 不存在的任务', childId: 'child-3' })
    clock.advance(11_000)
    expect(lookups).toBeGreaterThan(0)
    expect(guardian.check().length).toBe(1)
    expect(cancel).not.toHaveBeenCalled()
    guardian.finish('cancelled')
  })
})

describe('writesPathsForPhase: phase header back to caller plan', () => {
  const plan = (paths: string[] | null) => [{
    id: 't1',
    title: 'alpha',
    objective: 'o',
    expectedOutput: 'e',
    acceptanceCriteria: ['a'],
    context: '',
    constraints: [],
    writesPaths: paths,
  }, {
    id: 't2',
    title: 'beta',
    objective: 'o',
    expectedOutput: 'e',
    acceptanceCriteria: ['a'],
    context: '',
    constraints: [],
    writesPaths: ['docs/b.md'],
  }]

  it('maps 任务 n and Task n to the nth plan task', () => {
    expect(writesPathsForPhase(plan(['docs/a.md']), '任务 1 · alpha')).toEqual(['docs/a.md'])
    expect(writesPathsForPhase(plan(['docs/a.md']), 'Task 1 · alpha')).toEqual(['docs/a.md'])
    expect(writesPathsForPhase(plan(['docs/a.md']), '任务 2 · beta')).toEqual(['docs/b.md'])
  })

  it('yields nothing for unknown phases and planner-built plans', () => {
    expect(writesPathsForPhase(plan(['docs/a.md']), '任务 9 · 不存在的任务')).toEqual([])
    expect(writesPathsForPhase(plan(['docs/a.md']), '汇总')).toEqual([])
    expect(writesPathsForPhase(plan(null), '任务 1 · alpha')).toEqual([])
    expect(writesPathsForPhase(null, '任务 1 · alpha')).toEqual([])
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

  it('the run subscribes phase/log heartbeats alongside the guardian pair', async () => {
    // B1 wiring: the host must hear the script's narration, or runHeartbeat
    // never fires and every quiet child reads as a silent run.
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    const on = (name: string, fn: (...args: unknown[]) => void): (() => void) => {
      const rows = listeners.get(name) ?? []
      rows.push(fn)
      listeners.set(name, rows)
      return () => {
        listeners.set(name, (listeners.get(name) ?? []).filter(entry => entry !== fn))
      }
    }
    let peaks: Record<string, number> = {}
    const engine = {
      async start(request: WorkflowStartRequest): Promise<{ id: string, meta: WorkflowStartRequest['meta'], result: Promise<{ value: unknown, stopReason: string, agentsStarted: number }>, cancel: (reason?: string) => void, dispose: () => Promise<void> }> {
        return {
          id: 'run-heartbeat-1',
          meta: request.meta,
          result: Promise.resolve({ value: null, stopReason: 'completed', agentsStarted: 0 }),
          cancel: () => {},
          dispose: async () => {},
        }
      },
    }
    const ctx = { workflowEngine: engine, logger: () => ({ warn: () => {} }), on } as never
    const state = createActiveState()
    const agent = { session: Session.create('sess-guardian-heartbeat' as SessionId) } as never
    const pending = runWorkflow({
      ctx,
      config: resolveConfig({ timeoutMs: 6_000 }),
      state,
      logger: { warn: () => {} },
      agent,
      objective: 'heartbeat wiring exists',
      failureMode: 'report',
      callerTasks: [{
        id: 't1',
        title: 'writes a file',
        objective: 'write x',
        expectedOutput: 'x',
        acceptanceCriteria: ['x exists'],
        context: '',
        constraints: [],
        writesPaths: ['docs/x.md'],
      }],
    })
    // Capture peaks before the run settles and releases its listeners.
    peaks = {
      start: (listeners.get('workflow/agent-start') ?? []).length,
      end: (listeners.get('workflow/agent-end') ?? []).length,
      phase: (listeners.get('workflow/phase') ?? []).length,
      log: (listeners.get('workflow/log') ?? []).length,
    }
    await pending
    expect(peaks.start).toBeGreaterThanOrEqual(3)
    expect(peaks.end).toBeGreaterThanOrEqual(3)
    expect(peaks.phase).toBeGreaterThanOrEqual(1)
    expect(peaks.log).toBeGreaterThanOrEqual(1)
  })

  it('a rescue log line interrupts the child and delivers the guidance', async () => {
    // C3 host leg: the script broadcasts `guardian rescue …` on workflow/log;
    // the host interrupts that child and steers it, preserving its context.
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
    const interrupted: Array<{ target: string, authority: unknown }> = []
    const messaged: Array<{ target: string, text: string }> = []
    const subagents = {
      interrupt: (targetSessionId: string, authority: unknown) => {
        interrupted.push({ target: targetSessionId, authority })
      },
      sendMessage: async (_sender: unknown, targetId: string, content: Array<{ content?: Array<{ text?: string }> }>) => {
        const text = content.map(block => (block.content ?? []).map(part => part.text ?? '').join('')).join('')
        messaged.push({ target: targetId, text })
        return 'inbox-1'
      },
    }
    const engine = {
      async start(request: WorkflowStartRequest): Promise<{ id: string, meta: WorkflowStartRequest['meta'], result: Promise<{ value: unknown, stopReason: string, agentsStarted: number }>, cancel: (reason?: string) => void, dispose: () => Promise<void> }> {
        let resolve!: (value: { value: unknown, stopReason: string, agentsStarted: number }) => void
        const result = new Promise<{ value: unknown, stopReason: string, agentsStarted: number }>(accept => { resolve = accept })
        queueMicrotask(() => {
          emit('workflow/agent-start', { id: 'run-rescue-1' }, { seq: 1, label: 'lost worker', childId: 'child-9' })
          emit('workflow/log', { id: 'run-rescue-1' }, 'guardian rescue seq=1 label=lost worker guidance=stop waiting, continue with what you have')
          emit('workflow/agent-end', { id: 'run-rescue-1' }, { seq: 1, outcome: 'completed' })
          resolve({ value: null, stopReason: 'completed', agentsStarted: 1 })
        })
        return {
          id: 'run-rescue-1',
          meta: request.meta,
          result,
          cancel: () => {},
          dispose: async () => {},
        }
      },
    }
    const ctx = { workflowEngine: engine, logger: () => ({ warn: () => {} }), on, subagents } as never
    const state = createActiveState()
    const agent = { session: Session.create('sess-guardian-rescue' as SessionId) } as never
    const noticed: string[] = []
    await runWorkflow({
      ctx,
      config: resolveConfig({ timeoutMs: 6_000 }),
      state,
      logger: { warn: (message: string) => { noticed.push(message) } },
      agent,
      objective: 'rescue wiring exists',
      failureMode: 'report',
    })
    expect(noticed.filter(message => message.includes('rescue'))).toEqual([])
    expect(interrupted).toEqual([])
    expect(messaged.length).toBe(1)
    expect(messaged[0]?.target).toBe('child-9')
    expect(messaged[0]?.text).toContain('stop waiting, continue with what you have')
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
