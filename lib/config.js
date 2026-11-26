import z from '@deepseek-ai/schemastery';
import { MAX_LOOP_PROMPT_CHARS } from './loop.js';
import { CHILD_TIMEOUT_MAX_MS } from './timeout.js';
/** Hard limits; user configuration can only tighten these. */
export const HARD_LIMITS = {
    historyTurns: 1_000_000,
    historyChars: 1_000_000,
    maxQueuedMessages: 8,
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
    maxConcurrency: 100,
    maxRetries: 3,
    maxTasks: 100,
    maxActiveRuns: 4,
    maxActiveRunsTotal: 16,
    /** Maximum routes in one role's fallback chain. */
    chainLength: 50,
    /** Maximum characters in one provider or model id. */
    routeChars: 120,
    /** Per child-call stall budget in milliseconds: default and ceiling 120 minutes. */
    childTimeoutMs: { min: 1_000, max: CHILD_TIMEOUT_MAX_MS },
    /** Per-route in-flight ceiling (`maxInFlight`): 1 keeps a private lane, 64 is the widest share. */
    routeInFlight: { min: 1, max: 64 },
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
    deadRoute: { threshold: 2, routes: 16 },
    /** Extreme backstop on child calls charged against one task (worker + verifier + supervisor). */
    maxAttemptsPerTask: 1000,
    /**
     * Repeat-run envelope (`loopMaxRounds` / `loopFailStreak`). Every round is one
     * full workflow run charged against provider quota, so these two numbers are the
     * reason a repeat run cannot become an unbounded worker; both take effect clamped
     * (`LIMIT_CAPS`) rather than being silently exceeded.
     */
    loopMaxRounds: 100,
    loopFailStreak: 20,
    /** Seven days: the loop service's own hard ceiling on a heartbeat interval. */
    loopIntervalMin: 10_080,
    /** Seven days: the same ceiling for the self-iteration heartbeat's interval. */
    iterateIntervalMin: 10_080,
    /** Hard ceiling on routing ledger entries kept per run. */
    recordEntries: 256,
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
    synthesisSummaryChars: 2_000,
    synthesisDigestChars: 6_000,
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
export const LIMIT_CAPS = {
    maxConcurrency: HARD_LIMITS.maxConcurrency,
    maxTasks: HARD_LIMITS.maxTasks,
    // Repeat-run caps: a stored number above these is a quota overrun, so the same
    // clamp-and-announce recovery applies instead of killing the row (B02, B07).
    loopMaxRounds: HARD_LIMITS.loopMaxRounds,
    loopFailStreak: HARD_LIMITS.loopFailStreak,
    loopIntervalMin: HARD_LIMITS.loopIntervalMin,
    iterateIntervalMin: HARD_LIMITS.iterateIntervalMin,
    /** Per-call stall budget: the default is the ceiling, so an overrun clamps to the default itself. */
    childTimeoutMs: HARD_LIMITS.childTimeoutMs.max,
};
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
export const DEFAULT_TIMEOUT_MS = 0;
/** Default per child-call stall budget in milliseconds: 120 minutes.
 *
 * User request 2026-11-22: the old 10-minute default killed healthy slow
 * children (session-77a3f6fb, D-097). Configurable as `childTimeoutMs`
 * (settings page shows minutes); the hard ceiling is `CHILD_TIMEOUT_MAX_MS`
 * in `src/timeout.ts`, deliberately the same 120 minutes, so the default
 * always loads and any stored overrun clamps to itself.
 */
export const DEFAULT_CHILD_TIMEOUT_MS = 7_200_000;
/**
 * Historical name for the same binding, kept because tests and older imports
 * read it. It is no longer a *fixed* value: `timeoutMs` is configurable, and
 * this constant names its default.
 */
export const FIXED_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
/**
 * Largest delay `setTimeout` accepts without overflowing (2^31 - 1).
 *
 * A larger configured deadline must NOT be passed to setTimeout (Node clamps
 * it to 1 ms and the timer fires immediately); the run treats it as unlimited
 * internally while the report records the configured value honestly.
 */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;
/** Maximum retries per task: fixed at 1, not user-configurable (T4 settings slim-down). */
export const FIXED_MAX_RETRIES = 1;
/** Default maximum tasks per run. */
export const DEFAULT_MAX_TASKS = 10;
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
export const DEFAULT_REPLAN = true;
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
export const DEFAULT_SWITCH_ON_RATE_LIMIT = true;
/**
 * The built-in switching classes minus `rate-limit`.
 *
 * The script reads an empty `switchOn` as "the built-in policy" and a non-empty
 * one as "only these classes advance"; so switching 429 off means naming the
 * remaining six explicitly. Typed against the same union as `FIXED_SWITCH_ON` so
 * a class added there cannot be forgotten here.
 */
export const FIXED_SWITCH_ON_WITHOUT_RATE_LIMIT = [
    'server-error',
    'connection',
    'timeout',
    'model-unavailable',
    'format-error',
    'agent-start-failed',
];
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
export const DEFAULT_LOOP_ENABLED = false;
/**
 * Whether the block intake (接单台子) is mounted at all.
 *
 * On by default (M3.3): the six `grok_*block*` tools and one `agent/pre-step`
 * observer are part of a default load. Off means *inert*: `src/index.ts` registers
 * none of the six tools and installs no observer, so a profile that turns the
 * feature off keeps the intake-free surface. The switch never changes a routing
 * decision.
 *
 * Plain, not `volatile()`: this is a load-time switch (the tools it gates are
 * registered once, at `apply()`), so projecting it onto the settings page would
 * promise a live edit that a reload alone can honor. `toolName` and
 * `configVersion` are plain for the same reason.
 */
export const DEFAULT_BLOCK_INTAKE = true;
/**
 * Forced team routing switch (`src/force-team.ts`), on by default.
 *
 * A load-time switch like `blockIntake`: off registers no `agent/pre-step` listener
 * at all, so a profile that turns it off keeps the pre-feature chain. On by default
 * because the feature exists to stop the one behaviour the operator called
 * unacceptable — a turn that asked for a team and got a single-model answer — and a
 * switch that ships off would ship the behaviour it was built to stop.
 */
export const DEFAULT_FORCE_TEAM_ROUTING = true;
export const DEFAULT_LOOP_MAX_ROUNDS = 10;
export const DEFAULT_LOOP_FAIL_STREAK = 3;
/**
 * Minutes to wait between rounds. `0` asks for the loop's own floor — never under one
 * worst-case round, never under 60 minutes — so it is not "start immediately". Mind
 * the units: this value is minutes, while `timeoutMs` is milliseconds.
 */
export const DEFAULT_LOOP_INTERVAL_MIN = 0;
/**
 * Minutes to wait between self-iteration heartbeats. Same semantics and floor as
 * {@link DEFAULT_LOOP_INTERVAL_MIN}: `0` asks for the heartbeat's own floor, never
 * "start immediately".
 */
export const DEFAULT_ITERATE_INTERVAL_MIN = 0;
/**
 * Default prompt of the self-iteration heartbeat, as the settings page's template
 * textarea and the schema default both ship it.
 *
 * The template is the whole stored prompt of the `RSI heartbeat` Schedule task, so
 * it is written to be delivered, not documented: bounded (one round, one item),
 * guard-first (an open round or a dirty tree means no new round), and explicit
 * about stopping. It deliberately carries **no** routing marker: a self-iteration
 * delivery routes as an ordinary schedule message (`docs/knowledge/HEARTBEATS.md`
 * §2), so editing this text can never change how a delivery is routed.
 *
 * `docs/iterate-template.md` is the reader-facing copy of this same text, and
 * `test/iterate-template.spec.ts` asserts the two are byte-identical — the file
 * explains why the template must cover POOL-first topic selection, the small/big
 * split, R1–R6, the triple review, four brakes and the forbidden zones.
 */
export const DEFAULT_ITERATE_TEMPLATE = [
    "# RSI heartbeat — self-iteration round",
    "",
    "Delivered by an Automation task (source.kind = \"schedule\"), not by the operator.",
    "Nobody answers inside this turn: do not ask, do not wait for approval. Decide,",
    "do one bounded round, record it, end the turn.",
    "",
    "## Pick the topic (two sources, POOL first)",
    "",
    "1. POOL first: read `.rsi/POOL.md` and take the highest-priority item that is not",
    "   DONE. Its anchors are the requirement; do not re-derive what it already names.",
    "2. Only when the POOL has nothing actionable, fall through in this order: open",
    "   TODO and FAIL rows in `.rsi/STATE.md` and `.rsi/LOG.md`, then open GitHub",
    "   issues, then research notes or papers that name a defect in this repository.",
    "",
    "At least one item lands per round. A round that lands nothing is a STOP, not an",
    "empty round: say why and end.",
    "",
    "## Size the change before starting",
    "",
    "- Small fix (one file, no public surface, no behavior change): implement it",
    "  directly. No research round, no new document.",
    "- Big change (new feature, cross-file behavior, public surface, or anything the",
    "  POOL has not approved): first record a RESEARCH entry in",
    "  `docs/knowledge/RESEARCH.md` with measured facts and file anchors, and get the",
    "  item approved in `.rsi/POOL.md`. Without that approval it is not this round's",
    "  work.",
    "- Never cite a paper, benchmark, issue or upstream commit you did not read. No",
    "  invented references, no invented numbers; an unverified claim is HYPOTHESIS.",
    "",
    "## Execute R1–R6",
    "",
    "R1 read AGENTS.md, PROTOCOL, STATE, LOG, HANDOFF and CHANGELOG.",
    "R2 update the pool, then pick exactly one theme by its priority order.",
    "R3 implement only that theme.",
    "R4 self-test: the change fails before and passes after; no test is weakened.",
    "R5 write the round report in `.rsi/ROUND.md` with evidence paths and NOT_RUN items.",
    "R6 do not commit, tag or publish on your own; the operator's release path does.",
    "",
    "## Triple review before calling the round done",
    "",
    "1. Self-review the diff against the round's theme: nothing unrelated, no secret,",
    "   no new runtime dependency without a recorded reason.",
    "2. `npm run ci` green and `npm run verify:lib` byte-identical.",
    "3. A live check on a copied profile (never the operator's profile), transcript",
    "   saved under `.rsi/evidence/round-NNN/` with credentials redacted.",
    "",
    "A review that cannot run is recorded as NOT_RUN with the reason. Never claim a",
    "live result that was not observed.",
    "",
    "## Four brakes (stop, do not negotiate)",
    "",
    "1. `.rsi/STOP` exists: stop, open nothing.",
    "2. The previous round is unclosed, or tracked files are dirty: do not open a new",
    "   round; say what is unclosed in one or two sentences and end the turn.",
    "3. Two consecutive rounds landed nothing: stop and report.",
    "4. The day's round or token budget is spent: stop; the next heartbeat decides again.",
    "",
    "## Forbidden zones",
    "",
    "- No API keys, tokens, cookies, passwords or private keys in source, tests, docs,",
    "  commits, logs or evidence; redact before saving.",
    "- No force-push, no moving or overwriting a published tag, no rewriting shared",
    "  history.",
    "- No changes to the DSH core repository or to another profile: this repository only.",
    "- No weakening of tests, CI or release checks to make a round pass.",
    "- No npm publish, release or repository-visibility change without explicit",
    "  authorization.",
].join('\n');
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
export const DEFAULT_MAX_CONCURRENCY = 10;
/** Fixed per-session active-run cap. */
export const FIXED_MAX_ACTIVE_RUNS = 2;
/** Fixed process-wide active-run backstop. */
export const FIXED_MAX_ACTIVE_RUNS_TOTAL = 8;
/** Fixed carry-over/history budget (rounds, chars). */
export const FIXED_HISTORY_TURNS = 20;
export const FIXED_HISTORY_CHARS = 20_000;
/** Fixed ledger row bound. */
export const FIXED_RECORD_LIMIT = 256;
/** Front desk is always `rules` + follow-up shortcut on; receipt always posted. */
export const FIXED_HUMAN_SUMMARY = true;
export const FIXED_SHOW_DIAGNOSTICS = false;
/** Only `in-turn` survives: `relay`/`append` lose the answer on a one-shot app (D-050). */
export const FIXED_ANSWER_STRATEGY = 'in-turn';
export const FIXED_TRIAGE_CLASSIFIER = 'rules';
export const FIXED_RECORD_RUNS = true;
export const FIXED_SHOW_PROGRESS = true;
/** Empty means the built-in switching policy. */
export const FIXED_SWITCH_ON = [];
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
export const FIXED_UNLOAD_DRAIN_MS = 45_000;
/** How long the drain must see no open child before it trusts "nothing is left". */
export const FIXED_UNLOAD_DRAIN_QUIET_MS = 1_500;
/** How often the drain re-reads the open-child count. */
export const FIXED_UNLOAD_DRAIN_STEP_MS = 250;
/** Default concurrent workflow runs per session (t45, P1-3). Kept as a fixed internal value (T4). */
export const DEFAULT_MAX_ACTIVE_RUNS = 2;
/**
 * Default concurrent workflow runs across every session.
 *
 * The per-session cap is what a user reasons about; this one only keeps the
 * number of child agents in one process bounded.
 */
export const DEFAULT_MAX_ACTIVE_RUNS_TOTAL = 8;
/** Version of the configuration surface this build understands. */
export const CONFIG_VERSION = 1;
/**
 * Every top-level key the configuration accepts, in schema order.
 * Twenty keys in the accepted surface; sixteen of them reach the settings
 * page (`toolName`, `blockIntake`, `forceTeamRouting` and `configVersion` are
 * plain, not volatile, so the runtime projection drops them — pinned in
 * `test/settings-projection.spec.ts`).
 * Kept explicit so an unknown key can be rejected instead of silently dropped:
 * a typo that is silently ignored looks exactly like a setting that "does not
 * work", which is the failure mode the settings surface must not have.
 */
export const CONFIG_KEYS = [
    'toolName',
    'grokDefault',
    'roles',
    'guardianModel',
    'synthesis',
    'maxConcurrency',
    'maxTasks',
    'timeoutMs',
    'childTimeoutMs',
    'replan',
    'switchOnRateLimit',
    'loopEnabled',
    'loopMaxRounds',
    'loopFailStreak',
    'loopIntervalMin',
    'iterateIntervalMin',
    'iterateTemplate',
    'blockIntake',
    'forceTeamRouting',
    'configVersion',
];
/**
 * The role names a configuration may route, in the order `resolveConfig` builds them.
 *
 * Listed here as well as in `resolveConfig` so the nested key check can name them:
 * the two lists are pinned against each other by `test/config.spec.ts`, so a role
 * added to one side cannot be silently unmapped on the other.
 */
export const ROLE_KEYS = ['planner', 'worker', 'verifier', 'synthesizer', 'supervisor'];
/** The keys one route object may carry; `maxInFlight` is the per-route lane ceiling. */
export const ROUTE_KEYS = ['provider', 'model', 'maxInFlight'];
/**
 * The keys the single `guardianModel` route may carry: the same pair as a
 * chain route, minus the lane ceiling (an adjudicator has no chain to yield
 * in, so `maxInFlight` would be read and then silently dropped).
 */
const GUARDIAN_MODEL_KEYS = ['provider', 'model'];
/**
 * Every key this build no longer accepts. A patch that still carries one is *ignored*
 * and told so (D-155), not refused: the value never reaches the resolved config, the
 * load log names the key once, and the settings page names it again.
 *
 * Only removed keys are ignored. Unknown keys and misspellings still fail the load with
 * a did-you-mean suggestion (R-06), so a typo cannot become a setting that does nothing.
 *
 * The first twenty-three went with the T4 slim-down; `mode` and `legacyGate` went with
 * M3.3, which deleted the old front desk and the routing mode it read.
 */
export const REMOVED_CONFIG_KEYS = [
    'enforceGate',
    'gateRequired',
    'gateScope',
    'gatePreset',
    'answerStrategy',
    'triageAsk',
    'triageModel',
    'triageClassifier',
    'triageFollowupAsFast',
    'instantReceipt',
    'humanSummary',
    'showDiagnostics',
    'historyTurns',
    'historyChars',
    'maxQueuedMessages',
    'maxRetries',
    'maxActiveRuns',
    'maxActiveRunsTotal',
    'subagentProvider',
    'switchOn',
    'recordRuns',
    'recordLimit',
    'showProgress',
    'mode',
    'legacyGate',
];
const TOOL_NAME = /^[a-z][a-z0-9_]{1,40}$/;
/**
 * Removed keys a patch still carried, waiting for the load path to announce them (D-155).
 *
 * A `Set`, so a document that carries the same leftover twice — or a config the host
 * re-parses on every settings read — leaves one note per key. Recorded rather than
 * logged for the same reason as {@link recordedOverruns}: the check runs inside
 * `resolveConfig`, which the host calls before `apply()` and which has no logger, and a
 * read happens per message, so logging here would repeat the line forever.
 */
const recordedRemovedKeys = new Set();
/**
 * Drain the removed keys recorded since the last call.
 *
 * The caller announces each one once; nothing is announced twice by this module.
 * @returns The distinct leftover keys, in the order the check first met them.
 */
export function takeRemovedKeys() {
    const out = [...recordedRemovedKeys];
    recordedRemovedKeys.clear();
    return out;
}
/**
 * The one sentence that names a leftover removed key, in both shipped languages.
 *
 * It has to say three things a reader holding an old patch needs: which key, that it was
 * removed, and that the value is now doing nothing — "ignored" alone would read as "it
 * still works, quietly".
 * @param key - the removed key the patch still carries.
 * @returns the warning line the plugin logs.
 */
export function removedKeyWarning(key) {
    return `configuration key "${key}" was removed in an earlier release: its stored value is ignored, ` +
        `and the rest of the row loads normally (delete that line when convenient). ` +
        `已忽略已删除的配置键 "${key}"：存的值不生效，这一行其余配置照常载入，方便时可把那一行删掉`;
}
/**
 * Overruns recorded by the schema clamp, waiting for the load path to announce them.
 *
 * This buffer is the one impure thing in this module, and it is deliberate: the
 * clamp happens inside a `Config` resolver, which the host runs *before* `apply()`
 * and which has no logger. A schema cannot warn, so it records and the plugin
 * drains. Keyed by field + stored value because the resolver calls the transform
 * callback twice (the value and the adapted input) and the host may parse the same
 * document again; the reader still sees one entry per distinct stored overrun.
 */
const recordedOverruns = new Map();
/**
 * Drain the overruns the schema clamp recorded since the last call.
 *
 * The caller announces them once: a config document parsed before `apply()` (the
 * ordinary profile-patch path) leaves its notes here, and so does every later
 * re-parse, so nothing is lost and nothing is announced twice by this module.
 * @returns The distinct overruns recorded since the previous drain, in field order.
 */
export function takeLimitOverruns() {
    const out = [...recordedOverruns.values()];
    recordedOverruns.clear();
    return out;
}
/**
 * Note one clamped limit for the load path to announce (B04).
 *
 * Both layers that clamp call this — the schema transform and `repairLimitOverruns` —
 * so the two paths leave the *same* note, keyed by field and stored value, and the
 * caller's one-per-load set can suppress a repeat from either layer. The note is the
 * whole announcement: nothing logs here, because the schema has no logger and the
 * repair runs inside a read that may still throw for an unrelated defect.
 * @param field - the limit that overran.
 * @param stored - the value the user stored, before clamping.
 */
function recordOverrun(field, stored) {
    recordedOverruns.set(`${field}:${stored}`, { field, stored, cap: LIMIT_CAPS[field] });
}
/**
 * The one sentence that names a clamped limit, in both shipped languages.
 *
 * Shared by the schema clamp and the load-path repair so a reader cannot tell which
 * layer caught the overrun from the wording — the fact reported is the same one.
 * @param overrun - the stored value and the cap it takes effect as.
 * @returns the warning line the plugin logs.
 */
export function limitOverrunWarning({ field, stored, cap }) {
    return `${field} is ${stored}, over the hard maximum ${cap}: it now takes effect as ${cap} (repaired). `
        + `已按 ${cap} 生效（原值 ${stored} 超过上限 ${cap}），请在设置页确认`;
}
/**
 * Build a schema field that clamps an over-limit number instead of refusing it.
 *
 * The host validates the profile patch against this schema *before* the plugin is
 * called (`Fiber.resolveConfig` → `Config["~standard"].validate`), so a schema that
 * rejects a stored overrun kills the whole row — `did not activate` — and the plugin's
 * own repair never runs. Clamping here is what makes the recovery reachable at all
 * (B07), and it is the *only* clamp for every numeric hard limit (B02): the cap comes
 * from `LIMIT_CAPS`, so a schema field cannot advertise a bound the repair disagrees
 * with, and a new limit is one entry there rather than two edits and a warning.
 *
 * Only an overrun is recovered: the inner schema still refuses a non-number, a
 * fraction, `NaN` and anything below `min`, so a genuinely invalid value keeps
 * failing closed at load (R-06) and `resolveConfig` keeps throwing for the
 * programmatic path. `extra('max')` keeps the UI bound in the projected form
 * without putting the value back under validation.
 * @param field - the limit, used as its own `LIMIT_CAPS` key and in the warning.
 * @param min - inclusive minimum the value must respect.
 * @returns the schema field, clamped to `LIMIT_CAPS[field]`.
 */
function clampedLimit(field, min) {
    const cap = LIMIT_CAPS[field];
    return z.transform(z.natural().min(min), (value) => {
        if (!(value > cap))
            return value;
        recordOverrun(field, value);
        return cap;
    }).extra('max', cap);
}
/**
 * DSH profile configuration schema.
 *
 * Every user-editable field is `volatile()`: the runtime then hands it over as a
 * live holder (`.get()`) and an edit does not remount the plugin — a remount
 * would kill an in-flight run (E-12/E-31). The structural fields stay plain:
 * `toolName` is fixed at registration, `blockIntake` is fixed at registration, and
 * `configVersion` is a wire contract.
 * `snapshotConfig()` below turns holders back into plain values, so one reader
 * serves a hand-written config, a profile patch and a live settings form alike.
 */
export const Config = z.object({
    toolName: z.string().default('grok_workflow'),
    // Config-level default for the per-session grok-mode toggle (src/mode.ts):
    // `off` means a batch passes through to the model as normal chat until the
    // session turns grok mode on (the runtime toggle overrides this default).
    grokDefault: z.union([z.const('on'), z.const('off')]).default('off').volatile(),
    // concurrency (default 10, hard maximum 100), task cap (default 10, hard
    // maximum 100) and run deadline (default 0 = unlimited, no hard upper limit).
    // Every other former numeric limit is a fixed internal constant (see
    // FIXED_* above); a patch that still carries one is rejected as an unknown
    // key (R-06).
    // timeoutMs is user-configurable with no hard upper limit: any non-negative
    // integer up to MAX_SAFE_INTEGER is accepted, 0 = unlimited (no timer);
    // negatives, fractions, NaN and non-numbers fail closed (R-06).
    // childTimeoutMs is the per child-call stall budget: 1 s floor, 120 min
    // ceiling (HARD_LIMITS.childTimeoutMs). The floor keeps the timer a signal
    // rather than noise; the ceiling equals the default so an overrun clamps to
    // the default itself.
    maxConcurrency: clampedLimit('maxConcurrency', 1).default(DEFAULT_MAX_CONCURRENCY).volatile(),
    maxTasks: clampedLimit('maxTasks', 1).default(DEFAULT_MAX_TASKS).volatile(),
    timeoutMs: z.natural().min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_TIMEOUT_MS).volatile(),
    childTimeoutMs: clampedLimit('childTimeoutMs', HARD_LIMITS.childTimeoutMs.min).default(DEFAULT_CHILD_TIMEOUT_MS)
        .description('Per child-call stall budget in milliseconds, 1000-7200000 (default 120 minutes). One agent() call runs this long before the run stops waiting on it; the run deadline still caps the whole run. 单次子调用能跑多久，毫秒，1000-7200000（默认 120 分钟）；单次调用超时只重试该任务，运行死线仍是整轮上限')
        .volatile(),
    // Mid-run replan switch (`src/steering.ts`, `src/replan.ts`): on (`DEFAULT_REPLAN`)
    // answers a message sent while a run is working at once and folds it into the live
    // plan at the next wave boundary; off keeps every message its own round. On by
    // default because the main session must always be able to talk — with it off, a
    // message typed during a run can only start the next round, which is the "one
    // workflow blocks the conversation" complaint (manual item Sec.2-2). The cost is
    // bounded and paid only when a message actually arrives mid-run: one planner-route
    // call per boundary, at most `min(waves, 4)` per run. Bilingual `description()`
    // like every other switch, so a host rendering the schema without this plugin's
    // client states the same contract.
    replan: z.boolean().default(DEFAULT_REPLAN)
        .description('On by default: a message sent while a run is working is answered at once and joins the live plan at the next wave boundary (settled work is never redone); off, it starts its own round. 默认打开：跑中发来的消息立刻回执并在下个波边界并入活计划（已验证的成果不重跑）；关掉后另起一轮')
        .volatile(),
    // Rate-limit switching (manual item Sec.3-2): the one failure class the operator
    // named, exposed as a checkbox. On = the built-in policy (429 advances the
    // chain); off = the six other classes still advance, a 429 keeps the route and
    // the task's bounded retry decides.
    switchOnRateLimit: z.boolean().default(DEFAULT_SWITCH_ON_RATE_LIMIT)
        .description('On by default: a rate-limited (429) route advances to the next model in the chain. Off: only the other failure classes advance, and a 429 keeps the route for the task retry. 默认打开：限流（429）时换下一个模型；关掉后只有其它失败类别换人，429 留在原路由交给任务重试')
        .volatile(),
    // Repeat-run surface. The four keys are accepted, validated and editable here so
    // the loop service has one place to read them from; the defaults keep a loop off,
    // capped and bounded (see DEFAULT_LOOP_*). Every capped number is clamped through
    // `LIMIT_CAPS`, so a stored overrun is announced as clamped instead of killing the
    // settings row.
    //
    // Each field carries a bilingual `description()`: the label a form shows is the
    // client's own i18n key, but the *meaning* — the unit, the range and what `0`
    // asks for — travels with the schema, so a host that renders the schema without
    // this plugin's client still states the same contract. Both languages are in one
    // string (English first, then Chinese), the same shape `limitOverrunWarning()`
    // uses; a test pins that neither half can be dropped.
    loopEnabled: z.boolean().default(DEFAULT_LOOP_ENABLED)
        .description('Off by default: a run repeats only while this is on. 默认关闭：打开后才会按同一目标续跑')
        .volatile(),
    loopMaxRounds: clampedLimit('loopMaxRounds', 1).default(DEFAULT_LOOP_MAX_ROUNDS)
        .description('Rounds at most, 1-100 (above 100 takes effect as 100). 最多跑几轮，1-100（超过 100 按 100 生效）')
        .volatile(),
    loopFailStreak: clampedLimit('loopFailStreak', 1).default(DEFAULT_LOOP_FAIL_STREAK)
        .description('Stop the loop after this many consecutive failed rounds, 1-20. 连续失败几轮就停，1-20')
        .volatile(),
    loopIntervalMin: clampedLimit('loopIntervalMin', 0).default(DEFAULT_LOOP_INTERVAL_MIN)
        .description('Minutes between rounds, 0-10080; 0 asks for the loop floor (at least 60), not "start now". 两轮之间隔几分钟，0-10080；0 表示用下限（至少 60 分钟），不是立刻开始')
        .volatile(),
    // Self-iteration heartbeat surface: the interval works exactly like the loop's,
    // and the template is the whole prompt stored in the `RSI heartbeat` Schedule
    // task (edited on the settings page, persisted per profile). No routing marker:
    // these deliveries route as ordinary schedule messages, so editing the template
    // can never change how a delivery is routed.
    iterateIntervalMin: clampedLimit('iterateIntervalMin', 0).default(DEFAULT_ITERATE_INTERVAL_MIN)
        .description('Minutes between self-iteration heartbeats, 0-10080; 0 asks for the floor (at least 60), not "start now". 自迭代心跳间隔几分钟，0-10080；0 表示用下限（至少 60 分钟），不是立刻开始')
        .volatile(),
    iterateTemplate: z.string().default(DEFAULT_ITERATE_TEMPLATE)
        .description('Prompt template stored in the self-iteration heartbeat task; whitespace-only falls back to the built-in default, at most 4000 characters. 自迭代心跳任务存储的提示词模板；纯空白回退到内置默认，最多 4000 字符')
        .volatile(),
    // Block intake (接单台子): the durable block ledger, its six tools and the
    // supervisor verdict. A load-time switch, not a volatile one — the tools are
    // registered once in `apply()`, so a live flip could only promise a surface a
    // reload would have to provide. On is the default: the six tools and the
    // observer are part of a default load. Off registers nothing from the intake,
    // which is what makes "off equals the intake-free surface" a testable claim
    // rather than a promise.
    blockIntake: z.boolean().default(DEFAULT_BLOCK_INTAKE)
        .description('On by default: the block intake (its six tools and its supervisor) is registered on a default load; off registers none of them. 默认开启：接单台的六个工具与监工随默认加载注册；关掉才一个都不注册'),
    // Forced team routing (`src/force-team.ts`): a message that asks for a team
    // (开团 / 组队 / 分工 / form a team / split the work / delegate) gets a fixed hard
    // instruction appended to what the model reads. That is the whole purchase — the
    // refusal half was deleted (D-169), so the switch buys the instruction alone. Plain,
    // not `volatile()`: off means the one `agent/pre-step` listener is never registered,
    // which a reload alone can honor — projecting it onto the settings page would promise
    // a live edit the registration cannot make.
    forceTeamRouting: z.boolean().default(DEFAULT_FORCE_TEAM_ROUTING)
        .description('On by default: a message that asks for a team gets one fixed instruction appended to the prompt it is sent with. Nothing enforces the split: a model that ignores it answers normally. Off registers nothing. 默认开启：命中团队关键词的消息会在提示词尾部追加一段硬指令；没有任何东西强制执行，模型无视它就照常作答；关掉则什么都不注册'),
    roles: z.object({
        planner: z.array(z.object({ provider: z.string().default(''), model: z.string(), maxInFlight: z.natural().min(HARD_LIMITS.routeInFlight.min).max(HARD_LIMITS.routeInFlight.max) })).default([]),
        worker: z.array(z.object({ provider: z.string().default(''), model: z.string(), maxInFlight: z.natural().min(HARD_LIMITS.routeInFlight.min).max(HARD_LIMITS.routeInFlight.max) })).default([]),
        verifier: z.array(z.object({ provider: z.string().default(''), model: z.string(), maxInFlight: z.natural().min(HARD_LIMITS.routeInFlight.min).max(HARD_LIMITS.routeInFlight.max) })).default([]),
        synthesizer: z.array(z.object({ provider: z.string().default(''), model: z.string(), maxInFlight: z.natural().min(HARD_LIMITS.routeInFlight.min).max(HARD_LIMITS.routeInFlight.max) })).default([]),
        supervisor: z.array(z.object({ provider: z.string().default(''), model: z.string(), maxInFlight: z.natural().min(HARD_LIMITS.routeInFlight.min).max(HARD_LIMITS.routeInFlight.max) })).default([]),
    }).default({ planner: [], worker: [], verifier: [], synthesizer: [], supervisor: [] }).volatile(),
    // Guardian model (Q8): the single route that judges a stalled child before the
    // script kills it. One route, not a chain — an adjudicator has no fallback
    // because its failure is itself a verdict (kill). An empty/blank model disables
    // adjudication: a timed-out call then fails straight to the task's bounded
    // retry, exactly as it did before the guardian existed. The route shape is the
    // same `{provider, model}` pair the role chains carry, so "选已有路由" is the
    // same picker, just without the chain machinery.
    guardianModel: z.object({
        provider: z.string().default(''),
        model: z.string().default(''),
    }).default({ provider: '', model: '' })
        .description('Single model that judges a stalled child (wait extends 5 min at most twice, never past the run deadline; empty disables adjudication). 判停的单个模型：子代理卡死先取证再判，判 wait 最多延长 5 分钟×2 且不越过运行死线；留空 = 不判停')
        .volatile(),
    // Final-answer policy (T4: `layered` default, markdown direct output). The
    // verified report is always the base; one constrained polish call runs when a
    // synthesizer chain is configured, and a deterministic natural-language
    // summary built in the script is the answer whenever the model path is
    // unavailable.
    synthesis: z.union([z.const('layered'), z.const('model')]).default('layered').volatile(),
    // Config version, so a future rename can be migrated instead of guessed.
    configVersion: z.natural().default(CONFIG_VERSION),
});
/**
 * The accepted key that a misspelt one most likely meant, if any.
 *
 * Deliberately crude (a four-character prefix shared either way): it only ever adds a
 * hint to an error that already names the offending key and the accepted list, so a
 * wrong guess cannot change what is refused.
 * @param key - the key the document carries.
 * @param accepted - the keys this level accepts.
 * @returns The closest accepted key, or `undefined` when nothing is close.
 */
function closestKey(key, accepted) {
    const lower = key.toLowerCase();
    return accepted.find(candidate => candidate.toLowerCase().startsWith(lower.slice(0, 4)))
        ?? accepted.find(candidate => lower.startsWith(candidate.toLowerCase().slice(0, 4)));
}
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
 *
 * A key in {@link REMOVED_CONFIG_KEYS} is not a failure (D-155): it is recorded for the
 * load path to announce and then ignored, because the person holding it did nothing
 * wrong except keep a line the plugin deleted, and refusing the row took the workflow
 * away from them. Everything else at every level still throws.
 * @param config - raw user configuration.
 * @throws If a key at any level is not part of the configuration surface, or if `roles`
 *   is present and is not an object.
 */
export function assertKnownKeys(config) {
    const known = new Set(CONFIG_KEYS);
    const removed = new Set(REMOVED_CONFIG_KEYS);
    for (const key of Object.keys(config)) {
        if (known.has(key))
            continue;
        if (removed.has(key)) {
            recordedRemovedKeys.add(key);
            continue;
        }
        const suggestion = closestKey(key, CONFIG_KEYS);
        throw new Error(`unknown configuration key "${key}"${suggestion === undefined ? '' : ` (did you mean "${suggestion}"?)`}; ` +
            `accepted keys: ${CONFIG_KEYS.join(', ')}`);
    }
    const roles = config.roles;
    if (roles !== undefined && (roles === null || typeof roles !== 'object' || Array.isArray(roles))) {
        throw new Error(`roles must be an object of role chains (${ROLE_KEYS.join(', ')}), got ${describeShape(roles)}; ` +
            'a value of the wrong shape reads as "every chain empty", which loads with no route configured');
    }
    assertKnownNestedKeys(roles);
    assertKnownGuardianKeys(config.guardianModel);
}
/**
 * Name a value's shape for an error message, without printing a whole document.
 *
 * Primitives are quoted (they are short, and the value is usually the typo), a long
 * string is cut at 40 characters, and containers report their kind and size only.
 * @param value - the value being refused.
 * @returns a short description such as `a string "worker:m1"`, `an array of 1` or `null`.
 */
function describeShape(value) {
    if (value === null)
        return 'null';
    if (Array.isArray(value))
        return `an array of ${value.length}`;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return `a ${typeof value}`;
    }
    const text = JSON.stringify(value) ?? String(value);
    return `a ${typeof value} ${text.length > 40 ? `${text.slice(0, 40)}…` : text}`;
}
/**
 * Reject an unknown role name or route field inside `roles`.
 *
 * A value that is not an object (or a chain that is not an array) is left to the
 * chain resolver, which already refuses it with its own message; this function only
 * answers "is this key part of the surface".
 * @param roles - the raw `roles` value.
 * @throws If a role name or a route field is unknown.
 */
function assertKnownNestedKeys(roles) {
    if (roles === null || typeof roles !== 'object' || Array.isArray(roles))
        return;
    for (const [role, chain] of Object.entries(roles)) {
        if (!ROLE_KEYS.includes(role)) {
            throw new Error(`unknown configuration key "roles.${role}"; ` +
                `accepted roles: ${ROLE_KEYS.join(', ')}`);
        }
        if (!Array.isArray(chain))
            continue;
        for (const [index, route] of chain.entries()) {
            if (route === null || typeof route !== 'object' || Array.isArray(route))
                continue;
            for (const key of Object.keys(route)) {
                if (ROUTE_KEYS.includes(key))
                    continue;
                const suggestion = closestKey(key, ROUTE_KEYS);
                throw new Error(`unknown configuration key "roles.${role}[${index}].${key}"` +
                    `${suggestion === undefined ? '' : ` (did you mean "${suggestion}"?)`}; ` +
                    `accepted route keys: ${ROUTE_KEYS.join(', ')}`);
            }
        }
    }
}
/**
 * Reject an unknown field inside the single `guardianModel` route.
 *
 * A misspelt field would otherwise be read past: `resolveConfig` only picks
 * `provider` and `model`, so anything else loads successfully and then never
 * takes effect — the silent-ignore failure this check exists to prevent.
 * @param guardian - the raw `guardianModel` value.
 * @throws If it is an object carrying a key outside `provider`/`model`.
 */
function assertKnownGuardianKeys(guardian) {
    if (guardian === undefined || guardian === null)
        return;
    if (typeof guardian !== 'object' || Array.isArray(guardian))
        return;
    for (const key of Object.keys(guardian)) {
        if (GUARDIAN_MODEL_KEYS.includes(key))
            continue;
        const suggestion = closestKey(key, GUARDIAN_MODEL_KEYS);
        throw new Error(`unknown configuration key "guardianModel.${key}"` +
            `${suggestion === undefined ? '' : ` (did you mean "${suggestion}"?)`}; ` +
            `accepted guardianModel keys: ${GUARDIAN_MODEL_KEYS.join(', ')}`);
    }
}
/**
 * Accept a bare model id where a route object is expected.
 *
 * Written as a migration aid: `worker: ['fast', 'slow']` reads naturally, and
 * normalizing it here keeps one shape downstream instead of teaching every
 * consumer two spellings.
 * @param entry - route object, or a bare model id string.
 * @param path - configuration path used in the error message.
 * @returns A route object.
 */
function normalizeRoute(entry, path) {
    if (typeof entry === 'string') {
        const model = entry.trim();
        if (model === '')
            throw new Error(`${path} must name a model, not an empty string`);
        return { model };
    }
    if (entry === null || typeof entry !== 'object')
        throw new Error(`${path} must be a route object or a model id string`);
    return entry;
}
function resolveChain(role, chain) {
    if (chain === undefined)
        return [];
    if (!Array.isArray(chain))
        throw new Error(`roles.${role} must be an array of routes`);
    // An empty chain means "inherit the run's route". The schema default fills every
    // role with `[]`, so emptiness cannot be told apart from "not configured"; the
    // effective chains are surfaced in the report instead of failing the load.
    if (chain.length === 0)
        return [];
    if (chain.length > HARD_LIMITS.chainLength) {
        throw new Error(`roles.${role} has ${chain.length} routes; the maximum chain length is ${HARD_LIMITS.chainLength}`);
    }
    const seen = new Set();
    const out = [];
    for (const [index, raw] of chain.entries()) {
        const entry = normalizeRoute(raw, `roles.${role}[${index}]`);
        // A non-string model/provider used to fall through to `?.trim()`, which throws
        // a bare `TypeError` naming neither the key nor the shape (round 38). Refuse
        // with the full path instead, like every other shape refusal in this reader.
        const modelRaw = entry.model;
        if (modelRaw !== undefined && typeof modelRaw !== 'string') {
            throw new Error(`roles.${role}[${index}].model must be a model id string, got ${typeof modelRaw}`);
        }
        const model = modelRaw?.trim() ?? '';
        if (model === '')
            throw new Error(`roles.${role}[${index}].model must be a non-empty model id`);
        if (model.length > HARD_LIMITS.routeChars) {
            throw new Error(`roles.${role}[${index}].model is longer than ${HARD_LIMITS.routeChars} characters`);
        }
        const providerRaw = entry.provider;
        if (providerRaw !== undefined && typeof providerRaw !== 'string') {
            throw new Error(`roles.${role}[${index}].provider must be a provider id string, got ${typeof providerRaw}`);
        }
        const provider = providerRaw?.trim() ?? '';
        if (provider.length > HARD_LIMITS.routeChars) {
            throw new Error(`roles.${role}[${index}].provider is longer than ${HARD_LIMITS.routeChars} characters`);
        }
        // Per-route in-flight ceiling: absent means unlimited. A present value must
        // be an integer in range; anything else would silently mis-shape the lane.
        const maxInFlightRaw = entry.maxInFlight;
        let maxInFlight;
        if (maxInFlightRaw !== undefined) {
            if (!Number.isInteger(maxInFlightRaw) || maxInFlightRaw < HARD_LIMITS.routeInFlight.min || maxInFlightRaw > HARD_LIMITS.routeInFlight.max) {
                throw new Error(`roles.${role}[${index}].maxInFlight must be an integer between ${HARD_LIMITS.routeInFlight.min} and ${HARD_LIMITS.routeInFlight.max}`);
            }
            maxInFlight = maxInFlightRaw;
        }
        const key = `${provider}/${model}`;
        if (seen.has(key))
            throw new Error(`roles.${role} repeats the same route twice: ${key}`);
        seen.add(key);
        const route = provider === '' ? { model } : { provider, model };
        if (maxInFlight !== undefined)
            route.maxInFlight = maxInFlight;
        out.push(route);
    }
    return out;
}
function integer(name, value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
}
/**
 * Validate the user-configurable run deadline (R-06, fail closed).
 *
 * Accepts 0 (unlimited — no timer is ever armed) through MAX_SAFE_INTEGER;
 * rejects negatives, fractions, NaN and non-numbers with their own reason.
 * There is no clamp: an invalid value fails the load instead of being
 * silently rewritten.
 */
function timeoutInteger(name, value) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
        throw new Error(`${name} must be a non-negative integer between 0 and ${Number.MAX_SAFE_INTEGER} (0 = unlimited)`);
    }
    return value;
}
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
export function repairSynthesisInconsistency(raw) {
    const synthesis = raw.synthesis;
    const chain = raw.roles?.synthesizer;
    const length = Array.isArray(chain) ? chain.length : 0;
    // Pre-T4 patches may still carry `deterministic` (removed value, R-06): when a
    // synthesizer chain is present the intent was "polished output", which is now
    // `layered`; without a chain it was machine output. `layered` without a chain
    // answers from the deterministic narrative, so it is the safe repair in both.
    if (synthesis === 'deterministic') {
        return {
            repaired: { ...raw, synthesis: 'layered' },
            warnings: [
                'synthesis "deterministic" was removed: synthesis now takes effect as "layered" (repaired). 已按 layered 生效，请在设置页确认',
            ],
        };
    }
    if (length === 0 && synthesis === 'model') {
        return {
            repaired: { ...raw, synthesis: 'layered' },
            warnings: [
                'synthesis is "model" but the roles.synthesizer chain is empty: synthesis now takes effect as "layered" (repaired). 已按 layered 生效，请在设置页确认',
            ],
        };
    }
    void length;
    return { repaired: raw, warnings: [] };
}
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
export function repairLimitOverruns(raw) {
    const out = { ...raw };
    const warnings = [];
    // The live caps, read off the same table the schema clamp reads: a key added
    // to `LIMIT_CAPS` is repaired here the moment it exists (B02).
    for (const field of Object.keys(LIMIT_CAPS)) {
        const cap = LIMIT_CAPS[field];
        const stored = raw[field];
        // A non-number and `NaN` are left alone: `NaN > cap` is false, and neither is a
        // "the cap moved" case — `resolveConfig` rejects both with their own reason.
        if (typeof stored !== 'number' || !(stored > cap))
            continue;
        out[field] = cap;
        recordOverrun(field, stored);
        warnings.push(limitOverrunWarning({ field, stored, cap }));
    }
    return { repaired: warnings.length === 0 ? raw : out, warnings };
}
/** Resolve defaults and enforce the hard limits for direct construction paths. */
export function resolveConfig(config = {}) {
    assertKnownKeys(config);
    const configVersion = integer('configVersion', config.configVersion ?? CONFIG_VERSION, 1, CONFIG_VERSION);
    const toolName = config.toolName ?? 'grok_workflow';
    if (!TOOL_NAME.test(toolName)) {
        throw new Error(`toolName must match ${TOOL_NAME.source}`);
    }
    const roles = {
        planner: resolveChain('planner', config.roles?.planner),
        worker: resolveChain('worker', config.roles?.worker),
        verifier: resolveChain('verifier', config.roles?.verifier),
        synthesizer: resolveChain('synthesizer', config.roles?.synthesizer),
        supervisor: resolveChain('supervisor', config.roles?.supervisor),
    };
    // Fixed retry count (T4): the budget backstop below is checked against
    // FIXED_MAX_RETRIES, not a user value. The per-attempt count is the honest
    // worst case, because a route inside one attempt is not walked once: a worker
    // is called at most twice (first call, form resubmit) and a judge leg at most
    // three times (first call, transport re-fire, form resubmit), so the worst
    // legal combination of 50 worker + 50 verifier + 50 supervisor routes costs
    // 2 * 50 + 3 * (50 + 50) = 400 child calls per attempt, and two attempts cost
    // 800 per task (`test/routing.spec.ts`). The backstop at 1000 therefore keeps
    // every legal combination loading with headroom; only a chain widened without
    // revisiting the worst case can trip the guard.
    const maxRetries = FIXED_MAX_RETRIES;
    const callsPerAttempt = 2 * Math.max(1, roles.worker.length) + 3 * Math.max(1, roles.verifier.length) + 3 * roles.supervisor.length;
    const attemptsPerTask = maxRetries + 1;
    if (callsPerAttempt * attemptsPerTask > HARD_LIMITS.maxAttemptsPerTask) {
        throw new Error(`roles.worker + roles.verifier + roles.supervisor need ${callsPerAttempt} child calls per attempt; with maxRetries ${maxRetries} ` +
            `that is ${callsPerAttempt * attemptsPerTask} calls per task, over the ${HARD_LIMITS.maxAttemptsPerTask}-call ` +
            'backstop per task. Shorten the chains.');
    }
    // Guardian model (Q8): one route, normalized like a chain route but with its
    // own failure wording (the key is `guardianModel`, not `roles.<role>`). An
    // absent key, a null, or a route with a blank model all read as "no guardian",
    // so an untouched settings page stays byte-identical to the pre-guardian one.
    // Round 53: fail closed like the roles chain — a non-string field is refused
    // with its shape named, both fields are trimmed, and a model that trims to
    // empty means "unconfigured" (a provider with no model is not half a route).
    const guardianRaw = config.guardianModel;
    let guardianModel;
    if (guardianRaw !== undefined && guardianRaw !== null) {
        if (typeof guardianRaw !== 'object' || Array.isArray(guardianRaw)) {
            throw new Error(`guardianModel must be a single route object {provider?, model}, got ${describeShape(guardianRaw)}`);
        }
        const route = guardianRaw;
        if (route.provider !== undefined && route.provider !== null && typeof route.provider !== 'string') {
            throw new Error(`guardianModel.provider must be a provider id string, got ${typeof route.provider}`);
        }
        if (route.model !== undefined && route.model !== null && typeof route.model !== 'string') {
            throw new Error(`guardianModel.model must be a model id string, got ${typeof route.model}`);
        }
        const provider = (route.provider ?? '').trim();
        const model = (route.model ?? '').trim();
        if (provider.length > HARD_LIMITS.routeChars || model.length > HARD_LIMITS.routeChars) {
            throw new Error(`guardianModel route fields are limited to ${HARD_LIMITS.routeChars} characters`);
        }
        if (model !== '') {
            guardianModel = provider === '' ? { model } : { provider, model };
        }
    }
    // Round 26: `grokDefault` was the one enum this reader never checked. The `Config`
    // schema refuses a bad value, but `resolveConfig` is also reached directly (a
    // hand-built config object, an embedder, a test double), and there a typo used to
    // survive as itself: `grokDefault: 'onn'` loaded, printed `grokDefault=onn` in the
    // one-line signature and then behaved as off wherever the toggle is read (`=== 'on'`),
    // which is the silent-off failure this reader exists to prevent. Fail closed, like
    // every other switch.
    const grokDefaultRaw = config.grokDefault;
    if (grokDefaultRaw !== undefined && grokDefaultRaw !== 'on' && grokDefaultRaw !== 'off') {
        throw new Error(`grokDefault must be "on" or "off", got "${String(grokDefaultRaw)}"`);
    }
    const grokDefault = grokDefaultRaw === undefined ? 'off' : grokDefaultRaw;
    // The final-answer policy (T4: `layered` default, markdown direct output). A
    // removed `deterministic` value in an old patch is an unknown value now (R-06).
    const synthesisRaw = config.synthesis;
    if (synthesisRaw !== undefined && synthesisRaw !== 'model' && synthesisRaw !== 'layered') {
        throw new Error(`synthesis must be "model" or "layered", got "${String(synthesisRaw)}"`);
    }
    // A layered run is legal with or without a synthesizer chain: without one it
    // answers from the deterministic narrative alone and spends no child call.
    const synthesis = (synthesisRaw === undefined ? 'layered' : synthesisRaw);
    if (synthesis === 'model' && roles.synthesizer.length === 0) {
        throw new Error('synthesis "model" requires a non-empty roles.synthesizer chain');
    }
    // Repeat-run surface (R-06): the switch is a real boolean, and the three numbers
    // are whole numbers in range. The two capped numbers are clamped by the schema and
    // the load-time repair before this function sees them, but a direct caller still
    // gets a refusal here — the cap is a quota, not a preference.
    const loopEnabledRaw = config.loopEnabled;
    const loopEnabled = loopEnabledRaw === undefined ? DEFAULT_LOOP_ENABLED : loopEnabledRaw;
    if (typeof loopEnabled !== 'boolean') {
        throw new Error(`loopEnabled must be true or false, got "${String(loopEnabledRaw)}"`);
    }
    // Block intake (接单台子): a real boolean, checked here for the same reason
    // `loopEnabled` is — `resolveConfig` is also reached from a hand-built config,
    // and a typo such as `blockIntake: 'onn'` used to survive as itself and then read
    // as "off" at the one place that decides whether the tools exist. Fail closed.
    const blockIntakeRaw = config.blockIntake;
    const blockIntake = blockIntakeRaw === undefined ? DEFAULT_BLOCK_INTAKE : blockIntakeRaw;
    if (typeof blockIntake !== 'boolean') {
        throw new Error(`blockIntake must be true or false, got "${String(blockIntakeRaw)}"`);
    }
    // Forced team routing: a real boolean, checked here for the same reason
    // `blockIntake` is — `resolveConfig` is also reached from a hand-built config, and
    // a typo such as `forceTeamRouting: 'onn'` must fail the load instead of reading as
    // "off" at the one place that decides whether the listener exists. Fail closed.
    const forceTeamRoutingRaw = config.forceTeamRouting;
    const forceTeamRouting = forceTeamRoutingRaw === undefined ? DEFAULT_FORCE_TEAM_ROUTING : forceTeamRoutingRaw;
    if (typeof forceTeamRouting !== 'boolean') {
        throw new Error(`forceTeamRouting must be true or false, got "${String(forceTeamRoutingRaw)}"`);
    }
    // Mid-run replan switch (R-06): a boolean, unset meaning `DEFAULT_REPLAN` (on).
    // The run reads it when it opens the live steering channel, so a value that is not
    // a boolean is a hard refresh, not a silent default.
    const replanRaw = config.replan;
    const replan = replanRaw === undefined ? DEFAULT_REPLAN : replanRaw;
    if (typeof replan !== 'boolean') {
        throw new Error(`replan must be true or false, got "${String(replanRaw)}"`);
    }
    const switchOnRateLimitRaw = config.switchOnRateLimit;
    const switchOnRateLimit = switchOnRateLimitRaw === undefined ? DEFAULT_SWITCH_ON_RATE_LIMIT : switchOnRateLimitRaw;
    if (typeof switchOnRateLimit !== 'boolean') {
        throw new Error(`switchOnRateLimit must be true or false, got "${String(switchOnRateLimitRaw)}"`);
    }
    const iterateTemplateRaw = config.iterateTemplate;
    const iterateTemplateInput = iterateTemplateRaw === undefined ? DEFAULT_ITERATE_TEMPLATE : iterateTemplateRaw;
    if (typeof iterateTemplateInput !== 'string') {
        throw new Error(`iterateTemplate must be a string, got "${typeof iterateTemplateInput}"`);
    }
    if (iterateTemplateInput.length > MAX_LOOP_PROMPT_CHARS) {
        throw new Error(`iterateTemplate must be at most ${MAX_LOOP_PROMPT_CHARS} characters`);
    }
    const iterateTemplate = iterateTemplateInput;
    return {
        toolName,
        roles,
        // Omitted entirely when no guardian is configured (exactOptionalPropertyTypes):
        // an unconfigured run's resolved shape stays byte-identical to the pre-guardian one.
        ...guardianModel === undefined ? {} : { guardianModel },
        synthesis,
        grokDefault,
        maxConcurrency: integer('maxConcurrency', config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY, 1, HARD_LIMITS.maxConcurrency),
        maxRetries,
        maxTasks: integer('maxTasks', config.maxTasks ?? DEFAULT_MAX_TASKS, 1, HARD_LIMITS.maxTasks),
        timeoutMs: timeoutInteger('timeoutMs', config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        childTimeoutMs: integer('childTimeoutMs', config.childTimeoutMs ?? DEFAULT_CHILD_TIMEOUT_MS, HARD_LIMITS.childTimeoutMs.min, HARD_LIMITS.childTimeoutMs.max),
        replan,
        switchOnRateLimit,
        loopEnabled,
        loopMaxRounds: integer('loopMaxRounds', config.loopMaxRounds ?? DEFAULT_LOOP_MAX_ROUNDS, 1, HARD_LIMITS.loopMaxRounds),
        loopFailStreak: integer('loopFailStreak', config.loopFailStreak ?? DEFAULT_LOOP_FAIL_STREAK, 1, HARD_LIMITS.loopFailStreak),
        loopIntervalMin: integer('loopIntervalMin', config.loopIntervalMin ?? DEFAULT_LOOP_INTERVAL_MIN, 0, HARD_LIMITS.loopIntervalMin),
        iterateIntervalMin: integer('iterateIntervalMin', config.iterateIntervalMin ?? DEFAULT_ITERATE_INTERVAL_MIN, 0, HARD_LIMITS.iterateIntervalMin),
        iterateTemplate,
        blockIntake,
        forceTeamRouting,
        configVersion,
    };
}
/** True for a value the runtime wrapped because the field is volatile. */
function isHolder(value) {
    return value !== null
        && typeof value === 'object'
        && typeof value.get === 'function';
}
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
export function snapshotConfig(raw) {
    if (raw === undefined || raw === null)
        return {};
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
        if (value === undefined)
            continue;
        if (isHolder(value)) {
            let unwrapped;
            try {
                unwrapped = value.get();
            }
            catch {
                // A holder that cannot be read is a runtime fault, not user input; leaving
                // the field out lets validation apply its own default instead of crashing.
                continue;
            }
            if (unwrapped === undefined)
                continue;
            out[key] = unwrapped;
            continue;
        }
        out[key] = value;
    }
    return out;
}
/**
 * Build the reader used by the tool and the plugin's own surfaces.
 *
 * A settings edit invalidates nothing by itself: the next `read()` validates the
 * new values, so a broken edit refuses the next message with its exact reason
 * instead of half-applying, and a run that already started keeps the snapshot it
 * was given, which is what "live" has to mean for a run whose limits must not
 * move under it.
 * @param raw - live configuration object (holders included).
 * @returns A reader that validates on every `read()`.
 */
/** One-line summary of a resolved config, for the load-time and per-edit log line.
 *
 * t47: the t46 acceptance round could not answer "what did the runtime actually
 * read?" from any artefact — the deadline and the role chains only existed in
 * memory, so a settings save and a patch edit were indistinguishable from the
 * outside. This string is written to the log whenever the effective config
 * changes, and the deadline travels into the run's report as well.
 */
export function describeResolvedConfig(config) {
    const routeLabel = (route) => {
        const base = route.provider === '' ? route.model : `${route.provider}/${route.model}`;
        return route.maxInFlight === undefined ? base : `${base} (cap ${route.maxInFlight})`;
    };
    const role = (name) => {
        const chain = config.roles[name];
        return chain.length === 0 ? 'inherit' : chain.map(routeLabel).join('→');
    };
    return [
        `timeoutMs=${config.timeoutMs}`,
        `childTimeoutMs=${config.childTimeoutMs}`,
        `maxTasks=${config.maxTasks}`,
        `maxConcurrency=${config.maxConcurrency}`,
        `maxRetries=${FIXED_MAX_RETRIES}`,
        `maxActiveRuns=${FIXED_MAX_ACTIVE_RUNS}/${FIXED_MAX_ACTIVE_RUNS_TOTAL}`,
        `grokDefault=${config.grokDefault}`,
        `synthesis=${config.synthesis}${config.synthesisRepaired === true ? ' (repaired)' : ''}`,
        `blockIntake=${config.blockIntake === true ? 'on' : 'off'}`,
        `forceTeamRouting=${config.forceTeamRouting === true ? 'on' : 'off'}`,
        `roles=planner:${role('planner')} worker:${role('worker')} verifier:${role('verifier')} synthesizer:${role('synthesizer')} supervisor:${role('supervisor')}`,
    ].join(' ');
}
export function createConfigReader(raw) {
    return {
        read() {
            const next = resolveConfig(snapshotConfig(raw));
            return next;
        },
    };
}
//# sourceMappingURL=config.js.map