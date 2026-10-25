import { criterionKey } from './input.js';
import { maxTotalAgentsFor, routeBudgetFor } from './script.js';
const STATUSES = ['completed', 'partial', 'failed'];
const MAX_RENDER_CHARS = 8_000;
function record(value, path) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`workflow result ${path} must be an object`);
    }
    return value;
}
function array(value, path) {
    if (!Array.isArray(value))
        throw new Error(`workflow result ${path} must be an array`);
    return value;
}
function string(value, path) {
    if (typeof value !== 'string')
        throw new Error(`workflow result ${path} must be a string`);
    return value;
}
function number(value, path) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error(`workflow result ${path} must be an integer`);
    }
    return value;
}
function sameStrings(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
const EXECUTION_STATUSES = ['completed', 'partial', 'failed'];
const COMMAND_STATUSES = ['passed', 'failed', 'not_run'];
const VERDICTS = ['pass', 'fail'];
const CONFIDENCES = ['high', 'medium', 'low'];
function boolean(value, path) {
    if (typeof value !== 'boolean')
        throw new Error(`workflow result ${path} must be a boolean`);
    return value;
}
/**
 * A closed-union string field. The generated script normalizes an out-of-union
 * model answer to a safe default (`status: 'partial'`, `confidence: 'low'`,
 * command `status: 'not_run'`), so those defaults are the only legal fallbacks
 * and any other value means the report was not produced by this plugin.
 */
function enumeration(value, allowed, path) {
    const text = string(value, path);
    if (!allowed.includes(text)) {
        throw new Error(`workflow result ${path} must be one of ${allowed.join('/')} (got "${text}")`);
    }
    return text;
}
function stringList(value, path) {
    return array(value, path).map((item, index) => string(item, `${path}[${index}]`));
}
function commandRuns(value, path) {
    return array(value, path).map((item, index) => {
        const entry = record(item, `${path}[${index}]`);
        return {
            command: string(entry.command, `${path}[${index}].command`),
            status: enumeration(entry.status, COMMAND_STATUSES, `${path}[${index}].status`),
            detail: string(entry.detail, `${path}[${index}].detail`),
        };
    });
}
/** Deep-validate one attempt's executor payload instead of trusting its shape. */
function executionResult(value, path) {
    const root = record(value, path);
    return {
        summary: string(root.summary, `${path}.summary`),
        status: enumeration(root.status, EXECUTION_STATUSES, `${path}.status`),
        deliverables: array(root.deliverables, `${path}.deliverables`).map((item, index) => {
            const entry = record(item, `${path}.deliverables[${index}]`);
            return {
                description: string(entry.description, `${path}.deliverables[${index}].description`),
                locator: string(entry.locator, `${path}.deliverables[${index}].locator`),
            };
        }),
        evidence: array(root.evidence, `${path}.evidence`).map((item, index) => {
            const entry = record(item, `${path}.evidence[${index}]`);
            return {
                claim: string(entry.claim, `${path}.evidence[${index}].claim`),
                source: string(entry.source, `${path}.evidence[${index}].source`),
            };
        }),
        testsRun: commandRuns(root.testsRun, `${path}.testsRun`),
        filesChanged: stringList(root.filesChanged, `${path}.filesChanged`),
        uncertainties: stringList(root.uncertainties, `${path}.uncertainties`),
    };
}
/** Deep-validate one attempt's verifier payload; `verdict` is a closed union. */
function verificationResult(value, path) {
    const root = record(value, path);
    return {
        verdict: enumeration(root.verdict, VERDICTS, `${path}.verdict`),
        criteria: array(root.criteria, `${path}.criteria`).map((item, index) => {
            const entry = record(item, `${path}.criteria[${index}]`);
            return {
                criterion: string(entry.criterion, `${path}.criteria[${index}].criterion`),
                met: boolean(entry.met, `${path}.criteria[${index}].met`),
                evidence: string(entry.evidence, `${path}.criteria[${index}].evidence`),
            };
        }),
        checkedEvidence: array(root.checkedEvidence, `${path}.checkedEvidence`).map((item, index) => {
            const entry = record(item, `${path}.checkedEvidence[${index}]`);
            return {
                kind: string(entry.kind, `${path}.checkedEvidence[${index}].kind`),
                locator: string(entry.locator, `${path}.checkedEvidence[${index}].locator`),
                finding: string(entry.finding, `${path}.checkedEvidence[${index}].finding`),
            };
        }),
        commandsRun: commandRuns(root.commandsRun, `${path}.commandsRun`),
        issues: stringList(root.issues, `${path}.issues`),
        confidence: enumeration(root.confidence, CONFIDENCES, `${path}.confidence`),
    };
}
/**
 * Enforce the report contract before a script result reaches the model.
 * The script is trusted code, but a malformed engine result must not be
 * presented as a successful workflow.
 */
const ROLE_NAMES = ['planner', 'worker', 'verifier', 'synthesizer'];
const FAILURE_CLASSES = [
    'rate-limit',
    'server-error',
    'connection',
    'timeout',
    'model-unavailable',
    'format-error',
    'task-failed',
    'verification-failed',
    'agent-start-failed',
    'budget-exhausted',
    'unknown',
];
function attemptFailure(value, path) {
    const entry = record(value, path);
    return {
        class: enumeration(entry.class, FAILURE_CLASSES, `${path}.class`),
        reason: string(entry.reason ?? '', `${path}.reason`),
    };
}
function routeTrail(value, path, max) {
    return array(value, path).slice(0, max).map((item, index) => {
        const entry = record(item, `${path}[${index}]`);
        const outcome = string(entry.outcome, `${path}[${index}].outcome`);
        if (outcome !== 'ok' && outcome !== 'failed') {
            throw new Error(`workflow result ${path}[${index}].outcome must be "ok" or "failed"`);
        }
        return {
            role: enumeration(entry.role, ROLE_NAMES, `${path}[${index}].role`),
            chainIndex: number(entry.chainIndex, `${path}[${index}].chainIndex`),
            route: string(entry.route, `${path}[${index}].route`),
            attempt: number(entry.attempt, `${path}[${index}].attempt`),
            outcome,
            ...entry.failureClass === undefined ? {} : { failureClass: enumeration(entry.failureClass, FAILURE_CLASSES, `${path}[${index}].failureClass`) },
            ...entry.reason === undefined ? {} : { reason: string(entry.reason, `${path}[${index}].reason`) },
        };
    });
}
function routeLabels(value, path) {
    const root = record(value, path);
    const out = {};
    for (const role of ROLE_NAMES) {
        out[role] = stringList(root[role] ?? [], `${path}.${role}`);
    }
    return out;
}
export function assertWorkflowReport(value, objective, config) {
    const root = record(value, 'root');
    if (root.schemaVersion !== 'grok-workflow/v1') {
        throw new Error('workflow result has an unsupported schemaVersion');
    }
    const status = string(root.status, 'status');
    if (!STATUSES.includes(status)) {
        throw new Error(`workflow result has invalid status "${status}"`);
    }
    if (string(root.objective, 'objective') !== objective) {
        throw new Error('workflow result objective does not match the request objective');
    }
    const plan = record(root.plan, 'plan');
    const source = string(plan.source, 'plan.source');
    if (!['caller', 'planner', 'fallback', 'unavailable'].includes(source)) {
        throw new Error(`workflow result has invalid plan.source "${source}"`);
    }
    const planTasks = array(plan.tasks, 'plan.tasks').map((item, index) => {
        const task = record(item, `plan.tasks[${index}]`);
        return {
            id: string(task.id, `plan.tasks[${index}].id`),
            title: string(task.title, `plan.tasks[${index}].title`),
            objective: string(task.objective, `plan.tasks[${index}].objective`),
            expectedOutput: string(task.expectedOutput, `plan.tasks[${index}].expectedOutput`),
            acceptanceCriteria: array(task.acceptanceCriteria, `plan.tasks[${index}].acceptanceCriteria`)
                .map((criterion, c) => string(criterion, `plan.tasks[${index}].acceptanceCriteria[${c}]`)),
            context: string(task.context, `plan.tasks[${index}].context`),
            constraints: array(task.constraints, `plan.tasks[${index}].constraints`)
                .map((constraint, c) => string(constraint, `plan.tasks[${index}].constraints[${c}]`)),
        };
    });
    const tasks = array(root.tasks, 'tasks').map((item, index) => {
        const task = record(item, `tasks[${index}]`);
        const taskStatus = string(task.status, `tasks[${index}].status`);
        if (taskStatus !== 'verified' && taskStatus !== 'failed') {
            throw new Error(`workflow result has invalid tasks[${index}].status "${taskStatus}"`);
        }
        return {
            id: string(task.id, `tasks[${index}].id`),
            title: string(task.title, `tasks[${index}].title`),
            objective: string(task.objective, `tasks[${index}].objective`),
            expectedOutput: string(task.expectedOutput, `tasks[${index}].expectedOutput`),
            acceptanceCriteria: array(task.acceptanceCriteria, `tasks[${index}].acceptanceCriteria`)
                .map((criterion, c) => string(criterion, `tasks[${index}].acceptanceCriteria[${c}]`)),
            context: string(task.context, `tasks[${index}].context`),
            constraints: array(task.constraints, `tasks[${index}].constraints`)
                .map((constraint, c) => string(constraint, `tasks[${index}].constraints[${c}]`)),
            status: taskStatus,
            attempts: array(task.attempts, `tasks[${index}].attempts`).map((attempt, a) => {
                const entry = record(attempt, `tasks[${index}].attempts[${a}]`);
                return {
                    attempt: number(entry.attempt, `tasks[${index}].attempts[${a}].attempt`),
                    execution: entry.execution === null ? null : executionResult(entry.execution, `tasks[${index}].attempts[${a}].execution`),
                    verification: entry.verification === null ? null : verificationResult(entry.verification, `tasks[${index}].attempts[${a}].verification`),
                    passed: entry.passed === true,
                    ...entry.route === undefined ? {} : { route: string(entry.route, `tasks[${index}].attempts[${a}].route`) },
                    ...entry.failure === undefined || entry.failure === null
                        ? {}
                        : { failure: attemptFailure(entry.failure, `tasks[${index}].attempts[${a}].failure`) },
                    error: string(entry.error ?? '', `tasks[${index}].attempts[${a}].error`),
                };
            }),
            error: string(task.error ?? '', `tasks[${index}].error`),
        };
    });
    if (planTasks.length !== tasks.length) {
        throw new Error('workflow result plan.tasks and tasks length mismatch');
    }
    for (let index = 0; index < planTasks.length; index++) {
        const planTask = planTasks[index];
        const task = tasks[index];
        if (planTask.id !== task.id) {
            throw new Error(`workflow result task id mismatch at index ${index}`);
        }
        if (planTask.title !== task.title
            || planTask.objective !== task.objective
            || planTask.expectedOutput !== task.expectedOutput
            || planTask.context !== task.context
            || !sameStrings(planTask.acceptanceCriteria, task.acceptanceCriteria)
            || !sameStrings(planTask.constraints, task.constraints)) {
            throw new Error(`workflow result plan.tasks and tasks disagree at index ${index}`);
        }
    }
    const limits = record(root.limits, 'limits');
    const maxConcurrency = number(limits.maxConcurrency, 'limits.maxConcurrency');
    const maxRetries = number(limits.maxRetries, 'limits.maxRetries');
    const maxTasks = number(limits.maxTasks, 'limits.maxTasks');
    const maxTotalAgents = number(limits.maxTotalAgents, 'limits.maxTotalAgents');
    if (maxConcurrency !== config.maxConcurrency || maxRetries !== config.maxRetries || maxTasks !== config.maxTasks) {
        throw new Error('workflow result limits do not match the configured limits');
    }
    if (tasks.length > maxTasks) {
        throw new Error(`workflow result has ${tasks.length} tasks but maxTasks is ${maxTasks}`);
    }
    if (tasks.length > 0) {
        // The plugin sizes the child cap from the task count: exact for a caller plan,
        // the configured maximum for a planner or fallback plan. Anything outside that
        // window did not come from this plugin's request builder.
        const budget = routeBudgetFor(config);
        const minimumAgents = maxTotalAgentsFor(tasks.length, maxRetries, budget);
        const maximumAgents = maxTotalAgentsFor(maxTasks, maxRetries, budget);
        if (maxTotalAgents < minimumAgents || maxTotalAgents > maximumAgents) {
            throw new Error(`workflow result limits.maxTotalAgents ${maxTotalAgents} is outside the allowed range ${minimumAgents}-${maximumAgents}`);
        }
    }
    const taskIds = new Set();
    for (const task of tasks) {
        if (taskIds.has(task.id)) {
            throw new Error(`workflow result has duplicate task id "${task.id}"`);
        }
        taskIds.add(task.id);
        if (task.acceptanceCriteria.length === 0) {
            throw new Error(`workflow result task ${task.id} has no acceptance criteria`);
        }
    }
    for (const task of tasks) {
        if (task.attempts.length === 0) {
            throw new Error(`workflow result task ${task.id} has no attempts`);
        }
        if (task.attempts.length > maxRetries + 1) {
            throw new Error(`workflow result task ${task.id} exceeds the configured retry limit`);
        }
        for (let index = 0; index < task.attempts.length; index++) {
            if (task.attempts[index].attempt !== index + 1) {
                throw new Error(`workflow result task ${task.id} has non-sequential attempts`);
            }
            if (task.attempts[index].passed && (task.attempts[index].execution === null || task.attempts[index].verification === null)) {
                throw new Error(`workflow result task ${task.id} has a passed attempt without execution and verification`);
            }
        }
        const passedAttempts = task.attempts.filter(attempt => attempt.passed);
        if (task.status === 'verified') {
            if (passedAttempts.length !== 1 || !task.attempts[task.attempts.length - 1].passed) {
                throw new Error(`workflow result task ${task.id} is verified without exactly one final passed attempt`);
            }
        }
        else if (passedAttempts.length > 0) {
            throw new Error(`workflow result task ${task.id} is failed but has a passed attempt`);
        }
    }
    const confirmed = array(root.confirmed, 'confirmed').map((item, index) => {
        const entry = record(item, `confirmed[${index}]`);
        return {
            taskId: string(entry.taskId, `confirmed[${index}].taskId`),
            criterion: string(entry.criterion, `confirmed[${index}].criterion`),
            evidence: string(entry.evidence, `confirmed[${index}].evidence`),
        };
    });
    const incomplete = array(root.incomplete, 'incomplete').map((item, index) => {
        const entry = record(item, `incomplete[${index}]`);
        return {
            taskId: string(entry.taskId, `incomplete[${index}].taskId`),
            reason: string(entry.reason, `incomplete[${index}].reason`),
        };
    });
    const errors = array(root.errors, 'errors').map((item, index) => {
        const entry = record(item, `errors[${index}]`);
        return {
            phase: string(entry.phase, `errors[${index}].phase`),
            message: string(entry.message, `errors[${index}].message`),
        };
    });
    const uncertainties = array(root.uncertainties, 'uncertainties').map((item, index) => {
        const entry = record(item, `uncertainties[${index}]`);
        return {
            taskId: string(entry.taskId, `uncertainties[${index}].taskId`),
            text: string(entry.text, `uncertainties[${index}].text`),
        };
    });
    const verifiedCount = tasks.filter(task => task.status === 'verified').length;
    const planError = string(plan.error ?? '', 'plan.error');
    if (source === 'unavailable' && tasks.length > 0) {
        throw new Error('workflow result unavailable plan must not contain tasks');
    }
    if (status === 'completed') {
        if (source === 'fallback' || source === 'unavailable') {
            throw new Error('workflow result cannot be completed from a fallback or unavailable plan');
        }
        if (tasks.length === 0 || verifiedCount !== tasks.length) {
            throw new Error('workflow result completed requires every task to be verified');
        }
        if (incomplete.length > 0 || errors.length > 0 || planError !== '') {
            throw new Error('workflow result completed cannot contain incomplete work or errors');
        }
        const verifiedTasks = tasks.filter(task => task.status === 'verified');
        for (const task of verifiedTasks) {
            for (const criterion of task.acceptanceCriteria) {
                const matches = confirmed.filter(item => item.taskId === task.id && item.criterion === criterion);
                if (matches.length !== 1 || matches[0].evidence.trim() === '') {
                    throw new Error(`workflow result completed lacks confirmed evidence for task ${task.id} criterion`);
                }
            }
        }
        if (confirmed.some(item => !verifiedTasks.some(task => task.id === item.taskId))) {
            throw new Error('workflow result confirmed evidence references a task that is not verified');
        }
    }
    else if (status === 'partial') {
        if (tasks.length === 0 || verifiedCount === 0) {
            throw new Error('workflow result partial requires at least one verified task');
        }
        if (source === 'fallback') {
            // A degraded fallback plan is never a clean completion, but its only task
            // may legitimately be verified. Require the planning error as provenance.
            if (planError.trim() === '') {
                throw new Error('workflow result fallback partial requires the planning error');
            }
        }
        else if (verifiedCount === tasks.length) {
            throw new Error('workflow result partial requires both verified and failed tasks');
        }
    }
    else if (verifiedCount > 0) {
        throw new Error('workflow result failed cannot contain a verified task');
    }
    // Every confirmed item must be traceable to the last attempt's own verification
    // record: same task, same criterion (formatting-insensitive, matching how the
    // script pairs them), met, and byte-identical evidence. This is what stops a
    // report from asserting evidence that no verifier ever produced.
    for (const item of confirmed) {
        const task = tasks.find(candidate => candidate.id === item.taskId);
        if (task === undefined) {
            throw new Error(`workflow result confirmed evidence references unknown task ${item.taskId}`);
        }
        const lastVerification = task.attempts[task.attempts.length - 1].verification;
        const supported = lastVerification !== null && lastVerification.criteria.some(criterion => criterion.met
            && criterion.evidence === item.evidence
            && criterionKey(criterion.criterion) === criterionKey(item.criterion));
        if (!supported) {
            throw new Error(`workflow result confirmed evidence for task ${item.taskId} is not supported by that task's last attempt verification`);
        }
    }
    if (status !== 'completed') {
        // A non-completed report must account for every failed task exactly once, with
        // a real reason. A fallback partial whose single task verified legitimately has
        // no failed task, so this stays vacuous there (its provenance is plan.error).
        for (const task of tasks) {
            if (task.status !== 'failed')
                continue;
            const entries = incomplete.filter(item => item.taskId === task.id);
            if (entries.length !== 1 || entries[0].reason.trim() === '') {
                throw new Error(`workflow result task ${task.id} failed but is not reported exactly once in incomplete with a non-empty reason`);
            }
        }
    }
    const routes = root.routes === undefined ? [] : routeTrail(root.routes, 'routes', 256);
    for (const entry of routes) {
        if (entry.chainIndex < 0 || entry.chainIndex >= config.roles[entry.role].length + 1) {
            throw new Error(`workflow result routes entry for ${entry.role} has out-of-range chainIndex ${entry.chainIndex}`);
        }
    }
    const routing = root.routing === undefined
        ? { planner: [], worker: [], verifier: [], synthesizer: [] }
        : routeLabels(root.routing, 'routing');
    const synthesisRoot = root.synthesis === undefined ? {} : record(root.synthesis, 'synthesis');
    const synthesisMode = string(synthesisRoot.mode ?? config.synthesis, 'synthesis.mode');
    if (synthesisMode !== 'deterministic' && synthesisMode !== 'model') {
        throw new Error(`workflow result synthesis.mode must be "deterministic" or "model", got "${synthesisMode}"`);
    }
    return {
        schemaVersion: 'grok-workflow/v1',
        status: status,
        routes,
        routing,
        synthesis: {
            mode: synthesisMode,
            ...synthesisRoot.error === undefined ? {} : { error: string(synthesisRoot.error, 'synthesis.error') },
            ...synthesisRoot.summary === undefined ? {} : { summary: string(synthesisRoot.summary, 'synthesis.summary') },
        },
        objective: string(root.objective, 'objective'),
        plan: {
            source: source,
            tasks: planTasks,
            error: planError,
        },
        tasks: tasks,
        confirmed,
        incomplete,
        errors,
        uncertainties,
        limits: {
            maxConcurrency,
            maxRetries,
            maxTasks,
            maxTotalAgents: number(limits.maxTotalAgents, 'limits.maxTotalAgents'),
        },
    };
}
/** A failure report for a run that never produced a script result. */
export function failureReport(objective, config, phase, message) {
    return {
        schemaVersion: 'grok-workflow/v1',
        status: 'failed',
        objective,
        plan: { source: 'unavailable', tasks: [], error: message },
        tasks: [],
        confirmed: [],
        incomplete: [{ taskId: 'workflow', reason: message }],
        errors: [{ phase, message }],
        uncertainties: [],
        routes: [],
        routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
        synthesis: { mode: config.synthesis },
        limits: {
            maxConcurrency: config.maxConcurrency,
            maxRetries: config.maxRetries,
            maxTasks: config.maxTasks,
            maxTotalAgents: 0,
        },
    };
}
/** Render a concise model-facing view; the canonical JSON remains available to PTC. */
export function renderReport(report) {
    const verified = report.tasks.filter(task => task.status === 'verified').length;
    const lines = [
        `Grok workflow: ${report.status.toUpperCase()}`,
        `Objective: ${oneLine(report.objective, 300)}`,
        `Plan: ${report.plan.source}; ${report.tasks.length} task(s); ${verified} verified`,
    ];
    for (const task of report.tasks) {
        const attempts = task.attempts.length;
        lines.push(`- ${task.id}: ${task.status} (${attempts} attempt${attempts === 1 ? '' : 's'}) — ${oneLine(task.title, 160)}`);
        if (task.status === 'failed') {
            lines.push(`  incomplete: ${oneLine(task.error || task.expectedOutput, 500)}`);
        }
    }
    if (report.confirmed.length > 0) {
        lines.push('Confirmed evidence:');
        for (const item of report.confirmed.slice(0, 12)) {
            lines.push(`- ${item.taskId}: ${oneLine(item.criterion, 200)} → ${oneLine(item.evidence, 400)}`);
        }
    }
    if (report.incomplete.length > 0) {
        lines.push('Incomplete:');
        for (const item of report.incomplete.slice(0, 12)) {
            lines.push(`- ${item.taskId}: ${oneLine(item.reason, 500)}`);
        }
    }
    if (report.synthesis.summary !== undefined) {
        lines.push('Final answer:');
        lines.push(oneLine(report.synthesis.summary, 2_000));
    }
    if (report.synthesis.error !== undefined) {
        lines.push(`Synthesis: model narrative unavailable (${oneLine(report.synthesis.error, 300)}); the report above is complete`);
    }
    const configured = ['planner', 'worker', 'verifier', 'synthesizer']
        .map(role => [role, report.routing[role]])
        .filter(([, chain]) => chain.length > 0);
    if (configured.length > 0) {
        lines.push(`Model routes: ${configured.map(([role, chain]) => `${role}=${chain.join(' → ')}`).join('; ')}`);
    }
    const routeFailures = report.routes.filter(entry => entry.outcome === 'failed');
    if (routeFailures.length > 0) {
        lines.push('Route switches:');
        for (const entry of routeFailures.slice(0, 12)) {
            lines.push(`- ${entry.role} attempt ${entry.attempt} via ${entry.route}: ${entry.failureClass ?? 'unknown'} — ${oneLine(entry.reason ?? '', 200)}`);
        }
    }
    if (report.uncertainties.length > 0) {
        lines.push('Uncertainties:');
        for (const item of report.uncertainties.slice(0, 12)) {
            lines.push(`- ${item.taskId}: ${oneLine(item.text, 400)}`);
        }
    }
    if (report.errors.length > 0) {
        lines.push('Errors:');
        for (const item of report.errors.slice(0, 12)) {
            lines.push(`- ${item.phase}: ${oneLine(item.message, 500)}`);
        }
    }
    const text = lines.join('\n');
    return text.length <= MAX_RENDER_CHARS
        ? text
        : `${text.slice(0, MAX_RENDER_CHARS)}\n[output truncated; see the canonical structured result for full details]`;
}
function oneLine(value, max) {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}
//# sourceMappingURL=report.js.map