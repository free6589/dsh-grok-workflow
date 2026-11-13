/**
 * Safe restore policy for resume checkpoints.
 *
 * The policy turns a *validated* checkpoint into a restore plan. It is the only
 * place that decides what a task's journaled state means for restore, and it is
 * deliberately conservative:
 *
 * - The five journaled work states are **retained**: completed, interrupted,
 *   failed, gated, evidence-incomplete. Retention preserves the task's outputs,
 *   files and evidence verbatim — restore never re-runs completed work and
 *   never throws away what an interrupted or failed attempt already produced.
 * - A bare `success` mark is **never retained**. Success is a self-report, not
 *   verified evidence; a restored run must re-earn it, so the task is queued
 *   for replan with nothing preserved from the claim.
 *
 * Composition with the validator is fail closed: `evaluateResumeCheckpoint`
 * refuses (and never returns a plan) whenever the validator refuses, so a
 * version mismatch, corruption, or conflict can never trigger an auto-restore.
 */
import type { ResumeCheckpointOk, ResumeEvidence, ResumeTaskStatus, RefusalReason, ResumeCheckpointExpectations } from './validator.js';
/**
 * The journaled states the policy retains across restore. Exactly these five —
 * a `success` mark is deliberately absent.
 */
export declare const RETAINED_STATUSES: ReadonlySet<ResumeTaskStatus>;
/** What the restore does with one task. */
export type RestoreAction = 
/** Keep the task as-is; nothing is re-run (completed, gated). */
'retain'
/** Keep the mark and re-drive the work (interrupted). */
 | 'redrive'
/** Keep outputs/files, re-run verification (evidence-incomplete). */
 | 'reverify'
/** Keep the mark and hand the task back to the planner (failed, success). */
 | 'replan';
/** Artifacts carried over for one task; empty when nothing is trusted. */
export interface RestoredArtifacts {
    outputs: string[];
    files: string[];
    evidence: ResumeEvidence[];
}
/** The restore decision for one task, in seq order of the plan. */
export interface TaskRestoreDecision {
    id: string;
    seq: number;
    status: ResumeTaskStatus;
    action: RestoreAction;
    /** True for exactly the states in `RETAINED_STATUSES`. */
    retained: boolean;
    preserve: RestoredArtifacts;
    reason: string;
}
/** A complete, executable restore plan for a validated checkpoint. */
export interface RestorePlan {
    runId: string;
    restorable: true;
    /** True when any task needs planner work before the run can complete. */
    replanRequired: boolean;
    /** Task ids whose action is `replan` or `reverify`, in plan order. */
    replanTaskIds: string[];
    counts: Record<RestoreAction, number>;
    tasks: TaskRestoreDecision[];
}
/** Restore is denied; no plan exists. */
export interface RestoreRefusal {
    restorable: false;
    reason: RefusalReason;
    detail: string;
}
export type RestoreDecision = {
    restorable: true;
    plan: RestorePlan;
} | RestoreRefusal;
/** Plan the restore of a *validated* checkpoint. */
export declare function planRestore(validated: ResumeCheckpointOk): RestorePlan;
/**
 * Validate and plan in one fail-closed step. Whenever the validator refuses,
 * the result is a refusal with the validator's reason — never a plan.
 */
export declare function evaluateResumeCheckpoint(input: unknown, expected?: ResumeCheckpointExpectations): RestoreDecision;
//# sourceMappingURL=policy.d.ts.map