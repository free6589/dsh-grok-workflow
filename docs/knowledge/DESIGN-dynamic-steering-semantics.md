# 薄设计 — 运行中转向语义（Wave 0）

- 日期：2026-11-21 起草，2026-11-22 复核修订
- 状态：**待用户拍板**（选择题在 §6）。拍板后即为 Wave 1–4 的实施基线，测试逐条钉住本文件。
- 上游：`docs/knowledge/PLAN-dynamic-steering-2026-11-21.md`（§4 已定语义、Q1–Q11、A1–A6、§10 研究结论）
- 体裁：薄设计。只定语义与判定，不写实现细节。

本文件不发明状态。任务终态只有 PLAN §4 已定的 `verified` / `failed` / `blocked`，
报告总状态只有 `completed` / `partial` / `failed`（`src/types.ts` 的 `TaskStatus` / `FinalStatus`）。

## 0. 怎么读这份文件

每节分三层，标签沿用 `AGENTS.md` 的状态词：

- **现状**（`CONFIRMED`）：我在当前工作树读到的代码事实，按符号名（函数 / 类型 / 常量）引用。
- **规则**：Wave 1–4 必须实现的语义。已满足的写「已满足」，未落地的写「待实现」。
- **待拍板**：需要用户点头的选择，集中列在 §6；设计不替用户决定偏好。

为什么分成三层：Wave 0 是后续全部波次的输入。文档一旦把「打算这么做」写成「已经这样」，
Wave 2–4 就会照着一条不存在的保证去写代码。附录 A 是所有现状断言的出处对照。

**采样说明**：Waves 1–3 的代码正在工作树里并行落地，`src/carryover.ts` 在我写这份文档期间
被改过一次。所以正文按**符号名**引用，附录 A 的行号只是 2026-11-22 00:50–01:05 的采样值，
会漂移；符号名不会。

## 1. 任务终态三态

一个任务在报告里恰好一个终态，取值恰好三种：

| 终态 | 含义 | 谁造成的 | 烧不烧重试 | 能进 `confirmed` |
| --- | --- | --- | --- | --- |
| `verified` | 干了，且独立检查逐条通过 | worker + verifier | 已用掉尝试 | 能 |
| `failed` | 干了，但没过（或没交出可检查的结果） | worker / verifier / 基础设施 | 用到上限为止 | 不能 |
| `blocked` | 没跑。上游没成功，前置条件不成立 | 上游任务 | 不烧（0 次尝试也不违规） | 不能 |

四条不变量：

1. **终态只读。** `verified` 与 `failed` 一旦写下，本轮不再改写。`blocked` 只能靠
   *重跑* 解除，不能把旧轮的通过改标成本轮的通过。理由：失败冒充完成是这套语义要防的
   唯一事故，与 PLAN §10.1 S2 同一条。
2. **`blocked` 不是质量失败，所以不给它发明失败分类。** 脚本写 `blocked` 行时，
   `incomplete` 行与 `errors` 行都不带 `category`（`src/script.ts` `blockedResult()` 与
   报告装配段，`CONFIRMED`）。取消结算是唯一例外，见 §3 与 §6 的 D1。
3. **`blocked` 不烧重试。** 它不进 bounded 重试，也不算 verifier 失误。
4. **`blocked` 也必须有一行 attempt。** 报告格式要求每个任务至少一条 attempt
   （`src/report.ts` `assertWorkflowReport()` 中 `has no attempts` 一处，`CONFIRMED`），
   所以 `blocked` 行固定是 `attempt: 1`、`execution: null`、`verification: null`、
   `passed: false`，加一句带上游 id 的理由。字段与 `AttemptReport`（`src/types.ts`）一致。
   这不是「跑过一次」，是格式占位，`attempt: 1` 是本仓库既有的「没有子调用发生」标记。

**一条例外：上游通过但没东西可交。** 上游 `verified` 却交不出任何 artifact（deliverable、
evidence、改动文件、通过的命令都没有）时，下游报 `failed` 而不是 `blocked`
（`src/script.ts` 的 `contractFailure()`，`CONFIRMED`，对应 PLAN §3 Wave 3 的 S4 硬规则）。
口径：这属于上游的完成缺陷，不是顺序问题，所以不记 `blocked`；但下游确实一行没跑，
所以理由必须写明 `was not started`，并点名那个交白卷的上游。它同样不烧重试。
于是 `failed` 行有两种来源：干了没过，和契约失败没开工——`incomplete` 的理由必须能分清。

**面板文案要另起一套，不能复用现有 `blocked`。** 现状：进度面板的 `blocked` 是**派生显示态**
（`src/progress-tab.ts` 的 `ProgressState`，i18n 键 `progress.state.blocked`，中文「阻塞」），
含义是「这一轮结束了，但这一行没结算」或「引擎给的结果既不是 completed 也不是 cancelled」，
跟任务的 `blocked` 终态不是一回事（`CONFIRMED`）。
规则：实施时必须给报告里的 `blocked` 单独文案（PLAN §10.1 S8 的建议：未跑、前置失败连累），
否则用户会把「这行没结算」和「这任务没轮到」读成一件事。

## 2. 报告判定表

总状态只有三种，判定看任务集合的**构成**，不看数量：

| 任务集合的构成 | 总状态 | 必须同时满足 |
| --- | --- | --- |
| 全部 `verified`，plan 不是 fallback | `completed` | 每条 criterion 恰好一条非空 confirmed evidence；`incomplete` 为空；`errors` 为空；`plan.error` 为空 |
| 全部 `verified`，但 plan 是 fallback | `partial` | `plan.error` 非空（降级必须有出处） |
| 有 `verified`，另有 `failed` 和/或 `blocked` | `partial` | 每个 `failed`/`blocked` 在 `incomplete` 里恰好一行非空理由 |
| 有 `verified`，其余全是 `blocked`（无 `failed`） | `partial` | 同上；理由说的是「没跑」，不是「干砸了」 |
| 无 `verified`，有 `failed`（可含 `blocked`） | `failed` | 同上；`failed` 不得出现在 `confirmed` |
| 无 `verified`，全部 `blocked` | `failed` | `incomplete` 的理由必须点出连累它的上游任务 id |
| 0 个任务（plan 不可用 / 引擎错误） | `failed` | 单条 `taskId: 'workflow'` 占位 `incomplete` 行，加对应 `errors` 行 |

五条推论，实现必须显式满足，不能靠「集合里恰好没有这种人」侥幸：

1. **含 `blocked` 的轮永远不是 `completed`。** 结构原因：`blocked` 必然进 `incomplete`，
   而 `completed` 要求 `incomplete` 与 `errors` 双空（`src/report.ts` 的 `completed` 分支，
   `CONFIRMED`）。这是 PLAN §4「含 `blocked` 的轮总状态不为 `completed`」的落地形式。
2. **`completed` 的「`errors` 为空」只在校验时成立。** 校验通过后，守卫（guardian）的 findings
   会以 `phase: 'Guardian'` 追加进 `errors`，代码注释明确写着它不改 `status`
   （`src/run.ts` `runWorkflow()` 的 guardian 结算段，`CONFIRMED`；与 PLAN §7
   「只进 errors，不改 status」同义）。所以交付出去的报告可以是「`completed` + Guardian 诊断行」。
   规则：**总状态只由任务构成决定，任何诊断行都不得改 status**。
3. **两侧判据必须同构。** 脚本先算：全部 `verified` 且非 fallback → `completed`，
   有 `verified` → `partial`，否则 `failed`（`src/script.ts` 报告装配段，`CONFIRMED`）。
   校验器复核（`src/report.ts` 的 `completed` / `partial` / `failed` 三个分支，`CONFIRMED`）。
   任一侧单独放宽都算缺陷。`partial` 的门槛是「至少一条 `verified`，且不是全部 `verified`」
   （fallback 走第 2 行的例外），所以 `verified` + 纯 `blocked` 是合法 `partial`。
4. **`blocked` 在 `errors` 里另有一行 `phase: 'Blocked'`。** 这一行是诊断台账，不是失败分类：
   它不带 `category`，也不参与 `failed` 的判定（在 `blockedResult()` 的落账处，`CONFIRMED`）。
5. **`failed` 只要求「不包含 `verified`」，不要求「真跑过」。** 契约失败（§1 的例外）
   也记 `failed`，所以实现不得用「有 execution 才算 failed」这类假设去校验。

## 3. 取消结算（`keepCancelledWork` 遇 `blocked`）

取消是「整轮停」，不是「逐任务停」：引擎只提供整轮 `cancel()`，没有 per-child 句柄
（PLAN §8 Q6 已验 core 源码；本仓库调用点见 `src/run.ts` 的 `run.cancel(...)` 数处）。
结算只做三件事，**现状已实现**（`src/run.ts` 的 `keepCancelledWork()`，`CONFIRMED`）：

1. **已 `verified` 的原样保留。** 不重跑、不改写、不动证据（逐字段早返回）。
2. **`failed` 保留为 `failed`，补一句停止说明。** 曾跑过 →
   `interrupted: the run was stopped before this task produced a verified result`；
   没跑过 → `not started: the run was stopped before this task began`。
   任务原有一句 error 时，新说明追加在括号里，不覆盖原话。
3. **`blocked` 保留为 `blocked`，不改写成 `failed`。** 上游没成功这件事在取消后依然成立，
   改写会把「没轮到」报成「干砸了」，与 §1 第 2 条直接冲突。
   理由缺失时补 `blocked: an upstream task did not verify, so this task did not run`。
   这条通用措辞不带上游 id：结算时拿不到 plan 的 `dependsOn`。**不编造 id**（见 §6 D4）。

结算的其他固定行为：

- 总状态：有 `verified` → `partial`；没有 → `failed`。**永不为 `completed`**——
  停就是停，做完多少都不算完成。
- `incomplete`：每个未完成项恰好一行；引擎没给行就补一行，`category: 'cancelled'`。
- `errors`：追加一条 `{ phase, message, category: 'cancelled' }`，只进诊断台账。
- 半成品不是证据：报告形状修不好时返回 `undefined`，上层落 `failureReport`
  （`failed` + `plan.source: 'unavailable'`，`src/report.ts` 的 `failureReport()`），不猜内容。
- 与 §4 的衔接：取消轮状态最多 `partial`，下一轮据此决定继承什么，只有 `verified` 可 `retain`。

## 4. 继承规则（retain / redrive / reverify / replan）

新需求打到已结束或被取消的轮上时，新轮不重做已验证的工作。判定按任务给出四种决定之一，
每种都带理由。**现状：四种决定、理由与变更字段清单已实现**
（`src/carryover.ts` 的 `ResumeKind` / `resumeDecisions()`，`CONFIRMED`）。

| 决定 | 触发 | 新轮怎么对待这个任务 | 证据 |
| --- | --- | --- | --- |
| `retain` | 旧轮 `verified`，本轮没改动它依赖的东西 | 不重跑；摘要里带「已验证 + 一句话结论」 | 沿用旧轮那条被点名的证据，标来源轮次 |
| `redrive` | 旧轮 `failed` 或 `blocked`，任务仍然需要 | 以新一轮次重跑 | 旧证据作废，不进 `confirmed` |
| `reverify` | 旧轮 `verified`，但本轮改动了它的输入 | 不重跑 worker，只重跑检查 | 旧证据作废，等新检查 |
| `replan` | 需求本身变了（目标 / 范围 / 验收条件被改写） | 交给新轮 planner 重排，附理由与变更字段 | 旧轮证据只作参考，不自动进 `confirmed` |

现状细节（`CONFIRMED`）：

- 同一任务只认**最新一轮**的行（`seen` 去重）：旧的 `verified` 压不过新的 `failed`，反之同理。
  这是世代守卫最简形式。
- `generation` 现在是**轮次年龄**：最新轮记 1，越旧越大；`redrive` 记 `generation + 1`。
  它表达「离现在多远」，不是单调递增的尝试号。
- `replan` 的变更字段清单已落地（`changedFields` 字段，对应 PLAN §10.1 S6 的可审计要求）。
- 预算：`INHERITANCE_LIMITS = { chars: 8000, taskChars: 2000 }`，与对话历史预算物理隔离，
  互不挤占。
- 渲染：先写全部决定行（从旧到新，保证「哪些任务已验证」永远先读到），再写 details
  （从新到旧），放不下就砍并留 `[truncated: …]` 标记（`buildInheritanceDigest()`）。
  截断只标注，不补写。
- 摘要已接进 planner 与 worker 提示词：`run.ts` 取 `inheritanceForSession()`，
  经 `buildWorkflowRequest()` 的 `inheritance` 字段进脚本，再由 `inheritanceSection()`
  挂到提示词（`CONFIRMED`）。

规则（待实现部分）：

- **报告要带来源轮次。** 现状摘要有 `generation`，但报告与 `types.ts` 里没有继承元数据，
  事后无法从报告看出某条结论来自哪一轮。规则：`retain` / `reverify` 的行在报告里可核查到
  来源轮次，否则审计只能靠摘要文本。
- **迟到写入防护。** 旧轮的结果不得写进新轮的报告。现状靠「只认最新轮」+ `generation`；
  规则要求新轮报告只登记本轮产生的结论。
- **「摘要里看起来做过」不算证据。** `retain` 的证据只能是旧轮那条被点名的 evidence。
- **验收条件只能由 planner 重排。** worker 自改 acceptance 在现状里是**报告被拒**：
  校验器逐字段比对 `plan.tasks` 与 `tasks`，含 `acceptanceCriteria`
  （`src/report.ts` 中 `plan.tasks and tasks disagree` 一处，`CONFIRMED`）。
  规则与实现要对齐措辞：这不是「该轮判 `failed`」，而是「该轮报告无效」，上层落 `failureReport`。
- 继承轮的总状态仍按 §2 判。`retain` 的任务算不算本轮的 `verified`，见 §6 D3。

## 5. 回避规则（recusal）

规则来自 PLAN §10.3 Q5 与 §10.1 S6：对方仓库的门禁写死「review 不能批自己的实现」，
我们至少保留「自己的判定不能给自己背书」。

- **V1 产出与判定分离。** 一个任务的产物由 worker 产出，判定只能由没参与该任务产出的角色给出。
  同一次尝试里，产出过该任务产物的调用不得对它给出 `verified`。
- **V2 复核只 fail 不 pass。** verifier 说 fail，复核救不回来。现状已满足，且写在注释里
  （`src/script.ts` 的 supervisor 门控段，`CONFIRMED`）。
- **V3 verifier 不能复核自己 verify 过的任务。** 落地形式：同一任务同一次尝试里，
  verifier 的通过结论不得被复核环节当作自己的证据或改判依据；复核必须自己读文件、
  跑命令重查。复核引用 verifier 的证据即视为自审。
- **V4 配置塌陷要标出来，不要假装独立。** verifier 链与复核链解析到同一路由同一模型时，
  这次复核记 `self-review`：`fail` 仍然生效（它本来就是 fail-only），`pass` 不产生独立通过效果，
  报告 `errors` 记一条说明。这属于配置问题，**不判任务失败、不烧重试**。
- **V5 不引入新状态。** 回避违规按现有 `verification-failed`（`quality`）语义结算，
  不新增 status，也不新增 failure category。

边界要说清：引擎没有「角色身份」概念，所以回避不是引擎保证，是提示词纪律加脚本判定。
但判定所依据的两个事实在报告里可查——这次调用属于哪个角色、跑了哪个路由
（`routes` / `routing` 字段）。因此违规可事后审计。

## 6. 待拍板

五条都需要用户点头，括号里是我的建议。

- **D1 `blocked` 行带不带失败分类。** 现状不一致：脚本正常路径的 `blocked` 行不带 `category`，
  取消结算补的 `incomplete` 行带 `category: 'cancelled'`。
  （建议：保留这个区分并在 §1 写明例外——取消场景的 `cancelled` 说的是「这轮为什么没跑完」，
  不是给 `blocked` 扣质量帽子。）
- **D2 回避违规的强度。** 只标 `self-review` 并记一条，还是把整轮判无效？
  （建议：前者。配置塌陷不该烧任务重试。）
- **D3 继承轮里 `retain` 算不算 `verified`。** 这决定继承轮能否报 `completed`。
  （建议：算，报告另给一行 inherited 计数，说明这些结论来自旧轮。）
- **D4 取消结算里 `blocked` 的通用措辞。** 拿不到上游 id 时是否允许不点名。
  （建议：允许。编造 id 比不点名更坏。）
- **D5 `completed` 报告带 Guardian 诊断行。** 是否接受「status 为 `completed` 而 `errors` 非空」。
  （建议：接受，§2 推论 2 已把「`errors` 为空」限定为校验时条件。）

## 7. 与波次的对应

| 波次 | 本文件哪几条落地 |
| --- | --- |
| Wave 1 显示层 | §1 的面板文案（给报告 `blocked` 单独文案）、§4 四个决定的中文说法 |
| Wave 2 L1 | §4 全部（来源轮次、预算、截断、世代号、护栏）、§3 与 §4 的衔接 |
| Wave 3 DAG | §1 三态、§2 判定表、§5 回避 |
| Wave 4 合流 | §2 推论 3（两侧同构）、§4 与 §2 的联合判定、单线原因句 |

## 8. 非目标

- 单子任务级热取消 / 热插：引擎无 per-child cancel 句柄（PLAN §8 Q6）。
- 引擎级暂停 / 恢复 journaling。
- 跨轮共享 host 侧常驻状态：只传摘要，不传状态机（PLAN §10.2 X4）。

## 附录 A：现状断言的出处

行号是 2026-11-22 00:50–01:15 的采样值；工作树正在并行落地 Waves 1–3，行号会漂移，
符号名是稳定锚点。

| 断言 | 符号锚点 | 采样 | 状态 |
| --- | --- | --- | --- |
| 终态三种、值域固定 | `src/types.ts` `TaskStatus` | L22 | `CONFIRMED` |
| 总状态三种 | `src/types.ts` `FinalStatus`；`src/report.ts` `STATUSES` | L11；L10 | `CONFIRMED` |
| `blocked` 行的 attempt 形状与带上游 id 的理由 | `src/script.ts` `blockedResult()` | L2343-2354 | `CONFIRMED` |
| 上游 verified 但无 artifact → 下游 `failed` 且未开工 | `src/script.ts` `contractFailure()` | L2380-2401 | `CONFIRMED` |
| 报告要求每任务至少一条 attempt | `src/report.ts` `assertWorkflowReport()` | L483-485 | `CONFIRMED` |
| `completed` 全 verified、incomplete/errors/plan.error 皆空 | 同上 `completed` 分支 | L599-620 | `CONFIRMED` |
| `partial` 至少一条 verified 且非全 verified | 同上 `partial` 分支 | L621-637 | `CONFIRMED` |
| `failed` 不得含 verified | 同上 尾部分支 | L634-636 | `CONFIRMED` |
| `blocked` 恰好一行 incomplete 理由 | 同上 非 completed 段 | L658-672 | `CONFIRMED` |
| plan.tasks 与 tasks 逐字段比对（含验收条件） | 同上 计划对照段 | L369-389 | `CONFIRMED` |
| 失败报告形状 | `src/report.ts` `failureReport()` | L728-766 | `CONFIRMED` |
| 脚本侧总状态计算 | `src/script.ts` 报告装配段 | L2752-2754 | `CONFIRMED` |
| `blocked` 进 incomplete / errors 且不带 category | `src/script.ts` 结算循环 | L2721-2727 | `CONFIRMED` |
| 波间 blocked 传染、只认 verified 上游 | `src/script.ts` `runWaves()` | L2447 起 | `CONFIRMED` |
| 复核只 fail 不 pass | `src/script.ts` supervisor 门控注释 | L2603-2606 | `CONFIRMED` |
| 摘要接进提示词 | `src/run.ts` `inheritanceForSession()`；`src/script.ts` `inheritanceSection()` | L625-633；L1201-1207 | `CONFIRMED` |
| 取消结算三分支与总状态 | `src/run.ts` `keepCancelledWork()` | L538-608 | `CONFIRMED` |
| Guardian 追加 errors 不改 status | `src/run.ts` `runWorkflow()` finally 段 | L1087-1097 | `CONFIRMED` |
| 四种继承决定与理由 | `src/carryover.ts` `resumeDecisions()` | L541-595 | `CONFIRMED` |
| `redrive` 世代 +1 | 同上 | L589-590 | `CONFIRMED` |
| 继承预算 8K / 单任务 2K | `src/carryover.ts` `INHERITANCE_LIMITS` | L78-84 | `CONFIRMED` |
| 继承渲染顺序与截断标记 | `src/carryover.ts` `buildInheritanceDigest()` | L621-674 | `CONFIRMED` |
| 面板 `blocked` 是派生显示态（不是任务终态） | `src/progress-tab.ts` `nodeState()`；`src/client/index.js` i18n | L478-499；L303,L504 | `CONFIRMED` |
