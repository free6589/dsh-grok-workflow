import { describe, expect, it } from 'vitest'
import {
  CONFIG_KEYS,
  CONFIG_VERSION,
  Config,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  FIXED_MAX_RETRIES,
  HARD_LIMITS,
  REMOVED_CONFIG_KEYS,
  ROLE_KEYS,
  ROUTE_KEYS,
  describeResolvedConfig,
  resolveConfig,
  snapshotConfig,
} from '../src/config.js'
import { declareSettingsSurface, describeSelf, describeSurface, validateRoutes } from '../src/settings.js'
import { realSettingsDescriptor } from './settings-fixture.js'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'
import type { ResolvedConfig } from '../src/types.js'
import { ROUTING_RECORD, recordRouting } from '../src/records.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { execution, failingVerification, task, verification } from './fixtures.js'
import {runWorkflowScript, type ScriptAgent, roleOf} from './helpers.js'

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
    expect(() => resolveConfig({ maxRetires: 2 } as never)).toThrow(/unknown configuration key "maxRetires"/)
    for (const key of CONFIG_KEYS) expect(() => resolveConfig({ [key]: undefined } as never)).not.toThrow()
  })

  it('refuses an unknown key one level down instead of silently dropping it (round 35)', () => {
    // The pool entry: only the top level was checked, so `roles.reviewer` and a route's
    // `maxInflight` were discarded while the stored document kept them — a typo looked
    // exactly like a setting that does not work. Both levels are named now.
    expect(() => resolveConfig({ roles: { reviewer: [{ model: 'r1' }] } } as never))
      .toThrow(/unknown configuration key "roles\.reviewer"; accepted roles: planner, worker, verifier, synthesizer, supervisor/)
    expect(() => resolveConfig({ roles: { worker: [{ model: 'w1', maxInflight: 3 }] } } as never))
      .toThrow(/unknown configuration key "roles\.worker\[0\]\.maxInflight" \(did you mean "maxInFlight"\?\)/)
    expect(() => resolveConfig({ roles: { planner: [{ model: 'p1' }, { model: 'p2', weight: 2 }] } } as never))
      .toThrow(/unknown configuration key "roles\.planner\[1\]\.weight"; accepted route keys: provider, model, maxInFlight/)

    // The same document the host hands over: the schema passes unknown nested keys
    // through (measured, `A39`), so the refusal has to happen in this reader.
    const fromSchema = snapshotConfig(Config({ roles: { reviewer: [{ model: 'r1' }] } } as never) as Record<string, unknown>)
    expect(Object.keys(fromSchema.roles as object)).toContain('reviewer')
    expect(() => resolveConfig(fromSchema as never)).toThrow(/unknown configuration key "roles\.reviewer"/)

    // No over-reach: the five role names, the three route keys, the bare-id shorthand
    // and an empty chain all still load, and the two key sets are the surface itself.
    const ok = resolveConfig({
      roles: {
        planner: ['p1'],
        worker: [{ provider: 'x', model: 'w1', maxInFlight: 2 }],
        verifier: [],
        synthesizer: [{ model: 's1' }],
        supervisor: [],
      },
    } as never)
    expect(Object.keys(ok.roles)).toEqual([...ROLE_KEYS])
    expect(ok.roles.worker).toEqual([{ provider: 'x', model: 'w1', maxInFlight: 2 }])
    expect([...ROLE_KEYS]).toEqual(['planner', 'worker', 'verifier', 'synthesizer', 'supervisor'])
    expect([...ROUTE_KEYS]).toEqual(['provider', 'model', 'maxInFlight'])
  })

  it('refuses a `roles` value that is not an object instead of loading five empty chains (round 37)', () => {
    // The pool entry: `config.roles?.planner` on a string, an array or null yields
    // `undefined`, so `resolveChain` returns `[]` five times and the load succeeds with
    // no route configured at all — a whole-document shape error that read as "inherit
    // every route". The schema refuses these on the host path (a `z.object` issue), so
    // the refusal has to happen in this reader, which is also reached directly.
    expect(() => resolveConfig({ roles: 'worker:m1' } as never))
      .toThrow(/roles must be an object of role chains \(planner, worker, verifier, synthesizer, supervisor\), got a string "worker:m1"/)
    expect(() => resolveConfig({ roles: [{ model: 'm1' }] } as never))
      .toThrow(/roles must be an object of role chains .*, got an array of 1/)
    expect(() => resolveConfig({ roles: null } as never))
      .toThrow(/roles must be an object of role chains .*, got null/)
    expect(() => resolveConfig({ roles: 42 } as never))
      .toThrow(/roles must be an object of role chains .*, got a number 42/)

    // No over-reach: absent (the documented "inherit"), an empty object and the five
    // role names all still load, and the shorthand inside a chain is still the chain
    // resolver's call, not this check's.
    expect(resolveConfig({} as never).roles.planner).toEqual([])
    expect(resolveConfig({ roles: {} } as never).roles.worker).toEqual([])
    expect(resolveConfig({ roles: { worker: ['w1'] } } as never).roles.worker).toEqual([{ model: 'w1' }])
    expect(() => resolveConfig({ roles: { worker: 'w1' } } as never))
      .toThrow(/roles\.worker must be an array of routes/)
  })

  it('rejects every removed key as unknown (R-06), with the migration named', () => {
    // The slim-down keeps exactly 15 keys (nine plus the four repeat-run keys and
    // the two self-iteration keys); the other 23 are unknown now.
    expect(CONFIG_KEYS).toEqual([
      'toolName', 'mode', 'grokDefault', 'roles', 'synthesis',
      'maxConcurrency', 'maxTasks', 'timeoutMs',
      'loopEnabled', 'loopMaxRounds', 'loopFailStreak', 'loopIntervalMin',
      'iterateIntervalMin', 'iterateTemplate',
      'configVersion',
    ])
    expect(REMOVED_CONFIG_KEYS).toHaveLength(23)
    for (const key of REMOVED_CONFIG_KEYS) {
      expect(() => resolveConfig({ [key]: 1 } as never)).toThrow(/unknown configuration key/)
    }
    // Spot checks: the typo suggestion still works for surviving keys.
    expect(() => resolveConfig({ maxConcurreny: 2 } as never)).toThrow(/did you mean "maxConcurrency"/)
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
    expect(config.synthesis).toBe('layered')
  })

  it('refuses a model repeated inside one chain', () => {
    expect(() => resolveConfig({ roles: { worker: [{ model: 'm' }, { model: 'm' }] } } as never))
      .toThrow(/repeats the same route twice: \/m/)
  })

  it('refuses an empty model, an over-long id and a too-long chain', () => {
    expect(() => resolveConfig({ roles: { worker: [{ model: '' }] } } as never)).toThrow(/model must be a non-empty model id/)
    expect(() => resolveConfig({ roles: { worker: [{ model: 'x'.repeat(HARD_LIMITS.routeChars + 1) }] } } as never))
      .toThrow(/longer than 120 characters/)
    expect(() => resolveConfig({ roles: { worker: Array.from({ length: HARD_LIMITS.chainLength + 1 }, (_unused, index) => ({ model: `m${index}` })) } } as never))
      .toThrow(/maximum chain length is 50/)
  })

  it('refuses a non-string model/provider with the key and shape named (round 38)', () => {
    // Before: `entry?.model?.trim()` threw a bare `TypeError` naming neither the key
    // nor the shape. Now the refusal carries the full path, like every other one
    // in this reader.
    expect(() => resolveConfig({ roles: { worker: [{ model: 42 }] } } as never))
      .toThrow(/roles\.worker\[0\]\.model must be a model id string, got number/)
    expect(() => resolveConfig({ roles: { worker: [{ provider: 42, model: 'x' }] } } as never))
      .toThrow(/roles\.worker\[0\]\.provider must be a provider id string, got number/)
    expect(() => resolveConfig({ roles: { worker: [{ provider: {}, model: 'x' }] } } as never))
      .toThrow(/roles\.worker\[0\]\.provider must be a provider id string, got object/)
  })

  it('refuses a removed switching policy key as unknown (R-06)', () => {
    // T4: `switchOn` is fixed to the built-in policy (empty); a stored value is unknown.
    expect(() => resolveConfig({ switchOn: ['timeout'] } as never))
      .toThrow(/unknown configuration key "switchOn"/)
  })

  it('fills every documented default through the schema', () => {
    // Volatile fields arrive as live holders; `snapshotConfig` is the one place
    // that turns them back into plain values (that is what the plugin reads).
    const defaults = snapshotConfig(Config({}) as Record<string, unknown>) as Record<string, unknown>
    expect(defaults).toMatchObject({
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      maxTasks: 10,
      synthesis: 'layered',
      mode: 'triage',
      grokDefault: 'off',
      loopEnabled: false,
      loopMaxRounds: 10,
      loopFailStreak: 3,
      loopIntervalMin: 0,
      configVersion: CONFIG_VERSION,
    })
  })

  it('validates the four repeat-run keys and defaults a loop off and bounded', () => {
    // Defaults: off, 10 rounds, 3 consecutive failures, interval 0 (= the loop floor).
    expect(resolveConfig({} as never)).toMatchObject({
      loopEnabled: false, loopMaxRounds: 10, loopFailStreak: 3, loopIntervalMin: 0,
    })
    // A stored setting travels through the schema and resolveConfig unchanged.
    const parsed = snapshotConfig(Config({ loopEnabled: true, loopMaxRounds: 4, loopFailStreak: 2, loopIntervalMin: 90 }))
    expect(parsed).toMatchObject({ loopEnabled: true, loopMaxRounds: 4, loopFailStreak: 2, loopIntervalMin: 90 })
    expect(resolveConfig(parsed as never)).toMatchObject({
      loopEnabled: true, loopMaxRounds: 4, loopFailStreak: 2, loopIntervalMin: 90,
    })
    // Fail closed (R-06): the switch is a real boolean, and each number is inside
    // the envelope the schema and the loop service share.
    expect(() => Config({ loopEnabled: 'on' } as never)).toThrow(/loopEnabled expected boolean/)
    expect(() => resolveConfig({ loopEnabled: 'on' } as never)).toThrow(/loopEnabled must be true or false/)
    expect(() => resolveConfig({ loopMaxRounds: 0 } as never)).toThrow(/loopMaxRounds must be an integer between 1 and 100/)
    expect(() => resolveConfig({ loopFailStreak: 21 } as never)).toThrow(/loopFailStreak must be an integer between 1 and 20/)
    expect(() => resolveConfig({ loopIntervalMin: -1 } as never)).toThrow(/loopIntervalMin must be an integer between 0 and 10080/)
    expect(() => resolveConfig({ loopIntervalMin: 10081 } as never)).toThrow(/loopIntervalMin must be an integer between 0 and 10080/)
  })

  it('carries bilingual metadata on the four repeat-run keys, agreeing with the envelope', () => {
    // The label a form shows is the client's own i18n key; the *meaning* — the unit,
    // the range, and what `0` asks for — rides on the schema, so a host that renders
    // the schema without this plugin's client cannot state a different contract. Both
    // halves are asserted: dropping one language is a silent half-translation, which
    // no type check and no render test would catch.
    interface SchemaNode {
      meta: Record<string, unknown>
      inner?: { meta: Record<string, unknown> }
    }
    const dict = (Config as unknown as { dict: Record<string, SchemaNode> }).dict
    const LOOP_KEYS = ['loopEnabled', 'loopMaxRounds', 'loopFailStreak', 'loopIntervalMin'] as const
    const node = (key: typeof LOOP_KEYS[number]): SchemaNode => {
      const found = dict[key]
      if (found === undefined) throw new Error(`Config schema has no ${key}`)
      return found
    }
    const description = (key: typeof LOOP_KEYS[number]): string => {
      const text = node(key).meta.description
      expect(typeof text, `${key} carries no schema description`).toBe('string')
      return text as string
    }
    for (const key of LOOP_KEYS) {
      const text = description(key)
      expect(text, `${key} description has no Chinese half`).toMatch(/[\u4e00-\u9fff]/)
      expect(text, `${key} description has no English half`).toMatch(/[A-Za-z]{3,}/)
    }
    // The range a description promises is the one the schema enforces, read from the
    // same constant the cap is built from: a widened bound with stale wording (or the
    // reverse) fails here instead of shipping a form that lies about its own limit.
    expect(description('loopMaxRounds')).toContain(`1-${HARD_LIMITS.loopMaxRounds}`)
    expect(description('loopFailStreak')).toContain(`1-${HARD_LIMITS.loopFailStreak}`)
    expect(description('loopIntervalMin')).toContain(`0-${HARD_LIMITS.loopIntervalMin}`)
    expect(node('loopMaxRounds').meta.max).toBe(HARD_LIMITS.loopMaxRounds)
    expect(node('loopFailStreak').meta.max).toBe(HARD_LIMITS.loopFailStreak)
    expect(node('loopIntervalMin').meta.max).toBe(HARD_LIMITS.loopIntervalMin)
    expect(node('loopMaxRounds').inner?.meta.min).toBe(1)
    expect(node('loopFailStreak').inner?.meta.min).toBe(1)
    // `loopIntervalMin` is a non-negative count, and 0 is not "start immediately": it
    // asks for the loop's own floor (max(60, one worst-case round)). The description
    // says so, so a reader of the schema alone cannot read 0 as "no wait".
    expect(node('loopIntervalMin').inner?.meta.min).toBe(0)
    expect(description('loopIntervalMin')).toContain('not "start now"')
    // Zero caps and a negative interval are refused by the schema itself, before the
    // run path is reached (R-06 fail-closed, not a clamp: only an overrun is repaired).
    expect(() => Config({ loopMaxRounds: 0 } as never)).toThrow(/loopMaxRounds/)
    expect(() => Config({ loopFailStreak: 0 } as never)).toThrow(/loopFailStreak/)
    expect(() => Config({ loopIntervalMin: -1 } as never)).toThrow(/loopIntervalMin/)
    // The metadata has to survive into the serialized schema, because that is the form
    // a host reads (`Config.toJSON()` -> `{ uid, refs }`): a description kept only in
    // the in-memory dict would be invisible to every consumer of the settings page.
    // Read the `refs` map instead of the string, so a description containing quotes is
    // compared by value rather than by its JSON-escaped spelling.
    const refs = (Config.toJSON() as { refs?: Record<string, { meta?: { description?: unknown } }> }).refs ?? {}
    const onWire = new Set(Object.values(refs)
      .map(ref => ref.meta?.description)
      .filter((text): text is string => typeof text === 'string'))
    for (const key of LOOP_KEYS) {
      expect(onWire, `${key} description is missing from Config.toJSON().refs`).toContain(description(key))
    }
  })

  it('fixes the removed retry count at 1 and the synthesis default at layered', () => {
    expect(resolveConfig({} as never).maxRetries).toBe(FIXED_MAX_RETRIES)
    expect(FIXED_MAX_RETRIES).toBe(1)
    expect(resolveConfig({} as never).synthesis).toBe('layered')
    expect(() => resolveConfig({ synthesis: 'deterministic' } as never))
      .toThrow(/synthesis must be "model" or "layered"/)
  })

  it('gates the workflow behind the per-session grok-mode default, off by default', () => {
    expect(resolveConfig({} as never).grokDefault).toBe('off')
    expect(resolveConfig({ grokDefault: 'on' } as never).grokDefault).toBe('on')
    expect(resolveConfig({ grokDefault: 'off' } as never).grokDefault).toBe('off')
    expect((snapshotConfig(Config({} as never)) as Record<string, unknown>).grokDefault).toBe('off')
    // Like the other enum keys, a bad value is refused by the schema instead of
    // being silently dropped or defaulted.
    expect(() => Config({ grokDefault: 'sometimes' } as never)).toThrow()
    // Round 26: the direct reader is the second layer and has to fail closed too.
    // Before this, `grokDefault: 'onn'` loaded as itself, printed `grokDefault=onn`
    // and behaved as off at the gate — a typo that silently disables the workflow.
    expect(() => resolveConfig({ grokDefault: 'sometimes' } as never)).toThrow(/grokDefault must be "on" or "off"/)
  })

  it('names grokDefault in the one-line effective-configuration signature', () => {
    expect(describeResolvedConfig(resolveConfig({}))).toContain('grokDefault=off')
    expect(describeResolvedConfig(resolveConfig({ grokDefault: 'on' } as never))).toContain('grokDefault=on')
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

  it('checks every routed role, the supervisor included', () => {
    // The supervisor runs *after* the work is verified, so a route the runtime does
    // not have must fail here — at load — instead of at the end of a run that has
    // already paid for every child call. Every role in the report is routed through
    // the same table, so every role is checked (RSI round 19).
    const ctx = ctxWith({
      llm: {
        listProviders: () => [knownProvider],
        listConfigurableProviders: () => [{ provider: 'p1', settingsNs: 'llm-p1', settingsPath: ['providers', 'p1'] }],
      },
      settings: {
        describe: () => [{
          ns: 'llm-p1',
          value: { providers: { p1: { models: [{ id: 'm1' }] } } },
          autoGenerate: true,
        }],
      },
    })
    for (const role of ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'] as const) {
      const fine = validateRoutes(ctx, resolveConfig({ roles: { [role]: [{ provider: 'p1', model: 'm1' }] } } as never))
      expect(fine.errors, role).toEqual([])
      const noProvider = validateRoutes(ctx, resolveConfig({ roles: { [role]: [{ provider: 'nope', model: 'm1' }] } } as never))
      expect(noProvider.errors.join(' '), role).toContain(`roles.${role} names provider "nope"`)
      const noModel = validateRoutes(ctx, resolveConfig({ roles: { [role]: [{ provider: 'p1', model: 'm2' }] } } as never))
      expect(noModel.errors.join(' '), role).toContain(`roles.${role} names model "m2"`)
    }
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
    // The descriptor is built by the runtime's own projection helpers
    // (`volatileForm`/`projectForm`, imported in test/settings-fixture.ts), not by
    // hand: the real form is `{ uid, refs }` with no `properties` map, its uid
    // differs from `Config.toJSON()`'s, and its projected value holds only the
    // volatile fields. Two earlier hand-written fixtures were wrong in exactly the
    // ways that let a broken identity check pass, so nothing here is hand-shaped.
    const descriptor = realSettingsDescriptor()
    expect(Object.keys(descriptor.schema as Record<string, unknown>).sort()).toEqual(['refs', 'uid'])
    const projected = Object.keys(descriptor.value).sort()
    expect(projected).not.toContain('toolName')   // not volatile => not projected
    expect(projected).not.toContain('configVersion')   // not volatile => not projected
    // The page is the 13 volatile keys (toolName/configVersion are structural).
    expect(projected).toEqual([
      'grokDefault', 'iterateIntervalMin', 'iterateTemplate', 'loopEnabled', 'loopFailStreak',
      'loopIntervalMin', 'loopMaxRounds', 'maxConcurrency', 'maxTasks', 'mode', 'roles',
      'synthesis', 'timeoutMs',
    ])
    expect(projected).toHaveLength(13)
    const ctx = ctxWith({
      settings: { configure: () => () => {}, describe: () => [descriptor] },
    })
    expect(declareSettingsSurface(ctx)).toBe('declared')
    // With the entry id known, identity is exact.
    expect(describeSelf(ctx, ['grok-workflow'])).toEqual({
      ns: 'grok-workflow',
      autoGenerate: true,
      applies: 'live',
      fields: [...CONFIG_KEYS],
      schemaMatches: false,   // the volatile form rebuilt the schema, so the uid differs
      matchedBy: 'id',
    })
    // Without the id, the runtime shape must still be recognised end to end: the
    // projected value is what survives a schema rebuild (t30/F2).
    expect(describeSelf(ctx)).toMatchObject({ ns: 'grok-workflow', matchedBy: 'value' })
    const surface = describeSurface(ctx)
    expect(surface.level).toBe('info')
    expect(surface.text).toContain('identified by value')
    // The log states both numbers: 13 volatile keys reach the generated page,
    // 15 are accepted (toolName/configVersion are plain, not volatile).
    expect(surface.text).toContain(`13 of ${CONFIG_KEYS.length} field(s) on the page`)
    // A foreign schema is not ours, and no field list may be invented from it.
    const foreign = ctxWith({
      settings: {
        describe: () => [{ ns: 'other', schema: { uid: 999_999, refs: {} }, value: { theme: 'dark' } }],
      },
    })
    expect(describeSelf(foreign)).toBeUndefined()
  })

  it('matches the plain Config schema by uid when no volatile rebound happened', () => {
    // The other identification path: a descriptor carrying our own schema object
    // (no volatile form) matches by uid, so the layer below is exercised too.
    const schema = Config.toJSON() as { uid: number; refs: unknown }
    const ctx = ctxWith({ settings: { configure: () => () => {}, describe: () => [{ ns: 'grok-workflow', autoGenerate: true, applies: 'live', schema }] } })
    expect(describeSelf(ctx)).toMatchObject({ ns: 'grok-workflow', matchedBy: 'uid', schemaMatches: true })
  })

  it('keeps the generated script clamps identical to HARD_LIMITS (single source)', () => {
    // script.ts cannot import host code, so its defensive clamps mirror HARD_LIMITS
    // and its documented defaults by value. The whole clamp expression is quoted
    // (bound *and* fallback), not just the bound: matching `Math.min(6,` alone
    // passes for a script that still defaults to 4, which is how the two sides
    // drifted apart before.
    expect(WORKFLOW_SCRIPT).toContain(
      `Math.min(${HARD_LIMITS.maxConcurrency}, argNumber(args ? args.maxConcurrency : undefined, ${DEFAULT_MAX_CONCURRENCY}))`,
    )
    expect(WORKFLOW_SCRIPT).toContain(
      `Math.min(${HARD_LIMITS.maxRetries}, argNumber(args ? args.maxRetries : undefined, ${FIXED_MAX_RETRIES}))`,
    )
    expect(WORKFLOW_SCRIPT).toContain(`Math.min(${HARD_LIMITS.maxTasks}, argNumber(args ? args.maxTasks : undefined, 10))`)
    expect(WORKFLOW_SCRIPT).toContain(`chainLength: ${HARD_LIMITS.chainLength},`)
    expect(WORKFLOW_SCRIPT).toContain(`routeInFlightMax: ${HARD_LIMITS.routeInFlight.max}`)
  })

  it('pins the documented run limits: default 10/1, hard maximum 100/3', () => {
    // The engine-hook contract (AGENTS.md, D-003) has one source. The config
    // schema, the checkpoint contract (ENGINE_HOOK_LIMITS in
    // src/checkpoint/schema.ts, which imports these constants) and the script
    // clamps all read it from here.
    expect(HARD_LIMITS.maxConcurrency).toBe(100)
    expect(FIXED_MAX_RETRIES).toBe(1)
    expect(DEFAULT_MAX_CONCURRENCY).toBe(10)
    expect(resolveConfig({} as never)).toMatchObject({ maxConcurrency: 10, maxRetries: 1 })
    expect(() => resolveConfig({ maxConcurrency: HARD_LIMITS.maxConcurrency + 1 } as never)).toThrow(/maxConcurrency/)
    expect(resolveConfig({ maxConcurrency: 100 } as never)).toMatchObject({ maxConcurrency: 100, maxRetries: 1 })
  })

  it('applies the documented defaults inside the script, without swallowing an explicit 0', async () => {
    // The script is the last place a missing number can be defaulted, so it has to
    // default to the same 10/1 the host does — while an explicitly provided
    // `maxRetries: 0` stays 0, which the old `Number(x) || 0` idiom happened to
    // get right and a naive `|| 1` would not.
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did it')
      return verification(task('a'))
    }
    const { args } = buildWorkflowRequest(
      'Ship the verified result',
      [task('a')],
      resolveConfig({ maxConcurrency: 1, maxTasks: 4 }),
    )
    const withoutLimits = { ...args } as Record<string, unknown>
    delete withoutLimits['maxConcurrency']
    delete withoutLimits['maxRetries']
    const defaulted = await runWorkflowScript(WORKFLOW_SCRIPT, withoutLimits, agent)
    expect(defaulted.report.limits).toMatchObject({ maxConcurrency: 10, maxRetries: 1 })

    const explicitZero = await runWorkflowScript(WORKFLOW_SCRIPT, { ...args }, agent)
    expect(explicitZero.report.limits).toMatchObject({ maxConcurrency: 1, maxRetries: 1 })
  })

  it('degrades quietly on a runtime without a settings service', () => {
    expect(declareSettingsSurface(ctxWith({}))).toBe('absent')
    expect(declareSettingsSurface(ctxWith({ settings: {} }))).toBe('unsupported')
    expect(describeSelf(ctxWith({}), ['grok-workflow'])).toBeUndefined()
  })
})

describe('configuration reaches the run', () => {
  it('uses the built-in switching policy (T4: switchOn removed, always built-in)', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') throw Object.assign(new Error('429 Too Many Requests'), { code: 'AGENT_RESULT' })
      return verification(task('a'))
    }
    const build = () => {
      const config = resolveConfig({
        maxConcurrency: 1,
        maxTasks: 4,
        roles: { worker: [{ model: 'w1' }, { model: 'w2' }] },
      })
      return { args: buildWorkflowRequest('Ship the verified result', [task('a')], config).args, config }
    }
    // Built-in policy: a rate limit advances the chain (both routes tried per
    // attempt; maxRetries 1 => 2 attempts => 4 worker calls).
    const builtIn = build()
    const a = await runWorkflowScript(WORKFLOW_SCRIPT, builtIn.args, agent)
    expect(a.calls.filter(call => roleOf(call.label) === 'worker')).toHaveLength(4)
    expect(a.report.status).toBe('failed')
    // t47: the switch is only *visible* if the trail records which route failed.
    // t46 wrote a model the provider does not enumerate and saw no switch entry —
    // that configuration never ran at all (validateRoutes rejects it at load), so
    // the line had no data. A runtime failure on an enumerated route is the case
    // that has to reach the ledger.
    const failed = (a.report.routes as { role: string; route: string; outcome: string; failureClass?: string }[])
      .filter(entry => entry.outcome === 'failed')
    // Both routes were tried (this agent fails every worker call), and the fixed
    // single retry runs the chain a second time — so the trail names both routes
    // in chain order, twice: that is what makes a switch auditable.
    expect(failed.map(entry => entry.route)).toEqual(['w1', 'w2', 'w1', 'w2'])
    expect(failed.every(entry => entry.role === 'worker')).toBe(true)
    expect(failed[0]?.failureClass).toBe('rate-limit')
  })

  it('budgets an empty plan exactly like a missing one (t27/F3)', () => {
    // The script falls back to a planner and then runs at least one task, so a
    // budget computed for zero tasks produces a limit the validated report can
    // exceed — a rejection that would cost every task's evidence.
    const config = resolveConfig({ maxTasks: 6, roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } } as never)
    const withEmpty = buildWorkflowRequest('Ship the verified result', [], config)
    const withNone = buildWorkflowRequest('Ship the verified result', undefined, config)
    expect(withEmpty.maxTotalAgents).toBe(withNone.maxTotalAgents)
    expect(withEmpty.maxTotalAgents).toBeGreaterThan(3)
    expect(withEmpty.args.tasks).toBeNull()
  })

  it('bounds the run ledger by recordLimit and writes nothing at 0', () => {
    const entry = {
      objective: 'ship it',
      routing: { planner: [], worker: ['p/first', 'p/second'], verifier: [], supervisor: [], synthesizer: [] } as never,
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

/* ------------------------------------------------------------------ t47 -- */
/**
 * t46 could not answer "what did the runtime read?" from any artefact: the deadline
 * and the role chains existed only in memory, so a settings save and a profile-patch
 * edit were indistinguishable from outside. This one-line summary is written to the
 * log whenever the effective configuration changes, and the deadline also travels
 * into every run report.
 */
describe('t47: the effective configuration is nameable', () => {
  it('names the deadline and every role chain, with "inherit" for an unset role', () => {
    const described = describeResolvedConfig(resolveConfig({}))
    expect(described).toContain(`timeoutMs=${3_600_000}`)
    expect(described).toContain('gate=on')
    expect(described).toContain('roles=planner:inherit worker:inherit verifier:inherit synthesizer:inherit supervisor:inherit')
  })

  it('shows the chains in order, so a fallback is visible without a run', () => {
    const described = describeResolvedConfig(resolveConfig({
      roles: {
        worker: [
          { provider: 'bifrost-completions', model: 'wb/cn:no-such-model-probe' },
          { provider: 'bifrost-completions', model: 'wb/cn:deepseek-v4.1-flash' },
        ],
      },
    }))
    expect(described).toContain('worker:bifrost-completions/wb/cn:no-such-model-probe→bifrost-completions/wb/cn:deepseek-v4.1-flash')
    expect(described).toContain('planner:inherit')
  })

  it('travels into the workflow request, so the report can state the deadline', () => {
    const config = resolveConfig({ maxConcurrency: 1 })
    const request = buildWorkflowRequest('Ship the verified result', [task('a')], config)
    // T4: the deadline is fixed, not configurable.
    expect((request.args as { timeoutMs: number }).timeoutMs).toBe(3_600_000)
  })
})

/* ------------------------------------------------------------------ t49 -- */
/**
 * What decides a verified task (t49, from the 12 reports in the test home).
 *
 * Every quality failure in that log — 8 of 12 reports, including all five of the
 * t46 acceptance rounds — carried the reason `verifier reported issues: …`. The
 * reason string is produced *after* the verdict check in `checkVerification`, so
 * `verdict` was `pass` in all of them: the task failed only because the verifier
 * wrote down a caveat, and the caveats themselves say "non-blocking", "minor
 * observation rather than a failure", "does not affect any acceptance criterion".
 * The structured judgement decides; prose is recorded, not fatal.
 */
describe('t49: a non-blocking verifier note does not fail a verified task', () => {
  it('keeps the task verified and carries the notes into the report', async () => {
    const config = resolveConfig({ maxConcurrency: 1, maxTasks: 4 })
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did it')
      if (roleOf(options.label) === 'verifier') {
        return verification(plan[0]!, {
          // Verbatim strings from the recorded failures (test home, t46 rounds 3 and
          // 5); both were reported as `incomplete (quality): verifier reported issues`.
          issues: [
            'Minor inaccuracy, non-blocking: the executor summary says "All five acceptance checks pass" although there are seven acceptance criteria. The substance of all seven still verified true on disk.',
            'Criterion 5 is verifiable only by attribution, not by a VCS diff: the workspace is not a git repository.',
          ],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { args } = buildWorkflowRequest('Ship the verified result', plan, config)
    const out = await runWorkflowScript(WORKFLOW_SCRIPT, { ...args }, agent)
    expect(out.report.status).toBe('completed')
    expect(out.report.incomplete).toHaveLength(0)
    const notes = (out.report.uncertainties as { taskId: string; text: string }[])
      .filter(item => item.text.startsWith('verifier note:'))
    expect(notes).toHaveLength(2)
    expect(notes[0]?.taskId).toBe('a')
    expect(notes[0]?.text).toContain('Minor inaccuracy')
  })

  it('still fails when the same verifier marks a criterion unmet', async () => {
    const config = resolveConfig({ maxConcurrency: 1, maxTasks: 4 })
    const plan = [task('a', ['first holds', 'second holds'])]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did it')
      if (roleOf(options.label) === 'verifier') {
        return verification(plan[0]!, {
          criteria: [
            { criterion: 'first holds', met: true, evidence: 'seen in file:///tmp/x' },
            { criterion: 'second holds', met: false, evidence: 'not found' },
          ],
          issues: ['the second criterion is not satisfied'],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { args } = buildWorkflowRequest('Ship the verified result', plan, config)
    const out = await runWorkflowScript(WORKFLOW_SCRIPT, { ...args }, agent)
    expect(out.report.status).toBe('failed')
    expect(JSON.stringify(out.report.incomplete)).toContain('criterion not met')
  })

  it('still fails when the verifier verdict is fail, notes or not', async () => {
    const config = resolveConfig({ maxConcurrency: 1, maxTasks: 4 })
    const plan = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('did it')
      if (roleOf(options.label) === 'verifier') return failingVerification(plan[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const { args } = buildWorkflowRequest('Ship the verified result', plan, config)
    const out = await runWorkflowScript(WORKFLOW_SCRIPT, { ...args }, agent)
    expect(out.report.status).toBe('failed')
    expect(JSON.stringify(out.report.incomplete)).toContain('verifier verdict was fail')
  })
})

/* --------------------------------------------------- timeoutMs (0 = unlimited) -- */
/**
 * The deadline used to be a fixed internal constant, which made "the run was
 * killed at 60 minutes" unanswerable from the outside and impossible to change
 * without editing the plugin. It is now a user-configurable key with three
 * pinned properties: the 60-minute default survives (t45 measured it), any
 * non-negative integer is accepted, and an invalid value fails the load instead
 * of being silently rewritten.
 */
describe('the run deadline is user-configurable (0 = unlimited)', () => {
  it('defaults to 60 minutes and carries that value into the request and the log line', () => {
    const config = resolveConfig({})
    expect(config.timeoutMs).toBe(3_600_000)
    expect(DEFAULT_TIMEOUT_MS).toBe(config.timeoutMs)
    const request = buildWorkflowRequest('Ship the verified result', [task('a')], config)
    expect((request.args as { timeoutMs: number }).timeoutMs).toBe(3_600_000)
    expect(describeResolvedConfig(config)).toContain('timeoutMs=3600000')
  })

  it('accepts any non-negative integer, including 0 for unlimited', () => {
    expect(resolveConfig({ timeoutMs: 0 }).timeoutMs).toBe(0)
    expect(resolveConfig({ timeoutMs: 1 }).timeoutMs).toBe(1)
    expect(resolveConfig({ timeoutMs: 86_400_000 }).timeoutMs).toBe(86_400_000)
    expect(resolveConfig({ timeoutMs: Number.MAX_SAFE_INTEGER }).timeoutMs).toBe(Number.MAX_SAFE_INTEGER)
    expect(describeResolvedConfig(resolveConfig({ timeoutMs: 0 }))).toContain('timeoutMs=0')
  })

  it('fails closed on a negative, fractional or non-numeric deadline (R-06)', () => {
    for (const bad of [-1, 1.5, Number.NaN, '60000']) {
      expect(() => resolveConfig({ timeoutMs: bad } as never))
        .toThrow(/timeoutMs must be a non-negative integer/)
    }
  })

  it('refuses the same values in the schema, so a profile patch cannot store one', () => {
    expect(() => Config({ timeoutMs: -5 } as never)).toThrow()
    expect(() => Config({ timeoutMs: 1.5 } as never)).toThrow()
  })
})
