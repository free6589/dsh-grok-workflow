import z from '@deepseek-ai/schemastery';
import type { GrokWorkflowConfig, ModelRoute, ResolvedConfig } from './types.js';
/** Hard limits; user configuration can only tighten these. */
export declare const HARD_LIMITS: {
    readonly historyTurns: 1000000;
    readonly historyChars: 1000000;
    readonly maxQueuedMessages: 8;
    /**
     * Concurrency and retries are the plugin's *documented* engine-hook contract
     * (AGENTS.md "Architecture invariants", D-003): default 10 / hard maximum 100, and
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
    readonly maxConcurrency: 100;
    readonly maxRetries: 3;
    readonly maxTasks: 100;
    readonly maxActiveRuns: 4;
    readonly maxActiveRunsTotal: 16;
    /** Maximum routes in one role's fallback chain. */
    readonly chainLength: 50;
    /** Maximum characters in one provider or model id. */
    readonly routeChars: 120;
    /** Per child-call stall budget in milliseconds: default and ceiling 120 minutes. */
    readonly childTimeoutMs: {
        readonly min: 1000;
        readonly max: 7200000;
    };
    /** Per-route in-flight ceiling (`maxInFlight`): 1 keeps a private lane, 64 is the widest share. */
    readonly routeInFlight: {
        readonly min: 1;
        readonly max: 64;
    };
    /**
     * Route health (`src/script.ts` dead routes): how many consecutive counted
     * transport failures make a route dead, and how many dead routes one run keeps.
     *
     * The generated script mirrors both numbers by value (it cannot import host
     * code) and `test/dead-routes.spec.ts` pins the parity: the threshold is 2
     * because one transport failure is weather and two in a row is a route, and
     * the bound is 16 because a chain cannot be longer than 50 and the oldest row
     * is the one worth dropping first.
     */
    readonly deadRoute: {
        readonly threshold: 2;
        readonly routes: 16;
    };
    /** Extreme backstop on child calls charged against one task (worker + verifier + supervisor). */
    readonly maxAttemptsPerTask: 1000;
    /**
     * Repeat-run envelope (`loopMaxRounds` / `loopFailStreak`). Every round is one
     * full workflow run charged against provider quota, so these two numbers are the
     * reason a repeat run cannot become an unbounded worker; both take effect clamped
     * (`LIMIT_CAPS`) rather than being silently exceeded.
     */
    readonly loopMaxRounds: 100;
    readonly loopFailStreak: 20;
    /** Seven days: the loop service's own hard ceiling on a heartbeat interval. */
    readonly loopIntervalMin: 10080;
    /** Seven days: the same ceiling for the self-iteration heartbeat's interval. */
    readonly iterateIntervalMin: 10080;
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
    readonly maxConcurrency: 100;
    readonly maxTasks: 100;
    readonly loopMaxRounds: 100;
    readonly loopFailStreak: 20;
    readonly loopIntervalMin: 10080;
    readonly iterateIntervalMin: 10080;
    /** Per-call stall budget: the default is the ceiling, so an overrun clamps to the default itself. */
    readonly childTimeoutMs: 7200000;
};
/** A configuration key whose stored number takes effect clamped to its hard maximum. */
export type LimitField = keyof typeof LIMIT_CAPS;
/**
 * Default run deadline in milliseconds: 0 = unlimited (no timer is armed).
 *
 * The 60-minute default was measured wrong twice in one afternoon — two
 * four-task runs were killed at exactly 30m00s and 30m01s — while real
 * four-task runs finish in 878 s / 1148 s / 1801 s. 60 minutes kept a hung
 * run bounded and gave the observed worst case roughly 2x headroom (D-017).
 * The operator decision is now the opposite: a run has no deadline unless
 * the caller sets one, so the default carries no timer at all. A caller
 * that wants a bound sets `timeoutMs` explicitly in the profile patch or
 * on the settings page.
 *
 * `timeoutMs` is user-configurable since 0.11.0: a caller raises or lowers it
 * in the profile patch or on the settings page. `0` means unlimited — no timer
 * is armed — and is now the default as well, because the operator chose
 * unbounded runs over a fixed 60-minute cap.
 */
export declare const DEFAULT_TIMEOUT_MS = 0;
/** Default per child-call stall budget in milliseconds: 120 minutes.
 *
 * User request 2026-11-22: the old 10-minute default killed healthy slow
 * children (session-77a3f6fb, D-097). Configurable as `childTimeoutMs`
 * (settings page shows minutes); the hard ceiling is `CHILD_TIMEOUT_MAX_MS`
 * in `src/timeout.ts`, deliberately the same 120 minutes, so the default
 * always loads and any stored overrun clamps to itself.
 */
export declare const DEFAULT_CHILD_TIMEOUT_MS = 7200000;
/**
 * Historical name for the same binding, kept because tests and older imports
 * read it. It is no longer a *fixed* value: `timeoutMs` is configurable, and
 * this constant names its default.
 */
export declare const FIXED_TIMEOUT_MS = 0;
/**
 * Largest delay `setTimeout` accepts without overflowing (2^31 - 1).
 *
 * A larger configured deadline must NOT be passed to setTimeout (Node clamps
 * it to 1 ms and the timer fires immediately); the run treats it as unlimited
 * internally while the report records the configured value honestly.
 */
export declare const MAX_TIMER_DELAY_MS = 2147483647;
/** Maximum retries per task: fixed at 1, not user-configurable (T4 settings slim-down). */
export declare const FIXED_MAX_RETRIES = 1;
/** Default maximum tasks per run. */
export declare const DEFAULT_MAX_TASKS = 10;
/**
 * Mid-run replan switch (default on): a message sent while a run is working is
 * answered at once and joins that run at the next wave boundary instead of
 * starting a second round.
 *
 * On by default because the main session must always be able to talk: with it
 * off, a message typed during a run only opens the next round, which is the
 * "one workflow blocks the conversation" complaint (manual item Sec.2-2). The
 * cost is bounded — one planner-route call per boundary, at most
 * `min(waves, 4)` per run, and only when a message actually arrives mid-run —
 * and the settings page keeps a visible switch for turning it off. Quoted here
 * once so the schema, `resolveConfig`, the settings page and the docs cannot
 * disagree about what "unset" means.
 */
export declare const DEFAULT_REPLAN = true;
/**
 * Whether a rate-limited (HTTP 429) route advances to the next model in the chain.
 *
 * The built-in switching policy has always advanced on every transport class,
 * `rate-limit` included, but the operator could not see or change it: the old
 * `switchOn` key was removed wholesale in T4, and the requirement that survived
 * it — "模型失败换人时加 429 之类的勾选框" (manual item Sec.3-2) — was left with no
 * surface at all. This is the one class the operator named, exposed as a single
 * checkbox, so the policy stays the built-in one and only the named exception is
 * editable.
 *
 * On by default: a 429 means "this route is busy", which is exactly when falling
 * through to the next model is worth an attempt. Turning it off keeps the route
 * in place and lets the task's bounded retry decide, which is the right choice
 * when the next model costs much more than waiting.
 */
export declare const DEFAULT_SWITCH_ON_RATE_LIMIT = true;
/**
 * The built-in switching classes minus `rate-limit`.
 *
 * The script reads an empty `switchOn` as "the built-in policy" and a non-empty
 * one as "only these classes advance"; so switching 429 off means naming the
 * remaining six explicitly. Typed against the same union as `FIXED_SWITCH_ON` so
 * a class added there cannot be forgotten here.
 */
export declare const FIXED_SWITCH_ON_WITHOUT_RATE_LIMIT: Array<'server-error' | 'connection' | 'timeout' | 'model-unavailable' | 'format-error' | 'agent-start-failed'>;
/**
 * Defaults of the repeat-run surface (`loopEnabled` / `loopMaxRounds` /
 * `loopFailStreak` / `loopIntervalMin`).
 *
 * A repeat run is an opt-in, never the default: an enabled-by-default loop would
 * turn one message into an unbounded series of full workflow runs. Ten rounds,
 * three consecutive failed rounds and no wait between rounds are the values the
 * schema, the settings page and the docs quote — one constant each, so the three
 * cannot disagree about what "unset" means.
 */
export declare const DEFAULT_LOOP_ENABLED = false;
/**
 * Whether the block intake (接单台子) is mounted at all.
 *
 * Off by default, and off means *inert*: `src/index.ts` registers none of the six
 * `grok_*block*` tools and installs no extra `agent/pre-step` listener, so a
 * profile that never asked for the feature keeps the pre-block surface and the
 * pre-block delivery decisions byte for byte. On registers the six tools plus one
 * narrow heartbeat observer; it never changes a routing decision.
 *
 * Plain, not `volatile()`: this is a load-time switch (the tools it gates are
 * registered once, at `apply()`), so projecting it onto the settings page would
 * promise a live edit that a reload alone can honor. `toolName` and
 * `configVersion` are plain for the same reason.
 */
export declare const DEFAULT_BLOCK_INTAKE = false;
export declare const DEFAULT_LOOP_MAX_ROUNDS = 10;
export declare const DEFAULT_LOOP_FAIL_STREAK = 3;
/**
 * Minutes to wait between rounds. `0` asks for the loop's own floor — never under one
 * worst-case round, never under 60 minutes — so it is not "start immediately". Mind
 * the units: this value is minutes, while `timeoutMs` is milliseconds.
 */
export declare const DEFAULT_LOOP_INTERVAL_MIN = 0;
/**
 * Minutes to wait between self-iteration heartbeats. Same semantics and floor as
 * {@link DEFAULT_LOOP_INTERVAL_MIN}: `0` asks for the heartbeat's own floor, never
 * "start immediately".
 */
export declare const DEFAULT_ITERATE_INTERVAL_MIN = 0;
/**
 * Default prompt of the self-iteration heartbeat, as the settings page's template
 * textarea and the schema default both ship it.
 *
 * The template is the whole stored prompt of the `RSI heartbeat` Schedule task, so
 * it is written to be delivered, not documented: bounded (one round, one item),
 * guard-first (an open round or a dirty tree means no new round), and explicit
 * about stopping. It deliberately carries **no** routing marker: a self-iteration
 * delivery routes as an ordinary schedule message (`docs/knowledge/HEARTBEATS.md`
 * §2), so editing this text can never change how the gate routes it.
 *
 * `docs/iterate-template.md` is the reader-facing copy of this same text, and
 * `test/iterate-template.spec.ts` asserts the two are byte-identical — the file
 * explains why the template must cover POOL-first topic selection, the small/big
 * split, R1–R6, the triple review, four brakes and the forbidden zones.
 */
export declare const DEFAULT_ITERATE_TEMPLATE: string;
/**
 * Defaults of the two documented run limits (10 concurrent tasks, 1 retry).
 *
 * Declared once and read by the schema defaults, the checkpoint recorder and the
 * tests, so a settings form, a hand-written profile patch and a programmatic call
 * cannot disagree about what "unset" means.
 * `src/checkpoint/schema.ts` imports them for `ENGINE_HOOK_LIMITS`, which is what
 * keeps the recorded contract and the accepted configuration equal by construction
 * instead of by comment.
 */
export declare const DEFAULT_MAX_CONCURRENCY = 10;
/** Fixed per-session active-run cap. */
export declare const FIXED_MAX_ACTIVE_RUNS = 2;
/** Fixed process-wide active-run backstop. */
export declare const FIXED_MAX_ACTIVE_RUNS_TOTAL = 8;
/** Fixed carry-over/history budget (rounds, chars). */
export declare const FIXED_HISTORY_TURNS = 20;
export declare const FIXED_HISTORY_CHARS = 20000;
/** Fixed per-agent queue bound. */
export declare const FIXED_MAX_QUEUED_MESSAGES = 4;
/** Fixed ledger row bound. */
export declare const FIXED_RECORD_LIMIT = 256;
/** Front desk is always `rules` + follow-up shortcut on; receipt always posted. */
export declare const FIXED_TRIAGE_FOLLOWUP_AS_FAST = true;
export declare const FIXED_INSTANT_RECEIPT = true;
export declare const FIXED_HUMAN_SUMMARY = true;
export declare const FIXED_SHOW_DIAGNOSTICS = false;
/** Only `in-turn` survives: `relay`/`append` lose the answer on a one-shot app (D-050). */
export declare const FIXED_ANSWER_STRATEGY: "in-turn";
export declare const FIXED_TRIAGE_CLASSIFIER: "rules";
export declare const FIXED_TRIAGE_ASK = true;
export declare const FIXED_RECORD_RUNS = true;
export declare const FIXED_SHOW_PROGRESS = true;
/** Empty means the built-in switching policy. */
export declare const FIXED_SWITCH_ON: Array<'rate-limit' | 'server-error' | 'connection' | 'timeout' | 'model-unavailable' | 'format-error' | 'agent-start-failed'>;
/** Gate is always on; `gate.ts` no longer consults any preset/required switch. */
export declare const FIXED_GATE_ON = true;
/**
 * Bounded grace window an unload gives the child calls already in flight.
 *
 * An in-process reload used to cancel every live run the moment the disposer
 * ran, which threw away a ten-minute child call 200 ms before it would have
 * reported. The window is a ceiling, not a promise: a child that settles inside
 * it settles, and whatever is still running when it closes is cancelled and
 * named in the record. Nothing survives `kill -9`, so a shutdown signal skips
 * the window entirely rather than holding the process open.
 */
export declare const FIXED_UNLOAD_DRAIN_MS = 45000;
/** How long the drain must see no open child before it trusts "nothing is left". */
export declare const FIXED_UNLOAD_DRAIN_QUIET_MS = 1500;
/** How often the drain re-reads the open-child count. */
export declare const FIXED_UNLOAD_DRAIN_STEP_MS = 250;
/** Default concurrent workflow runs per session (t45, P1-3). Kept as a fixed internal value (T4). */
export declare const DEFAULT_MAX_ACTIVE_RUNS = 2;
/**
 * Default concurrent workflow runs across every session.
 *
 * The per-session cap is what a user reasons about; this one only keeps the
 * number of child agents in one process bounded.
 */
export declare const DEFAULT_MAX_ACTIVE_RUNS_TOTAL = 8;
/** Version of the configuration surface this build understands. */
export declare const CONFIG_VERSION = 1;
/**
 * Every top-level key the configuration accepts, in schema order.
 * Twenty keys in the accepted surface; seventeen of them reach the settings
 * page (`toolName`, `blockIntake` and `configVersion` are plain, not volatile,
 * so the runtime projection drops them — pinned in `test/settings-projection.spec.ts`).
 * Kept explicit so an unknown key can be rejected instead of silently dropped:
 * a typo that is silently ignored looks exactly like a setting that "does not
 * work", which is the failure mode the settings surface must not have.
 */
export declare const CONFIG_KEYS: readonly ["toolName", "mode", "grokDefault", "roles", "guardianModel", "synthesis", "maxConcurrency", "maxTasks", "timeoutMs", "childTimeoutMs", "replan", "switchOnRateLimit", "loopEnabled", "loopMaxRounds", "loopFailStreak", "loopIntervalMin", "iterateIntervalMin", "iterateTemplate", "blockIntake", "configVersion"];
/**
 * The role names a configuration may route, in the order `resolveConfig` builds them.
 *
 * Listed here as well as in `resolveConfig` so the nested key check can name them:
 * the two lists are pinned against each other by `test/config.spec.ts`, so a role
 * added to one side cannot be silently unmapped on the other.
 */
export declare const ROLE_KEYS: readonly ["planner", "worker", "verifier", "synthesizer", "supervisor"];
/** The keys one route object may carry; `maxInFlight` is the per-route lane ceiling. */
export declare const ROUTE_KEYS: readonly ["provider", "model", "maxInFlight"];
/** Every key removed by the T4 slim-down; a patch that still carries one is rejected (R-06). */
export declare const REMOVED_CONFIG_KEYS: readonly ["enforceGate", "gateRequired", "gateScope", "gatePreset", "answerStrategy", "triageAsk", "triageModel", "triageClassifier", "triageFollowupAsFast", "instantReceipt", "humanSummary", "showDiagnostics", "historyTurns", "historyChars", "maxQueuedMessages", "maxRetries", "maxActiveRuns", "maxActiveRunsTotal", "subagentProvider", "switchOn", "recordRuns", "recordLimit", "showProgress"];
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
 * `toolName` is fixed at registration and `configVersion` is a wire contract
 * (the old `enforceGate`/`gateRequired` switch is gone: the gate always runs,
 * and a runtime without its hook fails the load, round-54).
 * `snapshotConfig()` below turns holders back into plain values, so one reader
 * serves a hand-written config, a profile patch and a live settings form alike.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    toolName: z<string, string, "defined">;
    mode: z<"full" | "triage", "full" | "triage", "volatile-defined">;
    grokDefault: z<"on" | "off", "on" | "off", "volatile-defined">;
    maxConcurrency: z<number, number, "volatile-defined">;
    maxTasks: z<number, number, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    childTimeoutMs: z<number, number, "volatile-defined">;
    replan: z<boolean, boolean, "volatile-defined">;
    switchOnRateLimit: z<boolean, boolean, "volatile-defined">;
    loopEnabled: z<boolean, boolean, "volatile-defined">;
    loopMaxRounds: z<number, number, "volatile-defined">;
    loopFailStreak: z<number, number, "volatile-defined">;
    loopIntervalMin: z<number, number, "volatile-defined">;
    iterateIntervalMin: z<number, number, "volatile-defined">;
    iterateTemplate: z<string, string, "volatile-defined">;
    blockIntake: z<boolean, boolean, "defined">;
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
        supervisor: z<({
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
        supervisor: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
    }>>>, "volatile-defined">;
    guardianModel: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
    }>>>, "volatile-defined">;
    synthesis: z<"model" | "layered", "model" | "layered", "volatile-defined">;
    configVersion: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    toolName: z<string, string, "defined">;
    mode: z<"full" | "triage", "full" | "triage", "volatile-defined">;
    grokDefault: z<"on" | "off", "on" | "off", "volatile-defined">;
    maxConcurrency: z<number, number, "volatile-defined">;
    maxTasks: z<number, number, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    childTimeoutMs: z<number, number, "volatile-defined">;
    replan: z<boolean, boolean, "volatile-defined">;
    switchOnRateLimit: z<boolean, boolean, "volatile-defined">;
    loopEnabled: z<boolean, boolean, "volatile-defined">;
    loopMaxRounds: z<number, number, "volatile-defined">;
    loopFailStreak: z<number, number, "volatile-defined">;
    loopIntervalMin: z<number, number, "volatile-defined">;
    iterateIntervalMin: z<number, number, "volatile-defined">;
    iterateTemplate: z<string, string, "volatile-defined">;
    blockIntake: z<boolean, boolean, "defined">;
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
        supervisor: z<({
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
        supervisor: z<({
            provider?: string | null;
            model?: string | null;
            maxInFlight?: number | null;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            provider: z<string, string, "defined">;
            model: z<string, string, "plain">;
            maxInFlight: z<number, number, "plain">;
        }>>[], "defined">;
    }>>>, "volatile-defined">;
    guardianModel: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
    }>>>, "volatile-defined">;
    synthesis: z<"model" | "layered", "model" | "layered", "volatile-defined">;
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
 * Reject unknown keys instead of letting the loader and the schema drop them.
 *
 * Three levels are checked, because a dropped key reads identically at every one of
 * them: a silently ignored setting looks exactly like a setting that does not work,
 * which is the failure mode the settings surface must not have. The nested levels are
 * `roles.<role>` (a role name this build does not route — `reviewer` was the reported
 * typo) and `roles.<role>[<index>].<key>` (a route field, `maxInflight` being the one
 * the pool reported). The check runs before the chains are normalized, so a route
 * written as a bare model id is skipped rather than read as an object.
 *
 * The `roles` value's own shape is checked here first: `resolveChain` reads
 * `config.roles?.planner`, which on a string, an array or `null` is `undefined` for every
 * role — five empty chains, a successful load, and no route configured at all. Absent
 * (`undefined`) stays legal; it is the documented "inherit the run's route".
 * @param config - raw user configuration.
 * @throws If a key at any level is not part of the configuration surface, or if `roles`
 *   is present and is not an object.
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