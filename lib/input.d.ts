import type { NormalizedTask, TaskInput } from './types.js';
/** Invalid user input for a grok_workflow call. */
export declare class GrokWorkflowInputError extends Error {
    constructor(message: string);
}
/**
 * Validate and normalize caller-supplied tasks before starting a workflow.
 * Caller tasks are explicit input: invalid input rejects instead of silently
 * degrading to a one-task fallback.
 */
export declare function normalizeCallerTasks(tasks: readonly TaskInput[] | undefined, maxTasks: number): NormalizedTask[] | undefined;
//# sourceMappingURL=input.d.ts.map