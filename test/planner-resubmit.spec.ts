import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { REPLAN_LIMITS } from '../src/replan.js'
import { parseMemberLabel } from '../src/naming.js'
import { assertWorkflowReport } from '../src/report.js'
import { PLANNER_LEG_CALLS, buildWorkflowRequest, maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import { teamWorkflowEngine } from '../src/team-engine.js'
import type { NormalizedTask, WorkflowReport } from '../src/types.js'
import { createEngineHarness, type ChildAnswer, type ChildCall } from './engine-harness.js'
import { execution, task, verification } from './fixtures.js'
import { settledWithin, taskFromPrompt } from './helpers.js'

/**
 * The planning leg's rescue corridors.
 *
 * A planner call that comes back without a usable plan used to be the end of the
 * road: the run degraded to the fallback split, and a fallback plan can never
 * report the objective as completed (`src/report.ts` refuses it). Two things cost
 * the run that degradation for no reason — a child that answered without
 * submitting a structured result, and a route that died in transport before the
 * chain could reach the next one — so the leg now asks twice more: one same-call
 * resubmit for a form gap (the rule the worker and the verifier already follow),
 * and one route re-fire for a transport death. Neither is a retry, each is spent
 * at most once, and the fallback still lands when both are spent.
 *
 * These cases drive the *real* engine (the workflow engine, its script VM and the
 * plugin's own twin seam, `src/team-engine.ts`) and assert the shapes it really
 * produces: a child that ends without structured output, a child that dies of a
 * provider failure, and a child that hangs until the script's own budget settles
 * it. No model is called.
 */

const OBJECTIVE = 'Ship the verified result'

/** The probe's own bound on a run's settle (the child budget here is 1 s). */
const SETTLE_BUDGET_MS = 15_000

function config(overrides: Record<string, unknown> = {}): ReturnType<typeof resolveConfig> {
  return resolveConfig({ maxConcurrency: 1, maxTasks: 4, childTimeoutMs: 7_200_000, ...overrides })
}

/**
 * The role a child belongs to, read the way the panel reads it.
 *
 * The twin rewrites each activation's label from the prompt's first line, so the
 * role comes off that line — the raw label is the wrong string once the twin has
 * run (the same reading `test/dead-routes.spec.ts` uses).
 */
function roleOfCall(call: { prompt: string }): string {
  const head = call.prompt.split('\n')[0]!.trim().split('·')[0]!.trim()
  return parseMemberLabel(head, 'zh')?.role ?? ''
}

interface RealRun {
  report: WorkflowReport
  children: ChildCall[]
  events: string[]
  stopReason: string
}

/** Run the generated script over the real engine and the plugin's twin. */
async function runReal(
  answer: (call: ChildCall) => ChildAnswer,
  cfg: ReturnType<typeof resolveConfig>,
  options: { tasks?: NormalizedTask[] } = {},
): Promise<RealRun> {
  const harness = createEngineHarness(async call => answer(call))
  try {
    const payload = buildWorkflowRequest(OBJECTIVE, options.tasks, cfg)
    const engine = teamWorkflowEngine(harness.ctx as never, { warn() {} })
    const run = engine.start({
      script: payload.script,
      meta: { name: '任务团队', description: 'planner rescue run' },
      args: payload.args,
      parent: { session: { header: {}, id: 'planner-rescue-parent' } } as never,
      maxTotalAgents: payload.maxTotalAgents,
    })
    // Same rule as the dead-route twin: the probe owns the clock, so a budget
    // that lands late fails inside this helper instead of as a runner timeout.
    const result = await settledWithin(run.result, SETTLE_BUDGET_MS, 'the planner twin run')
    await run.dispose()
    return {
      report: assertWorkflowReport(result.value, OBJECTIVE, cfg),
      children: harness.children,
      events: harness.events,
      stopReason: result.stopReason,
    }
  } finally {
    await harness.dispose()
  }
}

function plannerCalls(children: ChildCall[]): ChildCall[] {
  return children.filter(call => roleOfCall(call) === 'planner')
}

describe('planner rescue: one same-call resubmit for a form gap', () => {
  it('recovers a plan that arrived with no structured result, without the fallback', async () => {
    let planned = 0
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        planned += 1
        // The real shape of a form gap: the child finished and only talked.
        if (planned === 1) return { output: [{ type: 'text' as const, text: 'Here is the plan I would write: ...' }], stopReason: 'completed' }
        return { structured: { tasks: [task('a')] } }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config())

    expect(run.stopReason).toBe('completed')
    expect(run.report.plan.source).toBe('planner')
    expect(run.report.status).toBe('completed')
    const calls = plannerCalls(run.children)
    expect(calls).toHaveLength(2)
    // The resubmit is the same planning call, not a new member: same prompt title,
    // same phase, same attempt — a reader sees one planner row.
    expect(calls[1]!.prompt.split('\n')[0]).toBe(calls[0]!.prompt.split('\n')[0])
    expect(calls[1]!.prompt).toContain('RESUBMISSION (same planning call, no retry spent)')
    expect(calls[1]!.prompt).toContain('no structured result')
    // The trail names both asks, so the report carries the recovery, not just the
    // outcome.
    expect(run.report.routes.filter(entry => entry.role === 'planner').map(entry => entry.outcome)).toEqual(['failed', 'ok'])
    expect(run.events.some(event => event.includes('planner resubmitted a valid plan in the same call'))).toBe(true)
  })

  it('names the shape gate in the resubmit when the plan the child wrote is unusable', async () => {
    let planned = 0
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        planned += 1
        // A plan the gate rejects: zero tasks is not a plan.
        if (planned === 1) return { structured: { tasks: [] } }
        return { structured: { tasks: [task('a')] } }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config())

    expect(run.report.plan.source).toBe('planner')
    const calls = plannerCalls(run.children)
    expect(calls).toHaveLength(2)
    // The rejection is the one thing the second child can act on.
    expect(calls[1]!.prompt).toContain('plan must declare 1-')
    // A shape rejection is not evidence about the route.
    expect(run.report.routes.filter(entry => entry.role === 'planner').every(entry => entry.failureClass === undefined)).toBe(true)
  })

  it('falls back once the resubmit is spent, and spends it only once', async () => {
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') return { output: [{ type: 'text' as const, text: 'no structured answer' }], stopReason: 'completed' }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config())

    expect(run.report.plan.source).toBe('fallback')
    expect(run.report.plan.error ?? '').toContain('planner')
    // Two asks, never three: corridor A is spent once, and a form gap carries no
    // transport death for corridor C to re-fire on.
    expect(plannerCalls(run.children)).toHaveLength(2)
  })
})

describe('planner rescue: one route re-fire for a transport death', () => {
  it('re-fires on a route this call has not paid when the planner hangs', async () => {
    // The child answers only after the script's own budget has already settled it
    // as a timeout: the hang is real (nothing arrives inside the budget) and the
    // child still ends, so no run is left holding a child that never settles.
    const late = new Promise<void>(resolve => { setTimeout(resolve, 2500) })
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        if (call.model === 'p1') return { gate: late }
        return { structured: { tasks: [task('a')] } }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ childTimeoutMs: 1000, roles: { planner: [{ model: 'p1' }, { model: 'p2' }] } }))

    expect(run.report.plan.source).toBe('planner')
    // The hung route is not re-waited: one hang is already a full child budget,
    // and the second route had never been asked at all (a hang does not switch
    // models, so the chain stopped there).
    expect(plannerCalls(run.children).map(call => call.model)).toEqual(['p1', 'p2'])
    expect(run.events.some(event => event.includes('re-firing the plan on a route this call has not paid'))).toBe(true)
    // A same-call resubmit is for form gaps only: this death was transport.
    expect(plannerCalls(run.children)[1]!.prompt).not.toContain('RESUBMISSION')
  })

  it('does not re-wait a hung route when the chain has nothing else to try', async () => {
    const late = new Promise<void>(resolve => { setTimeout(resolve, 2500) })
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') return { gate: late }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ childTimeoutMs: 1000 }))

    expect(run.report.plan.source).toBe('fallback')
    expect(run.report.plan.failure?.class).toBe('timeout')
    // One ask. A second wait on the same hung route costs the whole child budget
    // again and teaches the run nothing; that is what the fallback is for.
    expect(plannerCalls(run.children)).toHaveLength(1)
  })

  it('re-asks a route that refused, because a refusal costs one call and is often transient', async () => {
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        // The engine's shape for a provider death: the child's own session records
        // the cause, and the seam hands it to the script as a rejection.
        return { sessionFailure: { message: '503 Service Unavailable' }, stopReason: 'error' }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config())

    expect(run.report.plan.source).toBe('fallback')
    // 5xx advances the role chain but the chain is one route, so the re-fire is the
    // repeat: exactly one, never a loop.
    expect(plannerCalls(run.children)).toHaveLength(2)
    expect(run.report.plan.failure?.class).toBe('server-error')
    expect(run.events.some(event => event.includes('re-firing the plan once on the same route'))).toBe(true)
  })

  it('keeps a 429 on its route when the switch says so, and does not re-fire it', async () => {
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') return { sessionFailure: { message: '429 Too Many Requests', status: 429 }, stopReason: 'error' }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ switchOnRateLimit: false }))

    // The operator's switch says a rate limit is not a dead route: the leg falls
    // back instead of spending a second call on the same 429.
    expect(plannerCalls(run.children)).toHaveLength(1)
    expect(run.report.plan.source).toBe('fallback')
  })
})

describe('planner rescue: the child cap pays for the rescue', () => {
  it('counts three planning walks, because the rescue calls are real children', () => {
    const budget = routeBudgetFor(resolveConfig({ roles: { planner: [{ model: 'p1' }, { model: 'p2' }] } }))
    const tasks = 3
    const retries = 1
    expect(PLANNER_LEG_CALLS).toBe(3)
    // planner 2 routes * 3 walks (ask, form resubmit, route re-fire)
    //   + 3 tasks * 2 attempts * the per-attempt block, which the merged cap
    //     counts as the honest walks (2 * worker + 3 * (verifier + supervisor))
    //   + 2 slack
    const block = 2 * budget.worker + 3 * (budget.verifier + budget.supervisor)
    expect(maxTotalAgentsFor(tasks, retries, budget))
      .toBe(PLANNER_LEG_CALLS * budget.planner + tasks * (retries + 1) * block + 2)
  })

  it('pays two boundary calls for every replan, because a boundary can ask twice', () => {
    const budget = routeBudgetFor(resolveConfig({ roles: { planner: [{ model: 'p1' }] } }))
    const replans = REPLAN_LIMITS.maxBoundaries
    const without = maxTotalAgentsFor(2, 0, budget)
    const withReplans = maxTotalAgentsFor(2, 0, budget, replans)
    // The boundary term is two walks per boundary: the first ask plus the
    // same-boundary resubmit a form gap costs. Both are real children, so a cap that
    // paid one walk would kill the run with AGENT_CAP exactly when it recovered.
    expect(withReplans - without).toBe(replans * 2 * budget.planner)
  })

  it('keeps a recovered leg inside the walks the cap pays for', async () => {
    const hang = new Promise<never>(() => {})
    const cfg = config({ childTimeoutMs: 1000, roles: { planner: [{ model: 'p1' }, { model: 'p2' }] } })
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        if (call.model === 'p1') return { gate: hang }
        return { structured: { tasks: [task('a')] } }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, cfg)

    expect(run.report.plan.source).toBe('planner')
    // The run above was started with the cap this formula produces, so a rescue the
    // cap did not pay for would have ended as budget-exhausted instead of a plan.
    expect(run.report.plan.failure).toBeUndefined()
    expect(run.report.status).toBe('completed')
    expect(plannerCalls(run.children).length).toBeLessThanOrEqual(PLANNER_LEG_CALLS * routeBudgetFor(cfg).planner)
  })
})
