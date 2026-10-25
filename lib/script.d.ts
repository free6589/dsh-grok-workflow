import type { FailureClass, ModelRoute, NormalizedTask, ResolvedConfig, RoleName, SynthesisMode } from './types.js';
/**
 * The orchestration script is static. User data crosses the workflow boundary as
 * `args` JSON, never as source text; this keeps the sandbox contract explicit
 * and makes the script reviewable and testable outside a model call.
 */
export declare const WORKFLOW_SCRIPT: string;
/** One complete workflow-start request payload. */
export interface WorkflowRequestPayload {
    script: string;
    meta: {
        name: string;
        description: string;
        phases: {
            title: string;
            detail: string;
        }[];
    };
    args: {
        objective: string;
        tasks: NormalizedTask[] | null;
        maxConcurrency: number;
        maxRetries: number;
        maxTasks: number;
        maxTotalAgents: number;
        roles: Record<RoleName, ModelRoute[]>;
        synthesis: SynthesisMode;
        /** Failure classes that advance a role's chain; empty = built-in policy. */
        switchOn: FailureClass[];
    };
    maxTotalAgents: number;
}
/** Child calls one role may charge, derived from its configured chain. */
export interface RouteBudget {
    /** Calls the planner may make (1 when it inherits the route). */
    planner: number;
    /** Worker calls per task attempt. */
    worker: number;
    /** Verifier calls per task attempt. */
    verifier: number;
    /** Synthesizer calls per run (0 when synthesis is deterministic). */
    synthesizer: number;
}
/** Derive the per-run call budget from the configured chains. */
export declare function routeBudgetFor(config: ResolvedConfig): RouteBudget;
/**
 * Calculate the hard child cap for a run.
 *
 * Chains multiply the per-attempt cost, so the cap must be derived from the
 * effective routes; a cap that only counts attempts would abort a run mid-flight
 * with AGENT_CAP as soon as a fallback route is used.
 */
export declare function maxTotalAgentsFor(tasks: number, retries: number, budget?: RouteBudget): number;
/** Build the static script and data-only arguments for one run. */
export declare function buildWorkflowRequest(objective: string, tasks: NormalizedTask[] | undefined, config: ResolvedConfig): WorkflowRequestPayload;
//# sourceMappingURL=script.d.ts.map