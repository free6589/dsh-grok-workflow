import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * soak-gaps responsive guards (fix/soak-gaps).
 *
 * mobile-overlap covered one-row sheets at 390/360 and desktop at 1500, but five
 * responsive seams still have no component guard: the four-row sheet, the 720/721
 * breakpoint boundary, cross-breakpoint drag (matchMedia change), two open groups at
 * once, and the 421-499 width band. True pixels stay with the soak block; these are
 * constructed-DOM guards only, and they change no product behaviour.
 *
 * Current behaviour (read off src/client/index.js, DESIGN-progress-tab.md section 26):
 * the sheet is the one box at every width (always on, no matchMedia read in JS,
 * the stylesheet keeps its own 720 and 480 copies only for wrapping). So every guard
 * below pins the width-independent sheet contract at the widths and edges the soak
 * did not measure.
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }
type Cells = { index: number, cells: unknown[] }

let rendering: Cells | undefined

interface ProgressRun {
  runId: string
  name: string
  anchorSeq: number
  members: ProgressMember[]
  details: unknown[]
  stopReason?: string
}

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

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Record<string, string>>
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => (key: string) => string }
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    derivePanelGraph: (run: ProgressRun, t?: (key: string) => string) => { nodes: Array<{ id: string, openable: boolean }> }
    revealSheet: (box?: unknown) => void
  }
}

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
    throw new Error('the bundle must not require another module at load time')
  })
}

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

function textOf(node: unknown): string {
  return texts(node).join(' ').trim()
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

function classesOf(element: Element): string[] {
  const value = element.props['className']
  return typeof value === 'string' ? value.split(/\s+/).filter((token) => token !== '') : []
}

function mediaBlock(query: string): string {
  const css = bundle.GROK_WORKFLOW_PROGRESS.css
  const at = css.indexOf('@media (' + query + ')')
  return at === -1 ? '' : css.slice(at)
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

const BASE = new Date(2026, 10, 25, 8, 2).getTime()

function member(seq: number, label: string, phase: string, outcome?: string): ProgressMember {
  return {
    seq,
    label,
    phase,
    childId: 'child-' + seq,
    order: seq - 1,
    startedAt: BASE + seq * 60_000,
    endedAt: BASE + seq * 60_000 + 20_000,
    ...outcome === undefined ? {} : { outcome },
  }
}

function runOf(members: ProgressMember[]): ProgressRun {
  return { runId: 'r-soak', name: 'task team soak', anchorSeq: 1, members, details: [] }
}

/** Four numbered tasks, one settled call each: four openable groups. */
function fourTaskRun(): ProgressRun {
  return runOf([
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '任务 1 · 建表', 'completed'),
    member(3, '执行', '任务 2 · 写文档', 'completed'),
    member(4, '执行', '任务 3 · 联调', 'completed'),
    member(5, '执行', '任务 4 · 上线', 'completed'),
  ])
}

/** Two numbered tasks: two openable groups for the dual-open guard. */
function twoTaskRun(): ProgressRun {
  return runOf([
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '任务 1 · 建表', 'failed'),
    member(3, '执行', '任务 1 · 建表', 'completed'),
    member(4, '执行', '任务 2 · 写文档', 'completed'),
  ])
}

function mount(run: ProgressRun) {
  const cells: unknown[] = []
  const snapshot = { runs: [run], activeRun: run }
  const props = {
    t: zh,
    progressT: zh,
    useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
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

function bodyOf(page: unknown, id: string): Element {
  const node = hooksOf(page, 'data-gw-progress-pnode').find((element) => attr(element, 'data-gw-progress-pnode') === id)
  expect(node, 'the page drew no node ' + id).toBeDefined()
  const body = walk(node!).find((element) => classesOf(element).includes('gw-progress-pnode-body'))
  expect(body, 'node ' + id + ' has no body').toBeDefined()
  return body!
}

function clickNode(view: () => unknown, id: string): unknown {
  const body = bodyOf(view(), id)
  expect(body.type, 'node ' + id + ' is not a control').toBe('button')
  ;(body.props['onClick'] as () => void)()
  return view()
}

describe('soak-gaps responsive guards', () => {
  it('four-row sheet: four groups stay ordered, scroll-capped, with the bottom room', () => {
    // The soak only ever opened one row. Four open groups must still sit in one
    // capped sheet: four groups in click order, the sheet keeps its one scroll,
    // and the 35vh room follows the dock.
    const view = mount(fourTaskRun())
    clickNode(view, 't1')
    clickNode(view, 't2')
    clickNode(view, 't3')
    const page = clickNode(view, 't4')
    const sheet = hookOf(page, 'data-gw-progress-sheet')
    const lists = hooksOf(sheet, 'data-gw-progress-node-calls')
    expect(lists.map((list) => attr(list, 'data-gw-progress-node-calls'))).toEqual(['t1', 't2', 't3', 't4'])
    for (const list of lists) expect(attr(list, 'id')).toBe('gw-progress-calls-' + attr(list, 'data-gw-progress-node-calls'))
    expect(progress.css).toContain('max-height: min(50vh, 240px)')
    expect(progress.css).toContain('overflow-y: auto')
    const order = walk(page)
    const room = order.filter((element) => classesOf(element).includes('gw-progress-sheet-room'))
    expect(room).toHaveLength(1)
    expect(order.indexOf(room[0]!)).toBeGreaterThan(order.indexOf(hookOf(page, 'data-gw-progress-dock')))
    expect(room[0]!.props['aria-hidden']).toBe('true')
    expect(texts(room[0]!)).toEqual([])
  })

  it('720/721 single pixel: the sheet contract is identical on both sides of the seam', () => {
    // max-width 720 includes exactly 720; the figure stacks only strictly below 720.
    // 720 is therefore the "rows but sheet" slot by design. Both widths share the one
    // sheet box now, so the contract must read the same from either side of the seam:
    // sheet after the figure and before the dock, groups in click order, same ids.
    const readAt = (width: number) => {
      void width
      const view = mount(twoTaskRun())
      clickNode(view, 't1')
      const page = clickNode(view, 't2')
      const order = walk(page)
      const atIndex = (element: Element) => order.indexOf(element)
      expect(atIndex(hookOf(page, 'data-gw-progress-sheet'))).toBeGreaterThan(atIndex(hookOf(page, 'data-gw-progress-graph')))
      expect(atIndex(hookOf(page, 'data-gw-progress-dock'))).toBeGreaterThan(atIndex(hookOf(page, 'data-gw-progress-sheet')))
      expect(hooksOf(hookOf(page, 'data-gw-progress-sheet'), 'data-gw-progress-node-calls')
        .map((list) => attr(list, 'data-gw-progress-node-calls'))).toEqual(['t1', 't2'])
      return page
    }
    const at720 = readAt(720)
    const at721 = readAt(721)
    // Same groups, same order, same bodies: the one-pixel step changes nothing.
    expect(hooksOf(at720, 'data-gw-progress-node-calls').map(textOf))
      .toEqual(hooksOf(at721, 'data-gw-progress-node-calls').map(textOf))
    expect(mediaBlock('max-width: 720px')).not.toBe('')
  })

  it('drag across the breakpoint: no JS media read, so a drag cannot strand the list', () => {
    // The old seam was a matchMedia max-width 720 query plus a change listener.
    // There is nothing left to pick by width (one sheet everywhere), so JS must not
    // ask the shell about the width at all: no read means no stale read after a drag.
    const queries: string[] = []
    const record = globalThis as unknown as { matchMedia?: (query: string) => unknown }
    const previous = record.matchMedia
    let calls = 0
    record.matchMedia = (query: string) => {
      calls += 1
      queries.push(query)
      return { media: query, matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }
    }
    try {
      const view = mount(twoTaskRun())
      view()
      clickNode(view, 't1')
    } finally {
      if (previous === undefined) delete record.matchMedia
      else record.matchMedia = previous
    }
    expect(calls).toBe(0)
    expect(queries).toEqual([])
    expect(SOURCE).not.toContain('matchMedia(')
  })

  it('dual open: two open groups keep click order, ids and the shared close', () => {
    // Two open groups were never verified together. They must read in click order,
    // keep the ids the nodes' aria-controls names, and close together from the sheet.
    const view = mount(twoTaskRun())
    clickNode(view, 't1')
    const both = clickNode(view, 't2')
    const sheet = hookOf(both, 'data-gw-progress-sheet')
    expect(hooksOf(sheet, 'data-gw-progress-node-calls').map((list) => attr(list, 'data-gw-progress-node-calls')))
      .toEqual(['t1', 't2'])
    expect(hooksOf(both, 'data-gw-progress-node-calls').map((list) => attr(list, 'id')))
      .toEqual(['gw-progress-calls-t1', 'gw-progress-calls-t2'])
    expect(attr(bodyOf(both, 't1'), 'aria-controls')).toBe('gw-progress-calls-t1')
    expect(attr(bodyOf(both, 't2'), 'aria-controls')).toBe('gw-progress-calls-t2')
    ;(hookOf(both, 'data-gw-progress-sheet-hide').props['onClick'] as () => void)()
    const closed = view()
    expect(hooksOf(closed, 'data-gw-progress-sheet')).toHaveLength(0)
    expect(hooksOf(closed, 'data-gw-progress-node-calls')).toHaveLength(0)
    expect(attr(bodyOf(closed, 't1'), 'aria-expanded')).toBe('false')
    expect(attr(bodyOf(closed, 't2'), 'aria-expanded')).toBe('false')
  })

  it('421-499 band: the sheet keeps the clock column the float drops', () => {
    // 421-499px was never measured. This band sits between the 390/360 soak and the
    // 480px rule, so the guard pins the contract, not pixels: the sheet is the one box
    // (position static, no second scroll), and at and below 480 it keeps the clock column.
    const view = mount(twoTaskRun())
    const page = clickNode(view, 't1')
    expect(hooksOf(page, 'data-gw-progress-sheet')).toHaveLength(1)
    expect(progress.css).toContain('.gw-progress-sheet .gw-progress-node-calls')
    const listRule = progress.css.split('\n').find((line) => line.includes('.gw-progress-sheet .gw-progress-node-calls {'))
    expect(listRule).toContain('position: static')
    expect(listRule).toContain('overflow-y: visible')
    const small = mediaBlock('max-width: 480px')
    expect(small).toContain('.gw-progress-sheet .gw-progress-log-row')
    expect(small).toContain('grid-template-columns: 40px minmax(0, 1fr) auto auto')
    expect(small).toContain('.gw-progress-sheet .gw-progress-log-time')
    expect(small).toContain('display: inline')
  })

  it('sheet reveal: centered, and never throws without a box', () => {
    // The centering fix (block center plus the 35vh room) is what keeps the sheet out
    // from behind the shell's pinned composer at phone heights. Pin the parameter and
    // the guard: no box, null, or a host without layout must not throw.
    const asked: unknown[] = []
    progress.revealSheet({ scrollIntoView: (options: unknown) => { asked.push(options) } })
    expect(asked).toEqual([{ block: 'center' }])
    progress.revealSheet(undefined)
    progress.revealSheet(null)
    progress.revealSheet({})
    expect(asked).toHaveLength(1)
  })
})
