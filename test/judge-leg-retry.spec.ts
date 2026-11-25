import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, maxTotalAgentsFor, PLANNER_LEG_CALLS, routeBudgetFor, WORKFLOW_SCRIPT } from '../src/script.js'
import type { NormalizedTask } from '../src/types.js'
import { execution, failingVerification, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, type ScriptAgent } from './helpers.js'

/**
 * Same-attempt re-fire for a judging leg that DIED of a transport failure.
 *
 * The worker's execution result is the work that was done. When the verifier or
 * the supervisor produced no judgement because its route timed out, dropped the
 * connection, answered 5xx, or answered 429 while the operator's switch keeps it
 * on its route, spending the retry re-runs the expensive leg for a judgement
 * nobody ever made — the whole attempt, worker included, over a dead wire.
 *
 * These cases pin the second cut: one more call to that same judge inside the
 * SAME attempt, the worker's result kept as it stands, and the two existing
 * same-attempt corridors (format resubmit: `verifier-resubmit.spec.ts`) neither
 * widened nor replaced. A judge's own negative verdict is not this case — it is
 * its answer, and re-asking cannot change it.
 *
 * A refused key (`model-unavailable`) is the same shape of death and takes the
 * same cut (D-164): the judgement never happened, the route keeps its place, and
 * the gateway may serve the next request.
 */

/** The classifier's reading of a 5xx coming back from a provider. */
function transportDeath(message = '503 Service Unavailable'): Error {
  return Object.assign(new Error(message), { code: 'AGENT_RESULT', fatal: true })
}

/** Host config for these cases; one attempt unless a case overrides retries. */
function config(overrides: Record<string, unknown> = {}): ReturnType<typeof resolveConfig> {
  const base = { maxConcurrency: 1, maxTasks: 4 }
  const resolved = resolveConfig(base)
  const rolesOverride = overrides.roles as Record<string, unknown> | undefined
  if (rolesOverride === undefined) return resolved
  return resolveConfig({ ...base, roles: { ...resolved.roles, ...rolesOverride } })
}

/** Build script args exactly as the plugin does for one case. */
function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const tasks = (overrides.tasks as NormalizedTask[] | undefined) ?? [task('a')]
  const request = buildWorkflowRequest('Ship the verified result', tasks, config(overrides))
  return { ...request.args, ...overrides }
}

describe('verifier leg: a transport death re-fires the judge, not the worker', () => {
  it('re-fires once inside the same attempt and keeps the execution result', async () => {
    const t = task('a')
    let workerCalls = 0
    let verifierCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        return execution('did the work')
      }
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        // First call: the route died on the way back, so no judgement was made.
        if (verifierCalls === 1) throw transportDeath('503 service unavailable')
        // The re-fire must say so, and must judge the unchanged result once.
        expect(prompt).toContain('produced NO result')
        expect(prompt).toContain('unchanged')
        expect(prompt).toContain('exactly once')
        expect(prompt).toContain('re-fired: same attempt')
        return verification(t)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.status).toBe('verified')
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(run.report.tasks[0]?.attempts[0]?.passed).toBe(true)
    expect(run.report.tasks[0]?.attempts[0]?.failure).toBeUndefined()
    expect(run.report.tasks[0]?.attempts[0]?.judgeRetried).toBe(true)
    // The whole point of this cut: the expensive leg is not paid a second time.
    expect(workerCalls).toBe(1)
    expect(verifierCalls).toBe(2)
    expect(run.events).toContain('log:task a attempt 1 verifier re-fired after a transport death')
    expect(() => assertWorkflowReport(run.report, 'Ship the verified result', config())).not.toThrow()
    // The host whitelist has to carry the marker, or the field dies in delivery.
    const validated = assertWorkflowReport(run.report, 'Ship the verified result', config())
    expect(validated.tasks[0]?.attempts[0]?.judgeRetried).toBe(true)
  })

  it('treats the child-budget death (timeout family) as the same transport failure', async () => {
    const t = task('a')
    let workerCalls = 0
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        return execution('did the work')
      }
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        // The exact shape the script's isChildTimeout() recognises: the prefix
        // its own race rejects with when a child runs past its budget.
        if (verifierCalls === 1) throw new Error('CHILD_TIMEOUT: 7200000 ms')
        return verification(t)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(run.report.tasks[0]?.attempts[0]?.judgeRetried).toBe(true)
    expect(workerCalls).toBe(1)
    expect(verifierCalls).toBe(2)
    expect(run.events).toContain('log:task a attempt 1 verifier re-fired after a transport death')
  })

  it('re-fires a judge whose route refused the key, and never marks that route dead', async () => {
    const t = task('a')
    let workerCalls = 0
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        return execution('did the work')
      }
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        // A refused key is no judgement at all: the gateway would not serve the
        // call, so the judge is asked once more instead of the worker re-running.
        if (verifierCalls === 1) throw new Error('401 invalid api key for this route')
        return verification(t)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(run.report.tasks[0]?.attempts[0]?.judgeRetried).toBe(true)
    expect(workerCalls).toBe(1)
    expect(verifierCalls).toBe(2)
    expect(run.events).toContain('log:task a attempt 1 verifier re-fired after a refusal')
    // D-164: a refusal is never route evidence — the route keeps its place.
    expect(run.report.deadRoutes).toBeUndefined()
  })

  it('records the transport failure when the re-fire dies again, and the retry policy runs', async () => {
    let verifierCalls = 0
    let workerCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        return execution('did the work')
      }
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        throw transportDeath('503 service unavailable')
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('failed')
    // One re-fire per leg per attempt, then the fixed retry policy: 2 attempts.
    expect(run.report.tasks[0]?.attempts).toHaveLength(2)
    for (const attempt of run.report.tasks[0]?.attempts ?? []) {
      expect(attempt.failure?.class).toBe('server-error')
      expect(attempt.judgeRetried).toBe(true)
    }
    // First call + re-fire, twice: two attempts x two calls.
    expect(verifierCalls).toBe(4)
    expect(workerCalls).toBe(2)
    expect(() => assertWorkflowReport(run.report, 'Ship the verified result', config())).not.toThrow()
  })
})

describe('supervisor leg: a transport death re-fires the judge, not the worker', () => {
  it('re-fires the supervision call once and still verifies the task', async () => {
    const t = task('a')
    let workerCalls = 0
    let supervisorCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        return execution('did the work')
      }
      if (roleOf(options.label) === 'verifier') return verification(t)
      if (roleOf(options.label) === 'supervisor') {
        supervisorCalls += 1
        if (supervisorCalls === 1) throw transportDeath('502 Bad Gateway')
        expect(prompt).toContain('previous supervision call')
        expect(prompt).toContain('re-fired: same attempt')
        return verification(t)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ roles: { verifier: [{ model: 'v1' }], supervisor: [{ model: 's1' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.status).toBe('verified')
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(run.report.tasks[0]?.attempts[0]?.judgeRetried).toBe(true)
    expect(workerCalls).toBe(1)
    expect(supervisorCalls).toBe(2)
    expect(run.events).toContain('log:task a attempt 1 supervisor re-fired after a transport death')
    expect(() => assertWorkflowReport(run.report, 'Ship the verified result', config())).not.toThrow()
  })
})

describe('the corridors that must NOT re-fire a judge leg', () => {
  it('does not re-fire a judge that answered with a failing verdict', async () => {
    const t = task('a')
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        // A negative verdict is the judge's own answer, not a lost call.
        return failingVerification(t)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('failed')
    expect(run.report.tasks[0]?.attempts).toHaveLength(2)
    for (const attempt of run.report.tasks[0]?.attempts ?? []) {
      expect(attempt.failure?.class).toBe('verification-failed')
      expect(attempt.judgeRetried).toBeUndefined()
    }
    // One judgement per attempt: re-asking the same judge cannot change it.
    expect(verifierCalls).toBe(2)
  })

  it('leaves a format death to corridor B: two calls per attempt, no re-fire', async () => {
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        // The unparsable structured result corridor B already owns. It declares
        // no route evidence, so this cut must not add a third walk.
        return null
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('failed')
    expect(run.report.tasks[0]?.attempts).toHaveLength(2)
    for (const attempt of run.report.tasks[0]?.attempts ?? []) {
      expect(attempt.failure?.class).toBe('format-error')
      expect(attempt.judgeRetried).toBeUndefined()
    }
    // First call + corridor B, twice: two attempts x two calls.
    expect(verifierCalls).toBe(4)
    expect(run.events).not.toContain('log:task a attempt 1 verifier re-fired after a transport death')
  })

  it('does not re-fire a setup fault, which repeats by definition', async () => {
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        // The engine code the script classifies as AGENT_CAP (budget-exhausted).
        throw Object.assign(new Error('agent cap reached'), { code: 'AGENT_CAP', fatal: true })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('failed')
    // The attempt stops where today's code stops it: one attempt, no re-fire.
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('budget-exhausted')
    expect(run.report.tasks[0]?.attempts[0]?.judgeRetried).toBeUndefined()
    expect(verifierCalls).toBe(1)
  })
})

describe('the child cap pays for the third walk of a judge leg', () => {
  it('sizes the per-attempt block as 2 * worker + 3 * (verifier + supervisor)', () => {
    const plain = config()
    const plainBudget = routeBudgetFor(plain)
    expect(plainBudget.worker).toBe(1)
    expect(plainBudget.verifier).toBe(1)
    expect(plainBudget.supervisor).toBe(0)
    expect(plainBudget.guardian === true).toBe(false)
    // worker = first call + form resubmit (2); each judge leg = first call +
    // transport re-fire + form resubmit (3).
    const plainBlock = 2 * plainBudget.worker + 3 * (plainBudget.verifier + plainBudget.supervisor)
    expect(plainBlock).toBe(5)
    // The merged cap also counts the planning leg at its worst case — three
    // walks per planner route (first ask, same-call form resubmit, route re-fire)
    // — because those rescue calls are real children too.
    // planner leg + synthesizer + 1 task * 2 attempts * block + 2
    expect(maxTotalAgentsFor(1, 1, plainBudget))
      .toBe(PLANNER_LEG_CALLS * plainBudget.planner + plainBudget.synthesizer + 2 * plainBlock + 2)

    const routedBudget = routeBudgetFor(config({ roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }))
    expect(routedBudget.worker).toBe(2)
    const routedBlock = 2 * routedBudget.worker + 3 * (routedBudget.verifier + routedBudget.supervisor)
    expect(routedBlock).toBe(7)
    expect(maxTotalAgentsFor(1, 1, routedBudget))
      .toBe(PLANNER_LEG_CALLS * routedBudget.planner + routedBudget.synthesizer + 2 * routedBlock + 2)
    // The pre-re-fire block (2 * everyone) under-sized a judge leg by one call;
    // that missing walk is exactly the re-fire this feature adds.
    expect(maxTotalAgentsFor(1, 1, routedBudget) - maxTotalAgentsFor(1, 1, plainBudget)).toBe(4)
  })
})
