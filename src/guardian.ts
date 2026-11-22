/**
 * Resident parallel supervision for one workflow run (host side).
 *
 * Why this module exists: the pre-existing `supervisor` role is a *serial*
 * stage — one judgement call per task attempt, run after verification and only
 * able to fail the attempt, never to pass it. That stage cannot see a child
 * that never settles: a worker whose `agent()` call hangs keeps the script's
 * worker pool occupied, and the only bound that fires is the run-level
 * deadline (default 60 minutes). This module is the parallel counterpart: one
 * `RunGuardian` per run, created in `runWorkflow` before the engine starts,
 * observing the same `workflow/agent-start` / `workflow/agent-end` events the
 * progress recorder and the memory archiver already consume, judging
 * *liveness* (never quality), and acting only through channels the plugin
 * already owns — cancel a stuck run, record what happened, and let the normal
 * terminal path turn that into an honest report.
 *
 * What it deliberately does NOT do (architecture constraints):
 *
 * - No agent loop of its own: it never calls the engine's `agent()` hook, so
 *   it costs zero model calls and adds no agent role. Child work is still
 *   created only by the generated script through `ctx.workflowEngine`.
 * - No DSH scheduler re-implementation: no timer owns a run, no queue is kept
 *   across runs. The one periodic check is a single `setInterval`, `unref()`ed
 *   so it never keeps the process alive, armed only between `adopt()` and
 *   `finish()`/`dispose()`, exactly like the checkpoint recorder's timer.
 * - Bounded by construction: per-child timeout and stall limits are inherited
 *   from the run's own `config.timeoutMs` (a fraction of the run deadline, so
 *   the guardian always fires before the deadline does), retries are the
 *   engine's own per-task retries (the guardian never retries anything
 *   itself — it only cancels, and the script's bounded retry loop decides what
 *   runs again), and no loop in this module is unbounded.
 * - No ownerless background work: `dispose()` clears the timer, removes the
 *   event listeners, and empties the registry. `disposeActiveState` (plugin
 *   unload) reaches every live guardian through the same instance registry
 *   pattern the checkpoint wiring uses, so an unload cancels/disposes all
 *   supervision with the runs it watches.
 *
 * State source: engine events only. `agent-start` opens a watched child
 * (seq + label + childId + arrival time), `agent-end` settles it by `seq`
 * (later settlements for the same seq are ignored, exactly like the progress
 * recorder's idempotence rule). No session store is read, no child output is
 * inspected, no prompt text is parsed: the guardian judges *whether* children
 * settle, never *what* they said. That is also why the existing supervisor
 * semantics are untouched — quality judgement stays in the script's serial
 * supervisor stage (pass/fail per attempt), while this module only answers
 * "is this child still alive?".
 *
 * Stuck definition (two independent signals, either one fires):
 *
 * - **Timeout**: a child whose `agent-end` has not arrived within the
 *   per-child budget. The budget is derived from the run's own deadline
 *   (`config.timeoutMs`): `min(deadline, CHILD_TIMEOUT_CAP_MS)`, floored at
 *   `CHILD_TIMEOUT_FLOOR_MS`. `0` (unlimited run deadline) arms no timeout,
 *   mirroring `run.ts` — an explicitly unbounded run is not second-guessed.
 * - **Heartbeat loss**: `agent-start` arrived but nothing followed — no
 *   `agent-end`, no further `agent-start` from the same run — for longer than
 *   the heartbeat budget. On the host side the only liveness signal a child
 *   produces is its settlement event, so "no event at all for N ms while at
 *   least one child is open" is the host-observable shape of a stall. The
 *   heartbeat budget equals the timeout budget; the two signals differ only in
 *   what they report, not in when they fire.
 *
 * Handling action and its upper bound: when either signal fires the guardian
 * marks the child `timed-out`, records one bounded finding
 * (`{ seq, label, action: 'cancel-run', reason }`), and calls `cancel()` on
 * the run **once per guardian** with the reason
 * `workflow guardian: child <label> (seq <n>) made no progress within <ms> ms`.
 * Cancelling the run — not the child — is the only action the host side owns:
 * there is no per-child cancel handle on `WorkflowRun`, and reaching into the
 * engine to kill one child would be a second scheduler. The bound is therefore
 * structural: at most one cancel per run, further firings only append findings
 * (bounded at `GUARDIAN_LIMITS.maxFindings`). The script's own bounded retry
 * loop then decides per task whether the attempt is retried; the guardian
 * never retries, never re-plans, never re-drives.
 *
 * Findings are evidence, not verdicts: `finish()` folds them into the
 * terminal report's `errors` list as `{ phase: 'Guardian', category:
 * 'cancelled' }` entries when the run's own report carries none for the
 * timed-out child, so a reader can tell "the work did not finish because a
 * child stalled" apart from "the work was judged and failed". Nothing here
 * changes `status` computation: a run with no verified task is still
 * `failed`, a run with kept work is still `partial`/`failed` by the existing
 * rules in `run.ts`.
 */

import type { WorkflowAgentOutcome, WorkflowStopReason } from '@deepseek-ai/dsh-workflow'
import { redactError } from './redact.js'
import { GUARDIAN_MAX_WAITS, GUARDIAN_WAIT_MS } from './timeout.js'
import type { WorkflowLogger } from './run.js'

/** Bounds of the guardian. All counts are per run, never global. */
export const GUARDIAN_LIMITS = {
  /** Children watched per run (the engine cap is the real bound; this only caps the map). */
  maxChildren: 256,
  /** Findings kept per run. */
  maxFindings: 32,
  /** Label characters kept per finding. */
  labelChars: 160,
  /** Reason characters kept per finding. */
  reasonChars: 400,
  /** Upper bound of one child's budget: the guardian never waits longer than this. */
  childTimeoutCapMs: 600_000,
  /** Lower bound of one child's budget: below this the timer is noise, not signal. */
  childTimeoutFloorMs: 5_000,
  /** How often the single periodic check runs. */
  checkIntervalMs: 10_000,
  /** Upper bound of one periodic-check wait on unload (the disposer must finish). */
  unloadTimeoutMs: 3_000,
} as const

/** Why the guardian acted on a child. */
export type GuardianSignal = 'timeout' | 'heartbeat-loss'

/** One guardian action, kept as evidence for the terminal report. */
export interface GuardianFinding {
  /** Engine `seq` of the child that stalled. */
  seq: number
  /** Child label as the engine reported it, bounded. */
  label: string
  /** Which liveness signal fired. */
  signal: GuardianSignal
  /** What the guardian did (always `cancel-run` — the only host-owned kill; `rescue` steers instead). */
  action: 'cancel-run' | 'rescue'
  /** Human-readable reason, bounded and redacted. */
  reason: string
  /** Epoch milliseconds at which the signal fired. */
  atMs: number
}

/** Terminal outcome of one guarded run, for the caller that settles the report. */
export interface GuardianSettlement {
  /** Findings recorded over the run's lifetime (possibly empty). */
  findings: GuardianFinding[]
  /** True when this guardian cancelled its run. */
  cancelled: boolean
  /** The cancel reason used, when `cancelled` is true. */
  cancelReason?: string
}

/** The run handle the guardian may cancel (structural subset of `WorkflowRun`). */
export interface GuardianRunHandle {
  readonly id: string
  cancel(reason?: string): void
}

/** Identity of one watched child. */
interface WatchedChild {
  seq: number
  label: string
  childId: string
  startedAtMs: number
  lastEventAtMs: number
  settled: boolean
  outcome?: WorkflowAgentOutcome
  timedOut: boolean
  /** Task-declared write paths this child may touch (B2 file heartbeat scope). */
  writesPaths: string[]
  /** Epoch ms of the freshest declared-file change seen for this child. */
  lastFileActivityMs: number
}

/** One declared write path with the freshest change the host has seen. */
export interface FileHeartbeat {
  /** The declared path that moved, verbatim. */
  path: string
  /** Epoch milliseconds of the freshest change observed. */
  atMs: number
}

/** Read the freshest change among a child's declared write paths, if any. */
export type FileHeartbeatReader = (writesPaths: readonly string[]) => FileHeartbeat | undefined

/** What the child's own session says about its open turn (timestamps only). */
export interface SessionHeartbeat {
  /** Epoch milliseconds of the freshest turn activity observed. */
  atMs: number
}

/**
 * Read one child's session liveness by its engine child id.
 * Returns the freshest turn timestamp, or `undefined` when the child session
 * cannot be read (released, unregistered key, no open turn). Only timestamps
 * travel — never message content. A reader that throws reads as "no signal".
 */
export type SessionHeartbeatReader = (childId: string) => SessionHeartbeat | undefined

/** Options for one guardian. Every field is optional except identity. */
export interface GuardianOptions {
  /**
   * Run id this guardian watches (the engine's `info.id`).
   *
   * May be `''` when the engine has not handed back a run yet: the guardian
   * buffers `agent-start`/`agent-end` rows by their `info.id` (like the
   * progress recorder's pre-adoption buffer) and `adopt()` binds the run id
   * from the live handle. A guardian created with a concrete id only watches
   * that id.
   */
  runId: string
  /** Per-child stall budget in milliseconds (0/negative = disarmed). */
  childBudgetMs: number
  /** Clock seam. Defaults to `Date.now`. */
  now?: () => number
  /** Timer seam. Defaults to `setInterval`/`clearInterval`. */
  schedule?: (fn: () => void, ms: number) => unknown
  cancelSchedule?: (handle: unknown) => void
  logger?: WorkflowLogger
  /** Plugin instance state, for the unload registry. */
  state?: object
  /**
   * File-heartbeat reader (B2): given a child's task-declared write paths,
   * return the freshest change seen, or `undefined` when nothing moved.
   * A reader that throws is treated as "no signal" — never as a verdict.
   * Absent means no task declared paths, and the old budget-only rule holds.
   */
  fileHeartbeat?: FileHeartbeatReader
  /**
   * Rebuild a child's declared write paths from its phase header (B2 host
   * leg): the engine forwards only `{seq,label,phase,childId}`, so a path
   * the script knew cannot ride the event. The host maps phase `任务 n` back
   * to the caller plan's nth task. Absent (planner-built plans) means no
   * child carries paths and the old rule holds.
   */
  writesPathsForPhase?: (phase: string) => string[]
  /**
   * Session-heartbeat reader (C1): given the engine child id, return the
   * freshest turn timestamp from the child's own session, or `undefined`
   * when it cannot be read. Fresh (within budget) means the child is talking
   * — it stays alive regardless of files or narration. Stale or unreadable
   * degrades to the older signals, never to a false alive.
   */
  sessionHeartbeat?: SessionHeartbeatReader
  /**
   * Rescue executor (C3): interrupt the child and deliver the adjudicator's
   * guidance. Called once per `guardian rescue` log line the script emits;
   * unlimited by design (per operator decision) — each call appends one
   * `rescue` finding, so the spend is auditable in the terminal report.
   * A callback that throws is contained as a warning, never as a failed run.
   */
  rescue?: (childId: string, guidance: string) => void
}

/** Derive one child's stall budget from the run's own deadline. */
export function guardianChildBudgetMs(timeoutMs: number, childTimeoutMs?: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return 0
  let budget = Math.min(Math.trunc(timeoutMs), GUARDIAN_LIMITS.childTimeoutCapMs)
  // Q8 wait slices live inside the script's own race: when a guardian route is
  // configured the script may extend one stalled call by GUARDIAN_MAX_WAITS
  // slices before it settles the call as a timeout. The host must not cancel
  // the whole run while the script is still inside that adjudication window —
  // otherwise a healthy-but-slow child (10 min of real progress, as in
  // session-77a3f6fb turn 38) is killed as "no progress" before the script's
  // own verdict can land. The host budget therefore covers the script's child
  // budget plus the full wait extension, still capped at childTimeoutCapMs.
  if (childTimeoutMs !== undefined && Number.isFinite(childTimeoutMs) && childTimeoutMs > 0) {
    const scriptBudget = Math.trunc(childTimeoutMs)
    const waitExtension = GUARDIAN_MAX_WAITS * GUARDIAN_WAIT_MS
    budget = Math.min(Math.trunc(timeoutMs), Math.max(budget, scriptBudget + waitExtension))
    budget = Math.min(budget, GUARDIAN_LIMITS.childTimeoutCapMs)
  }
  if (budget < GUARDIAN_LIMITS.childTimeoutFloorMs) return 0
  return budget
}

/** Bounded, redacted text for a finding field. */
function findingText(value: string, max: number): string {
  try {
    return redactError(value).replace(/\s+/g, ' ').trim().slice(0, max)
  } catch {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  }
}

/** Payload shape the engine hands to `workflow/agent-start` listeners. */
interface AgentStartInfo {
  id?: unknown
  seq?: unknown
  label?: unknown
  childId?: unknown
  phase?: unknown
  writesPaths?: unknown
}

/** Payload shape the engine hands to `workflow/agent-end` listeners. */
interface AgentEndInfo extends AgentStartInfo {
  outcome?: unknown
}

/** Declared write paths from an agent-start payload, if the caller carried them. */
function writesPathsOf(payload: AgentStartInfo): string[] {
  const raw = payload.writesPaths
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed === '' || trimmed.length > 300) continue
    if (out.length >= 16) break
    out.push(trimmed)
  }
  return out
}

function seqOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed >= 0) return parsed
  }
  return undefined
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Create the resident guardian for one run.
 *
 * The guardian subscribes to the engine's observe-only `workflow/*` events
 * immediately (so the first `agent-start` cannot be missed), but attributes
 * every row by `info.id`: events for any other run are ignored. It arms one
 * `unref()`ed interval only after `adopt()` hands it the live run handle, and
 * it disarms everything on `finish()`/`dispose()`. Cancelling happens at most
 * once; every later firing only appends a bounded finding.
 */
export function createRunGuardian(options: GuardianOptions): RunGuardian {
  const clock = options.now ?? (() => Date.now())
  const schedule = options.schedule ?? ((fn: () => void, ms: number): unknown => setInterval(fn, ms))
  const cancelSchedule = options.cancelSchedule ?? ((handle: unknown): void => {
    clearInterval(handle as ReturnType<typeof setTimeout>)
  })
  const logger: WorkflowLogger = options.logger ?? { warn: () => {} }
  const configuredRunId = String(options.runId ?? '').trim()
  let runId = configuredRunId
  const budgetMs = options.childBudgetMs

  const children = new Map<number, WatchedChild>()
  const findings: GuardianFinding[] = []
  /**
   * Rows that arrived before the run was adopted, keyed by engine run id.
   * The engine can emit `agent-start` in a microtask before `start()` hands
   * the run back (the same window the progress recorder buffers for), so an
   * early child is buffered, not dropped. Bounded: foreign runs pass through.
   */
  const pendingStarts: Array<{ runId: string, seq: number, label: string, childId: string, writesPaths: string[], at: number }> = []
  const pendingEnds: Array<{ runId: string, seq: number, label: string, outcome: WorkflowAgentOutcome, at: number }> = []
  const pendingRescues: Array<{ runId: string, message: string }> = []
  const PENDING_LIMIT = 64
  let run: GuardianRunHandle | undefined
  let timer: unknown
  let disposed = false
  let cancelFired = false
  let cancelReason: string | undefined
  let stopReason: WorkflowStopReason | undefined
  // B1: the freshest run-level narration (workflow/phase or workflow/log).
  // A run that narrates is a run that progresses, even when one child is
  // quiet — run-wide silence, not one quiet child, is the heartbeat-loss.
  let runHeartbeatAtMs = 0
  const listeners: (() => void)[] = []

  /**
   * C1 session heartbeat: the child's own turn timestamp. Fresh means the
   * child talked recently — alive, no matter what the files say. Stale or
   * unreadable yields no signal; only timestamps travel, never content.
   */
  const sessionHeartbeatOf = (child: WatchedChild): SessionHeartbeat | undefined => {
    const reader = options.sessionHeartbeat
    if (reader === undefined || child.childId === '') return undefined
    try {
      const beat = reader(child.childId)
      if (beat === undefined) return undefined
      if (!Number.isFinite(beat.atMs) || beat.atMs <= 0) return undefined
      return beat
    } catch {
      return undefined
    }
  }

  const armed = Number.isFinite(budgetMs) && (budgetMs as number) > 0

  const appendFinding = (finding: GuardianFinding): void => {
    if (findings.length >= GUARDIAN_LIMITS.maxFindings) return
    findings.push(finding)
  }

  const cancelOnce = (reason: string): void => {
    if (cancelFired) return
    cancelFired = true
    cancelReason = reason
    const live = run
    if (live === undefined) return
    try {
      live.cancel(reason)
    } catch (error) {
      logger.warn(`workflow guardian could not cancel run ${runId}: ${findingText(error instanceof Error ? error.message : String(error), GUARDIAN_LIMITS.reasonChars)}`)
    }
  }

  const fireFor = (child: WatchedChild, signal: GuardianSignal, at: number, evidence?: string): void => {
    if (child.timedOut) return
    child.timedOut = true
    const who = child.label === '' ? `#${child.seq}` : `"${child.label}" (seq ${child.seq})`
    const reason = evidence === undefined || evidence === ''
      ? `workflow guardian: child ${who} made no progress within ${budgetMs} ms (${signal})`
      : `workflow guardian: child ${who} made no progress within ${budgetMs} ms (${signal}); last life: ${evidence}`
    appendFinding({
      seq: child.seq,
      label: child.label.slice(0, GUARDIAN_LIMITS.labelChars),
      signal,
      action: 'cancel-run',
      reason: findingText(reason, GUARDIAN_LIMITS.reasonChars),
      atMs: at,
    })
    cancelOnce(reason)
  }

  /** One periodic sweep: every open child older than the budget fires. */
  const check = (at: number = clock()): void => {
    if (disposed || !armed) return
    if (stopReason !== undefined) return
    let latestActivity = runHeartbeatAtMs
    for (const child of children.values()) {
      if (!child.settled && !child.timedOut) {
        if (child.lastEventAtMs > latestActivity) latestActivity = child.lastEventAtMs
        const beat = fileHeartbeatOf(child, at)
        if (beat !== undefined) {
          child.lastFileActivityMs = Math.max(child.lastFileActivityMs, beat.atMs)
          if (beat.atMs > latestActivity) latestActivity = beat.atMs
        }
      }
    }
    for (const child of children.values()) {
      if (child.settled || child.timedOut) continue
      // C1: the child's own session talked recently — it is alive no matter
      // what the files say. A stale turn or an unreadable session is no
      // signal: the older rules below still apply.
      const sessionBeat = sessionHeartbeatOf(child)
      if (sessionBeat !== undefined) {
        if (sessionBeat.atMs > latestActivity) latestActivity = sessionBeat.atMs
        if (at - sessionBeat.atMs < budgetMs) continue
      }
      // B2: the child's declared files moved recently — it is writing, not
      // wedged. A stale file is no signal: the budget still applies.
      const beat = fileHeartbeatOf(child, at)
      const beatAt = beat?.atMs ?? child.lastFileActivityMs
      if (beat !== undefined) child.lastFileActivityMs = Math.max(child.lastFileActivityMs, beat.atMs)
      if (beatAt > 0 && at - beatAt < budgetMs) continue
      const silentFor = at - child.startedAtMs
      if (silentFor < budgetMs) continue
      // B1: fresh run narration downgrades the signal. A quiet child beside
      // a narrating run is a lone stall (timeout); only a run that itself
      // went silent earns a heartbeat-loss.
      const runSilentFor = latestActivity === 0 ? silentFor : at - latestActivity
      const signal: GuardianSignal = runSilentFor >= budgetMs ? 'heartbeat-loss' : 'timeout'
      const evidence = sessionBeat !== undefined && at - sessionBeat.atMs < budgetMs * 2
        ? `session ${Math.round((at - sessionBeat.atMs) / 1000)}s ago`
        : (beatAt > 0
          ? `file ${Math.round((at - beatAt) / 1000)}s ago`
          : (latestActivity > 0 ? `run narration ${Math.round((at - latestActivity) / 1000)}s ago` : undefined))
      fireFor(child, signal, at, evidence)
    }
  }

  const armTimer = (): void => {
    if (disposed || timer !== undefined || !armed) return
    try {
      const handle = schedule(() => { check() }, GUARDIAN_LIMITS.checkIntervalMs)
      const unref = (handle as { unref?: () => void } | null)?.unref
      if (typeof unref === 'function') unref.call(handle)
      timer = handle
    } catch (error) {
      logger.warn(`workflow guardian timer could not start: ${findingText(error instanceof Error ? error.message : String(error), GUARDIAN_LIMITS.reasonChars)}`)
    }
  }

  const disarmTimer = (): void => {
    if (timer === undefined) return
    const handle = timer
    timer = undefined
    try {
      cancelSchedule(handle)
    } catch (error) {
      logger.warn(`workflow guardian timer could not be cleared: ${findingText(error instanceof Error ? error.message : String(error), GUARDIAN_LIMITS.reasonChars)}`)
    }
  }

  const release = (): void => {
    if (disposed) return
    disposed = true
    disarmTimer()
    for (const off of listeners) {
      try {
        off()
      } catch {
        // A disposer that is already gone has nothing to repair.
      }
    }
    listeners.length = 0
    if (options.state !== undefined) unregisterRunGuardian(options.state, guardian)
  }

  const noteStart = (info: unknown, member: unknown): void => {
    const infoId = (info as { id?: unknown } | null)?.id
    if (typeof infoId !== 'string' && typeof infoId !== 'number') return
    const eventRunId = String(infoId).trim()
    if (eventRunId === '') return
    const payload = (member ?? info) as AgentStartInfo
    const seq = seqOf(payload.seq ?? (info as AgentStartInfo).seq)
    if (seq === undefined) return
    const at = clock()
    const label = findingText(textOf(payload.label ?? (info as AgentStartInfo).label).trim(), GUARDIAN_LIMITS.labelChars)
    const childId = textOf(payload.childId ?? (info as AgentStartInfo).childId)
    // B2 host leg: the event carries phase but not paths (the engine's option
    // allowlist drops anything else), so the host maps phase back to the
    // caller plan. A lookup that throws is no paths, never a verdict.
    const phase = textOf(payload.phase ?? (info as AgentStartInfo).phase)
    let writesPaths = writesPathsOf(payload)
    if (writesPaths.length === 0 && phase !== '' && options.writesPathsForPhase !== undefined) {
      try {
        writesPaths = writesPathsOf({ writesPaths: options.writesPathsForPhase(phase) })
      } catch {
        writesPaths = []
      }
    }
    // Pre-adoption: the engine has not handed back a run yet. Buffer the row
    // by its own run id; `adopt()` replays rows that belong to the live run.
    if (run === undefined) {
      if (runId !== '' && eventRunId !== runId) return
      if (pendingStarts.length >= PENDING_LIMIT) pendingStarts.shift()
      pendingStarts.push({ runId: eventRunId, seq, label, childId, writesPaths, at })
      return
    }
    if (eventRunId !== runId) return
    const existing = children.get(seq)
    if (existing !== undefined) {
      // Idempotent like the progress recorder: a replayed start refreshes
      // liveness but never adds a second row.
      if (!existing.settled) existing.lastEventAtMs = at
      return
    }
    if (children.size >= GUARDIAN_LIMITS.maxChildren) return
    const openLabel = findingText(label, GUARDIAN_LIMITS.labelChars)
    const openChildId = childId
    children.set(seq, {
      seq,
      label: openLabel,
      childId: openChildId,
      startedAtMs: at,
      lastEventAtMs: at,
      settled: false,
      timedOut: false,
      writesPaths,
      lastFileActivityMs: 0,
    })
  }

  const noteEnd = (info: unknown, member: unknown): void => {
    const infoId = (info as { id?: unknown } | null)?.id
    if (typeof infoId !== 'string' && typeof infoId !== 'number') return
    const eventRunId = String(infoId).trim()
    if (eventRunId === '') return
    const payload = (member ?? info) as AgentEndInfo
    const seq = seqOf(payload.seq ?? (info as AgentEndInfo).seq)
    if (seq === undefined) return
    const at = clock()
    const outcomeRaw = textOf(payload.outcome)
    const outcome: WorkflowAgentOutcome =
      outcomeRaw === 'completed' || outcomeRaw === 'failed' || outcomeRaw === 'cancelled' ? outcomeRaw : 'failed'
    const endLabel = findingText(textOf(payload.label ?? (info as AgentEndInfo).label).trim(), GUARDIAN_LIMITS.labelChars)
    // Pre-adoption: buffer like the start path.
    if (run === undefined) {
      if (runId !== '' && eventRunId !== runId) return
      if (pendingEnds.length >= PENDING_LIMIT) pendingEnds.shift()
      pendingEnds.push({ runId: eventRunId, seq, label: endLabel, outcome, at })
      return
    }
    if (eventRunId !== runId) return
    const child = children.get(seq)
    if (child === undefined) {
      // An end before its start still settles the row once the start arrives:
      // record a settled placeholder so the later start cannot stall forever.
      if (children.size >= GUARDIAN_LIMITS.maxChildren) return
      children.set(seq, {
        seq,
        label: findingText(textOf(payload.label).trim(), GUARDIAN_LIMITS.labelChars),
        childId: '',
        startedAtMs: at,
        lastEventAtMs: at,
        settled: true,
        outcome,
        timedOut: false,
        writesPaths: [],
        lastFileActivityMs: 0,
      })
      return
    }
    if (child.settled) return
    child.settled = true
    child.lastEventAtMs = at
    child.outcome = outcome
  }

  const noteRunEnd = (info: unknown): void => {
    if (runId === '') return
    const infoId = (info as { id?: unknown } | null)?.id
    if (typeof infoId !== 'string' && typeof infoId !== 'number') return
    if (String(infoId).trim() !== runId) return
    const result = (info as { result?: unknown }).result
    void result
    stopReason = 'completed'
    disarmTimer()
  }

  /**
   * B1 run-level heartbeat: the script narrated a phase or log line.
   * A run that narrates is progressing — one quiet child beside fresh
   * narration is a lone stall (timeout), not a silent run (heartbeat-loss),
   * and a child quieter than the narration itself is still working.
   */
  const noteRunHeartbeat = (info: unknown, at?: number): void => {
    if (disposed) return
    const infoId = (info as { id?: unknown } | null)?.id
    if (typeof infoId !== 'string' && typeof infoId !== 'number') return
    if (runId !== '' && String(infoId).trim() !== runId) return
    const stamp = typeof at === 'number' && Number.isFinite(at) ? at : clock()
    if (stamp > runHeartbeatAtMs) runHeartbeatAtMs = stamp
  }

  /**
   * C3 rescue: the script's adjudicator judged a stalled child
   * interrupt-recoverable and broadcast `guardian rescue seq=N ...
   * guidance=...` on the log channel. The host interrupts that child and
   * delivers the guidance; the child's context is preserved, so it wakes
   * with new instructions instead of being killed and retried. Unlimited by
   * operator decision — each rescue appends one finding, so the spend is
   * auditable. Never throws: an unknown seq, a missing executor, or a
   * throwing executor costs a warning at most, never the run.
   */
  const noteRescue = (info: unknown, message: unknown): void => {
    if (disposed) return
    const text = typeof message === 'string' ? message : ''
    if (text === '' || !text.includes('guardian rescue')) return
    const infoId = (info as { id?: unknown } | null)?.id
    const eventRunId = typeof infoId === 'string' || typeof infoId === 'number' ? String(infoId).trim() : ''
    // Pre-adoption: the engine has not handed back a run yet. Buffer the line
    // by its own run id (like the start/end rows); `adopt()` replays lines
    // that belong to the live run.
    if (run === undefined) {
      if (runId !== '' && eventRunId !== runId) return
      if (pendingRescues.length >= PENDING_LIMIT) pendingRescues.shift()
      pendingRescues.push({ runId: eventRunId !== '' ? eventRunId : runId, message: text })
      return
    }
    if (eventRunId !== '' && eventRunId !== runId) return
    fireRescue(text)
  }

  const fireRescue = (text: string): void => {
    const seqMatch = /seq=(\d+)/.exec(text)
    if (seqMatch === null) return
    const seq = Number(seqMatch[1])
    if (!Number.isInteger(seq) || seq < 0) return
    const child = children.get(seq)
    if (child === undefined || child.settled || child.timedOut) return
    const guidanceMatch = /guidance=([\s\S]*)$/.exec(text)
    const guidance = (guidanceMatch?.[1] ?? '').trim().slice(0, 200)
    if (guidance === '') return
    if (child.childId === '') return
    const executor = options.rescue
    if (executor === undefined) return
    try {
      executor(child.childId, guidance)
    } catch (error) {
      logger.warn(`workflow guardian rescue failed for child seq ${seq}: ${findingText(error instanceof Error ? error.message : String(error), GUARDIAN_LIMITS.reasonChars)}`)
      return
    }
    appendFinding({
      seq,
      label: child.label.slice(0, GUARDIAN_LIMITS.labelChars),
      signal: 'timeout',
      action: 'rescue',
      reason: findingText(`workflow guardian: rescued child "${child.label}" (seq ${seq}) with guidance: ${guidance}`, GUARDIAN_LIMITS.reasonChars),
      atMs: clock(),
    })
  }

  /**
   * B2 file heartbeat: the freshest declared-path change for one child.
   * A reader that throws, or a child with no declared paths, yields no
   * signal — the old budget-only rule holds, never a false alive.
   */
  const fileHeartbeatOf = (child: WatchedChild, at: number): FileHeartbeat | undefined => {
    const reader = options.fileHeartbeat
    if (reader === undefined || child.writesPaths.length === 0) return undefined
    try {
      const beat = reader(child.writesPaths)
      if (beat === undefined) return undefined
      if (!Number.isFinite(beat.atMs) || beat.atMs <= 0 || beat.atMs > at) return undefined
      return beat
    } catch {
      return undefined
    }
  }

  const guardian: RunGuardian = {
    get runId() { return runId },
    get findings() { return [...findings] },
    get cancelled() { return cancelFired },
    adopt(handle: GuardianRunHandle): void {
      if (disposed) return
      if (run !== undefined) return
      // Bind the run id from the live handle when it was not known at
      // creation: the handle the engine hands back is the identity the
      // buffered rows were keyed by.
      const handleId = String(handle?.id ?? '').trim()
      if (handleId !== '') runId = handleId
      run = handle
      // Replay rows that arrived before adoption (arrival order preserved as
      // far as the two buffers allow: starts before ends).
      for (const row of pendingStarts.splice(0)) {
        if (row.runId !== runId) continue
        if (children.has(row.seq)) continue
        if (children.size >= GUARDIAN_LIMITS.maxChildren) break
        children.set(row.seq, {
          seq: row.seq,
          label: row.label,
          childId: row.childId,
          startedAtMs: row.at,
          lastEventAtMs: row.at,
          settled: false,
          timedOut: false,
          writesPaths: row.writesPaths,
          lastFileActivityMs: 0,
        })
      }
      // Rescues replay before ends: a rescue broadcast while the child was
      // still open must steer it; replaying ends first would mark the child
      // settled and wrongly drop a rescue that arrived before the end.
      for (const row of pendingRescues.splice(0)) {
        if (row.runId !== runId) continue
        fireRescue(row.message)
      }
      for (const row of pendingEnds.splice(0)) {
        if (row.runId !== runId) continue
        const child = children.get(row.seq)
        if (child === undefined) {
          if (children.size >= GUARDIAN_LIMITS.maxChildren) break
          children.set(row.seq, {
            seq: row.seq,
            label: row.label,
            childId: '',
            startedAtMs: row.at,
            lastEventAtMs: row.at,
            settled: true,
            outcome: row.outcome,
            timedOut: false,
            writesPaths: [],
            lastFileActivityMs: 0,
          })
          continue
        }
        if (child.settled) continue
        child.settled = true
        child.lastEventAtMs = Math.max(child.lastEventAtMs, row.at)
        child.outcome = row.outcome
      }
      if (options.state !== undefined) registerRunGuardian(options.state, guardian)
      armTimer()
      // A child that started before adoption gets its liveness judged from now:
      // re-check immediately so an already-stale child does not wait a full tick.
      check()
    },
    agentStart(info: unknown, member?: unknown): void {
      if (disposed) return
      noteStart(info, member)
    },
    agentEnd(info: unknown, member?: unknown): void {
      if (disposed) return
      noteEnd(info, member)
    },
    runEnd(info: unknown): void {
      if (disposed) return
      noteRunEnd(info)
    },
    runHeartbeat(info: unknown, at?: number): void {
      if (disposed) return
      noteRunHeartbeat(info, at)
    },
    noteRescue(info: unknown, message: unknown): void {
      if (disposed) return
      noteRescue(info, message)
    },
    check(now?: number): GuardianFinding[] {
      check(now ?? clock())
      return [...findings]
    },
    finish(stop?: WorkflowStopReason): GuardianSettlement {
      if (stop !== undefined) stopReason = stop
      disarmTimer()
      const settlement: GuardianSettlement = {
        findings: [...findings],
        cancelled: cancelFired,
        ...cancelReason === undefined ? {} : { cancelReason },
      }
      release()
      return settlement
    },
    dispose(): void {
      release()
    },
    get stats() {
      let open = 0
      let settled = 0
      for (const child of children.values()) {
        if (child.settled) settled += 1
        else open += 1
      }
      return {
        runId,
        armed,
        budgetMs: armed ? budgetMs : 0,
        children: children.size,
        open,
        settled,
        findings: findings.length,
        cancelled: cancelFired,
        timerArmed: timer !== undefined,
        listeners: listeners.length,
        disposed,
      }
    },
  }

  /**
   * Subscribe to one engine event and keep its disposer.
   *
   * Subscribing is part of "recording never affects the run": a context
   * without an event bus costs the guardian entry, never the workflow.
   */
  const subscribe = (
    source: { on?: unknown } | undefined,
    name: 'workflow/agent-start' | 'workflow/agent-end' | 'workflow/end',
    listener: (...args: unknown[]) => void,
  ): void => {
    const on = source?.on
    if (typeof on !== 'function') return
    try {
      const off = (on as (event: string, fn: (...args: unknown[]) => void) => unknown).call(source, name, listener)
      if (typeof off === 'function') listeners.push(off as () => void)
    } catch (error) {
      logger.warn(`workflow guardian could not subscribe to ${name}: ${findingText(error instanceof Error ? error.message : String(error), GUARDIAN_LIMITS.reasonChars)}`)
    }
  }

  const eventSource = (globalThis as { __grokGuardianEventSource?: never }).__grokGuardianEventSource as
    | { on?: unknown }
    | undefined
  void eventSource
  void subscribe

  return guardian
}

/** The live guardian for one run. Every method is safe to call and never throws. */
export interface RunGuardian {
  /** Engine run id this guardian watches. */
  readonly runId: string
  /** Findings recorded so far (a copy). */
  readonly findings: GuardianFinding[]
  /** True once this guardian cancelled its run. */
  readonly cancelled: boolean
  /** Adopt the live run handle; arms the single periodic check. Idempotent. */
  adopt(handle: GuardianRunHandle): void
  /** Observe one `workflow/agent-start` event. */
  agentStart(info: unknown, member?: unknown): void
  /** Observe one `workflow/agent-end` event. */
  agentEnd(info: unknown, member?: unknown): void
  /** Observe the run's terminal event. */
  runEnd(info: unknown): void
  /**
   * Observe one run-level narration (`workflow/phase` or `workflow/log`).
   * A narrating run is a progressing run: it downgrades a quiet child from
   * heartbeat-loss to its own timeout, and never marks a child alive by
   * itself. Never throws.
   */
  runHeartbeat(info: unknown, at?: number): void
  /**
   * Observe one `guardian rescue` log line from the script. Parses the seq
   * and guidance, interrupts that child and delivers the guidance through
   * the injected executor. Unknown seq, settled child, missing guidance or
   * executor, and throwing executor are all contained — never the run.
   * Lines arriving before adoption are buffered and replayed on adopt.
   */
  noteRescue(info: unknown, message: unknown): void
  /** Run one liveness sweep now; returns the findings so far. */
  check(now?: number): GuardianFinding[]
  /** Settle the guardian and release everything; returns the terminal settlement. */
  finish(stop?: WorkflowStopReason): GuardianSettlement
  /** Release the timer, listeners and registry entry without settling. */
  dispose(): void
  /** Diagnostics snapshot (tests and logs). */
  readonly stats: {
    runId: string
    armed: boolean
    budgetMs: number
    children: number
    open: number
    settled: number
    findings: number
    cancelled: boolean
    timerArmed: boolean
    listeners: number
    disposed: boolean
  }
}

/* ------------------------------------------------------------------ *
 * Instance registry (unload path)
 * ------------------------------------------------------------------ */

/**
 * Guardians registered against one plugin instance, keyed by its `ActiveState`.
 *
 * A `WeakMap` on purpose, mirroring the checkpoint unload registry: the
 * plugin instance is the owner, and an unload that forgets to deregister must
 * not keep a state object (and through it, timers) alive. Registration happens
 * at `adopt()` — a guardian that never saw a run never joins, so an idle
 * plugin instance holds nothing.
 */
const UNLOAD_REGISTRY = new WeakMap<object, Set<RunGuardian>>()

/** Join one instance's guardian registry. Idempotent. */
export function registerRunGuardian(state: object, guardian: RunGuardian): void {
  const existing = UNLOAD_REGISTRY.get(state)
  if (existing === undefined) {
    UNLOAD_REGISTRY.set(state, new Set([guardian]))
    return
  }
  existing.add(guardian)
}

/** Leave one instance's guardian registry. */
export function unregisterRunGuardian(state: object, guardian: RunGuardian): void {
  const existing = UNLOAD_REGISTRY.get(state)
  if (existing === undefined) return
  existing.delete(guardian)
  if (existing.size === 0) UNLOAD_REGISTRY.delete(state)
}

/** How many guardians are currently registered for an instance (tests/diagnostics). */
export function registeredRunGuardians(state: object): number {
  return UNLOAD_REGISTRY.get(state)?.size ?? 0
}

/**
 * Dispose every live guardian for this plugin instance.
 *
 * Called from `disposeActiveState` alongside the run cancellation, so no
 * guardian timer or listener outlives the unload. Never throws: a disposal
 * that refuses must not stop the unload. Returns how many guardians were
 * disposed (0 for an idle plugin).
 */
export function unloadRunGuardians(state: object): number {
  const registered = UNLOAD_REGISTRY.get(state)
  if (registered === undefined || registered.size === 0) return 0
  const guardians = [...registered]
  UNLOAD_REGISTRY.delete(state)
  let disposed = 0
  for (const guardian of guardians) {
    try {
      guardian.dispose()
      disposed += 1
    } catch {
      // A guardian that refuses disposal is already gone; count nothing.
    }
  }
  return disposed
}
