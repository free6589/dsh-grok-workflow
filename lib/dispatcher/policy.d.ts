/**
 * L1 dispatcher policy: the resident steward's permission whitelist.
 *
 * The L1 dispatcher only records, dispatches and reclaims tasks. It never
 * executes work and never judges it (no verdicts, no verification).
 *
 * Whitelist — exactly these four operations are allowed:
 * - `create` — add a new task (always starts as `pending`).
 * - `update-pending` — edit a task that has not started (`pending` only).
 * - `reassign` — hand a `pending`/`blocked` task to another owner (reclaim).
 * - `mark-blocked` — flag a `pending` task as `blocked` with a reason.
 *
 * Hard refusals — always rejected with an explicit error, whatever else holds:
 * - modifying a `completed` task (`forbidden:completed-immutable`);
 * - modifying a `running` task (`forbidden:running-immutable`);
 * - writing the verifier's `verdict` in any way (`forbidden:verdict-immutable`).
 *
 * Addressing: an `owner` is a worker, so it must be a full subagent path
 * (`lead/worker-1`); a bare name is refused (`invalid:bad-address`). A
 * `creator` may be the tree root (`lead`) or any deeper path. Results return
 * to the creator only (`resultRecipient`) — never to the dispatcher.
 *
 * This module is a pure decision layer: `decideIntent`/`decideRawIntent` read
 * through a minimal `TaskReader` and return a decision plus an effect. They
 * perform no IO and call no engine, so the gate can import them without
 * pulling any runtime.
 */
/** Lifecycle states the dispatcher understands. */
export type DispatcherLifecycle = 'pending' | 'running' | 'completed' | 'blocked';
/** The four whitelisted operations. Nothing else may run. */
export type DispatcherOp = 'create' | 'update-pending' | 'reassign' | 'mark-blocked';
/** One task as the dispatcher sees it. */
export interface DispatcherTask {
    id: string;
    title: string;
    status: DispatcherLifecycle;
    /** Full subagent path of the agent expected to do the work (e.g. `lead/worker-1`). */
    owner?: string;
    /**
     * Full subagent path of the agent that asked for the task. Worker results go
     * back to this address only, never to the dispatcher and never to the user.
     */
    creator?: string;
    objective?: string;
    blockedReason?: string;
    /** Arrival order on the board; assigned by the session, never by the policy. */
    queueSeq?: number;
    /**
     * Owned by the verifier. The dispatcher must never write this field —
     * any intent carrying it is refused with `forbidden:verdict-immutable`.
     */
    verdict?: 'pass' | 'fail';
}
/**
 * A patch may delete an optional field by carrying `undefined` explicitly
 * (`exactOptionalPropertyTypes` otherwise forbids the delete-on-reassign).
 */
export type DispatcherTaskPatch = {
    [K in keyof DispatcherTask]?: DispatcherTask[K] | undefined;
};
/** Minimal read surface a decision needs. Task-8's store satisfies this. */
export interface TaskReader {
    get(id: string): DispatcherTask | undefined;
    has(id: string): boolean;
}
/** Typed intent for each whitelisted operation. */
export type DispatcherIntent = {
    op: 'create';
    id: string;
    title: string;
    objective?: string;
    owner?: string;
    creator?: string;
} | {
    op: 'update-pending';
    id: string;
    title?: string;
    objective?: string;
} | {
    op: 'reassign';
    id: string;
    owner: string;
    reason?: string;
} | {
    op: 'mark-blocked';
    id: string;
    reason: string;
};
/** What an allowed decision asks the store to do. */
export type DispatcherEffect = {
    kind: 'insert';
    task: DispatcherTask;
} | {
    kind: 'patch';
    id: string;
    patch: DispatcherTaskPatch;
};
/** Every way a decision can be refused. */
export type DispatcherRefusalCode = 'forbidden:completed-immutable' | 'forbidden:running-immutable' | 'forbidden:verdict-immutable' | 'invalid:unknown-op' | 'invalid:task-missing' | 'invalid:duplicate-id' | 'invalid:not-pending' | 'invalid:bad-intent' | 'invalid:bad-address' | 'invalid:session-inactive';
/** Outcome of one intent: either an effect to apply, or an explicit refusal. */
export type DispatcherDecision = {
    ok: true;
    op: DispatcherOp;
    id: string;
    effect: DispatcherEffect;
} | {
    ok: false;
    op: string;
    id?: string;
    code: DispatcherRefusalCode;
    message: string;
};
/** All four whitelisted operation names, in one place. */
export declare const DISPATCHER_OPS: readonly DispatcherOp[];
/**
 * True when `value` is a routable path from the tree root (`lead` or
 * `lead/worker-1`). Used for the creator, which may be the root itself.
 */
export declare function isAddressPath(value: string): boolean;
/**
 * True when `value` is a full subagent path (`lead/worker-1`), not a display
 * name (`worker-1`). A bare name cannot be routed as a worker: two agents in
 * different subtrees can share it, so the dispatcher only records routable
 * execution addresses.
 */
export declare function isFullSubagentPath(value: string): boolean;
/**
 * Where a finished task's result belongs: the creator only. The owner is the
 * execution address and may change on reassignment; the creator never does.
 */
export declare function resultRecipient(task: DispatcherTask): string | undefined;
/**
 * Decide one typed intent against the current board.
 *
 * Pure: reads through `read`, writes nothing, returns the effect for the
 * caller (the session) to apply. The verdict ban is enforced first so it
 * holds regardless of task state; the completed/running bans come next.
 */
export declare function decideIntent(read: TaskReader, intent: DispatcherIntent): DispatcherDecision;
/**
 * Decide one untyped (gate-side JSON) intent.
 *
 * This is the enforcement point for anything the gate forwards: unknown
 * operation names are rejected, verdict writes are refused before any other
 * check, and malformed fields never reach `decideIntent`.
 */
export declare function decideRawIntent(read: TaskReader, raw: Record<string, unknown>): DispatcherDecision;
//# sourceMappingURL=policy.d.ts.map