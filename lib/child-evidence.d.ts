/**
 * What a child's own session log says about how that child ended.
 *
 * Why this module exists (T1 step 2, D-117 ②): the plugin's engine seam sees the
 * child's activation receipt, and the receipt's `result` settles with
 * `{output, stopReason, structured}` only. On the in-process (`spawn`) subagent
 * path that result carries no provider `diagnostic`
 * (`@deepseek-ai/dsh-subagent` `captureLocalResult`), so a child killed by a
 * refused key or an expired deadline reached the report as the bare word `error`
 * and the classification could only say `unknown`. Read on a real machine: four
 * 401 child deaths produced `the child run ended \`error\`` while the child's own
 * log held `401: {"message":"virtual key is required…"}`.
 *
 * The cause is not missing — it is one layer down. The child session commits its
 * failure to its own log: a `turn/end` event whose reason is
 * `{kind: 'error', error: {message, code, status}}` (the provider's facts
 * verbatim, per `LlmFailure` in `@deepseek-ai/dsh-llm`), and, for a death before
 * the turn closer, a `finish` chunk carrying the same facts inside the last
 * `assistant/attempt`. This module folds exactly those two shapes and nothing
 * else.
 *
 * Reading it is the plugin's existing, documented path for a child's transcript:
 * `ctx.get('sessions')` and then the session object the store hands back (see
 * `src/memory/recorder.ts`, which reads a settled child's assistant text the same
 * way). The session is captured when the child starts, not when it settles,
 * because the engine disposes the child before the settlement reaches the host.
 *
 * Everything here is defensive. A session that cannot be read, an event of an
 * unexpected shape and a log with no failure at all all answer `undefined`, which
 * the caller reports as "the cause was not recorded" rather than guessing.
 *
 * @module dsh-grok-workflow/child-evidence
 */
/** The provider's own failure facts, as the child's log recorded them. */
export interface ChildFailureFact {
    /** The provider or transport message, verbatim (redacted later by the host). */
    message: string;
    /** The provider-neutral machine code (`AUTH`, `RATE_LIMIT`, `TIMEOUT`, `HTTP_502`, …). */
    code?: string;
    /** HTTP status the provider returned, when it gave one. */
    status?: number;
}
/** How one child session's own log says its last turn ended. */
export interface ChildSessionVerdict {
    /** The engine's own word for the ending, derived from `turn/end` (`error`, `aborted`, …). */
    stopReason?: string;
    /** The provider's failure, when the log carried one. */
    failure?: ChildFailureFact;
}
/**
 * Read one `LlmFailure`-shaped value (`{message, code, status}`) without trusting
 * its shape. A failure without a message is not evidence, so it answers
 * `undefined` rather than an empty fact.
 * @param value - the candidate failure.
 * @returns The failure facts, or `undefined`.
 */
export declare function failureFact(value: unknown): ChildFailureFact | undefined;
/**
 * Read how one child session's own log says the child ended.
 *
 * The bounded window is tried first (the events this activation produced, when
 * the caller captured the session's position at start); the whole log is the
 * fallback, which covers a session whose events all landed before the caller
 * could take its mark. A log that says nothing usable answers `undefined` — the
 * honest answer, and the one the caller turns into "cause not recorded".
 * @param session - the child's live session object, or anything.
 * @param fromSeq - log position captured when the child started, when known.
 * @returns The terminal verdict, or `undefined` when the log carries none.
 */
export declare function sessionVerdict(session: unknown, fromSeq?: number): ChildSessionVerdict | undefined;
/**
 * The log position of a live session, for a caller that wants the bounded read.
 * @param session - the child's live session object, or anything.
 * @returns The position, or `undefined` when the session cannot report one.
 */
export declare function sessionPosition(session: unknown): number | undefined;
//# sourceMappingURL=child-evidence.d.ts.map