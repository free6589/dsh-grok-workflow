/**
 * Issue #22 Phase 2 — the scenario matrix behind the task-grouped panel.
 *
 * Every test here drives the **real** engine (`test/engine-harness.ts`) into a **real**
 * `Session`, then reads the recorded `tool-workflow/*` events back and folds them two
 * ways: with the stock component's transcription (`test/gui-fold.ts`) and with the
 * plugin's own projection (`src/panel.ts`). The two must agree on what the panel shows,
 * and both must agree with the final report — that agreement is the P1-1 semantic
 * boundary (`agent-end: completed` is a finished call, never a passed task).
 *
 * What these tests deliberately do *not* do: present themselves as GUI evidence. The
 * Web GUI at the configured host answers HTTP 401 without a launch token, so the real
 * screenshots are NOT_RUN in the PR (see docs/task-progress-panel.md).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import type { Session as SessionType } from '@deepseek-ai/dsh-session'
import { resolveConfig } from '../src/config.js'
import {
  PROGRESS_AGENT_END,
  PROGRESS_AGENT_START,
  PROGRESS_RUN_END,
  PROGRESS_RUN_START,
  createWorkflowProgressRecorder,
  progressStopReason,
} from '../src/records.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import { panelMatchesReport, panelVerified, projectPanel } from '../src/panel.js'
import type { PanelEvent } from '../src/panel.js'
import { NAMING_COPY, taskGroupTitle } from '../src/naming.js'
import type { NormalizedTask } from '../src/types.js'
import { createEngineHarness, type ChildAnswer, type ChildCall, type EngineHarness } from './engine-harness.js'
import { foldLikeTheGui, foldVerified } from './gui-fold.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROGRESS_TYPES = [PROGRESS_RUN_START, PROGRESS_AGENT_START, PROGRESS_AGENT_END, PROGRESS_RUN_END]

const workers = new Set<EngineHarness>()

afterEach(async () => {
  for (const harness of workers) await harness.dispose()
  workers.clear()
})

const logger = { warn: (): void => {} }

function harness(answer: (call: ChildCall) => ChildAnswer | Promise<ChildAnswer>): EngineHarness {
  const created = createEngineHarness(answer)
  workers.add(created)
  return created
}

function config(overrides: Record<string, unknown> = {}) {
  return resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 6, timeoutMs: 60_000, ...overrides })
}

function taskFixture(id: string): NormalizedTask {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: [`${id} works`],
    context: '',
    constraints: [],
    writesPaths: null,
  }
}

const executionResult = {
  summary: 'worker done',
  status: 'completed',
  deliverables: [{ description: 'output', locator: 'file:///tmp/out' }],
  evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
  testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
  filesChanged: [],
  uncertainties: [],
}

function verificationResult(task: NormalizedTask, verdict: 'pass' | 'fail' = 'pass') {
  return {
    verdict,
    criteria: task.acceptanceCriteria.map(criterion => ({
      criterion,
      met: verdict === 'pass',
      evidence: `checked ${criterion}`,
    })),
    checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/out', finding: 'observed output' }],
    commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    issues: verdict === 'pass' ? [] : ['the acceptance criterion is not met'],
    confidence: 'high',
  }
}

/** Role of one child call, read off the prompt the script writes. */
function role(call: ChildCall): 'worker' | 'verifier' | 'other' {
  if (call.prompt.includes('You are the execution agent')) return 'worker'
  if (call.prompt.includes('You are the independent verifier')) return 'verifier'
  return 'other'
}

/** Task id of one child call, read off the `TASK:` block it was handed. */
function taskOf(call: ChildCall): string {
  const match = /TASK:\n(\{[\s\S]*?\})\n\n/.exec(call.prompt)
  if (match === null) throw new Error(`prompt carries no task JSON: ${call.prompt.slice(0, 120)}`)
  return (JSON.parse(match[1]!) as NormalizedTask).id
}

/** The four progress events one session recorded, in arrival order. */
function progressEvents(session: SessionType): PanelEvent[] {
  return session.ownEvents()
    .filter(event => PROGRESS_TYPES.includes(event.type))
    .slice()
    .map(event => ({ type: event.type, data: event.data as Record<string, unknown> }))
}

/** Let pending appends and microtasks settle before a live snapshot. */
function flush(ms = 25): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// A. The run node is closed with the task-level result, not the engine's stop reason
// ---------------------------------------------------------------------------

describe('the panel is closed with the task-level result', () => {
  it('keeps a cancelled or failed engine stop verbatim and never promotes a report-less run', () => {
    expect(progressStopReason('completed', 'completed')).toBe('completed')
    // A verifier rejection ends the program normally; the engine still says completed.
    expect(progressStopReason('completed', 'failed')).toBe('error')
    expect(progressStopReason('completed', 'partial')).toBe('error')
    // No report at all: nothing a reader can check, so nothing passed.
    expect(progressStopReason('completed', undefined)).toBe('error')
    expect(progressStopReason('cancelled', undefined)).toBe('cancelled')
    expect(progressStopReason('error', undefined)).toBe('error')
  })

  it('shows 失败, never 已完成, when a completed verifier call rejects the work', async () => {
    const engine = harness(call => ({
      structured: role(call) === 'worker'
        ? executionResult
        : verificationResult(taskOf(call) === 'a' ? taskFixture('a') : taskFixture('b'), 'fail'),
    }))
    const session = Session.create('sess-panel-reject' as never)
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: config(),
      state: createActiveState(),
      logger,
      agent: { session } as never,
      objective: 'Ship it',
      callerTasks: [taskFixture('a')],
      failureMode: 'report',
    })
    expect(outcome.ok).toBe(true)
    // The task-level truth: the verifier rejected the work.
    expect(outcome.report.status).toBe('failed')
    expect(outcome.report.tasks[0]!.status).toBe('failed')

    const events = progressEvents(session)
    // Both calls ended (`agent-end: completed`) …
    expect(events.filter(event => event.type === PROGRESS_AGENT_END).map(event => event.data.outcome))
      .toEqual(['completed', 'completed'])
    // … and the node is closed as a failure, not as a pass.
    expect(events.at(-1)).toMatchObject({ type: PROGRESS_RUN_END, data: { stopReason: 'error' } })

    const node = foldLikeTheGui(events)
    expect(node?.status).toBe('failed')
    expect(foldVerified(node)).toBe(false)

    const panel = projectPanel(events, {
      verdicts: new Map([[taskGroupTitle(1, 'Task a'), 'failed' as const]]),
    })
    expect(panel?.run).toBe('failed')
    expect(panel?.statusText).toBe(NAMING_COPY.zh.runStates.failed)
    // Every row words the call, and the task wording is the task's own.
    expect(panel?.groups[0]?.rows.map(row => row.text)).toEqual(['执行代理已结束', '检查调用已结束'])
    expect(panel?.groups[0]?.verdict).toEqual({ status: 'failed', text: '任务未通过' })
    const rendered = JSON.stringify(panel)
    for (const forbidden of ['任务已完成', '检查通过', '已完成', '任务通过']) {
      expect(rendered).not.toContain(forbidden)
    }
    // The panel's pass state and the report agree — the assertion the old build failed.
    expect(panelMatchesReport(panel, outcome.report)).toBe(true)
    expect(panelVerified(panel)).toBe(outcome.report.status === 'completed')
  })

  it('shows 已完成 when, and only when, every task verified', async () => {
    const engine = harness(call => ({
      structured: role(call) === 'worker' ? executionResult : verificationResult(taskFixture(taskOf(call))),
    }))
    const session = Session.create('sess-panel-verified' as never)
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: config(),
      state: createActiveState(),
      logger,
      agent: { session } as never,
      objective: 'Ship it',
      callerTasks: [taskFixture('a')],
      failureMode: 'report',
    })
    expect(outcome.report.status).toBe('completed')
    const events = progressEvents(session)
    expect(events.at(-1)).toMatchObject({ type: PROGRESS_RUN_END, data: { stopReason: 'completed' } })
    const panel = projectPanel(events, {
      verdicts: new Map([[taskGroupTitle(1, 'Task a'), 'verified' as const]]),
    })
    expect(panel?.statusText).toBe(NAMING_COPY.zh.runStates.completed)
    expect(panel?.groups[0]?.verdict).toEqual({ status: 'verified', text: '任务通过' })
    expect(panelMatchesReport(panel, outcome.report)).toBe(true)
  })

  it('detects a panel that disagrees with the report instead of describing it', () => {
    const events: PanelEvent[] = [
      { type: PROGRESS_RUN_START, data: { runId: 'r', name: '任务团队 · 1 个任务' } },
      { type: PROGRESS_AGENT_START, data: { runId: 'r', seq: 1, label: '检查', phase: '任务 1 · Task a', childId: 'c1' } },
      { type: PROGRESS_AGENT_END, data: { runId: 'r', seq: 1, outcome: 'completed' } },
      // The bug this test exists for: a pass verdict stamped on a rejected run.
      { type: PROGRESS_RUN_END, data: { runId: 'r', stopReason: 'completed' } },
    ]
    const panel = projectPanel(events)
    expect(panelVerified(panel)).toBe(true)
    expect(panelMatchesReport(panel, { status: 'failed' })).toBe(false)
    expect(panelMatchesReport(panel, { status: 'completed' })).toBe(true)
    expect(panelMatchesReport(undefined, { status: 'completed' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// B. Three tasks at three different stages, and one waiting for a slot
// ---------------------------------------------------------------------------

describe('a three-task run shows one checking, one executing, one waiting', () => {
  it('groups by task, invents no row for the waiting task, and states the known total', async () => {
    const tasks = [taskFixture('a'), taskFixture('b'), taskFixture('c')]
    // Gates the test opens by hand: while a gate is closed the child's call is live.
    const gates: Record<string, () => void> = {}
    const closed = (key: string): Promise<unknown> => new Promise<unknown>((resolve) => {
      gates[key] = () => resolve(undefined)
    })
    let reachedB: () => void = () => {}
    const verifierOfB = new Promise<void>((resolve) => { reachedB = resolve })

    const engine = harness((call) => {
      const taskId = taskOf(call)
      const roleName = role(call)
      if (roleName === 'verifier' && taskId === 'b') {
        reachedB()
        return { structured: verificationResult(taskFixture('b')), gate: closed('b:verifier') }
      }
      if (roleName === 'worker' && taskId === 'a') {
        return { structured: executionResult, gate: closed('a:worker') }
      }
      return { structured: roleName === 'worker' ? executionResult : verificationResult(taskFixture(taskId)), gate: Promise.resolve() }
    })

    const session = Session.create('sess-panel-mixed' as never)
    const pending = runWorkflow({
      ctx: engine.ctx as never,
      config: config({ maxConcurrency: 2 }),
      state: createActiveState(),
      logger,
      agent: { session } as never,
      objective: 'Ship three tasks',
      callerTasks: tasks,
      failureMode: 'report',
    })

    // Task a is blocked in its worker; task b finished its worker and is verifying;
    // task c never got a slot.
    await verifierOfB
    await flush()

    const live = progressEvents(session)
    const snapshot = projectPanel(live, { totalTasks: 3 })
    expect(snapshot?.name).toBe('任务团队 · 3 个任务')
    expect(snapshot?.run).toBe('running')
    // Exactly two groups, in plan order: the waiting task has no row and no group,
    // because inventing one would mean inventing a subagent that does not exist.
    expect(snapshot?.groups.map(group => group.header))
      .toEqual([taskGroupTitle(1, 'Task a'), taskGroupTitle(2, 'Task b')])
    expect(snapshot?.groups[0]?.rows.map(row => [row.label, row.call]))
      .toEqual([['执行', 'running']])
    expect(snapshot?.groups[1]?.rows.map(row => [row.label, row.call]))
      .toEqual([['执行', 'ended'], ['检查', 'running']])
    expect(snapshot?.groups[0]?.rows[0]?.text).toBe('执行代理进行中')
    expect(snapshot?.groups[1]?.rows[1]?.text).toBe('检查调用进行中')
    // No task verdict can exist while the run is live.
    expect(snapshot?.groups.every(group => group.verdict === undefined)).toBe(true)
    // The stock fold sees the same two groups with the same rows.
    const stock = foldLikeTheGui(live)
    expect(stock?.phases.map(phase => phase.phase)).toEqual([
      taskGroupTitle(1, 'Task a'),
      taskGroupTitle(2, 'Task b'),
    ])
    expect(stock?.members.map(member => [member.label, member.status])).toEqual([
      ['执行', 'running'],
      ['执行', 'completed'],
      ['检查', 'running'],
    ])

    // Let everything finish: a verifies, c gets a slot, all three verify.
    gates['a:worker']?.()
    gates['b:verifier']?.()
    const outcome = await pending
    expect(outcome.report.status).toBe('completed')

    const final = progressEvents(session)
    const panel = projectPanel(final, { totalTasks: 3 })
    expect(panel?.run).toBe('completed')
    expect(panel?.groups.map(group => group.header))
      .toEqual(tasks.map((item, index) => taskGroupTitle(index + 1, item.title)))
    for (const group of panel?.groups ?? []) {
      expect(group.rows.map(row => row.label)).toEqual(['执行', '检查'])
      expect(group.rows.every(row => row.call === 'ended')).toBe(true)
    }
    expect(panelMatchesReport(panel, outcome.report)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// C. A rejected verification retries, and the retry is visible as an attempt
// ---------------------------------------------------------------------------

describe('a verification failure retries into a second attempt', () => {
  it('shows 执行（尝试 2） and 检查（尝试 2） in the same task group', async () => {
    // The verifier prompt carries no attempt number (it judges one execution), so the
    // scripted verifier is counted instead: first check rejects, second one passes.
    const checks = new Map<string, number>()
    const engine = harness((call) => {
      const taskId = taskOf(call)
      if (role(call) === 'worker') return { structured: executionResult }
      const seen = (checks.get(taskId) ?? 0) + 1
      checks.set(taskId, seen)
      return { structured: verificationResult(taskFixture(taskId), seen === 1 ? 'fail' : 'pass') }
    })
    const session = Session.create('sess-panel-retry' as never)
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: config({ maxRetries: 1 }),
      state: createActiveState(),
      logger,
      agent: { session } as never,
      objective: 'Ship it',
      callerTasks: [taskFixture('a')],
      failureMode: 'report',
    })
    expect(outcome.report.status).toBe('completed')
    expect(outcome.report.tasks[0]!.attempts).toHaveLength(2)
    expect(checks.get('a')).toBe(2)

    const events = progressEvents(session)
    const panel = projectPanel(events, { verdicts: new Map([[taskGroupTitle(1, 'Task a'), 'verified' as const]]) })
    // Four calls, one group: the retry stays inside its task.
    expect(panel?.groups).toHaveLength(1)
    expect(panel?.groups[0]?.rows.map(row => row.label))
      .toEqual(['执行', '检查', '执行（尝试 2）', '检查（尝试 2）'])
    expect(panel?.groups[0]?.verdict?.text).toBe('任务通过')
    // The intermediate rejection is a call outcome, and the run is a pass only because
    // the *task* was finally verified — the two are different facts.
    expect(panel?.groups[0]?.rows.every(row => row.call === 'ended')).toBe(true)
    expect(panelMatchesReport(panel, outcome.report)).toBe(true)
    // No user-visible text carries a provider-fallback suffix or an internal id.
    const rendered = JSON.stringify(panel)
    for (const forbidden of ['-a', '-r', 'grok-', 't1', 'child-']) {
      expect(rendered).not.toContain(forbidden)
    }
  })
})

// ---------------------------------------------------------------------------
// D. Reload: a replayed session renders the panel the live run rendered
// ---------------------------------------------------------------------------

describe('a reloaded session replays into the same panel', () => {
  it('keeps the panel identical after a snapshot round trip and a seeded replay', async () => {
    const engine = harness(call => ({
      structured: role(call) === 'worker' ? executionResult : verificationResult(taskFixture(taskOf(call))),
    }))
    const session = Session.create('sess-panel-replay' as never)
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: config({ maxConcurrency: 2 }),
      state: createActiveState(),
      logger,
      agent: { session } as never,
      objective: 'Ship two tasks',
      callerTasks: [taskFixture('a'), taskFixture('b')],
      failureMode: 'report',
    })
    expect(outcome.report.status).toBe('completed')

    const live = projectPanel(progressEvents(session), { totalTasks: 2 })
    const verdicts = new Map(outcome.report.tasks.map((item, index) => [
      taskGroupTitle(index + 1, item.title),
      item.status,
    ] as const))
    const liveVerdicts = projectPanel(progressEvents(session), { totalTasks: 2, verdicts })

    // What a persisted session hands a reader back: plain JSON, same order.
    const persisted = JSON.parse(JSON.stringify(session.snapshotEvents())) as { type: string, data: Record<string, unknown> }[]
    const replayed = persisted
      .filter(event => PROGRESS_TYPES.includes(event.type))
      .map(event => ({ type: event.type, data: event.data }))
    expect(replayed).toEqual(progressEvents(session))
    expect(projectPanel(replayed, { totalTasks: 2 })).toEqual(live)
    expect(projectPanel(replayed, { totalTasks: 2, verdicts })).toEqual(liveVerdicts)

    // A restored Session (the same seed path a store uses) replays the same events.
    const restored = Session.create('sess-panel-reload' as never, session.snapshotEvents())
    const restoredEvents = restored.ownEvents()
      .filter(event => PROGRESS_TYPES.includes(event.type))
      .map(event => ({ type: event.type, data: event.data as Record<string, unknown> }))
    expect(projectPanel(restoredEvents, { totalTasks: 2, verdicts })).toEqual(liveVerdicts)
    expect(foldLikeTheGui(restoredEvents)?.status).toBe('completed')
    expect(panelMatchesReport(liveVerdicts, outcome.report)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// E. Concurrent runs, duplicated events and out-of-order events never cross wires
// ---------------------------------------------------------------------------

describe('concurrent runs do not cross wires', () => {
  it('gives each session only its own run, even when the events interleave', () => {
    const mine = Session.create('sess-a' as never)
    const theirs = Session.create('sess-b' as never)
    const a = createWorkflowProgressRecorder(mine, logger)
    const b = createWorkflowProgressRecorder(theirs, logger)
    a.runStart({ id: 'run-a', meta: { name: '任务团队 · 1 个任务' } })
    b.runStart({ id: 'run-b', meta: { name: '任务团队 · 1 个任务' } })
    a.agentStart('run-a', { seq: 1, label: '执行', phase: '任务 1 · Task a', childId: 'child-a1' })
    b.agentStart('run-b', { seq: 1, label: '执行', phase: '任务 1 · Task a', childId: 'child-b1' })
    b.agentEnd('run-b', { seq: 1, outcome: 'failed' })
    a.agentEnd('run-a', { seq: 1, outcome: 'completed' })
    a.runEnd('run-a', 'error')
    b.runEnd('run-b', 'cancelled')

    const panelA = projectPanel(progressEvents(mine))
    const panelB = projectPanel(progressEvents(theirs))
    // Same human-readable header in both runs is fine: the *sessions* keep them apart.
    expect(panelA?.groups[0]?.rows.map(row => row.call)).toEqual(['ended'])
    expect(panelB?.groups[0]?.rows.map(row => row.call)).toEqual(['failed'])
    expect(panelA?.run).toBe('failed')
    expect(panelB?.run).toBe('cancelled')
    expect(panelA?.groups[0]?.rows.map(row => row.seq)).toEqual([1])
    expect(panelB?.groups[0]?.rows.map(row => row.seq)).toEqual([1])
  })
})

describe('duplicated and out-of-order events are handled without inventing state', () => {
  it('writes one append per engine event, so a duplicate cannot come from us', () => {
    const session = Session.create('sess-once' as never)
    const recorder = createWorkflowProgressRecorder(session, logger)
    recorder.runStart({ id: 'r', meta: { name: '任务团队' } })
    recorder.agentStart('r', { seq: 1, label: '执行', phase: '任务 1 · Task a', childId: 'c1' })
    recorder.agentEnd('r', { seq: 1, outcome: 'completed' })
    recorder.runEnd('r', 'completed')
    expect(progressEvents(session).map(event => event.type)).toEqual([
      PROGRESS_RUN_START, PROGRESS_AGENT_START, PROGRESS_AGENT_END, PROGRESS_RUN_END,
    ])
  })

  it('folds a duplicated event idempotently instead of adding a row', () => {
    const once: PanelEvent[] = [
      { type: PROGRESS_RUN_START, data: { runId: 'r', name: '任务团队 · 1 个任务' } },
      { type: PROGRESS_AGENT_START, data: { runId: 'r', seq: 1, label: '执行', phase: '任务 1 · Task a', childId: 'c1' } },
      { type: PROGRESS_AGENT_END, data: { runId: 'r', seq: 1, outcome: 'completed' } },
      { type: PROGRESS_RUN_END, data: { runId: 'r', stopReason: 'completed' } },
    ]
    const duplicated: PanelEvent[] = [
      once[0]!,
      once[1]!,
      once[1]!,
      once[2]!,
      once[2]!,
      once[3]!,
    ]
    expect(projectPanel(duplicated)).toEqual(projectPanel(once))
    expect(projectPanel(duplicated)?.groups[0]?.rows).toHaveLength(1)
  })

  it('settles a row whose agent-end arrived before its agent-start', () => {
    // A replayed log may be handed to a reader in a different order than the live
    // stream. Our projection settles by `seq`, so the row is never left "running".
    const unordered: PanelEvent[] = [
      { type: PROGRESS_RUN_START, data: { runId: 'r', name: '任务团队' } },
      { type: PROGRESS_AGENT_END, data: { runId: 'r', seq: 2, outcome: 'completed' } },
      { type: PROGRESS_AGENT_START, data: { runId: 'r', seq: 2, label: '检查', phase: '任务 1 · Task a', childId: 'c2' } },
      { type: PROGRESS_AGENT_END, data: { runId: 'r', seq: 1, outcome: 'failed' } },
      { type: PROGRESS_AGENT_START, data: { runId: 'r', seq: 1, label: '执行', phase: '任务 1 · Task a', childId: 'c1' } },
      { type: PROGRESS_RUN_END, data: { runId: 'r', stopReason: 'error' } },
    ]
    const panel = projectPanel(unordered)
    expect(panel?.groups[0]?.rows.map(row => [row.label, row.call]))
      .toEqual([['检查', 'ended'], ['执行', 'failed']])
    // The stock fold loses a settlement that precedes its start (`updateAgentEnd`
    // maps over members that already exist), which is why the recorder must preserve
    // arrival order — and why this projection, not the stock fold, is what a replay
    // reader can rely on.
    expect(foldLikeTheGui(unordered)?.members.map(member => member.status)).toEqual(['running', 'running'])
    // A settlement for a sequence that was never started creates no row.
    const orphan: PanelEvent[] = [
      { type: PROGRESS_RUN_START, data: { runId: 'r', name: '任务团队' } },
      { type: PROGRESS_AGENT_END, data: { runId: 'r', seq: 9, outcome: 'completed' } },
      { type: PROGRESS_RUN_END, data: { runId: 'r', stopReason: 'completed' } },
    ]
    expect(projectPanel(orphan)?.groups).toEqual([])
  })
})
