import { describe, expect, it } from 'vitest'
import {
  DETAIL_FIELDS,
  PROGRESS_DETAIL_EVENT_TYPE,
  PROGRESS_EVENT_TYPES,
  PROGRESS_NODE_KIND,
  PROGRESS_STAGES,
  PROGRESS_VIEW_TARGET,
  deriveTrack,
  detailFor,
  detailSourcesOf,
  foldProgressRuns,
  formatDuration,
  nodeState,
  parseCoordinationBlock,
  percentOf,
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
  answer: '回答',
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
    // plan/execute/verify/synthesize/answer are the headers `src/naming.ts` emits, and the
    // plan tasks land in between (they are appended as extra nodes).
    expect(PROGRESS_STAGES.map((stage) => stage.key)).toEqual(['start', 'plan', 'execute', 'verify', 'synthesize', 'answer', 'end'])
    expect(PROGRESS_STAGES.find((stage) => stage.key === 'plan')?.tokens).toContain('规划')
    expect(PROGRESS_STAGES.find((stage) => stage.key === 'answer')?.tokens).toContain('回答')
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

describe('progress tab: the track', () => {
  it('binds the engine’s own phases to the spine and appends plan tasks as real nodes', () => {
    const members = [
      member(1, '规划', 'completed'),
      member(2, '执行', 'completed'),
      member(3, '任务 1 · 修复登录', 'completed'),
      member(4, '任务 2 · 写文档', 'failed'),
      member(5, '检查', 'completed'),
      member(6, '汇总', 'completed'),
      member(7, '回答', 'completed'),
    ]
    const track = trackOf(members, 'completed')
    expect(stageNode(track, 'plan').state).toBe('done')
    expect(stageNode(track, 'execute').state).toBe('done')
    expect(stageNode(track, 'verify').state).toBe('done')
    expect(stageNode(track, 'synthesize').state).toBe('done')
    expect(stageNode(track, 'answer').state).toBe('done')
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
    // Every declared row lands in exactly one node: the track and the percentage agree.
    const rendered = track.nodes.flatMap((node) => node.members.map((entry) => entry.seq)).sort((a, b) => a - b)
    expect(rendered).toEqual([1, 2, 3, 4, 5, 6, 7])
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
    // `explain` carries `plan`, `reexecuted` carries `execute` and `answerless` carries
    // `answer` — substrings, not words. None of them names a stage, so no stage claims a
    // row on the phase channel and the three rows become extras.
    for (const key of ['plan', 'execute', 'verify', 'synthesize', 'answer']) {
      expect(stageNode(track, key).members, key).toEqual([])
      expect(stageNode(track, key).evidence, key).toEqual([])
      expect(stageNode(track, key).state, key).toBe('pending')
    }
    expect(track.nodes.filter((node) => node.kind === 'extra')).toHaveLength(3)
    // A whole word binds, and so does a Chinese phase header.
    const bound = trackOf([member(1, 'Plan the work', 'completed'), member(2, '准备材料后回答', 'completed')], 'completed')
    expect(stageNode(bound, 'plan').state).toBe('done')
    expect(stageNode(bound, 'answer').state).toBe('done')
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
    for (const key of ['plan', 'execute', 'verify', 'synthesize', 'answer']) {
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
