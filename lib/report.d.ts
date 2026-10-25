import type { WorkflowReport } from './types.js';
import type { ResolvedConfig } from './types.js';
export declare function assertWorkflowReport(value: unknown, objective: string, config: ResolvedConfig): WorkflowReport;
/** A failure report for a run that never produced a script result. */
export declare function failureReport(objective: string, config: ResolvedConfig, phase: string, message: string): WorkflowReport;
/** Render a concise model-facing view; the canonical JSON remains available to PTC. */
export declare function renderReport(report: WorkflowReport): string;
//# sourceMappingURL=report.d.ts.map