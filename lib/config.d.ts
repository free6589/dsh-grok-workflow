import z from '@deepseek-ai/schemastery';
import type { GrokWorkflowConfig, ResolvedConfig } from './types.js';
/** Hard limits; user configuration can only tighten these. */
export declare const HARD_LIMITS: {
    readonly maxConcurrency: 6;
    readonly maxRetries: 3;
    readonly maxTasks: 12;
    readonly maxActiveRuns: 4;
    readonly timeoutMs: 86400000;
};
/** DSH profile configuration schema. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    toolName: z<string, string, "defined">;
    maxConcurrency: z<number, number, "defined">;
    maxRetries: z<number, number, "defined">;
    maxTasks: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
    maxActiveRuns: z<number, number, "defined">;
    subagentProvider: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    toolName: z<string, string, "defined">;
    maxConcurrency: z<number, number, "defined">;
    maxRetries: z<number, number, "defined">;
    maxTasks: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
    maxActiveRuns: z<number, number, "defined">;
    subagentProvider: z<string, string, "defined">;
}>>, "plain">;
/** Resolve defaults and enforce the hard limits for direct construction paths. */
export declare function resolveConfig(config?: GrokWorkflowConfig): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map