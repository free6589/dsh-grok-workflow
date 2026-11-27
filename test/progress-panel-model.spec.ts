import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The fork panel's model: a left-to-right seven-level picture of one run, drawn from its own
 * recorded rows.
 *
 * The operator's blueprint retired the vertical step tree and its `flowchart TD` text. What the
 * page draws now is one fork — 起点 → 规划 → 任务 1 / 任务 2 … → 每条任务的子任务 → 汇合 →
 * 验收 → 终点 — and this file pins the model that picture is built from, and nothing about how
 * it is laid out or painted (that half is `test/progress-panel.spec.ts`):
 *
 * 1. **Seven levels, one box a place.** `start`, `plan`, one card per plan task, one branch per
 *    call a task made, `sum`, `accept`, `end` — always all seven levels, whether the run is
 *    still waiting, still moving or already over.
 * 2. **Nothing is dropped and nothing is invented.** Every non-guardian row lands in exactly
 *    one owning box (the plan, a task or the summary); the guardian's call is not a leg of the
 *    work. A picture is derived from the rows on every render, so a replanned run gains the
 *    task it really walked and keeps everything else identical.
 * 3. **The lights are folds of records.** Six rings per task and five checks per run, each one
 *    a fold over rows that were really reported — a recovered failure is green, and a
 *    verification nobody reported stays dark.
 * 4. **The text is the structure.** `panelMermaid` writes `flowchart LR`, and `parsePanelMermaid`
 *    reads that subset back; the page lays out the parsed text, so the figure and the text
 *    cannot disagree.
 *
 * The bundle is loaded the way the host loads it — a stub `__ModuleLoader__` and a stub React
 * whose `useState` really stores — and `useEffect` never runs, which is also the statement that
 * a host without layout still renders.
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

interface PanelRing { key: string, state: string }

interface PanelCheck { key: string, state: string }

interface PanelSubtask {
  taskId: string
  taskNumber?: number
  seq: number
  leg?: string
  attempt: number
}

interface PanelNode {
  id: string
  kind: string
  level: number
  label: string
  state: string
  current: boolean
  calls: ProgressMember[]
  openable: boolean
  rings?: PanelRing[]
  checks?: PanelCheck[]
  rejected?: { drafts: number, stage: string, reason: string }
  subtask?: PanelSubtask
}

interface PanelEdge { from: string, to: string, kind: string }

interface PanelGraph {
  state: string
  mermaid: string
  nodes: PanelNode[]
  edges: PanelEdge[]
  headline: { at: number, total: number, remaining: number, eta?: { ms: number, basis: number } }
  at: number
  total: number
  remaining: number
  checks: PanelCheck[]
  final?: { draft: number, seq: number }
  stuck?: { nodeId: string, at: number, kind: string, role?: string, attempt?: number, drafts?: number }
}

interface ParsedPanel {
  direction: string
  nodes: Array<{ id: string, label: string, shape: string }>
  edges: Array<{ from: string, to: string }>
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
  }
}

/** The hook cells of the render in progress: React keeps them across a re-render. */
type Cells = { index: number, cells: unknown[] }

let rendering: Cells | undefined

/**
 * Load the bundle the way the host does, with a stub React whose `useState` really stores.
 *
 * The progress tab reads no host service: its run facts arrive through `useGrokProgress`, so
 * the stub only has to be shaped like the hooks the page touches. `useEffect` never runs here,
 * which is the same statement as "a host without layout measures nothing": the page must
 * render its default boxes rather than wait for a measurement that will never come.
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

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')
const en = bundle.GROK_WORKFLOW_INTERNALS.translator('en')

/**
 * Local wall-clock base of every fixture, built from local components so no assertion depends
 * on the machine's zone.
 */
const BASE = new Date(2026, 10, 25, 8, 2).getTime()

/** One declared call: a row of a run, settled or still open. */
function member(
  seq: number,
  label: string,
  phase: string | undefined,
  outcome: string | undefined,
  order: number,
  startedAt: number = BASE + seq * 60_000,
  endedAt: number = BASE + seq * 60_000 + 20_000,
): ProgressMember {
  return {
    seq,
    label,
    ...phase === undefined ? {} : { phase },
    childId: `child-${seq}`,
    order,
    startedAt,
    ...outcome === undefined ? {} : { endedAt, outcome },
  }
}

/**
 * 进行中: two plan tasks, a retry inside the first, both gates of the first reported.
 *
 * The shape the fork is built for: one task done, one task still working, and a branch per
 * call each of them made — the first task's retry is its second branch.
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
      member(4, '检查', '任务 1 · 建表', 'completed', 3),
      member(5, '执行', '任务 2 · 写文档', undefined, 4),
    ],
    details: [],
  }
}

/** 已完成: one task through both of its gates, and the first summary draft shipped. */
function finishedRun(): ProgressRun {
  return {
    runId: 'r-panel-done',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'completed', 1),
      member(3, '检查', '任务 1 · 建表', 'completed', 2),
      member(4, '复核', '任务 1 · 建表', 'completed', 3),
      member(5, '汇总·第1稿', '汇总', 'completed', 4),
    ],
    details: [],
    stopReason: 'completed',
    summaryFinalDraft: 1,
  }
}

/** 未通过: the check gate failed, so the task is not accepted even though its work landed. */
function failedRun(): ProgressRun {
  return {
    runId: 'r-panel-failed',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'completed', 1),
      member(3, '检查', '任务 1 · 建表', 'failed', 2),
    ],
    details: [],
    stopReason: 'error',
  }
}

/** 重试通过: both gates failed once and passed on the second call. */
function recoveredRun(): ProgressRun {
  return {
    runId: 'r-panel-recovered',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'failed', 1),
      member(3, '执行', '任务 1 · 建表', 'completed', 2),
      member(4, '检查', '任务 1 · 建表', 'failed', 3),
      member(5, '检查', '任务 1 · 建表', 'completed', 4),
    ],
    details: [],
    stopReason: 'completed',
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
 * verdict is the only thing the summary box carries.
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

/** 已取消: a failure, but the reader stopped the run — which is not "stuck". */
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
 * 五验: every screen reported in the run's own words, one of them still open.
 *
 * The three screens a leg word does not name are reported on a label or a phase, and a row that
 * `命名` writes as free text (`人验`) still belongs to the task in front of it.
 */
function checksRun(): ProgressRun {
  return {
    runId: 'r-panel-checks',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '检查', '任务 1 · 建表', 'completed', 1),
      member(3, '复核', '任务 1 · 建表', 'completed', 2),
      member(4, '执行', '任务 1 · 真机 隔离', 'completed', 3),
      member(5, '人验', '任务 1 · 建表', 'completed', 4),
      member(6, '执行', '任务 1 · 对账', 'failed', 5),
      member(7, '执行', '任务 2 · 真机隔离', undefined, 6),
    ],
    details: [],
  }
}

/** 对账重试: the ledger failure a later attempt replaced is not a current failure. */
function recoveredCheckRun(): ProgressRun {
  return {
    runId: 'r-panel-checks-recovered',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 对账', 'failed', 1),
      member(3, '执行', '任务 1 · 对账', 'completed', 2),
    ],
    details: [],
  }
}

/** 英文对账: the ledger screen matches a Latin word by its stem, not by its whole spelling. */
function latinLedgerRun(): ProgressRun {
  return {
    runId: 'r-panel-ledger-latin',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · reconciliation', 'completed', 1),
    ],
    details: [],
  }
}

/** The guardian's own call, which is not a leg of the work and owns no box. */
function guardianRun(): ProgressRun {
  return {
    runId: 'r-panel-guardian',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, 'Guardian 判停', 'Guardian', undefined, 1),
    ],
    details: [],
  }
}

/** The same finished run, measured on a level whose one row cannot be dated. */
function etaGapRun(): ProgressRun {
  const run = twoTaskRun()
  delete run.members[0]!.endedAt
  return run
}

/**
 * 重规划: one more plan task, declared after the summary already ran.
 *
 * The rows are appended so the fixture isolates the picture's change: everything the first run
 * drew keeps its own order and its own stamps, and the only difference is the task the replan
 * added, its branches, and the wires that carry them.
 */
function replannedRun(): ProgressRun {
  const run = finishedRun()
  run.members.push(member(6, '执行', '任务 3 · 部署', 'completed', 5))
  run.members.push(member(7, '检查', '任务 3 · 部署', 'completed', 6))
  return run
}

/** The model of one run, with the reader's own words. */
function graphOf(run: ProgressRun, t: Translator = zh): PanelGraph {
  return progress.derivePanelGraph(run, t)
}

/** One box by id, or a failure that names it. */
function boxOf(graph: PanelGraph, id: string): PanelNode {
  const found = graph.nodes.find((node) => node.id === id)
  expect(found, `no box ${id}`).toBeDefined()
  return found!
}

/** The lights of one box as `key:state`, in the order the box carries them. */
function lightsOf(lights: Array<{ key: string, state: string }> | undefined): string[] {
  return (lights === undefined ? [] : lights).map((light) => `${light.key}:${light.state}`)
}

/** Every box a reader can walk to from one box, that box included. */
function reachableFrom(graph: PanelGraph, id: string): Set<string> {
  const seen = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const edge of graph.edges) {
      if (!seen.has(edge.from) || seen.has(edge.to)) continue
      seen.add(edge.to)
      grew = true
    }
  }
  return seen
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

describe('the fork is seven levels, one box a place', () => {
  it('always draws all seven levels, in level order then recorded order', () => {
    const graph = graphOf(twoTaskRun())
    expect(graph.state).toBe('running')
    expect(graph.nodes.map((node) => node.id))
      .toEqual(['start', 'plan', 't1', 't2', 't1_s2', 't1_s3', 't1_s4', 't2_s5', 'sum', 'accept', 'end'])
    expect(graph.nodes.map((node) => node.kind))
      .toEqual(['start', 'plan', 'task', 'task', 'sub', 'sub', 'sub', 'sub', 'summarize', 'accept', 'end'])
    expect(graph.nodes.map((node) => node.level)).toEqual([0, 1, 2, 2, 3, 3, 3, 3, 4, 5, 6])
    expect(graph.nodes.map((node) => node.label))
      .toEqual(['起点', '规划', '任务 1 · 建表', '任务 2 · 写文档', '执行', '执行 · 第 2 遍', '检查', '执行', '汇总', '验收', '终点'])
    // A run that declared nothing still draws the places it has not reached.
    expect(graphOf(waitingRun()).nodes.map((node) => node.id)).toEqual(['start', 'plan', 'sum', 'accept', 'end'])
    expect(graphOf(waitingRun()).nodes.map((node) => node.state))
      .toEqual(['done', 'pending', 'pending', 'pending', 'pending'])
  })

  it('groups the work by the plan task its phase names, one group for the work that names none', () => {
    const graph = graphOf(twoTaskRun())
    // A batch number is read as a number: `任务 10` sorts after `任务 2`.
    const many = graphOf({
      runId: 'r-order',
      name: '任务团队 · 3 个任务',
      anchorSeq: 1,
      members: [
        member(1, '规划助手', '规划', 'completed', 0),
        member(2, '执行', '任务 10 · 最后', 'completed', 1),
        member(3, '执行', '任务 2 · 中间', 'completed', 2),
        member(4, '执行', undefined, 'completed', 3),
        member(5, '检查', undefined, 'completed', 4),
      ],
      details: [],
    })
    expect(many.nodes.filter((node) => node.kind === 'task').map((node) => node.id)).toEqual(['t2', 't10', 'u1'])
    // The group that names no task carries the leg word of its first call, verbatim otherwise.
    expect(many.nodes.filter((node) => node.kind === 'task').map((node) => node.label))
      .toEqual(['任务 2 · 中间', '任务 10 · 最后', '执行'])
    // A task card owns every row of that task, in recorded order.
    expect(boxOf(graph, 't1').calls.map((row) => row.seq)).toEqual([2, 3, 4])
    expect(graph.nodes.filter((node) => node.kind === 'sub').map((node) => node.id))
      .toEqual(['t1_s2', 't1_s3', 't1_s4', 't2_s5'])
  })

  it('marks exactly one box as the reader’s place, and numbers the headline by its level', () => {
    const graph = graphOf(twoTaskRun())
    expect(graph.nodes.filter((node) => node.current).map((node) => node.id)).toEqual(['t2_s5'])
    expect([graph.at, graph.total, graph.remaining]).toEqual([4, 7, 3])
    expect(graph.headline.at).toBe(4)
    expect(graph.headline.total).toBe(7)
    expect(graph.headline.remaining).toBe(3)
    // Nothing declared and nothing ended: the start is where this run is, not the end.
    expect(graphOf(waitingRun()).at).toBe(1)
    // A run that ended stands on the first broken box, else at its end.
    // （统一口径后 stuck.at 与 headline.at 同为读者站位，见本文件 stuck 那节。）
    expect(graphOf(failedRun()).at).toBe(3)
    expect(graphOf(rejectedRun()).at).toBe(5)
    expect(graphOf(finishedRun()).at).toBe(7)
    expect(graphOf(finishedRun()).nodes.filter((node) => node.current).map((node) => node.id)).toEqual(['end'])
  })

  it('draws the edges of the fork, and no others', () => {
    const graph = graphOf(twoTaskRun())
    expect(graph.edges.map((edge) => `${edge.from} -> ${edge.to} (${edge.kind})`)).toEqual([
      'start -> plan (chain)',
      'plan -> t1 (fork)',
      'plan -> t2 (fork)',
      't1 -> t1_s2 (branch)',
      't1_s2 -> sum (join)',
      't1 -> t1_s3 (branch)',
      't1_s3 -> sum (join)',
      't1 -> t1_s4 (branch)',
      't1_s4 -> sum (join)',
      't2 -> t2_s5 (branch)',
      't2_s5 -> sum (join)',
      'sum -> accept (chain)',
      'accept -> end (chain)',
    ])
    const ids = new Set(graph.nodes.map((node) => node.id))
    for (const edge of graph.edges) {
      expect(ids.has(edge.from), edge.from).toBe(true)
      expect(ids.has(edge.to), edge.to).toBe(true)
    }
    // A task that recorded no call at all still reaches the summary.
    const bare = graphOf({
      runId: 'r-bare',
      name: '任务团队 · 1 个任务',
      anchorSeq: 1,
      members: [
        member(1, '规划助手', '规划', 'completed', 0),
        member(2, '执行', '任务 1 · 建表', undefined, 1),
      ],
      details: [],
    })
    expect(bare.nodes.find((node) => node.id === 'sum')!.calls).toEqual([])
    // Every state is one connected picture: a run with no task card has nothing between the
    // plan and the summary, so that gap is closed with one chain edge instead of being left
    // open — a waiting run must not read as two halves that float apart.
    const waiting = graphOf(waitingRun())
    // No task and no branch is drawn, so the picture is the five places the run never leaves.
    expect(waiting.nodes).toHaveLength(5)
    expect(waiting.edges.map((edge) => `${edge.from} -> ${edge.to} (${edge.kind})`)).toEqual([
      'start -> plan (chain)',
      'plan -> sum (chain)',
      'sum -> accept (chain)',
      'accept -> end (chain)',
    ])
    expect(reachableFrom(waiting, 'start').size).toBe(waiting.nodes.length)
    // The same holds for a run whose only rows are a plan call and a summary call.
    const trunk = graphOf({
      runId: 'r-trunk',
      name: '任务团队 · 0 个任务',
      anchorSeq: 1,
      members: [
        member(1, '规划助手', '规划', 'completed', 0),
        member(2, '汇总助手', '汇总', 'completed', 1),
      ],
      details: [],
      stopReason: 'completed',
    })
    expect(trunk.nodes.filter((node) => node.kind === 'task' || node.kind === 'sub')).toEqual([])
    expect(trunk.edges.map((edge) => `${edge.from} -> ${edge.to} (${edge.kind})`)).toEqual([
      'start -> plan (chain)',
      'plan -> sum (chain)',
      'sum -> accept (chain)',
      'accept -> end (chain)',
    ])
    expect(reachableFrom(trunk, 'start').size).toBe(trunk.nodes.length)
    // With a task card present the fork owns that gap: the edge is not emitted at all, and the
    // text says nothing about the plan reaching the summary.
    expect(graph.edges.filter((edge) => edge.from === 'plan' && edge.to === 'sum')).toEqual([])
    expect(progress.panelMermaid(graph)).not.toContain('plan --> sum')
    expect(reachableFrom(graph, 'start').size).toBe(graph.nodes.length)
  })

  it('carries the shipped draft, and the all-rejected verdict on the one summary box', () => {
    expect(graphOf(finishedRun()).final).toEqual({ draft: 1, seq: 5 })
    expect(graphOf(twoTaskRun()).final).toBeUndefined()
    const rejected = boxOf(graphOf(rejectedRun()), 'sum')
    expect(rejected.rejected).toEqual({ drafts: 3, stage: 'check', reason: 'cites "x", which the report lacks' })
    expect(rejected.calls).toEqual([])
    expect(rejected.openable).toBe(true)
    expect(rejected.state).toBe('failed')
  })
})

describe('every row lands in exactly one owning box', () => {
  /** The rows one box owns, counting the plan, the task cards and the summary. */
  function owned(graph: PanelGraph): number[] {
    const seqs = []
    for (const node of graph.nodes) {
      if (node.kind !== 'plan' && node.kind !== 'task' && node.kind !== 'summarize') continue
      for (const row of node.calls) seqs.push(row.seq)
    }
    return seqs.sort((left, right) => left - right)
  }

  it('keeps every declared call, once, and drops no row from the picture', () => {
    for (const run of [twoTaskRun(), finishedRun(), failedRun(), blockedRun(), rejectedRun(), checksRun()]) {
      const declared = run.members.map((row) => row.seq).sort((left, right) => left - right)
      expect(owned(graphOf(run))).toEqual(declared)
    }
  })

  it('gives each branch exactly one row, and the task it hangs under all of them', () => {
    const graph = graphOf(twoTaskRun())
    const subs = graph.nodes.filter((node) => node.kind === 'sub')
    for (const sub of subs) expect(sub.calls).toHaveLength(1)
    expect(subs.map((sub) => sub.calls[0]!.seq)).toEqual([2, 3, 4, 5])
    // The branch knows which card it hangs under, which call it is and which try that was.
    expect(subs.map((sub) => sub.subtask)).toEqual([
      { taskId: 't1', taskNumber: 1, seq: 2, leg: 'execute', attempt: 1 },
      { taskId: 't1', taskNumber: 1, seq: 3, leg: 'execute', attempt: 2 },
      { taskId: 't1', taskNumber: 1, seq: 4, leg: 'check', attempt: 1 },
      { taskId: 't2', taskNumber: 2, seq: 5, leg: 'execute', attempt: 1 },
    ])
    // Every branch is openable: one row is one call a reader can read.
    for (const sub of subs) expect(sub.openable).toBe(true)
    // The retry prints its number, the first try does not.
    expect(subs.map((sub) => sub.label))
      .toEqual(['执行', '执行 · 第 2 遍', '检查', '执行'])
    expect(subs.map((sub) => sub.state)).toEqual(['failed', 'done', 'done', 'doing'])
  })

  it('keeps a row that names no leg in the box the run had already reached', () => {
    // The guardian's own call is not a leg of the work, and it owns no box at all.
    const guarded = graphOf(guardianRun())
    expect(owned(guarded)).toEqual([1])
    const middle = graphOf({
      runId: 'r-middle',
      name: '任务团队 · 1 个任务',
      anchorSeq: 1,
      members: [
        member(1, '规划助手', '规划', 'completed', 0),
        member(2, '执行', '任务 1 · 建表', 'completed', 1),
        member(3, '随手一笔', undefined, 'completed', 2),
        member(4, '检查', '任务 1 · 建表', 'completed', 3),
        member(5, '汇总助手', '汇总', 'completed', 4),
        member(6, '收尾一句', undefined, 'completed', 5),
      ],
      details: [],
      stopReason: 'completed',
    })
    expect(owned(middle)).toEqual([1, 2, 3, 4, 5, 6])
    expect(boxOf(middle, 'plan').calls.map((row) => row.seq)).toEqual([1])
    expect(boxOf(middle, 't1').calls.map((row) => row.seq)).toEqual([2, 3, 4])
    expect(boxOf(middle, 'sum').calls.map((row) => row.seq)).toEqual([5, 6])
    // The branch that names no leg speaks its own label, untranslated and un-shortened.
    expect(boxOf(middle, 't1_s3').label).toBe('随手一笔')
  })
})

describe('the six rings of a task, and the five checks of the run', () => {
  it('folds the three work lights from the task’s own rows, and prints its own name verbatim', () => {
    const graph = graphOf(twoTaskRun())
    expect(lightsOf(boxOf(graph, 't1').rings))
      .toEqual(['plan:done', 'execute:done', 'check:done', 'review:pending', 'accept:pending', 'summarize:pending'])
    expect(lightsOf(boxOf(graph, 't2').rings))
      .toEqual(['plan:done', 'execute:doing', 'check:pending', 'review:pending', 'accept:pending', 'summarize:pending'])
    // Every task carries six lights and only the task cards carry them.
    for (const node of graph.nodes.filter((box) => box.kind === 'task')) expect(node.rings).toHaveLength(6)
    for (const node of graph.nodes.filter((box) => box.kind !== 'task')) expect(node.rings).toBeUndefined()
    // A task's own title is the phase the recorder wrote: nothing translates or shortens it.
    expect(progress.panelMermaid(graphOf(twoTaskRun(), en))).toContain('  t1("任务 1 · 建表")')
  })

  it('lights the acceptance of a task only when both of its gates passed', () => {
    const done = graphOf(finishedRun())
    expect(lightsOf(boxOf(done, 't1').rings))
      .toEqual(['plan:done', 'execute:done', 'check:done', 'review:done', 'accept:done', 'summarize:done'])
    // One broken gate holds the card whatever the other one says.
    const failed = graphOf(failedRun())
    expect(lightsOf(boxOf(failed, 't1').rings).slice(2, 5)).toEqual(['check:failed', 'review:pending', 'accept:failed'])
    // Both gates settled without a failure is the only way to green it: a gate nobody ran is
    // not a gate that passed.
    const half = graphOf(twoTaskRun())
    expect(lightsOf(boxOf(half, 't1').rings)[2]).toBe('check:done')
    expect(lightsOf(boxOf(half, 't1').rings)[4]).toBe('accept:pending')
  })

  it('carries the plan light and the summary light of the run on every card', () => {
    const graph = graphOf(twoTaskRun())
    const plans = graph.nodes.filter((node) => node.kind === 'task').map((node) => lightsOf(node.rings)[0])
    expect(new Set(plans)).toEqual(new Set(['plan:done']))
    // The summary failed while the run did: every card says so, without the card failing.
    const rejected = graphOf(rejectedRun())
    expect(lightsOf(boxOf(rejected, 't1').rings)[5]).toBe('summarize:failed')
    expect(boxOf(rejected, 't1').state).toBe('done')
  })

  it('does not colour a recovered failure as a failure, in a ring or in the stuck verdict', () => {
    expect(lightsOf(boxOf(graphOf(recoveredRun()), 't1').rings).slice(1, 3))
      .toEqual(['execute:done', 'check:done'])
    expect(graphOf(recoveredRun()).stuck).toBeUndefined()
    // The branch keeps its own red mark — that is the call that failed — and the card is green.
    expect(boxOf(graphOf(recoveredRun()), 't1_s2').state).toBe('failed')
    expect(boxOf(graphOf(recoveredRun()), 't1').state).toBe('done')
  })

  it('lights the five checks from the rows that reported them, and from nothing else', () => {
    const graph = graphOf(checksRun())
    expect(lightsOf(graph.checks))
      .toEqual(['machine:done', 'model:done', 'isolated:doing', 'human:done', 'ledger:failed'])
    // The same five live on the acceptance card, in the same order.
    expect(lightsOf(boxOf(graph, 'accept').checks)).toEqual(lightsOf(graph.checks))
    // Nothing reported, nothing lit: the page never ticks a verification nobody ran.
    expect(lightsOf(graphOf(waitingRun()).checks))
      .toEqual(['machine:pending', 'model:pending', 'isolated:pending', 'human:pending', 'ledger:pending'])
    // A failure a later attempt of the same screen replaced is not a current failure.
    expect(lightsOf(graphOf(recoveredCheckRun()).checks)[4]).toBe('ledger:done')
    // A Latin word is matched by its stem, because the runs write `reconciliation`.
    expect(lightsOf(graphOf(latinLedgerRun()).checks)[4]).toBe('ledger:done')
    // The check gate and the review gate are the leg table's, so a phase never lights them.
    expect(lightsOf(graphOf(latinLedgerRun()).checks)[0]).toBe('machine:pending')
  })
})

describe('the remaining time is measured by level, never invented', () => {
  it('says nothing when no level was measured', () => {
    expect(graphOf(waitingRun()).headline.eta).toBeUndefined()
    // The plan row cannot be dated, so its level is not measured, and no other level is done.
    expect(graphOf(etaGapRun()).headline.eta).toBeUndefined()
  })

  it('averages the measured level spans and multiplies by the levels still ahead', () => {
    // The plan level took 20 s, and three levels are still ahead of the reader.
    expect(graphOf(twoTaskRun()).headline.eta).toEqual({ ms: 60_000, basis: 1 })
    // Three levels measured at 20 s each, two levels left: the mean is per level, not per row.
    expect(graphOf(rejectedRun()).headline.eta).toEqual({ ms: 40_000, basis: 3 })
  })

  it('counts the basis in levels, matching the tooltip copy', () => {
    // Why this assertion exists: `progressPanelEta` counts one basis unit per measured level
    // span, not per call or task. The tooltip copy must name that same unit ("levels"/"层"),
    // or the reader is told the number rests on something it was never measured from.
    const running = graphOf(twoTaskRun())
    expect(running.nodes.filter((node) => node.state === 'done' && node.calls.length > 0).length)
      .toBeGreaterThanOrEqual(running.headline.eta?.basis ?? 0)
    expect(running.headline.eta?.basis).toBe(1)
    expect(graphOf(rejectedRun()).headline.eta?.basis).toBe(3)
    expect(zh('progress.panel.etaBasis', { n: 2 })).toBe('按 2 个已完成层的实测耗时推算')
    expect(en('progress.panel.etaBasis', { n: 2 })).toBe('from the 2 finished levels actually measured')
  })

  it('says nothing when there is nothing left to walk', () => {
    expect(graphOf(finishedRun()).remaining).toBe(0)
    expect(graphOf(finishedRun()).headline.eta).toBeUndefined()
  })
})

describe('the mermaid text is the structure', () => {
  it('writes `flowchart LR`, one node a line, then one edge a line, two-space indented', () => {
    expect(progress.panelMermaid(graphOf(twoTaskRun()))).toBe([
      'flowchart LR',
      '  start(["起点"])',
      '  plan(["规划"])',
      '  t1("任务 1 · 建表")',
      '  t2("任务 2 · 写文档")',
      '  t1_s2["执行"]',
      '  t1_s3["执行 · 第 2 遍"]',
      '  t1_s4["检查"]',
      '  t2_s5["执行"]',
      '  sum(["汇总"])',
      '  accept(["验收"])',
      '  finish(["终点"])',
      '  start --> plan',
      '  plan --> t1',
      '  plan --> t2',
      '  t1 --> t1_s2',
      '  t1_s2 --> sum',
      '  t1 --> t1_s3',
      '  t1_s3 --> sum',
      '  t1 --> t1_s4',
      '  t1_s4 --> sum',
      '  t2 --> t2_s5',
      '  t2_s5 --> sum',
      '  sum --> accept',
      '  accept --> finish',
    ].join('\n'))
  })

  it('writes the end box as `finish`, because `end` closes a subgraph', () => {
    // The one word the text may not use is renamed in the text only: the model, the DOM hook
    // and every wire keep calling that box `end`.
    const text = progress.panelMermaid(graphOf(twoTaskRun()))
    expect(text).toContain('  finish(["终点"])')
    expect(text.split('\n').filter((line) => line.trim().startsWith('end'))).toEqual([])
    expect(graphOf(twoTaskRun()).nodes.map((node) => node.id)).toContain('end')
  })

  it('round-trips through the parser to exactly the drawn boxes, wires and shapes', () => {
    const graph = graphOf(twoTaskRun())
    const parsed = progress.parsePanelMermaid(graph.mermaid)
    expect(parsed.direction).toBe('LR')
    expect(parsed.nodes.map((node) => node.id))
      .toEqual(['start', 'plan', 't1', 't2', 't1_s2', 't1_s3', 't1_s4', 't2_s5', 'sum', 'accept', 'finish'])
    expect(parsed.nodes.map((node) => node.shape)).toEqual([
      'stadium', 'stadium', 'round', 'round', 'rect', 'rect', 'rect', 'rect', 'stadium', 'stadium', 'stadium',
    ])
    // Labels come back unescaped, which is what makes the round trip a round trip.
    expect(parsed.nodes.map((node) => node.label)).toEqual(graph.nodes.map((node) => node.label))
    expect(parsed.edges.length).toBe(graph.edges.length)
    expect(parsed.edges.map((edge) => `${edge.from}->${edge.to}`))
      .toEqual(graph.edges.map((edge) => `${edge.from}->${edge.to.replace('end', 'finish')}`))
  })

  it('keeps the lights out of the text, and one label on one line', () => {
    const text = progress.panelMermaid(graphOf(checksRun()))
    // The rings and the checks are decoration: the text is boxes and wires, nothing else.
    for (const word of [zh('progress.panel.rings'), zh('progress.panel.checks'), zh('progress.verify.machine')]) {
      expect(text).not.toContain(word)
    }
    expect(text.split('\n').filter((line) => line.trim() === '')).toEqual([])
    const run = twoTaskRun()
    run.members[1]!.phase = '任务 1 · 引用 "x"\n第二行'
    const quoted = progress.panelMermaid(graphOf(run))
    expect(quoted).toContain('  t1("任务 1 · 引用 #quot;x#quot; 第二行")')
    expect(quoted.split('\n').filter((line) => line.includes('t1('))).toHaveLength(1)
  })
})

describe('a replan only adds the picture it walked', () => {
  it('gains the task, its branches and their wires, and changes nothing else', () => {
    const before = graphOf(finishedRun())
    const after = graphOf(replannedRun())
    expect(after.nodes.map((node) => node.id))
      .toEqual(['start', 'plan', 't1', 't3', 't1_s2', 't1_s3', 't1_s4', 't3_s6', 't3_s7', 'sum', 'accept', 'end'])
    // Every box the first picture drew is the same box, field for field.
    const added = (id: string) => id === 't3' || id.startsWith('t3_s')
    const kept = after.nodes.filter((node) => !added(node.id))
    expect(kept).toEqual(before.nodes)
    // The same holds for the wires: the new ones are the fork, the two branches and their joins.
    const newEdges = after.edges.filter((edge) => added(edge.from) || added(edge.to))
    expect(newEdges.map((edge) => `${edge.from} -> ${edge.to} (${edge.kind})`)).toEqual([
      'plan -> t3 (fork)',
      't3 -> t3_s6 (branch)',
      't3_s6 -> sum (join)',
      't3 -> t3_s7 (branch)',
      't3_s7 -> sum (join)',
    ])
    expect(after.edges.filter((edge) => !newEdges.includes(edge))).toEqual(before.edges)
    // The text gains exactly the new boxes and wires, line for line.
    const lines = (graph: PanelGraph) => new Set(graph.mermaid.split('\n'))
    expect([...lines(after)].filter((line) => !lines(before).has(line)).sort()).toEqual([
      '  plan --> t3',
      '  t3 --> t3_s6',
      '  t3 --> t3_s7',
      '  t3("任务 3 · 部署")',
      '  t3_s6 --> sum',
      '  t3_s7 --> sum',
      '  t3_s6["执行"]',
      '  t3_s7["检查"]',
    ].sort())
    // The state of the run it drew, and the place it stands on, are the same facts.
    expect([after.state, after.at, after.remaining]).toEqual([before.state, before.at, before.remaining])
  })
})

describe('where the run is stuck, if it is', () => {
  it('names the card holding the failure that is still current, and never calls a cancelled run stuck', () => {
    // The card owns its own rows, so it can say which call broke and which try that was.
    expect(graphOf(failedRun()).stuck)
      .toEqual({ nodeId: 't1', at: 3, kind: 'failed', role: '检查', attempt: 1 })
    // A run that ended over a call nobody settled is blocked at the card that held it,
    // but the number it reports is the reader's step (branch level), one口径 with the headline.
    expect(graphOf(blockedRun()).stuck).toEqual({ nodeId: 't1', at: 4, kind: 'blocked' })
    // A gate that turned every draft back is the third verdict, and it rides the summary.
    expect(graphOf(rejectedRun()).stuck).toEqual({ nodeId: 'sum', at: 5, kind: 'rejected', drafts: 3 })
    // Neither a cancellation nor a failure a retry replaced is "stuck".
    expect(graphOf(cancelledRun()).stuck).toBeUndefined()
    expect(graphOf(recoveredRun()).stuck).toBeUndefined()
    expect(graphOf(twoTaskRun()).stuck).toBeUndefined()
  })
})

describe('the dock keeps one button', () => {
  it('offers the start button, and no acceptance click on a finished run', () => {
    const fill = () => true
    const waiting = pageOf(waitingRun(), { fillDraft: fill })()
    expect(attr(hookOf(waiting, 'data-gw-progress-dock'), 'data-state')).toBe('start')
    expect(textOf(hookOf(waiting, 'data-gw-progress-dock-fill'))).toBe(zh('progress.dock.start'))
    // The acceptance click is gone with the panel it belonged to: a finished run asks for no
    // click at all, and the word the button carried is in neither dictionary.
    const done = pageOf(finishedRun(), { fillDraft: fill })()
    expect(hooksOf(done, 'data-gw-progress-dock-fill')).toHaveLength(0)
    expect(texts(done)).not.toContain('收下这版')
    expect(Object.keys(bundle.GROK_WORKFLOW_DICT.zh ?? {})).not.toContain('progress.dock.accept')
    // A run that is still working asks for no click either.
    expect(hooksOf(pageOf(twoTaskRun(), { fillDraft: fill })(), 'data-gw-progress-dock-fill')).toHaveLength(0)
    // The one button stops at the input box, and a shell that cannot write it offers none.
    expect(hooksOf(pageOf(waitingRun())(), 'data-gw-progress-dock-fill')).toHaveLength(0)
  })
})
