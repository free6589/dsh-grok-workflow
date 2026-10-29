/**
 * Shared workflow-run lifecycle used by both entry points.
 *
 * The tool path (model-initiated) and the mandatory-entry gate (host-initiated)
 * must behave identically: same deadline handling, same active-run cap, same
 * report validation, same redaction, and the same honest failure reporting.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
import type { WorkflowRun } from '@deepseek-ai/dsh-workflow';
import type { DisposeRecord } from './records.js';
import type { NormalizedTask, ResolvedConfig, WorkflowReport } from './types.js';
/** Minimal logger surface used by the runtime modules. */
export interface WorkflowLogger {
    warn(message: string): void;
    /** Diagnostics channel; absent on a logger that only carries warnings. */
    info?(message: string): void;
}
/** Identity and timing of one run, kept so an unload can name what it cancelled. */
export interface ActiveRunInfo {
    runId: string;
    /** Session that owns the run; also the key of the per-session cap (P1-3). */
    sessionId: string;
    /** Session object, so a disposal can write the interrupted run's notice. */
    session?: Session;
    startedAtMs: number;
}
/** Lifetime-scoped state shared by the tool and the gate. */
export interface ActiveState {
    disposed: boolean;
    pending: number;
    /** Epoch milliseconds at which the plugin instance was applied. */
    readonly createdAt: number;
    readonly controller: AbortController;
    readonly runs: Set<WorkflowRun>;
    /** Identity of every live run, keyed by the run the engine handed back. */
    readonly active: Map<WorkflowRun, ActiveRunInfo>;
    /** Admitted-but-not-yet-started runs per session id (the cap counts these too). */
    readonly starting: Map<string, number>;
    /** Set by {@link disposeActiveState}; read by the cancelled exit to name the cause. */
    unloadedAt?: number;
    /**
     * Shutdown signals seen before disposal (t45). Empty means the unload happened
     * inside a live process — a settings toggle, a reload or a test — which is the
     * distinction the dispose record and the notice need.
     */
    signals?: string[];
}
/** Create the lifetime state owned by one plugin instance. */
export declare function createActiveState(): ActiveState;
/** Human-shaped elapsed time for a message a user may read (`14m38s`, `820ms`). */
export declare function formatElapsed(ms: number): string;
/** How many runs (started + starting) one session holds against its cap. */
export declare function activeCountOfSession(state: ActiveState, sessionId: string): number;
/** Short label used in thrown messages and rendered failures. */
export declare function workflowLabel(config: ResolvedConfig): string;
/** Inputs the plugin disposer can offer about how it was reached. */
export interface DisposalContext {
    logger?: WorkflowLogger;
    /** Stack of the disposer call, used for attribution (t45, P0-1). */
    callSite?: string;
}
/**
 * Cancel every live run; called from the plugin disposer.
 *
 * Two obligations that t41 showed were missing (t45, P0):
 *
 * 1. **Be observable.** Before anything is aborted this writes one
 *    `plugin:grok-workflow/dispose` record per affected session (time, uptime,
 *    shutdown signals, trigger class, redacted call site, run count and per-run
 *    elapsed) and one diagnostics line, so "who unloaded the plugin" is answerable
 *    from the log.
 * 2. **Say what it broke, once.** A session whose run is interrupted gets one
 *    user-visible notice; an *idle* unload — what a user does on purpose when
 *    disabling the plugin from the settings surface — stays silent, because a
 *    direct answer is the expected behaviour there and a per-message banner
 *    would be noise.
 *
 * Every write is contained: this runs inside a disposer, where the session
 * service may already be gone, and a refused record must never stop the
 * cancellation that follows it.
 */
export declare function disposeActiveState(state: ActiveState, context?: DisposalContext): Promise<DisposeRecord>;
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
export declare function runWorkflow(options: RunWorkflowOptions): Promise<RunOutcome>;
/**
 * One child call, no plan, no verifier: the answer a chat or fast tier spends.
 *
 * Added in t52 for the front desk (plan C). The cheap tiers must not pay for the
 * full workflow — a greeting that costs a planner, a worker and a verifier is not
 * a greeting — so they run a script of exactly one `agent()` and return its text.
 * The call still goes through the engine rather than through a provider directly,
 * because the engine is what attributes the child to the parent agent, applies
 * the child ceiling and reports `workflow/agent-start` to the progress panel: a
 * side channel would make those three facts untrue for the cheap tiers.
 *
 * The route is `config.triageModel` when set, else the run's own route (`agent()`'s
 * default), which is why an unconfigured front desk costs no extra model.
 */
export interface SingleCallOptions {
    ctx: Context;
    config: ResolvedConfig;
    state: ActiveState;
    logger: WorkflowLogger;
    agent: Agent;
    /** The whole prompt handed to the child. */
    prompt: string;
    /** Label shown for the child in the progress panel and the session log. */
    label: string;
    /** Extra cancellation sources (the gate's step signal). */
    signals?: AbortSignal[];
}
/** Outcome of one front-desk call. */
export type SingleCallOutcome = {
    ok: true;
    text: string;
    retried?: boolean;
} | {
    ok: false;
    reason: string;
};
/**
 * Answer one message with a single child call.
 *
 * Never throws: a provider failure, a deadline or a cancelled turn becomes
 * `{ok: false, reason}`, and the caller states it in the answer instead of
 * silently falling back to a full run (the front desk may not quietly upgrade a
 * "quick" answer into a ten-minute team run).
 * @param options - call request.
 * @returns the text, or why there is none.
 */
export declare function runSingleCall(options: SingleCallOptions): Promise<SingleCallOutcome>;
//# sourceMappingURL=run.d.ts.map