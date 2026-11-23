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
import { rmSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskBoard, TASKBOARD_STORE_FILE, TaskboardError } from '../taskboard/store.js';
import { boardReader } from './board-reader.js';
import { decideIntent, decideRawIntent, } from './policy.js';
/**
 * The L1 steward session.
 *
 * Lifecycle: `start()` opens fresh, `stop()` deactivates, `resume()` reloads
 * the persisted board and reactivates. While inactive every intent is refused
 * with `invalid:session-inactive` — a stopped steward records nothing. Every
 * mutating entry is async: await it, then the board (and the overlay) already
 * reflect the decision.
 */
export class DispatcherSession {
    boardDir;
    board;
    /** Ephemeral backing for memory-only sessions; removed on `stop()`. */
    memDir;
    /** Memory overlay for objective/title patches the board cannot store. */
    overlays = new Map();
    active = false;
    constructor(boardDir) {
        this.boardDir = boardDir;
    }
    /** True while the session accepts intents. */
    get isActive() {
        return this.active;
    }
    /** Directory holding `store.jsonl` (undefined for memory-only sessions). */
    get path() {
        return this.boardDir;
    }
    /** TaskReader surface, so policy decisions read this session directly. */
    get(id) {
        const board = this.board;
        if (board === undefined)
            return undefined;
        const task = boardReader(board).get(id);
        if (task === undefined)
            return undefined;
        return this.applyOverlay(task);
    }
    /** TaskReader surface. */
    has(id) {
        return this.board?.has(id) ?? false;
    }
    /**
     * Current board contents, sorted by id for determinism, with the memory
     * overlay applied. Rows carrying `objective` or a patched `title` show this
     * process's overlay values — a restarted process shows board truth until
     * the overlay is re-recorded.
     */
    list() {
        const board = this.board;
        if (board === undefined)
            return [];
        const read = boardReader(board);
        return board
            .list()
            .flatMap((record) => {
            const task = read.get(record.id);
            return task === undefined ? [] : [this.applyOverlay(task)];
        })
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    /**
     * Open the session with an empty board.
     *
     * Clears the overlay and drops any open board handle; directory sessions
     * also remove a stale `store.jsonl` so the lazily reopened board starts
     * empty. For existing persisted state use `resume()`, never `start()`.
     */
    start() {
        this.overlays.clear();
        this.board = undefined;
        if (this.memDir !== undefined) {
            rmSync(this.memDir, { recursive: true, force: true });
            this.memDir = undefined;
        }
        else if (this.boardDir !== undefined) {
            // Fresh means fresh: without this, the lazy reopen below would reload
            // the previous run's rows. Missing file is the common case (force).
            // Any other IO problem surfaces later at open/handle time — start()
            // itself never throws, same as before.
            try {
                rmSync(join(this.boardDir, TASKBOARD_STORE_FILE), { force: true });
            }
            catch {
                // Fall through: open/handle reports the real problem.
            }
        }
        this.active = true;
    }
    /**
     * Deactivate the session.
     *
     * Deactivation itself is synchronous (a handle issued after `stop()`
     * returns is still refused); the returned promise only covers removing a
     * memory-only session's ephemeral backing. The board needs no flush: every
     * write already persisted before its handle returned.
     */
    async stop() {
        this.active = false;
        if (this.memDir !== undefined) {
            const dir = this.memDir;
            this.memDir = undefined;
            this.board = undefined;
            await rm(dir, { recursive: true, force: true });
        }
    }
    /**
     * Reopen the session from the persisted board.
     *
     * No store yet means a first start: the session activates with an empty
     * board and reports `restored: false`. A corrupt store throws and the
     * session stays inactive — fail closed, never guess at the board. The
     * memory overlay is cleared: board truth survives the restart, overlay
     * patches do not (see the `SessionOverlay` note above).
     */
    async resume() {
        if (this.boardDir === undefined) {
            this.overlays.clear();
            this.board = undefined;
            if (this.memDir !== undefined) {
                const dir = this.memDir;
                this.memDir = undefined;
                await rm(dir, { recursive: true, force: true });
            }
            this.active = true;
            return { restored: false, tasks: 0 };
        }
        let restored;
        try {
            await stat(join(this.boardDir, TASKBOARD_STORE_FILE));
            restored = true;
        }
        catch (error) {
            if (error?.code === 'ENOENT') {
                restored = false;
            }
            else {
                throw error;
            }
        }
        // Open before activating: a corrupt store throws here and the session
        // stays inactive.
        const board = await TaskBoard.open(this.boardDir);
        this.board = board;
        this.overlays.clear();
        this.active = true;
        return { restored, tasks: board.size, path: this.boardDir };
    }
    /**
     * Decide one typed intent and, when allowed, apply its effect to the board.
     *
     * Refusals change nothing. Allowed intents persist before this returns, so
     * a crash loses at most nothing already answered — and an immediate read
     * already reflects the decision.
     */
    async handle(intent) {
        if (!this.active) {
            const id = 'id' in intent ? intent.id : undefined;
            return {
                ok: false,
                op: intent.op,
                ...(id === undefined ? {} : { id }),
                code: 'invalid:session-inactive',
                message: `dispatcher refused ${intent.op}: session is not active (先 start/resume 再记事)`,
            };
        }
        const board = await this.ensureBoard();
        const decision = decideIntent(this, intent);
        if (decision.ok) {
            await this.applyEffect(decision.effect, board);
        }
        return decision;
    }
    /**
     * Decide one untyped (gate-side JSON) intent and apply it when allowed.
     *
     * Same decide-then-persist rule as {@link handle}; unknown operations and
     * verdict writes are refused before anything is touched.
     */
    async handleRaw(raw) {
        if (!this.active) {
            const op = typeof raw['op'] === 'string' ? raw['op'] : String(raw['op']);
            const id = typeof raw['id'] === 'string' ? raw['id'] : undefined;
            return {
                ok: false,
                op,
                ...(id === undefined ? {} : { id }),
                code: 'invalid:session-inactive',
                message: `dispatcher refused ${op}: session is not active (先 start/resume 再记事)`,
            };
        }
        const board = await this.ensureBoard();
        const decision = decideRawIntent(this, raw);
        if (decision.ok) {
            await this.applyEffect(decision.effect, board);
        }
        return decision;
    }
    /**
     * Open (once) and return the writable board.
     *
     * Directory sessions open their real directory; memory-only sessions open a
     * session-private ephemeral directory that `stop()` removes. Either way the
     * board persists every mutation before the applying handle returns.
     */
    async ensureBoard() {
        if (this.board === undefined) {
            if (this.boardDir === undefined) {
                this.memDir = await mkdtemp(join(tmpdir(), 'dispatcher-mem-'));
                this.board = await TaskBoard.open(this.memDir);
            }
            else {
                this.board = await TaskBoard.open(this.boardDir);
            }
        }
        return this.board;
    }
    applyOverlay(task) {
        const overlay = this.overlays.get(task.id);
        if (overlay === undefined)
            return task;
        const next = { ...task };
        if (overlay.title !== undefined)
            next.title = overlay.title;
        if (overlay.objective !== undefined)
            next.objective = overlay.objective;
        return next;
    }
    async applyEffect(effect, board) {
        if (effect.kind === 'insert') {
            try {
                await board.create({ id: effect.task.id, title: effect.task.title });
            }
            catch (error) {
                // The policy already refused duplicates against this board, so this
                // fires only when an outside writer won the id first: keep their
                // truth, record nothing, stay silent only about OUR write.
                if (error instanceof TaskboardError && error.code === 'duplicate-id')
                    return;
                throw error;
            }
            if (effect.task.owner !== undefined && effect.task.owner !== '') {
                await board.assign(effect.task.id, effect.task.owner);
            }
            if (effect.task.objective !== undefined) {
                this.overlays.set(effect.task.id, { objective: effect.task.objective });
            }
            return;
        }
        const patch = effect.patch;
        if (patch.owner === undefined && patch.status === undefined) {
            // update-pending: title/objective only, and the store holds neither —
            // overlay exclusively (see SessionOverlay). No board write at all.
            const prev = this.overlays.get(effect.id) ?? {};
            const next = { ...prev };
            if (patch.title !== undefined)
                next.title = patch.title;
            if (patch.objective !== undefined)
                next.objective = patch.objective;
            this.overlays.set(effect.id, next);
            return;
        }
        if (typeof patch.owner === 'string' && patch.owner !== '') {
            // Reassign — reclaim included: a blocked/failed row returns to pending
            // first (which also hides its old detail from the adapter read, exactly
            // the "reason cleared" the policy decided), then takes the new owner.
            const current = board.get(effect.id);
            if (current.status === 'blocked' || current.status === 'failed') {
                await board.requeue(effect.id);
            }
            await board.assign(effect.id, patch.owner);
            return;
        }
        if (patch.status === 'blocked') {
            // mark-blocked: the board has no pending→blocked edge, so stage it
            // through claim+block with the row's owner — or the session holder when
            // the intent named none (see the module note). Detail carries the
            // reason back through the adapter as blockedReason, reload-safe.
            const reason = typeof patch.blockedReason === 'string' ? patch.blockedReason : '';
            const detail = reason === '' ? undefined : { detail: reason };
            const current = board.get(effect.id);
            if (current.status === 'pending') {
                const holder = current.owner ?? 'dispatcher';
                try {
                    await board.claim(effect.id, holder);
                }
                catch (error) {
                    // Raced into in_progress between decide and apply: claim is no
                    // longer needed, block directly below.
                    if (!(error instanceof TaskboardError && error.code === 'invalid-transition'))
                        throw error;
                }
            }
            await board.blockTask(effect.id, detail);
        }
        // No other patch shape leaves the policy: update-pending, reassign and
        // mark-blocked are all handled above.
    }
}
//# sourceMappingURL=session.js.map