/**
 * Shared workflow-run lifecycle used by both entry points.
 *
 * The tool path (model-initiated) and the mandatory-entry gate (host-initiated)
 * must behave identically: same deadline handling, same active-run cap, same
 * report validation, same redaction, and the same honest failure reporting.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { WorkflowRun } from '@deepseek-ai/dsh-workflow';
import type { NormalizedTask, ResolvedConfig, WorkflowReport } from './types.js';
/** Minimal logger surface used by the runtime modules. */
export interface WorkflowLogger {
    warn(message: string): void;
}
/** Lifetime-scoped state shared by the tool and the gate. */
export interface ActiveState {
    disposed: boolean;
    pending: number;
    readonly controller: AbortController;
    readonly runs: Set<WorkflowRun>;
}
/** Create the lifetime state owned by one plugin instance. */
export declare function createActiveState(): ActiveState;
/** Short label used in thrown messages and rendered failures. */
export declare function workflowLabel(config: ResolvedConfig): string;
/** Cancel every live run; called from the plugin disposer. */
export declare function disposeActiveState(state: ActiveState): Promise<void>;
/** A combined signal plus the hook that releases its listeners. */
export interface CombinedSignal {
    signal: AbortSignal;
    dispose: () => void;
}
/**
 * Combine signals without depending on `AbortSignal.any` availability.
 *
 * The manual path registers one listener per source, so it also returns a
 * disposer: a long-lived plugin controller would otherwise accumulate a listener
 * per run and eventually trip the EventEmitter warning.
 */
export declare function anySignal(signals: AbortSignal[]): CombinedSignal;
/** Inputs for one workflow run. */
export interface RunWorkflowOptions {
    ctx: Context;
    config: ResolvedConfig;
    state: ActiveState;
    logger: WorkflowLogger;
    /** Agent that owns the run; it is the engine's parent and result surface. */
    agent: Agent;
    /** Fully composed objective (already redacted by the caller). */
    objective: string;
    /** Optional caller-supplied plan. */
    callerTasks?: NormalizedTask[];
    /** Extra cancellation sources (the tool's exec signal, or the gate's own). */
    signals?: AbortSignal[];
    /**
     * How non-timeout failures leave this function: the tool contract throws so a
     * caller sees an error, while the gate converts every failure into an explicit
     * failure report that it can show the user.
     */
    failureMode?: 'throw' | 'report';
}
/** Outcome of one run attempt: a validated report, or an explicit failure report. */
export interface RunOutcome {
    report: WorkflowReport;
    /** True when the run produced a validated `completed`/`partial` report. */
    ok: boolean;
    /** Failure cause for logs and record keeping, when `ok` is false. */
    cause?: string;
}
/**
 * Start one workflow run and resolve with a report. Throws only for conditions
 * the caller can classify (busy/unavailable); engine failures become an explicit
 * failure report so that no caller can silently answer without the workflow.
 */
export declare function runWorkflow(options: RunWorkflowOptions): Promise<RunOutcome>;
//# sourceMappingURL=run.d.ts.map