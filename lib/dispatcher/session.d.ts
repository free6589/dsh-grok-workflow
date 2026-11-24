/**
 * L1 dispatcher session: start/stop/resume over the persistent `TaskBoard`.
 *
 * The session is the only place that applies policy decisions to a board. The
 * policy (`policy.ts`) stays pure — it decides, this session applies — so the
 * gate can call the policy without owning any state, and the session owns the
 * state without deciding anything itself.
 *
 * Round-57: this session no longer owns a memory `Map` or a self-made
 * `board.json`. It holds a `TaskBoard` (persisted as `store.jsonl`: jsonl +
 * sha-256 + tmp+rename — see `src/taskboard/store.ts`) and reads it through
 * the round-56 `boardReader(board)` adapter (`board-reader.ts`), so the policy
 * still sees the `TaskReader` it expects (`has` straight through, missing
 * `get` as `undefined`, `in_progress→running` / `failed→blocked` translation).
 * The pre-round-57 `board.json` format is neither read nor written: the
 * unified persistence format is `store.jsonl`.
 *
 * Async choice: `TaskBoard` opens and writes are all async, so `handle`,
 * `handleRaw`, `stop` and `resume` are async too — each awaits the board open
 * (lazy: the first call opens it) and then the board write before returning.
 * `createDispatcherSession` keeps its sync signature (construct + `start()`,
 * which touches no disk state except clearing a stale store file — see
 * below). WHY lazy-open instead of a separate `await session.ready()`: there
 * is no second init call for callers to forget; every entry point ensures the
 * board exactly once. Callers must `await` each handle (documented on the
 * methods); concurrent un-awaited handles interleave like any racing writers.
 *
 * Field placement (no silent drops):
 * - `id`/`title`-on-create/`status`/`owner`/`detail` live on the board — truth.
 * - `objective` (create/update) and `title` edits (update-pending) have nowhere
 *   to land: the store has no objective column and no title edit, and this
 *   round must not change the store contract. They live in a session-side
 *   memory overlay, merged into every `get`/`list` read. WHY the overlay
 *   instead of refusing: refusing would break the four-op whitelist the gate
 *   already relies on (`update-pending` with an objective is a legal intent);
 *   silently dropping would lie about what was recorded. The overlay is
 *   honestly process-local — a restarted process keeps board truth and loses
 *   only these patches — and `resume()` documents that by clearing it.
 * - `blockedReason` maps to the board `detail` in both directions; `verdict`
 *   is never written (the policy refuses verdict writes before apply).
 * - `mark-blocked` on an unowned pending row claims it first under the holder
 *   `dispatcher`: the board has no pending→blocked edge (claim is required),
 *   and the intent names no owner. WHY a holder instead of overlaying: the
 *   blocked state then really persists and reclaims naturally via reassign;
 *   the holder name says who staged it. Owned rows claim under their owner.
 * - `create` with an empty-string owner stays unowned: the board requires a
 *   non-empty owner and the policy does not refuse it, so collapsing (not
 *   throwing) keeps the allowed intent truthful.
 * - `creator` (who asked for the task, vs `owner` who executes it) has no
 *   board column either, so it rides the same overlay. Results are routed
 *   with `resultRecipient`, which prefers the creator: an owner changes on
 *   reassignment, the creator never does.
 * - Queue order is the board's `seq`, not the store file order: `list()` is
 *   sorted by id for a stable read while `pending()` is FIFO, and both
 *   survive a restart because `seq` is persisted on the row.
 *
 * Lifecycle: `start()` opens fresh (clears the overlay; directory sessions
 * also remove a stale `store.jsonl` so the next open starts empty — same net
 * effect as the old memory clear plus overwrite-on-persist; use `resume()`
 * for existing state, never `start()`), `stop()` deactivates (board already
 * persisted every write, so there is nothing to flush) and removes a
 * memory-only session's ephemeral backing, `resume()` reopens the persisted
 * board and reactivates. While inactive every intent is refused with
 * `invalid:session-inactive`. A corrupt store throws from `resume()` and the
 * session stays inactive — fail closed, never guess at the board.
 */
import { type DispatcherDecision, type DispatcherIntent, type DispatcherTask, type TaskReader } from './policy.js';
/** What `resume()` found on disk. */
export interface DispatcherResumeResult {
    /** True when a store existed and loaded; false when starting empty. */
    restored: boolean;
    /** Number of tasks on the board after resume. */
    tasks: number;
    /**
     * Number of `pending` rows after resume, i.e. the length of the restored
     * queue. Same order as {@link DispatcherSession.pending}.
     */
    pending: number;
    /** Where the board persists (undefined for memory-only sessions). */
    path?: string;
}
/**
 * The L1 steward session.
 *
 * Lifecycle: `start()` opens fresh, `stop()` deactivates, `resume()` reloads
 * the persisted board and reactivates. While inactive every intent is refused
 * with `invalid:session-inactive` — a stopped steward records nothing. Every
 * mutating entry is async: await it, then the board (and the overlay) already
 * reflect the decision.
 */
export declare class DispatcherSession implements TaskReader {
    private readonly boardDir;
    private board;
    /** Ephemeral backing for memory-only sessions; removed on `stop()`. */
    private memDir;
    /** Memory overlay for objective/title patches the board cannot store. */
    private readonly overlays;
    private active;
    constructor(boardDir?: string);
    /** True while the session accepts intents. */
    get isActive(): boolean;
    /** Directory holding `store.jsonl` (undefined for memory-only sessions). */
    get path(): string | undefined;
    /** TaskReader surface, so policy decisions read this session directly. */
    get(id: string): DispatcherTask | undefined;
    /** TaskReader surface. */
    has(id: string): boolean;
    /**
     * Current board contents, sorted by id for determinism, with the memory
     * overlay applied. Rows carrying `objective` or a patched `title` show this
     * process's overlay values — a restarted process shows board truth until
     * the overlay is re-recorded.
     */
    list(): DispatcherTask[];
    /**
     * The pending queue in arrival order.
     *
     * WHY this order and not `list()`'s: a queue is FIFO. The arrival number is
     * on the board row (`TaskRecord.seq`), so a resumed session hands back the
     * same order it left behind — which the store file order cannot, because
     * rows are persisted sorted by id. Overlay fields apply here exactly as in
     * `list()`.
     */
    pending(): DispatcherTask[];
    /**
     * Open the session with an empty board.
     *
     * Clears the overlay and drops any open board handle; directory sessions
     * also remove a stale `store.jsonl` so the lazily reopened board starts
     * empty. For existing persisted state use `resume()`, never `start()`.
     */
    start(): void;
    /**
     * Deactivate the session.
     *
     * Deactivation itself is synchronous (a handle issued after `stop()`
     * returns is still refused); the returned promise only covers removing a
     * memory-only session's ephemeral backing. The board needs no flush: every
     * write already persisted before its handle returned.
     *
     * WHY clear the overlay and drop the board handle here: `stop` means
     * "close up and clear the floor" — reads after stop must see nothing
     * (inactive refuses writes, reads carry no stale rows), and a restart
     * reloads persisted truth via `resume()`, never via a leftover handle.
     */
    stop(): Promise<void>;
    /**
     * Reopen the session from the persisted board.
     *
     * No store yet means a first start: the session activates with an empty
     * board and reports `restored: false`. A corrupt store throws and the
     * session stays inactive — fail closed, never guess at the board. The
     * memory overlay is cleared: board truth survives the restart, overlay
     * patches do not (see the `SessionOverlay` note above).
     */
    resume(): Promise<DispatcherResumeResult>;
    /**
     * Decide one typed intent and, when allowed, apply its effect to the board.
     *
     * Refusals change nothing. Allowed intents persist before this returns, so
     * a crash loses at most nothing already answered — and an immediate read
     * already reflects the decision.
     */
    handle(intent: DispatcherIntent): Promise<DispatcherDecision>;
    /**
     * Decide one untyped (gate-side JSON) intent and apply it when allowed.
     *
     * Same decide-then-persist rule as {@link handle}; unknown operations and
     * verdict writes are refused before anything is touched.
     */
    handleRaw(raw: Record<string, unknown>): Promise<DispatcherDecision>;
    /**
     * Open (once) and return the writable board.
     *
     * Directory sessions open their real directory; memory-only sessions open a
     * session-private ephemeral directory that `stop()` removes. Either way the
     * board persists every mutation before the applying handle returns.
     */
    private ensureBoard;
    private applyOverlay;
    private applyEffect;
}
//# sourceMappingURL=session.d.ts.map