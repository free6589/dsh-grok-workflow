/**
 * `/grok on` message ingress (user report: "with grok on no message can be sent").
 *
 * The boundary of this file: the `Session` is the real host class, the gate is the
 * real `apply()`/`agent/pre-step` registration, and the workflow engine is a fake
 * that never settles on its own (`hang`) — no model is called. The loop driver is a
 * faithful miniature of `AgentLoop` (`dsh-agent-loop` `turn()`/`preStep()`): a
 * claimed batch goes to the `agent/pre-step` waterfall, the loop commits exactly
 * `decision.messages`, and the agent runs one step at a time, so a message that
 * arrives while a step is open waits in the inbox until that step settles.
 *
 * That single-step-at-a-time discipline is the whole point: an `in-turn` gate holds
 * the step open for the entire workflow run, and every message the user types in the
 * meantime is invisible until the run ends (default deadline 0 = unlimited).
 */

import { describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { setMode } from '../src/mode.js'
import { DEFAULT_MAX_CONCURRENCY, FIXED_MAX_QUEUED_MESSAGES, HARD_LIMITS, resolveConfig } from '../src/config.js'
import { execution, task, verification } from './fixtures.js'
import { delay, runWorkflowScript, roleOf } from './helpers.js'

/* ------------------------------------------------------------------ engine -- */

interface EngineResult { value: unknown; stopReason: string; agentsStarted: number }

class FakeRun {
  readonly id = 'run-grok-on'
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

/** Engine whose runs stay in flight until the test settles them (`hang`). */
class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  autoRun = false

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    request.signal?.addEventListener('abort', () => run.cancel(), { once: true })
    if (this.autoRun) {
      const plan = [(request.args as { tasks?: unknown }).tasks].flat().filter(Boolean)
      const tasks = plan.length > 0 ? plan as ReturnType<typeof task>[] : [task('a')]
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        if (roleOf(options.label) === 'worker') return execution('work done')
        if (roleOf(options.label) === 'verifier') return verification(tasks[0]!)
        if (roleOf(options.label) === 'planner') return { tasks }
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

/* -------------------------------------------------------------------- agent -- */

/** Interactive agent: `whenIdle`/`followup` exist, which is what the web GUI has. */
class FakeAgent {
  readonly session: Session
  readonly followups: UserMessage[] = []
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
  readonly whenIdle = vi.fn(async () => {})

  constructor(session: Session) {
    this.session = session
  }
}

/* --------------------------------------------------------------------- loop -- */

/**
 * The `AgentLoop` discipline that matters here, in miniature.
 *
 * `send()` puts a message in the inbox; the driver claims one batch at a time and
 * hands it to the `agent/pre-step` waterfall; the loop commits exactly
 * `decision.messages` (that is `AgentLoop.step()`). Because the driver is a single
 * loop, a batch that arrives while a step is open is claimed only after that step
 * settles.
 */
class MiniLoop {
  readonly dispatched: string[] = []
  readonly committed: string[] = []
  private readonly inbox: UserMessage[] = []
  private running = false
  turn = 0

  constructor(private readonly handler: Handler) {}

  send(message: UserMessage): void {
    this.inbox.push(message)
    void this.drive()
  }

  private async drive(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.inbox.length > 0) {
        const batch = this.inbox.splice(0)
        this.turn += 1
        const text = batch.map(message => {
          const content = message.content as { type: string; text?: string }[]
          return content.map(part => part.text ?? '').join('')
        }).join('\n')
        this.dispatched.push(text)
        const decision = await this.handler(
          { agent: this.agent, messages: batch, turn: this.turn, step: 1, signal: new AbortController().signal },
          async () => ({ kind: 'enter', messages: batch }),
        ) as { kind: 'enter' | 'reject'; messages?: UserMessage[] }
        if (decision.kind === 'enter') {
          for (const message of decision.messages ?? []) {
            this.session.append('user/message', message, { surfaceOp: 'append' })
            this.committed.push(String(message.id))
          }
        }
      }
    } finally {
      this.running = false
    }
  }

  agent!: FakeAgent
  session!: Session

  attach(agent: FakeAgent, session: Session): this {
    this.agent = agent
    this.session = session
    return this
  }
}

/* ------------------------------------------------------------------ helpers -- */

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

function report(): Record<string, unknown> {
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
  }
}

/** Turn grok mode on exactly the way `/grok on` does (same record bytes). */
function grokOn(session: Session): void {
  const written = setMode(session, {
    v: 1, enabled: true, turn: 0, setBy: 'command:/grok', workflowMode: 'full',
  })
  expect(written.ok).toBe(true)
}

/** User-visible transcript text, read from the durable session. */
function transcript(session: Session): string {
  return session.deriveMessages()
    .map(message => (message.content as { type: string; text?: string }[])
      .map(part => part.text ?? '').join(''))
    .join('\n')
}

/* -------------------------------------------------------------------- tests -- */

describe('/grok on keeps message ingress open', () => {
  it('dispatches the next message while the team run is still in flight', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'off' })
    const session = Session.create('sess-grok-on' as never)
    const agent = new FakeAgent(session)
    grokOn(session)
    const loop = new MiniLoop(ctx.preStep()).attach(agent, session)

    loop.send(userMessage('refactor the parser'))
    // The run is in flight and stays there: the engine never settles on its own.
    await vi.waitFor(() => {
      if (ctx.engine.startCalls.length === 0) throw new Error('the team run did not start')
    })
    expect(ctx.engine.runs[0]!.cancel).toBeDefined()

    loop.send(userMessage('also check the lexer'))
    await delay(60)

    // Before the fix the first step is still open, so the second message is not
    // even dispatched: the user sees nothing and the composer looks broken.
    expect(loop.dispatched).toContain('also check the lexer')
    expect(transcript(session)).toContain('also check the lexer')
  })

  it('still runs the full team for the message and delivers the report afterwards', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'off' })
    const session = Session.create('sess-grok-on-report' as never)
    const agent = new FakeAgent(session)
    grokOn(session)
    const loop = new MiniLoop(ctx.preStep()).attach(agent, session)

    loop.send(userMessage('audit the release pipeline'))
    await vi.waitFor(() => {
      if (ctx.engine.startCalls.length === 0) throw new Error('the team run did not start')
    })
    // `full` mode keeps its promise: the run happens for every message, with the
    // configured concurrency bound (default 10, hard maximum 100).
    expect(ctx.engine.startCalls[0]!.args).toMatchObject({
      objective: expect.stringContaining('audit the release pipeline'),
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    })
    expect(HARD_LIMITS.maxConcurrency).toBe(100)

    ctx.engine.runs[0]!.complete(report())
    await vi.waitFor(() => {
      if (agent.followups.length === 0) throw new Error('the report was not delivered')
    })
    const delivered = agent.followups.at(-1)!
    const text = (delivered.content as { type: string; text?: string }[]).map(part => part.text ?? '').join('')
    expect(text).toContain('audit the release pipeline')
  })

  it('leaves /grok off untouched: the message passes straight through, no run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'off' })
    const session = Session.create('sess-grok-off' as never)
    const agent = new FakeAgent(session)
    const loop = new MiniLoop(ctx.preStep()).attach(agent, session)

    loop.send(userMessage('just chatting'))
    await delay(30)
    expect(ctx.engine.startCalls).toHaveLength(0)
    expect(transcript(session)).toContain('just chatting')
  })

  it('a saturated queue keeps the blocking path instead of promising a background run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'off' })
    const session = Session.create('sess-grok-on-saturated' as never)
    const agent = new FakeAgent(session)
    grokOn(session)
    const loop = new MiniLoop(ctx.preStep()).attach(agent, session)

    // One message per batch — the loop dispatches a batch at a time — so the per-agent
    // queue fills up instead of the messages arriving together.
    for (let index = 0; index < FIXED_MAX_QUEUED_MESSAGES + 1; index += 1) {
      loop.send(userMessage(`queued message ${index}`))
      await vi.waitFor(() => {
        if (loop.dispatched.length < index + 1) throw new Error(`message ${index} was not dispatched`)
      })
    }

    // The queue is full, so the last message takes the blocking path: its step waits on
    // its own run, and no receipt claims a background run that was never queued.
    expect(loop.dispatched).toHaveLength(FIXED_MAX_QUEUED_MESSAGES + 1)
    const receipts = transcript(session).split('The report arrives as its own message').length - 1
    expect(receipts).toBe(FIXED_MAX_QUEUED_MESSAGES)
    // One queued run is executing (the queue is serialized per agent) plus the blocking one.
    await vi.waitFor(() => {
      if (ctx.engine.startCalls.length < 2) throw new Error(`only ${ctx.engine.startCalls.length} runs started`)
    })

    // Settle the blocking run so its step closes and the test leaves nothing pending.
    const committedBefore = loop.committed.length
    ctx.engine.runs.at(-1)!.complete(report())
    await vi.waitFor(() => {
      if (loop.committed.length <= committedBefore) throw new Error('the blocking step never settled')
    })
  })

  it('keeps the configured concurrency envelope untouched', () => {
    // The ingress fix must not become a way to raise the team's fan-out: the
    // default stays the documented 10, the hard maximum stays 100, and the
    // validator still refuses anything above it.
    expect(DEFAULT_MAX_CONCURRENCY).toBe(10)
    expect(HARD_LIMITS.maxConcurrency).toBe(100)
    expect(resolveConfig({}).maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY)
    expect(resolveConfig({ maxConcurrency: HARD_LIMITS.maxConcurrency }).maxConcurrency).toBe(100)
    expect(() => resolveConfig({ maxConcurrency: HARD_LIMITS.maxConcurrency + 1 })).toThrow(/maxConcurrency/)
  })
})
