/**
 * 最终答案改写 / the final-answer rewrite contract, pinned offline.
 *
 * The reported defect: the delivered answer was a 200-character telegraphic
 * narrative, and the reader got only its first sentence, sandwiched between
 * `答案：`/`下一步：`/`交付物：` style labels — the material *was* the answer, and
 * the material was a ledger digest.
 *
 * What this file pins, on the block the delivery layer composes:
 *
 * 1. The block carries the whole summary, the deliverable paths and the caveats,
 *    and the lead is the whole summary (bounded), not its first sentence; a
 *    completed run names its deliverables instead of skipping the achievement row.
 * 2. One language by default: the block follows the request's language instead of
 *    mirroring every answer in Chinese and English.
 * 3. The synthesizer may write 结果 / 怎么用 / 注意, and it **rewrites** the
 *    report's caveats instead of the appendix pasting them verbatim — the section
 *    it must keep is the caveat section, not the original sentence.
 *
 * Boundaries (read before trusting a green run): pure functions of a report value
 * plus the scripted `agent` for the synthesis half. The report validator, the
 * delivery composer and the workflow script all run for real; no engine, no model,
 * no clock, no network.
 */
import { describe, expect, it } from 'vitest'
import { resolveConfig, FIXED_MAX_RETRIES } from '../src/config.js'
import { deliverReport } from '../src/delivery/index.js'
import { assertWorkflowReport } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor, WORKFLOW_SCRIPT } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, type ScriptAgent } from './helpers.js'

const LIMITS = { maxConcurrency: 2, maxTasks: 4 } as const
/** Wire-format retry count: the report still carries maxRetries, always 1 (T4). */
const WIRE_RETRIES = 1 as const
const config = resolveConfig(LIMITS)
const OBJECTIVE = '把上周的门店销量整理成一份周报，并说明周报在哪里打开'

/** The deliverable the run produced: a path a reader is meant to open. */
const DELIVERABLE = 'file:///tmp/weekly-report.md'

/** The summary the synthesizer wrote: a paragraph, not one sentence. */
const S1 = '上周四家门店的销量已经整理成一份周报，按门店和品类各自成表，缺失的两天用相邻门店均值补齐并标注。'
const S2 = '周报里同比和环比分列两栏，方便横向比较；单价异常的行单独标了颜色，改口径前先看这几行。'
const S3 = '数据源是门店每日上传的销售明细，其中两家门店的明细晚到一天，周报按到齐后的数据重算过一次。'
const S4 = '如果要把周报改成月度口径，只需要换掉汇总区间再跑一次，整份周报会重算，不用手工改表。'
const SUMMARY = [S1, S2, S3, S4].join('')

/** Six caveats: the block keeps four, and the two beyond that must stay out. */
const U1 = '第三方接口的费率还没有核实，补齐后金额可能微调。'
const U2 = '两家门店的退货数据只到上月底，本月退货尚未回填。'
const U3 = '品类归并沿用了旧口径，新品类暂时并入其他。'
const U4 = '周报里的同比基数取自去年同期报表，未经二次核对。'
const U5 = '第五条的细节只应出现在台账里。'
const U6 = '第六条的细节只应出现在台账里。'

/** A legal COMPLETED report carrying the paragraph summary and one deliverable. */
function paragraphReport(uncertainties: { taskId: string, text: string }[] = []): WorkflowReport {
  const planTask = task('a', ['周报已核验'])
  const checked = verification(planTask)
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'completed',
    objective: OBJECTIVE,
    plan: { source: 'caller', tasks: [planTask], error: '' },
    tasks: [{
      ...planTask,
      status: 'verified',
      attempts: [{
        attempt: 1,
        execution: execution('把四周的销量合并成一张周报', {
          deliverables: [{ description: '周报', locator: DELIVERABLE }],
        }),
        verification: checked,
        passed: true,
        error: '',
      }],
      error: '',
    }],
    confirmed: [{ taskId: 'a', criterion: '周报已核验', evidence: checked.criteria[0]!.evidence }],
    incomplete: [],
    errors: [],
    uncertainties,
    synthesis: { mode: 'deterministic', summary: SUMMARY },
    limits: { ...LIMITS, maxRetries: WIRE_RETRIES, maxTotalAgents: maxTotalAgentsFor(1, FIXED_MAX_RETRIES, routeBudgetFor(config)) },
  }, OBJECTIVE, config)
}

describe('人话块里放的是原料：整段 summary、交付物路径、caveat', () => {
  it('carries the whole summary, not its first sentence', () => {
    const visible = deliverReport(paragraphReport()).text
    for (const sentence of [S1, S2, S3, S4]) expect(visible).toContain(sentence)
  })

  it('names the deliverable path and keeps it out of the machine-detail strip', () => {
    const visible = deliverReport(paragraphReport()).text
    expect(visible).toContain('交付物：')
    expect(visible).toContain(DELIVERABLE)
    // The exception is the deliverable only: another path the report quotes is
    // still machine detail and must not reach a reader.
    expect(visible).not.toContain('src/script.ts')
  })

  it('lists what was achieved on a completed run instead of skipping it', () => {
    const visible = deliverReport(paragraphReport()).text
    expect(visible).toContain('做成了：')
    // The row names the work the way the report does (the task title), not by id.
    expect(visible).toContain('Task a')
  })

  it('does not double the label when the summary opens with its own heading', () => {
    // The synthesizer writes 结果/怎么用/注意 now, so the lead can arrive with a
    // heading the block itself already provides. `答案：结果：…` is the stutter this
    // rules out; the sentences after the heading still travel.
    const headed = assertWorkflowReport({
      ...paragraphReport(),
      synthesis: { mode: 'model', summary: `结果：${S1}\n怎么用：${S4}\n注意：${U1}` },
    }, OBJECTIVE, config)
    const visible = deliverReport(headed).text
    expect(visible).not.toContain('答案：结果：')
    expect(visible).toContain(S1)
    expect(visible).toContain(S4)
    expect(visible).toContain(U1.slice(0, 12))
  })

  it('keeps a deliverable path byte-exact even when the summary names it', () => {
    // The defect this pins (CONFIRMED): the lead was split into sentences, and the
    // split ran through the `.` inside `weekly-report.md` — the rejoin read
    // `weekly-report. md`, so the path stopped matching its own keep-list and the
    // machine-detail strip ate it, leaving `打开 md 就能看` where the file should be.
    const named = assertWorkflowReport({
      ...paragraphReport(),
      synthesis: { mode: 'model', summary: `结果：${S1}\n怎么用：打开 ${DELIVERABLE} 就能看。` },
    }, OBJECTIVE, config)
    const visible = deliverReport(named).text
    expect(visible).toContain(DELIVERABLE)
    expect(visible).not.toContain('weekly-report. md')
    // Named once by the answer and once by the deliverable row.
    expect(visible.split(DELIVERABLE).length - 1).toBeGreaterThanOrEqual(2)
  })

  it('still strips a path the run did not produce, even inside the answer', () => {
    const leaked = assertWorkflowReport({
      ...paragraphReport(),
      synthesis: { mode: 'model', summary: `结果：${S1}\n说明：具体判定见 src/script.ts 那一段。` },
    }, OBJECTIVE, config)
    const visible = deliverReport(leaked).text
    expect(visible).not.toContain('src/script.ts')
    expect(visible).toContain(S1)
  })

  it('keeps four caveats and drops the rest', () => {
    const visible = deliverReport(paragraphReport(
      [U1, U2, U3, U4, U5, U6].map(text => ({ taskId: 'a', text })),
    )).text
    expect(visible).toContain('需要你知道的')
    for (const kept of [U1, U2, U3, U4]) expect(visible).toContain(kept.slice(0, 12))
    for (const dropped of [U5, U6]) expect(visible).not.toContain(dropped)
  })
})

describe('默认一种语言，跟随用户请求的语言', () => {
  it('does not mirror a Chinese answer into English', () => {
    const visible = deliverReport(paragraphReport()).text
    expect(visible).toContain('答案：')
    expect(visible).not.toContain('Answer:')
    expect(visible).not.toContain('That is the conclusion')
  })

  it('answers an English request in English only', () => {
    const visible = deliverReport(paragraphReport(), { lang: 'en' }).text
    expect(visible).toContain('Answer:')
    expect(visible).not.toContain('答案：')
    expect(visible).not.toContain('以上是结论')
  })

  it('keeps the ledger out of the visible block whatever the language', () => {
    for (const lang of ['zh', 'en'] as const) {
      const text = deliverReport(paragraphReport(), { lang }).text
      expect(text).not.toContain('Grok workflow:')
      expect(text).not.toContain('Confirmed evidence:')
      expect(text).not.toContain('Model routes:')
    }
  })
})

/* ------------------------------------------------------- synthesizer cage -- */

function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objective: OBJECTIVE,
    tasks: [task('a')],
    maxConcurrency: 2,
    maxRetries: 1,
    maxTasks: 6,
    maxTotalAgents: 40,
    roles: { synthesizer: [{ model: 'writer' }] },
    synthesis: 'layered',
    ...overrides,
  }
}

/** A three-section polish that rewrites the caveat in its own words. */
const THREE_SECTIONS = [
  '结果：上周门店销量已完成整理，四家门店三周的数据都在周报里。',
  '怎么用：打开周报文件就能看，门店和品类各自成表。',
  '注意：第三方接口的费率还没有核实，补齐后金额可能微调。',
].join('\n')

/** The same polish with the caveat section dropped: the defect this round forbids. */
const NO_CAVEAT = [
  '结果：上周门店销量已完成整理，四家门店三周的数据都在周报里。',
  '怎么用：打开周报文件就能看，门店和品类各自成表。',
].join('\n')

describe('synthesizer：允许 结果/怎么用/注意 三段，caveat 由它重写', () => {
  it('accepts a three-section narrative that paraphrases the open item', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'worker') return execution('did the work', { uncertainties: ['the third-party API rate is unverified'] })
      if (role === 'verifier') return verification(plan[0]!)
      if (role === 'synthesizer') return { summary: THREE_SECTIONS }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: plan }), agent)
    expect(run.report.synthesis.error).toBeUndefined()
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).toContain('结果：')
    expect(summary).toContain('怎么用：')
    expect(summary).toContain('注意：')
    // Rewritten, not pasted: the report's own sentence is not carried over.
    expect(summary).toContain('第三方接口的费率还没有核实')
    expect(summary).not.toContain('the third-party API rate is unverified')
  })

  it('rejects a narrative that drops the caveat section, and falls back', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'worker') return execution('did the work', { uncertainties: ['the third-party API rate is unverified'] })
      if (role === 'verifier') return verification(plan[0]!)
      if (role === 'synthesizer') return { summary: NO_CAVEAT }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: plan }), agent)
    expect(run.report.synthesis.error).toContain('caveat')
    const summary = run.report.synthesis.summary ?? ''
    // The deterministic fallback still carries the open item, plainly.
    expect(summary).toContain('待确认')
    expect(summary).toContain('the third-party API rate is unverified')
    expect(summary).not.toContain('怎么用：')
  })
})
