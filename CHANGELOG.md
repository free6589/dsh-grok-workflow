# Changelog / 更新日志

Notable user-facing changes are recorded here in English and Simplified Chinese.
用户可见的功能和修复会在这里以英文和简体中文记录。

## [0.2.2] - 2026-10-28

Incremental release on top of the published `0.2.1`: the deadline became a real bound, model
routing became visible in every report, and a verified task stopped being failed for the
verifier's prose. Nothing here restates a `0.2.1` change.

**On "quality":** this release fixes a decision defect, it does not raise the quality of the
models. Measured in the test home before the fix: 12 reports — 1 `COMPLETED`, 8 failed for the
defect described under Fixed, 3 cancelled by deliberate probes (deadline / unload). With the
shipped default chains (one `deepseek-v4.1-flash` route per role, `maxRetries: 0`) a verifier
that reports a *blocking* problem still fails the task, and that is the intended behaviour. If
you want stricter or looser verification, that is a model choice
(`roles.verifier`), not something this release tunes for you.

`0.2.1` 之上的增量版本：截止时间成为真正的上限、模型路由在每份报告里可见、已通过的任务不再
因为 verifier 的一句散文备注被判失败；不重复 `0.2.1` 已经发布过的改动。

**关于"质量"：** 本版修的是**判定缺陷**，不是把模型变强。修复前测试 home 实测：12 份报告 ——
1 份 `COMPLETED`、8 份因 Fixed 里描述的缺陷失败、3 份是被刻意取消的探针（超时 / 卸载）。按默认
链（每角色一条 `deepseek-v4.1-flash`、`maxRetries: 0`），verifier 报告**阻塞性**问题时任务依然
会失败，这是预期行为。想要更严或更松的验证属于模型选择（`roles.verifier`），本版不替你调。

### Added / 新增
- **The Web GUI shows the run while it happens / Web 界面现在能看见工作流在跑。** The plugin
  writes the four session events the stock conversation panel folds into a **workflow-run
  node** (`tool-workflow/run-start`, `agent-start`, `agent-end`, `run-end` — the same family
  and the same payload fields the in-tree workflow tool writes, pinned by a contract test).
  A message now produces a live node ~60 ms after the turn opens — before any subagent
  exists, which is exactly the window that used to be empty — with one member row per
  subagent appearing and settling as the run proceeds (planner → workers → verifiers) and a
  terminal status (`Completed` / `Cancelled` / `Failed`) at the end. Measured on a real
  profile: node at ~0.26 s after Send, members 0 → 1 → 2 → 3, `run-start` written at turn
  level 78 s before the step opened, and a run stopped from the GUI closing as `cancelled`.
  / 插件写入会话面板折叠成 **工作流运行节点** 的四个事件（`tool-workflow/run-start`、
  `agent-start`、`agent-end`、`run-end`，事件族与字段形状与 in-tree 工作流工具完全一致，
  由契约测试钉死）。发一条消息后 **约 60 ms** 主窗口即出现运行节点——**早于任何子代理存在**，
  正是过去那段空白；成员行随子代理出现与结束逐条增长（planner → worker → verifier），
  结束时给出终态（已完成 / 已取消 / 失败）。真机实测：点发送后约 0.26 s 节点可见，成员
  0 → 1 → 2 → 3，`run-start` 写在 turn 级、比 step 出现早 78 s，GUI 上停止的运行以
  `cancelled` 收尾。
- **Settings: `showProgress` switch / 设置页新增 `showProgress` 开关。** One checkbox, on by
  default, in both languages: turn it off and the run writes nothing but its messages, so a
  session log carries no run events at all. That makes 23 configuration keys.
  / 设置页加一个默认开启的双语复选框：关掉后运行只写消息不写任何运行事件，会话日志里完全
  没有运行痕迹。配置面因此变为 23 个键。
- **Run name carries the task count when it is known / 已知任务数时，运行名带任务数。**
  A run started with a caller-supplied plan is titled `grok-workflow · 3 tasks` (the panel's
  title is the run name). A run that plans first keeps the bare name, because the count does
  not exist at the moment the node must appear — the panel's live member count covers it.
  / 调用方给了计划时运行名形如 `grok-workflow · 3 tasks`（面板标题就是运行名）；先规划后
  执行的运行保持裸名——节点出现的那一刻任务数还不存在，此时由面板的实时成员计数代替。

### Fixed / 修复
- **A verified task is no longer failed for the verifier's opinion / 已通过的任务不再因为
  verifier 的一句备注被判失败。** The task decision now belongs to the verifier's structured
  judgement — `verdict` plus one `criteria` entry per acceptance criterion with `met` and
  evidence. Its prose `issues` list used to override that judgement, so a verifier that said
  `pass` with every criterion met still failed the task for writing down a caveat. The cost was
  visible: in the test home **8 of 12 recorded reports failed for this reason** — including all
  five t46 acceptance rounds, whose notes say "non-blocking", "minor observation rather than a
  failure", "does not affect any acceptance criterion". A verified task's notes are now carried
  into the report's `Uncertainties` as `verifier note: …` instead of being turned into a
  failure, and the verifier prompt states that `issues` is for blocking problems only (residual
  doubt belongs in `confidence`). A criterion marked `met: false`, or `verdict: fail`, still
  fails the task — that part is unchanged and pinned by tests.
  / 任务判定回归 verifier 的**结构化判断**：`verdict`，加上每条验收标准一条带 `met` 与证据的
  `criteria`。此前它的散文字段 `issues` 会覆盖该判断——verifier 判定 `pass` 且每条标准都满足，
  只要它顺手写下一句保留意见，任务依然判失败。代价是实测的：测试 home **12 份报告里有 8 份**
  因此失败，包括 t46 的 5 轮验收，而那些备注自己写着"non-blocking"（非阻塞）、"minor
  observation rather than a failure"（只是小观察不是失败）、"不影响任何验收条款"。现在已通过
  任务的备注会以 `verifier note: …` 进入报告 `Uncertainties` 而不是变成失败，verifier 提示词
  也写明 `issues` 只用于**阻塞性问题**（残余疑虑请写 `confidence`）。`met: false` 或
  `verdict: fail` 仍然判失败——这部分没变，且有测试钉住。
- **The deadline is now the plugin's own hard bound, and it says so / 截止时间现在是插件自己
  的硬上限，并说明它的数值。** `timeoutMs` was enforced by aborting a signal and then waiting
  for the engine to settle; a measured run was still working minutes after its 60 s deadline,
  and its cancellation was reported as "cancelled by its caller" — pointing at the wrong actor.
  The run result now races the plugin's own deadline, so the caller always gets the timeout
  report on time, the cancel reason names the deadline it hit, and every report carries a
  `Deadline: <n> ms per run` line. / 过去的 `timeoutMs` 只是中断一个 signal 然后等引擎收尾；
  实测有运行在 60 s 截止后数分钟仍在工作，取消原因还写成"由调用方取消"，把责任指错了人。
  现在运行结果与插件自己的截止时间赛跑：调用方总能按时拿到超时报告，取消原因写明打中的
  截止值，每份报告带一行 `Deadline: <n> ms per run`。
- **`Model routes:` is always printed, and a failure report no longer claims `inherit` /
  报告始终打印 `Model routes:`，失败报告不再谎称 `inherit`。** The line used to be skipped
  whenever every configured chain was empty, so "nothing configured" and "the line is missing"
  looked identical; a timeout or unload report hard-coded an all-empty routing block even when
  the run had been handed a chain. Unset roles now say `inherit`, and failure reports derive
  their chains from the configuration in force. / 该行过去在所有角色链为空时被整行省略，
  "没配置"与"这行没打印"看起来一样；超时/卸载报告还用写死的空路由块，哪怕运行确实拿到了
  链。现在未配置的角色显示 `inherit`，失败报告按生效配置生成链。
- **An unload can finally be explained / 插件被卸载终于能查到原因。** When the plugin is
  unloaded, it now writes a `plugin:grok-workflow/dispose` record into every affected session
  *before* cancelling anything — time, uptime, trigger class (`management` / `shutdown` /
  `test` / `unknown`), the redacted call-site frames,
  how many runs were live, and each run's id and age — plus one diagnostics line. The
  cancelled report is also split by cause: a run killed by an unload now says so
  (`grok_workflow was cancelled because the plugin was unloaded while the run was in flight`),
  distinct from `cancelled by its caller`. Before this, two runs in two workspaces were
  cancelled 573 ms apart and the only trace was "was cancelled before it produced a report".
  The class is decided by a **signal probe**, not by guessing from the stack: the plugin
  subscribes to shutdown signals at load time and records any that arrive before disposal
  (a shutdown signal ⇒ `shutdown`). The redacted call-site frames are a tie-breaker only,
  because on a real instance both a SIGTERM and a settings-page toggle show nothing but
  cordis internals within the frame budget. `unknown` is a legitimate answer — an
  in-process unload on the test instance recorded `signals: []` and `trigger: unknown` —
  and the record always carries the raw material so the class can be re-derived.
  / 插件被卸载时，**先**写入 `plugin:grok-workflow/dispose` 记录再取消运行：时间、存活时长、
  触发类别（`management`/`shutdown`/`test`/`unknown`）、脱敏调用栈帧、
  当时活跃 run 数与每个 run 的 id 与时长，并输出一行诊断日志。取消报告同时按原因拆分：
  被卸载打断的运行明说"插件在运行期间被卸载"，与"被调用方取消"区分开。此前两个 workspace
  的 run 相隔 573 ms 被取消，唯一痕迹只有一句"was cancelled before it produced a report"。
  触发类别由**信号探针**决定而非从调用栈猜：插件加载时订阅关闭信号，并记录在卸载之前是否
  收到过（收到即 `shutdown`）。脱敏调用栈帧只作并列依据——真机上 SIGTERM 与设置页停用两者
  可见帧全是 cordis 内部帧，单靠栈只能答 `unknown`。`unknown` 是合法答案（测试实例上一次
  进程内卸载记录到 `signals: []`、`trigger: unknown`），记录里始终带着原始材料可复核。
- **A cut run tells the user through its report, and an idle disable stays silent /
  被切断的运行通过报告告知用户，空闲停用则完全安静。** If a run was actually interrupted, its
  session gets one notice row (no model call): what was interrupted, that the cause was an
  unload and not a deadline, and that messages until re-enable are answered directly. That row
  is **written to the session log but not rendered** by the stock conversation panel in DSH
  `0.2.1-rc.2` — it sits at a `(turn, step)` that never opens a step, and the panel starts an
  assistant row only on `step/start` — so the row's job is the ledger plus the next turn's
  context, and the **report is the user-visible channel**: the cancelled run's report names the
  unload as the cause. Disabling the plugin on purpose while nothing runs writes **nothing**
  into any session — a direct answer is the expected behaviour there.
  / 只有在**确有运行被切断**时，该会话才会写入一条提示行（不花模型调用）：说清被中断的工作、
  原因是卸载而非超时、以及恢复前的消息将直答。该行在 DSH `0.2.1-rc.2` 的原生会话面板里
  **只写入、不渲染**——它落在一个从未开启 step 的 `(turn, step)` 上，而面板只为 `step/start`
  开启助手行——因此它的作用是台账 + 下一轮上下文，**用户可见的告知通道是报告**：被取消那次
  运行的报告明说原因是插件卸载。**空闲**时停用插件（用户有意为之）不向任何会话写入任何内容
  ——此时直答就是预期行为。
- **One session can no longer starve the others / 一个会话不再能饿死其它会话。** The active-run
  cap is now per session (`maxActiveRuns`, default 2) with a process-wide backstop
  (`maxActiveRunsTotal`, default 8), and a refusal names the holders: `already has 2 active
  run(s) in this session; maxActiveRuns is 2 per session (holding: run 3f5c… (running 14m38s),
  run 9b02… (running 2m01s))`. Measured before the fix: two long runs in one session refused
  three other sessions across three workspaces.
  / 并发槽位改为**按会话**（`maxActiveRuns`，默认 2）+ 进程级兜底（`maxActiveRunsTotal`，默认 8），
  拒绝文案写明占槽者（run id 与已跑时长）。修复前实测：一个会话两个长 run 拒掉了三个 workspace 的
  三个会话。
- **Default deadline raised to 60 minutes / 默认超时提高到 60 分钟。** The 30-minute default was
  measured to be a knife-edge, not a margin: two four-task runs were killed at 30m00s and
  30m01s, while real four-task runs finish in 878 s / 1148 s / 1801 s. Hard ceiling unchanged
  (24 h), settings page range unchanged.
  / 30 分钟默认值是刀口而非余量：两个四任务运行分别在 30m00s 与 30m01s 被杀，而真实四任务运行用时
  878 s / 1148 s / 1801 s。硬上限（24 h）与设置页范围不变。

### Changed / 变更
- **The settings page speaks the language DSH is set to / 设置页跟随 DSH 的语言设置（中英双语）。**
  Every string on the page — card title and one-line summary, group headings, per-field labels,
  numeric ranges, the per-role chain editor (add / remove / placeholder / empty-chain hint),
  read-only rows, Save / Discard / Saving, the save outcome and every validation finding — now
  resolves through the composition's own locale plugin (`@deepseek-ai/dsh-client-locale`) instead
  of being printed as one hardcoded bilingual line. The bundle registers its dictionary
  (`ctx.locale.register('grok-workflow', { zh, en })`) and declares `locale: 'grok-workflow'` on its
  `plugins.item` slot, so Settings → General → Language switches the page, the card title and the
  card summary in place — the same setting that drives `<html lang>`. The browser's `navigator`
  language is never consulted, and a composition with no locale service still mounts the page in
  English rather than not at all.
  / 页面全部文案（卡片标题与一行简介、分组标题、字段标签、数值范围、按角色链编辑器、只读行、
  保存/放弃/保存中、保存结果、以及全部校验错误）改为经由组合自带的 locale 插件
  （`@deepseek-ai/dsh-client-locale`）解析，不再打印硬编码的中英混排一行字；bundle 注册自己的
  字典并给 `plugins.item` 槽声明 `locale`，因此"设置 → 通用 → 语言"切换即让页面、卡片标题与
  简介就地换语言——与驱动 `<html lang>` 的是同一个设置。**不**读取浏览器 `navigator` 语言；
  组合里没有 locale 服务时页面仍以英文挂载，而不是整页缺失。
- **Validation findings are data, not prose / 校验结果是数据而不是成品句子。** `validate()`
  returns `{ key, params }` findings and the page renders them through the active language, so one
  draft reports identically in both languages and a language switch re-renders findings already on
  screen instead of stranding the old wording. / `validate()` 返回 `{ key, params }`，由页面按当前
  语言渲染；同一份草稿在中英文下报同一批问题，切换语言时已在屏幕上的错误会一起换语言。

## [0.2.1] - 2026-10-27

Incremental release on top of the published `0.2.0`: everything below is **new since** that tag —
nothing in this section restates a change that `0.2.0` already shipped.

`0.2.0` 之上的增量版本：本节全部是**自该 tag 以来新增**的内容，不重复 `0.2.0` 已经发布过的改动。

### English

#### Added
- **Settings page in the Web GUI / Web 图形界面的设置页。** The plugin now ships its own
  browser bundle, so the Plugins page shows a **Grok workflow** card with all 21
  configuration keys: the 17 live fields (gate, context and concurrency limits,
  synthesis, failure classes, run records) and the 4 structural keys read-only with
  their reason. Per-role fallback chains are edited in place (add / remove / edit a
  route, up to three per role), invalid input is refused before it reaches the Host,
  and a save applies to the **next** message. The page appears only while the Host
  serves the namespace, so an inactive plugin shows no card instead of a dead form.
  / 插件自带浏览器端 bundle：插件页出现 **Grok workflow** 卡片，渲染全部 21 个配置键
  （17 个可编辑的活动字段 + 4 个只读结构性字段并给出原因），支持按角色链的增删改
  （每角色最多 3 条），非法输入在提交前被拦下并列出原因，保存后对**下一条消息**生效；
  命名空间未提供时整页不出现，而不是显示一个坏掉的表单。
- **Activation prerequisite documented / 记录激活前提。** `@deepseek-ai/dsh-web-app` ships
  `workflow-ptc` disabled, so installing the bundle puts the row in the graph while the
  plugin stays `pending (waiting for service: workflowEngine)`. The install steps now
  include re-enabling a workflow provider, plus the four checks that prove activation
  (clean boot, served namespace, GUI card, `grok_workflow` in a real session's tool
  list). / `dsh-web-app` 层默认禁用 `workflow-ptc`，装包只让行进入组合图而插件停在
  `pending`；安装步骤已补上"启用一个工作流 provider"和四条激活校验。

### 简体中文

#### 新增
- **Web 图形界面的设置页。** 插件自带浏览器端 bundle：插件页出现 **Grok workflow** 卡片，
  渲染全部 21 个配置键（17 个可编辑的活动字段 + 4 个只读结构性字段并给出原因），支持按角色
  链的增删改（每角色最多 3 条），非法输入在提交前被拦下并列出原因，保存后对**下一条消息**
  生效；命名空间未提供时整页不出现，而不是显示一个坏掉的表单。
- **记录激活前提。** `@deepseek-ai/dsh-web-app` 层默认禁用 `workflow-ptc`，装包只让行进入
  组合图而插件停在 `pending (waiting for service: workflowEngine)`；安装步骤已补上"启用一个
  工作流 provider"和四条激活校验。

## [0.2.0] - 2026-10-26

### English

#### Added

- **Mandatory entry (the gate).** The plugin now claims every user message
  through `agent/pre-step`, runs the full plan → execute → verify → synthesise
  workflow, and delivers the result inside the same turn (`answerStrategy:
  in-turn`, the default). Turning a message away is a stated decision: an empty
  or over-long message (over 4000 characters) is refused with its reason
  printed, and nothing is executed. Delivery is de-duplicated per message, so
  re-dispatching a batch cannot start a second run, and the queue per agent is
  bounded (`maxQueuedMessages`).
- **Per-role model routing with ordered fallback chains.** `roles.planner`,
  `roles.worker`, `roles.verifier` and `roles.synthesizer` each take up to three
  routes (`{ provider, model }`, or a bare model id as shorthand). Every child
  call is routed by role, and a route-level failure advances that role's chain.
  The routes actually used are recorded in the report (`routing`) and rendered in
  the answer, so a chain that never took effect cannot look like routing that
  works.
- **Switch policy you can inspect.** `switchOn` lists the failure classes that
  advance a chain (default: the built-in policy). Content failures
  (`task-failed`, `verification-failed`) never advance — a different model would
  be looking at the same evidence — and a typo in `switchOn` is refused at load
  instead of silently never switching.
- **Failure class and category in every report.** Each failure carries what
  happened (`class`, e.g. `rate-limit`, `timeout`, `verification-failed`) and
  who has to fix it (`category`: `infrastructure`, `quality`, `configuration`,
  `cancelled`, `unknown`). The rendered answer adds a `Failures:` line, so a
  provider outage is not read as poorly done work.
- **A settings surface that is the same truth as the runtime.** The exported
  `Config` is projected into the standard DSH settings UI; fields are live
  (an edit reaches the next message, an invalid edit is refused with its reason
  while delivery keeps the last valid snapshot). Unknown configuration keys are
  rejected with the closest accepted key instead of being ignored, and
  `roles`/`synthesis` are validated against the providers the runtime actually
  has. Run records (`recordRuns`, `recordLimit`) can be turned off or capped.
- **Write-path isolation for parallel tasks.** A plan task may declare
  `writesPaths`; tasks whose declared paths overlap run one after another, and
  everything else keeps running in parallel. `[]` means "writes nothing";
  declaring nothing means "unknown" and is treated conservatively. Overlap is
  decided lexically (`.`, `..`, separators, case) with segment-wise prefixes, so
  `src` covers `src/a.ts` while `src/a` does not cover `src/ab`.
- **A real-engine contract test base and a reliability suite.** The tests drive
  the actual `@deepseek-ai/dsh-workflow-ptc` engine (script VM, guest program,
  `agent()` contract, result materialization) with a scripted subagent provider,
  and cover cancellation, deadlines, the concurrency cap, duplicate starts,
  recursion refusal, context bounds, secret redaction, partial results, unload
  and reload. 264 deterministic tests across 18 files; no online model is needed.
  Process confinement, sandbox policy and capability gating remain out of scope.

#### Changed
- **`enforceGate` is `true` by default: every user message now goes through the
  workflow.** This is the point of the release and also the biggest visible
  change from `0.1.0`, where the tool only ran when a model chose to call it.
  Set `enforceGate: false` to get the `0.1.0` behaviour back (the tool stays
  available, the gate does not intercept).
- The answer is delivered inside the turn by default (`answerStrategy:
  in-turn`). `relay` and `append` remain selectable for long-lived surfaces; on a
  one-shot headless run they deliver after the process has begun tearing down.
- Acceptance criteria must stay distinct after normalization (trailing sentence
  punctuation, collapsed whitespace and case are ignored when matching a
  verifier result), so `["Do X.", "do x"]` is now rejected.
- The planner prompt receives the objective as redacted JSON data rather than
  raw interpolated text, matching how worker and verifier prompts are built.
- The report validator now enforces what it documented: deep-checked attempt
  payloads against closed unions, confirmed evidence traceable to the task's
  last attempt, unique task ids, `limits.maxTotalAgents` inside the request
  builder's window, and every failed task present exactly once in `incomplete`.
- The package version is `0.2.0`, the changelog keeps one bilingual section per
  version, and `npm run ci` runs typecheck, lint, build and the full suite.

#### Fixed
- An infrastructure failure no longer escapes as a raw exception. Every
  transport-level failure (429, timeout, connection reset, missing model, a
  crashed child) now produces a structured report with
  `category: infrastructure`; the worst case is one failed row per task.
- Redaction rules have a single source (`REDACTION_RULES`) and the workflow
  script's prompt-side redactor is generated from it. Added Azure SAS
  (`sig`/`signature`) and `Authorization: Basic` coverage.
- Verification no longer compares acceptance-criterion text byte-for-byte, so a
  verifier that copies a criterion with a trailing period, different spacing or
  different case no longer fails every attempt.
- A run-level failure (deadline, cancellation, an unvalidatable report) now
  prints its `Failures:` line from the run-level error categories instead of
  showing none.
- A malformed routing record no longer discards the whole ledger, and the
  delivery fallback keeps the last valid configuration instead of the load-time
  one, so a later invalid edit cannot silently undo an edit that had taken
  effect.

#### Breaking notes (`0.1.0` → `0.2.0`)
- **Mandatory entry is on by default.** If you want the old opt-in behaviour,
  set `enforceGate: false`. A deployment that must never degrade silently should
  also set `gateRequired: true`, which turns "this runtime has no `agent/pre-step`
  hook" into a load error instead of a warning.
- **The report is additive but extended:** task rows gain `writesPaths` (array or
  `null`), failures gain `class` and `category`, and `plan.tasks` must match
  `tasks` field for field. Consumers that reject unknown fields must be updated;
  consumers that ignore them keep working.
- **Configuration keys are validated.** Unknown keys are rejected at load with a
  suggestion, and `roles` chains are refused when empty models, duplicate routes
  or more than three routes are present. A configuration that loaded under
  `0.1.0` because a key was silently ignored may now fail loudly — that is
  intentional.
- **Criteria distinctness** can reject input that `0.1.0` accepted.
- Requires DSH `0.2.1-rc.2` and Node.js 22 or newer; the `0.1.0` peer set is not
  supported.

### 简体中文

#### 新增

- **强制入口（闸门）**：插件现在通过 `agent/pre-step` 认领每一条用户消息，执行完整的
  规划 → 执行 → 验证 → 汇总工作流，并在**同一轮**内交付结果（`answerStrategy:
  in-turn` 为默认）。拒绝一条消息也是明示决定：空消息或超过 4000 字符的消息会被打印
  拒绝原因且不执行任何工作。每个消息的交付做了去重，同一批被重复派发也不会启动第二次
  运行；每个 agent 的等待队列有上限（`maxQueuedMessages`）。
- **按角色模型路由 + 有序备用链**：`roles.planner`、`roles.worker`、`roles.verifier`、
  `roles.synthesizer` 各自最多三条路由（`{ provider, model }`，也接受裸模型 id 简写）。
  每次子代理调用按角色取路由，路由级失败会推进该角色的链。实际用到的路由写进报告
  (`routing`) 并渲染在答案里，因此"配了但没生效"不会被误当成"配好了"。
- **可检视的切换策略**：`switchOn` 列出允许推进备用链的失败类别（默认=内置策略）。
  内容类失败（`task-failed`、`verification-failed`）永不推进——换模型看到的是同样的
  证据；`switchOn` 里写错类别会在载入时被拒绝，不会变成"永不切换"。
- **每份报告都带失败类别与归类**：每个失败同时给出发生了什么（`class`，例如
  `rate-limit`、`timeout`、`verification-failed`）和该谁修（`category`：
  `infrastructure`、`quality`、`configuration`、`cancelled`、`unknown`）。渲染的答案
  增加 `Failures:` 行，provider 故障不会被读成"活干得不好"。
- **设置面与运行时同一真相**：导出的 `Config` 会被投影成 DSH 标准设置页；字段是活值
  （编辑对下一条消息生效，非法编辑以原因被拒绝，投递继续使用上一次合法快照）。未知
  配置键会被拒绝并给出最接近的合法键，而不是被静默忽略；`roles`/`synthesis` 会对照
  运行时实际拥有的 provider 校验。运行记录可用 `recordRuns`/`recordLimit` 关闭或封顶。
- **并行任务的写路径隔离**：计划任务可声明 `writesPaths`，声明路径重叠的任务依次执行，
  其余保持并行。`[]` 表示"不写文件"；什么都不声明表示"未知"，按保守方式处理。重叠判定
  是词法的（`.`、`..`、分隔符、大小写）且按段比较前缀，因此 `src` 覆盖 `src/a.ts`，
  而 `src/a` 不覆盖 `src/ab`。
- **真实引擎契约测试基座与可靠性套件**：测试直接驱动真正的
  `@deepseek-ai/dsh-workflow-ptc` 引擎（脚本 VM、guest 程序、`agent()` 契约、结果
  物化），配合脚本化的子代理 provider，覆盖取消、超时、并发上限、重复启动、递归拒绝、
  上下文边界、密钥脱敏、部分完成、卸载与重载。264 个确定性测试 / 18 个文件，无需在线
  模型。进程隔离、沙箱策略与能力门禁仍不在覆盖范围内。

#### 变更
- **`enforceGate` 默认 `true`：每条用户消息都会走完整工作流。** 这正是本版本的目的，
  也是相对 `0.1.0` 最大的可见变化——`0.1.0` 只有模型主动调用工具时才运行。若想恢复
  `0.1.0` 的行为，设 `enforceGate: false`（工具仍可用，闸门不再拦截）。
- 答案默认在同一轮内交付（`answerStrategy: in-turn`）。`relay`、`append` 仍可选用，
  适用于长驻界面；在一次性 headless 运行中它们在进程开始销毁后才投递。
- 验收标准归一化后必须互不相同（匹配验证结果时忽略结尾句读、多余空白与大小写），
  `["Do X.", "do x"]` 这类输入现在会被拒绝。
- 规划提示词接收经脱敏的 JSON 形式目标，与 worker、verifier 提示词的构造方式一致。
- 报告校验器补齐了声明的约束：逐次尝试载荷按闭合枚举深度校验、confirmed 证据必须可追溯
  到该任务最后一次验证、任务 id 唯一、`limits.maxTotalAgents` 落在请求构造器取值区间、
  每个失败任务在 `incomplete` 中恰好出现一次。
- 版本号改为 `0.2.0`；更新日志每个版本保持中英对照；`npm run ci` 运行 typecheck、
  lint、build 与完整测试。

#### 修复
- 基础设施故障不再以裸异常逃逸。所有传输层故障（429、超时、连接重置、模型不存在、
  子代理崩溃）都会产出结构化报告并标注 `category: infrastructure`；最坏情况是每个任务
  一行失败。
- 脱敏规则改为单一来源（`REDACTION_RULES`），工作流脚本内的提示词脱敏器由它生成；
  新增 Azure SAS（`sig`/`signature`）与 `Authorization: Basic` 覆盖。
- 验证不再逐字比较验收标准文本，验证者抄错结尾句号、空白或大小写不会再导致每次尝试失败。
- 运行级失败（超时、取消、报告无法校验）也会打印 `Failures:` 行（取自运行级错误类别），
  而不是什么都不显示。
- 单条畸形路由记录不再毁掉整份台账；投递回落改取**上一次合法配置**，因此后续非法编辑
  无法静默撤销已经生效的编辑。

#### 破坏性说明（`0.1.0` → `0.2.0`）
- **强制入口默认开启。** 需要旧的可选行为请设 `enforceGate: false`。要求"绝不静默降级"
  的部署还应收紧 `gateRequired: true`：把"运行时没有 `agent/pre-step` 钩子"从警告变成
  载入错误。
- **报告为纯增量但已扩展**：任务行新增 `writesPaths`（数组或 `null`），失败新增 `class`
  与 `category`，且 `plan.tasks` 必须与 `tasks` 逐字段一致。拒绝未知字段的消费方需要
  适配；忽略未知字段的消费方不受影响。
- **配置键会校验**：未知键在载入时被拒绝并给出建议；`roles` 链出现空模型、重复路由或
  超过三条会被拒绝。`0.1.0` 下因键被静默忽略而"能用"的配置，现在可能直接报错——这是
  有意为之。
- **验收标准去重**可能拒绝 `0.1.0` 曾接受的输入。
- 需要 DSH `0.2.1-rc.2` 与 Node.js 22 及以上；`0.1.0` 的 peer 集合不再受支持。

## [0.1.0] - 2026-10-25

### English

#### Added
- Initial version of Grok Workflow for DSH, an external DSH bundle exposing the `grok_workflow` tool.
- Bounded plan, parallel execution, independent verification, limited retries, and a structured final report.
- Configurable limits for concurrency, retries, task count, execution deadline, and active workflow runs.
- English and Simplified Chinese setup documentation, architecture notes, acceptance checks, tests, and an optional GitHub Issue watcher.

#### Fixed and hardened
- Validate workflow reports before presenting them as results, including explicit `completed`, `partial`, and `failed` invariants.
- Bound task input and report payload sizes, and redact common credential formats from model-facing diagnostics.
- Treat GitHub Issue content as untrusted input and restrict credential variables passed to watcher wake processes.
- Test the committed `lib/` build output so a stale compiled package cannot silently pass CI.

### 简体中文

#### 新增
- Grok Workflow for DSH 首个版本：作为 DSH 外部 bundle，提供 `grok_workflow` 工具。
- 支持有限规划、并行执行、独立验证、有限重试和结构化结果汇总。
- 支持配置并发数、重试次数、任务数、执行时限和同时运行的工作流数量。
- 提供英文与简体中文文档、架构说明、验收清单、自动化测试，以及可选的 GitHub Issue 监控脚本。

#### 修复与安全加固
- 在展示结果前校验工作流报告，明确约束 `completed`、`partial` 和 `failed` 状态。
- 限制任务输入和报告大小，并对模型可见的诊断信息中的常见凭据格式进行脱敏。
- 将 GitHub Issue 内容视为不可信输入，并限制监控脚本唤醒进程可继承的凭据环境变量。
- 在 CI 中检查已提交的 `lib/` 构建产物，避免过期编译文件在测试通过后被错误打包。
