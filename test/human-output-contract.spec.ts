/**
 * 人话交付契约 / the human-language delivery contract, pinned offline.
 *
 * What a reader is promised after a run (v0.7.0 "B plan"):
 *
 * 1. A COMPLETED and a PARTIAL run open with one plain-language sentence
 *    (`【人话结论】… 项已核验通过`), then the report. A FAILED run never opens with
 *    that success-styled sentence, because a failure must not look like an answer.
 * 2. The machine ledger — `Model routes:`, `Deadline:`, `Route switches:`,
 *    `Route overflows`, `Errors:` — is not part of the default view. It is
 *    retrievable on request through the `showDiagnostics` switch (default `false`).
 *    `Uncertainties:` stays visible either way: it is a truthful caveat a reader
 *    needs, not a routing ledger, and carry-over parses it back out of the report.
 *
 * Boundaries (read before trusting a green run):
 * - The only fakes are the workflow *engine* (a stub that hands back a fixed
 *   report) and the agent/session surface DSH would provide. `apply()`, the real
 *   cordis `agent/pre-step` waterfall, the real `ToolRuntime` registry, the real
 *   report validator (`assertWorkflowReport`) and the real renderer all run.
 * - Deterministic and offline: no model call, no network, no clock. Every
 *   assertion is about text this plugin composed.
 * - This file pins the *delivery contract* only. It does not certify that the
 *   implementation behind it is correct, and it does not replace a real-DSH
 *   interaction run (that lives in `test/loader.spec.ts` and the e2e script).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { apply } from '../src/index.js'
import { REPORT_BEGIN, REPORT_END, relayText } from '../src/answer.js'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport, failureReport, renderReport } from '../src/report.js'
import { maxTotalAgentsFor } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

/**
 * The internal-term glossary this contract is about.
 *
 * Every entry is a string that only the machine ledger produces. A term that the
 * report itself legitimately shows (`Objective:`, `Confirmed evidence:`,
 * `Uncertainties:`, task rows) is deliberately NOT here — hiding those would be a
 * different, wrong contract.
 */
const INTERNAL_TERMS = [
  'Model routes:',
  'Deadline:',
  'per run (enforced by the plugin)',
  'Route switches:',
  'Route overflows',
  'skipped full',
  'skipped busy',
  'cross-run hint',
  'Errors:',
] as const

/** The Chinese sentence the gate composes for a completed/partial run. */
const HUMAN_HEADER = '【人话结论】'

const LIMITS = { maxConcurrency: 2, maxRetries: 1, maxTasks: 4 } as const
const config = resolveConfig(LIMITS)
const OBJECTIVE = '查一下新加坡这周的天气并给出出行建议'

/* ----------------------------------------------------------------- fixtures -- */

/** A legal COMPLETED report: one verified task, its evidence confirmed. */
function completedReport(objective = OBJECTIVE): WorkflowReport {
  const planTask = task('a', ['天气已核验'])
  const checked = verification(planTask)
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'completed',
    objective,
    plan: { source: 'caller', tasks: [planTask], error: '' },
    tasks: [{
      ...planTask,
      status: 'verified',
      attempts: [{ attempt: 1, execution: execution('查到新加坡本周多雨'), verification: checked, passed: true, error: '' }],
      error: '',
    }],
    confirmed: [{ taskId: 'a', criterion: '天气已核验', evidence: checked.criteria[0]!.evidence }],
    incomplete: [],
    errors: [],
    uncertainties: [],
    synthesis: { mode: 'deterministic', summary: '新加坡本周多雨，出行请带伞。' },
    limits: { ...LIMITS, maxTotalAgents: maxTotalAgentsFor(1, LIMITS.maxRetries), timeoutMs: config.timeoutMs },
  }, objective, config)
}

/**
 * A legal PARTIAL report: one verified task, one failed task.
 *
 * It carries every ledger-shaped field on purpose (a route that switched, a lane
 * that yielded, a cross-run hint, a deadline, an error) so the "hidden by default,
 * retrievable on request" assertion below has something real to hide.
 */
function partialReport(objective = OBJECTIVE): WorkflowReport {
  const ok = task('a', ['天气已核验'])
  const bad = task('b', ['酒店价格已核验'])
  const checked = verification(ok)
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'partial',
    objective,
    plan: { source: 'caller', tasks: [ok, bad], error: '' },
    tasks: [
      {
        ...ok,
        status: 'verified',
        attempts: [{ attempt: 1, execution: execution('查到新加坡本周多雨'), verification: checked, passed: true, error: '' }],
        error: '',
      },
      {
        ...bad,
        status: 'failed',
        attempts: [{
          attempt: 1,
          execution: execution('尝试查询酒店价格'),
          verification: failingVerification(bad, '价格来源打不开'),
          passed: false,
          error: '价格来源打不开',
        }],
        error: '价格来源打不开',
      },
    ],
    confirmed: [{ taskId: 'a', criterion: '天气已核验', evidence: checked.criteria[0]!.evidence }],
    incomplete: [{ taskId: 'b', reason: '价格来源打不开', category: 'infrastructure' }],
    errors: [{ phase: 'Verify', message: '价格来源打不开', category: 'infrastructure' }],
    uncertainties: [{ taskId: 'b', text: '酒店价格未取得，预算建议可能偏差' }],
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    routes: [
      { role: 'worker', chainIndex: 0, route: 'default', attempt: 1, outcome: 'failed', failureClass: 'rate-limit', reason: '429 Too Many Requests' },
      { role: 'worker', chainIndex: 0, route: 'default', attempt: 1, outcome: 'ok', skippedBusy: ['busy-lane'], queuedMs: 12 },
      { role: 'verifier', chainIndex: 0, route: 'default', attempt: 1, outcome: 'ok', skippedBusy: ['other-lane (cross-run hint)'] },
    ],
    synthesis: { mode: 'deterministic', summary: '天气已核验；酒店价格未取得。' },
    limits: { ...LIMITS, maxTotalAgents: maxTotalAgentsFor(2, LIMITS.maxRetries), timeoutMs: config.timeoutMs },
  }, objective, config)
}

/* ------------------------------------------------------------------- engine -- */

interface EngineResult {
  value: unknown
  stopReason: string
  agentsStarted: number
}

/** One run the stub engine handed out; the test decides how it ends. */
class StubRun {
  readonly id = 'run-human-output'
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

  /** End the run with a value the gate will validate and render. */
  complete(value: unknown): void {
    this.resolve({ value, stopReason: 'completed', agentsStarted: 2 })
  }

  /** End the run the way a broken engine does: no value, an error. */
  fail(stopReason: string, error?: string): void {
    this.resolve({ value: null, stopReason, agentsStarted: 1, ...error === undefined ? {} : { error } } as EngineResult)
  }
}

class StubEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: StubRun[] = []

  async start(request: WorkflowStartRequest): Promise<StubRun> {
    this.startCalls.push(request)
    const run = new StubRun(request)
    this.runs.push(run)
    request.signal?.addEventListener('abort', () => run.cancel('signal aborted'), { once: true })
    return run
  }
}

/* -------------------------------------------------------------------- agent -- */

/** Minimal session surface the gate reads: header, id, records. */
class StubSession {
  readonly id = 'sess-human-output'
  readonly header = {}
  readonly messages: unknown[] = []

  ownEvents(): unknown[] { return [] }
  deriveMessages(): unknown[] { return this.messages }
  append(): number { return 0 }
}

class StubAgent {
  readonly session = new StubSession()
  readonly followups: UserMessage[] = []
  readonly whenIdle = vi.fn(async () => {})
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
}

function userMessage(text: string): UserMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  } as unknown as UserMessage
}

/** All text a delivered relay message carries. */
function textOf(message: UserMessage): string {
  return (message.content as { type: string; text?: string }[])
    .filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('\n')
}

async function waitFor(predicate: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    if (!predicate()) throw new Error('condition not met')
  })
}

/* ------------------------------------------------------------------ harness -- */

/** Every context this file mounted, so a test cannot leak a live registration. */
const mountedContexts: Context[] = []

afterEach(async () => {
  for (const ctx of mountedContexts.splice(0)) {
    try { await ctx.fiber.dispose() } catch { /* already disposed */ }
  }
})

interface Mounted {
  ctx: Context
  engine: StubEngine
}

/**
 * Mount the plugin on a **real** cordis context.
 *
 * `tools` and `systemPrompt` are the real DSH services, so the tool registration
 * this file inspects is the registration the runtime would serve; only the
 * workflow engine is a stub (it is the process that would spend model calls).
 *
 * @param overrides - plugin configuration; a `{ get }` holder stands in for the
 *   live settings value the runtime writes for a volatile field.
 */
async function mount(overrides: Record<string, unknown> = {}): Promise<Mounted> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const engine = new StubEngine()
  await ctx.plugin({
    name: 'stub-workflow-engine',
    apply(inner: Context) { inner.provide('workflowEngine', engine) },
  } as never, {} as never)
  apply(ctx as never, {
    // `full` keeps every message on the team path (the front desk has its own
    // suite); `relay` refuses the batch and delivers in a later turn, which is the
    // path whose text this file is about.
    answerStrategy: 'relay',
    mode: 'full',
    grokDefault: 'on',
    ...LIMITS,
    ...overrides,
  })
  mountedContexts.push(ctx)
  return { ctx, engine }
}

/**
 * Drive one message through the real `agent/pre-step` waterfall.
 *
 * @returns the agent the gate delivered to, once the run has been handed out.
 */
async function deliver(mounted: Mounted, request = OBJECTIVE): Promise<StubAgent> {
  const agent = new StubAgent()
  const messages = [userMessage(request)]
  await mounted.ctx.waterfall(
    'agent/pre-step',
    { agent, messages, turn: 1, step: 1, signal: new AbortController().signal } as never,
    async () => ({ kind: 'enter', messages }),
  )
  await waitFor(() => mounted.engine.runs.length === 1)
  return agent
}

/** The objective the gate actually handed the engine (never assumed). */
function objectiveOf(mounted: Mounted): string {
  return String((mounted.engine.startCalls[0]!.args as { objective: string }).objective)
}

/** Render a report through the tool the plugin registered on the real registry. */
function renderThroughTool(mounted: Mounted, report: WorkflowReport): string {
  const tool = mounted.ctx.tools.get('grok_workflow')
  expect(tool, 'the plugin must register grok_workflow with the real tool registry').toBeDefined()
  const blocks = tool!.output.render({}, report as never) as { type: string; text?: string }[]
  return blocks.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n')
}

/* -------------------------------------------------------------------- tests -- */

describe('人话优先：COMPLETED 与 PARTIAL 都以人话开头', () => {
  it('opens a COMPLETED run with the plain summary, inside the relay markers', async () => {
    const mounted = await mount()
    const agent = await deliver(mounted)
    mounted.engine.runs[0]!.complete(completedReport(objectiveOf(mounted)))
    await waitFor(() => agent.followups.length === 1)
    const text = textOf(agent.followups[0]!)

    // The sentence a reader can act on comes first, and the main model is told to
    // reproduce it verbatim — so it must sit inside the markers, not before them.
    expect(text).toContain(HUMAN_HEADER)
    expect(text.indexOf(HUMAN_HEADER)).toBeGreaterThan(text.indexOf(REPORT_BEGIN))
    expect(text.indexOf(HUMAN_HEADER)).toBeLessThan(text.indexOf(REPORT_END))
    expect(text).toContain('任务 1/1 项已核验通过')
    // The plain sentence carries the run's own conclusion, not a template only.
    expect(text).toContain('新加坡本周多雨，出行请带伞。')
    // The report is still there, under the sentence.
    expect(text).toContain('Grok workflow: COMPLETED')
    expect(text).toContain('Final answer:')
    for (const term of INTERNAL_TERMS) expect(text).not.toContain(term)
  })

  it('opens a PARTIAL run with the plain summary too, and keeps the caveat visible', async () => {
    const mounted = await mount()
    const agent = await deliver(mounted)
    mounted.engine.runs[0]!.complete(partialReport(objectiveOf(mounted)))
    await waitFor(() => agent.followups.length === 1)
    const text = textOf(agent.followups[0]!)

    expect(text).toContain(HUMAN_HEADER)
    // 1 of 2 verified: the count is the honest one, not "all done".
    expect(text).toContain('任务 1/2 项已核验通过')
    expect(text).toContain('Grok workflow: PARTIAL')
    expect(text).toContain('Incomplete:')
    // `Uncertainties:` is outside the ledger gate on purpose: a reader needs it.
    expect(text).toContain('Uncertainties:')
    expect(text).toContain('酒店价格未取得，预算建议可能偏差')
    for (const term of INTERNAL_TERMS) expect(text).not.toContain(term)
  })

  it('never dresses a FAILED run in the success sentence', async () => {
    const mounted = await mount()
    const agent = await deliver(mounted)
    mounted.engine.runs[0]!.fail('error', 'boom')
    await waitFor(() => agent.followups.length === 1)
    const text = textOf(agent.followups[0]!)

    expect(text).toContain('Grok workflow: FAILED')
    expect(text).toContain('boom')
    expect(text).not.toContain(HUMAN_HEADER)
    for (const term of INTERNAL_TERMS) expect(text).not.toContain(term)
  })

  it('keeps the human sentence out of the report when humanSummary is switched off', async () => {
    const mounted = await mount({ humanSummary: false })
    const agent = await deliver(mounted)
    mounted.engine.runs[0]!.complete(completedReport(objectiveOf(mounted)))
    await waitFor(() => agent.followups.length === 1)
    const text = textOf(agent.followups[0]!)

    expect(text).not.toContain(HUMAN_HEADER)
    expect(text).toContain('Grok workflow: COMPLETED')
  })
})

describe('诊断开关：默认隐藏，opt-in 才取回', () => {
  it('defaults the switch to off', () => {
    expect(resolveConfig({}).showDiagnostics).toBe(false)
    expect(config.showDiagnostics).toBe(false)
  })

  it('hides every internal term in the default view of a partial report', () => {
    const text = renderReport(partialReport())
    for (const term of INTERNAL_TERMS) expect(text).not.toContain(term)
    // The reader-facing parts of the same report are untouched.
    expect(text).toContain('Grok workflow: PARTIAL')
    expect(text).toContain('Confirmed evidence:')
  })

  it('returns every internal term when the renderer is asked for the ledger', () => {
    const text = renderReport(partialReport(), { showDiagnostics: true })
    for (const term of INTERNAL_TERMS) expect(text).toContain(term)
  })

  it('follows the live setting through the registered tool, without a remount', async () => {
    // A volatile field reaches `apply()` as a holder the settings UI writes; the
    // tool reads it at render time, so one mount can observe both states.
    let switchOn = false
    const mounted = await mount({ showDiagnostics: { get: () => switchOn } })
    const report = partialReport()

    const off = renderThroughTool(mounted, report)
    for (const term of INTERNAL_TERMS) expect(off).not.toContain(term)
    expect(off).toContain('Grok workflow: PARTIAL')

    switchOn = true
    const on = renderThroughTool(mounted, report)
    for (const term of INTERNAL_TERMS) expect(on).toContain(term)
    // Same report, same registration: only the switch moved.
    expect(on).toContain('Grok workflow: PARTIAL')
  })
})

describe('内部术语表：默认输出与 opt-in 输出互为补集', () => {
  it('never leaks a ledger term into the relay text, whatever the run status', () => {
    const completed = completedReport()
    const partial = partialReport()
    const failed = failureReport(OBJECTIVE, config, 'Plan', 'planner unavailable')
    const header = `${HUMAN_HEADER}任务 1/1 项已核验通过。\n\n（原文报告附后）`
    const surfaces = [
      relayText(completed, header),
      relayText(partial, header),
      relayText(failed),
    ]
    for (const text of surfaces) {
      for (const term of INTERNAL_TERMS) expect(text).not.toContain(term)
    }
    // ...and each term is still reachable on request, from the same report.
    const opted = renderReport(partial, { showDiagnostics: true })
    for (const term of INTERNAL_TERMS) expect(opted).toContain(term)
  })
})
