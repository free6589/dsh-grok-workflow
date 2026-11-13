import { describe, expect, it } from 'vitest'
import type { ResumeCheckpoint, ResumeEvidence, ResumeTask } from '../src/resume/validator.js'
import {
  RESUME_CHECKPOINT_KIND,
  RESUME_CHECKPOINT_VERSION,
  buildResumeCheckpoint,
  canonicalJson,
  resumeDigest,
  sealResumeCheckpoint,
  validateResumeCheckpoint,
} from '../src/resume/validator.js'
import { evaluateResumeCheckpoint, planRestore, RETAINED_STATUSES } from '../src/resume/index.js'

/**
 * Resume validator and safe restore policy — offline, deterministic.
 *
 * Everything here runs without a model, a network, or the DSH runtime: the
 * validator and policy are pure functions over a sealed checkpoint document.
 * The corpus pins the three fail-closed refusals (version mismatch, corruption,
 * conflict), the retention table (five states retained, `success` never), and
 * artifact preservation.
 */

const EVIDENCE_A: ResumeEvidence = { kind: 'file', ref: 'docs/knowledge/evidence/a.md', note: 'verified a works' }
const EVIDENCE_B: ResumeEvidence = { kind: 'command', ref: 'npm test -- --filter a', note: 'exit 0' }

/** Six tasks, one per status, seq deliberately scrambled to pin plan order. */
const BODY_TASKS: ResumeTask[] = [
  { id: 't-interrupted', seq: 1, status: 'interrupted', outputs: ['out/b.partial'], updatedAt: '2026-11-12T01:05:00.000Z' },
  { id: 't-gated', seq: 2, status: 'gated', updatedAt: '2026-11-12T01:10:00.000Z' },
  { id: 't-completed', seq: 3, status: 'completed', outputs: ['out/a.md'], files: ['src/a.ts'], evidence: [EVIDENCE_A], updatedAt: '2026-11-12T01:15:00.000Z' },
  { id: 't-success', seq: 4, status: 'success', outputs: ['out/e.md'], updatedAt: '2026-11-12T01:20:00.000Z' },
  { id: 't-failed', seq: 5, status: 'failed', files: ['src/c.ts'], evidence: [EVIDENCE_B], attempt: 2, updatedAt: '2026-11-12T01:25:00.000Z' },
  { id: 't-evidence-incomplete', seq: 6, status: 'evidence-incomplete', outputs: ['out/d.txt'], files: ['src/d.ts'], updatedAt: '2026-11-12T01:30:00.000Z' },
]

const BODY = {
  kind: RESUME_CHECKPOINT_KIND,
  version: RESUME_CHECKPOINT_VERSION,
  runId: 'run-resume-sem-1',
  workflowId: 'wf-1',
  updatedAt: '2026-11-12T01:30:00.000Z',
  tasks: BODY_TASKS,
} satisfies Omit<ResumeCheckpoint, 'digest'>

const SEALED: ResumeCheckpoint = sealResumeCheckpoint(BODY)

/** Re-seal a body variant so the digest check passes and the intended check fires. */
function reseal(tasks: unknown[]): ResumeCheckpoint {
  return sealResumeCheckpoint({ ...BODY, tasks: tasks as ResumeTask[] })
}

function taskWith(overrides: Record<string, unknown>): unknown[] {
  const base: Record<string, unknown> = { id: 't-1', seq: 1, status: 'completed' }
  return [{ ...base, ...overrides }]
}

describe('resume checkpoint validator', () => {
  it('accepts a well-formed sealed checkpoint carrying every restore status', () => {
    const result = validateResumeCheckpoint(SEALED)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.checkpoint.kind).toBe(RESUME_CHECKPOINT_KIND)
    expect(result.checkpoint.version).toBe(RESUME_CHECKPOINT_VERSION)
    expect(result.checkpoint.runId).toBe('run-resume-sem-1')
    expect(result.checkpoint.tasks).toHaveLength(6)
    expect(result.checkpoint.tasks.map((t) => t.status)).toEqual([
      'interrupted', 'gated', 'completed', 'success', 'failed', 'evidence-incomplete',
    ])
    // Evidence is normalized, not dropped.
    const completed = result.checkpoint.tasks.find((t) => t.id === 't-completed')
    expect(completed?.evidence).toEqual([EVIDENCE_A])
  })

  it('accepts the same document from raw JSON text', () => {
    const result = validateResumeCheckpoint(JSON.stringify(SEALED))
    expect(result.ok).toBe(true)
  })

  it('refuses a document sealed with a foreign format version (version-mismatch, with both versions in the reason)', () => {
    // Tampered in place: the version check fires before the digest check.
    const tampered = { ...SEALED, version: 2 }
    const r1 = validateResumeCheckpoint(tampered)
    expect(r1.ok).toBe(false)
    if (r1.ok) return
    expect(r1.reason).toBe('version-mismatch')
    expect(r1.detail).toContain('2')
    expect(r1.detail).toContain(String(RESUME_CHECKPOINT_VERSION))

    // Properly re-sealed foreign version: same refusal, so the verdict does not
    // depend on check ordering.
    const resealed = sealResumeCheckpoint({ ...BODY, version: 2 } as unknown as Omit<ResumeCheckpoint, 'digest'>)
    const r2 = validateResumeCheckpoint(resealed)
    expect(r2.ok).toBe(false)
    if (r2.ok) return
    expect(r2.reason).toBe('version-mismatch')
  })

  it('refuses an older version the same way', () => {
    const older = sealResumeCheckpoint({ ...BODY, version: 0 } as unknown as Omit<ResumeCheckpoint, 'digest'>)
    const result = validateResumeCheckpoint(older)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('version-mismatch')
  })

  it('refuses corruption: invalid, truncated, or non-object documents', () => {
    const cases: [unknown, string][] = [
      ['{not json', 'JSON'],
      [JSON.stringify(SEALED).slice(0, Math.floor(JSON.stringify(SEALED).length / 2)), 'JSON'],
      [42, 'not a JSON object'],
      [null, 'not a JSON object'],
      ['[]', 'not a JSON object'],
      [[], 'not a JSON object'],
    ]
    for (const [input, fragment] of cases) {
      const result = validateResumeCheckpoint(input)
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.reason).toBe('corruption')
      expect(result.detail).toContain(fragment)
    }
  })

  it('refuses corruption: wrong envelope kind and missing version or digest', () => {
    const cases = [
      { ...SEALED, kind: 'something-else' },
      sealResumeCheckpoint({ ...BODY, kind: 'something-else' } as unknown as Omit<ResumeCheckpoint, 'digest'>),
      { ...SEALED, version: '1' },
      { ...SEALED, digest: undefined },
      { ...SEALED, digest: '' },
      { ...SEALED, runId: '' },
      { ...SEALED, updatedAt: 'yesterday' },
    ]
    for (const candidate of cases) {
      const result = validateResumeCheckpoint(candidate)
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.reason).toBe('corruption')
      expect(result.detail.length).toBeGreaterThan(0)
    }
  })

  it('refuses corruption when the document no longer matches its integrity digest', () => {
    const tampered = {
      ...SEALED,
      tasks: SEALED.tasks.map((t) => (t.id === 't-gated' ? { ...t, title: 'silently rewritten' } : t)),
    }
    const result = validateResumeCheckpoint(tampered)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('corruption')
    expect(result.detail).toContain('digest mismatch')
  })

  it('refuses corruption with a record path for malformed task records', () => {
    const cases: unknown[][] = [
      taskWith({ id: '' }),
      taskWith({ id: 't-1', seq: 0 }),
      taskWith({ id: 't-1', seq: 1.5 }),
      taskWith({ id: 't-1', seq: 1, updatedAt: 'not-a-date' }),
      taskWith({ id: 't-1', seq: 1, outputs: ['ok', 7] }),
      taskWith({ id: 't-1', seq: 1, files: 'src/a.ts' }),
      taskWith({ id: 't-1', seq: 1, evidence: [{ kind: 'alien', ref: 'x' }] }),
      taskWith({ id: 't-1', seq: 1, evidence: [{ kind: 'file' }] }),
      taskWith({ id: 't-1', seq: 1, attempt: 0 }),
      ['not-an-object'],
    ]
    for (const tasks of cases) {
      const result = validateResumeCheckpoint(reseal(tasks))
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.reason).toBe('corruption')
      expect(result.detail).toMatch(/^tasks\[/)
    }
  })

  it('refuses a conflict when a record claims an unknown status', () => {
    const result = validateResumeCheckpoint(reseal(taskWith({ id: 't-1', seq: 1, status: 'superdone' })))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('conflict')
    expect(result.detail).toContain('superdone')
  })

  it('refuses conflicts: duplicate task id and duplicate seq', () => {
    const dupId = [
      { id: 't-1', seq: 1, status: 'completed' },
      { id: 't-1', seq: 2, status: 'failed' },
    ]
    const r1 = validateResumeCheckpoint(reseal(dupId))
    expect(r1.ok).toBe(false)
    if (!r1.ok) {
      expect(r1.reason).toBe('conflict')
      expect(r1.detail).toContain('duplicate task id')
    }

    const dupSeq = [
      { id: 't-1', seq: 1, status: 'completed' },
      { id: 't-2', seq: 1, status: 'failed' },
    ]
    const r2 = validateResumeCheckpoint(reseal(dupSeq))
    expect(r2.ok).toBe(false)
    if (!r2.ok) {
      expect(r2.reason).toBe('conflict')
      expect(r2.detail).toContain('seq 1')
    }
  })

  it('refuses a conflict when the checkpoint belongs to a different run', () => {
    const result = validateResumeCheckpoint(SEALED, { runId: 'some-other-run' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('conflict')
    expect(result.detail).toContain('run-resume-sem-1')
    expect(result.detail).toContain('some-other-run')
  })

  it('produces a stable digest and survives a JSON round-trip', () => {
    expect(resumeDigest(BODY)).toBe(SEALED.digest)
    const mutated = sealResumeCheckpoint({ ...BODY, runId: 'run-resume-sem-2' })
    expect(mutated.digest).not.toBe(SEALED.digest)
    expect(canonicalJson(BODY)).toBe(canonicalJson(JSON.parse(canonicalJson(BODY))))
    expect(validateResumeCheckpoint(JSON.parse(JSON.stringify(SEALED))).ok).toBe(true)
  })
})

describe('safe restore policy', () => {
  it('retains completed, interrupted, failed, gated and evidence-incomplete — never success', () => {
    expect([...RETAINED_STATUSES].sort()).toEqual([
      'completed', 'evidence-incomplete', 'failed', 'gated', 'interrupted',
    ])
    expect(RETAINED_STATUSES.has('success')).toBe(false)
  })

  it('maps every restore status to its action and retention flag', () => {
    const expected: Record<string, { action: string, retained: boolean }> = {
      completed: { action: 'retain', retained: true },
      gated: { action: 'retain', retained: true },
      interrupted: { action: 'redrive', retained: true },
      failed: { action: 'replan', retained: true },
      'evidence-incomplete': { action: 'reverify', retained: true },
      success: { action: 'replan', retained: false },
    }
    for (const [status, want] of Object.entries(expected)) {
      const doc = reseal(taskWith({ id: 't-1', seq: 1, status }))
      const decision = evaluateResumeCheckpoint(doc)
      expect(decision.restorable, status).toBe(true)
      if (!decision.restorable) continue
      const only = decision.plan.tasks[0]
      expect(only?.action, status).toBe(want.action)
      expect(only?.retained, status).toBe(want.retained)
    }
  })

  it('preserves outputs, files and evidence verbatim for retained tasks, and nothing for success', () => {
    const decision = evaluateResumeCheckpoint(SEALED)
    expect(decision.restorable).toBe(true)
    if (!decision.restorable) return
    const byId = new Map(decision.plan.tasks.map((t) => [t.id, t]))

    const completed = byId.get('t-completed')
    expect(completed?.preserve.outputs).toEqual(['out/a.md'])
    expect(completed?.preserve.files).toEqual(['src/a.ts'])
    expect(completed?.preserve.evidence).toEqual([EVIDENCE_A])

    const interrupted = byId.get('t-interrupted')
    expect(interrupted?.preserve.outputs).toEqual(['out/b.partial'])

    const failed = byId.get('t-failed')
    expect(failed?.preserve.evidence).toEqual([EVIDENCE_B])
    expect(failed?.preserve.files).toEqual(['src/c.ts'])

    const success = byId.get('t-success')
    expect(success?.retained).toBe(false)
    expect(success?.preserve).toEqual({ outputs: [], files: [], evidence: [] })
    expect(success?.reason).toContain('self-report')
  })

  it('orders decisions by seq, counts actions, and flags replan where needed', () => {
    const decision = evaluateResumeCheckpoint(SEALED)
    expect(decision.restorable).toBe(true)
    if (!decision.restorable) return
    const plan = decision.plan
    expect(plan.tasks.map((t) => t.id)).toEqual([
      't-interrupted', 't-gated', 't-completed', 't-success', 't-failed', 't-evidence-incomplete',
    ])
    expect(plan.counts).toEqual({ retain: 2, redrive: 1, reverify: 1, replan: 2 })
    expect(plan.replanRequired).toBe(true)
    expect(plan.replanTaskIds).toEqual(['t-success', 't-failed', 't-evidence-incomplete'])
    expect(plan.runId).toBe('run-resume-sem-1')
  })

  it('requires no replan when everything is completed or gated, including an empty journal', () => {
    const allDone = reseal([
      { id: 't-1', seq: 1, status: 'completed' },
      { id: 't-2', seq: 2, status: 'gated' },
    ])
    const done = evaluateResumeCheckpoint(allDone)
    expect(done.restorable).toBe(true)
    if (done.restorable) {
      expect(done.plan.replanRequired).toBe(false)
      expect(done.plan.replanTaskIds).toEqual([])
    }

    const empty = reseal([])
    const blank = evaluateResumeCheckpoint(empty)
    expect(blank.restorable).toBe(true)
    if (blank.restorable) {
      expect(blank.plan.tasks).toEqual([])
      expect(blank.plan.replanRequired).toBe(false)
      expect(blank.plan.counts).toEqual({ retain: 0, redrive: 0, reverify: 0, replan: 0 })
    }
  })

  it('fails closed: no plan is ever produced for a refused checkpoint', () => {
    const cases: [unknown, string][] = [
      ['{torn', 'corruption'],
      [{ ...SEALED, version: 99 }, 'version-mismatch'],
      [reseal(taskWith({ id: 't-1', seq: 1, status: 'mysterious' })), 'conflict'],
      [validateWrapper(), 'corruption'],
    ]
    for (const [input, reason] of cases) {
      const decision = evaluateResumeCheckpoint(input)
      expect(decision.restorable).toBe(false)
      if (decision.restorable) continue
      expect(decision.reason).toBe(reason)
      expect(decision.detail.length).toBeGreaterThan(0)
      expect('plan' in decision).toBe(false)
    }

    // planRestore itself is typed for validated input only; passing a refusal
    // shape cannot occur through evaluateResumeCheckpoint, and the validator
    // gate above is what policy composition relies on.
    function validateWrapper(): unknown {
      const tampered = { ...SEALED, tasks: SEALED.tasks.map((t) => ({ ...t, id: `${t.id}x` })) }
      return tampered
    }
  })
})

describe('public surface', () => {
  it('builds and validates a checkpoint end to end through the barrel export', () => {
    const doc = buildResumeCheckpoint({
      runId: 'run-barrel',
      updatedAt: '2026-11-12T02:00:00.000Z',
      tasks: [{ id: 'only', seq: 1, status: 'completed', outputs: ['out/x'] }],
    })
    const result = evaluateResumeCheckpoint(doc)
    expect(result.restorable).toBe(true)
    if (result.restorable) {
      expect(result.plan.tasks[0]?.action).toBe('retain')
      expect(result.plan.tasks[0]?.preserve.outputs).toEqual(['out/x'])
    }
    const validated = validateResumeCheckpoint(doc)
    expect(validated.ok).toBe(true)
    if (validated.ok) {
      expect(planRestore(validated).restorable).toBe(true)
    }
  })
})
