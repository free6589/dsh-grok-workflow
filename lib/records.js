/**
 * Durable delivery records for the mandatory-entry gate.
 *
 * `appendPluginRecord` writes an `ignorable` event that never enters the
 * model-visible surface, survives fork/resume, and can be read back with
 * `pluginRecordOf` (measured in DSH 0.2.1-rc.2). Records are plugin-owned
 * state: every reader revalidates `data`, because a restored record may carry
 * whatever an earlier build wrote.
 */
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session';
import { redactError, redactSecrets } from './redact.js';
/** Record type owned by this plugin. */
export const DELIVERY_RECORD = 'plugin:grok-workflow/delivery';
/** Record type owned by this plugin: the model-route ledger of one run. */
export const ROUTING_RECORD = 'plugin:grok-workflow/routing';
/** Maximum switches kept in one ledger record. */
const ROUTING_RECORD_LIMIT = 64;
/**
 * Deterministic identity for one claimed batch.
 *
 * The key is derived from the agent and the exact claimed message ids, so a
 * replay of the same delivery (resume, fork, duplicate followup) recomputes the
 * same key without keeping any process-local state.
 */
export function deliveryKey(agentId, messages) {
    const ids = messages.map(message => String(message.id)).sort();
    return `grok-workflow:${agentId}:${ids.join(',')}`;
}
/** True when the payload is a record this build can trust. */
function isDeliveryRecord(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const record = value;
    return record.v === 1
        && typeof record.key === 'string'
        && typeof record.agentId === 'string'
        && Array.isArray(record.messageIds)
        && record.messageIds.every(id => typeof id === 'string')
        && (record.phase === 'started' || record.phase === 'delivered' || record.phase === 'failed')
        && typeof record.turn === 'number'
        && typeof record.outcome === 'string';
}
/** Every delivery record this plugin committed to the session, oldest first. */
export function readDeliveries(session) {
    if (session === undefined || typeof session.ownEvents !== 'function')
        return [];
    const records = [];
    for (const event of session.ownEvents()) {
        const record = pluginRecordOf(event);
        if (record === undefined || record.type !== DELIVERY_RECORD)
            continue;
        const data = record.data;
        if (isDeliveryRecord(data))
            records.push(data);
    }
    return records;
}
/**
 * True when the batch was already routed by this plugin.
 *
 * `started` and `delivered` count: a run was launched for these exact messages,
 * so routing them again would start a second workflow for one user message.
 * `failed` does not count — a refusal that never launched a run (busy queue,
 * oversized message) must not become a permanent block on that message.
 */
export function alreadyRouted(session, key) {
    return readDeliveries(session).some(record => record.key === key && (record.phase === 'started' || record.phase === 'delivered'));
}
/**
 * Append one delivery record.
 *
 * A record is durable plugin state, not a correctness dependency for the current
 * turn: when the session refuses the write we warn and continue, and the run
 * still happens (the gate never answers by itself).
 */
export function recordDelivery(session, record, logger) {
    if (session === undefined || typeof session.append !== 'function')
        return;
    try {
        appendPluginRecord(session, DELIVERY_RECORD, record);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logger.warn(`delivery record not persisted (${record.key}): ${detail}`);
    }
}
/** Roles in report order; also the closed set a ledger switch may name. */
const ROLES = ['planner', 'worker', 'verifier', 'synthesizer'];
/** Coerce a possibly-missing numeric field into a non-negative integer. */
function counter(value, fallback) {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
    return numeric < 0 ? fallback : numeric;
}
/** Redact and bound one free-text ledger field. */
function ledgerText(value, max) {
    return redactSecrets(value).replace(/\s+/g, ' ').trim().slice(0, max);
}
/**
 * Record the model-route ledger of one run.
 *
 * A run may switch routes many times, so the ledger is one plugin record (not
 * one record per switch): bounded, redacted, and never allowed to throw into
 * the caller that is delivering a workflow answer.
 */
export function recordRouting(session, entry, logger, limit = ROUTING_RECORD_LIMIT) {
    if (session === undefined)
        return;
    // The caller's `recordLimit` bounds the ledger; 0 means "write nothing".
    const cap = Math.max(0, Math.min(limit, ROUTING_RECORD_LIMIT));
    if (cap === 0)
        return;
    // Every field is coerced: one malformed route entry (a missing `attempt`, a
    // non-string route id) must not cost the whole ledger, because the ledger is
    // the only record of how a run picked its models (t28/F3).
    const safeRoute = (route) => ({
        role: ROLES.includes(route.role) ? route.role : 'worker',
        chainIndex: counter(route.chainIndex, 0),
        route: typeof route.route === 'string' ? route.route.slice(0, 160) : 'inherit',
        attempt: Math.max(1, counter(route.attempt, 1)),
        outcome: route.outcome === 'ok' ? 'ok' : 'failed',
        ...typeof route.failureClass === 'string' ? { failureClass: route.failureClass.slice(0, 60) } : {},
        ...typeof route.reason === 'string' ? { reason: ledgerText(route.reason, 200) } : {},
    });
    // Sanitize first, then select: filtering the raw entries would drop a route
    // whose fields were malformed instead of recording its coerced form.
    const switches = entry.routes
        .map(safeRoute)
        .filter(route => route.outcome === 'failed' || route.chainIndex > 0)
        .slice(0, cap);
    if (switches.length === 0)
        return;
    const routing = { planner: [], worker: [], verifier: [], synthesizer: [] };
    for (const role of ROLES) {
        const chain = entry.routing?.[role];
        routing[role] = Array.isArray(chain) ? chain.filter(item => typeof item === 'string').map(item => item.slice(0, 160)) : [];
    }
    const payload = {
        v: 1,
        objective: ledgerText(typeof entry.objective === 'string' ? entry.objective : '', 400),
        routing,
        synthesis: entry.synthesis === 'model' ? 'model' : 'deterministic',
        switches,
    };
    try {
        appendPluginRecord(session, ROUTING_RECORD, payload);
    }
    catch (error) {
        logger?.warn(`could not record the routing ledger: ${redactError(error)}`);
    }
}
//# sourceMappingURL=records.js.map