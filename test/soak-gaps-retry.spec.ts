import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * soak-gaps retry guard: the failed try and the next try stay visible.
 *
 * Background: the old lane-matrix page drew one short dashed retry line between two
 * attempt dots of the same task (seen with eyes only in
 * `.rsi/evidence/stuck-hint-2026-11-26/failed-narrow-390.png`; no readings field
 * counted it, see `docs/knowledge/VALIDATION.md`). The current branch-tree panel
 * (`flowchart LR` + branch cards) draws no such dashed line at all: `src/client/index.js`
 * has no `-.->`, no `data-gw-progress-retry`, no retry-only `stroke-dasharray` rule,
 * only one stale comment mentioning it; `test/progress-panel.spec.ts` and
 * `test/progress-connector.spec.ts` pin `gw-progress-pnode-retry` as retired.
 *
 * v1 ran red: assuming the mermaid carried a `-.->` retry edge. v2 pins what the
 * product really draws: a retry is a second branch card of the same leg
 * (`attempt: 2`), the failed branch keeps its red mark, the task card stays green.
 *
 * If readings ever count this, the suggested field name is `retryEdges`
 * (count only, no src change).
 */
const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

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
}

interface PanelSubtask {
  taskId: string
  taskNumber?: number
  seq: number
  leg?: string
  attempt: number
}

interface PanelNode {
  id: string
  kind: string
  label: string
  state: string
  subtask?: PanelSubtask
}

interface PanelEdge {
  from: string
  to: string
  kind: string
}

interface PanelGraph {
  mermaid: string
  nodes: PanelNode[]
  edges: PanelEdge[]
}

interface Bundle {
  GROK_WORKFLOW_PROGRESS: {
    derivePanelGraph: (run: ProgressRun, t?: unknown) => PanelGraph
  }
  GROK_WORKFLOW_INTERNALS: {
    translator: (locale: string) => unknown
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
    createElement: () => null,
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
  return registration!.factory((id) => {
    if (id === 'react') return react
    throw new Error(`must not require ${id}`)
  })
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

const BASE = new Date(2026, 10, 25, 8, 2).getTime()

function member(seq: number, label: string, phase: string | undefined, outcome: string | undefined, order: number): ProgressMember {
  return {
    seq,
    label,
    ...phase === undefined ? {} : { phase },
    childId: `child-${seq}`,
    order,
    startedAt: BASE + seq * 60_000,
    ...outcome === undefined ? {} : { endedAt: BASE + seq * 60_000 + 20_000, outcome },
  }
}

/** Execute failed once then passed on retry: same shape as recoveredRun in the model spec. */
function recoveredRun(): ProgressRun {
  return {
    runId: 'r-soak-retry',
    name: 'task team',
    anchorSeq: 1,
    members: [
      member(1, 'planner', 'plan-phase', 'completed', 0),
      member(2, 'execute', 'task 1 phase', 'failed', 1),
      member(3, 'execute', 'task 1 phase', 'completed', 2),
      member(4, 'verify', 'task 1 phase', 'completed', 3),
    ],
    details: [],
    stopReason: 'completed',
  }
}

describe('soak-gaps retry: failed try then next try', () => {
  it('retry exists as a second branch with attempt 2, failed branch keeps red, task card green', () => {
    const graph = progress.derivePanelGraph(recoveredRun(), zh)
    const subs = graph.nodes.filter((node) => node.kind === 'sub')
    expect(subs).toHaveLength(3)
    // The second attempt of the same leg counts as the retry: attempt 2.
    const retries = subs.filter((node) => node.subtask !== undefined && node.subtask.attempt > 1)
    expect(retries).toHaveLength(1)
    // The failed try keeps its red mark, the next try is green.
    const states = subs.map((node) => node.state)
    expect(states[0]).toBe('failed')
    expect(states[1]).toBe('done')
    // The task card is not dyed red by the superseded failure.
    const task = graph.nodes.find((node) => node.kind === 'task')
    expect(task).toBeDefined()
    expect(task!.state).toBe('done')
  })

  it('retry branch and task card are wired: t1 -> failed branch -> sum, t1 -> retry branch -> sum', () => {
    const graph = progress.derivePanelGraph(recoveredRun(), zh)
    const subs = graph.nodes.filter((node) => node.kind === 'sub')
    const failedId = subs[0]!.id
    const retryId = subs.filter((node) => node.subtask !== undefined && node.subtask.attempt > 1)[0]!.id
    const wired = graph.edges.map((edge) => `${edge.from} -> ${edge.to} (${edge.kind})`)
    expect(wired).toContain(`t1 -> ${failedId} (branch)`)
    expect(wired).toContain(`${failedId} -> sum (join)`)
    expect(wired).toContain(`t1 -> ${retryId} (branch)`)
    expect(wired).toContain(`${retryId} -> sum (join)`)
  })
})
