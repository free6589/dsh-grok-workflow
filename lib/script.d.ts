import type { NormalizedTask, ResolvedConfig } from './types.js';
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
    };
    maxTotalAgents: number;
}
/** Calculate the hard child cap for a run, including planner/worker/verifier attempts. */
export declare function maxTotalAgentsFor(tasks: number, retries: number): number;
/** Build the static script and data-only arguments for one run. */
export declare function buildWorkflowRequest(objective: string, tasks: NormalizedTask[] | undefined, config: ResolvedConfig): WorkflowRequestPayload;
//# sourceMappingURL=script.d.ts.map