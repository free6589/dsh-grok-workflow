/** Invalid user input for a grok_workflow call. */
export class GrokWorkflowInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GrokWorkflowInputError';
    }
}
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** Trim a string and reject a non-string or empty value. */
function requiredText(value, field) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new GrokWorkflowInputError(`${field} must be a non-empty string`);
    }
    return value.trim();
}
/** Trim an optional string field; an explicitly empty string is allowed. */
function stringField(value, field) {
    if (typeof value !== 'string') {
        throw new GrokWorkflowInputError(`${field} must be a string`);
    }
    return value.trim();
}
/** Normalize a string list, dropping blank entries. */
function stringList(value, field) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        throw new GrokWorkflowInputError(`${field} must be an array of strings`);
    }
    return value.map(item => item.trim()).filter(Boolean);
}
/**
 * Validate and normalize caller-supplied tasks before starting a workflow.
 * Caller tasks are explicit input: invalid input rejects instead of silently
 * degrading to a one-task fallback.
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
            : requiredText(task.id, `tasks[${index}].id`);
        if (!TASK_ID.test(id)) {
            throw new GrokWorkflowInputError(`tasks[${index}].id must match ${TASK_ID.source}`);
        }
        if (ids.has(id))
            throw new GrokWorkflowInputError(`duplicate task id "${id}"`);
        ids.add(id);
        const criteria = stringList(task.acceptanceCriteria, `tasks[${index}].acceptanceCriteria`);
        if (criteria.length === 0) {
            throw new GrokWorkflowInputError(`tasks[${index}].acceptanceCriteria must contain at least one non-empty item`);
        }
        const constraints = task.constraints === undefined
            ? []
            : stringList(task.constraints, `tasks[${index}].constraints`);
        return {
            id,
            title: requiredText(task.title, `tasks[${index}].title`),
            objective: requiredText(task.objective, `tasks[${index}].objective`),
            expectedOutput: requiredText(task.expectedOutput, `tasks[${index}].expectedOutput`),
            acceptanceCriteria: criteria,
            context: task.context === undefined ? '' : stringField(task.context, `tasks[${index}].context`),
            constraints,
        };
    });
}
//# sourceMappingURL=input.js.map