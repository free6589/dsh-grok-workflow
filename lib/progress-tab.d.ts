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
 * - `failed` is a *current* failure. Attempts are rows, so a task that failed attempt 1 and
 *   verified on attempt 2 carries both rows; the later completion replaces the earlier
 *   failure for the aggregate (card, segment, bar) while the failed row keeps its own mark
 *   (`recoveredFailureSeqs`). Red therefore means "still broken now", never "was broken".
 */
/** The seven progress and Guardian lifecycle events the tab folds; other events are ignored. */
export declare const PROGRESS_EVENT_TYPES: readonly ["tool-workflow/run-start", "tool-workflow/agent-start", "tool-workflow/agent-end", "tool-workflow/guardian-start", "tool-workflow/guardian-finding", "tool-workflow/guardian-end", "tool-workflow/run-end"];
/**
 * The optional detail payload, kept apart from {@link PROGRESS_EVENT_TYPES} on purpose.
 *
 * Track state comes from progress lifecycle events; Guardian findings only populate its side lane. This
 * one only ever *adds* field values to a node, so a stream without it renders exactly
 * what it rendered before. `createWorkflowProgressRecorder` does not write it today; the
 * tab reads it so that a recorder (or another bundle) that does write it is used instead
 * of being ignored — the detail ladder's level 1 is a real read path, not a placeholder.
 */
export declare const PROGRESS_DETAIL_EVENT_TYPE = "tool-workflow/stage-detail";
/** Registered conversation target of the progress view (namespaced so a collision throws). */
export declare const PROGRESS_VIEW_TARGET = "grok-progress";
/** Conversation node kind owned by the tab (namespaced for the same reason). */
export declare const PROGRESS_NODE_KIND = "grok-progress-run";
/** The five states the track colours; `cancelled` reuses the blocked colour. */
export type ProgressState = 'pending' | 'doing' | 'done' | 'blocked' | 'cancelled' | 'failed';
/** Where one detail field's value came from. */
export type DetailSource = 'stage-detail' | 'coordination' | 'not-reported';
/** The seven fields an AGENTS.md coordination block reports, in render order. */
export declare const DETAIL_FIELDS: readonly ["workCommit", "changes", "testsRun", "results", "localRuntimeVerified", "blockers", "nextAction"];
/** One of {@link DETAIL_FIELDS}. */
export type DetailFieldKey = (typeof DETAIL_FIELDS)[number];
/** One recorded `tool-workflow/*` event, in the shape a session reader gets it back. */
export interface ProgressEventRecord {
    readonly type: string;
    /** Session sequence number of the enclosing event, when known. */
    readonly seq?: number;
    /** Session time (epoch ms) of the enclosing event, when known. */
    readonly time?: number;
    readonly data: Readonly<Record<string, unknown>>;
}
/** One declared child call, with whatever settlement the stream carried. */
export interface ProgressMemberFact {
    /** Engine sequence number inside the run; the settlement key. */
    seq: number;
    /** Label recorded on `agent-start` (`执行`, `检查`, `任务 1 · …`). */
    label: string;
    /** Exact phase header recorded on `agent-start`, when the call declared one. */
    phase?: string;
    /** Child session the call opened. */
    childId: string;
    /** Arrival order of the `agent-start`, used to keep plan order stable. */
    order: number;
    /** Session time of the start event, when known. */
    startedAt?: number;
    /** Session time of the settlement, when known. */
    endedAt?: number;
    /** Engine outcome (`completed` / `failed` / `cancelled` / …); absent while running. */
    outcome?: string;
}
/** A liveness intervention recorded by the Guardian (not a task-quality verdict). */
export interface ProgressGuardianFindingFact {
    seq: number;
    label: string;
    signal: 'timeout' | 'heartbeat-loss';
    action: 'cancel-run' | 'rescue' | 'observe';
    reason: string;
    atMs?: number;
}
/** The monitor's recorded lifecycle for one workflow run. */
export interface ProgressGuardianFacts {
    started: boolean;
    armed: boolean;
    budgetMs: number;
    ended: boolean;
    cancelled: boolean;
    findings: ProgressGuardianFindingFact[];
}
/** One run as the stream describes it. */
export interface ProgressRunFacts {
    runId: string;
    /** Run title from `run-start` (`任务团队`, `任务团队 · 3 个任务`). */
    name: string;
    /** Lowest session seq this run touched; the multi-run ordering key. */
    anchorSeq: number;
    /** Session time of `run-start`, when known. */
    startedAt?: number;
    /** Session time of `run-end`, when known. */
    endedAt?: number;
    /** Engine stop reason from `run-end`; absent while the run is open. */
    stopReason?: string;
    members: ProgressMemberFact[];
    /** Guardian liveness state, present only when this build recorded it. */
    guardian?: ProgressGuardianFacts;
    /** Level-1 detail payloads the stream carried for this run, in arrival order. */
    details: ProgressStageDetailFact[];
}
/** One spine stage of the track, in render order. */
export interface ProgressStageDefinition {
    /** Copy key suffix; also the stage identity in the model. */
    key: string;
    /**
     * Words that bind a recorded phase to this stage.
     *
     * A CJK token matches anywhere (`规划` is a word on its own). A token with Latin
     * letters matches **whole words only**, because a substring test reads `ui` inside
     * `build`, `tag` inside `stage`/`target` and `sync` inside `async` — the three false
     * hits measured on real phase headers.
     */
    tokens: readonly string[];
    /** The two ends of the track: process marks, never work. */
    edge: boolean;
}
/**
 * The track's fixed spine: this engine's own phases, in the order it runs them.
 *
 * The four work stages are the phase headers `src/naming.ts` actually emits for a staged
 * delivery job — `规划` / `执行` / `检查` / `汇总` (`phaseLabel`: plan, execute,
 * verify, synthesize) — plus one slot for the plan tasks themselves, which the
 * engine announces as `任务 n · 标题` (`taskGroupTitle`) and which land between `执行`
 * and `检查` because that is where the workers run. The final answer is delivered by
 * the gate (`relayText` in the turn's own message), never as a workflow child call,
 * so no `回答` event can ever reach this track — the spine does not list a stage no
 * event can fill. A stage whose token no recorded phase carries stays `pending` and
 * says it was not reported; a phase that names no stage becomes a node of its own, so
 * the spine never hides a declared phase.
 */
export declare const PROGRESS_STAGES: readonly ProgressStageDefinition[];
/** One capsule of the fixed chain a plan-task card shows. */
export interface ProgressChainStageDefinition {
    key: 'execute' | 'check' | 'review';
    /** Role labels (`naming.ts` `memberLabel`) that fill this capsule. */
    tokens: readonly string[];
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
export declare const PROGRESS_CHAIN: readonly ProgressChainStageDefinition[];
/** One rendered capsule of a plan-task card's fixed chain. */
export interface ProgressChainSlot {
    key: ProgressChainStageDefinition['key'];
    /** Rows of the card that fill this capsule, in plan order (more than one on a retry). */
    members: ProgressMemberFact[];
    /** The capsule's aggregate state; `pending` when no row reached it. */
    state: ProgressState;
    /** Whether at least one row reached the capsule (false is the dashed pending look). */
    reached: boolean;
}
/** One `tool-workflow/stage-detail` payload, as the stream carried it. */
export interface ProgressStageDetailFact {
    /** Phase header the payload names, when it names one. */
    phase?: string;
    /** The fields it carries, already folded to canonical keys. */
    fields: Partial<Record<DetailFieldKey, string>>;
    /** Exact coordination text it carried (a fenced or labelled block), when it carried one. */
    coordinationText?: string;
}
/** One rendered node of the track. */
export interface ProgressNodeModel {
    /** Stable render key (`stage:plan`, `phase:任务 2 · …`). */
    key: string;
    kind: 'edge' | 'stage' | 'extra';
    /** Copy key suffix for spine nodes; the recorded phase header for extra nodes. */
    label: string;
    state: ProgressState;
    /** Rows behind this node, in plan order. */
    members: ProgressMemberFact[];
    /**
     * Rows that ran under this stage and are rendered as their own plan-task nodes.
     *
     * A cross-reference, never a second home: `members` stays the one place a row is
     * counted, so the track and the percentage cannot disagree. It exists because the
     * engine records the plan-task group title (`任务 1 · 标题`) as a worker's `phase`, so
     * matching rows by phase alone left `执行` and `检查` — the two stages every run
     * performs — empty and "not reported".
     */
    evidence: ProgressMemberFact[];
    /** Exact phase headers aggregated here (empty for an unmatched spine stage). */
    phases: string[];
    /** Whether the state was derived from the run's end rather than from a settlement. */
    derived: boolean;
    /** Tooltip copy key suffix explaining a derived state (only for `blocked`). */
    reason?: 'runEndedUnsettled' | 'outcomeUnsettled';
    /** Level-1 detail payload for this node, when the stream carried one for its phase. */
    stageDetail?: ProgressStageDetailFact;
    /** Plan-task position the phase header names (`任务 3 · 标题` → 3); absent when it names none. */
    taskNumber?: number;
    /** Set for the guardian adjudication card, which is a call of its own, not a plan task. */
    guardian?: true;
    /**
     * The fixed Execute-Check-Review chain of a plan-task card, in render order.
     *
     * Absent on a stage segment and on the guardian card: neither is a plan task, so neither
     * has a worker → verifier → supervisor chain to show.
     */
    chain?: ProgressChainSlot[];
}
/** Rows settled over rows declared; the tab's only percentage. */
export interface ProgressPercent {
    settled: number;
    declared: number;
    /** `settled / declared * 100`, rounded to an integer; absent when `declared` is 0. */
    value?: number;
}
/** The whole track for one run. */
export interface ProgressTrackModel {
    runId: string;
    name: string;
    /** Whether `run-end` was seen. */
    ended: boolean;
    stopReason?: string;
    nodes: ProgressNodeModel[];
    percent?: ProgressPercent;
    /** Level-1 payload that named no phase: the run-level fallback for any node. */
    stageDetail?: ProgressStageDetailFact;
}
/** Options for {@link deriveTrack}. */
export interface DeriveOptions {
    /**
     * Copy resolver for spine nodes. The default keeps the key itself, so a caller that
     * forgets it renders an identifier rather than inventing a language.
     */
    labelFor?: (stageKey: string) => string;
}
/** One resolved detail field. */
export interface DetailField {
    key: DetailFieldKey;
    /** Normalized text, absent when not reported at any level. */
    value?: string;
    source: DetailSource;
}
/** The detail popover's stage section. */
export interface DetailReport {
    fields: DetailField[];
    /** Exact coordination-block body, when one was parsed (the copy button's payload). */
    coordinationRaw?: string;
}
/** A parsed coordination block: whichever of the seven fields it carried. */
export interface CoordinationBlock {
    fields: Partial<Record<DetailFieldKey, string>>;
    /** Exact block body, preserved for the copy action. */
    raw: string;
}
/** Inputs the detail resolver may draw on, weakest last. */
export interface DetailSources {
    /** A `tool-workflow/stage-detail` payload, when such an event exists in the session. */
    readonly stageDetail?: Readonly<Record<string, unknown>>;
    /** Child-session text that may contain a fenced coordination block. */
    readonly coordinationText?: string;
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
export declare function foldProgressRuns(records: readonly ProgressEventRecord[]): ProgressRunFacts[];
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
export declare function selectActiveRun(runs: readonly ProgressRunFacts[]): ProgressRunFacts | undefined;
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
export declare function recoveredFailureSeqs(members: readonly ProgressMemberFact[]): Set<number>;
/**
 * How many of a node's rows are failing *now* — recovered history excluded.
 *
 * This is the count the red badge shows. The failure badge names work that is still
 * broken; a failure a later attempt replaced is visible on its own row pill, which is
 * the row-level trace the card keeps.
 * @param members - rows aggregated by one node.
 * @returns the number of unrecovered failed rows.
 */
export declare function currentFailureCount(members: readonly ProgressMemberFact[]): number;
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
export declare function nodeState(members: readonly ProgressMemberFact[], ended: boolean): ProgressState;
/**
 * Rows settled over rows declared.
 * @param members - any set of declared rows.
 * @returns the percentage, absent when nothing was declared.
 */
export declare function percentOf(members: readonly ProgressMemberFact[]): ProgressPercent | undefined;
/** The first spine stage whose token the phase header carries.
 *
 * Numbered plan tasks (`任务 7 · 标题`) always win over stage tokens: a title that
 * mentions a stage word (`任务 7 · 合并为干净可并发执行计划`) names a plan task,
 * not the `执行` stage. Without this, the extra task lands as a stage row under
 * `规划`.
 */
export declare function stageForPhase(phase: string): ProgressStageDefinition | undefined;
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
export declare function chainOf(members: readonly ProgressMemberFact[], ended: boolean): ProgressChainSlot[];
/**
 * The plan-task position a phase header names (`任务 3 · 标题` → 3, `Task 10 · x` → 10).
 *
 * This is the number the engine puts in `taskGroupTitle`, read back as a number so that
 * `任务 10` sorts after `任务 2` instead of before it.
 * @param phase - the recorded phase header.
 * @returns the position, or undefined when the header names none.
 */
export declare function taskNumberIn(phase: string | undefined): number | undefined;
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
export declare function isGuardianCard(text: string | undefined): boolean;
/** One task-band card before it becomes a node: the phase it was recorded under and its rows. */
export interface ProgressTaskCardDraft {
    phase: string;
    members: ProgressMemberFact[];
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
export declare function orderTaskCards<T extends ProgressTaskCardDraft>(cards: readonly T[]): T[];
/**
 * Derive the track one run renders.
 * Every recorded phase is either aggregated into the spine stage it names or appended as
 * a node of its own. The spine therefore never hides a phase, and a template stage with
 * no recorded phase stays `pending` rather than borrowing a neighbour's state.
 * @param run - folded run facts.
 * @param options - copy resolver for spine labels.
 * @returns the track model.
 */
export declare function deriveTrack(run: ProgressRunFacts, options?: DeriveOptions): ProgressTrackModel;
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
export declare function parseCoordinationBlock(text: string | undefined): CoordinationBlock | undefined;
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
export declare function detailFor(sources?: DetailSources): DetailReport;
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
export declare function detailSourcesOf(track: ProgressTrackModel, node: ProgressNodeModel, injected?: DetailSources): DetailSources;
/** Format one duration in milliseconds for the engine-facts section (`1.2 s`, `2 m 3 s`). */
export declare function formatDuration(ms: number | undefined): string | undefined;
//# sourceMappingURL=progress-tab.d.ts.map