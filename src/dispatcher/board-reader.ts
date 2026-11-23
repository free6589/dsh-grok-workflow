/**
 * TaskBoard → TaskReader read adapter: the Task-8 docking piece.
 *
 * The durable store (`src/taskboard/store.ts`) throws
 * `TaskboardError('not-found')` from `get` on a missing id, while the
 * dispatcher policy (`policy.ts`) wants `get` to return `undefined`. This
 * adapter bridges exactly that gap — plus the status-enum gap — without
 * touching the store's throw contract or the policy's read contract.
 * Round-57: the session holds its `TaskBoard` through this adapter for both
 * reads and policy decisions; the session's mark-blocked holder (`dispatcher`,
 * see `session.ts`) reads back as unowned-but-blocked with its detail as the
 * blockedReason.
 */

import { TaskboardError, type TaskBoard } from '../taskboard/store.js'
import type { DispatcherLifecycle, DispatcherTask, TaskReader } from './policy.js'
import type { TaskStatus } from '../taskboard/types.js'

function mapStatus(
  status: TaskStatus,
  detail: string | null,
  owner: string | null,
): { status: DispatcherLifecycle, blockedReason?: string } {
  // WHY in_progress → running: the board tracks worker execution state while
  // the dispatcher only knows "started but not finished" — same fact, dispatcher word.
  if (status === 'in_progress') return { status: 'running' }
  // WHY failed → blocked with detail as blockedReason: the dispatcher enum has
  // no "failed" state, and a failed row can only re-enter via reclaim — the
  // closest honest reading is "stuck with a reason", and the reason must not be dropped.
  if (status === 'failed') {
    if (detail === null) return { status: 'blocked' }
    return { status: 'blocked', blockedReason: detail }
  }
  // WHY blocked passes through on the session holder: the session stages
  // mark-blocked through claim+block under `dispatcher` (see session.ts),
  // so the board holds blocked+detail+owner=dispatcher for a row the
  // dispatcher still owns. The holder is a staging artifact, not a real
  // worker — reporting it as owner would lie about who holds the task.
  // Real workers claim rows themselves, so any other owner still reports.
  if (status === 'blocked' && owner === 'dispatcher' && detail !== null) {
    return { status, blockedReason: detail }
  }
  // WHY pending/completed/blocked pass through unchanged: both enums spell
  // these three states identically, so any remapping would only add lies.
  return { status }
}

/**
 * Wrap a `TaskBoard` as the `TaskReader` the dispatcher policy reads.
 *
 * `has` passes straight through; `get` catches only the store's
 * `TaskboardError('not-found')` and returns `undefined` for it. Every other
 * store error (integrity/io/…) is rethrown — corruption must fail loudly,
 * never masquerade as a missing task.
 */
export function boardReader(board: TaskBoard): TaskReader {
  return {
    // WHY straight through: `has` already means "row exists" on both sides, no translation needed.
    has: (id: string): boolean => board.has(id),
    get: (id: string): DispatcherTask | undefined => {
      let record
      try {
        record = board.get(id)
      } catch (error) {
        // WHY catch only 'not-found': a missing row is the policy's normal
        // "no such task" case (`undefined`); anything else is a real store
        // failure and must keep throwing.
        if (error instanceof TaskboardError && error.code === 'not-found') return undefined
        throw error
      }
      const mapped = mapStatus(record.status, record.detail, record.owner)
      const task: DispatcherTask = {
        // WHY id/title verbatim: identity and human-readable name are the same fact on both sides.
        id: record.id,
        title: record.title,
        status: mapped.status,
      }
      // WHY owner null or the session holder → omitted: the board means
      // "unowned" with null while DispatcherTask means it by absence
      // (optional string) — null would violate the type. The `dispatcher`
      // holder is the session's own claim staging for mark-blocked (see
      // mapStatus), not a real worker, so it reports as unowned too.
      if (record.owner !== null && record.owner !== 'dispatcher') task.owner = record.owner
      if (mapped.blockedReason !== undefined) task.blockedReason = mapped.blockedReason
      // WHY verdict never written: the board row has no verdict field and the
      // adapter must not invent one — the policy forbids verdict writes.
      return task
    },
  }
}
