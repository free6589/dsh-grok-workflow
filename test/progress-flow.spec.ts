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

describe('client progress tab: the flow is one column of nodes', () => {
  it('nests the nodes in one list, and every node in its own item', () => {
    const page = pageOf(finishedRun())()
    const list = hookOf(page, 'data-gw-progress-nodes')
    expect(list.type).toBe('ol')
    expect(classesOf(list)).toEqual(['gw-progress-nodes'])
    // The list carries the page's one reader label, and it is the contract's own key.
    expect(attr(list, 'aria-label')).toBe(zh('progress.flow.aria'))
    const nodes = hooksOf(list, 'data-gw-progress-node')
    expect(nodes).toHaveLength(6)
    for (const node of nodes) {
      expect(node.type).toBe('li')
      expect(classesOf(node)).toEqual(['gw-progress-node'])
    }
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
    // Nothing of that is on the page: the visible words are the legs and the badges.
    expect(pageTexts(page)).toEqual([
      '任务团队 · 2 个任务',
      '进行中',
      '起点',
      '规划',
      '执行',
      '执行',
      '第 2 次',
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

  it('stands the nodes in one column under 720px instead of letting them overflow', () => {
    const nodes = ruleOf('.gw-progress-nodes')
    expect(nodes, 'the node list has no rule').toBeDefined()
    expect(nodes).toContain('display: flex')
    expect(nodes).toContain('flex-wrap: wrap')
    const narrow = mediaBlock('max-width: 720px')
    expect(narrow, 'the 720px breakpoint is gone').not.toBe('')
    expect(narrow).toMatch(/\.gw-progress-nodes \{[^}]*flex-direction: column/)
    expect(narrow).toMatch(/\.gw-progress-nodes \{[^}]*align-items: stretch/)
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
    expect(at('data-gw-progress-nodes')).toBeLessThan(at('data-gw-progress-guardian'))
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
    // Every middle node has at least one call; the two ends have none, so they get no control.
    expect(toggles).toHaveLength(4)
    for (const [index, toggle] of toggles.entries()) {
      expect(toggle.type).toBe('button')
      expect(attr(toggle, 'type')).toBe('button')
      expect(attr(toggle, 'aria-expanded')).toBe('false')
      expect(attr(toggle, 'aria-controls')).toBe(`gw-progress-node-calls-${index + 1}`)
      expect(attr(toggle, 'title')).toBe(zh('progress.task.detail'))
      expect(attr(toggle, 'aria-label')).toBe(zh('progress.task.detail'))
      // The control carries no glyph of its own: the affordance is the CSS chevron.
      expect(texts(toggle)).toEqual([])
    }
  })

  it('opens that node’s calls in `seq` order, and closes it again on a second click', () => {
    const render = pageOf(finishedRun(), { canOpen: (childId: string) => childId === 'child-2' })
    const closed = render()
    const toggle = hooksOf(closed, 'data-gw-progress-node-toggle')[1]!
    ;(toggle.props['onClick'] as () => void)()

    const page = render()
    const calls = hookOf(page, 'data-gw-progress-node-calls')
    expect(calls.type).toBe('ol')
    expect(attr(calls, 'id')).toBe('gw-progress-node-calls-2')
    expect(attr(calls, 'data-gw-progress-node-calls')).toBe(attr(nodesOf(page)[2]!, 'data-gw-progress-node'))
    const rows = hooksOf(calls, 'data-gw-progress-log-row')
    expect(rows.map((row) => row.props['data-gw-progress-log-row'])).toEqual([2])
    // The gate chip stands in for the role, the task name follows it, and the node above
    // carries the leg: nothing on this line is said twice.
    expect(textOf(rows[0]!)).toBe(`${clockAt(BASE + 120_000)} ${zh('progress.chain.execute')} 任务 1 · 修复登录 ${zh('progress.log.done')} ${zh('progress.member.open')}`)
    expect(hooksOf(rows[0]!, 'data-gw-progress-task-chain')).toHaveLength(1)
    expect(hooksOf(rows[0]!, 'data-gw-progress-open')).toHaveLength(1)

    ;(hooksOf(page, 'data-gw-progress-node-toggle')[1]!.props['onClick'] as () => void)()
    expect(hooksOf(render(), 'data-gw-progress-node-calls')).toHaveLength(0)
  })
})

describe('client progress tab: the wires are measured, never invented', () => {
  it('paints the layer behind the nodes, and draws nothing where there is no layout', () => {
    const page = pageOf(finishedRun())()
    const svg = hookOf(page, 'data-gw-progress-wires')
    expect(svg.type).toBe('svg')
    expect(classesOf(svg)).toEqual(['gw-progress-wires'])
    expect(attr(svg, 'aria-hidden')).toBe('true')
    // A stub renderer has no layout, so the measurement returns nothing and nothing is
    // drawn: no coordinate on this page was guessed.
    expect((svg.children as unknown[]).flat(Infinity)).toHaveLength(0)
    // The wire layer sits inside the flow, before the nodes it is painted behind.
    const order = walk(page)
    expect(order.indexOf(svg)).toBeGreaterThan(order.indexOf(hookOf(page, 'data-gw-progress-flow')))
    expect(order.indexOf(svg)).toBeLessThan(order.indexOf(hookOf(page, 'data-gw-progress-nodes')))
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

  it('lays the layer over the flow without taking a click', () => {
    const wires = ruleOf('.gw-progress-wires')
    expect(wires).toContain('position: absolute')
    expect(wires).toContain('pointer-events: none')
    expect(wires).toContain('overflow: visible')
    const drawn = progress.css.split('\n').find((line) => line.trim().startsWith('.gw-progress-wires path {'))
    expect(drawn, 'the wires carry no stroke').toBeDefined()
    expect(drawn).toContain('stroke: var(--dsw-alias-border-l2')
    expect(drawn).toContain('fill: none')
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
