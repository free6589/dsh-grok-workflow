import { describe, expect, it } from 'vitest'
import { HARD_LIMITS, resolveConfig } from '../src/config.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, maxTotalAgentsFor, routeBudgetFor, WORKFLOW_SCRIPT } from '../src/script.js'
import { runWorkflowScript, type ScriptAgent, roleOf, idOfPhase } from './helpers.js'
import { execution, task, verification } from './fixtures.js'

/**
 * Layered synthesis with factual guardrails (Section IV).
 *
 * The layered policy runs the verified aggregation first, optionally lets one
 * synthesizer call polish the narrative under deterministic guardrails, and
 * answers with a deterministic natural-language summary whenever the model path
 * is unavailable. These tests pin the five invariants that make that honest:
 *
 * 1. the final content is built from the verified report with executor claims,
 *    verifier judgments and confirmed evidence kept apart;
 * 2. the polish cannot alter the verdict, invent passing tests, promote
 *    speculation or hide uncertainties — a bad polish is replaced, not shown;
 * 3. the deterministic fallback exists and is used when the model path is down;
 * 4. zh and en output stay natural in their own language;
 * 5. a failed run stays failed and an unrun test never renders as passed.
 *
 * Only the model/network boundary is mocked (the scripted `agent`); the script,
 * its aggregation and the guardrail are real.
 */

const OBJECTIVE = 'Ship the verified result'

/** Role of a member label in either shipped language (en-language runs use en labels). */
const roleIn = (label: string | undefined) => roleOf(label, 'zh') ?? roleOf(label, 'en')

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

describe('layered synthesis: deterministic base narrative', () => {
  it('answers from the report data alone when no synthesizer chain is configured', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: plan }), agent)
    expect(run.report.status).toBe('completed')
    expect(run.calls.filter(call => roleOf(call.label) === 'synthesizer')).toHaveLength(0)
    expect(run.report.synthesis.mode).toBe('deterministic')
    expect(run.report.synthesis.error).toBeUndefined()
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).toContain('总体状态：已完成')
    expect(summary).toContain('1/1 项任务已由独立检查核验')
    expect(summary).toContain('任务 a：a works')
    expect(summary).toContain('verified a works in file:///tmp/report')
  })

  it('keeps a failed run failed in the narrative — never a success claim', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return null
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    expect(run.report.status).toBe('failed')
    expect(run.report.synthesis.mode).toBe('deterministic')
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).toContain('总体状态：未通过')
    expect(summary).toContain('尚无任务通过独立核验')
    expect(summary).not.toContain('已完成')
    expect(summary).not.toContain('部分完成')
    expect(summary).not.toMatch(/全部.{0,6}(通过|完成)/)
  })

  it('renders an unrun test as not run, in zh and en — never as passed', async () => {
    const plan = [task('a')]
    const unrun = { command: 'npm run check', status: 'not_run' as const, detail: 'could not run here' }
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleIn(options.label) === 'worker') return execution('wrote the check', { testsRun: [unrun] })
      if (roleIn(options.label) === 'verifier') return verification(plan[0]!, { commandsRun: [unrun] })
      throw new Error(`unexpected label ${options.label}`)
    }
    const zh = await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: plan }), agent)
    expect(zh.report.status).toBe('completed')
    const zhSummary = zh.report.synthesis.summary ?? ''
    expect(zhSummary).toContain('未运行 1')
    expect(zhSummary).toContain('执行者自报：通过 0')
    expect(zhSummary).not.toContain('通过 1')

    const en = await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: plan, naming: { language: 'en' } }), agent)
    const enSummary = en.report.synthesis.summary ?? ''
    expect(enSummary).toContain('1 not run')
    expect(enSummary).toContain('executor-reported: 0 passed')
    expect(enSummary).not.toContain('1 passed')
    expect(enSummary).not.toMatch(/[\u4e00-\u9fff]/)
  })

  it('keeps zh output natural zh and en output natural en', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleIn(options.label) === 'worker') return execution('did the work')
      if (roleIn(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const zh = await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: plan }), agent)
    const zhSummary = zh.report.synthesis.summary ?? ''
    expect(zhSummary).toContain('总体状态')
    expect(zhSummary).toContain('已确认（独立核验）')
    expect(zhSummary).not.toContain('Overall status')

    const en = await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: plan, naming: { language: 'en' } }), agent)
    const enSummary = en.report.synthesis.summary ?? ''
    expect(enSummary).toContain('Overall status: completed')
    expect(enSummary).toContain('Confirmed (independent verification):')
    expect(enSummary).not.toMatch(/[\u4e00-\u9fff]/)
  })
})

describe('layered synthesis: constrained polish and factual guardrails', () => {
  it('feeds the polish a digest that keeps executor claims, verifier judgments and confirmed evidence apart', async () => {
    const plan = [task('a')]
    let polishPrompt = ''
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'synthesizer') {
        polishPrompt = prompt
        return { summary: '任务 a 已完成，证据已核验。' }
      }
      if (roleOf(options.label) === 'worker') return execution('executor says done')
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    expect(run.calls.filter(call => roleOf(call.label) === 'synthesizer')).toHaveLength(1)
    expect(polishPrompt).toContain('CONFIRMED EVIDENCE (checked by independent verifiers):')
    expect(polishPrompt).toContain('VERIFIER JUDGMENTS (this run')
    expect(polishPrompt).toContain('EXECUTOR CLAIMS (self-reported, not independently verified):')
    expect(polishPrompt).toContain('executor says done')
    expect(polishPrompt).toContain('verified a works in file:///tmp/report')
    expect(polishPrompt).toContain('verifier verdict pass')
    // The polish was clean, so it ships — with the report-derived notes appended.
    expect(run.report.synthesis.mode).toBe('model')
    expect(run.report.synthesis.error).toBeUndefined()
    const summary = run.report.synthesis.summary ?? ''
    expect(summary.startsWith('任务 a 已完成，证据已核验。')).toBe(true)
    expect(summary).toContain('报告附注')
    expect(summary).toContain('检查者核验：通过 1')
  })

  it('replaces a polish that claims full success on a partial run', async () => {
    const plan = [task('ok'), task('broken')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'synthesizer') return { summary: '全部任务均已通过核验，一切完成。' }
      if (roleOf(options.label) === 'worker') return idOfPhase(options.phase) === 'broken' ? null : execution('ok')
      if (roleOf(options.label) === 'verifier') {
        return verification(plan.find(item => item.id === idOfPhase(options.phase))!)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    expect(run.report.status).toBe('partial')
    expect(run.report.synthesis.mode).toBe('model')
    expect(run.report.synthesis.error).toContain('guardrail')
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).toContain('总体状态：部分完成')
    expect(summary).toContain('1/2 项任务已由独立检查核验')
    expect(summary).not.toContain('全部任务均已通过')
    expect(summary).toContain('未完成（未通过核验）')
  })

  it('replaces a polish that invents passing tests when no checker verified one', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'synthesizer') return { summary: 'All tests passed and the work is complete.' }
      if (roleOf(options.label) === 'worker') return execution('did it', { testsRun: [] })
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!, { commandsRun: [] })
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(run.report.synthesis.error).toContain('passing tests')
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).not.toContain('All tests passed')
    expect(summary).toContain('总体状态：已完成')
  })

  it('replaces a polish that cites a path the verified report never produced', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'synthesizer') return { summary: '结果已核验，详见 `out/never-produced.bin`。' }
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    expect(run.report.synthesis.error).toContain('does not contain')
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).not.toContain('never-produced.bin')
    expect(summary).toContain('总体状态：已完成')
  })

  it('replaces a polish that denies the uncertainties the report lists', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'synthesizer') return { summary: '没有未决问题，一切顺利。' }
      if (roleOf(options.label) === 'worker') {
        return execution('did it', { uncertainties: ['the third-party API rate is unverified'] })
      }
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(run.report.uncertainties.length).toBeGreaterThan(0)
    expect(run.report.synthesis.error).toContain('open items')
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).not.toContain('没有未决问题')
    // The fallback re-prints the open item the polish tried to deny.
    expect(summary).toContain('待确认')
    expect(summary).toContain('the third-party API rate is unverified')
  })

  it('keeps the open items visible even when the polish itself passes', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'synthesizer') return { summary: '任务 a 已完成，证据已核验。' }
      if (roleOf(options.label) === 'worker') {
        return execution('did it', { uncertainties: ['the third-party API rate is unverified'] })
      }
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    expect(run.report.synthesis.error).toBeUndefined()
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).toContain('任务 a 已完成')
    expect(summary).toContain('待确认（来自报告）')
    expect(summary).toContain('the third-party API rate is unverified')
  })

  it('uses the deterministic fallback when the model path fails on every route', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'synthesizer') throw new Error('503 Service Unavailable')
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(run.report.synthesis.mode).toBe('model')
    expect(run.report.synthesis.error).toContain('every route')
    expect(run.report.synthesis.error).toContain('deterministic summary')
    const summary = run.report.synthesis.summary ?? ''
    expect(summary).toContain('总体状态：已完成')
    expect(summary).toContain('1/1 项任务已由独立检查核验')
  })

  it('writes the polish prompt in the run language and keeps en free of forced Chinese', async () => {
    const plan = [task('a')]
    const prompts: string[] = []
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleIn(options.label) === 'synthesizer') {
        prompts.push(prompt)
        return { summary: 'Task a is done and its evidence is verified.' }
      }
      if (roleIn(options.label) === 'worker') return execution('did the work')
      if (roleIn(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const config: Record<string, unknown> = { tasks: plan, roles: { synthesizer: [{ model: 'writer' }] } }
    const zhRun = await runWorkflowScript(WORKFLOW_SCRIPT, args({ ...config }), agent)
    const enRun = await runWorkflowScript(WORKFLOW_SCRIPT, args({ ...config, naming: { language: 'en' } }), agent)
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('润色稿')
    expect(prompts[0]).not.toContain('polished final narrative')
    expect(prompts[1]).toContain('polished final narrative')
    expect(prompts[1]).not.toContain('润色稿')
    expect(prompts[1]).not.toMatch(/[\u4e00-\u9fff]/)
    expect(zhRun.report.synthesis.summary).toContain('报告附注')
    const summary = enRun.report.synthesis.summary ?? ''
    expect(summary.startsWith('Task a is done and its evidence is verified.')).toBe(true)
    expect(summary).toContain('Report notes (facts from the report, not rewritten):')
    expect(summary).not.toMatch(/[\u4e00-\u9fff]/)
  })
})

describe('layered synthesis: configuration surface', () => {
  it('accepts the layered policy with and without a synthesizer chain', () => {
    expect(resolveConfig({ synthesis: 'layered' } as never).synthesis).toBe('layered')
    expect(
      resolveConfig({ synthesis: 'layered', roles: { synthesizer: [{ model: 'w' }] } } as never).synthesis,
    ).toBe('layered')
  })

  it('rejects an unknown synthesis value instead of silently defaulting', () => {
    expect(() => resolveConfig({ synthesis: 'fast' } as never)).toThrow(/synthesis must be/)
  })

  it('budgets the synthesizer call for layered runs only when a chain exists', () => {
    const withChain = resolveConfig({ synthesis: 'layered', roles: { synthesizer: [{ model: 'w' }] } } as never)
    const withoutChain = resolveConfig({ synthesis: 'layered' } as never)
    expect(routeBudgetFor(withChain).synthesizer).toBe(1)
    expect(routeBudgetFor(withoutChain).synthesizer).toBe(0)
    expect(maxTotalAgentsFor(2, 1, routeBudgetFor(withChain)))
      .toBe(maxTotalAgentsFor(2, 1, routeBudgetFor(withoutChain)) + 1)
    // The older policies keep their exact budgets.
    expect(routeBudgetFor(resolveConfig({} as never)).synthesizer).toBe(0)
    expect(
      routeBudgetFor(resolveConfig({ synthesis: 'model', roles: { synthesizer: [{ model: 'w' }] } } as never)).synthesizer,
    ).toBe(1)
  })

  it('pins the script-side guardrail bounds to HARD_LIMITS', () => {
    expect(HARD_LIMITS.synthesisSummaryChars).toBe(2_000)
    expect(HARD_LIMITS.synthesisDigestChars).toBe(6_000)
    expect(WORKFLOW_SCRIPT).toContain(`SYNTHESIS_SUMMARY_CHARS = ${HARD_LIMITS.synthesisSummaryChars};`)
    expect(WORKFLOW_SCRIPT).toContain(`SYNTHESIS_DIGEST_CHARS = ${HARD_LIMITS.synthesisDigestChars};`)
  })

  it('produces a layered report the host validation accepts', async () => {
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleIn(options.label) === 'worker') return execution('did the work')
      if (roleIn(options.label) === 'verifier') return verification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    // Ship the payload the request builder would actually produce, so the echoed
    // limits are exactly what the host sends and validates.
    const config = resolveConfig({
      maxConcurrency: 2,
      maxRetries: 1,
      maxTasks: 6,
      synthesis: 'layered',
    } as never)
    const request = buildWorkflowRequest(OBJECTIVE, plan, config)
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, { ...request.args }, agent)
    expect(routeBudgetFor(config).synthesizer).toBe(0)
    const validated = assertWorkflowReport(JSON.parse(JSON.stringify(run.report)), OBJECTIVE, config)
    expect(validated.status).toBe('completed')
    expect(validated.synthesis.mode).toBe('deterministic')
  })
})
