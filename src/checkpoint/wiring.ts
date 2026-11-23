/**
 * Engine wiring: checkpointing attached to the workflow-run lifecycle.
 *
 * This module is the only place that connects the checkpoint schema
 * (`./schema.js`) and its atomic writer (`./writer.js`) to a live run started
 * through `ctx.workflowEngine.start` and to the plugin's disposal path. It owns
 * four obligations, and nothing else:
 *
 * 1. **Periodic checkpoints.** While a run is live, one host timer rewrites the
 *    run's checkpoint file on a fixed interval. The timer is `unref()`ed, so a
 *    checkpoint never keeps the process alive, and it exists only between
 *    `adopt()` and `finish()`/`unload()`/`dispose()` — an idle plugin (or an
 *    unmounted bundle row) owns no timer at all.
 * 2. **Terminal checkpoints.** `finish()` writes the run's final status and the
 *    report-derived rows (tasks, agents, evidence); `unload()` writes the
 *    `cancelled` shape that a plugin unload produces, before the runs are
 *    cancelled, because afterwards there is no run left to describe. A run cut
 *    before any report existed still carries the child calls the engine
 *    announced (see {@link ObservedChildCall}), so the file names the work that
 *    ran instead of saying nothing about it.
 * 3. **Host-side watchdog evidence.** Deadline and cancellation facts flow into
 *    `watchdog` from the host: the recorder's own clock against the deadline it
 *    was given, the engine's `workflow/end` stop reason, and the caller's own
 *    statements (`noteDeadline`/`noteCancel`/`finish`). Nothing is inferred from
 *    a child's self-report.
 * 4. **Five roles, no new ones.** Everything recorded about children comes from
 *    host-observable data — the report's own route trail — and a row whose role
 *    is not one of {@link HOST_ROLES planner, worker, verifier, supervisor, synthesizer} is
 *    dropped rather than given a label. Wiring never calls `agent()` and never
 *    starts a model turn: it costs zero model calls and adds zero roles.
 *
 * What wiring deliberately does NOT do:
 * - It never touches the engine. It subscribes to the observe-only
 *   `workflow/*` events (`@deepseek-ai/dsh-workflow`) and reads the run object
 *   it is handed; it never starts, cancels or disposes a run. Cancellation stays
 *   with `src/run.ts` and `disposeActiveState`.
 * - It never claims engine-level resume. The shipped engine has no journaling or
 *   resume (`dsh-workflow/README.md`, limitations), so {@link resumeDecision}
 *   answers a *host* question — "should a new run be started from this file, and
 *   with which unfinished tasks?" — and says so in its reason string.
 * - It never writes what it cannot observe. Before a report exists the
 *   checkpoint says `plan.source: 'unavailable'` with no plan tasks — the plan
 *   lives inside the script — and records no evidence, which needs a verifier's
 *   verdict no host-side event carries. The one thing it *can* observe is the
 *   engine's `agent-start`/`agent-end` stream, and those calls are recorded as
 *   they were announced: no stage is guessed at, no outcome is invented, and no
 *   role is named that the call's own label did not name. `git` is written only
 *   when the caller supplies a provider; otherwise the schema default is recorded
 *   and must not be read as an observation.
 *
 * Durability and failure policy: every write goes through `writeCheckpoint`
 * (atomic rename + checksum) and at most one write per run is in flight at a
 * time, so a periodic tick and the terminal write can never race on the same
 * file. A failed write is a warning and a counter, never a failed run — recording
 * must not be able to break the work it records. After
 * {@link CHECKPOINT_WIRING_LIMITS.maxConsecutiveFailures} consecutive failures the
 * recorder stops retrying for that run **and says so once** (a read-only or full
 * disk then costs one explicit give-up line instead of a silent stop), so the
 * state is never mistakable for a healthy run.
 *
 * The limits a run records are held to the documented engine-hook envelope
 * ({@link ENGINE_HOOK_LIMITS}, derived from `HARD_LIMITS` in `src/config.ts`): a
 * caller that bypasses the config schema and hands the recorder a wider value gets
 * one visible warning at `adopt`, and the write itself is refused by
 * `buildCheckpoint`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { phaseLabel, parseMemberLabel } from '../naming.js'
import { redactError, redactSecrets } from '../redact.js'
import type { RoleName, WorkflowReport } from '../types.js'
import { assertCheckpoint, CHECKPOINT_LIMITS, ENGINE_HOOK_LIMITS, limitContractViolations, verifyCheckpointIntegrity } from './schema.js'
import type {
  CheckpointGit,
  CheckpointInput,
  CheckpointLimits,
  CheckpointPhase,
  CheckpointStatus,
  CheckpointStage,
  CheckpointTaskStatus,
  CheckpointWatchdog,
  WorkflowCheckpoint,
} from './schema.js'
import { checkpointFileName, readCheckpoint, writeCheckpoint } from './writer.js'

/* ------------------------------------------------------------------ *
 * Bounds and host vocabulary
 * ------------------------------------------------------------------ */

/** Wiring's own bounds. They bound the *rate* and *retention* of writes. */
export const CHECKPOINT_WIRING_LIMITS = {
  /** Periodic checkpoint interval; clamped into this range at construction. */
  intervalMs: { min: 1_000, max: 300_000, default: 30_000 },
  /** Consecutive failed writes after which a recorder stops retrying. */
  maxConsecutiveFailures: 3,
  /** How many distinct run ids one recorder keeps event rows for. */
  rememberedRuns: 4,
  /**
   * Upper bound on child calls kept per run, so a runaway script cannot grow the
   * recorder's memory. The schema's own `maxAgents` bound is the ceiling a file
   * can carry, and the task rows are sliced to `maxTasks` separately; this is the
   * raw observation list both are derived from.
   */
  observedCalls: 512,
  /**
   * Upper bound on the wait for the unload checkpoint. A disposer must finish;
   * an abandoned write is dropped (it never retries and starts no timer).
   */
  unloadWriteTimeoutMs: 3_000,
  /**
   * How recent a `running` checkpoint must be to count as possibly live, on its
   * own bounds: one second is the smallest age that says anything at all, and one
   * day is the longest a run may plausibly still be alive. It is deliberately
   * **not** the interval range: the interval bounds how often a file is rewritten
   * (seconds to minutes), while staleness asks a different question, and reusing
   * one clamp for both silently reinterpreted a caller's 10-minute staleness as
   * 5 minutes.
   */
  staleAfterMs: { min: 1_000, max: 86_400_000, default: 120_000 },
  /**
   * Files the synchronous status reader inspects per call, newest mtime first.
   *
   * `/grok status` must answer in one tick, so it looks at a bounded window of the
   * directory rather than walking a long history; the newest run is the one being
   * asked about, and an older file that is not in the window is not a status
   * answer worth stalling a command for.
   */
  statusScan: 24,
} as const

/**
 * The only roles a checkpoint may name: the five the plugin already runs.
 *
 * Wiring records child calls from the report's route trail, so this list is a
 * guard, not a taxonomy: a route entry with any other role is dropped instead of
 * being recorded under an invented name (AGENTS.md: no new agent role).
 */
export const HOST_ROLES = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'] as const

/** Whether a value is one of {@link HOST_ROLES}. */
export function isHostRole(value: unknown): value is RoleName {
  return typeof value === 'string' && (HOST_ROLES as readonly string[]).includes(value)
}

/* ------------------------------------------------------------------ *
 * Where checkpoints live
 * ------------------------------------------------------------------ */

/** Caller-supplied location; an explicit `dir` wins over everything else. */
export interface CheckpointDirectoryOptions {
  dir?: string
}

/**
 * Resolve the checkpoint directory.
 *
 * Same three-step rule as the memory archive (`src/memory/archive.ts`
 * `archiveDir`), for the same reason: a test, an e2e lane and a real operator all
 * need to point checkpoints at a scratch directory without a config key, and the
 * suite must never write into an operator's real `$DSH_HOME`.
 * @param options - caller options; `dir` wins over the environment.
 * @returns The absolute checkpoint directory.
 */
export function checkpointDir(options: CheckpointDirectoryOptions = {}): string {
  if (options.dir !== undefined && options.dir.trim() !== '') return options.dir
  const override = process.env.GROK_WORKFLOW_CHECKPOINT_DIR
  if (override !== undefined && override.trim() !== '') return override
  const home = process.env.DSH_HOME
  const base = home !== undefined && home.trim() !== '' ? home : join(homedir(), '.dsh')
  return join(base, 'checkpoints', 'grok-workflow')
}

/** Path of one run's checkpoint file. One file per run, atomically replaced. */
export function checkpointFile(runId: string, options: CheckpointDirectoryOptions = {}): string {
  return join(checkpointDir(options), checkpointFileName(runId))
}

/**
 * Read the freshest readable checkpoint synchronously.
 *
 * `/grok status` is a command handler: it settles a string in the same tick, so it
 * cannot await the async reader. The read is the same file, the same schema check
 * and the same integrity check the async path uses, just synchronous, and every
 * failure (unreadable directory, half-written file, checksum mismatch) returns
 * `undefined` instead of throwing into the command. The scan is bounded to
 * {@link CHECKPOINT_WIRING_LIMITS.statusFiles} files, newest first, so a directory
 * full of history cannot make a status call walk all of it.
 * @param options - directory override plus an optional session filter.
 * @returns The newest whole checkpoint, or undefined when none is readable.
 */
export function readLatestCheckpointSync(options: StatusReadOptions = {}): { path: string, checkpoint: WorkflowCheckpoint } | undefined {
  let names: string[]
  try {
    names = readdirSync(checkpointDir(options)).filter(name => name.endsWith('.json'))
  } catch {
    return undefined
  }
  const ranked: { name: string, mtimeMs: number }[] = []
  for (const name of names.slice(0, CHECKPOINT_WIRING_LIMITS.statusScan)) {
    try {
      const info = statSync(join(checkpointDir(options), name))
      if (info.isFile()) ranked.push({ name, mtimeMs: info.mtimeMs })
    } catch {
      // A file that vanished between the listing and the stat is simply not a
      // candidate; the next-newest one is.
    }
  }
  ranked.sort((left, right) => right.mtimeMs - left.mtimeMs)
  for (const candidate of ranked) {
    const path = join(checkpointDir(options), candidate.name)
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
      const checkpoint = assertCheckpoint(parsed)
      if (!verifyCheckpointIntegrity(checkpoint).ok) continue
      if (options.sessionId !== undefined && checkpoint.run.sessionId !== undefined && checkpoint.run.sessionId !== options.sessionId) continue
      return { path, checkpoint }
    } catch {
      // Unreadable or invalid: try the next one rather than report a file the
      // reader could not trust.
    }
  }
  return undefined
}

/** Options for the synchronous status reader. */
export interface StatusReadOptions extends CheckpointDirectoryOptions {
  /** Keep only a checkpoint written for this session. */
  sessionId?: string
}

/* ------------------------------------------------------------------ *
 * Host-visible vocabulary mapping
 * ------------------------------------------------------------------ */

const PHASE_KINDS = ['plan', 'execute', 'verify', 'synthesize', 'answer'] as const

/**
 * Map a script phase *title* (what `phase()` actually emits) to a checkpoint
 * phase, or `undefined` when the title is not one of this plugin's own labels.
 *
 * Both shipping languages are accepted because the title carries the localized
 * copy (`src/naming.ts` `phaseLabel`), and the bare English kind is accepted
 * because that is what the script source uses. An unrecognized title is dropped:
 * a stage row is evidence, and inventing one would make the file lie.
 * @param title - the `workflow/phase` title, verbatim.
 * @returns The matching checkpoint phase, or `undefined`.
 */
export function phaseFromTitle(title: unknown): CheckpointPhase | undefined {
  if (typeof title !== 'string') return undefined
  const trimmed = title.trim()
  if (trimmed === '') return undefined
  const lower = trimmed.toLowerCase()
  for (const kind of PHASE_KINDS) {
    if (lower === kind) return kind
    if (trimmed === phaseLabel(kind, 'zh') || trimmed === phaseLabel(kind, 'en')) return kind
  }
  return undefined
}

/* ------------------------------------------------------------------ *
 * Resume decision (host-side)
 * ------------------------------------------------------------------ */

/** What the host should do with a checkpoint it found. */
export type ResumeAction = 'resume' | 'wait' | 'none'

/** The host's answer, with the facts it was derived from. */
export interface ResumeDecision {
  action: ResumeAction
  /** Why, in the shape a smoke note or a log line can quote verbatim. */
  reason: string
  runId: string
  /** Tasks that were not `verified` when the checkpoint was taken. */
  unfinished: string[]
  /** Context a fresh run may carry instead of restoring engine state. */
  seed: string
}

export interface ResumeOptions {
  now?: number
  /** Override how recent a `running` checkpoint must be to count as live. */
  staleAfterMs?: number
}

/**
 * Whether {@link resumeDecision} is reached from a production entry point.
 *
 * **WIRED**: `src/run.ts` asks this question at startup (`findResumableCheckpoint`
 * below scans the run's checkpoint directory, and `runWorkflow` carries a `resume`
 * decision's `seed` as the run's carry-over context). The visible entry is
 * `runWorkflow` — every shipped path (the tool, the gate, a loop round) runs
 * through it, so it covers `/grok` too.
 */
export const RESUME_DECISION_WIRING = {
  wired: true,
  entry: 'src/run.ts:runWorkflow' as string | undefined,
  note: 'runWorkflow scans the checkpoint directory at startup and carries a resume seed as carry-over context',
} as const

/**
 * Decide what a host should do with one checkpoint.
 *
 * The engine cannot resume a run (no journaling, no resume — see the module
 * header), so `resume` never means "restore engine state". It means: start a new
 * run carrying `seed` as its context and re-drive `unfinished`, because the
 * verified rows in the file say which work is already done. `wait` is the honest
 * answer for a `running` checkpoint that may still be owned by a live process.
 *
 * Scope: this reads a *run* checkpoint (`grok-workflow.checkpoint/v1`, written by
 * this module) and answers "should a host re-drive this run?". It is not the
 * restore policy in `src/resume/policy.ts`, which consumes a
 * `grok-workflow.resume-checkpoint` and decides task by task what may be retained
 * verbatim; the two answer different questions over different artifacts.
 *
 * Wiring state: `runWorkflow` in `src/run.ts` calls
 * {@link findResumableCheckpoint} at startup and carries a `resume` decision's
 * `seed` as the run's carry-over context (see {@link RESUME_DECISION_WIRING}).
 * @param checkpoint - a verified checkpoint (as returned by `readCheckpoint`).
 * @param options - clock and staleness overrides.
 * @returns The decision, its reason, and the task ids a resume would re-drive.
 */
export function resumeDecision(checkpoint: WorkflowCheckpoint, options: ResumeOptions = {}): ResumeDecision {
  const now = options.now ?? Date.now()
  const staleAfterMs = boundedStaleness(options.staleAfterMs ?? CHECKPOINT_WIRING_LIMITS.staleAfterMs.default)
  const runId = checkpoint.run.runId
  const unfinished = checkpoint.tasks.filter(task => task.status !== 'verified').map(task => task.id)
  const seed = checkpoint.minContext.digest
  if (checkpoint.run.status === 'completed') {
    return {
      action: 'none',
      reason: 'the run already completed, so re-driving it would redo verified work',
      runId,
      unfinished: [],
      seed,
    }
  }
  if (checkpoint.run.status === 'running') {
    // Age is floored at 0: a stamp in the future means the clock that wrote the
    // file runs ahead of ours (or the file was replayed), and a negative age must
    // never be read as "stale". Such a checkpoint lands in `wait`, which is the
    // answer that assumes the writer may still be alive — the fail-safe direction,
    // because `resume` starts a second run over work another process may hold.
    const aheadMs = checkpoint.time.updatedAtMs - now
    const ageMs = aheadMs > 0 ? 0 : now - checkpoint.time.updatedAtMs
    if (ageMs < staleAfterMs) {
      return {
        action: 'wait',
        reason: aheadMs > 0
          ? `the checkpoint is stamped ${aheadMs} ms in the future, so this clock cannot tell whether the run that wrote it is still alive (treated as live)`
          : `the checkpoint was written ${ageMs} ms ago (below ${staleAfterMs} ms), so the process that owns the run may still be alive`,
        runId,
        unfinished,
        seed,
      }
    }
  }
  if (unfinished.length === 0) {
    if (checkpoint.tasks.length === 0) {
      return {
        action: 'none',
        reason: 'the checkpoint carries no task rows (it was taken before the run produced a report), so a new run has nothing named to re-drive',
        runId,
        unfinished,
        seed,
      }
    }
    return {
      action: 'none',
      reason: `status ${checkpoint.run.status} with every task verified, so there is nothing a new run could add`,
      runId,
      unfinished,
      seed,
    }
  }
  return {
    action: 'resume',
    reason: `${unfinished.length} task(s) were not verified when the checkpoint was taken (status ${checkpoint.run.status}); a new run can re-drive them from the recorded context`,
    runId,
    unfinished,
    seed,
  }
}

/**
 * Clamp how recent a `running` checkpoint must be to count as possibly live.
 *
 * Its own bounds (1 s .. 24 h) on purpose (B13): staleness asks a different
 * question from the write interval, so a caller asking for 12 hours gets 12 hours
 * instead of having its request silently folded into the interval range
 * ({@link CHECKPOINT_WIRING_LIMITS.intervalMs}, seconds to minutes).
 */
function boundedStaleness(value: number): number {
  if (!Number.isFinite(value)) return CHECKPOINT_WIRING_LIMITS.staleAfterMs.default
  return Math.min(CHECKPOINT_WIRING_LIMITS.staleAfterMs.max, Math.max(CHECKPOINT_WIRING_LIMITS.staleAfterMs.min, Math.trunc(value)))
}

/** One resumable checkpoint found on disk, with the decision it produced. */
export interface ResumableCheckpoint {
  /** Absolute path of the checkpoint file that answered `resume`. */
  path: string
  /** The verified checkpoint itself (checksum already checked by the reader). */
  checkpoint: WorkflowCheckpoint
  /** The `resume` answer for this file. */
  decision: ResumeDecision
}

export interface CheckpointLister {
  /** File names directly inside the checkpoint directory (no recursion). */
  listCheckpointFiles(dir: string): Promise<string[]>
  /** Modification time of one checkpoint file, in epoch milliseconds. `undefined` = skip the file. */
  checkpointMtimeMs(path: string): Promise<number | undefined>
}

export interface FindResumableOptions extends ResumeOptions, CheckpointDirectoryOptions {
  /** Only consider checkpoints recorded for this session; others belong to other chats. */
  sessionId?: string
  logger?: CheckpointLogger
  /**
   * Filesystem access for the scan. Production passes nothing (real `readdir`
   * + `stat`, same as the recorder's writer). Tests pass a stub or an empty
   * directory, so a suite with fake timers or a shared home directory never
   * pays for — or sees — the real checkpoint folder.
   *
   * The scan also races itself against `timeoutMs` (default 2 s): the directory
   * listing and every file read share one budget, and a scan that cannot finish
   * in time answers "start fresh" instead of holding the run's startup open.
   * Fake-timer suites cannot advance past an in-flight fs syscall, and a cold
   * disk must never be able to starve the run's own deadline — so a slow scan
   * is a skipped scan, never a stuck start.
   */
  lister?: CheckpointLister
  /**
   * Wall-clock budget for the whole scan in milliseconds. Defaults to 2 000;
   * `0` or negative disables the scan (answers `undefined` immediately), and
   * non-finite values fall back to the default. Tests with fake timers pass
   * `0` to skip the filesystem entirely; a shared home directory passes a
   * stub lister instead of the real folder.
   */
  scanTimeoutMs?: number
}

/** Default wall-clock budget for one resume scan. */
export const RESUME_SCAN_TIMEOUT_MS = 2_000

/** The production lister: real directory reads, same as the writer. */
const realLister: CheckpointLister = {
  listCheckpointFiles: async (dir: string): Promise<string[]> => readdir(dir),
  checkpointMtimeMs: async (path: string): Promise<number | undefined> => {
    try {
      const info = await stat(path)
      if (!info.isFile()) return undefined
      return info.mtimeMs
    } catch {
      return undefined
    }
  },
}

/**
 * Scan the checkpoint directory for a file that answers `resume`.
 *
 * Read-only and fail-closed: an unreadable directory, a torn file, a
 * version the schema no longer accepts, or a file whose checksum no longer
 * matches is skipped, never thrown — the absence of a usable checkpoint is a
 * normal answer ("start fresh"), not a failed start. `completed` and `wait`
 * files are skipped in the same pass: there is nothing to re-drive, or the
 * writer may still be alive.
 *
 * Files are read newest-first (by mtime, then by name for a stable order), and
 * the first `resume` wins, so a run that crashed yesterday restarts from its
 * freshest unfinished state rather than its oldest one. When `sessionId` is
 * given, files recorded for other sessions are skipped: one chat's crash must
 * never seed another chat's run. A file with no recorded session (older
 * builds did not write one) is skipped when a session filter is active, for
 * the same reason.
 *
 * @param options - checkpoint directory (`dir`), clock and staleness overrides.
 * @returns the newest resumable checkpoint, or `undefined` when there is none.
 */
export async function findResumableCheckpoint(
  options: FindResumableOptions = {},
): Promise<ResumableCheckpoint | undefined> {
  const scanTimeoutMs = options.scanTimeoutMs
  // `0`/negative = "do not touch the filesystem at all": the fake-timer seam.
  // Non-finite falls back to the default rather than waiting forever.
  if (scanTimeoutMs !== undefined && !(scanTimeoutMs > 0)) return undefined
  const budgetMs = scanTimeoutMs === undefined || !Number.isFinite(scanTimeoutMs)
    ? RESUME_SCAN_TIMEOUT_MS
    : scanTimeoutMs
  return await scanWithBudget(options, budgetMs)
}

/**
 * The scan body, raced against a wall-clock budget.
 *
 * A real `setTimeout` (captured before any fake-timer install can replace it)
 * bounds the whole scan — listing, stats and reads alike. Fake-timer suites
 * cannot advance past an in-flight fs syscall, and a cold or crowded disk
 * must never hold a run's startup open: when the budget fires first the scan
 * answers "start fresh". The timer is `unref()`ed so an idle scan never keeps
 * the process alive, and it is cleared on every exit.
 */
async function scanWithBudget(
  options: FindResumableOptions,
  budgetMs: number,
): Promise<ResumableCheckpoint | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<'budget'>(resolve => {
    timer = setTimeout(() => resolve('budget'), budgetMs)
    const unref = (timer as { unref?: () => void }).unref
    if (typeof unref === 'function') unref.call(timer)
  })
  try {
    return await Promise.race([scanDirectory(options), budget.then(() => undefined)])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function scanDirectory(
  options: FindResumableOptions,
): Promise<ResumableCheckpoint | undefined> {
  const dir = checkpointDir(options)
  const lister = options.lister ?? realLister
  let names: string[]
  try {
    names = await lister.listCheckpointFiles(dir)
  } catch {
    return undefined
  }
  const files = names
    .filter(name => name.startsWith('checkpoint-') && name.endsWith('.json'))
    .map(name => join(dir, name))
  const withTime: { path: string, mtimeMs: number }[] = []
  for (const path of files) {
    const mtimeMs = await lister.checkpointMtimeMs(path)
    if (mtimeMs === undefined) continue
    withTime.push({ path, mtimeMs })
  }
  withTime.sort((left, right) =>
    right.mtimeMs - left.mtimeMs || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
  )
  const logger = options.logger
  const sessionId = options.sessionId
  for (const candidate of withTime) {
    let checkpoint: WorkflowCheckpoint
    try {
      checkpoint = await readCheckpoint(candidate.path)
    } catch (error) {
      logger?.warn?.(`checkpoint ${basename(candidate.path)} unreadable, skipped: ${redactError(error)}`)
      continue
    }
    if (sessionId !== undefined) {
      // A missing session on the file means "recorded before sessions were
      // recorded": with a session filter active it cannot be proven to belong
      // to this chat, so it stays skipped rather than seeding a stranger.
      if (checkpoint.run.sessionId !== sessionId) continue
    }
    const decision = resumeDecision(checkpoint, options)
    if (decision.action !== 'resume') continue
    logger?.info?.(
      `resuming from ${basename(candidate.path)} (${decision.unfinished.length} unfinished task(s)): ${decision.reason}`,
    )
    return { path: candidate.path, checkpoint, decision }
  }
  return undefined
}

/**
 * The carry-over context one run starts with, from a caller value and a resume.
 *
 * Precedence is the whole rule and it is deliberately one-way:
 *
 * - a caller's non-blank `carryover` wins — it names this round's context, and a
 *   checkpoint from an older crash must not overwrite it;
 * - otherwise a `resume` answer turns into three lines (its measured reason, the
 *   unfinished task ids, the seed) so the planner sees what was already done;
 * - no resume, or a resume with a blank seed, means `undefined` and the request
 *   payload stays byte-identical to a first round.
 *
 * Lives here rather than inline in `runWorkflow` so the second half of the item
 * ("出事后不会自己接着跑") is testable without a whole run harness: the scan
 * (`findResumableCheckpoint`) and this composition are the two halves that have
 * to agree.
 *
 * @param callerCarryover - context the caller already compiled, if any.
 * @param resumed - the checkpoint the startup scan answered with, if any.
 * @returns the carry-over text, or `undefined` when the run starts fresh.
 */
export function resumeCarryover(
  callerCarryover: string | undefined,
  resumed: ResumableCheckpoint | undefined,
): string | undefined {
  if (callerCarryover !== undefined && callerCarryover.trim() !== '') return callerCarryover
  if (resumed === undefined) return undefined
  const seed = resumed.decision.seed.trim()
  if (seed === '') return undefined
  return [
    resumed.decision.reason,
    `unfinished: ${resumed.decision.unfinished.join(', ')}`,
    `context: ${seed}`,
  ].join('\n')
}

/* ------------------------------------------------------------------ *
 * Recorder
 * ------------------------------------------------------------------ */

/** Minimal logger surface; matches `WorkflowLogger` in `src/run.ts` structurally. */
export interface CheckpointLogger {
  warn(message: string): void
  info?(message: string): void
}

/**
 * The observe-only side of a cordis context: `ctx.on(name, listener)` returning
 * a disposer function.
 *
 * Typed loosely on purpose. The concrete context types its events per plugin, and
 * naming them here would either duplicate that surface or force every caller to
 * cast; this module only ever needs "subscribe and get a disposer back", and it
 * contains every failure of that.
 */
export interface CheckpointEventSource {
  on?: unknown
}

/** The engine run object, reduced to the identity wiring needs. */
export interface CheckpointRunHandle {
  id?: unknown
  meta?: { name?: unknown }
}

/** Successful write. */
export interface CheckpointWriteSuccess {
  ok: true
  path: string
  bytes: number
  checksum: string
  /** `true` when this write was the run's terminal one. */
  terminal: boolean
}

/** Refused or failed write; the run continues regardless. */
export interface CheckpointWriteFailure {
  ok: false
  /** `io`/`too-large`/`invalid`/`integrity` from the writer, or a wiring reason. */
  reason: string
  detail?: string
  terminal: boolean
}

export type CheckpointWriteOutcome = CheckpointWriteSuccess | CheckpointWriteFailure

/** What the caller knows when a run ends. */
export interface CheckpointFinish {
  /** The report the run produced, when it produced one. */
  report?: WorkflowReport
  /** Engine stop reason, verbatim (`completed`/`cancelled`/`error`). */
  stopReason?: string
  /** Cause the caller already classified (unloaded/cancelled/…). */
  cause?: string
  /** True when the plugin unloaded underneath this run. */
  unloaded?: boolean
}

/** Host-observed child counts. Diagnostics only; never a schema field. */
export interface CheckpointObservedAgents {
  started: number
  failed: number
  cancelled: number
}

/** The recorder for one run. */
export interface RunCheckpointRecorder {
  /** Adopt the live engine run; starts the periodic timer. Idempotent. */
  adopt(run: CheckpointRunHandle): void
  /** Record that the caller's deadline fired (host fact, not a child's claim). */
  noteDeadline(reason?: string): void
  /** Record that the caller cancelled the run. */
  noteCancel(reason: string): void
  /** Write the terminal checkpoint, then release the timer and listeners. */
  finish(outcome?: CheckpointFinish): Promise<CheckpointWriteOutcome | undefined>
  /** Write the unload (`cancelled`) checkpoint, then release everything. */
  unload(reason: string): Promise<CheckpointWriteOutcome | undefined>
  /** One periodic write. Called by the timer; exposed so a test can drive it. */
  tick(): Promise<CheckpointWriteOutcome | undefined>
  /** The input the next write would use. Read-only snapshot for notes/tests. */
  snapshot(): CheckpointInput | undefined
  /** Subscribe/dispose bookkeeping, for tests and notes. */
  readonly stats: CheckpointRecorderStats
  /** Release the timer and every listener. Idempotent, never throws. */
  dispose(): void
}

/** Observable recorder state. */
export interface CheckpointRecorderStats {
  runId?: string
  /** Durable task identity latched at `adopt` (`run.meta.name`), redacted. */
  runName?: string
  disposed: boolean
  unloaded: boolean
  writes: number
  failures: number
  lastPath?: string
  /** Whether a periodic timer is currently armed. */
  timerArmed: boolean
  /** Engine listeners currently held. */
  listeners: number
  /**
   * `true` once the periodic loop gave up after
   * {@link CHECKPOINT_WIRING_LIMITS.maxConsecutiveFailures} consecutive failures.
   * Exposed so the give-up is a state a test can read, not only a log line.
   */
  writesStopped: boolean
  /** Child calls announced and not yet settled (what an unload checkpoint records). */
  inFlight: number
  agents: CheckpointObservedAgents
}

export interface CheckpointRecorderOptions {
  /** The cordis context, for `workflow/*` subscription only. */
  eventSource?: CheckpointEventSource
  logger?: CheckpointLogger
  /** The plugin instance's `ActiveState`; enables the unload registry. */
  state?: object
  /** Explicit directory (tests, e2e lanes); else the env/`$DSH_HOME` rule. */
  directory?: string
  /** Periodic interval in milliseconds; clamped to the wiring range. */
  intervalMs?: number
  /** The run's objective, already redacted by the caller. */
  objective: string
  sessionId?: string
  startedAtMs?: number
  /** Limits the run actually used; recorded as data, never enforced here. */
  limits?: Partial<CheckpointLimits> & { maxTotalAgents?: number }
  /** Host-side git facts, only when a caller can actually observe them. */
  git?: () => CheckpointGit | undefined
  /** Carry-over digest the run was given; recorded as `minContext.source: caller`. */
  minContextDigest?: string
  /** Clock seam. Defaults to `Date.now`. */
  now?: () => number
  /** Timer seam. Defaults to `setInterval`/`clearInterval`. */
  schedule?: (fn: () => void, ms: number) => unknown
  cancelSchedule?: (handle: unknown) => void
}

type EngineEventName = 'workflow/start' | 'workflow/phase' | 'workflow/log' | 'workflow/agent-start' | 'workflow/agent-end' | 'workflow/end'
type EngineSubscribe = (name: EngineEventName, listener: (...args: unknown[]) => void) => unknown

/**
 * One child call, as the engine's observe-only events announced it.
 *
 * This is the only body a run cut before any report can still have. A cancelled
 * or failed-early run used to leave `tasks: []` and `agents: []` behind — the
 * engine had plainly run children, and the file said nothing about them — so the
 * facts the events state are kept here and mapped to rows at write time.
 *
 * Every field is something an event stated: `phase`/`label` from `agent-start`
 * (the call's task name and its role word), `outcome` from `agent-end`, and the
 * clock for the two timestamps. `status` is the only derived field, and it never
 * says more than the events did — see {@link statusFromOutcome}.
 */
interface ObservedChildCall {
  /** 1-based call index within the run, as the engine assigns it. */
  seq: number
  /** Row id: the child's session id when the event carried one, else `agent-<seq>`. */
  id: string
  /** Task name: the call's task group header when its phase is one, else its label. */
  title: string
  /** The role the call's own label names; absent when the label names none. */
  role?: RoleName
  /** 1-based attempt the label names (`执行（尝试 2）` is 2). */
  attempt?: number
  status: CheckpointTaskStatus
  startedAtMs?: number
  endedAtMs?: number
}

/** Mutable recorder state (one per run). */
interface WiringState {
  runId?: string
  startedAtMs: number
  intervalMs: number
  disposed: boolean
  unloadedReason?: string
  unloadedAtMs?: number
  deadlineReason?: string
  cancelReason?: string
  runName?: string
  report?: WorkflowReport
  stopReason?: string
  cause?: string
  writes: number
  failures: number
  writesStopped: boolean
  lastPath?: string
  timer?: unknown
  /** The write currently in flight; the single-flight guard coalesces onto it. */
  inFlight?: Promise<CheckpointWriteOutcome>
  limitContractWarned: boolean
  listeners: (() => void)[]
  stages: Map<string, CheckpointStage[]>
  agents: Map<string, CheckpointObservedAgents>
  /** The child calls each run's events announced, in arrival order. */
  children: Map<string, ObservedChildCall[]>
  /**
   * Child calls the engine announced and has not settled yet, keyed by `seq`.
   *
   * Kept as rows rather than only as counters because a checkpoint written during
   * an unload is the last record of children that never settled: the counters say
   * "three started", the rows say "these two were still in `execute`, and this is
   * the child id a later reader can look up".
   */
  live: Map<number, { seq: number, childId?: string, lastStep: string, startedAtMs: number }>
}

/**
 * Create the checkpoint recorder for one run.
 *
 * The recorder subscribes to the engine's observe-only events immediately, but
 * attributes every row by the `info.id` in the event payload — so a record whose
 * run is not the adopted one is dropped instead of mis-filed, and no timer or
 * file exists until a run is actually adopted. When `state` is supplied the
 * recorder also joins that instance's unload registry, so
 * `disposeActiveState` can write one `cancelled` checkpoint per live run.
 * @param options - identity, location, limits and test seams.
 * @returns The recorder.
 */
export function createCheckpointRecorder(options: CheckpointRecorderOptions): RunCheckpointRecorder {
  const clock = options.now ?? (() => Date.now())
  const schedule = options.schedule ?? ((fn: () => void, ms: number): unknown => setInterval(fn, ms))
  const cancelSchedule = options.cancelSchedule ?? ((handle: unknown): void => { clearInterval(handle as ReturnType<typeof setInterval>) })
  const logger: CheckpointLogger = options.logger ?? { warn: () => {} }
  const directoryOptions: CheckpointDirectoryOptions = options.directory === undefined ? {} : { dir: options.directory }
  /**
   * Limits the run actually used, with every absent field *omitted*.
   *
   * Omitting matters (B15): the schema fills an absent field with the documented
   * contract default (3 concurrency / 1 retry / 12 tasks), while coercing a
   * missing value to 0 produced a row the contract refuses — so a recorder created
   * without limits failed every write it ever attempted.
   */
  const limits: Partial<CheckpointLimits> = {
    ...options.limits?.maxConcurrency === undefined ? {} : { maxConcurrency: nonNegative(options.limits.maxConcurrency) },
    ...options.limits?.maxRetries === undefined ? {} : { maxRetries: nonNegative(options.limits.maxRetries) },
    ...options.limits?.maxTasks === undefined ? {} : { maxTasks: Math.max(1, nonNegative(options.limits.maxTasks)) },
    ...options.limits?.timeoutMs === undefined ? {} : { timeoutMs: nonNegative(options.limits.timeoutMs) },
  }
  const intervalMs = boundedInterval(options.intervalMs ?? CHECKPOINT_WIRING_LIMITS.intervalMs.default)
  /**
   * The run's deadline, but only when the record can express it.
   *
   * 0 (unlimited) is *omitted*, never recorded: absent and 0 both name "no
   * deadline". A positive deadline is recorded as-is up to
   * `CHECKPOINT_LIMITS.msCeiling`, which accepts every timeoutMs the config
   * accepts; a value above it is *omitted*, never clamped, because writing a
   * smaller number would describe a bound the run never had. The same value
   * gates `time.deadlineAtMs` and the derived `watchdog.deadlineHit`, so an
   * unrepresentable deadline simply leaves those fields absent rather than
   * pretending the run has no deadline.
   */
  const recordableTimeoutMs = limits.timeoutMs !== undefined
    && limits.timeoutMs >= 1
    && limits.timeoutMs <= CHECKPOINT_LIMITS.msCeiling
    ? limits.timeoutMs
    : undefined
  const recordedLimits: Partial<CheckpointLimits> = {
    ...limits,
    ...recordableTimeoutMs === undefined ? {} : { timeoutMs: recordableTimeoutMs },
  }
  if (recordableTimeoutMs === undefined) delete recordedLimits.timeoutMs

  const wiring: WiringState = {
    startedAtMs: options.startedAtMs ?? clock(),
    intervalMs,
    disposed: false,
    writes: 0,
    failures: 0,
    writesStopped: false,
    limitContractWarned: false,
    listeners: [],
    stages: new Map(),
    agents: new Map(),
    children: new Map(),
    live: new Map(),
  }

  /**
   * The run-path half of the limit contract (B07): the numbers this run is about
   * to record are compared against the documented engine-hook envelope
   * ({@link ENGINE_HOOK_LIMITS}) and a violation is surfaced once, visibly, through
   * the run's own logger. The recorder cannot refuse the run — the config schema
   * caps the same two numbers, so this fires only for a caller that bypasses the
   * config layer (a programmatic `createCheckpointRecorder`), which is exactly the
   * case where a silent divergence would otherwise go unnoticed. The write itself
   * is then refused by `buildCheckpoint`.
   */
  const warnLimitContract = (runId: string): void => {
    if (wiring.limitContractWarned) return
    wiring.limitContractWarned = true
    const violations = limitContractViolations({
      maxConcurrency: limits.maxConcurrency ?? ENGINE_HOOK_LIMITS.maxConcurrency.default,
      maxRetries: limits.maxRetries ?? ENGINE_HOOK_LIMITS.maxRetries.default,
    })
    if (violations.length === 0) return
    logger.warn(
      `checkpoint limits for run ${runId} are outside the documented engine-hook contract ` +
      `(AGENTS.md, D-003): ${violations.join('; ')}`,
    )
  }

  /* ---------------------------------------------------------- helpers -- */

  const deadlineAtMs = (): number | undefined => {
    if (recordableTimeoutMs === undefined) return undefined
    return wiring.startedAtMs + recordableTimeoutMs
  }

  const runIdOf = (info: unknown): string => {
    if (typeof info !== 'object' || info === null) return ''
    const raw = (info as { id?: unknown }).id
    if (typeof raw === 'string') return raw.trim()
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
    return ''
  }

  /**
   * The run's durable task label, redacted and bounded on capture.
   *
   * `meta.name` is caller-supplied text that reaches `stats` (a log/diagnostic
   * surface) as well as the checkpoint file, so it is redacted here rather than
   * only at write time; the schema redacts again on its own.
   */
  const runNameOf = (run: CheckpointRunHandle): string | undefined => {
    const raw = run?.meta?.name
    if (typeof raw !== 'string') return undefined
    const trimmed = redactSecrets(raw.trim()).slice(0, CHECKPOINT_LIMITS.titleChars).trim()
    return trimmed === '' ? undefined : trimmed
  }

  /** Stage rows for one run, created on demand and bounded. */
  const stagesOf = (runId: string): CheckpointStage[] => {
    const existing = wiring.stages.get(runId)
    if (existing !== undefined) return existing
    if (wiring.stages.size >= CHECKPOINT_WIRING_LIMITS.rememberedRuns) {
      // Drop the oldest remembered run rather than grow without bound; the
      // adopted run is always re-creatable from its own next event.
      const oldest = wiring.stages.keys().next()
      if (!oldest.done) wiring.stages.delete(oldest.value)
    }
    const created: CheckpointStage[] = []
    wiring.stages.set(runId, created)
    return created
  }

  /** Child counters for one run, bounded the same way. */
  const agentsOf = (runId: string): CheckpointObservedAgents => {
    const existing = wiring.agents.get(runId)
    if (existing !== undefined) return existing
    const created: CheckpointObservedAgents = { started: 0, failed: 0, cancelled: 0 }
    if (wiring.agents.size >= CHECKPOINT_WIRING_LIMITS.rememberedRuns) {
      const oldest = wiring.agents.keys().next()
      if (!oldest.done) wiring.agents.delete(oldest.value)
    }
    wiring.agents.set(runId, created)
    return created
  }

  /** Child calls for one run, created on demand and bounded like the rest. */
  const childrenOf = (runId: string): ObservedChildCall[] => {
    const existing = wiring.children.get(runId)
    if (existing !== undefined) return existing
    const created: ObservedChildCall[] = []
    if (wiring.children.size >= CHECKPOINT_WIRING_LIMITS.rememberedRuns) {
      const oldest = wiring.children.keys().next()
      if (!oldest.done) wiring.children.delete(oldest.value)
    }
    wiring.children.set(runId, created)
    return created
  }

  /** Close the last open stage row: the script moved on or the run settled. */
  const closeOpenStage = (runId: string, status: CheckpointStatus, at: number, error?: string): void => {
    const rows = wiring.stages.get(runId)
    if (rows === undefined || rows.length === 0) return
    const last = rows[rows.length - 1]
    if (last === undefined || last.endedAtMs !== undefined) return
    last.endedAtMs = at
    last.status = status
    if (error !== undefined) last.error = error
  }

  /* ------------------------------------------------------------ events -- */

  const notePhase = (info: unknown, title: unknown): void => {
    const runId = runIdOf(info)
    if (runId === '') return
    if (wiring.runId !== undefined && runId !== wiring.runId) return
    const phase = phaseFromTitle(title)
    if (phase === undefined) return
    const rows = stagesOf(runId)
    if (rows.some(row => row.phase === phase)) return
    const at = clock()
    closeOpenStage(runId, 'completed', at)
    if (rows.length >= CHECKPOINT_LIMITS.maxStages) return
    rows.push({ phase, status: 'running', startedAtMs: at })
  }

  /**
   * Observe one `agent-start` (settled: false) or `agent-end` (settled: true).
   *
   * Two jobs, kept apart on purpose: the counters are diagnostics that only ever
   * grew, and the call rows are the checkpoint's body for a run that will never
   * produce a report. The row is keyed by the engine's own `seq`, so an end whose
   * start arrived before this recorder existed still lands as one row instead of
   * being dropped — the run happened either way.
   * @param info - the run info payload (`info.id` attributes the event).
   * @param settled - whether this is the call's settlement.
   * @param payload - the `WorkflowAgentInfo` / `WorkflowAgentEndInfo` member.
   */
  const noteAgent = (info: unknown, settled: boolean, payload?: unknown): void => {
    const runId = runIdOf(info)
    if (runId === '') return
    if (wiring.runId !== undefined && runId !== wiring.runId) return
    const counters = agentsOf(runId)
    const member = agentPayloadOf(payload)
    const outcome = member['outcome']
    const seq = payloadSeq(member)
    const at = clock()
    if (settled) {
      if (outcome === 'failed') counters.failed += 1
      else if (outcome === 'cancelled') counters.cancelled += 1
      // A settled call is not in flight any more: a checkpoint written while the
      // run is being torn down must not list a child that already reported.
      if (seq !== undefined) wiring.live.delete(seq)
    } else {
      counters.started += 1
      // The last step the host observed this call doing, kept as a row because a
      // checkpoint written during an unload is the last record of a child that
      // never settled — the counters cannot name it, the row can.
      if (seq !== undefined && counters.started <= CHECKPOINT_LIMITS.maxAgents) {
        const phase = payloadText(member, 'phase') ?? ''
        const label = payloadText(member, 'label') ?? ''
        const childId = payloadText(member, 'childId')
        wiring.live.set(seq, {
          seq,
          ...childId === undefined ? {} : { childId },
          lastStep: phase !== '' ? phase : label !== '' ? label : 'child call in flight',
          startedAtMs: at,
        })
      }
    }

    const rows = childrenOf(runId)
    const known = seq === undefined ? undefined : rows.find(row => row.seq === seq)
    if (known !== undefined) {
      // A repeated `agent-start` for one call is not a second call: it only keeps
      // the row it already has.
      if (!settled) return
      known.status = statusFromOutcome(outcome)
      known.endedAtMs = at
      return
    }
    if (rows.length >= CHECKPOINT_WIRING_LIMITS.observedCalls) return
    rows.push(observedCallOf(seq ?? rows.length + 1, member, settled, at))
  }

  const noteEnd = (info: unknown, result: unknown): void => {
    const runId = runIdOf(info)
    if (runId === '') return
    if (wiring.runId !== undefined && runId !== wiring.runId) return
    const stopReason = typeof result === 'object' && result !== null ? (result as { stopReason?: unknown }).stopReason : undefined
    const error = typeof result === 'object' && result !== null ? (result as { error?: unknown }).error : undefined
    if (stopReason === 'cancelled' && wiring.cancelReason === undefined) {
      wiring.cancelReason = 'the engine reported the run cancelled'
    }
    const status: CheckpointStatus = stopReason === 'completed' ? 'completed' : stopReason === 'cancelled' ? 'cancelled' : 'failed'
    closeOpenStage(runId, status, clock(), typeof error === 'string' && error !== '' ? error : undefined)
  }

  const subscribe = (): void => {
    const source = options.eventSource
    const on = source === undefined ? undefined : (source as { on?: unknown }).on
    if (typeof on !== 'function') return
    const bind = (name: EngineEventName, listener: (...args: unknown[]) => void): void => {
      try {
        const off = (on as EngineSubscribe).call(source, name, listener)
        if (typeof off === 'function') wiring.listeners.push(off as () => void)
      } catch (error) {
        logger.warn(`checkpoint wiring could not subscribe to ${name}: ${redactError(error)}`)
      }
    }
    bind('workflow/phase', (info, title) => { notePhase(info, title) })
    bind('workflow/agent-start', (info, member) => { noteAgent(info, false, member) })
    bind('workflow/agent-end', (info, member) => { noteAgent(info, true, member) })
    bind('workflow/end', (info, result) => { noteEnd(info, result) })
  }

  /* ------------------------------------------------------------ writes -- */

  /**
   * The status the run itself already reached, or `undefined` while it is open.
   *
   * Checked before the unload marker on purpose. Since the disposer drains
   * in-flight work before it cancels (`src/run.ts`), a run can reach its
   * settlement while the unload is still waiting — and a checkpoint that stamped
   * `cancelled` over that report would describe work as lost that the user just
   * watched finish. An unload only decides the status of a run that had not
   * settled yet.
   */
  const settledStatus = (): CheckpointStatus | undefined => {
    if (wiring.report !== undefined) return reportStatus(wiring.report.status)
    if (wiring.stopReason === 'cancelled') return 'cancelled'
    // A settled stop with no validated report is not a success: the engine may
    // have returned a value this plugin refused (`report-invalid`), and a file
    // that read "completed" there would contradict the report the user saw.
    if (wiring.stopReason !== undefined) return 'failed'
    return undefined
  }

  const statusNow = (at: number): CheckpointStatus => {
    const settled = settledStatus()
    if (settled !== undefined) return settled
    if (wiring.unloadedReason !== undefined) return 'cancelled'
    const deadline = deadlineAtMs()
    // A run past its own deadline without a settled report is a failure by the
    // caller's own bound, not a "running" run: the deadline is a host fact.
    if (deadline !== undefined && at >= deadline) return 'failed'
    return 'running'
  }

  const watchdogNow = (at: number): CheckpointWatchdog => {
    const deadline = deadlineAtMs()
    const deadlineHit = wiring.deadlineReason !== undefined || (deadline !== undefined && at >= deadline)
    // A run that settled inside the unload window was not cancelled by it, so the
    // unload reason is not attached to it either.
    const settled = settledStatus()
    const unloadedUnsettled = wiring.unloadedReason !== undefined && settled === undefined
    const cancelReason = unloadedUnsettled
      ? wiring.unloadedReason
      : settled === undefined
        ? wiring.cancelReason ?? wiring.deadlineReason
        : settled === 'cancelled' ? wiring.cancelReason ?? wiring.unloadedReason ?? wiring.deadlineReason : undefined
    return {
      deadlineHit,
      cancelled: unloadedUnsettled || wiring.cancelReason !== undefined || settled === 'cancelled',
      ...recordableTimeoutMs === undefined ? {} : { deadlineMs: recordableTimeoutMs },
      ...cancelReason === undefined ? {} : { cancelReason },
    }
  }

  /**
   * Rows for the child calls still running, in call order.
   *
   * Read straight off the live map so the terminal (unload) write describes the
   * children it is about to cut, not the ones already settled. Empty means "no
   * child was in flight", which is the ordinary shape of a completed run.
   */
  const liveInFlight = (): { inFlight: NonNullable<CheckpointInput['inFlight']> } => {
    const rows = [...wiring.live.values()]
      .sort((left, right) => left.seq - right.seq)
      .slice(0, CHECKPOINT_LIMITS.maxAgents)
      .map(row => ({
        seq: row.seq,
        ...row.childId === undefined ? {} : { childId: row.childId },
        lastStep: row.lastStep,
        startedAtMs: row.startedAtMs,
      }))
    return rows.length === 0 ? { inFlight: [] } : { inFlight: rows }
  }

  const snapshot = (): CheckpointInput | undefined => {
    const runId = wiring.runId
    if (runId === undefined) return undefined
    const at = clock()
    const report = wiring.report
    const stages = (wiring.stages.get(runId) ?? []).map(row => ({ ...row }))
    const deadline = deadlineAtMs()
    const git = options.git?.()
    const input: CheckpointInput = {
      run: {
        runId,
        objective: options.objective,
        status: statusNow(at),
        ...options.sessionId === undefined ? {} : { sessionId: options.sessionId },
        ...wiring.runName === undefined ? {} : { name: wiring.runName },
        ...wiring.cause === undefined && wiring.unloadedReason === undefined
          ? {}
          : { cause: wiring.unloadedReason ?? wiring.cause ?? '' },
      },
      // Before a report exists the plan is genuinely unknown: the planner runs
      // inside the script, so the host has nothing to copy. Saying so beats
      // echoing the requested objective back as if it were a plan.
      plan: report === undefined
        ? { source: 'unavailable', tasks: [] }
        : planFromReport(report),
      // `stages` and `agents` are always present, never `undefined` (B12): a
      // consumer of `snapshot()` must be able to read both as arrays without
      // knowing whether a report exists yet, and "no child call was observed" is
      // a fact — an empty array — not an absence.
      stages,
      // A report's route trail is the richer record (role, route, failure class),
      // so it wins outright; without one, the calls the engine announced are what
      // actually ran, and they are recorded as announced rather than dropped.
      agents: report === undefined
        ? agentsFromObserved(wiring.children.get(runId) ?? [])
        : agentsFromReport(report),
      // Calls still running at write time, which the settled rows above cannot
      // describe: a resume needs to know what the unload cut, not only what it
      // already finished.
      ...liveInFlight(),
      time: {
        startedAtMs: wiring.startedAtMs,
        updatedAtMs: at,
        // `durationMs` is omitted, never clamped, when it exceeds the schema's
        // ceiling: a clamped number would be a duration this run did not have.
        // The ceiling is `msCeiling` (every duration the reader accepts), not
        // `countCeiling` (a row-count bound): a run past 16m40s still ran that
        // long, and the checkpoint must say so.
        ...at - wiring.startedAtMs >= 0 && at - wiring.startedAtMs <= CHECKPOINT_LIMITS.msCeiling
          ? { durationMs: at - wiring.startedAtMs }
          : {},
        ...deadline === undefined ? {} : { deadlineAtMs: deadline },
      },
      limits: recordedLimits,
      watchdog: watchdogNow(at),
      ...git === undefined ? {} : { git },
    }
    if (report !== undefined) {
      input.tasks = tasksFromReport(report)
      // Evidence is a verifier's confirmed claim, and no host-side event carries
      // one: without a report there is nothing honest to put here.
      input.evidence = evidenceFromReport(report)
    } else {
      // No report: the calls the engine announced are the only task facts the
      // host holds, and a file that listed none of them described a run with no
      // work in it. Omitted entirely when nothing was observed, so "no child call
      // happened" stays distinguishable from "children ran and were lost".
      const observed = tasksFromObserved(wiring.children.get(runId) ?? [])
      if (observed.length > 0) input.tasks = observed
    }
    if (options.minContextDigest !== undefined && options.minContextDigest.trim() !== '') {
      input.minContext = { objective: options.objective, digest: options.minContextDigest }
    }
    return input
  }

  const writeOnce = async (terminal: boolean): Promise<CheckpointWriteOutcome> => {
    const runId = wiring.runId
    const input = snapshot()
    if (runId === undefined || input === undefined) {
      return { ok: false, reason: 'not-adopted', detail: 'no engine run has been adopted, so there is nothing to describe', terminal }
    }
    const file = checkpointFile(runId, directoryOptions)
    try {
      const result = await writeCheckpoint(file, input)
      wiring.writes += 1
      wiring.failures = 0
      wiring.lastPath = result.path
      return { ok: true, path: result.path, bytes: result.bytes, checksum: result.checksum, terminal }
    } catch (error) {
      wiring.failures += 1
      const detail = redactError(error)
      const reason = typeof (error as { reason?: unknown }).reason === 'string' ? String((error as { reason?: unknown }).reason) : 'io'
      logger.warn(`checkpoint write failed for run ${runId} (${reason}): ${detail}`)
      return { ok: false, reason, detail, terminal }
    }
  }

  /**
   * Single flight (B14): at most one write to a run's file is in progress.
   *
   * The periodic timer, an explicit `tick()` and `finish()`/`unload()` can all
   * land in the same instant, and two overlapping writes race on the same
   * temporary file and on the `writes`/`failures` counters — a `finish()` that
   * interleaved with a slow tick could even be the write that fails to rename.
   * A concurrent non-terminal write therefore coalesces onto the one in flight
   * (its outcome is the same file), and a concurrent terminal write queues behind
   * it, because the terminal file must be the last thing written.
   */
  const write = async (terminal: boolean): Promise<CheckpointWriteOutcome> => {
    const running = wiring.inFlight
    if (running !== undefined) {
      if (!terminal) return running
      await running.catch(() => undefined)
      if (wiring.inFlight !== undefined) {
        // A newer write started while this one queued: join that flight instead of
        // stacking a third. The terminal write then follows it in its own turn.
        await wiring.inFlight.catch(() => undefined)
      }
    }
    const started = writeOnce(terminal)
    const guarded = started.finally(() => {
      // `delete` rather than an assignment of `undefined`: under
      // `exactOptionalPropertyTypes` an optional field is absent or present, not
      // present-and-undefined, and "no write in flight" is genuinely absence.
      if (wiring.inFlight === guarded) delete wiring.inFlight
    })
    wiring.inFlight = guarded
    return guarded
  }

  /* ------------------------------------------------------------ timers -- */

  const armTimer = (): void => {
    if (wiring.disposed || wiring.timer !== undefined) return
    try {
      const handle = schedule(() => { void tick() }, wiring.intervalMs)
      // A checkpoint must never be the reason a process stays alive.
      const unref = (handle as { unref?: () => void } | null)?.unref
      if (typeof unref === 'function') unref.call(handle)
      wiring.timer = handle
    } catch (error) {
      logger.warn(`checkpoint timer could not start: ${redactError(error)}`)
    }
  }

  const disarmTimer = (): void => {
    if (wiring.timer === undefined) return
    const handle = wiring.timer
    wiring.timer = undefined
    try {
      cancelSchedule(handle)
    } catch (error) {
      logger.warn(`checkpoint timer could not be cleared: ${redactError(error)}`)
    }
  }

  const release = (): void => {
    if (wiring.disposed) return
    wiring.disposed = true
    disarmTimer()
    for (const off of wiring.listeners) {
      try {
        off()
      } catch {
        // A disposer that throws is already gone; there is nothing to repair.
      }
    }
    wiring.listeners = []
    wiring.live.clear()
    if (options.state !== undefined) unregisterCheckpointRecorder(options.state, recorder)
  }

  /* ----------------------------------------------------------- actions -- */

  const tick = async (): Promise<CheckpointWriteOutcome | undefined> => {
    if (wiring.disposed || wiring.unloadedReason !== undefined) return undefined
    if (wiring.runId === undefined) return undefined
    if (wiring.failures >= CHECKPOINT_WIRING_LIMITS.maxConsecutiveFailures) {
      // The loop gives up (B15) — and says so exactly once. Without this line the
      // only trace of "checkpointing is off for this run" was three earlier
      // per-write warnings and then silence, which reads like a healthy run.
      if (!wiring.writesStopped) {
        wiring.writesStopped = true
        logger.warn(
          `checkpoint writes for run ${wiring.runId} stopped after ${wiring.failures} consecutive failures; ` +
          'the run continues without further checkpoints',
        )
      }
      return undefined
    }
    return write(false)
  }

  const adopt = (run: CheckpointRunHandle): void => {
    if (wiring.disposed) return
    const id = typeof run?.id === 'string' || typeof run?.id === 'number' ? String(run.id).trim() : ''
    if (id === '') {
      // No identity means no filename: dropping the recorder is the honest
      // outcome, and it is silent because nothing was promised yet.
      disarmTimer()
      return
    }
    if (wiring.runId !== undefined && wiring.runId !== id) return
    wiring.runId = id
    // Durable task identity (B12): the engine's `meta.name` is the label
    // `src/run.ts` also gives the memory archiver, and it is the only thing in the
    // run handle that still means something after the engine-generated `id` is
    // gone. Captured here so it reaches both the file (`run.name`) and `stats`; it
    // is free text, so it is redacted before it can reach either.
    const runName = runNameOf(run)
    if (runName !== undefined) wiring.runName = runName
    warnLimitContract(id)
    if (options.state !== undefined) registerCheckpointRecorder(options.state, recorder)
    armTimer()
  }

  const finish = async (outcome: CheckpointFinish = {}): Promise<CheckpointWriteOutcome | undefined> => {
    if (wiring.disposed) return undefined
    if (outcome.report !== undefined) wiring.report = outcome.report
    if (outcome.stopReason !== undefined) wiring.stopReason = outcome.stopReason
    if (outcome.cause !== undefined) wiring.cause = outcome.cause
    if (outcome.unloaded === true && wiring.unloadedReason === undefined) {
      wiring.unloadedReason = outcome.cause ?? 'the plugin was unloaded while the run was in flight'
      wiring.unloadedAtMs = clock()
    }
    disarmTimer()
    if (wiring.runId === undefined) {
      // Nothing was ever adopted: there is no checkpoint to write, and a file
      // per attempted run would be noise.
      release()
      return undefined
    }
    const written = await write(true)
    release()
    return written
  }

  const unload = async (reason: string): Promise<CheckpointWriteOutcome | undefined> => {
    if (wiring.disposed) return undefined
    if (wiring.unloadedReason === undefined) {
      wiring.unloadedReason = reason === '' ? 'the plugin was unloaded while the run was in flight' : reason
      wiring.unloadedAtMs = clock()
    }
    disarmTimer()
    if (wiring.runId === undefined) {
      release()
      return undefined
    }
    const written = await writeWithin(write(true), CHECKPOINT_WIRING_LIMITS.unloadWriteTimeoutMs, logger)
    release()
    return written
  }

  const recorder: RunCheckpointRecorder = {
    adopt,
    noteDeadline: (reason?: string) => {
      if (wiring.deadlineReason !== undefined) return
      wiring.deadlineReason = reason === undefined || reason === '' ? 'the run passed its own deadline' : reason
    },
    noteCancel: (reason: string) => {
      if (wiring.cancelReason !== undefined) return
      wiring.cancelReason = reason === '' ? 'the run was cancelled by its caller' : reason
    },
    finish,
    unload,
    tick,
    snapshot,
    dispose: release,
    get stats(): CheckpointRecorderStats {
      const counters = wiring.runId === undefined ? undefined : wiring.agents.get(wiring.runId)
      return {
        ...wiring.runId === undefined ? {} : { runId: wiring.runId },
        ...wiring.runName === undefined ? {} : { runName: wiring.runName },
        disposed: wiring.disposed,
        unloaded: wiring.unloadedReason !== undefined,
        writes: wiring.writes,
        failures: wiring.failures,
        ...wiring.lastPath === undefined ? {} : { lastPath: wiring.lastPath },
        timerArmed: wiring.timer !== undefined,
        listeners: wiring.listeners.length,
        writesStopped: wiring.writesStopped,
        inFlight: wiring.live.size,
        agents: counters === undefined ? { started: 0, failed: 0, cancelled: 0 } : { ...counters },
      }
    },
  }

  subscribe()
  return recorder
}

/* ------------------------------------------------------------------ *
 * Unload registry
 * ------------------------------------------------------------------ */

/**
 * Recorders registered against one plugin instance, keyed by its `ActiveState`.
 *
 * A `WeakMap` on purpose: the plugin instance is the owner, and an unload that
 * forgets to deregister must not keep a state object (and through it, listeners)
 * alive. Registration happens at `adopt()` — a recorder that never saw a run
 * never joins, so an idle plugin instance holds nothing.
 */
const UNLOAD_REGISTRY = new WeakMap<object, Set<RunCheckpointRecorder>>()

/** Join one instance's unload registry. Idempotent. */
export function registerCheckpointRecorder(state: object, recorder: RunCheckpointRecorder): void {
  const existing = UNLOAD_REGISTRY.get(state)
  if (existing === undefined) {
    UNLOAD_REGISTRY.set(state, new Set([recorder]))
    return
  }
  existing.add(recorder)
}

/** Leave one instance's unload registry. */
export function unregisterCheckpointRecorder(state: object, recorder: RunCheckpointRecorder): void {
  const existing = UNLOAD_REGISTRY.get(state)
  if (existing === undefined) return
  existing.delete(recorder)
  if (existing.size === 0) UNLOAD_REGISTRY.delete(state)
}

/** How many recorders are currently registered for an instance (tests/diagnostics). */
export function registeredCheckpointRecorders(state: object): number {
  return UNLOAD_REGISTRY.get(state)?.size ?? 0
}

/**
 * Write one terminal `cancelled` checkpoint per live run, then release every
 * recorder for this plugin instance.
 *
 * Called from `disposeActiveState` *before* the runs are cancelled, because after
 * the abort there is no longer a live run to describe. Never throws: an
 * unwritable checkpoint must not be able to stop an unload, and the timeout keeps
 * a slow disk from holding the disposer open.
 * @param state - the plugin instance's `ActiveState`.
 * @param cause - how the unload happened, recorded as `run.cause` and `watchdog.cancelReason`.
 * @param logger - optional diagnostics sink.
 * @returns How many recorders were unloaded (0 for an idle plugin).
 */
export async function unloadCheckpointRecorders(
  state: object,
  cause: string,
  logger?: CheckpointLogger,
): Promise<number> {
  const registered = UNLOAD_REGISTRY.get(state)
  if (registered === undefined || registered.size === 0) return 0
  const recorders = [...registered]
  UNLOAD_REGISTRY.delete(state)
  let written = 0
  for (const recorder of recorders) {
    try {
      const outcome = await recorder.unload(cause)
      if (outcome !== undefined && outcome.ok) written += 1
    } catch (error) {
      logger?.warn(`checkpoint unload failed: ${redactError(error)}`)
    }
  }
  return written
}

/* ------------------------------------------------------------------ *
 * Report → checkpoint mapping
 * ------------------------------------------------------------------ */

/** Normalize a report status into the checkpoint vocabulary. */
function reportStatus(status: unknown): CheckpointStatus {
  return status === 'completed' || status === 'partial' || status === 'failed' ? status : 'failed'
}

/** The run's plan, echoed from the report the run actually produced. */
function planFromReport(report: WorkflowReport): CheckpointInput['plan'] {
  const source = report.plan?.source
  const normalized: CheckpointInput['plan']['source'] =
    source === 'caller' || source === 'planner' || source === 'fallback' ? source : 'unavailable'
  return {
    source: normalized,
    tasks: report.tasks.slice(0, CHECKPOINT_LIMITS.maxTasks).map(task => ({
      id: task.id,
      title: task.title,
      writesPaths: task.writesPaths,
    })),
  }
}

/** Task rows from the report's own per-task result. */
function tasksFromReport(report: WorkflowReport): NonNullable<CheckpointInput['tasks']> {
  return report.tasks.slice(0, CHECKPOINT_LIMITS.maxTasks).map(task => {
    const status: CheckpointTaskStatus = task.status === 'verified' ? 'verified' : 'failed'
    return {
      id: task.id,
      title: task.title,
      status,
      attempts: Array.isArray(task.attempts) ? task.attempts.length : 0,
      ...task.error === undefined || task.error === '' ? {} : { error: task.error },
    }
  })
}

/**
 * Agent rows from the report's route trail — the only host-side record of child
 * calls that carries a real role.
 *
 * A row with a role outside {@link HOST_ROLES} is dropped: wiring must never
 * invent a sixth role, and a report is untrusted input like any other.
 */
function agentsFromReport(report: WorkflowReport): NonNullable<CheckpointInput['agents']> {
  const rows: NonNullable<CheckpointInput['agents']> = []
  for (const entry of report.routes.slice(0, CHECKPOINT_LIMITS.maxAgents)) {
    if (!isHostRole(entry.role)) continue
    rows.push({
      role: entry.role,
      outcome: entry.outcome === 'ok' ? 'ok' : 'failed',
      ...entry.attempt === undefined ? {} : { attempt: entry.attempt },
      ...entry.route === undefined || entry.route === '' ? {} : { route: entry.route },
      ...entry.failureClass === undefined ? {} : { failureClass: entry.failureClass },
      ...entry.reason === undefined || entry.reason === '' ? {} : { reason: entry.reason },
    })
  }
  return rows
}

/** Evidence rows from the report's confirmed evidence. */
function evidenceFromReport(report: WorkflowReport): NonNullable<CheckpointInput['evidence']> {
  return report.confirmed.slice(0, CHECKPOINT_LIMITS.maxEvidence).map(row => ({
    taskId: row.taskId,
    criterion: row.criterion,
    claim: row.evidence,
  }))
}

/* ------------------------------------------------------------------ *
 * Observed calls → checkpoint rows
 * ------------------------------------------------------------------ */

/** One `workflow/agent-*` member payload, read as a plain record. */
type AgentPayload = Record<string, unknown>

function agentPayloadOf(value: unknown): AgentPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as AgentPayload : {}
}

/** A trimmed, non-empty string field of a payload, or nothing. */
function payloadText(payload: AgentPayload, key: string): string | undefined {
  const raw = payload[key]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/** The 1-based call index the engine assigns, when the payload carries one. */
function payloadSeq(payload: AgentPayload): number | undefined {
  const raw = payload['seq']
  const value = typeof raw === 'string' ? Number(raw) : raw
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

/**
 * A child call's settlement as a task-row status.
 *
 * `completed` deliberately does **not** become `verified`. The engine's
 * `completed` says one call returned; verification is a separate verdict that
 * only the report carries. Recording `verified` here would claim a proof nobody
 * produced — and, worse than a wording problem, `resumeDecision` drops every
 * verified task from `unfinished`, so a resumed run would skip work that was
 * never checked. A row no report could confirm therefore stays `running`: it is
 * the honest row for "called, unverified", and it keeps the task on the re-drive
 * list.
 * @param outcome - the `workflow/agent-end` outcome, whatever it is.
 * @returns the task-row status the outcome supports.
 */
function statusFromOutcome(outcome: unknown): CheckpointTaskStatus {
  if (outcome === 'failed') return 'failed'
  if (outcome === 'cancelled') return 'cancelled'
  return 'running'
}

/**
 * The task name one child call names.
 *
 * The engine's `phase` is the informative half: a worker or verifier call inside a
 * plan task runs under that task's group header (`任务 1 · 标题`), while for the
 * fixed stages the phase is just the stage (`执行`) and the label carries the
 * role. So a phase that is not a bare stage title wins, and the label is the
 * fallback for a call that declared no task of its own.
 * @param payload - the member payload.
 * @param seq - the call's 1-based index, used only for the last-resort name.
 * @returns the task name to record.
 */
function observedCallTitle(payload: AgentPayload, seq: number): string {
  const phase = payloadText(payload, 'phase')
  if (phase !== undefined && phaseFromTitle(phase) === undefined) return phase
  return payloadText(payload, 'label') ?? phase ?? `agent ${seq}`
}

/**
 * The role and attempt a member label names, or nothing.
 *
 * `parseMemberLabel` is the plugin's own inverse of `memberLabel`, so this reads
 * back only labels the plugin wrote: a call whose label lost its role word stays
 * role-less rather than being guessed at, and no sixth role is ever invented.
 * Both copy languages are tried because a run's labels follow its language.
 * @param payload - the member payload.
 * @returns the named role and attempt, or undefined.
 */
function observedCallRole(payload: AgentPayload): { role: RoleName, attempt: number } | undefined {
  return parseMemberLabel(payloadText(payload, 'label'))
    ?? parseMemberLabel(payloadText(payload, 'label'), 'en')
}

/**
 * Build one observed-call row from an `agent-start`/`agent-end` member payload.
 * @param seq - the call's 1-based index.
 * @param payload - the member payload.
 * @param settled - whether this row comes from the settlement event.
 * @param at - the clock reading for this event.
 * @returns the row to keep.
 */
function observedCallOf(seq: number, payload: AgentPayload, settled: boolean, at: number): ObservedChildCall {
  const role = observedCallRole(payload)
  const attempt = role === undefined ? undefined : Math.min(CHECKPOINT_LIMITS.attemptsCeiling, Math.max(1, role.attempt))
  return {
    seq,
    id: payloadText(payload, 'childId') ?? `agent-${seq}`,
    title: observedCallTitle(payload, seq),
    ...role === undefined ? {} : { role: role.role },
    ...attempt === undefined ? {} : { attempt },
    status: settled ? statusFromOutcome(payload['outcome']) : 'running',
    // Only the event that was actually seen contributes a timestamp: an end whose
    // start predates this recorder records when it ended, never a start time (and
    // therefore never a duration) it did not witness.
    ...settled ? { endedAtMs: at } : { startedAtMs: at },
  }
}

/**
 * Task rows from the calls the run actually made.
 *
 * The id is the child's session id (so a row can be traced back to the call that
 * produced it) and the attempt is the one the call's label declares, which is the
 * only attempt count the host can state without the report.
 * @param calls - observed calls, in arrival order.
 * @returns checkpoint task rows, bounded by the schema's task-row limit.
 */
function tasksFromObserved(calls: readonly ObservedChildCall[]): NonNullable<CheckpointInput['tasks']> {
  return calls.slice(0, CHECKPOINT_LIMITS.maxTasks).map(call => ({
    id: call.id,
    title: call.title,
    status: call.status,
    attempts: call.attempt ?? 1,
  }))
}

/**
 * Agent rows from the calls the run actually made.
 *
 * Only a settled call has an outcome to record, and only a role the label named
 * may be recorded: the same rule the report path applies, for the same reason.
 * The call's identity lives on its task row; this row carries the two things a
 * reader of `agents` wants — which role ran, and how it ended.
 * @param calls - observed calls, in arrival order.
 * @returns checkpoint agent rows, bounded by the schema's agent-row limit.
 */
function agentsFromObserved(calls: readonly ObservedChildCall[]): NonNullable<CheckpointInput['agents']> {
  const rows: NonNullable<CheckpointInput['agents']> = []
  for (const call of calls) {
    if (call.endedAtMs === undefined) continue
    if (call.role === undefined || !isHostRole(call.role)) continue
    const startedAtMs = call.startedAtMs
    rows.push({
      role: call.role,
      // A cancelled call is not a clean result, and `agents` has only two words
      // for a settlement.
      outcome: call.status === 'failed' || call.status === 'cancelled' ? 'failed' : 'ok',
      ...call.attempt === undefined ? {} : { attempt: call.attempt },
      ...startedAtMs === undefined ? {} : { startedAtMs },
      ...startedAtMs === undefined ? {} : { durationMs: Math.max(0, call.endedAtMs - startedAtMs) },
    })
    if (rows.length >= CHECKPOINT_LIMITS.maxAgents) break
  }
  return rows
}

/* ------------------------------------------------------------------ *
 * Small numeric helpers
 * ------------------------------------------------------------------ */

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function boundedInterval(value: number): number {
  if (!Number.isFinite(value)) return CHECKPOINT_WIRING_LIMITS.intervalMs.default
  const truncated = Math.trunc(value)
  return Math.min(CHECKPOINT_WIRING_LIMITS.intervalMs.max, Math.max(CHECKPOINT_WIRING_LIMITS.intervalMs.min, truncated))
}

/**
 * Race one write against a bound.
 *
 * The abandoned promise is left to settle on its own: it holds no timer, retries
 * nothing, and writes at most one bounded file, so dropping it cannot leave
 * ownerless background work behind.
 */
async function writeWithin(
  work: Promise<CheckpointWriteOutcome>,
  timeoutMs: number,
  logger: CheckpointLogger,
): Promise<CheckpointWriteOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
    const unref = (timer as { unref?: () => void }).unref
    if (typeof unref === 'function') unref.call(timer)
  })
  try {
    const raced = await Promise.race([work, timeout])
    if (raced === 'timeout') {
      logger.warn(`checkpoint unload write exceeded ${timeoutMs} ms and was abandoned`)
      return { ok: false, reason: 'timeout', detail: `write exceeded ${timeoutMs} ms`, terminal: true }
    }
    return raced
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
