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
/** Render a concise model-facing view; the canonical JSON remains available to PTC. */
export declare function renderReport(report: WorkflowReport): string;
//# sourceMappingURL=report.d.ts.map