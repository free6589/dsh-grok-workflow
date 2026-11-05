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
      { key: 'answerStrategy', group: 'gate', kind: 'enum', options: ['in-turn', 'relay', 'append'], def: 'in-turn' },
      { key: 'historyTurns', group: 'limits', kind: 'number', min: 0, max: 1000000, def: 12 },
      { key: 'historyChars', group: 'limits', kind: 'number', min: 0, max: 1000000, def: 20000 },
      { key: 'maxQueuedMessages', group: 'limits', kind: 'number', min: 0, max: 8, def: 4 },
      { key: 'maxConcurrency', group: 'limits', kind: 'number', min: 1, max: 1000000, def: 4 },
      { key: 'maxRetries', group: 'limits', kind: 'number', min: 0, max: 10, def: 2 },
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
      'roles.capPlaceholder': '1-64, blank = unlimited',
      'roles.capHint': 'Max calls at once on this route. A full route overflows to the next one; it never fails, it just yields.',
      'roles.providerPlaceholder': 'Pick a channel…',
      'roles.modelPlaceholder': 'Pick a model… (blank = easiest)',
      'roles.manualProvider': 'or type a channel…',
      'roles.manualModel': 'or type a model id…',
      'roles.noModels': 'This channel lists no models',
      'roles.noCatalog': 'No model list from the runtime — type it by hand.',
      'roles.firstRowHint': 'Blank = use the model you are talking to. Easiest, leave it.',

      'warn.combo.title': 'Long chains plus many retries can run very long.',
      'warn.combo.detail': 'This is a heads-up, not a block: saving still works.',

      'action.save': 'Save',
      'action.saveCount': 'Save ({count})',
      'action.saving': 'Saving…',
      'action.discard': 'Discard',

      'status.saved': 'Saved; applies to the next message.',
      'status.refused': 'The Host refused this write (a value is invalid or the key is read-only).',
      'status.writeFailed': 'Write failed: {message}',
      'status.loading': 'Loading…',
      'status.unavailable': 'The Host does not serve the grok-workflow settings namespace (is the plugin active?)',
      'status.revision': 'revision {revision}',

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
      'roles.capPlaceholder': '1-64，空=不限',
      'roles.capHint': '这条路由同时在飞的调用上限。打满就用下一条，不算失败，只是让路。',
      'roles.providerPlaceholder': '选哪家…',
      'roles.modelPlaceholder': '选用哪个…（留空最省事）',
      'roles.manualProvider': '或手填通道…',
      'roles.manualModel': '或手填模型 id…',
      'roles.noModels': '这家没列出模型',
      'roles.noCatalog': '读不到运行时模型目录，手填即可。',
      'roles.firstRowHint': '留空 = 用跟你对话的模型，最省事。',

      'warn.combo.title': '备用链很长、重试又高，跑起来会很久。',
      'warn.combo.detail': '只是提醒，不拦保存。',

      'action.save': '保存',
      'action.saveCount': '保存 ({count})',
      'action.saving': '保存中…',
      'action.discard': '放弃修改',

      'status.saved': '已保存，下一条消息生效。',
      'status.refused': 'Host 拒绝了这次写入（值不合法或键不可写）。',
      'status.writeFailed': '写入失败：{message}',
      'status.loading': '读取中…',
      'status.unavailable': 'Host 未提供 grok-workflow 设置命名空间（插件未激活？）',
      'status.revision': 'revision {revision}',

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
      control: { minWidth: 0, paddingTop: '6px' },
      input: { width: '100%', minWidth: 0, boxSizing: 'border-box', height: '32px', padding: '0 10px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '13px' },
      narrow: { maxWidth: '220px' },
      statusOn: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '4px', border: '1px solid #bfe6cc', background: '#e9f7ef', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' },
      statusOff: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '4px', border: '1px solid rgba(128,128,128,0.28)', background: 'rgba(128,128,128,0.08)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' },
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
      footer: { display: 'flex', gap: '8px', alignItems: 'center', position: 'sticky', bottom: 0, padding: '12px 0', marginTop: '4px', borderTop: `1px solid ${HAIRLINE}`, background: 'var(--dsh-settings-footer-bg, rgba(128,128,128,0.12))', backdropFilter: 'blur(8px)' },
      error: { color: '#e5484d' },
      errorBox: { background: 'rgba(229,72,77,0.07)', border: '1px solid rgba(229,72,77,0.35)', borderRadius: '10px', padding: '10px 14px' },
      empty: { display: 'block', border: '1px dashed rgba(128,128,128,0.4)', borderRadius: '8px', padding: '10px 12px', background: 'transparent' },
      ok: { color: '#2f9e44' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' },
    }

    // One injected rule set for what inline styles cannot express: hairline
    // dividers between stacked rows (`.gw-row + .gw-row`), the disclosure
    // marker for the collapsed group, and its inner indent.
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

    function useNamespace(face, defaultNs) {
      const snapshot = useSyncExternalStore(
        (listener) => face.subscribe(listener),
        () => face.getSnapshot(),
        () => face.getSnapshot(),
      )
      const view = snapshot.view
      const resolved = resolveNamespace(view, defaultNs)
      const entry = view === undefined ? undefined : view.namespaces.find((candidate) => candidate.ns === resolved.ns)
      return {
        status: entry === undefined ? (snapshot.status === 'ready' ? 'unavailable' : 'loading') : 'ready',
        entry,
        error: snapshot.error,
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
        h('div', { style: styles.chain },
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
      const dot = !on ? '#9aa0a6' : (full ? '#3b6ef6' : '#2f9e44')
      return h('div', { style: !on ? styles.statusOff : styles.statusOn },
        h('span', { style: { ...styles.statusDot, background: dot } }),
        h('strong', null, t(key)),
        h('span', { style: { marginLeft: '8px', opacity: 0.75, fontSize: '12px' } }, t(detailKey)))
    }

    function GrokWorkflowPage(props) {
      // `t` is the framework's locale seat when the registration declared `locale: NS`
      // (it re-derives on every locale revision), and the bundle's own translator when the
      // composition has no locale plugin.
      const t = typeof props.t === 'function'
        ? props.t
        : (typeof props.translateOwn === 'function' ? props.translateOwn : translator('en'))
      // The plugin manager renders this same registration twice: once as the card's
      // one-line description (`view: 'summary'`) and once as the detail page.
      if (props.view === 'summary') {
        return t('card.summary')
      }
      const namespace = useNamespace(props.face, props.defaultNs === undefined ? NS : props.defaultNs)
      const form = props.getForm(namespace.ns)
      const entry = namespace.entry
      const value = entry === undefined ? undefined : entry.value
      const [draft, setDraft] = useState(() => draftOf(value))
      const [saving, setSaving] = useState(false)
      const [message, setMessage] = useState(undefined)
      // Re-seed the draft whenever the Host publishes a different document revision.
      const revision = entry === undefined ? undefined : entry.revision
      const stamp = `${String(revision)}:${namespace.status}`
      useEffect(() => { setDraft(draftOf(value)) }, [stamp])
      const errors = useMemo(() => validate(draft), [draft])
      const ops = useMemo(() => opsFor(draft, value), [draft, value])
      const warnCombo = useMemo(() => comboWarn(draft), [draft])
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

      if (namespace.status === 'unavailable') {
        return h('p', { style: styles.hint }, t('status.unavailable'))
      }
      if (namespace.status === 'loading' || value === undefined) {
        return h('p', { style: styles.hint }, t('status.loading'))
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
          h(StatusLine, { draft, t })),
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
      const i18n = { locale: undefined, t: translator(FALLBACK_LOCALE) }
      ctx.effect(() => { face.ensure().catch(() => undefined) }, 'grok-workflow: settings mirror read')

      let stop = startPages(ctx, face, i18n)
      const bound = () => {
        i18n.locale = undefined
        i18n.t = translator(FALLBACK_LOCALE)
        stop()
        stop = startPages(ctx, face, i18n)
      }

      if (typeof ctx.inject === 'function') {
        ctx.inject(['locale'], (scope) => {
          const locale = scope.locale
          i18n.locale = locale
          i18n.t = typeof locale.bind === 'function' ? locale.bind(NS) : translator(activeLocale(locale))
          ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'grok-workflow: dictionaries')
          // Remount so the slot carries `locale: NS`: the framework then seats a `t` the
          // renderer re-derives on every locale revision, and the page repaints in place.
          stop()
          stop = startPages(ctx, face, i18n)
          return () => bound()
        })
      } else {
        console.warn('[grok-workflow] this composition cannot inject services: the settings page keeps its English copy.')
      }
      return () => { stop() }
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
    }
    return module.exports
  },
})
