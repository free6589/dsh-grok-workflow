import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The progress page is one flowchart: a header, a row of nodes with the ends around them,
 * a measured wire layer behind them, the Guardian card, a count line and the dock.
 *
 * The one-page contract (`.tmp/flowchart-contract.md`) settles *what* the page says; this
 * file settles *how it is laid out* and *how it is coloured*, and it is written against the
 * contract, not against the page it found. Five things are pinned here:
 *
 * 1. **One column of reading.** `div.gw-progress-flow` holds the wire layer and the node
 *    list; the Guardian panel is its sibling, and there is no second column anywhere.
 * 2. **One node per leg.** Each `li.gw-progress-node` carries `data-kind`, `data-state`,
 *    `data-ordinal` and `data-current`, and its visible words are the leg word and — when
 *    the visit is worth printing — its badge.
 * 3. **A node opens its own calls.** The toggle carries `aria-expanded` and
 *    `aria-controls`; the opened list draws the same rows the page always drew, with the
 *    clock, the gate chip, the word and the capsule. The two hooks are per node.
 * 4. **Measured wires, never invented.** `svg.gw-progress-wires` is `aria-hidden`, painted
 *    behind the nodes, and drawn from positions measured after layout: a host with no
 *    layout (this stub) gets an empty layer instead of coordinates nobody saw.
 * 5. **Colour is the state.** Each state has exactly one `--dsw-alias-*` token, the
 *    unreached node is the only dashed one, the current one is the only one that moves, and
 *    no rule on the page carries a literal colour, an error token or a sideways scroller.
 *
 * The bundle is loaded the way the host loads it (a stub `__ModuleLoader__` and a stub
 * React), but the hook set here is **stateful**: a click has to be a real second render, or
 * "the node opens" would be a claim about a tree nobody re-drew.
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

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    fold: (records: ReadonlyArray<Record<string, unknown>>) => ProgressRun[]
    /** The wire layer's maths, driven with measured boxes so the geometry is testable. */
    measureWires: (flow: unknown) => { width: number, height: number, paths: Array<Array<[number, number]>> }
    deriveProgressFlow: (run: ProgressRun) => {
      state: string
      nodes: Array<{ key: string, kind: string, ordinal: number, state: string }>
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
 * The progress tab reads no host service: its run facts arrive through `useGrokProgress`,
 * so the stub only has to be shaped like the hooks the page touches. The one thing it must
 * do for real is remember a cell: a node's toggle writes state, and a no-op setter would
 * make every "after the click" assertion a photograph of the tree before it. `useEffect`
 * never runs here, which is also the statement that a host without layout measures nothing.
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
      // Outside a render there is no cell to keep, so the hook degrades to a constant.
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

/** One line of the scoped stylesheet that declares a rule (an at-rule is not a rule). */
function ruleOf(selector: string): string | undefined {
  return progress.css.split('\n').find((line) => line.trim().startsWith(`${selector} {`))
}

/** Every class token the stylesheet styles, one per selector. */
function styledClasses(): string[] {
  const tokens = new Set<string>()
  for (const line of progress.css.split('\n')) {
    if (!line.includes('{') || line.trim().startsWith('@')) continue
    const selector = line.slice(0, line.indexOf('{'))
    for (const match of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) tokens.add(match[1]!)
  }
  return [...tokens]
}

/** The rule line that declares one selector, whether it stands alone or in a group. */
function ruleWith(selector: string): string | undefined {
  return progress.css.split('\n').find((line) => {
    if (line.trim().startsWith('@')) return false
    const at = line.indexOf('{')
    if (at === -1) return false
    return line.slice(0, at).split(',').map((part) => part.trim()).includes(selector)
  })
}

/** The stylesheet from one media query on, or `''` when the query is not there. */
function mediaBlock(query: string): string {
  const at = progress.css.indexOf(`@media (${query})`)
  return at === -1 ? '' : progress.css.slice(at)
}

/**
 * Local wall-clock base of every fixture.
 *
 * Built from local components on purpose: a call line prints the clock in the reader's own
 * zone, so a UTC epoch would make the expected string depend on the machine.
 */
const BASE = new Date(2026, 10, 25, 8, 2).getTime()

/** The clock a call starting at one session time prints (`8:03`). */
function clockAt(at: number): string {
  const date = new Date(at)
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** One declared call: a row of a run, settled or still open. */
function member(seq: number, label: string, phase: string, outcome: string | undefined, order: number): ProgressMember {
  return {
    seq,
    label,
    phase,
    childId: `child-${seq}`,
    order,
    startedAt: BASE + seq * 60_000,
    ...outcome === undefined ? {} : { endedAt: BASE + seq * 60_000 + 20_000, outcome },
  }
}

/** One recorded liveness intervention, in the shape the panel reads. */
type Finding = { seq: number, label: string, signal: string, action: string, reason: string, atMs?: number }

/** The Guardian facts a run carries when the recorder wrote a `guardian-start`. */
function guardianOf(findings: Finding[], overrides: Partial<NonNullable<ProgressRun['guardian']>> = {}): NonNullable<ProgressRun['guardian']> {
  return { started: true, armed: true, budgetMs: 240_000, ended: true, cancelled: false, findings, ...overrides }
}

/** 等你点头: the run announced itself and declared nothing. */
function waitingRun(): ProgressRun {
  return { runId: 'r-flow-waiting', name: '任务团队 · 0 个任务', anchorSeq: 1, members: [], details: [] }
}

/**
 * 进行中 with three plan tasks under one execute visit.
 *
 * The engine records the plan-task group title (`任务 1 · 修复登录`) as the phase of the
 * call that ran inside that task, so one execute visit that walked three tasks carries
 * three numbered rows: they hang under the leg as three sub nodes, in task order, each
 * coloured by its own rows.
 */
function plannedRun(): ProgressRun {
  return {
    runId: 'r-flow-planned',
    name: '任务团队 · 3 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '执行', '任务 2 · 写文档', undefined, 2),
      member(4, '执行', '任务 3 · 补测试', 'failed', 3),
    ],
    details: [],
  }
}

/** 一条腿都没有计划任务号：this leg's rows stay on the step node, as they always did. */
function plainRun(): ProgressRun {
  return {
    runId: 'r-flow-plain',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '执行', 'completed', 1),
    ],
    details: [],
  }
}

/** 进行中: a task being retried, one call still open. */
function runningRun(): ProgressRun {
  return {
    runId: 'r-flow-running',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '执行（尝试 2）', '任务 1 · 修复登录', undefined, 2),
    ],
    details: [],
  }
}

/** 已完成: every leg passed, the first summary draft shipped, a Guardian recorded. */
function finishedRun(): ProgressRun {
  return {
    runId: 'r-flow-done',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '检查', '任务 1 · 修复登录', 'completed', 2),
      member(4, '汇总·第1稿', '汇总', 'completed', 3),
    ],
    details: [],
    stopReason: 'completed',
    summaryFinalDraft: 1,
    guardian: guardianOf([{ seq: 4, label: '汇总 · 第 1 稿', signal: 'timeout', action: 'rescue', reason: '半分钟没有新事件', atMs: 90_000 }]),
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

/** The node elements of one page, in document order. */
function nodesOf(page: unknown): Element[] {
  return hooksOf(page, 'data-gw-progress-node')
}

describe('client progress tab: the flow is a lane matrix', () => {
  it('gives every leg a column, and every column its one step node', () => {
    const page = pageOf(finishedRun())()
    const list = hookOf(page, 'data-gw-progress-cols')
    expect(list.type).toBe('ol')
    expect(classesOf(list)).toEqual(['gw-progress-cols'])
    // The list carries the page's one reader label, and it is the contract's own key.
    expect(attr(list, 'aria-label')).toBe(zh('progress.flow.aria'))

    const columns = hooksOf(list, 'data-gw-progress-col')
    expect(columns).toHaveLength(6)
    expect(columns.map((column) => [column.type, classesOf(column)]))
      .toEqual(columns.map(() => ['li', ['gw-progress-col']]))
    // A column is a leg: its kind, its state and whether the run is waiting there.
    expect(columns.map((column) => attr(column, 'data-gw-progress-col')))
      .toEqual(['start', 'plan', 'execute', 'check', 'summarize', 'end'])
    expect(columns.map((column) => attr(column, 'data-state')))
      .toEqual(['done', 'done', 'done', 'done', 'done', 'done'])
    expect(columns.map((column) => attr(column, 'data-current')))
      .toEqual(['false', 'false', 'false', 'false', 'false', 'true'])
    // Each column holds the step node the old page drew: same hook, now a `div` inside the
    // column's `li`, so the column can carry the tasks that belong to it.
    for (const [index, column] of columns.entries()) {
      const nodes = hooksOf(column, 'data-gw-progress-node')
      expect(nodes, `column ${index} holds one node`).toHaveLength(1)
      expect(nodes[0]!.type).toBe('div')
      expect(classesOf(nodes[0]!)).toEqual(['gw-progress-node'])
      expect(attr(nodes[0]!, 'data-state')).toBe(attr(column, 'data-state'))
      expect(attr(nodes[0]!, 'data-current')).toBe(attr(column, 'data-current'))
    }
    // The retired node list is gone: the columns are the list now.
    expect(hooksOf(page, 'data-gw-progress-nodes')).toHaveLength(0)
  })

  it('draws the dot, the leg word, the badge and the toggle, in that order', () => {
    const page = pageOf(finishedRun())()
    const summarize = nodesOf(page)[4]!
    // React ignores a `null` child, so the DOM has four children and the stub tree has five
    // slots: the empty ones are the badge and the calls a closed node does not draw.
    const kinds = (summarize.children as Array<Element | null>)
      .filter((child): child is Element => child !== null && child !== undefined)
      .map((child) => classesOf(child).join(' '))
    expect(kinds).toEqual([
      'gw-progress-node-dot',
      'gw-progress-node-word',
      'gw-progress-node-ord',
      'gw-progress-node-toggle',
    ])
    // The dot is decoration; the word and the badge are the visible text.
    expect(textOf(hookOf(summarize, 'data-gw-progress-node-word'))).toBe(zh('progress.flow.summarize'))
    expect(textOf(hookOf(summarize, 'data-gw-progress-node-ord'))).toBe(zh('progress.flow.draft', { n: 1 }))
    // The badge is the summary's draft number; a first visit of any other leg has none.
    expect(hooksOf(nodesOf(page)[1]!, 'data-gw-progress-node-ord')).toHaveLength(0)
  })

  it('speaks the leg, its visit and its state, and prints none of the state', () => {
    const page = pageOf(runningRun())()
    expect(nodesOf(page).map((node) => attr(node, 'aria-label'))).toEqual([
      `${zh('progress.flow.start')} ${zh('progress.plan.done')}`,
      `${zh('progress.flow.plan')} ${zh('progress.plan.done')}`,
      `${zh('progress.flow.execute')} ${zh('progress.plan.done')}`,
      // The retry is a second visit of the execute leg, and it is the one being worked.
      `${zh('progress.flow.execute')} ${zh('progress.flow.visit', { n: 2 })} ${zh('progress.plan.running')}`,
      `${zh('progress.flow.end')} ${zh('progress.plan.waiting')}`,
    ])
    // Nothing of that is on the page: the visible words are the legs, the badges, and —
    // under a leg that walked plan tasks — those tasks' own titles (both attempts of this
    // leg ran `任务 1`, so each attempt carries one).
    expect(pageTexts(page)).toEqual([
      '任务团队 · 2 个任务',
      '进行中',
      '起点',
      '规划',
      '执行',
      '任务 1 · 修复登录',
      '执行',
      '第 2 次',
      '任务 1 · 修复登录',
      '终点',
      '还剩 1 步 / 共 5 步',
    ])
  })

  it('marks exactly one node as the current one, and never claims the start is done when it is not', () => {
    const waiting = nodesOf(pageOf(waitingRun())())
    expect(waiting.map((node) => attr(node, 'data-current'))).toEqual(['true', 'false'])
    // A run with nothing declared highlights the start, never the end it has not reached.
    expect(waiting.map((node) => attr(node, 'data-state'))).toEqual(['done', 'pending'])

    const running = nodesOf(pageOf(runningRun())())
    expect(running.filter((node) => attr(node, 'data-current') === 'true')).toHaveLength(1)
    expect(running.map((node) => attr(node, 'data-state'))).toEqual(['done', 'done', 'done', 'doing', 'pending'])
  })

  it('wraps the columns on a narrow screen instead of letting them overflow', () => {
    const cols = ruleOf('.gw-progress-cols')
    expect(cols, 'the column list has no rule').toBeDefined()
    expect(cols).toContain('display: flex')
    expect(cols).toContain('flex-wrap: wrap')
    expect(cols).toContain('gap: 12px')
    const narrow = mediaBlock('max-width: 720px')
    expect(narrow, 'the 720px breakpoint is gone').not.toBe('')
    // Two columns a row under 720px, one under 480px: a column narrows, it never scrolls.
    expect(narrow).toMatch(/\.gw-progress-col \{[^}]*flex: 1 1 calc\(50% - 4px\)/)
    const tiny = mediaBlock('max-width: 480px')
    expect(tiny).toMatch(/\.gw-progress-col \{[^}]*flex: 1 1 100%/)
    // No width is ever forced on the page: a node shrinks instead of pushing the page wide.
    expect(ruleOf('.gw-progress-node')).toContain('min-width: 0')
    expect(ruleOf('.gw-progress-node')).toContain('max-width: 100%')
    expect(progress.css).not.toContain('overflow-x')
    expect(progress.css).not.toContain('scroll-snap')
  })

  it('keeps the header above the flow and the count line and dock below it', () => {
    const page = pageOf(finishedRun())()
    const order = walk(page)
    const at = (hook: string) => order.indexOf(hookOf(page, hook))
    expect(at('data-gw-progress-bar')).toBeLessThan(at('data-gw-progress-flow'))
    expect(at('data-gw-progress-cols')).toBeLessThan(at('data-gw-progress-guardian'))
    expect(at('data-gw-progress-guardian')).toBeLessThan(at('data-gw-progress-left'))
    expect(at('data-gw-progress-left')).toBeLessThan(at('data-gw-progress-dock'))
    const footer = order.filter((element) => classesOf(element).includes('gw-progress-foot'))
    expect(footer, 'the footer is missing, or drawn twice').toHaveLength(1)
    expect(hooksOf(footer[0]!, 'data-gw-progress-left')).toHaveLength(1)
    expect(hooksOf(footer[0]!, 'data-gw-progress-dock')).toHaveLength(1)
  })

  it('says the count over nodes, in the reader’s own language', () => {
    const done = pageOf(finishedRun())()
    expect(textOf(hookOf(done, 'data-gw-progress-left'))).toBe(zh('progress.flow.left', { left: 0, total: 6 }))
    // English is not a second implementation: the same hook, the same count, other words.
    const en = bundle.GROK_WORKFLOW_INTERNALS.translator('en')
    const run = finishedRun()
    const english = renderer({
      t: en,
      progressT: en,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
    expect(textOf(hookOf(english(), 'data-gw-progress-left'))).toBe('0 steps left / 6 total')
  })
})

describe('client progress tab: a node opens its own calls', () => {
  it('closes by default: no list, no rows, and a control that names what it would open', () => {
    const page = pageOf(finishedRun())()
    expect(hooksOf(page, 'data-gw-progress-node-calls')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-log-row')).toHaveLength(0)
    const toggles = hooksOf(page, 'data-gw-progress-node-toggle')
    // A step node's own list is what is left of its rows: the plan and the summary here.
    // The work legs of this run handed every one of their rows to a sub node, so they have
    // nothing of their own to open and get no control.
    expect(toggles.map((toggle) => attr(toggle, 'data-gw-progress-node-toggle')))
      .toEqual(['flow:0:plan:1', 'flow:3:summarize:1'])
    for (const [index, toggle] of toggles.entries()) {
      expect(toggle.type).toBe('button')
      expect(attr(toggle, 'type')).toBe('button')
      expect(attr(toggle, 'aria-expanded')).toBe('false')
      expect(attr(toggle, 'aria-controls')).toBe(`gw-progress-node-calls-${[1, 4][index]}`)
      expect(attr(toggle, 'title')).toBe(zh('progress.task.detail'))
      expect(attr(toggle, 'aria-label')).toBe(zh('progress.task.detail'))
      // The control carries no glyph of its own: the affordance is the CSS chevron.
      expect(texts(toggle)).toEqual([])
    }
  })

  it('opens that node’s calls in `seq` order, and closes it again on a second click', () => {
    const render = pageOf(finishedRun(), { canOpen: (childId: string) => childId === 'child-1' })
    const closed = render()
    const toggle = hooksOf(closed, 'data-gw-progress-node-toggle')[0]!
    ;(toggle.props['onClick'] as () => void)()

    const page = render()
    const calls = hookOf(page, 'data-gw-progress-node-calls')
    expect(calls.type).toBe('ol')
    expect(attr(calls, 'id')).toBe('gw-progress-node-calls-1')
    expect(attr(calls, 'data-gw-progress-node-calls')).toBe(attr(nodesOf(page)[1]!, 'data-gw-progress-node'))
    const rows = hooksOf(calls, 'data-gw-progress-log-row')
    expect(rows.map((row) => row.props['data-gw-progress-log-row'])).toEqual([1])
    // The planner's own word names no gate, so the line keeps it and drops the title, which
    // would only repeat the phase.
    expect(textOf(rows[0]!)).toBe(`${clockAt(BASE + 60_000)} 规划助手 规划 ${zh('progress.log.done')} ${zh('progress.member.open')}`)
    expect(hooksOf(rows[0]!, 'data-gw-progress-task-chain')).toHaveLength(0)
    expect(hooksOf(rows[0]!, 'data-gw-progress-open')).toHaveLength(1)

    ;(hooksOf(page, 'data-gw-progress-node-toggle')[0]!.props['onClick'] as () => void)()
    expect(hooksOf(render(), 'data-gw-progress-node-calls')).toHaveLength(0)
  })
})

describe('client progress tab: the wires are measured, never invented', () => {
  it('paints the layer behind the columns, and draws nothing where there is no layout', () => {
    const page = pageOf(finishedRun())()
    const svg = hookOf(page, 'data-gw-progress-wires')
    expect(svg.type).toBe('svg')
    expect(classesOf(svg)).toEqual(['gw-progress-wires'])
    expect(attr(svg, 'aria-hidden')).toBe('true')
    // A stub renderer has no layout, so the measurement returns nothing and no wire is
    // drawn: no coordinate on this page was guessed. The one child is the arrow head the
    // directed lines point with — a definition, not a line.
    expect(hooksOf(svg, 'marker-end')).toHaveLength(0)
    const defs = hookOf(svg, 'id')
    expect(attr(defs, 'id')).toBe('gw-progress-arrow')
    // The wire layer sits inside the flow, before the columns it is painted behind.
    const order = walk(page)
    expect(order.indexOf(svg)).toBeGreaterThan(order.indexOf(hookOf(page, 'data-gw-progress-flow')))
    expect(order.indexOf(svg)).toBeLessThan(order.indexOf(hookOf(page, 'data-gw-progress-cols')))
  })

  it('ships the measurement, the redraw and the comparison that stops the redraw', () => {
    for (const part of ['measureProgressFlowWires', 'sameProgressWires', 'progressWireLine']) {
      expect(SOURCE, `${part} is missing`).toContain(part)
    }
    // A window resize and a container resize both move the nodes; both must redraw.
    expect(SOURCE).toContain('ResizeObserver')
    expect(SOURCE).toContain("addEventListener('resize'")
    expect(SOURCE).toContain("removeEventListener('resize'")
    // …and the spine's own measurement stays retired.
    for (const gone of ['progressWireDraw', 'progressWireHead', 'PROGRESS_WIRE_PAD', 'PROGRESS_CARD_INDENT']) {
      expect(SOURCE, `${gone} is still shipped`).not.toContain(gone)
    }
  })

  /**
   * The wire maths, driven the way the page drives it: boxes in, segments out.
   *
   * `measureWires` reads nothing but `getBoundingClientRect` and the two hooks, so a
   * stand-in flow is enough to pin the shapes a reader is meant to see, and the shapes the
   * page must not claim. Each step node stands in for its own sub nodes: the measurement
   * asks a node for the children it holds, which is the DOM relationship the page has.
   */
  type Box = { x: number, y: number, w: number, h: number, subs?: ReadonlyArray<Box> }

  function rectangle(box: Box) {
    return { left: box.x, top: box.y, width: box.w, height: box.h, right: box.x + box.w, bottom: box.y + box.h }
  }

  function boxes(rects: ReadonlyArray<Box>): { flow: unknown } {
    const frame = { left: 0, top: 0, width: 1000, height: 400 }
    const element = (box: Box) => ({
      getBoundingClientRect: () => rectangle(box),
      querySelectorAll: () => (box.subs === undefined ? [] : box.subs.map((sub) => ({ getBoundingClientRect: () => rectangle(sub) }))),
    })
    return {
      flow: {
        querySelectorAll: () => rects.map(element),
        getBoundingClientRect: () => ({ ...frame, right: frame.width, bottom: frame.height }),
      },
    }
  }

  it('draws one line per neighbouring pair on a row, however tall one of them is', () => {
    // Three nodes on one row, the middle one open and therefore three times as tall: the
    // row is still a row, and a reader following it left to right must see both gaps drawn.
    const even = loadBundle().GROK_WORKFLOW_PROGRESS.measureWires(boxes([
      { x: 0, y: 0, w: 60, h: 30 },
      { x: 70, y: 0, w: 60, h: 30 },
      { x: 140, y: 0, w: 60, h: 30 },
    ]).flow)
    expect(even.paths).toHaveLength(2)
    expect(even.paths[0]).toEqual([[60, 15], [70, 15]])

    const mixed = loadBundle().GROK_WORKFLOW_PROGRESS.measureWires(boxes([
      { x: 0, y: 0, w: 60, h: 30 },
      { x: 70, y: 0, w: 200, h: 120 },
      { x: 280, y: 0, w: 60, h: 30 },
    ]).flow)
    // Two lines, not one: the tall node is on the same row, so both gaps are drawn — and
    // each runs at the middle of the span the pair actually shares.
    expect(mixed.paths).toHaveLength(2)
    expect(mixed.paths[0]).toEqual([[60, 15], [70, 15]])
    expect(mixed.paths[1]).toEqual([[270, 15], [280, 15]])
  })

  it('turns an elbow where a neighbour wrapped, and draws one line down a stacked pair', () => {
    // A wrapped row: two boxes on the first row, one that started the second row at the
    // container's left edge. The pair that wrapped shares no span, so the line is drawn as
    // three straight legs — down into the gap, across, then down onto the target — with
    // square corners, instead of claiming a diagonal the layout never drew.
    const wrapped = loadBundle().GROK_WORKFLOW_PROGRESS.measureWires(boxes([
      { x: 0, y: 0, w: 60, h: 30 },
      { x: 70, y: 0, w: 400, h: 30 },
      { x: 0, y: 40, w: 60, h: 30 },
    ]).flow)
    expect(wrapped.paths).toHaveLength(2)
    expect(wrapped.paths[0]).toEqual([[60, 15], [70, 15]])
    // Down from the second box's middle, half way to the third, across to the third's
    // middle, then down onto its top edge.
    expect(wrapped.paths[1]).toEqual([[270, 30], [270, 35], [30, 35], [30, 40]])

    // A single column (the narrow layout): the one pair that stacked gets one line, laid
    // between the boxes at the middle of the span they share.
    const column = loadBundle().GROK_WORKFLOW_PROGRESS.measureWires(boxes([
      { x: 0, y: 0, w: 300, h: 30 },
      { x: 0, y: 40, w: 300, h: 30 },
    ]).flow)
    expect(column.paths).toHaveLength(1)
    expect(column.paths[0]).toEqual([[150, 30], [150, 40]])
  })

  /**
   * A lane matrix stand-in: one element per column, holding its head and its task cells.
   *
   * The measurement asks a column for the boxes it holds, which is the DOM relationship the
   * page has; nothing here is derived from a CSS rule.
   */
  type Lane = { lane: number, x: number, y: number, w: number, h: number }
  type Column = { x: number, y: number, w: number, h: number, cells?: ReadonlyArray<Lane> }

  function matrix(columns: ReadonlyArray<Column>): { flow: unknown } {
    const frame = { left: 0, top: 0, width: 1000, height: 400 }
    const box = (r: { x: number, y: number, w: number, h: number }) => ({
      left: r.x,
      top: r.y,
      width: r.w,
      height: r.h,
      right: r.x + r.w,
      bottom: r.y + r.h,
    })
    const cell = (lane: Lane) => ({
      getBoundingClientRect: () => box(lane),
      getAttribute: (name: string) => (name === 'data-lane' ? String(lane.lane) : undefined),
    })
    return {
      flow: {
        querySelectorAll: () => columns.map((column) => ({
          getBoundingClientRect: () => box(column),
          querySelectorAll: (selector: string) => {
            if (selector.includes('data-gw-progress-node')) {
              return [{ getBoundingClientRect: () => box({ x: column.x, y: column.y, w: column.w, h: 32 }) }]
            }
            return (column.cells ?? []).map(cell)
          },
        })),
        getBoundingClientRect: () => ({ ...frame, right: frame.width, bottom: frame.height }),
      },
    }
  }

  it('chains the same task across two legs, and leaves a gap where a leg skipped it', () => {
    // Two adjacent columns, both holding task 1; the second also holds task 2, the first
    // does not. One line per neighbouring pair that really exists — and none across the gap.
    const measured = loadBundle().GROK_WORKFLOW_PROGRESS.measureWires(matrix([
      { x: 0, y: 0, w: 200, h: 100, cells: [{ lane: 1, x: 0, y: 38, w: 200, h: 26 }] },
      { x: 212, y: 0, w: 200, h: 100, cells: [{ lane: 1, x: 212, y: 38, w: 200, h: 26 }, { lane: 2, x: 212, y: 70, w: 200, h: 26 }] },
    ]).flow)
    // head→head, then task 1 → task 1.
    expect(measured.paths).toHaveLength(2)
    expect(measured.paths[0]).toEqual([[200, 16], [212, 16]])
    expect(measured.paths[1]).toEqual([[200, 51], [212, 51]])
  })

  it('elbows a lane pair that wrapped, and draws nothing on a host without layout', () => {
    // The second column wrapped onto the next row and sits to the right of the first: the
    // two cells share neither a row nor a column, so the line is an elbow — down, across,
    // down — rather than a diagonal nobody drew.
    const wrapped = loadBundle().GROK_WORKFLOW_PROGRESS.measureWires(matrix([
      { x: 0, y: 0, w: 100, h: 70, cells: [{ lane: 1, x: 0, y: 38, w: 100, h: 26 }] },
      { x: 300, y: 80, w: 100, h: 70, cells: [{ lane: 1, x: 300, y: 118, w: 100, h: 26 }] },
    ]).flow)
    // head→head and task 1 → task 1, both elbowed.
    expect(wrapped.paths).toHaveLength(2)
    const lane = wrapped.paths[1]!
    expect(lane).toHaveLength(4)
    expect(lane[0]).toEqual([50, 64])
    expect(lane[1]).toEqual([50, 91])
    expect(lane[2]).toEqual([350, 91])
    expect(lane[3]).toEqual([350, 118])

    // A column directly under its neighbour is a plain vertical line, not an elbow.
    const below = loadBundle().GROK_WORKFLOW_PROGRESS.measureWires(matrix([
      { x: 0, y: 0, w: 200, h: 70, cells: [{ lane: 1, x: 0, y: 38, w: 200, h: 26 }] },
      { x: 0, y: 80, w: 200, h: 70, cells: [{ lane: 1, x: 0, y: 118, w: 200, h: 26 }] },
    ]).flow)
    expect(below.paths[1]).toEqual([[100, 64], [100, 118]])

    // Every element present, no box measurable: no wire at all, and no exception.
    const flat = { querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }) }
    expect(progress.measureWires(flat).paths).toEqual([])
    const sized = matrix([{ x: 0, y: 0, w: 0, h: 0, cells: [{ lane: 1, x: 0, y: 0, w: 0, h: 0 }] }])
    expect(progress.measureWires(sized.flow).paths).toEqual([])
  })

  it('lays the layer over the flow without taking a click', () => {
    const wires = ruleOf('.gw-progress-wires')
    expect(wires).toContain('position: absolute')
    expect(wires).toContain('pointer-events: none')
    expect(wires).toContain('overflow: visible')
    const drawn = progress.css.split('\n').find((line) => line.trim().startsWith('.gw-progress-wires > path {'))
    expect(drawn, 'the wires carry no stroke').toBeDefined()
    expect(drawn).toContain('stroke: var(--dsw-alias-border-l2')
    expect(drawn).toContain('fill: none')
  })
})

describe('client progress tab: the plan tasks stand in their own lane', () => {
  it('gives every plan task a cell in its leg, in task order, before anything is clicked', () => {
    // No click, no state, no effect: the tasks are on the figure the moment it is drawn.
    const page = pageOf(plannedRun())()
    const lists = hooksOf(page, 'data-gw-progress-subs')
    expect(lists).toHaveLength(1)
    const list = lists[0]!
    expect(list.type).toBe('ol')
    expect(classesOf(list)).toEqual(['gw-progress-subs'])
    expect(attr(list, 'data-gw-progress-subs')).toBe('flow:1:execute:1')

    // It hangs inside the column it belongs to, under that column's step node.
    const column = hooksOf(page, 'data-gw-progress-col')[2]!
    expect(attr(column, 'data-gw-progress-col')).toBe('execute')
    expect(hookOf(column, 'data-gw-progress-subs')).toBe(list)
    expect(walk(column).indexOf(hookOf(column, 'data-gw-progress-node')))
      .toBeLessThan(walk(column).indexOf(list))

    const cells = hooksOf(list, 'data-gw-progress-sub')
    expect(cells.map((cell) => [cell.type, classesOf(cell)]))
      .toEqual(cells.map(() => ['li', ['gw-progress-sub']]))
    expect(cells.map((cell) => attr(cell, 'data-gw-progress-sub')))
      .toEqual(['flow:1:execute:1:t1', 'flow:1:execute:1:t2', 'flow:1:execute:1:t3'])
    // The task number is written three ways — the contract names all of them — ascending.
    expect(cells.map((cell) => attr(cell, 'data-task'))).toEqual(['1', '2', '3'])
    expect(cells.map((cell) => attr(cell, 'data-lane'))).toEqual(['1', '2', '3'])
    expect(cells.map((cell) => attr(cell, 'data-ordinal'))).toEqual(['1', '2', '3'])
    // Each task carries its own state, by the same rule the step node uses.
    expect(cells.map((cell) => attr(cell, 'data-state'))).toEqual(['done', 'doing', 'failed'])
    for (const cell of cells) {
      expect(['done', 'doing', 'pending', 'failed', 'blocked', 'cancelled'])
        .toContain(attr(cell, 'data-state'))
    }

    // The word is the task's own phase, verbatim — a title, not a sentence about it.
    const words = cells.map((cell) => hookOf(cell, 'data-gw-progress-sub-word'))
    expect(words.map((word) => textOf(word))).toEqual(['任务 1 · 修复登录', '任务 2 · 写文档', '任务 3 · 补测试'])
    expect(words.map((word) => attr(word, 'title'))).toEqual(['任务 1 · 修复登录', '任务 2 · 写文档', '任务 3 · 补测试'])
    // A reader hears the title and the state word, and nothing else.
    expect(cells.map((cell) => attr(cell, 'aria-label'))).toEqual([
      `任务 1 · 修复登录 ${zh('progress.plan.done')}`,
      `任务 2 · 写文档 ${zh('progress.plan.running')}`,
      `任务 3 · 补测试 ${zh('progress.plan.failed')}`,
    ])
    // The dot is decoration and carries no word.
    for (const cell of cells) {
      const dot = walk(cell).find((element) => classesOf(element).includes('gw-progress-sub-dot'))
      expect(dot, 'the cell has no dot').toBeDefined()
      expect(attr(dot!, 'aria-hidden')).toBe('true')
      expect(texts(dot!)).toEqual([])
    }
  })

  it('leaves a leg with no task number exactly as it was: no list, no hook', () => {
    const page = pageOf(plainRun())()
    expect(hooksOf(page, 'data-gw-progress-subs')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-sub')).toHaveLength(0)
    // The step node keeps its own call list, and its own control, as before.
    expect(nodesOf(page).map((node) => texts(node))).toEqual([['起点'], ['规划'], ['执行'], ['终点']])
    expect(hooksOf(page, 'data-gw-progress-node-toggle')).toHaveLength(2)
  })

  it('hands every numbered row to its task, and leaves the step only what carries no number', () => {
    // A leg whose rows all name a task has nothing of its own left to open.
    const planned = nodesOf(pageOf(plannedRun())())
    expect(hooksOf(planned[2]!, 'data-gw-progress-node-toggle')).toHaveLength(0)

    // A leg with one unnumbered row and one numbered row opens the unnumbered one only:
    // the task's line is read in the task's own cell.
    const mixed = pageOf({
      ...plannedRun(),
      members: [
        member(1, '规划助手', '规划', 'completed', 0),
        member(2, '执行', '执行', 'completed', 1),
        member(3, '执行', '任务 7 · 补测试', 'completed', 2),
      ],
    })()
    const cells = hooksOf(mixed, 'data-gw-progress-sub')
    expect(cells).toHaveLength(1)
    expect(attr(cells[0]!, 'data-task')).toBe('7')

    const view = pageOf({
      ...plannedRun(),
      members: [
        member(1, '规划助手', '规划', 'completed', 0),
        member(2, '执行', '执行', 'completed', 1),
        member(3, '执行', '任务 7 · 补测试', 'completed', 2),
      ],
    })
    const toggle = hooksOf(view(), 'data-gw-progress-node-toggle')
      .find((element) => attr(element, 'data-gw-progress-node-toggle') === 'flow:1:execute:1')
    expect(toggle, 'the leg with a leftover row offers to open it').toBeDefined()
    ;(toggle!.props['onClick'] as () => void)()
    expect(hooksOf(hookOf(view(), 'data-gw-progress-node-calls'), 'data-gw-progress-log-row')
      .map((row) => row.props['data-gw-progress-log-row'])).toEqual([2])
  })

  it('opens one task into its own calls, and closes it again', () => {
    const render = pageOf(plannedRun(), { canOpen: (childId: string) => childId === 'child-2' })
    const closed = render()
    const cell = hooksOf(closed, 'data-gw-progress-sub')[0]!
    const toggle = hookOf(cell, 'data-gw-progress-sub-toggle')
    expect(toggle.type).toBe('button')
    expect(attr(toggle, 'type')).toBe('button')
    // The cell always says which task it is; the control only adds its own calls.
    expect(classesOf(toggle)).toEqual(['gw-progress-node-toggle'])
    expect(attr(toggle, 'aria-expanded')).toBe('false')
    expect(attr(toggle, 'aria-controls')).toBe('gw-progress-sub-calls-2-1')
    expect(attr(toggle, 'title')).toBe(zh('progress.task.detail'))
    expect(texts(toggle)).toEqual([])
    // Closed, the list the control names does not exist yet (§20.8's disclosure pattern).
    expect(hooksOf(closed, 'data-gw-progress-sub-calls')).toHaveLength(0)

    ;(toggle.props['onClick'] as () => void)()
    const opened = render()
    const calls = hookOf(opened, 'data-gw-progress-sub-calls')
    expect(calls.type).toBe('ol')
    expect(classesOf(calls)).toEqual(['gw-progress-sub-calls'])
    expect(attr(calls, 'id')).toBe('gw-progress-sub-calls-2-1')
    expect(attr(calls, 'data-gw-progress-sub-calls')).toBe('flow:1:execute:1:t1')
    expect(attr(hookOf(opened, 'data-gw-progress-sub-toggle'), 'aria-expanded')).toBe('true')
    // The same line renderer the step node uses: clock, gate, result, capsule.
    const rows = hooksOf(calls, 'data-gw-progress-log-row')
    expect(rows.map((row) => row.props['data-gw-progress-log-row'])).toEqual([2])
    expect(textOf(rows[0]!)).toBe(`${clockAt(BASE + 120_000)} ${zh('progress.chain.execute')} 任务 1 · 修复登录 ${zh('progress.log.done')} ${zh('progress.member.open')}`)
    expect(hooksOf(rows[0]!, 'data-gw-progress-task-chain')).toHaveLength(1)
    expect(hooksOf(rows[0]!, 'data-gw-progress-open')).toHaveLength(1)
    // The step node's own list stays closed: the click opened one task, not the leg.
    expect(hooksOf(opened, 'data-gw-progress-node-calls')).toHaveLength(0)

    // A second click closes it again.
    ;(hookOf(hooksOf(render(), 'data-gw-progress-sub')[0]!, 'data-gw-progress-sub-toggle').props['onClick'] as () => void)()
    expect(hooksOf(render(), 'data-gw-progress-sub-calls')).toHaveLength(0)
  })

  it('gives no cell to the two ends, the plan or the summary', () => {
    const page = pageOf(finishedRun())()
    // finishedRun walks `任务 1` in execute and check only.
    expect(hooksOf(page, 'data-gw-progress-col').map((column) => hooksOf(column, 'data-gw-progress-subs').length))
      .toEqual([0, 0, 1, 1, 0, 0])
  })

  it('adds no copy of its own: the layer is the plan’s titles and the words the page had', () => {
    // Zero copy (contract 追加 5): the task layer prints the phase the recorder wrote and
    // speaks a state word the page already used. Nothing explains what a cell is.
    const page = pageOf(plannedRun())()
    const allowed = new Set([
      '任务团队 · 3 个任务',
      '进行中',
      zh('progress.flow.start'),
      zh('progress.flow.plan'),
      zh('progress.flow.execute'),
      zh('progress.flow.end'),
      zh('progress.flow.left', { left: 1, total: 4 }),
      '任务 1 · 修复登录',
      '任务 2 · 写文档',
      '任务 3 · 补测试',
    ])
    for (const text of pageTexts(page)) {
      expect(allowed.has(text), `${text} is copy the task layer added`).toBe(true)
    }
    // A cell speaks its title and one of the five words the page already ships; it carries
    // no sentence of its own in a tooltip or a second label.
    const stateWords = ['progress.plan.waiting', 'progress.plan.running', 'progress.plan.done', 'progress.plan.failed', 'progress.plan.cancelled']
      .map((key) => zh(key))
    for (const cell of hooksOf(page, 'data-gw-progress-sub')) {
      const title = attr(hookOf(cell, 'data-gw-progress-sub-word'), 'title')!
      const spoken = attr(cell, 'aria-label')!
      expect(spoken).toBe(`${title} ${stateWords.find((word) => spoken === `${title} ${word}`) ?? ''}`.trim())
      expect(attr(cell, 'title')).toBeUndefined()
    }
    // Every one of those words is an existing key, not a new one for this layer.
    for (const key of ['progress.plan.waiting', 'progress.plan.running', 'progress.plan.done', 'progress.plan.failed', 'progress.plan.cancelled']) {
      expect(Object.keys(bundle.GROK_WORKFLOW_DICT['zh']!)).toContain(key)
    }
  })

  it('keeps the typed half untouched: the lanes are a browser-only grouping', () => {
    // Contract 追加 1: `src/progress-tab.ts` does not grow a `subs` / lane field. The split
    // lives in this bundle's mirror only, so the typed API and every number stay as they are.
    const typed = readFileSync(new URL('../src/progress-tab.ts', import.meta.url), 'utf8')
    expect(typed, 'the typed half grew a task-node type').not.toContain('ProgressFlowSubNode')
    expect(typed, 'the typed node grew a subs field').not.toMatch(/\bsubs\??:/)
    expect(typed, 'the typed half grew a task-cell hook').not.toContain('data-gw-progress-sub')
  })
})

describe('client progress tab: colour is the state', () => {
  it('gives every state one semantic token, and never a red one', () => {
    const states: Array<[string, string]> = [
      ['done', '--dsw-alias-state-success-primary'],
      ['doing', '--dsw-alias-state-business-primary'],
      ['pending', '--dsw-alias-state-idle-primary'],
      ['failed', '--dsw-alias-state-warn-primary'],
      ['blocked', '--dsw-alias-state-warn-primary'],
      ['cancelled', '--dsw-alias-state-warn-primary'],
    ]
    for (const [state, token] of states) {
      const dot = ruleOf(`.gw-progress-node[data-state="${state}"] .gw-progress-node-dot`)
      expect(dot, `no dot rule for ${state}`).toBeDefined()
      expect(dot).toContain(token)
      // The word follows the dot, so the state reads without relying on colour alone.
      const word = ruleOf(`.gw-progress-node[data-state="${state}"] .gw-progress-node-word`)
      expect(word, `no word rule for ${state}`).toBeDefined()
    }
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
  })

  it('is the only page that breathes, and only while the run is being worked', () => {
    expect(progress.css).toContain('.gw-progress-node[data-state="doing"] .gw-progress-node-dot')
    expect(progress.css).toContain('@keyframes gw-progress-breathe')
    // The unreached node is the only dashed one: a dashed edge says "not yet", a colour
    // there would say "a result".
    expect(ruleOf('.gw-progress-node[data-state="pending"]')).toContain('border-style: dashed')
    const reduced = mediaBlock('prefers-reduced-motion: reduce')
    expect(reduced, 'the reduced-motion block is gone').not.toBe('')
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('.gw-progress-node')
    expect(reduced).toContain('.gw-progress-chip')
  })

  it('carries no literal colour, no font family of its own and no unscoped rule', () => {
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(progress.css).not.toMatch(/\brgba?\(/)
    expect(progress.css).not.toMatch(/\bhsla?\(/)
    expect(progress.css).toContain('var(--dsw-font-family-sans')
    const rules = progress.css.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('@'))
    for (const rule of rules) expect(rule.trim().startsWith('.gw-progress')).toBe(true)
  })
})

describe('client progress tab: the lane matrix, drawn to the contract’s numbers', () => {
  it('sizes a step node 32px tall with a 10px radius, and the two ends as capsules', () => {
    const node = ruleOf('.gw-progress-node')
    expect(node, 'the step node has no rule').toBeDefined()
    expect(node).toContain('box-sizing: border-box')
    expect(node).toContain('height: 32px')
    expect(node).toContain('border-radius: 10px')
    // A run's two ends are the only pills left: every middle leg is a rounded box, so a
    // reader can tell where the walk starts and stops without reading a word.
    const ends = progress.css.split('\n').find((line) => line.trim().startsWith('.gw-progress-node[data-kind="start"],'))
    expect(ends, 'the two ends carry no capsule rule').toBeDefined()
    expect(ends).toContain('border-radius: 999px')
    expect(ends).toContain('.gw-progress-node[data-kind="end"]')
    // A long leg name is cut with an ellipsis instead of widening the column.
    expect(ruleOf('.gw-progress-node-word')).toContain('text-overflow: ellipsis')
  })

  it('stacks the columns at 12px, and the cells at 6px, so one task keeps one row', () => {
    expect(ruleOf('.gw-progress-cols')).toContain('gap: 12px')
    const column = ruleOf('.gw-progress-col')
    expect(column, 'the column has no rule').toBeDefined()
    expect(column).toContain('display: flex')
    expect(column).toContain('flex-direction: column')
    expect(column).toContain('gap: 6px')
    expect(column).toContain('flex: 1 1 0')
    expect(column).toContain('min-width: 0')

    const cell = ruleOf('.gw-progress-sub')
    expect(cell, 'the task cell has no rule').toBeDefined()
    expect(cell).toContain('display: flex')
    expect(cell).toContain('height: 26px')
    expect(cell).toContain('border-radius: 10px')
    expect(cell).toContain('padding: 3px 8px')
    expect(cell).toContain('gap: 4px')
    expect(cell).toContain('font-size: 12px')
    expect(cell).toContain('border: 1px solid var(--dsw-alias-border-l2')
    // The list is a plain column of cells, with no marker of its own.
    const list = ruleOf('.gw-progress-subs')
    expect(list).toBeDefined()
    expect(list).toContain('display: flex')
    expect(list).toContain('flex-direction: column')
    expect(list).toContain('gap: 6px')
    expect(list).toContain('list-style: none')
    // A title that does not fit is cut with an ellipsis, never pushed off the page.
    const word = ruleOf('.gw-progress-sub-word')
    expect(word).toBeDefined()
    expect(word).toContain('min-width: 0')
    expect(word).toContain('text-overflow: ellipsis')
    expect(word).toContain('white-space: nowrap')
    // Only the contract's new names: nothing here reuses the retired task-band prefix.
    for (const className of ['gw-progress-cols', 'gw-progress-col', 'gw-progress-subs', 'gw-progress-sub', 'gw-progress-sub-dot', 'gw-progress-sub-word', 'gw-progress-sub-calls']) {
      expect(styledClasses(), `${className} is not styled`).toContain(className)
      expect(className).not.toContain('gw-progress-task')
    }
  })

  it('fills a reached state with one token, from 12% down to 5%, and keeps the idle one flat', () => {
    const states: Array<[string, string]> = [
      ['done', '--dsw-alias-state-success-primary'],
      ['doing', '--dsw-alias-state-business-primary'],
      ['failed', '--dsw-alias-state-warn-primary'],
      ['blocked', '--dsw-alias-state-warn-primary'],
      ['cancelled', '--dsw-alias-state-warn-primary'],
    ]
    for (const [state, token] of states) {
      const node = ruleWith(`.gw-progress-node[data-state="${state}"]`)
      expect(node, `no node rule for ${state}`).toBeDefined()
      // One token, one gradient: the same colour at twelve percent, fading to five.
      expect(node).toContain(`color-mix(in srgb, var(${token}) 12%, transparent)`)
      expect(node).toContain(`color-mix(in srgb, var(${token}) 5%, transparent)`)
      expect(node).toContain('linear-gradient(180deg')
      expect(node).toContain('background-color: transparent')
      // The dot and the word carry the same token, so colour is never the only signal.
      expect(ruleOf(`.gw-progress-node[data-state="${state}"] .gw-progress-node-dot`)).toContain(token)
      expect(ruleOf(`.gw-progress-node[data-state="${state}"] .gw-progress-node-word`)).toContain(token)
    }
    // Not yet: the one dashed border, the one hollow dot, and no fill to read as a result.
    const pending = ruleOf('.gw-progress-node[data-state="pending"]')
    expect(pending).toContain('border-style: dashed')
    expect(pending).toContain('background-image: none')
    expect(ruleOf('.gw-progress-node[data-state="pending"] .gw-progress-node-dot')).toContain('inset 0 0 0 1px')
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
  })

  it('gives a task cell the same five states as the leg above it', () => {
    const states: Array<[string, string]> = [
      ['done', '--dsw-alias-state-success-primary'],
      ['doing', '--dsw-alias-state-business-primary'],
      ['failed', '--dsw-alias-state-warn-primary'],
      ['blocked', '--dsw-alias-state-warn-primary'],
      ['cancelled', '--dsw-alias-state-warn-primary'],
    ]
    for (const [state, token] of states) {
      const cell = ruleWith(`.gw-progress-sub[data-state="${state}"]`)
      expect(cell, `no cell rule for ${state}`).toBeDefined()
      expect(cell).toContain(`color-mix(in srgb, var(${token}) 12%, transparent)`)
      expect(cell).toContain(`color-mix(in srgb, var(${token}) 5%, transparent)`)
      expect(cell).toContain('linear-gradient(180deg')
      expect(cell).toContain('background-color: transparent')
      expect(ruleOf(`.gw-progress-sub[data-state="${state}"] .gw-progress-sub-dot`)).toContain(token)
      expect(ruleOf(`.gw-progress-sub[data-state="${state}"] .gw-progress-sub-word`)).toContain(token)
    }
    const pending = ruleOf('.gw-progress-sub[data-state="pending"]')
    expect(pending).toContain('border-style: dashed')
    expect(pending).toContain('background-image: none')
    expect(ruleOf('.gw-progress-sub[data-state="pending"] .gw-progress-sub-dot')).toContain('inset 0 0 0 1px')
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
  })

  it('floats an opened list over the figure instead of growing the node it belongs to', () => {
    // Contract 追加 3: opening a step's or a task's calls must not move a single column.
    for (const selector of ['.gw-progress-node-calls', '.gw-progress-sub-calls']) {
      const rule = ruleWith(selector)
      expect(rule, `${selector} has no rule`).toBeDefined()
      expect(rule).toContain('position: absolute')
      expect(rule).toContain('top: calc(100%')
      expect(rule).toContain('z-index')
    }
    // The box they float out of is their own reference, and it keeps its height.
    expect(ruleOf('.gw-progress-node')).toContain('position: relative')
    expect(ruleOf('.gw-progress-sub')).toContain('position: relative')
  })

  it('draws directed wires with the one marker, and invents no second animation', () => {
    // 追加 4: one arrow head definition, pointed at by every wire; its fill is the border
    // token, because the arrow says "this way", never "this state".
    expect(progress.css).not.toMatch(/@keyframes\s+(?!gw-progress-breathe|gw-progress-pulse)/)
    expect(progress.css).toContain('@keyframes gw-progress-breathe')
    // Wires carry one hairline in the border token — no wire changes colour by state — and
    // the arrow head, being a definition, is drawn from the same token in the markup.
    const drawn = progress.css.split('\n').find((line) => line.trim().startsWith('.gw-progress-wires > path {'))
    expect(drawn).toContain('fill: none')
    expect(drawn).toContain('stroke: var(--dsw-alias-border-l2')

    // The one marker is drawn with the page, even before a line exists, and its triangle
    // is the border token: the direction of a wire is structure, never state.
    const svg = hookOf(pageOf(finishedRun())(), 'data-gw-progress-wires')
    const marker = hookOf(svg, 'id')
    expect(attr(marker, 'id')).toBe('gw-progress-arrow')
    expect(attr(hookOf(marker, 'd'), 'fill')).toBe('var(--dsw-alias-border-l2, currentColor)')
    // Every wire points at it; the source says so once, for all of them.
    expect(SOURCE).toContain("'marker-end': 'url(#gw-progress-arrow)'")
  })

  it('wraps the columns on a narrow screen and still connects them', () => {
    const narrow = mediaBlock('max-width: 720px')
    expect(narrow, 'the 720px breakpoint is gone').not.toBe('')
    // Two columns a row; the elbow lines keep saying which column follows which.
    expect(narrow).toMatch(/\.gw-progress-col \{[^}]*flex: 1 1 calc\(50% - 4px\)/)
    expect(narrow).not.toMatch(/\.gw-progress-wires \{[^}]*display: none/)
    // Under 480px a column takes the whole width, and a call line keeps one flexible
    // column, so nothing scrolls sideways at any width.
    const tiny = mediaBlock('max-width: 480px')
    expect(tiny).not.toBe('')
    expect(tiny).toMatch(/\.gw-progress-col \{[^}]*flex: 1 1 100%/)
    expect(tiny).toMatch(/\.gw-progress-(?:node|sub)-calls \.gw-progress-log-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/)
    expect(progress.css).not.toContain('overflow-x')
    expect(progress.css).not.toContain('scroll-snap')
  })
})
