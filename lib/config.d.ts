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
/**
 * DSH profile configuration schema.
 *
 * Every user-editable field is `volatile()`: the runtime then hands it over as a
 * live holder (`.get()`) and an edit does not remount the plugin — a remount
 * would kill an in-flight run (E-12/E-31). The structural fields stay plain:
 * `toolName` is fixed at registration, `enforceGate`/`gateRequired` decide
 * whether the gate exists at all, and `configVersion` is a wire contract.
 * `snapshotConfig()` below turns holders back into plain values, so one reader
 * serves a hand-written config, a profile patch and a live settings form alike.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    toolName: z<string, string, "defined">;
    enforceGate: z<boolean, boolean, "defined">;
    gateRequired: z<boolean, boolean, "defined">;
    gateScope: z<"process" | "preset", "process" | "preset", "volatile-defined">;
    gatePreset: z<string, string, "volatile-defined">;
    answerStrategy: z<"relay" | "append" | "in-turn", "relay" | "append" | "in-turn", "volatile-defined">;
    historyTurns: z<number, number, "volatile-defined">;
    historyChars: z<number, number, "volatile-defined">;
    maxQueuedMessages: z<number, number, "volatile-defined">;
    maxConcurrency: z<number, number, "volatile-defined">;
    maxRetries: z<number, number, "volatile-defined">;
    maxTasks: z<number, number, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    maxActiveRuns: z<number, number, "volatile-defined">;
    subagentProvider: z<string, string, "volatile-defined">;
    roles: z<NoInfer<Schemastery.ObjectS<NoInfer<{
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
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
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
    }>>>, "volatile-defined">;
    synthesis: z<"deterministic" | "model", "deterministic" | "model", "volatile-defined">;
    switchOn: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    recordRuns: z<boolean, boolean, "volatile-defined">;
    recordLimit: z<number, number, "volatile-defined">;
    configVersion: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    toolName: z<string, string, "defined">;
    enforceGate: z<boolean, boolean, "defined">;
    gateRequired: z<boolean, boolean, "defined">;
    gateScope: z<"process" | "preset", "process" | "preset", "volatile-defined">;
    gatePreset: z<string, string, "volatile-defined">;
    answerStrategy: z<"relay" | "append" | "in-turn", "relay" | "append" | "in-turn", "volatile-defined">;
    historyTurns: z<number, number, "volatile-defined">;
    historyChars: z<number, number, "volatile-defined">;
    maxQueuedMessages: z<number, number, "volatile-defined">;
    maxConcurrency: z<number, number, "volatile-defined">;
    maxRetries: z<number, number, "volatile-defined">;
    maxTasks: z<number, number, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    maxActiveRuns: z<number, number, "volatile-defined">;
    subagentProvider: z<string, string, "volatile-defined">;
    roles: z<NoInfer<Schemastery.ObjectS<NoInfer<{
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
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
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
    }>>>, "volatile-defined">;
    synthesis: z<"deterministic" | "model", "deterministic" | "model", "volatile-defined">;
    switchOn: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    recordRuns: z<boolean, boolean, "volatile-defined">;
    recordLimit: z<number, number, "volatile-defined">;
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
/** A volatile field as the runtime hands it over. */
export interface ConfigHolder<T> {
    get(): T;
}
/** Field value: plain, or a live holder for a volatile field. */
export type ConfigValue<T> = T | ConfigHolder<T>;
/**
 * Unwrap every volatile holder into a plain configuration object.
 *
 * The plugin reads its configuration through this function and never through
 * `rawConfig` directly, so a value edited in the settings UI (which writes the
 * holder) and a value written in a profile patch (which stays plain) reach
 * `resolveConfig()` in exactly one shape.
 * @param raw - configuration as the runtime provided it.
 * @returns Plain configuration.
 */
export declare function snapshotConfig(raw: GrokWorkflowConfig | Record<string, unknown> | undefined): GrokWorkflowConfig;
/** Re-readable configuration, so an edit applies to the next admission. */
export interface ConfigReader {
    /**
     * Read and validate the current configuration.
     * @throws If the current values are invalid (the message names the field).
     */
    read(): ResolvedConfig;
    /** The last configuration that validated, for work that already started. */
    lastGood(): ResolvedConfig;
}
/**
 * Build the reader used by the tool and the gate.
 *
 * A settings edit invalidates nothing by itself: the next `read()` validates the
 * new values, so a broken edit refuses the next message with its exact reason
 * instead of half-applying, and a run that already started keeps the snapshot it
 * was given (`lastGood()`), which is what "live" has to mean for a run whose
 * limits must not move under it.
 * @param raw - live configuration object (holders included).
 * @param logger - optional logger for the fallback warning.
 * @returns A reader with a validated snapshot cache.
 */
export declare function createConfigReader(raw: GrokWorkflowConfig | Record<string, unknown> | undefined, logger?: {
    warn(message: string): void;
}): ConfigReader;
//# sourceMappingURL=config.d.ts.map