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
/** The Host event this module reads. Emitted once per message spliced into a live inbox. */
export declare const STEERING_INBOX_EVENT: "agent/inbox/inserted";
/**
 * Message ids remembered for the duplicate guard.
 *
 * One message can be inserted twice: a message the composer queued is spliced into
 * `next-turn`, and "steer this queued message into the running turn" removes it and
 * re-inserts the same message into `next-step` — two `inserted` events, one message.
 * Queueing that text twice would put the same demand in front of the boundary planner
 * twice, so the last {@link STEERING_INBOX_SEEN} ids are remembered.
 */
export declare const STEERING_INBOX_SEEN = 64;
/** What this module needs from the Host, kept narrow so a test does not build one. */
export interface SteeringInboxInput {
    /** The plugin context; only `on` is used. */
    ctx: unknown;
    /** Diagnostics. Receives counts and warnings, never message text. */
    logger: {
        warn(message: string): void;
        info?(message: string): void;
    };
    /** Clock, injected so a test can pin the arrival time. */
    now?: () => number;
}
/**
 * Install the inbox subscriber.
 *
 * Registered as one host listener; the returned disposer removes it, so a plugin unload
 * leaves no listener behind (`AGENTS.md` §4: no ownerless background work).
 * @param input - context, logger and clock.
 * @returns the disposer.
 */
export declare function installSteeringInbox(input: SteeringInboxInput): () => void;
//# sourceMappingURL=steering-inbox.d.ts.map