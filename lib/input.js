/** Invalid user input for a grok_workflow call. */
export class GrokWorkflowInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GrokWorkflowInputError';
    }
}
/**
 * Bounds mirrored by the generated workflow. Caller input is rejected when it
 * exceeds them; the script never silently shortens a caller requirement.
 */
export const TASK_LIMITS = {
    titleChars: 160,
    taskTextChars: 4_000,
    criteriaItems: 20,
    criteriaChars: 1_000,
    constraintItems: 20,
    constraintChars: 1_000,
};
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** Trim a string and reject a non-string, empty, or overlong value. */
function requiredText(value, field, maxChars) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new GrokWorkflowInputError(`${field} must be a non-empty string`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maxChars) {
        throw new GrokWorkflowInputError(`${field} must be at most ${maxChars} characters`);
    }
    return trimmed;
}
/** Trim an optional string field; an explicitly empty string is allowed. */
function stringField(value, field, maxChars) {
    if (typeof value !== 'string') {
        throw new GrokWorkflowInputError(`${field} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maxChars) {
        throw new GrokWorkflowInputError(`${field} must be at most ${maxChars} characters`);
    }
    return trimmed;
}
/** Normalize a bounded string list, dropping blank entries. */
function stringList(value, field, maxItems, maxChars) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        throw new GrokWorkflowInputError(`${field} must be an array of strings`);
    }
    if (value.length > maxItems) {
        throw new GrokWorkflowInputError(`${field} must contain at most ${maxItems} items`);
    }
    return value.map((item, index) => {
        const trimmed = item.trim();
        if (trimmed.length > maxChars) {
            throw new GrokWorkflowInputError(`${field}[${index}] must be at most ${maxChars} characters`);
        }
        return trimmed;
    }).filter(Boolean);
}
/**
 * Validate and normalize caller-supplied tasks before starting a workflow.
 * Caller tasks are explicit input: invalid input rejects instead of silently
 * degrading to a one-task fallback or shortening a requirement.
 */
export function normalizeCallerTasks(tasks, maxTasks) {
    if (tasks === undefined)
        return undefined;
    if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new GrokWorkflowInputError('tasks must be a non-empty array when supplied');
    }
    if (tasks.length > maxTasks) {
        throw new GrokWorkflowInputError(`tasks contains ${tasks.length} entries but maxTasks is ${maxTasks}`);
    }
    const ids = new Set();
    return tasks.map((task, index) => {
        if (typeof task !== 'object' || task === null) {
            throw new GrokWorkflowInputError(`tasks[${index}] must be an object`);
        }
        if ('dependsOn' in task) {
            throw new GrokWorkflowInputError(`tasks[${index}].dependsOn is not supported; MVP tasks must be independent`);
        }
        const id = task.id === undefined
            ? `task-${index + 1}`
            : requiredText(task.id, `tasks[${index}].id`, 64);
        if (!TASK_ID.test(id)) {
            throw new GrokWorkflowInputError(`tasks[${index}].id must match ${TASK_ID.source}`);
        }
        if (ids.has(id))
            throw new GrokWorkflowInputError(`duplicate task id "${id}"`);
        ids.add(id);
        const criteria = stringList(task.acceptanceCriteria, `tasks[${index}].acceptanceCriteria`, TASK_LIMITS.criteriaItems, TASK_LIMITS.criteriaChars);
        if (criteria.length === 0) {
            throw new GrokWorkflowInputError(`tasks[${index}].acceptanceCriteria must contain at least one non-empty item`);
        }
        const constraints = task.constraints === undefined
            ? []
            : stringList(task.constraints, `tasks[${index}].constraints`, TASK_LIMITS.constraintItems, TASK_LIMITS.constraintChars);
        return {
            id,
            title: requiredText(task.title, `tasks[${index}].title`, TASK_LIMITS.titleChars),
            objective: requiredText(task.objective, `tasks[${index}].objective`, TASK_LIMITS.taskTextChars),
            expectedOutput: requiredText(task.expectedOutput, `tasks[${index}].expectedOutput`, TASK_LIMITS.taskTextChars),
            acceptanceCriteria: criteria,
            context: task.context === undefined ? '' : stringField(task.context, `tasks[${index}].context`, TASK_LIMITS.taskTextChars),
            constraints,
        };
    });
}
//# sourceMappingURL=input.js.map