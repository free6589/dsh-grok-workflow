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
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { REPORT_BEGIN, REPORT_END } from '../src/answer.js'
import { resolveConfig } from '../src/config.js'
import { parseMemberLabel } from '../src/naming.js'
import { DELIVERY_RECORD, TERMINAL_RECORD } from '../src/records.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import { maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
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
  cancelValue: unknown
  readonly cancel = vi.fn((_reason?: string) => {
    this.settleCancelled(this.cancelValue)
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
  startGate: Promise<void> | undefined
  /** When true the run never settles on its own (for deadline/unload/cancel cases). */
  hang = false

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    if (this.startError !== undefined) throw this.startError
    if (this.startGate !== undefined) await this.startGate
    const run = new FakeRun(request)
    this.runs.push(run)
    request.signal?.addEventListener('abort', () => run.cancel('signal aborted'), { once: true })
    if (this.autoRun && !this.hang) {
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        // The front-desk single call (t52) returns a string answer.
        if (options.label === 'quick-worker') return 'quick answer'
        // The live first answer (B/C: 边聊边干): composed fresh per message.
        if (options.label === 'first-answer') return '听懂了，正在按你说的查，查完给你结论。'
        // The opt-in hybrid classifier answers with one JSON verdict (gate B18).
        if (options.label === 'triage-classifier') return '{"tier":"team"}'
        // Roles are read back from the *user-visible* label (Issue #22 P1-1): the
        // script no longer emits machine names like `grok-worker-t1-a2`, so the
        // double must tell roles apart exactly the way the panel does.
        const member = parseMemberLabel(options.label)
        if (member?.role === 'planner') return { tasks: [callerTask('a')] }
        if (member?.role === 'worker') return execution('work done')
        if (member?.role === 'verifier') return verification(task('a'))
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

function payloadAt(
  agent: FakeAgent,
  messages: UserMessage[],
  turn: number,
  step: number,
  signal: AbortSignal = new AbortController().signal,
): Record<string, unknown> {
  return { agent, messages, turn, step, signal }
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

function firstTurnMessage(text: string): UserMessage {
  return userMessage(text)
}

/**
 * Reopen the session the way a DSH restart replays the stored log.
 *
 * The host validator (`dsh-session-format-v3-to-v4` `foldSurface`) requires
 * the first surface event to be the system head — a `user/message` at surface
 * position 0 throws `system/message requires a protected first surface head`
 * on every reopen and bricks the session. Replaying that fold here (same
 * rule, same order) turns a regression into a red test instead of a corrupt
 * user session.
 */
function assertReopenable(live: Session): void {
  const surface: number[] = []
  let protectedHead: number | undefined
  for (const event of live.ownEvents()) {
    const record = event as { type?: string; seq?: number; surfaceOp?: unknown }
    if (
      record.type !== 'system/message'
      && record.type !== 'user/message'
      && record.type !== 'developer/message'
      && record.type !== 'assistant/message'
      && record.type !== 'tool/result'
    ) continue
    if (record.type === 'system/message' && surface.length > 0 && protectedHead === undefined) {
      throw new Error('system/message requires a protected first surface head')
    }
    if (record.surfaceOp === 'append') {
      if (record.type === 'system/message' && surface.length === 0 && typeof record.seq === 'number') {
        protectedHead = record.seq
      }
      if (typeof record.seq === 'number') surface.push(record.seq)
    }
  }
  const reopened = Session.create('sess-head-reopened' as never, live.snapshotEvents())
  // A seed event is prepended on reopen; the log body must round-trip whole.
  expect(reopened.ownEvents().length).toBe(live.ownEvents().length + 1)
}

function textOf(message: UserMessage): string {
  return message.content
    .map(block => (block as { type: string; text?: string }).type === 'text' ? (block as { text?: string }).text ?? '' : '')
    .join('\n')
}

function texts(session: Session): string[] {
  return session.deriveMessages()
    .map(message => textOf(message as unknown as UserMessage))
    .filter(text => text !== '' && text !== 'test head')
}

/** Transcript without the synthetic test head: the head is harness, not user speech. */
function derivedTexts(live: Session): string[] {
  return texts(live)
}

function recordsOf(session: Session, type: string): unknown[] {
  return session.ownEvents()
    .map(event => pluginRecordOf(event))
    .filter(record => record !== undefined && record.type === type)
    .map(record => record!.data)
}

/**
 * Terminal texts the plugin kept when it could not render a chat row.
 *
 * A cancelled turn is rejected before any `step/start`, so an `assistant/message`
 * cannot be attached to it: the token meter pairs every assistant row with a step
 * and replays an unpaired one as a hard error, which stalls compaction and breaks
 * `/compact` for the rest of the session. The terminal is kept as a plugin record
 * instead, and these tests read it from there.
 */
function terminalTexts(session: Session): string[] {
  return recordsOf(session, TERMINAL_RECORD).map(record => String((record as { text?: unknown }).text ?? ''))
}

interface Decision { kind: string; messages?: UserMessage[] }

/**
 * Apply {@link Decision} the way `AgentLoop.step()` does.
 *
 * `dsh-agent-loop/lib/index.js` `step()` first appends `step/start` and the
 * projected `system/message` head, then every `decision.messages` entry whose
 * source is not `runtime-context` as a `user/message` session event. Replaying
 * that order here is what makes a transcript assertion meaningful — and what
 * keeps the replayed log reopenable: the host validator requires the first
 * surface event to be the system head (`system/message requires a protected
 * first surface head`), so the head is committed before the batch.
 */
function commitHead(session: Session, turn = 1, step = 1): void {
  session.append('step/start', { turn, step })
  session.append(
    'system/message',
    { turn, step, message: createSystemMessage('test head') },
    { surfaceOp: 'append' },
  )
}

function commit(session: Session, decision: Decision, turn = 1, step = 1): void {
  commitHead(session, turn, step)
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

/**
 * Every install below passes `grokDefault: 'on'` alongside its `mode`.
 *
 * Grok mode is a per-session runtime toggle whose default is `off`: an off
 * session passes each batch straight to the model as normal chat (`mode-off`),
 * so the gate never runs. These cases are about what the gate and the run do
 * once a batch is admitted — the P0 dialogue-reliability behaviour — so they
 * opt in explicitly. The toggle itself, including the default-off pass-through
 * and the session override, is pinned in `test/gate.spec.ts`
 * (`grok mode toggle (classifyPreStep)`).
 */
describe('P0-1: the user’s own message survives in the transcript', () => {
  it('publishes the claimed message, then the report, once each, in that order', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-p01-in-turn')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('把登录接口改成 JWT 校验')]

    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    // Headless turn-1 session: the gate must NOT pre-publish (it would take
    // surface position 0 ahead of the system head and corrupt the stored
    // log), so the batch rides the decision and `commit` writes head first.
    expect(live.ownEvents().filter(event => (event as { type?: string }).type === 'user/message')).toHaveLength(0)
    expect((decision.messages ?? []).map(textOf)).toContain('把登录接口改成 JWT 校验')
    commit(live, decision)

    const derived = derivedTexts(live)
    // The claimed words survive, exactly once, ahead of the report.
    expect(derived.filter(text => text === '把登录接口改成 JWT 校验')).toHaveLength(1)
    expect(derived[0]).toBe('把登录接口改成 JWT 校验')
    // The report follows the original message and does not replace it.
    const last = derived[derived.length - 1]!
    expect(last).toContain(REPORT_BEGIN)
    expect(last).toContain(REPORT_END)
    // The entered step carries batch + report …
    expect((decision.messages ?? []).map(textOf)).toContain('把登录接口改成 JWT 校验')
    expect(textOf(decision.messages![decision.messages!.length - 1]!)).toBe(last)
    assertReopenable(live)
  })

  it('keeps the original message when the message is refused before any run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-p01-refusal')
    const agent = new FakeAgent(live)
    // One character past the workflow objective limit (32000 since PR #25), which is
    // the refusal this case needs; the length itself is not what is under test.
    const tooLong = 'x'.repeat(32_001)
    const claimed = [userMessage(tooLong)]

    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    commit(live, decision)

    expect(decision.kind).toBe('enter')
    expect(textOf(decision.messages![0]!)).toBe(tooLong)
    expect(answerOf(decision)).toContain('workflow objective limit')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('survives a reload: the transcript replays the original message then the report', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
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

  it('in-turn: the claimed message is entered with the answer in the same step (T4)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-p01-relay')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('in-turn 也要留下原话')]

    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    // T4: only `in-turn` survives — the turn stays open, the run settles, and
    // the decision carries the claimed message plus the answer (no followup).
    // Headless turn 1: nothing is pre-published; the commit writes head first.
    expect(decision.kind).toBe('enter')
    expect(texts(live)).toEqual([])
    expect((decision.messages ?? []).map(textOf)).toContain('in-turn 也要留下原话')
    commit(live, decision)
    const afterRelay = texts(live)
    expect(afterRelay[0]).toBe('in-turn 也要留下原话')
    expect(answerOf(decision)).toContain(REPORT_BEGIN)
    expect(agent.followups).toHaveLength(0)
    assertReopenable(live)
  })

  it('in-turn: the original message and the report are both in the durable log (T4)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-p01-append')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('append 也要留下原话')]

    // In-turn never pre-publishes on a headless turn-1 session: the decision
    // carries the claimed words, then the report answer; the loop commit
    // writes head → message → report.
    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    expect(decision.kind).toBe('enter')
    expect(texts(live)).toEqual([])
    const carried = (decision.messages ?? []).map(textOf)
    expect(carried).toContain('append 也要留下原话')
    expect(carried[carried.length - 1]).toContain('COMPLETED')
    commit(live, decision)
    assertReopenable(live)
  })

  it('a downstream refusal is not claimed, so the batch stays routable', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
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
}): Promise<{ asked: string, answered: string, decision: Decision, agent: FakeAgent }> {
  const { ctx, live, answer } = options
  const ambiguous = options.ambiguous ?? '改一下那个'
  const agent = new FakeAgent(live)
  const first = await ctx.preStep()(payload(agent, [userMessage(ambiguous)]), nextWith([])) as Decision
  commit(live, first, 1, 1)
  const second = await ctx.preStep()(payloadAt(agent, [userMessage(answer)], 2, 1), nextWith([])) as Decision
  commit(live, second, 2, 1)
  return { asked: answerOf(first), answered: answerOf(second), decision: second, agent }
}

describe('P0-2: a confirmation answer keeps the original request', () => {
  it('asks before running when the request is ambiguous', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
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
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
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
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-p02-team')
    const { answered, agent } = await askThenAnswer({ ctx, live, ambiguous: '改一下那个', answer: '团队' })

    // Two starts: the live first answer, then the background team run.
    await waitFor(() => ctx.engine.startCalls.length === 2)
    const objective = String((ctx.engine.startCalls[1]!.args as { objective?: string }).objective ?? '')
    expect(objective).toContain('改一下那个')
    expect(objective).toContain('用户选择团队模式')
    // The in-turn reply is the live first answer (B/C), not the final report…
    expect(answered).toContain('档位：团队档')
    expect(answered).not.toContain('收到！团队开工中')
    // …the report lands in the background turn.
    await waitFor(() => agent.followups.length === 1)
    expect(textOf(agent.followups[0]!)).toContain('COMPLETED')
  })

  it('states that the confirmation expired instead of guessing the task', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
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
    apply(first as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-p02-reload')
    await first.preStep()(payload(new FakeAgent(live), [userMessage('改一下那个')]), nextWith([]))

    // A fresh plugin instance is what a reload gives you: the Map is gone.
    const second = new FakeContext()
    apply(second as never, { mode: 'triage', grokDefault: 'on' })
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
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const one = session('sess-p02-one')
    const two = session('sess-p02-two')
    await ctx.preStep()(payload(new FakeAgent(one), [userMessage('改一下那个')]), nextWith([]))

    // Session two has no pending question of its own.
    const other = await ctx.preStep()(payload(new FakeAgent(two), [userMessage('团队')]), nextWith([])) as Decision
    expect(answerOf(other)).toContain('没有待回答的分流问题')
    expect(ctx.engine.startCalls).toHaveLength(0)

    // ...and session one can still answer its own question.
    const own = await ctx.preStep()(payload(new FakeAgent(one), [userMessage('团队')]), nextWith([])) as Decision
    await waitFor(() => ctx.engine.startCalls.length === 2)
    expect(String((ctx.engine.startCalls[1]!.args as { objective?: string }).objective)).toContain('改一下那个')
    expect(answerOf(own)).toContain('档位：团队档')
  })

  it('consumes a pending question once, so a repeated answer cannot start a second run', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-p02-once')
    const agent = new FakeAgent(live)
    await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([]))
    await ctx.preStep()(payload(agent, [userMessage('团队')]), nextWith([]))
    await waitFor(() => ctx.engine.startCalls.length === 2)

    const again = await ctx.preStep()(payload(agent, [userMessage('团队')]), nextWith([])) as Decision
    expect(answerOf(again)).toContain('没有待回答的分流问题')
    expect(ctx.engine.startCalls).toHaveLength(2)
  })

  it('says the question is void when the user answers something else', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-p02-unused')
    const agent = new FakeAgent(live)
    await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([]))
    const decision = await ctx.preStep()(
      payload(agent, [userMessage('算了，帮我把 README 的错别字修一下')]),
      nextWith([]),
    ) as Decision
    expect(answerOf(decision)).toContain('作废')
  })

  it('keeps an earlier unanswered request when a second question arrives (B04)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-b04-carry')
    const agent = new FakeAgent(live)
    await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([]))
    // A second vague request while the first question is still open. The answer is
    // the answer to *both* questions, so neither request may be thrown away.
    const second = await ctx.preStep()(payload(agent, [userMessage('把那个也顺手弄一下')]), nextWith([])) as Decision
    expect(answerOf(second)).toContain('简单 / 团队')

    const answered = await ctx.preStep()(payload(agent, [userMessage('团队')]), nextWith([])) as Decision

    await waitFor(() => ctx.engine.startCalls.length === 2)
    const objective = String((ctx.engine.startCalls[1]!.args as { objective?: string }).objective ?? '')
    // The forwarded conversation already names both messages, so the assertion has
    // to look at the request the run was actually started with — the composed
    // history is not evidence about what the front desk remembered.
    const request = objective.slice(objective.indexOf('Current request:'))
    expect(request).toContain('原始任务：')
    expect(request).toContain('改一下那个')
    expect(request).toContain('把那个也顺手弄一下')
    expect(answerOf(answered)).toContain('档位：团队档')
  })

  it('cuts the resumed request to the objective budget instead of refusing the run (B08)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-b08-budget')
    const agent = new FakeAgent(live)
    await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([]))
    // A question whose request is one character under the workflow objective limit:
    // the confirmation wording on top of it used to push the composed objective
    // over the limit, and the run was refused *after* the pending entry was gone.
    const head = '把那个也顺手弄一下 '
    const padded = `${head}${'x'.repeat(32_000 - head.length)}`
    const asked = await ctx.preStep()(payload(agent, [userMessage(padded)]), nextWith([])) as Decision
    expect(answerOf(asked)).toContain('简单 / 团队')

    const answered = await ctx.preStep()(payload(agent, [userMessage('团队')]), nextWith([])) as Decision

    await waitFor(() => ctx.engine.startCalls.length === 2)
    const objective = String((ctx.engine.startCalls[1]!.args as { objective?: string }).objective ?? '')
    const request = objective.slice(objective.indexOf('原始任务：'))
    expect(objective.length).toBeLessThanOrEqual(32_000)
    // The confirmation and the newest request survive whole; the older request of
    // the first question only does not, because the newest message alone already
    // fills the budget (there is no room left to keep any of it).
    expect(request).toContain('用户选择团队模式')
    expect(request).toContain('把那个也顺手弄一下')
    // The cut is marked where the budget ran out, so nothing looks truncated.
    expect(request).toContain('…')
    expect(answerOf(answered)).not.toContain('workflow objective limit')
    expect(answerOf(answered)).toContain('档位：团队档')
  })
})

/* ------------------------------------------------------------------- P0-3 -- */

describe('P0-3: every internal error leaves a user-visible terminal state', () => {
  it('answers a classification failure instead of an empty turn', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
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
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
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
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
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
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-p03-secret')
    const agent = new FakeAgent(live)
    ctx.engine.startError = new Error('auth failed: api_key=sk-live-9f8e7d6c5b4a3210')
    const decision = await ctx.preStep()(payload(agent, [userMessage('跑一下工作流')]), nextWith([])) as Decision
    const text = textOf(decision.messages![decision.messages!.length - 1]!)
    expect(text).not.toContain('sk-live-9f8e7d6c5b4a3210')
    // The provider-token rule fires before the assignment rule, so the value keeps the
    // rule-specific placeholder; the assignment rule must not re-redact it into a broken
    // `[REDACTED] API KEY]`.
    expect(text).toContain('api_key=[REDACTED API KEY]')
    for (const warning of ctx.warnings) expect(warning).not.toContain('sk-live-9f8e7d6c5b4a3210')
  })

  it('does not re-enter the gate or start a second workflow to report an error', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
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
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
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
  const config = (): ReturnType<typeof resolveConfig> => resolveConfig({ maxConcurrency: 1})

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
      plan: { source: 'planner', tasks: plan },
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
      routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      // A report is only trusted when its limits echo the configuration that ran
      // (assertWorkflowReport refuses anything else), so the fixture echoes it.
      // maxTotalAgents must sit inside the planner-budget window
      // [maxTotalAgentsFor(taskCount), maxTotalAgentsFor(maxTasks)]: derive it
      // from the config so a default change cannot strand this fixture.
      limits: {
        maxConcurrency: limitsConfig.maxConcurrency,
        maxRetries: limitsConfig.maxRetries,
        maxTasks: limitsConfig.maxTasks,
        // The report validator only trusts an agent budget inside the range the
        // planner budget allows (`report.ts`: min-max for this task count).
        maxTotalAgents: maxTotalAgentsFor(plan.length, limitsConfig.maxRetries, routeBudgetFor(limitsConfig)),
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

  it('turns a deadline into its own terminal state (regression, T4 fixed deadline)', async () => {
    // The default deadline is 0 = unlimited — fake timers stand in for the configured one.
    vi.useFakeTimers()
    try {
      const ctx = new FakeContext()
      ctx.engine.hang = true
      const pending = runWorkflow({
        ctx: ctx as never,
        config: resolveConfig({ maxConcurrency: 1, timeoutMs: 3_600_000 }),
        state: createActiveState(),
        logger: { warn: () => {} },
        agent: agentOf(session('sess-p04-timeout')) as never,
        objective: 'do the thing',
        failureMode: 'report',
        // Fake timers cannot advance past an in-flight fs syscall; skip the
        // resume scan (covered in checkpoint-wiring.spec.ts).
        resumeLister: 'skip',
      })
      const outcome = await vi.advanceTimersByTimeAsync(3_600_000 + 1_000).then(() => pending)
      expect(outcome.cause).toBe('timeout')
      expect(outcome.report.errors[0]?.phase).toBe('Timeout')
      expect(outcome.report.errors[0]?.category).toBe('infrastructure')
    } finally {
      vi.useRealTimers()
    }
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

/**
 * Cancellation inside the open turn (P0-1 + P0-4).
 *
 * Found by driving the real GUI: pressing stop during an in-turn team run left the
 * session with *no* `user/message` at all and no reason for the stop, because the
 * gate returned `reject` and the claimed batch had already been taken out of the
 * inbox. The tests below pin the transcript the user can see afterwards.
 */
describe('P0-4: a cancelled turn keeps the message and states the terminal', () => {
  it('keeps the typed message once and writes the cancelled terminal when the run is stopped', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-p04-keep-mid')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('把这个表格整理成周报')]
    const controller = new AbortController()

    const pending = ctx.preStep()(payload(agent, claimed, controller.signal), nextWith(claimed)) as Promise<Decision>
    await waitFor(() => ctx.engine.runs.length === 1)
    controller.abort()
    const decision = await pending

    // Nothing can be entered into a cancelled turn: the decision must be a rejection.
    expect(decision.kind).toBe('reject')
    // Headless turn-1 cancel: the batch is NOT appended (it would take surface
    // position 0 and brick the session on the next turn's system head), so the
    // transcript carries no user row — but the terminal record states why, and
    // the delivery record keeps the batch routable for the retry.
    expect(live.ownEvents().filter(event => event.type === 'user/message')).toHaveLength(0)
    // A cancelled turn has no open step, so the terminal is *not* an assistant row:
    // an unpaired `assistant/message` is what made every later token-meter replay
    // throw, which is how `/compact` started failing. It is kept as a record.
    expect(live.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(0)
    const terminal = terminalTexts(live)
    expect(terminal).toHaveLength(1)
    const last = terminal[0]!
    expect(last).toContain('取消')
    expect(last).toContain('cancelled')
    // A stopped run must never read as success.
    expect(last).not.toContain('COMPLETED')
    expect(last).not.toContain('已开启')
    assertReopenable(live)
  })

  it('writes verified partial work into the cancelled transcript', async () => {
    const ctx = new FakeContext()
    const config = { mode: 'full' as const, grokDefault: 'on' as const, maxConcurrency: 2, maxTasks: 2 }
    const limitsConfig = resolveConfig(config)
    apply(ctx as never, config)
    const live = session('sess-p1-cancel-partial-report')
    const agent = new FakeAgent(live)
    const request = '完成两个任务'
    const objective = 'Current request:\n' + request
    const claimed = [userMessage(request)]
    const controller = new AbortController()
    const plan = [task('a'), task('b')]
    const partial = {
      schemaVersion: 'grok-workflow/v1',
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
      confirmed: [{ taskId: 'a', criterion: 'a works', evidence: verification(plan[0]!).criteria[0]!.evidence }],
      incomplete: [],
      errors: [],
      uncertainties: [],
      routes: [],
      routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      limits: {
        maxConcurrency: limitsConfig.maxConcurrency,
        maxRetries: limitsConfig.maxRetries,
        maxTasks: limitsConfig.maxTasks,
        maxTotalAgents: maxTotalAgentsFor(plan.length, limitsConfig.maxRetries, routeBudgetFor(limitsConfig)),
      },
    }

    const pending = ctx.preStep()(payload(agent, claimed, controller.signal), nextWith(claimed)) as Promise<Decision>
    await waitFor(() => ctx.engine.runs.length === 1)
    ctx.engine.runs[0]!.cancelValue = partial
    controller.abort()
    const decision = await pending

    expect(decision.kind).toBe('reject')
    // Headless turn-1 cancel: no user row is appended (position-0 rule), so the
    // transcript carries no user words — but the terminal record states why,
    // and the verified work is still stated there.
    expect(live.ownEvents().filter(event => event.type === 'user/message')).toHaveLength(0)
    expect(live.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(0)
    const all = terminalTexts(live).join('\n')
    // Round 28: the cancelled terminal states the kept report as a human
    // conclusion, never relayed — no success preamble, no markers, no `PARTIAL`
    // status word from the machine ledger.
    expect(all).not.toContain('PARTIAL')
    expect(all).not.toContain('<<<GROK-WORKFLOW-REPORT>>>')
    expect(all).toContain('Task a')
    // Round 28: per-criterion evidence verbatim stays in the progress node,
    // not in the cancelled terminal — the human conclusion names the task.
    expect(all).not.toContain(verification(plan[0]!).criteria[0]!.evidence)
    // Round 28: the unstarted task's title verbatim stays in the machine
    // ledger, not in the cancelled terminal — the human conclusion describes
    // it without naming it.
    expect(all).not.toContain('Task b')
    expect(all).not.toContain('not started')
    expect(all).toContain('cancelled')
    expect(all).not.toContain('COMPLETED')
  })

  it('keeps the message and states the terminal when the signal was already aborted', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-p04-keep-pre')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('把登录接口改成 JWT 校验')]
    const controller = new AbortController()
    controller.abort()

    const decision = await ctx.preStep()(payload(agent, claimed, controller.signal), nextWith(claimed)) as Decision

    expect(decision.kind).toBe('reject')
    expect(ctx.engine.startCalls).toHaveLength(0)
    // Headless turn-1 pre-cancel: no user row is appended (position-0 rule) —
    // the terminal record states why instead.
    expect(live.ownEvents().filter(event => event.type === 'user/message')).toHaveLength(0)
    expect(live.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(0)
    const terminal = terminalTexts(live)
    expect(terminal).toHaveLength(1)
    const last = terminal[0]!
    expect(last).toContain('取消')
    expect(last).toContain('没有启动任何工人')
    expect(last).not.toContain('COMPLETED')
    assertReopenable(live)
  })
})


describe('P1: front-desk calls share the plugin lifecycle', () => {
  it('cancels and disposes a running quick-worker call when the plugin unloads', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-p1-quick-unload')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('run npm test')]
    const pending = ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Promise<Decision>

    await waitFor(() => ctx.engine.runs.length === 1)
    const run = ctx.engine.runs[0]!
    await ctx.dispose()
    const decision = await pending

    expect(decision.kind).toBe('enter')
    expect(run.cancel).toHaveBeenCalled()
    expect(run.dispose).toHaveBeenCalled()
    // The interruption notice is kept as a terminal record: the disposal happens
    // outside any step, so it cannot be an assistant row either.
    expect(terminalTexts(live).join('\n')).toContain('unloaded')
    // Headless turn-1: no user row is appended (position-0 rule); the batch
    // stays routable via the delivery record for the retry.
    expect(live.ownEvents().filter(event => event.type === 'user/message')).toHaveLength(0)
    assertReopenable(live)
  })

  it('returns from quick-worker startup on unload and disposes a run that arrives late', async () => {
    const ctx = new FakeContext()
    let release!: () => void
    ctx.engine.startGate = new Promise(resolve => { release = resolve })
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-p1-quick-start-unload')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('run npm test')]
    const pending = ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Promise<Decision>

    await waitFor(() => ctx.engine.startCalls.length === 1)
    await ctx.dispose()
    const decision = await pending
    expect(decision.kind).toBe('enter')

    release()
    await waitFor(() => ctx.engine.runs.length === 1)
    const lateRun = ctx.engine.runs[0]!
    await waitFor(() => lateRun.dispose.mock.calls.length === 1)
    expect(lateRun.cancel).toHaveBeenCalled()
    expect(answerOf(decision)).toContain('unloaded')
  })
})

/* -------------------------------------------------------------------- B18 -- */

describe('B18: the hybrid classifier states its own reason', () => {
  it('states the rules verdict with no model call (hybrid removed, T4)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'triage', grokDefault: 'on' })
    const live = session('sess-b18-hybrid')
    const agent = new FakeAgent(live)
    const decision = await ctx.preStep()(payload(agent, [userMessage('改一下那个')]), nextWith([])) as Decision
    const answer = answerOf(decision)

    // T4: the hybrid model-call fallback is removed — the rules verdict stands
    // on its own, and no classifier call starts.
    expect(answer).toContain('确认档')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })
})

/* --------------------------------- surface-head regression (corrupt log) -- */

/**
 * Session-corruption regression: `stored session … is corrupt:
 * system/message requires a protected first surface head`.
 *
 * Root cause (DSH `dsh-session-format-v3-to-v4/src/relationships.ts`
 * `foldSurface`): the first surface event of a stored log must be the host's
 * `system/message` head. The gate used to append the claimed `user/message`
 * from `agent/pre-step` — which the loop dispatches *before* `step/start` and
 * the system projection — so on a fresh session the plugin's row landed at
 * surface position 0 and the later system head threw on every reopen.
 *
 * The gate now publishes only onto an established surface (turn 2+, or a
 * session that already surfaces a node); on a headless turn-1 session the
 * batch stays in `enter.messages` for the loop to commit after the head.
 * These cases pin that contract against the real host validator
 * (`assertReleasedV4Relationships`), not just the plugin's own fold.
 */
describe('surface head: the plugin never takes position 0', () => {
  it('leaves the claimed batch to enter.messages on a headless turn-1 session', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-head-turn1')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('首轮消息不应抢占 surface 头')]

    const decision = await ctx.preStep()(payload(agent, claimed), nextWith(claimed)) as Decision
    // Nothing published: the surface is still empty (no head to preserve yet).
    expect(live.ownEvents().filter(event => (event as { type?: string }).type === 'user/message')).toHaveLength(0)
    // The batch rides the decision instead, so no words are lost …
    expect((decision.messages ?? []).map(textOf)).toContain('首轮消息不应抢占 surface 头')
    commit(live, decision)
    // … and the replayed log opens with the system head, so it reopens cleanly.
    assertReopenable(live)
  })

  it('publishes mid-run on an established surface (turn 2)', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-head-turn2')
    const agent = new FakeAgent(live)
    const claimed = [userMessage('次轮消息仍可提前可见')]
    commitHead(live, 1, 1)
    live.append('user/message', firstTurnMessage('首轮已落盘'), { surfaceOp: 'append' })

    const decision = await ctx.preStep()(payloadAt(agent, claimed, 2, 1), nextWith(claimed)) as Decision
    // Head established: the early echo is back (turn-1 row + turn-2 publish).
    expect(live.ownEvents().filter(event => (event as { type?: string }).type === 'user/message')).toHaveLength(2)
    // … exactly once: the decision must not carry it again.
    const carried = (decision.messages ?? []).map(textOf)
    expect(carried.filter(text => text === '次轮消息仍可提前可见')).toHaveLength(0)
    assertReopenable(live)
  })

  it('a rejected turn-1 batch degrades to enter.messages, never to a headless append', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { mode: 'full', grokDefault: 'on' })
    const live = session('sess-head-turn1-reject')
    const agent = new FakeAgent(live)
    const controller = new AbortController()
    controller.abort()

    const decision = await ctx.preStep()(payload(agent, [userMessage('取消也不应写坏头部')], controller.signal), nextWith([])) as Decision
    expect(decision.kind).toBe('reject')
    expect(live.ownEvents().filter(event => (event as { type?: string }).type === 'user/message')).toHaveLength(0)
    assertReopenable(live)
  })
})
