/**
 * The progress page's shape and its colours: what the task panel kept, and what it retired.
 *
 * Before this page the tab was, in turn, four zones (a "现在" headline, an equal segment per
 * step, a step list, a history log, a 交卷 card, a two-column body), a fixed six-segment spine
 * with a ring per segment, a flowchart of leg nodes, and finally a lane matrix of legs × plan
 * tasks with a cell list, a count line and two families of toggle hooks. The operator retired
 * the matrix for one branch-tree figure with two readings on it, so this file is where the
 * retirement is pinned: a half-deleted structure would keep re-asserting a template nobody
 * wants on screen any more.
 *
 * The words and the interactions are `test/progress-panel.spec.ts`'s job and the model is
 * `test/progress-panel-model.spec.ts`'s. This file reads the stylesheet plus the rendered
 * tree, because both are hand-written JavaScript the host serves verbatim and neither can be
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

/** The run every structural case renders: two legs, one still open, one plan task each. */
const run: ProgressRun = {
  runId: 'run-shape',
  name: '任务团队 · 2 个任务',
  anchorSeq: 1,
  members: [
    { seq: 1, label: '执行', childId: 'child-1', order: 0, phase: '任务 1 · 读代码', outcome: 'completed' },
    { seq: 2, label: '检查', childId: 'child-2', order: 1, phase: '任务 1 · 读代码' },
  ],
}

describe('client progress tab: the retired drawings are gone, not hidden', () => {
  /**
   * Every part of the four drawings this page replaced, by the name it used.
   *
   * The list is spelled out rather than derived from one prefix, because the halves are
   * unrelated: the four-zone page's names, the spine's, the first flowchart's, and the lane
   * matrix's. A survivor in any of them means part of a retired template is still being
   * built — except the two the panel revives on purpose (`gw-progress-graph` is the figure's
   * own container, and `gw-progress-wires` is its drawn layer).
   */
  const RETIRED_CLASSES = [
    // the four-zone page (2026-11-25, `feat/progress-redesign`)
    'gw-progress-now',
    'gw-progress-eyebrow',
    'gw-progress-headline',
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
    'gw-progress-flow',
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
    // the first flowchart (`feat/progress-flowchart`) and its node list
    'gw-progress-nodes',
    'gw-progress-node',
    'gw-progress-node-body',
    'gw-progress-node-dot',
    'gw-progress-node-word',
    'gw-progress-node-badge',
    'gw-progress-node-toggle',
    'gw-progress-node-ord',
    'gw-progress-percent',
    '--gw-zoom',
    '--gw-wire-depth',
    // the lane matrix (`feat/flowchart-v2`): columns of legs, cells of tasks, a count line
    'gw-progress-cols',
    'gw-progress-col',
    'gw-progress-subs',
    'gw-progress-sub',
    'gw-progress-sub-dots',
    'gw-progress-sub-dot',
    'gw-progress-sub-word',
    'gw-progress-sub-badge',
    'gw-progress-sub-calls',
    'gw-progress-sub-toggle',
    'gw-progress-left',
  ] as const

  /**
   * Every retired hook, with the boundary rule that makes the check honest.
   *
   * `data-gw-progress-node` is the first flowchart's node; `data-gw-progress-node-calls` is
   * the panel's opened list and stays. A plain substring test would confuse the two, so each
   * name is matched only when nothing can continue it.
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
    'data-gw-progress-label',
    'data-progress-percent',
    'data-progress-zoom',
    // the first flowchart's own list and nodes…
    'data-gw-progress-nodes',
    'data-gw-progress-flow',
    'data-gw-progress-node',
    'data-gw-progress-node-word',
    'data-gw-progress-node-badge',
    'data-gw-progress-node-ord',
    'data-gw-progress-node-toggle',
    // …and the matrix's columns, cells, toggles and count line.
    'data-gw-progress-cols',
    'data-gw-progress-col',
    'data-gw-progress-subs',
    'data-gw-progress-sub',
    'data-gw-progress-sub-toggle',
    'data-gw-progress-sub-calls',
    'data-gw-progress-branch-side',
    'data-gw-progress-left',
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
    // The matcher can fail both ways: it finds a retired name where one is spelled out, it
    // does not confuse the retired list with the line hook that survives beside it, and it
    // does not eat the panel's own opened-calls hook.
    expect(carriesHook('{"data-gw-progress-log": true}', 'data-gw-progress-log')).toBe(true)
    expect(carriesHook('{"data-gw-progress-log-row": 3}', 'data-gw-progress-log')).toBe(false)
    expect(carriesHook(SOURCE, 'data-gw-progress-log-row')).toBe(true)
    expect(carriesHook('{"data-gw-progress-node-calls": "plan"}', 'data-gw-progress-node')).toBe(false)
  })

  it('keeps no new class name built on the retired task-band prefix', () => {
    // `gw-progress-task` was the spine's card. A new class may not hide the old structure
    // behind the same word — the panel's own vocabulary is nodes, calls and wires.
    for (const token of styledClasses()) {
      expect(token, `${token} carries the retired prefix`).not.toContain('gw-progress-task')
    }
    for (const element of walk(renderRun(run))) {
      for (const token of classesOf(element)) {
        expect(token, `${token} carries the retired prefix`).not.toContain('gw-progress-task')
      }
    }
  })

  it('keeps no measurement, no zoom factor and no settle arithmetic in the source', () => {
    // The retired drawings' own geometry helpers are code facts, not just DOM facts: a
    // leftover would keep reading a structure that is gone.
    for (const gone of [
      'progressSettleParts',
      'PROGRESS_STATE_GLYPH',
      'progressZoom',
      'PROGRESS_ZOOM',
      'measureProgressFlowWires',
      'sameProgressWires',
      'progressWireLine',
    ]) {
      expect(SOURCE, `${gone} is still shipped`).not.toContain(gone)
    }
  })
})

describe('client progress tab: the panel draws one figure and one sentence', () => {
  it('draws the header, the figure, the Guardian and the dock, in that order', () => {
    const elements = walk(renderRun(run))
    const hooks = elements
      .map((element) => Object.keys(element.props).find((key) => key.startsWith('data-gw-progress-')))
      .filter((hook): hook is string => hook !== undefined && hook !== 'data-gw-progress-css')
    const at = (hook: string) => hooks.indexOf(hook)
    expect(at('data-gw-progress-bar')).toBeGreaterThanOrEqual(0)
    expect(at('data-gw-progress-graph')).toBeGreaterThan(at('data-gw-progress-bar'))
    expect(at('data-gw-progress-wires')).toBeGreaterThan(at('data-gw-progress-graph'))
    expect(at('data-gw-progress-pnodes')).toBeGreaterThan(at('data-gw-progress-wires'))
    expect(at('data-gw-progress-dock')).toBeGreaterThan(at('data-gw-progress-pnodes'))
    // The retired two-zone body and the count line have no wrapper left to sit in.
    expect(hooks).not.toContain('data-gw-progress-columns')
    expect(hooks).not.toContain('data-gw-progress-left')
  })

  it('keeps one hook per zone, one per node, and one control per node that has calls', () => {
    const elements = walk(renderRun(run))
    const count = (hook: string) => elements.filter((element) => Object.prototype.hasOwnProperty.call(element.props, hook)).length
    expect(count('data-gw-progress')).toBe(1)
    expect(count('data-gw-progress-css')).toBe(1)
    expect(count('data-gw-progress-bar')).toBe(1)
    expect(count('data-gw-progress-line')).toBe(1)
    expect(count('data-gw-progress-graph')).toBe(1)
    expect(count('data-gw-progress-source')).toBe(1)
    expect(count('data-gw-progress-wires')).toBe(1)
    expect(count('data-gw-progress-pnodes')).toBe(1)
    expect(count('data-gw-progress-dock')).toBe(1)
    // start + execute + its task + check + its task + end: both legs walked `任务 1`, so both
    // rows hang in a task node and each leg keeps nothing of its own.
    expect(count('data-gw-progress-pnode')).toBe(6)
    expect(count('data-gw-progress-pnode-word')).toBe(6)
    // The body is a class, not a hook: it is the box the word and the dot sit in.
    expect(elements.filter((element) => classesOf(element).includes('gw-progress-pnode-body'))).toHaveLength(6)
    // Only a node with something to open is a control; the two legs here handed every row to
    // a task, and the two ends declare nothing.
    expect(count('data-gw-progress-pnode-open')).toBe(2)
    // One wire per edge of the text the figure carries: two legs, two tasks, one end.
    expect(count('data-gw-progress-edge')).toBe(5)
    // The calls are closed, so no list and no line is drawn.
    expect(count('data-gw-progress-node-calls')).toBe(0)
    expect(count('data-gw-progress-log-row')).toBe(0)
  })

  it('names each opened list after the node that opens it, and only then', () => {
    // The contract between the two: `aria-controls` on the button is the list's own id, which
    // is why the hook and the id are both derived from the node id and nothing else.
    for (const element of walk(renderRun(run))) {
      if (!Object.prototype.hasOwnProperty.call(element.props, 'data-gw-progress-pnode-open')) continue
      const id = String(element.props['data-gw-progress-pnode-open'])
      expect(element.type).toBe('button')
      expect(element.props['aria-controls']).toBe(`gw-progress-calls-${id}`)
      expect(element.props['aria-expanded']).toBe(false)
    }
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
  /** One rule of the sheet, by a selector of its own, whether it stands alone or in a group. */
  function ruleOf(selector: string): string | undefined {
    return progress.css.split('\n').find((line) => {
      const at = line.indexOf('{')
      if (at === -1) return false
      return line.slice(0, at).split(',').map((part) => part.trim()).includes(selector)
    })
  }

  it('scopes every rule to the tab, and never scrolls sideways', () => {
    const rules = progress.css.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('@'))
    for (const rule of rules) expect(rule.trim().startsWith('.gw-progress')).toBe(true)
    expect(progress.css).not.toContain('overflow-x')
    expect(progress.css).not.toContain('scroll-snap-type')
    expect(progress.css).not.toContain('scroll-snap')
    // The one scroll box is a node's own opened list, and it scrolls down.
    expect(ruleOf('.gw-progress-node-calls')).toContain('overflow-y: auto')
  })

  it('carries the five-state chip and the breathing current node, and no other motion', () => {
    for (const state of ['waiting', 'running', 'done', 'failed', 'cancelled']) {
      expect(progress.css, state).toContain(`.gw-progress-chip[data-state="${state}"]`)
    }
    expect(progress.css).toContain('@keyframes gw-progress-breathe')
    expect(progress.css).toContain('@keyframes gw-progress-pulse')
    // The flowing sweep belonged to the retired segment bar.
    expect(progress.css).not.toContain('@keyframes gw-progress-sweep')
    // …and a reader who asked for less motion loses only the decoration.
    const reduced = progress.css.slice(progress.css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('.gw-progress-pnode')
  })

  it('carries no literal colour and no error token', () => {
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(progress.css).not.toMatch(/\brgba?\(/)
    expect(progress.css).not.toMatch(/\bhsla?\(/)
    expect(progress.css).toContain('var(--dsw-font-family-sans')
  })

  it('styles the panel’s own classes, and none of the ones it replaced', () => {
    const styled = styledClasses()
    for (const className of [
      'gw-progress-bar',
      'gw-progress-run',
      'gw-progress-chip',
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
      'gw-progress-log-row',
      'gw-progress-log-time',
      'gw-progress-log-line',
      'gw-progress-stuck',
      'gw-progress-foot',
      'gw-progress-dock',
      'gw-progress-dock-fill',
      'gw-progress-guardian',
      'gw-progress-empty',
    ]) {
      expect(styled, `${className} is not styled`).toContain(className)
    }
  })

  it('draws the trace with two rules and no new colour', () => {
    // The clicked node's wires step forward, every other wire steps back: the figure keeps
    // its structure while the branch a reader asked about reads first.
    expect(ruleOf('.gw-progress-wires > path[data-trace="active"]')).toContain('--dsw-alias-state-business-primary')
    expect(ruleOf('.gw-progress-wires > path[data-trace="active"]')).toContain('stroke-width: 2')
    expect(ruleOf('.gw-progress-wires > path[data-trace="dim"]')).toContain('opacity')
    expect(ruleOf('.gw-progress-pnode[data-trace="active"] .gw-progress-pnode-body'))
      .toContain('--dsw-alias-state-business-primary')
  })

  it('makes the node that opens a real button, with a focus ring of its own', () => {
    // A div is not focusable, so the body that carries a control must say it is one — and it
    // must keep the box it had, so the figure does not change shape with the interaction.
    expect(ruleOf('.gw-progress-pnode-body[type="button"]')).toContain('cursor: pointer')
    expect(ruleOf('.gw-progress-pnode-body:focus-visible')).toContain('outline')
    const body = ruleOf('.gw-progress-pnode-body')
    expect(body).toContain('font: inherit')
    expect(body).toContain('text-align: left')
    expect(body).toContain('background-color: transparent')
  })
})
