import { describe, expect, it } from 'vitest'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { HARD_LIMITS, resolveConfig } from '../src/config.js'
import { validateRoutes } from '../src/settings.js'
import type { Context } from '@deepseek-ai/cordis'
import type { ResolvedConfig } from '../src/types.js'
import { ROUTING_RECORD, recordRouting } from '../src/records.js'
import { renderReport } from '../src/report.js'
import { WORKFLOW_SCRIPT, buildWorkflowRequest, maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import { configRouteLabels, createActiveState, snapshotBusyRoutes } from '../src/run.js'
import { execution, task, verification } from './fixtures.js'
import { delay, roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objective: 'Ship the verified result',
    tasks: [task('a')],
    maxConcurrency: 1,
    maxRetries: 0,
    maxTasks: 4,
    maxTotalAgents: 40,
    roles: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: 'deterministic',
    ...overrides,
  }
}

const roles = (worker: unknown[], verifier: unknown[] = [], planner: unknown[] = [], synthesizer: unknown[] = []) => {
  const out: Record<string, unknown[]> = {}
  if (worker.length > 0) out.worker = worker
  if (verifier.length > 0) out.verifier = verifier
  if (planner.length > 0) out.planner = planner
  if (synthesizer.length > 0) out.synthesizer = synthesizer
  return out
}

const directAgent = (workerImpl: ScriptAgent): ScriptAgent => async (prompt, options) => {
  if (roleOf(options.label) === 'worker') return workerImpl(prompt, options)
  if (roleOf(options.label) === 'verifier') return verification(taskFromPrompt(prompt))
  throw new Error(`unexpected label ${options.label}`)
}

describe('per-route concurrency caps with overflow to the next route', () => {
  it('rejects a cap outside 1..64 and keeps the chain uncapped by default', () => {
    expect(() => resolveConfig({ roles: { worker: [{ model: 'w1', maxInFlight: 0 }] } } as never))
      .toThrow(/maxInFlight must be an integer between 1 and 64/)
    expect(() => resolveConfig({ roles: { worker: [{ model: 'w1', maxInFlight: 65 }] } } as never))
      .toThrow(/maxInFlight must be an integer between 1 and 64/)
    expect(() => resolveConfig({ roles: { worker: [{ model: 'w1', maxInFlight: 1.5 }] } } as never))
      .toThrow(/maxInFlight must be an integer between 1 and 64/)
    expect(HARD_LIMITS.routeInFlight).toEqual({ min: 1, max: 64 })
    const config = resolveConfig({ roles: { worker: [{ model: 'w1' }, { model: 'w2', maxInFlight: 2 }] } })
    expect(config.roles.worker).toEqual([{ model: 'w1' }, { model: 'w2', maxInFlight: 2 }])
  })

  it('uses the next route when the first is full, and records the overflow', async () => {
    const models: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'planner') return { tasks: [task('a'), task('b')] }
      if (roleOf(options.label) === 'worker') {
        models.push(options.model ?? 'inherit')
        await delay(25)
        return execution('done')
      }
      return verification(taskFromPrompt(_prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ maxConcurrency: 2, tasks: [task('a'), task('b')], roles: roles([{ model: 'w1', maxInFlight: 1 }, { model: 'w2' }]) }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(models.sort()).toEqual(['w1', 'w2'])
    const overflow = run.report.routes.find(entry => entry.role === 'worker' && (entry.skippedBusy?.length ?? 0) > 0)
    expect(overflow).toMatchObject({ route: 'w2', outcome: 'ok', skippedBusy: ['w1'] })
  })

  it('queues instead of failing when every route is full', async () => {
    let inFlight = 0
    let peak = 0
    const agent: ScriptAgent = directAgent(async (_prompt, options) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await delay(25)
      inFlight -= 1
      if (options.model !== 'w1') throw new Error('expected the single capped route to answer')
      return execution('done')
    })
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ maxConcurrency: 2, roles: roles([{ model: 'w1', maxInFlight: 1 }]) }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(peak).toBe(1)
  })

  it('keeps the clamps comment pinned to the host limits', () => {
    expect(WORKFLOW_SCRIPT).toContain(`routeInFlightMax: ${HARD_LIMITS.routeInFlight.max}`)
  })

  it('budgets the same child-agent total because a cap never adds a call', () => {
    const uncapped = resolveConfig({ maxRetries: 1, maxTasks: 1, roles: { worker: [{ model: 'w1' }] } })
    const capped = resolveConfig({ maxRetries: 1, maxTasks: 1, roles: { worker: [{ model: 'w1', maxInFlight: 1 }] } })
    expect(routeBudgetFor(capped)).toEqual(routeBudgetFor(uncapped))
    expect(maxTotalAgentsFor(1, 1, routeBudgetFor(capped))).toBe(maxTotalAgentsFor(1, 1, routeBudgetFor(uncapped)))
  })

  it('renders overflows separately from failures and never as a switch', async () => {
    const models: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'planner') return { tasks: [task('a'), task('b')] }
      if (roleOf(options.label) === 'worker') {
        models.push(options.model ?? 'inherit')
        await delay(25)
        return execution('done')
      }
      return verification(taskFromPrompt(_prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ maxConcurrency: 2, tasks: [task('a'), task('b')], roles: roles([{ model: 'w1', maxInFlight: 1 }, { model: 'w2' }]) }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    const text = renderReport(run.report, { showDiagnostics: true })
    expect(text).toContain('Route overflows (full lane yielded, not failures):')
    expect(text).toContain('skipped full w1')
    expect(text).not.toContain('Route switches:')
  })

  it('keeps two uncapped routes on route-1 with no overflow recorded (empty-cap baseline)', async () => {
    const models: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'planner') return { tasks: [task('a'), task('b')] }
      if (roleOf(options.label) === 'worker') {
        models.push(options.model ?? 'inherit')
        await delay(25)
        return execution('done')
      }
      return verification(taskFromPrompt(_prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ maxConcurrency: 2, tasks: [task('a'), task('b')], roles: roles([{ model: 'w1' }, { model: 'w2' }]) }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    // Both tasks stay on the first route: nothing ever yields when every cap is blank.
    expect(models.sort()).toEqual(['w1', 'w1'])
    expect(run.report.routes.every(entry => (entry.skippedBusy?.length ?? 0) === 0)).toBe(true)
    expect(renderReport(run.report)).not.toContain('Route overflows')
  })

  it('keeps an overflow-only call in the routing ledger with coerced evidence', () => {
    const session = Session.create('sess-overflow' as never)
    recordRouting(session, {
      objective: 'ship it',
      routing: { planner: [], worker: ['w1', 'w2'], verifier: [], synthesizer: [] },
      synthesis: 'deterministic',
      routes: [{
        role: 'worker', chainIndex: 1, route: 'w2', attempt: 1, outcome: 'ok',
        skippedBusy: ['w1', 7 as unknown as string, 'x'.repeat(200)], queuedMs: 12.9,
      }],
    })
    const ledger = session.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined && record.type === ROUTING_RECORD)
      .map(record => record!.data as { switches: { route: string; skippedBusy?: string[]; queuedMs?: number }[] })
      .at(-1)
    expect(ledger?.switches).toHaveLength(1)
    expect(ledger?.switches[0]?.route).toBe('w2')
    expect(ledger?.switches[0]?.skippedBusy).toEqual(['w1', 'x'.repeat(160)])
    expect(ledger?.switches[0]?.queuedMs).toBe(12)
  })

  it('adds a load-time note (never an error) when a chain has 2+ routes but every cap is blank', () => {
    const ctx = { get: (name: string) => name === 'llm' ? { listProviders: () => [{ id: 'p1' }] } : undefined } as unknown as Context
    const blank = resolveConfig({ roles: { worker: [{ provider: 'p1', model: 'm1' }, { provider: 'p1', model: 'm2' }] } } as never)
    const found = validateRoutes(ctx, blank as ResolvedConfig)
    expect(found.errors).toEqual([])
    expect(found.notes.some(note => note.includes('every maxInFlight is blank'))).toBe(true)
    expect(found.notes.some(note => note.includes('上限全空'))).toBe(true)

    const capped = resolveConfig({ roles: { worker: [{ provider: 'p1', model: 'm1' }, { provider: 'p1', model: 'm2', maxInFlight: 1 }] } } as never)
    expect(validateRoutes(ctx, capped as ResolvedConfig).notes.some(note => note.includes('every maxInFlight is blank'))).toBe(false)

    const single = resolveConfig({ roles: { worker: [{ provider: 'p1', model: 'm1' }] } } as never)
    expect(validateRoutes(ctx, single as ResolvedConfig).notes.some(note => note.includes('every maxInFlight is blank'))).toBe(false)
  })

  it('prefers the non-busy route when the cross-run hint flags the first chain entry', async () => {
    const models: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'planner') return { tasks: [task('a')] }
      if (roleOf(options.label) === 'worker') {
        models.push(options.model ?? 'inherit')
        return execution('done')
      }
      return verification(taskFromPrompt(_prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({
        maxConcurrency: 1,
        tasks: [task('a')],
        roles: roles([{ model: 'w1' }, { model: 'w2' }]),
        busyRoutes: ['w1'],
      }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(models).toEqual(['w2'])
    const overflow = run.report.routes.find(entry => entry.role === 'worker')
    expect(overflow).toMatchObject({ route: 'w2', outcome: 'ok', skippedBusy: ['w1 (cross-run hint)'] })
    const text = renderReport(run.report, { showDiagnostics: true })
    expect(text).toContain('Route overflows (cross-run hint):')
    expect(text).toContain('w1 (cross-run hint)')
    expect(text).not.toContain('Route overflows (full lane yielded, not failures):')
  })

  it('keeps the no-hint pick byte-identical when busyRoutes is absent', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'planner') return { tasks: [task('a')] }
      if (roleOf(options.label) === 'worker') return execution('done')
      return verification(taskFromPrompt(_prompt))
    }
    const base = { maxConcurrency: 1, tasks: [task('a')], roles: roles([{ model: 'w1' }, { model: 'w2' }]) }
    const plain = await runWorkflowScript(WORKFLOW_SCRIPT, args(base), agent)
    const empty = await runWorkflowScript(WORKFLOW_SCRIPT, args({ ...base, busyRoutes: [] }), agent)
    expect(JSON.stringify(empty.report.routes)).toBe(JSON.stringify(plain.report.routes))
    expect(empty.report.routes.every(entry => (entry.skippedBusy?.length ?? 0) === 0)).toBe(true)
  })

  it('never lets the cross-run hint change the child-agent budget', () => {
    const config = resolveConfig({ maxRetries: 1, maxTasks: 1, roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } })
    const hinted = buildWorkflowRequest('Ship the verified result', [task('a')], config, 'en', undefined, ['w1'])
    const plain = buildWorkflowRequest('Ship the verified result', [task('a')], config, 'en')
    expect(hinted.args.busyRoutes).toEqual(['w1'])
    expect('busyRoutes' in plain.args).toBe(false)
    expect(routeBudgetFor(config)).toEqual({ planner: 1, worker: 2, verifier: 1, synthesizer: 0 })
    expect(hinted.maxTotalAgents).toBe(plain.maxTotalAgents)
    expect(hinted.maxTotalAgents).toBe(maxTotalAgentsFor(1, 1, routeBudgetFor(config)))
  })

  it('snapshots run-level route labels from live runs, oldest first', () => {
    const state = createActiveState()
    const config = resolveConfig({ roles: { worker: [{ provider: 'p1', model: 'm1' }, { model: 'm2' }] } })
    expect(snapshotBusyRoutes(state)).toEqual([])
    expect(configRouteLabels(config)).toEqual(['p1/m1', 'm2'])
    const runA = { id: 'run-a' } as never
    const runB = { id: 'run-b' } as never
    state.runs.add(runA)
    state.runs.add(runB)
    state.active.set(runA, { runId: 'run-a', sessionId: 's1', startedAtMs: 2000, routes: ['w2', 'w1'] })
    state.active.set(runB, { runId: 'run-b', sessionId: 's2', startedAtMs: 1000, routes: ['w1', 'w3'] })
    expect(snapshotBusyRoutes(state)).toEqual(['w1', 'w3', 'w2'])
  })
})
