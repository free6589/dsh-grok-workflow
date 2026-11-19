# Round 17 · 记忆 vs 代码 对照表

基线 `HEAD` = `4db78f41f00416abe55baa1ec9403c4fa1a63379` = `origin/main`。
「存在」一律指**在当前工作树里用命令读到**，不是引用记忆自述。行号是本轮实测值。

## 一、要求的六条，逐条核对

| # | 记忆条目 | 文件 | 行范围（实测） | 标题（实测前缀） | 代码侧对照（实测） | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `RESEARCH` **A24** 心跳式迭代 | `docs/knowledge/RESEARCH.md` | **511–665**（155 行；下一节 A25 在 666） | `A24 — 心跳式迭代：Schedule 投递怎么开下一轮、pre-step 在哪判定、谁有资格建任务（2026-11-18，CONFIRMED，含 NOT_VERIFIED 两处）` | `src/gate.ts:533` `if (source?.kind !== 'schedule') return false`；`src/gate.ts:1589` `host.on?.('agent/pre-step', handle)`；`src/gate.ts:525-531` 注释说明「来源 `schedule` + 插件自己写的 ownership marker 两条必须同时成立」 | **存在**，且与代码一致 |
| 2 | `DECISIONS` **D-066** 预设缺口/第一跳归操作者 | `docs/knowledge/DECISIONS.md` | **1185–1256**（72 行；下一节 D-067 在 1257） | `D-066 — 预设缺口：第一条心跳由操作者手动建，循环会话不得假设自己能建定时任务` | `loop.open` 全仓唯一调用点在 `src/loop-surface.ts:302`（HTTP 路由分发），该处注释写明「No actor argument: a browser request is a user action, which is exactly what `open` accepts and what an Agent-attributed caller is refused for.」；拒绝码 `loop/user-only` → 403（`src/loop-surface.ts:312` `statusForLoopCode`，`:314` 是那条 `case`；抛出处 `:195`）。模型侧工具没有开循环的路径 | **存在**，且与代码一致 |
| 3 | `DECISIONS` **D-068** 先 P4 再 P3 的顺序授权 | `docs/knowledge/DECISIONS.md` | **1303–1345**（43 行） | `D-068 — 操作者授权：先落 P4 的续跑面，再回头做 P3 的两条 UX（2026-11-18 · 顺序授权）` | 流程/顺序决定，按定义没有代码对应物；与本轮相关的是它并不放松任何门禁 | **存在**（无代码对照项） |
| 4 | `DECISIONS` **D-069** 续跑面归谁 | `docs/knowledge/DECISIONS.md` | **1346–1396**（51 行） | `D-069 — 续跑面归谁：一行 Schedule、用户才能开、上限靠 COUNT、关闭靠删除` | `src/loop.ts:303` `RRULE:FREQ=MINUTELY;INTERVAL=…;COUNT=${rounds}`；`src/loop.ts:318` `roundsOf(rrule)` 读回 `COUNT`；`src/loop.ts:242` `if (task.kind !== 'rrule') return false`；关闭走删行：`src/loop.ts:480` `deleteSessionHeartbeats(...)` | **存在**，且与代码一致 |
| 5 | `DECISIONS` **D-071** 预设缺口在续跑面之后怎么落 | `docs/knowledge/DECISIONS.md` | **1437–1525**（89 行；下一节 D-072 在 1526） | `D-071 — 预设缺口在续跑面之后怎么落：仍选「用户拥有第一跳」，方案②（提示切预设）被排除` | 「用户拥有第一跳」与 #2 同一条代码约束（`open` 只在浏览器路由后面）；「方案②被排除」是取舍记录，无代码对应物 | **存在**，且与代码一致 |
| 6 | `DECISIONS` **D-072** 开关进 composer dock | `docs/knowledge/DECISIONS.md` | **1526–1579**（到文件末行；1579 行） | `D-072 — 续跑的开关放进 composer dock，停 = 拒绝并删行；预算与「失败轮」的定义写进模块而不是留给读者猜` | `src/client/index.js:3528` `LOOP_SWITCH_ID = 'grok-workflow-loop'`、`:3665` `function LoopSwitch`、`:3730` `function startLoopSwitch`、`:3738` `slots.inject('conversation.composer.dock', …)`、`:3935` 挂载、`:4119-4120` 导出面；`src/loop-brakes.ts:52/55/58/67/70` 常量、`:120` `evaluateLoopBrakes`、`:172` `dailyRoundCap`、`:187` `loopTimeCapMs`、`:203` `loopStopFile` | **存在**，且与代码一致 |

**结论**：任务点名的 1 条 RESEARCH + 5 条 DECISIONS 全部存在，路径与行号如上，**没有一条只在记忆里、代码里找不到对应**。

## 二、附带核对的两处「已知风险」（只观测，不修改）

| 项 | 实测 | 与记忆的关系 |
| --- | --- | --- |
| `src/index.ts:292` 注释「两半对不上」 | 该句从 `:292` 起、在 `:293` 收尾：`// whose delivery target is the same session; this plugin owns no timer, so an open` + `// loop survives a plugin reload and an unload deletes it (no ownerless work).`。字面上「reload 后还活着」与「unload 删掉它」相邻。卸载侧确有 disposer：`src/loop-surface.ts:105-111` `ctx.effect?.(() => async () => { await loop.stopAll('plugin unload') … })`。reload 语义仍只由 `RESEARCH.md` A27 §5 以 `HYPOTHESIS` 挂着 | 任务要求**保持原样**，本轮未改一字；`NOTES.md` §6 记了精确行号（`:292` 起、`:293` 收尾），因为任务原文写的 `:292` 是句子前半截 |
| `host_loop_service` 判据曾 fail | 已在 round 15/16 收口：`docs/knowledge/RESEARCH.md:879` A27（`:881` 明写「本节回答上一轮留空的 `host_loop_service` 判据」）、`docs/knowledge/VALIDATION.md:3682` 的 2026-11-19 条目、`docs/knowledge/HANDOFF.md:39` 均记为 `CONFIRMED`。A27 目前占 `RESEARCH.md:879-970` | 这是**已关闭**的历史 fail，不是 round 17 的起点缺陷 |

## 三、记忆文件自身的完整性

- `docs/knowledge/` 五件套都在：`RESEARCH.md` 969 行 / 75801 B、`DECISIONS.md` 1579 行 / 161068 B、
  `STATE.md` 1311 行、`HANDOFF.md` 1495 行、`VALIDATION.md` 3767 行。
- 重复编号（`D-050` 在 `:899` 与 `:934`、`D-051` 在 `:916` 与 `:956`）是 round 13 之前就存在的历史问题，
  本轮**不重编号**（会打断既有引用），只登记。
- `DECISIONS.md` 里 `D-066`/`D-068`/`D-069`/`D-071`/`D-072` 之间的空档是 `D-067`（`:1257-1302`）与
  `D-070`（`:1397-1436`）——不是缺号。

## 四、attempt 2 复核（2026-11-19T08:50+08:00）

- 六个标题行号用 `grep -n '^## A2[0-9]'` / `grep -n '^## D-0[567][0-9]'` 重跑，与 §一 逐字相同：
  A24 = 511（A25 = 666）、D-066 = 1185、D-068 = 1303、D-069 = 1346、D-071 = 1437、D-072 = 1526，
  文件行数仍是 `RESEARCH.md` 969 / `DECISIONS.md` 1579。
- 代码锚点重跑：`src/gate.ts:533`、`:1589`；`src/loop-surface.ts:195/302/314`；
  `src/client/index.js:3528/3665/3730/3738`（`:3738` 是 `return ctx.slots.inject('conversation.composer.dock', …)`）；
  `src/loop-brakes.ts:120/172/187/203`。与 §一 的对照列一致，未因别人重建 `lib/` 而漂移（`src` 本就没动）。
- `src/index.ts:292-293` 的注释仍是原样两句，未改一字。
- 记忆三件套 sha256 与 `fingerprints.sha256` 逐行相同（`sha256sum -c` 全 OK）。
