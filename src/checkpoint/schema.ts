/**
 * Versioned checkpoint schema for workflow runs.
 *
 * A checkpoint is a bounded, verifiable snapshot of one workflow run: what was
 * asked (run/plan), what ran (tasks/agents/stages), what was proven (evidence),
 * where it ran (git), when (time), and the smallest context a fresh agent needs
 * to resume it (min-context). The writer in `./writer.js` turns a checkpoint
 * into one atomic, checksummed JSON file; this module owns the data contract.
 *
 * Integration points (documented engine hooks, read-only from this module):
 *
 * - Run identity and watchdog state come from the run lifecycle in
 *   `src/run.ts` (`ActiveRunInfo`, the t47 deadline watchdog) and the plugin
 *   disposal path (`ActiveState.unloadedAt`, shutdown signals).
 * - Task/agent rows mirror the report structures in `src/types.ts`
 *   (`TaskReport`, `RouteTrailEntry`, `ConfirmedEvidence`) so a checkpoint can
 *   be built from a `WorkflowReport` without reinterpreting anything.
 * - The run itself is started through `ctx.workflowEngine.start` (see
 *   `docs/ARCHITECTURE.md` §16) and child work is created through the engine's
 *   `agent()` hook; stage rows are meant to be recorded from those lifecycle
 *   events by a later integration task. This module never calls the engine.
 *
 * Limits policy: the checkpoint *records* whatever limits a run actually used —
 * except that a row outside the documented engine-hook contract is **refused**,
 * because a checkpoint is the artifact a later run is re-driven from and must not
 * be able to describe a run the plugin would never start. The contract is
 * default concurrency 10 / hard maximum 100 and retries default 1 / hard maximum 3
 * (AGENTS.md "Architecture invariants", D-003); it is pinned once in
 * {@link ENGINE_HOOK_LIMITS}, which derives from `HARD_LIMITS` in `src/config.ts`
 * so the accepted configuration and the recorded contract cannot drift apart.
 * The read side (`assertCheckpoint`) stays lenient on purpose: a file written by
 * an older build, when the config cap was wider, must still be readable, and
 * {@link limitContractViolations} names what is out of envelope for a caller that
 * wants to report it.
 *
 * Secrets: every free-text field passes through `redactSecrets` at build time
 * (see `src/redact.ts`). Field-level wholesale redaction (`redactDeep`) is
 * deliberately NOT used because it would blank structural fields such as
 * `sessionId` whose *names* look sensitive; only free text carries untrusted
 * content in this schema.
 */

import { createHash } from 'node:crypto'
import { DEFAULT_MAX_CONCURRENCY, DEFAULT_MAX_TASKS, FIXED_MAX_RETRIES, HARD_LIMITS } from '../config.js'
import { normalizeWritesPaths } from '../paths.js'
import { redactSecrets } from '../redact.js'
import type { RoleName } from '../types.js'

/** Schema version written into every checkpoint and checked on read. */
export const CHECKPOINT_VERSION = 'grok-workflow.checkpoint/v1'

/**
 * Hard ceilings for checkpoint fields. They bound the file so a noisy run
 * cannot grow a checkpoint without limit, and the reader refuses anything
 * larger than {@link CHECKPOINT_LIMITS.maxBytes} before parsing it.
 */
export const CHECKPOINT_LIMITS = {
  /**
   * Maximum whole-file size accepted by writer and reader — a *file* bound, not
   * a payload bound. A sealed file is the canonical payload plus its `integrity`
   * record, which is 122 fixed bytes plus the decimal digits of the byte count
   * (129 bytes at a 7-digit count), so the legal payload tops out at 1,048,447
   * rather than here. {@link sealCheckpoint} on its own still seals a payload up
   * to `maxBytes` in memory; `writeCheckpoint` is what refuses the file that
   * would result. Pinned by `test/checkpoint-bound.spec.ts`.
   */
  maxBytes: 1_048_576,
  /** Maximum characters of the run objective and the min-context objective. */
  objectiveChars: 4_000,
  /** Maximum characters of a cancel/cause line. */
  causeChars: 600,
  /** Maximum characters of a task title. */
  titleChars: 600,
  /** Maximum characters of an error or failure reason. */
  errorChars: 1_000,
  /** Maximum characters of one acceptance criterion. */
  criterionChars: 600,
  /** Maximum characters of one evidence claim. */
  claimChars: 1_000,
  /** Maximum characters of one evidence locator. */
  locatorChars: 400,
  /** Maximum characters of the min-context digest (carry-over scale, src/carryover.ts). */
  digestChars: 12_000,
  /** Maximum characters of a git branch name. */
  branchChars: 200,
  /** Maximum characters of a run id and a session id. */
  idChars: 120,
  /** Maximum characters of a route label. */
  routeChars: 200,
  /** Maximum rows in the min-context digest per section. */
  digestRows: 64,
  /** Maximum declared write paths per plan task (mirrors WRITE_PATH_LIMITS.items). */
  writesPathItems: 16,
  /** Maximum characters of one declared write path (mirrors WRITE_PATH_LIMITS.chars). */
  writesPathChars: 300,
  /** Maximum plan tasks and task-state rows. */
  maxTasks: 128,
  /** Maximum agent-call rows. */
  maxAgents: 512,
  /** Maximum stage rows. */
  maxStages: 16,
  /** Maximum evidence rows. */
  maxEvidence: 1_024,
  /** Maximum recorded attempts per task (config ceiling is 3 retries + 1). */
  attemptsCeiling: 16,
  /** Structural ceiling for recorded limit numbers (matches config's 1e6 backstop). */
  countCeiling: 1_000_000,
  /**
   * Structural ceiling for millisecond durations and timeouts. Accepts 0
   * (unlimited) and any configured timeoutMs up to MAX_SAFE_INTEGER, so a
   * checkpoint records the configured deadline honestly instead of refusing
   * or clamping it.
   */
  msCeiling: Number.MAX_SAFE_INTEGER,
} as const

/**
 * The documented engine-hook contract for run limits (AGENTS.md architecture
 * invariants; the task brief repeats it verbatim), derived from the single
 * declaration in `src/config.ts` so `HARD_LIMITS.maxConcurrency` /
 * `HARD_LIMITS.maxRetries` and the numbers `buildCheckpoint` refuses are the same
 * pair by construction. A value outside this envelope is refused by the writer
 * (`buildCheckpoint`) and reported by `limitContractViolations`; the reader still
 * accepts it, so a checkpoint written by an older, wider build stays readable.
 */
export const ENGINE_HOOK_LIMITS = {
  maxConcurrency: { default: DEFAULT_MAX_CONCURRENCY, max: HARD_LIMITS.maxConcurrency },
  maxRetries: { default: FIXED_MAX_RETRIES, max: HARD_LIMITS.maxRetries },
} as const

/** Run/stage status. `cancelled` covers caller cancel and plugin unload (t14). */
export type CheckpointStatus = 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'

/** Task status. The first two are in-flight states, the rest are terminal. */
export type CheckpointTaskStatus = 'pending' | 'running' | 'verified' | 'failed' | 'cancelled'

/** Where a plan came from (mirrors `PlanReport.source` in src/types.ts). */
export type CheckpointPlanSource = 'caller' | 'planner' | 'fallback' | 'unavailable'

const RUN_STATUSES: readonly CheckpointStatus[] = ['running', 'completed', 'partial', 'failed', 'cancelled']
const TASK_STATUSES: readonly CheckpointTaskStatus[] = ['pending', 'running', 'verified', 'failed', 'cancelled']
const PLAN_SOURCES: readonly CheckpointPlanSource[] = ['caller', 'planner', 'fallback', 'unavailable']
const ROLE_NAMES = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'] as const
const PHASE_NAMES = ['plan', 'execute', 'verify', 'synthesize', 'answer'] as const
export type CheckpointPhase = (typeof PHASE_NAMES)[number]
const AGENT_OUTCOMES: readonly ('ok' | 'failed')[] = ['ok', 'failed']
const MIN_CONTEXT_SOURCES: readonly ('auto' | 'caller')[] = ['auto', 'caller']

/** One run identity. Mirrors `ActiveRunInfo` in src/run.ts. */
export interface CheckpointRun {
  runId: string
  sessionId?: string
  /**
   * The run's durable task identity — the engine run's `meta.name`, which is what
   * `src/run.ts` also hands the memory archiver (`adopt(id, name)`), redacted and
   * bounded here. `runId` is engine-generated and means nothing outside the
   * process that produced it; this label is what lets a later reader tie the file
   * back to the task that was asked for.
   */
  name?: string
  objective: string
  status: CheckpointStatus
  cause?: string
}

/** One planned task, echoed for audit (mirrors `TaskReport.writesPaths`). */
export interface CheckpointPlanTask {
  id: string
  title: string
  /** Normalized declared write paths; `null` = the plan did not say (U-4). */
  writesPaths: string[] | null
}

export interface CheckpointPlan {
  source: CheckpointPlanSource
  taskCount: number
  tasks: CheckpointPlanTask[]
}

export interface CheckpointTask {
  id: string
  title: string
  status: CheckpointTaskStatus
  /** Attempt count so far (1 = initial attempt only). */
  attempts: number
  error?: string
}

/** One recorded child call (mirrors `RouteTrailEntry` in src/types.ts). */
export interface CheckpointAgent {
  role: RoleName
  outcome: 'ok' | 'failed'
  taskId?: string
  attempt?: number
  route?: string
  failureClass?: string
  reason?: string
  startedAtMs?: number
  durationMs?: number
}

/**
 * One child call that was still running when the checkpoint was written.
 *
 * Round 70: an unload used to leave nothing behind about the children it cut —
 * `agents` only ever held settled calls, so "what was in flight and where had it
 * got to" lived in the process that was being torn down. A resume needs exactly
 * that: the engine child id (so a later reader can look the child up in the
 * session store) and the last step the host observed for it.
 */
export interface CheckpointInFlight {
  /** Engine `agent()` sequence number within the run. */
  seq: number
  /** Engine child session id, when the `agent-start` payload carried one. */
  childId?: string
  /** Last host-observed step: the child's phase header, or its label. */
  lastStep: string
  /** Plan task the call belonged to, when the phase names one. */
  taskId?: string
  startedAtMs?: number
}

export interface CheckpointStage {
  phase: CheckpointPhase
  status: CheckpointStatus
  startedAtMs?: number
  endedAtMs?: number
  error?: string
}

/** One evidence row (mirrors `ConfirmedEvidence`, plus a locator). */
export interface CheckpointEvidence {
  taskId: string
  criterion: string
  claim: string
  locator?: string
}

export interface CheckpointGit {
  branch?: string
  /** Commit sha, 7–64 hex characters. */
  head?: string
  dirty: boolean
  ahead?: number
  behind?: number
}

export interface CheckpointTime {
  startedAtMs: number
  updatedAtMs: number
  durationMs?: number
  deadlineAtMs?: number
}

/**
 * Minimal context to resume the run. `auto` digests are compiled by
 * {@link buildMinContextDigest}; `caller` digests are supplied by the caller
 * and only redacted and bounded here.
 */
export interface CheckpointMinContext {
  objective: string
  digest: string
  source: 'auto' | 'caller'
}

export interface CheckpointLimits {
  maxConcurrency: number
  maxRetries: number
  maxTasks: number
  timeoutMs?: number
}

/** Watchdog state from the run lifecycle (deadline timer, cancellation). */
export interface CheckpointWatchdog {
  deadlineHit: boolean
  cancelled: boolean
  deadlineMs?: number
  cancelReason?: string
}

export interface CheckpointIntegrity {
  algorithm: 'sha256'
  checksum: string
  /** Byte length of the canonical payload the checksum covers. */
  bytes: number
}

/** A complete checkpoint. `integrity` is added by {@link sealCheckpoint}. */
export interface WorkflowCheckpoint {
  version: typeof CHECKPOINT_VERSION
  run: CheckpointRun
  plan: CheckpointPlan
  tasks: CheckpointTask[]
  agents: CheckpointAgent[]
  stages: CheckpointStage[]
  /**
   * Child calls still running at write time. Optional: a checkpoint written by an
   * older build has no such section, and an ordinary run with everything settled
   * leaves it out rather than writing an empty array.
   */
  inFlight?: CheckpointInFlight[]
  evidence: CheckpointEvidence[]
  git: CheckpointGit
  time: CheckpointTime
  minContext: CheckpointMinContext
  limits: CheckpointLimits
  watchdog: CheckpointWatchdog
  integrity?: CheckpointIntegrity
}

/** Build-time input. Absent sections get safe defaults; text is redacted and bounded. */
export interface CheckpointInput {
  run: {
    runId: string
    objective: string
    status: CheckpointStatus
    sessionId?: string
    /** Durable task identity (`run.meta.name`), redacted and bounded at build time. */
    name?: string
    cause?: string
  }
  plan: {
    source: CheckpointPlanSource
    tasks: { id: string; title: string; writesPaths?: unknown }[]
  }
  tasks?: { id: string; title: string; status: CheckpointTaskStatus; attempts: number; error?: string }[]
  agents?: {
    role: RoleName
    outcome: 'ok' | 'failed'
    taskId?: string
    attempt?: number
    route?: string
    failureClass?: string
    reason?: string
    startedAtMs?: number
    durationMs?: number
  }[]
  stages?: { phase: CheckpointPhase; status: CheckpointStatus; startedAtMs?: number; endedAtMs?: number; error?: string }[]
  /** Calls still running at write time (unload/cancel checkpoints). */
  inFlight?: { seq: number; childId?: string; lastStep: string; taskId?: string; startedAtMs?: number }[]
  evidence?: { taskId: string; criterion: string; claim: string; locator?: string }[]
  git?: { branch?: string; head?: string; dirty: boolean; ahead?: number; behind?: number }
  time?: { startedAtMs?: number; updatedAtMs?: number; durationMs?: number; deadlineAtMs?: number }
  minContext?: { objective?: string; digest: string }
  /**
   * Limits the run used. Every field is optional: an omitted one is recorded as
   * the documented contract default ({@link ENGINE_HOOK_LIMITS} / `maxTasks` 10)
   * rather than as a zero the writer would then have to refuse.
   */
  limits?: Partial<CheckpointLimits>
  watchdog?: { deadlineHit?: boolean; cancelled?: boolean; deadlineMs?: number; cancelReason?: string }
}

/** Why a checkpoint operation failed. `reason` drives test and caller branching. */
export class CheckpointError extends Error {
  readonly reason: 'invalid' | 'too-large' | 'integrity' | 'io'
  constructor(reason: CheckpointError['reason'], message: string) {
    super(message)
    this.name = 'CheckpointError'
    this.reason = reason
  }
}

/* ------------------------------------------------------------------ *
 * Validation helpers (same style as the private helpers in src/report.ts)
 * ------------------------------------------------------------------ */

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CheckpointError('invalid', `checkpoint ${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new CheckpointError('invalid', `checkpoint ${path} must be a string`)
  return value
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new CheckpointError('invalid', `checkpoint ${path} must be a safe integer`)
  }
  return value
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new CheckpointError('invalid', `checkpoint ${path} must be a boolean`)
  return value
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  const text = string(value, path)
  if (!(allowed as readonly string[]).includes(text)) {
    throw new CheckpointError('invalid', `checkpoint ${path} must be one of ${allowed.join('/')} (got "${text}")`)
  }
  return text as T
}

function bounded(value: string, max: number, path: string): string {
  if (value.length > max) throw new CheckpointError('invalid', `checkpoint ${path} exceeds ${max} characters`)
  return value
}

function inRange(value: number, min: number, max: number, path: string): number {
  if (value < min || value > max) {
    throw new CheckpointError('invalid', `checkpoint ${path} must be between ${min} and ${max}`)
  }
  return value
}

/* ------------------------------------------------------------------ *
 * Redaction and bounding (build side)
 * ------------------------------------------------------------------ */

/**
 * Redact, then bound one free-text field. The cut is surrogate-safe (never
 * leaves half of a code point at the boundary) and appends an explicit `…`
 * instead of a silent cut.
 */
function text(value: unknown, max: number, path: string): string {
  const redacted = redactSecrets(string(value, path))
  if (redacted.length <= max) return redacted
  let cut = Math.max(0, max - 1)
  const code = redacted.charCodeAt(cut - 1)
  if (cut > 0 && code >= 0xd800 && code <= 0xdbff) cut -= 1
  return `${redacted.slice(0, cut)}…`
}

/* ------------------------------------------------------------------ *
 * Canonical JSON, checksum, sealing
 * ------------------------------------------------------------------ */
/**
 * Deterministic JSON: object keys sorted, `undefined` fields dropped, arrays
 * in order. The checksum is computed over this form, so two structurally
 * equal checkpoints always produce the same bytes regardless of key insertion
 * order or property presence of `undefined` placeholders.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value, 0))
}

function canonical(value: unknown, depth: number): unknown {
  if (depth > 64) throw new CheckpointError('invalid', 'checkpoint nesting deeper than 64 levels')
  if (value === null) return null
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      if (!Number.isFinite(value)) throw new CheckpointError('invalid', 'checkpoint contains a non-finite number')
      return value
    case 'object': {
      if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1))
      const source = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(source).sort()) {
        const child = source[key]
        if (child === undefined) continue
        out[key] = canonical(child, depth + 1)
      }
      return out
    }
    default:
      throw new CheckpointError('invalid', `checkpoint contains a ${typeof value}, which is not JSON`)
  }
}

function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

/** Copy of the checkpoint without the `integrity` field. */
export function stripIntegrity(checkpoint: WorkflowCheckpoint): WorkflowCheckpoint {
  const { integrity: _omitted, ...rest } = checkpoint
  void _omitted
  return rest
}

/**
 * Compute and attach the integrity record. Throws `too-large` when the
 * canonical payload alone already exceeds {@link CHECKPOINT_LIMITS.maxBytes}.
 */
export function sealCheckpoint(checkpoint: WorkflowCheckpoint): WorkflowCheckpoint {
  const payload = canonicalJson(stripIntegrity(checkpoint))
  const bytes = Buffer.byteLength(payload, 'utf8')
  if (bytes > CHECKPOINT_LIMITS.maxBytes) {
    throw new CheckpointError('too-large', `checkpoint payload is ${bytes} bytes, above the ${CHECKPOINT_LIMITS.maxBytes} bound`)
  }
  return { ...checkpoint, integrity: { algorithm: 'sha256', checksum: sha256Hex(payload), bytes } }
}

/**
 * Recompute the checksum over the canonical payload and compare it with the
 * stored integrity record. Pure; the file reader wraps this with IO errors.
 */
export function verifyCheckpointIntegrity(checkpoint: WorkflowCheckpoint): { ok: boolean; detail?: string } {
  if (checkpoint.integrity === undefined) return { ok: false, detail: 'checkpoint carries no integrity record' }
  const payload = canonicalJson(stripIntegrity(checkpoint))
  const bytes = Buffer.byteLength(payload, 'utf8')
  if (checkpoint.integrity.algorithm !== 'sha256') {
    return { ok: false, detail: `unsupported integrity algorithm "${checkpoint.integrity.algorithm}"` }
  }
  const checksum = sha256Hex(payload)
  if (checkpoint.integrity.checksum !== checksum) {
    return { ok: false, detail: `checksum mismatch: stored ${checkpoint.integrity.checksum}, computed ${checksum}` }
  }
  if (checkpoint.integrity.bytes !== bytes) {
    return { ok: false, detail: `payload byte count mismatch: stored ${checkpoint.integrity.bytes}, computed ${bytes}` }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * Min-context digest
 * ------------------------------------------------------------------ */

/**
 * Compile the smallest context a fresh agent needs to resume the run:
 * objective, plan state, confirmed evidence, and open/uncertain rows. Pure and
 * deterministic — no clock, no randomness — and bounded by
 * {@link CHECKPOINT_LIMITS.digestChars} with an explicit truncation marker.
 */
export function buildMinContextDigest(input: {
  objective: string
  tasks: readonly { id: string; title: string; status: CheckpointTaskStatus }[]
  evidence?: readonly { taskId: string; criterion: string; claim: string }[]
  open?: readonly string[]
  uncertain?: readonly string[]
}): string {
  const lines: string[] = [`objective: ${text(input.objective, CHECKPOINT_LIMITS.objectiveChars, 'minContext.objective')}`]
  const done = input.tasks.filter(task => task.status === 'verified' || task.status === 'failed' || task.status === 'cancelled')
  lines.push(`plan: ${input.tasks.length} task(s), ${done.length} finished`)
  const taskRows = input.tasks.slice(0, CHECKPOINT_LIMITS.digestRows)
  for (const task of taskRows) lines.push(`- ${task.id} ${task.status} ${text(task.title, CHECKPOINT_LIMITS.titleChars, 'minContext.task')}`)
  if (input.tasks.length > taskRows.length) lines.push(`[truncated: ${input.tasks.length - taskRows.length} more task row(s)]`)
  const evidence = (input.evidence ?? []).slice(0, CHECKPOINT_LIMITS.digestRows)
  if (evidence.length > 0) {
    lines.push('confirmed:')
    for (const row of evidence) {
      lines.push(`- [${row.taskId}] ${text(row.criterion, CHECKPOINT_LIMITS.criterionChars, 'minContext.evidence')} :: ${text(row.claim, CHECKPOINT_LIMITS.claimChars, 'minContext.evidence')}`)
    }
    if ((input.evidence ?? []).length > evidence.length) {
      lines.push(`[truncated: ${(input.evidence ?? []).length - evidence.length} more evidence row(s)]`)
    }
  }
  for (const [name, rows] of [['open', input.open ?? []], ['uncertain', input.uncertain ?? []]] as const) {
    const kept = rows.slice(0, CHECKPOINT_LIMITS.digestRows)
    if (kept.length === 0) continue
    lines.push(`${name}:`)
    for (const row of kept) lines.push(`- ${text(row, CHECKPOINT_LIMITS.claimChars, `minContext.${name}`)}`)
    if (rows.length > kept.length) lines.push(`[truncated: ${rows.length - kept.length} more ${name} row(s)]`)
  }
  let digest = lines.join('\n')
  if (digest.length > CHECKPOINT_LIMITS.digestChars) {
    digest = `${digest.slice(0, CHECKPOINT_LIMITS.digestChars - 3)}...`
  }
  return digest
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

/** Build a validated, redacted, bounded checkpoint (without integrity). */
export function buildCheckpoint(input: CheckpointInput, now: number = Date.now()): WorkflowCheckpoint {
  if (!Number.isSafeInteger(now)) throw new CheckpointError('invalid', 'checkpoint clock value must be a safe integer')
  const runId = text(input.run.runId, CHECKPOINT_LIMITS.idChars, 'run.runId')
  if (runId === '') throw new CheckpointError('invalid', 'checkpoint run.runId must not be empty')
  const runName = input.run.name === undefined || input.run.name.trim() === ''
    ? undefined
    : text(input.run.name, CHECKPOINT_LIMITS.titleChars, 'run.name').trim()
  const run: CheckpointRun = {
    runId,
    status: enumeration(input.run.status, RUN_STATUSES, 'run.status'),
    objective: text(input.run.objective, CHECKPOINT_LIMITS.objectiveChars, 'run.objective'),
    ...(input.run.sessionId === undefined ? {} : { sessionId: text(input.run.sessionId, CHECKPOINT_LIMITS.idChars, 'run.sessionId') }),
    // The durable task identity is free text like any other, so it is redacted and
    // bounded here rather than trusted from the caller — and it is the one field
    // that is also trimmed: it is a label, not content, so padding is never
    // meaningful and `"   "` must mean "no name" rather than an empty label.
    ...runName === undefined ? {} : { name: runName },
    ...(input.run.cause === undefined ? {} : { cause: text(input.run.cause, CHECKPOINT_LIMITS.causeChars, 'run.cause') }),
  }

  const planTasks: CheckpointPlanTask[] = input.plan.tasks.slice(0, CHECKPOINT_LIMITS.maxTasks).map((task, index) => ({
    id: text(task.id, CHECKPOINT_LIMITS.idChars, `plan.tasks[${index}].id`),
    title: text(task.title, CHECKPOINT_LIMITS.titleChars, `plan.tasks[${index}].title`),
    writesPaths: normalizeWritesPaths(task.writesPaths) ?? null,
  }))
  const plan: CheckpointPlan = {
    source: enumeration(input.plan.source, PLAN_SOURCES, 'plan.source'),
    taskCount: planTasks.length,
    tasks: planTasks,
  }

  type TaskRowInput = NonNullable<CheckpointInput['tasks']>
  const taskSource: TaskRowInput = input.tasks
    ?? planTasks.map(task => ({ id: task.id, title: task.title, status: 'pending' as const, attempts: 0 }))
  const taskRows: CheckpointTask[] = taskSource
    .slice(0, CHECKPOINT_LIMITS.maxTasks)
    .map((task, index) => ({
      id: text(task.id, CHECKPOINT_LIMITS.idChars, `tasks[${index}].id`),
      title: text(task.title, CHECKPOINT_LIMITS.titleChars, `tasks[${index}].title`),
      status: enumeration(task.status, TASK_STATUSES, `tasks[${index}].status`),
      attempts: inRange(integer(task.attempts, `tasks[${index}].attempts`), 0, CHECKPOINT_LIMITS.attemptsCeiling, `tasks[${index}].attempts`),
      ...(task.error === undefined ? {} : { error: text(task.error, CHECKPOINT_LIMITS.errorChars, `tasks[${index}].error`) }),
    }))

  const agents: CheckpointAgent[] = (input.agents ?? []).slice(0, CHECKPOINT_LIMITS.maxAgents).map((agent, index) => {
    const path = `agents[${index}]`
    const row: CheckpointAgent = {
      role: enumeration(agent.role, ROLE_NAMES, `${path}.role`),
      outcome: enumeration(agent.outcome, AGENT_OUTCOMES, `${path}.outcome`),
      ...(agent.taskId === undefined ? {} : { taskId: text(agent.taskId, CHECKPOINT_LIMITS.idChars, `${path}.taskId`) }),
      ...(agent.attempt === undefined ? {} : { attempt: inRange(integer(agent.attempt, `${path}.attempt`), 0, CHECKPOINT_LIMITS.attemptsCeiling, `${path}.attempt`) }),
      ...(agent.route === undefined ? {} : { route: text(agent.route, CHECKPOINT_LIMITS.routeChars, `${path}.route`) }),
      ...(agent.failureClass === undefined ? {} : { failureClass: text(agent.failureClass, 40, `${path}.failureClass`) }),
      ...(agent.reason === undefined ? {} : { reason: text(agent.reason, CHECKPOINT_LIMITS.errorChars, `${path}.reason`) }),
      ...(agent.startedAtMs === undefined ? {} : { startedAtMs: integer(agent.startedAtMs, `${path}.startedAtMs`) }),
      ...(agent.durationMs === undefined ? {} : { durationMs: inRange(integer(agent.durationMs, `${path}.durationMs`), 0, CHECKPOINT_LIMITS.msCeiling, `${path}.durationMs`) }),
    }
    return row
  })

  const stages: CheckpointStage[] = (input.stages ?? []).slice(0, CHECKPOINT_LIMITS.maxStages).map((stage, index) => {
    const path = `stages[${index}]`
    return {
      phase: enumeration(stage.phase, PHASE_NAMES, `${path}.phase`),
      status: enumeration(stage.status, RUN_STATUSES, `${path}.status`),
      ...(stage.startedAtMs === undefined ? {} : { startedAtMs: integer(stage.startedAtMs, `${path}.startedAtMs`) }),
      ...(stage.endedAtMs === undefined ? {} : { endedAtMs: integer(stage.endedAtMs, `${path}.endedAtMs`) }),
      ...(stage.error === undefined ? {} : { error: text(stage.error, CHECKPOINT_LIMITS.errorChars, `${path}.error`) }),
    }
  })

  // In-flight rows are dropped from the payload when there are none: an ordinary
  // checkpoint keeps the shape it had before this section existed.
  const inFlight: CheckpointInFlight[] = (input.inFlight ?? []).slice(0, CHECKPOINT_LIMITS.maxAgents).map((row, index) => {
    const path = `inFlight[${index}]`
    return {
      seq: inRange(integer(row.seq, `${path}.seq`), 0, CHECKPOINT_LIMITS.countCeiling, `${path}.seq`),
      ...(row.childId === undefined || row.childId === '' ? {} : { childId: text(row.childId, CHECKPOINT_LIMITS.idChars, `${path}.childId`) }),
      lastStep: text(row.lastStep, CHECKPOINT_LIMITS.titleChars, `${path}.lastStep`),
      ...(row.taskId === undefined || row.taskId === '' ? {} : { taskId: text(row.taskId, CHECKPOINT_LIMITS.idChars, `${path}.taskId`) }),
      ...(row.startedAtMs === undefined ? {} : { startedAtMs: integer(row.startedAtMs, `${path}.startedAtMs`) }),
    }
  })

  const evidence: CheckpointEvidence[] = (input.evidence ?? []).slice(0, CHECKPOINT_LIMITS.maxEvidence).map((row, index) => {
    const path = `evidence[${index}]`
    return {
      taskId: text(row.taskId, CHECKPOINT_LIMITS.idChars, `${path}.taskId`),
      criterion: text(row.criterion, CHECKPOINT_LIMITS.criterionChars, `${path}.criterion`),
      claim: text(row.claim, CHECKPOINT_LIMITS.claimChars, `${path}.claim`),
      ...(row.locator === undefined ? {} : { locator: text(row.locator, CHECKPOINT_LIMITS.locatorChars, `${path}.locator`) }),
    }
  })

  const gitRaw = input.git ?? { dirty: false }
  const git: CheckpointGit = {
    dirty: boolean(gitRaw.dirty, 'git.dirty'),
    ...(gitRaw.branch === undefined ? {} : { branch: text(gitRaw.branch, CHECKPOINT_LIMITS.branchChars, 'git.branch') }),
    ...(gitRaw.head === undefined ? {} : { head: validateHead(gitRaw.head) }),
    ...(gitRaw.ahead === undefined ? {} : { ahead: inRange(integer(gitRaw.ahead, 'git.ahead'), 0, CHECKPOINT_LIMITS.countCeiling, 'git.ahead') }),
    ...(gitRaw.behind === undefined ? {} : { behind: inRange(integer(gitRaw.behind, 'git.behind'), 0, CHECKPOINT_LIMITS.countCeiling, 'git.behind') }),
  }

  const startedAtMs = integer(input.time?.startedAtMs ?? now, 'time.startedAtMs')
  const updatedAtMs = integer(input.time?.updatedAtMs ?? now, 'time.updatedAtMs')
  const time: CheckpointTime = {
    startedAtMs,
    updatedAtMs,
    ...(input.time?.durationMs === undefined ? {} : { durationMs: inRange(integer(input.time.durationMs, 'time.durationMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'time.durationMs') }),
    ...(input.time?.deadlineAtMs === undefined ? {} : { deadlineAtMs: integer(input.time.deadlineAtMs, 'time.deadlineAtMs') }),
  }

  const minContext: CheckpointMinContext = input.minContext === undefined
    ? {
        objective: text(input.run.objective, CHECKPOINT_LIMITS.objectiveChars, 'minContext.objective'),
        digest: buildMinContextDigest({ objective: input.run.objective, tasks: taskRows, evidence }),
        source: 'auto',
      }
    : {
        objective: text(input.minContext.objective ?? input.run.objective, CHECKPOINT_LIMITS.objectiveChars, 'minContext.objective'),
        digest: text(input.minContext.digest, CHECKPOINT_LIMITS.digestChars, 'minContext.digest'),
        source: 'caller',
      }

  // Limits: a field the caller left out is *omitted*, so the schema defaults
  // ({@link ENGINE_HOOK_LIMITS}) apply. Coercing an absent value to 0 here would
  // produce a row the contract refuses, which is how a recorder created without
  // limits used to fail every single write.
  const rawLimits = {
    maxConcurrency: inRange(integer(input.limits?.maxConcurrency ?? ENGINE_HOOK_LIMITS.maxConcurrency.default, 'limits.maxConcurrency'), 1, CHECKPOINT_LIMITS.countCeiling, 'limits.maxConcurrency'),
    maxRetries: inRange(integer(input.limits?.maxRetries ?? ENGINE_HOOK_LIMITS.maxRetries.default, 'limits.maxRetries'), 0, CHECKPOINT_LIMITS.countCeiling, 'limits.maxRetries'),
    maxTasks: inRange(integer(input.limits?.maxTasks ?? DEFAULT_MAX_TASKS, 'limits.maxTasks'), 1, CHECKPOINT_LIMITS.countCeiling, 'limits.maxTasks'),
  }
  const limitViolations = limitContractViolations(rawLimits)
  if (limitViolations.length > 0) {
    throw new CheckpointError(
      'invalid',
      `checkpoint limits are outside the documented engine-hook contract (AGENTS.md, D-003): ${limitViolations.join('; ')}`,
    )
  }
  const limits: CheckpointLimits = {
    ...rawLimits,
    ...(input.limits?.timeoutMs === undefined ? {} : { timeoutMs: inRange(integer(input.limits.timeoutMs, 'limits.timeoutMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'limits.timeoutMs') }),
  }

  const watchdog: CheckpointWatchdog = {
    deadlineHit: boolean(input.watchdog?.deadlineHit ?? false, 'watchdog.deadlineHit'),
    cancelled: boolean(input.watchdog?.cancelled ?? false, 'watchdog.cancelled'),
    ...(input.watchdog?.deadlineMs === undefined ? {} : { deadlineMs: inRange(integer(input.watchdog.deadlineMs, 'watchdog.deadlineMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'watchdog.deadlineMs') }),
    ...(input.watchdog?.cancelReason === undefined ? {} : { cancelReason: text(input.watchdog.cancelReason, CHECKPOINT_LIMITS.causeChars, 'watchdog.cancelReason') }),
  }

  return assertCheckpoint({
    version: CHECKPOINT_VERSION,
    run,
    plan,
    tasks: taskRows,
    agents,
    stages,
    ...inFlight.length === 0 ? {} : { inFlight },
    evidence,
    git,
    time,
    minContext,
    limits,
    watchdog,
  })
}

function validateHead(value: string): string {
  const head = value.trim().toLowerCase()
  if (!/^[0-9a-f]{7,64}$/.test(head)) throw new CheckpointError('invalid', `checkpoint git.head must be 7-64 hex characters (got "${value}")`)
  return head
}

/* ------------------------------------------------------------------ *
 * Assert (read side): strict validation, no mutation, no re-bounding
 * ------------------------------------------------------------------ */

/**
 * Validate an unknown value as a checkpoint. Used by the file reader after
 * JSON.parse; it never repairs anything — a field over its bound means the
 * file was not written by this module, and the read fails.
 */
export function assertCheckpoint(value: unknown): WorkflowCheckpoint {
  const root = record(value, '')
  const version = string(root['version'], 'version')
  if (version !== CHECKPOINT_VERSION) {
    throw new CheckpointError('invalid', `checkpoint version must be "${CHECKPOINT_VERSION}" (got "${version}")`)
  }

  const runRaw = record(root['run'], 'run')
  const run: CheckpointRun = {
    runId: bounded(string(runRaw['runId'], 'run.runId'), CHECKPOINT_LIMITS.idChars, 'run.runId'),
    status: enumeration(runRaw['status'], RUN_STATUSES, 'run.status'),
    objective: bounded(string(runRaw['objective'], 'run.objective'), CHECKPOINT_LIMITS.objectiveChars, 'run.objective'),
    ...(runRaw['sessionId'] === undefined ? {} : { sessionId: bounded(string(runRaw['sessionId'], 'run.sessionId'), CHECKPOINT_LIMITS.idChars, 'run.sessionId') }),
    ...(runRaw['name'] === undefined ? {} : { name: bounded(string(runRaw['name'], 'run.name'), CHECKPOINT_LIMITS.titleChars, 'run.name') }),
    ...(runRaw['cause'] === undefined ? {} : { cause: bounded(string(runRaw['cause'], 'run.cause'), CHECKPOINT_LIMITS.causeChars, 'run.cause') }),
  }
  if (run.runId === '') throw new CheckpointError('invalid', 'checkpoint run.runId must not be empty')

  const planRaw = record(root['plan'], 'plan')
  const planTasksRaw = planRaw['tasks']
  if (!Array.isArray(planTasksRaw)) throw new CheckpointError('invalid', 'checkpoint plan.tasks must be an array')
  if (planTasksRaw.length > CHECKPOINT_LIMITS.maxTasks) throw new CheckpointError('invalid', `checkpoint plan.tasks exceeds ${CHECKPOINT_LIMITS.maxTasks} rows`)
  const planTasks: CheckpointPlanTask[] = planTasksRaw.map((item, index) => {
    const raw = record(item, `plan.tasks[${index}]`)
    const writesPathsRaw = raw['writesPaths']
    if (writesPathsRaw !== null && !Array.isArray(writesPathsRaw)) {
      throw new CheckpointError('invalid', `checkpoint plan.tasks[${index}].writesPaths must be an array or null`)
    }
    if (Array.isArray(writesPathsRaw) && writesPathsRaw.length > CHECKPOINT_LIMITS.writesPathItems) {
      throw new CheckpointError('invalid', `checkpoint plan.tasks[${index}].writesPaths exceeds ${CHECKPOINT_LIMITS.writesPathItems} paths`)
    }
    return {
      id: bounded(string(raw['id'], `plan.tasks[${index}].id`), CHECKPOINT_LIMITS.idChars, `plan.tasks[${index}].id`),
      title: bounded(string(raw['title'], `plan.tasks[${index}].title`), CHECKPOINT_LIMITS.titleChars, `plan.tasks[${index}].title`),
      writesPaths: writesPathsRaw === null
        ? null
        : (writesPathsRaw as unknown[]).map((entry, pathIndex) =>
            bounded(string(entry, `plan.tasks[${index}].writesPaths[${pathIndex}]`), CHECKPOINT_LIMITS.writesPathChars, `plan.tasks[${index}].writesPaths[${pathIndex}]`),
          ),
    }
  })
  const plan: CheckpointPlan = {
    source: enumeration(planRaw['source'], PLAN_SOURCES, 'plan.source'),
    taskCount: inRange(integer(planRaw['taskCount'], 'plan.taskCount'), 0, CHECKPOINT_LIMITS.maxTasks, 'plan.taskCount'),
    tasks: planTasks,
  }
  if (plan.taskCount !== plan.tasks.length) {
    throw new CheckpointError('invalid', `checkpoint plan.taskCount (${plan.taskCount}) does not match plan.tasks length (${plan.tasks.length})`)
  }

  const tasksRaw = root['tasks']
  if (!Array.isArray(tasksRaw)) throw new CheckpointError('invalid', 'checkpoint tasks must be an array')
  if (tasksRaw.length > CHECKPOINT_LIMITS.maxTasks) throw new CheckpointError('invalid', `checkpoint tasks exceeds ${CHECKPOINT_LIMITS.maxTasks} rows`)
  const tasks: CheckpointTask[] = tasksRaw.map((item, index) => {
    const raw = record(item, `tasks[${index}]`)
    return {
      id: bounded(string(raw['id'], `tasks[${index}].id`), CHECKPOINT_LIMITS.idChars, `tasks[${index}].id`),
      title: bounded(string(raw['title'], `tasks[${index}].title`), CHECKPOINT_LIMITS.titleChars, `tasks[${index}].title`),
      status: enumeration(raw['status'], TASK_STATUSES, `tasks[${index}].status`),
      attempts: inRange(integer(raw['attempts'], `tasks[${index}].attempts`), 0, CHECKPOINT_LIMITS.attemptsCeiling, `tasks[${index}].attempts`),
      ...(raw['error'] === undefined ? {} : { error: bounded(string(raw['error'], `tasks[${index}].error`), CHECKPOINT_LIMITS.errorChars, `tasks[${index}].error`) }),
    }
  })

  const agentsRaw = root['agents']
  if (!Array.isArray(agentsRaw)) throw new CheckpointError('invalid', 'checkpoint agents must be an array')
  if (agentsRaw.length > CHECKPOINT_LIMITS.maxAgents) throw new CheckpointError('invalid', `checkpoint agents exceeds ${CHECKPOINT_LIMITS.maxAgents} rows`)
  const agents: CheckpointAgent[] = agentsRaw.map((item, index) => {
    const raw = record(item, `agents[${index}]`)
    return {
      role: enumeration(raw['role'], ROLE_NAMES, `agents[${index}].role`),
      outcome: enumeration(raw['outcome'], AGENT_OUTCOMES, `agents[${index}].outcome`),
      ...(raw['taskId'] === undefined ? {} : { taskId: bounded(string(raw['taskId'], `agents[${index}].taskId`), CHECKPOINT_LIMITS.idChars, `agents[${index}].taskId`) }),
      ...(raw['attempt'] === undefined ? {} : { attempt: inRange(integer(raw['attempt'], `agents[${index}].attempt`), 0, CHECKPOINT_LIMITS.attemptsCeiling, `agents[${index}].attempt`) }),
      ...(raw['route'] === undefined ? {} : { route: bounded(string(raw['route'], `agents[${index}].route`), CHECKPOINT_LIMITS.routeChars, `agents[${index}].route`) }),
      ...(raw['failureClass'] === undefined ? {} : { failureClass: bounded(string(raw['failureClass'], `agents[${index}].failureClass`), 40, `agents[${index}].failureClass`) }),
      ...(raw['reason'] === undefined ? {} : { reason: bounded(string(raw['reason'], `agents[${index}].reason`), CHECKPOINT_LIMITS.errorChars, `agents[${index}].reason`) }),
      ...(raw['startedAtMs'] === undefined ? {} : { startedAtMs: integer(raw['startedAtMs'], `agents[${index}].startedAtMs`) }),
      ...(raw['durationMs'] === undefined ? {} : { durationMs: inRange(integer(raw['durationMs'], `agents[${index}].durationMs`), 0, CHECKPOINT_LIMITS.msCeiling, `agents[${index}].durationMs`) }),
    }
  })

  const stagesRaw = root['stages']
  if (!Array.isArray(stagesRaw)) throw new CheckpointError('invalid', 'checkpoint stages must be an array')
  if (stagesRaw.length > CHECKPOINT_LIMITS.maxStages) throw new CheckpointError('invalid', `checkpoint stages exceeds ${CHECKPOINT_LIMITS.maxStages} rows`)
  const stages: CheckpointStage[] = stagesRaw.map((item, index) => {
    const raw = record(item, `stages[${index}]`)
    return {
      phase: enumeration(raw['phase'], PHASE_NAMES, `stages[${index}].phase`),
      status: enumeration(raw['status'], RUN_STATUSES, `stages[${index}].status`),
      ...(raw['startedAtMs'] === undefined ? {} : { startedAtMs: integer(raw['startedAtMs'], `stages[${index}].startedAtMs`) }),
      ...(raw['endedAtMs'] === undefined ? {} : { endedAtMs: integer(raw['endedAtMs'], `stages[${index}].endedAtMs`) }),
      ...(raw['error'] === undefined ? {} : { error: bounded(string(raw['error'], `stages[${index}].error`), CHECKPOINT_LIMITS.errorChars, `stages[${index}].error`) }),
    }
  })

  const inFlightRaw = root['inFlight']
  if (inFlightRaw !== undefined && !Array.isArray(inFlightRaw)) {
    throw new CheckpointError('invalid', 'checkpoint inFlight must be an array')
  }
  if (Array.isArray(inFlightRaw) && inFlightRaw.length > CHECKPOINT_LIMITS.maxAgents) {
    throw new CheckpointError('invalid', `checkpoint inFlight exceeds ${CHECKPOINT_LIMITS.maxAgents} rows`)
  }
  const inFlight: CheckpointInFlight[] | undefined = inFlightRaw === undefined
    ? undefined
    : (inFlightRaw as unknown[]).map((item, index) => {
      const raw = record(item, `inFlight[${index}]`)
      return {
        seq: inRange(integer(raw['seq'], `inFlight[${index}].seq`), 0, CHECKPOINT_LIMITS.countCeiling, `inFlight[${index}].seq`),
        ...(raw['childId'] === undefined ? {} : { childId: bounded(string(raw['childId'], `inFlight[${index}].childId`), CHECKPOINT_LIMITS.idChars, `inFlight[${index}].childId`) }),
        lastStep: bounded(string(raw['lastStep'], `inFlight[${index}].lastStep`), CHECKPOINT_LIMITS.titleChars, `inFlight[${index}].lastStep`),
        ...(raw['taskId'] === undefined ? {} : { taskId: bounded(string(raw['taskId'], `inFlight[${index}].taskId`), CHECKPOINT_LIMITS.idChars, `inFlight[${index}].taskId`) }),
        ...(raw['startedAtMs'] === undefined ? {} : { startedAtMs: integer(raw['startedAtMs'], `inFlight[${index}].startedAtMs`) }),
      }
    })

  const evidenceRaw = root['evidence']
  if (!Array.isArray(evidenceRaw)) throw new CheckpointError('invalid', 'checkpoint evidence must be an array')
  if (evidenceRaw.length > CHECKPOINT_LIMITS.maxEvidence) throw new CheckpointError('invalid', `checkpoint evidence exceeds ${CHECKPOINT_LIMITS.maxEvidence} rows`)
  const evidence: CheckpointEvidence[] = evidenceRaw.map((item, index) => {
    const raw = record(item, `evidence[${index}]`)
    return {
      taskId: bounded(string(raw['taskId'], `evidence[${index}].taskId`), CHECKPOINT_LIMITS.idChars, `evidence[${index}].taskId`),
      criterion: bounded(string(raw['criterion'], `evidence[${index}].criterion`), CHECKPOINT_LIMITS.criterionChars, `evidence[${index}].criterion`),
      claim: bounded(string(raw['claim'], `evidence[${index}].claim`), CHECKPOINT_LIMITS.claimChars, `evidence[${index}].claim`),
      ...(raw['locator'] === undefined ? {} : { locator: bounded(string(raw['locator'], `evidence[${index}].locator`), CHECKPOINT_LIMITS.locatorChars, `evidence[${index}].locator`) }),
    }
  })

  const gitRaw = record(root['git'], 'git')
  const git: CheckpointGit = {
    dirty: boolean(gitRaw['dirty'], 'git.dirty'),
    ...(gitRaw['branch'] === undefined ? {} : { branch: bounded(string(gitRaw['branch'], 'git.branch'), CHECKPOINT_LIMITS.branchChars, 'git.branch') }),
    ...(gitRaw['head'] === undefined ? {} : { head: validateHead(string(gitRaw['head'], 'git.head')) }),
    ...(gitRaw['ahead'] === undefined ? {} : { ahead: inRange(integer(gitRaw['ahead'], 'git.ahead'), 0, CHECKPOINT_LIMITS.countCeiling, 'git.ahead') }),
    ...(gitRaw['behind'] === undefined ? {} : { behind: inRange(integer(gitRaw['behind'], 'git.behind'), 0, CHECKPOINT_LIMITS.countCeiling, 'git.behind') }),
  }

  const timeRaw = record(root['time'], 'time')
  const time: CheckpointTime = {
    startedAtMs: integer(timeRaw['startedAtMs'], 'time.startedAtMs'),
    updatedAtMs: integer(timeRaw['updatedAtMs'], 'time.updatedAtMs'),
    ...(timeRaw['durationMs'] === undefined ? {} : { durationMs: inRange(integer(timeRaw['durationMs'], 'time.durationMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'time.durationMs') }),
    ...(timeRaw['deadlineAtMs'] === undefined ? {} : { deadlineAtMs: integer(timeRaw['deadlineAtMs'], 'time.deadlineAtMs') }),
  }

  const minContextRaw = record(root['minContext'], 'minContext')
  const minContext: CheckpointMinContext = {
    objective: bounded(string(minContextRaw['objective'], 'minContext.objective'), CHECKPOINT_LIMITS.objectiveChars, 'minContext.objective'),
    digest: bounded(string(minContextRaw['digest'], 'minContext.digest'), CHECKPOINT_LIMITS.digestChars, 'minContext.digest'),
    source: enumeration(minContextRaw['source'], MIN_CONTEXT_SOURCES, 'minContext.source'),
  }

  const limitsRaw = record(root['limits'], 'limits')
  const limits: CheckpointLimits = {
    maxConcurrency: inRange(integer(limitsRaw['maxConcurrency'], 'limits.maxConcurrency'), 1, CHECKPOINT_LIMITS.countCeiling, 'limits.maxConcurrency'),
    maxRetries: inRange(integer(limitsRaw['maxRetries'], 'limits.maxRetries'), 0, CHECKPOINT_LIMITS.countCeiling, 'limits.maxRetries'),
    maxTasks: inRange(integer(limitsRaw['maxTasks'], 'limits.maxTasks'), 1, CHECKPOINT_LIMITS.countCeiling, 'limits.maxTasks'),
    ...(limitsRaw['timeoutMs'] === undefined ? {} : { timeoutMs: inRange(integer(limitsRaw['timeoutMs'], 'limits.timeoutMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'limits.timeoutMs') }),
  }

  const watchdogRaw = record(root['watchdog'], 'watchdog')
  const watchdog: CheckpointWatchdog = {
    deadlineHit: boolean(watchdogRaw['deadlineHit'], 'watchdog.deadlineHit'),
    cancelled: boolean(watchdogRaw['cancelled'], 'watchdog.cancelled'),
    ...(watchdogRaw['deadlineMs'] === undefined ? {} : { deadlineMs: inRange(integer(watchdogRaw['deadlineMs'], 'watchdog.deadlineMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'watchdog.deadlineMs') }),
    ...(watchdogRaw['cancelReason'] === undefined ? {} : { cancelReason: bounded(string(watchdogRaw['cancelReason'], 'watchdog.cancelReason'), CHECKPOINT_LIMITS.causeChars, 'watchdog.cancelReason') }),
  }

  const integrityRaw = root['integrity']
  let integrity: CheckpointIntegrity | undefined
  if (integrityRaw !== undefined && integrityRaw !== null) {
    const raw = record(integrityRaw, 'integrity')
    const algorithm = string(raw['algorithm'], 'integrity.algorithm')
    if (algorithm !== 'sha256') throw new CheckpointError('invalid', `checkpoint integrity.algorithm must be "sha256" (got "${algorithm}")`)
    const checksum = string(raw['checksum'], 'integrity.checksum')
    if (!/^[0-9a-f]{64}$/.test(checksum)) throw new CheckpointError('invalid', 'checkpoint integrity.checksum must be 64 lowercase hex characters')
    integrity = {
      algorithm,
      checksum,
      // `bytes` counts the payload the *writer* accepted, so the only bound it
      // can honestly have is the writer's own: `maxBytes`. `countCeiling` bounds
      // row counts, not payload size — checking it here refused every legal
      // payload between 1,000,000 and the largest the writer can produce, which
      // sealed and wrote fine and then read back as `invalid`. That largest
      // payload is not `maxBytes`: `maxBytes` bounds the *file*, and a sealed file
      // carries the integrity record — 122 bytes plus the decimal digits of the
      // byte count — so the writer's ceiling for the payload itself is 1,048,447
      // (a 7-digit count, i.e. a 129-byte record). Pinned by
      // `test/checkpoint-schema.spec.ts`.
      bytes: inRange(integer(raw['bytes'], 'integrity.bytes'), 1, CHECKPOINT_LIMITS.maxBytes, 'integrity.bytes'),
    }
  }

  return {
    version,
    run,
    plan,
    tasks,
    agents,
    stages,
    ...inFlight === undefined ? {} : { inFlight },
    evidence,
    git,
    time,
    minContext,
    limits,
    watchdog,
    ...(integrity === undefined ? {} : { integrity }),
  }
}

/* ------------------------------------------------------------------ *
 * Documented limit contract
 * ------------------------------------------------------------------ */

/**
 * Compare recorded limits against the documented engine-hook contract
 * ({@link ENGINE_HOOK_LIMITS}). Returns one human-readable violation per
 * out-of-envelope value; an empty list means the run matched the contract.
 * This never throws and never blocks a write — it is a reporting aid.
 */
export function limitContractViolations(limits: Pick<CheckpointLimits, 'maxConcurrency' | 'maxRetries'>): string[] {
  const violations: string[] = []
  const { maxConcurrency, maxRetries } = ENGINE_HOOK_LIMITS
  if (limits.maxConcurrency > maxConcurrency.max) {
    violations.push(`maxConcurrency ${limits.maxConcurrency} exceeds the documented maximum ${maxConcurrency.max}`)
  }
  if (limits.maxRetries > maxRetries.max) {
    violations.push(`maxRetries ${limits.maxRetries} exceeds the documented maximum ${maxRetries.max}`)
  }
  return violations
}
