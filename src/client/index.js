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
    const PLUGIN_VERSION = '0.13.59'
    const UPDATE_LATEST = '0.13.59'
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

    // ---------------------------------------------------------------------------
    // Dictionaries. Keys are the contract between this table and every render site;
    // test/client.spec.ts fails the suite when the two locales disagree about a key.
    // Both locales are mandatory: `ctx.locale.register` requires the shipped pair, and
    // the locale plugin's own fallback chain terminates at `en`.
    //
    // Single-locale rule (v6): every visible string comes from exactly one `t(key)`
    // call in the active language. No key is ever rendered raw, no Chinese/English
    // mixing, no parenthesised bilingual text. Every key exists in both dicts with
    // actually different prose (pinned by test/client.spec.ts).
    // ---------------------------------------------------------------------------

    const EN = {
      'card.title': 'Grok workflow',
      // Left-column entry in the Host's own Settings panel (same page as the card).
      'section.label': 'Workflow',
      'card.summary': 'Defaults for the Grok workflow: what a session reports before /grok, five role chains, the limits, and whether it repeats.',

      'page.intro': 'How Grok works for you.',

      // Live one-line status under the intro, derived from the current draft. It
      // states a reporting default, not a routing decision: `grokDefault` is the
      // value a session with no `/grok` record reports, and only that session's
      // own record lets the intake accept a block (src/user-source.ts).
      'status.off': 'Off — what a session reports before /grok',
      'status.off.detail': 'A session that has not run /grok reports this, and the block intake takes no work there: the model cannot open a reviewed block. Messages themselves never become a workflow.',
      'status.on': 'On — what a session reports before /grok',
      'status.on.detail': 'A reported default, nothing more: opening a reviewed block still needs the session to run /grok on itself.',

      'group.mode': 'Session default',
      'group.limits': 'How much effort',
      'group.roles': 'Who does what',
      'group.loop': 'Repeat runs',
      'group.iterate': 'Self-iteration',

      // T5 visible-field labels only (no hints, no Danger, no read-only).
      'field.grokDefault': 'Default before /grok',
      'field.maxConcurrency': 'Jobs at once',
      'field.maxTasks': 'Splits per job',
      'field.timeoutMs': 'Run deadline (minutes)',
      'field.timeoutMs.hint': 'Default unlimited (0 = no timer is armed). 0 = no limit; set minutes for a deadline.',
      'field.childTimeoutMs': 'One call at most (minutes)',
      'field.childTimeoutMs.hint': 'Default 120 minutes. One agent() call runs this long before the run stops waiting on it; the Guardian stall budget follows this number too; the run deadline still caps the whole run.',
      // Q8: the guardian judge — a single model, first in the roles group.
      'field.guardianModel': 'Guardian (stall judge)',
      'field.guardianModel.hint': 'Judges a stalled child before it is killed: wait extends by 5 minutes at most twice, never past the run deadline. Empty = off, a timed-out call fails straight to retry.',
      'field.loopEnabled': 'Repeat by default',
      'field.replan': 'Join a running plan (mid-run)',
      'field.replan.hint': 'On by default. A message sent while a run is working is answered at once and joins that run at the next wave boundary; settled work is never redone. Turn it off to give every message its own round.',
      'field.switchOnRateLimit': 'Switch model on 429',
      'field.switchOnRateLimit.hint': 'On by default: a rate-limited (429) route advances to the next model in the chain. Off: only the other failure classes advance, and a 429 keeps the route for the task retry.',
      'field.loopMaxRounds': 'Rounds at most',
      'field.loopFailStreak': 'Stop after failed rounds',
      'field.loopIntervalMin': 'Minutes between rounds',
      'field.iterateIntervalMin': 'Minutes between rounds',
      'field.iterateTemplate': 'Heartbeat prompt template',
      'field.iterateTemplate.hint': 'Stored in the profile; the Self-iterate switch arms a heartbeat with this text. Empty falls back to the built-in default.',

      'option.grokDefault.off': 'Off',
      'option.grokDefault.on': 'On',
      'option.loopEnabled.off': 'Off',
      'option.loopEnabled.on': 'On',
      'option.replan.off': 'Off',
      'option.replan.on': 'On',

      'role.planner': '1 · Break it down',
      'role.worker': '2 · Do the work',
      'role.verifier': '3 · Check it',
      'role.supervisor': '4 · Review',
      'role.synthesizer': '5 · Wrap it up',

      'roles.count': '{count}/{limit} backups',
      'roles.add': '+ Add a backup',
      'roles.remove': 'Remove',
      'roles.capPlaceholder': 'Cap…',
      'roles.capLabel': 'per-run cap',
      // Empty chain = inherit: use the model you are talking to.
      'roles.empty': 'Empty = follows this chat, no backup set',
      'roles.providerPlaceholder': 'Pick a channel…',
      'roles.modelPlaceholder': 'Pick a model…',
      'roles.manualProvider': 'or type a channel…',
      'roles.manualModel': 'or type a model id…',
      'roles.noModels': 'This channel lists no models',
      'roles.noCatalog': 'No model list from the runtime — type it by hand.',

      'warn.emptyCap.title': 'All caps are blank: nothing will ever yield.',
      'warn.emptyCap.detail': 'This chain has 2+ routes but every cap is blank = unlimited = never yields; only a capped route yields when full inside one workflow run, and counts are never shared across runs. This is a heads-up, not a block: saving still works.',
      'warn.limit.title': 'A saved limit is over the hard maximum.',
      'warn.limit.detail': '{field} is saved as {live}, over the hard maximum {cap}. The plugin runs it clamped to {cap} and said so in its log, so the tool stays usable — save {cap} or lower here and this notice goes away.',
      'warn.removed.title': 'This patch still carries keys this build removed.',
      'warn.removed.detail': '{key} was removed in an earlier release, so any saved value for it is ignored — nothing else in this row changes and the plugin loads normally. The load log names it too. Delete that line from the profile patch when convenient, or leave it: it does nothing either way.',

      'action.save': 'Save',
      'action.saving': 'Saving…',
      'action.discard': 'Discard',
      'unit.jobs': 'jobs',
      'unit.tasks': 'tasks',
      'unit.ms': 'ms · 0 = unlimited',
      // Q9: the deadline is edited in minutes and stored in milliseconds.
      'unit.deadlineMinutes': 'min · 0 = no limit',
      'unit.childMinutes': 'min',
      'unit.rounds': 'rounds',
      'unit.failures': 'in a row',
      // 0 is not "start immediately": it asks for the loop's own floor (the larger of
      // 60 minutes and one worst-case round), so the unit has to say so on the page —
      // the README table says the same thing in the same words.
      'unit.minutes': "min · 0 = the loop's floor",
      // One retry of the mirror read: the only recovery a failed `describe()` has.
      'action.retry': 'Try again',

      'status.saved': 'Saved — takes effect on the next message.',
      'status.refused': 'Not saved: fix the highlighted rows, then save again.',
      'status.writeFailed': 'Not saved — tap save once more ({message})',
      'status.loading': 'Loading…',
      'status.loadError': 'Could not read the settings from the Host: {message}',
      'status.unavailable': 'The Host does not serve the grok-workflow settings namespace (is the plugin active?)',
      'status.revision': 'revision {revision}',

      // --- The "进度" conversation tab: one flowchart (flowchart contract §5) ---
      'view.progress': 'Progress',
      // The header: which of the five things the run is.
      'progress.chip.waiting': 'Waiting for you',
      'progress.chip.running': 'Running',
      'progress.chip.done': 'Done',
      'progress.chip.failed': 'Not passed',
      'progress.chip.cancelled': 'Cancelled',
      // The seven leg words, the two badges and the per-task attempt count.
      'progress.flow.start': 'Start',
      'progress.flow.plan': 'Plan',
      'progress.flow.execute': 'Execute',
      'progress.flow.check': 'Check',
      'progress.flow.review': 'Review',
      'progress.flow.summarize': 'Summarize',
      'progress.flow.end': 'End',
      // The acceptance is a place the run reaches, not a leg a call speaks as.
      // (The visit badge retired here: its badge left with the old edition and no code
      // reads it anymore, so keeping it would reserve a sentence the page no longer says.)
      'progress.flow.accept': 'Accept',
      'progress.flow.draft': 'Draft {n}',
      // How many times one task was tried in one leg (contract 追加 8.4).
      'progress.flow.attempt': 'Attempt {n}',
      // The six lights every task card carries, and the five the run is verified against.
      'progress.ring.plan': 'Plan',
      'progress.ring.execute': 'Execute',
      'progress.ring.check': 'Check',
      'progress.ring.review': 'Review',
      'progress.ring.accept': 'Accept',
      'progress.ring.summarize': 'Summarize',
      'progress.verify.machine': 'Remote machine',
      'progress.verify.model': 'Model review',
      'progress.verify.isolated': 'Isolated real machine',
      'progress.verify.human': 'Human review',
      'progress.verify.ledger': 'Ledger reconciliation',
      // The task panel: the one sentence under the title, the stuck line, the three duration
      // shapes, the two labels the graph itself carries (its reader name, and the name of the
      // control that opens a node's wires), and the sheet a narrow screen draws those calls in.
      'progress.panel.step': 'Step {at} of {total} ({total} levels)',
      'progress.panel.tasks': '{count} tasks in the figure',
      'progress.panel.eta': 'about {time} left',
      'progress.panel.etaBasis': 'from the {n} finished levels actually measured',
      'progress.panel.stuck.failed': 'Stuck at {at}: attempt {n} of {role} did not pass',
      'progress.panel.stuck.blocked': 'Stuck at {at}: this step never reported back',
      'progress.panel.stuck.rejected': 'Stuck at {at}: every draft was rejected ({n})',
      'progress.panel.durationSec': '{s}s',
      'progress.panel.durationMin': '{m}m {s}s',
      'progress.panel.durationHour': '{h}h {m}m',
      'progress.panel.trace': 'Trace its wires',
      'progress.panel.graph': 'Task graph of {run}',
      'progress.panel.list': 'Calls of {node}',
      // The standing legend once a node is opened: what a lit wire, a dimmed wire,
      // the six dots and the five dots each say.
      'progress.panel.legend.traced': 'Lit wire: visited',
      'progress.panel.legend.untraced': 'Dimmed wire: unvisited',
      'progress.panel.legend.rings': 'Six dots: six stages',
      'progress.panel.legend.checks': 'Five dots: five checks',
      'progress.panel.legend.pending': 'Dim means not run yet, not failed',
      // What the two rows of lights on a card are called, when a card names them at all.
      'progress.panel.rings': 'Six stages',
      'progress.panel.checks': 'Five checks',
      // The sheet a phone draws an opened list in: what it holds, and the one control that
      // puts it away.
      'progress.panel.calls': 'Calls',
      'progress.panel.collapse': 'Hide',
      // The state words a node speaks and never prints (`aria-label`).
      'progress.plan.waiting': 'Waiting',
      'progress.plan.running': 'Doing',
      'progress.plan.done': 'Passed',
      'progress.plan.failed': 'Not passed',
      'progress.plan.cancelled': 'Cancelled',
      // The one control a node carries: it opens that node's own calls, never a panel.
      'progress.task.detail': 'Detail',
      'progress.log.done': 'Did it',
      'progress.log.passed': 'Passed',
      'progress.log.reviewed': 'Approved',
      'progress.log.running': 'Checking',
      'progress.log.failed': 'Not passed',
      'progress.log.shipped': 'Shipped',
      'progress.log.cancelled': 'Cancelled',
      // The shipped draft's mark, and the one button the page offers (it fills the box).
      'progress.final.mark': '(final)',
      // The all-rejected summary says its three facts in the summary node's call list:
      // how many drafts went in, which gate the last one stopped at, and its words.
      'progress.final.rejected': 'Every draft was rejected: {n}',
      'progress.final.rejectedStage': 'Held at {stage}',
      'progress.final.rejectedReason': 'Last failure: {reason}',
      'progress.dock.start': 'Start',
      'progress.dock.fill': 'yes',
      'progress.dock.filled': 'Filled the box; press send',
      // What the redesign keeps: the row capsule, the per-task chain, the guardian lane.
      'progress.member.open': 'Open child session',
      'progress.chain.execute': 'Execute',
      'progress.chain.check': 'Verify',
      'progress.chain.review': 'Review',
      'progress.unphased': 'Unphased',
      'progress.empty.title': 'No workflow progress in this session yet',
      'progress.guardian.title': 'Guardian monitor',
      'progress.guardian.active': 'Monitoring',
      'progress.guardian.disarmed': 'Connected · timeout guard off',
      'progress.guardian.finished': 'Monitoring complete',
      'progress.guardian.cancelled': 'Guardian cancelled this run',
      'progress.guardian.budget': 'Child liveness budget · {seconds}s',
      'progress.guardian.empty': 'No intervention recorded',
      'progress.guardian.count': '{count} intervention(s)',
      'progress.guardian.rescue': 'Recovery guidance queued',
      'progress.guardian.observe': 'Observed · left running',
      'progress.guardian.cancel': 'Run cancellation requested',
      'status.progressMissing': 'The Progress tab is not mounted: this composition has no uiConversation service, so the track cannot appear.',
      'status.progressFailed': 'The Progress tab could not be registered: {message}. Everything else keeps working.',

      // --- The composer tool-row loop switch ---
      'loop.switch.label': 'Auto-continue',
      'loop.switch.aria': 'Auto-continue this session',
      'loop.switch.off': 'Off',
      'loop.switch.on': 'On · every {minutes} min · {rounds} rounds left',
      'loop.switch.onUnbounded': 'On · every {minutes} min',
      'loop.switch.reading': 'Checking…',
      'loop.switch.busy': 'Working…',
      'loop.switch.noSession': 'No session to loop',
      'loop.switch.userOnly': 'Only you can turn this on — the assistant cannot start a loop for you.',
      'loop.switch.unavailable': 'This Host has no scheduler, so a loop cannot start here.',
      'loop.switch.failed': 'The loop service did not answer: {message}',

      // --- The composer tool-row self-iteration switch (a second slot, its own route) ---
      'iterate.switch.label': 'Self-iterate',
      'iterate.switch.aria': 'Self-iterate this session',
      'iterate.switch.off': 'Off',
      'iterate.switch.on': 'On · every {minutes} min · {rounds} rounds left',
      'iterate.switch.onUnbounded': 'On · every {minutes} min',
      'iterate.switch.reading': 'Checking…',
      'iterate.switch.busy': 'Working…',
      'iterate.switch.noSession': 'No session to iterate',
      'iterate.switch.userOnly': 'Only you can turn this on — the assistant cannot start a self-iteration for you.',
      'iterate.switch.unavailable': 'This Host has no scheduler, so a self-iteration heartbeat cannot start here.',
      'iterate.switch.failed': 'The self-iteration service did not answer: {message}',

      // --- The composer tool-row workflow switch (the `/grok on|off` toggle, third slot) ---
      // Same record as the slash command (`plugin:grok-workflow/mode`), so the copy reports
      // what this session decided. A session with no record has decided nothing: the route
      // still folds the deployment `grokDefault` into its answer, but the block intake does
      // not, so the switch says "not set yet" instead of borrowing that default — the
      // effective value belongs to `/grok status` and the settings page (D-154).
      'mode.switch.label': 'Workflow switch',
      'mode.switch.aria': 'Turn the grok workflow on or off for this session',
      'mode.switch.off': 'Off',
      'mode.switch.on': 'On',
      'mode.switch.notOn': 'Not on · not set yet',
      'mode.switch.reading': 'Checking…',
      'mode.switch.busy': 'Working…',
      'mode.switch.noSession': 'No session to switch',
      'mode.switch.failed': 'The mode service did not answer: {message}',

      'error.number': '{key} must be a whole number between {min} and {max} — fix the number and save again.',
      'error.badEnum': '{key} has a value the current options do not offer — pick one of the offered options and save again.',
      'error.badBoolean': '{key} is either on or off — flip it and save again.',
      'error.badTemplate': '{key} is over the {limit}-character limit; shorten it and save again.',
      'error.chainTooLong': '{role} can keep at most {limit} backup routes — remove the extras.',
      'error.missingModel': '{role} entry {index} has no model — pick one or remove the row.',
      'error.tooLong': '{role} entry {index}: the channel/model text is over {limit} characters.',
      'error.duplicate': '{role} entry {index} repeats an earlier row — duplicates change nothing.',
      'error.badCap': '{role} entry {index}: the cap must be a whole number between {min} and {max}, or blank for unlimited.',
      'update.title': 'Plugin version',
      'update.body': 'Installed {current}, latest release {target}. Upgrade with: {command}',
      'update.copy': 'Copy command',
      'update.current': 'installed',
      'update.state.latest': 'You are on the latest release.',
      'update.state.newer': 'A newer release is available: {target}.',
      'update.terminal': 'This page cannot run system commands — paste the command above into a terminal to finish the upgrade.',
      // The button's own states. The seven lines above are the baseline the page can
      // always show; these are only reachable through an answer from the Host route.
      'update.check': 'Check for a newer release',
      'update.install': 'Install {target}',
      'update.installing': 'Installing…',
      'update.refresh': 'Refresh this page to activate the new build.',
      'update.unavailable': 'This Host cannot run the install for you — use the command above.',
      'update.failed': 'The upgrade did not go through: {message}',
    }

    const ZH = {
      'card.title': 'Grok workflow',
      'section.label': 'Workflow',
      'card.summary': 'Grok 工作流的默认值：会话还没打 /grok 时报什么、五条角色链、几个上限，还有要不要自动接着跑。',

      'page.intro': 'Grok 怎么帮你干活，在这里定。',

      // 状态行报的是一个默认值，不是一次路由决定：`grokDefault` 是还没打过
      // `/grok` 的会话报出来的值，真正让接单台接活的是那个会话自己的记录。
      'status.off': '关：没打过 /grok 的会话报这个',
      'status.off.detail': '没打过 /grok 的会话报的就是这个，接单台在那里不接活：模型开不出可复核的块。消息本身永远不会变成工作流。',
      'status.on': '开：没打过 /grok 的会话报这个',
      'status.on.detail': '只是报出来的默认值：要在这个会话里开可复核的块，还得这个会话自己打一句 /grok。',

      'group.mode': '会话默认',
      'group.limits': '下多大力气',
      'group.roles': '谁来干',
      'group.loop': '自动接着干',
      'group.iterate': '自迭代',

      // T5 visible-field labels only (no hints, no Danger, no read-only).
      'field.grokDefault': '没打 /grok 时的默认',
      'field.maxConcurrency': '同时干几件',
      'field.maxTasks': '一次拆几件',
      'field.timeoutMs': '运行死线（分钟）',
      'field.timeoutMs.hint': '默认不限时（0 = 不设 timer）。0 = 不限时；填分钟数即设死线。',
      'field.childTimeoutMs': '单次调用上限（分钟）',
      'field.childTimeoutMs.hint': '默认 120 分钟。一次 agent() 调用最多跑这么久，超时只重试该任务；守卫判停预算同样跟这个数；整轮仍受运行死线约束。',
      // Q8：守卫判停模型——单字段，位于角色链之前。
      'field.guardianModel': '守卫（判停模型）',
      'field.guardianModel.hint': '子代理卡死先取证再判：判 wait 最多延长 5 分钟×2，且不越过运行死线；留空 = 不判停，超时直接按失败重试。',
      'field.loopEnabled': '默认自动续跑',
      'field.replan': '跑中并入活计划',
      'field.replan.hint': '默认打开。跑中发来的消息立刻得到回执，并在下个波边界并入正在跑的计划；已验证的成果不会重做。关掉后，每条消息另起一轮。',
      'field.switchOnRateLimit': '限流（429）时换模型',
      'field.switchOnRateLimit.hint': '默认打开：限流（429）时换到链上的下一个模型。关掉后只有其它失败类别换人，429 留在原路由交给任务重试。',
      'field.loopMaxRounds': '最多跑几轮',
      'field.loopFailStreak': '连败几轮就停',
      'field.loopIntervalMin': '两轮之间隔几分钟',
      'field.iterateIntervalMin': '两轮之间隔几分钟',
      'field.iterateTemplate': '心跳提示词模板',
      'field.iterateTemplate.hint': '随档案保存；「自迭代」开关用心跳投递这段文字。留空则回退到内置默认模板。',

      'option.grokDefault.off': '关',
      'option.grokDefault.on': '开',
      'option.loopEnabled.off': '关',
      'option.loopEnabled.on': '开',
      'option.replan.off': '关',
      'option.replan.on': '开',

      'role.planner': '1 · 拆活',
      'role.worker': '2 · 干活',
      'role.verifier': '3 · 检查',
      'role.supervisor': '4 · 复核',
      'role.synthesizer': '5 · 收尾',

      'roles.count': '{count}/{limit} 条备用',
      'roles.add': '＋ 加备选',
      'roles.remove': '删',
      'roles.capPlaceholder': '上限…',
      'roles.capLabel': '单次上限',
      // 空链 = 继承：用跟你对话的模型，没加备选就是没配。
      'roles.empty': '空着 = 跟这次对话用同一个，没加备选',
      'roles.providerPlaceholder': '选哪家…',
      'roles.modelPlaceholder': '选用哪个…',
      'roles.manualProvider': '或手填通道…',
      'roles.manualModel': '或手填模型 id…',
      'roles.noModels': '这家没列出模型',
      'roles.noCatalog': '读不到运行时模型目录，手填即可。',
      'warn.emptyCap.title': '上限全空：永远不会让路。',
      'warn.emptyCap.detail': '这条链有 2 条以上路由但上限全空=不限=不让路；只有填了上限的路由才会在单次 run 内打满时让路，计数跨 run 不共享。只是提醒，不拦保存。',
      'warn.limit.title': '有个已保存的上限超过了硬上限。',
      'warn.limit.detail': '{field} 保存的是 {live}，超过硬上限 {cap}。插件按 {cap} 钳制运行并在日志里说明过，所以工具照常可用——在这里保存 {cap} 或更小，这条提示就会消失。',
      'warn.removed.title': '这份补丁里还留着本版本已经删掉的键。',
      'warn.removed.detail': '{key} 在更早的版本里就删掉了，为它存的值不生效——这一行其余配置照常载入，插件正常工作，载入日志里也会点名说一次。方便时把那一行从档案补丁里删掉即可；留着也行，它什么都不做。',

      'action.save': '保存',
      'action.saving': '正在保存…',
      'action.discard': '放弃修改',
      'unit.jobs': '件',
      'unit.tasks': '件',
      'unit.ms': '毫秒 · 0 = 不限时',
      'unit.deadlineMinutes': '分钟 · 0 = 不限时',
      'unit.childMinutes': '分钟',
      'unit.rounds': '轮',
      'unit.failures': '轮',
      // 0 不是「立刻开始」：它表示用循环自己的下限（60 分钟与一轮最坏耗时取大），
      // 页面上必须写出来；README 表格用的是同一句话。
      'unit.minutes': '分钟 · 0 = 用循环自己的下限',
      // Same key as `en`: re-reading is the only recovery a failed `describe()` has.
      'action.retry': '重试',

      'status.saved': '已保存，下一条消息生效。',
      'status.refused': '没存上：有标红的地方，改完再点保存。',
      'status.writeFailed': '没存上，再点一次保存（{message}）',
      'status.loading': '读取中…',
      'status.loadError': '读不到 Host 的设置：{message}',
      'status.unavailable': 'Host 未提供 grok-workflow 设置命名空间（插件未激活？）',
      'status.revision': 'revision {revision}',

      // --- 进度 Tab：一张流程图（施工契约 §5）---
      'view.progress': '进度',
      // 头部：这一轮是五种里的哪一种。
      'progress.chip.waiting': '等你点头',
      'progress.chip.running': '进行中',
      'progress.chip.done': '已完成',
      'progress.chip.failed': '未通过',
      'progress.chip.cancelled': '已取消',
      // 七个腿词、两个角标、一个任务在一条腿里试了几遍。
      'progress.flow.start': '起点',
      'progress.flow.plan': '规划',
      'progress.flow.execute': '执行',
      'progress.flow.check': '检查',
      'progress.flow.review': '复核',
      'progress.flow.summarize': '汇总',
      'progress.flow.end': '终点',
      // 验收是这一轮走到的一个地方，不是谁说出来的一条腿。
      // （访问号角标在此退场：它随旧版退场后已无代码读取，留着只会占一个页面不再说的句子。）
      'progress.flow.accept': '验收',
      'progress.flow.draft': '第 {n} 稿',
      // 一个任务在一条腿里试了几遍（契约追加 8.4）。
      'progress.flow.attempt': '第 {n} 遍',
      // 每个任务卡上的六盏灯，以及这一轮被拿来验的五盏。
      'progress.ring.plan': '规划',
      'progress.ring.execute': '执行',
      'progress.ring.check': '检查',
      'progress.ring.review': '复核',
      'progress.ring.accept': '验收',
      'progress.ring.summarize': '汇总',
      'progress.verify.machine': '机器远端',
      'progress.verify.model': '模型复核',
      'progress.verify.isolated': '真机隔离',
      'progress.verify.human': '人验',
      'progress.verify.ledger': '对账',
      // 任务面板：标题下那一句、卡住那一句、三种时长写法、图自己的读屏名与节点控件的名字，
      // 以及窄屏把调用摊开时那张抽屉的两个词。
      'progress.panel.step': '第 {at} 步，共 {total} 步（{total} 层流程）',
      'progress.panel.tasks': '图上 {count} 个任务',
      'progress.panel.eta': '还剩约 {time}',
      'progress.panel.etaBasis': '按 {n} 个已完成层的实测耗时推算',
      'progress.panel.stuck.failed': '卡在 {at}：{role} 第 {n} 遍没过',
      'progress.panel.stuck.blocked': '卡在 {at}：这一步没有回报',
      'progress.panel.stuck.rejected': '卡在 {at}：{n} 稿全被退回',
      'progress.panel.durationSec': '{s} 秒',
      'progress.panel.durationMin': '{m} 分 {s} 秒',
      'progress.panel.durationHour': '{h} 小时 {m} 分',
      'progress.panel.trace': '看线',
      'progress.panel.graph': '{run} 的任务图',
      'progress.panel.list': '{node} 的调用',
      // 点开节点后常驻的图例：亮线、暗线、六点、五点各说什么。
      'progress.panel.legend.traced': '亮线：走过的线',
      'progress.panel.legend.untraced': '暗线：没走的线',
      'progress.panel.legend.rings': '六点：六环，走完六个阶段',
      'progress.panel.legend.checks': '五点：五验，通过五道验收',
      'progress.panel.legend.pending': '暗点是还没跑到，不是没过',
      // 卡上两排灯各自叫什么（卡自己不点名，只有读屏与悬停用得上）。
      'progress.panel.rings': '六环',
      'progress.panel.checks': '五验',
      // 手机上摊开调用用的那张抽屉：里面是什么，以及收起来的那一个控件。
      'progress.panel.calls': '调用',
      'progress.panel.collapse': '收起',
      // 节点只说、不印的状态词（aria-label）。
      'progress.plan.waiting': '等着',
      'progress.plan.running': '在做',
      'progress.plan.done': '过了',
      'progress.plan.failed': '没过',
      'progress.plan.cancelled': '没做',
      // 节点唯一的那颗控件：展开它自己的调用，不是弹出面板。
      'progress.task.detail': '详情',
      'progress.log.done': '做完',
      'progress.log.passed': '过了',
      'progress.log.reviewed': '通过',
      'progress.log.running': '正在看',
      'progress.log.failed': '没过',
      'progress.log.shipped': '交卷',
      'progress.log.cancelled': '取消',
      // 定稿标记，以及页面上唯一那颗按钮（只填框，不代发）。
      'progress.final.mark': '（定稿）',
      // 全被退回时，汇总节点展开后的调用清单里说的三件事：退回了几稿、卡在哪道门、门的原话。
      'progress.final.rejected': '第 {n} 稿全被退回',
      'progress.final.rejectedStage': '卡在{stage}',
      'progress.final.rejectedReason': '最后不过：{reason}',
      'progress.dock.start': '开工',
      'progress.dock.fill': '确认',
      'progress.dock.filled': '已填进输入框，按发送',
      // 本轮保留的：行胶囊、任务内链、Guardian 侧栏。
      'progress.member.open': '打开子会话',
      'progress.chain.execute': '执行',
      'progress.chain.check': '检查',
      'progress.chain.review': '复核',
      'progress.unphased': '未分阶段',
      'progress.empty.title': '这次会话还没有工作流进度',
      'progress.guardian.title': 'Guardian 监控',
      'progress.guardian.active': '监控中',
      'progress.guardian.disarmed': '已接入 · 超时监控未启用',
      'progress.guardian.finished': '监控结束',
      'progress.guardian.cancelled': 'Guardian 已取消本轮',
      'progress.guardian.budget': '子任务存活判断预算 · {seconds} 秒',
      'progress.guardian.empty': '暂无处置记录',
      'progress.guardian.count': '{count} 条处置记录',
      'progress.guardian.rescue': '已排队发送恢复指引',
      'progress.guardian.observe': '已记录异常 · 继续运行',
      'progress.guardian.cancel': '已触发整轮取消',
      'status.progressMissing': '进度 Tab 未挂载：当前组合没有 uiConversation 服务，轨道不会出现。',
      'status.progressFailed': '进度 Tab 注册失败：{message}。其余功能不受影响。',

      // --- 输入框下方的自动续跑开关 ---
      'loop.switch.label': '自动接着跑',
      'loop.switch.aria': '这个会话自动接着跑',
      'loop.switch.off': '关',
      'loop.switch.on': '开 · 每 {minutes} 分钟 · 还剩 {rounds} 轮',
      'loop.switch.onUnbounded': '开 · 每 {minutes} 分钟',
      'loop.switch.reading': '读取中…',
      'loop.switch.busy': '处理中…',
      'loop.switch.noSession': '还没有会话可续跑',
      'loop.switch.userOnly': '只能你自己开：助手不能替你启动续跑。',
      'loop.switch.unavailable': '这台 Host 没有调度器，开不了续跑。',
      'loop.switch.failed': '续跑服务没有回应：{message}',

      // --- The composer tool-row self-iteration switch (a second slot, its own route) ---
      'iterate.switch.label': '自迭代',
      'iterate.switch.aria': '这个会话自动迭代',
      'iterate.switch.off': '关',
      'iterate.switch.on': '开 · 每 {minutes} 分钟 · 还剩 {rounds} 轮',
      'iterate.switch.onUnbounded': '开 · 每 {minutes} 分钟',
      'iterate.switch.reading': '查看中…',
      'iterate.switch.busy': '处理中…',
      'iterate.switch.noSession': '没有可迭代的会话',
      'iterate.switch.userOnly': '只有你自己能打开——助手不能替你开始自迭代。',
      'iterate.switch.unavailable': '这个宿主没有调度器，无法在这里开始自迭代心跳。',
      'iterate.switch.failed': '自迭代服务没有回应：{message}',

      // --- 对话框底部 workflow 总开关（第三格，与 `/grok on|off` 同一条记录） ---
      // 文案说这个会话自己定了什么。没有记录的会话什么都没定：路由仍会把部署默认
      // `grokDefault` 折进它的答复，但接单台不认那个默认，所以开关说「还没设过」，
      // 不借那个默认——有效值归 `/grok status` 和设置页报（D-154）。
      'mode.switch.label': '工作流开关',
      'mode.switch.aria': '为这个会话打开或关闭 grok 工作流',
      'mode.switch.off': '关',
      'mode.switch.on': '开',
      'mode.switch.notOn': '未开 · 还没设过',
      'mode.switch.reading': '读取中…',
      'mode.switch.busy': '处理中…',
      'mode.switch.noSession': '还没有可切换的会话',
      'mode.switch.failed': '模式服务没有回应：{message}',

      'error.number': '{key} 得是 {min} 到 {max} 之间的整数，改对数字再保存。',
      'error.badEnum': '{key} 有个现在选项里没有的值，选一个再保存。',
      'error.badBoolean': '{key} 只有开和关两种状态，切换一下再保存。',
      'error.badTemplate': '{key} 超过了 {limit} 字的上限，缩短后再保存。',
      'error.chainTooLong': '{role} 备用链最多 {limit} 条，删掉多余的。',
      'error.missingModel': '{role} 第 {index} 条没有模型，选一个或删掉这一行。',
      'error.tooLong': '{role} 第 {index} 条的通道/模型文字超过 {limit} 字。',
      'error.duplicate': '{role} 第 {index} 条跟前面的重复了，重复不顶用。',
      'error.badCap': '{role} 第 {index} 条的并发上限得是 {min} 到 {max} 之间的整数，留空就是不限。',
      'update.title': '插件版本',
      'update.body': '已装 {current}，最新发布 {target}。升级命令：{command}',
      'update.copy': '复制命令',
      'update.current': '已装版本',
      'update.state.latest': '已是最新版本。',
      'update.state.newer': '有新版本可装：{target}。',
      'update.terminal': '本页不能替你执行系统命令——把上面的命令贴到终端里跑一次，才算装好。',
      // 按钮自己的几种状态；上面七条是不问任何人也始终能显示的底稿，下面这些只由宿主路由的回答触达。
      'update.check': '检查有没有新版本',
      'update.install': '安装 {target}',
      'update.installing': '正在安装…',
      'update.refresh': '新版本要等这个页面刷新之后才生效。',
      'update.unavailable': '这个宿主装不了——用上面的命令装。',
      'update.failed': '升级没成：{message}',
    }

    /** Shipped locales, in the order the locale plugin registers them. */
    const LOCALES = ['zh', 'en']
    const DICT = { zh: ZH, en: EN }
    /** Terminal fallback of the locale plugin's chains; also this plugin's own. */
    const FALLBACK_LOCALE = 'en'

    /**
     * Resolve one key, mirroring `LocaleRuntime.translate` in `@deepseek-ai/dsh-client-locale`:
     * walk the requested locale then its `en` fallback, interpolate `{name}` params, and
     * return the key itself when no dictionary carries it.
     *
     * This exists for two callers that have no locale face: unit tests, and a composition
     * whose locale plugin is absent (where the page still has to render *something*).
     * @param locale - locale id such as `zh` or `en`.
     * @param key - dictionary key.
     * @param params - optional `{name}` substitutions.
     * @returns the translated string, or `key` when untranslated.
     */
    function translate(locale, key, params) {
      let template
      for (const id of [locale, FALLBACK_LOCALE]) {
        const dict = DICT[id]
        if (dict !== undefined && dict[key] !== undefined) {
          template = dict[key]
          break
        }
      }
      if (template === undefined) return key
      if (params === undefined) return template
      const safeParams = params !== null && typeof params === 'object' ? params : {}
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in safeParams ? String(safeParams[name]) : match))
    }

    /** Bind one locale id into a `t(key, params)` function (the shape of the `t` seat). */
    function translator(locale) {
      return (key, params) => translate(locale, key, params)
    }

    /**
     * What a key renders as when *neither* table carries it.
     *
     * A key id is a piece of code, not copy: `status.running` on screen tells a reader
     * nothing and looks like a broken page. The guard below therefore never returns the
     * key itself — it returns this neutral mark instead, which is visibly "no text here"
     * rather than a leaked identifier. In practice this arm is unreachable: every key the
     * page and the panel derive is present in both shipped dictionaries, and
     * `test/client.spec.ts` asserts that over the derived key set.
     */
    const UNRESOLVED_COPY = '—'

    /**
     * Wrap a framework-seated `t` so a key it cannot resolve never reaches the screen.
     *
     * The locale seat answers with the key itself when its dictionary is missing — which
     * happens when the namespace was never registered, or when the registration went away
     * with the fiber that made it (the `locale` scope, see `teardown`). This bundle's own
     * table is the backstop, so a bare key never becomes page copy and the worst case is
     * English instead of `field.maxConcurrency`.
     * @param seat - the `t` the framework seated, when the composition has a locale face.
     * @param own - this bundle's translator, bound to the active locale.
     * @returns a `t(key, params)` that always answers with copy.
     */
    function guardedTranslator(seat, own) {
      const seated = typeof seat === 'function' ? seat : undefined
      const mine = typeof own === 'function' ? own : undefined
      const usable = (text, key) => typeof text === 'string' && text.length > 0 && text !== key
      return (key, params) => {
        const fromSeat = seated === undefined ? undefined : seated(key, params)
        if (usable(fromSeat, key)) return fromSeat
        const fallback = mine === undefined ? undefined : mine(key, params)
        return usable(fallback, key) ? fallback : UNRESOLVED_COPY
      }
    }

    /**
     * The five semantic states this UI colours, each through a DSH design token.
     *
     * The token is what makes the colour follow the running theme (light/dark, a user
     * theme, a contrast pass) instead of being frozen at one hex value; the hex stays as
     * the token's fallback so a composition that ships no design tokens still renders.
     * The names are the reader-facing states, not the engine's: `doing` is a running call,
     * `done` a completed one, `blocked` a cancelled or interrupted one, and `pending` the
     * idle state — a member that has not started, and the state this panel shows when the
     * engine reports a status outside the five it words.
     */
    const STATUS_COLOR = {
      doing: 'var(--dsw-alias-state-business-primary, #2f6fed)',
      done: 'var(--dsw-alias-state-success-primary, #1a9d5a)',
      failed: 'var(--dsw-alias-state-error-primary, #d33b3b)',
      blocked: 'var(--dsw-alias-state-warn-primary, #b7791f)',
      pending: 'var(--dsw-alias-state-idle-primary, #9aa0a6)',
    }

    /**
     * The active locale id, defaulting to the English fallback.
     * @param locale - the locale service, when the composition has one.
     * @returns the id the page should render in.
     */
    function activeLocale(locale) {
      if (locale === undefined || locale === null || typeof locale.getSnapshot !== 'function') return FALLBACK_LOCALE
      const snapshot = locale.getSnapshot()
      return snapshot === undefined || snapshot.active === undefined ? FALLBACK_LOCALE : snapshot.active
    }

    const emptyRoles = () => ({ planner: [], worker: [], verifier: [], synthesizer: [], supervisor: [] })
    const clone = (value) => {
      // A stored document is JSON-shaped, but a hostile or corrupted mirror
      // value (BigInt, circular, function) would throw out of useState and
      // take the whole page down. Fall back to empty so the page stays up.
      try {
        return JSON.parse(JSON.stringify(value === undefined ? null : value))
      } catch {
        return value === undefined ? null : undefined
      }
    }
    const draftOf = (value) => {
      const out = { roles: emptyRoles() }
      for (const field of FIELDS) {
        const current = value === undefined ? undefined : value[field.key]
        out[field.key] = current === undefined ? clone(field.def) : clone(current)
      }
      if (value !== undefined && value.roles !== undefined && value.roles !== null && typeof value.roles === 'object' && !Array.isArray(value.roles)) out.roles = clone(value.roles)
      for (const role of ROLES) if (!Array.isArray(out.roles[role])) out.roles[role] = []
      return out
    }

    /**
     * Client-side checks the Host would otherwise only report as a refused write.
     *
     * Findings are locale-free data (`{ key, params }`) so the same draft is reported
     * identically in every language and tests assert on structure rather than prose;
     * `formatError` renders one finding through a `t`.
     * @param draft - the editable draft.
     * @returns findings in page order, empty when the draft is acceptable.
     */
    const validate = (draft) => {
      const errors = []
      for (const field of FIELDS) {
        if (field.kind === 'number') {
          const raw = draft[field.key]
          if (!Number.isSafeInteger(raw) || raw < field.min || raw > field.max) {
            errors.push({ key: 'error.number', params: { key: field.key, min: field.min, max: field.max } })
          }
        } else if (field.kind === 'boolean') {
          // A boolean row is a switch: anything else (a `'on'` string from an old
          // hand edit, a missing value) would be refused by the Host schema, so it
          // is refused here first with a row-level reason.
          if (typeof draft[field.key] !== 'boolean') {
            errors.push({ key: 'error.badBoolean', params: { key: field.key } })
          }
        } else if (field.kind === 'enum') {
          // A stored value outside the options (a legacy patch, a hand edit)
          // renders as its own first row so nothing is lost — but it must not
          // save: the Host schema rejects it and refuses the whole document.
          const known = field.options.map((option) => String(option))
          if (!known.includes(String(draft[field.key]))) {
            errors.push({ key: 'error.badEnum', params: { key: field.key } })
          }
        } else if (field.kind === 'textarea') {
          // The template is a free-text prompt, so only the length is checked
          // here (the same bound the Host's own open refuses at). A
          // whitespace-only template is legal: arming a heartbeat with one
          // falls back to the built-in default instead of storing an empty
          // prompt, so an unfinished edit can never break the switch.
          const raw = typeof draft[field.key] === 'string' ? draft[field.key] : ''
          if (raw.length > field.max) {
            errors.push({ key: 'error.badTemplate', params: { key: field.key, limit: field.max } })
          }
        } else if (field.kind === 'model') {
          // Q8: a single-route field. A blank model is the "off" value and is
          // legal (the Host reads it as unset); a filled one must stay inside
          // the same per-field bounds the chain routes obey.
          const route = draft[field.key]
          if (route !== undefined && route !== null && typeof route === 'object' && !Array.isArray(route)) {
            const model = String(route.model || '').trim()
            const provider = String(route.provider || '').trim()
            if (model.length > ROUTE_FIELD_LIMIT || provider.length > ROUTE_FIELD_LIMIT) {
              errors.push({ key: 'error.tooLong', params: { key: field.key, limit: ROUTE_FIELD_LIMIT } })
            }
          }
        }
      }
      // T5: the gate preset no longer exists (fixed internal behavior).
      const safeRoles = draft !== undefined && draft !== null && typeof draft.roles === 'object' && draft.roles !== null && !Array.isArray(draft.roles) ? draft.roles : {}
      for (const role of ROLES) {
        const chain = safeRoles[role] || []
        if (chain.length > CHAIN_LIMIT) errors.push({ key: 'error.chainTooLong', params: { role, limit: CHAIN_LIMIT } })
        const seen = new Set()
        chain.forEach((route, index) => {
          const model = String((route && route.model) || '').trim()
          const provider = String((route && route.provider) || '').trim()
          if (model === '') errors.push({ key: 'error.missingModel', params: { role, index: index + 1 } })
          if (model.length > ROUTE_FIELD_LIMIT || provider.length > ROUTE_FIELD_LIMIT) {
            errors.push({ key: 'error.tooLong', params: { role, index: index + 1, limit: ROUTE_FIELD_LIMIT } })
          }
          // Per-route in-flight ceiling: blank means unlimited. Anything typed
          // must be an integer in range, or the row cannot be saved.
          const capRaw = route === undefined || route === null ? undefined : route.maxInFlight
          if (capRaw !== undefined && capRaw !== null && String(capRaw).trim() !== '') {
            const cap = Number(capRaw)
            if (!Number.isSafeInteger(cap) || cap < ROUTE_INFLIGHT_MIN || cap > ROUTE_INFLIGHT_MAX) {
              errors.push({ key: 'error.badCap', params: { role, index: index + 1, min: ROUTE_INFLIGHT_MIN, max: ROUTE_INFLIGHT_MAX } })
            }
          }
          // Two blank routes are not duplicates: they are two unfinished rows.
          const key = `${provider}::${model}`
          if (model !== '' && seen.has(key)) errors.push({ key: 'error.duplicate', params: { role, index: index + 1 } })
          if (model !== '') seen.add(key)
        })
      }
      // T5: `switchOn` and `synthesis` are fixed internally since T4, so no
      // page-level cross-checks remain: only the two visible numbers, the two
      // enums, and the five chains are validated.
      return errors
    }

    /**
     * T5 removed: the long-chain-plus-retries heads-up died with `maxRetries`
     * (fixed at 1 since T4) and the Dangerous combo it warned about. The stub
     * stays (always false) so the removal site is explicit; the page no longer
     * calls it.
     * @param draft - the editable draft (unused).
     * @returns false, always.
     */
    function comboWarn(draft) {
      return false
    }

    /**
     * Heads-up (not a block) when a chain has 2+ finished routes but every cap
     * is blank: blank = unlimited = never yields, so no overflow can ever
     * happen on that chain. Only finished rows (non-blank model) count — two
     * blank unfinished rows are already `error.missingModel`, not this warning.
     * A capped route yields only when full inside one workflow run; counts are
     * never shared across runs. Rendered above the save button like `comboWarn`;
     * saving still works.
     * @param draft - the editable draft.
     * @returns true when the warning should show.
     */
    function emptyCapWarn(draft) {
      const safeRoles = draft !== undefined && draft !== null && typeof draft.roles === 'object' && draft.roles !== null && !Array.isArray(draft.roles) ? draft.roles : {}
      return ROLES.some((role) => {
        const finished = (safeRoles[role] || [])
          .filter((route) => String((route && route.model) || '').trim() !== '')
        if (finished.length < 2) return false
        return finished.every((route) => {
          const capRaw = route === undefined || route === null ? undefined : route.maxInFlight
          return capRaw === undefined || capRaw === null || String(capRaw).trim() === ''
        })
      })
    }

    /**
     * Heads-up (not a block) for a live document that already stores a number above
     * its hard maximum (B07, B02): `maxConcurrency` 8 or `maxRetries` 5 from a profile
     * patch written before v0.9.0 restored the 100 / 3 envelope, or any other limit in
     * the Host's clamp list.
     *
     * The Host repairs that at load — it clamps to the cap, warns once and activates
     * the row instead of refusing it — so the tool is usable but the stored number
     * still disagrees with what runs. This banner is the page half of that pair: it
     * names the stored value and the cap, and it reads the *stored* document rather
     * than the draft, because the draft is already what the reader is editing. Saving
     * a legal number re-publishes the document and the notice disappears on its own.
     *
     * It must read `entry.user`, not `entry.value` (B01). `describe()` publishes the
     * *effective* value — already through the schema clamp — so a banner that compared
     * `value` against the cap could never fire: it was dead code that made the whole
     * pair look like a page feature nobody could ever see. `user` is the document as
     * stored, which is exactly the number that disagrees. A namespace with no user
     * layer, and a bare document (a test fixture, a caller passing a value), fall back
     * to `value`, so the banner degrades to reporting the effective document instead of
     * disappearing.
     *
     * Only a numeric value above the maximum counts: a string, or a value below the
     * minimum, is a different defect and is already `error.number` (red, blocks Save).
     * @param entry - the namespace entry as the mirror publishes it (`{ value, user }`),
     *   or a plain settings document.
     * @returns one `{ key, live, cap }` finding per overrun, in field order.
     */
    function limitOverrunWarn(entry) {
      const findings = []
      if (entry === undefined || entry === null) return findings
      const projected = entry.value === undefined || entry.value === null ? entry : entry.value
      const stored = entry.user === undefined || entry.user === null ? projected : entry.user
      if (stored === undefined || stored === null) return findings
      for (const field of FIELDS) {
        if (field.kind !== 'number' || field.max === undefined) continue
        const live = stored[field.key]
        if (typeof live !== 'number' || !Number.isFinite(live) || live <= field.max) continue
        findings.push({ key: field.key, live, cap: field.max })
      }
      return findings
    }

    /** Exact Host route that publishes the removed keys this load still carries (D-155). */
    const CONFIG_NOTICES_ROUTE_PATH = '/grok-workflow/config-notices'

    /**
     * The removed keys the Host says this load is still carrying, as the page last read them.
     *
     * Why a route instead of the settings document (D-155): `settings/describe` publishes
     * `user` **projected through the namespace's schema** (`projectForm` walks the
     * schema's `dict`), and a removed key is by definition not in that schema — so an
     * `entry.user` scan can never see one. The plugin still sees the leftover in the raw
     * config, so it publishes the list over its own read-only route, the same mechanism
     * the workflow switch above uses. Reading the route is idempotent, which is what lets
     * the load log keep its own one-line-per-key announcement untouched.
     *
     * Deliberately a plain store rather than page state: the settings page mounts, the
     * settings *card* mounts, and a language switch re-renders — one read serves all
     * three, and a page that never mounts costs no request.
     */
    function createNoticesStore() {
      /** @type {string[]} */
      let value = []
      const listeners = new Set()
      return {
        /** @param {string[]} next */
        set(next) {
          const same = next.length === value.length && next.every((key, index) => key === value[index])
          value = next
          if (same) return
          for (const listener of listeners) listener()
        },
        /** @param {() => void} listener */
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        getSnapshot: () => value,
      }
    }

    const configNotices = createNoticesStore()

    /**
     * Read the notice route's answer into the keys this build knows are removed.
     *
     * The answer is `{ ok: true, notices: [{ key, message }] }`. Only the keys are taken:
     * the sentence is composed on this side from the page's own dictionary, so a language
     * switch re-renders the notice instead of stranding the other language's copy. A key
     * this build does not list as removed is dropped — the route is the Host's answer, but
     * the page still decides what it is willing to name.
     * @param payload - the parsed body, if any.
     * @returns the removed keys to name, in the order the route listed them.
     */
    function parseConfigNotices(payload) {
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return []
      if (payload.ok !== true || !Array.isArray(payload.notices)) return []
      const keys = []
      for (const notice of payload.notices) {
        const key = notice !== null && typeof notice === 'object' ? notice.key : undefined
        if (typeof key !== 'string' || !REMOVED_KEYS.includes(key) || keys.includes(key)) continue
        keys.push(key)
      }
      return keys
    }

    /**
     * Read the notice route once and publish what it says.
     *
     * Never throws and never surfaces a failure: a Host without the route (an older
     * composition, no `webServer`), a closed socket, a body that is not JSON — all of
     * them mean "no notice to show", not an error on a page whose job is editing
     * settings. The empty list is therefore also the failure answer.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns the keys that were published.
     */
    async function refreshConfigNotices(fetchImpl) {
      const answered = await getRoute(CONFIG_NOTICES_ROUTE_PATH, {}, fetchImpl)
      const keys = answered.failure === undefined && answered.status === 200 ? parseConfigNotices(answered.payload) : []
      configNotices.set(keys)
      return keys
    }

    /** Settings keys that have a row label, so a finding may name them in words. */
    const FIELD_KEYS = new Set(FIELDS.map((field) => field.key))

    /**
     * The name of one settings field, translated when it is a real field.
     *
     * A finding carries the field *key* (`historyTurns`), which is an identifier, not
     * copy: rendered raw it put an English camel-case key inside a Chinese sentence. The
     * label the row itself shows is the same fact in words, so it is reused here.
     * @param t - translator bound to this plugin's namespace.
     * @param key - the field key from a finding.
     * @returns the row label, or the key when it is not this page's field.
     */
    function fieldLabel(t, key) {
      return FIELD_KEYS.has(key) ? t(`field.${key}`) : key
    }

    /**
     * Render one validation finding in the active language.
     *
     * `role` params carry role ids, not prose: the role name is looked up here so a single
     * dictionary entry serves all four chains in both languages. `key` params carry a
     * settings key and go through {@link fieldLabel} for the same reason.
     * @param error - a finding from `validate`.
     * @param t - translator bound to this plugin's namespace.
     * @returns the message the user sees.
     */
    function formatError(error, t) {
      const source = error === undefined || error.params === undefined ? {} : error.params
      const params = { ...source }
      if (typeof params.role === 'string') params.role = t(`role.${params.role}`)
      if (typeof params.key === 'string') params.key = fieldLabel(t, params.key)
      return t(error.key, params)
    }

    /** Stable React key for one finding (the same text may repeat across rows). */
    const errorId = (error) => `${error.key}:${JSON.stringify(error.params || {})}`

    const opsFor = (draft, value) => {
      const ops = []
      for (const field of FIELDS) {
        const before = value === undefined ? undefined : value[field.key]
        if (JSON.stringify(before) === JSON.stringify(draft[field.key])) continue
        ops.push({ op: 'set', path: [field.key], value: draft[field.key] })
      }
      for (const role of ROLES) {
        const before = value && value.roles && typeof value.roles === 'object' && !Array.isArray(value.roles) ? value.roles[role] : undefined
        const after = draft !== undefined && draft !== null && typeof draft.roles === 'object' && draft.roles !== null && !Array.isArray(draft.roles) && Array.isArray(draft.roles[role]) ? draft.roles[role] : []
        if (JSON.stringify(before || []) === JSON.stringify(after)) continue
        ops.push({ op: 'set', path: ['roles', role], value: after })
      }
      return ops
    }

    const HAIRLINE = 'rgba(128,128,128,0.14)'
    const styles = {
      page: { display: 'flex', flexDirection: 'column', gap: '24px', padding: '4px 2px 32px', fontSize: '13px', lineHeight: 1.55 },
      section: { display: 'flex', flexDirection: 'column', gap: '10px' },
      card: { display: 'flex', flexDirection: 'column', gap: '0', border: '1px solid rgba(128,128,128,0.22)', borderRadius: '12px', padding: '18px 20px 10px', background: 'rgba(128,128,128,0.03)' },
      heading: { fontSize: '15px', fontWeight: 650, margin: '0 0 4px', letterSpacing: '-0.01em' },
      title: { fontSize: '17px', fontWeight: 650, margin: '0 0 6px', letterSpacing: '-0.01em' },
      sub: { fontSize: '12px', fontWeight: 600, margin: 0 },
      row: { display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)', gap: '16px', alignItems: 'start', padding: '12px 0' },
      label: { display: 'flex', flexDirection: 'column', gap: '3px', paddingTop: '6px' },
      labelTitle: { fontSize: '13px', fontWeight: 600 },
      hint: { opacity: 0.75, fontSize: '12px', lineHeight: 1.6 },
      /** A whole-page state (reading / failed / not served): a column, never a squeezed line. */
      state: { display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start', padding: '4px 2px' },
      control: { minWidth: 0, paddingTop: '6px' },
      input: { width: '100%', minWidth: 0, boxSizing: 'border-box', height: '32px', padding: '0 10px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '13px' },
      narrow: { maxWidth: '220px' },
      statusOn: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '4px', border: `1px solid ${STATUS_COLOR.done}`, background: 'var(--dsw-alias-state-success-tertiary, rgba(26,157,90,0.10))', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' },
      statusOff: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '4px', border: `1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))`, background: 'var(--dsw-alias-fill-l2, rgba(128,128,128,0.08))', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' },
      statusDot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '8px', flex: 'none' },
      /**
       * A heads-up box. Both colours are tokens: the previous pair was a literal
       * `#f5c542` on `#fff7e6`, which reads as a bright light-mode block in a dark
       * composition and ignores a contrast pass. The `currentColor`/translucent fallbacks
       * keep the box visible on a theme that does not define the warn tokens.
       */
      warn: { border: '1px solid var(--dsw-alias-state-warn-primary, currentColor)', background: 'var(--dsw-alias-state-warn-tertiary, rgba(183,121,31,0.12))', borderRadius: '10px', padding: '9px 13px', fontSize: '12px', lineHeight: 1.6 },
      /** The same box when it wraps a whole section (a refused write): same tokens, roomier. */
      danger: { display: 'flex', flexDirection: 'column', gap: '0', border: '1px solid var(--dsw-alias-state-warn-primary, currentColor)', background: 'var(--dsw-alias-state-warn-tertiary, rgba(183,121,31,0.12))', borderRadius: '12px', padding: '16px 20px 8px' },
      chain: { display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid rgba(128,128,128,0.25)', paddingLeft: '12px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px', paddingTop: '2px', paddingBottom: '2px' },
      roleCard: { display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(128,128,128,0.05)', border: '1px solid rgba(128,128,128,0.16)', borderRadius: '10px', padding: '12px 14px' },
      roleHead: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
      roleIndex: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(59,110,246,0.12)', color: '#3b6ef6', fontSize: '12px', fontWeight: 700, flex: 'none' },
      route: { display: 'flex', gap: '8px', alignItems: 'center' },
      switch: { position: 'relative', width: '38px', height: '21px', borderRadius: '999px', border: 0, cursor: 'pointer', flex: 'none', background: '#d1d5db', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', padding: '2px' },
      switchOn: { position: 'relative', width: '38px', height: '21px', borderRadius: '999px', border: 0, cursor: 'pointer', flex: 'none', background: '#2f9e44', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', padding: '2px' },
      /** The moving part. Without it the pill reads as a flat block, not a switch. */
      switchThumb: { width: '17px', height: '17px', borderRadius: '50%', background: 'var(--dsw-alias-label-inverse, #fff)', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'transform 120ms ease' },
      button: { minHeight: '32px', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      primary: { minHeight: '32px', padding: '5px 18px', borderRadius: '8px', border: '1px solid transparent', background: '#3b6ef6', color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 600 },
      footer: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 0, padding: '12px 0', marginTop: '4px', borderTop: `1px solid ${HAIRLINE}`, background: 'var(--dsh-settings-footer-bg, rgba(128,128,128,0.12))', backdropFilter: 'blur(8px)' },
      step: { minWidth: '32px', minHeight: '32px', padding: '0 8px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: '15px', lineHeight: 1 },
      groupTitle: { fontSize: '15px', fontWeight: 650, margin: '0 0 4px', letterSpacing: '-0.01em' },
      error: { color: STATUS_COLOR.failed },
      errorBox: { background: 'rgba(229,72,77,0.07)', border: '1px solid rgba(229,72,77,0.35)', borderRadius: '10px', padding: '10px 14px' },
      empty: { display: 'block', border: '1px dashed rgba(128,128,128,0.4)', borderRadius: '8px', padding: '10px 12px', background: 'transparent' },
      ok: { color: STATUS_COLOR.done },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' },
      /**
       * One switch's cell in the composer tool row. Ambient, not a card: it must not
       * compete with the model selector it sits beside, so it is one muted line on the
       * theme's own surface tokens rather than a panel with a border of its own.
       */
      loopDock: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '2px 2px', fontSize: '12px', lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary, inherit)' },
      loopLabel: { fontWeight: 600 },
      /**
       * The workflow switch's lamp. Filled when the session runs workflow work, a hollow
       * ring when it does not — the non-textual half of "off", so a grey pill is never
       * the only signal that the switch is off. Both are component-local inline styles:
       * no page-level rule and nothing that touches a neighbour in the row.
       */
      dockDot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flex: 'none', background: STATUS_COLOR.done },
      dockDotOff: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flex: 'none', boxSizing: 'border-box', border: '2px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.7))', background: 'transparent' },
    }

    // One injected rule set for what inline styles cannot express: hairline
    // dividers between stacked rows (`.gw-row + .gw-row`), the disclosure
    // marker for the collapsed group, its inner indent, and the one thing no
    // inline style can be: a width-dependent rule.
    //
    // A field row is a two-column grid whose label column has a 200px minimum, so
    // below ~430px the pair cannot fit and the row used to push the card wider than
    // the panel — the page scrolled sideways instead of stacking. `!important` is
    // required here and nowhere else: the row's own layout is an inline style, which
    // only an `!important` rule in a stylesheet can override.
    function PageStyle() {
      return h('style', null, [
        '.gw-row + .gw-row { border-top: 1px solid rgba(128,128,128,0.14); }',
        '.gw-adv > summary { list-style: none; }',
        '.gw-adv > summary::-webkit-details-marker { display: none; }',
        '.gw-adv > summary::before { content: "▸"; display: inline-block; width: 1.2em; color: rgba(128,128,128,0.9); }',
        '.gw-adv[open] > summary::before { content: "▾"; }',
        '.gw-adv-body { padding-left: 2px; }',
        'input[data-field]:hover, select[data-field]:hover { border-color: rgba(59,110,246,0.55); }',
        'input[data-field]:focus, select[data-field]:focus { outline: 2px solid rgba(59,110,246,0.35); outline-offset: 0; border-color: #3b6ef6; }',
        'button[data-action]:hover:not(:disabled), button[data-add-route]:hover:not(:disabled), button[data-remove-route]:hover:not(:disabled) { border-color: rgba(59,110,246,0.6); }',
        'button[data-action]:focus-visible, button[data-add-route]:focus-visible, button[data-remove-route]:focus-visible, summary:focus-visible { outline: 2px solid rgba(59,110,246,0.5); outline-offset: 2px; }',
        'button:disabled, input:disabled, select:disabled { opacity: 0.55; cursor: not-allowed; }',
        'input[data-field]:disabled, select[data-field]:disabled { background: rgba(128,128,128,0.08); }',
        '@media (max-width: 560px) { .gw-row { grid-template-columns: minmax(0, 1fr) !important; gap: 4px !important; } }',
        // The route chain is an inner scroll box; on a narrow window its own left rule
        // and padding are what push the card out, so they shrink first.
        '@media (max-width: 560px) { .gw-chain { padding-left: 8px !important; } }',
      ].join('\n'))
    }

    /**
     * Locate this plugin's settings namespace in the Host mirror.
     *
     * The namespace name is the Loader row id: `grok-workflow` in the shipped
     * composition, but *whatever the profile patch calls the row*. A renamed row
     * moves the namespace, and a page bound to the literal string would silently
     * vanish (t34 residual risk). Identification is therefore layered like the
     * Host's own: the shipped id first, then the projected value — `roles` is
     * volatile and specific enough to be this plugin (T5: `switchOn` is gone,
     * fixed internally since T4).
     * @param view - the mirror's namespace view, when the Host published one.
     * @param defaultNs - the shipped namespace id.
     * @returns the namespace to bind to and how it was found.
     */
    // Rename-safe: the shipped id wins; a renamed row is recognized by all
    // its volatile keys, not by one (T5: `roles` alone under-determines —
    // the Host serves volatile `roles` for other plugins too).
    function resolveNamespace(view, defaultNs) {
      const namespaces = view === undefined || view.namespaces === undefined ? [] : view.namespaces
      const byId = namespaces.find((item) => item.ns === defaultNs)
      if (byId !== undefined) return { ns: defaultNs, how: 'id' }
      // T5: the page only owns the FIELDS scalars plus `roles` chains, so the
      // renamed-row signature is all of them — `roles` must carry the five T5
      // chains, and every visible scalar must be present.
      const byValue = namespaces.find((item) => {
        const value = item.value !== undefined && item.value !== null ? item.value : {}
        if (value.roles === undefined || value.roles === null || typeof value.roles !== 'object') return false
        if (!ROLES.every((role) => Array.isArray(value.roles[role]))) return false
        return FIELDS.every((field) => field.key in value)
      })
      if (byValue !== undefined) return { ns: byValue.ns, how: 'value' }
      return { ns: defaultNs, how: view === undefined ? 'default' : 'missing' }
    }

    /**
     * Resolve this plugin's namespace out of the settings mirror, as four states.
     *
     * The mirror (`@deepseek-ai/dsh-client-ui-settings`' `SettingsDescribeMirror`) reports
     * `{ status: 'idle'|'loading'|'ready', view, error }`, and a failed `describe()` leaves
     * `status: 'idle'` (or `'ready'` with the last good view) together with `error`. Reading
     * only the status therefore turns a Host that is *broken* into a page that says "loading"
     * forever, which is what this function used to do. The four states the page renders:
     * `loading` — no answer yet; `error` — the last answer was a failure and nothing usable
     * is held; `unavailable` — a good answer that does not carry this namespace; `ready`.
     * @param face - the settings mirror.
     * @param defaultNs - the shipped namespace id.
     * @returns the state, the namespace entry (when there is one) and how it was found.
     */
    function useNamespace(face, defaultNs) {
      const snapshot = useSyncExternalStore(
        (listener) => face.subscribe(listener),
        () => face.getSnapshot(),
        () => face.getSnapshot(),
      )
      const view = snapshot.view
      const resolved = resolveNamespace(view, defaultNs)
      const entry = view === undefined ? undefined : view.namespaces.find((candidate) => candidate.ns === resolved.ns)
      const failure = snapshot.error === undefined || snapshot.error === null ? undefined : String(snapshot.error)
      let status = 'ready'
      if (entry === undefined) {
        if (failure !== undefined) status = 'error'
        else status = snapshot.status === 'ready' ? 'unavailable' : 'loading'
      }
      return {
        status,
        entry,
        error: failure,
        ns: resolved.ns,
        how: resolved.how,
      }
    }

    /**
     * Read the runtime's model catalog from the settings mirror: provider ids to
     * their declared model ids. Mirrors the host-side reader in `src/settings.ts`
     * (`llm.listConfigurableProviders` + `settings.describe`), but against the
     * browser face shape (`{ namespaces: [{ ns, value }] }`).
     *
     * Returns undefined when the runtime exposes nothing usable; every dropdown
     * caller falls back to a free-text input in that case.
     * @param face - the settings mirror.
     * @returns provider ids and their model lists, or undefined.
     */
    function readCatalog(face) {
      try {
        if (face === undefined || face === null || typeof face.getSnapshot !== 'function') return undefined
        const snapshot = face.getSnapshot()
        const namespaces = snapshot === undefined || snapshot.view === undefined || snapshot.view.namespaces === undefined
          ? []
          : snapshot.view.namespaces
        // Provider sections live under their own namespaces (e.g. `llm-p1` with
        // `value.providers.p1.models`); collect every `models` list found there.
        const catalog = {}
        let found = false
        for (const item of namespaces) {
          const value = item === undefined || item.value === undefined || item.value === null ? {} : item.value
          const providers = value.providers
          if (providers === undefined || providers === null || typeof providers !== 'object') continue
          for (const [provider, entry] of Object.entries(providers)) {
            if (entry === undefined || entry === null || typeof entry !== 'object') continue
            const models = entry.models
            if (!Array.isArray(models)) continue
            const ids = []
            for (const model of models) {
              if (typeof model === 'string' && model !== '') ids.push(model)
              else if (model !== null && typeof model === 'object' && typeof model.id === 'string' && model.id !== '') ids.push(model.id)
            }
            if (ids.length > 0) { catalog[provider] = ids; found = true }
          }
        }
        return found ? catalog : undefined
      } catch {
        return undefined
      }
    }

    /**
     * One form row: label on the left, control on the right.
     * T5 carries no usage hints (the mock has none): title only.
     * The raw field key is never rendered; it survives only as `data-field`.
     */
    function FieldRow(props) {
      const { fieldKey, title, control } = props
      return h('div', { style: styles.row, className: 'gw-row', 'data-field': fieldKey },
        h('span', { style: styles.label },
          h('span', { style: styles.labelTitle }, title)),
        h('div', { style: styles.control }, control))
    }

    function Toggle(props) {
      const { on, disabled, onFlip, label } = props
      return h('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center' } },
        h('button', {
          type: 'button', role: 'switch', 'aria-checked': on === true,
          style: on === true ? styles.switchOn : styles.switch, disabled,
          onClick: () => onFlip(!on),
        },
        // The thumb is what makes the state visible at a glance; the pill alone is a block.
        h('span', { 'data-switch-thumb': true, 'aria-hidden': 'true', style: styles.switchThumb })),
        h('span', null, label))
    }

    function EnumField(props) {
      const { field, value, disabled, onChange, t } = props
      const optionKey = (option) => `option.${field.key}.${option}`
      const known = new Set(field.options.map((option) => String(option)))
      const current = String(value)
      // An out-of-range stored value (a legacy patch, a hand edit) must stay
      // selectable: a bare <select> would render blank and drop the value on
      // the next save. Show it as its own first row so nothing is lost.
      const rows = known.has(current) ? field.options : [current, ...field.options]
      return h('select', {
        style: { ...styles.input, ...styles.narrow, width: 'auto' }, value: current, disabled,
        onChange: (event) => onChange(field.key, event.target.value),
        'data-field': field.key,
      }, rows.map((option) => {
        const label = translate(undefined, optionKey(option)) === optionKey(option)
          ? option
          : t(optionKey(option))
        return h('option', { key: option, value: option }, label)
      }))
    }

    /**
     * One route row: provider dropdown + model dropdown, with free-text fallback.
     *
     * The catalog comes from the runtime's settings mirror (provider sections
     * declare their models); when the runtime exposes nothing, both controls
     * degrade to text inputs so the page never depends on a hard-coded list.
     */
    function RouteRow(props) {
      const { role, index, route, disabled, onUpdate, onRemove, catalog, t, invalid } = props
      const provider = String((route && route.provider) || '')
      const model = String((route && route.model) || '')
      const capRaw = route === undefined || route === null ? undefined : route.maxInFlight
      const capText = capRaw === undefined || capRaw === null ? '' : String(capRaw)
      const providers = catalog !== undefined && catalog !== null && typeof catalog === 'object' ? Object.keys(catalog) : []
      const models = provider !== '' && catalog !== undefined && catalog[provider] !== undefined ? catalog[provider] : []
      const knownProvider = provider === '' || providers.includes(provider)
      const knownModel = model === '' || models.includes(model)
      const missingModel = model.trim() === ''
      const badCap = capRaw !== undefined && capRaw !== null && String(capRaw).trim() !== '' &&
        (!Number.isSafeInteger(Number(capRaw)) || Number(capRaw) < ROUTE_INFLIGHT_MIN || Number(capRaw) > ROUTE_INFLIGHT_MAX)
      const rowInvalid = invalid === true || missingModel || badCap
      const badStyle = rowInvalid ? { borderColor: STATUS_COLOR.failed } : null
      const providerControl = providers.length === 0 || !knownProvider
        ? h('input', {
          type: 'text', placeholder: t('roles.manualProvider'), value: provider, disabled,
          style: badStyle === null ? styles.input : { ...styles.input, ...badStyle }, 'data-route-provider': `${role}-${index}`,
          onChange: (event) => onUpdate({ provider: event.target.value }),
        })
        : h('select', {
          style: badStyle === null ? styles.input : { ...styles.input, ...badStyle }, value: provider, disabled,
          'data-route-provider': `${role}-${index}`,
          onChange: (event) => onUpdate({ provider: event.target.value, model: '' }),
        },
        h('option', { key: '', value: '' }, t('roles.providerPlaceholder')),
        providers.map((name) => h('option', { key: name, value: name }, name)))
      const modelControl = models.length === 0 || !knownModel
        ? h('input', {
          type: 'text', placeholder: t('roles.modelPlaceholder'), value: model, disabled,
          style: badStyle === null ? styles.input : { ...styles.input, ...badStyle }, 'data-route-model': `${role}-${index}`,
          onChange: (event) => onUpdate({ model: event.target.value }),
        })
        : h('select', {
          style: badStyle === null ? styles.input : { ...styles.input, ...badStyle }, value: model, disabled,
          'data-route-model': `${role}-${index}`,
          onChange: (event) => onUpdate({ model: event.target.value }),
        },
        h('option', { key: '', value: '' }, t('roles.modelPlaceholder')),
        models.map((name) => h('option', { key: name, value: name }, name)))
      return h('div', { key: `${role}-${index}`, style: styles.route },
        h('span', { style: { ...styles.hint, minWidth: '18px', textAlign: 'center' } }, `${index + 1}`),
        h('span', { style: { flex: '1 1 0', minWidth: 0 } }, providerControl),
        h('span', { style: { flex: '1 1 0', minWidth: 0 } }, modelControl),
        h('span', { style: { flex: '0 0 64px', minWidth: 0 }, title: t('roles.capLabel') },
          h('input', {
            type: 'number', placeholder: t('roles.capPlaceholder'), value: capText, disabled,
            style: badCap ? { ...styles.input, textAlign: 'center', borderColor: STATUS_COLOR.failed } : { ...styles.input, textAlign: 'center' }, min: ROUTE_INFLIGHT_MIN, max: ROUTE_INFLIGHT_MAX, step: 1,
            'data-route-cap': `${role}-${index}`,
            'aria-label': t('roles.capLabel'),
            onChange: (event) => onUpdate({ maxInFlight: event.target.value === '' ? undefined : Number(event.target.value) }),
          })),
        h('button', {
          type: 'button', style: { ...styles.button, flex: 'none' }, disabled,
          onClick: onRemove,
          'data-remove-route': `${role}-${index}`,
        }, t('roles.remove')))
    }

    const ROLE_ORDER = { planner: 1, worker: 2, verifier: 3, supervisor: 4, synthesizer: 5 }

    /**
     * The guardian model row (Q8): one route, not a chain, first in the roles
     * group. Its failure modes differ from a chain on purpose — the adjudicator
     * has no fallback, so the row is a single provider/model pair and a blank
     * model reads as "off" (adjudication disabled, timeouts fail straight to
     * the task's bounded retry).
     *
     * `data-field` mirrors the FieldRow contract: this is a declared field whose
     * control is not a FieldRow, and the page-wide "every declared field has a
     * row" guard in test/client.spec.ts reads that attribute to see it.
     */
    function GuardianModelRow(props) {
      const { route, disabled, catalog, t, onChangeRoute } = props
      const provider = String((route && route.provider) || '')
      const model = String((route && route.model) || '')
      const providers = catalog !== undefined && catalog !== null && typeof catalog === 'object' ? Object.keys(catalog) : []
      const models = provider !== '' && catalog !== undefined && catalog[provider] !== undefined ? catalog[provider] : []
      const knownProvider = provider === '' || providers.includes(provider)
      const knownModel = model === '' || models.includes(model)
      const providerControl = providers.length === 0 || !knownProvider
        ? h('input', {
          type: 'text', placeholder: t('roles.manualProvider'), value: provider, disabled,
          style: styles.input, 'data-route-provider': 'guardianModel',
          onChange: (event) => onChangeRoute({ provider: event.target.value, model }),
        })
        : h('select', {
          style: styles.input, value: provider, disabled, 'data-route-provider': 'guardianModel',
          onChange: (event) => onChangeRoute({ provider: event.target.value, model: '' }),
        },
        h('option', { key: '', value: '' }, t('roles.providerPlaceholder')),
        providers.map((name) => h('option', { key: name, value: name }, name)))
      const modelControl = models.length === 0 || !knownModel
        ? h('input', {
          type: 'text', placeholder: t('roles.modelPlaceholder'), value: model, disabled,
          style: styles.input, 'data-route-model': 'guardianModel',
          onChange: (event) => onChangeRoute({ provider, model: event.target.value }),
        })
        : h('select', {
          style: styles.input, value: model, disabled, 'data-route-model': 'guardianModel',
          onChange: (event) => onChangeRoute({ provider, model: event.target.value }),
        },
        h('option', { key: '', value: '' }, t('roles.modelPlaceholder')),
        models.map((name) => h('option', { key: name, value: name }, name)))
      return h('div', { style: styles.roleCard, 'data-gw-guardian': true, 'data-field': 'guardianModel' },
        h('div', { style: styles.roleHead },
          h('span', { style: styles.roleIndex }, '·'),
          h('strong', null, t('field.guardianModel'))),
        h('p', { style: styles.hint, 'data-gw-guardian-hint': true }, t('field.guardianModel.hint')),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: { flex: '1 1 0', minWidth: 0 } }, providerControl),
          h('span', { style: { flex: '1 1 0', minWidth: 0 } }, modelControl)))
    }

    function RoleChain(props) {
      const { role, chain, disabled, onChange, catalog, t, badRows } = props
      const update = (index, patch) => {
        const next = chain.map((route, position) => (position === index ? { ...route, ...patch } : route))
        onChange(next)
      }
      return h('div', { style: styles.roleCard },
        h('div', { style: styles.roleHead },
          h('span', { style: styles.roleIndex }, String(ROLE_ORDER[role] || '·')),
          h('strong', null, t(`role.${role}`))),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: styles.hint }, t('roles.count', { count: chain.length, limit: CHAIN_LIMIT })),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || chain.length >= CHAIN_LIMIT,
            onClick: () => onChange([...chain, { provider: '', model: '' }]),
            'data-add-route': role,
          }, t('roles.add'))),
        h('div', { style: styles.chain, className: 'gw-chain' },
          chain.length === 0
            ? h('span', { style: { ...styles.hint, ...styles.empty } }, t('roles.empty'))
            : chain.map((route, index) => h(RouteRow, {
              key: `${role}-${index}`, role, index, route, disabled, catalog, t,
              invalid: badRows !== undefined && badRows.has(`${role}-${index}`),
              onUpdate: (patch) => update(index, patch),
              onRemove: () => onChange(chain.filter((_route, position) => position !== index)),
            }))))
    }

    /**
     * The version/upgrade card: installed version, newest release, and the one button
     * that can actually move it.
     *
     * The static `PLUGIN_VERSION` / `UPDATE_LATEST` pair plus the copyable command stay the
     * honest baseline: they are what this page knows without asking anyone, they are what a
     * reader gets in a composition with no update route at all, and they never go away.
     * Once the Host has answered, its `update.command` replaces the frozen baseline in all
     * three places the command appears (the body sentence, the command line, the copy
     * button) — a static line pointing at `#v0.13.31` next to "0.13.32 is available" would
     * install the older release, which is the mistake this button exists to end.
     * The button adds a Host answer on top — `src/update-surface.ts` is the only place a
     * browser click can reach an install, because `dsh plugin add` is a system command this
     * page cannot run.
     *
     * Four phases, each rendered as `data-gw-update-phase`:
     *
     * - `check` — the resting state. The primary button reads the route
     *   (`data-action="update-check"`); once the answer says a strictly newer release is
     *   available *and* this Host can install, the same button becomes
     *   `data-action="update-install"` and names the target. A Host that answers
     *   `canInstall: false` keeps the copy line and says so instead of offering a button.
     * - `installing` — one POST in flight; the primary button is disabled, and the copy
     *   line stays visible because that is the fallback if the click never finishes.
     * - `latest` — nothing newer, or an install whose read-back equals the target. The
     *   card shows the read-back version and says that a page refresh is what activates the
     *   build. It never reloads or navigates: that is the reader's decision.
     * - `failed` — the failure sentence with the code as an attribute, and the read again.
     *
     * Nothing runs on mount: no GET, no POST on first paint. A failed install is retried
     * from a fresh read, never by re-posting the same request blindly.
     * @param props - `{ t }`, the guarded translator, plus an optional `updateFetch` (tests
     *   pass a fake; production uses the page's own fetch).
     */
    function UpdateCard(props) {
      const { t } = props
      const fetchImpl = typeof props.updateFetch === 'function'
        ? props.updateFetch
        : (typeof fetch === 'function' ? fetch.bind(undefined) : undefined)
      const [copied, setCopied] = useState(false)
      /**
       * The card's one state cell.
       *
       * `status` (the last Host answer) survives a failure on purpose: the numbers on
       * screen should not vanish because a later call went wrong. `checking` is a read in
       * flight inside the `check` phase; `installed` is what an install read back and
       * `restored` is the version a rollback put back.
       */
      const [state, setState] = useState(() => ({
        phase: 'check',
        status: undefined,
        checking: false,
        installed: undefined,
        restored: undefined,
        code: undefined,
        error: undefined,
      }))
      const known = state.status
      /**
       * The one command line the card prints, copies and interpolates.
       *
       * The Host answers `update.command` in exactly the shape of `UPDATE_COMMAND`, built
       * from the release it just named. Preferring it is the whole point: a build frozen on
       * 0.13.31 that is told 0.13.32 is out would otherwise hand the reader a `#v0.13.31`
       * line next to a "0.13.32 is available" verdict, and copying it installs the older
       * release. With no answer — first paint, a dead socket, a Host that sends nothing or
       * sends an empty string — the static baseline is still byte for byte what is shown.
       */
      const command = known !== undefined && typeof known.command === 'string' && known.command !== ''
        ? known.command
        : UPDATE_COMMAND
      const copy = () => {
        try {
          const done = () => setCopied(true)
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            Promise.resolve(navigator.clipboard.writeText(command)).then(done, done)
          } else {
            done()
          }
        } catch {
          setCopied(true)
        }
      }
      // What is on disk, in the order the page can know it: an install's read-back, the
      // version a rollback restored, the Host's own reading, and only then the version this
      // build shipped as. The body sentence and the verdict both follow it, so the card
      // cannot say "installed 0.13.31, latest 0.13.32" next to "you are on the latest".
      const readback = state.installed !== undefined
        ? state.installed.to
        : (state.restored !== undefined && state.restored !== null
          ? state.restored
          : (known !== undefined && known.current !== null ? known.current : PLUGIN_VERSION))
      const target = known !== undefined && known.latest !== null ? known.latest : UPDATE_LATEST
      const newer = isNewerVersion(target, readback)
      const canInstall = known !== undefined && known.canInstall === true && newer

      /** Paint one status answer, or the reason there is none. */
      const applyStatus = (result) => {
        if (result.ok !== true) {
          setState((live) => ({ ...live, phase: 'failed', checking: false, code: result.code, error: result.error }))
          return
        }
        const update = result.update
        const latest = update.latest !== null ? update.latest : UPDATE_LATEST
        const installedNow = update.current !== null ? update.current : PLUGIN_VERSION
        setState({
          // "Nothing newer" is the Host's verdict and is shown as such; a newer release
          // this Host cannot install stays in `check`, where the note explains why.
          phase: isNewerVersion(latest, installedNow) ? 'check' : 'latest',
          status: update,
          checking: false,
          installed: undefined,
          restored: undefined,
          code: undefined,
          error: undefined,
        })
      }

      /** Read the route and repaint. The only thing that ever calls {@link checkUpdate}. */
      const runCheck = () => {
        setState((live) => ({ ...live, phase: 'check', checking: true, code: undefined, error: undefined }))
        void checkUpdate(fetchImpl).then(applyStatus)
      }

      /** One install, pinned to the release on screen. */
      const install = () => {
        // One POST per click: a second press while the first is in flight is a no-op, not
        // a second install, even in a carrier that still delivers the event.
        if (state.phase !== 'check' || !canInstall) return
        const wanted = target
        setState((live) => ({ ...live, phase: 'installing', checking: false, code: undefined, error: undefined }))
        void installUpdate(`v${wanted}`, fetchImpl).then((result) => {
          if (result.ok !== true) {
            setState((live) => ({
              ...live,
              phase: 'failed',
              code: result.code,
              error: result.error,
              restored: result.restored,
            }))
            return
          }
          setState((live) => ({
            ...live,
            // `latest` is a claim about the disk, so it is only made when the read-back
            // equals the tag that was asked for. Any other number stays in `check` with
            // that number on screen, and the next press reads the Host again.
            phase: result.installed.to === wanted ? 'latest' : 'check',
            installed: result.installed,
            code: undefined,
            error: undefined,
          }))
        })
      }

      const primary = state.phase === 'installing'
        ? h('button', {
          type: 'button', style: styles.primary, disabled: true, onClick: install,
          'data-action': 'update-install', 'data-gw-update-busy': true,
        }, t('update.installing'))
        : state.phase === 'latest'
          ? h('button', {
            type: 'button', style: styles.button, disabled: true, 'data-action': 'update-check',
          }, t('update.state.latest'))
          : state.phase === 'check' && canInstall
            ? h('button', {
              type: 'button', style: styles.primary, disabled: state.checking === true, onClick: install,
              'data-action': 'update-install',
            }, t('update.install', { target }))
            // `check` before anything was asked, and `failed` on the way back in: both read
            // the route, and neither installs anything.
            : h('button', {
              type: 'button', style: styles.button, disabled: state.checking === true, onClick: runCheck,
              'data-action': 'update-check',
            }, t('update.check'))

      return h('div', {
        style: styles.card,
        'data-gw-update': `${PLUGIN_VERSION}:${UPDATE_LATEST}`,
        'data-gw-update-phase': state.phase,
        'data-gw-update-can-install': canInstall ? 'yes' : 'no',
      },
        h('h3', { style: styles.groupTitle }, t('update.title')),
        h('p', { style: styles.hint }, t('update.body', { current: readback, target, command })),
        h('p', { style: styles.mono, 'data-gw-update-command': true }, command),
        // The verdict is suppressed in `failed`: "you are on the latest release" printed
        // next to "we could not ask" is a contradiction a reader cannot resolve.
        state.phase === 'failed'
          ? null
          : h('p',
            { style: styles.hint, 'data-gw-update-state': newer ? 'newer' : 'latest' },
            newer ? t('update.state.newer', { target }) : t('update.state.latest')),
        // Degraded mode: a newer release exists but this Host cannot install it (no plugin
        // manager, or it cannot read the installed row). The reason rides along as an
        // attribute so the sentence stays one sentence.
        known !== undefined && known.canInstall !== true && newer
          ? h('p',
            {
              style: styles.warn,
              'data-gw-update-unavailable': true,
              'data-gw-update-reason': known.reason === undefined ? 'update/unavailable' : known.reason,
            },
            t('update.unavailable'))
          : null,
        state.phase === 'latest'
          ? h('p', { style: styles.hint, 'data-gw-update-refresh': true }, t('update.refresh'))
          : null,
        state.phase === 'failed'
          ? h('p',
            {
              style: styles.error,
              'data-gw-update-error': state.error === undefined ? '' : String(state.error),
              'data-gw-update-error-code': state.code === undefined ? 'update/response' : String(state.code),
            },
            t('update.failed', { message: state.error === undefined ? '?' : String(state.error) }))
          : null,
        h('p', { style: styles.hint, 'data-gw-update-terminal': true }, t('update.terminal')),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: styles.hint, 'data-gw-update-current': readback }, `${t('update.current')}: ${readback}`),
          primary,
          h('button', { type: 'button', style: styles.button, onClick: copy, 'data-action': 'update-copy' }, t('update.copy'))))
    }

    /**
     * The live one-line status under the intro, derived from the current draft:
     * the value a session with no `/grok` record reports. It is a default, not a
     * router — admitting a reviewed block stays the session's own record's job.
     * It follows the draft in real time and is never saved.
     */
    function StatusLine(props) {
      const { draft, t } = props
      const on = draft.grokDefault === 'on'
      const key = on ? 'status.on' : 'status.off'
      const detailKey = `${key}.detail`
      const dot = on ? STATUS_COLOR.done : STATUS_COLOR.pending
      return h('div', { style: on ? styles.statusOn : styles.statusOff },
        h('span', { style: { ...styles.statusDot, background: dot } }),
        h('strong', null, t(key)),
        h('span', { style: { marginLeft: '8px', opacity: 0.75, fontSize: '12px' } }, t(detailKey)))
    }

    function GrokWorkflowPage(props) {
      // `t` is the framework's locale seat when the registration declared `locale: NS`
      // (it re-derives on every locale revision), and the bundle's own translator when the
      // composition has no locale plugin. Either way the guard below refuses to render a
      // key: a seat whose dictionary is not registered answers with the key itself, and
      // `field.maxConcurrency` is not something this page may show a reader.
      const t = guardedTranslator(props.t, typeof props.translateOwn === 'function' ? props.translateOwn : translator(FALLBACK_LOCALE))
      // The plugin manager renders this same registration twice: once as the card's
      // one-line description (`view: 'summary'`) and once as the detail page.
      if (props.view === 'summary') {
        return t('card.summary')
      }
      const namespace = useNamespace(props.face, props.defaultNs === undefined ? NS : props.defaultNs)
      // Whether the "进度" tab is mounted is a page-visible fact, not a console detail:
      // the tab needs `uiConversation`/`sessions`, and in a composition without them the
      // reader sees no third tab and no reason for its absence — so the reason is here.
      // The store is read through the same snapshot mechanism the form uses, so the note
      // appears the moment the tab's services resolve (or fail).
      const progressStore = props.progressStatus === undefined ? PROGRESS_STATUS_UNKNOWN : props.progressStatus
      const progressState = useSyncExternalStore(progressStore.subscribe, progressStore.getSnapshot)
      const progressNote = progressState === 'unknown' || progressState === 'mounted'
        ? null
        : h('p', { style: styles.warn, 'data-progress-note': progressState },
          progressState === 'failed'
            ? t('status.progressFailed', { message: String(progressStore.getMessage === undefined ? '' : progressStore.getMessage() || '') })
            : t('status.progressMissing'))
      const form = props.getForm(namespace.ns)
      const entry = namespace.entry
      const value = entry === undefined ? undefined : entry.value
      const [draft, setDraft] = useState(() => draftOf(value))
      const [saving, setSaving] = useState(false)
      const [message, setMessage] = useState(undefined)
      const [retrying, setRetrying] = useState(false)
      // Re-seed the draft whenever the Host publishes a different document revision.
      const revision = entry === undefined ? undefined : entry.revision
      const stamp = `${String(revision)}:${namespace.status}`
      useEffect(() => { setDraft(draftOf(value)) }, [stamp])
      const errors = useMemo(() => validate(draft), [draft])
      // Row-level error marks: `missingModel`/`tooLong`/`duplicate`/`badCap`
      // carry `{ role, index }` (1-based) — the chain marks exactly those rows
      // red so the reader sees which row blocks the save.
      const badRows = useMemo(() => {
        const marks = new Set()
        for (const error of errors) {
          const params = error === undefined || error.params === undefined ? {} : error.params
          if (typeof params.role === 'string' && Number.isSafeInteger(params.index)) {
            marks.add(`${params.role}-${Number(params.index) - 1}`)
          }
        }
        return marks
      }, [errors])
      const ops = useMemo(() => opsFor(draft, value), [draft, value])
      const warnEmptyCap = useMemo(() => emptyCapWarn(draft), [draft])
      // Keyed on the live document, not the draft: an overrun is a fact about what is
      // stored, and it stops being one when the save lands (the revision bumps and the
      // draft is re-seeded from the new value). The entry is passed whole so the banner
      // can read the stored `user` layer instead of the clamped `value` (B01).
      const warnLimits = useMemo(() => limitOverrunWarn(entry), [entry, value, stamp])
      // D-155: the removed keys come from the plugin's own read-only route, not from the
      // settings document — the Host projects `user` through the namespace's schema, so a
      // leftover key is never in `entry.user`. Read once per mount, silently: a Host
      // without the route simply has nothing to say, and that is not a page error.
      const warnRemoved = useSyncExternalStore(configNotices.subscribe, configNotices.getSnapshot)
      useEffect(() => { void refreshConfigNotices() }, [])
      const disabled = saving || namespace.status !== 'ready' || entry === undefined || entry.writable === false
      const onChange = (key, next) => setDraft((current) => ({ ...current, [key]: next }))
      const setChain = (role, next) => setDraft((current) => ({ ...current, roles: { ...current.roles, [role]: next } }))
      const catalog = useMemo(() => readCatalog(props.face), [props.face, stamp])
      const save = async () => {
        if (errors.length > 0 || ops.length === 0) return
        setSaving(true)
        setMessage(undefined)
        try {
          const accepted = await form.mutate(ops, revision)
          // The message is stored as a key, not as prose, so a language switch mid-session
          // re-renders it in the new language instead of stranding the old one.
          setMessage(accepted === true ? { kind: 'ok', key: 'status.saved' } : { kind: 'error', key: 'status.refused' })
        } catch (error) {
          setMessage({ kind: 'error', key: 'status.writeFailed', params: { message: (error && error.message) || error } })
        } finally {
          setSaving(false)
        }
      }

      /**
       * Ask the Host for the settings document again.
       *
       * `load()` is the mirror's own refresh entry point (`SettingsDescribeMirror.load`,
       * the one `ensure()` calls when it is idle) and is the only documented way for a
       * plugin to retry a failed `describe()`. A composition that does not expose it
       * simply gets no retry button, which is why the button is built from the face
       * rather than assumed to exist.
       */
      const retry = typeof props.face !== 'undefined' && props.face !== null && typeof props.face.load === 'function'
        ? () => {
          setRetrying(true)
          Promise.resolve()
            .then(() => props.face.load())
            .catch(() => undefined)
            .then(() => setRetrying(false))
        }
        : undefined

      // Three states, kept apart on purpose: a page that is still reading, a read that
      // failed (with one way out), and a Host that answers but does not serve this
      // namespace (the plugin is off — retrying cannot help, so no button is offered).
      if (namespace.status === 'loading' || (entry !== undefined && value === undefined)) {
        return h('div', { style: styles.state, 'data-settings-state': 'loading' },
          h('p', { style: styles.hint }, t('status.loading')))
      }
      if (namespace.status === 'error' || namespace.status === 'unavailable') {
        const failed = namespace.status === 'error'
        const reload = failed ? retry : undefined
        return h('div', { style: styles.state, 'data-settings-state': namespace.status },
          h('p', { style: failed ? styles.error : styles.hint },
            failed
              ? t('status.loadError', { message: namespace.error })
              : t('status.unavailable')),
          reload === undefined
            ? null
            : h('button', {
              type: 'button', style: styles.button, 'data-action': 'retry',
              disabled: retrying, onClick: reload,
            }, t('action.retry')))
      }

      // T5: no usage hints anywhere on the page (mock has none).
      const fieldByKey = (key) => FIELDS.find((field) => field.key === key)
      // Number input with a unit suffix (paired `unit.*` dict keys).
      // The FIELDS min/max/def stay untouched.
      // Q9 (v0.13): a field whose stored unit differs from the unit it is edited in.
      // The value stays milliseconds everywhere else (schema, validation, report);
      // only the control converts, so nothing downstream has to know about minutes.
      const NUMBER_SCALES = { timeoutMs: 60000, childTimeoutMs: 60000 }
      const NUMBER_UNITS = {
        maxConcurrency: 'unit.jobs',
        maxTasks: 'unit.tasks',
        timeoutMs: 'unit.deadlineMinutes',
        childTimeoutMs: 'unit.childMinutes',
        loopMaxRounds: 'unit.rounds',
        loopFailStreak: 'unit.failures',
        loopIntervalMin: 'unit.minutes',
        iterateIntervalMin: 'unit.minutes',
      }
      const numberRow = (key) => {
        const field = fieldByKey(key)
        const unitKey = NUMBER_UNITS[key]
        const raw = draft[key]
        const scale = NUMBER_SCALES[key] || 1
        // The control shows `stored / scale`; every write multiplies back, so the
        // stored value never leaves milliseconds.
        const shown = raw === '' || raw === undefined ? '' : String(Number(raw) / scale)
        // Both bounds are whole numbers of the shown unit: a reader never sees a
        // fractional maximum, and the top step still lands inside the stored bound.
        const shownMin = Math.ceil(field.min / scale)
        const shownMax = Math.floor(field.max / scale)
        const step = (delta) => {
          const base = raw === '' || raw === undefined || !Number.isSafeInteger(Number(raw))
            ? field.def / scale
            : Number(raw) / scale
          const next = (base + delta) * scale
          onChange(key, Math.min(field.max, Math.max(field.min, Math.round(next))))
        }
        return h(FieldRow, {
          key, fieldKey: key, title: t(`field.${key}`),
          control: h('span', null,
            h('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center' } },
              h('button', {
                type: 'button', style: styles.step, disabled: disabled || raw === '' || Number(raw) / scale <= shownMin,
                onClick: () => step(-1), 'aria-label': '−', 'data-step': `${key}-down`,
              }, '−'),
              h('input', {
                type: 'number', style: { ...styles.input, ...styles.narrow, textAlign: 'center' }, value: shown, disabled,
                min: shownMin, max: shownMax, step: 1,
                onChange: (event) => onChange(key, event.target.value === '' ? '' : Math.round(Number(event.target.value) * scale)),
                'data-field': key,
              }),
              h('button', {
                type: 'button', style: styles.step, disabled: disabled || raw === '' || Number(raw) / scale >= shownMax,
                onClick: () => step(1), 'aria-label': '＋', 'data-step': `${key}-up`,
              }, '＋'),
              unitKey === undefined ? null : h('span', { style: styles.hint }, t(unitKey)))),
        })
      }

      return h('div', { style: styles.page, 'data-page': 'grok-workflow' },
        h(PageStyle, null),
        h('div', null,
          h('h2', { style: styles.title }, t('card.title')),
          h('p', { style: { ...styles.hint, margin: '0 0 12px', fontSize: '13px' } }, t('page.intro')),
          h(StatusLine, { draft, t }),
          progressNote),
        // --- 1 · 会话默认 (what a session reports before /grok) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.mode')),
          h(FieldRow, {
            key: 'grokDefault', fieldKey: 'grokDefault',
            title: t('field.grokDefault'),
            control: h(Toggle, {
              on: draft.grokDefault === 'on', disabled,
              onFlip: (next) => onChange('grokDefault', next ? 'on' : 'off'),
              label: t(draft.grokDefault === 'on' ? 'option.grokDefault.on' : 'option.grokDefault.off'),
            }),
          })),
        // --- 2 · 谁来干 (the guardian judge, then the five role chains) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.roles')),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
            // Q8: the guardian judge sits before the role chains it protects.
            h(GuardianModelRow, {
              route: draft.guardianModel,
              disabled, catalog, t,
              onChangeRoute: (next) => onChange('guardianModel', { provider: '', model: '', ...next }),
            }),
            // The 429 switch (Sec.3-2): the last declared field without a control.
            // The state word reuses the page's existing On/Off pair (`option.replan.on`
            // / `option.replan.off`, plain "开/关" in both languages): the page ships
            // one On/Off string per language already, and adding
            // `option.switchOnRateLimit.*` would duplicate two strings per language,
            // which this round forbids (no new copy keys).
            h(FieldRow, {
              key: 'switchOnRateLimit', fieldKey: 'switchOnRateLimit',
              title: t('field.switchOnRateLimit'),
              control: h(Toggle, {
                on: draft.switchOnRateLimit === true, disabled,
                onFlip: (next) => onChange('switchOnRateLimit', next),
                label: t(draft.switchOnRateLimit === true ? 'option.replan.on' : 'option.replan.off'),
              }),
            }),
            h('p', { style: styles.hint, 'data-gw-ratelimit-hint': true }, t('field.switchOnRateLimit.hint')),
            ROLES.map((role) => h(RoleChain, {
              key: role, role, chain: draft.roles[role] || [], disabled, catalog, t, badRows,
              onChange: (next) => setChain(role, next),
            })))),
        // --- 3 · 下多大力气 (three numbers) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.limits')),
          numberRow('maxConcurrency'),
          numberRow('maxTasks'),
          numberRow('timeoutMs'),
          // Q9: the reader reported "there is no deadline setting", because a
          // millisecond number with a terse label reads as an internal knob. The
          // hint says the default and what 0 means, in the same place the control is.
          h('p', { style: styles.hint, 'data-gw-timeout-hint': true }, t('field.timeoutMs.hint')),
          numberRow('childTimeoutMs'),
          h('p', { style: styles.hint, 'data-gw-child-timeout-hint': true }, t('field.childTimeoutMs.hint'))),
        // --- 4 · 自动接着干 (the repeat-run switch and its three bounds) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.loop')),
          h(FieldRow, {
            key: 'loopEnabled', fieldKey: 'loopEnabled',
            title: t('field.loopEnabled'),
            control: h(Toggle, {
              on: draft.loopEnabled === true, disabled,
              onFlip: (next) => onChange('loopEnabled', next),
              label: t(draft.loopEnabled === true ? 'option.loopEnabled.on' : 'option.loopEnabled.off'),
            }),
          }),
          h(FieldRow, {
            key: 'replan', fieldKey: 'replan',
            title: t('field.replan'),
            control: h(Toggle, {
              on: draft.replan === true, disabled,
              onFlip: (next) => onChange('replan', next),
              label: t(draft.replan === true ? 'option.replan.on' : 'option.replan.off'),
            }),
          }),
          h('p', { style: styles.hint, 'data-gw-replan-hint': true }, t('field.replan.hint')),
          numberRow('loopMaxRounds'),
          numberRow('loopFailStreak'),
          numberRow('loopIntervalMin')),
        // --- 5 · 自迭代 (the self-iteration heartbeat's interval and prompt template) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.iterate')),
          numberRow('iterateIntervalMin'),
          h(FieldRow, {
            key: 'iterateTemplate', fieldKey: 'iterateTemplate',
            title: t('field.iterateTemplate'),
            control: h('textarea', {
              style: { ...styles.input, width: '100%', minHeight: '160px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
              value: String(draft.iterateTemplate === undefined || draft.iterateTemplate === null ? '' : draft.iterateTemplate),
              disabled, rows: 8, spellCheck: false,
              onChange: (event) => onChange('iterateTemplate', event.target.value),
              'data-field': 'iterateTemplate',
            }),
          }),
          h('p', { style: styles.hint, 'data-gw-template-hint': true }, t('field.iterateTemplate.hint'))),
        // --- 6 · 插件版本 (read-only upgrade entry: current vs latest, copy the
        // `dsh plugin add` line — never a second installer) ---
        h(UpdateCard, { t }),
        warnEmptyCap
          ? h('div', { style: styles.warn },
            h('strong', null, t('warn.emptyCap.title')),
            h('div', null, t('warn.emptyCap.detail')))
          : null,
        warnLimits.length > 0
          ? h('div', { style: styles.warn, 'data-warn': 'limits' },
            h('strong', null, t('warn.limit.title')),
            warnLimits.map((item) => h('div', { key: item.key, 'data-warn-key': item.key },
              t('warn.limit.detail', { field: t(`field.${item.key}`), live: String(item.live), cap: String(item.cap) }))))
          : null,
        warnRemoved.length > 0
          ? h('div', { style: styles.warn, 'data-warn': 'removed' },
            h('strong', null, t('warn.removed.title')),
            warnRemoved.map((key) => h('div', { key, 'data-warn-key': key },
              t('warn.removed.detail', { key }))))
          : null,
        // One live region for both outcomes: a save that failed and a save that went
        // through are the two things a reader who is not looking at the footer must
        // hear. It is always mounted (empty when there is nothing to say) so that
        // *inserting* text is what announces, not a region appearing with text in it.
        h('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', 'data-gw-live': true },
          errors.length > 0
            ? h('div', { style: styles.errorBox },
              h('ul', { style: { ...styles.error, margin: 0, paddingLeft: '18px' } },
                errors.map((error) => h('li', { key: errorId(error) }, formatError(error, t)))))
            : null,
          message !== undefined
            ? h('p', { style: { ...(message.kind === 'error' ? styles.error : styles.ok), margin: 0 } }, t(message.key, message.params))
            : null),
        h('div', { style: styles.footer },
          h('button', {
            type: 'button', style: styles.primary, disabled: disabled || errors.length > 0 || ops.length === 0,
            onClick: save, 'data-action': 'save',
          }, saving ? t('action.saving') : t('action.save')),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || ops.length === 0,
            onClick: () => { setDraft(draftOf(value)); setMessage(undefined) }, 'data-action': 'discard',
          }, t('action.discard')),
          h('span', { style: { ...styles.hint, marginLeft: 'auto' } }, t('status.revision', { revision: String(revision) }))))
    }

    // ─── Chat task panel: the `workflow-run` node, re-registered ────────────────
    //
    // The chat task list is not drawn by this plugin. It is the stock `workflow-run`
    // chat node of `@deepseek-ai/dsh-client-ui-workflow-run`, folding the four
    // `tool-workflow/*` events this plugin records. That renderer makes a member row
    // openable only while the member is *running*: its `navigableMembers()` requires
    // `member.status === 'running'` together with a live child session, so every
    // finished row — the planner row `规划助手已完成`, a task's `执行` / `检查` rows —
    // rendered as inert text and could not be opened at all.
    //
    // The `conversation.chat.node` slot is keyed by `ChatNodeKind`, and its declared
    // contract is "reusing a key replaces that node renderer"
    // (`@deepseek-ai/dsh-client-ui-chat`, `lib/types/client/contract/slots.d.ts`,
    // `'conversation.chat.node'`). The runtime implements that replacement by
    // priority shadowing: a keyed slot throws on the same key *at the same*
    // priority, and "lowest renders" — the first entry of the slot's
    // priority-sorted entries wins the key (`SlotCore.register`'s duplicate
    // check plus `entriesOfSlot`'s per-key dedupe, `dsh-cordis-client-runner` /
    // the served web bundle). The stock renderer registers without a priority
    // (`priority ?? 0`), so this bundle re-registers the `workflow-run` key at
    // `priority: -1`: both registrations succeed, the stock renderer stays
    // live-but-shadowed (and resumes on plugin unload), and no client plugin
    // fails its boot fiber. Measured before the priority was added: the second
    // registrant's whole plugin failed with "web boot: 1 entry did not
    // activate / @deepseek-ai/dsh-client-ui-workflow-run: failed".
    //
    // The re-registered renderer keeps the same projection and the same wording,
    // with one deliberate difference: a member row is a link whenever its child
    // session can be opened — running, completed, failed, cancelled or
    // interrupted — because a finished subtask is exactly the one a reader wants
    // to inspect.
    //
    // Nothing about status is invented here. The rows still come from the stock
    // projection (`node.data`), whose member status is folded from the engine's own
    // `agent-start`/`agent-end` events; only the *decision to open* stopped depending
    // on liveness. A row whose child session cannot be resolved stays inert text rather
    // than opening the wrong session.
    //
    // Costs, stated rather than hidden: the plugin now owns the look of every
    // `workflow-run` node in this composition (including runs that are not its own),
    // and the stock disclosure's focus-deferral is simplified to open/collapse.
    const PANEL_NS = 'grok-workflow-panel'

    /** Panel copy. Same words the stock dictionary uses, in both shipped languages. */
    const PANEL_DICT = {
      zh: {
        'run.members.one': '{count} 个成员',
        'run.members.other': '{count} 个成员',
        'run.empty': '没有启动成员',
        'phase.unassigned': '未分阶段',
        'phase.empty': '空阶段名',
        'status.running': '运行中',
        'status.completed': '已完成',
        'status.failed': '未通过',
        'status.cancelled': '已取消',
        'status.interrupted': '已中断',
        // A status outside the five above is one this panel does not word: it says so
        // rather than printing the engine's own token in the middle of the sentence.
        'status.unknown': '状态未知',
        'statusCount.running': '运行中 {count}',
        'statusCount.completed': '已完成 {count}',
        'statusCount.failed': '未通过 {count}',
        'statusCount.cancelled': '已取消 {count}',
        'statusCount.interrupted': '已中断 {count}',
        'statusCount.unknown': '状态未知 {count}',
        'member.empty': '空成员名',
        'member.open': '打开 {name}',
      },
      en: {
        'run.members.one': '{count} member',
        'run.members.other': '{count} members',
        'run.empty': 'No members started',
        'phase.unassigned': 'Unassigned',
        'phase.empty': 'Empty phase',
        'status.running': 'Running',
        'status.completed': 'Completed',
        'status.failed': 'Not passed',
        'status.cancelled': 'Cancelled',
        'status.interrupted': 'Interrupted',
        // A status outside the five above is one this panel does not word; it says so
        // instead of printing the engine's own token in the middle of the sentence.
        'status.unknown': 'Unknown',
        'statusCount.running': 'Running {count}',
        'statusCount.completed': 'Completed {count}',
        'statusCount.failed': 'Not passed {count}',
        'statusCount.cancelled': 'Cancelled {count}',
        'statusCount.interrupted': 'Interrupted {count}',
        'statusCount.unknown': 'Unknown {count}',
        'member.empty': 'Empty member name',
        'member.open': 'Open {name}',
      },
    }

    /**
     * Dictionary key per status the stock fold can emit, plus the one it never does.
     *
     * `unknown` is the fallback for a status this bundle does not word — a stock fold
     * that grew a sixth state, or a session written by a newer engine. It resolves to
     * copy (`状态未知` / `Unknown`), never to the engine's own token: a reader gets a
     * sentence, not `queued`.
     */
    const PANEL_STATUS_KEY = {
      running: 'status.running',
      completed: 'status.completed',
      failed: 'status.failed',
      cancelled: 'status.cancelled',
      interrupted: 'status.interrupted',
      unknown: 'status.unknown',
    }

    /** Dictionary key for a status the fold did not word (see {@link PANEL_STATUS_KEY}). */
    const PANEL_UNKNOWN_STATUS = 'unknown'

    /**
     * The wording for one status, including the one no dictionary carries.
     * @param status - the stock fold's member/run status.
     * @param t - translator (the guard already keeps a bare key off the screen).
     * @returns the status word.
     */
    function panelStatusText(status, t) {
      return t(PANEL_STATUS_KEY[status] === undefined ? PANEL_STATUS_KEY[PANEL_UNKNOWN_STATUS] : PANEL_STATUS_KEY[status])
    }

    /**
     * Dot colour per status, through the same design tokens the settings page uses.
     *
     * The stock component colours these five with the primitives `StateDot`
     * (`running → ongoing`, `completed → done`, `failed → error`, `cancelled`/
     * `interrupted → warning`), which is the same five-token palette reached from the
     * other side; an unrecognized status takes the idle token rather than a hard-coded
     * grey, so a theme switch moves it too.
     */
    const PANEL_STATUS_COLOR = {
      running: STATUS_COLOR.doing,
      completed: STATUS_COLOR.done,
      // Amber, not red: the progress page's own rule (§19.2) is that red is not a word
      // this plugin uses for a task that did not pass, and the chat card speaks the same
      // vocabulary as the tab it summarizes.
      failed: STATUS_COLOR.blocked,
      cancelled: STATUS_COLOR.blocked,
      interrupted: STATUS_COLOR.blocked,
    }

    /** The dot colour for one status; an unknown status is the idle/pending state. */
    function panelStatusColor(status) {
      return PANEL_STATUS_COLOR[status] === undefined ? STATUS_COLOR.pending : PANEL_STATUS_COLOR[status]
    }

    /**
     * Translate one panel key, walking the requested locale then `en`.
     * @param locale - locale id such as `zh` or `en`.
     * @param key - dictionary key.
     * @param params - optional `{name}` substitutions.
     * @returns the translated string, or `key` when untranslated.
     */
    function panelTranslate(locale, key, params) {
      let template
      for (const id of [locale, FALLBACK_LOCALE]) {
        const dict = PANEL_DICT[id]
        if (dict !== undefined && dict[key] !== undefined) {
          template = dict[key]
          break
        }
      }
      if (template === undefined) return key
      if (params === undefined) return template
      const safePanelParams = params !== null && typeof params === 'object' ? params : {}
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in safePanelParams ? String(safePanelParams[name]) : match))
    }

    /** Bind one locale id into a `t(key, params)` function for the panel. */
    function panelTranslator(locale) {
      return (key, params) => panelTranslate(locale, key, params)
    }

    /** Whether a status is the run's own kind of bad news (drives the disclosure mode). */
    function panelAbnormal(status) {
      return status === 'failed' || status === 'cancelled' || status === 'interrupted'
    }

    /** Fold one run's statuses into the disclosure mode `abnormal` | `running` | `clean`. */
    function panelRunMode(data) {
      if (panelAbnormal(data.status)) return 'abnormal'
      if (data.status === 'running') return 'running'
      const members = []
      for (const phase of data.phases) for (const member of phase.members) members.push(member.status)
      if (members.some(panelAbnormal)) return 'abnormal'
      return members.includes('running') ? 'running' : 'clean'
    }

    /**
     * The navigation mode one member row may use, or `undefined` when it must stay inert.
     *
     * This is the whole fix in one function: the stock renderer additionally required the
     * member to be `running`, which is why a finished row had no link. What a row really
     * needs in order to be openable is a child session that belongs to *this* run's
     * parent and a known subagent mode to open it with — both of which survive the
     * member's completion. Nothing here reads the member's status.
     * @param child - the child session record from the sessions projection, if any.
     * @param identity - `projectionsBySession[childId].values.subagent`, if projected.
     * @param parentSessionId - the session that owns this workflow run.
     * @returns `'continuable'`, `'one-shot'`, or `undefined` for an inert row.
     */
    function panelMemberMode(child, identity, parentSessionId) {
      if (child === undefined || child === null || typeof child !== 'object') return undefined
      if (typeof parentSessionId === 'string' && child.parentId !== parentSessionId) return undefined
      if (identity === undefined || identity === null || typeof identity !== 'object') return undefined
      const mode = identity.mode
      // `external` children belong to another owner and cannot be opened from here; an
      // unknown mode would open a session the UI cannot resume, so it stays inert too.
      if (mode !== 'continuable' && mode !== 'one-shot') return undefined
      return mode
    }

    /**
     * Encode the openable member rows of one run as a single stable string.
     *
     * The slot's session store hook compares its selector result by identity, so the
     * selector returns a primitive: two renders of the same sessions produce the same
     * string, and a changed string is the only thing that re-renders the panel.
     * @param sessions - `{ byId, projectionsBySession }` from the sessions projection.
     * @param phases - the run's projected phases.
     * @param parentSessionId - the session that owns this workflow run.
     * @returns `childId=mode` entries joined by a separator; `''` when nothing is openable.
     */
    function panelOpenableKey(sessions, phases, parentSessionId) {
      const byId = sessions !== undefined && sessions !== null && sessions.byId !== undefined ? sessions.byId : {}
      const projections = sessions !== undefined && sessions !== null && sessions.projectionsBySession !== undefined
        ? sessions.projectionsBySession
        : {}
      const parts = []
      for (const phase of phases) {
        for (const member of phase.members) {
          const projection = projections[member.childId]
          const identity = projection === undefined || projection === null || projection.values === undefined
            ? undefined
            : projection.values.subagent
          const mode = panelMemberMode(byId[member.childId], identity, parentSessionId)
          if (mode !== undefined) parts.push(`${member.childId}=${mode}`)
        }
      }
      return parts.join('\u0000')
    }

    /** Decode {@link panelOpenableKey} into a `childId -> mode` map. */
    function panelOpenableMap(key) {
      const map = new Map()
      if (typeof key !== 'string' || key === '') return map
      for (const part of key.split('\u0000')) {
        const at = part.lastIndexOf('=')
        if (at > 0) map.set(part.slice(0, at), part.slice(at + 1))
      }
      return map
    }

    /** `已完成 2 · 运行中 1` for one phase header, in the reader's language. */
    function panelPhaseSummary(members, t) {
      const counts = new Map()
      for (const member of members) {
        const status = PANEL_STATUS_KEY[member.status] === undefined ? PANEL_UNKNOWN_STATUS : member.status
        counts.set(status, (counts.get(status) ?? 0) + 1)
      }
      const count = (status) => counts.get(status) ?? 0
      const active = ['running', 'failed', 'cancelled', 'interrupted', PANEL_UNKNOWN_STATUS].filter((status) => count(status) > 0)
      if (active.length === 0) return t('statusCount.completed', { count: count('completed') })
      const ordered = active.includes('interrupted') && count('completed') > 0 ? ['completed', ...active] : active
      return ordered.map((status) => t(`statusCount.${status}`, { count: count(status) })).join(' · ')
    }

    /** Inline styles for the panel: the stock CSS module is not reachable from here. */
    const panelStyles = {
      root: { width: '100%', minWidth: 0 },
      header: {
        boxSizing: 'border-box', width: '100%', height: '32px', display: 'flex', alignItems: 'center',
        gap: '6px', padding: '0 8px', border: 0, borderRadius: '8px', background: 'transparent',
        color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
      },
      chevron: { width: '16px', flex: 'none', textAlign: 'center', fontSize: '11px', opacity: 0.7 },
      runTitle: { maxWidth: '42%', fontSize: '13px', fontWeight: 510, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      separator: { width: '2px', height: '2px', borderRadius: '50%', background: 'currentColor', opacity: 0.5, flex: 'none' },
      runSummary: { minWidth: 0, flex: 1, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      statusTail: { height: '20px', flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 510 },
      // `min()` is the only width-dependent value available to an inline style: it keeps
      // the stock 16px indent and the stock 132px/64px status columns on a normal window
      // and lets them shrink instead of overflowing one (the stock CSS module does the
      // same at <=560px, which a stylesheet can express and an inline style cannot).
      phaseList: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, padding: '4px 0 0 min(16px, 4vw)' },
      phase: { minWidth: 0 },
      phaseHeader: {
        boxSizing: 'border-box', width: '100%', height: '32px', display: 'flex', alignItems: 'center',
        gap: '6px', padding: 0, border: 0, borderRadius: '8px', background: 'transparent',
        color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
      },
      phaseTitle: { minWidth: 0, maxWidth: '42%', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      phaseCount: { minWidth: 0, flex: 1, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      phaseStatus: { width: 'min(132px, 38vw)', flex: 'none', textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      members: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, padding: '0 0 0 min(16px, 4vw)' },
      memberRow: {
        width: '100%', minWidth: 0, minHeight: '24px', display: 'flex', alignItems: 'center',
        gap: '12px', padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit',
        textAlign: 'left', opacity: 0.85,
      },
      memberButton: {
        width: '100%', minWidth: 0, minHeight: '24px', display: 'flex', alignItems: 'center',
        gap: '12px', padding: 0, border: 0, borderRadius: '6px', background: 'transparent',
        color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
      },
      dotSlot: { width: '16px', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      dot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
      memberLabel: { minWidth: 0, flex: 1, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      memberLabelLink: {
        minWidth: 0, flex: 1, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        color: 'var(--dsw-alias-link, #2f6fed)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '3px',
      },
      memberStatus: { width: 'min(64px, 20vw)', flex: 'none', textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 },
      empty: { fontSize: '13px', opacity: 0.7, padding: 0 },
    }

    /**
     * One member row: a link whenever its child session can be opened, text otherwise.
     * @param member - projected member (`seq`, `label`, `childId`, `status`).
     * @param mode - navigation mode from {@link panelOpenableMap}, or `undefined`.
     * @param sessionId - the session that owns this run.
     * @param openSession - the slot's navigation face.
     * @param t - translator.
     * @returns the row element.
     */
    function PanelMemberRow(member, mode, sessionId, openSession, t) {
      const name = member.label === '' || member.label === undefined ? t('member.empty') : member.label
      const statusText = panelStatusText(member.status, t)
      const content = [
        h('span', { key: 'dot', style: panelStyles.dotSlot },
          h('span', { style: { ...panelStyles.dot, background: panelStatusColor(member.status) } })),
        h('span', {
          key: 'label',
          style: mode === undefined ? panelStyles.memberLabel : panelStyles.memberLabelLink,
          'data-member-label': true,
        }, name),
        h('span', { key: 'status', style: panelStyles.memberStatus, 'data-member-status-text': true }, statusText),
      ]
      if (mode === undefined) {
        return h('div', {
          key: member.seq,
          style: panelStyles.memberRow,
          'data-member-status': member.status,
          'data-member-openable': 'false',
        }, content)
      }
      return h('button', {
        key: member.seq,
        type: 'button',
        style: panelStyles.memberButton,
        'data-member-status': member.status,
        'data-member-openable': 'true',
        'aria-label': t('member.open', { name }),
        onClick: () => openSession({ parentSessionId: sessionId, childSessionId: member.childId, mode }),
      }, content)
    }

    /**
     * The chat task list for one workflow run.
     *
     * Same props the stock renderer takes (`node`, `sessionId`, `useSessions`,
     * `openSession`, `t`), so replacing the key needs no change on the Host side.
     * @param props - keyed Chat node props plus the injected `openSession` face.
     * @returns the run's section element.
     */
    function WorkflowRunPanel(props) {
      const data = props.node.data
      // `props.t` is the framework seat for namespace `grok-workflow-panel`; `panelT` is
      // this bundle's own translator for the same keys, injected by `mountPanel`. The seat
      // wins, and the guard keeps the one failure mode the seat has — answering with the
      // key itself when its dictionary is not registered — off the screen.
      const t = guardedTranslator(props.t, props.panelT)
      // A primitive selector result: the store compares by identity, and a fresh Map on
      // every notification would re-render (and warn) instead of settling.
      const openKey = props.useSessions((sessions) => panelOpenableKey(sessions, data.phases, props.sessionId))
      const navigable = useMemo(() => panelOpenableMap(openKey), [openKey])
      // A run that is still moving is open; a run read back from an old session starts
      // collapsed. Once open it stays open — collapsing a run at the moment it finishes is
      // exactly when the reader wants to click a finished row.
      const [open, setOpen] = useState(() => panelRunMode(data) !== 'clean')
      const [collapsed, setCollapsed] = useState(() => new Set())
      const total = data.phases.reduce((count, phase) => count + phase.members.length, 0)
      const togglePhase = (key) => setCollapsed((current) => {
        const next = new Set(current)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      const phaseSection = (phase) => {
        const phaseOpen = !collapsed.has(phase.key)
        const title = phase.phase === null ? t('phase.unassigned') : (phase.phase === '' ? t('phase.empty') : phase.phase)
        return h('div', { key: phase.key, style: panelStyles.phase },
          h('button', {
            type: 'button',
            style: panelStyles.phaseHeader,
            'data-phase-toggle': true,
            'aria-expanded': phaseOpen,
            onClick: () => togglePhase(phase.key),
          },
          h('span', { style: panelStyles.chevron }, phaseOpen ? '▾' : '▸'),
          h('span', { style: panelStyles.phaseTitle, 'data-phase-title': true }, title),
          h('span', { style: panelStyles.separator }),
          h('span', { style: panelStyles.phaseCount, 'data-phase-count': true },
            t(phase.members.length === 1 ? 'run.members.one' : 'run.members.other', { count: phase.members.length })),
          h('span', { style: panelStyles.phaseStatus, 'data-phase-status-text': true }, panelPhaseSummary(phase.members, t))),
          phaseOpen
            ? h('div', { style: panelStyles.members },
              phase.members.map((member) => PanelMemberRow(member, navigable.get(member.childId), props.sessionId, props.openSession, t)))
            : null)
      }
      return h('section', {
        style: panelStyles.root,
        'data-workflow-run': true,
        'data-run-status': data.status,
        'data-grok-workflow-panel': true,
      },
      h('button', {
        type: 'button',
        style: panelStyles.header,
        'data-run-toggle': true,
        'aria-expanded': open,
        onClick: () => setOpen(!open),
      },
      h('span', { style: panelStyles.chevron }, open ? '▾' : '▸'),
      h('span', { style: panelStyles.runTitle, 'data-run-title': true }, data.name),
      h('span', { style: panelStyles.separator }),
      h('span', { style: panelStyles.runSummary, 'data-run-summary': true },
        t(total === 1 ? 'run.members.one' : 'run.members.other', { count: total })),
      h('span', { style: panelStyles.statusTail, 'data-run-status-text': true },
        h('span', { style: { ...panelStyles.dot, background: panelStatusColor(data.status) } }),
        h('span', { style: { marginLeft: '4px' } },
          panelStatusText(data.status, t)))),
      open
        ? h('div', { style: panelStyles.phaseList },
          data.phases.length === 0
            ? h('span', { style: panelStyles.empty }, t('run.empty'))
            : data.phases.map(phaseSection))
        : null)
    }

    /**
     * Register the panel renderer for the stock `workflow-run` chat node.
     *
     * `conversation.chat.node` is keyed by node kind; a reused key replaces that
     * renderer through priority shadowing, so this registration carries
     * `priority: -1` — below the stock renderer's default 0 — and is the whole
     * integration: no Host change, no fork of the stock plugin, and the stock
     * renderer's own registration still succeeds (it stays live but shadowed).
     * The registration carries `locale: PANEL_NS` only when the composition
     * really installs a locale face (an entry naming a namespace without one throws
     * `SlotAssemblyError`); otherwise the renderer reads the injected `panelT` fallback.
     * @param ctx - the browser plugin context.
     * @param workspace - the `uiWorkspace` service (source of `openSession`).
     * @param i18n - live locale binding.
     * @returns a disposer, or `undefined` when the registration was refused.
     */
    function mountPanel(ctx, workspace, i18n) {
      const options = {
        name: 'conversation.chat.node',
        key: 'workflow-run',
        priority: -1,
        inject: () => ({
          openSession: (target) => { workspace.openSession(target) },
          panelT: i18n.t,
        }),
      }
      if (i18n.locale !== undefined) options.locale = PANEL_NS
      try {
        return ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(options, WorkflowRunPanel))
      } catch (error) {
        // A composition that keeps the stock renderer must still get its settings page:
        // the panel is a fix for a link, not a precondition for the plugin.
        console.warn(`[grok-workflow] the workflow-run task panel could not be registered (${error && error.message ? error.message : error}); the stock panel stays in place and finished rows keep their stock behaviour.`)
        return undefined
      }
    }

    // ─── Conversation View: the "进度" tab ──────────────────────────────────────
    //
    // A third tab next to the stock chat and trajectory views. It exists because the
    // stock renderer cannot show what this plugin's own recorder measures: it folds the
    // four `tool-workflow/*` events into one run node with rows, and there is no channel
    // for a task-level state (`docs/task-progress-panel.md`, P1-2: BLOCKED upstream).
    //
    // What this tab is, stated so nothing below overclaims:
    //
    // - It reads **only** the four events `src/records.ts` writes through its recorder
    //   (`run-start`, `agent-start`, `agent-end`, `run-end`). It writes nothing, sends
    //   nothing, and adds no session event of its own.
    // - It shows a fixed process spine (start → … → end) plus one real node per recorded
    //   `phase`, so every declared row is visible and a run that does not follow the
    //   template still shows what it did.
    // - Its only number is settled rows over declared rows, and both the copy and the
    //   tooltip say so. There is no ETA, no token count, no invented percentage, and a
    //   stage the events never mentioned reads `pending` rather than borrowing a
    //   neighbour's state.
    // - The detail popover resolves seven fields through an explicit ladder
    //   (stage-detail event → child coordination block → not reported) and labels the
    //   source of every row. Today's recorder emits no stage-detail event and no child
    //   text is reachable from a view, so the honest answer is the third rung; the ladder
    //   is implemented and tested so a future producer needs no rewrite.
    //
    // Registration is deliberately defensive: the tab is a bonus on top of the settings
    // page and the chat panel, so a composition without `uiConversation`/`sessions`, or a
    // registry that refuses the definition, costs the tab and nothing else — the settings
    // page says so in its status area (`status.progressMissing` / `status.progressFailed`).

    /** Registered conversation target of the progress view; namespaced so a collision throws. */
    const PROGRESS_TARGET = 'grok-progress'
    /** Node kind contributed by this bundle; namespaced for the same reason. */
    const PROGRESS_KIND = 'grok-progress-run'
    /** View tab id, second on the strip so the 390 px budget keeps it visible. */
    const PROGRESS_VIEW_ID = 'grok-progress'
    // Chat is order 0 and the trajectory view order 10; the host folds the
    // strip by width (visibleViewLimit = max(1, floor((rowWidth - 48) / 120))),
    // so 390 keeps two entries and the third rank folds into the overflow menu.
    // Order 5 puts this tab between the two stock views: one click at 390,
    // the default (null → chat) and every other rank untouched.
    const PROGRESS_VIEW_ORDER = 5
    /**
     * The eight progress and Guardian lifecycle events the tab folds; all others are ignored.
     *
     * `summary-final` belongs on this list and not only in the fold's own special case: an
     * event type the view definition does not match never reaches the tab, so a claim the
     * recorder wrote would be dropped before any folding could see it.
     */
    const PROGRESS_EVENT_TYPES = [
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
      'tool-workflow/summary-final',
      'tool-workflow/summary-rejected',
      'tool-workflow/guardian-start',
      'tool-workflow/guardian-finding',
      'tool-workflow/guardian-end',
      'tool-workflow/run-end',
    ]

    /**
     * The track's fixed spine: the process template of a staged delivery job.
     *
     * It is a template, not a claim: a stage whose token no recorded phase carries stays
     * `pending` and its tooltip says the events did not report it.
     */
    /**
     * The track's spine: this engine's own phases, in the order it runs them.
     *
     * The four work stages are the phase headers `src/naming.ts` emits — `规划` / `执行` /
     * `检查` / `汇总` (`phaseLabel`: plan, execute, verify, synthesize) —
     * plus the plan tasks the engine announces as `任务 n · 标题` (`taskGroupTitle`), which
     * are appended between `执行` and `检查` because that is where the workers run.
     * The final answer is relayed in the turn's own message,
     * never as a workflow child call, so no `回答` event can ever reach this track —
     * the spine does not list a stage no event can fill.
     *
     * A CJK token matches anywhere; a token with Latin letters must sit on word
     * boundaries, or `ui` reads inside `build`, `tag` inside `stage` and `sync` inside
     * `async` — the false hits that made the old spine report stages nobody ran.
     */
    const PROGRESS_STAGES = [
      { key: 'start', tokens: [], edge: true },
      { key: 'plan', tokens: ['规划', 'plan'], edge: false },
      { key: 'execute', tokens: ['执行', 'execute'], edge: false },
      { key: 'verify', tokens: ['检查', '核验', 'verify'], edge: false },
      { key: 'synthesize', tokens: ['汇总', 'synthesize'], edge: false },
      { key: 'end', tokens: [], edge: true },
    ]

    /**
     * The fixed per-task chain, in render order: `执行` → `检查` → `复核`
     * (`worker` → `verifier` → `supervisor`).
     *
     * A task's rows arrive as role calls, so a card can say which gates a task actually
     * reached. The chain is fixed rather than derived from what arrived: a capsule no row
     * reached renders `pending` with a dashed border, because "the verify call never ran"
     * is a fact a reader needs, and a missing capsule would hide it.
     */
    const PROGRESS_CHAIN = [
      { key: 'execute', tokens: ['执行', 'execute', 'worker'] },
      { key: 'check', tokens: ['检查', '核验', 'verify', 'check', 'verifier'] },
      { key: 'review', tokens: ['复核', 'review', 'supervisor', 'reviewer'] },
    ]

    /**
     * The optional detail payload, kept apart from `PROGRESS_EVENT_TYPES`.
     *
     * It never decides a state; it only adds field values to a node. The recorder does
     * not write it today, so a stream without it renders exactly what it rendered before
     * — but when a stream carries one, the values are used instead of being ignored.
     */
    const PROGRESS_DETAIL_EVENT_TYPE = 'tool-workflow/stage-detail'

    /**
     * The optional event that names the summary draft the run shipped.
     *
     * A chat row's label is fixed at `agent-start`, so "this draft is the final one"
     * arrives as its own fact once the gate has passed a draft. Mirror of
     * `PROGRESS_SUMMARY_FINAL_EVENT_TYPE` in `src/progress-tab.ts`; a stream without
     * it renders exactly what it rendered before.
     */
    const PROGRESS_SUMMARY_FINAL_EVENT_TYPE = 'tool-workflow/summary-final'

    /**
     * The optional event that says the gate rejected every draft, and why.
     *
     * The sibling of `summary-final`, never its alternative: a run either handed one
     * draft in or handed none. Mirror of `PROGRESS_SUMMARY_REJECTED_EVENT_TYPE` in
     * `src/progress-tab.ts`; a stream without it renders a rejected run exactly as it
     * rendered before — as a run that handed in nothing.
     */
    const PROGRESS_SUMMARY_REJECTED_EVENT_TYPE = 'tool-workflow/summary-rejected'

    /**
     * The numbered summary-draft names, this half's copy of `src/naming.ts`
     * (`synthesisDraft` + `SYNTHESIS_FINAL_MARK`), kept word for word.
     *
     * The host serves this file verbatim, so it cannot import the typed table. The mark is
     * pinned by the bilingual table in `test/i18n-parity.spec.ts` and the rendered name by
     * the final card's own assertion — neither compares back to `src/naming.ts`, so a change
     * to the naming table has to be carried across by hand.
     */
    const PROGRESS_SUMMARY_DRAFTS = {
      zh: { draft: '汇总·第{n}稿', final: '（定稿）' },
      en: { draft: 'Summarize · draft {n}', final: ' (final)' },
    }

    /** One numbered draft name, with or without the shipped-draft mark. */
    function progressSummaryDraftName(draft, language, final) {
      const copy = PROGRESS_SUMMARY_DRAFTS[language]
      return copy.draft.replace('{n}', String(draft)) + (final ? copy.final : '')
    }

    /**
     * Mark the row of the summary draft the run shipped, in place.
     *
     * That draft can have two rows — the first call and its same-draft resubmit — and
     * only the later one landed, so only the row with the highest `order` is marked.
     * A duplicate event, an event that arrives before its rows and a stream with no
     * event at all all render what they rendered before.
     */
    function progressMarkFinalDraft(members, draft) {
      for (const language of ['zh', 'en']) {
        const name = progressSummaryDraftName(draft, language, false)
        let landed
        for (const member of members) {
          if (member.label !== name) continue
          if (landed === undefined || member.order > landed.order) landed = member
        }
        if (landed === undefined) continue
        landed.label = progressSummaryDraftName(draft, language, true)
        return
      }
    }

    /** The seven fields an AGENTS.md coordination block reports, in render order. */
    const PROGRESS_DETAIL_FIELDS = ['workCommit', 'changes', 'testsRun', 'results', 'localRuntimeVerified', 'blockers', 'nextAction']

    /**
     * Every spelling of one field, folded to its canonical key.
     *
     * `AGENTS.md` labels the facts `WORK_COMMIT` / `CHANGES` / `TESTS_RUN` /
     * `TEST_RESULTS` / `LOCAL_RUNTIME_VERIFIED` / `BLOCKERS` / `NEXT_ACTION`; a JSON
     * block writes them in camelCase. Both spell the same seven facts, so a reader sees
     * one row per fact.
     */
    const PROGRESS_DETAIL_ALIASES = {
      workcommit: 'workCommit',
      changes: 'changes',
      change: 'changes',
      testsrun: 'testsRun',
      tests: 'testsRun',
      results: 'results',
      result: 'results',
      testresults: 'results',
      localruntimeverified: 'localRuntimeVerified',
      blockers: 'blockers',
      blocker: 'blockers',
      nextaction: 'nextAction',
      next: 'nextAction',
    }

    /** Fold one written field name (`WORK_COMMIT`, `workCommit`, `next_action`) to its key. */
    function progressDetailField(name) {
      if (typeof name !== 'string') return undefined
      return PROGRESS_DETAIL_ALIASES[name.toLowerCase().replace(/[^a-z0-9]/g, '')]
    }

    /**
     * The five words a run is described by, one per chip state (§19.2).
     *
     * The chip reads the run's own facts, never the size of a plan: `waiting` is an open
     * run that declared nothing yet, `running` is an open run that did, and the three
     * closed states are the engine's `stopReason` — `completed` already means "every task
     * was checked", so `done` claims no more than that.
     */
    const PROGRESS_CHIP_KEY = {
      waiting: 'progress.chip.waiting',
      running: 'progress.chip.running',
      done: 'progress.chip.done',
      failed: 'progress.chip.failed',
      cancelled: 'progress.chip.cancelled',
    }

    /**
     * The word under one step of the list, per step state.
     *
     * `blocked` is a step the run ended over without settling: it did not pass, so it
     * borrows `没过` rather than the grey "still waiting" word that would claim the page is
     * still working on it.
     */
    const PROGRESS_PLAN_KEY = {
      pending: 'progress.plan.waiting',
      doing: 'progress.plan.running',
      done: 'progress.plan.done',
      failed: 'progress.plan.failed',
      blocked: 'progress.plan.failed',
      cancelled: 'progress.plan.cancelled',
    }

    /** The word of one history line, when its own state decides it. */
    const PROGRESS_LOG_STATE_KEY = {
      pending: 'progress.log.running',
      doing: 'progress.log.running',
      done: 'progress.log.done',
      failed: 'progress.log.failed',
      blocked: 'progress.log.failed',
      cancelled: 'progress.log.cancelled',
    }

    /**
     * The word of a finished line, when the role that spoke it decides it.
     *
     * A finished `执行` did the work, a finished `检查` passed it and a finished `复核`
     * approved it: three different verbs, so one `done` word would flatten the log into a
     * column of identical sentences.
     */
    const PROGRESS_LOG_ROLE_KEY = {
      execute: 'progress.log.done',
      check: 'progress.log.passed',
      review: 'progress.log.reviewed',
    }

    /** One empty track, shared so a session with no run keeps one snapshot identity. */
    const EMPTY_PROGRESS_SNAPSHOT = { runs: [], activeRun: undefined }

    /** Narrow an unknown value to a plain record. */
    function progressRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
    }

    /** Normalize one detail value to display text; empty values count as not reported. */
    function progressFieldText(value) {
      if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed === '' ? undefined : trimmed
      }
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      if (typeof value === 'boolean') return value ? 'true' : 'false'
      if (Array.isArray(value)) {
        const parts = value.map(progressFieldText).filter((part) => part !== undefined)
        return parts.length === 0 ? undefined : parts.join(' · ')
      }
      return undefined
    }

    /** Read the known detail fields out of one record, canonicalizing the names first. */
    function progressPickFields(source) {
      const fields = {}
      for (const name of Object.keys(source)) {
        const key = progressDetailField(name)
        if (key === undefined || fields[key] !== undefined) continue
        const text = progressFieldText(source[name])
        if (text !== undefined) fields[key] = text
      }
      return fields
    }

    /**
     * Fold recorded events into runs (mirror of `foldProgressRuns` in `src/progress-tab.ts`).
     *
     * Two passes so the fold is order-insensitive: every `run-start` announces a run
     * first, then every other event is applied. Idempotent per event, and an `agent-end`
     * that arrives before its own `agent-start` still settles that row once the start
     * appears. A settlement for a row nobody declared, or an event for a run nobody
     * announced, is dropped: a row means a child call that started.
     */
    function foldProgressEvents(records) {
      const drafts = new Map()
      let index = 0
      for (const record of records) {
        const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index
        index += 1
        if (record.type !== 'tool-workflow/run-start') continue
        const data = progressRecord(record.data) || {}
        const runId = typeof data.runId === 'string' ? data.runId : undefined
        if (runId === undefined || drafts.has(runId)) continue
        drafts.set(runId, {
          runId,
          name: typeof data.name === 'string' ? data.name : '',
          anchorSeq: seq,
          members: [],
          settlements: new Map(),
          details: [],
          startedAt: record.time,
        })
      }
      index = 0
      for (const record of records) {
        const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index
        index += 1
        const data = progressRecord(record.data) || {}
        const runId = typeof data.runId === 'string' ? data.runId : undefined
        const isDetail = record.type === PROGRESS_DETAIL_EVENT_TYPE
        const isSummaryFinal = record.type === PROGRESS_SUMMARY_FINAL_EVENT_TYPE
        const isSummaryRejected = record.type === PROGRESS_SUMMARY_REJECTED_EVENT_TYPE
        if (runId === undefined || (!isDetail && !isSummaryFinal && !isSummaryRejected && PROGRESS_EVENT_TYPES.indexOf(record.type) === -1)) continue
        const draft = drafts.get(runId)
        if (draft === undefined) continue
        if (seq < draft.anchorSeq) draft.anchorSeq = seq
        if (isDetail) {
          const fields = progressPickFields(data)
          const coordinationText = typeof data.coordination === 'string' ? data.coordination : undefined
          // An empty payload is not a report: it would claim the stage was measured and
          // found blank.
          if (Object.keys(fields).length === 0 && coordinationText === undefined) continue
          draft.details.push({
            phase: typeof data.phase === 'string' ? data.phase : undefined,
            fields,
            coordinationText,
          })
          continue
        }
        if (isSummaryFinal) {
          // First valid claim wins: a duplicate is a no-op, and a later claim cannot
          // move the mark off the draft that actually shipped.
          const draftNumber = Number(data.draft)
          if (!Number.isFinite(draftNumber) || Math.trunc(draftNumber) < 1) continue
          if (draft.summaryFinalDraft === undefined) draft.summaryFinalDraft = Math.trunc(draftNumber)
          continue
        }
        if (isSummaryRejected) {
          // The same duplicate rule as `summary-final`, and the same refusal to read a
          // half-fact: a count below one, a stage that is neither word, or no reason at
          // all is dropped rather than rendered as "rejected, for some reason".
          const rejectedDrafts = Number(data.drafts)
          if (!Number.isFinite(rejectedDrafts) || Math.trunc(rejectedDrafts) < 1) continue
          if (data.stage !== 'check' && data.stage !== 'verify') continue
          const rejectedReason = typeof data.reason === 'string' ? data.reason.trim() : ''
          if (rejectedReason === '') continue
          if (draft.summaryRejected === undefined) {
            draft.summaryRejected = { drafts: Math.trunc(rejectedDrafts), stage: data.stage, reason: rejectedReason }
          }
          continue
        }
        if (record.type === 'tool-workflow/guardian-start') {
          const previous = draft.guardian
          const budget = Number(data.budgetMs)
          draft.guardian = {
            started: true,
            armed: data.armed === true,
            budgetMs: Number.isFinite(budget) && budget > 0 ? Math.trunc(budget) : 0,
            ended: previous === undefined ? false : previous.ended,
            cancelled: previous === undefined ? false : previous.cancelled,
            findings: previous === undefined ? [] : previous.findings,
          }
          continue
        }
        if (record.type === 'tool-workflow/guardian-finding') {
          const memberSeq = Number(data.seq)
          if (!Number.isFinite(memberSeq)) continue
          const guardian = draft.guardian || {
            started: false, armed: false, budgetMs: 0, ended: false, cancelled: false, findings: [],
          }
          guardian.findings.push({
            seq: memberSeq,
            label: typeof data.label === 'string' ? data.label : '',
            signal: data.signal === 'heartbeat-loss' ? 'heartbeat-loss' : 'timeout',
            action: data.action === 'rescue' ? 'rescue' : data.action === 'cancel-run' ? 'cancel-run' : 'observe',
            reason: typeof data.reason === 'string' ? data.reason : '',
            atMs: Number.isFinite(data.atMs) ? data.atMs : undefined,
          })
          draft.guardian = guardian
          continue
        }
        if (record.type === 'tool-workflow/guardian-end') {
          const previous = draft.guardian || {
            started: false, armed: false, budgetMs: 0, ended: false, cancelled: false, findings: [],
          }
          draft.guardian = { ...previous, ended: true, cancelled: data.cancelled === true }
          continue
        }
        if (record.type === 'tool-workflow/agent-start') {
          const memberSeq = Number(data.seq)
          if (!Number.isFinite(memberSeq)) continue
          if (draft.members.some((member) => member.seq === memberSeq)) continue
          draft.members.push({
            seq: memberSeq,
            label: typeof data.label === 'string' ? data.label : '',
            phase: typeof data.phase === 'string' ? data.phase : undefined,
            childId: typeof data.childId === 'string' ? data.childId : '',
            order: draft.members.length,
            startedAt: record.time,
          })
          continue
        }
        if (record.type === 'tool-workflow/agent-end') {
          const memberSeq = Number(data.seq)
          if (!Number.isFinite(memberSeq)) continue
          // Last settlement wins; repeating one event cannot change it twice.
          draft.settlements.set(memberSeq, typeof data.outcome === 'string' ? data.outcome : 'failed')
          const member = draft.members.find((candidate) => candidate.seq === memberSeq)
          if (member !== undefined) member.endedAt = record.time
          continue
        }
        if (record.type !== 'tool-workflow/run-end') continue
        if (draft.stopReason === undefined) {
          draft.stopReason = typeof data.stopReason === 'string' ? data.stopReason : 'error'
          draft.endedAt = record.time
        }
      }
      const runs = []
      for (const draft of drafts.values()) {
        for (const member of draft.members) {
          if (member.outcome === undefined && draft.settlements.has(member.seq)) member.outcome = draft.settlements.get(member.seq)
        }
        if (draft.summaryFinalDraft !== undefined) progressMarkFinalDraft(draft.members, draft.summaryFinalDraft)
        runs.push({
          runId: draft.runId,
          name: draft.name,
          anchorSeq: draft.anchorSeq,
          members: draft.members,
          details: draft.details,
          guardian: draft.guardian,
          startedAt: draft.startedAt,
          endedAt: draft.endedAt,
          stopReason: draft.stopReason,
          summaryFinalDraft: draft.summaryFinalDraft,
          summaryRejected: draft.summaryRejected,
        })
      }
      return runs.sort((left, right) => left.anchorSeq - right.anchorSeq)
    }

    /**
     * The active run: the newest announced one, preferring a still-open run on a tie.
     * @param runs - folded runs.
     * @returns the run to render, or `undefined` when the session has none.
     */
    function selectActiveRun(runs) {
      let best
      for (const run of runs) {
        if (best === undefined) { best = run; continue }
        if (run.anchorSeq > best.anchorSeq) { best = run; continue }
        if (run.anchorSeq === best.anchorSeq && best.stopReason !== undefined && run.stopReason === undefined) best = run
      }
      return best
    }

    /**
     * The label a retry adds, taken back off: `<role>（尝试 2）` / `<role> (attempt 2)` → `<role>`.
     *
     * `naming.ts` `memberLabel` appends the attempt suffix and nothing else, so dropping a
     * trailing bracketed run that carries a digit folds the attempts of one call onto one
     * lane without re-parsing roles here.
     */
    function progressAttemptBaseLabel(label) {
      const text = typeof label === 'string' ? label.trim() : ''
      const match = /^(.*?)\s*[（(][^（()）]*\d[^（()）]*[)）]$/u.exec(text)
      if (match === null) return text
      return (match[1] || '').trim()
    }

    /**
     * The unit one row belongs to: one task's one role call, across its attempts.
     *
     * Same phase and same role lane is the same unit — that is what a retry keeps
     * (`任务 2 · 标题` + `执行` on every attempt), and two tasks differ by their phase, so
     * one task's completion can never mark another task's failure recovered.
     */
    function progressAttemptUnit(member) {
      const phase = member.phase === undefined ? '' : member.phase
      return `${phase}\u0000${progressAttemptBaseLabel(member.label)}`
    }

    /**
     * The rows whose failure a later attempt of the same unit has already replaced.
     *
     * Red means "still broken now", so a failure is current only while nothing later in
     * its own unit settled `completed`. A later attempt still running has not recovered
     * it, and a completion in another unit does not touch it. The row keeps its own mark.
     * @param members - rows aggregated by one node.
     * @returns the `seq` of every recovered failure row.
     */
    function progressRecoveredFailures(members) {
      const recovered = new Set()
      for (const member of members) {
        if (member.outcome !== 'failed') continue
        const unit = progressAttemptUnit(member)
        for (const later of members) {
          if (later.order <= member.order) continue
          if (later.outcome !== 'completed') continue
          if (progressAttemptUnit(later) !== unit) continue
          recovered.add(member.seq)
          break
        }
      }
      return recovered
    }

    /**
     * How many of a node's rows are failing now — recovered history excluded.
     * @param members - rows aggregated by one node.
     * @returns the number of unrecovered failed rows.
     */
    function progressCurrentFailureCount(members) {
      const recovered = progressRecoveredFailures(members)
      let count = 0
      for (const member of members) {
        if (member.outcome === 'failed' && !recovered.has(member.seq)) count += 1
      }
      return count
    }

    /**
     * State of one stage, in the fixed precedence
     * `failed` → `doing` → `done` → `blocked` → `cancelled` → `pending`.
     *
     * `failed` is a *current* failure: a row whose failure a later attempt of the same
     * unit replaced no longer colours the aggregate, because red has to mean "still
     * broken now". The row keeps its own red mark; only the aggregate clears.
     *
     * `blocked` is derived (a run that ended over a row it never settled, or an outcome
     * that is neither a completion nor a cancellation) and the tooltip names the evidence;
     * `cancelled` is the engine's own word, never derived from an absence.
     */
    function progressNodeState(members, ended) {
      const recovered = progressRecoveredFailures(members)
      const current = recovered.size === 0 ? members : members.filter((member) => !recovered.has(member.seq))
      const settled = current.filter((member) => member.outcome !== undefined)
      const unsettled = current.length - settled.length
      if (settled.some((member) => member.outcome === 'failed')) return 'failed'
      if (!ended && unsettled > 0) return 'doing'
      if (settled.length > 0 && settled.length === current.length && settled.every((member) => member.outcome === 'completed')) return 'done'
      if (ended && unsettled > 0) return 'blocked'
      if (settled.some((member) => member.outcome === 'cancelled')) return 'cancelled'
      if (settled.some((member) => member.outcome !== 'completed' && member.outcome !== 'cancelled')) return 'blocked'
      return 'pending'
    }

    /** Why a `blocked` stage reads blocked, so its tooltip can name the evidence. */
    function progressBlockedReason(members, ended) {
      const unsettled = members.length - members.filter((member) => member.outcome !== undefined).length
      return ended && unsettled > 0 ? 'runEndedUnsettled' : 'outcomeUnsettled'
    }

    /** Rows settled over rows declared; absent when nothing was declared. */
    function progressPercent(members) {
      const declared = members.length
      if (declared === 0) return undefined
      const settled = members.filter((member) => member.outcome !== undefined).length
      return { settled, declared, value: Math.round((settled / declared) * 100) }
    }

    /** Whether one character can continue a Latin word (so a token boundary is not here). */
    function progressWordChar(character) {
      return character !== '' && /[a-z0-9_]/i.test(character)
    }

    /**
     * Whether one phase header carries one stage token.
     *
     * A CJK-only token matches anywhere (`规划` in `任务 1 · 规划`); a token with Latin
     * letters must sit on word boundaries, because a loose test reads `ui` inside
     * `build`, `tag` inside `stage`/`target` and `sync` inside `async`.
     */
    function progressPhaseCarriesToken(haystack, token) {
      const needle = token.toLowerCase()
      if (needle === '') return false
      if (!/[a-z0-9]/i.test(needle)) return haystack.indexOf(needle) !== -1
      let from = 0
      for (;;) {
        const at = haystack.indexOf(needle, from)
        if (at === -1) return false
        const before = at === 0 ? '' : haystack.slice(at - 1, at)
        const after = haystack.slice(at + needle.length, at + needle.length + 1)
        if (!progressWordChar(before) && !progressWordChar(after)) return true
        from = at + 1
      }
    }

    /** The first spine stage whose token the phase header carries.
     *
     * Numbered plan tasks (`任务 7 · 标题`) always win over stage tokens: a title
     * that mentions a stage word (`任务 7 · 合并为干净可并发执行计划`) names a plan
     * task, not the `执行` stage. Without this, the extra task lands as a stage
     * row under `规划`. Mirror of `stageForPhase` in `src/progress-tab.ts`.
     */
    function progressStageForPhase(phase) {
      if (progressTaskNumber(phase) !== undefined) return undefined
      const haystack = phase.toLowerCase()
      for (const stage of PROGRESS_STAGES) {
        if (stage.edge) continue
        for (const token of stage.tokens) {
          if (progressPhaseCarriesToken(haystack, token)) return stage
        }
      }
      return undefined
    }

    /**
     * Role labels that name a work stage when the phase header does not.
     *
     * A recorded `agent-start` carries the plan-task group title (`任务 1 · 标题`) as the
     * phase of the worker and verifier calls that run inside a task, so matching rows by
     * phase alone left `执行` and `检查` empty and "not reported". These words are role
     * names from `naming.ts`, matched only against a row's label: a task titled
     * `check the build` must not become `检查` because of its own title.
     */
    const PROGRESS_STAGE_ROLE_LABELS = {
      plan: ['规划助手', '规划', 'planner'],
      execute: ['执行', 'execute', 'worker'],
      verify: ['检查', '核验', 'verify', 'check', 'verifier'],
      synthesize: ['汇总助手', '汇总', 'summarize', 'synthesizer'],
    }

    /** The first spine stage whose role label names it, if a label names one. */
    function progressStageForRoleLabel(label) {
      const haystack = label.toLowerCase()
      for (const stage of PROGRESS_STAGES) {
        const labels = PROGRESS_STAGE_ROLE_LABELS[stage.key]
        if (labels === undefined) continue
        for (const token of labels) {
          if (progressPhaseCarriesToken(haystack, token)) return stage
        }
      }
      return undefined
    }

    /** The first chain capsule whose role label names it, if a label names one. */
    function progressChainForLabel(label) {
      const haystack = label.toLowerCase()
      for (const slot of PROGRESS_CHAIN) {
        for (const token of slot.tokens) {
          if (progressPhaseCarriesToken(haystack, token)) return slot
        }
      }
      return undefined
    }

    /**
     * The fixed chain of one task card (mirror of `chainOf` in `src/progress-tab.ts`).
     *
     * Three capsules, always all three: an unreached one is part of the answer
     * (`reached: false`, `pending`), never a gap. A row whose label names no capsule stays
     * in the card's `members` and renders after the chain, so no declared row is dropped.
     * @param members - the card's rows, in plan order.
     * @param ended - whether `run-end` was seen, which turns an unsettled capsule into `blocked`.
     * @returns one slot per chain step.
     */
    function progressChainOf(members, ended) {
      const bySlot = new Map()
      for (const member of members) {
        const slot = progressChainForLabel(member.label === undefined ? '' : member.label)
        if (slot === undefined) continue
        const list = bySlot.get(slot.key)
        if (list === undefined) bySlot.set(slot.key, [member])
        else list.push(member)
      }
      return PROGRESS_CHAIN.map((slot) => {
        const rows = bySlot.get(slot.key) === undefined ? [] : bySlot.get(slot.key)
        return {
          key: slot.key,
          members: rows,
          state: rows.length === 0 ? 'pending' : progressNodeState(rows, ended),
          reached: rows.length > 0,
        }
      })
    }

    /**
     * The plan-task position a phase header names (`任务 3 · 标题` → 3, `Task 10 · x` → 10).
     *
     * The number the engine puts in `taskGroupTitle`, read back as a number so `任务 10`
     * sorts after `任务 2` instead of before it.
     * @param phase - the recorded phase header.
     * @returns the position, or undefined when the header names none.
     */
    function progressTaskNumber(phase) {
      if (typeof phase !== 'string') return undefined
      const match = /^\s*(?:任务|task)\s*(\d+)/iu.exec(phase)
      if (match === null) return undefined
      const value = Number(match[1])
      return Number.isInteger(value) && value > 0 ? value : undefined
    }

    /**
     * Whether a recorded phase (or label) names the guardian adjudication call.
     *
     * Anchored on purpose: the guardian card's phase is exactly `Guardian`, while a plan
     * task that merely mentions the guardian in its title (`任务 1 · Guardian 判停`) is
     * still a plan task.
     * @param text - a phase header or a row label.
     * @returns whether this is the guardian card.
     */
    function progressIsGuardianCard(text) {
      if (typeof text !== 'string') return false
      return /^(?:guardian|守卫)/iu.test(text.trim())
    }

    /**
     * Order the task band (mirror of `orderTaskCards` in `src/progress-tab.ts`).
     *
     * 1. numbered cards sort by number, refilling only the slots numbered cards hold;
     * 2. the guardian card sits after the numbered cards;
     * 3. an unnumbered card keeps the position it arrived in.
     * @param cards - the band's cards, in arrival order.
     * @returns the cards in render order.
     */
    function orderProgressTaskCards(cards) {
      const ordered = cards.slice()
      const numbered = ordered
        .map((card, index) => ({ card, index, number: progressTaskNumber(card.phase) }))
        .filter((entry) => entry.number !== undefined)
      numbered.sort((left, right) => left.number - right.number || left.index - right.index)
      numbered.forEach((entry, position) => { ordered[entry.index] = numbered[position].card })
      const guardianAt = ordered.findIndex((card) => progressIsGuardianCard(card.phase))
      const lastNumbered = ordered.reduce((last, card, index) => (progressTaskNumber(card.phase) === undefined ? last : index), -1)
      if (guardianAt !== -1 && lastNumbered !== -1 && guardianAt < lastNumbered) {
        const guardian = ordered.splice(guardianAt, 1)[0]
        if (guardian !== undefined) ordered.splice(lastNumbered, 0, guardian)
      }
      return ordered
    }

    /**
     * Derive the track one run renders (mirror of `deriveTrack` in `src/progress-tab.ts`).
     * @param run - folded run facts, or `undefined`.
     * @param labelFor - copy resolver for the spine's stage labels.
     * @returns the track model, or `undefined` when there is no run.
     */
    function deriveProgressTrack(run, labelFor) {
      if (run === undefined) return undefined
      const ended = run.stopReason !== undefined
      const byStage = new Map()
      const byStagePhases = new Map()
      const evidenceByStage = new Map()
      const extras = []
      const unphased = []
      for (const member of run.members) {
        const phase = member.phase
        if (phase === undefined) { unphased.push(member); continue }
        const stage = progressStageForPhase(phase)
        if (stage === undefined) {
          const existing = extras.find((entry) => entry.phase === phase)
          if (existing === undefined) extras.push({ phase, members: [member] })
          else existing.members.push(member)
          // The row keeps its plan-task node above; this only cross-references it onto
          // the stage whose role ran it, so `执行`/`检查` report what happened.
          const roleStage = progressStageForRoleLabel(member.label === undefined ? '' : member.label)
          if (roleStage !== undefined) {
            const evidence = evidenceByStage.get(roleStage.key)
            if (evidence === undefined) evidenceByStage.set(roleStage.key, [member])
            else evidence.push(member)
          }
          continue
        }
        const list = byStage.get(stage.key)
        if (list === undefined) {
          byStage.set(stage.key, [member])
          byStagePhases.set(stage.key, [phase])
        } else {
          list.push(member)
          const phases = byStagePhases.get(stage.key)
          if (phases.indexOf(phase) === -1) phases.push(phase)
        }
      }
      /** The two ends report the run's own facts, not a member's. */
      const edgeState = (stageKey) => {
        if (stageKey === 'start') return 'done'
        if (!ended) return 'doing'
        if (run.stopReason === 'cancelled') return 'cancelled'
        if (run.stopReason === 'completed') return 'done'
        return 'failed'
      }
      /** Level-1 payloads by the phase they name; a phase-less one is the run's fallback. */
      const detailByPhase = new Map()
      let runDetail
      for (const detail of Array.isArray(run.details) ? run.details : []) {
        if (detail === undefined || detail === null) continue
        if (detail.phase === undefined) { runDetail = detail; continue }
        if (!detailByPhase.has(detail.phase)) detailByPhase.set(detail.phase, detail)
      }
      const detailOf = (phases) => {
        for (const phase of phases) {
          const detail = detailByPhase.get(phase)
          if (detail !== undefined) return detail
        }
        return undefined
      }
      const node = (stage, key, kind, members, phases, label, evidence) => {
        // A stage's own rows are authoritative; its evidence speaks only when it has none.
        const rows = members.length > 0 ? members : (evidence === undefined ? [] : evidence)
        const state = stage !== undefined && stage.edge ? edgeState(stage.key) : progressNodeState(rows, ended)
        const reason = state === 'blocked' ? progressBlockedReason(rows, ended) : undefined
        return {
          key,
          kind,
          label: label !== undefined ? label : (stage === undefined ? key : labelFor(stage.key)),
          state,
          members,
          evidence: evidence === undefined ? [] : evidence,
          phases,
          derived: state === 'blocked',
          reason,
          stageDetail: detailOf(phases),
        }
      }
      /** One task-band card: a plan task, or the guardian call, with its own fixed chain. */
      const cardNode = (card) => {
        const phases = card.phase === '' ? [] : [card.phase]
        const base = node(undefined, `phase:${card.phase}`, 'extra', card.members, phases, card.phase)
        if (progressIsGuardianCard(card.phase)) return { ...base, guardian: true }
        const taskNumber = progressTaskNumber(card.phase)
        return {
          ...base,
          ...taskNumber === undefined ? {} : { taskNumber },
          chain: progressChainOf(card.members, ended),
        }
      }
      const nodes = []
      for (const stage of PROGRESS_STAGES) {
        nodes.push(node(stage, `stage:${stage.key}`, stage.edge ? 'edge' : 'stage', byStage.get(stage.key) || [], byStagePhases.get(stage.key) || [], undefined, evidenceByStage.get(stage.key) || []))
        // Extra phases are real plan tasks (`任务 n · 标题`) announced while the engine
        // executes the plan, so they sit between `执行` and `检查` — the template's work
        // slot. A row that declared no phase still gets a node, so the track and the
        // percentage never count different rows. Numbered tasks sort by number, then the
        // guardian card, then whatever named no number where it arrived.
        if (stage.key === 'execute') {
          const band = extras.slice()
          if (unphased.length > 0) band.push({ phase: '', members: unphased })
          for (const card of orderProgressTaskCards(band)) nodes.push(cardNode(card))
        }
      }
      return {
        runId: run.runId,
        name: run.name,
        ended,
        stopReason: run.stopReason,
        nodes,
        percent: progressPercent(run.members),
        stageDetail: runDetail,
      }
    }

    /**
     * The 1-based attempt a label names (`执行（尝试 2）` → 2), and 1 when it names none.
     *
     * Mirror of `attemptNumberOf` in `src/progress-tab.ts`: one trailing bracketed word
     * that carries a number is the attempt suffix `naming.ts` appends, and nothing else.
     */
    function progressAttemptNumber(label) {
      const text = typeof label === 'string' ? label.trim() : ''
      const match = /[（(][^（()）]*?(\d+)[^（()）]*[)）]$/u.exec(text)
      if (match === null) return 1
      const value = Number(match[1])
      return Number.isInteger(value) && value > 0 ? value : 1
    }

    /**
     * A label with its shipped-draft mark taken off.
     *
     * The mark says what the *row* is (the draft the gate shipped), not what role spoke, so
     * it must not end up in the role column beside the `交卷` word that already says it.
     */
    function progressWithoutFinalMark(text) {
      for (const language of ['zh', 'en']) {
        const mark = PROGRESS_SUMMARY_DRAFTS[language].final
        for (const suffix of [mark, mark.trim()]) {
          if (suffix === '' || text.slice(-suffix.length) !== suffix) continue
          return text.slice(0, text.length - suffix.length).trim()
        }
      }
      return text
    }

    /** The role a log line is spoken as: `执行（尝试 2）` → `执行`, `汇总·第2稿（定稿）` → `汇总·第2稿`. */
    function progressStoryRole(member) {
      return progressWithoutFinalMark(progressAttemptBaseLabel(member.label))
    }

    /**
     * The state of one declared call (mirror of `rowState`).
     *
     * A row is the smallest thing the stream settles, so its state is its own outcome and
     * nothing else: an unsettled row is `doing`, and an outcome that is neither a
     * completion, a cancellation nor a failure stays `blocked` rather than being renamed.
     */
    function progressRowState(member) {
      if (member.outcome === undefined) return 'doing'
      if (member.outcome === 'completed') return 'done'
      if (member.outcome === 'cancelled') return 'cancelled'
      if (member.outcome === 'failed') return 'failed'
      return 'blocked'
    }

    /**
     * One declared call, as the page's own history line.
     *
     * The history and a task row's opened detail read the same declaration, so both take
     * their line from here: a second mapping would let the detail describe a call
     * differently from the log it expands.
     * @param member - one declared call of the run.
     * @param shipped - the row `summary-final` named, when the stream named one.
     * @returns the story's log row for that call.
     */
    function progressStoryLogRow(member, shipped) {
      return {
        seq: member.seq,
        ...member.startedAt === undefined ? {} : { at: member.startedAt },
        role: progressStoryRole(member),
        title: member.phase === undefined ? '' : member.phase,
        state: progressRowState(member),
        ...member === shipped ? { shipped: true } : {},
      }
    }

    /**
     * The row `summary-final` names, read back off the rows the fold already marked.
     *
     * The fold writes the mark onto the row that landed (the highest `order` of that draft
     * name, in whichever language the label was written), so matching the marked name is
     * the same fact rather than a second guess at it. A stream whose rows were never
     * marked — the bare draft name is all it carries — still names its row here.
     */
    function progressShippedRow(members, draft) {
      const latestNamed = (name) => {
        let named
        for (const member of members) {
          if (member.label !== name) continue
          if (named === undefined || member.order > named.order) named = member
        }
        return named
      }
      for (const language of ['zh', 'en']) {
        const marked = latestNamed(progressSummaryDraftName(draft, language, true))
        if (marked !== undefined) return marked
      }
      for (const language of ['zh', 'en']) {
        const bare = latestNamed(progressSummaryDraftName(draft, language, false))
        if (bare !== undefined) return bare
      }
      return undefined
    }

    /**
     * The five legs a call can speak as, in the order they are tried (contract §3).
     *
     * The table is `FLOW_LEG_TOKENS` in `src/progress-tab.ts`, word for word and in the same
     * order, because the two halves are compared through fixtures and not through an import:
     * `execute` → `check` → `review` keeps `PROGRESS_CHAIN`'s own precedence (a word both
     * `check` and `review` could claim lands on the gate it belongs to), the longer word comes
     * first inside a kind so `规划助手` reads as the planner before `规划` is tried, and the
     * bare `plan` is what an English boundary call is called — matched on a word boundary, so
     * it never reads the `plan` inside `planner`.
     */
    const PROGRESS_FLOW_LEGS = [
      { kind: 'plan', tokens: ['规划助手', '规划', 'planner', 'plan'] },
      { kind: 'execute', tokens: ['执行', 'execute', 'worker'] },
      { kind: 'check', tokens: ['检查', '核验', 'check', 'verifier', 'verify'] },
      { kind: 'review', tokens: ['复核', 'review', 'supervisor', 'reviewer'] },
      { kind: 'summarize', tokens: ['汇总助手', '汇总', 'summarize', 'synthesizer'] },
    ]

    /** The word each leg (and each end) is called by on the page. */
    const PROGRESS_FLOW_WORD_KEY = {
      start: 'progress.flow.start',
      plan: 'progress.flow.plan',
      execute: 'progress.flow.execute',
      check: 'progress.flow.check',
      review: 'progress.flow.review',
      summarize: 'progress.flow.summarize',
      end: 'progress.flow.end',
    }

    /**
     * The leg one call speaks as, read off its own **label**.
     *
     * Never off its phase: a phase names the task the call ran inside, so two different legs
     * of one task share a phase. The label is the role word `naming.ts` writes, and it is the
     * only field that says which leg ran.
     * @param label - the call's recorded label.
     * @returns the leg's kind, or `undefined` when the label names none.
     */
    function progressFlowLegOf(label) {
      if (typeof label !== 'string' || label === '') return undefined
      const haystack = label.toLowerCase()
      for (const leg of PROGRESS_FLOW_LEGS) {
        for (const token of leg.tokens) {
          if (progressPhaseCarriesToken(haystack, token)) return leg.kind
        }
      }
      return undefined
    }

    /**
     * The first whole number a label carries: that visit's own number.
     *
     * `规划（第2次）` → 2, `汇总·第2稿` → 2, `执行（尝试 2）` → 2, `执行` → none. A zero is not a
     * visit, so it reads as none and the node falls back to the visit already open.
     * @param label - the call's recorded label.
     * @returns the number, or `undefined` when the label carries none.
     */
    function progressFlowNumber(label) {
      if (typeof label !== 'string') return undefined
      const match = /\d+/u.exec(label)
      if (match === null) return undefined
      const value = Number(match[0])
      return Number.isInteger(value) && value > 0 ? value : undefined
    }

    /**
     * Derive one run's flowchart (mirror of `deriveProgressFlow` in `src/progress-tab.ts`).
     *
     * The page is a walk: a start, one node per leg in the order the calls were declared, and
     * an end. A leg's calls gather under one node until another leg — or the same leg with a
     * different visit number — takes over, so a retry shows as the second node of its leg
     * instead of folding back into the attempt that failed. The guardian's own call is not a
     * leg of the work (its panel is the whole answer), and a call that names no leg stays
     * inside the node the run has already reached rather than vanishing from the page.
     *
     * `at` is the one node the page highlights: the node holding the open call the page is
     * waiting on, else the end once everything settled, else the first broken node of a run
     * that ended broken. A run with nothing declared highlights its start, because the end is
     * a place it has not reached.
     *
     * The field names are the typed half's, verbatim (§2): the host serves this file, so the
     * two copies cannot import each other and `test/client.spec.ts` compares them through the
     * same fixtures.
     * @param run - folded run facts.
     * @returns the flow model.
     */
    function deriveProgressFlow(run) {
      const ended = run.stopReason !== undefined
      const state = !ended
        ? (run.members.length === 0 ? 'waiting' : 'running')
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
      const start = { key: 'flow:start', kind: 'start', ordinal: 0, state: 'done', members: [] }
      const middle = []
      for (const member of [...run.members].sort((left, right) => left.seq - right.seq)) {
        // The guardian's own call has its own panel: it is not a leg of the work.
        if (progressIsGuardianCard(typeof member.label === 'string' ? member.label : '')) continue
        const kind = progressFlowLegOf(member.label)
        if (kind === undefined) {
          // A declared call that names no leg keeps its place: it belongs to the node the run
          // has already reached, and before any leg exists that node is the start.
          const target = middle.length === 0 ? start : middle[middle.length - 1]
          target.members.push(member)
          continue
        }
        const number = progressFlowNumber(member.label)
        const previous = middle.length === 0 ? undefined : middle[middle.length - 1]
        if (previous !== undefined && previous.kind === kind && (number === undefined || number === previous.ordinal)) {
          previous.members.push(member)
          continue
        }
        const ordinal = number === undefined
          ? (previous !== undefined && previous.kind === kind ? previous.ordinal : 1)
          : number
        middle.push({ key: `flow:${middle.length}:${kind}:${ordinal}`, kind, ordinal, members: [member] })
      }
      const endState = run.stopReason === undefined
        ? 'pending'
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
      const nodes = [start, ...middle, { key: 'flow:end', kind: 'end', ordinal: 0, state: endState, members: [] }]
      // The parent's colour is read off the whole group *before* the split below, so that
      // handing its numbered rows to task cells cannot change what the leg says about
      // itself: one leg, one state, whatever it walked.
      for (const node of middle) node.state = progressNodeState(node.members, ended)
      // A work leg's rows name the plan task they ran for (`任务 3 · 标题`): those rows hang
      // under the leg as one cell per task, in task order, and the leg keeps only the rows
      // that name no task. A leg whose rows name none keeps exactly the shape it had — no
      // field, not an empty list — because "no plan tasks here" is said by the absence.
      for (const node of middle) {
        if (node.kind !== 'execute' && node.kind !== 'check' && node.kind !== 'review') continue
        const buckets = new Map()
        const loose = []
        for (const member of node.members) {
          const number = progressTaskNumber(member.phase)
          if (number === undefined) { loose.push(member); continue }
          const rows = buckets.get(number)
          if (rows === undefined) buckets.set(number, [member])
          else rows.push(member)
        }
        if (buckets.size === 0) continue
        node.subs = [...buckets.keys()].sort((left, right) => left - right).map((number) => {
          const rows = [...buckets.get(number)].sort((left, right) => left.seq - right.seq)
          const head = rows[0]
          // The title is the phase the recorder wrote, verbatim: it is a plan task's own
          // name, so nothing here shortens, translates or re-words it. A row that carries no
          // phase falls back to its label, and one that carries neither stays empty.
          const title = typeof head.phase === 'string'
            ? head.phase
            : (typeof head.label === 'string' ? head.label : '')
          return {
            key: `${node.key}:t${number}`,
            taskNumber: number,
            title,
            state: progressNodeState(rows, ended),
            members: rows,
          }
        })
        node.members = loose
      }
      // A run whose gate turned every draft back has no `summary-final` row, but the page
      // must still say why. Mirror of `deriveProgressFlow` in `src/progress-tab.ts`: the
      // verdict lands on the summary leg's node — which goes amber by the same `data-state`
      // every other failed node uses — and is read only when that node is opened. A shipped
      // draft wins over a rejected claim: the recorder never writes both, a hand-written
      // stream could, and the page must not deny a draft the run really shipped.
      const rejected = run.summaryFinalDraft === undefined ? run.summaryRejected : undefined
      if (rejected !== undefined) {
        let last = -1
        for (let index = 0; index < nodes.length; index++) if (nodes[index].kind === 'summarize') last = index
        if (last === -1) {
          // A summary that ran inside the parent (`model` strategy) declares no call, so no
          // row named the leg. It still ran, so it gets the node it lacked, with no calls of
          // its own and the verdict on it: `total` gains the step the run really took and
          // `at` stops here, the steps after a failure staying counted and unreached.
          nodes.splice(nodes.length - 1, 0, {
            key: `flow:${middle.length}:summarize:1`,
            kind: 'summarize',
            ordinal: 1,
            state: 'failed',
            members: [],
            rejected,
          })
        } else {
          // The last visit is the one the verdict closed: marking every draft's node would
          // put the reader's place back on the first draft, which is not where the run stopped.
          nodes[last] = { ...nodes[last], state: 'failed', rejected }
        }
      }
      const total = nodes.length
      const open = [...run.members]
        .filter((member) => member.outcome === undefined)
        .sort((left, right) => left.seq - right.seq)[0]
      let at = total
      if (open !== undefined) {
        // The open row is the reader's place, wherever it hangs: on the leg itself, or in
        // one of the task cells under it. The number this yields is unchanged either way.
        const owner = nodes.findIndex((node) => node.members.some((member) => member.seq === open.seq)
          || (node.subs !== undefined && node.subs.some((sub) => sub.members.some((member) => member.seq === open.seq))))
        at = owner === -1 ? total : owner + 1
      } else if (ended) {
        const broken = nodes.findIndex((node) => node.state === 'failed' || node.state === 'blocked')
        at = broken === -1 ? total : broken + 1
      }
      // Nothing declared and nothing ended: the start is where this run is, not the end it
      // has not reached.
      if (middle.length === 0 && !ended) at = 1
      const shipped = run.summaryFinalDraft === undefined ? undefined : progressShippedRow(run.members, run.summaryFinalDraft)
      return {
        state,
        nodes,
        at,
        total,
        remaining: total - at,
        ...run.summaryFinalDraft === undefined || shipped === undefined
          ? {}
          : { final: { draft: run.summaryFinalDraft, seq: shipped.seq } },
      }
    }

    /** The width the panel starts from before it has measured its own column. */
    const PANEL_DEFAULT_WIDTH = 720

    /**
     * The gap between two columns, and between two cards stacked inside one column.
     *
     * The column gap is also where every wire turns: its centre is the one x a fork's or a
     * join's vertical run may occupy, which is what draws the bar over the branches. Every
     * wire changes column by exactly one gap, so no vertical has to cross a card.
     */
    const PANEL_COLUMN_GAP = 48
    const PANEL_SIBLING_GAP = 14
    /** Below this the graph is one column, whatever the labels measure. */
    const PANEL_STACK_WIDTH = 720

    // WHY no JS breakpoint for the opened list any more: both widths share the sheet under
    // the figure, so there is nothing left to pick by width. The stylesheet keeps its own
    // 720 copy for wrapping cards; the list no longer reads it. `matchMedia` is not read
    // anywhere on this page now.

    // A phone's siblings sit closer than two layers do (26 / 30), so one leg's branches read
    // as one branch.

    /**
     * The band under the figure a wire takes when it has to skip a column.
     *
     * A vertical run may only stand in a column gap, and a skipped column offers none — so an
     * edge that jumps a level (a task with nothing recorded under it, say) goes under the
     * whole figure instead of through the cards it passes.
     */
    const PANEL_BYPASS = 10

    /** The width band and the one-row height of each shape the mermaid text can draw. */
    const PANEL_BOX = {
      stadium: { min: 88, max: 120, h: 32 },
      round: { min: 160, max: 240, h: 56 },
      rect: { min: 110, max: 190, h: 30 },
    }

    /**
     * A card that carries a second row is taller than its shape alone says.
     *
     * The second row is one of two things: the six ring lights a task carries (or 验收's five
     * checks), or a capsule's own badge. Either way the height has to be known before the page
     * measured anything, because the wires land on the boxes the defaults stand in for.
     */
    const PANEL_LIGHT_HEIGHT = 56
    const PANEL_BADGE_ROW_HEIGHT = 48

    /**
     * The seven levels the fork is drawn in, left to right: 起点 → 规划 → 任务 → 子任务 →
     * 汇合 → 验收 → 终点.
     *
     * A level is a column of the picture and a step number in the one sentence above it: the
     * headline's `at` is the level the reader stands on, which is why `total` is a constant
     * rather than a count of the calls somebody recorded (contract §26).
     */
    const PANEL_LEVELS = 7

    /** The six lights every task card carries, in the order the operator's brief draws them. */
    const PANEL_RING_KEYS = ['plan', 'execute', 'check', 'review', 'accept', 'summarize']

    /** The five verification lights the acceptance card carries, in reading order. */
    const PANEL_CHECK_KEYS = ['machine', 'model', 'isolated', 'human', 'ledger']

    /**
     * The words that light the three screens no leg word says.
     *
     * `machine` and `model` are read off the leg table (`检查` / `复核`), so only the screens a
     * run reports in its own words need a list of their own: a label or a phase that carries
     * one of these lights that light. A Latin word matches as a prefix, because the runs write
     * `soak` and `reconciliation` beside the Chinese words; a CJK word matches anywhere, the
     * boundary rule `progressPhaseCarriesToken` already applies.
     */
    const PANEL_CHECK_SCREENS = {
      isolated: ['真机', '隔离', 'soak', 'isolated'],
      human: ['人验', '人工', 'human'],
      ledger: ['对账', '核对', 'reconcil'],
    }

    /** Whether one recorded string carries one of these words. */
    function panelScreenCarries(text, tokens) {
      const haystack = typeof text === 'string' ? text.toLowerCase() : ''
      if (haystack === '') return false
      for (const token of tokens) {
        const needle = token.toLowerCase()
        if (!/[a-z0-9]/i.test(needle)) {
          if (haystack.indexOf(needle) !== -1) return true
          continue
        }
        let from = 0
        for (;;) {
          const at = haystack.indexOf(needle, from)
          if (at === -1) break
          if (!progressWordChar(at === 0 ? '' : haystack.slice(at - 1, at))) return true
          from = at + 1
        }
      }
      return false
    }

    /** The word one call speaks as: its leg's word, or its own label when it names no leg. */
    function panelRowWord(row, say) {
      const leg = progressFlowLegOf(row.label)
      if (leg === undefined) return typeof row.label === 'string' ? row.label : ''
      return say(PROGRESS_FLOW_WORD_KEY[leg])
    }

    /** Recorded order: the engine's own sequence, which is the one order every box reads. */
    function panelRecordedOrder(left, right) {
      return left.seq - right.seq
    }

    /**
     * How long one level really took, or `undefined` when the stream cannot say.
     *
     * `max(endedAt) - min(startedAt)` over the level's own rows, and only for a level whose
     * every box settled: a column still being walked has no duration yet, and measuring only
     * the part that settled would make the estimate short in exactly the case a reader wants
     * it. A level that drew no row has nothing to measure.
     * @param nodes - the picture's nodes.
     * @param level - the column to measure.
     * @returns the span in ms, or `undefined`.
     */
    function progressPanelSpan(nodes, level) {
      const inLevel = nodes.filter((node) => node.level === level)
      if (inLevel.length === 0) return undefined
      const rows = []
      for (const node of inLevel) {
        if (node.state !== 'done') return undefined
        for (const row of node.calls) rows.push(row)
      }
      if (rows.length === 0) return undefined
      let first = Infinity
      let last = -Infinity
      for (const row of rows) {
        if (!Number.isFinite(row.startedAt) || !Number.isFinite(row.endedAt)) return undefined
        first = Math.min(first, row.startedAt)
        last = Math.max(last, row.endedAt)
      }
      return last - first
    }

    /** Round a duration to the precision the page prints it at. */
    function progressPanelRounded(ms) {
      // Seconds under a minute: 10 s there is a fifth of the number and reads as a made-up
      // precision, so that band rounds to 5 s instead.
      const seconds = ms / 1000
      const step = seconds < 60 ? 5 : 10
      return Math.round(seconds / step) * step * 1000
    }

    /**
     * The remaining time, from the levels that were actually measured.
     *
     * The mean of the measured level spans times the levels still ahead. No measured level,
     * or nothing left to walk, means no estimate at all: the page says nothing rather than
     * inventing a number, and the visible sentence never says how the number was obtained —
     * only its tooltip does.
     * Why the tooltip says "levels": `basis` counts measured level spans (one per finished
     * column), not finished calls or tasks, so the copy must name the unit the number rests on.
     * @param nodes - the picture's nodes.
     * @param remaining - how many levels are still ahead of the reader.
     * @returns `{ ms, basis }`, or `undefined` when nothing was measured.
     */
    function progressPanelEta(nodes, remaining) {
      if (!(remaining > 0)) return undefined
      const spans = []
      for (let level = 0; level < PANEL_LEVELS; level += 1) {
        const span = progressPanelSpan(nodes, level)
        if (span !== undefined) spans.push(span)
      }
      if (spans.length === 0) return undefined
      const mean = spans.reduce((sum, span) => sum + span, 0) / spans.length
      return { ms: progressPanelRounded(mean * remaining), basis: spans.length }
    }

    /** A duration in one of three shapes: seconds, minutes, hours. */
    function progressPanelDuration(ms, t) {
      const seconds = Math.max(0, Math.round(ms / 1000))
      if (seconds < 60) return t('progress.panel.durationSec', { s: seconds })
      if (seconds < 3600) return t('progress.panel.durationMin', { m: Math.floor(seconds / 60), s: seconds % 60 })
      return t('progress.panel.durationHour', { h: Math.floor(seconds / 3600), m: Math.floor((seconds % 3600) / 60) })
    }

    /**
     * Which try a failed row was, when its label no longer says.
     *
     * `naming.ts` writes the attempt into the label of a *visit* retry (`执行（尝试 2）`), but
     * a retry inside one task keeps the bare role word, so both rows read 1 there. Its place
     * among the rows of the same unit is the honest number in that case: the engine's own
     * order is the count of tries.
     */
    function progressPanelAttempt(members, member) {
      const text = typeof member.label === 'string' ? member.label.trim() : ''
      if (/[（(][^（()）]*?\d+[^（()）]*[)）]$/u.test(text)) return progressAttemptNumber(text)
      const unit = progressAttemptUnit(member)
      let place = 0
      for (const other of [...members].sort((left, right) => left.order - right.order)) {
        if (progressAttemptUnit(other) !== unit) continue
        place += 1
        if (other.seq === member.seq) return place
      }
      return 1
    }

    /**
     * Why the run stopped moving, if it did.
     *
     * A cancelled run is not stuck — the chip already says cancelled — so it yields nothing.
     * Otherwise the first box, in the picture's own order, whose calls still carry an
     * unrecovered failure is where the reader is held; a task card is examined with its own
     * rows and is the more specific answer when it has one. Only when nothing failed does a
     * `blocked` box (a run that ended over a row it never settled) count, and only after that
     * the summary verdict of a gate that turned every draft back.
     * @param run - folded run facts.
     * @param steps - the boxes that hold a whole unit's rows, each with its step number.
     * @returns the stuck verdict, or `undefined` when nothing is stuck.
     */
    function progressPanelStuck(run, steps) {
      if (run.stopReason === 'cancelled') return undefined
      for (const step of steps) {
        const recovered = progressRecoveredFailures(step.node.calls)
        const failed = step.node.calls.find((member) => member.outcome === 'failed' && !recovered.has(member.seq))
        if (failed === undefined) continue
        return {
          nodeId: step.node.id,
          at: step.at,
          kind: 'failed',
          role: progressStoryRole(failed),
          attempt: progressPanelAttempt(step.node.calls, failed),
        }
      }
      for (const step of steps) {
        if (step.node.state !== 'blocked') continue
        return { nodeId: step.node.id, at: step.at, kind: 'blocked' }
      }
      const rejected = steps.find((step) => step.node.rejected !== undefined)
      if (rejected === undefined) return undefined
      return { nodeId: rejected.node.id, at: rejected.at, kind: 'rejected', drafts: rejected.node.rejected.drafts }
    }

    /**
     * The rows the picture owns, in recorded order, with the guardian's own call taken out.
     *
     * The guardian's call is not a leg of the work — it has a panel of its own — and every
     * other row lands in exactly one box's calls, so no declared call can vanish from the
     * figure (contract §26).
     */
    function panelRows(run) {
      const rows = []
      for (const row of run.members) {
        if (progressIsGuardianCard(typeof row.label === 'string' ? row.label : '')) continue
        rows.push(row)
      }
      return rows.sort(panelRecordedOrder)
    }

    /** The one id a task card is drawn with: its plan number, or the one group with none. */
    function panelTaskId(number) {
      return number === undefined ? 'u1' : `t${number}`
    }

    /**
     * Which box every row belongs to.
     *
     * A row that names a leg belongs to that leg: `执行` / `检查` / `复核` rows are the work
     * and hang under a plan task, `规划` rows are the plan, `汇总` rows are the summary. A row
     * that names no leg keeps its place instead of vanishing — before the first work row it is
     * part of the plan, after the last one it is part of the summary, and between two work
     * rows it belongs to the task of the row in front of it, which is the box the run had
     * reached when it declared the call (the rule `deriveProgressFlow` already applies).
     *
     * Work rows group by the plan task their **phase** names — one group per number, in number
     * order, then at most one group for the work that names no number at all. The phase is the
     * grouping fact and never a leg.
     * @param rows - the picture's rows, in recorded order.
     * @returns `{ plan, sum, tasks }`, with `tasks` in drawing order.
     */
    function panelBoxRows(rows) {
      const work = []
      const plan = []
      const sum = []
      for (const row of rows) {
        const leg = progressFlowLegOf(row.label)
        if (leg === 'execute' || leg === 'check' || leg === 'review') work.push(row)
        else if (leg === 'plan') plan.push(row)
        else if (leg === 'summarize') sum.push(row)
      }
      const firstSum = sum.length === 0 ? undefined : sum[0].seq
      // The unlabelled rows behind one work row, by that row's `seq`: they ride in its task.
      const loose = new Map()
      for (const row of rows) {
        if (progressFlowLegOf(row.label) !== undefined) continue
        let ahead
        let behind
        for (const other of work) {
          if (other.seq < row.seq) ahead = other
          else { behind = other; break }
        }
        if (ahead !== undefined && behind !== undefined) {
          const riding = loose.get(ahead.seq)
          if (riding === undefined) loose.set(ahead.seq, [row])
          else riding.push(row)
          continue
        }
        if (behind !== undefined) { plan.push(row); continue }
        if (ahead !== undefined) { sum.push(row); continue }
        // No work row at all: the summary is the only box that can come after anything.
        if (firstSum === undefined || row.seq < firstSum) plan.push(row)
        else sum.push(row)
      }
      const numbered = new Map()
      const unnumbered = []
      for (const row of work) {
        const riding = loose.get(row.seq) === undefined ? [] : loose.get(row.seq)
        const number = progressTaskNumber(row.phase)
        if (number === undefined) { unnumbered.push(row, ...riding); continue }
        const group = numbered.get(number)
        if (group === undefined) numbered.set(number, [row, ...riding])
        else group.push(row, ...riding)
      }
      const tasks = [...numbered.keys()]
        .sort((left, right) => left - right)
        .map((number) => ({ id: panelTaskId(number), number, rows: numbered.get(number).sort(panelRecordedOrder) }))
      if (unnumbered.length > 0) {
        tasks.push({ id: panelTaskId(undefined), number: undefined, rows: unnumbered.sort(panelRecordedOrder) })
      }
      return { plan: plan.sort(panelRecordedOrder), sum: sum.sort(panelRecordedOrder), tasks }
    }

    /**
     * One task card's own name: the phase the recorder wrote, verbatim.
     *
     * A plan task's title is its own name, so nothing here shortens, translates or re-words
     * it; a group that carries no phase at all falls back to the leg word of its first call.
     */
    function panelTaskLabel(rows, say) {
      for (const row of rows) {
        if (typeof row.phase === 'string' && row.phase.trim() !== '') return row.phase
      }
      return panelRowWord(rows[0], say)
    }

    /**
     * The six lights of one task card.
     *
     * The plan light and the summary light are the run's, and every card carries the same
     * pair: those two stages happen once, around the tasks, not inside them. The three work
     * lights are folded from the card's own rows by **label only** — a phase never binds a
     * leg — and the acceptance light is built from the two gates it accepts: a broken gate
     * holds the card whatever the other one says.
     * @param rows - the task's own calls.
     * @param planState - the plan box's state.
     * @param sumState - the summary box's state.
     * @param ended - whether the run stopped.
     * @returns the six lights, in the operator's order.
     */
    function panelRings(rows, planState, sumState, ended) {
      const fold = (leg) => {
        const own = rows.filter((row) => progressFlowLegOf(row.label) === leg)
        return own.length === 0 ? 'pending' : progressNodeState(own, ended)
      }
      const check = fold('check')
      const review = fold('review')
      const accept = check === 'failed' || check === 'blocked' || review === 'failed' || review === 'blocked'
        ? 'failed'
        : check === 'done' && review === 'done'
          ? 'done'
          : check === 'doing' || review === 'doing' ? 'doing' : 'pending'
      const state = {
        plan: planState,
        execute: fold('execute'),
        check,
        review,
        accept,
        summarize: sumState,
      }
      return PANEL_RING_KEYS.map((key) => ({ key, state: state[key] }))
    }

    /**
     * One light of the five verifications, folded over the rows that report it.
     *
     * Only a recorded row lights a light: the page never ticks a verification the stream did
     * not report, so a screen nobody ran stays dark rather than being assumed passed. The
     * order is the contract's — nothing declared is dark, anything still open is `doing`, a
     * set that settled with no failure still current is `done`, and one such failure is
     * `failed`.
     * @param rows - the rows that report this screen.
     * @returns one of the page's five state words.
     */
    function panelCheckState(rows) {
      if (rows.length === 0) return 'pending'
      if (rows.some((row) => row.outcome === undefined)) return 'doing'
      const recovered = progressRecoveredFailures(rows)
      if (rows.some((row) => row.outcome === 'failed' && !recovered.has(row.seq))) return 'failed'
      return 'done'
    }

    /**
     * The five verification lights, read off the run's own rows and nothing else.
     *
     * The machine screen is the check leg and the model screen is the review leg, so those
     * two are read off the leg table. The other three are reported in the run's own words, on
     * a label or a phase, and carry no leg of their own.
     * @param rows - the picture's rows.
     * @returns the five lights, in reading order.
     */
    function panelChecks(rows) {
      const carrying = (tokens) => rows.filter((row) => panelScreenCarries(row.label, tokens) || panelScreenCarries(row.phase, tokens))
      const reported = {
        machine: rows.filter((row) => progressFlowLegOf(row.label) === 'check'),
        model: rows.filter((row) => progressFlowLegOf(row.label) === 'review'),
        isolated: carrying(PANEL_CHECK_SCREENS.isolated),
        human: carrying(PANEL_CHECK_SCREENS.human),
        ledger: carrying(PANEL_CHECK_SCREENS.ledger),
      }
      return PANEL_CHECK_KEYS.map((key) => ({ key, state: panelCheckState(reported[key]) }))
    }

    /**
     * The panel's one model: a left-to-right fork from the start to the end.
     *
     * Seven levels, one per column of the picture — the start, the plan, one card per plan
     * task, one branch per call a task made, the summary, the acceptance and the end — and
     * every box and every wire derived from the run's own recorded rows. Nothing is remembered
     * from an earlier render, so a replanned run draws the tasks it really walked and the
     * picture changes with the events (contract §26).
     *
     * Labels are resolved here, through the reader's own dictionary, because the mermaid text
     * is the structural source of truth and has to carry the words a reader would see.
     * @param run - folded run facts.
     * @param t - translator for the leg words; a task's own title is printed verbatim.
     * @returns the panel model, with `mermaid` filled in from the model it was built from.
     */
    function derivePanelGraph(run, t) {
      const say = typeof t === 'function' ? t : translator(FALLBACK_LOCALE)
      const ended = run.stopReason !== undefined
      const state = !ended
        ? (run.members.length === 0 ? 'waiting' : 'running')
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
      // The two ends report the run's own fact. While it is still moving they are a place it
      // has not reached, which is what `pending` says.
      const endState = !ended
        ? 'pending'
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
      const rows = panelRows(run)
      const boxes = panelBoxRows(rows)
      // A shipped draft wins over a rejected claim: the recorder never writes both, a
      // hand-written stream could, and the page must not deny a draft the run really shipped.
      const rejected = run.summaryFinalDraft === undefined ? run.summaryRejected : undefined
      const planState = boxes.plan.length > 0
        ? progressNodeState(boxes.plan, ended)
        // The task cards are the recorded evidence that a plan ran, so a plan with no call of
        // its own is not "unreached" once there is work under it.
        : boxes.tasks.length > 0 ? 'done' : 'pending'
      const sumState = rejected !== undefined
        ? 'failed'
        : boxes.sum.length > 0
          ? progressNodeState(boxes.sum, ended)
          : ended ? endState : 'pending'
      const checks = panelChecks(rows)
      const tasks = boxes.tasks.map((task) => ({
        id: task.id,
        kind: 'task',
        level: 2,
        label: panelTaskLabel(task.rows, say),
        state: progressNodeState(task.rows, ended),
        current: false,
        calls: task.rows,
        openable: task.rows.length > 0,
        rings: panelRings(task.rows, planState, sumState, ended),
      }))
      // One branch per call a task made, in the task's own order: the k-th call of one leg is
      // the k-th attempt at it, which is what the branch prints past the first.
      const subs = []
      for (const task of boxes.tasks) {
        const seen = new Map()
        for (const row of task.rows) {
          const leg = progressFlowLegOf(row.label)
          const attempt = (seen.has(leg) ? seen.get(leg) : 0) + 1
          seen.set(leg, attempt)
          const word = panelRowWord(row, say)
          subs.push({
            id: `${task.id}_s${row.seq}`,
            kind: 'sub',
            level: 3,
            label: attempt > 1 ? `${word} · ${say('progress.flow.attempt', { n: attempt })}` : word,
            state: progressRowState(row),
            current: false,
            calls: [row],
            openable: true,
            subtask: {
              taskId: task.id,
              ...task.number === undefined ? {} : { taskNumber: task.number },
              seq: row.seq,
              leg,
              attempt,
            },
          })
        }
      }
      const nodes = [
        { id: 'start', kind: 'start', level: 0, label: say('progress.flow.start'), state: 'done', current: false, calls: [], openable: false },
        { id: 'plan', kind: 'plan', level: 1, label: say('progress.flow.plan'), state: planState, current: false, calls: boxes.plan, openable: boxes.plan.length > 0 },
        ...tasks,
        ...subs,
        {
          id: 'sum',
          kind: 'summarize',
          level: 4,
          label: say('progress.flow.summarize'),
          state: sumState,
          current: false,
          calls: boxes.sum,
          // A summary with nothing to declare still has something to say when the gate turned
          // every draft back: the verdict rides in the same opened list.
          openable: boxes.sum.length > 0 || rejected !== undefined,
          ...rejected === undefined ? {} : { rejected },
        },
        { id: 'accept', kind: 'accept', level: 5, label: say('progress.flow.accept'), state: endState, current: false, calls: [], openable: false, checks },
        { id: 'end', kind: 'end', level: 6, label: say('progress.flow.end'), state: endState, current: false, calls: [], openable: false },
      ]
      // The rows one box owns, by `seq`. A branch is written after its task, so the branch is
      // the answer for a row both of them carry: it is one call and says exactly which one is
      // open where the card could only say "somewhere in here".
      const owners = new Map()
      for (const node of nodes) {
        for (const row of node.calls) owners.set(row.seq, node)
      }
      const open = rows.find((row) => row.outcome === undefined)
      let place = open === undefined ? undefined : owners.get(open.seq)
      if (place === undefined && ended) {
        place = nodes.find((node) => node.state === 'failed' || node.state === 'blocked')
      }
      // Nothing declared and nothing ended: the start is where this run is, not the end it has
      // not reached. A run between two calls stands at the end it has not reached either.
      if (place === undefined) place = rows.length === 0 ? nodes[0] : nodes[nodes.length - 1]
      for (const node of nodes) node.current = node.id === place.id
      const edges = [{ from: 'start', to: 'plan', kind: 'chain' }]
      // A run with no task card has nothing between the plan and the summary, and the two
      // places still have to be one picture: a waiting run must not draw as two halves that
      // float apart. With a task card present the fork owns that gap and this edge is not
      // emitted, so the rule "no other edges" still holds.
      if (tasks.length === 0) edges.push({ from: 'plan', to: 'sum', kind: 'chain' })
      for (const task of tasks) edges.push({ from: 'plan', to: task.id, kind: 'fork' })
      for (const task of tasks) {
        const branches = subs.filter((sub) => sub.subtask.taskId === task.id)
        // A task that recorded no call still reaches the summary: its card is the whole of
        // what it walked, and a fork with no branch under it would end in mid-air.
        if (branches.length === 0) edges.push({ from: task.id, to: 'sum', kind: 'join' })
        for (const branch of branches) {
          edges.push({ from: task.id, to: branch.id, kind: 'branch' })
          edges.push({ from: branch.id, to: 'sum', kind: 'join' })
        }
      }
      edges.push({ from: 'sum', to: 'accept', kind: 'chain' }, { from: 'accept', to: 'end', kind: 'chain' })
      const at = place.level + 1
      const total = PANEL_LEVELS
      const remaining = total - at
      const eta = progressPanelEta(nodes, remaining)
      const shipped = run.summaryFinalDraft === undefined ? undefined : progressShippedRow(run.members, run.summaryFinalDraft)
      const graph = {
        state,
        mermaid: '',
        nodes,
        edges,
        checks,
        headline: { at, total, remaining, taskCount: tasks.length, ...eta === undefined ? {} : { eta } },
        at,
        total,
        remaining,
        taskCount: tasks.length,
        // Carried through: the opened call list marks the row the gate shipped, and it has to
        // mark the row the run named rather than a second guess at it.
        ...shipped === undefined ? {} : { final: { draft: run.summaryFinalDraft, seq: shipped.seq } },
      }
      // WHY 顶上句与卡住句同一口径：顶上句的 at 是读者站位（含分支层），卡住句
      // 若只从任务卡读数，同一屏会出现两个步号。失败态仍从整卡读（要看到被替代的重试），
      // 但报数用读者站位那一层的 at；blocked / rejected 直接用分支优先的站位。
      const stuckRaw = progressPanelStuck(run, nodes
        .filter((node) => node.kind !== 'sub')
        .map((node) => ({ node, at: node.level + 1 })))
      const stuck = stuckRaw === undefined ? undefined : { ...stuckRaw, at }
      if (stuck !== undefined) graph.stuck = stuck
      // Filled from the model it was built from, so the text and the picture cannot disagree:
      // the page lays out the parsed text, not this object.
      graph.mermaid = panelMermaid(graph)
      return graph
    }

    /**
     * The one id the text may not spell the way the model does.
     *
     * `end` closes a `subgraph` in mermaid, so a definition line that starts with it is not a
     * node a renderer will read. The end node is therefore written `finish` and read back
     * under the model's own id — the model, the DOM hook and every edge keep saying `end`, and
     * the parser knows no special ids at all: it reads whatever the text says.
     */
    const PANEL_MERMAID_ID = { end: 'finish' }

    /** The id one model node is written as, in the text. */
    function panelMermaidIdFor(id) {
      const named = PANEL_MERMAID_ID[id]
      return named === undefined ? id : named
    }

    /** The model's own id for one id the text carries. */
    function panelModelIdFor(id) {
      for (const model of Object.keys(PANEL_MERMAID_ID)) {
        if (PANEL_MERMAID_ID[model] === id) return model
      }
      return id
    }

    /** An id mermaid accepts: letters, digits and underscores, and nothing else. */
    function panelMermaidId(value) {
      return String(value === undefined || value === null ? '' : value).replace(/[^A-Za-z0-9_]/g, '')
    }

    /** A label as one mermaid line: a quote is escaped, and a line break becomes a space. */
    function panelMermaidLabel(value) {
      return String(value === undefined || value === null ? '' : value).replace(/"/g, '#quot;').replace(/\s*\r?\n\s*/g, ' ')
    }

    /**
     * The kinds the text draws as a stadium: the two ends and the three places the run stands
     * between them. A fork point, a gathering point and the gate a reader has to look at are
     * places, and the shape says so before the words are read.
     */
    const PANEL_MERMAID_STADIUM = new Set(['start', 'plan', 'summarize', 'accept', 'end'])

    /** One node definition, in the shape its kind calls for. */
    function panelMermaidNode(node) {
      const id = panelMermaidId(panelMermaidIdFor(node.id))
      const label = panelMermaidLabel(node.label)
      if (PANEL_MERMAID_STADIUM.has(node.kind)) return `${id}(["${label}"])`
      if (node.kind === 'task') return `${id}("${label}")`
      return `${id}["${label}"]`
    }

    /**
     * The graph as mermaid, which is the structural source of truth for the picture.
     *
     * One node per line, then one edge per line, two-space indented: the page parses this
     * text back and lays the parsed graph out, so the figure a reader sees and the text a
     * reader (or a test) can read cannot drift apart. The fork runs left to right, which is
     * the direction the picture reads in.
     *
     * The lights, the checks and the attempt numbers are decoration and stay out of the text:
     * every box and every wire a reader can see is in it, and nothing else is.
     */
    function panelMermaid(graph) {
      const lines = ['flowchart LR']
      for (const node of graph.nodes) lines.push(`  ${panelMermaidNode(node)}`)
      for (const edge of graph.edges) lines.push(`  ${panelMermaidId(panelMermaidIdFor(edge.from))} --> ${panelMermaidId(panelMermaidIdFor(edge.to))}`)
      return lines.join('\n')
    }

    /** The three shapes this page writes, and what each one means. */
    const PANEL_MERMAID_SHAPES = {
      '([': 'stadium',
      '[': 'rect',
      '(': 'round',
    }

    /**
     * Read the mermaid subset `panelMermaid` writes back into a graph.
     *
     * Only that subset: a `flowchart <dir>` header, `%%` comments, blank lines, the three
     * node shapes and `a --> b` edges. Anything else is ignored rather than guessed at, and
     * an edge naming a node nobody declared is dropped — a route to nowhere is not a step.
     * The header's direction is stored but not obeyed: the panel has one drawing, and it runs
     * left to right whatever the text says. A direction the reader cannot see is exactly the
     * kind of drift this file refuses to have — the text `panelMermaid` writes is `LR`.
     * @param text - the mermaid source.
     * @returns the parsed graph, with `direction` defaulting to `LR`.
     */
    function parsePanelMermaid(text) {
      const parsed = { direction: 'LR', nodes: [], edges: [] }
      const source = String(text === undefined || text === null ? '' : text)
      for (const raw of source.split(/\r?\n/)) {
        const line = raw.trim()
        if (line === '' || line.startsWith('%%')) continue
        const header = /^(?:flowchart|graph)\s+([A-Za-z]+)$/i.exec(line)
        if (header !== null) {
          parsed.direction = header[1]
          continue
        }
        const edge = /^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)$/.exec(line)
        if (edge !== null) {
          parsed.edges.push({ from: edge[1], to: edge[2] })
          continue
        }
        const node = /^([A-Za-z0-9_]+)\s*(\(\[|\[|\()\s*"([\s\S]*)"\s*(\]\)|\]|\))$/.exec(line)
        if (node === null) continue
        parsed.nodes.push({
          id: node[1],
          label: node[3].replace(/#quot;/g, '"'),
          shape: PANEL_MERMAID_SHAPES[node[2]],
        })
      }
      const declared = new Set(parsed.nodes.map((node) => node.id))
      parsed.edges = parsed.edges.filter((edge) => declared.has(edge.from) && declared.has(edge.to))
      return parsed
    }

    /** A width kept inside the band its shape allows. */
    function panelClampWidth(value, band) {
      return Math.max(band.min, Math.min(band.max, Math.round(value)))
    }

    /**
     * The default box of one node, for the render before anything has been measured.
     *
     * The shape says which of the three cards it is — a capsule (起点, 规划, 汇总, 验收, 终点),
     * a task card, or a sub box — and the width grows with the label inside the band that card
     * allows, so a figure drawn on a host without layout still reads as the fork it is.
     */
    function panelDefaultSize(node) {
      const band = PANEL_BOX[node.shape] === undefined ? PANEL_BOX.rect : PANEL_BOX[node.shape]
      const length = typeof node.label === 'string' ? node.label.length : 0
      const base = node.shape === 'stadium' ? 24 : node.shape === 'round' ? 30 : 24
      const per = node.shape === 'stadium' ? 13 : node.shape === 'round' ? 12 : 11
      return { w: panelClampWidth(base + per * length, band), h: band.h }
    }

    /**
     * One node's box: what the page measured, else the default its shape calls for.
     *
     * `floors` names the cards whose second row is a fact about the model rather than about the
     * text — the ring lights, the checks, a capsule's badge — and gives each the height it
     * needs before the page measured anything: that row is part of the card, not a decoration
     * drawn over it, so the wire has to land on the height a reader will see.
     * @param node - one parsed node.
     * @param sizes - measured boxes by node id.
     * @param floors - the least height of each card that carries a second row, by node id.
     * @returns the box, clamped to the band its shape allows.
     */
    function panelNodeSize(node, sizes, floors) {
      const band = PANEL_BOX[node.shape] === undefined ? PANEL_BOX.rect : PANEL_BOX[node.shape]
      const fallback = panelDefaultSize(node)
      const given = sizes === undefined || sizes === null ? undefined : sizes[node.id]
      const known = given !== undefined && Number.isFinite(given.w) && Number.isFinite(given.h) && given.w > 0 && given.h > 0
      const least = floors !== undefined && floors !== null && floors.has(node.id) ? floors.get(node.id) : fallback.h
      return {
        w: panelClampWidth(known ? given.w : fallback.w, band),
        h: Math.max(known ? Math.round(given.h) : fallback.h, least),
      }
    }

    /**
     * Longest-path columns over the parsed graph: one column per step of the fork.
     *
     * Kahn's order is what makes "longest path" a single pass: every edge into a node is
     * settled before that node is visited. An edge that points backwards — it can only be in
     * a graph somebody typed by hand — is ignored instead of walked, so a cycle costs the
     * layout a misplaced card rather than an endless loop. Nodes keep parse order inside a
     * column, so the branches of one fork read from top to bottom in the order they happened.
     *
     * The text may hold two components: a run that has planned and not yet worked gets no
     * edge from the plan to the summary, because nothing connects them yet. A component is
     * placed to the right of the one before it rather than on top of it, so the summary stands
     * after the part of the run that led to it instead of in the start's own column.
     * @param parsed - the parsed graph.
     * @returns the node ids of each column, left to right.
     */
    function panelLayers(parsed) {
      const parsedAt = new Map(parsed.nodes.map((node, index) => [node.id, index]))
      const next = new Map(parsed.nodes.map((node) => [node.id, []]))
      const both = new Map(parsed.nodes.map((node) => [node.id, []]))
      const incoming = new Map(parsed.nodes.map((node) => [node.id, 0]))
      for (const edge of parsed.edges) {
        next.get(edge.from).push(edge.to)
        both.get(edge.from).push(edge.to)
        both.get(edge.to).push(edge.from)
        incoming.set(edge.to, incoming.get(edge.to) + 1)
      }
      const queue = parsed.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
      const visited = []
      while (queue.length > 0) {
        const id = queue.shift()
        visited.push(id)
        for (const target of next.get(id)) {
          incoming.set(target, incoming.get(target) - 1)
          if (incoming.get(target) === 0) queue.push(target)
        }
      }
      // A cycle leaves nodes unqueued; they keep their parse order after the rest instead of
      // disappearing from the figure.
      for (const node of parsed.nodes) if (visited.indexOf(node.id) === -1) visited.push(node.id)
      const rank = new Map(visited.map((id, index) => [id, index]))
      const depth = new Map(parsed.nodes.map((node) => [node.id, 0]))
      for (const id of visited) {
        for (const target of next.get(id)) {
          if (rank.get(target) <= rank.get(id)) continue
          depth.set(target, Math.max(depth.get(target), depth.get(id) + 1))
        }
      }
      const seen = new Set()
      let floor = 0
      for (const node of parsed.nodes) {
        if (seen.has(node.id)) continue
        const component = []
        const stack = [node.id]
        seen.add(node.id)
        while (stack.length > 0) {
          const id = stack.pop()
          component.push(id)
          for (const other of both.get(id)) {
            if (seen.has(other)) continue
            seen.add(other)
            stack.push(other)
          }
        }
        let first = Infinity
        let last = -Infinity
        for (const id of component) {
          first = Math.min(first, depth.get(id))
          last = Math.max(last, depth.get(id))
        }
        const shift = floor - first
        for (const id of component) depth.set(id, depth.get(id) + shift)
        floor = last + shift + 1
      }
      const layers = []
      for (const id of visited) {
        const at = depth.get(id)
        while (layers.length <= at) layers.push([])
        layers[at].push(id)
      }
      for (const layer of layers) layer.sort((left, right) => parsedAt.get(left) - parsedAt.get(right))
      return layers
    }

    /** A coordinate as mermaid and SVG both want it: two decimals, no trailing zeros. */
    function panelNumber(value) {
      return String(Math.round(value * 100) / 100)
    }

    /** The length of one straight run, for the corner radius that joins it to the next. */
    function panelDistance(from, to) {
      return Math.hypot(to[0] - from[0], to[1] - from[1])
    }

    /**
     * A polyline with every right-angle corner rounded.
     *
     * The radius is the same 8 px the row layout uses, capped at half of the shorter of the
     * two runs it joins: a corner between two 4 px runs gets a 2 px radius instead of a
     * bulge that would redraw the whole turn. Repeated points are dropped first, so a
     * straight run stays one `L`.
     */
    function panelPolyline(input) {
      const points = []
      for (const point of input) {
        const last = points[points.length - 1]
        if (last !== undefined
          && Math.round(last[0] * 100) === Math.round(point[0] * 100)
          && Math.round(last[1] * 100) === Math.round(point[1] * 100)) continue
        points.push(point)
      }
      // A vertex that carries straight on is not a vertex: a stem that runs into the next
      // run on the same axis has to stay one `L`, or every straight wire would be printed as
      // two collinear ones.
      for (let index = points.length - 2; index > 0; index -= 1) {
        const before = points[index - 1]
        const at = points[index]
        const after = points[index + 1]
        const cross = (at[0] - before[0]) * (after[1] - at[1]) - (at[1] - before[1]) * (after[0] - at[0])
        if (cross !== 0) continue
        points.splice(index, 1)
      }
      if (points.length === 0) return ''
      const parts = [`M ${panelNumber(points[0][0])} ${panelNumber(points[0][1])}`]
      // Where the pen is, so a corner that starts where the last one ended does not print a
      // zero-length run between them: two corners 10 px apart are two corners, not three.
      let pen = points[0]
      const lineTo = (point) => {
        if (Math.round(pen[0] * 100) === Math.round(point[0] * 100)
          && Math.round(pen[1] * 100) === Math.round(point[1] * 100)) return
        parts.push(`L ${panelNumber(point[0])} ${panelNumber(point[1])}`)
        pen = point
      }
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]
        const current = points[index]
        const next = points[index + 1]
        const inLength = panelDistance(previous, current)
        const outLength = next === undefined ? 0 : panelDistance(current, next)
        // Straight on is not a corner: two runs on one axis get one `L`, not a curve between
        // two points that are the same point.
        const cross = (current[0] - previous[0]) * (next === undefined ? 0 : next[1] - current[1])
          - (current[1] - previous[1]) * (next === undefined ? 0 : next[0] - current[0])
        const radius = next === undefined || cross === 0 ? 0 : Math.min(8, inLength / 2, outLength / 2)
        if (!(radius > 0)) {
          lineTo(current)
          continue
        }
        const before = [
          current[0] + ((previous[0] - current[0]) / inLength) * radius,
          current[1] + ((previous[1] - current[1]) / inLength) * radius,
        ]
        const after = [
          current[0] + ((next[0] - current[0]) / outLength) * radius,
          current[1] + ((next[1] - current[1]) / outLength) * radius,
        ]
        lineTo(before)
        parts.push(`Q ${panelNumber(current[0])} ${panelNumber(current[1])} ${panelNumber(after[0])} ${panelNumber(after[1])}`)
        pen = after
      }
      return parts.join(' ')
    }

    /**
     * One wire: out of the source's right edge, into the target's left edge.
     *
     * The run is horizontal, so the shape is always the same — right, across the gap, up or
     * down, in — and the turn happens at the gap's centre. Every wire crossing that gap turns
     * at the same x, which is what draws the bar a fork or a join reads as. Nothing vertical
     * ever stands beside a card, so no wire can cross one.
     *
     * An edge that skips a column has no gap of its own to turn in, so it takes the band under
     * the figure instead: the two turns stay in the gaps on either side of the columns it
     * passes, and the long run is below every card.
     * @param from - the source box.
     * @param to - the target box.
     * @param bypass - the y of the band under the figure.
     * @returns the `d` attribute.
     */
    function panelWirePath(from, to, bypass) {
      const sy = from.y + from.h / 2
      const ty = to.y + to.h / 2
      const sx = from.x + from.w
      const tx = to.x
      const half = PANEL_COLUMN_GAP / 2
      if (to.column === from.column + 1) return panelPolyline([[sx, sy], [sx + half, sy], [sx + half, ty], [tx, ty]])
      return panelPolyline([[sx, sy], [sx + half, sy], [sx + half, bypass], [tx - half, bypass], [tx - half, ty], [tx, ty]])
    }

    /**
     * Lay the parsed graph out: one column per step, left to right, siblings stacked.
     *
     * The fork is the picture, so the direction is fixed: the start is the leftmost column and
     * the end the rightmost, and the columns between them are the plan, the tasks, their
     * subtasks, the summary and the acceptance. A column is as wide as its own widest card and
     * every card in it is drawn at that width, which is what makes the cards of one column
     * share a left edge, a right edge and therefore one bar per fork.
     *
     * A column's cards sit 14 px apart and the column as a whole is centred on the figure's
     * own middle, so a column of nine subtasks and a column holding one capsule share one
     * centre line. Columns sit 48 px apart. The container is never narrower than the space the
     * page gave, and when the flow needs more than that the container is as wide as the flow —
     * the figure around it scrolls, and the page itself never does.
     * @param parsed - the parsed graph.
     * @param sizes - measured boxes by node id; a missing node falls back to its default.
     * @param availableWidth - the column the page has.
     * @param floors - the least height of each card whose second row the model knows about.
     * @returns the container box, every node's box and every edge's path.
     */
    function layoutPanelGraph(parsed, sizes, availableWidth, floors) {
      const width = Number.isFinite(availableWidth) && availableWidth > 0 ? Math.round(availableWidth) : PANEL_DEFAULT_WIDTH
      const sizeOf = new Map(parsed.nodes.map((node) => [node.id, panelNodeSize(node, sizes, floors)]))
      const columns = panelLayers(parsed)
      const columnOf = new Map()
      for (let index = 0; index < columns.length; index += 1) {
        for (const id of columns[index]) columnOf.set(id, index)
      }
      const widths = columns.map((ids) => ids.reduce((widest, id) => Math.max(widest, sizeOf.get(id).w), 0))
      const heights = columns.map((ids) => ids.reduce((sum, id, index) => sum + sizeOf.get(id).h + (index === 0 ? 0 : PANEL_SIBLING_GAP), 0))
      const tallest = heights.reduce((best, height) => Math.max(best, height), 0)
      // A wire that reaches further than the column beside it may not run through the ones it
      // passes, so the figure keeps a band under every card for exactly those.
      const skips = parsed.edges.some((edge) => columnOf.get(edge.to) !== columnOf.get(edge.from) + 1)
      const height = tallest === 0 ? 0 : tallest + (skips ? PANEL_BYPASS + PANEL_SIBLING_GAP : 0)
      const flowWidth = widths.reduce((sum, columnWidth, index) => sum + columnWidth + (index === 0 ? 0 : PANEL_COLUMN_GAP), 0)
      const container = Math.max(width, flowWidth)
      const offset = Math.round((container - flowWidth) / 2)
      const lefts = []
      let cursor = offset
      for (let index = 0; index < columns.length; index += 1) {
        lefts.push(cursor)
        cursor += widths[index] + PANEL_COLUMN_GAP
      }
      const nodes = []
      const boxes = new Map()
      for (let index = 0; index < columns.length; index += 1) {
        // Centred on the figure's middle rather than on the tallest column's top: a capsule
        // alone beside a column of nine subtasks sits on the line the run travels.
        let top = Math.round((tallest - heights[index]) / 2)
        for (const id of columns[index]) {
          const size = sizeOf.get(id)
          const box = { id, x: lefts[index], y: top, w: widths[index], h: size.h, column: index }
          boxes.set(id, box)
          nodes.push(box)
          top += size.h + PANEL_SIBLING_GAP
        }
      }
      const bypass = tallest + PANEL_SIBLING_GAP
      const edges = []
      for (const edge of parsed.edges) {
        const from = boxes.get(edge.from)
        const to = boxes.get(edge.to)
        if (from === undefined || to === undefined) continue
        edges.push({ from: edge.from, to: edge.to, d: panelWirePath(from, to, bypass) })
      }
      return { width: container, height, nodes, edges }
    }

    /**
     * Parse a coordination block out of child-session text.
     *
     * Only an explicit block is accepted: a fenced `grok-coordination` block, or a fenced
     * `json` block carrying the coordination object or at least two of the seven fields.
     * Prose is not structured data, and this function never promotes it into evidence.
     */
    /** One `LABEL: value` line of a coordination block (`WORK_COMMIT: abc1234`). */
    const PROGRESS_COORDINATION_LABEL = /^[ \t>*_`-]*([A-Za-z][A-Za-z_ -]*?)[ \t]*[:：][ \t]*(.*?)[ \t]*$/

    /** Read the labelled form of a block, one fact per line. */
    function progressLabelledFields(body) {
      const fields = {}
      for (const line of body.split(/\r?\n/)) {
        const match = PROGRESS_COORDINATION_LABEL.exec(line)
        if (match === null) continue
        const key = progressDetailField(match[1] || '')
        if (key === undefined || fields[key] !== undefined) continue
        const value = (match[2] || '').replace(/^`+|`+$/g, '').trim()
        if (value !== '') fields[key] = value
      }
      return fields
    }

    /** Read the JSON form of a fenced block, when that fence is one. */
    function progressJsonFields(language, body) {
      if (language !== 'grok-coordination' && language !== 'json') return undefined
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        return undefined
      }
      const record = progressRecord(parsed)
      if (record === undefined) return undefined
      const nested = progressRecord(record.coordination)
      const fields = progressPickFields(nested === undefined ? record : nested)
      const known = Object.keys(fields).length
      if (known === 0) return undefined
      // A generic `json` fence needs the coordination object or two unmistakable fields;
      // prose in a JSON block is not evidence.
      if (nested === undefined && language !== 'grok-coordination' && known < 2) return undefined
      return fields
    }

    /**
     * Parse a coordination block out of stage text.
     *
     * Three shapes are accepted and nothing else: a fenced `json`/`grok-coordination`
     * block with the canonical fields (or a `coordination` object); any fenced block whose
     * body is the `LABEL: value` form `AGENTS.md` prescribes, with at least two known
     * labels; and that same labelled block unfenced, because the coordination protocol is
     * posted as the message body itself. Prose that merely mentions a field is never
     * promoted into evidence.
     */
    function parseProgressCoordination(text) {
      if (typeof text !== 'string' || text === '') return undefined
      const fenced = /```([A-Za-z-]*)[^\n]*\n([\s\S]*?)```/g
      let match
      while ((match = fenced.exec(text)) !== null) {
        const language = (match[1] || '').toLowerCase()
        const body = match[2] || ''
        const fromJson = progressJsonFields(language, body)
        if (fromJson !== undefined) return { fields: fromJson, raw: body.trim() }
        const fromLabels = progressLabelledFields(body)
        if (Object.keys(fromLabels).length >= 2) return { fields: fromLabels, raw: body.trim() }
      }
      const unfenced = progressLabelledFields(text)
      if (Object.keys(unfenced).length >= 2) return { fields: unfenced, raw: text.trim() }
      return undefined
    }

    /**
     * Resolve the seven detail fields, strongest source first
     * (`stage-detail` event → coordination block → not reported).
     * @param sources - available sources.
     * @returns one row per field, plus the copyable block when there was one.
     */
    function progressDetailFor(sources) {
      const input = sources === undefined || sources === null ? {} : sources
      const fromEvent = input.stageDetail === undefined ? undefined : progressPickFields(input.stageDetail)
      const block = parseProgressCoordination(input.coordinationText)
      const fields = []
      for (const key of PROGRESS_DETAIL_FIELDS) {
        const eventValue = fromEvent === undefined ? undefined : fromEvent[key]
        if (eventValue !== undefined) { fields.push({ key, value: eventValue, source: 'stage-detail' }); continue }
        const blockValue = block === undefined ? undefined : block.fields[key]
        if (blockValue !== undefined) { fields.push({ key, value: blockValue, source: 'coordination' }); continue }
        fields.push({ key, source: 'not-reported' })
      }
      return { fields, coordinationRaw: block === undefined ? undefined : block.raw }
    }

    /**
     * Where one node's detail values come from.
     *
     * A view cannot read a child session's text, so the ladder is fed from the only
     * channel in the stream: the run's own `stage-detail` payloads, matched to the node by
     * the phase they name, with a phase-less payload as the run-level fallback. A caller
     * that *can* read a child session passes its source in `injected`, which wins for the
     * level it supplies — wiring a stronger source later needs no UI change.
     */
    function progressDetailSources(track, node, injected) {
      const supplied = injected === undefined || injected === null ? {} : injected
      const own = node === undefined || node === null ? undefined : node.stageDetail
      const source = own === undefined ? (track === undefined || track === null ? undefined : track.stageDetail) : own
      const stageDetail = supplied.stageDetail !== undefined ? supplied.stageDetail : (source === undefined ? undefined : source.fields)
      const coordinationText = supplied.coordinationText !== undefined ? supplied.coordinationText : (source === undefined ? undefined : source.coordinationText)
      return {
        ...stageDetail === undefined ? {} : { stageDetail },
        ...coordinationText === undefined ? {} : { coordinationText },
      }
    }

    /**
     * The page's stylesheet, scoped to `.gw-progress`.
     *
     * Every colour is a `--dsw-alias-*` token (mixed with `color-mix()` where a surface is
     * needed) and every family is a `--dsw-font-*` token, so the page follows the theme,
     * the contrast pass and dark mode instead of freezing a shade. The rules that cannot be
     * inline styles live here: the node row, the breathing current node, the measured wire
     * layer, the reduced-motion stop and the narrow layout.
     *
     * One rule per line is deliberate: a rule that spans lines cannot be read by the guard
     * that every selector is scoped to `.gw-progress`, and `@keyframes` bodies stay on their
     * `@` line for the same reason.
     */
    const PROGRESS_CSS = [
      '.gw-progress { position: relative; box-sizing: border-box; display: flex; flex-direction: column; width: 100%; min-width: 0; color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family-sans, inherit); font-size: 13px; }',
      // ── header: one title row (the run's name and the five-state chip), one sentence ──
      // The row wraps and the sentence takes a full line of its own, so the header is two
      // rows without a wrapper element standing between the two hooks a reader looks for.
      '.gw-progress-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; padding: 12px 4px 9px; border-bottom: 1px solid var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-run { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-secondary, inherit); }',
      '.gw-progress-chip { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 24px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, currentColor); background: color-mix(in srgb, var(--dsw-alias-state-idle-primary) 12%, transparent); color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; font-weight: 600; white-space: nowrap; }',
      '.gw-progress-chip-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }',
      '.gw-progress-chip[data-state="waiting"] { border-color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-label-inverse, inherit); }',
      '.gw-progress-chip[data-state="running"] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); color: var(--dsw-alias-state-business-primary); }',
      '.gw-progress-chip[data-state="running"] .gw-progress-chip-dot { animation: gw-progress-pulse 1.7s ease-in-out infinite; }',
      '.gw-progress-chip[data-state="done"] { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent); color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-chip[data-state="failed"], .gw-progress-chip[data-state="cancelled"] { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); color: var(--dsw-alias-state-warn-primary); }',
      // The one sentence: the same step count the count line used to carry, plus the
      // measured remainder when there is one. It is meta text, so it is 12px.
      '.gw-progress-line { flex: 1 0 100%; min-width: 0; margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      // ── the figure: a scroll box of its own, and the fork drawn inside it ─────────
      // The run is left to right at every width, so the figure scrolls sideways rather than
      // folding into a column: a stacked column would destroy the fork the page is.
      '.gw-progress-figure { box-sizing: border-box; width: 100%; min-width: 0; margin: 14px 0 0; overflow-x: auto; overflow-y: hidden; }',
      // A node's opened calls float under its card, and the figure is a scroll box, so the
      // room the list needs has to exist inside it or the clip eats the one list there is.
      '.gw-progress-figure[data-open="true"] { padding-bottom: 250px; }',
      '.gw-progress-graph { position: relative; box-sizing: border-box; flex: none; margin: 0 auto; }',
      '.gw-progress-wires { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }',
      '.gw-progress-wires > path { fill: none; stroke: var(--dsw-alias-border-l2, currentColor); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }',
      '.gw-progress-pnodes { position: absolute; inset: 0; margin: 0; padding: 0; list-style: none; }',
      // A node's position and width come from the layout as inline styles; its **height stays
      // auto**, so what the page measures is the box a reader is really looking at.
      '.gw-progress-pnode { position: absolute; box-sizing: border-box; min-width: 0; }',
      // An open card rises as a whole. The list carries a z-index of its own to sit above the
      // card it hangs from, but that number only competes inside whatever stacking context the
      // list lands in — and a host stylesheet is free to put a card's own body in a context of
      // its own. Raising the card, not the list, is the one rule that cannot lose to a sibling
      // card drawn later in the document.
      '.gw-progress-pnode[data-open="true"] { z-index: 4; }',
      // The body is a column of at most two rows: the word, then the row of lights. A card
      // with neither is the same column holding one row, so one box is all three kinds.
      '.gw-progress-pnode-body { box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 4px; width: 100%; min-width: 0; max-width: 100%; min-height: 32px; padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 10px; background-color: transparent; color: inherit; font: inherit; text-align: left; }',
      '.gw-progress-pnode-main { display: flex; align-items: center; gap: 6px; min-width: 0; }',
      // A node with something to open is a real button; one that is only a mark keeps the
      // same box, so the figure looks the same either way.
      '.gw-progress-pnode-body[type="button"] { cursor: pointer; }',
      '.gw-progress-pnode-body:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }',
      // A task card carries the word and the six ring lights: two rows, and the second one is
      // the row a reader scans for which leg of the six is speaking.
      '.gw-progress-pnode[data-kind="task"] .gw-progress-pnode-body { min-height: 56px; padding: 6px 8px; }',
      // A sub box stands for one recorded call: one row, and the small type of a detail.
      '.gw-progress-pnode[data-kind="sub"] .gw-progress-pnode-body { min-height: 30px; padding: 0 8px; border-radius: 8px; }',
      // The run's five places are capsules, because they are places and not work; 验收 carries
      // the five checks under its word, so it is two rows tall like a task.
      '.gw-progress-pnode[data-kind="start"] .gw-progress-pnode-body, .gw-progress-pnode[data-kind="plan"] .gw-progress-pnode-body, .gw-progress-pnode[data-kind="summarize"] .gw-progress-pnode-body, .gw-progress-pnode[data-kind="accept"] .gw-progress-pnode-body, .gw-progress-pnode[data-kind="end"] .gw-progress-pnode-body { justify-content: center; border-radius: 999px; }',
      '.gw-progress-pnode[data-kind="accept"] .gw-progress-pnode-body { min-height: 56px; }',
      '.gw-progress-pnode-dot { display: inline-block; flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-pnode-word { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }',
      '.gw-progress-pnode[data-kind="task"] .gw-progress-pnode-word { font-size: 12px; }',
      '.gw-progress-pnode[data-kind="sub"] .gw-progress-pnode-word { font-size: 11px; font-weight: 500; }',
      '.gw-progress-pnode[data-kind="start"] .gw-progress-pnode-word, .gw-progress-pnode[data-kind="end"] .gw-progress-pnode-word { flex: 0 1 auto; }',
      '.gw-progress-pnode-badge { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); white-space: nowrap; font-variant-numeric: tabular-nums; }',
      // A capsule's badge sits on a row of its own, centred under the word: the word keeps the
      // whole line, so 汇总 is never cut to make room for a draft number.
      '.gw-progress-pnode-detail { display: flex; justify-content: center; align-items: center; min-width: 0; }',
      // ── the lights: six rings on a task, five checks on 验收 ─────────────────────
      // A light is a dot and nothing else: the state is its colour, the word is its tooltip,
      // and the card's own spoken label keeps the sentence a screen reader hears short.
      '.gw-progress-pnode-lights { display: flex; align-items: center; gap: 4px; min-width: 0; flex-wrap: wrap; }',
      '.gw-progress-ring, .gw-progress-check { display: inline-block; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-ring[data-state="done"], .gw-progress-check[data-state="done"] { background: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-ring[data-state="doing"], .gw-progress-check[data-state="doing"] { background: var(--dsw-alias-state-business-primary); animation: gw-progress-breathe 1.7s ease-in-out infinite; }',
      // Not reached is the only light with no fill, exactly like the node's own dot.
      '.gw-progress-ring[data-state="pending"], .gw-progress-check[data-state="pending"] { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-ring[data-state="failed"], .gw-progress-ring[data-state="blocked"], .gw-progress-check[data-state="failed"], .gw-progress-check[data-state="blocked"] { background: var(--dsw-alias-state-warn-primary); }',
      // A passed card is green, from its edge to its dot and its word.
      '.gw-progress-pnode[data-state="done"] .gw-progress-pnode-body { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); background-image: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent), color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent)); }',
      '.gw-progress-pnode[data-state="done"] .gw-progress-pnode-dot { background: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-pnode[data-state="done"] .gw-progress-pnode-word { color: var(--dsw-alias-state-success-primary); }',
      // The current card is blue, its dot breathing so the page says where it is even
      // before a reader reads a word.
      '.gw-progress-pnode[data-state="doing"] .gw-progress-pnode-body { border-color: var(--dsw-alias-state-business-primary); background-image: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent), color-mix(in srgb, var(--dsw-alias-state-business-primary) 5%, transparent)); }',
      '.gw-progress-pnode[data-state="doing"] .gw-progress-pnode-dot { background: var(--dsw-alias-state-business-primary); animation: gw-progress-breathe 1.7s ease-in-out infinite; }',
      '.gw-progress-pnode[data-state="doing"] .gw-progress-pnode-word { color: var(--dsw-alias-state-business-primary); }',
      // Not reached yet: a dashed edge and a hollow dot — the only state with no fill, so
      // "nothing has happened here" reads without relying on colour.
      '.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-body { border-style: dashed; background-image: none; }',
      '.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-dot { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-word { color: var(--dsw-alias-label-secondary, inherit); }',
      // Failed, blocked and cancelled are amber: three ways of saying the run did not get
      // through, and none of them is an error the page can explain.
      '.gw-progress-pnode[data-state="failed"] .gw-progress-pnode-body, .gw-progress-pnode[data-state="blocked"] .gw-progress-pnode-body, .gw-progress-pnode[data-state="cancelled"] .gw-progress-pnode-body { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 50%, transparent); background-image: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent), color-mix(in srgb, var(--dsw-alias-state-warn-primary) 5%, transparent)); }',
      '.gw-progress-pnode[data-state="failed"] .gw-progress-pnode-dot, .gw-progress-pnode[data-state="blocked"] .gw-progress-pnode-dot, .gw-progress-pnode[data-state="cancelled"] .gw-progress-pnode-dot { background: var(--dsw-alias-state-warn-primary); }',
      '.gw-progress-pnode[data-state="failed"] .gw-progress-pnode-word, .gw-progress-pnode[data-state="blocked"] .gw-progress-pnode-word, .gw-progress-pnode[data-state="cancelled"] .gw-progress-pnode-word { color: var(--dsw-alias-state-warn-primary); }',
      // The reader's place gets the ring, whatever state it is in: a failure still holds the
      // run, and the page has to say where that is.
      '.gw-progress-pnode[data-current="true"] .gw-progress-pnode-body { box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent); }',
      // The opened calls are rendered by the sheet under the figure at every width: the
      // node keeps no floating box of its own, so no sibling moves and no card is covered.
      // The inset below keeps the retired floating rule readable for history, not for layout.
      '.gw-progress-node-calls { position: absolute; z-index: 3; top: calc(100% + 6px); left: 0; right: 0; box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; max-height: 240px; overflow-y: auto; margin: 0; padding: 6px; list-style: none; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, Canvas)); box-shadow: 0 6px 16px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }',
      // The all-rejected verdict rides in that list as plain rows: the summary node has no
      // shipped row to show, so its opened list is where the three facts are read.
      '.gw-progress-node-rejected { margin: 0; padding: 6px 4px; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); overflow-wrap: anywhere; }',
      '.gw-progress-node-rejected[data-gw-progress-node-rejected="drafts"] { font-weight: 600; color: var(--dsw-alias-state-warn-primary); }',
      // The slot one call reached: the chain's word, in a capsule of its own.
      '.gw-progress-node-calls [data-gw-progress-task-chain] { flex: none; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 999px; color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; white-space: nowrap; }',
      // ── the opened calls: one sheet under the figure, at every width ────────────
      // The floating list used to hang under its card and land on the neighbour (one open
      // list over 2 cards at desktop, four over 9) — so the list is drawn outside the
      // figure, here, in the panel's own column. Its height is capped so the page always
      // keeps the rest in reach, and it is the one box that scrolls: down, never sideways.
      // WHY one box, not one per width: two boxes means two overlap stories to keep at 0;
      // the sheet already proved 0 against every card and the dock.
      '.gw-progress-sheet { box-sizing: border-box; display: flex; flex: none; flex-direction: column; gap: 6px; min-width: 0; max-height: min(50vh, 240px); overflow-y: auto; margin: 12px 0 0; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 12px; background: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-l1, transparent)); }',
      '.gw-progress-sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
      '.gw-progress-sheet-title { min-width: 0; font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--dsw-alias-label-secondary, inherit); }',
      // The one control: a capsule the thumb can hit, and it answers Enter and Space because
      // it is a button, not a mark.
      '.gw-progress-sheet-hide { flex: none; display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }',
      '.gw-progress-sheet-hide:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }',
      '.gw-progress-sheet-group { display: flex; flex-direction: column; gap: 2px; min-width: 0; }',
      '.gw-progress-sheet-node { margin: 0; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }',
      // In the sheet the list is a column of rows in the page's flow, not a box of its own:
      // the sheet already carries the border, the fill and the one scroll.
      '.gw-progress-sheet .gw-progress-node-calls { position: static; max-height: none; overflow-y: visible; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; }',
      // The room the sheet is scrolled into: the panel is often barely taller than the screen,
      // so without it the scroll runs out with the list still at the bottom of the column —
      // which is exactly where the shell pins its composer. It is empty, silent, and there
      // only while a list is open.
      '.gw-progress-sheet-room { flex: none; height: 35vh; }',
      // ── a click traces the wires ─────────────────────────────────────────────────
      // The clicked node's own lines step forward and every other line steps back: the
      // figure keeps its structure while the branch a reader asked about reads first.
      '.gw-progress-wires > path[data-trace="active"] { stroke: var(--dsw-alias-state-business-primary); stroke-width: 2; }',
      '.gw-progress-wires > path[data-trace="dim"] { opacity: 0.3; }',
      '.gw-progress-pnode[data-trace="active"] .gw-progress-pnode-body { border-color: var(--dsw-alias-state-business-primary); }',
      // ── the trace legend: five standing words, once a node is opened ─────────────
      // Four short sentences under the figure, only while a trace is lit: what a lit wire,
      // a dimmed wire, the six dots and the five dots each say. Plain text in the page flow,
      // so it wraps on a phone and never covers a card.
      '.gw-progress-legend { box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 10px 4px 0; padding: 0; list-style: none; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }',
      '.gw-progress-legend-item { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }',
      '.gw-progress-legend-wire { display: inline-block; width: 18px; height: 2px; border-radius: 1px; background: var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-legend-wire[data-trace="active"] { background: var(--dsw-alias-state-business-primary); }',
      '.gw-progress-legend-wire[data-trace="dim"] { opacity: 0.4; }',
      '.gw-progress-legend-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-legend-dot[data-state="pending"] { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-state-idle-primary); }',
      // ── one call line: clock, gate and word ──────────────────────────────────────
      '.gw-progress-log-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 8px 6px; border-bottom: 1px solid var(--dsw-alias-border-l2, currentColor); }',
      // A list hangs under one card, so a row is only ever as wide as that card — 110 to 240
      // px. The clock, the gate and the verdict share the first line, and a task's title takes
      // a line of its own. Nothing here may be squeezed: a column cell that runs out of room
      // breaks a CJK word between every two characters, which is how a row used to read.
      '.gw-progress-node-calls .gw-progress-log-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 6px 4px; }',
      // The line box holds the gate capsule and the title; it is flattened so the title can take
      // the row's whole second line while the gate stays beside the clock.
      '.gw-progress-node-calls .gw-progress-log-line { display: contents; }',
      '.gw-progress-node-calls .gw-progress-log-time { flex: none; white-space: nowrap; }',
      '.gw-progress-node-calls .gw-progress-log-role, .gw-progress-node-calls .gw-progress-call-chain { flex: none; white-space: nowrap; }',
      // The verdict sits at the right end of the first line; when that line is too narrow for
      // all four it wraps to the next one whole, which a column cell cannot do.
      '.gw-progress-node-calls .gw-progress-log-word { flex: none; margin-left: auto; white-space: nowrap; }',
      '.gw-progress-node-calls .gw-progress-log-pill { flex: none; }',
      '.gw-progress-node-calls .gw-progress-log-name { order: 1; flex: 1 1 100%; min-width: 0; }',
      '.gw-progress-log-row:last-child { border-bottom: 0; }',
      '.gw-progress-log-time { font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); font-variant-numeric: tabular-nums; }',
      '.gw-progress-log-line { display: flex; align-items: baseline; gap: 6px; min-width: 0; }',
      '.gw-progress-log-role { flex: none; font-size: 13px; font-weight: 600; }',
      '.gw-progress-log-name { min-width: 0; font-size: 13px; color: var(--dsw-alias-label-secondary, inherit); overflow-wrap: anywhere; }',
      '.gw-progress-log-word { flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); white-space: nowrap; }',
      '.gw-progress-log-row[data-state="done"] .gw-progress-log-word { color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-log-row[data-state="doing"] { border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent); }',
      '.gw-progress-log-row[data-state="doing"] .gw-progress-log-word { color: var(--dsw-alias-state-business-primary); font-weight: 600; }',
      '.gw-progress-log-row[data-state="failed"] { border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); }',
      '.gw-progress-log-row[data-state="blocked"] { border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); }',
      '.gw-progress-log-row[data-state="failed"] .gw-progress-log-word { color: var(--dsw-alias-state-warn-primary); font-weight: 600; }',
      '.gw-progress-log-row[data-state="blocked"] .gw-progress-log-word { color: var(--dsw-alias-state-warn-primary); font-weight: 600; }',
      '.gw-progress-open { display: inline-flex; align-items: center; height: 22px; margin-left: auto; padding: 0 9px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 11px; white-space: nowrap; }',
      '.gw-progress-open[type="button"] { cursor: pointer; }',
      '.gw-progress-open[type="button"]:hover { border-color: var(--dsw-alias-state-business-primary); }',
      // ── the stuck line: one sentence, and only while something is stuck ──────────
      '.gw-progress-stuck { margin: 10px 4px 0; font-size: 12px; color: var(--dsw-alias-state-warn-primary); overflow-wrap: anywhere; }',
      // ── the foot: the dock's one button, or nothing ──────────────────────────────
      '.gw-progress-foot { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; padding: 0 4px 4px; border-top: 1px solid var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-dock { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding-top: 10px; }',
      '.gw-progress-dock-fill { display: block; width: 100%; height: 40px; border: 0; border-radius: 12px; background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-label-inverse, inherit); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }',
      '.gw-progress-dock-fill:hover { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 85%, var(--dsw-alias-label-primary, currentColor)); }',
      '.gw-progress-dock-fill:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 3px; }',
      '.gw-progress-filled { margin: 0; text-align: center; font-size: 12px; color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-empty { padding: 14px 4px; color: var(--dsw-alias-label-secondary, inherit); }',
      // ── the Guardian lane (kept from the previous page, colour only) ──────────────
      '.gw-progress-guardian { box-sizing: border-box; min-width: 0; margin-top: 16px; padding: 11px 14px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 28%, var(--dsw-alias-border-l2, currentColor)); border-radius: 14px; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent); }',
      '.gw-progress-guardian[data-state="active"] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, var(--dsw-alias-border-l2, currentColor)); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, transparent); }',
      '.gw-progress-guardian[data-state="cancelled"] { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 38%, var(--dsw-alias-border-l2, currentColor)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 5%, transparent); }',
      // The lane reads as blocks, not as a head plus a list: two tiles a row, and the
      // findings (or the sentence that there are none) across the whole width.
      '.gw-progress-guardian-blocks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }',
      '.gw-progress-guardian-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-state-idle-primary) 6%, transparent); }',
      '.gw-progress-guardian-block[data-gw-progress-guardian-block="findings"] { grid-column: 1 / -1; padding: 0; border-color: transparent; background: transparent; }',
      '.gw-progress-guardian-block-label { font-size: 10px; font-weight: 600; letter-spacing: .06em; color: var(--dsw-alias-label-secondary, inherit); overflow-wrap: anywhere; }',
      '.gw-progress-guardian-block-value { font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-primary, inherit); overflow-wrap: anywhere; }',
      // The state word keeps the colour it always had, on the tile that now holds it.
      '.gw-progress-guardian[data-state="active"] [data-gw-progress-guardian-block="status"] .gw-progress-guardian-block-value { color: var(--dsw-alias-state-business-primary); }',
      '.gw-progress-guardian[data-state="finished"] [data-gw-progress-guardian-block="status"] .gw-progress-guardian-block-value { color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-guardian[data-state="cancelled"] [data-gw-progress-guardian-block="status"] .gw-progress-guardian-block-value { color: var(--dsw-alias-state-warn-primary); }',
      '.gw-progress-guardian-empty { margin: 0; color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; }',
      '.gw-progress-guardian-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }',
      '.gw-progress-guardian-list li { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; padding: 6px 8px; border-inline-start: 3px solid var(--dsw-alias-state-warn-primary, currentColor); border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 5%, transparent); font-size: 11px; }',
      '.gw-progress-guardian-list li[data-action="rescue"] { border-inline-start-color: var(--dsw-alias-state-success-primary, currentColor); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent); }',
      '.gw-progress-guardian-finding-label { font-weight: 600; }',
      '.gw-progress-guardian-finding-action { color: var(--dsw-alias-label-secondary, inherit); }',
      // ── motion: two decorations, both stoppable ──────────────────────────────────
      '@keyframes gw-progress-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }',
      '@keyframes gw-progress-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }',
      // Motion is decoration here: the card's colour and its spoken state word already say
      // "current", so a reader who asked for less motion loses nothing.
      '@media (prefers-reduced-motion: reduce) {',
      '  .gw-progress-pnode[data-state="doing"] .gw-progress-pnode-dot, .gw-progress-ring[data-state="doing"], .gw-progress-check[data-state="doing"], .gw-progress-chip[data-state="running"] .gw-progress-chip-dot { animation: none; }',
      '}',
      // Under 720px the figure keeps its direction and every row drops to 34px: the cards
      // wrap their word instead of being cut, because a task name on a phone is worth two
      // lines, and nothing is stacked into a column — that would destroy the fork.
      '@media (max-width: 720px) {',
      '  .gw-progress-pnode[data-kind] .gw-progress-pnode-body { min-height: 34px; padding: 4px 8px; }',
      '  .gw-progress-pnode-word { overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }',
      '  .gw-progress-run { white-space: normal; overflow-wrap: anywhere; }',
      '}',
      // Under 480px the dock keeps one full-width button and a call line drops its clock
      // column; the figure still scrolls sideways rather than folding.
      '@media (max-width: 480px) {',
      '  .gw-progress-dock { flex-direction: column; align-items: stretch; }',
      // A list that floats inside a card on a phone has no room for a clock column, so that
      // list drops it. The sheet has the panel's whole width, so it keeps the row it took
      // from the page — clock, verb and tail — on the same two rules it uses everywhere.
      '  .gw-progress-node-calls .gw-progress-log-row { grid-template-columns: minmax(0, 1fr) auto; }',
      '  .gw-progress-node-calls .gw-progress-log-time { display: none; }',
      '  .gw-progress-sheet .gw-progress-log-row { grid-template-columns: 40px minmax(0, 1fr) auto auto; }',
      '  .gw-progress-sheet .gw-progress-log-time { display: inline; }',
      '}',
    ].join('\n')

    /** The one word a chain capsule is called by, when that gate was reached. */
    const PROGRESS_CHAIN_LABEL_KEY = {
      execute: 'progress.chain.execute',
      check: 'progress.chain.check',
      review: 'progress.chain.review',
    }

    /**
     * The word of one call line.
     *
     * The state decides first (a failed line says 没过 whatever role spoke it), then the
     * shipped mark, then the role — a finished `执行`, `检查` and `复核` are three different
     * verbs, so one `done` word would flatten the calls into a column of identical sentences.
     */
    function progressLogWord(row, t) {
      if (row.state !== 'done') return t(PROGRESS_LOG_STATE_KEY[row.state] === undefined ? 'progress.log.done' : PROGRESS_LOG_STATE_KEY[row.state])
      if (row.shipped === true) return t('progress.log.shipped')
      const chain = progressChainForLabel(row.role)
      return t(chain === undefined ? 'progress.log.done' : PROGRESS_LOG_ROLE_KEY[chain.key])
    }

    /**
     * The wall clock of one row's start, as a line prints it (`8:02`).
     *
     * Minutes are padded and hours are not: the column reads as a time, not as a table
     * cell, and a two-digit hour still fits the column.
     */
    function progressClockText(at) {
      const date = new Date(at)
      const hours = date.getHours()
      const minutes = date.getMinutes()
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ''
      return `${hours}:${String(minutes).padStart(2, '0')}`
    }

    /**
     * The one control on a row: opens that child session, and only when the shell can.
     *
     * A capsule the shell cannot open is a plain mark rather than a button, so an
     * unopenable row cannot be clicked into the wrong session.
     * @param childId - the child session the row belongs to, when it has one.
     * @param props - translator, the open gate and the open callback.
     * @returns the capsule element.
     */
    function ProgressOpenPill(childId, props) {
      const label = props.t('progress.member.open')
      const known = typeof childId === 'string' && childId !== ''
      const openable = known && props.canOpen(childId)
      return h(openable ? 'button' : 'span', {
        className: 'gw-progress-open',
        type: openable ? 'button' : undefined,
        'data-gw-progress-open': known ? childId : undefined,
        title: label,
        'aria-label': label,
        onClick: openable ? () => props.openChild(childId) : undefined,
      }, label)
    }

    /**
     * One call, as a line under the node it belongs to.
     *
     * The line is the moment, the gate and the result. The gate is drawn as the chain's own
     * capsule when the call's role names one, because that word *is* the role (`memberLabel`
     * writes exactly those), and a role that names no slot keeps its word instead — a line
     * with a clock and a result and nobody's name would say less than the one it replaces.
     * The task name follows the gate: the node above names the leg, never the task, so this
     * is the only place a reader can see which task the call ran for. When the phase and the
     * role are the same word — a run with no plan tasks logs `规划 规划` — the name says
     * nothing and is dropped.
     * @param row - one story log row.
     * @param props - translator, the open gate and the open callback.
     * @param options - `pill` adds the capsule (only when the shell can open that child),
     *   `childId` names the child, `key` the React key.
     * @returns the row element.
     */
    function ProgressLogRow(row, props, options) {
      const t = props.t
      const slot = progressChainForLabel(typeof row.role === 'string' ? row.role : '')
      const line = []
      if (slot === undefined) {
        line.push(h('span', { key: 'role', className: 'gw-progress-log-role', 'data-gw-progress-log-role': true }, row.role))
      } else {
        line.push(h('span', {
          key: 'chain',
          className: 'gw-progress-call-chain',
          'data-gw-progress-task-chain': true,
        }, t(PROGRESS_CHAIN_LABEL_KEY[slot.key])))
      }
      if (row.title !== '' && row.title !== row.role) {
        line.push(h('span', { key: 'name', className: 'gw-progress-log-name', 'data-gw-progress-log-name': true }, row.title))
      }
      const cells = [
        h('span', { key: 'time', className: 'gw-progress-log-time', 'data-gw-progress-log-time': true },
          typeof row.at === 'number' ? progressClockText(row.at) : ''),
        h('span', { key: 'line', className: 'gw-progress-log-line', 'data-gw-progress-log-line': true }, line),
        h('span', { key: 'word', className: 'gw-progress-log-word', 'data-gw-progress-log-word': true }, progressLogWord(row, t)),
      ]
      if (options.pill === true && props.canOpen(options.childId) === true) {
        cells.push(h('span', { key: 'pill', className: 'gw-progress-log-pill' }, ProgressOpenPill(options.childId, props)))
      }
      return h('li', {
        key: options.key === undefined ? row.seq : options.key,
        className: 'gw-progress-log-row',
        'data-gw-progress-log-row': row.seq,
        'data-state': row.state,
      }, cells)
    }

    /** What a host without layout measured: no width, and every node at its default size. */
    const EMPTY_PANEL_MEASURE = { width: 0, sizes: {} }

    /** The reader's place before the first click: no node open, no wire traced. */
    const EMPTY_PANEL_OPENED = []

    /**
     * Read the real boxes off the page, once per draw.
     *
     * The space the page gave the figure is read from the graph's **parent**, not from the
     * graph itself: the graph's own width is the layout's output, so measuring it there would
     * only ever confirm the number it was given — and the figure is the box that scrolls when
     * the flow is wider than the column. Node heights come back with it: that is what keeps
     * the wires landing on the boxes a reader sees rather than on the defaults a first paint
     * had to guess.
     * @param graph - the `.gw-progress-graph` element, when the host rendered one.
     * @returns the column width and every node's measured box.
     */
    function measureProgressPanel(graph) {
      if (graph === null || graph === undefined) return EMPTY_PANEL_MEASURE
      if (typeof graph.querySelectorAll !== 'function' || typeof graph.getBoundingClientRect !== 'function') return EMPTY_PANEL_MEASURE
      const frameOf = (element) => {
        if (element === null || element === undefined || typeof element.getBoundingClientRect !== 'function') return undefined
        const rect = element.getBoundingClientRect()
        return rect.width > 1 ? rect : undefined
      }
      const host = frameOf(graph.parentElement) === undefined ? frameOf(graph) : frameOf(graph.parentElement)
      const width = host === undefined ? 0 : Math.round(host.width)
      const sizes = {}
      for (const element of Array.from(graph.querySelectorAll('[data-gw-progress-pnode]'))) {
        const id = typeof element.getAttribute === 'function' ? element.getAttribute('data-gw-progress-pnode') : undefined
        if (typeof id !== 'string' || id === '') continue
        if (typeof element.getBoundingClientRect !== 'function') continue
        const rect = element.getBoundingClientRect()
        if (!(rect.width > 1) || !(rect.height > 1)) continue
        sizes[id] = { w: Math.round(rect.width), h: Math.round(rect.height) }
      }
      if (width === 0 && Object.keys(sizes).length === 0) return EMPTY_PANEL_MEASURE
      return { width, sizes }
    }

    /**
     * Whether two measurements are the same draw.
     *
     * The redraw runs after every render and on every resize, so without this comparison a
     * settled page would keep re-rendering itself: an identical measurement has to be a
     * no-op, or the observer would feed its own output back in.
     */
    function samePanelMeasure(left, right) {
      if (left === right) return true
      if (left === undefined || right === undefined) return false
      if (left.width !== right.width) return false
      const one = Object.keys(left.sizes)
      const other = Object.keys(right.sizes)
      if (one.length !== other.length) return false
      for (const id of one) {
        const mine = left.sizes[id]
        const theirs = right.sizes[id]
        if (theirs === undefined || mine.w !== theirs.w || mine.h !== theirs.h) return false
      }
      return true
    }

    /**
     * The badge a card prints beside its word, or `''` when the word says it all.
     *
     * One card carries one: 汇总 says which draft the run actually shipped, because a run may
     * ship a second or a third one and the opened list marks the row it went out on. A task
     * says nothing — a retry inside a task is a second sub box, and that box's own label
     * already numbers it (`· 第 2 遍`) — and so do the five places of the run.
     * @param node - one panel node.
     * @param shipped - the draft number the gate shipped, when the run shipped one.
     * @param t - translator.
     * @returns the badge text, or `''` when this node carries none.
     */
    function progressPanelBadge(node, shipped, t) {
      if (node.kind !== 'summarize') return ''
      if (!Number.isFinite(shipped) || shipped <= 0) return ''
      return t('progress.flow.draft', { n: shipped })
    }

    /**
     * The all-rejected verdict, as rows of the summary node's call list.
     *
     * There is no card for this: the verdict belongs to the step it happened on, so it is
     * read where that step's calls are. Three lines, in the order a reader asks them — how
     * many drafts went in, which gate the last one stopped at, and the gate's own words. The
     * gate is named with the leg word the page already prints for it (`检查` / `复核`), so the
     * verdict adds no vocabulary of its own.
     * @param rejected - the verdict the summary node carries.
     * @param t - translator.
     * @returns one row per fact, in reading order.
     */
    function progressRejectedLines(rejected, t) {
      const gate = t(rejected.stage === 'check' ? 'progress.flow.check' : 'progress.flow.review')
      return [
        ['drafts', t('progress.final.rejected', { n: rejected.drafts })],
        ['stage', t('progress.final.rejectedStage', { stage: gate })],
        ['reason', t('progress.final.rejectedReason', { reason: rejected.reason })],
      ].map(([fact, text]) => h('li', {
        key: 'rejected:' + fact,
        className: 'gw-progress-node-rejected',
        'data-gw-progress-node-rejected': fact,
      }, text))
    }

    /** One edge's identity while the page draws it: the layout carries ids, not objects. */
    function panelEdgeKey(from, to) {
      return `${from}\u0000${to}`
    }

    /**
     * The nodes one traced node lights: itself, and every node it is wired to.
     *
     * The trace owns no data of its own. It is a reading of the edges the figure already
     * draws, so both sets below are derived from `graph.edges` and nothing else — no second
     * description of the run, and no new sentence on the page.
     * @param graph - the panel model.
     * @param traced - the id a click traced, or `undefined` when nothing is traced.
     * @returns every id to mark `active`.
     */
    function panelTraceNodes(graph, traced) {
      const lit = new Set()
      if (traced === undefined) return lit
      lit.add(traced)
      for (const edge of graph.edges) {
        if (edge.from === traced) lit.add(edge.to)
        if (edge.to === traced) lit.add(edge.from)
      }
      return lit
    }

    /**
     * The edges one traced node lights, keyed the way the drawn layout names them.
     *
     * Every other edge of the same figure is dimmed instead, so the picture keeps its
     * structure while the reader's own branch steps forward.
     * @param graph - the panel model.
     * @param traced - the id a click traced, or `undefined` when nothing is traced.
     * @returns the edges to mark `active`.
     */
    function panelTraceEdges(graph, traced) {
      const lit = new Set()
      if (traced === undefined) return lit
      for (const edge of graph.edges) {
        if (edge.from === traced || edge.to === traced) lit.add(panelEdgeKey(edge.from, edge.to))
      }
      return lit
    }

    /** The DOM id of one node's opened call list: the node's own id, reused verbatim. */
    function progressPanelCallsId(id) {
      return `gw-progress-calls-${id}`
    }

    /**
     * One node's opened calls: the rows it declared, then the verdict when it carries one.
     *
     * The list belongs to the node that opened it, and holds the same rows wherever it is
     * drawn: always in the panel's own column under the figure (one sheet at every width),
     * because a floating list over cards lands on the neighbour and the layout will not
     * move a card out of its way (see {@link ProgressPanelSheet}). A row comes from the
     * page's one log line — the same `progressStoryLogRow` any other reading of that call
     * would use — and only the row the gate shipped carries the shipped mark.
     * @param node - one panel node.
     * @param props - translator, the open gate, the opener and the shipped row's `seq`.
     * @returns the list element.
     */
    function ProgressPanelCalls(node, props) {
      const rows = node.calls.map((member) => ProgressLogRow(
        progressStoryLogRow(member, props.shippedSeq !== undefined && member.seq === props.shippedSeq ? member : undefined),
        props,
        { key: `call:${member.seq}`, childId: member.childId, pill: true },
      ))
      // The all-rejected verdict has no card of its own: it belongs to the step it happened
      // on, so it is read where that step's calls are.
      const verdict = node.rejected === undefined ? [] : progressRejectedLines(node.rejected, props.t)
      return h('ol', {
        key: 'calls',
        className: 'gw-progress-node-calls',
        'data-gw-progress-node-calls': node.id,
        id: progressPanelCallsId(node.id),
        'aria-label': props.t('progress.panel.list', { node: node.label }),
      }, [...rows, ...verdict])
    }

    /** The dictionary prefix of each row of lights: the six ring words, the five checks. */
    const PROGRESS_RING_KEY = 'progress.ring.'
    const PROGRESS_CHECK_KEY = 'progress.verify.'

    /**
     * The row of lights one card carries: six rings on a task, five checks on 验收.
     *
     * The opened calls, drawn under the figure instead of on top of it.
     *
     * A node's list used to float out from under its own box and land on the card beside
     * it. So the list leaves the figure altogether and is drawn in the panel's own column,
     * right after the figure — where it can push the page down but never cross a rectangle
     * it did not draw, and where the dock's button stays in front of it rather than under it.
     *
     * Nothing in the list changes with the box that carries it: the same rows from the same
     * renderer, the same verdict lines, the same ids the node's `aria-controls` names. Each
     * opened node is named by the card's own word, because the figure may be out of sight by
     * the time the list is read, and one control puts the whole thing away — the second way
     * into the toggle a node click already owns.
     * @param nodes - the opened nodes that have something to show, in the order they opened.
     * @param props - translator, the row props and the close handler.
     * @param sheetRef - the ref the page scrolls into view when the sheet opens.
     * @returns the sheet element.
     */
    function ProgressPanelSheet(nodes, props, sheetRef) {
      const names = nodes.map((node) => node.label).filter((label) => label !== '').join('、')
      return h('div', {
        className: 'gw-progress-sheet',
        'data-gw-progress-sheet': true,
        role: 'region',
        'aria-label': props.t('progress.panel.calls') + (names === '' ? '' : '：' + names),
        ref: sheetRef,
      },
      h('div', { key: 'head', className: 'gw-progress-sheet-head' },
        h('span', { key: 'title', className: 'gw-progress-sheet-title' }, props.t('progress.panel.calls')),
        h('button', {
          key: 'hide',
          type: 'button',
          className: 'gw-progress-sheet-hide',
          'data-gw-progress-sheet-hide': true,
          onClick: props.onSheetClose,
        }, props.t('progress.panel.collapse'))),
      nodes.map((node) => h('div', { key: `calls:${node.id}`, className: 'gw-progress-sheet-group' },
        h('p', { key: 'node', className: 'gw-progress-sheet-node' }, node.label),
        ProgressPanelCalls(node, props))))
    }

    /**
     * Bring the sheet into the reader's view when it opens.
     *
     * **Not** `block: 'nearest'`: the shell keeps its composer pinned to the bottom of the
     * screen, so a list scrolled to the nearest edge comes to rest exactly behind it — the
     * reader taps a card, the list opens, and nothing looks like it happened. Centring puts
     * the list in the middle of the column the reader is looking at, which leaves the bottom
     * of the screen free at any phone height. The sheet is in the page's flow, so this moves
     * the page and covers nothing.
     *
     * A host without layout passes no box, and a page with no sheet (every wide window) never
     * calls this at all: the guard is what keeps it from being a no-op that still throws.
     * @param box - the sheet element, when the page drew one.
     */
    function progressPanelReveal(box) {
      if (box === undefined || box === null || typeof box.scrollIntoView !== 'function') return
      box.scrollIntoView({ block: 'center' })
    }

    /**
     * The attempt dots of one task node, and the dashed step between a failed try and the
     * one that followed it.
     *
     * The row of lights one card carries: six rings on a task, five checks on 验收.
     * The lights are decoration looked up on the model by node id, not lines of the mermaid
     * text: they say how far a step got of its six legs, not which step it is, and the text is
     * the structure. Each light is one dot in the card's second row, coloured by the same
     * state vocabulary every other dot on the page uses, with its own word as the tooltip. The
     * row is `aria-hidden`, so the card's spoken label stays the one short sentence a screen
     * reader hears.
     * @param node - one panel node.
     * @param t - translator.
     * @returns the lights' row, or `null` when this card carries none.
     */
    function ProgressPanelLights(node, t) {
      const checks = Array.isArray(node.checks) && node.checks.length > 0
      const list = checks ? node.checks : node.rings
      if (!Array.isArray(list) || list.length === 0) return null
      return h('span', {
        key: 'lights',
        className: 'gw-progress-pnode-lights',
        'data-gw-progress-pnode-lights': checks ? 'checks' : 'rings',
        title: t(checks ? 'progress.panel.checks' : 'progress.panel.rings'),
        'aria-hidden': 'true',
      }, list.map((light) => h('span', {
        key: light.key,
        className: checks ? 'gw-progress-check' : 'gw-progress-ring',
        [checks ? 'data-gw-progress-check' : 'data-gw-progress-ring']: light.key,
        'data-state': light.state,
        title: t((checks ? PROGRESS_CHECK_KEY : PROGRESS_RING_KEY) + light.key),
      })))
    }

    /**
     * One card of the figure.
     *
     * The visible text is the step's own word, or a task's title, or a sub box's call, plus
     * the badge when one is due. Under it sits the row of lights: a task's six rings, 验收's
     * five checks. Everything else is colour and a spoken state word — the page adds no
     * sentence to a card.
     *
     * The body is the card's control whenever it has something to open — a real `button`, so
     * Enter and Space reach it — and a plain `div` when it has nothing, which is the same rule
     * the page always had: a mark is not a control. One click does the two readings this page
     * offers: it opens (or closes) the calls, and it lights (or drops) the wires that touch
     * this card. The trace is not a second control, so a card with nothing to open still
     * answers a pointer and gets no button of its own.
     *
     * Where the opened list is drawn depends on the width, and only on that: on the card
     * itself while there is room beside it, in the page's sheet under the figure when there
     * is not (`props.sheet`). The click that opens it is the same click either way, so the
     * card's own behaviour does not change with the window.
     * @param node - one panel node.
     * @param box - its laid-out box; `box.column` is the column the text put it in.
     * @param props - translator, the open and trace state, the handlers and the row props.
     * @returns the node element.
     */
    function ProgressPanelNode(node, box, props) {
      const t = props.t
      const badge = progressPanelBadge(node, props.shippedDraft, t)
      const stateWord = t(PROGRESS_PLAN_KEY[node.state] === undefined ? 'progress.plan.waiting' : PROGRESS_PLAN_KEY[node.state])
      const open = props.opened.indexOf(node.id) !== -1
      const traced = props.tracedNodes.has(node.id)
      const onClick = () => props.onNodeClick(node.id)
      const subtask = node.subtask === undefined || node.subtask === null ? undefined : node.subtask
      const badgeSpan = badge === '' ? null : h('span', {
        key: 'badge',
        className: 'gw-progress-pnode-badge',
        'data-gw-progress-pnode-badge': true,
      }, badge)
      // A capsule keeps its word alone on the line and puts the badge under it: 汇总 and a
      // draft number do not fit one 88 px pill, and a card that cuts its own title to `汇` is
      // worse than a card that is one row taller.
      const capsule = node.kind !== 'task' && node.kind !== 'sub'
      const main = h('span', { key: 'main', className: 'gw-progress-pnode-main' }, [
        h('span', { key: 'dot', className: 'gw-progress-pnode-dot', 'aria-hidden': 'true' }),
        h('span', {
          key: 'word',
          className: 'gw-progress-pnode-word',
          'data-gw-progress-pnode-word': true,
          title: node.label,
        }, node.label),
        capsule ? null : badgeSpan,
      ])
      const detail = capsule && badgeSpan !== null
        ? h('span', { key: 'detail', className: 'gw-progress-pnode-detail' }, badgeSpan)
        : null
      const parts = [main, detail, ProgressPanelLights(node, t)]
      return h('li', {
        key: node.id,
        className: 'gw-progress-pnode',
        'data-gw-progress-pnode': node.id,
        'data-kind': node.kind,
        // The column the text decided, not a number the model guessed at: the figure is laid
        // out from the mermaid source, so the drawn level is the layout's own.
        'data-level': String(box.column),
        'data-state': node.state,
        'data-current': node.current ? 'true' : 'false',
        // The card that is open is the card that is on top: its list hangs outside its own box.
        ...open ? { 'data-open': 'true' } : {},
        ...subtask === undefined ? {} : {
          // A branch without a plan number still belongs to a card: `taskId` is `u1`
          // then, so the marker carries the owner instead of vanishing. Without it the
          // DOM names the call but not the card it hangs under.
          'data-task': subtask.taskNumber === undefined ? subtask.taskId : String(subtask.taskNumber),
          'data-subtask': String(subtask.seq),
        },
        ...traced ? { 'data-trace': 'active' } : {},
        // Position and width come from the layout; the height is left to the box, so what
        // the page measures next is what a reader is really looking at.
        style: { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px` },
        'aria-label': [node.label, badge, stateWord].filter((part) => part !== '').join(' '),
        // A card that carries a button answers the click on that button; a card that does
        // not is still the thing a reader points at, so the trace lives on the mark itself.
        ...node.openable ? {} : { onClick },
      },
      node.openable
        ? h('button', {
          key: 'body',
          type: 'button',
          className: 'gw-progress-pnode-body',
          'data-gw-progress-pnode-open': node.id,
          'aria-expanded': open,
          'aria-controls': progressPanelCallsId(node.id),
          // The affordance is discoverable only where there is a line to read.
          ...props.linked.has(node.id) ? { title: t('progress.panel.trace') } : {},
          onClick,
        }, parts)
        : h('div', { key: 'body', className: 'gw-progress-pnode-body' }, parts),
      // The list is never the node's to draw: it lives in the sheet under the
      // figure, where it cannot land on the card beside this one. The node keeps the two
      // attributes that say what it opened; where that list lives is the page's business.
      // WHY the node draws nothing: the floating box a node used to draw over its own card
      // measured over the neighbour at desktop width (one open list over 2 cards, four over
      // 9). The sheet is in the page flow so it can only push the page down, never across
      // a card — the same box both widths now share.
      open && props.sheet !== true ? ProgressPanelCalls(node, props) : null)
    }

    /**
     * The standing legend of a lit trace: five short sentences under the figure.
     *
     * Only while a node is opened (traced !== undefined): a lit wire is a wire the reader's
     * own click lit, a dimmed wire is one it did not touch, the six dots are a task card's
     * six stages, the five dots are the run's five checks, and a dimmed dot only ever says the event stream has not reached that stage yet — never that it failed. Plain text in the page flow,
     * so a phone wraps it instead of covering a card.
     * @param t - translator.
     * @returns the legend element.
     */
    function ProgressPanelLegend(t) {
      const item = (key, mark) => h('li', { key, className: 'gw-progress-legend-item' }, [mark, h('span', { key: 'word' }, t(key))])
      return h('ul', {
        className: 'gw-progress-legend',
        'data-gw-progress-legend': true,
      }, [
        item('progress.panel.legend.traced', h('span', { key: 'mark', className: 'gw-progress-legend-wire', 'data-trace': 'active', 'aria-hidden': 'true' })),
        item('progress.panel.legend.untraced', h('span', { key: 'mark', className: 'gw-progress-legend-wire', 'data-trace': 'dim', 'aria-hidden': 'true' })),
        item('progress.panel.legend.rings', h('span', { key: 'mark', className: 'gw-progress-legend-dot', 'aria-hidden': 'true' })),
        item('progress.panel.legend.checks', h('span', { key: 'mark', className: 'gw-progress-legend-dot', 'aria-hidden': 'true' })),
        item('progress.panel.legend.pending', h('span', { key: 'mark', className: 'gw-progress-legend-dot', 'data-state': 'pending', 'aria-hidden': 'true' })),
      ])
    }

    /**
     * The graph itself: the wire layer, and the nodes it is drawn behind.
     *
     * The picture is laid out from the mermaid text the graph carries, so what a reader sees
     * and what any other reader can parse are one graph. The layer is always present, even
     * before anything was measured — an `svg` holding only the arrow head is the honest
     * drawing of "no line was measured yet", and adding the layer later would make the page
     * jump once on a real session. Every wire points: the arrow says which step follows
     * which, and it is drawn in the border token because direction is structure, never state.
     *
     * The figure is wrapped in its own scroll box: the run is left to right at every width, so
     * a phone scrolls the picture instead of folding it into a column — and the page itself
     * never scrolls sideways. The box only grows when a card's calls are open, because the
     * list floats under its card and the clip would otherwise be the one thing that eats it.
     *
     * The graph is also the page's "never mind" target: a click on the empty figure drops the
     * trace, while a click that bubbled up from a card is left to that card.
     * @param graph - the panel model.
     * @param layout - the computed layout of `parsePanelMermaid(graph.mermaid)`.
     * @param graphRef - the ref the measurement reads and the observer watches.
     * @param props - translator, the open and trace state, the handlers and the row props.
     * @returns the graph element.
     */
    function ProgressPanelGraph(graph, layout, graphRef, props, runName) {
      // The picture is laid out from the text, so a parsed id is translated back to the
      // model's own before anything is looked up: the DOM then agrees with the model.
      const boxes = new Map(layout.nodes.map((box) => [panelModelIdFor(box.id), box]))
      const kinds = new Map(graph.edges.map((edge) => [panelEdgeKey(edge.from, edge.to), edge.kind]))
      const nodes = graph.nodes.filter((node) => boxes.has(node.id))
      // A node only carries the trace's tooltip when it has a wire to light.
      const linked = new Set()
      for (const edge of graph.edges) {
        linked.add(edge.from)
        linked.add(edge.to)
      }
      const nodeProps = { ...props, linked }
      return h('div', {
        className: 'gw-progress-figure',
        'data-gw-progress-figure': true,
        ...props.opened.length === 0 ? {} : { 'data-open': 'true' },
      },
      h('div', {
        className: 'gw-progress-graph',
        'data-gw-progress-graph': true,
        'data-gw-progress-source': graph.mermaid,
        'aria-label': props.t('progress.panel.graph', { run: runName }),
        role: 'group',
        ref: graphRef,
        style: { width: `${layout.width}px`, height: `${layout.height}px` },
        onClick: props.onBackgroundClick,
      },
      h('svg', {
        className: 'gw-progress-wires',
        'data-gw-progress-wires': true,
        'aria-hidden': 'true',
        viewBox: `0 0 ${layout.width} ${layout.height}`,
      },
      h('defs', { key: 'defs' }, h('marker', {
        id: 'gw-progress-arrow',
        markerWidth: 8,
        markerHeight: 8,
        refX: 7,
        refY: 4,
        orient: 'auto',
        markerUnits: 'userSpaceOnUse',
      }, h('path', { d: 'M0 0 L8 4 L0 8 Z', fill: 'var(--dsw-alias-border-l2, currentColor)' }))),
      layout.edges.map((edge, index) => {
        const from = panelModelIdFor(edge.from)
        const to = panelModelIdFor(edge.to)
        const key = panelEdgeKey(from, to)
        return h('path', {
          key: `edge:${index}`,
          'data-gw-progress-edge': true,
          'data-from': from,
          'data-to': to,
          'data-kind': kinds.get(key),
          // No trace, no mark: an untraced figure says nothing about a reading nobody made.
          ...props.traced === undefined ? {} : { 'data-trace': props.tracedEdges.has(key) ? 'active' : 'dim' },
          'marker-end': 'url(#gw-progress-arrow)',
          d: edge.d,
        })
      })),
      h('ol', { className: 'gw-progress-pnodes', 'data-gw-progress-pnodes': true },
        nodes.map((node) => ProgressPanelNode(node, boxes.get(node.id), nodeProps)))))
    }


    /**
     * The Guardian side lane reports liveness interventions only. It does not
     * infer task quality or retry state from a timeout/rescue finding.
     *
     * The lane is a block grid rather than a head plus a list: the state word, the budget
     * and the number of interventions each get their own tile, and the findings take the
     * full width under them. It carries no copy of its own — every word here is a
     * `progress.guardian.*` key the lane already shipped.
     */
    function ProgressGuardianPanel(guardian, t) {
      if (guardian === undefined || guardian === null || guardian.started !== true) return null
      const findings = Array.isArray(guardian.findings) ? guardian.findings : []
      const state = guardian.ended === true
        ? (guardian.cancelled === true ? 'cancelled' : 'finished')
        : (guardian.armed === true ? 'active' : 'disarmed')
      const statusKey = state === 'active'
        ? 'progress.guardian.active'
        : state === 'disarmed'
          ? 'progress.guardian.disarmed'
          : state === 'cancelled'
            ? 'progress.guardian.cancelled'
            : 'progress.guardian.finished'
      const budgetMs = Number(guardian.budgetMs)
      const seconds = Number.isFinite(budgetMs) && budgetMs > 0 ? Math.round(budgetMs / 1000) : 0
      const block = (name, children) => h('div', {
        key: name,
        className: 'gw-progress-guardian-block',
        'data-gw-progress-guardian-block': name,
      }, children)
      return h('aside', {
        className: 'gw-progress-guardian',
        'data-gw-progress-guardian': true,
        'data-state': state,
        'aria-label': t('progress.guardian.title'),
      },
      h('div', { className: 'gw-progress-guardian-blocks', 'data-gw-progress-guardian-blocks': true },
        block('status', [
          h('span', { key: 'label', className: 'gw-progress-guardian-block-label' }, t('progress.guardian.title')),
          h('span', { key: 'value', className: 'gw-progress-guardian-block-value', role: 'status' }, t(statusKey)),
        ]),
        block('budget', h('span', { className: 'gw-progress-guardian-block-value' }, t('progress.guardian.budget', { seconds }))),
        block('count', h('span', { className: 'gw-progress-guardian-block-value' }, t('progress.guardian.count', { count: findings.length }))),
        block('findings', findings.length === 0
          ? h('p', { className: 'gw-progress-guardian-empty' }, t('progress.guardian.empty'))
          : h('ul', { className: 'gw-progress-guardian-list', 'aria-label': t('progress.guardian.count', { count: findings.length }) },
            findings.slice(-4).map((finding, index) => {
              const actionKey = finding.action === 'rescue' ? 'progress.guardian.rescue' : finding.action === 'observe' ? 'progress.guardian.observe' : 'progress.guardian.cancel'
              const label = typeof finding.label === 'string' && finding.label !== '' ? finding.label : '#' + finding.seq
              return h('li', {
                key: 'guardian:' + finding.seq + ':' + (finding.atMs === undefined ? index : finding.atMs),
                'data-action': finding.action === 'rescue' ? 'rescue' : finding.action === 'observe' ? 'observe' : 'cancel-run',
                title: typeof finding.reason === 'string' ? finding.reason : undefined,
              },
              h('span', { className: 'gw-progress-guardian-finding-label' }, label),
              h('span', { className: 'gw-progress-guardian-finding-action' }, t(actionKey)))
            })))))
    }


    /** The step sentence under the title: the step the run is on, and the remainder when measured. */
    function progressPanelHeadline(graph, t) {
      const step = t('progress.panel.step', { at: graph.headline.at, total: graph.headline.total })
      const eta = graph.headline.eta
      if (eta === undefined) return step
      return `${step} · ${t('progress.panel.eta', { time: progressPanelDuration(eta.ms, t) })}`
    }

    /** The task sentence under the step sentence: how many task cards the figure draws, apart from the steps. */
    function progressPanelTaskLine(graph, t) {
      return t('progress.panel.tasks', { count: graph.headline.taskCount })
    }

    /**
     * How the estimate was obtained, as the sentence's tooltip.
     *
     * The visible line never says it: a reader who wants to know what the number rests on
     * asks for it, and a reader who does not is not made to read a method statement under
     * every run. Absent, like the estimate itself, when nothing was measured.
     */
    function progressPanelEtaTitle(graph, t) {
      const eta = graph.headline.eta
      return eta === undefined ? undefined : t('progress.panel.etaBasis', { n: eta.basis })
    }

    /** The stuck line's one sentence, in the shape its verdict calls for. */
    function progressPanelStuckText(stuck, t) {
      if (stuck.kind === 'failed') return t('progress.panel.stuck.failed', { at: stuck.at, role: stuck.role, n: stuck.attempt })
      if (stuck.kind === 'blocked') return t('progress.panel.stuck.blocked', { at: stuck.at })
      return t('progress.panel.stuck.rejected', { at: stuck.at, n: stuck.drafts })
    }

    /**
     * The "进度" view: one task panel.
     *
     * The page is the run, read top to bottom:
     *
     * - the **header**: the run's own name and the five-state chip on one row, and under them
     *   one sentence — which step the run is on, and, when it can be measured, what is left;
     * - the **graph**: every step, every plan task it walked, and the edges between them,
     *   laid out from the mermaid text the container carries;
     * - the **opened calls**: one sheet under the figure at every width (after the figure,
     *   before the stuck line), so an opened list only pushes the page down;
     * - the **stuck line**, and only while the run really is stuck;
     * - the **Guardian** card, when the stream recorded liveness monitoring;
     * - the **dock**: one button that fills the input box, or nothing.
     *
     * The page prints no number the events did not report — no percentage, no pass rate — and
     * the single estimate it does print says in its tooltip what it rests on. Two readings
     * are the reader's own: opening a node's calls, and lighting the wires that touch it.
     * Neither one writes, sends, or fetches anything; the dock's button is the only control
     * that reaches another surface, and it stops at the input box.
     * @param props - slot props.
     * @returns the tab element.
     */
    function ProgressView(props) {
      const t = guardedTranslator(props.t, typeof props.progressT === 'function' ? props.progressT : translator(FALLBACK_LOCALE))
      const snapshot = props.useGrokProgress === undefined ? EMPTY_PROGRESS_SNAPSHOT : props.useGrokProgress((value) => value)
      const run = snapshot === undefined ? undefined : snapshot.activeRun
      // `t` belongs in the dependency list: the leg words and the mermaid text are resolved
      // into the model, so a locale switch has to build a new model or the graph would keep
      // the old language until the run changed.
      const graph = useMemo(() => (run === undefined ? undefined : derivePanelGraph(run, t)), [run, t])
      // The one stateful thing on the page: whether *this* render already filled the box.
      const [filled, setFilled] = useState(false)
      // The other two are the reader's place: which nodes are open, and which node's wires
      // are being read. Both are this page's alone — they survive no reload and say nothing
      // to the session.
      const [opened, setOpened] = useState(EMPTY_PANEL_OPENED)
      const [traced, setTraced] = useState(undefined)
      const graphRef = useRef(null)
      const sheetRef = useRef(null)
      const [measure, setMeasure] = useState(EMPTY_PANEL_MEASURE)
      // The list no longer depends on the width: both widths share the sheet under the
      // figure, so there is no breakpoint state to keep in step with the window.
      // WHY removed: `narrow` existed only to pick the box; one box needs no picker.
      // Rotation and resize need no listener for this: the sheet is in the page flow.
      // One draw per render, plus the two things that move the boxes the wires land on: a
      // container resize (a sidebar toggle does not resize the window) and a window resize.
      // An unchanged measurement is not a render, so the observer cannot feed itself.
      useEffect(() => {
        const host = graphRef === null || graphRef === undefined ? undefined : graphRef.current
        const draw = () => {
          const next = measureProgressPanel(host)
          setMeasure((current) => (samePanelMeasure(current, next) ? current : next))
        }
        draw()
        const ResizeObserverFace = globalThis.ResizeObserver
        const observer = host !== null && host !== undefined && typeof ResizeObserverFace === 'function'
          ? new ResizeObserverFace(draw)
          : undefined
        if (observer !== undefined) observer.observe(host)
        const view = globalThis
        if (typeof view.addEventListener === 'function') view.addEventListener('resize', draw)
        return () => {
          if (observer !== undefined) observer.disconnect()
          if (typeof view.removeEventListener === 'function') view.removeEventListener('resize', draw)
        }
      })
      // The sheet is the one box at every width, so no listener has to move the list
      // when the window narrows or widens. The initial reading stays the render's own.

      // The picture is laid out from its own mermaid text, which is why the figure a reader
      // sees and the structure anything else can read cannot disagree. Before the first
      // measurement the default sizes stand in, so a host without layout still renders.
      const parsed = graph === undefined ? undefined : parsePanelMermaid(graph.mermaid)
      // Which cards are two rows tall is a fact about the model, looked up by id: neither the
      // lights nor the shipped draft are in the text, so the layout is told about them instead
      // of reading them off it. The badge's own predicate is the one the card prints it with.
      const floors = new Map()
      if (graph !== undefined) {
        for (const node of graph.nodes) {
          if ((Array.isArray(node.rings) && node.rings.length > 0) || (Array.isArray(node.checks) && node.checks.length > 0)) {
            floors.set(node.id, PANEL_LIGHT_HEIGHT)
            continue
          }
          if (progressPanelBadge(node, graph.final === undefined ? undefined : graph.final.draft, t) === '') continue
          floors.set(node.id, PANEL_BADGE_ROW_HEIGHT)
        }
      }
      const layout = parsed === undefined
        ? undefined
        : layoutPanelGraph(parsed, measure.sizes, measure.width > 0 ? measure.width : PANEL_DEFAULT_WIDTH, floors)
      // One click, two readings: a node that has calls opens (or closes) them, and any node
      // lights (or drops) the wires that touch it — the trace is a way to read the lines the
      // figure already draws, not a second thing to look at.
      const onNodeClick = (id) => {
        setOpened((current) => (current.indexOf(id) === -1 ? [...current, id] : current.filter((entry) => entry !== id)))
        setTraced((current) => (current === id ? undefined : id))
      }
      // The empty part of the figure is the "never mind" target. A click that bubbled up from
      // a node is that node's, so the container only acts when the click landed on itself.
      const onBackgroundClick = (event) => {
        if (event !== undefined && event !== null && event.target !== event.currentTarget) return
        setTraced(undefined)
      }
      // The sheet's one control is the same toggle a node answers: every opened list closes
      // and the trace drops, which is what tapping each of those nodes again would do. A
      // phone reader who scrolled past the card can still put the list away from here.
      const onSheetClose = () => {
        setOpened(EMPTY_PANEL_OPENED)
        setTraced(undefined)
      }
      const panelProps = graph === undefined || layout === undefined ? undefined : {
        t,
        // Where the opened lists are drawn: always in the sheet under the figure.
        // WHY one box for both widths: the floating list that a node draws over its own
        // card lands on the neighbour card at any width where cards sit close together.
        // The narrow sheet already proved itself at 390/360 (intersection 0 with every
        // card and with the dock): reuse it everywhere instead of keeping a second box
        // that only works when the neighbours happen to be far apart. A wide window keeps
        // its three-column layout; only the opened calls move out of the figure.
        sheet: true,
        canOpen: (childId) => typeof props.canOpen === 'function' && props.canOpen(childId) === true,
        openChild: (childId) => {
          if (typeof props.openChild === 'function') props.openChild(childId)
        },
        // The row the gate shipped, by `seq`: the opened list marks it 交卷 and no other row.
        shippedSeq: graph.final === undefined ? undefined : graph.final.seq,
        // …and its draft number, which is the one badge the figure prints (on 汇总).
        shippedDraft: graph.final === undefined ? undefined : graph.final.draft,
        opened,
        traced,
        tracedNodes: panelTraceNodes(graph, traced),
        tracedEdges: panelTraceEdges(graph, traced),
        onNodeClick,
        onBackgroundClick,
        onSheetClose,
      }
      // Only what a reader could open is carried into the sheet: a node that declares nothing
      // has no list, so tapping one asks for lines that do not exist and the sheet stays away.
      const sheetNodes = graph === undefined
        ? []
        : opened
          .map((id) => graph.nodes.find((node) => node.id === id && node.openable))
          .filter((node) => node !== undefined)
      const sheet = panelProps !== undefined && sheetNodes.length > 0
        ? ProgressPanelSheet(sheetNodes, panelProps, sheetRef)
        : null
      // A list that opened below the fold would leave a reader who just tapped a card with
      // nothing to read. The sheet is in the page's flow, so bringing it into view costs no
      // layout and covers nothing.
      useEffect(() => {
        progressPanelReveal(sheetRef === undefined || sheetRef === null ? undefined : sheetRef.current)
      }, [sheetNodes.length])

      // The dock's button is the only thing the `conversation` service is needed for: with no
      // way to write the box, the page offers no button instead of one that would do nothing
      // (§19.4). One state asks for a click: a run that has not started yet is waiting for the
      // reader to say go. A finished run asks for nothing — the clicks it used to want were
      // bookkeeping, and the run is done whether or not anyone confirms it.
      const fillDraft = typeof props.fillDraft === 'function' ? props.fillDraft : undefined
      const dock = graph !== undefined && graph.state === 'waiting' ? 'start' : 'none'
      const dockButton = dock === 'none' || fillDraft === undefined
        ? null
        : h('button', {
          type: 'button',
          className: 'gw-progress-dock-fill',
          'data-gw-progress-dock-fill': true,
          onClick: () => {
            if (fillDraft() === true) setFilled(true)
          },
        }, t('progress.dock.start'))
      const header = graph === undefined ? null : h('header', {
        className: 'gw-progress-bar',
        'data-gw-progress-bar': true,
        // The header is the page's one labelled place: a reader landing here hears whose
        // run this is before the step sentence, the figure and the stuck line.
        'aria-label': run.name,
      },
        h('span', { className: 'gw-progress-run', 'data-gw-progress-run': true, title: run.name }, run.name),
        h('span', {
          className: 'gw-progress-chip',
          'data-gw-progress-chip': graph.state,
          'data-state': graph.state,
          role: 'status',
        },
        h('span', { className: 'gw-progress-chip-dot', 'aria-hidden': 'true' }),
        t(PROGRESS_CHIP_KEY[graph.state] === undefined ? 'progress.chip.running' : PROGRESS_CHIP_KEY[graph.state])),
        h('p', {
          className: 'gw-progress-line',
          'data-gw-progress-line': true,
          title: progressPanelEtaTitle(graph, t),
        }, progressPanelHeadline(graph, t)),
        h('p', {
          className: 'gw-progress-count',
          'data-gw-progress-count': true,
        }, progressPanelTaskLine(graph, t)))
      const stuck = graph === undefined ? undefined : graph.stuck
      return h('section', {
        className: 'gw-progress',
        'data-gw-progress': true,
      },
      // Scoped stylesheet, rendered in the tab's own tree: React removes it when the tab
      // unmounts, and every rule is scoped to `.gw-progress`, so nothing leaks either way.
      h('style', { 'data-gw-progress-css': true }, PROGRESS_CSS),
      graph === undefined
        ? h('div', { className: 'gw-progress-empty', 'data-progress-empty': true }, t('progress.empty.title'))
        : [
          header,
          ProgressPanelGraph(graph, layout, graphRef, panelProps, run.name),
          // The trace legend stands under the figure, only while a trace is lit: five
          // standing words that say what a lit wire, a dimmed wire, the six dots, the
          // five dots and a dimmed dot each mean (dimmed is "not run yet", never failed).
          // Closed, the page says nothing about a reading nobody made.
          panelProps.traced === undefined ? null : ProgressPanelLegend(t),
          // The opened calls come out of the figure and stand here, in the
          // panel's own column: after the figure, so they can only push the page down — never
          // across a card, and never over the dock's button, which follows them.
          sheet,
          // The sentence exists only while something is stuck: an empty box under the graph
          // would say "there is something here" about nothing.
          stuck === undefined
            ? null
            // One sentence, read whole: the live region is atomic so a reader hears the held
            // step and the verdict in one pass, never a fragment of a sentence.
            : h('p', { className: 'gw-progress-stuck', 'data-gw-progress-stuck': true, role: 'status', 'aria-atomic': 'true' },
              progressPanelStuckText(stuck, t)),
          ProgressGuardianPanel(run.guardian, t),
          h('footer', { className: 'gw-progress-foot' },
            h('div', { className: 'gw-progress-dock', 'data-gw-progress-dock': true, 'data-state': dock },
              dockButton,
              // The success line exists only after a write the editor accepted: a refused
              // fill says nothing rather than claiming the box was filled.
              filled && dockButton !== null
                ? h('p', { className: 'gw-progress-filled', 'data-gw-progress-filled': true, role: 'status', 'aria-live': 'polite' },
                  t('progress.dock.filled'))
                : null)),
          // Room to scroll the sheet up into. The shell pins its composer over the bottom of
          // this column, and a list that opens at the very end of the content can only move
          // as far as the column can scroll — which, on a run that is barely taller than the
          // screen, is nothing. This is that missing room, and it exists only while the sheet
          // does: it sits after the footer, so no button moves to make it.
          sheet === null
            ? null
            : h('div', { className: 'gw-progress-sheet-room', 'aria-hidden': 'true' }),
        ])
    }

    /**
     * The event definition: one node per run, folded from the four recorded events.
     *
     * `kind` and `target` are registry identities, and they carry this plugin's own
     * prefix on purpose: a second registration of either name collides loudly instead of
     * silently displacing another bundle's view.
     *
     * The fold is a pure replay of the state so far plus the arriving event, so the update
     * path and `foldProgressEvents` cannot disagree about idempotency or order. The state
     * is treated as immutable: a repeated `agent-start` returns the same object, which is
     * what keeps an unrelated session event from producing a new snapshot.
     */
    const progressEventDefinition = {
      kind: PROGRESS_KIND,
      target: PROGRESS_TARGET,
      match: (event) => {
        if (PROGRESS_EVENT_TYPES.indexOf(event.type) === -1) return null
        const data = progressRecord(event.data)
        const runId = data === undefined || typeof data.runId !== 'string' ? undefined : data.runId
        if (runId === undefined) return null
        return { id: runId, role: event.type === 'tool-workflow/run-start' ? 'start' : 'update' }
      },
      start: (_context, match) => {
        const data = progressRecord(match.event.data) || {}
        return {
          runId: typeof data.runId === 'string' ? data.runId : '',
          name: typeof data.name === 'string' ? data.name : '',
          members: [],
          startedAt: match.event.time,
        }
      },
      update: (context, match) => {
        const state = context.state
        const records = [
          { type: 'tool-workflow/run-start', data: { runId: state.runId, name: state.name }, time: state.startedAt },
          ...state.members.map((member) => ({
            type: 'tool-workflow/agent-start',
            data: { runId: state.runId, seq: member.seq, label: member.label, phase: member.phase, childId: member.childId },
            time: member.startedAt,
          })),
          ...state.members.filter((member) => member.outcome !== undefined).map((member) => ({
            type: 'tool-workflow/agent-end',
            data: { runId: state.runId, seq: member.seq, outcome: member.outcome },
            time: member.endedAt,
          })),
          ...(state.guardian?.started === true ? [{
            type: 'tool-workflow/guardian-start',
            data: { runId: state.runId, armed: state.guardian.armed, budgetMs: state.guardian.budgetMs },
          }] : []),
          ...(state.guardian?.findings ?? []).map((finding) => ({
            type: 'tool-workflow/guardian-finding',
            data: { runId: state.runId, ...finding },
          })),
          ...(state.guardian?.ended === true ? [{
            type: 'tool-workflow/guardian-end',
            data: { runId: state.runId, cancelled: state.guardian.cancelled },
          }] : []),
          // The shipped mark is replayed like the guardian's own events: without this line
          // the re-fold below rebuilds the run from its members and the claim evaporates on
          // the very next event — which is the `run-end` that always follows it.
          ...(state.summaryFinalDraft === undefined ? [] : [{
            type: 'tool-workflow/summary-final',
            data: { runId: state.runId, draft: state.summaryFinalDraft },
          }]),
          // The rejected verdict is replayed for the same reason the shipped mark is:
          // without this line the next event's re-fold drops the only fact that says why
          // this run handed in nothing.
          ...(state.summaryRejected === undefined ? [] : [{
            type: 'tool-workflow/summary-rejected',
            data: { runId: state.runId, drafts: state.summaryRejected.drafts, stage: state.summaryRejected.stage, reason: state.summaryRejected.reason },
          }]),
          ...(state.stopReason === undefined ? [] : [{ type: 'tool-workflow/run-end', data: { runId: state.runId, stopReason: state.stopReason }, time: state.endedAt }]),
          { type: match.event.type, data: match.event.data, time: match.event.time },
        ]
        const run = foldProgressEvents(records)[0]
        if (run === undefined) return state
        return {
          runId: run.runId,
          name: run.name,
          members: run.members,
          ...run.guardian === undefined ? {} : { guardian: run.guardian },
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          stopReason: run.stopReason,
          // Carried like the members and the stop reason: the state is re-folded from
          // itself on every later event, so a field left here is a field the next
          // `run-end` erases — which is what turned a shipped draft back into 「没有交稿」.
          ...run.summaryFinalDraft === undefined ? {} : { summaryFinalDraft: run.summaryFinalDraft },
          ...run.summaryRejected === undefined ? {} : { summaryRejected: run.summaryRejected },
        }
      },
      buildViewNode: (context) => {
        const state = context.state
        if (state === undefined) return null
        const start = context.start
        const anchorSeq = start === undefined ? 0 : start.event.seq
        return {
          key: context.key,
          kind: context.kind,
          id: context.id,
          target: PROGRESS_TARGET,
          anchorSeq,
          location: start === undefined ? { kind: 'unresolved' } : start.location,
          data: {
            runId: state.runId,
            name: state.name,
            anchorSeq,
            members: state.members,
            guardian: state.guardian,
            startedAt: state.startedAt,
            endedAt: state.endedAt,
            stopReason: state.stopReason,
            summaryFinalDraft: state.summaryFinalDraft,
            summaryRejected: state.summaryRejected,
          },
        }
      },
    }

    /**
     * The view builder: one snapshot of every run in the session.
     *
     * Identity is the point of `apply`/`replace`: a transaction that changed nothing the
     * track renders returns the *same* snapshot object, so the component's `useMemo` and
     * the store's identity comparison do not fire on an unrelated session event.
     */
    class ProgressSnapshotBuilder {
      constructor() {
        this.nodes = new Map()
        this.signatures = new Map()
        this.current = EMPTY_PROGRESS_SNAPSHOT
        this.empty = EMPTY_PROGRESS_SNAPSHOT
      }

      replace(input) {
        this.nodes.clear()
        this.signatures.clear()
        for (const node of input.nodes) {
          this.nodes.set(node.key, node)
          this.signatures.set(node.key, JSON.stringify(node.data))
        }
        return this.snapshot()
      }

      apply(input) {
        if (input.upserts.length === 0) return this.current
        let changed = false
        for (const node of input.upserts) {
          const signature = JSON.stringify(node.data)
          if (this.signatures.get(node.key) !== signature) {
            changed = true
            this.signatures.set(node.key, signature)
          }
          this.nodes.set(node.key, node)
        }
        if (!changed) return this.current
        return this.snapshot()
      }

      snapshot() {
        const runs = [...this.nodes.values()]
          .map((node) => node.data)
          .sort((left, right) => (left.anchorSeq === right.anchorSeq ? String(left.runId).localeCompare(String(right.runId)) : left.anchorSeq - right.anchorSeq))
        const activeRun = selectActiveRun(runs)
        this.current = activeRun === undefined ? EMPTY_PROGRESS_SNAPSHOT : { runs, activeRun }
        return this.current
      }
    }

    /** The view definition; `target` is the identity a duplicate registration collides on. */
    const progressViewDefinition = {
      target: PROGRESS_TARGET,
      create: () => new ProgressSnapshotBuilder(),
    }

    /**
     * Mount the tab: its two conversation registrations, then its `conversation.view` entry.
     *
     * Everything is wrapped: the tab is an addition, never a precondition, so a refusing
     * registry costs the tab and says so in the settings page's status area instead of
     * failing the plugin's own fiber.
     * @param ctx - the browser plugin context.
     * @param services - `uiConversation` and `sessions` faces.
     * @param i18n - live locale binding.
     * @param status - the settings page's progress-state store.
     * @param workspaceOf - reads the current `uiWorkspace` (it may arrive after the tab).
     * @returns a disposer, or `undefined` when the tab could not be mounted.
     */
    function mountProgress(ctx, services, i18n, status, workspaceOf) {
      const disposers = []
      const disposeAll = () => {
        while (disposers.length > 0) {
          const dispose = disposers.pop()
          try {
            if (typeof dispose === 'function') dispose()
          } catch {
            /* a disposer that throws must not stop the others */
          }
        }
      }
      const fail = (stage, error) => {
        const message = error && error.message ? error.message : String(error)
        disposeAll()
        status.set('failed', message)
        console.warn(`[grok-workflow] the progress tab could not be registered (${stage}: ${message}); the tab stays out and the settings page reports it.`)
        return undefined
      }
      try {
        disposers.push(services.uiConversation.events.register(progressEventDefinition))
        disposers.push(services.uiConversation.views.register(progressViewDefinition))
      } catch (error) {
        return fail('conversation registries', error)
      }
      const sources = new WeakMap()
      /** One subagent address read; `undefined` when the sessions face cannot answer. */
      const addressOf = (childId) => (typeof services.sessions.subagentAddress === 'function' ? services.sessions.subagentAddress(childId) : undefined)
      /**
       * Whether one child session can be opened, decided by the *same* rule the chat panel
       * uses (`panelMemberMode`): a settle-able subagent address whose parent is this
       * session. A row without one stays inert rather than opening the wrong session.
       */
      const modeOf = (sessionId, childId) => {
        const address = addressOf(childId)
        return panelMemberMode(
          address === undefined ? undefined : { parentId: address.parentSessionId },
          address === undefined ? undefined : { mode: address.mode },
          sessionId,
        )
      }
      /**
       * Fill this session's input box with the approval word, and do nothing else.
       *
       * `conversation.input.for(binding.ctx)` is the per-session editor facade, and
       * `binding.ctx` is the session-scoped context it is addressed by — the same context
       * the shell hands its own slots, so the write lands in *this* session's composer.
       * `conversation.send` is deliberately not reachable from here: it would send the
       * message on the reader's behalf, which is the opposite of filling the box (§19.4).
       * @param sessionId - the session the tab was mounted for.
       * @returns whether the draft was written; a refusal is reported, never assumed.
       */
      const fillDraftOf = services.conversation === undefined || services.conversation === null
        || services.conversation.input === undefined || services.conversation.input === null
        || typeof services.conversation.input.for !== 'function'
        ? undefined
        : (sessionId) => {
          const binding = typeof services.sessions.binding === 'function' ? services.sessions.binding(sessionId) : undefined
          const actx = binding === undefined || binding === null ? undefined : binding.ctx
          if (actx === undefined) return false
          try {
            const input = services.conversation.input.for(actx)
            if (input === undefined || input === null || typeof input.setDraft !== 'function') return false
            input.setDraft(i18n.t('progress.dock.fill'))
            return true
          } catch (error) {
            const message = error && error.message ? error.message : String(error)
            console.warn(`[grok-workflow] the progress tab could not fill the input box (${message}); the button reports nothing instead of claiming it did.`)
            return false
          }
        }
      const options = {
        name: 'conversation.view',
        id: PROGRESS_VIEW_ID,
        order: PROGRESS_VIEW_ORDER,
        // A `list` slot in ascending order: no `priority`, which belongs to keyed
        // replacements and would be meaningless (and surprising) here.
        label: () => i18n.t('view.progress'),
        inject: (sessionId) => {
          const binding = typeof services.sessions.binding === 'function' ? services.sessions.binding(sessionId) : undefined
          let source = binding === undefined ? undefined : sources.get(binding)
          if (source === undefined) {
            try {
              const target = services.uiConversation.binding(sessionId).target(PROGRESS_TARGET)
              source = {
                getSnapshot: () => target.getSnapshot() || EMPTY_PROGRESS_SNAPSHOT,
                subscribe: (listener) => target.subscribe(listener),
              }
            } catch (error) {
              // A session the conversation shell cannot bind (a replayed id, a session
              // that closed between the tab mount and this render): the tab renders its
              // empty state instead of throwing inside the shell's own render.
              const message = error && error.message ? error.message : String(error)
              console.warn(`[grok-workflow] the progress tab could not bind session "${sessionId}" (${message}); showing an empty track.`)
              source = {
                getSnapshot: () => EMPTY_PROGRESS_SNAPSHOT,
                subscribe: () => () => {},
              }
            }
            if (binding !== undefined && source !== undefined) sources.set(binding, source)
          }
          return {
            hooks: { grokProgress: source },
            progressT: i18n.t,
            // The dock's one button writes the approval word into this session's composer
            // and stops there (§19.4). Absent when the composition has no `conversation`
            // service: the page then offers the quiet line instead of a dead button.
            ...fillDraftOf === undefined ? {} : { fillDraft: () => fillDraftOf(sessionId) },
            canOpen: (childId) => modeOf(sessionId, childId) !== undefined,
            openChild: (childId) => {
              const mode = modeOf(sessionId, childId)
              if (mode === undefined) return false
              const workspace = workspaceOf()
              if (workspace === undefined) return false
              workspace.openSession({ parentSessionId: sessionId, childSessionId: childId, mode })
              return true
            },
          }
        },
      }
      if (i18n.locale !== undefined) options.locale = NS
      try {
        const dispose = ctx.slots.inject('conversation.view', () => ctx.slots.register(options, ProgressView))
        disposers.push(dispose)
      } catch (error) {
        return fail('view slot', error)
      }
      status.set('mounted')
      return () => {
        disposeAll()
        status.set('unmounted')
      }
    }

    /**
     * A tiny observable holding why the tab is not mounted, read by the settings page.
     *
     * The page is mounted before the tab's services are known, so this is how the two
     * halves talk: `unmounted` (no `uiConversation`, or the face left), `mounted`, and
     * `failed` with the registry's own message.
     */
    function createProgressStatus() {
      let value = 'unmounted'
      let message
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        getMessage: () => message,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next, detail) => {
          if (next === value && detail === message) return
          value = next
          message = detail
          // A snapshot, so a listener that subscribes or unsubscribes during dispatch
          // neither misses this notification nor receives it twice.
          for (const listener of Array.from(listeners)) listener()
        },
      }
    }

    /**
     * The status a page render reads when it was not handed this bundle's store.
     *
     * `unknown` is not a claim about the tab: it means "this caller did not inject the
     * store", so the page renders no note at all instead of accusing the composition of
     * missing a service it may well have.
     */
    const PROGRESS_STATUS_UNKNOWN = {
      getSnapshot: () => 'unknown',
      getMessage: () => undefined,
      subscribe: () => () => {},
    }

    // ─── Composer tool row: the two heartbeat switches ──────────────────────────
    //
    // The repeat-run heartbeat is the user's to start, and these switches are the user's
    // half of that rule. They are not a second implementation: every request goes to the
    // Host route named by `LOOP_ROUTE_PATH` / `ITERATE_ROUTE_PATH` in `src/loop.ts`, and
    // each route dispatches to the same `LoopService` methods the `grok_loop` tool calls —
    // `status`, `open`, `close`. What differs is the caller: a browser request carries no
    // acting Agent, which is exactly the condition `LoopService.open` requires, while the
    // tool always has one and is refused for it. The authorization is therefore
    // structural, not a UI courtesy: there is no path from an Agent to these POSTs.
    // `test/client.spec.ts` pins each file's path and action list against `src/loop.ts`
    // and the tool's own schema, so the switches cannot drift into "one switch opens one
    // thing and the tool reads another".
    //
    // Two switches, one factory, two slots: **Auto-continue** owns the loop route, whose
    // service stores a `Loop heartbeat` task; **Self-iterate** owns the iterate route,
    // whose service stores an `RSI heartbeat` task. Each service filters every read,
    // write and delete by its own reserved title, so one switch can never create, report
    // or delete the other's row. The iterate open sends no prompt and no interval: the
    // template persisted in the profile (`iterateTemplate`) is the one source of the
    // stored prompt, which is what keeps the settings page's textarea and the armed
    // heartbeat from disagreeing.
    //
    // They sit in the composer tool row, in the `list` slot the shell renders immediately
    // before the model selector ({@link SWITCH_SLOT}). The model-selector control itself
    // belongs to model selection and stays untouched: no switch reads or moves it, and no
    // code here reaches for its DOM.
    const LOOP_ROUTE_PATH = '/grok-workflow/loop'
    const ITERATE_ROUTE_PATH = '/grok-workflow/iterate'
    // The workflow switch is not a heartbeat: it flips the same session record `/grok
    // on|off` writes (`plugin:grok-workflow/mode` in `src/mode.ts`), which is the record
    // `src/gate.ts` already honors. One truth source, two callers — the switch here and
    // the command there — so no second `masterEnabled` field is invented anywhere.
    const MODE_ROUTE_PATH = '/grok-workflow/mode'
    // The record the switch follows in the session's own event window: the exact string
    // `src/mode.ts` appends, so a write the *command* makes is visible to the button
    // without a second route, a new host channel or a timer.
    const MODE_RECORD = 'plugin:grok-workflow/mode'
    // The upgrade card's two verbs ride a Host route (`src/update-surface.ts`): a browser
    // click cannot run `dsh plugin`, so the Host does the install and this bundle only
    // asks — `GET ?action=status` to read, `POST {action:'install', tag}` to move. Same
    // fence, same never-throws transport as the switches below.
    const UPDATE_ROUTE_PATH = '/grok-workflow/update'
    const LOOP_SWITCH_ORDER = 90
    const ITERATE_SWITCH_ORDER = 91
    const MODE_SWITCH_ORDER = 92
    /**
     * The one slot all three switches register into.
     *
     * `conversation.input.right` is the tool row's own `list` slot — "compact controls
     * before the composer submit action" — and the shell renders it ahead of the
     * model-selector seat, so an entry here sits immediately left of that selector rather
     * than in the ambient strip under the card. Two consequences matter: the row's render
     * gate is `sessionId !== undefined` (the model selector's own gate, not the dock's
     * `variant === 'composer'`), so the switches appear in the hero composer of a new
     * session as well; and the slot's stock occupancy is empty, so a fresh id appends
     * rather than replacing anything.
     */
    const SWITCH_SLOT = 'conversation.input.right'
    /** The actions both routes dispatch; pinned against the tool schema by the spec. */
    const LOOP_ACTIONS = ['status', 'close', 'open']
    /** The actions the mode route dispatches: read the record, or write it on/off. */
    const MODE_ACTIONS = ['status', 'set']

    /**
     * Absolute URL of one Host route.
     *
     * Relative to `document.baseURI`, so a switch keeps working behind a path prefix or a
     * desktop carrier that serves the page from a subdirectory. Without a `document`
     * (unit tests, a non-page evaluator) the bare path is returned and the caller decides.
     * @param routePath - the Host's exact path.
     * @returns the URL to POST to.
     */
    function routeUrl(routePath) {
      if (typeof document === 'undefined' || typeof document.baseURI !== 'string') return routePath
      try {
        return new URL(routePath, document.baseURI).href
      } catch {
        return routePath
      }
    }

    /**
     * POST one JSON body to a Host route and read the answer.
     *
     * `credentials: 'include'` and a same-origin path are what make the composition's
     * connection fence accept the call: these routes are guarded by the Host's own
     * Host/Origin + browser-authentication check, the same fence DSH's shipped routes
     * use, so a switch needs no credential of its own and stores none.
     *
     * Never throws: a missing `fetch`, a closed socket and a body that is not JSON all
     * come back as `failure` (with no status), and each switch turns that into its own
     * failure code and sentence.
     * @param routePath - the Host's exact path.
     * @param body - the one JSON body shape that route accepts.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns `{ status, payload }`, or `{ failure }` when there was no answer at all.
     */
    async function postRoute(routePath, body, fetchImpl) {
      const post = fetchImpl !== undefined ? fetchImpl : (typeof fetch === 'function' ? fetch : undefined)
      if (typeof post !== 'function') {
        return { failure: 'this page has no fetch to reach the Host with' }
      }
      let response
      try {
        response = await post(routeUrl(routePath), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch (error) {
        return { failure: error && error.message ? error.message : String(error) }
      }
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = undefined
      }
      return { status: response.status, payload }
    }

    /**
     * GET one Host route with query parameters and read the answer.
     *
     * Only the switch's read uses it: the route accepts `?action=status&sessionId=…`,
     * so a middle box that refuses POST cannot leave the button permanently blank.
     * Same fence and same never-throws contract as {@link postRoute}.
     * @param routePath - the Host's exact path.
     * @param params - query parameters to append.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns `{ status, payload }`, or `{ failure }` when there was no answer at all.
     */
    async function getRoute(routePath, params, fetchImpl) {
      const send = fetchImpl !== undefined ? fetchImpl : (typeof fetch === 'function' ? fetch : undefined)
      if (typeof send !== 'function') {
        return { failure: 'this page has no fetch to reach the Host with' }
      }
      const query = Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
      let response
      try {
        response = await send(`${routeUrl(routePath)}?${query}`, { method: 'GET', credentials: 'include' })
      } catch (error) {
        return { failure: error && error.message ? error.message : String(error) }
      }
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = undefined
      }
      return { status: response.status, payload }
    }

    // ─── The upgrade card's route calls ─────────────────────────────────────────
    //
    // `src/update-surface.ts` answers two verbs on {@link UPDATE_ROUTE_PATH}: a status read
    // (installed version, newest known release, whether this Host can install at all) and
    // an install for one exact tag. The page normalises both answers into one shape so the
    // card never has to look at an HTTP status, and so every silence — no `fetch`, a dead
    // socket, a body that is not JSON — comes back as a *stated* code instead of a thrown
    // exception. The precedent is `parseModePayload`: a refusal that arrives with a code is
    // reported with that code, and a refusal that arrives without one gets this page's own.

    /**
     * Whether `candidate` is a strictly newer release than `installed`.
     *
     * Both sides are `X.Y.Z`, the shape `PLUGIN_VERSION` / `UPDATE_LATEST` and the route
     * all use. A value that is not a version is never treated as an upgrade, so a Host that
     * answers nonsense cannot make the card offer an install for it.
     * @param candidate - the release that might be newer.
     * @param installed - what is installed now.
     * @returns true only when `candidate` is strictly greater.
     */
    function isNewerVersion(candidate, installed) {
      const parts = (value) => {
        if (typeof value !== 'string') return undefined
        const pieces = value.split(/[.+-]/)
        if (pieces.length < 3) return undefined
        const numbers = []
        for (let at = 0; at < 3; at += 1) {
          const number = Number.parseInt(pieces[at], 10)
          if (!Number.isFinite(number)) return undefined
          numbers.push(number)
        }
        return numbers
      }
      const next = parts(candidate)
      const now = parts(installed)
      if (next === undefined || now === undefined) return false
      for (let at = 0; at < 3; at += 1) {
        if (next[at] > now[at]) return true
        if (next[at] < now[at]) return false
      }
      return false
    }

    /**
     * One version field of a status answer, or null when the Host has no opinion.
     * @param value - the field as it arrived.
     * @returns the version string, or null.
     */
    function updateVersion(value) {
      return typeof value === 'string' && /^\d+\.\d+\.\d+/.test(value) ? value : null
    }

    /**
     * Read one status answer's `update` block, keeping every unknown as "unknown".
     *
     * A field the Host did not send is *not* filled in from this page's constants here —
     * the card decides how to fall back, because the difference between "the Host says
     * 0.13.31" and "this page was built as 0.13.31" is the difference between a fact and a
     * baseline.
     * @param update - the `update` block, if any.
     * @returns the normalised block, or undefined when the answer carried none.
     */
    function readStatusUpdate(update) {
      if (update === null || typeof update !== 'object' || Array.isArray(update)) return undefined
      return {
        current: updateVersion(update.current),
        latest: updateVersion(update.latest),
        latestSource: update.latestSource === 'remote' ? 'remote' : 'none',
        canInstall: update.canInstall === true,
        reason: typeof update.reason === 'string' && update.reason !== '' ? update.reason : undefined,
        command: typeof update.command === 'string' ? update.command : '',
      }
    }

    /**
     * Read one refused answer into the card's vocabulary.
     *
     * A 403 is the composition's fence (the request carried no accepted user credential);
     * a 405 is the method refused somewhere in front of the route. Both have their own
     * code, because "the route did not answer" would send the reader looking in the wrong
     * place.
     * @param payload - the parsed body, if any.
     * @param status - HTTP status of the answer.
     * @returns the stated failure.
     */
    function parseUpdateFailure(payload, status) {
      const answered = `the update route answered HTTP ${String(status)}`
      const refused = status === 403 ? 'update/user-only' : status === 405 ? 'update/method' : 'update/response'
      const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      if (!isObject) return { ok: false, code: refused, error: answered }
      const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : refused
      const error = typeof payload.error === 'string' && payload.error !== '' ? payload.error : answered
      return { ok: false, code, error }
    }

    /**
     * Read the update status without writing anything.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns `{ ok: true, update }`, or `{ ok: false, code, error }` — never a throw.
     */
    async function checkUpdate(fetchImpl) {
      const answered = await getRoute(UPDATE_ROUTE_PATH, { action: 'status' }, fetchImpl)
      if (answered.failure !== undefined) return { ok: false, code: 'update/transport', error: answered.failure }
      const payload = answered.payload
      const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      if (isObject && payload.ok === true) {
        const update = readStatusUpdate(payload.update)
        if (update !== undefined) return { ok: true, update }
        return { ok: false, code: 'update/response', error: 'the update route answered without a status block' }
      }
      return parseUpdateFailure(payload, answered.status)
    }

    /**
     * Ask the Host to install one exact tag.
     *
     * The tag is built here (`v` + the version the card is offering) rather than taken
     * from the status answer, so the install is pinned to the release the reader saw on
     * screen and never to "whatever resolves today".
     * @param tag - the exact tag, e.g. `v0.13.32`.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns `{ ok: true, installed }`, or `{ ok: false, code, error, rolledBack, restored }`.
     */
    async function installUpdate(tag, fetchImpl) {
      const answered = await postRoute(UPDATE_ROUTE_PATH, { action: 'install', tag }, fetchImpl)
      if (answered.failure !== undefined) {
        return { ok: false, code: 'update/transport', error: answered.failure, rolledBack: false, restored: undefined }
      }
      const payload = answered.payload
      const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      if (isObject && payload.ok === true) {
        const installed = payload.installed
        // `to` is what the Host read back from the installed row, not what it asked for:
        // without it the card could not tell an install that landed from one that did not.
        if (installed !== null && typeof installed === 'object' && typeof installed.to === 'string' && installed.to !== '') {
          return {
            ok: true,
            installed: {
              from: updateVersion(installed.from),
              to: installed.to,
              spec: typeof installed.spec === 'string' ? installed.spec : '',
              saveExact: installed.saveExact === true,
            },
          }
        }
        return { ok: false, code: 'update/response', error: 'the update route answered without a read-back version', rolledBack: false, restored: undefined }
      }
      const failure = parseUpdateFailure(payload, answered.status)
      return {
        ...failure,
        rolledBack: isObject && payload.rolledBack === true,
        restored: isObject ? updateVersion(payload.restored) : null,
      }
    }

    /**
     * Build one composer-tool-row heartbeat switch.
     *
     * The two switches differ in exactly four facts — the route path, the registration
     * id, the slot order and the copy prefix — and nothing else: the same state machine,
     * the same transport rules and the same DOM contract apply to both, so one factory
     * keeps them from drifting apart.
     * @param config - `routePath` (the exact Host route), `switchId` (the slot
     *   registration id), `switchOrder`, `dataAttr` (the `data-<attr>-toggle` DOM key,
     *   distinct per switch so a test can drive one without catching the other) and
     *   `textPrefix` (the dictionary prefix, `loop.switch.*` or `iterate.switch.*`).
     * @returns the bundle object the exports pin and the tests drive.
     */
    function makeHeartbeatSwitch(config) {
      const { routePath, switchId, switchOrder, dataAttr, textPrefix } = config

      /**
       * Absolute URL of this switch's route.
       *
       * Relative to `document.baseURI`, so the switch keeps working behind a path prefix
       * or a desktop carrier that serves the page from a subdirectory. Without a
       * `document` (unit tests, a non-page evaluator) the bare path is returned and the
       * caller decides.
       * @returns the URL to POST to.
       */
      function switchUrl() {
        return routeUrl(routePath)
      }

      /**
       * Read one route answer into the switch's own vocabulary.
       *
       * The route always answers JSON with `ok` plus either `loop` or `code`/`error`; a
       * proxy or a refusal that answers something else must not be reported as a state
       * change, so an unrecognized body becomes `loop/response` and the switch shows a
       * failure instead of pretending the loop moved.
       * @param payload - the parsed body, if any.
       * @param status - HTTP status of the answer.
       * @returns the loop snapshot, or the stated failure.
       */
      function parsePayload(payload, status) {
        const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        if (isObject && payload.ok === true && payload.loop !== undefined) {
          return { ok: true, loop: payload.loop }
        }
        const answered = `the heartbeat route answered HTTP ${String(status)}`
        // A 403 is the user-only refusal whichever body came with it: the status is the
        // composition's own fence saying the request carried no accepted user credential.
        const refused = status === 403 ? 'loop/user-only' : 'loop/response'
        if (!isObject) return { ok: false, code: refused, error: answered }
        const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : refused
        const error = typeof payload.error === 'string' && payload.error !== '' ? payload.error : answered
        return { ok: false, code, error }
      }

      /**
       * POST one heartbeat request to the Host route.
       *
       * The transport (same-origin path, `credentials: 'include'`, never a throw) is
       * {@link postRoute}, shared with the workflow switch so the two cannot drift into
       * two different ideas of how a browser reaches a Host route.
       * @param body - `{ action, sessionId }`, the one body shape the route accepts.
       * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
       * @returns the snapshot, or the stated failure — never a throw.
       */
      async function send(body, fetchImpl) {
        const answered = await postRoute(routePath, body, fetchImpl)
        if (answered.failure !== undefined) {
          return { ok: false, code: 'loop/transport', error: answered.failure }
        }
        return parsePayload(answered.payload, answered.status)
      }

      /** Read this session's heartbeat without writing: the same `status` the tool may call. */
      function read(sessionId, fetchImpl) {
        return send({ action: 'status', sessionId }, fetchImpl)
      }

      /** Open the heartbeat. Only reachable from a click: see the authorization note above. */
      function open(sessionId, fetchImpl) {
        return send({ action: 'open', sessionId }, fetchImpl)
      }

      /** Delete the heartbeat task; like the tool's `close`, this leaves nothing behind. */
      function close(sessionId, fetchImpl) {
        return send({ action: 'close', sessionId }, fetchImpl)
      }

      /** The one line under the switch, for one state, in one language. */
      function switchText(t, state) {
        const loop = state.loop
        if (state.phase === 'reading') return t(`${textPrefix}.switch.reading`)
        if (state.phase === 'busy') return t(`${textPrefix}.switch.busy`)
        if (state.phase === 'no-session') return t(`${textPrefix}.switch.noSession`)
        if (state.phase === 'failed') return failureText(t, state.code, state.error)
        if (loop === undefined || loop.open !== true) return t(`${textPrefix}.switch.off`)
        const minutes = typeof loop.intervalMinutes === 'number' ? String(loop.intervalMinutes) : '?'
        return typeof loop.rounds === 'number'
          ? t(`${textPrefix}.switch.on`, { minutes, rounds: String(loop.rounds) })
          : t(`${textPrefix}.switch.onUnbounded`, { minutes })
      }

      /**
       * One failure in the switch's words.
       *
       * The two codes a person can act on get their own sentence — "only you may open
       * this" and "this Host has no scheduler" are not the same problem as "the request
       * failed" — and everything else carries the Host's own message, which is already
       * redacted there.
       */
      function failureText(t, code, error) {
        if (code === 'loop/user-only') return t(`${textPrefix}.switch.userOnly`)
        if (code === 'loop/unavailable') return t(`${textPrefix}.switch.unavailable`)
        return t(`${textPrefix}.switch.failed`, { message: error === undefined ? '?' : String(error) })
      }

      /**
       * The switch itself: one button, one status line, no hidden writes.
       *
       * It reads on mount and never on a timer: a heartbeat's state is a fact the Host
       * owns, and polling it from the composer of every session would be work nobody
       * asked for. A click flips the state it last read — while it is still reading, the
       * switch is disabled rather than guessing, because a click on an unknown state
       * would open a heartbeat that may already exist (harmless) or report "off" over a
       * live task (not).
       * @param props - slot runtime props: `sessionId`, the seated `t`, and an optional
       *   transport override (`loopSend`, or `<dataAttr>Send`; tests pass a fake
       *   fetch-shaped stand-in; production uses the page's own fetch — never `send`
       *   itself, which already takes the request-body shape).
       */
      function Switch(props) {
        const t = guardedTranslator(props.t, translator(FALLBACK_LOCALE))
        const sessionId = typeof props.sessionId === 'string' && props.sessionId !== '' ? props.sessionId : undefined
        const override = typeof props[`${dataAttr}Send`] === 'function'
          ? props[`${dataAttr}Send`]
          : (typeof props.loopSend === 'function' ? props.loopSend : undefined)
        const send1 = override !== undefined
          ? override
          : (typeof fetch === 'function' ? fetch.bind(undefined) : send)
        const [state, setState] = useState(() => ({
          phase: sessionId === undefined ? 'no-session' : 'reading',
          loop: undefined,
          code: undefined,
          error: undefined,
        }))
        useEffect(() => {
          if (sessionId === undefined) return undefined
          let live = true
          read(sessionId, send1).then((result) => {
            // The composer can be recycled onto another session while the read is in
            // flight; a late answer about the old session must not repaint the new one.
            if (!live) return
            setState(result.ok === true
              ? { phase: 'ready', loop: result.loop, code: undefined, error: undefined }
              : { phase: 'failed', loop: undefined, code: result.code, error: result.error })
          })
          return () => { live = false }
        }, [sessionId])
        const flip = () => {
          if (sessionId === undefined || state.phase === 'busy' || state.phase === 'reading') return
          const closing = state.loop !== undefined && state.loop.open === true
          setState((current) => ({ ...current, phase: 'busy' }))
          const answered = closing ? close(sessionId, send1) : open(sessionId, send1)
          void answered.then((result) => {
            setState(result.ok === true
              ? { phase: 'ready', loop: result.loop, code: undefined, error: undefined }
              // A refused open leaves the previous state in place: the switch shows what it
              // last knew plus why the click did nothing, instead of flipping anyway.
              : { phase: 'failed', loop: state.loop, code: result.code, error: result.error })
          })
        }
        const openNow = state.phase === 'ready' && state.loop !== undefined && state.loop.open === true
        const disabled = state.phase === 'reading' || state.phase === 'busy' || state.phase === 'no-session'
        return h('div', { style: styles.loopDock, [`data-${dataAttr}-switch`]: switchId, [`data-${dataAttr}-state`]: state.phase },
          h('span', { style: styles.loopLabel }, t(`${textPrefix}.switch.label`)),
          h('button', {
            type: 'button', role: 'switch', 'aria-checked': openNow,
            'aria-label': t(`${textPrefix}.switch.aria`), title: t(`${textPrefix}.switch.aria`),
            [`data-${dataAttr}-toggle`]: true, disabled,
            style: openNow ? styles.switchOn : styles.switch,
            onClick: flip,
          }, h('span', { 'data-switch-thumb': true, 'aria-hidden': 'true', style: styles.switchThumb })),
          h('span', {
            style: state.phase === 'failed' ? styles.error : styles.hint,
            [`data-${dataAttr}-note`]: state.phase,
          }, switchText(t, state)))
      }

      /**
       * Register the switch in the composer tool row.
       *
       * `locale: NS` is added only when the composition installs a locale face — the same
       * rule the settings page follows, for the same reason: a registration that names a
       * namespace the renderer cannot seat throws, and a switch in the wrong language
       * beats no switch. The registration is additive (`list` slot, own id), so nothing
       * the stock composer renders is replaced.
       * @param ctx - the browser plugin context.
       * @param i18n - live locale binding.
       * @returns a disposer, or `undefined` when the registry refused the entry.
       */
      function start(ctx, i18n) {
        const options = {
          name: SWITCH_SLOT,
          id: switchId,
          order: switchOrder,
        }
        if (i18n.locale !== undefined) options.locale = NS
        try {
          return ctx.slots.inject(SWITCH_SLOT, () => ctx.slots.register(options, Switch))
        } catch (error) {
          const message = error && error.message ? error.message : String(error)
          console.warn(`[grok-workflow] the ${textPrefix} switch could not be registered (${message}); settings are unaffected.`)
          return undefined
        }
      }

      return {
        routePath, switchId, switchOrder, dataAttr, actions: LOOP_ACTIONS.slice(),
        component: Switch, mount: start, send, read, open, close,
        parsePayload, text: switchText, failureText, url: switchUrl,
      }
    }

    /** Auto-continue: the loop route, whose service owns the `Loop heartbeat` slot. */
    const LOOP_SWITCH = makeHeartbeatSwitch({
      routePath: LOOP_ROUTE_PATH, switchId: 'grok-workflow-loop', switchOrder: LOOP_SWITCH_ORDER,
      dataAttr: 'loop', textPrefix: 'loop',
    })
    /** Self-iterate: the iterate route, whose service owns the `RSI heartbeat` slot. */
    const ITERATE_SWITCH = makeHeartbeatSwitch({
      routePath: ITERATE_ROUTE_PATH, switchId: 'grok-workflow-iterate', switchOrder: ITERATE_SWITCH_ORDER,
      dataAttr: 'iterate', textPrefix: 'iterate',
    })

    /**
     * The workflow switch: the `/grok on|off` toggle, in button form.
     *
     * This is deliberately *not* a third `makeHeartbeatSwitch`. A heartbeat has an
     * interval, a round budget and a Schedule task; this one has a single persisted
     * boolean in the session record `src/mode.ts` owns, and the same record
     * `src/gate.ts` reads to decide whether a message is workflow work at all. The
     * switch therefore has no `open`/`close` pair and no interval: `set(true)` is
     * `/grok on`, `set(false)` is `/grok off`, and the copy reports the session's own
     * record — a session with no record has decided nothing and says so ("not set yet"),
     * even though the route still folds the deployment `grokDefault` into its answer for
     * `/grok status` and the settings page. The intake reads the record only, so the
     * switch must not repeat the default as if it were a decision (D-154).
     *
     * It is a browser surface for the same reason the heartbeats are: the record is the
     * user's toggle, and a tool call from an Agent would be a model switching its own
     * gate. The route refuses a request that carries no accepted user credential
     * (`mode/session`), and nothing here has a tool counterpart.
     */

    /**
     * Read one mode-route answer into the switch's own vocabulary.
     *
     * The route answers `{ ok: true, action, mode }` with the record as written
     * (`{ v, enabled, turn, setBy, workflowMode? }`), or `{ ok: false, code, error }`.
     * A body that says `ok` but carries no boolean is a refusal to report, not a state:
     * the switch shows a failure instead of inventing an enabled flag.
     * @param payload - the parsed body, if any.
     * @param status - HTTP status of the answer.
     * @returns the record's enabled flag, or the stated failure.
     */
    function parseModePayload(payload, status) {
      const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      const answered = `the mode route answered HTTP ${String(status)}`
      if (isObject && payload.ok === true) {
        const mode = payload.mode
        if (mode !== null && typeof mode === 'object' && typeof mode.enabled === 'boolean') {
          return { ok: true, mode }
        }
        return { ok: false, code: 'mode/internal', error: 'the mode route answered without an enabled flag' }
      }
      // A 403 is the composition's fence saying this request carried no accepted user
      // credential — the same refusal `/grok` itself would not need, because a command
      // always runs inside a user turn. A 405 with no code is the method being refused
      // somewhere in front of this route: that has its own sentence and its own code,
      // because "the route did not answer" sent the operator looking in the wrong place.
      const refused = status === 403 ? 'mode/session' : status === 405 ? 'mode/method' : 'mode/internal'
      if (!isObject) return { ok: false, code: refused, error: answered }
      const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : refused
      const error = typeof payload.error === 'string' && payload.error !== '' ? payload.error : answered
      return { ok: false, code, error }
    }

    /** POST one mode request: `{ action: 'status' }`, or `{ action: 'set', enabled }`. */
    async function sendMode(body, fetchImpl) {
      const answered = await postRoute(MODE_ROUTE_PATH, body, fetchImpl)
      if (answered.failure !== undefined) {
        return { ok: false, code: 'mode/transport', error: answered.failure }
      }
      // A refused method on a read is worth one retry over GET: the route reads that way
      // too, so a middle box that refuses POST costs the button a round-trip instead of
      // its state. A write is never retried — the POST is the only way to move the switch.
      if (answered.status === 405 && body.action === 'status') {
        const retried = await getRoute(
          MODE_ROUTE_PATH,
          { action: 'status', sessionId: body.sessionId },
          fetchImpl,
        )
        if (retried.failure === undefined) return parseModePayload(retried.payload, retried.status)
      }
      return parseModePayload(answered.payload, answered.status)
    }

    /** Read this session's toggle without writing; the route also fills in `grokDefault`. */
    function readMode(sessionId, fetchImpl) {
      return sendMode({ action: 'status', sessionId }, fetchImpl)
    }

    /** Write the toggle — `/grok on` (`true`) or `/grok off` (`false`). Click-only. */
    function setModeEnabled(sessionId, enabled, fetchImpl) {
      return sendMode({ action: 'set', sessionId, enabled }, fetchImpl)
    }

    /**
     * Whether the switch shows one mode answer as on.
     *
     * Only a record the session itself carries and switched on counts. A `source` of
     * `'default'` is the route's way of saying "this session has no record; here is the
     * deployment default it would fall back to" — the intake does not honour that default
     * (`canAcceptBlock` reads the record), so neither does the pill, the lamp or the click.
     * A missing `source` is an older answer about a record: read as before.
     * @param mode - the `mode` object from one route answer, if any.
     * @returns true when the switch may show this session as on.
     */
    function modeShownOn(mode) {
      return mode !== undefined && mode.enabled === true && mode.source !== 'default'
    }

    /** The one line under the workflow switch, for one state, in one language. */
    function modeSwitchText(t, state) {
      if (state.phase === 'reading') return t('mode.switch.reading')
      if (state.phase === 'busy') return t('mode.switch.busy')
      if (state.phase === 'no-session') return t('mode.switch.noSession')
      if (state.phase === 'failed') return modeFailureText(t, state.error)
      // No record yet is its own answer, in both directions of the deployment default:
      // "not set yet" is what the session did, not "on" (what the default would allow) and
      // not "off" (a decision nobody made).
      if (state.mode !== undefined && state.mode.source === 'default') return t('mode.switch.notOn')
      return modeShownOn(state.mode) ? t('mode.switch.on') : t('mode.switch.off')
    }

    /** One failure in the switch's words: the Host's own message is already redacted. */
    function modeFailureText(t, error) {
      return t('mode.switch.failed', { message: error === undefined ? '?' : String(error) })
    }

    /**
     * The `sessions` face, once this composition has one: the switch's only view of a record
     * a *command* wrote.
     *
     * `/grok off` runs in the Host, inside a user turn. Its write answers the command, not
     * this button, so the button's own state can only learn about it from something both
     * sides share — the session log, which `sessions.binding(id).eventSource` streams to the
     * browser. The face is optional and late for the same reason `locale` and `uiWorkspace`
     * are: requiring it would leave the whole bundle pending in a composition without it, and
     * the switch has always worked with no face at all (it reads and writes over the route).
     *
     * Hence the two halves. The face itself, and the switches that mounted before it arrived:
     * the composer is registered before `apply`'s injection resolves, so "look at mount" alone
     * loses the subscription to injection order. A waiter is called once, when the face lands,
     * which makes subscribing early and subscribing late the same thing.
     */
    let modeSessions
    /** Switches waiting for {@link modeSessions}; each is called once, with the face. */
    const modeSessionWaiters = new Set()

    /**
     * Announce the `sessions` face to the switch — `undefined` when it leaves.
     *
     * A departure wakes nobody: the face is coming back only in a composition that re-adds
     * the service, and a switch already subscribed keeps the window it holds. Nothing here
     * waits on a face, so nothing can pend on one.
     * @param face - the injected `sessions` service, or `undefined` when its scope is gone.
     */
    function offerModeSessions(face) {
      modeSessions = face
      if (face === undefined) return
      const waiters = Array.from(modeSessionWaiters)
      modeSessionWaiters.clear()
      for (const waiter of waiters) waiter(face)
    }

    /**
     * One session's live event window, or `undefined` when this composition cannot give it.
     *
     * `binding` is the sessions face's own door and answers only for a session the client has
     * materialized; an older face may not carry it at all. Both, plus a window without the
     * snapshot/subscribe pair, read as "no window", which the switch treats as "never refresh
     * in the background" — not as a failure, because the switch is complete without any of it.
     * @param face - the `sessions` service, if one was injected.
     * @param sessionId - the session the switch is seated on.
     * @returns the event source to follow, if any.
     */
    function modeEventWindow(face, sessionId) {
      if (face === undefined || face === null || typeof face.binding !== 'function') return undefined
      const binding = face.binding(sessionId)
      if (binding === undefined || binding === null) return undefined
      const source = binding.eventSource
      if (source === undefined || source === null) return undefined
      if (typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') return undefined
      return source
    }

    /**
     * The newest `seq` among this plugin's mode records in one event window, if any.
     *
     * The window holds every durable event of the session, this plugin's records included: they
     * carry `ignorable: true`, which keeps them away from the model, not from the browser. The
     * `seq` is what dedupes — a redelivered window, a replayed page or a second subscriber
     * names the same record, so the same record may never cost a second read.
     * @param snapshot - one `SessionEventWindow` snapshot.
     * @returns the highest record seq in the window, or `undefined` when it holds none.
     */
    function newestModeSeq(snapshot) {
      const entries = snapshot === undefined || snapshot === null || !Array.isArray(snapshot.entries) ? [] : snapshot.entries
      let newest
      for (const entry of entries) {
        if (entry === null || typeof entry !== 'object' || entry.type !== 'event') continue
        const event = entry.event
        if (event === null || typeof event !== 'object' || event.type !== MODE_RECORD) continue
        const seq = event.seq
        if (typeof seq !== 'number' || !Number.isFinite(seq)) continue
        if (newest === undefined || seq > newest) newest = seq
      }
      return newest
    }

    /**
     * The workflow switch itself: one button and one state line.
     *
     * It reads once on mount and never polls — the toggle is a fact the session owns, and
     * a composer that re-read it on a timer would be work nobody asked for. A click is
     * refused while the state is unknown or the write is in flight: flipping what it has
     * not read would be guessing at a gate. After a failed read the click retries the
     * read rather than writing blind.
     *
     * The one other read is an answer to a change it was told about: a new mode record in
     * the session's event window (a command wrote the toggle) gets exactly one re-read, and
     * the same record never gets a second one. That read is not a poll — no timer, no
     * per-event read — and it is silent about failure, because the person at the keyboard
     * did nothing to fail.
     * @param props - slot runtime props: `sessionId`, the seated `t`, and an optional
     *   transport override (`modeSend`; tests pass a fetch-shaped stand-in; production
     *   uses the page's own fetch).
     */
    function ModeSwitch(props) {
      const t = guardedTranslator(props.t, translator(FALLBACK_LOCALE))
      const sessionId = typeof props.sessionId === 'string' && props.sessionId !== '' ? props.sessionId : undefined
      const override = typeof props.modeSend === 'function' ? props.modeSend : undefined
      const send1 = override !== undefined ? override : (typeof fetch === 'function' ? fetch.bind(undefined) : undefined)
      const [state, setState] = useState(() => ({
        phase: sessionId === undefined ? 'no-session' : 'reading',
        mode: undefined,
        error: undefined,
      }))
      /** Read the toggle and repaint; shared by mount and by the retry after a failure. */
      const readNow = (live) => {
        readMode(sessionId, send1).then((result) => {
          if (live !== undefined && !live()) return
          setState(result.ok === true
            ? { phase: 'ready', mode: result.mode, error: undefined }
            : { phase: 'failed', mode: undefined, error: result.error })
        })
      }
      useEffect(() => {
        if (sessionId === undefined) return undefined
        let alive = true
        readNow(() => alive)
        return () => { alive = false }
      }, [sessionId])
      useEffect(() => {
        if (sessionId === undefined) return undefined
        let alive = true
        let stop
        /** The newest record seq already accounted for: the wall against reading twice. */
        let seen
        const follow = (source) => {
          if (!alive) return
          // What the window already carried was covered by the mount read; only a record
          // that arrives afterwards is news. Baselines per subscription, so a re-subscribe
          // cannot replay history as a burst of reads.
          seen = newestModeSeq(source.getSnapshot())
          const stopThis = source.subscribe(() => {
            if (!alive) return
            const seq = newestModeSeq(source.getSnapshot())
            if (seq === undefined || (seen !== undefined && seq <= seen)) return
            seen = seq
            readMode(sessionId, send1).then((result) => {
              // Nothing repaints a switch the user did not touch with a failure: a refused
              // or lost background read leaves the last known state and its line alone.
              if (!alive || result.ok !== true) return
              setState({ phase: 'ready', mode: result.mode, error: undefined })
            })
          })
          stop = typeof stopThis === 'function' ? stopThis : undefined
        }
        const attach = (face) => {
          const source = modeEventWindow(face, sessionId)
          if (source !== undefined) follow(source)
        }
        const known = modeEventWindow(modeSessions, sessionId)
        if (known !== undefined) follow(known)
        // No face yet is the normal case at mount: the injection resolves after the composer
        // is registered, so the waiter is what keeps that order from deciding whether the
        // switch ever follows the session.
        else modeSessionWaiters.add(attach)
        return () => {
          alive = false
          modeSessionWaiters.delete(attach)
          if (typeof stop === 'function') stop()
        }
      }, [sessionId])
      const flip = () => {
        if (sessionId === undefined || state.phase === 'busy' || state.phase === 'reading') return
        // Nothing was read, so nothing may be written: retry the read instead.
        if (state.phase === 'failed') {
          setState((current) => ({ ...current, phase: 'reading' }))
          readNow()
          return
        }
        const next = !modeShownOn(state.mode)
        setState((current) => ({ ...current, phase: 'busy' }))
        void setModeEnabled(sessionId, next, send1).then((result) => {
          setState(result.ok === true
            ? { phase: 'ready', mode: result.mode, error: undefined }
            // A refused write leaves the last known state on screen and says why the click
            // did nothing, instead of repainting a toggle that was never persisted.
            : { phase: 'failed', mode: state.mode, error: result.error })
        })
      }
      // What is known, not what was hoped for: after a refused write the last state the
      // Host reported stays on screen (with the failure line beside it), so the pill never
      // swings to a value that was never persisted. `known` is false only when no read has
      // succeeded yet — then there is no lamp and the note is the failure itself.
      // `enabledNow` is the same judgement as the state line, from the same helper: a pill
      // lit green beside "not set yet" would be the lie this change removes, and the click
      // reads its target from here too, so "not set yet" + one click means `set(true)`.
      const known = state.mode !== undefined
      const enabledNow = modeShownOn(state.mode)
      const disabled = state.phase === 'reading' || state.phase === 'busy' || state.phase === 'no-session'
      return h('div', { style: styles.loopDock, 'data-mode-switch': 'grok-workflow-mode', 'data-mode-state': state.phase },
        h('span', { style: styles.loopLabel }, t('mode.switch.label')),
        h('button', {
          type: 'button', role: 'switch', 'aria-checked': enabledNow,
          'aria-label': t('mode.switch.aria'), title: t('mode.switch.aria'),
          'data-mode-toggle': true, disabled,
          style: enabledNow ? styles.switchOn : styles.switch,
          onClick: flip,
        }, h('span', { 'data-switch-thumb': true, 'aria-hidden': 'true', style: styles.switchThumb })),
        // The lamp is the non-textual half of "off": a filled green dot when the session
        // runs workflow work, a hollow ring when it does not, so a grey pill is never the
        // only signal and nobody reads an off switch as "still running".
        known
          ? h('span', { 'data-mode-lamp': enabledNow ? 'on' : 'off', 'aria-hidden': 'true', style: enabledNow ? styles.dockDot : styles.dockDotOff })
          : null,
        h('span', {
          style: state.phase === 'failed' ? styles.error : styles.hint,
          'data-mode-note': state.phase,
        }, modeSwitchText(t, state)))
    }

    /**
     * Register the workflow switch in the composer tool row.
     *
     * Same rule as the heartbeats: `locale: NS` only when a locale face exists, additive
     * own id, and a refusing registry costs this switch and nothing else.
     * @param ctx - the browser plugin context.
     * @param i18n - live locale binding.
     * @returns a disposer, or `undefined` when the registry refused the entry.
     */
    function startModeSwitch(ctx, i18n) {
      const options = {
        name: SWITCH_SLOT,
        id: 'grok-workflow-mode',
        order: MODE_SWITCH_ORDER,
      }
      if (i18n.locale !== undefined) options.locale = NS
      try {
        return ctx.slots.inject(SWITCH_SLOT, () => ctx.slots.register(options, ModeSwitch))
      } catch (error) {
        const message = error && error.message ? error.message : String(error)
        console.warn(`[grok-workflow] the mode switch could not be registered (${message}); settings are unaffected.`)
        return undefined
      }
    }

    /** The workflow switch, as one object: what mounts, plus the seams the specs drive. */
    const MODE_SWITCH = {
      routePath: MODE_ROUTE_PATH, switchId: 'grok-workflow-mode', switchOrder: MODE_SWITCH_ORDER,
      dataAttr: 'mode', actions: MODE_ACTIONS.slice(),
      component: ModeSwitch, mount: startModeSwitch,
      send: sendMode, read: readMode, set: setModeEnabled,
      parsePayload: parseModePayload, text: modeSwitchText, failureText: modeFailureText,
      url: () => routeUrl(MODE_ROUTE_PATH),
      // The door `apply` uses to hand the switch the sessions face. Exported because it is
      // the same door the specs drive: a switch told about a face in a test is told the way
      // the running page tells it, not through a test-only prop.
      offerSessions: offerModeSessions,
    }

    /**
     * Mount the three tool-row switches and return one disposer that takes them away.
     *
     * Auto-continue and self-iterate are heartbeats; the workflow switch is the session
     * toggle `/grok on|off` writes. They share a slot and nothing else: each owns a
     * route, an id and a state line, so one switch can never create, report or delete
     * another's state.
     *
     * Each mount is additive and fails soft on its own: a registry that refuses one
     * registration costs that switch and still keeps the others, and a disposer that
     * only owns the registrations that actually landed never takes down a neighbor's.
     * @param ctx - the browser plugin context.
     * @param i18n - live locale binding.
     * @returns a combined disposer, or `undefined` when nothing was registered.
     */
    function startComposerSwitches(ctx, i18n) {
      const landed = [LOOP_SWITCH.mount(ctx, i18n), ITERATE_SWITCH.mount(ctx, i18n), MODE_SWITCH.mount(ctx, i18n)]
        .filter((disposer) => typeof disposer === 'function')
      if (landed.length === 0) return undefined
      return () => {
        for (const dispose of landed) dispose()
      }
    }

    /** Required services for the page: the slot registry and the shared config forms. */
    const inject = ['slots', 'configForms']

    /**
     * Register the settings entry for one namespace, in both places it belongs.
     *
     * Two registrations, one component:
     *
     * - `plugins.item` is the card in the Plugins page. The plugin manager renders it
     *   twice (card and detail page), and it is the discoverable path: a reader looking
     *   for "what does this plugin add" starts there.
     * - `settings.section` is the left column of the Host's own Settings panel, a peer
     *   of 通用 / 模型 / 内置插件, labelled `Workflow` in both languages. It renders the
     *   same component as the whole page: it passes no `view`, so the `summary` branch
     *   never runs, and it never reads `close`.
     *
     * Both are bound to `ns` — the namespace that actually projects this plugin's
     * fields, which is normally the shipped id and otherwise the renamed Loader row —
     * and both share one `inject`, so the page cannot see two different faces.
     *
     * `locale: NS` is added only when the composition really installs a locale face:
     * the renderer throws a `SlotAssemblyError` for an entry that declares a namespace
     * while no face is installed, and a page in the wrong language beats no page.
     * @param ctx - the browser plugin context.
     * @param face - the settings mirror.
     * @param ns - namespace to bind the page to.
     * @param i18n - live locale binding: `locale` is the service when present, `t` the
     *   translator the card label and the page fallback resolve through.
     * @returns a disposer that unmounts both registrations.
     */
    function mountPage(ctx, face, ns, i18n) {
      const options = {
        name: 'plugins.item',
        id: ns,
        order: 60,
        // Re-evaluated by the plugin manager on every locale revision, so the card title
        // follows a language switch even before the seat below exists.
        label: () => i18n.t('card.title'),
        inject: () => ({
          face,
          defaultNs: ns,
          translateOwn: i18n.t,
          getForm: (name) => ctx.configForms.get(name),
          // Why the "进度" tab is not on screen, as a live observable: the tab's services
          // arrive (or never do) after this page is mounted, so a snapshot read only at
          // mount time could not report the case the reader actually hits.
          progressStatus: i18n.progress,
        }),
      }
      // Same component, same inject, same id: the Settings left column is an entry point
      // to this page, not a second page. `order: 60` matches the card's.
      const section = {
        name: 'settings.section',
        id: ns,
        order: 60,
        label: () => i18n.t('section.label'),
        inject: options.inject,
      }
      if (i18n.locale !== undefined) {
        options.locale = NS
        section.locale = NS
      }
      const disposeCard = ctx.slots.inject('plugins.item', () => ctx.slots.register(options, GrokWorkflowPage))
      const disposeSection = ctx.slots.inject('settings.section', () => ctx.slots.register(section, GrokWorkflowPage))
      return () => {
        if (typeof disposeSection === 'function') disposeSection()
        if (typeof disposeCard === 'function') disposeCard()
      }
    }

    /**
     * Register the settings tab while the Host serves this plugin's namespace.
     *
     * Everything the page depends on is captured through `i18n`, so a locale service that
     * arrives (or leaves) later only requires a restart of these two effects, not a
     * different code path: `start()` is the single mounting routine.
     * @param ctx - the browser plugin context.
     * @param face - the settings mirror.
     * @param i18n - live locale binding.
     * @returns a disposer that unmounts both registrations.
     */
    function startPages(ctx, face, i18n) {
      const mountServed = () => ctx.configForms.whileServed([NS], () => mountPage(ctx, face, NS, i18n))
      const served = ctx.effect(() => {
        const dispose = mountServed()
        return typeof dispose === 'function' ? dispose : () => {}
      }, 'grok-workflow: settings page')
      // The shipped namespace id is only the default: if a profile renames the
      // Loader row, the same fields project under another id. Re-bind there and say
      // so, rather than leaving the page silently missing (t34 residual risk). When
      // nothing projects our fields the plugin is disabled or did not activate — the
      // case that swallowed the whole feature in t33 — so name it in the console.
      const identity = ctx.effect(() => {
        let announced = undefined
        let unmount = undefined
        const check = () => {
          const snapshot = face.getSnapshot()
          const resolved = resolveNamespace(snapshot.view, NS)
          if (resolved.how === 'value') {
            if (announced !== resolved.ns) {
              announced = resolved.ns
              console.warn(`[grok-workflow] settings namespace is "${resolved.ns}", not the shipped "${NS}": the Loader row id differs. The page follows the row that projects this plugin's fields.`)
              if (unmount !== undefined) { unmount(); unmount = undefined }
              unmount = mountPage(ctx, face, resolved.ns, i18n)
            }
            return
          }
          if (resolved.how === 'missing' && snapshot.status === 'ready' && announced !== 'missing') {
            announced = 'missing'
            console.warn('[grok-workflow] no settings namespace projects this plugin\'s fields: the row is disabled, renamed with an unreadable projection, or did not activate (see docs/LOCAL-TESTING.md#enable). The Grok workflow page cannot appear until it does.')
          }
        }
        const off = typeof face.subscribe === 'function' ? face.subscribe(check) : undefined
        check()
        return () => {
          if (typeof off === 'function') off()
          if (unmount !== undefined) unmount()
        }
      }, 'grok-workflow: namespace identity')
      return () => {
        if (typeof served === 'function') served()
        if (typeof identity === 'function') identity()
      }
    }

    /**
     * Mount the settings page and bind it to the composition's language setting.
     *
     * The language service is *optional and late*: it is reached through a nested
     * `ctx.inject(['locale'], …)` fiber rather than through this bundle's own `inject`.
     * A required injection would leave the whole plugin `pending` in a composition
     * without a language setting — and DSH reports pending entries as a boot failure,
     * which is a far worse outcome than English copy. When the service is there (the
     * shipped web composition always has it), this bundle registers its dictionary and
     * remounts the page with `locale: NS`, so the framework seats a live `t` that
     * re-renders on every switch — the same source Settings → General writes to.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      const face = ctx.configForms.describe()
      /** Live locale binding; English until the service has been injected. */
      const i18n = { locale: undefined, t: translator(FALLBACK_LOCALE), progress: createProgressStatus() }
      ctx.effect(() => { face.ensure().catch(() => undefined) }, 'grok-workflow: settings mirror read')

      let stop = startPages(ctx, face, i18n)
      /**
       * Disposer of the composer tool-row switch.
       *
       * Mounted unconditionally, unlike the panel and the tab: the switch needs nothing
       * but the slot registry this bundle already requires, and a missing switch would
       * silently take away the only user path to a loop. It is remounted with the page
       * when the locale face arrives, because that is what seats a live `t`.
       */
      let stopSwitch
      /** Whether a switch registration was attempted: the initial mount must happen once. */
      let switchMounted = false
      /** The `uiWorkspace` service once injected: the task panel opens child sessions with it. */
      let workspace
      /** Disposer of the current task-panel registration, if any. */
      let stopPanel
      /** The `uiConversation` + `sessions` faces once injected: the progress tab's data. */
      let progressServices
      /** Disposer of the current progress-tab registrations, if any. */
      let stopProgress
      /**
       * Whether every registration this bundle owns has been dropped.
       *
       * Set by {@link teardown} and read by {@link startPanel}: once a scope the bundle
       * depended on is gone, nothing may be mounted again. Cordis disposes a fiber's
       * nested scopes before their own disposers run, so a disposer that mounts is a
       * mount into a dying scope — the registrations land nowhere, `ctx.effect` never
       * runs, and the bundle keeps a stop function for an entry that does not exist.
       */
      let disposed = false
      /** Mount the task panel under the current locale binding (no-op without a workspace). */
      const startPanel = () => {
        if (disposed) return
        if (workspace === undefined) return
        stopPanel = mountPanel(ctx, workspace, i18n)
      }
      /** Drop the current panel registration and mount it again. */
      const restartPanel = () => {
        if (typeof stopPanel === 'function') stopPanel()
        stopPanel = undefined
        startPanel()
      }
      /**
       * Mount the progress tab under the current locale binding.
       *
       * It needs both faces: `uiConversation` owns the view/event registries and the
       * per-target snapshot, and `sessions` resolves a child session for the "open child"
       * action. Without them the tab is not registered, and `i18n.progress` says why the
       * settings page shows no third tab.
       */
      const startProgress = () => {
        if (disposed) return
        if (progressServices === undefined) return
        stopProgress = mountProgress(ctx, progressServices, i18n, i18n.progress, () => workspace)
      }
      /** Drop the current progress-tab registrations and mount them again. */
      const restartProgress = () => {
        if (typeof stopProgress === 'function') stopProgress()
        stopProgress = undefined
        startProgress()
      }
      /**
       * Mount the composer tool-row switches under the current locale binding.
       *
       * Three are mounted: the auto-continue loop switch, beside it the self-iterate
       * switch, and after them the workflow switch (`/grok on|off` in button form). Each
       * is remounted (rather than mounted once) for the same reason the page is: the
       * registration carries `locale: NS` only once a locale face exists, and that is
       * what makes the framework seat a `t` that repaints on a language switch.
       */
      const startSwitch = () => {
        if (disposed) return
        switchMounted = true
        stopSwitch = startComposerSwitches(ctx, i18n)
      }
      /** Drop the current switch registration and mount it again. */
      const restartSwitch = () => {
        if (typeof stopSwitch === 'function') stopSwitch()
        stopSwitch = undefined
        startSwitch()
      }
      /**
       * Drop every registration this bundle owns. Idempotent, and it never mounts.
       *
       * This is the `locale` scope's disposer *and* the plugin's own: both want the same
       * thing — the copy is back to English, the page and the panel are gone, nothing is
       * left registered. The difference that matters is what the old version did here: it
       * called `startPages` (and `restartPanel`) again, rebuilding page slots and an
       * `ctx.effect` from inside a disposer, in a scope the framework had already torn
       * down. Rebuilding there could not succeed; it could only leak a registration whose
       * disposer belonged to a dead fiber. So this function only ever takes away.
       *
       * Dropping the page is deliberate, not incidental: a slot left mounted while its
       * `locale: NS` dictionary registration is gone would be handed a `t` that answers
       * with key ids (`guardedTranslator` is the belt to this braces, this is the fix).
       * In the shipped web composition the locale face never leaves, so this path runs on
       * unload and on a locale-plugin reload, never mid-session.
       */
      const teardown = () => {
        if (disposed) return
        disposed = true
        i18n.locale = undefined
        i18n.t = translator(FALLBACK_LOCALE)
        if (typeof stop === 'function') stop()
        stop = () => {}
        if (typeof stopSwitch === 'function') stopSwitch()
        stopSwitch = undefined
        if (typeof stopPanel === 'function') stopPanel()
        stopPanel = undefined
        if (typeof stopProgress === 'function') stopProgress()
        stopProgress = undefined
        progressServices = undefined
        offerModeSessions(undefined)
        workspace = undefined
      }

      if (typeof ctx.inject === 'function') {
        ctx.inject(['locale'], (scope) => {
          const locale = scope.locale
          i18n.locale = locale
          i18n.t = typeof locale.bind === 'function' ? locale.bind(NS) : translator(activeLocale(locale))
          ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'grok-workflow: dictionaries')
          ctx.effect(() => locale.register(PANEL_NS, PANEL_DICT), 'grok-workflow: task panel dictionaries')
          // Remount so the slot carries `locale: NS`: the framework then seats a `t` the
          // renderer re-derives on every locale revision, and the page repaints in place.
          stop()
          stop = startPages(ctx, face, i18n)
          restartPanel()
          restartProgress()
          // Last, so the switch joins the list after the page and the panel: the slot is
          // additive, and the entries that existed before keep their positions.
          restartSwitch()
          return teardown
        })
        // `uiWorkspace` is optional and late for the same reason `locale` is: a required
        // injection would leave the plugin pending in a composition that has no workspace
        // service, and DSH reports a pending entry as a boot failure. Without it the task
        // panel is simply not registered and the stock renderer keeps the key.
        ctx.inject(['uiWorkspace'], (scope) => {
          workspace = scope.uiWorkspace
          startPanel()
          return () => {
            if (typeof stopPanel === 'function') stopPanel()
            stopPanel = undefined
            workspace = undefined
          }
        })
        // The progress tab's services are optional and late for exactly the same reason:
        // requiring them would make the whole bundle pending in a composition that has no
        // conversation service, and a missing third tab is a far smaller loss than a
        // plugin that never boots. `status.progressMissing` names the absence on the page.
        ctx.inject(['uiConversation', 'sessions'], (scope) => {
          progressServices = { uiConversation: scope.uiConversation, sessions: scope.sessions }
          // The workflow switch follows the same face for a different reason: it is how a
          // record `/grok off` wrote reaches an already-mounted button. Two readers of one
          // injection, so no second optional dependency is added to the graph.
          offerModeSessions(scope.sessions)
          // `conversation` is the tab's *optional* third face: it is the only way to write
          // the input box (§19.4), so it is asked for on its own fiber — inside the outer
          // one, like `uiWorkspace` — rather than added to the list above. Requiring it in
          // the outer list would leave the whole tab pending in a composition that has no
          // conversation service, and a missing draft face must cost the button, not the
          // page. The tab is remounted when it arrives or leaves, so the dock follows it.
          const stopConversation = scope.inject(['conversation'], (inner) => {
            progressServices = { ...progressServices, conversation: inner.conversation }
            restartProgress()
            return () => {
              if (progressServices !== undefined) {
                const rest = { ...progressServices }
                delete rest.conversation
                progressServices = rest
              }
              restartProgress()
            }
          })
          startProgress()
          return () => {
            if (typeof stopConversation === 'function') stopConversation()
            if (typeof stopProgress === 'function') stopProgress()
            stopProgress = undefined
            progressServices = undefined
            offerModeSessions(undefined)
            // The face that served the tab is gone: say so, so the page does not keep a
            // "mounted" claim about a tab nobody can open.
            i18n.progress.set('unmounted')
          }
        })
      } else {
        console.warn('[grok-workflow] this composition cannot inject services: the settings page keeps its English copy.')
      }
      // The switch needs no optional service, so it is mounted here — after the fiber-bound
      // entries — and stays mounted for the life of the plugin. `disposed` guards the one
      // case that matters: a disposer that runs before this line must not be followed by a
      // registration nobody can drop. When the locale fiber already mounted it (that path
      // runs first), `switchMounted` keeps this from registering a second copy.
      if (!switchMounted) startSwitch()
      return teardown
    }

    exports.apply = apply
    exports.inject = inject
    exports.NS = NS
    exports.GROK_WORKFLOW_FIELDS = FIELDS
    exports.GROK_WORKFLOW_READ_ONLY = READ_ONLY
    exports.GROK_WORKFLOW_ROLES = ROLES
    // T5: kept for the bundle shape; always empty since T4 (`switchOn` fixed).
    exports.GROK_WORKFLOW_SWITCHABLE_CLASSES = []
    exports.GROK_WORKFLOW_GROUPS = GROUPS
    exports.GROK_WORKFLOW_LOCALES = LOCALES
    exports.GROK_WORKFLOW_DICT = DICT
    // D-155: the removed-key list duplicated for the browser; `test/client.spec.ts`
    // pins it equal to `REMOVED_CONFIG_KEYS` item by item.
    exports.GROK_WORKFLOW_REMOVED_KEYS = REMOVED_KEYS
    exports.GROK_WORKFLOW_CHAIN_LIMIT = CHAIN_LIMIT
    exports.GROK_WORKFLOW_ROUTE_INFLIGHT_MIN = ROUTE_INFLIGHT_MIN
    exports.GROK_WORKFLOW_ROUTE_INFLIGHT_MAX = ROUTE_INFLIGHT_MAX
    /** Internals pinned by test/client.spec.ts (no runtime caller). */
    exports.GROK_WORKFLOW_INTERNALS = {
      validate, formatError, fieldLabel, opsFor, draftOf, resolveNamespace, translate, translator, activeLocale,
      comboWarn, emptyCapWarn, limitOverrunWarn, parseConfigNotices, refreshConfigNotices, configNotices,
      CONFIG_NOTICES_ROUTE_PATH, EnumField, ROLE_ORDER, UpdateCard,
      PLUGIN_VERSION, UPDATE_LATEST, UPDATE_COMMAND,
      // The upgrade card's route verbs, so `test/update-entry.spec.ts` drives the same
      // normalisation the button does instead of a copy of it.
      UPDATE_ROUTE_PATH, checkUpdate, installUpdate, isNewerVersion,
    }
    exports.GROK_WORKFLOW_UPDATE = {
      version: PLUGIN_VERSION,
      latest: UPDATE_LATEST,
      command: UPDATE_COMMAND,
      state: UPDATE_UP_TO_DATE ? 'latest' : 'newer',
    }
    /** Task panel: the `workflow-run` node renderer this bundle registers in place of the stock one. */
    exports.GROK_WORKFLOW_PANEL = {
      NS: PANEL_NS,
      DICT: PANEL_DICT,
      component: WorkflowRunPanel,
      mount: mountPanel,
      translate: panelTranslate,
      translator: panelTranslator,
      memberMode: panelMemberMode,
      openableKey: panelOpenableKey,
      openableMap: panelOpenableMap,
      runMode: panelRunMode,
      phaseSummary: panelPhaseSummary,
      statusKey: PANEL_STATUS_KEY,
    }
    /**
     * Progress tab: everything `test/client.spec.ts` pins, so the hand-written
     * JavaScript here and the typed rules in `src/progress-tab.ts` are compared rather
     * than assumed to agree.
     */
    exports.GROK_WORKFLOW_PROGRESS = {
      target: PROGRESS_TARGET,
      kind: PROGRESS_KIND,
      viewId: PROGRESS_VIEW_ID,
      viewOrder: PROGRESS_VIEW_ORDER,
      eventTypes: PROGRESS_EVENT_TYPES,
      detailEventType: PROGRESS_DETAIL_EVENT_TYPE,
      summaryFinalEventType: PROGRESS_SUMMARY_FINAL_EVENT_TYPE,
      summaryRejectedEventType: PROGRESS_SUMMARY_REJECTED_EVENT_TYPE,
      stages: PROGRESS_STAGES,
      detailFields: PROGRESS_DETAIL_FIELDS,
      chipKey: PROGRESS_CHIP_KEY,
      planKey: PROGRESS_PLAN_KEY,
      logStateKey: PROGRESS_LOG_STATE_KEY,
      logRoleKey: PROGRESS_LOG_ROLE_KEY,
      css: PROGRESS_CSS,
      component: ProgressView,
      eventDefinition: progressEventDefinition,
      viewDefinition: progressViewDefinition,
      Builder: ProgressSnapshotBuilder,
      mount: mountProgress,
      fold: foldProgressEvents,
      selectActiveRun,
      nodeState: progressNodeState,
      recoveredFailures: progressRecoveredFailures,
      currentFailureCount: progressCurrentFailureCount,
      percent: progressPercent,
      deriveTrack: deriveProgressTrack,
      deriveProgressFlow,
      derivePanelGraph,
      panelMermaid,
      parsePanelMermaid,
      layoutPanelGraph,
      revealSheet: progressPanelReveal,
      detailFor: progressDetailFor,
      detailSources: progressDetailSources,
      detailField: progressDetailField,
      parseCoordination: parseProgressCoordination,
      createStatus: createProgressStatus,
    }
    /**
     * Exports.GROK_WORKFLOW_LOOP points into {@link LOOP_SWITCH}; the bundle object is
     * the same shape the factory returns, so the tests drive exactly what mounts.
     */
    exports.GROK_WORKFLOW_LOOP = LOOP_SWITCH
    /**
     * Composer-tool-row self-iteration switch: the browser half of the iterate route.
     * Pinned by `test/client.spec.ts` against `ITERATE_ROUTE_PATH` in `src/loop.ts`
     * and against the identity separation in `test/iterate.spec.ts`, so the two
     * switches cannot drift into sharing a slot.
     */
    exports.GROK_WORKFLOW_ITERATE = ITERATE_SWITCH
    /**
     * Composer-tool-row workflow switch: `/grok on|off` as a button. Pinned by
     * `test/client.spec.ts` against the mode route's path, action list and answer
     * shape, so the button and the slash command cannot drift into two switches.
     */
    exports.GROK_WORKFLOW_MODE = MODE_SWITCH
    return module.exports
  },
})
