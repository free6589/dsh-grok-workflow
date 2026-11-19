import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport, failureSummary, renderReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import type { NormalizedTask } from '../src/types.js'
import { createEngineHarness } from './engine-harness.js'
import { execution, failingVerification, task, verification } from './fixtures.js'
import {runWorkflowScript, type ScriptAgent, roleOf, idOfPhase} from './helpers.js'

/**
 * G-4: infrastructure failures must not delete the report.
 *
 * Before this change a child failure raised `WorkflowError(AGENT_RESULT)` with
 * the engine's default `fatal: true`; the script noticed the flag and rethrew,
 * the throw escaped the task and the guest turned the whole run into
 * `stopReason: 'error'`, so *no* per-task report existed at all. A `try/catch`
 * inside the workflow script cannot prevent that on its own — the fatal flag is
 * host-controlled — which is why the fix lives in the plugin's fatal policy:
 * classified infrastructure/setup failures stop the route chain but are
 * returned, never rethrown, and every task carries a failure category into the
 * report so a reader can tell a dead provider from work that fell short.
 */

/**
 * Host config for these tests; every case uses one attempt per route.
 * @returns Resolved config used for both the request args and validation.
 */
function config(overrides: Record<string, unknown> = {}): ReturnType<typeof resolveConfig> {
  const base = { maxConcurrency: 1, maxTasks: 4 }
  const rolesOverride = overrides.roles as Record<string, unknown> | undefined
  if (rolesOverride === undefined) return resolveConfig(base)
  const resolved = resolveConfig(base)
  return resolveConfig({ ...base, roles: { ...resolved.roles, ...rolesOverride } })
}

/**
 * Build script args exactly as the plugin does, so the reported limits and the
 * agent budget always match the config the report is validated against.
 * @param overrides - role chains or caller tasks for one case.
 * @returns The `args` object the generated script consumes.
 */
function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const tasks = (overrides.tasks as NormalizedTask[] | undefined) ?? [task('a')]
  const request = buildWorkflowRequest('Ship the verified result', tasks, config(overrides))
  return { ...request.args, ...overrides }
}

/** Build a roles object, omitting empty chains (config rejects an explicit empty chain). */
const roles = (worker: unknown[], verifier: unknown[] = []) => ({ worker, verifier })

const cfg = config

/** The engine wraps every child failure as `WorkflowError(code: 'AGENT_RESULT')`. */
function agentResultError(message: string): Error {
  return Object.assign(new Error(`child agent run failed: ${message}`), { code: 'AGENT_RESULT', fatal: true })
}

describe('infrastructure failures still produce a report (G-4)', () => {
  it('reports a rate-limited chain as an infrastructure failure instead of aborting', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') throw agentResultError('429 Too Many Requests')
      return verification(task('a'))
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }, { model: 'w2' }]) }), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]?.attempts[0]?.failure).toEqual({
      class: 'rate-limit',
      reason: expect.stringContaining('429') as unknown as string,
      category: 'infrastructure',
    })
    expect(report.incomplete).toEqual([{
      taskId: 'a',
      reason: expect.stringContaining('rate-limit') as unknown as string,
      category: 'infrastructure',
    }])
    expect(report.errors[0]?.category).toBe('infrastructure')
  })

  it('reports a timeout as an infrastructure failure and keeps the report valid', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') throw agentResultError('request timed out after 600000ms')
      return verification(task('a'))
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }]) }), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]?.attempts[0]?.failure?.class).toBe('timeout')
    expect(report.tasks[0]?.attempts[0]?.failure?.category).toBe('infrastructure')
    const validated = assertWorkflowReport(report, 'Ship the verified result', cfg())
    expect(validated.status).toBe('failed')
    expect(validated.incomplete[0]?.category).toBe('infrastructure')
  })

  it('treats a crashed child as infrastructure even when its text cannot be classified', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      // No status code, no timeout wording: only the engine code identifies this.
      if (roleOf(options.label) === 'worker') throw agentResultError('workflow execution failed (abort): runtime disposed')
      return verification(task('a'))
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }]) }), agent)
    expect(report.status).toBe('failed')
    // The class stays honest ('unknown' — the text names no cause) while the
    // category is decided by the engine code, so it is still infrastructure.
    expect(report.tasks[0]?.attempts[0]?.failure).toEqual({
      class: 'unknown',
      reason: expect.stringContaining('runtime disposed') as unknown as string,
      category: 'infrastructure',
    })
    expect(report.incomplete[0]?.category).toBe('infrastructure')
  })

  it('keeps the other tasks and their evidence when one task hits infrastructure failure', async () => {
    const okTask = task('ok')
    const downTask = task('down')
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker' && idOfPhase(options.phase) === 'ok') return execution('ok')
      if (roleOf(options.label) === 'verifier' && idOfPhase(options.phase) === 'ok') return verification(okTask)
      if (roleOf(options.label) === 'worker' && idOfPhase(options.phase) === 'down') throw agentResultError('503 Service Unavailable')
      return verification(downTask)
    }
    const { report } = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: [okTask, downTask], roles: roles([{ model: 'w1' }]) }),
      agent,
    )
    expect(report.status).toBe('partial')
    expect(report.tasks.map(item => item.status)).toEqual(['verified', 'failed'])
    expect(report.confirmed.length).toBeGreaterThan(0)
    expect(report.incomplete).toEqual([{
      taskId: 'down',
      reason: expect.stringContaining('server-error') as unknown as string,
      category: 'infrastructure',
    }])
  })

  it('separates an infrastructure failure from a quality failure in the same report', async () => {
    const flakyTask = task('flaky')
    const weakTask = task('weak', ['weak works'])
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker' && idOfPhase(options.phase) === 'flaky') throw agentResultError('429 Too Many Requests')
      if (roleOf(options.label) === 'worker' && idOfPhase(options.phase) === 'weak') return execution('weak work')
      if (roleOf(options.label) === 'verifier' && idOfPhase(options.phase) === 'weak') return failingVerification(weakTask, 'no evidence for weak works')
      return verification(flakyTask)
    }
    const { report } = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: [flakyTask, weakTask], roles: roles([{ model: 'w1' }]) }),
      agent,
    )
    const byTask = Object.fromEntries(report.incomplete.map(item => [item.taskId, item.category]))
    expect(byTask).toEqual({ flaky: 'infrastructure', weak: 'quality' })
    // T4: maxRetries is fixed at 1, so each failed task retries once: 2
    // attempts per task, 2 failures per category.
    expect(failureSummary(report)).toEqual(expect.arrayContaining([
      { category: 'infrastructure', count: 2 },
      { category: 'quality', count: 2 },
    ]))
    const rendered = renderReport(report)
    expect(rendered).toContain('Failures: 2 infrastructure, 2 quality')
    expect(rendered).toContain('(infrastructure)')
    expect(rendered).toContain('(quality)')
  })

  it('does not count an attempt that a later retry recovered as a failure', async () => {
    // Round 26: a COMPLETED run used to print `Failures: 1 infrastructure` for an
    // attempt that the retry replaced. The retry stays visible as the attempt
    // count on the task row; the failure line names only what stayed broken.
    const only = task('flaky')
    let workerCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker' && idOfPhase(options.phase) === 'flaky') {
        workerCalls += 1
        if (workerCalls === 1) throw agentResultError('503 Service Unavailable')
        return execution('flaky works')
      }
      return verification(only)
    }
    const { report } = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: [only], roles: roles([{ model: 'w1' }]) }),
      agent,
    )
    expect(report.status).toBe('completed')
    expect(report.tasks.map(item => [item.status, item.attempts.length])).toEqual([['verified', 2]])
    expect(report.tasks[0]?.attempts[0]?.failure?.category).toBe('infrastructure')
    expect(failureSummary(report)).toEqual([])
    const rendered = renderReport(report)
    expect(rendered).not.toContain('Failures:')
    expect(rendered).toContain('- flaky: verified (2 attempts)')
  })

  it('still yields a structured failure report when every route is exhausted', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') throw agentResultError('ECONNRESET socket hang up')
      return verification(task('a'))
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }, { model: 'w2' }]) }), agent)
    // The old behaviour was a bare exception; now the run always returns a
    // report that states the status, the failed task and why it failed.
    expect(report.status).toBe('failed')
    expect(report.incomplete).toHaveLength(1)
    expect(report.errors.length).toBeGreaterThan(0)
    // T4: maxRetries is fixed at 1, so 2 attempts x 2 routes = 4 trail rows.
    expect(report.routes.filter(entry => entry.role === 'worker')).toHaveLength(4)
    const twoRoutes = config({ roles: roles([{ model: 'w1' }, { model: 'w2' }]) })
    expect(assertWorkflowReport(report, 'Ship the verified result', twoRoutes).status).toBe('failed')
  })

  it('contains a non-Error throw from a child as that task failure', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') throw 'boom' as unknown as Error
      return verification(task('a'))
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }]) }), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]?.attempts[0]?.failure?.category).toBe('unknown')
  })
})

describe('infrastructure failure through the real engine (G-4)', () => {
  const callerTask: NormalizedTask = {
    id: 'a',
    title: 'Task a',
    objective: 'Do a',
    expectedOutput: 'Output a',
    acceptanceCriteria: ['a works'],
    context: '',
    constraints: [],
    writesPaths: null,
  }

  function runArgs(): Record<string, unknown> {
    return buildWorkflowRequest('Ship the verified result', [callerTask], config()).args
  }

  it('returns a completed script result with a failed task instead of an error stop reason', async () => {
    const engine = createEngineHarness(() => ({ reject: new Error('429 Too Many Requests') }))
    try {
      const result = await engine.run(WORKFLOW_SCRIPT, { args: runArgs() })
      // The fatal flag on AGENT_RESULT used to escape the task and turn this
      // into stopReason 'error' with a null value: the report vanished.
      expect(result.stopReason).toBe('completed')
      const validated = assertWorkflowReport(result.value, 'Ship the verified result', cfg())
      expect(validated.status).toBe('failed')
      expect(validated.tasks[0]?.attempts[0]?.failure?.class).toBe('rate-limit')
      expect(validated.incomplete[0]?.category).toBe('infrastructure')
    } finally {
      await engine.dispose()
    }
  })
})

/**
 * The two task-level safety nets (t27/F1).
 *
 * They exist for bugs in the runner, so no black-box input reaches them; these
 * tests inject the bug by mutating the generated script text and then require
 * that the run still produces a validated failure report. Delete either catch
 * (or make the loop rethrow) and one of these fails — that is the point.
 */
describe('task-level safety nets', () => {
  const sabotage = (needle: string, replacement: string): string => {
    expect(WORKFLOW_SCRIPT).toContain(needle)
    return WORKFLOW_SCRIPT.replace(needle, replacement)
  }

  it('turns a crash inside the task runner into that task\'s failure row', async () => {
    const script = sabotage('  const attempts = [];', "  throw new Error('sabotage-in-runner');\n  const attempts = [];")
    const run = await runWorkflowScript(script, args(), async () => verification(task('a')))
    expect(run.report.status).toBe('failed')
    expect(run.report.incomplete).toHaveLength(1)
    expect(run.report.incomplete[0]?.reason).toContain('task aborted before any attempt')
    expect(run.report.incomplete[0]?.reason).toContain('sabotage-in-runner')
    // A bug in our own runner is not infrastructure and not quality: the class
    // stays "unknown" rather than guessing who is to blame (G-4).
    expect(run.report.incomplete[0]?.category).toBe('unknown')
    expect(() => assertWorkflowReport(run.report, 'Ship the verified result', config())).not.toThrow()
  })

  it('turns a crash in the task pool into one failed row per task', async () => {
    const script = sabotage(
      'results = await mapLimit(plan.tasks, maxConcurrency, runTask);',
      'results = await mapLimit(plan.tasks, maxConcurrency, function (t) { throw new Error(\'sabotage-in-pool\'); });',
    )
    const run = await runWorkflowScript(script, args(), async () => verification(task('a')))
    expect(run.report.status).toBe('failed')
    expect(run.report.tasks).toHaveLength(1)
    expect(run.report.tasks[0]?.error).toContain('task runner crashed')
    expect(run.report.tasks[0]?.error).toContain('sabotage-in-pool')
    expect(run.report.errors.length).toBeGreaterThan(0)
    expect(() => assertWorkflowReport(run.report, 'Ship the verified result', config())).not.toThrow()
  })

  it('does not rethrow an error merely because the engine marked it fatal', async () => {
    // Mutation guard: restoring `if (error?.fatal) throw error` in the call
    // classifier makes this run reject instead of reporting, which is G-4 all
    // over again. The engine sets `fatal` on every WorkflowError, so the flag
    // must not decide whether a report exists.
    const fatal = Object.assign(new Error('429 Too Many Requests'), { code: 'AGENT_RESULT', fatal: true })
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), async () => {
      throw fatal
    })
    expect(run.report.status).toBe('failed')
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('rate-limit')
  })
})

describe('same-attempt resubmit (A)', () => {
  const t = task('a')

  it('recovers a missing structured result without spending a retry', async () => {
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        // First call prose-answers: no structured value, like the child that
        // fetched everything but never called the submit tool.
        if (workerCalls === 1) return null
        // The resubmit must say why it exists and forbid redoing work.
        expect(prompt).toContain('produced no structured result')
        expect(prompt).toContain('Do NOT redo work')
        return execution('resubmitted')
      }
      return verification(t)
    }
    // maxRetries 0: without the resubmit this task could never recover.
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }]) }), agent)
    expect(report.status).toBe('completed')
    expect(report.tasks[0]?.status).toBe('verified')
    expect(report.tasks[0]?.attempts).toHaveLength(1)
    expect(report.tasks[0]?.attempts[0]?.passed).toBe(true)
    expect(report.tasks[0]?.attempts[0]?.resubmitted).toBe(true)
    expect(report.tasks[0]?.attempts[0]?.failure).toBeUndefined()
    expect(workerCalls).toBe(2)
    expect(() => assertWorkflowReport(report, 'Ship the verified result', cfg())).not.toThrow()
  })

  it('records the attempt as failed when the resubmit also yields nothing', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return null
      return verification(t)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }]) }), agent)
    expect(report.status).toBe('failed')
    // T4: maxRetries is fixed at 1 — the empty resubmit fails, then the retry
    // fails the same way: 2 attempts, neither marked resubmitted.
    expect(report.tasks[0]?.attempts).toHaveLength(2)
    expect(report.tasks[0]?.attempts[0]?.resubmitted).toBeUndefined()
    expect(report.tasks[0]?.attempts[0]?.failure?.class).toBe('format-error')
    expect(() => assertWorkflowReport(report, 'Ship the verified result', config())).not.toThrow()
  })

  it('does not resubmit transport failures or setup faults', async () => {
    let workerCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        throw agentResultError('503 Service Unavailable')
      }
      return verification(t)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }]) }), agent)
    expect(report.status).toBe('failed')
    // One call per route per attempt, no resubmit: a dead provider is not a
    // missing form. T4 fixed retry (maxRetries=1) retries the failed attempt
    // once, so 2 worker calls total.
    expect(workerCalls).toBe(2)
    expect(report.tasks[0]?.attempts[0]?.failure?.class).not.toBe('format-error')
  })
})
