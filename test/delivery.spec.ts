/**
 * 交付层契约 / the delivery contract, pinned offline.
 *
 * What a delivered message promises, and what it must never carry:
 *
 * 1. The block between the relay markers is the human block: what was done, what
 *    came of it, what is next — in both languages, in short sentences, with no
 *    path, no shell command, no digest and no internal identifier.
 * 2. The machine ledger is not part of that block. It rides *below* the closing
 *    marker under {@link LEDGER_GUARD} — where the relay contract forbids quoting
 *    it — because that durable copy is what cross-round carry-over parses back
 *    out of the transcript (`src/carryover.ts`). `showDiagnostics` moves it inside
 *    the markers instead, which is the only way a reader sees it.
 * 3. A failed run never borrows the success wording.
 *
 * Boundaries (read before trusting a green run): every case here is a pure
 * function of a report value — `assertWorkflowReport`, `deliverReport` and
 * `relayText` all run for real, but no DSH context, engine or model is mounted.
 * The end-to-end relay path (real `apply()`, real `agent/pre-step` waterfall) is
 * pinned by `test/human-output-contract.spec.ts`.
 */
import { describe, expect, it } from 'vitest'
import { LEDGER_GUARD, REPORT_BEGIN, REPORT_END, relayText, reportEnterText } from '../src/answer.js'
import { parseReportRound } from '../src/carryover.js'
import { resolveConfig, FIXED_MAX_RETRIES} from '../src/config.js'
import { deliverReport, humanConclusion } from '../src/delivery/index.js'
import { assertWorkflowReport, failureReport } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

const LIMITS = { maxConcurrency: 2, maxTasks: 4 } as const
/** Wire-format retry count: the report still carries maxRetries, always 1 (T4). */
const WIRE_RETRIES = 1 as const
const config = resolveConfig(LIMITS)
const OBJECTIVE = '查一下新加坡这周的天气并给出出行建议'

/** Labels only the machine ledger produces. */
const LEDGER_LABELS = [
  'Grok workflow:',
  'Objective:',
  'Confirmed evidence:',
  'Final answer:',
  'Model routes:',
  'Deadline:',
  'Errors:',
] as const

/** The slice of a relay message a reader actually sees. */
function between(text: string): string {
  const start = text.indexOf(REPORT_BEGIN)
  const end = text.indexOf(REPORT_END)
  if (start < 0 || end < start) return ''
  return text.slice(start + REPORT_BEGIN.length, end)
}

/* ----------------------------------------------------------------- fixtures -- */

/** A legal COMPLETED report: one verified task, its evidence confirmed. */
function completedReport(): WorkflowReport {
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
    synthesis: { mode: 'deterministic', summary: '新加坡本周多雨，出行请带伞。' },
    limits: { ...LIMITS, maxRetries: WIRE_RETRIES, maxTotalAgents: maxTotalAgentsFor(1, FIXED_MAX_RETRIES, routeBudgetFor(config))},
  }, OBJECTIVE, config)
}

/** A legal PARTIAL report: one verified task, one failed task. */
function partialReport(): WorkflowReport {
  const ok = task('a', ['天气已核验'])
  const bad = task('b', ['酒店价格已核验'])
  const checked = verification(ok)
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'partial',
    objective: OBJECTIVE,
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
    synthesis: { mode: 'deterministic', summary: '天气已核验；酒店价格未取得。' },
    limits: { ...LIMITS, maxRetries: WIRE_RETRIES, maxTotalAgents: maxTotalAgentsFor(2, FIXED_MAX_RETRIES, routeBudgetFor(config))},
  }, OBJECTIVE, config)
}

/**
 * A legal COMPLETED report whose evidence is written the way a verifier really
 * writes it: a shell command, a digest and an absolute path. This is the exact
 * shape the reported defect showed in a chat answer, so the human block has to
 * survive it without carrying any of it.
 */
function taintedReport(): WorkflowReport {
  const planTask = { ...task('t1', ['文件大小已核对']), title: '核对文件大小' }
  const criterion = '文件大小已核对'
  const evidence = 'sha256 9f2c1b7a2c in /home/fish/projects_mine/pkg/src/report.ts (stat -c %s 报告)'
  const checked = verification(planTask, {
    criteria: [{ criterion, met: true, evidence }],
    checkedEvidence: [{ kind: 'file', locator: '/home/fish/projects_mine/pkg/src/report.ts', finding: '9f2c1b7a2c' }],
  })
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'completed',
    objective: OBJECTIVE,
    plan: { source: 'caller', tasks: [planTask], error: '' },
    tasks: [{
      ...planTask,
      status: 'verified',
      attempts: [{ attempt: 1, execution: execution('核对完成'), verification: checked, passed: true, error: '' }],
      error: '',
    }],
    confirmed: [{ taskId: 't1', criterion, evidence }],
    incomplete: [],
    errors: [],
    uncertainties: [],
    synthesis: { mode: 'deterministic', summary: '文件大小已核对。' },
    limits: { ...LIMITS, maxRetries: WIRE_RETRIES, maxTotalAgents: maxTotalAgentsFor(1, FIXED_MAX_RETRIES, routeBudgetFor(config))},
  }, OBJECTIVE, config)
}

/* -------------------------------------------------------------------- tests -- */

describe('人话块：只有人能用的内容', () => {
  it('names what was done, what came of it and what is next, in both languages', () => {
    const human = deliverReport(completedReport(), { bilingual: true }).human
    // Answer-first: the run's own conclusion opens, the count lives in the tail.
    expect(human).toContain('答案：')
    expect(human).toContain('Answer:')
    expect(human).toContain('下一步')
    expect(human).toContain('Next:')
    expect(human).toContain('以上是结论；明细已记入台账。')
    // The run's own conclusion is carried, not a template only.
    expect(human).toContain('新加坡本周多雨，出行请带伞。')
  })

  it('drops the shell command, the digest and the absolute path a report quoted', () => {
    const human = deliverReport(taintedReport()).human
    for (const token of ['stat -c', 'sha256', '9f2c1b7a2c', '/home/fish', 'report.ts']) {
      expect(human, `the human block must not carry ${token}`).not.toContain(token)
    }
    // ...while the thing the reader cares about is still there.
    expect(human).toContain('文件大小已核对')
  })

  it('never words a failure as success', () => {
    const human = deliverReport(failureReport(OBJECTIVE, config, 'Plan', 'planner unavailable'), { bilingual: true }).human
    expect(human).toContain('这次没做成')
    expect(human).toContain('This run did not finish')
    expect(human).toContain('答案：')
    expect(human).not.toContain('以上是结论；明细已记入台账。')
    // The measured cause still reaches the reader.
    expect(human).toContain('planner unavailable')
  })

  it('leads with the language that was asked for, and mirrors the other one', () => {
    const zh = humanConclusion(completedReport(), { lang: 'zh', bilingual: true })
    expect(zh.indexOf('答案：')).toBeLessThan(zh.indexOf('Answer:'))
    const en = humanConclusion(completedReport(), { lang: 'en', bilingual: true })
    expect(en.indexOf('Answer:')).toBeLessThan(en.indexOf('答案：'))
  })
})

describe('机器台账：默认折叠，opt-in 才出现', () => {
  it('is absent from the delivery until the switch is on', () => {
    const off = deliverReport(completedReport())
    expect(off.diagnostics).toBe(false)
    expect(off.ledger).toBeUndefined()
    expect(off.text).toBe(off.human)
    for (const label of LEDGER_LABELS) expect(off.text).not.toContain(label)

    const on = deliverReport(completedReport(), { diagnostics: true })
    expect(on.diagnostics).toBe(true)
    expect(on.ledger).toBeDefined()
    expect(on.text).toContain('Confirmed evidence:')
    expect(on.text).toContain('Grok workflow: COMPLETED')
  })

  it('reads a live settings holder, and degrades to hidden when it throws', () => {
    expect(deliverReport(completedReport(), { diagnostics: { get: () => true } }).diagnostics).toBe(true)
    const broken = deliverReport(completedReport(), { diagnostics: { get: () => { throw new Error('no settings') } } })
    expect(broken.diagnostics).toBe(false)
    expect(broken.ledger).toBeUndefined()
  })
})

describe('relay/in-turn 文本：可见块与人话块一致，台账折叠在标记之后', () => {
  it('keeps every ledger label out of the visible block and folds the ledger below the marker', () => {
    const text = relayText(completedReport())
    const visible = between(text)
    expect(visible).not.toBe('')
    for (const label of LEDGER_LABELS) expect(visible).not.toContain(label)
    // Answer-first: the conclusion opens, the tail closes, no count up front.
    expect(visible).toContain('答案：')
    expect(visible).toContain('以上是结论；明细已记入台账。')
    // Folded, not deleted: the durable copy carries the same report.
    expect(text).toContain(LEDGER_GUARD)
    expect(text.slice(text.indexOf(REPORT_END))).toContain('Grok workflow: COMPLETED')
  })

  it('ignores the removed diagnostics opt-in: the ledger stays folded (T4)', () => {
    const text = relayText(completedReport(), undefined, { showDiagnostics: true })
    const visible = between(text)
    expect(visible).not.toContain('Grok workflow: COMPLETED')
    expect(visible).toContain('答案：')
    expect(text).toContain(LEDGER_GUARD)
  })

  it('folds the ledger for a PARTIAL run too, and keeps it parseable for carry-over', () => {
    const text = relayText(partialReport())
    const visible = between(text)
    for (const label of LEDGER_LABELS) expect(visible).not.toContain(label)
    expect(visible).toContain('答案：')
    expect(visible).toContain('项没做成')

    // The whole point of folding instead of deleting: the next round still finds
    // the previous round's results in its own transcript.
    const round = parseReportRound(text)
    expect(round).not.toBeNull()
    expect(round!.status).toBe('partial')
    expect(round!.confirmed.length).toBeGreaterThan(0)
    expect(round!.incomplete.length).toBeGreaterThan(0)
    expect(round!.uncertainties.length).toBeGreaterThan(0)
  })

  it('delivers one wording for in-turn and relay', () => {
    const report = completedReport()
    expect(reportEnterText(report)).toBe(relayText(report))
  })

  it('ignores the removed humanSummary opt-out: the human block is always on (T4)', () => {
    // relayText voids legacy opts: the human block is unconditional, so the
    // visible block carries the answer either way.
    for (const opts of [undefined, { humanSummary: false }]) {
      const text = relayText(completedReport(), undefined, opts)
      expect(between(text)).toContain('答案：')
    }
  })

  it('tells the model not to print the markers or quote the folded ledger', () => {
    for (const text of [relayText(completedReport()), relayText(partialReport())]) {
      const preamble = text.slice(0, text.indexOf(REPORT_BEGIN))
      expect(preamble).toContain('print no marker line')
      expect(preamble).toContain('never quote, mention or summarise it')
    }
    const failed = relayText(failureReport(OBJECTIVE, config, 'Plan', 'planner unavailable'))
    expect(failed.slice(0, failed.indexOf(REPORT_BEGIN))).toContain('never describe this as success')
  })
})
