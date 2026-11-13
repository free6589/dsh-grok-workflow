/**
 * Resume-checkpoint validator (fail closed).
 *
 * Boundary: pure, synchronous, offline. Validates a restore-candidate document
 * for the workflow resume path — envelope, format version, integrity digest,
 * per-record structure, and cross-record consistency. Every refusal carries a
 * machine-readable `reason` (`version-mismatch` | `corruption` | `conflict`)
 * plus a human-readable `detail`. The restore policy (`./policy.js`) refuses to
 * build a plan from anything this validator did not accept, so a bad checkpoint
 * can never trigger an auto-restore.
 *
 * This module owns the *restore* document contract
 * (`grok-workflow.resume-checkpoint`), whose task states are restore-domain
 * states: completed / interrupted / failed / gated / evidence-incomplete /
 * success. The raw run journal is owned by `src/checkpoint/`; mapping journal
 * states into this contract happens at integration time, outside this module.
 *
 * Classification choices: damaged bytes, torn JSON, wrong envelope, bad digest,
 * and malformed records are `corruption`; a document sealed with a foreign
 * format version is `version-mismatch`; a structurally intact, sealed document
 * whose *claims* are inconsistent with the restore contract (unknown task
 * status, duplicate task id, duplicate seq, wrong run) is `conflict`.
 */

import { createHash } from 'node:crypto'

/** Envelope discriminator of the restore document. */
export const RESUME_CHECKPOINT_KIND = 'grok-workflow.resume-checkpoint'

/** Format version this validator accepts; any other value refuses restore. */
export const RESUME_CHECKPOINT_VERSION = 1

/**
 * Restore-domain task states the validator accepts. `success` is structurally
 * valid but the restore policy never retains it (a self-report is not
 * verification); see `RETAINED_STATUSES` in `./policy.js`.
 */
export const RESUME_TASK_STATUSES = [
  'completed',
  'interrupted',
  'failed',
  'gated',
  'evidence-incomplete',
  'success',
] as const

export type ResumeTaskStatus = (typeof RESUME_TASK_STATUSES)[number]

/** Why a checkpoint was refused; every refusal is exactly one of these. */
export type RefusalReason = 'version-mismatch' | 'corruption' | 'conflict'

/** A refusal: restore is denied, with the reason and an explanatory detail. */
export interface ResumeCheckpointRefusal {
  ok: false
  reason: RefusalReason
  detail: string
}

/** One citation a restored task can carry over. */
export interface ResumeEvidence {
  kind: 'file' | 'command' | 'url' | 'other'
  ref: string
  note?: string
}

/** One task as recorded at interruption time. */
export interface ResumeTask {
  /** Stable task identity within the run. */
  id: string
  /** Plan position, >= 1, unique across the run. */
  seq: number
  title?: string
  status: ResumeTaskStatus
  /** 1-based attempt count when the journal recorded retries. */
  attempt?: number
  /** ISO-8601 timestamp of the last status write. */
  updatedAt?: string
  /** Artifact locators the task produced (preserved on restore). */
  outputs?: string[]
  /** Files the task wrote (preserved on restore). */
  files?: string[]
  /** Evidence citations backing the status (preserved on restore). */
  evidence?: ResumeEvidence[]
}

/** A sealed restore document. `digest` covers everything else, canonically. */
export interface ResumeCheckpoint {
  kind: typeof RESUME_CHECKPOINT_KIND
  version: typeof RESUME_CHECKPOINT_VERSION
  runId: string
  workflowId?: string
  /** ISO-8601 timestamp of the last journal write. */
  updatedAt: string
  tasks: ResumeTask[]
  /** sha256 over `canonicalJson` of the document without `digest`. */
  digest: string
}

/** The validator accepted the document; restore may proceed to the policy. */
export interface ResumeCheckpointOk {
  ok: true
  checkpoint: ResumeCheckpoint
}

export type ValidationResult = ResumeCheckpointOk | ResumeCheckpointRefusal

/** Extra identity the caller can pin before restore is allowed. */
export interface ResumeCheckpointExpectations {
  /** Refuse with `conflict` when the document belongs to a different run. */
  runId?: string
}

const STATUS_SET: ReadonlySet<string> = new Set(RESUME_TASK_STATUSES)
const EVIDENCE_KINDS = ['file', 'command', 'url', 'other'] as const
const EVIDENCE_KIND_SET: ReadonlySet<string> = new Set(EVIDENCE_KINDS)

/** Deterministic JSON: sorted object keys, arrays in order, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Digest of an unsealed document body (everything except `digest`). */
export function resumeDigest(body: Omit<ResumeCheckpoint, 'digest'>): string {
  return createHash('sha256').update(canonicalJson(body)).digest('hex')
}

/** Seal a document body: computes and attaches the integrity digest. */
export function sealResumeCheckpoint(body: Omit<ResumeCheckpoint, 'digest'>): ResumeCheckpoint {
  return { ...body, digest: resumeDigest(body) }
}

/** Build a sealed document in one step (the normal way tests and wiring seal). */
export function buildResumeCheckpoint(
  input: {
    runId: string
    workflowId?: string
    updatedAt: string
    tasks: ResumeTask[]
  },
): ResumeCheckpoint {
  const { runId, workflowId, updatedAt, tasks } = input
  return sealResumeCheckpoint({
    kind: RESUME_CHECKPOINT_KIND,
    version: RESUME_CHECKPOINT_VERSION,
    runId,
    ...(workflowId === undefined ? {} : { workflowId }),
    updatedAt,
    tasks,
  })
}

function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0)
}

/** Validate a restore-candidate document; refuse means no auto-restore. */
export function validateResumeCheckpoint(
  input: unknown,
  expected: ResumeCheckpointExpectations = {},
): ValidationResult {
  let candidate: unknown = input
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return refuse('corruption', `checkpoint is not valid JSON: ${message}`)
    }
  }
  if (!isPlainObject(candidate)) {
    return refuse('corruption', 'checkpoint is not a JSON object')
  }

  if (candidate['kind'] !== RESUME_CHECKPOINT_KIND) {
    return refuse(
      'corruption',
      `not a resume checkpoint document (kind=${JSON.stringify(candidate['kind'] ?? null)}, expected ${RESUME_CHECKPOINT_KIND})`,
    )
  }

  const version = candidate['version']
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return refuse('corruption', `checkpoint version is missing or not an integer (got ${JSON.stringify(version ?? null)})`)
  }
  if (version !== RESUME_CHECKPOINT_VERSION) {
    return refuse(
      'version-mismatch',
      `checkpoint format version ${version} is not supported; this build restores version ${RESUME_CHECKPOINT_VERSION} only`,
    )
  }

  const digest = candidate['digest']
  if (typeof digest !== 'string' || digest.length === 0) {
    return refuse('corruption', 'checkpoint is missing its integrity digest')
  }

  const runId = candidate['runId']
  if (!isNonEmptyString(runId)) {
    return refuse('corruption', 'checkpoint is missing a non-empty runId')
  }

  const updatedAt = candidate['updatedAt']
  if (typeof updatedAt !== 'string' || !isIsoDateString(updatedAt)) {
    return refuse('corruption', `checkpoint updatedAt is not an ISO-8601 timestamp (got ${JSON.stringify(updatedAt ?? null)})`)
  }

  const workflowId = candidate['workflowId']
  if (workflowId !== undefined && !isNonEmptyString(workflowId)) {
    return refuse('corruption', 'checkpoint workflowId is present but not a non-empty string')
  }

  const rawTasks = candidate['tasks']
  if (!Array.isArray(rawTasks)) {
    return refuse('corruption', 'checkpoint tasks is not an array')
  }

  // Integrity gate: before trusting any record, the document must match the
  // digest it was sealed with. A mismatch means the bytes were modified or torn
  // after sealing — restore is refused outright.
  const { digest: _omit, ...body } = candidate
  const recomputed = resumeDigest(body as Omit<ResumeCheckpoint, 'digest'>)
  if (recomputed !== digest) {
    return refuse(
      'corruption',
      `integrity digest mismatch: journal sealed ${digest.slice(0, 12)}…, document hashes ${recomputed.slice(0, 12)}… (modified or torn after sealing)`,
    )
  }

  const tasks: ResumeTask[] = []
  for (let i = 0; i < rawTasks.length; i++) {
    const raw = rawTasks[i]
    if (!isPlainObject(raw)) {
      return refuse('corruption', `tasks[${i}] is not an object`)
    }
    const id = raw['id']
    if (!isNonEmptyString(id)) {
      return refuse('corruption', `tasks[${i}].id is missing or not a non-empty string`)
    }
    const seq = raw['seq']
    if (!isPositiveInteger(seq)) {
      return refuse('corruption', `tasks[${i}] (id ${JSON.stringify(id)}).seq is not a positive integer (got ${JSON.stringify(seq ?? null)})`)
    }
    const status = raw['status']
    if (typeof status !== 'string' || !STATUS_SET.has(status)) {
      return refuse(
        'conflict',
        `tasks[${i}] (id ${JSON.stringify(id)}) claims status ${JSON.stringify(status ?? null)}, which is not a restore status (expected one of ${RESUME_TASK_STATUSES.join(', ')})`,
      )
    }
    const label = `tasks[${i}] (id ${JSON.stringify(id)})`
    if (raw['title'] !== undefined && typeof raw['title'] !== 'string') {
      return refuse('corruption', `${label}.title is present but not a string`)
    }
    if (raw['attempt'] !== undefined && !isPositiveInteger(raw['attempt'])) {
      return refuse('corruption', `${label}.attempt is present but not a positive integer`)
    }
    if (raw['updatedAt'] !== undefined && (typeof raw['updatedAt'] !== 'string' || !isIsoDateString(raw['updatedAt']))) {
      return refuse('corruption', `${label}.updatedAt is present but not an ISO-8601 timestamp`)
    }
    for (const field of ['outputs', 'files'] as const) {
      if (raw[field] !== undefined && !isStringArray(raw[field])) {
        return refuse('corruption', `${label}.${field} is present but not an array of non-empty strings`)
      }
    }
    let evidence: ResumeEvidence[] | undefined
    if (raw['evidence'] !== undefined) {
      if (!Array.isArray(raw['evidence'])) {
        return refuse('corruption', `${label}.evidence is present but not an array`)
      }
      evidence = []
      for (let j = 0; j < raw['evidence'].length; j++) {
        const entry = raw['evidence'][j]
        if (!isPlainObject(entry)) {
          return refuse('corruption', `${label}.evidence[${j}] is not an object`)
        }
        if (typeof entry['kind'] !== 'string' || !EVIDENCE_KIND_SET.has(entry['kind'])) {
          return refuse(
            'corruption',
            `${label}.evidence[${j}].kind ${JSON.stringify(entry['kind'] ?? null)} is not one of ${EVIDENCE_KINDS.join(', ')}`,
          )
        }
        if (!isNonEmptyString(entry['ref'])) {
          return refuse('corruption', `${label}.evidence[${j}].ref is missing or not a non-empty string`)
        }
        if (entry['note'] !== undefined && typeof entry['note'] !== 'string') {
          return refuse('corruption', `${label}.evidence[${j}].note is present but not a string`)
        }
        evidence.push({
          kind: entry['kind'] as (typeof EVIDENCE_KINDS)[number],
          ref: entry['ref'],
          ...(entry['note'] === undefined ? {} : { note: entry['note'] }),
        })
      }
    }
    tasks.push({
      id,
      seq,
      status: status as ResumeTaskStatus,
      ...(raw['title'] === undefined ? {} : { title: raw['title'] as string }),
      ...(raw['attempt'] === undefined ? {} : { attempt: raw['attempt'] }),
      ...(raw['updatedAt'] === undefined ? {} : { updatedAt: raw['updatedAt'] as string }),
      ...(raw['outputs'] === undefined ? {} : { outputs: raw['outputs'] as string[] }),
      ...(raw['files'] === undefined ? {} : { files: raw['files'] as string[] }),
      ...(evidence === undefined ? {} : { evidence }),
    })
  }

  // Cross-record consistency: the document is intact, so now its claims must
  // not contradict each other.
  const seenIds = new Map<string, number>()
  const seenSeqs = new Map<number, string>()
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!
    const firstAt = seenIds.get(task.id)
    if (firstAt !== undefined) {
      return refuse('conflict', `duplicate task id ${JSON.stringify(task.id)} at tasks[${i}] (first seen at tasks[${firstAt}])`)
    }
    seenIds.set(task.id, i)
    const owner = seenSeqs.get(task.seq)
    if (owner !== undefined) {
      return refuse('conflict', `tasks[${i}] (id ${JSON.stringify(task.id)}) reuses seq ${task.seq} already claimed by ${JSON.stringify(owner)}`)
    }
    seenSeqs.set(task.seq, task.id)
  }

  if (expected.runId !== undefined && runId !== expected.runId) {
    return refuse(
      'conflict',
      `checkpoint belongs to run ${JSON.stringify(runId)}, refusing restore into run ${JSON.stringify(expected.runId)}`,
    )
  }

  return {
    ok: true,
    checkpoint: {
      kind: RESUME_CHECKPOINT_KIND,
      version: RESUME_CHECKPOINT_VERSION,
      runId,
      ...(workflowId === undefined ? {} : { workflowId }),
      updatedAt,
      tasks,
      digest,
    },
  }
}

function refuse(reason: RefusalReason, detail: string): ResumeCheckpointRefusal {
  return { ok: false, reason, detail }
}
