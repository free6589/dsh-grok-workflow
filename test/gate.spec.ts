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
 * Install the gate (T4: `in-turn` is the only delivery; every test below is
 * about the gate and the run, not about the front desk).
 */
function applyWith(ctx: unknown, overrides: Record<string, unknown> = {}): void {
  // `mode: 'full'` on purpose: every test in this file is about the gate and the
  // run, not about the front desk. t52's tiering has its own file (triage.spec.ts),
  // and the front-desk branch is pinned there for each of its four tiers.
  // `grokDefault: 'on'` on purpose as well: these tests are about *admitted*
  // batches, and the default-off toggle passes everything through as normal chat
  // (pinned in `grok mode toggle (classifyPreStep)` below).
  apply(ctx as never, { mode: 'full', grokDefault: 'on', ...overrides })
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
    ctx.engine.autoRun = true
    const agent = new FakeAgent()
    const messages = [userMessage('summarize the repo')]
    const next = passingNext(messages)
    const decision = await ctx.preStep()(payload(agent, messages), next) as { kind: string }
    // T4 in-turn: the turn stays open for the whole run and the report is
    // entered (not rejected into a background relay + followup).
    expect(decision.kind).toBe('enter')
    await waitFor(() => ctx.engine.startCalls.length === 1)
    expect(ctx.engine.startCalls[0]!.args).toMatchObject({ objective: expect.stringContaining('summarize the repo') })
  })

  it('routes one user message only once even when pre-step fires again', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    const session = Session.create('sess-dedupe' as never)
    const agent = new FakeAgent({ session })
    const messages = [userMessage('same message')]
    const first = await ctx.preStep()(payload(agent, messages), passingNext(messages)) as { kind: string }
    expect(first.kind).toBe('enter')
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
    ctx.engine.autoRun = true
    const agent = new FakeAgent()
    // In-turn holds the turn for the whole run: hold the promise so the run
    // can settle, then await. autoRun completes the run on start.
    const firstP = ctx.preStep()(payload(agent, [userMessage('first')]), passingNext([]))
    const first = await firstP as { kind: string }
    expect(first.kind).toBe('enter')
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const secondP = ctx.preStep()(payload(agent, [userMessage('second')], 2, 1), passingNext([]))
    const second = await secondP as { kind: string }
    expect(second.kind).toBe('enter')
    await waitFor(() => ctx.engine.startCalls.length === 2)
    expect(ctx.engine.startCalls[1]!.args).toMatchObject({ objective: expect.stringContaining('second') })
  })

  it('admits a second message while the first run is still open (in-turn serializes, T4)', async () => {
    // T4: only `in-turn` survives and it blocks the turn for the whole run —
    // there is no per-agent queue on this path anymore (the
    // FIXED_MAX_QUEUED_MESSAGES bound only guards the interactive background
    // admission). A second message is admitted right away as its own run;
    // serialization happens inside the engine, not as a gate refusal. What this
    // pins: no bypass (both runs start exactly once, in order) and no silent
    // drop (both decisions settle).
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent()
    const first = ctx.preStep()(payload(agent, [userMessage('first')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const second = ctx.preStep()(payload(agent, [userMessage('second')], 2, 1), passingNext([]))
    ctx.engine.runs[0]!.complete(report({ objective: 'first' }))
    const firstDecision = await first as { kind: string }
    expect(firstDecision.kind).toBe('enter')
    await waitFor(() => ctx.engine.startCalls.length === 2)
    expect(ctx.engine.startCalls[1]!.args).toMatchObject({ objective: expect.stringContaining('second') })
    ctx.engine.runs[1]!.complete(report({ objective: 'second' }))
    const secondDecision = await second as { kind: string }
    expect(secondDecision.kind).toBe('enter')
  })

  it('admits while a run is open without waiting for idle (in-turn, T4)', async () => {
    // T4: `in-turn` holds the turn open for the whole workflow — the listener
    // never returns before the run settles, so there is no fast path that could
    // skip ordering. What this pins: a second message is admitted immediately
    // (its own run starts at once), not queued behind the first run's delivery.
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    const agent = new FakeAgent()
    const first = ctx.preStep()(payload(agent, [userMessage('first')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const second = ctx.preStep()(payload(agent, [userMessage('second')], 2, 1), passingNext([]))
    // Admitted at once: the second run starts even though the first is unsettled.
    await waitFor(() => ctx.engine.startCalls.length === 2)
    ctx.engine.runs[0]!.complete(report({ objective: 'first' }))
    ctx.engine.runs[1]!.complete(report({ objective: 'second' }))
    expect((await first) as { kind: string }).toMatchObject({ kind: 'enter' })
    expect((await second) as { kind: string }).toMatchObject({ kind: 'enter' })
  })

  it('reads history when the run starts so a queued follow-up sees the previous answer', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    const session = new FakeSession({ header: {} })
    const agent = new FakeAgent({ session })
    // Hold both admissions (in-turn blocks the turn), then settle in order.
    const firstP = ctx.preStep()(payload(agent, [userMessage('first request')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    // A second message is admitted while the first run is still open.
    const secondP = ctx.preStep()(payload(agent, [userMessage('second request')], 2, 1), passingNext([]))
    // The first answer becomes durable conversation before the second run starts.
    session.messages.push(userMessage('first request'), assistantMessage('FIRST ANSWER BODY'))
    expect((await firstP) as { kind: string }).toMatchObject({ kind: 'enter' })
    // The second admission composed its objective while the first run was in
    // flight, so it also settles now that the first run's answer is durable.
    expect((await secondP) as { kind: string }).toMatchObject({ kind: 'enter' })
    await waitFor(() => ctx.engine.startCalls.length === 2)
    const objective = String((ctx.engine.startCalls[1]!.args as { objective: string }).objective)
    expect(objective).toContain('Conversation so far')
    expect(objective).toContain('FIRST ANSWER BODY')
    expect(objective).toContain('Current request:')
    expect(objective).toContain('second request')
  })

  it('never retries a refused batch on its own (host re-send is the only path)', async () => {
    // T4: with only `in-turn` left, a fresh message is admitted as its own run.
    // The host-side rule this pins: the plugin starts at most one run per
    // admitted batch; a re-dispatch is a new admission, never an auto-retry.
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    const agent = new FakeAgent({ session: Session.create('sess-refusal' as never) })
    // In-turn holds the turn open for the whole run: hold the promise, settle
    // the run, then await — awaiting first would hang here forever.
    const first = ctx.preStep()(payload(agent, [userMessage('first')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    expect(ctx.engine.startCalls).toHaveLength(1)
    ctx.engine.runs[0]!.complete(report())
    expect((await first) as { kind: string }).toMatchObject({ kind: 'enter' })
    // A client send of a new message starts exactly one more run — no
    // automatic retry happened in between.
    const retried = passingNext([userMessage('second')])
    const second = ctx.preStep()(payload(agent, [userMessage('second')], 2, 1), retried)
    await waitFor(() => ctx.engine.startCalls.length === 2)
    ctx.engine.runs[1]!.complete(report({ objective: 'second' }))
    expect((await second) as { kind: string }).toMatchObject({ kind: 'enter' })
  })

  it('refuses a message with no text instead of burning a workflow run', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent({ session: Session.create('sess-empty' as never) })
    const decision = await ctx.preStep()(payload(agent, [userMessage('   ')]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    // T4 in-turn: an empty batch is an entered notice (refusalOf), not a
    // reject + followup. No run starts either way.
    expect(decision.kind).toBe('enter')
    expect(answerOf(decision)).toContain('no text to route')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('fails open with a warning when the hook is missing (gate always on, T4)', () => {
    const ctx = new FakeContext()
    // A runtime that exposes everything except the pre-step registration hook.
    const withoutHook = new Proxy(ctx, {
      get: (target, property, receiver) => property === 'on' ? undefined : Reflect.get(target, property, receiver),
    })
    // T4: no gateRequired switch — a missing hook never fails the load.
    expect(() => apply(withoutHook as never, {})).not.toThrow()
    expect(ctx.warnings.some(w => w.includes('agent/pre-step is unavailable'))).toBe(true)
  })

  it('writes a redacted routing ledger when a route switched during the run', async () => {
    const ctx = new FakeContext()
    applyWith(ctx, { roles: { worker: [{ model: 'good' }, { model: 'backup' }] } })
    const session = Session.create('sess-routing' as never)
    const agent = new FakeAgent({ session })
    // Manual run: the test drives the engine with a scripted switch, so the
    // preStep promise is held, the scripted report completes the run, then the
    // in-turn decision (with the ledger assertion) is awaited.
    const routeP = ctx.preStep()(payload(agent, [userMessage('route me')]), passingNext([]))
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
    const routeDecision = await routeP as { kind: string }
    expect(routeDecision.kind).toBe('enter')
    const ledger = session.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined && record.type === ROUTING_RECORD)
      .map(record => record!.data as { switches: { route: string; failureClass?: string }[] })
      .at(-1)
    expect(ledger?.switches[0]?.route).toBe('good')
    expect(ledger?.switches[0]?.failureClass).toBe('rate-limit')
  })

  // T4 in-turn: the turn stays open and the validated report is entered, not
  // relayed into a later turn — so assert on the entered step message.
  it('delivers the validated report in the open turn (in-turn, T4)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    applyWith(ctx)
    const agent = new FakeAgent({ session: realSession('sess-deliver-report') })
    const decision = await ctx.preStep()(payload(agent, [userMessage('do the thing')]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    expect(decision.kind).toBe('enter')
    const text = answerOf(decision)
    expect(text).toContain(REPORT_BEGIN)
    expect(text).toContain(REPORT_END)
    expect(text).toContain('COMPLETED')
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
    const agent = new FakeAgent({ session: realSession('sess-bplan-summary') })
    const decision = await ctx.preStep()(payload(agent, [userMessage('查一下新加坡天气')]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    expect(decision.kind).toBe('enter')
    const text = answerOf(decision)
    // Answer-first: the conclusion opens, the count lives in the tail.
    expect(text).toContain('答案：')
    expect(text).toContain('以上是结论；明细已记入台账。')
    // The human block rides inside the markers so the main model reproduces it verbatim.
    expect(text.indexOf('答案：')).toBeGreaterThan(text.indexOf(REPORT_BEGIN))
    expect(text.indexOf('答案：')).toBeLessThan(text.indexOf(REPORT_END))
  })

  it('never dresses a failed run in the success header (B plan)', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    // manual run control: autoRun stays off so fail()/complete() below owns the outcome
    const agent = new FakeAgent({ session: realSession('sess-no-dress') })
    const doomedP = ctx.preStep()(payload(agent, [userMessage('doomed')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.fail('error', 'boom')
    const doomed = await doomedP as { kind: string; messages: UserMessage[] }
    expect(doomed.kind).toBe('enter')
    const text = answerOf(doomed)
    expect(text).toContain('FAILED')
    expect(text).not.toContain('【人话结论】')
  })

  // T4: humanSummary removed (always on) — the human block is unconditional.
  // In-turn delivers by entering the step, not via followups (followups only
  // happen on the interactive background path), so assert on the decision.
  it('always answers with the human block in full mode (B plan, T4)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    applyWith(ctx)
    const agent = new FakeAgent({ session: realSession('sess-always-human') })
    const decision = await ctx.preStep()(payload(agent, [userMessage('查一下新加坡天气')]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    expect(decision.kind).toBe('enter')
    expect(answerOf(decision)).toContain('答案：')
  })

  it('delivers an explicit failure answer when the engine reports an error', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    // manual run control: autoRun stays off so fail()/complete() below owns the outcome
    const agent = new FakeAgent({ session: realSession('sess-fail-answer') })
    const failedP = ctx.preStep()(payload(agent, [userMessage('doomed')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.fail('error', 'boom')
    const failed = await failedP as { kind: string; messages: UserMessage[] }
    expect(failed.kind).toBe('enter')
    const text = answerOf(failed)
    expect(text).toContain('FAILED')
    expect(text).toContain('boom')
    expect(text).not.toContain('COMPLETED')
  })

  it('delivers a failure answer when report validation rejects the engine value', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    // manual run control: autoRun stays off so fail()/complete() below owns the outcome
    const agent = new FakeAgent({ session: realSession('sess-bad-report') })
    const badP = ctx.preStep()(payload(agent, [userMessage('bad report')]), passingNext([]))
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.complete({ schemaVersion: 1, status: 'completed', objective: 'bad report', plan: { source: 'caller', tasks: [] }, tasks: [] })
    const bad = await badP as { kind: string; messages: UserMessage[] }
    expect(bad.kind).toBe('enter')
    expect(answerOf(bad)).toContain('FAILED')
    expect(ctx.warnings.some(warning => warning.includes('report validation failed'))).toBe(true)
  })

  it('states a notice instead of throwing when the workflow cannot start', async () => {
    const ctx = new FakeContext()
    ctx.engine.startError = new Error('engine unavailable')
    applyWith(ctx)
    const agent = new FakeAgent({ session: realSession('sess-engine-down') })
    const decision = await ctx.preStep()(payload(agent, [userMessage('anything')]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    // T4 in-turn: a start failure is an entered notice, not a reject + followup.
    expect(decision.kind).toBe('enter')
    const text = answerOf(decision)
    expect(text).toContain('engine unavailable')
    expect(text).toContain('no workflow result exists')
  })

  it('forwards bounded conversation history for a follow-up message', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    const history = [
      createUserMessage({ content: [{ type: 'text', text: 'summarize README' }], source: { kind: 'user' } }),
      createAssistantMessage({ content: [{ type: 'text', text: 'README summary' }], source: { kind: 'model', provider: 'p', model: 'm' } as never }),
    ]
    const agent = new FakeAgent({ session: new FakeSession({ header: {}, messages: history }) })
    const histP = ctx.preStep()(payload(agent, [userMessage('now do the same for CHANGELOG')]), passingNext([]))
    const histDecision = await histP as { kind: string }
    expect(histDecision.kind).toBe('enter')
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const objective = String((ctx.engine.startCalls[0]!.args as { objective: string }).objective)
    expect(objective).toContain('Conversation so far')
    expect(objective).toContain('summarize README')
    expect(objective).toContain('README summary')
    expect(objective).toContain('Current request:')
    expect(objective).toContain('now do the same for CHANGELOG')
  })

  // B06: `relay`/`append` write the claimed batch themselves (the step is
  // rejected), and the run then reads the conversation as late as possible. The
  // message this plugin just committed must not come back as prior conversation:
  // the objective would carry the user's words twice — once as history, once as
  // the current request.
  // B06 (T4: only `in-turn` survives): the claimed batch is published before the
  // run, so the run must not read it back as prior conversation.
  it(
    'does not read back the message it just committed (in-turn, B06)',
    async () => {
      const ctx = new FakeContext()
      applyWith(ctx)
      const live = realSession(`sess-b06-in-turn`)
      const agent = new FakeAgent({ session: live })
      const request = '给导出接口加一个 CSV 选项'
      const b06P = ctx.preStep()(payload(agent, [userMessage(request)]), passingNext([]))
      await waitFor(() => ctx.engine.startCalls.length === 1)
      const objective = String((ctx.engine.startCalls[0]!.args as { objective?: string }).objective ?? '')
      expect(objective).toContain('Current request:')
      expect(objective.split(request)).toHaveLength(2)
      expect(objective).not.toContain('Conversation so far')
      // Settle the held run so the in-turn decision can land.
      ctx.engine.runs[0]!.complete(report({ objective: request }))
      const b06 = await b06P as { kind: string }
      expect(b06.kind).toBe('enter')
      // P0-1 still holds: the batch is in the transcript, exactly once.
      const words = live.deriveMessages()
        .map(message => (message as unknown as UserMessage).content
          .map(block => (block as { type?: string, text?: string }).type === 'text' ? (block as { text?: string }).text ?? '' : '')
          .join('\n'))
      expect(words.filter(text => text === request)).toHaveLength(1)
    },
  )

  it('refuses a 32001-character message with the 32000-character limit without running the workflow', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent({ session: realSession('sess-too-long') })
    const decision = await ctx.preStep()(payload(agent, [userMessage('x'.repeat(32_001))]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    // T4 in-turn: an over-long message is an entered notice (refusalOf), not a
    // reject + followup. No run starts either way.
    expect(decision.kind).toBe('enter')
    expect(ctx.engine.startCalls).toHaveLength(0)
    expect(answerOf(decision)).toContain('32000-character workflow objective limit')
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
    // In-turn enters the step on settle: hold the promise, autoRun settles it.
    const recordedP = ctx.preStep()(payload(agent, [userMessage('recorded')]), passingNext([]))
    const recorded = await recordedP as { kind: string }
    expect(recorded.kind).toBe('enter')
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
    broken.appendError = new Error('read-only session')
    const agent = new FakeAgent({ session: broken })
    // Commit of the claimed batch fails (warns), but the in-turn answer still
    // enters — session keeps the report even when the record write fails.
    const keptP = ctx.preStep()(payload(agent, [userMessage('no records')]), passingNext([]))
    const kept = await keptP as { kind: string; messages: UserMessage[] }
    expect(kept.kind).toBe('enter')
    expect(answerOf(kept)).toContain('COMPLETED')
    expect(ctx.warnings.some(warning => warning.includes('delivery record not persisted') || warning.includes('could not keep'))).toBe(true)
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

  // T4: enforceGate removed — the gate is always on and always registers.
  it('always registers the gate (mandatory entry cannot be disabled, T4)', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    expect(ctx.handlers.has('agent/pre-step')).toBe(true)
    // Two tools now: the workflow tool and the mid-run replan pull tool a boundary
    // planner child calls. The gate itself still registers exactly one handler.
    expect(ctx.registeredTools).toHaveLength(2)
  })

  it('fails closed after the plugin was unloaded', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    const agent = new FakeAgent({ session: realSession('sess-unloaded') })
    await ctx.dispose()
    const decision = await ctx.preStep()(payload(agent, [userMessage('late message')]), passingNext([])) as {
      kind: string
      messages: UserMessage[]
    }
    // T4 in-turn: the unload terminal is an entered notice, not a reject +
    // followup. No run starts either way.
    expect(decision.kind).toBe('enter')
    expect(answerOf(decision)).toContain('no workflow result exists')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  // T4: the gate is always on for every session (gateScope/gatePreset removed).
  it('admits every session regardless of preset (gate always on, T4)', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    for (const preset of ['other-preset', 'strict-workflow']) {
      const agent = new FakeAgent({ session: new FakeSession({ header: { agentPreset: preset } }) })
      const decision = await ctx.preStep()(payload(agent, [userMessage('inside')]), passingNext([])) as {
        kind: string
        messages: UserMessage[]
      }
      expect(decision.kind).toBe('enter')
    }
    await waitFor(() => ctx.engine.startCalls.length === 2)
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
    // T4: gateScope/gatePreset removed — the gate is always on, so a session in
    // another preset is admitted, not passed as out-of-scope.
    const outside = new FakeAgent({ session: new FakeSession({ header: { agentPreset: 'other-preset' } }) })
    const scoped = resolveConfig({ grokDefault: 'on' })
    expect(classifyPreStep({ config: scoped }, batch(outside))).toMatchObject({ kind: 'admit' })
  })
})

/** Concatenated text of one message. */
function textOf(message: UserMessage): string {
  return message.content
    .map(block => (block as { type: string; text?: string }).type === 'text' ? (block as { text?: string }).text ?? '' : '')
    .join('\n')
}

describe('heartbeat classification (classifyPreStep)', () => {
  // Round 17 live evidence: DSH 0.2.2 wraps the stored loop prompt in its own
  // framing — `[SCHEDULE REMINDER] … reminder_prompt_json: "<stored prompt>"` —
  // so the marker is embedded, never leading. The gate must still route the
  // delivery into the heartbeat branch instead of the generic pass-through.
  const framedHeartbeat = (prompt: string): UserMessage =>
    createUserMessage({
      content: [{
        type: 'text',
        text: '[SCHEDULE REMINDER]\nThis is a scheduled message from the user\n' +
          'schedule_id_json: "schedule-aaa"\noccurrence_at: 2026-11-19T01:07:01.365Z\n' +
          `reminder_prompt_json: ${JSON.stringify(prompt)}`,
      }],
      source: { kind: 'schedule' } as never,
    }) as unknown as UserMessage

  it('routes a framed heartbeat into the heartbeat branch, not the pass-through', () => {
    const config = resolveConfig({ grokDefault: 'on' })
    const agent = new FakeAgent()
    const message = framedHeartbeat('[grok-workflow loop] Loop heartbeat: the previous round has ended.')
    const verdict = classifyPreStep(
      { config },
      payload(agent, [message]) as unknown as PreStepPayload,
    )
    // No loop service composed: the continuation reason still proves the
    // heartbeat branch was entered (the pass-through would say non-user-source).
    expect(verdict).toEqual({ kind: 'pass', reason: 'loop-continuation' })
  })

  it('still passes a schedule delivery without the marker as non-user-source', () => {
    const config = resolveConfig({ grokDefault: 'on' })
    const agent = new FakeAgent()
    const message = framedHeartbeat('an ordinary scheduled reminder')
    const verdict = classifyPreStep(
      { config },
      payload(agent, [message]) as unknown as PreStepPayload,
    )
    expect(verdict).toEqual({ kind: 'pass', reason: 'non-user-source' })
  })
})

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
    // T4: the deadline is FIXED_TIMEOUT_MS (1h) and cannot be awaited in a unit
    // test. Pinned here: the report the deadline race builds — a failed
    // infrastructure Timeout naming the fixed deadline (run.ts), and that a
    // hanging run's cancel reason names the deadline, not the caller.
    // The race wiring itself is pinned in reliability.spec.ts; the hang path
    // cannot be awaited here either.
    const { failureReport } = await import('../src/report.js')
    const { FIXED_TIMEOUT_MS } = await import('../src/config.js')
    expect(FIXED_TIMEOUT_MS).toBe(3_600_000)
    const report = failureReport('run the workflow', resolveConfig({ grokDefault: 'on' }), 'Timeout', `workflow exceeded the ${FIXED_TIMEOUT_MS} ms deadline and was cancelled`)
    expect(report.status).toBe('failed')
    expect(report.errors[0]?.phase).toBe('Timeout')
    expect(report.errors[0]?.category).toBe('infrastructure')
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
    routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
    synthesis: { mode: 'deterministic' },
    limits: { maxConcurrency: 2, maxTasks: 6, maxTotalAgents: 20 },
  } as unknown as WorkflowReport
  return renderReport(value)
}

describe('cross-round carry-over', () => {
  it('hands the second round a digest of the first round instead of a blank slate', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    const session = Session.create('sess-carryover' as never)
    // Round 1 already happened: the transcript holds the user's words and the
    // plugin's own validated report (its durable, model-independent copy).
    session.append('user/message', userMessage('measure the retry loop'), { surfaceOp: 'append' })
    session.append('user/message', userMessage(reportText(), 'grok-workflow'), { surfaceOp: 'append' })
    const agent = new FakeAgent({ session })
    const followUp = 'now summarise it for my manager'
    // In-turn holds the turn for the whole run: hold the promise so the run
    // can start, assert on the started request, then settle and await.
    const carryP = ctx.preStep()(payload(agent, [userMessage(followUp)], 2, 1), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const args = ctx.engine.startCalls[0]!.args as Record<string, unknown>
    // The research result travels; the user's follow-up carries none of it.
    expect(String(args.carryover)).toContain('PYTEST-EVIDENCE-9f3c')
    expect(String(args.objective)).not.toContain('PYTEST-EVIDENCE-9f3c')
    expect(String(args.objective)).toContain(followUp)
    // Settle the held in-turn run so the listener can land.
    expect((await carryP) as { kind: string }).toMatchObject({ kind: 'enter' })
  })

  it('puts the inherited work into the objective the engine is started with', async () => {
    // L1 (Q2): the objective — not a side channel — is what every child prompt that
    // shows it reads, so the gate composes the inherited decisions into it, under
    // their own 8K budget, ahead of the forwarded history.
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    const session = Session.create('sess-inherit-gate' as never)
    session.append('user/message', userMessage('measure the retry loop'), { surfaceOp: 'append' })
    session.append('user/message', userMessage(reportText(), 'grok-workflow'), { surfaceOp: 'append' })
    const agent = new FakeAgent({ session })
    const inheritP = ctx.preStep()(payload(agent, [userMessage('finish the retry work')], 2, 1), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    const args = ctx.engine.startCalls[0]!.args as Record<string, unknown>
    const objective = String(args.objective)
    expect(objective).toContain('INHERITED WORK FROM EARLIER ROUNDS')
    // The earlier round verified task `a`: this round must not redo it.
    expect(objective).toContain('retain (generation 1): a')
    expect(objective).toContain('Current request:')
    expect(objective).toContain('finish the retry work')
    // The block is first (oldest material) and the request last.
    expect(objective.indexOf('INHERITED WORK')).toBeLessThan(objective.indexOf('Current request:'))
    // The worker prompt has no objective, so the same block still travels as its
    // own arg for that prompt — the objective is not the only carrier.
    expect(String(args.inheritance)).toContain('retain (generation 1): a')
    expect((await inheritP) as { kind: string }).toMatchObject({ kind: 'enter' })
  })

  it('sends no carry-over on a first round', async () => {
    const ctx = new FakeContext()
    applyWith(ctx)
    ctx.engine.autoRun = true
    const agent = new FakeAgent({ session: Session.create('sess-carryover-first' as never) })
    const firstP = ctx.preStep()(payload(agent, [userMessage('measure the retry loop')]), passingNext([]))
    await waitFor(() => ctx.engine.startCalls.length === 1)
    expect('carryover' in (ctx.engine.startCalls[0]!.args as Record<string, unknown>)).toBe(false)
    expect((await firstP) as { kind: string }).toMatchObject({ kind: 'enter' })
  })
})
