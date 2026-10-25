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
    readonly objectiveChars: 4000;
    readonly titleChars: 160;
    readonly taskTextChars: 4000;
    readonly criteriaItems: 20;
    readonly criteriaChars: 1000;
    readonly constraintItems: 20;
    readonly constraintChars: 1000;
    readonly aggregateChars: 48000;
};
/**
 * Comparison key for one acceptance criterion.
 *
 * Verification compares a verifier's criterion text against the task's own
 * criterion text. A byte-exact comparison turns a formatting difference (a
 * trailing period, collapsed spacing, or a different case) into a failed
 * attempt, so a correct result burns every retry and is finally reported as
 * failed. The key removes exactly those formatting differences and nothing
 * else: the requirement's words must still match, so distinct criteria stay
 * distinct.
 *
 * Mirrored by `criterionKey` in the generated workflow script; keep both in
 * sync (test/criterion.spec.ts asserts the parity).
 */
export declare function criterionKey(value: string): string;
/**
 * Validate and normalize caller-supplied tasks before starting a workflow.
 * Caller tasks are explicit input: invalid input rejects instead of silently
 * degrading to a one-task fallback or shortening a requirement.
 */
export declare function normalizeCallerTasks(tasks: readonly TaskInput[] | undefined, maxTasks: number): NormalizedTask[] | undefined;
//# sourceMappingURL=input.d.ts.map