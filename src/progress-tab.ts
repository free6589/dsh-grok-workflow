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
 * (the fold still has to read one, see {@link deriveProgressStory}). A tab that has never
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

/** The five words a run can be described by on the one-page story (the header chip). */
export type ProgressStoryState = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled'

/** Which action the story's dock offers: start it, accept it, or leave the reader alone. */
export type ProgressStoryDock = 'start' | 'accept' | 'quiet'

/** One step of the story's track: a plan task, or one declared call. */
export interface ProgressStoryStep {
  /** Track node key it speaks for (`phase:任务 1 · 标题`), or `seq:<n>` for a call step. */
  key: string
  /** Plan-task position (`progressTaskNumber`); absent when the step is a declared call. */
  number?: number
  /** Plan-task phase header verbatim; a call step carries its role word. */
  title: string
  state: ProgressState
  /** The task's Execute-Check-Review chain; empty for a call step. */
  chain: ProgressChainSlot[]
  members: ProgressMemberFact[]
}

/** One line of the story's history: a declared call, as the stream settled it. */
export interface ProgressStoryLogRow {
  seq: number
  /** Session time of the call's `agent-start`, when the stream carried one. */
  at?: number
  /** The role the line is spoken as: the label without its attempt suffix or shipped mark. */
  role: string
  /** Exact phase header (the plan-task title), or the empty string when it named none. */
  title: string
  state: ProgressState
  /** Set on the one row `summary-final` names: the draft that actually shipped. */
  shipped?: true
}

/**
 * One page of the story, in the three screens the redesign settles on.
 *
 * Everything here is derived from the run facts the fold already produced: no plan, no
 * percentage, no estimate, and no reading of what the run "probably" did. `steps` is the
 * track (one segment per step), `log` is the history under it, and `now` / `attempt` /
 * `rest` are the three sentences above them.
 */
export interface ProgressStory {
  state: ProgressStoryState
  steps: ProgressStoryStep[]
  /** 1-based current step; `0` when the run declared nothing to step through. */
  at: number
  total: number
  /** The headline: the current step's title, or the two states that have no title. */
  now: { titleKey?: 'planning' | 'done'; title: string; role?: string }
  /** Present only while the current step carries a failure nothing later replaced. */
  attempt?: { n: number; retrying: boolean }
  /** The titles of the steps after the current one, consecutive repeats collapsed. */
  rest: string[]
  log: ProgressStoryLogRow[]
  /**
   * What the run handed in: the shipped draft, or the all-rejected verdict.
   *
   * Absent is its own fact — "nothing was recorded" — and it is not the same as a
   * rejection: a run whose gate never judged a draft says exactly as little as one whose
   * recorder never wrote a word.
   */
  final?: ProgressStoryFinal
  dock: ProgressStoryDock
}

/** The two ways a run ends its summary: one draft shipped, or every draft rejected. */
export type ProgressStoryFinal =
  | { kind: 'shipped', draft: number, label: string, row?: ProgressStoryLogRow }
  | { kind: 'rejected', drafts: number, stage: 'check' | 'verify', reason: string }

/**
 * The state of one declared call: the row-level half of {@link nodeState}.
 *
 * A row is the smallest thing the stream settles, so its own state is its outcome and
 * nothing else — an unsettled row is `doing` (`正在看`), and an outcome that is neither a
 * completion, a cancellation nor a failure stays `blocked` rather than being renamed.
 * @param member - one folded row.
 * @returns the row's own state.
 */
function rowState(member: ProgressMemberFact): ProgressState {
  if (member.outcome === undefined) return 'doing'
  if (member.outcome === 'completed') return 'done'
  if (member.outcome === 'cancelled') return 'cancelled'
  if (member.outcome === 'failed') return 'failed'
  return 'blocked'
}

/**
 * The attempt number a label carries (`执行（尝试 2）` → 2, `执行` → 1).
 * @param label - a recorded row label.
 * @returns the 1-based attempt the label names.
 */
function attemptNumberOf(label: string | undefined): number {
  const text = typeof label === 'string' ? label.trim() : ''
  const match = /[（(][^（()）]*?(\d+)[^（()）]*[)）]$/u.exec(text)
  if (match === null) return 1
  const value = Number(match[1])
  return Number.isInteger(value) && value > 0 ? value : 1
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
 * The role a log line is spoken as: `执行（尝试 2）` → `执行`, `汇总·第2稿（定稿）` → `汇总·第2稿`.
 * @param member - one folded row.
 * @returns the role word, without the retry suffix or the shipped mark.
 */
function storyRoleOf(member: ProgressMemberFact): string {
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
 * Derive the one-page story for one run (the pure half of the redesign, §19.2).
 *
 * Three screens out of the same facts the track already reads:
 *
 * - **waiting** — the run is open and no call was declared; the page says it is planning,
 *   and the track is empty because there is nothing to step through yet;
 * - **running / failed / cancelled** — one step per declared thing, the current step
 *   chosen by `doing` → `failed` → first unfinished → the last step;
 * - **done** — every declared row passed, so the headline stops naming a step.
 *
 * A step is a **plan task** when the run declared any (`任务 n · 标题`, not the guardian
 * card): those are the units a reader waits for. A run that planned nothing (a triage or
 * single-call run) steps through its declared calls instead, so the track's length is
 * always what the stream announced and never a plan nobody wrote down.
 *
 * @param run - folded run facts.
 * @returns the story model.
 */
export function deriveProgressStory(run: ProgressRunFacts): ProgressStory {
  const ended = run.stopReason !== undefined
  const declared = run.members.length
  const state: ProgressStoryState = !ended
    ? (declared === 0 ? 'waiting' : 'running')
    : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
  const track = deriveTrack(run)
  // A plan task is a numbered extra node: the guardian call is a node of its own and not
  // a step of the plan, so it stays in the history where its own card can speak for it.
  const planNodes = track.nodes.filter(
    (node): node is ProgressNodeModel & { taskNumber: number } =>
      node.kind === 'extra' && node.taskNumber !== undefined && node.guardian !== true,
  )
  const steps: ProgressStoryStep[] = planNodes.length > 0
    ? planNodes.map((node) => ({
        key: node.key,
        number: node.taskNumber,
        title: node.label,
        state: node.state,
        chain: node.chain ?? [],
        members: node.members,
      }))
    // A run that planned nothing steps through its **work legs**: the calls that do, check
    // and review the work. The planner and the synthesizer are the run's own two ends — one
    // writes the plan, one writes the answer — so they are not things to do, and counting
    // them as steps shipped 「第 1 步，共 1 步：要干的 1 件事 · 规划 在做」 on a real run
    // (§19.9). They keep their history lines; they take no step.
    //
    // The leg is read off the row's **label**, never its phase: a phase names the task, and
    // the role word is what says which leg ran (`执行` / `检查` / `复核`, the same words the
    // chain uses). A call step's own `seq` is its identity, because two calls can share one
    // leg (`规划（第1次）` and `规划（第2次）`), so a node key would repeat.
    : [...run.members]
        .filter((member) => chainStageForLabel(member.label) !== undefined)
        .sort((left, right) => left.seq - right.seq)
        .map((member) => ({
          key: `seq:${member.seq}`,
          title: storyRoleOf(member),
          state: rowState(member),
          chain: [],
          members: [member],
        }))
  const total = steps.length
  const firstOf = (predicate: (step: ProgressStoryStep) => boolean): number => {
    const index = steps.findIndex(predicate)
    return index === -1 ? -1 : index + 1
  }
  const doing = firstOf((step) => step.state === 'doing')
  const failed = firstOf((step) => step.state === 'failed')
  const open = firstOf((step) => step.state !== 'done')
  const at = total === 0 ? 0 : doing !== -1 ? doing : failed !== -1 ? failed : open !== -1 ? open : total
  const current = at === 0 ? undefined : steps[at - 1]
  // The headline: a finished run says so, and a run with no step to name says it is still
  // turning the ask into steps — waiting, running or broken, there is nothing else to say.
  const now: ProgressStory['now'] = state === 'done'
    ? { titleKey: 'done', title: '' }
    : current === undefined
      ? { titleKey: 'planning', title: '' }
      : { title: current.title }
  if (state === 'running') {
    // The line a reader is waiting on: the current step's own open call, or — when the
    // current step is finished under a still-open run — the run's first unsettled one.
    const running = (current?.members ?? []).find((member) => member.outcome === undefined)
      ?? run.members.find((member) => member.outcome === undefined)
    if (running !== undefined) now.role = storyRoleOf(running)
  }
  let attempt: ProgressStory['attempt']
  if (current !== undefined) {
    const recovered = recoveredFailureSeqs(current.members)
    const broken = current.members.find((member) => member.outcome === 'failed' && !recovered.has(member.seq))
    if (broken !== undefined) {
      const unit = attemptUnitOf(broken)
      let n = 1
      for (const member of current.members) {
        if (attemptUnitOf(member) !== unit) continue
        n = Math.max(n, attemptNumberOf(member.label))
      }
      attempt = { n, retrying: !ended }
    }
  }
  const rest: string[] = []
  for (const step of steps.slice(at)) {
    if (rest[rest.length - 1] === step.title) continue
    rest.push(step.title)
  }
  const shipped = run.summaryFinalDraft === undefined ? undefined : shippedDraftRow(run.members, run.summaryFinalDraft)
  const log: ProgressStoryLogRow[] = [...run.members]
    .sort((left, right) => left.seq - right.seq)
    .map((member): ProgressStoryLogRow => ({
      seq: member.seq,
      ...member.startedAt === undefined ? {} : { at: member.startedAt },
      role: storyRoleOf(member),
      title: member.phase ?? '',
      state: rowState(member),
      ...member === shipped ? { shipped: true as const } : {},
    }))
  const shippedLine = log.find((row) => shipped !== undefined && row.seq === shipped.seq)
  // A shipped draft wins over a rejected claim: the recorder never writes both (a run
  // either handed one draft in or it did not), but a hand-written stream could, and the
  // card must not deny a draft the run really shipped. With no shipped draft recorded,
  // the rejection verdict is the only thing this run can say about its summary.
  const final: ProgressStoryFinal | undefined = run.summaryFinalDraft === undefined
    ? run.summaryRejected === undefined
      ? undefined
      : { kind: 'rejected', drafts: run.summaryRejected.drafts, stage: run.summaryRejected.stage, reason: run.summaryRejected.reason }
    : shippedLine === undefined
      ? undefined
      : { kind: 'shipped', draft: run.summaryFinalDraft, label: shippedLine.title, row: shippedLine }
  const dock: ProgressStoryDock = state === 'waiting' ? 'start' : state === 'done' ? 'accept' : 'quiet'
  return {
    state,
    steps,
    at,
    total,
    now,
    ...attempt === undefined ? {} : { attempt },
    rest,
    log,
    ...final === undefined ? {} : { final },
    dock,
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
