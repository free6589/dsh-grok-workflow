/**
 * Versioned checkpoint schema for workflow runs.
 *
 * A checkpoint is a bounded, verifiable snapshot of one workflow run: what was
 * asked (run/plan), what ran (tasks/agents/stages), what was proven (evidence),
 * where it ran (git), when (time), and the smallest context a fresh agent needs
 * to resume it (min-context). The writer in `./writer.js` turns a checkpoint
 * into one atomic, checksummed JSON file; this module owns the data contract.
 *
 * Integration points (documented engine hooks, read-only from this module):
 *
 * - Run identity and watchdog state come from the run lifecycle in
 *   `src/run.ts` (`ActiveRunInfo`, the t47 deadline watchdog) and the plugin
 *   disposal path (`ActiveState.unloadedAt`, shutdown signals).
 * - Task/agent rows mirror the report structures in `src/types.ts`
 *   (`TaskReport`, `RouteTrailEntry`, `ConfirmedEvidence`) so a checkpoint can
 *   be built from a `WorkflowReport` without reinterpreting anything.
 * - The run itself is started through `ctx.workflowEngine.start` (see
 *   `docs/ARCHITECTURE.md` §16) and child work is created through the engine's
 *   `agent()` hook; stage rows are meant to be recorded from those lifecycle
 *   events by a later integration task. This module never calls the engine.
 *
 * Limits policy: the checkpoint *records* whatever limits a run actually used
 * (structural sanity only), because the schema must stay writable for every
 * configuration the plugin accepts today. The documented engine-hook contract
 * — default concurrency 3, hard maximum 6; retries default 1, hard maximum 3
 * (AGENTS.md "Architecture invariants") — is pinned in
 * {@link ENGINE_HOOK_LIMITS} and checked by {@link limitContractViolations}.
 * Observed code currently defaults `maxConcurrency` to 4 and `maxRetries` to 2
 * (src/config.ts); that divergence is recorded here as data, not silently
 * reconciled by the schema.
 *
 * Secrets: every free-text field passes through `redactSecrets` at build time
 * (see `src/redact.ts`). Field-level wholesale redaction (`redactDeep`) is
 * deliberately NOT used because it would blank structural fields such as
 * `sessionId` whose *names* look sensitive; only free text carries untrusted
 * content in this schema.
 */
import type { RoleName } from '../types.js';
/** Schema version written into every checkpoint and checked on read. */
export declare const CHECKPOINT_VERSION = "grok-workflow.checkpoint/v1";
/**
 * Hard ceilings for checkpoint fields. They bound the file so a noisy run
 * cannot grow a checkpoint without limit, and the reader refuses anything
 * larger than {@link CHECKPOINT_LIMITS.maxBytes} before parsing it.
 */
export declare const CHECKPOINT_LIMITS: {
    /** Maximum whole-file size accepted by writer and reader. */
    readonly maxBytes: 1048576;
    /** Maximum characters of the run objective and the min-context objective. */
    readonly objectiveChars: 4000;
    /** Maximum characters of a cancel/cause line. */
    readonly causeChars: 600;
    /** Maximum characters of a task title. */
    readonly titleChars: 600;
    /** Maximum characters of an error or failure reason. */
    readonly errorChars: 1000;
    /** Maximum characters of one acceptance criterion. */
    readonly criterionChars: 600;
    /** Maximum characters of one evidence claim. */
    readonly claimChars: 1000;
    /** Maximum characters of one evidence locator. */
    readonly locatorChars: 400;
    /** Maximum characters of the min-context digest (carry-over scale, src/carryover.ts). */
    readonly digestChars: 12000;
    /** Maximum characters of a git branch name. */
    readonly branchChars: 200;
    /** Maximum characters of a run id and a session id. */
    readonly idChars: 120;
    /** Maximum characters of a route label. */
    readonly routeChars: 200;
    /** Maximum rows in the min-context digest per section. */
    readonly digestRows: 64;
    /** Maximum declared write paths per plan task (mirrors WRITE_PATH_LIMITS.items). */
    readonly writesPathItems: 16;
    /** Maximum characters of one declared write path (mirrors WRITE_PATH_LIMITS.chars). */
    readonly writesPathChars: 300;
    /** Maximum plan tasks and task-state rows. */
    readonly maxTasks: 128;
    /** Maximum agent-call rows. */
    readonly maxAgents: 512;
    /** Maximum stage rows. */
    readonly maxStages: 16;
    /** Maximum evidence rows. */
    readonly maxEvidence: 1024;
    /** Maximum recorded attempts per task (config ceiling is 10 retries + 1). */
    readonly attemptsCeiling: 16;
    /** Structural ceiling for recorded limit numbers (matches config's 1e6 backstop). */
    readonly countCeiling: 1000000;
    /**
     * Structural ceiling for millisecond durations and timeouts. Mirrors
     * HARD_LIMITS.timeoutMs (604,800,000 = 7 days) in src/config.ts, so a
     * checkpoint can record any timeout the plugin itself accepts.
     */
    readonly msCeiling: 604800000;
};
/**
 * The documented engine-hook contract for run limits (AGENTS.md architecture
 * invariants; the task brief repeats it verbatim). Recorded limits that stay
 * inside this envelope are flagged compliant by {@link limitContractViolations};
 * values outside it are still recorded, never rejected, so the checkpoint
 * always tells the truth about the run.
 */
export declare const ENGINE_HOOK_LIMITS: {
    readonly maxConcurrency: {
        readonly default: 3;
        readonly max: 6;
    };
    readonly maxRetries: {
        readonly default: 1;
        readonly max: 3;
    };
};
/** Run/stage status. `cancelled` covers caller cancel and plugin unload (t14). */
export type CheckpointStatus = 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
/** Task status. The first two are in-flight states, the rest are terminal. */
export type CheckpointTaskStatus = 'pending' | 'running' | 'verified' | 'failed' | 'cancelled';
/** Where a plan came from (mirrors `PlanReport.source` in src/types.ts). */
export type CheckpointPlanSource = 'caller' | 'planner' | 'fallback' | 'unavailable';
declare const PHASE_NAMES: readonly ["plan", "execute", "verify", "synthesize", "answer"];
export type CheckpointPhase = (typeof PHASE_NAMES)[number];
/** One run identity. Mirrors `ActiveRunInfo` in src/run.ts. */
export interface CheckpointRun {
    runId: string;
    sessionId?: string;
    objective: string;
    status: CheckpointStatus;
    cause?: string;
}
/** One planned task, echoed for audit (mirrors `TaskReport.writesPaths`). */
export interface CheckpointPlanTask {
    id: string;
    title: string;
    /** Normalized declared write paths; `null` = the plan did not say (U-4). */
    writesPaths: string[] | null;
}
export interface CheckpointPlan {
    source: CheckpointPlanSource;
    taskCount: number;
    tasks: CheckpointPlanTask[];
}
export interface CheckpointTask {
    id: string;
    title: string;
    status: CheckpointTaskStatus;
    /** Attempt count so far (1 = initial attempt only). */
    attempts: number;
    error?: string;
}
/** One recorded child call (mirrors `RouteTrailEntry` in src/types.ts). */
export interface CheckpointAgent {
    role: RoleName;
    outcome: 'ok' | 'failed';
    taskId?: string;
    attempt?: number;
    route?: string;
    failureClass?: string;
    reason?: string;
    startedAtMs?: number;
    durationMs?: number;
}
export interface CheckpointStage {
    phase: CheckpointPhase;
    status: CheckpointStatus;
    startedAtMs?: number;
    endedAtMs?: number;
    error?: string;
}
/** One evidence row (mirrors `ConfirmedEvidence`, plus a locator). */
export interface CheckpointEvidence {
    taskId: string;
    criterion: string;
    claim: string;
    locator?: string;
}
export interface CheckpointGit {
    branch?: string;
    /** Commit sha, 7–64 hex characters. */
    head?: string;
    dirty: boolean;
    ahead?: number;
    behind?: number;
}
export interface CheckpointTime {
    startedAtMs: number;
    updatedAtMs: number;
    durationMs?: number;
    deadlineAtMs?: number;
}
/**
 * Minimal context to resume the run. `auto` digests are compiled by
 * {@link buildMinContextDigest}; `caller` digests are supplied by the caller
 * and only redacted and bounded here.
 */
export interface CheckpointMinContext {
    objective: string;
    digest: string;
    source: 'auto' | 'caller';
}
export interface CheckpointLimits {
    maxConcurrency: number;
    maxRetries: number;
    maxTasks: number;
    timeoutMs?: number;
}
/** Watchdog state from the run lifecycle (deadline timer, cancellation). */
export interface CheckpointWatchdog {
    deadlineHit: boolean;
    cancelled: boolean;
    deadlineMs?: number;
    cancelReason?: string;
}
export interface CheckpointIntegrity {
    algorithm: 'sha256';
    checksum: string;
    /** Byte length of the canonical payload the checksum covers. */
    bytes: number;
}
/** A complete checkpoint. `integrity` is added by {@link sealCheckpoint}. */
export interface WorkflowCheckpoint {
    version: typeof CHECKPOINT_VERSION;
    run: CheckpointRun;
    plan: CheckpointPlan;
    tasks: CheckpointTask[];
    agents: CheckpointAgent[];
    stages: CheckpointStage[];
    evidence: CheckpointEvidence[];
    git: CheckpointGit;
    time: CheckpointTime;
    minContext: CheckpointMinContext;
    limits: CheckpointLimits;
    watchdog: CheckpointWatchdog;
    integrity?: CheckpointIntegrity;
}
/** Build-time input. Absent sections get safe defaults; text is redacted and bounded. */
export interface CheckpointInput {
    run: {
        runId: string;
        objective: string;
        status: CheckpointStatus;
        sessionId?: string;
        cause?: string;
    };
    plan: {
        source: CheckpointPlanSource;
        tasks: {
            id: string;
            title: string;
            writesPaths?: unknown;
        }[];
    };
    tasks?: {
        id: string;
        title: string;
        status: CheckpointTaskStatus;
        attempts: number;
        error?: string;
    }[];
    agents?: {
        role: RoleName;
        outcome: 'ok' | 'failed';
        taskId?: string;
        attempt?: number;
        route?: string;
        failureClass?: string;
        reason?: string;
        startedAtMs?: number;
        durationMs?: number;
    }[];
    stages?: {
        phase: CheckpointPhase;
        status: CheckpointStatus;
        startedAtMs?: number;
        endedAtMs?: number;
        error?: string;
    }[];
    evidence?: {
        taskId: string;
        criterion: string;
        claim: string;
        locator?: string;
    }[];
    git?: {
        branch?: string;
        head?: string;
        dirty: boolean;
        ahead?: number;
        behind?: number;
    };
    time?: {
        startedAtMs?: number;
        updatedAtMs?: number;
        durationMs?: number;
        deadlineAtMs?: number;
    };
    minContext?: {
        objective?: string;
        digest: string;
    };
    limits?: {
        maxConcurrency: number;
        maxRetries: number;
        maxTasks: number;
        timeoutMs?: number;
    };
    watchdog?: {
        deadlineHit?: boolean;
        cancelled?: boolean;
        deadlineMs?: number;
        cancelReason?: string;
    };
}
/** Why a checkpoint operation failed. `reason` drives test and caller branching. */
export declare class CheckpointError extends Error {
    readonly reason: 'invalid' | 'too-large' | 'integrity' | 'io';
    constructor(reason: CheckpointError['reason'], message: string);
}
/**
 * Deterministic JSON: object keys sorted, `undefined` fields dropped, arrays
 * in order. The checksum is computed over this form, so two structurally
 * equal checkpoints always produce the same bytes regardless of key insertion
 * order or property presence of `undefined` placeholders.
 */
export declare function canonicalJson(value: unknown): string;
/** Copy of the checkpoint without the `integrity` field. */
export declare function stripIntegrity(checkpoint: WorkflowCheckpoint): WorkflowCheckpoint;
/**
 * Compute and attach the integrity record. Throws `too-large` when the
 * canonical payload alone already exceeds {@link CHECKPOINT_LIMITS.maxBytes}.
 */
export declare function sealCheckpoint(checkpoint: WorkflowCheckpoint): WorkflowCheckpoint;
/**
 * Recompute the checksum over the canonical payload and compare it with the
 * stored integrity record. Pure; the file reader wraps this with IO errors.
 */
export declare function verifyCheckpointIntegrity(checkpoint: WorkflowCheckpoint): {
    ok: boolean;
    detail?: string;
};
/**
 * Compile the smallest context a fresh agent needs to resume the run:
 * objective, plan state, confirmed evidence, and open/uncertain rows. Pure and
 * deterministic — no clock, no randomness — and bounded by
 * {@link CHECKPOINT_LIMITS.digestChars} with an explicit truncation marker.
 */
export declare function buildMinContextDigest(input: {
    objective: string;
    tasks: readonly {
        id: string;
        title: string;
        status: CheckpointTaskStatus;
    }[];
    evidence?: readonly {
        taskId: string;
        criterion: string;
        claim: string;
    }[];
    open?: readonly string[];
    uncertain?: readonly string[];
}): string;
/** Build a validated, redacted, bounded checkpoint (without integrity). */
export declare function buildCheckpoint(input: CheckpointInput, now?: number): WorkflowCheckpoint;
/**
 * Validate an unknown value as a checkpoint. Used by the file reader after
 * JSON.parse; it never repairs anything — a field over its bound means the
 * file was not written by this module, and the read fails.
 */
export declare function assertCheckpoint(value: unknown): WorkflowCheckpoint;
/**
 * Compare recorded limits against the documented engine-hook contract
 * ({@link ENGINE_HOOK_LIMITS}). Returns one human-readable violation per
 * out-of-envelope value; an empty list means the run matched the contract.
 * This never throws and never blocks a write — it is a reporting aid.
 */
export declare function limitContractViolations(limits: Pick<CheckpointLimits, 'maxConcurrency' | 'maxRetries'>): string[];
export {};
//# sourceMappingURL=schema.d.ts.map