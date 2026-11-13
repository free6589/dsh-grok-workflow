/**
 * Resume-checkpoint validator (fail closed).
 *
 * Boundary: pure, synchronous, offline. Validates a restore-candidate document
 * for the workflow resume path — envelope, format version, integrity digest,
 * per-record structure, and cross-record consistency. Every refusal carries a
 * machine-readable `reason` (`version-mismatch` | `corruption` | `conflict`)
 * plus a human-readable `detail`. The restore policy (`./policy.js`) refuses to
 * build a plan from anything this validator did not accept, so a bad checkpoint
 * can never trigger an auto-restore.
 *
 * This module owns the *restore* document contract
 * (`grok-workflow.resume-checkpoint`), whose task states are restore-domain
 * states: completed / interrupted / failed / gated / evidence-incomplete /
 * success. The raw run journal is owned by `src/checkpoint/`; mapping journal
 * states into this contract happens at integration time, outside this module.
 *
 * Classification choices: damaged bytes, torn JSON, wrong envelope, bad digest,
 * and malformed records are `corruption`; a document sealed with a foreign
 * format version is `version-mismatch`; a structurally intact, sealed document
 * whose *claims* are inconsistent with the restore contract (unknown task
 * status, duplicate task id, duplicate seq, wrong run) is `conflict`.
 */
/** Envelope discriminator of the restore document. */
export declare const RESUME_CHECKPOINT_KIND = "grok-workflow.resume-checkpoint";
/** Format version this validator accepts; any other value refuses restore. */
export declare const RESUME_CHECKPOINT_VERSION = 1;
/**
 * Restore-domain task states the validator accepts. `success` is structurally
 * valid but the restore policy never retains it (a self-report is not
 * verification); see `RETAINED_STATUSES` in `./policy.js`.
 */
export declare const RESUME_TASK_STATUSES: readonly ["completed", "interrupted", "failed", "gated", "evidence-incomplete", "success"];
export type ResumeTaskStatus = (typeof RESUME_TASK_STATUSES)[number];
/** Why a checkpoint was refused; every refusal is exactly one of these. */
export type RefusalReason = 'version-mismatch' | 'corruption' | 'conflict';
/** A refusal: restore is denied, with the reason and an explanatory detail. */
export interface ResumeCheckpointRefusal {
    ok: false;
    reason: RefusalReason;
    detail: string;
}
/** One citation a restored task can carry over. */
export interface ResumeEvidence {
    kind: 'file' | 'command' | 'url' | 'other';
    ref: string;
    note?: string;
}
/** One task as recorded at interruption time. */
export interface ResumeTask {
    /** Stable task identity within the run. */
    id: string;
    /** Plan position, >= 1, unique across the run. */
    seq: number;
    title?: string;
    status: ResumeTaskStatus;
    /** 1-based attempt count when the journal recorded retries. */
    attempt?: number;
    /** ISO-8601 timestamp of the last status write. */
    updatedAt?: string;
    /** Artifact locators the task produced (preserved on restore). */
    outputs?: string[];
    /** Files the task wrote (preserved on restore). */
    files?: string[];
    /** Evidence citations backing the status (preserved on restore). */
    evidence?: ResumeEvidence[];
}
/** A sealed restore document. `digest` covers everything else, canonically. */
export interface ResumeCheckpoint {
    kind: typeof RESUME_CHECKPOINT_KIND;
    version: typeof RESUME_CHECKPOINT_VERSION;
    runId: string;
    workflowId?: string;
    /** ISO-8601 timestamp of the last journal write. */
    updatedAt: string;
    tasks: ResumeTask[];
    /** sha256 over `canonicalJson` of the document without `digest`. */
    digest: string;
}
/** The validator accepted the document; restore may proceed to the policy. */
export interface ResumeCheckpointOk {
    ok: true;
    checkpoint: ResumeCheckpoint;
}
export type ValidationResult = ResumeCheckpointOk | ResumeCheckpointRefusal;
/** Extra identity the caller can pin before restore is allowed. */
export interface ResumeCheckpointExpectations {
    /** Refuse with `conflict` when the document belongs to a different run. */
    runId?: string;
}
/** Deterministic JSON: sorted object keys, arrays in order, no whitespace. */
export declare function canonicalJson(value: unknown): string;
/** Digest of an unsealed document body (everything except `digest`). */
export declare function resumeDigest(body: Omit<ResumeCheckpoint, 'digest'>): string;
/** Seal a document body: computes and attaches the integrity digest. */
export declare function sealResumeCheckpoint(body: Omit<ResumeCheckpoint, 'digest'>): ResumeCheckpoint;
/** Build a sealed document in one step (the normal way tests and wiring seal). */
export declare function buildResumeCheckpoint(input: {
    runId: string;
    workflowId?: string;
    updatedAt: string;
    tasks: ResumeTask[];
}): ResumeCheckpoint;
/** Validate a restore-candidate document; refuse means no auto-restore. */
export declare function validateResumeCheckpoint(input: unknown, expected?: ResumeCheckpointExpectations): ValidationResult;
//# sourceMappingURL=validator.d.ts.map