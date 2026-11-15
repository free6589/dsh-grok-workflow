// Browser half of dsh-grok-workflow: the Settings → Plugins → "Grok workflow" page.
//
// Why this file exists at all (measured, t32): the Host serves this plugin's
// namespace (`settings/describe` → ns "grok-workflow", autoGenerate: true, 17 volatile
// fields) but the stock web client renders *no* page for a namespace on its own. Every
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
    const { useState, useEffect, useMemo, useSyncExternalStore } = React

    const NS = 'grok-workflow'

    // The Host projects only the volatile fields into its settings form, so these four
    // structural keys are shown read-only: they decide whether the plugin and the gate
    // exist at all, and are edited in the profile patch, not in a live form.
    const READ_ONLY = ['toolName', 'enforceGate', 'gateRequired', 'configVersion']

    const FIELDS = [
      { key: 'gateScope', group: 'gate', kind: 'enum', options: ['process', 'preset'], def: 'process' },
      { key: 'gatePreset', group: 'gate', kind: 'text', def: '' },
      // Front desk (t52): `full` restores the pre-t52 rule that every message runs
      // the team; `triage` routes each message and states the tier in the answer.
      { key: 'mode', group: 'gate', kind: 'enum', options: ['triage', 'full'], def: 'triage' },
      // Per-session grok-mode toggle (src/mode.ts): `off` means normal chat until
      // the session turns grok mode on; the session toggle overrides this default.
      { key: 'grokDefault', group: 'gate', kind: 'enum', options: ['off', 'on'], def: 'off' },
      { key: 'triageAsk', group: 'gate', kind: 'boolean', def: true },
      { key: 'triageModel', group: 'gate', kind: 'text', def: '' },
      { key: 'triageClassifier', group: 'gate', kind: 'enum', options: ['rules', 'hybrid'], def: 'rules' },
      { key: 'triageFollowupAsFast', group: 'gate', kind: 'boolean', def: true },
      { key: 'instantReceipt', group: 'gate', kind: 'boolean', def: true },
      { key: 'humanSummary', group: 'output', kind: 'boolean', def: true },
      { key: 'showDiagnostics', group: 'output', kind: 'boolean', def: false },
      { key: 'answerStrategy', group: 'gate', kind: 'enum', options: ['in-turn', 'relay', 'append'], def: 'in-turn' },
      { key: 'historyTurns', group: 'limits', kind: 'number', min: 0, max: 1000000, def: 12 },
      { key: 'historyChars', group: 'limits', kind: 'number', min: 0, max: 1000000, def: 20000 },
      { key: 'maxQueuedMessages', group: 'limits', kind: 'number', min: 0, max: 8, def: 4 },
      // The two documented engine-hook limits: the Host's schema clamps anything above
      // HARD_LIMITS.maxConcurrency / maxRetries (6 / 3) and says so in its log (B07), so
      // the page must not advertise a wider range than it accepts — and must still block
      // a save above it rather than rely on the clamp. test/client.spec.ts pins both
      // bounds against `src/config.ts`, which is how this page was caught still offering
      // 1000000.
      { key: 'maxConcurrency', group: 'limits', kind: 'number', min: 1, max: 6, def: 3 },
      { key: 'maxRetries', group: 'limits', kind: 'number', min: 0, max: 3, def: 1 },
      { key: 'maxTasks', group: 'limits', kind: 'number', min: 1, max: 100, def: 12 },
      { key: 'timeoutMs', group: 'limits', kind: 'number', min: 1000, max: 604800000, def: 3600000 },
      { key: 'maxActiveRuns', group: 'limits', kind: 'number', min: 1, max: 4, def: 2 },
      { key: 'maxActiveRunsTotal', group: 'limits', kind: 'number', min: 1, max: 16, def: 8 },
      { key: 'subagentProvider', group: 'limits', kind: 'text', def: '' },
      { key: 'synthesis', group: 'output', kind: 'enum', options: ['deterministic', 'model'], def: 'deterministic' },
      { key: 'switchOn', group: 'output', kind: 'classes', def: [] },
      { key: 'recordRuns', group: 'output', kind: 'boolean', def: true },
      { key: 'showProgress', group: 'output', kind: 'boolean', def: true },
      { key: 'recordLimit', group: 'output', kind: 'number', min: 0, max: 256, def: 64 },
    ]

    // Mirrors SWITCHABLE_CLASSES in src/config.ts; test/client.spec.ts pins the parity.
    const SWITCHABLE_CLASSES = [
      'rate-limit', 'server-error', 'connection', 'timeout',
      'model-unavailable', 'format-error', 'agent-start-failed',
    ]
    const ROLES = ['planner', 'worker', 'verifier', 'synthesizer']

    const CHAIN_LIMIT = 50
    const ROUTE_FIELD_LIMIT = 120
    // Per-route in-flight ceiling: blank means unlimited. Mirrors
    // HARD_LIMITS.routeInFlight in src/config.ts; test/client.spec.ts pins the parity.
    const ROUTE_INFLIGHT_MIN = 1
    const ROUTE_INFLIGHT_MAX = 64

    const GROUPS = ['gate', 'limits', 'roles', 'output', 'structural']
    const GROUPS_WITH_FIELDS = ['gate', 'limits', 'output']

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
      'card.summary': 'A task-splitting tool: the entry gate, per-role model chains, concurrency limits and run records.',

      'page.intro': 'A tool that breaks tasks down.',

      // Live one-line status under the intro, derived from the current draft.
      'status.off': 'OFF — plain chat',
      'status.off.detail': 'Answered directly. Send /grok for one serious run.',
      'status.triage': 'ON — smart triage',
      'status.triage.detail': 'Easy messages answered directly, hard ones get the team.',
      'status.full': 'ON — full team',
      'status.full.detail': 'The whole team runs every message: thorough, but slow.',

      'group.gate': 'Mode',
      'group.limits': 'Limits',
      'group.roles': 'Who does it',
      'group.output': 'More',
      'group.structural': 'Status',

      // Novice section titles (v6 three-part layout).
      'novice.mode.title': 'Mode',
      'novice.roles.title': 'Who does it',
      'novice.roles.hint': 'Pick the provider first, then the model. Leaving it blank is easiest: that role uses the model you are already talking to.',
      'novice.roles.warn': 'wb is only the start of a model name, never a provider. The provider is the channel name, e.g. bifrost-completions.',
      'novice.limits.title': 'Limits',
      'novice.limits.hint': 'Raise the numbers for long jobs. Bigger means slower and pricier — your call.',
      'novice.limits.relaxed': 'Relaxed for long jobs',
      'advanced.title': 'More',
      'advanced.default': 'Defaults are fine',
      'danger.title': 'Advanced — leave alone',
      'danger.hint': 'Touching these changes what the plugin is, not how hard it works. Wrong values stop the plugin loading.',
      'structural.hint': 'These keys are not part of the live form; change them in the profile patch and restart.',

      'field.gateScope': 'Gate scope',
      'field.gateScope.hint': 'Leave it alone; the shipped process gate is what you want.',
      'field.gatePreset': 'Gate preset name',
      'field.gatePreset.hint': 'Only needed when the scope is a named preset.',
      'field.mode': 'How to dispatch when serious',
      'field.mode.hint': 'Smart triage is recommended: easy messages answered directly, hard ones get the team. Full team runs everything, thorough but slow.',
      'field.mode.ifFull': 'Full team runs every message — thorough, but slow and pricey.',
      'field.grokDefault': 'Work hard by default',
      'field.grokDefault.hint': 'Off: plain chat until you send /grok in that session. On: every message runs the workflow. The in-session switch wins.',
      'field.grokDefault.ifOff': 'Off means: plain chat until you opt in.',
      'field.grokDefault.ifOn': 'On means: every message runs the team.',
      'field.triageAsk': 'Ask me when unsure',
      'field.triageAsk.hint': 'On: one question instead of a guess. Off: unsure messages go to the team.',
      'field.triageModel': 'Which model triages',
      'field.triageModel.hint': 'Blank = follow this run, no separate model. That is the easiest and cheapest.',
      'field.triageModel.follow': 'Follow this run',
      'field.triageClassifier': 'Front-desk classifier',
      'field.triageClassifier.hint': 'Rules: instant string rules. Hybrid: one model call only for unclear cases.',
      'option.triageClassifier.rules': 'Rules (default)',
      'option.triageClassifier.hybrid': 'Hybrid (model fallback)',
      'field.triageFollowupAsFast': 'Follow-ups go fast',
      'field.triageFollowupAsFast.hint': 'On: "continue / say it plainly" with history goes to one worker, never the greeting template.',
      'field.instantReceipt': 'Instant receipt',
      'field.instantReceipt.hint': 'On: the team tier posts its tier line immediately so the run never looks blank.',
      'field.humanSummary': 'Plain-language summary',
      'field.humanSummary.hint': 'On: prepend 3-5 plain sentences before the machine report.',
      'field.showDiagnostics': 'Machine diagnostics',
      'field.showDiagnostics.hint': 'Off: hide model routes, deadline, switches, overflows and errors. Uncertainties always stay.',
      'field.answerStrategy': 'Answer strategy',
      'field.answerStrategy.hint': 'How the workflow hands its report back. Keep the default unless you know why.',
      'field.historyTurns': 'History kept (turns)',
      'field.historyTurns.hint': 'How many past turns travel with each run. More costs more.',
      'field.historyChars': 'History kept (chars)',
      'field.historyChars.hint': 'How many past characters travel with each run. More costs more.',
      'field.maxQueuedMessages': 'Queued messages',
      'field.maxQueuedMessages.hint': 'How many messages may wait while a run is busy.',
      'field.maxConcurrency': 'Jobs at once',
      'field.maxConcurrency.hint': 'How many tasks run in parallel. Bigger is faster but pricier.',
      'field.maxRetries': 'Retries per failure',
      'field.maxRetries.hint': 'How many times one task retries after a failure before giving up.',
      'field.maxTasks': 'Tasks per job',
      'field.maxTasks.hint': 'How many pieces one message is split into at most.',
      'field.timeoutMs': 'Max run time',
      'field.timeoutMs.hint': 'One run runs at most this long, then stops and tells you. Default 60 minutes.',
      'field.maxActiveRuns': 'Active runs per session',
      'field.maxActiveRuns.hint': 'How many runs one chat session may hold at once.',
      'field.maxActiveRunsTotal': 'Active runs everywhere',
      'field.maxActiveRunsTotal.hint': 'How many runs all sessions may hold at once.',
      'field.subagentProvider': 'Subagent channel',
      'field.subagentProvider.hint': 'Leave blank. Only set when an operator tells you a channel name.',
      'field.synthesis': 'Summary style',
      'field.synthesis.hint': 'Rule-assembled is predictable and free; model-rewritten reads smoother but spends a call.',
      'field.switchOn': 'Switch runner on',
      'field.switchOn.hint': 'All checked = the default rule: switch only when the road is broken (limits, crashes, timeouts). Content failures never switch, they retry in place.',
      'field.recordRuns': 'Watch the build',
      'field.recordRuns.hint': 'Show the task-grouped progress panel while a run is going.',
      'field.showProgress': 'Keep records',
      'field.showProgress.hint': 'Write each run into the session record.',
      'field.recordLimit': 'Records kept',
      'field.recordLimit.hint': 'How many past run records are kept.',
      'field.range': '{min} – {max}, default {def}',

      // Unit suffixes rendered after number inputs (paired keys, zh/en).
      'unit.ms': 'ms',
      'unit.retries': 'retries',
      'unit.jobs': 'jobs',
      'unit.tasks': 'tasks',
      'unit.turns': 'turns',
      'unit.chars': 'chars',
      'unit.queued': 'queued',
      'unit.runs': 'runs',
      'unit.runsTotal': 'runs',
      'unit.records': 'records',

      // Enum option display names (stored values stay English).
      'option.gateScope.process': 'Whole process (default)',
      'option.gateScope.preset': 'Named preset',
      'option.mode.triage': 'Smart triage (recommended)',
      'option.mode.full': 'Full team',
      'option.grokDefault.off': 'Off',
      'option.grokDefault.on': 'On',
      'option.answerStrategy.in-turn': 'Answer directly (default)',
      'option.answerStrategy.relay': 'Hand over then answer',
      'option.answerStrategy.append': 'Append then answer',
      'option.synthesis.deterministic': 'Assemble by rule (default)',
      'option.synthesis.model': 'Rewrite with model',

      // Switch-class checkbox labels (stored values stay English).
      'switch.rate-limit': 'Rate limited (429)',
      'switch.server-error': 'Their server errored (500)',
      'switch.connection': 'Connection failed',
      'switch.timeout': 'Timed out',
      'switch.model-unavailable': 'Model unavailable',
      'switch.format-error': 'Bad response format',
      'switch.agent-start-failed': 'Worker failed to start',

      'readonly.toolName': 'Tool name',
      'readonly.enforceGate': 'Gate enforced',
      'readonly.gateRequired': 'Gate required',
      'readonly.configVersion': 'Config version',
      'readonlyValue.toolName': 'grok_workflow (fixed at registration)',
      'readonlyValue.enforceGate': 'on (default; editable in the profile patch)',
      'readonlyValue.gateRequired': 'off (default; editable in the profile patch)',
      'readonlyValue.configVersion': '1 (wire contract)',

      'role.planner': 'Planner',
      'role.worker': 'Worker',
      'role.verifier': 'Checker',
      'role.synthesizer': 'Summarizer',

      // One-line duties under each role name.
      'role.planner.duty': 'Breaks the job into pieces.',
      'role.worker.duty': 'Does each piece.',
      'role.verifier.duty': 'Checks each piece against the bar.',
      'role.synthesizer.duty': 'Stitches the checked pieces into one answer.',

      'roles.hint': 'Up to {limit} backup routes per chain, tried in order; blank means this role uses the model you are already talking to — easiest.',
      'roles.count': '{count}/{limit} routes',
      'roles.add': '+ Add a backup (up to {limit})',
      'roles.remove': 'Remove',
      'roles.empty': 'Blank: this role uses the model you are already talking to — easiest.',
      'roles.providerLabel': 'Channel',
      'roles.modelLabel': 'Model',
      'roles.capLabel': 'Cap',
      'roles.capPlaceholder': '1-64, blank = unlimited (never yields)',
      'roles.capHint': 'Max calls at once on this route. A full route overflows to the next one; it never fails, it just yields. Blank = unlimited = never yields; a capped route yields only when full inside one workflow run, and counts are never shared across runs.',
      'roles.providerPlaceholder': 'Pick a channel…',
      'roles.modelPlaceholder': 'Pick a model… (blank = easiest)',
      'roles.manualProvider': 'or type a channel…',
      'roles.manualModel': 'or type a model id…',
      'roles.noModels': 'This channel lists no models',
      'roles.noCatalog': 'No model list from the runtime — type it by hand.',
      'roles.firstRowHint': 'Blank = use the model you are talking to. Easiest, leave it.',

      'warn.combo.title': 'Long chains plus many retries can run very long.',
      'warn.combo.detail': 'This is a heads-up, not a block: saving still works.',
      'warn.emptyCap.title': 'All caps are blank: nothing will ever yield.',
      'warn.emptyCap.detail': 'This chain has 2+ routes but every cap is blank = unlimited = never yields; only a capped route yields when full inside one workflow run, and counts are never shared across runs. This is a heads-up, not a block: saving still works.',
      'warn.limit.title': 'A saved limit is over the hard maximum.',
      'warn.limit.detail': '{field} is saved as {live}, over the hard maximum {cap}. The plugin runs it clamped to {cap} and said so in its log, so the tool stays usable — save {cap} or lower here and this notice goes away.',

      'action.save': 'Save',
      'action.saveCount': 'Save ({count})',
      'action.saving': 'Saving…',
      'action.discard': 'Discard',
      // One retry of the mirror read: the only recovery a failed `describe()` has.
      'action.retry': 'Try again',

      'status.saved': 'Saved; applies to the next message.',
      'status.refused': 'The Host refused this write (a value is invalid or the key is read-only).',
      'status.writeFailed': 'Write failed: {message}',
      'status.loading': 'Loading…',
      'status.loadError': 'Could not read the settings from the Host: {message}',
      'status.unavailable': 'The Host does not serve the grok-workflow settings namespace (is the plugin active?)',
      'status.revision': 'revision {revision}',

      // --- The "进度" conversation tab (see the progress block at the end of this file) ---
      'view.progress': 'Progress',
      'progress.title': 'Task progress',
      'progress.aria': 'Task progress track',
      'progress.zoomIn': 'Zoom in',
      'progress.zoomOut': 'Zoom out',
      'progress.zoomReset': 'Reset zoom',
      'progress.percent': '{settled}/{declared} · {percent}%',
      'progress.percentHint': '{settled} of {declared} declared rows settled; this is not a task verdict',
      'progress.unsettled': 'No rows declared yet',
      'progress.stage.start': 'Start',
      'progress.stage.sync': 'Sync',
      'progress.stage.triage': 'Diagnose',
      'progress.stage.fix': 'Fix',
      'progress.stage.ui': 'UI',
      'progress.stage.device': 'On device',
      'progress.stage.cleanup': 'Clean up',
      'progress.stage.push': 'Push/tag',
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
      'progress.detail.title': 'Stage detail',
      'progress.detail.close': 'Close',
      'progress.detail.engine': 'Engine facts',
      'progress.detail.stage': 'Stage report',
      'progress.detail.rows': '{count} rows',
      'progress.detail.runId': 'runId',
      'progress.detail.seq': 'seq',
      'progress.detail.label': 'Label',
      'progress.detail.phase': 'Phase',
      'progress.detail.childId': 'Child session',
      'progress.detail.outcome': 'Outcome',
      'progress.detail.duration': 'Duration',
      'progress.detail.open': 'Open child session',
      'progress.detail.copy': 'Copy coordination block',
      'progress.detail.copied': 'Copied',
      'progress.detail.copyFailed': 'Copy failed',
      'progress.detail.noBlock': 'No coordination block to copy',
      'progress.source.stageDetail': 'Source: stage-detail event',
      'progress.source.coordination': 'Source: child coordination block',
      'progress.source.notReported': 'Source: not reported',
      'progress.field.files': 'Files',
      'progress.field.commands': 'Commands',
      'progress.field.result': 'Result',
      'progress.field.evidence': 'Evidence',
      'progress.field.risks': 'Risks',
      'progress.field.next': 'Next',
      'progress.field.owner': 'Owner',
      'progress.none': '—',
      'status.progressMissing': 'The Progress tab is not mounted: this composition has no uiConversation service, so the track cannot appear.',
      'status.progressFailed': 'The Progress tab could not be registered: {message}. Everything else keeps working.',


      'error.number': '{key} must be a whole number between {min} and {max} — fix the number and save again.',
      'error.presetNeeded': 'A named preset scope needs a preset name — fill in the gate preset name.',
      'error.chainTooLong': '{role} can keep at most {limit} backup routes — remove the extras.',
      'error.missingModel': '{role} entry {index} has no model — pick one or remove the row.',
      'error.tooLong': '{role} entry {index}: the channel/model text is over {limit} characters.',
      'error.duplicate': '{role} entry {index} repeats an earlier row — duplicates change nothing.',
      'error.badCap': '{role} entry {index}: the cap must be a whole number between {min} and {max}, or blank for unlimited.',
      'error.unknownClass': 'This switch does not accept {entry}.',
      'error.synthesisChainUnused': 'The summarizer chain is set but summary style is "Assemble by rule" — switch to "Rewrite with model" or clear the chain.',
      'error.synthesisChainMissing': 'Summary style is "Rewrite with model" but the summarizer chain is empty — add a route or switch back to "Assemble by rule".',
    }

    const ZH = {
      'card.title': 'Grok workflow',
      'card.summary': '将任务拆分的工具：入口门禁、按角色模型链、并发上限与运行记录。',

      'page.intro': '将任务拆分的工具',

      'status.off': '关着：普通聊天',
      'status.off.detail': '发什么直接回什么。发 /grok 认真干一次。',
      'status.triage': '开着：智能分诊',
      'status.triage.detail': '简单的直接答，复杂的才开团队。',
      'status.full': '开着：全员出动',
      'status.full.detail': '每条都走完整团队，又全又慢。',

      'group.gate': '模式',
      'group.limits': '上限',
      'group.roles': '谁来干',
      'group.output': '其他',
      'group.structural': '运行状态',

      'novice.mode.title': '模式',
      'novice.roles.title': '谁来干',
      'novice.roles.hint': '先选"哪家"，再选"用哪个"。留空最省事：这个角色直接用跟你对话的模型。',
      'novice.roles.warn': 'wb 只是模型名字的前缀，不是 provider。provider 填通道名，比如 bifrost-completions。',
      'novice.limits.title': '上限',
      'novice.limits.hint': '长任务把数字调大。越大越贵、越慢，自己权衡。',
      'novice.limits.relaxed': '已按长任务放宽',
      'advanced.title': '其他',
      'advanced.default': '默认即可',
      'danger.title': '高级（别碰）',
      'danger.hint': '动这里改的是插件本身，不是不用力的大小。填错会导致插件加载失败。',
      'structural.hint': '这四个键不进可编辑表单（改动它们等于换掉插件或门禁本身），请改 profile patch 后重启。',

      'field.gateScope': '门禁范围',
      'field.gateScope.hint': '别动，默认的整进程门禁就是你要的。',
      'field.gatePreset': '门禁预设名',
      'field.gatePreset.hint': '范围选了"指定预设"才需要填。',
      'field.mode': '认真时怎么派活',
      'field.mode.hint': '推荐智能分诊：简单的直接答，复杂的才开团队。全员出动是每条都走完整团队，又全又慢。',
      'field.mode.ifFull': '全员出动：每条都走完整团队，又全又慢又贵。',
      'field.grokDefault': '默认认真干活',
      'field.grokDefault.hint': '关：平时普通聊天，在那一轮里发 /grok 才认真干一次。开：每条都走工作流。轮里的开关优先。',
      'field.grokDefault.ifOff': '关着就是普通聊天。',
      'field.grokDefault.ifOn': '开着就是每条都走团队。',
      'field.triageAsk': '拿不准就问我',
      'field.triageAsk.hint': '开：拿不准时反问一句再干。关：拿不准直接按团队档处理。',
      'field.triageModel': '分诊用哪个模型',
      'field.triageModel.hint': '留空 = 跟本次运行，不单独指定，最省事。',
      'field.triageModel.follow': '跟本次运行',
      'field.triageClassifier': '前台分诊方式',
      'field.triageClassifier.hint': '规则：纯字符串，即时。混合：拿不准时多花一次模型调用。',
      'option.triageClassifier.rules': '规则（默认）',
      'option.triageClassifier.hybrid': '混合（模型兜底）',
      'field.triageFollowupAsFast': '追问走快手',
      'field.triageFollowupAsFast.hint': '开：有上文时“继续/说人话”走一个工人，绝不进寒暄模板。',
      'field.instantReceipt': '即时回执',
      'field.instantReceipt.hint': '开：团队档先回档位行，运行时不再白屏。',
      'field.humanSummary': '人话总结',
      'field.humanSummary.hint': '开：报告前加 3-5 句人话结论，原文附后。',
      'field.showDiagnostics': '机器台账',
      'field.showDiagnostics.hint': '关：隐藏模型路由、时限、切换、溢出、错误。不确定项始终保留。',
      'field.answerStrategy': '回答策略',
      'field.answerStrategy.hint': '工作流怎么把报告交回来。不知道就别动。',
      'field.historyTurns': '带多少上文（轮）',
      'field.historyTurns.hint': '每次带几轮历史。多带多花钱。',
      'field.historyChars': '带多少上文（字）',
      'field.historyChars.hint': '每次带多少字历史。多带多花钱。',
      'field.maxQueuedMessages': '排队消息',
      'field.maxQueuedMessages.hint': '一次运行忙时，最多几条消息排队等。',
      'field.maxConcurrency': '同时干几件',
      'field.maxConcurrency.hint': '同时并行几个任务。大了快，但贵。',
      'field.maxRetries': '失败重试几次',
      'field.maxRetries.hint': '一个任务失败后，最多再试几次。',
      'field.maxTasks': '一次拆几个任务',
      'field.maxTasks.hint': '一条消息最多拆成几个任务。',
      'field.timeoutMs': '最多跑多久',
      'field.timeoutMs.hint': '一次最多跑多久，跑不完就停并告诉你。默认 60 分钟。',
      'field.maxActiveRuns': '每会话同时跑几个',
      'field.maxActiveRuns.hint': '一个聊天里同时跑几个。',
      'field.maxActiveRunsTotal': '全部会话同时跑几个',
      'field.maxActiveRunsTotal.hint': '所有聊天加起来同时跑几个。',
      'field.subagentProvider': '子代理通道',
      'field.subagentProvider.hint': '留空。只有运维告诉你通道名才填。',
      'field.synthesis': '汇总方式',
      'field.synthesis.hint': '按规则拼：可预期、不花钱；模型重写：读着顺，但多花一次调用。',
      'field.switchOn': '哪些失败换人',
      'field.switchOn.hint': '全勾 = 默认规则：路不通才换人（限流、崩溃、超时）。内容没做好永远不换人，原地重试。',
      'field.recordRuns': '看施工牌',
      'field.recordRuns.hint': '运行时显示按任务分组的进度。',
      'field.showProgress': '留记录',
      'field.showProgress.hint': '把每次运行记进会话记录。',
      'field.recordLimit': '留几条记录',
      'field.recordLimit.hint': '过去的运行记录留几条。',
      'field.range': '{min} – {max}，默认 {def}',

      // Unit suffixes rendered after number inputs (paired keys, zh/en).
      'unit.ms': '毫秒',
      'unit.retries': '次',
      'unit.jobs': '个',
      'unit.tasks': '个',
      'unit.turns': '轮',
      'unit.chars': '字',
      'unit.queued': '条',
      'unit.runs': '个',
      'unit.runsTotal': '个',
      'unit.records': '条',

      'option.gateScope.process': '整进程（默认）',
      'option.gateScope.preset': '指定预设',
      'option.mode.triage': '智能分诊（推荐）',
      'option.mode.full': '全员出动',
      'option.grokDefault.off': '关',
      'option.grokDefault.on': '开',
      'option.answerStrategy.in-turn': '本轮直接回（默认）',
      'option.answerStrategy.relay': '转交后回',
      'option.answerStrategy.append': '追加再回',
      'option.synthesis.deterministic': '按规则拼（默认）',
      'option.synthesis.model': '模型重写',

      'switch.rate-limit': '被限流（429）',
      'switch.server-error': '对方服务器报错（500）',
      'switch.connection': '连不上 / 断网',
      'switch.timeout': '超时没回',
      'switch.model-unavailable': '模型不可用',
      'switch.format-error': '回的东西格式不对',
      'switch.agent-start-failed': '小号起不来',

      'readonly.toolName': '工具名',
      'readonly.enforceGate': '强制门禁',
      'readonly.gateRequired': '门禁必需',
      'readonly.configVersion': '配置版本',
      'readonlyValue.toolName': 'grok_workflow（注册即固定）',
      'readonlyValue.enforceGate': '开（默认；可在 profile patch 中改）',
      'readonlyValue.gateRequired': '关（默认；可在 profile patch 中改）',
      'readonlyValue.configVersion': '1（wire 契约）',

      'role.planner': '规划',
      'role.worker': '执行',
      'role.verifier': '检查',
      'role.synthesizer': '总结',

      'role.planner.duty': '把活拆成几件。',
      'role.worker.duty': '一件一件干。',
      'role.verifier.duty': '按标准检查每一件。',
      'role.synthesizer.duty': '把验过的拼成一个答复。',

      'roles.hint': '每条链最多 {limit} 条备用，按顺序换人；留空表示该角色用跟你对话的模型，最省事。',
      'roles.count': '{count}/{limit} 条备用',
      'roles.add': '+ 加一条备用（最多 {limit} 条）',
      'roles.remove': '删',
      'roles.empty': '留空：该角色用跟你对话的模型，最省事。',
      'roles.providerLabel': '哪家',
      'roles.modelLabel': '用哪个',
      'roles.capLabel': '并发上限',
      'roles.capPlaceholder': '1-64，空=不限=不让路',
      'roles.capHint': '这条路由同时在飞的调用上限。打满就用下一条，不算失败，只是让路。留空=不限=不让路；单run内打满才让路；跨run不共享计数。',
      'roles.providerPlaceholder': '选哪家…',
      'roles.modelPlaceholder': '选用哪个…（留空最省事）',
      'roles.manualProvider': '或手填通道…',
      'roles.manualModel': '或手填模型 id…',
      'roles.noModels': '这家没列出模型',
      'roles.noCatalog': '读不到运行时模型目录，手填即可。',
      'roles.firstRowHint': '留空 = 用跟你对话的模型，最省事。',

      'warn.combo.title': '备用链很长、重试又高，跑起来会很久。',
      'warn.combo.detail': '只是提醒，不拦保存。',
      'warn.emptyCap.title': '上限全空：永远不会让路。',
      'warn.emptyCap.detail': '这条链有 2 条以上路由但上限全空=不限=不让路；只有填了上限的路由才会在单次 run 内打满时让路，计数跨 run 不共享。只是提醒，不拦保存。',
      'warn.limit.title': '有个已保存的上限超过了硬上限。',
      'warn.limit.detail': '{field} 保存的是 {live}，超过硬上限 {cap}。插件按 {cap} 钳制运行并在日志里说明过，所以工具照常可用——在这里保存 {cap} 或更小，这条提示就会消失。',

      'action.save': '保存',
      'action.saveCount': '保存 ({count})',
      'action.saving': '保存中…',
      'action.discard': '放弃修改',
      // Same key as `en`: re-reading is the only recovery a failed `describe()` has.
      'action.retry': '重试',

      'status.saved': '已保存，下一条消息生效。',
      'status.refused': 'Host 拒绝了这次写入（值不合法或键不可写）。',
      'status.writeFailed': '写入失败：{message}',
      'status.loading': '读取中…',
      'status.loadError': '读不到 Host 的设置：{message}',
      'status.unavailable': 'Host 未提供 grok-workflow 设置命名空间（插件未激活？）',
      'status.revision': 'revision {revision}',

      // --- 进度 Tab（见本文件末尾的 progress 区块）---
      'view.progress': '进度',
      'progress.title': '任务进度',
      'progress.aria': '任务进度轨道',
      'progress.zoomIn': '放大',
      'progress.zoomOut': '缩小',
      'progress.zoomReset': '重置缩放',
      'progress.percent': '{settled}/{declared} · {percent}%',
      'progress.percentHint': '已声明 {declared} 行，已结算 {settled} 行；这不是任务通过数',
      'progress.unsettled': '尚未声明任何行',
      'progress.stage.start': '起点',
      'progress.stage.sync': '同步对比',
      'progress.stage.triage': '排查',
      'progress.stage.fix': '修复',
      'progress.stage.ui': 'UI 改',
      'progress.stage.device': '真机验证',
      'progress.stage.cleanup': '清理',
      'progress.stage.push': 'push/tag',
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
      'progress.detail.title': '阶段详情',
      'progress.detail.close': '关闭',
      'progress.detail.engine': '引擎事实',
      'progress.detail.stage': '阶段报告',
      'progress.detail.rows': '{count} 行',
      'progress.detail.runId': 'runId',
      'progress.detail.seq': 'seq',
      'progress.detail.label': '标签',
      'progress.detail.phase': '阶段',
      'progress.detail.childId': '子会话',
      'progress.detail.outcome': '结果',
      'progress.detail.duration': '耗时',
      'progress.detail.open': '打开子会话',
      'progress.detail.copy': '复制协调块',
      'progress.detail.copied': '已复制',
      'progress.detail.copyFailed': '复制失败',
      'progress.detail.noBlock': '没有可复制的协调块',
      'progress.source.stageDetail': '来源：stage-detail 事件',
      'progress.source.coordination': '来源：子会话协调块',
      'progress.source.notReported': '来源：未报告',
      'progress.field.files': '变更文件',
      'progress.field.commands': '运行命令',
      'progress.field.result': '结论',
      'progress.field.evidence': '证据',
      'progress.field.risks': '风险',
      'progress.field.next': '下一步',
      'progress.field.owner': '负责人',
      'progress.none': '—',
      'status.progressMissing': '进度 Tab 未挂载：当前组合没有 uiConversation 服务，轨道不会出现。',
      'status.progressFailed': '进度 Tab 注册失败：{message}。其余功能不受影响。',


      'error.number': '{key} 得是 {min} 到 {max} 之间的整数，改对数字再保存。',
      'error.presetNeeded': '范围选了指定预设，就得填预设名。',
      'error.chainTooLong': '{role} 备用链最多 {limit} 条，删掉多余的。',
      'error.missingModel': '{role} 第 {index} 条没有模型，选一个或删掉这一行。',
      'error.tooLong': '{role} 第 {index} 条的通道/模型文字超过 {limit} 字。',
      'error.duplicate': '{role} 第 {index} 条跟前面的重复了，重复不顶用。',
      'error.badCap': '{role} 第 {index} 条的并发上限得是 {min} 到 {max} 之间的整数，留空就是不限。',
      'error.unknownClass': '这个开关不认识 {entry}。',
      'error.synthesisChainUnused': '总结链已填但汇总方式是"按规则拼"——改成"模型重写"或清空总结链。',
      'error.synthesisChainMissing': '汇总方式是"模型重写"但总结链是空的——加一条路由或改回"按规则拼"。',
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
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
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

    const emptyRoles = () => ({ planner: [], worker: [], verifier: [], synthesizer: [] })
    const clone = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value))
    const draftOf = (value) => {
      const out = { roles: emptyRoles() }
      for (const field of FIELDS) {
        const current = value === undefined ? undefined : value[field.key]
        out[field.key] = current === undefined ? clone(field.def) : clone(current)
      }
      if (value !== undefined && value.roles !== undefined) out.roles = clone(value.roles)
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
        if (field.kind !== 'number') continue
        const raw = draft[field.key]
        if (!Number.isSafeInteger(raw) || raw < field.min || raw > field.max) {
          errors.push({ key: 'error.number', params: { key: field.key, min: field.min, max: field.max } })
        }
      }
      if (draft.gateScope === 'preset' && String(draft.gatePreset || '').trim() === '') {
        errors.push({ key: 'error.presetNeeded' })
      }
      for (const role of ROLES) {
        const chain = draft.roles[role] || []
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
      for (const entry of draft.switchOn || []) {
        if (!SWITCHABLE_CLASSES.includes(entry)) errors.push({ key: 'error.unknownClass', params: { entry } })
      }
      // Cross-field check: synthesis must agree with the summarizer chain.
      // A finished summarizer route with "assemble by rule" can never run, and
      // "rewrite with model" with no finished route can never run either —
      // both are as fatal as a missing model, so both block Save (red, not a
      // heads-up). Blank unfinished rows do not count: they are already blocked
      // by `error.missingModel`. Mirrors the host's load-time rule
      // (`resolveConfig`, synthesis/synthesizer bidirectional check) and its
      // repair twin (`repairSynthesisInconsistency`, P1).
      const finishedSynthesizer = (draft.roles.synthesizer || [])
        .filter((route) => String((route && route.model) || '').trim() !== '').length
      if (finishedSynthesizer > 0 && draft.synthesis === 'deterministic') {
        errors.push({ key: 'error.synthesisChainUnused' })
      } else if (finishedSynthesizer === 0 && draft.synthesis === 'model') {
        errors.push({ key: 'error.synthesisChainMissing' })
      }
      return errors
    }

    /**
     * Heads-up (not a block) when a long chain meets high retries: the run can
     * take very long. Rendered above the save button; saving still works.
     * @param draft - the editable draft.
     * @returns true when the warning should show.
     */
    function comboWarn(draft) {
      const longest = Math.max(1, ...ROLES.map((role) => (draft.roles[role] || []).length))
      return longest >= 5 && Number(draft.maxRetries) >= 5
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
      return ROLES.some((role) => {
        const finished = (draft.roles[role] || [])
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
     * its hard maximum (B07): `maxConcurrency` 8 or `maxRetries` 5 from a profile
     * patch written before v0.9.0 restored the 6 / 3 envelope.
     *
     * The Host repairs that at load — it clamps to the cap, warns once and activates
     * the row instead of refusing it — so the tool is usable but the stored number
     * still disagrees with what runs. This banner is the page half of that pair: it
     * names the stored value and the cap, and it reads the *live* document rather
     * than the draft, because the draft is already what the reader is editing. Saving
     * a legal number re-publishes the document and the notice disappears on its own.
     *
     * Only a numeric value above the maximum counts: a string, or a value below the
     * minimum, is a different defect and is already `error.number` (red, blocks Save).
     * @param value - the live settings document as the Host projects it.
     * @returns one `{ key, live, cap }` finding per overrun, in field order.
     */
    function limitOverrunWarn(value) {
      const findings = []
      if (value === undefined || value === null) return findings
      for (const field of FIELDS) {
        if (field.kind !== 'number' || field.max === undefined) continue
        const live = value[field.key]
        if (typeof live !== 'number' || !Number.isFinite(live) || live <= field.max) continue
        findings.push({ key: field.key, live, cap: field.max })
      }
      return findings
    }

    /**
     * Render one validation finding in the active language.
     *
     * `role` params carry role ids, not prose: the role name is looked up here so a single
     * dictionary entry serves all four chains in both languages.
     * @param error - a finding from `validate`.
     * @param t - translator bound to this plugin's namespace.
     * @returns the message the user sees.
     */
    function formatError(error, t) {
      const source = error === undefined || error.params === undefined ? {} : error.params
      const params = { ...source }
      if (typeof params.role === 'string') params.role = t(`role.${params.role}`)
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
        const before = value && value.roles ? value.roles[role] : undefined
        if (JSON.stringify(before || []) === JSON.stringify(draft.roles[role] || [])) continue
        ops.push({ op: 'set', path: ['roles', role], value: draft.roles[role] })
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
      warn: { border: '1px solid #f5c542', background: '#fff7e6', borderRadius: '10px', padding: '9px 13px', fontSize: '12px', lineHeight: 1.6 },
      danger: { display: 'flex', flexDirection: 'column', gap: '0', border: '1px solid #f5c542', background: '#fff7e6', borderRadius: '12px', padding: '16px 20px 8px' },
      chain: { display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid rgba(128,128,128,0.25)', paddingLeft: '12px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px', paddingTop: '2px', paddingBottom: '2px' },
      roleCard: { display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(128,128,128,0.05)', border: '1px solid rgba(128,128,128,0.16)', borderRadius: '10px', padding: '12px 14px' },
      roleHead: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
      roleIndex: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(59,110,246,0.12)', color: '#3b6ef6', fontSize: '12px', fontWeight: 700, flex: 'none' },
      route: { display: 'flex', gap: '8px', alignItems: 'center' },
      switch: { position: 'relative', width: '38px', height: '21px', borderRadius: '999px', border: 0, cursor: 'pointer', flex: 'none', background: '#d1d5db' },
      switchOn: { position: 'relative', width: '38px', height: '21px', borderRadius: '999px', border: 0, cursor: 'pointer', flex: 'none', background: '#2f9e44' },
      checkbox: { width: '16px', height: '16px', accentColor: '#3b6ef6', flex: 'none' },
      button: { minHeight: '32px', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      primary: { minHeight: '32px', padding: '5px 18px', borderRadius: '8px', border: '1px solid transparent', background: '#3b6ef6', color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 600 },
      footer: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 0, padding: '12px 0', marginTop: '4px', borderTop: `1px solid ${HAIRLINE}`, background: 'var(--dsh-settings-footer-bg, rgba(128,128,128,0.12))', backdropFilter: 'blur(8px)' },
      error: { color: STATUS_COLOR.failed },
      errorBox: { background: 'rgba(229,72,77,0.07)', border: '1px solid rgba(229,72,77,0.35)', borderRadius: '10px', padding: '10px 14px' },
      empty: { display: 'block', border: '1px dashed rgba(128,128,128,0.4)', borderRadius: '8px', padding: '10px 12px', background: 'transparent' },
      ok: { color: STATUS_COLOR.done },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' },
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
     * Host's own: the shipped id first, then the projected value — `roles` and
     * `switchOn` are volatile and together specific enough to be this plugin.
     * @param view - the mirror's namespace view, when the Host published one.
     * @param defaultNs - the shipped namespace id.
     * @returns the namespace to bind to and how it was found.
     */
    function resolveNamespace(view, defaultNs) {
      const namespaces = view === undefined || view.namespaces === undefined ? [] : view.namespaces
      const byId = namespaces.find((item) => item.ns === defaultNs)
      if (byId !== undefined) return { ns: defaultNs, how: 'id' }
      const distinctive = ['roles', 'switchOn']
      const byValue = namespaces.find((item) => {
        const value = item.value !== undefined && item.value !== null ? item.value : {}
        return distinctive.every((key) => key in value)
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
     * One novice-friendly row: label + hint on the left, control on the right.
     * The raw field key is never rendered; it survives only as `data-field`.
     */
    function FieldRow(props) {
      const { fieldKey, title, hint, control } = props
      return h('div', { style: styles.row, className: 'gw-row', 'data-field': fieldKey },
        h('span', { style: styles.label },
          h('span', { style: styles.labelTitle }, title),
          hint === undefined ? null : h('span', { style: styles.hint }, hint)),
        h('div', { style: styles.control }, control))
    }

    function Toggle(props) {
      const { on, disabled, onFlip, label } = props
      return h('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center' } },
        h('button', {
          type: 'button', role: 'switch', 'aria-checked': on === true,
          style: on === true ? styles.switchOn : styles.switch, disabled,
          onClick: () => onFlip(!on),
        }),
        h('span', null, label))
    }

    function EnumField(props) {
      const { field, value, disabled, onChange, t } = props
      const optionKey = (option) => `option.${field.key}.${option}`
      return h('select', {
        style: { ...styles.input, ...styles.narrow, width: 'auto' }, value: String(value), disabled,
        onChange: (event) => onChange(field.key, event.target.value),
        'data-field': field.key,
      }, field.options.map((option) => {
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

    function ClassPicker(props) {
      // Seven checkboxes, one per switchable class: checked = this failure
      // advances the chain. All checked is the built-in behavior.
      const { value, disabled, onChange, t } = props
      const selected = new Set(value || [])
      const labelFor = (name) => {
        const key = `switch.${name}`
        return translate(undefined, key) === key ? name : t(key)
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        SWITCHABLE_CLASSES.map((name) => h('label', { key: name, style: { display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 400, fontSize: '13px', minHeight: '24px' } },
          h('input', {
            type: 'checkbox', checked: selected.has(name), disabled,
            style: styles.checkbox,
            'data-switch-class': name,
            onChange: () => {
              const next = new Set(selected)
              if (next.has(name)) next.delete(name)
              else next.add(name)
              onChange(SWITCHABLE_CLASSES.filter((entry) => next.has(entry)))
            },
          }),
          h('span', null, labelFor(name)))))
    }

    /**
     * One route row: provider dropdown + model dropdown, with free-text fallback.
     *
     * The catalog comes from the runtime's settings mirror (provider sections
     * declare their models); when the runtime exposes nothing, both controls
     * degrade to text inputs so the page never depends on a hard-coded list.
     */
    function RouteRow(props) {
      const { role, index, route, disabled, onUpdate, onRemove, catalog, t } = props
      const provider = String((route && route.provider) || '')
      const model = String((route && route.model) || '')
      const capRaw = route === undefined || route === null ? undefined : route.maxInFlight
      const capText = capRaw === undefined || capRaw === null ? '' : String(capRaw)
      const providers = catalog === undefined ? [] : Object.keys(catalog)
      const models = provider !== '' && catalog !== undefined && catalog[provider] !== undefined ? catalog[provider] : []
      const knownProvider = provider === '' || providers.includes(provider)
      const knownModel = model === '' || models.includes(model)
      const providerControl = providers.length === 0 || !knownProvider
        ? h('input', {
          type: 'text', placeholder: t('roles.manualProvider'), value: provider, disabled,
          style: styles.input, 'data-route-provider': `${role}-${index}`,
          onChange: (event) => onUpdate({ provider: event.target.value }),
        })
        : h('select', {
          style: styles.input, value: provider, disabled,
          'data-route-provider': `${role}-${index}`,
          onChange: (event) => onUpdate({ provider: event.target.value, model: '' }),
        },
        h('option', { key: '', value: '' }, t('roles.providerPlaceholder')),
        providers.map((name) => h('option', { key: name, value: name }, name)))
      const modelControl = models.length === 0 || !knownModel
        ? h('input', {
          type: 'text', placeholder: t('roles.modelPlaceholder'), value: model, disabled,
          style: styles.input, 'data-route-model': `${role}-${index}`,
          onChange: (event) => onUpdate({ model: event.target.value }),
        })
        : h('select', {
          style: styles.input, value: model, disabled,
          'data-route-model': `${role}-${index}`,
          onChange: (event) => onUpdate({ model: event.target.value }),
        },
        h('option', { key: '', value: '' }, t('roles.modelPlaceholder')),
        models.map((name) => h('option', { key: name, value: name }, name)))
      return h('div', { key: `${role}-${index}`, style: styles.route },
        h('span', { style: { ...styles.hint, minWidth: '18px', textAlign: 'center' } }, `${index + 1}`),
        h('span', { style: { flex: '1 1 0', minWidth: 0 } }, providerControl),
        h('span', { style: { flex: '1 1 0', minWidth: 0 } }, modelControl),
        h('span', { style: { flex: '0 0 76px', minWidth: 0 }, title: t('roles.capHint') }, h('input', {
          type: 'number', placeholder: t('roles.capPlaceholder'), value: capText, disabled,
          min: ROUTE_INFLIGHT_MIN, max: ROUTE_INFLIGHT_MAX, step: 1,
          style: styles.input, 'data-route-cap': `${role}-${index}`,
          'aria-label': t('roles.capLabel'),
          onChange: (event) => {
            const raw = event.target.value
            if (raw === '' || raw === undefined || raw === null) {
              const next = { ...route }
              delete next.maxInFlight
              onUpdate(next)
              return
            }
            onUpdate({ maxInFlight: Number(raw) })
          },
        })),
        h('button', {
          type: 'button', style: { ...styles.button, flex: 'none' }, disabled,
          onClick: onRemove,
          'data-remove-route': `${role}-${index}`,
        }, t('roles.remove')))
    }

    const ROLE_ORDER = { planner: 1, worker: 2, verifier: 3, synthesizer: 4 }

    function RoleChain(props) {
      const { role, chain, disabled, onChange, catalog, t } = props
      const update = (index, patch) => {
        const next = chain.map((route, position) => (position === index ? { ...route, ...patch } : route))
        onChange(next)
      }
      return h('div', { style: styles.roleCard },
        h('div', { style: styles.roleHead },
          h('span', { style: styles.roleIndex }, String(ROLE_ORDER[role] || '·')),
          h('strong', null, t(`role.${role}`)),
          h('span', { style: styles.hint }, t(`role.${role}.duty`))),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: styles.hint }, t('roles.count', { count: chain.length, limit: CHAIN_LIMIT })),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || chain.length >= CHAIN_LIMIT,
            onClick: () => onChange([...chain, { provider: '', model: '' }]),
            'data-add-route': role,
          }, t('roles.add', { limit: CHAIN_LIMIT }))),
        h('div', { style: styles.chain, className: 'gw-chain' },
          chain.length === 0
            ? h('span', { style: { ...styles.hint, ...styles.empty } }, t('roles.empty'))
            : chain.map((route, index) => h(RouteRow, {
              key: `${role}-${index}`, role, index, route, disabled, catalog, t,
              onUpdate: (patch) => update(index, patch),
              onRemove: () => onChange(chain.filter((_route, position) => position !== index)),
            }))))
    }

    /**
     * The triage-model picker: provider dropdown + model dropdown, with a
     * "follow this run" empty option and free-text fallback. Stored as one
     * `provider/model` string, like the host-side `parseSingleRoute`.
     */
    function TriageModelPicker(props) {
      const { value, disabled, onChange, catalog, t } = props
      const raw = String(value === undefined ? '' : value)
      const slash = raw.indexOf('/')
      const provider = slash <= 0 ? '' : raw.slice(0, slash)
      const model = slash <= 0 ? raw : raw.slice(slash + 1)
      const providers = catalog === undefined ? [] : Object.keys(catalog)
      const models = provider !== '' && catalog !== undefined && catalog[provider] !== undefined ? catalog[provider] : []
      const join = (nextProvider, nextModel) => {
        const p = String(nextProvider || '').trim()
        const m = String(nextModel || '').trim()
        if (m === '') return onChange('')
        return onChange(p === '' ? m : `${p}/${m}`)
      }
      const providerControl = providers.length === 0
        ? h('input', {
          type: 'text', placeholder: t('roles.manualProvider'), value: provider, disabled,
          style: styles.input, 'data-triage-provider': 'triageModel',
          onChange: (event) => join(event.target.value, model),
        })
        : h('select', {
          style: styles.input, value: provider, disabled,
          'data-triage-provider': 'triageModel',
          onChange: (event) => join(event.target.value, model),
        },
        h('option', { key: '', value: '' }, t('field.triageModel.follow')),
        providers.map((name) => h('option', { key: name, value: name }, name)))
      const modelControl = models.length === 0
        ? h('input', {
          type: 'text', placeholder: t('roles.modelPlaceholder'), value: model, disabled,
          style: styles.input, 'data-triage-model': 'triageModel',
          onChange: (event) => join(provider, event.target.value),
        })
        : h('select', {
          style: styles.input, value: model, disabled,
          'data-triage-model': 'triageModel',
          onChange: (event) => join(provider, event.target.value),
        },
        h('option', { key: '', value: '' }, t('roles.modelPlaceholder')),
        models.map((name) => h('option', { key: name, value: name }, name)))
      return h('div', null,
        h('div', { style: styles.route },
          h('span', { style: { ...styles.hint, minWidth: '18px', textAlign: 'center' } }, '·'),
          h('span', { style: { flex: '1 1 0', minWidth: 0 } }, providerControl),
          h('span', { style: { flex: '1 1 0', minWidth: 0 } }, modelControl)),
        h('div', { style: styles.hint }, t('field.triageModel.hint')))
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
      const ops = useMemo(() => opsFor(draft, value), [draft, value])
      const warnCombo = useMemo(() => comboWarn(draft), [draft])
      const warnEmptyCap = useMemo(() => emptyCapWarn(draft), [draft])
      // Keyed on the live document, not the draft: an overrun is a fact about what is
      // stored, and it stops being one when the save lands (the revision bumps and the
      // draft is re-seeded from the new value).
      const warnLimits = useMemo(() => limitOverrunWarn(value), [value, stamp])
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

      const fieldByKey = (key) => FIELDS.find((field) => field.key === key)
      const enumRow = (key) => {
        const field = fieldByKey(key)
        return h(FieldRow, {
          key, fieldKey: key, title: t(`field.${key}`), hint: t(`field.${key}.hint`),
          control: h(EnumField, { field, value: draft[key], disabled, onChange, t }),
        })
      }
      // Number input with a unit suffix (paired `unit.*` dict keys) and the
      // range line beneath it. The FIELDS min/max/def stay untouched.
      const NUMBER_UNITS = {
        timeoutMs: 'unit.ms',
        maxRetries: 'unit.retries',
        maxConcurrency: 'unit.jobs',
        maxTasks: 'unit.tasks',
        historyTurns: 'unit.turns',
        historyChars: 'unit.chars',
        maxQueuedMessages: 'unit.queued',
        maxActiveRuns: 'unit.runs',
        maxActiveRunsTotal: 'unit.runsTotal',
        recordLimit: 'unit.records',
      }
      const numberRow = (key) => {
        const field = fieldByKey(key)
        const unitKey = NUMBER_UNITS[key]
        return h(FieldRow, {
          key, fieldKey: key, title: t(`field.${key}`), hint: t(`field.${key}.hint`),
          control: h('span', null,
            h('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center' } },
              h('input', {
                type: 'number', style: { ...styles.input, ...styles.narrow }, value: String(draft[key]), disabled,
                min: field.min, max: field.max, step: 1,
                onChange: (event) => onChange(key, event.target.value === '' ? '' : Number(event.target.value)),
                'data-field': key,
              }),
              unitKey === undefined ? null : h('span', { style: styles.hint }, t(unitKey))),
            h('div', { style: { ...styles.hint, marginTop: '4px' } }, t('field.range', { min: field.min, max: field.max, def: field.def }))),
        })
      }
      const booleanRow = (key) => {
        const field = fieldByKey(key)
        return h(FieldRow, {
          key, fieldKey: key, title: t(`field.${key}`), hint: t(`field.${key}.hint`),
          control: h('input', {
            type: 'checkbox', checked: draft[key] === true, disabled,
            style: styles.checkbox,
            onChange: (event) => onChange(key, event.target.checked),
            'data-field': key,
          }),
        })
      }

      return h('div', { style: styles.page, 'data-page': 'grok-workflow' },
        h(PageStyle, null),
        h('div', null,
          h('h2', { style: styles.title }, t('card.title')),
          h('p', { style: { ...styles.hint, margin: '0 0 12px', fontSize: '13px' } }, t('page.intro')),
          h(StatusLine, { draft, t }),
          progressNote),
        // --- Novice: mode ---
        h('div', { style: styles.card },
          h('h3', { style: styles.heading }, t('novice.mode.title')),
          h(FieldRow, {
            key: 'grokDefault', fieldKey: 'grokDefault',
            title: t('field.grokDefault'), hint: `${t('field.grokDefault.hint')} ${draft.grokDefault === 'on' ? t('field.grokDefault.ifOn') : t('field.grokDefault.ifOff')}`,
            control: h(Toggle, {
              on: draft.grokDefault === 'on', disabled,
              onFlip: (next) => onChange('grokDefault', next ? 'on' : 'off'),
              label: t(draft.grokDefault === 'on' ? 'option.grokDefault.on' : 'option.grokDefault.off'),
            }),
          }),
          enumRow('mode'),
          draft.mode === 'full'
            ? h('p', { style: { ...styles.hint, margin: 0 } }, t('field.mode.ifFull'))
            : null,
          booleanRow('triageAsk'),
          enumRow('triageClassifier'),
          booleanRow('triageFollowupAsFast'),
          booleanRow('instantReceipt')),
        // --- Novice: who does it ---
        h('div', { style: styles.card },
          h('h3', { style: styles.heading }, t('novice.roles.title')),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', margin: '0 0 12px' } },
            h('p', { style: { ...styles.hint, margin: 0 } }, t('novice.roles.hint')),
            h('p', { style: { ...styles.hint, margin: 0 } }, t('novice.roles.warn'))),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
            ROLES.map((role) => h(RoleChain, {
              key: role, role, chain: draft.roles[role] || [], disabled, catalog, t,
              onChange: (next) => setChain(role, next),
            })))),
        // --- Novice: limits ---
        h('div', { style: styles.card },
          h('h3', { style: styles.heading }, `${t('novice.limits.title')} · ${t('novice.limits.relaxed')}`),
          h('p', { style: { ...styles.hint, margin: '0 0 4px' } }, t('novice.limits.hint')),
          numberRow('timeoutMs'),
          numberRow('maxRetries'),
          numberRow('maxConcurrency'),
          numberRow('maxTasks'),
          numberRow('historyTurns'),
          numberRow('historyChars')),
        // --- Advanced (collapsed by default) ---
        h('details', { className: 'gw-adv', style: { border: '1px solid rgba(128,128,128,0.22)', background: 'rgba(128,128,128,0.03)', borderRadius: '12px', padding: '14px 20px' } },
          h('summary', { style: { cursor: 'pointer', fontWeight: 650, fontSize: '15px' } },
            `${t('advanced.title')} · ${t('advanced.default')}`),
          h('div', { className: 'gw-adv-body', style: { display: 'flex', flexDirection: 'column', marginTop: '4px' } },
            enumRow('answerStrategy'),
            h(FieldRow, {
              key: 'triageModel', fieldKey: 'triageModel',
              title: t('field.triageModel'), hint: t('field.triageModel.hint'),
              control: h(TriageModelPicker, { value: draft.triageModel, disabled, catalog, t, onChange: (next) => onChange('triageModel', next) }),
            }),
            enumRow('synthesis'),
            h(FieldRow, {
              key: 'switchOn', fieldKey: 'switchOn',
              title: t('field.switchOn'), hint: t('field.switchOn.hint'),
              control: h(ClassPicker, { value: draft.switchOn, disabled, onChange: (next) => onChange('switchOn', next), t }),
            }),
            booleanRow('recordRuns'),
            booleanRow('showProgress'),
            booleanRow('humanSummary'),
            booleanRow('showDiagnostics'),
            numberRow('recordLimit'),
            numberRow('maxQueuedMessages'),
            numberRow('maxActiveRuns'),
            numberRow('maxActiveRunsTotal'),
            h(FieldRow, {
              key: 'subagentProvider', fieldKey: 'subagentProvider',
              title: t('field.subagentProvider'), hint: t('field.subagentProvider.hint'),
              control: h(ScalarField, { field: fieldByKey('subagentProvider'), draft, disabled, onChange, t }),
            }))),
        // --- Danger ---
        h('div', { style: styles.danger },
          h('h3', { style: styles.heading }, t('danger.title')),
          h('p', { style: { ...styles.hint, margin: '0 0 4px' } }, t('danger.hint')),
          enumRow('gateScope'),
          h(FieldRow, {
            key: 'gatePreset', fieldKey: 'gatePreset',
            title: t('field.gatePreset'), hint: t('field.gatePreset.hint'),
            control: h(ScalarField, { field: fieldByKey('gatePreset'), draft, disabled, onChange, t }),
          })),
        // --- Structural (read-only) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.heading }, t('group.structural')),
          h('p', { style: { ...styles.hint, margin: '0 0 4px' } }, t('structural.hint')),
          READ_ONLY.map((key) => h('div', { key, style: styles.row, className: 'gw-row' },
            h('span', { style: styles.label },
              h('span', { style: styles.labelTitle }, t(`readonly.${key}`))),
            h('div', { style: styles.control },
              h('span', { style: { ...styles.mono, paddingTop: '6px', display: 'inline-block' }, 'data-readonly-key': key }, t(`readonlyValue.${key}`)))))),
        warnCombo
          ? h('div', { style: styles.warn },
            h('strong', null, t('warn.combo.title')),
            h('div', null, t('warn.combo.detail')))
          : null,
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
        errors.length > 0
          ? h('div', { style: styles.errorBox },
            h('ul', { style: { ...styles.error, margin: 0, paddingLeft: '18px' } },
              errors.map((error) => h('li', { key: errorId(error) }, formatError(error, t)))))
          : null,
        message !== undefined
          ? h('p', { style: { ...(message.kind === 'error' ? styles.error : styles.ok), margin: 0 } }, t(message.key, message.params))
          : null,
        h('div', { style: styles.footer },
          h('button', {
            type: 'button', style: styles.primary, disabled: disabled || errors.length > 0 || ops.length === 0,
            onClick: save, 'data-action': 'save',
          }, saving ? t('action.saving') : (ops.length > 0 ? t('action.saveCount', { count: ops.length }) : t('action.save'))),
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
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
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
    /** `localStorage` key holding the reader's zoom factor. */
    const PROGRESS_ZOOM_KEY = 'dsh.gw.progress.zoom'
    /** Zoom bounds; one tenth per press, which is what a reader can see change. */
    const PROGRESS_ZOOM_MIN = 0.8
    const PROGRESS_ZOOM_MAX = 1.6
    const PROGRESS_ZOOM_STEP = 0.1

    /** The four event types the tab folds; anything else is ignored (never guessed at). */
    const PROGRESS_EVENT_TYPES = [
      'tool-workflow/run-start',
      'tool-workflow/agent-start',
      'tool-workflow/agent-end',
      'tool-workflow/run-end',
    ]

    /**
     * The track's fixed spine: the process template of a staged delivery job.
     *
     * It is a template, not a claim: a stage whose token no recorded phase carries stays
     * `pending` and its tooltip says the events did not report it.
     */
    const PROGRESS_STAGES = [
      { key: 'start', tokens: [], edge: true },
      { key: 'sync', tokens: ['同步', 'sync'], edge: false },
      { key: 'triage', tokens: ['排查', '诊断', 'triage'], edge: false },
      { key: 'fix', tokens: ['修复', 'fix'], edge: false },
      { key: 'ui', tokens: ['ui', '界面'], edge: false },
      { key: 'device', tokens: ['真机', '实机', 'device'], edge: false },
      { key: 'cleanup', tokens: ['清理', 'cleanup'], edge: false },
      { key: 'push', tokens: ['push', 'tag', '推送', '发布'], edge: false },
      { key: 'end', tokens: [], edge: true },
    ]

    /** The seven fields a settled stage reports, in render order. */
    const PROGRESS_DETAIL_FIELDS = ['files', 'commands', 'result', 'evidence', 'risks', 'next', 'owner']

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

    /** Read the known detail fields out of one record. */
    function progressPickFields(source) {
      const fields = {}
      for (const key of PROGRESS_DETAIL_FIELDS) {
        const text = progressFieldText(source[key])
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
          startedAt: record.time,
        })
      }
      index = 0
      for (const record of records) {
        const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index
        index += 1
        const data = progressRecord(record.data) || {}
        const runId = typeof data.runId === 'string' ? data.runId : undefined
        if (runId === undefined || PROGRESS_EVENT_TYPES.indexOf(record.type) === -1) continue
        const draft = drafts.get(runId)
        if (draft === undefined) continue
        if (seq < draft.anchorSeq) draft.anchorSeq = seq
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
     * State of one stage, in the fixed precedence
     * `failed` → `doing` → `done` → `blocked` → `cancelled` → `pending`.
     *
     * `blocked` is derived (a run that ended over a row it never settled, or an outcome
     * that is neither a completion nor a cancellation) and the tooltip names the evidence;
     * `cancelled` is the engine's own word, never derived from an absence.
     */
    function progressNodeState(members, ended) {
      const settled = members.filter((member) => member.outcome !== undefined)
      const unsettled = members.length - settled.length
      if (members.some((member) => member.outcome === 'failed')) return 'failed'
      if (!ended && unsettled > 0) return 'doing'
      if (members.length > 0 && settled.length === members.length && settled.every((member) => member.outcome === 'completed')) return 'done'
      if (ended && unsettled > 0) return 'blocked'
      if (members.some((member) => member.outcome === 'cancelled')) return 'cancelled'
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

    /** The first spine stage whose token appears in a phase header. */
    function progressStageForPhase(phase) {
      const haystack = phase.toLowerCase()
      for (const stage of PROGRESS_STAGES) {
        if (stage.edge) continue
        for (const token of stage.tokens) {
          if (haystack.indexOf(token.toLowerCase()) !== -1) return stage
        }
      }
      return undefined
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
      const node = (stage, key, kind, members, phases, label) => {
        const state = stage !== undefined && stage.edge ? edgeState(stage.key) : progressNodeState(members, ended)
        const reason = state === 'blocked' ? progressBlockedReason(members, ended) : undefined
        return {
          key,
          kind,
          label: label !== undefined ? label : (stage === undefined ? key : labelFor(stage.key)),
          state,
          members,
          phases,
          derived: state === 'blocked',
          reason,
        }
      }
      const nodes = []
      for (const stage of PROGRESS_STAGES) {
        nodes.push(node(stage, `stage:${stage.key}`, stage.edge ? 'edge' : 'stage', byStage.get(stage.key) || [], byStagePhases.get(stage.key) || []))
        // Extra phases are real plan tasks: they sit with the work stages, before the
        // template's closing stages, in the order the run started them. A row that
        // declared no phase still gets a node, so the track and the percentage never
        // count different rows.
        if (stage.key === 'device') {
          for (const extra of extras) nodes.push(node(undefined, `phase:${extra.phase}`, 'extra', extra.members, [extra.phase], extra.phase))
          if (unphased.length > 0) nodes.push(node(undefined, 'phase:', 'extra', unphased, [], ''))
        }
      }
      return {
        runId: run.runId,
        name: run.name,
        ended,
        stopReason: run.stopReason,
        nodes,
        percent: progressPercent(run.members),
      }
    }

    /**
     * Parse a coordination block out of child-session text.
     *
     * Only an explicit block is accepted: a fenced `grok-coordination` block, or a fenced
     * `json` block carrying the coordination object or at least two of the seven fields.
     * Prose is not structured data, and this function never promotes it into evidence.
     */
    function parseProgressCoordination(text) {
      if (typeof text !== 'string' || text === '') return undefined
      const fenced = /```([A-Za-z-]*)[^\n]*\n([\s\S]*?)```/g
      let match
      while ((match = fenced.exec(text)) !== null) {
        const language = (match[1] || '').toLowerCase()
        if (language !== 'grok-coordination' && language !== 'json') continue
        let parsed
        try {
          parsed = JSON.parse(match[2] || '')
        } catch {
          continue
        }
        const record = progressRecord(parsed)
        if (record === undefined) continue
        const nested = progressRecord(record.coordination)
        const fields = progressPickFields(nested === undefined ? record : nested)
        const known = Object.keys(fields).length
        if (known === 0) continue
        if (nested === undefined && language !== 'grok-coordination' && known < 2) continue
        return { fields, raw: (match[2] || '').trim() }
      }
      return undefined
    }

    /**
     * Resolve the seven detail fields, strongest source first
     * (`stage-detail` event → child coordination block → not reported).
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

    /** Format one duration for the engine-facts section; `undefined` when it was not measured. */
    function progressDuration(ms) {
      if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined
      if (ms < 1000) return `${Math.round(ms)} ms`
      const seconds = ms / 1000
      if (seconds < 60) return `${seconds.toFixed(1)} s`
      const minutes = Math.floor(seconds / 60)
      return `${minutes} m ${Math.round(seconds - minutes * 60)} s`
    }

    /** The zoom factor a reader left behind, clamped to the supported range. */
    function readProgressZoom() {
      try {
        const stored = globalThis.localStorage === undefined ? undefined : globalThis.localStorage.getItem(PROGRESS_ZOOM_KEY)
        const value = stored === null || stored === undefined ? Number.NaN : Number(stored)
        if (!Number.isFinite(value)) return 1
        return Math.min(PROGRESS_ZOOM_MAX, Math.max(PROGRESS_ZOOM_MIN, value))
      } catch {
        return 1
      }
    }

    /** Persist the zoom factor; a storage that refuses costs the preference, not the tab. */
    function writeProgressZoom(value) {
      try {
        if (globalThis.localStorage !== undefined) globalThis.localStorage.setItem(PROGRESS_ZOOM_KEY, String(value))
      } catch {
        /* private mode / quota: the in-memory factor still applies for this session */
      }
    }

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
      '  font-family: var(--dsw-font-family-sans, inherit); font-size: calc(13px * var(--gw-zoom, 1)); }',
      '.gw-progress-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 4px 0; }',
      '.gw-progress-title { margin: 0; font-size: calc(14px * var(--gw-zoom, 1)); font-weight: 600; }',
      '.gw-progress-percent { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary, inherit); }',
      '.gw-progress-zoom { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; }',
      '.gw-progress-zoom button { min-width: 28px; min-height: 28px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 8px;',
      '  background: transparent; color: inherit; font: inherit; cursor: pointer; }',
      '.gw-progress-track { display: flex; align-items: flex-start; gap: 18px; height: 96px; box-sizing: border-box;',
      '  overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; padding: 10px 12px 4px; margin: 0; list-style: none; }',
      '.gw-progress-node { flex: 0 0 auto; scroll-snap-align: center; width: 84px; display: flex; flex-direction: column;',
      '  align-items: center; gap: 6px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }',
      '.gw-progress-node:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 4px; border-radius: 8px; }',
      '.gw-progress-ring { box-sizing: border-box; width: 28px; height: 28px; border-radius: 50%; display: flex;',
      '  align-items: center; justify-content: center; border: 2px solid var(--dsw-alias-state-idle-primary);',
      '  background: var(--dsw-alias-bg-layer-1, transparent); font-size: calc(11px * var(--gw-zoom, 1)); }',
      '.gw-progress-node[data-state="doing"] .gw-progress-ring { border-color: var(--dsw-alias-state-business-primary); animation: gw-progress-pulse 1.6s ease-in-out infinite; }',
      '.gw-progress-node[data-state="done"] .gw-progress-ring { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-node[data-state="failed"] .gw-progress-ring { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }',
      '.gw-progress-node[data-state="blocked"] .gw-progress-ring,',
      '.gw-progress-node[data-state="cancelled"] .gw-progress-ring { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }',
      '.gw-progress-node[data-selected="true"] .gw-progress-ring { box-shadow: 0 0 0 4px var(--dsw-alias-fill-l2, transparent); }',
      '.gw-progress-label { max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.gw-progress-detail { position: absolute; z-index: 30; top: 96px; left: 12px; right: 12px; max-width: 560px;',
      '  box-sizing: border-box; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 12px;',
      '  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, transparent)); }',
      '.gw-progress-detail h4 { margin: 10px 0 4px; font-size: calc(12px * var(--gw-zoom, 1)); font-weight: 600; }',
      '.gw-progress-detail-head { display: flex; align-items: center; gap: 8px; }',
      '.gw-progress-detail-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.gw-progress-facts { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 10px; }',
      '.gw-progress-facts dt { color: var(--dsw-alias-label-secondary, inherit); }',
      '.gw-progress-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere;',
      '  font-family: var(--dsw-font-family-mono, ui-monospace, monospace); font-size: calc(12px * var(--gw-zoom, 1)); }',
      '.gw-progress-row { border-top: 1px solid var(--dsw-alias-border-l2, currentColor); padding-top: 6px; margin-top: 6px; }',
      '.gw-progress-field { display: grid; grid-template-columns: minmax(72px, max-content) minmax(0, 1fr) max-content; gap: 4px 10px; align-items: baseline; }',
      '.gw-progress-field-value { min-width: 0; overflow-wrap: anywhere; }',
      '.gw-progress-source { color: var(--dsw-alias-label-secondary, inherit); font-size: calc(11px * var(--gw-zoom, 1)); }',
      '.gw-progress-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }',
      '.gw-progress-actions button { min-height: 28px; padding: 2px 10px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 8px;',
      '  background: transparent; color: inherit; font: inherit; cursor: pointer; }',
      '.gw-progress-empty { padding: 12px 4px; color: var(--dsw-alias-label-secondary, inherit); }',
      '@keyframes gw-progress-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }',
      // Motion is decoration here: the state word already says "running".
      '@media (prefers-reduced-motion: reduce) { .gw-progress-node[data-state="doing"] .gw-progress-ring { animation: none; } }',
      '@media (max-width: 720px) { .gw-progress-track { gap: 12px; } .gw-progress-node, .gw-progress-label { width: 72px; max-width: 72px; } }',
      '@media (max-width: 480px) {',
      '  .gw-progress-detail { position: fixed; top: auto; left: 0; right: 0; bottom: 0; max-width: none;',
      '    border-radius: 12px 12px 0 0; max-height: 60vh; overflow-y: auto; }',
      '  .gw-progress-field { grid-template-columns: minmax(0, 1fr); }',
      '}',
    ].join('\n')

    /**
     * One track node.
     * @param node - derived node model.
     * @param props - render inputs (copy, roving tabindex, selection, handler).
     * @returns the node button.
     */
    function ProgressNode(node, props) {
      const t = props.t
      const stateText = t(PROGRESS_STATE_KEY[node.state])
      const label = node.label === '' ? t('progress.unphased') : node.label
      const tip = node.state === 'blocked' && node.reason !== undefined
        ? t(`progress.derived.${node.reason}`)
        : (node.phases.length > 0 ? node.phases.join(' · ') : (node.kind === 'extra' ? t('progress.extraHint') : t('progress.notReported')))
      return h('button', {
        key: node.key,
        type: 'button',
        className: 'gw-progress-node',
        'data-gw-progress-node': true,
        'data-node-key': node.key,
        'data-kind': node.kind,
        'data-state': node.state,
        'data-derived': node.derived ? 'true' : undefined,
        'data-selected': props.selected ? 'true' : undefined,
        tabIndex: props.tabIndex,
        title: tip,
        'aria-label': `${label} · ${stateText}`,
        'aria-expanded': props.selected,
        onClick: () => props.onSelect(node.key),
      },
      h('span', { className: 'gw-progress-ring', style: { borderColor: PROGRESS_STATE_COLOR[node.state] }, 'aria-hidden': 'true' },
        node.members.length > 1 ? node.members.length : null),
      h('span', { className: 'gw-progress-label', 'data-gw-progress-label': true, title: label }, label))
    }

    /**
     * The detail popover: three sections, in the order a reader needs them.
     *
     * 1. the header (which stage, which state),
     * 2. the engine facts, verbatim per row (`runId`, `seq`, label, phase, childId,
     *    outcome, duration) — nothing here is interpreted,
     * 3. the stage report's seven fields with the source of each value, and the two
     *    actions a reader can take: copy the coordination block, open a child session.
     * @param props - selected node plus the faces the tab injected.
     * @returns the popover element.
     */
    function ProgressDetail(props) {
      const t = props.t
      const node = props.node
      const report = props.report
      const stateText = t(PROGRESS_STATE_KEY[node.state])
      const sourceKey = (source) => (source === 'not-reported' ? 'notReported' : (source === 'stage-detail' ? 'stageDetail' : 'coordination'))
      const fields = report.fields.map((field) => h('div', {
        key: field.key,
        className: 'gw-progress-field',
        'data-gw-progress-field': field.key,
        'data-source': field.source,
      },
      h('span', { className: 'gw-progress-field-label' }, t(`progress.field.${field.key}`)),
      h('span', { className: 'gw-progress-field-value', 'data-gw-progress-value': true },
        field.value === undefined ? t('progress.none') : field.value),
      h('span', { className: 'gw-progress-source', 'data-gw-progress-source': sourceKey(field.source) }, t(`progress.source.${sourceKey(field.source)}`))))
      const rows = node.members.map((member) => {
        const duration = progressDuration(member.startedAt === undefined || member.endedAt === undefined ? undefined : member.endedAt - member.startedAt)
        const facts = [
          ['progress.detail.seq', String(member.seq)],
          ['progress.detail.label', member.label === '' ? t('progress.none') : member.label],
          ['progress.detail.phase', member.phase === undefined ? t('progress.none') : member.phase],
          ['progress.detail.childId', member.childId === '' ? t('progress.none') : member.childId],
          ['progress.detail.outcome', member.outcome === undefined ? t(PROGRESS_STATE_KEY.doing) : member.outcome],
          ['progress.detail.duration', duration === undefined ? t('progress.none') : duration],
        ]
        const canOpen = member.childId !== '' && props.canOpen(member.childId)
        return h('div', { key: String(member.seq), className: 'gw-progress-row', 'data-gw-progress-row': member.seq },
          h('dl', { className: 'gw-progress-facts' }, facts.flatMap(([key, value]) => [
            h('dt', { key: `${key}:t` }, t(key)),
            h('dd', { key: `${key}:d`, 'data-gw-progress-fact': key }, value),
          ])),
          canOpen
            ? h('button', {
              type: 'button',
              'data-gw-progress-open': true,
              onClick: () => props.openChild(member.childId),
            }, t('progress.detail.open'))
            : null)
      })
      const copyable = report.coordinationRaw !== undefined
      return h('div', {
        className: 'gw-progress-detail',
        'data-progress-detail': true,
        role: 'group',
        'aria-label': t('progress.detail.title'),
      },
      h('div', { className: 'gw-progress-detail-head' },
        h('strong', { 'data-detail-title': true }, node.label === '' ? t('progress.unphased') : node.label),
        h('span', { className: 'gw-progress-percent', 'data-detail-state': node.state }, stateText),
        h('button', {
          type: 'button',
          style: { marginLeft: 'auto' },
          'data-gw-progress-close': true,
          'aria-label': t('progress.detail.close'),
          onClick: () => props.onClose(),
        }, t('progress.detail.close'))),
      h('h4', null, t('progress.detail.engine')),
      h('dl', { className: 'gw-progress-facts' },
        h('dt', null, t('progress.detail.runId')),
        h('dd', { 'data-detail-run-id': true }, props.runId),
        h('dt', null, t('progress.detail.rows', { count: node.members.length })),
        h('dd', null, node.phases.length === 0 ? t('progress.none') : node.phases.join(' · '))),
      rows.length === 0 ? h('p', { className: 'gw-progress-source' }, t('progress.notReported')) : rows,
      h('h4', null, t('progress.detail.stage')),
      fields,
      h('div', { className: 'gw-progress-actions' },
        h('button', {
          type: 'button',
          'data-gw-progress-copy': true,
          disabled: !copyable,
          title: copyable ? t('progress.detail.copy') : t('progress.detail.noBlock'),
          onClick: () => props.onCopy(),
        }, props.copy === 'copied' ? t('progress.detail.copied') : (props.copy === 'failed' ? t('progress.detail.copyFailed') : t('progress.detail.copy')))))
    }

    /**
     * The "进度" view.
     *
     * Props come from the slot's injected faces (`useGrokProgress`, `progressT`,
     * `canOpen`, `openChild`, `detailSources`) plus the framework seat `t`. The component
     * never reads the DOM for data and never fetches: everything it renders is the folded
     * event stream plus its own view state (zoom, selection, copy status).
     * @param props - slot props.
     * @returns the tab element.
     */
    function ProgressView(props) {
      const t = guardedTranslator(props.t, typeof props.progressT === 'function' ? props.progressT : translator(FALLBACK_LOCALE))
      const snapshot = props.useGrokProgress === undefined ? EMPTY_PROGRESS_SNAPSHOT : props.useGrokProgress((value) => value)
      const track = useMemo(
        () => deriveProgressTrack(snapshot === undefined ? undefined : snapshot.activeRun, (key) => t(`progress.stage.${key}`)),
        [snapshot, props.t, props.progressT],
      )
      const [zoom, setZoom] = useState(readProgressZoom)
      const [selectedKey, setSelectedKey] = useState(undefined)
      const [focusedKey, setFocusedKey] = useState(undefined)
      const [copy, setCopy] = useState('idle')
      const nodes = track === undefined ? [] : track.nodes
      const selected = selectedKey === undefined ? undefined : nodes.find((node) => node.key === selectedKey)
      const rovingKey = focusedKey === undefined ? (nodes.length === 0 ? undefined : nodes[0].key) : focusedKey
      const applyZoom = (next) => {
        const value = Math.min(PROGRESS_ZOOM_MAX, Math.max(PROGRESS_ZOOM_MIN, Math.round(next * 10) / 10))
        setZoom(value)
        writeProgressZoom(value)
      }
      const onKeyDown = (event) => {
        const keys = nodes.map((node) => node.key)
        if (keys.length === 0) return
        const at = keys.indexOf(rovingKey)
        let next = at
        if (event.key === 'ArrowRight') next = Math.min(keys.length - 1, at + 1)
        else if (event.key === 'ArrowLeft') next = Math.max(0, at - 1)
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = keys.length - 1
        else return
        if (typeof event.preventDefault === 'function') event.preventDefault()
        setFocusedKey(keys[next])
        // Roving tabindex means focus has to follow the selection, and only the DOM can
        // move it; the guard keeps a headless render (tests) harmless.
        const root = event.currentTarget
        if (root !== undefined && root !== null && typeof root.querySelectorAll === 'function') {
          const target = root.querySelectorAll('[data-gw-progress-node]')[next]
          if (target !== undefined && typeof target.focus === 'function') target.focus()
        }
      }
      const detailSources = selected === undefined || typeof props.detailSources !== 'function' ? {} : (props.detailSources(selected) || {})
      const report = selected === undefined ? undefined : progressDetailFor(detailSources)
      const copyBlock = async () => {
        const raw = report === undefined ? undefined : report.coordinationRaw
        try {
          if (raw === undefined || globalThis.navigator === undefined || globalThis.navigator.clipboard === undefined) throw new Error('no coordination block')
          await globalThis.navigator.clipboard.writeText(raw)
          setCopy('copied')
        } catch {
          setCopy('failed')
        }
      }
      const canOpen = typeof props.canOpen === 'function' ? props.canOpen : () => false
      const header = h('div', { className: 'gw-progress-head' },
        h('h3', { className: 'gw-progress-title' }, t('progress.title')),
        track === undefined || track.percent === undefined
          ? h('span', { className: 'gw-progress-percent', 'data-progress-percent': 'none' }, t('progress.unsettled'))
          : h('span', {
            className: 'gw-progress-percent',
            'data-progress-percent': track.percent.value,
            title: t('progress.percentHint', { settled: track.percent.settled, declared: track.percent.declared }),
          }, t('progress.percent', { settled: track.percent.settled, declared: track.percent.declared, percent: track.percent.value })),
        h('span', { className: 'gw-progress-zoom' },
          h('button', { type: 'button', 'data-progress-zoom': 'out', 'aria-label': t('progress.zoomOut'), onClick: () => applyZoom(zoom - PROGRESS_ZOOM_STEP) }, '−'),
          h('button', { type: 'button', 'data-progress-zoom': 'reset', 'aria-label': t('progress.zoomReset'), onClick: () => applyZoom(1) }, '1×'),
          h('button', { type: 'button', 'data-progress-zoom': 'in', 'aria-label': t('progress.zoomIn'), onClick: () => applyZoom(zoom + PROGRESS_ZOOM_STEP) }, '+')))
      return h('section', {
        className: 'gw-progress',
        'data-gw-progress': true,
        'data-gw-zoom': zoom,
        style: { '--gw-zoom': String(zoom), fontSize: `calc(13px * ${zoom})` },
      },
      // Scoped stylesheet, rendered in the tab's own tree: React removes it when the tab
      // unmounts, and every rule is scoped to `.gw-progress`, so nothing leaks either way.
      h('style', { 'data-gw-progress-css': true }, PROGRESS_CSS),
      header,
      track === undefined
        ? h('div', { className: 'gw-progress-empty', 'data-progress-empty': true },
          h('strong', null, t('progress.empty.title')),
          h('p', { style: { margin: '4px 0 0' } }, t('progress.empty.body')))
        : h('div', {
          className: 'gw-progress-track',
          role: 'group',
          'aria-label': t('progress.aria'),
          'data-gw-progress-track': true,
          onKeyDown,
        }, nodes.map((node) => ProgressNode(node, {
          t,
          selected: selected !== undefined && selected.key === node.key,
          tabIndex: node.key === rovingKey ? 0 : -1,
          onSelect: (key) => { setSelectedKey(key); setFocusedKey(key); setCopy('idle') },
        }))),
      selected === undefined || report === undefined ? null : ProgressDetail({
        t,
        node: selected,
        report,
        runId: track.runId,
        copy,
        canOpen,
        openChild: (childId) => { if (typeof props.openChild === 'function') props.openChild(childId) },
        onCopy: copyBlock,
        onClose: () => { setSelectedKey(undefined); setCopy('idle') },
      }))
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
          ...(state.stopReason === undefined ? [] : [{ type: 'tool-workflow/run-end', data: { runId: state.runId, stopReason: state.stopReason }, time: state.endedAt }]),
          { type: match.event.type, data: match.event.data, time: match.event.time },
        ]
        const run = foldProgressEvents(records)[0]
        if (run === undefined) return state
        return {
          runId: run.runId,
          name: run.name,
          members: run.members,
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
            // The two stronger detail sources are wired, not faked: today the recorder
            // writes no `stage-detail` event and no child text is reachable from a view,
            // so the ladder lands on "not reported" and says so.
            detailSources: () => ({}),
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
      return teardown
    }

    exports.apply = apply
    exports.inject = inject
    exports.NS = NS
    exports.GROK_WORKFLOW_FIELDS = FIELDS
    exports.GROK_WORKFLOW_READ_ONLY = READ_ONLY
    exports.GROK_WORKFLOW_ROLES = ROLES
    exports.GROK_WORKFLOW_SWITCHABLE_CLASSES = SWITCHABLE_CLASSES
    exports.GROK_WORKFLOW_GROUPS = GROUPS
    exports.GROK_WORKFLOW_LOCALES = LOCALES
    exports.GROK_WORKFLOW_DICT = DICT
    exports.GROK_WORKFLOW_CHAIN_LIMIT = CHAIN_LIMIT
    exports.GROK_WORKFLOW_ROUTE_INFLIGHT_MIN = ROUTE_INFLIGHT_MIN
    exports.GROK_WORKFLOW_ROUTE_INFLIGHT_MAX = ROUTE_INFLIGHT_MAX
    /** Internals pinned by test/client.spec.ts (no runtime caller). */
    exports.GROK_WORKFLOW_INTERNALS = {
      validate, formatError, opsFor, draftOf, resolveNamespace, translate, translator, activeLocale,
      comboWarn, emptyCapWarn, limitOverrunWarn,
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
      zoomKey: PROGRESS_ZOOM_KEY,
      zoom: { min: PROGRESS_ZOOM_MIN, max: PROGRESS_ZOOM_MAX, step: PROGRESS_ZOOM_STEP },
      eventTypes: PROGRESS_EVENT_TYPES,
      stages: PROGRESS_STAGES,
      detailFields: PROGRESS_DETAIL_FIELDS,
      stateColor: PROGRESS_STATE_COLOR,
      stateKey: PROGRESS_STATE_KEY,
      css: PROGRESS_CSS,
      component: ProgressView,
      eventDefinition: progressEventDefinition,
      viewDefinition: progressViewDefinition,
      Builder: ProgressSnapshotBuilder,
      mount: mountProgress,
      fold: foldProgressEvents,
      selectActiveRun,
      nodeState: progressNodeState,
      percent: progressPercent,
      deriveTrack: deriveProgressTrack,
      detailFor: progressDetailFor,
      parseCoordination: parseProgressCoordination,
      duration: progressDuration,
      readZoom: readProgressZoom,
      writeZoom: writeProgressZoom,
      createStatus: createProgressStatus,
    }
    return module.exports
  },
})
