/**
 * Durable delivery records for the mandatory-entry gate.
 *
 * `appendPluginRecord` writes an `ignorable` event that never enters the
 * model-visible surface, survives fork/resume, and can be read back with
 * `pluginRecordOf` (measured in DSH 0.2.1-rc.2). Records are plugin-owned
 * state: every reader revalidates `data`, because a restored record may carry
 * whatever an earlier build wrote.
 */

import type { Session } from '@deepseek-ai/dsh-session'
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { WorkflowLogger } from './run.js'

/** Record type owned by this plugin. */
export const DELIVERY_RECORD = 'plugin:grok-workflow/delivery'

/** Phases a delivery passes through. */
export type DeliveryPhase = 'started' | 'delivered' | 'failed'

/** Payload stored for one gate delivery. */
export interface DeliveryRecord {
  /** Record schema version owned by this plugin. */
  v: 1
  /** Deterministic delivery key; also the de-duplication identity. */
  key: string
  /** Agent whose message batch was routed. */
  agentId: string
  /** Clamped message ids of the claimed batch, in claim order. */
  messageIds: string[]
  phase: DeliveryPhase
  /** Turn that owned the claimed batch. */
  turn: number
  /** Explicit outcome label for diagnostics (status or failure cause). */
  outcome: string
}

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:grok-workflow/delivery': DeliveryRecord
  }
}

/**
 * Deterministic identity for one claimed batch.
 *
 * The key is derived from the agent and the exact claimed message ids, so a
 * replay of the same delivery (resume, fork, duplicate followup) recomputes the
 * same key without keeping any process-local state.
 */
export function deliveryKey(agentId: string, messages: readonly Pick<UserMessage, 'id'>[]): string {
  const ids = messages.map(message => String(message.id)).sort()
  return `grok-workflow:${agentId}:${ids.join(',')}`
}

/** True when the payload is a record this build can trust. */
function isDeliveryRecord(value: unknown): value is DeliveryRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<DeliveryRecord>
  return record.v === 1
    && typeof record.key === 'string'
    && typeof record.agentId === 'string'
    && Array.isArray(record.messageIds)
    && record.messageIds.every(id => typeof id === 'string')
    && (record.phase === 'started' || record.phase === 'delivered' || record.phase === 'failed')
    && typeof record.turn === 'number'
    && typeof record.outcome === 'string'
}

/** Every delivery record this plugin committed to the session, oldest first. */
export function readDeliveries(session: Session | undefined): DeliveryRecord[] {
  if (session === undefined || typeof session.ownEvents !== 'function') return []
  const records: DeliveryRecord[] = []
  for (const event of session.ownEvents()) {
    const record = pluginRecordOf(event)
    if (record === undefined || record.type !== DELIVERY_RECORD) continue
    const data = (record as { data?: unknown }).data
    if (isDeliveryRecord(data)) records.push(data)
  }
  return records
}

/**
 * True when the batch was already routed by this plugin.
 *
 * `started` and `delivered` count: a run was launched for these exact messages,
 * so routing them again would start a second workflow for one user message.
 * `failed` does not count — a refusal that never launched a run (busy queue,
 * oversized message) must not become a permanent block on that message.
 */
export function alreadyRouted(session: Session | undefined, key: string): boolean {
  return readDeliveries(session).some(record => record.key === key && (record.phase === 'started' || record.phase === 'delivered'))
}

/**
 * Append one delivery record.
 *
 * A record is durable plugin state, not a correctness dependency for the current
 * turn: when the session refuses the write we warn and continue, and the run
 * still happens (the gate never answers by itself).
 */
export function recordDelivery(
  session: Session | undefined,
  record: DeliveryRecord,
  logger: WorkflowLogger,
): void {
  if (session === undefined || typeof session.append !== 'function') return
  try {
    appendPluginRecord(session, DELIVERY_RECORD, record)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger.warn(`delivery record not persisted (${record.key}): ${detail}`)
  }
}
