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

import type { Session } from '@deepseek-ai/dsh-session'
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'

/** Record type owned by this plugin: the current grok-mode toggle state. */
export const MODE_RECORD = 'plugin:grok-workflow/mode'

/** Payload stored for one grok-mode toggle write. */
export interface ModeRecord {
  /** Record schema version owned by this plugin. */
  v: 1
  /** Whether grok mode is on after this write. */
  enabled: boolean
  /** Turn that owned the toggle write. */
  turn: number
  /** Short label naming who set the mode, e.g. `command:/grok` or `config:default`. */
  setBy: string
  /**
   * Workflow shape the toggle selects while enabled.
   *
   * `full` runs the whole plan -> execute -> verify pipeline for every claimed
   * message. `triage` was the old front desk's shape, which M3.3 deleted; the
   * value stays accepted so a record an earlier build wrote still validates.
   * An explicit `/grok` opts the session into `full`, because that is what the
   * command promises the user.
   */
  workflowMode?: 'full' | 'triage'
}

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    /** The session-level grok-mode toggle (whole-value-replace, last record wins). */
    'plugin:grok-workflow/mode': ModeRecord
  }
}

/** True when the payload is a mode record this build can trust. */
export function isModeRecord(value: unknown): value is ModeRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<ModeRecord>
  return record.v === 1
    && typeof record.enabled === 'boolean'
    && typeof record.turn === 'number'
    && Number.isFinite(record.turn)
    && typeof record.setBy === 'string'
    && (record.workflowMode === undefined || record.workflowMode === 'full' || record.workflowMode === 'triage')
}

/**
 * The current mode record, or `undefined` when none was written.
 *
 * Whole-value-replace: the most recent valid record is the current state, so
 * malformed records (whatever an earlier build wrote) are skipped instead of
 * clobbering the last valid one.
 */
export function readModeRecord(session: Session | undefined): ModeRecord | undefined {
  if (session === undefined || typeof session.ownEvents !== 'function') return undefined
  let current: ModeRecord | undefined
  for (const event of session.ownEvents()) {
    const record = pluginRecordOf(event)
    if (record === undefined || record.type !== MODE_RECORD) continue
    const data = (record as { data?: unknown }).data
    if (isModeRecord(data)) current = data
  }
  return current
}

/** Outcome of one toggle write; `ok` is only ever reported for a readable record. */
export interface SetModeResult {
  /** True when {@link readModeRecord} shows exactly the record that was asked for. */
  ok: boolean
  /** Why the write did not take effect; present only when `ok` is false. */
  reason?: string
}

/** Whether a stored record carries exactly the values that were written. */
function sameModeRecord(left: ModeRecord, right: ModeRecord): boolean {
  return left.v === right.v
    && left.enabled === right.enabled
    && left.turn === right.turn
    && left.setBy === right.setBy
    // Absent and `undefined` are the same state: a JSON round-trip drops the key.
    && (left.workflowMode ?? undefined) === (right.workflowMode ?? undefined)
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
export function setMode(
  session: Session | undefined,
  record: ModeRecord,
  logger?: { warn?(message: string): void },
): SetModeResult {
  if (session === undefined || typeof session.append !== 'function') {
    return { ok: false, reason: 'the session cannot persist plugin records' }
  }
  try {
    appendPluginRecord(session, MODE_RECORD, record)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger?.warn?.(`mode record not persisted (${record.setBy}): ${detail}`)
    return { ok: false, reason: detail }
  }
  const current = readModeRecord(session)
  const detail = current === undefined
    ? 'the record was not readable back'
    : sameModeRecord(current, record) ? undefined : 'the session still reads a different record'
  if (detail !== undefined) {
    logger?.warn?.(`mode record not persisted (${record.setBy}): ${detail}`)
    return { ok: false, reason: detail }
  }
  return { ok: true }
}
