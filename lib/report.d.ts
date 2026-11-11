import type { FailureCategory, WorkflowReport } from './types.js';
import type { ResolvedConfig } from './types.js';
export declare function assertWorkflowReport(value: unknown, objective: string, config: ResolvedConfig): WorkflowReport;
export declare function failureReport(objective: string, config: ResolvedConfig, phase: string, message: string, category?: FailureCategory): WorkflowReport;
/**
 * Count failures per category across the report, so a reader can separate
 * "the provider was down" from "the work was not good enough" at a glance.
 * @param report - validated report.
 * @returns Category counts in report order.
 */
export declare function failureSummary(report: WorkflowReport): {
    category: FailureCategory;
    count: number;
}[];
/**
 * Render the user-facing report view.
 *
 * Section II-B (audit layer): the default view is the human answer — status,
 * objective, failure rollup, confirmed results, open items, uncertainties,
 * final answer — with no machine ledger in it. The per-task ledger rows and
 * bookkeeping lines are display-only details, not the record: they render in
 * the audit trail instead (see below). The complete technical record — plan
 * splits, per-attempt outcomes, verifier judgments, evidence, test commands,
 * incompletes, uncertainties and routing diagnostics — stays retrievable on
 * demand through the supported `showDiagnostics` opt-in (default off, the same
 * live switch the settings page and the render tool already thread): enabling
 * it appends the full audit trail after the diagnostics block.
 *
 * Hiding is display-only and cannot delete the record: rendering is a pure
 * read of the validated report object, whose canonical JSON remains available
 * to PTC and whose fields the memory recorder archives independently. The
 * default view keeps exactly the lines `src/carryover.ts` parses out of the
 * durable session copy (the `Grok workflow:` signature, `Objective:`, the
 * `Confirmed evidence:` / `Incomplete:` / `Uncertainties:` sections and the
 * `Final answer:` line), so the cross-round digest is unaffected.
 */
export declare function renderReport(report: WorkflowReport, opts?: {
    showDiagnostics?: boolean;
}): string;
//# sourceMappingURL=report.d.ts.map