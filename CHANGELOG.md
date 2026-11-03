# Changelog / 更新日志

Notable user-facing changes are recorded here in English and Simplified Chinese.
用户可见的功能和修复会在这里以英文和简体中文记录。

## [Unreleased]

### Added / 新增

- **Per-route concurrency cap with overflow to the next route / 每条路由的并发上限，打满就溢出到下一条** —
  each route in a role's chain can carry an optional `maxInFlight` (1–64, blank = unlimited),
  set in the settings page's third box per row or in the profile patch. While a capped route is
  full, a new call overflows to the next route in chain order instead of queueing on the full one;
  only when every route is full does the call wait for a drain. A full lane is never a failure:
  it advances no fallback, costs no retry attempt, and is recorded separately (`skippedBusy` /
  `queuedMs`, rendered as `Route overflows …` rather than `Route switches:`), so "used route B
  because route A was full" never reads as "route A failed".
  角色链里每条路由可配可选的 `maxInFlight`（1–64，留空=不限），在设置页每行第三个框或 profile
  patch 里填写。某条路由打满时，新调用按链顺序溢出到下一条，而不是排队等它；只有所有路由都满
  才等待腾位。打满不是失败：不推进备用链、不消耗重试，在报告里单独呈现（`skippedBusy` /
  `queuedMs`，`Route overflows …` 而非 `Route switches:`），"因为 A 满了所以用了 B"
  永远不会被读成"A 失败了"。

### Fixed / 修复

- **The first message of a session no longer disappears while the team runs / 会话的第一条消息不再"消失"** —
  with the default `in-turn` strategy the gate waited for the whole workflow before handing the
  claimed message back to the loop, and the loop is the only writer of `user/message` events, so
  the transcript held no message at all for the entire run: the GUI showed an empty turn with just
  the running/planning status, and a page reload lost what the user had typed. The claimed message
  is now published to the transcript before the wait (same id, source and `rpcId`, exactly once),
  and the entered step carries only the report; thinking/planning stays a status indicator.
  默认 `in-turn` 策略下，网关要等整个工作流跑完才把已认领的消息交回循环，而循环是 `user/message`
  事件的唯一写入者 —— 于是整段运行期间会话里一条消息都没有：界面只剩「正在分析请求/规划中」状态，
  刷新页面后用户输入的内容彻底消失。现在网关在等待之前就把原消息写进会话（同 id、同 source、
  保留 `rpcId`，且只写一份），进入的步骤只携带报告；思考/规划只作为状态显示。

## [0.2.6] - 2026-11-02

### Changed / 变更

- **Settings page visual polish, three live-screenshot passes / 设置页三轮视觉打磨，均有真机截图** —
  info hierarchy and breathing (title ladder, hint styles, hairline row dividers, unified
  32px/8px controls, unit suffixes like ms/retries/turns, restyled status line, card-ified
  role chains with numbered badges, solid-blur sticky footer), alignment and rhythm
  (two-column baselines, semantic green ON switch, disclosure markers, right-aligned
  revision), and details (dashed empty state, tinted error box, hover/focus/disabled
  states, 340px internal chain scroll, bilingual EN/ZH overflow checks). No config keys,
  bounds, validation or wiring changed — styles, grouping order and copy only.
  信息层级与呼吸感（标题阶梯、hint 样式、行分隔线、统一 32px/8px 控件、ms/次/轮等单位后缀、
  状态行重塑、角色链卡片化+序号徽、实底毛玻璃吸底栏）、对齐与节奏（两列基线、语义绿 ON 开关、
  折叠箭头、修订号右对齐）、细节定稿（虚线空态、红底错误框、hover/focus/disabled 三态、
  链内 340px 滚动、中英双语溢出检查）。未动任何配置键、上限、校验与接线，只改样式、分组顺序与文案。

## [0.2.5] - 2026-11-01

The novice settings page: the Settings → Plugins → `Grok workflow` page now speaks one
language at a time — exactly the language DSH is set to — with plain words instead of
field keys and jargon. On top of that: history, concurrency, retry, task and timeout
bounds are relaxed for long jobs, and every role chain holds up to 50 backup routes.

新手设置页：设置 → 插件 → `Grok workflow` 页面一次只说一种语言——严格跟随 DSH 的语言设置，
用人话代替字段键与黑话。在此之外：历史、并发、重试、任务与超时上限为长任务放宽，每条角色链
最多可放 50 条备用路由。

### Added / 新增

- **Novice-oriented settings page, strictly single-locale / 新手向设置页，严格单语** —
  the page renders only the active system language (no raw field keys, no mixed bilingual
  lines), shows a live one-line status under the intro (`OFF — plain chat` / `ON — smart
  triage` / `ON — full team`, following the current draft and never saved), and groups the
  controls into Mode / Who does it / Limits / More (collapsed) / Advanced — leave alone /
  Status. Role names are plain words (Planner / Executor / Checker / Summarizer); every
  row explains what happens if you leave it alone.
  页面只渲染当前系统语言（不显示 raw 字段键，不中英混排），页头有一句跟随当前草稿的实时状态
  （关着 / 智能分诊 / 全员出动，只展示、不保存），控件按"模式 / 谁来干 / 上限 / 其他（默认折叠）/
  高级（别碰）/ 运行状态"分组。角色名是人话（规划 / 执行 / 检查 / 总结），每行都写了"不动会怎样"。
- **Provider → model dropdowns fed by the runtime / 通道→模型双下拉，目录来自运行时** —
  role chains and the triage model use provider→model dropdowns listing the models the
  runtime declares; when the runtime exposes no catalog both controls fall back to free
  text. Leaving a chain blank still means "use the model you are already talking to".
  角色链与分诊模型用"通道→模型"双下拉，选项是运行时已声明的模型；读不到目录就回退手写框。
  留空仍表示"用跟你对话的模型"。
- **switchOn as seven checkboxes, all checked by default / switchOn 改为七个勾选框，默认全勾** —
  one box per switchable failure class with plain names; all checked is the built-in
  behavior (switch only when the road is broken). Content failures never switch, they
  retry in place.
  每个可切换失败类别一个勾选框，名字是人话；全勾就是内置行为（路不通才换人）。内容没做好
  永远不换人，原地重试。
- **Long-chain + high-retry heads-up / 长链+高重试提醒** — a long backup chain combined
  with high retries shows a warning above the save button; it never blocks saving.
  备用链很长、重试又高时，保存按钮上方会有一句提醒；只提醒，不拦保存。

### Changed / 变更

- **Bounds relaxed for long jobs / 上限为长任务放宽** — `historyTurns` 0–1000000
  (default `12`), `historyChars` 0–1000000 (default `20000`), `maxConcurrency` 1–1000000
  (default `4`), `maxRetries` 0–10 (default `2`), `maxTasks` 1–100 (default `12`),
  `timeoutMs` up to 7 days (`604800000`, default still 60 minutes), each role chain up
  to `50` backup routes (was 3). The generated script's defensive clamps mirror the
  backend limits and a test pins them equal. The per-task call backstop is now an
  extreme 1100-call guard instead of a 6-call budget.
  `historyTurns` 0–1000000（默认 `12`）、`historyChars` 0–1000000（默认 `20000`）、
  `maxConcurrency` 1–1000000（默认 `4`）、`maxRetries` 0–10（默认 `2`）、`maxTasks` 1–100
  （默认 `12`）、`timeoutMs` 最长 7 天（`604800000`，默认仍 60 分钟）、每条角色链最多
  `50` 条备用路由（原来 3 条）。生成脚本里的兜底值与后端上限对齐，并有测试钉死两者一致。
  单任务调用预算从 6 次改为 1100 次的极端兜底。
- **Option and error copy in plain words / 选项与报错改成人话** — answer strategy,
  synthesis, gate scope and switch classes render localized display names (stored values
  stay English); validation errors keep their `{key, params}` data shape but read as
  plain sentences in both languages.
  回答策略、汇总方式、门禁范围、切换类别显示本地化名称（存值保持英文）；校验错误保持
  `{key, params}` 数据形态，但两边都是人话。

## [0.2.4] - 2026-11-01

The opt-in release: the workflow no longer hijacks every message — a session is plain chat until
you turn the workflow on with `/grok`. On top of that: the progress panel groups by task, the
workflow objective limit is 32,000 characters, the planner-failure fallback is sharded, and the
Issue #22 Phase 1 dialogue-reliability fixes (PR #23) ship in this version. Nothing here restates
a `0.2.3` change, and the `0.2.3` / `0.2.2` / `0.2.1` / `0.2.0` / `0.1.0` sections are untouched.

选择加入的版本：工作流不再拦截每条消息——会话默认是普通聊天，用 `/grok`
显式开启后才走工作流。在此之外：进度面板按任务分组、工作流目标上限提到 32,000
字符、规划失败回退改为分片、Issue #22 Phase 1 对话可靠性修复（PR #23）随本版发布。
不重复 `0.2.3` 已发布的内容；`0.2.3` / `0.2.2` / `0.2.1` / `0.2.0` /
`0.1.0` 章节保持不动。

### Added / 新增

- **`/grok` on/off workflow toggle / `/grok` 工作流开关** — the mandatory workflow is now a
  per-session switch you flip with a command instead of something that hijacks every message out of
  the box. `/grok` turns it ON (every user message runs the plan→execute→verify→report workflow);
  `/grok off` turns it OFF (normal chat — the workflow only runs if the model calls the
  `grok_workflow` tool). Default is **off** (`grokDefault: 'off'`): you opt in per session. The
  toggle is durable (survives restart / resume / fork) and lives in the session log, so it is never
  silently lost. `/grok` appears in interactive UIs (Web / CLI); headless and ACP surfaces have no
  command menu and follow `grokDefault`.
  把"每条消息强制走工作流"改成会话级、可用命令随时切的开关，不再一装上就每条都拦：`/grok` 开
  （每条用户消息都走 规划→执行→验证→汇报 的完整流程），`/grok off` 关（回普通聊天，只有模型主动
  调用 `grok_workflow` 工具才跑）。默认**关**（`grokDefault: 'off'`），按会话自行开启。开关状态
  挺过 重启 / 恢复 / 分身，存在会话日志里、不会被静默丢掉。`/grok` 在有命令面的界面（Web / CLI）
  可用；headless / ACP 无命令菜单，跟随 `grokDefault`。

### Changed / 变更

- **The progress panel groups by task, not by role / 进度面板改为按任务分组** — a run used to
  show two long role lists (`Execute`, `Verify`) with machine labels like
  `grok-worker-t1-a2`. It now shows one group per task, headed `任务 1 · <任务标题>` /
  `Task 1 · <task title>`, with rows `执行` / `执行（尝试 2）` / `检查` / `规划助手` /
  `汇总助手`. No `grok-` prefix, attempt marker, fallback marker, internal task id or child run id
  is shown any more; they all remain in the report. Two tasks with the same title never merge, a
  long title is shortened to 24 characters plus `…` in the header only (the report keeps it whole),
  and a retry is visible as “（尝试 2）” rather than as a second task.
  一次运行以前显示两条按角色分的长列表（执行、检查），行名是 `grok-worker-t1-a2` 这类机器名。
  现在每个任务一组，组头是 `任务 1 · <任务标题>`，行名是 `执行` / `执行（尝试 2）` / `检查` /
  `规划助手` / `汇总助手`；不再出现 `grok-` 前缀、尝试标记、回退标记、内部任务 ID 或子运行 ID
  （它们都还在报告里）。同名任务不会合并，过长的标题只在组头截断到 24 字加省略号（报告里保留全文），
  重试写作「尝试 2」而不是第二个任务。
- **Panel copy follows the language setting / 面板措辞跟随语言设置** — `zh` and `en` strings come
  from one table (`src/naming.ts`), selected by the DSH `locale` preference with `zh` as the
  default. No new configuration key: there is nothing to name by hand. A run already on screen keeps
  the words it was written with.
  中英文措辞来自同一张表（`src/naming.ts`），按 DSH 的 `locale` 偏好选择，默认中文；没有新增配置项，
  无需手工命名。已经显示出来的运行保持它写入时的措辞。

- **The workflow objective limit is 32,000 characters / 工作流目标上限为 32,000 字符** — the gate
  and the direct `grok_workflow` tool used to refuse any objective over 4,000 characters. The limit
  is now 32,000 characters (`TASK_LIMITS.objectiveChars`); per-task bounds are unchanged (task
  objective / expectedOutput / context ≤ 4,000 characters each). The 4,001–32,000 range used to be
  the exact window where the planner-failure fallback was re-rejected; it is now covered by the
  sharded fallback in Fixed. Tests: `test/objective-limit.spec.ts`.
  闸门与直接调用 `grok_workflow` 工具以前拒绝任何超过 4,000 字符的目标，现在上限为 32,000 字符
  （`TASK_LIMITS.objectiveChars`）；每任务边界不变（任务目标 / 预期输出 / 上下文各 ≤ 4,000
  字符）。4,001–32,000 正是以前规划失败回退会被二次拒绝的窗口，现在由 Fixed 里的分片回退覆盖。
  测试见 `test/objective-limit.spec.ts`。

### Fixed / 修复

- **A failed planner no longer drops a long objective / 规划失败不再丢掉长目标** — when planning
  failed, the fallback plan carried the whole objective in one task, which the 4,000-character
  per-task bound then rejected: a 4,001–32,000 character objective could pass the front desk and
  still fail with `workflow result fallback plan.tasks[0].objective is N characters, over the
  4000-character per-task limit`. The fallback now splits the objective into contiguous shards of
  at most `taskTextChars` characters; concatenating the shard objectives reproduces the original
  byte for byte, every shard carries the same `origin_goal_id`, and the run reports `partial` with
  `planning.source: "fallback"` instead of failing. The segment count follows the splitter rather
  than `maxTasks`, so the configured task cap cannot reject the fallback a second time. 规划失败时，
  回退计划以前把整个目标塞进一个任务，随后被每任务
  4,000 字符上限拒绝：4,001–32,000 字符的目标能过前置检查，却仍会以
  `workflow result fallback plan.tasks[0].objective is N characters, over the 4000-character
  per-task limit` 失败。现在回退计划把目标切成每片不超过 `taskTextChars` 的连续分片，分片目标顺序
  拼接后与原文逐字节一致，所有分片共享同一个 `origin_goal_id`，运行以 `partial` 收尾并保留
  `planning.source: "fallback"`，不再失败。分段数由切分器本身决定而不是 `maxTasks`，
  配置的任务上限不会二次拒绝回退计划。
- **The fallback now survives objectives that used to knock it out / 极端目标不再把回退计划打回** —
  three review findings on the segmented fallback, each reproduced by a test before it was fixed.
  (1) A boundary that backs off a surrogate pair adds a segment, so a 32,000-character objective can
  split into nine segments while the cap was derived from `ceil(chars / 4000)` = 8; with
  `maxTasks: 6` that fallback was rejected as over the task cap. The cap now comes from the splitter
  itself (`src/shards.ts`), which the generated script and host validation share. (2) An objective
  dense in JSON escapes — 32,000 quote characters — serialized to ~67,000 characters and tripped the
  48,000-character aggregate budget, which bounds task text a planner or caller *authored*; the
  fallback carries the caller's own characters, so the validator now checks the segments directly
  (they must be exactly what the splitter produces) instead of applying that budget. (3) Segments
  were max-sized slices, so a 4,001-character objective produced a 4,000-character task and a
  one-character one, every shard shared one generic criterion, and cuts could land mid-sentence.
  Segments are now balanced, aligned to a nearby paragraph/sentence/word break, and each segment's
  criterion names the segment it covers, so a verifier confirms the piece it was handed and no shard
  stands in for the whole objective. 针对分段回退的三条审查意见，每条都先由测试复现再修：
  ① 分片边界若切开代理对会后退一位，32,000 字符的目标可能切成 9 段，而上限仍按
  `ceil(chars / 4000)` = 8 计算，`maxTasks: 6` 时该回退计划会被判为超出任务上限；现在上限直接取自
  切分器（`src/shards.ts`），脚本与宿主校验共用同一份实现。② 充满 JSON 转义的目标（32,000 个引号）
  序列化后约 67,000 字符，会撞上 48,000 字符的合计预算——那个预算约束的是规划器/调用方*撰写*的
  任务文本，而回退计划只是调用方自己的字符，因此校验改为直接核对分段（必须与切分器产出完全一致），
  不再套用该预算。③ 以前按上限切片，4,001 字符的目标会切出一个 4,000 字符任务和一个单字符任务，
  所有分片共用一条通用验收标准，切点还可能落在句子中间；现在分段均衡、优先对齐附近的段落/句子/
  词语边界，且每段的标准明确写出它覆盖的是哪一段，核查只确认它拿到的那一片，任何一片都不能代表
  整个目标。
- **A rejected run no longer reads as finished / 被否决的运行不再显示成已完成** — the run node used
  to be closed with the engine's stop reason, and a verifier rejection ends the program normally, so
  a team where no task passed still showed `已完成` on the node and on both rows. The node is now
  closed with the task-level result: every task verified → `已完成`; `partial`/`failed` → `失败`;
  no report → `失败`. 运行节点以前用引擎的停止原因收尾，而核查否决是正常结束，所以一个没有任何任务
  通过的运行，节点和两行都显示「已完成」。现在节点按任务级结果收尾：全部任务通过才是「已完成」，
  `partial`/`失败` 显示「失败」，没有报告也显示「失败」。
- **The panel no longer overstates what happened / 面板不再夸大结果** — a completed child call is
  not a passed task: a finished call is worded `执行代理已结束` / `检查调用已结束`, an ended call can
  never produce the words “任务已完成” or “检查通过”, and no percentage, token count, ETA or invented
  activity is rendered anywhere. A task verdict (`任务通过` / `任务未通过`) comes only from the
  report, and a test fails if the panel and the report disagree.
  子调用结束不等于任务通过：结束的调用写作「执行代理已结束」「检查调用已结束」，永远不会变成
  「任务已完成」「检查通过」；不显示百分比、token 数、预计剩余时间或任何编造的活动。任务结论
  （「任务通过」「任务未通过」）只来自报告，面板与报告不一致时测试会失败。

- **A failed job can no longer be reported `COMPLETED` / 失败的活不会再被报成 COMPLETED** — found by a
  real-model E2E run (`wb/cn:deepseek-v4.1-flash`): a write into `/proc` that the worker itself
  reported blocked still came back `Grok workflow: COMPLETED`, because the planner had rewritten the
  objective into "attempt it and report honestly" and the verifier passed those rewritten criteria.
  Verification now requires the executor's own status to be `completed` — a self-reported
  `partial`/`failed` is an admission, not something a verifier can overturn — and the planner is
  forbidden from substituting "attempt and report" for the requested end state. Regression test in
  `test/orchestrator.spec.ts`; re-run now reports `FAILED`.
  真模型 E2E 抓到的缺陷：worker 自己都报"被阻塞"的 `/proc` 写入，最终仍返回 `COMPLETED`——planner 把目标
  改写成"尝试一下并如实报告"，验证员对着改写后的标准判了通过。现在要求执行者自报必须是 `completed`
  才可能通过验证（自报 `partial`/`failed` 是承认，验证员不能翻案），并禁止 planner 用"尝试并报告"
  替换目标要求的终态。`test/orchestrator.spec.ts` 加了回归，复测返回 `FAILED`。

- **`/grok` now means the full workflow, not the front desk / `/grok` 真的走完整流程** — the command
  promised the full plan→execute→verify workflow while a deployment `mode: triage` quietly answered
  simple messages from a template. An explicit `/grok` now records `workflowMode: 'full'` on the
  session and the gate honours it; a config-level `grokDefault: 'on'` still respects `mode`, so a
  deployment can choose triage. Tests: `test/triage.spec.ts`, `test/mode.spec.ts`,
  `test/command.spec.ts`.
  命令文案承诺完整流程，但部署的 `mode: triage` 会把简单消息静默交给模板回答。现在显式 `/grok` 会在
  会话里记 `workflowMode: 'full'`，闸门照此执行；配置级 `grokDefault: 'on'` 仍尊重 `mode`，部署方
  仍可选分诊。测试见 `test/triage.spec.ts` / `test/mode.spec.ts` / `test/command.spec.ts`。


### Fixed — Issue #22 Phase 1 对话可靠性 / dialogue reliability (reviewed, ships in this release)

- **P0-1 用户原话不再丢失 / the user's own message stays in the transcript** — `in-turn` 路径过去只把
  插件生成的 relay/report 消息放进 `enter.messages`，而 `AgentLoop.preStep()` 已经把这一批消息从
  inbox 里 `claim` 走了，于是模型转写里根本没有用户自己那句话。现在本条决策先带上被 claim 的消息
  （同一个对象：id、source、正文、附件结构都不变），报告紧随其后；`relay` / `append` 因为整步被
  `reject`，由插件自己把那句话写进 session，两条路径各自只有一个写入者，因此不会重复。
  过去 `enter.messages` 只放报告、而用户消息被 `inbox.claim` 移除后无人提交——这就是原话丢失的原因。
- **P0-2 确认档不再丢上下文 / a confirmation answer keeps the task** — `pendingAsks` 过去只存时间戳，
  用户回答「简单」后快手档只收到这两个字。现在 pending 保存 `originalRequest` 与 `askedAt`（TTL 仍为
  10 分钟），快手档与团队档收到的都是「原始任务 + 用户选择简单/团队模式（选择词不是任务目标）」；
  过期、插件重载、被别的消息顶掉时都会明说，不猜原始任务；同一 pending 只能被消费一次。
- **P0-3 内部错误一定有用户可见终态 / every internal error ends visibly** — 分类失败过去是静默
  `reject`（用户看到空白回合），现在是带上原因的通知消息且保留原话；失败话术不会出现
  「已完成/已开启」这类成功措辞；有意取消、超时、插件卸载与内部异常各有独立终态。
- **取消时原话与终态都不再消失 / a cancelled turn keeps the message and states its end** — 真机 GUI
  复核发现的 P0-1 × P0-4 缺口：in-turn 路径里用户那句话已经被 `inbox.claim` 取走，若这一回合被取消，
  决策只能 `reject`，于是 session 里既没有 `user/message` 也没有任何停止原因（实测会话事件只有
  `inbox/spliced` → `run-end cancelled` → `turn/end aborted`）。现在取消走 `commitCancelled()`：先按
  原对象提交被 claim 的那批消息（这一步整步已被 reject，插件是唯一写入者，不会重复），再写一条
  助手消息说明 `运行已取消（cancelled）…已完成的部分保留…`。GUI 截图与回归用例见
  `docs/knowledge/evidence/p1-gui/`。
- **P0-4 取消到达终态并保留已完成的工作 / cancellation ends, and keeps finished work** — 已经 aborted
  的 signal 不会再启动引擎（过去会先启动再取消，白跑一次 planner/worker）；运行被停止时，引擎已经
  产出的报告会被保留：已验证任务原样保留，未完成的任务标为 `interrupted`、未开始的任务标为
  `not started`，运行级错误分类为 `cancelled`（不是质量失败），面板随之收尾。

### Notes / 说明

- **This release changes the default behaviour / 本版改变默认行为** — a fresh install no longer
  runs the workflow for every message: sessions start as plain chat (`grokDefault: 'off'`) until
  `/grok` turns the workflow on for that session. Set `grokDefault: 'on'` to keep the previous
  always-on posture (deployments may still choose `mode` for triage).
  新装插件不再对每条消息跑工作流：会话默认是普通聊天（`grokDefault: 'off'`），用 `/grok`
  为该会话显式开启后才走工作流。需要以前常开姿态的部署请设 `grokDefault: 'on'`
  （仍可用 `mode` 选择分诊）。
- **Real-GUI verification, stated honestly / 真机 GUI 验证（诚实口径）** — `/grok` switching and
  the settings-page card were verified on a real Web GUI driven by a real (off-screen headless)
  Chromium against an isolated instance (VALIDATION Round 15): default plain chat → `/grok` full
  run → `/grok off` back to plain chat, plus card render / save / persist / take-effect-on-new-session.
  Two deviations are stated, not hidden: the browser window was off-screen (the machine has no
  X11 display), and every model round ran on `wb/cn:glm-5.3-flash` instead of the originally
  planned model. `relay` / `append` delivery on a long-lived GUI session remains `NOT_RUN`.
  `/grok` 可切与设置页卡片已在真 Web GUI 上验证：真（离屏 headless）Chromium 驱动隔离实例，
  默认普通聊天 → `/grok` 完整运行 → `/grok off` 回普通聊天，以及卡片渲染 / 保存 / 持久化 /
  对新会话生效（VALIDATION Round 15）。两处偏离如实说明、不隐瞒：浏览器窗口是离屏的（本机无 X11
  显示），全部模型轮次用的是 `wb/cn:glm-5.3-flash` 而非原定模型。长驻 GUI 会话里的 `relay` /
  `append` 投递仍为 `NOT_RUN`。

## [0.2.3] - 2026-10-28

The front desk release: every user message now passes a front desk that states its tier in
public. `0.2.2` behaved exactly as before unless `mode` was changed — nothing here restates a
`0.2.2` change, and the `0.2.2` / `0.2.1` / `0.2.0` / `0.1.0` sections are untouched.

**What the tiers actually do, after the t53 review:** the first draft of this feature answered
short questions and short two-step instructions from the greeting template — it looked like it
worked and did no work at all. That is fixed, and the ordering that caused it is now a tested
contract (see Fixed).

### Added / 新增

- **Front desk with four tiers / 前台四档分流** — every user message now passes a front desk that
  states which tier it chose and why, and never silently takes a cheaper path: `直答档` answers
  small talk from a template (no model call), `快手档` answers a single-step request with one
  worker, `团队档` runs the full workflow with a greeting and the progress panel, and `确认档` asks
  `这个要动用团队吗？可回复：简单 / 团队` and remembers the answer. Tier wording, greeting and
  answer follow the language of the message. 每条消息都先过前台：前台公开写明走了哪一档、为什么，
  绝不静默降级——直答档用模板秒回（不花调用）、快手档派一个工人、团队档跑完整工作流（带开工迎宾
  与进度面板）、拿不准就反问一句并记住回答；档位措辞跟随消息语言。
- Three new settings, in the existing settings page and both languages: `mode` (`triage` /
  `full`), `triageAsk`, `triageModel`. Configuration keys 23 → 26.
  设置页新增三项（中英双语）：`mode`（分流 / 全团队）、`triageAsk`、`triageModel`；配置键 23 → 26。

### Compatibility / 兼容

- `mode: 'full'` reproduces the previous behaviour exactly — every message runs the team, no tier
  line, no greeting — and is pinned by a test. `mode: 'full'` 逐字节复现旧行为（每条消息都走团队，
  无档位行、无迎宾语），并有测试钉住。

### Fixed / 修复

- **Short questions and short two-step instructions were answered as small talk** (t53 F1, blocker).
  The "short and inert ⇒ direct tier" shortcut ran before the sequencing and question rules, so
  `为什么天空是蓝的`, `先备份然后升级` and `这个报错 src/triage.ts:42` were answered with a greeting
  template: the tier line was honest, the work never happened. The shortcut now runs after every
  strong signal, a question always costs at least one worker, and a pointer that carries a path, an
  error code or a snippet is dispatched instead of being asked about. Enumerations (`1) … 2) …`,
  `一、… 二、…`) and semicolons count as sequencing. 短问句与短两步指令曾被当成寒暄用模板答掉（档位
  行诚实、活儿没干）：短路规则现在排在全部强信号之后，问句至少一个工人，带路径/错误码/代码片段的
  "这个报错"直接派工而不反问；序号、顿号、分号都算多步。
- A bare `简单` / `团队` with no question waiting no longer guesses (and no longer crashes): it says
  that the pending question expired or the plugin reloaded. 无待答问题时的裸"简单/团队"不再猜、也不
  崩，而是明说上一轮没有待回答的分流问题。

### Notes / 说明

- The pending question and its answer live in plugin memory for ten minutes and are consumed when
  used, so a reload or a longer pause forgets them; the next bare choice word says so. 确认档的问题与
  回答存在插件内存里，10 分钟、用后即弃，重载或超时后会明说。
- The greeting arrives **with** the final answer, not before it: under `in-turn` a turn admits one
  plugin message, so during the run the visible signal is the progress board. 迎宾语随最终回答一起
  到达（`in-turn` 下一轮只允许一条插件消息），运行期间可见的是进度面板。
- The quick tier is "one call in the common case": when the plain call returns nothing, one
  structured retry follows, and the answer text still says one worker. 快手档常态一次调用；第一次
  没有产出时会重试一次结构化调用，措辞仍是"一个工人"。

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
