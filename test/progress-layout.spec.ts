import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The progress page's body: two columns, tile-shaped Guardian blocks, expandable task rows,
 * and a capped history.
 *
 * The one-page contract (`DESIGN-progress-tab.md` §19) settles *what* the page says; this
 * file settles *how it is laid out*, and it is written against the change that adds the
 * layout, not against the page it found:
 *
 * 1. **Two columns.** A `div.gw-progress-columns` exists only when the run recorded a
 *    Guardian (`run.guardian.started === true`). Its `div.gw-progress-main` holds the step
 *    list, the history and the shipped draft, in that order; its `aside.gw-progress-side`
 *    holds the Guardian panel. Without a Guardian the three sections render directly: no
 *    wrapper, no empty column. The header, 「现在」, the step bar, the amber flag, the
 *    「后面还有」 line and the dock stay outside the wrapper, above and below it.
 * 2. **The Guardian as blocks.** The panel is no longer one head and one meta line: it is a
 *    `div.gw-progress-guardian-blocks` of four tiles (`status`, `budget`, `count`,
 *    `findings`), laid out two by two, with the findings tile across both columns.
 * 3. **A task row opens in place.** The number and the body are one button carrying
 *    `aria-expanded` and `aria-controls`; the state word stays outside it; the open row
 *    draws one line per member of that task, each with its clock, its chain slot, its word
 *    and — when the shell can open it — its capsule.
 * 4. **The history is capped, not cut.** Past six lines the list gets a fold button; the
 *    folded list is capped in CSS and the expanded one is not.
 * 5. **Three new words, no others.** `progress.task.detail`, `progress.log.more` and
 *    `progress.log.less`, in both dictionaries, and no sentence that explains anything.
 *
 * The bundle is loaded the way the host loads it (a stub `__ModuleLoader__` and a stub
 * React), but the hook set here is **stateful**: a click has to be a real second render, or
 * "the row opens" would be a claim about a tree nobody re-drew. `test/progress-hint-absent
 * .spec.ts` holds the zero-explanation half of the same page; the two files do not import
 * each other, so each carries its own loader.
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

interface ProgressGuardianFinding {
  seq: number
  label: string
  signal: 'timeout' | 'heartbeat-loss'
  action: 'rescue' | 'observe' | 'cancel-run'
  reason: string
  atMs?: number
}

interface ProgressGuardian {
  started: boolean
  armed: boolean
  budgetMs: number
  ended: boolean
  cancelled: boolean
  findings: ProgressGuardianFinding[]
}

interface ProgressRun {
  runId: string
  name: string
  anchorSeq: number
  members: ProgressMember[]
  details: unknown[]
  stopReason?: string
  summaryFinalDraft?: number
  guardian?: ProgressGuardian
}

type Translator = (key: string, params?: Record<string, unknown>) => string

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    fold: (records: ReadonlyArray<Record<string, unknown>>) => ProgressRun[]
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
 * do for real is remember a cell: the fold button and a task row's toggle both write state,
 * and a no-op setter would make every "after the click" assertion a photograph of the tree
 * before it.
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

/** One attribute as the DOM would spell it: React writes booleans out as strings. */
function attr(element: Element, name: string): string | undefined {
  const value = element.props[name]
  if (value === undefined || value === null) return undefined
  return String(value)
}

/** The elements a tree nests around one element, outermost first. */
function ancestorsOf(tree: unknown, target: Element): Element[] {
  const found: Element[] = []
  const visit = (node: unknown, stack: Element[]): boolean => {
    if (node === null || node === undefined || typeof node !== 'object') return false
    if (Array.isArray(node)) {
      for (const child of node) if (visit(child, stack)) return true
      return false
    }
    const element = node as Element
    if (!('type' in element && 'props' in element)) return false
    if (element === target) {
      found.push(...stack)
      return true
    }
    stack.push(element)
    const hit = visit(element.children, stack)
    stack.pop()
    return hit
  }
  visit(tree, [])
  return found
}

/** One line of the scoped stylesheet that declares a rule (an at-rule is not a rule). */
function ruleOf(selector: string): string | undefined {
  return bundle.GROK_WORKFLOW_PROGRESS.css.split('\n').find((line) => line.trim().startsWith(`${selector} {`))
}

/** The stylesheet from one media query on, or `''` when the query is not there. */
function mediaBlock(query: string): string {
  const css = bundle.GROK_WORKFLOW_PROGRESS.css
  const at = css.indexOf(`@media (${query})`)
  return at === -1 ? '' : css.slice(at)
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

/**
 * Local wall-clock base of every fixture.
 *
 * Built from local components on purpose: a row prints the clock in the reader's own zone,
 * so a UTC epoch would make the expected string depend on the machine.
 */
const BASE = new Date(2026, 10, 25, 8, 2).getTime()

/** The clock a row starting at one session time prints (`8:03`). */
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

/** The Guardian facts a run carries when the recorder wrote a `guardian-start`. */
function guardianOf(findings: ProgressGuardianFinding[], overrides: Partial<ProgressGuardian> = {}): ProgressGuardian {
  return { started: true, armed: true, budgetMs: 240_000, ended: true, cancelled: false, findings, ...overrides }
}

/** The one intervention the harness's own Guardian writes when it rescues a stuck child. */
const RESCUE: ProgressGuardianFinding = {
  seq: 4,
  label: '执行 · 任务 2 · 写文档',
  signal: 'timeout',
  action: 'rescue',
  reason: '半分钟没有新事件',
  atMs: 90_000,
}

/** 已完成: two plan tasks through execute and check, one shipped draft, a Guardian recorded. */
function finishedRun(): ProgressRun {
  return {
    runId: 'r-layout-done',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '检查', '任务 1 · 修复登录', 'completed', 2),
      member(4, '执行', '任务 2 · 写文档', 'completed', 3),
      member(5, '检查', '任务 2 · 写文档', 'completed', 4),
      member(6, '汇总·第1稿', '汇总', 'completed', 5),
    ],
    details: [],
    stopReason: 'completed',
    summaryFinalDraft: 1,
    guardian: guardianOf([RESCUE]),
  }
}

/** The same run with a Guardian that recorded no intervention at all. */
function guardedEmptyRun(): ProgressRun {
  const run = finishedRun()
  return { ...run, guardian: guardianOf([]) }
}

/** 进行中: a run still working, and no Guardian recorded — the one-column page. */
function runningRun(): ProgressRun {
  return {
    runId: 'r-layout-running',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 修复登录', 'completed', 1),
      member(3, '执行', '任务 2 · 写文档', undefined, 2),
    ],
    details: [],
  }
}

/**
 * 未通过 with a Guardian: the amber bar and the 「后面还有」 line are on the page.
 *
 * Those two lines sit above the column wrapper, so a fixture without them could not say
 * where they sit. Task 2 failed once and is being rechecked, so the bar counts attempt 2.
 */
function brokenGuardedRun(): ProgressRun {
  return {
    runId: 'r-layout-broken',
    name: '任务团队 · 3 个任务',
    anchorSeq: 1,
    members: [
      member(1, '执行', '任务 1 · 建表', 'completed', 0),
      member(2, '执行', '任务 2 · 迁移', 'failed', 1),
      member(3, '执行（尝试 2）', '任务 2 · 迁移', undefined, 2),
      member(4, '执行', '任务 3 · 回填', 'completed', 3),
    ],
    details: [],
    guardian: guardianOf([{ seq: 2, label: '执行 · 任务 2 · 迁移', signal: 'heartbeat-loss', action: 'observe', reason: '心跳丢失一次', atMs: 30_000 }], { ended: false }),
  }
}

/**
 * One plan task whose second call is no gate.
 *
 * `memberLabel()` writes the chain's own verbs for the three gates, but a task may also hold
 * a call that names no slot. That line has no chip to stand in for its role, so the word has
 * to stay on it: a line with a clock and a result and nobody's name would say less than the
 * one it replaces.
 */
function oddLegRun(): ProgressRun {
  return {
    runId: 'r-layout-odd',
    name: '任务团队 · 1 个任务',
    anchorSeq: 1,
    members: [
      member(1, '执行', '任务 1 · 建表', 'completed', 0),
      member(2, '汇总助手', '任务 1 · 建表', 'completed', 1),
    ],
    details: [],
  }
}

/** Eight history lines: four plan tasks, the last one still being checked. */
function wideRun(): ProgressRun {
  return {
    runId: 'r-layout-wide',
    name: '任务团队 · 4 个任务',
    anchorSeq: 1,
    members: [
      member(1, '执行', '任务 1 · 建表', 'completed', 0),
      member(2, '检查', '任务 1 · 建表', 'completed', 1),
      member(3, '执行', '任务 2 · 迁移', 'completed', 2),
      member(4, '检查', '任务 2 · 迁移', 'completed', 3),
      member(5, '执行', '任务 3 · 回填', 'completed', 4),
      member(6, '检查', '任务 3 · 回填', 'completed', 5),
      member(7, '执行', '任务 4 · 验收', 'completed', 6),
      member(8, '检查', '任务 4 · 验收', undefined, 7),
    ],
    details: [],
  }
}

/** Five history lines: two plan tasks and the planner — under the fold's own threshold. */
function narrowRun(): ProgressRun {
  return {
    runId: 'r-layout-narrow',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      member(1, '规划助手', '规划', 'completed', 0),
      member(2, '执行', '任务 1 · 建表', 'completed', 1),
      member(3, '检查', '任务 1 · 建表', 'completed', 2),
      member(4, '执行', '任务 2 · 迁移', 'completed', 3),
      member(5, '检查', '任务 2 · 迁移', 'completed', 4),
    ],
    details: [],
  }
}

/**
 * One page, rendered against a fixed set of props, with its hook cells kept between passes.
 * @param props - the props the shell would hand the tab.
 * @returns a `render()` that draws the page again, replaying the state clicks stored.
 */
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

/** The renderer for one run, in one language, with the shell's extra props. */
function pageOf(run: ProgressRun, locale: 'zh' | 'en' = 'zh', extra: Record<string, unknown> = {}): () => unknown {
  const t = bundle.GROK_WORKFLOW_INTERNALS.translator(locale)
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

/** The three body sections by the hook each one carries, in document order. */
const SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['plan', 'data-gw-progress-plan-section'],
  ['log', 'data-gw-progress-log-section'],
  ['final', 'data-gw-progress-final-section'],
]

/** Which body sections a subtree draws, in document order. */
function sectionsIn(node: unknown): string[] {
  const names: string[] = []
  for (const element of walk(node)) {
    for (const [name, hook] of SECTIONS) {
      if (element.props[hook] === true) names.push(name)
    }
  }
  return names
}

/** The page's first toggle carrying one hook, clicked the way a reader clicks it. */
function clickToggle(page: unknown, hook: string): void {
  const toggle = hookOf(page, hook)
  const onClick = toggle.props['onClick']
  expect(onClick, `${hook} is not clickable`).toBeTypeOf('function')
  ;(onClick as () => void)()
}

describe('client progress tab: the two-column body', () => {
  it('puts the step list, the history and the shipped draft in one column, the Guardian beside it', () => {
    const page = pageOf(finishedRun())()
    const wrappers = hooksOf(page, 'data-gw-progress-columns')
    expect(wrappers, 'the wrapper is missing, or drawn twice').toHaveLength(1)
    const wrapper = wrappers[0]!
    expect(wrapper.type).toBe('div')
    expect(attr(wrapper, 'className')).toContain('gw-progress-columns')

    // The main column holds the three sections, in the design's order: the plan, the
    // history, then what the run handed in.
    const main = hookOf(wrapper, 'data-gw-progress-main')
    expect(main.type).toBe('div')
    expect(attr(main, 'className')).toContain('gw-progress-main')
    expect(sectionsIn(main)).toEqual(['plan', 'log', 'final'])

    // The side column holds the Guardian panel, and the panel is nowhere else.
    const side = hookOf(wrapper, 'data-gw-progress-side')
    expect(side.type).toBe('aside')
    expect(attr(side, 'className')).toContain('gw-progress-side')
    expect(hooksOf(side, 'data-gw-progress-guardian')).toHaveLength(1)
    expect(hooksOf(main, 'data-gw-progress-guardian')).toHaveLength(0)
  })

  it('keeps the header, 现在, the step bar, the amber bar, 后面还有 and the dock outside it', () => {
    // This fixture carries both the amber bar and the rest line, so the two lines the
    // contract places above the wrapper are actually on the page under test.
    const page = pageOf(brokenGuardedRun())()
    expect(hooksOf(page, 'data-gw-progress-flag')).toHaveLength(1)
    expect(hooksOf(page, 'data-gw-progress-rest')).toHaveLength(1)
    const wrapper = hookOf(page, 'data-gw-progress-columns')
    const order = walk(page)
    for (const hook of [
      'data-gw-progress-bar',
      'data-gw-progress-now',
      'data-gw-progress-steps',
      'data-gw-progress-flag',
      'data-gw-progress-rest',
      'data-gw-progress-dock',
    ]) {
      const element = hookOf(page, hook)
      expect(ancestorsOf(page, element), `${hook} must not sit inside the columns`).not.toContain(wrapper)
      expect(order.indexOf(element), hook).toBeGreaterThanOrEqual(0)
    }
    // Above the wrapper, except the dock, which closes the page below it.
    for (const hook of ['data-gw-progress-bar', 'data-gw-progress-now', 'data-gw-progress-steps', 'data-gw-progress-flag', 'data-gw-progress-rest']) {
      expect(order.indexOf(hookOf(page, hook)), hook).toBeLessThan(order.indexOf(wrapper))
    }
    expect(order.indexOf(hookOf(page, 'data-gw-progress-dock'))).toBeGreaterThan(order.indexOf(wrapper))
  })

  it('draws no wrapper and no empty column when the run recorded no Guardian', () => {
    const page = pageOf(runningRun())()
    expect(hooksOf(page, 'data-gw-progress-columns')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-main')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-side')).toHaveLength(0)
    expect(hooksOf(page, 'data-gw-progress-guardian')).toHaveLength(0)
    // The three sections still render, directly on the page.
    expect(sectionsIn(page)).toEqual(['plan', 'log', 'final'])
  })

  it('turns the columns on for the fold’s own guardian-start, as the recorder writes it', () => {
    // The component only ever sees a folded run, so the flag that decides the layout has to
    // arrive through `fold` and not only through a hand-built fixture.
    const records: Array<Record<string, unknown>> = [
      { type: 'tool-workflow/run-start', data: { runId: 'r-fold', name: '任务团队' }, seq: 1, time: BASE },
      { type: 'tool-workflow/agent-start', data: { runId: 'r-fold', seq: 2, label: '执行', phase: '任务 1 · 建表', childId: 'child-2' }, seq: 2, time: BASE + 60_000 },
      { type: 'tool-workflow/guardian-start', data: { runId: 'r-fold', armed: true, budgetMs: 120_000 }, seq: 3, time: BASE + 61_000 },
      { type: 'tool-workflow/guardian-end', data: { runId: 'r-fold', cancelled: false }, seq: 4, time: BASE + 62_000 },
    ]
    const runs = progress.fold(records)
    expect(runs, 'the fixture must fold into one run').toHaveLength(1)
    expect(runs[0]!.guardian?.started).toBe(true)
    const page = pageOf(runs[0]!)()
    expect(hooksOf(page, 'data-gw-progress-columns')).toHaveLength(1)
    expect(hooksOf(hookOf(page, 'data-gw-progress-side'), 'data-gw-progress-guardian')).toHaveLength(1)
  })
})

describe('client progress tab: the Guardian as four blocks', () => {
  it('draws the state, the budget, the count and the findings as tiles', () => {
    const page = pageOf(finishedRun())()
    const guardian = hookOf(page, 'data-gw-progress-guardian')
    // The panel keeps its own hooks: the state it is in, and the one label a reader hears.
    expect(attr(guardian, 'data-state')).toBe('finished')
    expect(attr(guardian, 'aria-label')).toBe(zh('progress.guardian.title'))

    const blocks = hookOf(guardian, 'data-gw-progress-guardian-blocks')
    expect(blocks.type).toBe('div')
    const tiles = hooksOf(blocks, 'data-gw-progress-guardian-block')
    expect(tiles.map((tile) => tile.props['data-gw-progress-guardian-block'])).toEqual(['status', 'budget', 'count', 'findings'])

    // The three sentences are the panel's existing copy, unchanged: the status tile names
    // the title and the state word, the other two are the budget and the count sentences.
    expect(textOf(tiles[0]!)).toContain(zh('progress.guardian.title'))
    expect(textOf(tiles[0]!)).toContain(zh('progress.guardian.finished'))
    expect(textOf(tiles[1]!)).toContain(zh('progress.guardian.budget', { seconds: 240 }))
    expect(textOf(tiles[2]!)).toContain(zh('progress.guardian.count', { count: 1 }))

    // The findings tile holds the intervention rows the panel already knew how to draw.
    const actions = walk(tiles[3]!).map((element) => element.props['data-action']).filter((value) => typeof value === 'string')
    expect(actions).toEqual(['rescue'])
  })

  it('says there is nothing to report in the findings tile instead of leaving it empty', () => {
    const page = pageOf(guardedEmptyRun())()
    const tiles = hooksOf(hookOf(page, 'data-gw-progress-guardian-blocks'), 'data-gw-progress-guardian-block')
    expect(tiles).toHaveLength(4)
    const findings = tiles[3]!
    expect(textOf(findings)).toContain(zh('progress.guardian.empty'))
    expect(walk(findings).filter((element) => typeof element.props['data-action'] === 'string')).toHaveLength(0)
    expect(textOf(tiles[2]!)).toBe(zh('progress.guardian.count', { count: 0 }))
  })

  it('lays the tiles out two by two, with the findings tile across both columns', () => {
    const grid = progress.css.split('\n').find((line) => line.includes('gw-progress-guardian-blocks') && line.includes('grid-template-columns'))
    expect(grid, 'the tile grid has no rule').toBeDefined()
    expect(grid).toContain('repeat(2, minmax(0, 1fr))')
    const spanning = progress.css.split('\n').find((line) => line.includes('findings') && /grid-column:\s*1\s*\/\s*-1/.test(line))
    expect(spanning, 'the findings tile does not span both columns').toBeDefined()
    // The span belongs to the findings tile, not to some other block.
    expect(spanning!.slice(0, spanning!.indexOf('{'))).toContain('findings')
  })
})

describe('client progress tab: the body’s geometry', () => {
  it('gives the second column 240px, and drops to one column under 720px', () => {
    const columns = ruleOf('.gw-progress-columns')
    expect(columns, 'the two-column body has no rule').toBeDefined()
    expect(columns).toContain('display: grid')
    expect(columns!.replace(/\s+/g, ' ')).toContain('grid-template-columns: minmax(0, 1fr) 240px')

    const narrow = mediaBlock('max-width: 720px')
    expect(narrow, 'the 720px breakpoint is gone').not.toBe('')
    const rule = narrow.split('\n').find((line) => line.trim().startsWith('.gw-progress-columns {'))
    expect(rule, 'the breakpoint does not restack the columns').toBeDefined()
    const value = (/grid-template-columns:\s*([^;]+)/.exec(rule!) ?? [])[1]
    expect(value, 'the narrow body declares no columns').toBeDefined()
    expect(['minmax(0, 1fr)', '1fr', 'none']).toContain(value!.replace(/\s+/g, ' ').trim())
  })

  it('caps the folded history in CSS, and never scrolls sideways', () => {
    const capped = progress.css.split('\n').find((line) => line.includes('max-height: 264px'))
    expect(capped, 'the folded history has no cap').toBeDefined()
    expect(capped).toContain('overflow-y: auto')
    expect(capped!.slice(0, capped!.indexOf('{'))).toContain('gw-progress-log')
    // The cap is scoped to the folded state, which is what lifts it when the list opens:
    // a cap on the list itself would still be there after the reader asked for more.
    const selector = capped!.slice(0, capped!.indexOf('{'))
    expect(
      selector.includes('data-expanded="false"') || selector.includes("data-expanded='false'") || selector.includes('not([data-expanded="true"])'),
      `the cap is not scoped to the folded state: ${selector.trim()}`,
    ).toBe(true)
    expect(progress.css).not.toContain('overflow-x: auto')
  })

  it('adds no literal colour, no error token and no new scroll container', () => {
    expect(progress.css).toContain('color-mix(')
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(progress.css).not.toMatch(/\brgba?\(/)
  })
})

describe('client progress tab: a task row opens in place', () => {
  it('closes by default: no button pressed, no detail block drawn', () => {
    const page = pageOf(finishedRun())()
    const rows = hooksOf(page, 'data-gw-progress-plan-row')
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => attr(row, 'data-open'))).toEqual(['false', 'false'])
    expect(hooksOf(page, 'data-gw-progress-task-detail')).toHaveLength(0)

    // The toggle carries the number and the body (title and the gates the task reached)…
    const toggle = hookOf(rows[0]!, 'data-gw-progress-plan-toggle')
    expect(toggle.type).toBe('button')
    expect(attr(toggle, 'type')).toBe('button')
    expect(attr(toggle, 'aria-expanded')).toBe('false')
    expect(attr(toggle, 'title')).toBe('详情')
    expect(hooksOf(toggle, 'data-gw-progress-plan-n')).toHaveLength(1)
    expect(hooksOf(toggle, 'data-gw-progress-task-name')).toHaveLength(1)
    expect(textOf(hookOf(toggle, 'data-gw-progress-plan-roles'))).toBe(`${zh('progress.chain.execute')} → ${zh('progress.chain.check')}`)
    // …and the state word stays outside it, where a reader can see the row is done without
    // the word becoming a button label.
    expect(hooksOf(toggle, 'data-gw-progress-plan-word')).toHaveLength(0)
    expect(hooksOf(rows[0]!, 'data-gw-progress-plan-word')).toHaveLength(1)

    // The control names the block it will draw, and that block is not named the same way
    // for two rows: the ids are per row.
    const controls = attr(toggle, 'aria-controls')
    expect(controls).toMatch(/^gw-progress-task-detail-\d+$/)
    const second = attr(hookOf(rows[1]!, 'data-gw-progress-plan-toggle'), 'aria-controls')
    expect(second).not.toBe(controls)
  })

  it('opens one task’s own lines, with the clock, the chain slot, the word and the capsule', () => {
    const render = pageOf(finishedRun(), 'zh', { canOpen: (childId: string) => childId === 'child-3' })
    const closed = render()
    const row = hooksOf(closed, 'data-gw-progress-plan-row')[0]!
    const controls = attr(hookOf(row, 'data-gw-progress-plan-toggle'), 'aria-controls')
    clickToggle(row, 'data-gw-progress-plan-toggle')

    const open = render()
    const openedRow = hooksOf(open, 'data-gw-progress-plan-row')[0]!
    expect(attr(openedRow, 'data-open')).toBe('true')
    expect(attr(hookOf(openedRow, 'data-gw-progress-plan-toggle'), 'aria-expanded')).toBe('true')

    const detail = hookOf(openedRow, 'data-gw-progress-task-detail')
    // The block is keyed by the step it belongs to and addressed by the control that opened it.
    expect(attr(detail, 'data-gw-progress-task-detail')).toBe(attr(openedRow, 'data-gw-progress-plan-row'))
    expect(attr(detail, 'id')).toBe(controls)

    // One line per member of *that* task, in declaration order: the work, then the check.
    const rows = hooksOf(detail, 'data-gw-progress-log-row')
    expect(rows.map((line) => line.props['data-gw-progress-log-row'])).toEqual([2, 3])
    expect(rows.map((line) => attr(line, 'data-state'))).toEqual(['done', 'done'])
    expect(rows.map((line) => textOf(hookOf(line, 'data-gw-progress-log-time')))).toEqual([clockAt(BASE + 120_000), clockAt(BASE + 180_000)])
    expect(rows.map((line) => textOf(hookOf(line, 'data-gw-progress-log-word')))).toEqual([zh('progress.log.done'), zh('progress.log.passed')])
    // The chain slot is the chip the detail adds: which gate this line ran.
    expect(rows.map((line) => textOf(hookOf(line, 'data-gw-progress-task-chain')))).toEqual([
      zh('progress.chain.execute'),
      zh('progress.chain.check'),
    ])

    // The capsule is the row's own control, and only on the line the shell can open.
    expect(hooksOf(rows[0]!, 'data-gw-progress-open')).toHaveLength(0)
    const pill = hookOf(rows[1]!, 'data-gw-progress-open')
    expect(attr(pill, 'data-gw-progress-open')).toBe('child-3')
    expect(pill.type).toBe('button')
    expect(attr(pill, 'type')).toBe('button')

    // The history above still says exactly what it said before the row opened, and it gains
    // no capsule: the detail is a second reading of the same rows, not a replacement.
    const history = texts(hookOf(hookOf(open, 'data-gw-progress-log-section'), 'data-gw-progress-log'))
    expect(history).toEqual(texts(hookOf(hookOf(closed, 'data-gw-progress-log-section'), 'data-gw-progress-log')))
    expect(hooksOf(hookOf(open, 'data-gw-progress-log-section'), 'data-gw-progress-open')).toHaveLength(0)
  })

  it('closes again on a second click, and keeps the two rows’ state independent', () => {
    const render = pageOf(finishedRun())
    const first = () => hooksOf(render(), 'data-gw-progress-plan-row')

    clickToggle(first()[0]!, 'data-gw-progress-plan-toggle')
    expect(attr(first()[0]!, 'data-open')).toBe('true')

    // Opening the second row leaves the first one open: one flag per row, not one for the page.
    clickToggle(first()[1]!, 'data-gw-progress-plan-toggle')
    const both = first()
    expect(both.map((row) => attr(row, 'data-open'))).toEqual(['true', 'true'])
    expect(hooksOf(both[0]!, 'data-gw-progress-task-detail')).toHaveLength(1)
    expect(hooksOf(both[1]!, 'data-gw-progress-task-detail')).toHaveLength(1)
    // A second row's detail is its own lines, never the first row's again.
    expect(hooksOf(both[1]!, 'data-gw-progress-log-row').map((line) => line.props['data-gw-progress-log-row'])).toEqual([4, 5])

    // Clicking the first one again folds only that one.
    clickToggle(both[0]!, 'data-gw-progress-plan-toggle')
    const collapsed = first()
    expect(collapsed.map((row) => attr(row, 'data-open'))).toEqual(['false', 'true'])
    expect(hooksOf(collapsed[0]!, 'data-gw-progress-task-detail')).toHaveLength(0)
    expect(hooksOf(collapsed[1]!, 'data-gw-progress-task-detail')).toHaveLength(1)
  })

  it('prints one gate word per opened line, and does not repeat the title above it', () => {
    // The row's header already names the task and the gates it reached, and the role word a
    // line would print *is* the chain's verb, so a line that printed both said the gate
    // twice and the title a second time. The line is time · gate · result · [capsule], and
    // nothing else.
    const title = '任务 1 · 修复登录'
    const render = pageOf(finishedRun(), 'zh', { canOpen: (childId: string) => childId === 'child-3' })
    const closed = render()
    clickToggle(closed, 'data-gw-progress-plan-toggle')
    const page = render()
    const row = hooksOf(page, 'data-gw-progress-plan-row')[0]!
    const detail = hookOf(row, 'data-gw-progress-task-detail')
    const lines = hooksOf(detail, 'data-gw-progress-log-row')
    const execute = zh('progress.chain.execute')
    const check = zh('progress.chain.check')

    expect(lines.map((line) => textOf(line))).toEqual([
      `${clockAt(BASE + 120_000)} ${execute} ${zh('progress.log.done')}`,
      `${clockAt(BASE + 180_000)} ${check} ${zh('progress.log.passed')} ${zh('progress.member.open')}`,
    ])
    // The gate appears once per line: the chip stands in for the role, it does not sit
    // beside it (`执行 执行`).
    expect(lines.map((line) => texts(line).filter((text) => text === execute || text === check)))
      .toEqual([[execute], [check]])
    expect(lines.map((line) => hooksOf(line, 'data-gw-progress-log-role').length)).toEqual([0, 0])

    // The title is on the row's own header once, and not in the lines under it.
    expect(texts(row).filter((text) => text === title)).toHaveLength(1)
    expect(texts(detail).filter((text) => text === title)).toHaveLength(0)
    // Page-wide the title keeps the faces it already had — the row header here and one line
    // per call in 「经过」 (two calls) — and the opened lines add none.
    const titlesIn = (tree: unknown) => pageTexts(tree).filter((text) => text === title)
    expect(titlesIn(closed), 'the row header and the two history lines').toHaveLength(3)
    expect(titlesIn(page)).toEqual(titlesIn(closed))
  })

  it('keeps the word on a line whose role names no gate', () => {
    // A task may hold a call that is no execute/check/review leg. There is no chip to stand
    // in for it, so the role word stays: otherwise the line would carry a clock and a result
    // and say nothing about who ran.
    const render = pageOf(oddLegRun())
    clickToggle(render(), 'data-gw-progress-plan-toggle')
    const row = hooksOf(render(), 'data-gw-progress-plan-row')[0]!
    const lines = hooksOf(hookOf(row, 'data-gw-progress-task-detail'), 'data-gw-progress-log-row')
    expect(lines.map((line) => line.props['data-gw-progress-log-row'])).toEqual([1, 2])

    // The line that names a gate still prints the chip, and the word only once.
    expect(texts(lines[0]!)).toEqual([clockAt(BASE + 60_000), zh('progress.chain.execute'), zh('progress.log.done')])

    const odd = lines[1]!
    expect(hooksOf(odd, 'data-gw-progress-task-chain')).toHaveLength(0)
    expect(textOf(hookOf(odd, 'data-gw-progress-log-role'))).toBe('汇总助手')
    expect(textOf(odd)).toBe(`${clockAt(BASE + 120_000)} 汇总助手 ${zh('progress.log.done')}`)
    // …and the title of the task it belongs to is still not repeated in the line.
    expect(texts(odd).filter((text) => text === '任务 1 · 建表')).toHaveLength(0)
  })
})

describe('client progress tab: the history folds past six lines', () => {
  it('offers 展开全部 on a long run, and flips to 收起 when opened', () => {
    const render = pageOf(wideRun())
    const page = render()
    expect(hooksOf(page, 'data-gw-progress-log-row')).toHaveLength(8)

    const list = hookOf(page, 'data-gw-progress-log')
    expect(attr(list, 'id')).toBe('gw-progress-log-list')
    expect(attr(list, 'data-expanded')).toBe('false')

    const toggle = hookOf(page, 'data-gw-progress-log-toggle')
    expect(toggle.type).toBe('button')
    expect(attr(toggle, 'type')).toBe('button')
    expect(attr(toggle, 'aria-expanded')).toBe('false')
    expect(attr(toggle, 'aria-controls')).toBe('gw-progress-log-list')
    expect(textOf(toggle)).toBe('展开全部')

    clickToggle(page, 'data-gw-progress-log-toggle')
    const open = render()
    expect(attr(hookOf(open, 'data-gw-progress-log'), 'data-expanded')).toBe('true')
    const opened = hookOf(open, 'data-gw-progress-log-toggle')
    expect(attr(opened, 'aria-expanded')).toBe('true')
    expect(textOf(opened)).toBe('收起')
    // Folding is a cap, not a cut: every line is still on the page, in order.
    expect(hooksOf(open, 'data-gw-progress-log-row')).toHaveLength(8)
  })

  it('offers no fold at all on a short run, and none at exactly six lines', () => {
    for (const [label, run] of [['five lines', narrowRun()], ['six lines', finishedRun()]] as const) {
      const page = pageOf(run)()
      expect(hooksOf(page, 'data-gw-progress-log-row').length, label).toBeLessThanOrEqual(6)
      expect(hooksOf(page, 'data-gw-progress-log-toggle'), label).toHaveLength(0)
      expect(attr(hookOf(page, 'data-gw-progress-log'), 'data-expanded'), label).toBe('false')
    }
  })
})

describe('client progress tab: three new words, in both dictionaries', () => {
  it('carries 详情, 展开全部 and 收起 with their English twins', () => {
    const zhDict = bundle.GROK_WORKFLOW_DICT['zh']!
    const enDict = bundle.GROK_WORKFLOW_DICT['en']!
    const pairs = ['progress.task.detail', 'progress.log.more', 'progress.log.less']
      .map((key) => [key, zhDict[key], enDict[key]])
    expect(pairs).toEqual([
      ['progress.task.detail', '详情', 'Detail'],
      ['progress.log.more', '展开全部', 'Show all'],
      ['progress.log.less', '收起', 'Collapse'],
    ])
    for (const locale of ['zh', 'en'] as const) {
      const t = bundle.GROK_WORKFLOW_INTERNALS.translator(locale)
      for (const key of ['progress.task.detail', 'progress.log.more', 'progress.log.less']) {
        expect(t(key), `${locale} ${key}`).not.toBe(key)
        expect(t(key).trim(), `${locale} ${key}`).not.toBe('')
      }
    }
  })

  it('says them on the page in the reader’s own language', () => {
    // English is not a second implementation: the same hooks, the same two clicks.
    const render = pageOf(wideRun(), 'en')
    const page = render()
    expect(attr(hookOf(hooksOf(page, 'data-gw-progress-plan-row')[0]!, 'data-gw-progress-plan-toggle'), 'title')).toBe('Detail')
    const toggle = hookOf(page, 'data-gw-progress-log-toggle')
    expect(textOf(toggle)).toBe('Show all')
    clickToggle(page, 'data-gw-progress-log-toggle')
    expect(textOf(hookOf(render(), 'data-gw-progress-log-toggle'))).toBe('Collapse')
  })
})

describe('client progress tab: the layout adds no number', () => {
  it('prints no percentage, no estimate and no pass rate on the expanded page', () => {
    const render = pageOf(finishedRun(), 'zh', { canOpen: () => true })
    // The widest page this change can draw: the row open, the detail lines on screen, the
    // Guardian beside them.
    clickToggle(render(), 'data-gw-progress-plan-toggle')
    const copy = pageTexts(render()).join('\n')
    expect(copy).toContain(zh('progress.log.done'))
    expect(copy).not.toContain('%')
    expect(copy).not.toMatch(/ETA|预计|通过率|剩余|大约/iu)
    expect(hooksOf(render(), 'data-gw-progress-task-detail')).toHaveLength(1)
  })
})
