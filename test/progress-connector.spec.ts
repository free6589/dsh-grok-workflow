/**
 * The progress page's shape and its colours: what the one-page redesign kept, and what it
 * retired for good.
 *
 * The old page was two tracks: a fixed six-segment spine with a ring per segment, a
 * hairline connector between the rings, a measured SVG wire layer that drew which stage
 * owned which task card, and a settle bar that split the declared rows by outcome. The
 * redesign (§19 of `DESIGN-progress-tab.md`) replaces all of it with one equal segment per
 * step and an event log, so this file is where the retirement is pinned: a half-deleted
 * structure would keep re-asserting the template nobody wants on screen any more.
 *
 * The text of the three screens is `test/client.spec.ts`'s job. This file reads the
 * stylesheet and the rendered tree, because both are hand-written JavaScript the host
 * serves verbatim and neither can be type-checked.
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

interface ProgressBundle {
  component: (props: Record<string, unknown>) => unknown
  stages: Array<{ key: string, tokens: string[], edge: boolean }>
  css: string
}

interface Bundle {
  GROK_WORKFLOW_PROGRESS: ProgressBundle
  GROK_WORKFLOW_INTERNALS: { translator(locale: string): (key: string, params?: Record<string, unknown>) => string }
}

/**
 * Load the bundle the way the host does: register, then run the factory with a stub React.
 *
 * Every case here asserts one render, so `useState` hands back its initial value and a
 * no-op setter, `useMemo` runs its factory, and `useSyncExternalStore` reads the face.
 */
function loadBundle(): Bundle {
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
  const globalRecord = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = globalRecord.window
  globalRecord.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(source)()
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

/** Render one run and hand back its whole stub tree. */
function renderRun(run: ProgressRun): unknown {
  return progress.component({
    t,
    progressT: t,
    useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
  })
}

/** The run every structural case renders: one plan task, two rows, one still running. */
const run: ProgressRun = {
  runId: 'run-shape',
  name: '任务团队 · 2 个任务',
  anchorSeq: 1,
  members: [
    { seq: 1, label: '执行', childId: 'child-1', order: 0, phase: '任务 1 · 读代码', outcome: 'completed' },
    { seq: 2, label: '检查', childId: 'child-2', order: 1, phase: '任务 1 · 读代码' },
  ],
}

/** One rule of the stylesheet, by its selector, or `undefined` when it is not there. */
function ruleOf(selector: string): string | undefined {
  return progress.css.split('\n').find((line) => line.trim().startsWith(`${selector} {`))
}

describe('client progress tab: the retired geometry is gone, not hidden', () => {
  /**
   * Every part of the old drawing, by the name it used.
   *
   * The list is spelled out rather than derived from one prefix, because the two retired
   * halves are unrelated: a class name, a data hook, a CSS variable and a measurement
   * constant. A survivor in any of them means part of the spine is still being built.
   */
  const RETIRED_CLASSES = [
    '.gw-progress-track',
    '.gw-progress-seg',
    '.gw-progress-ring',
    '.gw-progress-glyph',
    '.gw-progress-link',
    '.gw-progress-wires',
    '.gw-progress-wire',
    '.gw-progress-overview',
    '.gw-progress-settle',
    '.gw-progress-detail',
    '.gw-progress-tasks',
    '.gw-progress-task',
    '.gw-progress-pill',
    '.gw-progress-mini',
    '.gw-progress-badge',
    '.gw-progress-dur',
    '.gw-progress-meta',
    '.gw-progress-subs',
    '.gw-progress-flow',
    '.gw-progress-percent',
    '--gw-zoom',
    '--gw-wire-depth',
  ] as const

  const RETIRED_HOOKS = [
    'data-gw-progress-node',
    'data-gw-progress-link',
    'data-gw-progress-wires',
    'data-gw-progress-wire',
    'data-gw-progress-wire-branch',
    'data-gw-progress-settle',
    'data-gw-progress-settle-bar',
    'data-gw-progress-settle-part',
    'data-gw-progress-settle-legend',
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
  ] as const

  it('styles none of the retired classes', () => {
    for (const className of RETIRED_CLASSES) {
      expect(progress.css, `the stylesheet still styles ${className}`).not.toContain(className)
    }
  })

  it('renders none of the retired classes or data hooks', () => {
    const elements = walk(renderRun(run))
    for (const element of elements) {
      const className = element.props['className']
      if (typeof className === 'string') {
        for (const retired of RETIRED_CLASSES) {
          expect(className, `${retired} is still rendered`).not.toContain(retired.replace(/^\./, ''))
        }
      }
      for (const hook of RETIRED_HOOKS) {
        expect(Object.prototype.hasOwnProperty.call(element.props, hook), hook).toBe(false)
      }
    }
  })

  it('keeps no measurement, no zoom factor and no wire geometry in the source', () => {
    // The wires were measured from the laid-out DOM, so their absence is a code fact as
    // well as a DOM fact: a leftover measurement would keep reading a spine that is gone.
    const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
    for (const gone of ['measureProgressWires', 'progressWireDraw', 'progressWireHead', 'PROGRESS_WIRE_PAD', 'PROGRESS_CARD_INDENT', 'progressSettleParts', 'PROGRESS_STATE_GLYPH']) {
      expect(source, `${gone} is still shipped`).not.toContain(gone)
    }
  })
})

describe('client progress tab: one equal segment per step', () => {
  it('lays the steps out as an equal grid, never as a scrolling row', () => {
    const steps = ruleOf('.gw-progress-steps')
    expect(steps, 'the step bar has no rule').toBeDefined()
    expect(steps).toContain('display: grid')
    expect(steps).toContain('grid-auto-flow: column')
    expect(steps).toContain('grid-auto-columns: minmax(0, 1fr)')
    expect(steps).toContain('gap:')
    // A page that scrolls sideways is a page whose track did not fit.
    expect(progress.css).not.toContain('overflow-x: auto')
    expect(progress.css).not.toContain('scroll-snap-type')
  })

  it('reads in the design’s order: the bar, the list, the history, then the dock', () => {
    const hooks = walk(renderRun(run))
      .map((element) => Object.keys(element.props).find((key) => key.startsWith('data-gw-progress-')))
      .filter((hook): hook is string => hook !== undefined && hook !== 'data-gw-progress-css')
    expect(hooks.indexOf('data-gw-progress-steps')).toBeGreaterThanOrEqual(0)
    expect(hooks.indexOf('data-gw-progress-steps')).toBeLessThan(hooks.indexOf('data-gw-progress-plan'))
    expect(hooks.indexOf('data-gw-progress-plan')).toBeLessThan(hooks.indexOf('data-gw-progress-log'))
    expect(hooks.indexOf('data-gw-progress-log')).toBeLessThan(hooks.indexOf('data-gw-progress-final-section'))
    expect(hooks.indexOf('data-gw-progress-final-section')).toBeLessThan(hooks.indexOf('data-gw-progress-dock'))
  })

  it('turns the bar and the rows vertical under 480px instead of overflowing', () => {
    const narrow = progress.css.slice(progress.css.indexOf('@media (max-width: 480px)'))
    expect(narrow, 'the narrow layout is gone').not.toBe('')
    expect(narrow).toContain('flex-direction: column')
    // The plan and the log are already vertical lists; what changes is the bar and the
    // dock, which stack instead of sharing one line.
    expect(narrow).toContain('.gw-progress-dock')
  })

  it('gives a segment one colour per story state, and never a red one', () => {
    // Five story states, four colours: a cancelled and a not-started step are both "grey",
    // because neither says anything about a failure, and a failure is amber.
    const states: Array<[string, string]> = [
      ['done', '--dsw-alias-state-success-primary'],
      ['doing', '--dsw-alias-state-business-primary'],
      ['failed', '--dsw-alias-state-warn-primary'],
      ['blocked', '--dsw-alias-state-warn-primary'],
      ['cancelled', '--dsw-alias-state-idle-primary'],
      ['pending', '--dsw-alias-state-idle-primary'],
    ]
    for (const [state, token] of states) {
      const rule = ruleOf(`.gw-progress-step[data-state="${state}"]`)
      expect(rule, `no segment rule for ${state}`).toBeDefined()
      expect(rule).toContain(token)
    }
    // The running segment is the only one that moves, and it is the only one that may.
    expect(progress.css).toContain('.gw-progress-step[data-state="doing"]::after')
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
  })

  it('tones a history row by its own state, not by its position', () => {
    // A failed line and a line still being read get a surface of their own; every other
    // line is separated by a rule and nothing else.
    expect(ruleOf('.gw-progress-log-row')).toBeDefined()
    expect(ruleOf('.gw-progress-log-row[data-state="failed"]')).toContain('--dsw-alias-state-warn-primary')
    expect(ruleOf('.gw-progress-log-row[data-state="doing"]')).toContain('--dsw-alias-state-business-primary')
    // A line the run ended over without settling also reads amber: it did not pass.
    expect(ruleOf('.gw-progress-log-row[data-state="blocked"]')).toContain('--dsw-alias-state-warn-primary')
    // The other three never reach the warning colour: `done` stays neutral, because a
    // finished line is told by its word and its clock, not by a second green column.
    for (const state of ['done', 'pending', 'cancelled']) {
      const rule = ruleOf(`.gw-progress-log-row[data-state="${state}"]`)
      if (rule === undefined) continue
      expect(rule, state).not.toContain('--dsw-alias-state-warn-primary')
    }
  })

  it('keeps the stylesheet scoped to .gw-progress, with no literal colour and no error token', () => {
    const rules = progress.css.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('@'))
    for (const rule of rules) expect(rule.trim().startsWith('.gw-progress')).toBe(true)
    expect(progress.css).not.toContain('--dsw-alias-state-error-primary')
    expect(progress.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(progress.css).not.toMatch(/\brgba?\(/)
    expect(progress.css).not.toMatch(/\bhsla?\(/)
    expect(progress.css).toContain('var(--dsw-font-family-sans')
  })

  it('stops the flowing segment and the pulsing chip when motion is not wanted', () => {
    // Motion is decoration: the state word already says "running".
    const reduced = progress.css.slice(progress.css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced, 'the reduced-motion block is gone').not.toBe('')
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('.gw-progress-step')
    expect(reduced).toContain('.gw-progress-chip')
    expect(progress.css).toContain('@keyframes gw-progress-sweep')
    expect(progress.css).toContain('@keyframes gw-progress-pulse')
  })
})

describe('client progress tab: the six-stage spine is still the data contract', () => {
  it('exports the six stages the phase binding reads, without drawing them', () => {
    // §19.0: the spine left the page, but `PROGRESS_STAGES` is still what binds a recorded
    // phase to a role, and Guardian and the fold still read it. Losing a stage here would
    // silently move rows off their roles.
    expect(progress.stages.map((stage) => stage.key)).toEqual(['start', 'plan', 'execute', 'verify', 'synthesize', 'end'])
    const elements = walk(renderRun(run))
    expect(elements.some((element) => typeof element.props['data-node-key'] === 'string')).toBe(false)
  })
})
