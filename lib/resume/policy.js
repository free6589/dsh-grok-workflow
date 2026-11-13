/**
 * Safe restore policy for resume checkpoints.
 *
 * The policy turns a *validated* checkpoint into a restore plan. It is the only
 * place that decides what a task's journaled state means for restore, and it is
 * deliberately conservative:
 *
 * - The five journaled work states are **retained**: completed, interrupted,
 *   failed, gated, evidence-incomplete. Retention preserves the task's outputs,
 *   files and evidence verbatim — restore never re-runs completed work and
 *   never throws away what an interrupted or failed attempt already produced.
 * - A bare `success` mark is **never retained**. Success is a self-report, not
 *   verified evidence; a restored run must re-earn it, so the task is queued
 *   for replan with nothing preserved from the claim.
 *
 * Composition with the validator is fail closed: `evaluateResumeCheckpoint`
 * refuses (and never returns a plan) whenever the validator refuses, so a
 * version mismatch, corruption, or conflict can never trigger an auto-restore.
 */
import { validateResumeCheckpoint } from './validator.js';
/**
 * The journaled states the policy retains across restore. Exactly these five —
 * a `success` mark is deliberately absent.
 */
export const RETAINED_STATUSES = new Set([
    'completed',
    'interrupted',
    'failed',
    'gated',
    'evidence-incomplete',
]);
/** Per-status restore rules. Total over the status vocabulary. */
const ACTION_BY_STATUS = {
    completed: {
        action: 'retain',
        reason: 'completed work is retained; outputs, files and evidence carry over unchanged and are not re-run',
    },
    gated: {
        action: 'retain',
        reason: 'gate decision is retained; the task stays gated awaiting the gate and nothing is re-run',
    },
    interrupted: {
        action: 'redrive',
        reason: 'interrupted work is retained and re-driven; partial outputs and evidence are preserved',
    },
    failed: {
        action: 'replan',
        reason: 'failed work is retained for the planner; the failure and its evidence are preserved',
    },
    'evidence-incomplete': {
        action: 'reverify',
        reason: 'outputs and files are preserved, but evidence is incomplete; verification must re-run before the task counts as done',
    },
    success: {
        action: 'replan',
        reason: 'a bare success mark is a self-report, not verified evidence; it is never retained across restore and is queued for replan',
    },
};
/** Plan the restore of a *validated* checkpoint. */
export function planRestore(validated) {
    const tasks = [...validated.checkpoint.tasks].sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const decisions = tasks.map((task) => {
        const rule = ACTION_BY_STATUS[task.status];
        const retained = RETAINED_STATUSES.has(task.status);
        const preserve = retained
            ? {
                outputs: [...(task.outputs ?? [])],
                files: [...(task.files ?? [])],
                evidence: [...(task.evidence ?? [])],
            }
            : { outputs: [], files: [], evidence: [] };
        return {
            id: task.id,
            seq: task.seq,
            status: task.status,
            action: rule.action,
            retained,
            preserve,
            reason: rule.reason,
        };
    });
    const counts = { retain: 0, redrive: 0, reverify: 0, replan: 0 };
    for (const decision of decisions)
        counts[decision.action] += 1;
    const replanTaskIds = decisions
        .filter((d) => d.action === 'replan' || d.action === 'reverify')
        .map((d) => d.id);
    return {
        runId: validated.checkpoint.runId,
        restorable: true,
        replanRequired: replanTaskIds.length > 0,
        replanTaskIds,
        counts,
        tasks: decisions,
    };
}
/**
 * Validate and plan in one fail-closed step. Whenever the validator refuses,
 * the result is a refusal with the validator's reason — never a plan.
 */
export function evaluateResumeCheckpoint(input, expected = {}) {
    const validated = validateResumeCheckpoint(input, expected);
    if (!validated.ok) {
        return { restorable: false, reason: validated.reason, detail: validated.detail };
    }
    return { restorable: true, plan: planRestore(validated) };
}
//# sourceMappingURL=policy.js.map