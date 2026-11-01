/**
 * Session-level "grok mode" on/off toggle.
 *
 * The toggle is durable plugin state: `appendPluginRecord` writes an
 * `ignorable` event that never enters the model-visible surface and survives
 * fork/resume, and readers read it back from `session.ownEvents()` (measured in
 * DSH 0.2.1-rc.2, the same seam `records.ts` uses). Whole-value-replace: each
 * write is one complete `ModeRecord`, so the LAST record in the log is the
 * current state. Every reader revalidates `data` with {@link isModeRecord},
 * because a restored record may carry whatever an earlier build wrote.
 */
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session';
/** Record type owned by this plugin: the current grok-mode toggle state. */
export const MODE_RECORD = 'plugin:grok-workflow/mode';
/** True when the payload is a mode record this build can trust. */
export function isModeRecord(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const record = value;
    return record.v === 1
        && typeof record.enabled === 'boolean'
        && typeof record.turn === 'number'
        && Number.isFinite(record.turn)
        && typeof record.setBy === 'string'
        && (record.workflowMode === undefined || record.workflowMode === 'full' || record.workflowMode === 'triage');
}
/**
 * The current mode record, or `undefined` when none was written.
 *
 * Whole-value-replace: the most recent valid record is the current state, so
 * malformed records (whatever an earlier build wrote) are skipped instead of
 * clobbering the last valid one.
 */
export function readModeRecord(session) {
    if (session === undefined || typeof session.ownEvents !== 'function')
        return undefined;
    let current;
    for (const event of session.ownEvents()) {
        const record = pluginRecordOf(event);
        if (record === undefined || record.type !== MODE_RECORD)
            continue;
        const data = record.data;
        if (isModeRecord(data))
            current = data;
    }
    return current;
}
/** Whether grok mode is on, falling back when no record was written yet. */
export function isModeEnabled(session, fallback = false) {
    return readModeRecord(session)?.enabled ?? fallback;
}
/**
 * Append one mode record.
 *
 * A record is durable plugin state, not a correctness dependency for the
 * current turn: when the session refuses the write we warn and continue, and
 * the caller never sees a throw (exactly like `recordDelivery`).
 */
export function setMode(session, record, logger) {
    if (session === undefined || typeof session.append !== 'function')
        return;
    try {
        appendPluginRecord(session, MODE_RECORD, record);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logger?.warn?.(`mode record not persisted (${record.setBy}): ${detail}`);
    }
}
//# sourceMappingURL=mode.js.map