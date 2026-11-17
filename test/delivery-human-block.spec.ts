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
import { deliverReport, humanConclusion, machineLedger, pairCaps } from '../src/delivery/index.js'
import { resolveConfig, FIXED_MAX_RETRIES} from '../src/config.js'
import { assertWorkflowReport } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import type { RoleName, WorkflowReport } from '../src/types.js'
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

  it('separates a failure row the way the block\'s language does', () => {
    // A row read in English must not carry the full-width colon the Chinese
    // passes use: `Not done:\n- Hotel price：the source refused` mixes two
    // punctuation systems in one sentence.
    const en = humanConclusion(partialReport(), { lang: 'en' })
    expect(en).toContain(`- 酒店价格: ${ABORTED_REASON}`)
    expect(en).not.toContain('：')
    // …and the Chinese block is untouched by that change.
    const zh = humanConclusion(partialReport(), { lang: 'zh' })
    expect(zh).toContain(`- 酒店价格：${ABORTED_REASON}`)
    expect(zh).not.toContain(`- 酒店价格: ${ABORTED_REASON}`)
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

// ---------------------------------------------------------------------------
// Round 39: the truncation edges. Round 36 kept head+tail inside one language
// block but left the *pair* clamp a blind `slice(0, cap - 1)`, and the single
// block's middle cut was a raw code-unit slice: it could eat the second
// language's verdict, leave a half-word, or split an astral character. The
// fixture below builds a legal PARTIAL report whose composed block sits exactly
// on the boundary (`knob` moves one failure reason one code unit at a time), so
// every edge is reachable deterministically, with no clock, engine or model.
// ---------------------------------------------------------------------------

const EDGE_LIMITS = { maxConcurrency: 2, maxTasks: 6 } as const
const edgeConfig = resolveConfig(EDGE_LIMITS)
/** The verdict tail this six-task PARTIAL fixture ends each language block with. */
const ZH_TAIL = '以上是结论（6 项里 1 项可用，5 项没做成）；明细已记入台账。'
const EN_TAIL = 'That is the conclusion (1 of 6 usable, 5 not done); details are in the ledger.'
/** A sentinel no composer writes, so a line cut short shows up as a missing one. */
const SENTINEL = 'ENDZ'
/** Header lines carry no bullet; every other kept line is fixture content. */
const STRUCTURAL = /^(?:Answer:|Next: |Achieved: |Not done:|Worth knowing:|- \d+ more did not finish|答案：|下一步：|做成的：|没做成的：|需要你知道的：|- 另有 )/

/** `prefix` padded with whole words to exactly `n` code units, ending in `mark`. */
function fillTo(prefix: string, n: number, mark = ''): string {
  const body = Math.max(0, n - mark.length)
  let out = prefix
  while (out.length < body) out += ' note'
  return `${out.slice(0, body)}${mark}`
}

/**
 * A legal six-task PARTIAL report whose human block is built to land on the cap.
 *
 * `knob` is the length of one failure reason, so the composed block grows by
 * exactly one character per step; `mark` puts a sentinel at the end of every
 * content line; `emoji` replaces one caveat with astral characters.
 */
function edgeReport(opts: { knob?: number, mark?: string, emoji?: boolean } = {}): WorkflowReport {
  const { knob = 240, mark = '', emoji = false } = opts
  const mk = (id: string, title: string) => ({ ...task(id, [title + ' checked']), title })
  const ok = mk('a', 'Weather')
  const checked = verification(ok)
  const fixedReason = fillTo('The supplier endpoint returned malformed rows', 240, mark)
  const rows = ['b', 'c', 'd', 'e'].map((id) => {
    const t = mk(id, 'Hotel price check result')
    return { t, reason: fixedReason }
  })
  const knobTask = mk('f', 'Hotel price check result')
  rows.push({ t: knobTask, reason: fillTo('The supplier endpoint returned malformed rows', knob, mark) })
  const caveat = (index: number): string => (emoji && index === 0)
    ? '😀'.repeat(200)
    : fillTo('The airport bus timetable could not be retrieved', 240, mark)
  const objective = 'Check the weather'
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1', status: 'partial', objective,
    plan: { source: 'caller', tasks: [ok, ...rows.map(row => row.t)], error: '' },
    tasks: [
      { ...ok, status: 'verified', attempts: [{ attempt: 1, status: 'verified', execution: execution('ok'), verification: checked, passed: true, error: '' }], error: '' },
      ...rows.map(row => ({ ...row.t, status: 'failed' as const, attempts: [{ attempt: 1, status: 'failed' as const, execution: execution('', { status: 'failed' }), verification: failingVerification(row.t, 'x'), passed: false, error: row.reason }], error: row.reason })),
    ],
    confirmed: [{ taskId: 'a', criterion: 'Weather checked', evidence: checked.criteria[0]!.evidence }],
    incomplete: rows.map(row => ({ taskId: row.t.id, reason: row.reason, category: 'quality' as const })),
    errors: [],
    uncertainties: [0, 1, 2, 3].map(index => ({ taskId: 'a', text: caveat(index) })),
    routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
    routes: [],
    synthesis: { mode: 'deterministic', summary: 'Done.' },
    limits: { ...EDGE_LIMITS, maxRetries: FIXED_MAX_RETRIES, maxTotalAgents: maxTotalAgentsFor(6, FIXED_MAX_RETRIES, routeBudgetFor(edgeConfig)) },
  }, objective, edgeConfig)
}

/** Every lone surrogate — the half of an astral character a blind cut leaves behind. */
function loneSurrogates(text: string): string[] {
  const found: string[] = []
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) index += 1
      else found.push(`high surrogate at ${index}`)
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      found.push(`low surrogate at ${index}`)
    }
  }
  return found
}

describe('round 39: the bilingual cap keeps both heads and both verdicts', () => {
  // The pair clamp exists because one block at the 2400 single-pass cap plus one
  // at 2399 plus the two-character separator is 4801: one character over 4800.
  // The old `slice(0, cap - 1)` cut the last two characters off the second
  // language's verdict and appended `…` — `明细已记入台…`.
  // One knob step moves the composed block one code unit, so this sweep walks the
  // whole boundary: under the cap, exactly on it, and over it in both directions.
  // On the round-36 source the pair landed at 2400 + 2399 + 2 = 4801 for two knobs
  // in this range and the blind pair cut truncated the second verdict there; the
  // assertions below are what caught it.
  const KNOBS = Array.from({ length: 121 }, (_, index) => 160 + index)

  it('keeps the second language verdict whole when the first block is at the cap', () => {
    for (const knob of KNOBS) {
      const text = humanConclusion(edgeReport({ knob }), { lang: 'en', bilingual: true })
      expect(text.length).toBeLessThanOrEqual(4800)
      expect(text).toContain('Answer:')
      expect(text).toContain(EN_TAIL)
      // The second language is the block the blind cut used to eat.
      expect(text).toContain(ZH_TAIL)
      expect(loneSurrogates(text)).toEqual([])
    }
  })

  it('keeps both verdicts when the first language is Chinese', () => {
    for (const knob of KNOBS) {
      const text = humanConclusion(edgeReport({ knob }), { lang: 'zh', bilingual: true })
      expect(text.length).toBeLessThanOrEqual(4800)
      expect(text).toContain('答案：')
      expect(text).toContain(ZH_TAIL)
      expect(text).toContain(EN_TAIL)
      expect(loneSurrogates(text)).toEqual([])
    }
  })

  it('charges neither language more than the single-pass cap', () => {
    for (const knob of KNOBS) {
      const text = humanConclusion(edgeReport({ knob }), { lang: 'en', bilingual: true })
      const [first, second] = text.split('\n\n')
      // Both halves survive the pair clamp: a dropped language is unreadable by
      // exactly the reader the mirror exists for.
      expect(first!.length).toBeLessThanOrEqual(2400)
      expect(second!.length).toBeLessThanOrEqual(2400)
      expect(second).toBeDefined()
    }
  })
})

describe('round 39: the pair budget is split, never cut blind', () => {
  // 4800 is the bilingual cap and `\n\n` is the separator the pair adds back, so
  // this is the budget the two blocks actually share.
  const BUDGET = 4800 - 2

  it('gives both blocks room when each one sits on the single-pass cap', () => {
    const [first, second] = pairCaps(2400, 2400, BUDGET)
    // Neither language is emptied: the mirror exists for both readers.
    expect(first).toBe(2399)
    expect(second).toBe(2399)
    expect(first + second).toBeLessThanOrEqual(BUDGET)
  })

  it('closes the 4801 window the blind pair cut fell through', () => {
    // The measured boundary: one block on the cap plus one a character short plus
    // the separator is 4801, one over. Round 36 answered `both.slice(0, 4799) +
    // '…'`, which ate the last two characters of the second language's verdict
    // (`明细已记入台…`); the split charges the overflow to the block with slack.
    expect(2400 + 2399 + 2).toBe(4801)
    const [first, second] = pairCaps(2400, 2399, BUDGET)
    expect(first + second + 2).toBeLessThanOrEqual(4800)
    expect(second).toBe(2399)
    expect(first).toBe(2399)
  })

  it('never shortens a pair that already fits', () => {
    for (const [firstLen, secondLen] of [[300, 500], [1200, 3598], [1, 1]] as const) {
      expect(pairCaps(firstLen, secondLen, BUDGET)).toEqual([firstLen, secondLen])
    }
  })

  it('hands the unused half to the block that needs it', () => {
    // The short block leaves nearly the whole budget over; the long block gets all
    // of it back and is delivered in full rather than clipped for symmetry.
    expect(pairCaps(2400, 100, BUDGET)).toEqual([2400, 100])
  })

  it('never returns a negative cap, whatever the budget', () => {
    for (const budget of [0, 1, 3, 10, -5]) {
      const [first, second] = pairCaps(2400, 2400, budget)
      expect(first).toBeGreaterThanOrEqual(0)
      expect(second).toBeGreaterThanOrEqual(0)
      expect(first + second).toBeLessThanOrEqual(Math.max(0, budget))
    }
  })
})

describe('round 39: an over-cap block cuts the middle, not a verdict and not a word', () => {
  it('keeps the head and the whole verdict and cuts only at a line boundary', () => {
    const text = humanConclusion(edgeReport({ knob: 240, mark: SENTINEL }), { lang: 'en' })
    expect(text.length).toBeLessThanOrEqual(2400)
    expect(text.startsWith('Answer:')).toBe(true)
    expect(text.endsWith(EN_TAIL)).toBe(true)
    expect(loneSurrogates(text)).toEqual([])
    // A cut inside a line leaves a fragment whose sentinel is gone.
    const fragments = text.split('\n')
      .filter(line => line !== '' && line !== '…' && line !== EN_TAIL)
      .filter(line => !STRUCTURAL.test(line))
      .filter(line => !line.endsWith(SENTINEL))
    expect(fragments).toEqual([])
  })

  it('marks the cut so a reader knows the middle is missing', () => {
    const text = humanConclusion(edgeReport({ knob: 240 }), { lang: 'en' })
    expect(text.split('\n')).toContain('…')
  })

  it('keeps the same guarantee in the Chinese block', () => {
    const text = humanConclusion(edgeReport({ knob: 240, mark: SENTINEL }), { lang: 'zh' })
    expect(text.length).toBeLessThanOrEqual(2400)
    expect(text.startsWith('答案：')).toBe(true)
    expect(text.endsWith(ZH_TAIL)).toBe(true)
    const fragments = text.split('\n')
      .filter(line => line !== '' && line !== '…' && line !== ZH_TAIL)
      .filter(line => !STRUCTURAL.test(line))
      .filter(line => !line.endsWith(SENTINEL))
    expect(fragments).toEqual([])
  })
})

describe('round 39: a clamp never splits an astral character', () => {
  it('leaves no lone surrogate when a caveat is longer than one clamped line', () => {
    const text = humanConclusion(edgeReport({ knob: 200, emoji: true }), { lang: 'en' })
    expect(loneSurrogates(text)).toEqual([])
    expect(text).toContain('Answer:')
    expect(text.endsWith(EN_TAIL)).toBe(true)
  })

  it('leaves no lone surrogate in either language of a bilingual pair', () => {
    const text = humanConclusion(edgeReport({ knob: 240, emoji: true }), { lang: 'zh', bilingual: true })
    expect(loneSurrogates(text)).toEqual([])
    expect(text).toContain(ZH_TAIL)
    expect(text).toContain(EN_TAIL)
  })
})

describe('round 39: under-cap delivery is byte for byte what it was', () => {
  it('is exactly the two single-language blocks and one blank line', () => {
    for (const report of [partialReport(), edgeReport({ knob: 60 })]) {
      const zh = humanConclusion(report, { lang: 'zh' })
      const en = humanConclusion(report, { lang: 'en' })
      expect(zh.length).toBeLessThan(2400)
      expect(en.length).toBeLessThan(2400)
      expect(humanConclusion(report, { lang: 'zh', bilingual: true })).toBe(`${zh}\n\n${en}`)
      expect(humanConclusion(report, { lang: 'en', bilingual: true })).toBe(`${en}\n\n${zh}`)
    }
  })

  it('adds no cut marker to a block that fits', () => {
    const text = humanConclusion(edgeReport({ knob: 60 }), { lang: 'zh' })
    expect(text).not.toContain('…')
    expect(text.endsWith(ZH_TAIL)).toBe(true)
  })
})


// ---------------------------------------------------------------------------
// Round 39: the route line is the one place a delivery restates a
// *configuration*, and `Array#join` used to accept anything. A number, a boolean
// or a `null` in a chain was coerced into the line (`worker=a/m1 → 7 → `) — a
// chain nobody configured — and a chain that was not an array at all threw
// `TypeError: chain.join is not a function` out of the ledger, naming neither the
// role nor the position. The chain is now checked entry by entry, and the refusal
// carries the path an operator needs (`roles.worker[1]`) plus the shape it found.
// ---------------------------------------------------------------------------

/** Shapes a chain entry must not be, with the word the refusal uses for each. */
const NOT_A_ROUTE: { label: string, value: unknown, got: string }[] = [
  { label: 'a number', value: 7, got: 'number' },
  { label: 'NaN', value: Number.NaN, got: 'number' },
  { label: 'a boolean', value: true, got: 'boolean' },
  { label: 'a bigint', value: 10n, got: 'bigint' },
  { label: 'an object', value: { provider: 'a', model: 'm1' }, got: 'object' },
  { label: 'an array', value: ['a/m1'], got: 'array' },
  { label: 'a null', value: null, got: 'null' },
  { label: 'an undefined', value: undefined, got: 'undefined' },
  { label: 'a symbol', value: Symbol('m1'), got: 'symbol' },
]

/** `partialReport()` with one role's chain replaced by `chain`, past the report type. */
function withChain(role: RoleName, chain: unknown): WorkflowReport {
  const base = partialReport()
  return { ...base, routing: { ...base.routing, [role]: chain } } as unknown as WorkflowReport
}

/** Whatever `fn` throws, or `undefined` when it threw nothing. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

describe('round 39: a chain value that is not a route label is refused by path', () => {
  it('names the role, the position and the shape for a non-string route', () => {
    for (const { label, value, got } of NOT_A_ROUTE) {
      const where = `roles.worker[1] as ${label}`
      const error = thrownBy(() => machineLedger(withChain('worker', ['a/m1', value])))
      expect(error, where).toBeInstanceOf(Error)
      // Path first, then shape: the operator with five chains configured is
      // otherwise left guessing which route carries the wrong value.
      expect((error as Error).message, where)
        .toBe(`delivery: roles.worker[1] must be a "provider/model" string, got ${got}`)
    }
  })

  it('checks every role, not only worker', () => {
    for (const role of ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'] as const) {
      expect(() => machineLedger(withChain(role, ['a/m1', 7])), role)
        .toThrow(`delivery: roles.${role}[1] must be a "provider/model" string, got number`)
    }
  })

  it('points at the entry that is wrong, not the first one', () => {
    expect(() => machineLedger(withChain('worker', ['a/m1', 'b/m2', 'c/m3', 4])))
      .toThrow(/^delivery: roles\.worker\[3\] must be a "provider\/model" string, got number$/)
  })

  it('refuses a chain that is not an array, naming the role', () => {
    // `worker: 'a/m1'` used to reach `chain.join` and throw a bare TypeError.
    expect(() => machineLedger(withChain('worker', 'a/m1')))
      .toThrow(`delivery: roles.worker must be an array of "provider/model" strings, got string`)
    expect(() => machineLedger(withChain('verifier', { 0: 'a/m1' })))
      .toThrow(`delivery: roles.verifier must be an array of "provider/model" strings, got object`)
  })

  it('refuses a routing map that is not a record', () => {
    const base = partialReport()
    for (const [value, got] of [[undefined, 'undefined'], [null, 'null'], ['worker:a/m1', 'string']] as const) {
      const report = { ...base, routing: value } as unknown as WorkflowReport
      expect(() => machineLedger(report)).toThrow(`delivery: roles must be a record of per-role chains, got ${got}`)
    }
  })

  it('never coerces a bad route into a readable one', () => {
    // The old line rendered `worker=a/m1 → 7 → ` and read as a configured chain.
    const error = thrownBy(() => machineLedger(withChain('worker', ['a/m1', 7])))
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toMatch(/worker=a\/m1/)
  })

  it('still prints a well-formed chain, and "inherit" for an empty one', () => {
    expect(machineLedger(withChain('worker', ['a/m1', 'b/m2']))).toContain('worker=a/m1 → b/m2')
    expect(machineLedger(withChain('worker', []))).toContain('worker=inherit')
  })

  it('keeps the human block readable when a chain is malformed', () => {
    // The chain is machine bookkeeping; a bad one must not cost the reader the answer.
    const text = humanConclusion(withChain('worker', ['a/m1', 7]), { lang: 'en' })
    expect(text.startsWith('Answer:')).toBe(true)
    // The verdict is the sentence the reader needs; it lives only in the tail.
    expect(text).toContain('That is the conclusion (1 of 3 usable, 2 not done)')
  })

  it('drops the ledger instead of the answer when diagnostics are on', () => {
    // A direct caller of `deliverReport` gets no `foldedLedger` guard
    // (`src/answer.ts`), so the refusal must not escape from this layer either:
    // diagnostics are the extra half, the answer is the delivery.
    const view = deliverReport(withChain('worker', ['a/m1', 7]), { diagnostics: true, lang: 'en' })
    expect(view.ledger).toBeUndefined()
    expect(view.human.startsWith('Answer:')).toBe(true)
    expect(view.text).not.toContain('Model routes:')
    expect(view.text).toBe(view.human)
  })
})

// ---------------------------------------------------------------------------
// Round 39: the bilingual cap itself (4800), measured over the whole boundary
// rather than asserted one knob at a time, and pinned so a clamp that simply
// returned less than it had room for cannot pass the bound.
// ---------------------------------------------------------------------------

describe('round 39: the bilingual pair never crosses 4800 characters', () => {
  const KNOBS = Array.from({ length: 201 }, (_, index) => 100 + index)

  it('stays inside the cap for every knob, in both language orders', () => {
    for (const knob of KNOBS) {
      for (const lang of ['zh', 'en'] as const) {
        const text = humanConclusion(edgeReport({ knob }), { lang, bilingual: true })
        expect(text.length, `knob=${knob} lang=${lang}`).toBeLessThanOrEqual(4800)
      }
    }
  })

  it('does not pass the cap by throwing away text it had room for', () => {
    // The bound above is satisfiable by returning one language, or by cutting both
    // blocks to a fraction of their caps. Measured at these three knobs the pair is
    // 4509–4672 characters with both blocks over 2000, so the clamp is spending the
    // budget it has instead of clearing the cap by starving a language.
    for (const knob of [200, 240, 280]) {
      const text = humanConclusion(edgeReport({ knob }), { lang: 'en', bilingual: true })
      const [first, second] = text.split('\n\n')
      expect(first!.length, `knob=${knob} first`).toBeGreaterThan(2000)
      expect(second!.length, `knob=${knob} second`).toBeGreaterThan(2000)
      expect(text.length, `knob=${knob} total`).toBeGreaterThan(4400)
      expect(text).toContain(EN_TAIL)
      expect(text).toContain(ZH_TAIL)
    }
  })
})

// ---------------------------------------------------------- Q11 sentence cut --

/**
 * One failed task whose recorded reason is `reason`, through the real validator.
 * @param reason - the run's own account of why the task failed.
 * @returns a legal PARTIAL report with that reason in `incomplete[0]`.
 */
function oneFailedReport(reason: string): WorkflowReport {
  const ok = task('a', ['Weather checked'])
  const bad = { ...task('b', ['Hotel price checked']), title: 'Hotel price check' }
  const checked = verification(ok)
  const limits = { maxConcurrency: 2, maxTasks: 2 } as const
  const oneConfig = resolveConfig(limits)
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'partial',
    objective: 'Check the weather',
    plan: { source: 'caller', tasks: [ok, bad], error: '' },
    tasks: [
      {
        ...ok,
        status: 'verified',
        attempts: [{ attempt: 1, status: 'verified', execution: execution('ok'), verification: checked, passed: true, error: '' }],
        error: '',
      },
      {
        ...bad,
        status: 'failed',
        attempts: [{
          attempt: 1,
          status: 'failed',
          execution: execution('', { status: 'failed' }),
          verification: failingVerification(bad, 'x'),
          passed: false,
          error: reason,
        }],
        error: reason,
      },
    ],
    confirmed: [{ taskId: 'a', criterion: 'Weather checked', evidence: checked.criteria[0]!.evidence }],
    incomplete: [{ taskId: 'b', reason, category: 'quality' as const }],
    errors: [],
    uncertainties: [],
    routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
    routes: [],
    synthesis: { mode: 'deterministic', summary: 'Done.' },
    limits: { ...limits, maxRetries: FIXED_MAX_RETRIES, maxTotalAgents: maxTotalAgentsFor(2, FIXED_MAX_RETRIES, routeBudgetFor(oneConfig)) },
  }, 'Check the weather', oneConfig)
}

/** The delivered line for the failed task, or `''` when the block carries none. */
function failedReasonLine(text: string): string {
  return text.split('\n').find(line => line.startsWith('- Hotel price check')) ?? ''
}

describe('Q11: a truncated reason stops where a sentence stops, never inside a word', () => {
  // The incident: a relayed report handed the model `the RSI heart…` — half a
  // sentence, and unreadable for exactly that reason. The relay default is now the
  // human block alone, so the human block itself may not carry a half sentence.

  it('cuts an over-long English reason at the end of a whole sentence', () => {
    const sentence = 'The supplier endpoint returned malformed rows for the price check. '
    const reason = sentence.repeat(6)
    expect(reason.length).toBeGreaterThan(240)
    const line = failedReasonLine(humanConclusion(oneFailedReport(reason), { lang: 'en' }))
    expect(line).not.toBe('')
    // The cut is marked, and the mark follows a full stop rather than a word.
    expect(line.endsWith('…')).toBe(true)
    expect(line).toMatch(/\.…$/)
  })

  it('falls back to a word boundary when the reason has no sentence end at all', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'uniform']
    const reason = Array.from({ length: 60 }, (_, index) => words[index % words.length]).join(' ')
    expect(reason.length).toBeGreaterThan(240)
    const line = failedReasonLine(humanConclusion(oneFailedReport(reason), { lang: 'en' }))
    expect(line.endsWith('…')).toBe(true)
    // The word before the cut is whole, not a fragment of one.
    expect(line).toMatch(/(?:^|\s)(?:alpha|bravo|charlie|delta|uniform)…$/)
  })

  it('cuts a Chinese reason at a full stop too', () => {
    const reason = '供应链接口返回的数据格式有问题，价格无法核验。'.repeat(12)
    expect(reason.length).toBeGreaterThan(240)
    const line = failedReasonLine(humanConclusion(oneFailedReport(reason), { lang: 'zh' }))
    expect(line).not.toBe('')
    expect(line).toMatch(/。…$/)
  })

  it('leaves a reason that already fits byte for byte alone', () => {
    const reason = 'The supplier endpoint returned malformed rows.'
    const line = failedReasonLine(humanConclusion(oneFailedReport(reason), { lang: 'en' }))
    expect(line).toBe('- Hotel price check：The supplier endpoint returned malformed rows.')
    expect(line).not.toContain('…')
  })
})
