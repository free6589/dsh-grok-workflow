/**
 * The "进度" conversation tab: the pure half.
 *
 * The tab renders the four `tool-workflow/*` session events this plugin's own recorder
 * writes (`src/records.ts`, `createWorkflowProgressRecorder`) as one horizontal track of
 * stage nodes, plus the optional `tool-workflow/stage-detail` payload when a stream carries
 * one. This module is the fold, the state precedence, the percentage and the detail
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
 */

/** The four event types the tab folds; every other type is ignored. */
export const PROGRESS_EVENT_TYPES = [
  'tool-workflow/run-start',
  'tool-workflow/agent-start',
  'tool-workflow/agent-end',
  'tool-workflow/run-end',
] as const

/**
 * The optional detail payload, kept apart from {@link PROGRESS_EVENT_TYPES} on purpose.
 *
 * The state of the track comes from the four events above and from nothing else. This
 * one only ever *adds* field values to a node, so a stream without it renders exactly
 * what it rendered before. `createWorkflowProgressRecorder` does not write it today; the
 * tab reads it so that a recorder (or another bundle) that does write it is used instead
 * of being ignored — the detail ladder's level 1 is a real read path, not a placeholder.
 */
export const PROGRESS_DETAIL_EVENT_TYPE = 'tool-workflow/stage-detail'

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
  /** Level-1 detail payloads the stream carried for this run, in arrival order. */
  details: ProgressStageDetailFact[]
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
 * The five work stages are the phase headers `src/naming.ts` actually emits for a staged
 * delivery job — `规划` / `执行` / `检查` / `汇总` / `回答` (`phaseLabel`: plan, execute,
 * verify, synthesize, answer) — plus one slot for the plan tasks themselves, which the
 * engine announces as `任务 n · 标题` (`taskGroupTitle`) and which land between `执行`
 * and `检查` because that is where the workers run. A stage whose token no recorded
 * phase carries stays `pending` and says it was not reported; a phase that names no
 * stage becomes a node of its own, so the spine never hides a declared phase.
 */
export const PROGRESS_STAGES: readonly ProgressStageDefinition[] = [
  { key: 'start', tokens: [], edge: true },
  { key: 'plan', tokens: ['规划', 'plan'], edge: false },
  { key: 'execute', tokens: ['执行', 'execute'], edge: false },
  { key: 'verify', tokens: ['检查', '核验', 'verify'], edge: false },
  { key: 'synthesize', tokens: ['汇总', 'synthesize'], edge: false },
  { key: 'answer', tokens: ['回答', 'answer'], edge: false },
  { key: 'end', tokens: [], edge: true },
]

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
    if (!isDetail && !(PROGRESS_EVENT_TYPES as readonly string[]).includes(record.type)) continue
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
    const members = draft.order.map((memberSeq) => draft.members.get(memberSeq)).filter((member): member is ProgressMemberFact => member !== undefined)
    runs.push({
      runId: draft.runId,
      name: draft.name,
      anchorSeq: draft.anchorSeq,
      members,
      details: draft.details,
      ...draft.startedAt === undefined ? {} : { startedAt: draft.startedAt },
      ...draft.endedAt === undefined ? {} : { endedAt: draft.endedAt },
      ...draft.stopReason === undefined ? {} : { stopReason: draft.stopReason },
    })
  }
  return runs.sort((left, right) => left.anchorSeq - right.anchorSeq)
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
 * The state of one node, in the precedence the design fixes:
 * `failed` → `doing` → `done` → `blocked` → `cancelled` → `pending`.
 *
 * `blocked` is the only derived state: the run ended (or the engine reported an outcome
 * that is neither a completion nor a cancellation) while a row was still unsettled. The
 * stream cannot say why, so the node says "blocked" and its tooltip names the evidence.
 * @param members - rows aggregated by this node.
 * @param ended - whether `run-end` was seen for the run.
 * @returns the node state.
 */
export function nodeState(members: readonly ProgressMemberFact[], ended: boolean): ProgressState {
  const settled = members.filter((member) => member.outcome !== undefined)
  const unsettled = members.length - settled.length
  if (members.some((member) => member.outcome === 'failed')) return 'failed'
  if (!ended && unsettled > 0) return 'doing'
  if (members.length > 0 && settled.length === members.length && settled.every((member) => member.outcome === 'completed')) return 'done'
  if (ended && unsettled > 0) return 'blocked'
  if (members.some((member) => member.outcome === 'cancelled')) return 'cancelled'
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

/** The first spine stage whose token the phase header carries. */
function stageForPhase(phase: string): ProgressStageDefinition | undefined {
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
  plan: ['规划助手', 'planner'],
  execute: ['执行', 'execute', 'worker'],
  verify: ['检查', '核验', 'verify', 'check', 'verifier'],
  synthesize: ['汇总助手', 'summarize', 'synthesizer'],
  answer: ['回答', 'answer'],
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

/**
 * Derive the track one run renders.
 *
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
  const extras: Array<{ phase: string, members: ProgressMemberFact[] }> = []
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
  const nodes: ProgressNodeModel[] = []
  for (const stage of PROGRESS_STAGES) {
    nodes.push(node(stage, `stage:${stage.key}`, stage.edge ? 'edge' : 'stage', byStage.get(stage.key) ?? [], byStagePhases.get(stage.key) ?? [], undefined, evidenceByStage.get(stage.key) ?? []))
    // Extra phases are real plan tasks (`任务 n · 标题`): the engine announces them while
    // it executes the plan, so they belong between `执行` and `检查` — the template's
    // work slot — in the order the run started them. A row that declared no phase at all
    // still gets a node (empty label = "unphased" copy), so the percentage and the track
    // never count different rows.
    if (stage.key === 'execute') {
      for (const extra of extras) nodes.push(node(undefined, `phase:${extra.phase}`, 'extra', extra.members, [extra.phase], extra.phase))
      if (unphased.length > 0) nodes.push(node(undefined, 'phase:', 'extra', unphased, [], ''))
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
