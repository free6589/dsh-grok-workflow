/**
 * Mid-run replan: merge new demands into a plan that is already executing.
 *
 * The planner is the thing behind a run; a user message that arrives while the run
 * is working must change the *remaining* plan, not restart the round. This module
 * is the host-visible half of that merge, and the only copy of the rule set: the
 * workflow script cannot import host code, so {@link replanMergeSource} emits the
 * same implementation into the guest realm and {@link mergeReplan} evaluates that
 * exact source in the host, which is why the two can never drift.
 *
 * What a merge may and may not touch is the whole safety story:
 *
 * - a settled task (`verified` / `failed` / `blocked`) is terminal and read-only,
 *   so completed, verified work is preserved and never re-executed;
 * - a running task has no per-child handle in the engine, so editing it can only
 *   mean abandoning work already paid for; an edit that names one is refused and
 *   the task runs to its own settlement;
 * - only unstarted tasks (the remaining waves) can be added, updated, removed or
 *   re-ordered, and every resulting dependency still has to point at a settled task
 *   or an earlier remaining wave.
 *
 * A refused merge changes nothing: the run continues on the plan it already had,
 * which is why a bad replan can never lose a run.
 */
import type { NormalizedTask, TaskStatus } from './types.js';
/** Bounds on one merge. Every number is also enforced in the guest source below. */
export declare const REPLAN_LIMITS: {
    /** Edits one boundary may apply. */
    readonly maxEdits: 16;
    /** Human-readable decision lines carried into the report. */
    readonly maxDecisions: 12;
    /** Character bound on one decision line. */
    readonly decisionChars: 240;
    /** Intents one boundary child may pull, and the queue bound the host enforces. */
    readonly maxIntents: 8;
    /** Character bound on one queued intent. */
    readonly intentChars: 2000;
    /** Boundary planner calls one run may spend on replanning, whatever its wave count. */
    readonly maxBoundaries: 4;
};
/** One change a replan asks for. Ids are explicit because the merge never guesses. */
export interface ReplanEdit {
    action: 'add' | 'update' | 'remove';
    /** Target task id (`update` / `remove`). */
    id?: string;
    /** New task, or the replacement fields of an unstarted task. */
    task?: Partial<NormalizedTask> & {
        id?: string;
    };
}
/** What one boundary asks the plan to become. */
export interface ReplanRequest {
    /** The version this merge would produce; must be exactly current + 1. */
    version: number;
    edits: ReplanEdit[];
    /** Optional explicit wave grouping for the remaining tasks, in execution order. */
    order?: string[][];
    /** Why the merge was requested, in the planner's own words (bounded by the caller). */
    reason?: string;
    /** Intent ids folded into this merge, for the report ledger. */
    intentIds?: string[];
}
/** The plan as the scheduler holds it at a wave boundary. */
export interface ReplanState {
    /** Current plan version, 1-based. */
    version: number;
    /** Settled task ids and their terminal status. */
    settled: Record<string, TaskStatus>;
    /** Task ids whose child call is still running. */
    inFlight?: string[];
    /** Unstarted waves, in execution order. */
    waves: NormalizedTask[][];
    /** Waves already executed before this boundary (counted against the ceiling). */
    wavesUsed?: number;
    /** Total task ceiling for the run. */
    maxTasks: number;
    /** Wave ceiling for the run. */
    waveLimit: number;
}
/** One applied merge, as the report and the panel narrate it. */
export interface ReplanDecision {
    version: number;
    wave: number;
    decision: 'applied' | 'rejected' | 'none';
    reason: string;
    addedTaskIds: string[];
    updatedTaskIds: string[];
    removedTaskIds: string[];
    reordered: boolean;
}
/** Result of one merge attempt. A rejection leaves `waves` untouched. */
export type ReplanOutcome = {
    ok: true;
    version: number;
    waves: NormalizedTask[][];
    addedTaskIds: string[];
    updatedTaskIds: string[];
    removedTaskIds: string[];
    reordered: boolean;
    decisions: string[];
} | {
    ok: false;
    /** The version the plan stayed at. */
    version: number;
    reason: string;
};
type MergeFn = (state: ReplanState, request: ReplanRequest) => ReplanOutcome;
/** Script-realm source for the merge, emitted into the generated workflow script. */
export declare function replanMergeSource(): string;
/**
 * The same merge, evaluated once in the host.
 *
 * Tests call this function instead of a second hand-written copy, so the rule set
 * they pin is the one the guest runs.
 */
export declare const mergeReplan: MergeFn;
export {};
//# sourceMappingURL=replan.d.ts.map