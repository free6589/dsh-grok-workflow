import { describe, expect, it } from 'vitest'
import type { TruncationSignal } from '../src/resume/truncation.js'
import {
  detectTruncation,
  isTruncationKind,
  TRUNCATION_KINDS,
  TRUNCATION_LIMITS,
} from '../src/resume/truncation.js'
import type { RestorePlan } from '../src/resume/policy.js'
import {
  buildResumeCheckpoint,
  evaluateResumeCheckpoint,
} from '../src/resume/index.js'
import type { ResumeTask } from '../src/resume/validator.js'
import {
  planContinuation,
  summarizeContinuation,
} from '../src/resume/continuation.js'
import {
  bridgeReasonFor,
  resumeCheckpointFromRun,
  resumeStatusFor,
} from '../src/resume/bridge.js'
import {
  buildCheckpoint,
} from '../src/checkpoint/schema.js'
import { validateResumeCheckpoint } from '../src/resume/validator.js'

/**
 * Truncation detection and continuation planning — offline, deterministic.
 *
 * Everything here runs without a model, a network, or the DSH runtime: the
 * detector folds one child's terminal facts, the continuation planner joins a
 * restore plan with per-task verdicts, and the bridge maps a run checkpoint
 * into the sealed restore document. The corpus pins the three truncation
 * classes (turn-error, reasoning-index-anomaly, stop-false-normal), the
 * re-drive rule (a cut task is re-driven, never replanned; completed is never
 * re-run except as a false normal; gated is immune), and the full path
 * bridge → validate → plan → continuation.
 */

const NOW = Date.parse('2026-11-28T00:00:00.000Z')

function turnEnd(kind: string, message?: string): Record<string, unknown> {
  return {
    type: 'turn/end',
    data: {
      reason: {
        kind,
        ...(message === undefined ? {} : { error: { message, code: 'UNKNOWN' } }),
      },
    },
  }
}

function attemptWithStream(stream: unknown[]): Record<string, unknown> {
  return { type: 'assistant/attempt', data: { stream } }
}

function reasoningChunk(index: number): Record<string, unknown> {
  return { chunk: { type: 'reasoning-delta', index } }
}

function finishChunk(kind: string): Record<string, unknown> {
  return { chunk: { type: 'finish', reason: { kind } } }
}

/** A sealed restore document with one task per journaled status. */
function sealedDocument(tasks: readonly Record<string, unknown>[]): unknown {
  return buildResumeCheckpoint({
    runId: 'run-cont-1',
    updatedAt: '2026-11-28T00:00:00.000Z',
    tasks: tasks as unknown as ResumeTask[],
  })
}

function restoredPlan(): RestorePlan {
  const document = sealedDocument([
    { id: 'task-a', seq: 1, status: 'interrupted', outputs: ['out/a.partial'] },
    { id: 'task-done', seq: 2, status: 'completed', outputs: ['out/done.md'] },
  ])
  const decision = evaluateResumeCheckpoint(document)
  if (!decision.restorable) throw new Error('fixture refused')
  return decision.plan
}

describe('detectTruncation: the three truncation classes', () => {
  it('names a turn that closed with an error after producing work, and keeps the provider words', () => {
    const signal: TruncationSignal = {
      stopReason: 'error',
      output: 'partial work that was cut',
      events: [turnEnd('error', 'reasoning-delta index must be a non-negative safe integer')],
    }
    const verdict = detectTruncation(signal)
    expect(verdict.truncated).toBe(true)
    expect(verdict.kind).toBe('turn-error')
    expect(verdict.detail).toContain('re-driven')
    expect(verdict.evidence).toHaveLength(1)
    expect(verdict.evidence[0]?.ref).toBe('turn/end')
    expect(verdict.evidence[0]?.note).toContain('reasoning-delta index must be a non-negative safe integer')
  })

  it('does not call an error a truncation when the child produced nothing at all', () => {
    const verdict = detectTruncation({ stopReason: 'error', output: '   ', events: [turnEnd('error')] })
    expect(verdict.truncated).toBe(false)
    expect(verdict.kind).toBeUndefined()
    expect(verdict.evidence).toEqual([])
  })

  it('reads a finish chunk inside the last attempt when the turn closer never arrived', () => {
    const verdict = detectTruncation({
      stopReason: 'error',
      output: 'half an answer',
      events: [attemptWithStream([reasoningChunk(0), reasoningChunk(1), finishChunk('error')])],
    })
    expect(verdict.truncated).toBe(true)
    expect(verdict.kind).toBe('turn-error')
    expect(verdict.evidence[0]?.ref).toBe('assistant/attempt:finish')
  })

  it('names a reasoning stream whose indexes repeat or reverse', () => {
    const verdict = detectTruncation({
      stopReason: 'completed',
      output: 'an answer that looks done',
      events: [attemptWithStream([reasoningChunk(0), reasoningChunk(1), reasoningChunk(1), reasoningChunk(2)])],
    })
    expect(verdict.truncated).toBe(true)
    expect(verdict.kind).toBe('reasoning-index-anomaly')
    expect(verdict.evidence[0]?.ref).toContain('.stream')
    expect(verdict.detail).toContain('1 → 1')
  })

  it('accepts a strictly increasing reasoning stream and a clean payload', () => {
    const verdict = detectTruncation({
      stopReason: 'completed',
      output: 'a complete answer with no cut',
      events: [attemptWithStream([reasoningChunk(0), reasoningChunk(1), reasoningChunk(2)])],
    })
    expect(verdict.truncated).toBe(false)
  })

  it('lets the engine word about the turn outrank a broken stream inside it', () => {
    const verdict = detectTruncation({
      stopReason: 'error',
      output: 'partial',
      events: [
        attemptWithStream([reasoningChunk(0), reasoningChunk(0)]),
        turnEnd('error', 'provider died'),
      ],
    })
    // turn-error fires first: one cause per verdict, in priority order.
    expect(verdict.kind).toBe('turn-error')
  })

  it('names a completed stop word over a missing structured result as a false normal', () => {
    const verdict = detectTruncation({
      stopReason: 'completed',
      output: 'text without the required form',
      requireStructured: true,
      events: [turnEnd('completed')],
    })
    expect(verdict.truncated).toBe(true)
    expect(verdict.kind).toBe('stop-false-normal')
    expect(verdict.evidence[0]?.ref).toBe('structured')
  })

  it('names a completed stop word over an unclosed code fence or JSON container', () => {
    const fence = detectTruncation({
      stopReason: 'completed',
      output: 'here is the patch:\n```ts\nconst a = 1\n',
      events: [turnEnd('completed')],
    })
    expect(fence.truncated).toBe(true)
    expect(fence.kind).toBe('stop-false-normal')

    const json = detectTruncation({
      stopReason: 'completed',
      output: '{"tasks": [{"id": "a"',
      events: [turnEnd('completed')],
    })
    expect(json.truncated).toBe(true)
    expect(json.kind).toBe('stop-false-normal')
  })

  it('names a producer truncation marker at the tail', () => {
    const verdict = detectTruncation({
      stopReason: 'completed',
      output: 'a long answer that ends here [truncated…',
      events: [turnEnd('completed')],
    })
    expect(verdict.kind).toBe('stop-false-normal')
  })

  it('leaves a clean completed answer alone, including prose that merely contains braces', () => {
    const verdict = detectTruncation({
      stopReason: 'completed',
      output: 'use {a, b} syntax and close every {brace} you open',
      events: [turnEnd('completed')],
    })
    expect(verdict.truncated).toBe(false)
  })

  it('does not read a deliberate stop word as a truncation', () => {
    for (const stop of ['aborted', 'max-tokens', 'refusal']) {
      const verdict = detectTruncation({ stopReason: stop, output: 'some text', events: [] })
      expect(verdict.truncated).toBe(false)
    }
  })

  it('never throws on junk events and is pure: the same signal answers the same verdict', () => {
    const signal: TruncationSignal = {
      stopReason: 'completed',
      output: 'done',
      events: [null, 42, 'turn/end', { type: 'assistant/attempt', data: { stream: 'not-an-array' } }],
    }
    const first = detectTruncation(signal)
    const second = detectTruncation({ ...signal, events: [...signal.events ?? []] })
    expect(first).toEqual(second)
    expect(first.truncated).toBe(false)
  })

  it('bounds the payload scan so a very long answer stays cheap and deterministic', () => {
    const head = 'x'.repeat(TRUNCATION_LIMITS.scanChars + 500)
    const open = detectTruncation({ stopReason: 'completed', output: `${head}\n\`\`\`\ncut`, events: [] })
    expect(open.truncated).toBe(true)
    // The fence opened before the window, so only the tail decides: balanced here.
    const balanced = detectTruncation({ stopReason: 'completed', output: `${head}\nplain tail`, events: [] })
    expect(balanced.truncated).toBe(false)
  })

  it('exports the kind vocabulary the continuation planner reads', () => {
    expect([...TRUNCATION_KINDS]).toEqual(['turn-error', 'reasoning-index-anomaly', 'stop-false-normal'])
    expect(isTruncationKind('turn-error')).toBe(true)
    expect(isTruncationKind('error')).toBe(false)
  })
})

describe('continuation planning: keep what finished, re-drive what was cut', () => {
  it('re-drives a cut task instead of handing it to the planner, keeping its partial artifacts', () => {
    const plan = restoredPlan()
    const cut = detectTruncation({
      stopReason: 'error',
      output: 'partial',
      events: [turnEnd('error', 'provider died')],
    })
    const continued = planContinuation(plan, { 'task-a': cut })
    expect(continued.runId).toBe('run-cont-1')
    const task = continued.tasks.find((entry) => entry.id === 'task-a')!
    expect(task.statusBefore).toBe('interrupted')
    expect(task.status).toBe('interrupted')
    expect(task.action).toBe('redrive')
    expect(task.rerun).toBe(true)
    expect(task.preserve.outputs).toEqual(['out/a.partial'])
    expect(task.truncation?.kind).toBe('turn-error')
    expect(continued.reDrive).toEqual(['task-a'])
    const summary = summarizeContinuation(continued)
    expect(summary.truncated).toBe(1)
    expect(summary.falseNormal).toBe(0)
  })

  it('never re-runs a completed task and says so explicitly', () => {
    const plan = restoredPlan()
    const continued = planContinuation(plan)
    const done = continued.tasks.find((entry) => entry.id === 'task-done')!
    expect(done.action).toBe('retain')
    expect(done.rerun).toBe(false)
    expect(continued.alreadyDone).toEqual(['task-done'])
  })

  it('re-drives a completed mark that the stream proves was a false normal', () => {
    const plan = restoredPlan()
    const cut = detectTruncation({
      stopReason: 'completed',
      output: '{"tasks": [{"id": "a"',
      events: [turnEnd('completed')],
    })
    const continued = planContinuation(plan, { 'task-done': cut })
    const task = continued.tasks.find((entry) => entry.id === 'task-done')!
    expect(task.statusBefore).toBe('completed')
    expect(task.status).toBe('interrupted')
    expect(task.action).toBe('redrive')
    expect(continued.alreadyDone).toEqual([])
    expect(summarizeContinuation(continued).falseNormal).toBe(1)
  })

  it('never lets a truncation overrule a gate decision', () => {
    const document = sealedDocument([{ id: 'task-g', seq: 1, status: 'gated' }])
    const decision = evaluateResumeCheckpoint(document)
    if (!decision.restorable) throw new Error('fixture refused')
    const cut = detectTruncation({ stopReason: 'error', output: 'partial', events: [turnEnd('error')] })
    const continued = planContinuation(decision.plan, { 'task-g': cut })
    const task = continued.tasks[0]!
    expect(task.status).toBe('gated')
    expect(task.action).toBe('retain')
    expect(task.rerun).toBe(false)
  })

  it('plans exactly as the restore policy did when no truncation was recorded', () => {
    const plan = restoredPlan()
    const continued = planContinuation(plan)
    expect(continued.counts).toEqual(plan.counts)
    expect(continued.replan).toEqual(plan.replanTaskIds)
  })
})

describe('bridge: a cut run checkpoint becomes a re-drivable restore document', () => {
  function runCheckpoint(): ReturnType<typeof buildCheckpoint> {
    return buildCheckpoint({
      run: { runId: 'run-cut-1', objective: 'resume the cut run', status: 'failed' },
      plan: {
        source: 'caller',
        tasks: [
          { id: 'task-a', title: 'cut work' },
          { id: 'task-b', title: 'kept work' },
        ],
      },
      tasks: [
        { id: 'task-a', title: 'cut work', status: 'failed', attempts: 1 },
        { id: 'task-b', title: 'kept work', status: 'verified', attempts: 1 },
      ],
      evidence: [
        { taskId: 'task-a', criterion: 'c1', claim: 'partial result', locator: 'npm test -- --filter a' },
      ],
    }, NOW)
  }

  it('writes a cut task as interrupted and leaves a verified task completed', () => {
    const checkpoint = runCheckpoint()
    const cut = detectTruncation({ stopReason: 'error', output: 'partial', events: [turnEnd('error')] })
    const document = resumeCheckpointFromRun(checkpoint, { now: NOW, truncations: { 'task-a': cut } })
    const byId = new Map(document.tasks.map((task) => [task.id, task]))
    expect(byId.get('task-a')?.status).toBe('interrupted')
    expect(byId.get('task-b')?.status).toBe('completed')
    // The checkpoint's own evidence row survives the crossing, typed by shape.
    expect(byId.get('task-a')?.evidence).toEqual([{ kind: 'command', ref: 'npm test -- --filter a', note: 'partial result' }])
    const validated = validateResumeCheckpoint(document)
    expect(validated.ok).toBe(true)
  })

  it('re-runs only verification for a verified task whose child was cut', () => {
    const checkpoint = runCheckpoint()
    const cut = detectTruncation({ stopReason: 'completed', output: '{"tasks": [', events: [turnEnd('completed')] })
    const document = resumeCheckpointFromRun(checkpoint, { now: NOW, truncations: { 'task-b': cut } })
    const decision = evaluateResumeCheckpoint(document)
    if (!decision.restorable) throw new Error('fixture refused')
    const plan = planContinuation(decision.plan, { 'task-b': cut })
    const task = plan.tasks.find((entry) => entry.id === 'task-b')!
    expect(task.status).toBe('evidence-incomplete')
    expect(task.action).toBe('reverify')
    expect(task.preserve.evidence).toEqual([{ kind: 'command', ref: 'npm test -- --filter a', note: 'partial result' }].slice(0, 0))
    expect(plan.reverify).toEqual(['task-b'])
  })

  it('re-drives the cut task through the full path: bridge → validate → plan → continuation', () => {
    const checkpoint = runCheckpoint()
    const cut = detectTruncation({ stopReason: 'error', output: 'partial work', events: [turnEnd('error', 'died')] })
    const document = resumeCheckpointFromRun(checkpoint, { now: NOW, truncations: { 'task-a': cut } })
    const decision = evaluateResumeCheckpoint(document)
    expect(decision.restorable).toBe(true)
    if (!decision.restorable) return
    const plan = planContinuation(decision.plan, { 'task-a': cut })
    expect(plan.tasks.filter((entry) => entry.rerun).map((entry) => entry.id)).toEqual(['task-a'])
    expect(plan.replan).toEqual([])
    expect(plan.tasks.filter((entry) => entry.rerun).map((entry) => entry.id)).toEqual(['task-a'])
  })

  it('keeps the digest gate: a tampered document is refused, never planned', () => {
    const checkpoint = runCheckpoint()
    const document = resumeCheckpointFromRun(checkpoint, { now: NOW })
    const tampered = { ...(document as unknown as Record<string, unknown>) }
    const tasks = [...(document as unknown as { tasks: Array<Record<string, unknown>> }).tasks]
    // task-a bridges as interrupted; flip it to completed so the bytes no
    // longer match the sealed digest.
    tasks[0] = { ...tasks[0], status: 'completed' }
    tampered['tasks'] = tasks
    const result = validateResumeCheckpoint(tampered)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('corruption')
  })

  it('refuses a document that belongs to another run', () => {
    const document = resumeCheckpointFromRun(runCheckpoint(), { now: NOW })
    const decision = evaluateResumeCheckpoint(document, { runId: 'run-other' })
    expect(decision.restorable).toBe(false)
    if (!decision.restorable) expect(decision.reason).toBe('conflict')
  })

  it('maps run statuses to restore statuses by one table, and keeps a plain failure failing', () => {
    expect(resumeStatusFor('verified', false)).toBe('completed')
    expect(resumeStatusFor('verified', true)).toBe('evidence-incomplete')
    expect(resumeStatusFor('failed', true)).toBe('interrupted')
    expect(resumeStatusFor('failed', false)).toBe('failed')
    expect(resumeStatusFor('cancelled', false)).toBe('interrupted')
    expect(resumeStatusFor('pending', false)).toBe('interrupted')
    expect(bridgeReasonFor('verified', false)).toBe('verified-work')
    expect(bridgeReasonFor('verified', true)).toBe('cut-and-verified')
    expect(bridgeReasonFor('failed', true)).toBe('cut-work')
    expect(bridgeReasonFor('failed', false)).toBe('unfinished-work')
  })
})
