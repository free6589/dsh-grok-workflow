/**
 * Bounded conversation history for gate-routed messages.
 *
 * A follow-up message ("now do the same for the other file") is meaningless to a
 * planner that never saw the previous exchange, so the gate forwards a bounded,
 * redacted excerpt of the durable conversation. The budget is deliberately small:
 * it is context, not the objective.
 */
import type { Message } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
/** Bounds applied to the forwarded history. */
export interface HistoryBounds {
    /** Prior exchanges to forward (each exchange is one user plus one assistant message). */
    turns: number;
    /** Total character budget for the rendered history block. */
    chars: number;
}
/**
 * Render the most recent conversational messages as a bounded context block.
 *
 * @param messages - durable conversation messages in order.
 * @param bounds - turn and character bounds.
 * @param excludeIds - message ids to leave out. The gate's `relay`/`append`
 *   strategies write the claimed batch themselves before the run starts (the step
 *   is rejected, so nothing else would), and the history read that follows must
 *   not hand the words the user just typed back to the run as "prior
 *   conversation": the objective would carry the message twice — once as history,
 *   once as the current request.
 * @returns the rendered block, or an empty string when there is nothing to forward.
 */
export declare function renderHistory(messages: readonly Message[], bounds: HistoryBounds, excludeIds?: readonly string[]): string;
/** Render the durable history of one session, tolerating an unavailable session. */
export declare function collectHistory(session: Session | undefined, bounds: HistoryBounds, excludeIds?: readonly string[]): string;
/**
 * Compose the gate objective from forwarded history and the current message.
 *
 * @param history - already rendered history block, or an empty string.
 * @param request - the current user message text.
 * @param limit - maximum length of the composed objective; the current message is never shortened.
 * @returns the objective, or `undefined` when the current message alone exceeds the limit.
 */
export declare function composeObjective(history: string, request: string, limit: number): string | undefined;
//# sourceMappingURL=history.d.ts.map