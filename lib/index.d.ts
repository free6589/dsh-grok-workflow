import type { Context } from '@deepseek-ai/cordis';
import type { GrokWorkflowConfig } from './types.js';
export { Config, HARD_LIMITS } from './config.js';
export { GrokWorkflowInputError } from './input.js';
export type { AttemptReport, ConfirmedEvidence, CriterionVerification, ExecutionResult, FinalStatus, GrokWorkflowConfig, IncompleteItem, NormalizedTask, PlanReport, ReportError, TaskInput, TaskReport, UncertaintyItem, VerificationResult, WorkflowReport, } from './types.js';
/** Unique plugin name for DSH diagnostics. */
export declare const name = "dsh-grok-workflow";
/** Required DSH services. The base/web/headless bundles provide them. */
export declare const inject: readonly ["tools", "workflowEngine", "systemPrompt"];
/** Install the workflow tool and its lifetime-scoped state. */
export declare function apply(ctx: Context, rawConfig?: GrokWorkflowConfig): void;
//# sourceMappingURL=index.d.ts.map