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
      // Page shows auto/full (mock “模式”): auto maps to stored `triage`,
      // full maps to stored `full`.
      { key: 'mode', group: 'mode', kind: 'enum', options: ['triage', 'full'], def: 'triage' },
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
    const PLUGIN_VERSION = '0.13.18'
    const UPDATE_LATEST = '0.13.18'
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
      'card.summary': 'Decide how hard Grok works: a master switch, five role chains, the limits, and whether it repeats.',

      'page.intro': 'How Grok works for you.',

      // Live one-line status under the intro, derived from the current draft.
      'status.off': 'Off — just chatting',
      'status.off.detail': 'Grok answers directly, no helpers. Send /grok for one serious run.',
      'status.triage': 'On — auto pilot',
      'status.triage.detail': 'Easy ones answered directly, hard ones get the team.',
      'status.full': 'On — full crew',
      'status.full.detail': 'The whole team on every message: best quality, slowest.',

      'group.mode': 'Master switch & mode',
      'group.limits': 'How much effort',
      'group.roles': 'Who does what',
      'group.loop': 'Repeat runs',
      'group.iterate': 'Self-iteration',

      // T5 visible-field labels only (no hints, no Danger, no read-only).
      'field.mode': 'Mode',
      'field.grokDefault': 'Work hard by default',
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
      'field.loopMaxRounds': 'Rounds at most',
      'field.loopFailStreak': 'Stop after failed rounds',
      'field.loopIntervalMin': 'Minutes between rounds',
      'field.iterateIntervalMin': 'Minutes between rounds',
      'field.iterateTemplate': 'Heartbeat prompt template',
      'field.iterateTemplate.hint': 'Stored in the profile; the Self-iterate switch arms a heartbeat with this text. Empty falls back to the built-in default.',

      // Page shows auto/full; stored values stay `triage`/`full` (T4/T5).
      'option.mode.triage': 'auto',
      'option.mode.full': 'full',
      'option.grokDefault.off': 'Off',
      'option.grokDefault.on': 'On',
      'option.loopEnabled.off': 'Off',
      'option.loopEnabled.on': 'On',
      'option.replan.off': 'Off',
      'option.replan.on': 'On',

      'mode.auto.title': 'Auto pilot',
      'mode.auto.detail': 'Judge first, then call the team only when needed.',
      'mode.full.title': 'Full crew',
      'mode.full.detail': 'The whole team on every message.',

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

      // --- The "进度" conversation tab (see the progress block at the end of this file) ---
      'view.progress': 'Progress',
      'progress.title': 'Task progress',
      'progress.aria': 'Task progress track',
      'progress.percent': '{settled}/{declared} · {percent}%',
      'progress.percentHint': '{settled} of {declared} declared rows settled; this is not a task verdict',
      'progress.unsettled': 'No rows declared yet',
      'progress.stage.start': 'Start',
      'progress.stage.plan': 'Plan',
      'progress.stage.execute': 'Execute',
      'progress.stage.verify': 'Verify',
      'progress.stage.synthesize': 'Synthesize',
      'progress.stage.end': 'End',
      'progress.unphased': 'Unphased',
      'progress.extraHint': 'Plan task, appended from its phase',
      'progress.state.pending': 'Pending',
      'progress.state.doing': 'Running',
      'progress.state.done': 'Done',
      'progress.state.blocked': 'Blocked',
      'progress.state.cancelled': 'Cancelled',
      'progress.state.failed': 'Failed',
      'progress.derived.runEndedUnsettled': 'The run ended while this stage still had unsettled rows — the state is derived, not reported.',
      'progress.derived.outcomeUnsettled': 'The engine reported an outcome that is neither completed nor cancelled — shown as blocked.',
      'progress.notReported': 'Not reported in the events',
      'progress.empty.title': 'No workflow progress in this session yet',
      'progress.empty.body': 'The track is folded from the four tool-workflow events this plugin records; it appears once a run starts.',
      'progress.member.open': 'Open child session',
      'progress.source.stageDetail': 'Source: stage-detail event',
      'progress.source.coordination': 'Source: child coordination block',
      'progress.source.notReported': 'Source: not reported',
      'progress.field.workCommit': 'Work commit',
      'progress.field.changes': 'Changes',
      'progress.field.testsRun': 'Tests run',
      'progress.field.results': 'Test results',
      'progress.field.localRuntimeVerified': 'Local runtime verified',
      'progress.field.blockers': 'Blockers',
      'progress.field.nextAction': 'Next action',
      // --- Spine + task band (two tracks): new copy only, every old key above is untouched. ---
      'progress.settle.aria': 'Settled rows by outcome',
      'progress.settle.ok': '{count} done',
      'progress.settle.bad': '{count} failed',
      'progress.settle.retried': '{count} retried',
      'progress.settle.warn': '{count} cancelled',
      'progress.settle.open': '{count} unsettled',
      'progress.settle.unsettled': 'no settled row yet',
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
      'progress.tasks.aria': 'Rows by stage',
      'progress.branch.settledOf': '{settled}/{declared}',
      'progress.branch.running': '{count} running',
      'progress.branch.failedCount': 'Failed {count}',
      'progress.branch.evidenceRows': '{count} rows ran inside the plan tasks below',
      'progress.evidenceHint': 'ran inside the plan tasks listed below',
      'progress.chain.execute': 'Execute',
      'progress.chain.check': 'Verify',
      'progress.chain.review': 'Review',
      'progress.chain.pendingHint': 'this gate has not run yet',
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
      // Same record as the slash command (`plugin:grok-workflow/mode`), so the copy says
      // what the session does, not what the deployment default is: an unrecorded session
      // shows the Host's `grokDefault`, which the route reports.
      'mode.switch.label': 'Workflow',
      'mode.switch.aria': 'Turn the grok workflow on or off for this session',
      'mode.switch.off': 'Off',
      'mode.switch.on': 'On · full crew',
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
    }

    const ZH = {
      'card.title': 'Grok workflow',
      'card.summary': '定 Grok 下多大的力气：一个总开关，五条角色链，几个上限，还有要不要自动接着跑。',

      'page.intro': 'Grok 怎么帮你干活，在这里定。',

      'status.off': '关着：只聊天',
      'status.off.detail': '问什么答什么，不派帮手。发 /grok 认真干一次。',
      'status.triage': '开着：自动挡',
      'status.triage.detail': '简单的直接答，难的才开团队。',
      'status.full': '开着：全员上',
      'status.full.detail': '每条消息都走完整团队：质量最高，也最慢。',

      'group.mode': '总开关和模式',
      'group.limits': '下多大力气',
      'group.roles': '谁来干',
      'group.loop': '自动接着干',
      'group.iterate': '自迭代',

      // T5 visible-field labels only (no hints, no Danger, no read-only).
      'field.mode': '模式',
      'field.grokDefault': '默认下大力气',
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
      'field.loopMaxRounds': '最多跑几轮',
      'field.loopFailStreak': '连败几轮就停',
      'field.loopIntervalMin': '两轮之间隔几分钟',
      'field.iterateIntervalMin': '两轮之间隔几分钟',
      'field.iterateTemplate': '心跳提示词模板',
      'field.iterateTemplate.hint': '随档案保存；「自迭代」开关用心跳投递这段文字。留空则回退到内置默认模板。',

      // Page shows auto/full; stored values stay `triage`/`full` (T4/T5).
      'option.mode.triage': 'auto',
      'option.mode.full': 'full',
      'option.grokDefault.off': '关',
      'option.grokDefault.on': '开',
      'option.loopEnabled.off': '关',
      'option.loopEnabled.on': '开',
      'option.replan.off': '关',
      'option.replan.on': '开',

      'mode.auto.title': '自动挡',
      'mode.auto.detail': '先看难易，难的才开团队。',
      'mode.full.title': '全员上',
      'mode.full.detail': '每条消息都走完整团队。',

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

      // --- 进度 Tab（见本文件末尾的 progress 区块）---
      'view.progress': '进度',
      'progress.title': '任务进度',
      'progress.aria': '任务进度轨道',
      'progress.percent': '{settled}/{declared} · {percent}%',
      'progress.percentHint': '已声明 {declared} 行，已结算 {settled} 行；这不是任务通过数',
      'progress.unsettled': '尚未声明任何行',
      'progress.stage.start': '起点',
      'progress.stage.plan': '规划',
      'progress.stage.execute': '执行',
      'progress.stage.verify': '检查',
      'progress.stage.synthesize': '汇总',
      'progress.stage.end': '终点',
      'progress.unphased': '未分阶段',
      'progress.extraHint': '计划任务，按 phase 追加',
      'progress.state.pending': '待开始',
      'progress.state.doing': '进行中',
      'progress.state.done': '已完成',
      'progress.state.blocked': '阻塞',
      'progress.state.cancelled': '已取消',
      'progress.state.failed': '失败',
      'progress.derived.runEndedUnsettled': '运行已结束，但该阶段还有未结算的行——状态是推导出来的，不是事件里写的。',
      'progress.derived.outcomeUnsettled': '引擎报告的结果既不是完成也不是取消——按阻塞显示。',
      'progress.notReported': '事件中没有报告',
      'progress.empty.title': '这次会话还没有工作流进度',
      'progress.empty.body': '轨道由本插件记录的四个 tool-workflow 事件折叠而成；开始一次工作流后就会出现。',
      'progress.member.open': '打开子会话',
      'progress.source.stageDetail': '来源：stage-detail 事件',
      'progress.source.coordination': '来源：子会话协调块',
      'progress.source.notReported': '来源：未报告',
      'progress.field.workCommit': '工作提交',
      'progress.field.changes': '改动内容',
      'progress.field.testsRun': '跑了哪些测试',
      'progress.field.results': '测试结果',
      'progress.field.localRuntimeVerified': '本机真机验证',
      'progress.field.blockers': '卡点',
      'progress.field.nextAction': '下一步',
      // --- 脊 + 任务带（双带）：只新增文案，上面旧 key 一字不动。 ---
      'progress.settle.aria': '按结果分布的已声明行',
      'progress.settle.ok': '{count} 完成',
      'progress.settle.bad': '{count} 失败',
      'progress.settle.retried': '{count} 已重试',
      'progress.settle.warn': '{count} 已取消',
      'progress.settle.open': '{count} 未结算',
      'progress.settle.unsettled': '尚无结算行',
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
      'progress.tasks.aria': '按阶段分组的行',
      'progress.branch.settledOf': '{settled}/{declared}',
      'progress.branch.running': '{count} 运行中',
      'progress.branch.failedCount': '失败 {count}',
      'progress.branch.evidenceRows': '{count} 行在下方任务节点中执行',
      'progress.evidenceHint': '在下方任务节点中执行',
      'progress.chain.execute': '执行',
      'progress.chain.check': '检查',
      'progress.chain.review': '复核',
      'progress.chain.pendingHint': '这一关还没跑',
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
      // 文案说这个会话会怎么跑：没有记录的会话显示宿主 `grokDefault` 报回来的状态。
      'mode.switch.label': 'workflow总开关',
      'mode.switch.aria': '为这个会话打开或关闭 grok 工作流',
      'mode.switch.off': '关',
      'mode.switch.on': '开 · 全员模式',
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
      checkbox: { width: '16px', height: '16px', accentColor: '#3b6ef6', flex: 'none' },
      button: { minHeight: '32px', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      primary: { minHeight: '32px', padding: '5px 18px', borderRadius: '8px', border: '1px solid transparent', background: '#3b6ef6', color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 600 },
      footer: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 0, padding: '12px 0', marginTop: '4px', borderTop: `1px solid ${HAIRLINE}`, background: 'var(--dsh-settings-footer-bg, rgba(128,128,128,0.12))', backdropFilter: 'blur(8px)' },
      step: { minWidth: '32px', minHeight: '32px', padding: '0 8px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: '15px', lineHeight: 1 },
      cards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
      card2: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start', textAlign: 'left', border: '1px solid rgba(128,128,128,0.35)', borderRadius: '10px', padding: '12px 14px', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      card2On: { borderColor: '#3b6ef6', background: 'rgba(59,110,246,0.08)' },
      card2Top: { display: 'flex', gap: '8px', alignItems: 'center' },
      card2Check: { color: '#3b6ef6', fontWeight: 700 },
      card2Tag: { fontSize: '12px', opacity: 0.6 },
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

    function ScalarField(props) {
      const { field, draft, disabled, onChange, t } = props
      const value = draft[field.key]
      if (field.kind === 'boolean') {
        return h('input', {
          type: 'checkbox', checked: value === true, disabled,
          style: styles.checkbox,
          onChange: (event) => onChange(field.key, event.target.checked),
          'data-field': field.key,
        })
      }
      if (field.kind === 'enum') {
        return h(EnumField, { field, value, disabled, onChange, t })
      }
      if (field.kind === 'number') {
        return h('input', {
          type: 'number', style: { ...styles.input, ...styles.narrow }, value: String(value), disabled,
          min: field.min, max: field.max, step: 1,
          onChange: (event) => onChange(field.key, event.target.value === '' ? '' : Number(event.target.value)),
          'data-field': field.key,
        })
      }
      return h('input', {
        type: 'text', style: styles.input, value: String(value === undefined ? '' : value), disabled,
        placeholder: field.key === 'subagentProvider' ? t('roles.manualProvider') : undefined,
        onChange: (event) => onChange(field.key, event.target.value),
        'data-field': field.key,
      })
    }

    // T5 removed the ClassPicker body: `switchOn` is a fixed internal policy
    // since T4. The function stays (never called by the page) so the removal
    // site is explicit instead of a silent deletion.
    function ClassPicker(props) {
      return null
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
      return h('div', { style: styles.roleCard, 'data-gw-guardian': true },
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

    // T5 removed the TriageModelPicker body with `triageModel` (fixed
    // internal behavior since T4). The function stays (never called by the
    // page) so the removal site is explicit instead of a silent deletion.
    function TriageModelPicker(props) {
      return null
    }
    /**
     * The version/upgrade card: current installed version vs newest release.
     *
     * Read-only on purpose — it shows two facts and one copyable command that
     * reuses the existing install channel (`dsh plugin add`, i.e. the `plugin
     * add` semantics the README documents). It never phones home: the latest
     * release is the static `UPDATE_LATEST`, refreshed by a release round.
     * @param props - `{ t }`, the guarded translator for the active language.
     */
    function UpdateCard(props) {
      const { t } = props
      const [copied, setCopied] = useState(false)
      const copy = () => {
        try {
          const done = () => setCopied(true)
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            Promise.resolve(navigator.clipboard.writeText(UPDATE_COMMAND)).then(done, done)
          } else {
            done()
          }
        } catch {
          setCopied(true)
        }
      }
      return h('div', { style: styles.card, 'data-gw-update': `${PLUGIN_VERSION}:${UPDATE_LATEST}` },
        h('h3', { style: styles.groupTitle }, t('update.title')),
        h('p', { style: styles.hint }, t('update.body', { current: PLUGIN_VERSION, target: UPDATE_LATEST, command: UPDATE_COMMAND })),
        h('p', { style: styles.mono, 'data-gw-update-command': true }, UPDATE_COMMAND),
        h('p',
          { style: styles.hint, 'data-gw-update-state': UPDATE_UP_TO_DATE ? 'latest' : 'newer' },
          UPDATE_UP_TO_DATE ? t('update.state.latest') : t('update.state.newer', { target: UPDATE_LATEST })),
        h('p', { style: styles.hint, 'data-gw-update-terminal': true }, t('update.terminal')),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: styles.hint }, `${t('update.current')}: ${PLUGIN_VERSION}`),
          h('button', { type: 'button', style: styles.button, onClick: copy, 'data-action': 'update-copy' }, t('update.copy'))))
    }

    /**
     * The live one-line status under the intro, derived from the current draft:
     * off → plain chat; on + triage → smart triage; on + full → full team.
     * It follows the draft in real time and is never saved.
     */
    function StatusLine(props) {
      const { draft, t } = props
      const on = draft.grokDefault === 'on'
      const full = draft.mode === 'full'
      const key = !on ? 'status.off' : (full ? 'status.full' : 'status.triage')
      const detailKey = `${key}.detail`
      const dot = !on ? STATUS_COLOR.pending : (full ? STATUS_COLOR.doing : STATUS_COLOR.done)
      return h('div', { style: !on ? styles.statusOff : styles.statusOn },
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
      const enumRow = (key) => {
        const field = fieldByKey(key)
        return h(FieldRow, {
          key, fieldKey: key, title: t(`field.${key}`),
          control: h(EnumField, { field, value: draft[key], disabled, onChange, t }),
        })
      }
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

      // Mode as two radio cards (not a dropdown): the difference between the
      // two is the point of the control, hiding it in a select is why readers
      // could not tell them apart. Stored values stay `triage`/`full`.
      const modeCards = () => {
        const options = [
          { stored: 'triage', titleKey: 'mode.auto.title', detailKey: 'mode.auto.detail', labelKey: 'option.mode.triage' },
          { stored: 'full', titleKey: 'mode.full.title', detailKey: 'mode.full.detail', labelKey: 'option.mode.full' },
        ]
        return h('div', { style: styles.cards, 'data-field': 'mode' },
          options.map((option) => {
            const selected = draft.mode === option.stored
            return h('button', {
              key: option.stored, type: 'button',
              style: selected ? { ...styles.card2, ...styles.card2On } : styles.card2,
              disabled, 'aria-pressed': selected,
              onClick: () => onChange('mode', option.stored),
              'data-mode': option.stored,
            },
            h('span', { style: styles.card2Top },
              h('strong', null, t(option.titleKey)),
              selected ? h('span', { style: styles.card2Check }, '✓') : null),
            h('span', { style: styles.hint }, t(option.detailKey)),
            h('span', { style: styles.card2Tag }, t(option.labelKey)))
          }))
      }

      return h('div', { style: styles.page, 'data-page': 'grok-workflow' },
        h(PageStyle, null),
        h('div', null,
          h('h2', { style: styles.title }, t('card.title')),
          h('p', { style: { ...styles.hint, margin: '0 0 12px', fontSize: '13px' } }, t('page.intro')),
          h(StatusLine, { draft, t }),
          progressNote),
        // --- 1 · 总开关 + 模式 ---
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
          }),
          modeCards()),
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
        'status.failed': '失败',
        'status.cancelled': '已取消',
        'status.interrupted': '已中断',
        // A status outside the five above is one this panel does not word: it says so
        // rather than printing the engine's own token in the middle of the sentence.
        'status.unknown': '状态未知',
        'statusCount.running': '运行中 {count}',
        'statusCount.completed': '已完成 {count}',
        'statusCount.failed': '失败 {count}',
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
        'status.failed': 'Failed',
        'status.cancelled': 'Cancelled',
        'status.interrupted': 'Interrupted',
        // A status outside the five above is one this panel does not word; it says so
        // instead of printing the engine's own token in the middle of the sentence.
        'status.unknown': 'Unknown',
        'statusCount.running': 'Running {count}',
        'statusCount.completed': 'Completed {count}',
        'statusCount.failed': 'Failed {count}',
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
      failed: STATUS_COLOR.failed,
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
    /** View tab id, ordered after the stock chat (0) and trajectory (10). */
    const PROGRESS_VIEW_ID = 'grok-progress'
    const PROGRESS_VIEW_ORDER = 20
    /** The seven progress and Guardian lifecycle events the tab folds; all others are ignored. */
    const PROGRESS_EVENT_TYPES = [
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
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
     * The final answer is delivered by the gate (`relayText` in the turn's own message),
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
     * Ring glyph per state.
     *
     * The ring is 28px and the state word already exists, so the glyph is redundant on
     * purpose: a reader can tell the stages apart without relying on colour, and the
     * `aria-label` still carries the words.
     */
    const PROGRESS_STATE_GLYPH = {
      pending: '',
      doing: '▸',
      done: '✓',
      blocked: '!',
      cancelled: '×',
      failed: '✕',
    }

    /**
     * Ring colour per state, all through DSH design tokens.
     *
     * No hex fallback: a wrong colour in a dark composition is worse than an inherited
     * one, and the tokens are what make the track follow a theme or a contrast pass.
     * `cancelled` shares the warning colour because it is neither a success nor a
     * failure — the engine's own word is what distinguishes it, and the label says so.
     */
    const PROGRESS_STATE_COLOR = {
      doing: 'var(--dsw-alias-state-business-primary)',
      done: 'var(--dsw-alias-state-success-primary)',
      failed: 'var(--dsw-alias-state-error-primary)',
      blocked: 'var(--dsw-alias-state-warn-primary)',
      cancelled: 'var(--dsw-alias-state-warn-primary)',
      pending: 'var(--dsw-alias-state-idle-primary)',
    }

    /** The state word, from the same table the settings page uses. */
    const PROGRESS_STATE_KEY = {
      pending: 'progress.state.pending',
      doing: 'progress.state.doing',
      done: 'progress.state.done',
      blocked: 'progress.state.blocked',
      cancelled: 'progress.state.cancelled',
      failed: 'progress.state.failed',
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
        if (runId === undefined || (!isDetail && PROGRESS_EVENT_TYPES.indexOf(record.type) === -1)) continue
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
      plan: ['规划助手', 'planner'],
      execute: ['执行', 'execute', 'worker'],
      verify: ['检查', '核验', 'verify', 'check', 'verifier'],
      synthesize: ['汇总助手', 'summarize', 'synthesizer'],
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

    /** Format one duration for the engine-facts section; `undefined` when it was not measured. */
    function progressDuration(ms) {
      if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined
      if (ms < 1000) return `${Math.round(ms)} ms`
      const seconds = ms / 1000
      if (seconds < 60) return `${seconds.toFixed(1)} s`
      const minutes = Math.floor(seconds / 60)
      return `${minutes} m ${Math.round(seconds - minutes * 60)} s`
    }

    /**
     * The band's wire geometry, shared by the stylesheet and the measurement.
     *
     * The left gutter is a constant. It used to be the right-most owner's trunk position,
     * so a row owned by a later stage widened the indent and pushed every card right: the
     * band moved when nothing about the cards had changed. Attribution now comes from the
     * wire, not from how far a card is indented.
     *
     * Inside that gutter the whole band uses **one** elbow lane under the spine and **one**
     * channel: every owner descends to that single rail, and the rail is drawn once. The
     * earlier per-owner lanes and channels made the cross-stage lines outnumber the stages
     * themselves (2026-11-21 request: too many lines, merge into one); attribution now
     * rides on each owner's own drop and on its stubs, not on how many lanes it occupies.
     */
    const PROGRESS_WIRE_PAD = 40
    const PROGRESS_WIRE_BAND_GAP = 12
    const PROGRESS_WIRE_CHANNEL_X = 18
    const PROGRESS_WIRE_LANE_GAP = 4
    const PROGRESS_WIRE_LANE_CLEARANCE = 4

    /**
     * Q11: the step a plan-task card takes in from the band's own edge.
     *
     * A plan task is a child of the execute group, so it sits one step in; the guardian
     * adjudication card is not a plan task, so it keeps the band's edge. The stylesheet
     * below is built from this number, so the rule and the number cannot disagree.
     */
    const PROGRESS_CARD_INDENT = 16

    /**
     * The track's stylesheet, scoped to `.gw-progress`.
     *
     * Every colour is a `--dsw-alias-*` token and every family is a `--dsw-font-*` token,
     * so the tab follows the theme (light/dark/user/contrast) instead of freezing a shade,
     * and no light block is baked in. The rules that cannot be inline styles live here:
     * the running pulse, the reduced-motion stop, and the two width breakpoints.
     */
    const PROGRESS_CSS = [
      '.gw-progress { position: relative; box-sizing: border-box; width: 100%; min-width: 0; color: var(--dsw-alias-label-primary);',
      '  font-family: var(--dsw-font-family-sans, inherit); font-size: 13px; }',
      '.gw-progress-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 4px 0; }',
      '.gw-progress-title { margin: 0; font-size: 14px; font-weight: 600; }',
      '.gw-progress-percent { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary, inherit); }',
      // D (settle bar): one 100%-wide bar split by outcome, plus the same counts as words.
      // Every width is a count over the declared rows — nothing here is an estimate.
      '.gw-progress-settle { display: flex; align-items: center; gap: 10px; padding: 8px 4px 0;',
      '  font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); }',
      '.gw-progress-settle-bar { flex: 1 1 auto; display: flex; height: 8px; border-radius: 999px; overflow: hidden;',
      '  background: var(--dsw-alias-fill-l2, transparent); border: 1px solid var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-settle-part { display: block; height: 100%; }',
      '.gw-progress-settle-part[data-tone="ok"] { background: var(--dsw-alias-state-success-primary, currentColor); }',
      '.gw-progress-settle-part[data-tone="bad"] { background: var(--dsw-alias-state-error-primary, currentColor); }',
      '.gw-progress-settle-part[data-tone="warn"] { background: var(--dsw-alias-state-warn-primary, currentColor); }',
      // A row that failed and was then replaced by a completed attempt: settled, not red
      // (nothing is broken now), and not `ok` either (that attempt did fail).
      '.gw-progress-settle-part[data-tone="retried"] { background: var(--dsw-alias-label-secondary, currentColor); }',
      '.gw-progress-settle-part[data-tone="open"] { background: repeating-linear-gradient(90deg, var(--dsw-alias-state-idle-primary, currentColor) 0 5px, transparent 5px 9px); }',
      '.gw-progress-settle-legend { flex: none; font-variant-numeric: tabular-nums; }',
      // Fresh mint and soft sky surfaces are mixed with semantic DSH tokens, so
      // contrast and dark-mode colours remain owned by the active theme.
      '.gw-progress-overview { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(230px, .9fr); gap: 12px; align-items: stretch; margin: 8px 4px 4px; }',
      '.gw-progress-overview .gw-progress-settle { display: flex; flex-direction: column; align-items: stretch; gap: 10px; min-width: 0; margin: 0; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 14px; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent); }',
      '.gw-progress-overview .gw-progress-settle-bar { height: 10px; border: 0; background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent); }',
      '.gw-progress-guardian { box-sizing: border-box; min-width: 0; padding: 11px 14px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 28%, var(--dsw-alias-border-l2, currentColor)); border-radius: 14px; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent); }',
      '.gw-progress-guardian[data-state="active"] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, var(--dsw-alias-border-l2, currentColor)); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, transparent); }',
      '.gw-progress-guardian[data-state="cancelled"] { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 38%, var(--dsw-alias-border-l2, currentColor)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 5%, transparent); }',
      '.gw-progress-guardian-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 10px; }',
      '.gw-progress-guardian-title { font-size: 12px; font-weight: 650; }',
      '.gw-progress-guardian-status { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 9px; font-size: 11px; background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, transparent); color: var(--dsw-alias-state-business-primary); }',
      '.gw-progress-guardian[data-state="finished"] .gw-progress-guardian-status { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent); color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-guardian[data-state="cancelled"] .gw-progress-guardian-status { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent); color: var(--dsw-alias-state-error-primary); }',
      '.gw-progress-guardian-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 10px; margin-top: 8px; color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; font-variant-numeric: tabular-nums; }',
      '.gw-progress-guardian-empty { margin: 9px 0 0; color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; }',
      '.gw-progress-guardian-list { display: grid; gap: 6px; margin: 9px 0 0; padding: 0; list-style: none; }',
      '.gw-progress-guardian-list li { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; padding: 6px 8px; border-inline-start: 3px solid var(--dsw-alias-state-warn-primary, currentColor); border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 5%, transparent); font-size: 11px; }',
      '.gw-progress-guardian-list li[data-action="rescue"] { border-inline-start-color: var(--dsw-alias-state-success-primary, currentColor); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent); }',
      '.gw-progress-guardian-finding-label { font-weight: 600; }',
      '.gw-progress-guardian-finding-action { color: var(--dsw-alias-label-secondary, inherit); }',
      // A (two tracks): the spine keeps the full width for the six fixed stages, and the
      // rows hang from it in their own vertical band. A `width: 100%` card inside the
      // horizontal flex line would take its width out of the segments and crush them.
      '.gw-progress-flow { position: relative; margin-top: 2px; }',
      '.gw-progress-wires { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }',
      '.gw-progress-wire { fill: none; stroke: var(--dsw-alias-border-l2, currentColor); stroke-width: 2; }',
      '.gw-progress-wire-head { stroke: none; fill: var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-track, .gw-progress-tasks { position: relative; z-index: 1; box-sizing: border-box; margin: 0; list-style: none; }',
      '.gw-progress-track { display: flex; align-items: stretch; gap: 0; width: 100%; min-width: 0; padding: 10px 12px 4px; }',
      '.gw-progress-seg { flex: 1 1 0; min-width: 0; position: relative; display: flex; flex-direction: column;',
      '  padding: 6px 10px 10px; border: 0; border-right: 1px solid var(--dsw-alias-border-l2, currentColor); text-align: left; }',
      '.gw-progress-seg:last-child { border-right: 0; }',
      // The head wraps instead of squeezing: the ring keeps its 28px, and a long label
      // moves to the next line rather than collapsing to 0.
      '.gw-progress-seg-head { position: relative; z-index: 1; display: flex; align-items: center; flex-wrap: wrap;',
      '  gap: 4px 8px; min-width: 0; width: 100%; min-height: 28px; background: transparent; }',
      // The ring is the state mark: geometry here, colour on the inline `borderColor`
      // (PROGRESS_STATE_COLOR). `pending` renders an empty ring, so "not reported" is a
      // visible hollow circle instead of a blank head.
      '.gw-progress-ring { flex: none; box-sizing: border-box; width: 28px; height: 28px;',
      '  border: 2px solid var(--dsw-alias-state-idle-primary, currentColor); border-radius: 50%;',
      '  display: inline-flex; align-items: center; justify-content: center; }',
      '.gw-progress-glyph { font-size: 12px; line-height: 1; }',
      '.gw-progress-seg[data-state="doing"] .gw-progress-ring { animation: gw-progress-pulse 1.6s ease-in-out infinite; }',
      '.gw-progress-seg-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary, currentColor); }',
      '.gw-progress-seg[data-state="failed"] .gw-progress-seg-dot { background: var(--dsw-alias-state-error-primary, currentColor); }',
      '.gw-progress-label { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
      '  font-size: 13px; font-weight: 600; }',
      '.gw-progress-badge { display: inline-block; min-width: 20px; text-align: center;',
      '  font-size: 11px; border-radius: 999px; padding: 0 6px;',
      '  border: 1px solid var(--dsw-alias-border-l2, currentColor); color: var(--dsw-alias-label-secondary, inherit); }',
      '.gw-progress-badge[data-tone="red"] { background: var(--dsw-alias-state-error-primary, currentColor);',
      '  border-color: var(--dsw-alias-state-error-primary, currentColor); color: var(--dsw-alias-label-inverse, inherit); }',
      '.gw-progress-meta { margin-top: 4px; min-width: 0; width: 100%; color: var(--dsw-alias-label-secondary, inherit);',
      '  font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      // B (duration rail): a 3px rail whose fill is this stage's measured row time over the
      // slowest stage's. Both timestamps must exist to draw a fill; a stage measured to have
      // no duration keeps the dashed rail instead of a zero-length green lie.
      '.gw-progress-dur { display: block; height: 3px; margin-top: 7px; border-radius: 999px; overflow: hidden;',
      '  background: var(--dsw-alias-fill-l2, transparent); }',
      '.gw-progress-dur i { display: block; height: 100%; border-radius: 999px; background: var(--dsw-alias-state-success-primary, currentColor); }',
      '.gw-progress-dur[data-state="doing"] i { background: var(--dsw-alias-state-business-primary, currentColor); }',
      '.gw-progress-dur[data-state="failed"] i, .gw-progress-dur[data-state="blocked"] i,',
      '.gw-progress-dur[data-state="cancelled"] i { background: var(--dsw-alias-state-warn-primary, currentColor); }',
      '.gw-progress-dur[data-empty="true"] { background: repeating-linear-gradient(90deg, var(--dsw-alias-border-l2, currentColor) 0 3px, transparent 3px 6px); }',
      // The connector between two segments: a hairline on the rings' centre line (6px pad +
      // 14px half-ring = 19px) that fills only where the track has actually passed.
      '.gw-progress-link { flex: 0 0 auto; align-self: flex-start; width: 18px; height: 2px; margin-top: 19px;',
      '  border-radius: 999px; background: var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-link[data-filled="true"] { background: var(--dsw-alias-state-success-primary, currentColor); }',
      '.gw-progress-link[data-flowing="true"] {',
      '  background: repeating-linear-gradient(90deg, var(--dsw-alias-state-business-primary, currentColor) 0 6px, transparent 6px 10px);',
      '  animation: gw-progress-flow 1s linear infinite; }',
      // The task band: one card per task group, behind a fixed left gutter wide enough for
      // every wire channel. The gutter is a constant so the cards do not move when a later
      // stage owns a task; only the top margin grows, because that is where the elbow lanes
      // under the spine live and a lane may not run across a card.
      `.gw-progress-tasks { width: 100%; margin-top: calc(${PROGRESS_WIRE_BAND_GAP}px + var(--gw-wire-depth, 0px)); padding: 0 12px 0 ${PROGRESS_WIRE_PAD}px; }`,
      // The gutter keeps every channel left of the cards: a card must never have a wire
      // running through it, and a stub only ever spans the gutter itself.
      '.gw-progress-task { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; box-sizing: border-box; min-height: 40px;',
      '  width: 100%; max-width: 100%; margin: 0 0 10px; padding: 6px 10px;',
      '  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, var(--dsw-alias-border-l2, currentColor)); border-radius: 13px;',
      '  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 3%, transparent); text-align: left; }',
      '.gw-progress-task[data-state="failed"] { border-left: 3px solid var(--dsw-alias-state-error-primary, currentColor); padding-left: 8px; }',
      '.gw-progress-task[data-state="doing"] { border-color: var(--dsw-alias-state-business-primary, currentColor); }',
      // Q11: a plan-task card steps in one indent from the band's edge (the guardian card
      // keeps the edge). `max-width` is what keeps the rule free of horizontal overflow:
      // an indented card may not exceed the band's own content box, at any width.
      `.gw-progress-task[data-indent="true"] { margin-left: ${PROGRESS_CARD_INDENT}px; max-width: calc(100% - ${PROGRESS_CARD_INDENT}px); }`,
      '.gw-progress-task .gw-progress-ring { width: 20px; height: 20px; }',
      '.gw-progress-task .gw-progress-glyph { font-size: 10px; }',
      // Q10(b): the task name is the one thing a reader needs whole, so it wraps onto
      // the card's second line instead of being ellipsized. `anywhere` keeps a long
      // unbroken token inside the card rather than pushing the pills off it.
      '.gw-progress-task-name { flex: 1 1 12ch; min-width: 0; overflow-wrap: anywhere;',
      '  font-size: 12px; font-weight: 600; line-height: 1.35; }',
      '.gw-progress-task-meta { flex: none; color: var(--dsw-alias-label-secondary, inherit);',
      '  font-size: 11px; font-variant-numeric: tabular-nums; }',
      '.gw-progress-subs { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 0; margin-left: auto; flex: none; }',
      // The pill is the only clickable thing in the band, and only for a row whose child the
      // shell can actually open. Colour is never the only encoding: the pill carries the
      // state ring and the row's own label.
      '.gw-progress-pill { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px;',
      '  border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 999px; background: transparent;',
      '  color: inherit; font: inherit; font-size: 11px; text-decoration: none; }',
      '.gw-progress-pill[data-open="true"] { cursor: pointer; }',
      '.gw-progress-pill[data-open="true"]:hover { border-color: var(--dsw-alias-state-business-primary, currentColor); }',
      '.gw-progress-pill[data-state="failed"] { border-color: var(--dsw-alias-state-error-primary, currentColor); }',
      '.gw-progress-pill[data-state="doing"] { border-color: var(--dsw-alias-state-business-primary, currentColor); }',
      '.gw-progress-pill .gw-progress-ring { width: 12px; height: 12px; border-width: 2px; }',
      '.gw-progress-pill .gw-progress-glyph { font-size: 8px; }',
      // The mini arrow between two rows of one task: the tone names the row it points at.
      '.gw-progress-mini { position: relative; flex: none; width: 22px; height: 2px; margin: 0 2px;',
      '  background: var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-mini::after { content: ""; position: absolute; right: -1px; top: -3px; border-left: 5px solid var(--dsw-alias-border-l2, currentColor);',
      '  border-top: 4px solid transparent; border-bottom: 4px solid transparent; }',
      '.gw-progress-mini[data-tone="ok"] { background: var(--dsw-alias-state-success-primary, currentColor); }',
      '.gw-progress-mini[data-tone="ok"]::after { border-left-color: var(--dsw-alias-state-success-primary, currentColor); }',
      '.gw-progress-mini[data-tone="bad"] { background: var(--dsw-alias-state-error-primary, currentColor); }',
      '.gw-progress-mini[data-tone="bad"]::after { border-left-color: var(--dsw-alias-state-error-primary, currentColor); }',
      '.gw-progress-mini[data-tone="pending"] { background: repeating-linear-gradient(90deg, var(--dsw-alias-border-l2, currentColor) 0 3px, transparent 3px 6px); }',
      '.gw-progress-empty { padding: 12px 4px; color: var(--dsw-alias-label-secondary, inherit); }',
      '@keyframes gw-progress-flow { to { background-position: 10px 0; } }',
      '@keyframes gw-progress-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }',
      // Motion is decoration here: the state word already says "running".
      '@media (prefers-reduced-motion: reduce) {',
      '  .gw-progress-seg[data-state="doing"] .gw-progress-ring,',
      '  .gw-progress-link[data-flowing="true"] { animation: none; } }',
      '@media (max-width: 720px) { .gw-progress-overview { grid-template-columns: minmax(0, 1fr); }',
      '  .gw-progress-seg { padding-left: 6px; padding-right: 6px; }',
      // Narrow columns stack the ring above its label, so the label keeps a line of its
      // own instead of being ellipsized to nothing beside a 28px ring.
      '  .gw-progress-seg-head { flex-direction: column; align-items: flex-start; gap: 4px; }',
      '  .gw-progress-link { width: 10px; }',
      '  .gw-progress-subs { flex-wrap: wrap; } }',
      // Under 480px the spine turns into a vertical step list (Ant vertical Steps
      // semantics: icon + title + one line each), and the task band follows it as a plain
      // list: there is no room for a trunk beside a 360px-wide card, so the wires go and
      // the cards take the full width. Order still carries the topology.
      '@media (max-width: 480px) {',
      '  .gw-progress-track { flex-direction: column; }',
      '  .gw-progress-seg { border-right: 0; border-inline-start: 2px solid var(--dsw-alias-border-l2, currentColor);',
      '    padding-left: 10px; }',
      '  .gw-progress-seg[data-state="done"] { border-inline-start-color: var(--dsw-alias-state-success-primary, currentColor); }',
      '  .gw-progress-seg[data-state="doing"] { border-inline-start-color: var(--dsw-alias-state-business-primary, currentColor); }',
      '  .gw-progress-seg[data-state="failed"] { border-inline-start-color: var(--dsw-alias-state-error-primary, currentColor); }',
      '  .gw-progress-seg[data-state="blocked"], .gw-progress-seg[data-state="cancelled"] {',
      '    border-inline-start-color: var(--dsw-alias-state-warn-primary, currentColor); }',
      '  .gw-progress-link, .gw-progress-wires { display: none; }',
      `  .gw-progress-tasks { padding-left: 12px; margin-top: ${PROGRESS_WIRE_BAND_GAP}px; }`,
      '}',
    ].join('\n')

    /**
     * The state of one recorded row, from its outcome alone.
     *
     * `doing` is "no settlement yet", never "queued": an unsettled row belongs to a call
     * that started. The catch-all for an outcome that is neither a completion nor a
     * cancellation is `blocked`, the same word the stage states use.
     * @param member - one folded row.
     * @returns its render state.
     */
    function progressMemberState(member) {
      if (member.outcome === undefined) return 'doing'
      if (member.outcome === 'completed') return 'done'
      if (member.outcome === 'cancelled') return 'cancelled'
      if (member.outcome === 'failed') return 'failed'
      return 'blocked'
    }

    /**
     * Measured time of one node: the sum of its rows' own spans.
     *
     * Both end points must exist — a row whose start or settlement the stream never
     * carried contributes nothing rather than an estimate. `undefined` (not `0`) when no
     * row was measurable, so the rail can say "not measured" instead of drawing a
     * zero-length fill that would read as a fast stage.
     * @param node - derived node model.
     * @returns milliseconds, or `undefined` when nothing was measurable.
     */
    function progressNodeDuration(node, now) {
      let total
      const members = Array.isArray(node.members) ? node.members : []
      for (const member of members) {
        // Q10(b): a running row has no settlement time, so its span is measured
        // against the clock the panel ticks. A settled row keeps its measured value;
        // a row the stream never started contributes nothing.
        const end = typeof member.endedAt === 'number'
          ? member.endedAt
          : (member.outcome === undefined && typeof now === 'number' ? now : undefined)
        if (typeof member.startedAt !== 'number' || typeof end !== 'number') continue
        const span = end - member.startedAt
        if (!Number.isFinite(span) || span < 0) continue
        total = (total === undefined ? 0 : total) + span
      }
      return total
    }

    /**
     * The one-line count under a segment.
     *
     * A stage whose rows render in their own task cards is not "not reported": it says
     * how many rows ran under it, because an empty row list is not an absence. The
     * measured time is appended when both timestamps exist; it is never invented.
     * @param node - derived node model.
     * @param t - translator.
     * @returns the meta sentence.
     */
    function progressNodeMeta(node, t, now) {
      const evidence = Array.isArray(node.evidence) ? node.evidence : []
      if (node.members.length === 0) {
        return evidence.length > 0 ? t('progress.branch.evidenceRows', { count: evidence.length }) : t('progress.notReported')
      }
      const failedCount = progressCurrentFailureCount(node.members)
      const doingCount = node.members.filter((member) => member.outcome === undefined).length
      const settled = node.members.filter((member) => member.outcome !== undefined).length
      const duration = progressDuration(progressNodeDuration(node, now))
      return [
        t('progress.branch.settledOf', { settled, declared: node.members.length }),
        ...(doingCount > 0 ? [t('progress.branch.running', { count: doingCount })] : []),
        ...(failedCount > 0 ? [t('progress.branch.failedCount', { count: failedCount })] : []),
        ...(duration === undefined ? [] : [duration]),
      ].join(' · ')
    }

    /**
     * The state ring: geometry from CSS, colour from the state table.
     * @param state - render state.
     * @returns the ring element.
     */
    function progressRing(state) {
      return h('span', {
        className: 'gw-progress-ring',
        style: { borderColor: PROGRESS_STATE_COLOR[state], color: PROGRESS_STATE_COLOR[state] },
        'aria-hidden': 'true',
      },
      h('span', { className: 'gw-progress-glyph', 'data-gw-progress-glyph': state }, PROGRESS_STATE_GLYPH[state] || ''))
    }

    /**
     * One spine segment.
     *
     * The segment is a static mark, not a button — clicking it does nothing, and it is not
     * in the tab order. The head carries the ring, the label and a failure red dot plus
     * badge when the segment has failures; the meta line carries the counts and the
     * measured time; the rail under it draws that time as length (B).
     * @param node - derived node model.
     * @param props - translator plus the rail's scale.
     * @returns the segment element.
     */
    function ProgressNode(node, props) {
      const t = (props === undefined || props.t === undefined) ? translator(FALLBACK_LOCALE) : props.t
      const now = props === undefined ? undefined : props.now
      const stateText = t(PROGRESS_STATE_KEY[node.state])
      const label = node.label === '' ? t('progress.unphased') : node.label
      // Rows that ran under this stage but render as their own task cards. Read once: the
      // tooltip and the meta line both report it instead of saying "not reported".
      const evidence = Array.isArray(node.evidence) ? node.evidence : []
      const tip = node.state === 'blocked' && node.reason !== undefined
        ? t(`progress.derived.${node.reason}`)
        : (node.phases.length > 0
          ? node.phases.join(' · ')
          : (node.kind === 'extra'
            ? t('progress.extraHint')
            : (evidence.length > 0 ? t('progress.evidenceHint') : t('progress.notReported'))))
      const failedCount = progressCurrentFailureCount(node.members)
      const meta = progressNodeMeta(node, t, now)
      const duration = progressNodeDuration(node, now)
      // The rail's baseline is the slowest stage of this run, so the lengths compare the
      // stages of one run with each other and claim nothing across runs.
      const scale = props === undefined || !(props.railScale > 0) ? undefined : props.railScale
      const railWidth = duration === undefined || scale === undefined ? undefined : Math.max(2, Math.round((duration / scale) * 100))
      return h('li', {
        key: node.key,
        className: 'gw-progress-seg',
        'data-gw-progress-node': true,
        'data-node-key': node.key,
        'data-kind': node.kind,
        'data-state': node.state,
        'data-derived': node.derived ? 'true' : undefined,
        title: tip,
        'aria-label': `${label} · ${stateText} · ${meta}`,
      },
      h('span', { className: 'gw-progress-seg-head' },
        progressRing(node.state),
        node.state === 'failed'
          ? h('span', { className: 'gw-progress-seg-dot', 'data-gw-progress-faildot': true, 'aria-hidden': 'true' })
          : null,
        h('span', { className: 'gw-progress-label', 'data-gw-progress-label': true, title: label }, label),
        failedCount > 0
          ? h('span', { className: 'gw-progress-badge', 'data-tone': 'red', 'data-gw-progress-failbadge': failedCount }, t('progress.branch.failedCount', { count: failedCount }))
          : null),
      // The meta line is ellipsized by CSS in a narrow column, so the full sentence needs
      // its own tooltip instead of being clipped with no way to read it.
      h('span', { className: 'gw-progress-meta', 'data-gw-progress-meta': true, title: meta }, meta),
      // The rail is geometry only: the same number is in the meta line above it, and a
      // screen reader has already been given that sentence.
      h('span', {
        className: 'gw-progress-dur',
        'data-gw-progress-dur': true,
        'data-state': node.state,
        'data-empty': railWidth === undefined ? 'true' : undefined,
        'aria-hidden': 'true',
      }, railWidth === undefined ? null : h('i', { style: { width: `${railWidth}%` } })))
    }

    /** The mini connector's tone: the capsule (or row) it points at, folded onto three tones. */
    const PROGRESS_MINI_TONE = { done: 'ok', failed: 'bad' }

    /** Copy key of one chain capsule's own name (`progress.chain.execute`). */
    const PROGRESS_CHAIN_LABEL_KEY = {
      execute: 'progress.chain.execute',
      check: 'progress.chain.check',
      review: 'progress.chain.review',
    }

    /**
     * The arrow between two capsules: the tone names the capsule it points at.
     * @param key - the capsule key (`check` / `review`) or `row:<seq>` for an unchained row.
     * @param state - the state of what it points at.
     * @returns the connector element.
     */
    function ProgressMini(key, state) {
      return h('span', {
        key: `mini:${key}`,
        className: 'gw-progress-mini',
        'data-gw-progress-mini': key,
        'data-tone': PROGRESS_MINI_TONE[state] || 'pending',
        'aria-hidden': 'true',
      })
    }

    /**
     * One pill in a task card: the row's own state ring plus its own label.
     *
     * A pill is a button exactly when the shell can open that child session — the same
     * `canOpen` rule the chat panel uses. Otherwise it is a plain span, so an unopenable
     * row cannot be clicked into the wrong session.
     * @param member - one folded row.
     * @param props - translator, the open gate, the open callback.
     * @param chainKey - the chain capsule this pill fills, when it fills one.
     * @returns the pill element.
     */
    function ProgressPill(member, props, chainKey) {
      const t = props.t
      const state = progressMemberState(member)
      const name = member.label === '' ? t('progress.unphased') : member.label
      const openable = member.childId !== '' && props.canOpen(member.childId)
      const label = openable
        ? `${t('progress.member.open')} · ${name}`
        : `${name} · ${t(PROGRESS_STATE_KEY[state])}`
      return h(openable ? 'button' : 'span', {
        key: `pill:${member.seq}`,
        className: 'gw-progress-pill',
        type: openable ? 'button' : undefined,
        'data-gw-progress-pill': member.seq,
        'data-gw-progress-chain': chainKey === undefined ? undefined : chainKey,
        'data-gw-progress-open': openable ? member.childId : undefined,
        'data-open': openable ? 'true' : undefined,
        'data-state': state,
        title: label,
        'aria-label': label,
        onClick: openable ? () => props.openChild(member.childId) : undefined,
      },
      progressRing(state),
      h('span', { className: 'gw-progress-pill-name' }, name))
    }

    /**
     * One capsule of a task card's fixed chain.
     *
     * A reached capsule is the row's own pill, so the click wiring is the one a reader
     * already has; an unreached one is a dashed `pending` capsule that names the step,
     * because "this task never reached the check" is the answer the chain exists for.
     * @param slot - one chain slot of the card.
     * @param props - translator plus the pill wiring.
     * @returns the capsule: one pill, several pills on a retry, or the dashed placeholder.
     */
    function ProgressChainCapsule(slot, props) {
      if (slot.reached) return slot.members.map((member) => ProgressPill(member, props, slot.key))
      const t = props.t
      const label = t(PROGRESS_CHAIN_LABEL_KEY[slot.key])
      const tip = `${label} · ${t(PROGRESS_STATE_KEY.pending)} · ${t('progress.chain.pendingHint')}`
      return h('span', {
        key: `chain:${slot.key}`,
        className: 'gw-progress-pill',
        'data-gw-progress-chain': slot.key,
        'data-pending': 'true',
        'data-state': 'pending',
        title: tip,
        'aria-label': tip,
      },
      progressRing('pending'),
      h('span', { className: 'gw-progress-pill-name' }, label))
    }

    /**
     * One card in the task band: a plan task, or a stage that carries rows of its own.
     *
     * The card is inert (Q2): a click anywhere on it, including its blank area, does
     * nothing. The only actions are the pills. `data-owner` names the spine segment the
     * card hangs from, which is what the wires are drawn against — a plan task belongs to
     * `执行`, the slot the engine announces it in.
     *
     * A plan-task card shows the fixed `执行 → 检查 → 复核` chain (Q11): three capsules,
     * the unreached ones dashed, and after them any row whose role names no capsule, so no
     * declared row is hidden. The guardian card is not a plan task: it keeps its own pills
     * and the band's own left edge, while every plan-task card steps in by
     * `PROGRESS_CARD_INDENT`.
     * @param node - derived node model.
     * @param props - translator plus the pill wiring.
     * @returns the card element.
     */
    function ProgressTaskCard(node, props) {
      const t = props.t
      const now = props.now
      // Q10(b): the card carries the task name and its time only. The `1/3` counter
      // moved a reader's eye away from the name and answered a question nobody asked
      // ("how many attempts?"), while the attempts a failure spent stay visible on the
      // row's own pills.
      const duration = progressDuration(progressNodeDuration(node, now))
      const meta = duration === undefined ? '' : duration
      const name = node.label === '' ? t('progress.unphased') : node.label
      const chain = Array.isArray(node.chain) ? node.chain : []
      const subs = []
      if (chain.length > 0) {
        const chained = []
        chain.forEach((slot) => { slot.members.forEach((member) => { chained.push(member.seq) }) })
        chain.forEach((slot, index) => {
          if (index > 0) subs.push(ProgressMini(slot.key, slot.state))
          const capsule = ProgressChainCapsule(slot, props)
          if (Array.isArray(capsule)) subs.push(...capsule)
          else subs.push(capsule)
        })
        // A row whose label names no capsule is still a declared row: it follows the chain
        // instead of being dropped from the card.
        node.members.forEach((member) => {
          if (chained.indexOf(member.seq) !== -1) return
          subs.push(ProgressMini(`row:${member.seq}`, progressMemberState(member)))
          subs.push(ProgressPill(member, props))
        })
      } else {
        node.members.forEach((member, index) => {
          if (index > 0) subs.push(ProgressMini(`row:${member.seq}`, progressMemberState(member)))
          subs.push(ProgressPill(member, props))
        })
      }
      const indented = node.kind === 'extra' && node.guardian !== true
      return h('li', { key: node.key },
        h('div', {
          className: 'gw-progress-task',
          'data-gw-progress-task': node.key,
          'data-key': node.key,
          'data-kind': node.kind,
          'data-state': node.state,
          'data-owner': `stage:${node.kind === 'extra' ? 'execute' : node.key.slice('stage:'.length)}`,
          'data-indent': indented ? 'true' : undefined,
        },
        progressRing(node.state),
        h('span', { className: 'gw-progress-task-name', 'data-gw-progress-task-name': true }, name),
        meta === '' ? null : h('span', { className: 'gw-progress-task-meta', 'data-gw-progress-task-meta': true }, meta),
        h('span', { className: 'gw-progress-subs' }, subs)))
    }

    /** No wires and no lane depth: what a host without layout gets. */
    const EMPTY_PROGRESS_WIRES = { width: 0, height: 0, depth: 0, paths: [] }

    /**
     * Whether two measured wire sets are the same, so a re-measure does not re-render.
     * @param left - current set.
     * @param right - freshly measured set.
     * @returns whether every vertex and the lane depth match.
     */
    function sameProgressWires(left, right) {
      if (left === right) return true
      if (left.width !== right.width || left.height !== right.height || left.depth !== right.depth) return false
      if (left.paths.length !== right.paths.length) return false
      for (let index = 0; index < left.paths.length; index += 1) {
        const a = left.paths[index]
        const b = right.paths[index]
        if (a.kind !== b.kind || a.owner !== b.owner || a.card !== b.card) return false
        if (a.points.length !== b.points.length) return false
        for (let at = 0; at < a.points.length; at += 1) {
          if (a.points[at][0] !== b.points[at][0] || a.points[at][1] !== b.points[at][1]) return false
        }
      }
      return true
    }

    /**
     * Measure the elbow and stub geometry from the laid-out DOM.
     *
     * Only the owner's ring centre has to be read: it is a flex result, not a number anyone
     * can derive, so it is measured after layout — the same thing the mockup does. Every
     * other coordinate is either a constant of the left gutter or the card's own rect.
     *
     * One group is one unwind: down from the ring, one lane leftwards under the spine, then
     * down the group's own channel in the gutter. A card's stub is the last step — a short
     * arrow into its left edge — so the group's line is readable without indenting the card.
     *
     * A host without layout (a stub renderer, a zero-width column) yields no paths: the band
     * then renders as a plain list instead of as a graph with invented coordinates.
     * @param flow - the `.gw-progress-flow` element, when there is one.
     * @returns the measured wire set.
     */
    function measureProgressWires(flow) {
      if (flow === null || flow === undefined) return EMPTY_PROGRESS_WIRES
      if (typeof flow.querySelectorAll !== 'function' || typeof flow.querySelector !== 'function') return EMPTY_PROGRESS_WIRES
      if (typeof flow.getBoundingClientRect !== 'function') return EMPTY_PROGRESS_WIRES
      const frame = flow.getBoundingClientRect()
      if (!(frame.width > 1) || !(frame.height > 1)) return EMPTY_PROGRESS_WIRES
      const track = flow.querySelector('[data-gw-progress-track]')
      if (track === null || track === undefined || typeof track.getBoundingClientRect !== 'function') return EMPTY_PROGRESS_WIRES
      const cards = Array.from(flow.querySelectorAll('[data-gw-progress-task]'))
      if (cards.length === 0) return EMPTY_PROGRESS_WIRES
      const groups = new Map()
      for (const card of cards) {
        const owner = card.getAttribute('data-owner')
        if (owner === null) continue
        const list = groups.get(owner)
        if (list === undefined) groups.set(owner, [card])
        else list.push(card)
      }
      const trackBottom = Math.round(track.getBoundingClientRect().bottom - frame.top)
      const paths = []
      let depth = 0
      // One lane and one channel for the whole band: the rail every owner unwinds onto.
      const laneY = trackBottom + PROGRESS_WIRE_LANE_GAP
      const channel = PROGRESS_WIRE_CHANNEL_X
      let railEnd = laneY
      for (const [owner, members] of groups) {
        const segment = flow.querySelector(`.gw-progress-track [data-node-key="${owner}"]`)
        const anchor = segment === null || segment === undefined || typeof segment.querySelector !== 'function'
          ? null
          : segment.querySelector('.gw-progress-ring')
        // Without a measured ring there is no origin for the line: a stub alone would pin an
        // arrow on a card to an owner the reader cannot see.
        if (anchor === null || typeof anchor.getBoundingClientRect !== 'function') continue
        const ring = anchor.getBoundingClientRect()
        const x = Math.round(ring.left - frame.left + ring.width / 2)
        const stubs = []
        let last = laneY
        for (const card of members) {
          const rect = card.getBoundingClientRect()
          const y = Math.round(rect.top - frame.top + rect.height / 2)
          if (y > last) last = y
          stubs.push({
            kind: 'branch',
            owner,
            card: card.getAttribute('data-gw-progress-task'),
            // The stub ends on the card's own left edge, so the arrow lands on the border
            // however the card's padding and border weight are styled.
            points: [[channel, y], [Math.round(rect.left - frame.left), y]],
          })
        }
        // The owner's own drop ends on the shared rail: from its ring down through the one
        // lane, then left into the same channel every other owner uses.
        paths.push({
          kind: 'trunk',
          owner,
          card: undefined,
          points: [[x, trackBottom], [x, laneY], [channel, laneY]],
        })
        paths.push(...stubs)
        // The rail runs once, from the lane down to the deepest card any owner hangs.
        if (last > railEnd) railEnd = last
        // The band's top margin has to clear the one lane, or the elbow would run across
        // the first card; the gutter itself never moves, so the cards keep their left edge.
        depth = Math.max(depth, laneY - trackBottom + PROGRESS_WIRE_LANE_CLEARANCE - PROGRESS_WIRE_BAND_GAP)
      }
      // One rail for every owner: the request was fewer cross-stage lines, and this is the
      // one line they all share instead of one run per group.
      if (railEnd > laneY) {
        paths.push({
          kind: 'rail',
          owner: 'rail',
          card: undefined,
          points: [[channel, laneY], [channel, railEnd]],
        })
      }
      return {
        width: Math.round(frame.width),
        height: Math.round(frame.height),
        depth: Math.max(0, depth),
        paths,
      }
    }

    /**
     * The settle bar's parts: the declared rows grouped by outcome (D).
     *
     * Five tones, and every one of them is a count over rows the stream declared — no
     * share is estimated. `open` is the unsettled rest, drawn as a dashed gap because a
     * colour there would read as a result. `retried` is a row that failed and was then
     * replaced by a completed attempt of the same call: it is settled, it is not red, and
     * calling it done would be a lie about the attempt that failed.
     * @param members - the run's rows.
     * @param t - translator.
     * @returns the parts, in the order they are drawn.
     */
    function progressSettleParts(members, t) {
      const declared = Array.isArray(members) ? members.length : 0
      if (declared === 0) return []
      const recovered = progressRecoveredFailures(members)
      const count = (predicate) => members.filter(predicate).length
      const candidates = [
        { tone: 'ok', count: count((member) => member.outcome === 'completed') },
        { tone: 'bad', count: count((member) => member.outcome === 'failed' && !recovered.has(member.seq)) },
        { tone: 'retried', count: count((member) => member.outcome === 'failed' && recovered.has(member.seq)) },
        {
          tone: 'warn',
          count: count((member) => {
            const state = progressMemberState(member)
            return state === 'cancelled' || state === 'blocked'
          }),
        },
        { tone: 'open', count: count((member) => member.outcome === undefined) },
      ]
      return candidates
        .filter((part) => part.count > 0)
        .map((part) => ({
          tone: part.tone,
          count: part.count,
          label: t(`progress.settle.${part.tone}`, { count: part.count }),
          width: Math.round((part.count / declared) * 1000) / 10,
        }))
    }

    /**
     * One measured wire as an SVG path.
     *
     * Every vertex is written out — `V`/`H` would be shorter, but the measurement is the
     * only thing that knows which axis a leg belongs to, so the path states both numbers.
     * @param points - measured vertices, already rounded to whole pixels.
     * @returns the `d` attribute.
     */
    function progressWireDraw(points) {
      return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0]} ${point[1]}`).join(' ')
    }

    /**
     * The arrow that lands on a card's left edge and points into the card.
     * @param points - the stub's measured vertices; the last one is the card edge.
     * @returns the polygon's point list.
     */
    function progressWireHead(points) {
      const tip = points[points.length - 1]
      return `${tip[0]},${tip[1]} ${tip[0] - 8},${tip[1] - 4.5} ${tip[0] - 8},${tip[1] + 4.5}`
    }

    /**
     * The "进度" view.
     *
     * Two tracks over one model, which is what the mockup shows:
     *
     * - **the spine** — the six fixed stages of the process template, in one horizontal
     *   row, with the connector between each pair and the measured-time rail under each;
     * - **the task band** — one card per group of rows, below the spine, in one fixed left
     *   gutter. Each owner group unwinds from its stage's ring into its own channel in that
     *   gutter, and every card takes a short arrow off the channel into its left edge, so
     *   the line says who owns the card instead of the card's indentation saying it.
     *
     * A stage is a static mark and a card is inert: clicking either does nothing. The only
     * action is a row's pill, rendered exactly when the shell can open that child session,
     * which jumps straight to it. There is no detail card, no how-to-read paragraph, no
     * jump-to-failure control and no retry affordance (deferred to Phase 2).
     * @param props - slot props.
     * @returns the tab element.
     */
    /**
     * The Guardian side lane reports liveness interventions only. It does not
     * infer task quality or retry state from a timeout/rescue finding.
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
      return h('aside', {
        className: 'gw-progress-guardian',
        'data-gw-progress-guardian': true,
        'data-state': state,
        'aria-label': t('progress.guardian.title'),
      },
      h('div', { className: 'gw-progress-guardian-head' },
        h('strong', { className: 'gw-progress-guardian-title' }, t('progress.guardian.title')),
        h('span', { className: 'gw-progress-guardian-status', role: 'status' }, t(statusKey))),
      h('div', { className: 'gw-progress-guardian-meta' },
        h('span', null, t('progress.guardian.budget', { seconds })),
        h('span', null, t('progress.guardian.count', { count: findings.length }))),
      findings.length === 0
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
          })))
    }

    function ProgressView(props) {
      const t = guardedTranslator(props.t, typeof props.progressT === 'function' ? props.progressT : translator(FALLBACK_LOCALE))
      const snapshot = props.useGrokProgress === undefined ? EMPTY_PROGRESS_SNAPSHOT : props.useGrokProgress((value) => value)
      const track = useMemo(
        () => deriveProgressTrack(snapshot === undefined ? undefined : snapshot.activeRun, (key) => t(`progress.stage.${key}`)),
        [snapshot, props.t, props.progressT],
      )
      const flowRef = useRef(null)
      const [wires, setWires] = useState(EMPTY_PROGRESS_WIRES)
      const nodes = track === undefined ? [] : track.nodes
      // The spine is the template, never the plan: a `任务 n · …` row group is a card in the
      // band below, so the six fixed stages keep one row of their own however many tasks
      // the plan declares.
      const spine = nodes.filter((node) => node.kind !== 'extra')
      const cards = nodes.filter((node) => node.kind !== 'edge' && node.members.length > 0)
      const railScale = spine.reduce((max, node) => {
        const duration = progressNodeDuration(node)
        return duration === undefined ? max : Math.max(max, duration)
      }, 0)
      const settleParts = snapshot === undefined || snapshot.activeRun === undefined || track === undefined
        ? []
        : progressSettleParts(snapshot.activeRun.members, t)
      const guardianPanel = snapshot === undefined || snapshot.activeRun === undefined
        ? null
        : ProgressGuardianPanel(snapshot.activeRun.guardian, t)
      // Q10(b): a running row's time has to move. One 1 s interval, armed only while
      // some row is unsettled and cleared when none is, so an idle panel owns no timer;
      // a reader who asked for reduced motion gets the static measured value instead.
      const running = nodes.some((node) => node.members.some((member) => member.outcome === undefined))
      const [clock, setClock] = useState(() => Date.now())
      useEffect(() => {
        if (!running) return undefined
        const view = globalThis
        if (typeof view.setInterval !== 'function') return undefined
        if (typeof view.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches === true) return undefined
        const timer = view.setInterval(() => setClock(Date.now()), 1000)
        return () => { if (typeof view.clearInterval === 'function') view.clearInterval(timer) }
      }, [running])
      const canOpen = typeof props.canOpen === 'function' ? props.canOpen : () => false
      const openChild = (childId) => { if (typeof props.openChild === 'function') props.openChild(childId) }
      // One draw per render, plus the two things that move the spine under the cards: a host
      // resize, and a container resize (a sidebar toggle does not resize the window).
      useEffect(() => {
        const host = flowRef === null || flowRef === undefined ? undefined : flowRef.current
        const draw = () => {
          const next = measureProgressWires(host)
          setWires((current) => (sameProgressWires(current, next) ? current : next))
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
      const header = h('div', { className: 'gw-progress-head' },
        h('h3', { className: 'gw-progress-title' }, t('progress.title')),
        // A live region: the number changes while a run works, and a reader who is not
        // watching the track should hear that it moved. `polite` so it never interrupts.
        track === undefined || track.percent === undefined
          ? h('span', { className: 'gw-progress-percent', 'data-progress-percent': 'none', role: 'status', 'aria-live': 'polite' }, t('progress.unsettled'))
          : h('span', {
            className: 'gw-progress-percent',
            'data-progress-percent': track.percent.value,
            role: 'status',
            'aria-live': 'polite',
            title: t('progress.percentHint', { settled: track.percent.settled, declared: track.percent.declared }),
          }, t('progress.percent', { settled: track.percent.settled, declared: track.percent.declared, percent: track.percent.value })))
      // The bar is always present once there is a run: an empty bar with "no settled row
      // yet" is the honest reading of a run that declared nothing, and hiding it would
      // let the header's number float without the bar it belongs to.
      const settle = h('div', {
        key: 'settle',
        className: 'gw-progress-settle',
        'data-gw-progress-settle': true,
        'data-empty': settleParts.length === 0 ? 'true' : undefined,
        'aria-label': t('progress.settle.aria'),
      },
      h('span', { className: 'gw-progress-settle-bar', 'data-gw-progress-settle-bar': true, 'aria-hidden': 'true' },
        settleParts.map((part) => h('i', {
          key: `settle:${part.tone}`,
          className: 'gw-progress-settle-part',
          'data-tone': part.tone,
          'data-gw-progress-settle-part': part.count,
          style: { width: `${part.width}%` },
        }))),
      h('span', { className: 'gw-progress-settle-legend', 'data-gw-progress-settle-legend': true },
        settleParts.length === 0
          ? t('progress.settle.unsettled')
          : settleParts.map((part) => part.label).join(' · ')))
      // Segments and the connectors between them, in render order. The connector after a
      // segment fills when that segment is `done` and flows when the next one is running.
      const trackChildren = []
      spine.forEach((node, index) => {
        trackChildren.push(ProgressNode(node, { t, railScale, now: running ? clock : undefined }))
        if (index < spine.length - 1) {
          trackChildren.push(h('span', {
            key: `link:${index}`,
            className: 'gw-progress-link',
            'data-gw-progress-link': true,
            'data-filled': node.state === 'done' ? 'true' : undefined,
            'data-flowing': spine[index + 1].state === 'doing' ? 'true' : undefined,
            'aria-hidden': 'true',
          }))
        }
      })
      const band = cards.length === 0
        ? null
        : h('ul', {
          key: 'tasks',
          className: 'gw-progress-tasks',
          'data-gw-progress-tasks': true,
          'aria-label': t('progress.tasks.aria'),
        }, cards.map((node) => ProgressTaskCard(node, { t, canOpen, openChild, now: running ? clock : undefined })))
      // The wires are structure, not status: they say which segment owns which card and
      // carry no state colour at all. A line dyed red would implicate every card it
      // points at (a recovered task, a task still waiting), so status stays on the card's
      // own ring and pills, where it belongs to one row.
      const svg = wires.paths.length === 0
        ? null
        : h('svg', {
          key: 'wires',
          className: 'gw-progress-wires',
          'data-gw-progress-wires': true,
          'aria-hidden': 'true',
          viewBox: `0 0 ${wires.width} ${wires.height}`,
        }, wires.paths.map((path) => (path.kind === 'trunk'
          ? h('path', {
            key: `trunk:${path.owner}`,
            className: 'gw-progress-wire',
            'data-gw-progress-wire': 'trunk',
            'data-owner': path.owner,
            d: progressWireDraw(path.points),
          })
          : path.kind === 'rail'
            ? h('path', {
              key: 'rail',
              className: 'gw-progress-wire',
              'data-gw-progress-wire': 'rail',
              d: progressWireDraw(path.points),
            })
            : h('g', { key: `branch:${path.owner}:${path.card}`, 'data-gw-progress-wire-branch': path.card },
              h('path', {
                className: 'gw-progress-wire',
                'data-gw-progress-wire': 'branch',
                'data-owner': path.owner,
                'data-card': path.card,
                d: progressWireDraw(path.points),
              }),
              h('polygon', {
                className: 'gw-progress-wire-head',
                points: progressWireHead(path.points),
              })))))
      return h('section', {
        className: 'gw-progress',
        'data-gw-progress': true,

      },
      // Scoped stylesheet, rendered in the tab's own tree: React removes it when the tab
      // unmounts, and every rule is scoped to `.gw-progress`, so nothing leaks either way.
      h('style', { 'data-gw-progress-css': true }, PROGRESS_CSS),
      header,
      track === undefined
        ? h('div', { className: 'gw-progress-empty', 'data-progress-empty': true },
          h('strong', null, t('progress.empty.title')),
          h('p', { style: { margin: '4px 0 0' } }, t('progress.empty.body')))
        : [
          h('div', { className: 'gw-progress-overview', 'data-gw-progress-overview': true }, settle, guardianPanel),
          h('div', {
            key: 'flow',
            className: 'gw-progress-flow',
            'data-gw-progress-flow': true,
            ref: flowRef,
            style: { '--gw-wire-depth': `${wires.depth}px` },
          },
          h('ul', {
            className: 'gw-progress-track',
            role: 'group',
            'aria-label': t('progress.aria'),
            'data-gw-progress-track': true,
          }, trackChildren),
          band,
          svg),
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
     * state — for a session with no record yet that is the deployment's `grokDefault`,
     * which the route answers with, so the UI never asserts a default of its own.
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

    /** The one line under the workflow switch, for one state, in one language. */
    function modeSwitchText(t, state) {
      if (state.phase === 'reading') return t('mode.switch.reading')
      if (state.phase === 'busy') return t('mode.switch.busy')
      if (state.phase === 'no-session') return t('mode.switch.noSession')
      if (state.phase === 'failed') return modeFailureText(t, state.error)
      return state.mode !== undefined && state.mode.enabled === true ? t('mode.switch.on') : t('mode.switch.off')
    }

    /** One failure in the switch's words: the Host's own message is already redacted. */
    function modeFailureText(t, error) {
      return t('mode.switch.failed', { message: error === undefined ? '?' : String(error) })
    }

    /**
     * The workflow switch itself: one button and one state line.
     *
     * It reads once on mount and never polls — the toggle is a fact the session owns, and
     * a composer that re-read it on a timer would be work nobody asked for. A click is
     * refused while the state is unknown or the write is in flight: flipping what it has
     * not read would be guessing at a gate. After a failed read the click retries the
     * read rather than writing blind.
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
      const flip = () => {
        if (sessionId === undefined || state.phase === 'busy' || state.phase === 'reading') return
        // Nothing was read, so nothing may be written: retry the read instead.
        if (state.phase === 'failed') {
          setState((current) => ({ ...current, phase: 'reading' }))
          readNow()
          return
        }
        const next = !(state.mode !== undefined && state.mode.enabled === true)
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
      const known = state.mode !== undefined
      const enabledNow = known && state.mode.enabled === true
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
     * Register the settings entry for one namespace.
     *
     * The plugin manager renders each `plugins.item` registration twice (card and
     * detail page), so this is the only registration the bundle needs. It is bound
     * to `ns` — the namespace that actually projects this plugin's fields, which is
     * normally the shipped id and otherwise the renamed Loader row.
     *
     * `locale: NS` is added only when the composition really installs a locale face:
     * the renderer throws a `SlotAssemblyError` for an entry that declares a namespace
     * while no face is installed, and a page in the wrong language beats no page.
     * @param ctx - the browser plugin context.
     * @param face - the settings mirror.
     * @param ns - namespace to bind the page to.
     * @param i18n - live locale binding: `locale` is the service when present, `t` the
     *   translator the card label and the page fallback resolve through.
     * @returns a disposer for the registration.
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
      if (i18n.locale !== undefined) options.locale = NS
      return ctx.slots.inject('plugins.item', () => ctx.slots.register(options, GrokWorkflowPage))
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
          startProgress()
          return () => {
            if (typeof stopProgress === 'function') stopProgress()
            stopProgress = undefined
            progressServices = undefined
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
    exports.GROK_WORKFLOW_CHAIN_LIMIT = CHAIN_LIMIT
    exports.GROK_WORKFLOW_ROUTE_INFLIGHT_MIN = ROUTE_INFLIGHT_MIN
    exports.GROK_WORKFLOW_ROUTE_INFLIGHT_MAX = ROUTE_INFLIGHT_MAX
    /** Internals pinned by test/client.spec.ts (no runtime caller). */
    exports.GROK_WORKFLOW_INTERNALS = {
      validate, formatError, fieldLabel, opsFor, draftOf, resolveNamespace, translate, translator, activeLocale,
      comboWarn, emptyCapWarn, limitOverrunWarn, EnumField, ROLE_ORDER, UpdateCard,
      PLUGIN_VERSION, UPDATE_LATEST, UPDATE_COMMAND,
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
      stages: PROGRESS_STAGES,
      detailFields: PROGRESS_DETAIL_FIELDS,
      stateColor: PROGRESS_STATE_COLOR,
      stateKey: PROGRESS_STATE_KEY,
      stateGlyph: PROGRESS_STATE_GLYPH,
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
      detailFor: progressDetailFor,
      detailSources: progressDetailSources,
      detailField: progressDetailField,
      parseCoordination: parseProgressCoordination,
      duration: progressDuration,
      memberState: progressMemberState,
      nodeDuration: progressNodeDuration,
      settleParts: progressSettleParts,
      measureWires: measureProgressWires,
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
