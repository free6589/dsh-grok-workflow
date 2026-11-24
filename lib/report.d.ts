import type { FailureCategory, StopCause, WorkflowReport } from './types.js';
import type { ResolvedConfig } from './types.js';
import type { HandoffContract } from './handoff/contract.js';
export declare function assertWorkflowReport(value: unknown, objective: string, config: ResolvedConfig): WorkflowReport;
export declare function failureReport(objective: string, config: ResolvedConfig, phase: string, message: string, category?: FailureCategory): WorkflowReport;
/**
 * Count failures per category across the report, so a reader can separate
 * "the provider was down" from "the work was not good enough" at a glance.
 *
 * Only unrecovered failures count. A verified task carries retry history in its
 * own `attempts` (the rendered row says `verified (2 attempts)`), but an attempt
 * that a later attempt recovered says nothing about this run's outcome: counting
 * it printed `COMPLETED` followed by `Failures: 1 infrastructure`, which reads as
 * a failure on a run where every task passed. That line exists to tell a dead
 * provider from work that fell short, and neither is true once the retry landed.
 * @param report - validated report.
 * @returns Category counts in report order.
 */
export declare function failureSummary(report: WorkflowReport): {
    category: FailureCategory;
    count: number;
}[];
/**
 * What a stopped run achieved, in the two numbers a reader needs before deciding
 * whether to send the same request again.
 */
export interface StopTally {
    /** Tasks that verified. */
    done: number;
    /** Tasks that did not verify. */
    left: number;
    /** Tasks the plan named. */
    total: number;
}
/**
 * How far a run got, counted off its own task rows.
 * @param report - validated report.
 * @returns Verified, unfinished and total counts.
 */
export declare function stopTally(report: WorkflowReport): StopTally;
/**
 * The plain-language account of a run that stopped instead of finishing.
 *
 * Requirement (round 70): a cancel used to read as a machine sentence — "was
 * cancelled before the whole run finished" — which left the reader unable to
 * tell a plugin unload from their own stop from a timeout, and with no idea
 * whether anything survived. This sentence names the cause in everyday words,
 * says what was achieved, and tells the reader that resending continues.
 *
 * @param report - validated report; `stop` carries the cause.
 * @param lang - language of the sentence.
 * @returns The sentence, or undefined when the run recorded no stop cause.
 */
export declare function stopNarration(report: WorkflowReport, lang: 'zh' | 'en', inFlight?: number): string | undefined;
/**
 * Who ended the run, for the fixed guard line.
 *
 * `none` is a completed run: nothing cancelled it.
 */
export interface GuardConclusion {
    /** Findings the liveness guard recorded (capped by `GUARDIAN_LIMITS.maxFindings`). */
    findings: number;
    /** Subagent calls the guard terminated. Zero by construction today. */
    terminated: number;
    /** What ended the run. */
    by: StopCause | 'none';
}
/**
 * The guard settlement a report itself carries, as a renderable conclusion.
 *
 * A report produced by a run records `guard` (findings and terminations) and
 * `stop` (what ended it), so any later renderer — the read-only report tool, a
 * PTC call, the ledger — can print the same fixed line without being handed the
 * live guardian.
 * @param report - validated report.
 * @returns The conclusion, or undefined when the report predates guard accounting.
 */
export declare function guardOf(report: WorkflowReport): GuardConclusion | undefined;
/**
 * The report's fixed tail line: what the guard saw and who ended the round.
 *
 * The guard is invisible otherwise — it watches child calls, it never cancels the
 * workflow, and its findings only reached the progress panel — so a reader had no
 * way to tell "the watchdog was watching and killed nothing" from "nothing was
 * watching". One fixed line answers that, in both languages.
 *
 * @param guard - settlement the run observed.
 * @param lang - language of the line.
 * @returns One line, never empty.
 */
export declare function guardLine(guard: GuardConclusion, lang: 'zh' | 'en'): string;
/**
 * Options for {@link renderReport}. `showDiagnostics` opens the ledger lines
 * (Model routes / Deadline / Route switches / Errors). `handoff` appends the
 * fixed four-line handoff block (交接契约, zh) rendered by `src/handoff/`.
 * The contract itself is validated by that module; this function only renders
 * an already-validated contract and never changes the main report flow.
 */
export interface RenderReportOptions {
    showDiagnostics?: boolean;
    /** Validated handoff contract to append (zh block). */
    handoff?: HandoffContract;
    /** Validated handoff contract to append (en block, after the zh block). */
    handoffEn?: HandoffContract;
    /**
     * Guard settlement to print as the report's fixed last line.
     *
     * Absent when the caller has no guard to report (a bare renderer, a test, a
     * PTC call), which is why it is not read off the report: "no finding was
     * recorded" and "nothing was watching" are different facts.
     */
    guard?: GuardConclusion;
    /** Child calls still running when the run stopped (resume hint detail). */
    inFlight?: number;
    /**
     * Attach the complete technical audit trail (`src/report-audit.ts`) as the
     * report's tail, after the guard line.
     *
     * Off by default, and deliberately so: this view is parsed back by
     * `src/carryover.ts` and asserted by many suites, so the default text has to
     * stay exactly what it is. The base view keeps its own `MAX_RENDER_CHARS`
     * bound; the attached section carries its own `AUDIT_MAX_CHARS` bound, so
     * "the answer was truncated" and "the record was truncated" stay two
     * different, separately readable facts.
     */
    auditTrail?: boolean;
}
/** Render a concise model-facing view; the canonical JSON remains available to PTC.
 *
 * B plan: machine diagnostics (Model routes / Deadline / Route switches /
 * overflows / Uncertainties / Errors) render only when `opts.showDiagnostics`
 * is true (default false). Final answer / Confirmed evidence / task rows /
 * Incomplete always render.
 */
export declare function renderReport(report: WorkflowReport, opts?: RenderReportOptions): string;
//# sourceMappingURL=report.d.ts.map