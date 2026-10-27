import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport, failureReport, renderReport } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'

const config = resolveConfig({ maxConcurrency: 2, maxRetries: 1, maxTasks: 6 })
const OBJECTIVE = 'Ship the verified result'

interface ReportTask {
  id: string
  criteria: string[]
  status?: 'verified' | 'failed'
  passed?: boolean
  evidence?: string
  verification?: Record<string, unknown> | null
  execution?: Record<string, unknown> | null
}

function executionResult(): Record<string, unknown> {
  return {
    summary: 'done',
    status: 'completed',
    deliverables: [{ description: 'file', locator: 'file:///tmp/out' }],
    evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
    testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    filesChanged: ['src/index.ts'],
    uncertainties: [],
  }
}

function verificationResult(criteria: string[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verdict: 'pass',
    criteria: criteria.map(criterion => ({ criterion, met: true, evidence: `verified ${criterion}` })),
    checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/out', finding: 'observed' }],
    commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    issues: [],
    confidence: 'high',
    ...overrides,
  }
}

function taskReport(spec: ReportTask): Record<string, unknown> {
  const passed = spec.passed ?? spec.status !== 'failed'
  return {
    id: spec.id,
    title: `Task ${spec.id}`,
    objective: `Do ${spec.id}`,
    expectedOutput: `Output ${spec.id}`,
    acceptanceCriteria: spec.criteria,
    context: '',
    constraints: [],
    status: spec.status ?? 'verified',
    attempts: [{
      attempt: 1,
      execution: spec.execution === undefined ? executionResult() : spec.execution,
      verification: spec.verification === undefined ? verificationResult(spec.criteria) : spec.verification,
      passed,
      error: passed ? '' : 'verification failed',
    }],
    error: passed ? '' : 'verification failed',
  }
}

function planTask(task: Record<string, unknown>): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    objective: task.objective,
    expectedOutput: task.expectedOutput,
    acceptanceCriteria: task.acceptanceCriteria,
    context: task.context,
    constraints: task.constraints,
  }
}

interface ReportSpec {
  tasks?: ReportTask[]
  status?: string
  planSource?: string
  planError?: string
  confirmed?: unknown[]
  incomplete?: unknown[]
  errors?: unknown[]
  maxTotalAgents?: number
  objective?: string
  /** t47: which chains the script reported it was given. */
  routing?: Record<string, string[]>
  /** t47: the deadline the run says it ran under (omitted = legacy result). */
  timeoutMs?: number
  /** t47: the child-call trail, so a switch can be rendered from a fixture. */
  routes?: unknown[]
}

function report(spec: ReportSpec = {}): Record<string, unknown> {
  const tasks = (spec.tasks ?? [{ id: 'a', criteria: ['a works'] }]).map(taskReport)
  const confirmed = spec.confirmed ?? tasks
    .filter(task => task.status === 'verified')
    .flatMap(task => (task.acceptanceCriteria as string[]).map(criterion => ({
      taskId: task.id,
      criterion,
      evidence: `verified ${criterion}`,
    })))
  const incomplete = spec.incomplete ?? tasks
    .filter(task => task.status === 'failed')
    .map(task => ({ taskId: task.id, reason: 'verification failed' }))
  return {
    schemaVersion: 'grok-workflow/v1',
    status: spec.status ?? 'completed',
    objective: spec.objective ?? OBJECTIVE,
    plan: {
      source: spec.planSource ?? 'caller',
      tasks: tasks.map(planTask),
      error: spec.planError ?? '',
    },
    tasks,
    confirmed,
    incomplete,
    errors: spec.errors ?? [],
    uncertainties: [],
    ...spec.routing === undefined ? {} : { routing: spec.routing },
    ...spec.routes === undefined ? {} : { routes: spec.routes },
    limits: {
      maxConcurrency: 2,
      maxRetries: 1,
      maxTasks: 6,
      maxTotalAgents: spec.maxTotalAgents ?? maxTotalAgentsFor(tasks.length, 1),
      ...spec.timeoutMs === undefined ? {} : { timeoutMs: spec.timeoutMs },
    },
  }
}

describe('workflow report semantic contract', () => {
  it('accepts the canonical report', () => {
    expect(assertWorkflowReport(report(), OBJECTIVE, config).status).toBe('completed')
  })

  it('rejects a verified task with no acceptance criteria', () => {
    expect(() => assertWorkflowReport(report({ tasks: [{ id: 'a', criteria: [] }] }), OBJECTIVE, config))
      .toThrow(/has no acceptance criteria/)
  })

  it('rejects an attempt payload outside the closed execution union', () => {
    const bad = report()
    ;(bad.tasks as Record<string, unknown>[])[0]!.attempts = [{
      attempt: 1,
      execution: { ...executionResult(), status: 'done' },
      verification: verificationResult(['a works']),
      passed: true,
      error: '',
    }]
    expect(() => assertWorkflowReport(bad, OBJECTIVE, config))
      .toThrow(/attempts\[0\]\.execution\.status must be one of completed\/partial\/failed/)
  })

  it('rejects a verification verdict outside the closed union', () => {
    const bad = report()
    ;(bad.tasks as Record<string, unknown>[])[0]!.attempts = [{
      attempt: 1,
      execution: executionResult(),
      verification: verificationResult(['a works'], { verdict: 'maybe' }),
      passed: true,
      error: '',
    }]
    expect(() => assertWorkflowReport(bad, OBJECTIVE, config))
      .toThrow(/attempts\[0\]\.verification\.verdict must be one of pass\/fail/)
  })

  it('rejects unknown confidence and command statuses', () => {
    const badConfidence = report()
    ;(badConfidence.tasks as Record<string, unknown>[])[0]!.attempts = [{
      attempt: 1,
      execution: executionResult(),
      verification: verificationResult(['a works'], { confidence: 'certain' }),
      passed: true,
      error: '',
    }]
    expect(() => assertWorkflowReport(badConfidence, OBJECTIVE, config)).toThrow(/confidence must be one of high\/medium\/low/)

    const badCommand = report()
    ;(badCommand.tasks as Record<string, unknown>[])[0]!.attempts = [{
      attempt: 1,
      execution: { ...executionResult(), testsRun: [{ command: 'npm test', status: 'skipped', detail: '' }] },
      verification: verificationResult(['a works']),
      passed: true,
      error: '',
    }]
    expect(() => assertWorkflowReport(badCommand, OBJECTIVE, config))
      .toThrow(/testsRun\[0\]\.status must be one of passed\/failed\/not_run/)
  })

  it('accepts the script normalization fallbacks for every closed union', () => {
    const value = report()
    ;(value.tasks as Record<string, unknown>[])[0]!.attempts = [{
      attempt: 1,
      execution: {
        ...executionResult(),
        status: 'partial',
        testsRun: [{ command: 'npm test', status: 'not_run', detail: '' }],
      },
      verification: verificationResult(['a works'], {
        confidence: 'low',
        commandsRun: [{ command: 'npm test', status: 'not_run', detail: '' }],
      }),
      passed: true,
      error: '',
    }]
    expect(assertWorkflowReport(value, OBJECTIVE, config).status).toBe('completed')
  })

  it('rejects confirmed evidence no verifier produced', () => {
    const fabricated = report({
      confirmed: [{ taskId: 'a', criterion: 'a works', evidence: 'TRUST_ME_NOTHING_WAS_CHECKED' }],
    })
    expect(() => assertWorkflowReport(fabricated, OBJECTIVE, config))
      .toThrow(/is not supported by that task's last attempt verification/)
  })

  it('rejects confirmed evidence whose criterion was never marked met', () => {
    const unmet = report()
    ;(unmet.tasks as Record<string, unknown>[])[0]!.attempts = [{
      attempt: 1,
      execution: executionResult(),
      verification: verificationResult(['a works'], {
        criteria: [{ criterion: 'a works', met: false, evidence: 'verified a works' }],
      }),
      passed: true,
      error: '',
    }]
    expect(() => assertWorkflowReport(unmet, OBJECTIVE, config))
      .toThrow(/is not supported by that task's last attempt verification/)
  })

  it('rejects confirmed evidence for an unknown task', () => {
    const orphan = report({
      status: 'partial',
      tasks: [{ id: 'a', criteria: ['a works'] }, { id: 'b', criteria: ['b works'], status: 'failed' }],
      confirmed: [
        { taskId: 'a', criterion: 'a works', evidence: 'verified a works' },
        { taskId: 'ghost', criterion: 'a works', evidence: 'verified a works' },
      ],
    })
    expect(() => assertWorkflowReport(orphan, OBJECTIVE, config)).toThrow(/references unknown task ghost/)
  })

  it('matches confirmed evidence against a formatting-different verifier criterion', () => {
    // The verifier may copy a criterion with different spacing/case/punctuation;
    // the report keeps the task's own text, so the cross-check must normalize.
    const value = report()
    ;(value.tasks as Record<string, unknown>[])[0]!.attempts = [{
      attempt: 1,
      execution: executionResult(),
      verification: verificationResult(['  A Works.  '], {
        criteria: [{ criterion: '  A Works.  ', met: true, evidence: 'verified a works' }],
      }),
      passed: true,
      error: '',
    }]
    expect(assertWorkflowReport(value, OBJECTIVE, config).confirmed).toEqual([
      { taskId: 'a', criterion: 'a works', evidence: 'verified a works' },
    ])
  })

  it('rejects more tasks than maxTasks', () => {
    const tasks = Array.from({ length: 7 }, (_, index) => ({ id: `t${index}`, criteria: [`t${index} works`] }))
    expect(() => assertWorkflowReport(report({ tasks }), OBJECTIVE, config)).toThrow(/has 7 tasks but maxTasks is 6/)
  })

  it('rejects duplicate task ids', () => {
    const duplicated = report()
    const tasks = duplicated.tasks as Record<string, unknown>[]
    const planTasks = (duplicated.plan as { tasks: Record<string, unknown>[] }).tasks
    tasks.push({ ...tasks[0]! })
    planTasks.push({ ...planTasks[0]! })
    ;(duplicated.confirmed as unknown[]).splice(1, 1)
    ;(duplicated.limits as { maxTotalAgents: number }).maxTotalAgents = maxTotalAgentsFor(2, 1)
    expect(() => assertWorkflowReport(duplicated, OBJECTIVE, config)).toThrow(/duplicate task id "a"/)
  })

  it('rejects limits.maxTotalAgents outside the request builder window', () => {
    expect(() => assertWorkflowReport(report({ maxTotalAgents: 0 }), OBJECTIVE, config))
      .toThrow(/outside the allowed range/)
    expect(() => assertWorkflowReport(report({ maxTotalAgents: 99 }), OBJECTIVE, config))
      .toThrow(/outside the allowed range/)
    const atMinimum = report({ maxTotalAgents: maxTotalAgentsFor(1, 1) })
    const atMaximum = report({ maxTotalAgents: maxTotalAgentsFor(6, 1) })
    expect(assertWorkflowReport(atMinimum, OBJECTIVE, config).limits.maxTotalAgents).toBe(maxTotalAgentsFor(1, 1))
    expect(assertWorkflowReport(atMaximum, OBJECTIVE, config).limits.maxTotalAgents).toBe(maxTotalAgentsFor(6, 1))
  })

  it('rejects a partial report that does not account for its failed task', () => {
    const missing = report({
      status: 'partial',
      tasks: [{ id: 'a', criteria: ['a works'] }, { id: 'b', criteria: ['b works'], status: 'failed' }],
      incomplete: [],
    })
    expect(() => assertWorkflowReport(missing, OBJECTIVE, config))
      .toThrow(/task b failed but is not reported exactly once in incomplete/)
  })

  it('rejects a partial report whose failure reason is blank', () => {
    const blank = report({
      status: 'partial',
      tasks: [{ id: 'a', criteria: ['a works'] }, { id: 'b', criteria: ['b works'], status: 'failed' }],
      incomplete: [{ taskId: 'b', reason: '   ' }],
    })
    expect(() => assertWorkflowReport(blank, OBJECTIVE, config))
      .toThrow(/not reported exactly once in incomplete with a non-empty reason/)
  })

  it('rejects a partial report that lists the same failed task twice', () => {
    const twice = report({
      status: 'partial',
      tasks: [{ id: 'a', criteria: ['a works'] }, { id: 'b', criteria: ['b works'], status: 'failed' }],
      incomplete: [{ taskId: 'b', reason: 'first' }, { taskId: 'b', reason: 'second' }],
    })
    expect(() => assertWorkflowReport(twice, OBJECTIVE, config))
      .toThrow(/not reported exactly once in incomplete/)
  })

  it('still accepts a verified fallback plan as partial with no failed task', () => {
    // A degraded fallback plan whose single task verified is a legitimate
    // partial: its provenance is plan.error, not an incomplete entry.
    const fallback = report({
      status: 'partial',
      planSource: 'fallback',
      planError: 'planner failed: unavailable',
      incomplete: [],
      errors: [{ phase: 'Plan', message: 'planner failed: unavailable' }],
    })
    const validated = assertWorkflowReport(fallback, OBJECTIVE, config)
    expect(validated.status).toBe('partial')
    expect(validated.incomplete).toEqual([])
  })
})

/* ------------------------------------------------------------------ t47 -- */
/**
 * The t46 acceptance round left two report observations unfixed: `Model routes:`
 * appeared only for some runs (so "no chain configured" and "the line is missing"
 * looked identical), and the deadline the run actually ran under never left the
 * process (`timeoutMs` was not in the report at all). Both are contract now.
 */
describe('t47: the report states its routes and its deadline', () => {
  it('prints Model routes with "inherit" when no chain was configured', () => {
    const text = renderReport(assertWorkflowReport(report(), OBJECTIVE, config))
    expect(text).toContain('Model routes: planner=inherit; worker=inherit; verifier=inherit; synthesizer=inherit')
  })

  it('prints the configured chains, in chain order, when they exist', () => {
    const text = renderReport(assertWorkflowReport(report({
      routing: {
        planner: ['bifrost-completions/wb/cn:no-such-model-probe', 'bifrost-completions/wb/cn:deepseek-v4.1-flash'],
        worker: ['bifrost-completions/wb/cn:deepseek-v4.1-flash'],
        verifier: [],
        synthesizer: [],
      },
    }), OBJECTIVE, config))
    expect(text).toContain('planner=bifrost-completions/wb/cn:no-such-model-probe → bifrost-completions/wb/cn:deepseek-v4.1-flash')
    expect(text).toContain('worker=bifrost-completions/wb/cn:deepseek-v4.1-flash')
    expect(text).toContain('verifier=inherit')
  })

  it('carries the deadline the run actually ran under', () => {
    const accepted = assertWorkflowReport(report({ timeoutMs: config.timeoutMs }), OBJECTIVE, config)
    expect(accepted.limits.timeoutMs).toBe(config.timeoutMs)
    expect(renderReport(accepted)).toContain(`Deadline: ${config.timeoutMs} ms per run`)
  })

  it('rejects a result that ran under a different deadline than the plugin enforces', () => {
    expect(() => assertWorkflowReport(report({ timeoutMs: config.timeoutMs + 1_000 }), OBJECTIVE, config))
      .toThrow(/deadline/)
  })

  it('names the configured chains in a failure report too, instead of all-empty', () => {
    const configured = resolveConfig({ roles: { worker: [{ provider: 'bifrost-completions', model: 'wb/cn:deepseek-v4.1-flash' }] } })
    const text = renderReport(failureReport(OBJECTIVE, configured, 'Timeout', 'the deadline fired'))
    // A timeout report is still a report about this configuration: printing the
    // all-empty default made "no chain" and "chain unknown here" look the same (t46).
    expect(text).toContain('worker=bifrost-completions/wb/cn:deepseek-v4.1-flash')
    expect(text).toContain('planner=inherit')
    expect(text).toContain(`Deadline: ${configured.timeoutMs} ms per run`)
  })

  it('accepts a legacy result that does not mention a deadline', () => {
    const accepted = assertWorkflowReport(report(), OBJECTIVE, config)
    expect(accepted.limits.timeoutMs).toBeUndefined()
    expect(renderReport(accepted)).not.toContain('Deadline:')
  })
})

describe('t47: a route switch is visible in the report', () => {
  // t46 wrote a deliberately broken first worker route and saw no `Route switches:`
  // line. The reason is not the renderer: a model the provider does not enumerate
  // is rejected at load (`validateRoutes`), so that configuration never ran. The
  // line itself had no test until now, which is why nobody could tell.
  it('renders the failed attempt that caused the switch', () => {
    // The trail is checked against the configured chain, so the fixture needs a
    // two-route worker chain — which is also what makes the switch reachable.
    const twoRoutes = resolveConfig({
      maxConcurrency: 2,
      maxRetries: 1,
      maxTasks: 6,
      roles: {
        worker: [
          { provider: 'bifrost-completions', model: 'wb/cn:deepseek-v4.1-flash' },
          { provider: 'bifrost-completions', model: 'wb/cn:deepseek-v4-pro' },
        ],
      },
    })
    const text = renderReport(assertWorkflowReport(report({
      maxTotalAgents: maxTotalAgentsFor(1, 1, routeBudgetFor(twoRoutes)),
      routing: {
        planner: [],
        worker: ['bifrost-completions/wb/cn:deepseek-v4.1-flash', 'bifrost-completions/wb/cn:deepseek-v4-pro'],
        verifier: [],
        synthesizer: [],
      },
      routes: [{
        role: 'worker',
        chainIndex: 0,
        route: 'bifrost-completions/wb/cn:deepseek-v4.1-flash',
        attempt: 1,
        outcome: 'failed',
        failureClass: 'rate-limit',
        reason: '429 Too Many Requests',
      }, {
        role: 'worker',
        chainIndex: 1,
        route: 'bifrost-completions/wb/cn:deepseek-v4-pro',
        attempt: 1,
        outcome: 'ok',
      }],
    }), OBJECTIVE, twoRoutes))
    expect(text).toContain('Route switches:')
    expect(text).toContain('- worker attempt 1 via bifrost-completions/wb/cn:deepseek-v4.1-flash: rate-limit — 429 Too Many Requests')
  })

  it('says nothing about switches when every call succeeded', () => {
    const text = renderReport(assertWorkflowReport(report({
      routes: [{
        role: 'worker',
        chainIndex: 0,
        route: 'bifrost-completions/wb/cn:deepseek-v4.1-flash',
        attempt: 1,
        outcome: 'ok',
      }],
    }), OBJECTIVE, config))
    expect(text).not.toContain('Route switches:')
  })
})
