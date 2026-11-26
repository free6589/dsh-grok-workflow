import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The task panel: one graph, one sentence above it, one line under it when the run is stuck.
 *
 * The page's shape is fixed by the operator's brief; this file pins the model behind it, the
 * text that model writes, the layout it produces and the page it renders. Four things are
 * settled here and nothing else:
 *
 * 1. **The model is a graph.** `derivePanelGraph` turns the existing flow derivation into
 *    steps and plan tasks with edges between them; a task hangs off the leg that walked it,
 *    and the ids say which visit and which task they are.
 * 2. **The text is the structure.** `panelMermaid` writes the graph out and
 *    `parsePanelMermaid` reads that subset back; the page lays out the parsed text, so the
 *    figure and the text cannot disagree.
 * 3. **The layout is computed, not measured.** Layers come from longest paths, siblings from
 *    the boxes they measured, and each edge from its two boxes. A stacked layer is a side
 *    rail: every wire runs in a 24 px gutter or in a gap between cards, never through one.
 * 4. **Nothing is invented.** The remaining time exists only when finished steps were
 *    measured, the stuck line only while the run really is stuck, and the page prints no
 *    number the events did not report.
 *
 * The bundle is loaded the way the host loads it — a stub `__ModuleLoader__` and a stub React
 * whose `useState` really stores — and `useEffect` never runs, which is also the statement
 * that a host without layout still renders: the page falls back to the default boxes.
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
}

type Translator = (key: string, params?: Record<string, unknown>) => string

interface PanelNode {
  id: string
  kind: string
  leg: string
  label: string
  state: string
  current: boolean
  ordinal: number
  taskNumber?: number
  attempts: Array<{ seq: number, state: string }>
  calls: ProgressMember[]
  openable: boolean
  rejected?: { drafts: number, stage: string, reason: string }
}

interface PanelEdge { from: string, to: string, kind: string }

interface PanelGraph {
  state: string
  mermaid: string
  nodes: PanelNode[]
  edges: PanelEdge[]
  headline: { at: number, total: number, eta?: { ms: number, basis: number } }
  stuck?: { nodeId: string, at: number, kind: string, role?: string, attempt?: number, drafts?: number }
  at: number
  total: number
  remaining: number
}

interface ParsedPanel {
  direction: string
  nodes: Array<{ id: string, label: string, shape: string }>
  edges: Array<{ from: string, to: string }>
}

interface PanelLayout {
  width: number
  height: number
  nodes: Array<{ id: string, x: number, y: number, w: number, h: number }>
  edges: Array<{ from: string, to: string, d: string }>
}

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    fold: (records: ReadonlyArray<Record<string, unknown>>) => ProgressRun[]
    derivePanelGraph: (run: ProgressRun, t?: Translator) => PanelGraph
    panelMermaid: (graph: PanelGraph) => string
    parsePanelMermaid: (text: string) => ParsedPanel
    layoutPanelGraph: (parsed: ParsedPanel, sizes: Record<string, { w: number, h: number }>, availableWidth: number) => PanelLayout
  }
}

/** The hook cells of the render in progress: React keeps them across a re-render. */
type Cells = { index: number, cells: unknown[] }

let rendering: Cells | undefined

/**
 * Load the bundle the way the host does, with a stub React whose `useState` really stores.
 *
 * The progress tab reads no host service: its run facts arrive through `useGrokProgress`, so
 * the stub only has to be shaped like the hooks the page touches. `useEffect` never runs
 * here, which is the same statement as "a host without layout measures nothing": the page
 * must render its default boxes rather than wait for a measurement that will never come.
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

/** Every element carrying one class token, in document order. */
function withClass(tree: unknown, name: string): Element[] {
  return walk(tree).filter((element) => classesOf(element).includes(name))
}

/** The first element carrying one data hook, or a failure that names the hook. */
function hookOf(tree: unknown, name: string): Element {
  const found = hooksOf(tree, name)[0]
  expect(found, `no element carries ${name}`).toBeDefined()
  return found!
}

/** One attribute as the DOM would spell it. */
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
const en = bundle.GROK_WORKFLOW_INTERNALS.translator('en')

/**
 * Local wall-clock base of every fixture, built from local components so the clock a call
 * line prints never depends on the machine's zone.
 */
const BASE = new Date(2026, 10, 25, 8, 2).getTime()

/** One declared call: a row of a run, settled or still open. */
function member(
  seq: number,
  label: string,
  phase: string,
  outcome: string | undefined,
  order: number,
  startedAt: number = BASE + seq * 60_000,
  endedAt: number = BASE + seq * 60_000 + 20_000,
): ProgressMember {
  return {
    seq,
    label,
    phase,
    childId: `child-${seq}`,
    order,
    startedAt,
    ...outcome === undefined ? {} : { endedAt, outcome },
  }
}

/**
 * 进行中: two plan tasks under one execute visit, and a retry inside the first of them.
 *
 * The shape the panel is built for: one leg with two branches, one branch carrying two
 * attempts, one of them still running at the end of the stream.
 */
function twoTaskRun(): ProgressRun {
  return {
    runId: 'r-panel-running',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'failed', 1),
      member(3, '执行', '任务 1 · 建表', 'completed', 2),
      member(4, '执行', '任务 2 · 写文档', undefined, 3),
    ],
    details: [],
  }
}

/** 已完成: every leg passed and the first summary draft shipped. */
function finishedRun(): ProgressRun {
  return {
    runId: 'r-panel-done',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'completed', 1),
      member(3, '检查', '任务 1 · 建表', 'completed', 2),
      member(4, '汇总·第1稿', '汇总', 'completed', 3),
    ],
    details: [],
    stopReason: 'completed',
    summaryFinalDraft: 1,
  }
}

/** 未通过: one task tried twice, both attempts failed, the run ended broken. */
function failedRun(): ProgressRun {
  return {
    runId: 'r-panel-failed',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'failed', 1),
      member(3, '执行', '任务 1 · 建表', 'failed', 2),
    ],
    details: [],
    stopReason: 'error',
  }
}

/** 重试通过: the first attempt failed, the second one passed. */
function recoveredRun(): ProgressRun {
  return {
    runId: 'r-panel-recovered',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'failed', 1),
      member(3, '执行', '任务 1 · 建表', 'completed', 2),
    ],
    details: [],
    stopReason: 'completed',
  }
}

/**
 * 第二遍没过: the first call of one task was cancelled, the retry failed.
 *
 * The retry keeps the bare role word, so its label says nothing about which try it was; the
 * row's place among the rows of its unit is what the stuck line has to read instead.
 */
function secondTryRun(): ProgressRun {
  return {
    runId: 'r-panel-second',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'cancelled', 1),
      member(3, '执行', '任务 1 · 建表', 'failed', 2),
    ],
    details: [],
    stopReason: 'error',
  }
}

/** 阻塞: the run ended over a call that never reported back. */
function blockedRun(): ProgressRun {
  return {
    runId: 'r-panel-blocked',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', undefined, 1),
    ],
    details: [],
    stopReason: 'error',
  }
}

/**
 * 每一稿都被退回, inside the parent (`model` strategy): no call names the summary, so the
 * verdict is the only thing the summary step carries.
 */
function rejectedRun(): ProgressRun {
  return {
    runId: 'r-panel-rejected',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'completed', 1),
    ],
    details: [],
    stopReason: 'error',
    summaryRejected: { drafts: 3, stage: 'check', reason: 'cites "x", which the report lacks' },
  }
}

/** 已取消: a failed call, but the reader stopped the run — which is not "stuck". */
function cancelledRun(): ProgressRun {
  return {
    runId: 'r-panel-cancelled',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'failed', 1),
    ],
    details: [],
    stopReason: 'cancelled',
  }
}

/** 等你点头: the run announced itself and declared nothing. */
function waitingRun(): ProgressRun {
  return { runId: 'r-panel-waiting', name: '任务团队 · 0 个任务', anchorSeq: 1, members: [], details: [] }
}

/**
 * Six steps still ahead of two measured ones: the shape an estimate is read off.
 *
 * The two finished steps are a 20 s plan and a 130 s execute, so their mean is 75 s; the
 * steps after them are the calls the run has open, which is what `remaining` counts.
 */
function etaRun(): ProgressRun {
  return {
    runId: 'r-panel-eta',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0, BASE, BASE + 20_000),
      member(2, '执行', '任务 1 · 建表', 'completed', 1, BASE + 60_000, BASE + 190_000),
      member(3, '检查', '检查', undefined, 2),
      member(4, '检查（第2次）', '检查', undefined, 3),
      member(5, '复核', '复核', undefined, 4),
      member(6, '复核（第2次）', '复核', undefined, 5),
      member(7, '汇总·第1稿', '汇总', undefined, 6),
      member(8, '汇总·第2稿', '汇总', undefined, 7),
    ],
    details: [],
  }
}

/** The same run, with the one row that made the estimate possible left unstamped. */
function etaGapRun(): ProgressRun {
  const run = etaRun()
  const execute = run.members[1]!
  delete execute.endedAt
  return run
}

/** 一个七秒的步骤, still followed by two: the rounding band under a minute. */
function etaRoundRun(): ProgressRun {
  return {
    runId: 'r-panel-eta-round',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0, BASE, BASE + 7_000),
      member(2, '执行', '执行', undefined, 1),
      member(3, '检查', '检查', undefined, 2),
    ],
    details: [],
  }
}

/** The model of one run, with the reader's own words. */
function graphOf(run: ProgressRun, t: Translator = zh): PanelGraph {
  return progress.derivePanelGraph(run, t)
}

/** The parsed structure of one model: what the page lays out. */
function parsedOf(run: ProgressRun, t: Translator = zh): ParsedPanel {
  return progress.parsePanelMermaid(graphOf(run, t).mermaid)
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
function pageOf(run: ProgressRun | undefined, extra: Record<string, unknown> = {}): () => unknown {
  const snapshot = run === undefined ? { runs: [], activeRun: undefined } : { runs: [run], activeRun: run }
  return renderer({
    t: zh,
    progressT: zh,
    useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
    ...extra,
  })
}

/** The page's own copy, without the scoped stylesheet (which is a text child of the tree). */
function pageTexts(page: unknown): string[] {
  return texts(page).filter((text) => text !== progress.css)
}

/**
 * The rule that declares one selector, whether it stands alone or in a group.
 *
 * A state's three amber rules are one line, so a lookup that demanded the selector end the
 * line would report rules the page really has as missing.
 */
function ruleWith(selector: string): string | undefined {
  return progress.css.split('\n').find((line) => {
    if (line.trim().startsWith('@')) return false
    const at = line.indexOf('{')
    if (at === -1) return false
    return line.slice(0, at).split(',').map((part) => part.trim()).includes(selector)
  })
}

/** The classes the stylesheet styles, one per selector, with the leading dot. */
function styledClasses(): string[] {
  const tokens = new Set<string>()
  for (const line of progress.css.split('\n')) {
    if (!line.includes('{') || line.trim().startsWith('@')) continue
    const selector = line.slice(0, line.indexOf('{'))
    for (const match of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) tokens.add(match[1]!)
  }
  return [...tokens]
}

describe('the panel model is one graph', () => {
  it('gives every step a node, every plan task a branch, and every branch its own id', () => {
    const graph = graphOf(twoTaskRun())
    expect(graph.state).toBe('running')
    expect(graph.nodes.map((node) => node.id))
      .toEqual(['start', 'plan', 'execute', 'execute_t1', 'execute_t2', 'end'])
    expect(graph.nodes.map((node) => node.kind)).toEqual(['start', 'plan', 'execute', 'task', 'task', 'end'])
    expect(graph.nodes.map((node) => node.leg))
      .toEqual(['start', 'plan', 'execute', 'execute', 'execute', 'end'])
    // A task's title is the phase the recorder wrote, verbatim: nothing shortens it.
    expect(graph.nodes.map((node) => node.label))
      .toEqual(['起点', '规划', '执行', '任务 1 · 建表', '任务 2 · 写文档', '终点'])
    expect(graph.nodes.map((node) => node.ordinal)).toEqual([0, 1, 1, 1, 2, 0])
    expect(graph.nodes.map((node) => node.taskNumber)).toEqual([undefined, undefined, undefined, 1, 2, undefined])
  })

  it('draws the step states, one current node, and the attempt record behind each task', () => {
    const graph = graphOf(twoTaskRun())
    expect(graph.nodes.map((node) => node.state)).toEqual(['done', 'done', 'doing', 'done', 'doing', 'pending'])
    expect(graph.nodes.map((node) => node.current)).toEqual([false, false, true, false, false, false])
    // One attempt per row, in `seq` order, each carrying its own row's state: a task that
    // failed once and then passed is a green task with one amber dot and one green one.
    expect(graph.nodes[3]!.attempts).toEqual([{ seq: 2, state: 'failed' }, { seq: 3, state: 'done' }])
    expect(graph.nodes[4]!.attempts).toEqual([{ seq: 4, state: 'doing' }])
    // A step has no attempts of its own: only a plan task is tried more than once.
    expect(graph.nodes[2]!.attempts).toEqual([])
  })

  it('keeps the rows a reader can open with the node they belong to', () => {
    const graph = graphOf(twoTaskRun())
    // A leg keeps only the rows that name no task; the numbered rows are the branches'.
    expect(graph.nodes.map((node) => node.openable)).toEqual([false, true, false, true, true, false])
    expect(graph.nodes.map((node) => node.calls.map((row) => row.seq))).toEqual([[], [1], [], [2, 3], [4], []])
    // The summary's all-rejected verdict rides on the node it happened on, not in a card.
    const rejected = graphOf(rejectedRun()).nodes.find((node) => node.kind === 'summarize')
    expect(rejected?.rejected).toEqual({ drafts: 3, stage: 'check', reason: 'cites "x", which the report lacks' })
    // …and the verdict is something a reader can open even though that node declared no call:
    // the operator's brief asks for the verdict to be readable inside the node's own calls.
    expect(rejected?.calls).toEqual([])
    expect(rejected?.openable).toBe(true)
  })

  it('joins a branch layer to its neighbours, and chains the steps that have none', () => {
    const graph = graphOf(twoTaskRun())
    expect(graph.edges.map((edge) => `${edge.from} -> ${edge.to} (${edge.kind})`)).toEqual([
      'start -> plan (chain)',
      'plan -> execute (chain)',
      'execute -> execute_t1 (branch)',
      'execute_t1 -> end (join)',
      'execute -> execute_t2 (branch)',
      'execute_t2 -> end (join)',
    ])
    // Every edge names two nodes the picture really has.
    const ids = new Set(graph.nodes.map((node) => node.id))
    for (const edge of graph.edges) {
      expect(ids.has(edge.from), edge.from).toBe(true)
      expect(ids.has(edge.to), edge.to).toBe(true)
    }
  })

  it('numbers the headline by the steps the flow counts, task branches excluded', () => {
    const graph = graphOf(twoTaskRun())
    expect([graph.at, graph.total, graph.remaining]).toEqual([3, 4, 1])
    expect(graph.headline.at).toBe(3)
    expect(graph.headline.total).toBe(4)
    // A repeated leg is a new step of its own, and its id says which visit it is.
    const revisited = graphOf(etaRun())
    expect(revisited.nodes.map((node) => node.id)).toEqual([
      'start', 'plan', 'execute', 'execute_t1', 'check', 'check_2', 'review', 'review_2', 'summarize', 'summarize_2', 'end',
    ])
    // The step count is the flow's own: a task branch is not a step a reader walks through.
    expect(revisited.total).toBe(10)
  })
})

describe('the mermaid text is the structure', () => {
  it('writes one node a line, then one edge a line, two-space indented', () => {
    expect(progress.panelMermaid(graphOf(twoTaskRun()))).toBe([
      'flowchart TD',
      '  start(["起点"])',
      '  plan["规划"]',
      '  execute["执行"]',
      '  execute_t1("任务 1 · 建表")',
      '  execute_t2("任务 2 · 写文档")',
      '  finish(["终点"])',
      '  start --> plan',
      '  plan --> execute',
      '  execute --> execute_t1',
      '  execute_t1 --> finish',
      '  execute --> execute_t2',
      '  execute_t2 --> finish',
    ].join('\n'))
  })

  it('writes the end node as `finish`, because `end` closes a subgraph', () => {
    // A definition line starting with `end` is not a node any mermaid renderer reads, so the
    // one word the text may not use is renamed — in the text only: the model, the DOM hook
    // and every edge keep calling that node `end`.
    const text = progress.panelMermaid(graphOf(twoTaskRun()))
    expect(text).toContain('  finish(["终点"])')
    expect(text.split('\n').filter((line) => line.trim().startsWith('end'))).toEqual([])
    expect(text).not.toContain('-- > end')
    expect(graphOf(twoTaskRun()).nodes.map((node) => node.id)).toContain('end')
  })

  it('writes the reader’s own words, and a task title exactly as recorded', () => {
    const english = progress.panelMermaid(graphOf(twoTaskRun(), en)).split('\n')
    expect(english.slice(1, 7)).toEqual([
      '  start(["Start"])',
      '  plan["Plan"]',
      '  execute["Execute"]',
      // A task's title is the phase the recorder wrote, so it is never translated: only the
      // leg words follow the reader's dictionary.
      '  execute_t1("任务 1 · 建表")',
      '  execute_t2("任务 2 · 写文档")',
      '  finish(["End"])',
    ])
  })

  it('escapes a quote and flattens a line break, so one label stays one line', () => {
    const run = twoTaskRun()
    run.members[1]!.phase = '任务 1 · 引用 "x"\n第二行'
    const text = progress.panelMermaid(graphOf(run))
    expect(text).toContain('  execute_t1("任务 1 · 引用 #quot;x#quot; 第二行")')
    expect(text.split('\n').filter((line) => line.includes('execute_t1('))).toHaveLength(1)
  })

  it('round-trips the graph, and drops what the subset does not describe', () => {
    const graph = graphOf(twoTaskRun())
    const parsed = progress.parsePanelMermaid(graph.mermaid)
    expect(parsed.direction).toBe('TD')
    expect(parsed.nodes.map((node) => [node.id, node.shape])).toEqual([
      ['start', 'stadium'],
      ['plan', 'rect'],
      ['execute', 'rect'],
      ['execute_t1', 'round'],
      ['execute_t2', 'round'],
      ['finish', 'stadium'],
    ])
    // Labels come back unescaped, which is what makes the round trip a round trip.
    expect(parsed.nodes.map((node) => node.label)).toEqual(graph.nodes.map((node) => node.label))
    // The parser knows no special ids: it reads the words the text uses, and the end node is
    // the word the text had to change.
    expect(parsed.edges.length).toBe(graph.edges.length)
    expect(parsed.edges.map((edge) => `${edge.from}->${edge.to}`))
      .toEqual(graph.edges.map((edge) => `${edge.from}->${edge.to.replace('end', 'finish')}`))

    const noisy = [
      '%% a comment the subset ignores',
      'flowchart TD',
      '  start(["起点"])',
      '  this is not a line mermaid wrote',
      '  plan["规划"]',
      '  start --> plan',
      '  plan --> nowhere',
      '',
    ].join('\n')
    const read = progress.parsePanelMermaid(noisy)
    expect(read.nodes.map((node) => node.id)).toEqual(['start', 'plan'])
    // An edge naming a node nobody declared is a route to nowhere, so it is dropped.
    expect(read.edges).toEqual([{ from: 'start', to: 'plan' }])
  })
})

/**
 * The boxes every layout assertion is read off.
 *
 * Explicit sizes, so the expected numbers are arithmetic rather than whatever a measurement
 * happened to be on the machine that ran the test.
 */
const SIZES: Record<string, { w: number, h: number }> = {
  start: { w: 80, h: 32 },
  plan: { w: 100, h: 32 },
  execute: { w: 100, h: 32 },
  execute_t1: { w: 140, h: 34 },
  execute_t2: { w: 140, h: 34 },
  finish: { w: 80, h: 32 },
}

describe('the layout is computed from the boxes', () => {
  it('lays one layer a row, siblings side by side and centred in the container', () => {
    const layout = progress.layoutPanelGraph(parsedOf(twoTaskRun()), SIZES, 1440)
    const box = (id: string) => layout.nodes.find((node) => node.id === id)!
    expect([layout.width, layout.height]).toEqual([1440, 338])
    // Layers strictly increase in y, and a layer change is 44 px of air.
    expect(['start', 'plan', 'execute', 'execute_t1', 'finish'].map((id) => box(id).y)).toEqual([0, 76, 152, 228, 306])
    // Siblings: 12 px apart, and the pair as a whole centred in the container.
    expect([box('execute_t1').x, box('execute_t2').x]).toEqual([574, 726])
    expect(box('execute_t1').x + box('execute_t1').w + 12).toBe(box('execute_t2').x)
    expect((box('execute_t1').x + box('execute_t2').x + box('execute_t2').w) / 2).toBe(720)
    // A layer with one node is centred on its own width.
    expect([box('start').x, box('finish').x]).toEqual([680, 680])
  })

  it('anchors an edge on the two boxes it joins, straight when they share a column', () => {
    const layout = progress.layoutPanelGraph(parsedOf(twoTaskRun()), SIZES, 1440)
    const d = (from: string) => layout.edges.find((edge) => edge.from === from)!.d
    // Both nodes are 720 wide-centre, so the wire is one straight drop.
    expect(d('plan')).toBe('M 720 108 L 720 152')
    // An elbow leaves the bottom centre, turns at the midpoint of the gap, and comes down
    // onto the target's top centre, with an 8 px radius at each corner.
    expect(d('execute')).toBe('M 720 184 L 720 198 Q 720 206 712 206 L 652 206 Q 644 206 644 214 L 644 228')
    expect(d('execute_t1')).toBe('M 644 262 L 644 276 Q 644 284 652 284 L 712 284 Q 720 284 720 292 L 720 306')
    // The node a branch hangs off and the node it comes back to share one anchor x, which is
    // why the chain between them is a single vertical run and not a half-pixel stutter.
    const box = (id: string) => layout.nodes.find((node) => node.id === id)!
    expect(box('plan').x + box('plan').w / 2).toBe(box('execute').x + box('execute').w / 2)
    expect(d('execute_t1')).toBe('M 644 262 L 644 276 Q 644 284 652 284 L 712 284 Q 720 284 720 292 L 720 306')
    expect(d('execute_t2')).toBe('M 796 262 L 796 276 Q 796 284 788 284 L 728 284 Q 720 284 720 292 L 720 306')
  })

  it('turns a column into a side rail: one card a row, and every wire in a gutter', () => {
    const layout = progress.layoutPanelGraph(parsedOf(twoTaskRun()), SIZES, 360)
    const box = (id: string) => layout.nodes.find((node) => node.id === id)!
    // The container is the width it was handed, and no node is wider than it.
    expect(layout.width).toBe(360)
    for (const node of layout.nodes) expect(node.w).toBeLessThanOrEqual(360)
    // Every card keeps a 24 px gutter on both sides, so both trunks fit beside it.
    expect([box('execute_t1').x, box('execute_t1').w]).toEqual([24, 312])
    expect([box('execute_t2').x, box('execute_t2').w]).toEqual([24, 312])
    // A leg and the two ends are the trunk line itself: full width, no gutter to keep.
    expect([box('start').x, box('start').w]).toEqual([0, 360])
    expect(['start', 'plan', 'execute', 'execute_t1', 'execute_t2', 'finish'].map((id) => box(id).y))
      .toEqual([0, 62, 124, 186, 246, 310])
    const d = (from: string, to: string) => layout.edges.find((edge) => edge.from === from && edge.to === to)!.d
    // A chain drops straight through the gap: one stem, no corner.
    expect(d('start', 'plan')).toBe('M 180 32 L 180 62')
    // A fork: out of the leg's bottom centre, a 12 px stem, a bar to the left trunk, down the
    // trunk, and in over the card's own top edge 8 px from its left corner.
    expect(d('execute', 'execute_t1'))
      .toBe('M 180 156 L 180 162 Q 180 168 174 168 L 17 168 Q 12 168 12 173 Q 12 178 17 178 L 28 178 Q 32 178 32 182 L 32 186')
    // Its sibling is entered on the opposite corner, so two branches of one leg read as two
    // connections rather than one blur.
    expect(d('execute', 'execute_t2'))
      .toBe('M 180 156 L 180 162 Q 180 168 174 168 L 20 168 Q 12 168 12 176 L 12 230 Q 12 238 20 238 L 324 238 Q 328 238 328 242 L 328 246')
    // A join leaves the card's bottom edge 8 px in from its right corner, runs down the right
    // trunk, and comes into the next step's top centre.
    expect(d('execute_t1', 'finish'))
      .toBe('M 328 220 L 328 224 Q 328 228 332 228 L 340 228 Q 348 228 348 236 L 348 290 Q 348 298 340 298 L 186 298 Q 180 298 180 304 L 180 310')
    expect(d('execute_t2', 'finish'))
      .toBe('M 328 280 L 328 284 Q 328 288 332 288 L 343 288 Q 348 288 348 293 Q 348 298 343 298 L 186 298 Q 180 298 180 304 L 180 310')
    // The trunks are the two rails, 12 px in from either edge of the column.
    for (const edge of layout.edges) {
      for (const point of verticesOf(edge.d)) expect(point[0]).toBeGreaterThanOrEqual(12)
    }
  })

  it('never runs a wire through a card, at either width', () => {
    for (const width of [1440, 360]) {
      const layout = progress.layoutPanelGraph(parsedOf(twoTaskRun()), SIZES, width)
      for (const edge of layout.edges) {
        const points = verticesOf(edge.d)
        for (let index = 0; index + 1 < points.length; index += 1) {
          const [x1, y1] = points[index]!
          const [x2, y2] = points[index + 1]!
          if (x1 !== x2) continue
          // The corner curve shaves a couple of pixels off each end; what is left of the run
          // is what a reader would see drawn across the card.
          const top = Math.min(y1, y2) + 2
          const bottom = Math.max(y1, y2) - 2
          if (bottom <= top) continue
          for (const box of layout.nodes) {
            const insideX = x1 > box.x + 0.5 && x1 < box.x + box.w - 0.5
            const overlapsY = bottom > box.y && top < box.y + box.h
            expect(insideX && overlapsY, `${edge.from} -> ${edge.to} runs through ${box.id} at ${width}px`)
              .toBe(false)
          }
        }
      }
    }
  })
})

/**
 * The vertices of one path, in order.
 *
 * A `Q` contributes only its on-curve end: the control point is not a place the wire goes,
 * so a run that "turns" there would be measured as if it did.
 */
function verticesOf(d: string): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (const token of d.match(/[MLQ][^MLQ]*/g) ?? []) {
    const numbers = token.slice(1).trim().split(/[\s,]+/).map(Number)
    if (token[0] === 'Q') points.push([numbers[2]!, numbers[3]!])
    else points.push([numbers[0]!, numbers[1]!])
  }
  return points
}

describe('the remaining time is measured, never invented', () => {
  it('says nothing when no finished step was measured', () => {
    expect(graphOf(waitingRun()).headline.eta).toBeUndefined()
    // The running fixture has one finished step and one open one: the open one was not
    // measured, so the estimate rests on the one that was.
    expect(graphOf(twoTaskRun()).headline.eta).toEqual({ ms: 20_000, basis: 1 })
  })

  it('averages the finished steps it measured and multiplies by what is left', () => {
    const graph = graphOf(etaRun())
    expect(graph.remaining).toBe(6)
    // (20 s + 130 s) / 2 = 75 s a step, times the six still ahead.
    expect(graph.headline.eta).toEqual({ ms: 450_000, basis: 2 })
  })

  it('leaves out a finished step that cannot be dated', () => {
    const graph = graphOf(etaGapRun())
    expect(graph.headline.eta).toEqual({ ms: 120_000, basis: 1 })
  })

  it('says nothing when there is nothing left, and rounds to what it can measure', () => {
    expect(graphOf(finishedRun()).remaining).toBe(0)
    expect(graphOf(finishedRun()).headline.eta).toBeUndefined()
    // 7 s a step times two, rounded to the nearest 5 s under a minute.
    expect(graphOf(etaRoundRun()).headline.eta).toEqual({ ms: 15_000, basis: 1 })
  })
})

describe('where the run is stuck, if it is', () => {
  it('names the first step whose failure is still current, with its role and attempt', () => {
    // The verdict names the failure the run is held at, which is the first one nothing has
    // replaced: two failed tries still report the first, because that is the try still open.
    expect(graphOf(failedRun()).stuck)
      .toEqual({ nodeId: 'execute_t1', at: 3, kind: 'failed', role: '执行', attempt: 1 })
    // A failure on a later try says which try it was, counted among the rows of its unit:
    // the label carries no number, so the row's own place is the number.
    expect(graphOf(secondTryRun()).stuck)
      .toEqual({ nodeId: 'execute_t1', at: 3, kind: 'failed', role: '执行', attempt: 2 })
    // A failure a later attempt of the same task replaced is not current, so it is not stuck.
    expect(graphOf(recoveredRun()).stuck).toBeUndefined()
    expect(graphOf(twoTaskRun()).stuck).toBeUndefined()
  })

  it('falls back to a blocked step, then to a summary that was turned back', () => {
    expect(graphOf(blockedRun()).stuck).toEqual({ nodeId: 'execute', at: 3, kind: 'blocked' })
    expect(graphOf(rejectedRun()).stuck).toEqual({ nodeId: 'summarize', at: 4, kind: 'rejected', drafts: 3 })
  })

  it('never calls a cancelled run stuck', () => {
    expect(graphOf(cancelledRun()).stuck).toBeUndefined()
  })
})

describe('the page: a header, the graph, the stuck line, the dock', () => {
  it('keeps the run and the chip, and says the one sentence under them', () => {
    const page = pageOf(twoTaskRun())()
    const bar = hookOf(page, 'data-gw-progress-bar')
    expect(attr(bar, 'data-gw-progress-bar')).toBe(bar.props['data-gw-progress-bar'] === true ? 'true' : undefined)
    expect(textOf(hookOf(page, 'data-gw-progress-run'))).toBe('任务团队 · 2 个任务')
    expect(attr(hookOf(page, 'data-gw-progress-chip'), 'data-state')).toBe('running')
    const line = hookOf(page, 'data-gw-progress-line')
    expect(line.type).toBe('p')
    expect(classesOf(line)).toEqual(['gw-progress-line'])
    expect(textOf(line)).toBe('第 3 步，共 4 步 · 还剩约 20 秒')
    // The method is the tooltip, and only while the number exists.
    expect(attr(line, 'title')).toBe(zh('progress.panel.etaBasis', { n: 1 }))
    // A run with nothing to estimate says the step and nothing else.
    const leaning = pageOf(finishedRun())()
    expect(textOf(hookOf(leaning, 'data-gw-progress-line'))).toBe('第 6 步，共 6 步')
    expect(attr(hookOf(leaning, 'data-gw-progress-line'), 'title')).toBeUndefined()
  })

  it('draws the graph the text describes, and marks exactly one node as current', () => {
    const page = pageOf(twoTaskRun())()
    const graph = hookOf(page, 'data-gw-progress-graph')
    expect(graph.type).toBe('div')
    expect(classesOf(graph)).toEqual(['gw-progress-graph'])
    const source = attr(graph, 'data-gw-progress-source')!
    const parsed = progress.parsePanelMermaid(source)
    expect(parsed.nodes).toHaveLength(6)
    expect(parsed.edges).toHaveLength(6)
    expect(parsed.nodes.map((node) => node.id))
      .toEqual(['start', 'plan', 'execute', 'execute_t1', 'execute_t2', 'finish'])

    // The tree keeps the model's own words, so a reader of the DOM never meets the id the
    // text had to rename: the last node is `end` here and `finish` in the source above.
    const nodes = hooksOf(page, 'data-gw-progress-pnode')
    expect(nodes).toHaveLength(6)
    expect(nodes.map((node) => attr(node, 'data-gw-progress-pnode')))
      .toEqual(['start', 'plan', 'execute', 'execute_t1', 'execute_t2', 'end'])
    expect(nodes.filter((node) => attr(node, 'data-current') === 'true')).toHaveLength(1)
    expect(attr(nodes[2]!, 'data-current')).toBe('true')
    // The task nodes carry their number, and every node its kind, state and ordinal.
    expect(nodes.map((node) => [attr(node, 'data-kind'), attr(node, 'data-state'), attr(node, 'data-ordinal')])).toEqual([
      ['start', 'done', '0'],
      ['plan', 'done', '1'],
      ['execute', 'doing', '1'],
      ['task', 'done', '1'],
      ['task', 'doing', '2'],
      ['end', 'pending', '0'],
    ])
    expect(nodes.map((node) => attr(node, 'data-task'))).toEqual([undefined, undefined, undefined, '1', '2', undefined])
    // Every node is placed by the layout, and its height is left to the box.
    const style = nodes[2]!.props['style'] as Record<string, string>
    expect(Object.keys(style).sort()).toEqual(['left', 'top', 'width'])
    // One path per edge, each naming the two nodes it joins and the kind of step it is.
    const edges = hooksOf(page, 'data-gw-progress-edge')
    expect(edges.map((edge) => attr(edge, 'data-kind'))).toEqual(['chain', 'chain', 'branch', 'join', 'branch', 'join'])
    expect(edges.map((edge) => `${attr(edge, 'data-from')}->${attr(edge, 'data-to')}`))
      .toEqual([
        'start->plan',
        'plan->execute',
        'execute->execute_t1',
        'execute_t1->end',
        'execute->execute_t2',
        'execute_t2->end',
      ])
    for (const edge of edges) {
      expect(attr(edge, 'marker-end')).toBe('url(#gw-progress-arrow)')
      expect(attr(edge, 'd')).toMatch(/^M /)
    }
    const svg = hookOf(page, 'data-gw-progress-wires')
    expect(attr(svg, 'aria-hidden')).toBe('true')
    expect(hooksOf(page, 'data-gw-progress-pnodes')).toHaveLength(1)
  })

  it('draws one dot per attempt, and a dashed step between a failure and its retry', () => {
    const page = pageOf(twoTaskRun())()
    const dots = withClass(page, 'gw-progress-pnode-attempt')
    expect(dots.map((dot) => [attr(dot, 'data-attempt'), attr(dot, 'data-state')]))
      .toEqual([['1', 'failed'], ['2', 'done'], ['1', 'doing']])
    // Only the pair that is a retry carries the mark, and it sits between that pair.
    const retries = withClass(page, 'gw-progress-pnode-retry')
    expect(retries).toHaveLength(1)
    const first = hooksOf(page, 'data-gw-progress-pnode').find((node) => attr(node, 'data-gw-progress-pnode') === 'execute_t1')!
    const order = walk(first).map((element) => classesOf(element).join(' '))
    expect(order.indexOf('gw-progress-pnode-attempt')).toBeLessThan(order.indexOf('gw-progress-pnode-retry'))
    expect(order.indexOf('gw-progress-pnode-retry')).toBeLessThan(order.lastIndexOf('gw-progress-pnode-attempt'))
    // The dots are decoration, and a node with one attempt carries no mark at all.
    for (const dot of dots) expect(attr(dot, 'aria-hidden')).toBe('true')
    // One try each in the finished run's two tasks: two dots, both the first of their task.
    const once = withClass(pageOf(finishedRun())(), 'gw-progress-pnode-attempt')
    expect(once.map((dot) => attr(dot, 'data-attempt'))).toEqual(['1', '1'])
    expect(withClass(pageOf(finishedRun())(), 'gw-progress-pnode-retry')).toHaveLength(0)
  })

  it('says the leg or the task, never a sentence, and speaks the state instead', () => {
    const page = pageOf(twoTaskRun())()
    const words = hooksOf(page, 'data-gw-progress-pnode-word')
    expect(words.map((word) => textOf(word))).toEqual(['起点', '规划', '执行', '任务 1 · 建表', '任务 2 · 写文档', '终点'])
    // The word carries its own tooltip, so a cut label can still be read whole.
    expect(words.map((word) => attr(word, 'title'))).toEqual(words.map((word) => textOf(word)))
    // The state is spoken, never printed; the badge is the attempt count, and only past one.
    const labels = hooksOf(page, 'data-gw-progress-pnode').map((node) => attr(node, 'aria-label'))
    expect(labels[2]).toBe(`执行 ${zh('progress.plan.running')}`)
    expect(labels[3]).toBe(`任务 1 · 建表 ${zh('progress.flow.attempt', { n: 2 })} ${zh('progress.plan.done')}`)
    const badges = hooksOf(page, 'data-gw-progress-pnode-badge')
    expect(badges.map((badge) => textOf(badge))).toEqual(['第 2 遍'])
    for (const text of pageTexts(page)) expect(text).not.toContain(zh('progress.plan.done'))
  })

  it('draws the stuck line only while something is stuck', () => {
    expect(hooksOf(pageOf(twoTaskRun())(), 'data-gw-progress-stuck')).toHaveLength(0)
    expect(hooksOf(pageOf(finishedRun())(), 'data-gw-progress-stuck')).toHaveLength(0)
    expect(hooksOf(pageOf(cancelledRun())(), 'data-gw-progress-stuck')).toHaveLength(0)
    const failed = hookOf(pageOf(failedRun())(), 'data-gw-progress-stuck')
    expect(failed.type).toBe('p')
    expect(classesOf(failed)).toEqual(['gw-progress-stuck'])
    expect(textOf(failed)).toBe('卡在 3：执行 第 1 遍没过')
    expect(textOf(hookOf(pageOf(blockedRun())(), 'data-gw-progress-stuck'))).toBe('卡在 3：这一步没有回报')
    expect(textOf(hookOf(pageOf(rejectedRun())(), 'data-gw-progress-stuck'))).toBe('卡在 4：3 稿全被退回')
    // The line is a sibling after the graph, and before the Guardian card.
    const page = pageOf(failedRun())()
    const order = walk(page)
    expect(order.indexOf(hookOf(page, 'data-gw-progress-stuck')))
      .toBeGreaterThan(order.indexOf(hookOf(page, 'data-gw-progress-graph')))
    if (hooksOf(page, 'data-gw-progress-guardian').length > 0) {
      expect(order.indexOf(hookOf(page, 'data-gw-progress-stuck')))
        .toBeLessThan(order.indexOf(hookOf(page, 'data-gw-progress-guardian')))
    }
  })

  it('offers the dock’s one button where it could work, and no count line anywhere', () => {
    const fill = () => false
    expect(attr(hookOf(pageOf(waitingRun(), { fillDraft: fill })(), 'data-gw-progress-dock'), 'data-state')).toBe('start')
    expect(textOf(hookOf(pageOf(waitingRun(), { fillDraft: fill })(), 'data-gw-progress-dock-fill'))).toBe(zh('progress.dock.start'))
    expect(attr(hookOf(pageOf(finishedRun(), { fillDraft: fill })(), 'data-gw-progress-dock'), 'data-state')).toBe('accept')
    expect(textOf(hookOf(pageOf(finishedRun(), { fillDraft: fill })(), 'data-gw-progress-dock-fill'))).toBe(zh('progress.dock.accept'))
    // A run that is still working asks for no click, and a shell that cannot write the box
    // offers no button rather than one that would do nothing.
    expect(hooksOf(pageOf(twoTaskRun(), { fillDraft: fill })(), 'data-gw-progress-dock-fill')).toHaveLength(0)
    expect(hooksOf(pageOf(waitingRun())(), 'data-gw-progress-dock-fill')).toHaveLength(0)
    // The count line is gone: the header's sentence is the only step count on the page.
    expect(hooksOf(pageOf(finishedRun())(), 'data-gw-progress-left')).toHaveLength(0)
  })

  it('carries no retired hook or class, anywhere in the tree', () => {
    const retired = [
      'data-gw-progress-flow',
      'data-gw-progress-nodes',
      'data-gw-progress-left',
      'data-gw-progress-cols',
      'data-gw-progress-col',
      'data-gw-progress-subs',
      'data-gw-progress-sub',
      'data-gw-progress-sub-toggle',
      'data-gw-progress-node-toggle',
      'data-gw-progress-branch-side',
    ]
    const retiredClasses = [
      'gw-progress-flow',
      'gw-progress-nodes',
      'gw-progress-cols',
      'gw-progress-col',
      'gw-progress-subs',
      'gw-progress-sub',
      'gw-progress-sub-dots',
      'gw-progress-sub-dot',
      'gw-progress-sub-word',
      'gw-progress-sub-badge',
      'gw-progress-sub-calls',
      'gw-progress-node-toggle',
      'gw-progress-left',
    ]
    for (const run of [twoTaskRun(), finishedRun(), failedRun(), waitingRun()]) {
      const page = pageOf(run)()
      for (const name of retired) expect(hooksOf(page, name), name).toHaveLength(0)
      for (const element of walk(page)) {
        for (const name of classesOf(element)) {
          // `gw-progress-task` is retired outright: no class may carry it as a substring.
          expect(name.includes('gw-progress-task'), name).toBe(false)
          expect(retiredClasses.includes(name), name).toBe(false)
        }
      }
    }
    // …and the bundle does not keep the retired names for a later reader either.
    for (const name of retired) expect(SOURCE.includes(name), name).toBe(false)
  })
})

describe('the stylesheet', () => {
  it('stays scoped, token-coloured and free of the retired page', () => {
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(progress.css).not.toMatch(/\brgba?\(/)
    expect(progress.css).not.toMatch(/\bhsla?\(/)
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
    expect(progress.css).not.toContain('overflow-x')
    for (const rule of progress.css.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('@'))) {
      expect(rule.trim().startsWith('.gw-progress'), rule).toBe(true)
    }
    // Every colour is a design token, or a mix of one, and every family too.
    expect(progress.css).toContain('var(--dsw-font-family-sans')
    const colours = progress.css.match(/(?:^|[^-\w])(?:color|background|border-color|fill|stroke)\s*:\s*[^;]+/g) ?? []
    expect(colours.length).toBeGreaterThan(10)
    for (const declaration of colours) {
      expect(declaration, declaration).toMatch(/var\(--dsw-alias-|transparent|currentColor|none|inherit/)
    }
  })

  it('styles the panel’s own classes, and none of the ones it replaced', () => {
    const styled = styledClasses()
    for (const name of [
      'gw-progress-line',
      'gw-progress-graph',
      'gw-progress-pnodes',
      'gw-progress-pnode',
      'gw-progress-pnode-body',
      'gw-progress-pnode-dot',
      'gw-progress-pnode-word',
      'gw-progress-pnode-badge',
      'gw-progress-pnode-dots',
      'gw-progress-pnode-attempt',
      'gw-progress-pnode-retry',
      'gw-progress-stuck',
      // Kept for the control that opens a node's calls.
      'gw-progress-node-calls',
    ]) expect(styled, name).toContain(name)
    for (const name of [
      'gw-progress-flow',
      'gw-progress-nodes',
      'gw-progress-cols',
      'gw-progress-col',
      'gw-progress-subs',
      'gw-progress-sub',
      'gw-progress-sub-dots',
      'gw-progress-sub-dot',
      'gw-progress-sub-word',
      'gw-progress-sub-badge',
      'gw-progress-sub-calls',
      'gw-progress-node-toggle',
      'gw-progress-left',
    ]) expect(styled, name).not.toContain(name)
  })

  it('gives each state one token, keeps the unreached dashed, and stops the motion', () => {
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
    const pending = progress.css.split('\n').find((line) => line.trim().startsWith('.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-body {'))
    expect(pending).toContain('border-style: dashed')
    const reduced = progress.css.slice(progress.css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('.gw-progress-pnode')
    expect(reduced).toContain('.gw-progress-pnode-attempt')
    // The ring marks the reader's place whatever state it is in.
    expect(progress.css).toContain('.gw-progress-pnode[data-current="true"] .gw-progress-pnode-body')
    // A phone wraps a label instead of cutting it.
    const narrow = progress.css.slice(progress.css.indexOf('@media (max-width: 720px)'))
    expect(narrow).toMatch(/\.gw-progress-pnode-word \{[^}]*overflow-wrap: anywhere/)
  })
})
