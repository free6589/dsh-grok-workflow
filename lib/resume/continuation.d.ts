/**
 * Continuation planning: what a resumed run keeps and what it re-drives.
 *
 * Why this module exists (subagent resume): the restore policy (`./policy.js`)
 * decides from the *journaled* status alone, and a journaled `completed` is
 * retained — but a completed mark can be a false normal when the detector
 * (`./truncation.js`) proves the child was cut off mid-stream. This module
 * joins the two: a truncation verdict reclassifies its task into `interrupted`
 * (re-driven, artifacts kept, never replanned — the work was cut, not wrong),
 * and a `verified`-but-cut task stays `evidence-incomplete` (outputs kept,
 * verification re-run).
 *
 * Rules, in full:
 *
 * - A task with no truncation entry is planned exactly as the restore policy
 *   planned it.
 * - A truncated task is re-driven (`interrupted` + `redrive`), artifacts kept,
 *   unless its status is `gated` (a human decision outranks a stream fact —
 *   retained, nothing re-run) or `evidence-incomplete` (the bridge already
 *   recorded a verified-but-cut task there — reverify, not redrive).
 * - `completed` is never re-run on the policy's word alone; only a `truncated`
 *   verdict with a named kind moves it, and then the summary counts it as a
 *   false normal.
 *
 * The planner is pure and never throws on a missing entry: unknown task ids in
 * the lookup are ignored, and a lookup that is absent (or not a `Map` or a
 * plain record) plans everything as the policy did.
 *
 * @module dsh-grok-workflow/resume-continuation
 */
import type { RestoreAction, RestoredArtifacts, RestorePlan } from './policy.js';
import type { ResumeTaskStatus } from './validator.js';
import type { TruncationKind, TruncationVerdict } from './truncation.js';
/** Per-task truncation verdicts, keyed by task id. */
export type TruncationLookup = ReadonlyMap<string, TruncationVerdict> | Readonly<Record<string, TruncationVerdict>>;
/** One task in a continuation plan. */
export interface ContinuationTask {
    id: string;
    seq: number;
    /** The status the journal recorded. */
    statusBefore: ResumeTaskStatus;
    /** The status the continuation uses (reclassified when truncated). */
    status: ResumeTaskStatus;
    /** What the resumed run does with the task. */
    action: RestoreAction;
    /** True when the task will run again in any form. */
    rerun: boolean;
    /** True for `completed`/`gated`, or any truncated task whose artifacts are kept. */
    retained: boolean;
    /** Artifacts the resumed run carries over. */
    preserve: RestoredArtifacts;
    /** One auditable line: what happened and what happens next. */
    reason: string;
    /** Present exactly when a truncation moved the task. */
    truncation?: {
        kind: TruncationKind;
        detail: string;
    };
}
/** What a resumed run keeps and re-drives. */
export interface ContinuationPlan {
    runId: string;
    tasks: ContinuationTask[];
    /** Task ids the resumed run re-drives, in plan order. */
    reDrive: string[];
    /** Task ids already finished and therefore not re-run, in plan order. */
    alreadyDone: string[];
    /** Task ids that re-run verification, in plan order. */
    reverify: string[];
    /** Task ids handed back to the planner, in plan order. */
    replan: string[];
    /** Action counts over the plan's own decisions. */
    counts: Record<RestoreAction, number>;
}
/** How many truncations reclassified a journaled status. */
export interface ContinuationSummary {
    /** Tasks re-driven because their child was cut off. */
    truncated: number;
    /** Tasks whose journaled `completed` mark was a false normal. */
    falseNormal: number;
    /** Tasks that will run again. */
    rerun: number;
    /** Tasks already finished and therefore not re-run. */
    alreadyDone: number;
}
/**
 * Turn a restore plan into a continuation plan.
 *
 * The inputs are both facts about the same run: the restore decision (from
 * `planRestore`, which is fail-closed on the validated document) and the
 * truncations the host detected at write time, keyed by task id. A task with no
 * entry is planned exactly as the restore policy planned it.
 * @param plan - the restore plan for the validated checkpoint.
 * @param truncations - per-task truncation verdicts, when the host recorded any.
 * @returns The continuation plan; pure, and never throws on a missing entry.
 */
export declare function planContinuation(plan: RestorePlan, truncations?: TruncationLookup): ContinuationPlan;
/**
 * The one-line tally a report can print: how many tasks were cut off, how many
 * finished marks were false normals, how many will run again, and how many will
 * not (because they are already done).
 * @param plan - the continuation plan.
 * @returns Counts over the plan's own decisions.
 */
export declare function summarizeContinuation(plan: ContinuationPlan): ContinuationSummary;
/**
 * Whether a task needs to run again under this plan.
 * @param task - one continuation task.
 * @returns True for `redrive`/`reverify`/`replan`.
 */
export declare function needsContinuation(task: ContinuationTask): boolean;
//# sourceMappingURL=continuation.d.ts.map