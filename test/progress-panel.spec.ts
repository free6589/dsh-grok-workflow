import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The "进度" page is one task panel: a header, a branch-tree figure, a stuck line, the
 * Guardian card and the dock — and two readings a click can take out of the figure.
 *
 * ## What this file replaces, and what it carries forward
 *
 * `test/progress-flow.spec.ts` and `test/progress-lanes.spec.ts` pinned the two drawings the
 * operator retired: a row of leg columns, then a lane matrix of legs × plan tasks, each with
 * its own node list, call lists, toggle hooks and count line. None of that is on the page any
 * more, so both files are deleted and this one states the page that replaced them. Each
 * invariant below names the file it came from, so nothing true was dropped with the drawing:
 *
 * - was `progress-flow: the header, the flow, the count line and the dock` → the three zones,
 *   in order, with the count line retired and its one sentence moved into the header (#1);
 * - was `progress-flow: colour is the state` → one colour token per state and never a red
 *   one (#10);
 * - was `progress-flow: the wires are measured, never invented` → the layer exists on every
 *   page, is decoration, and paints no coordinate nobody measured (#3, #10);
 * - was `progress-flow: a node opens its own calls` → a node's calls open from that node and
 *   nowhere else (#5) — now on the node's own body rather than a separate toggle;
 * - was `progress-flow: the task cells` → a plan task is a node of its own, titled with the
 *   phase the recorder wrote (#4);
 * - was `progress-flow: a retry is drawn, not swallowed` → one dot per attempt, the `第 N
 *   遍` badge, and the dashed step between two (#3);
 * - was `progress-lanes: the typed half is untouched` → the derivation the two halves share
 *   is still `deriveProgressFlow`'s, and this file reads the bundle only (#3);
 * - was `progress-lanes: no new words` → the page prints no sentence of its own (#9);
 * - was `progress-lanes: the geometry` → the box, the capsule ends and the 720 px breakpoint
 *   (#10, #11).
 *
 * New, and the reason the operator asked for this round: the figure is drawn from the mermaid
 * text it carries (#2 — start, plan, execute, check, review, summarize, end), and one click
 * both opens a node's calls and lights the wires that touch it (#5, #6).
 *
 * The bundle is loaded the way the host loads it (a stub `__ModuleLoader__` and a stub React
 * whose `useState` really stores), so a click is a real second render. No test here needs a
 * DOM, a layout engine or a model.
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

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    fold: (records: ReadonlyArray<Record<string, unknown>>) => ProgressRun[]
    mount: (ctx: Record<string, unknown>, services: Record<string, unknown>, i18n: Record<string, unknown>, status: Record<string, unknown>, fail: (stage: string, error: unknown) => void) => unknown
    derivePanelGraph: (run: ProgressRun, t?: Translator) => {
      state: string
      mermaid: string
      nodes: Array<{
        id: string
        kind: string
        state: string
        current: boolean
        ordinal: number
        taskNumber?: number
        label: string
        openable: boolean
        calls: ProgressMember[]
        attempts: Array<{ seq: number, state: string }>
        rejected?: { drafts: number, stage: string, reason: string }
      }>
      edges: Array<{ from: string, to: string, kind: string }>
      stuck?: { nodeId: string, at: number, kind: string }
      at: number
      total: number
      remaining: number
    }
    parsePanelMermaid: (text: string) => {
      direction: string
      nodes: Array<{ id: string, label: string, shape: string }>
      edges: Array<{ from: string, to: string }>
    }
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
 * it. `useEffect` never runs, which is also the statement that a host without layout still
 * renders — the figure falls back to the default boxes.
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

/** Every element carrying one class token, in document order. */
function withClass(tree: unknown, name: string): Element[] {
  return walk(tree).filter((element) => classesOf(element).includes(name))
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
 * 进行中: two plan tasks under one execute visit, a retry inside the first of them, one of
 * them still open. The shape the panel is built for: one leg, two branches, one branch with
 * two attempts.
 */
function runningRun(): ProgressRun {
  return runOf('两个任务', [
    member(1, '规划助手', '规划', 'completed'),
    member(2, '执行', '任务 1 · 建表', 'failed'),
    member(3, '执行', '任务 1 · 建表', 'completed'),
    member(4, '执行', '任务 2 · 写文档'),
  ])
}

/** 已完成: every leg passed and the first summary draft shipped. */
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
 * verdict is the only thing the summary step carries.
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

/**
 * 一条腿里没有任务号: two work calls of the same leg and no plan task between them.
 *
 * This is the shape a step's **own** call list is read in: a leg that walked plan tasks hands
 * every row to a branch, so a leg keeps calls of its own only when nothing numbered them.
 */
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

/** Every node of one page, in document order, by the hook the panel names. */
function nodesOf(page: unknown): Element[] {
  return hooksOf(page, 'data-gw-progress-pnode')
}

/** The id of every node of one page, in document order. */
function nodeIdsOf(page: unknown): string[] {
  return nodesOf(page).map((node) => attr(node, 'data-gw-progress-pnode')!)
}

/** The body of one node — the `button` or `div` that carries its word. */
function bodyOf(page: unknown, id: string): Element {
  const node = nodesOf(page).find((element) => attr(element, 'data-gw-progress-pnode') === id)
  expect(node, `the page drew no node ${id}`).toBeDefined()
  const body = walk(node!).find((element) => classesOf(element).includes('gw-progress-pnode-body'))
  expect(body, `node ${id} has no body`).toBeDefined()
  return body!
}

/** Click the control that opens one node, and reopen the page. */
function clickNode(view: () => unknown, id: string): unknown {
  const body = bodyOf(view(), id)
  expect(body.type, `node ${id} is not a control`).toBe('button')
  ;(body.props['onClick'] as () => void)()
  return view()
}

describe('the panel: three zones, in the order a reader reads them', () => {
  it('draws the header, the figure, the Guardian and the dock — and nothing else', () => {
    const page = pageOf(guardedRun())
    const order = walk(page)
    const at = (hook: string) => order.indexOf(hookOf(page, hook))
    expect(at('data-gw-progress-bar')).toBeGreaterThanOrEqual(0)
    expect(at('data-gw-progress-graph')).toBeGreaterThan(at('data-gw-progress-bar'))
    // The wire layer sits inside the figure, before the nodes it is drawn behind.
    expect(at('data-gw-progress-wires')).toBeGreaterThan(at('data-gw-progress-graph'))
    expect(at('data-gw-progress-pnodes')).toBeGreaterThan(at('data-gw-progress-wires'))
    expect(at('data-gw-progress-guardian')).toBeGreaterThan(at('data-gw-progress-pnodes'))
    expect(at('data-gw-progress-dock')).toBeGreaterThan(at('data-gw-progress-guardian'))
    // The Guardian is a sibling of the figure, never a column inside it.
    expect(hooksOf(hookOf(page, 'data-gw-progress-graph'), 'data-gw-progress-guardian')).toHaveLength(0)
    // A run with no guardian draws none, and the figure is still the page.
    expect(hooksOf(pageOf(runningRun()), 'data-gw-progress-guardian')).toHaveLength(0)
  })

  it('says the step and the measured remainder on the head line, and nothing else', () => {
    // 进行中: two steps done, one being worked, one ahead. The remainder rests on the one
    // finished step that was measured, and the tooltip is where that method is stated.
    const running = hookOf(pageOf(runningRun()), 'data-gw-progress-line')
    expect(running.type).toBe('p')
    expect(classesOf(running)).toEqual(['gw-progress-line'])
    expect(textOf(running)).toBe('第 3 步，共 4 步 · 还剩约 20 秒')
    expect(attr(running, 'title')).toBe(zh('progress.panel.etaBasis', { n: 1 }))
    // 等你点头: nothing walked yet, so the reader's place is the start and no step is left
    // over to estimate — the clause, and its tooltip, are simply absent.
    const waiting = hookOf(pageOf(waitingRun()), 'data-gw-progress-line')
    expect(textOf(waiting)).toBe('第 1 步，共 2 步')
    expect(attr(waiting, 'title')).toBeUndefined()
    // 已完成: every step walked, nothing left, so there is nothing to estimate either.
    expect(textOf(hookOf(pageOf(doneRun()), 'data-gw-progress-line'))).toBe('第 6 步，共 6 步')
    expect(attr(hookOf(pageOf(doneRun()), 'data-gw-progress-line'), 'title')).toBeUndefined()
    // The chip is the run's own state, and its word is the reader's.
    expect(attr(hookOf(pageOf(runningRun()), 'data-gw-progress-chip'), 'data-state')).toBe('running')
    expect(textOf(hookOf(pageOf(doneRun()), 'data-gw-progress-chip'))).toBe('已完成')
    expect(textOf(hookOf(pageOf(waitingRun()), 'data-gw-progress-chip'))).toBe('等你点头')
    expect(textOf(hookOf(pageOf(failedRun()), 'data-gw-progress-chip'))).toBe('未通过')
    expect(textOf(hookOf(pageOf(cancelledRun()), 'data-gw-progress-chip'))).toBe('已取消')
  })

  it('carries no count line, no matrix, no lane and no node toggle, in the tree or the bundle', () => {
    // The retired vocabulary of the two drawings this page replaced. Each name is matched as
    // a whole attribute, so `data-gw-progress-node` never eats `data-gw-progress-node-calls`.
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
    expect(css).not.toContain('overflow-x')
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
      'gw-progress-line',
      'gw-progress-graph',
      'gw-progress-wires',
      'gw-progress-pnodes',
      'gw-progress-pnode',
      'gw-progress-pnode-body',
      'gw-progress-pnode-dot',
      'gw-progress-pnode-word',
      'gw-progress-pnode-badge',
      'gw-progress-pnode-dots',
      'gw-progress-pnode-attempt',
      'gw-progress-pnode-retry',
      'gw-progress-node-calls',
      'gw-progress-node-rejected',
      'gw-progress-stuck',
      'gw-progress-dock-fill',
    ]) expect(styled, name).toContain(name)
    for (const name of ['gw-progress-flow', 'gw-progress-cols', 'gw-progress-col', 'gw-progress-subs', 'gw-progress-left', 'gw-progress-node', 'gw-progress-node-toggle']) {
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
    // Unreached is the only dashed one, and the current one is the only one that breathes.
    expect(ruleWith('.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-body')).toContain('border-style: dashed')
    expect(ruleWith('.gw-progress-pnode[data-current="true"] .gw-progress-pnode-body')).toContain('box-shadow')
    expect(mediaBlock('prefers-reduced-motion: reduce')).toContain('animation: none')
  })

  it('switches the layout at 720px, and never scrolls sideways at any width', () => {
    // The layout engine stacks the figure below 720 px; the sheet says what a card does then.
    const narrow = mediaBlock('max-width: 720px')
    expect(narrow, 'the 720px breakpoint is gone').not.toBe('')
    const word = narrow.split('\n').find((line) => line.trim().startsWith('.gw-progress-pnode-word {'))
    expect(word, 'a phone must not cut a word').toBeDefined()
    expect(word).toContain('white-space: normal')
    expect(word).toContain('overflow-wrap: anywhere')
    const card = narrow.split('\n').find((line) => line.trim().startsWith('.gw-progress-pnode-body {'))
    expect(card).toContain('min-height: 34px')
    expect(card).toContain('padding: 6px 10px')
    // Under 480 px the dock stacks and a call line drops its clock — the figure keeps its
    // shape, because a second reflow is how a tree loses its branches.
    const small = mediaBlock('max-width: 480px')
    expect(small, 'the 480px breakpoint is gone').not.toBe('')
    expect(small).toMatch(/\.gw-progress-dock \{[^}]*flex-direction: column/)
    expect(small).toMatch(/\.gw-progress-node-calls \.gw-progress-log-time \{[^}]*display: none/)
    expect(small).not.toMatch(/\.gw-progress-pnodes \{/)
    // Nothing on this page scrolls sideways at any width: the layout asks for the column it
    // is given, and the only scroll box is a node's own opened list, which scrolls down.
    expect(progress.css).not.toContain('overflow-x')
    expect(ruleWith('.gw-progress-node-calls')).toContain('overflow-y: auto')
  })
})

describe('the figure is drawn from the mermaid text it carries', () => {
  it('renders the text it carries, and the text parses back to the same graph', () => {
    const page = pageOf(runningRun())
    const graph = hookOf(page, 'data-gw-progress-graph')
    expect(graph.type).toBe('div')
    const source = attr(graph, 'data-gw-progress-source')!
    expect(source.split('\n')[0]).toBe('flowchart TD')
    const parsed = progress.parsePanelMermaid(source)
    // The picture and the text cannot disagree: one node and one edge per line, on both sides.
    expect(parsed.nodes).toHaveLength(nodesOf(page).length)
    expect(parsed.nodes).toHaveLength(6)
    // The tree keeps the model's own ids, so a reader of the DOM never meets the one word
    // the text had to rename (`end` closes a subgraph, so the text writes `finish`).
    expect(nodeIdsOf(page)).toEqual(['start', 'plan', 'execute', 'execute_t1', 'execute_t2', 'end'])
    expect(parsed.nodes.map((node) => node.id)).toEqual(['start', 'plan', 'execute', 'execute_t1', 'execute_t2', 'finish'])
    expect(hooksOf(page, 'data-gw-progress-edge')).toHaveLength(parsed.edges.length)
    expect(hooksOf(page, 'data-gw-progress-edge')).toHaveLength(6)
  })

  it('writes the id, the kind, the state, the reader’s place and the task number on every node', () => {
    const page = pageOf(runningRun())
    const nodes = nodesOf(page)
    expect(nodes.map((node) => [
      attr(node, 'data-gw-progress-pnode'),
      attr(node, 'data-kind'),
      attr(node, 'data-state'),
      attr(node, 'data-current'),
      attr(node, 'data-ordinal'),
      attr(node, 'data-task'),
    ])).toEqual([
      ['start', 'start', 'done', 'false', '0', undefined],
      ['plan', 'plan', 'done', 'false', '1', undefined],
      ['execute', 'execute', 'doing', 'true', '1', undefined],
      ['execute_t1', 'task', 'done', 'false', '1', '1'],
      ['execute_t2', 'task', 'doing', 'false', '2', '2'],
      ['end', 'end', 'pending', 'false', '0', undefined],
    ])
    // Exactly one node is the reader's place, and it is the leg being worked.
    expect(nodes.filter((node) => attr(node, 'data-current') === 'true')).toHaveLength(1)
    // The start is a place the run has been: it is done on every page, whatever the stream
    // says. The end follows the engine's own word.
    for (const run of [waitingRun(), runningRun(), doneRun(), rejectedRun()]) {
      expect(attr(nodesOf(pageOf(run)).find((node) => attr(node, 'data-kind') === 'start')!, 'data-state'), run.name).toBe('done')
    }
    const endOf = (run: ProgressRun) => nodesOf(pageOf(run)).find((node) => attr(node, 'data-kind') === 'end')!
    expect(attr(endOf(waitingRun()), 'data-state')).toBe('pending')
    expect(attr(endOf(doneRun()), 'data-state')).toBe('done')
    expect(attr(endOf(failedRun()), 'data-state')).toBe('failed')
    expect(attr(endOf(cancelledRun()), 'data-state')).toBe('cancelled')
    // Every node is placed by the layout; its height is left to the box the page measures.
    for (const node of nodes) {
      expect(Object.keys(node.props['style'] as Record<string, string>).sort()).toEqual(['left', 'top', 'width'])
    }
    // The visible word is the leg, or the task's own title, plus the badge when one is due.
    expect(hooksOf(page, 'data-gw-progress-pnode-word').map(textOf))
      .toEqual(['起点', '规划', '执行', '任务 1 · 建表', '任务 2 · 写文档', '终点'])
    expect(hooksOf(page, 'data-gw-progress-pnode-badge').map(textOf)).toEqual(['第 2 遍'])
    // The state is spoken, never printed.
    expect(nodes.map((node) => attr(node, 'aria-label'))).toEqual([
      '起点 过了',
      '规划 过了',
      '执行 在做',
      '任务 1 · 建表 第 2 遍 过了',
      '任务 2 · 写文档 在做',
      '终点 等着',
    ])
    for (const text of pageTexts(page)) expect(text).not.toContain(zh('progress.plan.done'))
  })

  it('draws one dot per attempt with its own state, and the dashed step between two', () => {
    const page = pageOf(runningRun())
    const dots = withClass(page, 'gw-progress-pnode-attempt')
    expect(dots.map((dot) => [attr(dot, 'data-attempt'), attr(dot, 'data-state')]))
      .toEqual([['1', 'failed'], ['2', 'done'], ['1', 'doing']])
    for (const dot of dots) expect(attr(dot, 'aria-hidden')).toBe('true')
    // The retry mark sits between the pair that is a retry, and nowhere else.
    const retries = withClass(page, 'gw-progress-pnode-retry')
    expect(retries).toHaveLength(1)
    const task = hooksOf(page, 'data-gw-progress-pnode').find((node) => attr(node, 'data-gw-progress-pnode') === 'execute_t1')!
    const order = walk(task).map((element) => classesOf(element).join(' '))
    expect(order.indexOf('gw-progress-pnode-attempt')).toBeLessThan(order.indexOf('gw-progress-pnode-retry'))
    expect(order.indexOf('gw-progress-pnode-retry')).toBeLessThan(order.lastIndexOf('gw-progress-pnode-attempt'))
    // One try each: one dot per task, and no mark at all. The one badge on the page is the
    // summary's draft number, which every summary node prints.
    const once = pageOf(doneRun())
    expect(withClass(once, 'gw-progress-pnode-attempt').map((dot) => attr(dot, 'data-attempt'))).toEqual(['1', '1'])
    expect(withClass(once, 'gw-progress-pnode-retry')).toHaveLength(0)
    expect(hooksOf(once, 'data-gw-progress-pnode-badge').map(textOf)).toEqual(['第 1 稿'])
    for (const task of hooksOf(once, 'data-gw-progress-pnode').filter((node) => attr(node, 'data-kind') === 'task')) {
      expect(hooksOf(task, 'data-gw-progress-pnode-badge'), 'a first try carries no word').toHaveLength(0)
    }
  })

  it('gives a branch only to a leg whose rows name a task, and prints the title verbatim', () => {
    const page = pageOf(runningRun())
    // The `执行` leg walked two tasks: one branch each, in task order, titled with the phase
    // the recorder wrote — nothing shortens, translates or re-words it.
    const tasks = nodesOf(page).filter((node) => attr(node, 'data-kind') === 'task')
    expect(tasks.map((node) => [attr(node, 'data-gw-progress-pnode'), attr(node, 'data-task'), attr(node, 'data-state')]))
      .toEqual([['execute_t1', '1', 'done'], ['execute_t2', '2', 'doing']])
    // The visible word of a branch is the task's own title, verbatim; its badge is separate.
    expect(tasks.map((node) => textOf(hooksOf(node, 'data-gw-progress-pnode-word')[0]!)))
      .toEqual(['任务 1 · 建表', '任务 2 · 写文档'])
    // The plan leg named no task, so it gets no branch — and its own row stays its own call.
    expect(nodeIdsOf(page).filter((id) => id.startsWith('plan'))).toEqual(['plan'])
    // A leg whose rows name no task at all keeps them: no branch, calls of its own.
    const loose = pageOf(looseRun())
    expect(nodeIdsOf(loose)).toEqual(['start', 'plan', 'execute', 'end'])
    // …and the tasks that were tried once carry no attempt badge.
    expect(hooksOf(loose, 'data-gw-progress-pnode-badge')).toHaveLength(0)
    // The guardian's own call is not a leg of the work: it has its own card.
    const guarded = progress.derivePanelGraph({
      ...runOf('guardian', [member(1, '执行', '任务 1 · 建表', 'completed'), member(2, 'Guardian', 'Guardian', 'completed')]),
    }, zh)
    expect(guarded.nodes.flatMap((node) => node.calls.map((row) => row.seq))).toEqual([1])
  })
})

describe('a click opens the calls a node made', () => {
  it('opens one node into its own calls, and closes it again', () => {
    const view = mount(looseRun())
    const closed = view()
    expect(hooksOf(closed, 'data-gw-progress-node-calls')).toHaveLength(0)
    expect(hooksOf(closed, 'data-gw-progress-log-row')).toHaveLength(0)

    const body = bodyOf(closed, 'execute')
    expect(body.type).toBe('button')
    expect(attr(body, 'type')).toBe('button')
    expect(attr(body, 'aria-expanded')).toBe('false')
    expect(attr(body, 'aria-controls')).toBe('gw-progress-calls-execute')
    expect(hooksOf(body, 'data-gw-progress-pnode-open')).toHaveLength(1)

    const opened = clickNode(view, 'execute')
    const list = hookOf(opened, 'data-gw-progress-node-calls')
    expect(list.type).toBe('ol')
    expect(classesOf(list)).toEqual(['gw-progress-node-calls'])
    expect(attr(list, 'data-gw-progress-node-calls')).toBe('execute')
    expect(attr(list, 'id')).toBe('gw-progress-calls-execute')
    expect(attr(bodyOf(opened, 'execute'), 'aria-expanded')).toBe('true')
    // Only this node's rows, in `seq` order, each with its clock, gate and word.
    const rows = hooksOf(list, 'data-gw-progress-log-row')
    expect(rows.map((row) => attr(row, 'data-gw-progress-log-row'))).toEqual(['2', '3'])
    expect(rows.map((row) => attr(row, 'data-state'))).toEqual(['done', 'doing'])
    expect(rows.map(textOf)).toEqual([
      `${clockOf(2)} 执行 做完`,
      `${clockOf(3)} 执行 正在看`,
    ])
    // A second click on the same node closes it, and nothing else was ever open.
    const closedAgain = clickNode(view, 'execute')
    expect(hooksOf(closedAgain, 'data-gw-progress-node-calls')).toHaveLength(0)
    expect(attr(bodyOf(closedAgain, 'execute'), 'aria-expanded')).toBe('false')
  })

  it('keeps a node with nothing to open a mark, with no button and no tab stop', () => {
    // The two ends declare nothing, so they are the same box they always were.
    const page = pageOf(runningRun())
    for (const id of ['start', 'end']) {
      expect(bodyOf(page, id).type, id).toBe('div')
      expect(hooksOf(bodyOf(page, id), 'data-gw-progress-pnode-open'), id).toHaveLength(0)
    }
    // The `执行` leg handed every row to a branch, so the leg itself has nothing to open —
    // and it is the very node a reader points at to see its wires, so it still answers.
    const execute = nodesOf(page).find((node) => attr(node, 'data-gw-progress-pnode') === 'execute')!
    expect(bodyOf(page, 'execute').type).toBe('div')
    expect(execute.props['onClick']).toBeTypeOf('function')
    // A node that does carry a button is the one that answers the click, so one click is one
    // action even where the two readings meet.
    const plan = nodesOf(page).find((node) => attr(node, 'data-gw-progress-pnode') === 'plan')!
    expect(plan.props['onClick']).toBeUndefined()
    expect(bodyOf(page, 'plan').props['onClick']).toBeTypeOf('function')
    // No control on this page is a tab stop it did not claim: only the buttons are.
    for (const element of walk(page)) {
      if (element.type === 'button') continue
      expect(element.props['tabIndex'], 'an inert mark must not be tabbable').toBeUndefined()
    }
  })

  it('opens the all-rejected verdict inside the summary node that never declared a call', () => {
    const run = rejectedRun()
    // The `model` strategy summarised inside the parent, so nothing named the leg. The step
    // the run really took is drawn all the same, amber, with no call of its own.
    const graph = progress.derivePanelGraph(run, zh)
    const summary = graph.nodes.find((node) => node.kind === 'summarize')!
    expect(summary.calls).toEqual([])
    expect(summary.rejected).toBeDefined()
    expect(summary.openable).toBe(true)

    const view = mount(run)
    const closed = view()
    expect(hooksOf(closed, 'data-gw-progress-node-rejected')).toHaveLength(0)
    expect(hooksOf(closed, 'data-gw-progress-pnode').map((node) => attr(node, 'data-state')))
      .toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'failed', 'done'])
    const opened = clickNode(view, 'summarize')
    const list = hookOf(opened, 'data-gw-progress-node-calls')
    expect(attr(list, 'data-gw-progress-node-calls')).toBe('summarize')
    // No rows: the verdict is the only thing that node has to say.
    expect(hooksOf(list, 'data-gw-progress-log-row')).toHaveLength(0)
    expect(hooksOf(list, 'data-gw-progress-node-rejected').map((row) => attr(row, 'data-gw-progress-node-rejected')))
      .toEqual(['drafts', 'stage', 'reason'])
    expect(hooksOf(list, 'data-gw-progress-node-rejected').map(textOf))
      .toEqual(['第 2 稿全被退回', '卡在复核', `最后不过：${REJECTED_REASON}`])
  })

  it('marks the row the gate shipped, and only that row', () => {
    const view = mount(doneRun())
    const opened = clickNode(view, 'summarize')
    const rows = hooksOf(opened, 'data-gw-progress-log-row')
    expect(rows.map((row) => attr(row, 'data-gw-progress-log-row'))).toEqual(['4'])
    // The shipped row says 交卷; the plan's own row in the same page says 做完.
    expect(rows.map(textOf)).toEqual([`${clockOf(4)} 汇总·第1稿 汇总 交卷`])
    const planRow = hooksOf(clickNode(view, 'plan'), 'data-gw-progress-log-row')
      .find((row) => attr(row, 'data-gw-progress-log-row') === '1')!
    expect(textOf(planRow)).toBe(`${clockOf(1)} 规划助手 规划 做完`)
    // A run that named no draft marks no row.
    const plain = mount(runningRun())
    expect(hooksOf(clickNode(plain, 'plan'), 'data-gw-progress-log-row').map(textOf))
      .toEqual([`${clockOf(1)} 规划助手 规划 做完`])
  })

  it('drops a task name that is only the role said twice', () => {
    // Every row of this fixture logs `执行 执行`: the name would repeat the role word, so it
    // is dropped — and the gate's own capsule and the word stay, so the drop costs nothing.
    const view = mount(looseRun())
    const rows = hooksOf(clickNode(view, 'execute'), 'data-gw-progress-log-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(hooksOf(row, 'data-gw-progress-log-name')).toHaveLength(0)
      // `执行` names a chain slot, so the gate is drawn as that slot's capsule.
      expect(hooksOf(row, 'data-gw-progress-task-chain')).toHaveLength(1)
      expect(hooksOf(row, 'data-gw-progress-log-word')).toHaveLength(1)
    }
    expect(rows.map(textOf)).toEqual([`${clockOf(2)} 执行 做完`, `${clockOf(3)} 执行 正在看`])
  })
})

describe('a click traces the wires that touch the node', () => {
  /** The `data-trace` of every edge of one page, keyed `from->to`. */
  function edgesOf(page: unknown): Array<[string, string | undefined]> {
    return hooksOf(page, 'data-gw-progress-edge')
      .map((edge) => [`${attr(edge, 'data-from')}->${attr(edge, 'data-to')}`, attr(edge, 'data-trace')] as [string, string | undefined])
  }

  /** The `data-trace` of every node of one page, keyed by id. */
  function nodesTrace(page: unknown): Array<[string, string | undefined]> {
    return nodesOf(page).map((node) => [attr(node, 'data-gw-progress-pnode')!, attr(node, 'data-trace')] as [string, string | undefined])
  }

  it('lights the wires that touch the node, dims the rest, and marks the node and its neighbours', () => {
    const view = mount(runningRun())
    // Untraced, every wire carries no mark at all: nobody asked for a reading.
    expect(edgesOf(view()).map(([, trace]) => trace)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])

    const page = clickNode(view, 'execute_t1')
    expect(edgesOf(page)).toEqual([
      ['start->plan', 'dim'],
      ['plan->execute', 'dim'],
      ['execute->execute_t1', 'active'],
      ['execute_t1->end', 'active'],
      ['execute->execute_t2', 'dim'],
      ['execute_t2->end', 'dim'],
    ])
    // The node itself and the two it is wired to; no third one.
    expect(nodesTrace(page)).toEqual([
      ['start', undefined],
      ['plan', undefined],
      ['execute', 'active'],
      ['execute_t1', 'active'],
      ['execute_t2', undefined],
      ['end', 'active'],
    ])
  })

  it('turns the trace over on a second click of the same node, and hands the reading on', () => {
    const view = mount(runningRun())
    clickNode(view, 'execute_t1')
    expect(edgesOf(view()).filter(([, trace]) => trace === 'active')).toHaveLength(2)
    // The same node again: nothing is traced any more.
    const cleared = clickNode(view, 'execute_t1')
    expect(edgesOf(cleared).map(([, trace]) => trace)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    expect(nodesTrace(cleared).map(([, trace]) => trace)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    // Another node: the reading moves to that node's own wires, not both at once.
    clickNode(view, 'execute_t1')
    const moved = clickNode(view, 'plan')
    expect(edgesOf(moved)).toEqual([
      ['start->plan', 'active'],
      ['plan->execute', 'active'],
      ['execute->execute_t1', 'dim'],
      ['execute_t1->end', 'dim'],
      ['execute->execute_t2', 'dim'],
      ['execute_t2->end', 'dim'],
    ])
  })

  it('clears on a click on the empty figure, and not on one that bubbled up from a node', () => {
    const view = mount(runningRun())
    clickNode(view, 'plan')
    const page = view()
    const graph = hookOf(page, 'data-gw-progress-graph')
    const onClick = graph.props['onClick'] as (event?: unknown) => void
    expect(onClick, 'the figure is the page’s never-mind target').toBeTypeOf('function')

    // A click on a node reaches the container too. It is the node's own click, so it must not
    // clear what that same click just set.
    onClick({ target: { id: 'a node' }, currentTarget: graph })
    expect(edgesOf(view()).filter(([, trace]) => trace === 'active')).toHaveLength(2)
    // A click on the figure itself clears it.
    onClick({ target: graph, currentTarget: graph })
    expect(edgesOf(view()).map(([, trace]) => trace)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    // …and the calls a reader opened are their own reading: clearing the trace keeps them.
    expect(hooksOf(view(), 'data-gw-progress-node-calls')).toHaveLength(1)
  })

  it('puts the trace’s one word on a node button that has a wire, and nowhere else', () => {
    const page = pageOf(runningRun())
    expect(zh('progress.panel.trace')).toBe('看线')
    expect(attr(bodyOf(page, 'plan'), 'title')).toBe('看线')
    expect(attr(bodyOf(page, 'execute_t1'), 'title')).toBe('看线')
    // A node with no control has no tooltip to promise a reading with.
    expect(attr(bodyOf(page, 'start'), 'title')).toBeUndefined()
    expect(attr(bodyOf(page, 'end'), 'title')).toBeUndefined()
    // The word is the affordance's, not the node's: it never joins the label a screen reader
    // speaks, or the word the figure prints.
    for (const node of nodesOf(page)) expect(attr(node, 'aria-label')).not.toContain('看线')
    for (const text of pageTexts(page)) expect(text).not.toContain('看线')
    // …and the English reader gets the same affordance in their own words.
    expect(en('progress.panel.trace')).toBe('Trace its wires')
  })
})

describe('the stuck line: one sentence, and only while something is stuck', () => {
  it('names the step the run is held at, in the shape of what went wrong', () => {
    expect(hooksOf(pageOf(runningRun()), 'data-gw-progress-stuck')).toHaveLength(0)
    expect(hooksOf(pageOf(doneRun()), 'data-gw-progress-stuck')).toHaveLength(0)
    // A cancelled run is not stuck: the chip already said cancelled.
    expect(hooksOf(pageOf(cancelledRun()), 'data-gw-progress-stuck')).toHaveLength(0)
    // An unrecovered failure, a step that never reported back, a gate that turned every
    // draft away: three verdicts, one line each.
    expect(textOf(hookOf(pageOf(failedRun()), 'data-gw-progress-stuck'))).toBe('卡在 3：执行 第 1 遍没过')
    expect(textOf(hookOf(pageOf(rejectedRun()), 'data-gw-progress-stuck'))).toBe('卡在 5：2 稿全被退回')
    const blocked = runOf('没有回报', [
      member(1, '规划助手', '规划', 'completed'),
      member(2, '执行', '任务 1 · 建表'),
    ], { stopReason: 'error' })
    expect(textOf(hookOf(pageOf(blocked), 'data-gw-progress-stuck'))).toBe('卡在 3：这一步没有回报')
    // The line is a status, a sibling after the figure, and before the Guardian card.
    const page = pageOf({ ...failedRun(), guardian: GUARDIAN })
    const order = walk(page)
    expect(order.indexOf(hookOf(page, 'data-gw-progress-stuck'))).toBeGreaterThan(order.indexOf(hookOf(page, 'data-gw-progress-graph')))
    expect(order.indexOf(hookOf(page, 'data-gw-progress-stuck'))).toBeLessThan(order.indexOf(hookOf(page, 'data-gw-progress-guardian')))
  })
})

describe('the dock: one button that fills the box, or nothing', () => {
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

  it('offers the button a waiting run and a finished run asked for, and none while working', () => {
    expect(textOf(hookOf(pageOf(waitingRun(), { fillDraft: () => true }), 'data-gw-progress-dock-fill'))).toBe('开工')
    expect(textOf(hookOf(pageOf(doneRun(), { fillDraft: () => true }), 'data-gw-progress-dock-fill'))).toBe('收下这版')
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
    // Every control the page has, in one pass: each node that opens, the figure's own
    // background, and the dock — a working run has no dock button, so its nodes are the test.
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

    // The dock's one button, on a run that asks for it: one scoped write, and no send.
    const dockView = pageWith(injectedProps(record.services), doneRun())
    const button = hookOf(dockView(), 'data-gw-progress-dock-fill')
    ;(button.props['onClick'] as () => void)()
    expect(record.calls).toEqual(['for:scope-ctx', 'setDraft:确认'])
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
      expect(copy).not.toMatch(/通过率|预计|剩余|大约|pass rate|ETA/iu)
    }
    // The one estimate the page prints is the measured remainder, and its sentence is the
    // only place the word appears.
    expect(pageTexts(pageOf(runningRun())).join('\n')).toContain('还剩约 20 秒')
  })

  it('adds no sentence explaining the page, in the tree or in a spoken attribute', () => {
    // The page's whole vocabulary: the run's name, the chip, one step sentence, the leg and
    // task words, the badges, the stuck line, the Guardian's own words and the dock.
    const page = pageOf(guardedRun())
    const allowed = new Set(['任务团队 · 两个任务', '进行中', '第 3 步，共 4 步 · 还剩约 20 秒'])
    for (const word of ['起点', '规划', '执行', '任务 1 · 建表', '任务 2 · 写文档', '终点', '第 2 遍']) allowed.add(word)
    const spoken = walk(page).flatMap((element) => ['title', 'aria-label']
      .map((name) => element.props[name])
      .filter((value): value is string => typeof value === 'string' && value.trim() !== ''))
    for (const text of spoken) {
      // A tooltip may name a leg or repeat a word; it may never be a sentence about the page.
      expect(text.length, text).toBeLessThan(60)
      expect(text).not.toMatch(/[。；！？]/u)
    }
  })

  it('renders the empty page when the session has no run, and no figure at all', () => {
    const page = pageOf(undefined)
    expect(hooksOf(page, 'data-progress-empty')).toHaveLength(1)
    expect(pageTexts(page)).toEqual([bundle.GROK_WORKFLOW_DICT['zh']!['progress.empty.title']!])
    expect(hooksOf(page, 'data-gw-progress-graph')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-dock')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-chip')).toHaveLength(0)
    // The stylesheet is part of the tab's own tree, so it leaves when the tab unmounts.
    expect(hooksOf(page, 'data-gw-progress-css')).toHaveLength(1)
  })
})

/**
 * The narrow width: the opened calls leave the figure.
 *
 * Below the breakpoint the cards are one column, and a list that floats out from under one of
 * them lands on the card beside it — the same overlap the phone soak photographed. Making the
 * list `position: static` would not help: the cards are placed by the layout and no sibling
 * moves for another one's popup. So the list is drawn **outside** the figure, in the panel's
 * own column under it, where it can only push the page down.
 *
 * Where the list is drawn is a render decision, not a paint one, so the page reads the
 * breakpoint in JS: `matchMedia` is the whole seam, and a test gets a phone by standing in for
 * it. No layout engine is involved anywhere below.
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
  it('moves the list out of the card on a phone and leaves it there on a desktop', () => {
    // The desktop reading is the one that shipped: the list is the node's own child.
    const wide = withNarrow(false, () => clickNode(mount(runningRun()), 'execute_t1'))
    expect(hooksOf(wide, 'data-gw-progress-sheet')).toHaveLength(0)
    const wideNode = nodesOf(wide).find((node) => attr(node, 'data-gw-progress-pnode') === 'execute_t1')!
    expect(hooksOf(wideNode, 'data-gw-progress-node-calls')).toHaveLength(1)
    const wideRows = hooksOf(callsOf(wide), 'data-gw-progress-log-row').map(textOf)

    // The phone reading: the same node, the same click, and the list is not in the card.
    const phone = onPhone(() => clickNode(mount(runningRun()), 'execute_t1'))
    const sheet = hookOf(phone, 'data-gw-progress-sheet')
    expect(classesOf(sheet)).toEqual(['gw-progress-sheet'])
    const list = callsOf(phone)
    expect(hooksOf(hookOf(phone, 'data-gw-progress-graph'), 'data-gw-progress-sheet')).toHaveLength(0)
    for (const node of nodesOf(phone)) expect(hooksOf(node, 'data-gw-progress-node-calls')).toHaveLength(0)
    // Same list, same id, same rows — only the box that carries them changed.
    expect(hooksOf(sheet, 'data-gw-progress-node-calls')).toEqual([list])
    expect(attr(list, 'id')).toBe('gw-progress-calls-execute_t1')
    expect(attr(list, 'data-gw-progress-node-calls')).toBe('execute_t1')
    expect(hooksOf(list, 'data-gw-progress-log-row').map(textOf)).toEqual(wideRows)
    expect(wideRows).toHaveLength(2)
    // And the card it came from says what it opened, in the same two attributes.
    const body = bodyOf(phone, 'execute_t1')
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

  it('reads the breakpoint in JS, at the one number the stylesheet uses', () => {
    const queries: string[] = []
    withNarrow(true, () => pageOf(runningRun()), queries)
    expect(queries).toContain('(max-width: 720px)')
    // The same number, written twice, on purpose: the stylesheet wraps the cards and the page
    // decides where the list lives. A drift between them is a phone whose list is drawn in a
    // box that no longer fits.
    expect(mediaBlock('max-width: 720px')).not.toBe('')
    const narrow = ruleWith('.gw-progress-sheet')!
    expect(narrow).toContain('max-height: min(50vh, 240px)')
    expect(narrow).toContain('overflow-y: auto')
    // …and the only scroll box on the page still scrolls one way.
    expect(progress.css).not.toContain('overflow-x')
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
    ]) expect(styled, name).toContain(name)
  })

  it('keeps the node’s one click: open, close, and open again — and the sheet follows it', () => {
    const view = mount(looseRun())
    const closed = onPhone(() => view())
    expect(hooksOf(closed, 'data-gw-progress-sheet')).toHaveLength(0)
    expect(attr(bodyOf(closed, 'execute'), 'aria-expanded')).toBe('false')

    const opened = onPhone(() => clickNode(view, 'execute'))
    expect(hooksOf(opened, 'data-gw-progress-sheet')).toHaveLength(1)
    expect(attr(bodyOf(opened, 'execute'), 'aria-expanded')).toBe('true')
    // The wire reading is the same click's second half, on either width.
    expect(litNodes(opened)).toHaveLength(3)

    const closedAgain = onPhone(() => clickNode(view, 'execute'))
    expect(hooksOf(closedAgain, 'data-gw-progress-sheet')).toHaveLength(0)
    expect(attr(bodyOf(closedAgain, 'execute'), 'aria-expanded')).toBe('false')
    expect(litNodes(closedAgain)).toHaveLength(0)

    const third = onPhone(() => clickNode(view, 'execute'))
    expect(hooksOf(third, 'data-gw-progress-sheet')).toHaveLength(1)
    expect(litNodes(third)).toHaveLength(3)
  })

  it('puts the sheet away from the sheet’s own control, on the same channel', () => {
    const view = mount(looseRun())
    const opened = onPhone(() => clickNode(view, 'execute'))
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
    expect(attr(bodyOf(closed, 'execute'), 'aria-expanded')).toBe('false')
  })

  it('carries the verdict lines too, and asks nothing of a node with nothing to show', () => {
    const view = mount(rejectedRun())
    const opened = onPhone(() => clickNode(view, 'summarize'))
    const list = callsOf(opened)
    expect(hooksOf(hookOf(opened, 'data-gw-progress-sheet'), 'data-gw-progress-node-calls')).toEqual([list])
    expect(attr(list, 'data-gw-progress-node-calls')).toBe('summarize')
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

  it('words the sheet in both languages, and keeps its two words out of the wide page', () => {
    expect(zh('progress.panel.calls')).toBe('调用')
    expect(en('progress.panel.calls')).toBe('Calls')
    expect(zh('progress.panel.collapse')).toBe('收起')
    expect(en('progress.panel.collapse')).toBe('Hide')
    // On a desktop neither word is on the page at all: the sheet only exists at a narrow width.
    expect(pageTexts(pageOf(runningRun(), { fillDraft: () => true }))).not.toContain(zh('progress.panel.calls'))
    const phone = onPhone(() => clickNode(mount(runningRun()), 'plan'))
    const copy = pageTexts(phone)
    expect(copy).toContain(zh('progress.panel.calls'))
    expect(copy).toContain(zh('progress.panel.collapse'))
  })
})
