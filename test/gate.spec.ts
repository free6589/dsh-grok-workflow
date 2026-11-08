import { describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { REPORT_BEGIN, REPORT_END } from '../src/answer.js'
import { renderReport } from '../src/report.js'
import type { WorkflowReport } from '../src/types.js'
import { resolveConfig } from '../src/config.js'
import { classifyPreStep } from '../src/gate.js'
import type { PreStepPayload } from '../src/gate.js'
import { setMode } from '../src/mode.js'
import { callerTask, execution, task, verification } from './fixtures.js'
import {runWorkflowScript, roleOf} from './helpers.js'
import { ROUTING_RECORD } from '../src/records.js'

/**
 * Install the gate with the `relay` strategy.
 *
 * `in-turn` is the default since t25 (it is the only strategy a one-shot app
 * survives), so every test below names the strategy it is actually about.
 */
function applyWith(ctx: unknown, overrides: Record<string, unknown> = {}): void {
  // `mode: 'full'` on purpose: every test in this file is about the gate and the
  // run, not about the front desk. t52's tiering has its own file (triage.spec.ts),
  // and the front-desk branch is pinned there for each of its four tiers.
  // `grokDefault: 'on'` on purpose as well: these tests are about *admitted*
  // batches, and the default-off toggle passes everything through as normal chat
  // (pinned in `grok mode toggle (classifyPreStep)` below).
  apply(ctx as never, { answerStrategy: 'relay', mode: 'full', grokDefault: 'on', ...overrides })
}

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
    // Documented engine contract: `signal` "cancels the run when aborted". A fake
    // that ignored it would let an in-turn wait hang forever, which is exactly the
    // failure mode the cancellation tests must rule out.
    request.signal?.addEventListener('abort', () => run.cancel('signal aborted'), { once: true })
    if (this.autoRun) {
      const tasks = [(request.args as { tasks?: unknown }).tasks].flat().filter(Boolean)
      const plan = tasks.length > 0 ? tasks as ReturnType<typeof task>[] : [task('a')]
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        if (roleOf(options.label) === 'worker') return execution('work done')
        if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
        if (roleOf(options.label) === 'planner') return { tasks: plan }
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

function payload(
  agent: FakeAgent,
  messages: UserMessage[],
  turn = 1,
  step = 1,
  signal: AbortSignal = new AbortController().signal,
): Record<string, unknown> {
  return { agent, messages, turn, step, signal }
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
    applyWith(ctx)
    const agent = new FakeAgent()
    const next = passingNext([])
    const decision = await ctx.preStep()(payload(agent, []), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(decision).toEqual({ kind: 'enter', messages: [] })
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('passes context-only batches through', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent()
    const context = [userMessage('runtime context', 'runtime-context')]
    const next = passingNext(context)
    await ctx.preStep()(payload(agent, context), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('passes the plugin relay message through instead of starting a second workflow', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent()
    const relay = [userMessage('report', 'grok-workflow')]
    const next = passingNext(relay)
    await ctx.preStep()(payload(agent, relay), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('passes subagent steps through so recursion is impossible', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent({ header: { origin: 'subagent', delegationDepth: 1 } })
    const messages = [userMessage('child prompt')]
    const next = passingNext(messages)
    await ctx.preStep()(payload(agent, messages), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('rejects an admitted user message and starts exactly one run', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
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
    applyWith(ctx)
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
    applyWith(ctx)
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
    applyWith(ctx, { maxQueuedMessages: 1 })
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
    applyWith(ctx, { maxQueuedMessages: 1 })
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
    applyWith(ctx)
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
    applyWith(ctx, { maxQueuedMessages: 1 })
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
    applyWith(ctx)
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
    applyWith(ctx, { roles: { worker: [{ model: 'good' }, { model: 'backup' }] } })
    const session = Session.create('sess-routing' as never)
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('route me')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const request = ctx.engine.startCalls[0]!
    const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
      if (roleOf(options.label) === 'planner') return { tasks: [callerTask('a')] }
      if (roleOf(options.label) === 'worker') {
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
    applyWith(ctx)
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

  // ---------------------------------------------------------------- B plan --
  // `/grok on` selects `full`, which used to bypass the front desk's plain-language
  // header entirely: the only output a user got was the machine ledger. The header
  // is now composed in `runTeam` too, so a full-mode run opens with a sentence a
  // reader can act on. These three cases pin the contract.
  it('prepends a plain-language summary in full mode (B plan)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    applyWith(ctx)
    const agent = new FakeAgent()
    await ctx.preStep()(payload(agent, [userMessage('查一下新加坡天气')]), passingNext([]))
    await waitFor(() => agent.followups.length === 1)
    const text = textOf(agent.followups[0]!)
    expect(text).toContain('【人话结论】')
    expect(text).toContain('项已核验通过')
    // The header rides inside the markers so the main model reproduces it verbatim.
    expect(text.indexOf('【人话结论】')).toBeGreaterThan(text.indexOf(REPORT_BEGIN))
    expect(text.indexOf('【人话结论】')).toBeLessThan(text.indexOf(REPORT_END))
  })

  it('never dresses a failed run in the success header (B plan)', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent()
    await ctx.preStep()(payload(agent, [userMessage('doomed')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.fail('error', 'boom')
    await waitFor(() => agent.followups.length === 1)
    const text = textOf(agent.followups[0]!)
    expect(text).toContain('FAILED')
    expect(text).not.toContain('【人话结论】')
  })

  it('honours humanSummary:false in full mode (B plan)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    applyWith(ctx, { humanSummary: false })
    const agent = new FakeAgent()
    await ctx.preStep()(payload(agent, [userMessage('查一下新加坡天气')]), passingNext([]))
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).not.toContain('【人话结论】')
  })

  it('delivers an explicit failure answer when the engine reports an error', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
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
    applyWith(ctx)
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
    applyWith(ctx)
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
    applyWith(ctx)
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

  it('refuses a 32001-character message with the 32000-character limit without running the workflow', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent()
    const decision = await ctx.preStep()(payload(agent, [userMessage('x'.repeat(32_001))]), passingNext([]))
    expect(decision).toEqual({ kind: 'reject' })
    expect(ctx.engine.startCalls).toHaveLength(0)
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('32000-character workflow objective limit')
  })

  it.each([4_000, 4_001, 10_000, 32_000])(
    'admits a %i-character message at the 32000-character objective limit',
    async (chars) => {
      const ctx = new FakeContext()
      ctx.engine.autoRun = true
      // Not `applyWith`: this case installs the gate directly. `grokDefault: 'on'`
      // for the same reason `applyWith` sets it — an off session passes the batch
      // through as normal chat, and this case is about an *admitted* batch.
      apply(ctx as never, { mode: 'full', grokDefault: 'on' })
      const agent = new FakeAgent({ session: realSession(`sess-limit-${chars}`) })
      const decision = await ctx.preStep()(
        payload(agent, [userMessage('x'.repeat(chars))]),
        passingNext([]),
      ) as { kind: string }
      expect(decision.kind).toBe('enter')
      expect(ctx.engine.startCalls).toHaveLength(1)
      const objective = String((ctx.engine.startCalls[0]!.args as { objective: string }).objective)
      expect(objective).toContain('x'.repeat(chars))
      expect(objective.length).toBeLessThanOrEqual(32_000)
      expect(agent.followups.some(item => textOf(item).includes('workflow objective limit'))).toBe(false)
    },
  )

  it('records the delivery durably so a restart cannot start the run again', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    applyWith(ctx)
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
    applyWith(ctx)
    const broken = new FakeSession({ header: {} })
    const agent = new FakeAgent({ session: broken })
    await ctx.preStep()(payload(agent, [userMessage('no records')]), passingNext([]))
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('COMPLETED')
    expect(ctx.warnings.some(warning => warning.includes('delivery record not persisted'))).toBe(true)
  })

  it('never throws out of the listener when classification itself fails', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
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
    const decision = await ctx.preStep()(payload(agent, [userMessage('boom')]), next) as {
      kind: string
      messages?: UserMessage[]
    }
    // P0-3: a classification fault used to be a silent `reject`, which a user reads
    // as an empty turn. It is now a stated notice, with the user's own message kept.
    expect(next).not.toHaveBeenCalled()
    expect(decision.kind).toBe('enter')
    expect(textOf(decision.messages![0]!)).toBe('boom')
    expect(answerOf(decision)).toContain('records unavailable')
    expect(answerOf(decision)).toContain('no workflow result exists')
    expect(ctx.warnings.some(warning => warning.includes('gate classification failed'))).toBe(true)
  })

  it('does not register the gate when mandatory entry is disabled', async () => {
    const ctx = new FakeContext()
    applyWith(ctx, { enforceGate: false })
    expect(ctx.handlers.has('agent/pre-step')).toBe(false)
    expect(ctx.registeredTools).toHaveLength(1)
  })

  it('fails closed after the plugin was unloaded', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
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
    applyWith(ctx, { answerStrategy: 'append' })
    const session = new RecordingSession()
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('append please')]), passingNext([]))
    await waitFor(() => session.appends.length >= 2)
    const types = session.appends.map(append => append.type)
    // The run's progress events share the log with its messages (t44): the panel
    // needs them, and they are appended while the run is live, not after it.
    // P0-1: the claimed message is committed by the plugin for `append`, so the log
    // holds the user's own words, then the report, then the plugin's answer.
    expect(types.filter(type => !type.startsWith('tool-workflow/'))).toEqual(['user/message', 'user/message', 'assistant/message'])
    // A `user/message` event carries the message itself (the same shape the loop
    // writes), so the first one is the user's request, verbatim.
    const original = session.appends.find(append => append.type === 'user/message')!.data as { content: { text?: string }[] }
    expect(original.content[0]?.text).toBe('append please')
    expect(types).toContain('tool-workflow/run-start')
    expect(types).toContain('tool-workflow/run-end')
    expect(agent.followups).toHaveLength(0)
    // Find the message by type: the run's own progress events interleave with it.
    const answer = session.appends.find(append => append.type === 'assistant/message')!
      .data as { message: { content: { text?: string }[] }; stream: unknown[] }
    expect(answer.stream).toEqual([])
    expect(answer.message.content[0]?.text ?? '').toContain('COMPLETED')
  })

  it('commits both messages of the append strategy to a real session log', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    applyWith(ctx, { answerStrategy: 'append' })
    const session = Session.create('sess-append' as never)
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('append durably')]), passingNext([]))
    await waitFor(() => session.deriveMessages().some(message => message.role === 'assistant'))
    const derived = session.deriveMessages()
    // P0-1: original request, then the report as a user message and its answer.
    expect(derived.map(message => message.role)).toEqual(['user', 'user', 'assistant'])
    expect(JSON.stringify(derived[0]!.content)).toContain('append durably')
    expect(JSON.stringify(derived[1]!.content)).toContain('COMPLETED')
    expect(agent.followups).toHaveLength(0)
  })

  it('appends nothing when the session refuses the write', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    applyWith(ctx, { answerStrategy: 'append' })
    const session = new RecordingSession()
    session.appendError = new Error('read-only session')
    const agent = new FakeAgent({ session })
    await ctx.preStep()(payload(agent, [userMessage('append fails')]), passingNext([]))
    await waitFor(() => ctx.warnings.some(warning => warning.includes('could not deliver')))
    expect(agent.followups).toHaveLength(0)
  })

  it('polices only sessions composed from the configured preset', async () => {
    const ctx = new FakeContext()
    applyWith(ctx, { gateScope: 'preset', gatePreset: 'strict-workflow' })
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
    expect(() => applyWith(ctx, { gateScope: 'preset' })).toThrow(/gatePreset/)
  })
})

/**
 * Text of the answer the gate entered.
 *
 * P0-1: since the in-turn decision carries the claimed user message *and* the
 * answer, the answer is the last message, never `messages[0]`.
 */
function answerOf(decision: { messages?: UserMessage[] }): string {
  const messages = decision.messages ?? []
  expect(messages.length).toBeGreaterThan(0)
  return textOf(messages[messages.length - 1]!)
}

/* ------------------------------------------------------------- grok mode -- */

/**
 * The per-session grok-mode toggle gates admission (src/mode.ts wired into
 * classifyPreStep): with `grokDefault: 'off'` and no mode record a would-be
 * admitted batch passes to the model untouched (normal chat), and only
 * toggle-admitted batches run the workflow. Classification is asserted
 * directly, so each pass reason is pinned by its label and the ordering with
 * the more specific reasons is part of the contract.
 */
describe('grok mode toggle (classifyPreStep)', () => {
  const batch = (agent: FakeAgent): PreStepPayload =>
    payload(agent, [userMessage('do the thing')]) as unknown as PreStepPayload

  it('passes a would-be-admitted batch through when grok mode is not enabled', () => {
    const verdict = classifyPreStep({ config: resolveConfig({ grokDefault: 'off' }) }, batch(new FakeAgent()))
    expect(verdict).toEqual({ kind: 'pass', reason: 'mode-off' })
  })

  it('admits the same batch when grokDefault is on and no record exists', () => {
    const verdict = classifyPreStep({ config: resolveConfig({ grokDefault: 'on' }) }, batch(new FakeAgent()))
    expect(verdict).toMatchObject({ kind: 'admit' })
  })

  it('lets a session mode record override the default in both directions', () => {
    // Enabled record + default off: admitted (the runtime toggle wins).
    const on = realSession('sess-mode-override-on')
    setMode(on, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok' })
    expect(classifyPreStep({ config: resolveConfig({ grokDefault: 'off' }) }, batch(new FakeAgent({ session: on }))))
      .toMatchObject({ kind: 'admit' })
    // Disabled record + default on: passes (the runtime toggle wins again).
    const off = realSession('sess-mode-override-off')
    setMode(off, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok off' })
    expect(classifyPreStep({ config: resolveConfig({ grokDefault: 'on' }) }, batch(new FakeAgent({ session: off }))))
      .toEqual({ kind: 'pass', reason: 'mode-off' })
  })

  it('keeps the more specific pass labels ahead of mode-off', () => {
    const config = resolveConfig({ grokDefault: 'off' })
    expect(classifyPreStep({ config }, payload(new FakeAgent(), []) as unknown as PreStepPayload))
      .toEqual({ kind: 'pass', reason: 'empty-batch' })
    const subagent = new FakeAgent({ header: { origin: 'subagent', delegationDepth: 1 } })
    expect(classifyPreStep({ config }, batch(subagent))).toEqual({ kind: 'pass', reason: 'subagent' })
    const outside = new FakeAgent({ session: new FakeSession({ header: { agentPreset: 'other-preset' } }) })
    const scoped = resolveConfig({ grokDefault: 'off', gateScope: 'preset', gatePreset: 'strict-workflow' })
    expect(classifyPreStep({ config: scoped }, batch(outside))).toEqual({ kind: 'pass', reason: 'out-of-scope' })
  })
})

/** Concatenated text of one message. */
function textOf(message: UserMessage): string {
  return message.content
    .map(block => (block as { type: string; text?: string }).type === 'text' ? (block as { text?: string }).text ?? '' : '')
    .join('\n')
}

/* -------------------------------------------------------------- in-turn -- */

/** Session that exposes its plugin records, for ledger/record assertions. */
function realSession(id: string): Session {
  return Session.create(id as never)
}

function recordsOf(session: Session, type: string): unknown[] {
  return session.ownEvents()
    .map(event => pluginRecordOf(event))
    .filter(record => record !== undefined && record.type === type)
    .map(record => record!.data)
}

describe('in-turn delivery (default strategy)', () => {
  it('keeps the turn open, then enters the step with the validated report', async () => {
    const ctx = new FakeContext()
    // Default strategy under test; the tier stays `full` so the message really
    // starts a run (the front desk is covered in triage.spec.ts).
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const agent = new FakeAgent({ session: realSession('sess-in-turn') })
    let settled = false
    const pending = ctx.preStep()(payload(agent, [userMessage('run the workflow')]), passingNext([]))
      .then((decision: unknown) => { settled = true; return decision })

    await waitFor(() => ctx.engine.startCalls.length === 1)
    // The listener is still awaiting: the turn must stay open for the whole run.
    expect(settled).toBe(false)
    expect(agent.whenIdle).not.toHaveBeenCalled()

    const request = ctx.engine.startCalls[0]!
    const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
      if (roleOf(options.label) === 'planner') return { tasks: [callerTask('a')] }
      if (roleOf(options.label) === 'worker') return execution('work done')
      return verification(task('a'))
    })
    ctx.engine.runs[0]!.complete(result.report)

    const decision = await pending as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    // P0-1/P0-5: the claimed message is in the transcript, written by the plugin
    // before the wait; the entered step therefore owes the report only.
    expect(textOf(decision.messages[0]!)).not.toBe('run the workflow')
    const text = answerOf(decision)
    expect(text).toContain(REPORT_BEGIN)
    expect(text).toContain('Grok workflow: COMPLETED')
    expect(text).toContain(REPORT_END)
    // Delivery happened in this turn: no follow-up turn was scheduled.
    expect(agent.followups).toHaveLength(0)
    expect(agent.whenIdle).not.toHaveBeenCalled()
  })

  it('renders the first user message while the run is still in flight (P0-5)', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const session = realSession('sess-in-turn-first-message')
    const agent = new FakeAgent({ session })
    const typed = '第一条消息：先把我说的话显示出来'
    /** Durable `user/message` events, i.e. what the GUI transcript renders. */
    const surfaced = (): string[] => session.ownEvents()
      .filter(event => (event as { type?: string }).type === 'user/message')
      .map(event => textOf((event as { data: UserMessage }).data))

    let settled = false
    const pending = ctx.preStep()(payload(agent, [userMessage(typed)]), passingNext([]))
      .then((decision: unknown) => { settled = true; return decision })
    await waitFor(() => ctx.engine.startCalls.length === 1)

    // The reported defect: the run is in flight, the step has not been entered, so
    // nothing was written and the session showed an empty turn plus the running
    // status — the message itself was nowhere. It must be durable *now*.
    expect(settled).toBe(false)
    expect(surfaced()).toEqual([typed])

    ctx.engine.runs[0]!.complete(report())
    const decision = await pending as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    // Exactly once: the batch is not re-entered on top of the published copy.
    expect(decision.messages).toHaveLength(1)
    expect(answerOf(decision)).toContain(REPORT_BEGIN)
    expect(surfaced()).toEqual([typed])
  })

  it('enters a failure report when the run failed, so the user is never left without output', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const session = realSession('sess-in-turn-failed')
    const agent = new FakeAgent({ session })
    const pending = ctx.preStep()(payload(agent, [userMessage('run the workflow')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.fail('error', 'engine exploded')
    const decision = await pending as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    // P0-5: the batch was published before the wait, so the notice stands alone.
    expect(textOf(decision.messages[0]!)).not.toBe('run the workflow')
    const text = answerOf(decision)
    expect(text).toContain('could not complete the workflow')
    expect(text).toContain('engine exploded')
    expect(agent.followups).toHaveLength(0)
    expect(recordsOf(session, 'plugin:grok-workflow/delivery').some(
      record => (record as { phase?: string }).phase === 'delivered',
    )).toBe(true)
  })

  it('enters a notice when the workflow cannot start at all', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const agent = new FakeAgent({ session: realSession('sess-in-turn-busy') })
    ctx.engine.startError = new Error('already has 2 active run(s)')
    const decision = await ctx.preStep()(payload(agent, [userMessage('run the workflow')]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    expect(decision.kind).toBe('enter')
    // P0-5: the batch was published before the wait, so the notice stands alone.
    expect(textOf(decision.messages[0]!)).not.toBe('run the workflow')
    const text = answerOf(decision)
    expect(text).toContain('no workflow result exists')
    expect(text).toContain('2 active run(s)')
    expect(agent.followups).toHaveLength(0)
  })

  it('refuses an over-long message in the same turn instead of staying silent', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const agent = new FakeAgent({ session: realSession('sess-in-turn-long') })
    const decision = await ctx.preStep()(payload(agent, [userMessage('x'.repeat(32_001))]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    expect(decision.kind).toBe('enter')
    // main raised the limit to 32000 chars (PR #25); P0-1 makes the notice the
    // *last* message because the claimed user message now comes first.
    expect(answerOf(decision)).toContain('32000-character workflow objective limit')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('rejects instead of entering when the turn is already aborted', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const agent = new FakeAgent({ session: realSession('sess-in-turn-aborted') })
    const controller = new AbortController()
    controller.abort()
    const decision = await ctx.preStep()(payload(agent, [userMessage('run the workflow')], 1, 1, controller.signal), passingNext([]))
    expect(decision).toEqual({ kind: 'reject' })
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('stops waiting when the turn aborts mid-run and does not hang', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const agent = new FakeAgent({ session: realSession('sess-in-turn-cancel') })
    const controller = new AbortController()
    const pending = ctx.preStep()(
      payload(agent, [userMessage('run the workflow')], 1, 1, controller.signal),
      passingNext([]),
    )
    await waitFor(() => ctx.engine.runs.length === 1)
    controller.abort()
    // The run was cancelled through its own signal, so the listener resolves.
    const decision = await pending
    expect(decision).toEqual({ kind: 'reject' })
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    expect(agent.followups).toHaveLength(0)
  })

  it('turns its own deadline into a failure report instead of waiting forever', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { timeoutMs: 1_000, grokDefault: 'on' })
    const agent = new FakeAgent({ session: realSession('sess-in-turn-timeout') })
    const decision = await ctx.preStep()(payload(agent, [userMessage('run the workflow')]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    expect(decision.kind).toBe('enter')
    const text = answerOf(decision)
    expect(text).toContain('deadline')
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
  })

  it('answers when the plugin is unloaded mid-run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const agent = new FakeAgent({ session: realSession('sess-in-turn-unload') })
    const pending = ctx.preStep()(payload(agent, [userMessage('run the workflow')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    await ctx.dispose()
    const decision = await pending as { kind: string; messages?: UserMessage[] }
    // Pinned behaviour (t26 N4): unloading cancels the in-flight run and the
    // listener still settles with an *entered* notice, because the cancellation
    // is a workflow outcome, not a turn abort. What matters is that it settles
    // instead of hanging, and that the run was cancelled.
    expect(decision.kind).toBe('enter')
    expect(answerOf(decision as { messages?: UserMessage[] })).toContain('cancelled')
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
  })

  it('writes no routing ledger when the engine failed before a report existed', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const session = realSession('sess-in-turn-no-ledger')
    const agent = new FakeAgent({ session })
    const pending = ctx.preStep()(payload(agent, [userMessage('run the workflow')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.fail('error', 'boom')
    await pending
    expect(recordsOf(session, ROUTING_RECORD)).toHaveLength(0)
  })
})

/* --------------------------------------------------- cross-round carry-over -- */

/** Research result that must survive from round 1 into round 2. */
const CARRYOVER_FINDING = 'PYTEST-EVIDENCE-9f3c: the retry loop fails at 0.42% under load'

/**
 * One validated report rendered exactly as the gate writes it into the session.
 *
 * The digest is compiled from this durable text, so the fixture is produced by
 * the real renderer rather than hand-written: if the report format changes, this
 * test stops matching for the same reason production would.
 */
function reportText(): string {
  const criterion = 'the retry behaviour is measured'
  const value = {
    schemaVersion: 'grok-workflow/v1',
    status: 'completed',
    objective: 'measure the retry loop',
    plan: { source: 'caller', tasks: [task('a', [criterion])] },
    tasks: [{
      id: 'a',
      title: 'Task a',
      attempts: [{ attempt: 1, status: 'verified', execution: execution('measured'), verification: verification(task('a', [criterion])) }],
      status: 'verified',
      evidence: [{ criterion, met: true, evidence: CARRYOVER_FINDING }],
    }],
    confirmed: [{ taskId: 'a', criterion, evidence: CARRYOVER_FINDING }],
    incomplete: [],
    errors: [],
    uncertainties: [],
    routes: [],
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic' },
    limits: { maxConcurrency: 2, maxRetries: 1, maxTasks: 6, maxTotalAgents: 20 },
  } as unknown as WorkflowReport
  return renderReport(value)
}

describe('cross-round carry-over', () => {
  it('hands the second round a digest of the first round instead of a blank slate', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const session = Session.create('sess-carryover' as never)
    // Round 1 already happened: the transcript holds the user's words and the
    // plugin's own validated report (its durable, model-independent copy).
    session.append('user/message', userMessage('measure the retry loop'), { surfaceOp: 'append' })
    session.append('user/message', userMessage(reportText(), 'grok-workflow'), { surfaceOp: 'append' })
    const agent = new FakeAgent({ session })
    const followUp = 'now summarise it for my manager'
    await ctx.preStep()(payload(agent, [userMessage(followUp)], 2, 1), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const args = ctx.engine.startCalls[0]!.args as Record<string, unknown>
    // The research result travels; the user's follow-up carries none of it.
    expect(String(args.carryover)).toContain('PYTEST-EVIDENCE-9f3c')
    expect(String(args.objective)).not.toContain('PYTEST-EVIDENCE-9f3c')
    expect(String(args.objective)).toContain(followUp)
  })

  it('sends no carry-over on a first round', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent({ session: Session.create('sess-carryover-first' as never) })
    await ctx.preStep()(payload(agent, [userMessage('measure the retry loop')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    expect('carryover' in (ctx.engine.startCalls[0]!.args as Record<string, unknown>)).toBe(false)
  })
})
