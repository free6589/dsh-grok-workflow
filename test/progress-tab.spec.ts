import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DETAIL_FIELDS,
  PROGRESS_DETAIL_EVENT_TYPE,
  PROGRESS_EVENT_TYPES,
  PROGRESS_NODE_KIND,
  PROGRESS_STAGES,
  PROGRESS_VIEW_TARGET,
  deriveProgressStory,
  deriveTrack,
  detailFor,
  detailSourcesOf,
  foldProgressRuns,
  formatDuration,
  currentFailureCount,
  nodeState,
  parseCoordinationBlock,
  percentOf,
  recoveredFailureSeqs,
  selectActiveRun,
} from '../src/progress-tab.js'
import type { ProgressEventRecord, ProgressMemberFact, ProgressRunFacts } from '../src/progress-tab.js'

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
 * `tool-workflow/summary-final` and the typed copy did not, the shipped draft number was
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
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
      'tool-workflow/summary-final',
      'tool-workflow/guardian-start',
      'tool-workflow/guardian-finding',
      'tool-workflow/guardian-end',
      'tool-workflow/run-end',
    ])
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
      rec('tool-workflow/run-start', { runId: 'run-1', name: '任务团队 · 2 个任务' }, 10, 1_000),
      rec('tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: '执行', phase: '任务 1 · 修复登录', childId: 'c1' }, 11, 1_100),
      rec('tool-workflow/guardian-start', { runId: 'run-1', armed: true, budgetMs: 300_000 }, 12, 1_200),
      rec('tool-workflow/guardian-finding', { runId: 'run-1', seq: 1, label: '执行', signal: 'timeout', action: 'rescue', reason: 'rescued with guidance', atMs: 1_500 }, 13, 1_500),
      rec('tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }, 14, 2_100),
      rec('tool-workflow/guardian-end', { runId: 'run-1', cancelled: false, findingCount: 1 }, 15, 2_150),
      rec('tool-workflow/run-end', { runId: 'run-1', stopReason: 'completed' }, 16, 2_200),
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

  it('is order-insensitive, idempotent and settles a row whose start arrives late', () => {
    const events = [
      // Shuffled on purpose: a replay may hand a reader events in another order.
      rec('tool-workflow/run-end', { runId: 'run-1', stopReason: 'error' }, 13),
      rec('tool-workflow/agent-end', { runId: 'run-1', seq: 2, outcome: 'failed' }, 12),
      rec('tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11),
      rec('tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11),
      rec('tool-workflow/agent-end', { runId: 'run-1', seq: 2, outcome: 'failed' }, 12),
      rec('tool-workflow/agent-start', { runId: 'run-1', seq: 2, label: '检查', phase: '任务 1 · 修复', childId: 'c2' }, 11),
      rec('tool-workflow/run-start', { runId: 'run-1', name: '任务团队 · 1 个任务' }, 10),
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
      rec('tool-workflow/agent-start', { runId: 'ghost', seq: 1, label: '执行', childId: 'c1' }, 5),
      rec('tool-workflow/agent-end', { runId: 'ghost', seq: 1, outcome: 'completed' }, 6),
      rec('tool-workflow/run-start', { runId: 'run-1', name: '任务团队' }, 10),
      rec('tool-workflow/agent-end', { runId: 'run-1', seq: 9, outcome: 'completed' }, 11),
    ])
    expect(runs.map((run) => run.runId)).toEqual(['run-1'])
    expect(runs[0]!.members).toEqual([])
  })

  it('keeps an observe finding as observed, not as a run cancellation', () => {
    const runs = foldProgressRuns([
      rec('tool-workflow/run-start', { runId: 'run-1', name: '任务团队' }, 10),
      rec('tool-workflow/guardian-finding', { runId: 'run-1', seq: 1, label: '执行', signal: 'timeout', action: 'observe', reason: 'left running', atMs: 1_500 }, 13),
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
      rec('tool-workflow/run-start', { runId: 'run-1', name: '任务团队' }, 10),
      rec('tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: '执行', phase: '执行', childId: 'c1' }, 11),
      rec('tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }, 12),
      rec(PROGRESS_DETAIL_EVENT_TYPE, { runId: 'run-1', phase: '执行', WORK_COMMIT: 'abc1234', CHANGES: 'spine' }, 13),
      rec('tool-workflow/run-end', { runId: 'run-1', stopReason: 'completed' }, 14),
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
      rec('tool-workflow/run-start', { runId: 'run-1', name: '任务团队' }, 10),
      rec('tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: '执行', phase: '执行', childId: 'c1' }, 11),
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
      rec('tool-workflow/run-start', { runId: 'run-1', name: '任务团队' }, 10),
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
      rec('tool-workflow/run-start', { runId: 'r', name: '任务团队' }, 1),
      rec('tool-workflow/agent-start', { runId: 'r', seq: 1, label: '汇总·第1稿', phase: '汇总', childId: 'c1' }, 2),
      rec('tool-workflow/agent-end', { runId: 'r', seq: 1, outcome: 'completed' }, 3),
      rec('tool-workflow/agent-start', { runId: 'r', seq: 2, label: '汇总·第2稿', phase: '汇总', childId: 'c2' }, 4),
      rec('tool-workflow/summary-final', { runId: 'r', draft: 2 }, 5),
      rec('tool-workflow/agent-end', { runId: 'r', seq: 2, outcome: 'completed' }, 6),
      rec('tool-workflow/run-end', { runId: 'r', stopReason: 'completed' }, 7),
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
      rec('tool-workflow/run-start', { runId: 'r', name: '任务团队' }, 1),
      rec('tool-workflow/agent-start', { runId: 'r', seq: 1, label: '汇总·第1稿', phase: '汇总', childId: 'c1' }, 2),
      rec('tool-workflow/agent-end', { runId: 'r', seq: 1, outcome: 'completed' }, 3),
      rec('tool-workflow/agent-start', { runId: 'r', seq: 2, label: '汇总·第1稿', phase: '汇总', childId: 'c2' }, 4),
      rec('tool-workflow/agent-end', { runId: 'r', seq: 2, outcome: 'completed' }, 5),
      rec('tool-workflow/summary-final', { runId: 'r', draft: 1 }, 6),
      rec('tool-workflow/run-end', { runId: 'r', stopReason: 'completed' }, 7),
    ])
    expect(run!.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第1稿（定稿）'])
    expect(run!.members.filter((row) => row.label.includes('定稿'))).toHaveLength(1)
  })

  it('stays idempotent and order-insensitive, and never invents a mark', () => {
    const events = (extra: ProgressEventRecord[]): ProgressEventRecord[] => [
      rec('tool-workflow/run-start', { runId: 'r', name: '任务团队' }, 1),
      ...extra,
      rec('tool-workflow/agent-start', { runId: 'r', seq: 1, label: '汇总·第1稿', phase: '汇总', childId: 'c1' }, 4),
      rec('tool-workflow/agent-start', { runId: 'r', seq: 2, label: '汇总·第2稿', phase: '汇总', childId: 'c2' }, 5),
      rec('tool-workflow/run-end', { runId: 'r', stopReason: 'completed' }, 6),
    ]
    // Arriving before the rows it names, twice, and once for a draft that never ran:
    // the mark lands once, on draft 2, and nothing else moves.
    const [before] = foldProgressRuns(events([
      rec('tool-workflow/summary-final', { runId: 'r', draft: 2 }, 2),
      rec('tool-workflow/summary-final', { runId: 'r', draft: 2 }, 3),
      rec('tool-workflow/summary-final', { runId: 'r', draft: 9 }, 3),
    ]))
    expect(before!.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第2稿（定稿）'])
    expect(before!.summaryFinalDraft).toBe(2)
    // A stream with no such event renders exactly what it always did.
    const [none] = foldProgressRuns(events([]))
    expect(none!.members.map((row) => row.label)).toEqual(['汇总·第1稿', '汇总·第2稿'])
    expect(none!.summaryFinalDraft).toBeUndefined()
    // A payload that names no draft is not a fact.
    const [junk] = foldProgressRuns(events([
      rec('tool-workflow/summary-final', { runId: 'r', draft: 'two' }, 2),
      rec('tool-workflow/summary-final', { runId: 'r', draft: 0 }, 3),
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
 * The one-page story: the three screens (§19) as one pure derivation.
 *
 * `src/client/index.js` repeats this function as hand-written JavaScript, so every case
 * here is also a fixture `test/client.spec.ts` renders. The rules are the contract's own
 * (§19.2): the five chip states read the run's facts and never the plan size, a step is a
 * plan task when the run declared any and one call otherwise, and the amber bar only
 * speaks for a failure of the *current* step that no later attempt replaced.
 */
describe('progress tab: the one-page story', () => {
  /**
   * The recorder's own stream for one run.
   *
   * `run-start`, one start/settle pair per declared call, then the optional
   * `summary-final` claim and `run-end` — exactly what `src/records.ts` writes, so the
   * fixtures below exercise the fold (labels, the shipped-draft mark) instead of
   * hand-building a run nobody recorded.
   */
  function streamOf(
    calls: ReadonlyArray<readonly [number, string, string, (string | undefined)?]>,
    options: { stopReason?: string, summaryFinal?: number } = {},
  ): ProgressEventRecord[] {
    const records: ProgressEventRecord[] = [
      rec('tool-workflow/run-start', { runId: 'r-story', name: '任务团队 · 3 个任务' }, 1, 1_000),
    ]
    let at = 2
    for (const [seq, label, phase, outcome] of calls) {
      records.push(rec('tool-workflow/agent-start', { runId: 'r-story', seq, label, phase, childId: `child-${seq}` }, at, 1_000 + seq * 100))
      at += 1
      if (outcome === undefined) continue
      records.push(rec('tool-workflow/agent-end', { runId: 'r-story', seq, outcome }, at, 1_500 + seq * 100))
      at += 1
    }
    if (options.summaryFinal !== undefined) {
      records.push(rec('tool-workflow/summary-final', { runId: 'r-story', draft: options.summaryFinal }, at))
      at += 1
    }
    if (options.stopReason !== undefined) records.push(rec('tool-workflow/run-end', { runId: 'r-story', stopReason: options.stopReason }, at))
    return records
  }

  /** The folded run and its story. */
  function storyOf(events: ProgressEventRecord[]) {
    const [run] = foldProgressRuns(events)
    expect(run, 'the fixture must fold into one run').toBeDefined()
    return deriveProgressStory(run!)
  }

  it('waiting: nothing declared yet — a planning headline, no steps, and the start button', () => {
    const story = storyOf(streamOf([]))
    expect(story.state).toBe('waiting')
    expect(story.steps).toEqual([])
    expect(story.total).toBe(0)
    expect(story.at).toBe(0)
    expect(story.now).toEqual({ titleKey: 'planning', title: '' })
    expect(story.attempt).toBeUndefined()
    expect(story.rest).toEqual([])
    expect(story.log).toEqual([])
    expect(story.final).toBeUndefined()
    expect(story.dock).toBe('start')
  })

  it('running: one step per plan task, the first open one current, the ones after it named', () => {
    const story = storyOf(streamOf([
      [1, '规划助手', '规划', 'completed'],
      [2, '执行', '任务 1 · 修复登录', 'completed'],
      [3, '检查', '任务 1 · 修复登录', 'completed'],
      [4, '执行', '任务 2 · 写文档'],
      [5, '执行', '任务 3 · 补测试', 'completed'],
    ]))
    expect(story.state).toBe('running')
    // A step is a plan task: its own phase header, its own position, its own chain.
    expect(story.steps.map((step) => [step.key, step.number, step.title, step.state])).toEqual([
      ['phase:任务 1 · 修复登录', 1, '任务 1 · 修复登录', 'done'],
      ['phase:任务 2 · 写文档', 2, '任务 2 · 写文档', 'doing'],
      ['phase:任务 3 · 补测试', 3, '任务 3 · 补测试', 'done'],
    ])
    expect(story.steps[0]!.chain.map((slot) => slot.key)).toEqual(['execute', 'check', 'review'])
    expect(story.steps[0]!.members.map((row) => row.seq)).toEqual([2, 3])
    expect(story.total).toBe(3)
    expect(story.at).toBe(2)
    // The headline is the current step's own title, verbatim: no re-numbering, no cut.
    expect(story.now).toEqual({ title: '任务 2 · 写文档', role: '执行' })
    expect(story.rest).toEqual(['任务 3 · 补测试'])
    expect(story.log.map((row) => [row.seq, row.role, row.title, row.state])).toEqual([
      [1, '规划助手', '规划', 'done'],
      [2, '执行', '任务 1 · 修复登录', 'done'],
      [3, '检查', '任务 1 · 修复登录', 'done'],
      [4, '执行', '任务 2 · 写文档', 'doing'],
      [5, '执行', '任务 3 · 补测试', 'done'],
    ])
    // Nothing is shipped yet, and a running page asks for no click.
    expect(story.log.every((row) => row.shipped === undefined)).toBe(true)
    expect(story.final).toBeUndefined()
    expect(story.dock).toBe('quiet')
  })

  it('done: the whole plan passed — the finished headline, the shipped draft marked', () => {
    const story = storyOf(streamOf([
      [1, '规划助手', '规划', 'completed'],
      [2, '执行', '任务 1 · 修复登录', 'completed'],
      [3, '检查', '任务 1 · 修复登录', 'completed'],
      [4, '汇总·第1稿', '汇总', 'completed'],
    ], { summaryFinal: 1, stopReason: 'completed' }))
    expect(story.state).toBe('done')
    expect(story.steps.map((step) => [step.key, step.number, step.state])).toEqual([
      ['phase:任务 1 · 修复登录', 1, 'done'],
    ])
    expect(story.total).toBe(1)
    expect(story.at).toBe(1)
    expect(story.now).toEqual({ titleKey: 'done', title: '' })
    expect(story.now.role).toBeUndefined()
    expect(story.rest).toEqual([])
    // The shipped row keeps its own line and says so; no other line claims the mark, and
    // the mark never leaks into the role the line is spoken as.
    expect(story.log.map((row) => [row.seq, row.role, row.title, row.state, row.shipped === true])).toEqual([
      [1, '规划助手', '规划', 'done', false],
      [2, '执行', '任务 1 · 修复登录', 'done', false],
      [3, '检查', '任务 1 · 修复登录', 'done', false],
      [4, '汇总·第1稿', '汇总', 'done', true],
    ])
    expect(story.final?.draft).toBe(1)
    expect(story.final?.label).toBe('汇总')
    expect(story.final?.row).toBe(story.log[3])
    expect(story.dock).toBe('accept')
  })

  it('failed: the amber bar counts the attempt of the unit that is still broken', () => {
    const calls = [
      [1, '执行', '任务 1 · 修复登录', 'completed'],
      [2, '执行', '任务 2 · 写文档', 'failed'],
      [3, '执行（尝试 2）', '任务 2 · 写文档', undefined],
      [4, '执行', '任务 3 · 补测试', 'cancelled'],
    ] as const
    const running = storyOf(streamOf(calls))
    expect(running.state).toBe('running')
    expect(running.steps.map((step) => [step.number, step.state])).toEqual([[1, 'done'], [2, 'failed'], [3, 'cancelled']])
    // No step is running, so the first broken one is the one the page is about.
    expect(running.at).toBe(2)
    expect(running.now).toEqual({ title: '任务 2 · 写文档', role: '执行' })
    // Attempt 2 is the one still open: the bar says the second pass failed, not the first.
    expect(running.attempt).toEqual({ n: 2, retrying: true })
    // The steps after the current one keep their names, grey and unticked as they are.
    expect(running.rest).toEqual(['任务 3 · 补测试'])

    // The same stream once the run ends: the bar stops claiming a recheck is running.
    const ended = storyOf(streamOf(calls, { stopReason: 'error' }))
    expect(ended.state).toBe('failed')
    expect(ended.at).toBe(2)
    expect(ended.now.role).toBeUndefined()
    expect(ended.attempt).toEqual({ n: 2, retrying: false })

    // A failure a later attempt of the same unit replaced is history, not a bar.
    const recovered = storyOf(streamOf([
      [1, '执行', '任务 2 · 写文档', 'failed'],
      [2, '执行（尝试 2）', '任务 2 · 写文档', 'completed'],
      [3, '检查（尝试 2）', '任务 2 · 写文档', 'completed'],
    ], { stopReason: 'completed' }))
    expect(recovered.state).toBe('done')
    expect(recovered.steps.map((step) => step.state)).toEqual(['done'])
    expect(recovered.attempt).toBeUndefined()
  })

  it('falls back to the work legs when the run planned no tasks', () => {
    // A triage / single-call run declares no `任务 n · …` phase, so the track steps through
    // the calls that do the work: 执行 → 检查 → 复核. The planner and the synthesizer are the
    // run's own two ends — one writes the plan, one writes the answer — so they are not
    // "things to do": they keep their history lines and take no step (§19.2, §19.9).
    const story = storyOf(streamOf([
      [1, '规划助手', '规划', 'completed'],
      [2, '执行', '执行', 'completed'],
      [3, '检查', '检查', 'completed'],
      [4, '复核', '复核', undefined],
    ]))
    expect(story.steps.map((step) => [step.key, step.number, step.title, step.state])).toEqual([
      ['seq:2', undefined, '执行', 'done'],
      ['seq:3', undefined, '检查', 'done'],
      ['seq:4', undefined, '复核', 'doing'],
    ])
    expect(story.steps.every((step) => step.chain.length === 0)).toBe(true)
    expect(story.total).toBe(3)
    expect(story.at).toBe(3)
    expect(story.now).toEqual({ title: '复核', role: '复核' })
    // The planner is still a line of the history: a call that happened, just not a thing
    // to do. Dropping it from the steps must not drop it from the page.
    expect(story.log.map((row) => [row.seq, row.role, row.title, row.state])).toEqual([
      [1, '规划助手', '规划', 'done'],
      [2, '执行', '执行', 'done'],
      [3, '检查', '检查', 'done'],
      [4, '复核', '复核', 'doing'],
    ])
    expect(story.dock).toBe('quiet')
  })

  it('has no step while only the planner has been declared', () => {
    // The real-machine window that changed this contract: a run that has announced itself
    // and declared its planner, nothing else. There is nothing to do yet, so the track is
    // empty and the headline says the run is still turning the ask into steps — it must not
    // invent a step out of the planner call, which is what shipped as 「第 1 步，共 1 步：
    // 要干的 1 件事 · 规划 在做」.
    const story = storyOf(streamOf([[1, '规划助手', '规划', 'completed']]))
    expect(story.state).toBe('running')
    expect(story.steps).toEqual([])
    expect(story.total).toBe(0)
    expect(story.at).toBe(0)
    expect(story.now).toEqual({ titleKey: 'planning', title: '' })
    expect(story.now.role).toBeUndefined()
    expect(story.rest).toEqual([])
    expect(story.attempt).toBeUndefined()
    expect(story.dock).toBe('quiet')
    // The planner is still in the history, which is where a leg that is not a step lives.
    expect(story.log.map((row) => [row.seq, row.role, row.title])).toEqual([[1, '规划助手', '规划']])

    // The same emptiness on a *finished* run keeps the finished headline: 「做好了」 is a
    // fact about the run, while `planning` would claim it is still working.
    const finished = storyOf(streamOf([[1, '汇总助手', '汇总', 'completed']], { stopReason: 'completed' }))
    expect(finished.state).toBe('done')
    expect(finished.steps).toEqual([])
    expect(finished.total).toBe(0)
    expect(finished.now).toEqual({ titleKey: 'done', title: '' })
    expect(finished.dock).toBe('accept')
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
