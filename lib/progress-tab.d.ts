/**
 * The "进度" conversation tab: the pure half.
 *
 * The tab renders the four `tool-workflow/*` session events this plugin's own recorder
 * writes (`src/records.ts`, `createWorkflowProgressRecorder`) as one horizontal track of
 * stage nodes. This module is the fold, the state precedence, the percentage and the
 * detail provenance, with no React, no DOM, no clock and no estimate, so every rule the
 * browser half applies can be tested here; `src/client/index.js` carries the same rules
 * as hand-written JavaScript (the host serves that bundle verbatim, so it cannot import
 * this file) and `test/client.spec.ts` pins the two apart from drifting.
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
export declare const PROGRESS_EVENT_TYPES: readonly ["tool-workflow/run-start", "tool-workflow/agent-start", "tool-workflow/agent-end", "tool-workflow/run-end"];
/** Registered conversation target of the progress view (namespaced so a collision throws). */
export declare const PROGRESS_VIEW_TARGET = "grok-progress";
/** Conversation node kind owned by the tab (namespaced for the same reason). */
export declare const PROGRESS_NODE_KIND = "grok-progress-run";
/** `localStorage` key holding the reader's zoom factor. */
export declare const PROGRESS_ZOOM_STORAGE_KEY = "dsh.gw.progress.zoom";
/** The five states the track colours; `cancelled` reuses the blocked colour. */
export type ProgressState = 'pending' | 'doing' | 'done' | 'blocked' | 'cancelled' | 'failed';
/** Where one detail field's value came from. */
export type DetailSource = 'stage-detail' | 'coordination' | 'not-reported';
/** The seven fields a settled stage reports, in render order. */
export declare const DETAIL_FIELDS: readonly ["files", "commands", "result", "evidence", "risks", "next", "owner"];
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
}
/** One spine stage of the track, in render order. */
export interface ProgressStageDefinition {
    /** Copy key suffix; also the stage identity in the model. */
    key: string;
    /** Case-insensitive substrings that bind a recorded phase to this stage. */
    tokens: readonly string[];
    /** The two ends of the track: process marks, never work. */
    edge: boolean;
}
/**
 * The track's fixed spine.
 *
 * It is the process template of a staged delivery job, not a claim about a run: a stage
 * whose token no recorded phase carries stays `pending` and its tooltip says it was not
 * reported. Recorded phases that match no token become real nodes of their own
 * ({@link ProgressNodeModel.kind} `extra`), so a run that does not follow the template
 * still shows every phase it declared.
 */
export declare const PROGRESS_STAGES: readonly ProgressStageDefinition[];
/** One rendered node of the track. */
export interface ProgressNodeModel {
    /** Stable render key (`stage:fix`, `phase:任务 2 · …`). */
    key: string;
    kind: 'edge' | 'stage' | 'extra';
    /** Copy key suffix for spine nodes; the recorded phase header for extra nodes. */
    label: string;
    state: ProgressState;
    /** Rows behind this node, in plan order. */
    members: ProgressMemberFact[];
    /** Exact phase headers aggregated here (empty for an unmatched spine stage). */
    phases: string[];
    /** Whether the state was derived from the run's end rather than from a settlement. */
    derived: boolean;
    /** Tooltip copy key suffix explaining a derived state (only for `blocked`). */
    reason?: 'runEndedUnsettled' | 'outcomeUnsettled';
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
export declare function nodeState(members: readonly ProgressMemberFact[], ended: boolean): ProgressState;
/**
 * Rows settled over rows declared.
 * @param members - any set of declared rows.
 * @returns the percentage, absent when nothing was declared.
 */
export declare function percentOf(members: readonly ProgressMemberFact[]): ProgressPercent | undefined;
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
export declare function deriveTrack(run: ProgressRunFacts, options?: DeriveOptions): ProgressTrackModel;
/**
 * Parse a coordination block out of a child session's text.
 *
 * Only an explicit block is accepted: a fenced ` ```grok-coordination ` block, or a
 * fenced `json` block whose object carries a `coordination` object or at least two of the
 * seven known fields. Anything else is not a report, and the caller falls through to
 * "not reported" — the tab never treats prose as structured data.
 * @param text - child-session text that may contain a block.
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
/** Format one duration in milliseconds for the engine-facts section (`1.2 s`, `2 m 3 s`). */
export declare function formatDuration(ms: number | undefined): string | undefined;
//# sourceMappingURL=progress-tab.d.ts.map