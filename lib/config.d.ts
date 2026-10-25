import z from '@deepseek-ai/schemastery';
import type { GrokWorkflowConfig, ModelRoute, ResolvedConfig } from './types.js';
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
    /** Hard ceiling on routing ledger entries kept per run. */
    readonly recordEntries: 256;
};
/** Version of the configuration surface this build understands. */
export declare const CONFIG_VERSION = 1;
/**
 * Every top-level key the configuration accepts, in schema order.
 * Kept explicit so an unknown key can be rejected instead of silently dropped:
 * a typo that is silently ignored looks exactly like a setting that "does not
 * work", which is the failure mode the settings surface must not have.
 */
export declare const CONFIG_KEYS: readonly ["toolName", "enforceGate", "gateRequired", "gateScope", "gatePreset", "answerStrategy", "historyTurns", "historyChars", "maxQueuedMessages", "maxConcurrency", "maxRetries", "maxTasks", "timeoutMs", "maxActiveRuns", "subagentProvider", "roles", "synthesis", "switchOn", "recordRuns", "recordLimit", "configVersion"];
/** DSH profile configuration schema. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    toolName: z<string, string, "defined">;
    enforceGate: z<boolean, boolean, "defined">;
    gateRequired: z<boolean, boolean, "defined">;
    gateScope: z<"process" | "preset", "process" | "preset", "defined">;
    gatePreset: z<string, string, "defined">;
    answerStrategy: z<"relay" | "append" | "in-turn", "relay" | "append" | "in-turn", "defined">;
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
    switchOn: z<string[], string[], "defined">;
    recordRuns: z<boolean, boolean, "defined">;
    recordLimit: z<number, number, "defined">;
    configVersion: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    toolName: z<string, string, "defined">;
    enforceGate: z<boolean, boolean, "defined">;
    gateRequired: z<boolean, boolean, "defined">;
    gateScope: z<"process" | "preset", "process" | "preset", "defined">;
    gatePreset: z<string, string, "defined">;
    answerStrategy: z<"relay" | "append" | "in-turn", "relay" | "append" | "in-turn", "defined">;
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
    switchOn: z<string[], string[], "defined">;
    recordRuns: z<boolean, boolean, "defined">;
    recordLimit: z<number, number, "defined">;
    configVersion: z<number, number, "defined">;
}>>, "plain">;
/**
 * Validate one role's chain and return the normalized routes.
 *
 * Fail-fast (R-06): an unusable chain is rejected at load, never discovered
 * mid-run, because a silently ignored chain looks like routing that works.
 */
/** One config route as written: an object, or a bare model id shorthand. */
export type RouteInput = ModelRoute | string;
/** Failure classes a user may name in `switchOn`. */
export declare const SWITCHABLE_CLASSES: readonly ["rate-limit", "server-error", "connection", "timeout", "model-unavailable", "format-error", "agent-start-failed"];
/**
 * Reject unknown top-level keys instead of letting the schema drop them.
 *
 * A silently ignored key is indistinguishable from a setting that does not
 * work, and the whole point of the configuration layer (D) is that a user can
 * tell those apart. The message names the closest accepted key.
 * @param config - raw user configuration.
 * @throws If a key is not part of the configuration surface.
 */
export declare function assertKnownKeys(config: Record<string, unknown>): void;
/** Resolve defaults and enforce the hard limits for direct construction paths. */
export declare function resolveConfig(config?: GrokWorkflowConfig): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map