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
  readonly followups: UserMessage[] = []
  readonly session = new FakeSession()
  readonly options = {}
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
  readonly whenIdle = vi.fn(async () => {})
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
 */
async function deliver(
  shape: EngineShape,
  request: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const ctx = new FakeContext()
  ctx.engine.shape = shape
  const agent = new FakeAgent()
  apply(ctx as never, { answerStrategy: 'relay', grokDefault: 'on', ...overrides })
  const messages = [userMessage(request)]
  await ctx.preStep()(
    { agent, messages, turn: 1, step: 1, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages }),
  )
  await vi.waitFor(() => {
    if (agent.followups.length === 0) throw new Error('no answer delivered')
  })
  return textOf(agent.followups[0]!)
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
    const head = text.indexOf('【人话结论】')
    // The head is user-visible content: inside the markers, above the ledger.
    expect(head).toBeGreaterThan(text.indexOf('<<<GROK-WORKFLOW-REPORT>>>'))
    expect(head).toBeLessThan(text.indexOf('Grok workflow: PARTIAL'))
    // What a reader needs: how much got done, what did not, and what to do next.
    expect(text).toContain('任务 1/2 项已核验通过')
    expect(text).toContain('1 项没做成（Task b）')
    expect(text).toContain('下一步：')
    // The ledger stays retrievable behind it.
    expect(text).toContain('Grok workflow: PARTIAL')
    expect(text).toContain('Incomplete:')
  })

  it('says the same in English, in the same order', async () => {
    const text = await deliver(PARTIAL, TEAM_EN)
    expect(text).toContain('【Plain summary】1/2 tasks verified; 1 did not get done (Task b)')
    expect(text).toContain('Next:')
    expect(text.indexOf('Next:')).toBeGreaterThan(text.indexOf('【Plain summary】'))
  })

  it('gives the full-mode path the same head (no path composes its own)', async () => {
    const text = await deliver(PARTIAL, TEAM_ZH, { mode: 'full' })
    expect(text).toContain('【人话结论】任务 1/2 项已核验通过')
    expect(text).toContain('下一步：')
    expect(text.indexOf('【人话结论】')).toBeLessThan(text.indexOf('Grok workflow: PARTIAL'))
  })

  it('keeps the head off when humanSummary is off', async () => {
    const text = await deliver(PARTIAL, TEAM_ZH, { humanSummary: false })
    expect(text).not.toContain('【人话结论】')
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
      routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      limits: { maxConcurrency: 3, maxRetries: 1, maxTasks: 12, maxTotalAgents: 48 },
    } as unknown as WorkflowReport
    const text = cancelledText('用户停止', report, { lang: 'zh' })
    expect(text).toContain('运行已取消')
    expect(text).toContain('【人话结论】任务 1/2 项已核验通过，1 项没做成（Task b）')
    expect(text).toContain('下一步：')
  })
})

describe('a FAILED answer leads with a human conclusion, never with a success claim', () => {
  it('states the failure and what to do about it', async () => {
    const text = await deliver(FAILED, TEAM_ZH)
    expect(text).toContain('【人话结论·未完成】')
    expect(text).toContain('这次没有做成，没有可交付的结果')
    expect(text).toContain('原因：provider exploded')
    expect(text).toContain('下一步：')
    // The infrastructure advice, not the "your task was bad" advice.
    expect(text).toContain('模型或网络一侧')
    // Never the success wording.
    expect(text).not.toContain('【人话结论】')
    // The ledger is still there for anyone who wants it.
    expect(text).toContain('Grok workflow: FAILED')
  })

  it('keeps the failure marker out of the success path', async () => {
    const text = await deliver(COMPLETED, TEAM_ZH)
    expect(text).toContain('【人话结论】')
    expect(text).not.toContain('【人话结论·未完成】')
  })
})

describe('a COMPLETED answer is unchanged and its ledger stays retrievable', () => {
  it('keeps the 0.7.0 head wording and the machine report behind it', async () => {
    const text = await deliver(COMPLETED, TEAM_ZH)
    expect(text).toContain('【人话结论】任务 1/1 项已核验通过。')
    expect(text).toContain('（原文报告附后）')
    expect(text).toContain('<<<GROK-WORKFLOW-REPORT>>>')
    expect(text).toContain('<<<END-GROK-WORKFLOW-REPORT>>>')
    expect(text).toContain('Grok workflow: COMPLETED')
    expect(text).toContain('Confirmed evidence:')
  })
})

describe('machine diagnostics follow the switch on the delivered text', () => {
  it('hides the routing ledger by default', async () => {
    const text = await deliver(COMPLETED, TEAM_ZH)
    expect(text).not.toContain('Model routes:')
    expect(text).not.toContain('Deadline:')
  })

  it('shows it when showDiagnostics is on, under the same head', async () => {
    const text = await deliver(COMPLETED, TEAM_ZH, { showDiagnostics: true })
    expect(text).toContain('Model routes:')
    expect(text).toContain('Deadline:')
    expect(text.indexOf('【人话结论】')).toBeLessThan(text.indexOf('Model routes:'))
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
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic' },
    limits: { maxConcurrency: 3, maxRetries: 1, maxTasks: 12, maxTotalAgents: 48 },
  }

  it('returns nothing when the switch is off, for every status', () => {
    for (const status of ['completed', 'partial', 'failed'] as const) {
      const report = { ...base, status } as unknown as WorkflowReport
      expect(humanHead(report, 'zh', false)).toBeUndefined()
    }
  })

  it('bounds the unfinished-task list instead of pasting every title', () => {
    const report = {
      ...base,
      status: 'partial',
      tasks: [
        base.tasks[0],
        { id: 'b', title: 'Task b', status: 'failed', attempts: [] },
        { id: 'c', title: 'Task c', status: 'failed', attempts: [] },
        { id: 'd', title: 'Task d', status: 'failed', attempts: [] },
        { id: 'e', title: 'Task e', status: 'failed', attempts: [] },
      ],
    } as unknown as WorkflowReport
    const head = humanHead(report, 'zh', true) ?? ''
    expect(head).toContain('等 4 项')
    expect(head.length).toBeLessThan(600)
  })
})
