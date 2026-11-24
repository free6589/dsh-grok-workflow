/**
 * `/grok on`, first turn: the full shape answers first and verifies behind it.
 *
 * The reported defect (session-04bc086c): with `/grok on`, the first turn showed
 * nothing but a muted acceptance template — `已接单：这条消息正在按整套流程…` — and
 * the model was told to read that template back verbatim and never answer on its
 * own. The user got a receipt instead of an answer, while plain text (no `/grok`)
 * chatted normally.
 *
 * The shape that fixes it is the one the triage team path already had: spend one
 * cheap call, answer the message in one or two sentences *now*, and say that the
 * team verifies that answer behind the turn and reports later as its own message
 * (which may correct it). The run stays a real background run.
 *
 * The boundary of this file is the same as `test/grok-on-ingress.spec.ts`: the
 * `Session` is the real host class, the gate is the real `apply()`/`agent/pre-step`
 * registration, the workflow engine is a fake whose runs never settle on their own,
 * and the single front-desk call is scripted through `runWorkflowScript` — no model
 * is called, so every case here is deterministic.
 */

import { describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { REPORT_BEGIN, REPORT_END, acceptedEnterText } from '../src/answer.js'
import { setMode } from '../src/mode.js'
import { execution, task, verification } from './fixtures.js'
import { runWorkflowScript, roleOf } from './helpers.js'

/** The distinctive first answer the seam hands back (must survive sanitizing). */
const FIRST_ANSWER = '这两句是先答，团队正在后台核验。'

/* ------------------------------------------------------------------ engine -- */

interface EngineResult { value: unknown; stopReason: string; agentsStarted: number }

class FakeRun {
  readonly id = 'run-full-behind'
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

/** How the scripted front-desk child behaves. */
type FrontDesk = 'text' | 'empty' | 'throw'

/**
 * Engine fake.
 *
 * `startCalls` holds *runs* only: the one-call front-desk request the gate spends
 * for the first answer is recorded in `frontDeskCalls`, because it is a model call
 * and not the team run — a case that asserts "exactly one run started" must not
 * have to subtract it by hand.
 */
class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly frontDeskCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  /** Labels the one-call script actually asked for. */
  readonly callLabels: string[] = []
  readonly callPrompts: string[] = []
  frontDesk: FrontDesk = 'text'

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    if (request.meta.name === 'Front desk') {
      this.frontDeskCalls.push(request)
      const run = new FakeRun(request)
      const result = await runWorkflowScript(
        request.script,
        request.args as Record<string, unknown>,
        async (prompt, options) => {
          this.callLabels.push(options.label)
          this.callPrompts.push(prompt)
          // The captain's split preview: any text is fine, it is quoted to the user.
          if (options.label === 'captain-preview') return '任务一：查三家报价。\n任务二：给出结论。'
          if (options.label !== 'first-answer') throw new Error(`unexpected label ${options.label}`)
          if (this.frontDesk === 'throw') throw new Error('the light model did not reply')
          if (this.frontDesk === 'empty') return null
          return FIRST_ANSWER
        },
      )
      run.complete(result.report as unknown)
      return run
    }
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    // The run stays live until the case settles it: that is what makes "the receipt
    // landed while the team was still working" a measurement, not a timing guess.
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

/** The `AgentLoop` discipline that matters here, in miniature (see grok-on-ingress). */
class MiniLoop {
  readonly dispatched: string[] = []
  readonly committed: string[] = []
  private readonly inbox: UserMessage[] = []
  private running = false
  turn = 0
  agent!: FakeAgent
  session!: Session

  constructor(private readonly handler: Handler) {}

  attach(agent: FakeAgent, session: Session): this {
    this.agent = agent
    this.session = session
    return this
  }

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
        this.dispatched.push(batch.map(textOf).join('\n'))
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
}

/* ------------------------------------------------------------------ helpers -- */

function textOf(message: UserMessage): string {
  return (message.content as { type: string; text?: string }[]).map(part => part.text ?? '').join('')
}

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

/** Turn grok mode on exactly the way `/grok on` does (same record bytes). */
function grokOn(session: Session): void {
  const written = setMode(session, {
    v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'full',
  })
  expect(written.ok).toBe(true)
}

/** User-visible transcript text, read from the durable session. */
function transcript(session: Session): string {
  return session.deriveMessages().map(message => textOf(message as UserMessage)).join('\n')
}

/** A report the scripted team run produces when a case settles it. */
function reportOf(): Record<string, unknown> {
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

/* -------------------------------------------------------------------- tests -- */

/**
 * Send the task and wait until the run behind it has started.
 *
 * The full shape reaches the admission by one of two doors, and this case is about
 * what the turn says, not about which door: a real task may state the captain's split
 * first (one `captain-preview` call, no run) and dispatch on the confirmation, or it
 * may dispatch straight away. Both are handled here, so the case pins the first answer
 * rather than borrowing another feature's flow.
 */
async function dispatchBehind(ctx: FakeContext, loop: MiniLoop, text: string): Promise<void> {
  loop.send(userMessage(text))
  await vi.waitFor(() => {
    if (ctx.engine.startCalls.length > 0) return
    if (transcript(loop.session).includes('队长先报拆法')) return
    throw new Error(`neither the run nor the split question happened (warnings: ${ctx.warnings.join(' | ')})`)
  })
  if (ctx.engine.startCalls.length > 0) return
  // The split question is the turn's answer; the confirmation dispatches the run.
  loop.send(userMessage('确认'))
  await vi.waitFor(() => {
    if (ctx.engine.startCalls.length === 0) {
      throw new Error(`the team run did not start (warnings: ${ctx.warnings.join(' | ')})`)
    }
  })
}

describe('full mode, first turn: answer first, verify behind it', () => {
  it('enters the live first answer, says the report follows, and starts one real run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { legacyGate: true, mode: 'triage', grokDefault: 'off' })
    const session = Session.create('sess-answer-first' as never)
    const agent = new FakeAgent(session)
    grokOn(session)
    const loop = new MiniLoop(ctx.preStep()).attach(agent, session)

    await dispatchBehind(ctx, loop, '帮我查一下三家报价，然后给结论')

    const text = transcript(session)
    // The whole point of the fix: the turn carries words a person can read, not just
    // a template that says the message was received.
    expect(text).toContain(FIRST_ANSWER)
    expect(text).toContain('已接单')
    // ...and it says the team verifies that answer behind the turn, that the report
    // arrives as its own message, and that it may correct the answer above.
    expect(text).toContain('The report arrives as its own message')
    expect(text).toMatch(/verif/i)
    expect(text).toContain('可能纠正')
    // The live answer is not a fallback, and no template sentence is present.
    expect(text).not.toContain('首答是模板兜底')

    // Exactly one team run: the first answer is one cheap call, not a run.
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(ctx.engine.callLabels.filter(label => label === 'first-answer')).toHaveLength(1)
    expect(ctx.engine.callLabels.at(-1)).toBe('first-answer')
    // The run holds the message the user typed (with the approved split, when there
    // was one), never the confirmation word and never the first answer.
    const objective = String((ctx.engine.startCalls[0]!.args as { objective?: unknown }).objective ?? '')
    expect(objective).toContain('帮我查一下三家报价')
    expect(objective.trim()).not.toBe('确认')
    // The first answer was written for that objective (its prompt carries it).
    const firstAnswerPromptText = ctx.engine.callPrompts.at(-1)!
    expect(firstAnswerPromptText).toContain('帮我查一下三家报价')

    // The report is the next message, as the receipt promised.
    const request = ctx.engine.startCalls[0]!
    const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
      if (roleOf(options.label) === 'planner') return { tasks: [task('a')] }
      if (roleOf(options.label) === 'worker') return execution('work done')
      return verification(task('a'))
    })
    ctx.engine.runs[0]!.complete(result.report ?? reportOf())
    await vi.waitFor(() => {
      if (agent.followups.length === 0) throw new Error('the report was not delivered as its own message')
    })
    expect(textOf(agent.followups.at(-1)!)).toContain('帮我查一下三家报价')
  })

  for (const failure of ['throw', 'empty'] as const) {
    it(`a first answer that ${failure === 'throw' ? 'throws' : 'comes back empty'} falls back by saying so, and the run still starts`, async () => {
      const ctx = new FakeContext()
      ctx.engine.frontDesk = failure
      apply(ctx as never, { legacyGate: true, mode: 'triage', grokDefault: 'off' })
      const session = Session.create(`sess-answer-first-${failure}` as never)
      const agent = new FakeAgent(session)
      grokOn(session)
      const loop = new MiniLoop(ctx.preStep()).attach(agent, session)

      await dispatchBehind(ctx, loop, '把发布流程的报错整理一下')

      const text = transcript(session)
      // The fallback states what it is: no silent template, no fake live answer.
      expect(text).toContain('首答是模板兜底')
      expect(text).toContain('轻量模型没回')
      expect(text).not.toContain(FIRST_ANSWER)
      // A failed first answer never costs the user the run.
      expect(ctx.engine.startCalls).toHaveLength(1)
      const objective = String((ctx.engine.startCalls[0]!.args as { objective?: unknown }).objective ?? '')
      expect(objective).toContain('发布流程的报错')
    })
  }

  it('the entered preamble states the answer came first and the report may correct it', () => {
    const text = acceptedEnterText('BODY')
    const preamble = text.slice(0, text.indexOf(REPORT_BEGIN))
    const first = preamble.split('\n\n')[0]!

    // The first paragraph is the contract: answered first, verified behind, report
    // later as its own message, and it may correct what was said.
    expect(first).toMatch(/one or two sentences/)
    expect(first).toMatch(/verif/i)
    expect(first).toContain('The report arrives as its own message')
    expect(first).toMatch(/may correct/)
    // Nothing is claimed as already done.
    expect(first).not.toMatch(/has arrived|already reported/i)

    // The hand-over contract is unchanged: copy verbatim, no markers, nothing added,
    // no self-answer, no tools.
    expect(preamble).toContain('print no marker line')
    expect(preamble).toContain('add nothing before or after it')
    expect(preamble).toContain('do not answer the request yourself')
    expect(preamble).toContain('do not call any tool')
    expect(text).toContain(REPORT_BEGIN)
    expect(text).toContain(REPORT_END)
  })
})
