/**
 * The host-side entrance a mid-run demand was missing: a message that arrives in a
 * session while that session's workflow is working joins the run's live queue.
 *
 * `D-161` left the pipe connected but nobody able to use it: `grok_workflow` is one
 * synchronous tool call, the turn that makes it is busy, and a subagent is refused by
 * the tool's own `origin === 'subagent'` guard. So the question "who can queue a demand
 * mid-run" had no living answer, and `grok_steer` could only ever report that nothing
 * was running.
 *
 * The Host answers it, not the caller's turn: every message that enters a live inbox is
 * announced as `agent/inbox/inserted` the moment it is spliced in — the loop's own
 * `inbox.splice()` emits it synchronously, before any step boundary is decided. A
 * message typed while a tool call is in flight therefore arrives here while the call is
 * still running, which is exactly the window this feature needs. This module listens,
 * filters, and hands the text to the queue `runWorkflow` opened for that session; the
 * boundary planner pulls it from there.
 *
 * What this deliberately does not do:
 *
 * - It opens no channel of its own. No live queue (no run, or `replan` off — the run
 *   only opens one when the switch is on) means the message is dropped on the floor of
 *   this module and the turn behaves exactly as it did before.
 * - It does not remove, edit or consume the message. The user's words stay in the
 *   inbox, so the same message is still answered as an ordinary turn afterwards: a
 *   merged demand gets incorporated into the plan *and* gets its own reply. Anything
 *   else would silently swallow a message the user can see in the transcript.
 * - It never logs the text. A demand can carry anything a message can carry, so the log
 *   says how many are pending, never what they say (`D-161`, closing rule 5).
 */
import { steeringForSession } from './steering.js';
/** The Host event this module reads. Emitted once per message spliced into a live inbox. */
export const STEERING_INBOX_EVENT = 'agent/inbox/inserted';
/**
 * Message ids remembered for the duplicate guard.
 *
 * One message can be inserted twice: a message the composer queued is spliced into
 * `next-turn`, and "steer this queued message into the running turn" removes it and
 * re-inserts the same message into `next-step` — two `inserted` events, one message.
 * Queueing that text twice would put the same demand in front of the boundary planner
 * twice, so the last {@link STEERING_INBOX_SEEN} ids are remembered.
 */
export const STEERING_INBOX_SEEN = 64;
/**
 * The text a message carries, or `''` when it carries none.
 *
 * Only `text` blocks count: an image-only message is not a demand a plan can merge, and
 * a tool or model block is not the user speaking.
 * @param content - the message's content blocks, of any shape.
 * @returns the joined text, trimmed.
 */
function textOf(content) {
    if (!Array.isArray(content))
        return '';
    const parts = [];
    for (const block of content) {
        if (block === null || typeof block !== 'object')
            continue;
        const candidate = block;
        if (candidate.type !== 'text' || typeof candidate.text !== 'string')
            continue;
        parts.push(candidate.text);
    }
    return parts.join('\n').trim();
}
/**
 * Whether this message is a person speaking in the conversation.
 *
 * A `user`-role message is not enough on its own: the workflow engine's own children are
 * fed `user`-role prompts, and a scheduled heartbeat arrives as a user message too. The
 * discriminating field is the source kind, and the answer is an allow-list rather than a
 * deny-list — a kind this build has never heard of is not a human demand, so a producer
 * added by another plugin later cannot start steering runs by accident.
 *
 * `user-question-reply` is deliberately *not* on the list: a card answer answers a
 * question this plugin asked, in the host's own vocabulary, and merging it as a demand
 * would put a JSON answer batch in front of the boundary planner as if the user had
 * said it.
 * @param message - the payload's message.
 * @returns true only for an ordinary human prompt.
 */
function isHumanPrompt(message) {
    if (message === undefined)
        return false;
    if (message.role !== 'user')
        return false;
    const kind = message.source?.kind;
    return kind === 'user';
}
/**
 * Install the inbox subscriber.
 *
 * Registered as one host listener; the returned disposer removes it, so a plugin unload
 * leaves no listener behind (`AGENTS.md` §4: no ownerless background work).
 * @param input - context, logger and clock.
 * @returns the disposer.
 */
export function installSteeringInbox(input) {
    const { ctx, logger } = input;
    const now = input.now ?? (() => Date.now());
    const host = ctx;
    if (typeof host.on !== 'function')
        return () => { };
    const seen = new Set();
    const seenOrder = [];
    /** Remember one id, forgetting the oldest past the bound. */
    const remember = (id) => {
        seen.add(id);
        seenOrder.push(id);
        while (seenOrder.length > STEERING_INBOX_SEEN) {
            const dropped = seenOrder.shift();
            if (dropped !== undefined)
                seen.delete(dropped);
        }
    };
    /**
     * Queue the message's text for the live run in its own session, if there is one.
     *
     * Everything here is best-effort: a listener that threw would break the turn that
     * delivered the message, so a failure is warned about once and then swallowed.
     */
    const handle = (payload) => {
        try {
            if (!isHumanPrompt(payload?.message))
                return;
            const sessionId = payload.agent?.session?.id;
            if (typeof sessionId !== 'string' || sessionId === '')
                return;
            const queue = steeringForSession(sessionId);
            if (queue === undefined)
                return;
            const id = payload.message?.id;
            if (typeof id === 'string' && id !== '') {
                if (seen.has(id))
                    return;
                remember(id);
            }
            const text = textOf(payload.message?.content);
            if (text === '')
                return;
            if (!queue.push(text, now()))
                return;
            logger.info?.(`steering: a message in this session joined the running workflow's queue (${queue.size} pending)`);
        }
        catch (error) {
            logger.warn(`steering: could not queue a message for the running workflow: ${String(error)}`);
        }
    };
    const dispose = host.on(STEERING_INBOX_EVENT, handle);
    return typeof dispose === 'function' ? dispose : () => { };
}
//# sourceMappingURL=steering-inbox.js.map