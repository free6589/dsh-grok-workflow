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
 *
 * Order: the store file is written sorted by id, so the file order is not the
 * arrival order. Every row therefore carries its own `seq` (see `TaskRecord`),
 * which is what a queue reads: pending rows come out in the order they were
 * created, before and after a restart alike.
 */

/** Lifecycle states (dsh-agent-team: pending → in_progress → completed). */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked'

/** Schema tag written on every store line; readers refuse anything else. */
export const TASKBOARD_SCHEMA = 'grok-workflow.taskboard/v1' as const

/** Store file name inside the board directory. */
export const TASKBOARD_STORE_FILE = 'store.jsonl' as const

/**
 * Cross-process claim lock: every mutation takes an exclusive lock file for
 * the duration of re-read → apply → persist, so two workers cannot both
 * observe the same version and both write. A crashed holder leaves the lock
 * behind; an unreleased lock older than `defaultStaleMs` is treated as
 * abandoned and removed by the next writer.
 */
export const TASKBOARD_LOCK = {
  /** How long a writer waits for the lock before failing with `io`. */
  defaultTimeoutMs: 5_000,
  /** Age after which an unreleased lock is considered abandoned. */
  defaultStaleMs: 5_000,
  /** Delay between lock attempts while another writer holds it. */
  retryMs: 4,
} as const

/** Lock file name inside the board directory (one per board). */
export const TASKBOARD_LOCK_FILE = '.store.jsonl.lock' as const

/** Per-board tunables; the defaults are the documented policy. */
export interface TaskboardOptions {
  /** Milliseconds to wait for the claim lock; defaults to {@link TASKBOARD_LOCK}. */
  lockTimeoutMs?: number | undefined
  /** Milliseconds before an unreleased lock is abandoned; defaults to {@link TASKBOARD_LOCK}. */
  lockStaleMs?: number | undefined
}

/** Structural ceilings so one row cannot grow the store without limit. */
export const TASKBOARD_LIMITS = {
  /** Maximum whole-file size read or written. */
  maxBytes: 1_048_576,
  /** Maximum tasks per board. */
  maxTasks: 1_024,
  /** Maximum characters of a task id. */
  idChars: 200,
  /** Maximum characters of a title. */
  titleChars: 600,
  /** Maximum characters of an owner name. */
  ownerChars: 200,
  /** Maximum dependency ids per task. */
  blockedByItems: 64,
  /** Maximum characters of a failure/block detail. */
  detailChars: 2_000,
} as const

/** One durable task row (schema v1). */
export interface TaskRecord {
  /** Globally unique within the board (enforced at create time). */
  id: string
  /** Human-readable title. */
  title: string
  /** Lifecycle state; see the module header for the machine. */
  status: TaskStatus
  /** Claiming agent, or `null` while unowned. */
  owner: string | null
  /** Ids that must be `completed` before this task may be claimed. */
  blocked_by: string[]
  /** CAS token: starts at 1, +1 per mutation. */
  version: number
  /**
   * Arrival order on this board: 1 for the first row created, +1 per create,
   * never reused. Assigned under the claim lock from the highest `seq` on
   * disk, so arrival order survives a restart — the row order in the store
   * file does not (rows are persisted sorted by id).
   *
   * Absent on rows written before the field existed. `load()` stamps those
   * from the file position (which was the only order such a store had), and
   * the next persist writes the stamps back, so a legacy store upgrades
   * without losing or reordering a queue.
   */
  seq?: number | undefined
  /** ISO-8601 creation time. */
  createdAt: string
  /** ISO-8601 time of the latest mutation. */
  updatedAt: string
  /** Failure/block reason, or `null` when none was recorded. */
  detail: string | null
}

/** Input accepted by `TaskBoard.create`. */
export interface CreateTaskInput {
  id: string
  title: string
  blocked_by?: readonly string[] | undefined
}

/** Optional per-call guard: the mutation applies only at this version. */
export interface CasOptions {
  expectedVersion?: number | undefined
}

/** Options for `fail` / `blockTask`, which may record a reason. */
export interface CloseOptions extends CasOptions {
  detail?: string | undefined
}

/** Narrow `unknown` to a `TaskRecord`, throwing on any shape violation. */
export function assertTaskRecord(value: unknown): TaskRecord {
  if (typeof value !== 'object' || value === null) throw new Error('task row is not an object')
  const row = value as Record<string, unknown>
  if (typeof row['id'] !== 'string' || row['id'] === '') throw new Error('task row has no id')
  if (typeof row['title'] !== 'string' || row['title'] === '') throw new Error('task row has no title')
  if (!isStatus(row['status'])) throw new Error(`task row has an unknown status: ${String(row['status'])}`)
  if (row['owner'] !== null && typeof row['owner'] !== 'string') {
    throw new Error('task row owner is neither string nor null')
  }
  if (
    !Array.isArray(row['blocked_by']) ||
    !row['blocked_by'].every((entry): entry is string => typeof entry === 'string')
  ) {
    throw new Error('task row blocked_by is not a string array')
  }
  if (typeof row['version'] !== 'number' || !Number.isInteger(row['version']) || row['version'] < 1) {
    throw new Error('task row version is not a positive integer')
  }
  if (typeof row['createdAt'] !== 'string' || typeof row['updatedAt'] !== 'string') {
    throw new Error('task row timestamps are not strings')
  }
  if (row['detail'] !== null && typeof row['detail'] !== 'string') {
    throw new Error('task row detail is neither string nor null')
  }
  // WHY seq may be absent: rows written before the arrival marker existed must
  // still load (the store stamps them on read), so a missing `seq` is legal
  // while a present one must be a real arrival number.
  if (row['seq'] !== undefined) {
    if (typeof row['seq'] !== 'number' || !Number.isInteger(row['seq']) || row['seq'] < 1) {
      throw new Error('task row seq is not a positive integer')
    }
  }
  return {
    id: row['id'],
    title: row['title'],
    status: row['status'],
    owner: row['owner'],
    blocked_by: [...row['blocked_by']],
    version: row['version'],
    ...(row['seq'] === undefined ? {} : { seq: row['seq'] }),
    createdAt: row['createdAt'],
    updatedAt: row['updatedAt'],
    detail: row['detail'],
  }
}

function isStatus(value: unknown): value is TaskStatus {
  return (
    value === 'pending' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'blocked'
  )
}
