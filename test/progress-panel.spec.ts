import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The "进度" page is one task panel: a header, a horizontal fork, a stuck line, the Guardian
 * card and the dock — and two readings a click can take out of the figure.
 *
 * ## What this file states, and what it inherited
 *
 * The operator retired the vertical `flowchart TD` tree this page used to draw, and asked for
 * the picture they drew by hand: 起点 → 规划 (the fork) → one card per plan task, each carrying
 * six ring lights → one branch per call a task made → 汇总 (where the branches meet) → 验收
 * (carrying the five checks) → 终点. Everything below is read off the run's own rows on every
 * render, and the figure is laid out from the mermaid text the container carries — the drawing
 * and the text cannot disagree.
 *
 * The invariants were carried over from the panel this replaced (the header, the state
 * colours, the measured wire layer, a node's own call list, the stuck line, the dock); what
 * is new is the direction of the picture, the two rows of lights inside a card, and the fact
 * that a finished run asks the reader for nothing.
 *
 * The bundle is loaded the way the host loads it (a stub `__ModuleLoader__` and a stub React
 * whose `useState` really stores), so a click is a real second render. `useEffect` never runs,
 * which is also the statement that a host without layout still renders: the figure falls back
 * to the default boxes, and that is the geometry every test below reads.
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

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
  summaryRejected?: { drafts: number, stage: string, reason: string }
  guardian?: {
    started: boolean
    armed: boolean
    budgetMs: number
    ended: boolean
    cancelled: boolean
    findings: Array<{ seq: number, label: string, signal: string, action: string, reason: string, atMs?: number }>
  }
}

type Translator = (key: string, params?: Record<string, unknown>) => string

/** One of the six ring lights a task card carries, or one of the five checks on 验收. */
interface PanelLight { key: string, state: string }

/** Where one sub box sits: the task it hangs under, and which try of that leg it was. */
interface PanelSubtask { taskId: string, taskNumber?: number, seq: number, leg?: string, attempt: number }

interface PanelNode {
  id: string
  kind: string
  level: number
  label: string
  state: string
  current: boolean
  calls: ProgressMember[]
  openable: boolean
  rings?: PanelLight[]
  checks?: PanelLight[]
  rejected?: { drafts: number, stage: string, reason: string }
  subtask?: PanelSubtask
}

interface PanelGraph {
  state: string
  mermaid: string
  nodes: PanelNode[]
  edges: Array<{ from: string, to: string, kind: string }>
  checks: PanelLight[]
  headline: { at: number, total: number, remaining?: number, eta?: { ms: number, basis: number } }
  at: number
  total: number
  remaining: number
  final?: { draft: number, seq: number }
  stuck?: { nodeId: string, at: number, kind: string, drafts?: number }
}

interface ParsedNode { id: string, label: string, shape: string }

interface Parsed {
  direction: string
  nodes: ParsedNode[]
  edges: Array<{ from: string, to: string }>
}

/** One laid-out box: the column it stands in, and its place in the figure. */
interface Box { id: string, x: number, y: number, w: number, h: number, column: number }

interface Layout {
  width: number
  height: number
  nodes: Box[]
  edges: Array<{ from: string, to: string, d: string }>
}

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    fold: (records: ReadonlyArray<Record<string, unknown>>) => ProgressRun[]
    mount: (ctx: Record<string, unknown>, services: Record<string, unknown>, i18n: Record<string, unknown>, status: Record<string, unknown>, fail: (stage: string, error: unknown) => void) => unknown
    derivePanelGraph: (run: ProgressRun, t?: Translator) => PanelGraph
    parsePanelMermaid: (text: string) => Parsed
    layoutPanelGraph: (parsed: Parsed, sizes: Record<string, { w: number, h: number }>, availableWidth: number, floors: Map<string, number>) => Layout
    revealSheet: (box?: unknown) => void
  }
}

/** The hook cells of the render in progress: React keeps them across a re-render. */
type Cells = { index: number, cells: unknown[] }

let rendering: Cells | undefined

/**
 * Load the bundle the way the host does, with a stub React whose `useState` really stores.
 *
 * The one hook that must be real is `useState`: a click writes the page's own state, and a
 * no-op setter would make every "after the click" assertion a photograph of the tree before
 * it.
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
      return [cells.cells[at], (next: unknown) => {
        cells.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(cells.cells[at]) : next
      }]
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

/** The classes of one element, split the way the DOM splits them. */
function classesOf(element: Element): string[] {
  const value = element.props['className']
  return typeof value === 'string' ? value.split(/\s+/).filter((token) => token !== '') : []
}

/** One attribute as the DOM would spell it. */
function attr(element: Element, name: string): string | undefined {
  const value = element.props[name]
  if (value === undefined || value === null) return undefined
  return String(value)
}

/** Whether one name appears as a whole attribute, never as the head of a longer one. */
function carriesHook(text: string, hook: string): boolean {
  return new RegExp(`${hook}(?![A-Za-z0-9_-])`).test(text)
}

/** The one rule that declares a selector, whether it stands alone or in a group. */
function ruleWith(selector: string): string | undefined {
  return bundle.GROK_WORKFLOW_PROGRESS.css.split('\n').find((line) => {
    if (line.trim().startsWith('@')) return false
    const at = line.indexOf('{')
    if (at === -1) return false
    return line.slice(0, at).split(',').map((part) => part.trim()).includes(selector)
  })
}

/** The stylesheet from one media query on, or `''` when the query is not there. */
function mediaBlock(query: string): string {
  const css = bundle.GROK_WORKFLOW_PROGRESS.css
  const at = css.indexOf(`@media (${query})`)
  return at === -1 ? '' : css.slice(at)
}

/** The classes the stylesheet styles, one per selector, without the leading dot. */
function styledClasses(): string[] {
  const tokens = new Set<string>()
  for (const line of bundle.GROK_WORKFLOW_PROGRESS.css.split('\n')) {
    if (!line.includes('{') || line.trim().startsWith('@')) continue
    const selector = line.slice(0, line.indexOf('{'))
    for (const match of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) tokens.add(match[1]!)
  }
  return [...tokens]
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')
const en = bundle.GROK_WORKFLOW_INTERNALS.translator('en')

/**
 * The width the figure starts from before anything measured it.
 *
 * `useEffect` never runs here, so the page lays out against this number and then measures
 * nothing: the boxes below are the ones a host without layout draws, which is also what a
 * reader sees for the first frame of a real session.
 */
const START_WIDTH = 720

/**
 * Local wall-clock base of every fixture, built from local parts so the clock a call line
 * prints never depends on the zone of the machine that runs the suite.
 */
const BASE = new Date(2026, 10, 25, 8, 2).getTime()

/** One declared call: a row of a run, settled or still open, 20 s long. */
function member(seq: number, label: string, phase: string, outcome?: string): ProgressMember {
  return {
    seq,
    label,
    phase,
    childId: `child-${seq}`,
    order: seq - 1,
    startedAt: BASE + seq * 60_000,
    endedAt: BASE + seq * 60_000 + 20_000,
    ...outcome === undefined ? {} : { outcome },
  }
}

/** One run, in the shape the host hands the tab. */
function runOf(name: string, members: ProgressMember[], extra: Record<string, unknown> = {}): ProgressRun {
  return { runId: `r-${name}`, name: `任务团队 · ${name}`, anchorSeq: 1, members, details: [], ...extra }
}

/** 等你点头: the run announced itself and declared nothing. */
function waitingRun(): ProgressRun {
  return runOf('等你点头', [])
}

/**
 * 进行中: two plan tasks, a retry inside the first of them, one of them still open. The shape
 * the figure is built for — one fork, two task cards, three branches.
 */
function runningRun(): ProgressRun {
  return runOf('两个任务', [
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '任务 1 · 建表', 'failed'),
    member(3, '执行', '任务 1 · 建表', 'completed'),
    member(4, '执行', '任务 2 · 写文档'),
  ])
}

/** 已完成: one task through work and check, and the first summary draft shipped. */
function doneRun(): ProgressRun {
  return runOf('一个任务', [
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '任务 1 · 建表', 'completed'),
    member(3, '检查', '任务 1 · 建表', 'completed'),
    member(4, '汇总·第1稿', '汇总', 'completed'),
  ], { stopReason: 'completed', summaryFinalDraft: 1 })
}

/** 未通过: one task tried twice, both attempts failed, the run ended broken. */
function failedRun(): ProgressRun {
  return runOf('没过', [
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '任务 1 · 建表', 'failed'),
    member(3, '执行（尝试 2）', '任务 1 · 建表', 'failed'),
  ], { stopReason: 'error' })
}

/**
 * 每一稿都被退回, inside the parent (`model` strategy): no call names the summary leg, so the
 * verdict is the only thing the summary card carries.
 */
const REJECTED_REASON = 'the answer omits incomplete task b'

function rejectedRun(): ProgressRun {
  return runOf('全被退回', [
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '任务 1 · 建表', 'completed'),
    member(3, '检查', '任务 1 · 建表', 'completed'),
  ], { stopReason: 'completed', summaryRejected: { drafts: 2, stage: 'verify', reason: REJECTED_REASON } })
}

/** 已取消: a failed call, but the reader stopped the run — which is not "stuck". */
function cancelledRun(): ProgressRun {
  return runOf('取消', [
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '任务 1 · 建表', 'failed'),
  ], { stopReason: 'cancelled' })
}

/** 一条腿里没有任务号: two work calls and no plan task between them, so they share one card. */
function looseRun(): ProgressRun {
  return runOf('没有任务号', [
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '执行', 'completed'),
    member(3, '执行', '执行'),
  ])
}

/** A guardian that started, armed, and rescued one child. */
const GUARDIAN = {
  started: true,
  armed: true,
  budgetMs: 300_000,
  ended: false,
  cancelled: false,
  findings: [{ seq: 3, label: '执行 3', signal: 'timeout', action: 'rescue', reason: 'the child went quiet', atMs: 2_000 }],
}

/** The running fixture with a guardian recorded on it. */
function guardedRun(): ProgressRun {
  return { ...runningRun(), guardian: GUARDIAN }
}

/** The log time of the call with this `seq`, as the page spells it (`8:03`). */
function clockOf(seq: number): string {
  const date = new Date(BASE + seq * 60_000)
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Render one page against fixed props, with no hook cells (a single pass). */
function pageOf(run: ProgressRun | undefined, extra: Record<string, unknown> = {}): unknown {
  const snapshot = run === undefined ? { runs: [], activeRun: undefined } : { runs: [run], activeRun: run }
  return progress.component({
    t: zh,
    progressT: zh,
    useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
    ...extra,
  })
}

/** Render one page with real hook cells, so a click is a real second render. */
function mount(run: ProgressRun, extra: Record<string, unknown> = {}) {
  const cells: unknown[] = []
  const snapshot = { runs: [run], activeRun: run }
  const props = {
    t: zh,
    progressT: zh,
    useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
    ...extra,
  }
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

/** The page's own copy, without the scoped stylesheet (a text child of the tree). */
function pageTexts(page: unknown): string[] {
  return texts(page).filter((text) => text !== progress.css)
}

/** Every card of one page, in document order, by the hook the panel names. */
function nodesOf(page: unknown): Element[] {
  return hooksOf(page, 'data-gw-progress-pnode')
}

/** The id of every card of one page, in document order. */
function nodeIdsOf(page: unknown): string[] {
  return nodesOf(page).map((node) => attr(node, 'data-gw-progress-pnode')!)
}

/** The body of one card — the `button` or `div` that carries its word and its lights. */
function bodyOf(page: unknown, id: string): Element {
  const node = nodesOf(page).find((element) => attr(element, 'data-gw-progress-pnode') === id)
  expect(node, `the page drew no node ${id}`).toBeDefined()
  const body = walk(node!).find((element) => classesOf(element).includes('gw-progress-pnode-body'))
  expect(body, `node ${id} has no body`).toBeDefined()
  return body!
}

/** Click the control that opens one card, and reopen the page. */
function clickNode(view: () => unknown, id: string): unknown {
  const body = bodyOf(view(), id)
  expect(body.type, `node ${id} is not a control`).toBe('button')
  ;(body.props['onClick'] as () => void)()
  return view()
}

/** The module ids the text carries, back under the model's own: `finish` is `end`. */
function modelIdOf(id: string): string {
  return id === 'finish' ? 'end' : id
}

/**
 * The cards whose second row the model knows about, and the least height each one needs.
 *
 * The picture is laid out from the text, but a second row — six rings, five checks, a shipped
 * draft — is not in that text, so the layout is told about it by id. This is the page's own
 * rule restated: a card with lights is 56 tall, a capsule with a badge 48.
 */
function floorsOf(graph: PanelGraph): Map<string, number> {
  const floors = new Map<string, number>()
  for (const node of graph.nodes) {
    if ((node.rings?.length ?? 0) > 0 || (node.checks?.length ?? 0) > 0) {
      floors.set(node.id, 56)
      continue
    }
    const shipped = graph.final === undefined ? undefined : graph.final.draft
    if (node.kind === 'summarize' && Number.isFinite(shipped) && shipped! > 0) floors.set(node.id, 48)
  }
  return floors
}

/**
 * The layout the page drew, recomputed from the same model and the same start width.
 *
 * `useEffect` never runs in this harness, so the page lays out against `START_WIDTH` with no
 * measured box — the very call below. Every geometry case reads the numbers out of this and
 * then ties them back to the DOM's own inline styles.
 */
function layoutFor(run: ProgressRun, width = START_WIDTH): { graph: PanelGraph, parsed: Parsed, layout: Layout } {
  const graph = progress.derivePanelGraph(run, zh)
  const parsed = progress.parsePanelMermaid(graph.mermaid)
  return { graph, parsed, layout: progress.layoutPanelGraph(parsed, {}, width, floorsOf(graph)) }
}

/** One straight run of a wire, in figure coordinates. */
type Segment = [[number, number], [number, number]]

/**
 * Split a `d` into the straight runs it draws.
 *
 * A rounded corner (`Q`) is left out on purpose: it is at most an 8 px cap on a corner the two
 * straight runs already place, and folding it in would report a diagonal nobody drew.
 */
function segmentsOf(d: string): Segment[] {
  const runs: Segment[] = []
  let pen: Segment[0] | undefined
  for (const token of d.match(/[MLQ][^MLQ]*/g) ?? []) {
    const parts = token.trim().split(/[\s,]+/)
    const numbers = parts.slice(1).map(Number)
    // `M x y` and `L x y` are absolute pairs; `Q cx cy x y` ends on its own pair.
    const target: Segment[0] = [numbers[numbers.length - 2]!, numbers[numbers.length - 1]!]
    if (parts[0] === 'L' && pen !== undefined) runs.push([pen, target])
    pen = target
  }
  return runs
}

/** The first and the last point of a `d`: where the wire leaves one card and lands on the next. */
function endsOf(d: string): [Segment[0], Segment[0]] {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const last = numbers.length - 2
  return [[numbers[0]!, numbers[1]!], [numbers[last]!, numbers[last + 1]!]]
}

/** Every column's own span, left to right. */
function columnSpans(layout: Layout): Array<{ left: number, right: number }> {
  const spans = new Map<number, { left: number, right: number }>()
  for (const box of layout.nodes) {
    const span = spans.get(box.column) ?? { left: Infinity, right: -Infinity }
    span.left = Math.min(span.left, box.x)
    span.right = Math.max(span.right, box.x + box.w)
    spans.set(box.column, span)
  }
  return [...spans.keys()].sort((left, right) => left - right).map((at) => spans.get(at)!)
}

/** The empty band between two neighbouring columns: the only place a wire may run vertically. */
function columnGaps(layout: Layout): Array<{ left: number, right: number }> {
  const spans = columnSpans(layout)
  const gaps = []
  for (let index = 0; index + 1 < spans.length; index += 1) {
    gaps.push({ left: spans[index]!.right, right: spans[index + 1]!.left })
  }
  return gaps
}

describe('the page, top to bottom', () => {
  it('draws the header, the figure, the stuck line, the Guardian and the dock, in that order', () => {
    const page = pageOf(guardedRun())
    const order = walk(page)
    const at = (hook: string) => order.indexOf(hookOf(page, hook))
    expect(at('data-gw-progress-bar')).toBeGreaterThanOrEqual(0)
    expect(at('data-gw-progress-figure')).toBeGreaterThan(at('data-gw-progress-bar'))
    expect(at('data-gw-progress-graph')).toBeGreaterThan(at('data-gw-progress-figure'))
    // The wire layer sits inside the figure, before the cards it is drawn behind.
    expect(at('data-gw-progress-wires')).toBeGreaterThan(at('data-gw-progress-graph'))
    expect(at('data-gw-progress-pnodes')).toBeGreaterThan(at('data-gw-progress-wires'))
    // The Guardian's tiles fold into the header's details: they stand before the figure,
    // in flow, and the dock still closes the page after everything else.
    expect(at('data-gw-progress-guardian')).toBeGreaterThan(at('data-gw-progress-bar'))
    expect(at('data-gw-progress-figure')).toBeGreaterThan(at('data-gw-progress-guardian'))
    expect(at('data-gw-progress-dock')).toBeGreaterThan(at('data-gw-progress-guardian'))
    // The figure wraps the graph, and the Guardian is a sibling of both, never a column in it.
    expect(walk(hookOf(page, 'data-gw-progress-figure')).some((element) => element === hookOf(page, 'data-gw-progress-graph'))).toBe(true)
    expect(hooksOf(hookOf(page, 'data-gw-progress-graph'), 'data-gw-progress-guardian')).toHaveLength(0)
    // A run with no guardian draws none, and the figure is still the page.
    expect(hooksOf(pageOf(runningRun()), 'data-gw-progress-guardian')).toHaveLength(0)
  })

  it('says the level the run is on and the measured remainder, and nothing else', () => {
    // 进行中: the run stands at level 3 of 7 (the task cards), and one finished level was
    // measured, so the remainder rides behind the sentence. The tooltip is where the method is
    // stated; the visible line never says it.
    const running = hookOf(pageOf(runningRun()), 'data-gw-progress-line')
    expect(running.type).toBe('p')
    expect(classesOf(running)).toEqual(['gw-progress-line'])
    expect(textOf(running).startsWith(zh('progress.panel.step', { at: 4, total: 7 }))).toBe(true)
    expect(textOf(running)).toContain(zh('progress.panel.eta', { time: '' }).replace('', ''))
    expect(attr(running, 'title')).toBe(zh('progress.panel.etaBasis', { n: 1 }))
    // 等你点头: nothing walked yet, so the reader's place is the start and no level is left
    // over to estimate — the clause, and its tooltip, are simply absent.
    const waiting = hookOf(pageOf(waitingRun()), 'data-gw-progress-line')
    expect(textOf(waiting)).toBe(zh('progress.panel.step', { at: 1, total: 7 }))
    expect(attr(waiting, 'title')).toBeUndefined()
    // 已完成: every level walked, so there is nothing ahead to estimate either.
    const done = hookOf(pageOf(doneRun()), 'data-gw-progress-line')
    expect(textOf(done)).toBe(zh('progress.panel.step', { at: 7, total: 7 }))
    expect(attr(done, 'title')).toBeUndefined()
    // The chip is the run's own state, and its word is the reader's.
    expect(attr(hookOf(pageOf(runningRun()), 'data-gw-progress-chip'), 'data-state')).toBe('running')
    expect(textOf(hookOf(pageOf(doneRun()), 'data-gw-progress-chip'))).toBe('已完成')
    expect(textOf(hookOf(pageOf(waitingRun()), 'data-gw-progress-chip'))).toBe('等你点头')
    expect(textOf(hookOf(pageOf(failedRun()), 'data-gw-progress-chip'))).toBe('未通过')
    expect(textOf(hookOf(pageOf(cancelledRun()), 'data-gw-progress-chip'))).toBe('已取消')
  })

  it('carries no count line, no matrix, no lane and none of the retired drawings', () => {
    // Each name is matched as a whole attribute, so `data-gw-progress-node` never eats
    // `data-gw-progress-node-calls`.
    const retired = [
      'data-gw-progress-flow',
      'data-gw-progress-nodes',
      'data-gw-progress-node',
      'data-gw-progress-node-word',
      'data-gw-progress-node-ord',
      'data-gw-progress-node-toggle',
      'data-gw-progress-sub-toggle',
      'data-gw-progress-sub-calls',
      'data-gw-progress-sub',
      'data-gw-progress-subs',
      'data-gw-progress-col',
      'data-gw-progress-cols',
      'data-gw-progress-left',
      'data-gw-progress-branch-side',
      // the three dots that drew a task's attempts before the branches replaced them
      'data-gw-progress-attempt',
    ]
    const retiredClasses = [
      'gw-progress-flow',
      'gw-progress-nodes',
      'gw-progress-node',
      'gw-progress-node-word',
      'gw-progress-node-dot',
      'gw-progress-node-toggle',
      'gw-progress-cols',
      'gw-progress-col',
      'gw-progress-subs',
      'gw-progress-sub',
      'gw-progress-sub-calls',
      'gw-progress-sub-toggle',
      'gw-progress-left',
      'gw-progress-pnode-attempt',
      'gw-progress-pnode-retry',
      'gw-progress-pnode-dots',
    ]
    for (const run of [waitingRun(), runningRun(), doneRun(), failedRun(), rejectedRun()]) {
      const page = pageOf(run)
      for (const name of retired) {
        expect(hooksOf(page, name), name).toHaveLength(0)
        expect(carriesHook(SOURCE, name), `${name} is still shipped`).toBe(false)
      }
      for (const element of walk(page)) {
        for (const token of classesOf(element)) {
          expect(retiredClasses.includes(token), token).toBe(false)
          // The spine's card prefix may not hide inside a new name either.
          expect(token.includes('gw-progress-task'), token).toBe(false)
        }
      }
    }
    // The matcher can fail both ways, and the live names are not mistaken for retired ones.
    expect(carriesHook('{"data-gw-progress-left": 1}', 'data-gw-progress-left')).toBe(true)
    expect(carriesHook(SOURCE, 'data-gw-progress-node-calls')).toBe(true)
    expect(carriesHook('{"data-gw-progress-node-calls": 1}', 'data-gw-progress-node')).toBe(false)
  })

  it('keeps the stylesheet scoped, token-coloured and free of the retired page', () => {
    const css = progress.css
    // Every rule is scoped to the tab: nothing leaks into the rest of the shell.
    for (const rule of css.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('@'))) {
      expect(rule.trim().startsWith('.gw-progress'), rule).toBe(true)
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
    expect(css).not.toMatch(/\bhsla?\(/)
    expect(css).not.toContain('--dsw-alias-state-error-primary')
    expect(css).not.toContain('scroll-snap')
    expect(css).toContain('var(--dsw-font-family-sans')
    // Every colour is a design token, a mix of one, or a named keyword.
    const colours = css.match(/(?:^|[^-\w])(?:color|background|border-color|fill|stroke|outline)\s*:\s*[^;]+/g) ?? []
    expect(colours.length).toBeGreaterThan(10)
    for (const declaration of colours) {
      expect(declaration, declaration).toMatch(/var\(--dsw-alias-|transparent|currentColor|none|inherit/)
    }
    const styled = styledClasses()
    for (const name of [
      'gw-progress-figure',
      'gw-progress-line',
      'gw-progress-graph',
      'gw-progress-wires',
      'gw-progress-pnodes',
      'gw-progress-pnode',
      'gw-progress-pnode-body',
      'gw-progress-pnode-main',
      'gw-progress-pnode-dot',
      'gw-progress-pnode-word',
      'gw-progress-pnode-badge',
      'gw-progress-pnode-lights',
      'gw-progress-ring',
      'gw-progress-check',
      'gw-progress-node-calls',
      'gw-progress-node-rejected',
      'gw-progress-stuck',
      'gw-progress-dock-fill',
    ]) expect(styled, name).toContain(name)
    for (const name of ['gw-progress-flow', 'gw-progress-cols', 'gw-progress-col', 'gw-progress-subs', 'gw-progress-left', 'gw-progress-node', 'gw-progress-node-toggle', 'gw-progress-pnode-attempt', 'gw-progress-pnode-retry']) {
      expect(styled, name).not.toContain(name)
    }
  })

  it('gives every state exactly one colour token, and never a red one', () => {
    const states: Array<[string, string]> = [
      ['done', '--dsw-alias-state-success-primary'],
      ['doing', '--dsw-alias-state-business-primary'],
      ['pending', '--dsw-alias-state-idle-primary'],
      ['failed', '--dsw-alias-state-warn-primary'],
      ['blocked', '--dsw-alias-state-warn-primary'],
      ['cancelled', '--dsw-alias-state-warn-primary'],
    ]
    for (const [state, token] of states) {
      const dot = ruleWith(`.gw-progress-pnode[data-state="${state}"] .gw-progress-pnode-dot`)
      expect(dot, `no dot rule for ${state}`).toBeDefined()
      expect(dot).toContain(token)
    }
    // A light is the same vocabulary: done is green, doing breathes, pending is hollow, and
    // the two ways of not getting through are the same amber the cards use.
    expect(ruleWith('.gw-progress-ring[data-state="done"]')).toContain('--dsw-alias-state-success-primary')
    expect(ruleWith('.gw-progress-ring[data-state="doing"]')).toContain('--dsw-alias-state-business-primary')
    expect(ruleWith('.gw-progress-ring[data-state="doing"]')).toContain('animation')
    expect(ruleWith('.gw-progress-ring[data-state="pending"]')).toContain('transparent')
    expect(ruleWith('.gw-progress-ring[data-state="failed"]')).toContain('--dsw-alias-state-warn-primary')
    expect(ruleWith('.gw-progress-check[data-state="done"]')).toContain('--dsw-alias-state-success-primary')
    expect(ruleWith('.gw-progress-check[data-state="pending"]')).toContain('transparent')
    // Unreached is the only dashed card, and the current one is the only one that breathes.
    expect(ruleWith('.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-body')).toContain('border-style: dashed')
    expect(ruleWith('.gw-progress-pnode[data-current="true"] .gw-progress-pnode-body')).toContain('box-shadow')
    expect(mediaBlock('prefers-reduced-motion: reduce')).toContain('animation: none')
  })

  it('wraps a word and drops to 34px rows under 720, and scrolls only the figure', () => {
    const narrow = mediaBlock('max-width: 720px')
    expect(narrow, 'the 720px breakpoint is gone').not.toBe('')
    const word = narrow.split('\n').find((line) => line.trim().startsWith('.gw-progress-pnode-word {'))
    expect(word, 'a phone must not cut a word').toBeDefined()
    expect(word).toContain('white-space: normal')
    expect(word).toContain('overflow-wrap: anywhere')
    const rows = narrow.split('\n').find((line) => line.trim().startsWith('.gw-progress-pnode[data-kind] .gw-progress-pnode-body {'))
    expect(rows, 'a phone must keep its rows 34px').toBeDefined()
    expect(rows).toContain('min-height: 34px')
    // The figure scrolls sideways because the run is left to right at every width;
    // the sheet under it is the one box that scrolls down (pixel-sweep: float retired).
    expect(ruleWith('.gw-progress-figure')).toContain('overflow-x: auto')
    expect(ruleWith('.gw-progress-sheet')).toContain('overflow-y: auto')
    const sideways = progress.css.split('\n').filter((line) => line.includes('overflow-x'))
    expect(sideways).toHaveLength(1)
    // Under 480 px the dock stacks and a call line drops its clock; the figure keeps its shape.
    const small = mediaBlock('max-width: 480px')
    expect(small, 'the 480px breakpoint is gone').not.toBe('')
    expect(small).toMatch(/\.gw-progress-dock \{[^}]*flex-direction: column/)
    expect(small).toMatch(/\.gw-progress-node-calls \.gw-progress-log-time \{[^}]*display: none/)
    expect(small).not.toMatch(/\.gw-progress-pnodes \{/)
    // The one scroll box that scrolls downwards is the sheet (pixel-sweep: float retired).
    expect(ruleWith('.gw-progress-sheet')).toContain('overflow-y: auto')
  })
})

describe('the figure is drawn from the mermaid text it carries', () => {
  it('renders the text it carries, and the text parses back to the same figure', () => {
    const page = pageOf(runningRun())
    const graph = hookOf(page, 'data-gw-progress-graph')
    expect(graph.type).toBe('div')
    const source = attr(graph, 'data-gw-progress-source')!
    expect(source.split('\n')[0]).toBe('flowchart LR')
    const parsed = progress.parsePanelMermaid(source)
    expect(parsed.direction).toBe('LR')
    // The picture and the text cannot disagree: one card and one wire per line, on both sides.
    expect(parsed.nodes).toHaveLength(nodesOf(page).length)
    expect(parsed.nodes).toHaveLength(10)
    expect(hooksOf(page, 'data-gw-progress-edge')).toHaveLength(parsed.edges.length)
    expect(hooksOf(page, 'data-gw-progress-edge')).toHaveLength(11)
    // The tree keeps the model's own ids, so a reader of the DOM never meets the one word the
    // text had to rename (`end` closes a subgraph, so the text writes `finish`).
    expect(nodeIdsOf(page)).toEqual(['start', 'plan', 't1', 't2', 't1_s2', 't1_s3', 't2_s4', 'sum', 'accept', 'end'])
    expect(parsed.nodes.map((node) => node.id)).toEqual(['start', 'plan', 't1', 't2', 't1_s2', 't1_s3', 't2_s4', 'sum', 'accept', 'finish'])
    expect(parsed.nodes.map((node) => node.shape)).toEqual(['stadium', 'stadium', 'round', 'round', 'rect', 'rect', 'rect', 'stadium', 'stadium', 'stadium'])
  })

  it('draws one column per level, left to right, with every card of a column on one edge', () => {
    const { graph, layout } = layoutFor(runningRun())
    expect(new Set(layout.nodes.map((box) => box.column)).size).toBe(7)
    // The text decides the columns, and they reproduce the model's own levels: a card of a
    // plan task is a column, its branches the next one, and the three places after them.
    for (const node of graph.nodes) {
      const box = layout.nodes.find((entry) => modelIdOf(entry.id) === node.id)!
      expect(box.column, node.id).toBe(node.level)
    }
    // Cards of one column share a left edge and a width, so a fork's bar is one straight line.
    const spans = columnSpans(layout)
    for (const span of spans) expect(span.right).toBeGreaterThan(span.left)
    for (const box of layout.nodes) {
      const span = spans[box.column]!
      expect(box.x).toBe(span.left)
      expect(box.x + box.w).toBe(span.right)
    }
    // Columns sit 48px apart and siblings 14px apart, which is the operator's own pitch.
    const gaps = columnGaps(layout)
    for (const gap of gaps) expect(gap.right - gap.left).toBe(48)
    for (const column of new Set(layout.nodes.map((box) => box.column))) {
      const stack = layout.nodes.filter((box) => box.column === column).sort((left, right) => left.y - right.y)
      for (let index = 1; index < stack.length; index += 1) {
        expect(stack[index]!.y - (stack[index - 1]!.y + stack[index - 1]!.h)).toBe(14)
      }
    }
    // Centred: a column of three branches and a column holding one capsule share one middle.
    const middles = new Set(spans.map((span) => {
      const stack = layout.nodes.filter((box) => box.x >= span.left && box.x + box.w <= span.right)
      const top = Math.min(...stack.map((box) => box.y))
      const bottom = Math.max(...stack.map((box) => box.y + box.h))
      return (top + bottom) / 2
    }))
    expect(middles.size).toBe(1)
  })

  it('writes the id, the kind, the drawn column, the state and the reader’s place on every card', () => {
    const page = pageOf(runningRun())
    const cards = nodesOf(page)
    expect(cards.map((node) => [
      attr(node, 'data-gw-progress-pnode'),
      attr(node, 'data-kind'),
      attr(node, 'data-level'),
      attr(node, 'data-state'),
      attr(node, 'data-current'),
    ])).toEqual([
      ['start', 'start', '0', 'done', 'false'],
      ['plan', 'plan', '1', 'done', 'false'],
      ['t1', 'task', '2', 'done', 'false'],
      ['t2', 'task', '2', 'doing', 'false'],
      ['t1_s2', 'sub', '3', 'failed', 'false'],
      ['t1_s3', 'sub', '3', 'done', 'false'],
      ['t2_s4', 'sub', '3', 'doing', 'true'],
      ['sum', 'summarize', '4', 'pending', 'false'],
      ['accept', 'accept', '5', 'pending', 'false'],
      ['end', 'end', '6', 'pending', 'false'],
    ])
    // Exactly one card is the reader's place, and it is the box holding the open call.
    expect(cards.filter((node) => attr(node, 'data-current') === 'true')).toHaveLength(1)
    // A card's own word is the step's name, the task's title verbatim, or the call's word.
    expect(hooksOf(page, 'data-gw-progress-pnode-word').map(textOf)).toEqual([
      '起点', '规划', '任务 1 · 建表', '任务 2 · 写文档', '执行', '执行 · 第 2 遍', '执行', '汇总', '验收', '终点',
    ])
    // The state is spoken, never printed.
    expect(cards.map((node) => attr(node, 'aria-label'))).toEqual([
      '起点 过了',
      '规划 过了',
      '任务 1 · 建表 过了',
      '任务 2 · 写文档 在做',
      '执行 没过',
      '执行 · 第 2 遍 过了',
      '执行 在做',
      '汇总 等着',
      '验收 等着',
      '终点 等着',
    ])
    for (const text of pageTexts(page)) expect(text).not.toContain(zh('progress.plan.done'))
    // Every card is placed by the layout; its height is left to the box the page measures.
    for (const node of cards) {
      expect(Object.keys(node.props['style'] as Record<string, string>).sort()).toEqual(['left', 'top', 'width'])
    }
    // A sub box says which task it hangs under and which call it is, so the DOM and the model
    // name the same call.
    expect(cards.filter((node) => attr(node, 'data-kind') === 'sub').map((node) => [attr(node, 'data-gw-progress-pnode'), attr(node, 'data-subtask'), attr(node, 'data-task')]))
      .toEqual([['t1_s2', '2', '1'], ['t1_s3', '3', '1'], ['t2_s4', '4', '2']])
  })

  it('carries the six rings on a task card and the five checks on 验收, and nowhere else', () => {
    const page = pageOf(runningRun())
    const rings = hooksOf(page, 'data-gw-progress-ring')
    const checks = hooksOf(page, 'data-gw-progress-check')
    // Two task cards, six lights each; the checks belong to the one place that accepts the run.
    expect(rings).toHaveLength(12)
    expect(checks).toHaveLength(5)
    const tasks = nodesOf(page).filter((node) => attr(node, 'data-kind') === 'task')
    for (const task of tasks) expect(hooksOf(task, 'data-gw-progress-ring')).toHaveLength(6)
    expect(hooksOf(nodesOf(page).find((node) => attr(node, 'data-kind') === 'accept')!, 'data-gw-progress-check')).toHaveLength(5)
    for (const node of nodesOf(page).filter((entry) => ['start', 'plan', 'sub', 'summarize', 'end'].includes(attr(entry, 'data-kind')!))) {
      expect(hooksOf(node, 'data-gw-progress-ring'), attr(node, 'data-gw-progress-pnode')).toHaveLength(0)
      expect(hooksOf(node, 'data-gw-progress-check'), attr(node, 'data-gw-progress-pnode')).toHaveLength(0)
    }
    // The six lights are the operator's own six, in their order, each with its own state and
    // its own word; the five are the contract's five.
    expect(rings.slice(0, 6).map((ring) => [attr(ring, 'data-gw-progress-ring'), attr(ring, 'data-state'), attr(ring, 'title')])).toEqual([
      ['plan', 'done', zh('progress.ring.plan')],
      ['execute', 'done', zh('progress.ring.execute')],
      ['check', 'pending', zh('progress.ring.check')],
      ['review', 'pending', zh('progress.ring.review')],
      ['accept', 'pending', zh('progress.ring.accept')],
      ['summarize', 'pending', zh('progress.ring.summarize')],
    ])
    expect(checks.map((check) => [attr(check, 'data-gw-progress-check'), attr(check, 'title')])).toEqual([
      ['machine', zh('progress.verify.machine')],
      ['model', zh('progress.verify.model')],
      ['isolated', zh('progress.verify.isolated')],
      ['human', zh('progress.verify.human')],
      ['ledger', zh('progress.verify.ledger')],
    ])
    // They are decoration with a tooltip, so the row is hidden from a screen reader and the
    // card's spoken label stays the short one.
    for (const row of hooksOf(page, 'data-gw-progress-pnode-lights')) expect(attr(row, 'aria-hidden')).toBe('true')
    // The row itself is named in the reader's words, so a reader can hear what the dots are.
    expect(hooksOf(page, 'data-gw-progress-pnode-lights').map((row) => attr(row, 'title')))
      .toEqual([zh('progress.panel.rings'), zh('progress.panel.rings'), zh('progress.panel.checks')])
    // A run that recorded no work still draws the rows: a dark light is a fact, not a gap.
    const waiting = pageOf(waitingRun())
    expect(hooksOf(waiting, 'data-gw-progress-ring')).toHaveLength(0)
    expect(hooksOf(waiting, 'data-gw-progress-check')).toHaveLength(5)
    for (const check of hooksOf(waiting, 'data-gw-progress-check')) expect(attr(check, 'data-state')).toBe('pending')
  })

  it('keeps a capsule’s word whole: the badge takes a row of its own, never the word’s line', () => {
    // The defect this guards: 汇总 and 第 3 稿 shared one 88 px pill, and the word lost — the
    // capsule drew `汇`. The badge is a second row now, so the word row holds the dot and the
    // word and nothing else, and no capsule is ever narrowed to buy a badge room.
    const done = pageOf(doneRun())
    const summary = nodesOf(done).find((node) => attr(node, 'data-gw-progress-pnode') === 'sum')!
    const rowOf = (card: Element) => walk(card).find((element) => classesOf(element).includes('gw-progress-pnode-main'))
    const detailOf = (card: Element) => walk(card).find((element) => classesOf(element).includes('gw-progress-pnode-detail'))
    expect(textOf(rowOf(summary))).toBe('汇总')
    expect(hooksOf(rowOf(summary), 'data-gw-progress-pnode-badge')).toHaveLength(0)
    expect(textOf(detailOf(summary))).toBe('第 1 稿')
    expect(hooksOf(detailOf(summary), 'data-gw-progress-pnode-badge')).toHaveLength(1)

    // Every capsule, in every screen: its word row is the dot and the word, so nothing can
    // ever compete with the word for that line.
    const capsules = ['start', 'plan', 'summarize', 'accept', 'end']
    for (const read of [waitingRun(), runningRun(), doneRun(), failedRun(), rejectedRun(), cancelledRun()]) {
      for (const card of nodesOf(pageOf(read)).filter((node) => capsules.includes(attr(node, 'data-kind')!))) {
        const row = rowOf(card)!
        const id = attr(card, 'data-gw-progress-pnode')
        expect(row.children.filter((child) => child !== null && child !== undefined), id).toHaveLength(2)
        expect(hooksOf(row, 'data-gw-progress-pnode-badge'), id).toHaveLength(0)
        expect(hooksOf(card, 'data-gw-progress-pnode-word')).toHaveLength(1)
      }
    }
    // The word the page prints is the whole word the model gave it, never a shortened copy —
    // a card that has to cut is a card the stylesheet would have to cut, and it never does.
    expect(hooksOf(done, 'data-gw-progress-pnode-word').map(textOf)).toContain('汇总')
    for (const word of hooksOf(done, 'data-gw-progress-pnode-word')) {
      expect(attr(word, 'title')).toBe(textOf(word))
    }
    // …and the layout gives that capsule a row to stand on without widening its column: the
    // picture keeps the width it had, the middle column keeps its 88 px.
    const { layout } = layoutFor(doneRun())
    const box = layout.nodes.find((entry) => modelIdOf(entry.id) === 'sum')!
    expect(box.w).toBe(88)
    expect(box.h).toBe(48)
    // The CSS that makes the row is the row's own, and a capsule body is a column of at most
    // three: the word, the badge, the lights.
    expect(ruleWith('.gw-progress-pnode-detail')).toContain('justify-content: center')
    expect(ruleWith('.gw-progress-pnode-body')).toContain('flex-direction: column')
  })

  it('prints the shipped draft on 汇总, and no other badge anywhere', () => {
    const done = pageOf(doneRun())
    expect(hooksOf(done, 'data-gw-progress-pnode-badge').map(textOf)).toEqual(['第 1 稿'])
    const summary = nodesOf(done).find((node) => attr(node, 'data-gw-progress-pnode') === 'sum')!
    expect(textOf(hooksOf(summary, 'data-gw-progress-pnode-badge')[0]!)).toBe('第 1 稿')
    // It rides on a row of its own, under the word, so 汇总 is never cut to make room for it.
    const detail = walk(summary).find((element) => classesOf(element).includes('gw-progress-pnode-detail'))!
    expect(textOf(detail)).toBe('第 1 稿')
    expect(attr(summary, 'aria-label')).toBe(`汇总 第 1 稿 ${zh('progress.plan.done')}`)
    // A run that shipped nothing prints no badge, and a retry is the branch's own label.
    expect(hooksOf(pageOf(runningRun()), 'data-gw-progress-pnode-badge')).toHaveLength(0)
  })

  it('lights the plan and the summary on every task card, and folds the work off its own rows', () => {
    const graph = progress.derivePanelGraph(runningRun(), zh)
    const cards = graph.nodes.filter((node) => node.rings !== undefined)
    expect(cards.map((node) => node.id)).toEqual(['t1', 't2'])
    // 任务 1 failed once and then passed: the work light is green, because the card's own
    // state is folded the same way the card's colour is.
    expect(cards[0]!.rings!.map((ring) => [ring.key, ring.state])).toEqual([
      ['plan', 'done'], ['execute', 'done'], ['check', 'pending'], ['review', 'pending'], ['accept', 'pending'], ['summarize', 'pending'],
    ])
    // 任务 2 is still being worked: its execute light is the breathing one.
    expect(cards[1]!.rings![1]).toEqual({ key: 'execute', state: 'doing' })
    // The five checks are one array on the graph and the same array on 验收.
    const accept = graph.nodes.find((node) => node.kind === 'accept')!
    expect(accept.checks).toBe(graph.checks)
    expect(graph.checks.map((check) => check.key)).toEqual(['machine', 'model', 'isolated', 'human', 'ledger'])
    // The machine screen is the check leg: a run that checked one task has that light on.
    const checked = progress.derivePanelGraph(doneRun(), zh)
    expect(checked.checks.map((check) => [check.key, check.state])).toEqual([
      ['machine', 'done'], ['model', 'pending'], ['isolated', 'pending'], ['human', 'pending'], ['ledger', 'pending'],
    ])
  })
})

describe('the geometry: the fork stays horizontal and no wire crosses a card', () => {
  it('places every card inside the figure, and the figure as wide as the flow needs', () => {
    for (const run of [waitingRun(), runningRun(), doneRun(), failedRun(), looseRun()]) {
      const { layout } = layoutFor(run)
      for (const box of layout.nodes) {
        expect(box.x, box.id).toBeGreaterThanOrEqual(0)
        expect(box.x + box.w, box.id).toBeLessThanOrEqual(layout.width)
        expect(box.y, box.id).toBeGreaterThanOrEqual(0)
        expect(box.y + box.h, box.id).toBeLessThanOrEqual(layout.height)
      }
      // A capsule, a task card and a sub box each keep the width band their shape allows.
      for (const box of layout.nodes) {
        const kind = layout.nodes.find((entry) => entry.id === box.id)!
        expect(kind.w).toBeGreaterThan(0)
      }
    }
    // The page draws exactly those boxes: the DOM and the layout are one figure.
    const page = pageOf(runningRun())
    const { layout } = layoutFor(runningRun())
    const graph = hookOf(page, 'data-gw-progress-graph')
    expect((graph.props['style'] as Record<string, string>)['width']).toBe(`${layout.width}px`)
    expect((graph.props['style'] as Record<string, string>)['height']).toBe(`${layout.height}px`)
    for (const box of layout.nodes) {
      const node = nodesOf(page).find((entry) => attr(entry, 'data-gw-progress-pnode') === modelIdOf(box.id))!
      expect(node.props['style']).toEqual({ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px` })
    }
    // …and the wires it draws are the wires the layout measured.
    expect(hooksOf(page, 'data-gw-progress-edge').map((edge) => [attr(edge, 'data-from'), attr(edge, 'data-to'), attr(edge, 'd')]))
      .toEqual(layout.edges.map((edge) => [modelIdOf(edge.from), modelIdOf(edge.to), edge.d]))
  })

  it('turns every wire in a column gap, never beside a card', () => {
    for (const run of [runningRun(), doneRun(), failedRun(), rejectedRun(), looseRun(), waitingRun()]) {
      const { layout } = layoutFor(run)
      const gaps = columnGaps(layout)
      for (const edge of layout.edges) {
        for (const [[x1, y1], [x2, y2]] of segmentsOf(edge.d)) {
          if (Math.abs(x1 - x2) < 0.01) {
            const inside = gaps.some((gap) => x1 > gap.left && x1 < gap.right)
            expect(inside, `${edge.from}->${edge.to} turns at x=${x1}, which is beside a card`).toBe(true)
            continue
          }
          // A run that changes x is a wire that changed column, and its two turns are the only
          // verticals it has: this one is the straight run between them.
          expect(Math.abs(y1 - y2), `${edge.from}->${edge.to}`).toBeLessThan(0.01)
        }
      }
    }
  })

  it('never draws a wire through a card', () => {
    for (const run of [runningRun(), doneRun(), failedRun(), rejectedRun(), looseRun(), waitingRun()]) {
      const { layout } = layoutFor(run)
      for (const edge of layout.edges) {
        for (const [[x1, y1], [x2, y2]] of segmentsOf(edge.d)) {
          const lo = Math.min(x1, x2)
          const hi = Math.max(x1, x2)
          const top = Math.min(y1, y2)
          const bottom = Math.max(y1, y2)
          for (const box of layout.nodes) {
            const overlapX = Math.min(hi, box.x + box.w) - Math.max(lo, box.x)
            const overlapY = Math.min(bottom, box.y + box.h) - Math.max(top, box.y)
            // A wire may land on a card's edge and may touch its corner; it may not enter it.
            const enters = overlapX > 0.6 && overlapY > 0.6
            expect(enters, `${edge.from}->${edge.to} runs through ${box.id}`).toBe(false)
          }
        }
      }
    }
  })

  it('reaches every card from the right edge of one and the left edge of the next', () => {
    const { layout } = layoutFor(runningRun())
    for (const edge of layout.edges) {
      const from = layout.nodes.find((box) => box.id === edge.from)!
      const to = layout.nodes.find((box) => box.id === edge.to)!
      const [start, end] = endsOf(edge.d)
      expect(start[0], `${edge.from}->${edge.to} leaves the right edge`).toBe(from.x + from.w)
      expect(start[1], `${edge.from}->${edge.to} leaves the middle`).toBe(from.y + from.h / 2)
      expect(end[0], `${edge.from}->${edge.to} lands on the left edge`).toBe(to.x)
      expect(end[1], `${edge.from}->${edge.to} lands on the middle`).toBe(to.y + to.h / 2)
    }
  })

  it('settles after one measured pass, so the figure never redraws itself', () => {
    // A host with layout measures each card and hands the boxes back. The second pass has to
    // be the same figure — the columns widen once, and a column is as wide as its own widest
    // card, so measuring again can only report what was just drawn.
    const first = layoutFor(runningRun())
    const measured: Record<string, { w: number, h: number }> = {}
    for (const box of first.layout.nodes) measured[box.id] = { w: box.w, h: box.h }
    const second = progress.layoutPanelGraph(first.parsed, measured, START_WIDTH, floorsOf(first.graph))
    expect(second.nodes).toEqual(first.layout.nodes)
    expect(second.edges.map((edge) => edge.d)).toEqual(first.layout.edges.map((edge) => edge.d))
    // …and a third pass is still that figure: no measurement can feed itself back in.
    const again: Record<string, { w: number, h: number }> = {}
    for (const box of second.nodes) again[box.id] = { w: box.w, h: box.h }
    expect(progress.layoutPanelGraph(first.parsed, again, START_WIDTH, floorsOf(first.graph))).toEqual(second)
    // A card that measured under its band is lifted to the band, not honoured: a task card is
    // never narrower than 160, however little its title asked for.
    const tiny: Record<string, { w: number, h: number }> = {}
    for (const box of first.layout.nodes) tiny[box.id] = { w: 40, h: 10 }
    const clamped = progress.layoutPanelGraph(first.parsed, tiny, START_WIDTH, floorsOf(first.graph))
    for (const box of clamped.nodes) {
      const kind = first.graph.nodes.find((node) => node.id === modelIdOf(box.id))!.kind
      const least = kind === 'task' ? 160 : kind === 'sub' ? 110 : 88
      expect(box.w, `${box.id} measured 40`).toBeGreaterThanOrEqual(least)
      expect(box.h, `${box.id} measured 10`).toBeGreaterThanOrEqual(30)
    }
  })

  it('stays horizontal on a phone, and only the figure scrolls', () => {
    const narrow = layoutFor(runningRun(), 390)
    // Same seven columns, same fork: a phone holds a picture, and the picture is left to right.
    expect(new Set(narrow.layout.nodes.map((box) => box.column)).size).toBe(7)
    expect(narrow.layout.width).toBeGreaterThan(390)
    // Every card is still inside the container the figure scrolls over.
    for (const box of narrow.layout.nodes) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.w).toBeLessThanOrEqual(narrow.layout.width)
    }
    // A wide page is given its own width back: the figure is never narrower than its column.
    expect(layoutFor(runningRun(), 1600).layout.width).toBe(1600)
  })
})

describe('a click opens the calls a card made', () => {
  it('opens one card into its own calls, and closes it again', () => {
    const view = mount(looseRun())
    const closed = view()
    expect(hooksOf(closed, 'data-gw-progress-node-calls')).toHaveLength(0)
    expect(hooksOf(closed, 'data-gw-progress-log-row')).toHaveLength(0)

    const body = bodyOf(closed, 'plan')
    expect(body.type).toBe('button')
    expect(attr(body, 'type')).toBe('button')
    expect(attr(body, 'aria-expanded')).toBe('false')
    expect(attr(body, 'aria-controls')).toBe('gw-progress-calls-plan')
    expect(hooksOf(body, 'data-gw-progress-pnode-open')).toHaveLength(1)

    const opened = clickNode(view, 'plan')
    const list = hookOf(opened, 'data-gw-progress-node-calls')
    expect(list.type).toBe('ol')
    expect(classesOf(list)).toEqual(['gw-progress-node-calls'])
    expect(attr(list, 'data-gw-progress-node-calls')).toBe('plan')
    expect(attr(list, 'id')).toBe('gw-progress-calls-plan')
    expect(attr(bodyOf(opened, 'plan'), 'aria-expanded')).toBe('true')
    const rows = hooksOf(list, 'data-gw-progress-log-row')
    expect(rows.map((row) => attr(row, 'data-gw-progress-log-row'))).toEqual(['1'])
    expect(rows.map(textOf)).toEqual([`${clockOf(1)} 规划助手 规划 做完`])
    // A second click on the same card closes it, and nothing else was ever open.
    const closedAgain = clickNode(view, 'plan')
    expect(hooksOf(closedAgain, 'data-gw-progress-node-calls')).toHaveLength(0)
    expect(attr(bodyOf(closedAgain, 'plan'), 'aria-expanded')).toBe('false')
  })

  it('raises nothing: the sheet draws every opened list in flow, so no sibling can cover one', () => {
    // Pixel-sweep: the floating box is retired — the sheet is in the page flow and can only
    // push the page down, never across a card. Pin the retired rules absent instead of
    // pinning their numbers.
    const view = mount(runningRun())
    const opened = clickNode(view, 't1')
    // No card and no figure carries a data-open mark any more: aria-expanded on the
    // button is the one open signal, and the sheet owns the space.
    expect(hooksOf(opened, 'data-gw-progress-pnode').filter((node) => attr(node, 'data-open') === 'true')).toHaveLength(0)
    expect(hooksOf(opened, 'data-gw-progress-figure').filter((node) => attr(node, 'data-open') === 'true')).toHaveLength(0)
    expect(attr(bodyOf(opened, 't1'), 'aria-expanded')).toBe('true')
    expect(progress.css).not.toContain('.gw-progress-node-calls { position: absolute')
    expect(progress.css).not.toContain('.gw-progress-pnode[data-open="true"] { z-index: 4')
    // The sheet is the one box that scrolls down; the figure keeps its sideways scroll.
    expect(ruleWith('.gw-progress-sheet')).toContain('overflow-y: auto')
    expect(ruleWith('.gw-progress-figure')).toContain('overflow-x: auto')
  })

  it('paints the opened list on a surface the theme really defines, never a dead token', () => {
    // Pixel-sweep: the floating box is retired — the sheet under the figure is the surface
    // every opened list is read on. The same token chain now lives on the sheet.
    const rule = ruleWith('.gw-progress-sheet') ?? ''
    const background = /background:\s*([^;]+);/.exec(rule)?.[1] ?? ''
    expect(background, 'the sheet must name a surface token').toContain('--dsw-alias-bg-elevated')
    expect(background).toContain('--dsw-alias-bg-l1')
    expect(progress.css).not.toContain('.gw-progress-node-calls { position: absolute')
  })

  it('opens a card’s calls card-wide, with the title on a line of its own', () => {
    // The defect this guards: a row of a card's list was one line — clock, gate, title,
    // verdict — inside a 110–240 px card, so the title column had no room to stand on and a
    // CJK title broke between every two characters. The row is two lines now, and the list is
    // the card's own width.
    const opened = clickNode(mount(runningRun()), 't1')
    const list = hookOf(opened, 'data-gw-progress-node-calls')
    const card = nodesOf(opened).find((node) => attr(node, 'data-gw-progress-pnode') === 't1')!
    expect(attr(list, 'id')).toBe('gw-progress-calls-t1')

    // The list is drawn in the sheet under the figure, so it is exactly as wide as the
    // panel column (pixel-sweep: float retired) — and the sheet's own rule keeps it static.
    const listRule = ruleWith('.gw-progress-sheet .gw-progress-node-calls')
    expect(listRule).toContain('position: static')
    expect(ruleWith('.gw-progress-pnode')).toContain('position: absolute')
    expect(ruleWith('.gw-progress-pnode-body')).toContain('width: 100%')
    // The row inside that list: the clock, the gate and the verdict share the first line, and
    // the title takes a whole line of its own. Every cell is `flex: none` and `nowrap`, so no
    // cell can be squeezed below its own text — a squeezed CJK cell breaks between every two
    // characters, which is exactly how this row used to read.
    const rowRule = ruleWith('.gw-progress-node-calls .gw-progress-log-row')
    expect(rowRule).toContain('display: flex')
    expect(rowRule).toContain('flex-wrap: wrap')
    expect(ruleWith('.gw-progress-node-calls .gw-progress-log-line')).toContain('display: contents')
    const nameRule = ruleWith('.gw-progress-node-calls .gw-progress-log-name')
    expect(nameRule).toContain('flex: 1 1 100%')
    expect(nameRule).toContain('order: 1')
    for (const cell of ['.gw-progress-log-time', '.gw-progress-log-word', '.gw-progress-log-role', '.gw-progress-call-chain']) {
      const rule = ruleWith(`.gw-progress-node-calls ${cell}`)
      expect(rule, cell).toContain('flex: none')
      expect(rule, cell).toContain('white-space: nowrap')
    }
    // A bare list — the one that is not a card's — keeps its three columns: the change is
    // scoped to the list a card opens.
    expect(ruleWith('.gw-progress-log-row')).toContain('grid-template-columns: 46px minmax(0, 1fr) auto')

    // The card a task's list hangs from is never the narrowest card in the figure, and the row
    // it draws still says the same four things in the recorded order.
    const { layout } = layoutFor(runningRun())
    const box = layout.nodes.find((entry) => modelIdOf(entry.id) === 't1')!
    expect(box.w).toBeGreaterThanOrEqual(160)
    const rows = hooksOf(list, 'data-gw-progress-log-row')
    expect(rows.map((row) => attr(row, 'data-gw-progress-log-row'))).toEqual(['2', '3'])
    expect(rows.map((row) => [
      textOf(hookOf(row, 'data-gw-progress-log-time')),
      textOf(hookOf(row, 'data-gw-progress-log-line')),
      textOf(hookOf(row, 'data-gw-progress-log-word')),
    ])).toEqual([
      [clockOf(2), '执行 任务 1 · 建表', '没过'],
      [clockOf(3), '执行 任务 1 · 建表', '做完'],
    ])
    expect(attr(card, 'data-kind')).toBe('task')
  })

  it('opens a branch into the one call it stands for', () => {
    const view = mount(runningRun())
    const page = clickNode(view, 't1_s2')
    hookOf(page, 'data-gw-progress-sheet')
    const rows = hooksOf(page, 'data-gw-progress-node-calls')
    expect(rows).toHaveLength(1)
    expect(attr(rows[0]!, 'data-gw-progress-node-calls')).toBe('t1_s2')
    expect(hooksOf(rows[0]!, 'data-gw-progress-log-row').map((row) => attr(row, 'data-gw-progress-log-row'))).toEqual(['2'])
    expect(hooksOf(rows[0]!, 'data-gw-progress-log-row').map(textOf)).toEqual([`${clockOf(2)} 执行 任务 1 · 建表 没过`])
    // The task card above the branch holds both of its calls: both branches read the
    // same sheet, and each group names the card it came from.
    const taskLists = hooksOf(clickNode(view, 't1'), 'data-gw-progress-node-calls')
    expect(taskLists.map((entry) => attr(entry, 'data-gw-progress-node-calls')).sort()).toEqual(['t1', 't1_s2'])
    expect(hooksOf(taskLists.find((entry) => attr(entry, 'data-gw-progress-node-calls') === 't1')!, 'data-gw-progress-log-row')
      .map((row) => attr(row, 'data-gw-progress-log-row'))).toEqual(['2', '3'])
  })

  it('keeps a card with nothing to open a mark, with no button and no tab stop', () => {
    const page = pageOf(runningRun())
    for (const id of ['start', 'sum', 'accept', 'end']) {
      expect(bodyOf(page, id).type, id).toBe('div')
      expect(hooksOf(bodyOf(page, id), 'data-gw-progress-pnode-open'), id).toHaveLength(0)
    }
    // A card with nothing to open is still the thing a reader points at to see its wires.
    const start = nodesOf(page).find((node) => attr(node, 'data-gw-progress-pnode') === 'start')!
    expect(start.props['onClick']).toBeTypeOf('function')
    // A card that does carry a button is the one that answers the click, so one click is one
    // action even where the two readings meet.
    const plan = nodesOf(page).find((node) => attr(node, 'data-gw-progress-pnode') === 'plan')!
    expect(plan.props['onClick']).toBeUndefined()
    expect(bodyOf(page, 'plan').props['onClick']).toBeTypeOf('function')
    for (const element of walk(page)) {
      if (element.type === 'button') continue
      expect(element.props['tabIndex'], 'an inert mark must not be tabbable').toBeUndefined()
    }
  })

  it('opens the all-rejected verdict inside the summary card that never declared a call', () => {
    const run = rejectedRun()
    const graph = progress.derivePanelGraph(run, zh)
    const summary = graph.nodes.find((node) => node.kind === 'summarize')!
    expect(summary.calls).toEqual([])
    expect(summary.rejected).toBeDefined()
    expect(summary.openable).toBe(true)

    const view = mount(run)
    const closed = view()
    expect(hooksOf(closed, 'data-gw-progress-node-rejected')).toHaveLength(0)
    const opened = clickNode(view, 'sum')
    const list = hookOf(opened, 'data-gw-progress-node-calls')
    expect(attr(list, 'data-gw-progress-node-calls')).toBe('sum')
    expect(hooksOf(list, 'data-gw-progress-log-row')).toHaveLength(0)
    expect(hooksOf(list, 'data-gw-progress-node-rejected').map((row) => attr(row, 'data-gw-progress-node-rejected')))
      .toEqual(['drafts', 'stage', 'reason'])
    expect(hooksOf(list, 'data-gw-progress-node-rejected').map(textOf))
      .toEqual(['第 2 稿全被退回', '卡在复核', `最后不过：${REJECTED_REASON}`])
  })

  it('marks the row the gate shipped, and only that row', () => {
    const view = mount(doneRun())
    const opened = clickNode(view, 'sum')
    const rows = hooksOf(opened, 'data-gw-progress-log-row')
    expect(rows.map((row) => attr(row, 'data-gw-progress-log-row'))).toEqual(['4'])
    expect(rows.map(textOf)).toEqual([`${clockOf(4)} 汇总·第1稿 汇总 交卷`])
    // The plan's own row in the same page says 做完: both groups are in the sheet, and
    // the mark is on the summary's row alone.
    const planLists = hooksOf(clickNode(view, 'plan'), 'data-gw-progress-node-calls')
    const planList = planLists.find((entry) => attr(entry, 'data-gw-progress-node-calls') === 'plan')!
    expect(hooksOf(planList, 'data-gw-progress-log-row').map(textOf)).toEqual([`${clockOf(1)} 规划助手 规划 做完`])
  })

  it('opens a card into the sheet under the figure, with no room kept inside the figure', () => {
    // Pixel-sweep: the figure keeps no 250px room for a float — the sheet owns the space.
    const view = mount(runningRun())
    const opened = clickNode(view, 'plan')
    expect(hooksOf(opened, 'data-gw-progress-sheet')).toHaveLength(1)
    expect(progress.css).not.toContain('padding-bottom: 250px')
    expect(clickNode(view, 'plan')).toBeDefined()
    expect(hooksOf(view(), 'data-gw-progress-sheet')).toHaveLength(0)
  })
})

describe('a click traces the wires that touch the card', () => {
  /** The `data-trace` of every wire of one page, keyed `from->to`. */
  function edgesOf(page: unknown): Array<[string, string | undefined]> {
    return hooksOf(page, 'data-gw-progress-edge')
      .map((edge) => [`${attr(edge, 'data-from')}->${attr(edge, 'data-to')}`, attr(edge, 'data-trace')] as [string, string | undefined])
  }

  /** The `data-trace` of every card of one page, keyed by id. */
  function cardsTrace(page: unknown): Array<[string, string | undefined]> {
    return nodesOf(page).map((node) => [attr(node, 'data-gw-progress-pnode')!, attr(node, 'data-trace')] as [string, string | undefined])
  }

  /** The wires of the running fixture, in the order the text carries them. */
  const WIRES = ['start->plan', 'plan->t1', 'plan->t2', 't1->t1_s2', 't1_s2->sum', 't1->t1_s3', 't1_s3->sum', 't2->t2_s4', 't2_s4->sum', 'sum->accept', 'accept->end']

  it('lights the wires that touch the card, dims the rest, and marks the card and its neighbours', () => {
    const view = mount(runningRun())
    // Untraced, every wire carries no mark at all: nobody asked for a reading.
    expect(edgesOf(view()).map(([, trace]) => trace)).toEqual(WIRES.map(() => undefined))

    const page = clickNode(view, 't1')
    // 任务 1 fans out to its two branches and the fork from the plan reaches it.
    expect(edgesOf(page)).toEqual(WIRES.map((wire) => [wire, wire === 'plan->t1' || wire === 't1->t1_s2' || wire === 't1->t1_s3' ? 'active' : 'dim']))
    expect(cardsTrace(page)).toEqual([
      ['start', undefined],
      ['plan', 'active'],
      ['t1', 'active'],
      ['t2', undefined],
      ['t1_s2', 'active'],
      ['t1_s3', 'active'],
      ['t2_s4', undefined],
      ['sum', undefined],
      ['accept', undefined],
      ['end', undefined],
    ])
  })

  it('turns the trace over on a second click of the same card, and hands the reading on', () => {
    const view = mount(runningRun())
    clickNode(view, 't1')
    expect(edgesOf(view()).filter(([, trace]) => trace === 'active')).toHaveLength(3)
    const cleared = clickNode(view, 't1')
    expect(edgesOf(cleared).map(([, trace]) => trace)).toEqual(WIRES.map(() => undefined))
    expect(cardsTrace(cleared).map(([, trace]) => trace)).toEqual(cardsTrace(cleared).map(() => undefined))
    // Another card: the reading moves to that card's own wires, not both at once. 任务 2 is
    // where the fork reaches it and from where its one branch leaves.
    clickNode(view, 't1')
    const moved = clickNode(view, 't2')
    expect(edgesOf(moved).filter(([, trace]) => trace === 'active')).toEqual([['plan->t2', 'active'], ['t2->t2_s4', 'active']].map((entry) => entry))
    expect(edgesOf(moved).find(([wire]) => wire === 'plan->t1')![1]).toBe('dim')
  })

  it('clears on a click on the empty figure, and not on one that bubbled up from a card', () => {
    const view = mount(runningRun())
    clickNode(view, 'plan')
    const page = view()
    const graph = hookOf(page, 'data-gw-progress-graph')
    const onClick = graph.props['onClick'] as (event?: unknown) => void
    expect(onClick, 'the figure is the page’s never-mind target').toBeTypeOf('function')

    // A click on a card reaches the container too. It is the card's own click, so it must not
    // clear what that same click just set.
    onClick({ target: { id: 'a card' }, currentTarget: graph })
    // The plan is where the fork starts: one wire in, two out.
    expect(edgesOf(view()).filter(([, trace]) => trace === 'active')).toHaveLength(3)
    // A click on the figure itself clears it.
    onClick({ target: graph, currentTarget: graph })
    expect(edgesOf(view()).map(([, trace]) => trace)).toEqual(WIRES.map(() => undefined))
    // …and the calls a reader opened are their own reading: clearing the trace keeps them.
    expect(hooksOf(view(), 'data-gw-progress-node-calls')).toHaveLength(1)
  })

  it('puts the trace’s one word on a card that has a wire, and nowhere else', () => {
    const page = pageOf(runningRun())
    expect(zh('progress.panel.trace')).toBe('看线')
    expect(attr(bodyOf(page, 'plan'), 'title')).toBe('看线')
    expect(attr(bodyOf(page, 't1'), 'title')).toBe('看线')
    // A card with no control has no tooltip to promise a reading with.
    expect(attr(bodyOf(page, 'start'), 'title')).toBeUndefined()
    expect(attr(bodyOf(page, 'end'), 'title')).toBeUndefined()
    // The word is the affordance's, not the card's: it never joins the label a screen reader
    // speaks, or the word the figure prints.
    for (const node of nodesOf(page)) expect(attr(node, 'aria-label')).not.toContain('看线')
    for (const text of pageTexts(page)) expect(text).not.toContain('看线')
    expect(en('progress.panel.trace')).toBe('Trace its wires')
  })
})

describe('the stuck line: one sentence, and only while something is stuck', () => {
  it('names the step the run is held at, in the shape of what went wrong', () => {
    expect(hooksOf(pageOf(runningRun()), 'data-gw-progress-stuck')).toHaveLength(0)
    expect(hooksOf(pageOf(doneRun()), 'data-gw-progress-stuck')).toHaveLength(0)
    // A cancelled run is not stuck: the chip already said cancelled.
    expect(hooksOf(pageOf(cancelledRun()), 'data-gw-progress-stuck')).toHaveLength(0)
    // An unrecovered failure, a step that never reported back, a gate that turned every draft
    // away: three verdicts, one line each.
    expect(textOf(hookOf(pageOf(failedRun()), 'data-gw-progress-stuck'))).toBe('卡在 3：执行 第 1 遍没过')
    expect(textOf(hookOf(pageOf(rejectedRun()), 'data-gw-progress-stuck'))).toBe('卡在 5：2 稿全被退回')
    const blocked = runOf('没有回报', [
      member(1, '规划助手', '规划', 'completed'),
      member(2, '执行', '任务 1 · 建表'),
    ], { stopReason: 'error' })
    expect(textOf(hookOf(pageOf(blocked), 'data-gw-progress-stuck'))).toBe('卡在 4：这一步没有回报')
    // The line is a status, a sibling after the figure; the Guardian's tiles are folded
    // into the header's details, so they stand before it, not after.
    const page = pageOf({ ...failedRun(), guardian: GUARDIAN })
    const order = walk(page)
    expect(order.indexOf(hookOf(page, 'data-gw-progress-stuck'))).toBeGreaterThan(order.indexOf(hookOf(page, 'data-gw-progress-graph')))
    expect(order.indexOf(hookOf(page, 'data-gw-progress-stuck'))).toBeGreaterThan(order.indexOf(hookOf(page, 'data-gw-progress-guardian')))
  })
})

describe('the dock: one button for a run nobody started, and nothing for a finished one', () => {
  /** A session-scope context, compared by identity: the facade must get *this* one. */
  const SCOPE_CTX = { scope: 'session-scope' }

  /** A conversation face that records every verb a click could reach. */
  function recorder() {
    const calls: string[] = []
    return {
      calls,
      services: {
        uiConversation: {
          events: { register: () => () => {} },
          views: { register: () => () => {} },
          binding: () => ({ target: () => ({ getSnapshot: () => ({ runs: [], activeRun: undefined }), subscribe: () => () => {} }) }),
        },
        sessions: {
          binding: (sessionId: string) => ({ sessionId, ctx: SCOPE_CTX }),
          subagentAddress: (childId: string) => (childId === 'child-2' ? { parentSessionId: 'session-1', mode: 'continuable' } : undefined),
        },
        conversation: {
          input: {
            for: (actx: unknown) => {
              calls.push(`for:${actx === SCOPE_CTX ? 'scope-ctx' : 'other-ctx'}`)
              return { setDraft: (text: string) => { calls.push(`setDraft:${text}`) } }
            },
          },
          send: () => { calls.push('send'); return Promise.resolve() },
          cancel: () => { calls.push('cancel'); return Promise.resolve() },
        },
      },
    }
  }

  /** The props the slot injects for one session, taken from the tab's own registration. */
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
    progress.mount(ctx, services, { locale: undefined, t: zh }, { set: () => {} }, () => undefined)
    const view = registered.find((definition) => definition['name'] === 'conversation.view')
    expect(view, 'the tab must register a conversation view').toBeDefined()
    return (view!['inject'] as (sessionId: string) => Record<string, unknown>)('session-1')
  }

  /** Render the tab for one run with the shell's own props. */
  function pageWith(extra: Record<string, unknown>, run: ProgressRun): () => unknown {
    const cells: unknown[] = []
    const props = {
      t: zh,
      progressT: zh,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
      ...extra,
    }
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

  it('offers the button a waiting run asks for, and none once the run has started or ended', () => {
    expect(textOf(hookOf(pageOf(waitingRun(), { fillDraft: () => true }), 'data-gw-progress-dock-fill'))).toBe('开工')
    // The acceptance click is gone: a finished run is finished whether or not anyone confirms
    // it, so its foot has no button at all — and the retired word is not in the bundle either.
    expect(hooksOf(pageOf(doneRun(), { fillDraft: () => true }), 'data-gw-progress-dock-fill')).toHaveLength(0)
    expect(SOURCE).not.toContain('progress.dock.accept')
    expect(pageTexts(pageOf(doneRun(), { fillDraft: () => true }))).not.toContain('收下这版')
    expect(hooksOf(pageOf(failedRun(), { fillDraft: () => true }), 'data-gw-progress-dock-fill')).toHaveLength(0)
    expect(hooksOf(pageOf(cancelledRun(), { fillDraft: () => true }), 'data-gw-progress-dock-fill')).toHaveLength(0)
    // A run that is still working asks for no click, and a shell that cannot write the box
    // offers no button rather than one that would do nothing.
    expect(hooksOf(pageOf(runningRun(), { fillDraft: () => true }), 'data-gw-progress-dock-fill')).toHaveLength(0)
    expect(hooksOf(pageOf(waitingRun()), 'data-gw-progress-dock-fill')).toHaveLength(0)
    // The dock itself stays, empty: it is the footer of the page, not a conditional zone.
    expect(texts(hookOf(pageOf(runningRun()), 'data-gw-progress-dock'))).toEqual([])
  })

  it('fills the box on a click, and reaches no other verb on any click on the page', () => {
    const record = recorder()
    const view = pageWith(injectedProps(record.services), runningRun())
    // Every control the page has, in one pass: each card that opens, then the figure's own
    // background — a working run has no dock button, so its cards are the test.
    let page = view()
    for (;;) {
      const body = walk(page).find((element) => element.type === 'button' && element.props['data-gw-progress-pnode-open'] !== undefined && element.props['aria-expanded'] !== true)
      if (body === undefined) break
      ;(body.props['onClick'] as () => void)()
      page = view()
    }
    const graph = hookOf(page, 'data-gw-progress-graph')
    ;(graph.props['onClick'] as (event?: unknown) => void)({ target: graph, currentTarget: graph })
    page = view()
    expect(hooksOf(page, 'data-gw-progress-node-calls').length).toBeGreaterThan(0)
    // Opening calls and tracing wires is a reading, not a write: no service was reached.
    expect(record.calls).toEqual([])

    // The dock's one button, on the run that asks for it: one scoped write, and no send.
    const dockView = pageWith(injectedProps(record.services), waitingRun())
    const button = hookOf(dockView(), 'data-gw-progress-dock-fill')
    ;(button.props['onClick'] as () => void)()
    expect(record.calls).toEqual(['for:scope-ctx', `setDraft:${zh('progress.dock.fill')}`])
    expect(record.calls.filter((call) => call === 'send')).toHaveLength(0)
    // The success line says what happened, and it is a live region, not a silent swap.
    const filled = hookOf(dockView(), 'data-gw-progress-filled')
    expect(textOf(filled)).toBe('已填进输入框，按发送')
    expect(attr(filled, 'role')).toBe('status')
    expect(attr(filled, 'aria-live')).toBe('polite')
  })
})

describe('the page stays honest', () => {
  it('prints no percentage, no pass rate, and no estimate beyond the one it measured', () => {
    const copies = [
      pageOf(waitingRun()),
      pageOf(runningRun()),
      pageOf(doneRun()),
      pageOf(failedRun()),
      pageOf(rejectedRun()),
      pageOf(cancelledRun()),
      pageOf(guardedRun()),
    ].map((page) => pageTexts(page).join('\n'))
    for (const copy of copies) {
      expect(copy).not.toContain('%')
      expect(copy).not.toMatch(/通过率|预计|大约|pass rate/iu)
    }
    // The one estimate the page prints is the measured remainder, and the sentence above the
    // figure is the only place it appears.
    expect(pageTexts(pageOf(runningRun())).join('\n')).toMatch(/还剩约/)
  })

  it('adds no sentence explaining the page, in the tree or in a spoken attribute', () => {
    const page = pageOf(guardedRun())
    const spoken = walk(page).flatMap((element) => ['title', 'aria-label']
      .map((name) => element.props[name])
      .filter((value): value is string => typeof value === 'string' && value.trim() !== ''))
    for (const text of spoken) {
      // A tooltip may name a step or repeat a word; it may never be a sentence about the page.
      expect(text.length, text).toBeLessThan(60)
      expect(text).not.toMatch(/[。；！？]/u)
    }
  })

  it('renders the empty page when the session has no run, and no figure at all', () => {
    const page = pageOf(undefined)
    expect(hooksOf(page, 'data-progress-empty')).toHaveLength(1)
    expect(pageTexts(page)).toEqual([bundle.GROK_WORKFLOW_DICT['zh']!['progress.empty.title']!])
    expect(hooksOf(page, 'data-gw-progress-figure')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-graph')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-dock')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-chip')).toHaveLength(0)
    // The stylesheet is part of the tab's own tree, so it leaves when the tab unmounts.
    expect(hooksOf(page, 'data-gw-progress-css')).toHaveLength(1)
  })
})

/**
 * One sheet at every width: the opened calls leave the figure.
 *
 * A list that floats out from under a card lands on the card beside it — the same overlap
 * the soaks photographed at both widths. Making the list `position: static` would not
 * help: the cards are placed by the layout and no sibling moves for another one's popup.
 * So the list is drawn **outside** the figure, in the panel's
 * own column under it, where it can only push the page down.
 *
 * Where the list is drawn used to be a render decision the page read from the width in
 * JS (`matchMedia` was the whole seam, and a test got a phone by standing in for it).
 * There is nothing left to pick by width now — one box at every width — so the page no
 * longer reads any media query and the width helpers below only fix the stub shell's
 * answer. No layout engine is involved anywhere below.
 */

/** The listener face a real `MediaQueryList` has, as far as the page uses it. */
type MediaFace = { media: string, matches: boolean, addEventListener: () => void, removeEventListener: () => void }

/**
 * Render with a stand-in `matchMedia` that answers one width, and report what it was asked.
 *
 * The stub answers the query it is handed, so the exact string the page builds is readable
 * afterwards — which is how the JS breakpoint is compared with the stylesheet's one.
 */
function withNarrow<T>(matches: boolean, render: () => T, queries: string[] = []): T {
  const record = globalThis as unknown as { matchMedia?: (query: string) => MediaFace }
  const previous = record.matchMedia
  record.matchMedia = (query: string): MediaFace => {
    queries.push(query)
    return { media: query, matches, addEventListener: () => undefined, removeEventListener: () => undefined }
  }
  try {
    return render()
  } finally {
    if (previous === undefined) delete record.matchMedia
    else record.matchMedia = previous
  }
}

/** A phone's page: every render in this sequence reads the narrow width. */
function onPhone<T>(render: () => T): T {
  return withNarrow(true, render)
}

/** The list one node opened, wherever it was drawn. */
function callsOf(page: unknown): Element {
  return hookOf(page, 'data-gw-progress-node-calls')
}

/** Every node of one page the page has lit. */
function litNodes(page: unknown): Element[] {
  return nodesOf(page).filter((node) => attr(node, 'data-trace') === 'active')
}

describe('a narrow screen draws the opened calls under the figure', () => {
  it('moves the list out of the card on a phone and on a desktop, into one sheet', () => {
    // The sheet is the one box at both widths now: the floating list a node drew over its
    // own card landed on the neighbour at desktop width (one open list over 2 cards,
    // four over 9), so wide reuses the narrow sheet instead of keeping a second box.
    // 任务 1 made two calls (seq 2 failed, seq 3 passed), so its card aggregates two rows.
    const wide = withNarrow(false, () => clickNode(mount(runningRun()), 't1'))
    expect(hooksOf(wide, 'data-gw-progress-sheet')).toHaveLength(1)
    const wideNode = nodesOf(wide).find((node) => attr(node, 'data-gw-progress-pnode') === 't1')!
    expect(hooksOf(wideNode, 'data-gw-progress-node-calls')).toHaveLength(0)
    const wideRows = hooksOf(hookOf(wide, 'data-gw-progress-node-calls'), 'data-gw-progress-log-row').map(textOf)

    // The phone reading: the same node, the same click, and the list is not in the card.
    const phone = onPhone(() => clickNode(mount(runningRun()), 't1'))
    const sheet = hookOf(phone, 'data-gw-progress-sheet')
    expect(classesOf(sheet)).toEqual(['gw-progress-sheet'])
    // A node draws no list anywhere now: both widths carry the opened rows in the sheet.
    const list = callsOf(phone)
    expect(hooksOf(hookOf(phone, 'data-gw-progress-graph'), 'data-gw-progress-sheet')).toHaveLength(0)
    for (const node of nodesOf(phone)) expect(hooksOf(node, 'data-gw-progress-node-calls')).toHaveLength(0)
    // Same list, same id, same rows — only the box that carries them changed.
    expect(hooksOf(sheet, 'data-gw-progress-node-calls')).toEqual([list])
    expect(attr(list, 'id')).toBe('gw-progress-calls-t1')
    expect(attr(list, 'data-gw-progress-node-calls')).toBe('t1')
    expect(hooksOf(list, 'data-gw-progress-log-row').map(textOf)).toEqual(wideRows)
    expect(wideRows).toHaveLength(2)
    // And the card it came from says what it opened, in the same two attributes.
    const body = bodyOf(phone, 't1')
    expect(body.type).toBe('button')
    expect(attr(body, 'aria-expanded')).toBe('true')
    expect(attr(body, 'aria-controls')).toBe(attr(list, 'id'))
  })

  it('stands the sheet after the figure and before the dock, so it cannot be in the way', () => {
    const page = onPhone(() => clickNode(mount(runningRun()), 'plan'))
    const order = walk(page)
    const at = (element: Element) => order.indexOf(element)
    // Nothing the sheet draws is inside the figure, and nothing in the figure is inside it.
    expect(hooksOf(hookOf(page, 'data-gw-progress-graph'), 'data-gw-progress-sheet')).toHaveLength(0)
    expect(hooksOf(hookOf(page, 'data-gw-progress-sheet'), 'data-gw-progress-pnode')).toHaveLength(0)
    // It follows the figure and it precedes the dock: the button a reader hands the draft to
    // is never underneath the list, and no card ever moves for it — the sheet is in the page's
    // own flow, so the dock is pushed down rather than covered.
    expect(at(hookOf(page, 'data-gw-progress-sheet'))).toBeGreaterThan(at(hookOf(page, 'data-gw-progress-graph')))
    expect(at(hookOf(page, 'data-gw-progress-dock'))).toBeGreaterThan(at(hookOf(page, 'data-gw-progress-sheet')))
    // Only the flow decides, so the list carries no absolute position of its own in there.
    expect(ruleWith('.gw-progress-sheet .gw-progress-node-calls')).toContain('position: static')
  })

  it('reads no media query in JS: the sheet is the one box at every width', () => {
    const queries: string[] = []
    withNarrow(true, () => pageOf(runningRun()), queries)
    withNarrow(false, () => pageOf(runningRun()), queries)
    // WHY no query: there is nothing left to pick by width — one sheet everywhere — so
    // the page must not ask the shell about the width at all.
    expect(queries).toEqual([])
    const narrow = ruleWith('.gw-progress-sheet')!
    expect(narrow).toContain('max-height: min(50vh, 240px)')
    expect(narrow).toContain('overflow-y: auto')
    // …and the only scroll box on the page still scrolls one way.
    // The figure itself scrolls sideways on a phone by design (the fork is wider than the
    // column it stands in); the sheet — the list's own box — scrolls down only.
    expect(ruleWith('.gw-progress-sheet')).not.toContain('overflow-x')
  })

  it('caps the sheet and gives it the page’s one scroll, so a phone never scrolls sideways', () => {
    const sheet = ruleWith('.gw-progress-sheet')!
    expect(sheet).toContain('max-height')
    expect(sheet).toContain('overflow-y: auto')
    expect(sheet).toContain('min-width: 0')
    // Inside the sheet the list is a column of rows in the page's flow: the sheet owns the
    // border, the fill and the scroll, so the list may not open a second one.
    const list = ruleWith('.gw-progress-sheet .gw-progress-node-calls')!
    expect(list).toContain('position: static')
    expect(list).toContain('max-height: none')
    expect(list).toContain('overflow-y: visible')
    // Every word that can be long wraps instead of pushing the box wider.
    expect(ruleWith('.gw-progress-sheet-node')).toContain('overflow-wrap: anywhere')
    // A floating list inside a card has no room for a clock column on a phone, so it drops
    // one. The sheet has the panel's whole width, so the row keeps the clock it has
    // everywhere else — the sheet holds the same line, not a cut-down one.
    const small = mediaBlock('max-width: 480px')
    expect(small).toMatch(/\.gw-progress-sheet \.gw-progress-log-row \{[^}]*grid-template-columns: 40px minmax\(0, 1fr\) auto auto/)
    expect(small).toMatch(/\.gw-progress-sheet \.gw-progress-log-time \{[^}]*display: inline/)
    const styled = styledClasses()
    for (const name of [
      'gw-progress-sheet',
      'gw-progress-sheet-head',
      'gw-progress-sheet-title',
      'gw-progress-sheet-hide',
      'gw-progress-sheet-group',
      'gw-progress-sheet-node',
      'gw-progress-sheet-room',
    ]) expect(styled, name).toContain(name)
  })

  it('keeps the node’s one click: open, close, and open again — and the sheet follows it', () => {
    // The unnumbered plan task shares one card (`u1`); its first branch carries the seq-2 call.
    const view = mount(looseRun())
    const closed = onPhone(() => view())
    expect(hooksOf(closed, 'data-gw-progress-sheet')).toHaveLength(0)
    expect(attr(bodyOf(closed, 'u1_s2'), 'aria-expanded')).toBe('false')

    const opened = onPhone(() => clickNode(view, 'u1_s2'))
    expect(hooksOf(opened, 'data-gw-progress-sheet')).toHaveLength(1)
    expect(attr(bodyOf(opened, 'u1_s2'), 'aria-expanded')).toBe('true')
    // The wire reading is the same click's second half, on either width.
    expect(litNodes(opened)).toHaveLength(3)

    const closedAgain = onPhone(() => clickNode(view, 'u1_s2'))
    expect(hooksOf(closedAgain, 'data-gw-progress-sheet')).toHaveLength(0)
    expect(attr(bodyOf(closedAgain, 'u1_s2'), 'aria-expanded')).toBe('false')
    expect(litNodes(closedAgain)).toHaveLength(0)

    const third = onPhone(() => clickNode(view, 'u1_s2'))
    expect(hooksOf(third, 'data-gw-progress-sheet')).toHaveLength(1)
    expect(litNodes(third)).toHaveLength(3)
  })

  it('puts the sheet away from the sheet’s own control, on the same channel', () => {
    const view = mount(looseRun())
    const opened = onPhone(() => clickNode(view, 'u1_s2'))
    expect(litNodes(opened)).toHaveLength(3)
    const hide = hookOf(opened, 'data-gw-progress-sheet-hide')
    expect(hide.type).toBe('button')
    expect(attr(hide, 'type')).toBe('button')
    expect(textOf(hide)).toBe(zh('progress.panel.collapse'))
    expect(textOf(hookOf(opened, 'data-gw-progress-sheet'))).toContain(zh('progress.panel.calls'))
    ;(hide.props['onClick'] as () => void)()
    const closed = onPhone(() => view())
    // The same two things a second tap on the node does: the list closes, the wires go dark.
    expect(hooksOf(closed, 'data-gw-progress-sheet')).toHaveLength(0)
    expect(hooksOf(closed, 'data-gw-progress-node-calls')).toHaveLength(0)
    expect(litNodes(closed)).toHaveLength(0)
    expect(attr(bodyOf(closed, 'u1_s2'), 'aria-expanded')).toBe('false')
  })

  it('carries the verdict lines too, and asks nothing of a node with nothing to show', () => {
    const view = mount(rejectedRun())
    const opened = onPhone(() => clickNode(view, 'sum'))
    const list = callsOf(opened)
    expect(hooksOf(hookOf(opened, 'data-gw-progress-sheet'), 'data-gw-progress-node-calls')).toEqual([list])
    expect(attr(list, 'data-gw-progress-node-calls')).toBe('sum')
    expect(hooksOf(list, 'data-gw-progress-log-row')).toHaveLength(0)
    expect(hooksOf(list, 'data-gw-progress-node-rejected').map((row) => attr(row, 'data-gw-progress-node-rejected')))
      .toEqual(['drafts', 'stage', 'reason'])
    expect(hooksOf(list, 'data-gw-progress-node-rejected').map(textOf))
      .toEqual(['第 2 稿全被退回', '卡在复核', `最后不过：${REJECTED_REASON}`])

    // A node that declares nothing has no list to move: tapping one asks for lines that do
    // not exist, and no empty sheet stands over the figure.
    const ends = mount(runningRun())
    const tapped = onPhone(() => {
      const page = ends()
      const start = nodesOf(page).find((node) => attr(node, 'data-gw-progress-pnode') === 'start')!
      ;(start.props['onClick'] as () => void)()
      return ends()
    })
    expect(hooksOf(tapped, 'data-gw-progress-sheet')).toHaveLength(0)
  })

  it('reserves the room the sheet is scrolled into, and only while a list is open', () => {
    // Measured on a real 390 px host: the panel is barely taller than the screen, so the
    // scroll runs out with the open list still at the bottom of the column — which is where
    // the shell pins its composer. The room is what makes centring possible at all; it sits
    // after the footer, so no button moves to make it, and it is empty and silent.
    const roomOf = (page: unknown) => walk(page).filter((element) => classesOf(element).includes('gw-progress-sheet-room'))
    expect(roomOf(onPhone(() => pageOf(runningRun())))).toHaveLength(0)
    const opened = onPhone(() => clickNode(mount(runningRun()), 'plan'))
    const room = roomOf(opened)
    expect(room).toHaveLength(1)
    expect(attr(room[0]!, 'aria-hidden')).toBe('true')
    expect(texts(room[0]!)).toEqual([])
    // It is the last thing on the page, after the dock it must not push.
    const order = walk(opened)
    expect(order.indexOf(room[0]!)).toBeGreaterThan(order.indexOf(hookOf(opened, 'data-gw-progress-dock')))
    expect(ruleWith('.gw-progress-sheet-room')).toContain('height: 35vh')
    // A wide page draws the same sheet and reserves the same room.
    expect(roomOf(withNarrow(false, () => clickNode(mount(runningRun()), 'plan')))).toHaveLength(1)
    // Closed again: the room goes with the sheet.
    const view2 = mount(runningRun())
    clickNode(view2, 'plan')
    expect(roomOf(onPhone(() => clickNode(view2, 'plan')))).toHaveLength(0)
  })

  it('brings the sheet to the middle of the view, not against the bottom of the column', () => {
    // Measured on a real 390 px host: `block: 'nearest'` rested the sheet's last pixel on the
    // screen's bottom edge (739 → 844), which is exactly where the shell pins its composer —
    // the list opened and the reader saw nothing. Centring is the whole fix, so it is pinned
    // here: the parameter is the behaviour.
    const asked: unknown[] = []
    const box = { scrollIntoView: (options: unknown) => { asked.push(options) } }
    progress.revealSheet(box)
    expect(asked).toEqual([{ block: 'center' }])
    // Nothing to bring into view is not an error: no sheet yet, a desktop, a host without a
    // layout engine.
    progress.revealSheet(undefined)
    progress.revealSheet(null)
    progress.revealSheet({})
    expect(asked).toHaveLength(1)
  })

  it('words the sheet in both languages, and reads it at both widths', () => {
    expect(zh('progress.panel.calls')).toBe('调用')
    expect(en('progress.panel.calls')).toBe('Calls')
    expect(zh('progress.panel.collapse')).toBe('收起')
    expect(en('progress.panel.collapse')).toBe('Hide')
    // Both widths draw the same sheet now, so both read the same two words.
    expect(pageTexts(pageOf(runningRun(), { fillDraft: () => true }))).not.toContain(zh('progress.panel.calls'))
    const phone = onPhone(() => clickNode(mount(runningRun()), 'plan'))
    const copy = pageTexts(phone)
    expect(copy).toContain(zh('progress.panel.calls'))
    expect(copy).toContain(zh('progress.panel.collapse'))
  })
})

describe('the trace legend: five standing words, in both languages', () => {
  it('says what a lit wire means', () => {
    expect(zh('progress.panel.legend.traced')).toBe('亮线：走过的线')
    expect(en('progress.panel.legend.traced')).toBe('Lit wire: visited')
  })

  it('says what a dimmed wire means', () => {
    expect(zh('progress.panel.legend.untraced')).toBe('暗线：没走的线')
    expect(en('progress.panel.legend.untraced')).toBe('Dimmed wire: unvisited')
  })

  it('says the six dots are the six stages', () => {
    expect(zh('progress.panel.legend.rings')).toBe('六点：六环，走完六个阶段')
    expect(en('progress.panel.legend.rings')).toBe('Six dots: six stages')
  })

  it('says the five dots are the five checks', () => {
    expect(zh('progress.panel.legend.checks')).toBe('五点：五验，通过五道验收')
    expect(en('progress.panel.legend.checks')).toBe('Five dots: five checks')
  })

  it('says a dimmed dot only means not run yet, never failed', () => {
    expect(zh('progress.panel.legend.pending')).toBe('暗点是还没跑到，不是没过')
    expect(en('progress.panel.legend.pending')).toBe('Dim means not run yet, not failed')
  })

  it('gives the dimmed legend dot a fallback, so a dead idle token still draws a ring', () => {
    const rule = ruleWith('.gw-progress-legend-dot[data-state="pending"]') ?? ''
    expect(rule).toContain('--dsw-alias-state-idle-primary')
    expect(rule).toContain('--dsw-alias-label-primary')
    expect(rule).toContain('Canvas')
  })

  it('prints the legend once a node is opened, and only then', () => {
    const closed = pageOf(runningRun())
    expect(hooksOf(closed, 'data-gw-progress-legend')).toHaveLength(0)
    for (const text of pageTexts(closed)) {
      expect(text).not.toContain('走过的线')
      expect(text).not.toContain('没走的线')
    }
    const opened = clickNode(mount(runningRun()), 't1')
    const legend = hookOf(opened, 'data-gw-progress-legend')
    const copy = textOf(legend)
    expect(copy).toContain('亮线：走过的线')
    expect(copy).toContain('暗线：没走的线')
    expect(copy).toContain('六点：六环，走完六个阶段')
    expect(copy).toContain('五点：五验，通过五道验收')
    expect(copy).toContain('暗点是还没跑到，不是没过')
  })
})
