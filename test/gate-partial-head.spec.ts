/**
 * Presentation contract for a finished run (PARTIAL / FAILED / COMPLETED).
 *
 * Regression pinned here: session-4c562307 got a PARTIAL answer whose first line
 * was `Grok workflow: PARTIAL`. The plain-language head existed, but only for the
 * two paths that composed it themselves, and it said nothing a reader could act
 * on ("1/2 verified, see the report below"), while a FAILED run got no head at
 * all. This file pins one composer (`humanHead`) for every status and every path
 * that can deliver a report, plus the diagnostics switch on the delivered text.
 *
 * The harness mounts the real gate; only the workflow engine is a stub, and the
 * report it produces is the real one the real generated script returns.
 */

import { describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { apply } from '../src/index.js'
import { LEDGER_GUARD, REPORT_BEGIN, REPORT_END } from '../src/answer.js'
import { FIXED_HUMAN_SUMMARY, FIXED_SHOW_DIAGNOSTICS } from '../src/config.js'
import { cancelledText, humanHead } from '../src/gate.js'
import type { WorkflowReport } from '../src/types.js'
import { callerTask, execution, failingVerification, verification } from './fixtures.js'
import { runWorkflowScript, roleOf, taskFromPrompt } from './helpers.js'

/* ----------------------------------------------------------------- harness -- */

class FakeRun {
  readonly meta: WorkflowStartRequest['meta']
  readonly result: Promise<unknown>
  private resolve!: (value: unknown) => void
  readonly dispose = vi.fn(async () => {})
  readonly cancel = vi.fn(() => {})
  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.resolve = resolve })
  }
  complete(value: unknown): void {
    this.resolve({ value, stopReason: 'completed', agentsStarted: 1 })
  }
  fail(error: string): void {
    this.resolve({ value: null, stopReason: 'failed', agentsStarted: 1, error })
  }
}

/** How the stubbed engine shapes the run it was asked for. */
interface EngineShape {
  /** Task ids the planner returns. */
  plan: string[]
  /** Task ids whose verifier fails, so the run cannot be `completed`. */
  failing: string[]
  /** Fail the whole run instead of returning a report. */
  crash?: string
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  reply: string | undefined = 'ok'
  shape: EngineShape = { plan: ['a'], failing: [] }

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    if (request.meta.name === 'Front desk') {
      run.complete({ reply: this.reply })
      return run
    }
    if (this.shape.crash !== undefined) {
      run.fail(this.shape.crash)
      return run
    }
    const shape = this.shape
    const args = request.args as Record<string, unknown>
    const result = await runWorkflowScript(request.script, args, async (prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') return { tasks: shape.plan.map(id => callerTask(id)) }
      if (role === 'worker') return execution('work done')
      if (role === 'verifier') {
        const task = taskFromPrompt(prompt)
        return shape.failing.includes(task.id) ? failingVerification(task) : verification(task)
      }
      throw new Error(`unexpected label ${options.label}`)
    })
    run.complete(result.report)
    return run
  }
}

type Handler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

class FakeSession {
  readonly id = 'sess-partial-head'
  readonly header = {}
  ownEvents(): unknown[] { return [] }
  deriveMessages(): unknown[] { return [] }
  append(): number { return 0 }
}

class FakeAgent {
  // T4: in-turn is the only delivery. This stub exposes no whenIdle/followup,
  // so canBackgroundDeliver is false and the gate takes the blocking in-turn
  // path: the answer arrives as the entered step's message (see deliver()).
  readonly session = new FakeSession()
  readonly options = {}
}

class FakeContext {
  readonly handlers = new Map<string, Handler>()
  readonly engine = new FakeEngine()
  readonly workflowEngine = this.engine
  readonly warnings: string[] = []
  readonly tools = { register: () => () => {} }
  readonly systemPrompt = { section: () => () => {}, getSectionOrder: () => 2600 }
  readonly logger = () => ({ warn: (message: string) => { this.warnings.push(message) }, info: () => {} })
  on(event: string, handler: Handler): () => void {
    this.handlers.set(event, handler)
    return () => { this.handlers.delete(event) }
  }
  effect(installer: () => unknown): unknown { return installer() }
  preStep(): Handler {
    const handler = this.handlers.get('agent/pre-step')
    if (handler === undefined) throw new Error('gate did not register agent/pre-step')
    return handler
  }
}

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

function textOf(message: UserMessage): string {
  const content = message.content as { type: string, text?: string }[]
  return content.map(block => block.text ?? '').join('')
}

/**
 * Deliver one message through the real gate and return the text the plugin wrote.
 *
 * `mode` defaults to the deployment default (`triage`), so the front desk's team
 * branch is the path under test unless a case asks for `full`.
 *
 * T4: in-turn is the only delivery — the answer arrives as the entered step's
 * message, not as a followup. Followups only happen when the background path
 * cannot run (the engine shape here always completes, so the decision path is
 * what this helper reads).
 */
async function deliver(
  shape: EngineShape,
  request: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const ctx = new FakeContext()
  ctx.engine.shape = shape
  const agent = new FakeAgent()
  apply(ctx as never, { grokDefault: 'on', ...overrides })
  const send = async (text: string, turn: number): Promise<string> => {
    const messages = [userMessage(text)]
    const decision = await ctx.preStep()(
      { agent, messages, turn, step: 1, signal: new AbortController().signal },
      async () => ({ kind: 'enter', messages }),
    ) as { kind: string; messages?: UserMessage[] }
    expect(decision.kind).toBe('enter')
    const texts = (decision.messages ?? []).map(textOf)
    expect(texts.length).toBeGreaterThan(0)
    return texts[texts.length - 1]!
  }
  const first = await send(request, 1)
  // Round-071: the front desk's team path states the split before dispatching, so
  // the report shape under test arrives after the approval. `full` mode has no
  // front desk and therefore no confirmation round.
  if (!(first.includes('队长先报拆法') || first.includes('The captain states the split'))) return first
  return send('确认', 2)
}

const TEAM_ZH = '帮我重构 run.ts 的超时逻辑，并补上回归测试'
const TEAM_EN = 'Write a test suite for config.ts and run it'
const PARTIAL: EngineShape = { plan: ['a', 'b'], failing: ['b'] }
const COMPLETED: EngineShape = { plan: ['a'], failing: [] }
const FAILED: EngineShape = { plan: ['a'], failing: [], crash: 'provider exploded' }

/* ------------------------------------------------------------------- tests -- */

describe('a PARTIAL answer leads with a human conclusion and a next step', () => {
  it('opens with the head, not with the ledger, on the front desk team path', async () => {
    const text = await deliver(PARTIAL, TEAM_ZH)
    const head = text.indexOf('答案：')
    // The human block is user-visible content: inside the markers, above the ledger.
    expect(head).toBeGreaterThan(text.indexOf('<<<GROK-WORKFLOW-REPORT>>>'))
    expect(head).toBeLessThan(text.indexOf('Grok workflow: PARTIAL'))
    // What a reader needs: the answer first, the honest tail at the end.
    expect(text).toContain('项没做成')
    expect(text).toContain('没做成的：')
    // `stripIds` drops a `<id>:` prefix, so the row reads as a sentence:
    // the reason is what matters, not the fixture's `Task b` title.
    expect(text).toContain('verifier verdict was fail')
    expect(text).toContain('下一步：')
    // The ledger stays retrievable behind it, folded rather than pasted in.
    expect(text).toContain('Grok workflow: PARTIAL')
    expect(text).toContain('Incomplete:')
  })

  it('says the same in English, in the same order', async () => {
    const text = await deliver(PARTIAL, TEAM_EN)
    expect(text).toContain('Answer:')
    expect(text).toContain('Next:')
    expect(text.indexOf('Next:')).toBeGreaterThan(text.indexOf('Answer:'))
  })

  it('gives the full-mode path the same head (no path composes its own)', async () => {
    const text = await deliver(PARTIAL, TEAM_ZH, { mode: 'full' })
    expect(text).toContain('项没做成')
    expect(text).toContain('下一步：')
    expect(text.indexOf('答案：')).toBeLessThan(text.indexOf('Grok workflow: PARTIAL'))
  })

  it('always shows the head (humanSummary fixed on, T4)', async () => {
    // T4: humanSummary removed — the human block is unconditional (R-06
    // rejects the key, so pin the FIXED value and the fixed behaviour).
    expect(FIXED_HUMAN_SUMMARY).toBe(true)
    const text = await deliver(PARTIAL, TEAM_ZH)
    expect(text).toContain('答案：')
    expect(text).toContain('Grok workflow: PARTIAL')
  })

  it('heads a cancelled PARTIAL too, instead of relaying the bare ledger', async () => {
    const report = {
      status: 'partial',
      objective: 'do the thing',
      plan: { source: 'caller', tasks: [] },
      tasks: [
        { id: 'a', title: 'Task a', status: 'verified', attempts: [], expectedOutput: 'Output a' },
        { id: 'b', title: 'Task b', status: 'failed', attempts: [], expectedOutput: 'Output b', error: 'verifier verdict was fail' },
      ],
      confirmed: [],
      incomplete: [{ taskId: 'b', reason: 'verifier verdict was fail', category: 'quality' }],
      errors: [],
      uncertainties: [],
      routes: [],
      routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      limits: { maxConcurrency: 3, maxTasks: 12, maxTotalAgents: 48 },
    } as unknown as WorkflowReport
    const text = cancelledText('用户停止', report, { lang: 'zh' })
    expect(text).toContain('运行已取消')
    expect(text).toContain('项没做成')
    expect(text).toContain('下一步：')
    // Round 28: a cancelled turn never wears the packaging of a finished run —
    // no success preamble, no REPORT_BEGIN/END markers, no folded ledger.
    expect(text).not.toContain('finished and produced the result')
    expect(text).not.toContain('<<<GROK-WORKFLOW-REPORT>>>')
    expect(text).not.toContain('Confirmed evidence:')
    expect(text).not.toContain('Model routes:')
  })

  it('keeps the model-facing relay wrapper out of the cancelled transcript message', () => {
    // The cancelled message is appended straight into the transcript
    // (`session.append('assistant/message', …)`), so a reader reads it as the
    // assistant's own words. The relay preamble ("Reply with those lines exactly
    // as given… do not call any tool") and the `<<<GROK-WORKFLOW-REPORT>>>`
    // markers are instructions for the main model, and the ledger under them is
    // ids and routes — exactly the technical detail this text promises lives in
    // the progress nodes instead.
    const report = {
      status: 'partial',
      objective: 'do the thing',
      plan: { source: 'caller', tasks: [] },
      tasks: [
        { id: 'a', title: 'Task a', status: 'verified', attempts: [], expectedOutput: 'Output a' },
        { id: 'b', title: 'Task b', status: 'failed', attempts: [], expectedOutput: 'Output b', error: 'verifier verdict was fail' },
      ],
      confirmed: [],
      incomplete: [{ taskId: 'b', reason: 'verifier verdict was fail', category: 'quality' }],
      errors: [],
      uncertainties: [],
      routes: [],
      routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      limits: { maxConcurrency: 3, maxTasks: 12, maxTotalAgents: 48 },
    } as unknown as WorkflowReport
    const text = cancelledText('用户停止', report, { lang: 'zh' })
    expect(text).toContain('运行已取消')
    expect(text).toContain('技术细节在进度节点里')
    expect(text).not.toContain('Reply with those lines exactly as given')
    expect(text).not.toContain(REPORT_BEGIN)
    expect(text).not.toContain(REPORT_END)
    expect(text).not.toContain(LEDGER_GUARD)
    expect(text).not.toContain('Grok workflow: PARTIAL')
    expect(text).not.toContain('Model routes:')
  })

  it('says nothing had started instead of printing 0/0 when no task row exists', () => {
    // A plan/deadline failure keeps a report with `tasks: []`. The fraction then
    // read `0/0`, which a reader cannot parse and which reads as "nothing was
    // verified" rather than "nothing was ever started".
    const report = {
      status: 'failed',
      objective: 'do the thing',
      plan: { source: 'caller', tasks: [] },
      tasks: [],
      confirmed: [],
      incomplete: [],
      errors: [{ phase: 'plan', message: 'deadline exceeded' }],
      uncertainties: [],
      routes: [],
      routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      limits: { maxConcurrency: 3, maxTasks: 12, maxTotalAgents: 48 },
    } as unknown as WorkflowReport
    const text = cancelledText('时间到了', report, { lang: 'zh' })
    expect(text).toContain('运行已取消')
    expect(text).not.toContain('0/0')
    expect(text).toContain('还没有任何一项任务开工')
    expect(text).toContain('原因：deadline exceeded')
  })
})

describe('a FAILED answer leads with a human conclusion, never with a success claim', () => {
  it('states the failure and what to do about it', async () => {
    const text = await deliver(FAILED, TEAM_ZH)
    expect(text).toContain('这次没做成')
    expect(text).toContain('明细已记入台账')
    expect(text).toContain('原因：provider exploded')
    expect(text).toContain('下一步：')
    // The infrastructure advice, not the "your task was bad" advice.
    expect(text).toContain('这次卡在外部服务或时限上')
    expect(text).toContain('This was an external service or deadline problem')
    // Never the success tail.
    expect(text).not.toContain('以上是结论；明细已记入台账。')
    // The ledger is still there for anyone who wants it.
    expect(text).toContain('Grok workflow: FAILED')
  })

  it('keeps the failure marker out of the success path', async () => {
    const text = await deliver(COMPLETED, TEAM_ZH)
    expect(text).toContain('以上是结论；明细已记入台账。')
    expect(text).not.toContain('这次没做成')
  })
})

describe('a COMPLETED answer is unchanged and its ledger stays retrievable', () => {
  it('keeps the human block first and the machine report folded behind it', async () => {
    const text = await deliver(COMPLETED, TEAM_ZH)
    expect(text).toContain('以上是结论；明细已记入台账。')
    expect(text).toContain('<<<GROK-WORKFLOW-REPORT>>>')
    expect(text).toContain('<<<END-GROK-WORKFLOW-REPORT>>>')
    // The block sits between the markers; the ledger does not.
    const visible = text.slice(text.indexOf('<<<GROK-WORKFLOW-REPORT>>>'), text.indexOf('<<<END-GROK-WORKFLOW-REPORT>>>'))
    expect(visible).toContain('答案：')
    expect(visible).not.toContain('Confirmed evidence:')
    // ...and it stays retrievable below them.
    expect(text.slice(text.indexOf('<<<END-GROK-WORKFLOW-REPORT>>>'))).toContain('Grok workflow: COMPLETED')
    expect(text).toContain('Confirmed evidence:')
  })
})

describe('machine diagnostics follow the switch on the delivered text', () => {
  it('hides the routing ledger from the visible block by default', async () => {
    const text = await deliver(COMPLETED, TEAM_ZH)
    const visible = text.slice(text.indexOf('<<<GROK-WORKFLOW-REPORT>>>'), text.indexOf('<<<END-GROK-WORKFLOW-REPORT>>>'))
    expect(visible).not.toContain('Model routes:')
    expect(visible).not.toContain('Deadline:')
    expect(visible).not.toContain('Confirmed evidence:')
  })

  it('keeps diagnostics off (showDiagnostics fixed false, T4)', async () => {
    // T4: showDiagnostics removed — the visible head never carries the
    // routing ledger (R-06 rejects the key, so pin the FIXED value and the
    // fixed behaviour). The ledger itself stays retrievable behind the
    // markers (pinned by the COMPLETED case above).
    expect(FIXED_SHOW_DIAGNOSTICS).toBe(false)
    const text = await deliver(COMPLETED, TEAM_ZH)
    const visible = text.slice(text.indexOf('<<<GROK-WORKFLOW-REPORT>>>'), text.indexOf('<<<END-GROK-WORKFLOW-REPORT>>>'))
    expect(visible).not.toContain('Model routes:')
    expect(visible).not.toContain('Deadline:')
    expect(visible).toContain('答案：')
  })
})

describe('humanHead is the single composer', () => {
  const base = {
    objective: 'do the thing',
    plan: { source: 'caller', tasks: [] },
    tasks: [
      { id: 'a', title: 'Task a', status: 'verified', attempts: [] },
      { id: 'b', title: 'Task b', status: 'failed', attempts: [] },
    ],
    confirmed: [],
    incomplete: [{ taskId: 'b', reason: 'verifier verdict was fail', category: 'quality' }],
    errors: [],
    uncertainties: [],
    routes: [],
    routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
    synthesis: { mode: 'deterministic' },
    limits: { maxConcurrency: 3, maxTasks: 12, maxTotalAgents: 48 },
  }

  it('always returns the head (switch fixed on, T4)', () => {
    // T4: humanSummary removed — the third arg is ignored, the head is
    // unconditional. Pin both spellings of "off".
    expect(FIXED_HUMAN_SUMMARY).toBe(true)
    for (const status of ['completed', 'partial', 'failed'] as const) {
      const report = { ...base, status } as unknown as WorkflowReport
      expect(humanHead(report, 'zh', false)).toContain('下一步：')
      expect(humanHead(report, 'zh', true)).toContain('下一步：')
    }
  })

  it('bounds the unfinished-task list instead of pasting every title', () => {
    const failed = ['b', 'c', 'd', 'e', 'f', 'g', 'h']
      .map(id => ({ id, title: `Task ${id}`, status: 'failed', attempts: [] }))
    const report = {
      ...base,
      status: 'partial',
      tasks: [base.tasks[0], ...failed],
    } as unknown as WorkflowReport
    const head = humanHead(report, 'zh', true) ?? ''
    // Five rows are named; the rest is a count, not five more titles.
    expect(head).toContain('另有 2 项没做成')
    expect(head.length).toBeLessThan(1200)
  })
})
