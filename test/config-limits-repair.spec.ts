import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  Config,
  HARD_LIMITS,
  LIMIT_CAPS,
  REMOVED_CONFIG_KEYS,
  limitOverrunWarning,
  repairLimitOverruns,
  resolveConfig,
  snapshotConfig,
  takeLimitOverruns,
} from '../src/config.js'
import { apply } from '../src/index.js'

/**
 * The schema records clamped overruns in a module-level buffer the plugin drains, so
 * every case starts from a clean one: the assertions below are about its own input,
 * not about whatever an earlier case happened to parse.
 */
beforeEach(() => { takeLimitOverruns() })

/** Plain values out of a parsed (volatile) config document. */
const parsed = (raw: Record<string, unknown>): Record<string, unknown> =>
  snapshotConfig(Config(raw as never) as Record<string, unknown>) as Record<string, unknown>

/**
 * B07 recovery for a stored limit over the hard maximum.
 *
 * v0.9.0 restored the documented 6 / 3 envelope (`HARD_LIMITS`, D-003), so a live
 * profile patch written before it can still hold the old wider numbers (8 / 5).
 * `resolveConfig` is right to refuse them — the cap is a quota — but refusing the
 * whole row leaves the user with no settings page to fix it from, which is the
 * deadlock D-031 removed for the synthesis mismatch. The load path therefore
 * clamps to the cap and warns once per field.
 *
 * Two layers carry the recovery, because the host validates the profile patch before
 * the plugin exists: `Config` clamps at parse time (that is the layer the user hits —
 * `Fiber.resolveConfig` → `Config["~standard"].validate`), and `readConfig` repairs a
 * config that never met the schema (programmatic `apply()`). `resolveConfig` keeps
 * refusing an overrun, because the cap is a quota and a direct caller must not get a
 * silent wider value.
 *
 * Mutation meaning: deleting the `repairLimitOverruns` call from `readConfig`
 * fails the `apply()` cases below (the row throws instead of activating); widening
 * `repairLimitOverruns` to a below-minimum value fails the R-06 cases; removing
 * the cap from `resolveConfig` fails the first assertion of the first case. The
 * cap itself is never widened anywhere in this file.
 */
describe('config limit repair (B07)', () => {
  it('clamps a stored overrun to its cap with one bilingual warning per field', () => {
    // T4: maxRetries is no longer configurable (assertKnownKeys rejects it), so
    // the repair path is exercised through maxConcurrency; the legacy 6/3-era
    // numbers below are stale pre-T6 values kept as *over-cap* examples is wrong —
    // under T6 the envelope is 100/10, so 120 overruns and resolves to 100.
    const raw = { maxConcurrency: 120 } as never
    // R-06 pin: validation itself still refuses the stored numbers, untouched.
    expect(() => resolveConfig({ maxConcurrency: 120 } as never)).toThrow(/maxConcurrency must be an integer between 1 and 100/)

    const { repaired, warnings } = repairLimitOverruns(raw)
    expect((repaired as Record<string, unknown>).maxConcurrency).toBe(HARD_LIMITS.maxConcurrency)
    expect((repaired as Record<string, unknown>).maxConcurrency).toBe(100)
    // One warning naming both numbers in both languages so the log can be read
    // without the patch open next to it.
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('maxConcurrency is 120')
    expect(warnings[0]).toContain('over the hard maximum 100')
    expect(warnings[0]).toContain('已按 100 生效（原值 120 超过上限 100），请在设置页确认')

    // Pure: the caller's object is not mutated, so a second read sees the stored value.
    expect(raw).toEqual({ maxConcurrency: 120 })
  })

  it('clamps in the schema the host validates before apply() — the layer that died', () => {
    // This is the reported failure: Cordis validates the profile patch through
    // `Config["~standard"].validate` *before* `apply()`, so a schema that refuses 120
    // makes the whole row `did not activate` and no plugin repair can run.
    const result = (Config as unknown as { '~standard': { validate(input: unknown): { issues?: unknown, value: unknown } } })['~standard']
      .validate({ maxConcurrency: 120 })
    expect(result.issues).toBeUndefined()
    expect(snapshotConfig(result.value as Record<string, unknown>)).toMatchObject({ maxConcurrency: 100 })
    // The callable form (what the settings path and the tests use) agrees.
    expect(parsed({ maxConcurrency: 120 })).toMatchObject({ maxConcurrency: 100 })
    // And the clamp is announced: the note the plugin drains at load.
    expect(takeLimitOverruns()).toEqual([
      { field: 'maxConcurrency', stored: 120, cap: 100 },
    ])
    // Parsing the same document twice does not double the note.
    parsed({ maxConcurrency: 120 })
    expect(takeLimitOverruns()).toHaveLength(1)
  })

  it('keeps the schema fail-closed for everything that is not an overrun (R-06)', () => {
    expect(() => Config({ maxConcurrency: 0 } as never)).toThrow(/maxConcurrency expected number >= 1/)
    expect(() => Config({ maxConcurrency: 2.5 } as never)).toThrow(/multiple of 1/)
    expect(() => Config({ maxConcurrency: '8' } as never)).toThrow(/expected number/)
    // T4: removed keys are unknown at the schema layer too — the schema drops
    // them only so `assertKnownKeys` can refuse with a suggestion (R-06).
    // An absent key still defaults, so the clamp did not swallow the default.
    expect(parsed({})).toMatchObject({ maxConcurrency: 10 })
    expect(parsed({ maxConcurrency: 100 })).toMatchObject({ maxConcurrency: 100 })
    expect(takeLimitOverruns()).toEqual([])
  })

  it('leaves a legal value untouched and says nothing', () => {
    const raw = { maxConcurrency: 100 }
    const { repaired, warnings } = repairLimitOverruns(raw)
    expect(warnings).toEqual([])
    // Nothing matched: the input object comes back untouched, not a copy of it.
    expect(repaired).toBe(raw)
    expect(resolveConfig(repaired).maxConcurrency).toBe(100)
  })

  it('clamps only the field that overruns', () => {
    const { repaired, warnings } = repairLimitOverruns({ maxConcurrency: 101 })
    expect(repaired).toEqual({ maxConcurrency: 100 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('maxConcurrency')
  })

  it('leaves a below-minimum or non-numeric value to the validator (R-06)', () => {
    // Not a "the cap moved" case: 0 was never legal, so clamping it would invent a
    // value the user never wrote. It stays a hard fail.
    const zero = { maxConcurrency: 0 }
    expect(repairLimitOverruns(zero)).toEqual({ repaired: zero, warnings: [] })
    expect(() => resolveConfig(zero)).toThrow(/maxConcurrency must be an integer between 1 and 100/)

    const text = { maxConcurrency: '8' } as never
    expect(repairLimitOverruns(text).warnings).toEqual([])
    expect(() => resolveConfig(text)).toThrow(/maxConcurrency must be an integer/)
  })
})

/**
 * B02: the clamp covers *every* numeric hard limit, from one table.
 *
 * B07 fixed two fields ad hoc. The defect that leaves is drift: a limit the schema
 * refuses while the repair clamps it (or the reverse), and a new limit added to one
 * side only. `LIMIT_CAPS` is the single table both layers read, so this case walks it
 * instead of listing fields — a field added to the table is covered the moment it
 * exists, and a field somebody clamps by hand outside the table is not.
 *
 * Mutation meaning: dropping a key from `LIMIT_CAPS` fails the schema half (the
 * schema goes back to refusing); reverting `repairLimitOverruns` to a hand-written
 * list fails the repair half for every field the list omits; widening a cap fails
 * the documented-envelope assertions below.
 */
describe('LIMIT_CAPS: one clamp table for every user-configurable numeric cap (B02, T4)', () => {
  it('clamps each listed limit in the schema, records one note, and repairs the same number', () => {
    // T4 kept the two run limits in the table; the repeat-run caps joined them with
    // the loop keys. The other former caps are fixed internally (their patches are
    // unknown keys).
    expect(Object.keys(LIMIT_CAPS).sort()).toEqual(['loopFailStreak', 'loopIntervalMin', 'loopMaxRounds', 'maxConcurrency', 'maxTasks'])
    for (const [field, cap] of Object.entries(LIMIT_CAPS)) {
      takeLimitOverruns()
      const stored = cap + 1
      // The host's layer: clamp and note, instead of killing the row.
      expect({ field, parsed: parsed({ [field]: stored })[field] }).toEqual({ field, parsed: cap })
      expect(takeLimitOverruns()).toEqual([{ field, stored, cap }])
      // The plugin's layer: the same number, the same cap, the same wording.
      const { repaired, warnings } = repairLimitOverruns({ [field]: stored } as never)
      expect({ field, repaired: (repaired as Record<string, unknown>)[field] }).toEqual({ field, repaired: cap })
      expect(warnings).toEqual([limitOverrunWarning({ field: field as keyof typeof LIMIT_CAPS, stored, cap })])
      // R-06: a direct caller is still refused the same number, and the repaired one runs.
      expect(() => resolveConfig({ [field]: stored } as never)).toThrow(new RegExp(field))
      expect((resolveConfig(repaired) as unknown as Record<string, number>)[field]).toBe(cap)
    }
  })

  it('keeps the documented envelope and reads every cap off HARD_LIMITS', () => {
    // Not a new bound: the same numbers, now named once for the clamp.
    expect(LIMIT_CAPS.maxConcurrency).toBe(HARD_LIMITS.maxConcurrency)
    expect(LIMIT_CAPS.maxTasks).toBe(HARD_LIMITS.maxTasks)
    expect([LIMIT_CAPS.maxConcurrency, LIMIT_CAPS.maxTasks]).toEqual([100, 100])
    // Each loop round is a full run, so the round cap and the fail streak are the
    // same kind of quota envelope and clamp through the same table.
    expect(LIMIT_CAPS.loopMaxRounds).toBe(HARD_LIMITS.loopMaxRounds)
    expect(LIMIT_CAPS.loopFailStreak).toBe(HARD_LIMITS.loopFailStreak)
    expect(LIMIT_CAPS.loopIntervalMin).toBe(HARD_LIMITS.loopIntervalMin)
    expect([LIMIT_CAPS.loopMaxRounds, LIMIT_CAPS.loopFailStreak, LIMIT_CAPS.loopIntervalMin]).toEqual([100, 20, 10_080])
    // A limit that is judged inside a chain is deliberately not in the table.
    expect(Object.keys(LIMIT_CAPS)).not.toContain('maxInFlight')
    // timeoutMs is a real key, but it has no clamp: 0 means unlimited and any
    // non-negative integer is accepted as written, so it stays out of the table.
    expect(Object.keys(LIMIT_CAPS)).not.toContain('timeoutMs')
    expect(resolveConfig({ timeoutMs: 0 } as never).timeoutMs).toBe(0)
    expect(resolveConfig({ timeoutMs: 7_200_000 } as never).timeoutMs).toBe(7_200_000)
    expect(() => Config({ maxTasks: '500' } as never)).toThrow(/maxTasks expected number/)
    expect(takeLimitOverruns()).toEqual([])
  })

  it('rejects every T4-removed key as unknown (R-06拒载), all 23', () => {
    // T4 slim-down: the 23 removed keys are no longer clamped or defaulted — a
    // patch that still carries one is refused instead of silently repaired.
    // (`timeoutMs` left this list when it became configurable again.)
    expect(REMOVED_CONFIG_KEYS).toHaveLength(23)
    for (const key of REMOVED_CONFIG_KEYS) {
      expect(() => resolveConfig({ [key]: 1 } as never)).toThrow(/unknown configuration key/)
      // The repair path leaves them alone too: not its table, not its business.
      expect(repairLimitOverruns({ [key]: 1 } as never).warnings).toEqual([])
    }
    expect(takeLimitOverruns()).toEqual([])
  })
})

/**
 * B04: the load-time repair's announcement joins the schema path's dedupe.
 *
 * `readConfig()` repairs a config that never met the schema on *every* read, and a
 * read happens per message — so a patch that keeps failing for another reason (the
 * synthesis mismatch below) used to log its limit line once per message. The repair
 * now leaves the schema's own note instead of logging, which is what lets the
 * plugin's one-per-load set suppress it and what keeps the two wordings identical.
 */
describe('B04: repair announcements share the schema path', () => {
  it('leaves the schema note and the schema sentence, so one set covers both layers', () => {
    takeLimitOverruns()
    const { warnings } = repairLimitOverruns({ maxConcurrency: 101 })
    const notes = takeLimitOverruns()
    expect(notes).toEqual([{ field: 'maxConcurrency', stored: 101, cap: 100 }])
    expect(warnings).toEqual([limitOverrunWarning(notes[0]!)])
    // A second read of the same patch leaves the same single key: the dedupe set sees
    // one entry, not one per read.
    repairLimitOverruns({ maxConcurrency: 101 })
    expect(takeLimitOverruns()).toHaveLength(1)
  })

  it('does not record a note for a limit it only passes over', () => {
    takeLimitOverruns()
    expect(repairLimitOverruns({ maxConcurrency: 100, maxTasks: 1 }).warnings).toEqual([])
    expect(takeLimitOverruns()).toEqual([])
  })
})

/** The minimum context `apply()` touches, with the load-time warnings recorded. */
class FakeCtx {
  readonly warnings: string[] = []
  readonly infos: string[] = []
  tool: { name: string } | undefined
  readonly tools = {
    register: (tool: { name: string }) => { this.tool = tool; return () => { this.tool = undefined } },
  }
  readonly systemPrompt = {
    section: () => () => {},
    getSectionOrder: () => 2600,
  }
  logger = () => ({
    warn: (message: string) => { this.warnings.push(message) },
    info: (message: string) => { this.infos.push(message) },
  })
  effect = (installer: () => unknown) => installer()
}

/**
 * `apply()` half: the row must activate on a stale pre-v0.9.0 patch, because the
 * settings page it is fixed from only exists once the row is up.
 */
describe('apply() load-time limit repair (B07)', () => {
  it('activates on a stored overrun, warns once, and runs at the cap', () => {
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { maxConcurrency: 120 } as never)).not.toThrow()
    expect(ctx.tool?.name).toBe('grok_workflow')
    expect(ctx.warnings.filter(w => w.includes('请在设置页确认'))).toHaveLength(1)
    expect(ctx.warnings.some(w => w.includes('maxConcurrency is 120'))).toBe(true)
    // The effective-configuration line the t47 log writes is the evidence that the
    // run reads the cap and not the stored number.
    expect(ctx.infos.some(info => info.includes('maxConcurrency=100'))).toBe(true)
  })

  it('announces the schema-clamped overrun the host parsed before apply()', () => {
    // The real order: the host validates the patch, then loads the plugin with the
    // clamped document. The clamp itself is silent, so the note it leaves is the only
    // way the user learns their stored 8 is running as 6.
    const hostConfig = Config({ maxConcurrency: 120 } as never) as Record<string, unknown>
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, hostConfig as never)).not.toThrow()
    expect(ctx.tool?.name).toBe('grok_workflow')
    expect(ctx.warnings.filter(w => w.includes('请在设置页确认'))).toHaveLength(1)
    expect(ctx.warnings.some(w => w.includes('maxConcurrency is 120, over the hard maximum 100'))).toBe(true)
    expect(ctx.infos.some(info => info.includes('maxConcurrency=100'))).toBe(true)
    // Nothing recorded, nothing to say on the next load of the same document.
    takeLimitOverruns()
    const quiet = new FakeCtx()
    apply(quiet as never, Config({ maxConcurrency: 100 } as never) as never)
    expect(quiet.warnings.filter(w => w.includes('请在设置页确认'))).toEqual([])
  })

  it('contrast: the schema clamps while the programmatic resolver still throws (R-06)', () => {
    // Same number, two entry points, two contracts: the loading path recovers, a
    // direct caller is refused. Widening `resolveConfig` to clamp would fail this.
    expect(parsed({ maxConcurrency: 120 })).toMatchObject({ maxConcurrency: 100 })
    expect(() => resolveConfig({ maxConcurrency: 120 } as never)).toThrow(/maxConcurrency must be an integer between 1 and 100/)
    // What the reader actually resolves is the clamped shape, and that is legal.
    expect(resolveConfig(parsed({ maxConcurrency: 120 }))).toMatchObject({ maxConcurrency: 100 })
  })

  it('repairs both defect kinds in one load instead of needing two restarts', () => {
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { synthesis: 'model', maxConcurrency: 120 } as never)).not.toThrow()
    expect(ctx.tool?.name).toBe('grok_workflow')
    // Two repair warnings (the runtime also notes its own unavailable services).
    expect(ctx.warnings.filter(w => w.includes('请在设置页确认'))).toHaveLength(2)
    expect(ctx.warnings.some(w => w.includes('已按 layered 生效，请在设置页确认'))).toBe(true)
    expect(ctx.warnings.some(w => w.includes('已按 100 生效（原值 120 超过上限 100）'))).toBe(true)
    const line = ctx.infos.find(info => info.startsWith('configuration in effect:'))
    expect(line).toContain('synthesis=layered (repaired)')
    expect(line).toContain('maxConcurrency=100')
  })

  it('still throws at load when the repaired shape hides a defect it may not touch', () => {
    const ctx = new FakeCtx()
    // The overrun is repaired, then the unknown key is rejected: one repair must not
    // launder a second, unrecoverable defect (R-06).
    expect(() => apply(ctx as never, { maxConcurrency: 8, maxRetires: 2 } as never))
      .toThrow(/unknown configuration key/)
    expect(ctx.tool).toBeUndefined()
    // A below-minimum value is not repaired either, so it still refuses the load.
    expect(() => apply(new FakeCtx() as never, { maxConcurrency: 0 } as never))
      .toThrow(/maxConcurrency must be an integer between 1 and 100/)
  })
})

/**
 * The frame the user actually died in.
 *
 * The host does not call the plugin to decide whether it loads: Cordis validates the
 * profile patch against the exported `Config` *first* (`Fiber.resolveConfig` →
 * `Config["~standard"].validate`) and a validation issue leaves the fiber `FAILED`
 * before `apply()` exists. So the schema-level clamp is the fix that matters, and a
 * real fiber is the only honest way to show it — hence a real `Context`, not a double.
 * The second half is the control: the same fiber with the pre-B07 schema (`max(6)`)
 * still fails, which is what makes the first half evidence instead of ritual.
 */
describe('B07 at the host layer: a real Cordis fiber', () => {
  const FAILED = 3
  const ACTIVE = 2

  async function loadWith(schema: unknown) {
    const ctx = new Context()
    let registered: { name: string } | undefined
    ctx.provide('tools', { register: (tool: { name: string }) => { registered = tool; return () => {} } })
    ctx.provide('workflowEngine', { start: () => undefined })
    ctx.provide('systemPrompt', { section: () => () => {}, getSectionOrder: () => 2600 })
    let seen: Record<string, unknown> | undefined
    const fiber = ctx.plugin({
      name: 'dsh-grok-workflow',
      inject: ['tools', 'workflowEngine', 'systemPrompt'],
      Config: schema,
      apply: (inner: never, config: never) => {
        seen = snapshotConfig(config as Record<string, unknown>) as Record<string, unknown>
        return apply(inner, config)
      },
    } as never, { maxConcurrency: 8} as never)
    // One macrotask is enough for `_reload()` to settle into a stable state.
    await new Promise(resolve => setTimeout(resolve, 50))
    const state = (fiber as unknown as { state: number }).state
    await (fiber as unknown as { dispose: () => Promise<void> }).dispose()
    return { state, seen, registered }
  }

  it('activates on a stored 8 and hands the plugin 8 (under the 100 cap, T6)', async () => {
    const result = await loadWith(Config)
    expect(result.state).toBe(ACTIVE)
    expect(result.seen).toMatchObject({ maxConcurrency: 8})
    expect(result.registered?.name).toBe('grok_workflow')
  })

  it('clamps a stored 120 to the 100 cap at the host layer', async () => {
    const ctx = new Context()
    let registered: { name: string } | undefined
    ctx.provide('tools', { register: (tool: { name: string }) => { registered = tool; return () => {} } })
    ctx.provide('workflowEngine', { start: () => undefined })
    ctx.provide('systemPrompt', { section: () => () => {}, getSectionOrder: () => 2600 })
    let seen: Record<string, unknown> | undefined
    const fiber = ctx.plugin({
      name: 'dsh-grok-workflow',
      inject: ['tools', 'workflowEngine', 'systemPrompt'],
      Config,
      apply: (inner: never, config: never) => {
        seen = snapshotConfig(config as Record<string, unknown>) as Record<string, unknown>
        return apply(inner, config)
      },
    } as never, { maxConcurrency: 120} as never)
    await new Promise(resolve => setTimeout(resolve, 50))
    const state = (fiber as unknown as { state: number }).state
    await (fiber as unknown as { dispose: () => Promise<void> }).dispose()
    expect(state).toBe(ACTIVE)
    expect(seen).toMatchObject({ maxConcurrency: 100 })
    expect(registered?.name).toBe('grok_workflow')
  })

  it('control: the pre-B07 schema still fails the fiber before apply()', async () => {
    // Pinned to the historical 6-cap: HARD_LIMITS.maxConcurrency is 100 now
    // (T6), so reading the cap off HARD_LIMITS would accept the stored 8 and
    // the control would stop refusing. The pre-B07 schema refused 8 with max(6).
    const refusing = z.object({ maxConcurrency: z.number().max(6).default(3) })
    const result = await loadWith(refusing)
    expect(result.state).toBe(FAILED)
    expect(result.registered).toBeUndefined()
    expect(result.seen).toBeUndefined()
  })
})

// ─── Settings page half ────────────────────────────────────────────────────────
//
// The page is hand-written JavaScript, so these fixtures load the shipped bundle the
// way the host does (`__ModuleLoader__` registration, then the factory) and drive the
// component with a stub React. Only the render surface is stubbed — the bundle, its
// dictionaries and the page component are the real ones.

type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }
type Translator = (key: string, params?: Record<string, unknown>) => string

interface PageBundle {
  apply(ctx: unknown): void
  GROK_WORKFLOW_DICT: Record<string, Record<string, string>>
  GROK_WORKFLOW_INTERNALS: {
    limitOverrunWarn(value?: Record<string, unknown>): Array<{ key: string, live: number, cap: number }>
    translate(locale: string, key: string, params?: Record<string, unknown>): string
    translator(locale: string): Translator
  }
}

let rendering: { index: number, cells: unknown[] } | undefined

function loadBundle(): PageBundle {
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  let registration: { id: string, factory: (require: (id: string) => unknown) => PageBundle } | undefined
  const globalRecord = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = globalRecord.window
  globalRecord.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(source)()
  } finally {
    globalRecord.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const stubReact = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
      const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
      return typeof type === 'function' ? (type as (props: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => {
      const cells = rendering?.cells ?? []
      const at = rendering === undefined ? 0 : rendering.index++
      if (at >= cells.length) cells[at] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      return [cells[at], (next: unknown) => { cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(cells[at]) : next }]
    },
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
  return registration!.factory((id) => {
    if (id === 'react') return stubReact
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

const bundle = loadBundle()
const { limitOverrunWarn, translate, translator } = bundle.GROK_WORKFLOW_INTERNALS

/** Register the page against a face holding one fixed settings document. */
function renderWith(value: Record<string, unknown>): unknown {
  const snapshot = {
    status: 'ready',
    view: { writable: true, namespaces: [{ ns: 'grok-workflow', revision: 1, value }] },
    error: null,
  }
  const face = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    ensure: async () => undefined,
  }
  let page: { options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown } | undefined
  bundle.apply({
    effect: (fn: () => unknown) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    inject: () => ({}),
    configForms: {
      describe: () => face,
      whileServed: (_ns: string[], fn: () => unknown) => fn(),
      get: () => ({ mutate: async () => true }),
    },
    slots: {
      inject: (_name: string, fn: () => unknown) => fn(),
      register: (options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown) => {
        page = { options, component }
        return () => { page = undefined }
      },
    },
  })
  const options = page!.options
  const injected = (options['inject'] as () => Record<string, unknown>)()
  const props = { ...injected, t: translator('zh') } as Record<string, unknown>
  rendering = { index: 0, cells: [] }
  try {
    return page!.component(props)
  } finally {
    rendering = undefined
  }
}

/** Every rendered element, depth first. */
function walk(node: unknown, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  if (typeof node === 'object') {
    const element = node as Element
    out.push(element)
    for (const child of element.children) walk(child, out)
    return out
  }
  return out
}

/** The text a rendered subtree carries, flattened. */
function texts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(child => texts(child))
  const element = node as Element
  return element.children.flatMap(child => texts(child))
}

describe('client settings page: over-limit banner (B07, T5: only maxConcurrency/maxTasks are page fields)', () => {
  it('finds a live value above the hard maximum and ignores a legal one', () => {
    expect(limitOverrunWarn({ maxConcurrency: 120 })).toEqual([
      { key: 'maxConcurrency', live: 120, cap: 100 },
    ])
    expect(limitOverrunWarn({ maxConcurrency: 100 })).toEqual([])
    expect(limitOverrunWarn({ maxTasks: 500, maxConcurrency: 10 })).toEqual([
      { key: 'maxTasks', live: 500, cap: 100 },
    ])
    expect(limitOverrunWarn(undefined)).toEqual([])
    // A string or a below-minimum value is `error.number`'s business, not this banner's.
    expect(limitOverrunWarn({ maxConcurrency: '120' })).toEqual([])
    expect(limitOverrunWarn({ maxConcurrency: 0 })).toEqual([])
    // Removed keys are not page fields, so the banner never fires for them.
    expect(limitOverrunWarn({ maxRetries: 5, timeoutMs: 999_999_999 })).toEqual([])
  })

  it('reads the stored user layer, not the clamped projected value (B01)', () => {
    // This is the defect the banner shipped with: `describe()` publishes the *effective*
    // value, so the Host has already clamped a stored 120 to 100 before the page sees
    // it and a comparison against `value` could never fire. `user` is the document as
    // stored — the only number the notice is actually about.
    expect(limitOverrunWarn({ value: { maxConcurrency: 100 }, user: { maxConcurrency: 120 } })).toEqual([
      { key: 'maxConcurrency', live: 120, cap: 100 },
    ])
    // A namespace that publishes no user layer still reports the effective document.
    expect(limitOverrunWarn({ value: { maxConcurrency: 120 } })).toEqual([
      { key: 'maxConcurrency', live: 120, cap: 100 },
    ])
    expect(limitOverrunWarn({ user: { maxTasks: 500 } })).toEqual([
      { key: 'maxTasks', live: 500, cap: 100 },
    ])
    // A legal stored document says nothing, whatever the projection carries.
    expect(limitOverrunWarn({ value: { maxConcurrency: 120 }, user: { maxConcurrency: 10 } })).toEqual([])
  })

  it('shows one yellow line per overrun, naming the saved value and the cap', () => {
    const tree = renderWith({ maxConcurrency: 120, roles: {} })
    const banner = walk(tree).find(element => element.props['data-warn'] === 'limits')
    expect(banner).toBeDefined()
    const keys = walk(banner).map(element => element.props['data-warn-key']).filter(Boolean)
    expect(keys).toEqual(['maxConcurrency'])
    const copy = texts(banner).join('\n')
    // The reader is told both numbers, in the page's own language, and that the
    // run is clamped rather than refused.
    expect(copy).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['warn.limit.title'])
    expect(copy).toContain('120')
    expect(copy).toContain('100')
  })

  it('drops the banner once the saved value is legal', () => {
    const tree = renderWith({ maxConcurrency: 10, roles: {} })
    expect(walk(tree).some(element => element.props['data-warn'] === 'limits')).toBe(false)
  })

  it('carries the notice in both languages, not as a key', () => {
    const zh = translator('zh')
    const english = translate('en', 'warn.limit.detail', { field: 'Jobs at once', live: '8', cap: '6' })
    const chinese = zh('warn.limit.detail', { field: '同时干几件', live: '8', cap: '6' })
    expect(english).not.toBe('warn.limit.detail')
    expect(english).not.toBe(chinese)
    expect(english).toContain('8')
    expect(english).toContain('6')
    expect(chinese).toContain('同时干几件')
    for (const locale of ['en', 'zh']) {
      const dict = bundle.GROK_WORKFLOW_DICT[locale]!
      expect(dict['warn.limit.title']!.length).toBeGreaterThan(3)
      expect(dict['warn.limit.detail']!.length).toBeGreaterThan(3)
    }
  })
})
