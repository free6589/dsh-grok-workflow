import z from '@deepseek-ai/schemastery';
import type { GrokWorkflowConfig, ModelRoute, ResolvedConfig } from './types.js';
/** Hard limits; user configuration can only tighten these. */
export declare const HARD_LIMITS: {
    readonly historyTurns: 1000000;
    readonly historyChars: 1000000;
    readonly maxQueuedMessages: 8;
    /**
     * Concurrency and retries are the plugin's *documented* engine-hook contract
     * (AGENTS.md "Architecture invariants", D-003): default 3 / hard maximum 6, and
     * default 1 / hard maximum 3. They are deliberately small, because each unit is
     * one child agent charged against a real provider quota, and the generated
     * script mirrors these two numbers by value (`src/script.ts`) — the parity is
     * pinned by `test/config.spec.ts`, so neither side may be edited alone.
     *
     * The same envelope is pinned for checkpoints by `ENGINE_HOOK_LIMITS`
     * (`src/checkpoint/schema.ts`), which derives from these two constants and makes
     * `buildCheckpoint` refuse a row outside them; the run path warns once when a
     * caller bypasses the config schema and hands a recorder a wider value.
     */
    readonly maxConcurrency: 6;
    readonly maxRetries: 3;
    readonly maxTasks: 100;
    readonly maxActiveRuns: 4;
    readonly maxActiveRunsTotal: 16;
    readonly timeoutMs: 604800000;
    /** Maximum routes in one role's fallback chain. */
    readonly chainLength: 50;
    /** Maximum characters in one provider or model id. */
    readonly routeChars: 120;
    /** Per-route in-flight ceiling (`maxInFlight`): 1 keeps a private lane, 64 is the widest share. */
    readonly routeInFlight: {
        readonly min: 1;
        readonly max: 64;
    };
    /** Extreme backstop on child calls charged against one task (worker + verifier). */
    readonly maxAttemptsPerTask: 400;
    /** Hard ceiling on routing ledger entries kept per run. */
    readonly recordEntries: 256;
    /**
     * Layered-synthesis guardrail bounds (Section IV). The final narrative a
     * layered run ships in `synthesis.summary` is clamped to the same per-section
     * budget the report renderer applies (`renderReport` clamps the summary at the
     * same 2 000 characters), and the digest the constrained polish may read is
     * bounded so the polish stays a cheap, bounded call. The generated script
     * mirrors both constants because it cannot import host code; the parity is
     * pinned by test/synthesis-guardrails.spec.ts — do not edit one side without
     * the other.
     */
    readonly synthesisSummaryChars: 2000;
    readonly synthesisDigestChars: 6000;
};
/**
 * The hard maximum of every numeric limit that takes effect as a clamp (B02).
 *
 * One source, three readers: the `Config` schema clamps a stored overrun to it, the
 * load-time `repairLimitOverruns` clamps a config that never met the schema, and the
 * settings page's over-limit banner compares the stored number against it. The values
 * are read off `HARD_LIMITS`, so a published bound stays declared once.
 *
 * A numeric limit that is *not* listed here is left to validation alone. That is
 * deliberate, not an omission: a per-route `maxInFlight` is judged inside a chain (its
 * bound is `HARD_LIMITS.routeInFlight`), and `configVersion` is a wire contract whose
 * mismatch must refuse the load rather than be rewritten.
 */
export declare const LIMIT_CAPS: {
    readonly maxConcurrency: 6;
    readonly maxRetries: 3;
    readonly maxQueuedMessages: 8;
    readonly historyTurns: 1000000;
    readonly historyChars: 1000000;
    readonly maxTasks: 100;
    readonly timeoutMs: 604800000;
    readonly maxActiveRuns: 4;
    readonly maxActiveRunsTotal: 16;
    readonly recordLimit: 256;
};
/** A configuration key whose stored number takes effect clamped to its hard maximum. */
export type LimitField = keyof typeof LIMIT_CAPS;
/**
 * Default deadline for one workflow run: 60 minutes (t45, P1-4).
 *
 * The old 30-minute default was measured to be wrong twice in one afternoon —
 * two four-task runs were killed at exactly 30m00s and 30m01s — while real
 * four-task runs finish in 878 s / 1148 s / 1801 s. 60 minutes keeps a hung run
 * bounded and gives the observed worst case roughly 2x headroom; a caller with a
 * longer objective raises it in the profile patch (t45 D-017).
 */
export declare const DEFAULT_TIMEOUT_MS = 3600000;
/**
 * Defaults of the two documented run limits (3 concurrent tasks, 1 retry).
 *
 * Declared once and read by the schema defaults, the checkpoint recorder and the
 * tests, so a settings form, a hand-written profile patch and a programmatic call
 * cannot disagree about what "unset" means — the same rule
 * `DEFAULT_HUMAN_SUMMARY` follows. `src/checkpoint/schema.ts` imports them for
 * `ENGINE_HOOK_LIMITS`, which is what keeps the recorded contract and the
 * accepted configuration equal by construction instead of by comment.
 */
export declare const DEFAULT_MAX_CONCURRENCY = 3;
/** @see DEFAULT_MAX_CONCURRENCY */
export declare const DEFAULT_MAX_RETRIES = 1;
/** Default concurrent workflow runs per session (t45, P1-3). */
export declare const DEFAULT_MAX_ACTIVE_RUNS = 2;
/**
 * Default concurrent workflow runs across every session.
 *
 * The per-session cap is what a user reasons about; this one only keeps the
 * number of child agents in one process bounded.
 */
export declare const DEFAULT_MAX_ACTIVE_RUNS_TOTAL = 8;
/**
 * Default of the `humanSummary` output switch: **on** (human-first).
 *
 * A run that is asked for nothing in particular gets the plain-language answer
 * first and the machine report after it. Declared once and read by both the
 * schema default and `resolveConfig`, so the settings form, a hand-written
 * profile patch and a programmatic call cannot disagree about what "unset"
 * means. The workflow script applies the same default to a payload that omits
 * the key (`src/script.ts`, `humanSummary`), so a caller that passes nothing —
 * the pre-switch calling convention — keeps the behavior it had.
 */
export declare const DEFAULT_HUMAN_SUMMARY = true;
/**
 * Default of the `showDiagnostics` output switch: **off** (diagnostics opt-in).
 *
 * Off means the rendered report omits the routing ledger (Model routes /
 * Deadline / Route switches / overflows / Errors). Turning it on is the
 * supported way to retrieve the complete machine report: the same validated
 * report renders every one of those lines
 * (`renderReport(report, { showDiagnostics: true })`), and the PTC `render`
 * tool reads the live setting, so no remount and no second report format are
 * involved. Declared once, read by the schema default and by `resolveConfig`.
 */
export declare const DEFAULT_SHOW_DIAGNOSTICS = false;
/** Version of the configuration surface this build understands. */
export declare const CONFIG_VERSION = 1;
/**
 * Every top-level key the configuration accepts, in schema order.
 * Kept explicit so an unknown key can be rejected instead of silently dropped:
 * a typo that is silently ignored looks exactly like a setting that "does not
 * work", which is the failure mode the settings surface must not have.
 */
export declare const CONFIG_KEYS: readonly ["toolName", "enforceGate", "gateRequired", "gateScope", "gatePreset", "answerStrategy", "mode", "grokDefault", "triageAsk", "triageModel", "triageClassifier", "triageFollowupAsFast", "instantReceipt", "humanSummary", "showDiagnostics", "historyTurns", "historyChars", "maxQueuedMessages", "maxConcurrency", "maxRetries", "maxTasks", "timeoutMs", "maxActiveRuns", "maxActiveRunsTotal", "subagentProvider", "roles", "synthesis", "switchOn", "recordRuns", "recordLimit", "showProgress", "configVersion"];
/** One stored limit the schema had to clamp, as the parse saw it. */
export interface LimitOverrun {
    field: LimitField;
    /** The value that was stored, before clamping. */
    stored: number;
    /** The hard maximum it takes effect as. */
    cap: number;
}
/**
 * Drain the overruns the schema clamp recorded since the last call.
 *
 * The caller announces them once: a config document parsed before `apply()` (the
 * ordinary profile-patch path) leaves its notes here, and so does every later
 * re-parse, so nothing is lost and nothing is announced twice by this module.
 * @returns The distinct overruns recorded since the previous drain, in field order.
 */
export declare function takeLimitOverruns(): LimitOverrun[];
/**
 * The one sentence that names a clamped limit, in both shipped languages.
 *
 * Shared by the schema clamp and the load-path repair so a reader cannot tell which
 * layer caught the overrun from the wording — the fact reported is the same one.
 * @param overrun - the stored value and the cap it takes effect as.
 * @returns the warning line the plugin logs.
 */
export declare function limitOverrunWarning({ field, stored, cap }: LimitOverrun): string;
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
    mode: z<"full" | "triage", "full" | "triage", "volatile-defined">;
    grokDefault: z<"on" | "off", "on" | "off", "volatile-defined">;
    triageAsk: z<boolean, boolean, "volatile-defined">;
    triageModel: z<string, string, "volatile-defined">;
    triageClassifier: z<"rules" | "hybrid", "rules" | "hybrid", "volatile-defined">;
    triageFollowupAsFast: z<boolean, boolean, "volatile-defined">;
    instantReceipt: z<boolean, boolean, "volatile-defined">;
    humanSummary: z<boolean, boolean, "volatile-defined">;
    showDiagnostics: z<boolean, boolean, "volatile-defined">;
    historyTurns: z<number, number, "volatile-defined">;
    historyChars: z<number, number, "volatile-defined">;
    maxQueuedMessages: z<number, number, "volatile-defined">;
    maxConcurrency: z<number, number, "volatile-defined">;
    maxRetries: z<number, number, "volatile-defined">;
    maxTasks: z<number, number, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    maxActiveRuns: z<number, number, "volatile-defined">;
    maxActiveRunsTotal: z<number, number, "volatile-defined">;
    subagentProvider: z<string, string, "volatile-defined">;
    roles: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        planner: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        worker: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        verifier: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        synthesizer: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        planner: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        worker: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        verifier: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        synthesizer: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
    }>>>, "volatile-defined">;
    synthesis: z<"deterministic" | "model" | "layered", "deterministic" | "model" | "layered", "volatile-defined">;
    switchOn: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    recordRuns: z<boolean, boolean, "volatile-defined">;
    recordLimit: z<number, number, "volatile-defined">;
    showProgress: z<boolean, boolean, "volatile-defined">;
    configVersion: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    toolName: z<string, string, "defined">;
    enforceGate: z<boolean, boolean, "defined">;
    gateRequired: z<boolean, boolean, "defined">;
    gateScope: z<"process" | "preset", "process" | "preset", "volatile-defined">;
    gatePreset: z<string, string, "volatile-defined">;
    answerStrategy: z<"relay" | "append" | "in-turn", "relay" | "append" | "in-turn", "volatile-defined">;
    mode: z<"full" | "triage", "full" | "triage", "volatile-defined">;
    grokDefault: z<"on" | "off", "on" | "off", "volatile-defined">;
    triageAsk: z<boolean, boolean, "volatile-defined">;
    triageModel: z<string, string, "volatile-defined">;
    triageClassifier: z<"rules" | "hybrid", "rules" | "hybrid", "volatile-defined">;
    triageFollowupAsFast: z<boolean, boolean, "volatile-defined">;
    instantReceipt: z<boolean, boolean, "volatile-defined">;
    humanSummary: z<boolean, boolean, "volatile-defined">;
    showDiagnostics: z<boolean, boolean, "volatile-defined">;
    historyTurns: z<number, number, "volatile-defined">;
    historyChars: z<number, number, "volatile-defined">;
    maxQueuedMessages: z<number, number, "volatile-defined">;
    maxConcurrency: z<number, number, "volatile-defined">;
    maxRetries: z<number, number, "volatile-defined">;
    maxTasks: z<number, number, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    maxActiveRuns: z<number, number, "volatile-defined">;
    maxActiveRunsTotal: z<number, number, "volatile-defined">;
    subagentProvider: z<string, string, "volatile-defined">;
    roles: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        planner: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        worker: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        verifier: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        synthesizer: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        planner: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        worker: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        verifier: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
        synthesizer: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
    }>>>, "volatile-defined">;
    synthesis: z<"deterministic" | "model" | "layered", "deterministic" | "model" | "layered", "volatile-defined">;
    switchOn: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    recordRuns: z<boolean, boolean, "volatile-defined">;
    recordLimit: z<number, number, "volatile-defined">;
    showProgress: z<boolean, boolean, "volatile-defined">;
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
/**
 * Repair a recoverable synthesis/synthesizer mismatch without touching anything else.
 *
 * Only two shapes are recoverable (P1):
 * - (a) the synthesizer chain is non-empty but `synthesis` is `deterministic`
 *   → take effect as `model`;
 * - (b) `synthesis` is `model` but the synthesizer chain is empty
 *   → take effect as `deterministic`.
 *
 * Everything else (unknown keys, bad providers/models, out-of-range numbers,
 * malformed chains, …) is left for `resolveConfig` to reject (R-06): this
 * function never validates and never throws for those cases. It is pure: the
 * input is not mutated, and a non-matching input returns unchanged with no
 * warnings.
 * @param raw - raw user configuration (plain snapshot shape).
 * @returns The repaired config plus human-readable warnings (empty when nothing matched).
 */
export declare function repairSynthesisInconsistency(raw: GrokWorkflowConfig): {
    repaired: GrokWorkflowConfig;
    warnings: string[];
};
/**
 * Repair a stored limit that exceeds the hard maximum (B07, B02, D-031).
 *
 * Every key in `LIMIT_CAPS` is a quota envelope, not a preference: the Host refuses to
 * run above it (`resolveConfig`), and that refusal is correct. A profile patch written
 * before a cap was restored can still hold the old wider number, and failing the whole
 * row for it leaves the user with no settings page to fix it from — the same deadlock
 * D-031 removed for the synthesis mismatch. So a stored overrun takes effect as the
 * cap, announced once.
 *
 * Which keys are in scope is `LIMIT_CAPS`'s answer, not this function's: that is what
 * keeps the schema clamp and this repair from disagreeing about a bound, and what let
 * the two documented limits (B07) become every numeric hard limit (B02) without a
 * second table to maintain.
 *
 * Only an *overrun* is recoverable here: a number above the maximum. Everything
 * else is left exactly as it is for `resolveConfig` to reject (R-06) — a value
 * below the minimum, a non-number, an unknown key or a malformed chain is not a
 * "the cap moved" problem, and silently rewriting it would hide a real error.
 * The input is not mutated; a non-matching input returns unchanged with no
 * warnings, so the caller can chain this with the other repair unconditionally.
 *
 * Each clamped overrun is also *recorded* in the same buffer the schema clamp writes
 * to (B04), so the caller announces it through one deduplicated path with one wording
 * instead of logging here: this function runs inside a read that may still throw for
 * an unrelated defect, and a read happens per message, so logging here would repeat
 * the line on every message for as long as the patch keeps failing.
 * @param raw - raw user configuration (plain snapshot shape).
 * @returns The clamped config plus human-readable warnings (empty when nothing matched).
 */
export declare function repairLimitOverruns(raw: GrokWorkflowConfig): {
    repaired: GrokWorkflowConfig;
    warnings: string[];
};
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
/** One-line summary of a resolved config, for the load-time and per-edit log line.
 *
 * t47: the t46 acceptance round could not answer "what did the runtime actually
 * read?" from any artefact — the deadline and the role chains only existed in
 * memory, so a settings save and a patch edit were indistinguishable from the
 * outside. This string is written to the log whenever the effective config
 * changes, and the deadline travels into the run's report as well.
 */
export declare function describeResolvedConfig(config: ResolvedConfig): string;
export declare function createConfigReader(raw: GrokWorkflowConfig | Record<string, unknown> | undefined, logger?: {
    warn(message: string): void;
}): ConfigReader;
//# sourceMappingURL=config.d.ts.map