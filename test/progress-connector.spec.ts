/**
 * The progress page's shape and its colours: what the flowchart kept, and what it retired.
 *
 * Before this page the tab was four zones — a "现在" headline, an equal segment per step, a
 * step list, a history log with its own fold, a "交卷" card and a two-column body — and
 * before *that* it was a fixed six-segment spine with a ring per segment, a measured wire
 * layer per stage and a vertical task band. `.tmp/flowchart-contract.md` replaces all of it
 * with one flowchart, so this file is where the retirement is pinned: a half-deleted
 * structure would keep re-asserting a template nobody wants on screen any more.
 *
 * The text of the three screens is `test/client.spec.ts`'s job and the geometry is
 * `test/progress-flow.spec.ts`'s. This file reads the stylesheet plus the rendered tree,
 * because both are hand-written JavaScript the host serves verbatim and neither can be
 * type-checked.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

type ProgressMember = {
  seq: number
  label: string
  childId: string
  order: number
  phase?: string
  outcome?: string
}

type ProgressRun = {
  runId: string
  name: string
  anchorSeq: number
  members: ProgressMember[]
  stopReason?: string
}

interface Bundle {
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    stages: Array<{ key: string, tokens: string[], edge: boolean }>
    deriveProgressFlow: (run: ProgressRun) => { nodes: Array<{ kind: string }> }
  }
  GROK_WORKFLOW_INTERNALS: { translator(locale: string): (key: string, params?: Record<string, unknown>) => string }
}

/** The bundle the host serves: retired names are prose facts about this file. */
const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

/**
 * Load the bundle the way the host does: register, then run the factory with a stub React.
 *
 * Every case here asserts one render, so `useState` hands back its initial value and a
 * no-op setter, `useMemo` runs its factory, and `useSyncExternalStore` reads the face.
 */
function loadBundle(): Bundle {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
  const globalRecord = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = globalRecord.window
  globalRecord.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(SOURCE)()
  } finally {
    globalRecord.window = previous
  }
  const stubReact = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
      const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
      return typeof type === 'function' ? (type as (props: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useEffect: () => {},
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
    useMemo: (factory: () => unknown) => factory(),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
  return registration!.factory((id) => {
    if (id === 'react') return stubReact
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const t = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

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

/** The classes of one element, split the way the DOM splits them. */
function classesOf(element: Element): string[] {
  const value = element.props['className']
  return typeof value === 'string' ? value.split(/\s+/).filter((token) => token !== '') : []
}

/** Every class token the stylesheet declares, one per selector. */
function styledClasses(): string[] {
  const tokens = new Set<string>()
  for (const line of progress.css.split('\n')) {
    if (!line.includes('{') || line.trim().startsWith('@')) continue
    const selector = line.slice(0, line.indexOf('{'))
    for (const match of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) tokens.add(match[1]!)
  }
  return [...tokens]
}

/** Render one run and hand back its whole stub tree. */
function renderRun(run: ProgressRun): unknown {
  return progress.component({
    t,
    progressT: t,
    useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
  })
}

/** The run every structural case renders: two legs, one still open. */
const run: ProgressRun = {
  runId: 'run-shape',
  name: '任务团队 · 2 个任务',
  anchorSeq: 1,
  members: [
    { seq: 1, label: '执行', childId: 'child-1', order: 0, phase: '任务 1 · 读代码', outcome: 'completed' },
    { seq: 2, label: '检查', childId: 'child-2', order: 1, phase: '任务 1 · 读代码' },
  ],
}

describe('client progress tab: the retired geometry is gone, not hidden', () => {
  /**
   * Every part of the two retired drawings, by the name it used.
   *
   * The list is spelled out rather than derived from one prefix, because the halves are
   * unrelated: the four-zone page's own names, and the spine's names under them. A survivor
   * in any of them means part of a retired template is still being built — except the two
   * the contract revives on purpose (`gw-progress-flow` is the flowchart's own container,
   * and `gw-progress-wires` is its measured layer).
   */
  const RETIRED_CLASSES = [
    // the four-zone page (2026-11-25, `feat/progress-redesign`)
    'gw-progress-now',
    'gw-progress-eyebrow',
    'gw-progress-headline',
    // `gw-progress-sub` (the four-zone subtitle) and `gw-progress-subs` (the spine's
    // sub-list) were retired with those pages, then re-issued by the matrix contract for a
    // plan task's cell and the cells' list (追加 2). They are live names again, and
    // `progress-flow.spec.ts` pins what they mean; `gw-progress-task` below still may not
    // appear anywhere.
    'gw-progress-actor',
    'gw-progress-sep',
    'gw-progress-steps',
    'gw-progress-step',
    'gw-progress-flag',
    'gw-progress-rest',
    'gw-progress-columns',
    'gw-progress-main',
    'gw-progress-side',
    'gw-progress-section',
    'gw-progress-h2',
    'gw-progress-plan',
    'gw-progress-plan-n',
    'gw-progress-plan-body',
    'gw-progress-plan-name',
    'gw-progress-plan-roles',
    'gw-progress-plan-word',
    'gw-progress-plan-chain',
    'gw-progress-log-toggle',
    'gw-progress-final',
    'gw-progress-final-name',
    'gw-progress-final-mark',
    'gw-progress-final-missing',
    'gw-progress-dock-hint',
    'gw-progress-quiet',
    'gw-progress-quiet-dot',
    // the spine (0.12.19, `progress-tab-two-track`)
    'gw-progress-track',
    'gw-progress-seg',
    'gw-progress-ring',
    'gw-progress-glyph',
    'gw-progress-link',
    'gw-progress-wire',
    'gw-progress-overview',
    'gw-progress-settle',
    'gw-progress-detail',
    'gw-progress-tasks',
    'gw-progress-task',
    'gw-progress-pill',
    'gw-progress-mini',
    'gw-progress-badge',
    'gw-progress-dur',
    'gw-progress-meta',
    // …and the flowchart's own node list, which the lane matrix replaced (matrix §追加 2):
    // `gw-progress-subs` / `gw-progress-sub` used to sit in this list as the four-zone page's
    // subtitle and the spine's sub-list; the matrix contract re-issues both names for the
    // task cells, so they are live vocabulary again and are pinned by `progress-flow.spec.ts`.
    'gw-progress-nodes',
    'gw-progress-percent',
    '--gw-zoom',
    '--gw-wire-depth',
  ] as const

  /**
   * Every retired hook, with the boundary rule that makes the check honest.
   *
   * `data-gw-progress-log` is the *list*; `data-gw-progress-log-row` is a line inside a
   * node's calls and stays. A plain substring test would confuse the two, so each name is
   * matched only when nothing can continue it.
   */
  const RETIRED_HOOKS = [
    'data-gw-progress-now',
    'data-gw-progress-steps',
    'data-gw-progress-step',
    'data-gw-progress-flag',
    'data-gw-progress-rest',
    'data-gw-progress-columns',
    'data-gw-progress-main',
    'data-gw-progress-side',
    'data-gw-progress-plan',
    'data-gw-progress-log-section',
    'data-gw-progress-log-title',
    'data-gw-progress-log-toggle',
    'data-gw-progress-log',
    'data-gw-progress-final',
    'data-gw-progress-link',
    'data-gw-progress-wire',
    'data-gw-progress-settle',
    'data-gw-progress-tasks',
    'data-gw-progress-pill',
    'data-gw-progress-chain',
    'data-gw-progress-mini',
    'data-gw-progress-faildot',
    'data-gw-progress-failbadge',
    'data-gw-progress-dur',
    'data-gw-progress-meta',
    'data-gw-progress-nodes',
    'data-gw-progress-label',
    'data-progress-percent',
    'data-progress-zoom',
  ] as const

  /** Whether one retired hook appears as a whole attribute name, on a page or in the source. */
  function carriesHook(text: string, hook: string): boolean {
    return new RegExp(`${hook}(?![A-Za-z0-9_-])`).test(text)
  }

  it('styles none of the retired classes', () => {
    const styled = styledClasses()
    for (const className of RETIRED_CLASSES) {
      expect(styled, `the stylesheet still styles .${className}`).not.toContain(className)
    }
  })

  it('renders none of the retired classes', () => {
    for (const element of walk(renderRun(run))) {
      for (const token of classesOf(element)) {
        expect(RETIRED_CLASSES as readonly string[], `${token} is still rendered`).not.toContain(token)
      }
    }
  })

  it('carries none of the retired hooks, on the page or in the bundle', () => {
    const page = walk(renderRun(run))
    for (const hook of RETIRED_HOOKS) {
      for (const element of page) {
        expect(Object.prototype.hasOwnProperty.call(element.props, hook), `${hook} is still rendered`).toBe(false)
      }
      expect(carriesHook(SOURCE, hook), `${hook} is still shipped`).toBe(false)
    }
    // The matcher can fail both ways: it finds a retired name where one is spelled out,
    // and it does not confuse the retired list with the line hook that survives beside it.
    expect(carriesHook('{"data-gw-progress-log": true}', 'data-gw-progress-log')).toBe(true)
    expect(carriesHook('{"data-gw-progress-log-row": 3}', 'data-gw-progress-log')).toBe(false)
    expect(carriesHook(SOURCE, 'data-gw-progress-log-row')).toBe(true)
  })

  it('keeps no new class name built on the retired task-band prefix', () => {
    // `gw-progress-task` was the spine's card. A new class may not hide the old structure
    // behind the same word — the flow's own vocabulary is nodes, calls and wires.
    for (const token of styledClasses()) {
      expect(token, `${token} carries the retired prefix`).not.toContain('gw-progress-task')
    }
    for (const element of walk(renderRun(run))) {
      for (const token of classesOf(element)) {
        expect(token, `${token} carries the retired prefix`).not.toContain('gw-progress-task')
      }
    }
  })

  it('styles the matrix vocabulary, and nothing older than it', () => {
    // The matrix's own names, in one place: an extra class on the page would be a mark
    // nobody agreed to, and the retry round added exactly two (`gw-progress-sub-dots` and
    // `gw-progress-sub-badge`).
    const styled = styledClasses()
    for (const className of [
      'gw-progress-cols',
      'gw-progress-col',
      'gw-progress-subs',
      'gw-progress-sub',
      'gw-progress-sub-dots',
      'gw-progress-sub-dot',
      'gw-progress-sub-badge',
      'gw-progress-sub-word',
      'gw-progress-sub-calls',
    ]) {
      expect(styled, `${className} is not styled`).toContain(className)
    }
    // …and the retired task-band prefix still may not hide inside any of them.
    for (const token of styled) expect(token).not.toContain('gw-progress-task')
  })

  it('keeps no measurement, no zoom factor and no settle arithmetic in the source', () => {
    // The spine's own geometry helpers are code facts, not just DOM facts: a leftover would
    // keep reading a structure that is gone.
    for (const gone of ['progressSettleParts', 'PROGRESS_STATE_GLYPH', 'progressZoom', 'PROGRESS_ZOOM']) {
      expect(SOURCE, `${gone} is still shipped`).not.toContain(gone)
    }
  })
})

describe('client progress tab: the flowchart is one flow, read top to bottom', () => {
  it('draws the header, the flow, the guardian, the count and the dock, in that order', () => {
    const elements = walk(renderRun(run))
    const hooks = elements
      .map((element) => Object.keys(element.props).find((key) => key.startsWith('data-gw-progress-')))
      .filter((hook): hook is string => hook !== undefined && hook !== 'data-gw-progress-css')
    const at = (hook: string) => hooks.indexOf(hook)
    expect(at('data-gw-progress-bar')).toBeGreaterThanOrEqual(0)
    expect(at('data-gw-progress-flow')).toBeGreaterThan(at('data-gw-progress-bar'))
    expect(at('data-gw-progress-cols')).toBeGreaterThan(at('data-gw-progress-wires'))
    expect(at('data-gw-progress-left')).toBeGreaterThan(at('data-gw-progress-cols'))
    expect(at('data-gw-progress-dock')).toBeGreaterThan(at('data-gw-progress-left'))
    // The retired two-zone body has no wrapper left to sit in.
    expect(hooks).not.toContain('data-gw-progress-columns')
  })

  it('keeps one hook per column, one per node, one per task, and one count line', () => {
    const elements = walk(renderRun(run))
    const count = (hook: string) => elements.filter((element) => Object.prototype.hasOwnProperty.call(element.props, hook)).length
    expect(count('data-gw-progress')).toBe(1)
    expect(count('data-gw-progress-bar')).toBe(1)
    expect(count('data-gw-progress-flow')).toBe(1)
    expect(count('data-gw-progress-wires')).toBe(1)
    expect(count('data-gw-progress-cols')).toBe(1)
    // start + execute + check + end: the two legs, with the ends around them, one column each.
    expect(count('data-gw-progress-col')).toBe(4)
    expect(count('data-gw-progress-node')).toBe(4)
    expect(count('data-gw-progress-node-word')).toBe(4)
    // Both work legs walked `任务 1 · 读代码`, so both rows hang in a task cell: two cells,
    // and no step node left with a row of its own to open.
    expect(count('data-gw-progress-subs')).toBe(2)
    expect(count('data-gw-progress-sub')).toBe(2)
    expect(count('data-gw-progress-sub-word')).toBe(2)
    expect(count('data-gw-progress-node-toggle')).toBe(0)
    expect(count('data-gw-progress-sub-toggle')).toBe(2)
    expect(count('data-gw-progress-left')).toBe(1)
    // The calls are closed, so no line is drawn — and no retired list holds one.
    expect(count('data-gw-progress-node-calls')).toBe(0)
    expect(count('data-gw-progress-sub-calls')).toBe(0)
    expect(count('data-gw-progress-log-row')).toBe(0)
  })

  it('exports the six stages the phase binding reads, without drawing them', () => {
    // §19.0: the spine left the page, but `PROGRESS_STAGES` is still what binds a recorded
    // phase to a role, and Guardian and the fold still read it. Losing a stage here would
    // silently move rows off their roles.
    expect(progress.stages.map((stage) => stage.key)).toEqual(['start', 'plan', 'execute', 'verify', 'synthesize', 'end'])
    const elements = walk(renderRun(run))
    expect(elements.some((element) => typeof element.props['data-node-key'] === 'string')).toBe(false)
  })
})

describe('client progress tab: the stylesheet keeps its own rules', () => {
  it('scopes every rule to the tab, and never scrolls sideways', () => {
    const rules = progress.css.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('@'))
    for (const rule of rules) expect(rule.trim().startsWith('.gw-progress')).toBe(true)
    expect(progress.css).not.toContain('overflow-x')
    expect(progress.css).not.toContain('scroll-snap-type')
  })

  it('carries the five-state chip and the breathing current node, and no other motion', () => {
    for (const state of ['waiting', 'running', 'done', 'failed', 'cancelled']) {
      expect(progress.css, state).toContain(`.gw-progress-chip[data-state="${state}"]`)
    }
    expect(progress.css).toContain('@keyframes gw-progress-breathe')
    expect(progress.css).toContain('@keyframes gw-progress-pulse')
    // The flowing sweep belonged to the retired segment bar.
    expect(progress.css).not.toContain('@keyframes gw-progress-sweep')
  })

  it('carries no literal colour and no error token', () => {
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(progress.css).not.toMatch(/\brgba?\(/)
    expect(progress.css).not.toMatch(/\bhsla?\(/)
    expect(progress.css).toContain('var(--dsw-font-family-sans')
  })
})
