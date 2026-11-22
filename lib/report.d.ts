import type { FailureCategory, WorkflowReport } from './types.js';
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