/**
 * The "进度" conversation tab: the pure half.
 *
 * The tab renders the four `tool-workflow/*` session events this plugin's own recorder
 * writes (`src/records.ts`, `createWorkflowProgressRecorder`) as one horizontal track of
 * stage nodes, plus the two optional payloads a stream may carry:
 * `tool-workflow/stage-detail` (field values) and `tool-workflow/summary-final` (which
 * summary draft the run actually shipped). Both only ever *add* to what a stream
 * without them renders. This module is the fold, the state precedence, the percentage and the detail
 * provenance, with no React, no DOM, no clock and no estimate, so every rule the browser
 * half applies can be tested here; `src/client/index.js` carries the same rules as
 * hand-written JavaScript (the host serves that bundle verbatim, so it cannot import this
 * file) and `test/client.spec.ts` pins the two apart from drifting.
 *
 * What the data can and cannot say (measured against DSH 0.2.1-rc.2, see
 * `docs/knowledge/DESIGN-progress-tab.md`):
 *
 * - `run-start` names the run; `agent-start` declares one child call (seq, label, phase,
 *   childId); `agent-end` settles one call by seq; `run-end` closes the run.
 * - Nothing in the stream declares a *plan*: there is no task total, no ETA, no verdict.
 *   The percentage is therefore settled rows over **declared rows** — the members the
 *   engine actually announced — and the copy says so. When no row was declared it is
 *   absent, never 0 %.
 * - A run that ended with a row it never settled is `blocked` and says so in its tooltip:
 *   the stream cannot tell a cancellation from a crash, so the tab does not guess one.
 * - `cancelled` is the engine's own outcome word, kept verbatim rather than re-derived.
 * - `failed` is a *current* failure. Attempts are rows, so a task that failed attempt 1 and
 *   verified on attempt 2 carries both rows; the later completion replaces the earlier
 *   failure for the aggregate (card, segment, bar) while the failed row keeps its own mark
 *   (`recoveredFailureSeqs`). Red therefore means "still broken now", never "was broken".
 */

import { NAMING_LANGUAGES, SYNTHESIS_FINAL_MARK, synthesisDraftLabel } from './naming.js'

/**
 * The eight progress and Guardian lifecycle events the tab folds — and, in the bundle, the
 * whitelist the host routes the tab by.
 *
 * One name, two homes, one list: this copy is what {@link foldProgressRuns} reads, and
 * `src/client/index.js` carries the same constant (served verbatim, so it cannot import this
 * table) where it serves both its mirror of the fold and the tab's event routing, which
 * drops any event this list does not name. The two must agree entry for entry, and neither
 * half can see the other: an event named only here is routed away before the fold ever sees
 * it, an event named only there is handed over and silently ignored. Both failures are
 * invisible on screen, so `test/progress-tab.spec.ts` compares the shipped list with this
 * one and fails on a single missing or extra entry.
 *
 * `tool-workflow/stage-detail` is deliberately **not** here: it only ever *adds* field
 * values to a node and never decides a state, so it is not a lifecycle event and does not
 * belong in the routing list ({@link PROGRESS_DETAIL_EVENT_TYPE}).
 */
export const PROGRESS_EVENT_TYPES = [
  'tool-workflow/run-start',
  'tool-workflow/agent-start',
  'tool-workflow/agent-end',
  'tool-workflow/summary-final',
  'tool-workflow/summary-rejected',
  'tool-workflow/guardian-start',
  'tool-workflow/guardian-finding',
  'tool-workflow/guardian-end',
  'tool-workflow/run-end',
] as const

/**
 * The optional detail payload, kept apart from {@link PROGRESS_EVENT_TYPES} on purpose.
 *
 * Track state comes from progress lifecycle events; Guardian findings only populate its side lane. This
 * one only ever *adds* field values to a node, so a stream without it renders exactly
 * what it rendered before. `createWorkflowProgressRecorder` does not write it today; the
 * tab reads it so that a recorder (or another bundle) that does write it is used instead
 * of being ignored — the detail ladder's level 1 is a real read path, not a placeholder.
 */
export const PROGRESS_DETAIL_EVENT_TYPE = 'tool-workflow/stage-detail'

/**
 * The event that names the summary draft the run shipped.
 *
 * It is a member of {@link PROGRESS_EVENT_TYPES} — a tab the host never hands the event to
 * cannot mark the draft — but it is not a lifecycle step like the others: a chat row's label
 * is fixed at `agent-start` (the panel only ever matches an `agent-end` to it by `seq`), so
 * "this draft is the final one" cannot be said by renaming a row after the fact. It arrives
 * as its own fact once the gate has passed a draft, and the fold settles it onto the row
 * that landed. A stream without it renders exactly what it rendered before.
 */
export const PROGRESS_SUMMARY_FINAL_EVENT_TYPE = 'tool-workflow/summary-final'

/**
 * The event that says the gate rejected every draft, with the last stage that failed.
 *
 * The sibling of {@link PROGRESS_SUMMARY_FINAL_EVENT_TYPE} and never its alternative: a
 * run either handed one draft in or handed none, so a stream carrying both is not ours
 * (the fold still has to read one, see {@link deriveProgressFlow}). A tab that has never
 * heard of this event renders a rejected run exactly as it did before — as a run with no
 * final draft — because the event only ever adds a reading of a gap it already saw.
 */
export const PROGRESS_SUMMARY_REJECTED_EVENT_TYPE = 'tool-workflow/summary-rejected'

/** Registered conversation target of the progress view (namespaced so a collision throws). */
export const PROGRESS_VIEW_TARGET = 'grok-progress'

/** Conversation node kind owned by the tab (namespaced for the same reason). */
export const PROGRESS_NODE_KIND = 'grok-progress-run'

/** The five states the track colours; `cancelled` reuses the blocked colour. */
export type ProgressState = 'pending' | 'doing' | 'done' | 'blocked' | 'cancelled' | 'failed'

/** Where one detail field's value came from. */
export type DetailSource = 'stage-detail' | 'coordination' | 'not-reported'

/** The seven fields an AGENTS.md coordination block reports, in render order. */
export const DETAIL_FIELDS = [
  'workCommit',
  'changes',
  'testsRun',
  'results',
  'localRuntimeVerified',
  'blockers',
  'nextAction',
] as const

/** One of {@link DETAIL_FIELDS}. */
export type DetailFieldKey = (typeof DETAIL_FIELDS)[number]

/**
 * The spellings one field is written as, folded to its canonical key.
 *
 * A coordination block is a shared format, not this tab's private schema: the labels
 * `AGENTS.md` prescribes are `WORK_COMMIT` / `CHANGES` / `TESTS_RUN` / `TEST_RESULTS` /
 * `LOCAL_RUNTIME_VERIFIED` / `BLOCKERS` / `NEXT_ACTION`, while a JSON block writes them
 * in camelCase. Both spell the same seven facts, so both resolve to one key and a reader
 * sees one row per fact.
 */
const DETAIL_FIELD_BY_TOKEN: Readonly<Record<string, DetailFieldKey>> = {
  workcommit: 'workCommit',
  changes: 'changes',
  change: 'changes',
  testsrun: 'testsRun',
  tests: 'testsRun',
  results: 'results',
  result: 'results',
  testresults: 'results',
  localruntimeverified: 'localRuntimeVerified',
  blockers: 'blockers',
  blocker: 'blockers',
  nextaction: 'nextAction',
  next: 'nextAction',
}

/** Fold one written field name (`WORK_COMMIT`, `workCommit`, `next_action`) to its key. */
function canonicalDetailField(name: string): DetailFieldKey | undefined {
  return DETAIL_FIELD_BY_TOKEN[name.toLowerCase().replace(/[^a-z0-9]/g, '')]
}

/** One recorded `tool-workflow/*` event, in the shape a session reader gets it back. */
export interface ProgressEventRecord {
  readonly type: string
  /** Session sequence number of the enclosing event, when known. */
  readonly seq?: number
  /** Session time (epoch ms) of the enclosing event, when known. */
  readonly time?: number
  readonly data: Readonly<Record<string, unknown>>
}

/** One declared child call, with whatever settlement the stream carried. */
export interface ProgressMemberFact {
  /** Engine sequence number inside the run; the settlement key. */
  seq: number
  /** Label recorded on `agent-start` (`执行`, `检查`, `任务 1 · …`). */
  label: string
  /** Exact phase header recorded on `agent-start`, when the call declared one. */
  phase?: string
  /** Child session the call opened. */
  childId: string
  /** Arrival order of the `agent-start`, used to keep plan order stable. */
  order: number
  /** Session time of the start event, when known. */
  startedAt?: number
  /** Session time of the settlement, when known. */
  endedAt?: number
  /** Engine outcome (`completed` / `failed` / `cancelled` / …); absent while running. */
  outcome?: string
}

/** A liveness intervention recorded by the Guardian (not a task-quality verdict). */
export interface ProgressGuardianFindingFact {
  seq: number
  label: string
  signal: 'timeout' | 'heartbeat-loss'
  action: 'cancel-run' | 'rescue' | 'observe'
  reason: string
  atMs?: number
}

/** The monitor's recorded lifecycle for one workflow run. */
export interface ProgressGuardianFacts {
  started: boolean
  armed: boolean
  budgetMs: number
  ended: boolean
  cancelled: boolean
  findings: ProgressGuardianFindingFact[]
}

/** One run as the stream describes it. */
export interface ProgressRunFacts {
  runId: string
  /** Run title from `run-start` (`任务团队`, `任务团队 · 3 个任务`). */
  name: string
  /** Lowest session seq this run touched; the multi-run ordering key. */
  anchorSeq: number
  /** Session time of `run-start`, when known. */
  startedAt?: number
  /** Session time of `run-end`, when known. */
  endedAt?: number
  /** Engine stop reason from `run-end`; absent while the run is open. */
  stopReason?: string
  members: ProgressMemberFact[]
  /** Guardian liveness state, present only when this build recorded it. */
  guardian?: ProgressGuardianFacts
  /** Level-1 detail payloads the stream carried for this run, in arrival order. */
  details: ProgressStageDetailFact[]
  /**
   * Draft number that passed the summary gate, when the stream said so.
   *
   * The row it names already carries the mark in its label (see
   * {@link PROGRESS_SUMMARY_FINAL_EVENT_TYPE}); the number stays here so a caller can
   * tell "no final draft was recorded" from "draft 1 was final".
   */
  summaryFinalDraft?: number
  /**
   * The gate's all-rejected verdict, when the stream said so.
   *
   * The other half of the same story slot: "no final draft" and "every draft was
   * rejected, at this stage, for this reason" are different readings of a run that
   * handed in nothing, and only the second one lets the page say why.
   */
  summaryRejected?: { drafts: number, stage: 'check' | 'verify', reason: string }
}

/** One spine stage of the track, in render order. */
export interface ProgressStageDefinition {
  /** Copy key suffix; also the stage identity in the model. */
  key: string
  /**
   * Words that bind a recorded phase to this stage.
   *
   * A CJK token matches anywhere (`规划` is a word on its own). A token with Latin
   * letters matches **whole words only**, because a substring test reads `ui` inside
   * `build`, `tag` inside `stage`/`target` and `sync` inside `async` — the three false
   * hits measured on real phase headers.
   */
  tokens: readonly string[]
  /** The two ends of the track: process marks, never work. */
  edge: boolean
}

/**
 * The track's fixed spine: this engine's own phases, in the order it runs them.
 *
 * The four work stages are the phase headers `src/naming.ts` actually emits for a staged
 * delivery job — `规划` / `执行` / `检查` / `汇总` (`phaseLabel`: plan, execute,
 * verify, synthesize) — plus one slot for the plan tasks themselves, which the
 * engine announces as `任务 n · 标题` (`taskGroupTitle`) and which land between `执行`
 * and `检查` because that is where the workers run. The final answer is relayed in the
 * turn's own message, never as a workflow child call,
 * so no `回答` event can ever reach this track — the spine does not list a stage no
 * event can fill. A stage whose token no recorded phase carries stays `pending` and
 * says it was not reported; a phase that names no stage becomes a node of its own, so
 * the spine never hides a declared phase.
 */
export const PROGRESS_STAGES: readonly ProgressStageDefinition[] = [
  { key: 'start', tokens: [], edge: true },
  { key: 'plan', tokens: ['规划', 'plan'], edge: false },
  { key: 'execute', tokens: ['执行', 'execute'], edge: false },
  { key: 'verify', tokens: ['检查', '核验', 'verify'], edge: false },
  { key: 'synthesize', tokens: ['汇总', 'synthesize'], edge: false },
  { key: 'end', tokens: [], edge: true },
]

/** One capsule of the fixed chain a plan-task card shows. */
export interface ProgressChainStageDefinition {
  key: 'execute' | 'check' | 'review'
  /** Role labels (`naming.ts` `memberLabel`) that fill this capsule. */
  tokens: readonly string[]
}

/**
 * The fixed per-task chain, in render order: `执行` → `检查` → `复核`
 * (`worker` → `verifier` → `supervisor`).
 *
 * A task's rows arrive as role calls, so a card can say which gates a task actually
 * reached. The chain is fixed rather than derived from what arrived: a capsule no row
 * reached renders `pending` with a dashed border, because "the verify call never ran" is
 * a fact a reader needs, and a missing capsule would hide it.
 */
export const PROGRESS_CHAIN: readonly ProgressChainStageDefinition[] = [
  { key: 'execute', tokens: ['执行', 'execute', 'worker'] },
  { key: 'check', tokens: ['检查', '核验', 'verify', 'check', 'verifier'] },
  { key: 'review', tokens: ['复核', 'review', 'supervisor', 'reviewer'] },
]

/** One rendered capsule of a plan-task card's fixed chain. */
export interface ProgressChainSlot {
  key: ProgressChainStageDefinition['key']
  /** Rows of the card that fill this capsule, in plan order (more than one on a retry). */
  members: ProgressMemberFact[]
  /** The capsule's aggregate state; `pending` when no row reached it. */
  state: ProgressState
  /** Whether at least one row reached the capsule (false is the dashed pending look). */
  reached: boolean
}

/** One `tool-workflow/stage-detail` payload, as the stream carried it. */
export interface ProgressStageDetailFact {
  /** Phase header the payload names, when it names one. */
  phase?: string
  /** The fields it carries, already folded to canonical keys. */
  fields: Partial<Record<DetailFieldKey, string>>
  /** Exact coordination text it carried (a fenced or labelled block), when it carried one. */
  coordinationText?: string
}

/** One rendered node of the track. */
export interface ProgressNodeModel {
  /** Stable render key (`stage:plan`, `phase:任务 2 · …`). */
  key: string
  kind: 'edge' | 'stage' | 'extra'
  /** Copy key suffix for spine nodes; the recorded phase header for extra nodes. */
  label: string
  state: ProgressState
  /** Rows behind this node, in plan order. */
  members: ProgressMemberFact[]
  /**
   * Rows that ran under this stage and are rendered as their own plan-task nodes.
   *
   * A cross-reference, never a second home: `members` stays the one place a row is
   * counted, so the track and the percentage cannot disagree. It exists because the
   * engine records the plan-task group title (`任务 1 · 标题`) as a worker's `phase`, so
   * matching rows by phase alone left `执行` and `检查` — the two stages every run
   * performs — empty and "not reported".
   */
  evidence: ProgressMemberFact[]
  /** Exact phase headers aggregated here (empty for an unmatched spine stage). */
  phases: string[]
  /** Whether the state was derived from the run's end rather than from a settlement. */
  derived: boolean
  /** Tooltip copy key suffix explaining a derived state (only for `blocked`). */
  reason?: 'runEndedUnsettled' | 'outcomeUnsettled'
  /** Level-1 detail payload for this node, when the stream carried one for its phase. */
  stageDetail?: ProgressStageDetailFact
  /** Plan-task position the phase header names (`任务 3 · 标题` → 3); absent when it names none. */
  taskNumber?: number
  /** Set for the guardian adjudication card, which is a call of its own, not a plan task. */
  guardian?: true
  /**
   * The fixed Execute-Check-Review chain of a plan-task card, in render order.
   *
   * Absent on a stage segment and on the guardian card: neither is a plan task, so neither
   * has a worker → verifier → supervisor chain to show.
   */
  chain?: ProgressChainSlot[]
}

/** Rows settled over rows declared; the tab's only percentage. */
export interface ProgressPercent {
  settled: number
  declared: number
  /** `settled / declared * 100`, rounded to an integer; absent when `declared` is 0. */
  value?: number
}

/** The whole track for one run. */
export interface ProgressTrackModel {
  runId: string
  name: string
  /** Whether `run-end` was seen. */
  ended: boolean
  stopReason?: string
  nodes: ProgressNodeModel[]
  percent?: ProgressPercent
  /** Level-1 payload that named no phase: the run-level fallback for any node. */
  stageDetail?: ProgressStageDetailFact
}

/** Options for {@link deriveTrack}. */
export interface DeriveOptions {
  /**
   * Copy resolver for spine nodes. The default keeps the key itself, so a caller that
   * forgets it renders an identifier rather than inventing a language.
   */
  labelFor?: (stageKey: string) => string
}

/** One resolved detail field. */
export interface DetailField {
  key: DetailFieldKey
  /** Normalized text, absent when not reported at any level. */
  value?: string
  source: DetailSource
}

/** The detail popover's stage section. */
export interface DetailReport {
  fields: DetailField[]
  /** Exact coordination-block body, when one was parsed (the copy button's payload). */
  coordinationRaw?: string
}

/** A parsed coordination block: whichever of the seven fields it carried. */
export interface CoordinationBlock {
  fields: Partial<Record<DetailFieldKey, string>>
  /** Exact block body, preserved for the copy action. */
  raw: string
}

/** Inputs the detail resolver may draw on, weakest last. */
export interface DetailSources {
  /** A `tool-workflow/stage-detail` payload, when such an event exists in the session. */
  readonly stageDetail?: Readonly<Record<string, unknown>>
  /** Child-session text that may contain a fenced coordination block. */
  readonly coordinationText?: string
}

/** Narrow an unknown value to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** Normalize one field value to display text; empty values are "not reported". */
function fieldText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    const parts = value.map(fieldText).filter((part): part is string => part !== undefined)
    return parts.length === 0 ? undefined : parts.join(' · ')
  }
  return undefined
}

/**
 * Read the known detail fields out of one record.
 *
 * Names are canonicalized first, so `WORK_COMMIT`, `workCommit` and `next_action` all
 * land on the field that owns them, and the first written spelling of a fact wins over a
 * later alias.
 * @param source - a `stage-detail` payload or a parsed coordination object.
 * @returns the fields it carried, keyed canonically.
 */
function pickDetailFields(source: Readonly<Record<string, unknown>>): Partial<Record<DetailFieldKey, string>> {
  const fields: Partial<Record<DetailFieldKey, string>> = {}
  for (const [name, raw] of Object.entries(source)) {
    const key = canonicalDetailField(name)
    if (key === undefined || fields[key] !== undefined) continue
    const text = fieldText(raw)
    if (text !== undefined) fields[key] = text
  }
  return fields
}

/**
 * Fold recorded events into runs.
 *
 * Order-insensitive and idempotent: a repeated `agent-start` does not add a second row, a
 * repeated `agent-end` cannot change an outcome twice (last settlement wins, as a replay
 * of the same event carries the same value), and an `agent-end` that arrives before its
 * own `agent-start` still settles the row once the start appears. A run with no
 * `run-start` is dropped: the node that opens the run is what the recorder writes first,
 * and inventing a run from a settlement would be a claim about work nobody announced.
 * @param records - recorded events, in any order.
 * @returns runs in ascending `anchorSeq` order.
 */
export function foldProgressRuns(records: readonly ProgressEventRecord[]): ProgressRunFacts[] {
  interface Draft {
    runId: string
    name: string
    anchorSeq: number
    startedAt?: number
    endedAt?: number
    stopReason?: string
    members: Map<number, ProgressMemberFact>
    order: number[]
    settlements: Map<number, string>
    details: ProgressStageDetailFact[]
    guardian?: ProgressGuardianFacts
    summaryFinalDraft?: number
    summaryRejected?: { drafts: number, stage: 'check' | 'verify', reason: string }
  }
  const drafts = new Map<string, Draft>()
  let index = 0
  /** Announce every run first: the fold is order-insensitive, so an `agent-start` that
   * arrives before its `run-start` still belongs to that run. */
  for (const record of records) {
    const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index
    index += 1
    if (record.type !== 'tool-workflow/run-start') continue
    const data = asRecord(record.data) ?? {}
    const runId = typeof data['runId'] === 'string' ? data['runId'] : undefined
    if (runId === undefined || drafts.has(runId)) continue
    drafts.set(runId, {
      runId,
      name: typeof data['name'] === 'string' ? data['name'] : '',
      anchorSeq: seq,
      members: new Map(),
      order: [],
      settlements: new Map(),
      details: [],
      ...record.time === undefined ? {} : { startedAt: record.time },
    })
  }
  index = 0
  for (const record of records) {
    const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index
    index += 1
    const data = asRecord(record.data) ?? {}
    const runId = typeof data['runId'] === 'string' ? data['runId'] : undefined
    const isDetail = record.type === PROGRESS_DETAIL_EVENT_TYPE
    const isSummaryFinal = record.type === PROGRESS_SUMMARY_FINAL_EVENT_TYPE
    const isSummaryRejected = record.type === PROGRESS_SUMMARY_REJECTED_EVENT_TYPE
    if (!isDetail && !isSummaryFinal && !isSummaryRejected && !(PROGRESS_EVENT_TYPES as readonly string[]).includes(record.type)) continue
    if (runId === undefined) continue
    if (record.type === 'tool-workflow/run-start') continue
    const draft = drafts.get(runId)
    if (draft === undefined) continue
    if (seq < draft.anchorSeq) draft.anchorSeq = seq
    if (isDetail) {
      const fields = pickDetailFields(data)
      const coordinationText = typeof data['coordination'] === 'string' ? data['coordination'] : undefined
      // An empty payload is not a report: it would add a row of dashes that claims the
      // stage was measured and found blank.
      if (Object.keys(fields).length === 0 && coordinationText === undefined) continue
      const phase = typeof data['phase'] === 'string' ? data['phase'] : undefined
      draft.details.push({
        fields,
        ...phase === undefined ? {} : { phase },
        ...coordinationText === undefined ? {} : { coordinationText },
      })
      continue
    }
    if (isSummaryFinal) {
      // First valid claim wins: a duplicate is a no-op, and a later (different)
      // claim cannot move the mark off the draft that actually shipped.
      const draftNumber = Number(data['draft'])
      if (!Number.isFinite(draftNumber) || Math.trunc(draftNumber) < 1) continue
      if (draft.summaryFinalDraft === undefined) draft.summaryFinalDraft = Math.trunc(draftNumber)
      continue
    }
    if (isSummaryRejected) {
      // The same duplicate rule as `summary-final`, and the same refusal to read a
      // half-fact: a count below one, a stage that is neither word, or no reason at all
      // is dropped rather than rendered as "rejected, for some reason".
      const drafts = Number(data['drafts'])
      if (!Number.isFinite(drafts) || Math.trunc(drafts) < 1) continue
      const stage = data['stage']
      if (stage !== 'check' && stage !== 'verify') continue
      const reason = typeof data['reason'] === 'string' ? data['reason'].trim() : ''
      if (reason === '') continue
      if (draft.summaryRejected === undefined) draft.summaryRejected = { drafts: Math.trunc(drafts), stage, reason }
      continue
    }
    if (record.type === 'tool-workflow/guardian-start') {
      const previous = draft.guardian
      const budget = Number(data['budgetMs'])
      draft.guardian = {
        started: true,
        armed: data['armed'] === true,
        budgetMs: Number.isFinite(budget) && budget > 0 ? Math.trunc(budget) : 0,
        ended: previous?.ended ?? false,
        cancelled: previous?.cancelled ?? false,
        findings: previous?.findings ?? [],
      }
      continue
    }
    if (record.type === 'tool-workflow/guardian-finding') {
      const memberSeq = Number(data['seq'])
      if (!Number.isFinite(memberSeq)) continue
      const guardian: ProgressGuardianFacts = draft.guardian ?? {
        started: false, armed: false, budgetMs: 0, ended: false, cancelled: false, findings: [],
      }
      guardian.findings.push({
        seq: memberSeq,
        label: typeof data['label'] === 'string' ? data['label'] : '',
        signal: data['signal'] === 'heartbeat-loss' ? 'heartbeat-loss' : 'timeout',
        action: data['action'] === 'rescue' ? 'rescue' : data['action'] === 'cancel-run' ? 'cancel-run' : 'observe',
        reason: typeof data['reason'] === 'string' ? data['reason'] : '',
        ...typeof data['atMs'] === 'number' && Number.isFinite(data['atMs']) ? { atMs: data['atMs'] } : {},
      })
      draft.guardian = guardian
      continue
    }
    if (record.type === 'tool-workflow/guardian-end') {
      const previous: ProgressGuardianFacts = draft.guardian ?? {
        started: false, armed: false, budgetMs: 0, ended: false, cancelled: false, findings: [],
      }
      draft.guardian = { ...previous, ended: true, cancelled: data['cancelled'] === true }
      continue
    }
    if (record.type === 'tool-workflow/agent-start') {
      const memberSeq = Number(data['seq'])
      if (!Number.isFinite(memberSeq)) continue
      if (draft.members.has(memberSeq)) continue
      const phase = typeof data['phase'] === 'string' ? data['phase'] : undefined
      draft.members.set(memberSeq, {
        seq: memberSeq,
        label: typeof data['label'] === 'string' ? data['label'] : '',
        childId: typeof data['childId'] === 'string' ? data['childId'] : '',
        order: draft.order.length,
        ...phase === undefined ? {} : { phase },
        ...record.time === undefined ? {} : { startedAt: record.time },
      })
      draft.order.push(memberSeq)
      continue
    }
    if (record.type === 'tool-workflow/agent-end') {
      const memberSeq = Number(data['seq'])
      if (!Number.isFinite(memberSeq)) continue
      draft.settlements.set(memberSeq, typeof data['outcome'] === 'string' ? data['outcome'] : 'failed')
      const member = draft.members.get(memberSeq)
      if (member !== undefined && record.time !== undefined) member.endedAt = record.time
      continue
    }
    // run-end
    if (draft.stopReason === undefined) {
      draft.stopReason = typeof data['stopReason'] === 'string' ? data['stopReason'] : 'error'
      if (record.time !== undefined) draft.endedAt = record.time
    }
  }
  const runs: ProgressRunFacts[] = []
  for (const draft of drafts.values()) {
    for (const [memberSeq, outcome] of draft.settlements) {
      const member = draft.members.get(memberSeq)
      // Settle an already-declared row; an outcome for a row the stream never declared is
      // not a row (a row means a child call that started).
      if (member !== undefined) member.outcome = outcome
    }
    if (draft.summaryFinalDraft !== undefined) markFinalDraft(draft.members.values(), draft.summaryFinalDraft)
    const members = draft.order.map((memberSeq) => draft.members.get(memberSeq)).filter((member): member is ProgressMemberFact => member !== undefined)
    runs.push({
      runId: draft.runId,
      name: draft.name,
      anchorSeq: draft.anchorSeq,
      members,
      details: draft.details,
      ...draft.guardian === undefined ? {} : { guardian: draft.guardian },
      ...draft.startedAt === undefined ? {} : { startedAt: draft.startedAt },
      ...draft.endedAt === undefined ? {} : { endedAt: draft.endedAt },
      ...draft.stopReason === undefined ? {} : { stopReason: draft.stopReason },
      ...draft.summaryFinalDraft === undefined ? {} : { summaryFinalDraft: draft.summaryFinalDraft },
      ...draft.summaryRejected === undefined ? {} : { summaryRejected: draft.summaryRejected },
    })
  }
  return runs.sort((left, right) => left.anchorSeq - right.anchorSeq)
}

/**
 * Mark the row of the summary draft the run shipped.
 *
 * The rows are recognised by their own numbered name in either shipped language
 * (`汇总·第2稿` / `Summarize · draft 2`) and the mark is the naming table's, so the
 * two cannot disagree about what "final" looks like.
 *
 * That draft can have **two** rows: the first call and its same-draft resubmit (a
 * call that answered in prose and was asked once more). Only the later one lands —
 * the earlier row recorded nothing — so only the row with the highest `order` is
 * marked, and a reader never sees two "final" rows for one draft. A duplicate event,
 * an event that arrives before its rows, and a stream with no such event at all all
 * render exactly what they rendered before.
 * @param members - every folded row of the run.
 * @param draft - 1-based draft number the gate shipped.
 */
function markFinalDraft(members: Iterable<ProgressMemberFact>, draft: number): void {
  for (const language of NAMING_LANGUAGES) {
    const name = synthesisDraftLabel(draft, language)
    let landed: ProgressMemberFact | undefined
    for (const member of members) {
      if (member.label !== name) continue
      if (landed === undefined || member.order > landed.order) landed = member
    }
    if (landed === undefined) continue
    landed.label = synthesisDraftLabel(draft, language, true)
    return
  }
}

/**
 * Pick the run the tab shows: the latest announced run.
 *
 * A workflow can run more than once in one session, so the tab follows the newest
 * `run-start` (highest `anchorSeq`). When two runs share the anchor (impossible from the
 * recorder, possible from a hand-written session) the still-open one wins, because it is
 * the one a reader can still watch.
 * @param runs - folded runs.
 * @returns the active run, or undefined when the session has none.
 */
export function selectActiveRun(runs: readonly ProgressRunFacts[]): ProgressRunFacts | undefined {
  let best: ProgressRunFacts | undefined
  for (const run of runs) {
    if (best === undefined) { best = run; continue }
    if (run.anchorSeq > best.anchorSeq) { best = run; continue }
    if (run.anchorSeq === best.anchorSeq && best.stopReason !== undefined && run.stopReason === undefined) best = run
  }
  return best
}

/**
 * The label a retry adds, taken back off: `<role>（尝试 2）` / `<role> (attempt 2)` → `<role>`.
 *
 * `naming.ts` `memberLabel` appends the attempt suffix and nothing else, so dropping a
 * trailing bracketed run that carries a digit folds the attempts of one call onto one
 * lane without re-parsing roles here. A label with no such suffix is its own base.
 * @param label - a recorded row label.
 * @returns the label without an attempt suffix.
 */
function attemptBaseLabel(label: string | undefined): string {
  const text = typeof label === 'string' ? label.trim() : ''
  const match = /^(.*?)\s*[（(][^（()）]*\d[^（()）]*[)）]$/u.exec(text)
  if (match === null) return text
  return (match[1] ?? '').trim()
}

/**
 * The unit one row belongs to: one task's one role call, across its attempts.
 *
 * Two rows share a unit when they name the same phase and the same role lane, which is
 * exactly what a retry keeps (`任务 2 · 标题` + `执行` on every attempt) and what tells two
 * different tasks apart — the worker rows of `任务 1` and `任务 2` share a label but not a
 * phase, so a completion in one task can never mark the other task's failure recovered.
 * @param member - one folded row.
 * @returns the unit key.
 */
function attemptUnitOf(member: ProgressMemberFact): string {
  return `${member.phase ?? ''}\u0000${attemptBaseLabel(member.label)}`
}

/**
 * The rows whose failure a later attempt of the same unit has already replaced.
 *
 * Red means *still broken now*, so a failure is only current while nothing later in its
 * own unit settled `completed` — a retry, or a resubmit that produced the structured
 * result the first call missed. A failure with a later attempt still running stays
 * current (it is not recovered yet); a failure in another unit, however recently that
 * other unit completed, stays current. The row itself keeps its own mark either way:
 * this decides what the card, the segment and the bar colour, not what the row says.
 * @param members - rows aggregated by one node.
 * @returns the `seq` of every recovered failure row.
 */
export function recoveredFailureSeqs(members: readonly ProgressMemberFact[]): Set<number> {
  const recovered = new Set<number>()
  for (const member of members) {
    if (member.outcome !== 'failed') continue
    const unit = attemptUnitOf(member)
    for (const later of members) {
      if (later.order <= member.order) continue
      if (later.outcome !== 'completed') continue
      if (attemptUnitOf(later) !== unit) continue
      recovered.add(member.seq)
      break
    }
  }
  return recovered
}

/**
 * How many of a node's rows are failing *now* — recovered history excluded.
 *
 * This is the count the red badge shows. The failure badge names work that is still
 * broken; a failure a later attempt replaced is visible on its own row pill, which is
 * the row-level trace the card keeps.
 * @param members - rows aggregated by one node.
 * @returns the number of unrecovered failed rows.
 */
export function currentFailureCount(members: readonly ProgressMemberFact[]): number {
  const recovered = recoveredFailureSeqs(members)
  let count = 0
  for (const member of members) {
    if (member.outcome === 'failed' && !recovered.has(member.seq)) count += 1
  }
  return count
}

/**
 * The state of one node, in the precedence the design fixes:
 * `failed` → `doing` → `done` → `blocked` → `cancelled` → `pending`.
 *
 * `failed` is a *current* failure: a row whose failure a later attempt of the same unit
 * replaced no longer colours the aggregate (see {@link recoveredFailureSeqs}), because red
 * has to mean "still broken now" — one task that failed and then verified cleanly must not
 * dye the stage that ran it, the bar, or its own card. The row keeps its own red mark; only
 * the aggregate clears.
 *
 * `blocked` is the only derived state: the run ended (or the engine reported an outcome
 * that is neither a completion nor a cancellation) while a row was still unsettled. The
 * stream cannot say why, so the node says "blocked" and its tooltip names the evidence.
 * @param members - rows aggregated by this node.
 * @param ended - whether `run-end` was seen for the run.
 * @returns the node state.
 */
export function nodeState(members: readonly ProgressMemberFact[], ended: boolean): ProgressState {
  const recovered = recoveredFailureSeqs(members)
  const current = recovered.size === 0 ? members : members.filter((member) => !recovered.has(member.seq))
  const settled = current.filter((member) => member.outcome !== undefined)
  const unsettled = current.length - settled.length
  if (settled.some((member) => member.outcome === 'failed')) return 'failed'
  if (!ended && unsettled > 0) return 'doing'
  if (settled.length > 0 && settled.length === current.length && settled.every((member) => member.outcome === 'completed')) return 'done'
  if (ended && unsettled > 0) return 'blocked'
  if (settled.some((member) => member.outcome === 'cancelled')) return 'cancelled'
  if (settled.some((member) => member.outcome !== 'completed' && member.outcome !== 'cancelled')) return 'blocked'
  return 'pending'
}

/** Why a node is `blocked`, so the tooltip can name the evidence (never a guess). */
function blockedReason(members: readonly ProgressMemberFact[], ended: boolean): 'runEndedUnsettled' | 'outcomeUnsettled' {
  const unsettled = members.length - members.filter((member) => member.outcome !== undefined).length
  return ended && unsettled > 0 ? 'runEndedUnsettled' : 'outcomeUnsettled'
}

/**
 * Rows settled over rows declared.
 * @param members - any set of declared rows.
 * @returns the percentage, absent when nothing was declared.
 */
export function percentOf(members: readonly ProgressMemberFact[]): ProgressPercent | undefined {
  const declared = members.length
  if (declared === 0) return undefined
  const settled = members.filter((member) => member.outcome !== undefined).length
  return { settled, declared, value: Math.round((settled / declared) * 100) }
}

/** Whether one character can continue a Latin word (so a token boundary is not here). */
function isWordChar(character: string): boolean {
  return character !== '' && /[a-z0-9_]/i.test(character)
}

/**
 * Whether one phase header carries one stage token.
 *
 * A token made only of non-Latin characters is matched as a substring, which is what a
 * word means in a script without spaces (`规划` in `任务 1 · 规划`). A token with Latin
 * letters must sit on word boundaries: matched loosely, `ui` hits `build`, `tag` hits
 * `stage` and `target`, and `sync` hits `async`, which is how the old spine reported
 * stages that never ran. Both tests are done on the lowercased header.
 * @param haystack - the lowercased phase header.
 * @param token - one stage token.
 * @returns true when the header names the token.
 */
function phaseCarriesToken(haystack: string, token: string): boolean {
  const needle = token.toLowerCase()
  if (needle === '') return false
  if (!/[a-z0-9]/i.test(needle)) return haystack.includes(needle)
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return false
    const before = at === 0 ? '' : haystack.slice(at - 1, at)
    const after = haystack.slice(at + needle.length, at + needle.length + 1)
    if (!isWordChar(before) && !isWordChar(after)) return true
    from = at + 1
  }
}

/** The first spine stage whose token the phase header carries.
 *
 * Numbered plan tasks (`任务 7 · 标题`) always win over stage tokens: a title that
 * mentions a stage word (`任务 7 · 合并为干净可并发执行计划`) names a plan task,
 * not the `执行` stage. Without this, the extra task lands as a stage row under
 * `规划`.
 */
export function stageForPhase(phase: string): ProgressStageDefinition | undefined {
  if (taskNumberIn(phase) !== undefined) return undefined
  const haystack = phase.toLowerCase()
  for (const stage of PROGRESS_STAGES) {
    if (stage.edge) continue
    if (stage.tokens.some((token) => phaseCarriesToken(haystack, token))) return stage
  }
  return undefined
}

/**
 * Role labels that name a work stage when a row's phase header does not.
 *
 * A recorded `agent-start` carries two different kinds of `phase`: the phase a role call
 * belongs to (`执行`, `检查`) for the fixed stages, and the plan-task group title
 * (`任务 1 · 标题`) for the worker and verifier calls that run *inside* a task. Matched by
 * phase alone, those rows name no stage — which is why the panel reported `执行` and
 * `检查`, the two stages every run performs, as never reported.
 *
 * The words here are role names, not free-form headers, so they are matched only against
 * a row's label and never against a phase: a task titled `检查登录` must keep binding by
 * its phase, and a task titled `check the build` must not become `检查` because of a
 * substring inside its own title.
 */
const STAGE_ROLE_LABELS: Readonly<Record<string, readonly string[]>> = {
  // `规划` / `汇总` cover the numbered names a repeated leg carries
  // (`规划（第2次）`, `汇总·第2稿`); the bare role words still cover every
  // single-call leg and every history row.
  plan: ['规划助手', '规划', 'planner'],
  execute: ['执行', 'execute', 'worker'],
  verify: ['检查', '核验', 'verify', 'check', 'verifier'],
  synthesize: ['汇总助手', '汇总', 'summarize', 'synthesizer'],
}

/** The first spine stage whose role label names it, if a label names one. */
function stageForRoleLabel(label: string): ProgressStageDefinition | undefined {
  const haystack = label.toLowerCase()
  for (const stage of PROGRESS_STAGES) {
    const labels = STAGE_ROLE_LABELS[stage.key]
    if (labels === undefined) continue
    if (labels.some((token) => phaseCarriesToken(haystack, token))) return stage
  }
  return undefined
}

/** The first chain capsule whose role label names it, if a label names one. */
function chainStageForLabel(label: string): ProgressChainStageDefinition | undefined {
  const haystack = label.toLowerCase()
  for (const slot of PROGRESS_CHAIN) {
    if (slot.tokens.some((token) => phaseCarriesToken(haystack, token))) return slot
  }
  return undefined
}

/**
 * The fixed chain of one task card: three capsules, in render order, filled by the rows
 * whose role label names them.
 *
 * The list is never shorter than {@link PROGRESS_CHAIN}: an unreached capsule is part of
 * the answer (`reached: false`, `pending`), not a gap. A row whose label names no capsule
 * — the planner, a synthesizer call, a child with no role word — stays in the card's
 * `members` and renders after the chain, so no declared row is dropped.
 * @param members - the card's rows, in plan order.
 * @param ended - whether `run-end` was seen, which turns an unsettled capsule into `blocked`.
 * @returns one slot per chain step.
 */
export function chainOf(members: readonly ProgressMemberFact[], ended: boolean): ProgressChainSlot[] {
  const bySlot = new Map<string, ProgressMemberFact[]>()
  for (const member of members) {
    const slot = chainStageForLabel(member.label)
    if (slot === undefined) continue
    const list = bySlot.get(slot.key)
    if (list === undefined) bySlot.set(slot.key, [member])
    else list.push(member)
  }
  return PROGRESS_CHAIN.map((slot): ProgressChainSlot => {
    const rows = bySlot.get(slot.key) ?? []
    return {
      key: slot.key,
      members: rows,
      state: rows.length === 0 ? 'pending' : nodeState(rows, ended),
      reached: rows.length > 0,
    }
  })
}

/**
 * The plan-task position a phase header names (`任务 3 · 标题` → 3, `Task 10 · x` → 10).
 *
 * This is the number the engine puts in `taskGroupTitle`, read back as a number so that
 * `任务 10` sorts after `任务 2` instead of before it.
 * @param phase - the recorded phase header.
 * @returns the position, or undefined when the header names none.
 */
export function taskNumberIn(phase: string | undefined): number | undefined {
  if (typeof phase !== 'string') return undefined
  const match = /^\s*(?:任务|task)\s*(\d+)/iu.exec(phase)
  if (match === null) return undefined
  const value = Number(match[1])
  return Number.isInteger(value) && value > 0 ? value : undefined
}

/**
 * Whether a recorded phase (or label) names the guardian adjudication call.
 *
 * The engine records that call as `phase: 'Guardian'` / `label: 'guardian adjudication'`,
 * so it is a card of its own beside the plan tasks: not a numbered task, and not a step of
 * any task's chain. Matching is anchored, so a plan task that merely mentions the guardian
 * in its title (`任务 1 · Guardian 判停`) stays a plan task.
 * @param text - a phase header or a row label.
 * @returns whether this is the guardian card.
 */
export function isGuardianCard(text: string | undefined): boolean {
  if (typeof text !== 'string') return false
  return /^(?:guardian|守卫)/iu.test(text.trim())
}

/** One task-band card before it becomes a node: the phase it was recorded under and its rows. */
export interface ProgressTaskCardDraft {
  phase: string
  members: ProgressMemberFact[]
}

/**
 * Order the task band: plan tasks by their number, then the guardian card, the rest where
 * they were.
 *
 * Three rules, applied in this order:
 *
 * 1. **Numbered cards sort by number.** The slots numbered cards already hold are refilled
 *    in ascending order, so `任务 10` follows `任务 2` and a run that announced its tasks out
 *    of order reads in plan order.
 * 2. **The guardian card sits after the numbered cards.** It is not a plan task, so it may
 *    not land between `任务 2` and `任务 3`.
 * 3. **An unnumbered card keeps its position.** A phase this build reads no number from (an
 *    unphased row, a phase of its own) stays where the run put it: moving it would claim an
 *    order the stream never declared.
 * @param cards - the band's cards, in arrival order.
 * @returns the cards in render order (the same card objects, never copies).
 */
export function orderTaskCards<T extends ProgressTaskCardDraft>(cards: readonly T[]): T[] {
  const ordered = [...cards]
  const numbered = ordered
    .map((card, index) => ({ card, index, number: taskNumberIn(card.phase) }))
    .filter((entry): entry is { card: T, index: number, number: number } => entry.number !== undefined)
  numbered.sort((left, right) => left.number - right.number || left.index - right.index)
  numbered.forEach((entry, position) => { ordered[entry.index] = numbered[position]!.card })
  const guardianAt = ordered.findIndex((card) => isGuardianCard(card.phase))
  const lastNumbered = ordered.reduce((last, card, index) => (taskNumberIn(card.phase) === undefined ? last : index), -1)
  // Removing the guardian first shifts `lastNumbered` down by one when it sat before the
  // guardian, so re-inserting at that index lands it directly after the last numbered card.
  if (guardianAt !== -1 && lastNumbered !== -1 && guardianAt < lastNumbered) {
    const [guardian] = ordered.splice(guardianAt, 1)
    if (guardian !== undefined) ordered.splice(lastNumbered, 0, guardian)
  }
  return ordered
}

/**
 * Derive the track one run renders.
 * Every recorded phase is either aggregated into the spine stage it names or appended as
 * a node of its own. The spine therefore never hides a phase, and a template stage with
 * no recorded phase stays `pending` rather than borrowing a neighbour's state.
 * @param run - folded run facts.
 * @param options - copy resolver for spine labels.
 * @returns the track model.
 */
export function deriveTrack(run: ProgressRunFacts, options: DeriveOptions = {}): ProgressTrackModel {
  const labelFor = options.labelFor ?? ((stageKey: string) => stageKey)
  const ended = run.stopReason !== undefined
  const byStage = new Map<string, ProgressMemberFact[]>()
  const byStagePhases = new Map<string, string[]>()
  const evidenceByStage = new Map<string, ProgressMemberFact[]>()
  const extras: ProgressTaskCardDraft[] = []
  const unphased: ProgressMemberFact[] = []
  for (const member of run.members) {
    const phase = member.phase
    if (phase === undefined) {
      unphased.push(member)
      continue
    }
    const stage = stageForPhase(phase)
    if (stage === undefined) {
      const existing = extras.find((entry) => entry.phase === phase)
      if (existing === undefined) extras.push({ phase, members: [member] })
      else existing.members.push(member)
      // The row keeps its plan-task node above; this only cross-references it onto the
      // stage whose role ran it, so `执行`/`检查` report what happened instead of nothing.
      const roleStage = stageForRoleLabel(member.label)
      if (roleStage !== undefined) {
        const evidence = evidenceByStage.get(roleStage.key)
        if (evidence === undefined) evidenceByStage.set(roleStage.key, [member])
        else evidence.push(member)
      }
      continue
    }
    const list = byStage.get(stage.key)
    if (list === undefined) {
      byStage.set(stage.key, [member])
      byStagePhases.set(stage.key, [phase])
    } else {
      list.push(member)
      const phases = byStagePhases.get(stage.key)
      if (phases !== undefined && !phases.includes(phase)) phases.push(phase)
    }
  }
  /** The two ends of the track report the run's own facts, not a member's. */
  const edgeState = (stageKey: string): ProgressState => {
    if (stageKey === 'start') return 'done'
    if (!ended) return 'doing'
    if (run.stopReason === 'cancelled') return 'cancelled'
    if (run.stopReason === 'completed') return 'done'
    return 'failed'
  }
  /** Level-1 payloads by the phase they name; a phase-less one is the run's fallback. */
  const detailByPhase = new Map<string, ProgressStageDetailFact>()
  let runDetail: ProgressStageDetailFact | undefined
  for (const detail of Array.isArray(run.details) ? run.details : []) {
    if (detail === undefined) continue
    if (detail.phase === undefined) {
      runDetail = detail
      continue
    }
    if (!detailByPhase.has(detail.phase)) detailByPhase.set(detail.phase, detail)
  }
  const detailOf = (phases: readonly string[]): ProgressStageDetailFact | undefined => {
    for (const phase of phases) {
      const detail = detailByPhase.get(phase)
      if (detail !== undefined) return detail
    }
    return undefined
  }
  const node = (definition: ProgressStageDefinition | undefined, key: string, kind: ProgressNodeModel['kind'], members: ProgressMemberFact[], phases: string[], label?: string, evidence: ProgressMemberFact[] = []): ProgressNodeModel => {
    // A stage's own rows are authoritative; its evidence speaks only when it has none.
    const rows = members.length > 0 ? members : evidence
    const state = definition !== undefined && definition.edge ? edgeState(definition.key) : nodeState(rows, ended)
    const reason = state === 'blocked' ? blockedReason(rows, ended) : undefined
    const detail = detailOf(phases)
    return {
      key,
      kind,
      label: label ?? (definition === undefined ? key : labelFor(definition.key)),
      state,
      members,
      evidence,
      phases,
      derived: state === 'blocked',
      ...reason === undefined ? {} : { reason },
      ...detail === undefined ? {} : { stageDetail: detail },
    }
  }
  /** One task-band card: a plan task, or the guardian call, with its own fixed chain. */
  const cardNode = (card: ProgressTaskCardDraft): ProgressNodeModel => {
    const phases = card.phase === '' ? [] : [card.phase]
    const base = node(undefined, `phase:${card.phase}`, 'extra', card.members, phases, card.phase)
    if (isGuardianCard(card.phase)) return { ...base, guardian: true }
    const taskNumber = taskNumberIn(card.phase)
    return {
      ...base,
      ...taskNumber === undefined ? {} : { taskNumber },
      chain: chainOf(card.members, ended),
    }
  }
  const nodes: ProgressNodeModel[] = []
  for (const stage of PROGRESS_STAGES) {
    nodes.push(node(stage, `stage:${stage.key}`, stage.edge ? 'edge' : 'stage', byStage.get(stage.key) ?? [], byStagePhases.get(stage.key) ?? [], undefined, evidenceByStage.get(stage.key) ?? []))
    // Extra phases are real plan tasks (`任务 n · 标题`): the engine announces them while
    // it executes the plan, so they belong between `执行` and `检查` — the template's
    // work slot. A row that declared no phase at all still gets a node (empty label =
    // "unphased" copy), so the percentage and the track never count different rows.
    // Numbered tasks sort by number, then the guardian card, then whatever named no
    // number where it arrived (`orderTaskCards`).
    if (stage.key === 'execute') {
      const cards: ProgressTaskCardDraft[] = [...extras]
      if (unphased.length > 0) cards.push({ phase: '', members: unphased })
      for (const card of orderTaskCards(cards)) nodes.push(cardNode(card))
    }
  }
  const percent = percentOf(run.members)
  return {
    runId: run.runId,
    name: run.name,
    ended,
    nodes,
    ...percent === undefined ? {} : { percent },
    ...run.stopReason === undefined ? {} : { stopReason: run.stopReason },
    ...runDetail === undefined ? {} : { stageDetail: runDetail },
  }
}

/** The five words a run can be described by on the one-page flow (the header chip). */
export type ProgressStoryState = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled'

/**
 * The leg a node of the flow stands for.
 *
 * The two ends are structure — the run opened, the run closed. The five in between are the
 * calls that wrote the plan, did the work, checked it, reviewed it, or wrote the answer
 * down.
 */
export type ProgressFlowKind = 'start' | 'plan' | 'execute' | 'check' | 'review' | 'summarize' | 'end'

/**
 * The gate's all-rejected verdict: how many drafts went in, where the last one stopped, why.
 *
 * It is the same reading `ProgressRunFacts.summaryRejected` records; the flow keeps it on the
 * summary leg's node because that leg is what the verdict is about, and the node's opened
 * call list is where a reader looks for that leg's calls.
 */
export interface ProgressFlowRejected {
  /** How many drafts the gate turned back; at least 1. */
  drafts: number
  /** The gate the last draft failed: the check, or the review after it. */
  stage: 'check' | 'verify'
  /** The gate's own words, verbatim. */
  reason: string
}

/**
 * One plan task's calls inside one work leg: the calls a single step of the plan walked.
 *
 * A work leg (`execute` / `check` / `review`) is one *visit*, however many plan tasks it
 * served, so its rows are the calls of every task that step touched. The sub-nodes are that
 * same set split by the task number the row's phase carries (`任务 2 · 写文档` → 2) — not a
 * second fold, and not a second set of rows: each row sits in exactly one place, either in a
 * task's sub-node or, when its phase names no task, on the leg itself.
 *
 * They are not steps. `total`, `at` and `remaining` count legs only, and the leg's own state
 * is read off all of its rows before the split, so hanging tasks under a step never changes
 * where the reader is or what colour the step is.
 */
export interface ProgressFlowSubNode {
  /** Stable identity: `<parent key>:t<n>`. */
  key: string
  /** Plan-task number from the row's phase, ≥ 1; strictly ascending inside one `subs`. */
  taskNumber: number
  /** The task's phase on this leg, verbatim, off its earliest call; never truncated. */
  title: string
  /** `nodeState` over this task's own rows — the same states, and colours, as the leg's. */
  state: ProgressState
  /** This task's calls on this leg, in `seq` order. */
  members: ProgressMemberFact[]
}

/** One node of the flow: one leg of the run, with the calls that spoke for it. */
export interface ProgressFlowNode {
  /** Stable identity: `flow:start` / `flow:end` / `flow:<position>:<kind>:<ordinal>`. */
  key: string
  kind: ProgressFlowKind
  /** Which visit of this leg this is, counting from 1; both ends are 0. */
  ordinal: number
  /** Aggregate state (see {@link nodeState}); the start is always `done`, the end follows the run. */
  state: ProgressState
  /**
   * The calls this node speaks for, in `seq` order; both ends carry none of their own.
   *
   * On a work leg these are the rows whose phase named no plan task (see
   * {@link ProgressFlowNode.subs}); every other row of the leg sits in its task's sub-node.
   * The two together are exactly the rows the leg held, each once.
   */
  members: ProgressMemberFact[]
  /**
   * The plan tasks this leg served, one sub-node each, in task-number order.
   *
   * Only a work leg (`execute` / `check` / `review`) can carry them, and only when at least
   * one of its rows named a task: a leg whose rows named none keeps §21's shape exactly, so
   * the field is *absent* rather than an empty list. Neither end, the plan or the summary
   * ever carries it — those legs are about one role, not about a plan task's calls.
   */
  subs?: ProgressFlowSubNode[]
  /**
   * Set on the summary leg when every draft was rejected — nothing shipped.
   *
   * The verdict rides here instead of in a card of its own: the page keeps one drawing, and
   * the words are only read once the node is opened. A node carrying it is always `failed`
   * and never `done`, and it is the only node this field can appear on.
   */
  rejected?: ProgressFlowRejected
}

/** One run as a flow: every node, the one being worked on, and how far that leaves it. */
export interface ProgressFlow {
  /** The whole run's word (`waiting` / `running` / `done` / `failed` / `cancelled`), as the chip says it. */
  state: ProgressStoryState
  nodes: ProgressFlowNode[]
  /** 1-based index of the node being worked on, in `nodes`; never below 1. */
  at: number
  /** `nodes.length`. */
  total: number
  /** `total - at`. */
  remaining: number
  /** The row `summary-final` named — the draft that shipped: its number and its `seq`. */
  final?: { draft: number; seq: number }
}

/**
 * The words that name a leg on a row's **label**, in the order they are tried.
 *
 * A row's label is a role name (`naming.ts` `memberLabel` / `plannerCallLabel` /
 * `synthesisDraftLabel`), never a task title, so these tokens are matched against the label
 * and never against a phase: a task titled `检查登录` must not turn its worker's row into a
 * check. `check` is tried before `review` so a word both could claim lands on the gate it
 * belongs to, while `复核` keeps its own row because nothing else reads it. Longer words
 * come first inside a kind, so `规划助手` is read as the planner before `规划` is tried.
 *
 * The bare `plan` is what an English boundary call is called (`Plan (call 2)`), and it is
 * matched on a word boundary, so it never reads the `plan` inside `planner`.
 */
const FLOW_LEG_TOKENS: ReadonlyArray<{ kind: ProgressFlowKind, tokens: readonly string[] }> = [
  { kind: 'plan', tokens: ['规划助手', '规划', 'planner', 'plan'] },
  { kind: 'execute', tokens: ['执行', 'execute', 'worker'] },
  { kind: 'check', tokens: ['检查', '核验', 'check', 'verifier', 'verify'] },
  { kind: 'review', tokens: ['复核', 'review', 'supervisor', 'reviewer'] },
  { kind: 'summarize', tokens: ['汇总助手', '汇总', 'summarize', 'synthesizer'] },
]

/**
 * The leg a row's label names, if it names one.
 *
 * Matching is the same one used for phase headers (a CJK token anywhere, a Latin token on
 * word boundaries), done on the lowercased label.
 * @param label - a recorded row label.
 * @returns the leg, or undefined when the label names none.
 */
function flowLegOf(label: string): ProgressFlowKind | undefined {
  const haystack = label.toLowerCase()
  for (const leg of FLOW_LEG_TOKENS) {
    if (leg.tokens.some((token) => phaseCarriesToken(haystack, token))) return leg.kind
  }
  return undefined
}

/**
 * The first whole number a label carries: the visit's own number.
 *
 * `规划（第2次）` → 2, `汇总·第2稿（定稿）` → 2, `执行（尝试 2）` → 2, `执行` → none. A zero is
 * not a visit, so it reads as none and the node falls back to the visit already open.
 * @param text - a recorded row label.
 * @returns the number, or undefined when the label carries none.
 */
function firstNumberIn(text: string): number | undefined {
  const match = /\d+/u.exec(text)
  if (match === null) return undefined
  const value = Number(match[0])
  return Number.isInteger(value) && value > 0 ? value : undefined
}

/**
 * The state of one declared call: the row-level half of {@link nodeState}.
 *
 * A row is the smallest thing the stream settles, so its own state is its outcome and
 * nothing else — an unsettled row is `doing` (`正在看`), and an outcome that is neither a
 * completion, a cancellation nor a failure stays `blocked` rather than being renamed.
 *
 * The flow's nodes carry these rows and their opened list shows one per call, so the row
 * keeps saying its own word even where the node above it aggregates several.
 * @param member - one folded row.
 * @returns the row's own state.
 */
export function rowState(member: ProgressMemberFact): ProgressState {
  if (member.outcome === undefined) return 'doing'
  if (member.outcome === 'completed') return 'done'
  if (member.outcome === 'cancelled') return 'cancelled'
  if (member.outcome === 'failed') return 'failed'
  return 'blocked'
}

/**
 * A label with its shipped-draft mark taken off.
 *
 * The mark says what the *row* is (the draft the gate shipped), not what role spoke, so it
 * must not end up in the role column beside the `交卷` word that already says it.
 * @param text - a label without its attempt suffix.
 * @returns the label without a trailing draft mark.
 */
function withoutFinalMark(text: string): string {
  for (const language of NAMING_LANGUAGES) {
    const mark = SYNTHESIS_FINAL_MARK[language]
    const bare = mark.trim()
    for (const suffix of [mark, bare]) {
      if (suffix === '' || !text.endsWith(suffix)) continue
      return text.slice(0, text.length - suffix.length).trim()
    }
  }
  return text
}

/**
 * The role a row is spoken as: `执行（尝试 2）` → `执行`, `汇总·第2稿（定稿）` → `汇总·第2稿`.
 * @param member - one folded row.
 * @returns the role word, without the retry suffix or the shipped mark.
 */
export function storyRoleOf(member: ProgressMemberFact): string {
  return withoutFinalMark(attemptBaseLabel(member.label))
}

/**
 * The row `summary-final` names, read back off the rows the fold already marked.
 *
 * The fold writes the mark onto the row that landed (the highest `order` of that draft
 * name, in whichever language the label was written), so matching the marked name is the
 * same fact rather than a second guess at it. A stream whose rows were never marked — the
 * bare draft name is all it carries — still names its row here.
 * @param members - every folded row of the run.
 * @param draft - 1-based draft number the gate shipped.
 * @returns the row that carries the draft, or undefined when no row names it.
 */
function shippedDraftRow(members: readonly ProgressMemberFact[], draft: number): ProgressMemberFact | undefined {
  const latestNamed = (name: string): ProgressMemberFact | undefined => {
    let named: ProgressMemberFact | undefined
    for (const member of members) {
      if (member.label !== name) continue
      if (named === undefined || member.order > named.order) named = member
    }
    return named
  }
  for (const language of NAMING_LANGUAGES) {
    const marked = latestNamed(synthesisDraftLabel(draft, language, true))
    if (marked !== undefined) return marked
  }
  for (const language of NAMING_LANGUAGES) {
    const bare = latestNamed(synthesisDraftLabel(draft, language))
    if (bare !== undefined) return bare
  }
  return undefined
}

/**
 * Derive the flow one run draws: the two ends, one node per leg, and the one being worked on.
 *
 * Everything comes off the run facts the fold already produced — no plan, no estimate, and
 * no reading of what the run "probably" did. A leg is read off a row's **label**, never its
 * phase (a phase names the task), and the grouping has four rules:
 *
 * 1. a leg that ran again under its own number (`规划（第2次）`, `汇总·第2稿`,
 *    `执行（尝试 2）`) is a node of its own, so two visits stay two steps;
 * 2. a leg that ran again with no number of its own (two workers of one wave) folds into
 *    the node beside it, so one step is one leg however many calls it took;
 * 3. a row whose label names no leg is kept on the step before it — on the start when no
 *    step has opened yet — because a declared call is a fact, not a gap;
 * 4. the guardian call is not a leg: its own monitor speaks for it.
 *
 * A work leg (`execute` / `check` / `review`) then splits its own rows by the plan task
 * their **phase** names (`任务 2 · 写文档` → 2), one sub-node per task, in number order: the
 * step is one visit and the tasks are what it worked on. The split moves no row out of the
 * step — the rows left on it are the ones whose phase names no task, and the step keeps the
 * state it read off all of them before the split (see {@link ProgressFlowNode.subs}). No
 * other leg splits: the plan and the summary are about one role, not about a plan task's
 * calls, and both ends are structure.
 *
 * The current node (`at`) is the one a reader is waiting on: the node holding the earliest
 * unsettled call, else the end of a run that is still open, else the first step that is
 * failed or blocked, else the end. Before the run declares any step it is the start. A call
 * that moved into a sub-node is still that step's call, so the reader's place does not slide
 * off it; the sub-nodes themselves are never a place (they are not steps).
 *
 * The summary is the one leg a run can end without shipping anything: `summary-final` names
 * the draft that shipped, and `summary-rejected` says the gate turned every draft back. Only
 * the second one, and only when no draft shipped, leaves a mark on the drawing — the summary
 * node turns `failed` and carries the verdict for its opened call list (see
 * {@link ProgressFlowNode.rejected}).
 * @param run - folded run facts.
 * @returns the flow model.
 */
export function deriveProgressFlow(run: ProgressRunFacts): ProgressFlow {
  const ended = run.stopReason !== undefined
  const state: ProgressStoryState = !ended
    ? (run.members.length === 0 ? 'waiting' : 'running')
    : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
  const rows = [...run.members].sort((left, right) => left.seq - right.seq)
  const start: ProgressFlowNode = { key: 'flow:start', kind: 'start', ordinal: 0, state: 'done', members: [] }
  const middle: Array<Pick<ProgressFlowNode, 'key' | 'kind' | 'ordinal' | 'members'>> = []
  for (const member of rows) {
    if (isGuardianCard(member.label)) continue
    const kind = flowLegOf(member.label)
    if (kind === undefined) {
      const previous = middle[middle.length - 1] ?? start
      previous.members.push(member)
      continue
    }
    const number = firstNumberIn(member.label)
    const previous = middle[middle.length - 1]
    // The same leg, and this row claims no visit of its own (or claims the visit already
    // open): one step, one more call.
    if (previous !== undefined && previous.kind === kind && (number === undefined || number === previous.ordinal)) {
      previous.members.push(member)
      continue
    }
    middle.push({ key: `flow:${middle.length}:${kind}:${number ?? 1}`, kind, ordinal: number ?? 1, members: [member] })
  }
  const end: ProgressFlowNode = {
    key: 'flow:end',
    kind: 'end',
    ordinal: 0,
    state: !ended ? 'pending' : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed',
    members: [],
  }
  const nodes: ProgressFlowNode[] = [
    start,
    ...middle.map((node): ProgressFlowNode => {
      // The step's colour is read off the whole step, before its rows are split: what one
      // plan task's own sub-node says may not repaint the step it hangs under.
      const flowNode: ProgressFlowNode = { ...node, state: nodeState(node.members, ended) }
      if (flowNode.kind !== 'execute' && flowNode.kind !== 'check' && flowNode.kind !== 'review') return flowNode
      // One bucket per plan task the step's own rows name, in `seq` order inside each. A row
      // whose phase names no task is not guessed at: it stays on the step.
      const buckets = new Map<number, ProgressMemberFact[]>()
      const loose: ProgressMemberFact[] = []
      for (const member of node.members) {
        const taskNumber = taskNumberIn(member.phase)
        if (taskNumber === undefined) {
          loose.push(member)
          continue
        }
        const bucket = buckets.get(taskNumber)
        if (bucket === undefined) buckets.set(taskNumber, [member])
        else bucket.push(member)
      }
      // No row named a task, so the step keeps §21's shape to the letter: the field is
      // absent, not an empty list.
      if (buckets.size === 0) return flowNode
      const subs: ProgressFlowSubNode[] = [...buckets.entries()]
        .sort(([left], [right]) => left - right)
        .map(([taskNumber, rows]) => ({
          key: `${node.key}:t${taskNumber}`,
          taskNumber,
          // The earliest call names the task: its phase verbatim, or, for a row recorded
          // without one, the label it does carry — never an invented title.
          title: rows[0]!.phase ?? rows[0]!.label,
          state: nodeState(rows, ended),
          members: rows,
        }))
      return { ...flowNode, members: loose, subs }
    }),
    end,
  ]
  // A run whose gate turned every draft back has no `summary-final` row, but it still has
  // something to say. The verdict lands on the summary leg's node instead of a card of its
  // own: the leg is what the verdict is about, the node goes amber by the same `data-state`
  // every other failed node uses, and the count, the gate and the words are read only when
  // the node is opened — the page gains no standing sentence.
  //
  // A shipped draft wins over a rejected claim: the recorder never writes both (a run either
  // handed one draft in or it did not), but a hand-written stream could, and the page must
  // not deny a draft the run really shipped.
  const rejected = run.summaryFinalDraft === undefined ? run.summaryRejected : undefined
  if (rejected !== undefined) {
    const summary = nodes.findLast((node) => node.kind === 'summarize')
    if (summary === undefined) {
      // A summary that ran inside the parent (`model` strategy) declares no call, so no row
      // named the leg. It still ran, so it gets the node it lacked, with no calls of its own
      // and the verdict on it. The counting stays honest in both directions: `total` gains
      // the step the run really took, and `at` stops on this node — the steps after a
      // failure stay counted and unreached, exactly as they do on any other leg.
      nodes.splice(nodes.length - 1, 0, {
        key: `flow:${middle.length}:summarize:1`,
        kind: 'summarize',
        ordinal: 1,
        state: 'failed',
        members: [],
        rejected,
      })
    } else {
      // The last visit is the one the verdict closed: earlier drafts did reach the gate, and
      // their nodes keep saying so. Marking them all would put the reader's place (`at`) back
      // on the first draft, which is not where the run stopped.
      nodes[nodes.indexOf(summary)] = { ...summary, state: 'failed', rejected }
    }
  }
  const total = nodes.length
  // The earliest call still open, and the node it sits in. `rows` is already in `seq` order,
  // so the first unsettled row that belongs to a node is the one a reader is waiting on. A
  // call that moved into one of the step's task sub-nodes is still that step's call: without
  // reading the sub-nodes too, a leg whose tasks are all still running would stop being the
  // reader's place and the highlight would fall through to the end of the run.
  let open = 0
  for (const member of rows) {
    if (member.outcome !== undefined) continue
    const index = nodes.findIndex((node) => node.members.includes(member)
      || (node.subs?.some((sub) => sub.members.includes(member)) ?? false))
    if (index !== -1) {
      open = index + 1
      break
    }
  }
  const broken = nodes.findIndex((node) => node.state === 'failed' || node.state === 'blocked')
  let at: number
  if (open !== 0) at = open
  // Nothing is running, but the run is still open: the flow stops at its end — and at its
  // start while no step has been declared yet.
  else if (!ended) at = middle.length === 0 ? 1 : total
  else at = broken === -1 ? total : broken + 1
  const shipped = run.summaryFinalDraft === undefined ? undefined : shippedDraftRow(run.members, run.summaryFinalDraft)
  return {
    state,
    nodes,
    at,
    total,
    remaining: total - at,
    ...shipped === undefined || run.summaryFinalDraft === undefined ? {} : { final: { draft: run.summaryFinalDraft, seq: shipped.seq } },
  }
}

/** One `LABEL: value` line of a coordination block (`WORK_COMMIT: abc1234`). */
const COORDINATION_LABEL_LINE = /^[ \t>*_`-]*([A-Za-z][A-Za-z_ -]*?)[ \t]*[:：][ \t]*(.*?)[ \t]*$/

/** Read the labelled form of a block (`WORK_COMMIT: abc1234`), one fact per line. */
function labelledFieldValues(body: string): Partial<Record<DetailFieldKey, string>> {
  const fields: Partial<Record<DetailFieldKey, string>> = {}
  for (const line of body.split(/\r?\n/)) {
    const match = COORDINATION_LABEL_LINE.exec(line)
    if (match === null) continue
    const key = canonicalDetailField(match[1] ?? '')
    if (key === undefined || fields[key] !== undefined) continue
    // A value wrapped in backticks is still that value; the block is copied verbatim so
    // the fences a writer adds for readability must not leak into the cell.
    const value = (match[2] ?? '').replace(/^`+|`+$/g, '').trim()
    if (value !== '') fields[key] = value
  }
  return fields
}

/** Read the JSON form of a fenced block, when that fence is one. */
function jsonFieldValues(language: string, body: string): Partial<Record<DetailFieldKey, string>> | undefined {
  if (language !== 'grok-coordination' && language !== 'json') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }
  const record = asRecord(parsed)
  if (record === undefined) return undefined
  const nested = asRecord(record['coordination'])
  const fields = pickDetailFields(nested ?? record)
  const known = Object.keys(fields).length
  if (known === 0) return undefined
  // A `json` fence is not a coordination report unless it carries the coordination object
  // or enough of the seven fields to be unmistakable; prose in a generic JSON block must
  // not be promoted into evidence.
  if (nested === undefined && language !== 'grok-coordination' && known < 2) return undefined
  return fields
}

/**
 * Parse a coordination block out of a stage's text.
 *
 * Three shapes are accepted, and nothing else:
 *
 * 1. a fenced `json` / `grok-coordination` block carrying the canonical fields (or a
 *    `coordination` object) — at least two fields, unless the language says it is one;
 * 2. any fenced block whose body is a labelled block — the `LABEL: value` form `AGENTS.md`
 *    prescribes (`WORK_COMMIT: …`, `CHANGES: …`, `BLOCKERS: …`) — with at least two
 *    known labels;
 * 3. an unfenced labelled block, because the coordination protocol is posted as the
 *    message body itself and not always inside a fence.
 *
 * Prose that merely mentions a field is not a report: the caller falls through to "not
 * reported" and the tab never treats text as structured data.
 * @param text - child-session or stage text that may contain a block.
 * @returns the parsed block, or undefined when no well-formed block exists.
 */
export function parseCoordinationBlock(text: string | undefined): CoordinationBlock | undefined {
  if (typeof text !== 'string' || text === '') return undefined
  const fenced = /```([A-Za-z-]*)[^\n]*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = fenced.exec(text)) !== null) {
    const language = (match[1] ?? '').toLowerCase()
    const body = match[2] ?? ''
    const fromJson = jsonFieldValues(language, body)
    if (fromJson !== undefined) return { fields: fromJson, raw: body.trim() }
    const fromLabels = labelledFieldValues(body)
    if (Object.keys(fromLabels).length >= 2) return { fields: fromLabels, raw: body.trim() }
  }
  const unfenced = labelledFieldValues(text)
  if (Object.keys(unfenced).length >= 2) return { fields: unfenced, raw: text.trim() }
  return undefined
}

/**
 * Resolve the seven detail fields, strongest source first.
 *
 * 1. a `tool-workflow/stage-detail` payload (the recorder writes none today; when it
 *    does, this is the authoritative source);
 * 2. a coordination block parsed out of the child session's text;
 * 3. "not reported" — the value is absent and the row renders an em dash plus the source
 *    badge, because a blank would read as "nothing happened" rather than "no evidence".
 * @param sources - available sources.
 * @returns one row per field, plus the copyable block when there was one.
 */
export function detailFor(sources: DetailSources = {}): DetailReport {
  const stageDetail = sources.stageDetail === undefined ? undefined : pickDetailFields(sources.stageDetail)
  const coordination = parseCoordinationBlock(sources.coordinationText)
  const fields: DetailField[] = []
  for (const key of DETAIL_FIELDS) {
    const fromEvent = stageDetail === undefined ? undefined : stageDetail[key]
    if (fromEvent !== undefined) {
      fields.push({ key, value: fromEvent, source: 'stage-detail' })
      continue
    }
    const fromBlock = coordination === undefined ? undefined : coordination.fields[key]
    if (fromBlock !== undefined) {
      fields.push({ key, value: fromBlock, source: 'coordination' })
      continue
    }
    fields.push({ key, source: 'not-reported' })
  }
  return {
    fields,
    ...coordination === undefined ? {} : { coordinationRaw: coordination.raw },
  }
}

/**
 * Where one node's detail values actually come from.
 *
 * A view cannot read a child session's text, so the ladder is fed from the only channel
 * that exists in the stream: the run's own `stage-detail` payloads, matched to the node by
 * the phase they name, with a phase-less payload standing in for the whole run. A caller
 * that *can* read a child session passes its own source in `injected`, which wins over the
 * payload for the level it supplies — so wiring a stronger source later needs no UI change.
 * @param track - the derived track (its phase-less payload is the fallback).
 * @param node - the selected node.
 * @param injected - a caller-supplied source, strongest where it speaks.
 * @returns the sources the ladder resolves.
 */
export function detailSourcesOf(
  track: ProgressTrackModel,
  node: ProgressNodeModel,
  injected: DetailSources = {},
): DetailSources {
  const payload = node.stageDetail ?? track.stageDetail
  const stageDetail = injected.stageDetail ?? payload?.fields
  const coordinationText = injected.coordinationText ?? payload?.coordinationText
  return {
    ...stageDetail === undefined ? {} : { stageDetail },
    ...coordinationText === undefined ? {} : { coordinationText },
  }
}

/** Format one duration in milliseconds for the engine-facts section (`1.2 s`, `2 m 3 s`). */
export function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  return `${minutes} m ${rest} s`
}
