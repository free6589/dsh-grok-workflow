/**
 * Resume-checkpoint validator (fail closed).
 *
 * Boundary: pure, synchronous, offline. Validates a restore-candidate document
 * for the workflow resume path — envelope, format version, integrity digest,
 * per-record structure, and cross-record consistency. Every refusal carries a
 * machine-readable `reason` (`version-mismatch` | `corruption` | `conflict`)
 * plus a human-readable `detail`. The restore policy (`./policy.js`) refuses to
 * build a plan from anything this validator did not accept, so a bad checkpoint
 * can never trigger an auto-restore.
 *
 * This module owns the *restore* document contract
 * (`grok-workflow.resume-checkpoint`), whose task states are restore-domain
 * states: completed / interrupted / failed / gated / evidence-incomplete /
 * success. The raw run journal is owned by `src/checkpoint/`; mapping journal
 * states into this contract happens at integration time, outside this module.
 *
 * Classification choices: damaged bytes, torn JSON, wrong envelope, bad digest,
 * and malformed records are `corruption`; a document sealed with a foreign
 * format version is `version-mismatch`; a structurally intact, sealed document
 * whose *claims* are inconsistent with the restore contract (unknown task
 * status, duplicate task id, duplicate seq, wrong run) is `conflict`.
 */
import { createHash } from 'node:crypto';
/** Envelope discriminator of the restore document. */
export const RESUME_CHECKPOINT_KIND = 'grok-workflow.resume-checkpoint';
/** Format version this validator accepts; any other value refuses restore. */
export const RESUME_CHECKPOINT_VERSION = 1;
/**
 * Restore-domain task states the validator accepts. `success` is structurally
 * valid but the restore policy never retains it (a self-report is not
 * verification); see `RETAINED_STATUSES` in `./policy.js`.
 */
export const RESUME_TASK_STATUSES = [
    'completed',
    'interrupted',
    'failed',
    'gated',
    'evidence-incomplete',
    'success',
];
const STATUS_SET = new Set(RESUME_TASK_STATUSES);
const EVIDENCE_KINDS = ['file', 'command', 'url', 'other'];
const EVIDENCE_KIND_SET = new Set(EVIDENCE_KINDS);
/** Deterministic JSON: sorted object keys, arrays in order, no whitespace. */
export function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}
/** Digest of an unsealed document body (everything except `digest`). */
export function resumeDigest(body) {
    return createHash('sha256').update(canonicalJson(body)).digest('hex');
}
/** Seal a document body: computes and attaches the integrity digest. */
export function sealResumeCheckpoint(body) {
    return { ...body, digest: resumeDigest(body) };
}
/** Build a sealed document in one step (the normal way tests and wiring seal). */
export function buildResumeCheckpoint(input) {
    const { runId, workflowId, updatedAt, tasks } = input;
    return sealResumeCheckpoint({
        kind: RESUME_CHECKPOINT_KIND,
        version: RESUME_CHECKPOINT_VERSION,
        runId,
        ...(workflowId === undefined ? {} : { workflowId }),
        updatedAt,
        tasks,
    });
}
function isIsoDateString(value) {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function isPositiveInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}
/** Validate a restore-candidate document; refuse means no auto-restore. */
export function validateResumeCheckpoint(input, expected = {}) {
    let candidate = input;
    if (typeof candidate === 'string') {
        try {
            candidate = JSON.parse(candidate);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return refuse('corruption', `checkpoint is not valid JSON: ${message}`);
        }
    }
    if (!isPlainObject(candidate)) {
        return refuse('corruption', 'checkpoint is not a JSON object');
    }
    if (candidate['kind'] !== RESUME_CHECKPOINT_KIND) {
        return refuse('corruption', `not a resume checkpoint document (kind=${JSON.stringify(candidate['kind'] ?? null)}, expected ${RESUME_CHECKPOINT_KIND})`);
    }
    const version = candidate['version'];
    if (typeof version !== 'number' || !Number.isInteger(version)) {
        return refuse('corruption', `checkpoint version is missing or not an integer (got ${JSON.stringify(version ?? null)})`);
    }
    if (version !== RESUME_CHECKPOINT_VERSION) {
        return refuse('version-mismatch', `checkpoint format version ${version} is not supported; this build restores version ${RESUME_CHECKPOINT_VERSION} only`);
    }
    const digest = candidate['digest'];
    if (typeof digest !== 'string' || digest.length === 0) {
        return refuse('corruption', 'checkpoint is missing its integrity digest');
    }
    const runId = candidate['runId'];
    if (!isNonEmptyString(runId)) {
        return refuse('corruption', 'checkpoint is missing a non-empty runId');
    }
    const updatedAt = candidate['updatedAt'];
    if (typeof updatedAt !== 'string' || !isIsoDateString(updatedAt)) {
        return refuse('corruption', `checkpoint updatedAt is not an ISO-8601 timestamp (got ${JSON.stringify(updatedAt ?? null)})`);
    }
    const workflowId = candidate['workflowId'];
    if (workflowId !== undefined && !isNonEmptyString(workflowId)) {
        return refuse('corruption', 'checkpoint workflowId is present but not a non-empty string');
    }
    const rawTasks = candidate['tasks'];
    if (!Array.isArray(rawTasks)) {
        return refuse('corruption', 'checkpoint tasks is not an array');
    }
    // Integrity gate: before trusting any record, the document must match the
    // digest it was sealed with. A mismatch means the bytes were modified or torn
    // after sealing — restore is refused outright.
    const { digest: _omit, ...body } = candidate;
    const recomputed = resumeDigest(body);
    if (recomputed !== digest) {
        return refuse('corruption', `integrity digest mismatch: journal sealed ${digest.slice(0, 12)}…, document hashes ${recomputed.slice(0, 12)}… (modified or torn after sealing)`);
    }
    const tasks = [];
    for (let i = 0; i < rawTasks.length; i++) {
        const raw = rawTasks[i];
        if (!isPlainObject(raw)) {
            return refuse('corruption', `tasks[${i}] is not an object`);
        }
        const id = raw['id'];
        if (!isNonEmptyString(id)) {
            return refuse('corruption', `tasks[${i}].id is missing or not a non-empty string`);
        }
        const seq = raw['seq'];
        if (!isPositiveInteger(seq)) {
            return refuse('corruption', `tasks[${i}] (id ${JSON.stringify(id)}).seq is not a positive integer (got ${JSON.stringify(seq ?? null)})`);
        }
        const status = raw['status'];
        if (typeof status !== 'string' || !STATUS_SET.has(status)) {
            return refuse('conflict', `tasks[${i}] (id ${JSON.stringify(id)}) claims status ${JSON.stringify(status ?? null)}, which is not a restore status (expected one of ${RESUME_TASK_STATUSES.join(', ')})`);
        }
        const label = `tasks[${i}] (id ${JSON.stringify(id)})`;
        if (raw['title'] !== undefined && typeof raw['title'] !== 'string') {
            return refuse('corruption', `${label}.title is present but not a string`);
        }
        if (raw['attempt'] !== undefined && !isPositiveInteger(raw['attempt'])) {
            return refuse('corruption', `${label}.attempt is present but not a positive integer`);
        }
        if (raw['updatedAt'] !== undefined && (typeof raw['updatedAt'] !== 'string' || !isIsoDateString(raw['updatedAt']))) {
            return refuse('corruption', `${label}.updatedAt is present but not an ISO-8601 timestamp`);
        }
        for (const field of ['outputs', 'files']) {
            if (raw[field] !== undefined && !isStringArray(raw[field])) {
                return refuse('corruption', `${label}.${field} is present but not an array of non-empty strings`);
            }
        }
        let evidence;
        if (raw['evidence'] !== undefined) {
            if (!Array.isArray(raw['evidence'])) {
                return refuse('corruption', `${label}.evidence is present but not an array`);
            }
            evidence = [];
            for (let j = 0; j < raw['evidence'].length; j++) {
                const entry = raw['evidence'][j];
                if (!isPlainObject(entry)) {
                    return refuse('corruption', `${label}.evidence[${j}] is not an object`);
                }
                if (typeof entry['kind'] !== 'string' || !EVIDENCE_KIND_SET.has(entry['kind'])) {
                    return refuse('corruption', `${label}.evidence[${j}].kind ${JSON.stringify(entry['kind'] ?? null)} is not one of ${EVIDENCE_KINDS.join(', ')}`);
                }
                if (!isNonEmptyString(entry['ref'])) {
                    return refuse('corruption', `${label}.evidence[${j}].ref is missing or not a non-empty string`);
                }
                if (entry['note'] !== undefined && typeof entry['note'] !== 'string') {
                    return refuse('corruption', `${label}.evidence[${j}].note is present but not a string`);
                }
                evidence.push({
                    kind: entry['kind'],
                    ref: entry['ref'],
                    ...(entry['note'] === undefined ? {} : { note: entry['note'] }),
                });
            }
        }
        tasks.push({
            id,
            seq,
            status: status,
            ...(raw['title'] === undefined ? {} : { title: raw['title'] }),
            ...(raw['attempt'] === undefined ? {} : { attempt: raw['attempt'] }),
            ...(raw['updatedAt'] === undefined ? {} : { updatedAt: raw['updatedAt'] }),
            ...(raw['outputs'] === undefined ? {} : { outputs: raw['outputs'] }),
            ...(raw['files'] === undefined ? {} : { files: raw['files'] }),
            ...(evidence === undefined ? {} : { evidence }),
        });
    }
    // Cross-record consistency: the document is intact, so now its claims must
    // not contradict each other.
    const seenIds = new Map();
    const seenSeqs = new Map();
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const firstAt = seenIds.get(task.id);
        if (firstAt !== undefined) {
            return refuse('conflict', `duplicate task id ${JSON.stringify(task.id)} at tasks[${i}] (first seen at tasks[${firstAt}])`);
        }
        seenIds.set(task.id, i);
        const owner = seenSeqs.get(task.seq);
        if (owner !== undefined) {
            return refuse('conflict', `tasks[${i}] (id ${JSON.stringify(task.id)}) reuses seq ${task.seq} already claimed by ${JSON.stringify(owner)}`);
        }
        seenSeqs.set(task.seq, task.id);
    }
    if (expected.runId !== undefined && runId !== expected.runId) {
        return refuse('conflict', `checkpoint belongs to run ${JSON.stringify(runId)}, refusing restore into run ${JSON.stringify(expected.runId)}`);
    }
    return {
        ok: true,
        checkpoint: {
            kind: RESUME_CHECKPOINT_KIND,
            version: RESUME_CHECKPOINT_VERSION,
            runId,
            ...(workflowId === undefined ? {} : { workflowId }),
            updatedAt,
            tasks,
            digest,
        },
    };
}
function refuse(reason, detail) {
    return { ok: false, reason, detail };
}
//# sourceMappingURL=validator.js.map