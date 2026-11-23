import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { inheritanceForSession } from '../src/carryover.js'
import { DEFAULT_MAX_CONCURRENCY, FIXED_MAX_RETRIES, HARD_LIMITS, resolveConfig } from '../src/config.js'
import { renderReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { execution, failingVerification, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

/**
 * Wave 4 acceptance: L1 inheritance and the DAG scheduler merged into one round.
 *
 * Wave 2 (L1) and Wave 3 (waves) are each covered on their own. What is verified
 * here is the seam between them, driven through the real generated script and the
 * real report → round → inheritance path the plugin uses at run time:
 *
 * - the verified wave is retained, only the unfinished waves plus the new intent
 *   are re-planned (A1 × A3/A4);
 * - a `blocked` downstream row comes back as `redrive`, not `retain` (A1 × A4);
 * - the documented concurrency/retry envelope is still 10/100 and 1/3 (A6).
 *
 * A2, A3, A4 and A5 are pinned by `test/waves.spec.ts` and the L1 rules by
 * `test/inheritance.spec.ts`; the acceptance ledger in
 * `docs/knowledge/evidence/wave4-acceptance-2026-11-22/ACCEPTANCE.md` names each
 * case and its locator, so this file adds the merge cases instead of restating them.
 */

const OBJECTIVE = 'Ship the two-wave plan'

function config(overrides: Record<string, unknown> = {}) {
  return resolveConfig({ maxConcurrency: 4, maxTasks: 6, ...overrides })
}

/** One planner-shaped task, as the planner model writes it. */
function planTask(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: [`${id} works`],
    context: '',
    constraints: [],
    ...extra,
  }
}

/**
 * A session holding the plugin-authored report messages, newest last — the same
 * shape `runWorkflow` reads through `inheritanceForSession`.
 * @param reports - rendered report texts, oldest first.
 */
function sessionWith(reports: readonly string[]) {
  return {
    id: 'sess-wave4',
    deriveMessages: () => reports.map(text => createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'grok-workflow' } as never,
    })),
  }
}

/**
 * An agent that answers the planner with `planned`, works every task, and fails
 * verification for the ids in `failIds`.
 * @param planned - value the planner call returns.
 * @param failIds - task ids whose verifier answers fail.
 */
function scripted(planned: unknown, failIds: readonly string[] = []): ScriptAgent {
  return async (prompt, options) => {
    const role = roleOf(options.label)
    if (role === 'planner') return planned
    const taskValue = taskFromPrompt(prompt)
    if (role === 'worker') return execution(`did ${taskValue.id}`)
    return failIds.includes(taskValue.id)
      ? failingVerification(taskValue as never, `${taskValue.id} did not pass`)
      : verification(taskValue as never)
  }
}

/** The task ids that were actually handed to a worker in one run. */
function workedIds(calls: readonly { prompt: string, label: string }[]): string[] {
  return calls.filter(call => roleOf(call.label) === 'worker').map(call => taskFromPrompt(call.prompt).id)
}

describe('Wave 4: a resumed round keeps the verified wave and re-plans only what is open', () => {
  it('retains wave 1, redrives the failed wave 2 and adds the new intent', async () => {
    // Round 1: two waves, a verifies, b does not.
    const planned = { waves: [[planTask('a')], [planTask('b', { dependsOn: ['a'] })]] }
    const first = await runWorkflowScript(WORKFLOW_SCRIPT, buildWorkflowRequest(OBJECTIVE, undefined, config()).args, scripted(planned, ['b']))
    expect(first.report.status).toBe('partial')
    expect(first.report.plan.waves).toHaveLength(2)
    expect(first.report.tasks.map(task => [task.id, task.status])).toEqual([
      ['a', 'verified'],
      ['b', 'failed'],
    ])

    // What the plugin hands the next round: the rendered report, parsed back.
    const inheritance = inheritanceForSession(sessionWith([renderReport(first.report)]) as never)
    expect(inheritance).toContain('retain (generation 1): a')
    expect(inheritance).toContain('redrive (generation 2): b')

    // Round 2: finish b, and add c on top of it. a must not be redone.
    const resumedPlan = { waves: [[planTask('b')], [planTask('c', { dependsOn: ['b'] })]] }
    const request = buildWorkflowRequest(
      'Ship the two-wave plan and add a codegen step',
      undefined,
      config(),
      undefined,
      undefined,
      undefined,
      inheritance,
    )
    const second = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, scripted(resumedPlan))

    const plannerPrompt = second.calls.find(call => roleOf(call.label) === 'planner')!.prompt
    expect(plannerPrompt).toContain('INHERITED WORK')
    expect(plannerPrompt).toContain('retain (generation 1): a')
    // The retained task is never handed to a worker again.
    expect(workedIds(second.calls)).toEqual(['b', 'c'])
    expect(second.report.tasks.map(task => task.id)).toEqual(['b', 'c'])
    expect(second.report.status).toBe('completed')
    expect(second.report.plan.waves).toHaveLength(2)
  })

  it('brings a blocked downstream task back as redrive, never as retain', async () => {
    // Round 1: a verifies, b fails, c is blocked by b and never runs.
    const planned = { waves: [[planTask('a')], [planTask('b', { dependsOn: ['a'] })], [planTask('c', { dependsOn: ['b'] })]] }
    const first = await runWorkflowScript(WORKFLOW_SCRIPT, buildWorkflowRequest(OBJECTIVE, undefined, config()).args, scripted(planned, ['b']))
    expect(first.report.tasks.map(task => [task.id, task.status])).toEqual([
      ['a', 'verified'],
      ['b', 'failed'],
      ['c', 'blocked'],
    ])
    expect(first.report.status).toBe('partial')

    const inheritance = inheritanceForSession(sessionWith([renderReport(first.report)]) as never)
    expect(inheritance).toContain('retain (generation 1): a')
    expect(inheritance).toContain('redrive (generation 2): b')
    // A blocked row is "did not run", so the next round drives it from the start.
    expect(inheritance).toContain('redrive (generation 2): c')
    expect(inheritance).toMatch(/redrive \(generation 2\): c — blocked in an earlier round/)
  })

  it('reads the retained conclusions as detail lines the new plan can build on', async () => {
    const planned = { waves: [[planTask('a')], [planTask('b', { dependsOn: ['a'] })]] }
    const first = await runWorkflowScript(WORKFLOW_SCRIPT, buildWorkflowRequest(OBJECTIVE, undefined, config()).args, scripted(planned, ['b']))
    const inheritance = inheritanceForSession(sessionWith([renderReport(first.report)]) as never)
    // `detail a: …` is the carried conclusion (Q2: decisions first, details while
    // the budget lasts) — the only part a new plan can quote as already-done work.
    expect(inheritance).toContain('detail a:')
  })

  it('records the known merge boundary: a dependency on a retained id is not resolvable yet', async () => {
    // Wave 4 finding, recorded rather than smoothed over: the new plan may not
    // point `dependsOn` at a retained task id, because retained work is absent
    // from the plan the wave validator sees. The plan is rejected (fail-closed)
    // and the run degrades to the fallback plan — the cost of the seam, not a
    // silent redo of wave 1. Un-pin this case when the merge learns to resolve
    // retained ids; see ACCEPTANCE.md, "known boundaries".
    const planned = { waves: [[planTask('a')], [planTask('b', { dependsOn: ['a'] })]] }
    const first = await runWorkflowScript(WORKFLOW_SCRIPT, buildWorkflowRequest(OBJECTIVE, undefined, config()).args, scripted(planned, ['b']))
    const inheritance = inheritanceForSession(sessionWith([renderReport(first.report)]) as never)

    const request = buildWorkflowRequest('Continue b', undefined, config(), undefined, undefined, undefined, inheritance)
    const second = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      request.args,
      scripted({ waves: [[planTask('d', { dependsOn: ['a'] })]] }),
    )
    expect(second.report.plan.source).toBe('fallback')
    expect(second.report.plan.error).toContain('depends on unknown task a')
  })
})

describe('A6: the documented concurrency and retry envelope has not been widened', () => {
  it('keeps default 10 / hard 100 concurrency and default 1 / hard 3 retries', () => {
    expect(DEFAULT_MAX_CONCURRENCY).toBe(10)
    expect(FIXED_MAX_RETRIES).toBe(1)
    expect(HARD_LIMITS.maxConcurrency).toBe(100)
    expect(HARD_LIMITS.maxRetries).toBe(3)
    const resolved = resolveConfig({})
    expect(resolved.maxConcurrency).toBe(10)
    expect(resolved.maxRetries).toBe(1)
  })

  it('refuses a stored concurrency above the ceiling instead of accepting it', () => {
    expect(() => resolveConfig({ maxConcurrency: HARD_LIMITS.maxConcurrency + 1 })).toThrow(/between 1 and 100/)
  })

  it('refuses a caller-supplied retry count: retries are not a configuration key at all', () => {
    // Fixed at 1 (`FIXED_MAX_RETRIES`), so there is no key to widen: the loader
    // rejects the name outright instead of silently ignoring a wider value.
    expect(() => resolveConfig({ maxRetries: 5 } as never)).toThrow(/removed configuration key "maxRetries"/)
  })

  it('clamps an over-limit script payload to 100 / 3 rather than trusting it', async () => {
    const request = buildWorkflowRequest('One small job', undefined, config())
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      { ...request.args, maxConcurrency: 500, maxRetries: 9 },
      scripted({ tasks: [planTask('a')] }),
    )
    expect(run.report.limits.maxConcurrency).toBe(100)
    expect(run.report.limits.maxRetries).toBe(3)
  })
})
