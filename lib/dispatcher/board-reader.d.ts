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
import { type TaskBoard } from '../taskboard/store.js';
import type { TaskReader } from './policy.js';
/**
 * Wrap a `TaskBoard` as the `TaskReader` the dispatcher policy reads.
 *
 * `has` passes straight through; `get` catches only the store's
 * `TaskboardError('not-found')` and returns `undefined` for it. Every other
 * store error (integrity/io/…) is rethrown — corruption must fail loudly,
 * never masquerade as a missing task.
 */
export declare function boardReader(board: TaskBoard): TaskReader;
//# sourceMappingURL=board-reader.d.ts.map