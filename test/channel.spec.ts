/**
 * The main-session channel (L2, `replan` on): a message typed while a run is
 * working must not cost the user the work in flight.
 *
 * Two layers, because two different things can be wrong:
 *
 * - `src/channel.ts` is pure: classification (stop vs forward), the text an intent
 *   carries, the receipt, and the request a late demand opens. No engine, no model,
 *   no clock — every case below is deterministic.
 * - the gate wiring is not pure: does the decision actually come back *before* the
 *   run settles, is the live run left alone, does the demand reach the planner with
 *   the conversation attached, and does a demand that missed the boundary still
 *   become a round? Those are driven through the real `apply()` composition with a
 *   fake engine, exactly like `test/gate.spec.ts` does, so the assertions are about
 *   the shipped listener rather than about a copy of it.
 *
 * The five acceptance checks this file covers, by name:
 * A1 immediate ack · A2 never awaits the run · A3 forwarded with context ·
 * A4 late demand opens the next round · A5 in-flight work is not cancelled.
 */

import { describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import {
  CHANNEL_OUTCOMES, CHANNEL_STOP_MAX_CHARS, STEER_CANCEL_REASON, carriedNote, classifyChannelMessage,
  composeCarriedRequest, composeIntentText, idleStopNote, steerReceipt, stopNote,
} from '../src/channel.js'
import { setMode } from '../src/mode.js'
import { closeSteering, openSteering, steeringForSession } from '../src/steering.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript } from './helpers.js'

/* ------------------------------------------------------------ pure channel -- */

describe('channel classification: only an unmistakable stop may cancel', () => {
  const stops = ['停', '停吧', '停一下。', '请停下来', '别做了', '取消', '算了', 'stop', 'Stop it', 'cancel the run']
  const forwards = [
    '再加一个任务：补一版 README',
    '改成 C 方案',
    '停止旧的缓存策略（这是新任务）',
    '为什么任务 2 是红的',
    '怎么还没跑完？',
    '顺便把测试也补上',
    '停一下之前先把日志存下来，然后继续做第 3 个任务，再把结论发我',
  ]

  it.each(stops)('treats %s as a stop', (text) => {
    expect(classifyChannelMessage(text).kind).toBe('stop')
  })

  it.each(forwards)('treats %s as a demand to forward', (text) => {
    expect(classifyChannelMessage(text).kind).toBe('forward')
  })

  it('never reads a question as a stop, even when it contains a stop word', () => {
    // "能不能停一下" asks a question; cancelling on it would spend the run to
    // answer a question.
    expect(classifyChannelMessage('能不能停一下？').kind).toBe('forward')
  })

  it('keeps a task description that contains a stop character a task', () => {
    expect(classifyChannelMessage('写一个停车位管理页面').kind).toBe('forward')
  })

  it('bounds the stop form by length so a long sentence is not an imperative', () => {
    const long = '停下来' + 'x'.repeat(CHANNEL_STOP_MAX_CHARS)
    expect(classifyChannelMessage(long).kind).toBe('forward')
  })

  it('names the marker that decided it, for the ledger', () => {
    expect(classifyChannelMessage('停一下。').reason).toBe('marker:停一下')
  })
})

describe('channel text: the intent carries the demand and the conversation', () => {
  const context = '用户：帮我查三家的价格\n助手：已核验两家的报价，第三家待查。'

  it('keeps the demand whole and marks the context as context', () => {
    const text = composeIntentText(context, '再补一家', 2000)
    expect(text).toContain('再补一家')
    expect(text).toContain('conversation before it')
    expect(text).toContain('帮我查三家的价格')
  })

  it('never truncates the demand away, even with a full context', () => {
    const text = composeIntentText('x'.repeat(5000), '再补一家', 300)
    expect(text).toContain('再补一家')
    expect(text.length).toBeLessThanOrEqual(300)
  })

  it('stays within the intent budget', () => {
    expect(composeIntentText(context.repeat(50), '改成 C', 400).length).toBeLessThanOrEqual(400)
  })

  it('omits the context block when there is no conversation yet', () => {
    const text = composeIntentText('   ', '再补一家', 2000)
    expect(text).toContain('再补一家')
    expect(text).not.toContain('conversation before it')
  })
})

describe('late demand: an intent that missed the boundary becomes the next round', () => {
  it('carries the previous objective and the demand in one bounded request', () => {
    const request = composeCarriedRequest('把三家报价查清楚', ['再加一个：写成一页对比表'], 32_000)
    expect(request).toContain('把三家报价查清楚')
    expect(request).toContain('再加一个：写成一页对比表')
    expect(request).toContain('do not redo it')
  })

  it('states an unknown previous objective instead of inventing one', () => {
    expect(composeCarriedRequest(undefined, ['再加一个'], 32_000)).toContain('(unknown)')
  })

  it('keeps the demand when the budget is tight, cutting the previous objective first', () => {
    const request = composeCarriedRequest('p'.repeat(4000), ['必须保留这条要求'], 600)
    expect(request).toContain('必须保留这条要求')
    expect(request.length).toBeLessThanOrEqual(600)
  })
})

describe('channel wording: says where the message went and how to stop', () => {
  it('the receipt names the merge point, not a new run', () => {
    const zh = steerReceipt('zh', 2)
    expect(zh).toContain('并入')
    expect(zh).toContain('波边界')
    expect(zh).toContain('停')
    const en = steerReceipt('en', 1)
    expect(en).toContain('folded into the run')
    expect(en).toContain('stop')
  })

  it('the stop terminal claims no completion and keeps verified work', () => {
    expect(stopNote('zh')).toContain('已完成')
    expect(stopNote('zh')).not.toContain('完成全部')
    expect(stopNote('en')).toContain('verified work is kept')
  })

  it('an idle stop says nothing was started', () => {
    expect(idleStopNote('zh')).toContain('没有启动新的工作流')
    expect(idleStopNote('en')).toContain('started no workflow')
  })

  it('the carried round says why it is one round later', () => {
    expect(carriedNote('zh', 1)).toContain('上一轮')
    expect(carriedNote('en', 2)).toContain('carried over')
  })

  it('ledger outcomes are stable strings', () => {
    expect(CHANNEL_OUTCOMES).toEqual({
      steered: 'steered-into-live-plan',
      stop: 'steer-stop',
      idleStop: 'steer-stop-idle',
      carried: 'steer-carried-to-next-round',
    })
  })
})

/* ------------------------------------------------------- gate integration -- */

interface EngineResult {
  value: unknown
  stopReason: string
  agentsStarted: number
}

class FakeRun {
  readonly id: string
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private resolve!: (value: EngineResult) => void
  readonly cancel = vi.fn((_reason?: string) => {
    this.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })

  constructor(request: WorkflowStartRequest) {
    this.id = `run-${request.meta.name}-${Math.random().toString(36).slice(2, 8)}`
    this.meta = request.meta
    this.result = new Promise(resolve => { this.resolve = resolve })
  }

  complete(value: unknown): void {
    this.resolve({ value, stopReason: 'completed', agentsStarted: 2 })
  }
}

/**
 * Engine fake: a workflow run stays live until the test settles it, which is what
 * makes "the decision came back before the run" a real measurement rather than a
 * timing assumption. The front-desk single call answers at once with no text, so a
 * team-tier test does not spend a minute waiting for a tier receipt.
 */
class FakeEngine {
  /**
   * Team rounds, in order. The `full` shape now spends one front-desk call before a
   * round (its first answer), and the real engine hands that call back as a run too —
   * but it is a model call, not a round, so it is counted in {@link frontDeskCalls}
   * instead: a case that says "one run started" keeps meaning one plan→execute→verify
   * round. Nothing is dropped — a case that wants to know how often the front desk was
   * asked reads `frontDeskCalls`.
   */
  readonly startCalls: WorkflowStartRequest[] = []
  /** Front-desk single calls (`src/run.ts` `TRIAGE_RUN_LABEL`), in order. */
  readonly frontDeskCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []

  autoRun = false

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    const run = new FakeRun(request)
    request.signal?.addEventListener('abort', () => run.cancel('signal aborted'), { once: true })
    if (request.meta.name === 'Front desk') {
      this.frontDeskCalls.push(request)
      // Cheap tiers: resolve immediately with no reply (the gate falls back).
      queueMicrotask(() => run.complete(null))
      return run
    }
    this.startCalls.push(request)
    this.runs.push(run)
    if (this.autoRun) void this.finish(run, request)
    return run
  }

  private async finish(run: FakeRun, request: WorkflowStartRequest): Promise<void> {
    const tasks = [(request.args as { tasks?: unknown }).tasks].flat().filter(Boolean)
    const plan = tasks.length > 0 ? tasks as ReturnType<typeof task>[] : [task('a')]
    const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('work done')
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      if (roleOf(options.label) === 'planner') return { tasks: plan }
      throw new Error(`unexpected label ${options.label}`)
    })
    run.complete(result.report)
  }
}

type Handler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

class FakeContext {
  readonly warnings: string[] = []
  readonly handlers = new Map<string, Handler>()
  readonly registeredTools: unknown[] = []
  readonly engine = new FakeEngine()
  readonly disposers: (() => Promise<void> | void)[] = []
  readonly tools = { register: (tool: unknown) => { this.registeredTools.push(tool); return () => {} } }
  readonly systemPrompt = {
    section: () => () => {},
    getSectionOrder: () => 2600,
  }
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

class FakeAgent {
  readonly session: Session
  readonly followups: UserMessage[] = []
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
  readonly whenIdle = vi.fn(async () => {})

  constructor(session: Session) {
    this.session = session
  }
}

function message(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

function historyTurn(text: string, reply: string): UserMessage[] {
  return [
    message(text),
    createAssistantMessage({
      content: [{ type: 'text', text: reply }],
      source: { kind: 'model', provider: 'p', model: 'm' } as never,
    }) as unknown as UserMessage,
  ]
}

/** The objective a request carried, for assertions that read it back. */
function objectiveOf(call: WorkflowStartRequest): string {
  return String((call.args as { objective?: unknown }).objective ?? '')
}

/**
 * A session with real history, in `full` mode (the shape `/grok on` writes).
 *
 * The history is handed to the gate through `deriveMessages()` rather than by
 * replaying turn/step events: the gate reads exactly that method
 * (`src/history.ts` `collectHistory`), and the record surface it also reads
 * (`ownEvents`, for the mode record) stays the real one.
 */
function fullModeSession(id: string, seed = true): Session {
  const real = Session.create(id as never)
  setMode(real, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'full' })
  const messages = seed ? historyTurn('帮我查三家的价格', '已核验两家的报价，第三家待查。') : []
  return {
    id: real.id,
    header: real.header,
    ownEvents: () => real.ownEvents(),
    deriveMessages: () => messages,
    append: () => 0,
  } as unknown as Session
}

function payload(agent: FakeAgent, messages: UserMessage[], turn = 1, step = 1): Record<string, unknown> {
  const controller = new AbortController()
  return { agent, messages, turn, step, signal: controller.signal }
}

function passesThrough(messages: UserMessage[]) {
  return vi.fn(async () => ({ kind: 'enter' as const, messages }))
}

async function waitFor(predicate: () => boolean, label = 'condition'): Promise<void> {
  await vi.waitFor(() => {
    if (!predicate()) throw new Error(label)
  })
}

/** Resolve or reject, but never hang the suite on a gate that awaits the run. */
async function within<T>(promise: Promise<T>, ms = 2_000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`gate did not answer within ${ms} ms (it is waiting for the run)`)), ms)
      ;(timer as unknown as { unref?: () => void }).unref?.()
    }),
  ])
}

function applyWith(ctx: FakeContext, overrides: Record<string, unknown> = {}): void {
  apply(ctx as never, { mode: 'full', grokDefault: 'on', replan: true, ...overrides })
}

/* ------------------------------------------------------------------ tests -- */

describe('A1/A2/A5: a mid-run message is acknowledged at once and costs nothing in flight', () => {
  it('answers the receipt while the run is still live, and leaves the run alone', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent(fullModeSession('sess-channel-ack'))
    const first = [message('查一下三家报价并核验')]
    const started = await within(ctx.preStep()(payload(agent, first), passesThrough(first)))
    expect(started).toMatchObject({ kind: 'enter' })
    await waitFor(() => ctx.engine.startCalls.length === 1, 'the run started')

    // The run is deliberately left unsettled: if the gate awaited it, this call
    // would never return and `within` would fail instead of passing.
    const second = [message('再加一个任务：写成一页对比表')]
    const decision = await within(ctx.preStep()(payload(agent, second, 2), passesThrough(second)))

    expect(decision).toMatchObject({ kind: 'enter' })
    const text = (decision as { messages: { content: { text?: string }[] }[] }).messages
      .flatMap(item => item.content)
      .map(block => block.text ?? '')
      .join('\n')
    expect(text).toContain('并入')
    expect(text).toContain('波边界')

    // A5: the message did not cancel or duplicate the work in flight.
    expect(ctx.engine.runs[0]!.cancel).not.toHaveBeenCalled()
    expect(ctx.engine.startCalls).toHaveLength(1)
    // A2: nothing is waiting on the run's promise.
    expect(agent.whenIdle).not.toHaveBeenCalled()
  })

  it('A3: queues the demand for the planner together with the conversation', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent(fullModeSession('sess-channel-forward'))
    const first = [message('查一下三家报价并核验')]
    await within(ctx.preStep()(payload(agent, first), passesThrough(first)))
    await waitFor(() => ctx.engine.startCalls.length === 1, 'the run started')

    const second = [message('再加上第四家的报价')]
    await within(ctx.preStep()(payload(agent, second, 2), passesThrough(second)))

    const queue = steeringForSession('sess-channel-forward')
    expect(queue).toBeDefined()
    const pulled = queue!.take()
    expect(pulled.intents).toHaveLength(1)
    expect(pulled.intents[0]!.text).toContain('再加上第四家的报价')
    // The conversation is what makes "第四家" mean anything at the boundary.
    expect(pulled.intents[0]!.text).toContain('conversation before it')
    expect(pulled.intents[0]!.text).toContain('已核验两家的报价')
    // Consumed exactly once: a retried boundary child must not see it again.
    expect(queue!.take().intents).toHaveLength(0)
  })

  it('A4: a demand that never reached a boundary opens the next round', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent(fullModeSession('sess-channel-carry'))
    const first = [message('查一下三家报价并核验')]
    await within(ctx.preStep()(payload(agent, first), passesThrough(first)))
    await waitFor(() => ctx.engine.startCalls.length === 1, 'the run started')

    const second = [message('再加一个任务：写成一页对比表')]
    await within(ctx.preStep()(payload(agent, second, 2), passesThrough(second)))

    // The run ends before any boundary pulled the demand.
    ctx.engine.autoRun = true
    ctx.engine.runs[0]!.complete({
      schemaVersion: 1,
      status: 'completed',
      objective: objectiveOf(ctx.engine.startCalls[0]!),
      plan: { source: 'planner', tasks: [task('a')] },
      tasks: [],
      confirmed: [],
      incomplete: [],
      uncertain: [],
    })

    await waitFor(() => ctx.engine.startCalls.length === 2, 'the carried round started')
    const carried = objectiveOf(ctx.engine.startCalls[1]!)
    expect(carried).toContain('再加一个任务：写成一页对比表')
    expect(carried).toContain('[channel]')
    // The previous objective is carried as context, not as a demand to redo.
    expect(carried).toContain('do not redo it')
    // The queue is closed, so the carried round starts from a clean channel. The
    // carried round opens and closes its own channel as it settles, so the queue
    // being gone is what is awaited (asserting it at the instant the round starts
    // raced its own lifetime — the flake this replaces).
    await waitFor(
      () => steeringForSession('sess-channel-carry') === undefined,
      'the channel closed',
    )
  })

  it('A1: the conclusion of the round is delivered into the same session', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent(fullModeSession('sess-channel-deliver'))
    const first = [message('查一下三家报价并核验')]
    await within(ctx.preStep()(payload(agent, first), passesThrough(first)))
    await waitFor(() => ctx.engine.startCalls.length === 1, 'the run started')

    ctx.engine.autoRun = true
    ctx.engine.runs[0]!.complete({
      schemaVersion: 1,
      status: 'completed',
      objective: objectiveOf(ctx.engine.startCalls[0]!),
      plan: { source: 'planner', tasks: [task('a')] },
      tasks: [],
      confirmed: [],
      incomplete: [],
      uncertain: [],
    })

    await waitFor(() => agent.followups.length > 0, 'the report was delivered')
    const delivered = agent.followups.map(item => JSON.stringify(item.content)).join('\n')
    expect(delivered).toContain('核验')
  })
})

describe('explicit stop: the one message that may cancel', () => {
  it('cancels the live run and starts nothing', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent(fullModeSession('sess-channel-stop'))
    const first = [message('查一下三家报价并核验')]
    await within(ctx.preStep()(payload(agent, first), passesThrough(first)))
    await waitFor(() => ctx.engine.startCalls.length === 1, 'the run started')

    const stop = [message('停')]
    const decision = await within(ctx.preStep()(payload(agent, stop, 2), passesThrough(stop)))

    expect(decision).toMatchObject({ kind: 'enter' })
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalledWith(STEER_CANCEL_REASON)
    expect(ctx.engine.startCalls).toHaveLength(1)
    await waitFor(() => steeringForSession('sess-channel-stop') === undefined, 'the channel closed')
  })

  it('answers a bare stop with nothing running instead of admitting it as a task', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent(fullModeSession('sess-channel-idle-stop'))
    const stop = [message('取消')]
    const decision = await within(ctx.preStep()(payload(agent, stop), passesThrough(stop)))
    expect(decision).toMatchObject({ kind: 'enter' })
    const text = (decision as { messages: { content: { text?: string }[] }[] }).messages
      .flatMap(item => item.content)
      .map(block => block.text ?? '')
      .join('\n')
    expect(text).toContain('没有启动新的工作流')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })
})

describe('`replan` off: the channel is inert and the old path is unchanged', () => {
  it('still acknowledges at once (the background admission is not the channel) and starts one round', async () => {
    const ctx = new FakeContext()
    applyWith(ctx, { replan: false })
    const agent = new FakeAgent(fullModeSession('sess-channel-off'))
    const first = [message('查一下三家报价并核验')]
    await within(ctx.preStep()(payload(agent, first), passesThrough(first)))
    await waitFor(() => ctx.engine.startCalls.length === 1, 'the run started')
    expect(steeringForSession('sess-channel-off')).toBeUndefined()
  })
})

describe('team tier: the same channel under the front desk', () => {
  it('acknowledges a mid-run demand into the live plan instead of a second round', async () => {
    const ctx = new FakeContext()
    applyWith(ctx, { mode: 'triage' })
    const session = Session.create('sess-channel-team' as never)
    setMode(session, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'triage' })
    const agent = new FakeAgent(session)
    // Long, multi-step wording: the front desk classifies it as the team tier.
    const first = [message('帮我拆成几步：先查三家报价，再逐项核验，最后写成一页对比表，并把每一步的验收条件列清楚，同时说明风险和未确认的部分')]
    const opening = await within(ctx.preStep()(payload(agent, first), passesThrough(first)))
    expect(opening).toMatchObject({ kind: 'enter' })
    // Round-071: the team tier confirms the split first; the run starts on approval.
    const confirm = [message('确认')]
    const approved = await within(ctx.preStep()(payload(agent, confirm, 2), passesThrough(confirm)))
    expect(approved).toMatchObject({ kind: 'enter' })
    await waitFor(() => ctx.engine.startCalls.some(call => call.meta.name !== 'Front desk'), 'the run started')

    const second = [message('再加一条：把价格单位统一成人民币')]
    const decision = await within(ctx.preStep()(payload(agent, second, 2), passesThrough(second)))
    expect(decision).toMatchObject({ kind: 'enter' })

    const queue = steeringForSession('sess-channel-team')
    expect(queue).toBeDefined()
    expect(queue!.take().intents[0]!.text).toContain('把价格单位统一成人民币')
    // The run in flight is untouched.
    const workflowRun = ctx.engine.runs.find(run => run.meta.name !== 'Front desk')
    expect(workflowRun?.cancel).not.toHaveBeenCalled()
  })
})

describe('a split confirmation is not a demand for the plan in flight', () => {
  it('lets the normal path consume it instead of queueing "确认" into the live run', async () => {
    const ctx = new FakeContext()
    applyWith(ctx, { mode: 'triage' })
    const session = Session.create('sess-channel-captain' as never)
    setMode(session, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'triage' })
    const agent = new FakeAgent(session)
    // Same long wording as above: the front desk routes it to the team tier, so the
    // captain asks for the split and nothing is dispatched yet.
    const first = [message('帮我拆成几步：先查三家报价，再逐项核验，最后写成一页对比表，并把每一步的验收条件列清楚，同时说明风险和未确认的部分')]
    const opening = await within(ctx.preStep()(payload(agent, first), passesThrough(first)))
    expect(opening).toMatchObject({ kind: 'enter' })

    // A run of this session holds the channel open (that is exactly what the real
    // `runChannelRound` registers), while the captain's question is still pending.
    const live = openSteering('sess-channel-captain')
    try {
      const confirm = [message('确认')]
      const decided = await within(ctx.preStep()(payload(agent, confirm, 2), passesThrough(confirm)))
      expect(decided).toMatchObject({ kind: 'enter' })

      // Nothing was pushed into the live plan: "确认" is an answer to the captain,
      // not work to merge, and a demand would both lose the confirmation and spend
      // the run on one word.
      expect(steeringForSession('sess-channel-captain')!.take().intents).toHaveLength(0)
      // It dispatched the plan it confirms instead.
      await waitFor(
        () => ctx.engine.startCalls.some(call => call.meta.name !== 'Front desk'),
        'the confirmed run started',
      )
      const text = (decided as { messages: { content: { text?: string }[] }[] }).messages
        .flatMap(item => item.content)
        .map(block => block.text ?? '')
        .join('\n')
      expect(text).toContain('队长确认')
    } finally {
      closeSteering(live.token)
    }
  })
})
