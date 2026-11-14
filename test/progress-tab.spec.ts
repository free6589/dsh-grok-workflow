import { describe, expect, it } from 'vitest'
import {
  DETAIL_FIELDS,
  PROGRESS_EVENT_TYPES,
  PROGRESS_NODE_KIND,
  PROGRESS_STAGES,
  PROGRESS_VIEW_TARGET,
  PROGRESS_ZOOM_STORAGE_KEY,
  deriveTrack,
  detailFor,
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
  sync: '同步对比',
  triage: '排查',
  fix: '修复',
  ui: 'UI 改',
  device: '真机验证',
  cleanup: '清理',
  push: 'push/tag',
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
  it('folds exactly the four recorder events and namespaces its view target and node kind', () => {
    expect(PROGRESS_EVENT_TYPES).toEqual([
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
      'tool-workflow/run-end',
    ])
    // Both names are registered identities: a duplicate would collide with another
    // plugin, so they carry this plugin's own prefix instead of a generic word.
    expect(PROGRESS_VIEW_TARGET).toBe('grok-progress')
    expect(PROGRESS_NODE_KIND.startsWith('grok-progress')).toBe(true)
    expect(PROGRESS_ZOOM_STORAGE_KEY).toBe('dsh.gw.progress.zoom')
    expect(PROGRESS_STAGES.map((stage) => stage.key)).toEqual(['start', 'sync', 'triage', 'fix', 'ui', 'device', 'cleanup', 'push', 'end'])
  })

  it('folds the recorded stream into one run with its rows and settlement', () => {
    const runs = foldProgressRuns([
      rec('tool-workflow/run-start', { runId: 'run-1', name: '任务团队 · 2 个任务' }, 10, 1_000),
      rec('tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: '执行', phase: '任务 1 · 修复登录', childId: 'c1' }, 11, 1_100),
      rec('tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }, 12, 2_100),
      rec('tool-workflow/run-end', { runId: 'run-1', stopReason: 'completed' }, 13, 2_200),
    ])
    expect(runs).toHaveLength(1)
    const run = runs[0]!
    expect(run.runId).toBe('run-1')
    expect(run.anchorSeq).toBe(10)
    expect(run.stopReason).toBe('completed')
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
    expect(stageNode(track, 'fix').state).toBe('pending')
    expect(track.percent).toBeUndefined()
    // The two ends report the run's own facts: the start happened, the end is still ahead.
    expect(stageNode(track, 'start').state).toBe('done')
    expect(stageNode(track, 'end').state).toBe('doing')
  })

  it('doing: an open run with an unsettled row', () => {
    const track = trackOf([member(1, '任务 1 · 修复登录'), member(2, '任务 2 · 排查', 'completed')], undefined)
    expect(stageNode(track, 'fix').state).toBe('doing')
    expect(stageNode(track, 'triage').state).toBe('done')
    expect(track.ended).toBe(false)
  })

  it('done: every row of the stage settled as completed', () => {
    const track = trackOf([member(1, '任务 1 · 修复登录', 'completed'), member(2, '任务 1 · 修复登录', 'completed')], 'completed')
    expect(stageNode(track, 'fix').state).toBe('done')
    expect(stageNode(track, 'end').state).toBe('done')
    expect(track.percent).toEqual({ settled: 2, declared: 2, value: 100 })
  })

  it('failed wins over every other state, including an unfinished row', () => {
    const members = [member(1, '任务 1 · 修复登录', 'failed'), member(2, '任务 1 · 修复登录', undefined)]
    expect(nodeState(members, false)).toBe('failed')
    expect(trackOf(members, undefined).nodes.find((node) => node.key === 'stage:fix')?.state).toBe('failed')
    // The run's own end agrees: an errored run is not a finished one.
    expect(trackOf(members, 'error').nodes.find((node) => node.key === 'stage:end')?.state).toBe('failed')
  })

  it('blocked: derived from a run that ended over a row it never settled, and says why', () => {
    const track = trackOf([member(1, '任务 1 · 修复登录'), member(2, '任务 1 · 修复登录', 'completed')], 'error')
    const fix = stageNode(track, 'fix')
    expect(fix.state).toBe('blocked')
    expect(fix.derived).toBe(true)
    expect(fix.reason).toBe('runEndedUnsettled')
  })

  it('blocked: an outcome that is neither completed nor cancelled is derived, not renamed', () => {
    const track = trackOf([member(1, '任务 1 · 修复登录', 'interrupted')], 'completed')
    const fix = stageNode(track, 'fix')
    expect(fix.state).toBe('blocked')
    expect(fix.reason).toBe('outcomeUnsettled')
  })

  it('cancelled: keeps the engine’s own word instead of deriving one', () => {
    const track = trackOf([member(1, '任务 1 · 修复登录', 'cancelled')], 'cancelled')
    expect(stageNode(track, 'fix').state).toBe('cancelled')
    expect(stageNode(track, 'end').state).toBe('cancelled')
    // A cancelled row plus a completed one is still a cancelled stage, never "done".
    const mixed = trackOf([member(1, '任务 1 · 修复登录', 'cancelled'), member(2, '任务 1 · 修复登录', 'completed')], 'cancelled')
    expect(stageNode(mixed, 'fix').state).toBe('cancelled')
  })

  it('an unfinished row on a still-open run is doing, never blocked', () => {
    expect(nodeState([member(1, '任务 1 · 修复')], false)).toBe('doing')
    expect(nodeState([member(1, '任务 1 · 修复')], true)).toBe('blocked')
  })
})

describe('progress tab: the track', () => {
  it('binds recorded phases to the spine and appends unmatched phases as real nodes', () => {
    const members = [
      member(1, '任务 1 · 同步对比上游', 'completed'),
      member(2, '任务 2 · 排查卡顿', 'failed'),
      member(3, '任务 3 · 修复登录', 'completed'),
      member(4, '任务 4 · UI 改颜色', 'completed'),
      member(5, '任务 5 · 真机验证', 'completed'),
      member(6, '任务 6 · 清理临时文件', 'completed'),
      member(7, '任务 7 · push/tag', 'completed'),
      member(8, '任务 8 · 写文档', 'completed'),
    ]
    const track = trackOf(members, 'completed')
    expect(stageNode(track, 'sync').state).toBe('done')
    expect(stageNode(track, 'triage').state).toBe('failed')
    expect(stageNode(track, 'fix').state).toBe('done')
    expect(stageNode(track, 'ui').state).toBe('done')
    expect(stageNode(track, 'device').state).toBe('done')
    expect(stageNode(track, 'cleanup').state).toBe('done')
    expect(stageNode(track, 'push').state).toBe('done')
    // The unmatched plan task is a node of its own, placed among the work stages.
    const labels = track.nodes.map((node) => node.key)
    const extra = labels.indexOf('phase:任务 8 · 写文档')
    expect(extra).toBeGreaterThan(labels.indexOf('stage:device'))
    expect(extra).toBeLessThan(labels.indexOf('stage:cleanup'))
    const extraNode = track.nodes[extra]!
    expect(extraNode.kind).toBe('extra')
    expect(extraNode.label).toBe('任务 8 · 写文档')
    expect(extraNode.state).toBe('done')
    // Every declared row lands in exactly one node: the track and the percentage agree.
    const rendered = track.nodes.flatMap((node) => node.members.map((entry) => entry.seq)).sort((a, b) => a - b)
    expect(rendered).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('keeps a phase header stable for two tasks whose titles collide after the index', () => {
    const track = trackOf([
      member(1, '任务 1 · 修复登录', 'completed'),
      member(2, '任务 2 · 修复登录', 'failed'),
    ], 'error')
    // Both rows carry the 修复 token, so the spine aggregates them by phase header and
    // the union of their evidence decides the state.
    expect(stageNode(track, 'fix').phases).toEqual(['任务 1 · 修复登录', '任务 2 · 修复登录'])
    expect(stageNode(track, 'fix').state).toBe('failed')
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

  it('reports rows settled over rows declared, not a task verdict', () => {
    const members = [
      member(1, '任务 1 · 修复', 'completed'),
      member(2, '任务 1 · 修复', 'completed'),
      member(3, '任务 1 · 修复', 'completed'),
      member(4, '任务 1 · 修复'),
    ]
    expect(percentOf(members)).toEqual({ settled: 3, declared: 4, value: 75 })
    expect(percentOf([])).toBeUndefined()
    // Mid-run it reads the same way: three of four rows have settled so far.
    expect(trackOf(members, undefined).percent).toEqual({ settled: 3, declared: 4, value: 75 })
  })
})

describe('progress tab: the detail provenance ladder', () => {
  const block = ['```grok-coordination', JSON.stringify({
    files: ['src/a.ts', 'src/b.ts'],
    commands: ['npx vitest run test/a.spec.ts'],
    result: '2 files changed; tests pass',
  }, null, 2), '```'].join('\n')

  it('prefers a stage-detail payload, then the coordination block, then reports nothing', () => {
    const report = detailFor({
      stageDetail: { files: 'src/a.ts', result: 'from the event' },
      coordinationText: block,
    })
    const byKey = new Map(report.fields.map((field) => [field.key, field]))
    // Level 1 wins for the fields the event carries …
    expect(byKey.get('files')).toEqual({ key: 'files', value: 'src/a.ts', source: 'stage-detail' })
    expect(byKey.get('result')).toEqual({ key: 'result', value: 'from the event', source: 'stage-detail' })
    // … level 2 fills the rest …
    expect(byKey.get('commands')?.source).toBe('coordination')
    expect(byKey.get('commands')?.value).toBe('npx vitest run test/a.spec.ts')
    // … and everything else is explicitly not reported, never an empty string.
    const remaining: Array<'evidence' | 'risks' | 'next' | 'owner'> = ['evidence', 'risks', 'next', 'owner']
    for (const key of remaining) {
      expect(byKey.get(key)).toEqual({ key, source: 'not-reported' })
      expect(byKey.get(key)?.value).toBeUndefined()
    }
    expect(report.coordinationRaw).toContain('"files"')
    expect(report.fields).toHaveLength(DETAIL_FIELDS.length)
  })

  it('degrades to seven not-reported rows when no source exists', () => {
    const report = detailFor()
    expect(report.fields).toHaveLength(7)
    expect(report.fields.every((field) => field.source === 'not-reported')).toBe(true)
    expect(report.coordinationRaw).toBeUndefined()
    // Word for word, a reader must not see a fabricated value.
    expect(report.fields.every((field) => field.value === undefined)).toBe(true)
  })

  it('accepts a nested coordination object and a labelled block, and rejects prose', () => {
    const nested = ['```json', JSON.stringify({ coordination: { owner: 'G', next: 'push' } }), '```'].join('\n')
    expect(parseCoordinationBlock(nested)?.fields).toEqual({ owner: 'G', next: 'push' })

    // A generic JSON fence with two known fields is unmistakable; one field is not.
    const twoFields = ['```json', JSON.stringify({ files: 'a.ts', result: 'ok' }), '```'].join('\n')
    expect(parseCoordinationBlock(twoFields)?.fields).toEqual({ files: 'a.ts', result: 'ok' })
    const oneField = ['```json', JSON.stringify({ result: 'ok' }), '```'].join('\n')
    expect(parseCoordinationBlock(oneField)).toBeUndefined()
    // Prose that merely mentions the fields is not a report.
    expect(parseCoordinationBlock('files: a.ts; result: ok')).toBeUndefined()
    expect(parseCoordinationBlock('```grok-coordination\nnot json\n```')).toBeUndefined()
    expect(parseCoordinationBlock(undefined)).toBeUndefined()
  })

  it('normalizes lists and numbers without inventing a value for an empty one', () => {
    const body = ['```grok-coordination', JSON.stringify({ files: ['a', 'b'], risks: [], evidence: 3 }), '```'].join('\n')
    const fields = parseCoordinationBlock(body)?.fields
    expect(fields?.files).toBe('a · b')
    expect(fields?.evidence).toBe('3')
    // An empty list is "not reported", not a blank cell.
    expect(fields?.risks).toBeUndefined()
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
