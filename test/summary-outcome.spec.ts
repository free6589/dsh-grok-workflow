import { describe, expect, it } from 'vitest'
import type { Session as SessionType } from '@deepseek-ai/dsh-session'
import { resolveConfig } from '../src/config.js'
import { parseMemberLabel } from '../src/naming.js'
import {
  PROGRESS_SUMMARY_FINAL,
  PROGRESS_SUMMARY_REJECTED,
  PROGRESS_SUMMARY_REJECTED_REASON_CHARS,
  createWorkflowProgressRecorder,
} from '../src/records.js'
import { deriveProgressStory, foldProgressRuns } from '../src/progress-tab.js'
import type { ProgressEventRecord } from '../src/progress-tab.js'
import { assertWorkflowReport, shippedSummaryDraft, summaryGateOutcome } from '../src/report.js'
import { buildWorkflowRequest } from '../src/script.js'
import { teamWorkflowEngine } from '../src/team-engine.js'
import type { NormalizedTask, WorkflowReport } from '../src/types.js'
import { createEngineHarness, type ChildAnswer, type ChildCall } from './engine-harness.js'
import { execution, task, verification } from './fixtures.js'
import { settledWithin, taskFromPrompt } from './helpers.js'

/**
 * The summary gate's *outcome*: which draft shipped, or that every draft was rejected
 * and why.
 *
 * Before this, only the passing outcome was published: a rejected run recorded
 * `check=fail verify=pass drafts=N` with no reason (layered) or no marker at all (the
 * plain `model` policy), so the progress page could not say "this run handed in
 * nothing, and here is the last reason". The three layers that carry the fact — the
 * script's marker, `src/report.ts`'s reader, and the progress recorder/fold — are pinned
 * here, the writer against the **real** engine (script VM, twin, scripted model) and the
 * readers as pure functions.
 */

const OBJECTIVE = 'Ship the verified result'
const SETTLE_BUDGET_MS = 15_000

function config(overrides: Record<string, unknown> = {}): ReturnType<typeof resolveConfig> {
  return resolveConfig({ maxConcurrency: 1, maxTasks: 4, childTimeoutMs: 7_200_000, ...overrides })
}

/** The role a child belongs to, read the way the panel reads it (first line of the prompt). */
function roleOfCall(call: { prompt: string }): string {
  const head = call.prompt.split('\n')[0]!.trim()
  return parseMemberLabel(head, 'zh')?.role
    ?? parseMemberLabel(head.split('·')[0]!.trim(), 'zh')?.role
    ?? ''
}

interface RealRun {
  report: WorkflowReport
  children: ChildCall[]
}

/** Run the generated script over the real engine and the plugin's twin. */
async function runReal(
  answer: (call: ChildCall) => ChildAnswer,
  cfg: ReturnType<typeof resolveConfig>,
  options: { tasks?: NormalizedTask[] } = {},
): Promise<RealRun> {
  const harness = createEngineHarness(async call => answer(call))
  try {
    const payload = buildWorkflowRequest(OBJECTIVE, options.tasks, cfg, 'zh')
    const engine = teamWorkflowEngine(harness.ctx as never, { warn() {} })
    const run = engine.start({
      script: payload.script,
      meta: { name: '任务团队', description: 'summary outcome run' },
      args: payload.args,
      parent: { session: { header: {}, id: 'summary-outcome-parent' } } as never,
      maxTotalAgents: payload.maxTotalAgents,
    })
    const result = await settledWithin(run.result, SETTLE_BUDGET_MS, 'the summary outcome twin run')
    await run.dispose()
    return { report: assertWorkflowReport(result.value, OBJECTIVE, cfg), children: harness.children }
  } finally {
    await harness.dispose()
  }
}

/** A draft that cites a path the report never produced, so the guardrail rejects it. */
const CITED_ABSENT = '结果已核验，详见 `out/never-produced.bin`。'

describe('the script records the gate outcome, not only the passing one', () => {
  it('records every rejected draft in the layered policy together with the last reason', async () => {
    const run = await runReal(call => {
      if (roleOfCall(call) === 'synthesizer') return { structured: { summary: CITED_ABSENT } }
      if (roleOfCall(call) === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ synthesis: 'layered', roles: { synthesizer: [{ model: 'writer' }] } }), { tasks: [task('a')] })

    // The deterministic narrative still ships; what is new is that the record says the
    // model drafts never did, and why the last one did not.
    expect(run.report.synthesis.summary ?? '').toContain('任务 a')
    const review = run.report.synthesis.review ?? ''
    expect(review.startsWith('check=fail verify=pass drafts=3 reason=')).toBe(true)
    expect(review).not.toContain('\n')
    expect(review.length).toBeLessThanOrEqual('check=fail verify=pass drafts=3 reason='.length + 300)
    // The reason is the gate's own, flattened: it names the citation that was not in the report.
    expect(review).toContain('never-produced.bin')
    expect(summaryGateOutcome(review)).toEqual({
      kind: 'rejected',
      drafts: 3,
      stage: 'check',
      reason: expect.stringContaining('never-produced.bin'),
    })
    // The passing form is untouched, so the shipped path cannot change with it.
    expect(shippedSummaryDraft(review)).toBeUndefined()
    expect(run.report.synthesis.error ?? '').toContain('polish rejected by the summary gate')
  })

  it('records the same outcome in the plain model policy, which used to record nothing', async () => {
    const run = await runReal(call => {
      if (roleOfCall(call) === 'synthesizer') return { structured: { summary: CITED_ABSENT } }
      if (roleOfCall(call) === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ synthesis: 'model', roles: { synthesizer: [{ model: 'writer' }] } }), { tasks: [task('a')] })

    // Nothing is shipped — this policy has no deterministic narrative — and the marker
    // now carries the verdict and the reason instead of leaving only the error prose.
    expect(run.report.synthesis.summary).toBeUndefined()
    const review = run.report.synthesis.review ?? ''
    expect(review.startsWith('check=fail verify=pass drafts=3 reason=')).toBe(true)
    expect(summaryGateOutcome(review)).toMatchObject({ kind: 'rejected', drafts: 3, stage: 'check' })
    expect(run.report.synthesis.error ?? '').toContain('no narrative is shipped')
  })

  it('keeps the shipped marker byte-identical in the plain model policy', async () => {
    const summary = 'One task was verified with file evidence; nothing is outstanding.'
    const run = await runReal(call => {
      if (roleOfCall(call) === 'synthesizer') return { structured: { summary } }
      if (roleOfCall(call) === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ synthesis: 'model', roles: { synthesizer: [{ model: 'writer' }] } }), { tasks: [task('a')] })

    expect(run.report.synthesis.review).toBe('check=pass verify=pass drafts=1')
  })

  it('writes no marker at all when no draft was ever produced', async () => {
    // "No draft was ever produced" is a different fact from "all drafts were rejected":
    // there was nothing to judge, so there is no verdict to record.
    const run = await runReal(call => {
      if (roleOfCall(call) === 'synthesizer') return { structured: {} }
      if (roleOfCall(call) === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ synthesis: 'layered', roles: { synthesizer: [{ model: 'writer' }] } }), { tasks: [task('a')] })

    expect(run.report.synthesis.review).toBeUndefined()
    expect(run.report.synthesis.summary ?? '').toContain('任务 a')
  })
})

describe('summaryGateOutcome: the two outcomes one marker string can state', () => {
  it('reads the shipped form unchanged', () => {
    expect(summaryGateOutcome('check=pass verify=pass drafts=1')).toEqual({ kind: 'shipped', draft: 1 })
    expect(summaryGateOutcome('check=pass verify=pass drafts=12')).toEqual({ kind: 'shipped', draft: 12 })
    // A count of zero is not a draft, exactly as `shippedSummaryDraft` already rules.
    expect(summaryGateOutcome('check=pass verify=pass drafts=0')).toBeUndefined()
  })

  it('reads both rejected forms with their stage and reason', () => {
    expect(summaryGateOutcome('check=fail verify=pass drafts=3 reason=cites "x", which the report lacks'))
      .toEqual({ kind: 'rejected', drafts: 3, stage: 'check', reason: 'cites "x", which the report lacks' })
    expect(summaryGateOutcome('check=pass verify=fail drafts=2 reason=the answer omits incomplete task b'))
      .toEqual({ kind: 'rejected', drafts: 2, stage: 'verify', reason: 'the answer omits incomplete task b' })
  })

  it('is not confused by a reason that quotes the marker vocabulary', () => {
    // The reason is the rest of the line, so a `drafts=` inside it stays inside it.
    const review = 'check=fail verify=pass drafts=3 reason=the draft repeated drafts=9 reason=nonsense'
    expect(summaryGateOutcome(review)).toEqual({
      kind: 'rejected',
      drafts: 3,
      stage: 'check',
      reason: 'the draft repeated drafts=9 reason=nonsense',
    })
  })

  it('refuses a marker that states no usable outcome', () => {
    // No reason: a rejection the reader cannot explain is not an outcome to publish.
    expect(summaryGateOutcome('check=fail verify=pass drafts=3')).toBeUndefined()
    expect(summaryGateOutcome('check=fail verify=pass drafts=3 reason=   ')).toBeUndefined()
    // No draft count, or a count below one.
    expect(summaryGateOutcome('check=fail verify=pass reason=something')).toBeUndefined()
    expect(summaryGateOutcome('check=fail verify=pass drafts=0 reason=something')).toBeUndefined()
    // Both stage words alike: the gate stops at the first failure, and both-pass is the
    // shipped form read above.
    expect(summaryGateOutcome('check=fail verify=fail drafts=2 reason=twice')).toBeUndefined()
    // Markers this reader has no business guessing about.
    expect(summaryGateOutcome('drafts=3 reason=something')).toBeUndefined()
    expect(summaryGateOutcome('check=maybe verify=pass drafts=3 reason=something')).toBeUndefined()
    expect(summaryGateOutcome(undefined)).toBeUndefined()
    expect(summaryGateOutcome(42)).toBeUndefined()
  })

})

describe('the recorder publishes a rejected outcome as its own fact', () => {
  class FakeSession {
    readonly writes: { type: string, data: Record<string, unknown> }[] = []
    failAfter: number | undefined
    append(type: string, data: Record<string, unknown>): void {
      if (this.failAfter !== undefined && this.writes.length >= this.failAfter) throw new Error('session is closed')
      this.writes.push({ type, data })
    }
  }

  const loggerWith = (warnings: string[]): { warn: (message: string) => void } => ({
    warn: (message: string) => { warnings.push(message) },
  })

  it('writes the run, the count, the stage and the reason — and nothing else', () => {
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    recorder.runStart({ id: 'run-1', meta: { name: '任务团队' } })
    recorder.summaryRejected('run-1', { drafts: 3, stage: 'check', reason: 'cites "x"' })
    recorder.runEnd('run-1', 'completed')
    expect(target.writes).toEqual([
      { type: 'tool-workflow/run-start', data: { runId: 'run-1', name: '任务团队' } },
      { type: PROGRESS_SUMMARY_REJECTED, data: { runId: 'run-1', drafts: 3, stage: 'check', reason: 'cites "x"' } },
      { type: 'tool-workflow/run-end', data: { runId: 'run-1', stopReason: 'completed' } },
    ])
    expect(PROGRESS_SUMMARY_REJECTED).toBe('tool-workflow/summary-rejected')
    // Two different facts, two different names: a rejected run has no final draft.
    expect(PROGRESS_SUMMARY_REJECTED).not.toBe(PROGRESS_SUMMARY_FINAL)
  })

  it('drops every payload that is not a rejection it can explain', () => {
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    recorder.runStart({ id: 'run-1', meta: { name: '任务团队' } })
    // Not our run, no draft judged, a stage outside the gate's two words, and no reason.
    recorder.summaryRejected('not-ours', { drafts: 3, stage: 'check', reason: 'x' })
    recorder.summaryRejected('run-1', { drafts: 0, stage: 'check', reason: 'x' })
    recorder.summaryRejected('run-1', { drafts: Number.NaN, stage: 'check', reason: 'x' })
    recorder.summaryRejected('run-1', { drafts: 2, stage: 'review' as never, reason: 'x' })
    recorder.summaryRejected('run-1', { drafts: 2, stage: 'check', reason: '   ' })
    recorder.summaryRejected('run-1', { drafts: 2, stage: 'check', reason: 7 as never })
    recorder.runEnd('run-1', 'completed')
    expect(target.writes.map(write => write.type)).toEqual(['tool-workflow/run-start', 'tool-workflow/run-end'])
  })

  it('bounds the reason it writes', () => {
    const target = new FakeSession()
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith([]))
    recorder.runStart({ id: 'run-1', meta: { name: '任务团队' } })
    recorder.summaryRejected('run-1', { drafts: 2, stage: 'verify', reason: 'x'.repeat(500) })
    const write = target.writes.find(candidate => candidate.type === PROGRESS_SUMMARY_REJECTED)
    expect(write).toBeDefined()
    expect((write!.data['reason'] as string).length).toBe(PROGRESS_SUMMARY_REJECTED_REASON_CHARS)
  })

  it('drops the run when the session refuses the append, like the sibling recorders', () => {
    const target = new FakeSession()
    target.failAfter = 1
    const warnings: string[] = []
    const recorder = createWorkflowProgressRecorder(target as unknown as SessionType, loggerWith(warnings))
    recorder.runStart({ id: 'run-1', meta: { name: '任务团队' } })
    recorder.summaryRejected('run-1', { drafts: 2, stage: 'check', reason: 'x' })
    // The second fact is not attempted: the run is no longer this recorder's to speak for.
    recorder.summaryRejected('run-1', { drafts: 2, stage: 'check', reason: 'again' })
    expect(target.writes).toHaveLength(1)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

/** One recorded event, shaped the way the session hands it to the fold. */
function rec(type: string, data: Record<string, unknown>, seq: number, time?: number): ProgressEventRecord {
  return { type, data, seq, ...time === undefined ? {} : { time } }
}

describe('the fold and the story read the rejected outcome', () => {
  const rejectedStream = (payload: Record<string, unknown>, seq = 6): ProgressEventRecord[] => [
    rec('tool-workflow/run-start', { runId: 'r', name: '任务团队' }, 1, 1_000),
    rec('tool-workflow/agent-start', { runId: 'r', seq: 1, label: '汇总·第1稿', phase: '汇总', childId: 'c1' }, 2),
    rec('tool-workflow/agent-end', { runId: 'r', seq: 1, outcome: 'completed' }, 3),
    rec('tool-workflow/summary-rejected', { runId: 'r', ...payload }, seq),
    rec('tool-workflow/run-end', { runId: 'r', stopReason: 'completed' }, seq + 1),
  ]

  it('carries the verdict onto the run and into the story', () => {
    const [run] = foldProgressRuns(rejectedStream({ drafts: 3, stage: 'check', reason: 'cites "x"' }))
    expect(run!.summaryRejected).toEqual({ drafts: 3, stage: 'check', reason: 'cites "x"' })
    // A rejected run names no shipped draft: the mark never lands, and the card has
    // something else to say.
    expect(run!.summaryFinalDraft).toBeUndefined()
    expect(run!.members.map((row) => row.label)).toEqual(['汇总·第1稿'])
    const story = deriveProgressStory(run!)
    expect(story.final).toEqual({ kind: 'rejected', drafts: 3, stage: 'check', reason: 'cites "x"' })
  })

  it('takes the first valid claim and refuses half-facts', () => {
    const [first] = foldProgressRuns(rejectedStream({ drafts: 2, stage: 'verify', reason: 'the answer omits b' }, 4))
    expect(first!.summaryRejected).toEqual({ drafts: 2, stage: 'verify', reason: 'the answer omits b' })

    for (const payload of [
      { drafts: 0, stage: 'check', reason: 'x' },
      { drafts: 2, stage: 'review', reason: 'x' },
      { drafts: 2, stage: 'check', reason: '  ' },
      { drafts: 2, stage: 'check' },
    ]) {
      const [run] = foldProgressRuns(rejectedStream(payload))
      expect(run!.summaryRejected, JSON.stringify(payload)).toBeUndefined()
      expect(deriveProgressStory(run!).final).toBeUndefined()
    }
  })

  it('prefers a shipped draft when a stream somehow carries both facts', () => {
    // The recorder never writes both. A hand-written stream could, and the card must
    // not deny a draft the run really shipped.
    const [run] = foldProgressRuns([
      ...rejectedStream({ drafts: 3, stage: 'check', reason: 'cites "x"' }, 6),
      rec('tool-workflow/summary-final', { runId: 'r', draft: 1 }, 8),
    ])
    const story = deriveProgressStory(run!)
    expect(story.final).toMatchObject({ kind: 'shipped', draft: 1 })
  })

  it('leaves a run with neither fact saying nothing at all', () => {
    const [run] = foldProgressRuns([
      rec('tool-workflow/run-start', { runId: 'r', name: '任务团队' }, 1, 1_000),
      rec('tool-workflow/agent-start', { runId: 'r', seq: 1, label: '汇总·第1稿', phase: '汇总', childId: 'c1' }, 2),
    ])
    expect(run!.summaryRejected).toBeUndefined()
    expect(deriveProgressStory(run!).final).toBeUndefined()
  })
})
