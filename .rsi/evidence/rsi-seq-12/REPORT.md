# RSI 顺序 12 项执行报告 · 2026-11-23

- **源文件**：`manual-sessions-unfinished.md`（工作区根，未纳入版本库；2026-11-23 01:20 +08:00 生成，仓库版本 0.13.14）
- **口径**：第二节 7 件 → 第三节 5 件，严格顺序；一项一分支（自合完的 `main` 尖端开），合前 `npm run ci` 必须 exit 0，
  合完再开下一项；不可修的记账跳过，不停摆。
- **执行位置**：`main` 的干净工作树 `.agents/worktrees/fix-synth-resubmit`
  （主检出 detached `a6103ad` 的既有未提交改动**未被触碰**）。
- **状态词汇**：`CONFIRMED` / `HYPOTHESIS` / `NOT_RUN` / `BLOCKED`（AGENTS.md §2）。

## 1. 十二项逐条结果

| # | 源文件标题（原文引用） | 结果 | 证据 |
|---|---|---|---|
| Sec.2-1 | 「运行时限默认还是 60 分钟，我要的是不限时」 | **MERGED（前轮 `1591665`，本轮复验 `CONFIRMED`）** | `src/config.ts:113` `export const DEFAULT_TIMEOUT_MS = 0`；`test/timeout-config.spec.ts:119` `expect(resolveConfig({}).timeoutMs).toBe(0)`；基线 ci 绿 |
| Sec.2-2 | 「主会话应该永远能插话，但现在默认关着，设置页也没开关」 | **MERGED（前轮 `1591665`；按原话"或者给开关"收口，默认仍 false → 分歧 D2）** | `src/client/index.js` `{ key: 'replan', group: 'loop', kind: 'boolean', def: false }` + 设置页 `field.replan` 开关行 |
| Sec.2-3 | 「workflow 总开关一按就报 405」 | **MERGED（本轮）`5dc0512`** | 分支 `rsi/sec2-03-mode-get`；ci exit 0（85/1622）；`test/mode-surface.spec.ts` 24 例 |
| Sec.2-4 | 「设置页没有一键升级按钮」 | **MERGED（前轮 `1591665`，本轮复验 `CONFIRMED`）· 覆盖度 PARTIAL（见 D8）** | 设置页版本/最新/命令卡片；`test/update-entry.spec.ts` 4 例通过 |
| Sec.2-5 | 「进度页的『回答』格子永远是空的」 | **MERGED（前轮 `1591665`；按原话"要么…要么删掉"选删格 → 分歧 D3）** | `PROGRESS_STAGES` 六格（start/plan/execute/verify/synthesize/end），源码注释：no `回答` event can ever reach this track |
| Sec.2-6 | 「断点续跑只做了一半，出事后不会自己接着跑」 | **MERGED（前轮 `1591665`，本轮复验 `CONFIRMED`）** | `RESUME_DECISION_WIRING = { wired: true }`（`src/checkpoint/wiring.ts:221`）；生产入口 `wiring.ts:485` 调 `resumeDecision` |
| Sec.2-7 | 「宿主证据收集那一阶段，根本没开工」 | **SKIPPED（`BLOCKED`：源文件自己要求先拍板）** | 仓库确无 `src/evidence*`（`ls src` 无该目录）；源文件"差什么：先确认这一阶段还要不要做" |
| Sec.3-1 | 「进度页跨阶段的线太多，合并成一根」 | **MERGED（本轮）`adc7fb4`** | 分支 `rsi/sec3-01-single-rail`；ci exit 0（85/1623）；`test/progress-connector.spec.ts` 19 例 |
| Sec.3-2 | 「模型失败换人时加 429 之类的勾选框」 | **SKIPPED（`BLOCKED`：需求载体已被删除，是否仍成立待确认）** | `triageModel` 整套已移除；源文件"这条需求是否还成立要重新确认" |
| Sec.3-3 | 「汇总环节也要『检查 + 复核』，不能只汇总一次」 | **SKIPPED（`BLOCKED`：现状已满足"检查+独立复核"，是否改走模型角色待拍板）** | `src/script.ts` `reviewSummaryDraft` = `checkSummaryDraft` + `verifySummaryDraft`（纯确定性）；未走配置的 verifier/supervisor 角色 |
| Sec.3-4 | 「开插件后的答案要和不开插件时长得一样」 | **SKIPPED（`BLOCKED`：只有操作员能判；人工并排比对 `NOT_RUN`）** | 源文件"是否还觉得不一样要你再验一次"；代码侧无可判定的收敛条件 |
| Sec.3-5 | 「查清那次绘画任务为什么失败」 | **SKIPPED（范围外）** | 本插件无图像功能（`ls src` 无图像模块）；失败不在本仓库，继续查需授权范围 |

**没有一项是"未尝试"**：12 项逐条读了源码/测试并给出结论；7 项落在 `main` 上，5 项带理由记账（其中 1 项属范围外）。

## 2. 分支纪律（一项一分支）

| 项 | 分支 | 自 | 分支提交 | 合入 `main` |
|---|---|---|---|---|
| Sec.2-3 | `rsi/sec2-03-mode-get` | `e4e03e9`（`main` 尖端） | `bba048a` | `5dc0512` |
| Sec.3-1 | `rsi/sec3-01-single-rail` | `5dc0512`（合完的 `main` 尖端） | `52d1080` | `adc7fb4` |

- 开分支前 `git branch -a` 已查，无同名分支；每次都是"合完上一项、`main` 前进之后"才开下一条，没有叠分支。
- 两条 `rsi/*` 分支保留在本地供复核，判定删除日期 2026-11-24（记在 `HANDOFF.md`）。
- 未 push：本地 `main` 领先 `origin/main` 2 个 merge 提交（未发版、未打 tag、未 npm publish）。

## 3. ci 绿日志（逐次）

| 跑次 | 命令 | 结果 | 日志 |
|---|---|---|---|
| 基线（`main` `e4e03e9`） | `npm run ci` | exit 0，85 文件 / 1617 测试 PASS | `logs/ci-baseline-main.log` |
| Sec.2-3 分支 | `npm run ci` | exit 0，85 / 1622 PASS | `logs/ci-sec2-03-mode-get.log` |
| Sec.3-1 分支（第一次） | `npm run ci` | **exit 1**：`test/client.spec.ts:2622` 仍断言 2 条连线（实际 3：trunk/branch/rail） | 已修并重跑，见下行 |
| Sec.3-1 分支（重跑） | `npm run ci` | exit 0，85 / 1623 PASS | `logs/ci-sec3-01-single-rail.log` |
| 合完的 `main`（`adc7fb4`） | `npm run ci` | exit 0，85 / 1623 PASS；`verify:lib`：lib 是 src 的构建，217 文件逐字节一致 | `logs/ci-main-merged.log` |

`npm run ci` = `typecheck && lint && verify:lib && (build && vitest run)`。全部在工作树内跑，未触及运行中实例。

## 4. 本轮两处代码改动（摘要）

### 4.1 Sec.2-3 · 总开关 405（`5dc0512`）

- 根因（`CONFIRMED`，源码）：`installModeRoute` 要求 `webServer` + `connection` + `sessions` **三者同时**在场才挂路由
  （Cordis `inject` 只在全部依赖可用时回调）。会话服务晚到、或只能经 `ctx.get('sessions')` 拿到时，路由完全不挂，
  浏览器 `POST /grok-workflow/mode` 落到宿主 fallback —— 空包体 405，客户端只能显示 "the mode route answered HTTP 405"。
- 改动：`inject(['webServer','connection'])`；会话服务按请求 `resolveSessions()`；无会话服务回 `503 mode/unavailable`；
  读也接受 `GET ?action=status&sessionId=…`（用 GET 写 405）；被拒方法 `logger.warn` 出「方法 + URL」；
  客户端读取遇 405 用 GET 重试一次，彻底失败报 `mode/method` 并点名"方法被拒"。
- 仍未知（`HYPOTHESIS`）：操作员那一次是"路由没挂"还是"前置代理只放行 GET"，现场无日志可判；两种情形现在都可自证。

### 4.2 Sec.3-1 · 进度页连线合并成一根（`adc7fb4`）

- 原话："进度页跨阶段的线太多，合并成一根"。
- 改动：每个环节保留自己的圆点下垂段与卡片短线；整带共用一条弯道（`PROGRESS_WIRE_LANE_GAP`）与一条竖槽
  （`PROGRESS_WIRE_CHANNEL_X`），竖线只画一次（`kind: 'rail'`）。删掉三个"每环节一条"的步进常量。
  卡片左边界、槽宽、连线永不带状态色等既有约束不变。

## 5. 分歧日志（供操作员最终复核）

- **D1（Sec.2-2）**：原话是"默认打开，**或者**在设置页给一个能点的开关"。本轮沿用的是前轮选择——**给开关、默认仍关闭**。
  理由：每次并入都会花一次规划调用（至多 `min(波数,4)`）。若操作员要的是"默认就开"，只需把 `def: false` 改 `true`。
- **D2（Sec.2-5）**：原话给两条路："把交付接进 workflow 发一个『回答』事件，**或者**把这个格子从进度页删掉"。
  前轮选了**删格**；因此进度页从此是六格，不再有"回答"。
- **D3（Sec.3-1）**：合并成一根的直接代价是"靠槽位分辨归属"消失——两个环节共用竖槽后，只能靠各自的下垂段和卡片短线
  读归属。这是原话要求的直接结果，不是附带损伤。
- **D4（Sec.2-7）**：源文件自己写"先确认这一阶段还要不要做"。本轮据此记账不实现；建议的第一刀（去密钥宿主事实快照 +
  接进 `renderReport` 可选段）已写进 `DECISIONS.md` D-111，等一句话即可开工。
- **D5（Sec.3-2）**：需求描述的是已被删除的 `triageModel` 机制。原样实现等于复活已删架构，故只记账。
- **D6（Sec.3-3）**：现状的三步汇总门（草稿 → check → 独立 verify）**已经**是"检查 + 复核"，但是**确定性检查**，
  不走配置里的 verifier/supervisor 模型角色。改成走模型角色会花额度，并把"假通过"的风险重新引入模型自评——
  这是取舍，需操作员一句话。
- **D8（Sec.2-4）**：现有入口是**只读卡片**——并排显示「已装版本 / 最新已知版本」并给一个复制安装命令的按钮；
  最新版本是随版本发布的静态常量（刻意不联网），升级本身仍要操作员把命令贴到终端跑，插件不代跑安装。
  原话问的是"有什么升级的按钮"，所以这算部分覆盖：界面入口有了，一键自助升级没有。
- **D7（Sec.3-4 / Sec.3-5）**：前者只有操作员能判（需一次开/不开插件的人工并排比对，`NOT_RUN`）；
  后者不在本仓库（本插件无图像功能）。

## 6. 环境与安全

- 未写密钥、未 force-push、未改写共享历史、未 push、未发版、未 npm publish、未动 DSH 核心、未重启或触碰运行中实例、
  未写 live home。全部改动只落在仓库工作树与 `.rsi/evidence/` 下。
