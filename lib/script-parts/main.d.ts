import type { NamingLanguage } from '../naming.js';
import type { FailureClass, ModelRoute, NormalizedTask, ResolvedConfig, RoleName, SynthesisPolicy } from '../types.js';
export declare function guestMain(): string;
/** Assemble the full guest script from its moved blocks (single concatenation order lives here). */
export declare function assembleWorkflowScript(): string;
/** One complete workflow-start request payload. */
export interface WorkflowRequestPayload {
    script: string;
    meta: {
        name: string;
        description: string;
        phases: {
            title: string;
            detail: string;
        }[];
    };
    args: {
        objective: string;
        tasks: NormalizedTask[] | null;
        maxConcurrency: number;
        maxRetries: number;
        maxTasks: number;
        maxTotalAgents: number;
        /**
         * Q6: cooperative per-call timeout in milliseconds. The script races every
         * `agent()` against it and settles a loser as a `timeout` failure of that
         * attempt, so one hung child costs a retry instead of the whole run.
         */
        childTimeoutMs: number;
        /** The deadline the plugin enforces for this run (0 = unlimited, no host timer; the guest never arms its own timer). */
        timeoutMs: number;
        roles: Record<RoleName, ModelRoute[]>;
        /**
         * Q8: the single guardian route that judges a stalled child before the
         * script kills it. Absent when no guardian is configured — the run then
         * settles a timed-out call straight to its task's bounded retry, exactly
         * as it did before the guardian existed.
         */
        guardianModel?: ModelRoute;
        /**
         * Final-answer policy: `deterministic`, `model`, or `layered` (the Section IV
         * layered policy, which travels as the third runtime value). The script maps
         * the policy onto the report's host-validated `synthesis.mode`.
         */
        synthesis: SynthesisPolicy;
        /** Failure classes that advance a role's chain; empty = built-in policy. */
        switchOn: FailureClass[];
        /** Copy language for every user-visible progress string (Issue #22 P1-3). */
        naming: {
            language: NamingLanguage;
        };
        /**
         * Compiled earlier rounds of this session (v0.5), already bounded and
         * redacted by `src/carryover.ts`. Absent on a first round.
         */
        carryover?: string;
        /**
         * L1 inheritance (v0.13): the task-level decisions a new round inherits, already
         * compiled and bounded by `src/carryover.ts`. Absent on a first round.
         */
        inheritance?: string;
        /**
         * Cross-run hint (C1, approximate): route labels other live runs
         * configured, snapshotted host-side at admission. Absent/empty on a
         * first or solitary run, which keeps the payload identical to before.
         */
        busyRoutes?: string[];
        /**
         * Output switch 1/2: build the plain-language narrative (default `true`).
         *
         * Omitted means the default, exactly like `src/config.ts`
         * `DEFAULT_HUMAN_SUMMARY`, so a caller that predates the switch keeps the
         * narrative it always got. `false` ships the machine report alone: no
         * polish call, no fallback narrative, `synthesis.mode = "deterministic"`.
         */
        humanSummary?: boolean;
        /**
         * Output switch 2/2: append the narrative's provenance (default `false`).
         *
         * Omitted means the default, exactly like `src/config.ts`
         * `DEFAULT_SHOW_DIAGNOSTICS`. `true` adds one bounded line naming the layer
         * that wrote the narrative and why a polish was dropped; the complete
         * machine ledger is rendered host-side from the same report.
         */
        showDiagnostics?: boolean;
    };
    maxTotalAgents: number;
}
/** Child calls one role may charge, derived from its configured chain. */
export interface RouteBudget {
    /** Calls the planner may make (1 when it inherits the route). */
    planner: number;
    /** Worker calls per task attempt. */
    worker: number;
    /** Verifier calls per task attempt. */
    verifier: number;
    /** Supervisor calls per task attempt (0 when no supervisor chain is configured). */
    supervisor: number;
    /** Synthesizer calls per run (0 when synthesis is deterministic). */
    synthesizer: number;
    /**
     * Whether guardian adjudication is configured (Q8). When it is, every timed-out
     * child call may spend up to {@link GUARDIAN_MAX_WAITS} adjudication calls, so
     * the child cap multiplies the per-attempt block to keep AGENT_CAP from firing
     * exactly when the guardian is giving a stalled child its second chance.
     */
    guardian?: boolean;
}
/**
 * Derive the per-run call budget from the configured chains.
 *
 * The synthesizer budget follows the configured policy, not the two-value
 * `SynthesisMode` type union: the layered policy travels as the runtime value
 * `"layered"` and spends synthesizer calls per run — but only when a chain is
 * configured, because a layered run without a chain answers from the
 * deterministic narrative and spends nothing.
 *
 * With a chain, the budget covers the whole gated pipeline: up to
 * {@link SUMMARY_MAX_ATTEMPTS} drafts (the first draft plus the bounded rewrites)
 * times the chain length, because each draft call may fall through every route.
 * A single-draft budget would abort a rewrite-heavy run with AGENT_CAP exactly
 * when the gate is doing its job.
 */
export declare function routeBudgetFor(config: ResolvedConfig): RouteBudget;
/**
 * Calculate the hard child cap for a run.
 *
 * Chains multiply the per-attempt cost, so the cap must be derived from the
 * effective routes; a cap that only counts attempts would abort a run mid-flight
 * with AGENT_CAP as soon as a fallback route is used. Guardian adjudication
 * (Q8) adds at most {@link GUARDIAN_MAX_WAITS} calls per timed-out call, so
 * with a guardian configured every per-call block is widened by that factor;
 * without one the formula is byte-identical to the pre-guardian one.
 *
 * The planning leg is counted at {@link PLANNER_LEG_CALLS} chain walks, because
 * its resubmit and its route re-fire are real children: a cap that counted one
 * walk aborted the rescue with AGENT_CAP exactly when it was recovering the run.
 * Replan boundaries are counted at two walks each: a boundary asks once, and a
 * first answer that came back without a structured result is asked once more in the
 * same boundary (the same corridor the worker and the summary draft have). Both are
 * real children, so a cap that counted one walk would abort the run with AGENT_CAP
 * exactly when the resubmit was recovering the merge.
 */
export declare function maxTotalAgentsFor(tasks: number, retries: number, budget?: RouteBudget, replans?: number): number;
export declare function buildWorkflowRequest(objective: string, tasks: NormalizedTask[] | undefined, config: ResolvedConfig, namingLanguage?: NamingLanguage, carryover?: string, busyRoutes?: string[], inheritance?: string, replanToken?: string, captainBrief?: string): WorkflowRequestPayload;
//# sourceMappingURL=main.d.ts.map