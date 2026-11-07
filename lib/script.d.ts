import type { NamingLanguage } from './naming.js';
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
        /** The deadline the plugin enforces for this run (0 = unknown/legacy). */
        timeoutMs: number;
        roles: Record<RoleName, ModelRoute[]>;
        synthesis: SynthesisMode;
        /** Failure classes that advance a role's chain; empty = built-in policy. */
        switchOn: FailureClass[];
        /** Copy language for every user-visible progress string (Issue #22 P1-3). */
        naming: {
            language: NamingLanguage;
        };
        /**
         * Compiled earlier rounds of this session (v0.5), already bounded and
         * redacted by `src/carryover.ts`. Absent on a first round.
         */
        carryover?: string;
        /**
         * Cross-run hint (C1, approximate): route labels other live runs
         * configured, snapshotted host-side at admission. Absent/empty on a
         * first or solitary run, which keeps the payload identical to before.
         */
        busyRoutes?: string[];
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
export declare function buildWorkflowRequest(objective: string, tasks: NormalizedTask[] | undefined, config: ResolvedConfig, namingLanguage?: NamingLanguage, carryover?: string, busyRoutes?: string[]): WorkflowRequestPayload;
//# sourceMappingURL=script.d.ts.map