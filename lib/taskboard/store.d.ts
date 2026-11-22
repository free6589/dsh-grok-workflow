/**
 * Durable task board: the truth layer for two-level team management.
 *
 * Model (aligns with the dsh-agent-team shared task board):
 *
 * - The dispatcher (upper level) creates rows: id, title, and `blocked_by`
 *   dependency wiring. Workers (lower level) only move rows through the
 *   state machine. What is on disk decides who owns what — never memory.
 * - Task ids are globally unique per board; creating a duplicate id fails.
 * - Every mutation goes through compare-and-swap on `version`: the caller
 *   passes the version it read, the board applies the change only when the
 *   stored version still matches, and a mismatch fails with
 *   `TaskboardError('version-conflict')` carrying both versions. There is no
 *   last-writer-wins anywhere.
 * - State machine: `pending → in_progress → completed | failed | blocked`;
 *   `blocked → pending` requeues a task; `failed → pending` retries it;
 *   `completed` rows are immutable and reject every mutation.
 * - Dependencies: `blocked_by` lists predecessor ids. `claim` (and
 *   `requeue` back into `pending` when the task was `blocked`/`failed`)
 *   refuses while any predecessor is missing or not `completed`, with
 *   `TaskboardError('dependency-blocked')` naming the unmet ids.
 * - Every row — id, title, status, owner, blocked_by, version, timestamps,
 *   detail — is persisted to `store.jsonl`. Reopening the same directory
 *   recovers all of it, so a restart loses nothing.
 *
 * Durability (same idea as `src/checkpoint/writer.ts`, taskboard-local):
 * the whole board (one JSON object per line, each carrying the schema tag
 * and a sha-256 checksum over its canonical payload) is serialized, written
 * to a hidden `*.tmp` file in the board directory with an fsync, and only
 * then renamed over `store.jsonl`. A reader therefore never sees a
 * half-written store, and a failed write leaves the previous store intact.
 * Lines whose checksum no longer matches are refused on open.
 */
import { type CloseOptions, type CreateTaskInput, type TaskRecord } from './types.js';
export type { CloseOptions, CreateTaskInput, TaskRecord, TaskStatus } from './types.js';
export { TASKBOARD_LIMITS, TASKBOARD_SCHEMA, TASKBOARD_STORE_FILE } from './types.js';
export { assertTaskRecord } from './types.js';
/** Machine-readable failure reasons; every method throws only these. */
export type TaskboardErrorCode = 'duplicate-id' | 'not-found' | 'version-conflict' | 'invalid-transition' | 'immutable' | 'dependency-blocked' | 'invalid-input' | 'too-large' | 'io' | 'integrity';
/** Error thrown by every `TaskBoard` failure, with a stable `code`. */
export declare class TaskboardError extends Error {
    readonly code: TaskboardErrorCode;
    /** The version the caller passed as its CAS guard, when relevant. */
    readonly expectedVersion?: number | undefined;
    /** The version actually stored, when relevant. */
    readonly actualVersion?: number | undefined;
    /** Dependency ids that are missing or not completed, for `dependency-blocked`. */
    readonly unmet?: readonly string[] | undefined;
    constructor(code: TaskboardErrorCode, message: string, extra?: {
        expectedVersion?: number | undefined;
        actualVersion?: number | undefined;
        unmet?: readonly string[] | undefined;
    });
}
/** Returned alongside a snapshot so callers can distinguish stale reads. */
export interface TaskSnapshot {
    task: TaskRecord;
}
/**
 * One durable board: one directory, one `store.jsonl`, every mutation
 * persisted before it returns. Use `openTaskboard` to create or reopen;
 * every instance holds its own in-memory copy, so concurrent handles to
 * the same directory must re-read (via `reload`) to observe each other.
 */
export declare class TaskBoard {
    private readonly dir;
    private readonly file;
    private readonly tasks;
    private constructor();
    /** Open the board at `dir`, creating it (empty) when no store exists. */
    static open(dir: string): Promise<TaskBoard>;
    /** Directory holding `store.jsonl`. */
    get directory(): string;
    /** Number of rows on the board. */
    get size(): number;
    /** Re-read `store.jsonl`, discarding unpersisted local state. */
    reload(): Promise<void>;
    /** Read one row; throws `not-found` for an unknown id. The result is a copy. */
    get(id: string): TaskRecord;
    /** List every row, sorted by id. Each entry is a copy. */
    list(): TaskRecord[];
    /**
     * Create one `pending`, unowned row. The id must be globally unique on
     * this board; a duplicate fails with `duplicate-id` and changes nothing.
     */
    create(input: CreateTaskInput): Promise<TaskRecord>;
    /**
     * Claim a `pending` row: assign `owner` and move it to `in_progress`.
     * Refuses while any `blocked_by` predecessor is missing or not
     * `completed` (`dependency-blocked`), and refuses a stale CAS guard
     * (`version-conflict`).
     */
    claim(id: string, owner: string, expectedVersion?: number): Promise<TaskRecord>;
    /** Mark an `in_progress` row `completed`. Completed rows are immutable. */
    complete(id: string, expectedVersion?: number): Promise<TaskRecord>;
    /** Mark an `in_progress` row `failed`, optionally recording why. */
    fail(id: string, options?: CloseOptions): Promise<TaskRecord>;
    /** Mark an `in_progress` row `blocked`, optionally recording why. */
    blockTask(id: string, options?: CloseOptions): Promise<TaskRecord>;
    /**
     * Return a `blocked` or `failed` row to `pending` so it can be
     * reassigned. `completed` rows are immutable and refuse this with
     * `immutable`; claiming the requeued row re-checks dependencies.
     */
    requeue(id: string, expectedVersion?: number): Promise<TaskRecord>;
    /**
     * Change one `pending` row's owner without starting it (dispatcher
     * pre-assignment). Refuses while dependencies are unmet.
     */
    assign(id: string, owner: string, expectedVersion?: number): Promise<TaskRecord>;
    /**
     * Replace one `pending` row's dependency list. Completed rows refuse
     * with `immutable`; re-claiming afterwards re-checks the new wiring.
     */
    setDependencies(id: string, blockedBy: readonly string[], expectedVersion?: number): Promise<TaskRecord>;
    private requireDependencies;
    private mutate;
    private load;
    /**
     * Serialize the whole board (one checksummed JSON object per line) and
     * swap it over `store.jsonl` atomically: hidden `*.tmp` write, fsync,
     * then rename. A failed write leaves the previous store intact.
     */
    private persist;
}
/** Open (or create) the board at `dir`. Reopening recovers every row. */
export declare function openTaskboard(dir: string): Promise<TaskBoard>;
//# sourceMappingURL=store.d.ts.map