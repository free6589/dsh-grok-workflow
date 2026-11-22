/**
 * Taskboard schema v1: the durable shape of one task row.
 *
 * A `TaskRecord` is the truth-layer row for two-level team management: the
 * upper level (dispatcher/lead) creates rows with `blocked_by` wiring, the
 * lower level (workers) moves them through the state machine, and the file on
 * disk — never memory — decides who owns what. `version` starts at 1 and
 * increases by exactly one per mutation; it is the compare-and-swap token
 * that makes claim races explicit instead of last-writer-wins.
 *
 * Semantics follow the dsh-agent-team shared task board: tasks are created
 * unowned (`owner: null`, `status: pending`), claimed with a revision guard
 * (CAS), moved `pending → in_progress → completed|failed|blocked`, requeued
 * `blocked → pending`, and `completed` rows are immutable. `blocked_by` ids
 * gate claiming: a task whose predecessors are not all `completed` cannot
 * start. The board persists every row (id/owner/status/version/dependencies)
 * to `store.jsonl` so a reopen of the same directory recovers all of it.
 */
/** Lifecycle states (dsh-agent-team: pending → in_progress → completed). */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
/** Schema tag written on every store line; readers refuse anything else. */
export declare const TASKBOARD_SCHEMA: "grok-workflow.taskboard/v1";
/** Store file name inside the board directory. */
export declare const TASKBOARD_STORE_FILE: "store.jsonl";
/** Structural ceilings so one row cannot grow the store without limit. */
export declare const TASKBOARD_LIMITS: {
    /** Maximum whole-file size read or written. */
    readonly maxBytes: 1048576;
    /** Maximum tasks per board. */
    readonly maxTasks: 1024;
    /** Maximum characters of a task id. */
    readonly idChars: 200;
    /** Maximum characters of a title. */
    readonly titleChars: 600;
    /** Maximum characters of an owner name. */
    readonly ownerChars: 200;
    /** Maximum dependency ids per task. */
    readonly blockedByItems: 64;
    /** Maximum characters of a failure/block detail. */
    readonly detailChars: 2000;
};
/** One durable task row (schema v1). */
export interface TaskRecord {
    /** Globally unique within the board (enforced at create time). */
    id: string;
    /** Human-readable title. */
    title: string;
    /** Lifecycle state; see the module header for the machine. */
    status: TaskStatus;
    /** Claiming agent, or `null` while unowned. */
    owner: string | null;
    /** Ids that must be `completed` before this task may be claimed. */
    blocked_by: string[];
    /** CAS token: starts at 1, +1 per mutation. */
    version: number;
    /** ISO-8601 creation time. */
    createdAt: string;
    /** ISO-8601 time of the latest mutation. */
    updatedAt: string;
    /** Failure/block reason, or `null` when none was recorded. */
    detail: string | null;
}
/** Input accepted by `TaskBoard.create`. */
export interface CreateTaskInput {
    id: string;
    title: string;
    blocked_by?: readonly string[] | undefined;
}
/** Optional per-call guard: the mutation applies only at this version. */
export interface CasOptions {
    expectedVersion?: number | undefined;
}
/** Options for `fail` / `blockTask`, which may record a reason. */
export interface CloseOptions extends CasOptions {
    detail?: string | undefined;
}
/** Narrow `unknown` to a `TaskRecord`, throwing on any shape violation. */
export declare function assertTaskRecord(value: unknown): TaskRecord;
//# sourceMappingURL=types.d.ts.map