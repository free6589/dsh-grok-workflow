/**
 * Progress records: the four session events the stock Web GUI folds into a
 * workflow-run node (t44, plan A+D from t43).
 *
 * Two layers, deliberately:
 *
 * - The recorder is tested against a fake session, so every rule from t43 can be
 *   forced: own-run-id only, containment of a refusing session, pre-adoption
 *   buffering, per-run isolation, the `showProgress` switch.
 * - The wiring is tested against the **real** `@deepseek-ai/dsh-workflow-ptc`
 *   engine (see test/engine-harness.ts for that boundary), because the payload
 *   shapes come from *its* `workflow/agent-start|end` events. A fake engine would
 *   prove only that our own fiction is self-consistent.
 *
 * The payload fields are not ours: they are `@deepseek-ai/dsh-tool-workflow`'s
 * (`lib/index.js:98-133`) and the fold that consumes them is
 * `@deepseek-ai/dsh-client-ui-workflow-run`'s (`lib/client.js:591-640`). The
 * shape assertions below are the tripwire for a DSH upgrade that renames one.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import type { Session as SessionType } from '@deepseek-ai/dsh-session'
import { resolveConfig } from '../src/config.js'
import {
  createWorkflowProgressRecorder,
  PROGRESS_AGENT_END,
  PROGRESS_AGENT_START,
  PROGRESS_RUN_END,
  PROGRESS_RUN_START,
} from '../src/records.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import { WORKFLOW_RUN_LABEL, workflowRunName } from '../src/script.js'
import type { NormalizedTask } from '../src/types.js'
import { createEngineHarness, type EngineHarness } from './engine-harness.js'

/** A session that records appends and can be told to refuse them. */
class FakeSession {
  readonly writes: { type: string, data: Record<string, unknown> }[] = []
  /** Number of appends that succeed before every later one throws. */
  failAfter: number | undefined

  append(type: string, data: Record<string, unknown>): void {
    if (this.failAfter !== undefined && this.writes.length >= this.failAfter) throw new Error('session is closed')
    this.writes.push({ type, data })
  }
}

const loggerWith = (warnings: string[]): { warn: (message: string) => void } => ({
  warn: (message: string) => { warnings.push(message) },
})

describe('progress recorder: payload contract', () => {
  it('writes exactly the fields the in-tree recorder writes', () => {
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    recorder.runStart({ id: 'run-1', meta: { name: 'grok-workflow · 2 tasks' } })
    recorder.agentStart('run-1', { seq: 1, label: 'grok-planner', childId: 'child-1' })
    recorder.agentStart('run-1', { seq: 2, label: 'grok-worker-t1-a1', phase: '执行 Execution', childId: 'child-2' })
    recorder.agentEnd('run-1', { seq: 2, outcome: 'completed' })
    recorder.runEnd('run-1', 'completed')

    expect(target.writes).toEqual([
      { type: PROGRESS_RUN_START, data: { runId: 'run-1', name: 'grok-workflow · 2 tasks' } },
      // No `phase` key at all when the call declares none: the fold tests
      // `data.phase === undefined`, and an explicit `undefined` would be dropped
      // by the session's JSON snapshot anyway (so the two must not diverge).
      { type: PROGRESS_AGENT_START, data: { runId: 'run-1', seq: 1, label: 'grok-planner', childId: 'child-1' } },
      {
        type: PROGRESS_AGENT_START,
        data: { runId: 'run-1', seq: 2, label: 'grok-worker-t1-a1', phase: '执行 Execution', childId: 'child-2' },
      },
      { type: PROGRESS_AGENT_END, data: { runId: 'run-1', seq: 2, outcome: 'completed' } },
      { type: PROGRESS_RUN_END, data: { runId: 'run-1', stopReason: 'completed' } },
    ])
  })

  it('names the run with the task count only when the count is known', () => {
    // The title of the GUI node is this name (`workflowRun.dict: "run.title": "{name}"`).
    expect(workflowRunName(WORKFLOW_RUN_LABEL, undefined)).toBe('grok-workflow')
    expect(workflowRunName(WORKFLOW_RUN_LABEL, 1)).toBe('grok-workflow · 1 task')
    expect(workflowRunName(WORKFLOW_RUN_LABEL, 3)).toBe('grok-workflow · 3 tasks')
    // No count nobody promised: the gate plans first, so 0/NaN mean "unknown".
    expect(workflowRunName(WORKFLOW_RUN_LABEL, 0)).toBe('grok-workflow')
    expect(workflowRunName(WORKFLOW_RUN_LABEL, Number.NaN)).toBe('grok-workflow')
    expect(workflowRunName(WORKFLOW_RUN_LABEL, 10_000).length).toBeLessThanOrEqual(80)
  })
})

describe('progress recorder: the three rules from t43', () => {
  it('records one run in order: run-start, members, run-end', () => {
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    recorder.runStart({ id: 'r', meta: { name: 'n' } })
    recorder.agentStart('r', { seq: 1, label: 'a', childId: 'c1' })
    recorder.agentEnd('r', { seq: 1, outcome: 'completed' })
    recorder.agentStart('r', { seq: 2, label: 'b', childId: 'c2' })
    recorder.agentEnd('r', { seq: 2, outcome: 'failed' })
    recorder.runEnd('r', 'completed')
    expect(target.writes.map(write => write.type)).toEqual([
      PROGRESS_RUN_START,
      PROGRESS_AGENT_START, PROGRESS_AGENT_END,
      PROGRESS_AGENT_START, PROGRESS_AGENT_END,
      PROGRESS_RUN_END,
    ])
  })

  it('never writes another run’s events into this session', () => {
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    recorder.runStart({ id: 'mine', meta: { name: 'n' } })
    // A concurrent run (another session, another recorder) shares the engine bus.
    recorder.agentStart('theirs', { seq: 1, label: 'x', childId: 'ctx1' })
    recorder.agentEnd('theirs', { seq: 1, outcome: 'completed' })
    recorder.runEnd('theirs', 'completed')
    expect(target.writes).toHaveLength(1)
    expect(target.writes[0]!.data).toEqual({ runId: 'mine', name: 'n' })
  })

  it('replays a member event that arrived before its run was adopted', () => {
    // `engine.start()` is synchronous, but the caller awaits it, so the script's
    // first `agent()` can win the microtask race. Order must survive that.
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    recorder.agentStart('r', { seq: 1, label: 'early', childId: 'c1' })
    recorder.runStart({ id: 'r', meta: { name: 'n' } })
    recorder.agentEnd('r', { seq: 1, outcome: 'completed' })
    expect(target.writes.map(write => write.type)).toEqual([PROGRESS_RUN_START, PROGRESS_AGENT_START, PROGRESS_AGENT_END])
    expect(target.writes[1]!.data).toMatchObject({ runId: 'r', seq: 1, label: 'early' })
  })

  it('keeps the pre-adoption buffer bounded by run and by event', () => {
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    for (let index = 0; index < 40; index += 1) {
      recorder.agentStart(`foreign-${index}`, { seq: index, label: `l${index}`, childId: `c${index}` })
    }
    // Nothing was written: none of those runs was ever adopted.
    expect(target.writes).toHaveLength(0)
    // The most recent run is still buffered, so adopting it replays its events.
    recorder.runStart({ id: 'foreign-39', meta: { name: 'n' } })
    expect(target.writes.map(write => write.type)).toEqual([PROGRESS_RUN_START, PROGRESS_AGENT_START])
  })

  it('contains a refusing session: the panel entry is lost, the run is not', () => {
    const warnings: string[] = []
    const target = new FakeSession()
    target.failAfter = 1
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith(warnings))
    expect(() => { recorder.runStart({ id: 'r', meta: { name: 'n' } }) }).not.toThrow()
    expect(() => { recorder.agentStart('r', { seq: 1, label: 'a', childId: 'c1' }) }).not.toThrow()
    expect(() => { recorder.runEnd('r', 'completed') }).not.toThrow()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('progress record dropped')
    // One refusal stops this run's recording (the in-tree recorder does the same:
    // retrying a permanently failing append would only spam the log).
    expect(target.writes).toHaveLength(1)
  })

  it('writes nothing after dispose, and nothing without a session', () => {
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    recorder.runStart({ id: 'r', meta: { name: 'n' } })
    recorder.dispose()
    recorder.agentStart('r', { seq: 1, label: 'a', childId: 'c1' })
    recorder.runEnd('r', 'completed')
    expect(target.writes).toHaveLength(1)

    const detached = createWorkflowProgressRecorder(undefined, loggerWith([]))
    expect(() => {
      detached.runStart({ id: 'r', meta: { name: 'n' } })
      detached.agentStart('r', { seq: 1, label: 'a', childId: 'c1' })
      detached.runEnd('r', 'completed')
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// The wiring, against the real engine.
// ---------------------------------------------------------------------------

const harnesses: EngineHarness[] = []

function harness(answer: Parameters<typeof createEngineHarness>[0]): EngineHarness {
  const created = createEngineHarness(answer)
  harnesses.push(created)
  return created
}

afterEach(async () => {
  for (const created of harnesses.splice(0)) await created.dispose()
})

function taskFromPrompt(prompt: string): NormalizedTask {
  const match = /TASK:\n(\{[\s\S]*?\})\n\n/.exec(prompt)
  if (match === null) throw new Error(`prompt has no task JSON: ${prompt.slice(0, 120)}`)
  return JSON.parse(match[1]!) as NormalizedTask
}

const taskA: NormalizedTask = {
  id: 'a',
  title: 'Task a',
  objective: 'Do a',
  expectedOutput: 'Output a',
  acceptanceCriteria: ['a works'],
  context: '',
  constraints: [],
  writesPaths: null,
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

function verificationResult(task: NormalizedTask) {
  return {
    verdict: 'pass',
    criteria: task.acceptanceCriteria.map(criterion => ({ criterion, met: true, evidence: `checked ${criterion}` })),
    checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/out', finding: 'observed output' }],
    commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    issues: [],
    confidence: 'high',
  }
}

/** The stock panel's fold, transcribed: the four events in, one node out. */
interface FoldedNode {
  name: string
  status: string
  members: { seq: number, label: string, status: string }[]
}

function foldLikeTheGui(events: { type: string, data: Record<string, unknown> }[]): FoldedNode | undefined {
  let node: FoldedNode | undefined
  let stopReason: string | undefined
  const settled = new Map<number, string>()
  for (const event of events) {
    if (event.type === PROGRESS_RUN_START) {
      node = { name: String(event.data.name), status: 'running', members: [] }
      continue
    }
    if (node === undefined) continue
    if (event.type === PROGRESS_AGENT_START) {
      node.members.push({ seq: Number(event.data.seq), label: String(event.data.label), status: 'running' })
      continue
    }
    if (event.type === PROGRESS_AGENT_END) settled.set(Number(event.data.seq), String(event.data.outcome))
    if (event.type === PROGRESS_RUN_END) stopReason = String(event.data.stopReason)
  }
  if (node === undefined) return undefined
  for (const member of node.members) member.status = settled.get(member.seq) ?? member.status
  // `statusFromStopReason` (dsh-client-ui-workflow-run/lib/client.js:508-514).
  node.status = stopReason === undefined ? 'running' : stopReason === 'error' ? 'failed' : stopReason
  return node
}

const PROGRESS_TYPES = [PROGRESS_RUN_START, PROGRESS_AGENT_START, PROGRESS_AGENT_END, PROGRESS_RUN_END]

function progressEvents(session: SessionType): { type: string, data: Record<string, unknown> }[] {
  return session.ownEvents()
    .filter(event => PROGRESS_TYPES.includes(event.type))
    .map(event => ({ type: event.type, data: event.data as Record<string, unknown> }))
}

describe('progress wiring: the real engine writes what the panel folds', () => {
  const config = () => resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 6, timeoutMs: 60_000 })

  it('records run-start, one row per subagent, then run-end', async () => {
    const engine = harness(call => (call.prompt.includes('You are the execution agent')
      ? { structured: executionResult }
      : { structured: verificationResult(taskFromPrompt(call.prompt)) }))
    const session = Session.create('sess-progress' as never)
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: config(),
      state: createActiveState(),
      logger: loggerWith([]),
      agent: { session } as never,
      objective: 'Ship the verified result',
      callerTasks: [taskA],
      failureMode: 'report',
    })
    expect(outcome.ok).toBe(true)

    const events = progressEvents(session)
    expect(events.map(event => event.type)).toEqual([
      PROGRESS_RUN_START,
      PROGRESS_AGENT_START, PROGRESS_AGENT_END,
      PROGRESS_AGENT_START, PROGRESS_AGENT_END,
      PROGRESS_RUN_END,
    ])
    // A plan was supplied, so the title carries the count (D of the t43 plan).
    expect(events[0]!.data).toEqual({ runId: expect.any(String), name: 'grok-workflow · 1 task' })
    const node = foldLikeTheGui(events)
    expect(node).toEqual({
      name: 'grok-workflow · 1 task',
      status: 'completed',
      members: [
        { seq: 1, label: expect.stringContaining('grok-worker'), status: 'completed' },
        { seq: 2, label: expect.stringContaining('grok-verifier'), status: 'completed' },
      ],
    })
    expect(events.at(-1)!.data).toMatchObject({ stopReason: 'completed' })
  })

  it('closes the node as cancelled when the caller cancels', async () => {
    const engine = harness(async call => {
      if (call.prompt.includes('You are the execution agent')) {
        await new Promise(resolve => setTimeout(resolve, 50))
        return { structured: executionResult }
      }
      return { structured: verificationResult(taskFromPrompt(call.prompt)) }
    })
    const session = Session.create('sess-progress-cancel' as never)
    const controller = new AbortController()
    const pending = runWorkflow({
      ctx: engine.ctx as never,
      config: config(),
      state: createActiveState(),
      logger: loggerWith([]),
      agent: { session } as never,
      objective: 'Ship the verified result',
      callerTasks: [taskA],
      failureMode: 'report',
      signals: [controller.signal],
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    controller.abort()
    const outcome = await pending
    expect(outcome.cause).toBe('cancelled')
    const events = progressEvents(session)
    expect(events[0]!.type).toBe(PROGRESS_RUN_START)
    expect(events.at(-1)).toMatchObject({ type: PROGRESS_RUN_END, data: { stopReason: 'cancelled' } })
    expect(foldLikeTheGui(events)?.status).toBe('cancelled')
  })

  it('leaves the workflow intact when the session refuses every progress append', async () => {
    // The strongest form of rule 2: a real run through the real engine, with a session
    // that rejects exactly the events this recorder writes.
    const engine = harness(call => (call.prompt.includes('You are the execution agent')
      ? { structured: executionResult }
      : { structured: verificationResult(taskFromPrompt(call.prompt)) }))
    const real = Session.create('sess-progress-refusing' as never)
    const refusing = new Proxy(real, {
      get(target, property, receiver) {
        if (property === 'append') {
          return (type: string, data: unknown): unknown => {
            if (type.startsWith('tool-workflow/')) throw new Error('this session is closed to run events')
            return (target.append as (kind: string, payload: unknown) => unknown)(type, data)
          }
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const warnings: string[] = []
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: config(),
      state: createActiveState(),
      logger: loggerWith(warnings),
      agent: { session: refusing } as never,
      objective: 'Ship the verified result',
      callerTasks: [taskA],
      failureMode: 'report',
    })
    expect(outcome.ok).toBe(true)
    expect(outcome.report.status).toBe('completed')
    expect(progressEvents(real)).toEqual([])
    expect(warnings.some(warning => warning.includes('progress record dropped'))).toBe(true)
  })

  it('writes nothing at all when showProgress is off, and still runs the workflow', async () => {
    const engine = harness(call => (call.prompt.includes('You are the execution agent')
      ? { structured: executionResult }
      : { structured: verificationResult(taskFromPrompt(call.prompt)) }))
    const session = Session.create('sess-progress-off' as never)
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 6, timeoutMs: 60_000, showProgress: false }),
      state: createActiveState(),
      logger: loggerWith([]),
      agent: { session } as never,
      objective: 'Ship the verified result',
      callerTasks: [taskA],
      failureMode: 'report',
    })
    expect(outcome.ok).toBe(true)
    expect(progressEvents(session)).toEqual([])
    // The engine still did the work; only the recording stopped.
    expect(engine.children.length).toBeGreaterThan(0)
  })
})
