import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG_KEYS, HARD_LIMITS, SWITCHABLE_CLASSES } from '../src/config.js'

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
  GROK_WORKFLOW_DICT: Record<string, Record<string, string>>
  GROK_WORKFLOW_INTERNALS: {
    draftOf(value?: Record<string, unknown>): Draft
    validate(draft: Draft): Finding[]
    formatError(error: Finding, t: Translator): string
    opsFor(draft: Draft, value?: Record<string, unknown>): Array<{ op: string, path: string[], value: unknown }>
    resolveNamespace(view: unknown, defaultNs: string): { ns: string, how: string }
    translate(locale: string, key: string, params?: Record<string, unknown>): string
    translator(locale: string): Translator
    activeLocale(locale: unknown): string
  }
}

type Route = { provider?: string, model?: string }
type Draft = Record<string, unknown> & { roles: Record<string, Route[]> }

/** Load the bundle the way the host does: register, then run the factory with a stub React. */
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
    createElement: () => null,
    useState: () => [],
    useEffect: () => {},
    useMemo: () => [],
    useSyncExternalStore: () => undefined,
  }
  return registration!.factory((id) => {
    if (id === 'react') return stubReact
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

const bundle = loadBundle()
const { draftOf, validate, formatError, opsFor, resolveNamespace, translate, translator } = bundle.GROK_WORKFLOW_INTERNALS
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

  it('renders every config key exactly once, editable or read-only', () => {
    const rendered = [
      ...bundle.GROK_WORKFLOW_FIELDS.map(field => field.key),
      'roles',
      ...bundle.GROK_WORKFLOW_READ_ONLY,
    ]
    expect([...rendered].sort()).toEqual([...CONFIG_KEYS].sort())
    expect(new Set(rendered).size).toBe(rendered.length)
  })

  it('keeps the numeric bounds identical to HARD_LIMITS', () => {
    const numeric = new Map(bundle.GROK_WORKFLOW_FIELDS.filter(field => field.kind === 'number').map(field => [field.key, field]))
    const expected: Record<string, [number, number]> = {
      historyTurns: [0, HARD_LIMITS.historyTurns],
      historyChars: [0, HARD_LIMITS.historyChars],
      maxQueuedMessages: [0, HARD_LIMITS.maxQueuedMessages],
      maxConcurrency: [1, HARD_LIMITS.maxConcurrency],
      maxRetries: [0, HARD_LIMITS.maxRetries],
      maxTasks: [1, HARD_LIMITS.maxTasks],
      timeoutMs: [1_000, HARD_LIMITS.timeoutMs],
      maxActiveRuns: [1, HARD_LIMITS.maxActiveRuns],
      maxActiveRunsTotal: [1, HARD_LIMITS.maxActiveRunsTotal],
      recordLimit: [0, HARD_LIMITS.recordEntries],
    }
    for (const [key, [min, max]] of Object.entries(expected)) {
      expect({ key, min: numeric.get(key)?.min, max: numeric.get(key)?.max }).toEqual({ key, min, max })
    }
    expect([...numeric.keys()].sort()).toEqual(Object.keys(expected).sort())
  })

  it('offers exactly the failure classes the Host accepts in switchOn', () => {
    expect(bundle.GROK_WORKFLOW_SWITCHABLE_CLASSES).toEqual([...SWITCHABLE_CLASSES])
  })

  it('covers the four documented roles', () => {
    expect(bundle.GROK_WORKFLOW_ROLES).toEqual(['planner', 'worker', 'verifier', 'synthesizer'])
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

  it('translates every key the page derives from data (fields, read-only rows, roles, groups)', () => {
    const derived = [
      ...bundle.GROK_WORKFLOW_FIELDS.map(field => `field.${field.key}`),
      ...bundle.GROK_WORKFLOW_READ_ONLY.flatMap(key => [`readonly.${key}`, `readonlyValue.${key}`]),
      ...bundle.GROK_WORKFLOW_ROLES.map(role => `role.${role}`),
      ...bundle.GROK_WORKFLOW_GROUPS.map(group => `group.${group}`),
    ]
    expect(derived.length).toBe(bundle.GROK_WORKFLOW_FIELDS.length + 8 + 4 + 5)
    for (const key of derived) {
      for (const locale of bundle.GROK_WORKFLOW_LOCALES) {
        // `translate` returns the key itself when nothing carries it: a missing entry is
        // therefore a failed assertion rather than a silent English fallback.
        expect(translate(locale!, key), `${locale} ${key}`).not.toBe(key)
      }
    }
  })

  it('translates every validation finding in both languages, including the error keys in the code', () => {
    const findings: Finding[] = [
      { key: 'error.number', params: { key: 'maxConcurrency', min: 1, max: 6 } },
      { key: 'error.presetNeeded' },
      { key: 'error.chainTooLong', params: { role: 'worker', limit: 3 } },
      { key: 'error.missingModel', params: { role: 'planner', index: 2 } },
      { key: 'error.tooLong', params: { role: 'verifier', index: 1, limit: 120 } },
      { key: 'error.duplicate', params: { role: 'synthesizer', index: 3 } },
      { key: 'error.unknownClass', params: { entry: 'not-a-class' } },
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
    const finding: Finding = { key: 'error.chainTooLong', params: { role: 'worker', limit: bundle.GROK_WORKFLOW_CHAIN_LIMIT } }
    expect(formatError(finding, zh)).toBe('执行者 备用链最多 3 条')
    expect(formatError(finding, en)).toBe('worker may have at most 3 routes')
    expect(formatError({ key: 'error.number', params: { key: 'timeoutMs', min: 1000, max: 86400000 } }, en))
      .toBe('timeoutMs must be an integer between 1000 and 86400000')
  })

  it('falls back to English for an unknown locale and to the key for an unknown entry', () => {
    expect(translate('ja', 'action.save')).toBe('Save')
    expect(translate('en', 'no.such.key')).toBe('no.such.key')
    // An unknown placeholder stays literal, exactly like the locale plugin's own translate.
    expect(translate('en', 'error.unknownClass', { other: 'x' })).toBe('switchOn does not accept {entry}')
  })
})

describe('client settings page: wiring to the DSH locale service (t42)', () => {
  type FakeLocale = {
    bind(ns: string): Translator
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
    getSnapshot(): { active: string, revision: number }
  }

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
  function fakeContext(locale?: FakeLocale) {
    const slots: Array<{ options: Record<string, unknown>, component: (props: never) => unknown, disposed: boolean }> = []
    const effectLabels: string[] = []
    const face = {
      subscribe: () => () => {},
      getSnapshot: () => ({ status: 'ready', view: { namespaces: [{ ns: 'grok-workflow', value: { roles: {}, switchOn: [] } }] } }),
      ensure: async () => undefined,
    }
    const ctx = {
      effect: (fn: () => unknown, label: string) => {
        effectLabels.push(label)
        const dispose = fn()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      // Cordis' nested-injection seam: the callback runs only when the requested services
      // are present, which is exactly the "optional service" path the bundle relies on.
      inject: (deps: string[], callback: (scope: { locale?: FakeLocale }) => unknown) => {
        effectLabels.push(`inject:${deps.join(',')}`)
        return locale === undefined ? {} : callback({ locale })
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
    return { ctx, slots, live, effectLabels, face }
  }

  it('registers both dictionaries on the locale service under the plugin namespace', () => {
    const locale = fakeLocale('zh')
    const { ctx } = fakeContext(locale)
    bundle.apply(ctx)
    expect(locale.registered).toHaveLength(1)
    expect(locale.registered[0]!.ns).toBe('grok-workflow')
    expect(Object.keys(locale.registered[0]!.dicts).sort()).toEqual(['en', 'zh'])
    // The dictionary handed to the Host is the one the page renders from.
    expect(locale.registered[0]!.dicts).toEqual(bundle.GROK_WORKFLOW_DICT)
  })

  it('declares the locale namespace on the slot so the framework seats a live `t`', () => {
    const locale = fakeLocale('zh')
    const { ctx, live } = fakeContext(locale)
    bundle.apply(ctx)
    // The page is mounted once before the locale service arrives and once after: only the
    // second registration survives, and it is the one carrying the namespace.
    expect(live()).toHaveLength(1)
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
    expect(live()).toHaveLength(1)
    expect(live()[0]!.options['locale']).toBeUndefined()
    const component = live()[0]!.component as (props: Record<string, unknown>) => string
    expect(component({ view: 'summary' })).toBe(bundle.GROK_WORKFLOW_DICT['en']!['card.summary'])
    // The fallback translator still answers every key, so no page copy degrades to a key id.
    expect(component({ view: 'summary', translateOwn: translator('en') })).toBe(bundle.GROK_WORKFLOW_DICT['en']!['card.summary'])
  })
})

describe('client settings page: draft, validation and path ops', () => {
  it('seeds every field and all four chains from an absent value', () => {
    const draft = draftOf(undefined)
    for (const field of bundle.GROK_WORKFLOW_FIELDS) expect(draft[field.key], field.key).toEqual(field.def)
    for (const role of bundle.GROK_WORKFLOW_ROLES) expect(draft.roles[role]).toEqual([])
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

  it('requires a preset name when the gate scope is preset', () => {
    const findings = validate({ ...draftOf(undefined), gateScope: 'preset', gatePreset: '   ' })
    expect(findings.map(finding => finding.key)).toContain('error.presetNeeded')
    expect(validate({ ...draftOf(undefined), gateScope: 'preset', gatePreset: 'standard' })).toEqual([])
  })

  it('bounds a chain at three routes and names the offending entry', () => {
    const draft = draftOf(undefined)
    draft.roles.worker = [1, 2, 3, 4].map(index => ({ provider: 'p', model: `m${index}` }))
    const tooLong = validate(draft)
    expect(tooLong.some(finding => finding.key === 'error.chainTooLong' && finding.params?.['role'] === 'worker')).toBe(true)
    expect(messagesIn(tooLong, en).some(text => text.includes('worker') && text.includes('3'))).toBe(true)

    const missing = draftOf(undefined)
    missing.roles.verifier = [{ provider: 'p', model: 'm' }, { provider: 'p', model: '  ' }]
    const findings = validate(missing)
    expect(findings).toEqual([{ key: 'error.missingModel', params: { role: 'verifier', index: 2 } }])
    expect(formatError(findings[0]!, zh)).toBe('验证者 第 2 条缺少 model')
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

  it('refuses a switchOn class the Host does not accept', () => {
    const findings = validate({ ...draftOf(undefined), switchOn: ['rate-limit', 'not-a-class'] })
    expect(findings).toEqual([{ key: 'error.unknownClass', params: { entry: 'not-a-class' } }])
    expect(validate({ ...draftOf(undefined), switchOn: ['rate-limit'] })).toEqual([])
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
    const view = { namespaces: [{ ns: 'grok-workflow', value: { roles: {}, switchOn: [] } }] }
    expect(resolveNamespace(view, 'grok-workflow')).toEqual({ ns: 'grok-workflow', how: 'id' })
  })

  it('follows a renamed Loader row instead of silently losing the page (t34 residual)', () => {
    const view = {
      namespaces: [
        { ns: 'agent-default-model', value: { provider: 'p' } },
        { ns: 'renamed-row', value: { roles: { planner: [] }, switchOn: ['rate-limit'] } },
      ],
    }
    expect(resolveNamespace(view, 'grok-workflow')).toEqual({ ns: 'renamed-row', how: 'value' })
  })

  it('reports a missing namespace so the page can say why it is absent', () => {
    expect(resolveNamespace({ namespaces: [{ ns: 'other', value: {} }] }, 'grok-workflow')).toEqual({ ns: 'grok-workflow', how: 'missing' })
    expect(resolveNamespace(undefined, 'grok-workflow')).toEqual({ ns: 'grok-workflow', how: 'default' })
    // Half the signature is not this plugin: `roles` alone must not capture a page.
    expect(resolveNamespace({ namespaces: [{ ns: 'x', value: { roles: {} } }] }, 'grok-workflow')).toEqual({ ns: 'grok-workflow', how: 'missing' })
  })
})
