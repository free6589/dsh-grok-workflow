/**
 * L1 dispatcher session: start/stop/resume and the persisted task board.
 *
 * The session is the only place that applies policy decisions to a board. The
 * policy (`policy.ts`) stays pure — it decides, this session applies — so the
 * gate can call the policy without owning any state, and the session owns the
 * state without deciding anything itself.
 *
 * Persistence is a single JSON file (`board.json` under the given directory),
 * written atomically (tmp file + rename, same directory) after every applied
 * effect and on `stop()`. `resume()` reads that file back, so a restarted L1
 * steward picks up exactly the board it left behind.
 *
 * Task-8 docking point: the `src/taskboard/` store now has `has`/`get` by
 * task id, but its `get` throws `TaskboardError('not-found')` for a missing
 * id while `TaskReader` wants `get` to return `undefined`. Pointing this
 * session at that store therefore still needs a small adapter that catches
 * the not-found throw and returns `undefined` instead (next round's work —
 * Round-56 update: the read adapter has landed (`board-reader.ts` —
 * `boardReader(board)` wraps a `TaskBoard` as the `TaskReader` the policy
 * reads, mapping `in_progress→running` / `failed→blocked`, `null` owner to
 * absent, and missing rows to `undefined`). Next round swaps this session
 * onto the `TaskBoard` store through that adapter; until then this file is
 * still self-contained and touches no other module.
 */
import { type DispatcherDecision, type DispatcherIntent, type DispatcherTask, type TaskReader } from './policy.js';
/** On-disk shape of the persisted board. Versioned for future migrations. */
export interface DispatcherBoardFile {
    version: 1;
    tasks: DispatcherTask[];
}
/** What `resume()` found on disk. */
export interface DispatcherResumeResult {
    /** True when a board file existed and loaded; false when starting empty. */
    restored: boolean;
    /** Number of tasks on the board after resume. */
    tasks: number;
    /** Where the board file lives (undefined for memory-only sessions). */
    path?: string;
}
/** Read and validate a board file; throws on corruption (fail closed). */
export declare function readBoardFile(path: string): DispatcherTask[];
/**
 * The L1 steward session.
 *
 * Lifecycle: `start()` opens a fresh board (memory-only unless a directory
 * was given), `stop()` persists and deactivates, `resume()` reloads the
 * persisted board and reactivates. While inactive every intent is refused
 * with `invalid:session-inactive` — a stopped steward records nothing.
 */
export declare class DispatcherSession implements TaskReader {
    private readonly boardPath;
    private readonly tasks;
    private active;
    constructor(boardDir?: string);
    /** True while the session accepts intents. */
    get isActive(): boolean;
    /** Where the board persists (undefined for memory-only sessions). */
    get path(): string | undefined;
    /** TaskReader surface, so policy decisions read this session directly. */
    get(id: string): DispatcherTask | undefined;
    /** TaskReader surface. */
    has(id: string): boolean;
    /** Current board contents, sorted by id for determinism. */
    list(): DispatcherTask[];
    /** Open the session with an empty board. */
    start(): void;
    /** Persist (when a directory was given) and deactivate. */
    stop(): void;
    /**
     * Reopen the session from the persisted board.
     *
     * No board file yet means a first start: the session activates with an
     * empty board and reports `restored: false`. A corrupt file throws and the
     * session stays inactive — fail closed, never guess at the board.
     */
    resume(): DispatcherResumeResult;
    /**
     * Decide one typed intent and, when allowed, apply its effect to the board.
     *
     * Refusals change nothing. Allowed intents persist immediately (when a
     * directory was given), so a crash loses at most nothing already answered.
     */
    handle(intent: DispatcherIntent): DispatcherDecision;
    /**
     * Decide one untyped (gate-side JSON) intent and apply it when allowed.
     *
     * Same apply-and-persist rule as {@link handle}; unknown operations and
     * verdict writes are refused before anything is touched.
     */
    handleRaw(raw: Record<string, unknown>): DispatcherDecision;
    private applyEffect;
    private persist;
}
//# sourceMappingURL=session.d.ts.map