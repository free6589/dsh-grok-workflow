import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, maxTotalAgentsFor, WORKFLOW_SCRIPT } from '../src/script.js'
import type { NormalizedTask } from '../src/types.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, type ScriptAgent } from './helpers.js'

/**
 * Same-attempt format resubmit for the two judging roles (verifier, supervisor).
 *
 * session-6cd6053d: a check/review child answered with an unescaped ASCII double
 * quote inside a JSON string, the host could not parse its structured output and
 * handed back `null`, and the verdict that was really `pass` was lost. The worker
 * already resubmits once inside the same attempt; the verifier and the supervisor
 * did not, so the whole task was redone (~19.5 minutes burned for one quoting
 * mistake). These cases pin the mirrored resubmit, the prompt/schema hints that
 * make the mistake rarer, and the failure text that makes it visible next time.
 */

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

describe('verifier same-attempt resubmit (B1)', () => {
  it('recovers a verdict that arrived as an unparsable structured result, without a retry', async () => {
    const t = task('a')
    let verifierCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        // First call: the host could not parse the structured output (unescaped
        // double quote), which the script observes as no value at all.
        if (verifierCalls === 1) return null
        // The resubmit must not re-verify: same verdict, same evidence, quoted
        // safely, and short enough to stay parseable.
        expect(prompt).toContain('SAME verdict')
        expect(prompt).toContain('800 characters')
        expect(prompt).toContain('single quotes')
        expect(prompt).toContain('resubmission: same attempt')
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
    expect(verifierCalls).toBe(2)
    expect(run.events).toContain('log:task a attempt 1 verifier resubmitted structured result')
    expect(() => assertWorkflowReport(run.report, 'Ship the verified result', config())).not.toThrow()
  })

  it('records a second miss as a format failure that names the verifier', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return null
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('failed')
    // One resubmit per attempt , then the normal retry policy: 2 attempts.
    expect(run.report.tasks[0]?.attempts).toHaveLength(2)
    for (const attempt of run.report.tasks[0]?.attempts ?? []) {
      expect(attempt.failure?.class).toBe('format-error')
      // The reason has to be diagnosable from the report alone: which role, and
      // that the structured output was missing or unparsable.
      expect(attempt.failure?.reason).toContain('verifier')
      expect(attempt.failure?.reason).toContain('structured')
    }
    expect(run.calls.filter(c => roleOf(c.label) === 'verifier')).toHaveLength(4)
    expect(() => assertWorkflowReport(run.report, 'Ship the verified result', config())).not.toThrow()
  })

  it('does not resubmit a verifier transport failure', async () => {
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') {
        verifierCalls += 1
        throw Object.assign(new Error('503 Service Unavailable'), { code: 'AGENT_RESULT', fatal: true })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('failed')
    // One call per attempt, no resubmit (fixed retry policy: 2 attempts).
    expect(verifierCalls).toBe(2)
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('server-error')
  })

  it('carries the quote and length rules in the verifier prompt and the schema', async () => {
    const t = task('a')
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      return verification(t)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { verifier: [{ model: 'v1' }] } }), agent)
    expect(run.report.status).toBe('completed')
    const verifierCall = run.calls.find(c => roleOf(c.label) === 'verifier')
    expect(verifierCall?.prompt).toContain('single quotes')
    expect(verifierCall?.prompt).toContain('800 characters')
    const schema = verifierCall?.schema as {
      properties: { checkedEvidence: { items: { properties: { finding: { description?: string } } } }; criteria: { items: { properties: { evidence: { description?: string } } } } }
    }
    expect(schema.properties.criteria.items.properties.evidence.description ?? '').toContain('800')
    expect(schema.properties.checkedEvidence.items.properties.finding.description ?? '').toContain('800')
  })
})

describe('supervisor same-attempt resubmit (B1)', () => {
  it('recovers a supervision judgement that arrived as an unparsable structured result', async () => {
    const t = task('a')
    let supervisorCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return verification(t)
      if (roleOf(options.label) === 'supervisor') {
        supervisorCalls += 1
        if (supervisorCalls === 1) return null
        expect(prompt).toContain('SAME verdict')
        expect(prompt).toContain('supervision')
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
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(supervisorCalls).toBe(2)
    expect(run.events).toContain('log:task a attempt 1 supervisor resubmitted structured result')
    expect(() => assertWorkflowReport(run.report, 'Ship the verified result', config())).not.toThrow()
  })

  it('names the supervisor when the resubmit also yields nothing', async () => {
    const t = task('a')
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did the work')
      if (roleOf(options.label) === 'verifier') return verification(t)
      if (roleOf(options.label) === 'supervisor') return null
      throw new Error(`unexpected label ${options.label}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ roles: { verifier: [{ model: 'v1' }], supervisor: [{ model: 's1' }] } }),
      agent,
    )
    expect(run.report.status).toBe('failed')
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('format-error')
    expect(run.report.tasks[0]?.attempts[0]?.failure?.reason).toContain('supervisor')
  })
})

describe('format failures that used to fall through as unknown', () => {
  it('classifies structured_output and JSON parse messages as format errors', async () => {
    const messages = [
      "structured_output: Expected ',' or '}' after property value in JSON at position 42",
      'tool input failed schema validation: structured_output',
    ]
    for (const message of messages) {
      const agent: ScriptAgent = async (_prompt, options) => {
        if (roleOf(options.label) === 'worker') {
          throw Object.assign(new Error(message), { code: 'AGENT_RESULT', fatal: true })
        }
        return verification(task('a'))
      }
      const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: { worker: [{ model: 'w1' }] } }), agent)
      expect(run.report.status).toBe('failed')
      expect(run.report.tasks[0]?.attempts[0]?.failure?.class, message).toBe('format-error')
      expect(run.report.tasks[0]?.attempts[0]?.failure?.category).toBe('infrastructure')
    }
  })
})

describe('child cap covers the resubmits', () => {
  it('sizes every attempt for one resubmit per role', () => {
    const budget = { planner: 1, worker: 2, verifier: 2, supervisor: 1, synthesizer: 0 }
    const tasks = 3
    const retries = 1
    // Worst case per attempt: the first call of every role may spend its whole
    // chain again on the resubmit, so the per-attempt block counts twice.
    const perAttempt = 2 * (budget.worker + budget.verifier + budget.supervisor)
    expect(maxTotalAgentsFor(tasks, retries, budget)).toBeGreaterThanOrEqual(tasks * (retries + 1) * perAttempt)
  })
})
