/**
 * The stock Web GUI's fold, transcribed — the yardstick every panel assertion uses.
 *
 * This is a *test* transcription of
 * `@deepseek-ai/dsh-client-ui-workflow-run/lib/client.js` (DSH 0.2.1-rc.2): the
 * `workflow-run` conversation-node definition consumes exactly four events
 * (`tool-workflow/run-start`, `-agent-start`, `-agent-end`, `-run-end`), keys a group
 * by the **exact** `phase` string (`workflowPhaseKey`, lines 505-507), renders the raw
 * `label` (lines 541-558) and turns `run-end`'s `stopReason` into the node's status
 * (`statusFromStopReason`, lines 508-514). Keeping the transcription here — instead of
 * importing the browser bundle — is deliberate: a test must not claim to run the GUI,
 * and a DSH upgrade that changes the fold should fail these assertions loudly.
 *
 * `test/panel.spec.ts` runs our projection (`src/panel.ts`) next to this fold so the
 * two can be compared event by event.
 */
import type { PanelEvent } from '../src/panel.js'

/** One folded member row, exactly as the component models it. */
export interface FoldedMember {
  seq: number
  label: string
  /** Call status, mapped by `statusFromOutcome`. */
  status: string
}

/** One folded group: a `phase` identity and its rows. */
export interface FoldedPhase {
  /** Renderer key; `value:<length>:<phase>` or `missing` for an omitted phase. */
  key: string
  phase: string | null
  members: FoldedMember[]
}

/** One folded run node. */
export interface FoldedNode {
  name: string
  status: string
  phases: FoldedPhase[]
  /** Every row, groups flattened, in first-seen order. */
  members: FoldedMember[]
}

/** `workflowPhaseKey`, transcribed. */
function workflowPhaseKey(phase: string | null): string {
  return phase === null ? 'missing' : `value:${phase.length}:${phase}`
}

/** `statusFromStopReason`, transcribed. */
function statusFromStopReason(stopReason: string): string {
  switch (stopReason) {
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
    case 'error': return 'failed'
    default: return stopReason
  }
}

/** `statusFromOutcome`, transcribed. */
function statusFromOutcome(outcome: string): string {
  switch (outcome) {
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
    case 'failed': return 'failed'
    default: return outcome
  }
}

/**
 * Fold recorded progress events the way the stock component does.
 *
 * Faithful to the component's own limits, so a test can prove our recording path
 * never depends on behaviour it does not have: an `agent-end` whose `agent-start` has
 * not been folded yet is *dropped* (`updateAgentEnd` maps over existing members), and
 * a repeated `agent-start` *does* add a row. Our recorder avoids both, and
 * `test/panel.spec.ts` asserts the recorded stream never contains either shape.
 * @param events - recorded session events, in arrival order.
 * @returns the node, or undefined when the run was never announced.
 */
export function foldLikeTheGui(events: readonly PanelEvent[]): FoldedNode | undefined {
  let node: { name: string, members: { seq: number, label: string, phase: string | null, outcome?: string }[] } | undefined
  let stopReason: string | undefined
  for (const event of events) {
    if (event.type === 'tool-workflow/run-start') {
      node = { name: String(event.data.name ?? ''), members: [] }
      continue
    }
    if (node === undefined) continue
    if (event.type === 'tool-workflow/agent-start') {
      node.members.push({
        seq: Number(event.data.seq),
        label: String(event.data.label ?? ''),
        phase: typeof event.data.phase === 'string' ? event.data.phase : null,
      })
      continue
    }
    if (event.type === 'tool-workflow/agent-end') {
      node.members = node.members.map(member => member.seq === Number(event.data.seq)
        ? { ...member, outcome: String(event.data.outcome ?? 'failed') }
        : member)
      continue
    }
    if (event.type === 'tool-workflow/run-end') stopReason = String(event.data.stopReason ?? 'error')
  }
  if (node === undefined) return undefined
  const phases = new Map<string, FoldedPhase>()
  const members: FoldedMember[] = []
  for (const member of node.members) {
    const key = workflowPhaseKey(member.phase)
    let group = phases.get(key)
    if (group === undefined) {
      group = { key, phase: member.phase, members: [] }
      phases.set(key, group)
    }
    const row = {
      seq: member.seq,
      label: member.label,
      status: member.outcome === undefined ? 'running' : statusFromOutcome(member.outcome),
    }
    group.members.push(row)
    members.push(row)
  }
  return {
    name: node.name,
    status: stopReason === undefined ? 'running' : statusFromStopReason(stopReason),
    phases: [...phases.values()],
    members,
  }
}

/** Whether the stock fold shows the run as finished-and-passed. */
export function foldVerified(node: FoldedNode | undefined): boolean {
  return node !== undefined && node.status === 'completed'
}
