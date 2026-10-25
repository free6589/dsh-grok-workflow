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
declare module '@deepseek-ai/dsh-session' {
    interface PluginRecordMap {
        /** The model-route ledger written after a workflow run. */
        'plugin:grok-workflow/routing': RoutingRecord;
        'plugin:grok-workflow/delivery': DeliveryRecord;
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
//# sourceMappingURL=records.d.ts.map