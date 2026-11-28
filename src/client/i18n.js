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

