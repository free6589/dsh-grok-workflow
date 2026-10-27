/**
 * Durable delivery records for the mandatory-entry gate.
 *
 * `appendPluginRecord` writes an `ignorable` event that never enters the
 * model-visible surface, survives fork/resume, and can be read back with
 * `pluginRecordOf` (measured in DSH 0.2.1-rc.2). Records are plugin-owned
 * state: every reader revalidates `data`, because a restored record may carry
 * whatever an earlier build wrote.
 */
import type { Session } from '@deepseek-ai/dsh-session';
import type { WorkflowAgentOutcome, WorkflowStopReason } from '@deepseek-ai/dsh-workflow';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { WorkflowLogger } from './run.js';
import type { RouteTrailEntry, RoleName, SynthesisMode } from './types.js';
/** Record type owned by this plugin. */
export declare const DELIVERY_RECORD = "plugin:grok-workflow/delivery";
/** Phases a delivery passes through. */
export type DeliveryPhase = 'started' | 'delivered' | 'failed';
/** Payload stored for one gate delivery. */
export interface DeliveryRecord {
    /** Record schema version owned by this plugin. */
    v: 1;
    /** Deterministic delivery key; also the de-duplication identity. */
    key: string;
    /** Agent whose message batch was routed. */
    agentId: string;
    /** Clamped message ids of the claimed batch, in claim order. */
    messageIds: string[];
    phase: DeliveryPhase;
    /** Turn that owned the claimed batch. */
    turn: number;
    /** Explicit outcome label for diagnostics (status or failure cause). */
    outcome: string;
}
/** Record type owned by this plugin: the model-route ledger of one run. */
export declare const ROUTING_RECORD = "plugin:grok-workflow/routing";
/**
 * Payload stored for one run's routing ledger.
 *
 * Only *switches* and *failures* are kept (a successful first-route call is not
 * a switch), every free-text field is redacted and bounded, and the whole entry
 * list is capped so a long run cannot grow the record without limit.
 */
export interface RoutingRecord {
    v: 1;
    /** Run objective, redacted and bounded; correlates the ledger with a report. */
    objective: string;
    /** Effective chains at run time (`provider/model`, or empty for inherit). */
    routing: Record<RoleName, string[]>;
    synthesis: SynthesisMode;
    /** One entry per route switch or failed call. */
    switches: {
        role: RoleName;
        chainIndex: number;
        route: string;
        attempt: number;
        outcome: 'ok' | 'failed';
        failureClass?: string;
        reason?: string;
    }[];
}
/** Maximum switches kept in one ledger record. */
/** Record type owned by this plugin: one observation of the plugin being unloaded. */
export declare const DISPOSE_RECORD = "plugin:grok-workflow/dispose";
/** Identity and timing of one run that was live when the plugin went away. */
export interface DisposeRunInfo {
    /** Engine run id; correlates the record with a report and the GUI node. */
    runId: string;
    /** Session that owned the run (absent when the runtime exposed none). */
    sessionId?: string;
    /** Epoch milliseconds at which the run was admitted. */
    startedAtMs: number;
    /** Milliseconds the run had been active when the plugin was disposed. */
    elapsedMs: number;
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
    v: 1;
    /** When the disposer ran (ISO 8601, host clock). */
    at: string;
    /** Milliseconds since the plugin was applied. */
    uptimeMs: number;
    /** Best-effort attribution of the disposer's call path. */
    trigger: DisposeTrigger;
    /** Redacted, bounded top frames of the stack that reached the disposer. */
    callSite: string[];
    /** Runs that had started and were live when the disposer ran. */
    activeRuns: number;
    /** Runs still starting (admitted, `engine.start` unresolved). */
    pending: number;
    /** Identity of each live run, oldest first, bounded. */
    runs: DisposeRunInfo[];
    /** Sessions that received the one-shot interruption notice. */
    notices: number;
    /** Shutdown signals received before disposal; empty for an in-process unload. */
    signals: string[];
}
/**
 * What kind of event disposed the plugin, inferred from the disposal call path.
 *
 * `unknown` is a first-class value, not a failure: the record still carries the
 * raw stack frames, so a reader can attribute the event later from the log.
 */
export type DisposeTrigger = 
/** A plugin-manager/settings action reloaded or disabled the entry. */
'management'
/** The process is shutting down (signal or exit path). */
 | 'shutdown'
/** A test harness disposed the context. */
 | 'test'
/** Nothing in the stack identified the caller. */
 | 'unknown';
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
export declare function classifyDisposeTrigger(stack: string, signals?: readonly string[]): DisposeTrigger;
/**
 * Record the shutdown signals this process receives, for disposal attribution.
 *
 * Every handler is `once` and merely appends a name, so it cannot interfere with
 * DSH's own signal handling (our listener runs after the host's, but it is
 * synchronous, while the host's teardown awaits — the flag is therefore set before
 * the disposer runs). Returns the disposer that removes the handlers again, so a
 * reload leaves no listeners behind.
 */
export declare function installShutdownProbe(state: {
    signals?: string[];
}): () => void;
/** Keep the head of a stack, redacted and bounded, skipping the throw site itself. */
export declare function callSiteFrames(stack: string | undefined, limit?: number): string[];
declare module '@deepseek-ai/dsh-session' {
    interface PluginRecordMap {
        /** The model-route ledger written after a workflow run. */
        'plugin:grok-workflow/routing': RoutingRecord;
        'plugin:grok-workflow/delivery': DeliveryRecord;
        /** One observation of this plugin being unloaded (t45, P0-1). */
        'plugin:grok-workflow/dispose': DisposeRecord;
    }
}
/**
 * Deterministic identity for one claimed batch.
 *
 * The key is derived from the agent and the exact claimed message ids, so a
 * replay of the same delivery (resume, fork, duplicate followup) recomputes the
 * same key without keeping any process-local state.
 */
export declare function deliveryKey(agentId: string, messages: readonly Pick<UserMessage, 'id'>[]): string;
/** Every delivery record this plugin committed to the session, oldest first. */
export declare function readDeliveries(session: Session | undefined): DeliveryRecord[];
/**
 * True when the batch was already routed by this plugin.
 *
 * `started` and `delivered` count: a run was launched for these exact messages,
 * so routing them again would start a second workflow for one user message.
 * `failed` does not count — a refusal that never launched a run (busy queue,
 * oversized message) must not become a permanent block on that message.
 */
export declare function alreadyRouted(session: Session | undefined, key: string): boolean;
/**
 * Append one delivery record.
 *
 * A record is durable plugin state, not a correctness dependency for the current
 * turn: when the session refuses the write we warn and continue, and the run
 * still happens (the gate never answers by itself).
 */
export declare function recordDelivery(session: Session | undefined, record: DeliveryRecord, logger: WorkflowLogger): void;
/**
 * Record the model-route ledger of one run.
 *
 * A run may switch routes many times, so the ledger is one plugin record (not
 * one record per switch): bounded, redacted, and never allowed to throw into
 * the caller that is delivering a workflow answer.
 */
export declare function recordRouting(session: Session | undefined, entry: {
    objective: string;
    routing: Record<RoleName, string[]>;
    synthesis: SynthesisMode;
    routes: readonly RouteTrailEntry[];
}, logger?: WorkflowLogger, limit?: number): void;
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
export declare const PROGRESS_RUN_START = "tool-workflow/run-start";
export declare const PROGRESS_AGENT_START = "tool-workflow/agent-start";
export declare const PROGRESS_AGENT_END = "tool-workflow/agent-end";
export declare const PROGRESS_RUN_END = "tool-workflow/run-end";
/** Payload of {@link PROGRESS_RUN_START} (`ToolWorkflowRunStartData`). */
export interface ProgressRunStart {
    runId: string;
    name: string;
}
/** Payload of {@link PROGRESS_AGENT_START} (`ToolWorkflowAgentStartData`). */
export interface ProgressAgentStart {
    runId: string;
    seq: number;
    label: string;
    phase?: string;
    childId: string;
}
/** Payload of {@link PROGRESS_AGENT_END} (`ToolWorkflowAgentEndData`). */
export interface ProgressAgentEnd {
    runId: string;
    seq: number;
    outcome: WorkflowAgentOutcome;
}
/** Payload of {@link PROGRESS_RUN_END} (`ToolWorkflowRunEndData`). */
export interface ProgressRunEnd {
    runId: string;
    stopReason: WorkflowStopReason;
}
/** One member row as the engine reports it. */
export interface ProgressMember {
    seq: number;
    label: string;
    /** Progress group; omitted when the call declares none. */
    phase?: string;
    childId: string;
}
/** One member settlement. */
export interface ProgressMemberEnd {
    seq: number;
    outcome: WorkflowAgentOutcome;
}
/** The recording surface one run uses; every method is safe to call and never throws. */
export interface WorkflowProgressRecorder {
    /** Announce the run; this is the event that creates the GUI node. */
    runStart(run: {
        readonly id: string;
        readonly meta: {
            readonly name: string;
        };
    }): void;
    /** Add one member row to the run's node. */
    agentStart(runId: string, member: ProgressMember): void;
    /** Settle one member row (matched by `seq`). */
    agentEnd(runId: string, member: ProgressMemberEnd): void;
    /** Close the node with its terminal status. */
    runEnd(runId: string, stopReason: WorkflowStopReason): void;
    /** Stop recording and drop any buffered events. */
    dispose(): void;
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
export declare function createWorkflowProgressRecorder(session: Session | undefined, logger: WorkflowLogger): WorkflowProgressRecorder;
/**
 * Persist one dispose observation, then announce it on the diagnostics channel.
 *
 * Best effort by construction: this runs *inside* the plugin disposer, where the
 * session service may already be gone, so a refusal costs the record and never
 * the cancellation that follows it.
 */
export declare function recordDispose(session: Session | undefined, record: DisposeRecord, logger: WorkflowLogger): boolean;
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
export declare function appendUnloadNotice(session: Session | undefined, text: string, logger: WorkflowLogger): boolean;
//# sourceMappingURL=records.d.ts.map