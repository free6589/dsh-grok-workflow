/**
 * The live steering channel: what a mid-run message becomes.
 *
 * The workflow engine gives a running script no way to receive data (its `args` are
 * cloned at start, its realm has no timers and no fs, and the only host action is a
 * whole-run cancel), so a demand that arrives mid-run is *pulled* by the script at a
 * wave boundary: the boundary planner child calls {@link STEERING_TOOL_NAME}, the
 * host hands over whatever the run's session queued, and marks it consumed.
 *
 * This module is that queue and its lifetime. It is deliberately small and inert
 * when the feature is off: a run that never registers a queue costs nothing, and a
 * gate path with no live queue behaves exactly as it did before.
 *
 * Bounds: at most {@link STEERING_LIMITS.maxQueued} pending intents per run, one
 * intent is at most {@link STEERING_LIMITS.intentChars} characters, and an overflow
 * drops the oldest intent and counts the drop instead of growing without limit.
 */

import { REPLAN_LIMITS } from './replan.js'

/** Tool a boundary planner child calls to pull the demands queued for its run. */
export const STEERING_TOOL_NAME = 'grok_replan_intents'

/** Bounds on the live queue. */
export const STEERING_LIMITS = {
  /** Pending intents one run may hold; the oldest is dropped past this. */
  maxQueued: REPLAN_LIMITS.maxIntents,
  /** Characters one intent may carry; a longer message is truncated, never dropped. */
  intentChars: REPLAN_LIMITS.intentChars,
} as const

/** One queued demand, in the session's own words. */
export interface SteeringIntent {
  /** Stable id, `<token>-<n>`, so a merge can name what it consumed. */
  id: string
  /** The user's message, bounded. */
  text: string
  /** When it arrived (epoch ms), for ordering only. */
  atMs: number
}

/** What the pull tool answers. */
export interface SteeringPull {
  intents: SteeringIntent[]
  /** Intents dropped because the queue was full. */
  dropped: number
}

/**
 * One run's pending demands.
 *
 * `take()` is the only consumer: it hands over everything pending and clears the
 * queue in one step, so a boundary child that is retried on another route cannot
 * see the same demand twice.
 */
export class SteeringQueue {
  private readonly pending: SteeringIntent[] = []
  private droppedCount = 0
  private sequence = 0

  constructor(readonly token: string) {}

  /** True when at least one demand is waiting. */
  get size(): number {
    return this.pending.length
  }

  /** Dropped-intent count so far. */
  get dropped(): number {
    return this.droppedCount
  }

  /**
   * Queue one message for the next boundary.
   * @param text - the user's message.
   * @param nowMs - arrival time (injected so tests are deterministic).
   * @returns true when it was queued, false when it was empty and ignored.
   */
  push(text: string, nowMs: number = Date.now()): boolean {
    const trimmed = text.trim()
    if (trimmed === '') return false
    if (this.pending.length >= STEERING_LIMITS.maxQueued) {
      this.pending.shift()
      this.droppedCount += 1
    }
    this.sequence += 1
    this.pending.push({
      id: this.token + '-' + this.sequence,
      text: trimmed.slice(0, STEERING_LIMITS.intentChars),
      atMs: nowMs,
    })
    return true
  }

  /**
   * Consume every pending demand.
   * @returns the intents in arrival order, plus the drop count.
   */
  take(): SteeringPull {
    const intents = this.pending.splice(0, this.pending.length)
    return { intents, dropped: this.droppedCount }
  }
}

/** Live queues by run token. A token is created once per run and closed at its end. */
const queues = new Map<string, SteeringQueue>()

/** Live queue by session, so the gate can find the run a message belongs to. */
const bySession = new Map<string, SteeringQueue>()

let tokenCounter = 0

/**
 * Mint a run token without registering anything.
 *
 * The token is needed *before* the queue exists: `buildWorkflowRequest` budgets
 * the boundary calls from it, while the registration must happen as late as
 * possible in the run's setup (a run that never starts leaves no queue behind —
 * see `runWorkflow`). Minting and registering are therefore two steps, and this
 * is the first one.
 * @returns a token unique within this process.
 */
export function mintSteeringToken(): string {
  tokenCounter += 1
  return `steer-${Date.now().toString(36)}-${tokenCounter}`
}

/**
 * Register a run's steering channel.
 * @param sessionId - the session the run belongs to.
 * @param token - the run token; omitted means a fresh one (tests, callers that
 *   do not need to know it in advance).
 * @returns the queue and the token the script must quote.
 */
export function openSteering(
  sessionId: string,
  token: string = mintSteeringToken(),
): { token: string, queue: SteeringQueue } {
  const queue = new SteeringQueue(token)
  queues.set(token, queue)
  // A session has at most one live queue: its newest run owns the channel.
  bySession.set(sessionId, queue)
  return { token, queue }
}

/**
 * Close one run's channel; called from the run's `finally`.
 *
 * Only this token's entries are removed. A newer run in the same session that
 * already took the channel over keeps it: the session mapping is dropped only
 * when it still points at *this* token, so closing an older run cannot make a
 * live run unsteerable.
 * @param token - the token returned by {@link openSteering}.
 */
export function closeSteering(token: string): void {
  queues.delete(token)
  for (const [sessionId, queue] of bySession) {
    if (queue.token === token) bySession.delete(sessionId)
  }
}

/** Close every channel (plugin unload). */
export function closeAllSteering(): void {
  queues.clear()
  bySession.clear()
}

/**
 * The live queue a message for this session should join.
 * @param sessionId - the session the message arrived in.
 * @returns the queue, or undefined when no run is steering.
 */
export function steeringForSession(sessionId: string): SteeringQueue | undefined {
  return bySession.get(sessionId)
}

/**
 * The pull tool's implementation: consume the demands for one token.
 *
 * An unknown token answers empty instead of throwing: a stale boundary child must
 * cost one useless call, never the run. The token is compared exactly and is never
 * echoed back.
 * @param token - the run token the child read from its prompt.
 * @returns the consumed intents (empty for an unknown token).
 */
export function pullSteering(token: unknown): SteeringPull {
  if (typeof token !== 'string' || token === '') return { intents: [], dropped: 0 }
  const queue = queues.get(token)
  if (queue === undefined) return { intents: [], dropped: 0 }
  return queue.take()
}
