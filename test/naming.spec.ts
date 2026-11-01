import { describe, expect, it } from 'vitest'
import {
  NAMING_COPY,
  TASK_TITLE_DISPLAY_LIMIT,
  callStateText,
  memberLabel,
  namingLanguageFromSettings,
  namingSource,
  parseMemberLabel,
  phaseLabel,
  resolveNamingLanguage,
  runTitle,
  taskGroupTitle,
  taskVerdictText,
  truncateTaskTitle,
} from '../src/naming.js'
import { WORKFLOW_SCRIPT } from '../src/script.js'
import { delay, indexOfPhase, roleOf, runWorkflowScript, type ScriptAgent } from './helpers.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

/**
 * Issue #22 Phase 2 — the naming rules the progress panel depends on.
 *
 * The stock Web GUI renders a workflow run by folding the four `tool-workflow/*`
 * events this plugin records: a group header is the *exact* member `phase` string
 * and a row is the member `label`, both verbatim
 * (`@deepseek-ai/dsh-client-ui-workflow-run/lib/client.js:591-640`). Nothing in
 * that component renames anything, so these functions are the only place a user's
 * vocabulary can be introduced — and therefore the only place worth testing.
 */

/** The guest script's own formatters, evaluated exactly as the workflow realm sees them. */
function guestFormatters(language: 'zh' | 'en'): {
  taskGroupTitle: (index: number, title: unknown) => string
  memberLabel: (role: string, attempt: number) => string
  phaseLabel: (kind: string) => string
} {
  const factory = new Function('args', `${namingSource()}\nreturn { taskGroupTitle, memberLabel, phaseLabel }`)
  return factory({ naming: { language } }) as never
}

/** CJK, Hiragana, Katakana and fullwidth punctuation: the ranges an English UI must not show. */
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/

/** Technical shapes a user must never read in a member row (P1-1 naming). */
const TECHNICAL = /(?:^|[\s(:])(?:grok-|-r\d|-a\d|run-|child-|t\d+\b)/

describe('P1-1: one task is one group', () => {
  it('puts a task\'s worker and verifier under the same header', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('done')
      return verification(task('a'))
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      tasks: [task('a')],
      maxConcurrency: 1,
      maxRetries: 0,
      maxTasks: 6,
    }, agent)
    const headers = run.calls.map(call => call.phase)
    expect(headers).toEqual([taskGroupTitle(1, 'Task a'), taskGroupTitle(1, 'Task a')])
    // Grouping is by the whole header string, so equality is what the panel folds.
    expect(new Set(headers).size).toBe(1)
    expect(run.calls.map(call => roleOf(call.label))).toEqual(['worker', 'verifier'])
  })

  it('numbers groups by plan position and never merges two identical titles', () => {
    const first = taskGroupTitle(1, 'Fix the login API', 'zh')
    const second = taskGroupTitle(2, 'Fix the login API', 'zh')
    expect(first).toBe('任务 1 · Fix the login API')
    expect(second).toBe('任务 2 · Fix the login API')
    expect(first).not.toBe(second)
    // The number is the plan position, so it is stable across renders and reloads.
    expect(taskGroupTitle(2, 'Fix the login API', 'zh')).toBe(second)
    expect(taskGroupTitle(1, 'Fix the login API', 'en')).toBe('Task 1 · Fix the login API')
  })

  it('truncates a long title in the header but keeps the whole title in the report', async () => {
    const title = 'Refactor the authentication middleware so every provider shares one clock'
    expect(title.length).toBeGreaterThan(TASK_TITLE_DISPLAY_LIMIT)
    const header = taskGroupTitle(1, title, 'zh')
    expect(header).toBe(`任务 1 · ${title.slice(0, TASK_TITLE_DISPLAY_LIMIT)}…`)
    expect(truncateTaskTitle(title, 3)).toBe('Ref…')
    expect(truncateTaskTitle('😀😀😀', 2)).toBe('😀😀…')

    const agent: ScriptAgent = async () => execution('done')
    const supplied = task('a', undefined)
    supplied.title = title
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      tasks: [supplied],
      maxConcurrency: 1,
      maxRetries: 0,
      maxTasks: 6,
    }, agent)
    // The row the report carries is untouched, so the full title survives.
    expect(run.report.plan.tasks[0]!.title).toBe(title)
    expect(run.calls[0]!.phase!.endsWith('…')).toBe(true)
  })
})

describe('P1-1 / P1-3: what a member row says', () => {
  it('names the roles and only calls out a repeated attempt', () => {
    expect(memberLabel('worker', 1, 'zh')).toBe('执行')
    expect(memberLabel('worker', 2, 'zh')).toBe('执行（尝试 2）')
    expect(memberLabel('verifier', 1, 'zh')).toBe('检查')
    expect(memberLabel('verifier', 3, 'zh')).toBe('检查（尝试 3）')
    expect(memberLabel('planner', 1, 'zh')).toBe('规划助手')
    expect(memberLabel('synthesizer', 1, 'zh')).toBe('汇总助手')
    // Planner and synthesizer run once per run: an attempt suffix would be a lie.
    expect(memberLabel('planner', 2, 'zh')).toBe('规划助手')
    expect(memberLabel('worker', 2, 'en')).toBe('Execute (attempt 2)')
    expect(memberLabel('verifier', 1, 'en')).toBe('Check')
  })

  it('shows no fallback suffix, internal task id or run id in a label', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('done')
      if (roleOf(options.label) === 'verifier') return verification(task('a'))
      return { tasks: [task('a')] }
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      tasks: null,
      maxConcurrency: 1,
      maxRetries: 1,
      maxTasks: 6,
    }, agent)
    for (const call of run.calls) {
      expect(call.label).not.toMatch(TECHNICAL)
      // `-r1` was the provider-fallback marker and `-a2` the attempt marker.
      expect(call.label).not.toContain('-r')
      expect(call.label).not.toContain('-a')
      expect(call.label).not.toContain('grok-')
    }
    expect(run.calls.map(call => call.label)).toContain('规划助手')
  })

  it('keeps the internal identifiers in the data layer', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('done')
      return verification(task('a'))
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      tasks: [task('a')],
      maxConcurrency: 1,
      maxRetries: 0,
      maxTasks: 6,
    }, agent)
    // Nothing was deleted from the report: the task id, the attempt rows and the
    // route trail all still name their internal identities.
    expect(run.report.plan.tasks[0]!.id).toBe('a')
    expect(run.report.tasks[0]!.id).toBe('a')
    expect(run.report.tasks[0]!.attempts[0]!.attempt).toBe(1)
    expect(run.report.routes.map(entry => entry.role)).toEqual(['worker', 'verifier'])
    expect(parseMemberLabel('执行（尝试 2）')).toEqual({ role: 'worker', attempt: 2 })
  })
})

describe('P1-1: a finished child call is not a verified task', () => {
  it('reports the task failed even though both members completed', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('done')
      // The verifier call completes, and still rejects the work.
      return failingVerification(task('a'), 'the evidence does not support the claim')
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      tasks: [task('a')],
      maxConcurrency: 1,
      maxRetries: 0,
      maxTasks: 6,
    }, agent)
    // `agent-end: completed` for both rows — the child calls ended.
    expect(run.calls).toHaveLength(2)
    // The task-level truth is decided by the verifier, not by those endings.
    expect(run.report.tasks[0]!.status).toBe('failed')
    expect(run.report.tasks[0]!.attempts[0]!.passed).toBe(false)
    expect(run.report.status).toBe('failed')
  })

  it('words an ended call as an ended call and a pass only as a task verdict', () => {
    // The two sentences a reader needs: what a finished agent is, and what a finished
    // task is. They are different words, and only the second one is a verdict.
    expect(callStateText('worker', 'ended')).toBe('执行代理已结束')
    expect(callStateText('verifier', 'ended')).toBe('检查调用已结束')
    expect(callStateText('worker', 'running')).toBe('执行代理进行中')
    expect(callStateText('worker', 'ended', 'en')).toBe('Execute agent ended')
    expect(taskVerdictText('verified')).toBe('任务通过')
    expect(taskVerdictText('failed')).toBe('任务未通过')
    // No call state, in either language, can produce a pass word.
    for (const language of ['zh', 'en'] as const) {
      for (const role of ['planner', 'worker', 'verifier', 'synthesizer'] as const) {
        for (const state of ['running', 'ended', 'failed', 'cancelled', 'interrupted'] as const) {
          const text = callStateText(role, state, language)
          expect(text).not.toContain('通过')
          expect(text).not.toContain('任务完成')
        }
      }
    }
    // And no shipped string is the sentence the old panel implied.
    const copy = JSON.stringify(NAMING_COPY)
    for (const forbidden of ['任务已完成', '检查通过', '执行完成']) expect(copy).not.toContain(forbidden)
  })
})

describe('P1-3: two languages, no per-run configuration', () => {
  it('ships Chinese copy for the names Issue #22 lists', () => {
    expect(NAMING_COPY.zh.workflow).toBe('任务团队')
    expect(NAMING_COPY.zh.roles).toEqual({
      planner: '规划助手', worker: '执行', verifier: '检查', synthesizer: '汇总助手',
    })
    expect(['plan', 'execute', 'verify', 'synthesize'].map(kind => phaseLabel(kind as never, 'zh')))
      .toEqual(['规划', '执行', '检查', '汇总'])
  })

  it('keeps the English copy free of Chinese', () => {
    const english = JSON.stringify(NAMING_COPY.en)
    expect(CJK.test(english)).toBe(false)
    expect(phaseLabel('plan', 'en')).toBe('Plan')
    expect(runTitle('en', 2)).toBe('Task team · 2 tasks')
  })

  it('reads the language from the Host locale setting, defaulting to Chinese', () => {
    expect(resolveNamingLanguage('en')).toBe('en')
    expect(resolveNamingLanguage('en-GB')).toBe('en')
    expect(resolveNamingLanguage('zh')).toBe('zh')
    expect(resolveNamingLanguage(undefined)).toBe('zh')
    expect(resolveNamingLanguage(42)).toBe('zh')
    expect(namingLanguageFromSettings([{ ns: 'locale', value: { preference: 'en' } }])).toBe('en')
    expect(namingLanguageFromSettings([{ ns: 'locale', value: {} }])).toBe('zh')
    expect(namingLanguageFromSettings([{ ns: 'other', value: { preference: 'en' } }])).toBe('zh')
    expect(namingLanguageFromSettings(undefined)).toBe('zh')
  })

  it('needs no user-entered names: every string comes from the shipped table', async () => {
    const agent: ScriptAgent = async (_prompt, options) =>
      (roleOf(options.label) === 'worker' || roleOf(options.label, 'en') === 'worker'
        ? execution('done')
        : verification(task('a')))
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      tasks: [task('a')],
      maxConcurrency: 1,
      maxRetries: 0,
      maxTasks: 6,
      naming: { language: 'en' },
    }, agent)
    for (const call of run.calls) expect(CJK.test(`${call.label}${call.phase}`)).toBe(false)
    expect(run.calls.map(call => call.label)).toEqual(['Execute', 'Check'])
    expect(run.calls[0]!.phase).toBe('Task 1 · Task a')
  })
})

describe('P1-4: nothing measured, nothing invented', () => {
  it('has no percentage, token counter, ETA or invented activity copy', () => {
    const copy = JSON.stringify(NAMING_COPY)
    for (const forbidden of ['%', 'token', 'ETA', 'remaining', 'estimated', '正在修改', 'percent']) {
      expect(copy).not.toContain(forbidden)
    }
    // The only number the panel may add is a task total the Host actually knows.
    expect(runTitle('zh', 4)).toContain('4')
    expect(runTitle('zh', undefined)).toBe('任务团队')
  })
})

describe('the guest copy matches the host copy', () => {
  it('renders identical headers, labels and phases in the script realm', async () => {
    for (const language of ['zh', 'en'] as const) {
      const guest = guestFormatters(language)
      const titles = ['Task a', 'Refactor the authentication middleware so every provider shares one clock', '', '   ', '😀 emoji title']
      for (const [offset, title] of titles.entries()) {
        const index = offset + 1
        expect(guest.taskGroupTitle(index, title)).toBe(taskGroupTitle(index, title, language))
      }
      for (const role of ['planner', 'worker', 'verifier', 'synthesizer'] as const) {
        for (const attempt of [0, 1, 2, 5]) {
          expect(guest.memberLabel(role, attempt)).toBe(memberLabel(role, attempt, language))
        }
      }
      for (const kind of ['plan', 'execute', 'verify', 'synthesize', 'answer'] as const) {
        expect(guest.phaseLabel(kind)).toBe(phaseLabel(kind, language))
      }
    }
    // `args.naming.language` is what selects the table inside the script realm.
    const english = new Function('args', `${namingSource()}\nreturn memberLabel('worker', 2)`)
    expect(english({ naming: { language: 'en' } })).toBe('Execute (attempt 2)')
    expect(english({})).toBe('执行（尝试 2）')
  })
})

describe('grouping under the real pool', () => {
  it('keeps every task in its own group while five run together', async () => {
    const tasks = ['a', 'b', 'c'].map(id => task(id))
    const seen: Array<{ phase?: string, label: string }> = []
    const agent: ScriptAgent = async (_prompt, options) => {
      seen.push({ ...options.phase === undefined ? {} : { phase: options.phase }, label: options.label })
      await delay(1)
      const position = indexOfPhase(options.phase ?? '')
      if (roleOf(options.label) === 'worker') return execution(`did ${tasks[position - 1]!.id}`)
      return verification(tasks[position - 1]!)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      tasks,
      maxConcurrency: 3,
      maxRetries: 0,
      maxTasks: 6,
    }, agent)
    expect(run.report.status).toBe('completed')
    const headers = [...new Set(seen.map(entry => entry.phase))]
    expect(headers).toEqual(tasks.map((item, index) => taskGroupTitle(index + 1, item.title, 'zh')))
    // Concurrency never crosses a group: a header only ever carries its own task's rows.
    for (const header of headers) {
      const rows = seen.filter(entry => entry.phase === header)
      expect(new Set(rows.map(row => row.label))).toEqual(new Set(['执行', '检查']))
    }
  })
})
