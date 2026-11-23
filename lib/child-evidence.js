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
/** Read a value as a plain record without trusting it. */
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : undefined;
}
/** Read one string field off an untrusted record. */
function readString(value, key) {
    const record = asRecord(value);
    const read = record?.[key];
    return typeof read === 'string' && read !== '' ? read : undefined;
}
/** Read the HTTP status a failure fact carries, when it carries a usable one. */
function readStatus(value) {
    const record = asRecord(value);
    const read = record?.['status'];
    return typeof read === 'number' && Number.isFinite(read) ? read : undefined;
}
/**
 * Read one `LlmFailure`-shaped value (`{message, code, status}`) without trusting
 * its shape. A failure without a message is not evidence, so it answers
 * `undefined` rather than an empty fact.
 * @param value - the candidate failure.
 * @returns The failure facts, or `undefined`.
 */
export function failureFact(value) {
    const message = readString(value, 'message');
    if (message === undefined)
        return undefined;
    const code = readString(value, 'code');
    const status = readStatus(value);
    return {
        message,
        ...code === undefined ? {} : { code },
        ...status === undefined ? {} : { status },
    };
}
/**
 * The engine's own stop word for a `turn/end` reason.
 *
 * Same vocabulary the subagent manager derives for its own `stopReason`
 * (`epochStopReason`), so a cause read here and a cause read from the engine's
 * result cannot disagree about the same ending.
 * @param reason - the `turn/end` reason.
 * @returns The stop word, or `undefined` when the reason is unreadable.
 */
function stopWordOf(reason) {
    const kind = readString(reason, 'kind');
    switch (kind) {
        case 'completed': return 'completed';
        case 'aborted':
        case 'interrupted': return 'aborted';
        case 'blocked': return 'refusal';
        case 'max-tokens': return 'max-tokens';
        case 'error': return 'error';
        case 'forked': return 'aborted';
        case undefined: return undefined;
        default: return 'error';
    }
}
/** The failure a `turn/end` reason carries, if it carries one. */
function failureOfTurnEnd(reason) {
    return failureFact(asRecord(reason)?.['error']);
}
/**
 * The failure the last `assistant/attempt` recorded, if the log ended mid-turn.
 *
 * A provider refusal arrives as a `finish` chunk inside the attempt's stream, and
 * that chunk is committed before the turn closer is. Reading it as well is what
 * makes a child that died before its turn closed still namable.
 * @param data - one `assistant/attempt` payload.
 * @returns The last failure the stream carried, or `undefined`.
 */
function failureOfAttempt(data) {
    const stream = asRecord(data)?.['stream'];
    if (!Array.isArray(stream))
        return undefined;
    let found;
    for (const entry of stream) {
        const chunk = asRecord(asRecord(entry)?.['chunk']);
        if (chunk === undefined || chunk['type'] !== 'finish')
            continue;
        const reason = asRecord(chunk['reason']);
        if (reason === undefined || reason['kind'] !== 'error')
            continue;
        const fact = failureFact(reason['failure']) ?? failureFact(reason['error']);
        if (fact !== undefined)
            found = fact;
    }
    return found;
}
/** The events a session object can hand out, from `fromSeq` when it can bound them. */
function eventsOf(session, fromSeq) {
    const read = asRecord(session)?.['snapshotEvents'];
    if (typeof read === 'function') {
        try {
            const events = fromSeq === undefined
                ? read.call(session)
                : read.call(session, fromSeq);
            if (Array.isArray(events))
                return events;
        }
        catch {
            // A detached or closing session refuses the read; fall through to ownEvents.
        }
    }
    const own = asRecord(session)?.['ownEvents'];
    if (typeof own !== 'function')
        return [];
    try {
        const events = own.call(session);
        return Array.isArray(events) ? events : [];
    }
    catch {
        return [];
    }
}
/** Fold one event list into the child's terminal verdict. */
function foldVerdict(events) {
    let verdict;
    let attemptFailure;
    for (const event of events) {
        const record = asRecord(event);
        if (record === undefined)
            continue;
        const type = record['type'];
        if (type === 'turn/end') {
            const reason = asRecord(record['data'])?.['reason'];
            const stop = stopWordOf(reason);
            if (stop === undefined)
                continue;
            const failure = failureOfTurnEnd(reason);
            verdict = { stopReason: stop, ...(failure === undefined ? {} : { failure }) };
            attemptFailure = undefined;
            continue;
        }
        if (type === 'assistant/attempt') {
            const fact = failureOfAttempt(record['data']);
            if (fact !== undefined)
                attemptFailure = fact;
        }
    }
    if (verdict === undefined && attemptFailure !== undefined) {
        return { stopReason: 'error', failure: attemptFailure };
    }
    if (verdict !== undefined && verdict.failure === undefined && attemptFailure !== undefined) {
        return { ...verdict, failure: attemptFailure };
    }
    return verdict;
}
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
export function sessionVerdict(session, fromSeq) {
    if (session === undefined || session === null)
        return undefined;
    try {
        const bounded = fromSeq === undefined ? undefined : foldVerdict(eventsOf(session, fromSeq));
        if (bounded !== undefined)
            return bounded;
        return foldVerdict(eventsOf(session, undefined));
    }
    catch {
        return undefined;
    }
}
/**
 * The log position of a live session, for a caller that wants the bounded read.
 * @param session - the child's live session object, or anything.
 * @returns The position, or `undefined` when the session cannot report one.
 */
export function sessionPosition(session) {
    const read = asRecord(session)?.['seq'];
    return typeof read === 'number' && Number.isFinite(read) ? read : undefined;
}
//# sourceMappingURL=child-evidence.js.map