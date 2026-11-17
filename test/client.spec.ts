import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG_KEYS, DEFAULT_MAX_CONCURRENCY, DEFAULT_MAX_TASKS, HARD_LIMITS, SWITCHABLE_CLASSES } from '../src/config.js'

/**
 * The browser settings page is hand-written JavaScript (the host serves it verbatim in
 * its `__ModuleLoader__` format), so nothing about it is type-checked. These tests are
 * the only thing standing between the page and a silent drift from the real config
 * surface: the field table, the chain limit, the switchable classes and the two shipped
 * dictionaries are all compared against the Host's own declarations, and a stale `lib/`
 * copy fails the suite.
 *
 * The i18n half (t42) is pinned structurally: the page must resolve copy through the
 * composition's locale service, not through `navigator`. The last block therefore drives
 * `apply()` with a fake context and asserts what it registers — a slot carrying
 * `locale: 'grok-workflow'` and a dictionary holding both `zh` and `en`.
 */

type Finding = { key: string, params?: Record<string, unknown> }
type Translator = (key: string, params?: Record<string, unknown>) => string

interface Bundle {
  apply(ctx: unknown): void
  inject: string[]
  NS: string
  GROK_WORKFLOW_FIELDS: Array<{ key: string, kind: string, min?: number, max?: number, def?: unknown, group: string }>
  GROK_WORKFLOW_READ_ONLY: string[]
  GROK_WORKFLOW_ROLES: string[]
  GROK_WORKFLOW_SWITCHABLE_CLASSES: string[]
  GROK_WORKFLOW_GROUPS: string[]
  GROK_WORKFLOW_LOCALES: string[]
  GROK_WORKFLOW_CHAIN_LIMIT: number
  GROK_WORKFLOW_ROUTE_INFLIGHT_MIN: number
  GROK_WORKFLOW_ROUTE_INFLIGHT_MAX: number
  GROK_WORKFLOW_DICT: Record<string, Record<string, string>>
  GROK_WORKFLOW_PANEL: PanelBundle
  GROK_WORKFLOW_PROGRESS: ProgressBundle
  GROK_WORKFLOW_INTERNALS: {
    draftOf(value?: Record<string, unknown>): Draft
    validate(draft: Draft): Finding[]
    formatError(error: Finding, t: Translator): string
    opsFor(draft: Draft, value?: Record<string, unknown>): Array<{ op: string, path: string[], value: unknown }>
    resolveNamespace(view: unknown, defaultNs: string): { ns: string, how: string }
    translate(locale: string, key: string, params?: Record<string, unknown>): string
    translator(locale: string): Translator
    activeLocale(locale: unknown): string
    comboWarn(draft: Draft): boolean
    emptyCapWarn(draft: Draft): boolean
    ROLE_ORDER: Record<string, number>
  }
}

/** The task-panel half of the bundle (pinned by test/panel-links.spec.ts as well). */
interface PanelBundle {
  NS: string
  DICT: Record<string, Record<string, string>>
  component: (props: Record<string, unknown>) => unknown
  mount: (ctx: unknown, workspace: unknown, i18n: unknown) => (() => void) | undefined
  translate: Translator
  translator(locale: string): Translator
  memberMode: (child: unknown, identity: unknown, parentSessionId: unknown) => string | undefined
  openableKey: (sessions: unknown, phases: unknown, parentSessionId: unknown) => string
  openableMap: (key: string) => Map<string, string>
  runMode: (data: unknown) => string
  phaseSummary: (members: unknown, t: Translator) => string
  statusKey: Record<string, string>
}

/**
 * The progress-tab half of the bundle (pinned against `src/progress-tab.ts` as well).
 *
 * The browser bundle is hand-written JavaScript, so the only way its fold, its state
 * precedence, its percentage and its provenance ladder can be trusted is to compare them
 * with the typed implementation the unit tests cover — and to render its component.
 */
interface ProgressBundle {
  target: string
  kind: string
  viewId: string
  viewOrder: number
  zoomKey: string
  zoom: { min: number, max: number, step: number }
  eventTypes: string[]
  stages: Array<{ key: string, tokens: string[], edge: boolean }>
  detailFields: string[]
  stateColor: Record<string, string>
  stateKey: Record<string, string>
  css: string
  component: (props: Record<string, unknown>) => unknown
  eventDefinition: Record<string, unknown>
  viewDefinition: Record<string, unknown>
  Builder: new () => {
    empty: unknown
    replace(input: { nodes: Array<Record<string, unknown>> }): Record<string, unknown>
    apply(input: { upserts: Array<Record<string, unknown>> }): Record<string, unknown>
  }
  mount: (
    ctx: unknown,
    services: Record<string, unknown>,
    i18n: Record<string, unknown>,
    status: { set(state: string, message?: string): void },
    workspaceOf: () => unknown,
  ) => (() => void) | undefined
  fold(records: Array<Record<string, unknown>>): ProgressRun[]
  selectActiveRun(runs: ProgressRun[]): ProgressRun | undefined
  nodeState(members: ProgressMember[], ended: boolean): string
  percent(members: ProgressMember[]): { settled: number, declared: number, value: number } | undefined
  deriveTrack(run: ProgressRun | undefined, labelFor: (key: string) => string): ProgressTrack | undefined
  detailFor(sources?: Record<string, unknown>): {
    fields: Array<{ key: string, value?: string, source: string }>
    coordinationRaw?: string
  }
  parseCoordination(text: string | undefined): { fields: Record<string, string>, raw: string } | undefined
  duration(ms: number | undefined): string | undefined
  readZoom(): number
  writeZoom(value: number): void
  createStatus(): { getSnapshot(): string, getMessage(): string | undefined, subscribe(fn: () => void): () => void, set(state: string, message?: string): void }
}

type ProgressMember = {
  seq: number
  label: string
  phase?: string
  childId: string
  order: number
  startedAt?: number
  endedAt?: number
  outcome?: string
}

type ProgressRun = {
  runId: string
  name: string
  anchorSeq: number
  members: ProgressMember[]
  startedAt?: number
  endedAt?: number
  stopReason?: string
}

type ProgressNode = {
  key: string
  kind: string
  label: string
  state: string
  members: ProgressMember[]
  phases: string[]
  derived: boolean
  reason?: string
}

type ProgressTrack = {
  runId: string
  name: string
  ended: boolean
  stopReason?: string
  nodes: ProgressNode[]
  percent?: { settled: number, declared: number, value: number }
}

type Route = { provider?: string, model?: string, maxInFlight?: number }
type Draft = Record<string, unknown> & { roles: Record<string, Route[]> }

/** One rendered element of the stub tree. */
type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

/**
 * The hook cells of the render in progress.
 *
 * `GrokWorkflowPage` is a function of its props *and* its hooks (`useState`,
 * `useSyncExternalStore`, `useMemo`), so a test that wants the detail page — and not only
 * the one-line card summary, which returns before any hook runs — needs the same ordered
 * cells React keeps. Re-rendering replays them, exactly like a real re-render.
 */
type Hooks = { index: number, cells: unknown[], useState(initial: unknown): unknown[] }

let rendering: Hooks | undefined

/** The hook runtime of the render in progress, or an inert one outside a render. */
function hooks(): Hooks {
  if (rendering !== undefined) return rendering
  return {
    index: 0,
    cells: [],
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
  }
}

/**
 * Load the bundle the way the host does: register, then run the factory with a stub React.
 *
 * The stub records elements and delegates the hooks to {@link renderPage}, so a test can
 * render the settings page the way the framework does — including a second pass after a
 * click. `useSyncExternalStore` simply asks the face for its current snapshot: the face is
 * a plain object here, and re-reading it is what makes a state change observable.
 */
function loadBundle(): Bundle {
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
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
      // React calls a function component to get its element, so the stub must too —
      // otherwise a test would only ever see `h(FieldRow, …)`, never the row it renders.
      return typeof type === 'function' ? (type as (props: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => hooks().useState(initial),
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
const { draftOf, validate, formatError, opsFor, resolveNamespace, translate, translator, comboWarn, emptyCapWarn, ROLE_ORDER } = bundle.GROK_WORKFLOW_INTERNALS
const en = translator('en')
const zh = translator('zh')

/** Render findings the way the page does, in one language. */
const messagesIn = (findings: Finding[], t: Translator): string[] => findings.map(finding => formatError(finding, t))

describe('client settings page bundle', () => {
  it('registers under the package id and asks only for real cordis services', () => {
    expect(bundle.NS).toBe('grok-workflow')
    expect(bundle.inject).toEqual(['slots', 'configForms'])
    expect(typeof bundle.apply).toBe('function')
  })

  // T5 slim page: 4 visible FIELDS (grokDefault/mode/maxConcurrency/maxTasks)
  // plus the 5 role chains equal the 9-leaf-key CONFIG_KEYS surface
  // (toolName/roles/synthesis/configVersion are structural, rendered nowhere).
  // Number bounds mirror HARD_LIMITS (100) and the defaults (10); the suite
  // pins all three so a quiet drift fails here instead of in the GUI.
  it('renders the T5 visible keys: 4 fields plus the 5 role chains', () => {
    expect(bundle.GROK_WORKFLOW_FIELDS.map(field => field.key).sort()).toEqual(
      ['grokDefault', 'maxConcurrency', 'maxTasks', 'mode'].sort())
    expect(bundle.GROK_WORKFLOW_READ_ONLY).toEqual([])
    expect([...bundle.GROK_WORKFLOW_FIELDS.map(field => field.key), 'roles'].sort()).toEqual(
      ['grokDefault', 'mode', 'maxConcurrency', 'maxTasks', 'roles'].sort())
  })

  it('keeps the numeric bounds identical to HARD_LIMITS', () => {
    const numeric = new Map(bundle.GROK_WORKFLOW_FIELDS.filter(field => field.kind === 'number').map(field => [field.key, field]))
    const expected: Record<string, [number, number]> = {
      maxConcurrency: [1, HARD_LIMITS.maxConcurrency],
      maxTasks: [1, HARD_LIMITS.maxTasks],
    }
    for (const [key, [min, max]] of Object.entries(expected)) {
      expect({ key, min: numeric.get(key)?.min, max: numeric.get(key)?.max }).toEqual({ key, min, max })
    }
    expect([...numeric.keys()].sort()).toEqual(Object.keys(expected).sort())
    expect(HARD_LIMITS.maxConcurrency).toBe(100)
    expect(HARD_LIMITS.maxTasks).toBe(100)
  })

  it('keeps the numeric defaults identical to src/config.ts', () => {
    const defs = new Map(bundle.GROK_WORKFLOW_FIELDS.map(field => [field.key, field]))
    expect(defs.get('maxConcurrency')?.def).toBe(DEFAULT_MAX_CONCURRENCY)
    expect(defs.get('maxTasks')?.def).toBe(DEFAULT_MAX_TASKS)
    expect(DEFAULT_MAX_CONCURRENCY).toBe(10)
    expect(DEFAULT_MAX_TASKS).toBe(10)
  })

  it('keeps the per-route cap bounds identical to HARD_LIMITS', () => {
    expect(bundle.GROK_WORKFLOW_ROUTE_INFLIGHT_MIN).toBe(HARD_LIMITS.routeInFlight.min)
    expect(bundle.GROK_WORKFLOW_ROUTE_INFLIGHT_MAX).toBe(HARD_LIMITS.routeInFlight.max)
  })

  it('keeps the switchable-class export empty: switchOn is fixed since T4', () => {
    expect(bundle.GROK_WORKFLOW_SWITCHABLE_CLASSES).toEqual([])
    expect([...SWITCHABLE_CLASSES].length).toBeGreaterThan(0)
  })

  it('covers the five T5 roles (supervisor added to the four documented ones)', () => {
    expect(bundle.GROK_WORKFLOW_ROLES).toEqual(['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'])
  })

  it('numbers the role cards in execution order (supervise before summarize)', () => {
    // The script runs supervisor after verify and before synthesis, so the
    // card numbers must read 1-2-3-4-5 in that same order.
    expect(ROLE_ORDER).toEqual({ planner: 1, worker: 2, verifier: 3, supervisor: 4, synthesizer: 5 })
  })

  it('ships lib/client.js byte-identical to the source (no stale bundle)', () => {
    const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
    const built = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    expect(built).toBe(source)
  })
})

describe('client settings page: bilingual copy (t42)', () => {
  it('ships exactly the two locales DSH ships, both complete', () => {
    expect(bundle.GROK_WORKFLOW_LOCALES).toEqual(['zh', 'en'])
    expect(Object.keys(bundle.GROK_WORKFLOW_DICT).sort()).toEqual(['en', 'zh'])
    for (const locale of bundle.GROK_WORKFLOW_LOCALES) {
      const dict = bundle.GROK_WORKFLOW_DICT[locale]
      expect(dict, locale).toBeTypeOf('object')
      expect(Object.keys(dict!).length).toBeGreaterThan(40)
      for (const [key, value] of Object.entries(dict!)) {
        expect(typeof value, `${locale} ${key}`).toBe('string')
        expect(value.length, `${locale} ${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('carries the same key set in both languages (no half-translated dictionary)', () => {
    const zhKeys = Object.keys(bundle.GROK_WORKFLOW_DICT['zh']!).sort()
    const enKeys = Object.keys(bundle.GROK_WORKFLOW_DICT['en']!).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('translates every key the page derives from data (fields, roles, groups)', () => {
    const derived = [
      ...bundle.GROK_WORKFLOW_FIELDS.map(field => `field.${field.key}`),
      ...bundle.GROK_WORKFLOW_ROLES.map(role => `role.${role}`),
      ...bundle.GROK_WORKFLOW_GROUPS.map(group => `group.${group}`),
    ]
    expect(derived.length).toBe(bundle.GROK_WORKFLOW_FIELDS.length + 5 + 3)
    for (const key of derived) {
      for (const locale of bundle.GROK_WORKFLOW_LOCALES) {
        // `translate` returns the key itself when nothing carries it: a missing entry is
        // therefore a failed assertion rather than a silent English fallback.
        expect(translate(locale!, key), `${locale} ${key}`).not.toBe(key)
      }
    }
  })

  // T5: only five error keys survive (number/chain/missing/tooLong/duplicate/badCap);
  // preset/switchOn/synthesis cross-checks died with the removed keys.
  it('translates every validation finding in both languages, including the error keys in the code', () => {
    const findings: Finding[] = [
      { key: 'error.number', params: { key: 'maxConcurrency', min: 1, max: 100 } },
      { key: 'error.chainTooLong', params: { role: 'worker', limit: 50 } },
      { key: 'error.missingModel', params: { role: 'planner', index: 2 } },
      { key: 'error.tooLong', params: { role: 'verifier', index: 1, limit: 120 } },
      { key: 'error.duplicate', params: { role: 'synthesizer', index: 3 } },
      { key: 'error.badCap', params: { role: 'worker', index: 1, min: 1, max: 64 } },
      { key: 'error.badEnum', params: { key: 'mode' } },
    ]
    for (const finding of findings) {
      for (const locale of bundle.GROK_WORKFLOW_LOCALES) {
        const text = formatError(finding, translator(locale!))
        expect(text, `${locale} ${finding.key}`).not.toBe(finding.key)
        expect(text.length, `${locale} ${finding.key}`).toBeGreaterThan(3)
      }
      // Each finding must actually differ between the two languages.
      expect(formatError(finding, zh), finding.key).not.toBe(formatError(finding, en))
    }
  })

  it('renders role ids as localized names and interpolates every parameter', () => {
    const finding: Finding = { key: 'error.chainTooLong', params: { role: 'supervisor', limit: bundle.GROK_WORKFLOW_CHAIN_LIMIT } }
    expect(formatError(finding, zh)).toBe('4 · 监督 备用链最多 50 条，删掉多余的。')
    expect(formatError(finding, en)).toBe('4 · Supervise can keep at most 50 backup routes — remove the extras.')
    // A numeric finding names its field in words, not with the settings key: `maxTasks`
    // is an identifier and reading it inside a Chinese sentence is a leak, not a label.
    const number: Finding = { key: 'error.number', params: { key: 'maxTasks', min: 1, max: 100 } }
    expect(formatError(number, en)).toBe('Splits per job must be a whole number between 1 and 100 — fix the number and save again.')
    expect(formatError(number, zh)).toBe('一次拆几件 得是 1 到 100 之间的整数，改对数字再保存。')
    // A key that is not one of this page's fields is left exactly as it came.
    expect(formatError({ key: 'error.number', params: { key: 'notAField', min: 0, max: 1 } }, en))
      .toContain('notAField must be a whole number')
  })

  it('falls back to English for an unknown locale and to the key for an unknown entry', () => {
    expect(translate('ja', 'action.save')).toBe('Save')
    expect(translate('en', 'no.such.key')).toBe('no.such.key')
  })
})

describe('client settings page: wiring to the DSH locale service (t42)', () => {
  type FakeLocale = {
    bind(ns: string): Translator
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
    getSnapshot(): { active: string, revision: number }
  }

  type FakeWorkspace = { openSession(target: unknown): void }

  function fakeLocale(locale: string): FakeLocale & { bound: string[], registered: Array<{ ns: string, dicts: Record<string, Record<string, string>> }> } {
    const bound: string[] = []
    const registered: Array<{ ns: string, dicts: Record<string, Record<string, string>> }> = []
    return {
      bound,
      registered,
      bind: (ns) => { bound.push(ns); return translator(locale) },
      register: (ns, dicts) => { registered.push({ ns, dicts }); return () => {} },
      getSnapshot: () => ({ active: locale, revision: 0 }),
    }
  }

  /** The minimum context `apply()` touches, recording what the bundle registers. */
  function fakeContext(
    locale?: FakeLocale,
    workspace: FakeWorkspace | undefined = { openSession: () => {} },
    faceOverrides: Record<string, unknown> = {},
  ) {
    const slots: Array<{ options: Record<string, unknown>, component: (props: never) => unknown, disposed: boolean }> = []
    const effectLabels: string[] = []
    /** Disposers the bundle handed to `ctx.inject`, in injection order (locale, workspace). */
    const disposers: Array<() => void> = []
    const face = {
      subscribe: () => () => {},
      getSnapshot: () => ({ status: 'ready', view: { namespaces: [{ ns: 'grok-workflow', value: { roles: {}} }] } }),
      ensure: async () => undefined,
      ...faceOverrides,
    }
    const ctx = {
      effect: (fn: () => unknown, label: string) => {
        effectLabels.push(label)
        const dispose = fn()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      // Cordis' nested-injection seam: the callback runs only when the requested services
      // are present, which is exactly the "optional service" path the bundle relies on.
      inject: (deps: string[], callback: (scope: Record<string, unknown>) => unknown) => {
        effectLabels.push(`inject:${deps.join(',')}`)
        const scope: Record<string, unknown> = {}
        for (const dep of deps) {
          if (dep === 'locale' && locale !== undefined) scope['locale'] = locale
          if (dep === 'uiWorkspace' && workspace !== undefined) scope['uiWorkspace'] = workspace
        }
        if (!deps.every(dep => scope[dep] !== undefined)) return {}
        const dispose = callback(scope)
        if (typeof dispose === 'function') disposers.push(() => { dispose() })
        return dispose === undefined ? {} : dispose
      },
      configForms: {
        describe: () => face,
        whileServed: (_ns: string[], fn: () => unknown) => {
          const dispose = fn()
          return typeof dispose === 'function' ? dispose : () => {}
        },
        get: () => ({ mutate: async () => true }),
      },
      slots: {
        inject: (_name: string, fn: () => unknown) => fn(),
        register: (options: Record<string, unknown>, component: (props: never) => unknown) => {
          const entry = { options, component, disposed: false }
          slots.push(entry)
          return () => { entry.disposed = true }
        },
      },
    }
    /** Registrations still mounted (a locale switch remounts the slot). */
    const live = () => slots.filter(entry => !entry.disposed)
    return { ctx, slots, live, effectLabels, face, disposers }
  }

  it('registers both dictionaries on the locale service under the plugin namespace', () => {
    const locale = fakeLocale('zh')
    const { ctx } = fakeContext(locale)
    bundle.apply(ctx)
    // Two namespaces: the settings page, and the chat task panel that replaces the stock
    // `workflow-run` renderer (see test/panel-links.spec.ts).
    expect(locale.registered).toHaveLength(2)
    expect(locale.registered[0]!.ns).toBe('grok-workflow')
    expect(Object.keys(locale.registered[0]!.dicts).sort()).toEqual(['en', 'zh'])
    // The dictionary handed to the Host is the one the page renders from.
    expect(locale.registered[0]!.dicts).toEqual(bundle.GROK_WORKFLOW_DICT)
    expect(locale.registered[1]!.ns).toBe(bundle.GROK_WORKFLOW_PANEL.NS)
    expect(locale.registered[1]!.dicts).toEqual(bundle.GROK_WORKFLOW_PANEL.DICT)
  })

  it('declares the locale namespace on the slot so the framework seats a live `t`', () => {
    const locale = fakeLocale('zh')
    const { ctx, live } = fakeContext(locale)
    bundle.apply(ctx)
    // The page is mounted once before the locale service arrives and once after: only the
    // second registration survives, and it is the one carrying the namespace.
    // Two live registrations: the settings page and the task panel renderer.
    expect(live()).toHaveLength(2)
    expect(live()[0]!.options['name']).toBe('plugins.item')
    expect(live()[0]!.options['locale']).toBe('grok-workflow')
    expect(typeof live()[0]!.options['label']).toBe('function')
    expect((live()[0]!.options['label'] as () => string)()).toBe('Grok workflow')
  })

  it('re-reads the active language for the card label instead of freezing it at boot', () => {
    const locale = fakeLocale('en')
    const { ctx, live } = fakeContext(locale)
    bundle.apply(ctx)
    const label = live()[0]!.options['label'] as () => string
    // The card title happens to be identical in both languages; the card *summary* is the
    // observable copy, so the assertion runs on the component with the seat it would get.
    const component = live()[0]!.component as (props: Record<string, unknown>) => string
    expect(label()).toBe('Grok workflow')
    expect(component({ view: 'summary', t: translator('en') })).toBe(bundle.GROK_WORKFLOW_DICT['en']!['card.summary'])
    expect(component({ view: 'summary', t: translator('zh') })).toBe(bundle.GROK_WORKFLOW_DICT['zh']!['card.summary'])
  })

  it('renders the card summary in the language the framework seat reports', () => {
    const { ctx, live } = fakeContext(fakeLocale('en'))
    bundle.apply(ctx)
    const component = live()[0]!.component as (props: Record<string, unknown>) => string
    const summaryEn = component({ view: 'summary', t: en })
    const summaryZh = component({ view: 'summary', t: zh })
    expect(summaryEn).toBe(bundle.GROK_WORKFLOW_DICT['en']!['card.summary'])
    expect(summaryZh).toBe(bundle.GROK_WORKFLOW_DICT['zh']!['card.summary'])
    expect(summaryEn).not.toBe(summaryZh)
  })

  it('keeps the page mountable in a composition without a locale service', () => {
    const { ctx, live } = fakeContext(undefined)
    expect(() => bundle.apply(ctx)).not.toThrow()
    // No locale face ⇒ no `locale` option: the renderer throws a SlotAssemblyError for an
    // entry that names a namespace while no face is installed.
    expect(live()).toHaveLength(2)
    expect(live()[0]!.options['locale']).toBeUndefined()
    expect(live()[1]!.options['locale']).toBeUndefined()
    // The task panel shadows the stock `workflow-run` renderer by priority (lowest renders);
    // same key at the same priority would fail the stock plugin's whole boot fiber.
    expect(live()[1]!.options['key']).toBe('workflow-run')
    expect(live()[1]!.options['priority']).toBe(-1)
    const component = live()[0]!.component as (props: Record<string, unknown>) => string
    expect(component({ view: 'summary' })).toBe(bundle.GROK_WORKFLOW_DICT['en']!['card.summary'])
    // The fallback translator still answers every key, so no page copy degrades to a key id.
    expect(component({ view: 'summary', translateOwn: translator('en') })).toBe(bundle.GROK_WORKFLOW_DICT['en']!['card.summary'])
  })

  it('never prints a key id when the seated `t` cannot resolve one', () => {
    const { ctx, live } = fakeContext(fakeLocale('zh'))
    bundle.apply(ctx)
    const component = live()[0]!.component as (props: Record<string, unknown>) => string
    // A seat whose dictionary is missing answers with the key itself — the failure the
    // guard exists for. The page must answer with copy either way.
    const seatless = (key: string, params?: Record<string, unknown>) => (params === undefined ? key : key)
    expect(component({ view: 'summary', t: seatless })).toBe(bundle.GROK_WORKFLOW_DICT['en']!['card.summary'])
    expect(component({ view: 'summary', t: () => '' })).toBe(bundle.GROK_WORKFLOW_DICT['en']!['card.summary'])
  })

  it('drops every registration on unbind instead of rebuilding them in a dead scope', () => {
    const locale = fakeLocale('zh')
    const { ctx, live, slots, disposers } = fakeContext(locale)
    bundle.apply(ctx)
    // The settings page and the task-panel renderer are both mounted, and the `locale`
    // fiber handed back exactly one disposer.
    expect(live()).toHaveLength(2)
    expect(disposers).toHaveLength(2)
    const mounted = slots.length
    const unbind = disposers[0]!

    unbind()
    // Everything is gone …
    expect(live()).toHaveLength(0)
    expect(slots.length).toBe(mounted)
    // … and the disposer mounted nothing: the previous version called `startPages` again
    // from inside it, registering a page and an `ctx.effect` against a fiber the framework
    // had already disposed. That rebuild is the whole bug, so the count may not move.
    expect(slots.every(entry => entry.disposed)).toBe(true)

    // Idempotent: a second unbind (unload after the locale scope left, or two racing
    // disposers) must not throw, re-register or leave anything behind.
    expect(() => unbind()).not.toThrow()
    expect(slots.length).toBe(mounted)
    expect(live()).toHaveLength(0)
  })

  it('lets the plugin disposer win when it runs first, and stays idempotent after that', () => {
    const { ctx, live, slots, disposers } = fakeContext(fakeLocale('zh'))
    const dispose = bundle.apply(ctx) as unknown as () => void
    const mounted = slots.length
    expect(live()).toHaveLength(2)
    dispose()
    expect(live()).toHaveLength(0)
    expect(slots.length).toBe(mounted)
    // The locale scope's own disposer runs later on unload; it is the same routine, so it
    // changes nothing (and must not resurrect the panel through `startPanel`).
    expect(() => disposers[0]!()).not.toThrow()
    expect(slots.length).toBe(mounted)
    expect(live()).toHaveLength(0)
  })
})

/** Every element of a stub tree, depth first. */
function walk(node: unknown, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  const element = node as Element
  if ('type' in element && 'props' in element) {
    out.push(element)
    walk(element.children, out)
  }
  return out
}

/** Every string of a stub tree, in document order. */
function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out)
    return out
  }
  const element = node as Element
  if ('children' in element) texts(element.children, out)
  return out
}

/** Every inline style object of a stub tree, in document order. */
function stylesOf(node: unknown, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  for (const element of walk(node)) {
    const style = element.props['style']
    if (typeof style === 'object' && style !== null) out.push(style as Record<string, unknown>)
  }
  return out
}

describe('client settings page: reading, failure and retry', () => {
  /** The seat the framework installs for namespace `grok-workflow`, in Chinese. */
  const seatZh = (key: string, params?: Record<string, unknown>) => translate('zh', key, params)
  const zhDict = bundle.GROK_WORKFLOW_DICT['zh']!

  /** A face with one fixed snapshot, plus whatever the case under test needs. */
  function faceFor(snapshot: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      ensure: async () => undefined,
      ...extra,
    }
  }

  /**
   * The minimum context `apply()` touches, with a face the test controls.
   *
   * No locale and no workspace are injected: this block is about the settings page alone,
   * and it hands the page its `t` seat directly.
   */
  function fakePageContext(face: Record<string, unknown>) {
    const slots: Array<{ options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown, disposed: boolean }> = []
    const ctx = {
      effect: (fn: () => unknown) => {
        const dispose = fn()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      inject: () => ({}),
      configForms: {
        describe: () => face,
        whileServed: (_ns: string[], fn: () => unknown) => {
          const dispose = fn()
          return typeof dispose === 'function' ? dispose : () => {}
        },
        get: () => ({ mutate: async () => true }),
      },
      slots: {
        inject: (_name: string, fn: () => unknown) => fn(),
        register: (options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown) => {
          const entry = { options, component, disposed: false }
          slots.push(entry)
          return () => { entry.disposed = true }
        },
      },
    }
    return { ctx, slots, live: () => slots.filter(entry => !entry.disposed) }
  }

  /** Register the page and take the component plus the props the plugin manager injects. */
  function mounted(face: Record<string, unknown>) {
    const { ctx, live } = fakePageContext(face)
    bundle.apply(ctx)
    const options = live()[0]!.options
    const injected = (options['inject'] as () => Record<string, unknown>)()
    return {
      component: live()[0]!.component,
      props: { ...injected, t: seatZh } as Record<string, unknown>,
    }
  }

  /**
   * Render the page, keeping its hook cells so a second pass sees what a click changed.
   * @param component - the registered page.
   * @param props - the props to render with.
   * @returns `run()` for a render pass, `click(element)` for a button press.
   */
  function renderPage(component: (props: Record<string, unknown>) => unknown, props: Record<string, unknown>) {
    const cells: unknown[] = []
    const local: Hooks = {
      index: 0,
      cells,
      useState(initial: unknown) {
        const at = this.index++
        if (at >= this.cells.length) this.cells[at] = typeof initial === 'function' ? (initial as () => unknown)() : initial
        const set = (next: unknown) => {
          this.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(this.cells[at]) : next
        }
        return [this.cells[at], set]
      },
    }
    const run = (): unknown => {
      const before = rendering
      rendering = local
      local.index = 0
      try {
        return component(props)
      } finally {
        rendering = before
      }
    }
    return {
      run,
      async click(button: Element) {
        ;(button.props['onClick'] as () => void)()
        // The retry handler resolves the mirror read before it clears its own flag.
        await new Promise(resolve => setTimeout(resolve, 0))
      },
    }
  }

  const READY = {
    status: 'ready',
    view: {
      writable: true,
      namespaces: [{ ns: 'grok-workflow', revision: 1, value: { roles: {}} }],
    },
    error: null,
  }

  it('keeps still reading, read failed and not served as three different pages', () => {
    const cases: Array<[string, Record<string, unknown>, string, boolean]> = [
      // A mirror that has not answered yet: no failure to report and nothing to retry.
      ['loading', { status: 'loading', view: undefined, error: null }, zhDict['status.loading']!, false],
      // The regression this state exists for: a *failed* describe() used to be reported as
      // `status: 'loading'`, so the page said "读取中…" forever with no way to try again.
      ['error', { status: 'idle', view: undefined, error: 'socket closed' }, 'socket closed', true],
      // A good answer that simply does not carry this namespace: the plugin is off, so a
      // retry cannot help and is not offered.
      ['unavailable', { status: 'ready', view: { namespaces: [], writable: true }, error: null }, zhDict['status.unavailable']!, false],
    ]
    for (const [state, snapshot, expected, retry] of cases) {
      const { component, props } = mounted(faceFor(snapshot, { load: async () => undefined }))
      const view = renderPage(component, props)
      const tree = view.run()
      const block = walk(tree).find(element => element.props['data-settings-state'] === state)
      expect(block, state).toBeDefined()
      expect(texts(tree).join('\n'), state).toContain(expected)
      const buttons = walk(tree).filter(element => element.props['data-action'] === 'retry')
      expect(buttons, state).toHaveLength(retry ? 1 : 0)
      if (retry) {
        expect(texts(buttons[0]!).join('')).toBe(zhDict['action.retry'])
        // The reason is part of the message, not a console-only detail.
        expect(texts(tree).join('\n')).toContain(zhDict['status.loadError']!.replace('{message}', 'socket closed'))
      }
      // A failed read never renders the form: there is nothing to edit.
      expect(walk(tree).some(element => element.props['data-field'] === 'maxConcurrency')).toBe(false)
    }
  })

  it('retries the mirror read through the face and shows the form once it answers', async () => {
    let snapshot: Record<string, unknown> = { status: 'idle', view: undefined, error: 'socket closed' }
    let loads = 0
    const { component, props } = mounted(faceFor(snapshot, {
      load: async () => { loads += 1; snapshot = READY },
      getSnapshot: () => snapshot,
    }))
    const view = renderPage(component, props)
    const broken = walk(view.run())
    expect(broken.find(element => element.props['data-settings-state'] === 'error')).toBeDefined()

    await view.click(broken.find(element => element.props['data-action'] === 'retry')!)
    const recovered = walk(view.run())
    expect(loads).toBe(1)
    // The failure is gone and the real page is there — fields, range lines and all.
    expect(recovered.some(element => element.props['data-settings-state'] !== undefined)).toBe(false)
    expect(recovered.some(element => element.props['data-field'] === 'maxConcurrency')).toBe(true)
    expect(texts(view.run()).join('\n')).toContain(zhDict['field.maxConcurrency']!)
  })

  it('offers no retry when the composition has no way to re-read', () => {
    const { component, props } = mounted(faceFor({ status: 'idle', view: undefined, error: 'socket closed' }))
    const tree = renderPage(component, props).run()
    expect(walk(tree).find(element => element.props['data-settings-state'] === 'error')).toBeDefined()
    expect(walk(tree).filter(element => element.props['data-action'] === 'retry')).toHaveLength(0)
  })

  it('renders no key id even when the seat answers every key with the key', () => {
    const { component, props } = mounted(faceFor(READY))
    const tree = renderPage(component, { ...props, t: (key: string) => key }).run()
    const rendered = texts(tree).join('\n')
    // The seat above is the worst case: it answers every key with the key. No dictionary
    // key may survive to the screen — not one of them, in either shipped language.
    for (const key of [...Object.keys(zhDict), ...Object.keys(bundle.GROK_WORKFLOW_DICT['en']!)]) {
      expect(rendered, key).not.toContain(key)
    }
    // The page still says something: the guard falls back to this bundle's own table.
    expect(rendered).toContain('Grok workflow')
  })

  it('colours the live status line through --dsw-alias tokens', () => {
    const { component, props } = mounted(faceFor(READY))
    const backgrounds = stylesOf(renderPage(component, props).run())
      .map(style => style['background'])
      .filter((value): value is string => typeof value === 'string')
    expect(backgrounds.some(value => value.includes('var(--dsw-alias-state-'))).toBe(true)
    // The five states the panel words all come from the token palette, not from a hex.
    for (const token of ['business-primary', 'success-primary', 'error-primary', 'warn-primary', 'idle-primary']) {
      expect(readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')).toContain(`--dsw-alias-state-${token}`)
    }
  })
})

describe('client settings page: draft, validation and path ops', () => {
  it('seeds every field and all four chains from an absent value', () => {
    const draft = draftOf(undefined)
    for (const field of bundle.GROK_WORKFLOW_FIELDS) expect(draft[field.key], field.key).toEqual(field.def)
    for (const role of bundle.GROK_WORKFLOW_ROLES) expect(draft.roles[role]).toEqual([])
  })

  it('survives a non-object roles section instead of crashing the page', () => {
    for (const roles of [null, 'fast', 42, ['planner']]) {
      const draft = draftOf({ roles } as unknown as Record<string, unknown>)
      for (const role of bundle.GROK_WORKFLOW_ROLES) expect(draft.roles[role]).toEqual([])
    }
    expect(validate(draftOf({ roles: null } as unknown as Record<string, unknown>))).toEqual([])
  })

  it('rejects a stored enum value outside the offered options', () => {
    const bad = { ...draftOf(undefined), mode: 'auto' }
    const findings = validate(bad)
    expect(findings.some(finding => finding.key === 'error.badEnum')).toBe(true)
    expect(messagesIn(findings, en).some(text => text.includes('options'))).toBe(true)
    expect(messagesIn(findings, zh).some(text => text.includes('选项'))).toBe(true)
    // A legal value still validates clean.
    expect(validate(draftOf(undefined))).toEqual([])
  })

  it('keeps a chain the Host published and fills the roles the document omits', () => {
    const chain = [{ provider: 'p', model: 'm' }]
    const draft = draftOf({ roles: { planner: chain, worker: undefined } })
    expect(draft.roles.planner).toEqual(chain)
    expect(draft.roles.worker).toEqual([])
    expect(draft.roles.synthesizer).toEqual([])
    // A draft must not alias the published document: editing it cannot mutate the mirror.
    draft.roles['planner']?.push({ model: 'x' })
    expect(chain).toHaveLength(1)
  })

  it('accepts the defaults and reports a numeric field outside its bounds', () => {
    expect(validate(draftOf(undefined))).toEqual([])
    for (const field of bundle.GROK_WORKFLOW_FIELDS) {
      if (field.kind !== 'number') continue
      const low = validate({ ...draftOf(undefined), [field.key]: (field.min ?? 0) - 1 })
      expect(low.map(finding => finding.params?.['key']), `below ${field.key}`).toContain(field.key)
      const high = validate({ ...draftOf(undefined), [field.key]: (field.max ?? 0) + 1 })
      expect(high.map(finding => finding.params?.['key']), `above ${field.key}`).toContain(field.key)
      const fractional = validate({ ...draftOf(undefined), [field.key]: 1.5 })
      expect(fractional.map(finding => finding.params?.['key']), `fractional ${field.key}`).toContain(field.key)
    }
  })

  // T5: the gate preset no longer exists; every default draft validates clean.
  it('has no preset gate: a fresh draft always validates clean', () => {
    expect(validate({ ...draftOf(undefined) })).toEqual([])
  })

  it('bounds a chain at fifty routes and names the offending entry', () => {
    const draft = draftOf(undefined)
    draft.roles.worker = Array.from({ length: 51 }, (_unused, index) => ({ provider: 'p', model: `m${index}` }))
    const tooLong = validate(draft)
    expect(tooLong.some(finding => finding.key === 'error.chainTooLong' && finding.params?.['role'] === 'worker')).toBe(true)
    expect(messagesIn(tooLong, en).some(text => /do the work/i.test(text) && text.includes('50'))).toBe(true)

    const missing = draftOf(undefined)
    missing.roles.verifier = [{ provider: 'p', model: 'm' }, { provider: 'p', model: '  ' }]
    const findings = validate(missing)
    expect(findings).toEqual([{ key: 'error.missingModel', params: { role: 'verifier', index: 2 } }])
    expect(formatError(findings[0]!, zh)).toBe('3 · 检查 第 2 条没有模型，选一个或删掉这一行。')
  })

  it('treats two blank routes as unfinished rows, not duplicates (t32 regression)', () => {
    const draft = draftOf(undefined)
    draft.roles.verifier = [{}, {}, {}, {}]
    const findings = validate(draft)
    expect(findings.filter(finding => finding.key === 'error.duplicate')).toEqual([])
    expect(findings.filter(finding => finding.key === 'error.missingModel')).toHaveLength(4)
  })

  it('rejects a duplicate route and a route without a model beyond the length limit', () => {
    const draft = draftOf(undefined)
    draft.roles.planner = [{ provider: 'p', model: 'm' }, { provider: 'p', model: 'm' }]
    expect(validate(draft).some(finding => finding.key === 'error.duplicate')).toBe(true)

    const long = draftOf(undefined)
    long.roles.planner = [{ provider: 'p', model: 'm'.repeat(121) }]
    const findings = validate(long)
    expect(findings.some(finding => finding.key === 'error.tooLong' && finding.params?.['limit'] === 120)).toBe(true)
    expect(messagesIn(findings, en).some(text => text.includes('120'))).toBe(true)
  })

  it('rejects a per-route cap outside 1..64 and accepts blank for unlimited', () => {
    const bad = draftOf(undefined)
    bad.roles.worker = [{ provider: 'p', model: 'm', maxInFlight: 0 }]
    const findings = validate(bad)
    expect(findings.some(finding => finding.key === 'error.badCap' && finding.params?.['min'] === 1 && finding.params?.['max'] === 64)).toBe(true)
    expect(messagesIn(findings, en).some(text => text.includes('blank for unlimited'))).toBe(true)
    expect(messagesIn(findings, zh).some(text => text.includes('留空就是不限'))).toBe(true)

    const high = draftOf(undefined)
    high.roles.worker = [{ provider: 'p', model: 'm', maxInFlight: 65 }]
    expect(validate(high).some(finding => finding.key === 'error.badCap')).toBe(true)

    const fractional = draftOf(undefined)
    fractional.roles.worker = [{ provider: 'p', model: 'm', maxInFlight: 1.5 }]
    expect(validate(fractional).some(finding => finding.key === 'error.badCap')).toBe(true)

    const blank = draftOf(undefined)
    blank.roles.worker = [{ provider: 'p', model: 'm' }, { provider: 'p', model: 'n', maxInFlight: 2 }]
    expect(validate(blank)).toEqual([])
  })

  it('ships the per-route cap and mode-card copy in both languages', () => {
    for (const locale of bundle.GROK_WORKFLOW_LOCALES) {
      for (const key of ['roles.capPlaceholder', 'roles.capLabel', 'mode.auto.title', 'mode.auto.detail', 'mode.full.title', 'mode.full.detail', 'unit.jobs', 'unit.tasks']) {
        expect(translate(locale!, key), `${locale} ${key}`).not.toBe(key)
      }
    }
    expect(translate('zh', 'roles.capPlaceholder')).not.toBe(translate('en', 'roles.capPlaceholder'))
    expect(translate('zh', 'mode.auto.title')).not.toBe(translate('en', 'mode.auto.title'))
  })

  // T5: `switchOn` is a fixed internal policy since T4 — the page never reads
  // it, so any draft carrying a legacy value still validates (save drops it).
  it('ignores a legacy switchOn value: it is fixed policy, not a page field', () => {
    expect(validate({ ...draftOf(undefined), switchOn: ['rate-limit', 'not-a-class'] })).toEqual([])
    expect(validate({ ...draftOf(undefined), switchOn: ['rate-limit'] })).toEqual([])
  })

  // T5: `synthesis` is fixed (`layered`) since T4 — the page has no union row,
  // so a summarizer chain is always legal on its own.
  it('accepts a summarizer chain without any synthesis cross-check', () => {
    const filled = draftOf(undefined)
    filled.roles.synthesizer = [{ provider: 'p', model: 'm' }]
    expect(validate(filled)).toEqual([])

    // Blank unfinished rows do not count as a chain: they stay a missing-model
    // problem, not a cross-field one.
    const blank = draftOf(undefined)
    blank.roles.synthesizer = [{}]
    const blankFindings = validate(blank)
    expect(blankFindings.some(finding => finding.key === 'error.synthesisChainUnused')).toBe(false)
    expect(blankFindings.some(finding => finding.key === 'error.missingModel')).toBe(true)
  })

  it('sends only what changed, one path op per field and per role', () => {
    const value = draftOf(undefined) as Record<string, unknown>
    expect(opsFor(draftOf(value), value)).toEqual([])

    const draft = draftOf(value)
    draft.maxConcurrency = 5
    draft.roles.planner = [{ provider: 'bifrost-completions', model: 'wb/cn:deepseek-v4.1-flash' }]
    const ops = opsFor(draft, value)
    expect(ops).toEqual([
      { op: 'set', path: ['maxConcurrency'], value: 5 },
      { op: 'set', path: ['roles', 'planner'], value: [{ provider: 'bifrost-completions', model: 'wb/cn:deepseek-v4.1-flash' }] },
    ].sort((a, b) => (String(a.path) < String(b.path) ? -1 : 1)))
  })

  it('never emits a path op for a structural key', () => {
    const value = draftOf(undefined) as Record<string, unknown>
    const draft = draftOf({ ...value, toolName: 'grok_workflow' })
    const paths = opsFor(draft, value).flatMap(op => op.path)
    for (const key of bundle.GROK_WORKFLOW_READ_ONLY) expect(paths).not.toContain(key)
  })

  it('binds to the shipped namespace id when the Host publishes it', () => {
    const view = { namespaces: [{ ns: 'grok-workflow', value: { roles: {}} }] }
    expect(resolveNamespace(view, 'grok-workflow')).toEqual({ ns: 'grok-workflow', how: 'id' })
  })

  it('follows a renamed Loader row instead of silently losing the page (t34 residual)', () => {
    const fullValue = () => ({
      grokDefault: 'off',
      mode: 'triage',
      maxConcurrency: 10,
      maxTasks: 10,
      roles: { planner: [], worker: [], verifier: [], synthesizer: [], supervisor: [] },
    })
    const view = {
      namespaces: [
        { ns: 'agent-default-model', value: { provider: 'p' } },
        { ns: 'renamed-row', value: fullValue() },
      ],
    }
    expect(resolveNamespace(view, 'grok-workflow')).toEqual({ ns: 'renamed-row', how: 'value' })
  })

  it('reports a missing namespace so the page can say why it is absent', () => {
    expect(resolveNamespace({ namespaces: [{ ns: 'other', value: {} }] }, 'grok-workflow')).toEqual({ ns: 'grok-workflow', how: 'missing' })
    expect(resolveNamespace(undefined, 'grok-workflow')).toEqual({ ns: 'grok-workflow', how: 'default' })
    // A bare `roles` value without the five T5 chains and the visible scalars
    // must not capture a page.
    expect(resolveNamespace({ namespaces: [{ ns: 'x', value: { roles: {} } }] }, 'grok-workflow')).toEqual({ ns: 'grok-workflow', how: 'missing' })
  })

  it('warns (not blocks) when a chain has 2+ routes but every cap is blank', () => {
    // Bilingual copy exists and actually differs.
    expect(translate('en', 'warn.emptyCap.title')).not.toBe('warn.emptyCap.title')
    expect(translate('zh', 'warn.emptyCap.title')).not.toBe('warn.emptyCap.title')
    expect(translate('en', 'warn.emptyCap.title')).not.toBe(translate('zh', 'warn.emptyCap.title'))
    expect(translate('en', 'warn.emptyCap.detail')).not.toBe(translate('zh', 'warn.emptyCap.detail'))
    // Single-locale rule: no raw key leakage, both dicts carry the pair.
    for (const locale of ['zh', 'en']) {
      const dict = bundle.GROK_WORKFLOW_DICT[locale]!
      expect(dict['warn.emptyCap.title']!.length).toBeGreaterThan(3)
      expect(dict['warn.emptyCap.detail']!.length).toBeGreaterThan(3)
    }

    const twoBlank = draftOf(undefined)
    twoBlank.roles.worker = [{ provider: 'p', model: 'm1' }, { provider: 'p', model: 'm2' }]
    expect(emptyCapWarn(twoBlank)).toBe(true)
    // Not a validation error: Save stays enabled.
    expect(validate(twoBlank)).toEqual([])

    const oneCapped = draftOf(undefined)
    oneCapped.roles.worker = [{ provider: 'p', model: 'm1' }, { provider: 'p', model: 'm2', maxInFlight: 1 }]
    expect(emptyCapWarn(oneCapped)).toBe(false)

    const single = draftOf(undefined)
    single.roles.worker = [{ provider: 'p', model: 'm1' }]
    expect(emptyCapWarn(single)).toBe(false)

    const unfinished = draftOf(undefined)
    unfinished.roles.worker = [{ provider: 'p', model: 'm1' }, { provider: 'p', model: '' }]
    expect(emptyCapWarn(unfinished)).toBe(false)

    // T5 removed the long-chain-plus-retries heads-up with `maxRetries`: always false.
    expect(comboWarn(draftOf(undefined))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The "进度" conversation tab (group G)

/** One declared row, in the shape `agent-start` produces. */
function progressMember(seq: number, phase: string | undefined, outcome?: string): ProgressMember {
  return {
    seq,
    label: `执行 ${seq}`,
    childId: `child-${seq}`,
    order: seq - 1,
    ...phase === undefined ? {} : { phase },
    ...outcome === undefined ? {} : { outcome },
  }
}

// ---------------------------------------------------------------------------

/**
 * The progress tab, as the browser bundle implements it.
 *
 * Every rule the tab relies on is pinned twice: here against the hand-written JavaScript
 * the host serves, and in `test/progress-tab.spec.ts` against the typed fold in
 * `src/progress-tab.ts`. The bundle cannot import that module (the host serves it
 * verbatim), so parity is a test property, not a build guarantee — which is exactly why
 * the two suites are written against the same fixtures.
 */
describe('client progress tab: registration', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS

  type FakeConversation = {
    events: { register(definition: unknown): () => void }
    views: { register(definition: unknown): () => void }
    binding(sessionId: string): { target(name: string): { getSnapshot(): unknown, subscribe(listener: () => void): () => void } }
  }

  /** A conversation service recording what the tab registers, with one inert session. */
  function fakeConversation(options: { failEvents?: boolean, failViews?: boolean } = {}) {
    const events: unknown[] = []
    const views: unknown[] = []
    const targets: string[] = []
    const conversation: FakeConversation = {
      events: {
        register: (definition) => {
          if (options.failEvents === true) throw new Error('events registry refused')
          events.push(definition)
          return () => { events.length = 0 }
        },
      },
      views: {
        register: (definition) => {
          if (options.failViews === true) throw new Error('views registry refused')
          views.push(definition)
          return () => { views.length = 0 }
        },
      },
      binding: (sessionId) => ({
        target: (name) => {
          targets.push(`${sessionId}:${name}`)
          const snapshot = { runs: [], activeRun: undefined }
          return { getSnapshot: () => snapshot, subscribe: () => () => {} }
        },
      }),
    }
    return { conversation, events, views, targets }
  }

  function fakeSessions(addresses: Record<string, { parentSessionId: string, mode: string }> = {}) {
    return {
      binding: (sessionId: string) => ({ sessionId, key: sessionId }),
      subagentAddress: (childId: string) => addresses[childId],
    }
  }

  function mountProgressOn(
    conversation: FakeConversation,
    sessions: Record<string, unknown>,
    extra: { workspace?: unknown, i18n?: Record<string, unknown> } = {},
  ) {
    const slots: Array<{ options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown, disposed: boolean }> = []
    const ctx = {
      slots: {
        inject: (_name: string, fn: () => unknown) => fn(),
        register: (options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown) => {
          const entry = { options, component, disposed: false }
          slots.push(entry)
          return () => { entry.disposed = true }
        },
      },
    }
    const status = { states: [] as string[], set(state: string) { this.states.push(state) } }
    const i18n = extra.i18n ?? { locale: undefined, t: translator('zh') }
    const dispose = progress.mount(ctx, { uiConversation: conversation, sessions }, i18n, status, () => extra.workspace)
    return {
      slots,
      status,
      dispose,
      live: () => slots.filter((entry) => !entry.disposed),
    }
  }

  it('registers a namespaced view entry after chat and trajectory, without a priority', () => {
    expect(progress.viewId).toBe('grok-progress')
    expect(progress.target).toBe('grok-progress')
    expect(progress.kind.startsWith('grok-progress')).toBe(true)
    // The stock chat is order 0 and the trajectory view order 10, so 20 is "third".
    expect(progress.viewOrder).toBe(20)
    expect(progress.zoomKey).toBe('dsh.gw.progress.zoom')

    const { conversation } = fakeConversation()
    const mounted = mountProgressOn(conversation, fakeSessions())
    const entry = mounted.live()[0]!
    expect(entry.options['name']).toBe('conversation.view')
    expect(entry.options['id']).toBe('grok-progress')
    expect(entry.options['order']).toBe(20)
    // A list slot orders by `order`; `priority` belongs to keyed replacement and must
    // not appear here (it would say "shadow someone" where nothing is shadowed).
    expect('priority' in entry.options).toBe(false)
    expect(typeof entry.options['label']).toBe('function')
    expect(mounted.status.states).toEqual(['mounted'])
  })

  it('defaults to the chat tab: it never selects or pins itself', () => {
    const { conversation } = fakeConversation()
    const mounted = mountProgressOn(conversation, fakeSessions())
    // One registration, and the entry's own props carry no selection: the shell's stored
    // preference (null → chat) decides, which is why no `view`/`selected` key exists.
    expect(mounted.live()).toHaveLength(1)
    for (const key of ['selected', 'default', 'view', 'active']) {
      expect(key in mounted.live()[0]!.options).toBe(false)
    }
  })

  it('keeps the copy on the plugin namespace and declares it only with a locale face', () => {
    const { conversation } = fakeConversation()
    const withoutLocale = mountProgressOn(conversation, fakeSessions())
    expect(withoutLocale.live()[0]!.options['locale']).toBeUndefined()

    const locale = { bind: (ns: string) => { expect(ns).toBe('grok-workflow'); return translator('zh') } }
    const withLocale = mountProgressOn(fakeConversation().conversation, fakeSessions(), { i18n: { locale, t: translator('zh') } })
    expect(withLocale.live()[0]!.options['locale']).toBe('grok-workflow')
    expect((withLocale.live()[0]!.options['label'] as () => string)()).toBe(bundle.GROK_WORKFLOW_DICT['zh']!['view.progress'])
  })

  it('degrades to no tab (with a stated reason) when the registries refuse it', () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
    try {
      const refused = mountProgressOn(fakeConversation({ failViews: true }).conversation, fakeSessions())
      expect(refused.dispose).toBeUndefined()
      expect(refused.live()).toHaveLength(0)
      expect(refused.status.states).toEqual(['failed'])
      expect(warnings.join('\n')).toContain('progress tab could not be registered')

      const refusedEvents = mountProgressOn(fakeConversation({ failEvents: true }).conversation, fakeSessions())
      expect(refusedEvents.live()).toHaveLength(0)
      expect(refusedEvents.status.states).toEqual(['failed'])
      // The tab is the only casualty: the mount fails, it does not throw at the caller.
      expect(() => mountProgressOn(fakeConversation({ failEvents: true }).conversation, fakeSessions())).not.toThrow()
    } finally {
      console.warn = originalWarn
    }
  })

  it('keeps the tab out entirely without a uiConversation service, and the page says so', () => {
    // `apply()` only calls mount from inside `ctx.inject(['uiConversation','sessions'])`,
    // so an absent service never reaches mount at all: the status stays `unmounted`.
    const status = progress.createStatus()
    expect(status.getSnapshot()).toBe('unmounted')
    const seen: string[] = []
    const off = status.subscribe(() => seen.push(status.getSnapshot()))
    status.set('mounted')
    status.set('failed', 'boom')
    off()
    status.set('unmounted')
    expect(seen).toEqual(['mounted', 'failed'])
    // …and the copy for that state exists in both languages.
    for (const locale of ['zh', 'en']) {
      expect(translate(locale, 'status.progressMissing')).not.toBe('status.progressMissing')
      expect(translate(locale, 'status.progressFailed', { message: 'boom' })).toContain('boom')
    }
  })

  it('remounts on a locale change from the disposer, never leaving two tabs', () => {
    const first = mountProgressOn(fakeConversation().conversation, fakeSessions())
    expect(first.live()).toHaveLength(1)
    first.dispose!()
    // The tab's own disposer takes the view registration away and reports the change, so
    // the page can stop claiming a tab that is gone.
    expect(first.slots.every((entry) => entry.disposed)).toBe(true)
    expect(first.status.states).toEqual(['mounted', 'unmounted'])
    expect(first.live()).toHaveLength(0)
    // Idempotent: a second call (unload after the locale scope left) must not throw.
    expect(() => first.dispose!()).not.toThrow()
  })

  it('resolves the target it registered and no other', () => {
    const { conversation, targets } = fakeConversation()
    mountProgressOn(conversation, fakeSessions())
    const options = progress.viewDefinition as { target: string }
    expect(options.target).toBe(progress.target)
    // The injected props carry a snapshot reader bound to that exact target name.
    expect(typeof (progress.eventDefinition as { target: string }).target).toBe('string')
    expect((progress.eventDefinition as { target: string }).target).toBe(progress.target)
    expect(targets).toEqual([])
  })
})

describe('client progress tab: the fold and the five states', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS
  const stateLabels = (key: string) => translate('zh', `progress.state.${key}`)

  function rec(type: string, data: Record<string, unknown>, seq?: number, time?: number) {
    return { type, data, seq, time }
  }

  function trackOf(members: ProgressMember[], stopReason?: string) {
    const run: ProgressRun = {
      runId: 'run-1',
      name: '任务团队',
      anchorSeq: 1,
      members,
      ...stopReason === undefined ? {} : { stopReason },
    }
    const track = progress.deriveTrack(run, (key) => translate('zh', `progress.stage.${key}`))
    expect(track).toBeDefined()
    return track!
  }

  const stage = (track: ProgressTrack, key: string) => {
    const node = track.nodes.find((candidate) => candidate.key === `stage:${key}`)
    expect(node, key).toBeDefined()
    return node!
  }

  it('folds the four recorded events and ignores everything else', () => {
    expect(progress.eventTypes).toEqual([
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
      'tool-workflow/run-end',
    ])
    const runs = progress.fold([
      rec('tool-workflow/run-start', { runId: 'r1', name: '任务团队 · 2 个任务' }, 10, 1_000),
      rec('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11, 1_100),
      rec('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }, 12, 2_100),
      rec('assistant/message', { runId: 'r1', text: 'noise' }, 13),
      rec('tool-workflow/run-end', { runId: 'r1', stopReason: 'completed' }, 14, 2_200),
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]!.runId).toBe('r1')
    expect(runs[0]!.stopReason).toBe('completed')
    expect(runs[0]!.members).toEqual([{
      seq: 1,
      label: '执行',
      phase: '任务 1 · 修复',
      childId: 'c1',
      order: 0,
      startedAt: 1_100,
      endedAt: 2_100,
      outcome: 'completed',
    }])
  })

  it('settles out of order and idempotently, and drops what nobody declared', () => {
    const runs = progress.fold([
      rec('tool-workflow/agent-end', { runId: 'r1', seq: 2, outcome: 'failed' }, 12),
      rec('tool-workflow/agent-start', { runId: 'r1', seq: 2, label: '检查', phase: '任务 1 · 修复', childId: 'c2' }, 11),
      rec('tool-workflow/agent-start', { runId: 'r1', seq: 2, label: '检查', phase: '任务 1 · 修复', childId: 'c2' }, 11),
      rec('tool-workflow/run-start', { runId: 'r1', name: '任务团队' }, 10),
      rec('tool-workflow/agent-end', { runId: 'r1', seq: 7, outcome: 'completed' }, 13),
      rec('tool-workflow/agent-end', { runId: 'ghost', seq: 1, outcome: 'completed' }, 14),
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]!.members).toHaveLength(1)
    expect(runs[0]!.members[0]!.outcome).toBe('failed')
  })

  it('picks the newest run, preferring the one still running', () => {
    const older: ProgressRun = { runId: 'old', name: 'a', anchorSeq: 10, members: [], stopReason: 'completed' }
    const newest: ProgressRun = { runId: 'new', name: 'b', anchorSeq: 30, members: [] }
    expect(progress.selectActiveRun([older, newest])?.runId).toBe('new')
    expect(progress.selectActiveRun([newest, older])?.runId).toBe('new')
    expect(progress.selectActiveRun([])).toBeUndefined()
  })

  it('renders pending, doing, done, blocked and failed from the events alone', () => {
    // pending: nothing declared for this stage.
    const pending = trackOf([])
    expect(stage(pending, 'verify').state).toBe('pending')
    expect(pending.percent).toBeUndefined()
    expect(stateLabels('pending')).toBe('待开始')

    // doing: an open run with an unsettled row.
    const doing = trackOf([progressMember(1, '执行')])
    expect(stage(doing, 'execute').state).toBe('doing')
    expect(doing.ended).toBe(false)
    expect(stateLabels('doing')).toBe('进行中')

    // done: every row settled completed.
    const done = trackOf([progressMember(1, '执行', 'completed')], 'completed')
    expect(stage(done, 'execute').state).toBe('done')
    expect(stage(done, 'end').state).toBe('done')
    expect(stateLabels('done')).toBe('已完成')

    // blocked: derived from a run that ended over a row it never settled, and labelled.
    const blocked = trackOf([progressMember(1, '执行'), progressMember(2, '执行', 'completed')], 'error')
    expect(stage(blocked, 'execute').state).toBe('blocked')
    expect(stage(blocked, 'execute').derived).toBe(true)
    expect(stage(blocked, 'execute').reason).toBe('runEndedUnsettled')
    expect(stateLabels('blocked')).toBe('阻塞')
    // The explanation is real copy in both languages, not a bare key.
    for (const locale of ['zh', 'en']) {
      expect(translate(locale, 'progress.derived.runEndedUnsettled')).not.toBe('progress.derived.runEndedUnsettled')
      expect(translate(locale, 'progress.derived.outcomeUnsettled')).not.toBe('progress.derived.outcomeUnsettled')
    }

    // failed: wins over an unfinished row, and the run's own end agrees.
    const failed = trackOf([progressMember(1, '执行', 'failed'), progressMember(2, '执行')], 'error')
    expect(stage(failed, 'execute').state).toBe('failed')
    expect(stage(failed, 'end').state).toBe('failed')
    expect(stateLabels('failed')).toBe('失败')

    // cancelled: the engine's own word, kept rather than derived.
    const cancelled = trackOf([progressMember(1, '执行', 'cancelled')], 'cancelled')
    expect(stage(cancelled, 'execute').state).toBe('cancelled')
    expect(stage(cancelled, 'end').state).toBe('cancelled')
    expect(stateLabels('cancelled')).toBe('已取消')
  })

  it('reports settled rows over declared rows, and nothing when nothing was declared', () => {
    expect(progress.percent([])).toBeUndefined()
    expect(progress.percent([progressMember(1, 'x', 'completed'), progressMember(2, 'x'), progressMember(3, 'x', 'completed'), progressMember(4, 'x', 'completed')]))
      .toEqual({ settled: 3, declared: 4, value: 75 })
    const track = trackOf([progressMember(1, '执行', 'completed'), progressMember(2, '执行', 'completed')], 'completed')
    expect(track.percent).toEqual({ settled: 2, declared: 2, value: 100 })
    // The copy states what the number is, so no reader mistakes it for a task verdict.
    expect(translate('zh', 'progress.percent', { settled: 3, declared: 4, percent: 75 })).toContain('3/4')
    expect(translate('zh', 'progress.percentHint', { settled: 3, declared: 4 })).toContain('不是任务通过数')
    expect(translate('en', 'progress.percentHint', { settled: 3, declared: 4 })).toContain('not a task verdict')
  })

  it('appends an unmatched phase as a real node between execute and verify, and keeps an unphased row', () => {
    const track = trackOf([
      progressMember(1, '任务 1 · 写文档', 'completed'),
      progressMember(2, '任务 2 · 补测试', 'completed'),
      progressMember(3, undefined, 'completed'),
    ], 'completed')
    const keys = track.nodes.map((node) => node.key)
    expect(keys).toContain('phase:任务 1 · 写文档')
    expect(keys).toContain('phase:')
    // Between `执行` (where the workers run) and `检查` (which reads their evidence).
    expect(keys.indexOf('phase:任务 1 · 写文档')).toBeGreaterThan(keys.indexOf('stage:execute'))
    expect(keys.indexOf('phase:任务 1 · 写文档')).toBeLessThan(keys.indexOf('stage:verify'))
    expect(track.nodes.find((node) => node.key === 'phase:任务 1 · 写文档')!.label).toBe('任务 1 · 写文档')
    // Every declared row appears exactly once across the track.
    const rendered = track.nodes.flatMap((node) => node.members.map((entry) => entry.seq)).sort((a, b) => a - b)
    expect(rendered).toEqual([1, 2, 3])
  })
})

describe('client progress tab: the detail ladder', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS
  const block = ['```grok-coordination', JSON.stringify({
    workCommit: 'abc1234',
    testsRun: ['npx vitest run test/client.spec.ts'],
    results: 'tests pass',
  }, null, 2), '```'].join('\n')

  it('labels every field with its source, strongest first', () => {
    const report = progress.detailFor({ stageDetail: { WORK_COMMIT: 'from-event' }, coordinationText: block })
    const byKey = new Map(report.fields.map((field) => [field.key, field]))
    expect(byKey.get('workCommit')).toEqual({ key: 'workCommit', value: 'from-event', source: 'stage-detail' })
    expect(byKey.get('testsRun')).toEqual({ key: 'testsRun', value: 'npx vitest run test/client.spec.ts', source: 'coordination' })
    expect(byKey.get('results')).toEqual({ key: 'results', value: 'tests pass', source: 'coordination' })
    for (const key of ['changes', 'localRuntimeVerified', 'blockers', 'nextAction']) {
      expect(byKey.get(key)).toEqual({ key, source: 'not-reported' })
    }
    expect(report.fields).toHaveLength(progress.detailFields.length)
    expect(progress.detailFields).toEqual(['workCommit', 'changes', 'testsRun', 'results', 'localRuntimeVerified', 'blockers', 'nextAction'])
    expect(report.coordinationRaw).toContain('abc1234')
  })

  it('degrades to seven "not reported" rows, with the badge copy in both languages', () => {
    const report = progress.detailFor()
    expect(report.fields).toHaveLength(7)
    expect(report.fields.every((field) => field.source === 'not-reported' && field.value === undefined)).toBe(true)
    expect(report.coordinationRaw).toBeUndefined()
    for (const locale of ['zh', 'en']) {
      for (const key of ['progress.source.stageDetail', 'progress.source.coordination', 'progress.source.notReported']) {
        expect(translate(locale, key), `${locale} ${key}`).not.toBe(key)
      }
      // Every field has a real label in both languages, never a key.
      for (const field of progress.detailFields) {
        expect(translate(locale, `progress.field.${field}`), `${locale} ${field}`).not.toBe(`progress.field.${field}`)
      }
      // A missing value renders an em dash, never a blank cell.
      expect(translate(locale, 'progress.none')).toBe('—')
    }
  })

  it('accepts only an explicit coordination block', () => {
    expect(progress.parseCoordination(block)?.fields.workCommit).toBe('abc1234')
    const nested = ['```json', JSON.stringify({ coordination: { blockers: 'none' } }), '```'].join('\n')
    expect(progress.parseCoordination(nested)?.fields).toEqual({ blockers: 'none' })
    expect(progress.parseCoordination(['```json', JSON.stringify({ workCommit: 'a', results: 'b' }), '```'].join('\n'))?.fields.workCommit).toBe('a')
    expect(progress.parseCoordination(['```json', JSON.stringify({ results: 'b' }), '```'].join('\n'))).toBeUndefined()
    // The AGENTS.md labelled form, bare or fenced.
    const labelled = ['WORK_COMMIT: abc1234', 'CHANGES: spine', 'TESTS_RUN: npx vitest run', 'TEST_RESULTS: PASS', 'NEXT_ACTION: screenshot'].join('\n')
    expect(progress.parseCoordination(labelled)?.fields).toEqual({
      workCommit: 'abc1234', changes: 'spine', testsRun: 'npx vitest run', results: 'PASS', nextAction: 'screenshot',
    })
    expect(progress.parseCoordination(['```text', labelled, '```'].join('\n'))?.fields.nextAction).toBe('screenshot')
    expect(progress.parseCoordination('NEXT_ACTION: 继续')).toBeUndefined()
    expect(progress.parseCoordination('CHANGES: a.ts; result: ok')).toBeUndefined()
    expect(progress.parseCoordination(undefined)).toBeUndefined()
  })

  /**
   * Render the tab with the real hook cells, so a click is a real second render.
   * @param props - the props to render with.
   * @returns `run()` for a render pass and `click(element)` for a button press.
   */
  function renderProgress(props: Record<string, unknown>) {
    const cells: unknown[] = []
    const local: Hooks = {
      index: 0,
      cells,
      useState(initial: unknown) {
        const at = this.index++
        if (at >= this.cells.length) this.cells[at] = typeof initial === 'function' ? (initial as () => unknown)() : initial
        const set = (next: unknown) => {
          this.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(this.cells[at]) : next
        }
        return [this.cells[at], set]
      },
    }
    const run = (): unknown => {
      const before = rendering
      rendering = local
      local.index = 0
      try {
        return progress.component(props)
      } finally {
        rendering = before
      }
    }
    return { run }
  }

  /** The run every render-based case below shows: two rows, one phase each. */
  const run: ProgressRun = {
    runId: 'run-42',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      progressMember(1, '执行', 'completed'),
      progressMember(2, '执行', 'completed'),
    ],
    startedAt: 1_000,
  }

  it('opens a node into three sections: header, engine facts and the seven-field report', () => {
    const t = translator('zh')
    const view = renderProgress({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
      detailSources: () => ({ coordinationText: block }),
    })
    const before = walk(view.run())
    expect(before.some((element) => element.props['data-progress-detail'] === true)).toBe(false)

    const execute = before.find((element) => element.props['data-node-key'] === 'stage:execute')!
    ;(execute.props['onClick'] as () => void)()
    const detail = walk(view.run()).find((element) => element.props['data-progress-detail'] === true)!
    expect(detail, 'detail popover').toBeDefined()

    const detailText = texts(detail).join('\n')
    // Section 1: which stage and which state.
    expect(detailText).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.stage.execute'])
    expect(detailText).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.state.done'])
    // Section 2: the engine facts, verbatim.
    expect(detailText).toContain('run-42')
    expect(detailText).toContain('child-1')
    expect(detailText).toContain('completed')
    expect(detailText).toContain('执行')
    // Section 3: seven fields, each with the source it came from.
    const fields = walk(detail).filter((element) => element.props['data-gw-progress-field'] !== undefined)
    expect(fields).toHaveLength(progress.detailFields.length)
    const sources = fields.map((field) => field.props['data-source'])
    expect(sources.filter((source) => source === 'coordination')).toHaveLength(3)
    expect(sources.filter((source) => source === 'not-reported')).toHaveLength(4)
    // A field's value and its badge are both on screen; a missing one is an em dash.
    const workCommit = fields.find((field) => field.props['data-gw-progress-field'] === 'workCommit')!
    expect(texts(workCommit).join(' ')).toContain('abc1234')
    expect(texts(workCommit).join(' ')).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.source.coordination'])
    const nextAction = fields.find((field) => field.props['data-gw-progress-field'] === 'nextAction')!
    expect(texts(nextAction).join(' ')).toContain('—')
    expect(texts(nextAction).join(' ')).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.source.notReported'])
  })

  it('copies the coordination block through the clipboard and reports what happened', async () => {
    const t = translator('zh')
    const copied: string[] = []
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: { clipboard: { writeText: async (text: string) => { copied.push(text) } } },
    })
    try {
      const view = renderProgress({
        t,
        progressT: t,
        useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
        detailSources: () => ({ coordinationText: block }),
      })
      const execute = walk(view.run()).find((element) => element.props['data-node-key'] === 'stage:execute')!
      ;(execute.props['onClick'] as () => void)()
      const open = walk(view.run())
      const copy = open.find((element) => element.props['data-gw-progress-copy'] === true)!
      expect(copy.props['disabled']).toBe(false)
      ;(copy.props['onClick'] as () => void)()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(copied).toHaveLength(1)
      expect(copied[0]).toContain('"workCommit"')
      const after = walk(view.run()).find((element) => element.props['data-gw-progress-copy'] === true)!
      expect(texts(after).join('')).toBe(bundle.GROK_WORKFLOW_DICT['zh']!['progress.detail.copied'])
    } finally {
      if (descriptor === undefined) delete (globalThis as unknown as { navigator?: unknown }).navigator
      else Object.defineProperty(globalThis, 'navigator', descriptor)
    }
  })

  it('disables the copy action when no coordination block exists', () => {
    const t = translator('zh')
    const view = renderProgress({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
    const execute = walk(view.run()).find((element) => element.props['data-node-key'] === 'stage:execute')!
    ;(execute.props['onClick'] as () => void)()
    const copy = walk(view.run()).find((element) => element.props['data-gw-progress-copy'] === true)!
    expect(copy.props['disabled']).toBe(true)
    expect(copy.props['title']).toBe(bundle.GROK_WORKFLOW_DICT['zh']!['progress.detail.noBlock'])
  })

  it('offers "open child session" only for a row the panel rule would open', () => {
    const t = translator('zh')
    const opened: string[] = []
    const view = renderProgress({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
      canOpen: (childId: string) => childId === 'child-1',
      openChild: (childId: string) => { opened.push(childId) },
    })
    const execute = walk(view.run()).find((element) => element.props['data-node-key'] === 'stage:execute')!
    ;(execute.props['onClick'] as () => void)()
    const buttons = walk(view.run()).filter((element) => element.props['data-gw-progress-open'] === true)
    // Two rows in this stage, one of them openable: exactly one button, and it opens it.
    expect(buttons).toHaveLength(1)
    ;(buttons[0]!.props['onClick'] as () => void)()
    expect(opened).toEqual(['child-1'])
  })
})

describe('client progress tab: styles, zoom and empty snapshots', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS

  it('keeps every colour on a --dsw-alias token and the family on a --dsw-font token', () => {
    for (const state of ['doing', 'done', 'failed', 'blocked', 'cancelled', 'pending']) {
      expect(progress.stateColor[state]).toMatch(/^var\(--dsw-alias-/)
    }
    expect(progress.css).toContain('var(--dsw-font-family-sans')
    expect(progress.css).toContain('var(--dsw-font-family-mono')
    // No literal colour and no light-only surface anywhere in the scoped rules.
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(progress.css).not.toMatch(/\brgba?\(/)
    expect(progress.css).not.toMatch(/\bhsla?\(/)
  })

  it('scopes every rule to .gw-progress, with the full-width spine and the vertical narrow layout', () => {
    const rules = progress.css.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('@'))
    for (const rule of rules) expect(rule.trim().startsWith('.gw-progress')).toBe(true)
    // A+C: the spine takes the full width once (7 equal parts, no sideways scroll).
    expect(progress.css).toContain('.gw-progress-track')
    expect(progress.css).toContain('width: 100%')
    expect(progress.css).not.toContain('overflow-x: auto')
    expect(progress.css).not.toContain('scroll-snap-type')
    expect(progress.css).toContain('prefers-reduced-motion: reduce')
    expect(progress.css).toContain('@media (max-width: 720px)')
    expect(progress.css).toContain('@media (max-width: 480px)')
    // The narrow layout is a bottom drawer, not a squeezed popover.
    expect(progress.css).toMatch(/@media \(max-width: 480px\)[\s\S]*position: fixed/)
    // …and the track itself turns vertical under 480px (no sideways scroll).
    expect(progress.css).toMatch(/@media \(max-width: 480px\)[\s\S]*flex-direction: column/)
    // 28px rings, sized from the zoom variable rather than a fixed px font.
    expect(progress.css).toContain('width: 28px')
    expect(progress.css).toContain('--gw-zoom')
  })

  it('zooms through font-size and remembers the factor, clamped to its range', () => {
    expect(progress.zoom).toEqual({ min: 0.8, max: 1.6, step: 0.1 })
    const memory = new Map<string, string>()
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
        setItem: (key: string, value: string) => { memory.set(key, value) },
      },
    })
    try {
      expect(progress.readZoom()).toBe(1)
      progress.writeZoom(1.3)
      expect(memory.get('dsh.gw.progress.zoom')).toBe('1.3')
      expect(progress.readZoom()).toBe(1.3)
      progress.writeZoom(9)
      expect(progress.readZoom()).toBe(1.6)
      progress.writeZoom(0.1)
      expect(progress.readZoom()).toBe(0.8)
      progress.writeZoom(1)
      expect(progress.readZoom()).toBe(1)
    } finally {
      if (descriptor === undefined) delete (globalThis as unknown as { localStorage?: unknown }).localStorage
      else Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('returns the same snapshot object when nothing the track renders changed', () => {
    const builder = new progress.Builder()
    const node = { key: 'k', data: { runId: 'r1', name: 'a', anchorSeq: 1, members: [] } }
    const first = builder.replace({ nodes: [node] })
    // An `apply` with no upserts is the common case (an unrelated session event).
    expect(builder.apply({ upserts: [] })).toBe(first)
    // …and an upsert carrying identical data is not a change either.
    expect(builder.apply({ upserts: [node] })).toBe(first)
    // A real change does produce a new object.
    const changed = builder.apply({ upserts: [{ key: 'k', data: { ...node.data, name: 'b' } }] })
    expect(changed).not.toBe(first)
  })

  it('renders the empty state and the track from a snapshot, without inventing rows', () => {
    const t = translator('zh')
    const empty = progress.component({ t, progressT: t, useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [], activeRun: undefined }) })
    const emptyTree = walk(empty)
    expect(emptyTree.some((element) => element.props['data-progress-empty'] === true)).toBe(true)
    expect(texts(empty).join('\n')).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.empty.title'])
    expect(texts(empty).join('\n')).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.unsettled'])
    // The stylesheet is part of the tab's own tree, so it leaves when the tab unmounts.
    expect(emptyTree.some((element) => element.props['data-gw-progress-css'] === true)).toBe(true)
    expect(emptyTree.filter((element) => element.props['data-gw-progress-node'] === true)).toHaveLength(0)

    const run: ProgressRun = {
      runId: 'r1',
      name: '任务团队',
      anchorSeq: 1,
      members: [progressMember(1, '执行', 'completed')],
      stopReason: 'completed',
    }
    const filled = progress.component({ t, progressT: t, useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }) })
    const nodes = walk(filled).filter((element) => element.props['data-gw-progress-node'] === true)
    expect(nodes).toHaveLength(progress.stages.length)
    expect(nodes.map((node) => node.props['data-state'])).toContain('done')
    expect(texts(filled).join('\n')).toContain('1/1 · 100%')
    // Roving tabindex: exactly one node is in the tab order.
    expect(nodes.filter((node) => node.props['tabIndex'] === 0)).toHaveLength(1)
    // Aria: the track is a labelled group, every node has a name, and at most one
    // segment is expanded (the accordion default follows the run: failed first,
    // else doing, else nothing). A settled run opens nothing.
    expect(walk(filled).some((element) => element.props['role'] === 'group' && element.props['aria-label'] !== undefined)).toBe(true)
    expect(nodes.every((node) => typeof node.props['aria-label'] === 'string' && node.props['aria-label'].includes('·'))).toBe(true)
    expect(nodes.filter((node) => node.props['aria-expanded'] === true)).toHaveLength(0)
  })

  it('survives a snapshot with a missing field instead of throwing', () => {
    const t = translator('zh')
    // The worst a damaged session can hand the tab: a run with no members, a member with
    // no phase, and a snapshot whose activeRun is present but empty.
    const broken = { runs: [{ runId: 'r', name: '', anchorSeq: 0, members: [{ seq: Number.NaN, label: '', childId: '', order: 0 }] }], activeRun: { runId: 'r', name: '', anchorSeq: 0, members: [] } }
    const tree = progress.component({ t, progressT: t, useGrokProgress: (select: (value: unknown) => unknown) => select(broken) })
    expect(walk(tree).some((element) => element.props['data-gw-progress-track'] === true)).toBe(true)
    expect(texts(tree).join('\n')).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.title'])
    // No number is invented for a run that declared nothing.
    expect(texts(tree).join('\n')).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.unsettled'])
  })
})

describe('client progress tab: derived states say where they came from', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS
  const t = translator('zh')

  /** Render one run and hand back its nodes. */
  function nodesOf(run: ProgressRun) {
    const tree = progress.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
    return walk(tree).filter((element) => element.props['data-gw-progress-node'] === true)
  }

  it('gives a blocked node the derived-state tooltip, not a guess', () => {
    const blocked: ProgressRun = {
      runId: 'r',
      name: '任务团队',
      anchorSeq: 1,
      members: [progressMember(1, '执行')],
      stopReason: 'error',
    }
    const execute = nodesOf(blocked).find((node) => node.props['data-node-key'] === 'stage:execute')!
    expect(execute.props['data-state']).toBe('blocked')
    expect(execute.props['data-derived']).toBe('true')
    expect(execute.props['title']).toBe(bundle.GROK_WORKFLOW_DICT['zh']!['progress.derived.runEndedUnsettled'])
    // The label is the state word the reader sees, plus the stage name.
    expect(String(execute.props['aria-label'])).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.state.blocked'])
  })

  it('keeps the engine’s own cancelled word on the node and the end mark', () => {
    const cancelled: ProgressRun = {
      runId: 'r',
      name: '任务团队',
      anchorSeq: 1,
      members: [progressMember(1, '执行', 'cancelled')],
      stopReason: 'cancelled',
    }
    const nodes = nodesOf(cancelled)
    const execute = nodes.find((node) => node.props['data-node-key'] === 'stage:execute')!
    expect(execute.props['data-state']).toBe('cancelled')
    // Not derived: the engine said so.
    expect(execute.props['data-derived']).toBeUndefined()
    expect(String(execute.props['aria-label'])).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.state.cancelled'])
    expect(nodes.find((node) => node.props['data-node-key'] === 'stage:end')!.props['data-state']).toBe('cancelled')
  })

  it('marks a template stage the events never reported instead of borrowing a state', () => {
    const run: ProgressRun = {
      runId: 'r',
      name: '任务团队',
      anchorSeq: 1,
      members: [progressMember(1, '执行', 'completed')],
      stopReason: 'completed',
    }
    const verify = nodesOf(run).find((node) => node.props['data-node-key'] === 'stage:verify')!
    expect(verify.props['data-state']).toBe('pending')
    expect(verify.props['title']).toBe(bundle.GROK_WORKFLOW_DICT['zh']!['progress.notReported'])
  })
})
