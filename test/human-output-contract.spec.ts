/**
 * 人话交付契约 / the human-language delivery contract, pinned offline.
 *
 * What a reader is promised after a run:
 *
 * 1. The delivered message opens with one plain-language block — what was done,
 *    what came of it, what is next — in both languages (`src/delivery/index.ts`).
 * 2. The machine ledger is *not* part of that block. It is folded below the
 *    closing relay marker, where the preamble forbids quoting it, and it is the
 *    durable copy cross-round carry-over parses back out. `showDiagnostics` moves
 *    it inside the markers, which is the only way a reader sees it. `Uncertainties`
 *    rides in the ledger like every other field: the human block states the
 *    caveats it knows in its own words.
 * 3. A FAILED run never opens with the completed wording, because a failure must
 *    not look like an answer.
 *
 * Boundaries (read before trusting a green run):
 * - The only fakes are the workflow *engine* (a stub that hands back a fixed
 *   report) and the agent/session surface DSH would provide. `apply()`, the real
 *   cordis `agent/pre-step` waterfall, the real `ToolRuntime` registry, the real
 *   report validator (`assertWorkflowReport`) and the real composers all run.
 * - Deterministic and offline: no model call, no network, no clock. Every
 *   assertion is about text this plugin composed.
 * - This file pins the *delivery contract* through the mounted plugin. It does
 *   not certify that the implementation behind it is correct, and it does not
 *   replace a real-DSH interaction run (that lives in `test/loader.spec.ts` and
 *   the e2e script).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { apply } from '../src/index.js'
import { LEDGER_GUARD, REPORT_BEGIN, REPORT_END, relayText } from '../src/answer.js'
import { resolveConfig, FIXED_MAX_RETRIES, FIXED_TIMEOUT_MS } from '../src/config.js'
import { assertWorkflowReport, failureReport, renderReport } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

/**
 * The internal-term glossary this contract is about.
 *
 * Every entry is a string that only the machine ledger produces.
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

/** The machine-only section labels the visible block must not carry either. */
const LEDGER_LABELS = [
  'Grok workflow:',
  'Objective:',
  'Plan:',
  'Failures:',
  'Confirmed evidence:',
  'Incomplete:',
  'Final answer:',
  'Uncertainties:',
  'Child budget:',
] as const

/** The marker a COMPLETED run's human block opens with (answer-first). */
const HUMAN_DONE = '答案：'
/** The tail a COMPLETED run's human block closes with (count lives here). */
const HUMAN_DONE_TAIL = '以上是结论；明细已记入台账。'
/** The tail a PARTIAL run's human block closes with (honest count lives here). */
const HUMAN_PARTLY = '项没做成'
/** The sentence a FAILED run opens with. */
const HUMAN_FAILED = '这次没做成'

const LIMITS = { maxConcurrency: 2, maxTasks: 4 } as const
/** Wire-format retry count: the report still carries maxRetries, always 1 (T4). */
const WIRE_RETRIES = 1 as const
const config = resolveConfig(LIMITS)
const OBJECTIVE = '查一下新加坡这周的天气并给出出行建议'

/** The slice of a relay message a reader actually sees. */
function between(text: string): string {
  const start = text.indexOf(REPORT_BEGIN)
  const end = text.indexOf(REPORT_END)
  if (start < 0 || end < start) return ''
  return text.slice(start + REPORT_BEGIN.length, end)
}

/**
 * Split a rendered view into its answer half and its audit tail (D-132).
 *
 * @returns `[answer, trail]`; `trail` is undefined when the view carries no tail.
 */
function splitAuditTail(text: string): [string, string | undefined] {
  const at = text.indexOf('Technical audit trail')
  return at < 0 ? [text, undefined] : [text.slice(0, at), text.slice(at)]
}

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
    limits: { ...LIMITS, maxRetries: WIRE_RETRIES, timeoutMs: FIXED_TIMEOUT_MS, maxTotalAgents: maxTotalAgentsFor(1, FIXED_MAX_RETRIES, routeBudgetFor(config))},
  }, objective, config)
}

/**
 * A legal PARTIAL report: one verified task, one failed task.
 *
 * It carries every ledger-shaped field on purpose (a route that switched, a lane
 * that yielded, a cross-run hint, a deadline, an error) so the "folded by default,
 * retrievable on request" assertion below has something real to fold.
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
    routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
    routes: [
      { role: 'worker', chainIndex: 0, route: 'default', attempt: 1, outcome: 'failed', failureClass: 'rate-limit', reason: '429 Too Many Requests' },
      { role: 'worker', chainIndex: 0, route: 'default', attempt: 1, outcome: 'ok', skippedBusy: ['busy-lane'], queuedMs: 12 },
      { role: 'verifier', chainIndex: 0, route: 'default', attempt: 1, outcome: 'ok', skippedBusy: ['other-lane (cross-run hint)'] },
    ],
    synthesis: { mode: 'deterministic', summary: '天气已核验；酒店价格未取得。' },
    limits: { ...LIMITS, maxRetries: WIRE_RETRIES, timeoutMs: FIXED_TIMEOUT_MS, maxTotalAgents: maxTotalAgentsFor(2, FIXED_MAX_RETRIES, routeBudgetFor(config))},
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
  // 5 s, not the 1 s default: the suite mounts a real cordis context per test and
  // runs beside other spec files, and a loaded machine must not turn a correct
  // gate into a red test.
  await vi.waitFor(() => {
    if (!predicate()) throw new Error('condition not met')
  }, { timeout: 5_000 })
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
    // suite). T4 in-turn: `full` also skips the interactive first-answer branch,
    // so one workflow run maps to one engine run — the 1:1 the `deliver`
    // helper below assumes (`runs[0]` is the workflow run).
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
/**
 * Drive one message through the real `agent/pre-step` waterfall.
 *
 * T4 in-turn: the waterfall stays open for the whole run, so this only starts
 * the admission and waits for the engine to take the run — the caller settles
 * the run and then awaits `done` for the entered decision.
 *
 * @returns the agent plus the open waterfall promise.
 */
async function deliver(mounted: Mounted, request = OBJECTIVE): Promise<{ agent: StubAgent; done: Promise<unknown> }> {
  const agent = new StubAgent()
  const messages = [userMessage(request)]
  const done = mounted.ctx.waterfall(
    'agent/pre-step',
    { agent, messages, turn: 1, step: 1, signal: new AbortController().signal } as never,
    async () => ({ kind: 'enter', messages }),
  )
  await waitFor(() => mounted.engine.runs.length === 1)
  return { agent, done }
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
    const { agent, done } = await deliver(mounted)
    mounted.engine.runs[0]!.complete(completedReport(objectiveOf(mounted)))
    const decision = await done as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    const text = textOf(decision.messages[decision.messages.length - 1]!)
    const visible = between(text)

    // The sentence a reader can act on comes first, and the main model is told to
    // reproduce it verbatim — so it must sit inside the markers, not before them.
    expect(visible).toContain(HUMAN_DONE)
    expect(text.indexOf(HUMAN_DONE)).toBeGreaterThan(text.indexOf(REPORT_BEGIN))
    expect(text.indexOf(HUMAN_DONE)).toBeLessThan(text.indexOf(REPORT_END))
    expect(visible).toContain(HUMAN_DONE_TAIL)
    // The plain sentence carries the run's own conclusion, not a template only.
    expect(visible).toContain('新加坡本周多雨，出行请带伞。')
    // One language, the request's (round-075): the mirror is gone, so the reader is
    // not handed the same answer twice and the model is not asked to pick a half.
    expect(visible).not.toContain('Answer:')
  })

  it('opens a PARTIAL run with the plain summary too, with the honest count', async () => {
    const mounted = await mount()
    const { agent, done } = await deliver(mounted)
    mounted.engine.runs[0]!.complete(partialReport(objectiveOf(mounted)))
    const decision = await done as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    const text = textOf(decision.messages[decision.messages.length - 1]!)
    const visible = between(text)

    expect(visible).toContain(HUMAN_PARTLY)
    // The honest count lives in the tail, not up front.
    expect(visible).toContain('项可用')
    expect(visible).not.toContain('Answer:')
    // The caveat a reader needs is stated in the human block's own words.
    expect(visible).toContain('酒店价格未取得，预算建议可能偏差')
  })

  it('never dresses a FAILED run in the success sentence', async () => {
    const mounted = await mount()
    const { agent, done } = await deliver(mounted)
    mounted.engine.runs[0]!.fail('error', 'boom')
    const decision = await done as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    const text = textOf(decision.messages[decision.messages.length - 1]!)
    const visible = between(text)

    expect(visible).toContain(HUMAN_FAILED)
    // A failure keeps the verbatim contract, in the request's own language only.
    expect(visible).not.toContain('This run did not finish')
    expect(visible).not.toContain(HUMAN_DONE_TAIL)
    expect(visible).not.toContain('That is the conclusion; details are in the ledger.')
    // The measured cause is still the reader's to see.
    expect(visible).toContain('boom')
  })

  it('always delivers the human sentence (humanSummary fixed on, T4)', async () => {
    // T4: the opt-out is removed — the human block is unconditional.
    const mounted = await mount()
    const { agent, done } = await deliver(mounted)
    mounted.engine.runs[0]!.complete(completedReport(objectiveOf(mounted)))
    const decision = await done as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    const text = textOf(decision.messages[decision.messages.length - 1]!)

    expect(text).toContain(HUMAN_DONE)
    expect(between(text)).toContain(HUMAN_DONE)
  })
})

describe('机器台账：默认折叠在标记之后，不进可见块', () => {
  it('folds the ledger below the closing marker, where it stays parseable', async () => {
    const mounted = await mount()
    const { agent, done } = await deliver(mounted)
    mounted.engine.runs[0]!.complete(partialReport(objectiveOf(mounted)))
    const decision = await done as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    const text = textOf(decision.messages[decision.messages.length - 1]!)
    const visible = between(text)

    for (const label of LEDGER_LABELS) expect(visible).not.toContain(label)
    for (const term of INTERNAL_TERMS) expect(visible).not.toContain(term)
    expect(text).toContain(LEDGER_GUARD)
    const folded = text.slice(text.indexOf(REPORT_END))
    expect(folded).toContain('Grok workflow: PARTIAL')
    expect(folded).toContain('Confirmed evidence:')
    expect(folded).toContain('Uncertainties:')
  })
})

describe('机器台账：永远折叠，不进可见块（T4 固定输出）', () => {
  it('hides every internal term in the default view of a partial report', () => {
    const text = renderReport(partialReport())
    for (const term of INTERNAL_TERMS) expect(text).not.toContain(term)
    // The machine renderer is the detail view: it keeps the reader-facing parts.
    expect(text).toContain('Grok workflow: PARTIAL')
    expect(text).toContain('Confirmed evidence:')
  })

  it('returns every internal term when the renderer is asked for the ledger', () => {
    // T4: fixtures carry no timeoutMs (the fixed deadline is not on the wire),
    // so the Deadline line has nothing to render — assert the rest.
    const text = renderReport(partialReport(), { showDiagnostics: true })
    for (const term of INTERNAL_TERMS.filter(term => term !== 'Deadline:' && term !== 'per run (enforced by the plugin)')) {
      expect(text).toContain(term)
    }
  })

  it('renders the registered tool view without the ledger (T4 fixed)', async () => {
    const mounted = await mount()
    const report = partialReport()

    const off = renderThroughTool(mounted, report)
    // D-132: the tool path attaches the complete machine record to a run that did
    // not complete, as its own clearly-labelled tail. T4's contract is that the
    // *answer* carries no internal term — so the assertion is scoped to the answer
    // half, and the tail is asserted to be exactly that: a separate, named section.
    const [answer, trail] = splitAuditTail(off)
    for (const term of INTERNAL_TERMS) expect(answer).not.toContain(term)
    expect(answer).toContain('Grok workflow: PARTIAL')
    expect(trail).toBeDefined()
    expect(trail!).toContain('Technical audit trail')
    expect(trail!).toContain('Audit trail complete.')
  })

  it('keeps the ledger folded even for a full delivery (T4 fixed)', async () => {
    const mounted = await mount()
    const { agent, done } = await deliver(mounted)
    mounted.engine.runs[0]!.complete(partialReport(objectiveOf(mounted)))
    const decision = await done as { kind: string; messages: UserMessage[] }
    expect(decision.kind).toBe('enter')
    const text = textOf(decision.messages[decision.messages.length - 1]!)
    const visible = between(text)

    expect(visible).not.toContain('Confirmed evidence:')
    // The human block carries the conclusion, not the ledger — in one language.
    expect(visible).toContain('答案：')
    expect(visible).not.toContain('Answer:')
    // The folded copy stays for carry-over.
    expect(text).toContain(LEDGER_GUARD)
  })
})

describe('内部术语表：可见块与台账互为补集', () => {
  it('never leaks a ledger term into the visible block, whatever the run status', () => {
    const failed = failureReport(OBJECTIVE, config, 'Plan', 'planner unavailable')
    const surfaces = [
      relayText(completedReport()),
      relayText(partialReport()),
      relayText(failed),
    ]
    for (const text of surfaces) {
      const visible = between(text)
      for (const term of INTERNAL_TERMS) expect(visible).not.toContain(term)
      for (const label of LEDGER_LABELS) expect(visible).not.toContain(label)
    }
    // ...and each term is still reachable on request, from the same report.
    // (T4: the Deadline line needs a timeoutMs on the wire, which fixtures no
    // longer carry — the fixed deadline is not a report field. Assert the rest.)
    const opted = renderReport(partialReport(), { showDiagnostics: true })
    for (const term of INTERNAL_TERMS.filter(term => term !== 'Deadline:' && term !== 'per run (enforced by the plugin)')) {
      expect(opted).toContain(term)
    }
  })
})
