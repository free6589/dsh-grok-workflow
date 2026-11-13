/**
 * Versioned checkpoint schema for workflow runs.
 *
 * A checkpoint is a bounded, verifiable snapshot of one workflow run: what was
 * asked (run/plan), what ran (tasks/agents/stages), what was proven (evidence),
 * where it ran (git), when (time), and the smallest context a fresh agent needs
 * to resume it (min-context). The writer in `./writer.js` turns a checkpoint
 * into one atomic, checksummed JSON file; this module owns the data contract.
 *
 * Integration points (documented engine hooks, read-only from this module):
 *
 * - Run identity and watchdog state come from the run lifecycle in
 *   `src/run.ts` (`ActiveRunInfo`, the t47 deadline watchdog) and the plugin
 *   disposal path (`ActiveState.unloadedAt`, shutdown signals).
 * - Task/agent rows mirror the report structures in `src/types.ts`
 *   (`TaskReport`, `RouteTrailEntry`, `ConfirmedEvidence`) so a checkpoint can
 *   be built from a `WorkflowReport` without reinterpreting anything.
 * - The run itself is started through `ctx.workflowEngine.start` (see
 *   `docs/ARCHITECTURE.md` §16) and child work is created through the engine's
 *   `agent()` hook; stage rows are meant to be recorded from those lifecycle
 *   events by a later integration task. This module never calls the engine.
 *
 * Limits policy: the checkpoint *records* whatever limits a run actually used
 * (structural sanity only), because the schema must stay writable for every
 * configuration the plugin accepts today. The documented engine-hook contract
 * — default concurrency 3, hard maximum 6; retries default 1, hard maximum 3
 * (AGENTS.md "Architecture invariants") — is pinned in
 * {@link ENGINE_HOOK_LIMITS} and checked by {@link limitContractViolations}.
 * Observed code currently defaults `maxConcurrency` to 4 and `maxRetries` to 2
 * (src/config.ts); that divergence is recorded here as data, not silently
 * reconciled by the schema.
 *
 * Secrets: every free-text field passes through `redactSecrets` at build time
 * (see `src/redact.ts`). Field-level wholesale redaction (`redactDeep`) is
 * deliberately NOT used because it would blank structural fields such as
 * `sessionId` whose *names* look sensitive; only free text carries untrusted
 * content in this schema.
 */
import { createHash } from 'node:crypto';
import { normalizeWritesPaths } from '../paths.js';
import { redactSecrets } from '../redact.js';
/** Schema version written into every checkpoint and checked on read. */
export const CHECKPOINT_VERSION = 'grok-workflow.checkpoint/v1';
/**
 * Hard ceilings for checkpoint fields. They bound the file so a noisy run
 * cannot grow a checkpoint without limit, and the reader refuses anything
 * larger than {@link CHECKPOINT_LIMITS.maxBytes} before parsing it.
 */
export const CHECKPOINT_LIMITS = {
    /** Maximum whole-file size accepted by writer and reader. */
    maxBytes: 1_048_576,
    /** Maximum characters of the run objective and the min-context objective. */
    objectiveChars: 4_000,
    /** Maximum characters of a cancel/cause line. */
    causeChars: 600,
    /** Maximum characters of a task title. */
    titleChars: 600,
    /** Maximum characters of an error or failure reason. */
    errorChars: 1_000,
    /** Maximum characters of one acceptance criterion. */
    criterionChars: 600,
    /** Maximum characters of one evidence claim. */
    claimChars: 1_000,
    /** Maximum characters of one evidence locator. */
    locatorChars: 400,
    /** Maximum characters of the min-context digest (carry-over scale, src/carryover.ts). */
    digestChars: 12_000,
    /** Maximum characters of a git branch name. */
    branchChars: 200,
    /** Maximum characters of a run id and a session id. */
    idChars: 120,
    /** Maximum characters of a route label. */
    routeChars: 200,
    /** Maximum rows in the min-context digest per section. */
    digestRows: 64,
    /** Maximum declared write paths per plan task (mirrors WRITE_PATH_LIMITS.items). */
    writesPathItems: 16,
    /** Maximum characters of one declared write path (mirrors WRITE_PATH_LIMITS.chars). */
    writesPathChars: 300,
    /** Maximum plan tasks and task-state rows. */
    maxTasks: 128,
    /** Maximum agent-call rows. */
    maxAgents: 512,
    /** Maximum stage rows. */
    maxStages: 16,
    /** Maximum evidence rows. */
    maxEvidence: 1_024,
    /** Maximum recorded attempts per task (config ceiling is 10 retries + 1). */
    attemptsCeiling: 16,
    /** Structural ceiling for recorded limit numbers (matches config's 1e6 backstop). */
    countCeiling: 1_000_000,
    /**
     * Structural ceiling for millisecond durations and timeouts. Mirrors
     * HARD_LIMITS.timeoutMs (604,800,000 = 7 days) in src/config.ts, so a
     * checkpoint can record any timeout the plugin itself accepts.
     */
    msCeiling: 604_800_000,
};
/**
 * The documented engine-hook contract for run limits (AGENTS.md architecture
 * invariants; the task brief repeats it verbatim). Recorded limits that stay
 * inside this envelope are flagged compliant by {@link limitContractViolations};
 * values outside it are still recorded, never rejected, so the checkpoint
 * always tells the truth about the run.
 */
export const ENGINE_HOOK_LIMITS = {
    maxConcurrency: { default: 3, max: 6 },
    maxRetries: { default: 1, max: 3 },
};
const RUN_STATUSES = ['running', 'completed', 'partial', 'failed', 'cancelled'];
const TASK_STATUSES = ['pending', 'running', 'verified', 'failed', 'cancelled'];
const PLAN_SOURCES = ['caller', 'planner', 'fallback', 'unavailable'];
const ROLE_NAMES = ['planner', 'worker', 'verifier', 'synthesizer'];
const PHASE_NAMES = ['plan', 'execute', 'verify', 'synthesize', 'answer'];
const AGENT_OUTCOMES = ['ok', 'failed'];
const MIN_CONTEXT_SOURCES = ['auto', 'caller'];
/** Why a checkpoint operation failed. `reason` drives test and caller branching. */
export class CheckpointError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.name = 'CheckpointError';
        this.reason = reason;
    }
}
/* ------------------------------------------------------------------ *
 * Validation helpers (same style as the private helpers in src/report.ts)
 * ------------------------------------------------------------------ */
function record(value, path) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new CheckpointError('invalid', `checkpoint ${path} must be an object`);
    }
    return value;
}
function string(value, path) {
    if (typeof value !== 'string')
        throw new CheckpointError('invalid', `checkpoint ${path} must be a string`);
    return value;
}
function integer(value, path) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new CheckpointError('invalid', `checkpoint ${path} must be a safe integer`);
    }
    return value;
}
function boolean(value, path) {
    if (typeof value !== 'boolean')
        throw new CheckpointError('invalid', `checkpoint ${path} must be a boolean`);
    return value;
}
function enumeration(value, allowed, path) {
    const text = string(value, path);
    if (!allowed.includes(text)) {
        throw new CheckpointError('invalid', `checkpoint ${path} must be one of ${allowed.join('/')} (got "${text}")`);
    }
    return text;
}
function bounded(value, max, path) {
    if (value.length > max)
        throw new CheckpointError('invalid', `checkpoint ${path} exceeds ${max} characters`);
    return value;
}
function inRange(value, min, max, path) {
    if (value < min || value > max) {
        throw new CheckpointError('invalid', `checkpoint ${path} must be between ${min} and ${max}`);
    }
    return value;
}
/* ------------------------------------------------------------------ *
 * Redaction and bounding (build side)
 * ------------------------------------------------------------------ */
/**
 * Redact, then bound one free-text field. The cut is surrogate-safe (never
 * leaves half of a code point at the boundary) and appends an explicit `…`
 * instead of a silent cut.
 */
function text(value, max, path) {
    const redacted = redactSecrets(string(value, path));
    if (redacted.length <= max)
        return redacted;
    let cut = Math.max(0, max - 1);
    const code = redacted.charCodeAt(cut - 1);
    if (cut > 0 && code >= 0xd800 && code <= 0xdbff)
        cut -= 1;
    return `${redacted.slice(0, cut)}…`;
}
/* ------------------------------------------------------------------ *
 * Canonical JSON, checksum, sealing
 * ------------------------------------------------------------------ */
/**
 * Deterministic JSON: object keys sorted, `undefined` fields dropped, arrays
 * in order. The checksum is computed over this form, so two structurally
 * equal checkpoints always produce the same bytes regardless of key insertion
 * order or property presence of `undefined` placeholders.
 */
export function canonicalJson(value) {
    return JSON.stringify(canonical(value, 0));
}
function canonical(value, depth) {
    if (depth > 64)
        throw new CheckpointError('invalid', 'checkpoint nesting deeper than 64 levels');
    if (value === null)
        return null;
    switch (typeof value) {
        case 'string':
        case 'boolean':
            return value;
        case 'number':
            if (!Number.isFinite(value))
                throw new CheckpointError('invalid', 'checkpoint contains a non-finite number');
            return value;
        case 'object': {
            if (Array.isArray(value))
                return value.map(item => canonical(item, depth + 1));
            const source = value;
            const out = {};
            for (const key of Object.keys(source).sort()) {
                const child = source[key];
                if (child === undefined)
                    continue;
                out[key] = canonical(child, depth + 1);
            }
            return out;
        }
        default:
            throw new CheckpointError('invalid', `checkpoint contains a ${typeof value}, which is not JSON`);
    }
}
function sha256Hex(payload) {
    return createHash('sha256').update(payload, 'utf8').digest('hex');
}
/** Copy of the checkpoint without the `integrity` field. */
export function stripIntegrity(checkpoint) {
    const { integrity: _omitted, ...rest } = checkpoint;
    void _omitted;
    return rest;
}
/**
 * Compute and attach the integrity record. Throws `too-large` when the
 * canonical payload alone already exceeds {@link CHECKPOINT_LIMITS.maxBytes}.
 */
export function sealCheckpoint(checkpoint) {
    const payload = canonicalJson(stripIntegrity(checkpoint));
    const bytes = Buffer.byteLength(payload, 'utf8');
    if (bytes > CHECKPOINT_LIMITS.maxBytes) {
        throw new CheckpointError('too-large', `checkpoint payload is ${bytes} bytes, above the ${CHECKPOINT_LIMITS.maxBytes} bound`);
    }
    return { ...checkpoint, integrity: { algorithm: 'sha256', checksum: sha256Hex(payload), bytes } };
}
/**
 * Recompute the checksum over the canonical payload and compare it with the
 * stored integrity record. Pure; the file reader wraps this with IO errors.
 */
export function verifyCheckpointIntegrity(checkpoint) {
    if (checkpoint.integrity === undefined)
        return { ok: false, detail: 'checkpoint carries no integrity record' };
    const payload = canonicalJson(stripIntegrity(checkpoint));
    const bytes = Buffer.byteLength(payload, 'utf8');
    if (checkpoint.integrity.algorithm !== 'sha256') {
        return { ok: false, detail: `unsupported integrity algorithm "${checkpoint.integrity.algorithm}"` };
    }
    const checksum = sha256Hex(payload);
    if (checkpoint.integrity.checksum !== checksum) {
        return { ok: false, detail: `checksum mismatch: stored ${checkpoint.integrity.checksum}, computed ${checksum}` };
    }
    if (checkpoint.integrity.bytes !== bytes) {
        return { ok: false, detail: `payload byte count mismatch: stored ${checkpoint.integrity.bytes}, computed ${bytes}` };
    }
    return { ok: true };
}
/* ------------------------------------------------------------------ *
 * Min-context digest
 * ------------------------------------------------------------------ */
/**
 * Compile the smallest context a fresh agent needs to resume the run:
 * objective, plan state, confirmed evidence, and open/uncertain rows. Pure and
 * deterministic — no clock, no randomness — and bounded by
 * {@link CHECKPOINT_LIMITS.digestChars} with an explicit truncation marker.
 */
export function buildMinContextDigest(input) {
    const lines = [`objective: ${text(input.objective, CHECKPOINT_LIMITS.objectiveChars, 'minContext.objective')}`];
    const done = input.tasks.filter(task => task.status === 'verified' || task.status === 'failed' || task.status === 'cancelled');
    lines.push(`plan: ${input.tasks.length} task(s), ${done.length} finished`);
    const taskRows = input.tasks.slice(0, CHECKPOINT_LIMITS.digestRows);
    for (const task of taskRows)
        lines.push(`- ${task.id} ${task.status} ${text(task.title, CHECKPOINT_LIMITS.titleChars, 'minContext.task')}`);
    if (input.tasks.length > taskRows.length)
        lines.push(`[truncated: ${input.tasks.length - taskRows.length} more task row(s)]`);
    const evidence = (input.evidence ?? []).slice(0, CHECKPOINT_LIMITS.digestRows);
    if (evidence.length > 0) {
        lines.push('confirmed:');
        for (const row of evidence) {
            lines.push(`- [${row.taskId}] ${text(row.criterion, CHECKPOINT_LIMITS.criterionChars, 'minContext.evidence')} :: ${text(row.claim, CHECKPOINT_LIMITS.claimChars, 'minContext.evidence')}`);
        }
        if ((input.evidence ?? []).length > evidence.length) {
            lines.push(`[truncated: ${(input.evidence ?? []).length - evidence.length} more evidence row(s)]`);
        }
    }
    for (const [name, rows] of [['open', input.open ?? []], ['uncertain', input.uncertain ?? []]]) {
        const kept = rows.slice(0, CHECKPOINT_LIMITS.digestRows);
        if (kept.length === 0)
            continue;
        lines.push(`${name}:`);
        for (const row of kept)
            lines.push(`- ${text(row, CHECKPOINT_LIMITS.claimChars, `minContext.${name}`)}`);
        if (rows.length > kept.length)
            lines.push(`[truncated: ${rows.length - kept.length} more ${name} row(s)]`);
    }
    let digest = lines.join('\n');
    if (digest.length > CHECKPOINT_LIMITS.digestChars) {
        digest = `${digest.slice(0, CHECKPOINT_LIMITS.digestChars - 3)}...`;
    }
    return digest;
}
/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */
/** Build a validated, redacted, bounded checkpoint (without integrity). */
export function buildCheckpoint(input, now = Date.now()) {
    if (!Number.isSafeInteger(now))
        throw new CheckpointError('invalid', 'checkpoint clock value must be a safe integer');
    const runId = text(input.run.runId, CHECKPOINT_LIMITS.idChars, 'run.runId');
    if (runId === '')
        throw new CheckpointError('invalid', 'checkpoint run.runId must not be empty');
    const run = {
        runId,
        status: enumeration(input.run.status, RUN_STATUSES, 'run.status'),
        objective: text(input.run.objective, CHECKPOINT_LIMITS.objectiveChars, 'run.objective'),
        ...(input.run.sessionId === undefined ? {} : { sessionId: text(input.run.sessionId, CHECKPOINT_LIMITS.idChars, 'run.sessionId') }),
        ...(input.run.cause === undefined ? {} : { cause: text(input.run.cause, CHECKPOINT_LIMITS.causeChars, 'run.cause') }),
    };
    const planTasks = input.plan.tasks.slice(0, CHECKPOINT_LIMITS.maxTasks).map((task, index) => ({
        id: text(task.id, CHECKPOINT_LIMITS.idChars, `plan.tasks[${index}].id`),
        title: text(task.title, CHECKPOINT_LIMITS.titleChars, `plan.tasks[${index}].title`),
        writesPaths: normalizeWritesPaths(task.writesPaths) ?? null,
    }));
    const plan = {
        source: enumeration(input.plan.source, PLAN_SOURCES, 'plan.source'),
        taskCount: planTasks.length,
        tasks: planTasks,
    };
    const taskSource = input.tasks
        ?? planTasks.map(task => ({ id: task.id, title: task.title, status: 'pending', attempts: 0 }));
    const taskRows = taskSource
        .slice(0, CHECKPOINT_LIMITS.maxTasks)
        .map((task, index) => ({
        id: text(task.id, CHECKPOINT_LIMITS.idChars, `tasks[${index}].id`),
        title: text(task.title, CHECKPOINT_LIMITS.titleChars, `tasks[${index}].title`),
        status: enumeration(task.status, TASK_STATUSES, `tasks[${index}].status`),
        attempts: inRange(integer(task.attempts, `tasks[${index}].attempts`), 0, CHECKPOINT_LIMITS.attemptsCeiling, `tasks[${index}].attempts`),
        ...(task.error === undefined ? {} : { error: text(task.error, CHECKPOINT_LIMITS.errorChars, `tasks[${index}].error`) }),
    }));
    const agents = (input.agents ?? []).slice(0, CHECKPOINT_LIMITS.maxAgents).map((agent, index) => {
        const path = `agents[${index}]`;
        const row = {
            role: enumeration(agent.role, ROLE_NAMES, `${path}.role`),
            outcome: enumeration(agent.outcome, AGENT_OUTCOMES, `${path}.outcome`),
            ...(agent.taskId === undefined ? {} : { taskId: text(agent.taskId, CHECKPOINT_LIMITS.idChars, `${path}.taskId`) }),
            ...(agent.attempt === undefined ? {} : { attempt: inRange(integer(agent.attempt, `${path}.attempt`), 0, CHECKPOINT_LIMITS.attemptsCeiling, `${path}.attempt`) }),
            ...(agent.route === undefined ? {} : { route: text(agent.route, CHECKPOINT_LIMITS.routeChars, `${path}.route`) }),
            ...(agent.failureClass === undefined ? {} : { failureClass: text(agent.failureClass, 40, `${path}.failureClass`) }),
            ...(agent.reason === undefined ? {} : { reason: text(agent.reason, CHECKPOINT_LIMITS.errorChars, `${path}.reason`) }),
            ...(agent.startedAtMs === undefined ? {} : { startedAtMs: integer(agent.startedAtMs, `${path}.startedAtMs`) }),
            ...(agent.durationMs === undefined ? {} : { durationMs: inRange(integer(agent.durationMs, `${path}.durationMs`), 0, CHECKPOINT_LIMITS.msCeiling, `${path}.durationMs`) }),
        };
        return row;
    });
    const stages = (input.stages ?? []).slice(0, CHECKPOINT_LIMITS.maxStages).map((stage, index) => {
        const path = `stages[${index}]`;
        return {
            phase: enumeration(stage.phase, PHASE_NAMES, `${path}.phase`),
            status: enumeration(stage.status, RUN_STATUSES, `${path}.status`),
            ...(stage.startedAtMs === undefined ? {} : { startedAtMs: integer(stage.startedAtMs, `${path}.startedAtMs`) }),
            ...(stage.endedAtMs === undefined ? {} : { endedAtMs: integer(stage.endedAtMs, `${path}.endedAtMs`) }),
            ...(stage.error === undefined ? {} : { error: text(stage.error, CHECKPOINT_LIMITS.errorChars, `${path}.error`) }),
        };
    });
    const evidence = (input.evidence ?? []).slice(0, CHECKPOINT_LIMITS.maxEvidence).map((row, index) => {
        const path = `evidence[${index}]`;
        return {
            taskId: text(row.taskId, CHECKPOINT_LIMITS.idChars, `${path}.taskId`),
            criterion: text(row.criterion, CHECKPOINT_LIMITS.criterionChars, `${path}.criterion`),
            claim: text(row.claim, CHECKPOINT_LIMITS.claimChars, `${path}.claim`),
            ...(row.locator === undefined ? {} : { locator: text(row.locator, CHECKPOINT_LIMITS.locatorChars, `${path}.locator`) }),
        };
    });
    const gitRaw = input.git ?? { dirty: false };
    const git = {
        dirty: boolean(gitRaw.dirty, 'git.dirty'),
        ...(gitRaw.branch === undefined ? {} : { branch: text(gitRaw.branch, CHECKPOINT_LIMITS.branchChars, 'git.branch') }),
        ...(gitRaw.head === undefined ? {} : { head: validateHead(gitRaw.head) }),
        ...(gitRaw.ahead === undefined ? {} : { ahead: inRange(integer(gitRaw.ahead, 'git.ahead'), 0, CHECKPOINT_LIMITS.countCeiling, 'git.ahead') }),
        ...(gitRaw.behind === undefined ? {} : { behind: inRange(integer(gitRaw.behind, 'git.behind'), 0, CHECKPOINT_LIMITS.countCeiling, 'git.behind') }),
    };
    const startedAtMs = integer(input.time?.startedAtMs ?? now, 'time.startedAtMs');
    const updatedAtMs = integer(input.time?.updatedAtMs ?? now, 'time.updatedAtMs');
    const time = {
        startedAtMs,
        updatedAtMs,
        ...(input.time?.durationMs === undefined ? {} : { durationMs: inRange(integer(input.time.durationMs, 'time.durationMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'time.durationMs') }),
        ...(input.time?.deadlineAtMs === undefined ? {} : { deadlineAtMs: integer(input.time.deadlineAtMs, 'time.deadlineAtMs') }),
    };
    const minContext = input.minContext === undefined
        ? {
            objective: text(input.run.objective, CHECKPOINT_LIMITS.objectiveChars, 'minContext.objective'),
            digest: buildMinContextDigest({ objective: input.run.objective, tasks: taskRows, evidence }),
            source: 'auto',
        }
        : {
            objective: text(input.minContext.objective ?? input.run.objective, CHECKPOINT_LIMITS.objectiveChars, 'minContext.objective'),
            digest: text(input.minContext.digest, CHECKPOINT_LIMITS.digestChars, 'minContext.digest'),
            source: 'caller',
        };
    const limits = {
        maxConcurrency: inRange(integer(input.limits?.maxConcurrency ?? ENGINE_HOOK_LIMITS.maxConcurrency.default, 'limits.maxConcurrency'), 1, CHECKPOINT_LIMITS.countCeiling, 'limits.maxConcurrency'),
        maxRetries: inRange(integer(input.limits?.maxRetries ?? ENGINE_HOOK_LIMITS.maxRetries.default, 'limits.maxRetries'), 0, CHECKPOINT_LIMITS.countCeiling, 'limits.maxRetries'),
        maxTasks: inRange(integer(input.limits?.maxTasks ?? 12, 'limits.maxTasks'), 1, CHECKPOINT_LIMITS.countCeiling, 'limits.maxTasks'),
        ...(input.limits?.timeoutMs === undefined ? {} : { timeoutMs: inRange(integer(input.limits.timeoutMs, 'limits.timeoutMs'), 1, CHECKPOINT_LIMITS.msCeiling, 'limits.timeoutMs') }),
    };
    const watchdog = {
        deadlineHit: boolean(input.watchdog?.deadlineHit ?? false, 'watchdog.deadlineHit'),
        cancelled: boolean(input.watchdog?.cancelled ?? false, 'watchdog.cancelled'),
        ...(input.watchdog?.deadlineMs === undefined ? {} : { deadlineMs: inRange(integer(input.watchdog.deadlineMs, 'watchdog.deadlineMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'watchdog.deadlineMs') }),
        ...(input.watchdog?.cancelReason === undefined ? {} : { cancelReason: text(input.watchdog.cancelReason, CHECKPOINT_LIMITS.causeChars, 'watchdog.cancelReason') }),
    };
    return assertCheckpoint({
        version: CHECKPOINT_VERSION,
        run,
        plan,
        tasks: taskRows,
        agents,
        stages,
        evidence,
        git,
        time,
        minContext,
        limits,
        watchdog,
    });
}
function validateHead(value) {
    const head = value.trim().toLowerCase();
    if (!/^[0-9a-f]{7,64}$/.test(head))
        throw new CheckpointError('invalid', `checkpoint git.head must be 7-64 hex characters (got "${value}")`);
    return head;
}
/* ------------------------------------------------------------------ *
 * Assert (read side): strict validation, no mutation, no re-bounding
 * ------------------------------------------------------------------ */
/**
 * Validate an unknown value as a checkpoint. Used by the file reader after
 * JSON.parse; it never repairs anything — a field over its bound means the
 * file was not written by this module, and the read fails.
 */
export function assertCheckpoint(value) {
    const root = record(value, '');
    const version = string(root['version'], 'version');
    if (version !== CHECKPOINT_VERSION) {
        throw new CheckpointError('invalid', `checkpoint version must be "${CHECKPOINT_VERSION}" (got "${version}")`);
    }
    const runRaw = record(root['run'], 'run');
    const run = {
        runId: bounded(string(runRaw['runId'], 'run.runId'), CHECKPOINT_LIMITS.idChars, 'run.runId'),
        status: enumeration(runRaw['status'], RUN_STATUSES, 'run.status'),
        objective: bounded(string(runRaw['objective'], 'run.objective'), CHECKPOINT_LIMITS.objectiveChars, 'run.objective'),
        ...(runRaw['sessionId'] === undefined ? {} : { sessionId: bounded(string(runRaw['sessionId'], 'run.sessionId'), CHECKPOINT_LIMITS.idChars, 'run.sessionId') }),
        ...(runRaw['cause'] === undefined ? {} : { cause: bounded(string(runRaw['cause'], 'run.cause'), CHECKPOINT_LIMITS.causeChars, 'run.cause') }),
    };
    if (run.runId === '')
        throw new CheckpointError('invalid', 'checkpoint run.runId must not be empty');
    const planRaw = record(root['plan'], 'plan');
    const planTasksRaw = planRaw['tasks'];
    if (!Array.isArray(planTasksRaw))
        throw new CheckpointError('invalid', 'checkpoint plan.tasks must be an array');
    if (planTasksRaw.length > CHECKPOINT_LIMITS.maxTasks)
        throw new CheckpointError('invalid', `checkpoint plan.tasks exceeds ${CHECKPOINT_LIMITS.maxTasks} rows`);
    const planTasks = planTasksRaw.map((item, index) => {
        const raw = record(item, `plan.tasks[${index}]`);
        const writesPathsRaw = raw['writesPaths'];
        if (writesPathsRaw !== null && !Array.isArray(writesPathsRaw)) {
            throw new CheckpointError('invalid', `checkpoint plan.tasks[${index}].writesPaths must be an array or null`);
        }
        if (Array.isArray(writesPathsRaw) && writesPathsRaw.length > CHECKPOINT_LIMITS.writesPathItems) {
            throw new CheckpointError('invalid', `checkpoint plan.tasks[${index}].writesPaths exceeds ${CHECKPOINT_LIMITS.writesPathItems} paths`);
        }
        return {
            id: bounded(string(raw['id'], `plan.tasks[${index}].id`), CHECKPOINT_LIMITS.idChars, `plan.tasks[${index}].id`),
            title: bounded(string(raw['title'], `plan.tasks[${index}].title`), CHECKPOINT_LIMITS.titleChars, `plan.tasks[${index}].title`),
            writesPaths: writesPathsRaw === null
                ? null
                : writesPathsRaw.map((entry, pathIndex) => bounded(string(entry, `plan.tasks[${index}].writesPaths[${pathIndex}]`), CHECKPOINT_LIMITS.writesPathChars, `plan.tasks[${index}].writesPaths[${pathIndex}]`)),
        };
    });
    const plan = {
        source: enumeration(planRaw['source'], PLAN_SOURCES, 'plan.source'),
        taskCount: inRange(integer(planRaw['taskCount'], 'plan.taskCount'), 0, CHECKPOINT_LIMITS.maxTasks, 'plan.taskCount'),
        tasks: planTasks,
    };
    if (plan.taskCount !== plan.tasks.length) {
        throw new CheckpointError('invalid', `checkpoint plan.taskCount (${plan.taskCount}) does not match plan.tasks length (${plan.tasks.length})`);
    }
    const tasksRaw = root['tasks'];
    if (!Array.isArray(tasksRaw))
        throw new CheckpointError('invalid', 'checkpoint tasks must be an array');
    if (tasksRaw.length > CHECKPOINT_LIMITS.maxTasks)
        throw new CheckpointError('invalid', `checkpoint tasks exceeds ${CHECKPOINT_LIMITS.maxTasks} rows`);
    const tasks = tasksRaw.map((item, index) => {
        const raw = record(item, `tasks[${index}]`);
        return {
            id: bounded(string(raw['id'], `tasks[${index}].id`), CHECKPOINT_LIMITS.idChars, `tasks[${index}].id`),
            title: bounded(string(raw['title'], `tasks[${index}].title`), CHECKPOINT_LIMITS.titleChars, `tasks[${index}].title`),
            status: enumeration(raw['status'], TASK_STATUSES, `tasks[${index}].status`),
            attempts: inRange(integer(raw['attempts'], `tasks[${index}].attempts`), 0, CHECKPOINT_LIMITS.attemptsCeiling, `tasks[${index}].attempts`),
            ...(raw['error'] === undefined ? {} : { error: bounded(string(raw['error'], `tasks[${index}].error`), CHECKPOINT_LIMITS.errorChars, `tasks[${index}].error`) }),
        };
    });
    const agentsRaw = root['agents'];
    if (!Array.isArray(agentsRaw))
        throw new CheckpointError('invalid', 'checkpoint agents must be an array');
    if (agentsRaw.length > CHECKPOINT_LIMITS.maxAgents)
        throw new CheckpointError('invalid', `checkpoint agents exceeds ${CHECKPOINT_LIMITS.maxAgents} rows`);
    const agents = agentsRaw.map((item, index) => {
        const raw = record(item, `agents[${index}]`);
        return {
            role: enumeration(raw['role'], ROLE_NAMES, `agents[${index}].role`),
            outcome: enumeration(raw['outcome'], AGENT_OUTCOMES, `agents[${index}].outcome`),
            ...(raw['taskId'] === undefined ? {} : { taskId: bounded(string(raw['taskId'], `agents[${index}].taskId`), CHECKPOINT_LIMITS.idChars, `agents[${index}].taskId`) }),
            ...(raw['attempt'] === undefined ? {} : { attempt: inRange(integer(raw['attempt'], `agents[${index}].attempt`), 0, CHECKPOINT_LIMITS.attemptsCeiling, `agents[${index}].attempt`) }),
            ...(raw['route'] === undefined ? {} : { route: bounded(string(raw['route'], `agents[${index}].route`), CHECKPOINT_LIMITS.routeChars, `agents[${index}].route`) }),
            ...(raw['failureClass'] === undefined ? {} : { failureClass: bounded(string(raw['failureClass'], `agents[${index}].failureClass`), 40, `agents[${index}].failureClass`) }),
            ...(raw['reason'] === undefined ? {} : { reason: bounded(string(raw['reason'], `agents[${index}].reason`), CHECKPOINT_LIMITS.errorChars, `agents[${index}].reason`) }),
            ...(raw['startedAtMs'] === undefined ? {} : { startedAtMs: integer(raw['startedAtMs'], `agents[${index}].startedAtMs`) }),
            ...(raw['durationMs'] === undefined ? {} : { durationMs: inRange(integer(raw['durationMs'], `agents[${index}].durationMs`), 0, CHECKPOINT_LIMITS.msCeiling, `agents[${index}].durationMs`) }),
        };
    });
    const stagesRaw = root['stages'];
    if (!Array.isArray(stagesRaw))
        throw new CheckpointError('invalid', 'checkpoint stages must be an array');
    if (stagesRaw.length > CHECKPOINT_LIMITS.maxStages)
        throw new CheckpointError('invalid', `checkpoint stages exceeds ${CHECKPOINT_LIMITS.maxStages} rows`);
    const stages = stagesRaw.map((item, index) => {
        const raw = record(item, `stages[${index}]`);
        return {
            phase: enumeration(raw['phase'], PHASE_NAMES, `stages[${index}].phase`),
            status: enumeration(raw['status'], RUN_STATUSES, `stages[${index}].status`),
            ...(raw['startedAtMs'] === undefined ? {} : { startedAtMs: integer(raw['startedAtMs'], `stages[${index}].startedAtMs`) }),
            ...(raw['endedAtMs'] === undefined ? {} : { endedAtMs: integer(raw['endedAtMs'], `stages[${index}].endedAtMs`) }),
            ...(raw['error'] === undefined ? {} : { error: bounded(string(raw['error'], `stages[${index}].error`), CHECKPOINT_LIMITS.errorChars, `stages[${index}].error`) }),
        };
    });
    const evidenceRaw = root['evidence'];
    if (!Array.isArray(evidenceRaw))
        throw new CheckpointError('invalid', 'checkpoint evidence must be an array');
    if (evidenceRaw.length > CHECKPOINT_LIMITS.maxEvidence)
        throw new CheckpointError('invalid', `checkpoint evidence exceeds ${CHECKPOINT_LIMITS.maxEvidence} rows`);
    const evidence = evidenceRaw.map((item, index) => {
        const raw = record(item, `evidence[${index}]`);
        return {
            taskId: bounded(string(raw['taskId'], `evidence[${index}].taskId`), CHECKPOINT_LIMITS.idChars, `evidence[${index}].taskId`),
            criterion: bounded(string(raw['criterion'], `evidence[${index}].criterion`), CHECKPOINT_LIMITS.criterionChars, `evidence[${index}].criterion`),
            claim: bounded(string(raw['claim'], `evidence[${index}].claim`), CHECKPOINT_LIMITS.claimChars, `evidence[${index}].claim`),
            ...(raw['locator'] === undefined ? {} : { locator: bounded(string(raw['locator'], `evidence[${index}].locator`), CHECKPOINT_LIMITS.locatorChars, `evidence[${index}].locator`) }),
        };
    });
    const gitRaw = record(root['git'], 'git');
    const git = {
        dirty: boolean(gitRaw['dirty'], 'git.dirty'),
        ...(gitRaw['branch'] === undefined ? {} : { branch: bounded(string(gitRaw['branch'], 'git.branch'), CHECKPOINT_LIMITS.branchChars, 'git.branch') }),
        ...(gitRaw['head'] === undefined ? {} : { head: validateHead(string(gitRaw['head'], 'git.head')) }),
        ...(gitRaw['ahead'] === undefined ? {} : { ahead: inRange(integer(gitRaw['ahead'], 'git.ahead'), 0, CHECKPOINT_LIMITS.countCeiling, 'git.ahead') }),
        ...(gitRaw['behind'] === undefined ? {} : { behind: inRange(integer(gitRaw['behind'], 'git.behind'), 0, CHECKPOINT_LIMITS.countCeiling, 'git.behind') }),
    };
    const timeRaw = record(root['time'], 'time');
    const time = {
        startedAtMs: integer(timeRaw['startedAtMs'], 'time.startedAtMs'),
        updatedAtMs: integer(timeRaw['updatedAtMs'], 'time.updatedAtMs'),
        ...(timeRaw['durationMs'] === undefined ? {} : { durationMs: inRange(integer(timeRaw['durationMs'], 'time.durationMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'time.durationMs') }),
        ...(timeRaw['deadlineAtMs'] === undefined ? {} : { deadlineAtMs: integer(timeRaw['deadlineAtMs'], 'time.deadlineAtMs') }),
    };
    const minContextRaw = record(root['minContext'], 'minContext');
    const minContext = {
        objective: bounded(string(minContextRaw['objective'], 'minContext.objective'), CHECKPOINT_LIMITS.objectiveChars, 'minContext.objective'),
        digest: bounded(string(minContextRaw['digest'], 'minContext.digest'), CHECKPOINT_LIMITS.digestChars, 'minContext.digest'),
        source: enumeration(minContextRaw['source'], MIN_CONTEXT_SOURCES, 'minContext.source'),
    };
    const limitsRaw = record(root['limits'], 'limits');
    const limits = {
        maxConcurrency: inRange(integer(limitsRaw['maxConcurrency'], 'limits.maxConcurrency'), 1, CHECKPOINT_LIMITS.countCeiling, 'limits.maxConcurrency'),
        maxRetries: inRange(integer(limitsRaw['maxRetries'], 'limits.maxRetries'), 0, CHECKPOINT_LIMITS.countCeiling, 'limits.maxRetries'),
        maxTasks: inRange(integer(limitsRaw['maxTasks'], 'limits.maxTasks'), 1, CHECKPOINT_LIMITS.countCeiling, 'limits.maxTasks'),
        ...(limitsRaw['timeoutMs'] === undefined ? {} : { timeoutMs: inRange(integer(limitsRaw['timeoutMs'], 'limits.timeoutMs'), 1, CHECKPOINT_LIMITS.msCeiling, 'limits.timeoutMs') }),
    };
    const watchdogRaw = record(root['watchdog'], 'watchdog');
    const watchdog = {
        deadlineHit: boolean(watchdogRaw['deadlineHit'], 'watchdog.deadlineHit'),
        cancelled: boolean(watchdogRaw['cancelled'], 'watchdog.cancelled'),
        ...(watchdogRaw['deadlineMs'] === undefined ? {} : { deadlineMs: inRange(integer(watchdogRaw['deadlineMs'], 'watchdog.deadlineMs'), 0, CHECKPOINT_LIMITS.msCeiling, 'watchdog.deadlineMs') }),
        ...(watchdogRaw['cancelReason'] === undefined ? {} : { cancelReason: bounded(string(watchdogRaw['cancelReason'], 'watchdog.cancelReason'), CHECKPOINT_LIMITS.causeChars, 'watchdog.cancelReason') }),
    };
    const integrityRaw = root['integrity'];
    let integrity;
    if (integrityRaw !== undefined && integrityRaw !== null) {
        const raw = record(integrityRaw, 'integrity');
        const algorithm = string(raw['algorithm'], 'integrity.algorithm');
        if (algorithm !== 'sha256')
            throw new CheckpointError('invalid', `checkpoint integrity.algorithm must be "sha256" (got "${algorithm}")`);
        const checksum = string(raw['checksum'], 'integrity.checksum');
        if (!/^[0-9a-f]{64}$/.test(checksum))
            throw new CheckpointError('invalid', 'checkpoint integrity.checksum must be 64 lowercase hex characters');
        integrity = {
            algorithm,
            checksum,
            bytes: inRange(integer(raw['bytes'], 'integrity.bytes'), 1, CHECKPOINT_LIMITS.countCeiling, 'integrity.bytes'),
        };
    }
    return {
        version,
        run,
        plan,
        tasks,
        agents,
        stages,
        evidence,
        git,
        time,
        minContext,
        limits,
        watchdog,
        ...(integrity === undefined ? {} : { integrity }),
    };
}
/* ------------------------------------------------------------------ *
 * Documented limit contract
 * ------------------------------------------------------------------ */
/**
 * Compare recorded limits against the documented engine-hook contract
 * ({@link ENGINE_HOOK_LIMITS}). Returns one human-readable violation per
 * out-of-envelope value; an empty list means the run matched the contract.
 * This never throws and never blocks a write — it is a reporting aid.
 */
export function limitContractViolations(limits) {
    const violations = [];
    const { maxConcurrency, maxRetries } = ENGINE_HOOK_LIMITS;
    if (limits.maxConcurrency > maxConcurrency.max) {
        violations.push(`maxConcurrency ${limits.maxConcurrency} exceeds the documented maximum ${maxConcurrency.max}`);
    }
    if (limits.maxRetries > maxRetries.max) {
        violations.push(`maxRetries ${limits.maxRetries} exceeds the documented maximum ${maxRetries.max}`);
    }
    return violations;
}
//# sourceMappingURL=schema.js.map