# Plan — 运行中转向 (L1) + 受限依赖图 (DAG) + 并行策略（多线程执行版）

- 日期：2026-11-21
- 状态：Q1–Q11 已定齐；执行结构已按波次重排（只聊不实施，动工另行授权）
- 执行方式：下述 Wave 0–4 即未来的 DAG 波次。Wave 内部任务互相独立，可全并行；
  Wave 之间串行（后一波依赖前一波的输出）。`maxConcurrency` 默认 10，4 并行无压力。

## 1. 目标（按波次排）

- Wave 0（先行，1 任务）：Q4 薄语义设计 —— 三态定义 + 报告判定表 + 取消结算 + 继承规则，用户过目拍板。
- Wave 1（并行，4 任务，无依赖）：显示层四小版 —— Q7 复核改名 / Q9 分钟制 deadline / Q10 面板三处 / Q11 转交规则 (c)。
- Wave 2（依赖 Wave 0 + Wave 1，并行，3 任务）：L1 继承 + Q6 脚本内协作式超时 + Q8 守卫模型（含 wait×2 规则 B）。
- Wave 3（依赖 Wave 2，1 任务）：Phase 2 DAG 调度实现（波次 + `dependsOn` 校验 + blocked 传染 + 事件驱动推进）。
- Wave 4（依赖 Wave 3，1 任务）：L1 + DAG 合流 + 并行解释性 + 全量验收（A1–A6、`npm run ci` 全绿）。

非目标：单子任务级热取消/热插；动 DSH core；引擎级暂停/恢复 journaling。

## 2. 约束与现状

- 脚本静态：`objective + tasks` 进沙箱冻成 `args JSON`，跑中 host 够不到 worker 池。
- 取消只有整轮：`run.cancel(reason)` → `keepCancelledWork()` 结算，继承轮状态最多 `partial`。
- 继承件已有但未接线：`checkpoint` + `carryover` + `resumeDecision`（无生产调用者）。
- 任务当前无依赖：`dependsOn` 被拒绝；单线三成因：真依赖不敢拆 / planner-fallback 按字符切段 / 小任务不值得拆。
- 改动面只在插件侧：脚本排波 + host 校验 + 报告语义；不动引擎、不动 core。分版本发：Phase 1 → Phase 2 → 合流。

## 3. 方案（按 Wave 组织，与 §1 对应）

### Wave 0 — 薄语义设计（1 任务，先行，无依赖）

- 输出一份薄设计文档，用户过目拍板后再写码。内容：三态定义（§4）+ 报告判定表 +
  取消结算（`keepCancelledWork` 遇 `blocked` 修形）+ 继承规则（retain/redrive/reverify/replan）+
  回避规则（verifier 不能复核自己 verify 的任务，见 §10 S6/Q5）。
- 这是后面所有 Wave 的输入，Wave 1–4 都依赖它。

### Wave 1 — 显示层四小版（4 任务，并行，依赖 Wave 0）

四任务互相独立，同属显示层、不动状态机，可 4 并行；建议打包一版先发。

- W1-T1 Q7 复核改名：`src/naming.ts` 两处中文 + 英文 `Supervisor→Reviewer` + 设置页字样；
  内部键不动；同步改 `test/naming.spec.ts:213`、`test/client.spec.ts:471` 字面断言。
- W1-T2 Q9 分钟制 deadline：设置页 `timeoutMs` 显示改分钟（存值仍毫秒 ×60000），hint 写默认 60 分钟、0=不限时。
- W1-T3 Q10 面板三处：(a) prompt 首行统一 `角色 · 任务标题`（复用 `childDisplayTitle`，48 字截断保留）；
  (b) 任务组标题不截断 + 删 `x/y` 计数 + 运行中时间动态 tick（1s，仅 doing 行，`prefers-reduced-motion` 降级静态）；
  (c) 成员链收紧凑徽章组。
- W1-T4 Q11 转交规则 (c)：默认只转交人话块，机器台账存记录备查；`showDiagnostics` 开才附全文；
  截断按句子边界，不断词。验收：重放无 `src/…:行号`、`code=`、`ledger`、无半截英文句。

### Wave 2 — 运行时三件套（3 任务，并行，依赖 Wave 0 + Wave 1）

三任务互相独立（不同文件、不同机制），可 3 并行。

- W2-T1 L1 重开继承（Q2）：新轮 `composeObjective` 附继承摘要（单开 8K，按任务从旧到新砍，保 verified 清单先砍 details）；
  `resumeDecision` 接生产调用者（retain/redrive/reverify/replan 输出 + 理由 + 变更字段清单，S6）；
  继承轮不标 `completed`（除非本轮全过且无 fallback）；世代号防旧轮迟到写入污染新轮（S1）。
- W2-T2 Q6 脚本内协作式超时：(1) 每次 `agent()` 超时竞速（`childTimeoutMs` 默认 10min，超时按失败结算进 bounded 重试）；
  (2) worker/verifier/复核提示词加 `timeout 120` 铁律；(3) 守卫单孩子预算单开做最后兜底（整轮 cancel）。
  超时分级写成纯函数 + 单测（S7）。
- W2-T3 Q8 守卫模型：设置页第一位新增单模型字段 `守卫`（单字段非链，选已有路由，默认复用 `triageModel` 便宜路由）；
  超时先取证再判（prompt 摘要/已产出/心跳/历史参照），判 `wait` 延长 5min 最多两次（规则 B：剩多少给多少，到点照停），
  判 kill 进任务重试；AI 自身失败→ kill-retry；adjudication 纯函数 + 单测（S7）。

### Wave 3 — DAG 调度实现（1 任务，依赖 Wave 2）

- planner 输出 `waves: Task[][]`；`dependsOn` 只认上游波次 `verified`（S2b），禁环/跨波乱指/自指，非法拒整个 plan。
- 调度按波推进，事件驱动（任务结算触发下一波就绪检查，不另起 timer，S9）；波内 `writesPaths` 重叠串行继续有效。
- 失败传染：上游 `failed` → 下游 `blocked`（§4 三态）；`blocked` 不烧重试；下游无上游 evidence 摘要则判失败（S4 硬规则）。
- 波次上限 8，波内加总受 `maxTasks` 约束；报告按波渲染；`partial` = 有 verified 混 failed/blocked。
- planner schema 保持最小（`waves + dependsOn`），校验放脚本/host 侧（X3）。

### Wave 4 — 合流与验收（1 任务，依赖 Wave 3）

- L1 + DAG 合流：重开时已验证波直接 `retain`，只重排未完成波 + 新增意图；
  `carriedPendingRequest / resumedTarget` 推广为通用需求合并。
- 并行解释性：单线报告一句话 `single-wave because …`；planner 提示词加拆分纪律。
- 全量验收 A1–A6（见 §5），`npm run ci` 全绿；并发/重试上限不变。

### Phase ↔ Wave 对照（备查）

- 原 Phase 1（L1）= W2-T1；原 Phase 2（DAG）= Wave 3；原 Phase 3（合流）= Wave 4 前半；原 Phase 4（解释性）= Wave 4 后半。
- Wave 0 = 原 Q4；Wave 1 = 显示层四小版（Q7/Q9/Q10/Q11），原计划外，为加速单拎一波先发。

## 4. 已定语义

- Q1 已定：`blocked` 为独立 task 状态（方案一）。
- 任务终态三态：`verified`（过了）/ `failed`（干了但没过）/ `blocked`（没跑，前置失败被连累）。
- `blocked` 不烧重试，不算 verifier 失误；上游修好后下游可解除并重跑。
- 报告判定：含 `blocked` 的轮总状态不为 `completed`；有 verified 混合 failed/blocked 记 `partial`。
- 状态机、报告校验、`keepCancelledWork`、进度面板凡断言 `status ∈ {verified, failed}` 处都要加第三态（实施时逐处改）。

## 5. 验收标准

- A1：跑一半发新需求，旧轮 stopped，新轮带上上一轮 verified 证据，不重做。
- A2：非法依赖 plan（环/跨波乱指/自指）被拒绝，理由指名 offending task。
- A3：两波 DAG：第一波并行峰值 >1，第二波在其全部完成后才启动。
- A4：上游失败，下游记 `blocked` 不记 `verified`，总状态不为 `completed`。
- A5：小任务不再被硬拆；单线报告带原因句。
- A6：`npm run ci` 全绿；并发/重试上限不变（默认 3/1，硬上限 6/3）。

## 6. 风险与边界

- DAG 最大风险是语义：`blocked` 三态、报告判定、取消结算是连在一起的，先定语义再写码。
- 同 cwd 写冲突仍在：DAG 只解决顺序不解决隔离，写密集型仍建议 `maxConcurrency: 1`。
- 继承与上游摘要都有长度预算，超了只截断不补写，不编造。
- L2（任务边界收敛意图）本次不做，留作 Phase 2 后的可选项。

## 7. 附：监督 / 检查 / 守卫三分工（2026-11-21 用户问）

- 检查（verifier）：每任务一次，事后质检。worker 干完，verifier 重新看文件/跑命令逐条核对 acceptanceCriteria，
  出 `pass/fail`。只答“这活干得对不对”，不管别的任务、不管运行时。
- 监督（supervisor）：每任务一次，串行复核。verifier 之后再派一个模型，两边都不信，自己重查一遍；
  只能 fail 不能 pass（verifier 说 fail，supervisor 救不回来）。只答“verifier 的结论站得住吗”，也是事后、逐任务。
- 守卫（guardian）：整轮常驻，并行看活。跟任何任务无关，只看引擎事件 `agent-start/agent-end`，
  答“孩子还活着吗”。卡死（超时/心跳丢）就整轮 cancel 一次并记一条 Guardian finding，只进 `errors`，不改 `status`。
  零模型调用，不评质量。
- 一句话：检查管“对不对”，监督管“查得严不严”，守卫管“死没死”。
- 用户意图（已记录）：监督应贯穿全程、监控子代理状态、异常可处理。现状差距：
  supervisor 是串行事后复核，不是运行时监控；运行时监控实际由 guardian 做，但它只能整轮 cancel，
  不能定向处理单个子代理（无 per-child cancel 句柄，见 `src/guardian.ts:63-74`）。
  后续方向：DAG 波次推进时guardian/supervisor 的 findings 可作为波间门控信号，但单子任务级定向干预仍在非目标内（需引擎能力）。
- 用户定案（2026-11-21）：双环节保留；`supervisor` 显示改名 `复核`（仅显示名，内部键不动）。
  改名范围（已定）：`src/naming.ts` 中文 `roles.supervisor: '监督'→'复核'`、
  `callSubjects.supervisor: '监督调用'→'复核调用'`，英文 `Supervisor→Reviewer`；
  设置页 `监督` 字样同步改 `复核`。`RoleName='supervisor'`、配置键 `roles.supervisor`、报告字段一律不动，零迁移成本。
  测试同步：`test/naming.spec.ts:213`、`test/client.spec.ts:471` 字面断言随改。
- 用户定案（2026-11-21）：守卫按“防命令卡死”重调。现状问题：子预算 = 整轮 deadline（默认 60min→单孩子等 10min），
  模型写错命令无限等待要 10 分钟才整轮 cancel。方向见 §8 Q6。

## 8. 待拍板（Q6 新增，Q5 已定）

- Q5 已定：双环节保留。另：复核默认关闭（`roles.supervisor` 空链即不跑），按需启用，速度影响可控。
- Q6 已定方向（2026-11-21）：用户要的是“卡住的孩子停掉、换个说法继续”，而不是“整轮掐掉”。
  引擎能力边界（已验 core 源码）：`WorkflowRun` 只有整轮 `cancel()`，无单孩子 cancel 句柄；
  `workflow/*` 事件是 observe-only，监听器拿不到取消权。结论：host 侧定向杀单个孩子做不到。
  定案 = 脚本内协作式超时（优于 abc）：
  (1) 脚本给每次 `agent()` 加超时竞速：超 `childTimeoutMs`（默认 3min，待定）该次调用按失败结算，
  该任务进 bounded 重试（换 wording/修命令继续），不整轮 cancel。
  (2) 命令层自保：worker/verifier/复核提示词加“shell 命令必须带 `timeout 120`”，命令级 hang 2 分钟自退，错误可分类。
  (3) 守卫保留做最后兜底：单孩子预算单开（与 deadline 解耦，默认值待定），触发仍是整轮 cancel，
  只处理“脚本自己也卡死”的极端情况。
  三层漏斗：命令 2min 自退 → 任务 3min 换说法重试 → 整轮兜底。误杀可恢复，符合用户初心。
  待定：`childTimeoutMs` 默认值（建议 3min）；提示词 timeout 秒数（建议 120s）。
- Q8 部分定（2026-11-21）：超时后先取证再判，不断言。判停者 = 设置页新增单模型字段 `守卫`，
  位列第一位（拆活/干活/检查/复核/收尾之前）；默认复用 `triageModel` 便宜路由。
  判 `wait`：延长 5 分钟，最多两次（两次用完还不回，按卡死走 kill-retry，不再问 AI，防无限续）。
  判 kill：进任务 bounded 重试（换说法/修命令继续），整轮不死。AI 调用本身失败/卡住 → 按 kill-retry。
  已定（2026-11-21）：规则 B——延长只在 deadline 允许范围内给，剩多少给多少，到点整轮照停；
  deadline 是生死线，不为单个孩子突破。
  已定：`childTimeoutMs` 默认 10 分钟。总账：10 + 5 + 5 = 最坏 20 分钟（整轮默认 60min，富余）；
  整轮 deadline 若短于 20min，延长被截断，到点照停。
- Q7 已定：显示改名 `监督→复核`（`src/naming.ts` 两处中文 + 英文 `Supervisor→Reviewer` + 设置页字样），内部键不动。
  注意 `test/naming.spec.ts:213` 与 `test/client.spec.ts:471` 有字面断言，改显示需同步改测试期望。
- Q9 新增（2026-11-21，用户报障）：设置页找不到 deadline。实查：`timeoutMs` 字段存在，
  位于第 3 组“下多大力气”第三行（`src/client/index.js:1566`），单位毫秒（3600000=60min）。
  用户视角它“不存在”= 标签 `运行死线（毫秒）` 可读性差 + 毫秒不直观。定案：改显示为分钟（`死线（分钟）`，
  存值仍毫秒 ×60000），并在 hint 写明默认 60 分钟、0=不限时；Q6 的 `childTimeoutMs` 与 Q8 的守卫模型同组新增时一起用分钟。
- Q10 新增（2026-11-21，进度页三处 UI，用户截图报障）：
  (a) “N 个子智能体”标题：`任务团队 child N` 不直观。根因：引擎 host 硬编码 `label: ${meta.name} child ${callId}`，
  我方 twin 引擎（`src/team-engine.ts`）已用 prompt 首行重写 label，但首行是任务标题原文，角色前缀只在部分 prompt 有。
  定案：统一 prompt 首行格式为 `角色 · 任务标题`（如 `规划 · XXXX`、`执行 · XXXX`），复用 `childDisplayTitle()`（`src/script.ts:755`），
  `team-engine.ts` 的 `CHILD_LABEL_LIMIT=48` 截断保留。`meta.name`（`任务团队`）是否一并改，动工时定。
  (b) 任务名截断 + `3/3`、`1/1` 后缀 + 时间静态：根因 `src/naming.ts` `TASK_TITLE_DISPLAY_LIMIT=24` 截断 +
  进度面板渲染 `任务名 + attempt计数`；时间来自 `progressNodeDuration()`（`startedAt/endedAt` 求和，
  `src/client/index.js:2931`），只有结算行才有 `endedAt`，运行中行无结束时间故显示静态。
  定案：面板任务组标题不截断（完整任务名换行显示），删除 `x/y` 计数后缀（尝试数只在失败/重试行保留，不在标题占位）。
  时间改动态：运行中行用 `now - startedAt` 每秒 tick（1s `setInterval`，仅当存在 `doing` 行时启动，无则停；
  `prefers-reduced-motion` 下降级为静态），结算行保持实测值。tick 只重算时间文本节点，不重渲染整树。
  注意 `truncateTaskTitle` 另供 run title（80 字上限，`runTitle()`）使用，动时区分两处调用点。
- Q11 新增（2026-11-21，用户报障 `session-77a3f6fb` seq 1982/1986）：门控转交的 `<<<GROK-WORKFLOW-REPORT>>>` 块
  把 validated report 的机器文案（`At <=480 px …`、`RESUME code=none …`、`ledger` 行）原文塞给主模型复述，
  主模型被要求“逐字复述、不得增删”，于是英文机器账本 + 截断半句话（`the RSI heart…`）直接糊脸。
  根因链：`deliverReport`/`humanConclusion` 的人话块与 `relayText` 拼的 `Final answer` 机器块混在同一转交消息；
  主模型拿到“复述”指令后优先保真、不敢改写。定案（三选一，动工时定）：
  (a) 转交只给人话块，机器台账改存 `plugin:grok-workflow/delivery` 记录备查，主模型复述人话即可；
  (b) 转交保留全文但指令改写为“用人话转述结论，数字与文件路径保真，机器字段名不得出现”；
  (c) a+b：默认 (a)，`showDiagnostics` 开时才 (b)。
  另：`humanConclusion` 的 `MAX_HUMAN_CHARS=2400` 截断会砍半句话，转述指令下截断必须落在句子边界（按句截，不断词）。
  验收：同一条核验报告重放，主模型输出无 `src/…:行号`、`code=`、`ledger` 字样，无半截英文句。
  已定（2026-11-21）：选 (c)。默认只转交人话块；`showDiagnostics` 开时才附机器台账。
  (c) 子任务“执行→检查→监督”长条占满右半屏：根因成员卡片 `flex` 右对齐铺满 + 三段 label 全量渲染。
  定案：成员链收成紧凑徽章组（`执行 → 检查 → 复核` 一行徽章，不铺满；只在 hover/展开时显示详情），面板宽度上限收敛。
  三处同属进度页显示层，不动状态机；与 Q7 复核改名同批实施（`监督→复核` 显示统一改掉）。

## 9. 待拍板（原 Q2–Q4 已定，备查）

- Q2 已定：继承摘要单开预算 8K，与对话历史隔离，互不挤占。
  超限截断规则：按任务从旧到新砍，永远保留“哪些任务 verified + 一句话结论”，先砍 details。
- Q3 已定：DAG 第一版波次上限 8 波，波内任务加总仍受 `maxTasks` 约束。
  超波直接拒绝整个 plan（fail-closed），逼 planner 重新排。
- Q4 已定：先写语义设计（薄设计：三态定义 + 报告判定表 + 取消结算 + 继承规则），用户过目拍板后再写码。

## 10. dsh-agent-teams 研究结论（2026-11-21）

> 对照对象：`research/dsh-agent-teams`（NanmiCoder/dsh-agent-teams，`@nanmicoder/dsh-agent-teams@0.1.31`，配对 Harness `0.2.2-rc.5`）。
> 已读：README、`docs/usage.md`、`docs/quality-gates.md`、`src/scheduler.ts|state.ts|types.ts|mailbox.ts|members.ts|quality-gates.ts|tools.ts|harness-compat.ts|events.ts|snapshot.ts|profiles.ts`。
> 前提差异：对方是 host 侧常驻插件（continuable 子代理 + `agent/status` 事件驱动调度，不走 workflow 引擎，状态落盘 `<workspace>/.agent-teams/`）；
> 我方是脚本内调度（`ctx.workflowEngine` + 一次性 run）。以下均为模式层结论，不抄代码、不引依赖。

### 10.1 精华（建议采纳）

- S1 世代能力（attempt + attemptId）。它的做法：每次派工 `beginTaskAttempt()` 单调递增 `attempt` 并换新 UUID `attemptId`；
> 成员每次 `update` 必须携带当前 `attempt_id`，过期直接拒绝；转派先作废旧 attempt 并等待旧 worker 安静（quiesce）后新 attempt 才启动，
> 迟到写入永远覆盖不了新结果（`src/state.ts`、`src/scheduler.ts:358-443`）。→ 对我们的启发：L1 继承（retain/redrive）与取消结算必须有世代号，
> 否则被 cancel 的旧轮迟到写入会污染新轮。→ 建议采纳：carryover 给每个 retained 任务带上来源轮次 + 证据版本号；redrive 的任务世代号 +1，
> 旧轮残留写入按世代号丢弃。理由：这是对方用大量故障矩阵（50 迟到写入、7 路认领竞争）换来的不变量，比事后对账便宜。（对应 Q2）

- S2 终态只读 + 失败不解锁下游。它的做法：状态机 `pending→claimed→in_progress→completed|failed|cancelled`，
> `claimed` 禁止直跳 `completed`（必须先 `in_progress`）；`failed/cancelled` 永不解锁下游依赖；复活失败任务一律新建任务，
> 修理由因果边 `findingSourceTaskIds` 表达——因为“依赖一个 failed 任务等于永远不可认领”（`src/types.ts` issue #175A 注释）。
> → 对我们的启发：Q1 的 `blocked` 语义与之一致（上游 failed → 下游 blocked，不烧重试）。→ 建议采纳：
> (a) `verified/failed` 终态只读，`blocked` 解除只能重跑不能改状态复用证据；(b) 下游 `dependsOn` 只认上游 `verified`，
> 把这条写进 Phase 2 校验器 fail-closed 规则。理由：对方已证明这是防止“失败冒充完成”的最小机制。（对应 Q1、Q3、A2、A4）

- S3 上游证据摘要双预算 + 截断。它的做法：派工时附带已完成依赖的 output，单项上限 2K、总量上限 12K，超限从最旧开始丢，
> 逐项标 `[truncated]`（`src/scheduler.ts:45-48,157-177`）。→ 对我们的启发：Q2 已定 8K 单开预算 + “先砍 details 保 verified 清单”，
> 对方可直接对齐为“单任务上限 + 总量上限”双预算。→ 建议采纳：继承摘要格式定为 `单任务≤2K、总量≤8K、超限砍最旧任务的 details`，
> 与对话历史预算物理隔离。理由：双预算比单一总量更容易在 prompt 模板里强制执行。（对应 Q2）

- S4 完成时合同校验（机器强制，不靠 prompt 自觉）。它的做法：`create_task` 按 kind 强制要求合同字段
> （implementation/repair 必须有 objective+acceptance+inScope+verify）；`update_task` 按 kind 拒绝非法完成
> （review/requirements 无 `verdict=pass` 不得 completed；implementation/repair 必须附 acceptanceResults+commandsRun+in-scope changedPaths），
> 且明写“完成时审计不是 host 写入拦截，不伪装成安全边界”（`docs/quality-gates.md §2.2/§3.1`）。→ 对我们的启发：
> verifier/复核的判定也应是脚本侧机器校验（evidence 缺失即 fail），提示词只负责“诚实填写”，不负责“自觉守规”。
> → 建议采纳：Phase 2 把“下游 evidence 摘要缺失则判失败”（已在 §3）实现为校验器硬规则；超时失败（Q6）进重试时必须带可分类的错误，
> 不能只有一句话。理由：对方 847 行规格文档的核心就是“门禁是代码不是 prompt”。（对应 Q3、Q6）

- S5 自动修复环有上限 + 升级标志。它的做法：review 失败自动建 repair + 下一轮 review，但 `codeMaxRounds:3 / maxRepairAttempts:2` 到顶即停，
> 置 `escalated` 并升级给 Captain/用户；且 `halted`（人叫停）与 `escalated`（到上限）是两个不同标志，`create_task` 不能静默解除 halted，
> 恢复必须显式 `resume+reason`（`src/quality-gates.ts:40-48,933-989`、`docs/usage.md §团队状态文件`）。→ 对我们的启发有三：
> (a) bounded 重试耗尽后记 `partial` + 升级，不无限续（我们已有 maxRetries 上限，对齐即可）；
> (b) 取消→重开（L1）必须显式携带“继承什么 + 为什么重开”，旧轮 `partial` 结算保留，禁止新轮静默复活旧轮未完成任务；
> (c) Q8 的 `wait` 最多两次、之后按 kill-retry 走，正是“到顶即停 + 不再问 AI”的同构。→ 建议采纳。理由：防止自动循环吃掉用户控制权。（对应 Q2、Q6、Q8、A1）

- S6 合同修正走显式修订账本。它的做法：合同本身写错时由 captain 专属 `amend_task` 改写，非终态任务可用、review 通过后冻结，
> 每次修订记 `revisions` ledger（改了什么字段、旧值、理由）（`src/types.ts TaskRevision`）。→ 对我们的启发：
> L1 的 `replan`（需求变了）与“worker 擅自改 acceptance”必须区分：前者是新轮 planner 的合法输入，后者应拒绝。
> → 建议采纳：`resumeDecision` 输出 `replan` 时必须附理由 + 变更字段清单，写入报告可核查字段；运行中任务的 acceptance 只允许 planner 重排，
> 不允许 worker 自改。理由：把“需求变更”变成可审计事件，复核（supervisor）才有据可查。（对应 Q2、Q5）

- S7 规格先行 + 纯函数可测。它的做法：`docs/quality-gates.md` 自声明为“唯一执行规格”，先写失败测试再实现；
> 路由回退（`selectFallbackRoute`）、失败定级（`classifyMemberFailure`）都是纯函数，便于 TDD（`src/members.ts:192-298`）。
> → 对我们的启发：Q4 薄设计之外，Q8 的 wait/kill  adjudication 与 Q6 的超时分级（命令自退 / 任务重试 / 整轮兜底）应写成纯函数 + 单测，
> 不依赖引擎事件。→ 建议采纳。理由：超时/守卫逻辑最难复现，纯函数是唯一能进 `npm run ci` 的测法。（对应 Q4、Q6、Q8、A6）

- S8 显示与键分离。它的做法：面板把调用（call：`检查调用已结束`）与任务 verdict（`任务通过`）用两套文案严格区分，
> 行文案永远不能读出任务结论；内部 role 键与显示名解耦（`src/snapshot.ts VisualTaskState` 另有显示态）。
> → 对我们的启发：Q7 复核改名（仅显示，内部键不动）方向正确；另建议 `blocked` 的面板文案也要与 `failed` 严格区分
> （“未跑（前置失败连累）” vs “干了但没过”），避免用户把 blocked 当质量失败。→ 建议采纳。理由：与 `src/naming.ts` 既有语义红线同构，零迁移成本。（对应 Q7、Q5）

- S9 增量派工 + 波次天然对齐。它的做法：调度器每次只给真正 idle 的成员认领一个 ready 任务（mailbox 优先于新任务），
> 按成员逐个串行加锁认领（`kickMember` + `serializeMember` + `withTeamLock`）。→ 对我们的启发：Phase 2 波次推进不需要常驻轮询，
> 任务终态事件即推进信号；波内 `writesPaths` 重叠串行规则与对方“逐个认领”同构。→ 建议采纳事件驱动的波推进（任务结算时触发下一波就绪检查），
> 不另起 timer。理由：少一个常驻机制就少一类泄漏与竞态。（对应 Q3、A3）

### 10.2 糟粕/坑（建议避开）

- X1 无单孩子超时（正是我们 Q6 要修的坑）。它的做法：`deliverToMember` 的 `AbortSignal` 现场 `new AbortController().signal`，
> 从不设超时（`src/scheduler.ts:342,454`）；guardian 只能整轮 cancel，无 per-child 句柄；文档承认“队长离线时无法冷恢复”“主聊天窗 Stop 只取消队长当前轮次”。
> → 对我们的启发：这正是 §7 记录的现状差距在对方仓库里的完整复刻——host 侧做不到定向杀单个孩子。
> → 建议避开“host/引擎侧超时”路线，坚持 Q6 定案（脚本内 `agent()` 超时竞速 + 命令层 `timeout 120` 自保 + 守卫整轮兜底）。
> 理由：对方证明了此路不通；我们的孩子是脚本内 `agent()` 调用，竞速结算天然可行，这是架构差带来的优势，要保住。（对应 Q6）

- X2 版本耦合兼容层。它的做法：`src/harness-compat.ts` 705 行，为 Alpha.2→0.2.x 每一代写符号适配 + 双键探测（webServer/httpServer），
> 维护成本极高（整个 `docs/harness-0.2.x-pre-adaptation` 系列审计目录为证）。→ 建议避开：坚持 AGENTS.md 既有约束——只用文档化扩展点，
> 不碰 DSH core、不做版本嗅探。理由：单人维护的插件付不起这笔兼容税。（架构约束）

- X3 巨文件 + 工具爆炸。它的做法：`tools.ts` 2942 行、`quality-gates.ts` 2112 行、`members.ts` 1221 行，14 个模型可见工具 + 两阶段 staged 协议 + 命名 profile，
> prompt 协议节节加长。→ 建议避开：planner 输出保持最小 schema（`waves + dependsOn`），校验放脚本/host 侧做；Q3 波次上限 8（已定）之外，
> 再给单 plan 总任务数设硬顶（已有 `maxTasks`，沿用即可）。理由：协议越长 planner 越不遵守，机器校验比长 prompt 可靠。（对应 Q3、Q4）

- X4 真相放 host 侧的代价。它的做法：团队真相在磁盘 JSON + 进程内锁，多进程同时写不保证一致；队长离线整队冻结。
> → 建议避开：波次状态机只活在当次 run 的脚本作用域内，不落盘跨轮共享；跨轮只传 carryover 摘要（Q2 已定隔离预算）。
> 理由：我们的 run 是一次性的，借 host 侧常驻状态等于引入对方的全部一致性坑。（对应 Q2、Q3）

- X5 成熟期复杂度（memberMaxDepth / 异构 LLM 路由 / fallback / toolPolicies）。它的做法：成员可指定任意 provider+model+reasoning_effort，
> 有 fallback 路由切换、owner 声明的 toolPolicy 选择器。→ 建议避开整套引入，只取一条纪律：
> “配置由 owner 声明、模型只能按 id 选择，不能提交原始参数”——用于 Q8 守卫模型字段（设置页新增单模型字段，用户选已有路由，不得手填）。
> 理由：我们当前只需要“便宜路由判活”，不需要异构团队。（对应 Q8、Q9）

- X6 “模型不总走仪式”的诚实记录。它的做法：文档明写“成员不总是严格走工具仪式（如完成不调 update_task）——面板如实反映磁盘真相”
> （`docs/usage.md §已知限制`）。→ 建议吸取而非避开：verifier 必须读文件/跑命令自证（我们已如此），且 Phase 2 下游校验
> “无上游 evidence 摘要则判失败”（§3 已有）正是此条的落地。→ 建议保留为实施 checklist 项。理由：与 AGENTS.md “ child's self-report is not verification” 同一条规则，互相印证。（对应 Q3、A4）

### 10.3 Q1–Q9 对照速查

- Q1 blocked：S2（终态只读、失败不解锁、新建不复活）。补充风险：对方连 durable `blocked` 都没设——下游跑不了的任务保持 `pending`，
> 仅面板派生显示态 `blocked`（`src/snapshot.ts VisualTaskState`）。我们已定 durable 方案一，实施时须兑现 §4 “凡断言 status 处加第三态”，
> 否则不如退回派生态。MOTIVATION：对方用派生态省掉了一整类迁移；我们选 durable 就要付迁移费，A6 的 `npm run ci` 全绿是验收这笔费用的标尺。
- Q2 L1 继承：S1（世代号）+ S3（双预算截断）+ S5b（显式 resume+reason）+ X4（跨轮只传摘要）。
- Q3 DAG 波次：S2b（dependsOn 只认 verified，fail-closed）+ S4（完成时硬校验）+ S9（事件驱动推进）+ X3（schema 最小）。
- Q4 薄设计：S7（规格唯一 + TDD 先行）即 Q4 的做法，对方 847 行 quality-gates.md 就是范例体裁。
- Q5 复核保留/默认关：S6（变更审计给复核留证据）+ 对方“review 不能批自己的实现”（`docs/quality-gates.md §2.2`：不批准自己的实现）——
> 复核默认关闭时，至少保留“verifier 不能复核自己 verify 的任务”这条回避规则。建议实施时加进语义设计。
- Q6 协作式超时：X1（对方无此能力，坚持脚本内竞速）+ S7（超时分级写成纯函数测）+ S4（超时错误可分类）。
- Q7 复核改名：S8（显示/键分离已验证可行，零迁移）。
- Q8 守卫模型：S5c（到顶即停不再问 AI）+ S7（adjudication 纯函数）+ X5（owner 声明、按 id 选择）。
- Q9 分钟制：对方配置全用原始单位 + 文档注明（如 ms），“可读性差”正是我们用户报障的同款问题；坚持分钟显示、毫秒存储（已定）。
