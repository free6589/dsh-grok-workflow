/**
 * Cooperative timeouts (Q6): three tiers, one funnel, no host-side child kill.
 *
 * The engine offers exactly one cancellation handle — `WorkflowRun.cancel()`, which
 * stops the whole run — so a single hung child cannot be killed from the host
 * (`src/guardian.ts` can only cancel the run). The fix is therefore inside the script:
 * every `agent()` call races a timer, and a call that loses the race is settled as a
 * failed attempt, which the existing bounded retry already knows how to continue.
 *
 * The funnel, cheapest first:
 *
 * | tier | bound | who enforces it | what happens |
 * | --- | --- | --- | --- |
 * | command | 120 s | the child's own prompt (`timeout 120 …`) | the command exits, the child classifies the error and keeps working |
 * | task call | {@link CHILD_TIMEOUT_MS} | the script (`agent()` race) | that call is a `timeout` failure; the task retries with new wording |
 * | run | the configured deadline | the host (`src/run.ts`) | the whole run stops, with a report |
 *
 * Every function here is pure and testable without an engine, which is the only way a
 * timeout policy can be in `npm run ci` at all (S7).
 */
/** Seconds a single shell command may run before it must exit on its own. */
export declare const COMMAND_TIMEOUT_SECONDS = 120;
/**
 * Milliseconds one `agent()` call may run before the script settles it as a timeout.
 *
 * Ten minutes: long enough that a legitimate build or test sweep finishes, short
 * enough that a child stuck on an interactive prompt stops costing the run. It is a
 * fixed internal bound on purpose — the user-facing deadline (`timeoutMs`) is the
 * number an operator reasons about, and a second visible deadline would only invite
 * "which one stopped it?".
 */
export declare const CHILD_TIMEOUT_MS = 600000;
/** Hard ceiling for the value a caller may pass through, in milliseconds. */
export declare const CHILD_TIMEOUT_MAX_MS = 3600000;
/** Where a stalled call was stopped. */
export type TimeoutTier = 'command' | 'task' | 'run';
/** One tier's bound, in milliseconds. `run` is absent when the deadline is unlimited. */
export interface TimeoutBudget {
    commandMs: number;
    taskMs: number;
    runMs?: number;
}
/**
 * The tier a given elapsed time crosses first.
 *
 * Ties resolve to the cheaper tier: at exactly 120 s the command bound has been
 * exceeded, and reporting "the run timed out" for a command that overran would blame
 * the wrong layer.
 * @param elapsedMs - how long the work has been running.
 * @param budget - the three bounds.
 * @returns the tier that stopped it, or undefined while every bound still holds.
 */
export declare function timeoutTierAt(elapsedMs: number, budget: TimeoutBudget): TimeoutTier | undefined;
/**
 * Clamp a caller's child-call bound into the range the script enforces.
 *
 * Absent or unusable values fall back to {@link CHILD_TIMEOUT_MS}; `0` is not
 * "unlimited" here, because a call with no bound is the stall this exists to stop.
 * @param value - untrusted value from the request payload.
 * @returns the bound to use, in milliseconds.
 */
export declare function resolveChildTimeoutMs(value: unknown): number;
/**
 * The sentence a timed-out call reports, so the retry prompt can say what happened.
 * @param role - which call timed out.
 * @param childTimeoutMs - the bound that was exceeded.
 * @returns a bounded, human-readable reason.
 */
export declare function childTimeoutReason(role: string, childTimeoutMs: number): string;
/** Milliseconds one `wait` verdict extends a stalled call. */
export declare const GUARDIAN_WAIT_MS = 300000;
/** How many times one stalled call may be extended before it is killed. */
export declare const GUARDIAN_MAX_WAITS = 2;
/** Milliseconds the adjudication call itself may run; its failure is a kill. */
export declare const GUARDIAN_ADJUDICATION_MS = 60000;
/** What the guardian model decided about one stalled call. */
export type GuardianVerdict = 'wait' | 'kill' | 'rescue';
/**
 * Parse one adjudication result.
 *
 * The child answers `{"verdict": "wait" | "kill" | "rescue", "reason": "…",
 * "guidance": "…"}`; a string reply and a bare `verdict` field are accepted
 * the same way, because the schema travels but a degraded gateway may still
 * answer plain text. Anything unreadable returns `undefined`, which the
 * caller treats as a kill: an adjudicator that cannot answer has no evidence
 * for a wait — and none for a rescue either.
 * @param value - the child's structured result, its reply string, or anything else.
 * @returns the verdict, or `undefined` when nothing readable was said.
 */
export declare function parseGuardianVerdict(value: unknown): GuardianVerdict | undefined;
/**
 * Milliseconds one wait may extend the call, under rule B.
 *
 * The extension is the smaller of the wait slice and whatever the run deadline
 * still allows; a deadline with nothing left (or a negative remaining value)
 * grants nothing, because the run stops at its deadline regardless of what the
 * adjudicator said. An unlimited run (remaining `Infinity`) grants the full
 * slice: there is no deadline to overrun.
 * @param deadlineRemainingMs - milliseconds until the run deadline (≤0 = none; `Infinity` = unlimited).
 * @returns the bounded extension; 0 means "no wait is affordable".
 */
export declare function guardianWaitMs(deadlineRemainingMs: number): number;
/**
 * What happens to one stalled call, from the verdict and the budget (S7 pure function).
 * A rescue grants the same slice a wait would: the host interrupts the child
 * and delivers the guidance, and the child wakes with new instructions.
 * @param verdict - the parsed guardian verdict; `undefined` reads as a kill.
 * @param waitsUsed - waits already granted to this call.
 * @param deadlineRemainingMs - milliseconds until the run deadline.
 * @returns `'wait'` when one more slice is affordable, else `'kill'`.
 */
export declare function guardianDecision(verdict: GuardianVerdict | undefined, waitsUsed: number, deadlineRemainingMs: number): GuardianVerdict;
//# sourceMappingURL=timeout.d.ts.map