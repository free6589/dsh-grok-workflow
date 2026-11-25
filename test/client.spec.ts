import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CHILD_TIMEOUT_MS, DEFAULT_ITERATE_INTERVAL_MIN, DEFAULT_ITERATE_TEMPLATE, DEFAULT_LOOP_FAIL_STREAK, DEFAULT_LOOP_INTERVAL_MIN, DEFAULT_LOOP_MAX_ROUNDS, DEFAULT_MAX_CONCURRENCY, DEFAULT_MAX_TASKS, DEFAULT_REPLAN, DEFAULT_TIMEOUT_MS, HARD_LIMITS, REMOVED_CONFIG_KEYS } from '../src/config.js'
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
  GROK_WORKFLOW_REMOVED_KEYS: string[]
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
  chipKey: Record<string, string>
  planKey: Record<string, string>
  logStateKey: Record<string, string>
  logRoleKey: Record<string, string>
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
  /** The one-page story: the hand-written mirror of `deriveProgressStory` in `src/progress-tab.ts`. */
  deriveProgressStory(run: ProgressRun): ProgressStory
  createStatus(): { getSnapshot(): string, getMessage(): string | undefined, subscribe(fn: () => void): () => void, set(state: string, message?: string): void }
  recoveredFailures(members: ProgressMember[]): Set<number>
  currentFailureCount(members: ProgressMember[]): number
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
  /** The injection door `apply` uses to hand the switch the sessions face. */
  offerSessions: (face: unknown) => void
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
  /** Draft number the summary gate shipped, when the stream said so. */
  summaryFinalDraft?: number
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

/** One capsule of a plan task's fixed `执行 → 检查 → 复核` chain. */
type ProgressChainSlot = {
  key: string
  members: ProgressMember[]
  state: string
  reached: boolean
}

/** One step of the story's track, as `deriveProgressStory` reports it. */
type ProgressStoryStep = {
  key: string
  number?: number
  title: string
  state: string
  chain: ProgressChainSlot[]
  members: ProgressMember[]
}

/** One line of the story's history. */
type ProgressStoryLogRow = {
  seq: number
  at?: number
  role: string
  title: string
  state: string
  shipped?: true
}

/**
 * The one-page story (`DESIGN-progress-tab.md` §19.2), as the browser bundle derives it.
 *
 * The typed half is `deriveProgressStory` in `src/progress-tab.ts`; this is the shape the
 * hand-written mirror must reproduce field for field, because the two copies cannot import
 * each other.
 */
type ProgressStory = {
  state: string
  steps: ProgressStoryStep[]
  at: number
  total: number
  now: { titleKey?: string, title: string, role?: string }
  attempt?: { n: number, retrying: boolean }
  rest: string[]
  log: ProgressStoryLogRow[]
  final?: { draft: number, label: string, row?: ProgressStoryLogRow }
  dock: string
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
  // the Q8 guardian model, childTimeoutMs, the mid-run replan switch and the
  // 429 switch (Sec.3-2): 15 visible FIELDS
  // (grokDefault/maxConcurrency/maxTasks/timeoutMs/childTimeoutMs,
  // replan, the four loop keys, iterateIntervalMin, the iterateTemplate textarea and
  // guardianModel, switchOnRateLimit) plus the 5 role chains equal the 19-key configuration
  // surface (toolName/roles/synthesis/configVersion are structural and `blockIntake`
  // is load-time only — none of them is rendered here).
  // Number bounds mirror HARD_LIMITS (100 / 20) and the defaults (10 / 3 / 0); the
  // suite pins all three so a quiet drift fails here instead of in the GUI.
  it('renders the visible keys: 14 fields plus the 5 role chains', () => {
    const visible = ['childTimeoutMs', 'grokDefault', 'guardianModel', 'maxConcurrency', 'maxTasks', 'timeoutMs',
      'replan', 'switchOnRateLimit',
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
    // The loop is opt-in; the mid-run replan is on by default (Sec.2-2), so the
    // page's two switches no longer start in the same position.
    expect(defs.get('loopEnabled')?.def).toBe(false)
    // The replan row is the same boolean-switch shape as loopEnabled.
    expect(defs.get('replan')).toMatchObject({ kind: 'boolean', group: 'loop', def: true })
    expect(defs.get('replan')?.def).toBe(DEFAULT_REPLAN)
    expect(DEFAULT_REPLAN).toBe(true)
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
  })

  it('covers the five T5 roles (supervisor added to the four documented ones)', () => {
    expect(bundle.GROK_WORKFLOW_ROLES).toEqual(['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'])
  })

  it('numbers the role cards in execution order (supervise before summarize)', () => {
    // The script runs supervisor after verify and before synthesis, so the
    // card numbers must read 1-2-3-4-5 in that same order.
    expect(ROLE_ORDER).toEqual({ planner: 1, worker: 2, verifier: 3, supervisor: 4, synthesizer: 5 })
  })

  it('carries exactly the removed-key list the config module enforces (D-155)', () => {
    // The page cannot import `src/config.ts` (it is a browser bundle the host serves
    // verbatim), so it ships a copy. The copy is only safe while it stays a copy: both
    // directions are asserted, so a key removed in code cannot go unnamed on the page and
    // a key the page names cannot outlive its removal.
    expect([...bundle.GROK_WORKFLOW_REMOVED_KEYS].sort()).toEqual([...REMOVED_CONFIG_KEYS].sort())
    expect(bundle.GROK_WORKFLOW_REMOVED_KEYS).toHaveLength(REMOVED_CONFIG_KEYS.length)
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

  it('reads the notice route into the keys this build names, in both languages (D-155)', () => {
    // The page half of the load warning: the reader is told which line to delete, in the
    // language the page is in. The list comes from the plugin's own route (the settings
    // document cannot carry it — `projectForm` only walks the schema), and the sentence is
    // composed on this side so a language switch re-renders it.
    const { parseConfigNotices } = bundle.GROK_WORKFLOW_INTERNALS as unknown as {
      parseConfigNotices(payload?: unknown): string[]
    }
    expect(parseConfigNotices({ ok: true, notices: [{ key: 'mode', message: 'x' }, { key: 'legacyGate', message: 'y' }] }))
      .toEqual(['mode', 'legacyGate'])
    // An empty list is "nothing to say", not an error.
    expect(parseConfigNotices({ ok: true, notices: [] })).toEqual([])
    // A key this build does not list as removed is dropped: the page decides what it names.
    expect(parseConfigNotices({ ok: true, notices: [{ key: 'maxTasks' }, { key: 'mode' }] })).toEqual(['mode'])
    // Malformed answers degrade to silence instead of throwing on a settings page.
    expect(parseConfigNotices(undefined)).toEqual([])
    expect(parseConfigNotices('nope')).toEqual([])
    expect(parseConfigNotices({ ok: false, notices: [{ key: 'mode' }] })).toEqual([])
    expect(parseConfigNotices({ ok: true, notices: 'mode' })).toEqual([])
    for (const locale of bundle.GROK_WORKFLOW_LOCALES) {
      const dict = bundle.GROK_WORKFLOW_DICT[locale]!
      expect(dict['warn.removed.title']!.length, locale).toBeGreaterThan(3)
      expect(dict['warn.removed.detail']!.length, locale).toBeGreaterThan(3)
    }
    const sentence = (locale: string): string =>
      bundle.GROK_WORKFLOW_INTERNALS.translate(locale, 'warn.removed.detail', { key: 'mode' })
    expect(sentence('en')).not.toBe('warn.removed.detail')
    expect(sentence('en')).toContain('mode')
    expect(sentence('zh')).not.toBe('warn.removed.detail')
    expect(sentence('zh')).toContain('mode')
    expect(sentence('en')).not.toBe(sentence('zh'))
  })

  it('fetches the notice route once, and stays silent when the Host has no answer (D-155)', async () => {
    const { refreshConfigNotices, configNotices, CONFIG_NOTICES_ROUTE_PATH } = bundle.GROK_WORKFLOW_INTERNALS as unknown as {
      refreshConfigNotices(fetchImpl?: unknown): Promise<string[]>
      configNotices: { set(next: string[]): void, getSnapshot(): string[] }
      CONFIG_NOTICES_ROUTE_PATH: string
    }
    const calls: string[] = []
    const answering = async (url: string): Promise<unknown> => {
      calls.push(url)
      return { status: 200, json: async () => ({ ok: true, notices: [{ key: 'mode', message: 'ignored' }] }) }
    }
    configNotices.set([])
    expect(await refreshConfigNotices(answering)).toEqual(['mode'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(CONFIG_NOTICES_ROUTE_PATH)
    // A transport failure is "no notice", not a page error: the list empties, nothing throws.
    expect(await refreshConfigNotices(async () => { throw new Error('socket closed') })).toEqual([])
    expect(configNotices.getSnapshot()).toEqual([])
    // A 404 (an older Host with no such route) reads the same way.
    expect(await refreshConfigNotices(async () => ({ status: 404, json: async () => ({}) }))).toEqual([])
    // A page with no fetch at all degrades instead of throwing.
    expect(await refreshConfigNotices(undefined)).toEqual([])
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

  it('states the toggle as a reporting default, not a router', () => {
    // 0.13.35 (M3.3) deleted the entry gate: nothing in front of a user message
    // routes, claims or rewrites it. The switch only decides what a session with
    // no `/grok` record reports, so every status line has to name `/grok` as the
    // thing that decides — and the deleted routing claims must not come back.
    const deletedClaims = [
      'master switch', '总开关', 'one serious run', '认真干一次',
      'go through the workflow', '复杂目标走工作流',
      'Work hard by default', '默认下大力气',
    ]
    for (const locale of bundle.GROK_WORKFLOW_LOCALES) {
      const dict = bundle.GROK_WORKFLOW_DICT[locale]!
      for (const key of ['status.on', 'status.on.detail', 'status.off', 'status.off.detail']) {
        expect(dict[key], `${locale} ${key} must name /grok`).toContain('/grok')
      }
      for (const [key, value] of Object.entries(dict)) {
        for (const claim of deletedClaims) {
          expect(value, `${locale} ${key} still claims "${claim}"`).not.toContain(claim)
        }
      }
    }
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
    // Six live registrations: the Plugins card, the same page as a Settings left-column
    // section, the task panel renderer and the three composer tool-row switches
    // (additive, registered last: loop, iterate, mode).
    expect(live()).toHaveLength(6)
    const byId = (id: string) => live().find((entry: { options: Record<string, unknown> }) => entry.options['id'] === id)
    expect(byId('grok-workflow-loop'), 'the loop switch is registered').toBeDefined()
    expect(byId('grok-workflow-iterate'), 'the self-iterate switch is registered').toBeDefined()
    expect(byId('grok-workflow-mode'), 'the workflow switch is registered').toBeDefined()
    expect(live()[0]!.options['name']).toBe('plugins.item')
    expect(live()[0]!.options['locale']).toBe('grok-workflow')
    expect(typeof live()[0]!.options['label']).toBe('function')
    expect((live()[0]!.options['label'] as () => string)()).toBe('Grok workflow')
  })

  it('also mounts the same page as a Settings left-column section named Workflow', () => {
    const locale = fakeLocale('zh')
    const { ctx, live } = fakeContext(locale)
    bundle.apply(ctx)
    // Settings → left column: a peer of 通用 / 模型 / 内置插件. One component, two entry
    // points — the card stays the discoverable one, the section is the direct one.
    const section = live().find((entry: { options: Record<string, unknown> }) => entry.options['name'] === 'settings.section')
    expect(section, 'the settings.section slot is registered').toBeDefined()
    expect(section!.options['id']).toBe('grok-workflow')
    expect(section!.options['locale']).toBe('grok-workflow')
    expect(section!.options['order']).toBe(60)
    expect((section!.options['label'] as () => string)()).toBe('Workflow')
    const card = live().find((entry: { options: Record<string, unknown> }) => entry.options['name'] === 'plugins.item')!
    expect(section!.component, 'one page, two entry points').toBe(card.component)
    // Same inject function, so the page cannot be handed two different faces.
    expect(section!.options['inject']).toBe(card.options['inject'])
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
    expect(live()).toHaveLength(6)
    expect(live()[0]!.options['locale']).toBeUndefined()
    expect(live()[1]!.options['locale']).toBeUndefined()
    // The task panel shadows the stock `workflow-run` renderer by priority (lowest renders);
    // same key at the same priority would fail the stock plugin's whole boot fiber.
    expect(live()[2]!.options['key']).toBe('workflow-run')
    expect(live()[2]!.options['priority']).toBe(-1)
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
    // Both settings entry points, the task-panel renderer and all three switches are
    // mounted, and the `locale` fiber handed back exactly one disposer per injected scope
    // it entered.
    expect(live()).toHaveLength(6)
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
    expect(live()).toHaveLength(6)
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
  /** What the mount effects asked to be run on unmount. */
  const cleanups: Array<() => unknown> = []
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
      for (const effect of effects) {
        const cleanup = await effect()
        if (typeof cleanup === 'function') cleanups.push(cleanup as () => unknown)
      }
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
    /** Repaint from the cells already held, the way React does after a `setState`. */
    render: run,
    /** Flush the promises the last step started (a background read, a write). */
    settle,
    /** Unmount: run each mount effect's cleanup once, as React does. */
    unmount() {
      for (const cleanup of cleanups.splice(0)) cleanup()
    },
  }
}

const toggleOf = (tree: unknown) => walk(tree).find((element) => element.props['data-loop-toggle'] === true)!

/** The workflow switch's own toggle and lamp, found by their own attributes. */
const toggleIn = (tree: unknown) => walk(tree).find((element) => element.props['data-mode-toggle'] === true)!
const lampIn = (tree: unknown) => walk(tree).find((element) => element.props['data-mode-lamp'] !== undefined)
  ?.props['data-mode-lamp']
/**
 * The state line's own words, apart from the row's label. The label and the state words are
 * short enough to overlap as substrings, so a check on the whole row reads as true whatever
 * the state is; these read the one element that is *about* the state.
 */
const noteIn = (tree: unknown) => walk(tree).find((element) => element.props['data-mode-note'] !== undefined)!
const noteText = (tree: unknown) => texts(noteIn(tree)).join('')

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

  it('renders the 429 switch with its label, state word and hint in both languages', () => {
    // The residue this covers: `switchOnRateLimit` had a label and a hint in both
    // dictionaries and was the one declared field with no control drawn for it.
    // Everything below is compared against the dictionary, never against a literal.
    for (const [locale, dict] of [['zh', zhDict], ['en', bundle.GROK_WORKFLOW_DICT['en']!]] as const) {
      const { component, props } = mounted(faceFor(READY))
      const tree = renderPage(component, {
        ...props,
        t: (key: string, params?: Record<string, unknown>) => translate(locale, key, params),
      }).run()
      const row = walk(tree).find(element => element.props['data-field'] === 'switchOnRateLimit')
      expect(row, `${locale} row`).toBeDefined()
      expect(texts(row!).join('\n'), `${locale} label`).toContain(dict['field.switchOnRateLimit']!)
      // The switch is inside that row, and its state word is the page's On/Off pair
      // (no `option.switchOnRateLimit.*` key exists, by design).
      const toggle = walk(row!).find(element => element.props['role'] === 'switch')
      expect(toggle, `${locale} switch`).toBeDefined()
      expect(texts(row!).join('\n'), `${locale} state word`).toContain(dict['option.replan.on']!)
      const hint = walk(tree).find(element => element.props['data-gw-ratelimit-hint'] === true)
      expect(hint, `${locale} hint`).toBeDefined()
      expect(texts(hint!).join(''), `${locale} hint text`).toBe(dict['field.switchOnRateLimit.hint']!)
    }
  })

  it('draws a control for every declared field, in both languages', () => {
    // The guard this residue needed: a field count cannot see a field that is declared
    // and never drawn. This walks the bundle's own field table and demands a row, and
    // its label, for every key in it — so the next field added without a control fails
    // here instead of shipping as dead copy.
    const keys = bundle.GROK_WORKFLOW_FIELDS.map(field => field.key)
    expect(keys).toHaveLength(14)
    for (const [locale, dict] of [['zh', zhDict], ['en', bundle.GROK_WORKFLOW_DICT['en']!]] as const) {
      const { component, props } = mounted(faceFor(READY))
      const tree = renderPage(component, {
        ...props,
        t: (key: string, params?: Record<string, unknown>) => translate(locale, key, params),
      }).run()
      // One row per declared field: `data-field` sits on the row wrapper and, for the
      // plain inputs, on the control inside it too, so compare the set of keys.
      const drawn = new Set(walk(tree)
        .map(element => element.props['data-field'])
        .filter((value): value is string => typeof value === 'string'))
      const rendered = texts(tree).join('\n')
      for (const key of keys) {
        expect(drawn.has(key), `${locale} ${key} has no row`).toBe(true)
        expect(rendered, `${locale} ${key} label`).toContain(dict[`field.${key}`]!)
      }
    }
  })

  it('saves the 429 switch as exactly one set op through the face', async () => {
    const mutations: Array<{ ops: unknown[], revision: unknown }> = []
    const { component, props } = mounted(faceFor({
      status: 'ready',
      view: { writable: true, namespaces: [{ ns: 'grok-workflow', revision: 3, value: { roles: {}} }] },
      error: null,
    }), mutations)
    const view = renderPage(component, props)
    const toggle = (tree: unknown): Element => {
      const row = walk(tree).find(element => element.props['data-field'] === 'switchOnRateLimit')
      expect(row).toBeDefined()
      const button = walk(row!).find(element => element.props['role'] === 'switch')
      expect(button).toBeDefined()
      return button!
    }
    let tree = view.run()
    // The default is on, so the state word says so and one press turns it off.
    expect(toggle(tree).props['aria-checked']).toBe(true)
    await view.click(toggle(tree))
    tree = view.run()
    expect(toggle(tree).props['aria-checked']).toBe(false)
    expect(texts(walk(tree).find(element => element.props['data-field'] === 'switchOnRateLimit')!).join('\n'))
      .toContain(zhDict['option.replan.off']!)

    await view.click(walk(tree).find(element => element.props['data-action'] === 'save')!)
    expect(mutations).toHaveLength(1)
    const written = (mutations[0]!.ops as Array<{ op: string, path: string[], value: unknown }>)
      .filter(op => op.path[0] === 'switchOnRateLimit')
    expect(written).toEqual([{ op: 'set', path: ['switchOnRateLimit'], value: false }])
  })

  it('reflects the stored 429 value instead of a fixed state', () => {
    // A control that always renders "on" would pass a shape check; only the stored
    // value may decide `aria-checked`.
    for (const stored of [true, false]) {
      const { component, props } = mounted(faceFor({
        status: 'ready',
        view: { writable: true, namespaces: [{ ns: 'grok-workflow', revision: 5, value: { roles: {}, switchOnRateLimit: stored } }] },
        error: null,
      }))
      const tree = renderPage(component, props).run()
      const row = walk(tree).find(element => element.props['data-field'] === 'switchOnRateLimit')
      expect(row, `stored ${stored}`).toBeDefined()
      const button = walk(row!).find(element => element.props['role'] === 'switch')
      expect(button, `stored ${stored}`).toBeDefined()
      expect(button!.props['aria-checked'], `stored ${stored}`).toBe(stored)
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
        { op: 'set', path: ['replan'], value: true },
      ])
    )
    expect(opsFor(broken, undefined).filter(op => op.path[0] === 'roles')).toEqual([])
  })

  it('rejects a stored enum value outside the offered options', () => {
    const bad = { ...draftOf(undefined), grokDefault: 'auto' }
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

  it('ships the per-route cap and number-unit copy in both languages', () => {
    for (const locale of bundle.GROK_WORKFLOW_LOCALES) {
      for (const key of ['roles.capPlaceholder', 'roles.capLabel', 'unit.jobs', 'unit.tasks', 'unit.deadlineMinutes', 'unit.minutes']) {
        expect(translate(locale!, key), `${locale} ${key}`).not.toBe(key)
      }
    }
    expect(translate('zh', 'roles.capPlaceholder')).not.toBe(translate('en', 'roles.capPlaceholder'))
    expect(translate('zh', 'unit.jobs')).not.toBe(translate('en', 'unit.jobs'))
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
      maxConcurrency: 10,
      maxTasks: 10,
      timeoutMs: 0,
      childTimeoutMs: 7_200_000,
      replan: false,
      switchOnRateLimit: true,
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

/**
 * The progress page, as the browser bundle draws it: one page, three screens.
 *
 * The reference is `DESIGN-progress-tab.md` §19 and the two local design drafts
 * (`.progress.html` / `.progress-desktop.png`): the header (run name + five-state chip),
 * the "现在" headline, one equal segment per step, the amber bar, the "后面还有" line, the
 * step list, the "经过" log, the "交卷" card, the Guardian card, and the dock.
 *
 * Every string below is asserted **verbatim** in Chinese, because a page that renders the
 * right structure with the wrong words is still the wrong page. The fixtures are the
 * recorder's own event stream (`src/records.ts`), folded by the bundle, so the story is
 * derived from events and not hand-built. `test/progress-tab.spec.ts` states the same
 * fixtures against the typed `deriveProgressStory`; the two copies of the derivation
 * cannot import each other, so they are compared through those fixtures.
 */

describe('client progress tab: the one-page story (three screens)', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS

  /**
   * Local wall-clock base of every fixture.
   *
   * Built from local components on purpose: the log time is rendered in the reader's own
   * zone, so a UTC epoch would make the expected string depend on the machine.
   */
  const STORY_BASE = new Date(2026, 10, 25, 8, 2).getTime()

  /** One recorded event, in the shape the fold reads. */
  function rec(type: string, data: Record<string, unknown>, seq: number, time?: number) {
    return { type, data, seq, ...time === undefined ? {} : { time } }
  }

  type Call = readonly [number, string, string, (string | undefined)?]

  /**
   * The recorder's stream for one run: `run-start`, one start/settle pair per declared
   * call, then the optional `summary-final` claim and `run-end`.
   *
   * The calls are the typed suite's own fixtures, so both halves of the derivation are
   * exercised by the same stream; only the clock is local (`STORY_BASE`), because it is
   * displayed.
   */
  function streamOf(calls: readonly Call[], options: { stopReason?: string, summaryFinal?: number } = {}) {
    const records: Array<Record<string, unknown>> = [
      rec('tool-workflow/run-start', { runId: 'r-story', name: '任务团队 · 3 个任务' }, 1, STORY_BASE - 60_000),
    ]
    let at = 2
    for (const [seq, label, phase, outcome] of calls) {
      records.push(rec('tool-workflow/agent-start', { runId: 'r-story', seq, label, phase, childId: `child-${seq}` }, at, STORY_BASE + seq * 60_000))
      at += 1
      if (outcome === undefined) continue
      records.push(rec('tool-workflow/agent-end', { runId: 'r-story', seq, outcome }, at, STORY_BASE + seq * 60_000 + 500))
      at += 1
    }
    if (options.summaryFinal !== undefined) {
      records.push(rec('tool-workflow/summary-final', { runId: 'r-story', draft: options.summaryFinal }, at))
      at += 1
    }
    if (options.stopReason !== undefined) records.push(rec('tool-workflow/run-end', { runId: 'r-story', stopReason: options.stopReason }, at))
    return records
  }

  /** The folded run of one fixture, and the story derived from it. */
  function storyOf(calls: readonly Call[], options: { stopReason?: string, summaryFinal?: number } = {}) {
    const runs = progress.fold(streamOf(calls, options))
    expect(runs, 'the fixture must fold into one run').toHaveLength(1)
    return { run: runs[0]!, story: progress.deriveProgressStory(runs[0]!) }
  }

  /** Render the tab for one run; `extra` is the injected props the shell would add. */
  function pageOf(run: ProgressRun | undefined, extra: Record<string, unknown> = {}): unknown {
    const t = translator('zh')
    const snapshot = run === undefined ? { runs: [], activeRun: undefined } : { runs: [run], activeRun: run }
    return progress.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
      ...extra,
    })
  }

  /** The first element carrying one data hook, or a failure that names the hook. */
  function hookOf(tree: unknown, name: string): Element {
    const found = walk(tree).find((element) => Object.prototype.hasOwnProperty.call(element.props, name))
    expect(found, `no element carries ${name}`).toBeDefined()
    return found!
  }

  /** Every element carrying one data hook, in document order. */
  function hooksOf(tree: unknown, name: string): Element[] {
    return walk(tree).filter((element) => Object.prototype.hasOwnProperty.call(element.props, name))
  }

  /**
   * The page's readable strings, in document order, without the scoped stylesheet.
   *
   * The stylesheet is a real text child of the tree (React renders and removes it with the
   * tab), so a whole-page assertion has to leave it out — it is not copy.
   */
  function pageTexts(page: unknown): string[] {
    const css = progress.css
    return texts(page).filter((text) => text !== css)
  }

  /** The visible text of the element carrying one hook, joined for a single comparison. */
  function textOf(tree: unknown, name: string): string {
    return texts(hookOf(tree, name)).join(' ')
  }

  /** The log time of the call with this `seq`, as the page spells it (`8:03`). */
  function clockOf(seq: number): string {
    const date = new Date(STORY_BASE + seq * 60_000)
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  /** 等你点头: the run announced itself and declared nothing yet. */
  const waitingCalls: readonly Call[] = []

  /** 进行中: one task passed, one still being written, one already done — no failure. */
  const runningCalls: readonly Call[] = [
    [1, '规划助手', '规划', 'completed'],
    [2, '执行', '任务 1 · 修复登录', 'completed'],
    [3, '检查', '任务 1 · 修复登录', 'completed'],
    [4, '执行', '任务 2 · 写文档', undefined],
    [5, '执行', '任务 3 · 补测试', 'completed'],
  ]

  /** 已完成: one task through plan, work and check, and the first summary draft shipped. */
  const doneCalls: readonly Call[] = [
    [1, '规划助手', '规划', 'completed'],
    [2, '执行', '任务 1 · 修复登录', 'completed'],
    [3, '检查', '任务 1 · 修复登录', 'completed'],
    [4, '汇总·第1稿', '汇总', 'completed'],
  ]

  /** 没过: one task failed and is being rechecked, one was cancelled after it. */
  const brokenCalls: readonly Call[] = [
    [1, '执行', '任务 1 · 修复登录', 'completed'],
    [2, '执行', '任务 2 · 写文档', 'failed'],
    [3, '执行（尝试 2）', '任务 2 · 写文档', undefined],
    [4, '执行', '任务 3 · 补测试', 'cancelled'],
  ]

  it('mirrors the typed story field for field (the two copies cannot import each other)', () => {
    // The bundle is served verbatim, so the mirror is compared through the fixtures the
    // typed suite uses: a field renamed on one side fails here, not on screen.
    const { story } = storyOf(runningCalls)
    expect(story.state).toBe('running')
    expect(story.total).toBe(3)
    expect(story.at).toBe(2)
    expect(story.now).toEqual({ title: '任务 2 · 写文档', role: '执行' })
    expect(story.attempt).toBeUndefined()
    expect(story.rest).toEqual(['任务 3 · 补测试'])
    expect(story.dock).toBe('quiet')
    expect(story.final).toBeUndefined()
    expect(story.steps.map((step) => [step.key, step.number, step.title, step.state])).toEqual([
      ['phase:任务 1 · 修复登录', 1, '任务 1 · 修复登录', 'done'],
      ['phase:任务 2 · 写文档', 2, '任务 2 · 写文档', 'doing'],
      ['phase:任务 3 · 补测试', 3, '任务 3 · 补测试', 'done'],
    ])
    // The chain is the task's own gates, and an unreached one is part of the answer.
    expect(story.steps[0]!.chain.map((slot) => [slot.key, slot.reached, slot.state])).toEqual([
      ['execute', true, 'done'],
      ['check', true, 'done'],
      ['review', false, 'pending'],
    ])
    expect(story.log.map((row) => [row.seq, row.role, row.title, row.state])).toEqual([
      [1, '规划助手', '规划', 'done'],
      [2, '执行', '任务 1 · 修复登录', 'done'],
      [3, '检查', '任务 1 · 修复登录', 'done'],
      [4, '执行', '任务 2 · 写文档', 'doing'],
      [5, '执行', '任务 3 · 补测试', 'done'],
    ])
    expect(story.log[0]!.at).toBe(STORY_BASE + 60_000)
  })

  it('waiting: 等你点头 — planning, no steps, and the start button', () => {
    const { run, story } = storyOf(waitingCalls)
    expect(story.state).toBe('waiting')
    expect(story.steps).toEqual([])
    expect(story.total).toBe(0)
    expect(story.at).toBe(0)
    expect(story.now).toEqual({ titleKey: 'planning', title: '' })
    expect(story.rest).toEqual([])
    expect(story.log).toEqual([])
    expect(story.final).toBeUndefined()
    expect(story.dock).toBe('start')

    const page = pageOf(run, { fillDraft: () => true })
    // The whole screen, in document order — this array is the "等你点头" design draft.
    expect(pageTexts(page)).toEqual([
      '任务团队 · 3 个任务',
      '等你点头',
      '现在',
      '正在拆活',
      '交卷',
      '这一轮没有交卷稿',
      '开工',
      '要改就说一声，我重拆',
    ])
    expect(hookOf(page, 'data-gw-progress-chip').props['data-state']).toBe('waiting')
    expect(textOf(page, 'data-gw-progress-run')).toBe('任务团队 · 3 个任务')
    expect(textOf(page, 'data-gw-progress-now-label')).toBe('现在')
    expect(textOf(page, 'data-gw-progress-now')).toBe('正在拆活')
    // Nothing to step through, so no track and no list: the page draws no step it cannot
    // name (§19.7.1). The small print has nothing to say either.
    expect(hooksOf(page, 'data-gw-progress-steps')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-step')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-plan')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-log')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-flag')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-rest')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-sub')).toHaveLength(0)
    expect(textOf(page, 'data-gw-progress-final-missing')).toBe('这一轮没有交卷稿')
    expect(textOf(page, 'data-gw-progress-dock-fill')).toBe('开工')
    expect(textOf(page, 'data-gw-progress-dock-hint')).toBe('要改就说一声，我重拆')
  })

  it('running: 进行中 — the step being worked, and the ones around it', () => {
    const { run } = storyOf(runningCalls)
    const page = pageOf(run)

    expect(textOf(page, 'data-gw-progress-run')).toBe('任务团队 · 3 个任务')
    expect(textOf(page, 'data-gw-progress-chip')).toBe('进行中')
    expect(hookOf(page, 'data-gw-progress-chip').props['data-state']).toBe('running')
    expect(textOf(page, 'data-gw-progress-now-label')).toBe('现在')
    // The headline is the current step's own title, verbatim: not shortened, not renumbered.
    expect(textOf(page, 'data-gw-progress-now')).toBe('任务 2 · 写文档')
    // The small print: the role of the line still running, then the position.
    expect(texts(hookOf(page, 'data-gw-progress-sub'))).toEqual(['执行', '正在看', '·', '第 2 步，共 3 步'])

    // One equal segment per step, in plan order, each with its own state.
    const steps = hooksOf(page, 'data-gw-progress-step')
    expect(steps.map((step) => [step.props['data-gw-progress-step'], step.props['data-state']])).toEqual([
      ['phase:任务 1 · 修复登录', 'done'],
      ['phase:任务 2 · 写文档', 'doing'],
      ['phase:任务 3 · 补测试', 'done'],
    ])
    expect(hookOf(page, 'data-gw-progress-steps').props['aria-label']).toBe('进度：第 2 步，共 3 步')

    // No failure is current, so no amber bar; the step after the current one is named.
    expect(hooksOf(page, 'data-gw-progress-flag')).toHaveLength(0)
    expect(textOf(page, 'data-gw-progress-rest')).toBe('后面还有：任务 3 · 补测试')

    // The step list: number, title, the gates the task reached, and its state word.
    expect(textOf(page, 'data-gw-progress-plan-title')).toBe('要干的 3 件事')
    const plan = hooksOf(page, 'data-gw-progress-plan-row')
    expect(plan.map((row) => texts(row).join(' '))).toEqual([
      '1 任务 1 · 修复登录 执行 → 检查 过了',
      '2 任务 2 · 写文档 执行 在做',
      '3 任务 3 · 补测试 执行 过了',
    ])
    expect(plan.map((row) => row.props['data-state'])).toEqual(['done', 'doing', 'done'])

    // The history: one line per declared call, its clock, its role, its title, its word.
    expect(textOf(page, 'data-gw-progress-log-title')).toBe('经过')
    const log = hooksOf(page, 'data-gw-progress-log-row')
    expect(log.map((row) => [row.props['data-gw-progress-log-row'], row.props['data-state']])).toEqual([
      [1, 'done'], [2, 'done'], [3, 'done'], [4, 'doing'], [5, 'done'],
    ])
    expect(log.map((row) => texts(row).join(' '))).toEqual([
      `${clockOf(1)} 规划助手 规划 做完`,
      `${clockOf(2)} 执行 任务 1 · 修复登录 做完`,
      `${clockOf(3)} 检查 任务 1 · 修复登录 过了`,
      `${clockOf(4)} 执行 任务 2 · 写文档 正在看`,
      `${clockOf(5)} 执行 任务 3 · 补测试 做完`,
    ])
    // Nothing is shipped yet, so the card names the gap instead of guessing a draft.
    expect(hooksOf(page, 'data-gw-progress-final')).toHaveLength(0)
    expect(textOf(page, 'data-gw-progress-final-missing')).toBe('这一轮没有交卷稿')
    // A run that is still working asks for no click: the dock is one quiet line.
    expect(hooksOf(page, 'data-gw-progress-dock-fill')).toHaveLength(0)
    expect(textOf(page, 'data-gw-progress-quiet')).toBe('不用你说话，好了叫你')
  })

  it('done: 已完成 — every step passed, the shipped draft named', () => {
    const { run, story } = storyOf(doneCalls, { summaryFinal: 1, stopReason: 'completed' })
    expect(story.state).toBe('done')
    expect(story.now).toEqual({ titleKey: 'done', title: '' })
    expect(story.now.role).toBeUndefined()
    expect(story.attempt).toBeUndefined()
    expect(story.rest).toEqual([])
    expect(story.final?.draft).toBe(1)
    expect(story.final?.label).toBe('汇总')

    const page = pageOf(run, { canOpen: (childId: string) => childId === 'child-4', fillDraft: () => true })
    expect(textOf(page, 'data-gw-progress-chip')).toBe('已完成')
    expect(hookOf(page, 'data-gw-progress-chip').props['data-state']).toBe('done')
    // The finished page stops naming a step; it states what the run settled.
    expect(textOf(page, 'data-gw-progress-now')).toBe('做好了')
    expect(texts(hookOf(page, 'data-gw-progress-sub'))).toEqual(['1 步全过'])
    expect(hooksOf(page, 'data-gw-progress-step').map((step) => step.props['data-state'])).toEqual(['done'])
    // A recovered failure is history: no amber bar on a page whose run ended clean.
    expect(hooksOf(page, 'data-gw-progress-flag')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-rest')).toHaveLength(0)

    expect(hooksOf(page, 'data-gw-progress-plan-row').map((row) => texts(row).join(' '))).toEqual([
      '1 任务 1 · 修复登录 执行 → 检查 过了',
    ])
    expect(hooksOf(page, 'data-gw-progress-log-row').map((row) => texts(row).join(' '))).toEqual([
      `${clockOf(1)} 规划助手 规划 做完`,
      `${clockOf(2)} 执行 任务 1 · 修复登录 做完`,
      `${clockOf(3)} 检查 任务 1 · 修复登录 过了`,
      `${clockOf(4)} 汇总·第1稿 汇总 交卷`,
    ])

    // The card: the draft the gate shipped, its mark, and the one control that opens it.
    expect(textOf(page, 'data-gw-progress-final-title')).toBe('交卷')
    expect(textOf(page, 'data-gw-progress-final-name')).toBe('汇总·第1稿')
    expect(textOf(page, 'data-gw-progress-final-mark')).toBe('（定稿）')
    const open = hookOf(page, 'data-gw-progress-open')
    expect(open.props['data-gw-progress-open']).toBe('child-4')
    expect(open.props['type']).toBe('button')
    expect(open.props['aria-label']).toBe('打开子会话')
    // The events never carried the draft's text, so the card carries no body (§19.7.2).
    expect(texts(page).join('\n')).not.toContain('登录修好了')

    expect(textOf(page, 'data-gw-progress-dock-fill')).toBe('收下这版')
    expect(textOf(page, 'data-gw-progress-dock-hint')).toBe('不满意就说，我重做')
    expect(hooksOf(page, 'data-gw-progress-quiet')).toHaveLength(0)
  })

  it('failed: 未通过 — the amber bar counts the attempt of the unit still broken', () => {
    const running = storyOf(brokenCalls)
    expect(running.story.state).toBe('running')
    expect(running.story.at).toBe(2)
    expect(running.story.now).toEqual({ title: '任务 2 · 写文档', role: '执行' })
    expect(running.story.attempt).toEqual({ n: 2, retrying: true })
    expect(running.story.steps.map((step) => [step.number, step.state])).toEqual([[1, 'done'], [2, 'failed'], [3, 'cancelled']])

    const live = pageOf(running.run)
    expect(textOf(live, 'data-gw-progress-chip')).toBe('进行中')
    expect(textOf(live, 'data-gw-progress-flag')).toBe('第 2 遍没过，正在重看')
    expect(textOf(live, 'data-gw-progress-rest')).toBe('后面还有：任务 3 · 补测试')
    expect(hooksOf(live, 'data-gw-progress-step').map((step) => step.props['data-state'])).toEqual(['done', 'failed', 'cancelled'])
    // The step list says 没过 for the broken step and 没做 for the cancelled one.
    expect(hooksOf(live, 'data-gw-progress-plan-row').map((row) => texts(row).join(' '))).toEqual([
      '1 任务 1 · 修复登录 执行 过了',
      '2 任务 2 · 写文档 执行 没过',
      '3 任务 3 · 补测试 执行 没做',
    ])
    // …and the log keeps each attempt's own line, with its own word.
    expect(hooksOf(live, 'data-gw-progress-log-row').map((row) => texts(row).join(' '))).toEqual([
      `${clockOf(1)} 执行 任务 1 · 修复登录 做完`,
      `${clockOf(2)} 执行 任务 2 · 写文档 没过`,
      `${clockOf(3)} 执行 任务 2 · 写文档 正在看`,
      `${clockOf(4)} 执行 任务 3 · 补测试 取消`,
    ])

    // The same stream once the run ends: the chip says 未通过 and the bar stops claiming a
    // recheck is running.
    const ended = storyOf(brokenCalls, { stopReason: 'error' })
    expect(ended.story.state).toBe('failed')
    expect(ended.story.attempt).toEqual({ n: 2, retrying: false })
    const page = pageOf(ended.run)
    expect(textOf(page, 'data-gw-progress-chip')).toBe('未通过')
    expect(hookOf(page, 'data-gw-progress-chip').props['data-state']).toBe('failed')
    expect(textOf(page, 'data-gw-progress-flag')).toBe('第 2 遍没过')
    // The engine's own word survives: a cancelled run says 已取消, never 未通过.
    const cancelled = storyOf(brokenCalls, { stopReason: 'cancelled' })
    expect(cancelled.story.state).toBe('cancelled')
    expect(textOf(pageOf(cancelled.run), 'data-gw-progress-chip')).toBe('已取消')
  })

  it('adds no number the events did not report', () => {
    // No percentage, no ETA, no pass rate, no planned total: the page states steps and
    // lines, and every figure it prints is one of those counts (§19.7.3).
    const runs = [
      storyOf(waitingCalls).run,
      storyOf(runningCalls).run,
      storyOf(doneCalls, { summaryFinal: 1, stopReason: 'completed' }).run,
      storyOf(brokenCalls).run,
    ]
    for (const run of runs) {
      const copy = pageTexts(pageOf(run)).join('\n')
      expect(copy).not.toContain('%')
      expect(copy).not.toMatch(/ETA|预计|通过率|剩余|大约/iu)
    }
  })

  /**
   * The tab's own path, not the fold.
   *
   * Every other assertion in this file folds a whole event stream and hands the result to
   * the component; a live session never does that. The shell feeds the tab's own view
   * definition one event at a time — `match` decides whether the event reaches the tab at
   * all, `update` folds it into the state, `buildViewNode` turns the state into the node
   * the component reads. A field the fold knows and the view definition forgets is
   * invisible to a fold-only test, and that is exactly how a shipped draft went missing:
   * the card said 「这一轮没有交卷稿」 for a run whose recorder had written the claim.
   */
  describe("the shell's own path: match, update, buildViewNode", () => {
    type Match = { id: string, role: string, event: Record<string, unknown> }
    type ViewDefinition = {
      kind: string
      target: string
      match(event: Record<string, unknown>): Match | null
      start(context: Record<string, unknown>, match: Match): Record<string, unknown>
      update(context: Record<string, unknown>, match: Match): Record<string, unknown>
      buildViewNode(context: Record<string, unknown>): { data: ProgressRun } | null
    }

    /** One session's tab, driven the way `uiConversation` drives it. */
    function shell() {
      const face = progress.eventDefinition as unknown as ViewDefinition
      let context: Record<string, unknown> = {}
      return {
        /** Feed one recorded event; `dropped` is what a type outside `eventTypes` gets. */
        feed(event: Record<string, unknown>): 'start' | 'update' | 'dropped' {
          const matched = face.match(event)
          if (matched === null) return 'dropped'
          // The shell hands `start`/`update` the match with the event attached; the tab's
          // own `match` returns only the id and the role.
          const match = { ...matched, event }
          if (match.role === 'start') {
            context = {
              ...context,
              key: 'k',
              kind: face.kind,
              id: match.id,
              start: { event, location: { kind: 'unresolved' } },
              state: face.start(context, match),
            }
            return 'start'
          }
          context = { ...context, state: face.update(context, match) }
          return 'update'
        },
        run(): ProgressRun {
          const node = face.buildViewNode(context)
          expect(node, 'the tab must still build a node').not.toBeNull()
          return node!.data
        },
        story(): ProgressStory {
          return progress.deriveProgressStory(this.run())
        },
      }
    }

    it('carries the shipped draft from summary-final through the run-end that follows it', () => {
      // The real order: the gate names a draft, then the run ends. `run-end` is the event
      // that used to erase the mark, because the re-fold it triggers rebuilt the run from
      // the members alone.
      const events = streamOf(doneCalls, { summaryFinal: 1, stopReason: 'completed' })
      const tab = shell()
      const claimAt = events.findIndex((event) => event.type === 'tool-workflow/summary-final')
      expect(claimAt, 'the fixture must carry the claim').toBeGreaterThan(0)
      const fed: string[] = []
      for (const event of events.slice(0, claimAt + 1)) fed.push(tab.feed(event))
      // A dropped type is silent in production and fatal here: the tab never hears it.
      expect(fed, 'no recorder event may be dropped by the tab').not.toContain('dropped')
      expect(fed[fed.length - 1]).toBe('update')
      // The state, the node's data and the story all have to carry it: the component only
      // ever sees the node's data.
      expect((tab as unknown as { run(): ProgressRun }).run().summaryFinalDraft).toBe(1)
      expect(tab.story().final?.draft).toBe(1)
      // …then the run closes, still in that order.
      for (const event of events.slice(claimAt + 1)) fed.push(tab.feed(event))
      expect(fed).not.toContain('dropped')
      expect(tab.story().final?.draft, 'run-end must not forget the shipped draft').toBe(1)
      expect(tab.story().state).toBe('done')
      // And the page shows the card instead of the gap.
      const page = pageOf(tab.run(), { fillDraft: () => true })
      expect(textOf(page, 'data-gw-progress-final-name')).toBe('汇总·第1稿')
      expect(pageTexts(page)).not.toContain(bundle.GROK_WORKFLOW_DICT['zh']!['progress.final.missing'])
    })

    it('keeps every recorder event type on the tab\'s own update list', () => {
      // `match` reads exactly this list: a type missing from it reaches no tab at all.
      const recorded = [
        'tool-workflow/run-start',
        'tool-workflow/agent-start',
        'tool-workflow/agent-end',
        'tool-workflow/summary-final',
        'tool-workflow/guardian-start',
        'tool-workflow/guardian-finding',
        'tool-workflow/guardian-end',
        'tool-workflow/run-end',
      ]
      for (const type of recorded) {
        expect(progress.eventTypes, type).toContain(type)
      }
    })

    it('reads only the three run fields the mirror needs, so no fourth can go missing', () => {
      // The mirror is a hand-written copy: a field it reads but the shell never puts on the
      // node is a field that silently reads `undefined` on a live session. The three are
      // `members`, `stopReason` and `summaryFinalDraft` — and the node must carry all three.
      const events = streamOf(doneCalls, { summaryFinal: 1, stopReason: 'completed' })
      const tab = shell()
      for (const event of events) tab.feed(event)
      const data = tab.run() as unknown as Record<string, unknown>
      expect(Object.keys(data)).toEqual(expect.arrayContaining(['members', 'stopReason', 'summaryFinalDraft']))
      expect(data.summaryFinalDraft).toBe(1)
      expect(data.stopReason).toBe('completed')
      expect(Array.isArray(data.members)).toBe(true)
    })
  })

  /**
   * The two rules that only show up on a run with **no plan tasks** (§19.9).
   *
   * A run whose calls are its own legs — no `任务 n · 标题` phase anywhere — used to be
   * stepped by every row, so the planner and the synthesizer became "things to do" and a
   * real run shipped 「第 1 步，共 1 步：要干的 1 件事 · 规划 在做」. The steps are now the
   * work legs only, read off each row's label with the chain's own words; the planner and
   * the synthesizer keep their history lines and take no step.
   *
   * The three expectations below are the typed suite's own, copied verbatim.
   */
  describe('a run with no plan tasks: the work legs are the steps', () => {
    /** One story, projected onto the fields the typed side pins. */
    function projection(story: ProgressStory) {
      return {
        state: story.state,
        at: story.at,
        total: story.total,
        now: story.now,
        rest: story.rest,
        dock: story.dock,
        steps: story.steps.map((step) => ({ key: step.key, title: step.title, state: step.state })),
        log: story.log.map((row) => ({ seq: row.seq, role: row.role, title: row.title, state: row.state })),
      }
    }

    it('steps only the do / check / review legs, and names the leg it is on', () => {
      // seq 4 is open: the review leg is the one being worked, and it is the headline.
      const { story } = storyOf([
        [1, '规划助手', '规划', 'completed'],
        [2, '执行', '执行', 'completed'],
        [3, '检查', '检查', 'completed'],
        [4, '复核', '复核', undefined],
      ])
      expect(projection(story)).toEqual({
        state: 'running',
        at: 3,
        total: 3,
        now: { title: '复核', role: '复核' },
        rest: [],
        dock: 'quiet',
        steps: [
          { key: 'seq:2', title: '执行', state: 'done' },
          { key: 'seq:3', title: '检查', state: 'done' },
          { key: 'seq:4', title: '复核', state: 'doing' },
        ],
        log: [
          { seq: 1, role: '规划助手', title: '规划', state: 'done' },
          { seq: 2, role: '执行', title: '执行', state: 'done' },
          { seq: 3, role: '检查', title: '检查', state: 'done' },
          { seq: 4, role: '复核', title: '复核', state: 'doing' },
        ],
      })
    })

    it('says it is still planning when nothing has run yet, not that it is on step 0', () => {
      const { story } = storyOf([[1, '规划助手', '规划', 'completed']])
      expect(projection(story)).toEqual({
        state: 'running',
        at: 0,
        total: 0,
        now: { titleKey: 'planning', title: '' },
        rest: [],
        dock: 'quiet',
        steps: [],
        log: [{ seq: 1, role: '规划助手', title: '规划', state: 'done' }],
      })
    })

    it('says the run is done when the synthesizer ends it, with no step to count', () => {
      const { story } = storyOf([[1, '汇总助手', '汇总', 'completed']], { stopReason: 'completed' })
      expect(projection(story)).toEqual({
        state: 'done',
        at: 0,
        total: 0,
        now: { titleKey: 'done', title: '' },
        rest: [],
        dock: 'accept',
        steps: [],
        log: [{ seq: 1, role: '汇总助手', title: '汇总', state: 'done' }],
      })
    })
  })

  /**
   * One history line is one line (§19.5).
   *
   * The row is a three-column grid — clock, then role and task, then the state word — and a
   * real session showed every line drawn twice: the task name was a fourth child of a
   * three-column grid, so it took the word's column and pushed the word onto a second row,
   * leaving a green 「做完」 hanging under the clock. The task name belongs in the middle
   * cell beside the role, and a name identical to the role says nothing at all.
   */
  describe('one history line is one line', () => {
    it('keeps the clock, the role + task and the word on one row', () => {
      const { run, story } = storyOf(doneCalls, { summaryFinal: 1, stopReason: 'completed' })
      const page = pageOf(run, { fillDraft: () => true })
      const rows = hooksOf(page, 'data-gw-progress-log-row')
      expect(rows).toHaveLength(story.log.length)
      for (const row of rows) {
        // Three cells and no fourth: the row's own children are clock, line, word.
        const children = row.children as Element[]
        expect(children.map((cell) => cell.props['data-gw-progress-log-time'] === true ? 'time'
          : cell.props['data-gw-progress-log-line'] === true ? 'line'
            : cell.props['data-gw-progress-log-word'] === true ? 'word'
              : 'stray')).toEqual(['time', 'line', 'word'])
        // The word is a sibling of the line, never a child of it: a word inside the middle
        // cell would be the second row again.
        const line = children[1]!
        const words = (line.children as Element[]).filter((child) => child.props['data-gw-progress-log-word'] === true)
        expect(words).toHaveLength(0)
      }
      // The role leads the middle cell, and a differing task name follows it.
      const firstNamed = rows.find((row) => hooksOf(row, 'data-gw-progress-log-name').length === 1)!
      const line = (firstNamed.children as Element[])[1]!
      expect((line.children as Element[]).map((child) => child.props['data-gw-progress-log-role'] === true ? 'role' : 'name'))
        .toEqual(['role', 'name'])
    })

    it('does not print a task name that is only the role said twice', () => {
      // Every row of this run has `phase === role` (`执行 执行`), which is the shape a run
      // with no plan tasks logs. The name is dropped; the role and the word stay.
      const { run, story } = storyOf([
        [1, '规划助手', '规划', 'completed'],
        [2, '执行', '执行', 'completed'],
        [3, '检查', '检查', 'completed'],
      ])
      expect(story.log.map((row) => [row.role, row.title])).toEqual([['规划助手', '规划'], ['执行', '执行'], ['检查', '检查']])
      const page = pageOf(run)
      const rows = hooksOf(page, 'data-gw-progress-log-row')
      // 规划助手 ≠ 规划: that one still names its task.
      expect(hooksOf(rows[0]!, 'data-gw-progress-log-name')).toHaveLength(1)
      // 执行 === 执行 and 检查 === 检查: neither repeats itself.
      for (const row of rows.slice(1)) {
        expect(hooksOf(row, 'data-gw-progress-log-name')).toHaveLength(0)
        const said = texts(row)
        expect(said.filter((text) => text === '执行' || text === '检查')).toHaveLength(1)
        // …and the state word is still there, so the drop cost no information.
        expect(hooksOf(row, 'data-gw-progress-log-word')).toHaveLength(1)
      }
    })
  })

  it('renders the empty state, and no dock, when the session has no run', () => {
    const page = pageOf(undefined)
    expect(hooksOf(page, 'data-progress-empty')).toHaveLength(1)
    expect(pageTexts(page)).toEqual([bundle.GROK_WORKFLOW_DICT['zh']!['progress.empty.title']])
    expect(hooksOf(page, 'data-gw-progress-dock')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-chip')).toHaveLength(0)
    // The stylesheet is part of the tab's own tree, so it leaves when the tab unmounts.
    expect(hooksOf(page, 'data-gw-progress-css')).toHaveLength(1)
  })

  it('survives a damaged snapshot instead of throwing', () => {
    // The worst a damaged session can hand the tab: a run whose name and rows are empty,
    // and a row whose `seq` is not a number. The page still draws what it has and claims
    // nothing it does not know.
    const t = translator('zh')
    const broken = {
      runs: [{ runId: 'r', name: '', anchorSeq: 0, members: [{ seq: Number.NaN, label: '', childId: '', order: 0 }] }],
      activeRun: { runId: 'r', name: '', anchorSeq: 0, members: [] },
    }
    const tree = progress.component({ t, progressT: t, useGrokProgress: (select: (value: unknown) => unknown) => select(broken) })
    expect(hooksOf(tree, 'data-gw-progress-chip')).toHaveLength(1)
    expect(textOf(tree, 'data-gw-progress-now')).toBe('正在拆活')
    expect(pageTexts(tree).join('\n')).not.toContain('NaN')
    // The undamaged opposite: no run at all is the empty page, and nothing else.
    const empty = { runs: [], activeRun: undefined }
    const blank = progress.component({ t, progressT: t, useGrokProgress: (select: (value: unknown) => unknown) => select(empty) })
    expect(hooksOf(blank, 'data-progress-empty')).toHaveLength(1)
    expect(pageTexts(blank)).toEqual([bundle.GROK_WORKFLOW_DICT['zh']!['progress.empty.title']])
  })

  it('returns the same snapshot object when nothing the page renders changed', () => {
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
})

/**
 * The dock's one button: it fills the input box, it never sends.
 *
 * `DESIGN-progress-tab.md` §19.4: the mechanism is the `conversation` service's input
 * facade — `conversation.input.for(binding.ctx).setDraft(...)`, scoped to the session the
 * tab was mounted for. `conversation.send` is the opposite verb ("send this for the user")
 * and must never be reached from here, not even by accident on a failing editor.
 */
describe('client progress tab: the button fills the box instead of sending', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS

  /** A session-scope context, compared by identity: the facade must get *this* one. */
  const SCOPE_CTX = { scope: 'session-scope' }

  type Recorder = {
    calls: string[]
    conversation: Record<string, unknown>
    sessions: Record<string, unknown>
  }

  /** A conversation face that records every verb a click could reach. */
  function recorder(options: { refuseDraft?: boolean } = {}): Recorder {
    const calls: string[] = []
    return {
      calls,
      conversation: {
        input: {
          for: (actx: unknown) => {
            calls.push(`for:${actx === SCOPE_CTX ? 'scope-ctx' : 'other-ctx'}`)
            return {
              setDraft: (text: string) => {
                calls.push(`setDraft:${text}`)
                if (options.refuseDraft === true) throw new Error('the editor is locked')
              },
            }
          },
        },
        send: () => { calls.push('send'); return Promise.resolve() },
        cancel: () => { calls.push('cancel'); return Promise.resolve() },
        updateQueue: () => { calls.push('updateQueue'); return Promise.resolve() },
      },
      sessions: {
        binding: (sessionId: string) => ({ sessionId, ctx: SCOPE_CTX }),
        // One openable child, so the page has both controls: the dock's button and the
        // capsule that jumps to the session that wrote the shipped draft.
        subagentAddress: (childId: string) => (childId === 'child-2' ? { parentSessionId: 'session-1', mode: 'continuable' } : undefined),
      },
    }
  }

  /** Mount the real tab and hand back the props the slot injects for one session. */
  function injectedProps(services: Record<string, unknown>): Record<string, unknown> {
    const registered: Array<Record<string, unknown>> = []
    const ctx = {
      slots: {
        inject: (_name: string, fn: () => unknown) => fn(),
        register: (definition: Record<string, unknown>) => {
          registered.push(definition)
          return () => {}
        },
      },
    }
    progress.mount(ctx, services, { locale: undefined, t: translator('zh') }, { set: () => {} }, () => undefined)
    const view = registered.find((definition) => definition['name'] === 'conversation.view')
    expect(view, 'the tab must register a conversation view').toBeDefined()
    const inject = view!['inject'] as (sessionId: string) => Record<string, unknown>
    return inject('session-1')
  }

  /** The services the shell offers; `conversation` is the optional one this block is about. */
  function servicesOf(record: Recorder | undefined): Record<string, unknown> {
    return {
      uiConversation: {
        events: { register: () => () => {} },
        views: { register: () => () => {} },
        binding: () => ({ target: () => ({ getSnapshot: () => ({ runs: [], activeRun: undefined }), subscribe: () => () => {} }) }),
      },
      sessions: record === undefined ? { binding: (sessionId: string) => ({ sessionId }), subagentAddress: () => undefined } : record.sessions,
      ...record === undefined ? {} : { conversation: record.conversation },
    }
  }

  /** The run the dock is tested on: open, nothing declared, so the dock offers 开工. */
  function waitingRun(): ProgressRun {
    return { runId: 'r-dock', name: '任务团队', anchorSeq: 1, members: [] }
  }

  function renderWith(props: Record<string, unknown>, run: ProgressRun | undefined) {
    const snapshot = run === undefined ? { runs: [], activeRun: undefined } : { runs: [run], activeRun: run }
    return renderProgress({ ...props, useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot) })
  }

  it('writes the confirmation word into the session draft, and calls nothing else', () => {
    const record = recorder()
    const view = renderWith(injectedProps(servicesOf(record)), waitingRun())
    const button = walk(view.run()).find((element) => element.props['data-gw-progress-dock-fill'] === true)
    expect(button, 'the waiting dock renders its one button').toBeDefined()
    expect(button!.props['type']).toBe('button')
    expect(texts(button!).join('')).toBe('开工')

    ;(button!.props['onClick'] as () => void)()
    // One `for`, scoped to the session's own ctx, then one `setDraft` with the word the
    // approval gate accepts (`APPROVAL_ANSWERS` carries 确认).
    expect(record.calls).toEqual(['for:scope-ctx', 'setDraft:确认'])
    expect(record.calls).not.toContain('send')
    // The status line says what happened, and it is a live region, not a silent swap.
    const filled = walk(view.run()).find((element) => element.props['data-gw-progress-filled'] === true)
    expect(filled).toBeDefined()
    expect(texts(filled!).join('')).toBe('已填进输入框，按发送')
    expect(filled!.props['role']).toBe('status')
    expect(filled!.props['aria-live']).toBe('polite')
  })

  it('renders no button at all when the composition has no conversation service', () => {
    // The tab is a bonus: without the face it degrades to the quiet line instead of
    // pretending it filled something.
    const view = renderWith(injectedProps(servicesOf(undefined)), waitingRun())
    expect(walk(view.run()).filter((element) => element.props['data-gw-progress-dock-fill'] === true)).toHaveLength(0)
    expect(texts(walk(view.run()).find((element) => element.props['data-gw-progress-quiet'] === true)!).join('')).toBe('不用你说话，好了叫你')
  })

  it('never claims the box was filled when the editor refuses', () => {
    const record = recorder({ refuseDraft: true })
    const view = renderWith(injectedProps(servicesOf(record)), waitingRun())
    const button = walk(view.run()).find((element) => element.props['data-gw-progress-dock-fill'] === true)!
    ;(button.props['onClick'] as () => void)()
    expect(record.calls).toEqual(['for:scope-ctx', 'setDraft:确认'])
    // A refused write shows no success line: the page does not say what did not happen.
    expect(walk(view.run()).filter((element) => element.props['data-gw-progress-filled'] === true)).toHaveLength(0)
    expect(texts(view.run()).join('\n')).not.toContain('已填进输入框')
  })

  it('keeps the page inert apart from the button and the open capsule', () => {
    const record = recorder()
    const run: ProgressRun = {
      runId: 'r-inert',
      name: '任务团队',
      anchorSeq: 1,
      members: [
        { seq: 1, label: '执行', phase: '任务 1 · 读代码', childId: 'child-1', order: 0, outcome: 'completed' },
        { seq: 2, label: '汇总·第1稿', phase: '汇总', childId: 'child-2', order: 1, outcome: 'completed' },
      ],
      summaryFinalDraft: 1,
      stopReason: 'completed',
    }
    const view = renderWith(injectedProps(servicesOf(record)), run)
    const tree = walk(view.run())
    const controls = tree.filter((element) => element.props['onClick'] !== undefined)
    // Exactly two controls, in reading order: the capsule that opens the shipped row and
    // the dock's one button.
    expect(controls.map((element) => element.props['data-gw-progress-dock-fill'] === true ? 'dock' : 'open')).toEqual(['open', 'dock'])
    // Everything else — the header, the segments, the plan rows, the log rows, the card —
    // is a static mark: no handler, no tab stop.
    for (const element of tree) {
      if (element.props['onClick'] !== undefined) continue
      expect(element.props['tabIndex']).toBeUndefined()
    }
    expect(record.calls).toEqual([])
  })
})


/**
 * The Guardian side lane reports liveness interventions only.
 *
 * It is the one card the redesign keeps as it was (§19.1: "保留，仅换色"), so its own rules
 * are pinned here: the state word, the budget, the findings, and the fact that a finding
 * is never promoted into a task verdict.
 */
describe('client progress tab: Guardian monitor side lane', () => {
  const progress = bundle.GROK_WORKFLOW_PROGRESS
  const t = translator('zh')

  type Guardian = ProgressRun['guardian']

  function treeOf(guardian: Guardian): unknown {
    const run: ProgressRun = {
      runId: 'run-guardian',
      name: '任务团队 · 5 行',
      anchorSeq: 1,
      members: [{ seq: 1, label: '执行', phase: '任务 1 · 搭建', childId: 'c1', order: 0, outcome: 'completed' }],
      ...guardian === undefined ? {} : { guardian },
    }
    return progress.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
  }

  it('shows recorded liveness state and rescue evidence without inventing a task verdict', () => {
    const tree = treeOf({
      started: true,
      armed: true,
      budgetMs: 300_000,
      ended: false,
      cancelled: false,
      findings: [{ seq: 3, label: '执行 3', signal: 'timeout', action: 'rescue', reason: 'workflow guardian rescued child with guidance', atMs: 2_000 }],
    })
    const panel = walk(tree).find((element) => element.props['data-gw-progress-guardian'] === true)
    expect(panel).toBeDefined()
    expect(panel!.props['data-state']).toBe('active')
    const copy = texts(panel!).join('\n')
    expect(copy).toContain('Guardian 监控')
    expect(copy).toContain('监控中')
    expect(copy).toContain('已排队发送恢复指引')
    // Only the colour changed: the mint surface is mixed from a semantic token.
    expect(progress.css).toContain('color-mix(in srgb, var(--dsw-alias-state-success-primary)')
    expect(progress.css).toMatch(/\.gw-progress-guardian \{[^}]*border-radius: 14px/)
  })

  it('renders an observe finding as observed, not as a run cancellation', () => {
    const tree = treeOf({
      started: true,
      armed: true,
      budgetMs: 300_000,
      ended: false,
      cancelled: false,
      findings: [{ seq: 3, label: '执行 3', signal: 'timeout', action: 'observe', reason: 'no child session available; left running', atMs: 2_000 }],
    })
    const panel = walk(tree).find((element) => element.props['data-gw-progress-guardian'] === true)!
    expect(panel.props['data-state']).toBe('active')
    const finding = walk(panel).find((element) => element.props['data-action'] === 'observe')
    expect(finding).toBeDefined()
    expect(finding!.props['title']).toBe('no child session available; left running')
    expect(texts(finding!).join(' ')).toContain('已记录异常 · 继续运行')
  })

  it('renders no guardian card at all when the session recorded none', () => {
    const tree = treeOf(undefined)
    expect(walk(tree).some((element) => element.props['data-gw-progress-guardian'] === true)).toBe(false)
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
 * that `src/mode.ts` owns, which is the record the block intake's admission rule reads
 * and the record the slash command writes. What is pinned here:
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
    expect(noteText(tree)).toBe(zhDict['mode.switch.on'])
    expect(lampIn(tree)).toBe('on')

    // The click asks the Host for `off` and paints the answer, not the click.
    const after = await view.click(tree)
    expect(posted[1]).toEqual({ action: 'set', sessionId: SESSION, enabled: false })
    expect(toggleIn(after).props['aria-checked']).toBe(false)
    expect(noteText(after)).toBe(zhDict['mode.switch.off'])
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
    expect(noteText(tree)).toBe(zhDict['mode.switch.off'])
    expect(lampIn(tree)).toBe('off')
    expect((toggle.props['style'] as Record<string, unknown>)['background']).toBe('#d1d5db')
    // The state line, not the whole row: the label carries 开 as part of its own word.
    const note = walk(tree).find((element) => element.props['data-mode-note'] !== undefined)
    expect(note, 'the switch renders its state line').toBeDefined()
    expect(texts(note).join(' ')).not.toContain(zhDict['mode.switch.on'])
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
    expect(noteText(recovered)).toBe(zhDict['mode.switch.off'])
  })

  /**
   * One session's `eventSource`, cut down to what the switch is allowed to use.
   *
   * The real face hands out `sessions.binding(id).eventSource`, an
   * `ObservableSnapshot<SessionEventWindow>`: a snapshot and a synchronous listener list.
   * This is that shape and nothing else, so the switch is driven through the door it uses in
   * the page — not through a test-only prop.
   */
  function fakeEventWindow(initial: Array<Record<string, unknown>> = []) {
    const listeners = new Set<() => void>()
    let snapshot = {
      entries: initial.slice(),
      hasMore: false,
      revision: 0,
      change: { kind: 'replace', entries: initial.slice() },
    }
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      /** Publish one more entry and wake the listeners, the way the controller's own does. */
      push(entry: Record<string, unknown>) {
        const entries = [...snapshot.entries, entry]
        snapshot = { entries, hasMore: false, revision: snapshot.revision + 1, change: { kind: 'append', entries: [entry] } }
        // A snapshot, not the live set: a listener that unsubscribes while it runs must not
        // take the listeners behind it out of this dispatch.
        for (const listener of Array.from(listeners)) listener()
      },
      /** How many switches are currently following this window. */
      listeners,
    }
  }

  /** One mode record as the browser's event window carries it — the shape `src/mode.ts` writes. */
  function modeEntry(seq: number, enabled: boolean) {
    return {
      type: 'event',
      event: {
        type: 'plugin:grok-workflow/mode',
        seq,
        time: 1_700_000_000_000,
        data: { v: 1, enabled, turn: 2, setBy: enabled ? 'command:/grok on' : 'command:/grok off' },
        ignorable: true,
      },
    }
  }

  /** The sessions face as the switch sees it: a binding that resolves to one event window. */
  function sessionsFace(window: unknown) {
    return { binding: (id: string) => (id === SESSION ? { sessionId: id, eventSource: window } : undefined) }
  }

  it('repaints a mounted switch when a command writes the record, with no click and no poll', async () => {
    const mode = modeSwitch()
    const window = fakeEventWindow()
    mode.offerSessions(sessionsFace(window))
    const { posted, fetchImpl } = scriptedFetch([
      { body: { ok: true, action: 'status', mode: { enabled: true, setBy: 'command:/grok on' } } },
      { body: { ok: true, action: 'status', mode: { enabled: false, setBy: 'command:/grok off' } } },
    ])
    try {
      const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
      const { tree } = await view.mount()
      expect(toggleIn(tree).props['aria-checked']).toBe(true)
      expect(lampIn(tree)).toBe('on')

      // `/grok off` ran in the Host: the record lands in the session log, and the window is
      // the one place this button can see a write it did not make.
      window.push(modeEntry(6, false))
      await view.settle()
      const after = view.render()

      // One read, and nobody clicked: the same status request the mount made, asked because
      // the session said the record moved.
      expect(posted).toEqual([
        { action: 'status', sessionId: SESSION },
        { action: 'status', sessionId: SESSION },
      ])
      expect(toggleIn(after).props['aria-checked']).toBe(false)
      expect(lampIn(after)).toBe('off')
      expect(noteText(after)).toBe(zhDict['mode.switch.off'])
      expect(walk(after).find((element) => element.props['data-mode-state'] === 'ready')).toBeDefined()
    } finally {
      mode.offerSessions(undefined)
    }
  })

  it('reads once per new record seq, and once only when the same seq comes back', async () => {
    const mode = modeSwitch()
    const window = fakeEventWindow()
    mode.offerSessions(sessionsFace(window))
    const { posted, fetchImpl } = scriptedFetch([
      { body: { ok: true, action: 'status', mode: { enabled: true } } },
      { body: { ok: true, action: 'status', mode: { enabled: false } } },
      { body: { ok: true, action: 'status', mode: { enabled: true } } },
    ])
    try {
      const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
      await view.mount()

      window.push(modeEntry(6, false))
      await view.settle()
      expect(posted).toHaveLength(2)

      // The same record again — a replayed window, a second page, a re-subscription. The seq
      // is the identity, so this is the same news and it costs nothing.
      window.push(modeEntry(6, false))
      window.push(modeEntry(6, false))
      await view.settle()
      expect(posted).toHaveLength(2)

      // A genuinely newer record is news again: one read for it, one only.
      window.push(modeEntry(9, true))
      await view.settle()
      const after = view.render()
      expect(posted).toHaveLength(3)
      expect(toggleIn(after).props['aria-checked']).toBe(true)
      expect(noteText(after)).toBe(zhDict['mode.switch.on'])
    } finally {
      mode.offerSessions(undefined)
    }
  })

  it('reads nothing on a window that moves without this plugin\'s record', async () => {
    const mode = modeSwitch()
    const window = fakeEventWindow()
    mode.offerSessions(sessionsFace(window))
    const { posted, fetchImpl } = scriptedFetch([{ body: { ok: true, action: 'status', mode: { enabled: true } } }])
    try {
      const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
      await view.mount()
      // A whole turn's worth of traffic, none of it ours: the switch is told, and stays put.
      window.push({ type: 'event', event: { type: 'user/message', seq: 7, time: 1, data: {} } })
      window.push({ type: 'event', event: { type: 'assistant/message', seq: 8, time: 2, data: {} } })
      window.push({ type: 'transient', event: { type: 'assistant/live-chunk', seq: 8.5, time: 3, data: {} } })
      window.push({ type: 'event', event: { type: 'turn/end', seq: 9, time: 4, data: {} } })
      await view.settle()
      const after = view.render()
      // An event-driven re-read on every event would be a poll wearing a listener: one read
      // on mount, and nothing else, until a mode record actually appears.
      expect(posted).toEqual([{ action: 'status', sessionId: SESSION }])
      expect(toggleIn(after).props['aria-checked']).toBe(true)
    } finally {
      mode.offerSessions(undefined)
    }
  })

  it('keeps the known state and says nothing when the background re-read fails', async () => {
    const mode = modeSwitch()
    const window = fakeEventWindow()
    mode.offerSessions(sessionsFace(window))
    const { posted, fetchImpl } = scriptedFetch([
      { body: { ok: true, action: 'status', mode: { enabled: true } } },
      { throws: true },
    ])
    try {
      const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
      const { tree } = await view.mount()
      window.push(modeEntry(6, false))
      await view.settle()
      const after = view.render()

      // The read did happen (one more), and it failed. The person at the keyboard asked for
      // nothing, so the switch keeps the state it already knew and no failure line appears.
      expect(posted).toHaveLength(2)
      expect(toggleIn(after).props['aria-checked']).toBe(true)
      expect(lampIn(after)).toBe('on')
      expect(noteText(after)).toBe(zhDict['mode.switch.on'])
      expect(walk(after).find((element) => element.props['data-mode-state'] === 'failed')).toBeUndefined()
      expect(texts(after).join(' ')).not.toContain(translate('zh', 'mode.switch.failed', { message: 'socket closed' }))
      expect(toggleIn(tree).props['aria-checked']).toBe(true)
    } finally {
      mode.offerSessions(undefined)
    }
  })

  it('mounts and reads with no sessions face at all, and with a face that cannot bind', async () => {
    const mode = modeSwitch()
    for (const face of [undefined, {}, { binding: () => undefined }]) {
      mode.offerSessions(face)
      const { posted, fetchImpl } = scriptedFetch([{ body: { ok: true, action: 'status', mode: { enabled: true } } }])
      const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
      const { tree } = await view.mount()
      // The switch is complete without the face: it read, it shows what it read, it can be
      // clicked. It simply cannot be told about somebody else's write.
      expect(toggleIn(tree).props['aria-checked']).toBe(true)
      expect(noteText(tree)).toBe(zhDict['mode.switch.on'])
      expect(posted).toHaveLength(1)
      view.unmount()
    }
    mode.offerSessions(undefined)
  })

  it('stops following the session once it unmounts', async () => {
    const mode = modeSwitch()
    const window = fakeEventWindow()
    mode.offerSessions(sessionsFace(window))
    const { posted, fetchImpl } = scriptedFetch([{ body: { ok: true, action: 'status', mode: { enabled: true } } }])
    try {
      const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
      await view.mount()
      expect(window.listeners.size).toBe(1)
      view.unmount()
      // A record written after the switch is gone reaches nobody: the listener is dropped,
      // and no read is fired from a component that no longer exists.
      expect(window.listeners.size).toBe(0)
      window.push(modeEntry(6, false))
      await view.settle()
      expect(posted).toHaveLength(1)
    } finally {
      mode.offerSessions(undefined)
    }
  })

  it('follows a sessions face that arrives after the switch has already mounted', async () => {
    const mode = modeSwitch()
    const window = fakeEventWindow()
    // The shipped order: the composer is registered while `apply`'s injection is still
    // resolving, so the switch mounts before there is any face to subscribe to. That is the
    // waiter path, and it is the branch a rework is most likely to break in silence.
    mode.offerSessions(undefined)
    const { posted, fetchImpl } = scriptedFetch([
      { body: { ok: true, action: 'status', mode: { enabled: true } } },
      { body: { ok: true, action: 'status', mode: { enabled: false } } },
    ])
    try {
      const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
      const { tree } = await view.mount()
      expect(toggleIn(tree).props['aria-checked']).toBe(true)
      expect(window.listeners.size).toBe(0)

      // The injection lands: the mounted switch is handed the face it did not have at mount.
      mode.offerSessions(sessionsFace(window))
      // The subscription is the assertion that matters: a screen that happens to change
      // without a listener would pass a behavioural check while being wired to nothing.
      expect(window.listeners.size).toBe(1)

      window.push(modeEntry(11, false))
      await view.settle()
      const after = view.render()
      expect(posted).toEqual([
        { action: 'status', sessionId: SESSION },
        { action: 'status', sessionId: SESSION },
      ])
      expect(toggleIn(after).props['aria-checked']).toBe(false)
      expect(lampIn(after)).toBe('off')
      expect(noteText(after)).toBe(zhDict['mode.switch.off'])
    } finally {
      mode.offerSessions(undefined)
    }
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
    expect(zhDict['mode.switch.label']).toBe('工作流开关')
    // …and the label must not collapse into the state word, nor `on` into `off`. Either one
    // makes a state check pass in both states, which is a green guard that proves nothing.
    expect(zhDict['mode.switch.label']).not.toBe(zhDict['mode.switch.on'])
    expect(zhDict['mode.switch.on']).not.toBe(zhDict['mode.switch.off'])
    // The third state word — no record yet — has to be a word of its own in both languages,
    // or "not set yet" would render as either of the two states it is neither of.
    expect(zhDict['mode.switch.notOn'], 'zh notOn is not the on-word').not.toBe(zhDict['mode.switch.on'])
    expect(zhDict['mode.switch.notOn'], 'zh notOn is not the off-word').not.toBe(zhDict['mode.switch.off'])
    expect(enDict['mode.switch.notOn'], 'en notOn is not the on-word').not.toBe(enDict['mode.switch.on'])
    expect(enDict['mode.switch.notOn'], 'en notOn is not the off-word').not.toBe(enDict['mode.switch.off'])
    const mode = modeSwitch()
    expect(mode.text(translator('zh'), { phase: 'ready', mode: { enabled: false } })).toBe(zhDict['mode.switch.off'])
    expect(mode.text(translator('en'), { phase: 'ready', mode: { enabled: false } })).toBe(enDict['mode.switch.off'])
    expect(mode.text(translator('zh'), { phase: 'ready', mode: { enabled: true } })).toBe(zhDict['mode.switch.on'])
    expect(mode.text(translator('en'), { phase: 'ready', mode: { enabled: true } })).toBe(enDict['mode.switch.on'])
  })

  /**
   * The reverse pin for D-154: a session with no record says so, in both languages.
   *
   * The route folds the deployment default into what it answers (`source: 'default'`), and
   * the intake refuses a block in the same session (`canAcceptBlock` reads the record, not
   * the default). So a switch that read `enabled: true` as "on" was telling the person it
   * was open for work the intake then refused. Both directions of the default are pinned:
   * `grokDefault: on` and `grokDefault: off` are the *same* display state, because neither
   * of them is a decision this session made.
   */
  it('never calls a session with no record on, in either language', () => {
    const mode = modeSwitch()
    const defaultOn = { enabled: true, source: 'default', setBy: null, turn: null, workflowMode: null, fallback: true }
    const defaultOff = { enabled: false, source: 'default', setBy: null, turn: null, workflowMode: null, fallback: false }
    const languages = [['zh', zhDict], ['en', enDict]] as const
    for (const [locale, dict] of languages) {
      const t = translator(locale)
      expect(mode.text(t, { phase: 'ready', mode: defaultOn }), `${locale}: default on`).toBe(dict['mode.switch.notOn'])
      expect(mode.text(t, { phase: 'ready', mode: defaultOff }), `${locale}: default off`).toBe(dict['mode.switch.notOn'])
      // The default is not mixed up with a real state: it is neither the on-word nor the
      // off-word, so the screen cannot claim the session decided anything it did not.
      expect(mode.text(t, { phase: 'ready', mode: defaultOn })).not.toBe(dict['mode.switch.on'])
      expect(mode.text(t, { phase: 'ready', mode: defaultOff })).not.toBe(dict['mode.switch.off'])
    }
  })

  it('keeps reading a written record as on or off, and a sourceless answer as before', () => {
    const mode = modeSwitch()
    // A record is the session's own decision: the two words it has always had.
    expect(mode.text(translator('zh'), { phase: 'ready', mode: { enabled: true, source: 'record' } })).toBe(zhDict['mode.switch.on'])
    expect(mode.text(translator('en'), { phase: 'ready', mode: { enabled: true, source: 'record' } })).toBe(enDict['mode.switch.on'])
    expect(mode.text(translator('zh'), { phase: 'ready', mode: { enabled: false, source: 'record' } })).toBe(zhDict['mode.switch.off'])
    expect(mode.text(translator('en'), { phase: 'ready', mode: { enabled: false, source: 'record' } })).toBe(enDict['mode.switch.off'])
    // An older Host answers the record without naming its `source`. That is the shape the
    // button has always read, so it keeps reading it as the state it names.
    expect(mode.text(translator('zh'), { phase: 'ready', mode: { enabled: false } })).toBe(zhDict['mode.switch.off'])
    expect(mode.text(translator('en'), { phase: 'ready', mode: { enabled: true } })).toBe(enDict['mode.switch.on'])
  })

  it('paints the no-record state as not on, and one click turns the session on', async () => {
    const mode = modeSwitch()
    const { posted, fetchImpl } = scriptedFetch([
      {
        body: {
          ok: true,
          action: 'status',
          mode: { enabled: true, source: 'default', setBy: null, turn: null, workflowMode: null, fallback: true },
        },
      },
      { body: { ok: true, action: 'set', mode: { enabled: true, source: 'record', setBy: 'switch:mode', workflowMode: 'full' } } },
    ])
    const view = mountSwitch(mode.component, { sessionId: SESSION, t: translator('zh'), modeSend: fetchImpl }, 'mode')
    const { tree } = await view.mount()

    // Word, lamp and pill agree, and all three say the same thing: nothing was decided yet.
    // A green pill next to "not set yet" would be the same lie in a different colour.
    expect(toggleIn(tree).props['aria-checked']).toBe(false)
    expect((toggleIn(tree).props['style'] as Record<string, unknown>)['background']).toBe('#d1d5db')
    expect(lampIn(tree)).toBe('off')
    expect(noteText(tree)).toBe(zhDict['mode.switch.notOn'])

    // From there a click means "turn it on" — not "write the deployment default off",
    // which is what flipping the route's effective value used to ask for.
    const after = await view.click(tree)
    expect(posted[1]).toEqual({ action: 'set', sessionId: SESSION, enabled: true })
    expect(toggleIn(after).props['aria-checked']).toBe(true)
    expect(noteText(after)).toBe(zhDict['mode.switch.on'])
    expect(lampIn(after)).toBe('on')
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
        // The deployment default: this session has no record yet. The route folds that into
        // what it answers; the button then ignores it for the display, because this session
        // never decided anything (D-154).
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
      // No record: the route answered the deployment default (`source: 'default'`), which
      // this session never decided, so the switch says "not set yet" rather than either
      // state word — and the read wrote nothing.
      expect(readModeRecord(session)).toBeUndefined()
      expect(toggleIn(tree).props['aria-checked']).toBe(false)
      expect(noteText(tree)).toBe(zhDict['mode.switch.notOn'])

      const on = await view.click(tree)
      const written = readModeRecord(session)
      expect(written).toMatchObject({ v: 1, enabled: true, setBy: 'switch:mode', workflowMode: 'full' })
      expect(toggleIn(on).props['aria-checked']).toBe(true)
      expect(noteText(on)).toBe(zhDict['mode.switch.on'])

      const off = await view.click(on)
      expect(readModeRecord(session)).toMatchObject({ v: 1, enabled: false, setBy: 'switch:mode' })
      expect(readModeRecord(session)!.workflowMode).toBeUndefined()
      expect(toggleIn(off).props['aria-checked']).toBe(false)
      expect(noteText(off)).toBe(zhDict['mode.switch.off'])
      // The lamp agrees with the record, not with the click count.
      expect(walk(off).find((element) => element.props['data-mode-lamp'] !== undefined)!.props['data-mode-lamp']).toBe('off')
    } finally {
      ;(globalThis as unknown as { document?: unknown }).document = previousDocument
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
