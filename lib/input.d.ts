import type { NormalizedTask, TaskInput } from './types.js';
/** Invalid user input for a grok_workflow call. */
export declare class GrokWorkflowInputError extends Error {
    constructor(message: string);
}
/**
 * Bounds mirrored by the generated workflow. Caller input is rejected when it
 * exceeds them; the script never silently shortens a caller requirement.
 */
export declare const TASK_LIMITS: {
    readonly titleChars: 160;
    readonly taskTextChars: 4000;
    readonly criteriaItems: 20;
    readonly criteriaChars: 1000;
    readonly constraintItems: 20;
    readonly constraintChars: 1000;
};
/**
 * Validate and normalize caller-supplied tasks before starting a workflow.
 * Caller tasks are explicit input: invalid input rejects instead of silently
 * degrading to a one-task fallback or shortening a requirement.
 */
export declare function normalizeCallerTasks(tasks: readonly TaskInput[] | undefined, maxTasks: number): NormalizedTask[] | undefined;
//# sourceMappingURL=input.d.ts.map