/**
 * Issue #22 Phase 1 — dialogue reliability (P0-1 … P0-4).
 *
 * One describe per P0 item, all against the real `Session` the host persists, so a
 * transcript assertion here means "the user can see it after a reload", not "a fake
 * recorded a call". The engine is a fake on purpose: no model credentials are
 * involved, which is why every case in this file is *unit/integration* evidence and
 * never GUI evidence.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { REPORT_BEGIN, REPORT_END } from '../src/answer.js'
import { resolveConfig } from '../src/config.js'
import { DELIVERY_RECORD } from '../src/records.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import { callerTask, execution, task, verification } from './fixtures.js'
import { runWorkflowScript } from './helpers.js'

/* ------------------------------------------------------------------ engine -- */

interface EngineResult { value: unknown; stopReason: string; agentsStarted: number }

class FakeRun {
  readonly id = 'run-phase1'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private settle!: (value: EngineResult) => void
  readonly cancel = vi.fn((_reason?: string) => {
    this.settleCancelled(undefined)
  })

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.settle = resolve })
  }

  complete(value: unknown): void {
    this.settle({ value, stopReason: 'completed', agentsStarted: 2 })
  }

  /** Settle as cancelled, optionally with the partial value the engine produced. */
  settleCancelled(value: unknown): void {
    this.settle({ value: value ?? null, stopReason: 'cancelled', agentsStarted: 1 })
  }

  fail(stopReason: string, error?: string): void {
    this.settle({ value: null, stopReason, agentsStarted: 1, ...error === undefined ? {} : { error } } as EngineResult)
  }
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  /** Run the script immediately with scripted children, so no model is involved. */
  autoRun = false
  startError: Error | undefined
  /** When true the run never settles on its own (for deadline/unload/cancel cases). */
  hang = false

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    if (this.startError !== undefined) throw this.startError
    const run = new FakeRun(request)
    this.runs.push(run)
    request.signal?.addEventListener('abort', () => run.cancel('signal aborted'), { once: true })
    if (this.autoRun && !this.hang) {
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        // The front-desk single call (t52) returns a string answer.
        if (options.label === 'quick-worker') return 'quick answer'
        if (options.label === 'grok-planner') return { tasks: [callerTask('a')] }
        if (options.label.startsWith('grok-worker')) return execution('work done')
        if (options.label.startsWith('grok-verifier')) return verification(task('a'))
        throw new Error(`unexpected label ${options.label}`)
      })
      run.complete(result.report ?? result)
    }
    return run
  }
}

/* ----------------------------------------------------------------- context -- */

type Handler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

class FakeContext {
  readonly warnings: string[] = []
  readonly handlers = new Map<string, Handler>()
  readonly promptSections: unknown[] = []
  readonly registeredTools: unknown[] = []
  readonly engine = new FakeEngine()
  readonly disposers: (() => Promise<void> | void)[] = []
  readonly tools = { register: (tool: unknown) => { this.registeredTools.push(tool); return () => {} } }
  readonly systemPrompt = {
    section: (section: unknown) => { this.promptSections.push(section); return () => {} },
    getSectionOrder: () => 2600,
  }
  readonly workflowEngine = this.engine
  readonly logger = () => ({ warn: (message: string) => { this.warnings.push(message) } })

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

  async dispose(): Promise<void> {
    for (const disposer of this.disposers.splice(0).reverse()) await disposer()
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

function session(id: string): Session {
  return Session.create(id as never)
}

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

function payload(
  agent: FakeAgent,
  messages: UserMessage[],
  signal: AbortSignal = new AbortController().signal,
): Record<string, unknown> {
  return { agent, messages, turn: 1, step: 1, signal }
}

/** The default waterfall decision: the claimed batch plus runtime context. */
function nextWith(messages: UserMessage[]): () => Promise<unknown> {
  return async () => ({ kind: 'enter', messages })
}

/** Text of the answer the gate entered: the last message of the decision. */
function answerOf(decision: Decision): string {
  const messages = decision.messages ?? []
  expect(messages.length).toBeGreaterThan(0)
  return textOf(messages[messages.length - 1]!)
}

function textOf(message: UserMessage): string {
  return message.content
    .map(block => (block as { type: string; text?: string }).type === 'text' ? (block as { text?: string }).text ?? '' : '')
    .join('\n')
}

function texts(session: Session): string[] {
  return session.deriveMessages().map(message => textOf(message as unknown as UserMessage))
}

function recordsOf(session: Session, type: string): unknown[] {
  return session.ownEvents()
    .map(event => pluginRecordOf(event))
    .filter(record => record !== undefined && record.type === type)
    .map(record => record!.data)
}

interface Decision { kind: string; messages?: UserMessage[] }

/**
 * Apply {@link Decision} the way `AgentLoop.step()` does.
 *
 * `dsh-agent-loop/lib/index.js` `step()` appends every `decision.messages` entry whose
 * source is not `runtime-context` as a `user/message` session event, then appends the
 * projected runtime context. Replaying that here is what makes a transcript
 * assertion meaningful: the decision is the only writer.
 */
function commit(session: Session, decision: Decision): void {
  for (const message of decision.messages ?? []) {
    const source = (message.source as { kind?: string } | undefined)?.kind
    if (source === 'runtime-context') continue
    session.append('user/message', message, { surfaceOp: 'append' })
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    if (!predicate()) throw new Error('condition not met')
  })
}

afterEach(() => {
  vi.useRealTimers()
})

/* ------------------------------------------------------------------- P0-1 -- */

describe('P0-1: the user’s own message survives in the transcript', () => {
  it('enters the claimed message and the report, once each, in that order', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'full' })
    const live = session('sess-p01-in-turn')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('把登录接口改成 JWT 校验')]

    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    commit(live, decision)

    const derived = live.deriveMessages()
    // The object the loop claimed is the object that was entered: id, source and
    // text are the user's, not a re-created copy.
    expect(decision.messages![0]!.id).toBe(claimed[0]!.id)
    expect((decision.messages![0]!.source as { kind?: string }).kind).toBe('user')
    expect(textOf(decision.messages![0]!)).toBe('把登录接口改成 JWT 校验')
    // Exactly one occurrence: `enter.messages` is the only writer on this path, and
    // the gate must not also call session.append() for the same message.
    expect(derived.filter(message => textOf(message as unknown as UserMessage) === '把登录接口改成 JWT 校验')).toHaveLength(1)
    // The report follows the original message and does not replace it.
    expect(textOf(derived[0] as unknown as UserMessage)).toBe('把登录接口改成 JWT 校验')
    const last = textOf(derived[derived.length - 1] as unknown as UserMessage)
    expect(last).toContain(REPORT_BEGIN)
    expect(last).toContain(REPORT_END)
    expect(derived.length).toBe(decision.messages!.length)
  })

  it('keeps the original message when the message is refused before any run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full' })
    const live = session('sess-p01-refusal')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('x'.repeat(20_000))]

    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    commit(live, decision)

    expect(decision.kind).toBe('enter')
    expect(textOf(decision.messages![0]!)).toBe('x'.repeat(20_000))
    expect(answerOf(decision)).toContain('workflow objective limit')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('survives a reload: the transcript replays the original message then the report', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'full' })
    const live = session('sess-p01-reload')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('重放后仍然要看到我这句话')]

    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    commit(live, decision)

    const reopened = Session.create('sess-p01-reload' as never, live.snapshotEvents())
    const replayed = texts(reopened)
    expect(replayed[0]).toBe('重放后仍然要看到我这句话')
    expect(replayed[replayed.length - 1]).toContain(REPORT_BEGIN)
    expect(replayed.filter(text => text === '重放后仍然要看到我这句话')).toHaveLength(1)
    // Replay is stable: reading the projection twice cannot duplicate it either.
    expect(texts(reopened)).toEqual(replayed)
  })

  it('relay: the plugin commits the claimed message itself, because the step is rejected', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { answerStrategy: 'relay', mode: 'full' })
    const live = session('sess-p01-relay')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('relay 也要留下原话')]

    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    // A rejected step commits nothing, so the plugin wrote the message itself.
    expect(decision).toEqual({ kind: 'reject' })
    expect(texts(live)).toEqual(['relay 也要留下原话'])
    await waitFor(() => agent.followups.length === 1)
    // The answer arrives in its own turn and is owned by the plugin, so it can never
    // be routed a second time.
    expect(textOf(agent.followups[0]!)).toContain(REPORT_BEGIN)
    expect((agent.followups[0]!.source as { kind?: string }).kind).toBe('grok-workflow')
  })

  it('append: the original message and the report are both in the durable log', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { answerStrategy: 'append', mode: 'full' })
    const live = session('sess-p01-append')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('append 也要留下原话')]

    await ctx.preStep()(payload(agent, claimed), nextWith(claimed))
    await waitFor(() => texts(live).some(text => text.includes('COMPLETED')))
    const derived = texts(live)
    expect(derived[0]).toBe('append 也要留下原话')
    expect(derived[derived.length - 1]).toContain('COMPLETED')
    expect(derived.filter(text => text === 'append 也要留下原话')).toHaveLength(1)
  })

  it('a downstream refusal is not claimed, so the batch stays routable', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full' })
    const live = session('sess-p01-downstream')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('downstream says no')]

    const decision = await ctx.preStep()(payload(agent, claimed), async () => ({ kind: 'reject' })) as Decision
    expect(decision).toEqual({ kind: 'reject' })
    expect(ctx.engine.startCalls).toHaveLength(0)
    expect(recordsOf(live, DELIVERY_RECORD).some(
      record => (record as { phase?: string; outcome?: string }).outcome === 'pre-step-refused',
    )).toBe(true)
  })
})

/* ------------------------------------------------------------------- P0-2 -- */

/** Drive one front-desk conversation: an ambiguous request, then the answer. */
async function askThenAnswer(options: {
  ctx: FakeContext
  live: Session
  ambiguous?: string
  answer: string
}): Promise<{ asked: string, answered: string, decision: Decision }> {
  const { ctx, live, answer } = options
  const ambiguous = options.ambiguous ?? '改一下那个'
  const agent = new FakeAgent(live)
  const first = await ctx.preStep()(payload(agent, [userMessage(ambiguous)]), nextWith([])) as Decision
  commit(live, first)
  const second = await ctx.preStep()(payload(agent, [userMessage(answer)]), nextWith([])) as Decision
  commit(live, second)
  return { asked: answerOf(first), answered: answerOf(second), decision: second }
}

describe('P0-2: a confirmation answer keeps the original request', () => {
  it('asks before running when the request is ambiguous', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage' })
    const live = session('sess-p02-ask')
    const agent = new FakeAgent(live)
    const decision = await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([])) as Decision
    expect(decision.kind).toBe('enter')
    expect(answerOf(decision)).toContain('简单 / 团队')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('hands the quick worker the original request together with the choice', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage' })
    const live = session('sess-p02-fast')
    const { answered } = await askThenAnswer({ ctx, live, ambiguous: '改一下那个', answer: '简单' })

    await waitFor(() => ctx.engine.startCalls.length === 1)
    const script = ctx.engine.startCalls[0]!.script
    // The prompt travels inside the guest script (singleCallScript), so the script
    // text is what the child receives.
    expect(script).toContain('改一下那个')
    expect(script).toContain('用户选择简单模式')
    expect(script).toContain('原始任务')
    // The choice word is a confirmation, never an objective of its own.
    expect(script).not.toContain('Request:\\n简单')
    expect(answered).toContain('快手档')
    expect(answered).toContain('quick answer')
  })

  it('hands the team the original request together with the choice', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage' })
    const live = session('sess-p02-team')
    const { answered } = await askThenAnswer({ ctx, live, ambiguous: '改一下那个', answer: '团队' })

    await waitFor(() => ctx.engine.startCalls.length === 1)
    const objective = String((ctx.engine.startCalls[0]!.args as { objective?: string }).objective ?? '')
    expect(objective).toContain('改一下那个')
    expect(objective).toContain('用户选择团队模式')
    expect(answered).toContain('COMPLETED')
  })

  it('states that the confirmation expired instead of guessing the task', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage' })
    const live = session('sess-p02-expired')
    const agent = new FakeAgent(live)
    await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([]))

    // Past the ten-minute TTL: the entry is still in memory but must not be used.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 11 * 60_000)
    const decision = await ctx.preStep()(payload(agent, [userMessage('简单')]), nextWith([])) as Decision
    const answer = answerOf(decision)

    expect(answer).toContain('过期')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('starts nothing when the pending question was lost by a reload', async () => {
    const first = new FakeContext()
    apply(first as never, { mode: 'triage' })
    const live = session('sess-p02-reload')
    await first.preStep()(payload(new FakeAgent(live), [userMessage('改一下那个')]), nextWith([]))

    // A fresh plugin instance is what a reload gives you: the Map is gone.
    const second = new FakeContext()
    apply(second as never, { mode: 'triage' })
    const decision = await second.preStep()(
      payload(new FakeAgent(live), [userMessage('简单')]),
      nextWith([]),
    ) as Decision
    expect(answerOf(decision)).toContain('没有待回答的分流问题')
    expect(second.engine.startCalls).toHaveLength(0)
  })

  it('never lets another session answer this session’s question', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage' })
    const one = session('sess-p02-one')
    const two = session('sess-p02-two')
    await ctx.preStep()(payload(new FakeAgent(one), [userMessage('改一下那个')]), nextWith([]))

    // Session two has no pending question of its own.
    const other = await ctx.preStep()(payload(new FakeAgent(two), [userMessage('团队')]), nextWith([])) as Decision
    expect(answerOf(other)).toContain('没有待回答的分流问题')
    expect(ctx.engine.startCalls).toHaveLength(0)

    // ...and session one can still answer its own question.
    const own = await ctx.preStep()(payload(new FakeAgent(one), [userMessage('团队')]), nextWith([])) as Decision
    await waitFor(() => ctx.engine.startCalls.length === 1)
    expect(String((ctx.engine.startCalls[0]!.args as { objective?: string }).objective)).toContain('改一下那个')
    expect(answerOf(own)).toContain('COMPLETED')
  })

  it('consumes a pending question once, so a repeated answer cannot start a second run', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage' })
    const live = session('sess-p02-once')
    const agent = new FakeAgent(live)
    await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([]))
    await ctx.preStep()(payload(agent, [userMessage('团队')]), nextWith([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)

    const again = await ctx.preStep()(payload(agent, [userMessage('团队')]), nextWith([])) as Decision
    expect(answerOf(again)).toContain('没有待回答的分流问题')
    expect(ctx.engine.startCalls).toHaveLength(1)
  })

  it('says the question is void when the user answers something else', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage' })
    const live = session('sess-p02-unused')
    const agent = new FakeAgent(live)
    await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([]))
    const decision = await ctx.preStep()(
      payload(agent, [userMessage('算了，帮我把 README 的错别字修一下')]),
      nextWith([]),
    ) as Decision
    expect(answerOf(decision)).toContain('作废')
  })
})

/* ------------------------------------------------------------------- P0-3 -- */

describe('P0-3: every internal error leaves a user-visible terminal state', () => {
  it('answers a classification failure instead of an empty turn', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full' })
    const exploding = {
      id: 'sess-p03-explode',
      header: {},
      ownEvents(): unknown[] { throw new Error('records unavailable') },
      deriveMessages(): unknown[] { return [] },
      append(): number { throw new Error('records unavailable') },
    }
    const agent = { session: exploding, whenIdle: async () => {}, followup: () => {} }
    const claimed = [userMessage('分类失败也要有回复')]
    const decision = await ctx.preStep()(payload(agent as never, claimed), nextWith([])) as Decision

    expect(decision.kind).toBe('enter')
    expect(textOf(decision.messages![0]!)).toBe('分类失败也要有回复')
    const notice = textOf(decision.messages![decision.messages!.length - 1]!)
    expect(notice).toContain('no workflow result exists')
    expect(notice).toContain('records unavailable')
    expect(ctx.warnings.some(warning => warning.includes('gate classification failed'))).toBe(true)
  })

  it('answers when answering in-turn throws, and keeps the claimed message', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full' })
    const live = session('sess-p03-throw')
    const agent = new FakeAgent(live)
    // A batch classification can read but whose gate entry cannot be built: this is
    // the internal fault the `answerInTurn` catch exists for, and it must produce a
    // notice rather than an empty turn.
    const claimed = [userMessage('原始消息')]
    const hostile = new Proxy(claimed, {
      get(target, property, receiver) {
        if (property === 'map') throw new Error('entry unavailable')
        return Reflect.get(target, property, receiver)
      },
    })
    const decision = await ctx.preStep()(payload(agent, hostile), nextWith([])) as Decision

    expect(decision.kind).toBe('enter')
    expect(textOf(decision.messages![0]!)).toBe('原始消息')
    const notice = answerOf(decision)
    expect(notice).toContain('no workflow result exists')
    expect(notice).toContain('entry unavailable')
    expect(ctx.warnings.some(warning => warning.includes('could not answer in-turn'))).toBe(true)
  })

  it('states a quick-tier failure and never celebrates it', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage' })
    ctx.engine.startError = new Error('provider unreachable')
    const live = session('sess-p03-fast')
    const agent = new FakeAgent(live)
    const decision = await ctx.preStep()(
      payload(agent, [userMessage('读一下 src/index.ts 第 12 行')]),
      nextWith([]),
    ) as Decision
    const text = answerOf(decision)
    expect(text).toContain('could not answer')
    expect(text).toContain('provider unreachable')
    expect(text).not.toContain('COMPLETED')
  })

  it('never prints a secret that the failure carried', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full' })
    const live = session('sess-p03-secret')
    const agent = new FakeAgent(live)
    ctx.engine.startError = new Error('auth failed: api_key=sk-live-9f8e7d6c5b4a3210')
    const decision = await ctx.preStep()(payload(agent, [userMessage('跑一下工作流')]), nextWith([])) as Decision
    const text = textOf(decision.messages![decision.messages!.length - 1]!)
    expect(text).not.toContain('sk-live-9f8e7d6c5b4a3210')
    expect(text).toContain('[REDACTED]')
    for (const warning of ctx.warnings) expect(warning).not.toContain('sk-live-9f8e7d6c5b4a3210')
  })

  it('does not re-enter the gate or start a second workflow to report an error', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full' })
    ctx.engine.startError = new Error('engine refused')
    const live = session('sess-p03-reentry')
    const agent = new FakeAgent(live)
    const handler = vi.fn(ctx.preStep())

    await handler(payload(agent, [userMessage('只跑一次')]), nextWith([]))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(agent.followups).toHaveLength(0)
    // The failure is a notice, so the batch must stay routable (phase `failed`).
    expect(recordsOf(live, DELIVERY_RECORD).some(
      record => (record as { phase?: string }).phase === 'failed',
    )).toBe(true)
  })

  it('tells a cancellation apart from a provider failure', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full' })
    ctx.engine.hang = true
    const live = session('sess-p03-abort')
    const agent = new FakeAgent(live)
    const controller = new AbortController()
    const pending = ctx.preStep()(payload(agent, [userMessage('中途停止')], controller.signal), nextWith([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    controller.abort()
    const decision = await pending as Decision

    // The host owns an aborted turn: nothing entered into it would ever be read.
    expect(decision).toEqual({ kind: 'reject' })
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    const outcomes = recordsOf(live, DELIVERY_RECORD).map(record => (record as { outcome?: string }).outcome)
    expect(outcomes).toContain('aborted')
    // A stop is not a provider fault, and it is not filed as one.
    expect(ctx.warnings.some(warning => warning.includes('engine-error'))).toBe(false)
  })
})

/* ------------------------------------------------------------------- P0-4 -- */

describe('P0-4: cancellation reaches a terminal state', () => {
  const config = (): ReturnType<typeof resolveConfig> => resolveConfig({ maxConcurrency: 1, timeoutMs: 60_000 })

  function agentOf(live: Session): Record<string, unknown> {
    return { session: live, whenIdle: async () => {}, followup: () => {}, steer: () => {} }
  }

  it('launches nothing when the signal is already aborted', async () => {
    const ctx = new FakeContext()
    const controller = new AbortController()
    controller.abort()
    const outcome = await runWorkflow({
      ctx: ctx as never,
      config: config(),
      state: createActiveState(),
      logger: { warn: () => {} },
      agent: agentOf(session('sess-p04-pre')) as never,
      objective: 'do the thing',
      failureMode: 'report',
      signals: [controller.signal],
    })
    expect(ctx.engine.startCalls).toHaveLength(0)
    expect(outcome.ok).toBe(false)
    expect(outcome.cause).toBe('cancelled')
    expect(outcome.report.errors[0]?.category).toBe('cancelled')
    expect(outcome.report.errors[0]?.message).toContain('before it started')
  })

  it('cancels the running engine once and reports the stop, without a retry', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    const controller = new AbortController()
    const pending = runWorkflow({
      ctx: ctx as never,
      config: config(),
      state: createActiveState(),
      logger: { warn: () => {} },
      agent: agentOf(session('sess-p04-mid')) as never,
      objective: 'do the thing',
      failureMode: 'report',
      signals: [controller.signal],
    })
    await waitFor(() => ctx.engine.runs.length === 1)
    controller.abort()
    const outcome = await pending

    // The plugin asks the engine to cancel, and the engine also honours the run's
    // own signal: what matters is that the call exists and that no second run starts.
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(outcome.ok).toBe(false)
    expect(outcome.report.status).toBe('failed')
    expect(outcome.report.errors.at(-1)?.phase).toBe('Cancelled')
    expect(outcome.report.errors.at(-1)?.category).toBe('cancelled')
    expect(outcome.report.incomplete[0]?.category).toBe('cancelled')
  })

  it('keeps the tasks that had already been verified when the run is stopped', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    const controller = new AbortController()
    const activeState = createActiveState()
    const objective = 'do the thing'
    const limitsConfig = config()
    const pending = runWorkflow({
      ctx: ctx as never,
      config: limitsConfig,
      state: activeState,
      logger: { warn: () => {} },
      agent: agentOf(session('sess-p04-partial')) as never,
      objective,
      failureMode: 'report',
      signals: [controller.signal],
    })
    await waitFor(() => ctx.engine.runs.length === 1)

    // What a real engine returns when the stop lands between two tasks: task `a` is
    // verified, task `b` never started.
    const plan = [task('a'), task('b')]
    const partial = {
      schemaVersion: 'grok-workflow/v1',
      // The engine's own value: one task verified, one not started.
      status: 'partial',
      objective,
      plan: { source: 'caller', tasks: plan },
      tasks: [
        {
          id: 'a',
          title: 'Task a',
          objective: 'Do a',
          expectedOutput: 'Output a',
          acceptanceCriteria: ['a works'],
          context: '',
          constraints: [],
          writesPaths: null,
          status: 'verified',
          attempts: [{ attempt: 1, status: 'verified', execution: execution('work done'), verification: verification(plan[0]!), passed: true }],
          evidence: verification(plan[0]!).criteria,
        },
        {
          id: 'b',
          title: 'Task b',
          objective: 'Do b',
          expectedOutput: 'Output b',
          acceptanceCriteria: ['b works'],
          context: '',
          constraints: [],
          writesPaths: null,
          status: 'failed',
          attempts: [],
          error: '',
        },
      ],
      confirmed: [],
      incomplete: [],
      errors: [],
      uncertainties: [],
      routes: [],
      routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      // A report is only trusted when its limits echo the configuration that ran
      // (assertWorkflowReport refuses anything else), so the fixture echoes it.
      limits: {
        maxConcurrency: limitsConfig.maxConcurrency,
        maxRetries: limitsConfig.maxRetries,
        maxTasks: limitsConfig.maxTasks,
        // The report validator only trusts an agent budget inside the range the
        // planner budget allows (`report.ts`: min-max for this task count).
        maxTotalAgents: 12,
        timeoutMs: limitsConfig.timeoutMs,
      },
    }
    ctx.engine.runs[0]!.settleCancelled(partial)
    const outcome = await pending

    expect(outcome.ok).toBe(false)
    // Never "completed": nothing may read a stop as a finished run.
    expect(outcome.report.status).toBe('partial')
    // Completed work is kept, with its evidence.
    expect(outcome.report.tasks[0]!.status).toBe('verified')
    expect(outcome.report.tasks[0]!.attempts[0]!.execution?.summary).toBe('work done')
    // Unfinished work is labelled, not silently dropped.
    expect(outcome.report.tasks[1]!.status).toBe('failed')
    expect(outcome.report.tasks[1]!.error).toContain('not started')
    // Named exactly once, and the stop — not a quality failure — is the category.
    expect(outcome.report.incomplete.map(item => item.taskId)).toEqual(['b'])
    expect(outcome.report.incomplete[0]!.category).toBe('cancelled')
    expect(outcome.report.errors.at(-1)?.category).toBe('cancelled')
  })

  it('turns a deadline into its own terminal state (regression)', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    const outcome = await runWorkflow({
      ctx: ctx as never,
      config: resolveConfig({ maxConcurrency: 1, timeoutMs: 1_000 }),
      state: createActiveState(),
      logger: { warn: () => {} },
      agent: agentOf(session('sess-p04-timeout')) as never,
      objective: 'do the thing',
      failureMode: 'report',
    })
    expect(outcome.cause).toBe('timeout')
    expect(outcome.report.errors[0]?.phase).toBe('Timeout')
    expect(outcome.report.errors[0]?.category).toBe('infrastructure')
  })

  it('names an unload as an unload, not as a caller cancellation', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    const state = createActiveState()
    const pending = runWorkflow({
      ctx: ctx as never,
      config: config(),
      state,
      logger: { warn: () => {} },
      agent: agentOf(session('sess-p04-unload')) as never,
      objective: 'do the thing',
      failureMode: 'report',
    })
    await waitFor(() => ctx.engine.runs.length === 1)
    state.disposed = true
    state.unloadedAt = Date.now()
    state.controller.abort('test unload')
    const outcome = await pending
    expect(outcome.cause).toBe('unloaded')
    expect(outcome.report.errors.at(-1)?.phase).toBe('Unloaded')
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
  })
})
