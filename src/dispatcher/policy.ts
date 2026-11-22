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
 * This module is a pure decision layer: `decideIntent`/`decideRawIntent` read
 * through a minimal `TaskReader` and return a decision plus an effect. They
 * perform no IO and call no engine, so the gate can import them without
 * pulling any runtime.
 */

/** Lifecycle states the dispatcher understands. */
export type DispatcherLifecycle = 'pending' | 'running' | 'completed' | 'blocked'

/** The four whitelisted operations. Nothing else may run. */
export type DispatcherOp = 'create' | 'update-pending' | 'reassign' | 'mark-blocked'

/** One task as the dispatcher sees it. */
export interface DispatcherTask {
  id: string
  title: string
  status: DispatcherLifecycle
  owner?: string
  objective?: string
  blockedReason?: string
  /**
   * Owned by the verifier. The dispatcher must never write this field —
   * any intent carrying it is refused with `forbidden:verdict-immutable`.
   */
  verdict?: 'pass' | 'fail'
}

/** Minimal read surface a decision needs. Task-8's store satisfies this. */
export interface TaskReader {
  get(id: string): DispatcherTask | undefined
  has(id: string): boolean
}

/** Typed intent for each whitelisted operation. */
export type DispatcherIntent =
  | { op: 'create'; id: string; title: string; objective?: string; owner?: string }
  | { op: 'update-pending'; id: string; title?: string; objective?: string }
  | { op: 'reassign'; id: string; owner: string; reason?: string }
  | { op: 'mark-blocked'; id: string; reason: string }

/** What an allowed decision asks the store to do. */
export type DispatcherEffect =
  | { kind: 'insert'; task: DispatcherTask }
  | { kind: 'patch'; id: string; patch: Partial<DispatcherTask> }

/** Every way a decision can be refused. */
export type DispatcherRefusalCode =
  | 'forbidden:completed-immutable'
  | 'forbidden:running-immutable'
  | 'forbidden:verdict-immutable'
  | 'invalid:unknown-op'
  | 'invalid:task-missing'
  | 'invalid:duplicate-id'
  | 'invalid:not-pending'
  | 'invalid:bad-intent'
  | 'invalid:session-inactive'

/** Outcome of one intent: either an effect to apply, or an explicit refusal. */
export type DispatcherDecision =
  | { ok: true; op: DispatcherOp; id: string; effect: DispatcherEffect }
  | { ok: false; op: string; id?: string; code: DispatcherRefusalCode; message: string }

/** All four whitelisted operation names, in one place. */
export const DISPATCHER_OPS: readonly DispatcherOp[] = [
  'create',
  'update-pending',
  'reassign',
  'mark-blocked',
]

function refusal(
  op: string,
  code: DispatcherRefusalCode,
  message: string,
  id?: string,
): DispatcherDecision {
  return {
    ok: false,
    op,
    ...(id === undefined ? {} : { id }),
    code,
    message,
  }
}

/**
 * True when this intent object smuggles a verifier verdict — either as a
 * top-level `verdict` key or inside a `patch` object. Checked at runtime (not
 * just in types) because intents arriving from the gate are plain JSON.
 */
function carriesVerdict(intent: Record<string, unknown>): boolean {
  if (Object.prototype.hasOwnProperty.call(intent, 'verdict')) return true
  const patch = intent['patch']
  return (
    typeof patch === 'object' &&
    patch !== null &&
    Object.prototype.hasOwnProperty.call(patch, 'verdict')
  )
}

function completedRefusal(op: string, id: string): DispatcherDecision {
  return refusal(
    op,
    'forbidden:completed-immutable',
    `dispatcher refused ${op} on task "${id}": completed tasks are immutable (已完成任务不可修改)`,
    id,
  )
}

function runningRefusal(op: string, id: string): DispatcherDecision {
  return refusal(
    op,
    'forbidden:running-immutable',
    `dispatcher refused ${op} on task "${id}": running tasks cannot be modified (正在跑的任务不可修改)`,
    id,
  )
}

function verdictRefusal(op: string, id?: string): DispatcherDecision {
  return refusal(
    op,
    'forbidden:verdict-immutable',
    `dispatcher refused ${op}${id === undefined ? '' : ` on task "${id}"`}: the verdict belongs to the verifier and the dispatcher must never write it (不可改写 verifier 的 verdict)`,
    id,
  )
}

/**
 * Decide one typed intent against the current board.
 *
 * Pure: reads through `read`, writes nothing, returns the effect for the
 * caller (the session) to apply. The verdict ban is enforced first so it
 * holds regardless of task state; the completed/running bans come next.
 */
export function decideIntent(read: TaskReader, intent: DispatcherIntent): DispatcherDecision {
  // Runtime backstop: a verdict smuggled past the types is still refused.
  if (carriesVerdict(intent as unknown as Record<string, unknown>)) {
    return verdictRefusal(intent.op, 'id' in intent ? String(intent.id) : undefined)
  }
  switch (intent.op) {
    case 'create': {
      if (intent.id.trim() === '' || intent.title.trim() === '') {
        return refusal(intent.op, 'invalid:bad-intent', 'dispatcher refused create: id and title must be non-empty', intent.id)
      }
      if (read.has(intent.id)) {
        return refusal(intent.op, 'invalid:duplicate-id', `dispatcher refused create: task "${intent.id}" already exists`, intent.id)
      }
      return {
        ok: true,
        op: 'create',
        id: intent.id,
        effect: {
          kind: 'insert',
          task: {
            id: intent.id,
            title: intent.title,
            status: 'pending',
            ...(intent.objective === undefined ? {} : { objective: intent.objective }),
            ...(intent.owner === undefined ? {} : { owner: intent.owner }),
          },
        },
      }
    }
    case 'update-pending': {
      const current = read.get(intent.id)
      if (current === undefined) {
        return refusal(intent.op, 'invalid:task-missing', `dispatcher refused update-pending: task "${intent.id}" does not exist`, intent.id)
      }
      if (current.status === 'completed') return completedRefusal(intent.op, intent.id)
      if (current.status === 'running') return runningRefusal(intent.op, intent.id)
      if (current.status !== 'pending') {
        return refusal(intent.op, 'invalid:not-pending', `dispatcher refused update-pending on task "${intent.id}": only pending (not started) tasks can be edited; blocked tasks go through reassign (只能修改未开始任务)`, intent.id)
      }
      if (intent.title === undefined && intent.objective === undefined) {
        return refusal(intent.op, 'invalid:bad-intent', `dispatcher refused update-pending on task "${intent.id}": nothing to update (title or objective required)`, intent.id)
      }
      return {
        ok: true,
        op: 'update-pending',
        id: intent.id,
        effect: {
          kind: 'patch',
          id: intent.id,
          patch: {
            ...(intent.title === undefined ? {} : { title: intent.title }),
            ...(intent.objective === undefined ? {} : { objective: intent.objective }),
          },
        },
      }
    }
    case 'reassign': {
      const current = read.get(intent.id)
      if (current === undefined) {
        return refusal(intent.op, 'invalid:task-missing', `dispatcher refused reassign: task "${intent.id}" does not exist`, intent.id)
      }
      if (current.status === 'completed') return completedRefusal(intent.op, intent.id)
      if (current.status === 'running') return runningRefusal(intent.op, intent.id)
      if (intent.owner.trim() === '') {
        return refusal(intent.op, 'invalid:bad-intent', `dispatcher refused reassign on task "${intent.id}": owner must be non-empty`, intent.id)
      }
      // Reclaim: a blocked task handed to a new owner goes back to pending for
      // a fresh attempt; the old block reason is cleared (the decision, not the
      // history, carries why — history lives on the persisted board).
      // `blockedReason` is rebuilt without the key rather than assigned
      // `undefined`: `exactOptionalPropertyTypes` forbids explicit undefined.
      const patch: Partial<DispatcherTask> = { owner: intent.owner }
      if (current.status === 'blocked') {
        patch.status = 'pending'
        delete patch.blockedReason
      }
      return { ok: true, op: 'reassign', id: intent.id, effect: { kind: 'patch', id: intent.id, patch } }
    }
    case 'mark-blocked': {
      const current = read.get(intent.id)
      if (current === undefined) {
        return refusal(intent.op, 'invalid:task-missing', `dispatcher refused mark-blocked: task "${intent.id}" does not exist`, intent.id)
      }
      if (current.status === 'completed') return completedRefusal(intent.op, intent.id)
      if (current.status === 'running') return runningRefusal(intent.op, intent.id)
      if (intent.reason.trim() === '') {
        return refusal(intent.op, 'invalid:bad-intent', `dispatcher refused mark-blocked on task "${intent.id}": reason must be non-empty`, intent.id)
      }
      return {
        ok: true,
        op: 'mark-blocked',
        id: intent.id,
        effect: { kind: 'patch', id: intent.id, patch: { status: 'blocked', blockedReason: intent.reason } },
      }
    }
  }
}

/**
 * Decide one untyped (gate-side JSON) intent.
 *
 * This is the enforcement point for anything the gate forwards: unknown
 * operation names are rejected, verdict writes are refused before any other
 * check, and malformed fields never reach `decideIntent`.
 */
export function decideRawIntent(read: TaskReader, raw: Record<string, unknown>): DispatcherDecision {
  const op = raw['op']
  const id = typeof raw['id'] === 'string' ? (raw['id'] as string) : undefined
  // Verdict writes are refused under any spelling, before anything else.
  if (op === 'set-verdict' || op === 'verdict' || op === 'write-verdict' || carriesVerdict(raw)) {
    return verdictRefusal(typeof op === 'string' ? op : String(op), id)
  }
  if (typeof op !== 'string' || !(DISPATCHER_OPS as readonly string[]).includes(op)) {
    return refusal(
      typeof op === 'string' ? op : String(op),
      'invalid:unknown-op',
      `dispatcher refused ${String(op)}: unknown operation (白名单只允许 create / update-pending / reassign / mark-blocked)`,
      id,
    )
  }
  if (id === undefined || id.trim() === '') {
    return refusal(op, 'invalid:bad-intent', `dispatcher refused ${op}: id must be a non-empty string`)
  }
  const text = (key: string): string | undefined =>
    typeof raw[key] === 'string' ? (raw[key] as string) : undefined
  switch (op as DispatcherOp) {
    case 'create': {
      const title = text('title')
      if (title === undefined) {
        return refusal(op, 'invalid:bad-intent', `dispatcher refused create on task "${id}": title is required`, id)
      }
      return decideIntent(read, {
        op: 'create',
        id,
        title,
        ...(text('objective') === undefined ? {} : { objective: text('objective') as string }),
        ...(text('owner') === undefined ? {} : { owner: text('owner') as string }),
      })
    }
    case 'update-pending':
      return decideIntent(read, {
        op: 'update-pending',
        id,
        ...(text('title') === undefined ? {} : { title: text('title') as string }),
        ...(text('objective') === undefined ? {} : { objective: text('objective') as string }),
      })
    case 'reassign': {
      const owner = text('owner')
      if (owner === undefined) {
        return refusal(op, 'invalid:bad-intent', `dispatcher refused reassign on task "${id}": owner is required`, id)
      }
      return decideIntent(read, {
        op: 'reassign',
        id,
        owner,
        ...(text('reason') === undefined ? {} : { reason: text('reason') as string }),
      })
    }
    case 'mark-blocked': {
      const reason = text('reason')
      if (reason === undefined) {
        return refusal(op, 'invalid:bad-intent', `dispatcher refused mark-blocked on task "${id}": reason is required`, id)
      }
      return decideIntent(read, { op: 'mark-blocked', id, reason })
    }
  }
}
