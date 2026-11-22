/**
 * The main-session channel: what a message typed *while a run is working* becomes.
 *
 * Requirement: the conversation stays a conversation. A run takes minutes, and the
 * person who started it keeps typing — "再加一个", "别做 B 了", "停". Today every
 * such message either restarts the round (whole-round cancel + narrow restart, so
 * everything in flight is thrown away) or is silently queued behind it, and the
 * composer looks dead until the run settles.
 *
 * This module owns the two decisions that make the channel responsive, and nothing
 * else:
 *
 * - **stop** — an explicit request to stop (a bare "停" / "stop" / "取消") is the
 *   *only* message that cancels a run. It goes through the run's own `cancel()`, so
 *   the settlement is the ordinary one (`keepCancelledWork()`), finished work is
 *   kept, and the cancellation report lands in this conversation.
 * - **forward** — everything else is merged into the live plan instead of
 *   interrupting it. The queue and the boundary pull live in `src/steering.ts` and
 *   `src/replan.ts`; this module composes what goes into that queue, so the planner
 *   receives the user's words *together with* the conversation context that makes
 *   them interpretable ("改成 C" needs the sentence before it).
 *
 * The asymmetry is deliberate and is the whole safety story: a message that is not
 * an unmistakable stop is never allowed to cost the user the work already in flight,
 * because "I guessed you wanted to stop" spends everything while "I queued one extra
 * demand" spends one boundary.
 *
 * Nothing in here starts, awaits, or owns background work: every function is pure,
 * and the caller decides when to queue, cancel, or answer.
 */
import type { TriageLang } from './triage.js';
/**
 * Why a run was cancelled by a message, as the stopped run's own report names it.
 *
 * It has to name the actor: the engine echoes the reason into the cancelled
 * terminal, and "cancelled by its caller" pointed the reader at the wrong one.
 */
export declare const STEER_CANCEL_REASON = "a newer message from the user stopped this run";
/** Ledger outcomes, so a channel decision is auditable after the fact. */
export declare const CHANNEL_OUTCOMES: {
    /** The message joined the plan that is already executing. */
    readonly steered: "steered-into-live-plan";
    /** The message stopped the live run; nothing new was started. */
    readonly stop: "steer-stop";
    /** The message stopped nothing, because nothing was running. */
    readonly idleStop: "steer-stop-idle";
    /** The run ended before a boundary; the demand opened the next round. */
    readonly carried: "steer-carried-to-next-round";
};
/** What one mid-run message asks the run to do. */
export type ChannelIntentKind = 'stop' | 'forward';
/** One classified message. `reason` names the marker that decided it, for the log. */
export interface ChannelIntent {
    kind: ChannelIntentKind;
    reason: string;
}
/** Longest message still treated as a bare stop ("停一下" yes, a task description no). */
export declare const CHANNEL_STOP_MAX_CHARS = 24;
/**
 * Classify one message that arrived while a run is working.
 *
 * Order is the policy: a question is never a stop (the user is asking, not
 * cancelling), and a stop must be an unmistakable imperative — either the whole
 * message, or a strong phrase in a short one. Everything else is forwarded, which is
 * the cheap, reversible outcome.
 *
 * @param request - the user's message, verbatim.
 * @returns the intent plus the marker that decided it.
 */
export declare function classifyChannelMessage(request: string): ChannelIntent;
/**
 * The demand as the planner reads it: the user's words *plus* the conversation that
 * makes them interpretable.
 *
 * A boundary planner child sees the remaining waves and the settled summary, and the
 * queued intent is the only new information it has. "改成 C" alone is unanswerable;
 * the bounded conversation before it is what turns it into an edit. The request is
 * never truncated away — it is the reason the intent exists — so the context is what
 * gets cut, and the cut is marked.
 *
 * @param context - bounded conversation snapshot (`collectHistory` output).
 * @param request - the user's message, verbatim.
 * @param limit - character budget for one intent (`REPLAN_LIMITS.intentChars`).
 * @returns the text to queue, never longer than `limit`.
 */
export declare function composeIntentText(context: string, request: string, limit: number): string;
/**
 * The request the next round is started from when the run settled before a boundary.
 *
 * A demand that never reached the planner must not evaporate: the run's end is not a
 * decision about the user's message, so the channel opens the next round with the
 * previous objective and the queued demands in one text. The next planner is the only
 * thing that can re-plan, and it has to see both the work it continues and the demand
 * that arrived too late to merge.
 *
 * @param previous - objective of the run that just settled, when known.
 * @param demands - the intents nobody consumed, in arrival order.
 * @param limit - `TASK_LIMITS.objectiveChars`; the composed text is the next run's
 *   objective, so exceeding it would make `composeObjective` refuse the whole round.
 * @returns one objective, never longer than `limit`.
 */
export declare function composeCarriedRequest(previous: string | undefined, demands: readonly string[], limit: number): string;
/**
 * Receipt for a message that joined the run in flight.
 *
 * It says three things, because a receipt that omits any of them reads as "your
 * message vanished": it was received, *where* it went (merged into the live plan at
 * the next boundary, not restarted), and how to stop the run if that is not what was
 * wanted. It never claims the run finished.
 *
 * @param lang - language of the user's message.
 * @param pending - how many demands are queued for this run, this one included.
 * @returns one short paragraph, never empty.
 */
export declare function steerReceipt(lang: TriageLang, pending: number): string;
/**
 * Terminal for a run the user stopped.
 *
 * The cancelled run's own settlement states what was verified; this line only names
 * the decision, so the two never contradict each other.
 *
 * @param lang - language of the user's message.
 */
export declare function stopNote(lang: TriageLang): string;
/**
 * Terminal for a stop with nothing to stop.
 *
 * Without it the word "停" would be admitted as a task and spend a planner, a worker
 * and a verifier on it — the gate's default is to run everything it is given.
 *
 * @param lang - language of the user's message.
 */
export declare function idleStopNote(lang: TriageLang): string;
/**
 * Head for the round a late demand opened.
 *
 * The demand arrives one round later than it was typed, so the reader is told why:
 * nothing was lost, and nothing of the previous round is redone.
 *
 * @param lang - language of the user's message.
 * @param count - how many demands were carried over.
 */
export declare function carriedNote(lang: TriageLang, count: number): string;
//# sourceMappingURL=channel.d.ts.map