/**
 * 报告视图 ⇄ 机器台账：逐块对账 / one report, two diagnostics views, one wording.
 *
 * One report is rendered by two views: `renderReport(report, { showDiagnostics: true })`
 * (what the tool surface prints) and `machineLedger(report)` (what a delivery carries
 * when the diagnostics switch is on). Ops opens both while diagnosing, and they used
 * to disagree: the ledger showed no dead routes and no per-call child budget at all,
 * and an error row read differently in each view because one kept the category. Two
 * views of one report are one truth or they are two drifting ones, so this file pins
 * them block by block instead of trusting the label table to keep the wording aligned.
 *
 * Boundaries: only the real validator (`assertWorkflowReport`) and the real renderers
 * run. No engine, no model, no clock.
 *
 * Outside the block set, by name: `Wave reason:`, `Summary review:` and `Synthesis mode:`
 * are excluded on purpose — the first explains a plan decision that predates the
 * diagnostics switch, the second is the summary gate's verdict and belongs with the
 * answer, and the third is the ledger's own reading of a report field the report prints
 * only as a sentence. Their gating differs deliberately, so they are named here rather
 * than silently skipped.
 */
import { describe, expect, it } from 'vitest'
import { FIXED_MAX_RETRIES, resolveConfig } from '../src/config.js'
import { deliverReport, machineLedger } from '../src/delivery/index.js'
import { assertWorkflowReport, renderReport } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

const OBJECTIVE = '把这一批接口的失败原因归类，并给出可执行的修复顺序'

/** Every routed role has a chain and both budgets are set, so nothing is skipped by absence. */
const CONFIG = resolveConfig({
  maxConcurrency: 3,
  maxTasks: 8,
  timeoutMs: 900_000,
  childTimeoutMs: 120_000,
  roles: {
    planner: [{ model: 'p1' }, { model: 'p2' }],
    worker: [{ model: 'w1' }, { model: 'w2' }],
    verifier: [{ model: 'v1' }, { model: 'v2' }],
    supervisor: [{ model: 's1' }],
    synthesizer: [{ model: 'y1' }],
  },
})

/* ----------------------------------------------------------------- fixtures -- */

/** A verified task row whose confirmation the host can trace back to its verification. */
function verified(id: string, criterion: string, summary: string): WorkflowReport['tasks'][number] {
  const planned = task(id, [criterion])
  const checked = verification(planned)
  return {
    ...planned,
    status: 'verified',
    attempts: [{ attempt: 1, execution: execution(summary), verification: checked, passed: true, error: '' }],
    error: '',
  }
}

/** A failed task row carrying the reason the run recorded. */
function failed(id: string, criterion: string, reason: string): WorkflowReport['tasks'][number] {
  const planned = task(id, [criterion])
  return {
    ...planned,
    status: 'failed',
    attempts: [{
      attempt: 1,
      execution: execution('', { status: 'failed' }),
      verification: failingVerification(planned, reason),
      passed: false,
      error: reason,
    }],
    error: reason,
  }
}

/** A blocked task row: it never ran, and its reason names the task that stopped it. */
function blocked(id: string, criterion: string, reason: string): WorkflowReport['tasks'][number] {
  const planned = task(id, [criterion])
  return {
    ...planned,
    status: 'blocked',
    attempts: [{
      attempt: 1,
      execution: execution('', { status: 'failed' }),
      verification: null,
      passed: false,
      error: reason,
    }],
    error: reason,
  }
}

/** The plan's own copy of a task row: the execution fields stripped, the plan fields kept. */
function asPlanTask(row: WorkflowReport['tasks'][number]): WorkflowReport['plan']['tasks'][number] {
  const { status: _status, attempts: _attempts, error: _error, ...planTask } = row
  return planTask
}

/**
 * One legal PARTIAL report that carries every diagnostics fact at once.
 *
 * Six task rows (two verified, three failed, one blocked) keep the ledger long enough
 * to look like a real run; the routing trail carries a failed switch, a local full-lane
 * yield, a cross-run hint and one queue-only entry that names no lane at all; two dead
 * routes, two errors (one with a category, one without), and a stop cause plus a guard
 * settlement give the closing trailer something to say.
 */
function troubledReport(): WorkflowReport {
  const rows = [
    verified('a', '失败原因已归类', '把 42 条失败按传输、鉴权、格式三类归好'),
    verified('b', '修复顺序已给出', '给出先修鉴权、再修重试、最后修格式的顺序'),
    failed('c', '日志已抽样', '日志来源连续三次 503，抽样未完成'),
    failed('d', '接口清单已抓取', '接口清单的抓取在传输层挂死，没有落盘'),
    blocked('e', '上游依赖已核对', 'blocked: upstream task c failed'),
    failed('f', '回归脚本已跑完', '回归脚本没跑：缺少上一项的接口清单'),
  ]
  const checkedA = rows[0]!.attempts[0]!.verification!
  const checkedB = rows[1]!.attempts[0]!.verification!
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'partial',
    objective: OBJECTIVE,
    plan: { source: 'caller', tasks: rows.map(asPlanTask), error: '' },
    tasks: rows,
    confirmed: [
      { taskId: 'a', criterion: '失败原因已归类', evidence: checkedA.criteria[0]!.evidence },
      { taskId: 'b', criterion: '修复顺序已给出', evidence: checkedB.criteria[0]!.evidence },
    ],
    incomplete: [
      { taskId: 'c', reason: '日志来源连续三次 503，抽样未完成', category: 'infrastructure' },
      { taskId: 'd', reason: '接口清单的抓取在传输层挂死，没有落盘', category: 'infrastructure' },
      { taskId: 'e', reason: 'blocked: upstream task c failed' },
      { taskId: 'f', reason: '回归脚本没跑：缺少上一项的接口清单', category: 'quality' },
    ],
    errors: [
      { phase: 'Verify', message: '日志来源打不开：503 连续三次', category: 'infrastructure' },
      { phase: 'Synthesis', message: 'narrative skipped: the deterministic answer stands' },
    ],
    uncertainties: [{ taskId: 'f', text: '回归脚本未跑，回归结论未取得' }],
    routing: {
      planner: ['p1', 'p2'],
      worker: ['w1', 'w2'],
      verifier: ['v1', 'v2'],
      supervisor: ['s1'],
      synthesizer: ['y1'],
    },
    routes: [
      // A route switch: the planning call moved off p2 after a provider death.
      { role: 'planner', chainIndex: 1, route: 'p2', attempt: 1, outcome: 'failed', failureClass: 'server-error', reason: 'planner route p2 answered 502' },
      // This run's own full lane: w1 was at its cap when the call was placed.
      { role: 'worker', chainIndex: 1, route: 'w2', attempt: 1, taskId: 'c', outcome: 'ok', skippedBusy: ['w1'], queuedMs: 40 },
      // Another run's busy hint: s0 is busy elsewhere, not full here.
      { role: 'supervisor', chainIndex: 1, route: 's1', attempt: 1, outcome: 'ok', skippedBusy: ['s0 (cross-run hint)'], queuedMs: 12 },
      // A second local yield, this one with nothing waited.
      { role: 'verifier', chainIndex: 1, route: 'v2', attempt: 2, taskId: 'c', outcome: 'ok', skippedBusy: ['v1'] },
      // A second hint, also with no wait recorded.
      { role: 'synthesizer', chainIndex: 1, route: 'y1', attempt: 1, outcome: 'ok', skippedBusy: ['y0 (cross-run hint)'] },
      // Queue-only: no lane is named, so neither view may show it.
      { role: 'worker', chainIndex: 0, route: 'w1', attempt: 2, taskId: 'd', outcome: 'ok', queuedMs: 5 },
    ],
    deadRoutes: [
      { route: 'w1', class: 'server-error', streak: 2 },
      { route: 'p2', class: 'timeout', streak: 3 },
    ],
    synthesis: { mode: 'deterministic', summary: '六项里两项已核验；另外四项卡在上游 503，修复顺序见下。' },
    stop: { cause: 'deadline' },
    guard: { findings: 3, terminated: 1 },
    limits: {
      maxConcurrency: 3,
      maxRetries: FIXED_MAX_RETRIES,
      maxTasks: 8,
      maxTotalAgents: maxTotalAgentsFor(6, FIXED_MAX_RETRIES, routeBudgetFor(CONFIG)),
      timeoutMs: 900_000,
      childTimeoutMs: 120_000,
    },
  }, OBJECTIVE, CONFIG)
}

/* ------------------------------------------------------------------ parsing -- */

/**
 * Every heading either view can open a line with.
 *
 * `Diagnostics mode` has no block of its own here: `blocks` matches a line by its
 * heading prefix and keeps the whole line, so two views that round the same value
 * differently still compare their headings exactly.
 */
const HEADINGS = [
  'Grok workflow:',
  'Objective:',
  'Plan:',
  'Wave reason:',
  'Failures:',
  'Plan failure:',
  'Confirmed evidence:',
  'Incomplete:',
  'Final answer:',
  'Summary review:',
  'Synthesis:',
  'Synthesis mode:',
  'Model routes:',
  'Deadline:',
  'Child budget:',
  'Route switches:',
  'Dead routes (two consecutive transport failures; live routes are tried first):',
  'Route overflows (full lane yielded, not failures):',
  'Route overflows (cross-run hint):',
  'Errors:',
  'Uncertainties:',
  'Stop:',
  'Guard:',
] as const

/** The headings that belong to the diagnostics ledger, in the order both views emit them. */
const DIAGNOSTIC_HEADINGS = [
  'Model routes:',
  'Deadline:',
  'Child budget:',
  'Route switches:',
  'Dead routes (two consecutive transport failures; live routes are tried first):',
  'Route overflows (full lane yielded, not failures):',
  'Route overflows (cross-run hint):',
  'Errors:',
] as const

/** Gating differs on purpose; see the file header. Excluded by name, never silently. */
const OUTSIDE_DIAGNOSTICS = ['Wave reason:', 'Summary review:', 'Synthesis mode:'] as const

interface Block {
  /** The heading the line was recognised by. */
  heading: string
  /** The whole heading line, so a rounded value cannot hide in a prefix match. */
  line: string
  /** The rows under it, until the next heading. */
  body: string[]
}

/** Split a rendered view into heading-led blocks; everything else stays with its block. */
function blocks(text: string): Block[] {
  const out: Block[] = []
  for (const line of text.split('\n')) {
    const heading = HEADINGS.find(candidate => line.startsWith(candidate))
    if (heading === undefined) {
      out.at(-1)?.body.push(line)
      continue
    }
    out.push({ heading, line, body: [] })
  }
  return out
}

/** The diagnostics blocks of one view, in render order. */
function diagnosticsBlocks(text: string): Block[] {
  return blocks(text).filter(block => (DIAGNOSTIC_HEADINGS as readonly string[]).includes(block.heading))
}

/* -------------------------------------------------------------------- tests -- */

describe('one report, two views: every diagnostics block lines up block by block', () => {
  const report = troubledReport()
  const reportView = renderReport(report, { showDiagnostics: true })
  const ledgerView = machineLedger(report)

  it('shows the same blocks, in the same order, with byte-identical rows', () => {
    const shown = diagnosticsBlocks(reportView)
    const mirrored = diagnosticsBlocks(ledgerView)
    // The report is the reference: all eight blocks are present, in this order.
    expect(shown.map(block => block.heading)).toEqual([...DIAGNOSTIC_HEADINGS])
    // The ledger mirrors them exactly — same headings, same inline values, same rows —
    // and adds no block of its own (a block only one view shows is a second truth).
    expect(mirrored).toEqual(shown)
    // Every exclusion is a heading neither view may render as a diagnostics block.
    for (const heading of OUTSIDE_DIAGNOSTICS) {
      expect(shown.some(block => block.heading === heading)).toBe(false)
      expect(mirrored.some(block => block.heading === heading)).toBe(false)
    }
  })

  it('carries the dead-route block verbatim, after the switch rows and before any overflow', () => {
    const heading = 'Dead routes (two consecutive transport failures; live routes are tried first):'
    const rows = [`- w1: server-error (2 in a row)`, `- p2: timeout (3 in a row)`]
    for (const view of [reportView, ledgerView]) {
      const at = view.indexOf(heading)
      expect(at).toBeGreaterThan(view.indexOf('Route switches:'))
      expect(at).toBeLessThan(view.indexOf('Route overflows'))
      expect(view).toContain(`${heading}\n${rows.join('\n')}`)
    }
  })

  it('carries the per-call child budget right under the deadline line', () => {
    const line = 'Child budget: 120000 ms per call (the run stops waiting on one call after this long)'
    for (const view of [reportView, ledgerView]) {
      expect(view).toContain(line)
      expect(view.indexOf(line) - view.indexOf('Deadline: 900000 ms per run'))
        .toBe('Deadline: 900000 ms per run (enforced by the plugin)\n'.length)
    }
  })

  it('separates this run’s full lane from another run’s busy hint', () => {
    for (const view of [reportView, ledgerView]) {
      expect(view).toContain('Route overflows (full lane yielded, not failures):')
      expect(view).toContain('- worker attempt 1 via w2: skipped full w1 (waited 40 ms)')
      expect(view).toContain('- verifier attempt 2 via v2: skipped full v1')
      expect(view).toContain('Route overflows (cross-run hint):')
      expect(view).toContain('- supervisor attempt 1 via s1: skipped busy s0 (cross-run hint) (waited 12 ms)')
      expect(view).toContain('- synthesizer attempt 1 via y1: skipped busy y0 (cross-run hint)')
    }
  })

  it('drops the queue-only routing entry from both views instead of inventing a lane for it', () => {
    for (const view of [reportView, ledgerView]) {
      expect(view).not.toContain('no lane named')
      expect(view).not.toContain('queued 5 ms')
      expect(view).not.toContain('attempt 2 via w1')
    }
  })

  it('renders one error row per error, with the category when the report has one', () => {
    for (const view of [reportView, ledgerView]) {
      expect(view).toContain('- Verify (infrastructure): 日志来源打不开：503 连续三次')
      expect(view).toContain('- Synthesis: narrative skipped: the deterministic answer stands')
    }
  })
})

describe('a healthy report shows none of the trouble blocks in either view', () => {
  const healthy = (() => {
    const rows = [
      verified('a', '失败原因已归类', '把 42 条失败按传输、鉴权、格式三类归好'),
      verified('b', '修复顺序已给出', '给出先修鉴权、再修重试、最后修格式的顺序'),
    ]
    const checkedA = rows[0]!.attempts[0]!.verification!
    const checkedB = rows[1]!.attempts[0]!.verification!
    return assertWorkflowReport({
      schemaVersion: 'grok-workflow/v1',
      status: 'completed',
      objective: OBJECTIVE,
      plan: { source: 'caller', tasks: rows.map(asPlanTask), error: '' },
      tasks: rows,
      confirmed: [
        { taskId: 'a', criterion: '失败原因已归类', evidence: checkedA.criteria[0]!.evidence },
        { taskId: 'b', criterion: '修复顺序已给出', evidence: checkedB.criteria[0]!.evidence },
      ],
      incomplete: [],
      errors: [],
      uncertainties: [],
      routing: { planner: [], worker: ['w1'], verifier: [], supervisor: [], synthesizer: [] },
      routes: [{ role: 'worker', chainIndex: 0, route: 'w1', attempt: 1, taskId: 'a', outcome: 'ok' }],
      synthesis: { mode: 'deterministic', summary: '两项都核验过了。' },
      limits: {
        maxConcurrency: 3,
        maxRetries: FIXED_MAX_RETRIES,
        maxTasks: 8,
        maxTotalAgents: maxTotalAgentsFor(6, FIXED_MAX_RETRIES, routeBudgetFor(CONFIG)),
      },
    }, OBJECTIVE, CONFIG)
  })()
  const reportView = renderReport(healthy, { showDiagnostics: true })
  const ledgerView = machineLedger(healthy)

  it('has no switch, overflow, dead-route, child-budget or deadline block to show', () => {
    const quiet = [
      'Deadline:',
      'Child budget:',
      'Route switches:',
      'Route overflows',
      'Dead routes',
    ]
    for (const view of [reportView, ledgerView]) {
      for (const heading of quiet) expect(view).not.toContain(heading)
      // Positive control: the diagnostics switch is on and the parser is not empty.
      expect(view).toContain('Model routes:')
    }
    expect(diagnosticsBlocks(reportView).map(block => block.heading)).toEqual(['Model routes:'])
    expect(diagnosticsBlocks(ledgerView)).toEqual(diagnosticsBlocks(reportView))
  })
})

describe('the new labels never reach the answer, and the ledger still carries both blocks', () => {
  it('scrubs an echoed child budget and dead-route line out of the human block', () => {
    const report: WorkflowReport = {
      ...troubledReport(),
      synthesis: {
        mode: 'deterministic',
        summary: 'Child budget: 1000 ms per call\nDead routes: w1 died of server-error twice',
      },
    }
    const view = deliverReport(report, { diagnostics: true })
    expect(view.human).not.toContain('Child budget:')
    expect(view.human).not.toContain('Child budget')
    expect(view.human).not.toContain('Dead routes:')
    expect(view.human).not.toContain('Dead routes')
    // The ledger is the one place a maintainer reads those two facts, so both blocks
    // must survive there — a guard that also erased the ledger would prove nothing.
    expect(view.ledger).toContain('Child budget: 120000 ms per call')
    expect(view.ledger).toContain('Dead routes (two consecutive transport failures; live routes are tried first):')
  })
})
