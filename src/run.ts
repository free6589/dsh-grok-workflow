/**
 * Shared workflow-run lifecycle used by both entry points.
 *
 * The tool path (model-initiated) and the mandatory-entry gate (host-initiated)
 * must behave identically: same deadline handling, same active-run cap, same
 * report validation, same redaction, and the same honest failure reporting.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type { WorkflowRun, WorkflowStartRequest, WorkflowStopReason } from '@deepseek-ai/dsh-workflow'
import { namingLanguageFromSettings } from './naming.js'
import type { NamingLanguage } from './naming.js'
import { buildWorkflowRequest } from './script.js'
import { teamWorkflowEngine } from './team-engine.js'
import { assertWorkflowReport, failureReport } from './report.js'
import {
  appendUnloadNotice,
  callSiteFrames,
  classifyDisposeTrigger,
  createWorkflowProgressRecorder,
  progressStopReason,
  recordDispose,
  recordRouting,
} from './records.js'
import type { DisposeRecord, DisposeRunInfo } from './records.js'
import { archiveRoundNow, createMemoryArchiver, memberFromEnd, memberFromStart, roundArchiveEvidence, roundArchiveSummary } from './memory/recorder.js'
import { redactDeep, redactError, redactSecrets } from './redact.js'
import type { FailureCategory, FinalStatus, IncompleteItem, NormalizedTask, ResolvedConfig, RoleName, WorkflowReport } from './types.js'

/** Minimal logger surface used by the runtime modules. */
export interface WorkflowLogger {
  warn(message: string): void
  /** Diagnostics channel; absent on a logger that only carries warnings. */
  info?(message: string): void
}

/** Identity and timing of one run, kept so an unload can name what it cancelled. */
export interface ActiveRunInfo {
  runId: string
  /** Session that owns the run; also the key of the per-session cap (P1-3). */
  sessionId: string
  /** Session object, so a disposal can write the interrupted run's notice. */
  session?: Session
  startedAtMs: number
  /**
   * Route labels this run configured (C1 cross-run hint snapshot source).
   * Run-level estimate only: which chains exist, not live sub-call counts
   * (A16 — exact in-flight counts are invisible host-side).
   */
  routes?: string[]
}

/** Lifetime-scoped state shared by the tool and the gate. */
export interface ActiveState {
  disposed: boolean
  pending: number
  /** Epoch milliseconds at which the plugin instance was applied. */
  readonly createdAt: number
  readonly controller: AbortController
  readonly runs: Set<WorkflowRun>
  /** Identity of every live run, keyed by the run the engine handed back. */
  readonly active: Map<WorkflowRun, ActiveRunInfo>
  /** Admitted-but-not-yet-started runs per session id (the cap counts these too). */
  readonly starting: Map<string, number>
  /** Set by {@link disposeActiveState}; read by the cancelled exit to name the cause. */
  unloadedAt?: number
  /**
   * Shutdown signals seen before disposal (t45). Empty means the unload happened
   * inside a live process — a settings toggle, a reload or a test — which is the
   * distinction the dispose record and the notice need.
   */
  signals?: string[]
}

/** Create the lifetime state owned by one plugin instance. */
export function createActiveState(): ActiveState {
  return {
    disposed: false,
    pending: 0,
    createdAt: Date.now(),
    controller: new AbortController(),
    runs: new Set<WorkflowRun>(),
    active: new Map<WorkflowRun, ActiveRunInfo>(),
    starting: new Map<string, number>(),
  }
}

/** Human-shaped elapsed time for a message a user may read (`14m38s`, `820ms`). */
export function formatElapsed(ms: number): string {
  const bounded = Math.max(0, Math.trunc(ms))
  if (bounded < 1_000) return `${bounded}ms`
  const totalSeconds = Math.trunc(bounded / 1_000)
  const hours = Math.trunc(totalSeconds / 3_600)
  const minutes = Math.trunc((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

/** Session key used by the per-session cap when the runtime exposes no session. */
const UNKNOWN_SESSION = 'unknown-session'

/** Session id of an agent, without throwing on a partial agent. */
function sessionIdOf(agent: Agent): string {
  const session = sessionOfAgent(agent)
  if (session === undefined) return UNKNOWN_SESSION
  const id = String(session.id ?? '')
  return id === '' ? UNKNOWN_SESSION : id
}

/** Live runs that belong to one session, oldest first. */
function runsOfSession(state: ActiveState, sessionId: string): ActiveRunInfo[] {
  const infos: ActiveRunInfo[] = []
  for (const info of state.active.values()) {
    if (info.sessionId === sessionId) infos.push(info)
  }
  return infos.sort((left, right) => left.startedAtMs - right.startedAtMs)
}

/** How many runs (started + starting) one session holds against its cap. */
export function activeCountOfSession(state: ActiveState, sessionId: string): number {
  return (state.starting.get(sessionId) ?? 0) + runsOfSession(state, sessionId).length
}

/** Route labels one config puts into play, flattened across roles (C1 hint source). */
export function configRouteLabels(config: ResolvedConfig): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const role of ['planner', 'worker', 'verifier', 'synthesizer'] as const) {
    for (const route of config.roles[role] ?? []) {
      const model = typeof route.model === 'string' ? route.model.trim() : ''
      if (model === '') continue
      const provider = typeof route.provider === 'string' ? route.provider.trim() : ''
      const label = provider === '' ? model : `${provider}/${model}`
      if (seen.has(label)) continue
      seen.add(label)
      out.push(label.slice(0, 120))
      if (out.length >= 64) return out
    }
  }
  return out
}

/**
 * Approximate global busy snapshot (C1): route labels other live runs
 * configured, oldest run first. Run-level only — exact in-flight sub-call
 * counts are invisible host-side (A16), so this never claims semaphore
 * precision; the script only deprioritizes, never removes, flagged routes.
 */
export function snapshotBusyRoutes(state: ActiveState): string[] {
  const infos = [...state.active.values()].sort((left, right) => left.startedAtMs - right.startedAtMs)
  const out: string[] = []
  const seen = new Set<string>()
  for (const info of infos) {
    for (const label of info.routes ?? []) {
      if (typeof label !== 'string') continue
      const trimmed = label.trim().slice(0, 120)
      if (trimmed === '' || seen.has(trimmed)) continue
      seen.add(trimmed)
      out.push(trimmed)
      if (out.length >= 64) return out
    }
  }
  return out
}

/** `run <id> (running 14m38s)` — the detail a refusal has to carry to be actionable. */
function describeHolder(info: ActiveRunInfo, now: number): string {
  return `run ${info.runId} (running ${formatElapsed(now - info.startedAtMs)})`
}

/** Short label used in thrown messages and rendered failures. */
export function workflowLabel(config: ResolvedConfig): string {
  return config.toolName
}

/** Inputs the plugin disposer can offer about how it was reached. */
export interface DisposalContext {
  logger?: WorkflowLogger
  /** Stack of the disposer call, used for attribution (t45, P0-1). */
  callSite?: string
}

/** Notice text for a session whose run was cut by an unload. */
function unloadNoticeText(record: DisposeRecord, interrupted: number): string {
  const runs = interrupted === 1 ? '1 workflow run' : `${interrupted} workflow runs`
  // Two facts, both observed rather than guessed: how many runs are being cut, and
  // whether the process received a shutdown signal (empty for an in-process
  // unload, where the host does not disclose who asked for it).
  const cause = record.signals.length > 0
    ? `Cause: the process is shutting down (${record.signals.join(', ')}), so this is not a deadline, not a manual stop and not a plugin setting.`
    : 'Cause: the plugin was unloaded inside a running process (a settings toggle, a reload or an upgrade);'
      + ' the host does not disclose which, and the disposal call path is recorded in this session for whoever asks.'
  return [
    `[grok-workflow] The plugin was unloaded while this session had ${runs} in flight, so that work was cancelled.`,
    cause,
    'This notice is written once, at unload time. Messages sent until the plugin is enabled again are answered',
    'directly and are no longer forced through the mandatory workflow.',
  ].join(' ')
}

/**
 * Cancel every live run; called from the plugin disposer.
 *
 * Two obligations that t41 showed were missing (t45, P0):
 *
 * 1. **Be observable.** Before anything is aborted this writes one
 *    `plugin:grok-workflow/dispose` record per affected session (time, uptime,
 *    shutdown signals, trigger class, redacted call site, run count and per-run
 *    elapsed) and one diagnostics line, so "who unloaded the plugin" is answerable
 *    from the log.
 * 2. **Say what it broke, once.** A session whose run is interrupted gets one
 *    user-visible notice; an *idle* unload — what a user does on purpose when
 *    disabling the plugin from the settings surface — stays silent, because a
 *    direct answer is the expected behaviour there and a per-message banner
 *    would be noise.
 *
 * Every write is contained: this runs inside a disposer, where the session
 * service may already be gone, and a refused record must never stop the
 * cancellation that follows it.
 */
export async function disposeActiveState(
  state: ActiveState,
  context: DisposalContext = {},
): Promise<DisposeRecord> {
  const logger: WorkflowLogger = context.logger ?? { warn: () => {} }
  const now = Date.now()
  state.disposed = true
  state.unloadedAt = now

  const runs = [...state.runs]
  const infos = runs
    .map(run => state.active.get(run))
    .filter((info): info is ActiveRunInfo => info !== undefined)
  const record: DisposeRecord = {
    v: 1,
    at: new Date(now).toISOString(),
    uptimeMs: Math.max(0, now - state.createdAt),
    signals: [...state.signals ?? []],
    trigger: classifyDisposeTrigger(context.callSite ?? '', state.signals ?? []),
    callSite: callSiteFrames(context.callSite),
    activeRuns: runs.length,
    pending: state.pending,
    runs: infos
      .map((info): DisposeRunInfo => ({
        runId: info.runId,
        // Only a real session id is worth recording: the placeholder used by the
        // cap would read like an identity that exists.
        ...info.sessionId === UNKNOWN_SESSION ? {} : { sessionId: info.sessionId },
        startedAtMs: info.startedAtMs,
        elapsedMs: Math.max(0, now - info.startedAtMs),
      }))
      .sort((left, right) => left.startedAtMs - right.startedAtMs)
      .slice(0, 32),
    notices: 0,
  }

  // One record and at most one notice per affected session, written *before* the
  // abort: afterwards every session is racing its own turn teardown.
  const bySession = new Map<string, { session?: Session; interrupted: number }>()
  for (const info of infos) {
    const entry = bySession.get(info.sessionId)
      ?? { ...info.session === undefined ? {} : { session: info.session }, interrupted: 0 }
    entry.interrupted += 1
    bySession.set(info.sessionId, entry)
  }
  if (bySession.size === 0) {
    // Idle unload: nothing was damaged, so nothing is written into any session.
    // A user who disables the plugin on purpose gets a direct answer, silently —
    // a per-message banner there would be noise, and there is no run to explain.
    logger.info?.(
      `dsh-grok-workflow: disposed with no active run (trigger=${record.trigger}, uptime=${formatElapsed(record.uptimeMs)})`,
    )
  } else {
    logger.warn(
      `dsh-grok-workflow: disposing with ${record.activeRuns} active and ${record.pending} starting run(s) ` +
      `(trigger=${record.trigger}, uptime=${formatElapsed(record.uptimeMs)}, sessions=${bySession.size}); ` +
      'the runs are cancelled and each affected session receives one interruption notice',
    )
    let notices = 0
    for (const [sessionId, entry] of bySession) {
      const scoped: DisposeRecord = {
        ...record,
        runs: record.runs.filter(run => run.sessionId === sessionId),
        notices: 0,
      }
      const wrote = appendUnloadNotice(entry.session, unloadNoticeText(scoped, entry.interrupted), logger)
      if (wrote) notices += 1
      recordDispose(entry.session, { ...scoped, notices: wrote ? 1 : 0 }, logger)
    }
    record.notices = notices
  }

  state.controller.abort('grok-workflow plugin unloaded')
  state.runs.clear()
  state.active.clear()
  state.starting.clear()
  await Promise.allSettled(runs.map(async run => {
    try {
      run.cancel('grok-workflow plugin unloaded')
    } catch (error) {
      logger.warn(`run cancel failed during unload: ${redactError(error)}`)
    }
    await run.dispose()
  }))
  return record
}

/** A combined signal plus the hook that releases its listeners. */
export interface CombinedSignal {
  signal: AbortSignal
  dispose: () => void
}

/**
 * Combine signals without depending on `AbortSignal.any` availability.
 *
 * The manual path registers one listener per source, so it also returns a
 * disposer: a long-lived plugin controller would otherwise accumulate a listener
 * per run and eventually trip the EventEmitter warning.
 */
export function anySignal(signals: AbortSignal[]): CombinedSignal {
  const anyFn = (AbortSignal as unknown as { any?: (values: AbortSignal[]) => AbortSignal }).any
  if (typeof anyFn === 'function') return { signal: anyFn(signals), dispose: () => {} }
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  const bound: AbortSignal[] = []
  for (const signal of signals) {
    if (signal.aborted) {
      abort()
      break
    }
    signal.addEventListener('abort', abort, { once: true })
    bound.push(signal)
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const signal of bound) signal.removeEventListener('abort', abort)
    },
  }
}

/** Inputs for one workflow run. */
export interface RunWorkflowOptions {
  ctx: Context
  config: ResolvedConfig
  state: ActiveState
  logger: WorkflowLogger
  /** Agent that owns the run; it is the engine's parent and result surface. */
  agent: Agent
  /** Fully composed objective (already redacted by the caller). */
  objective: string
  /** Optional caller-supplied plan. */
  callerTasks?: NormalizedTask[]
  /**
   * Compiled earlier rounds of this session (v0.5), produced by
   * `src/carryover.ts`. Absent/empty on a first round, which keeps the request
   * payload identical to the pre-0.5 one.
   */
  carryover?: string
  /** Extra cancellation sources (the tool's exec signal, or the gate's own). */
  signals?: AbortSignal[]
  /**
   * How non-timeout failures leave this function: the tool contract throws so a
   * caller sees an error, while the gate converts every failure into an explicit
   * failure report that it can show the user.
   */
  failureMode?: 'throw' | 'report'
}

/** Outcome of one run attempt: a validated report, or an explicit failure report. */
export interface RunOutcome {
  report: WorkflowReport
  /** True when the run produced a validated `completed`/`partial` report. */
  ok: boolean
  /** Failure cause for logs and record keeping, when `ok` is false. */
  cause?: string
}

/**
 * Start one workflow run and resolve with a report. Throws only for conditions
 * the caller can classify (busy/unavailable); engine failures become an explicit
 * failure report so that no caller can silently answer without the workflow.
 */
/** Read the session attached to an agent, when the runtime exposes one. */
function sessionOfAgent(agent: Agent): Session | undefined {
  try {
    return (agent as unknown as { session?: Session }).session
  } catch {
    return undefined
  }
}

/**
 * Copy language for every user-visible progress string (Issue #22, P1-3).
 *
 * Read from the Host's own settings projection, never guessed: the DSH locale
 * plugin owns the `locale` namespace and stores the selection in its `preference`
 * field (`@deepseek-ai/dsh-client-locale/lib/index.js:4-14`), and this plugin
 * already reads the same projection for its settings page (`src/settings.ts`).
 * An absent preference means "delegate to the browser", which a Host cannot
 * observe, so it falls back to the shipped Chinese copy rather than inventing one.
 * @param ctx - plugin context.
 * @returns the language the panel should render in.
 */
export function progressNamingLanguage(ctx: Context): NamingLanguage {
  try {
    const get = (ctx as unknown as { get?: unknown }).get
    if (typeof get !== 'function') return 'zh'
    const settings = (get as (key: string) => unknown).call(ctx, 'settings') as
      { describe?: (options?: { redactSecrets?: boolean }) => { ns?: unknown, value?: unknown }[] } | undefined
    if (settings === undefined || typeof settings.describe !== 'function') return 'zh'
    return namingLanguageFromSettings(settings.describe({ redactSecrets: true }))
  } catch {
    return 'zh'
  }
}

/**
 * Repair the parts of a stopped run's value that the report format insists on.
 *
 * Two shapes are legal in a report but not guaranteed when the engine was stopped
 * mid-flight: every task needs at least one attempt row (and sequential numbers from
 * 1), and every `failed` task must appear exactly once in `incomplete` with a
 * non-empty reason. Repairing the shape keeps the report — and with it the verified
 * work — instead of throwing the whole run away; nothing is invented about what a
 * child did, because a never-started task becomes `attempt: 1` with
 * `execution: null` and a `not started` reason, and its id is returned so the caller
 * can label it.
 * @param value - the engine's value, still untrusted.
 * @returns the value to validate, plus the ids of tasks that never started.
 */
function repairStoppedShape(value: unknown): { value: unknown, notStarted: string[] } {
  if (typeof value !== 'object' || value === null) return { value, notStarted: [] }
  const root = value as { tasks?: unknown, incomplete?: unknown }
  if (!Array.isArray(root.tasks)) return { value, notStarted: [] }
  const notStarted: string[] = []
  const tasks = root.tasks.map(item => {
    if (typeof item !== 'object' || item === null) return item
    const attempts = (item as { attempts?: unknown }).attempts
    if (Array.isArray(attempts) && attempts.length > 0) return item
    const id = String((item as { id?: unknown }).id ?? '')
    if (id !== '') notStarted.push(id)
    return {
      ...item as object,
      attempts: [{
        attempt: 1,
        execution: null,
        verification: null,
        passed: false,
        error: 'not started: the run was stopped before this task began',
      }],
    }
  })
  const incomplete: unknown[] = Array.isArray(root.incomplete) ? [...root.incomplete] : []
  for (const item of tasks) {
    if (typeof item !== 'object' || item === null) continue
    const reportTask = item as { id?: unknown, status?: unknown, error?: unknown }
    if (reportTask.status !== 'failed') continue
    const id = String(reportTask.id ?? '')
    if (id === '') continue
    const listed = incomplete.some(entry => {
      if (typeof entry !== 'object' || entry === null) return false
      const row = entry as { taskId?: unknown, reason?: unknown }
      return String(row.taskId ?? '') === id && typeof row.reason === 'string' && row.reason !== ''
    })
    if (listed) continue
    const error = typeof reportTask.error === 'string' && reportTask.error !== '' ? reportTask.error : ''
    incomplete.push({
      taskId: id,
      reason: error === '' ? 'the run was stopped before this task produced a result' : error,
      category: 'cancelled' as FailureCategory,
    })
  }
  return { value: { ...value as object, tasks, incomplete }, notStarted }
}

export function keepCancelledWork(
  value: unknown,
  objective: string,
  config: ResolvedConfig,
  phase: string,
  message: string,
): WorkflowReport | undefined {
  if (value === undefined || value === null) return undefined
  let kept: WorkflowReport
  let notStarted: string[] = []
  try {
    // A stopped value is repaired to the report's required shape, and the ids of
    // tasks that never started are remembered so they can be labelled below.
    const repaired = repairStoppedShape(value)
    notStarted = repaired.notStarted
    kept = assertWorkflowReport(repaired.value, objective, config)
  } catch {
    // A half-written value is not evidence: report the stop instead of guessing.
    return undefined
  }
  const tasks = kept.tasks.map(reportTask => {
    if (reportTask.status === 'verified') return reportTask
    const started = !notStarted.includes(reportTask.id)
    const reason = started
      ? 'interrupted: the run was stopped before this task produced a verified result'
      : 'not started: the run was stopped before this task began'
    const existing = reportTask.error ?? ''
    return {
      ...reportTask,
      status: 'failed' as const,
      // A task that never started still needs one attempt row: the report format
      // requires it, and `attempt: 0` is already the "no child call happened"
      // marker this codebase uses in the route trail (`RouteTrailEntry`).
      attempts: reportTask.attempts,
      error: existing === '' ? reason : `${existing} (${reason})`,
    }
  })
  const unfinished = tasks.filter(reportTask => reportTask.status !== 'verified')
  // Each unfinished task is named exactly once (the report format enforces it), so a
  // row the engine already carried is kept rather than duplicated.
  const listed = new Set(kept.incomplete.map(item => item.taskId))
  const incomplete: IncompleteItem[] = [
    ...kept.incomplete,
    ...unfinished.filter(reportTask => !listed.has(reportTask.id)).map(reportTask => ({
      taskId: reportTask.id,
      reason: reportTask.error === undefined || reportTask.error === '' ? 'the run was stopped before this task finished' : reportTask.error,
      category: 'cancelled' as FailureCategory,
    })),
  ]
  return redactDeep({
    ...kept,
    // Never `completed`: a stopped run is a stop, however much of it finished.
    // `partial` is the only status the report format allows beside a verified task
    // ("failed cannot contain a verified task"), so it is what a stop with kept work
    // reports; a stop with nothing verified stays `failed`.
    status: tasks.some(reportTask => reportTask.status === 'verified') ? 'partial' : 'failed',
    tasks,
    incomplete: incomplete.length > 0
      ? incomplete
      : [{ taskId: 'workflow', reason: message, category: 'cancelled' as FailureCategory }],
    errors: [...kept.errors, { phase, message, category: 'cancelled' as FailureCategory }],
  })
}

export async function runWorkflow(options: RunWorkflowOptions): Promise<RunOutcome> {
  const { ctx, config, state, logger, agent, objective } = options
  if (state.disposed) throw new Error(`${workflowLabel(config)} is unavailable: plugin has been unloaded`)
  const callerTasks = options.callerTasks
  // C1 cross-run hint: snapshot which route labels other live runs configured
  // (approximate, run-level only — see snapshotBusyRoutes/A16). Taken before
  // admission so the snapshot never includes this run itself; omitted from the
  // payload when empty so a solitary run stays byte-identical to before.
  const busyHint = snapshotBusyRoutes(state)
  const request = buildWorkflowRequest(objective, callerTasks, config, progressNamingLanguage(ctx), options.carryover, busyHint)
  // Two independent caps (t41, P1-3): the per-session one is what a user can
  // reason about ("this conversation already runs two workflows"), and the
  // process-wide one only exists so a fleet of sessions cannot unbounded the
  // child-agent count. Before t45 there was a single process-wide cap, and two
  // long runs in one workspace starved every other workspace: four refusals in
  // three different sessions, all with "already has 2 active run(s)".
  const sessionId = sessionIdOf(agent)
  const sessionActive = activeCountOfSession(state, sessionId)
  if (sessionActive >= config.maxActiveRuns) {
    const now = Date.now()
    const holders = runsOfSession(state, sessionId).map(info => describeHolder(info, now))
    throw new Error(
      `${workflowLabel(config)} already has ${sessionActive} active run(s) in this session; ` +
      `maxActiveRuns is ${config.maxActiveRuns} per session` +
      (holders.length === 0 ? '' : ` (holding: ${holders.slice(0, 3).join(', ')})`),
    )
  }
  const totalActive = state.runs.size + state.pending
  if (totalActive >= config.maxActiveRunsTotal) {
    const now = Date.now()
    const holders: string[] = []
    const seen = new Set<string>()
    for (const info of [...state.active.values()].sort((left, right) => left.startedAtMs - right.startedAtMs)) {
      if (seen.has(info.sessionId)) continue
      seen.add(info.sessionId)
      const count = runsOfSession(state, info.sessionId).length
      holders.push(`session ${info.sessionId} (${count} run(s), oldest ${formatElapsed(now - info.startedAtMs)})`)
    }
    throw new Error(
      `${workflowLabel(config)} already has ${totalActive} active run(s) across ${seen.size || 'several'} session(s); ` +
      `maxActiveRunsTotal is ${config.maxActiveRunsTotal}` +
      (holders.length === 0 ? '' : ` (holding: ${holders.slice(0, 3).join(', ')})`),
    )
  }

  const mode = options.failureMode ?? 'throw'
  const timeoutController = new AbortController()
  let timedOut = false
  // t47: the deadline is a plugin-owned hard bound, not a hint to the engine. The
  // t46 acceptance round measured a run that was still working five minutes after a
  // 60 s deadline: the timer aborted the signal and asked the engine to cancel, and
  // the turn then waited for the engine to settle. This promise lets the caller stop
  // waiting, so a deadline always produces a report on time whether or not the
  // engine honours the abort.
  let hitDeadline: (() => void) | undefined
  const deadline = new Promise<'deadline'>(resolve => { hitDeadline = () => resolve('deadline') })
  const timer = setTimeout(() => {
    timedOut = true
    timeoutController.abort()
    hitDeadline?.()
  }, config.timeoutMs)
  timer.unref?.()
  const combined = anySignal([state.controller.signal, timeoutController.signal, ...options.signals ?? []])
  const signal = combined.signal
  // The category tells a reader who failed: a deadline or a broken engine is
  // infrastructure (a retry may succeed), while a deliberate stop or a report
  // we could not validate is a configuration/runtime problem of ours (G-4).
  const categoryFor = (cause: string): FailureCategory => {
    if (cause === 'timeout' || cause === 'engine-error') return 'infrastructure'
    // A deliberate stop is neither a broken provider nor bad work: it is the
    // caller's decision, so it gets its own category instead of being filed as a
    // configuration fault nobody can fix (t14, F4).
    if (cause === 'cancelled' || cause === 'unloaded') return 'cancelled'
    return 'configuration'
  }
  // The report this run will return, captured for the archive write in `finally`:
  // the round entry is written exactly once, from the authoritative verdict.
  let lastReport: WorkflowReport | undefined
  let lastCause: string | undefined
  const asReport = (phase: string, message: string, cause: string): RunOutcome => {
    const report = redactDeep(failureReport(objective, config, phase, message, categoryFor(cause)))
    lastReport = report
    lastCause = cause
    return { report, ok: false, cause }
  }
  // A deadline always yields a report: the caller asked for work and must learn
  // that it stopped, not receive an exception the transport may swallow.
  const timeout = (message: string): RunOutcome => asReport('Timeout', message, 'timeout')
  const failure = (phase: string, message: string, cause: string): RunOutcome => {
    if (mode === 'throw') throw new Error(`${workflowLabel(config)} ${cause}: ${message}`)
    return asReport(phase, message, cause)
  }
  // P0-4: a stop that arrives before the run exists must not start it. Starting
  // first and cancelling after is how a cancelled turn used to spend one engine
  // call, one planner and one worker before noticing (the `signal.aborted` check
  // below the start only ever ran after `workflowEngine.start` returned).
  if (signal.aborted) {
    return failure(
      state.disposed ? 'Unloaded' : 'Cancelled',
      state.disposed
        ? `${workflowLabel(config)} was cancelled before it started because the plugin was unloaded; no agent was launched`
        : `${workflowLabel(config)} was cancelled before it started, so no agent was launched`,
      state.disposed ? 'unloaded' : 'cancelled',
    )
  }
  state.pending += 1
  state.starting.set(sessionId, (state.starting.get(sessionId) ?? 0) + 1)
  let run: WorkflowRun | undefined
  let cancelOnAbort: (() => void) | undefined
  let removeStartupAbort: (() => void) | undefined
  // The stop reason the engine settled on; `run-end` reports it, and a run that
  // never settles (an engine throw) is reported as an error rather than silently
  // left open in the GUI.
  let settledStop: WorkflowStopReason | undefined
  // Final status of the report this run actually returned. `run-end` is closed with
  // the *task-level* result, not with the engine's stop reason: a verifier that
  // rejects the work ends the program normally, so `completed` from the engine would
  // render "任务已完成" for a task nobody verified (Issue #22, P1-1).
  let reportStatus: FinalStatus | undefined
  // Progress recording is a presentation switch: one GUI node with a member row
  // per subagent. It is subscribed *before* the run exists so the first
  // `agent-start` cannot be missed, and it never affects the run itself.
  const progress = config.showProgress
    ? createWorkflowProgressRecorder(sessionOfAgent(agent), logger)
    : undefined
  const stopProgressListeners: (() => void)[] = []
  /**
   * The incremental memory archive for this run.
   *
   * Unlike the progress panel this is NOT a presentation switch: it is the durable
   * record a later session reads, so it is created on every run. It subscribes to
   * the engine's own settlement events, which is what makes a finished round a
   * durable fact *at the moment it finishes* rather than at session exit: the child
   * that just answered is archived by `workflow/agent-end`, and the round's verdict
   * is archived when this function settles. Every write is contained — a disk that
   * refuses it costs a warning line, never the run.
   */
  const archiver = createMemoryArchiver({
    ctx,
    logger,
    ...sessionId === undefined ? {} : { sessionId },
  })
  /**
   * Subscribe one engine event and keep its disposer.
   *
   * Subscribing is part of "recording never affects the run": a context with no
   * event bus (a bare unit-test context) or one that refuses the listener costs
   * the panel entry, never the workflow.
   */
  const listen = (register: () => unknown): void => {
    try {
      const off = register()
      if (typeof off === 'function') stopProgressListeners.push(off as () => void)
    } catch (error) {
      logger.warn(`engine event subscription is unavailable: ${redactError(error)}`)
    }
  }
  if (typeof ctx.on === 'function') {
    if (progress !== undefined) {
      listen(() => ctx.on('workflow/agent-start', (info, member) => { progress.agentStart(String(info.id), member) }))
      listen(() => ctx.on('workflow/agent-end', (info, member) => { progress.agentEnd(String(info.id), member) }))
    }
    // Memory subscriptions are separate from the panel's: archiving is not optional.
    listen(() => ctx.on('workflow/agent-start', (info, member) => { archiver.agentStart(String(info.id), memberFromStart(member)) }))
    listen(() => ctx.on('workflow/agent-end', (info, member) => { archiver.agentEnd(String(info.id), memberFromEnd(member)) }))
  }
  try {
    try {
      const start: WorkflowStartRequest = {
        script: request.script,
        meta: request.meta,
        args: request.args,
        parent: agent,
        signal,
        maxTotalAgents: request.maxTotalAgents,
        ...config.subagentProvider === undefined ? {} : { subagentProvider: config.subagentProvider },
      }
      // Startup is part of the run's deadline. Racing only `run.result` left
      // the caller blocked forever when workflowEngine.start() itself never settled.
      const startingPromise = Promise.resolve().then(() => teamWorkflowEngine(ctx, logger).start(start))
      const startupCancelled = new Promise<'cancelled'>(resolve => {
        const onAbort = (): void => {
          // The deadline aborts the same combined signal. Let the deadline
          // branch win so timeout is not misreported as a caller cancellation.
          if (!timedOut) resolve('cancelled')
        }
        if (signal.aborted) onAbort()
        else {
          signal.addEventListener('abort', onAbort, { once: true })
          removeStartupAbort = () => signal.removeEventListener('abort', onAbort)
        }
      })
      const startup = await Promise.race([
        startingPromise.then(
          value => ({ kind: 'started' as const, run: value }),
          error => ({ kind: 'error' as const, error }),
        ),
        deadline.then(() => ({ kind: 'deadline' as const })),
        startupCancelled.then(() => ({ kind: 'cancelled' as const })),
      ])
      if (startup.kind === 'deadline' || (startup.kind === 'cancelled' && timedOut)) {
        const reason = 'workflow deadline exceeded after ' + config.timeoutMs + ' ms during startup'
        // The caller can return now, but the engine may still hand back a run later.
        // Observe the pending promise and dispose that late resource immediately.
        void startingPromise.then(async lateRun => {
          try { await lateRun.cancel(reason) } catch (error) {
            logger.warn('late workflow startup cancellation failed: ' + redactError(error))
          }
          try { await lateRun.dispose() } catch (error) {
            logger.warn('late workflow startup dispose failed: ' + redactError(error))
          }
        }, () => {})
        return timeout('workflow exceeded the ' + config.timeoutMs + ' ms deadline during startup')
      }
      if (startup.kind === 'cancelled') {
        const reason = state.disposed
          ? workflowLabel(config) + ' was unloaded during workflow startup'
          : workflowLabel(config) + ' was cancelled by its caller during workflow startup'
        settledStop = 'cancelled'
        void startingPromise.then(async lateRun => {
          try { await lateRun.cancel(reason) } catch (error) {
            logger.warn('late cancelled workflow startup cancellation failed: ' + redactError(error))
          }
          try { await lateRun.dispose() } catch (error) {
            logger.warn('late cancelled workflow startup dispose failed: ' + redactError(error))
          }
        }, () => {})
        return failure(state.disposed ? 'Unloaded' : 'Cancelled', reason, state.disposed ? 'unloaded' : 'cancelled')
      }
      if (startup.kind === 'error') {
        if (timedOut) return timeout('workflow exceeded the ' + config.timeoutMs + ' ms deadline during startup')
        if (signal.aborted) {
          const reason = state.disposed
            ? workflowLabel(config) + ' was unloaded during workflow startup'
            : workflowLabel(config) + ' was cancelled by its caller during workflow startup'
          settledStop = 'cancelled'
          return failure(state.disposed ? 'Unloaded' : 'Cancelled', reason, state.disposed ? 'unloaded' : 'cancelled')
        }
        throw startup.error
      }
      run = startup.run
      // The node is announced before the script can produce anything, which is
      // what turns "several minutes of empty window" into a live row (t43).
      progress?.runStart(run)
      // Adopt before the script can settle anything: `agent-start`/`agent-end` are
      // process-wide, and only a run this archiver owns may write entries.
      archiver.adopt(String(run.id), String(run.meta.name))
      if (state.disposed) {
        run.cancel('grok-workflow plugin unloaded')
        settledStop = 'cancelled'
        throw new Error(`${workflowLabel(config)} cancelled: plugin unloaded`)
      }
      state.runs.add(run)
      const owner = sessionOfAgent(agent)
      state.active.set(run, {
        runId: run.id,
        sessionId,
        ...owner === undefined ? {} : { session: owner },
        startedAtMs: Date.now(),
        // C1 hint source: what this run configured, so a later admission can
        // deprioritize the same labels. Run-level only, never live counts.
        routes: configRouteLabels(config),
      })
      // Belt and braces for in-turn delivery: `start({signal})` documents that an
      // aborted signal cancels the run, but an in-turn wait lives inside the open
      // turn, so a forgotten cancel would hang the turn until the deadline. This
      // listener makes the guarantee independent of the engine's implementation.
      const active = run
      cancelOnAbort = () => {
        // The reason string is what the engine echoes back, so it has to name the
        // real cause: an unload and a caller cancellation are indistinguishable
        // once only `cancelled` survives (t41, P0-2). t47 added the third cause:
        // the deadline used to be announced as "cancelled by its caller", which
        // pointed the reader at the wrong actor.
        const reason = state.disposed
          ? 'grok-workflow plugin unloaded'
          : timedOut
            ? `workflow deadline exceeded after ${config.timeoutMs} ms`
            : 'workflow cancelled by its caller'
        void active.cancel(reason)
      }
      signal.addEventListener('abort', cancelOnAbort, { once: true })
      if (signal.aborted) cancelOnAbort()
      if (timedOut) {
        run.cancel('workflow deadline exceeded during startup')
        settledStop = 'cancelled'
        return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled`)
      }
    } finally {
      state.pending -= 1
      const startingHere = (state.starting.get(sessionId) ?? 1) - 1
      if (startingHere <= 0) state.starting.delete(sessionId)
      else state.starting.set(sessionId, startingHere)
    }

    const activeRun = run
    // The deadline wins the race even when the engine keeps working: the caller asked
    // for bounded work and must be told the bound was hit, not left waiting for an
    // engine that ignores `cancel`.
    const raced = await Promise.race([activeRun.result, deadline])
    if (raced === 'deadline') {
      void activeRun.cancel(`workflow deadline exceeded after ${config.timeoutMs} ms`)
      settledStop = 'cancelled'
      return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled; the engine had not settled, so this report is the authoritative result`)
    }
    const result = raced
    settledStop = result.stopReason
    if (timedOut) {
      return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled`)
    }
    if (result.stopReason === 'completed') {
      try {
        const report = redactDeep(assertWorkflowReport(result.value, objective, config))
        reportStatus = report.status
        // The ledger is plugin-owned state: the deterministic report is the truth,
        // the record survives for diagnostics and for the next run's audit trail.
        // Run records are a configuration switch: a user who does not want the
        // plugin appending ledger entries to the session can turn them off, and
        // `recordLimit` bounds what is written.
        if (config.recordRuns) {
          recordRouting(sessionOfAgent(agent), {
            objective,
            routing: report.routing,
            synthesis: report.synthesis.mode,
            routes: report.routes,
          }, logger, config.recordLimit)
        }
        lastReport = report
        lastCause = undefined
        return { report, ok: true }
      } catch (error) {
        const detail = redactError(error)
        logger.warn(`report validation failed: ${detail}`)
        return failure('Report validation', detail, 'report-invalid')
      }
    }
    if (result.stopReason === 'cancelled') {
      // Split by cause (t45, P0-2). Before t45 both exits read "was cancelled
      // before it produced a report", so a maintainer could not tell a user stop
      // from the plugin being unloaded underneath the run — which is exactly what
      // happened twice in t41, in two workspaces, 573 ms apart.
      //
      // P0-4: whatever the engine already finished is kept. A stop is a terminal
      // state, not a licence to delete verified work.
      const phase = state.unloadedAt !== undefined ? 'Unloaded' : 'Cancelled'
      const message = state.unloadedAt !== undefined
        ? `${workflowLabel(config)} was cancelled because the plugin was unloaded while the run was in flight ` +
          `(not a deadline and not a manual stop); the plugin's dispose record in this session says when and by what`
        : `${workflowLabel(config)} was cancelled by its caller before the whole run finished; finished tasks are kept and unfinished ones are marked`
      const cause = state.unloadedAt !== undefined ? 'unloaded' : 'cancelled'
      const kept = keepCancelledWork(result.value, objective, config, phase, message)
      if (kept !== undefined) {
        lastReport = kept
        lastCause = cause
        return { report: kept, ok: false, cause }
      }
      return failure(phase, message, cause)
    }
    const detail = redactSecrets(String(result.error ?? 'unknown workflow failure'))
    return failure('Engine error', detail, 'engine-error')
  } finally {
    clearTimeout(timer)
    if (cancelOnAbort !== undefined) signal.removeEventListener('abort', cancelOnAbort)
    // Close the node even when this function throws: an abandoned node would read
    // as "still running" in the panel until the turn ends.
    if (run !== undefined) progress?.runEnd(run.id, progressStopReason(settledStop ?? 'error', reportStatus))
    progress?.dispose()
    // The round is archived here — before this function returns to the turn — so a
    // later round that "checks memory" finds it, whether or not the session that
    // produced it ever reaches its own end.
    if (run !== undefined) {
      archiver.round({
        runId: String(run.id),
        runName: String(run.meta.name),
        ...sessionId === undefined ? {} : { sessionId },
        objective,
        ...lastReport === undefined ? {} : { status: lastReport.status },
        ...lastCause === undefined ? {} : { cause: lastCause },
        summary: roundArchiveSummary(lastReport, lastCause),
        evidence: roundArchiveEvidence(lastReport),
      })
    }
    archiver.dispose()
    for (const off of stopProgressListeners ?? []) off()
    removeStartupAbort?.()
    combined.dispose()
    if (run !== undefined) {
      state.runs.delete(run)
      state.active.delete(run)
      try {
        await run.dispose()
      } catch (error) {
        logger.warn(`run disposal failed: ${redactError(error)}`)
      }
    }
  }
}

/**
 * One child call, no plan, no verifier: the answer a chat or fast tier spends.
 *
 * Added in t52 for the front desk (plan C). The cheap tiers must not pay for the
 * full workflow — a greeting that costs a planner, a worker and a verifier is not
 * a greeting — so they run a script of exactly one `agent()` and return its text.
 * The call still goes through the engine rather than through a provider directly,
 * because the engine is what attributes the child to the parent agent, applies
 * the child ceiling and reports `workflow/agent-start` to the progress panel: a
 * side channel would make those three facts untrue for the cheap tiers.
 *
 * The route is `config.triageModel` when set, else the run's own route (`agent()`'s
 * default), which is why an unconfigured front desk costs no extra model.
 */
export interface SingleCallOptions {
  ctx: Context
  config: ResolvedConfig
  state: ActiveState
  logger: WorkflowLogger
  agent: Agent
  /** The whole prompt handed to the child. */
  prompt: string
  /** Label shown for the child in the progress panel and the session log. */
  label: string
  /** Extra cancellation sources (the gate's step signal). */
  signals?: AbortSignal[]
}

/** Outcome of one front-desk call. */
export type SingleCallOutcome =
  | { ok: true, text: string, retried?: boolean }
  | { ok: false, reason: string }

/** Name of the single-call run in the panel (`workflowRun` title). */
const TRIAGE_RUN_LABEL = 'Front desk'

/**
 * Build the guest script for one call: one `agent()`, one string field back.
 *
 * The schema is not decoration: without it the guest collapses "the child failed"
 * and "the child returned no value" into the same `null`, and a failed greeting
 * would be delivered as an empty one.
 * @param prompt - the prompt handed to the child.
 * @param label - child label.
 * @param route - optional provider/model override.
 * @returns the script body.
 */
function singleCallScript(
  prompt: string,
  label: string,
  route: { provider?: string, model?: string },
  structured: boolean,
): string {
  const call: Record<string, unknown> = { label, phase: 'Answer' }
  if (structured) {
    call.schema = {
      type: 'object',
      required: ['reply'],
      properties: { reply: { type: 'string' } },
    }
  }
  if (route.provider !== undefined) call.provider = route.provider
  if (route.model !== undefined) call.model = route.model
  // `value` is the child's structured result with a schema and its text without
  // one; both shapes are accepted so the caller reads one field either way.
  return `const value = await agent(${JSON.stringify(prompt)}, ${JSON.stringify(call)})
if (typeof value === 'string') return { reply: value }
if (value && typeof value.reply === 'string') return { reply: value.reply }
if (value && typeof value.text === 'string') return { reply: value.text }
return { reply: null }
`
}

/**
 * Answer one message with a single child call.
 *
 * Never throws: a provider failure, a deadline or a cancelled turn becomes
 * `{ok: false, reason}`, and the caller states it in the answer instead of
 * silently falling back to a full run (the front desk may not quietly upgrade a
 * "quick" answer into a ten-minute team run).
 * @param options - call request.
 * @returns the text, or why there is none.
 */
export async function runSingleCall(options: SingleCallOptions): Promise<SingleCallOutcome> {
  const { ctx, config, state, logger, agent, prompt, label } = options
  if (state.disposed) return { ok: false, reason: workflowLabel(config) + ' is unavailable: plugin has been unloaded' }
  const route = config.triageModel === undefined
    ? {}
    : config.triageModel.provider === undefined
      ? { model: config.triageModel.model }
      : { provider: config.triageModel.provider, model: config.triageModel.model }
  const deadlineMs = config.timeoutMs
  const signals = options.signals ?? []
  let stopped = false

  /**
   * One attempt of the front-desk call.
   *
   * The deadline and cancellation signal cover startup as well as execution.
   * Registering the returned run in the shared lifetime state makes quick calls
   * visible to plugin unload, the same way a full workflow run is.
   */
  const attempt = async (structured: boolean): Promise<SingleCallOutcome> => {
    if (state.disposed) {
      stopped = true
      return { ok: false, reason: workflowLabel(config) + ' is unavailable: plugin has been unloaded' }
    }

    state.pending += 1
    const sessionId = sessionIdOf(agent)
    state.starting.set(sessionId, (state.starting.get(sessionId) ?? 0) + 1)
    let starting = true
    const finishStarting = (): void => {
      if (!starting) return
      starting = false
      state.pending = Math.max(0, state.pending - 1)
      const count = state.starting.get(sessionId) ?? 0
      if (count <= 1) state.starting.delete(sessionId)
      else state.starting.set(sessionId, count - 1)
    }

    const deadlineController = new AbortController()
    const combined = anySignal([state.controller.signal, ...signals, deadlineController.signal])
    let run: WorkflowRun | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    let resolveStopped: ((value: { kind: 'stopped', reason: string }) => void) | undefined
    const stoppedPromise = new Promise<{ kind: 'stopped', reason: string }>(resolve => {
      resolveStopped = resolve
    })
    const stopReason = (): string => timedOut
      ? 'the front-desk call exceeded the ' + deadlineMs + ' ms deadline'
      : state.disposed
        ? workflowLabel(config) + ' was unloaded while the front-desk call was running'
        : 'the front-desk call was cancelled by its caller'
    const stop = (): void => {
      const reason = stopReason()
      // During plugin disposal the shared disposer owns cancellation and dispose.
      // For a caller stop or deadline, this listener owns the live run's cancel.
      if (run !== undefined && !state.disposed) {
        try { void run.cancel(reason) } catch (error) {
          logger.warn('front-desk run cancellation failed: ' + redactError(error))
        }
      }
      resolveStopped?.({ kind: 'stopped', reason })
    }
    combined.signal.addEventListener('abort', stop, { once: true })
    if (combined.signal.aborted) stop()
    timer = setTimeout(() => {
      timedOut = true
      deadlineController.abort()
    }, deadlineMs)
    timer.unref?.()

    try {
      const start: WorkflowStartRequest = {
        script: singleCallScript(
          structured ? prompt + '\n\nReturn only a JSON object with one field: {"reply": "<your answer>"}.' : prompt,
          label,
          route,
          structured,
        ),
        meta: {
          name: TRIAGE_RUN_LABEL,
          description: 'Answer one message with a single child call (front-desk tier).',
          phases: [{ title: 'Answer', detail: 'One worker answers the message directly.' }],
        },
        args: {},
        parent: agent,
        signal: combined.signal,
        // One child: the tier's whole promise is "one model call".
        maxTotalAgents: 1,
        ...config.subagentProvider === undefined ? {} : { subagentProvider: config.subagentProvider },
      }

      if (combined.signal.aborted) {
        stopped = true
        return { ok: false, reason: stopReason() }
      }

      // Attach both handlers immediately. If the deadline/caller wins while
      // startup is pending, a late run is still cancelled and disposed when the
      // engine finally hands it back; a late rejection is already observed.
      const startingPromise = Promise.resolve().then(() => teamWorkflowEngine(ctx, logger).start(start))
      const startOutcome = await Promise.race([
        startingPromise.then(
          value => ({ kind: 'started' as const, run: value }),
          error => ({ kind: 'error' as const, error }),
        ),
        stoppedPromise,
      ])

      if (startOutcome.kind === 'stopped') {
        stopped = true
        void startingPromise.then(async lateRun => {
          try { await lateRun.cancel(startOutcome.reason) } catch (error) {
            logger.warn('late front-desk run cancellation failed: ' + redactError(error))
          }
          try { await lateRun.dispose() } catch (error) {
            logger.warn('late front-desk run dispose failed: ' + redactError(error))
          }
        }, () => {})
        return { ok: false, reason: startOutcome.reason }
      }
      if (startOutcome.kind === 'error') {
        if (combined.signal.aborted) {
          stopped = true
          return { ok: false, reason: stopReason() }
        }
        return { ok: false, reason: redactError(startOutcome.error) }
      }

      run = startOutcome.run
      finishStarting()
      if (state.disposed) {
        stopped = true
        try { await run.cancel(workflowLabel(config) + ' plugin unloaded during front-desk startup') } catch (error) {
          logger.warn('front-desk run cancellation after unload failed: ' + redactError(error))
        }
        try { await run.dispose() } catch (error) {
          logger.warn('front-desk run dispose after unload failed: ' + redactError(error))
        }
        run = undefined
        return { ok: false, reason: stopReason() }
      }

      state.runs.add(run)
      const owner = sessionOfAgent(agent)
      state.active.set(run, {
        runId: String(run.id),
        sessionId,
        ...(owner === undefined ? {} : { session: owner }),
        startedAtMs: Date.now(),
        routes: [],
      })
      if (combined.signal.aborted) {
        stop()
        stopped = true
        return { ok: false, reason: stopReason() }
      }

      const outcome = await Promise.race([
        run.result.then(
          value => ({ kind: 'result' as const, value }),
          error => ({ kind: 'error' as const, error }),
        ),
        stoppedPromise,
      ])
      if (outcome.kind === 'stopped') {
        stopped = true
        return { ok: false, reason: outcome.reason }
      }
      if (outcome.kind === 'error') {
        return { ok: false, reason: redactError(outcome.error) }
      }
      if (combined.signal.aborted) {
        stopped = true
        return { ok: false, reason: stopReason() }
      }
      if (outcome.value.stopReason !== 'completed') {
        if (outcome.value.stopReason === 'cancelled' || state.disposed || signals.some(signal => signal.aborted)) stopped = true
        return {
          ok: false,
          reason: 'the front-desk call stopped: ' + outcome.value.stopReason +
            (outcome.value.error === undefined ? '' : ' (' + outcome.value.error + ')'),
        }
      }

      const value = outcome.value.value as { reply?: unknown } | string | null
      const text = typeof value === 'string'
        ? value.trim()
        : value !== null && typeof value === 'object' && typeof value.reply === 'string'
          ? value.reply.trim()
          : ''
      if (text === '') {
        logger.warn('front-desk call produced no reply (agentsStarted=' + outcome.value.agentsStarted +
          ' value=' + (JSON.stringify(outcome.value.value)?.slice(0, 120) ?? 'undefined') + ')')
        return { ok: false, reason: 'the front-desk worker returned no text (agentsStarted=' + outcome.value.agentsStarted + ')' }
      }

      archiveRoundNow({
        runId: String(run.id),
        runName: TRIAGE_RUN_LABEL,
        sessionId: sessionIdOf(agent),
        objective: prompt,
        status: 'completed',
        summary: text,
      }, { logger })
      return { ok: true, text }
    } catch (error) {
      logger.warn('front-desk call failed: ' + redactError(error))
      return { ok: false, reason: redactError(error) }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      combined.signal.removeEventListener('abort', stop)
      combined.dispose()
      finishStarting()
      if (run !== undefined) {
        state.runs.delete(run)
        state.active.delete(run)
        // disposeActiveState owns the run after it marks the plugin disposed.
        if (!state.disposed) run.dispose().catch(() => {})
      }
    }
  }

  const plain = await attempt(false)
  if (plain.ok || stopped) return plain
  // One retry, schema-shaped: a cheap answer may cost two calls when the child
  // returns nothing. A stop/deadline is terminal and must never launch a retry.
  const retry = await attempt(true)
  if (retry.ok) return { ok: true, text: retry.text, retried: true }
  return { ok: false, reason: plain.reason + '; retry with a structured answer also failed: ' + retry.reason }
}
