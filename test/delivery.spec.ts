import { describe, expect, it } from 'vitest'
import { REPORT_BEGIN, REPORT_END, relayText } from '../src/answer.js'
import { parseReportRound } from '../src/carryover.js'
import { cancelledText } from '../src/gate.js'
import { DELIVERY_LIMITS, deliveryForReport, deliveryScenario } from '../src/delivery.js'
import type { WorkflowReport } from '../src/types.js'

/**
 * User-delivery layer (deterministic, offline).
 *
 * The six scenarios — code fix, research, pure Q&A, partial, failed and the
 * cancelled split — each get exact-output pins in both languages, plus the
 * three contracts that make the delivery safe to ship:
 *
 * 1. **No internals.** The delivery text never carries task ids, status enums,
 *    route labels, attempt counters, deadlines or limits — even when the report
 *    is full of them.
 * 2. **Nothing invented, nothing dropped.** Every quoted fragment traces back
 *    to a report field, and uncertainties/evidence survive in every scenario.
 * 3. **Carry-over keeps working.** The delivered message still carries the
 *    machine record after the closing marker, because `src/carryover.ts`
 *    compiles earlier rounds from exactly that durable text.
 */

/** A hand-built validated-shaped report; the delivery layer reads fields only. */
function makeReport(overrides: Partial<WorkflowReport> & { summary?: string } = {}): WorkflowReport {
  const { summary, ...rest } = overrides
  return {
    schemaVersion: 'grok-workflow/v1',
    status: 'completed',
    objective: 'do the work',
    plan: { source: 'caller', tasks: [] },
    tasks: [],
    confirmed: [],
    incomplete: [],
    errors: [],
    uncertainties: [],
    routes: [],
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic', ...summary === undefined ? {} : { summary } },
    limits: { maxConcurrency: 4, maxRetries: 2, maxTasks: 12, maxTotalAgents: 20, timeoutMs: 3_600_000 },
    ...rest,
  } as WorkflowReport
}

/** A verified code-fix task with decoy internals (ids, routes, counters). */
function codeReport(lang: 'zh' | 'en'): WorkflowReport {
  const zh = lang === 'zh'
  return makeReport({
    status: 'completed',
    objective: zh ? '修复登录重试循环' : 'fix the login retry loop',
    tasks: [{
      id: 'task-7',
      title: zh ? '修复登录重试循环' : 'Fix the login retry loop',
      objective: '',
      expectedOutput: '',
      acceptanceCriteria: [zh ? '重试不超过三次' : 'retry bounded'],
      context: '',
      constraints: [],
      writesPaths: null,
      status: 'verified',
      attempts: [{
        attempt: 1,
        passed: true,
        execution: {
          summary: zh ? '修复了重试逻辑' : 'fixed the retry logic',
          status: 'completed',
          deliverables: [{ description: 'patch', locator: 'src/auth/login.ts' }],
          evidence: [{ claim: zh ? '重试有界' : 'retries bounded', source: 'src/auth/login.ts' }],
          testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
          filesChanged: ['src/auth/login.ts'],
          uncertainties: [],
        },
        verification: null,
      }],
      error: '',
    }],
    confirmed: [{
      taskId: 'task-7',
      criterion: zh ? '重试不超过三次' : 'retry bounded',
      evidence: zh ? 'npm test 通过，重试计数为 2' : 'npm test passed with a retry count of 2',
    }],
    uncertainties: [{ taskId: 'task-7', text: zh ? '旧会话的 token 未回归测试' : 'legacy session tokens were not regression-tested' }],
    routes: [{ role: 'worker', chainIndex: 0, route: 'wb/cn:model-x', attempt: 1, outcome: 'ok', queuedMs: 120 }],
    routing: { planner: [], worker: ['wb/cn:model-x'], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic', summary: zh ? '登录重试循环已修复，重试间隔按指数退避。' : 'The login retry loop now backs off exponentially.' },
  })
}

/** A verified research task: evidence and deliverables, but no file changes. */
function researchReport(lang: 'zh' | 'en'): WorkflowReport {
  const zh = lang === 'zh'
  return makeReport({
    status: 'completed',
    objective: zh ? '调研重试风暴的根因' : 'research the retry-storm root cause',
    tasks: [{
      id: 'task-3',
      title: zh ? '重试风暴根因调研' : 'Retry-storm root-cause research',
      objective: '',
      expectedOutput: '',
      acceptanceCriteria: [zh ? '给出根因' : 'root cause named'],
      context: '',
      constraints: [],
      writesPaths: null,
      status: 'verified',
      attempts: [{
        attempt: 1,
        passed: true,
        execution: {
          summary: zh ? '完成了根因调研' : 'completed the research',
          status: 'completed',
          deliverables: [{ description: zh ? '调研笔记' : 'research notes', locator: 'docs/research/retry.md' }],
          evidence: [{ claim: zh ? '缺失指数退避导致雪崩' : 'missing backoff causes the cascade', source: 'docs/research/retry.md' }],
          testsRun: [],
          filesChanged: [],
          uncertainties: [],
        },
        verification: null,
      }],
      error: '',
    }],
    confirmed: [{
      taskId: 'task-3',
      criterion: zh ? '给出根因' : 'root cause named',
      evidence: zh ? '缺失指数退避导致雪崩（docs/research/retry.md）' : 'missing backoff causes the cascade (docs/research/retry.md)',
    }],
    routes: [],
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic', summary: zh ? '重试风暴由指数退避缺失引起。' : 'The retry storm comes from missing exponential backoff.' },
  })
}

/** A pure answer: nothing but a summary and the confirmed evidence behind it. */
function answerReport(lang: 'zh' | 'en'): WorkflowReport {
  const zh = lang === 'zh'
  return makeReport({
    status: 'completed',
    objective: zh ? '计算 919 + 27' : 'compute 919 + 27',
    tasks: [{
      id: 'task-1',
      title: zh ? '计算 919 + 27' : 'Compute 919 + 27',
      objective: '',
      expectedOutput: '',
      acceptanceCriteria: [zh ? '计算正确' : 'sum is correct'],
      context: '',
      constraints: [],
      writesPaths: null,
      status: 'verified',
      attempts: [{
        attempt: 1,
        passed: true,
        execution: {
          summary: zh ? '919 + 27 = 946。' : '919 + 27 = 946.',
          status: 'completed',
          deliverables: [],
          evidence: [],
          testsRun: [],
          filesChanged: [],
          uncertainties: [],
        },
        verification: null,
      }],
      error: '',
    }],
    confirmed: [{
      taskId: 'task-1',
      criterion: zh ? '计算正确' : 'sum is correct',
      evidence: zh ? '逐位验算一致' : 'digit-wise check agrees',
    }],
    routes: [],
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic', summary: zh ? '919 + 27 = 946。' : '919 + 27 = 946.' },
  })
}

/** One verified task banked before the run stopped; the other failed. */
function partialReport(lang: 'zh' | 'en'): WorkflowReport {
  const zh = lang === 'zh'
  return makeReport({
    status: 'partial',
    objective: zh ? '修复重试循环并补回归测试' : 'fix the retry loop and add regression tests',
    plan: { source: 'caller', tasks: [] },
    tasks: [{
      id: 'task-7',
      title: zh ? '修复登录重试循环' : 'Fix the login retry loop',
      objective: '',
      expectedOutput: '',
      acceptanceCriteria: [zh ? '重试不超过三次' : 'retry bounded'],
      context: '',
      constraints: [],
      writesPaths: null,
      status: 'verified',
      attempts: [{
        attempt: 1,
        passed: true,
        execution: {
          summary: zh ? '修复了重试逻辑' : 'fixed the retry logic',
          status: 'completed',
          deliverables: [],
          evidence: [],
          testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
          filesChanged: ['src/auth/login.ts'],
          uncertainties: [],
        },
        verification: null,
      }],
      error: '',
    }, {
      id: 'task-8',
      title: zh ? '编写重试回归测试' : 'Write retry regression tests',
      objective: '',
      expectedOutput: '',
      acceptanceCriteria: [zh ? '测试覆盖退避' : 'tests cover backoff'],
      context: '',
      constraints: [],
      writesPaths: null,
      status: 'failed',
      attempts: [{ attempt: 1, passed: false, execution: null, verification: null }],
      error: '',
    }],
    confirmed: [{
      taskId: 'task-7',
      criterion: zh ? '重试不超过三次' : 'retry bounded',
      evidence: zh ? 'npm test 通过，重试计数为 2' : 'npm test passed with a retry count of 2',
    }],
    incomplete: [{
      taskId: 'task-8',
      reason: zh ? '验证命令失败：npm test 有 2 个断言未过' : 'the verification command failed: npm test has 2 failing assertions',
      category: 'quality',
    }],
    uncertainties: [{ taskId: 'task-7', text: zh ? '旧会话的 token 未回归测试' : 'legacy session tokens were not regression-tested' }],
    routes: [],
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic', summary: zh ? '登录重试循环已修复，重试间隔按指数退避。' : 'The login retry loop now backs off exponentially.' },
  })
}

/** A run-level failure: no tasks, one reason, honest and bare. */
function failedReport(lang: 'zh' | 'en'): WorkflowReport {
  const zh = lang === 'zh'
  const reason = zh ? '引擎在启动规划子代理时失败：provider unreachable' : 'the engine failed to start the planner child: provider unreachable'
  return makeReport({
    status: 'failed',
    objective: zh ? '修复登录重试循环' : 'fix the login retry loop',
    plan: { source: 'unavailable', tasks: [], error: reason },
    tasks: [],
    incomplete: [{ taskId: 'workflow', reason, category: 'infrastructure' }],
    errors: [{ phase: 'plan', message: reason, category: 'infrastructure' }],
    routes: [],
    routing: { planner: ['global/main'], worker: ['global/main'], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic' },
  })
}

/** A task-level failure: the task exists, has a title, and did not verify. */
function failedTaskReport(lang: 'zh' | 'en'): WorkflowReport {
  const zh = lang === 'zh'
  const reason = zh ? '两次尝试的验证都未通过：证据不足' : 'verification failed on both attempts: not enough evidence'
  return makeReport({
    status: 'failed',
    objective: zh ? '修复登录重试循环' : 'fix the login retry loop',
    plan: { source: 'planner', tasks: [] },
    tasks: [{
      id: 'task-9',
      title: zh ? '修复登录重试循环' : 'Fix the login retry loop',
      objective: '',
      expectedOutput: '',
      acceptanceCriteria: [zh ? '重试不超过三次' : 'retry bounded'],
      context: '',
      constraints: [],
      writesPaths: null,
      status: 'failed',
      attempts: [{
        attempt: 1,
        passed: false,
        execution: {
          summary: zh ? '尝试了修复' : 'attempted the fix',
          status: 'failed',
          deliverables: [{ description: 'patch', locator: 'src/auth/login.ts' }],
          evidence: [],
          testsRun: [{ command: 'npm test', status: 'failed', detail: '2 assertions failed' }],
          filesChanged: ['src/auth/login.ts'],
          uncertainties: [],
        },
        verification: null,
        failure: { class: 'verification-failed', reason, category: 'quality' },
      }],
      error: '',
    }],
    incomplete: [{ taskId: 'task-9', reason, category: 'quality' }],
    errors: [],
    uncertainties: [{ taskId: 'task-9', text: zh ? '旧会话的 token 未回归测试' : 'legacy session tokens were not regression-tested' }],
    routes: [{ role: 'worker', chainIndex: 0, route: 'wb/cn:model-x', attempt: 1, outcome: 'failed', failureClass: 'verification-failed' }],
    routing: { planner: [], worker: ['wb/cn:model-x'], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic' },
  })
}

/** The ledger tokens that must never appear in a delivery text. */
const INTERNAL_LEAKS = [
  'task-',
  'Grok workflow:',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'Plan:',
  'Plan failure',
  'Model routes',
  'Deadline',
  'Route switches',
  'Route overflows',
  'attempt 1',
  'wb/cn:model-x',
  'maxConcurrency',
  'queuedMs',
]

function innerOf(text: string): string {
  const begin = text.indexOf(REPORT_BEGIN)
  const end = text.indexOf(REPORT_END)
  expect(begin).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(begin)
  return text.slice(begin + REPORT_BEGIN.length, end)
}

describe('delivery scenario detection (statuses never confused)', () => {
  it('maps a completed code fix, research and pure answer by their artifacts', () => {
    expect(deliveryScenario(codeReport('zh'))).toBe('code')
    expect(deliveryScenario(researchReport('zh'))).toBe('research')
    expect(deliveryScenario(answerReport('zh'))).toBe('answer')
  })

  it('keeps partial and failed statuses even when attempts left artifacts behind', () => {
    expect(deliveryScenario(partialReport('zh'))).toBe('partial')
    expect(deliveryScenario(failedReport('zh'))).toBe('failed')
    // A failed task whose attempt patched files and ran commands is still a
    // failure: artifacts of a failed attempt never read as delivered work.
    expect(deliveryScenario(failedTaskReport('zh'))).toBe('failed')
  })
})

describe('code-fix delivery', () => {
  it('renders result-first Chinese wording with location, verification and caveats', () => {
    expect(deliveryForReport(codeReport('zh'), 'zh')).toBe([
      '已完成 1 项任务并通过核验：修复登录重试循环。',
      '改动落在：src/auth/login.ts。',
      '验证命令已全部通过：npm test。',
      '结论：登录重试循环已修复，重试间隔按指数退避。',
      '依据：',
      '- 重试不超过三次 — npm test 通过，重试计数为 2',
      '仍不确定：',
      '- 旧会话的 token 未回归测试',
    ].join('\n'))
  })

  it('renders the English mirror without internal fields', () => {
    const text = deliveryForReport(codeReport('en'), 'en')
    expect(text).toBe([
      'Done: Fix the login retry loop — 1 of 1 tasks verified.',
      'Changed: src/auth/login.ts.',
      'Verified by: npm test.',
      'Summary: The login retry loop now backs off exponentially.',
      'Basis:',
      '- retry bounded — npm test passed with a retry count of 2',
      'Still uncertain:',
      '- legacy session tokens were not regression-tested',
    ].join('\n'))
    for (const leak of INTERNAL_LEAKS) expect(text).not.toContain(leak)
  })
})

describe('research delivery', () => {
  it('leads with the finding in Chinese and keeps the evidence pointer', () => {
    expect(deliveryForReport(researchReport('zh'), 'zh')).toBe([
      '结论：重试风暴由指数退避缺失引起。',
      '以上结论来自 1 项已核验的任务：重试风暴根因调研。',
      '依据：',
      '- 给出根因 — 缺失指数退避导致雪崩（docs/research/retry.md）',
    ].join('\n'))
  })

  it('leads with the findings in English and keeps the evidence pointer', () => {
    const text = deliveryForReport(researchReport('en'), 'en')
    expect(text).toBe([
      'Findings: The retry storm comes from missing exponential backoff.',
      'These findings come from 1 verified task: Retry-storm root-cause research.',
      'Basis:',
      '- root cause named — missing backoff causes the cascade (docs/research/retry.md)',
    ].join('\n'))
    for (const leak of INTERNAL_LEAKS) expect(text).not.toContain(leak)
  })
})

describe('pure Q&A delivery', () => {
  it('delivers the answer itself first, in Chinese, with its basis', () => {
    const text = deliveryForReport(answerReport('zh'), 'zh')
    expect(text).toBe([
      '919 + 27 = 946。',
      '依据：',
      '- 计算正确 — 逐位验算一致',
    ].join('\n'))
  })

  it('delivers the answer itself first, in English', () => {
    const text = deliveryForReport(answerReport('en'), 'en')
    expect(text).toBe([
      '919 + 27 = 946.',
      'Basis:',
      '- sum is correct — digit-wise check agrees',
    ].join('\n'))
    for (const leak of INTERNAL_LEAKS) expect(text).not.toContain(leak)
  })

  it('falls back to the verified count when the report carries no narrative', () => {
    const bare = makeReport({
      ...answerReport('zh'),
      synthesis: { mode: 'deterministic' },
    })
    const text = deliveryForReport(bare, 'zh')
    expect(text).toContain('已完成 1 项任务并通过核验：计算 919 + 27。')
    expect(text).toContain('依据：')
  })
})

describe('partial delivery', () => {
  it('states the verified/failed split in Chinese without upgrading the status', () => {
    const text = deliveryForReport(partialReport('zh'), 'zh')
    expect(text).toBe([
      '部分完成：1/2 项任务已通过核验：修复登录重试循环。',
      '未完成：编写重试回归测试——验证命令失败：npm test 有 2 个断言未过。',
      '已核验部分的结论：登录重试循环已修复，重试间隔按指数退避。',
      '改动落在：src/auth/login.ts。',
      '验证命令已全部通过：npm test。',
      '依据：',
      '- 重试不超过三次 — npm test 通过，重试计数为 2',
      '仍不确定：',
      '- 旧会话的 token 未回归测试',
    ].join('\n'))
  })

  it('states the verified/failed split in English without upgrading the status', () => {
    const text = deliveryForReport(partialReport('en'), 'en')
    expect(text).toContain('Partly done: 1/2 tasks verified: Fix the login retry loop.')
    expect(text).toContain('Not finished: Write retry regression tests: the verification command failed: npm test has 2 failing assertions.')
    expect(text).not.toContain('Done: Fix the login retry loop —')
    for (const leak of INTERNAL_LEAKS) expect(text).not.toContain(leak)
  })

  it('names the planning degradation when a fallback partial has no failed task', () => {
    const degraded = makeReport({
      ...partialReport('zh'),
      tasks: [partialReport('zh').tasks[0]!],
      incomplete: [],
      plan: { source: 'fallback', tasks: [], error: '规划子代理两次都未产出可用计划' },
    })
    const text = deliveryForReport(degraded, 'zh')
    expect(text).toContain('说明：规划阶段降级（规划子代理两次都未产出可用计划），整体状态仍为部分完成。')
    expect(text).toContain('部分完成：1/1 项任务已通过核验')
  })
})

describe('failed delivery', () => {
  it('states a run-level failure without any success wording (Chinese)', () => {
    const text = deliveryForReport(failedReport('zh'), 'zh')
    expect(text).toBe([
      '未能完成：这次运行没有可交付的结果。',
      '原因：引擎在启动规划子代理时失败：provider unreachable。',
    ].join('\n'))
    expect(text).not.toContain('已完成')
    expect(text).not.toContain('依据：')
  })

  it('states a run-level failure without any success wording (English)', () => {
    const text = deliveryForReport(failedReport('en'), 'en')
    expect(text).toBe([
      'This run could not be completed: nothing was delivered.',
      'Reason: the engine failed to start the planner child: provider unreachable.',
    ].join('\n'))
    for (const leak of INTERNAL_LEAKS) expect(text).not.toContain(leak)
  })

  it('names the tasks that did not verify and never quotes their artifacts as delivered', () => {
    const text = deliveryForReport(failedTaskReport('zh'), 'zh')
    expect(text).toContain('未能完成：这次运行没有可交付的结果。')
    expect(text).toContain('原因：两次尝试的验证都未通过：证据不足。')
    expect(text).toContain('未通过核验的任务：修复登录重试循环。')
    expect(text).not.toContain('改动落在')
    expect(text).not.toContain('已完成')
  })
})

describe('cancelled terminal (the cancelled split)', () => {
  it('tells a pre-start cancellation apart from a mid-run one (Chinese)', () => {
    const before = cancelledText('', undefined, 'zh')
    expect(before).toContain('运行已取消：这条消息没有完成，也没有可交付的结果。')
    expect(before).toContain('还没有派工，没有启动任何工人')
    expect(before).not.toContain('已核验')

    const midRun = cancelledText('用户停止了这一轮', partialReport('zh'), 'zh')
    expect(midRun).toContain('运行已取消：工作流在全部任务完成前停止，取消前 1/2 项任务已通过核验。')
    expect(midRun).toContain('总体状态仍为取消，不代表全部完成。')
    expect(midRun).toContain('原因：用户停止了这一轮')
    // What had verified survives, with its evidence and doubts.
    expect(midRun).toContain('已核验：修复登录重试循环。')
    expect(midRun).toContain('依据：')
    expect(midRun).toContain('- 重试不超过三次 — npm test 通过，重试计数为 2')
    expect(midRun).toContain('仍不确定：')
    expect(midRun).toContain('- 旧会话的 token 未回归测试')
    // The audit copy of the interrupted run stays attached, labelled.
    expect(midRun).toContain('取消前保留的工作流报告：')
    expect(midRun).toContain('Grok workflow: PARTIAL')
    expect(midRun).not.toContain('已完成 1 项任务并通过核验')
  })

  it('renders the same split in English', () => {
    const before = cancelledText('', undefined, 'en')
    expect(before).toContain('Run cancelled: this message did not finish and has no deliverable result.')
    expect(before).toContain('No worker was started')

    const midRun = cancelledText('the user stopped the turn', partialReport('en'), 'en')
    expect(midRun).toContain('Run cancelled: the workflow stopped before every task finished; 1 of 2 tasks had passed verification before the cancel.')
    expect(midRun).toContain('Verified: Fix the login retry loop.')
    expect(midRun).toContain('Still uncertain:')
    expect(midRun).toContain('Workflow report kept from before the cancel:')
  })
})

describe('relay wiring', () => {
  it('puts the delivery text between the markers and the machine record after them', () => {
    const text = relayText(codeReport('zh'), undefined, { lang: 'zh' })
    const inner = innerOf(text)
    expect(inner).toContain('已完成 1 项任务并通过核验')
    expect(inner).not.toContain('Grok workflow:')
    // The internal record follows the closing marker, introduced by its note.
    const end = text.indexOf(REPORT_END)
    expect(text.slice(end)).toContain('(Internal record for later turns — not part of the reply.)')
    expect(text.slice(end)).toContain('Grok workflow: COMPLETED')
    // The preamble promises verbatim reproduction and forbids the record.
    expect(text).toContain('Reply with that text exactly as given')
    expect(text).toContain('never reproduce or describe it')
  })

  it('keeps a failure honest in delivery mode', () => {
    const text = relayText(failedReport('zh'), undefined, { lang: 'zh' })
    expect(text).toContain('could not complete the workflow')
    const inner = innerOf(text)
    expect(inner).toContain('未能完成')
    expect(inner).not.toContain('已完成')
    expect(text.slice(text.indexOf(REPORT_END))).toContain('Grok workflow: FAILED')
  })

  it('renders the tier header first, still inside the markers (t52)', () => {
    const text = relayText(codeReport('zh'), '已走团队档，正在执行。', { lang: 'zh' })
    const inner = innerOf(text)
    expect(inner.indexOf('已走团队档，正在执行。')).toBeGreaterThan(-1)
    expect(inner.indexOf('已走团队档，正在执行。')).toBeLessThan(inner.indexOf('已完成 1 项任务'))
  })

  it('restores the machine ledger between the markers when delivery is off', () => {
    const text = relayText(codeReport('zh'), undefined, { lang: 'zh', delivery: false })
    const inner = innerOf(text)
    expect(inner).toContain('Grok workflow: COMPLETED')
    expect(inner).not.toContain('已完成 1 项任务')
    expect(text).toContain('produced the report below')
    // No record rides after the closing marker: the ledger is the body itself.
    expect(text.endsWith(REPORT_END)).toBe(true)
  })

  it('keeps cross-round carry-over working from the delivered message', () => {
    // The durable message the gate writes is the relay text itself; carry-over
    // compiles earlier rounds from exactly this text, so the machine record
    // after the closing marker must stay parseable.
    const round = parseReportRound(relayText(codeReport('zh'), undefined, { lang: 'zh' }))
    expect(round).not.toBeNull()
    expect(round!.status).toBe('completed')
    // The machine record keeps the ledger vocabulary the parser expects (ids
    // and all): the delivery layer changed the reply, not the durable record.
    expect(round!.confirmed.some(item => item.includes('重试不超过三次') && item.includes('npm test 通过，重试计数为 2'))).toBe(true)
    expect(round!.uncertainties.some(item => item.includes('旧会话的 token 未回归测试'))).toBe(true)
    expect(round!.summary).toContain('登录重试循环已修复')
  })

  it('carries uncertainties through the delivery in every scenario that has them', () => {
    const answerWithDoubts = {
      ...answerReport('zh'),
      uncertainties: [{ taskId: 'task-1', text: '旧会话的 token 未回归测试' }],
    }
    for (const report of [codeReport('zh'), partialReport('zh'), answerWithDoubts, failedTaskReport('zh')]) {
      expect(deliveryForReport(report as WorkflowReport, 'zh')).toContain('旧会话的 token 未回归测试')
    }
  })
})

describe('bounds and language fallback', () => {
  it('caps the delivery text with a surrogate-safe cut', () => {
    const long = makeReport({
      ...answerReport('zh'),
      synthesis: { mode: 'deterministic', summary: `结论${'很'.repeat(6_000)}长。🔗` },
    })
    const text = deliveryForReport(long, 'zh')
    expect(text.length).toBeLessThanOrEqual(DELIVERY_LIMITS.totalChars)
    // Never split a code point at the boundary.
    expect(Array.from(text).join('')).toBe(text)
  })

  it('defaults the language to the report objective (D-022)', () => {
    expect(deliveryForReport(codeReport('zh'))).toContain('已完成')
    expect(deliveryForReport(codeReport('en'))).toContain('Done:')
  })
})
