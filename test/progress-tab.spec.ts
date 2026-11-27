import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DETAIL_FIELDS,
  PROGRESS_DETAIL_EVENT_TYPE,
  PROGRESS_EVENT_TYPES,
  PROGRESS_SUMMARY_FINAL_EVENT_TYPE,
  PROGRESS_SUMMARY_REJECTED_EVENT_TYPE,
  PROGRESS_NODE_KIND,
  PROGRESS_STAGES,
  PROGRESS_VIEW_TARGET,
  deriveProgressFlow,
  deriveTrack,
  detailFor,
  detailSourcesOf,
  foldProgressRuns,
  formatDuration,
  currentFailureCount,
  isGuardianCard,
  nodeState,
  parseCoordinationBlock,
  percentOf,
  recoveredFailureSeqs,
  selectActiveRun,
} from '../src/progress-tab.js'
import {
  PROGRESS_AGENT_END,
  PROGRESS_AGENT_START,
  PROGRESS_GUARDIAN_END,
  PROGRESS_GUARDIAN_FINDING,
  PROGRESS_GUARDIAN_START,
  PROGRESS_RUN_END,
  PROGRESS_RUN_START,
  normalizeProgressRecord,
} from '../src/records.js'
import type { ProgressEventRecord, ProgressFlow, ProgressFlowNode, ProgressMemberFact, ProgressRunFacts } from '../src/progress-tab.js'

/**
 * The progress tab's pure rules.
 *
 * Every case here is a rule the browser half repeats as hand-written JavaScript
 * (`src/client/index.js`, the host serves it verbatim so it cannot import this module);
 * `test/client.spec.ts` pins the same five states and the same provenance ladder against
 * that copy, so the two cannot drift silently.
 */

const LABELS: Record<string, string> = {
  start: '起点',
  plan: '规划',
  execute: '执行',
  verify: '检查',
  synthesize: '汇总',
  end: '终点',
}
const labelFor = (key: string): string => LABELS[key] ?? key

function rec(type: string, data: Record<string, unknown>, seq?: number, time?: number): ProgressEventRecord {
  return {
    type,
    data,
    ...seq === undefined ? {} : { seq },
    ...time === undefined ? {} : { time },
  }
}

function member(seq: number, phase: string | undefined, outcome?: string, overrides: Partial<ProgressMemberFact> = {}): ProgressMemberFact {
  return {
    seq,
    label: `执行 ${seq}`,
    childId: `child-${seq}`,
    order: seq - 1,
    ...phase === undefined ? {} : { phase },
    ...outcome === undefined ? {} : { outcome },
    ...overrides,
  }
}

function runFacts(members: ProgressMemberFact[], stopReason?: string, overrides: Partial<ProgressRunFacts> = {}): ProgressRunFacts {
  return {
    runId: 'run-1',
    name: '任务团队 · 2 个任务',
    anchorSeq: 1,
    members,
    details: [],
    ...stopReason === undefined ? {} : { stopReason },
    ...overrides,
  }
}

function trackOf(members: ProgressMemberFact[], stopReason?: string) {
  return deriveTrack(runFacts(members, stopReason), { labelFor })
}

/**
 * The bundle's own copy of `PROGRESS_EVENT_TYPES`, read through the export the host serves.
 *
 * The name means two things at once — the events the fold recognises, and the routing
 * whitelist that decides which events the tab is handed at all — so the two copies are one
 * contract with two homes and no type can tie them together (`src/client/index.js` is served
 * verbatim, so it cannot import the typed table). Reading the shipped export is what makes
 * "they are the same list" checkable rather than a promise: when the bundle grew
 * the `summary-final` record and the typed copy did not, the shipped draft number was
 * silently dropped and the 交卷 card said "no draft" for a run that had one.
 */
function clientEventTypes(): readonly string[] {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Record<string, any> } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8'))()
  } finally {
    record.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const react = {
    createElement: () => null,
    useState: (value: unknown) => [value, () => {}],
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: () => undefined,
  }
  const bundle = registration!.factory(() => react) as Record<string, any>
  const progress = bundle['GROK_WORKFLOW_PROGRESS']
  expect(progress, 'the bundle must export GROK_WORKFLOW_PROGRESS').toBeDefined()
  // The bundle re-exports the constant under the progress bundle's own key (`eventTypes`);
  // the name it is declared with is the name this guard compares against.
  const shipped = progress.eventTypes
  expect(shipped, 'the bundle must export its event list as eventTypes').toBeDefined()
  return shipped as readonly string[]
}

function stageNode(track: ReturnType<typeof deriveTrack>, key: string) {
  const node = track.nodes.find((candidate) => candidate.key === `stage:${key}`)
  expect(node, key).toBeDefined()
  return node!
}

describe('progress tab: the event contract', () => {
  it('folds the progress and Guardian event contract and namespaces its view target and node kind', () => {
    expect(PROGRESS_EVENT_TYPES).toEqual([
      PROGRESS_RUN_START,
      PROGRESS_AGENT_START,
      PROGRESS_AGENT_END,
      PROGRESS_SUMMARY_FINAL_EVENT_TYPE,
      PROGRESS_SUMMARY_REJECTED_EVENT_TYPE,
      PROGRESS_GUARDIAN_START,
      PROGRESS_GUARDIAN_FINDING,
      PROGRESS_GUARDIAN_END,
      PROGRESS_RUN_END,
    ])
    // Each entry is the new plugin-record name: the old `tool-workflow/*` channel
    // polluted the session log and the harness refused to open it.
    expect(PROGRESS_RUN_START).toBe('plugin:grok-workflow/progress/run-start')
    expect(PROGRESS_SUMMARY_FINAL_EVENT_TYPE).toBe('plugin:grok-workflow/progress/summary-final')
    expect(PROGRESS_SUMMARY_REJECTED_EVENT_TYPE).toBe('plugin:grok-workflow/progress/summary-rejected')
    expect(PROGRESS_GUARDIAN_END).toBe('plugin:grok-workflow/progress/guardian-end')
    // The optional detail payload is not a lifecycle event: it can add field
    // values to a node but must never decide a state.
    expect(PROGRESS_DETAIL_EVENT_TYPE).toBe('tool-workflow/stage-detail')
    expect((PROGRESS_EVENT_TYPES as readonly string[]).includes(PROGRESS_DETAIL_EVENT_TYPE)).toBe(false)
    // Both names are registered identities: a duplicate would collide with another
    // plugin, so they carry this plugin's own prefix instead of a generic word.
    expect(PROGRESS_VIEW_TARGET).toBe('grok-progress')
    expect(PROGRESS_NODE_KIND.startsWith('grok-progress')).toBe(true)
    // The spine is this engine's own phase order, not a delivery template of our own:
    // plan/execute/verify/synthesize are the headers `src/naming.ts` emits, and the
    // plan tasks land in between (they are appended as extra nodes).
    expect(PROGRESS_STAGES.map((stage) => stage.key)).toEqual(['start', 'plan', 'execute', 'verify', 'synthesize', 'end'])
    expect(PROGRESS_STAGES.find((stage) => stage.key === 'plan')?.tokens).toContain('规划')
    // No `回答` stage: the final answer is delivered by the gate in the turn's own
    // message, never as a child call, so no event can ever fill it.
    expect(PROGRESS_STAGES.some((stage) => stage.key === 'answer')).toBe(false)
  })

  it('keeps both copies of PROGRESS_EVENT_TYPES identical, entry for entry', () => {
    const typed = [...PROGRESS_EVENT_TYPES]
    const shipped = [...clientEventTypes()]
    // Entry for entry, order included: the typed copy is what the fold reads, the shipped
    // one is what the host routes by, and an event present in only one of them either never
    // arrives (routed away) or arrives and is ignored (folded away). Both failures are
    // silent on screen, which is why this guard is a red test instead of a comment.
    expect(shipped, `两份同名常量必须逐条相等，加事件要两边一起加 — src/progress-tab.ts PROGRESS_EVENT_TYPES = [${typed.join(', ')}]，src/client/index.js PROGRESS_EVENT_TYPES (GROK_WORKFLOW_PROGRESS.eventTypes) = [${shipped.join(', ')}]`)
      .toEqual(typed)
  })

  it('folds the recorded stream into one run with its rows and settlement', () => {
    const runs = foldProgressRuns([
      rec(PROGRESS_RUN_START, { runId: 'run-1', name: '任务团队 · 2 个任务' }, 10, 1_000),
      rec(PROGRESS_AGENT_START, { runId: 'run-1', seq: 1, label: '执行', phase: '任务 1 · 修复登录', childId: 'c1' }, 11, 1_100),
      rec(PROGRESS_GUARDIAN_START, { runId: 'run-1', armed: true, budgetMs: 300_000 }, 12, 1_200),
      rec(PROGRESS_GUARDIAN_FINDING, { runId: 'run-1', seq: 1, label: '执行', signal: 'timeout', action: 'rescue', reason: 'rescued with guidance', atMs: 1_500 }, 13, 1_500),
      rec(PROGRESS_AGENT_END, { runId: 'run-1', seq: 1, outcome: 'completed' }, 14, 2_100),
      rec(PROGRESS_GUARDIAN_END, { runId: 'run-1', cancelled: false, findingCount: 1 }, 15, 2_150),
      rec(PROGRESS_RUN_END, { runId: 'run-1', stopReason: 'completed' }, 16, 2_200),
    ])
    expect(runs).toHaveLength(1)
    const run = runs[0]!
    expect(run.runId).toBe('run-1')
    expect(run.anchorSeq).toBe(10)
    expect(run.stopReason).toBe('completed')
    expect(run.guardian).toEqual({
      started: true,
      armed: true,
      budgetMs: 300_000,
      ended: true,
      cancelled: false,
      findings: [{
        seq: 1,
        label: '执行',
        signal: 'timeout',
        action: 'rescue',
        reason: 'rescued with guidance',
        atMs: 1_500,
      }],
    })
    expect(run.members).toEqual([
      {
        seq: 1,
        label: '执行',
        phase: '任务 1 · 修复登录',
        childId: 'c1',
        order: 0,
        startedAt: 1_100,
        endedAt: 2_100,
        outcome: 'completed',
      },
    ])
  })

  it('folds a stream written under the retired tool-workflow names', () => {
    // Old sessions already carry these names (written before the channel moved to
    // plugin records); the fold normalizes them, so an old run still renders.
    const runs = foldProgressRuns([
      rec('tool-workflow/run-start', { runId: 'run-old', name: '任务团队' }, 10, 1_000),
      rec('tool-workflow/agent-start', { runId: 'run-old', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11, 1_100),
      rec('tool-workflow/guardian-start', { runId: 'run-old', armed: true, budgetMs: 60_000 }, 12, 1_200),
      rec('tool-workflow/guardian-finding', { runId: 'run-old', seq: 1, label: '执行', signal: 'timeout', action: 'observe', reason: 'left running', atMs: 1_500 }, 13, 1_500),
      rec('tool-workflow/agent-end', { runId: 'run-old', seq: 1, outcome: 'completed' }, 14, 2_100),
      rec('tool-workflow/guardian-end', { runId: 'run-old', cancelled: false, findingCount: 1 }, 15, 2_150),
      rec('tool-workflow/summary-final', { runId: 'run-old', draft: 1 }, 16, 2_160),
      rec('tool-workflow/run-end', { runId: 'run-old', stopReason: 'completed' }, 17, 2_200),
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]!.runId).toBe('run-old')
    expect(runs[0]!.members).toHaveLength(1)
    expect(runs[0]!.guardian?.ended).toBe(true)
    expect(runs[0]!.summaryFinalDraft).toBe(1)
    expect(runs[0]!.stopReason).toBe('completed')
    // An old rejected name folds the same way.
    const [rejected] = foldProgressRuns([
      rec('tool-workflow/run-start', { runId: 'run-old-2', name: '任务团队' }, 1),
      rec('tool-workflow/summary-rejected', { runId: 'run-old-2', drafts: 2, stage: 'check', reason: 'x' }, 2),
    ])
    expect(rejected!.summaryRejected).toEqual({ drafts: 2, stage: 'check', reason: 'x' })
    // And the normalizer leaves everything else untouched.
    expect(normalizeProgressRecord('assistant/message')).toBe('assistant/message')
    expect(normalizeProgressRecord(PROGRESS_RUN_START)).toBe(PROGRESS_RUN_START)
  })

  it('is order-insensitive, idempotent and settles a row whose start arrives late', () => {
    const events = [
      // Shuffled on purpose: a replay may hand a reader events in another order.
      rec(PROGRESS_RUN_END, { runId: 'run-1', stopReason: 'error' }, 13),
      rec(PROGRESS_AGENT_END, { runId: 'run-1', seq: 2, outcome: 'failed' }, 12),
      rec(PROGRESS_AGENT_START, { runId: 'run-1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11),
      rec(PROGRESS_AGENT_START, { runId: 'run-1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11),
      rec(PROGRESS_AGENT_END, { runId: 'run-1', seq: 2, outcome: 'failed' }, 12),
      rec(PROGRESS_AGENT_START, { runId: 'run-1', seq: 2, label: '检查', phase: '任务 1 · 修复', childId: 'c2' }, 11),
      rec(PROGRESS_RUN_START, { runId: 'run-1', name: '任务团队 · 1 个任务' }, 10),
    ]
    const run = foldProgressRuns(events)[0]!
    // One row per seq, not one per start event.
    expect(run.members.map((entry) => entry.seq)).toEqual([1, 2])
    // The late start still carries the settlement that arrived first.
    expect(run.members.find((entry) => entry.seq === 2)?.outcome).toBe('failed')
    expect(run.anchorSeq).toBe(10)
  })

  it('drops a settlement for a row nobody declared and a run nobody announced', () => {
    const runs = foldProgressRuns([
      rec(PROGRESS_AGENT_START, { runId: 'ghost', seq: 1, label: '执行', childId: 'c1' }, 5),
      rec(PROGRESS_AGENT_END, { runId: 'ghost', seq: 1, outcome: 'completed' }, 6),
      rec(PROGRESS_RUN_START, { runId: 'run-1', name: '任务团队' }, 10),
      rec(PROGRESS_AGENT_END, { runId: 'run-1', seq: 9, outcome: 'completed' }, 11),
    ])
    expect(runs.map((run) => run.runId)).toEqual(['run-1'])
    expect(runs[0]!.members).toEqual([])
  })

  it('keeps an observe finding as observed, not as a run cancellation', () => {
    const runs = foldProgressRuns([
      rec(PROGRESS_RUN_START, { runId: 'run-1', name: '任务团队' }, 10),
      rec(PROGRESS_GUARDIAN_FINDING, { runId: 'run-1', seq: 1, label: '执行', signal: 'timeout', action: 'observe', reason: 'left running', atMs: 1_500 }, 13),
    ])
    expect(runs[0]!.guardian?.findings).toEqual([{
      seq: 1,
      label: '执行',
      signal: 'timeout',
      action: 'observe',
      reason: 'left running',
      atMs: 1_500,
    }])
  })

  it('takes the newest run as the active one and prefers the still-open one on a tie', () => {
    const older = runFacts([member(1, '任务 1 · 修复', 'completed')], 'completed', { runId: 'old', anchorSeq: 10 })
    const newest = runFacts([], undefined, { runId: 'new', anchorSeq: 30 })
    const closedTie = runFacts([], 'completed', { runId: 'closed', anchorSeq: 30 })
    expect(selectActiveRun([older, newest])?.runId).toBe('new')
    expect(selectActiveRun([newest, older])?.runId).toBe('new')
    expect(selectActiveRun([closedTie, newest])?.runId).toBe('new')
    expect(selectActiveRun([closedTie, older])?.runId).toBe('closed')
    expect(selectActiveRun([])).toBeUndefined()
  })
})

describe('progress tab: the five states and their precedence', () => {
  it('pending: a declared-but-unstarted stage, and the percentage stays absent', () => {
    const track = trackOf([])
    expect(stageNode(track, 'verify').state).toBe('pending')
    expect(track.percent).toBeUndefined()
    // The two ends report the run's own facts: the start happened, the end is still ahead.
    expect(stageNode(track, 'start').state).toBe('done')
    expect(stageNode(track, 'end').state).toBe('doing')
  })

  it('doing: an open run with an unsettled row', () => {
    const track = trackOf([member(1, '执行'), member(2, '检查', 'completed')], undefined)
    expect(stageNode(track, 'execute').state).toBe('doing')
    expect(stageNode(track, 'verify').state).toBe('done')
    expect(track.ended).toBe(false)
  })

  it('done: every row of the stage settled as completed', () => {
    const track = trackOf([member(1, '执行', 'completed'), member(2, '执行', 'completed')], 'completed')
    expect(stageNode(track, 'execute').state).toBe('done')
    expect(stageNode(track, 'end').state).toBe('done')
    expect(track.percent).toEqual({ settled: 2, declared: 2, value: 100 })
  })

  it('failed wins over every other state, including an unfinished row', () => {
    const members = [member(1, '执行', 'failed'), member(2, '执行', undefined)]
    expect(nodeState(members, false)).toBe('failed')
    expect(trackOf(members, undefined).nodes.find((node) => node.key === 'stage:execute')?.state).toBe('failed')
    // The run's own end agrees: an errored run is not a finished one.
    expect(trackOf(members, 'error').nodes.find((node) => node.key === 'stage:end')?.state).toBe('failed')
  })

  it('blocked: derived from a run that ended over a row it never settled, and says why', () => {
    const track = trackOf([member(1, '执行'), member(2, '执行', 'completed')], 'error')
    const execute = stageNode(track, 'execute')
    expect(execute.state).toBe('blocked')
    expect(execute.derived).toBe(true)
    expect(execute.reason).toBe('runEndedUnsettled')
  })

  it('blocked: an outcome that is neither completed nor cancelled is derived, not renamed', () => {
    const track = trackOf([member(1, '执行', 'interrupted')], 'completed')
    const execute = stageNode(track, 'execute')
    expect(execute.state).toBe('blocked')
    expect(execute.reason).toBe('outcomeUnsettled')
  })

  it('cancelled: keeps the engine’s own word instead of deriving one', () => {
    const track = trackOf([member(1, '执行', 'cancelled')], 'cancelled')
    expect(stageNode(track, 'execute').state).toBe('cancelled')
    expect(stageNode(track, 'end').state).toBe('cancelled')
    // A cancelled row plus a completed one is still a cancelled stage, never "done".
    const mixed = trackOf([member(1, '执行', 'cancelled'), member(2, '执行', 'completed')], 'cancelled')
    expect(stageNode(mixed, 'execute').state).toBe('cancelled')
  })

  it('an unfinished row on a still-open run is doing, never blocked', () => {
    expect(nodeState([member(1, '执行')], false)).toBe('doing')
    expect(nodeState([member(1, '执行')], true)).toBe('blocked')
  })
})

/**
 * Red means *still broken now*.
 *
 * A task that failed attempt 1 and verified on attempt 2 carries both rows. The later
 * completion replaces the earlier failure for every aggregate (card, spine segment, bar),
 * while the failed row keeps its own mark — so the reader sees "it failed once, then it
 * passed" instead of a task that is dyed red for the rest of the run.
 */
describe('progress tab: red is the current state, not the history', () => {
  /** Attempt 1 fails on the worker, attempt 2 runs the worker and the verifier cleanly. */
  const recoveredTask = (): ProgressMemberFact[] => [
    member(1, '任务 2 · 写文档', 'failed', { label: '执行' }),
    member(2, '任务 2 · 写文档', 'completed', { label: '执行（尝试 2）' }),
    member(3, '任务 2 · 写文档', 'completed', { label: '检查（尝试 2）' }),
  ]

  it('clears the card only when a later attempt of that same call completed', () => {
    const track = trackOf(recoveredTask(), 'completed')
    const card = track.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')!
    expect(card.state).toBe('done')
    // The failed row is still a declared row and still carries its own failed mark.
    expect(card.members.map((entry) => entry.outcome)).toEqual(['failed', 'completed', 'completed'])
    expect(recoveredFailureSeqs(card.members)).toEqual(new Set([1]))
    expect(currentFailureCount(card.members)).toBe(0)
    // The card's own chain: the execute capsule aggregates both attempts, so it is done too.
    expect(card.chain?.find((slot) => slot.key === 'execute')?.state).toBe('done')
    expect(card.chain?.find((slot) => slot.key === 'execute')?.members.map((entry) => entry.seq)).toEqual([1, 2])
  })

  it('keeps the stage that ran the recovered task out of red, and the bar count at zero', () => {
    const track = trackOf([
      member(1, '任务 1 · 读代码', 'completed', { label: '执行' }),
      ...recoveredTask(),
      member(4, '任务 3 · 补测试', 'completed', { label: '执行' }),
    ], 'completed')
    const execute = stageNode(track, 'execute')
    expect(execute.state).toBe('done')
    expect(currentFailureCount(execute.evidence)).toBe(0)
    // The percentage still counts every declared row, failures included: 5 settled of 5.
    expect(track.percent).toEqual({ settled: 5, declared: 5, value: 100 })
  })

  it('keeps a failure red when the retry has not settled yet, and when it failed again', () => {
    // Attempt 2 is still running: not recovered, so the card is still broken now.
    const running = trackOf([
      member(1, '任务 2 · 写文档', 'failed', { label: '执行' }),
      member(2, '任务 2 · 写文档', undefined, { label: '执行（尝试 2）' }),
    ], undefined)
    expect(running.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')?.state).toBe('failed')

    // Both attempts failed: still red, and both rows count.
    const broken = trackOf([
      member(1, '任务 2 · 写文档', 'failed', { label: '执行' }),
      member(2, '任务 2 · 写文档', 'failed', { label: '执行（尝试 2）' }),
    ], 'error')
    const card = broken.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')!
    expect(card.state).toBe('failed')
    expect(currentFailureCount(card.members)).toBe(2)
    expect(stageNode(broken, 'execute').state).toBe('failed')
  })

  it('never lets another task’s success recover this task’s failure', () => {
    // The completion belongs to 任务 3, a different phase: it says nothing about 任务 2.
    const track = trackOf([
      member(1, '任务 2 · 写文档', 'failed', { label: '执行' }),
      member(2, '任务 3 · 补测试', 'completed', { label: '执行' }),
    ], 'error')
    expect(track.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')?.state).toBe('failed')
    expect(recoveredFailureSeqs(track.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')!.members)).toEqual(new Set())
    // The stage aggregates both rows, and one of them is still broken.
    expect(stageNode(track, 'execute').state).toBe('failed')
  })

  it('treats a resubmit inside one attempt as recovered: same label, same attempt', () => {
    // `script.ts` asks once more in the SAME attempt when the worker's result was
    // unparseable, so both rows carry `执行` and the later completion replaces the first.
    const track = trackOf([
      member(1, '任务 2 · 写文档', 'failed', { label: '执行' }),
      member(2, '任务 2 · 写文档', 'completed', { label: '执行' }),
      member(3, '任务 2 · 写文档', 'completed', { label: '检查' }),
    ], 'completed')
    expect(track.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')?.state).toBe('done')
    expect(recoveredFailureSeqs(track.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')!.members)).toEqual(new Set([1]))
  })
})

describe('progress tab: the track', () => {
  it('binds the engine’s own phases to the spine and appends plan tasks as real nodes', () => {
    const members = [
      member(1, '规划', 'completed'),
      member(2, '执行', 'completed'),
      member(3, '任务 1 · 修复登录', 'completed'),
      member(4, '任务 2 · 写文档', 'failed'),
      member(5, '检查', 'completed'),
      member(6, '汇总', 'completed'),
    ]
    const track = trackOf(members, 'completed')
    expect(stageNode(track, 'plan').state).toBe('done')
    expect(stageNode(track, 'execute').state).toBe('done')
    expect(stageNode(track, 'verify').state).toBe('done')
    expect(stageNode(track, 'synthesize').state).toBe('done')
    // The plan tasks are nodes of their own, between `执行` (where the workers run) and
    // `检查` (which reads their evidence).
    const keys = track.nodes.map((node) => node.key)
    const extra = keys.indexOf('phase:任务 1 · 修复登录')
    expect(extra).toBeGreaterThan(keys.indexOf('stage:execute'))
    expect(extra).toBeLessThan(keys.indexOf('stage:verify'))
    const extraNode = track.nodes[extra]!
    expect(extraNode.kind).toBe('extra')
    expect(extraNode.label).toBe('任务 1 · 修复登录')
    expect(extraNode.state).toBe('done')
    expect(track.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')?.state).toBe('failed')
    // The spine is now six nodes: five edges/stages plus the plan-task extras. The final
    // answer is delivered by the gate in the turn's own message, never as a child call,
    // so the spine carries no `回答` cell — nothing here is permanently empty.
    expect(track.nodes.filter((node) => node.key === 'stage:answer')).toHaveLength(0)
    // Every declared row lands in exactly one node: the track and the percentage agree.
    const rendered = track.nodes.flatMap((node) => node.members.map((entry) => entry.seq)).sort((a, b) => a - b)
    expect(rendered).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('binds a Latin token only on word boundaries, so a substring is not a stage', () => {
    // The labels name no stage either, so this isolates the phase channel: the decoy is
    // the header, not the role.
    const neutral = { label: 'Member' }
    const track = trackOf([
      member(1, '任务 1 · explain the build', 'completed', neutral),
      member(2, '任务 2 · reexecuted twice', 'completed', neutral),
      member(3, '任务 3 · answerless draft', 'completed', neutral),
    ], 'completed')
    // `explain` carries `plan` and `reexecuted` carries `execute` — substrings, not
    // words. `answerless` used to carry the removed `answer` stage's token; it now names
    // no stage either. None of them names a stage, so no stage claims a row on the phase
    // channel and the three rows become extras.
    for (const key of ['plan', 'execute', 'verify', 'synthesize']) {
      expect(stageNode(track, key).members, key).toEqual([])
      expect(stageNode(track, key).evidence, key).toEqual([])
      expect(stageNode(track, key).state, key).toBe('pending')
    }
    expect(track.nodes.filter((node) => node.kind === 'extra')).toHaveLength(3)
    // A whole word binds. The `回答` header no longer binds a spine stage: it becomes
    // a node of its own, like any undeclared phase.
    const bound = trackOf([member(1, 'Plan the work', 'completed'), member(2, '准备材料后回答', 'completed')], 'completed')
    expect(stageNode(bound, 'plan').state).toBe('done')
    expect(bound.nodes.some((node) => node.key === 'stage:answer')).toBe(false)
  })

  it('names no stage for the three words the old spine mis-read: ui, tag and sync', () => {
    // The measured false hits were `ui` inside `build`, `tag` inside `stage`/`target` and
    // `sync` inside `async`. Neither half of the fix may regress: the spine does not carry
    // those tokens at all …
    const tokens = PROGRESS_STAGES.flatMap((stage) => stage.tokens)
    for (const gone of ['ui', 'tag', 'sync']) expect(tokens, gone).not.toContain(gone)
    // … and a header that contains them as substrings names no stage, so both rows become
    // plan-task nodes of their own instead of borrowing a stage they never ran.
    const neutral = { label: 'Member' }
    const decoys = trackOf([
      member(1, '任务 1 · UI build of the stage target', 'completed', neutral),
      member(2, '任务 2 · async sync of the tag list', 'completed', neutral),
    ], 'completed')
    for (const key of ['plan', 'execute', 'verify', 'synthesize']) {
      expect(stageNode(decoys, key).members, key).toEqual([])
      expect(stageNode(decoys, key).evidence, key).toEqual([])
      expect(stageNode(decoys, key).state, key).toBe('pending')
    }
    expect(decoys.nodes.filter((node) => node.kind === 'extra')).toHaveLength(2)
    // A whole word next to those decoys still binds, and so do the two ends of a header: a
    // boundary is any non-word character, including the ends themselves.
    const bound = trackOf([
      member(1, 'UI build of the stage target · 执行', 'completed'),
      member(2, 'plan', 'completed'),
      member(3, 'execute!', 'completed'),
    ], 'completed')
    expect(stageNode(bound, 'execute').state).toBe('done')
    expect(stageNode(bound, 'plan').state).toBe('done')
  })

  it('puts a numbered plan task mentioning a stage word on its own card, never on the spine', () => {
    // Regression: `任务 7 · 合并为干净可并发执行计划` carries `执行`, so the old
    // spine swallowed it as an `执行` stage row under `规划` instead of `任务 7`.
    const track = trackOf([
      member(20, '任务 7 · 合并为干净可并发执行计划', 'completed', { label: '执行' }),
      member(21, '任务 7 · 合并为干净可并发执行计划', 'completed', { label: '检查' }),
    ], 'completed')
    expect(stageNode(track, 'execute').members).toEqual([])
    expect(track.nodes.find((node) => node.key === 'phase:任务 7 · 合并为干净可并发执行计划')?.kind).toBe('extra')
    expect(track.nodes.filter((node) => node.kind === 'extra')).toHaveLength(1)
  })

  it('keys a plan-task node by its whole phase header, so two identical titles stay apart', () => {
    const track = trackOf([
      member(1, '任务 1 · 修复登录', 'completed'),
      member(2, '任务 2 · 修复登录', 'failed'),
    ], 'error')
    // The position is inside the header, so the two nodes never merge and the failed one
    // keeps its own state.
    const extras = track.nodes.filter((node) => node.kind === 'extra')
    expect(extras.map((node) => node.key)).toEqual(['phase:任务 1 · 修复登录', 'phase:任务 2 · 修复登录'])
    expect(extras.map((node) => node.state)).toEqual(['done', 'failed'])
    expect(track.percent).toEqual({ settled: 2, declared: 2, value: 100 })
  })

  it('gives an unphased row its own node rather than hiding it from the track', () => {
    const track = trackOf([member(1, undefined, 'completed')], 'completed')
    const unphased = track.nodes.find((node) => node.key === 'phase:')
    expect(unphased).toBeDefined()
    expect(unphased!.label).toBe('')
    expect(unphased!.state).toBe('done')
    expect(unphased!.members.map((entry) => entry.seq)).toEqual([1])
  })

  it('binds plan-task rows to the stage their role label names, so execute and verify are not "not reported"', () => {
    const track = trackOf([
      member(1, '任务 1 · 修复登录', 'completed', { label: '执行' }),
      member(2, '任务 1 · 修复登录', 'completed', { label: '检查' }),
      member(3, '任务 2 · 补文档', 'completed', { label: '执行' }),
    ], 'completed')
    // The rows keep their own plan-task nodes, one per group …
    expect(track.nodes.filter((node) => node.kind === 'extra')).toHaveLength(2)
    // … and they are also the evidence for the stage whose role ran them, so the two
    // stages every run performs stop being `pending` with an empty row list.
    const execute = stageNode(track, 'execute')
    const verify = stageNode(track, 'verify')
    expect(execute.evidence.map((entry) => entry.seq)).toEqual([1, 3])
    expect(execute.state).toBe('done')
    expect(verify.evidence.map((entry) => entry.seq)).toEqual([2])
    expect(verify.state).toBe('done')
    expect(execute.members).toEqual([])
    // One home per row: the evidence list is a cross-reference, never a second node.
    const rendered = track.nodes.flatMap((node) => node.members.map((entry) => entry.seq)).sort((a, b) => a - b)
    expect(rendered).toEqual([1, 2, 3])
    expect(track.percent).toEqual({ settled: 3, declared: 3, value: 100 })
  })

  it('derives the work stage from its evidence: failed when a task row failed, doing while one is open', () => {
    const failed = trackOf([
      member(1, '任务 1 · 修复登录', 'failed', { label: '执行' }),
      member(2, '任务 1 · 修复登录', 'completed', { label: '检查' }),
    ], 'error')
    expect(stageNode(failed, 'execute').state).toBe('failed')
    expect(stageNode(failed, 'verify').state).toBe('done')
    const open = trackOf([member(1, '任务 1 · 修复登录', undefined, { label: '执行' })], undefined)
    expect(stageNode(open, 'execute').state).toBe('doing')
  })

  it('keeps a stage’s own rows authoritative over its evidence', () => {
    const track = trackOf([
      member(1, '执行', 'completed'),
      member(2, '任务 1 · 修复登录', undefined, { label: '执行' }),
    ], undefined)
    const execute = stageNode(track, 'execute')
    expect(execute.members.map((entry) => entry.seq)).toEqual([1])
    expect(execute.evidence.map((entry) => entry.seq)).toEqual([2])
    // The stage's own row settled, so the stage is done even though a plan-task row is
    // still open; the open row keeps its own node and its own state.
    expect(execute.state).toBe('done')
    expect(track.nodes.find((node) => node.key === 'phase:任务 1 · 修复登录')?.state).toBe('doing')
  })

  it('invents no evidence for a label that names no stage', () => {
    const track = trackOf([member(1, '任务 1 · 修复登录', 'completed', { label: '整合者' })], 'completed')
    expect(stageNode(track, 'execute').evidence).toEqual([])
    expect(stageNode(track, 'verify').evidence).toEqual([])
    // Still the truth: no row ran as either stage, so both stay unreported.
    expect(stageNode(track, 'execute').state).toBe('pending')
  })

  it('binds the English role labels too, where the verifier is called Check', () => {
    const track = trackOf([
      member(1, 'Task 1 · fix login', 'completed', { label: 'Execute' }),
      member(2, 'Task 1 · fix login', 'completed', { label: 'Check' }),
      member(3, 'Task 1 · fix login', 'completed', { label: 'Execute (attempt 2)' }),
    ], 'completed')
    expect(stageNode(track, 'execute').evidence.map((entry) => entry.seq)).toEqual([1, 3])
    expect(stageNode(track, 'verify').evidence.map((entry) => entry.seq)).toEqual([2])
  })

  it('reports rows settled over rows declared, not a task verdict', () => {
    const members = [
      member(1, '执行', 'completed'),
      member(2, '执行', 'completed'),
      member(3, '执行', 'completed'),
      member(4, '执行'),
    ]
    expect(percentOf(members)).toEqual({ settled: 3, declared: 4, value: 75 })
    expect(percentOf([])).toBeUndefined()
    // Mid-run it reads the same way: three of four rows have settled so far.
    expect(trackOf(members, undefined).percent).toEqual({ settled: 3, declared: 4, value: 75 })
  })
})

describe('progress tab: the detail provenance ladder', () => {
  const block = ['```grok-coordination', JSON.stringify({
    changes: ['src/progress-tab.ts', 'src/client/index.js'],
    testsRun: ['npx vitest run test/progress-tab.spec.ts'],
    results: '2 files changed; tests pass',
  }, null, 2), '```'].join('\n')

  it('prefers a stage-detail payload, then the coordination block, then reports nothing', () => {
    const report = detailFor({
      // The payload may use the AGENTS.md spelling; it resolves to the same field.
      stageDetail: { WORK_COMMIT: 'abc1234', CHANGES: 'from the event' },
      coordinationText: block,
    })
    const byKey = new Map(report.fields.map((field) => [field.key, field]))
    // Level 1 wins for the fields the event carries …
    expect(byKey.get('workCommit')).toEqual({ key: 'workCommit', value: 'abc1234', source: 'stage-detail' })
    expect(byKey.get('changes')).toEqual({ key: 'changes', value: 'from the event', source: 'stage-detail' })
    // … level 2 fills the rest …
    expect(byKey.get('testsRun')?.source).toBe('coordination')
    expect(byKey.get('testsRun')?.value).toBe('npx vitest run test/progress-tab.spec.ts')
    expect(byKey.get('results')?.source).toBe('coordination')
    // … and everything else is explicitly not reported, never an empty string.
    const remaining: Array<'localRuntimeVerified' | 'blockers' | 'nextAction'> = ['localRuntimeVerified', 'blockers', 'nextAction']
    for (const key of remaining) {
      expect(byKey.get(key)).toEqual({ key, source: 'not-reported' })
      expect(byKey.get(key)?.value).toBeUndefined()
    }
    expect(report.coordinationRaw).toContain('src/progress-tab.ts')
    expect(report.fields).toHaveLength(DETAIL_FIELDS.length)
  })

  it('reports the seven AGENTS.md facts in the order a reader needs them', () => {
    // The field set is the coordination block's, not an invented schema: a report a reader
    // has already seen in a GitHub comment fills the same seven rows here.
    expect(DETAIL_FIELDS).toEqual([
      'workCommit',
      'changes',
      'testsRun',
      'results',
      'localRuntimeVerified',
      'blockers',
      'nextAction',
    ])
  })

  it('degrades to seven not-reported rows when no source exists', () => {
    const report = detailFor()
    expect(report.fields).toHaveLength(7)
    expect(report.fields.every((field) => field.source === 'not-reported')).toBe(true)
    expect(report.coordinationRaw).toBeUndefined()
    // Word for word, a reader must not see a fabricated value.
    expect(report.fields.every((field) => field.value === undefined)).toBe(true)
  })

  it('accepts the AGENTS.md labelled block, fenced or bare, and rejects prose', () => {
    const labelled = [
      'FROM: local',
      'TO: both',
      'TASK: #58',
      'BASE_COMMIT: 4b92278',
      'WORK_COMMIT: abc1234',
      'CHANGES: 进度 Tab 脊椎改按引擎 phase',
      'TESTS_RUN: npx vitest run test/progress-tab.spec.ts',
      'TEST_RESULTS: PASS',
      'LOCAL_RUNTIME_VERIFIED: no',
      'BLOCKERS: none',
      'NEXT_ACTION: 验证组真机截图',
    ].join('\n')
    const fields = parseCoordinationBlock(labelled)?.fields
    expect(fields).toEqual({
      workCommit: 'abc1234',
      changes: '进度 Tab 脊椎改按引擎 phase',
      testsRun: 'npx vitest run test/progress-tab.spec.ts',
      results: 'PASS',
      localRuntimeVerified: 'no',
      blockers: 'none',
      nextAction: '验证组真机截图',
    })
    // The same block inside a fence parses too, whatever the fence is labelled.
    expect(parseCoordinationBlock(['```text', labelled, '```'].join('\n'))?.fields.workCommit).toBe('abc1234')
    // One label is not a report, and a sentence that mentions a label is not one either.
    expect(parseCoordinationBlock('NEXT_ACTION: 继续')).toBeUndefined()
    expect(parseCoordinationBlock('CHANGES: a.ts; result: ok')).toBeUndefined()
    expect(parseCoordinationBlock('```grok-coordination\nnot json\n```')).toBeUndefined()
    expect(parseCoordinationBlock(undefined)).toBeUndefined()
  })

  it('accepts a nested coordination object and a JSON fence with two known fields', () => {
    const nested = ['```json', JSON.stringify({ coordination: { blockers: 'none', nextAction: 'push' } }), '```'].join('\n')
    expect(parseCoordinationBlock(nested)?.fields).toEqual({ blockers: 'none', nextAction: 'push' })

    // A generic JSON fence with two known fields is unmistakable; one field is not.
    const twoFields = ['```json', JSON.stringify({ workCommit: 'a', results: 'ok' }), '```'].join('\n')
    expect(parseCoordinationBlock(twoFields)?.fields).toEqual({ workCommit: 'a', results: 'ok' })
    const oneField = ['```json', JSON.stringify({ results: 'ok' }), '```'].join('\n')
    expect(parseCoordinationBlock(oneField)).toBeUndefined()
  })

  it('normalizes lists and numbers without inventing a value for an empty one', () => {
    const body = ['```grok-coordination', JSON.stringify({ changes: ['a', 'b'], blockers: [], testsRun: 3 }), '```'].join('\n')
    const fields = parseCoordinationBlock(body)?.fields
    expect(fields?.changes).toBe('a · b')
    expect(fields?.testsRun).toBe('3')
    // An empty list is "not reported", not a blank cell.
    expect(fields?.blockers).toBeUndefined()
  })
})

describe('progress tab: the stage-detail port', () => {
  it('folds a stage-detail event onto the node whose phase it names, and feeds the ladder', () => {
    const run = foldProgressRuns([
      rec(PROGRESS_RUN_START, { runId: 'run-1', name: '任务团队' }, 10),
      rec(PROGRESS_AGENT_START, { runId: 'run-1', seq: 1, label: '执行', phase: '执行', childId: 'c1' }, 11),
      rec(PROGRESS_AGENT_END, { runId: 'run-1', seq: 1, outcome: 'completed' }, 12),
      rec(PROGRESS_DETAIL_EVENT_TYPE, { runId: 'run-1', phase: '执行', WORK_COMMIT: 'abc1234', CHANGES: 'spine' }, 13),
      rec(PROGRESS_RUN_END, { runId: 'run-1', stopReason: 'completed' }, 14),
    ])[0]!
    // The payload is read, not ignored …
    expect(run.details).toHaveLength(1)
    // … and the state still comes from the four recorder events only.
    expect(run.members[0]?.outcome).toBe('completed')
    const track = deriveTrack(run, { labelFor })
    const execute = track.nodes.find((node) => node.key === 'stage:execute')!
    expect(execute.state).toBe('done')
    expect(execute.stageDetail?.fields).toEqual({ workCommit: 'abc1234', changes: 'spine' })
    // A node no payload names gets none: the tab never lends a neighbouring report.
    expect(track.nodes.find((node) => node.key === 'stage:verify')?.stageDetail).toBeUndefined()
    const report = detailFor(detailSourcesOf(track, execute))
    expect(report.fields.find((field) => field.key === 'workCommit'))
      .toEqual({ key: 'workCommit', value: 'abc1234', source: 'stage-detail' })
    expect(report.fields.find((field) => field.key === 'nextAction')?.source).toBe('not-reported')
  })

  it('uses a phase-less payload as the run-level fallback and lets an injected source win', () => {
    const run = foldProgressRuns([
      rec(PROGRESS_RUN_START, { runId: 'run-1', name: '任务团队' }, 10),
      rec(PROGRESS_AGENT_START, { runId: 'run-1', seq: 1, label: '执行', phase: '执行', childId: 'c1' }, 11),
      rec(PROGRESS_DETAIL_EVENT_TYPE, { runId: 'run-1', BLOCKERS: 'none' }, 12),
    ])[0]!
    const track = deriveTrack(run, { labelFor })
    const verify = track.nodes.find((node) => node.key === 'stage:verify')!
    const fallback = detailSourcesOf(track, verify)
    expect(fallback.stageDetail).toEqual({ blockers: 'none' })
    // A caller that can read a child session overrides the stream's payload.
    const injected = detailSourcesOf(track, verify, { stageDetail: { result: 'ignored-key' }, coordinationText: 'BLOCKERS: real\nNEXT_ACTION: go' })
    expect(injected.stageDetail).toEqual({ result: 'ignored-key' })
    expect(detailFor(injected).fields.find((field) => field.key === 'nextAction')?.value).toBe('go')
  })

  it('ignores an empty payload instead of claiming a stage was measured and found blank', () => {
    const run = foldProgressRuns([
      rec(PROGRESS_RUN_START, { runId: 'run-1', name: '任务团队' }, 10),
      rec(PROGRESS_DETAIL_EVENT_TYPE, { runId: 'run-1', phase: '执行', CHANGES: '   ' }, 11),
    ])[0]!
    expect(run.details).toEqual([])
    const track = deriveTrack(run, { labelFor })
    expect(track.stageDetail).toBeUndefined()
    expect(track.nodes.every((node) => node.stageDetail === undefined)).toBe(true)
  })
})

describe('progress tab: honest numbers', () => {
  it('formats a duration only when both ends were recorded', () => {
    expect(formatDuration(undefined)).toBeUndefined()
    expect(formatDuration(240)).toBe('240 ms')
    expect(formatDuration(1_200)).toBe('1.2 s')
    expect(formatDuration(123_000)).toBe('2 m 3 s')
    expect(formatDuration(-1)).toBeUndefined()
    expect(formatDuration(Number.NaN)).toBeUndefined()
  })
})

describe('progress tab: the numbered names a run repeats', () => {
  it('binds 规划（第N次） to the plan stage, one row per call', () => {
    const track = trackOf([
      member(1, '规划', 'completed', { label: '规划（第1次）' }),
      member(2, '规划 · 波 1 边界', 'completed', { label: '规划（第2次）' }),
      member(3, '规划 · 波 2 边界', 'completed', { label: '规划（第3次）' }),
    ], 'completed')
    const plan = stageNode(track, 'plan')
    expect(plan.members.map((row) => row.label)).toEqual(['规划（第1次）', '规划（第2次）', '规划（第3次）'])
    expect(plan.state).toBe('done')
  })

  it('binds 汇总·第N稿 to the synthesize stage as two rows in two units', () => {
    // Two drafts share the phase (`汇总`) and differ only by their name, so the
    // name is the whole of what keeps them apart. Draft 1 failing and draft 2
    // completing must not read as "the same call recovered".
    const track = trackOf([
      member(1, '汇总', 'failed', { label: '汇总·第1稿' }),
      member(2, '汇总', 'completed', { label: '汇总·第2稿' }),
    ], 'completed')
    const synthesize = stageNode(track, 'synthesize')
    expect(synthesize.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第2稿'])
    expect(recoveredFailureSeqs(synthesize.members).size).toBe(0)
    expect(currentFailureCount(synthesize.members)).toBe(1)

    // The bare name still folds as one unit, exactly as before: two `汇总助手` rows
    // are one call's two attempts, so the later completion does clear the earlier
    // failure. The numbered names are what changed, not the unit rule.
    const legacy = trackOf([
      member(1, '汇总', 'failed', { label: '汇总助手' }),
      member(2, '汇总', 'completed', { label: '汇总助手' }),
    ], 'completed')
    const legacySynthesize = stageNode(legacy, 'synthesize')
    expect(recoveredFailureSeqs(legacySynthesize.members).size).toBe(1)
    expect(currentFailureCount(legacySynthesize.members)).toBe(0)
  })

  it('marks the summary draft the gate shipped, and only that draft', () => {
    const [run] = foldProgressRuns([
      rec(PROGRESS_RUN_START, { runId: 'r', name: '任务团队' }, 1),
      rec(PROGRESS_AGENT_START, { runId: 'r', seq: 1, label: '汇总·第1稿', phase: '汇总', childId: 'c1' }, 2),
      rec(PROGRESS_AGENT_END, { runId: 'r', seq: 1, outcome: 'completed' }, 3),
      rec(PROGRESS_AGENT_START, { runId: 'r', seq: 2, label: '汇总·第2稿', phase: '汇总', childId: 'c2' }, 4),
      rec(PROGRESS_SUMMARY_FINAL_EVENT_TYPE, { runId: 'r', draft: 2 }, 5),
      rec(PROGRESS_AGENT_END, { runId: 'r', seq: 2, outcome: 'completed' }, 6),
      rec(PROGRESS_RUN_END, { runId: 'r', stopReason: 'completed' }, 7),
    ])
    expect(run!.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第2稿（定稿）'])
    expect(run!.summaryFinalDraft).toBe(2)
    // Both drafts stay on the synthesize stage, as two rows.
    expect(stageNode(deriveTrack(run!, { labelFor }), 'synthesize').members.map((row) => row.label))
      .toEqual(['汇总·第1稿', '汇总·第2稿（定稿）'])
  })

  it('marks only the row that landed when one draft was asked twice', () => {
    // A draft that prose-answered first and was asked once more in the same draft
    // carries two rows with the same name; the earlier one recorded nothing, so only
    // the later one is 「定稿」 and a reader never sees two final rows.
    const [run] = foldProgressRuns([
      rec(PROGRESS_RUN_START, { runId: 'r', name: '任务团队' }, 1),
      rec(PROGRESS_AGENT_START, { runId: 'r', seq: 1, label: '汇总·第1稿', phase: '汇总', childId: 'c1' }, 2),
      rec(PROGRESS_AGENT_END, { runId: 'r', seq: 1, outcome: 'completed' }, 3),
      rec(PROGRESS_AGENT_START, { runId: 'r', seq: 2, label: '汇总·第1稿', phase: '汇总', childId: 'c2' }, 4),
      rec(PROGRESS_AGENT_END, { runId: 'r', seq: 2, outcome: 'completed' }, 5),
      rec(PROGRESS_SUMMARY_FINAL_EVENT_TYPE, { runId: 'r', draft: 1 }, 6),
      rec(PROGRESS_RUN_END, { runId: 'r', stopReason: 'completed' }, 7),
    ])
    expect(run!.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第1稿（定稿）'])
    expect(run!.members.filter((row) => row.label.includes('定稿'))).toHaveLength(1)
  })

  it('stays idempotent and order-insensitive, and never invents a mark', () => {
    const events = (extra: ProgressEventRecord[]): ProgressEventRecord[] => [
      rec(PROGRESS_RUN_START, { runId: 'r', name: '任务团队' }, 1),
      ...extra,
      rec(PROGRESS_AGENT_START, { runId: 'r', seq: 1, label: '汇总·第1稿', phase: '汇总', childId: 'c1' }, 4),
      rec(PROGRESS_AGENT_START, { runId: 'r', seq: 2, label: '汇总·第2稿', phase: '汇总', childId: 'c2' }, 5),
      rec(PROGRESS_RUN_END, { runId: 'r', stopReason: 'completed' }, 6),
    ]
    // Arriving before the rows it names, twice, and once for a draft that never ran:
    // the mark lands once, on draft 2, and nothing else moves.
    const [before] = foldProgressRuns(events([
      rec(PROGRESS_SUMMARY_FINAL_EVENT_TYPE, { runId: 'r', draft: 2 }, 2),
      rec(PROGRESS_SUMMARY_FINAL_EVENT_TYPE, { runId: 'r', draft: 2 }, 3),
      rec(PROGRESS_SUMMARY_FINAL_EVENT_TYPE, { runId: 'r', draft: 9 }, 3),
    ]))
    expect(before!.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第2稿（定稿）'])
    expect(before!.summaryFinalDraft).toBe(2)
    // A stream with no such event renders exactly what it always did.
    const [none] = foldProgressRuns(events([]))
    expect(none!.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第2稿'])
    expect(none!.summaryFinalDraft).toBeUndefined()
    // A payload that names no draft is not a fact.
    const [junk] = foldProgressRuns(events([
      rec(PROGRESS_SUMMARY_FINAL_EVENT_TYPE, { runId: 'r', draft: 'two' }, 2),
      rec(PROGRESS_SUMMARY_FINAL_EVENT_TYPE, { runId: 'r', draft: 0 }, 3),
    ]))
    expect(junk!.summaryFinalDraft).toBeUndefined()
    expect(junk!.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第2稿'])
  })

  it('names the right stage from a numbered label when the phase is a task group', () => {
    // The role table is only consulted for rows whose phase names a plan task, so
    // this is the case that proves the new words reached it.
    const track = trackOf([
      member(1, '任务 1 · Task a', 'completed', { label: '规划（第1次）' }),
      member(2, '任务 1 · Task a', 'completed', { label: '汇总·第2稿' }),
    ], 'completed')
    expect(stageNode(track, 'plan').evidence.map((row) => row.label)).toEqual(['规划（第1次）'])
    expect(stageNode(track, 'synthesize').evidence.map((row) => row.label)).toEqual(['汇总·第2稿'])
  })
})

/**
 * The flow the page draws: one node per leg of the run.
 *
 * `src/client/index.js` repeats `deriveProgressFlow` as hand-written JavaScript, so every
 * case here is a fixture the browser half renders too. The rules pinned below are the
 * contract's own (`.tmp/flowchart-contract.md` §3 / §4): a leg is read off a row's
 * **label** (never its phase), a leg that ran again under its own number is its own node,
 * a leg that ran again with no number folds into the node beside it, a row that names no
 * leg is kept on the step before it, and the current node is the one a reader waits on.
 */
describe('progress tab: the flow of one run', () => {
  /** The recorder's own stream for one run, as `src/records.ts` writes it. */
  function streamOf(
    calls: ReadonlyArray<readonly [number, string, string, (string | undefined)?]>,
    options: { stopReason?: string, summaryFinal?: number, summaryRejected?: { drafts: number, stage: 'check' | 'verify', reason: string } } = {},
  ): ProgressEventRecord[] {
    const records: ProgressEventRecord[] = [
      rec(PROGRESS_RUN_START, { runId: 'r-flow', name: '任务团队 · 2 个任务' }, 1, 1_000),
    ]
    let at = 2
    for (const [seq, label, phase, outcome] of calls) {
      records.push(rec(PROGRESS_AGENT_START, { runId: 'r-flow', seq, label, phase, childId: `child-${seq}` }, at, 1_000 + seq * 100))
      at += 1
      if (outcome === undefined) continue
      records.push(rec(PROGRESS_AGENT_END, { runId: 'r-flow', seq, outcome }, at, 1_500 + seq * 100))
      at += 1
    }
    if (options.summaryFinal !== undefined) {
      records.push(rec(PROGRESS_SUMMARY_FINAL_EVENT_TYPE, { runId: 'r-flow', draft: options.summaryFinal }, at))
      at += 1
    }
    if (options.summaryRejected !== undefined) {
      records.push(rec(PROGRESS_SUMMARY_REJECTED_EVENT_TYPE, { runId: 'r-flow', ...options.summaryRejected }, at))
      at += 1
    }
    if (options.stopReason !== undefined) records.push(rec(PROGRESS_RUN_END, { runId: 'r-flow', stopReason: options.stopReason }, at))
    return records
  }

  /** The folded run and its flow. */
  function flowOf(events: ProgressEventRecord[]): ProgressFlow {
    const [run] = foldProgressRuns(events)
    expect(run, 'the fixture must fold into one run').toBeDefined()
    return deriveProgressFlow(run!)
  }

  /** One real run's order (§20.11): two tasks worked in waves, then the two summary drafts. */
  const realRun = [
    [1, '执行', '任务 1 · 修复登录', 'completed'],
    [2, '执行', '任务 2 · 写文档', 'completed'],
    [3, '检查', '任务 1 · 修复登录', 'completed'],
    [4, '检查', '任务 2 · 写文档', 'completed'],
    [5, '复核', '任务 1 · 修复登录', 'completed'],
    [6, '复核', '任务 2 · 写文档', 'completed'],
    [7, '汇总·第1稿', '汇总', 'completed'],
    [8, '汇总·第2稿', '汇总', 'completed'],
  ] as const

  it('draws one node per leg of a real run: the two ends, three work legs, both drafts', () => {
    const flow = flowOf(streamOf(realRun, { summaryFinal: 2, stopReason: 'completed' }))
    expect(flow.nodes.map((node) => [node.key, node.kind, node.ordinal, node.state])).toEqual([
      ['flow:start', 'start', 0, 'done'],
      ['flow:0:execute:1', 'execute', 1, 'done'],
      ['flow:1:check:1', 'check', 1, 'done'],
      ['flow:2:review:1', 'review', 1, 'done'],
      ['flow:3:summarize:1', 'summarize', 1, 'done'],
      ['flow:4:summarize:2', 'summarize', 2, 'done'],
      ['flow:end', 'end', 0, 'done'],
    ])
    // The two workers of one wave are one step, not two: the leg ran once. Every one of
    // their calls names its plan task, so each leg hangs one sub-node per task and keeps no
    // rows of its own — the same six rows are still the six the three legs speak for.
    expect(flow.nodes.slice(1, 4).map((node) => node.members)).toEqual([[], [], []])
    expect(flow.nodes.slice(1, 4).map((node) => node.subs!.map((sub) => sub.members.map((row) => row.seq)))).toEqual([
      [[1], [2]],
      [[3], [4]],
      [[5], [6]],
    ])
    expect(flow.nodes[4]!.members.map((row) => row.seq)).toEqual([7])
    expect(flow.nodes[5]!.members.map((row) => row.seq)).toEqual([8])
    // The two ends are structure, not calls: no rows of their own.
    expect(flow.nodes[0]!.members).toEqual([])
    expect(flow.nodes[6]!.members).toEqual([])
    expect(flow.state).toBe('done')
    expect(flow.total).toBe(7)
    expect(flow.at).toBe(7)
    expect(flow.remaining).toBe(0)
    // The draft the gate shipped is the closed line, read back off its own row.
    expect(flow.final).toEqual({ draft: 2, seq: 8 })
  })

  it('gives a leg that ran twice two nodes, numbered, instead of one node of two rows', () => {
    const flow = flowOf(streamOf([
      [1, '规划（第1次）', '规划', 'completed'],
      [2, '规划（第2次）', '规划', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes.map((node) => [node.key, node.ordinal])).toEqual([
      ['flow:start', 0],
      ['flow:0:plan:1', 1],
      ['flow:1:plan:2', 2],
      ['flow:end', 0],
    ])
    expect(flow.nodes[1]!.members.map((row) => row.label)).toEqual(['规划（第1次）'])
    expect(flow.nodes[2]!.members.map((row) => row.label)).toEqual(['规划（第2次）'])
    expect(flow.total).toBe(4)
  })

  it('folds the rows of one leg into one node, in seq order', () => {
    // Two calls of the same leg with no number of their own are one step: the wave the
    // workers ran in. Declared out of order, still read in `seq` order.
    const flow = flowOf(streamOf([
      [2, '执行', '任务 2 · 写文档', 'completed'],
      [1, '执行', '任务 1 · 修复登录', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes.map((node) => node.kind)).toEqual(['start', 'execute', 'end'])
    expect(flow.nodes[1]!.ordinal).toBe(1)
    expect(flow.nodes[1]!.members).toEqual([])
    expect(flow.nodes[1]!.subs!.map((sub) => [sub.taskNumber, sub.members.map((row) => row.seq)])).toEqual([[1, [1]], [2, [2]]])
  })

  it('keeps a retry as its own node: the numbered visit a reader can tell from the first', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'failed'],
      [2, '执行（尝试 2）', '任务 1 · 修复登录', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes.map((node) => [node.key, node.ordinal])).toEqual([
      ['flow:start', 0],
      ['flow:0:execute:1', 1],
      ['flow:1:execute:2', 2],
      ['flow:end', 0],
    ])
    // Each attempt keeps its own mark: the first pass did fail, and that is its own step.
    expect(flow.nodes[1]!.state).toBe('failed')
    expect(flow.nodes[2]!.state).toBe('done')
    expect(flow.final).toBeUndefined()
  })

  it('clears a failure a later attempt of the same call replaced', () => {
    // The failure and its replacement speak for the same call (same phase, same role word),
    // so the node's own `nodeState` reads the pair as recovered: a row that failed and was
    // then re-answered inside the same node must not dye that node amber.
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'failed'],
      [2, '执行', '任务 1 · 修复登录', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes[1]!.members).toEqual([])
    expect(flow.nodes[1]!.subs!.map((sub) => sub.members.map((row) => row.seq))).toEqual([[1, 2]])
    expect(flow.nodes[1]!.state).toBe('done')
    expect(flow.at).toBe(3)
    expect(flow.remaining).toBe(0)
  })

  it('marks a failure nothing replaced, and stops the highlight on it', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'failed'],
      [2, '检查', '任务 1 · 修复登录', 'completed'],
    ], { stopReason: 'error' }))
    expect(flow.state).toBe('failed')
    expect(flow.nodes[1]!.state).toBe('failed')
    // The end of a run that did not complete is not green either.
    expect(flow.nodes[3]!.state).toBe('failed')
    expect(flow.at).toBe(2)
    expect(flow.remaining).toBe(2)
  })

  it('highlights the node holding the call a reader is waiting on', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '检查', '任务 1 · 修复登录'],
    ]))
    expect(flow.state).toBe('running')
    expect(flow.nodes[2]!.state).toBe('doing')
    // Nothing is drawn as green past the step that is still working.
    expect(flow.nodes[3]!.state).toBe('pending')
    expect(flow.at).toBe(3)
    expect(flow.total).toBe(4)
    expect(flow.remaining).toBe(1)
  })

  it('calls a hole left by a finished run blocked, and points at it', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '检查', '任务 1 · 修复登录'],
    ], { stopReason: 'error' }))
    expect(flow.nodes[2]!.state).toBe('blocked')
    expect(flow.at).toBe(3)
  })

  it('writes the engine’s own word on the end of a cancelled run', () => {
    const flow = flowOf(streamOf([[1, '执行', '任务 1 · 修复登录', 'completed']], { stopReason: 'cancelled' }))
    expect(flow.state).toBe('cancelled')
    expect(flow.nodes[1]!.state).toBe('done')
    expect(flow.nodes[2]!.kind).toBe('end')
    expect(flow.nodes[2]!.state).toBe('cancelled')
    expect(flow.at).toBe(3)
  })

  it('draws only the two ends before anything was declared, with the start as the current node', () => {
    const flow = flowOf(streamOf([]))
    expect(flow.state).toBe('waiting')
    expect(flow.nodes.map((node) => [node.key, node.state])).toEqual([
      ['flow:start', 'done'],
      ['flow:end', 'pending'],
    ])
    expect(flow.total).toBe(2)
    expect(flow.at).toBe(1)
    expect(flow.remaining).toBe(1)
    expect(flow.final).toBeUndefined()
  })

  it('keeps a row whose label names no leg on the step before it', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '自定义子代理', '任务 1 · 修复登录', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes.map((node) => node.kind)).toEqual(['start', 'execute', 'end'])
    // Both calls name plan task 1, so the leg keeps them in that task's sub-node.
    expect(flow.nodes[1]!.members).toEqual([])
    expect(flow.nodes[1]!.subs!.map((sub) => sub.members.map((row) => row.seq))).toEqual([[1, 2]])
  })

  it('hangs a row that arrives before any step on the start', () => {
    const flow = flowOf(streamOf([
      [1, '自定义子代理', '规划', 'completed'],
      [2, '执行', '任务 1 · 修复登录', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes[0]!.members.map((row) => row.seq)).toEqual([1])
    expect(flow.nodes[1]!.kind).toBe('execute')
    expect(flow.nodes[1]!.members).toEqual([])
    expect(flow.nodes[1]!.subs!.map((sub) => sub.members.map((row) => row.seq))).toEqual([[2]])
  })

  it('leaves the guardian call out of the flow: its own monitor speaks for it', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, 'guardian adjudication', 'Guardian', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes.map((node) => node.kind)).toEqual(['start', 'execute', 'end'])
    // A guardian row is not a step, and it is not hung on a step or on one of its task
    // sub-nodes either.
    const rows = flow.nodes.flatMap((node) => [...node.members, ...(node.subs ?? []).flatMap((sub) => sub.members)])
    expect(rows.some((row) => isGuardianCard(row.label))).toBe(false)
    expect(flow.nodes[1]!.subs!.map((sub) => sub.members.map((row) => row.seq))).toEqual([[1]])
  })

  it('reads the English role labels the same way', () => {
    const flow = flowOf(streamOf([
      [1, 'Plan (call 2)', 'Plan', 'completed'],
      [2, 'Execute', 'Task 1 · Fix login', 'completed'],
      [3, 'Check', 'Task 1 · Fix login', 'completed'],
      [4, 'Reviewer', 'Task 1 · Fix login', 'completed'],
      [5, 'Summarize · draft 2', 'Synthesize', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes.map((node) => [node.kind, node.ordinal])).toEqual([
      ['start', 0],
      ['plan', 2],
      ['execute', 1],
      ['check', 1],
      ['review', 1],
      ['summarize', 2],
      ['end', 0],
    ])
  })

  it('folds a resubmit of one numbered visit into that same visit', () => {
    // A draft asked twice is still one draft (the fold marks only the row that landed), so
    // the second row claims a visit that is already open: one step, two calls.
    const flow = flowOf(streamOf([
      [1, '汇总·第2稿', '汇总', 'completed'],
      [2, '汇总·第2稿', '汇总', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes.map((node) => [node.key, node.ordinal])).toEqual([
      ['flow:start', 0],
      ['flow:0:summarize:2', 2],
      ['flow:end', 0],
    ])
    expect(flow.nodes[1]!.members.map((row) => row.seq)).toEqual([1, 2])
  })

  it('waits on the earliest call still open when two are open at once', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录'],
      [2, '检查', '任务 1 · 修复登录'],
    ]))
    expect(flow.nodes.map((node) => node.state)).toEqual(['done', 'doing', 'doing', 'pending'])
    expect(flow.at).toBe(2)
  })

  it('stops at the end of a run whose last call settled but which has not closed yet', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '检查', '任务 1 · 修复登录', 'completed'],
    ]))
    expect(flow.state).toBe('running')
    expect(flow.nodes.every((node) => node.state !== 'doing')).toBe(true)
    // The end is not reached yet, so it stays grey; the flow stands on it.
    expect(flow.nodes[3]!.state).toBe('pending')
    expect(flow.at).toBe(4)
    expect(flow.remaining).toBe(0)
  })

  it('marks the summary leg and keeps the verdict there when every draft was rejected', () => {
    // No draft shipped, and the record says why. The verdict is a property of the leg that
    // did not pass: that node turns `failed` (the page's own amber, no new colour) and holds
    // the three facts for its opened call list — never a card, never a standing sentence.
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '汇总·第1稿', '汇总', 'completed'],
      [3, '汇总·第2稿', '汇总', 'completed'],
    ], {
      summaryRejected: { drafts: 2, stage: 'check', reason: 'cites "x"' },
      stopReason: 'completed',
    }))
    expect(flow.final).toBeUndefined()
    expect(flow.nodes.map((node) => [node.key, node.state])).toEqual([
      ['flow:start', 'done'],
      ['flow:0:execute:1', 'done'],
      ['flow:1:summarize:1', 'done'],
      ['flow:2:summarize:2', 'failed'],
      ['flow:end', 'done'],
    ])
    // Only the last visit closed on the verdict: the first draft did reach the gate, and
    // marking it too would put the reader's place back where the run did not stop.
    expect(flow.nodes[3]!.rejected).toEqual({ drafts: 2, stage: 'check', reason: 'cites "x"' })
    expect(flow.nodes.filter((node) => node.rejected !== undefined)).toHaveLength(1)
    // A verdict marks a step; it does not add one.
    expect(flow.total).toBe(5)
    expect(flow.at).toBe(4)
    expect(flow.remaining).toBe(1)
  })

  it('adds the summary leg a run took without declaring it, rather than losing the verdict', () => {
    // A `model`-strategy summary runs inside the parent and records no row, so no node named
    // the leg. The verdict still has to be readable, and the page may not fall back to a
    // card: the flow gives it the empty node the leg lacked.
    const flow = flowOf(streamOf([
      [1, '规划助手', '规划', 'completed'],
      [2, '执行', '任务 1 · 修复登录', 'completed'],
    ], {
      summaryRejected: { drafts: 2, stage: 'verify', reason: 'the answer omits b' },
      stopReason: 'completed',
    }))
    // Columns: key, kind, state, rows kept on the step itself, task sub-nodes under it.
    expect(flow.nodes.map((node) => [node.key, node.kind, node.state, node.members.length, node.subs?.length ?? 0])).toEqual([
      ['flow:start', 'start', 'done', 0, 0],
      ['flow:0:plan:1', 'plan', 'done', 1, 0],
      ['flow:1:execute:1', 'execute', 'done', 0, 1],
      ['flow:2:summarize:1', 'summarize', 'failed', 0, 0],
      ['flow:end', 'end', 'done', 0, 0],
    ])
    expect(flow.nodes[3]!.rejected).toEqual({ drafts: 2, stage: 'verify', reason: 'the answer omits b' })
    // The counting stays honest: the step the run really took is counted, and the place
    // stops on it — the step after a failure is counted and unreached, as on any other leg.
    expect(flow.total).toBe(5)
    expect(flow.at).toBe(4)
    expect(flow.remaining).toBe(1)
  })

  it('carries no verdict on a run that shipped a draft, whatever else the stream claimed', () => {
    // The recorder never writes both, but a hand-written stream can: the draft the run really
    // shipped wins, so no node turns amber and the summary leg keeps its own state.
    const flow = flowOf(streamOf([
      [1, '汇总·第1稿', '汇总', 'completed'],
    ], {
      summaryFinal: 1,
      summaryRejected: { drafts: 2, stage: 'check', reason: 'stale' },
      stopReason: 'completed',
    }))
    expect(flow.final).toEqual({ draft: 1, seq: 1 })
    expect(flow.nodes.some((node) => node.rejected !== undefined)).toBe(false)
    expect(flow.nodes.map((node) => node.state)).toEqual(['done', 'done', 'done'])
  })

  it('keys every node by its position and leg, once and only once', () => {
    const flows = [
      flowOf(streamOf(realRun, { stopReason: 'completed' })),
      flowOf(streamOf([
        [1, '规划（第1次）', '规划', 'completed'],
        [2, '规划（第2次）', '规划', 'completed'],
        [3, '执行', '任务 1 · 修复登录', 'completed'],
        [4, '执行（尝试 2）', '任务 1 · 修复登录', 'completed'],
      ])),
      flowOf(streamOf([])),
      flowOf(streamOf([
        [1, '汇总·第1稿', '汇总', 'completed'],
      ], { summaryRejected: { drafts: 1, stage: 'check', reason: 'cites "x"' }, stopReason: 'completed' })),
      flowOf(streamOf([
        [1, '执行', '任务 1 · 修复登录', 'completed'],
      ], { summaryRejected: { drafts: 1, stage: 'check', reason: 'cites "x"' }, stopReason: 'completed' })),
    ]
    for (const flow of flows) {
      const keys = flow.nodes.map((node) => node.key)
      expect(new Set(keys).size).toBe(keys.length)
      // `flow:start` / `flow:end`, and `flow:<position>:<kind>:<ordinal>` for the middle,
      // where the position counts the middle nodes only, from 0.
      expect(keys).toEqual(flow.nodes.map((node, index) => {
        if (node.kind === 'start') return 'flow:start'
        if (node.kind === 'end') return 'flow:end'
        return `flow:${index - 1}:${node.kind}:${node.ordinal}`
      }))
    }
    // `at` and `remaining` are read off the same list the keys describe.
    for (const flow of flows) {
      expect(flow.total).toBe(flow.nodes.length)
      expect(flow.remaining).toBe(flow.total - flow.at)
      expect(flow.at).toBeGreaterThanOrEqual(1)
      expect(flow.at).toBeLessThanOrEqual(flow.total)
    }
  })
})

/**
 * The plan tasks a work leg hangs under it: `ProgressFlowNode.subs`.
 *
 * Contract `.tmp/flowchart-v2-contract.md` §1 / §2. A sub-node is neither a second set of
 * rows nor a second step: a leg's rows are only *split* between the leg and the tasks it
 * ran, the leg keeps the colour it had before the split, and the count keeps counting legs.
 * Each case names the clause it pins.
 */
describe('progress tab: the plan tasks a work leg hangs under it', () => {
  /** One run's stream in the recorder's order: `[seq, label, phase, outcome]`. */
  function streamOf(
    calls: ReadonlyArray<readonly [number, string, string | undefined, (string | undefined)?]>,
    options: { stopReason?: string, summaryRejected?: { drafts: number, stage: 'check' | 'verify', reason: string } } = {},
  ): ProgressEventRecord[] {
    const records: ProgressEventRecord[] = [
      rec(PROGRESS_RUN_START, { runId: 'r-subs', name: '任务团队 · 2 个任务' }, 1, 1_000),
    ]
    let at = 2
    for (const [seq, label, phase, outcome] of calls) {
      records.push(rec(PROGRESS_AGENT_START, { runId: 'r-subs', seq, label, phase, childId: `child-${seq}` }, at, 1_000 + seq * 100))
      at += 1
      if (outcome === undefined) continue
      records.push(rec(PROGRESS_AGENT_END, { runId: 'r-subs', seq, outcome }, at, 1_500 + seq * 100))
      at += 1
    }
    if (options.summaryRejected !== undefined) {
      records.push(rec(PROGRESS_SUMMARY_REJECTED_EVENT_TYPE, { runId: 'r-subs', ...options.summaryRejected }, at))
      at += 1
    }
    if (options.stopReason !== undefined) records.push(rec(PROGRESS_RUN_END, { runId: 'r-subs', stopReason: options.stopReason }, at))
    return records
  }

  /** The folded run and its flow. */
  function flowOf(events: ProgressEventRecord[]): ProgressFlow {
    const [run] = foldProgressRuns(events)
    expect(run, 'the fixture must fold into one run').toBeDefined()
    return deriveProgressFlow(run!)
  }

  /** Every row a node still speaks for: its own leftovers plus its sub-nodes', `seq` order. */
  function rowsOf(node: ProgressFlowNode): number[] {
    return [...node.members, ...(node.subs ?? []).flatMap((sub) => sub.members)]
      .map((row) => row.seq)
      .sort((left, right) => left - right)
  }

  it('hangs one sub-node per plan task under each of the three work legs', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 2 · 写文档', 'completed'],
      [2, '执行', '任务 1 · 修复登录', 'completed'],
      [3, '检查', '任务 1 · 修复登录', 'completed'],
      [4, '检查', '任务 2 · 写文档', 'completed'],
      [5, '复核', '任务 2 · 写文档', 'completed'],
      [6, '复核', '任务 1 · 修复登录', 'completed'],
    ], { stopReason: 'completed' }))
    const legs = flow.nodes.filter((node) => node.kind === 'execute' || node.kind === 'check' || node.kind === 'review')
    expect(legs.map((node) => node.key)).toEqual(['flow:0:execute:1', 'flow:1:check:1', 'flow:2:review:1'])
    // §2.3: key, number, title verbatim, own state — per task, in number order.
    for (const leg of legs) {
      expect(leg.subs?.map((sub) => [sub.key, sub.taskNumber, sub.title, sub.state])).toEqual([
        [`${leg.key}:t1`, 1, '任务 1 · 修复登录', 'done'],
        [`${leg.key}:t2`, 2, '任务 2 · 写文档', 'done'],
      ])
    }
    // A task's calls sit in that task's sub-node in `seq` order: the worker who ran task 2
    // first does not jump in front of the one who ran task 1.
    expect(legs.map((leg) => leg.subs!.map((sub) => sub.members.map((row) => row.seq)))).toEqual([
      [[2], [1]],
      [[3], [4]],
      [[6], [5]],
    ])
  })

  it('leaves the leg only the rows that named no task, and loses none of them', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '执行', undefined, 'completed'],
    ], { stopReason: 'completed' }))
    const leg = flow.nodes[1]!
    // §2.1 / §2.4: a row with no task number of its own stays on the leg.
    expect(leg.members.map((row) => row.seq)).toEqual([2])
    expect(leg.subs!.map((sub) => [sub.taskNumber, sub.members.map((row) => row.seq)])).toEqual([[1, [1]]])
    // §2.6: leg plus sub-nodes hold exactly the rows the leg held before the split — the
    // same row objects, each exactly once.
    expect(rowsOf(leg)).toEqual([1, 2])
    expect(new Set([...leg.members, ...leg.subs!.flatMap((sub) => sub.members)]).size).toBe(2)
  })

  it('has no `subs` key at all on a leg whose rows named no task', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '修复登录', 'completed'],
      [2, '执行', '写文档', 'completed'],
    ], { stopReason: 'completed' }))
    const leg = flow.nodes[1]!
    // §2.2: the shape is §21's, not an empty list — a reader may simply ask for the key.
    expect('subs' in leg).toBe(false)
    expect(leg.members.map((row) => row.seq)).toEqual([1, 2])
  })

  it('puts two calls of one task in one sub-node and reads its state through the recovery rule', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'failed'],
      [2, '执行', '任务 1 · 修复登录', 'completed'],
    ], { stopReason: 'completed' }))
    const subs = flow.nodes[1]!.subs!
    // §2.10 / §2.3: a retried task is one sub-node, and its calls keep `seq` order.
    expect(subs.map((sub) => [sub.taskNumber, sub.title, sub.members.map((row) => row.seq)])).toEqual([
      [1, '任务 1 · 修复登录', [1, 2]],
    ])
    // The first call really did fail and its row keeps that mark; the task itself was
    // re-answered, so the sub-node reads `done` under the same rule as the leg above it.
    expect(subs[0]!.members.map((row) => row.outcome)).toEqual(['failed', 'completed'])
    expect(subs[0]!.state).toBe('done')
  })

  it('fills no gap: tasks 1 and 3 are two sub-nodes and there is no 2', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '执行', '任务 3 · 补测试', 'completed'],
    ], { stopReason: 'completed' }))
    // §2.10: the stream declared tasks 1 and 3, so that is what is drawn.
    expect(flow.nodes[1]!.subs!.map((sub) => [sub.taskNumber, sub.key])).toEqual([
      [1, 'flow:0:execute:1:t1'],
      [3, 'flow:0:execute:1:t3'],
    ])
  })

  it('keeps the leg’s colour: its state is read off the whole leg before the split', () => {
    // Every row moved into a sub-node, so a state read off what the split left behind would
    // be grey; the leg has to stay as green as it was.
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '执行', '任务 2 · 写文档', 'completed'],
    ], { stopReason: 'completed' }))
    const leg = flow.nodes[1]!
    expect(leg.members).toEqual([])
    expect(leg.state).toBe('done')
    expect(nodeState(leg.members, true)).toBe('pending')
    // Nor is it read off the one task that already finished: the leg is still working.
    const running = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '执行', '任务 2 · 写文档'],
    ]))
    expect(running.nodes[1]!.subs!.map((sub) => sub.state)).toEqual(['done', 'doing'])
    expect(running.nodes[1]!.state).toBe('doing')
  })

  it('counts steps, not sub-nodes: `total` / `at` / `remaining` are the same with and without them', () => {
    const numbered = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '执行', '任务 2 · 写文档', 'completed'],
      [3, '检查', '任务 1 · 修复登录'],
    ]))
    const plain = flowOf(streamOf([
      [1, '执行', '修复登录', 'completed'],
      [2, '执行', '写文档', 'completed'],
      [3, '检查', '修复登录'],
    ]))
    // The two streams differ only in whether the legs hang sub-nodes...
    expect(numbered.nodes.flatMap((node) => node.subs ?? [])).toHaveLength(3)
    expect(plain.nodes.some((node) => 'subs' in node)).toBe(false)
    // ...so the drawing's own numbers are identical, and still count legs.
    expect([numbered.state, numbered.total, numbered.at, numbered.remaining])
      .toEqual([plain.state, plain.total, plain.at, plain.remaining])
    expect(numbered.total).toBe(numbered.nodes.length)
    expect(numbered.remaining).toBe(numbered.total - numbered.at)
  })

  it('never hangs sub-nodes under the two ends, the plan or the summary', () => {
    const flow = flowOf(streamOf([
      [1, '规划助手', '任务 1 · 规划', 'completed'],
      [2, '执行', '任务 1 · 修复登录', 'completed'],
      [3, '汇总·第1稿', '任务 1 · 汇总', 'completed'],
    ], { summaryRejected: { drafts: 1, stage: 'check', reason: 'cites "x"' }, stopReason: 'completed' }))
    // The plan and summary rows here *do* carry task numbers, so "no sub-nodes" is a rule
    // about those legs and not an accident of the fixture.
    for (const kind of ['start', 'end', 'plan', 'summarize']) {
      const nodes = flow.nodes.filter((node) => node.kind === kind)
      expect(nodes.length, `the fixture draws a ${kind} node`).toBeGreaterThan(0)
      for (const node of nodes) expect('subs' in node, `${kind} carries no sub-nodes`).toBe(false)
    }
    // The work leg proves those numbers were there to be read.
    expect(flow.nodes.find((node) => node.kind === 'execute')!.subs!.map((sub) => sub.taskNumber)).toEqual([1])
    // §2.8: the verdict stays on the step it is about, with the calls it names.
    const summary = flow.nodes.find((node) => node.kind === 'summarize')!
    expect(summary.state).toBe('failed')
    expect(summary.rejected).toEqual({ drafts: 1, stage: 'check', reason: 'cites "x"' })
    expect(summary.members.map((row) => row.seq)).toEqual([3])
  })

  it('leaves the guardian call out of the sub-nodes as well', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, 'guardian adjudication', '任务 1 · Guardian 判停', 'completed'],
    ], { stopReason: 'completed' }))
    expect(flow.nodes.map((node) => node.kind)).toEqual(['start', 'execute', 'end'])
    // §2.9: the guardian row is out before anything is bucketed — it is neither a step nor
    // a row of one, and not a row of a task sub-node either.
    const rows = flow.nodes.flatMap((node) => [...node.members, ...(node.subs ?? []).flatMap((sub) => sub.members)])
    expect(rows.some((row) => isGuardianCard(row.label))).toBe(false)
    expect(flow.nodes[1]!.subs!.map((sub) => [sub.taskNumber, sub.members.map((row) => row.seq)])).toEqual([[1, [1]]])
  })

  it('reads the task number off the phase only, never off the label', () => {
    const flow = flowOf(streamOf([
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '执行（尝试 1）', undefined, 'completed'],
    ], { stopReason: 'completed' }))
    const leg = flow.nodes[1]!
    // `执行（尝试 1）` claims the visit already open, so it is a call of this very leg — but
    // `taskNumberIn(undefined)` is no task, and the `1` in its label is not one either.
    expect(leg.members.map((row) => [row.seq, row.label])).toEqual([[2, '执行（尝试 1）']])
    expect(leg.subs!.map((sub) => [sub.taskNumber, sub.members.map((row) => row.seq)])).toEqual([[1, [1]]])
  })
})

/**
 * The design document's "released spine" claim, pinned to the code.
 *
 * Manual item Sec.2-5 removed the permanently-empty `回答` stage. The document kept
 * describing a seven-stage spine, which is exactly the kind of drift that makes a
 * reader trust a cell that can never fill; the guard below reads the doc and the
 * exported spine together.
 */
describe('design document: the released spine matches PROGRESS_STAGES', () => {
  const doc = readFileSync(new URL('../docs/knowledge/DESIGN-progress-tab.md', import.meta.url), 'utf8')

  /**
   * The doc's own sections, so a dated record can be told from a live claim.
   *
   * §13 / §14 / §15 measured a spine that still had a seventh slot, and §19.0 keeps those
   * numbers as measured (`§13 里的「7 个阶段空环」是 2026-11-15 当时的实测记录…不回改`).
   * Rewriting a measurement to protect a guard would trade one wrong number for another,
   * so the live claims are what gets pinned; the records stay as they were written.
   */
  const HISTORY_SECTIONS = ['13', '14', '15']
  const sections = doc.split(/^## /m).slice(1).map((chunk) => {
    const newline = chunk.indexOf('\n')
    return { heading: newline === -1 ? chunk : chunk.slice(0, newline), body: newline === -1 ? '' : chunk.slice(newline + 1) }
  })
  const liveDoc = sections
    .filter((section) => !HISTORY_SECTIONS.includes(/^(\d+)\./.exec(section.heading)?.[1] ?? ''))
    .map((section) => section.body)
    .join('\n')

  /**
   * The live prose, with the doc's own citations taken out.
   *
   * §19.0 has to be able to name the reading it corrected (`§13 里的「7 个阶段空环」`), so a
   * quoted or code-spanned phrase is read as a citation here; what the doc asserts is the
   * text outside those marks.
   */
  const liveProse = liveDoc.replace(/「[^」]*」/gu, '').replace(/`[^`\n]*`/gu, '')

  /**
   * A live sentence that puts the fixed count at seven: a number, a counter, and the noun
   * it counts (`7 段固定脊`, `七个模板段`, `7 个阶段空环`). Anchoring on the noun is what lets
   * §19.0's `六段，不是七段` stand: it names the wrong count to correct it, and names no
   * segment of its own.
   */
  const SEVEN_CLAIM = /(?:七|7)\s*(?:段|个)\s*(?:固定)?\s*(?:脊|固定段|模板段|阶段(?:空环|名))/gu

  it('quotes the six-stage spine the code exports, with no answer stage', () => {
    const line = '`起点 → 规划 → 执行 → 检查 → 汇总 → 终点`'
    expect(doc, 'the released spine is not stated in the design document').toContain(line)
    expect(doc, 'the design document still promises a 回答 stage').not.toContain('→ 回答 →')
    expect(doc).toContain('六段固定脊椎')
    expect(doc).not.toContain('七段固定脊椎')
    // The quoted spine and the exported track describe the same number of nodes.
    expect(line.slice(1, -1).split(' → ')).toHaveLength(PROGRESS_STAGES.length)
  })

  it('no live sentence reads the fixed spine as seven stages again', () => {
    expect([...liveProse.matchAll(SEVEN_CLAIM)].map((match) => match[0])).toEqual([])
  })

  it('states the spine’s stage count, and states it as PROGRESS_STAGES.length', () => {
    // Every place the doc puts a number on the spine: `N 段固定脊` and `脊只有 N 段`.
    // Chinese numerals are read too, because the doc writes both.
    const normalized = liveDoc.replace(/七段/gu, '7 段').replace(/六段/gu, '6 段')
    const stated = [
      ...[...normalized.matchAll(/(\d+)\s*段\s*固定\s*脊/gu)].map((match) => Number(match[1])),
      ...[...normalized.matchAll(/脊(?:只有|仍是|就是)\s*(\d+)\s*段/gu)].map((match) => Number(match[1])),
      ...[...normalized.matchAll(/(?:恒|固定)\s*(\d+)\s*个/gu)].map((match) => Number(match[1])),
    ]
    // A guard that finds nothing proves nothing: the doc states the count more than once.
    expect(stated.length).toBeGreaterThanOrEqual(2)
    expect(stated).toEqual(stated.map(() => PROGRESS_STAGES.length))
  })
})
