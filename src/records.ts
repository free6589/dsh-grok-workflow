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
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { redactError, redactSecrets } from './redact.js'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { WorkflowLogger } from './run.js'
import type { RouteTrailEntry, RoleName, SynthesisMode } from './types.js'

/** Record type owned by this plugin. */
export const DELIVERY_RECORD = 'plugin:grok-workflow/delivery'

/** Phases a delivery passes through. */
export type DeliveryPhase = 'started' | 'delivered' | 'failed'

/** Payload stored for one gate delivery. */
export interface DeliveryRecord {
  /** Record schema version owned by this plugin. */
  v: 1
  /** Deterministic delivery key; also the de-duplication identity. */
  key: string
  /** Agent whose message batch was routed. */
  agentId: string
  /** Clamped message ids of the claimed batch, in claim order. */
  messageIds: string[]
  phase: DeliveryPhase
  /** Turn that owned the claimed batch. */
  turn: number
  /** Explicit outcome label for diagnostics (status or failure cause). */
  outcome: string
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
  /** One entry per route switch or failed call. */
  switches: {
    role: RoleName
    chainIndex: number
    route: string
    attempt: number
    outcome: 'ok' | 'failed'
    failureClass?: string
    reason?: string
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
    'plugin:grok-workflow/delivery': DeliveryRecord
    /** One observation of this plugin being unloaded (t45, P0-1). */
    'plugin:grok-workflow/dispose': DisposeRecord
  }
}

/**
 * Deterministic identity for one claimed batch.
 *
 * The key is derived from the agent and the exact claimed message ids, so a
 * replay of the same delivery (resume, fork, duplicate followup) recomputes the
 * same key without keeping any process-local state.
 */
export function deliveryKey(agentId: string, messages: readonly Pick<UserMessage, 'id'>[]): string {
  const ids = messages.map(message => String(message.id)).sort()
  return `grok-workflow:${agentId}:${ids.join(',')}`
}

/** True when the payload is a record this build can trust. */
function isDeliveryRecord(value: unknown): value is DeliveryRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<DeliveryRecord>
  return record.v === 1
    && typeof record.key === 'string'
    && typeof record.agentId === 'string'
    && Array.isArray(record.messageIds)
    && record.messageIds.every(id => typeof id === 'string')
    && (record.phase === 'started' || record.phase === 'delivered' || record.phase === 'failed')
    && typeof record.turn === 'number'
    && typeof record.outcome === 'string'
}

/** Every delivery record this plugin committed to the session, oldest first. */
export function readDeliveries(session: Session | undefined): DeliveryRecord[] {
  if (session === undefined || typeof session.ownEvents !== 'function') return []
  const records: DeliveryRecord[] = []
  for (const event of session.ownEvents()) {
    const record = pluginRecordOf(event)
    if (record === undefined || record.type !== DELIVERY_RECORD) continue
    const data = (record as { data?: unknown }).data
    if (isDeliveryRecord(data)) records.push(data)
  }
  return records
}

/**
 * True when the batch was already routed by this plugin.
 *
 * `started` and `delivered` count: a run was launched for these exact messages,
 * so routing them again would start a second workflow for one user message.
 * `failed` does not count — a refusal that never launched a run (busy queue,
 * oversized message) must not become a permanent block on that message.
 */
export function alreadyRouted(session: Session | undefined, key: string): boolean {
  return readDeliveries(session).some(record => record.key === key && (record.phase === 'started' || record.phase === 'delivered'))
}

/**
 * Append one delivery record.
 *
 * A record is durable plugin state, not a correctness dependency for the current
 * turn: when the session refuses the write we warn and continue, and the run
 * still happens (the gate never answers by itself).
 */
export function recordDelivery(
  session: Session | undefined,
  record: DeliveryRecord,
  logger: WorkflowLogger,
): void {
  if (session === undefined || typeof session.append !== 'function') return
  try {
    appendPluginRecord(session, DELIVERY_RECORD, record)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger.warn(`delivery record not persisted (${record.key}): ${detail}`)
  }
}

/** Roles in report order; also the closed set a ledger switch may name. */
const ROLES: readonly RoleName[] = ['planner', 'worker', 'verifier', 'synthesizer']

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
  })
  // Sanitize first, then select: filtering the raw entries would drop a route
  // whose fields were malformed instead of recording its coerced form.
  const switches = entry.routes
    .map(safeRoute)
    .filter(route => route.outcome === 'failed' || route.chainIndex > 0)
    .slice(0, cap)
  if (switches.length === 0) return
  const routing: Record<RoleName, string[]> = { planner: [], worker: [], verifier: [], synthesizer: [] }
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
 * Session events the stock Web GUI folds into a `workflow-run` chat node.
 *
 * The family is owned by `@deepseek-ai/dsh-tool-workflow` (`lib/index.js:83-135`)
 * and folded by `@deepseek-ai/dsh-client-ui-workflow-run` (`lib/client.js:591-640`):
 * `run-start` opens the node, `agent-start`/`agent-end` add and settle one member
 * row each, `run-end` fixes the terminal status. This plugin talks to the engine
 * directly (`src/run.ts`), so without these events the panel has nothing to fold
 * and the user sees an empty window for the whole run: t43 measured **zero**
 * session events between the user message and the report, and the only visible
 * effect was child sessions appearing. The recorder below reproduces the in-tree
 * one — same four types, same field shapes — and `test/records.spec.ts` pins the
 * shapes, so a DSH upgrade that renames a field fails a test instead of silently
 * emptying the panel.
 */
export const PROGRESS_RUN_START = 'tool-workflow/run-start'
export const PROGRESS_AGENT_START = 'tool-workflow/agent-start'
export const PROGRESS_AGENT_END = 'tool-workflow/agent-end'
export const PROGRESS_RUN_END = 'tool-workflow/run-end'

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

/** The untyped `session.append` this recorder needs (see the note in the factory). */
interface RawAppend {
  append(type: string, data: Record<string, unknown>): unknown
}

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
 * The four `tool-workflow/*` types are declared by `@deepseek-ai/dsh-tool-workflow`'s
 * own module augmentation. This package deliberately does not depend on that
 * package (it would drag the tool layer into the plugin's dependency tree just to
 * borrow four type names), so the append is issued through a narrow local
 * interface and the payload shapes are pinned by tests instead.
 */
export function createWorkflowProgressRecorder(
  session: Session | undefined,
  logger: WorkflowLogger,
): WorkflowProgressRecorder {
  /** Run ids this recorder owns, mapped to the session they are recorded into. */
  const owned = new Map<string, RawAppend>()
  /** Events that arrived before their run was adopted, in arrival order. */
  const pending = new Map<string, PendingEvent[]>()
  let disposed = false
  const append = (target: RawAppend, type: string, data: Record<string, unknown>): boolean => {
    try {
      target.append(type, data)
      return true
    } catch (error) {
      logger.warn(`progress record dropped after ${type} append failed: ${redactError(error)}`)
      return false
    }
  }
  const adopt = (): RawAppend | undefined => {
    if (session === undefined || typeof session.append !== 'function') return undefined
    // Bind once: the session's own method is the single writer, exactly as the
    // in-tree recorder does, so an overridden `append` cannot be half-used.
    return { append: (session as unknown as RawAppend).append.bind(session) }
  }
  const deliver = (target: RawAppend, runId: string, event: PendingEvent): boolean => {
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
    const detail = error instanceof Error ? error.message : String(error)
    logger.warn(`dispose record not persisted: ${detail}`)
    return false
  }
}

/** The last turn/step the session recorded, for placing a notice in the transcript. */
function lastTurnOf(session: Session): { turn: number, step: number } {
  try {
    const events = (session as unknown as { ownEvents?: () => unknown[] }).ownEvents?.() ?? []
    let turn = 0
    let step = 0
    for (const event of events) {
      const data = (event as { data?: { turn?: unknown, step?: unknown } }).data
      if (typeof data?.turn !== 'number') continue
      if (data.turn > turn) {
        turn = data.turn
        step = 0
      }
      if (data.turn === turn && typeof data.step === 'number' && data.step > step) step = data.step
    }
    return { turn, step }
  } catch {
    return { turn: 0, step: 0 }
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
 */
export function appendUnloadNotice(
  session: Session | undefined,
  text: string,
  logger: WorkflowLogger,
): boolean {
  if (session === undefined || typeof session.append !== 'function') return false
  const { turn, step } = lastTurnOf(session)
  try {
    session.append('assistant/message', {
      turn,
      step,
      message: createAssistantMessage({
        content: [{ type: 'text', text }],
        source: { provider: 'grok-workflow', model: 'workflow-notice' },
      }),
      stream: [],
    }, { surfaceOp: 'append' })
    return true
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger.warn(`unload notice not written: ${detail}`)
    return false
  }
}
