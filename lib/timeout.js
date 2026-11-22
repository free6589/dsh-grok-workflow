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
export const COMMAND_TIMEOUT_SECONDS = 120;
/**
 * Milliseconds one `agent()` call may run before the script settles it as a timeout.
 *
 * Ten minutes: long enough that a legitimate build or test sweep finishes, short
 * enough that a child stuck on an interactive prompt stops costing the run. It is a
 * fixed internal bound on purpose — the user-facing deadline (`timeoutMs`) is the
 * number an operator reasons about, and a second visible deadline would only invite
 * "which one stopped it?".
 */
export const CHILD_TIMEOUT_MS = 600_000;
/** Hard ceiling for the value a caller may pass through, in milliseconds. */
export const CHILD_TIMEOUT_MAX_MS = 3_600_000;
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
export function timeoutTierAt(elapsedMs, budget) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
        return undefined;
    if (elapsedMs >= budget.commandMs) {
        // A command over its own bound is a *child* problem unless the child bound is
        // even tighter; the command bound is never reported as a run timeout.
        return elapsedMs >= budget.taskMs ? 'task' : 'command';
    }
    if (elapsedMs >= budget.taskMs)
        return 'task';
    if (budget.runMs !== undefined && elapsedMs >= budget.runMs)
        return 'run';
    return undefined;
}
/**
 * Clamp a caller's child-call bound into the range the script enforces.
 *
 * Absent or unusable values fall back to {@link CHILD_TIMEOUT_MS}; `0` is not
 * "unlimited" here, because a call with no bound is the stall this exists to stop.
 * @param value - untrusted value from the request payload.
 * @returns the bound to use, in milliseconds.
 */
export function resolveChildTimeoutMs(value) {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0)
        return CHILD_TIMEOUT_MS;
    return Math.min(CHILD_TIMEOUT_MAX_MS, Math.max(1_000, Math.floor(parsed)));
}
/**
 * The sentence a timed-out call reports, so the retry prompt can say what happened.
 * @param role - which call timed out.
 * @param childTimeoutMs - the bound that was exceeded.
 * @returns a bounded, human-readable reason.
 */
export function childTimeoutReason(role, childTimeoutMs) {
    const minutes = Math.max(1, Math.round(childTimeoutMs / 60_000));
    return `${role} call exceeded the ${minutes} minute child budget and was settled as a timeout; retry with a smaller step`;
}
// -------------------------------------------------------- guardian (Q8) -----
// A stalled call is judged before it is killed: the guardian model takes the
// evidence the script can observe and answers `wait` or `kill`. A `wait`
// extends the call by one {@link GUARDIAN_WAIT_MS} slice, at most
// {@link GUARDIAN_MAX_WAITS} times, and never past the run deadline (rule B:
// 剩多少给多少，到点照停 — the deadline is the hard line, never exceeded for
// one child). Every constant here is mirrored in the generated script and the
// mirrors are pinned equal by test/timeout.spec.ts.
/** Milliseconds one `wait` verdict extends a stalled call. */
export const GUARDIAN_WAIT_MS = 300_000;
/** How many times one stalled call may be extended before it is killed. */
export const GUARDIAN_MAX_WAITS = 2;
/** Milliseconds the adjudication call itself may run; its failure is a kill. */
export const GUARDIAN_ADJUDICATION_MS = 60_000;
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
export function parseGuardianVerdict(value) {
    const verdict = typeof value === 'string'
        ? value
        : typeof value === 'object' && value !== null
            ? value.verdict
            : undefined;
    const reply = typeof verdict === 'string'
        ? verdict
        : typeof value === 'object' && value !== null && typeof value.reply === 'string'
            ? value.reply
            : '';
    const word = reply.trim().toLowerCase();
    return word === 'wait' || word === 'kill' || word === 'rescue' ? word : undefined;
}
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
export function guardianWaitMs(deadlineRemainingMs) {
    if (deadlineRemainingMs === Number.POSITIVE_INFINITY)
        return GUARDIAN_WAIT_MS;
    if (!Number.isFinite(deadlineRemainingMs) || deadlineRemainingMs <= 0)
        return 0;
    return Math.min(GUARDIAN_WAIT_MS, Math.floor(deadlineRemainingMs));
}
/**
 * What happens to one stalled call, from the verdict and the budget (S7 pure function).
 * A rescue grants the same slice a wait would: the host interrupts the child
 * and delivers the guidance, and the child wakes with new instructions.
 * @param verdict - the parsed guardian verdict; `undefined` reads as a kill.
 * @param waitsUsed - waits already granted to this call.
 * @param deadlineRemainingMs - milliseconds until the run deadline.
 * @returns `'wait'` when one more slice is affordable, else `'kill'`.
 */
export function guardianDecision(verdict, waitsUsed, deadlineRemainingMs) {
    if (verdict !== 'wait' && verdict !== 'rescue')
        return 'kill';
    if (!Number.isFinite(waitsUsed) || waitsUsed < 0 || waitsUsed >= GUARDIAN_MAX_WAITS)
        return 'kill';
    return guardianWaitMs(deadlineRemainingMs) > 0 ? 'wait' : 'kill';
}
//# sourceMappingURL=timeout.js.map