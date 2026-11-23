import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CHILD_TIMEOUT_MS, DEFAULT_ITERATE_INTERVAL_MIN, DEFAULT_ITERATE_TEMPLATE, DEFAULT_LOOP_FAIL_STREAK, DEFAULT_LOOP_INTERVAL_MIN, DEFAULT_LOOP_MAX_ROUNDS, DEFAULT_MAX_CONCURRENCY, DEFAULT_MAX_TASKS, DEFAULT_REPLAN, DEFAULT_TIMEOUT_MS, HARD_LIMITS, SWITCHABLE_CLASSES } from '../src/config.js'
import { ITERATE_ROUTE_PATH, ITERATE_TASK_TITLE, LOOP_ROUTE_PATH, LOOP_TASK_TITLE, LOOP_TOOL_NAME, createLoopService, loopPolicyFromConfig } from '../src/loop.js'
import { createLoopTool, dispatchIterateAction, handleLoopRoute } from '../src/loop-surface.js'
import { Session as SessionClass } from '@deepseek-ai/dsh-session'
import { readModeRecord } from '../src/mode.js'
import { handleModeRoute, MODE_ROUTE_PATH as CORE_MODE_ROUTE_PATH } from '../src/mode-surface.js'

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
  GROK_WORKFLOW_LOOP: LoopSwitchBundle
  GROK_WORKFLOW_ITERATE: LoopSwitchBundle
  GROK_WORKFLOW_MODE: ModeSwitchBundle
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
  eventTypes: string[]
  stages: Array<{ key: string, tokens: string[], edge: boolean }>
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
  duration(ms: number | undefined): string | undefined
  createStatus(): { getSnapshot(): string, getMessage(): string | undefined, subscribe(fn: () => void): () => void, set(state: string, message?: string): void }
  recoveredFailures(members: ProgressMember[]): Set<number>
  currentFailureCount(members: ProgressMember[]): number
  settleParts(members: ProgressMember[], t: Translator): Array<Record<string, unknown>>
  measureWires(root: unknown): { paths: Array<Record<string, unknown>> }
}

/** One answer from the loop route, in the switch's own vocabulary. */
type LoopAnswer =
  | { ok: true, loop: LoopSnapshotLike }
  | { ok: false, code: string, error: string }

/** The fields of a `LoopSnapshot` (`src/loop.ts`) the switch actually reads. */
type LoopSnapshotLike = {
  open?: boolean
  sessionId?: string
  taskId?: string
  intervalMinutes?: number
  rounds?: number
  nextAt?: string
}

/** One answer from the mode route: the record as written, or the stated refusal. */
type ModeAnswer =
  | { ok: true, mode: { enabled: boolean, setBy?: string, turn?: number, workflowMode?: string } }
  | { ok: false, code: string, error: string }

/**
 * The workflow switch (`GROK_WORKFLOW_MODE`): the `/grok on|off` toggle as a dock button.
 *
 * It is not a heartbeat, so it has no interval and no `open`/`close` pair: `set(true)` is
 * `/grok on`, `set(false)` is `/grok off`, and both write the one session record the
 * slash command and the gate already share.
 */
interface ModeSwitchBundle {
  routePath: string
  switchId: string
  switchOrder: number
  dataAttr: string
  actions: string[]
  component: (props: Record<string, unknown>) => unknown
  mount: (ctx: unknown, i18n: unknown) => (() => void) | undefined
  send: (body: Record<string, unknown>, fetchImpl?: unknown) => Promise<ModeAnswer>
  read: (sessionId: string, fetchImpl?: unknown) => Promise<ModeAnswer>
  set: (sessionId: string, enabled: boolean, fetchImpl?: unknown) => Promise<ModeAnswer>
  parsePayload: (payload: unknown, status: number) => ModeAnswer
  text: (t: Translator, state: Record<string, unknown>) => string
  failureText: (t: Translator, error: unknown) => string
  url: () => string
}

/**
 * The composer tool-row switch (`GROK_WORKFLOW_LOOP`).
 *
 * Pinned against the Host here rather than trusted: this half of the bundle is hand-written
 * JavaScript, so the only thing that keeps its route, its actions and its authorization
 * honest is a test that compares them with `src/loop.ts` and with the real `grok_loop` tool.
 */
interface LoopSwitchBundle {
  routePath: string
  switchId: string
  switchOrder: number
  actions: string[]
  component: (props: Record<string, unknown>) => unknown
  mount: (ctx: unknown, i18n: { locale?: unknown }) => unknown
  send: (body: Record<string, unknown>, fetchImpl?: unknown) => Promise<LoopAnswer>
  read: (sessionId: string, fetchImpl?: unknown) => Promise<LoopAnswer>
  open: (sessionId: string, fetchImpl?: unknown) => Promise<LoopAnswer>
  close: (sessionId: string, fetchImpl?: unknown) => Promise<LoopAnswer>
  parsePayload: (payload: unknown, status: number) => LoopAnswer
  text: (t: Translator, state: Record<string, unknown>) => string
  failureText: (t: Translator, code?: string, error?: string) => string
  url: () => string
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
  guardian?: {
    started: boolean
    armed: boolean
    budgetMs: number
    ended: boolean
    cancelled: boolean
    findings: Array<{ seq: number, label: string, signal: 'timeout' | 'heartbeat-loss', action: 'cancel-run' | 'rescue' | 'observe', reason: string, atMs?: number }>
  }
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
  /** Rows that ran under this stage but render as their own plan-task nodes. */
  evidence: ProgressMember[]
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
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
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

  // T5 slim page plus the four repeat-run keys, the two self-iteration keys,
  // the Q8 guardian model, childTimeoutMs and the mid-run replan switch:
  // 14 visible FIELDS
  // (grokDefault/mode/maxConcurrency/maxTasks/timeoutMs/childTimeoutMs,
  // replan, the four loop keys, iterateIntervalMin, the iterateTemplate textarea and
  // guardianModel) plus the 5 role chains equal the 18-leaf-key configuration
  // surface (toolName/roles/synthesis/configVersion are structural,
  // rendered nowhere).
  // Number bounds mirror HARD_LIMITS (100 / 20) and the defaults (10 / 3 / 0); the
  // suite pins all three so a quiet drift fails here instead of in the GUI.
  it('renders the visible keys: 14 fields plus the 5 role chains', () => {
    const visible = ['childTimeoutMs', 'grokDefault', 'guardianModel', 'maxConcurrency', 'maxTasks', 'mode', 'timeoutMs',
      'replan',
      'loopEnabled', 'loopMaxRounds', 'loopFailStreak', 'loopIntervalMin',
      'iterateIntervalMin', 'iterateTemplate']
    expect(bundle.GROK_WORKFLOW_FIELDS.map(field => field.key).sort()).toEqual(visible.slice().sort())
    expect(bundle.GROK_WORKFLOW_READ_ONLY).toEqual([])
    expect([...bundle.GROK_WORKFLOW_FIELDS.map(field => field.key), 'roles'].sort()).toEqual(
      [...visible, 'roles'].sort())
  })

  it('keeps the numeric bounds identical to HARD_LIMITS', () => {
    const numeric = new Map(bundle.GROK_WORKFLOW_FIELDS.filter(field => field.kind === 'number').map(field => [field.key, field]))
    const expected: Record<string, [number, number]> = {
      maxConcurrency: [1, HARD_LIMITS.maxConcurrency],
      maxTasks: [1, HARD_LIMITS.maxTasks],
      // The deadline has no practical cap: 0 = unlimited, and the schema accepts
      // any non-negative safe integer, so the page mirrors that instead of
      // inventing a ceiling the plugin would not enforce.
      timeoutMs: [0, Number.MAX_SAFE_INTEGER],
      // The per-call stall budget: 1 s floor, 120 min ceiling (same as default).
      childTimeoutMs: [HARD_LIMITS.childTimeoutMs.min, HARD_LIMITS.childTimeoutMs.max],
      // Repeat-run caps are quota envelopes (each round is a full run), so the page
      // shows the same bounds the schema clamps to. An interval spends no quota and
      // therefore has no practical ceiling either; 0 starts the next round at once.
      loopMaxRounds: [1, HARD_LIMITS.loopMaxRounds],
      loopFailStreak: [1, HARD_LIMITS.loopFailStreak],
      loopIntervalMin: [0, HARD_LIMITS.loopIntervalMin],
      iterateIntervalMin: [0, HARD_LIMITS.iterateIntervalMin],
    }
    for (const [key, [min, max]] of Object.entries(expected)) {
      expect({ key, min: numeric.get(key)?.min, max: numeric.get(key)?.max }).toEqual({ key, min, max })
    }
    expect([...numeric.keys()].sort()).toEqual(Object.keys(expected).sort())
    expect(HARD_LIMITS.maxConcurrency).toBe(100)
    expect(HARD_LIMITS.maxTasks).toBe(100)
    expect(HARD_LIMITS.loopMaxRounds).toBe(100)
    expect(HARD_LIMITS.loopFailStreak).toBe(20)
    expect(HARD_LIMITS.loopIntervalMin).toBe(10_080)
  })

  it('keeps the numeric defaults identical to src/config.ts', () => {
    const defs = new Map(bundle.GROK_WORKFLOW_FIELDS.map(field => [field.key, field]))
    expect(defs.get('maxConcurrency')?.def).toBe(DEFAULT_MAX_CONCURRENCY)
    expect(defs.get('maxTasks')?.def).toBe(DEFAULT_MAX_TASKS)
    expect(defs.get('timeoutMs')?.def).toBe(DEFAULT_TIMEOUT_MS)
    expect(defs.get('childTimeoutMs')?.def).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    expect(defs.get('loopMaxRounds')?.def).toBe(DEFAULT_LOOP_MAX_ROUNDS)
    expect(defs.get('loopFailStreak')?.def).toBe(DEFAULT_LOOP_FAIL_STREAK)
    expect(defs.get('loopIntervalMin')?.def).toBe(DEFAULT_LOOP_INTERVAL_MIN)
    // Self-iteration: the interval mirrors the loop's, and the textarea's default is
    // byte-identical to the schema's built-in template (one source, two copies of a
    // hand-written bundle — the pin is what keeps them from drifting).
    expect(defs.get('iterateIntervalMin')?.def).toBe(DEFAULT_ITERATE_INTERVAL_MIN)
    expect(defs.get('iterateTemplate')?.def).toBe(DEFAULT_ITERATE_TEMPLATE)
    // A loop and a mid-run replan are opt-in: the page's switches start off,
    // like the schema defaults.
    expect(defs.get('loopEnabled')?.def).toBe(false)
    // The replan row is the same boolean-switch shape as loopEnabled.
    expect(defs.get('replan')).toMatchObject({ kind: 'boolean', group: 'loop', def: false })
    expect(defs.get('replan')?.def).toBe(DEFAULT_REPLAN)
    expect(DEFAULT_REPLAN).toBe(false)
    expect(DEFAULT_MAX_CONCURRENCY).toBe(10)
    expect(DEFAULT_MAX_TASKS).toBe(10)
    expect(DEFAULT_LOOP_MAX_ROUNDS).toBe(10)
    expect(DEFAULT_LOOP_FAIL_STREAK).toBe(3)
    expect(DEFAULT_LOOP_INTERVAL_MIN).toBe(0)
    expect(DEFAULT_ITERATE_INTERVAL_MIN).toBe(0)
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
    expect(derived.length).toBe(
      bundle.GROK_WORKFLOW_FIELDS.length + bundle.GROK_WORKFLOW_ROLES.length + bundle.GROK_WORKFLOW_GROUPS.length)
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
      { key: 'error.badBoolean', params: { key: 'loopEnabled' } },
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
    expect(formatError(finding, zh)).toBe('4 · 复核 备用链最多 50 条，删掉多余的。')
    expect(formatError(finding, en)).toBe('4 · Review can keep at most 50 backup routes — remove the extras.')
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
    // Five live registrations: the settings page, the task panel renderer and the
    // three composer tool-row switches (additive, registered last: loop, iterate, mode).
    expect(live()).toHaveLength(5)
    const byId = (id: string) => live().find((entry: { options: Record<string, unknown> }) => entry.options['id'] === id)
    expect(byId('grok-workflow-loop'), 'the loop switch is registered').toBeDefined()
    expect(byId('grok-workflow-iterate'), 'the self-iterate switch is registered').toBeDefined()
    expect(byId('grok-workflow-mode'), 'the workflow switch is registered').toBeDefined()
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
    expect(live()).toHaveLength(5)
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
    // The settings page, the task-panel renderer and all three switches are mounted, and
    // the `locale` fiber handed back exactly one disposer per injected scope it entered.
    expect(live()).toHaveLength(5)
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
    expect(live()).toHaveLength(5)
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

/* ------------------------------------------------------------ the component -- */

/**
 * Render the progress tab with the real hook cells, so a click is a real second render.
 * @param props - the props to render with.
 * @returns `run()` for a render pass; state set by a click survives into the next one.
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
      return bundle.GROK_WORKFLOW_PROGRESS.component(props)
    } finally {
      rendering = before
    }
  }
  return { run }
}

type SwitchRender = { cells: unknown[], index: number, effects: Array<() => unknown> }
let switchRender: SwitchRender | undefined

/**
 * React stand-in whose `useEffect` actually runs.
 *
 * The shared stub in this file deliberately does not run effects (the settings page
 * writes its draft from one, and replaying that after a click would undo the click).
 * The switch *reads on mount*, so its half of the file needs the opposite: effects are
 * collected during a render and executed once, the way React does after the commit.
 */
const switchReact = {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
    const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
    return typeof type === 'function' ? (type as (props: Record<string, unknown>) => unknown)(element.props) : element
  },
  useState: (initial: unknown) => {
    const render = switchRender!
    const at = render.index++
    if (at >= render.cells.length) render.cells[at] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    return [render.cells[at], (next: unknown) => {
      render.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(render.cells[at]) : next
    }]
  },
  useEffect: (fn: () => unknown) => { switchRender!.effects.push(fn) },
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}

/** The bundle again, loaded with {@link switchReact}. */
function loadSwitchExports(): Record<string, unknown> {
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  let registration: { id: string, factory: (require: (id: string) => unknown) => Record<string, unknown> } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(source)()
  } finally {
    record.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  return registration!.factory((id) => {
    if (id === 'react') return switchReact
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

/** The loop switch's own share of the bundle (the shape every dock switch mounts with). */
function loadSwitchBundle(): LoopSwitchBundle {
  return loadSwitchExports()['GROK_WORKFLOW_LOOP'] as LoopSwitchBundle
}

/** Render the switch, run its mount effect once, and re-render what React would show. */
function mountSwitch(component: (props: Record<string, unknown>) => unknown, props: Record<string, unknown>, dataAttr = 'loop') {
  const render: SwitchRender = { cells: [], index: 0, effects: [] }
  const run = (): unknown => {
    render.index = 0
    render.effects = []
    const before = switchRender
    switchRender = render
    try {
      return component(props)
    } finally {
      switchRender = before
    }
  }
  // Resolved promises plus the effect's own chain: a macrotask flush is enough and, unlike
  // a fixed number of microtasks, does not depend on how many `then`s the code adds.
  const settle = async () => {
    for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return {
    async mount() {
      const first = run()
      const effects = render.effects.slice()
      render.effects = []
      for (const effect of effects) await effect()
      await settle()
      return { first, tree: run() }
    },
    async click(tree: unknown) {
      const button = walk(tree).find((element) => element.props[`data-${dataAttr}-toggle`] === true)
      expect(button, `the ${dataAttr} switch renders a toggle`).toBeDefined()
      ;(button!.props['onClick'] as () => void)()
      await settle()
      return run()
    },
  }
}

const toggleOf = (tree: unknown) => walk(tree).find((element) => element.props['data-loop-toggle'] === true)!

/** The workflow switch's own toggle and lamp, found by their own attributes. */
const toggleIn = (tree: unknown) => walk(tree).find((element) => element.props['data-mode-toggle'] === true)!
const lampIn = (tree: unknown) => walk(tree).find((element) => element.props['data-mode-lamp'] !== undefined)
  ?.props['data-mode-lamp']

/** A fetch stand-in: records the POST body and answers from a script, one per call. */
function scriptedFetch(script: Array<{ status?: number, body?: unknown, throws?: boolean }>) {
  const posted: Array<Record<string, unknown>> = []
  const urls: string[] = []
  const methods: string[] = []
  const fetchImpl = async (url: string, init: Record<string, unknown>) => {
    urls.push(url)
    methods.push(String(init['method'] ?? 'GET'))
    if (typeof init['body'] === 'string') posted.push(JSON.parse(init['body']) as Record<string, unknown>)
    const answer = script.shift()
    if (answer === undefined) throw new Error('unscripted loop call')
    if (answer.throws === true) throw new Error('socket closed')
    return { status: answer.status ?? 200, json: async () => answer.body }
  }
  return { posted, urls, methods, fetchImpl }
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
  function fakePageContext(face: Record<string, unknown>, mutations: Array<{ ops: unknown[], revision: unknown }> = []) {
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
        // A save is recorded, so a test can read what the page actually wrote: the
        // number controls convert the unit they show, and that conversion is the half
        // of the contract a rendered value cannot prove (Q9).
        get: () => ({
          mutate: async (ops: unknown[], revision: unknown) => {
            mutations.push({ ops, revision })
            return true
          },
        }),
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
  function mounted(face: Record<string, unknown>, mutations: Array<{ ops: unknown[], revision: unknown }> = []) {
    const { ctx, live } = fakePageContext(face, mutations)
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

  it('renders the repeat-run rows with their labels in both languages', () => {
    const loopKeys = ['replan', 'loopEnabled', 'loopMaxRounds', 'loopFailStreak', 'loopIntervalMin']
    for (const [locale, dict] of [['zh', zhDict], ['en', bundle.GROK_WORKFLOW_DICT['en']!]] as const) {
      const { component, props } = mounted(faceFor(READY))
      const tree = renderPage(component, {
        ...props,
        t: (key: string, params?: Record<string, unknown>) => translate(locale, key, params),
      }).run()
      const rows = walk(tree).filter(element => element.props['data-field'] !== undefined)
      for (const key of loopKeys) {
        expect(rows.some(row => row.props['data-field'] === key), `${locale} ${key}`).toBe(true)
      }
      const text = texts(tree).join('\n')
      for (const key of ['group.loop', ...loopKeys.map(field => `field.${field}`)]) {
        expect(text, `${locale} ${key}`).toContain(dict[key]!)
      }
    }
  })

  it('says what 0 means on the rows whose minimum is 0, in both languages', () => {
    // `timeoutMs` and `loopIntervalMin` both default to 0, and 0 is not "off" on either
    // one. The page carries no hint row (T5), so the unit suffix is the only place the
    // meaning can live: `0` means "unlimited" for the deadline and "the loop's own
    // floor" for the interval — never "start immediately". README's key table uses the
    // same words, and `test/docs-config-keys.spec.ts` keeps that table honest.
    // Q9: the deadline is edited in minutes (`unit.deadlineMinutes`) while the stored
    // value stays milliseconds; `unit.ms` survives only as the dictionary entry the
    // parity test still checks, not as the row's suffix.
    const rows: Array<{ field: string, unit: string }> = [
      { field: 'timeoutMs', unit: 'unit.deadlineMinutes' },
      { field: 'loopIntervalMin', unit: 'unit.minutes' },
    ]
    const floorWording = { zh: /下限/, en: /floor/ } as const
    for (const [locale, dict] of [['zh', zhDict], ['en', bundle.GROK_WORKFLOW_DICT['en']!]] as const) {
      expect(dict['unit.minutes']!, `${locale} unit.minutes`).toMatch(floorWording[locale])
      expect(dict['unit.ms']!, `${locale} unit.ms`).toMatch(/0/)
      const { component, props } = mounted(faceFor(READY))
      const tree = renderPage(component, {
        ...props,
        t: (key: string, params?: Record<string, unknown>) => translate(locale, key, params),
      }).run()
      for (const { field, unit } of rows) {
        const row = walk(tree).find(element => element.props['data-field'] === field)
        expect(row, `${locale} ${field}`).toBeDefined()
        expect(texts(row!).join('\n'), `${locale} ${field} unit`).toContain(dict[unit]!)
      }
    }
  })

  it('edits the run deadline in minutes and still saves milliseconds (Q9)', async () => {
    // The reader's report was "there is no deadline setting": a number labelled
    // `毫秒` where a raw millisecond value sits reads as an internal knob, not a setting.
    // The control now shows minutes, the wire keeps milliseconds, and the hint
    // states the default and what 0 means right beside the control.
    const mutations: Array<{ ops: unknown[], revision: unknown }> = []
    const ready = faceFor({
      status: 'ready',
      view: { writable: true, namespaces: [{ ns: 'grok-workflow', revision: 7, value: { roles: {}, timeoutMs: 0 } }] },
      error: null,
    })
    const { component, props } = mounted(ready, mutations)
    const view = renderPage(component, props)
    let tree = view.run()
    // `data-field` sits on the row wrapper too, so the control is the number input.
    const input = (): Element => {
      const element = walk(tree).find(candidate =>
        candidate.props['data-field'] === 'timeoutMs' && candidate.props['type'] === 'number')
      expect(element).toBeDefined()
      return element!
    }
    // 0 ms is 0 minutes on screen (the default is unlimited).
    expect(input().props['value']).toBe('0')
    expect(input().props['min']).toBe(0)

    // A step is one minute, not one millisecond: 0 → 1.
    await view.click(walk(tree).find(candidate => candidate.props['data-step'] === 'timeoutMs-up')!)
    tree = view.run()
    expect(input().props['value']).toBe('1')

    // Typing minutes stores milliseconds: 90 minutes is 5 400 000.
    ;(input().props['onChange'] as (event: { target: { value: string } }) => void)({ target: { value: '90' } })
    tree = view.run()
    expect(input().props['value']).toBe('90')
    await view.click(walk(tree).find(candidate => candidate.props['data-action'] === 'save')!)
    expect(mutations).toHaveLength(1)
    const written = (mutations[0]!.ops as Array<{ op: string, path: string[], value: unknown }>)
      .filter(op => op.path[0] === 'timeoutMs')
    expect(written).toEqual([{ op: 'set', path: ['timeoutMs'], value: 5_400_000 }])

    // The hint says the default and what 0 means, in the reader's language.
    const hint = walk(tree).find(candidate => candidate.props['data-gw-timeout-hint'] === true)
    expect(hint).toBeDefined()
    expect(texts(hint!).join('')).toBe(zhDict['field.timeoutMs.hint']!)
    expect(zhDict['field.timeoutMs.hint']!).toContain('不限时')
    expect(zhDict['field.timeoutMs.hint']!).toContain('0 = 不限时')
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

  it('carries the template textarea through draft → ops → save, like every other key', () => {
    // Seeding: an absent document seeds the built-in template, so a fresh profile
    // renders a usable default instead of an empty box.
    const draft = draftOf(undefined)
    expect(draft.iterateTemplate).toBe(DEFAULT_ITERATE_TEMPLATE)
    // An edit becomes one set op on the template's own path — the same shape the
    // settings mirror persists into the profile patch, so the textarea needs no
    // bespoke write path (and cannot bypass the Host's own schema on save).
    const edited = { ...draft, iterateTemplate: `${DEFAULT_ITERATE_TEMPLATE}\n\n(edit)` }
    expect(opsFor(edited, undefined)).toEqual(expect.arrayContaining([
      { op: 'set', path: ['iterateTemplate'], value: edited.iterateTemplate },
    ]))
    // Nothing changed → no op, so an untouched template never dirties a save.
    expect(opsFor(draft, JSON.parse(JSON.stringify(draft))).filter(op => op.path[0] === 'iterateTemplate')).toEqual([])
    // A stored template survives the draft re-seed (a reload shows what is stored).
    const stored = draftOf({ iterateTemplate: 'stored text' } as Record<string, unknown>)
    expect(stored.iterateTemplate).toBe('stored text')
    expect(opsFor(stored, undefined)).toEqual(expect.arrayContaining([
      { op: 'set', path: ['iterateTemplate'], value: 'stored text' },
    ]))
  })

  it('refuses a template over the prompt bound, in both languages', () => {
    const over = { ...draftOf(undefined), iterateTemplate: 'x'.repeat(4001) }
    const findings = validate(over)
    expect(findings).toEqual([{ key: 'error.badTemplate', params: { key: 'iterateTemplate', limit: 4000 } }])
    expect(formatError(findings[0]!, translator('en'))).toContain('4000')
    expect(formatError(findings[0]!, translator('zh'))).toContain('4000')
    // Exactly at the bound is fine.
    expect(validate({ ...draftOf(undefined), iterateTemplate: 'x'.repeat(4000) })).toEqual([])
    // Whitespace-only is legal: arming falls back to the built-in default.
    expect(validate({ ...draftOf(undefined), iterateTemplate: '  \n ' })).toEqual([])
  })

  it('survives a non-object roles section instead of crashing the page', () => {
    for (const roles of [null, 'fast', 42, ['planner']]) {
      const draft = draftOf({ roles } as unknown as Record<string, unknown>)
      for (const role of bundle.GROK_WORKFLOW_ROLES) expect(draft.roles[role]).toEqual([])
    }
    expect(validate(draftOf({ roles: null } as unknown as Record<string, unknown>))).toEqual([])
    // validate/emptyCapWarn/opsFor must survive a draft whose roles section
    // was destroyed after seeding (no throw, no phantom ops).
    const broken = { ...draftOf(undefined), roles: null } as unknown as Parameters<typeof validate>[0]
    expect(validate(broken)).toEqual([])
    expect(emptyCapWarn(broken)).toBe(false)
    // No throw and no phantom ops: a destroyed roles section reads as empty.
    expect(opsFor(broken, undefined)).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['grokDefault'], value: 'off' },
        { op: 'set', path: ['mode'], value: 'triage' },
      ])
    )
    expect(opsFor(broken, undefined).filter(op => op.path[0] === 'roles')).toEqual([])
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

  it('rejects a repeat-run switch that is not a real boolean', () => {
    const bad = { ...draftOf(undefined), loopEnabled: 'on' }
    const findings = validate(bad)
    expect(findings).toEqual([{ key: 'error.badBoolean', params: { key: 'loopEnabled' } }])
    expect(messagesIn(findings, en).some(text => text.includes('on or off'))).toBe(true)
    expect(messagesIn(findings, zh).some(text => text.includes('开和关'))).toBe(true)
    // Both real booleans validate clean, so the switch itself is never blocked.
    for (const flag of [true, false]) {
      expect(validate({ ...draftOf(undefined), loopEnabled: flag })).toEqual([])
    }
  })

  it('rejects a mid-run replan switch that is not a real boolean', () => {
    const bad = { ...draftOf(undefined), replan: 'on' }
    const findings = validate(bad)
    expect(findings).toEqual([{ key: 'error.badBoolean', params: { key: 'replan' } }])
    expect(messagesIn(findings, en).some(text => text.includes('on or off'))).toBe(true)
    expect(messagesIn(findings, zh).some(text => text.includes('开和关'))).toBe(true)
    // Both real booleans validate clean, so the switch itself is never blocked.
    for (const flag of [true, false]) {
      expect(validate({ ...draftOf(undefined), replan: flag })).toEqual([])
    }
    // The finding names the row in words, in both languages — never a raw key.
    expect(formatError({ key: 'error.badBoolean', params: { key: 'replan' } }, en)).toContain('Join a running plan')
    expect(formatError({ key: 'error.badBoolean', params: { key: 'replan' } }, zh)).toContain('跑中并入活计划')
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
      timeoutMs: 0,
      childTimeoutMs: 7_200_000,
      replan: false,
      loopEnabled: false,
      loopMaxRounds: 10,
      loopFailStreak: 3,
      loopIntervalMin: 0,
      iterateIntervalMin: 0,
      iterateTemplate: '',
      guardianModel: { provider: '', model: '' },
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
function progressMember(seq: number, phase: string | undefined, outcome?: string, overrides: Partial<ProgressMember> = {}): ProgressMember {
  return {
    seq,
    label: `执行 ${seq}`,
    childId: `child-${seq}`,
    order: seq - 1,
    ...phase === undefined ? {} : { phase },
    ...outcome === undefined ? {} : { outcome },
    ...overrides,
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

  it('folds progress and Guardian lifecycle events while ignoring unrelated rows', () => {
    expect(progress.eventTypes).toEqual([
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
      'tool-workflow/guardian-start',
      'tool-workflow/guardian-finding',
      'tool-workflow/guardian-end',
      'tool-workflow/run-end',
    ])
    const runs = progress.fold([
      rec('tool-workflow/run-start', { runId: 'r1', name: '任务团队 · 2 个任务' }, 10, 1_000),
      rec('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11, 1_100),
      rec('tool-workflow/guardian-start', { runId: 'r1', armed: true, budgetMs: 300_000 }, 12, 1_200),
      rec('tool-workflow/guardian-finding', { runId: 'r1', seq: 1, label: '执行', signal: 'timeout', action: 'rescue', reason: 'rescued with guidance', atMs: 1_500 }, 13, 1_500),
      rec('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }, 14, 2_100),
      rec('assistant/message', { runId: 'r1', text: 'noise' }, 15),
      rec('tool-workflow/guardian-end', { runId: 'r1', cancelled: false, findingCount: 1 }, 16, 2_150),
      rec('tool-workflow/run-end', { runId: 'r1', stopReason: 'completed' }, 17, 2_200),
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]!.runId).toBe('r1')
    expect(runs[0]!.stopReason).toBe('completed')
    expect(runs[0]!.guardian?.findings).toEqual([{
      seq: 1,
      label: '执行',
      signal: 'timeout',
      action: 'rescue',
      reason: 'rescued with guidance',
      atMs: 1_500,
    }])
    expect(runs[0]!.guardian?.ended).toBe(true)
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

  it('carries Guardian events through incremental updates into the rendered monitor lane', () => {
    type Event = ReturnType<typeof rec>
    type Definition = {
      start: (context: unknown, match: { event: Event }) => Record<string, unknown>
      update: (context: { state: Record<string, unknown> }, match: { event: Event }) => Record<string, unknown>
      buildViewNode: (context: {
        state: Record<string, unknown>
        start: { event: Event, location: unknown }
        key: string
        kind: string
      }) => { data: Record<string, unknown> }
    }
    const definition = progress.eventDefinition as unknown as Definition
    let state = definition.start(undefined, {
      event: rec('tool-workflow/run-start', { runId: 'r-live', name: '任务团队' }, 10, 1_000),
    })
    state = definition.update({ state }, {
      event: rec('tool-workflow/guardian-start', { runId: 'r-live', armed: true, budgetMs: 1_320_000 }, 11, 1_100),
    })
    state = definition.update({ state }, {
      event: rec('tool-workflow/guardian-finding', {
        runId: 'r-live', seq: 3, label: '执行 3', signal: 'timeout',
        action: 'rescue', reason: 'recovery guidance queued', atMs: 2_000,
      }, 12, 2_000),
    })
    state = definition.update({ state }, {
      event: rec('tool-workflow/guardian-finding', {
        runId: 'r-live', seq: 4, label: '执行 4', signal: 'heartbeat-loss',
        action: 'observe', reason: 'no child session available; left running', atMs: 2_050,
      }, 13, 2_050),
    })
    state = definition.update({ state }, {
      event: rec('tool-workflow/guardian-end', { runId: 'r-live', cancelled: false, findingCount: 2 }, 14, 2_100),
    })
    const node = definition.buildViewNode({
      state,
      start: { event: rec('tool-workflow/run-start', { runId: 'r-live', name: '任务团队' }, 10, 1_000), location: {} },
      key: 'r-live',
      kind: progress.kind,
    })
    const liveRun = node.data as unknown as ProgressRun
    expect(liveRun.guardian).toMatchObject({
      started: true,
      armed: true,
      budgetMs: 1_320_000,
      ended: true,
      cancelled: false,
      findings: [
        { seq: 3, action: 'rescue', reason: 'recovery guidance queued' },
        { seq: 4, action: 'observe', reason: 'no child session available; left running' },
      ],
    })
    const t = translator('zh')
    const view = progress.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [liveRun], activeRun: liveRun }),
    })
    const elements = walk(view)
    const panel = elements.find((element) => element.props['data-gw-progress-guardian'] === true)
    expect(panel).toBeDefined()
    expect(panel!.props['data-state']).toBe('finished')
    expect(texts(panel).join(' ')).toContain('已排队发送恢复指引')
    expect(texts(panel).join(' ')).toContain('已记录异常 · 继续运行')
    expect(elements.some(element => element.props['data-action'] === 'observe')).toBe(true)
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

  it('keeps a numbered plan task mentioning a stage word on its own card, never on the spine', () => {
    // Mirror of the typed regression: `任务 7 · …执行…` must stay `任务 7`, not an `执行` stage row.
    const track = trackOf([
      progressMember(20, '任务 7 · 合并为干净可并发执行计划', 'completed', { label: '执行' }),
      progressMember(21, '任务 7 · 合并为干净可并发执行计划', 'completed', { label: '检查' }),
    ], 'completed')
    expect(stage(track, 'execute').members).toEqual([])
    expect(track.nodes.find((node) => node.key === 'phase:任务 7 · 合并为干净可并发执行计划')?.kind).toBe('extra')
    expect(track.nodes.filter((node) => node.kind === 'extra')).toHaveLength(1)
  })

  it('mirrors the role-label evidence, so execute and verify are not rendered as never reported', () => {
    const track = trackOf([
      progressMember(1, '任务 1 · 修复登录', 'completed', { label: '执行' }),
      progressMember(2, '任务 1 · 修复登录', 'completed', { label: '检查' }),
      progressMember(3, '任务 2 · 补文档', 'failed', { label: '执行' }),
    ], 'error')
    const execute = stage(track, 'execute')
    const verify = stage(track, 'verify')
    // Same derivation as the typed rules: rows stay in their plan-task nodes …
    expect(execute.members).toEqual([])
    expect(track.nodes.filter((node) => node.kind === 'extra')).toHaveLength(2)
    // … and are cross-referenced onto the stage whose role ran them.
    expect(execute.evidence.map((entry) => entry.seq)).toEqual([1, 3])
    expect(execute.state).toBe('failed')
    expect(verify.evidence.map((entry) => entry.seq)).toEqual([2])
    expect(verify.state).toBe('done')
    const rendered = track.nodes.flatMap((node) => node.members.map((entry) => entry.seq)).sort((a, b) => a - b)
    expect(rendered).toEqual([1, 2, 3])
  })
})

describe('client progress tab: row pills jump straight to the child session', () => {
  /** The run every case below shows: one plan task with two rows, one still running. */
  const run: ProgressRun = {
    runId: 'run-42',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      progressMember(1, '任务 1 · 读代码', 'completed', { label: '执行' }),
      progressMember(2, '任务 1 · 读代码', undefined, { label: '检查' }),
    ],
    startedAt: 1_000,
  }

  it('renders no detail card anywhere on the tab', () => {
    const t = translator('zh')
    const view = renderProgress({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
    const elements = walk(view.run())
    expect(elements.some((element) => element.props['data-progress-detail'] === true)).toBe(false)
    expect(elements.some((element) => element.props['data-gw-progress-copy'] === true)).toBe(false)
    expect(elements.some((element) => element.props['data-gw-progress-row'] === true)).toBe(false)
    expect(elements.some((element) => element.props['data-gw-progress-field'] !== undefined)).toBe(false)
    expect(elements.some((element) => element.props['data-gw-progress-fact'] !== undefined)).toBe(false)
  })

  it('renders one pill per openable row, and each pill opens its own child session', () => {
    const t = translator('zh')
    const opened: string[] = []
    const view = renderProgress({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
      canOpen: (childId: string) => childId === 'child-1',
      openChild: (childId: string) => { opened.push(childId) },
    })
    const pills = walk(view.run()).filter((element) => element.props['data-gw-progress-open'] !== undefined)
    // Two rows, one of them openable: exactly one button pill, and it opens that row.
    expect(pills).toHaveLength(1)
    expect(pills[0]!.props['data-gw-progress-open']).toBe('child-1')
    ;(pills[0]!.props['onClick'] as () => void)()
    expect(opened).toEqual(['child-1'])
    // The pill says where it goes, in both languages.
    for (const locale of ['zh', 'en']) {
      expect(translate(locale, 'progress.member.open'), locale).not.toBe('progress.member.open')
    }
    expect(String(pills[0]!.props['aria-label'])).toContain(translate('zh', 'progress.member.open'))
  })

  it('still shows every row when nothing can be opened, and nothing is clickable', () => {
    const t = translator('zh')
    const view = renderProgress({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
      canOpen: () => false,
      openChild: () => { throw new Error('must not open an unopenable row') },
    })
    // Both rows keep their pill, as plain spans: the topology is unchanged, the action is
    // simply absent.
    const pills = walk(view.run()).filter((element) => element.props['data-gw-progress-pill'] !== undefined)
    expect(pills.map((pill) => pill.props['data-gw-progress-pill'])).toEqual([1, 2])
    expect(walk(view.run()).filter((element) => element.props['data-gw-progress-open'] !== undefined)).toHaveLength(0)
    for (const element of walk(view.run())) {
      if (element.props['data-progress-zoom'] !== undefined) continue
      expect(element.props['onClick'], String(element.props['data-gw-progress-task'] ?? element.props['data-gw-progress-node'] ?? '')).toBeUndefined()
    }
  })

  it('keeps a click on a stage or on a blank card area inert', () => {
    const t = translator('zh')
    const view = renderProgress({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
      canOpen: () => true,
      openChild: () => { throw new Error('a card is not a control') },
    })
    const elements = walk(view.run())
    const stages = elements.filter((element) => element.props['data-gw-progress-node'] === true)
    expect(stages).toHaveLength(bundle.GROK_WORKFLOW_PROGRESS.stages.length)
    for (const stage of stages) {
      expect(stage.props['onClick'], String(stage.props['data-node-key'])).toBeUndefined()
      expect(stage.props['tabIndex']).toBeUndefined()
      expect(stage.props['role']).toBeUndefined()
    }
    const cards = elements.filter((element) => typeof element.props['data-gw-progress-task'] === 'string')
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.props['onClick'], String(card.props['data-gw-progress-task'])).toBeUndefined()
      expect(card.props['tabIndex']).toBeUndefined()
    }
  })
})

describe('client progress tab: styles, zoom and empty snapshots', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS

  it('keeps every colour on a --dsw-alias token and the family on a --dsw-font token', () => {
    for (const state of ['doing', 'done', 'failed', 'blocked', 'cancelled', 'pending']) {
      expect(progress.stateColor[state]).toMatch(/^var\(--dsw-alias-/)
    }
    expect(progress.css).toContain('var(--dsw-font-family-sans')
    // The detail popover owned the only mono use (engine facts); without it there is
    // no mono left in the tab.
    expect(progress.css).not.toContain('var(--dsw-font-family-mono')
    // No literal colour and no light-only surface anywhere in the scoped rules.
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(progress.css).not.toMatch(/\brgba?\(/)
    expect(progress.css).not.toMatch(/\bhsla?\(/)
  })

  it('scopes every rule to .gw-progress, with the full-width spine and the vertical narrow layout', () => {
    const rules = progress.css.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('@'))
    for (const rule of rules) expect(rule.trim().startsWith('.gw-progress')).toBe(true)
    // A+C: the spine takes the full width once (6 equal parts, no sideways scroll).
    expect(progress.css).toContain('.gw-progress-track')
    expect(progress.css).toContain('width: 100%')
    expect(progress.css).not.toContain('overflow-x: auto')
    expect(progress.css).not.toContain('scroll-snap-type')
    expect(progress.css).toContain('prefers-reduced-motion: reduce')
    expect(progress.css).toContain('@media (max-width: 720px)')
    expect(progress.css).toContain('@media (max-width: 480px)')
    // …and the track itself turns vertical under 480px (no sideways scroll).
    expect(progress.css).toMatch(/@media \(max-width: 480px\)[\s\S]*flex-direction: column/)
    // 28px rings at a fixed size: the sizes are plain px again now that the zoom factor
    // is gone, so nothing multiplies the typography behind the reader's back.
    expect(progress.css).toContain('width: 28px')
    expect(progress.css).not.toContain('--gw-zoom')
  })

  it('puts the task band below the spine and never inside the flex line', () => {
    const t = translator('zh')
    const run: ProgressRun = {
      runId: 'run-branch',
      name: '任务团队',
      anchorSeq: 1,
      members: [
        progressMember(1, '任务 1 · 读代码', 'completed', { label: '执行' }),
        progressMember(2, '任务 1 · 读代码', undefined, { label: '检查' }),
      ],
    }
    const tree = progress.component({ t, progressT: t, useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }) })
    const elements = walk(tree)
    const track = elements.find((element) => element.props['data-gw-progress-track'] === true)!
    const band = elements.find((element) => element.props['data-gw-progress-tasks'] === true)!
    expect(band, 'the band renders below the spine').toBeDefined()
    // The regression the two tracks exist for: a `width: 100%` card inside the horizontal
    // flex line took its width out of the segments and crushed every one of them.
    expect(walk(track.children).some((element) => element.props['data-gw-progress-task'] !== undefined)).toBe(false)
    expect(walk(band.children).some((element) => element.props['data-gw-progress-node'] !== undefined)).toBe(false)
    // The card names the line it hangs from, which is what the wires are measured against.
    const card = elements.find((element) => typeof element.props['data-gw-progress-task'] === 'string')!
    expect(card.props['data-owner']).toBe('stage:execute')
    expect(card.props['data-state']).toBe('doing')
    // A running stage's connector flows on, and every meta line keeps its tooltip because
    // a narrow column clips it with an ellipsis.
    expect(elements.some((element) => element.props['data-gw-progress-link'] === true && element.props['data-flowing'] === 'true')).toBe(true)
    const metas = elements.filter((element) => element.props['data-gw-progress-meta'] === true)
    expect(metas.length).toBeGreaterThan(0)
    for (const meta of metas) expect(typeof meta.props['title']).toBe('string')
  })

  it('leaves a stage with no rows out of the band and says so on its own meta line', () => {
    const t = translator('zh')
    const run: ProgressRun = {
      runId: 'run-empty-branch',
      name: '任务团队',
      anchorSeq: 1,
      members: [progressMember(1, '检查')],
    }
    const tree = walk(progress.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    }))
    // Only the stage that owns the row gets a card; the five other stages stay marks with
    // their own sentence, so an empty band never reads as missing work.
    const cards = tree.filter((element) => typeof element.props['data-gw-progress-task'] === 'string')
    expect(cards.map((card) => card.props['data-owner'])).toEqual(['stage:verify'])
    const start = tree.find((element) => element.props['data-node-key'] === 'stage:start')!
    expect(String(texts(start).join(' '))).toContain(translate('zh', 'progress.notReported'))
    // Stages are static marks: no stage carries a click handler.
    for (const node of tree.filter((element) => element.props['data-gw-progress-node'] === true)) {
      expect(node.props['onClick'], String(node.props['data-node-key'])).toBeUndefined()
    }
  })

  it('draws the state ring, one connector axis and the wire layer', () => {
    // The ring is geometry in CSS; its colour is the inline `borderColor` from
    // `stateColor`. Without these rules the mark renders as an empty inline span.
    expect(progress.css).toContain('.gw-progress-ring {')
    expect(progress.css).toContain('border: 2px solid var(--dsw-alias-state-idle-primary')
    expect(progress.css).toContain('border-radius: 50%')
    expect(progress.css).toContain('.gw-progress-glyph')
    // The per-segment hairline sat at `top: 23px` behind a transparent head and struck
    // through the ring and the label; the axis is the connector between segments, on the
    // ring's centre line (6px segment pad + 14px half-ring = 19px).
    expect(progress.css).not.toContain('.gw-progress-seg-line')
    expect(progress.css).toMatch(/\.gw-progress-link \{[^}]*margin-top: 19px/)
    // The band's connector is the measured wire layer, not a CSS drawing: the trunk and the
    // branches have to know where the owner ring actually landed.
    expect(progress.css).toContain('.gw-progress-wires')
    expect(progress.css).toContain('pointer-events: none')
    // Motion stays decoration: both the pulse and the flowing dashes stop on request.
    expect(progress.css).toMatch(/prefers-reduced-motion: reduce[\s\S]*gw-progress-link\[data-flowing="true"\]/)
    // A narrow column stacks the ring above the label instead of squeezing the label.
    expect(progress.css).toMatch(/@media \(max-width: 720px\)[\s\S]*flex-direction: column/)
  })

  it('ships no zoom control and no zoom state any more', () => {
    // The mockup's zoom pill was chrome, not information: the tab is one layout at one
    // size, and a stored factor was a second source of geometry the wires would have had
    // to be re-measured against. Nothing reads or writes it now.
    expect(progress.css).not.toContain('--gw-zoom')
    expect(progress.css).not.toContain('.gw-progress-zoom')
    const t = translator('zh')
    const run: ProgressRun = {
      runId: 'run-zoom',
      name: '任务团队',
      anchorSeq: 1,
      members: [progressMember(1, '执行', 'completed')],
      stopReason: 'completed',
    }
    const elements = walk(progress.component({ t, progressT: t, useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }) }))
    // The only controls left on the tab are the row pills, and none of them is a zoom.
    expect(elements.some((element) => element.props['data-progress-zoom'] !== undefined)).toBe(false)
    expect(elements.some((element) => typeof element.props['style'] === 'object' && element.props['style'] !== null && '--gw-zoom' in (element.props['style'] as Record<string, unknown>))).toBe(false)
    for (const locale of ['zh', 'en']) {
      expect(translate(locale, 'progress.zoomIn')).toBe('progress.zoomIn')
      expect(translate(locale, 'progress.zoomOut')).toBe('progress.zoomOut')
      expect(translate(locale, 'progress.zoomReset')).toBe('progress.zoomReset')
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
    // Aria: the track is a labelled group and every node has a name; stages are
    // static marks, so nothing is in the tab order and nothing is expandable.
    expect(nodes.filter((node) => node.props['tabIndex'] === 0)).toHaveLength(0)
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

  it('reports the rows a stage ran inside plan tasks instead of saying it was never reported', () => {
    const run: ProgressRun = {
      runId: 'r',
      name: '任务团队',
      anchorSeq: 1,
      members: [
        progressMember(1, '任务 1 · 修复登录', 'completed', { label: '执行' }),
        progressMember(2, '任务 1 · 修复登录', 'completed', { label: '检查' }),
        progressMember(3, '任务 2 · 补文档', 'completed', { label: '执行' }),
      ],
      stopReason: 'completed',
    }
    const nodes = nodesOf(run)
    const execute = nodes.find((node) => node.props['data-node-key'] === 'stage:execute')!
    const verify = nodes.find((node) => node.props['data-node-key'] === 'stage:verify')!
    // The two stages every run performs no longer read as never reported.
    expect(execute.props['data-state']).toBe('done')
    expect(verify.props['data-state']).toBe('done')
    expect(execute.props['title']).toBe(bundle.GROK_WORKFLOW_DICT['zh']!['progress.evidenceHint'])
    // The meta line names how many rows ran under the stage, in the reader's language.
    const zhMeta = texts(execute).join(' ')
    expect(zhMeta).toContain('2 行在下方任务节点中执行')
    expect(zhMeta).not.toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.notReported'])
    const en = translator('en')
    const enTree = progress.component({
      t: en,
      progressT: en,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
    const enExecute = walk(enTree).find((element) => element.props['data-node-key'] === 'stage:execute')!
    expect(texts(enExecute).join(' ')).toContain('2 rows ran inside the plan tasks below')
  })
})

describe('client progress tab: the settle bar, the rails and the narrow layout', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS
  const t = translator('zh')

  /** Render one run and hand back the stub tree the component produced. */
  function treeOf(members: ProgressMember[], stopReason?: string) {
    const run: ProgressRun = {
      runId: 'r-parts',
      name: '任务团队',
      anchorSeq: 1,
      members,
      ...stopReason === undefined ? {} : { stopReason },
    }
    return progress.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
  }

  it('keeps the spine at the six fixed stages however many tasks the plan declares', () => {
    // Eight plan tasks, one row each: the band grows, the spine does not.
    const members = Array.from({ length: 8 }, (_, index) => progressMember(index + 1, `任务 ${index + 1} · 步骤`, 'completed', { label: '执行' }))
    const tree = treeOf(members, 'completed')
    const spine = walk(tree).filter((element) => element.props['data-gw-progress-node'] === true)
    expect(spine).toHaveLength(progress.stages.length)
    expect(spine.some((node) => String(node.props['data-node-key']).startsWith('phase:'))).toBe(false)
    const cards = walk(tree).filter((element) => typeof element.props['data-gw-progress-task'] === 'string')
    expect(cards).toHaveLength(8)
    // A plan task is announced in the execute slot, so every one of them joins that line.
    expect(cards.every((card) => card.props['data-owner'] === 'stage:execute')).toBe(true)
  })

  it('splits the settle bar by outcome and draws the unsettled rest as a gap', () => {
    const tree = treeOf([
      progressMember(1, '执行', 'completed'),
      progressMember(2, '执行', 'completed'),
      progressMember(3, '执行', 'failed'),
      progressMember(4, '执行', 'cancelled'),
      progressMember(5, '执行'),
      progressMember(6, '执行'),
    ])
    const parts = walk(tree).filter((element) => typeof element.props['data-gw-progress-settle-part'] === 'number')
    // Four tones in the order they are drawn: `warn` is the engine's own cancellation
    // word, and `open` is the unsettled rest — a colour there would read as a result.
    expect(parts.map((part) => part.props['data-tone'])).toEqual(['ok', 'bad', 'warn', 'open'])
    expect(parts.map((part) => part.props['data-gw-progress-settle-part'])).toEqual([2, 1, 1, 2])
    // Every width is a count over the six declared rows, not an estimate.
    expect(parts.map((part) => (part.props['style'] as { width: string }).width)).toEqual(['33.3%', '16.7%', '16.7%', '33.3%'])
    const legend = walk(tree).find((element) => element.props['data-gw-progress-settle-legend'] === true)!
    expect(texts(legend).join('')).toBe('2 完成 · 1 失败 · 1 已取消 · 2 未结算')
  })

  it('keeps the bar on a run that declared nothing and names the gap instead of an empty result', () => {
    const tree = treeOf([], 'completed')
    const bar = walk(tree).find((element) => element.props['data-gw-progress-settle'] === true)!
    expect(bar.props['data-empty']).toBe('true')
    expect(walk(tree).some((element) => typeof element.props['data-gw-progress-settle-part'] === 'number')).toBe(false)
    expect(texts(tree).join('\n')).toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.settle.unsettled'])
  })

  it('draws one duration rail per spine segment, scaled to the slowest stage of the run', () => {
    const tree = treeOf([
      progressMember(1, '执行', 'completed', { startedAt: 1_000, endedAt: 5_000 }),
      progressMember(2, '检查', 'completed', { startedAt: 6_000, endedAt: 8_000 }),
      progressMember(3, '汇总', 'completed'),
    ], 'completed')
    const rails = walk(tree).filter((element) => element.props['data-gw-progress-dur'] === true)
    // The spine is the template, so the rail count follows the six stages, never the plan.
    expect(rails).toHaveLength(progress.stages.length)
    const railOf = (key: string): Element => {
      const node = walk(tree).find((element) => element.props['data-node-key'] === key)!
      return walk(node).find((element) => element.props['data-gw-progress-dur'] === true)!
    }
    const fillOf = (key: string): Element | undefined => walk(railOf(key)).find((element) => element.type === 'i')
    // 4 s against the run's slowest stage (4 s) fills the rail; 2 s is half of it.
    expect(railOf('stage:execute').props['data-empty']).toBeUndefined()
    expect((fillOf('stage:execute')!.props['style'] as { width: string }).width).toBe('100%')
    expect((fillOf('stage:verify')!.props['style'] as { width: string }).width).toBe('50%')
    // A settled row whose stream carried no timestamps is "not measured": a dashed rail,
    // never a zero-length fill that would read as a fast stage.
    expect(railOf('stage:synthesize').props['data-empty']).toBe('true')
    expect(fillOf('stage:synthesize')).toBeUndefined()
  })

  it('hides the measured wires under 480px, where the spine stacks and the band takes the width', () => {
    expect(progress.css).toMatch(/@media \(max-width: 480px\)[\s\S]*\.gw-progress-link, \.gw-progress-wires \{ display: none/)
  })

  it('wraps the task name in CSS instead of ellipsizing it (Q10 b)', () => {
    // A full label in the DOM is still a truncated label on screen if the stylesheet
    // clips it, so the two halves are pinned together.
    expect(progress.css).toMatch(/\.gw-progress-task-name \{[^}]*overflow-wrap: anywhere/)
    expect(progress.css).not.toMatch(/\.gw-progress-task-name \{[^}]*text-overflow: ellipsis/)
  })

  it('shows the whole task name and no attempt counter on the card (Q10 b)', () => {
    // The panel used to print `任务 n · <24 字>… 1/1`: the name was cut short and the
    // attempt count answered a question nobody asked. The name now wraps in full and
    // the count is gone — the attempts a failure spent stay on that row's own pills.
    const name = '任务 1 · 把认证中间件的每个 provider 统一到同一个时钟上再重跑全部用例'
    const tree = treeOf([progressMember(1, name, 'completed')], 'completed')
    const card = walk(tree).find((element) => typeof element.props['data-gw-progress-task'] === 'string')!
    const cardName = walk(card).find((element) => element.props['data-gw-progress-task-name'] === true)!
    expect(texts(cardName).join('')).toBe(name)
    // No `x/y` suffix anywhere on the card, and no truncation mark in the name.
    expect(texts(card).join(' ')).not.toMatch(/\d+\s*\/\s*\d+/)
    expect(texts(cardName).join('')).not.toContain('…')
  })

  it('measures a running row against the panel clock, so its time is not blank (Q10 b)', () => {
    // A settled row carries `endedAt` and keeps its measured span. A row still running
    // carries only `startedAt`, so the panel supplies "now" from its own 1 s clock —
    // without it the card had no number at all while the work was happening.
    const tree = treeOf([progressMember(1, '任务 1 · 执行中', undefined, { startedAt: Date.now() - 5_000 })])
    const card = walk(tree).find((element) => typeof element.props['data-gw-progress-task'] === 'string')!
    const meta = walk(card).find((element) => element.props['data-gw-progress-task-meta'] === true)
    expect(meta).toBeDefined()
    expect(texts(meta!).join('')).toMatch(/^\d+\.\d s$/)
  })

  it('keeps the measured time of a settled row instead of ticking it (Q10 b)', () => {
    const tree = treeOf([progressMember(1, '任务 1 · 已完成', 'completed', { startedAt: 1_000, endedAt: 4_000 })], 'completed')
    const card = walk(tree).find((element) => typeof element.props['data-gw-progress-task'] === 'string')!
    const meta = walk(card).find((element) => element.props['data-gw-progress-task-meta'] === true)
    expect(meta).toBeDefined()
    expect(texts(meta!).join('')).toBe('3.0 s')
  })
})

/**
 * Red means *still broken now*, in the bundle the browser actually runs.
 *
 * The typed suite (`test/progress-tab.spec.ts`) states the same rule from the same
 * fixtures; this block pins the four places the reader sees it: the settle bar, the spine
 * segment, the task card, and the row pills that keep the failed attempt's own mark. The
 * connection lines are structure and carry no status colour at all.
 */
describe('client progress tab: red is the current state, not the history', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS
  const t = translator('zh')

  /** Attempt 1 fails on the worker; attempt 2 runs the worker and the verifier cleanly. */
  const recovered: ProgressMember[] = [
    progressMember(1, '任务 2 · 写文档', 'failed', { label: '执行' }),
    progressMember(2, '任务 2 · 写文档', 'completed', { label: '执行（尝试 2）' }),
    progressMember(3, '任务 2 · 写文档', 'completed', { label: '检查（尝试 2）' }),
  ]

  /** The same task, failing both attempts. */
  const stillBroken: ProgressMember[] = [
    progressMember(1, '任务 2 · 写文档', 'failed', { label: '执行' }),
    progressMember(2, '任务 2 · 写文档', 'failed', { label: '执行（尝试 2）' }),
  ]

  function renderOf(members: ProgressMember[], stopReason: string) {
    const run: ProgressRun = { runId: 'r-red', name: '任务团队', anchorSeq: 1, members, stopReason }
    return progress.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
  }

  it('drops the failed attempt out of the bar instead of drawing it red', () => {
    const tree = renderOf([...recovered, progressMember(4, '任务 1 · 读代码', 'completed', { label: '执行' })], 'completed')
    const parts = walk(tree).filter((element) => typeof element.props['data-gw-progress-settle-part'] === 'number')
    // No red segment survives a recovery: the failed row is reported as retried.
    expect(parts.map((part) => part.props['data-tone'])).toEqual(['ok', 'retried'])
    expect(parts.map((part) => part.props['data-gw-progress-settle-part'])).toEqual([3, 1])
    expect(translate('zh', 'progress.settle.retried', { count: 1 })).toBe('1 已重试')
    expect(translate('en', 'progress.settle.retried', { count: 1 })).toBe('1 retried')
  })

  it('keeps the spine green and the card non-red once the retry verified, and keeps the row pill red', () => {
    const tree = renderOf(recovered, 'completed')
    const elements = walk(tree)
    // The spine segment that ran the task: green, no failure dot, no failure badge.
    const execute = elements.find((element) => element.props['data-node-key'] === 'stage:execute')!
    expect(execute.props['data-state']).toBe('done')
    expect(walk(execute).some((element) => element.props['data-gw-progress-faildot'] === true)).toBe(false)
    expect(walk(execute).some((element) => element.props['data-gw-progress-failbadge'] !== undefined)).toBe(false)
    expect(texts(execute).join(' ')).not.toContain('失败')
    // The card itself: done, not failed — its ring is the state mark a reader reads.
    const card = elements.find((element) => typeof element.props['data-gw-progress-task'] === 'string')!
    expect(card.props['data-state']).toBe('done')
    expect(walk(card).find((element) => element.props['data-gw-progress-glyph'] !== undefined)!.props['data-gw-progress-glyph']).toBe('done')
    // …and the failed attempt keeps its own mark on its own pill: that trace is the point.
    const pills = walk(card).filter((element) => typeof element.props['data-gw-progress-pill'] === 'number')
    expect(pills.map((pill) => pill.props['data-state'])).toEqual(['failed', 'done', 'done'])
  })

  it('still shows red in bar, spine and card while the failure is not recovered', () => {
    const tree = renderOf(stillBroken, 'error')
    const elements = walk(tree)
    const parts = walk(tree).filter((element) => typeof element.props['data-gw-progress-settle-part'] === 'number')
    expect(parts.filter((part) => part.props['data-tone'] === 'bad').map((part) => part.props['data-gw-progress-settle-part'])).toEqual([2])
    const execute = elements.find((element) => element.props['data-node-key'] === 'stage:execute')!
    expect(execute.props['data-state']).toBe('failed')
    expect(walk(execute).some((element) => element.props['data-gw-progress-faildot'] === true)).toBe(true)
    const card = elements.find((element) => typeof element.props['data-gw-progress-task'] === 'string')!
    expect(card.props['data-state']).toBe('failed')
    expect(walk(card).find((element) => element.props['data-gw-progress-glyph'] !== undefined)!.props['data-gw-progress-glyph']).toBe('failed')
  })

  it('keeps the failure badge only while the failure is current', () => {
    // A stage-owned row (phase `执行`) is the one place a segment draws the count badge.
    const broken = renderOf([progressMember(1, '执行', 'failed', { label: '执行' })], 'error')
    const brokenExecute = walk(broken).find((element) => element.props['data-node-key'] === 'stage:execute')!
    expect(walk(brokenExecute).find((element) => element.props['data-gw-progress-failbadge'] !== undefined)?.props['data-gw-progress-failbadge']).toBe(1)
    expect(texts(brokenExecute).join(' ')).toContain(translate('zh', 'progress.branch.failedCount', { count: 1 }))
    // Recovered: the same segment loses the badge and the failed-row sentence.
    const healed = renderOf([
      progressMember(1, '执行', 'failed', { label: '执行' }),
      progressMember(2, '执行', 'completed', { label: '执行（尝试 2）' }),
    ], 'completed')
    const healedExecute = walk(healed).find((element) => element.props['data-node-key'] === 'stage:execute')!
    expect(healedExecute.props['data-state']).toBe('done')
    expect(walk(healedExecute).some((element) => element.props['data-gw-progress-failbadge'] !== undefined)).toBe(false)
    expect(texts(healedExecute).join(' ')).not.toContain(translate('zh', 'progress.branch.failedCount', { count: 1 }))
  })

  it('draws the connection wires neutral: no state tone, no dash, one border-token stroke', () => {
    const wires = progress.measureWires({
      querySelectorAll: (selector: string) => selector === '[data-gw-progress-task]'
        ? [{
          getAttribute: (name: string) => (name === 'data-owner' ? 'stage:execute' : name === 'data-gw-progress-task' ? 'phase:任务 2 · 写文档' : 'failed'),
          getBoundingClientRect: () => ({ top: 240, left: 40, height: 80, width: 1300 }),
        }]
        : [],
      querySelector: (selector: string) => {
        if (selector === '[data-gw-progress-track]') return { getBoundingClientRect: () => ({ top: 100, bottom: 188, left: 0, width: 1440, height: 88 }) } as never
        if (selector.startsWith('.gw-progress-track')) return { querySelector: () => ({ getBoundingClientRect: () => ({ left: 432, width: 28 }) }), getAttribute: () => 'failed' } as never
        return null
      },
      getBoundingClientRect: () => ({ top: 100, left: 0, width: 1440, height: 500 }),
    } as never)
    // A failed owner still measures to the same geometry: status never reaches the line.
    // One ring drop, one card stub, and the band's single shared rail.
    expect(wires.paths.map(path => path.kind)).toEqual(['trunk', 'branch', 'rail'])
    for (const path of wires.paths) {
      expect('tone' in path).toBe(false)
      expect('style' in path).toBe(false)
    }
    // Nothing in the bundle can colour a wire from a state any more: the style helper that
    // took a tone is gone, so no rendering path can reattach one.
    const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
    expect(source).not.toContain('progressWireStyle')
    expect(source).not.toMatch(/'data-tone': path\.tone/)
    // The neutral stroke is a border token, so the line follows the theme and claims no state.
    expect(progress.css).toMatch(/\.gw-progress-wire \{[^}]*stroke: var\(--dsw-alias-border-l2/)
    expect(progress.css).toMatch(/\.gw-progress-wire-head \{[^}]*fill: var\(--dsw-alias-border-l2/)
    expect(progress.css).not.toMatch(/\.gw-progress-wire[^{]*\{[^}]*state-error/)
    expect(progress.css).not.toMatch(/strokeDasharray/)
  })
})


/* ------------------------------------------------------------------ loop switch -- */

/**
 * The composer tool-row loop switch: the *user's* half of the repeat-run feature.
 *
 * Three things are pinned here, and none of them is cosmetic:
 * 1. **One operation, two callers.** The switch posts to the route `src/loop.ts` names,
 *    with the actions the `grok_loop` tool's own schema declares. If either drifts, the
 *    UI and the tool stop talking about the same loop and this suite says so.
 * 2. **User-only.** The tool refuses `open`; the browser path is the only one that opens.
 *    That asymmetry is the authorization, so it is asserted in the same test as the shared
 *    action list rather than trusted to a comment.
 * 3. **The composer tool row, and nothing else.** The switch is additive in
 *    `conversation.input.right` — the row's own list slot, rendered just before the model
 *    selector — and that selector is not read, moved or referenced.
 */
describe('client composer tool row: the loop switch (one Host operation, two callers)', () => {
  const SESSION = '2d7bd1e7-1111-2222-3333-444455556666'
  const zhDict = bundle.GROK_WORKFLOW_DICT['zh']!
  const enDict = bundle.GROK_WORKFLOW_DICT['en']!
  const loop = bundle.GROK_WORKFLOW_LOOP

  /** The switch section of the bundle source, for the "touches nothing else" checks. */
  const switchSource = (() => {
    const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
    const start = source.indexOf('// ─── Composer tool row: the two heartbeat switches')
    const end = source.indexOf('/** Required services for the page')
    expect(start, 'the heartbeat switch section is in the bundle').toBeGreaterThan(0)
    expect(end, 'the section ends where the page registration begins').toBeGreaterThan(start)
    return source.slice(start, end)
  })()

  it('pins the route and the action list to the Host, and the tool still refuses to open', async () => {
    // The path is the Host's own constant, not a second spelling of it.
    expect(loop.routePath).toBe(LOOP_ROUTE_PATH)

    const tool = createLoopTool({
      open: async () => ({ open: false, sessionId: SESSION }),
      close: async () => ({ open: false, sessionId: SESSION }),
      status: async () => ({ open: false, sessionId: SESSION }),
      stopAll: async () => 0,
      forgetSession: async () => 0,
    } as never)
    expect(tool.name).toBe(LOOP_TOOL_NAME)
    // The tool's schema is the Host's declaration of what a loop request may say; the
    // switch sends from the same set, so a new action cannot exist on one side only.
    const parameters = tool.parameters as unknown as { properties: { action: { enum: string[] } } }
    expect([...loop.actions].sort()).toEqual([...parameters.properties.action.enum].sort())

    // User-only, structurally: the agent path is refused before it reaches Schedule …
    await expect(tool.execute({ action: 'open' } as never, { agent: { session: { id: SESSION } } } as never))
      .rejects.toMatchObject({ code: 'loop/user-only' })
    // … and the browser path is the one that carries no acting Agent. A click is the
    // user's grant; there is no other caller that can reach it.
    const { posted, fetchImpl } = scriptedFetch([{ body: { ok: true, loop: { open: true, sessionId: SESSION } } }])
    const answer = await loop.open(SESSION, fetchImpl)
    expect(answer.ok).toBe(true)
    expect(posted).toEqual([{ action: 'open', sessionId: SESSION }])
  })

  it('keeps the self-iterate switch on its own route and its own slot', async () => {
    // Two switches, two Host routes: a click on one must never reach the other's
    // service, which is what keeps the loop and the RSI heartbeat independent.
    const iterate = bundle.GROK_WORKFLOW_ITERATE
    expect(iterate.routePath).toBe(ITERATE_ROUTE_PATH)
    expect(iterate.routePath).not.toBe(loop.routePath)
    expect(iterate.switchId).not.toBe(loop.switchId)

    const iterateCall = scriptedFetch([{ body: { ok: true, loop: { open: true, sessionId: SESSION } } }])
    await iterate.open(SESSION, iterateCall.fetchImpl)
    expect(iterateCall.urls).toEqual([ITERATE_ROUTE_PATH])
    // No prompt and no interval: the stored template is the one source of that text.
    expect(iterateCall.posted).toEqual([{ action: 'open', sessionId: SESSION }])

    const loopCall = scriptedFetch([{ body: { ok: true, loop: { open: true, sessionId: SESSION } } }])
    await loop.open(SESSION, loopCall.fetchImpl)
    expect(loopCall.urls).toEqual([LOOP_ROUTE_PATH])
  })

  it('posts to the Host route with the browser credential and reads the answer back', async () => {
    const { posted, urls, fetchImpl } = scriptedFetch([
      { body: { ok: true, loop: { open: true, sessionId: SESSION, intervalMinutes: 60, rounds: 10 } } },
    ])
    const calls: Array<Record<string, unknown>> = []
    const recording = async (url: string, init: Record<string, unknown>) => {
      calls.push({ url, ...init })
      return fetchImpl(url, init)
    }
    const answer = await loop.read(SESSION, recording)
    expect(answer).toEqual({ ok: true, loop: { open: true, sessionId: SESSION, intervalMinutes: 60, rounds: 10 } })
    expect(urls).toEqual([LOOP_ROUTE_PATH])
    expect(calls[0]!['method']).toBe('POST')
    // Same-origin cookie, no bespoke credential: the composition's own fence authenticates it.
    expect(calls[0]!['credentials']).toBe('include')
    expect((calls[0]!['headers'] as Record<string, string>)['content-type']).toBe('application/json')
    expect(posted).toEqual([{ action: 'status', sessionId: SESSION }])
  })

  it('reports a refusal as a refusal instead of a state change', async () => {
    // A stated refusal keeps its code so the switch can say something actionable.
    expect(loop.parsePayload({ ok: false, code: 'loop/user-only', error: 'user only' }, 403))
      .toEqual({ ok: false, code: 'loop/user-only', error: 'user only' })
    // An answer the route never sends (a proxy page, an empty 500) is not a snapshot.
    expect(loop.parsePayload('<html>', 502)).toMatchObject({ ok: false, code: 'loop/response' })
    expect(loop.parsePayload(undefined, 500)).toMatchObject({ ok: false, code: 'loop/response' })
    // A 403 with an unreadable body is still the user-only refusal: the status says so.
    expect(loop.parsePayload(undefined, 403)).toMatchObject({ ok: false, code: 'loop/user-only' })

    const offline = scriptedFetch([{ throws: true }])
    expect(await loop.read(SESSION, offline.fetchImpl)).toMatchObject({ ok: false, code: 'loop/transport' })
    // Without a fetch at all (a non-page evaluator) the switch says so instead of throwing.
    expect(await loop.read(SESSION, null)).toMatchObject({ ok: false, code: 'loop/transport' })
  })

  it('mounts in the tool row beside the model selector only, additive, and with the namespace when one exists', () => {
    const registered: Array<{ options: Record<string, unknown>, component: unknown }> = []
    const ctx = (refuse = false) => ({
      slots: {
        inject: (_name: string, factory: () => unknown) => factory(),
        register: (options: Record<string, unknown>, component: unknown) => {
          if (refuse) throw new Error('slot refused')
          registered.push({ options, component })
          return () => {}
        },
      },
    })
    const warn = console.warn
    console.warn = () => {}
    try {
      loop.mount(ctx(), { locale: { bind: () => translator('zh') } })
      expect(registered).toHaveLength(1)
      // The tool row's own list slot: the shell renders it immediately before
      // `conversation.input.model`, so this entry sits left of the model selector.
      expect(registered[0]!.options['name']).toBe('conversation.input.right')
      expect(registered[0]!.options['id']).toBe(loop.switchId)
      expect(registered[0]!.options['order']).toBe(loop.switchOrder)
      // A fresh id in a `list` slot: this adds a row, it does not replace a shipped one.
      expect(registered[0]!.options['locale']).toBe('grok-workflow')
      expect(registered[0]!.component).toBe(loop.component)

      // No locale face ⇒ no namespace on the entry, exactly like the settings page.
      loop.mount(ctx(), {})
      expect(registered[1]!.options['locale']).toBeUndefined()

      // A refusing registry costs the switch and nothing else: no throw out of `apply`.
      expect(loop.mount(ctx(true), {})).toBeUndefined()
    } finally {
      console.warn = warn
    }
  })

  it('never reaches for the model selector or any DOM outside its own row', () => {
    const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
    expect(source).not.toMatch(/conversation\.input\.model/)
    // The ambient strip under the card is no longer a mount point: the switches belong to
    // the tool row, so the old slot must not creep back in as a second registration.
    expect(source).not.toMatch(/conversation\.composer\.dock/)
    // The switch renders through React and posts through fetch; it never queries the page.
    expect(switchSource).not.toMatch(/querySelector/)
    expect(switchSource).not.toMatch(/getElementById/)
  })

  it('carries its copy in both languages, and neither falls back to a key id', () => {
    const keys = Object.keys(enDict).filter((key) => key.startsWith('loop.switch.'))
    expect(keys.length).toBeGreaterThanOrEqual(8)
    for (const key of keys) {
      expect(zhDict[key], key).toBeTypeOf('string')
      expect(zhDict[key], key).not.toBe(enDict[key])
    }
    // The one line the switch renders resolves through the seated translator in each language.
    const closed = { phase: 'ready', loop: { open: false } }
    expect(loop.text(translator('zh'), closed)).toBe(zhDict['loop.switch.off'])
    expect(loop.text(translator('en'), closed)).toBe(enDict['loop.switch.off'])
  })


  it('reads the loop on mount, and stays inert until it knows the state', async () => {
    const loaded = loadSwitchBundle()
    const { posted, fetchImpl } = scriptedFetch([{ body: { ok: true, loop: { open: false, sessionId: SESSION } } }])
    const view = mountSwitch(loaded.component, { sessionId: SESSION, t: translator('zh'), loopSend: fetchImpl })
    const { first, tree } = await view.mount()

    // Before the answer arrives a click would guess; the switch refuses to guess.
    expect(toggleOf(first).props['disabled']).toBe(true)
    expect(texts(first).join(' ')).toContain(zhDict['loop.switch.reading'])

    expect(posted).toEqual([{ action: 'status', sessionId: SESSION }])
    expect(toggleOf(tree).props['aria-checked']).toBe(false)
    expect(toggleOf(tree).props['disabled']).toBe(false)
    expect(texts(tree).join(' ')).toContain(zhDict['loop.switch.off'])
  })

  it('opens on a click and closes on the next one, through the shared Host operation', async () => {
    const loaded = loadSwitchBundle()
    const { posted, fetchImpl } = scriptedFetch([
      { body: { ok: true, loop: { open: false, sessionId: SESSION } } },
      { body: { ok: true, loop: { open: true, sessionId: SESSION, intervalMinutes: 10, rounds: 3 } } },
      { body: { ok: true, loop: { open: false, sessionId: SESSION } } },
    ])
    const view = mountSwitch(loaded.component, { sessionId: SESSION, t: translator('zh'), loopSend: fetchImpl })
    const { tree } = await view.mount()

    const opened = await view.click(tree)
    expect(posted[1]).toEqual({ action: 'open', sessionId: SESSION })
    expect(toggleOf(opened).props['aria-checked']).toBe(true)
    expect(texts(opened).join(' ')).toContain(translate('zh', 'loop.switch.on', { minutes: '10', rounds: '3' }))

    const closed = await view.click(opened)
    expect(posted[2]).toEqual({ action: 'close', sessionId: SESSION })
    expect(toggleOf(closed).props['aria-checked']).toBe(false)
    expect(texts(closed).join(' ')).toContain(zhDict['loop.switch.off'])
  })

  it('says why a refused open did nothing, and does not flip anyway', async () => {
    const loaded = loadSwitchBundle()
    const { fetchImpl } = scriptedFetch([
      { body: { ok: true, loop: { open: false, sessionId: SESSION } } },
      { status: 403, body: { ok: false, code: 'loop/user-only', error: 'user only' } },
    ])
    const view = mountSwitch(loaded.component, { sessionId: SESSION, t: translator('en'), loopSend: fetchImpl })
    const { tree } = await view.mount()
    const refused = await view.click(tree)
    expect(toggleOf(refused).props['aria-checked']).toBe(false)
    expect(walk(refused).find((element) => element.props['data-loop-state'] === 'failed')).toBeDefined()
    expect(texts(refused).join(' ')).toContain(enDict['loop.switch.userOnly'])
  })

  it('reports a Host without a scheduler in its own words, and stays off', async () => {
    const loaded = loadSwitchBundle()
    const { fetchImpl } = scriptedFetch([
      { status: 503, body: { ok: false, code: 'loop/unavailable', error: 'no schedule service' } },
    ])
    const view = mountSwitch(loaded.component, { sessionId: SESSION, t: translator('zh'), loopSend: fetchImpl })
    const { tree } = await view.mount()
    expect(toggleOf(tree).props['aria-checked']).toBe(false)
    expect(texts(tree).join(' ')).toContain(zhDict['loop.switch.unavailable'])
  })

  it('uses the page fetch on the production path, not loopSend itself', async () => {
    const loaded = loadSwitchBundle()
    // Regression for the dead switch: the component's own default for `send` was
    // `loopSend`, but that function already takes the loop body shape — passing it as
    // the fetch made every read answer `loop/response` with an undefined status and
    // left the switch inert with `续跑服务没有回应：the loop route answered HTTP undefined`.
    const { posted, fetchImpl } = scriptedFetch([
      { body: { ok: true, loop: { open: false, sessionId: SESSION } } },
    ])
    const realFetch = (globalThis as unknown as { fetch?: unknown }).fetch
    ;(globalThis as unknown as { fetch?: unknown }).fetch = fetchImpl
    try {
      const view = mountSwitch(loaded.component, { sessionId: SESSION, t: translator('zh') })
      const { tree } = await view.mount()
      expect(posted).toEqual([{ action: 'status', sessionId: SESSION }])
      expect(toggleOf(tree).props['disabled']).toBe(false)
      expect(texts(tree).join(' ')).toContain(zhDict['loop.switch.off'])
    } finally {
      ;(globalThis as unknown as { fetch?: unknown }).fetch = realFetch
    }
  })

  it('renders inert copy instead of a switch when there is no session', async () => {
    const loaded = loadSwitchBundle()
    const { posted, fetchImpl } = scriptedFetch([])
    const view = mountSwitch(loaded.component, { t: translator('zh'), loopSend: fetchImpl })
    const { tree } = await view.mount()
    expect(toggleOf(tree).props['disabled']).toBe(true)
    expect(texts(tree).join(' ')).toContain(zhDict['loop.switch.noSession'])
    // Nothing was asked of the Host: there is no session to ask about.
    expect(posted).toEqual([])
  })

  /* ------------- both switches on the production path: real fetch, real route, real service ------------- */

  /**
   * The v0.11.21 lesson, extended to both switches: no scripted success anywhere.
   *
   * These tests leave the page's own `fetch` untouched and point `document.baseURI`
   * at a real `node:http` server whose handlers are the shipped `handleLoopRoute`
   * driving the shipped `createLoopService` instances over an in-memory Schedule.
   * Every answer the switches render was produced by the service actually storing or
   * deleting a row, and every independence assertion is a fact about the stored rows.
   * A hand-mocked transport cannot pass these; a broken default `send` cannot either.
   */
  it('drives both switches through the real page fetch into the real routes and services', async () => {
    const rows: Array<{ id: string, title: string, prompt: string, kind: string, rrule?: string, scheduledAt: string, status: string, target: { kind: string, sessionId?: string } }> = []
    let nextId = 1
    const schedule = {
      async create(request: { title: string, prompt: string, timing: { kind: 'rrule', rrule: string }, target: { kind: 'session', sessionId: string } }) {
        const row = {
          id: `task-${nextId++}`, title: request.title, prompt: request.prompt,
          kind: request.timing.kind, rrule: request.timing.rrule,
          scheduledAt: '2026-11-20T01:00:00.000Z', status: 'active',
          target: { kind: request.target.kind, sessionId: request.target.sessionId },
        }
        rows.push(row)
        return row
      },
      async catalog() { return rows.map(row => ({ ...row })) },
      async edit(request: { id: string, action: string, patch?: { prompt?: string, active?: boolean, timing?: { kind: 'rrule', rrule: string } } }) {
        const row = rows.find(candidate => candidate.id === request.id)
        if (request.action === 'delete') {
          if (row === undefined) throw new Error('no such task')
          rows.splice(rows.indexOf(row), 1)
          return undefined
        }
        if (row === undefined) throw new Error('no such task')
        if (request.patch?.prompt !== undefined) row.prompt = request.patch.prompt
        if (request.patch?.active !== undefined) row.status = request.patch.active ? 'active' : 'paused'
        if (request.patch?.timing !== undefined) row.rrule = request.patch.timing.rrule
        return row
      },
    }
    const logger = { info: () => {}, warn: () => {}, error: () => {} } as never
    const loopService = createLoopService({
      schedule: () => schedule as never,
      logger,
      policy: () => loopPolicyFromConfig(0, 0, 10, 3),
    })
    const iterateService = createLoopService({
      schedule: () => schedule as never,
      logger,
      identity: { title: ITERATE_TASK_TITLE, defaultPrompt: () => DEFAULT_ITERATE_TEMPLATE },
      policy: () => loopPolicyFromConfig(0, 0, 10, 3),
    })
    const server = createServer((req, res) => {
      const path = (req.url ?? '').split('?')[0]!
      if (path === LOOP_ROUTE_PATH) return void handleLoopRoute(loopService, undefined, req, res)
      if (path === ITERATE_ROUTE_PATH) return void handleLoopRoute(iterateService, undefined, req, res, dispatchIterateAction)
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const baseURI = `http://127.0.0.1:${address.port}/`
    const previousDocument = (globalThis as unknown as { document?: unknown }).document
    ;(globalThis as unknown as { document?: unknown }).document = { baseURI }
    try {
      // Both bundles, loaded the way the host loads them (no transport override).
      const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
      let registration: { factory: (require: (id: string) => unknown) => Record<string, unknown> } | undefined
      const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
      const previousWindow = record.window
      record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
      try { new Function(source)() } finally { record.window = previousWindow }
      const loaded = registration!.factory((id) => {
        if (id === 'react') return switchReact
        throw new Error(`the bundle must not require ${id} at load time`)
      })
      const loopSwitch = loaded['GROK_WORKFLOW_LOOP'] as LoopSwitchBundle
      const iterateSwitch = loaded['GROK_WORKFLOW_ITERATE'] as LoopSwitchBundle
      expect(iterateSwitch.routePath).toBe(ITERATE_ROUTE_PATH)

      // The loop switch: mount (status read over real HTTP), click open, click close.
      expect(loopSwitch.url()).toContain('/grok-workflow/loop')
      const loopView = mountSwitch(loopSwitch.component, { sessionId: SESSION, t: translator('zh') })
      const { tree: loopTree } = await loopView.mount()
      expect(texts(loopTree).join(' ')).toContain(zhDict['loop.switch.off'])
      const loopOpened = await loopView.click(loopTree)
      // The real service answered: the rule it stored (floor 60, 10 rounds) is what renders.
      expect(texts(loopOpened).join(' ')).toContain(translate('zh', 'loop.switch.on', { minutes: '60', rounds: '10' }))
      expect(rows.map(row => row.title)).toEqual([LOOP_TASK_TITLE])
      const loopClosed = await loopView.click(loopOpened)
      expect(texts(loopClosed).join(' ')).toContain(zhDict['loop.switch.off'])
      expect(rows).toHaveLength(0)

      // The iterate switch: same walk, and the stored prompt is the profile template.
      const iterateView = mountSwitch(iterateSwitch.component, { sessionId: SESSION, t: translator('zh') }, 'iterate')
      const { tree: iterateTree } = await iterateView.mount()
      expect(texts(iterateTree).join(' ')).toContain(zhDict['iterate.switch.off'])
      const iterateOpened = await iterateView.click(iterateTree)
      expect(texts(iterateOpened).join(' ')).toContain(translate('zh', 'iterate.switch.on', { minutes: '60', rounds: '10' }))
      expect(rows.map(row => row.title)).toEqual([ITERATE_TASK_TITLE])
      expect(rows[0]!.prompt).toBe(DEFAULT_ITERATE_TEMPLATE)
      // The loop slot is untouched by the iterate open: a fresh read of the loop
      // route answers closed over real HTTP.
      const loopRead = await loopSwitch.read(SESSION)
      expect(loopRead).toMatchObject({ ok: true, loop: { open: false } })
      // A body that tries to override the prompt is ignored: the template governs.
      const smuggled = await iterateSwitch.send({ action: 'open', sessionId: SESSION, prompt: 'not the template', intervalMinutes: 3 })
      expect(smuggled).toMatchObject({ ok: true, loop: { open: true } })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.prompt).toBe(DEFAULT_ITERATE_TEMPLATE)
      const iterateFinal = await iterateView.click(iterateOpened)
      expect(texts(iterateFinal).join(' ')).toContain(zhDict['iterate.switch.off'])
      expect(rows).toHaveLength(0)
    } finally {
      ;(globalThis as unknown as { document?: unknown }).document = previousDocument
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

/**
 * The composer tool-row workflow switch: `/grok on|off` as a third button.
 *
 * It sits beside auto-continue and self-iterate and touches neither: no interval, no
 * Schedule task, no `open`/`close` — only the session record `plugin:grok-workflow/mode`
 * that `src/mode.ts` owns, which is the record `src/gate.ts` reads and the record the
 * slash command writes. What is pinned here:
 *
 * 1. **The contract with the Host.** Route path, action list and answer shape are
 *    asserted as written, so the button and the route cannot drift into two protocols.
 * 2. **The toggle is real.** A click posts `set` with the flipped value and repaints
 *    from the Host's answer, not from its own optimism.
 * 3. **Off reads as off.** The word, the lamp and the pill all say off, and the on-copy
 *    is absent — an off switch must never look like work still running.
 * 4. **Its own row only.** No stylesheet rule, no DOM query, and no read of a neighbour
 *    switch's attributes.
 */
describe('client composer tool row: the workflow switch (`/grok on|off` as a button)', () => {
  const SESSION = '2d7bd1e7-1111-2222-3333-444455556666'
  const MODE = '/grok-workflow/mode'
  const zhDict = bundle.GROK_WORKFLOW_DICT['zh']!
  const enDict = bundle.GROK_WORKFLOW_DICT['en']!

  const modeSwitch = (): ModeSwitchBundle => loadSwitchExports()['GROK_WORKFLOW_MODE'] as ModeSwitchBundle
  /** The workflow switch's own section of the bundle, for the "touches nothing else" checks. */
  const modeSource = (() => {
    const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
    const start = source.indexOf('const MODE_ROUTE_PATH')
    const end = source.indexOf('/** Required services for the page')
    expect(start, 'the workflow switch section is in the bundle').toBeGreaterThan(0)
    expect(end, 'the section ends where the page registration begins').toBeGreaterThan(start)
    return source.slice(start, end)
  })()

  it('pins the route, the action list and the body shapes to the Host contract', async () => {
    const mode = modeSwitch()
    expect(mode.routePath).toBe(MODE)
    expect(mode.switchId).toBe('grok-workflow-mode')
    expect(mode.actions).toEqual(['status', 'set'])
    expect(mode.url()).toBe(MODE)

    // A read is a read: one POST, the session, nothing else.
    const read = scriptedFetch([{ body: { ok: true, action: 'status', mode: { enabled: false } } }])
    expect(await mode.read(SESSION, read.fetchImpl)).toEqual({ ok: true, mode: { enabled: false } })
    expect(read.urls).toEqual([MODE])
    expect(read.posted).toEqual([{ action: 'status', sessionId: SESSION }])

    // A write names the value it wants, so the switch never has to trust its own view.
    const on = scriptedFetch([{ body: { ok: true, action: 'set', mode: { enabled: true } } }])
    expect(await mode.set(SESSION, true, on.fetchImpl)).toEqual({ ok: true, mode: { enabled: true } })
    expect(on.posted).toEqual([{ action: 'set', sessionId: SESSION, enabled: true }])
    const off = scriptedFetch([{ body: { ok: true, action: 'set', mode: { enabled: false } } }])
    await mode.set(SESSION, false, off.fetchImpl)
    expect(off.posted).toEqual([{ action: 'set', sessionId: SESSION, enabled: false }])
  })

  it('refuses to report a state a body does not carry', () => {
    const mode = modeSwitch()
    // `ok` without the record is not "on" and not "off": it is a refusal to report.
    expect(mode.parsePayload({ ok: true, action: 'status' }, 200))
      .toMatchObject({ ok: false, code: 'mode/internal' })
    expect(mode.parsePayload({ ok: true, mode: { enabled: 'yes' } }, 200))
      .toMatchObject({ ok: false, code: 'mode/internal' })
    // A proxy page or an empty 500 is not a snapshot either.
    expect(mode.parsePayload('<html>', 502)).toMatchObject({ ok: false, code: 'mode/internal' })
    expect(mode.parsePayload(undefined, 500)).toMatchObject({ ok: false, code: 'mode/internal' })
    // The fence's own 403 means "no accepted user credential"; the record is not the issue.
    expect(mode.parsePayload(undefined, 403)).toMatchObject({ ok: false, code: 'mode/session' })
    // A stated code survives, so the route's own vocabulary reaches the sentence.
    expect(mode.parsePayload({ ok: false, code: 'mode/persist', error: 'disk said no' }, 503))
      .toEqual({ ok: false, code: 'mode/persist', error: 'disk said no' })
    // No transport at all is a transport failure, never a throw.
    expect(mode.parsePayload(undefined, undefined as unknown as number)).toMatchObject({ ok: false })
  })

  it('falls back to a GET read when the POST is refused with 405', async () => {
    const mode = modeSwitch()
    const { methods, fetchImpl } = scriptedFetch([
      { status: 405 },
      { body: { ok: true, action: 'status', mode: { enabled: true } } },
    ])
    expect(await mode.read(SESSION, fetchImpl)).toEqual({ ok: true, mode: { enabled: true } })
    expect(methods).toEqual(['POST', 'GET'])
  })

  it('names the refused method when both the POST and the GET fallback are refused', async () => {
    const mode = modeSwitch()
    const { methods, fetchImpl } = scriptedFetch([{ status: 405 }, { status: 405 }])
    expect(await mode.read(SESSION, fetchImpl)).toMatchObject({ ok: false, code: 'mode/method' })
    expect(methods).toEqual(['POST', 'GET'])
    // A write is never retried over GET: the POST is the only way to move the switch.
    const write = scriptedFetch([{ status: 405 }])
    expect(await mode.set(SESSION, true, write.fetchImpl)).toMatchObject({ ok: false, code: 'mode/method' })
    expect(write.methods).toEqual(['POST'])
  })

  it('reports a dead transport as a failure instead of a state change', async () => {
    const mode = modeSwitch()
    const closed = scriptedFetch([{ throws: true }])
    expect(await mode.read(SESSION, closed.fetchImpl)).toMatchObject({ ok: false, code: 'mode/transport' })
    expect(await mode.set(SESSION, true, closed.fetchImpl)).toMatchObject({ ok: false, code: 'mode/transport' })
  })

  it('reads on mount, stays inert until it knows, and repaints what the Host answered', async () => {
    const mode = modeSwitch()
    const { posted, fetchImpl } = scriptedFetch([
      { body: { ok: true, action: 'status', mode: { enabled: true, setBy: 'command:/grok' } } },
      { body: { ok: true, action: 'set', mode: { enabled: false, setBy: 'switch:mode' } } },
    ])
    const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
    const { first, tree } = await view.mount()

    // Before the answer arrives a click would guess at the gate; the switch refuses.
    expect(toggleIn(first).props['disabled']).toBe(true)
    expect(texts(first).join(' ')).toContain(zhDict['mode.switch.reading'])
    expect(posted).toEqual([{ action: 'status', sessionId: SESSION }])

    expect(toggleIn(tree).props['disabled']).toBe(false)
    expect(toggleIn(tree).props['aria-checked']).toBe(true)
    expect(texts(tree).join(' ')).toContain(zhDict['mode.switch.on'])
    expect(lampIn(tree)).toBe('on')

    // The click asks the Host for `off` and paints the answer, not the click.
    const after = await view.click(tree)
    expect(posted[1]).toEqual({ action: 'set', sessionId: SESSION, enabled: false })
    expect(toggleIn(after).props['aria-checked']).toBe(false)
    expect(texts(after).join(' ')).toContain(zhDict['mode.switch.off'])
  })

  it('says off three ways, and never leaves the on-copy on screen', async () => {
    const mode = modeSwitch()
    const { fetchImpl } = scriptedFetch([
      { body: { ok: true, action: 'status', mode: { enabled: false } } },
    ])
    const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
    const { tree } = await view.mount()
    const toggle = toggleIn(tree)

    // The word, the lamp and the pill: a person who only sees the pill still sees grey
    // and a hollow ring, and a person who only reads sees 关.
    expect(toggle.props['aria-checked']).toBe(false)
    expect(texts(tree).join(' ')).toContain(zhDict['mode.switch.off'])
    expect(lampIn(tree)).toBe('off')
    expect((toggle.props['style'] as Record<string, unknown>)['background']).toBe('#d1d5db')
    expect(texts(tree).join(' ')).not.toContain(zhDict['mode.switch.on'])
    // The lamp is decoration, not content: a screen reader hears the switch and the line.
    expect(walk(tree).find((element) => element.props['data-mode-lamp'] !== undefined)!.props['aria-hidden']).toBe('true')
  })

  it('keeps the last known state when the Host refuses the write', async () => {
    const mode = modeSwitch()
    const { fetchImpl } = scriptedFetch([
      { body: { ok: true, action: 'status', mode: { enabled: true } } },
      { status: 403, body: { ok: false, code: 'mode/session', error: 'user only' } },
    ])
    const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('en'), modeSend: fetchImpl }, 'mode')
    const { tree } = await view.mount()
    const refused = await view.click(tree)
    // The toggle did not flip: the record was never written.
    expect(toggleIn(refused).props['aria-checked']).toBe(true)
    expect(walk(refused).find((element) => element.props['data-mode-state'] === 'failed')).toBeDefined()
    expect(texts(refused).join(' ')).toContain(translate('en', 'mode.switch.failed', { message: 'user only' }))
  })

  it('renders inert copy instead of a switch when there is no session', async () => {
    const mode = modeSwitch()
    const { posted, fetchImpl } = scriptedFetch([])
    const view = mountSwitch(mode.component, { t: translator('zh'), modeSend: fetchImpl }, 'mode')
    const { tree } = await view.mount()
    expect(toggleIn(tree).props['disabled']).toBe(true)
    expect(texts(tree).join(' ')).toContain(zhDict['mode.switch.noSession'])
    // Nothing was asked of the Host: there is no session to ask about.
    expect(posted).toEqual([])
  })

  it('retries the read after a failed one instead of writing blind', async () => {
    const mode = modeSwitch()
    const { posted, fetchImpl } = scriptedFetch([
      { throws: true },
      { body: { ok: true, action: 'status', mode: { enabled: false } } },
    ])
    const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
    const { tree } = await view.mount()
    expect(walk(tree).find((element) => element.props['data-mode-state'] === 'failed')).toBeDefined()
    const recovered = await view.click(tree)
    // The click re-read; it did not post a guess at a value it never saw.
    expect(posted[1]).toEqual({ action: 'status', sessionId: SESSION })
    expect(toggleIn(recovered).props['aria-checked']).toBe(false)
    expect(texts(recovered).join(' ')).toContain(zhDict['mode.switch.off'])
  })

  it('mounts in the tool row after the two heartbeats, with the namespace when one exists', () => {
    const mode = modeSwitch()
    const registered: Array<{ options: Record<string, unknown>, component: unknown }> = []
    const ctx = (refuse = false) => ({
      slots: {
        inject: (_name: string, factory: () => unknown) => factory(),
        register: (options: Record<string, unknown>, component: unknown) => {
          if (refuse) throw new Error('slot refused')
          registered.push({ options, component })
          return () => {}
        },
      },
    })
    const warn = console.warn
    console.warn = () => {}
    try {
      mode.mount(ctx(), { locale: { bind: () => translator('zh') } })
      expect(registered).toHaveLength(1)
      // Same slot as the two heartbeats, still left of the model selector.
      expect(registered[0]!.options['name']).toBe('conversation.input.right')
      expect(registered[0]!.options['id']).toBe(mode.switchId)
      // Third in the strip: the two heartbeats keep their orders (90, 91).
      expect(registered[0]!.options['order']).toBe(92)
      expect(registered[0]!.options['order']).toBeGreaterThan((bundle.GROK_WORKFLOW_ITERATE).switchOrder)
      expect(registered[0]!.options['locale']).toBe('grok-workflow')
      expect(registered[0]!.component).toBe(mode.component)

      // No locale face ⇒ no namespace on the entry, exactly like the page and the heartbeats.
      mode.mount(ctx(), {})
      expect(registered[1]!.options['locale']).toBeUndefined()

      // A refusing registry costs this switch and nothing else: no throw out of `apply`.
      expect(mode.mount(ctx(true), {})).toBeUndefined()
    } finally {
      console.warn = warn
    }
  })

  it('carries its copy in both languages, and neither falls back to a key id', () => {
    const keys = Object.keys(enDict).filter((key) => key.startsWith('mode.switch.'))
    expect(keys.length).toBeGreaterThanOrEqual(8)
    for (const key of keys) {
      expect(zhDict[key], key).toBeTypeOf('string')
      expect(zhDict[key], key).not.toBe(enDict[key])
    }
    // The task's own wording, character for character.
    expect(zhDict['mode.switch.label']).toBe('workflow总开关')
    const mode = modeSwitch()
    expect(mode.text(translator('zh'), { phase: 'ready', mode: { enabled: false } })).toBe(zhDict['mode.switch.off'])
    expect(mode.text(translator('en'), { phase: 'ready', mode: { enabled: false } })).toBe(enDict['mode.switch.off'])
    expect(mode.text(translator('zh'), { phase: 'ready', mode: { enabled: true } })).toBe(zhDict['mode.switch.on'])
    expect(mode.text(translator('en'), { phase: 'ready', mode: { enabled: true } })).toBe(enDict['mode.switch.on'])
  })

  it('never reaches for the DOM or a neighbour switch, and adds no stylesheet rule', () => {
    expect(modeSource).not.toMatch(/querySelector/)
    expect(modeSource).not.toMatch(/getElementById/)
    // No page-level CSS: the lamp and the rows are inline styles on this switch's own nodes.
    expect(modeSource).not.toMatch(/h\('style'/)
    // It reads no other switch's attributes and no model selector.
    expect(modeSource).not.toMatch(/data-loop-(toggle|state)|data-iterate-(toggle|state)/)
    expect(modeSource).not.toMatch(/conversation\.input\.model/)
  })
})

/**
 * The workflow switch on the production path: real page fetch, real route, real record.
 *
 * The v0.11.21 lesson applied to the third switch — no scripted success anywhere. The
 * page's own `fetch` posts to a real `node:http` server whose handler is the shipped
 * `handleModeRoute` over a real `Session`; every state the button paints came from the
 * route reading the session's own log, and the click's persistence is asserted by
 * reading that log back with `readModeRecord`. A mocked transport cannot pass this.
 */
describe('client composer tool row: the workflow switch against the real Host route', () => {
  const SESSION = '4b1f0f6a-2222-3333-4444-555566667777'
  const zhDict = bundle.GROK_WORKFLOW_DICT['zh']!

  it('writes the session record a click asks for, and paints only what the route read back', async () => {
    const session = SessionClass.create(SESSION as never)
    const server = createServer((req, res) => {
      const path = (req.url ?? '').split('?')[0]!
      if (path !== CORE_MODE_ROUTE_PATH) {
        res.statusCode = 404
        res.end()
        return
      }
      return void handleModeRoute({
        sessions: { get: (id: string) => (id === SESSION ? session : undefined) },
        // The deployment default: this session has no record yet, and the route (not the
        // button) is what turns that into the state on screen.
        fallback: () => false,
      }, req, res)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const baseURI = `http://127.0.0.1:${address.port}/`
    const previousDocument = (globalThis as unknown as { document?: unknown }).document
    ;(globalThis as unknown as { document?: unknown }).document = { baseURI }
    try {
      const mode = loadSwitchExports()['GROK_WORKFLOW_MODE'] as ModeSwitchBundle
      expect(mode.routePath).toBe(CORE_MODE_ROUTE_PATH)

      const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh') }, 'mode')
      const { tree } = await view.mount()
      // No record: the fallback the route reported (`false`) is what renders, and nothing
      // was written by a read.
      expect(readModeRecord(session)).toBeUndefined()
      expect(toggleIn(tree).props['aria-checked']).toBe(false)
      expect(texts(tree).join(' ')).toContain(zhDict['mode.switch.off'])

      const on = await view.click(tree)
      const written = readModeRecord(session)
      expect(written).toMatchObject({ v: 1, enabled: true, setBy: 'switch:mode', workflowMode: 'full' })
      expect(toggleIn(on).props['aria-checked']).toBe(true)
      expect(texts(on).join(' ')).toContain(zhDict['mode.switch.on'])

      const off = await view.click(on)
      expect(readModeRecord(session)).toMatchObject({ v: 1, enabled: false, setBy: 'switch:mode' })
      expect(readModeRecord(session)!.workflowMode).toBeUndefined()
      expect(toggleIn(off).props['aria-checked']).toBe(false)
      expect(texts(off).join(' ')).toContain(zhDict['mode.switch.off'])
      // The lamp agrees with the record, not with the click count.
      expect(walk(off).find((element) => element.props['data-mode-lamp'] !== undefined)!.props['data-mode-lamp']).toBe('off')
    } finally {
      ;(globalThis as unknown as { document?: unknown }).document = previousDocument
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
