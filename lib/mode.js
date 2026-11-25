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
/** Whether a stored record carries exactly the values that were written. */
function sameModeRecord(left, right) {
    return left.v === right.v
        && left.enabled === right.enabled
        && left.turn === right.turn
        && left.setBy === right.setBy
        // Absent and `undefined` are the same state: a JSON round-trip drops the key.
        && (left.workflowMode ?? undefined) === (right.workflowMode ?? undefined);
}
/**
 * Append one mode record.
 *
 * Never throws, but never claims success either: `ok` means the record was
 * committed AND read back, because "the call returned" is not the same fact as
 * "the toggle changed" (a session can accept an append without committing it).
 * A failed write is durable-state loss, so the caller must be able to say so
 * instead of answering the user with a state that was never written.
 */
export function setMode(session, record, logger) {
    if (session === undefined || typeof session.append !== 'function') {
        return { ok: false, reason: 'the session cannot persist plugin records' };
    }
    try {
        appendPluginRecord(session, MODE_RECORD, record);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logger?.warn?.(`mode record not persisted (${record.setBy}): ${detail}`);
        return { ok: false, reason: detail };
    }
    const current = readModeRecord(session);
    const detail = current === undefined
        ? 'the record was not readable back'
        : sameModeRecord(current, record) ? undefined : 'the session still reads a different record';
    if (detail !== undefined) {
        logger?.warn?.(`mode record not persisted (${record.setBy}): ${detail}`);
        return { ok: false, reason: detail };
    }
    return { ok: true };
}
//# sourceMappingURL=mode.js.map