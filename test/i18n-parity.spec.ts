import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Both shipped languages must carry every key the UI asks for, and the two dictionaries in
 * the bundle must not drift apart.
 *
 * The bundle holds **two** tables: the plugin's own `DICT` (`t` on the settings page and the
 * progress tab) and `PANEL_DICT`, registered under its own namespace for the re-registered
 * stock run renderer. A key typed into the wrong table renders as the raw key (or the
 * not-reported placeholder), which no type checks and no render test would catch. That is why
 * the checks below are split by scope instead of asserting "the key exists somewhere": a key
 * that moves from one table to the other must fail here, loudly.
 */
const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

type Dict = Record<string, string>
type Dicts = { zh: Dict, en: Dict }

/**
 * The only two-scope seam this file allows: these keys are asked for by the panel renderer,
 * whose translator reads `PANEL_DICT`, and are deliberately absent from the plugin table.
 */
const PANEL_SCOPE_KEYS = ['member.empty', 'member.open', 'phase.empty', 'phase.unassigned', 'run.empty']

/** Load the bundle the way the host does, with a stub React. */
function loadBundle(): {
  dict: Dicts
  panel: Dicts
  stages: string[]
  stateKeys: string[]
  detailFields: string[]
} {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Record<string, any> } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(SOURCE)()
  } finally {
    record.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const react = {
    createElement: () => null,
    useState: (value: unknown) => [value, () => {}],
    useEffect: () => {},
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: () => undefined,
  }
  const bundle = registration!.factory(() => react) as Record<string, any>
  const progress = bundle['GROK_WORKFLOW_PROGRESS']
  return {
    dict: bundle['GROK_WORKFLOW_DICT'],
    panel: bundle['GROK_WORKFLOW_PANEL'].DICT,
    stages: progress.stages.map((stage: { key: string }) => stage.key),
    stateKeys: Object.values(progress.stateKey) as string[],
    detailFields: progress.detailFields as string[],
  }
}

/** Keys one locale has and the other does not, in both directions. */
function asymmetric(left: Dict, right: Dict): { leftOnly: string[], rightOnly: string[] } {
  return {
    leftOnly: Object.keys(left).filter((key) => !(key in right)).sort(),
    rightOnly: Object.keys(right).filter((key) => !(key in left)).sort(),
  }
}

const bundle = loadBundle()

describe('client i18n: both locales carry every key the UI asks for', () => {
  it('reports a key that only one locale has, so the parity check can fail at all', () => {
    // A guard nobody has seen fail is a guard that might compare two empty lists.
    const broken = asymmetric({ 'a.one': '1', 'a.two': '2' }, { 'a.one': '1' })
    expect(broken.leftOnly).toEqual(['a.two'])
    expect(broken.rightOnly).toEqual([])
    expect(asymmetric({}, {})).toEqual({ leftOnly: [], rightOnly: [] })
    // The real tables are the ones under test; this only proves the comparison can fail.
    expect(asymmetric(bundle.dict.zh, bundle.dict.en)).toEqual({ leftOnly: [], rightOnly: [] })
  })

  it('keeps the plugin dictionary symmetric and non-trivial', () => {
    expect(Object.keys(bundle.dict.zh).length).toBeGreaterThan(100)
    expect(asymmetric(bundle.dict.zh, bundle.dict.en)).toEqual({ leftOnly: [], rightOnly: [] })
    // No empty copy in either language: an empty string renders as a blank label, which is
    // the same defect as a missing key but invisible to a key-set comparison.
    const empty = Object.entries(bundle.dict).flatMap(([locale, table]) =>
      Object.entries(table as Dict).filter(([, value]) => String(value).trim() === '').map(([key]) => `${locale}:${key}`))
    expect(empty).toEqual([])
  })

  it('keeps the panel dictionary symmetric, and is exactly what the panel-scope keys land in', () => {
    expect(asymmetric(bundle.panel.zh, bundle.panel.en)).toEqual({ leftOnly: [], rightOnly: [] })
    for (const key of PANEL_SCOPE_KEYS) {
      expect(bundle.panel.zh[key], key).toBeTypeOf('string')
      expect(bundle.panel.en[key], key).toBeTypeOf('string')
      // …and the plugin's own table deliberately does not carry them: the panel translator
      // reads `PANEL_DICT`, so a copy here would be dead weight that hides a move.
      expect(key in bundle.dict.zh, key).toBe(false)
    }
  })

  it('resolves every literal `t(\'…\')` key in the bundle source', () => {
    const literals = new Set<string>()
    for (const match of SOURCE.matchAll(/\b(?:t|progressT)\(\s*'([A-Za-z0-9_.-]+)'/g)) {
      if (match[1] !== undefined) literals.add(match[1])
    }
    expect(literals.size).toBeGreaterThan(50)
    const unresolved = [...literals].filter((key) =>
      !(key in bundle.dict.zh) && !(key in bundle.dict.en) && !(key in bundle.panel.zh) && !(key in bundle.panel.en))
    expect(unresolved).toEqual([])
    // A literal that is missing from the plugin table must be one of the panel-scope keys —
    // anything else means a key was added to the wrong table.
    const panelOnly = [...literals]
      .filter((key) => !(key in bundle.dict.zh) && (key in bundle.panel.zh))
      .sort()
    expect(panelOnly).toEqual([...PANEL_SCOPE_KEYS, 'statusCount.completed'].sort())
  })

  it('resolves the keys built by concatenation and the tables that hold them', () => {
    // Two shapes are assembled at render time and are therefore invisible to the
    // literal scan above: the number-unit suffixes in `NUMBER_UNITS`, and the status
    // line's `${key}.detail`. (The mode cards that used to supply the rest were
    // deleted with the front desk in M3.3, so the guard below names the real
    // survivors instead of counting literals that no longer exist.)
    const unitsStart = SOURCE.indexOf('const NUMBER_UNITS = {')
    expect(unitsStart, 'the unit table must still be readable').toBeGreaterThan(-1)
    const unitsBlock = SOURCE.slice(unitsStart, SOURCE.indexOf('}', unitsStart))
    const unitKeys = [...unitsBlock.matchAll(/'([A-Za-z0-9_.]+)'/g)].map((match) => match[1]!)
    expect(unitKeys.length, 'every number row carries a unit key').toBeGreaterThanOrEqual(6)
    for (const key of unitKeys) expect(key.startsWith('unit.'), key).toBe(true)

    // The status line builds `${key}.detail` from `status.on` / `status.off`, so both
    // the base keys and the details they derive are named here explicitly.
    expect(SOURCE).toContain('`${key}.detail`')
    const statusKeys = ['status.on', 'status.on.detail', 'status.off', 'status.off.detail']

    // Both sets are read by `t(...)`, so a typo there renders as the raw key: assert
    // them in both dictionaries instead of trusting the source.
    for (const key of [...unitKeys, ...statusKeys]) {
      expect(key in bundle.dict.zh, `zh ${key}`).toBe(true)
      expect(key in bundle.dict.en, `en ${key}`).toBe(true)
    }

    // The settings fields the page labels through `t(`field.${key}`)`.
    const fieldKeys = [...SOURCE.matchAll(/'field\.([A-Za-z0-9]+)'\s*:/g)].map((match) => match[1]!)
    expect(fieldKeys.length).toBeGreaterThan(4)
    for (const key of new Set(fieldKeys)) {
      expect(`field.${key}` in bundle.dict.zh, key).toBe(true)
      expect(`field.${key}` in bundle.dict.en, key).toBe(true)
    }
  })

  it('resolves every dynamic expansion the bundle can produce, in the table that consumes it', () => {
    const roles = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer']
    const reasons = ['runEndedUnsettled', 'outcomeUnsettled']
    const sources = ['notReported', 'stageDetail', 'coordination']
    const pluginKeys = [
      ...bundle.stages.map((key) => `progress.stage.${key}`),
      ...bundle.stateKeys,
      ...bundle.detailFields.map((key) => `progress.field.${key}`),
      ...roles.map((role) => `role.${role}`),
      ...reasons.map((reason) => `progress.derived.${reason}`),
      ...sources.map((source) => `progress.source.${source}`),
    ]
    expect(bundle.stages.length).toBeGreaterThan(0)
    expect(pluginKeys.length).toBeGreaterThan(20)
    const missing = pluginKeys.filter((key) => !(key in bundle.dict.zh) || !(key in bundle.dict.en))
    expect(missing).toEqual([])

    const panelKeys = ['running', 'completed', 'failed', 'cancelled', 'interrupted', 'unknown']
      .flatMap((status) => [`status.${status}`, `statusCount.${status}`])
    expect(panelKeys.filter((key) => !(key in bundle.panel.zh) || !(key in bundle.panel.en))).toEqual([])
  })
})
