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
  guardian?: {
    started: boolean
    armed: boolean
    budgetMs: number
    ended: boolean
    cancelled: boolean
    findings: Array<{ seq: number, label: string, signal: 'timeout' | 'heartbeat-loss', action: 'cancel-run' | 'rescue', reason: string, atMs?: number }>
  }
}

interface ProgressWirePath {
  kind: string
  owner: string
  card?: string
  tone: string
  points: Array<[number, number]>
}

interface ProgressWireSet {
  width: number
  height: number
  depth: number
  paths: ProgressWirePath[]
}

type FlowStub = {
  querySelectorAll(selector: string): Array<{
    getAttribute(name: string): string | null
    getBoundingClientRect(): { top: number, left: number, height: number, width: number }
  }>
  querySelector(selector: string): {
    getBoundingClientRect(): { top: number, bottom: number, left: number, width: number, height: number }
    querySelector?(selector: string): { getBoundingClientRect(): { left: number, width: number } } | null
    getAttribute?(name: string): string | null
  } | null
  getBoundingClientRect(): { top: number, width: number, height: number }
}

interface ProgressBundle {
  component: (props: Record<string, unknown>) => unknown
  stages: Array<{ key: string, tokens: string[], edge: boolean }>
  stateGlyph: Record<string, string>
  stateColor: Record<string, string>
  css: string
  measureWires(flow: unknown): ProgressWireSet
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

  it('shows the fixed execute-check-review chain per card, pending when unreached', () => {
    const tree = walk(renderRun(taskRun))
    // Task 1 reached execute + check (pills with chain keys), review is a dashed pending capsule.
    // Task 2 reached execute only (still running): check + review pending.
    const chained = tree.filter((element) => element.props['data-gw-progress-chain'] !== undefined)
    expect(chained.map((slot) => slot.props['data-gw-progress-chain'])).toEqual([
      'execute', 'check', 'review', 'execute', 'check', 'review',
    ])
    expect(chained.map((slot) => slot.props['data-state'])).toEqual([
      'done', 'done', 'pending', 'doing', 'pending', 'pending',
    ])
    // The pending capsules are placeholders (chain key, no pill seq); reached ones are pills.
    const pending = chained.filter((slot) => slot.props['data-pending'] === 'true')
    expect(pending.map((slot) => slot.props['data-gw-progress-chain'])).toEqual([
      'review', 'check', 'review',
    ])
    // The arrow between two capsules names the capsule it points at.
    const minis = tree.filter((element) => element.props['data-gw-progress-mini'] !== undefined)
    expect(minis.map((mini) => [mini.props['data-gw-progress-mini'], mini.props['data-tone']]))
      .toEqual([['check', 'ok'], ['review', 'pending'], ['check', 'pending'], ['review', 'pending']])
  })
})

describe('client progress tab: fixed left gutter + elbow wires', () => {
  it('keeps the band in one constant 40px gutter whatever stage owns a card', () => {
    // The regression this pins: the indent used to be the right-most owner's ring
    // centre + 30, so one row owned by a late stage pushed the whole band right.
    expect(progress.css).toContain('.gw-progress-tasks { width: 100%')
    expect(progress.css).toMatch(/\.gw-progress-tasks \{[^}]*padding: 0 12px 0 40px/)
    expect(progress.css).not.toContain('--gw-wire-pad')
    // The gutter leaves room only for the lane depth: cards never move sideways.
    expect(progress.css).toMatch(/\.gw-progress-tasks \{[^}]*margin-top: calc\(12px \+ var\(--gw-wire-depth, 0px\)\)/)
  })

  it('hides the wires and drops the band back to 12px under 480px', () => {
    expect(progress.css).toMatch(/@media \(max-width: 480px\)[\s\S]*\.gw-progress-wires \{ display: none/)
    expect(progress.css).toMatch(/@media \(max-width: 480px\)[\s\S]*\.gw-progress-tasks \{[^}]*padding-left: 12px/)
  })

  /**
   * One owner group on a laid-out stub: ring centre x=446, spine bottom y=88,
   * the first (and only) group takes lane 0 / channel 18, one stub to the card.
   */
  function stubFlow(): FlowStub {
    const card = {
      getAttribute: (name: string) => (name === 'data-owner' ? 'stage:execute' : name === 'data-gw-progress-task' ? 'phase:任务 1' : 'doing'),
      getBoundingClientRect: () => ({ top: 240, left: 40, height: 80, width: 1300 }),
    }
    const track = {
      getBoundingClientRect: () => ({ top: 100, bottom: 188, left: 0, width: 1440, height: 88 }),
    }
    const ring = { getBoundingClientRect: () => ({ left: 432, width: 28 }) }
    const segment = {
      querySelector: () => ring,
      getAttribute: () => 'doing',
      getBoundingClientRect: () => ({}),
    }
    return {
      querySelectorAll: (selector: string) => (selector === '[data-gw-progress-task]' ? [card] : []),
      querySelector: (selector: string) => {
        if (selector === '[data-gw-progress-track]') return track as never
        if (selector.startsWith('.gw-progress-track')) return segment as never
        return null
      },
      getBoundingClientRect: () => ({ top: 100, left: 0, width: 1440, height: 500 }),
    }
  }

  it('unwinds one group as ring -> lane -> channel -> card stub, inside the gutter', () => {
    const wires = progress.measureWires(stubFlow())
    expect(wires.depth).toBeGreaterThanOrEqual(0)
    expect(wires.paths).toHaveLength(2)
    const [trunk, stub] = wires.paths
    expect(trunk!.kind).toBe('trunk')
    expect(trunk!.owner).toBe('stage:execute')
    // Down from the ring (x=446, spine bottom 88), one lane leftwards under the
    // spine, then down the group's own channel in the gutter to the card's height.
    expect(trunk!.points).toEqual([[446, 88], [446, 92], [18, 92], [18, 180]])
    expect(stub!.kind).toBe('branch')
    expect(stub!.points).toEqual([[18, 180], [40, 180]])
    // The gutter legs stay left of the cards: the channel's vertical run and
    // every stub never enter a card. The ring drop (first leg) and the lane run
    // (second leg) travel from the owner's ring to the gutter by design — the
    // lane lives under the spine (y=92, above the cards at y=140+), so neither
    // leg runs through a card.
    const ringX = (trunk!.points[0] as [number, number])[0]
    expect(ringX).toBe(446)
    const laneY = (trunk!.points[1] as [number, number])[1]
    expect(laneY).toBe(92)
    const channelX = (trunk!.points[2] as [number, number])[0]
    expect(channelX).toBe(18)
    expect(stub!.points).toEqual([[18, 180], [40, 180]])
    const channelLeg = trunk!.points.slice(2)
    for (const [x] of channelLeg) expect(x).toBeLessThanOrEqual(40)
  })

  it('degrades to a plain list without layout instead of inventing coordinates', () => {
    expect(progress.measureWires(null)).toEqual({ width: 0, height: 0, depth: 0, paths: [] })
    expect(progress.measureWires({})).toEqual({ width: 0, height: 0, depth: 0, paths: [] })
  })
})

describe('client progress tab: Guardian monitor side lane', () => {
  it('shows recorded liveness state and rescue evidence without inventing a task verdict', () => {
    const guardianRun: ProgressRun = {
      ...run,
      guardian: {
        started: true,
        armed: true,
        budgetMs: 300_000,
        ended: false,
        cancelled: false,
        findings: [{
          seq: 3,
          label: '执行 3',
          signal: 'timeout',
          action: 'rescue',
          reason: 'workflow guardian rescued child with guidance',
          atMs: 2_000,
        }],
      },
    }
    const tree = walk(renderRun(guardianRun))
    const panel = tree.find((element) => element.props['data-gw-progress-guardian'] === true)
    expect(panel).toBeDefined()
    expect(panel!.props['data-state']).toBe('active')
    const copy = texts(tree).join('\n')
    expect(copy).toContain('Guardian 监控')
    expect(copy).toContain('监控中')
    expect(copy).toContain('已发送救援指引')
    expect(progress.css).toContain('.gw-progress-overview')
    expect(progress.css).toContain('color-mix(in srgb, var(--dsw-alias-state-success-primary)')
  })
})
