/**
 * 交付层人话块 / the delivery layer's human block, pinned offline.
 *
 * What this file is about (B10): the human block keeps the failure reason the run
 * actually recorded. The guard that keeps machine ledger labels out of the human
 * block used to be a raw substring scan, so a real reason that merely *contains*
 * a token — `task aborted before any attempt: [infrastructure/timeout] …`, which
 * `src/script.ts` writes for a task whose child never started — was dropped
 * line by line and the reader saw `- <title>` with no reason at all. The guard is
 * now anchored/whole-word instead, and the two fields that carry the run's own
 * failure text (`incomplete[].reason`, `task.error`) are no longer scrubbed
 * field-by-field.
 *
 * Boundaries (read before trusting a green run):
 * - Only the real report validator (`assertWorkflowReport`) and the real delivery
 *   composer run. No engine, no model call, no clock, no network.
 * - "Still guarded" is asserted too: a line that really is a ledger label is still
 *   dropped, and the machine ledger still carries everything on request. A fix
 *   that simply removed the guard would fail the second half of this file.
 */
import { describe, expect, it } from 'vitest'
import { deliverReport, humanConclusion, machineLedger } from '../src/delivery/index.js'
import { resolveConfig, FIXED_MAX_RETRIES} from '../src/config.js'
import { assertWorkflowReport } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

const LIMITS = { maxConcurrency: 2, maxTasks: 4 } as const
/** Wire-format retry count: the report still carries maxRetries, always 1 (T4). */
const WIRE_RETRIES = 1 as const
const config = resolveConfig(LIMITS)
const OBJECTIVE = '查一下新加坡这周的天气并给出出行建议'

/** The reason `src/script.ts` records when a task's child never started. */
const ABORTED_REASON = 'task aborted before any attempt: [infrastructure/timeout] provider exploded'
/** A reason that merely quotes a ledger-shaped word mid-sentence. */
const MID_LINE_REASON = 'verify step rejected: Plan: step 2 was skipped by the runner'

/**
 * A legal PARTIAL report whose two failed tasks carry the reasons above.
 *
 * Built through the real validator, so a change to that validator cannot make
 * this file pass against an illegal report.
 */
function partialReport(objective = OBJECTIVE): WorkflowReport {
  const ok = task('a', ['天气已核验'])
  // The validator requires `plan.tasks` and `tasks` to agree field by field, so the
  // human title a reader sees is set on the planned task, not only on the row.
  const aborted = { ...task('b', ['酒店价格已核验']), title: '酒店价格' }
  const midLine = { ...task('c', ['机场巴士时刻已核验']), title: '机场巴士时刻' }
  const checked = verification(ok)
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'partial',
    objective,
    plan: { source: 'caller', tasks: [ok, aborted, midLine], error: '' },
    tasks: [
      {
        ...ok,
        status: 'verified',
        attempts: [{ attempt: 1, execution: execution('查到新加坡本周多雨'), verification: checked, passed: true, error: '' }],
        error: '',
      },
      {
        ...aborted,
        status: 'failed',
        attempts: [{ attempt: 1, execution: execution('', { status: 'failed' }), verification: failingVerification(aborted, '价格来源打不开'), passed: false, error: ABORTED_REASON }],
        error: ABORTED_REASON,
      },
      {
        ...midLine,
        status: 'failed',
        attempts: [{ attempt: 1, execution: execution('', { status: 'failed' }), verification: failingVerification(midLine, '时刻表抓取被跳过'), passed: false, error: MID_LINE_REASON }],
        error: MID_LINE_REASON,
      },
    ],
    confirmed: [{ taskId: 'a', criterion: '天气已核验', evidence: checked.criteria[0]!.evidence }],
    incomplete: [
      { taskId: 'b', reason: ABORTED_REASON, category: 'infrastructure' },
      { taskId: 'c', reason: MID_LINE_REASON, category: 'quality' },
    ],
    errors: [],
    uncertainties: [{ taskId: 'c', text: '机场巴士时刻未取得，行程建议可能偏差' }],
    routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
    routes: [],
    synthesis: { mode: 'deterministic', summary: '天气已核验；酒店价格与机场巴士时刻未取得。' },
    limits: { ...LIMITS, maxRetries: WIRE_RETRIES, maxTotalAgents: maxTotalAgentsFor(3, FIXED_MAX_RETRIES, routeBudgetFor(config))},
  }, objective, config)
}

/** A legal COMPLETED report whose summary echoes a ledger label on its own line. */
function completedReportWithEcho(): WorkflowReport {
  const planTask = task('a', ['天气已核验'])
  const checked = verification(planTask)
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'completed',
    objective: OBJECTIVE,
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
    synthesis: { mode: 'deterministic', summary: '新加坡本周多雨，出行请带伞。\nFinal answer: this line is a ledger echo and must not reach a reader' },
    limits: { ...LIMITS, maxRetries: WIRE_RETRIES, maxTotalAgents: maxTotalAgentsFor(1, FIXED_MAX_RETRIES, routeBudgetFor(config))},
  }, OBJECTIVE, config)
}

describe('B10: the human block keeps the failure reason the run recorded', () => {
  it('keeps a reason that contains an identifier token ("attempt:")', () => {
    const text = humanConclusion(partialReport(), { lang: 'zh' })
    expect(text).toContain('没做成的：')
    expect(text).toContain('酒店价格')
    // The whole reason, not just the task title: this is what was dropped before.
    expect(text).toContain(ABORTED_REASON)
    expect(text).toContain('provider exploded')
  })

  it('keeps a reason that merely quotes a ledger label mid-sentence', () => {
    const text = humanConclusion(partialReport(), { lang: 'zh' })
    expect(text).toContain('机场巴士时刻')
    expect(text).toContain(MID_LINE_REASON)
  })

  it('drops no failed task from the block', () => {
    const text = humanConclusion(partialReport(), { lang: 'zh' })
    for (const title of ['酒店价格', '机场巴士时刻']) expect(text).toContain(title)
    // One row per failed task under the failure heading, each with a reason after
    // the colon — an empty tail is the bug this file exists for.
    const lines = text.split('\n')
    const start = lines.findIndex(line => line.startsWith('没做成的')) + 1
    const failureRows: string[] = []
    for (const line of lines.slice(start)) {
      if (!line.startsWith('- ')) break
      failureRows.push(line)
    }
    expect(failureRows).toHaveLength(2)
    for (const row of failureRows) expect(row).toMatch(/：\S/)
  })

  it('keeps the same reason in the English block', () => {
    const text = humanConclusion(partialReport(), { lang: 'en' })
    expect(text).toContain('Not done:')
    expect(text).toContain(ABORTED_REASON)
    expect(text).toContain(MID_LINE_REASON)
  })
})

describe('B10: the guard is anchored, not removed', () => {
  it('still drops a line that is a ledger label', () => {
    const text = humanConclusion(completedReportWithEcho(), { lang: 'zh' })
    expect(text).toContain('新加坡本周多雨，出行请带伞。')
    expect(text).not.toContain('Final answer:')
    expect(text).not.toContain('ledger echo')
  })

  it('still keeps the answer when the echo is the only line', () => {
    const report = completedReportWithEcho()
    const echoed = { ...report, synthesis: { ...report.synthesis, summary: 'Final answer: nothing to show' } }
    const text = humanConclusion(echoed, { lang: 'zh' })
    // No conclusion line at all is honest; the advice and the tail still are there.
    expect(text).toContain('下一步：')
    expect(text).toContain('以上是结论；明细已记入台账。')
    expect(text).not.toContain('Final answer:')
  })

  it('still keeps every ledger label out of the human block, and in the ledger', () => {
    const report = partialReport()
    const human = humanConclusion(report, { lang: 'zh' })
    // A label is a label where a label can be: at the start of a line. Every line
    // the run composed for its reader is checked, and none of them is a ledger row.
    const labels = ['Grok workflow:', 'Objective:', 'Plan:', 'Failures:', 'Plan failure:', 'Confirmed evidence:', 'Incomplete:', 'Final answer:', 'Model routes:', 'Deadline:', 'Route switches:', 'Route overflows', 'Errors:', 'Uncertainties:', 'Synthesis:']
    for (const line of human.split('\n')) {
      for (const label of labels) expect(line.startsWith(label), `${label} | ${line}`).toBe(false)
    }
    // The phrase-level terms are whole-word matched wherever they are, so a line
    // that carries one is still dropped even mid-sentence.
    expect(human).not.toContain('skipped busy')
    expect(human).not.toContain('cross-run hint')
    const ledger = machineLedger(report)
    expect(ledger).toContain('Incomplete:')
    expect(ledger).toContain(ABORTED_REASON)
    expect(ledger).toContain(MID_LINE_REASON)
  })

  it('drops a line that carries an identifier key, and keeps a reason that mentions one', () => {
    const report = partialReport()
    // Outside the failure reason the guard is unchanged: the line is dropped.
    const taintedText = humanConclusion({
      ...report,
      uncertainties: [{ taskId: 'c', text: 'childId 3 failed to start' }],
    }, { lang: 'zh' })
    expect(taintedText).not.toContain('childId')
    // Inside it the reason is the run's own explanation and is kept as written:
    // an id in the sentence is the price of never hiding why the task failed.
    const reasonWithId = humanConclusion({
      ...report,
      incomplete: report.incomplete.map((item, index) => index === 0
        ? { ...item, reason: 'childId 3 failed to start' }
        : item),
    }, { lang: 'zh' })
    expect(reasonWithId).toContain('childId 3 failed to start')
    expect(reasonWithId).toContain('酒店价格')
  })
})

describe('B10: the delivery view is unchanged around the human block', () => {
  it('hides the ledger by default and shows it on request', () => {
    const report = partialReport()
    const off = deliverReport(report, { lang: 'zh' })
    expect(off.diagnostics).toBe(false)
    expect(off.ledger).toBeUndefined()
    expect(off.text).toBe(off.human)
    expect(off.text).not.toContain('Grok workflow:')

    const on = deliverReport(report, { lang: 'zh', diagnostics: true })
    expect(on.diagnostics).toBe(true)
    expect(on.ledger).toContain('Grok workflow: PARTIAL')
    expect(on.text).toBe(`${on.human}\n\n---\n\n${on.ledger}`)
    // The reason is in both halves, so "the summary said it, the ledger proves it".
    expect(on.human).toContain(ABORTED_REASON)
    expect(on.ledger).toContain(ABORTED_REASON)
  })

  it('never dresses a partial run as a completed one', () => {
    const text = humanConclusion(partialReport(), { lang: 'zh' })
    expect(text).toContain('项没做成')
    expect(text).toContain('以上是结论')
    expect(text).not.toContain('以上是结论；明细已记入台账。')
  })
})

describe('the 2400-char clamp keeps the verdict line', () => {
  // Round 36 (POOL `P ·`): the old tail-cut dropped the verdict line — and, in bilingual
  // delivery, the whole second language — so the reader never learned the count.
  // The clamp now keeps the head (the answer) and the tail (the verdict) and cuts
  // the middle instead.
  const longReason = 'The supplier API returned malformed data and the price verification cannot proceed until the supplier fixes the endpoint, and if the supplier does not fix it promptly we must find an alternative data source so the task keeps moving instead of stalling halfway through'
  const longUnc = 'The airport bus timetable could not be retrieved and departure times need confirmation from the station before accurate advice can be given, and taxis or ride-hailing are fallback options so the trip is not delayed by the missing timetable data'
  const WIDE_LIMITS = { maxConcurrency: 2, maxTasks: 6 } as const
  const wideConfig = resolveConfig(WIDE_LIMITS)
  function overBudgetReport(): WorkflowReport {
    const mk = (id: string, title: string) => ({ ...task(id, [title + ' checked']), title })
    const ok = mk('a', 'Weather')
    const checked = verification(ok)
    const failed = ['b', 'c', 'd', 'e', 'f'].map((id) => {
      const t = mk(id, 'Hotel price check result confirmation')
      return { t, reason: longReason }
    })
    const objective = 'Check the weather'
    return assertWorkflowReport({
      schemaVersion: 'grok-workflow/v1', status: 'partial', objective,
      plan: { source: 'caller', tasks: [ok, ...failed.map(f => f.t)], error: '' },
      tasks: [
        { ...ok, status: 'verified', attempts: [{ attempt: 1, status: 'verified', execution: execution('ok'), verification: checked, passed: true, error: '' }], error: '' },
        ...failed.map(f => ({ ...f.t, status: 'failed' as const, attempts: [{ attempt: 1, status: 'failed' as const, execution: execution('', { status: 'failed' }), verification: failingVerification(f.t, 'x'), passed: false, error: f.reason }], error: f.reason })),
      ],
      confirmed: [{ taskId: 'a', criterion: 'Weather checked', evidence: checked.criteria[0]!.evidence }],
      incomplete: failed.map(f => ({ taskId: f.t.id, reason: f.reason, category: 'quality' as const })),
      errors: [],
      uncertainties: Array.from({ length: 10 }, () => ({ taskId: 'a', text: longUnc })),
      routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
      routes: [],
      synthesis: { mode: 'deterministic', summary: 'Done.' },
      limits: { ...WIDE_LIMITS, maxRetries: FIXED_MAX_RETRIES, maxTotalAgents: maxTotalAgentsFor(6, FIXED_MAX_RETRIES, routeBudgetFor(wideConfig)) },
    }, objective, wideConfig)
  }

  it('keeps the head and the verdict when the block is over budget', () => {
    const text = humanConclusion(overBudgetReport(), { lang: 'en' })
    expect(text.length).toBeLessThanOrEqual(2400)
    expect(text).toContain('Answer:')
    expect(text).toContain('That is the conclusion')
    expect(text).toContain('of 6 usable')
  })

  it('still fits a short block unchanged', () => {
    const text = humanConclusion(partialReport(), { lang: 'en' })
    expect(text).toContain('Not done:')
    expect(text).toContain('That is the conclusion')
  })
})

describe('the bilingual clamp keeps both verdicts', () => {
  it('keeps the second language head and verdict, not just the first', () => {
    // The POOL item names this half explicitly: the old tail-cut dropped the
    // whole second language, so a reader whose language the rules guessed wrong
    // got a summary nobody can read.
    const text = humanConclusion((() => {
      const mk = (id: string, title: string) => ({ ...task(id, [title + ' checked']), title })
      const ok = mk('a', 'Weather')
      const checked = verification(ok)
      const longReason = 'The supplier API returned malformed data and the price verification cannot proceed until the supplier fixes the endpoint, and if the supplier does not fix it promptly we must find an alternative data source so the task keeps moving instead of stalling halfway through'
      const failed = ['b', 'c', 'd', 'e', 'f'].map((id) => {
        const t = mk(id, 'Hotel price check result confirmation')
        return { t, reason: longReason }
      })
      const objective = 'Check the weather'
      const wideConfig = resolveConfig({ maxConcurrency: 2, maxTasks: 6 })
      return assertWorkflowReport({
        schemaVersion: 'grok-workflow/v1', status: 'partial', objective,
        plan: { source: 'caller', tasks: [ok, ...failed.map(f => f.t)], error: '' },
        tasks: [
          { ...ok, status: 'verified', attempts: [{ attempt: 1, status: 'verified', execution: execution('ok'), verification: checked, passed: true, error: '' }], error: '' },
          ...failed.map(f => ({ ...f.t, status: 'failed' as const, attempts: [{ attempt: 1, status: 'failed' as const, execution: execution('', { status: 'failed' }), verification: failingVerification(f.t, 'x'), passed: false, error: f.reason }], error: f.reason })),
        ],
        confirmed: [{ taskId: 'a', criterion: 'Weather checked', evidence: checked.criteria[0]!.evidence }],
        incomplete: failed.map(f => ({ taskId: f.t.id, reason: f.reason, category: 'quality' as const })),
        errors: [],
        uncertainties: Array.from({ length: 10 }, () => ({ taskId: 'a', text: 'The airport bus timetable could not be retrieved and departure times need confirmation from the station before accurate advice can be given.' })),
        routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
        routes: [],
        synthesis: { mode: 'deterministic', summary: 'Done.' },
        limits: { maxConcurrency: 2, maxTasks: 6, maxRetries: FIXED_MAX_RETRIES, maxTotalAgents: maxTotalAgentsFor(6, FIXED_MAX_RETRIES, routeBudgetFor(wideConfig)) },
      }, objective, wideConfig)
    })(), { bilingual: true })
    expect(text).toContain('That is the conclusion')
    expect(text).toContain('以上是结论')
  })
})
