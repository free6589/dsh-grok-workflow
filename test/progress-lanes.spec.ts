import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The lane matrix: rows are plan tasks, columns are legs, and every number is fixed.
 *
 * This file is the acceptance yardstick for `.tmp/flowchart-v2-contract.md` "追加：泳道矩阵
 * 定稿" (追加 1–6), written against the contract and **not** against the page it found. It is
 * red until the lane layout exists; it is not allowed to be softened into green.
 *
 * Five things are pinned here, one describe each:
 *
 * 1. **The boundary (追加 1).** Only the browser bundle moves. `src/progress-tab.ts` and
 *    `test/progress-tab.spec.ts` gain no lane vocabulary at all: `deriveProgressFlow` keeps
 *    the shape it shipped with, because the lane split is a *presentation* group over rows
 *    the fold already produced. The cost is recorded rather than papered over: this block
 *    has no TS-side fixture, so the lane rules live only in a browser spec.
 * 2. **The DOM (追加 2).** `[data-gw-progress-cols]` holds one `li[data-gw-progress-col]`
 *    per flow node, in flow order; each column heads with its own `[data-gw-progress-node]`
 *    (every §21 hook intact), and a work column carries one `[data-gw-progress-sub]` per
 *    plan task — present without being opened, because the task row is the drawing.
 * 3. **The geometry (追加 3).** Height, radius, gaps and the state gradient are literal
 *    numbers, not taste: 32px steps with a 10px radius, 26px cells with a **6px** radius,
 *    999px capsules at the two ends, 12px columns, 6px between cells, `12% → 5%` of the
 *    state token, `pending` the only dashed and the only ungradiented state, overlays
 *    absolute, no sideways scroller, no literal colour, no error token.
 * 4. **The wires (追加 4).** Direction is a marker (`#gw-progress-arrow`), and a pair of
 *    neighbours that wrapped is drawn as a three-segment elbow instead of being dropped —
 *    the one place this block deliberately departs from §21.
 * 5. **The words (追加 5).** Zero new copy: not one dictionary key, not one sentence. The
 *    cell's visible text is the `phase` — data the stream recorded, not a word the page
 *    invented — and its spoken label reuses the existing state words.
 *
 * The bundle is loaded the way the existing progress specs load it (a stub
 * `__ModuleLoader__` and a stub React whose `useState` really stores), so a column that is
 * closed by default can be checked on the closed page, and the wire maths can be driven with
 * measured boxes.
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
const TS_SOURCE = readFileSync(new URL('../src/progress-tab.ts', import.meta.url), 'utf8')
const TS_SPEC = readFileSync(new URL('./progress-tab.spec.ts', import.meta.url), 'utf8')

type Dict = Record<string, string>

/** One element of the stub tree: the bundle renders through plain `h()` calls. */
type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

interface ProgressMember {
  seq: number
  label: string
  phase?: string
  childId: string
  order: number
  startedAt?: number
  endedAt?: number
  outcome?: string
}

interface ProgressRun {
  runId: string
  name: string
  anchorSeq: number
  members: ProgressMember[]
  details: unknown[]
  stopReason?: string
  summaryFinalDraft?: number
}

type Translator = (key: string, params?: Record<string, unknown>) => string

interface FlowNodeShape {
  key: string
  kind: string
  ordinal: number
  state: string
}

interface WireShape {
  width: number
  height: number
  paths: Array<Array<[number, number]>>
}

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    fold: (records: ReadonlyArray<Record<string, unknown>>) => ProgressRun[]
    measureWires: (flow: unknown) => WireShape
    deriveProgressFlow: (run: ProgressRun) => {
      state: string
      nodes: FlowNodeShape[]
      at: number
      total: number
      remaining: number
    }
  }
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
}

/** The hook cells of the render in progress: React keeps them across a re-render. */
type Cells = { index: number, cells: unknown[] }

let rendering: Cells | undefined

/**
 * Load the bundle the way the host does, with a stub React whose `useState` really stores.
 *
 * `useEffect` never runs here, which is also the statement that a host without layout
 * measures nothing: the wire layer is what the measurement returns, not a guess.
 */
function loadBundle(): Bundle {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
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
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
      const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
      return typeof type === 'function' ? (type as (value: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => {
      const cells = rendering
      const value = typeof initial === 'function' ? (initial as () => unknown)() : initial
      if (cells === undefined) return [value, () => {}]
      const at = cells.index++
      if (at >= cells.cells.length) cells.cells[at] = value
      const set = (next: unknown) => {
        cells.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(cells.cells[at]) : next
      }
      return [cells.cells[at], set]
    },
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
  return registration!.factory((id) => {
    if (id === 'react') return react
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

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

/**
 * Every element of a subtree except the ones under a pruned hook.
 *
 * A step node and the cells hanging under it are one `li` in the tree, so "does this step
 * have a control of its own" has to stop at `data-gw-progress-subs`: the cells' own controls
 * are not the step's.
 */
function walkPruned(node: unknown, prune: string, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) walkPruned(child, prune, out)
    return out
  }
  const element = node as Element
  if (!('type' in element) || !('props' in element)) return out
  out.push(element)
  if (Object.prototype.hasOwnProperty.call(element.props, prune)) return out
  walkPruned(element.children, prune, out)
  return out
}

/**
 * The `<path>` elements a layer actually draws.
 *
 * A marker's arrow head is itself a `path`, and it lives in `<defs>` where nothing is
 * painted, so the defs subtree is skipped: what is counted is the wires, not the stamp.
 */
function drawnPaths(node: unknown, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) drawnPaths(child, out)
    return out
  }
  const element = node as Element
  if (!('type' in element) || !('props' in element)) return out
  if (element.type === 'defs') return out
  if (element.type === 'path') out.push(element)
  drawnPaths(element.children, out)
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

/** The readable text of one element, joined for a single comparison. */
function textOf(node: unknown): string {
  return texts(node).join(' ').trim()
}

/** Every element carrying one data hook, in document order. */
function hooksOf(tree: unknown, name: string): Element[] {
  return walk(tree).filter((element) => Object.prototype.hasOwnProperty.call(element.props, name))
}

/** The first element carrying one data hook, or a failure that names the hook. */
function hookOf(tree: unknown, name: string): Element {
  const found = hooksOf(tree, name)[0]
  expect(found, `no element carries ${name}`).toBeDefined()
  return found!
}

/** One attribute as the DOM would spell it: React writes numbers and booleans out as text. */
function attr(element: Element, name: string): string | undefined {
  const value = element.props[name]
  if (value === undefined || value === null) return undefined
  return String(value)
}

/** The classes of one element, split the way the DOM splits them. */
function classesOf(element: Element): string[] {
  const value = element.props['className']
  return typeof value === 'string' ? value.split(/\s+/).filter((token) => token !== '') : []
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

/** One selector/body pair of the scoped stylesheet, with the at-rule it sits in. */
interface CssRule {
  selector: string
  body: string
  /** The enclosing at-rules, joined (`@media (max-width: 720px)`), or `''` at the top level. */
  at: string
}

/**
 * Every rule of the scoped stylesheet.
 *
 * The sheet is read structurally rather than line by line: a rule is a head and a body, an
 * at-rule is a wrapper, and a rule inside one keeps that wrapper as its context — which is
 * what makes "this number lives in the 720px breakpoint" checkable instead of a substring
 * search over the whole sheet.
 */
function cssRules(css: string): CssRule[] {
  const rules: CssRule[] = []
  const frames: Array<{ at: boolean, head: string, bodyStart: number }> = []
  let head = ''
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index]
    if (char === '{') {
      const opened = head.trim()
      head = ''
      frames.push({ at: opened.startsWith('@'), head: opened, bodyStart: index + 1 })
      continue
    }
    if (char === '}') {
      const frame = frames.pop()
      head = ''
      if (frame === undefined) continue
      if (frame.at) continue
      const context = frames.filter((entry) => entry.at).map((entry) => entry.head).join(' ')
      rules.push({ selector: frame.head, body: css.slice(frame.bodyStart, index), at: context })
    } else {
      head += char
    }
  }
  return rules
}

const RULES = cssRules(progress.css)

/** The one top-level rule declared for a selector, or a failure that names it. */
function ruleOf(selector: string): CssRule {
  const found = RULES.filter((rule) => rule.at === '' && rule.selector === selector)
  expect(found.length, `the sheet declares ${selector} ${found.length} times`).toBe(1)
  return found[0]!
}

/** Every top-level rule whose selector mentions one class token (`col` matches `col` only). */
function rulesWithClass(name: string): CssRule[] {
  const token = new RegExp(`\\.${name}(?![A-Za-z0-9_-])`, 'u')
  return RULES.filter((rule) => rule.at === '' && token.test(rule.selector))
}

/** What the sheet says about one class, across its base rule and its state variants. */
function styleOf(name: string): string {
  const found = rulesWithClass(name)
  expect(found.length, `the sheet never styles .${name}`).toBeGreaterThan(0)
  return found.map((rule) => rule.body).join('\n')
}

/** Every class token the stylesheet styles, one per selector. */
function styledClasses(): string[] {
  const tokens = new Set<string>()
  for (const rule of RULES) {
    for (const match of rule.selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) tokens.add(match[1]!)
  }
  return [...tokens]
}

/** The rules of one breakpoint, judged by the at-rule they sit in. */
function mediaRules(query: string): CssRule[] {
  return RULES.filter((rule) => rule.at.includes(`@media (${query})`))
}

/**
 * Local wall-clock base of every fixture.
 *
 * Built from local components on purpose: a call line prints the clock in the reader's own
 * zone, so a UTC epoch would make the expected string depend on the machine.
 */
const BASE = new Date(2026, 10, 25, 8, 2).getTime()

/** One declared call: a row of a run, settled or still open. */
function member(seq: number, label: string, phase: string | undefined, outcome: string | undefined, order: number): ProgressMember {
  return {
    seq,
    label,
    childId: `child-${seq}`,
    order,
    startedAt: BASE + seq * 60_000,
    ...phase === undefined ? {} : { phase },
    ...outcome === undefined ? {} : { endedAt: BASE + seq * 60_000 + 20_000, outcome },
  }
}

/**
 * 进行中 with two plan tasks worked by all three work legs.
 *
 * The engine records the plan-task group title (`任务 2 · 写文档`) as the phase of the call
 * that ran inside that task, so the same task shows up once per leg: that is the row of the
 * matrix, and the leg is its column.
 */
function laneRun(): ProgressRun {
  return {
    runId: 'r-lanes',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '执行', '任务 2 · 写文档', 'completed', 2),
      member(4, '检查', '任务 1 · 修复登录', 'completed', 3),
      member(5, '检查', '任务 2 · 写文档', undefined, 4),
    ],
    details: [],
  }
}

/**
 * 已完成 with three tasks, of which the check leg walked only two.
 *
 * The leg that skipped a task is the case the alignment rule exists for: the task numbers,
 * not the arrival order, decide which row a cell sits on.
 */
function skippedLaneRun(): ProgressRun {
  return {
    runId: 'r-lanes-skip',
    name: '任务团队 · 3 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '执行', '任务 2 · 写文档', 'completed', 2),
      member(4, '执行', '任务 3 · 补测试', 'completed', 3),
      member(5, '检查', '任务 2 · 写文档', 'completed', 4),
      member(6, '检查', '任务 3 · 补测试', 'completed', 5),
    ],
    details: [],
    stopReason: 'completed',
  }
}

/**
 * 已完成 with one task that failed and was then re-answered inside the same leg.
 *
 * Both calls name the same task, so they land in one cell: the cell reads `done` by the
 * recovery rule, which is exactly why the amber has to survive on the dot that earned it.
 * The rows are listed out of `seq` order on purpose — a stream may arrive that way, and the
 * dots are ordered by `seq`, not by arrival.
 */
function retryRun(): ProgressRun {
  return {
    runId: 'r-lanes-retry',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(1, '执行', '任务 1 · 修复登录', 'failed', 0),
    ],
    details: [],
    stopReason: 'completed',
  }
}

/** 进行中 with the retry still open: the first attempt failed, the second has not settled. */
function retryOpenRun(): ProgressRun {
  return {
    runId: 'r-lanes-retry-open',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '执行', '任务 1 · 修复登录', 'failed', 0),
      member(2, '执行', '任务 1 · 修复登录', undefined, 1),
    ],
    details: [],
  }
}

/** 已完成 with one call answered twice and both answers good: no retry to draw. */
function resubmitRun(): ProgressRun {
  return {
    runId: 'r-lanes-resubmit',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '执行', '任务 1 · 修复登录', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
    ],
    details: [],
    stopReason: 'completed',
  }
}

/** 失败整轮: one task finished, the second was still open when the run stopped on an error. */
function failedRun(): ProgressRun {
  return {
    runId: 'r-lanes-failed',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '执行', '任务 2 · 写文档', undefined, 2),
    ],
    details: [],
    stopReason: 'error',
  }
}

/** 已取消: the leg that was running when the run was cancelled. */
function cancelledRun(): ProgressRun {
  return {
    runId: 'r-lanes-cancelled',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'cancelled', 1),
    ],
    details: [],
    stopReason: 'cancelled',
  }
}

/** The same run with no task numbers anywhere: the lane matrix must not appear. */
function plainRun(): ProgressRun {
  return {
    runId: 'r-lanes-plain',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '修复登录', 'completed', 1),
      member(3, '执行', '写文档', 'completed', 2),
      member(4, '检查', '修复登录', 'completed', 3),
      member(5, '检查', '写文档', undefined, 4),
    ],
    details: [],
  }
}

/**
 * 已完成 with a leg that carries one numbered row and one row of no task.
 *
 * The row that names no task cannot be placed in a lane, so it stays on the step and gives
 * the step its own control back — the opposite of `laneRun`, where every row moved into a
 * cell and the step has nothing of its own left to open.
 */
function mixedRun(): ProgressRun {
  return {
    runId: 'r-lanes-mixed',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '执行', undefined, 'completed', 2),
    ],
    details: [],
    stopReason: 'completed',
  }
}

/**
 * 已完成 with task numbers on the plan and the summary legs too.
 *
 * Those legs are about one role, never about a plan task's calls, so the numbers are there
 * to be read and must still draw no cells: the rule is about the leg, not about the data.
 */
function numberedOtherLegsRun(): ProgressRun {
  return {
    runId: 'r-lanes-other-legs',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '任务 1 · 规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '汇总·第1稿', '任务 1 · 汇总', 'completed', 2),
    ],
    details: [],
    stopReason: 'completed',
    summaryFinalDraft: 1,
  }
}

/** One page, rendered against a fixed set of props, with its hook cells kept between passes. */
function renderer(props: Record<string, unknown>): () => unknown {
  const cells: unknown[] = []
  return () => {
    const before = rendering
    const local: Cells = { index: 0, cells }
    rendering = local
    try {
      return progress.component(props)
    } finally {
      rendering = before
    }
  }
}

/** The renderer for one run, with the shell's extra props. */
function pageOf(run: ProgressRun, extra: Record<string, unknown> = {}): () => unknown {
  const t = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')
  const snapshot = { runs: [run], activeRun: run }
  return renderer({
    t,
    progressT: t,
    useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
    ...extra,
  })
}

/** The page's own copy, without the scoped stylesheet (which is a text child of the tree). */
function pageTexts(page: unknown): string[] {
  return texts(page).filter((text) => text !== progress.css)
}

/** The step nodes of one page, in document order. */
function stepsOf(page: unknown): Element[] {
  return hooksOf(page, 'data-gw-progress-node')
}

/** The columns of one page, in document order. */
function columnsOf(page: unknown): Element[] {
  return hooksOf(page, 'data-gw-progress-col')
}

/** The cells of one column: one per plan task, present whether or not it is opened. */
function cellsOf(column: Element): Element[] {
  return hooksOf(column, 'data-gw-progress-sub')
}

/** The lane numbers of one column's cells, in document order. */
function lanesOf(column: Element): number[] {
  return cellsOf(column).map((cell) => Number(attr(cell, 'data-lane')))
}

/** Every class token the rendered page actually writes, for the retired-name check. */
function renderedClasses(page: unknown): string[] {
  return [...new Set(walk(page).flatMap((element) => classesOf(element)))]
}

/** The keys of one locale's `progress.*` namespace. */
function progressKeys(locale: string): string[] {
  return Object.keys(bundle.GROK_WORKFLOW_DICT[locale] ?? {})
    .filter((key) => key.startsWith('progress.'))
    .sort()
}

describe('lanes: only the browser bundle moves (追加 1)', () => {
  it('gives the typed derivation no lane vocabulary at all', () => {
    // 追加 1: `src/progress-tab.ts` 一个字都不改. The split is a presentation group over rows
    // the fold already produced, so the shipped model keeps its shape.
    expect(TS_SOURCE, 'the typed model grew a `subs` field').not.toMatch(/(?<![A-Za-z])subs?(?![A-Za-z])/i)
    expect(TS_SOURCE, 'the typed model grew swimlane vocabulary').not.toMatch(/(?<![A-Za-z])swim(?![A-Za-z])/i)
    // `lane` is pre-existing prose about the Guardian's own side lane, so only a *code* use
    // would be new structure: every line that says it must be a comment line.
    const codeLane = TS_SOURCE.split('\n')
      .filter((line) => /(?<![A-Za-z])lane(?![A-Za-z])/i.test(line))
      .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
    expect(codeLane, 'the typed model grew a lane identifier').toEqual([])
  })

  it('leaves the typed derivation’s own spec untouched and lane-free', () => {
    expect(TS_SPEC).not.toMatch(/(?<![A-Za-z])subs?(?![A-Za-z])/i)
    expect(TS_SPEC).not.toMatch(/(?<![A-Za-z])(?:lane|swim)(?![A-Za-z])/i)
  })
})

describe('lanes: the flow is a matrix of legs and tasks (追加 2)', () => {
  it('hangs every leg as its own column, in the order the flow derives', () => {
    const page = pageOf(laneRun())()
    const flow = progress.deriveProgressFlow(laneRun())
    const columns = columnsOf(page)
    expect(columns.length, 'the columns are missing').toBeGreaterThan(0)
    // 追加 2: 一列 = 一条腿；列的顺序 = 既有 flow.nodes 的顺序。
    expect(columns.map((column) => attr(column, 'data-gw-progress-col')))
      .toEqual(flow.nodes.map((node) => node.kind))
    expect(new Set(columns.map((column) => attr(column, 'data-gw-progress-col'))).size).toBe(columns.length)
    for (const column of columns) {
      expect(column.type, 'a column is a list item').toBe('li')
      expect(classesOf(column)).toEqual(['gw-progress-col'])
      // The column speaks the leg's aggregate state, and the current one is marked here too.
      expect(attr(column, 'data-state')).toBeDefined()
      expect(attr(column, 'data-current')).toMatch(/^(?:true|false)$/u)
      expect(hooksOf(column, 'data-gw-progress-node'), 'a column heads with one step').toHaveLength(1)
    }
    // The container is the column list, and §21's own node list is gone.
    const cols = hookOf(page, 'data-gw-progress-cols')
    expect(cols.type).toBe('ol')
    expect(classesOf(cols)).toEqual(['gw-progress-cols'])
    expect(hooksOf(cols, 'data-gw-progress-col')).toHaveLength(columns.length)
    expect(hooksOf(page, 'data-gw-progress-nodes')).toHaveLength(0)
  })

  it('keeps every step hook §21 shipped, on a node that is now a column’s div', () => {
    const page = pageOf(laneRun())()
    const flow = progress.deriveProgressFlow(laneRun())
    const steps = stepsOf(page)
    expect(steps).toHaveLength(flow.nodes.length)
    // 追加 2: 节点元素由 li 改为列内的 div；`[data-gw-progress-node]` 与四个钩子一个不少。
    for (const step of steps) {
      expect(step.type).toBe('div')
      expect(classesOf(step)).toEqual(['gw-progress-node'])
      for (const hook of ['data-gw-progress-node', 'data-kind', 'data-state', 'data-ordinal', 'data-current']) {
        expect(attr(step, hook), `a step dropped ${hook}`).toBeDefined()
      }
    }
    expect(steps.map((step) => attr(step, 'data-kind'))).toEqual(flow.nodes.map((node) => node.kind))
    expect(steps.map((step) => attr(step, 'data-ordinal'))).toEqual(flow.nodes.map((node) => String(node.ordinal)))
    // The current step is still exactly one, and it is still the one `at` names.
    expect(steps.filter((step) => attr(step, 'data-current') === 'true')).toHaveLength(1)
    expect(steps.findIndex((step) => attr(step, 'data-current') === 'true')).toBe(flow.at - 1)
  })

  it('gives every work column one cell per plan task, drawn without being opened', () => {
    const page = pageOf(laneRun())()
    const work = columnsOf(page).filter((column) => ['execute', 'check'].includes(attr(column, 'data-gw-progress-col') ?? ''))
    expect(work.map((column) => attr(column, 'data-gw-progress-col'))).toEqual(['execute', 'check'])
    // 追加 2: 仅工作腿且有任务号时出现；子节点常驻可见。
    for (const column of work) {
      const subs = hookOf(column, 'data-gw-progress-subs')
      expect(subs.type).toBe('ol')
      expect(classesOf(subs)).toEqual(['gw-progress-subs'])
      expect(cellsOf(column)).toHaveLength(2)
      for (const cell of cellsOf(column)) {
        expect(cell.type).toBe('li')
        expect(classesOf(cell)).toEqual(['gw-progress-sub'])
        // The contract names the dot by its class and `aria-hidden`; it is decoration, so it
        // carries no hook of its own.
        const dots = walk(cell).filter((element) => classesOf(element).includes('gw-progress-sub-dot'))
        expect(dots, 'a cell has no dot').toHaveLength(1)
        expect(attr(dots[0]!, 'aria-hidden')).toBe('true')
      }
    }
    // Closed by default: nothing is opened, so no call list of either kind is drawn.
    expect(hooksOf(page, 'data-gw-progress-node-calls')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-sub-calls')).toHaveLength(0)
  })

  it('writes the task number, the lane, the ordinal and the state on every cell, with the phase as its word', () => {
    const page = pageOf(laneRun())()
    const execute = columnsOf(page).find((column) => attr(column, 'data-gw-progress-col') === 'execute')!
    const cells = cellsOf(execute)
    // 追加 2 / 追加 5: 文字 = phase 原文.
    expect(cells.map((cell) => [attr(cell, 'data-task'), attr(cell, 'data-lane'), attr(cell, 'data-ordinal')]))
      .toEqual([['1', '1', '1'], ['2', '2', '2']])
    expect(cells.map((cell) => attr(cell, 'data-state'))).toEqual(['done', 'done'])
    expect(cells.map((cell) => textOf(hookOf(cell, 'data-gw-progress-sub-word'))))
      .toEqual(['任务 1 · 修复登录', '任务 2 · 写文档'])
    // The word carries its full text as the tooltip the ellipsis hides behind.
    expect(cells.map((cell) => attr(hookOf(cell, 'data-gw-progress-sub-word'), 'title')))
      .toEqual(['任务 1 · 修复登录', '任务 2 · 写文档'])
    // Spoken label = phase + the *existing* state word; no new copy, no new vocabulary.
    expect(cells.map((cell) => attr(cell, 'aria-label')))
      .toEqual([`任务 1 · 修复登录 ${zh('progress.plan.done')}`, `任务 2 · 写文档 ${zh('progress.plan.done')}`])
  })

  it('keeps one row per task: the same lane sits in the same place in every work column', () => {
    const page = pageOf(laneRun())()
    // 「行=任务」: the same task number appears exactly once per work column, in task order,
    // so the columns line up on equal heights instead of on a measurement.
    const lanes = columnsOf(page)
      .filter((column) => ['execute', 'check'].includes(attr(column, 'data-gw-progress-col') ?? ''))
      .map((column) => lanesOf(column))
    expect(lanes).toEqual([[1, 2], [1, 2]])
  })

  it('keeps a task on one line even where a leg skipped it', () => {
    // 裁决 C: `data-lane` 是任务号，所以行也必须是任务号。This run's execute leg walked
    // tasks 1/2/3 and its check leg only 2/3; ordering cells by arrival would put the check
    // leg's task 2 on row 1, right above the execute leg's task 2 on row 2 — one horizontal
    // line pointing at two different tasks.
    const page = pageOf(skippedLaneRun())()
    // The cell list is a grid of task-numbered rows, so the row a leg skipped stays empty.
    const subs = ruleOf('.gw-progress-subs')
    expect(subs.body).toContain('grid-template-rows: repeat(var(--gw-lanes')
    expect(subs.body).toContain('gap: 6px')
    // The row count is the run's highest task number — not the cell count of any one leg.
    const inlined = [hookOf(page, 'data-gw-progress-cols'), ...columnsOf(page)]
      .map((element) => (element.props['style'] as Record<string, string> | undefined)?.['--gw-lanes'])
      .filter((value): value is string => value !== undefined)
    expect(inlined.length, 'the lane count is not written inline').toBeGreaterThan(0)
    expect(inlined.every((value) => value === '3')).toBe(true)
    // Every cell names its own row, and the rows follow the task numbers.
    const rowsOf = (kind: string): Array<string | undefined> => {
      const column = columnsOf(page).find((entry) => attr(entry, 'data-gw-progress-col') === kind)
      expect(column, `the fixture drew no ${kind} column`).toBeDefined()
      return cellsOf(column!).map((cell) => {
        const style = cell.props['style'] as Record<string, string> | undefined
        return style?.['grid-row'] ?? style?.['gridRow']
      })
    }
    expect(rowsOf('execute')).toEqual(['1', '2', '3'])
    expect(rowsOf('check')).toEqual(['2', '3'])
    // …and the check leg's first cell is task 2, not a renumbered task 1. Two cells, no
    // filler element standing in for the row it never walked.
    const check = columnsOf(page).find((entry) => attr(entry, 'data-gw-progress-col') === 'check')!
    expect(cellsOf(check).map((cell) => attr(cell, 'data-task'))).toEqual(['2', '3'])
  })

  it('gives the plan, the summary and the two ends no cells, even when their rows carry task numbers', () => {
    const page = pageOf(numberedOtherLegsRun())()
    const columns = columnsOf(page)
    const byKind = (kind: string): Element | undefined => columns.find((column) => attr(column, 'data-gw-progress-col') === kind)
    // The execute leg reads its number, so the fixture is not simply missing the data…
    expect(cellsOf(byKind('execute')!)).toHaveLength(1)
    // …and these three legs still draw none: the rule is about the leg, not the number.
    for (const kind of ['start', 'plan', 'summarize', 'end']) {
      const column = byKind(kind)
      expect(column, `the fixture drew no ${kind} column`).toBeDefined()
      expect(hooksOf(column!, 'data-gw-progress-subs'), `${kind} carries cells`).toHaveLength(0)
    }
  })

  it('gives a step its own control only while it has rows left of its own', () => {
    const page = pageOf(laneRun())()
    const columnOf = (tree: unknown, kind: string): Element => {
      const column = columnsOf(tree).find((entry) => attr(entry, 'data-gw-progress-col') === kind)
      expect(column, `the fixture drew no ${kind} column`).toBeDefined()
      return column!
    }
    const ownControls = (column: Element): number => walkPruned(column, 'data-gw-progress-subs')
      .filter((element) => Object.prototype.hasOwnProperty.call(element.props, 'data-gw-progress-node-toggle'))
      .length
    // 裁决 B: "a step keeps no control" holds for a **work leg whose every row named a task** —
    // those rows all moved into cells, so the step has nothing of its own left to open.
    for (const kind of ['execute', 'check']) {
      const column = columnOf(page, kind)
      expect(cellsOf(column).length, `${kind} drew no cells`).toBeGreaterThan(0)
      expect(ownControls(column), `${kind} keeps a control after all of its rows moved into cells`).toBe(0)
    }
    // The plan leg's row names no task (`规划`), so it stays on the step: that declared call
    // is readable only by opening the step, and losing the control would lose the row.
    const plan = columnOf(page, 'plan')
    expect(cellsOf(plan), 'the plan leg grew cells').toHaveLength(0)
    expect(ownControls(plan), 'the plan leg lost the control of its own declared call').toBe(1)
  })

  it('gives a work leg its control back as soon as one of its rows names no task', () => {
    // The same run with one task-less row: that row cannot go into a lane, so it stays on the
    // step — the step has something of its own again, and the numbered row still lands in a
    // cell beside it.
    const mixed = pageOf(mixedRun())()
    const execute = columnsOf(mixed).find((column) => attr(column, 'data-gw-progress-col') === 'execute')
    expect(execute, 'the fixture drew no execute column').toBeDefined()
    expect(cellsOf(execute!)).toHaveLength(1)
    const own = walkPruned(execute!, 'data-gw-progress-subs')
      .filter((element) => Object.prototype.hasOwnProperty.call(element.props, 'data-gw-progress-node-toggle'))
    expect(own, 'a step with a task-less row lost its control').toHaveLength(1)
  })

  it('gives the cells a control hook of their own, disjoint from the steps’', () => {
    const page = pageOf(laneRun())()
    // 裁决 A: 格子用 `data-gw-progress-sub-toggle`，步骤节点继续用
    // `data-gw-progress-node-toggle`。One hook on two kinds of control would break the
    // standing reading "number of node toggles = steps that still have rows of their own".
    const placed = (hook: string): Array<{ element: Element, inCell: boolean }> => {
      const out: Array<{ element: Element, inCell: boolean }> = []
      const visit = (node: unknown, inCell: boolean): void => {
        if (node === null || node === undefined || typeof node !== 'object') return
        if (Array.isArray(node)) {
          for (const child of node) visit(child, inCell)
          return
        }
        const element = node as Element
        if (!('type' in element) || !('props' in element)) return
        if (Object.prototype.hasOwnProperty.call(element.props, hook)) out.push({ element, inCell })
        const inside = inCell || Object.prototype.hasOwnProperty.call(element.props, 'data-gw-progress-sub')
        visit(element.children, inside)
      }
      visit(page, false)
      return out
    }
    const nodeToggles = placed('data-gw-progress-node-toggle')
    const cellToggles = placed('data-gw-progress-sub-toggle')
    // Each hook sits where it belongs, and nowhere else.
    expect(nodeToggles.filter((toggle) => toggle.inCell).map((toggle) => attr(toggle.element, 'data-gw-progress-node-toggle')))
      .toEqual([])
    expect(cellToggles.filter((toggle) => !toggle.inCell).map((toggle) => attr(toggle.element, 'data-gw-progress-sub-toggle')))
      .toEqual([])
    const cells = columnsOf(page).flatMap((column) => cellsOf(column))
    expect(cells.length).toBeGreaterThan(0)
    expect(cellToggles, 'not every cell has a control of its own').toHaveLength(cells.length)
    // The two sets share no element, and no control carries both hooks.
    const shared = nodeToggles.filter((toggle) => cellToggles.some((other) => other.element === toggle.element))
    expect(shared.map((toggle) => attr(toggle.element, 'data-gw-progress-node-toggle'))).toEqual([])
    const both = walk(page).filter((element) => ['data-gw-progress-node-toggle', 'data-gw-progress-sub-toggle']
      .every((hook) => Object.prototype.hasOwnProperty.call(element.props, hook)))
    expect(both, 'one control carries both hooks').toEqual([])
  })

  it('names each cell’s own call list after its column and its task', () => {
    const page = pageOf(laneRun())()
    const work = columnsOf(page).filter((column) => ['execute', 'check'].includes(attr(column, 'data-gw-progress-col') ?? ''))
    const targets: string[] = []
    for (const column of work) {
      for (const cell of cellsOf(column)) {
        const toggle = hookOf(cell, 'data-gw-progress-sub-toggle')
        expect(attr(toggle, 'type')).toBe('button')
        expect(attr(toggle, 'aria-expanded')).toBe('false')
        expect(attr(toggle, 'aria-controls')).toMatch(/^gw-progress-sub-calls-\d+-[1-9]\d*$/u)
        targets.push(attr(toggle, 'aria-controls')!)
      }
    }
    // Every cell owns a list, and no two cells share one.
    expect(targets).toHaveLength(4)
    expect(new Set(targets).size).toBe(4)
    // The task number is the last part of the id, so the two are not interchangeable.
    expect(targets.map((id) => id.slice(id.lastIndexOf('-') + 1))).toEqual(['1', '2', '1', '2'])
  })
})

describe('lanes: the geometry is fixed by numbers (追加 3)', () => {
  it('sizes the steps and the cells to the contract’s numbers', () => {
    const step = ruleOf('.gw-progress-node')
    expect(step.body).toContain('height: 32px')
    expect(step.body).toContain('border-radius: 10px')
    expect(step.body).toContain('box-sizing: border-box')
    const cell = ruleOf('.gw-progress-sub')
    expect(cell.body).toContain('height: 26px')
    // 6px, not 10px: a 26px box given a 10px radius is 77% of its own half-height, which
    // reads as a pill. The cell is a block; the step node keeps 10px and the ends keep 999px.
    expect(styleOf('gw-progress-sub')).toContain('border-radius: 6px')
    expect(styleOf('gw-progress-sub'), 'a cell rounded like a step reads as a pill').not.toContain('border-radius: 10px')
  })

  it('keeps the two ends as capsules while the steps are rounded rectangles', () => {
    // 追加 3: 步骤节点圆角 10px；起点/终点是胶囊 999px.
    const capsule = RULES.filter((rule) => rule.body.includes('border-radius: 999px'))
    const ends = capsule.map((rule) => rule.selector).join(' ')
    expect(ends, 'the start is no capsule').toMatch(/start/u)
    expect(ends, 'the end is no capsule').toMatch(/end/u)
    expect(ruleOf('.gw-progress-node').body, 'a step is still a full pill').not.toContain('border-radius: 999px')
    expect(styleOf('gw-progress-col'), 'the columns are not capsules either').not.toContain('border-radius: 999px')
  })

  it('spaces the columns at 12px and the cells at 6px', () => {
    const cols = styleOf('gw-progress-cols')
    expect(cols).toContain('display: flex')
    expect(cols).toContain('flex-wrap: wrap')
    expect(cols).toContain('align-items: flex-start')
    expect(cols).toContain('gap: 12px')
    expect(styleOf('gw-progress-subs')).toContain('gap: 6px')
  })

  it('fills a state with the same token twice, 12% over 5%', () => {
    const filled = RULES.filter((rule) => rule.body.includes('linear-gradient') && rule.body.includes('12%') && rule.body.includes('5%'))
    expect(filled.length, 'no state is filled with the 12% → 5% gradient').toBeGreaterThan(0)
    for (const rule of filled) {
      expect(rule.body).toContain('linear-gradient(180deg')
      expect(rule.body).toContain('color-mix(in srgb,')
    }
    expect(progress.css, 'the fill is not transparent underneath').toContain('background-color: transparent')
  })

  it('leaves `pending` the only dashed and the only ungradiented state', () => {
    const dashed = RULES.filter((rule) => rule.body.includes('dashed'))
    expect(dashed.length, 'nothing is dashed').toBeGreaterThan(0)
    for (const rule of dashed) expect(rule.selector, 'a reached state is dashed').toContain('[data-state="pending"]')
    for (const rule of RULES) {
      if (!rule.selector.includes('[data-state="pending"]')) continue
      expect(rule.body, 'pending is filled instead of hollow').not.toContain('linear-gradient')
    }
  })

  it('floats the opened calls instead of pushing the node open', () => {
    // 追加 3: 展开浮层绝对定位，节点自身盒子不变。
    expect(styleOf('gw-progress-node-calls')).toContain('position: absolute')
    expect(styleOf('gw-progress-sub-calls')).toContain('position: absolute')
    expect(ruleOf('.gw-progress-node').body).toContain('height: 32px')
  })

  it('adds no motion beyond the two decorations already shipped', () => {
    const frames = [...progress.css.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((match) => match[1]!).sort()
    expect(frames).toEqual(['gw-progress-breathe', 'gw-progress-pulse'])
  })

  it('never scrolls sideways, never writes a literal colour, never reaches for the error token', () => {
    expect(progress.css).not.toContain('overflow-x')
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])/u)
    expect(progress.css).not.toMatch(/rgba?\(/u)
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
    // Every rule outside an at-rule stays under the page's own scope.
    const unscoped = RULES.filter((rule) => rule.at === '').filter((rule) => !rule.selector.startsWith('.gw-progress'))
    expect(unscoped.map((rule) => rule.selector)).toEqual([])
  })

  it('wraps the columns into one row per breakpoint, under 720px', () => {
    const narrow = mediaRules('max-width: 720px')
    expect(narrow.length, 'the 720px breakpoint is gone').toBeGreaterThan(0)
    const stack = narrow.map((rule) => `${rule.selector} {${rule.body}}`).join('\n')
    // The columns stop being a row of columns: either the container stacks them or each
    // column claims the full width — one of the two, at this breakpoint, never at another.
    expect(stack, 'the 720px breakpoint does not lay the columns out').toMatch(
      /\.gw-progress-col(?:s)? \{[^}]*(?:flex-direction: column|flex: 1 1|flex-basis: 100%|(?:min-)?width: 100%)/u,
    )
  })

  it('styles the new classes and nothing retired', () => {
    const styled = styledClasses()
    for (const name of ['gw-progress-cols', 'gw-progress-col', 'gw-progress-subs', 'gw-progress-sub', 'gw-progress-sub-dot', 'gw-progress-sub-word', 'gw-progress-sub-calls']) {
      expect(rulesWithClass(name), `.${name} is not styled`).not.toEqual([])
    }
    for (const name of styled) expect(name, 'a class carries the retired substring').not.toContain('gw-progress-task')
    for (const name of renderedClasses(pageOf(laneRun())())) expect(name, 'the page writes a retired class').not.toContain('gw-progress-task')
  })
})

describe('lanes: the wires are directed and bend at a wrap (追加 4)', () => {
  /** A stand-in flow: `measureWires` reads nothing but `getBoundingClientRect`. */
  function boxes(rects: ReadonlyArray<{ x: number, y: number, w: number, h: number }>): unknown {
    const frame = { left: 0, top: 0, width: 1000, height: 400 }
    return {
      querySelectorAll: () => rects.map((rect) => ({
        getBoundingClientRect: () => ({
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          right: rect.x + rect.w,
          bottom: rect.y + rect.h,
        }),
      })),
      getBoundingClientRect: () => ({ ...frame, right: frame.width, bottom: frame.height }),
    }
  }

  it('puts an arrow head in the layer, and points every wire at it', () => {
    const page = pageOf(laneRun())()
    const svg = hookOf(page, 'data-gw-progress-wires')
    expect(svg.type).toBe('svg')
    const defs = walk(svg).filter((element) => element.type === 'defs')
    expect(defs, 'the layer has no <defs>').toHaveLength(1)
    const markers = defs.flatMap((element) => walk(element)).filter((element) => element.type === 'marker')
    expect(markers.map((marker) => attr(marker, 'id'))).toContain('gw-progress-arrow')
    // The paths themselves are rendered from measurements, so their direction is read off
    // the shipped renderer; the marker id above is the DOM half of the same statement.
    expect(SOURCE, 'no wire carries an arrow head').toContain('marker-end')
    expect(SOURCE, 'the arrow head is not the one the defs defines').toContain('url(#gw-progress-arrow)')
  })

  it('draws nothing at all on a host without layout, and does not throw', () => {
    expect(progress.measureWires(null).paths).toEqual([])
    expect(progress.measureWires(undefined).paths).toEqual([])
    // A zero-width column — the stub renderer, an unmounted tab — measures nothing.
    const flat = progress.measureWires(boxes([{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }]))
    expect(flat.paths).toEqual([])
    // And the page itself renders an empty layer rather than a guessed line.
    const page = pageOf(laneRun())()
    expect(drawnPaths(hookOf(page, 'data-gw-progress-wires'))).toHaveLength(0)
  })

  it('still draws the straight line between two neighbours on one row', () => {
    const drawn = progress.measureWires(boxes([
      { x: 0, y: 0, w: 60, h: 32 },
      { x: 70, y: 0, w: 60, h: 32 },
    ]))
    const straight = drawn.paths.filter((points) => points.length === 2)
    expect(straight.length, 'two neighbours on one row lost their line').toBeGreaterThan(0)
    expect(straight).toContainEqual([[60, 16], [70, 16]])
  })

  it('bends a wrapped pair into a three-segment elbow instead of dropping it', () => {
    // 追加 4: 折行时不再「不画」，而是画一条三段折线（四个顶点，拐角 90°）。The third box
    // starts the next row at the container's left edge, so the pair that wrapped shares no
    // span — the case §21 deliberately left undrawn.
    const wrapped = progress.measureWires(boxes([
      { x: 0, y: 0, w: 60, h: 32 },
      { x: 70, y: 0, w: 400, h: 32 },
      { x: 0, y: 40, w: 60, h: 32 },
    ]))
    const elbows = wrapped.paths.filter((points) => points.length === 4)
    expect(elbows.length, 'the wrapped pair is still not drawn').toBeGreaterThan(0)
    expect(wrapped.paths.filter((points) => points.length !== 2 && points.length !== 4)).toEqual([])
    // The elbow leaves the wrapped box's bottom edge and lands on the next box's top edge.
    const elbow = elbows[0]!
    expect(elbow[0]![1]).toBe(32)
    expect(elbow[3]![1]).toBe(40)
  })
})

describe('lanes: no new words (追加 5)', () => {
  it('adds no dictionary key beyond the one a retry needs, in either language', () => {
    const keys = progressKeys('zh')
    // 55, not 54: 追加 8 (`progress.flow.attempt`, 中 `第 {n} 遍` / 英 `Attempt {n}`) is the
    // one key this block adds, and it is the only one it may add.
    expect(keys.length, 'the progress namespace changed size').toBe(55)
    expect(keys, 'the retry key is missing').toContain('progress.flow.attempt')
    expect(progressKeys('en'), 'the two dictionaries disagree').toEqual(keys)
    // Nothing else in the namespace names the new structure: a key is a sentence waiting to
    // be written, and this block ships no sentence.
    const vocabulary = keys.filter((key) => /(?:^|\.)(?:subs?|lanes?|swim|cell|cells|cols?|rows?|matrix)(?:\.|$)/iu.test(key))
    expect(vocabulary).toEqual([])
  })

  it('says nothing new on the page: the cells print the phase and nothing else', () => {
    const numbered = pageTexts(pageOf(laneRun())())
    const plainPage = pageOf(plainRun())()
    const plain = pageTexts(plainPage)
    const titles = ['任务 1 · 修复登录', '任务 2 · 写文档']
    // The plain run draws no cells at all, so its words are the page's own words…
    expect(hooksOf(plainPage, 'data-gw-progress-sub')).toHaveLength(0)
    // …and the numbered run's words are exactly those, plus the phases the stream recorded.
    expect(numbered.filter((text) => !titles.includes(text))).toEqual(plain)
  })

  it('keeps the flow’s reader label, and speaks the cells with the state words already shipped', () => {
    const page = pageOf(laneRun())()
    const labels = walk(page)
      .map((element) => attr(element, 'aria-label'))
      .filter((label): label is string => label !== undefined)
    expect(labels, 'the flow lost its reader label').toContain(zh('progress.flow.aria'))
    for (const state of ['progress.plan.waiting', 'progress.plan.running', 'progress.plan.done', 'progress.plan.failed', 'progress.plan.cancelled']) {
      expect(bundle.GROK_WORKFLOW_DICT['zh']![state], `${state} is missing`).toBeTypeOf('string')
    }
  })
})

/**
 * A retry is not a colour that gets overwritten: every attempt keeps its own mark.
 *
 * Contract 追加 8. A cell is still one task on one leg, and the recovery rule still colours
 * the cell — but the attempt that failed keeps its own dot, the count of attempts is spoken
 * once, and the pair that was re-read is joined by a dashed wire. Nothing here is a new
 * sentence, and nothing moves: the cell stays 26px and the rows stay task-numbered.
 */
describe('lanes: every attempt keeps its own mark (追加 8)', () => {
  /** The cells of one column, or a failure that names the column. */
  function cellsOfColumn(page: unknown, kind = 'execute'): Element[] {
    const column = columnsOf(page).find((entry) => attr(entry, 'data-gw-progress-col') === kind)
    expect(column, `the fixture drew no ${kind} column`).toBeDefined()
    return cellsOf(column!)
  }

  /** The one cell of a run whose only work leg walked one task. */
  function cellOf(page: unknown, kind = 'execute'): Element {
    const cells = cellsOfColumn(page, kind)
    expect(cells, `the ${kind} column drew no single cell`).toHaveLength(1)
    return cells[0]!
  }

  /** The dots of one cell, in document order. */
  function dotsOf(cell: Element): Element[] {
    return walk(cell).filter((element) => classesOf(element).includes('gw-progress-sub-dot'))
  }

  it('draws one dot per attempt in seq order, each coloured by its own row', () => {
    const cell = cellOf(pageOf(retryRun())())
    const dots = dotsOf(cell)
    // 8.1: 每行一颗点，按 `seq` 从左到右（`seq` 1 是失败那次，即使它到达得更晚）。
    expect(dots.map((dot) => attr(dot, 'data-attempt'))).toEqual(['1', '2'])
    // 8.1: 一颗点的颜色只看那一行 —— 第一次琥珀，第二次绿。
    expect(dots.map((dot) => attr(dot, 'data-state'))).toEqual(['failed', 'done'])
    // 而格自己仍是恢复规则的结果：那颗琥珀没有被格吞掉，格也没有被点染红。
    expect(attr(cell, 'data-state')).toBe('done')
    // The dots share a container of their own, and the cell keeps its single row of content.
    expect(walk(cell).filter((element) => classesOf(element).includes('gw-progress-sub-dots')), 'the dots have no container').toHaveLength(1)
  })

  it('keeps a retry that is still running open on its own dot', () => {
    const cell = cellOf(pageOf(retryOpenRun())())
    expect(dotsOf(cell).map((dot) => [attr(dot, 'data-attempt'), attr(dot, 'data-state')])).toEqual([['1', 'failed'], ['2', 'doing']])
    // The first attempt really did fail and nothing has replaced it yet, so the cell is amber.
    expect(attr(cell, 'data-state')).toBe('failed')
  })

  it('names the attempt count on a retried cell, and stays silent where one call passed', () => {
    // 8.1: N>1 才有角标，文字是新键 `progress.flow.attempt`，n = 该格的行数。
    expect(zh('progress.flow.attempt', { n: 2 })).toBe('第 2 遍')
    expect(bundle.GROK_WORKFLOW_INTERNALS.translator('en')('progress.flow.attempt', { n: 2 })).toBe('Attempt 2')
    const retried = cellOf(pageOf(retryRun())())
    expect(textOf(hookOf(retried, 'data-gw-progress-sub-badge'))).toBe(zh('progress.flow.attempt', { n: 2 }))
    // A cell whose task passed first time is the norm: no badge, and no word for it.
    const once = cellsOfColumn(pageOf(laneRun())())[0]!
    expect(hooksOf(once, 'data-gw-progress-sub-badge'), 'a first-pass cell grew a badge').toHaveLength(0)
    expect(dotsOf(once).map((dot) => attr(dot, 'data-attempt'))).toEqual(['1'])
  })

  it('hangs a retry wire only on the pair whose first attempt did not complete', () => {
    // 8.2: 虚线、只用 border token、不表状态（没有 `data-tone`）。
    const dashed = RULES.filter((rule) => rule.body.includes('stroke-dasharray'))
    expect(dashed.length, 'no wire is dashed').toBeGreaterThan(0)
    for (const rule of dashed) expect(rule.body, 'the retry wire takes a state colour').toContain('--dsw-alias-border-l2')
    const page = pageOf(retryRun())()
    const tones = walk(page).filter((element) => Object.prototype.hasOwnProperty.call(element.props, 'data-tone'))
    expect(tones.map((element) => classesOf(element).join(' ')), 'the wire claims a tone').toEqual([])
    // Nothing is drawn on a host without layout, and nothing throws.
    expect(drawnPaths(hookOf(page, 'data-gw-progress-wires'))).toHaveLength(0)

    // Which pairs are joined is read off the dots: the left dot of a retried pair is not
    // `done`, while a task answered twice and good twice offers no pair to join.
    const retried = cellOf(page)
    expect(dotsOf(retried).map((dot) => attr(dot, 'data-state')), 'the failing attempt lost its mark').toEqual(['failed', 'done'])
    const resubmitted = cellOf(pageOf(resubmitRun())())
    expect(dotsOf(resubmitted).map((dot) => attr(dot, 'data-state')), 'a good pair looks like a retry').toEqual(['done', 'done'])
  })

  it('draws that wire from one dot’s right edge to the next dot’s left edge', () => {
    // 8.2: 从那一颗点的右缘中点 → 下一颗点的左缘中点，仍走 `measureProgressFlowWires()`.
    // The measurement is driven with dot boxes and their own states, so the run's model — not
    // my arithmetic — decides which pairs are joined; a segment may be reported with the
    // wires or as a retry step, and either place counts as drawn.
    const box = (x: number, w: number, attributes: Record<string, string>) => ({
      getBoundingClientRect: () => ({ left: x, top: 0, width: w, height: 6, right: x + w, bottom: 6 }),
      getAttribute: (name: string) => attributes[name] ?? null,
      dataset: { state: attributes['data-state'] ?? '', attempt: attributes['data-attempt'] ?? '' },
    })
    const flowWith = (states: readonly string[]): unknown => ({
      querySelectorAll: (selector: string) => {
        if (/sub-dot|attempt/iu.test(selector)) {
          return states.map((state, index) => box(index * 12, 6, { 'data-state': state, 'data-attempt': String(index + 1), 'data-gw-progress-sub-dot': 'k' }))
        }
        if (/data-gw-progress-sub(?![-a-z])|\.gw-progress-sub(?![\w-])/u.test(selector)) return [box(0, 200, { 'data-gw-progress-sub': 'k' })]
        return []
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 400, right: 1000, bottom: 400 }),
    })
    const segmentsOf = (measured: unknown): number[][][] => {
      const value = measured as { paths?: number[][][], retries?: number[][][] }
      return [...(value.paths ?? []), ...(value.retries ?? [])]
    }
    expect(segmentsOf(progress.measureWires(flowWith(['failed', 'done']))), 'the retried pair lost its wire').toContainEqual([[6, 3], [12, 3]])
    // An attempt that passed is not re-read: two good dots offer no pair to join.
    expect(segmentsOf(progress.measureWires(flowWith(['done', 'done']))), 'a good pair grew a retry wire').toEqual([])
    // One dot, one attempt: nothing to join.
    expect(segmentsOf(progress.measureWires(flowWith(['done'])))).toEqual([])
  })

  it('keeps a failed run’s page the same drawing, only coloured by what it recorded', () => {
    const run = failedRun()
    const page = pageOf(run)()
    const flow = progress.deriveProgressFlow(run)
    // 8.3: 该琥珀的格琥珀、该绿的格绿；同一张图、同一套 `data-*`。
    const execute = columnsOf(page).find((column) => attr(column, 'data-gw-progress-col') === 'execute')!
    expect(attr(execute, 'data-state')).toBe('blocked')
    expect(cellsOf(execute).map((cell) => attr(cell, 'data-state'))).toEqual(['done', 'blocked'])
    // The footer is still the one count line, and it is still the flow's own key.
    expect(textOf(hookOf(page, 'data-gw-progress-left'))).toBe(zh('progress.flow.left', { left: flow.remaining, total: flow.total }))
    expect(flow.remaining).toBe(flow.total - flow.at)
    // And the page invented no sentence to explain itself.
    const allowed = new Set<string>([run.name, ...Object.values(bundle.GROK_WORKFLOW_DICT['zh'] ?? {})])
    for (const row of run.members) if (row.phase !== undefined) allowed.add(row.phase)
    allowed.add(zh('progress.flow.left', { left: flow.remaining, total: flow.total }))
    for (let n = 2; n <= run.members.length; n += 1) allowed.add(zh('progress.flow.attempt', { n }))
    expect(pageTexts(page).filter((text) => !allowed.has(text)), 'the failed page says something new').toEqual([])
  })

  it('writes the engine’s own `cancelled` on a cancelled run’s cells and columns', () => {
    const run = cancelledRun()
    const page = pageOf(run)()
    const execute = columnsOf(page).find((column) => attr(column, 'data-gw-progress-col') === 'execute')!
    // 8.3: 取消页 `data-state` 用引擎原话，不派生。
    expect(attr(execute, 'data-state')).toBe('cancelled')
    const cell = cellOf(page)
    expect(attr(cell, 'data-state')).toBe('cancelled')
    expect(dotsOf(cell).map((dot) => attr(dot, 'data-state'))).toEqual(['cancelled'])
    // Same page, no new words, and the same one count line.
    const flow = progress.deriveProgressFlow(run)
    expect(textOf(hookOf(page, 'data-gw-progress-left'))).toBe(zh('progress.flow.left', { left: flow.remaining, total: flow.total }))
    const allowed = new Set<string>([run.name, ...Object.values(bundle.GROK_WORKFLOW_DICT['zh'] ?? {})])
    for (const row of run.members) if (row.phase !== undefined) allowed.add(row.phase)
    allowed.add(zh('progress.flow.left', { left: flow.remaining, total: flow.total }))
    expect(pageTexts(page).filter((text) => !allowed.has(text)), 'the cancelled page says something new').toEqual([])
  })

  it('stops the highlight on the column whose newest attempt has not settled', () => {
    // 8.3: 重试正在跑 → 高亮停在同一列，不往后跳也不往前滑。
    const run = retryOpenRun()
    const page = pageOf(run)()
    const flow = progress.deriveProgressFlow(run)
    const current = columnsOf(page).filter((column) => attr(column, 'data-current') === 'true')
    expect(current, 'exactly one column is the current one').toHaveLength(1)
    expect(attr(current[0]!, 'data-gw-progress-col')).toBe('execute')
    expect(flow.at).toBe(flow.nodes.findIndex((node) => node.kind === 'execute') + 1)
    expect(flow.remaining).toBe(flow.total - flow.at)
  })
})
