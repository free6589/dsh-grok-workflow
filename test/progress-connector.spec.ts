/**
 * The connector between two nodes, and the state glyph inside a node's ring.
 *
 * Both are hand-written JavaScript in `src/client/index.js` (the host serves that bundle
 * verbatim, so it cannot be type-checked), and `test/client.spec.ts` renders the tab
 * without ever asserting either: the fill rule (`data-filled`) and the glyph table are
 * therefore pinned here, on the bundle the browser actually runs.
 *
 * The two claims under test are the ones a reader relies on:
 *
 * - a connector is filled exactly when the track has *passed* the node on its left, which
 *   is the node's own `done` state — never "the run reached here", which the stream does
 *   not say;
 * - a node carries one glyph for its state, except when it aggregates more than one row,
 *   where the exact row count is the more checkable fact and replaces the glyph.
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
  stateGlyph: Record<string, string>
  stateColor: Record<string, string>
}

interface Bundle {
  GROK_WORKFLOW_PROGRESS: ProgressBundle
  GROK_WORKFLOW_INTERNALS: { translator(locale: string): (key: string, params?: Record<string, unknown>) => string }
}

/**
 * Load the bundle the way the host does: register, then run the factory with a stub React.
 *
 * `useState` hands back the value it was given and a no-op setter, because every case here
 * asserts the first render; `useMemo` runs its factory and `useSyncExternalStore` reads the
 * face's snapshot, which is the whole surface the view touches.
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

function progressMember(seq: number, phase: string | undefined, outcome?: string): ProgressMember {
  return {
    seq,
    label: `执行 ${seq}`,
    childId: `child-${seq}`,
    order: seq - 1,
    ...phase === undefined ? {} : { phase },
    ...outcome === undefined ? {} : { outcome },
  }
}

/** Render one run and hand back its whole stub tree. */
function renderRun(run: ProgressRun): unknown {
  return progress.component({
    t,
    progressT: t,
    useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
  })
}

/** The nodes and the connectors between them, in the order the track renders them. */
function trackParts(run: ProgressRun): Element[] {
  return walk(renderRun(run))
    .filter((element) => element.props['data-gw-progress-node'] === true || element.props['data-gw-progress-link'] === true)
}

/** The ring glyph of one node, keyed as the track renders it (`stage:execute`). */
function glyphOf(run: ProgressRun, nodeKey: string): Element | undefined {
  const node = walk(renderRun(run)).find((element) => element.props['data-node-key'] === nodeKey)
  if (node === undefined) return undefined
  return walk(node).find((element) => {
    const props = Object.keys(element.props)
    return props.includes('data-gw-progress-glyph') || props.includes('data-gw-progress-count')
  })
}

/**
 * Six rows over six spine stages, deliberately missing no state: `规划`/`执行` settled as
 * completed, `检查` failed, `汇总` cancelled, `回答` still open, and the run still open so
 * the unsettled row is `doing` and not the derived `blocked`.
 */
const run: ProgressRun = {
  runId: 'run-connector',
  name: '任务团队 · 6 行',
  anchorSeq: 1,
  members: [
    progressMember(1, '规划', 'completed'),
    progressMember(2, '执行', 'completed'),
    progressMember(3, '执行', 'completed'),
    progressMember(4, '检查', 'failed'),
    progressMember(5, '汇总', 'cancelled'),
    progressMember(6, '回答'),
  ],
}

describe('client progress tab: the connectors between nodes', () => {
  it('renders one connector per adjacent pair, in render order', () => {
    const parts = trackParts(run)
    const connectors = parts.filter((part) => part.props['data-gw-progress-link'] === true)
    const nodes = parts.filter((part) => part.props['data-gw-progress-node'] === true)
    expect(nodes).toHaveLength(progress.stages.length)
    expect(connectors).toHaveLength(nodes.length - 1)
    // No leading or trailing stub: the track starts and ends on a node.
    expect(parts[0]!.props['data-gw-progress-node']).toBe(true)
    expect(parts[parts.length - 1]!.props['data-gw-progress-node']).toBe(true)
    // The line is a decoration, so it is not in the accessibility tree.
    expect(connectors.every((connector) => connector.props['aria-hidden'] === 'true')).toBe(true)
    expect(connectors.every((connector) => texts(connector).length === 0)).toBe(true)
  })

  it('fills a connector exactly where the track has passed the node on its left', () => {
    const parts = trackParts(run)
    const states = parts
      .filter((part) => part.props['data-gw-progress-node'] === true)
      .map((node) => String(node.props['data-state']))
    expect(states).toEqual(['done', 'done', 'done', 'failed', 'cancelled', 'doing', 'doing'])

    // A connector belongs to the pair it sits in: its fill answer is the state of the node
    // immediately before it, and `data-filled` is absent — not the string `false` — when
    // the line is empty, which is the selector the stylesheet matches.
    const fills: boolean[] = []
    let previousState: string | undefined
    for (const part of parts) {
      if (part.props['data-gw-progress-node'] === true) {
        previousState = String(part.props['data-state'])
        continue
      }
      fills.push(part.props['data-filled'] === 'true')
      expect(part.props['data-filled'], `after ${String(previousState)}`).toBe(previousState === 'done' ? 'true' : undefined)
    }
    // start/plan/execute are done; everything from `检查` on left the line empty, because a
    // failed, cancelled or still-running node has not led anywhere.
    expect(fills).toEqual([true, true, true, false, false, false])
  })

  it('never fills a connector for a run that has done no work at all', () => {
    const idle: ProgressRun = { runId: 'run-idle', name: '任务团队', anchorSeq: 1, members: [] }
    const connectors = trackParts(idle).filter((part) => part.props['data-gw-progress-link'] === true)
    // The start mark alone counts as passed, and nothing else: one filled line, then five
    // empty ones — an empty track never reads as progress.
    expect(connectors.map((connector) => connector.props['data-filled'])).toEqual(['true', undefined, undefined, undefined, undefined, undefined])
  })
})

describe('client progress tab: the state glyph', () => {
  it('carries one glyph per state, and none for a stage the stream never reported', () => {
    expect(progress.stateGlyph).toEqual({
      pending: '',
      doing: '▸',
      done: '✓',
      blocked: '!',
      cancelled: '×',
      failed: '✕',
    })
    // Every non-pending glyph is a single visible character, so the 28px ring holds it.
    for (const state of ['doing', 'done', 'blocked', 'cancelled', 'failed']) {
      expect(progress.stateGlyph[state]!.length, state).toBe(1)
    }
  })

  it('renders the glyph of the node’s own state, keyed by that state', () => {
    const rendered: Array<[string, string]> = []
    for (const [key, state] of [['stage:plan', 'done'], ['stage:verify', 'failed'], ['stage:synthesize', 'cancelled'], ['stage:answer', 'doing']] as const) {
      const glyph = glyphOf(run, key)
      expect(glyph, key).toBeDefined()
      expect(glyph!.props['data-gw-progress-glyph']).toBe(state)
      expect(texts(glyph!)).toEqual([progress.stateGlyph[state]])
      rendered.push([key, state])
    }
    expect(rendered).toHaveLength(4)
    // A template stage with no row renders the empty glyph: the ring's idle border says
    // "not reported", and no character claims otherwise.
    const planless = glyphOf({ runId: 'r', name: '任务团队', anchorSeq: 1, members: [progressMember(1, '执行', 'completed')], stopReason: 'completed' }, 'stage:verify')
    expect(planless!.props['data-gw-progress-glyph']).toBe('pending')
    expect(texts(planless!)).toEqual([''])
  })

  it('shows the settled/declared count on the segment meta line, not a count glyph', () => {
    const tree = renderRun(run)
    const executeSeg = walk(tree).find((element) => element.props['data-node-key'] === 'stage:execute')!
    // A+C: every segment ring carries its own state glyph; the count lives on the
    // meta line (a fact a reader can check, next to the state words).
    const glyph = glyphOf(run, 'stage:execute')!
    expect(glyph!.props['data-gw-progress-glyph']).toBe('done')
    const meta = walk(executeSeg).find((element) => element.props['data-gw-progress-meta'] === true)!
    expect(texts(meta).join('')).toContain('2/2')
    // No count attribute replaces the glyph anywhere.
    for (const element of walk(tree)) {
      expect(element.props['data-gw-progress-count']).toBeUndefined()
    }
    // One row keeps the glyph.
    const verify = glyphOf(run, 'stage:verify')!
    expect(verify.props['data-gw-progress-glyph']).toBe('failed')
  })

  it('rings a derived blocked node with the blocked glyph the tooltip explains', () => {
    const blocked: ProgressRun = {
      runId: 'run-blocked',
      name: '任务团队',
      anchorSeq: 1,
      members: [progressMember(1, '执行')],
      stopReason: 'error',
    }
    const execute = walk(renderRun(blocked)).find((element) => element.props['data-node-key'] === 'stage:execute')!
    expect(execute.props['data-state']).toBe('blocked')
    expect(execute.props['data-derived']).toBe('true')
    const glyph = glyphOf(blocked, 'stage:execute')!
    expect(glyph.props['data-gw-progress-glyph']).toBe('blocked')
    expect(texts(glyph)).toEqual([progress.stateGlyph['blocked']])
  })
})

describe('client progress tab: two tracks (fixed spine + task band)', () => {
  /** The run every case below shows: a plan task with two rows, one still running. */
  const taskRun: ProgressRun = {
    runId: 'run-task',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members: [
      { seq: 1, label: '执行', childId: 'child-1', order: 0, phase: '任务 1 · 读代码', outcome: 'completed' },
      { seq: 2, label: '检查', childId: 'child-2', order: 1, phase: '任务 1 · 读代码', outcome: 'completed' },
      { seq: 3, label: '执行', childId: 'child-3', order: 2, phase: '任务 2 · 补测试' },
    ],
  }

  const runOf = (members: ProgressRun['members']): ProgressRun => ({
    runId: 'run-under-test',
    name: '任务团队',
    anchorSeq: 1,
    members,
  })

  it('keeps the spine at the seven fixed stages, in one row, whatever the plan declares', () => {
    const tree = walk(renderRun(taskRun))
    const spine = tree.filter((element) => element.props['data-gw-progress-node'] === true)
    expect(spine).toHaveLength(progress.stages.length)
    expect(spine.map((node) => node.props['data-node-key'])).toEqual([
      'stage:start', 'stage:plan', 'stage:execute', 'stage:verify', 'stage:synthesize', 'stage:answer', 'stage:end',
    ])
    // The plan tasks are cards in the band, never spine segments.
    expect(spine.some((node) => String(node.props['data-node-key']).startsWith('phase:'))).toBe(false)
    const tasks = tree.filter((element) => typeof element.props['data-gw-progress-task'] === 'string')
    expect(tasks.map((card) => card.props['data-gw-progress-task'])).toEqual([
      'phase:任务 1 · 读代码',
      'phase:任务 2 · 补测试',
    ])
  })

  it('hangs every card off the stage line that owns it', () => {
    const tree = walk(renderRun(taskRun))
    const cards = tree.filter((element) => typeof element.props['data-gw-progress-task'] === 'string')
    // A plan task is announced in the execute slot: it joins the execute line.
    for (const card of cards) expect(card.props['data-owner']).toBe('stage:execute')
    // A row whose phase names a stage joins that stage's line instead.
    const verifyOnly = walk(renderRun(runOf([
      { seq: 1, label: '检查', childId: 'child-v', order: 0, phase: '检查', outcome: 'completed' },
    ]))).filter((element) => typeof element.props['data-gw-progress-task'] === 'string')
    expect(verifyOnly).toHaveLength(1)
    expect(verifyOnly[0]!.props['data-owner']).toBe('stage:verify')
  })

  it('renders the cards below the spine, and the spine outside the band', () => {
    const tree = walk(renderRun(taskRun))
    const track = tree.find((element) => element.props['data-gw-progress-track'] === true)!
    const band = tree.find((element) => element.props['data-gw-progress-tasks'] === true)!
    expect(band).toBeDefined()
    // The regression the two tracks exist for: a full-width card inside the horizontal
    // flex line took its width out of the segments and crushed all seven of them.
    expect(walk(track.children).some((element) => element.props['data-gw-progress-task'] !== undefined)).toBe(false)
    expect(walk(band.children).some((element) => element.props['data-gw-progress-node'] !== undefined)).toBe(false)
  })

  it('carries no jump-to-failure control, no branch panel and no +N collapse line', () => {
    const tree = walk(renderRun(run))
    expect(tree.some((element) => element.props['data-gw-progress-jump'] === true)).toBe(false)
    expect(tree.some((element) => element.props['data-gw-progress-branch'] !== undefined)).toBe(false)
    expect(tree.some((element) => element.props['data-gw-progress-more'] !== undefined)).toBe(false)
  })

  it('gives every row its own pill, in plan order, with a mini arrow between two of them', () => {
    const tree = walk(renderRun(taskRun))
    const pills = tree.filter((element) => element.props['data-gw-progress-pill'] !== undefined)
    expect(pills.map((pill) => pill.props['data-gw-progress-pill'])).toEqual([1, 2, 3])
    // The arrow between the two rows of task 1 names the row it points at.
    const minis = tree.filter((element) => element.props['data-gw-progress-mini'] !== undefined)
    expect(minis.map((mini) => [mini.props['data-gw-progress-mini'], mini.props['data-tone']]))
      .toEqual([[2, 'ok']])
  })
})
