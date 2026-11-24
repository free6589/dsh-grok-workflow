/**
 * The `full` shape's front desk (escape hatch).
 *
 * `/grok on` writes `workflowMode: 'full'`, and `full` used to mean "every message
 * gets the whole workflow": `classifyTriage` hard-overrode every signal with
 * `mode-full`, so "今天天气怎么样？" paid for a planner, a worker and a verifier and
 * the user read a receipt instead of an answer.
 *
 * The boundary of this file: the `Session` is the real host class, the gate is the
 * real `apply()`/`agent/pre-step` registration, and the engine is a fake that
 * records every `start` — no model is involved. The fake tells the two kinds of run
 * apart exactly the way the panel does, by the run name (`src/run.ts`:
 * `TRIAGE_RUN_LABEL = 'Front desk'` for one front-desk call, the plugin's tool name
 * for a whole workflow), because "no team run" is the promise under test and a
 * quick answer is itself one child call.
 */

import { describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { setMode } from '../src/mode.js'
import { DELIVERY_RECORD } from '../src/records.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript } from './helpers.js'

/** Run name the front-desk single call uses (`src/run.ts`). */
const FRONT_DESK_RUN = 'Front desk'

/** What the scripted quick worker answers (case 1). */
const QUICK_ANSWER = '今天多云，最高 21 度，出门带件外套。'

/** What the scripted captain previews (case 3). */
const CAPTAIN_PREVIEW = '任务 1 · 读现有阈值\n任务 2 · 写成三句说明'

/** A real task: two steps and a deliverable, so the rules send it to the team. */
const REAL_TASK = '先读一下 src/triage.ts 里的 TRIAGE_LIMITS，然后把两个阈值的意思写成三句说明'

/* ------------------------------------------------------------------ engine -- */

interface EngineResult { value: unknown; stopReason: string; agentsStarted: number }

class FakeRun {
  readonly id = 'run-full-escape'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private settle!: (value: EngineResult) => void
  readonly cancel = vi.fn(() => {
    this.settle({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.settle = resolve })
  }

  complete(value: unknown): void {
    this.settle({ value, stopReason: 'completed', agentsStarted: 2 })
  }
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  /** Team runs settle on their own with a report; off leaves them in flight. */
  autoTeam = false

  /** Whole workflow runs, i.e. the plan→execute→verify round this file is about. */
  get teamRuns(): WorkflowStartRequest[] {
    return this.startCalls.filter(request => request.meta.name !== FRONT_DESK_RUN)
  }

  /** The one front-desk calls (quick worker, captain preview, first answer). */
  get singleCalls(): WorkflowStartRequest[] {
    return this.startCalls.filter(request => request.meta.name === FRONT_DESK_RUN)
  }

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    request.signal?.addEventListener('abort', () => run.cancel(), { once: true })
    if (request.meta.name === FRONT_DESK_RUN) {
      // One child call: the label is what the gate asked for (`singleCallScript`).
      const scripted = await runWorkflowScript(
        request.script,
        request.args as Record<string, unknown>,
        async (_prompt, options) => {
          if (options.label === 'quick-worker') return QUICK_ANSWER
          if (options.label === 'captain-preview') return CAPTAIN_PREVIEW
          if (options.label === 'first-answer') return '先按你说的查，查完给你结论。'
          throw new Error(`unexpected label ${options.label}`)
        },
      )
      run.complete(scripted.report)
      return run
    }
    if (this.autoTeam) {
      const plan = [(request.args as { tasks?: unknown }).tasks].flat().filter(Boolean)
      const tasks = plan.length > 0 ? plan as ReturnType<typeof task>[] : [task('a')]
      const scripted = await runWorkflowScript(
        request.script,
        request.args as Record<string, unknown>,
        async (_prompt, options) => {
          if (roleOf(options.label) === 'planner') return { tasks }
          if (roleOf(options.label) === 'worker') return execution('work done')
          if (roleOf(options.label) === 'verifier') return verification(tasks[0]!)
          throw new Error(`unexpected label ${options.label}`)
        },
      )
      run.complete(scripted.report)
    }
    return run
  }
}

/* ----------------------------------------------------------------- context -- */

type Handler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

class FakeContext {
  readonly warnings: string[] = []
  readonly handlers = new Map<string, Handler>()
  readonly disposers: (() => Promise<void> | void)[] = []
  readonly engine = new FakeEngine()
  readonly tools = { register: () => () => {} }
  readonly systemPrompt = { section: () => () => {}, getSectionOrder: () => 2600 }
  readonly workflowEngine = this.engine
  readonly logger = () => ({ warn: (message: string) => { this.warnings.push(message) }, info: () => {} })

  on(event: string, handler: Handler): () => void {
    this.handlers.set(event, handler)
    return () => { this.handlers.delete(event) }
  }

  effect(installer: () => () => Promise<void> | void): () => Promise<void> | void {
    const disposer = installer()
    this.disposers.push(disposer)
    return disposer
  }

  preStep(): Handler {
    const handler = this.handlers.get('agent/pre-step')
    if (handler === undefined) throw new Error('gate did not register agent/pre-step')
    return handler
  }
}

/* ------------------------------------------------------------------- agent -- */

class FakeAgent {
  readonly session: Session
  readonly followups: UserMessage[] = []
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
  readonly whenIdle = vi.fn(async () => {})

  constructor(session: Session) {
    this.session = session
  }
}

/* ----------------------------------------------------------------- helpers -- */

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

function payload(agent: FakeAgent, messages: UserMessage[], turn: number): Record<string, unknown> {
  return { agent, messages, turn, step: 1, signal: new AbortController().signal }
}

function nextWith(messages: UserMessage[]): () => Promise<unknown> {
  return async () => ({ kind: 'enter', messages })
}

interface Decision { kind: string; messages?: UserMessage[] }

function textOf(message: UserMessage): string {
  return message.content
    .map(block => (block as { type: string; text?: string }).type === 'text' ? (block as { text?: string }).text ?? '' : '')
    .join('\n')
}

/** Text of the answer the gate entered: the last message of the decision. */
function answerOf(decision: Decision): string {
  const messages = decision.messages ?? []
  expect(messages.length).toBeGreaterThan(0)
  return textOf(messages[messages.length - 1]!)
}

/**
 * The head `AgentLoop.step()` writes before the claimed batch, so the session is
 * mid-conversation and reopenable (same rule as `test/phase1-dialogue.spec.ts`).
 */
function headed(id: string): Session {
  const live = Session.create(id as never)
  live.append('step/start', { turn: 1, step: 1 })
  live.append('system/message', { turn: 1, step: 1, message: createSystemMessage('test head') }, { surfaceOp: 'append' })
  live.append('step/end', { turn: 1, step: 1 })
  return live
}

/** Turn the full shape on exactly the way `/grok on` does (same record bytes). */
function grokOn(live: Session): void {
  const written = setMode(live, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'full' })
  expect(written.ok).toBe(true)
}

/** Outcomes the gate recorded for its deliveries, oldest first. */
function deliveryOutcomes(live: Session): string[] {
  return live.ownEvents()
    .map(event => pluginRecordOf(event))
    .filter(record => record !== undefined && record.type === DELIVERY_RECORD)
    .map(record => String((record!.data as { outcome?: unknown }).outcome ?? ''))
}

function report(): Record<string, unknown> {
  const plan = [task('a')]
  return {
    schemaVersion: 1,
    status: 'completed',
    objective: REAL_TASK,
    plan: { source: 'caller', tasks: plan },
    tasks: [{
      id: 'a',
      title: 'Task a',
      attempts: [{ attempt: 1, status: 'verified', execution: execution('work done'), verification: verification(plan[0]!) }],
      status: 'verified',
      evidence: verification(plan[0]!).criteria,
    }],
    confirmed: [],
    incomplete: [],
    uncertain: [],
  }
}

function objectiveOf(request: WorkflowStartRequest): string {
  return String((request.args as { objective?: unknown }).objective ?? '')
}

/* ------------------------------------------------------------------- tests -- */

describe('the full shape answers small talk and single facts without a run', () => {
  it('/grok on + a weather question: one quick worker answers, no team run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'off' })
    const live = headed('sess-escape-fast')
    grokOn(live)
    const agent = new FakeAgent(live)

    const decision = await ctx.preStep()(payload(agent, [userMessage('今天天气怎么样？')], 2), nextWith([])) as Decision

    // The scripted quick answer reaches the user, with the tier note and without a
    // tier line (`full` never showed one).
    const answer = answerOf(decision)
    expect(answer).toContain(QUICK_ANSWER)
    expect(answer).toContain('（这条只派了一个工人，没有开完整团队。）')
    expect(answer).not.toContain('档位：')
    // No plan→execute→verify round: the quick answer is one child call, nothing else.
    expect(ctx.engine.teamRuns).toHaveLength(0)
    expect(ctx.engine.singleCalls).toHaveLength(1)
    expect(deliveryOutcomes(live)).toContain('full-escape-fast')
    expect(agent.followups).toHaveLength(0)
  })

  it('/grok on + small talk: the template answers, nothing is started', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'off' })
    const live = headed('sess-escape-chat')
    grokOn(live)
    const agent = new FakeAgent(live)

    const decision = await ctx.preStep()(payload(agent, [userMessage('你好')], 2), nextWith([])) as Decision

    const answer = answerOf(decision)
    expect(answer).toContain('你好！我在。要做事就直接说')
    expect(answer).toContain('（这条没有动用团队，前台直答。）')
    expect(answer).not.toContain('档位：')
    expect(ctx.engine.startCalls).toHaveLength(0)
    expect(deliveryOutcomes(live)).toContain('full-escape-chat')
  })
})

describe('the full shape asks before it runs a real task', () => {
  it('/grok on + a real task: the captain states the split, and only 「确认」 starts the run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'off' })
    const live = headed('sess-escape-ask')
    grokOn(live)
    const agent = new FakeAgent(live)

    const asked = await ctx.preStep()(payload(agent, [userMessage(REAL_TASK)], 2), nextWith([])) as Decision
    const question = answerOf(asked)
    expect(question).toContain('队长先报拆法')
    expect(question).toContain(CAPTAIN_PREVIEW)
    // Nothing ran: the only call was the split preview.
    expect(ctx.engine.teamRuns).toHaveLength(0)
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(deliveryOutcomes(live)).toContain('full-escape-ask')

    const approved = await ctx.preStep()(payload(agent, [userMessage('确认')], 3), nextWith([])) as Decision
    expect(approved.kind).toBe('enter')
    // The confirmation dispatches exactly what the user agreed to: the approval
    // marker and the original request travel into the objective.
    await vi.waitFor(() => {
      if (ctx.engine.teamRuns.length !== 1) throw new Error(`team runs: ${ctx.engine.teamRuns.length}`)
    })
    const objective = objectiveOf(ctx.engine.teamRuns[0]!)
    expect(objective).toContain('USER APPROVED THIS SPLIT')
    expect(objective).toContain(CAPTAIN_PREVIEW)
    expect(objective).toContain('TRIAGE_LIMITS')

    // Settle the round so the test leaves nothing in flight.
    ctx.engine.runs.at(-1)!.complete(report())
    await vi.waitFor(() => {
      if (agent.followups.length === 0) throw new Error('the report was not delivered')
    })
  })
})

describe('a deployment-level full keeps its own path', () => {
  it('config full with no session record runs the team at once, with no captain question', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoTeam = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = headed('sess-config-full-task')
    const agent = new FakeAgent(live)

    const decision = await ctx.preStep()(payload(agent, [userMessage(REAL_TASK)], 2), nextWith([])) as Decision

    const answer = answerOf(decision)
    // The tool's own run report, exactly as before the escape existed…
    expect(answer).toContain('COMPLETED')
    // …and no split question, because this shape's promise is a run inside the turn.
    expect(answer).not.toContain('队长先报拆法')
    expect(ctx.engine.teamRuns).toHaveLength(1)
    expect(objectiveOf(ctx.engine.teamRuns[0]!)).toContain('TRIAGE_LIMITS')
    expect(ctx.engine.singleCalls).toHaveLength(0)
  })

  it('config full with no session record still runs every message: the escape needs `/grok on`', async () => {
    // The narrowing: a deployment-level `mode: 'full'` is "every message runs", with
    // no `/grok on` to switch the escape off. Small talk on that shape keeps the team
    // run it always had — `test/gate.spec.ts` is fifty cases built on it.
    const ctx = new FakeContext()
    ctx.engine.autoTeam = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = headed('sess-config-full-chat')
    const agent = new FakeAgent(live)

    const decision = await ctx.preStep()(payload(agent, [userMessage('你好')], 2), nextWith([])) as Decision

    expect(ctx.engine.teamRuns).toHaveLength(1)
    expect(ctx.engine.singleCalls).toHaveLength(0)
    expect(report()).toMatchObject({ status: 'completed' })
    expect(deliveryOutcomes(live)).not.toContain('full-escape-chat')
    expect(answerOf(decision)).toContain('COMPLETED')
  })
})
