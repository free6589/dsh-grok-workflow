/**
 * The task-grouped progress panel, projected from the events the GUI folds.
 *
 * Why a projection exists at all: `@deepseek-ai/dsh-client-ui-workflow-run` owns the
 * only renderer for a workflow run. It folds exactly four events
 * (`tool-workflow/run-start|agent-start|agent-end|run-end`), groups them by the
 * **exact** `phase` string, renders each row's `label` verbatim and words the node's
 * status from `run-end`'s `stopReason` (measured in DSH 0.2.1-rc.2, see
 * `docs/task-progress-panel.md`). The plugin cannot change that renderer — a custom
 * conversation node for task-level states is exactly the P1-2 request that is
 * BLOCKED against this DSH version.
 *
 * So the plugin's guarantee has to be a guarantee about *what it records*, and this
 * module is that guarantee made executable: it folds the same four events with the
 * same grouping rule and produces the panel a reader sees, including the wording of
 * every row. Two properties are the point of it:
 *
 * 1. **A row words a call, never a task.** `agent-end: completed` becomes
 *    `执行代理已结束` / `检查调用已结束`; the only pass wording
 *    ({@link taskVerdictText}) can be produced from a task-level result, which only a
 *    report carries. There is no code path where a finished call yields `任务通过`.
 * 2. **The run node agrees with the report.** {@link panelMatchesReport} compares the
 *    projected run status with the final report; `src/run.ts` closes `run-end` with
 *    {@link progressStopReason} so the two cannot drift, and a test fails if they do.
 *
 * Differences from the stock fold, both deliberate and tested:
 *
 * - an `agent-end` that arrives before its `agent-start` still settles its row (the
 *   stock `updateAgentEnd` maps over members that already exist, so it would drop it),
 *   because a replayed session may hand events to a reader in an order the live stream
 *   never had;
 * - a repeated `agent-start` for the same `seq` does not add a second row and a
 *   repeated `agent-end` does not change the outcome twice, so a duplicated event is
 *   idempotent. Our recorder emits neither, and this is the belt to that braces.
 *
 * Everything here is pure: no clock, no counter, no estimate (Issue #22, P1-4).
 */

import {
  NAMING_COPY,
  callStateText,
  parseMemberLabel,
  runStateText,
  taskVerdictText,
  unphasedLabel,
} from './naming.js'
import type { CallState, NamingLanguage, RunState } from './naming.js'

/** Names of the four events this fold consumes (owned by `@deepseek-ai/dsh-tool-workflow`). */
export const PANEL_RUN_START = 'tool-workflow/run-start'
export const PANEL_AGENT_START = 'tool-workflow/agent-start'
export const PANEL_AGENT_END = 'tool-workflow/agent-end'
export const PANEL_RUN_END = 'tool-workflow/run-end'

/** One recorded session event, in the shape a reader gets it back. */
export interface PanelEvent {
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}

/** One member row of the panel. */
export interface PanelRow {
  /** Engine sequence number; internal, used to correlate start and settlement. */
  seq: number
  /** User-visible label (`执行`, `检查（尝试 2）`): a role, never an identifier. */
  label: string
  /** Lifecycle of the *call*, not of the task. */
  call: CallState
  /** The exact wording the panel shows for the row. */
  text: string
}

/** One task group (`任务 1 · <标题>`). */
export interface PanelGroup {
  /** Exact `phase` string; also the stock renderer's group key. */
  header: string
  rows: PanelRow[]
  /** Task-level verdict, present only when the report supplied one. */
  verdict?: { status: 'verified' | 'failed', text: string }
}

/** The whole node. */
export interface Panel {
  /** Run title (`任务团队 · 3 个任务`). */
  name: string
  run: RunState
  /** The wording the panel shows for the run status. */
  statusText: string
  groups: PanelGroup[]
  /** Task total, only when the Host actually knew it. */
  totalTasks?: number
}

/** Options for {@link projectPanel}. */
export interface PanelOptions {
  /** Copy language; defaults to Chinese, the shipped default. */
  language?: NamingLanguage
  /**
   * Task-level verdicts keyed by the exact group header. Coming from
   * `report.tasks[]`, this is the only input that can produce a pass word.
   */
  verdicts?: ReadonlyMap<string, 'verified' | 'failed'> | Readonly<Record<string, 'verified' | 'failed'>>
  /** Known task total (rendered only when present). */
  totalTasks?: number
}

/** Map one `agent-end` outcome onto a call lifecycle state. */
function callState(outcome: unknown): CallState {
  switch (outcome) {
    case undefined: return 'running'
    case 'completed': return 'ended'
    case 'failed': return 'failed'
    case 'cancelled': return 'cancelled'
    default: return 'interrupted'
  }
}

/** Map one `run-end` stop reason onto the run status the stock dictionary knows. */
function runState(stopReason: unknown): RunState {
  switch (stopReason) {
    case undefined: return 'running'
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
    case 'error': return 'failed'
    default: return 'interrupted'
  }
}

/** The state word for a label the plugin did not produce (defensive, never guessed). */
function fallbackRowText(label: string, state: CallState, language: NamingLanguage): string {
  const word = NAMING_COPY[language].callStates[state]
  return language === 'en' ? `${label} ${word}` : `${label}${word}`
}

/**
 * Fold recorded progress events into the panel a reader sees.
 *
 * Order-insensitive by `seq` and idempotent per event, documented above.
 * @param events - recorded `tool-workflow/*` events, in any order.
 * @param options - copy language, task verdicts, known task total.
 * @returns the panel, or undefined when the run was never announced.
 */
export function projectPanel(events: readonly PanelEvent[], options: PanelOptions = {}): Panel | undefined {
  const language = options.language ?? 'zh'
  let name: string | undefined
  let stopReason: unknown
  const members = new Map<number, { label: string, phase?: string }>()
  const order: number[] = []
  const settlements = new Map<number, string>()
  for (const event of events) {
    if (event.type === PANEL_RUN_START) {
      // The first announcement names the node; a later one is a duplicate, not a rename.
      if (name === undefined) name = String(event.data.name ?? '')
      continue
    }
    if (event.type === PANEL_AGENT_START) {
      const seq = Number(event.data.seq)
      if (!Number.isFinite(seq)) continue
      if (members.has(seq)) continue
      const phase = event.data.phase
      members.set(seq, {
        label: String(event.data.label ?? ''),
        ...typeof phase === 'string' ? { phase } : {},
      })
      order.push(seq)
      continue
    }
    if (event.type === PANEL_AGENT_END) {
      const seq = Number(event.data.seq)
      if (!Number.isFinite(seq)) continue
      // Last settlement wins; repeating one is idempotent.
      settlements.set(seq, String(event.data.outcome ?? 'failed'))
      continue
    }
    if (event.type === PANEL_RUN_END) stopReason = event.data.stopReason
  }
  if (name === undefined) return undefined
  const verdictInput = options.verdicts
  const verdictOf = (header: string): 'verified' | 'failed' | undefined => {
    if (verdictInput === undefined) return undefined
    if (verdictInput instanceof Map) return verdictInput.get(header)
    return (verdictInput as Readonly<Record<string, 'verified' | 'failed'>>)[header]
  }
  const groups = new Map<string, PanelGroup>()
  for (const seq of order) {
    const member = members.get(seq) ?? { label: '' }
    const label = member.label
    const header = member.phase ?? unphasedLabel(language)
    let group = groups.get(header)
    if (group === undefined) {
      group = { header, rows: [] }
      groups.set(header, group)
    }
    const state = callState(settlements.get(seq))
    const role = parseMemberLabel(label, language)?.role
    group.rows.push({
      seq,
      label,
      call: state,
      text: role === undefined ? fallbackRowText(label, state, language) : callStateText(role, state, language),
    })
  }
  const projected = [...groups.values()]
  for (const group of projected) {
    const verdict = verdictOf(group.header)
    if (verdict !== undefined) group.verdict = { status: verdict, text: taskVerdictText(verdict, language) }
  }
  const state = runState(stopReason)
  return {
    name,
    run: state,
    statusText: runStateText(state, language),
    groups: projected,
    ...options.totalTasks === undefined ? {} : { totalTasks: options.totalTasks },
  }
}

/** Whether the panel shows the run as fully verified. */
export function panelVerified(panel: Panel | undefined): boolean {
  return panel !== undefined && panel.run === 'completed'
}

/**
 * Whether the panel's pass state agrees with the final report.
 *
 * `report.status === 'completed'` is the only state where every task verified, so it
 * is the only state allowed to read as a passed run. A mismatch is a bug in the
 * recording path (or in this fold), and the tests fail on it rather than describing it.
 * @param panel - projected panel.
 * @param report - final report, or any object carrying its `status`.
 * @returns true when the two agree.
 */
export function panelMatchesReport(panel: Panel | undefined, report: { status: string }): boolean {
  if (panel === undefined) return false
  return panelVerified(panel) === (report.status === 'completed')
}
