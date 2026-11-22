# 薄设计 — 主会话当沟通渠道 + 波边界重规划（L2）

- 日期：2026-11-22
- 状态：**通道侧已实施**（2026-11-22，`session_channel` lane）；合流侧由 `planner_replan` lane 实施。
  - 通道侧落地：`src/channel.ts`（分类/文案/intent 组装）、`src/gate.ts`
    `answerOnChannel()` + `runChannelRound()` + `cancelLiveRuns()`、`src/run.ts`
    `steeringToken?` 透传。开关是 `replan`（默认关），不是 §6 的 `channelSteering`。
  - 与本文的差异（实施拍板，见 `DECISIONS.md` D-105）：ack 用确定性回执
    （`steerReceipt`），不再为跑中消息花一次 first-answer 调用；停/并存语义与 §3.1 一致；
    §8 D1（默认关）采纳，D2 采纳「边界调用」，D3/D4 由合流侧决定。
- 上游：用户 2026-11-22 原话（§1 引用）；`PLAN-dynamic-steering-2026-11-21.md` §1「非目标：L2（任务边界收敛意图）本次不做」；
  `DESIGN-dynamic-steering-semantics.md` §8 非目标「单子任务级热取消/热插」。
- 体裁：薄设计。定语义、判定、接入点与验收，不写实现代码。

## 0. 怎么读这份文件

三层，标签沿用 `AGENTS.md`：

- **现状**（`CONFIRMED`）：在当前工作树与已安装引擎源码里读到的事实，按符号名引用，行号只是采样值。
- **规则**：如果拍板做，实施必须满足的语义。已满足的写「已满足」，未落地的写「待实现」。
- **待拍板**：需要用户点头的选择，集中在 §8。

## 1. 用户要什么，今天实际发生什么

用户原话（2026-11-22，两段合并，保留原意）：

> 我和你对话完你会开 workflow、开很多子代理，中途还不能修改。那么我在想，主会话应该是一个沟通渠道，
> 而不是占着会话不能修改。就是说我给你发消息，你把消息传到规划助手那边，规划助手收到消息之后可以重新规划你的任务，
> 比如再加任务什么的。

**今天的第一半已经成立：会话没有占死。** team 档走后台通道，主会话先拿一句首答就归还，
workflow 在后台跑（`src/gate.ts` `answerTeamInteractive()`，注释「Team tier on an interactive run (B: 边聊边干)」，`CONFIRMED`）。
所以「不能说话」不是真问题。

**真问题在第二半：说话等于重来。** 同一个会话在跑中收到新消息，走的是「整轮取消 + 窄重启」：

> Redirect-on-new-message (existing machinery, no new bus): if a newer message for the same session arrives
> while this run is queued/running, it cancels the in-flight run via the shared ActiveState …
> the narrowed rerun is composed with carriedPendingRequest / resumedTarget (whole-round cancel + narrow
> restart; V1 does no subtask-level directed cancel).
> —— `src/gate.ts` 注释原文，`CONFIRMED`

配套件：`carriedPendingRequest()` 把旧需求与新需求拼成一条（`src/gate.ts`，`CONFIRMED`）；
上一轮已验证的任务靠 L1 继承免重做（`src/carryover.ts` `resumeDecisions()`，`CONFIRMED`，0.13.1 已发）。

于是现状是：**旧轮被掐死、正在跑的那一波白跑、新轮从头起跑、planner 可能把已做的事再规划一遍**
（`STATE.md` 已记过这一点：无结构校验阻止 planner 重做 retained 工作）。
用户说的「中途不能修改」，准确说是「中途一改就整体重来」。

本设计要换掉的正是这一条：**跑中收到的话先排队，在波边界并入，不掐整轮。**

## 2. 引擎给不了的通道（这是设计的地基）

四条 `CONFIRMED` 事实，决定了方案只能是拉取式：

1. **脚本沙箱只有六个全局。** 引擎用 `vm.createContext({})` 建 realm，注入 `agent / parallel / pipeline / phase / log / args`
   （`node_modules/@deepseek-ai/dsh-workflow-ptc/lib/index.js` 的 `WORKFLOW_GUEST_SOURCE`：`const globals = {…}` 与
   `this.context = vm.createContext({}, …)`；本仓库同一条事实写在 `src/script.ts` 顶部注释里）。realm 里没有
   `setTimeout`、没有 `fs`、没有 `process`，所以脚本既不能读文件轮询，也不能注册定时器。
2. **`args` 在起跑时被克隆。** `…request.args !== void 0 ? { args: structuredClone(request.args) } : {}`
   （同文件 `init` 构造处，`CONFIRMED`）。host 侧再改 args 对象，跑中的脚本看不到。
3. **host 到脚本只有一个动作：整轮 `cancel(reason)`。** `WorkflowRun.cancel()` 只是 abort 加逐孩子 dispose
   （同文件，`CONFIRMED`）；`workflow/phase|log|agent-start|agent-end` 事件是脚本→host 单向
   （`src/script.ts` 与 ptc `observer` 只发不收）。没有「往跑中脚本塞一条消息」的接口。
4. **孩子是一次性的。** `agent()` 拿到结果后 `await run.dispose()`（ptc runtime，`CONFIRMED`），
   所以「留一个规划助手孩子持续对话、让脚本随时问它」也不成立：脚本每次只能新开一个孩子。

**推论（规则）：** 要让运行中的脚本知道新需求，只有两条路——脚本自己去取（pull），或者给 DSH core 加接口。
后者违反 `AGENTS.md`（不改 core、只用文档化扩展点），也不在 `PLAN` §10.2 X1 的教训里。
所以本设计的一切都建立在「波边界拉取」上。

## 3. 方案：边界拉取式 steer

三件套，分别落在通道侧、脚本侧、判定侧。

### 3.1 通道侧（host，`src/gate.ts` + `src/steering.ts` + `src/channel.ts`；已实施）

- 触发条件：会话有 live run（`ActiveState` 里能查到该 session 的 run）、模式开了 `channelSteering`。其余情况走今天的老路。
- 收到新消息时**不 cancel**，把文本按 intent 入队（每 session 一条有界队列：最多 8 条、单条 2000 字、超出丢最旧并记一条 `dropped`）。
- 立即回一句人话 ack（走现有首答通道），说清三件事：已收到、会在下一波边界并入、要立刻停请发 `/stop`。
- **取消语义不吞。** 显式取消（`/stop`、取消指令、`esc` 类动作）仍走 `ActiveState` 的整轮 cancel，与新消息区别对待。
- 队列寿命：run 结算时，未取用的 intent 交下一轮 `carriedPendingRequest()`，与 L1 继承同一条路，不丢也不重放。

### 3.2 取用侧（脚本，`src/script.ts` 的 `runWaves`）

- 插入点：每一波 `runWave(...)` 结算后、下一波启动前（`runWaves()` 的循环里，`CONFIRMED` 的位置）。
- 动作：发起一次 `agent()` 调用，标签 `转向 · 波 N 边界`，prompt 带 run token、已结算任务摘要（沿用 `upstreamDigest` 的口径）、
  尚未启动的波，要求结构化输出 `{ action: 'none' | 'replace', tasks?, reason? }`。
- 为什么必须是孩子调用：realm 里没有别的通道（§2）。这个孩子的职责只有一个——把 host 队列里的话翻成任务改动。
- 无 intent 时也调用一次（脚本无法知道队列空不空，见 §5 的成本说明）。返回 `none` 即原样推进。

### 3.3 判定与合流（`src/steering.ts`，纯函数）

```
intent[] --merge(plan, settled, intents)--> { plan', decisions[] } | { rejected, reason }
```

- `merge` 是纯函数：输入当前未被占用的波 + 已结算状态 + intent，输出新波或拒绝理由。单测不碰模型，能进 `npm run ci`。
- 校验与 planner 首轮同一套 fail-closed 规则：`dependsOn` 只许指已 `verified` 的上游、禁环、禁自指、禁跨波回指、
  波数 ≤ `WAVE_LIMIT`（8，`src/script.ts`）、任务总数 ≤ `maxTasks`。
- 非法即拒，**整轮不动**：记一条 `steering` 台账（rejected + 理由），run 继续按原计划跑。转向失败不许把 run 拖挂。

## 4. 语义规则

**能并入：**

- 新增任务（含依赖、验收条件、writesPaths）。
- 改尚未启动任务的目标 / 验收条件 / 上下文。
- 增删、重排尚未启动的波。

**不能动（动到就是新轮，不是 steer）：**

- 已结算任务（`verified` / `failed` / `blocked`）的任何字段——终态只读，与 `DESIGN-dynamic-steering-semantics.md` §1 同一条。
- 正在跑的任务。没有 per-child 句柄（`PLAN` §8 Q6 已验），所以「换掉跑到一半的活」不在本设计里。
- run 的 objective、deadline、并发与重试上限。转向不延长死线（沿用 Q8 规则 B 的口径：deadline 是生死线）。
- 报告里已经 `confirmed` 的证据。

**依赖与三态：** 新任务的 `dependsOn` 指向 `failed` / `blocked` 上游时，它一出生就是 `blocked`，不烧重试；
上游 `verified` 但交白卷（无 artifact）时按既有 `contractFailure()` 记 `failed`，语义不新造。

**幂等与迟到：**

- 每条 intent 有 id；取用即标 `consumed`，重试不重复并入。
- run 结束前没取用的 intent 转下一轮 carry-over；已 `consumed` 的不再转。
- 同一批 intent 若本轮被判 rejected，也转下一轮（用户的话不因为一次判定失败就消失）。

**报告：** 新增可选 `steering[]`（`{ wave, intentIds, decision, reason, route, addedTaskIds }`）。
注意 `assertWorkflowReport()` 是逐字段重建返回对象（`src/report.ts`，`CONFIRMED`），
不把 `steering` 加进重建逻辑，字段会被静默丢掉——实施时必须一起改，并补对应校验。

## 5. 成本与预算

- **每边界一次模型调用**（cheap route，默认复用 `triageModel`），上限 `min(波数, 4)` 次；波数上限本身是 8。
- 计入引擎的 `maxTotalAgents`：ptc 在 `this.started >= this.limits.maxTotalAgents` 时抛 `AGENT_CAP`（`CONFIRMED`），
  所以 host 侧算总预算时要把转向调用加进去，否则大 plan 会撞硬顶。
- 不进并发竞争：边界调用发生在两波之间，那时波内已全部结算，不额外占槽。
- **无 intent 也要付一次调用**，这是拉取式的固有代价。替代是「搭车」：让下一波第一个 worker 在自己的结构化输出里
  顺带报一次队列（零额外调用，代价是迟一个边界生效）。两条路的取舍进 §8 D2。

## 6. 开关与降级

- 设置页新增布尔键 `channelSteering`，**默认关闭**。关闭时行为与今天逐字节一致（取消 + carried 重启），
  `npm run ci` 的既有断言不受影响。
- 只在 team 后台通道生效（需要 live run 且 `canBackgroundDeliver(agent)`）；单聊、前台档、`ask` 档不受影响。
- 插件卸载 / 重载：内存队列随进程丢，未取用 intent 走 carry-over；run 本身在卸载时已被 cancel（`src/run.ts`，`CONFIRMED`）。
- 引擎不认 `structuredClone` 里的函数 / 非 JSON 值：intent 结构与转向输出必须纯 JSON，这是沙箱硬约束（§2）。

## 7. 验收

- **A1 跑中改需求不掐轮。** team 后台跑中发一条新任务要求：本轮不 cancel，会话立刻拿到 ack；
  当前波跑完后，新任务出现在下一波并被执行；报告 `steering` 台账记一条 accepted，含 intent id 与新增任务 id。
- **A2 取消不被吞。** 同样场景发 `/stop`：整轮立刻取消，走今天的 `keepCancelledWork()` 结算，accepted 数为 0。
- **A3 非法合并 fail-closed。** intent 要求改已 `verified` 任务的验收条件、或造出环 / 跨波回指 / 超 `maxTasks`：
  合流被拒，run 按原计划跑完，台账记 rejected 与具体理由，报告不被判无效。
- **A4 迟到不丢。** run 在边界前结算：intent 进入下一轮 `carriedPendingRequest`，下一轮报告能追到这条来源。
- **A5 关闭即旧行为。** `channelSteering=false` 时，跑中新消息仍触发整轮 cancel + 窄重启；`npm run ci` 全绿。
- **A6 成本可记账。** 转向调用次数 ≤ `min(波数, 4)`，出现在 `routes` 与 `steering[].route` 里；并发 / 重试上限不变（默认 3/1，硬顶 6/3）。

## 8. 待拍板

六个选择，括号里是建议。

- **D1 默认开还是默认关。** （建议：默认关。先让愿意付边界调用成本的人开。）
- **D2 边界调用 vs 搭车。** 每边界一次 cheap 调用，还是让下一波首个 worker 顺带报队列（零成本、迟一个边界）。
  （建议：先做边界调用，成本可记账、语义干净；搭车留作省钱的降级项。）
- **D3 可改范围。** 只允许「加任务 / 改未启动波」，还是也允许把某条 intent 解释成「撤回某个未启动任务」。
  （建议：允许撤未启动任务；撤已结算的一律拒绝。）
- **D4 一段话多条意图怎么切。** 由边界孩子拆（一次调用多任务），还是只认整段、由用户自己分条。
  （建议：由孩子拆，但每条仍要过 §3.3 校验。）
- **D5 ack 说什么。** 只回「已收到，下一边界并入」，还是回一句更具体的「已排到第 N 波之后」。
  （建议：后者。用户要的是知道话去哪了，不是一句已读。）
- **D6 报告字段名。** `steering[]` 还是复用现有 `errors` 诊断行。
  （建议：新字段，因为它是决策不是错误；同时必须改 `assertWorkflowReport` 的重建逻辑，否则静默丢失。）

## 9. 非目标

- 单子任务级热取消 / 热插（没有 per-child 句柄，`PLAN` §8 Q6 已验；对方仓库 `dsh-agent-teams` 同样做不到，见 `PLAN` §10.2 X1）。
- 给 DSH core 加「跑中注入」接口。
- 转向改变 objective：那是新轮，走 `carriedPendingRequest` 与 L1 继承。
- 跨轮常驻状态机：队列只在进程内存里活一个 run 的长度，跨轮只传摘要（与 `PLAN` §10.2 X4 一致）。

## 附录 A：现状断言的出处

采样时间 2026-11-22 18:15–18:25 +08:00。行号会漂移，符号名是稳定锚点。原始抓取在附录 B 的目录里。

| 断言 | 锚点 | 状态 |
| --- | --- | --- |
| 沙箱只有六个全局、realm 由 `vm.createContext({})` 建 | ptc `lib/index.js` `WORKFLOW_GUEST_SOURCE`；`src/script.ts` 顶部注释 | `CONFIRMED` |
| `args` 起跑时 `structuredClone` | ptc `lib/index.js` `init` 构造处 | `CONFIRMED` |
| 只有一个整轮 `cancel(reason)` | ptc `lib/index.js` `WorkflowRun.cancel()` | `CONFIRMED` |
| `agent()` 结果后 `run.dispose()` | ptc `lib/index.js` `agent()` 的 `finally` | `CONFIRMED` |
| team 档后台跑、会话可聊 | `src/gate.ts` `answerTeamInteractive()` | `CONFIRMED` |
| 跑中新消息 = 整轮 cancel + 窄重启 | `src/gate.ts` 注释「Redirect-on-new-message」段 | `CONFIRMED` |
| 新需求与旧需求拼成一条 | `src/gate.ts` `carriedPendingRequest()` | `CONFIRMED` |
| 波次调度与结算推进点 | `src/script.ts` `runWaves()` | `CONFIRMED` |
| 波数上限 8 | `src/script.ts` `WAVE_LIMIT` | `CONFIRMED` |
| 报告校验逐字段重建（额外字段会被丢掉） | `src/report.ts` `assertWorkflowReport()` | `CONFIRMED` |
| 插件工具注册点是文档化扩展点 | `src/index.ts` `ctx.tools.register(tool)` | `CONFIRMED` |
| 现有工具显式拒绝子代理调用（说明工具对子代理可见） | `src/index.ts` `origin === 'subagent'` 守卫 | `CONFIRMED` |
| 子代理只在给了 `toolFilter` 时收窄工具集 | `dsh-subagent/lib/index.js` `childCtx.tools.restrict(...)` | `CONFIRMED` |
| `AGENT_CAP`：孩子总数撞顶即抛 | ptc `lib/index.js` `agent()` | `CONFIRMED` |

## 附录 B：证据目录

`docs/knowledge/evidence/midrun-channel-steering-2026-11-22/`：

- `guest-globals.txt` — 沙箱全局与 `vm.createContext({})` 的抓取。
- `engine-channel.txt` — `args` 克隆、整轮 `cancel()`。
- `gate-cancel-path.txt` — 跑中消息的取消路径与 `carriedPendingRequest()`。
- `tool-scope.txt` — 插件工具注册、子代理守卫、子代理工具收窄。
- `script-realm.txt` — 脚本侧「realm 无定时器/无 fs」的注释与波调度入口。

## 附录 C：与既有文档的关系

- `PLAN-dynamic-steering-2026-11-21.md` §1 把 L2 列为「本次不做」；本文件就是那条被推迟的设计。
- `DESIGN-dynamic-steering-semantics.md` 定的是任务终态、报告判定、取消结算、继承；本文件不新造状态，
  沿用 `verified / failed / blocked` 与 `completed / partial / failed`，只增加「谁能在什么时候改未启动的波」。
- 两个阶段的接口靠 `carriedPendingRequest` 与 `resumeDecisions()`：边界没并完的话，走已经发版的那条继承路。
