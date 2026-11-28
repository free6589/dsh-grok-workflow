/**
 * Bridge: a run checkpoint becomes a sealed resume document.
 *
 * Why this module exists (subagent resume): the raw run journal
 * (`src/checkpoint/`) records what the *run* did — `verified`, `failed`,
 * `pending`, `running`, `cancelled` — while the restore policy speaks the
 * *restore* contract (`completed`, `interrupted`, `failed`, `gated`,
 * `evidence-incomplete`, `success`). A cut run must cross that boundary as
 * `interrupted` — the state the policy re-drives — never as `failed`, which
 * the policy hands back to the planner. Without the bridge, a stream cut is
 * misfiled as planner business and never re-driven.
 *
 * The status table, in full:
 *
 * - `verified` + no cut → `completed` (retained, never re-run).
 * - `verified` + cut → `evidence-incomplete` (artifacts kept, verification
 *   re-run — the work verified but its tail was cut).
 * - `failed` + cut → `interrupted` (re-driven, never replanned — the failure
 *   line is a cut line, not a judgement).
 * - any unfinished status + cut → `interrupted` (a cut run is continued, not
 *   judged).
 * - `failed` without a cut → `failed` (the planner's business, as before).
 * - any other unfinished status without a cut → `interrupted` (the run never
 *   finished the task).
 *
 * The bridge seals through `buildResumeCheckpoint`, so the document it returns
 * is ready for `validateResumeCheckpoint`: digest gate, version gate and
 * conflict gate all still apply. A checkpoint with no task rows seals to a
 * valid but empty document — the policy then plans nothing, which is the
 * honest answer for a run that never got a plan.
 *
 * @module dsh-grok-workflow/resume-bridge
 */
import { buildResumeCheckpoint } from './validator.js';
/**
 * The restore status one run-checkpoint task maps to.
 *
 * - `verified` + no cut → `completed` (retained, never re-run).
 * - `verified` + cut → `evidence-incomplete` (artifacts kept, verification re-run).
 * - `failed` + cut → `interrupted` (re-driven, never replanned).
 * - any unfinished status → `interrupted` (a cut run is continued, not judged).
 * - `failed` without a cut → `failed` (the planner's business, as before).
 * @param status - the run checkpoint's task status.
 * @param truncated - whether the child behind the task was cut off.
 * @returns The restore status.
 */
export function resumeStatusFor(status, truncated) {
    if (status === 'verified')
        return truncated ? 'evidence-incomplete' : 'completed';
    if (truncated)
        return 'interrupted';
    if (status === 'failed')
        return 'failed';
    return 'interrupted';
}
/** Why a task got the status it got (for a log line, not for the document). */
export function bridgeReasonFor(status, truncated) {
    if (status === 'verified')
        return truncated ? 'cut-and-verified' : 'verified-work';
    if (truncated)
        return 'cut-work';
    return 'unfinished-work';
}
const URL_SHAPE = /^https?:\/\//;
const COMMAND_SHAPE = /^(?:[a-z0-9._-]+\s|npm|npx|pnpm|yarn|node|git|bash|sh|timeout)\b/i;
/** The evidence kind a locator's own shape names. */
function evidenceKindOf(locator) {
    if (locator === undefined)
        return 'other';
    if (URL_SHAPE.test(locator))
        return 'url';
    if (COMMAND_SHAPE.test(locator))
        return 'command';
    return 'file';
}
/** One evidence row from the checkpoint, in the restore document's vocabulary. */
function evidenceOfRow(row) {
    const locator = row.locator;
    return {
        kind: evidenceKindOf(locator),
        ref: locator ?? row.criterion,
        note: row.claim,
    };
}
/** Deduplicate evidence by what it cites, keeping the first occurrence. */
function uniqueEvidence(entries) {
    const seen = new Set();
    const kept = [];
    for (const entry of entries) {
        const key = `${entry.kind}\u0000${entry.ref}\u0000${entry.note ?? ''}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        kept.push({ ...entry });
    }
    return kept;
}
function lookupVerdict(lookup, id) {
    if (lookup === undefined)
        return undefined;
    if (lookup instanceof Map)
        return lookup.get(id);
    const record = lookup;
    return Object.prototype.hasOwnProperty.call(record, id)
        ? record[id]
        : undefined;
}
/** An ISO-8601 stamp for the document, from a possibly unusable number. */
function isoStamp(ms, fallback) {
    const value = typeof ms === 'number' && Number.isFinite(ms) ? ms : fallback;
    return new Date(value).toISOString();
}
/**
 * Build a sealed restore document from a run checkpoint.
 *
 * The task order is the checkpoint's own order, numbered from 1, because the
 * restore policy sorts by `seq` and reads it as the plan position. A checkpoint
 * with no task rows produces a valid but empty document — the policy then plans
 * nothing, which is the honest answer for a run that never got a plan.
 * @param checkpoint - a verified run checkpoint.
 * @param options - clock, identity, truncations and observed artifacts.
 * @returns The sealed resume document, ready for `validateResumeCheckpoint`.
 */
export function resumeCheckpointFromRun(checkpoint, options = {}) {
    const now = options.now ?? Date.now();
    const evidenceByTask = new Map();
    for (const row of checkpoint.evidence) {
        const bucket = evidenceByTask.get(row.taskId);
        if (bucket === undefined)
            evidenceByTask.set(row.taskId, [evidenceOfRow(row)]);
        else
            bucket.push(evidenceOfRow(row));
    }
    const tasks = checkpoint.tasks.map((task, index) => {
        const verdict = lookupVerdict(options.truncations, task.id);
        const truncated = verdict?.truncated === true;
        const artifacts = options.artifacts?.[task.id];
        const evidence = uniqueEvidence([
            ...(evidenceByTask.get(task.id) ?? []),
            ...((artifacts?.evidence ?? []).map((entry) => ({ ...entry }))),
        ]);
        return {
            id: task.id,
            seq: index + 1,
            ...(task.title === undefined ? {} : { title: task.title }),
            status: resumeStatusFor(task.status, truncated),
            ...(artifacts?.outputs !== undefined ? { outputs: [...artifacts.outputs] } : {}),
            ...(artifacts?.files !== undefined ? { files: [...artifacts.files] } : {}),
            ...(evidence.length === 0 ? {} : { evidence }),
            updatedAt: isoStamp(checkpoint.time.updatedAtMs, now),
        };
    });
    return buildResumeCheckpoint({
        runId: checkpoint.run.runId,
        ...(options.workflowId ?? checkpoint.run.name === undefined ? {} : { workflowId: checkpoint.run.name }),
        updatedAt: isoStamp(checkpoint.time.updatedAtMs, now),
        tasks,
    });
}
//# sourceMappingURL=bridge.js.map