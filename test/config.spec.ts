import { describe, expect, it } from 'vitest'
import {
  CONFIG_KEYS,
  CONFIG_VERSION,
  Config,
  HARD_LIMITS,
  resolveConfig,
  snapshotConfig,
} from '../src/config.js'
import { declareSettingsSurface, describeSelf, describeSurface, validateRoutes } from '../src/settings.js'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'
import type { ResolvedConfig } from '../src/types.js'
import { ROUTING_RECORD, recordRouting } from '../src/records.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { task, verification } from './fixtures.js'
import { runWorkflowScript, type ScriptAgent } from './helpers.js'

/**
 * 阶段5 (requirement D): one configuration layer, validated at load.
 *
 * The DSH settings page is generated from the exported `Config` schema
 * (`ctx.settings.describe()` projects every Loader entry's own schema, `ns` =
 * profile entry id, `applies: 'live'`, `autoGenerate` default true), so these
 * tests plus the schema are the whole settings surface: what a user can change
 * is exactly what the run reads, and anything unrepresentable is refused with a
 * message instead of being silently ignored.
 */

/** A context double exposing only the optional services under test. */
function ctxWith(services: Record<string, unknown>): Context {
  return {
    get(name: string) {
      return services[name]
    },
  } as unknown as Context
}

/** Config with one worker route, so route validation has something to check. */
function configWith(overrides: Record<string, unknown> = {}): ResolvedConfig {
  return resolveConfig({ roles: { worker: [{ provider: 'p1', model: 'm1' }] }, ...overrides } as never)
}

describe('configuration surface', () => {
  it('refuses an unknown key instead of silently dropping it', () => {
    expect(() => resolveConfig({ maxRetires: 2 } as never)).toThrow(/unknown configuration key "maxRetires".*did you mean "maxRetries"/)
    for (const key of CONFIG_KEYS) expect(() => resolveConfig({ [key]: undefined } as never)).not.toThrow()
  })

  it('refuses a configuration written for a newer version', () => {
    expect(() => resolveConfig({ configVersion: CONFIG_VERSION + 1 } as never))
      .toThrow(/configVersion must be an integer between 1 and 1/)
  })

  it('normalizes a bare model id shorthand into a route (migration)', () => {
    const config = resolveConfig({ roles: { worker: ['fast', 'slow'] } } as never)
    expect(config.roles.worker).toEqual([{ model: 'fast' }, { model: 'slow' }])
    expect(() => resolveConfig({ roles: { worker: [''] } } as never)).toThrow(/must name a model, not an empty string/)
  })

  it('treats an empty chain as inherit rather than an error', () => {
    const config = resolveConfig({ roles: { planner: [], worker: [], verifier: [], synthesizer: [] } } as never)
    expect(config.roles.worker).toEqual([])
    expect(config.synthesis).toBe('deterministic')
  })

  it('refuses a model repeated inside one chain', () => {
    expect(() => resolveConfig({ roles: { worker: [{ model: 'm' }, { model: 'm' }] } } as never))
      .toThrow(/repeats the same route twice: \/m/)
  })

  it('refuses an empty model, an over-long id and a too-long chain', () => {
    expect(() => resolveConfig({ roles: { worker: [{ model: '' }] } } as never)).toThrow(/model must be a non-empty model id/)
    expect(() => resolveConfig({ roles: { worker: [{ model: 'x'.repeat(HARD_LIMITS.routeChars + 1) }] } } as never))
      .toThrow(/longer than 120 characters/)
    expect(() => resolveConfig({ roles: { worker: [{ model: 'a' }, { model: 'b' }, { model: 'c' }, { model: 'd' }] } } as never))
      .toThrow(/maximum chain length is 3/)
  })

  it('refuses a switching policy naming a class that can never switch', () => {
    expect(() => resolveConfig({ switchOn: ['verification-failed'] } as never))
      .toThrow(/not a switchable failure class.*content and setup failures never switch/)
    expect(resolveConfig({ switchOn: ['timeout', 'timeout'] } as never).switchOn).toEqual(['timeout'])
    expect(resolveConfig({} as never).switchOn).toEqual([])
  })

  it('carries the run-record switches, bounded by the hard limit', () => {
    expect(resolveConfig({} as never)).toMatchObject({ recordRuns: true, recordLimit: 64, configVersion: CONFIG_VERSION })
    expect(resolveConfig({ recordRuns: false, recordLimit: 0 } as never)).toMatchObject({ recordRuns: false, recordLimit: 0 })
    expect(() => resolveConfig({ recordLimit: HARD_LIMITS.recordEntries + 1 } as never))
      .toThrow(/recordLimit must be an integer between 0 and 256/)
  })

  it('fills every documented default through the schema', () => {
    // Volatile fields arrive as live holders; `snapshotConfig` is the one place
    // that turns them back into plain values (that is what the plugin reads).
    const defaults = snapshotConfig(Config({}) as Record<string, unknown>) as Record<string, unknown>
    expect(defaults).toMatchObject({
      enforceGate: true,
      answerStrategy: 'in-turn',
      maxConcurrency: 3,
      maxRetries: 1,
      maxTasks: 6,
      maxActiveRuns: 2,
      switchOn: [],
      recordRuns: true,
      recordLimit: 64,
      configVersion: CONFIG_VERSION,
    })
  })
})

describe('route validation against the runtime', () => {
  const knownProvider = { id: 'p1', name: 'Provider One' }

  it('fails on a provider the runtime does not have', () => {
    const ctx = ctxWith({ llm: { listProviders: () => [knownProvider] } })
    expect(validateRoutes(ctx, configWith()).errors).toEqual([])
    const missing = validateRoutes(ctx, resolveConfig({ roles: { worker: [{ provider: 'nope', model: 'm1' }] } } as never))
    expect(missing.errors[0]).toContain('names provider "nope"')
    expect(missing.errors[0]).toContain('known providers: p1')
  })

  it('fails on a model the provider enumerates but does not declare', () => {
    const ctx = ctxWith({
      llm: {
        listProviders: () => [knownProvider],
        listConfigurableProviders: () => [{ provider: 'p1', settingsNs: 'llm-p1', settingsPath: ['providers', 'p1'] }],
      },
      settings: {
        describe: () => [{
          ns: 'llm-p1',
          value: { providers: { p1: { models: [{ id: 'm1' }, { id: 'm2' }] } } },
          autoGenerate: true,
        }],
      },
    })
    expect(validateRoutes(ctx, configWith()).errors).toEqual([])
    const bad = validateRoutes(ctx, resolveConfig({ roles: { worker: [{ provider: 'p1', model: 'nope' }] } } as never))
    expect(bad.errors[0]).toContain('names model "nope"')
    expect(bad.errors[0]).toContain('declared: m1, m2')
  })

  it('notes instead of failing when the runtime cannot judge the route', () => {
    const noModels = ctxWith({
      llm: {
        listProviders: () => [knownProvider],
        listConfigurableProviders: () => [{ provider: 'p1', settingsNs: 'llm-p1', settingsPath: ['providers', 'p1'] }],
      },
      settings: { describe: () => [{ ns: 'llm-p1', value: { providers: { p1: {} } } }] },
    })
    const free = validateRoutes(noModels, configWith())
    expect(free.errors).toEqual([])
    expect(free.notes.join(' ')).toContain('enumerates no models')

    const noLlm = validateRoutes(ctxWith({}), configWith())
    expect(noLlm.errors).toEqual([])
    expect(noLlm.notes.join(' ')).toContain('exposes no llm service')

    // A provider registry that has not settled yet must not fail the load.
    const empty = validateRoutes(ctxWith({ llm: { listProviders: () => [] } }), configWith())
    expect(empty.errors).toEqual([])
    expect(empty.notes.join(' ')).toContain('registry was empty at load')
  })

  it('reports the generated settings page for this plugin', () => {
    // The real descriptor carries `form.toJSON()`, which is schemastery's
    // `{ uid, refs }` and has no `properties` map (t28 measured this shape), so
    // the field list must come from our own schema and identity from the uid.
    const schema = Config.toJSON() as { uid: number; refs: unknown }
    expect(Object.keys(schema).sort()).toEqual(['refs', 'uid'])
    const ctx = ctxWith({
      settings: {
        configure: () => () => {},
        describe: () => [{ ns: 'grok-workflow', autoGenerate: true, applies: 'live', schema }],
      },
    })
    expect(declareSettingsSurface(ctx)).toBe('declared')
    const view = describeSelf(ctx, ['grok-workflow'])
    expect(view).toEqual({
      ns: 'grok-workflow',
      autoGenerate: true,
      applies: 'live',
      fields: [...CONFIG_KEYS],
      schemaMatches: true,
      matchedBy: 'id',
    })
    // Matching by schema identity alone finds the same descriptor without an id.
    expect(describeSelf(ctx)).toMatchObject({ ns: 'grok-workflow', matchedBy: 'uid', schemaMatches: true })
    // A foreign schema is not ours, and no field list may be invented from it.
    const foreign = ctxWith({
      settings: { describe: () => [{ ns: 'other', schema: { uid: 999_999, refs: {} }, value: { theme: 'dark' } }] },
    })
    expect(describeSelf(foreign)).toBeUndefined()
  })

  it('still finds the entry when a volatile form rebuilt the schema (t30/F2)', () => {
    // Measured in the real runtime: the volatile form gets a fresh uid (155 vs 156),
    // so uid equality reports "not ours" even though the descriptor is ours. The
    // projected value is the signal that survives, and the diagnostics line must say
    // which path identified it instead of claiming the page is missing.
    const ctx = ctxWith({
      settings: {
        configure: () => () => {},
        describe: () => [{
          ns: 'grok-workflow',
          autoGenerate: true,
          applies: 'live',
          schema: { uid: 155, refs: {} },
          value: { toolName: 'grok_workflow', roles: { planner: [] }, switchOn: [] },
        }],
      },
    })
    const view = describeSelf(ctx)
    expect(view).toMatchObject({ ns: 'grok-workflow', matchedBy: 'value', schemaMatches: false })
    expect(view?.fields).toEqual([...CONFIG_KEYS])
    const surface = describeSurface(ctx)
    expect(surface.level).toBe('info')
    expect(surface.text).toContain('identified by value')
    expect(surface.text).toContain(`${CONFIG_KEYS.length} field(s)`)
  })

  it('degrades quietly on a runtime without a settings service', () => {
    expect(declareSettingsSurface(ctxWith({}))).toBe('absent')
    expect(declareSettingsSurface(ctxWith({ settings: {} }))).toBe('unsupported')
    expect(describeSelf(ctxWith({}), ['grok-workflow'])).toBeUndefined()
  })
})

describe('configuration reaches the run', () => {
  it('applies the configured switching policy to the fallback chain', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker')) throw Object.assign(new Error('429 Too Many Requests'), { code: 'AGENT_RESULT' })
      return verification(task('a'))
    }
    const build = (switchOn: string[]) => {
      const config = resolveConfig({
        maxConcurrency: 1,
        maxRetries: 0,
        maxTasks: 4,
        roles: { worker: [{ model: 'w1' }, { model: 'w2' }] },
        switchOn: switchOn as never,
      })
      return { args: { ...buildWorkflowRequest('Ship the verified result', [task('a')], config).args }, config }
    }
    // Built-in policy: a rate limit advances the chain (both routes tried).
    const builtIn = build([])
    const a = await runWorkflowScript(WORKFLOW_SCRIPT, builtIn.args, agent)
    expect(a.calls.filter(call => call.label.startsWith('grok-worker'))).toHaveLength(2)
    expect(a.report.status).toBe('failed')
    // Configured policy that omits rate-limit: the same failure does NOT advance.
    const narrowed = build(['server-error'])
    const b = await runWorkflowScript(WORKFLOW_SCRIPT, narrowed.args, agent)
    expect(b.calls.filter(call => call.label.startsWith('grok-worker'))).toHaveLength(1)
    expect(b.report.tasks[0]?.attempts[0]?.failure?.class).toBe('rate-limit')
  })

  it('budgets an empty plan exactly like a missing one (t27/F3)', () => {
    // The script falls back to a planner and then runs at least one task, so a
    // budget computed for zero tasks produces a limit the validated report can
    // exceed — a rejection that would cost every task's evidence.
    const config = resolveConfig({ maxTasks: 6, maxRetries: 0, roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } } as never)
    const withEmpty = buildWorkflowRequest('Ship the verified result', [], config)
    const withNone = buildWorkflowRequest('Ship the verified result', undefined, config)
    expect(withEmpty.maxTotalAgents).toBe(withNone.maxTotalAgents)
    expect(withEmpty.maxTotalAgents).toBeGreaterThan(3)
    expect(withEmpty.args.tasks).toBeNull()
  })

  it('bounds the run ledger by recordLimit and writes nothing at 0', () => {
    const entry = {
      objective: 'ship it',
      routing: { planner: [], worker: ['p/first', 'p/second'], verifier: [], synthesizer: [] } as never,
      synthesis: 'deterministic' as const,
      routes: [
        { role: 'worker' as const, chainIndex: 0, route: 'p/first', attempt: 1, outcome: 'failed' as const, failureClass: 'server-error' as const, reason: 'boom' },
        { role: 'worker' as const, chainIndex: 1, route: 'p/second', attempt: 1, outcome: 'ok' as const },
      ],
    }
    const count = (limit: number): number => {
      const session = Session.create(`sess-record-${limit}` as never)
      recordRouting(session, entry, undefined, limit)
      return session.ownEvents()
        .map(event => pluginRecordOf(event))
        .filter(record => record !== undefined && record.type === ROUTING_RECORD)
        .length
    }
    expect(count(0)).toBe(0)
    expect(count(64)).toBe(1)
  })
})
