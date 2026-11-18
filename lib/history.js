/**
 * Bounded conversation history for gate-routed messages.
 *
 * A follow-up message ("now do the same for the other file") is meaningless to a
 * planner that never saw the previous exchange, so the gate forwards a bounded,
 * redacted excerpt of the durable conversation. The budget is deliberately small:
 * it is context, not the objective.
 */
import { redactSecrets } from './redact.js';
/** Source kinds that belong to this plugin and must not be replayed as user history. */
const PLUGIN_SOURCE_KINDS = new Set(['grok-workflow']);
/** Per-message cap so one huge answer cannot consume the whole budget. */
const MESSAGE_CAP = 1_500;
/**
 * How far past MESSAGE_CAP redaction may look for the far end of a secret
 * that starts inside the cap (a PEM block, a long JWT, an sk- token). The
 * per-message regex cost stays bounded at MESSAGE_CAP + REDACT_SPAN.
 */
const REDACT_SPAN = 8_192;
/** PEM/PGP open marker: a block whose END lies past the window never matches. */
const KEY_BEGIN_MARKER = '-----BEGIN ';
const KEY_END_MARKER = '-----END ';
/**
 * Fail closed on a key block cut off by the redaction window: when the text
 * carries an open marker with no matching close marker, the tail from the
 * marker on is key material that no rule could match, so drop it in favour of
 * the placeholder. Complete blocks are already replaced by `redactSecrets`
 * and never reach this check.
 */
function dropDanglingKeyBlock(text) {
    const begin = text.indexOf(KEY_BEGIN_MARKER);
    if (begin === -1)
        return text;
    if (text.indexOf(KEY_END_MARKER, begin) !== -1)
        return text;
    return `${text.slice(0, begin)}[REDACTED PRIVATE KEY]`;
}
/** Plain text of one message, or an empty string when it carries none. */
function textOf(message) {
    const parts = [];
    for (const block of message.content) {
        if (typeof block !== 'object' || block === null)
            continue;
        const candidate = block;
        if (candidate.type !== 'text' || typeof candidate.text !== 'string')
            continue;
        parts.push(candidate.text);
    }
    return parts.join('\n').trim();
}
/** True when the message is a plugin-relayed report rather than user speech. */
function isPluginMessage(message) {
    const source = message.source;
    return typeof source?.kind === 'string' && PLUGIN_SOURCE_KINDS.has(source.kind);
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
export function renderHistory(messages, bounds, excludeIds = []) {
    if (bounds.turns <= 0 || bounds.chars <= 0)
        return '';
    const excluded = excludeIds.length === 0 ? undefined : new Set(excludeIds);
    const wanted = bounds.turns * 2;
    const recent = [];
    for (const message of messages) {
        if (message.role !== 'user' && message.role !== 'assistant')
            continue;
        if (excluded !== undefined && excluded.has(String(message.id)))
            continue;
        if (isPluginMessage(message))
            continue;
        // Redact *first* on a bounded window, then truncate: redaction runs on at
        // most MESSAGE_CAP + REDACT_SPAN characters, so a very long message never
        // pays unbounded regex time, and a secret straddling the cap is still
        // matched whole (rules below fire on the far end, and the character
        // classes they use consume body characters, not whitespace alone, so
        // spaces/punctuation on one side do not hide the shape). A key block cut
        // off with its END past the window matches no rule by construction, so it
        // is dropped fail-closed. Benign text never contains a BEGIN marker, so it
        // passes through byte-identical.
        const raw = textOf(message);
        const truncated = raw.length > MESSAGE_CAP;
        const window = truncated ? raw.slice(0, MESSAGE_CAP + REDACT_SPAN) : raw;
        const redactedWindow = redactSecrets(window);
        // The window is only longer than the cap so redaction can see past it:
        // render at most one cap of text (plus the truncation ellipsis below).
        const redacted = truncated ? redactedWindow.slice(0, MESSAGE_CAP) : redactedWindow;
        const text = truncated ? dropDanglingKeyBlock(redacted) : redacted;
        if (text === '')
            continue;
        recent.push({
            role: message.role === 'user' ? 'User' : 'Assistant',
            text: truncated ? `${text.slice(0, MESSAGE_CAP)}…` : text,
        });
    }
    const selected = [];
    let budget = bounds.chars;
    for (let index = recent.length - 1; index >= 0 && selected.length < wanted && budget > 0; index -= 1) {
        const entry = recent[index];
        const cost = entry.text.length + entry.role.length + 2;
        if (cost > budget && selected.length > 0)
            break;
        selected.push({ role: entry.role, text: entry.text.slice(0, Math.max(0, budget)) });
        budget -= Math.min(cost, budget);
    }
    selected.reverse();
    if (selected.length === 0)
        return '';
    const lines = selected.map(entry => `${entry.role}: ${entry.text}`);
    return ['Conversation so far (context only):', ...lines].join('\n');
}
/** Render the durable history of one session, tolerating an unavailable session. */
export function collectHistory(session, bounds, excludeIds = []) {
    if (session === undefined || typeof session.deriveMessages !== 'function')
        return '';
    try {
        return renderHistory(session.deriveMessages(), bounds, excludeIds);
    }
    catch {
        return '';
    }
}
/**
 * Compose the gate objective from forwarded history and the current message.
 *
 * @param history - already rendered history block, or an empty string.
 * @param request - the current user message text.
 * @param limit - maximum length of the composed objective; the current message is never shortened.
 * @returns the objective, or `undefined` when the current message alone exceeds the limit.
 */
export function composeObjective(history, request, limit) {
    // The limit applies to the user's message itself: it is the instruction that
    // must arrive whole, so a message at the limit is never refused because the
    // "Current request:" label would push the composed objective one line over.
    if (request.length > limit)
        return undefined;
    const base = `Current request:\n${request}`;
    // The label is dropped rather than shortening the message: at the very top of
    // the range the objective is exactly the request, with no history attached.
    if (base.length > limit)
        return request;
    if (history === '')
        return base;
    // Two characters separate the blocks, and the ellipsis needs one more.
    const room = limit - base.length - 2;
    if (room < 16)
        return base;
    const trimmed = history.length > room ? `${history.slice(0, room - 1)}…` : history;
    return `${trimmed}\n\n${base}`;
}
//# sourceMappingURL=history.js.map