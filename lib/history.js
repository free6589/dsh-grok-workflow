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
 * @returns the rendered block, or an empty string when there is nothing to forward.
 */
export function renderHistory(messages, bounds) {
    if (bounds.turns <= 0 || bounds.chars <= 0)
        return '';
    const wanted = bounds.turns * 2;
    const recent = [];
    for (const message of messages) {
        if (message.role !== 'user' && message.role !== 'assistant')
            continue;
        if (isPluginMessage(message))
            continue;
        // Bound the input *before* running the redaction regexes: a very long message
        // must not pay unbounded regex time just to be truncated below.
        const raw = textOf(message);
        const truncated = raw.length > MESSAGE_CAP;
        const text = redactSecrets(truncated ? raw.slice(0, MESSAGE_CAP) : raw);
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
export function collectHistory(session, bounds) {
    if (session === undefined || typeof session.deriveMessages !== 'function')
        return '';
    try {
        return renderHistory(session.deriveMessages(), bounds);
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
 * @param limit - maximum objective length accepted by the workflow builder.
 * @returns the objective, or `undefined` when the current message alone exceeds the limit.
 */
export function composeObjective(history, request, limit) {
    const base = `Current request:\n${request}`;
    if (base.length > limit)
        return undefined;
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