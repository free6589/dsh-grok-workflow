// Browser half of dsh-grok-workflow: the Settings → Plugins → "Grok workflow" page.
//
// Why this file exists at all (measured, t32): the Host serves this plugin's
// namespace (`settings/describe` → ns "grok-workflow", autoGenerate: true, 16 volatile
// top-level keys out of 18 accepted — `toolName` and `configVersion` are plain, so the
// runtime projection drops them) but the stock web client renders *no* page for a namespace on its own. Every
// feature ships a client bundle that registers a `plugins.item` tab and is kept alive by
// `configForms.whileServed([ns])`, so without one the plugin is invisible in the GUI
// (this was NR-7). The file is a browser module in the host's `__ModuleLoader__` format:
// plain ESM would load without registering and be rejected.
//
// Copy is single-locale and novice-oriented (v6, 2026-11-01). The language is *not*
// sniffed from `navigator`: every string resolves through the composition's own locale
// plugin (`@deepseek-ai/dsh-client-locale`), the same source that drives
// Settings → General → Language and `<html lang>`. Two mechanisms, both from that
// package: `ctx.locale.register(ns, { zh, en })` publishes this plugin's dictionary, and
// a slot registration carrying `locale: NS` receives the framework's `t` seat, which the
// renderer re-derives whenever the locale revision moves (so a language switch repaints
// the open page, the card title and the one-line summary without a reload). `t` is a
// hard product of that plugin, so it stays out of `inject`: the page must not fail to
// mount in a composition without a locale service. Only one language is ever rendered:
// every visible string goes through `t(key)`, and raw field keys are never shown
// (they survive only as `data-field` DOM attributes for tests).
window.__ModuleLoader__.load({
  id: 'dsh-grok-workflow',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useSyncExternalStore } = React

    const NS = 'grok-workflow'

    // T5 simplified surface (user mock settings-simple-mock.html): the page shows
    // only the switches the mock carries — total switch, auto/full mode, the five
    // role chains and the two advanced numbers. Everything else stays in the
    // profile patch / schema defaults and is left untouched by save.
    const READ_ONLY = []

    // The default self-iteration template. Kept as a literal because this bundle is
    // hand-written JavaScript with no host import; test/client.spec.ts pins it
    // byte-identical against DEFAULT_ITERATE_TEMPLATE in src/config.ts.
    const DEFAULT_ITERATE_TEMPLATE = [
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
    ].join('\n')

    const FIELDS = [
      // Total switch (mock “总开关”): `off` means normal chat until the session
      // turns grok mode on; the session toggle overrides this default.
      { key: 'grokDefault', group: 'mode', kind: 'enum', options: ['off', 'on'], def: 'off' },
      // The two advanced numbers (mock “高级”): documented engine-hook limits.
      // Bounds mirror HARD_LIMITS.maxConcurrency / maxTasks (100) and
      // DEFAULT_MAX_CONCURRENCY / DEFAULT_MAX_TASKS (10); test/client.spec.ts
      // pins both against `src/config.ts`.
      { key: 'maxConcurrency', group: 'limits', kind: 'number', min: 1, max: 100, def: 10 },
      { key: 'maxTasks', group: 'limits', kind: 'number', min: 1, max: 100, def: 10 },
      // Q8: the guardian model — a single route, not a chain. The def is the
      // empty route the schema defaults to; a blank model saves as "no
      // adjudication" and resolveConfig treats the key as unset, so an
      // untouched page changes nothing about how runs behave.
      { key: 'guardianModel', group: 'roles', kind: 'model', def: { provider: '', model: '' } },
      // Run deadline in milliseconds: 0 = unlimited (no timer is armed).
      // max is Number.MAX_SAFE_INTEGER (no practical cap); the number widget
      // below steps within [min, max] and the schema rejects out-of-range input.
      { key: 'timeoutMs', group: 'limits', kind: 'number', min: 0, max: Number.MAX_SAFE_INTEGER, def: 0 },
      // Per child-call stall budget (minutes on the page, ms stored): the script races
      // every agent() against it and settles a loser as a timeout of that attempt.
      // Default 120 min, ceiling 120 min; floor 1 s keeps the timer a signal.
      { key: 'childTimeoutMs', group: 'limits', kind: 'number', min: 1000, max: 7200000, def: 7200000 },
      // Mid-run replan (L2): a message sent while a run is working is answered at
      // once and folded into the live plan at the next wave boundary. On by default
      // (manual item Sec.2-2: the main session must always be able to talk); the
      // cost is one planner-route call per boundary, at most min(waves, 4) per run,
      // and only when a message arrives mid-run. Same boolean-switch shape as
      // `loopEnabled`.
      { key: 'replan', group: 'loop', kind: 'boolean', def: true },
      // Rate-limit switching (Sec.3-2): the one failure class the operator named,
      // as a checkbox. On = the built-in policy (a 429 advances the chain); off =
      // the six other classes still advance and the 429 keeps its route.
      { key: 'switchOnRateLimit', group: 'roles', kind: 'boolean', def: true },
      // Repeat runs (the loop keys): one full run per round, so the round cap and
      // the fail streak are the quota envelope. Bounds mirror HARD_LIMITS
      // (loopMaxRounds 100, loopFailStreak 20, loopIntervalMin 10080 = seven days)
      // and the defaults 10 / 3 / 0; 0 minutes asks for the loop's floor, not
      // "start immediately". test/client.spec.ts pins all three against `src/config.ts`.
      { key: 'loopEnabled', group: 'loop', kind: 'boolean', def: false },
      { key: 'loopMaxRounds', group: 'loop', kind: 'number', min: 1, max: 100, def: 10 },
      { key: 'loopFailStreak', group: 'loop', kind: 'number', min: 1, max: 20, def: 3 },
      { key: 'loopIntervalMin', group: 'loop', kind: 'number', min: 0, max: 10080, def: 0 },
      // Self-iteration heartbeat: the interval mirrors the loop's, and the template
      // is the whole prompt stored in the `RSI heartbeat` Schedule task. The bound
      // mirrors MAX_LOOP_PROMPT_CHARS in src/loop.ts (4000); the default is pinned
      // against DEFAULT_ITERATE_TEMPLATE in src/config.ts by test/client.spec.ts.
      // A whitespace-only template is legal and falls back to the built-in default
      // when the switch arms a heartbeat.
      { key: 'iterateIntervalMin', group: 'iterate', kind: 'number', min: 0, max: 10080, def: 0 },
      { key: 'iterateTemplate', group: 'iterate', kind: 'textarea', max: 4000, def: DEFAULT_ITERATE_TEMPLATE },
    ]

    // T5: the switchable-class picker is gone with `switchOn` (fixed internal
    // policy since T4); chains still switch on the built-in policy.
    // T5: five visible role chains (mock “执行模型”: 拆活/干活/检查/收尾/复核).
    // Every other role surface is unchanged: CHAIN_LIMIT / ROUTE_FIELD_LIMIT /
    // per-route cap bounds still mirror src/config.ts and are pinned by tests.
    const ROLES = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer']

    const CHAIN_LIMIT = 50
    const ROUTE_FIELD_LIMIT = 120

    /**
     * The keys this build no longer accepts, so the page can name a leftover one (D-155).
     *
     * A duplicate of `REMOVED_CONFIG_KEYS` in `src/config.ts` because this file is a
     * browser bundle: it cannot import the Host's TypeScript, and the JSON payload the
     * host sends carries no such list. `test/client.spec.ts` pins the two lists equal
     * item by item in both directions, so a key removed on one side cannot go unnamed on
     * the other. The behaviour they describe is "ignore and say so": the load log warns
     * once per leftover key and the page repeats it under the form.
     */
    const REMOVED_KEYS = [
      'enforceGate', 'gateRequired', 'gateScope', 'gatePreset', 'answerStrategy',
      'triageAsk', 'triageModel', 'triageClassifier', 'triageFollowupAsFast',
      'instantReceipt', 'humanSummary', 'showDiagnostics', 'historyTurns', 'historyChars',
      'maxQueuedMessages', 'maxRetries', 'maxActiveRuns', 'maxActiveRunsTotal',
      'subagentProvider', 'switchOn', 'recordRuns', 'recordLimit', 'showProgress',
      'mode', 'legacyGate',
    ]
    // Per-route in-flight ceiling: blank means unlimited. Mirrors
    // HARD_LIMITS.routeInFlight in src/config.ts; test/client.spec.ts pins the parity.
    const ROUTE_INFLIGHT_MIN = 1
    const ROUTE_INFLIGHT_MAX = 64

    const GROUPS = ['mode', 'roles', 'limits', 'loop', 'iterate']

    /**
     * Upgrade card facts, pinned by `test/update-entry.spec.ts`.
     *
     * The card on the settings page shows the installed plugin version and the
     * newest known release side by side; the upgrade itself reuses the existing
     * plugin-install channel (`dsh plugin add`), never a second installer.
     * `PLUGIN_VERSION` is the shipped version (release task bumps it with
     * package.json); `UPDATE_LATEST` is the newest published release, refreshed
     * by a later round and intentionally static here so the page never phones
     * home on its own. Both must stay plain `X.Y.Z` strings (see `isVersion`).
     */
    const PLUGIN_VERSION = '0.13.62'
    const UPDATE_LATEST = '0.13.62'
    const UPDATE_COMMAND = 'dsh plugin --profile <profile> add github:free6589/dsh-grok-workflow#v' + UPDATE_LATEST
    /**
     * Whether the shipped version is the newest known release.
     *
     * The card used to print two numbers and leave the comparison to the reader —
     * which is the "有什么升级的按钮" complaint in a quieter form (manual item
     * Sec.2-4). The verdict is derived here, next to the two constants it compares,
     * so the page and the tests cannot disagree about it.
     */
    const UPDATE_UP_TO_DATE = PLUGIN_VERSION === UPDATE_LATEST

