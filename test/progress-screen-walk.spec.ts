import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Screen-reader walk (NVDA / VoiceOver automation equivalent), pinned red-first.
 *
 * The "progress" page is one task panel read top to bottom. A reader hears, in order:
 * run name + state chip -> step sentence -> task sentence -> the figure (one group) ->
 * per-card buttons (name + state, expandable) -> the opened sheet (its own region, whose
 * list names the card it belongs to) -> the stuck line, when the run is stuck.
 *
 * Every assertion below names an announcement the tree must carry. They are written
 * against the tree as it is today, so they fail today (red) and pass once the minimal
 * attributes land (green). No behaviour, copy, CSS or fixture changes here.
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

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

function hooksOf(tree: unknown, name: string): Element[] {
  return walk(tree).filter((element) => Object.prototype.hasOwnProperty.call(element.props, name))
}

function hookOf(tree: unknown, name: string): Element {
  const found = hooksOf(tree, name)[0]
  expect(found, `no element carries ${name}`).toBeDefined()
  return found!
}

function attr(element: Element, name: string): string | undefined {
  const value = element.props[name]
  if (value === undefined || value === null) return undefined
  return String(value)
}

function loadBundle(): any {
  let registration: { id: string, factory: (require: (id: string) => unknown) => any } | undefined
  const record = globalThis as unknown as { window?: unknown }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec: never) => { registration = spec } } }
  try {
    new Function(SOURCE)()
  } finally {
    record.window = previous
  }
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
      const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
      return typeof type === 'function' ? (type as (value: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => {
      const cells = (globalThis as any).__walkCells as { index: number, cells: unknown[] } | undefined
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
    throw new Error('the bundle must not require ' + id + ' at load time')
  })
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

const BASE = new Date(2026, 10, 25, 8, 2).getTime()

function member(seq: number, label: string, taskTitle: string, outcome?: string): any {
  return {
    seq,
    label,
    phase: taskTitle,
    childId: 'child-' + seq,
    order: seq - 1,
    startedAt: BASE + seq * 60_000,
    endedAt: BASE + seq * 60_000 + 20_000,
    ...(outcome === undefined ? {} : { outcome }),
  }
}

function runOf(name: string, members: any[], extra: Record<string, unknown> = {}): any {
  return { runId: 'r-' + name, name: 'RENAMED-' + name, anchorSeq: 1, members, details: [], ...extra }
}

function waitingRun(): any {
  return runOf('wait', [])
}

function runningRun(): any {
  return runOf('run', [
    member(1, 'X-plan-runner', 'X-plan-runner', 'completed'),
    member(2, 'X-do', 'X-task 1', 'failed'),
    member(3, 'X-do', 'X-task 1', 'completed'),
    member(4, 'X-do', 'X-task 2'),
  ])
}

function doneRun(): any {
  return runOf('done', [
    member(1, 'X-plan-runner', 'X-plan-runner', 'completed'),
    member(2, 'X-do', 'X-task 1', 'completed'),
    member(3, 'X-check', 'X-task 1', 'completed'),
    member(4, 'X-sum-1', 'X-sum', 'completed'),
  ], { stopReason: 'completed', summaryFinalDraft: 1 })
}

function failedRun(): any {
  return runOf('failed', [
    member(1, 'X-plan-runner', 'X-plan-runner', 'completed'),
    member(2, 'X-do', 'X-task 1', 'failed'),
    member(3, 'X-do-again', 'X-task 1', 'failed'),
  ], { stopReason: 'error' })
}

function pageOf(run: any): unknown {
  const snapshot = { runs: [run], activeRun: run }
  return progress.component({
    t: zh, progressT: zh,
    useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
  })
}

function mount(run: any): () => unknown {
  const cells: unknown[] = []
  const snapshot = { runs: [run], activeRun: run }
  return () => {
    const g = globalThis as any
    const before = g.__walkCells
    const local = { index: 0, cells }
    g.__walkCells = local
    try {
      return progress.component({
        t: zh, progressT: zh,
        useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
      })
    } finally {
      g.__walkCells = before
    }
  }
}

function openableIdOf(run: any): string {
  const graph = progress.derivePanelGraph(run, zh)
  const openable = graph.nodes.filter((node: any) => node.openable).map((node: any) => node.id)
  expect(openable.length).toBeGreaterThan(0)
  return openable[0]!
}

function clickNode(view: () => unknown, id: string): unknown {
  const page = view()
  const node = hooksOf(page, 'data-gw-progress-pnode').find((element) => attr(element, 'data-gw-progress-pnode') === id)
  expect(node, 'the page drew no node ' + id).toBeDefined()
  const body = walk(node!).find((element) => String((element.props['className'] as string) ?? '').split(/\s+/).includes('gw-progress-pnode-body'))
  expect(body, 'node ' + id + ' has no body').toBeDefined()
  expect(body!.type, 'node ' + id + ' is not a control').toBe('button')
  ;(body!.props['onClick'] as () => void)()
  return view()
}

describe('screen-reader walk: landmarks, names and reading order', () => {
  it('names the run on the header so the reader knows whose page this is', () => {
    for (const run of [waitingRun(), runningRun(), doneRun()]) {
      const bar = hookOf(pageOf(run), 'data-gw-progress-bar')
      expect(attr(bar, 'aria-label')).toBe(run.name)
    }
  })

  it('announces the figure as one labelled group on entry', () => {
    for (const run of [waitingRun(), runningRun(), doneRun()]) {
      const graph = hookOf(pageOf(run), 'data-gw-progress-graph')
      expect(attr(graph, 'role')).toBe('group')
      expect(attr(graph, 'aria-label')).toContain(run.name)
    }
  })

  it('announces the opened sheet as its own region, naming the card it belongs to', () => {
    const run = runningRun()
    const id = openableIdOf(run)
    const opened = clickNode(mount(run), id)
    const sheet = hookOf(opened, 'data-gw-progress-sheet')
    expect(attr(sheet, 'role')).toBe('region')
    expect(attr(sheet, 'aria-label')).toBeTruthy()
  })

  it('gives the opened list an identity that matches the card that opened it', () => {
    const run = runningRun()
    const id = openableIdOf(run)
    const opened = clickNode(mount(run), id)
    const list = hookOf(opened, 'data-gw-progress-node-calls')
    const bodies = walk(opened).filter((element) =>
      String((element.props['className'] as string) ?? '').split(/\s+/).includes('gw-progress-pnode-body') &&
      element.props['data-gw-progress-pnode-open'] === id)
    expect(bodies).toHaveLength(1)
    expect(attr(bodies[0]!, 'aria-controls')).toBe('gw-progress-calls-' + id)
    expect(attr(list, 'aria-label')).toBeTruthy()
  })

  it('reads the stuck sentence as one atomic live status', () => {
    const page = pageOf(failedRun())
    const stuck = hookOf(page, 'data-gw-progress-stuck')
    expect(attr(stuck, 'role')).toBe('status')
    expect(attr(stuck, 'aria-atomic')).toBe('true')
  })
})
