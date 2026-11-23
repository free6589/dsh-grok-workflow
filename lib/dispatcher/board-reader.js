/**
 * TaskBoard → TaskReader read adapter: the Task-8 docking piece.
 *
 * The durable store (`src/taskboard/store.ts`) throws
 * `TaskboardError('not-found')` from `get` on a missing id, while the
 * dispatcher policy (`policy.ts`) wants `get` to return `undefined`. This
 * adapter bridges exactly that gap — plus the status-enum gap — without
 * touching the store's throw contract or the policy's read contract.
 * This round only adapts reads; the session still owns its own board until
 * a later round swaps it onto the `TaskBoard` store through this adapter.
 */
import { TaskboardError } from '../taskboard/store.js';
function mapStatus(status, detail) {
    // WHY in_progress → running: the board tracks worker execution state while
    // the dispatcher only knows "started but not finished" — same fact, dispatcher word.
    if (status === 'in_progress')
        return { status: 'running' };
    // WHY failed → blocked with detail as blockedReason: the dispatcher enum has
    // no "failed" state, and a failed row can only re-enter via reclaim — the
    // closest honest reading is "stuck with a reason", and the reason must not be dropped.
    if (status === 'failed') {
        if (detail === null)
            return { status: 'blocked' };
        return { status: 'blocked', blockedReason: detail };
    }
    // WHY pending/completed/blocked pass through unchanged: both enums spell
    // these three states identically, so any remapping would only add lies.
    return { status };
}
/**
 * Wrap a `TaskBoard` as the `TaskReader` the dispatcher policy reads.
 *
 * `has` passes straight through; `get` catches only the store's
 * `TaskboardError('not-found')` and returns `undefined` for it. Every other
 * store error (integrity/io/…) is rethrown — corruption must fail loudly,
 * never masquerade as a missing task.
 */
export function boardReader(board) {
    return {
        // WHY straight through: `has` already means "row exists" on both sides, no translation needed.
        has: (id) => board.has(id),
        get: (id) => {
            let record;
            try {
                record = board.get(id);
            }
            catch (error) {
                // WHY catch only 'not-found': a missing row is the policy's normal
                // "no such task" case (`undefined`); anything else is a real store
                // failure and must keep throwing.
                if (error instanceof TaskboardError && error.code === 'not-found')
                    return undefined;
                throw error;
            }
            const mapped = mapStatus(record.status, record.detail);
            const task = {
                // WHY id/title verbatim: identity and human-readable name are the same fact on both sides.
                id: record.id,
                title: record.title,
                status: mapped.status,
            };
            // WHY owner null → omitted: the board means "unowned" with null while
            // DispatcherTask means it by absence (optional string) — null would violate the type.
            if (record.owner !== null)
                task.owner = record.owner;
            if (mapped.blockedReason !== undefined)
                task.blockedReason = mapped.blockedReason;
            // WHY verdict never written: the board row has no verdict field and the
            // adapter must not invent one — the policy forbids verdict writes.
            return task;
        },
    };
}
//# sourceMappingURL=board-reader.js.map