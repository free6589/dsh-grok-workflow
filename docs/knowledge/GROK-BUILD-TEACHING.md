# 学生与老师：dsh-grok-workflow ↔ Grok Build 执行对比与可学清单

Last updated: 2026-11-18。本文是一次 10 路并发只读调查的汇总（原始报告在
`.tmp/research/01..10-*.md`，共 ~6400 行，每条结论带 `文件:行号`）。

对象：

- **学生（A）**：本仓库 `dsh-grok-workflow` v0.10.1，DSH 外部 bundle 插件，TypeScript，
  `src/` 18k 行，`test/` 51 文件 951 测试。
- **老师（B）**：`free6589/grok-build` = xAI `grok` CLI/TUI 的 Rust 源码同步副本
  （`SOURCE_REV=559751fd…`，git 头 `2bdd1d6a Synced from monorepo`）。
  注意：公开树是 **monorepo 导出快照**，`.github/`、justfile、Bazel 都不在树里，
  但 `Cargo.toml:470`、`clippy.toml:38`、`.cargo/config.toml:81` 仍在引用它们 ——
  准确说法是"公开树不可审计"，不是"没有纪律"。

证据边界：全部为源码/文档级 `CONFIRMED`（少数标 `HYPOTHESIS`）；**没有跑 `cargo build`，
没有任何运行时对拍**。A 侧的数字（951 测试、8 键配置、10/100 并发）在本机核过；
B 侧没有任何一条由运行验证，只有代码与 user-guide 文本。

---

## 0. 一句话

**老师是"模型驱动的单循环 + 宿主在循环边界插护栏"；学生是"宿主脚本驱动的流水线 + 模型只在
5 个角色槽位里被调用"。** 这不是同一件事的强弱，是两种控制权归属。

由此派生出一条几乎解释所有差异的根因（`01-loop.md`）：

| | B | A |
|---|---|---|
| 谁决定下一步 | 模型：`tool_calls` 非空就继续（`xai-grok-shell/src/session/acp_session_impl/turn.rs:3427,3623,3818`） | 脚本：`phase('plan')→phase('execute')→phase('synthesize')` 写死（`src/script.ts:2045/2078/2104`） |
| 谁决定"要不要做这件事" | 模型自己 + 用户可随时 interjection（`interjection.rs:303`） | 宿主无条件截获每条用户消息（`src/gate.ts:1459`，R-001 的强制形态） |
| 控制点在哪 | 一个 `loop` 里 ~12 个显式控制点，每个都看得到完整局部状态（`turn.rs:2747-3880`） | 分散在 gate / run / script / engine 四层，脚本内存状态对宿主不可见 |

**A 结构上缺的不是"更聪明的规划"，而是"观察到中间结果 → 改动作"这个通道。**
A 的 worker 子 agent 内部确实有 DSH 自己的循环，但那个循环对插件不可见，结论只能以
`EXECUTION_SCHEMA` 出关（`script.ts:1845`）。所以下面所有"可学项"都应理解为：
**在脚本骨架不动的前提下，把老师在循环内部做的自适应，换成在阶段边界/attempt 边界上做的事。**

---

## 1. 执行对比总表

| 维度 | 老师 Grok Build | 学生 dsh-grok-workflow | 判定 |
|---|---|---|---|
| 执行单元 | 回合（turn）；另有自驱 goal，8 态状态机 | 一次 workflow run（plan→execute→verify→synthesize） | — |
| 控制流位置 | 同一函数内的 while 循环 | 生成一段 JS 字符串交给 `ctx.workflowEngine` | 取向不同 |
| 计划产物 | 磁盘 `plan.md`，`exit_plan_mode` 刻意禁止从参数传入计划 | 内存 JSON（`PLAN_SCHEMA`）+ checkpoint + 一行摘要 | **B 强（可审计）** |
| 计划的粒度 | prompt 里 "criteria aim 3-5, checklist 3-8" | 硬上限：任务 10/100、判据 ≤20、聚合 48000 字符 | **A 强（可机器拒绝）** |
| 计划→执行锚定 | 每轮挖 checklist 第一个未勾选项做 nudge，长任务不漂移 | 任务派发后不再回看计划 | **B 强** |
| 运行中重规划 | 有，但受限（strategist 只许改 HOW，改 plan.md 会被回滚） | 不存在；`resume/policy.ts` 的 `replan` 只有测试调用方 | **B 强** |
| 计划审批 | `approved / cancelled+feedback / abandoned`，未知 outcome 一律按未批准 | 无 | **B 强** |
| 完成判据 | markdown 段落，无机器校验；goal 子系统另有 3 skeptic 面板 | 判据必填、去重、逐条 `met`+非空 evidence、宿主再独立重算 | **A 强（明显）** |
| 子代理并发 | 32（session 级）+ 32/run（夹紧机器并行度）+ 引擎 ≤512；budget 128/1024 | 任务 10/100 + 引擎 `min(16,cpus-2)` + 运行级 2/8；无 budget 计量 | 数量级相近，单位不同 |
| 子代理隔离 | 上下文三档（全新/摘要 fork/逐字 fork）、worktree 文件隔离、按 agent 类型的工具面、`max_depth` | 只有全新 prompt；只读靠提示词；写域冲突靠**串行化** | **B 强（一大截）** |
| 后台与 steer | `spawn_subagent` 默认后台，句柄 + `get_task_output`/`wait_tasks`/`kill_task` + 32 KiB steer | 无；`agent()` 同步等到结果 | **B 强** |
| 上下文预算 | 50% 裁旧 tool result → 85% 压缩 → 摘要+最近原文+AGENTS.md 重注入 + segment 回捞指针 | 只有字符上限，无 token 估算、无压缩 | **A 缺（最可能静默失败处）** |
| 失败语义 | `ToolLoop` 七变体 + `SamplingErrorKind` 按形状分派（压缩重试/刷鉴权重试/限流等待） | 失败分类 4 类 + route 链 + attempt 重试 1 次；引擎 `null` 坍缩后只能当 format-error | A 的**报告**更细，**原因保真**更差 |
| 恢复 | journal 回放 + pause/stop/resume + `/rewind`（轮级，文件快照） | checkpoint 每 run 一份运行状态；`resumeDecision` 明写 `wired:false` | **A 写完没接线** |
| 中断 | 7 变体 `CancelTrigger` + 具名取消原因 + 崩溃补闭合 | 单一 AbortSignal + dispose 记录（trigger/callSite/signals） | 各有胜负 |
| 可观测性 | `updates.jsonl`（权威）+ `events.jsonl`（58 事件）+ OTel span | 会话事件（有 reader）+ JSONL 台账 + checkpoint；**`workflow/phase` 从不进会话流** | **A 缺"计划/阶段"这一半** |
| 扩展面 | MCP / SKILL.md / 插件目录+市场 / hooks（15 事件、5 类闸门、可改参数）+ ACP | 一个 bundle patch + 一个 TS 模块 + 唯一挂点 `agent/pre-step` | **B 的事件粒度厚两个量级** |
| 安全边界 | 4 层：Landlock/Seatbelt → bwrap 每命令 → seccomp 断网 → 逻辑审批（GrantScope/Expiry） | 无自有沙箱，全交 DSH；审批只有 `allowed-once` 二值 | **B 强，但 A 的方向对** |
| 工具面 | 52 个注册项，预设组合 3–25 个工具，`ToolError{kind:20}`，五级输出分阶 | 1 个 `grok_workflow`，`output.schema:{type:'json'}`，8000 字符砍一刀 | 哲学相反，各有代价 |
| 文档-代码耦合 | `include_str!` 编进二进制 + 测试断言每个 wire 字段都在指南里 | 951 测试，**没有一个断言文档数字** | **B 强（方法值得抄）** |
| 发版纪律 | 公开树里没有 CI（快照） | tag↔package.json↔changelog 机器对齐 + `lib/` 幂等硬门禁 | **A 强** |

---

## 2. 十层细节：老师在做什么，学生在做什么

### 2.1 主循环（`01-loop.md`）

- B：一次迭代 = 一次采样（`turn.rs:3051`）+ 一批工具执行（`:3818`）。宿主在循环边界做六件事：
  stationarity 硬停/软 nudge、阈值压缩、interjection 安全点 ×3、max_turns、溢出压缩、
  TodoGate。`max_turns` 默认 `None`（`agent/config.rs:1007`）——它相信"空 tool_calls 就是做完"。
- A：`gate.ts:1459` 截获 → `run.ts:580` 生命周期 → 脚本三阶段。终止只有三条：正常结束、
  60 min deadline 竞速（`config.ts:82`、`run.ts:858-864`）、外部 cancel/unload。
- 判定：**没有步数上限这件事两边都有，但理由相反**——B 相信模型会收敛，A 的任务数写死在计划里。
- 可学：**在 attempt 边界做 B 在 step 边界做的护栏**。`runTaskUnsafe` 的 `previous`
  （`script.ts:1840`）已经带着上一轮执行结果，但没人比较两次是否一样：模型复述同一答案时
  A 照付第二次 verifier 的钱。加一个稳定序列化的 `stepSignature`，连续 2 次相同即
  `class:'stationarity'` 直接 break，就能省下这刀。

### 2.2 规划（`02-plan.md`）

- B 有两套：① plan mode 双工具（`enter/exit_plan_mode`），计划只从磁盘 `plan.md` 读，
  因为"上下文里的计划与磁盘不一致"被当成 bug；退出时三种 outcome，未知一律当未批准；
  只读由代码强制（`plan_mode_edit_gate`），不是提示词请求。② `/goal`：独立 planner 子 agent
  只跑一次，写出分段 markdown；执行者每轮从 checklist 挖第一个未勾选项当 next-step nudge；
  strategist 只许改 HOW，改 `plan.md` 会被回滚。
- A：planner 子 agent 产 JSON；三分支来源（caller/planner/确定性分片）；运行中冻结；
  用户只见一行 `Plan: source; N task(s); M verified`。
- 判定：**A 在"判据可校验"上明显更强，B 在"计划是产物"上明显更强。**
- 可学：① `renderReport`（`report.ts:786`）把每任务的 `acceptanceCriteria` 打出来——判据
  是判定"完成"的唯一标准，用户至今没见过；② 复用 `resume/policy.ts` 的 `ACTION_BY_STATUS`
  把 `replan` 接进脚本执行循环，全局上限 1 次、不得改已验证任务的判据；③ 高成本档
  （triage 判定需规划时）复用现成确认回路，在派发前展示任务标题列表。

### 2.3 子代理与调度（`03-subagents.md`）

- B 有两套：模型面 `spawn_subagent`（后台句柄族 + `send_subagent_message` steer/queue/interject
  32 KiB）+ 脚本面 workflow 引擎（Rhai，budget/journal/pause）。
- 隔离是它的强项：`isolation=worktree` 真 git worktree（带 GC 与 resume 重建）、
  `fork_context` 三档、按 agent 类型的工具面（explore 3 个工具、plan 4 个，注释写明
  "toolset 强制只读，不只靠提示"）、`max_depth` 默认 1。
- A：一条脚本路径；任务池 10/100；**只读靠提示词**（`script.ts:842`、`:873` "Do not modify files"）；
  写域冲突靠串行化（`writesConflict`、`script.ts:583-599`）——是"降并发"而不是"隔离"。
- 判定：**A 的失败语义与报告不变式比 B 细，B 的隔离/上下文传递/运行期控制比 A 厚。**
- 可学（按性价比）：① 子代理的只读要用工具白名单保证（DSH 若没有 capability mode，
  至少把 `writesPaths: []` 变成对 worker 的硬约束并让它出现在报告里）；② 给任务一个
  可续跑的句柄语义（哪怕只是"先派发、稍后收结果"），否则长任务只能同步阻塞；
  ③ 把 `resumeDecision` 接上（见 2.9）。

### 2.4 完成判定（`04-verify.md`）

- A 的判定是**结构性**的：输入层判据非空/去重/归一化后互异（`input.ts:123-137`）；verifier
  必须逐条复制判据并给 `met`+非空 `evidence`（`script.ts:843-845,1134-1150`）；`issues`
  散文被剥夺判决权（`:1106-1117`）；宿主再独立重算 `passed`，`confirmed` 还要与最后一次验证
  记录逐字节一致（`report.ts:462-500,566-608`），任一不符整份报告降为 `failed`。
- B 的独立对抗验证只存在于 goal 子系统：completion evaluator → **3 个 skeptic 冷面板，
  默认 refuted**（`goal_verifier_prompt.md:1`）、多数决、传输失败即 refute、gaps 双向回灌 +
  反棘轮（`goal_support.rs:577-586`）。非 goal 路径没有 verifier 子代理（`NOT_FOUND`），
  只有主提示词一句纪律。
- 判定：**A 在"证据可追溯"上超过 B，B 在"对抗立场"上超过 A，B 还有一个 A 没有的机器闸门。**
- 可学：① `commandsRun[].status='passed'` 目前**从不校验是否真跑过**（`script.ts:1073-1080`）；
  B 用 Stop hook 的退出码阻止收尾（`hooks/dispatcher.rs:470-540`）——A 可以把"有 passed
  命令"提升为 evidence 的一部分。② 把上轮 gaps 同时回灌 worker 与 verifier（A 只给 worker
  `PREVIOUS ATTEMPT RESULT`，`script.ts:833`）。③ 引入 `unverifiable` 出口（B 有，
  `goal_verifier_prompt.md:46`；A 只能塞进 `quality` 白烧重试）。

### 2.5 上下文与记忆（`05-context.md`）

- B 把上下文当有刻度的资源：50% 裁旧 tool result（`xai-chat-state/src/actor/request_builder.rs:127-175`）
  → 85% 压缩（`queries.rs:75-95`）→ 摘要 + 最近原文 + AGENTS.md 重注入 + `compaction/segment_*.md`
  回捞指针；压缩前跑独立 memory flush，前后有 `PreCompact`/`PostCompact` 钩子；另有
  `xai-grok-memory` 双管线长期记忆与 `resume_status.json` 冷恢复快照。
- A 走"文档即记忆 + 台账"：`docs/knowledge` 9510 行靠 AGENTS.md 人工纪律，插件只**只读回捞**；
  运行中是 append-only `archive.jsonl`（事发即写、幂等、CLI 可读回）；checkpoint 已接线但
  `resumeDecision` 无生产调用方；**全字符预算，无 token 感知**。
- 判定：**A 的记忆制度（证据等级词表、决策台账、"没做也要写"、台账脱离宿主可读）是 B 没有的
  长处**；B 的运行时压缩/恢复是 A 完全没有的能力。
- 可学：① 被丢弃轮次落盘 + 指针（B 的 segment 模式），A 现在只留 `[truncated]`；
  ② 回捞别按字典序前 12 个 md、每文件只读前 2400 字符（`gate.ts:358-366`）——
  大文件等于只看开头；③ token 估算必须**包含工具输出**（`compaction.rs:2094` 的做法），
  溢出要作为"压缩后重试"的独立动作，而不是"这个模型不行，换 route"。

### 2.6 工具契约（`06-tools.md`）

- B：四层契约（trait + metadata + registry + 预设组合），52 个工具，单预设只见 3–25 个；
  输出五级台阶（`offset/limit` 行窗 → 5 MB 硬顶 → 掐中间留头尾+日志路径 → `truncated`
  显式字段 → `RenderLimited` 错误族）；`ToolError{kind(20), detail, details, source}`，
  `detail` 给模型、`kind` 给机器；描述是 MiniJinja 模板（`${{tools.by_kind.X}}`），
  另一个工具缺位时那段话自动消失；工具名被当成一等公民（`task`→`spawn_subagent`）。
- A：1 个工具，`objective`+`tasks`，`output.schema` 只写 `{type:'json'}` 却在 `report.ts`
  手写 20+ 守卫；8000 字符硬截断后让模型"去看 canonical 结果"而模型拿不到（`report.ts:11,892-894`）；
  错误是 6 处拼字符串、无 code；README 限制表已陈旧。
- 判定：**A 的工具面设计是"一个大工具 + 宿主不变式"，B 是"小工具组合 + 模型编排"**——
  这是两种产品形态，不是技术债。但**契约细节可抄**。
- 可学：分级截断（`section/offset` 把手）、错误带 `kind`（DSH 的 `ToolFailure.info` 本来可用）、
  描述与 systemPrompt 段收敛为一次插值渲染、README 数字对拍测试。

### 2.7 权限与沙箱（`07-sandbox.md`）

- B 四层：L0 进程级 `nono`→Landlock/Seatbelt（**apply 失败只 warn 继续裸跑**，
  `xai-grok-sandbox/src/lib.rs:207-217`）；L1 每命令 wrapper，macOS Seatbelt / Linux bwrap，
  "wrapper 失败=拒跑"；L2 每子进程 seccomp 断网；L3 逻辑审批。默认 profile `workspace`、
  每命令沙箱默认 **Off**、审批默认 `ask`；`dontAsk` 的真实语义是**静默拒绝**；
  headless 无人可问时每个审批直接 `Cancelled`。
- 配置哲学值得逐条抄：**只能收紧**（env>remote>user>workspace，下层只可加严，拼错不当成 Off，
  读不到的层按最严计，`sandbox_mode.rs:106-137`）；放行粒度 `GrantScope(Call/Session/Workspace/Global)`
  + `Expiry` + "顶层目录/深度<3 不提议"；"无人可问"是一等状态（`NO_OPERATOR_TEXT`，
  不说"用户拒绝"）。
- A：无自有沙箱/审批/白名单（`src/` 无 `child_process`），全交 DSH——方向正确。
- 判定：**A 的正确姿态是"不自己造"；A 的两个缝是：内存 `.md` 正文裸拼进 prompt
  （`gate.ts:247-252`、`:421`，而同仓对 executor 结果已有 `untrusted` 标注 `script.ts:854`），
  以及子代理只传 `{provider,model}`、无最小权限概念。**
- 可学：内存围栏（含定界符转义）；报告里加 `boundaries{sandboxMode, approvalPolicy, degraded[]}`
  （照 `types.rs:14-26` 的 `enforced: Option<bool>`）。

### 2.8 扩展模型（`08-extension.md`）

- B 四套面向使用者的声明式表面：`[mcp_servers.*]`、`SKILL.md` 目录树、插件目录+市场索引、
  hooks JSON/TOML，加 agent frontmatter 横切。全部启动时发现、三类支持热重载、权限收在
  folder-trust 一处、**失败一律 fail-open**。15 事件/5 类闸门，其中 `updatedInput` 能静默
  改写工具参数。
- A 一套面向插件作者的代码表面：一行 bundle patch + TS 模块（`ctx.tools.register`、
  `ctx.systemPrompt.section`、`ctx.settings` 投影、`ctx.effect`），唯一事件挂点 `agent/pre-step`。
- 判定：**事件粒度差两个量级，但 DSH 侧挂点是齐的**（`agent/*` 12 个、`tools/*` 6 个）；
  A 只用 3 个，其中只有 1 个能改控制流。**"能不能改输入"是结构差异**（DSH 的
  `PreStepDecision` 只有 `reject|enter`），不是 A 的选择。
- 可学：① skills 的文件式发现（`paths/ignore/disabled` 三段收敛）——A 的验收口径/模板可以
  变成可发布目录而不是 schema 键；② 把 plan/verify/synthesize 暴露为**只读观察点 + 唯一阻断点**
  （对应 B 的 Stop gate），观察点 fail-open、前门仍 fail-closed；③ 改写要留三要素，
  插件注入文本自带包裹标记与转义。

### 2.9 生命周期与可观测性（`09-lifecycle.md`）

- B 的长任务有两种形态：turn 与 goal。goal 有 8 态状态机（Active/UserPaused/BackOffPaused/
  NoProgressPaused/InfraPaused/Blocked/BudgetLimited/Complete），**每个暂停都有具名原因且可恢复**。
  checkpoint 是"每轮一份文件全文快照"，`/rewind` 轮级（TUI 目前只回对话、不动文件）。
  resume 恢复"记录"不恢复"进程"，并注入一次性 `resume_status` 明确告知"这些子代理已被取消"。
- A 只有引擎三档 stopReason（completed/cancelled/error）+ 报告状态，**没有"暂停"这个概念**；
  checkpoint 是运行状态快照（不含文件内容），`resumeDecision` 标 `wired:false`；
  四层持久化其实不缺落盘，**缺的是"读回来用"**。
- **已知缺口的根因（r9 拆成三层，都可核实）**：
  ① 引擎 `phase()` 的播报只写进后台 job 日志，**从不写入会话流**（`dsh-tool-workflow/lib/index.js:21-31`）；
  ② A 给每个成员都显式写了 `phase: 任务 n · 标题`（`script.ts:1852/1886/1912/1950`），
  覆盖了引擎 `opts.phase ?? currentPhase` 的回退（`runtime.ts:177`），于是没有成员落进
  `执行`/`检查` 段；
  ③ 详情阶梯 L1 没有写入方、L2 读不到子会话原文，全部落到 L3 `not-reported`。
  反证：A **已经订阅** `workflow/phase`，只是把它写进了 checkpoint 文件（`wiring.ts:711`），
  没写进会话。
- 判定：**A 缺的不是数据，是一根从"已订阅"到"会话事件"的线，加上"一个字段只表达一个维度"
  （B 用 todo 表任务、`PhaseChanged` 表阶段，两者正交；A 的 `phase` 同时当分组和阶段，只能二选一）。**
- 可学：① 把 `workflow/phase` 写进会话，并让脊段认它（直接修缺口）；② 给 checkpoint 一个
  读取入口（把死代码接上）；③ 段级来源 + 中断归因（谁杀的）写进会话。

### 2.10 工程与发版（`10-engineering.md`）

- B 的质量门非常"rustc 味"：97 个 crate root `#![deny(clippy::indexing_slicing)]`、
  12 条**带原因**的 `disallowed-methods`、`[workspace.lints]` 只装 allow 做"继承豁免"、
  toolchain 精确 pin `1.94.0`、DotSlash sha256 锁 protoc、5 档 profile。
  **最大的一处方法差异：文档是被测试钉住的产物**——`include_str!` 把 39 篇 user-guide 编进
  二进制（缺文件=编译失败），并有测试断言每个 wire 字段、每个内置项、每个写死的数字都必须
  出现在指南里（`status_line_tests.rs:355-420`）。
- A 的门禁是"版本三方对齐 + 产物幂等"：`release.yml:35-96` 校验 tag↔package.json↔changelog，
  `lib/` 幂等是 CI 硬门禁，验收矩阵连首次发布失败的 run id 都留档，测试真实性有措辞级规则。
- 判定：**A 在发版纪律上比 B 强（B 的公开树根本没有 CI）；B 在"文档/数字不许腐坏"上比 A 强。**
- 实证腐坏：`README.md:311` 写"366 deterministic tests across 22 files"，实际 **51 文件 / 951 测试**；
  `ACCEPTANCE.md:56` 写"264 tests / 18 files"；`README.md:273-280` 限制表还是 3/6，代码是 10/100。
  **687 个测试的代差无人发现**——这正是 B 用测试钉文档要解决的病。
- 可学：① `test/docs-contract.spec.ts`：拿 `CONFIG_KEYS`（`config.ts:157`）与
  `REMOVED_CONFIG_KEYS`（`:169`）对两份 README 做双向断言，纳入 `npm run ci`；
  ② `test:unit` 手工列 18 个 spec（`package.json:61`，实际 51 个）→ 改自动发现 + 例外显式声明；
  ③ lint 引入"带原因的禁令表"（禁深 import `@deepseek-ai/dsh-*`、禁 `paths/config` 之外直读
  `process.env`、禁 `test/` 内 `vi.mock`）；④ 把分散的 5 个 test 辅助收成共享 harness 模块。

---

## 3. 学生已经学过的（不要重复教）

`docs/knowledge/RESEARCH.md:79-186` 已记录一次完整的源码级吸收，落在代码里的有 7 项：

| 老师机制 | 学生的落地 | 证据 |
|---|---|---|
| `parallel(jobs)` barrier | 有界 worker 池 + 脚本内调度 | 已实现 |
| 每 run 信号量 | `maxConcurrency` 10/100 + 引擎槽位 | 已实现 |
| planner `output_schema` | `agent({schema})` 对象根 schema | 已实现 |
| claim-ID 集合相等 | 判据条数相等 + 逐条唯一匹配 | 已实现（A 更硬） |
| schema 契约重试 1 次 | 结果校验失败触发有界 task 重试 | 已实现 |
| 4 个并发 run/会话 | `maxActiveRuns` 2/8 | 已实现 |
| journal / pause / resume | 明确不移植（D-005） | 不回补 |
| read-only capability mode | **仅提示词**，无 DSH capability mode | NOT_IMPLEMENTED |

结论：**"策略层"已经学完，剩下的都是"运行时层"。** 上表最后一行是唯一被官方承认的欠账，
而 `03-subagents.md` 把它的后果量化了：verifier 技术上仍可写盘。

---

## 4. 还能学什么：按杠杆排序

### P0 — 修已知缺口 / 补最贵的洞（4 条）

1. **上下文预算 + 分层压缩 + 溢出即压缩重试**（A 完全缺，`NOT_FOUND`）
   - 现在：`history.ts:124` 的 `composeObjective(..., objectiveChars)` 是全字符上限；
     `config.ts` 的 `FIXED_HISTORY_CHARS/TURNS`；没有任何 token 估算。
   - 学什么：50% 裁旧 tool result → 85% 压缩 → 摘要+最近原文+指令文件重注入 → 回捞指针；
     估算必须含工具输出；溢出作为独立重试动作（`sampler_turn.rs:1949 CompactAndResubmit`）。
   - 落点：`src/history.ts:124`、`src/script.ts:500-513`（`callRole` 失败分支）、`src/config.ts` FIXED 区。
   - 验收：构造一个超窗 prompt 的单测，断言"压缩后重试"发生且 route 不变。

2. **把 checkpoint / resume 接线**（A 已写好、`wired:false`）
   - 现在：`checkpoint/wiring.ts:210-228`；`resume/validator.ts` + `policy.ts` 只有 `test/` 调用方。
   - 学什么：B 的"恢复记录不恢复进程"诚实语义 + 一次性 `resume_status` 告知；恢复要说明
     哪些子代理被取消、哪些任务需重跑。
   - 落点：`src/checkpoint/wiring.ts`、`src/resume/policy.ts` → `carryover` seed、`src/run.ts` 启动段。
   - 验收：kill 一次 run 后重启，检查 status 与证据账。

3. **进度缺口：`workflow/phase` 写进会话**
   - 现在：Progress 页 Execute/Verify 段报 `Not reported in the events`（`STATE.md` 已列
     "已知缺口"）；根因三层见 2.9。
   - 学什么：B 的 `PhaseChanged` 是一等事件；**阶段不能从成员反推**，要独立事件；
     "任务"与"阶段"用两个正交字段（B 是 todo 工具 + PhaseChanged）；`not-reported` 要升级为
     段级来源，区分"没跑 / 跑了没记 / 记了读不到"（B 的 resume 提示会写明"这些子代理已被取消"）。
   - 落点：`src/records.ts`（把已有 `workflow/phase` 订阅再写一条会话事件，复用
     `phaseFromTitle`）、`src/progress-tab.ts`（脊段认 phase）、`src/script.ts:1852` 一带
     （成员 phase 改成"任务维度"，不再兼任阶段）、`src/run.ts:748`。
   - 验收：真机跑一次，脊段四段都有值；缺数据时报告能指出缺在哪一层。

4. **计划与判据对用户可见**
   - 现在：一行 `Plan: source; N task(s); M verified`；`acceptanceCriteria` 用户从未见过。
   - 学什么：B 的"用户看到的就是磁盘上写的"（`exit_plan_mode/mod.rs:15-18`）。
   - 落点：`src/report.ts:786`（`renderReport`）、`src/delivery/index.ts`。
   - 验收：报告里每个任务带判据与 evidence；`showDiagnostics=false` 时仍在。

### P1 — 机制补强（5 条）

5. **验证闸门与对抗立场**：`commandsRun.status='passed'` 要能证明真跑过；上轮 gaps 回灌 verifier；
   新增 `unverifiable` 出口；高价值档可选择性引入 3-panel 默认否决（A 的 supervisor 已存在但默认关）。
6. **失败保真**：把 `run.ts:646-656` 的字符串相等匹配换成带语义的 cause 对象（对应 B 的
   `ToolLoop` 七变体），attempt 级加 stationarity 检测（见 2.1）。
7. **工具契约**：分级截断 + `kind` 错误码 + 描述模板化 + README 数字对拍。
8. **子代理隔离**：只读用工具白名单而非提示词；`writesPaths: []` 变硬约束；给长任务一个
   后台句柄语义（至少"先派发、稍后收"）。
9. **生命周期状态机**：给"暂停"具名原因（backoff / no-progress / infra / budget），
   而不是只有 completed/cancelled/error。

### P2 — 长期或需宿主支持（4 条）

10. **hooks/观察点**：把 plan/verify/synthesize 暴露为只读观察点 + 唯一阻断点（B 的 Stop gate
    用退出码阻断收尾）；DSH 的 `PreStepDecision` 不支持 `updatedInput`，这条要等宿主。
11. **网络维度**：B 有 seccomp + egress proxy + `HostPattern`；DSH 明确"网络与进程可见性不在
    词汇表内"——A 至少应在报告里 `degraded[]` 声明这一维无人兜底。
12. **工程纪律**：文档契约测试、自动发现 spec、共享 test harness、带原因的 lint 禁令表。
13. **记忆回捞策略**：按文件名优先级/相关性选择，替代字典序前 12；被丢弃轮次落盘 + 指针。

---

## 5. 明确不要学的（负向清单）

| 不要学 | 理由 |
|---|---|
| Rhai/Rust 运行时、journal 64 MiB、budget lease | D-005 已裁定：与 DSH 引擎重复，且不可移植。重开这条等于重写宿主 |
| **把主循环交回模型** | 会直接摧毁 R-001（主模型不得决定是否走 workflow）。A 的产品价值就是"必过流程" |
| hooks 的 fail-open | A 的契约相反：观察点可以 fail-open，前门必须 fail-closed |
| goal 的 strategist "只改 HOW" 作为 replan 模板 | A 若要 replan，应允许改"任务边界"，但不许改已验证任务的判据——照抄会锁死 |
| `SOURCE_REV` / 拒绝外部贡献 | 与 A 的记忆/交接纪律、Issue 协作协议直接对立，会把"仓库即真源"降格成影子 |
| 老师的"公开树半成品感"（注释引用不存在的 just/Bazel/CI） | 那是导出快照的副作用，不是纪律范式 |

---

## 6. 立即可做的三个低成本修正

1. `README.md:311`、`ACCEPTANCE.md:56`、`README.md:273-280` 三处数字/限制已腐坏 → 改成真值
   （51 文件 / 951 测试；10/100），并加一条对拍测试防复发。
2. `package.json:61` 的 `test:unit` 手工列 18 个 spec（真实 51 个）→ 自动发现。
3. 内存正文在 `gate.ts:247-252`、`:421` 裸拼 → 加围栏标记与转义，与 `script.ts:854` 的
   `untrusted` 标注保持一致。

---

## 7. 证据索引

| 主题 | 报告 | 行数 |
|---|---|---|
| 主循环与控制流 | `.tmp/research/01-loop.md` | 501 |
| 规划与分解 | `.tmp/research/02-plan.md` | 326 |
| 子代理与调度 | `.tmp/research/03-subagents.md` | 279 |
| 验证与证据 | `.tmp/research/04-verify.md` | 228 |
| 上下文与记忆 | `.tmp/research/05-context.md` | 311 |
| 工具契约 | `.tmp/research/06-tools.md` | 572 |
| 权限与沙箱 | `.tmp/research/07-sandbox.md` | 344 |
| 扩展模型 | `.tmp/research/08-extension.md` | 267 |
| 生命周期与可观测性 | `.tmp/research/09-lifecycle.md` | 573 |
| 工程与发版 | `.tmp/research/10-engineering.md` | 319 |

十份报告的原始笔记（含 B 侧深挖）在 `.tmp/research/notes-b-*.md`（3 份，~2700 行）。
`.tmp/` 不入库；需要留存时把该目录搬到 `docs/research/` 再提交。
