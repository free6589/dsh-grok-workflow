import { describe, expect, it } from 'vitest'
import { WORKFLOW_SCRIPT, SUMMARY_MAX_ATTEMPTS } from '../src/script.js'
import { runWorkflowScript, type ScriptAgent, roleOf } from './helpers.js'
import { execution, task, verification } from './fixtures.js'

/**
 * B-gap (gap-13): failed 汇总同腿补派 1 次。
 *
 * 缺口:run 686af548 task 30「汇总助手」agent-end outcome=failed 后 20 行内无
 * 任何补派,run 直接 run-end stopReason=error 收尾。汇总腿耗尽(3 稿全拒/调用
 * 失败)后没有任何再派通道,退出即终结。
 *
 * 规则(最小):
 * 1. failed 汇总同腿补派 1 次(同 synthesizer 腿,不换腿);
 * 2. 配置类失败(budget-exhausted/agent-start-failed/category configuration/
 *    setup 位)标为人工(manual),不自动补派;
 * 3. 补派计数随单元(per-unit:attempt 索引本身就是计数器,不用全局计数)。
 */

const OBJECTIVE = 'Ship the verified result'

function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objective: OBJECTIVE,
    tasks: [task('a')],
    maxConcurrency: 2,
    maxRetries: 1,
    maxTasks: 6,
    maxTotalAgents: 40,
    roles: {},
    synthesis: 'layered',
    ...overrides,
  }
}

function planOf() {
  return [task('a')]
}

describe('gap-13: failed 汇总同腿补派 1 次', () => {
  it('synthesizer 调用失败(可重试)时同腿补派 1 次,补派成功即交卷', async () => {
    const plan = planOf()
    let synthCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      if (roleOf(options.label) === 'synthesizer') {
        synthCalls += 1
        // 首次调用:子进程直接死掉(可重试的 transport 失败,seq30 现场即此类)
        if (synthCalls === 1) throw Object.assign(new Error('socket hang up'), { code: 'AGENT_RESULT' })
        return { summary: '任务 a 已完成，证据已核验。' }
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    // 同腿补派恰好 1 次:首发失败 + 补派成功 = 2 次 synthesizer 调用
    const synth = run.calls.filter(call => roleOf(call.label) === 'synthesizer')
    expect(synth).toHaveLength(2)
    // 补派成功:交卷的是 polish(交卷稿),不是 fallback
    expect(run.report.synthesis.mode).toBe('model')
    expect(run.report.synthesis.error).toBeUndefined()
    expect(run.report.synthesis.summary ?? '').toContain('任务 a 已完成')
    // 有界:补派成功后不再多发
    expect(synthCalls).toBe(2)
  })

  it('配置类失败(budget-exhausted)标人工,不自动补派', async () => {
    const plan = planOf()
    let synthCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      if (roleOf(options.label) === 'synthesizer') {
        synthCalls += 1
        // 配置类:AGENT_CAP 预算耗尽,重发只会烧预算(setup 位由分类器置位)
        throw Object.assign(new Error('over the child cap [AGENT_CAP] too many children'), { code: 'AGENT_CAP' })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    // 不补派:只有首发 1 次调用(同调用内 format resubmit 不触发,因非 format-error)
    const synth = run.calls.filter(call => roleOf(call.label) === 'synthesizer')
    expect(synth).toHaveLength(1)
    expect(synthCalls).toBe(1)
    // 标人工:错误串携带 manual 标记
    expect(run.report.synthesis.error ?? '').toContain('manual')
    // 兜底仍在:layered 有确定性叙述,不空交
    expect(run.report.synthesis.summary ?? '').toContain('总体状态')
  })

  it('补派计数随单元:补派本身再失败即终结,不成环', async () => {
    const plan = planOf()
    let synthCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      if (roleOf(options.label) === 'synthesizer') {
        synthCalls += 1
        // 每次都死:首发 + 补派各 1 次,之后必须停
        throw Object.assign(new Error('socket hang up'), { code: 'AGENT_RESULT' })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    // per-unit 有界:首发 + 同腿补派 1 次 = 2 次,不再多发
    const synth = run.calls.filter(call => roleOf(call.label) === 'synthesizer')
    expect(synth).toHaveLength(2)
    expect(synthCalls).toBe(2)
    expect(SUMMARY_MAX_ATTEMPTS).toBe(3)
    // 补派耗尽:回落到确定性叙述,运行本身仍按任务核验结论结算
    expect(run.report.status).toBe('completed')
    expect(run.report.synthesis.summary ?? '').toContain('总体状态：已完成')
  })
})
