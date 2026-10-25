import z from '@deepseek-ai/schemastery';
import type { GrokWorkflowConfig, ResolvedConfig } from './types.js';
/** Hard limits; user configuration can only tighten these. */
export declare const HARD_LIMITS: {
    readonly historyTurns: 20;
    readonly historyChars: 8000;
    readonly maxQueuedMessages: 8;
    readonly maxConcurrency: 6;
    readonly maxRetries: 3;
    readonly maxTasks: 12;
    readonly maxActiveRuns: 4;
    readonly timeoutMs: 86400000;
    /** Maximum routes in one role's fallback chain. */
    readonly chainLength: 3;
    /** Maximum characters in one provider or model id. */
    readonly routeChars: 120;
    /** Hard ceiling on child calls charged against one task (worker + verifier). */
    readonly maxAttemptsPerTask: 6;
};
/** DSH profile configuration schema. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    toolName: z<string, string, "defined">;
    enforceGate: z<boolean, boolean, "defined">;
    gateRequired: z<boolean, boolean, "defined">;
    gateScope: z<"process" | "preset", "process" | "preset", "defined">;
    gatePreset: z<string, string, "defined">;
    answerStrategy: z<"relay" | "append", "relay" | "append", "defined">;
    historyTurns: z<number, number, "defined">;
    historyChars: z<number, number, "defined">;
    maxQueuedMessages: z<number, number, "defined">;
    maxConcurrency: z<number, number, "defined">;
    maxRetries: z<number, number, "defined">;
    maxTasks: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
    maxActiveRuns: z<number, number, "defined">;
    subagentProvider: z<string, string, "defined">;
    roles: z<Schemastery.ObjectS<NoInfer<{
        planner: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        worker: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        verifier: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        synthesizer: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        planner: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        worker: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        verifier: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        synthesizer: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
    }>>, "defined">;
    synthesis: z<"deterministic" | "model", "deterministic" | "model", "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    toolName: z<string, string, "defined">;
    enforceGate: z<boolean, boolean, "defined">;
    gateRequired: z<boolean, boolean, "defined">;
    gateScope: z<"process" | "preset", "process" | "preset", "defined">;
    gatePreset: z<string, string, "defined">;
    answerStrategy: z<"relay" | "append", "relay" | "append", "defined">;
    historyTurns: z<number, number, "defined">;
    historyChars: z<number, number, "defined">;
    maxQueuedMessages: z<number, number, "defined">;
    maxConcurrency: z<number, number, "defined">;
    maxRetries: z<number, number, "defined">;
    maxTasks: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
    maxActiveRuns: z<number, number, "defined">;
    subagentProvider: z<string, string, "defined">;
    roles: z<Schemastery.ObjectS<NoInfer<{
        planner: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        worker: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        verifier: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        synthesizer: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        planner: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        worker: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        verifier: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
        synthesizer: z<({
            provider?: string | null;
            model?: string | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
        }>>[], "defined">;
    }>>, "defined">;
    synthesis: z<"deterministic" | "model", "deterministic" | "model", "defined">;
}>>, "plain">;
/** Resolve defaults and enforce the hard limits for direct construction paths. */
export declare function resolveConfig(config?: GrokWorkflowConfig): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map