/**
 * Bridge: a run checkpoint becomes a sealed resume document.
 *
 * Why this module exists (subagent resume): the raw run journal
 * (`src/checkpoint/`) records what the *run* did — `verified`, `failed`,
 * `pending`, `running`, `cancelled` — while the restore policy speaks the
 * *restore* contract (`completed`, `interrupted`, `failed`, `gated`,
 * `evidence-incomplete`, `success`). A cut run must cross that boundary as
 * `interrupted` — the state the policy re-drives — never as `failed`, which
 * the policy hands back to the planner. Without the bridge, a stream cut is
 * misfiled as planner business and never re-driven.
 *
 * The status table, in full:
 *
 * - `verified` + no cut → `completed` (retained, never re-run).
 * - `verified` + cut → `evidence-incomplete` (artifacts kept, verification
 *   re-run — the work verified but its tail was cut).
 * - `failed` + cut → `interrupted` (re-driven, never replanned — the failure
 *   line is a cut line, not a judgement).
 * - any unfinished status + cut → `interrupted` (a cut run is continued, not
 *   judged).
 * - `failed` without a cut → `failed` (the planner's business, as before).
 * - any other unfinished status without a cut → `interrupted` (the run never
 *   finished the task).
 *
 * The bridge seals through `buildResumeCheckpoint`, so the document it returns
 * is ready for `validateResumeCheckpoint`: digest gate, version gate and
 * conflict gate all still apply. A checkpoint with no task rows seals to a
 * valid but empty document — the policy then plans nothing, which is the
 * honest answer for a run that never got a plan.
 *
 * @module dsh-grok-workflow/resume-bridge
 */
import type { CheckpointTaskStatus, WorkflowCheckpoint } from '../checkpoint/schema.js';
import type { TruncationLookup } from './continuation.js';
import type { ResumeCheckpoint, ResumeEvidence, ResumeTaskStatus } from './validator.js';
/** Artifacts the caller watched a task produce (the checkpoint does not record them). */
export interface TaskArtifacts {
    outputs?: string[];
    files?: string[];
    evidence?: ResumeEvidence[];
}
export interface BridgeOptions {
    /** Clock override for the document's `updatedAt` (epoch ms). */
    now?: number;
    /** Workflow identity; defaults to the run's durable `name`, when it has one. */
    workflowId?: string;
    /** Per-task truncation verdicts (keyed by task id). */
    truncations?: TruncationLookup;
    /** Per-task artifacts the host observed; merged with the checkpoint's evidence rows. */
    artifacts?: Readonly<Record<string, TaskArtifacts>>;
}
/** Why a task got the status it got (for a log line, not for the document). */
export type BridgedStatusReason = 'verified-work' | 'cut-work' | 'cut-and-verified' | 'unfinished-work';
/**
 * The restore status one run-checkpoint task maps to.
 *
 * - `verified` + no cut → `completed` (retained, never re-run).
 * - `verified` + cut → `evidence-incomplete` (artifacts kept, verification re-run).
 * - `failed` + cut → `interrupted` (re-driven, never replanned).
 * - any unfinished status → `interrupted` (a cut run is continued, not judged).
 * - `failed` without a cut → `failed` (the planner's business, as before).
 * @param status - the run checkpoint's task status.
 * @param truncated - whether the child behind the task was cut off.
 * @returns The restore status.
 */
export declare function resumeStatusFor(status: CheckpointTaskStatus, truncated: boolean): ResumeTaskStatus;
/** Why a task got the status it got (for a log line, not for the document). */
export declare function bridgeReasonFor(status: CheckpointTaskStatus, truncated: boolean): BridgedStatusReason;
/**
 * Build a sealed restore document from a run checkpoint.
 *
 * The task order is the checkpoint's own order, numbered from 1, because the
 * restore policy sorts by `seq` and reads it as the plan position. A checkpoint
 * with no task rows produces a valid but empty document — the policy then plans
 * nothing, which is the honest answer for a run that never got a plan.
 * @param checkpoint - a verified run checkpoint.
 * @param options - clock, identity, truncations and observed artifacts.
 * @returns The sealed resume document, ready for `validateResumeCheckpoint`.
 */
export declare function resumeCheckpointFromRun(checkpoint: WorkflowCheckpoint, options?: BridgeOptions): ResumeCheckpoint;
//# sourceMappingURL=bridge.d.ts.map