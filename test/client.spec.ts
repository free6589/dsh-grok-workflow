import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG_KEYS, HARD_LIMITS, SWITCHABLE_CLASSES } from '../src/config.js'

/**
 * The browser settings page is hand-written JavaScript (the host serves it verbatim in
 * its `__ModuleLoader__` format), so nothing about it is type-checked. These tests are
 * the only thing standing between the page and a silent drift from the real config
 * surface: the field table, the chain limit and the switchable classes are all compared
 * against the Host's own declarations, and a stale `lib/` copy fails the suite.
 */

interface Bundle {
  apply(ctx: unknown): void
  inject: string[]
  NS: string
  GROK_WORKFLOW_FIELDS: Array<{ key: string, kind: string, min?: number, max?: number, def?: unknown }>
  GROK_WORKFLOW_READ_ONLY: string[]
  GROK_WORKFLOW_ROLES: string[]
  GROK_WORKFLOW_SWITCHABLE_CLASSES: string[]
  GROK_WORKFLOW_READ_ONLY_VALUES: Record<string, string>
  GROK_WORKFLOW_INTERNALS: {
    draftOf(value?: Record<string, unknown>): Draft
    validate(draft: Draft): string[]
    opsFor(draft: Draft, value?: Record<string, unknown>): Array<{ op: string, path: string[], value: unknown }>
    resolveNamespace(view: unknown, defaultNs: string): { ns: string, how: string }
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

describe('client settings page bundle', () => {
  it('registers under the package id and asks only for real cordis services', () => {
    const bundle = loadBundle()
    expect(bundle.NS).toBe('grok-workflow')
    expect(bundle.inject).toEqual(['slots', 'configForms'])
    expect(typeof bundle.apply).toBe('function')
  })

  it('renders every config key exactly once, editable or read-only', () => {
    const bundle = loadBundle()
    const rendered = [
      ...bundle.GROK_WORKFLOW_FIELDS.map(field => field.key),
      'roles',
      ...bundle.GROK_WORKFLOW_READ_ONLY,
    ]
    expect([...rendered].sort()).toEqual([...CONFIG_KEYS].sort())
    expect(new Set(rendered).size).toBe(rendered.length)
  })

  it('keeps the numeric bounds identical to HARD_LIMITS', () => {
    const bundle = loadBundle()
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
      recordLimit: [0, HARD_LIMITS.recordEntries],
    }
    for (const [key, [min, max]] of Object.entries(expected)) {
      expect({ key, min: numeric.get(key)?.min, max: numeric.get(key)?.max }).toEqual({ key, min, max })
    }
    expect([...numeric.keys()].sort()).toEqual(Object.keys(expected).sort())
  })

  it('offers exactly the failure classes the Host accepts in switchOn', () => {
    const bundle = loadBundle()
    expect(bundle.GROK_WORKFLOW_SWITCHABLE_CLASSES).toEqual([...SWITCHABLE_CLASSES])
  })

  it('covers the four documented roles', () => {
    expect(loadBundle().GROK_WORKFLOW_ROLES).toEqual(['planner', 'worker', 'verifier', 'synthesizer'])
  })

  it('labels the four structural keys instead of printing undefined', () => {
    const bundle = loadBundle()
    for (const key of bundle.GROK_WORKFLOW_READ_ONLY) {
      const text = String(bundle.GROK_WORKFLOW_READ_ONLY_VALUES[key] ?? '')
      expect(text, `read-only value for ${key}`).not.toBe('')
      expect(text.length).toBeGreaterThan(3)
      expect(text).not.toBe('undefined')
    }
    expect(Object.keys(bundle.GROK_WORKFLOW_READ_ONLY_VALUES).sort()).toEqual([...bundle.GROK_WORKFLOW_READ_ONLY].sort())
  })

  it('ships lib/client.js byte-identical to the source (no stale bundle)', () => {
    const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
    const built = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    expect(built).toBe(source)
  })
})

describe('client settings page: draft, validation and path ops', () => {
  const bundle = loadBundle()
  const { draftOf, validate, opsFor, resolveNamespace } = bundle.GROK_WORKFLOW_INTERNALS

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
      expect(low.some(text => text.includes(field.key)), `below ${field.key}`).toBe(true)
      const high = validate({ ...draftOf(undefined), [field.key]: (field.max ?? 0) + 1 })
      expect(high.some(text => text.includes(field.key)), `above ${field.key}`).toBe(true)
      const fractional = validate({ ...draftOf(undefined), [field.key]: 1.5 })
      expect(fractional.some(text => text.includes(field.key)), `fractional ${field.key}`).toBe(true)
    }
  })

  it('requires a preset name when the gate scope is preset', () => {
    const errors = validate({ ...draftOf(undefined), gateScope: 'preset', gatePreset: '   ' })
    expect(errors.some(text => text.includes('gatePreset'))).toBe(true)
    expect(validate({ ...draftOf(undefined), gateScope: 'preset', gatePreset: 'standard' })).toEqual([])
  })

  it('bounds a chain at three routes and names the offending entry', () => {
    const draft = draftOf(undefined)
    draft.roles.worker = [1, 2, 3, 4].map(index => ({ provider: 'p', model: `m${index}` }))
    expect(validate(draft).some(text => text.includes('worker') && text.includes('3'))).toBe(true)

    const missing = draftOf(undefined)
    missing.roles.verifier = [{ provider: 'p', model: 'm' }, { provider: 'p', model: '  ' }]
    const errors = validate(missing)
    expect(errors.some(text => text.includes('verifier') && text.includes('2') && text.includes('model'))).toBe(true)
    expect(errors.length).toBe(1)
  })

  it('treats two blank routes as unfinished rows, not duplicates (t32 regression)', () => {
    const draft = draftOf(undefined)
    draft.roles.verifier = [{}, {}, {}, {}]
    const errors = validate(draft)
    expect(errors.filter(text => text.includes('重复'))).toEqual([])
    expect(errors.filter(text => text.includes('model'))).toHaveLength(4)
  })

  it('rejects a duplicate route and a route without a model beyond the length limit', () => {
    const draft = draftOf(undefined)
    draft.roles.planner = [{ provider: 'p', model: 'm' }, { provider: 'p', model: 'm' }]
    expect(validate(draft).some(text => text.includes('重复'))).toBe(true)

    const long = draftOf(undefined)
    long.roles.planner = [{ provider: 'p', model: 'm'.repeat(121) }]
    expect(validate(long).some(text => text.includes('120'))).toBe(true)
  })

  it('refuses a switchOn class the Host does not accept', () => {
    const errors = validate({ ...draftOf(undefined), switchOn: ['rate-limit', 'not-a-class'] })
    expect(errors.some(text => text.includes('not-a-class'))).toBe(true)
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
