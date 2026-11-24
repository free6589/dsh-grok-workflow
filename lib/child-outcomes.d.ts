/**
 * What each child run actually ended as, and the one report repair it enables.
 *
 * Why this module exists (T1, the null-semantics collapse): the published PTC
 * engine's guest returns `null` for *every* child that did not finish normally —
 * a dead provider, a timed-out child, a cancelled child and a child that merely
 * never submitted its structured result are one value there
 * (`WorkflowExecution.agent()`), and the host's `childResult()` forwards only
 * `{output, stopReason, structured}`, so the child's own failure detail never
 * reaches the script. The generated script therefore has one shape to describe
 * both cases, and it describes both as `format-error`.
 *
 * Measured (agent-99, 3691 child calls over 21 runs): 530 transport, auth and
 * timeout deaths were filed as format errors against 25 real ones.
 *
 * The engine stays untouched. What the plugin *can* see is the other side of the
 * same seam: `subagents.startActivation` hands back the child's run handle, whose
 * `result` settles with the real `stopReason` and provider `diagnostic`
 * (`src/team-engine.ts` records those into a bounded ledger). With that evidence
 * the host rewrites the null-collapse rows of the report it assembled, so the
 * report, the answer and the memory archive name the cause the child died of.
 *
 * Two limits are deliberate, and both are honest rather than convenient:
 *
 * - The repair is *reporting only*. The script's own routing decision was already
 *   taken on a null it could not explain, so this module never claims to have
 *   changed which route answered, how many attempts ran or whether a resubmit
 *   fired. Telling the script the cause needs a channel it does not have yet
 *   (`docs/knowledge/DECISIONS.md`, T1 step 2).
 * - A row is rewritten only when the evidence for it is unambiguous: every child
 *   of that role in the run must have died of the same class, and no child of that
 *   role may have *completed* without a structured result. A mixed run keeps the
 *   script's own wording, because a guess here would be the same defect in a new
 *   place.
 *
 * @module dsh-grok-workflow/child-outcomes
 */
import type { FailureCategory, FailureClass, RoleName, WorkflowReport } from './types.js';
/** Child outcomes kept per context; older entries are dropped (bounded memory). */
export declare const CHILD_OUTCOME_LIMIT = 512;
/** Longest cause line this module writes into a report. */
export declare const CHILD_CAUSE_CHARS = 200;
/** The guest's null-collapse reason, as `src/script.ts` writes it. */
export declare const NULL_COLLAPSE_REASON = "no valid structured result";
/**
 * The prefix the twin engine's refusal carries into the guest's `agent()` error.
 *
 * The engine's guest returns `null` for a child that did not finish cleanly, and
 * nothing else about that child crosses the worker boundary: `childResult()`
 * projects `{output, stopReason, structured}`. So a rejection is the only channel
 * the host has left for "this route's provider answered 503 twice" — the message
 * the engine renders into that rejection is what the guest can read. The script
 * parses the same marker back out of it (`src/script.ts` `childDeathCause`, pinned
 * equal by `test/dead-routes.spec.ts`).
 */
export declare const CHILD_DEATH_MARKER = "CHILD_DEATH:";
/**
 * The families a child's death may be forwarded to the script for.
 *
 * Mirrors the guest's own read-back gate (`CHILD_DEATH_FAMILIES` in `src/script.ts`,
 * pinned equal by `test/dead-routes.spec.ts`). It is not the dead-route table: the
 * script counts only the four transport families (`ROUTE_HEALTH_FAMILIES`), so a
 * refused key advances the route chain and is never written down as a dead route —
 * what that needs is a key, not another route. Everything else keeps the null shape
 * it had: a cancelled run and a genuine format gap are not evidence about the route,
 * and the report repair (`reclassifyNullCollapses`) remains the only path that names
 * them.
 */
export declare const CHILD_DEATH_FAMILIES: readonly FailureClass[];
/**
 * What this module says about a child that died with nothing in its log to name
 * the cause. It is deliberately a statement about the record, not about the child:
 * the old wording named a missing form ("no valid structured result"), which read
 * as "send it again" and was wrong for every dead child.
 */
export declare const CHILD_CAUSE_UNKNOWN = "the child ended abnormally (cause unknown)";
/** The terminal facts one child run settled with. */
export interface ChildTerminal {
    /** The child's `SubagentResult.stopReason` (`completed`/`aborted`/`error`/…). */
    stopReason: string;
    /** The provider's own failure detail, when it gave one. */
    diagnostic?: string;
    /**
     * The provider's machine code for that failure (`AUTH`, `RATE_LIMIT`,
     * `TIMEOUT`, `HTTP_502`, …), when the child's own log carried one. It is read
     * from the child session's `turn/end`, because the in-process subagent result
     * has no diagnostic field at all.
     */
    code?: string;
}
/** One recorded child settlement, with the identity a report row can be matched to. */
export interface ChildOutcome extends ChildTerminal {
    /** Monotonic per log; `mark()`/`since()` slice the log per run. */
    seq: number;
    /** The child's session id, as the activation receipt reported it. */
    childId?: string;
    /** The activation label the engine asked for (before the twin rewrote it). */
    label?: string;
    /** Role read from the child prompt's title line, when it names one. */
    role?: RoleName;
    /** 1-based attempt the title line names, when it names one. */
    attempt?: number;
    /** Route label the child asked for (`provider/model`, or `inherit`). */
    route?: string;
}
/** The bounded, per-context child-outcome log. */
export interface ChildOutcomeLog {
    /** Current position; take this before a run starts. */
    mark(): number;
    /** Every outcome recorded after `mark`, oldest first. */
    since(mark: number): ChildOutcome[];
    /** The newest outcome for one child session id. */
    of(childId: string): ChildOutcome | undefined;
    /** Record one settlement (oldest entries are dropped past the cap). */
    add(outcome: Omit<ChildOutcome, 'seq'>): void;
}
/**
 * Create a bounded child-outcome log.
 * @returns The log; all operations are synchronous and never throw.
 */
export declare function createChildOutcomeLog(): ChildOutcomeLog;
/** The log used when nothing observed the engine (non-PTC engine, bare tests). */
export declare function emptyChildOutcomeLog(): ChildOutcomeLog;
/**
 * The failure class a provider-neutral machine code names, when it names one
 * unambiguously.
 *
 * The codes are `@deepseek-ai/dsh-llm`'s `LlmFailure.code` vocabulary, which the
 * child session commits verbatim in its `turn/end`. They are a better basis than
 * the message text: a gateway that answers `401` with prose in another language,
 * or with no prose at all, still files the same code. Only clear mappings are
 * listed; anything else falls back to the shared message table, so an unknown
 * code cannot manufacture a class.
 * @param code - the failure code, when the log carried one.
 * @returns The class that code means, or `undefined` when it does not decide one.
 */
export declare function failureClassForCode(code: string | undefined): FailureClass | undefined;
/**
 * The failure class a child's terminal state means.
 *
 * `completed` is the only state that belongs to the format-error family: the
 * child finished and simply never submitted a structured result. Every other
 * state is a death, classified first from the provider's machine code and then
 * from its own words with the same table the script uses for a thrown failure
 * (`classifyChildFailureText`, pinned equal by `test/null-collapse.spec.ts`).
 * @param outcome - the child's terminal state.
 * @returns The class that state belongs to.
 */
export declare function childFailureClass(outcome: ChildTerminal): FailureClass;
/**
 * Mirror of the generated script's `classifyFailureText` (src/script.ts).
 *
 * Mirrored rather than shared because the script is source text evaluated in the
 * engine's own realm; the two tables are pinned equal by a test that extracts the
 * guest function and compares verdicts on every message below. Keep the order and
 * the patterns identical: a class that changes on one side only would make the
 * pre-call and post-call wordings disagree.
 * @param value - failure text (a diagnostic, an error message, or anything).
 * @returns The class that text names, or `unknown`.
 */
export declare function classifyChildFailureText(value: unknown): FailureClass;
/**
 * The rejection message for a child whose death the route may be blamed for, or
 * `undefined` when the null shape must stand.
 *
 * A route that keeps dying is worth skipping, but the script can only skip what
 * it can see. This is the one fact the host can put in front of it: the class the
 * child's own settlement named, in a message the guest parses. It is deliberately
 * narrow — a `completed` child that never submitted is a real format gap and a
 * cancellation is not the route's fault, so those keep arriving as `null` and keep
 * being repaired in the report instead. A refused key travels too, as
 * `model-unavailable`: the script has to stop resubmitting a call the gateway will
 * refuse identically, but its bookkeeping never counts that class as a dead route.
 * @param outcome - the child's terminal state.
 * @returns The one-line rejection message, or `undefined` to leave the null.
 */
export declare function childDeathRejection(outcome: ChildTerminal): string | undefined;
/** Who has to fix a failure of this class (mirrors `failureCategory` in the script). */
export declare function categoryForFailureClass(failureClass: FailureClass): FailureCategory;
/**
 * The plain-language cause of one child's death, for a report reason or a memory
 * entry. The stop reason leads (it is the engine's own word); the provider's
 * diagnostic follows when there is one.
 *
 * A death with no recorded detail says so. It never says the child "returned no
 * valid structured result": that sentence describes a missing form, so a reader
 * of a refused key or an expired deadline was told to do the wrong thing. The
 * wording of the empty case is {@link CHILD_CAUSE_UNKNOWN} for the same reason.
 * @param outcome - the child's terminal state.
 * @returns One bounded line naming the cause.
 */
export declare function childStopPhrase(outcome: ChildTerminal): string;
/**
 * The reason line this module writes over a null-collapse row.
 * @param role - the role the row belongs to.
 * @param outcome - the child's terminal state.
 * @returns One bounded, redaction-friendly line.
 */
export declare function childFailureReason(role: string, outcome: ChildTerminal): string;
/**
 * Rewrite the null-collapse rows of an assembled report with the cause each child
 * actually died of.
 *
 * The report is repaired in place (its rows, its prose and the category a reader
 * uses to tell "the service failed" from "the work fell short"); the return value
 * is how many rows changed, so a caller can log the fact instead of trusting it.
 * @param report - the validated report to repair.
 * @param outcomes - the child settlements recorded during this run.
 * @returns How many structured rows were rewritten.
 */
export declare function reclassifyNullCollapses(report: WorkflowReport, outcomes: readonly ChildOutcome[]): number;
/** Re-exported so a caller can name the role of a title line the same way here. */
export declare function roleOfChildTitle(title: string): {
    role: RoleName;
    attempt: number;
} | undefined;
//# sourceMappingURL=child-outcomes.d.ts.map