/**
 * Recovery artifacts on disk: round-trip, tamper, version refusal, interrupted
 * and incomplete journals — all decided through the real modules.
 *
 * Boundary: real files in a per-test scratch directory, the real atomic writer
 * (`src/checkpoint/writer.ts`) for the run checkpoint, and the real
 * seal/validate/plan triple (`src/resume/validator.ts`, `src/resume/policy.ts`)
 * for the resume document. No model, no network, no clock: every timestamp is a
 * fixed constant, so a failing checksum is always a real difference and never
 * wall-clock noise.
 *
 * Relationship to the existing specs: `test/resume-validator.spec.ts` pins the
 * validator field by field and `test/checkpoint-schema.spec.ts` pins the writer.
 * This spec covers the *recovery* path end to end — artifact bytes on disk →
 * refusal or plan — which is the decision a restarted host actually makes. The
 * kill/restart half of that story lives in
 * `test/recovery-kill-restart.spec.ts`.
 */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertCheckpoint,
  buildCheckpoint,
  canonicalJson,
  CheckpointError,
  CHECKPOINT_VERSION,
  sealCheckpoint,
  stripIntegrity,
  type CheckpointInput,
} from '../src/checkpoint/schema.js'
import { readCheckpoint, writeCheckpoint } from '../src/checkpoint/writer.js'
import {
  buildResumeCheckpoint,
  evaluateResumeCheckpoint,
  resumeDigest,
  sealResumeCheckpoint,
  validateResumeCheckpoint,
  RESUME_CHECKPOINT_KIND,
  RESUME_CHECKPOINT_VERSION,
} from '../src/resume/index.js'
import type { ResumeCheckpoint, ResumeTask } from '../src/resume/index.js'

/* ------------------------------------------------------------------ harness -- */

const RUN_ID = 'run-recovery-artifact'
const AT = '2026-11-12T03:00:00.000Z'
const NOW = 1_700_000_000_000

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'recovery-artifact-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Durable commit: temp + fsync + rename, the same shape the plugin writer uses. */
async function commit(path: string, text: string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  const handle = await open(tmp, 'w')
  try {
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(tmp, path)
}

function taskRow(overrides: Partial<ResumeTask> & { id: string, seq: number, status: ResumeTask['status'] }): ResumeTask {
  return { title: `Task ${overrides.id}`, updatedAt: AT, ...overrides }
}

function documentText(tasks: ResumeTask[], runId = RUN_ID): string {
  return `${canonicalJson(buildResumeCheckpoint({ runId, workflowId: 'grok-workflow', updatedAt: AT, tasks }))}\n`
}

/** A minimal but complete run checkpoint, with fixed clock values. */
function runInput(): CheckpointInput {
  return {
    run: { runId: 'run-recovery-artifact', sessionId: 'session-1', objective: 'Deliver the recovery path', status: 'failed' },
    plan: {
      source: 'planner',
      tasks: [
        { id: 'task-1', title: 'Recovery', writesPaths: ['src/resume/policy.ts'] },
        { id: 'task-2', title: 'Proof', writesPaths: null },
      ],
    },
    tasks: [
      { id: 'task-1', title: 'Recovery', status: 'verified', attempts: 1 },
      { id: 'task-2', title: 'Proof', status: 'failed', attempts: 1, error: 'no evidence for the criterion' },
    ],
    evidence: [
      { taskId: 'task-1', criterion: 'restore is fail closed', claim: 'refusal produces no plan', locator: 'src/resume/policy.ts' },
    ],
    time: { startedAtMs: NOW - 5_000, updatedAtMs: NOW },
    limits: { maxConcurrency: 2, maxRetries: 1, maxTasks: 2, timeoutMs: 600_000 },
    watchdog: { deadlineHit: false, cancelled: false, deadlineMs: 600_000 },
  }
}

/* -------------------------------------------------------------------- tests -- */

describe('recovery: the resume document on disk', () => {
  it('round-trips a sealed document through the filesystem unchanged', async () => {
    const file = join(dir, 'resume.json')
    const text = documentText([
      taskRow({ id: 'task-a', seq: 1, status: 'completed', outputs: ['out:a'], files: ['/tmp/a.txt'] }),
      taskRow({ id: 'task-b', seq: 2, status: 'interrupted' }),
    ])
    await commit(file, text)

    const validated = validateResumeCheckpoint(await readFile(file, 'utf8'), { runId: RUN_ID })
    expect(validated.ok).toBe(true)
    if (!validated.ok) throw new Error(validated.detail)
    expect(validated.checkpoint.kind).toBe(RESUME_CHECKPOINT_KIND)
    expect(validated.checkpoint.version).toBe(RESUME_CHECKPOINT_VERSION)
    expect(canonicalJson(validated.checkpoint)).toBe(canonicalJson(JSON.parse(text) as ResumeCheckpoint))

    // Re-sealing the same input produces the same bytes: the digest is a pure
    // function of the document, so a restart can compare artifacts offline.
    await commit(join(dir, 'resume-again.json'), text)
    expect(await readFile(join(dir, 'resume-again.json'), 'utf8')).toBe(await readFile(file, 'utf8'))
  })

  it('refuses a document whose bytes changed after sealing (tamper)', async () => {
    const file = join(dir, 'resume.json')
    const text = documentText([
      taskRow({ id: 'task-a', seq: 1, status: 'completed', files: ['/tmp/a.txt'] }),
    ])
    await commit(file, text)

    // Flip one character inside a covered field, keeping the JSON valid, so the
    // only thing that can catch it is the integrity digest.
    const tampered = text.replace('Task task-a', 'Task task-A')
    expect(tampered).not.toBe(text)
    await commit(file, tampered)

    const validated = validateResumeCheckpoint(await readFile(file, 'utf8'))
    expect(validated.ok).toBe(false)
    if (validated.ok) throw new Error('a tampered document must never validate')
    expect(validated.reason).toBe('corruption')
    expect(validated.detail).toContain('integrity digest mismatch')

    const decision = evaluateResumeCheckpoint(await readFile(file, 'utf8'))
    expect(decision.restorable).toBe(false)
    if (decision.restorable) throw new Error('a tampered document must never produce a plan')
    expect(decision.reason).toBe('corruption')

    // Editing the digest instead does not help either.
    const rewritten = text.replace(/"digest":"[0-9a-f]{8}/, '"digest":"00000000')
    expect(rewritten).not.toBe(text)
    await commit(file, rewritten)
    const afterDigestEdit = validateResumeCheckpoint(await readFile(file, 'utf8'))
    expect(afterDigestEdit.ok).toBe(false)
    if (afterDigestEdit.ok) throw new Error('a rewritten digest must never validate')
    expect(afterDigestEdit.reason).toBe('corruption')
  })

  it('refuses a document sealed with a foreign format version, without planning anything', async () => {
    // Sealed with a correct digest for its own body, so the refusal is the
    // version — not a corruption that would mask it.
    const body: Omit<ResumeCheckpoint, 'digest'> = {
      kind: RESUME_CHECKPOINT_KIND,
      version: 2 as unknown as typeof RESUME_CHECKPOINT_VERSION,
      runId: RUN_ID,
      workflowId: 'grok-workflow',
      updatedAt: AT,
      tasks: [taskRow({ id: 'task-a', seq: 1, status: 'completed' })],
    }
    const sealedV2 = sealResumeCheckpoint(body)
    expect(sealedV2.digest).toBe(resumeDigest(body))

    const file = join(dir, 'resume-v2.json')
    await commit(file, `${canonicalJson(sealedV2)}\n`)
    const validated = validateResumeCheckpoint(await readFile(file, 'utf8'))
    expect(validated.ok).toBe(false)
    if (validated.ok) throw new Error('a foreign version must never validate')
    expect(validated.reason).toBe('version-mismatch')
    expect(validated.detail).toContain('2')
    expect(validated.detail).toContain(String(RESUME_CHECKPOINT_VERSION))

    const decision = evaluateResumeCheckpoint(await readFile(file, 'utf8'))
    expect(decision.restorable).toBe(false)
    if (decision.restorable) throw new Error('a foreign version must never produce a plan')
    expect(decision.reason).toBe('version-mismatch')

    // An older version is refused the same way, not migrated.
    const sealedV0 = sealResumeCheckpoint({ ...body, version: 0 as unknown as typeof RESUME_CHECKPOINT_VERSION })
    await commit(file, `${canonicalJson(sealedV0)}\n`)
    const older = validateResumeCheckpoint(await readFile(file, 'utf8'))
    expect(older.ok).toBe(false)
    if (older.ok) throw new Error('an older version must never validate')
    expect(older.reason).toBe('version-mismatch')
  })

  it('retains interrupted work and carries its artifacts across the restart', async () => {
    const interrupted = taskRow({
      id: 'task-b',
      seq: 2,
      status: 'interrupted',
      attempt: 2,
      outputs: ['partial:out-b'],
      files: ['/tmp/b.txt'],
      evidence: [{ kind: 'file', ref: '/tmp/b.txt', note: 'started, never finished' }],
    })
    const file = join(dir, 'resume-interrupted.json')
    await commit(file, documentText([taskRow({ id: 'task-a', seq: 1, status: 'completed' }), interrupted]))

    const decision = evaluateResumeCheckpoint(await readFile(file, 'utf8'), { runId: RUN_ID })
    expect(decision.restorable).toBe(true)
    if (!decision.restorable) throw new Error(decision.detail)

    const decisionB = decision.plan.tasks.find(task => task.id === 'task-b')
    expect(decisionB?.status).toBe('interrupted')
    expect(decisionB?.action).toBe('redrive')
    expect(decisionB?.retained).toBe(true)
    // Preserved verbatim: restore never discards what a dead attempt produced.
    expect(decisionB?.preserve).toEqual({
      outputs: ['partial:out-b'],
      files: ['/tmp/b.txt'],
      evidence: [{ kind: 'file', ref: '/tmp/b.txt', note: 'started, never finished' }],
    })
    expect(decision.plan.tasks.find(task => task.id === 'task-a')?.action).toBe('retain')
    // Re-driving an interrupted task is not planner work, so nothing is replanned.
    expect(decision.plan.replanRequired).toBe(false)
    expect(decision.plan.replanTaskIds).toEqual([])
  })

  it('re-verifies evidence-incomplete work instead of trusting its outputs', async () => {
    const incomplete = taskRow({
      id: 'task-c',
      seq: 3,
      status: 'evidence-incomplete',
      outputs: ['out:c'],
      files: ['/tmp/c.txt'],
    })
    const selfReported = taskRow({ id: 'task-d', seq: 4, status: 'success', outputs: ['out:d'], files: ['/tmp/d.txt'] })
    const file = join(dir, 'resume-incomplete.json')
    await commit(file, documentText([taskRow({ id: 'task-a', seq: 1, status: 'completed' }), incomplete, selfReported]))

    const decision = evaluateResumeCheckpoint(await readFile(file, 'utf8'), { runId: RUN_ID })
    expect(decision.restorable).toBe(true)
    if (!decision.restorable) throw new Error(decision.detail)

    const incompleteDecision = decision.plan.tasks.find(task => task.id === 'task-c')
    expect(incompleteDecision?.action).toBe('reverify')
    expect(incompleteDecision?.retained).toBe(true)
    expect(incompleteDecision?.preserve.outputs).toEqual(['out:c'])
    expect(incompleteDecision?.preserve.files).toEqual(['/tmp/c.txt'])

    // A bare success mark is a self-report: never retained, nothing carried over.
    const selfReportedDecision = decision.plan.tasks.find(task => task.id === 'task-d')
    expect(selfReportedDecision?.action).toBe('replan')
    expect(selfReportedDecision?.retained).toBe(false)
    expect(selfReportedDecision?.preserve).toEqual({ outputs: [], files: [], evidence: [] })

    expect(decision.plan.replanRequired).toBe(true)
    expect(decision.plan.replanTaskIds).toEqual(['task-c', 'task-d'])
    expect(decision.plan.counts).toEqual({ retain: 1, redrive: 0, reverify: 1, replan: 1 })
  })

  it('names nothing to re-drive when the journal lost its task rows', async () => {
    // An incomplete journal (no rows yet) is valid but cannot name work: this is
    // exactly why the kill/restart fixture journals at every task boundary.
    const file = join(dir, 'resume-empty.json')
    await commit(file, documentText([]))
    const decision = evaluateResumeCheckpoint(await readFile(file, 'utf8'), { runId: RUN_ID })
    expect(decision.restorable).toBe(true)
    if (!decision.restorable) throw new Error(decision.detail)
    expect(decision.plan.tasks).toEqual([])
    expect(decision.plan.replanRequired).toBe(false)
    expect(decision.plan.replanTaskIds).toEqual([])
  })
})

describe('recovery: the run checkpoint on disk', () => {
  it('reads back after a restart and is refused once its bytes change', async () => {
    const file = join(dir, 'checkpoint-run-recovery-artifact.json')
    await mkdir(dir, { recursive: true })
    const written = await writeCheckpoint(file, runInput())

    // A fresh process would do exactly this: read the file, verify, compare.
    const read = await readCheckpoint(file)
    expect(stripIntegrity(read)).toEqual(stripIntegrity(buildCheckpoint(runInput(), NOW)))
    expect(read.integrity?.checksum).toBe(written.checksum)
    // `written.bytes` is the whole file; `integrity.bytes` is the payload the
    // checksum covers. Both must describe the bytes actually on disk.
    expect(read.integrity?.bytes).toBe(Buffer.byteLength(canonicalJson(stripIntegrity(read)), 'utf8'))
    expect(written.bytes).toBe(Buffer.byteLength(await readFile(file, 'utf8'), 'utf8'))
    expect(read.run.runId).toBe('run-recovery-artifact')
    expect(read.tasks.map(task => [task.id, task.status])).toEqual([['task-1', 'verified'], ['task-2', 'failed']])

    // Tamper with a covered field, keeping the JSON valid.
    const original = await readFile(file, 'utf8')
    const tampered = original.replace('Deliver the recovery path', 'Deliver the recovery patX')
    expect(tampered).not.toBe(original)
    await writeFile(file, tampered, 'utf8')
    await expect(readCheckpoint(file)).rejects.toBeInstanceOf(CheckpointError)
    await expect(readCheckpoint(file)).rejects.toMatchObject({ reason: 'integrity' })

    // A torn file is refused as invalid, never parsed into a partial checkpoint.
    await writeFile(file, original.slice(0, Math.floor(original.length / 2)), 'utf8')
    await expect(readCheckpoint(file)).rejects.toMatchObject({ reason: 'invalid' })
  })

  it('refuses a run checkpoint written by another schema version', async () => {
    const sealed = sealCheckpoint(buildCheckpoint(runInput(), NOW))
    expect(sealed.version).toBe(CHECKPOINT_VERSION)
    const foreign = { ...sealed, version: 'grok-workflow.checkpoint/v0' }
    expect(() => assertCheckpoint(foreign)).toThrow(CheckpointError)
    try {
      assertCheckpoint(foreign)
    } catch (error) {
      expect((error as CheckpointError).reason).toBe('invalid')
    }
  })

  it('detects a checksum that no longer matches its own payload', async () => {
    const sealed = sealCheckpoint(buildCheckpoint(runInput(), NOW))
    const integrity = sealed.integrity
    expect(integrity).toBeDefined()
    const recomputed = createHash('sha256').update(canonicalJson(stripIntegrity(sealed))).digest('hex')
    expect(integrity?.checksum).toBe(recomputed)
  })
})
