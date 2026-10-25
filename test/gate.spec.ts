import { describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { REPORT_BEGIN, REPORT_END } from '../src/answer.js'
import { execution, task, verification } from './fixtures.js'
import { runWorkflowScript } from './helpers.js'
import { ROUTING_RECORD } from '../src/records.js'

/* ------------------------------------------------------------------ engine -- */

interface EngineResult {
  value: unknown
  stopReason: string
  agentsStarted: number
}

class FakeRun {
  readonly id = 'run-gate'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private resolve!: (value: EngineResult) => void
  readonly cancel = vi.fn((_reason?: string) => {
    this.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.resolve = resolve })
  }

  complete(value: unknown): void {
    this.resolve({ value, stopReason: 'completed', agentsStarted: 2 })
  }

  fail(stopReason: string, error?: string): void {
    this.resolve({ value: null, stopReason, agentsStarted: 1, ...error === undefined ? {} : { error } } as EngineResult)
  }
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  autoRun = false
  startError: Error | undefined

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    if (this.startError !== undefined) throw this.startError
    const run = new FakeRun(request)
    this.runs.push(run)
    if (this.autoRun) {
      const tasks = [(request.args as { tasks?: unknown }).tasks].flat().filter(Boolean)
      const plan = tasks.length > 0 ? tasks as ReturnType<typeof task>[] : [task('a')]
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        if (options.label.startsWith('grok-worker-')) return execution('work done')
        if (options.label.startsWith('grok-verifier-')) return verification(plan[0]!)
        if (options.label === 'grok-planner') return { tasks: plan }
        throw new Error(`unexpected label ${options.label}`)
      })
      run.complete(result.report)
    }
    return run
  }
}

/* ------------------------------------------------------------------ context -- */

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

/* -------------------------------------------------------------------- agent -- */

interface FakeAgentOptions {
  session?: unknown
  header?: { origin?: string; delegationDepth?: number }
}

class FakeAgent {
  readonly session: unknown
  readonly followups: UserMessage[] = []
  followupError: Error | undefined
  readonly followup = vi.fn((message: UserMessage) => {
    if (this.followupError !== undefined) throw this.followupError
    this.followups.push(message)
  })
  readonly whenIdle = vi.fn(async () => {})

  constructor(options: FakeAgentOptions = {}) {
    this.session = options.session ?? new FakeSession({ header: options.header ?? {} })
  }
}

/** Minimal session surface used by the gate: header, id, history, records. */
class FakeSession {
  readonly id = 'sess-fake'
  readonly header: { origin?: string; delegationDepth?: number; agentPreset?: string }
  readonly messages: unknown[]
  appendError: Error | undefined

  constructor(options: { header: { origin?: string; delegationDepth?: number; agentPreset?: string }; messages?: unknown[] }) {
    this.header = options.header
    this.messages = options.messages ?? []
  }

  ownEvents(): unknown[] {
    return []
  }

  deriveMessages(): unknown[] {
    return this.messages
  }

  append(): number {
    if (this.appendError !== undefined) throw this.appendError
    return 0
  }
}

/** Session that records surface appends, used by the append-strategy tests. */
class RecordingSession {
  readonly id = 'sess-recording'
  readonly header = {}
  readonly appends: { type: string; data: unknown; intent: unknown }[] = []
  appendError: Error | undefined

  ownEvents(): unknown[] {
    return []
  }

  deriveMessages(): unknown[] {
    return []
  }

  append(type: string, data: unknown, intent?: unknown): number {
    if (this.appendError !== undefined) throw this.appendError
    this.appends.push({ type, data, intent })
    return this.appends.length
  }
}

/* ------------------------------------------------------------------ helpers -- */

function assistantMessage(text: string): UserMessage {
  return createAssistantMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'model', provider: 'p', model: 'm' } as never,
  }) as unknown as UserMessage
}

function userMessage(text: string, kind: 'user' | 'runtime-context' | 'grok-workflow' = 'user'): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind } as never }) as UserMessage
}

function payload(agent: FakeAgent, messages: UserMessage[], turn = 1, step = 1): Record<string, unknown> {
  return { agent, messages, turn, step, signal: new AbortController().signal }
}

function passingNext(messages: UserMessage[]) {
  return vi.fn(async () => ({ kind: 'enter' as const, messages }))
}

function report(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const plan = [task('a')]
  return {
    schemaVersion: 1,
    status: 'completed',
    objective: 'do the thing',
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
    ...overrides,
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    if (!predicate()) throw new Error('condition not met')
  })
}

/* -------------------------------------------------------------------- tests -- */

describe('mandatory entry gate', () => {
  it('passes an empty batch through so a tool continuation never starts a run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    const next = passingNext([])
    const decision = await ctx.preStep()(payload(agent, []), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(decision).toEqual({ kind: 'enter', messages: [] })
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('passes context-only batches through', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    const context = [userMessage('runtime context', 'runtime-context')]
    const next = passingNext(context)
    await ctx.preStep()(payload(agent, context), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('passes the plugin relay message through instead of starting a second workflow', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    const relay = [userMessage('report', 'grok-workflow')]
    const next = passingNext(relay)
    await ctx.preStep()(payload(agent, relay), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('passes subagent steps through so recursion is impossible', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent({ header: { origin: 'subagent', delegationDepth: 1 } })
    const messages = [userMessage('child prompt')]
    const next = passingNext(messages)
    await ctx.preStep()(payload(agent, messages), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('rejects an admitted user message and starts exactly one run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    const messages = [userMessage('summarize the repo')]
    const next = passingNext(messages)
    const decision = await ctx.preStep()(payload(agent, messages), next)
    expect(decision).toEqual({ kind: 'reject' })
    expect(next).not.toHaveBeenCalled()
    await waitFor(() => ctx.engine.startCalls.length === 1)
    expect(ctx.engine.startCalls[0]!.args).toMatchObject({ objective: expect.stringContaining('summarize the repo') })
  })

  it('routes one user message only once even when pre-step fires again', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const session = Session.create('sess-dedupe' as never)
    const agent = new FakeAgent({ session })
    const messages = [userMessage('same message')]
    const first = await ctx.preStep()(payload(agent, messages), passingNext(messages))
    expect(first).toEqual({ kind: 'reject' })
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const replay = passingNext(messages)
    const second = await ctx.preStep()(payload(agent, messages, 2, 1), replay)
    expect(replay).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ kind: 'enter', messages })
    expect(ctx.engine.startCalls).toHaveLength(1)
  })

  it('serializes a second message instead of running it concurrently', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    await ctx.preStep()(payload(agent, [userMessage('first')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    await ctx.preStep()(payload(agent, [userMessage('second')], 2, 1), passingNext([]))
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(ctx.engine.startCalls).toHaveLength(1)
    ctx.engine.runs[0]!.complete(report())
    await waitFor(() => ctx.engine.startCalls.length === 2)
    expect(ctx.engine.startCalls[1]!.args).toMatchObject({ objective: expect.stringContaining('second') })
  })

  it('refuses a message when the per-agent queue is full, without bypassing', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxQueuedMessages: 1 })
    const agent = new FakeAgent()
    await ctx.preStep()(payload(agent, [userMessage('first')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const next = passingNext([])
    const decision = await ctx.preStep()(payload(agent, [userMessage('second')], 2, 1), next)
    expect(decision).toEqual({ kind: 'reject' })
    expect(next).not.toHaveBeenCalled()
    expect(ctx.engine.startCalls).toHaveLength(1)
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('queued message')
  })

  it('returns from the listener without waiting for the agent to become idle', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxQueuedMessages: 1 })
    const agent = new FakeAgent()
    let releaseIdle: (() => void) | undefined
    agent.whenIdle.mockImplementation(() => new Promise<void>(resolve => { releaseIdle = resolve }))
    await ctx.preStep()(payload(agent, [userMessage('first')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const blocked = ctx.preStep()(payload(agent, [userMessage('second')], 2, 1), passingNext([]))
    const decision = await Promise.race([
      blocked,
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 50)),
    ])
    expect(decision).toEqual({ kind: 'reject' })
    expect(releaseIdle).toBeDefined()
    releaseIdle?.()
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('queued message')
  })

  it('reads history when the run starts so a queued follow-up sees the previous answer', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const session = new FakeSession({ header: {} })
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('first request')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    // A second message is admitted while the first run is still open.
    await ctx.preStep()(payload(agent, [userMessage('second request')], 2, 1), passingNext([]))
    // The first answer becomes durable conversation before the second run starts.
    session.messages.push(userMessage('first request'), assistantMessage('FIRST ANSWER BODY'))
    ctx.engine.runs[0]!.complete(report({ objective: 'first request' }))
    await waitFor(() => ctx.engine.startCalls.length === 2)
    const objective = String((ctx.engine.startCalls[1]!.args as { objective: string }).objective)
    expect(objective).toContain('Conversation so far')
    expect(objective).toContain('FIRST ANSWER BODY')
    expect(objective).toContain('Current request:')
    expect(objective).toContain('second request')
  })

  it('refuses a message explicitly when the queue is full and never retries it on its own', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxQueuedMessages: 1 })
    const agent = new FakeAgent({ session: Session.create('sess-refusal' as never) })
    await ctx.preStep()(payload(agent, [userMessage('first')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const refused = [userMessage('second')]
    await ctx.preStep()(payload(agent, refused, 2, 1), passingNext([]))
    expect(ctx.engine.startCalls).toHaveLength(1)
    ctx.engine.runs[0]!.complete(report())
    await waitFor(() => agent.followups.length >= 1)
    await new Promise(resolve => setTimeout(resolve, 5))
    // The host claims the rejected batch and does not give it back (V-2), so
    // nothing retries on its own: the dispatch below is a client re-send of the
    // same message, which is the only path that can start the run.
    const retried = passingNext(refused)
    const decision = await ctx.preStep()(payload(agent, refused, 2, 1), retried)
    expect(decision).toEqual({ kind: 'reject' })
    expect(retried).not.toHaveBeenCalled()
    await waitFor(() => ctx.engine.startCalls.length === 2)
  })

  it('refuses a message with no text instead of burning a workflow run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent({ session: Session.create('sess-empty' as never) })
    const decision = await ctx.preStep()(payload(agent, [userMessage('   ')]), passingNext([]))
    expect(decision).toEqual({ kind: 'reject' })
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('no text to route')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('fails loading when the hook is missing and the gate is required', () => {
    const ctx = new FakeContext()
    // A runtime that exposes everything except the pre-step registration hook.
    const withoutHook = new Proxy(ctx, {
      get: (target, property, receiver) => property === 'on' ? undefined : Reflect.get(target, property, receiver),
    })
    expect(() => apply(withoutHook as never, { gateRequired: true })).toThrow(/agent\/pre-step/)
  })

  it('writes a redacted routing ledger when a route switched during the run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { roles: { worker: [{ model: 'good' }, { model: 'backup' }] } })
    const session = Session.create('sess-routing' as never)
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('route me')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const request = ctx.engine.startCalls[0]!
    const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
      if (options.label === 'grok-planner') return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) {
        // The first route fails with a rate limit; the chain must advance.
        if (options.model === 'good') throw new Error('429 Too Many Requests')
        return execution('work done')
      }
      return verification(task('a'))
    })
    ctx.engine.runs[0]!.complete(result.report)
    await waitFor(() => agent.followups.length === 1)
    const ledger = session.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined && record.type === ROUTING_RECORD)
      .map(record => record!.data as { switches: { route: string; failureClass?: string }[] })
      .at(-1)
    expect(ledger?.switches[0]?.route).toBe('good')
    expect(ledger?.switches[0]?.failureClass).toBe('rate-limit')
  })

  it('delivers the validated report as a relay message owned by the plugin', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never)
    const agent = new FakeAgent()
    await ctx.preStep()(payload(agent, [userMessage('do the thing')]), passingNext([]))
    await waitFor(() => agent.followups.length === 1)
    const relay = agent.followups[0]!
    expect((relay.source as { kind: string }).kind).toBe('grok-workflow')
    const text = textOf(relay)
    expect(text).toContain(REPORT_BEGIN)
    expect(text).toContain(REPORT_END)
    expect(text).toContain('COMPLETED')
    expect(agent.whenIdle).toHaveBeenCalled()
  })

  it('delivers an explicit failure answer when the engine reports an error', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    await ctx.preStep()(payload(agent, [userMessage('doomed')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.fail('error', 'boom')
    await waitFor(() => agent.followups.length === 1)
    const text = textOf(agent.followups[0]!)
    expect(text).toContain('FAILED')
    expect(text).toContain('boom')
    expect(text).not.toContain('COMPLETED')
  })

  it('delivers a failure answer when report validation rejects the engine value', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    await ctx.preStep()(payload(agent, [userMessage('bad report')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.complete({ schemaVersion: 1, status: 'completed', objective: 'bad report', plan: { source: 'caller', tasks: [] }, tasks: [] })
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('FAILED')
    expect(ctx.warnings.some(warning => warning.includes('report validation failed'))).toBe(true)
  })

  it('states a notice instead of throwing when the workflow cannot start', async () => {
    const ctx = new FakeContext()
    ctx.engine.startError = new Error('engine unavailable')
    apply(ctx as never)
    const agent = new FakeAgent()
    const decision = await ctx.preStep()(payload(agent, [userMessage('anything')]), passingNext([]))
    expect(decision).toEqual({ kind: 'reject' })
    await waitFor(() => agent.followups.length === 1)
    const text = textOf(agent.followups[0]!)
    expect(text).toContain('engine unavailable')
    expect(text).toContain('no workflow result exists')
  })

  it('forwards bounded conversation history for a follow-up message', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const history = [
      createUserMessage({ content: [{ type: 'text', text: 'summarize README' }], source: { kind: 'user' } }),
      createAssistantMessage({ content: [{ type: 'text', text: 'README summary' }], source: { kind: 'model', provider: 'p', model: 'm' } as never }),
    ]
    const agent = new FakeAgent({ session: new FakeSession({ header: {}, messages: history }) })
    await ctx.preStep()(payload(agent, [userMessage('now do the same for CHANGELOG')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const objective = String((ctx.engine.startCalls[0]!.args as { objective: string }).objective)
    expect(objective).toContain('Conversation so far')
    expect(objective).toContain('summarize README')
    expect(objective).toContain('README summary')
    expect(objective).toContain('Current request:')
    expect(objective).toContain('now do the same for CHANGELOG')
  })

  it('refuses a message longer than the objective limit without running the workflow', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    const decision = await ctx.preStep()(payload(agent, [userMessage('x'.repeat(4_001))]), passingNext([]))
    expect(decision).toEqual({ kind: 'reject' })
    expect(ctx.engine.startCalls).toHaveLength(0)
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('character workflow objective limit')
  })

  it('records the delivery durably so a restart cannot start the run again', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never)
    const session = Session.create('sess-records' as never)
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('recorded')]), passingNext([]))
    await waitFor(() => agent.followups.length === 1)
    const records = session.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined)
      .map(record => record.data as { phase?: string; key?: string })
    expect(records.some(record => record.phase === 'started')).toBe(true)
    expect(records.some(record => record.phase === 'delivered')).toBe(true)
    expect(records.every(record => typeof record.key === 'string')).toBe(true)
  })

  it('keeps working when the session refuses the delivery record', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never)
    const broken = new FakeSession({ header: {} })
    const agent = new FakeAgent({ session: broken })
    await ctx.preStep()(payload(agent, [userMessage('no records')]), passingNext([]))
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('COMPLETED')
    expect(ctx.warnings.some(warning => warning.includes('delivery record not persisted'))).toBe(true)
  })

  it('never throws out of the listener when classification itself fails', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const exploding = {
      id: 'sess-explode',
      header: {},
      ownEvents(): unknown[] {
        throw new Error('records unavailable')
      },
      deriveMessages(): unknown[] {
        return []
      },
    }
    const agent = new FakeAgent({ session: exploding })
    const next = passingNext([])
    const decision = await ctx.preStep()(payload(agent, [userMessage('boom')]), next)
    expect(decision).toEqual({ kind: 'reject' })
    expect(next).not.toHaveBeenCalled()
    expect(ctx.warnings.some(warning => warning.includes('gate classification failed'))).toBe(true)
  })

  it('does not register the gate when mandatory entry is disabled', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { enforceGate: false })
    expect(ctx.handlers.has('agent/pre-step')).toBe(false)
    expect(ctx.registeredTools).toHaveLength(1)
  })

  it('fails closed after the plugin was unloaded', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const agent = new FakeAgent()
    await ctx.dispose()
    const decision = await ctx.preStep()(payload(agent, [userMessage('late message')]), passingNext([]))
    expect(decision).toEqual({ kind: 'reject' })
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('no workflow result exists')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('writes the answer into the session when the append strategy is selected', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { answerStrategy: 'append' })
    const session = new RecordingSession()
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('append please')]), passingNext([]))
    await waitFor(() => session.appends.length >= 2)
    const types = session.appends.map(append => append.type)
    expect(types).toEqual(['user/message', 'assistant/message'])
    expect(agent.followups).toHaveLength(0)
    const answer = session.appends[1]!.data as { message: { content: { text?: string }[] }; stream: unknown[] }
    expect(answer.stream).toEqual([])
    expect(answer.message.content[0]?.text ?? '').toContain('COMPLETED')
  })

  it('commits both messages of the append strategy to a real session log', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { answerStrategy: 'append' })
    const session = Session.create('sess-append' as never)
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('append durably')]), passingNext([]))
    await waitFor(() => session.deriveMessages().some(message => message.role === 'assistant'))
    const derived = session.deriveMessages()
    expect(derived.map(message => message.role)).toEqual(['user', 'assistant'])
    expect(JSON.stringify(derived[0]!.content)).toContain('workflow')
    expect(JSON.stringify(derived[1]!.content)).toContain('COMPLETED')
    expect(agent.followups).toHaveLength(0)
  })

  it('appends nothing when the session refuses the write', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { answerStrategy: 'append' })
    const session = new RecordingSession()
    session.appendError = new Error('read-only session')
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('append fails')]), passingNext([]))
    await waitFor(() => ctx.warnings.some(warning => warning.includes('could not deliver')))
    expect(agent.followups).toHaveLength(0)
  })

  it('polices only sessions composed from the configured preset', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { gateScope: 'preset', gatePreset: 'strict-workflow' })
    const outside = new FakeAgent({ session: new FakeSession({ header: { agentPreset: 'other-preset' } }) })
    const outsideNext = passingNext([])
    await ctx.preStep()(payload(outside, [userMessage('outside')]), outsideNext)
    expect(outsideNext).toHaveBeenCalledTimes(1)
    expect(ctx.engine.startCalls).toHaveLength(0)
    const inside = new FakeAgent({ session: new FakeSession({ header: { agentPreset: 'strict-workflow' } }) })
    const decision = await ctx.preStep()(payload(inside, [userMessage('inside')]), passingNext([]))
    expect(decision).toEqual({ kind: 'reject' })
    await waitFor(() => ctx.engine.startCalls.length === 1)
  })

  it('requires a preset id when the scope is preset', () => {
    const ctx = new FakeContext()
    expect(() => apply(ctx as never, { gateScope: 'preset' })).toThrow(/gatePreset/)
  })
})

/** Concatenated text of one message. */
function textOf(message: UserMessage): string {
  return message.content
    .map(block => (block as { type: string; text?: string }).type === 'text' ? (block as { text?: string }).text ?? '' : '')
    .join('\n')
}
