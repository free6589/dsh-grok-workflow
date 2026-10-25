import { describe, expect, it } from 'vitest'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { HARD_LIMITS, resolveConfig } from '../src/config.js'
import { ROUTING_RECORD, recordRouting } from '../src/records.js'
import { redactDeep } from '../src/redact.js'
import { assertWorkflowReport } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor, WORKFLOW_SCRIPT } from '../src/script.js'
import { runWorkflowScript, type ScriptAgent } from './helpers.js'
import { execution, task, verification } from './fixtures.js'

function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objective: 'Ship the verified result',
    tasks: [task('a')],
    maxConcurrency: 2,
    maxRetries: 1,
    maxTasks: 6,
    maxTotalAgents: 40,
    roles: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: 'deterministic',
    ...overrides,
  }
}

/** Build a roles object, omitting empty chains (config rejects an explicit empty chain). */
const roles = (worker: unknown[], verifier: unknown[] = [], planner: unknown[] = [], synthesizer: unknown[] = []) => {
  const out: Record<string, unknown[]> = {}
  if (worker.length > 0) out.worker = worker
  if (verifier.length > 0) out.verifier = verifier
  if (planner.length > 0) out.planner = planner
  if (synthesizer.length > 0) out.synthesizer = synthesizer
  return out
}

describe('per-role routing configuration', () => {
  it('accepts four independent chains and exposes them resolved', () => {
    const config = resolveConfig({
      roles: roles(
        [{ provider: 'a', model: 'big' }, { model: 'small' }],
        [{ model: 'verifier-1' }],
        [{ model: 'planner-1' }],
      ),
    })
    expect(config.roles.worker).toEqual([{ provider: 'a', model: 'big' }, { model: 'small' }])
    expect(config.roles.verifier).toEqual([{ model: 'verifier-1' }])
    expect(config.roles.planner).toEqual([{ model: 'planner-1' }])
    expect(config.roles.synthesizer).toEqual([])
    expect(config.synthesis).toBe('deterministic')
  })

  it('treats an empty chain as "inherit" and reports it as empty', () => {
    // The schema default fills every role with [], so an empty chain cannot be
    // distinguished from "not configured"; the effective chain is reported instead.
    expect(resolveConfig({ roles: { worker: [] } }).roles.worker).toEqual([])
  })

  it('rejects a chain longer than the hard limit', () => {
    const chain = Array.from({ length: HARD_LIMITS.chainLength + 1 }, (_unused, index) => ({ model: `m${index}` }))
    expect(() => resolveConfig({ roles: { worker: chain } })).toThrow(/maximum chain length/)
  })

  it('rejects a duplicated route in one chain', () => {
    expect(() => resolveConfig({ roles: { worker: [{ model: 'same' }, { model: 'same' }] } })).toThrow(/repeats the same route/)
  })

  it('rejects an empty or oversized model id', () => {
    expect(() => resolveConfig({ roles: { worker: [{ model: '  ' }] } })).toThrow(/non-empty model id/)
    expect(() => resolveConfig({ roles: { worker: [{ model: 'x'.repeat(HARD_LIMITS.routeChars + 1) }] } })).toThrow(/longer than/)
  })

  it('rejects chains whose worst case exceeds the per-task call budget', () => {
    // 3 worker + 3 verifier routes with 2 attempts = 12 calls > 6-call budget.
    const chain = [{ model: 'a' }, { model: 'b' }, { model: 'c' }]
    expect(() => resolveConfig({ roles: { worker: chain, verifier: chain } })).toThrow(/budget per task/)
    // The same chains fit when retries are off.
    expect(resolveConfig({ roles: { worker: chain, verifier: chain }, maxRetries: 0 }).maxRetries).toBe(0)
  })

  it('requires a synthesizer chain for model synthesis, and forbids an unused one', () => {
    expect(() => resolveConfig({ synthesis: 'model' })).toThrow(/requires a non-empty roles.synthesizer/)
    expect(() => resolveConfig({ roles: roles([], [], [], [{ model: 'writer' }]) })).toThrow(/synthesis is "deterministic"/)
    const config = resolveConfig({ roles: roles([], [], [], [{ model: 'writer' }]), synthesis: 'model' })
    expect(config.synthesis).toBe('model')
  })

  it('defaults the answer strategy to in-turn and keeps the older two selectable', () => {
    // t24 measured that a one-shot headless app tears the tree down when the turn
    // closes, which loses a relayed/apped answer (G-18/F9). `in-turn` is therefore
    // the default; the other two stay available and revertible.
    expect(resolveConfig({}).answerStrategy).toBe('in-turn')
    expect(resolveConfig({ answerStrategy: 'relay' }).answerStrategy).toBe('relay')
    expect(resolveConfig({ answerStrategy: 'append' }).answerStrategy).toBe('append')
  })

  it('derives the child cap from the effective chains, not from attempts alone', () => {
    const plain = resolveConfig({})
    const routed = resolveConfig({ roles: roles([{ model: 'a' }, { model: 'b' }], [{ model: 'c' }]) })
    expect(maxTotalAgentsFor(1, 1, routeBudgetFor(plain))).toBe(1 + 1 * 2 * 2 + 2)
    // planner 1 + synth 0 + 1 task * 2 attempts * (2 worker + 1 verifier) + 2
    expect(maxTotalAgentsFor(1, 1, routeBudgetFor(routed))).toBe(1 + 0 + 2 * 3 + 2)
  })
})

describe('generated script routing', () => {
  it('forwards each role chain entry as agent({provider, model})', async () => {
    const models: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      models.push(`${options.label}:${options.provider ?? '-'}/${options.model ?? '-'}`)
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) return execution()
      return verification(task('a'))
    }
    const routed = args({
      roles: roles([{ provider: 'pa', model: 'wa' }], [{ provider: 'pv', model: 'va' }], [{ provider: 'pp', model: 'pl' }]),
    })
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, routed, agent)
    expect(models).toEqual(['grok-worker:a-a1:pa/wa'.replace(':a-a1', '-a-a1'), 'grok-verifier-a-a1:pv/va'])
    expect(run.report.routing).toEqual({ planner: ['pp/pl'], worker: ['pa/wa'], verifier: ['pv/va'], synthesizer: [] })
    expect(run.report.routes.map(entry => [entry.role, entry.chainIndex, entry.outcome])).toEqual([
      ['worker', 0, 'ok'],
      ['verifier', 0, 'ok'],
    ])

    // A planner run uses the planner route too.
    const plannerModels: string[] = []
    const planning: ScriptAgent = async (_prompt, options) => {
      plannerModels.push(`${options.label}:${options.provider ?? '-'}/${options.model ?? '-'}`)
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) return execution()
      return verification(task('a'))
    }
    await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: null, roles: roles([], [], [{ provider: 'pp', model: 'pl' }]) }), planning)
    expect(plannerModels[0]).toBe('grok-planner:pp/pl')
  })

  it('inherits the run route when no chain is configured', async () => {
    const seen: (string | undefined)[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      seen.push(options.model)
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) return execution()
      return verification(task('a'))
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    expect(seen).toEqual([undefined, undefined])
    expect(run.report.routes.every(entry => entry.route === 'inherit')).toBe(true)
  })

  it('switches to the next route when a worker call fails with a rate limit', async () => {
    const calls: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      calls.push(options.model ?? 'inherit')
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) {
        if (options.model === 'first') throw new Error('429 Too Many Requests: slow down')
        return execution()
      }
      return verification(task('a'))
    }
    const routed = args({ roles: roles([{ model: 'first' }, { model: 'second' }]) })
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, routed, agent)
    expect(calls).toEqual(['first', 'second', 'inherit'])
    expect(run.report.status).toBe('completed')
    const switchEntry = run.report.routes.find(entry => entry.outcome === 'failed')!
    expect(switchEntry).toMatchObject({ role: 'worker', chainIndex: 0, route: 'first', failureClass: 'rate-limit' })
    const attempt = run.report.tasks[0]!.attempts[0]!
    expect(attempt.route).toBe('second')
    expect(attempt.passed).toBe(true)
  })

  it('classifies the whitelisted failure kinds and falls back to unknown', async () => {
    const messages = [
      '429 Too Many Requests',
      '503 Service Unavailable',
      'read ECONNRESET',
      'request timed out after 30s',
      'unknown model "nope"',
      'child returned invalid json for the schema',
      'something entirely unexpected',
    ]
    const classes: (string | undefined)[] = []
    for (const message of messages) {
      const agent: ScriptAgent = async (_prompt, options) => {
        if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
        throw new Error(message)
      }
      const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
      classes.push(run.report.routes.find(entry => entry.role === 'worker')!.failureClass)
    }
    expect(classes).toEqual([
      'rate-limit',
      'server-error',
      'connection',
      'timeout',
      'model-unavailable',
      'format-error',
      'unknown',
    ])
  })

  it('treats a null structured result as a format error and advances the chain', async () => {
    // The guest collapses "child failed" and "no structured value" into `null`, so
    // a null result must be classified, never read as success (R-14 fail-closed).
    const calls: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      calls.push(options.model ?? 'inherit')
      if (options.label.startsWith('grok-worker')) {
        if (options.model === 'w1') return null
        return execution()
      }
      return verification(task('a'))
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }, { model: 'w2' }]) }), agent)
    const failed = run.report.routes.find(entry => entry.outcome === 'failed')!
    expect(failed).toMatchObject({ role: 'worker', chainIndex: 0, route: 'w1', failureClass: 'format-error' })
    expect(failed.reason).toContain('no valid structured result')
    expect(run.report.status).toBe('completed')
    expect(calls).toContain('w2')
  })

  it('does not call the rest of the chain when the first route answers', async () => {
    const calls: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      calls.push(options.model ?? 'inherit')
      if (options.label.startsWith('grok-worker')) return execution()
      return verification(task('a'))
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }, { model: 'w2' }, { model: 'w3' }]) }), agent)
    expect(calls.filter(model => model.startsWith('w'))).toEqual(['w1'])
    expect(run.report.routes.filter(entry => entry.outcome === 'failed')).toHaveLength(0)
    expect(run.report.routes.map(entry => entry.chainIndex)).toEqual([0, 0])
  })

  it('retries the same route when the verifier rejects the work', async () => {
    const calls: string[] = []
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      calls.push(`${options.label}:${options.model ?? 'inherit'}`)
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) return execution()
      verifierCalls += 1
      if (verifierCalls === 1) {
        return {
          ...verification(task('a')),
          verdict: 'fail',
          criteria: task('a').acceptanceCriteria.map(criterion => ({ criterion, met: false, evidence: '' })),
          issues: ['output is not verified'],
        }
      }
      return verification(task('a'))
    }
    const routed = args({ roles: roles([{ model: 'w1' }, { model: 'w2' }]) })
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, routed, agent)
    // A content failure must not burn a fallback route: the same model is retried.
    expect(calls.filter(call => call.startsWith('grok-worker'))).toEqual([
      'grok-worker-a-a1:w1',
      'grok-worker-a-a2:w1',
    ])
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]!.attempts[0]!.failure).toEqual({
      class: 'verification-failed',
      reason: expect.stringContaining('verifier verdict was fail') as unknown as string,
    })
  })

  it('reports an exhausted chain with every route in the trail', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) throw new Error('400 invalid request')
      return verification(task('a'))
    }
    const routed = args({ roles: roles([{ model: 'w1' }, { model: 'w2' }]) })
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, routed, agent)
    const taskReport = run.report.tasks[0]!
    expect(taskReport.status).toBe('failed')
    expect(taskReport.attempts[0]!.error).toContain('worker failed on every route')
    expect(run.report.incomplete[0]!.reason).toContain('every route')
    const workerTrail = run.report.routes.filter(entry => entry.role === 'worker')
    // Each of the two attempts walks the whole chain, so the trail shows both.
    expect(workerTrail.map(entry => [entry.attempt, entry.route, entry.outcome])).toEqual([
      [1, 'w1', 'failed'],
      [1, 'w2', 'failed'],
      [2, 'w1', 'failed'],
      [2, 'w2', 'failed'],
    ])
    expect(run.report.status).toBe('failed')
  })

  it('redacts secrets found in a failure reason', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      throw new Error('auth failed for api key sk-abcdef0123456789abcdef')
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    const text = JSON.stringify(run.report)
    expect(text).not.toContain('sk-abcdef0123456789abcdef')
    expect(run.report.routes.some(entry => (entry.reason ?? '').includes('REDACTED'))).toBe(true)
  })

  it('keeps a fatal budget error fatal instead of switching routes', async () => {
    const seen: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      seen.push(options.model ?? 'inherit')
      const error = Object.assign(new Error('agent cap reached'), { code: 'AGENT_CAP', fatal: true })
      throw error
    }
    await expect(runWorkflowScript(WORKFLOW_SCRIPT, args({ roles: roles([{ model: 'w1' }, { model: 'w2' }]) }), agent))
      .rejects.toThrow(/agent cap reached/)
    expect(seen.filter(model => model !== 'inherit')).toHaveLength(1)
  })

  it('writes no narrative when synthesis is deterministic', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) return execution()
      return verification(task('a'))
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    expect(run.report.synthesis).toEqual({ mode: 'deterministic' })
    expect(run.calls.some(call => call.label.startsWith('grok-synthesizer'))).toBe(false)
  })

  it('adds one synthesizer call in model mode and keeps verified work when it fails', async () => {
    const summary = 'One task was verified with file evidence; nothing is outstanding.'
    let synthesizerCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) return execution()
      if (options.label.startsWith('grok-synthesizer')) {
        synthesizerCalls += 1
        return { summary }
      }
      return verification(task('a'))
    }
    const routed = args({ roles: roles([], [], [], [{ model: 'writer' }]), synthesis: 'model' })
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, routed, agent)
    expect(synthesizerCalls).toBe(1)
    expect(run.report.synthesis).toEqual({ mode: 'model', summary })
    expect(run.report.status).toBe('completed')
    expect(run.report.confirmed).toHaveLength(1)

    const broken: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-synthesizer')) throw new Error('503 Service Unavailable')
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) return execution()
      return verification(task('a'))
    }
    const failedSynthesis = await runWorkflowScript(WORKFLOW_SCRIPT, routed, broken)
    expect(failedSynthesis.report.status).toBe('completed')
    expect(failedSynthesis.report.synthesis.mode).toBe('model')
    expect(failedSynthesis.report.synthesis.error).toContain('every route')
    expect(failedSynthesis.report.synthesis.summary).toBeUndefined()
  })

  it('survives report validation with a routing ledger and rejects out-of-range chain indexes', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-planner')) return { tasks: [task('a')] }
      if (options.label.startsWith('grok-worker')) return execution()
      return verification(task('a'))
    }
    const config = resolveConfig({ maxConcurrency: 2, maxRetries: 1, maxTasks: 6, roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } })
    const cap = maxTotalAgentsFor(1, 1, routeBudgetFor(config))
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ maxTotalAgents: cap, roles: roles([{ model: 'w1' }, { model: 'w2' }]) }), agent)
    expect(run.report.limits.maxTotalAgents).toBe(cap)
    // Production order is: the engine materializes the realm value into plain
    // JSON, then the host redacts. Doing it in that order here matters — the raw
    // realm report shares task objects between `plan.tasks` and `tasks`, which a
    // redactor walking with a cycle set would treat as a repeat.
    const plain = redactDeep(JSON.parse(JSON.stringify(run.report))) as unknown
    const report = assertWorkflowReport(plain, 'Ship the verified result', config)
    expect(report.routing.worker).toEqual(['w1', 'w2'])
    // Round-trip: the script realm's objects are not the test realm's arrays.
    const tampered = JSON.parse(JSON.stringify(run.report)) as { routes: { chainIndex: number }[] }
    tampered.routes[0]!.chainIndex = 9
    expect(() => assertWorkflowReport(tampered, 'Ship the verified result', config)).toThrow(/out-of-range chainIndex/)
  })
})

describe('route ledger record', () => {
  const routes = [
    { role: 'worker' as const, chainIndex: 0, route: 'p/first', attempt: 1, outcome: 'failed' as const, failureClass: 'rate-limit' as const, reason: 'key sk-abcdef0123456789abcdef was rejected' },
    { role: 'worker' as const, chainIndex: 1, route: 'p/second', attempt: 1, outcome: 'ok' as const },
  ]

  function readLedger(session: Session): { switches: { route: string; reason?: string }[] } | undefined {
    return session.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined && record.type === ROUTING_RECORD)
      .map(record => record!.data as { switches: { route: string; reason?: string }[] })
      .at(-1)
  }

  it('writes one redacted ledger record per run', () => {
    const session = Session.create('sess-ledger' as never)
    recordRouting(session, { objective: 'ship it', routing: { planner: [], worker: ['p/first', 'p/second'], verifier: [], synthesizer: [] }, synthesis: 'deterministic', routes })
    const ledger = readLedger(session)
    expect(ledger?.switches.map(switchEntry => switchEntry.route)).toEqual(['p/first', 'p/second'])
    expect(ledger?.switches[0]?.reason).not.toContain('sk-abcdef0123456789abcdef')
  })

  it('writes nothing when no route switched or failed', () => {
    const session = Session.create('sess-quiet' as never)
    recordRouting(session, {
      objective: 'ship it',
      routing: { planner: [], worker: ['p/first'], verifier: [], synthesizer: [] },
      synthesis: 'deterministic',
      routes: [{ role: 'worker', chainIndex: 0, route: 'p/first', attempt: 1, outcome: 'ok' }],
    })
    expect(readLedger(session)).toBeUndefined()
  })

  it('never throws when the session is missing or refuses the record', () => {
    expect(() => recordRouting(undefined, { objective: 'x', routing: { planner: [], worker: [], verifier: [], synthesizer: [] }, synthesis: 'deterministic', routes })).not.toThrow()
    const broken = { id: 'broken', append: () => { throw new Error('read-only') } } as unknown as Session
    expect(() => recordRouting(broken, { objective: 'x', routing: { planner: [], worker: [], verifier: [], synthesizer: [] }, synthesis: 'deterministic', routes })).not.toThrow()
  })
})
