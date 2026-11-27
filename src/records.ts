/**
 * Durable delivery records for the mandatory-entry gate.
 *
 * `appendPluginRecord` writes an `ignorable` event that never enters the
 * model-visible surface, survives fork/resume, and can be read back with
 * `pluginRecordOf` (measured in DSH 0.2.1-rc.2). Records are plugin-owned
 * state: every reader revalidates `data`, because a restored record may carry
 * whatever an earlier build wrote.
 */

import type { Session } from '@deepseek-ai/dsh-session'
import type { WorkflowAgentOutcome, WorkflowStopReason } from '@deepseek-ai/dsh-workflow'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { redactError, redactSecrets } from './redact.js'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import type { WorkflowLogger } from './run.js'
import type { FinalStatus, RouteTrailEntry, RoleName, SynthesisMode } from './types.js'

/**
 * Record type owned by this plugin: a turn terminal the transcript could not carry.
 *
 * A cancelled turn is rejected before any `step/start`, so its terminal cannot be
 * an assistant row (see {@link appendAssistantInStep}). The words still matter —
 * they say why the run stopped and what verified work survives — so they are kept
 * here: one ignorable record, redacted and bounded, readable from the session log.
 */
export const TERMINAL_RECORD = 'plugin:grok-workflow/terminal'

/** Payload stored for one turn terminal that had no open step to attach to. */
export interface TerminalRecord {
  /** Record schema version owned by this plugin. */
  v: 1
  /** Terminal text as composed for the reader; redacted and bounded. */
  text: string
}

/** Record type owned by this plugin: the model-route ledger of one run. */
export const ROUTING_RECORD = 'plugin:grok-workflow/routing'

/**
 * Payload stored for one run's routing ledger.
 *
 * Only *switches* and *failures* are kept (a successful first-route call is not
 * a switch), every free-text field is redacted and bounded, and the whole entry
 * list is capped so a long run cannot grow the record without limit.
 */
export interface RoutingRecord {
  v: 1
  /** Run objective, redacted and bounded; correlates the ledger with a report. */
  objective: string
  /** Effective chains at run time (`provider/model`, or empty for inherit). */
  routing: Record<RoleName, string[]>
  synthesis: SynthesisMode
  /** One entry per route switch, failed call, or concurrency overflow. */
  switches: {
    role: RoleName
    chainIndex: number
    route: string
    attempt: number
    outcome: 'ok' | 'failed'
    failureClass?: string
    reason?: string
    /** Routes skipped as full when this call was placed (overflow, not failure). */
    skippedBusy?: string[]
    /** Milliseconds this call waited for a full route to drain. */
    queuedMs?: number
  }[]
}

/** Maximum switches kept in one ledger record. */
/** Record type owned by this plugin: one observation of the plugin being unloaded. */
export const DISPOSE_RECORD = 'plugin:grok-workflow/dispose'

/** Identity and timing of one run that was live when the plugin went away. */
export interface DisposeRunInfo {
  /** Engine run id; correlates the record with a report and the GUI node. */
  runId: string
  /** Session that owned the run (absent when the runtime exposed none). */
  sessionId?: string
  /** Epoch milliseconds at which the run was admitted. */
  startedAtMs: number
  /** Milliseconds the run had been active when the plugin was disposed. */
  elapsedMs: number
}

/**
 * A durable, self-contained description of one plugin disposal.
 *
 * t41's largest blind spot was that "who unloaded the plugin" was unanswerable
 * after the fact: two runs in two workspaces were cancelled 573 ms apart and the
 * only trace was a `cancelled` stop reason with no cause. This record is written
 * *before* anything is aborted, so a run that dies from an unload can always be
 * explained from the session log alone.
 */
export interface DisposeRecord {
  /** Record schema version owned by this plugin. */
  v: 1
  /** When the disposer ran (ISO 8601, host clock). */
  at: string
  /** Milliseconds since the plugin was applied. */
  uptimeMs: number
  /** Best-effort attribution of the disposer's call path. */
  trigger: DisposeTrigger
  /** Redacted, bounded top frames of the stack that reached the disposer. */
  callSite: string[]
  /** Runs that had started and were live when the disposer ran. */
  activeRuns: number
  /** Runs still starting (admitted, `engine.start` unresolved). */
  pending: number
  /** Identity of each live run, oldest first, bounded. */
  runs: DisposeRunInfo[]
  /** Sessions that received the one-shot interruption notice. */
  notices: number
  /** Shutdown signals received before disposal; empty for an in-process unload. */
  signals: string[]
  /**
   * What the bounded drain did before anything was cancelled.
   *
   * Omitted when no child call was open at disposal, when a shutdown signal
   * skipped the window, and when the window was configured away — "absent" means
   * nothing was in flight to save, which is the honest answer for an idle
   * unload. A reader who needs to know whether the grace window helped looks
   * here: `runsSettled > 0` is work the unload did not throw away.
   */
  drain?: DisposeDrain
}

/**
 * The bounded grace window an unload gives child calls already in flight.
 *
 * Recorded because the difference between "the unload waited and the child
 * finished" and "the unload waited and the child was killed anyway" is the
 * whole point of the window, and neither is visible afterwards from the runs
 * alone.
 */
export interface DisposeDrain {
  /** How long the window stayed open (real elapsed time, bounded by the policy). */
  waitedMs: number
  /** Child calls that had started and not ended when the disposer ran. */
  openAtStart: number
  /** Child calls still open when the window closed; those were cancelled. */
  openAtEnd: number
  /** Runs live at the start that settled inside the window, so nothing was cut. */
  runsSettled: number
  /** True when the window ran out with work still in flight. */
  deadlineHit: boolean
}

/**
 * What kind of event disposed the plugin, inferred from the disposal call path.
 *
 * `unknown` is a first-class value, not a failure: the record still carries the
 * raw stack frames, so a reader can attribute the event later from the log.
 */
export type DisposeTrigger =
  /** A plugin-manager/settings action reloaded or disabled the entry. */
  | 'management'
  /** The process is shutting down (signal or exit path). */
  | 'shutdown'
  /** A test harness disposed the context. */
  | 'test'
  /** Nothing in the stack identified the caller. */
  | 'unknown'

/** Frames kept from the disposal stack: enough for a reader, small enough for a record. */
/**
 * How many call-site frames to keep.
 *
 * Measured (t45, real instance): cordis spends four frames of its own
 * (`dispose` → `finalizeDisposal` → …) before the *caller* appears, so a six-frame
 * budget recorded only cordis internals and every real disposal classified as
 * `unknown`. Twelve reaches the caller (the plugin manager's entry disposal or the
 * CLI's shutdown path) without turning the record into a dump.
 */
const CALL_SITE_FRAMES = 12

/**
 * Attribute a disposal to one cause, without pretending to certainty.
 *
 * Stack scraping alone is not enough and this was measured, not assumed: on a real
 * instance both the SIGTERM path and a settings-page toggle produce a stack whose
 * visible frames are **all cordis internals** (`dispose` → `finalizeDisposal` → …),
 * with the caller above the 12-frame budget — so a stack-only classifier answered
 * `unknown` for both, which is exactly the ambiguity t41 complained about.
 *
 * The reliable signal is a fact the process itself records: a shutdown signal that
 * arrived before disposal. {@link installShutdownProbe} subscribes to the signals
 * at `apply` time, so `signals` is non-empty for shutdown and empty for an
 * in-process unload. The stack is then only a tie-breaker, and `unknown` remains a
 * first-class answer for the case the host does not disclose.
 */
export function classifyDisposeTrigger(stack: string, signals: readonly string[] = []): DisposeTrigger {
  if (signals.length > 0) return 'shutdown'
  const text = stack.toLowerCase()
  if (text.includes('plugin-manager') || text.includes('plugin_manager') || text.includes('pluginmanager')) return 'management'
  // The manager's own entry is reached through the plugin loader's update path.
  if (text.includes('cordis-plugin-loader') || text.includes('updatePlugin') || text.includes('plugin-loader')) return 'management'
  if (text.includes('sigterm') || text.includes('sigint') || text.includes('process.exit') || text.includes('beforeexit')) return 'shutdown'
  if (text.includes('vitest') || text.includes('node:internal/test') || text.includes('fakecontext')) return 'test'
  return 'unknown'
}

/**
 * Record the shutdown signals this process receives, for disposal attribution.
 *
 * Every handler is `once` and merely appends a name, so it cannot interfere with
 * DSH's own signal handling (our listener runs after the host's, but it is
 * synchronous, while the host's teardown awaits — the flag is therefore set before
 * the disposer runs). Returns the disposer that removes the handlers again, so a
 * reload leaves no listeners behind.
 */
export function installShutdownProbe(state: { signals?: string[] }): () => void {
  const process_ = (globalThis as { process?: { once?: (signal: string, listener: () => void) => unknown, off?: (signal: string, listener: () => void) => unknown } }).process
  if (process_?.once === undefined) return () => {}
  const record = (signal: string) => () => {
    const signals = state.signals ?? (state.signals = [])
    if (!signals.includes(signal)) signals.push(signal)
  }
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const
  const listeners = signals.map(signal => [signal, record(signal)] as const)
  for (const [signal, listener] of listeners) process_.once!(signal, listener)
  return () => {
    for (const [signal, listener] of listeners) process_.off?.(signal, listener)
  }
}

/** Keep the head of a stack, redacted and bounded, skipping the throw site itself. */
export function callSiteFrames(stack: string | undefined, limit: number = CALL_SITE_FRAMES): string[] {
  if (typeof stack !== 'string') return []
  return stack
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('at '))
    .slice(0, limit)
    .map(line => ledgerText(line, 160))
}

const ROUTING_RECORD_LIMIT = 64

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    /** The model-route ledger written after a workflow run. */
    'plugin:grok-workflow/routing': RoutingRecord
    /** One observation of this plugin being unloaded (t45, P0-1). */
    'plugin:grok-workflow/dispose': DisposeRecord
    /** A turn terminal the transcript could not carry (no open step). */
    'plugin:grok-workflow/terminal': TerminalRecord
  }
}

/** Roles in report order; also the closed set a ledger switch may name. */
const ROLES: readonly RoleName[] = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer']

/** Coerce a possibly-missing numeric field into a non-negative integer. */
function counter(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return numeric < 0 ? fallback : numeric
}

/** Redact and bound one free-text ledger field. */
function ledgerText(value: string, max: number): string {
  return redactSecrets(value).replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Record the model-route ledger of one run.
 *
 * A run may switch routes many times, so the ledger is one plugin record (not
 * one record per switch): bounded, redacted, and never allowed to throw into
 * the caller that is delivering a workflow answer.
 */
export function recordRouting(
  session: Session | undefined,
  entry: {
    objective: string
    routing: Record<RoleName, string[]>
    synthesis: SynthesisMode
    routes: readonly RouteTrailEntry[]
  },
  logger?: WorkflowLogger,
  limit: number = ROUTING_RECORD_LIMIT,
): void {
  if (session === undefined) return
  // The caller's `recordLimit` bounds the ledger; 0 means "write nothing".
  const cap = Math.max(0, Math.min(limit, ROUTING_RECORD_LIMIT))
  if (cap === 0) return
  // Every field is coerced: one malformed route entry (a missing `attempt`, a
  // non-string route id) must not cost the whole ledger, because the ledger is
  // the only record of how a run picked its models (t28/F3).
  const safeRoute = (route: RouteTrailEntry): RoutingRecord['switches'][number] => ({
    role: ROLES.includes(route.role as RoleName) ? route.role as RoleName : 'worker',
    chainIndex: counter(route.chainIndex, 0),
    route: typeof route.route === 'string' ? route.route.slice(0, 160) : 'inherit',
    attempt: Math.max(1, counter(route.attempt, 1)),
    outcome: route.outcome === 'ok' ? 'ok' : 'failed',
    ...typeof route.failureClass === 'string' ? { failureClass: route.failureClass.slice(0, 60) } : {},
    ...typeof route.reason === 'string' ? { reason: ledgerText(route.reason, 200) } : {},
    // Overflow evidence rides along: a full lane is not a failure, but the
    // ledger is the only durable record of which lane a call actually took.
    ...Array.isArray(route.skippedBusy) && route.skippedBusy.length > 0
      ? { skippedBusy: route.skippedBusy.filter(item => typeof item === 'string').map(item => item.slice(0, 160)).slice(0, 16) }
      : {},
    ...typeof route.queuedMs === 'number' && Number.isFinite(route.queuedMs) ? { queuedMs: Math.max(0, Math.trunc(route.queuedMs)) } : {},
  })
  // Sanitize first, then select: filtering the raw entries would drop a route
  // whose fields were malformed instead of recording its coerced form.
  // Overflow evidence (skippedBusy/queuedMs) is kept too: a yielded lane is
  // neither a switch nor a failure, but the ledger is the only durable record
  // of which lane a call actually took.
  const switches = entry.routes
    .map(safeRoute)
    .filter(route => route.outcome === 'failed' || route.chainIndex > 0 || (route.skippedBusy !== undefined && route.skippedBusy.length > 0) || route.queuedMs !== undefined)
    .slice(0, cap)
  if (switches.length === 0) return
  const routing: Record<RoleName, string[]> = { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] }
  for (const role of ROLES) {
    const chain = (entry.routing as Record<string, unknown> | undefined)?.[role]
    routing[role] = Array.isArray(chain) ? chain.filter(item => typeof item === 'string').map(item => item.slice(0, 160)) : []
  }
  const payload: RoutingRecord = {
    v: 1,
    objective: ledgerText(typeof entry.objective === 'string' ? entry.objective : '', 400),
    routing,
    synthesis: entry.synthesis === 'model' ? 'model' : 'deterministic',
    switches,
  }
  try {
    appendPluginRecord(session, ROUTING_RECORD, payload)
  } catch (error) {
    logger?.warn(`could not record the routing ledger: ${redactError(error)}`)
  }
}

// ---------------------------------------------------------------------------
// Progress records: the Web GUI's workflow-run node
// ---------------------------------------------------------------------------

/**
 * Progress records: the plugin-record channel the Web GUI's workflow-run node folds.
 *
 * These are written with `appendPluginRecord`, so each event lands as `ignorable` and
 * never enters the model-visible surface: an older reader that has never heard of a
 * type skips it instead of refusing the whole log, and fork/resume carry the records
 * with the rest of the journal. The old `tool-workflow/*` names for the same facts
 * polluted the session: the harness rejects a log whose `ignorable != true` event has
 * a type outside its known set, so two real sessions stopped opening. The payload
 * shapes are unchanged — only the channel moved — and `test/records.spec.ts` still
 * pins the shapes, so a DSH upgrade that renames a field fails a test instead of
 * silently emptying the panel. {@link PROGRESS_SUMMARY_FINAL} is the one addition,
 * and it is optional by construction: a reader that has never heard of it ignores it.
 *
 * `run-start` opens the node, `agent-start`/`agent-end` add and settle one member
 * row each, `run-end` fixes the terminal status. This plugin talks to the engine
 * directly (`src/run.ts`), so without these events the panel has nothing to fold
 * and the user sees an empty window for the whole run: t43 measured **zero**
 * session events between the user message and the report, and the only visible
 * effect was child sessions appearing.
 */
export const PROGRESS_RUN_START = 'plugin:grok-workflow/progress/run-start'
export const PROGRESS_AGENT_START = 'plugin:grok-workflow/progress/agent-start'
export const PROGRESS_AGENT_END = 'plugin:grok-workflow/progress/agent-end'
export const PROGRESS_RUN_END = 'plugin:grok-workflow/progress/run-end'

/**
 * The optional event that names the summary draft the run actually ships.
 *
 * Not a lifecycle event: it announces no call and settles nothing, so a stream
 * without it renders exactly what it rendered before. It exists because a child's
 * row cannot be renamed after the fact (the chat panel folds `agent-start` into a
 * row and only ever matches `agent-end` to it by `seq`), so "this draft is the
 * final one" has to arrive as its own fact — which the gate only learns once it
 * has passed a draft.
 */
export const PROGRESS_SUMMARY_FINAL = 'plugin:grok-workflow/progress/summary-final'

/**
 * The optional event that says the gate rejected every draft, and why.
 *
 * A separate event from {@link PROGRESS_SUMMARY_FINAL} because the two facts are never
 * both true and are not two readings of one value: a rejected run has no "final" draft
 * at all, so writing its verdict as a `summary-final` payload would either need a
 * second `draft` meaning ("the count, not a winner") or a card that contradicts itself.
 * Keeping them apart also means every reader that predates this event keeps rendering
 * a rejected run exactly as it did — as a run that handed in nothing — instead of
 * misreading a count as a winning draft number.
 */
export const PROGRESS_SUMMARY_REJECTED = 'plugin:grok-workflow/progress/summary-rejected'

/**
 * The Guardian monitor announcement for one run.
 *
 * Same channel as the six progress events above: an ignorable plugin record the
 * panel folds into the run's Guardian lane, never a `tool-workflow/*` session
 * event (see the channel note on the progress constants).
 */
export const PROGRESS_GUARDIAN_START = 'plugin:grok-workflow/progress/guardian-start'

/**
 * One Guardian liveness intervention for one run (not a task-quality verdict).
 *
 * Same channel as the progress events: ignorable plugin record, old
 * `tool-workflow/guardian-finding` name retired for the reason above.
 */
export const PROGRESS_GUARDIAN_FINDING = 'plugin:grok-workflow/progress/guardian-finding'

/**
 * The Guardian monitor settlement for one run.
 *
 * Same channel as the progress events: ignorable plugin record, old
 * `tool-workflow/guardian-end` name retired for the reason above.
 */
export const PROGRESS_GUARDIAN_END = 'plugin:grok-workflow/progress/guardian-end'

/** Payload of a Guardian monitor announcement for one run. */
export interface ProgressGuardianStart {
  runId: string
  armed: boolean
  budgetMs: number
}

/** Payload of one Guardian liveness intervention (not a task-quality verdict). */
export interface ProgressGuardianFinding {
  runId: string
  seq: number
  label: string
  signal: 'timeout' | 'heartbeat-loss'
  action: 'rescue' | 'cancel-run' | 'observe'
  reason: string
  atMs?: number
}

/** Payload of a Guardian monitor settlement for one run. */
export interface ProgressGuardianEnd {
  runId: string
  cancelled: boolean
  findingCount: number
}

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    /** Progress: the run announcement that creates the GUI node. */
    'plugin:grok-workflow/progress/run-start': ProgressRunStart
    /** Progress: one member row added to the run's node. */
    'plugin:grok-workflow/progress/agent-start': ProgressAgentStart
    /** Progress: one member row settled (matched by `seq`). */
    'plugin:grok-workflow/progress/agent-end': ProgressAgentEnd
    /** Progress: the node closed with its terminal status. */
    'plugin:grok-workflow/progress/run-end': ProgressRunEnd
    /** Progress: which summary draft the run shipped (the one that passed the gate). */
    'plugin:grok-workflow/progress/summary-final': ProgressSummaryFinal
    /** Progress: the gate rejected every draft, with the last failing stage and its reason. */
    'plugin:grok-workflow/progress/summary-rejected': ProgressSummaryRejected
    /** Progress: the Guardian monitor announced for one run. */
    'plugin:grok-workflow/progress/guardian-start': ProgressGuardianStart
    /** Progress: one Guardian liveness intervention for one run. */
    'plugin:grok-workflow/progress/guardian-finding': ProgressGuardianFinding
    /** Progress: the Guardian monitor settled for one run. */
    'plugin:grok-workflow/progress/guardian-end': ProgressGuardianEnd
  }
}

/**
 * The old `tool-workflow/*` names for the nine facts above, retired when the
 * channel moved to plugin records.
 *
 * The harness rejects a log whose `ignorable != true` event has a type outside
 * its known set, so those old names can no longer be written — but old sessions
 * already carry them, and the fold must still read them. This maps each old name
 * to its replacement; anything unmapped is returned unchanged.
 */
const PROGRESS_RECORD_RENAMES: Readonly<Record<string, string>> = {
  'tool-workflow/run-start': PROGRESS_RUN_START,
  'tool-workflow/agent-start': PROGRESS_AGENT_START,
  'tool-workflow/agent-end': PROGRESS_AGENT_END,
  'tool-workflow/run-end': PROGRESS_RUN_END,
  'tool-workflow/summary-final': PROGRESS_SUMMARY_FINAL,
  'tool-workflow/summary-rejected': PROGRESS_SUMMARY_REJECTED,
  'tool-workflow/guardian-start': PROGRESS_GUARDIAN_START,
  'tool-workflow/guardian-finding': PROGRESS_GUARDIAN_FINDING,
  'tool-workflow/guardian-end': PROGRESS_GUARDIAN_END,
}

/**
 * Fold one recorded progress type to its current name.
 *
 * @param type - the type a session event carries.
 * @returns the `plugin:grok-workflow/progress/*` replacement for a retired
 * `tool-workflow/*` name, or the input unchanged for anything else.
 */
export function normalizeProgressRecord(type: string): string {
  return PROGRESS_RECORD_RENAMES[type] ?? type
}

/** Payload of {@link PROGRESS_RUN_START} (`ToolWorkflowRunStartData`). */
export interface ProgressRunStart {
  runId: string
  name: string
}

/** Payload of {@link PROGRESS_AGENT_START} (`ToolWorkflowAgentStartData`). */
export interface ProgressAgentStart {
  runId: string
  seq: number
  label: string
  phase?: string
  childId: string
}

/** Payload of {@link PROGRESS_AGENT_END} (`ToolWorkflowAgentEndData`). */
export interface ProgressAgentEnd {
  runId: string
  seq: number
  outcome: WorkflowAgentOutcome
}

/** Payload of {@link PROGRESS_RUN_END} (`ToolWorkflowRunEndData`). */
export interface ProgressRunEnd {
  runId: string
  stopReason: WorkflowStopReason
}

/** Payload of {@link PROGRESS_SUMMARY_FINAL}: which summary draft is the shipped one. */
export interface ProgressSummaryFinal {
  runId: string
  /** 1-based draft number that passed the summary gate. */
  draft: number
}

/** Payload of {@link PROGRESS_SUMMARY_REJECTED}: the gate rejected every draft. */
export interface ProgressSummaryRejected {
  runId: string
  /** How many drafts the gate judged and rejected (1-based count, never a winner). */
  drafts: number
  /** The last stage that failed, in the gate's own two words. */
  stage: 'check' | 'verify'
  /** That stage's reason, one bounded line. */
  reason: string
}

/** The reason bound on {@link PROGRESS_SUMMARY_REJECTED}: the same one the marker uses. */
export const PROGRESS_SUMMARY_REJECTED_REASON_CHARS = 300

/**
 * The stop reason the GUI node is closed with, derived from the *task-level* result.
 *
 * `run-end` is the only progress event whose payload this plugin authors, and the
 * stock panel turns it straight into the node's status word
 * (`statusFromStopReason`, `@deepseek-ai/dsh-client-ui-workflow-run/lib/client.js:508-514`:
 * `completed` → 已完成). The engine's own stop reason says only that *the program
 * finished*, which is exactly the case where a verifier rejected the work: the script
 * returns a `failed` report through the normal return path, so the engine reports
 * `completed` while no task passed. Forwarding that stop reason unchanged is what
 * would render "任务已完成" for a rejected run (Issue #22, P1-1 semantic red line).
 *
 * The rule therefore reads the report, which is the only source of a task verdict:
 *
 * - every task verified (`status: 'completed'`) → `completed`, so the node reads 已完成;
 * - a report exists but is `partial`/`failed` → `error` (the node reads 失败, never 已完成);
 * - no report at all (invalid report, engine error, timeout) → `error`, because a run
 *   that produced nothing a user can read has not passed anything;
 * - `cancelled` / `error` from the engine are kept verbatim: they are already truthful.
 *
 * `partial` has no word of its own in the stock dictionary, so it is reported as
 * `error`: a task team where one task failed must never read as a finished one.
 * @param engineStop - the stop reason the engine settled on.
 * @param reportStatus - final status of the report this run returned, when it returned one.
 * @returns the stop reason to record on `run-end`.
 */
export function progressStopReason(
  engineStop: WorkflowStopReason,
  reportStatus: FinalStatus | undefined,
): WorkflowStopReason {
  if (engineStop !== 'completed') return engineStop
  return reportStatus === 'completed' ? 'completed' : 'error'
}

/** One member row as the engine reports it. */
export interface ProgressMember {
  seq: number
  label: string
  /** Progress group; omitted when the call declares none. */
  phase?: string
  childId: string
}

/** One member settlement. */
export interface ProgressMemberEnd {
  seq: number
  outcome: WorkflowAgentOutcome
}

/** The recording surface one run uses; every method is safe to call and never throws. */
export interface WorkflowProgressRecorder {
  /** Announce the run; this is the event that creates the GUI node. */
  runStart(run: { readonly id: string, readonly meta: { readonly name: string } }): void
  /** Add one member row to the run's node. */
  agentStart(runId: string, member: ProgressMember): void
  /** Settle one member row (matched by `seq`). */
  agentEnd(runId: string, member: ProgressMemberEnd): void
  /** Close the node with its terminal status. */
  runEnd(runId: string, stopReason: WorkflowStopReason): void
  /** Mark which summary draft the run shipped (the one that passed the gate). */
  summaryFinal(runId: string, draft: number): void
  /** Announce that every draft was rejected, with the last failing stage and its reason. */
  summaryRejected(runId: string, rejected: { drafts: number, stage: 'check' | 'verify', reason: string }): void
  /** Stop recording and drop any buffered events. */
  dispose(): void
}

/**
 * A buffered engine event that arrived before its run was adopted.
 *
 * `engine.start()` is synchronous in 0.2.1-rc.2, but the caller awaits it, so a
 * microtask can run the script's first `agent()` call before the returned run is
 * ours to record. Buffering by run id closes that window without guessing: an
 * event for a run that is never adopted is simply dropped, because another
 * plugin instance owns it.
 */
type PendingEvent =
  | { type: typeof PROGRESS_AGENT_START, member: ProgressMember }
  | { type: typeof PROGRESS_AGENT_END, member: ProgressMemberEnd }

/** Runs kept in the pre-adoption buffer; bounded because foreign runs pass through it. */
const PENDING_RUN_LIMIT = 8
/** Engine events kept per buffered run, in arrival order. */
const PENDING_EVENT_LIMIT = 64

/**
 * Create the progress recorder for one run.
 *
 * Three rules, all inherited from the in-tree recorder and from t43:
 *
 * 1. **Only our own run id is written.** The engine's events are process-wide, so
 *    a concurrent or nested run (a subagent that starts its own workflow in its
 *    own session) shares this bus. Events are appended only for a run this
 *    recorder adopted, and each run gets its own session, so one run can never
 *    write a member row into another run's conversation.
 * 2. **A recording failure never affects the run.** Every append is contained;
 *    a session that refuses the write costs the panel entry, not the workflow.
 *    After a refusal that run stops recording (retrying a permanently failing
 *    append would spam the log for the rest of the run).
 * 3. **Concurrent and recursive runs stay independent.** State is per recorder,
 *    and one recorder owns exactly one run.
 *
 * Every fact goes through the plugin-record channel (`appendPluginRecord`): the
 * same shapes the old `tool-workflow/*` recorder wrote, but as ignorable records
 * the harness never rejects. The payload shapes are pinned by tests instead of a
 * dependency on the tool layer (which would drag the tool layer into the plugin's
 * dependency tree just to borrow type names).
 */
export function createWorkflowProgressRecorder(
  session: Session | undefined,
  logger: WorkflowLogger,
): WorkflowProgressRecorder {
  /** Run ids this recorder owns, mapped to the session they are recorded into. */
  const owned = new Map<string, Session>()
  /** Events that arrived before their run was adopted, in arrival order. */
  const pending = new Map<string, PendingEvent[]>()
  let disposed = false
  const append = (
    target: Session,
    type: typeof PROGRESS_RUN_START | typeof PROGRESS_AGENT_START | typeof PROGRESS_AGENT_END | typeof PROGRESS_RUN_END | typeof PROGRESS_SUMMARY_FINAL | typeof PROGRESS_SUMMARY_REJECTED,
    data: Record<string, unknown>,
  ): boolean => {
    try {
      appendPluginRecord(target, type, data as never)
      return true
    } catch (error) {
      logger.warn(`progress record dropped after ${type} append failed: ${redactError(error)}`)
      return false
    }
  }
  const adopt = (): Session | undefined => {
    if (session === undefined || typeof session.append !== 'function') return undefined
    return session
  }
  const deliver = (target: Session, runId: string, event: PendingEvent): boolean => {
    if (event.type === PROGRESS_AGENT_START) {
      const { seq, label, phase, childId } = event.member
      return append(target, PROGRESS_AGENT_START, {
        runId,
        seq,
        label,
        ...phase === undefined ? {} : { phase },
        childId,
      })
    }
    return append(target, PROGRESS_AGENT_END, { runId, seq: event.member.seq, outcome: event.member.outcome })
  }
  const buffer = (runId: string, event: PendingEvent): void => {
    const current = pending.get(runId)
    if (current === undefined) {
      // Oldest first: a foreign run never becomes ours, so its buffer is only
      // ever discarded — keep the map bounded so a busy process cannot grow it.
      if (pending.size >= PENDING_RUN_LIMIT) {
        const oldest = pending.keys().next()
        if (!oldest.done) pending.delete(oldest.value)
      }
      pending.set(runId, [event])
      return
    }
    if (current.length < PENDING_EVENT_LIMIT) current.push(event)
  }
  return {
    runStart(run) {
      if (disposed) return
      const target = adopt()
      if (target === undefined) return
      if (!append(target, PROGRESS_RUN_START, { runId: run.id, name: run.meta.name })) return
      owned.set(run.id, target)
      const buffered = pending.get(run.id)
      if (buffered !== undefined) {
        pending.delete(run.id)
        // Replay in arrival order: the panel matches `agent-end` to a member row
        // by `seq`, so a settlement that overtook its start still lands.
        for (const event of buffered) {
          if (!deliver(target, run.id, event)) {
            owned.delete(run.id)
            return
          }
        }
      }
    },
    agentStart(runId, member) {
      if (disposed) return
      const target = owned.get(runId)
      if (target === undefined) {
        buffer(runId, { type: PROGRESS_AGENT_START, member })
        return
      }
      if (!deliver(target, runId, { type: PROGRESS_AGENT_START, member })) owned.delete(runId)
    },
    agentEnd(runId, member) {
      if (disposed) return
      const target = owned.get(runId)
      if (target === undefined) {
        buffer(runId, { type: PROGRESS_AGENT_END, member })
        return
      }
      if (!deliver(target, runId, { type: PROGRESS_AGENT_END, member })) owned.delete(runId)
    },
    runEnd(runId, stopReason) {
      if (disposed) return
      const target = owned.get(runId)
      // Never open a node here: a run we did not announce must not gain a `run-end`
      // the panel would fold into nothing.
      if (target === undefined) return
      append(target, PROGRESS_RUN_END, { runId, stopReason })
      owned.delete(runId)
    },
    summaryFinal(runId, draft) {
      if (disposed) return
      const target = owned.get(runId)
      // Same rule as `run-end`: only a run this recorder announced gains a fact.
      if (target === undefined) return
      const position = Number.isFinite(draft) ? Math.trunc(draft) : 0
      if (position < 1) return
      if (!append(target, PROGRESS_SUMMARY_FINAL, { runId, draft: position })) owned.delete(runId)
    },
    summaryRejected(runId, rejected) {
      if (disposed) return
      const target = owned.get(runId)
      // Same rule as `summaryFinal`: no announced run, no fact.
      if (target === undefined) return
      const drafts = Number.isFinite(rejected.drafts) ? Math.trunc(rejected.drafts) : 0
      if (drafts < 1) return
      if (rejected.stage !== 'check' && rejected.stage !== 'verify') return
      const reason = typeof rejected.reason === 'string' ? rejected.reason.trim() : ''
      // A rejection with no reason is the half-fact this event exists to replace: drop it
      // rather than claim "every draft was rejected, and we will not say why".
      if (reason === '') return
      const bounded = reason.length <= PROGRESS_SUMMARY_REJECTED_REASON_CHARS
        ? reason
        : reason.slice(0, PROGRESS_SUMMARY_REJECTED_REASON_CHARS)
      if (!append(target, PROGRESS_SUMMARY_REJECTED, { runId, drafts, stage: rejected.stage, reason: bounded })) owned.delete(runId)
    },
    dispose() {
      disposed = true
      owned.clear()
      pending.clear()
    },
  }
}

/**
 * Persist one dispose observation, then announce it on the diagnostics channel.
 *
 * Best effort by construction: this runs *inside* the plugin disposer, where the
 * session service may already be gone, so a refusal costs the record and never
 * the cancellation that follows it.
 */
export function recordDispose(
  session: Session | undefined,
  record: DisposeRecord,
  logger: WorkflowLogger,
): boolean {
  if (session === undefined || typeof session.append !== 'function') return false
  try {
    appendPluginRecord(session, DISPOSE_RECORD, record)
    return true
  } catch (error) {
    logger.warn(`dispose record not persisted: ${redactError(error)}`)
    return false
  }
}

/** A step a plugin-written assistant row may attach to. */
export interface OpenStep {
  turn: number
  step: number
}

/**
 * The step currently open in the session log, or `undefined` when none is.
 *
 * DSH's token meter replays the journal with one hard pairing rule: an
 * `assistant/message` is legal only between a `step/start` and its `step/end` for
 * the same `(turn, step)` (`@deepseek-ai/dsh-token-meter` 0.2.1-rc.2,
 * `advanceMeasurement`: `assistant/message at seq N has no matching step/start
 * event`). A row written outside one is not a cosmetic oddity: the first replay
 * throws, and because the fold cursor never advances past the offending seq, every
 * later replay throws at that same seq.
 *
 * That is the whole of the `/compact` failure measured in
 * `scripts/repro-compact.mjs`: `BasicCompactionEngine.compactNow()` measures
 * before it selects a range, so a single out-of-step row makes `/compact` fail on
 * a session that otherwise looks healthy, and makes automatic compaction fail the
 * same way (silently — `agent/pre-step` only warns and continues the turn).
 *
 * `turn/end` and any `step/end` close the pair: the plugin's question is "may I
 * append *now*", so anything short of an unambiguously open step counts as closed.
 *
 * @param session - session whose own log is read; a session without `ownEvents`
 *   (a test double) reports no open step.
 * @returns the open `(turn, step)`, or `undefined`.
 */
export function openStepOf(session: Session): OpenStep | undefined {
  try {
    const events = (session as unknown as { ownEvents?: () => unknown[] }).ownEvents?.() ?? []
    let open: OpenStep | undefined
    for (const event of events) {
      const type = (event as { type?: unknown }).type
      const data = (event as { data?: { turn?: unknown, step?: unknown } }).data
      if (type === 'step/start' && typeof data?.turn === 'number' && typeof data?.step === 'number') {
        open = { turn: data.turn, step: data.step }
      } else if (type === 'step/end' || type === 'turn/end') {
        open = undefined
      }
    }
    return open
  } catch {
    return undefined
  }
}

/** The assistant source a plugin row carries; `model` names which row it is. */
export interface PluginRowSource {
  provider: string
  model: string
}

/**
 * Append one assistant row attributed to this plugin, but only inside an open step.
 *
 * Every assistant row this plugin writes goes through here, so the token meter's
 * pairing rule (see {@link openStepOf}) has exactly one place to hold. When no step
 * is open the row is *refused*, not relocated: the `(turn, step)` a closed turn
 * recorded is not an open pair either, and a row invented under a later step would
 * read as model output the model never produced.
 *
 * A refused row costs the reader one line; writing it costs the session its
 * compaction, which is the trade this function exists to make in the other
 * direction.
 *
 * @param session - target session; absent means nothing to write.
 * @param text - row text, already composed and redacted by the caller.
 * @param source - attribution carried on the row.
 * @param logger - receives one line either way; never a silent drop.
 * @param label - which row this is, for the log line.
 * @returns true when the row is in the session surface.
 */
export function appendAssistantInStep(
  session: Session | undefined,
  text: string,
  source: PluginRowSource,
  logger: WorkflowLogger,
  label: string,
): boolean {
  if (session === undefined || typeof session.append !== 'function') return false
  const step = openStepOf(session)
  if (step === undefined) {
    logger.info?.(`${label} skipped: no open step to attach an assistant row to`)
    return false
  }
  try {
    session.append('assistant/message', {
      turn: step.turn,
      step: step.step,
      message: createAssistantMessage({
        content: [{ type: 'text', text }],
        source,
      }),
      stream: [],
    }, { surfaceOp: 'append' })
    return true
  } catch (error) {
    logger.warn(`${label} not written: ${redactError(error)}`)
    return false
  }
}

/**
 * Persist a turn terminal that had no open step to attach to.
 *
 * Written only as the fallback for a refused assistant row: the reader loses the
 * rendered line either way, but the reason and any verified partial work stay in
 * the session log instead of being dropped on the floor. Best effort, like every
 * other record here — a session that refuses the write costs the record only.
 *
 * @param session - target session; absent means nothing to write.
 * @param text - terminal text; redacted and bounded before it is stored.
 * @param logger - receives the failure when the record cannot be written.
 * @returns true when the record is in the session log.
 */
export function recordTerminal(
  session: Session | undefined,
  text: string,
  logger: WorkflowLogger,
): boolean {
  if (session === undefined || typeof session.append !== 'function') return false
  try {
    appendPluginRecord(session, TERMINAL_RECORD, { v: 1, text: ledgerText(text, 4000) })
    return true
  } catch (error) {
    logger.warn(`terminal record not persisted: ${redactError(error)}`)
    return false
  }
}

/**
 * Write the one-shot interruption notice into the session whose run was cut.
 *
 * Two shapes were considered and one was measured (t45):
 *
 * - `user/message` with this plugin's own source kind is the durable, honest
 *   shape, and it is what the gate uses for a relayed report — but the stock Web
 *   conversation **does not render** a user row whose source is not `user`
 *   (measured: the event is in the log at seq 13 with `surfaceOp: 'append'`, and
 *   the transcript shows nothing between the last turn and DSH's own "Task
 *   stopped" block).
 * - `assistant/message` is the shape this plugin already uses to deliver a
 *   composed answer outside a live turn (`deliverAppend`), and the transcript
 *   renders it as an ordinary assistant row.
 *
 * So the notice is written as an assistant row attributed to the plugin
 * (`provider: 'grok-workflow'`, `model: 'workflow-notice'`) and carries a
 * `[grok-workflow]` prefix, so a reader can tell it apart from anything the model
 * generated. It also enters the surface, which is deliberate: the next turn then
 * knows the mandatory workflow is off instead of silently assuming it ran.
 *
 * What that shape may not do is land outside an open step (see
 * {@link appendAssistantInStep}): a disposal runs after the turn ended, so the row
 * is refused there and the interruption survives only in the dispose record
 * (`DISPOSE_RECORD`: trigger, call site, interrupted run ids). Losing the rendered
 * line is the deliberate half of that trade — the rendered line used to cost the
 * session its compaction, permanently.
 */
export function appendUnloadNotice(
  session: Session | undefined,
  text: string,
  logger: WorkflowLogger,
): boolean {
  const written = appendAssistantInStep(
    session,
    text,
    { provider: 'grok-workflow', model: 'workflow-notice' },
    logger,
    'unload notice',
  )
  // A disposal runs after the turn ended, so the row is normally refused; the
  // notice's own sentence is then kept in the terminal record rather than dropped.
  // The return value answers "did the notice reach the session", not "was a chat
  // row rendered", so the dispose record's notice count stays truthful.
  return written || recordTerminal(session, text, logger)
}
