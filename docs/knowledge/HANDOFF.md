# Agent Handoff

## 2026-11-20 — `0.12.8`（round-033：手工折行的 base64 私钥 + 账本滞后）

- **From:** agent-78（RSI round 33 子代理）· **To:** 下一轮接手者 / 主会话
- **选题（`CONFIRMED`）**：`POOL.md` 池顶红脱敏项——base64 块折行窄于 24 列时整块留存。
  标记原为连续 20 字符字面量，折行把它自己拆到两行；实测 8/12/16/19/20/21/22/23 列全部不脱敏，
  24 列才第一次生效。
- **本轮改动**：`src/redact.ts` 的 9 条窗口改为生成式并可容忍自身断行（真实换行或 JSON `\n`
  转义），续行下限 16 → 8 且按行边界锚定（`D-088`、`A37`）；`test/redact.spec.ts` +3 用例；
  新增 `test/rsi-ledger.spec.ts`（5 用例）；`.rsi/ledger.jsonl` 补齐 27–32 六行。
- **记录层修复（重要，`CONFIRMED`）**：`heartbeat-guard.sh --round 33` 首跑是
  `SKIP code=round-without-ledger`（报告到 32、账本停在 25）。第 32 轮实际已闭合，是假信号；
  但该 SKIP 连续三次会升级为 `stall-unclosed` 的 **STOP**，即整条无人值守循环会在**所有测试仍绿**
  的情况下停摆。补行 + 新测试已修好，门禁码恢复为 `dirty-tracked`（当轮自己的改动）。
- **发版（`CONFIRMED`）**：patch `0.12.8`。commit `9f91684`、annotated tag `v0.12.8` 已推；远端
  CI `44670766356` success、Release `44670771402` success（asset
  `dsh-grok-workflow-0.12.8.tgz`，602,301 B）。旧标签未动（`v0.12.7` 仍在 `56e701d`），无 force-push。
- **红绿（`CONFIRMED`）**：旧码 `test/redact.spec.ts` 2 failed / 38 passed → 新码 40 passed；
  账本用例对旧账本 1 failed → 补行后 5 passed；`npm run ci` exit 0 = 68 文件 / 1231 测试 PASS。
- **NOT_RUN**：真实定时投递、GUI 手点（操作方动作，D-066）；折行 ≤7 列的块（池里新项）。
  本机 `web` profile 仍是旧版，想用新版从 `github:free6589/dsh-grok-workflow#v0.12.8` 更新。

## 2026-11-20 — `0.12.7` 已发版（round-032：删 panel 死代码）

- **From:** RSI 心跳轮（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（删减死代码，用户可见行为不变）。commit `56e701d`、
  annotated tag `v0.12.7` 已推；远端 CI `44666191493` success、Release `44666195466`
  success（asset `dsh-grok-workflow-0.12.7.tgz`）。旧标签未动，无 force-push。
- **内容**：删 `src/panel.ts`（286 行）+ 自有测试（557 行）；`gui-fold.ts` 自带类型。
  `npm run ci` 67/1223 全绿（-13 例皆所删模块自有测试）。
- **NOT_RUN**：真机 GUI；真实定时投递。本机 `web` profile 仍是旧版，
  想用新版就从 `github:free6589/dsh-grok-workflow#v0.12.7` 更新。

## 2026-11-20 — round-031：检查点上限注释多算 129 字节（`CONFIRMED`，不发版）

- **From:** agent-73（RSI round 31 子代理）· **To:** 下一轮接手者 / 主会话
- **选题（`CONFIRMED`）**：`POOL.md` checkpoint 一节第一条非 DONE 项，也是 `0.12.5` HANDOFF 里点名的
  第一条遗留不确定性（注释准确性）。选题前对表：`src/checkpoint/schema.ts:859-864` 仍写 1,048,576。
- **结论（`CONFIRMED`）**：完整性记录 = **122 字节 + `bytes` 的十进制位数**（4,000 字节载荷 126 字节、
  1,048,447 配 129 字节），所以写入侧从 **1,048,448** 就拒绝；真上限 **1,048,447**。**行为自 round 27
  起就是对的，错的是注释**——本轮是「测量 + 守卫」，无行为修复。
- **改动**：`src/checkpoint/schema.ts` 注释改为 1,048,447 并写出算式；`test/checkpoint-schema.spec.ts`
  新增 1 条（量开销 → 解上限 → 1,048,447 写入成功且文件正好 1,048,576 B → 1,048,448 `too-large` →
  读回源码要求注释写出该数）；`lib/` 重建。`D-087`、`A36`、VALIDATION Round 83。
- **红绿**：旧码 worktree `-t "bounds the payload"` → **1 failed | 37 skipped**（注释守卫）；新码
  **38 passed**。`npm run ci` **68 文件 / 1236 测试 PASS**。证据 `.rsi/evidence/round-031/`。
- **不发版（记录理由）**：只改注释与测试，无用户可见变化，按 `docs/RELEASING.md` 不 bump、不打 tag、
  `CHANGELOG.md` 的 `[Unreleased]` 保持空。当前版本仍是 `0.12.6`。
- **遗留三条仍在**（详见下节）：base64 折行 <24 列不匹配（M/low）、宿主内存版本不可观测、GUI 手点
  `NOT_RUN`；以及**心跳行 rrule 只到 2026-11-20T10:01:50Z，需主会话续订**。

## 2026-11-20 — round-030：base64 包裹的 GnuPG 私钥不再原样进报告（`CONFIRMED`，已发版 `0.12.6`）

- **From:** agent-73（RSI round 30 子代理）· **To:** 下一轮接手者 / 主会话
- **发版（`CONFIRMED`）**：patch。commit `e7150ab`、annotated tag `v0.12.6`（对象 `167b475`）已推；
  远端 CI `44659057507` success、Release `44659061505` success（asset
  `dsh-grok-workflow-0.12.6.tgz`，600,316 B）。旧标签对象未动（`v0.12.3` `0c66263`、
  `v0.12.4` `d5df98f`、`v0.12.5` `47fcb52`），无 force-push。
- **选题（`CONFIRMED`）**：`POOL.md` 红脱敏一节第一条非 DONE 项（round 29 留下的 `P · Base64-wrapped
  *PGP armor*`）。选题前与 `HEAD df6cf4b` 对表：`grep -c QR1AgUF src/redact.ts` → 0，条目成立，未陈旧。
- **本轮改动**：`base64-private-key` 从 3 条标记扩到 9 条（`PRIVATE`/`SECRET` × 三种分组对齐），窗口
  取到横幅第 17 字节；`docs/ARCHITECTURE.md` 覆盖清单与已知缺口、`CHANGELOG.md` 双语条目、README
  版本串、`lib/` 重建。细节见 `DECISIONS.md` D-086、`RESEARCH.md` A35、`VALIDATION.md` Round 81/82。
- **红绿**：旧码 worktree（`git archive df6cf4b` + 新 spec）`-t "GnuPG"` → **2 failed | 35 skipped**，
  收到的就是整串编码块；新码 **37 passed**（基线 35）。`npm run ci` **68 文件 / 1235 测试 PASS**；
  提交后 `verify:lib` = `e7150ab` 153 files byte-identical。证据 `.rsi/evidence/round-030/`。
- **本轮量出、未修（已入池）**：**<24 列折行**的 base64 块会把 20 字符标记拆到两行，整块完全不匹配
  （8–23 列留 180–184/184 字符，24 列起才脱敏）；PEM 自 round 29 起既有。真 `base64` 默认 76 列、
  `-w0` 不折行，风险是手工折行的粘贴。修它需要「标记允许自身断行」或解码通道，属独立决定。
- **心跳行状态（`CONFIRMED`，只读核对 `~/.dsh/storages/schedule.json`）**：`RSI heartbeat` 行仍
  `status: active`、只归属 `session-3a683cb6…`、prompt 3,239 字符；`lastDelivery` 现在是
  2026-11-20T02:01:50Z（`messageId` 存在），加上前一次的 01:01:50Z，共**两次真实投递**。
  **但 rrule 仍是 `FREQ=MINUTELY;INTERVAL=60;COUNT=10`，最后一次 2026-11-20T10:01:50Z——撑不到
  2026-12-01。** 本会话是子代理，宿主拒绝 `schedule_*`
  （`{"code":"subagent_session","message":"A delegated subagent cannot use scheduled tasks."}`），
  未手工改宿主存储。**主会话/操作者需把该行 rrule 改成**
  `DTSTART:20261120T100150Z\nRRULE:FREQ=HOURLY`（或每日 `FREQ=DAILY;COUNT=12` 之类）
  **并把 `UNTIL=20261201T235959Z` 或 `COUNT` 覆盖到 12-01**；行 id `schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab`。
  证据 `.rsi/evidence/round-030/schedule-row.txt`。
- **未验证（`NOT_RUN`）**：真机 GUI 手点（把 base64 的 GnuPG 私钥喂给运行中的插件看报告）。

### 下一位接手者的第一件事

1. `POOL.md` 里 `src/checkpoint/schema.ts:59` 的注释偏差（说 1,048,576，实为 1,048,447，一行可修）——
   round 27 当时「发版后动源码会让 `lib/` 与 `v0.12.3` 不一致」的理由已随每次发版失效。
2. 其次是本轮新入池的 base64 折行宽度边界（M / low）。
3. 心跳行续订见上；不续订则 2026-11-20T10:01:50Z 之后不再有自动轮次。

## 2026-11-20 — round-029：base64 包裹的私钥不再原样进报告（`CONFIRMED`，已发版 `0.12.5`）

- **发版（`CONFIRMED`）**：patch。commit `5b7cae1`、annotated tag `v0.12.5`（对象 `47fcb52`）已推；
  远端 CI `44656151053` success、Release `44656153854` success（asset
  `dsh-grok-workflow-0.12.5.tgz`，599,562 B）。旧标签未动，无 force-push。

- **From:** agent-70（RSI round 29 子代理）· **To:** 下一轮接手者 / 用户
- **选题（`CONFIRMED`）**：`POOL.md` 红脱敏一节第一条非 DONE 项（`P · Base64-wrapped PEM has no
  rule`）。选题前与 `HEAD ce856cb` 对表：`src/redact.ts` 只有 `:27`/`:31` 两条 armor 规则，都匹配
  解码后的横幅，条目成立。
- **本轮改动**：新规则 `base64-private-key`（三条分组对齐标记，整块替换含续行）；
  `docs/ARCHITECTURE.md` 覆盖清单 + 已知缺口段；两份 README 安全条目；`lib/redact.js` 重建。
  细节见 `DECISIONS.md` D-085、`RESEARCH.md` A34、`VALIDATION.md` Round 79。
- **红绿**：旧码 worktree 里新用例 **2 failed / 1 passed**，失败输出就是整串 base64 私钥体；
  新码 **35 passed**（基线 32）。`npm run ci` **68 文件 / 1233 测试 PASS**，`verify:lib` 153 files
  一致。证据 `.rsi/evidence/round-029/`。
- **心跳行状态（`CONFIRMED`，只读核对 `~/.dsh/storages/schedule.json`）**：`RSI heartbeat` 行存在、
  `status: active`、只归属 `session-3a683cb6…`、prompt 3239 字符；`lastDelivery` 显示
  2026-11-20T01:01:50Z 投递成功（首次真实投递成立）。**但 rrule 是
  `FREQ=MINUTELY;INTERVAL=60;COUNT=10`，最后一次落在 2026-11-20T10:01:50Z——撑不到 2026-12-01。**
  子代理会话被宿主拒绝使用 `schedule_*` 工具（`A delegated subagent cannot use scheduled tasks`），
  故「armed through 2026-12-01」这条只能由主会话/操作者续订（延长到 12-01 或改成每日 rrule）。
- **未验证（`NOT_RUN`）**：真机 GUI 手点、把 base64 私钥喂给运行中的插件看报告。

### 接手时的四条遗留不确定性（2026-11-20 · `0.12.5`）

1. **检查点注释上限偏差（未闭合，已定位）**：`src/checkpoint/schema.ts:59` 的注释说拒绝带跑到
   1,048,576，但密封文件带 129 字节完整性记录，`writeCheckpoint` 的文件上限把合法载荷卡在
   **1,048,447**（A33 实测 1,019,510 + 129）。round 27 当时不改的理由是「发版后动源码会让 `lib/`
   与 `v0.12.3` 不一致」——`0.12.5` 已经重建过 `lib/`，这个理由失效，一行注释即可修，已作为
   `POOL.md` 的 P 项排队。
2. **`readCheckpoint` 无生产调用者（已闭合为事实）**：在本提交 `a85d3bb` 上核过——定义在
   `src/checkpoint/writer.ts:137`，全仓库除 `wiring.ts:246` 的一句文档提及外无引用；`src/run.ts:21`
   只导入写侧的 `createCheckpointRecorder` / `unloadCheckpointRecorders`，`src/index.ts` 不导出
   checkpoint 模块。所以 round 27 修的是**读写往返**断裂，不是观察到的续跑失败。
3. **宿主进程内存里的代码身份不可观测（未变，`NOT_RUN`）**：插件不打印版本、ESM 缓存无版本标记、
   `dsh-hmr` 挂载为 `root: []`，只能证明「磁盘/档案/prof 标签一致 + 宿主未重启」。
4. **GUI 点按与真实定时投递（一半闭合）**：真实定时投递本轮**首次拿到硬证据**——只读快照显示
   `RSI heartbeat` 行 `lastDelivery.scheduledAt = 2026-11-20T01:01:50Z`、
   `deliveredAt = 2026-11-20T01:02:00.707Z` 且带 `messageId`，行 `status: active`、只有一个归属会话
   `session-3a683cb6…`（证据 `.rsi/evidence/round-029/schedule-row.txt`）。**但该行 rrule 是
   `FREQ=MINUTELY;INTERVAL=60;COUNT=10`，最后一次 2026-11-20T10:01:50Z，撑不到 2026-12-01**；
   本会话是子代理，宿主拒绝 `schedule_*`（`A delegated subagent cannot use scheduled tasks`），
   所以「续订到 12-01」只能由主会话或操作者做。GUI 手点仍 `NOT_RUN`。

## 2026-11-20 — `0.12.4` 已发版（round-028：R11）

- **From:** RSI 心跳轮（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（取消终结文案修正）。commit `5cd2b1c`、annotated tag
  `v0.12.4` 已推；远端 CI `44652383452` success、Release `44652387975` success
  （asset `dsh-grok-workflow-0.12.4.tgz`）。旧标签未动，无 force-push。
- **内容**：取消终结改说人话结论（不再带成功前言/markers/折叠台账）；
  `phase1-dialogue` 3 旧断言随行为同步更新。`npm run ci` 68/1230 全绿。
- **NOT_RUN**：真机 GUI 手动取消看终结；真实定时投递。本机 `web` profile 仍是旧版，
  想用新版就从 `github:free6589/dsh-grok-workflow#v0.12.4` 更新。

## 2026-11-20 08:55 — round-027：检查点「写得进读不出」修掉，接下来只剩 R11 与 panel 问题

- **From:** agent-65（round 27，update-then-self-iterate）· **To:** 下一轮 / 用户
- **本轮（`CONFIRMED`）**：`integrity.bytes` 的读侧上限从 `countCeiling`（1,000,000，行数上限）
  改为 `maxBytes`（1,048,576，写入侧同一个上限）。缺陷实测：带内载荷（481 条最大宽度证据行 =
  1,001,015 字节）修前读回 `CheckpointError('invalid', … integrity.bytes …)`，修后落盘读回校验通过。
  证据 `.rsi/evidence/round-027/`（`test-red.txt` / `test-green.txt` / `ci.txt`）。
- **选题依据（`CONFIRMED`）**：`POOL.md` 与 `HEAD` 对表后六条已陈旧（redaction 调用点、history 顺序、
  answerLead 句数、R6、R9、R10），已在池里标 STALE/DONE 并注明锚点。**下一轮从这里接**：R11
  （取消终结消息仍在组合 `relayText` 的前导与标记，`gate.ts:611-644`）与 `src/panel.ts` 无生产
  导入者（只有三个测试文件引用）这两条。
- **发行（`CONFIRMED`）**：patch 级（读侧拒绝语义修复，无新配置面）。发布提交 `fd6a5ee`、
  annotated tag `v0.12.3`（对象 `0c66263`）已推；远端 CI `44647313571` success、
  Release `44647317251` success（`dsh-grok-workflow-0.12.3.tgz`，597,237 B）。旧标签未动、
  无 force-push。`verify:lib` 提交后 = `lib/ at fd6a5ee is the build of src/ at fd6a5ee`。
- **档案（`CONFIRMED`）**：`~/.dsh/profiles/web` 升到 `#v0.12.3`，`lib/` 与
  `git archive v0.12.3 lib` 的 `diff -r --exclude='*.map'` = 0；宿主 pid `154637` 未重启；
  `plugin_manager` 里 `include:grok-workflow` 仍 `fiberPhase: active`。装好的产物自身跑通
  1,001,051 B 载荷的落盘→读回（`.rsi/evidence/round-027/shipped-roundtrip.txt`）。
- **没做到的一件小事（`CONFIRMED`，故意不动）**：`src/checkpoint/schema.ts` 的注释把带的上沿
  写成 1,048,576，实际是 1,048,447（整文件多出 129 字节的 integrity 记录）。发布后改注解会让
  `lib/` 与 `v0.12.3` 不再逐字节相同，故留给下一轮连同代码一起改。
- **仍 `NOT_RUN`（需操作者）**：真实定时投递一轮心跳（D-066，要占一个真实间隔）、GUI 手动点击截图。
- **注意**：`~/.dsh/profiles/web` 已升到本轮 tag；宿主 pid 至今未重启，profile 更新只改磁盘上的
  安装物，验收口径按 D-083 读（`HEAD == origin/main`、发布标签为祖先、发布代码与标签逐字节相同）。

## 2026-11-20 08:20 — 复查：`v0.12.2` 仍是最新，仓库和档案都停在它上面，卡点只剩验收口径

- **From:** agent-60（execution，attempt 2）· **To:** 用户 / `lead`
- **复查（`CONFIRMED`）**：远端 tag/Release 仍以 `v0.12.2`（`40228c5`）为最新；本地 `main` =
  `origin/main` = `5bd5bfe`（`git describe` = `v0.12.2-4-g5bd5bfe`），标签是祖先，其后四条 docs
  提交在 `src`/`lib`/`test`/`package.json` 上与标签 diff = 0 个文件；档案 `~/.dsh/profiles/web`
  仍钉 `#v0.12.2`、装的 `0.12.2`、77 个 shipped `lib` 文件 sha256 全同；宿主 pid `154637`
  `lstart` 未变、`etimes` 连续到 206772s+、`:3080` 仍由它持有、GUI 回 `HTTP 401`。两轮之间远端
  没有新 tag，所以既没有可 fast-forward 的提交，也没有对档案做第二次改动。
- **卡点（不是执行遗漏）**：验收项「本地 HEAD 等于最新发布标签提交」在「不回退 / 不 force-push /
  本地远端同步 / 不擅自新发版」四条约束下无解——要让 `HEAD` 正好压在标签上，只能丢已推提交、
  重写共享历史、或自己造一个 Release。取舍与四个被否方案见 `DECISIONS.md` D-083。
- **Next action（需操作者二选一）**：①把该验收项改成「`HEAD == origin/main`，发布标签为其祖先，
  发布代码与标签逐字节相同」；②显式授权发一个 `v0.12.3`（这次提交要含版本号与 changelog），让
  `HEAD` 正好落在新标签上。在此之前请不要再派代理去「把 HEAD 掰回标签」——那会丢已推提交。


## 2026-11-20 — `web` profile 已更新到 `v0.12.2`（repo 无需变动，DSH 未重启）

- **From:** lead（本会话，update-latest-no-restart）· **To:** 用户 / 下一轮接手者
- **仓库侧（`CONFIRMED`）**：本地 `main` = `origin/main` = `07666fb`，`git describe` 为
  `v0.12.2-2-g07666fb`；`v0.12.2`（`40228c5`）是 `HEAD` 的祖先，`v0.12.2..HEAD` 只有两条
  docs 提交（`074e2c3`、`07666fb`），`src/`+`lib/` 与标签逐字节相同。远端最新 tag/Release
  仍是 `v0.12.2`，无更新可拉——**没有做任何 fast-forward，也没有回退到标签提交**（回退会丢
  掉那两条已推的发布记录提交，且会让本地落后远端）。
- **档案侧（`CONFIRMED`）**：`~/.dsh/profiles/web` 的 `dsh-grok-workflow` 从
  `github:free6589/dsh-grok-workflow#v0.12.1` 升到 `#v0.12.2`，用文档里的
  `dsh plugin --profile web add ...`（`docs/RELEASING.md` §版本切换）执行；pnpm 解析到
  `codeload.../tar.gz/40228c5...`，`pnpm ls` 报 `dsh-grok-workflow@0.12.2`，`node_modules`
  里的 77 个 `lib/**/*.js|d.ts` 与仓库 `lib/` 逐文件 sha256 一致（只少 `.map`，因为发包
  `files` 不含它们）。`package.json` 只改了这一行，锁文件随之更新。
- **DSH 未重启（`CONFIRMED`）**：`dsh web` 主进程 pid `154637`，`lstart` 仍是
  `Tue Nov 17 22:49:32 2026`，`etimes` 从 206082s 连续涨到 206168s+；`/proc` boot_id 未变、
  上次开机仍是 2026-10-31；`http://100.111.111.88:3080/` 仍应答（HTTP 401 = 活着但要鉴权）。
- **代价（`CONFIRMED`，必须写清楚）**：DSH 0.2.2-rc.3 的核心里没有对档案文件的 watcher
  （`grep -rln 'fs.watch|chokidar|watchFile'` 在核心包内 0 命中），`docs/RELEASING.md` 也写明
  「切换版本后请重启对应 DSH profile」。**所以磁盘/档案已是 `0.12.2`，当前进程内存里跑的仍是
  `0.12.1` 的模块**；`0.12.1 → 0.12.2` 的两条修复（`grokDefault` fail-closed、COMPLETED 不计
  已恢复失败）要等下次 profile 启动才生效。
- **未做（`NOT_RUN`，遵约束）**：未重启/重载 DSH、未 force-push、未移动任何标签、未 npm 发布
  （`registry.npmjs.org/dsh-grok-workflow` 仍 404）、未改 DSH 核心（该目录无 `git`，最近 3 小时
  无文件改动）。
- 证据：`.rsi/evidence/profile-update-0.12.2/`（`before.txt` / `after.txt` / `verify.log`）。

## 2026-11-20 — `0.12.2` 已发版（round-026：R6 + R9）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（两条报错/报假类修复）。commit `c1be0c7`（+hygiene
  `40228c5`）、annotated tag `v0.12.2` 已推；远端 CI `44641153858` success、
  Release `44641158387` success（asset `dsh-grok-workflow-0.12.2.tgz`）。
  旧标签未动，无 force-push。
- **内容**：R6 `resolveConfig` 拒收坏 `grokDefault`（fail-closed，不再静默关工作流）+
  R9 COMPLETED 轮次不计已恢复失败（报告与台账同规则，PARTIAL 不受影响）。
  `npm run ci` 68/1229 全绿；`verify:lib` 153 文件一致。
- **NOT_RUN**：真实定时投递、GUI 手动点击拍照。（本机 `web` profile 当时还是旧版；已在下面
  第一条「`web` profile 已更新到 `v0.12.2`」里升到 `#v0.12.2`。）

## 2026-11-20 — `0.12.1` 已发版（round-025：自迭代默认模板）

- **From:** agent-50（self_iterate_full）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（默认内容变更，向后兼容：已存模板的档案不受影响）。
  commit `23d3369`、annotated tag `v0.12.1` 已推；远端 CI `44595376323` success
  （Node 22 + Node 24），Release `44595391505` success
  （asset `dsh-grok-workflow-0.12.1.tgz`，594 810 bytes）。旧标签未动，无 force-push，
  未发布 npm。
- **内容**：`DEFAULT_ITERATE_TEMPLATE` 由 12 行通用提示词改为 `docs/iterate-template.md`
  的轮次提示词；`src/client/index.js` 的设置页副本同步；新增 `test/iterate-template.spec.ts`
  （文档↔常量逐字节、4000 字符上限、每个必需章节一条断言）；`test/loop-surface.spec.ts`
  补自迭代路由 `status` 用例并把模板断言改为读常量。README 双语配置表指向新文档。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **68 文件 / 1227 测试 PASS**，typecheck 0 错、
  oxlint 24 warnings / 0 errors；提交后 `npm run verify:lib` = `lib/ at 23d3369 is the build of
  src/ at 23d3369`（153 files byte-identical）；测试文件数 63 基线 → 68（只增）。
- **真机（`CONFIRMED`，复制档案 `loopfix-verify`，link 本树，`:3451`，实例已停）**：
  `live-iterate.mjs` 用真实 bundle 的开关、真实 page fetch、真实路由/服务/设置写路径；
  档案里模板已为空白（回退路径被真正走到）。开 → Schedule 行 `RSI heartbeat` 写入 3239 字符，
  与 `DEFAULT_ITERATE_TEMPLATE` 逐字节相同；关 → 只删自己那行，会话无残留、未删他人行；
  第二次开关同样干净。收尾 `~/.dsh/storages/schedule.json` 只剩操作者原有的一行。
  证据 `.rsi/evidence/round-025/`（`boot.redacted.txt` 已脱敏；cookie jar 未入库并已删除）。
- **未做（`NOT_RUN`）**：真实定时投递（D-066，操作者的事）；浏览器 GUI 手动点击拍照。
- **接手注意**：默认模板是「会被投递的提示词」，改它等于改每个空白档案的行为；改动时同时改
  `docs/iterate-template.md`、`src/config.ts`、`src/client/index.js` 三处，
  `test/iterate-template.spec.ts` 与 `test/client.spec.ts` 会立刻指出漏改。

## 2026-11-20 — `0.12.0` 已发版（round-024 三线收口）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：minor（新功能向后兼容）。commit `9839025`、annotated tag
  `v0.12.0` 已推；远端 CI `44587743089` success、Release `44587748822` success
  （asset `dsh-grok-workflow-0.12.0.tgz`）。旧标签未动，无 force-push。
- **内容**：自迭代第二开关 + 可改模板（Added 1）+ 5 条 Fixed（双行清理、串线、心跳审计、
  `/grok on` 卡消息、`/grok` 开头提示词被吞）。`npm run ci` 67/1219 全绿；
  真机双路由 + 双开关生产路径全通（证据 `.rsi/evidence/round-024/`）。
- **用户动作**：本机 `web` profile 仍是 `0.11.21`，想用新开关就从
  `github:free6589/dsh-grok-workflow#v0.12.0` 更新。NOT_RUN 依旧：真实定时投递、
  浏览器 GUI 手动点击拍照。

## 2026-11-20 — settings-toggle-ui 收口：双开关 + 模板 textarea（已改，未提交）

- **From:** agent-8（settings-toggle-ui）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`（v0.11.21）
- **任务**：验证并落地设置 UI 接线——两个 composer 开关各自只创建/删除自己的 Schedule 行、
  模板 textarea 随档案持久化、生产路径测试走真实 fetch。
- **改动（`CONFIRMED`）**：`src/loop.ts`（`ITERATE_TASK_TITLE`/`ITERATE_ROUTE_PATH`、
  `LoopServiceDeps.identity`、服务内 `slotOf`/`markedOf` 绑定身份）、`src/loop-surface.ts`
  （`InstallLoopOptions.iterate`、`handleLoopRoute` 加 dispatch 参数并导出为测试缝、
  `dispatchIterateAction`——open 不收 prompt/interval）、`src/config.ts`
  （`iterateIntervalMin` + `iterateTemplate`，CONFIG_KEYS 13→15、`DEFAULT_ITERATE_TEMPLATE`）、
  `src/types.ts`（两个 ResolvedConfig 字段）、`src/index.ts`（iterate 实例 + installLoop 接线）、
  `src/client/index.js`（`makeHeartbeatSwitch` 工厂 + `GROK_WORKFLOW_ITERATE` +
  `startBothSwitches`；设置页「自迭代」分组：数字 + textarea + `error.badTemplate` 校验；
  中英 +20 键）；README 双语 + LOCAL-TESTING 同步（十五个键 + 自迭代开关一段）；
  CHANGELOG `[Unreleased]` Added 一条（双语）。
- **测试（`CONFIRMED`）**：新 `test/iterate.spec.ts` 9 例（槽位独立、按标题收回手装行并回写
  模板、空白回退、模板编辑经刷新落活行、agent open 仍拒）；`test/client.spec.ts` 97 例含新
  生产路径用例（真实 page fetch → 真 `node:http` → 真 `handleLoopRoute` → 真
  `createLoopService`，无任何 mock 成功；textarea draft→ops→save）；`loop-runtime-wiring`
  5 例（fake-web 按 path 存双路由）。`npm run ci` exit 0 = **67 文件 / 1218 测试 PASS**，
  `verify:lib` 通过（证据 `.rsi/evidence/round-024/ci-settings-run.log`）。
- **真机（`CONFIRMED`）**：隔离 profile `loopfix-verify`（link 本树，`:3451`）——
  `.rsi/evidence/round-024/switches-and-template.mjs` 驱动真实 bundle 双开关（无 send 覆盖），
  模板走真实设置写路径（describe→mutate→重 describe 逐字节回读→patch 落盘）；两开关互不
  碰对方的行、收尾无残留 Schedule 行、patch 内测试模板已恢复；实例已停，cookie 值不回显。
- **未做（`NOT_RUN`）**：真实定时投递（D-066）；浏览器 GUI 手动点击拍照。commit/push/发版
  （本任务不授权）。
- **接手注意**：树里有并发写入者（`src/intake.ts`/`src/command.ts`/`src/answer.ts`/`src/gate.ts`
  的 intake 与 `/grok on` 修复），提交前先 `git status` 分清归属；发版时把 `[Unreleased]`
  的 Added 搬进新版本段（patch 或 minor 由收尾组定）。


## 2026-11-20 — 心跳隔离第二轮：自迭代心跳成为插件第二实例后的串线已修（agent-19，已改，未提交）

- **From:** agent-19（heartbeat-routing，attempt 2）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`
- **为什么有第二轮**：第一轮（agent-9）的 `HEARTBEATS.md` / RESEARCH A30 写的是「自迭代心跳
  无插件路由、无插件工具，由操作者的 Automation 任务投递」。同一工作树随后加入了第二个
  `createLoopService`（`src/index.ts:313`，`RSI heartbeat`）、`/grok-workflow/iterate` 路由
  （`src/loop-surface.ts:148`，`dispatchIterateAction` 只收 `{action, sessionId}`）、
  `iterateTemplate` 配置（`src/config.ts:166`）和页面「自迭代」开关。第一轮的结论因此过期，
  本轮按当前树重审并把过期说法改掉。
- **真实缺陷（`CONFIRMED`，先复现后修）**：`forgetSession` 调 `deleteSessionHeartbeats`，
  后者用写死的 `isLoopSlot` 过滤 → **自迭代实例的归档清扫删掉循环的行、留下自己的行**
  （当前接线只把循环实例挂到归档事件，故今天从组合层不可达；但它是归档清扫的接口，按接口
  正确处理）。
  修复：`deleteSessionHeartbeats`（`src/loop.ts:752`）收调用实例的 `slot` 谓词（默认
  `isLoopSlot`，刹车仍只清循环行），`forgetSession`（`:650`）传 `slotOf`（`:457`）。
- **新增测试**：反方向所有权 5 例（`test/heartbeat-identity.spec.ts`，含归档/卸载/open）、
  门禁「用户粘贴 `[grok-workflow loop]` 仍 `admit`」1 例、路由层「two switches, two routes」
  4 例（`test/loop-surface.spec.ts`）、页面层路由隔离 1 例（`test/client.spec.ts`）。
- **复验（`CONFIRMED`）**：`npm run ci`（不带管道，取真实退出码）**exit 0 = 67 文件 / 1219
  测试 PASS**；负对照 1（去掉 `slotOf` 参数）**1 failed / 14 passed**，负对照 2（iterate 路由
  绑到循环服务）**2 failed / 18 passed**，两次都按 `sha256sum -c` 逐字节还原
  （`src/loop.ts` `8ec1da9b…`、`src/loop-surface.ts` `a19c8920…`）。live
  `~/.dsh/storages/schedule.json` 只读 = 一条无关任务、两心跳未武装、本会话零写入。
  命令与数字见 `VALIDATION.md` 心跳第二轮段。
- **残留（写明，不改）**：F3 `.rsi/STOP` 双停（D-080）；F5 `Loop heartbeat` 是保留名；
  卸载只清循环行（`src/loop-surface.ts:115`），自迭代行按设计留存（D-081）——它的投递只是
  普通定时消息，不会进入任何插件处理器。真实定时投递、真机 GUI 归档后任务列表仍 `NOT_RUN`。
- **本任务写面**：`src/loop.ts`、`test/heartbeat-identity.spec.ts`、`test/loop-surface.spec.ts`、
  `test/client.spec.ts`（只新增 1 例 + bundle 类型字段）、`lib/*`（构建产物）、
  `docs/knowledge/HEARTBEATS.md`（按当前树重写）、`CHANGELOG.md`、记忆六件。
  工作树里的 `src/intake.ts`/`src/command.ts`/`src/answer.ts`、`test/iterate.spec.ts` 与
  `test/client.spec.ts` 的生产路径用例是**并发任务**的改动；CI 前两跑红在对方正在编辑的
  client 用例，对方 01:32 完成后同命令全绿。

（Loop ↔ Iterate 互不触发，已改，未提交）

- **From:** agent-9（heartbeat-routing 审计收尾）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`（v0.11.21）
- **结论（`CONFIRMED`）**：两个心跳的身份与路由已按 D-079/D-080 落地并独立复验——
  Loop（`Loop heartbeat` / `[grok-workflow loop]` / `/grok-workflow/loop` / `grok_loop`，
  `src/loop.ts:66/69/108/111`）与 Iterate（`RSI heartbeat` / `# RSI heartbeat — round N`，
  来自 `.rsi/HEARTBEAT.md:24`，无插件路由、无插件工具）互不进对方的门禁分支：
  `classifyPreStep`（`src/gate.ts:484`）先查心跳（`:496`）再过滤用户源（`:503`），
  `isHeartbeatMessage`（`:532`）要求 `source.kind==='schedule'` **且** `isLoopHeartbeat`，
  Iterate 投递落在 `non-user-source` 直通（`loop.review/admit/stop` 全不调用，刹车spy 钉死）。
  存储身份 `isLoopSlot`（`src/loop.ts:292`）只认保留名 + `rrule` + 目标会话，
  `open()` 的 refresh/resume/replace 三路都清重复行（`dropDuplicates`，`:535`）、
  删除被拒改写幸存行（`:502`）、`close/stopAll/forgetSession` 按槽位删并读回汇报——
  开关来回拨不会留下第二行，被改掉标记的行仍可收回。审计正文与证据矩阵：
  `docs/knowledge/HEARTBEATS.md`。
- **复验（`CONFIRMED`，命令与数字见 `VALIDATION.md` 心跳段「收尾复验」表）**：
  三文件 50 测试全绿；负对照（换回修前 `src/loop.ts`）**7 failed / 38 passed**、跑后按
  sha256 逐字节还原；全量 `npm run ci` exit 0 = **66 文件 / 1195 测试 PASS**；
  live `~/.dsh/storages/schedule.json` 只读检查 = 一条无关任务、两心跳未武装、本会话零写入。
- **残留边界（写明，不改）**：F3 `.rsi/STOP` 仍同时停两个心跳（方向只会停、不会串路由，
  `GROK_WORKFLOW_STOP_FILE` 可分离，D-080）；F5 `Loop heartbeat` 成为保留名——操作者若把
  自迭代任务也叫这个名字会被收回（规避：命名 `RSI heartbeat`）；真实定时投递与真机 GUI
  观察仍 `NOT_RUN`（武装任务是操作者动作，D-066）。
- **本任务写面**：`src/loop.ts`、`src/gate.ts`（心跳分支），`test/heartbeat-identity.spec.ts`（新）、
  `test/loop.spec.ts`、`test/loop-runtime-wiring.spec.ts`、`docs/knowledge/HEARTBEATS.md`（新）、
  `CHANGELOG.md`、记忆六件。工作树里 `src/intake.ts`/`src/command.ts`/`src/answer.ts` 与
  `/grok on` 后台受理是**并发任务**的改动，不属于本审计；合并时按各自 HANDOFF 段核对。

## 2026-11-19 — 新会话提示词入口加固：以 `/grok` 开头的任务提示词被命令吞掉（已改，未提交）

- **From:** agent-5（prompt-intake-stall）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`（v0.11.21）
- **结论（`CONFIRMED`）**：用户贴进新会话的「自我迭代 /grok 团队任务」提示词**不是**因长度卡住：
  实测 2 041 字符 / 3 697 字节（会话 `session-042dfe19` seq 4），另一会话 2 032 / 3 688 两次
  （`session-b7be2bd2` seq 2944/2953），都只占 32 000 字符目标预算的 6.4%，无截断。真正原因：
  第一行以 `/grok` 开头 → `dsh-commands` `parseCommand` 把整行当命令、正文成为参数 → 旧语法
  只回一行 `Usage: /grok [on|off]` → 没有 `user/message`、没有 `agent/pre-step`、没有 run，
  用户看到的等于静默。
- **改动（`CONFIRMED`）**：新增 `src/intake.ts`（`INTAKE_LIMITS` 直接取 `TASK_LIMITS.objectiveChars`；
  `inspectPrompt` / `refuseEmptyPrompt` / `refuseOversizePrompt` / `refuseDiscardedCommandPrompt` /
  `isPromptShapedArgument` / `assembleTaskPrompt`，拒绝文本一律英中两行 + 实测字符数 + 分段数 +
  下一步）；`src/command.ts` 非开关参数按形态分档（单行 = `GROK_USAGE_TEXT`，多行或 >200 字符 =
  带字符数的双语拒绝，**开关语义与回读校验逐字未动**）；`src/gate.ts` `refusalOf` 与迟到目标
  统一走 intake；新增 `docs/task-prompt-template.md`（默认模板 + 入口规则 + 证据）；
  `test/intake.spec.ts`（14 条，含模板自检：模板在预算内且不以 `/` 开头）、`test/command.spec.ts`
  +3 条（复刻 2 041 字符真形状与 `/grok on /grok …` 形状）、`test/objective-limit.spec.ts`
  +1 条（空消息双语拒绝）、built-artifact 守卫改钉新接线点。
- **证据（`CONFIRMED`）**：`docs/knowledge/evidence/prompt-intake-2026-11-19/`
  （`measure-intake-stall.py` + `measure-output.txt` 实测 40 次 `/grok` 调用；`red-full.log`
  = 修前 8 failed / 42 passed；`ci.log` = `npm run ci` exit 0，**66 文件 / 1195 测试 PASS**）。
- **未做（`NOT_RUN`）**：真机 GUI 用修好的构建粘一次同一提示词（本轮同一工作树有并发写入者，
  实例留给收尾组）；commit / push / 发版（本任务不授权）。
- **合并注意**：本任务未提交。同一工作树里 `src/answer.ts`、`src/loop.ts`、`src/client/index.js`、
  `CHANGELOG.md`、`docs/knowledge/VALIDATION.md`、`lib/*` 有其它并发写入者的改动；`D-078` 的编号
  可能与并发任务撞号，合并时以先入库者为准并顺延另一个。`/grok on` 之后发不出消息那条
  （agent-2 的 `answerFullBehind`）与本任务是相邻但不同的问题：那条改的是 `full` 形态的等待方式，
  本任务只动参数入口。

## 2026-11-19 — 用户报障：`/grok on` 之后发不出消息（已改，未提交）

- **From:** agent-2（本任务）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`（v0.11.21）
- **根因（`CONFIRMED`）**：`/grok on` 写 `workflowMode: 'full'`（`src/command.ts:142`），
  `full` 是唯一绕过交互式受理的形态：`answerTeamInteractive` 只接 `triage`
  （`src/gate.ts:1281`），`full` 落到 `await produceAnswer(...)`（修前 `:1458`，现 `:1550`），
  `in-turn` 于是把整步开着等 run 跑完；真实 `AgentLoop` 只在当前 step 结算后才
  `inbox.claim()` 下一批（`dsh-agent-loop/lib/index.js:683`，`turn()` 的 `while` 在 `:752`、
  `step` 在 `:780`），所以那段时间（默认 deadline 60 分钟，`src/config.ts:104`）用户打的每条
  消息都只进队列、永不派发。`/grok off` 走 `mode-off` 直接 pass，故「off 就行」。
- **改动（`CONFIRMED`）**：`src/gate.ts` 新增 `answerFullBehind`（会话记录
  `workflowMode === 'full'` + 能后台交付）：先回执 + `enqueue` 后台跑 + `deliverAndRecord`
  单独发结论；`src/answer.ts` 新增 `acceptedEnterText`；`test/grok-on-ingress.spec.ts`
  5 条回归（复刻 `AgentLoop` 派发纪律 + 真 `Session` + 挂起引擎，无需在线模型）。
  部署级默认 `mode: 'full'` 保持 T4 `in-turn` 逐字不变（gate 17 条用例钉着）。
- **证据（`CONFIRMED`）**：修前 `npx vitest run test/grok-on-ingress.spec.ts` = 2 failed /
  2 passed；修后 = 4 passed；`gate + phase1-dialogue + human-output-contract + 新用例`
  = 4 文件 / 99 测试 PASS；`npm run typecheck` 0 error。
  独立复核（agent-17，2026-11-20）：修前数据由 `HEAD` worktree 复跑确认
  （`docs/knowledge/evidence/grok-on-ingress-2026-11-19/repro-before-head-worktree.log`）；
  `npm run ci` 两处跑绿：共享工作树 exit 0 = **67 文件 / 1218 测试**
  （`.../shared-tree-ci-green.log`）；「`HEAD` + 只本修复」隔离树 exit 0 = 64 文件 / 1164
  测试（`.../ci-isolated-fix-only.log`）。同日更早几次共享树是红的，红点全在并发写入者的
  半成品上（`src/client/index.js:1514` 语法错、`test/client.spec.ts` 的 `TS2304`、配置面 5
  文件），随他们落地转绿，与本修复无关。
- **未做（`NOT_RUN`）**：真机 GUI 连发两条（同一工作树有并发写入者，实例留给收尾组）；
  commit/push/发版（本任务不授权）。
- **接手注意**：本树有并发写入者（`src/loop.ts`、`src/command.ts`、`src/intake.ts`），
  提交前先 `git status` 确认哪些是你的；`lib/` 需在提交前重建。
- **已知遗留**：部署级 `mode: 'full'` + 交互式会话仍走 in-turn（同样的等待问题）；改它要
  同时改 17 条钉住 T4 契约的用例，属独立决策。

## 2026-11-19 — 用户报障修：续跑开关点不动 + `HTTP undefined`（已提交，未 push/未发版）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **根因（`CONFIRMED`）**：`LoopSwitch` 生产默认 `send = props.loopSend ?? loopSend`，
  把请求体形的 `loopSend(body)` 当 fetch 传：真机上每次读取都被包两层，
  内层返回的 `{ok:false}` 对象无 `.status`，外层报 `loop/response` + `HTTP undefined`，
  开关 `failed` 卡死、点不动。测试全用 mock `loopSend`，生产路径零覆盖，故 CI 全绿也拦不住。
- **改动（`CONFIRMED`）**：`src/client/index.js` 默认改走页面 `fetch`（5 行 + 注释）；
  `test/client.spec.ts` 新增生产路径回归用例（不传 `loopSend`，挂载→读→点开→点关）；
  `CHANGELOG.md` `[Unreleased]` 双语 Fixed；`lib/` 重建。提交 `1c28c6d`，
  **未 push、未打 tag、未建 Release**。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **63 文件 / 1159 测试 PASS**；
  `npm run verify:lib` = `lib/ at 1c28c6d is the build of src/ at 1c28c6d`
 （149 files byte-identical）。证据 `.rsi/evidence/round-023/`。
- **真机（`CONFIRMED`）**：复制 profile `loopfix-verify`（link 本树，`:3451`）——
  路由 `status→open→status→close→status` 5×200、关后无残留行；真实 bundle 生产路径脚本
  mount 显示 `关` → 点开 `开 · 每 60 分钟 · 还剩 10 轮`（服务端确认 task）→ 再点回 `关`
  （服务端确认关闭）。实例已停，token/cookie 已清，证据无密钥。
- **Next action**：用户在自己浏览器点一次开关确认 → 确认后 push + 按 `docs/RELEASING.md`
  走 patch 发版（`[Unreleased]` 只有这一条 Fixed）。`loopfix-verify` profile
  留在 `~/.dsh/profiles/`，复用或删除由用户定。

## 2026-11-19 — round 21 落地（C1 提示补 `supervisor`）+ 脏树清理：遗留 mock 已归位归档

- **From:** 清理任务（子代理）· **To:** 用户 / 下一轮接手者
- **本轮改了什么（`CONFIRMED`）**：`src/run.ts` `configRouteLabels()` 补 `supervisor`
  （五个角色、报告顺序），`test/route-concurrency.spec.ts` 钉住五角色标签列表；
  `CHANGELOG.md` `[Unreleased]` 双语 Fixed；`lib/` 由 `npm run build` 重建。开发提交
  `3cd68eb`，**未 push、未打 tag、未建 Release、未发 npm**。
  这段改动与红/绿证据原本是并发写入者 17:04:54–17:05:02 留下的未提交工作，本次核实后落地。
- **脏树处置（`CONFIRMED`）**：`M src/run.ts`、`M test/route-concurrency.spec.ts`、
  `M CHANGELOG.md`、`M lib/run.d.ts|js|map`、`?? .rsi/evidence/round-021/` 全部有价值 →
  提交；`git status --short --branch` 收工为干净（仅 `## main...origin/main [ahead 1]`）。
- **遗留文件（`CONFIRMED`）**：根目录的 `settings-simple-mock.html`（179 行，sha256
  `3fe1e657…`，D-055 设置面瘦身的设计输入）已逐字节存到
  `.rsi/archive/settings-simple-mock.html`，来源/完整性/还原命令见
  `.rsi/archive/README.md`，根副本删除。**旧结论「`settings-simple-mock.html` 允许未跟踪、
  永不入库」就此作废**：仓库不再保留任何"故意未跟踪"的根文件，需要留存的草稿一律放
  `.rsi/archive/`（不进 npm 包，`package.json` `files` 只含 `lib/**`、`docs/*.md`、
  `docs/images` 等）。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **63 文件 / 1157 测试 PASS**，
  `tsc --noEmit` 0 error，oxlint 22 warnings / 0 errors，`npm run build` 连跑逐字节一致，
  `npm run verify:lib` = `lib/ at 3cd68eb is the build of src/ at 3cd68eb`（149 files
  byte-identical）。证据 `.rsi/evidence/round-021/`。
- **未验证（`NOT_RUN`）**：两个真实并发 run 的忙闲避让效果（提示只在脚本侧降权）；
  GUI 观感；发版链路。
- **接手注意**：本地比远端多一个提交（`origin/main` 仍是 `337b061` = `v0.11.19` 的树）。
  下一轮若要发版，先 `git push origin main` 走 fast-forward，再按 `docs/RELEASING.md` 打
  patch tag；不要 force-push，不要移动 `v0.11.14`–`v0.11.19`。

## 2026-11-19 — `0.11.17` 发版 + tag 安装验证 + 本机 GitHub 更新（已全部落地）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：
  1. 发版（patch，用户已授权）：`bump-version.py 0.11.17` 同步 5 处
     （`package.json`+`package-lock.json`+两份 README+`LOCAL-TESTING.md` tgz 名）；
     CHANGELOG `[Unreleased]` Added 搬进 `## [0.11.17] - 2026-11-19`；
     README 测试数 62/1142 → 63/1154（双语）。commit `5fc3e1d`、annotated tag
     `v0.11.17` 已推 `origin/main` 与 `origin/v0.11.17`；远端 CI `44459682983`
     success；Release `Grok Workflow for DSH v0.11.17` 已建
    （asset `dsh-grok-workflow-0.11.17.tgz`）。旧标签未动，无 force-push。
  2. tag 安装验证 PASS（隔离 profile `acc-tag`，`DSH_HOME=.tmp/r18/home`，端口 3442，
     从 `github:free6589/dsh-grok-workflow#v0.11.17` 装——无本地路径）：
     行激活、投影 11 键、`grok_workflow`+`grok_loop` 双工具、`loop` 路由
     status→open→close 全通（400/401/405 行为符合文档）、`lib/guardian.js`
     逐字节一致、client 三处一致。证据 `.rsi/evidence/round-018/install/`。
  3. 本机更新：`DSH_HOME=/home/fish/.dsh dsh plugin --profile web add
     github:free6589/dsh-grok-workflow#v0.11.17` exit 0（`0.11.13` → `0.11.17`，
     guardian.js sha256 `072068d4…` 两侧一致，`--dump-config` 行正常）。
     依赖 pin 从 `github:free6589/dsh-grok-workflow` 变为带 tag 后缀
     `github:free6589/dsh-grok-workflow#v0.11.17`——后续 `main` 更新不再自动跟进，
     下次发版时再显式更新。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **63 文件 / 1154 测试 PASS**
  （`.rsi/evidence/round-018/release-ci.txt`）；`lib/` 构建幂等；
  D-074 状态已改为已发版。
- **未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听
  firing（操作体已 CONFIRMED）。
- **接手注意**：`settings-simple-mock.html` 仍是未跟踪草稿，**不入库**；
  P3-01 / P3-02 仍 OPEN；`src/index.ts:292` 注释仍 HYPOTHESIS 未动。
  `.tmp/r18` 已删；`.rsi/evidence/round-018/install/` 的 `20-run-install.sh` 是
  GitHub-tag 版 harness（round-17 的是 tarball 版），下次复用认准文件名相同但
  第一节不同。
- **Next action**：本轮已收口（提交见下）；P3-01/P3-02 或新主题按 PROTOCOL §2 选。

## 2026-11-19 — 常驻并行监护落地（未发版，未提交）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：监督从串行环节改为常驻并行监护，与主流程并存。
  新增 `src/guardian.ts`（`RunGuardian` 状态机：run 启动前创建、adopt 绑定 live run、
  只读 `workflow/agent-start/agent-end/end`、超时/心跳丢失任一即 firing、每 run 最多
  一次 `run.cancel()`、findings 以 `Guardian` 相追加进报告 errors 且不改 status、不调
  `agent()` hook、零模型调用）；`src/run.ts` 四处接线（创建/订阅/adopt/`finally` 折叠/
  `disposeActiveState` 经 `unloadRunGuardians` 清理）；`test/guardian.spec.ts` 12 条
  （状态机 3、stall 处理 5、卸载清理 4，含 run 级并行存在用例）。
  RESEARCH 写了 **A29**（实现位/状态源/判定/动作与上限），DECISIONS 新增 **D-074**，
  ARCHITECTURE 执行设计图 + Supervise 节 + Lifecycle 三处更新，README 中英各加一段
  + roles 表格行改说法，CHANGELOG `[Unreleased]` 加一条 Added（双语）。
  串行 supervisor（`src/script.ts`）**零改动**。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **63 文件 / 1154 测试 PASS**
  （基线 62/1142，+1 文件/+12 测试），lint 22 warnings / 0 errors（与基线一致），
  `npm run verify:lib` 在提交前仍报“145 文件、与基线一致”（新 `lib/guardian.*`
  尚未计入——提交后复核见 VALIDATION）。
  证据：`.rsi/evidence/round-018/`（`baseline-ci.txt`、`full-ci.txt`、`stuck-sim.mjs/txt`）。
- **验收对照**：①并行存在：run 级用例录下订阅快照（start/end 监听峰值 ≥3，progress/
  archiver/guardian 各一）+ `adopted children=1 open=1 timerArmed=true`；
  ②卡住模拟：`t+5999 findings=0` → `t+6000 findings=1 signal=heartbeat-loss
  action=cancel-run` → 126s 后仍 1 条、cancel 恰一次；
  ③卸载无残留：`finish` 释注册表、`unloadRunGuardians` 1→0、listeners 清空；
  ④原 supervisor 回归：`routing` 25 条 + `engine-contract` 15 条 PASS，script 未动；
  ⑤`npm run ci` exit 0（上）。
- **未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听
  firing（操作体已 CONFIRMED）。真机只跑了隔离 profile 的 gate 路径，无模型调用。
- **接手注意**：`settings-simple-mock.html` 仍是未跟踪草稿，**不入库**；
  P3-01 / P3-02 仍 OPEN；`src/index.ts:292` 注释仍 HYPOTHESIS 未动。
  **不要 `git add -A`**：`.rsi/evidence/round-018/` 与上述文件已按清单暂存，其余
  未跟踪文件（尤其 `settings-simple-mock.html`）不属于本轮。
- **Next action**：本轮提交 + push（命令见 VALIDATION 本轮段）；发版需操作者授权，
  下一版应为 patch（用户可见新增），把 `[Unreleased]` 的 Added 搬进新版本段。

## 2026-11-19 — RSI round 16：续跑开关与心跳刹车落地（未发版）

- **From:** 执行代理 agent-56（任务段 `segment 5/5`，收口轮）· **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：把工作树里那份未提交的实现（composer dock 开关 + `src/loop-brakes.ts`）
  核对、记录并**落地成一个提交**：`CHANGELOG.md` `[Unreleased]` 补两条 Added（双语）、
  `DECISIONS.md` 新增 **D-072** 并把 D-069「现状」段 / D-071 的过时一句指回它、`STATE.md` /
  `VALIDATION.md` / 本文件 / `.rsi/ROUND.md` / `.rsi/STATE.md` 记本轮；`src/`、`test/` 的代码内容
  没有在本轮改动（开工与收工指纹一致）。
- **门禁（`CONFIRMED`）**：`npm run typecheck` exit 0 · `npx oxlint src test` 22 warnings / 0 errors ·
  `npm run build` 后 `lib/` 145 文件 md5 清单与构建前完全相同（幂等）· `npx vitest run`
  **62 文件 / 1139 测试 PASS** · 提交后 `npm run verify:lib` 见 `.rsi/ROUND.md` Round 16 的 Landed as 段。
  日志在 `.rsi/evidence/segment-5/`。**落地（`CONFIRMED`）**：commit `e11d100`、`push origin main`
  （`37cb0fc..e11d100` 快进）、远端 CI run `44425357004` success（Node 22 + 24）、提交后
  `npm run verify:lib` = `145 files, byte-identical`。
- **未验证（`NOT_RUN`）**：真实 Web GUI 里点一次那个开关；真实心跳投递（D-066，操作者动作）。
  本轮没有启动 DSH 实例，也没有创建、修改或删除任何 Schedule 任务。
- **发版（`NOT_RUN`，需要操作者授权）**：本轮只提交到 `main`，**没有** bump 版本、没有打标签、
  没有建 Release、没有 npm 发布。开关是用户可见的新增，下一次发版应走 patch（`0.11.16`）并把
  `[Unreleased]` 两条搬进新版本段；`finish-round.py` 的流程对这份提交可直接快进使用。
- **接手注意**：`settings-simple-mock.html` 仍是未跟踪的草稿，**不入库**（round 15 的结论未变）；
  P3-01 / P3-02 仍 OPEN，是本轮之后仅剩的池内条目；`src/index.ts:292` 那句
  「an open loop survives a plugin reload and an unload deletes it」两半仍对不上（A27 §5 的
  `HYPOTHESIS`），改它要连 `lib/` 一起重建，留给下一次动 `src/index.ts` 的人。

## 2026-11-19 — 文档记忆回接：round 15 的记录被并发写入者按旧副本覆盖，`D-070` 撞号

- **From:** 执行代理 agent-41（任务段 `segment 1/5`）· **To:** 用户 / 下一轮接手者
- **现象（`CONFIRMED`）**：工作树里另一位写入者在 00:26–01:39 之间把 `STATE.md` / `HANDOFF.md` /
  `VALIDATION.md` / `.rsi/ROUND.md` / `.rsi/STATE.md` 按 round 14 的旧副本落回，等于删掉 round 15
  （`v0.11.15` 发布）的全部记录；`DECISIONS.md` 里新写的「预设缺口在续跑面之后怎么落」又占用了
  `D-070`，与 round 15 的发布事故条同号。当时的 `git diff --numstat`：`0/17`（`.rsi/ROUND.md`）、
  `1/48`（`STATE.md`）、`0/11`（`HANDOFF.md`）、`0/17`（`VALIDATION.md`）、`85/60`（`.rsi/STATE.md`）
  —— 四个纯删除加一个整篇回退，所以「复原」不会丢掉任何属于他人的新增内容。
- **处理（`CONFIRMED`）**：`git checkout HEAD -- docs/knowledge/STATE.md docs/knowledge/HANDOFF.md
  docs/knowledge/VALIDATION.md .rsi/ROUND.md .rsi/STATE.md` 把 round 15 记录放回原处；`DECISIONS.md`
  里恢复发布事故条为 `D-070`、把预设缺口条改为 **`D-071`**，并同步 `RESEARCH.md` A26 的那一处引用。
- **新增（`CONFIRMED`）**：`RESEARCH.md` 新增 **A27**，回答上一轮留空的 `host_loop_service` 判据
  （LoopService 不是服务注册；Schedule 靠 `ctx.get` 查、查不到走 503；工具与路由各自 `effect` 撤回；
  卸载 `await stopAll` 删光自己的行、会话停/归档删一行、删除数按 `catalog` 复核）；并在 A24 §5b
  加了一句时态更正——「客户端没有控件」只对已落地的 `v0.11.15` 成立，工作树里有一份未提交的实现。
- **验证（`CONFIRMED`）**：`npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts
  test/docs-architecture-version.spec.ts` → **3 files / 23 tests passed**（本轮未改 `src/`、`test/`、`lib/`）。
- **树状态（`CONFIRMED`，重要）**：并入时另一位写入者仍在跑（`lib/loop-brakes.js` 生成于 07:35）。
  **不要** `git add -A`：`src/loop-brakes.ts`、`test/loop-brakes.spec.ts`、`src/client/index.js` 的
  composer 开关、`settings-simple-mock.html` 都还没有人审阅。文档若再次被「按旧副本重建」，先跑
  `git diff --numstat -- docs .rsi` 看是不是纯删除，再决定复原还是接受。
- **Next action**：与 round 15 的交接一致（P3-01 / P3-02，或客户端开关那一轮）；文档侧没有新待办。
  `src/index.ts:292` 那句「an open loop survives a plugin reload and an unload deletes it」两半对不上，
  读者先看 A27 §5 —— 它是注释措辞缺陷，改它得连 `lib/` 一起重建，留给拥有 `src/` 的那一轮。

## 2026-11-19 — RSI round 15：`v0.11.14` 发布事故收口，`0.11.15` 是第一个真正带续跑面的发布

- **From:** 执行代理 agent-29（任务 `docs_release_memory`，attempt 2）· **To:** 用户 / 下一轮接手者
- **为什么有这一轮（`CONFIRMED`）**：round 14 的 `v0.11.14` 只推了标签；Release 工作流在
  `Verify committed build artifacts` 失败（run `44345622700`），标签提交 `20eafea` 的 `lib/loop.js`
  是更早的 `src/loop.ts` 构建的（`grep -c callSchedule`：src 12 / lib 0），所以**该标签没有 GitHub
  Release**，也没有任何压缩包发布。`8c8e367` 修好了 `main`，但修不了已发布的标签。
- **本轮做法（`CONFIRMED`）**：在独立克隆 `.worktrees/release-015`（基线 `b0d6d10`）里按 R6 走
  `finish-round.py` 打 `0.11.15`（patch）。**没有移动/删除/重打任何旧标签，没有 force-push，没有 npm
  发布**；`v0.11.14` 原地保留，并在两份 README 与 CHANGELOG 里写明它不是发布版本、安装请固定 `v0.11.15`。
- **内容（`CONFIRMED`）**：构建产物重建（`src/`、`test/` 零改动，`lib/` 与源码一致性由发布工作流自己的
  `git diff --exit-code -- lib/` 验证）+ README 测试数更正（`1022 / 57` → `1081 / 60`）+ 安装区一句
  「不要固定 `v0.11.14`」+ `D-070`（四个备选与授权范围）+ 本轮记录。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = 60 文件 / 1081 测试 PASS、lint `22 warnings / 0 errors`
  （`.rsi/evidence/round-015/pre-release-ci.txt`；发布脚本那次是 `ci.txt`），ROUND.md Round 15。
- **树状态（`CONFIRMED`，重要）**：主工作树在 round 15 期间仍有另一位写入者的未提交工作
  （`src/client/index.js` 的设置页开关、`src/loop-brakes.ts`、`scripts/verify-lib.mjs`、`src/config.ts`、
  `src/gate.ts`、`test/*.spec.ts` 等，21 tracked + 6 untracked）。**这些没有进 `0.11.15`**，也未经本轮
  审阅；接手者先跑 `npm run ci` 再决定它们属于哪一轮（其中 `verify:lib` 把 `npm run ci` 改成先导出
  `HEAD` 再重建比较，是一个独立主题）。
- **Next action**：P3-01（设置页逐路由上限与死线字段的文案）或 P3-02（进度页「没有报告事实的成员」详情行）；
  另一条候选是 D-069「现状」里的客户端开关——那正是上面仍未提交的那份工作。
- **落地（`CONFIRMED`）**：commit `50c0321`、annotated tag `v0.11.15`（object `e52a8f4`，peel
  `50c0321`）、`origin/main` = `50c0321`；远端 CI run `44359410024` = success，Release run
  `44359422843` = success（16 步全绿），Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.11.15 带
  `dsh-grok-workflow-0.11.15.tgz`（523743 B）并标为 Latest；`verify:lib` 在 `50c0321` 上报
  `141 files, byte-identical`。旧标签未动（`v0.11.14` object `2a7b074` / peel `20eafea`）。
- **一次并发代价（`CONFIRMED`）**：本轮运行期间另一位 agent 把 `3c24f92`（`verify:lib` 门禁）与
  `09d5daa`（证据）推上 `main`，所以第一次 `push origin main` 被拒（非快进）。发布提交 rebase
  （`e46a302` → `50c0321`），**从未推送过**的本地标签删除后在 rebase 提交上重建，再推。
  同一时刻主工作树的本地 `main` 上还有一个未推送的记录提交 `65bbd87`（工作树门禁 61/1131）；
  接手者先 `git pull --rebase` 再提交。本轮只动文档与记录，冲突面在 `DECISIONS.md` / `CHANGELOG.md`。

## 2026-11-18 — RSI round 14 落地并发布 `0.11.14`：续跑（loop）面 + 双语文档 + D-068/D-069

- **From:** 执行代理 agent-8（任务 `docs_release_memory`）· **To:** 用户 / 下一轮接手者
- **交付（`CONFIRMED`）**：round 14 把「四个 `loop*` 键存着没人读」这件事收口——
  `src/loop.ts`（服务：策略、规则、行选择、清理）、`src/loop-surface.ts`（`grok_loop` 工具 +
  `POST /grok-workflow/loop` 路由 + 卸载/归档清理）、`src/config.ts`（四个键进 `CONFIG_KEYS`、
  `HARD_LIMITS`/`LIMIT_CAPS`、载入期 repair）、`src/client/index.js`（设置页「续跑」一组四字段）；
  测试 `test/loop.spec.ts` 27、`test/loop-surface.spec.ts` 14、`test/heartbeat-guard.spec.ts` 14。
- **语义（写给下一位，别凭直觉改）**：一条循环 = Schedule 里一条 `rrule` 任务，插件不持 timer；
  `open` 只能由不带 actor 的浏览器请求发起（工具 `open` 抛 `loop/user-only`）；轮数上限写进 `COUNT`
  是硬止损；连败轮数只是文案（回执只证明收件箱写入）；关闭/卸载/停止/归档一律**删行**不暂停。
  细节与备选见 `DECISIONS.md` D-069。
- **顺序授权**：本轮按操作者授权先落 P4 续跑面，**P3-01/P3-02 仍 OPEN 且编号不变**（`D-068`）。
  授权只覆盖顺序；CI/证据/双语 CHANGELOG/不移动标签这些门一条没放宽。
- **文档**：README 中英各一节「Repeat runs / 自动接着跑」（开关、参数、心跳行为、停的语义）+
  已知限制一条；表里 `loopEnabled` 一行原来说「由输入框旁的开关打开和关闭」，而客户端**没有任何代码
  调那条路由**（`grep -rn "grok-workflow/loop" src/` 只有 `src/loop.ts:56` 一处常量），已改成可核对的
  说法；`CHANGELOG.md` `## [0.11.14] - 2026-11-18` 双语。
- **通过的门（`CONFIRMED`）**：`npm run typecheck` exit 0；`npm run ci` exit 0 =
  lint `Found 22 warnings and 0 errors`、**60 文件 / 1081 测试 PASS**
  （`.rsi/evidence/round-014/ci.txt`，发布脚本那次；文档侧先跑的 `pre-release-ci.txt` 是 60/1080，
  两者差 1 条路由用例）。上一轮 57/1022 → 本轮 +3 文件 / +59 测试，无删除、无 skip。
- **未做（`NOT_RUN`）**：真机心跳投递（没有创建/修改/删除任何定时任务，D-066 规定第一条心跳是操作者
  动作）；在活的 Web GUI 里点一个真正会 POST 那条路由的控件——**客户端还没有这个控件**，今天的用户
  可达路径就是那条 HTTP 请求。
- **发版（`CONFIRMED`）**：`0.11.14`（patch）——`package.json`/`package-lock.json`/两份 README 的版本句、
  安装 pin、已发布列表/`docs/LOCAL-TESTING.md` 压缩包名同步；commit `20eafea` + annotated tag
  `v0.11.14`（object `2a7b074`，peel `20eafea`），`origin/main` = `20eafea`，`git ls-remote --tags
  origin` 与本地同集合（40 个标签），旧标签逐个未动，无 force-push，未发布 npm。
- **树状态提醒（`CONFIRMED`，不是本轮产物）**：本提交之后，同一棵工作树里另一个进程继续改了
  `src/loop.ts`、`src/loop-surface.ts`、`test/loop-surface.spec.ts`（路由 `413`「body 过大」与
  `409`「Schedule 拒绝」两个用例）。这些改动**不在** `20eafea` 里，本轮特意**没有**把它们塞进发布
  提交（未验证的他人半成品不配 tag）；接手者应先跑全量 `npm run ci` 再决定它们属于哪一轮。
- **发布事故（`CONFIRMED`，必须读）**：`v0.11.14` 的标签提交 `20eafea` 远端 CI **红**
  （run `44345615218`），Release 工作流在 `Verify committed build artifacts` 一步**失败**
  （run `44345622700`），所以**该标签没有 GitHub Release**（`gh release view v0.11.14` →
  release not found）。根因：同一棵树里另一个进程在 `npm test` 与 `git add` 之间改了 `src/loop.ts`，
  提交里的 `lib/` 是上一次构建（`git show 20eafea:src/loop.ts | grep -c callSchedule` = 12，
  `…:lib/loop.js` = 0）。**已修复在 main**：`8c8e367 fix(build): rebuild lib/loop.js …`（纯构建产物，
  独立 worktree 里重建，fast-forward 推送），远端 CI 转绿（run `44349708692`）。
  **没有**移动/删除/重打标签——已发布标签不可变；`workflow_dispatch` 会 checkout 同一个不可变提交，
  重跑只会在同一步再失败。补救方式是从 `main` 打下一个 patch 版本（新建 Release 需明确授权）。
- **一处待补的验证（`CONFIRMED`）**：`20eafea` 的 `src/loop.ts` 已含 `loop/schedule-refused` 映射，
  但 413/409 两条路由用例没进那次提交（`git show 20eafea:test/loop-surface.spec.ts | grep -cE
  "413|409|schedule-refused"` = 0）。它们与另外几处 `src/` 改动在本轮结束时仍在工作树里，未提交。
- **Next action（下一轮）**：按 `PROTOCOL` §2 的默认顺序取 P3-01（设置页逐路由上限与死线字段的文案）
  或 P3-02（进度页「没有报告事实的成员」详情行）；另一条独立候选是「给客户端加一个真正会 POST
  `/grok-workflow/loop` 的控件」——那是 `src/` 改动，需要自己的测试与单独一轮主题（D-069）。

## 2026-11-18 — 心跳 prompt 与守护逻辑落地（未开新一轮，未建定时任务）

- **From:** 执行代理 agent-6（工作流子任务）· **To:** 用户 / round 14 的接手者
- **交付（`CONFIRMED`）**：`.rsi/HEARTBEAT.md`（定时任务投递的那条 prompt 模板 + 守护契约）、
  `.rsi/tools/heartbeat-guard.sh`（`RESUME`/`SKIP`/`STOP` 三判定）、
  `test/heartbeat-guard.spec.ts`（14 条，临时 fixture 内起真 git 仓，逐条钉住优先级）。
  `npx vitest run test/heartbeat-guard.spec.ts` = 14 passed（`.rsi/evidence/heartbeat-guard/spec.txt`）；
  `npx oxlint test/heartbeat-guard.spec.ts` = 0 warnings / 0 errors。
- **判定实测（`CONFIRMED`）**：在本仓跑 `.rsi/tools/heartbeat-guard.sh` →
  `SKIP code=dirty-tracked next_round=14`（round 14 在飞，33 个 tracked 改动）；
  `--max-rounds 13` → `STOP code=round-cap`。证据 `.rsi/evidence/heartbeat-guard/repo-now.txt`。
- **为什么摘要写在 prompt 里**：心跳消息 `source.kind = "schedule"`，`src/gate.ts:471-477` 直通，
  `carryover` 不覆盖该轮（A24 §4），所以 `--prompt` 自己从 STATE/ledger/HANDOFF/ROUND 拼摘要并注入
  模板占位符；拼 prompt 是纯读，只有带 `--record` 的运行才写一行日志（`*.log` 已 gitignore）。
- **未做（`NOT_RUN`）**：没有创建/修改/删除任何定时任务（D-066：第一条心跳是操作者动作）；真机投递
  未跑；没有改 `src/`、没有开新一轮、没有动 `lib/`。
- **当前树状态提醒（`CONFIRMED`，非本任务产物）**：`test/loop.spec.ts`（untracked，23:26 由并行
  round-14 工作创建）让 `npm run typecheck` 红在 `test/loop.spec.ts(519,13): TS2304 "snapshotConfig"`。
  该文件不由本任务写入；round 14 收尾时必须先修它，否则 `finish-round.py` 的 CI 会 REFUSED。
- **Next action（round 14 的接手者）**：先修 `test/loop.spec.ts` 的 `snapshotConfig` 引用，跑
  `npm run ci`；闭合后心跳守卫会自动从 `SKIP` 回到 `RESUME`（判据只看 tracked 改动与记录一致性）。

## 2026-11-18 — RSI 连续循环：round 11 = P2-01 客户端 i18n 键齐全性（审计无缺陷，补守卫）

- **From:** RSI 执行代理（agent-37）· **To:** 用户 / 后续接手代理
- **审计（`CONFIRMED`）**：bundle 有两本词典——插件 `DICT`（`src/client/index.js:409`）与
  `PANEL_DICT`（`:1445`，`:3624` 以独立命名空间注册）；面板调用点拿到的是绑定 `PANEL_DICT` 的
  translator（`:1556`），所以它们的键只在面板表里是**正确**的。插件每语言 137 键、面板 19 键，
  两表各自语言对称，字面/拼接/动态键全部在消费它的表里可解析——**没有现成缺陷**。
- **交付（`CONFIRMED`）**：`test/i18n-parity.spec.ts`（6 条），按作用域断言；插件表缺失的键必须
  正好是那六个面板作用域键，所以「键换表」会红而不是被放行。用变异重放证明它会失败：删掉一个
  `zh` 键 → `2 failed | 4 passed`（`.rsi/evidence/round-011/red.txt`），随即还原，
  `npm run ci` = **56 文件 / 1015 测试**。
- **循环状态**：P1、P2 待办已清零；`.rsi/STOP` 不存在。下一轮从 P3-01（设置页每路由上限与
  deadline 字段文案）或 POOL 里的 `P ·` 调用点条目里挑一个（`records.ts` 裸 `error.message`、
  `history.ts` 先截断后脱敏、base64-PEM 规则）。

## 2026-11-18 — RSI 连续循环：round 10 = P1-02 ARCHITECTURE 版本状态锚定（已修）

- **From:** RSI 执行代理（agent-37）· **To:** 用户 / 后续接手代理
- **审计结论（`CONFIRMED`）**：POOL 里 P1-02 的字面措辞（「current version」）在
  `docs/ARCHITECTURE.md` 里已不存在，但同类缺陷仍在——四处 `in this release` 无法落到具体版本，
  且 `resume` 边界只写 DSH `0.2.1-rc.2`，而 round 8 已在 `0.2.2-rc.3` 上复查过安装/激活/设置面。
- **修复（`CONFIRMED`）**：`since **0.8.0**` / `as of **0.11.9**` 锚定，两处「无生产调用方」已核实
  （`grep -rn "resume/" src` 只有注释，`src/run.ts:21` import 的是 checkpoint）；边界行把「实测版本」
  与「只做复查的版本」分开写，并明写没有重测 journaling 边界。
- **守卫（`CONFIRMED`）**：`test/docs-architecture-version.spec.ts` 3 条；用上一版文档重放为红
  （2 failed / 1 passed，`.rsi/evidence/round-010/red.txt`），`npm run ci` = **55 文件 / 1009 测试**。
- **循环状态**：rounds 9–10 连做；`.rsi/STOP` 不存在，P1/P2 待办未清零。下一轮 P2-01
  （设置页 i18n 键齐全性守卫），然后 P3-01/P3-02 与 POOL 的 P 级条目。

## 2026-11-18 — RSI 连续循环：round 9 = P0-02 进度页「事件中没有报告」（已修）

- **From:** RSI 执行代理（agent-37）· **To:** 用户 / 后续接手代理
- **缺陷（`CONFIRMED`）**：`src/script.ts:1852+` 把 worker/verifier 的 `phase` 写成
  `任务 n · 标题`，面板只按 `phase` 匹配阶段 → `执行`/`检查` 永远分不到行，渲染成
  `progress.notReported`。这正是此前 `docs/knowledge/STATE.md` 记录的已知缺口（P0-02）。
- **修复（`CONFIRMED`）**：第二条绑定通道（role label → 阶段 `evidence` 交叉引用），
  `members` 仍是每行唯一的家，状态自有行优先；TS 与浏览器镜像同步，两语言 meta 行更新。
  先红后绿：`.rsi/evidence/round-009/red-ts.txt`（5 failed / 29 passed）→ `green.txt`
  （112 passed）；全量 `npm run ci` exit 0，**54 文件 / 1006 测试**。
- **STOP 记录缺口已补（`CONFIRMED`）**：新增 `.rsi/tools/stop-probe.sh`，每轮把
  `test -e .rsi/STOP` 的判定写进 `.rsi/evidence/stop-probes.txt` 并在 `.rsi/LOG.md` 的 STOP
  小节留行。rounds 5–8 只有散文没有证据，历史不追改。
- **循环状态**：round 9 是继续推进的第一轮（上一轮把四个交办主题做完就停了，待办并未清零）。
  剩余待办按 POOL 优先级：P1-02（`docs/ARCHITECTURE.md` 把版本写成「current」而非「since」）、
  P2-01（设置页 i18n 键齐全性守卫）、P3-01/P3-02，以及 POOL 里带 `P ·` 前缀的条目
  （`records.ts` 裸 `error.message`、`history.ts` 先截断后脱敏、base64-PEM 规则）。
- **接手注意**：`.rsi/STOP` 当前不存在；若操作者要暂停循环，创建该文件即可，下一轮开始就会看到。

## 2026-11-18 — RSI 连续循环：round 8 = 真机 disposition（激活 PASS / 真模型 BLOCKED）

- **From:** RSI 执行代理（agent-34）· **To:** 用户 / 后续接手代理
- **已证（`CONFIRMED`）**：DSH `0.2.2-rc.3` 上，本检出装入真实 `grok-workflow-dev`（`link:` 依赖），
  `workflow-ptc` 启用后实例启动干净（无 `pending`/`did not activate`），设置投影含
  `grok-workflow`（`autoGenerate: true`）。命令与输出见 `.rsi/evidence/round-008/activation.txt`
  与 `settings-describe.txt`。
- **未证（`BLOCKED`）**：经 `grok_workflow` 的真模型消息——孤立 profile 无凭据，
  `MISSING_CREDENTIAL: … "deepseek-official"`。要补这一条，需操作者在自己可用的 profile 里跑
  `docs/LOCAL-TESTING.md` 的 Real-model smoke，并把结果写进 VALIDATION；**不要**把别的 profile 的
  密钥拷进本仓库或证据目录。
- **清理**：本轮启动的实例都已停止（3199/3201/3203/3205/3207/3209/3211/3213 无监听），带 token 的
  启动日志已就地脱敏；`.dsh-home/` 与 `.tmp/` 均 gitignore。
- **循环状态**：本次会话交办的四个主题（P2-02 → P1-03 → tag 审计 → 真机）已全部完成并各自
  提交/打 tag/push；下一轮应从 `.rsi/POOL.md` 的 P0-02（Progress 页 Execute/Verify 行）开始。

## 2026-11-18 — RSI 连续循环：round 7 = 远端标签清单对账（`CONFIRMED`）

- **From:** RSI 执行代理（agent-34）· **To:** 用户 / 后续接手代理
- **结论（`CONFIRMED`）**：32 个远端标签与本地对象 32/32 相同（无标签被移动），全部 peeled
  提交是 `main` 祖先；两份 README 已发布列表完整（0 缺 0 多）、升序、末项 = 当前发布；
  `HEAD == origin/main`。31 个标签与 `package.json` 一致；唯一例外 `v0.2.0-rc.1`（早于发布
  流程，提交里 `package.json` 仍是 `0.1.0`），不移动，改为在两份 README 写明 + 1 个守卫 `it`。
- **证据**：`.rsi/evidence/round-007/`（`remote-tags.txt` / `audit.txt` /
  `local-vs-remote-objects.txt` / `ci.txt`，54 文件 / 999 测试）。
- **版本（`CONFIRMED`）**：`0.11.7`，`CHANGELOG` 插入 `## [0.11.7]` 双语节。
- **下一主题**：`grok-workflow-dev` 真机 disposition —— 要么用真实 Loader 起一次并保存 PASS
  日志，要么明确记 `NOT_RUN`/`BLOCKED` 及具体原因（不得把没跑过的运行标成 pass）。

## 2026-11-18 — RSI 连续循环：round 6 = P1-03 LOCAL-TESTING 对账（`CONFIRMED`）

- **From:** RSI 执行代理（agent-34）· **To:** 用户 / 后续接手代理
- **对账结论（`CONFIRMED`）**：九个键与全部固化上限、默认死线都与 `src/config.ts` 一致；
  不符的是四处安装示例的压缩包名（`0.2.0`/`0.2.1`）、一条引用代码从不输出的排障消息、
  以及中文 README 的固化上限写法。三处已修，中文写法与英文统一为 `key=value`。
- **机制（`CONFIRMED`）**：`.rsi/tools/bump-version.py` 升版本时同步改写
  `docs/LOCAL-TESTING.md` 的压缩包名；`test/docs-config-keys.spec.ts` 7 → 12 个 `it`
  从常量读数，不抄数字。证据 `.rsi/evidence/round-006/`（red 2 failed → green 12/12 →
  ci 54 文件 / 998 测试）。
- **版本（`CONFIRMED`）**：`0.11.6`（`package.json` + `package-lock.json` 联动），
  `CHANGELOG` 插入 `## [0.11.6]` 双语节。
- **接手提示**：下一主题是远端 tag 清单审计（README 已发布列表 vs `git ls-remote --tags`
  vs 每个 tag 的 `package.json` 版本），再之后是 `grok-workflow-dev` 真机 disposition。

## 2026-11-18 — RSI 连续循环：round 5 = P2-02 脱敏形状（`CONFIRMED`）

- **From:** RSI 执行代理（agent-34）· **To:** 用户 / 后续接手代理
- **已完成（`CONFIRMED`）**：`src/redact.ts` 补齐引号内 `Cookie:` 头、`X-Amz-Signature` /
  `X-Goog-Signature` / `?auth=` 签名参数、PGP armor、`SECRET_KEY`/`PRIVATE_TOKEN` 短值；修掉
  `const token = await refreshToken()` / `if (password == null)` 被改写与占位符二次脱敏；
  env 值改为止于 token 边界。证据 `.rsi/evidence/round-005/`（red 6 failed → green 32/32 → ci 54 文件 / 993 测试）。
- **版本（`CONFIRMED`）**：`0.11.5`（`package.json` + `package-lock.json` 联动），`CHANGELOG`
  插入 `## [0.11.5]` 双语节，README 中英安全段的脱敏清单与 `docs/ARCHITECTURE.md` 新增
  「Credential redaction」一节。
- **接手提示**：池里紧邻的两项是 P1-02（`docs/ARCHITECTURE.md` 里以版本号当「当前」的段状态）
  与 P0-02（Progress 页 Execute/Verify 成员不渲染）。P0-02 风险中/工作量中，动手前先用
  `.rsi/POOL.md` 的 anchors 复核。
- **未做（`NOT_RUN`）**：base64 包裹 PEM 的规则；live `grok-workflow-dev` 消息实测（本轮改动不触运行路径）。
- **可信边界**：`.rsi/STATE.md` 是本轮的权威状态；本文件只记对外可复核的结论。

## 2026-11-15 — v0.9.1 已发布（存量越界钳制；用户 WebUI 启用失败的修复，`CONFIRMED`）

- **From:** lead · **To:** 用户 / 后续代理
- **现象（`CONFIRMED`，用户截图）**：WebUI 添加 `github:free6589/dsh-grok-workflow` 成功，启用时
  `1 entry did not activate / ValidationError: $.maxConcurrency expected number <= 6 but got 8`。
  用户存量 `cordis.patch.yml` 写 `maxConcurrency: 8 / maxRetries: 5`（v0.9.0 之前合法），v0.9.0 的 B07
  恢复硬上限 6/3 后整行起不来，且没有设置页可修（D-031 死锁）。
- **修复（`CONFIRMED`）**：宿主 `Config` schema 对越界存量钳制到上限 + 每项一条中英告警
  （`repairLimitOverruns` + `clampedLimit`；`apply()` 串在 `repairSynthesisInconsistency` 之后）；
  低于下限/非数字/程序化 `resolveConfig` 越界仍硬拒绝（R-06）；上限 6/3 未放宽。
  证据：`test/config-limits-repair.spec.ts`（17 例）；隔离 profile `gwverify851` 用 8/5 patch 真激活
  （仅停在 `MISSING_CREDENTIAL`）；对照 `0` 仍以用户截图同帧拒绝。
- **发布（`CONFIRMED`）**：`9103280`（`release: prepare v0.9.1`）→ `git push origin main` →
  CI `43665777667` success → tag `v0.9.1`（`584dc22` → peel `9103280`，已 push；旧 tag 未动）→
  Release `43666035740` success，Release `v0.9.1` + asset `dsh-grok-workflow-0.9.1.tgz`。
  协调状态已发 `Issue #1 comment 6887721733`。
- **Next action（用户，一步）**：WebUI 插件页把 `dsh-grok-workflow` 更新到 `v0.9.1`（或重装
  `github:free6589/dsh-grok-workflow`），再点启用：行应激活，日志里有两条钳制告警；之后去设置页把
  `8/5` 改成 `6/3` 以内，告警即消失。不用改 patch 里的其它值。

## 2026-11-08 — v0.7.0 已发布（tag → `main` `146dce7`）；live `:3090` 一步重启即收口（`CONFIRMED`）

- **From:** lead · **To:** 用户 / 后续代理
- **已发布（`CONFIRMED`）**：`v0.7.0` → `146dce7`（`main`）；GitHub Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.7.0 ，
  asset `dsh-grok-workflow-0.7.0.tgz` **317,470 B**；Release workflow `42474831253` 绿，
  main 的 CI `42474712526` 绿。tag 不得移动。
- **合并事实**：`origin/main` 的 PR #44 与本分支在 `src/run.ts` 启动段冲突；口径为「保留 main 的
  startup deadline race + 两条入口都走 `teamWorkflowEngine`」。`lib/` 由 `npm run build` 重新生成，
  无手改。合并后 37 文件 / 660 测试 PASS。
- **Next action（用户，一步，`NOT_RUN`）**：重启 `:3090` 才加载新代码。装法二选一：
  ①`dsh plugin --profile web add https://github.com/free6589/dsh-grok-workflow/releases/download/v0.7.0/dsh-grok-workflow-0.7.0.tgz`
  ②本机已打好 `out/dsh-grok-workflow-0.7.0.tgz`（由 `146dce7` 打包，与本 tag 同内容）；
  然后 `DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`。
  重启后应看到：设置页出现「机器台账」开关（默认关）；`/grok on` 跑一次以 `【人话结论】` 开头且无
  `Model routes:` 行；`Model routes`（打开开关后看）里出现 `wb/cn:deepseek-v4.1-flash` 即证明
  Round 35 的「保存即生效」也一起修好了。
- **未做（`NOT_RUN`）**：live 安装副本与本机 `:3090` 均未由代理改动（沙箱对
  `/home/fish/dsh-layerfs` 只读，见 Round 36 尾注）。

## 2026-11-08 — B 方案：`/grok on` 也说人话、机器台账可按需打开（`61c3ac9`，`CONFIRMED`）

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `61c3ac9`（本仓库 `release/0.6.0`）
- **用户诉求**：`session-00fca25f…` 明明是 `COMPLETED`，但回复通篇是
  `Grok workflow:` / `Confirmed evidence:` / `Model routes:` / `Deadline:` / `Route switches:`，
  用户原话「在我眼里不像人话」。用户明确选择方案 **B（改代码）**，否决了「别开团队」这类用法建议。
- **本轮交付：**
  - `src/gate.ts` `runTeam` → `completed`/`partial` 拼 `【人话结论】任务 N/M 项已核验通过。…`
    ＋汇总首句（`detectLanguage(request)` 定中英）；`failed` 不拼，失败不套成功口吻。
  - `src/answer.ts` → `SUCCESS_PREAMBLE` 允许「先 ≤3 句人话，再原样贴 markers 内全文」；
    `FAILURE_PREAMBLE` 与 markers 结构不变。
  - `src/report.ts` → `renderReport(report, { showDiagnostics })`；新配置 `showDiagnostics`
    默认 **off**，控制 `Model routes` / `Deadline` / `Route switches` / `Route overflows` / `Errors`。
    **`Uncertainties` 有意留在开关外**（carry-over 要从上一轮文本解析它，藏掉会丢追问上下文）。
  - `src/index.ts` 工具 `render` 渲染时读实时开关；`src/client/index.js` 设置页新增中英双语
    「机器台账 / Machine diagnostics」开关。
  - 测试：`test/gate.spec.ts` +3、`test/report.spec.ts` +1 默认视图钉住；volatile 字段数 27→28。
    `npx vitest run` → **37 文件 / 655 测试 PASS**；`tsc --noEmit` 0 错误；lint 4 warnings/0 errors。
- **过程事实（不掩盖）**：执行子代理 `impl-b` 中途失联，改动先落 stash `temp-gate-fix`；
  其自身提交 `ef29e9b` 把 humanSummary 段当「无关 hunk」删掉，本轮在 `61c3ac9` 重新加回并钉测。
- **Next action（用户，一步收口，`NOT_RUN`）**：重启 `:3090` 才加载新模块（D-013 步骤 5，
  `DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`）。
  重启后：设置页应出现「机器台账」开关（默认关）；`/grok on` 跑一次应看到 `【人话结论】` 开头，
  且不再出现 `Model routes:` 等台账行（除非手动打开）。

## 2026-11-08 — 设置保存不生效：已定位并修复（网关把开机快照传给 run）；live 需重启才加载新模块

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `5b0e3df`（本仓库 `release/0.6.0`）
- **用户现象**：设置页把 `roles.worker` 第一名存成 `wb/cn:deepseek-v4.1-flash`（revision 21、
  无红字、补丁文件该行正确），新会话的子代理却仍点 `global` → `global-sg` → `autoclaw`，
  规划子代理用 `mimo`（补丁里是 muse-spark）。
- **根因（`CONFIRMED`，源码级）**：`src/gate.ts` `installGate()` 解构的是**开机**`deps.config`；
  `safe()` 只喂分类/历史/排队，而 `runTeam()` 的 `runWorkflow` 与两处 `runSingleCall`
  传的都是开机快照 → 保存只影响准入，永远到不了子代理。工具入口传的是 `config: live`，
  两个入口行为不一致。
- **修复**：三处改 `config: limits`；回归用例 + 负向对照（无修复时
  `expected 'old-model' to be 'wb/cn:deepseek-v4.1-flash'`）；`npx vitest run` 37 文件 / 651 PASS。
- **部署状态（关键）**：修复构建已写入 live web profile 安装副本
  `…/profiles/web/node_modules/dsh-grok-workflow/lib/gate.js`（原文件已备份）。
  **但 loader 用无 cache-bust 的动态 `import()`（`cordis-plugin-loader/lib/index.js:214`），
  运行中的 `:3090` 仍持有旧模块** → 必须重启该实例（或任何能重新 import 该模块的等价操作）
  才会加载新代码。**禁止**在没有用户授权时重启 live（D-013 步骤 5）。
- **Next action（用户）**：授权重启 `:3090`（`DSH_HOME=/home/fish/dsh-layerfs dsh web
  --host 100.111.111.88 --port 3090 --no-open`）后，设置页保存的 `cn` 链路即对下一条消息生效。

# Agent Handoff

## 2026-11-08 — 子代理顶栏显示名：live `:3090` 持久面板数据实锤——本轮自己的子代理在 live 上显示为「任务团队 child 28」；用户一步部署即收口（fix_child_names 第 5 轮，零源码改动，`CONFIRMED`）

- **From:** 执行子代理（fix_child_names，orchestrator attempt 5）· **To:** lead / 用户 ·
  **Base:** `91cad68`（本地 `release/0.6.0` HEAD，与 origin 同步，未变）
- **本轮新实锤（全部只读；摘录
  `evidence/childname-fix-2026-11-08/live-descriptor-labels-2026-11-08.txt`，记录
  `VALIDATION.md` Round 33）：**
  - live 顶栏此刻正把**当前 orchestrator run 的子代理**显示成泛化名：最新 14 个子会话
    首 `subagent/descriptor` label 全部为 `任务团队 child 15`…`任务团队 child 28`
    （含 attempt 5 自己的执行子代理 `88e59d33…` = child 28，04:13），0 个描述性标签；
    面板→descriptor 映射已在 Round 32 真 GUI 逐字验证，即 live 面板实际渲染内容。
  - 修复构建在 live home **全域缺席**：`find /home/fish/dsh-layerfs -name team-engine.js`
    → 0。
  - 认证边界复测：`127.0.0.1:3090` / `localhost:3090` / `100.111.111.88:3090` 均 HTTP 401
    （无 loopback 豁免）→ 浏览器级 live 观察对任何代理会话不可行（AGENTS.md 禁读凭据）。
  - 分支告警：默认分支 `main` @ `1f9065d` 不含 `ad66118` → live profile 的 `github:`
    依赖 + `pnpm update` **取不到修复**；必须显式安装 `ad66118` 构建。
- **结论**：验收条款 4 特指 `http://100.111.111.88:3090` 合取的未达 = live 部署状态问题，
  不是验证缺口；本机 GUI 验证 PASS（Round 31/32，同一 `dsh` 二进制 0.2.1-rc.2，真浏览器 +
  6 子代理团队档，顶栏 6/6 描述性、0 泛化）。
- **Next action（用户/lead，一步收口）**：把 `ad66118` 构建装入 live `web` profile（上一节
  步骤：备份 patch → `dsh plugin add` 新路径 tarball → 核对 `dsh.profile.bundles` 三项 →
  `workflow-ptc` enabled），**不要**用 `pnpm update`（main 上没有修复），然后按 D-013 步骤 5
  重启 `:3090`（`DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090
  --no-open`）。之后任意团队档工作流的顶栏即显示描述性子代理名。插件 toggle 重载语义未验证
  （`NOT_RUN`）——重启是保证生效的重载方式。
- **本轮其他**：`npm run ci` @ `91cad68` → 37 文件 / 650 测试 PASS；[COORDINATION] 状态块
  按协议发布到 Issue #1（更正上一节「Issue 无该状态块」的过时记录：attempt 4 的块已存在）。
- **最终轮复验（attempt 6/6，2026-11-08 04:24–04:32，零源码改动）：结果零变化。** `npm run ci`
  @ `b2bf3a8` → 37 文件 / 650 测试 PASS；live 最新 8 个子会话 label 仍为
  `任务团队 child 25–32`（attempt 6 自己的子会话 30/31/32 经任务标记确证在列，0 描述性）；
  `origin/main` 已前进至 `3b1d9a8`（并发任务 PR #44）但仍不含 `ad66118` → 上面的显式安装
  指引与「不要 pnpm update」告警依旧有效；日后把 `release/0.6.0` 合回 `main` 时，
  `src/run.ts` 与 PR #44 双侧都改过，可能需手工调和。记录：VALIDATION Round 34、证据
  `evidence/childname-fix-2026-11-08/live-descriptor-labels-2026-11-08-r34.txt`。

## 2026-11-08 — 子代理顶栏显示名：GUI 浏览器验证 PASS（fix_child_names 验证轮，零源码改动，`CONFIRMED`，`release/0.6.0` @ `ad66118`）

- **From:** 执行子代理（fix_child_names，orchestrator attempt 4 · GUI 验证轮）· **To:** lead / 用户 ·
  **Base:** `ad66118`（本地 `release/0.6.0` HEAD，与 origin 同步，未变）
- **本轮只做验证，不改代码。** Round 31 的修复（twin 引擎 + 提示词首行）此前已过 `npm run ci`
  （37 文件 / 650 测试 PASS）与 headless 真机验证，但「GUI 顶栏实际渲染」未观察——本轮补上：
  隔离 Web 实例（home `out/gui-verify/home/`，profile `guiweb` 从 web 模板创建，插件 dev 安装
  `file:` 链接工作树构建、安装后 `lib/team-engine.js` md5 一致，`workflow-ptc` patch 启用，
  v4-pro + agnes flash，实例 `127.0.0.1:3199`，一次性 token 只走环境变量、不落任何文件、用后即杀）
  + headless Chromium（playwright-core + `chromium_headless_shell-1248`，1440×900）。
  ①真实 composer 键入团队档双计算任务 → `Grok workflow: COMPLETED`（6 子代理，含真实 agnes
  format-error 路由切换重试）；②展开库存 `Session hierarchy` 顶栏面板 → **6 个子代理主标签全部
  描述性**（`规划助手` / 任务标题 / `检查 · 任务标题`），**0 处 `任务团队 child N`**、0 处提示词
  原文作主标签；持久 `subagent/descriptor` 与面板逐字一致。证据：
  `evidence/childname-fix-2026-11-08/gui/`（README + 4 截图 + 3 JSON + 描述符摘录）；
  记录：`VALIDATION.md` Round 32、`DECISIONS.md` D-041 Addendum、`RESEARCH.md` A18 补充、STATE。
- **记忆更正（只读核实）**：live `:3090` web profile 的插件 = **released 0.6.0**（2026-11-07
  21:54 安装；`lib/team-engine.js` 不存在 → 不含本修复）。旧记"仍 0.2.7"过时，STATE/VALIDATION
  已更正。live 实例全程未碰（D-013）。
- **验收条款状态（本轮后）**：条款 1/2/3/5/6 满足；条款 4 的「插件加载于 mise DSH installation +
  ≥3 子代理工作流 + Web GUI 顶栏显示描述性名」三项在本机 `CONFIRMED`（本隔离实例与 live 用同一
  `dsh` 二进制 0.2.1-rc.2）；唯一未达项 = 特指 `http://100.111.111.88:3090` 实例本身——其上仍跑
  不含修复的 released 0.6.0，按 D-013 步骤 5 部署+重启需用户明确授权，且本会话沙箱只可写工作树。
- **未做 / `NOT_RUN`：** live `:3090` 的修复部署与浏览器复验；`[COORDINATION]` Issue 状态块
  （仓库 Issue 列表无该 Issue，历史轮次同样记 `NOT_RUN`）；上游 3 行 ask（可选简化，未执行）。
- **Next action（用户/lead，一次外部动作即收口）：** 把 `release/0.6.0` HEAD（`ad66118`；npm 未
  发布、无新 tag）装入 live `web` profile（备份 patch → `dsh plugin add` 新路径 tarball → 核对
  `dsh.profile.bundles` 三项齐全 → `workflow-ptc` enabled 确认），再按 D-013 步骤 5 重启 `:3090`
  （`DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`），
  即可在 live GUI 顶栏看到同样的描述性子代理名。

## 2026-11-08 — 子代理顶栏显示名：插件侧 twin 引擎落地，真机 PASS（fix_child_names 第四次执行，`CONFIRMED`，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，attempt 4）· **To:** lead / 用户 · **Base:** `60cde95`（本地 `release/0.6.0` HEAD；含并发任务 fix_completed_links 的已提交修复）
- **结论：D-039 的 BLOCKED 判定被推翻。** 插件侧存在可用扩展点——插件持有 `ctx.workflowEngine`
  （自己的 inject），而 `PtcWorkflowEngine.start()` 在 start 时才读 `runCtx.subagents`
  （`workflow-ptc/src/index.ts:157`）；插件用**注入引擎自己的构造函数**建私有 twin，
  把 `subagents` 换成在 `startActivation` 处重写 `spec.label`（= 提示词首行）的视图，
  `reflect.provide` 置空保持私有，非 PTC 引擎原样回退并 warn。不改 core、不改引擎、
  不碰共享服务实例。上游 3 行 ask 从"必要"降级为"可选简化"。
- **本轮改动（全在本仓库，未提交，随本轮 commit）：**
  `src/team-engine.ts`（新）、`src/run.ts`（两处调用点）、`src/script.ts`/`src/triage.ts`/`src/gate.ts`
  （子代理提示词**首行**改描述性标题，人设第二行）、`test/team-engine.spec.ts`（新，12 例）、
  `test/engine-harness.ts`（additive 捕获一处）、`CHANGELOG.md`（[Unreleased] Fixed 英中条目）、
  `docs/ARCHITECTURE.md`（执行路径行）、记忆文件（RESEARCH A18 / DECISIONS D-039 addendum + D-041 /
  VALIDATION Round 31 / STATE / 本节）、证据 `docs/knowledge/evidence/childname-fix-2026-11-08/`。
- **真机验证（Round 31）：** 隔离 home `out/childname-fix-verify/`（profile `cfix`）、
  shipping 构建（无调试代码）团队档 COMPLETED；6 个子会话首个 `subagent/descriptor` 全部为
  `规划助手`/`<任务标题>`/`检查 · <任务标题>`（含一条真实 agnes route-switch 重试），
  **0 处 `任务团队 child N`**；修复前同 patch 对照 3/3 旧标签。`npm run ci` → **37 文件 / 650 测试 PASS**。
- **诊断教训（RESEARCH.md A18，三次真机失败换来）：** 不要代理 cordis ctx（receiver 键控的
  fiber walk 会被破坏）；服务**属性访问**受 isolate guard（`cannot get property "X" without inject`），
  显式 `ctx.get(name)`/`ctx.reflect.get(name, false)` 不受——twin 的服务从**引擎自身 ctx** 经
  `ctx.get` 解析进最小 holder。headless 下 cordis logger.warn 不可见，诊断要用工具结果/探针。
- **未做 / NOT_RUN：** live `:3090` 的浏览器复验（实例仍是旧插件 0.2.7，401/D-013，无凭据读取）——
  部署新构建后人工点开团队档即可看到；上游 3 行 ask 未执行（现在可选）。
- **Next action：** commit + push 本轮文件（按文件名逐一 add）；如需在 live `:3090` 生效，
  需用户/lead 重新部署插件（非本会话能力）。
- **标注更正（2026-11-08）：** 上文 Round 31 与 STATE/VALIDATION 里的 synthesizer 首行实为
  `汇总助手`（`src/naming.ts:102` 的 role copy，`memberLabel('synthesizer', 1)`），
  初稿误写 `综合助手`，已在本轮更正。

## 2026-11-08 — 子代理顶栏显示名：第三次执行复核 + 末两个扩展点候选用类型级证据关闭，**BLOCKED 维持（已被上一节推翻）**（fix_child_names，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，编排器重试轮）· **To:** lead / 用户 · **Base:** `5d9fcbe`（本地 `release/0.6.0` HEAD，未变）
- **本轮做了什么：** ①把 Round 27/28 的源码链**第三次独立重验**（全部自己重读 installed DSH `0.2.1-rc.2` 与
  core 检出源码，行号见 `VALIDATION.md` Round 29 表）——逐条一致；②新增**类型级证据**，把前两轮仅以
  「理由否决」记录的末两个扩展点候选关闭：`WorkflowStartRequest` 全接口无 label 字段
  （`dsh-workflow/lib/types/runtime-types.d.ts:15-28`）；每 run `subagentProvider` + `registerProvider` 虽是
  真实文档化 API，但 continuable 子代理的 provider 参与只有 `ContinuableCreateSpec { seed? }`
  （`dsh-subagent/lib/types/types.d.ts:187-213`，单字段无 label），descriptor 由 `startLocal` 从
  `spec.label` 快照、label 归 `startActivation` 调用方（types.d.ts:122-124）——调用方即写死的 workflow host；
  无 `prepareContinuable` 的 provider 会把子代理降级为 external 一次性 run（GUI 渲染裸子会话 id，更差且摧毁
  continuable 模型）；引擎 Config 无 label 模板；全 core checkout 仅 `PtcWorkflowEngine` 一个引擎实现；
  `ctx.subagents` 服务面不暴露 `startActivation`。另核：core 检出 HEAD `687f282e` 与 installed 同为
  `0.2.1-rc.2`（无上游修复落地）。
- **结论：BLOCKED 维持（第三次独立确认）。** 主标签只能由 DSH core 的 ~3 行上游改动解锁
  （`runtime.ts` 转发 `opts.label` + `host.ts` 的 `childRequest()/startChild()` 接 `label`）；
  半程缓解（`ctx.sessionTitle.rename`，只改次级行）仍待用户批准且不满足验收条款 1。本轮零源码改动。
- **本轮改动：** 仅记忆与证据文件——`VALIDATION.md`（Round 29）、`DECISIONS.md`（D-039 Addendum 2）、
  `STATE.md`（第三次执行补充段）、本节、
  `docs/knowledge/evidence/childname-blocked/extension-points-closure.md`（新）。**无源码改动、无 `CHANGELOG.md` 条目。**
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；live `:3090` 未碰（D-013，仍 `0.2.7`，本会话无凭据 401）；
  隔离 profile 未再起（Round 28 的真机复现继续有效，本轮复读其证据文件完整）；`npm run ci` 未跑
  （零源码改动；工作树含并发任务进行中的 client 改动；基线 Round 26：35 文件 / 624 测试 PASS）。
- **并发注意：** 工作树仍有**另一任务**的改动（`.gitignore`、`lib/client.js`、`package.json`、
  `src/client/index.js`、`test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`）。本轮**未触碰**，
  提交时按文件名逐一 `git add`，只含本任务 5 个记忆/证据文件。
- **Next action（需要用户/lead 决策，同前两轮，二选一）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 约 3 行 label 转发；
  改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start` 后调
  `ctx.sessionTitle.rename(childId, <任务名>)`，次级行提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — 子代理顶栏显示名：第二次尝试复核 + 真机复现，**BLOCKED 维持**（fix_child_names，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，attempt 2）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD，未变）
- **本轮做了什么（attempt 2）：** ①把 attempt 1（Round 27 / D-039）的源码结论**逐条独立重验**——全部自己重新读源码，
  关键行号见 `VALIDATION.md` Round 28 表（引擎 `dsh-workflow-ptc/lib/index.js:332` 写死
  `` `${meta.name} child ${callId}` ``、guest 不转发 `label`、描述符 `foldSubagentDescriptor` 取第一条锁死、
  GUI `dsh-client-ui-subagent/lib/client.js:201` 直接渲染、`dsh-session-title` `SessionTitleService.rename`
  存在且只作用于次级行）。②把 attempt 1 的「隔离 profile 真机 `NOT_RUN`」升级为**真机复现 PASS**：
  `out/childname-verify/`（隔离 home + profile `cnamer`，headless，模型 v4-pro + agnes-3.0-flash，
  复用 `out/v060-verify/*.patch.yml`，密钥仅布尔存在检查）跑一轮团队档 COMPLETED（2 任务 verified，
  6 子代理），父会话 `tool-workflow/agent-start` 证明插件标签（`规划助手`/`执行`/`检查`）确实在传，
  而 6 个子会话首个 `subagent/descriptor` **全部**是 `"label":"任务团队 child N"`（N=1..6）——
  与用户截图逐字一致。证据：`docs/knowledge/evidence/childname-blocked/`（README + 3 摘录文件）。
- **结论：BLOCKED 维持。** 主标签由 DSH core 写死并被描述符契约锁成不可改写，插件侧无文档化扩展点；
  按任务约束（"If no extension point exists … report BLOCKED with the specific limitation instead of
  modifying DSH core"）不做绕行改动。验收条款逐条状态：条款 1/3/4/6 的"修复已实现"部分不可达
  （无修复可交付）；条款 2（DSH core 未改）满足；条款 5（CHANGELOG 条目）不适用（无用户可见变更，D-039 既定）。
- **本轮改动：** 仅记忆与证据文件——`VALIDATION.md`（Round 28）、`DECISIONS.md`（D-039 Addendum）、
  `STATE.md`（2026-11-07 段补充）、本节、`docs/knowledge/evidence/childname-blocked/`（4 文件）。
  **无源码改动、无 `CHANGELOG.md` 条目。**
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；live `:3090` 未碰（D-013，仍 `0.2.7`，本会话无凭据 401）；
  浏览器渲染 `NOT_RUN`（描述符标签已是渲染输入的唯一主标签来源）；`npm run ci` 未跑
  （零源码改动；工作树含并发任务进行中的 client 改动，跑 CI 只会测到别人的中间态；基线 Round 26
  35 文件 / 624 测试 PASS）；半程缓解（`sessionTitle.rename`）未实施（D-039：待用户批准）。
- **现场异常（已绕过，如实记录）：** `out/childname-verify/` 内两个中间摘录文件曾在相邻两次调用之间
  消失（疑似与并发任务的 out/ 操作相撞）；改用「同一命令内生成+校验」把摘录直接落盘到证据目录后
  跨调用复核仍在，证据完整性不受影响。
- **并发注意：** 工作树仍有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`，另有 `.gitignore`/`package.json`/`.v070-home/`
  等进行中痕迹）。本轮**未触碰、未提交**，因此**未做 git commit**（避免把别人的工作树改动扫进提交）。
- **Next action（需要用户/lead 决策，二选一，同 attempt 1）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 改约 3 行——
  `runtime.ts` 把 `opts.label` 放进 `startAgent(...)`，`host.ts` 的 `childRequest()` 接收 `label`、
  `startChild()` 用 `` label: request.label ?? `${this.meta.name} child ${callId}` ``；改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start`（事件带 `childId`）后调
  `ctx.sessionTitle.rename(session, <任务名>)`，把顶栏**次级行**的提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — 子代理顶栏显示名：诊断完成，判定 **BLOCKED**（fix_child_names 任务，`release/0.6.0` 工作树，attempt 1）

- **From:** 执行子代理（fix_child_names）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD）
- **结论（`CONFIRMED`，源码逐行取证）：** 顶栏主标签 `任务团队 child N` 由 **DSH core** 在创建子代理时写死，
  插件侧无任何文档化扩展点可改。证据链（8 处行号）见 `VALIDATION.md` Round 27，决策见 `DECISIONS.md` D-039。
  一句话：插件已经在传 `label`（`src/script.ts:1188/1213/1324/1438`），丢标签发生在引擎内部
  （`workflow-ptc/src/runtime.ts:183-188` 不转发 → `host.ts:205` 写死 → 描述符被锁成不可改写
  → `dsh-client-ui-subagent/lib/client.js:201` 直接渲染）。
- **本轮改动：** 仅记忆文件——`docs/knowledge/VALIDATION.md`（Round 27）、`DECISIONS.md`（D-039）、
  `STATE.md`（2026-11-07 段）、本节。**无源码改动、无 `CHANGELOG.md` 条目**（没有用户可见变更可记）。
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；隔离 profile 真机 `NOT_RUN`（无修复可验）；
  live `:3090` 版本与浏览器渲染 `NOT_RUN`（`GET /` → `401`，本会话无凭据）；`npm run ci` 本轮未跑
  （零源码改动；基线仍是 Round 26 的 35 文件 / 624 测试 PASS）。
- **并发注意：** 开工时工作树已有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts` 已改，`test/panel-links.spec.ts` 未跟踪）。本轮**未触碰、未提交**，
  因此**未做 git commit**（避免把别人的工作树改动扫进提交）。
- **Next action（需要用户/lead 决策，二选一）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 改约 3 行——
  `runtime.ts` 把 `opts.label` 放进 `startAgent(...)`，`host.ts` 的 `childRequest()` 接收 `label`、
  `startChild()` 用 `` label: request.label ?? `${this.meta.name} child ${callId}` ``；改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start`（事件带 `childId`）后调
  `ctx.sessionTitle.rename(session, <任务名>)`，把顶栏**次级行**的提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — v0.6.0 发布 + 隔离验证收尾（release-runner，`release/0.6.0` 分支）

- **From:** release-runner · **To:** lead · **Base:** `ca040e4`（`release/0.6.0` release-prep；`main` 已合入为 `1f9065d`，PR #43）
- **发布（CONFIRMED）：** PR #43 CI Node 22 + 24 pass（run `42362505851`）→ merge `1f9065d` →
  tag `v0.6.0` → 同 sha（`git ls-remote --tags origin` CONFIRMED）→ Release workflow run
  `42362674837` success → GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.6.0`
  published **2026-11-07T10:09:17Z**，asset `dsh-grok-workflow-0.6.0.tgz` **299,146 B**。
  minor 理由：C1 向后兼容（hint 只重排未试路由，孤立 run 逐字节一致），按 RELEASING.md 走 minor。
- **本地检查（CONFIRMED）：** `npm ci` / typecheck 0 errors / lint **4 warnings / 0 errors**
  （3 既有 + 1 新增 `src/run.ts:29` 未使用 `RoleName`，本版未修）/ build（client 84123 B）/
  `git diff --exit-code -- lib/` = 0 / vitest **35 files / 624 PASS** /
  `npm pack --dry-run` 64 files / 299.1 kB（npm 缓存只读，改用 workspace-local cache 重跑）。
- **隔离验证 Round 26（CONFIRMED）：** 新鲜 profile `v060r` + 隔离 `DSH_HOME=out/v060-verify/home`，
  模型 v4-pro + agnes flash（v4.1-flash 当天 cooldown，如实记录）；单轮团队档双任务双路由
  （各 cap 1）→ COMPLETED，2 verified，报告含本地 `Route overflows` 行 + 双 worker 路由；
  工作区仅 sum.txt/prod.txt（611），无外写。跨 run hint 行本轮未产出（单 run），由单测覆盖。
  证据：`docs/knowledge/evidence/v060-route-cap/`（README + report-full + session 52 事件）。
- **诚实边界：** 未动 DSH core；未重启/未碰 live `:3090`（仍 `0.2.7`，D-013）；未动已发布 tag；
  operator `DSH_HOME` 未写；`warn.emptyCap` 浏览器渲染 `NOT_RUN`（单测覆盖）。
- **本轮归档（release 分支，不进 main）：** `docs/knowledge/evidence/v060-route-cap/`（4 文件，
  已删冗余 excerpt 只留 report-full + session-events + README）+ STATE（`0.6.0` released）+
  VALIDATION.md Round 26 + 本节；随本轮 commit push 到 `origin release/0.6.0`。
- **Next action：** lead 确认后可关闭本轮；`:3090` 升级到 `v0.6.0` 待用户批准（D-013），不自行执行。

## 2026-11-07 — 路由 Cap B组+C1 收尾归档（route-cap-closer，`release/0.5.1` 工作分支）

- **From:** route-cap-closer · **To:** lead · **Base:** `df34ac0`（本地 `release/0.5.1` HEAD，本轮 commit 前）
- **变更文件（`git add -A` 入库，未 bump 版本、未打 tag、未发布 npm）：**
  实现（既有工作树改动，本轮只重建 `lib/` 确认同步）：`src/settings.ts`（`validateRoutes` 空 Cap notes）、
  `src/client/index.js`（`warn.emptyCap` 中英 + 黄字横幅，不拦 Save）、`docs/ARCHITECTURE.md`（单 run 作用域）、
  `src/script.ts`（`busyRoutes` 快照 + 重排未试顺序 + `'(cross-run hint)'` 标记）、`src/run.ts`（run 级路由标签快照）、
  `src/report.ts` + `src/records.ts`（`Route overflows (cross-run hint)` 分开渲染 + 透传）、
  `docs/knowledge/RESEARCH.md`（A16，C2-spike 已写入）、`CHANGELOG.md`（条目已由实现任务写入）、
  `test/route-concurrency.spec.ts` + `test/client.spec.ts`、`lib/` 编译产物（`build-client` 84123 B，二次重建 md5 幂等）；
  归档（本轮新增）：`docs/knowledge/DECISIONS.md` D-038、`docs/knowledge/VALIDATION.md` Round 25、
  `docs/knowledge/STATE.md`（Last updated 行 + Next priority 段）、本节。
- **ci 结果（CONFIRMED）：** `npm run build` PASS；`npx vitest run test/route-concurrency.spec.ts test/client.spec.ts`
  **47/47 PASS**（route-concurrency 13/13，client 34/34）；`npm run ci` **624/624 PASS**（35 文件，typecheck 0 errors，
  lint 3 warnings / 0 errors 既有基线）；DSH core 未改；live `:3090` 未重启（D-013）；真机 live `NOT_RUN`。
- **诚实边界：** B组+C1 已合入工作树、随本轮 commit 进 `origin release/0.5.1`；未发布、未打 tag；
  `task-3` 只读确认 completed（未 claim）。push 结果见本轮回复。
- **Next action：** lead 复核 D-038 / Round 25 后决定是否合入 `main`、走发布流程、升级 `:3090`（需用户批准）。

## 2026-11-07 — v0.5.0/v0.5.1 收尾 + Round 24 诊断交接（release-closer，`release/0.5.1` 工作分支）

- **From:** release-closer · **To:** lead / next agent · **Base:** local `release/0.5.1` HEAD `720eeb6`
  (merge second-parent); `origin/main` = `5cc66be` (Merge PR #42); tag `v0.5.1` → `5cc66be`
  (far-end sha matches `origin/main`, `git ls-remote --tags origin` CONFIRMED); GitHub Release
  `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.5.1` published
  **2026-11-07T02:08:32Z**, asset `dsh-grok-workflow-0.5.1.tgz` **294,363 B**.
- **现状（CONFIRMED）：** `package.json` + `package-lock.json` = `0.5.1`；`CHANGELOG.md` 有双语
  `## [0.5.1] - 2026-11-07`（PR #41 / `45d721a`）；`npm run ci` PASS（typecheck 0 errors /
  lint 3 warnings 0 errors / vitest **35 files / 617 tests**；`git diff --exit-code -- lib/` 无 diff）。
- **本轮归档（CONFIRMED）：** `docs/knowledge/VALIDATION.md` +39 行 Round 24 只读诊断；
  `docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md`（已 chmod 644）+
  `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（已 chmod 644）入库；
  `docs/knowledge/evidence/v051-fast-context/`（13 文件）入库；`.gitignore` 追加
  `.v050-home/` `.v051-home/` `.v051-verify/` `out/`（本地隔离目录不入库）。
- **Round 24 结论（CONFIRMED，只读诊断，未改代码）：** session-3361cd6e 团队档即时回执
  （seq 2339，step 之外的 `assistant/message`）使 `tokenMeter.measure()` 每次在同处抛错，
  turn 4 之后自动压缩永久停摆，GUI 百分比照常 92–95%；`/compact` 实测 NOT_RUN（会写会话），
  Web GUI API 取数 BLOCKED（401，不读凭据）。修复方案留给用户决策，未执行。
- **诚实边界：** 未动 `main`、未打 tag、未重启 `:3090`（D-013；`:3090` 仍跑 `0.2.7`，
  reload/upgrade 待用户批准）；未删本地目录。CHANGELOG/package.json 版本号本轮未改。
- **Next action：** lead 确认本 commit 内容后由 release-closer `git push origin release/0.5.1`；
  用户决策 Round 24 修复方案（receipt 写时点 / token-meter 容忍孤儿 / 新会话 `instantReceipt: false`）。

## 2026-11-06 — 先回捞后提问（`history_first_no_reask`，v0.5 未发布，工作树内）

- **From:** workflow execution agent · **To:** next agent / verifier · **Base commit:** `ac28a41`
- **做了什么（`CONFIRMED`）：** `src/triage.ts` 新增 `recallFromPrior()`（去停用词的双字/词锚点 ≥2，
  或指针式引用「刚才那份/上面说的/the above」+ 有实质材料 ≥120 字符）、`RECALL_LIMITS`、
  `TriageInput.prior`、`DETAIL.recalled`、`recallPrompt()`、`recalledNote()`、`missingNote()`；
  `classifyTriage()` 里 4 处 ask 判定统一改为 `ambiguousVerdict()`——`prior` 为命中则返回
  `fast/recalled`，否则返回与改动前完全相同的 `ask`/`ambiguous-escalate`。
  `src/gate.ts` 新增 `memoryDocRoots()`（默认 `<cwd>/docs/knowledge`，`GROK_WORKFLOW_KNOWLEDGE_DIRS`
  可改）、`readMemoryDocs()`（只读、有界、过 `redactSecrets`、永不抛）、`collectRecallSources()`
  （会话上文 + 前序轮次 digest + 记忆文件，**剔除本轮消息**），并在 `produceAnswer()` 的 ask 档前接线：
  命中→快手档据材料作答；未命中且查过→提问后追加「先查后问，还缺 X」；无任何来源→提问逐字节不变。
- **测试（`CONFIRMED`）：** `npm run ci` **35 文件 / 617 测试 PASS**、`Found 3 warnings and 0 errors`
  （3 个既有 warning）；本轮新增 `test/triage-recall.spec.ts` **28 例**（命中/未命中/指针式/确定性/
  上限/脱敏/默认根/逐字节回归/`session-7e079b80` 形态回放成对用例）。证据：
  `docs/knowledge/evidence/history-first/{ci-summary,recall-spec,regression-suite}.txt`。
- **决策：** D-037（提问前先读；只读、有界、无新配置键；`ask:false` 时命中仍走快手档）。
- **现场发现（`CONFIRMED`，已修）：** 首版把本轮消息也算作"历史"（`relay` 在 `produceAnswer()` 前
  就 `commitClaimed()`），导致任何追问都"命中自己"——现在 `collectRecallSources(…, exclude)` 按
  `textOf(message) === request` 剔除，`before the fix` 用例守着它。
- **诚实边界：** 真机在线模型回放 `NOT_RUN`（本轮未起隔离 profile）；语义同义改写不会命中，
  会退化为提问；只读 `docs/knowledge/*.md`，不读 `archive.jsonl`。
- **Next action：** ①等 verifier 复核判据 1/2/4；②若要真机收敛，按 VALIDATION Round 21/22 的隔离
  home + `wb/cn:deepseek-v4.1-flash` 跑一次「先研究、后追问」两轮，确认追问不再要求重述；
  ③`:3090` 未热加载（D-013），不要自行重启。

## 2026-11-06 — PR #37 merged + v0.4.0 released (GitHub Release only, no npm)

- **From:** release operator (local) · **To:** next agent / operator
- **Base commit:** `e89daf9` (PR #37 feature on `feat/triage-history-hybrid`); **merge commit** `9438b3d` (PR #37 merge);
  **release commit** `708c315` (PR #38 merge); **tag** `v0.4.0` → `708c315`.
  `package.json` and `package-lock.json` both read `0.4.0`;
  `CHANGELOG.md` carries the bilingual `## [0.4.0] - 2026-11-06` section with a fresh empty
  `## [Unreleased]` above it; `docs/releases/RELEASE-NOTES-0.4.0.md` exists.
- **Feature (CONFIRMED):** history-aware follow-up (`FOLLOW_UP` + `historyNonEmpty`, `fast/followup`,
  never `chat`; `triageFollowupAsFast` opt-out) + hybrid classifier opt-in (`triageClassifier`
  `rules|hybrid`, default `rules`, one `runSingleCall` only for `ask`/ambiguous or `chat`+history,
  fallback to rules) + team-tier instant receipt (`appendInstantReceipt`) + deterministic
  `【人话结论】 verified/total` lead-in (`humanSummary`, zero extra calls).
  `npm run ci` 32 files / 545 tests PASS (incl. new `test/triage-followup.spec.ts` 5 cases);
  `npm run typecheck` clean; `npm run lint` 3 warnings / 0 errors (pre-existing);
  `npm run build` clean; `git diff --exit-code -- lib/` exit 0; `npm pack --dry-run` 56 files / 250.7 kB.
- **Merge of the feature (CONFIRMED):** `gh pr merge 37 --merge` after `gh pr checks 37` showed
  Node 22 `pass` / Node 24 `pass` (run `42074144133`); merge commit `9438b3d`;
  `origin/main:src/gate.ts` contains `triageClassifier === 'hybrid'` branch and `humanSummary` block.
- **Release (CONFIRMED):** branch `release/0.4.0` → PR #38 green on Node 22/24 (run `42075028625`)
  → merge `708c315`. `git tag v0.4.0 708c315` + `git push origin v0.4.0`. Release workflow run
  [42075318386](https://github.com/free6589/dsh-grok-workflow/actions/runs/42075318386) green end
  to end. GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.4.0` with
  `dsh-grok-workflow-0.4.0.tgz` (250,693 B, sha256 `e10802ca…`).
- **Tags:** `git ls-remote --tags origin` taken before and after; `diff` over the pre-existing
  tags = no changes. `v0.1.0`–`v0.3.0` untouched; only `refs/tags/v0.4.0` is new.
- **Decisions:** D-032 (history-aware follow-up) + D-033 (hybrid opt-in) + D-034 (receipt +
  deterministic summary, model-rewrite variant rejected after breaking 4 engine-count assertions).
- **Honest boundary:** `humanSummary` model-rewrite variant was built then reverted (extra engine
  call broke P0-2 ×3 + triage count ×1); shipped version is deterministic. Live multi-turn
  follow-up (`说人话` with history in one session) is covered by deterministic unit tests, not by
  one-shot headless (each headless turn is a fresh session). Isolated-profile live verification
  (Round 20): greeting `chat` + fast `30` PASS on `wb/cn:deepseek-v4.1-flash`; team tier ran and
  reported honestly (FAILED on an unresolvable `run.ts` path in an empty `/tmp` workspace — the
  gate/report path itself PASS, not a model-quality claim).
- **Next action (needs the operator, not an agent):** the live DSH service on `:3090` still runs
  `dsh-grok-workflow@0.2.7`; upgrading the `web` profile to `v0.4.0` (and any profile reload)
  still awaits explicit user approval (D-013). Do not restart the service on your own.

## 2026-11-03 — PR #35 merged + v0.3.0 released (GitHub Release only, no npm)

- **From:** release operator (local) · **To:** next agent / operator
- **Base commit:** `af0394a` (PR #35 merge on `main`); **release commit** `3f5ad0a` (PR #36 merge);
  **tag** `v0.3.0` → `3f5ad0a`. `package.json` and `package-lock.json` both read `0.3.0`;
  `CHANGELOG.md` carries the bilingual `## [0.3.0] - 2026-11-03` section with a fresh empty
  `## [Unreleased]` above it; `docs/releases/RELEASE-NOTES-0.3.0.md` exists.
- **Merge of the feature (CONFIRMED):** `gh pr merge 35 --merge` after `gh pr checks 35` showed
  Node 22 `pass` / Node 24 `pass` (run
  `https://github.com/free6589/dsh-grok-workflow/actions/runs/41659656218`); merge commit
  `af0394a`; `origin/main:src/config.ts` contains `repairSynthesisInconsistency`.
- **Release (CONFIRMED):** branch `release/0.3.0` → PR #36 (`https://github.com/free6589/dsh-grok-workflow/pull/36`)
  green on Node 22/24 (run `41664791714`) → merge `3f5ad0a`. `git tag v0.3.0 3f5ad0a` +
  `git push origin v0.3.0`. Release workflow run
  [41665410667](https://github.com/free6589/dsh-grok-workflow/actions/runs/41665410667) green end
  to end (tag↔`package.json` validation, typecheck, lint, build, `lib/` consistency, tests, package
  checks, bilingual changelog extraction, release creation). GitHub Release
  `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.3.0` with
  `dsh-grok-workflow-0.3.0.tgz` (246,493 B, sha256 `3a8bf81b…`).
- **Local checks on the release commit** (`f8cb09e`, identical tree to the merge `3f5ad0a`):
  `npm ci` PASS; `npm run typecheck` PASS; `npm run lint` 3 warnings / 0 errors (pre-existing
  baseline); `npm run build` PASS; `git diff --exit-code -- lib/` exit 0; `npm test` 31 files /
  540 tests PASS; `npm pack --dry-run` 56 files / 246.5 kB / `dsh-grok-workflow-0.3.0.tgz`.
- **Tags:** `git ls-remote --tags origin` taken before and after; `diff` over the pre-existing
  tags = no changes. `v0.1.0`–`v0.2.7` untouched; only `refs/tags/v0.3.0` is new.
- **Honest boundary:** real-machine coverage of the shipped change is **partial** (isolated
  instance alive with a bad config; boot warn line not captured; `/api/settings/describe` + page
  `401`, same as VALIDATION Round 16 item 8; settings-page render/save-back `NOT_RUN`).
- **Next action (needs the operator, not an agent):** the live DSH service on `:3090` still runs
  `dsh-grok-workflow@0.2.7`; the `web/cordis.patch.yml` `synthesis: model` line and the `0.3.0`
  upgrade both take effect only after a profile reload/`plugin add …#v0.3.0`, and **that reload
  still awaits explicit user approval (D-013)**. Do not restart the service on your own.

## 2026-11-03 — P0 web fix + PR #35 synthesis fallback (lead-reviewed, not merged)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `1024b1c` (`origin/main`); work commit `7c4a05e` on `feat/synthesis-fallback`
  (local `main` reset back to `1024b1c` after review; work lives on the feature branch + PR).
- **P0 (CONFIRMED, operator machine):** `web/cordis.patch.yml` `grok-workflow.config` +1 line
  `synthesis: model` (line 1029, 4-space indent, same level as `grokDefault: on`).
  Backup: `~/dsh-profile-backups/cordis.patch.yml.20261103-222020-pre-synthesis-model`.
  `diff -u` = +1 line only; `grep -n -A16 "id: grok-workflow"` shows the line; `plugin list`
  still `dsh-grok-workflow@0.2.7`. No service restarted (D-013 rule 1); live `:3090`
  reload still needs operator approval.
- **P1–P3 (lead-verified, PR #35):** `https://github.com/free6589/dsh-grok-workflow/pull/35`
  closes #34. `repairSynthesisInconsistency(raw)` in `src/config.ts` (pure, only shapes
  (a)/(b)); `apply()` in `src/index.ts` load-time catch → `logger.warn`（含"已按…生效，
  请在设置页确认"）→ `resolveConfig(repaired)` must pass → activate with
  `synthesisRepaired: true` (`describeResolvedConfig` renders `synthesis=<mode> (repaired)`).
  Settings page (`src/client/index.js` `validate()`) red-blocks Save on the same two
  mismatches (`error.synthesisChainUnused`/`Missing`, bilingual). R-06 unchanged.
- **Tests run (lead, on `7c4a05e` before reset):** `npm run typecheck` PASS; `npm run lint`
  3 warnings 0 errors (pre-existing — base `1024b1c` also 3, `GROUPS_WITH_FIELDS`/`field`/
  `redact.ts:155` escape); `npx vitest run test/config-synthesis-fallback.spec.ts
  test/client.spec.ts test/config.spec.ts test/routing.spec.ts` 4 files / 93 PASS;
  `npm run ci` **31 files / 540 tests PASS**; `git diff --exit-code -- lib/` = 0.
  Secret grep over changed src/test = only benign `task-failed`/`id:` matches.
- **Local runtime (partial, honest boundary):** `DSH_HOME=/tmp/p1-verify-home`, profile `p1web`,
  `127.0.0.1:3297`, bad-config instances stayed alive, but boot stdout had only URL lines
  (warn/signature not captured); `/api/settings/describe` + page fetch = 401 (same known
  dead-end as Round 16 item 8). Settings-page render + save-back `NOT_RUN`.
- **Next action:** review/merge PR #35 (lead-verified, 1 commit ahead of `origin/main`);
  then plan release per `docs/RELEASING.md`; live `:3090` reload only with approval.

## 2026-11-03 — web profile upgraded 0.2.6 → 0.2.7 (operator machine)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `16a11b7` (`origin/main`, `v0.2.7` tag; `package.json` `0.2.7`)
- **Action (CONFIRMED):** `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.2.7`
  (pnpm Done in 8.8s); `dsh plugin --profile web list | grep grok` →
  `dsh-grok-workflow@0.2.7`; `why` → single copy under `dsh-profile-web (dependencies)`.
- **Note:** D-013 respected — running `:3090` service was not restarted/reconfigured by this
  task; new bundle code applies on next profile (re)load per DSH plugin semantics.
- **Next action:** none required for the upgrade itself; restart/reload of `:3090` only with
  operator approval if live verification is wanted.

## 2026-11-03 — v0.2.7 released (per-route concurrency + P0-5 first-message fix)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `16a11b7` (`origin/main`, PR #33 merge = the v0.2.7 release commit; tag `v0.2.7`
  已打，Release 已建：`https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.7`，
  资产 `dsh-grok-workflow-0.2.7.tgz`)
- **What landed since v0.2.6:** P0-5 首条消息先发布再跑 (`d8cc6cc`)；按路由并发上限
  `maxInFlight` + 打满让路 (`1b5ad75`, PR #32, D-030)；发版准备 (`0e8a7e7`, PR #33)。
- **Install:** `dsh plugin --profile <p> add github:free6589/dsh-grok-workflow#v0.2.7`，装完重启该 profile。

## 2026-11-01 — v0.2.4 install matrix recorded: 8 PASS + 2 NOT_RUN (memory only)

- **From:** matrix-memory · **To:** lead
- **Base commit:** `7357e5e` (`origin/main`, PR #28 merge = the v0.2.4 release commit; tag `v0.2.4`
  已打，Release 已建：`https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.4`，
  资产 `dsh-grok-workflow-0.2.4.tgz`)
- **Work commit:** the docs-only commit carrying this section on `docs/matrix-024-memory`. No
  `src/`, `lib/` or `test/` file changed (`git diff --stat 7357e5e HEAD -- src lib test` is empty);
  this branch exists only to record the result.
- **Matrix result (read-only evidence, not committed):**
  `.workflow-artifacts/matrix-024/EVIDENCE.md` + `logs/` (item1~item8). Items 1–7 **PASS**,
  item 8 部分通过（composition + boot 确认；`settings`/`describe` 经 query-token + Bearer 均
  `401 unauthorized`，namespace 未确认），items 9–10 **NOT_RUN**（本环境无浏览器自动化；
  Round 15 已在真 GUI 上覆盖设置页与 web 聊天）。
- **Anomaly on record:** item 7 run3 首轮 EXIT 0 直接答 `apple, banana, cherry` 无报告
  (`logs/item7-run3.jsonl`，563 bytes)；同 prompt 重跑 `COMPLETED` verified
  (`logs/item7-run3-rerun.jsonl`，3667 bytes)；异常之后连续 3 个 EXIT 0 + 报告。样本保留，
  未掩盖。原文引用见 `VALIDATION.md` Round 16 §2。
- **Details:** `VALIDATION.md` Round 16（逐项 1–10 + 异常原文引用 + `EVIDENCE.md` 路径）；
  `STATE.md` 已对齐（Current phase = v0.2.4 已发布，Next priority = 下一版规划，
  NR-1/7/8 与 Round 15/16 对齐）。
- **Tests run this round:** no source test suite was executed (docs-only change). Read-only checks:
  `git status`, `git diff --stat`, secret grep over the three files (0 hits). `npm run ci` on
  `main` `7357e5e` is still `NOT_RUN` — the last full run (27 files / 487 tests) was on the
  PR #26 branch, see Round 13.
- **Next action:** merge `docs/matrix-024-memory` into `main`, then plan the next version scope
  (`relay`/`append` 投递、item 8 的 API 认证、质量矩阵、U-6 chain editor 候选）.

## 2026-11-01 — real Web GUI verified: `/grok` switch + settings card (memory only)

- **From:** local (gui-verify-memory) · **To:** lead / captain / next local agent
- **Base commit:** `6806426` (`origin/main`, PR #27 merge — the tree this verification ran against)
- **Work commit:** the docs-only commit carrying this section on `docs/gui-verify-memory`. No
  `src/`, `lib/` or `test/` file changed (`git diff --stat 6806426 HEAD -- src lib test` is empty);
  this branch exists only to record the result.
- **What is now `CONFIRMED`** (previously `NOT_RUN` since Round 14 §5): on an isolated instance
  (`DSH_HOME=.workflow-artifacts/gui-verify/dsh-home`, profile `gw-gui` from the stock `web`
  template, `127.0.0.1:3199`, real Chromium, live `:3090` untouched):
  1. **`/grok` is switchable in the real GUI** — default `off` gives a plain answer with no report;
     `/grok` gives the command row, the `3 subagents` badge and a full `GROK-WORKFLOW-REPORT`
     (`COMPLETED`, 1 verified, model routes, 3600000 ms deadline) in 1m41s; `/grok off` in the same
     session returns to plain chat in 11s. Command events, `plugin:grok-workflow/mode` events and
     the report text were each re-read from `session.v4.jsonl.zstd` this round.
  2. **The settings card renders and saves** — Plugins → `Grok workflow` card → generated page with
     `Grok mode default` / `grokDefault` `off | on`; edit → `Save (1)` → save takes `revision 0` to
     `revision 1`; a full page reload keeps `revision 1` / `on`; the write lands in the profile's
     `cordis.patch.yml` (md5 `d7830129…` → `1f628a0c…`) as `grokDefault: on`; and a **new** session
     with no `/grok` runs the workflow (fast lane, 1 subagent, 30s), so the value is functional.
- **Boundaries to repeat whenever this result is quoted:** the browser was **offscreen (headless)
  Chromium** (no X11 display on this host) and the model was **`wb/cn:glm-5.3-flash`** because the
  suggested `wb/cn:deepseek-v4.1-flash` returned `400 model_unavailable` (per-model cooldown) on
  2026-11-01. Delivery verified is the default **`in-turn`**; `relay`/`append` in a long-lived GUI
  session remain `NOT_RUN`. No quality/per-model claim follows. Five environment deviations are
  listed in `VALIDATION.md` Round 15 §4.
- **Evidence:** `.workflow-artifacts/gui-verify/README.md`, `shots/` (20 PNGs), `logs/`
  (`stepB2.log`, `stepC.log`, `stepD.log`, `stepE.log`, `dumpconfig-step*.txt`,
  `patch-before-settings.md5`), `scripts/` (the Playwright scripts). **These artifacts are not
  committed** — `.workflow-artifacts/` is untracked; only the paths and the quoted text are in the
  memory files.
- **Tests run this round:** no source test suite was executed (docs-only change); the verification
  evidence is the GUI run above. `npm run ci` on `main` `6806426` is still `NOT_RUN` — the last full
  run (27 files / 487 tests) was on the PR #26 branch, see Round 13.
- **Repository state:** `main` = `6806426` with PR **#23** (`2e9c26a`, Phase 1 dialogue reliability),
  **#24** (`334daf6`, task-grouped progress panel), **#25** (`54083ea`, 32,000-char objective
  limit), **#26** (`a000983`, segmented fallback) and **#27** (`6806426`, `/grok` switch) merged.
  `v0.2.3` is released (tag `538d1ab`); `package.json` still reads `0.2.3`.
- **Next action:** merge this docs branch, then prepare the **`0.2.4`** release from `main`
  (`npm run ci` + `git diff --exit-code -- lib/` on `main`, move `[Unreleased]` under
  `## [0.2.4]`, bump `package.json`/`package-lock.json` together). Do not tag, publish or restart
  the running service without the captain.

## 2026-11-01 — PR #26 review close-out (three fallback findings)

- **From:** local (pr26-closer) · **To:** lead / next local agent
- **Base commit:** `2e9c26a` (`origin/main` after PR #23; the branch was rebased onto it, originally
  cut from `334daf6`)
- **Work commit:** `68f3d15` on `fix/fallback-shards` (rebased: `6e902e0` → `bba5dc9`, `5cbccf2` → `68f3d15`)
- **Changed:** `src/shards.ts` (new: one splitter, rendered into the script and reused by host
  validation), `src/script.ts`, `src/report.ts`, `test/fallback-shards.spec.ts` (16 cases),
  `test/helpers.ts` (`taskFromPrompt`), `test/objective-limit.spec.ts`, `test/report.spec.ts`,
  `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `lib/**`.
- **Tests:** `npm run ci` = exit 0, **27 files / 487 tests** (post-rebase, includes the PR #23 specs);
  `npm run build && git diff --exit-code -- lib/` = exit 0.
- **Not found:** the "1 medium test gap + 1 low boundary issue" an earlier review round was said to
  have recorded is **not** in `.workflow-artifacts/` (that directory holds the objective-limit round
  only: `baseline/`, `limit-core*`, `test-report.md`, `github-recon.md`, `pr-fallback-shards.md`), nor
  in `docs/knowledge/`, `.agent-teams/`, or `.session-stage/`. Closest but unconfirmed:
  `test-report.md` §9 items 1–3 (fallback sharding not yet implemented; the generated script has no
  `objectiveChars` enforcement point; upstream boundary tests incomplete).
- **Open, not fixed here:** the generated script still does not enforce `TASK_LIMITS.objectiveChars`
  itself (`src/script.ts` declares it, nothing reads it); the host enforces it at gate/tool/input, so
  bypassing the host a 32,001-character objective still yields a `partial` fallback.
- **Next action:** review `68f3d15` on `origin/fix/fallback-shards`, then decide on merging PR #26
  (merge is the lead's call). PR #26 is rebased on `2e9c26a` and no longer conflicts.

## 2026-10-27 — v0.2.0 released and installed on the operator machine

- **Released:** `v0.2.0` tag + GitHub Release (tgz 42 files / 108,428 B, sha256 recorded by GitHub). CI and Release workflows green. `v0.1.0` untouched.
- **Installed:** real profiles `headless` and `web` (layerfs root), locked to `#v0.2.0`. Web GUI service restarted with the plugin composed.
- **Test matrix:** 8/10 PASS on real installs with real models (VALIDATION.md "0.2.0 real-profile install matrix"); 2 NOT_RUN are GUI-interactive checks for the operator (settings page rendering in browser, web chat behavior).
- **Rollback:** `dsh plugin --profile <p> remove dsh-grok-workflow`; backups under `~/dsh-profile-backups/`.
- **Operator checklist (morning):** send a chat message in the GUI and confirm a workflow report (not a direct answer); open Settings and confirm the auto-generated `grok-workflow` page renders; judge in-turn latency comfort (adjust timeoutMs/maxTasks or request progress hints per U-9).
- **Next action:** fix loop per D-011 on any failure (patch bump, new tag, reinstall, retest); backlog: chain-editor UI (Phase 9), streaming progress, relay/append GUI evidence (NR-1 half).
- **Then (0.2.1):** the Web GUI settings page (plugin-owned browser bundle) and the documented
  activation prerequisite are prepared on `main`; `v0.2.1` is created by the captain after the
  acceptance pass. `v0.2.0` stays where it is.


## 2026-10-26 — Security observation (captain integration note)

- During t15's writesPaths experiment a workflow subagent inherited session tools including git and committed `docs/plan-a.md` as `e38ac8e` (`dsh-agent@localhost`) without authorization. Artifacts removed in the v0.2.0 release batch; history kept intact deliberately (audit trail).
- Risk: subagents of the workflow inherit the parent session's toolset — including VCS write access. Operators running the workflow in profiles with git-capable tools should treat this as a documented limitation (see WORKFLOW-DESIGN limits). Mitigation options for future versions: tool pre-execute deny list for subagents, or documented operator guidance.
- The plugin's own recursion guard blocks workflow re-entry in subagents, but it cannot (and does not) restrict which unrelated tools a workflow subagent may call.


## 2026-10-26 — Round 2 (phases 1–7): mandatory entry, routing, settings, reliability, release prep

- **From:** local team (AgentTeams dshgw-workflow-planning), implementer + independent reviewers
- **To:** captain / next local agent / independent reviewer
- **Base commit:** `bd1f261` (U-4 write-path isolation; phase 6 landed in `32a7f4a`)
- **Package version:** `0.2.0` — **released** as `v0.2.0` on 2026-10-26 (tag on `f7a244c`,
  GitHub Release 2026-10-26T17:10:16Z, 42 files / 108,428 B). This section was written before that
  tag existed; the version in the tree today is `0.2.1` (its tag is still pending).
- **Release-readiness artefacts:**
  - `docs/releases/RELEASE-NOTES-0.2.0.md` — the announcement as published, artifact table
    (`0.1.0`: 33 files / 61,281 B → `0.2.0`: 42 files / 108,428 B as released) and operator steps
    pointing at [RELEASING](../RELEASING.md). (`0.2.1` has its own notes file next to it.)
  - `scripts/smoke-settings-identity.mjs` — feeds the **built** plugin the descriptor produced by
    the DSH installation's own `dsh-settings` projection and prints the diagnostics line; the
    end-to-end check for the t31/F1 identity fix.
  - `test/settings-fixture.ts` + `test/settings-projection.spec.ts` — the settings descriptor is
    no longer hand-shaped: the runtime's projection rules are applied, the measured facts are
    pinned, and the transcription is cross-checked against the real module when discoverable.
- **What is now true:**
  - The gate claims every user message through `agent/pre-step` and answers it
    from a validated report in the same turn (`in-turn`, the default;
    `enforceGate: true` is the default, `gateRequired` turns a missing hook into a
    load error).
  - Per-role ordered fallback chains (`roles.{planner,worker,verifier,synthesizer}`,
    ≤3 routes), a `switchOn` whitelist, and routing recorded in the report.
  - Failure `class` + `category` (`infrastructure`/`quality`/`configuration`/
    `cancelled`/`unknown`) end to end, including a rendered `Failures:` line.
  - A live settings surface derived from the exported `Config`: unknown keys
    rejected with a suggestion, chains validated against the runtime's providers,
    edits apply to the next message with a last-good fallback.
  - Write-path isolation (U-4): `writesPaths` per task, conflict-aware pool,
    normalized lexical overlap, echoed in the report.
  - Documentation set synchronized: README (EN + zh), CHANGELOG (bilingual
    `0.2.0`), DESIGN (DD-1..DD-9b + NR ledger), ROADMAP (phases marked), STATE,
    DECISIONS (D-009..D-012), ARCHITECTURE, VALIDATION.
- **Tests run:** `npm run ci` — PASS: typecheck, lint 0/0, build, **264 tests / 18
  files**. `lib/` reproducible (identical md5 before/after rebuild). Clean-copy
  `npm ci` + `npm run ci` PASS. `npm pack` contents verified. Isolated-profile
  install of the packed tarball PASS.
- **Local runtime verified:** real headless one-shot run with a live model passes
  the delivery assertion (`scripts/e2e-headless-in-turn.sh`: PASS, `Grok workflow:
  COMPLETED`), and the explicit-refusal path was measured twice in t14.
- **Honest gaps (do not read these as done):** NR-1 (GUI/long-lived delivery
  half), NR-5 (real provider failure texts), NR-6 (real-provider route switching
  end to end), NR-7 (stock form rendering of `roles`), NR-8 (in-place settings
  `update()` against a live holder), NR-9 (planner fill-rate for `writesPaths`).
- **Blockers:** none technical. The remaining release steps need the captain:
  create `v0.2.0`, publish the GitHub Release, and never move `v0.1.0`.
- **Next action:** t16 final acceptance on the packed artifact, then tag + Release
  per `docs/RELEASING.md`.

## 2026-10-25 — Workflow planning round 1 (audits → synthesis → review → revision)

- **From:** local team lead (AgentTeams dshgw-workflow-planning)
- **To:** cloud reviewer / next local agent
- **Base commit:** b231660 → **work commit:** 2403a10 (see git log for the round's commits: 023887d criterion fix, d82c245 synthesis, 0672de6 revision, 2403a10 QA-2 batch)
- **Changes:** Four independent read-only audits (architecture / DSH 0.2.1-rc.2 API / model routing / security+testing) with source-line evidence; two live experiments (t18 B-1 delivery routes, t19 H-1..H-5 API capability probes); synthesis + independent review (21 findings) + revision of WORKFLOW-ROADMAP.md and WORKFLOW-DESIGN.md; QA batch: criterion normalization fix (t20, 023887d) and report validation/redaction/engine-contract batch (t21, 2403a10).
- **Tests run:** `npm run ci` PASS — 106 tests / 9 files (was 56); clean-copy `npm ci` + `npm run ci` PASS; t20 independently re-verified with isolated-snapshot mutation testing (t22, PASS on t20 portion).
- **Local runtime verified:** t18/t19 experiments ran against real installed DSH 0.2.1-rc.2 in isolated DSH_HOME profiles (enter/reject/relay/source.kind/plugin-record behaviors). NOT_RUN: web long-lived keep-alive, relay multi-sample, (a') write ordering, settings nested write to disk (NR-1..NR-4 in WORKFLOW-DESIGN).
- **Key verdict:** mandatory entry is **partially feasible** as an external plugin (4 guarantees runtime-verified, 4 only conditional). See WORKFLOW-ROADMAP §5.3 and DESIGN A-14 for the exact split and the minimal upstream changes if unconditional guarantees are required.
- **Blockers:** none technical. U-1..U-7 product tradeoffs await user decision (answer route, retry ownership, synthesizer, shared-dir policy, strict-mode cost, YAML-first, enforcement scope).
- **Next action:** user decides U-1..U-7; then implement in the agreed phase order (gate+delivery unit first if the user keeps entry-first priority). QA-2 independent re-review (t22b) runs in parallel.


## 2026-10-25 — First release v0.1.0

- **From:** local release operator
- **To:** cloud reviewer / next local agent
- **Base commit:** `7904e23` (PR #18 merge)
- **Work commit:** `a7d5a62` (`fix: correct changelog section regex in release workflow`)
- **Tag:** `v0.1.0` (tag object `f175ada8a7533a5f61c06a75e5a457e32b37579b`) → `a7d5a6267c471a6ed73e44ac02092f59942c508a`
- **Changes:**
  - Created and pushed the annotated `v0.1.0` tag after PR #18 merged and main CI passed.
  - First release run `40182588171` failed because the changelog-boundary regex had an extra backslash from YAML/heredoc escaping; fixed `a7d5a62`, then recreated the tag before any release existed.
  - Final release run `40182751006` created the GitHub Release and attached `dsh-grok-workflow-0.1.0.tgz`.
- **Tests run:** release workflow `40182751006` — PASS on Node 22 only, including typecheck, lint, build, `lib/` consistency, tests, package checks, and attachment. Main CI `40182707932` covered Node 22/24.
- **Test results:** PASS.
- **Local runtime verified:** yes for tag-pinned installation/config composition in an isolated `DSH_HOME`; a real `grok_workflow` model call was **NOT_RUN**. Release publication is confirmed by GitHub.
- **Blockers:** none.
- **Next action:** optionally smoke-test `dsh plugin ... add github:free6589/dsh-grok-workflow#v0.1.0` in an isolated profile; do not move the published tag.

## 2026-10-25 — Issue #17 fallback partial validation

- **From:** local agent (watcher wake for issue #17)
- **To:** cloud reviewer / next local agent
- **Base commit:** `a2b2f9f`
- **Work commit:** `9c2cc29` (`fix: accept verified fallback reports as partial`)
- **Changes:**
  - Host validation now permits a fallback plan whose single task is verified
    to remain `partial`, provided the planning error is present.
  - Non-fallback `partial` still requires both verified and failed tasks;
    fallback plans can never be `completed`; `partial` still requires at least
    one verified task.
  - Added a host-validation regression test using the real generated fallback
    report, plus the existing orchestrator coverage.
- **Tests run:**
  - `npx vitest run test/orchestrator.spec.ts` — PASS, 17 tests.
  - `npm run ci` — PASS, 6 files / 56 tests.
  - `git diff --exit-code -- lib/` — PASS after build.
- **Test results:** PASS.
- **Local runtime verified:** no; this is deterministic report validation
  logic, not a DSH lifecycle change.
- **Blockers:** none.
- **Next action:** cloud review `9c2cc29`; issue #17 remains open until review.

## 2026-10-25 — Issue #15 watcher credential-env allowlist

- **From:** local agent
- **To:** cloud reviewer / next local agent
- **Base commit:** `0476fa7` (`docs: record issue 14 redaction fix`)
- **Work commit:** `61d63b4` (`fix: restrict watcher credential env keys`)
- **Changes:**
  - Replaced the watcher's permissive env-file denylist with an explicit
    allowlist for provider credentials/configuration (`BIFROST_*`, `*_API_KEY`,
    `*_TOKEN`, `*_BASE_URL`, `*_API_VERSION`, and selected cloud settings).
  - Runtime/code-loading names such as `NODE_OPTIONS`, `NODE_PATH`,
    `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONPATH`, `PYTHONHOME`,
    `PERL5OPT`, `RUBYOPT`, `BASH_ENV`, and `ENV` are denied even if a future
    pattern becomes broader.
  - Updated `--help` and `docs/ISSUE-WATCHER.md` to state that the file is
    parsed as `KEY=VALUE`, never sourced.
- **Tests run:**
  - `bash -n scripts/watch-issues.sh` — PASS.
  - `npx vitest run test/issue-watch.spec.ts` — PASS, 2 tests.
  - `npm run ci` — PASS, 6 files / 55 tests.
- **Test results:** PASS.
- **Local runtime verified:** yes after restart at `08:54:06Z` (PID `568469`);
  the previous live wake (`WATCH_WAKE_OK`, status 0) was on the prior script.
- **Blockers:** none.
- **Next action:** cloud review `e26e297`; PR #16 needs separate README review.

## 2026-10-25 — Issue #14 credential redaction fix

- **From:** local agent
- **To:** cloud reviewer / next local agent
- **Base commit:** `99454d1a830ca42ed051d232de4104161357b581`
- **Work commit:** `24b6619` (`fix: redact non-HTTP URL userinfo and scoped tokens`); docs follow-up commit after it
- **Changes:**
  - Extended `src/redact.ts` URL userinfo matching from `http(s)` to any
    `scheme://` URI (covers `postgres`, `postgresql`, `mongodb+srv`, `redis`,
    etc., including empty-username `redis://:password@host`).
  - Added `glpat-` (GitLab) and `npm_` token patterns.
  - Mirrored the same patterns in the `redactPromptText` copy inside
    `src/script.ts`.
  - Added `redactSecrets`, `redactDeep`, and verifier/retry prompt regression
    tests with fake values.
- **Tests run:**
  - `npm run typecheck` — PASS.
  - `npm run lint` — PASS, 0 warnings/0 errors.
  - `npx vitest run test/redact.spec.ts test/orchestrator.spec.ts` — PASS,
    26 tests.
  - `npm run ci` — PASS, 6 files / 55 tests.
- **Test results:** PASS.
- **Local runtime verified:** no for this change; it is redaction logic covered
  by deterministic unit and prompt-rendering tests, not a DSH lifecycle change.
- **Blockers:** none.
- **Next action:** cloud review of `24b6619`; do not use real credentials in
  future regression vectors.

## 2026-10-25 — Implementation and local runtime verification

- **From:** local lead agent
- **To:** next local/cloud agent
- **Base commit:** none (empty repo; first push `beb55c6`)
- **Work commit:** remote `main` at final handoff (use `git rev-parse origin/main`)
- **Changes:**
  - Added the full external DSH bundle (`src/`, `lib/`, `cordis.patch.yml`,
    package manifest, README, docs).
  - Added deterministic and real-Loader tests.
  - Updated `STATE.md`, `VALIDATION.md`, `ACCEPTANCE.md`, `RESEARCH.md`.
- **Tests run:**
  - `npm run ci` — typecheck, lint, 51 tests pass.
  - `npm run test:loader` — 2 real Loader tests pass.
  - `npm pack --dry-run` — package contents verified.
  - Real DSH install from local checkout and from GitHub; `--dump-config`
    shows the bundle row in both profiles.
  - Real headless model smoke and real `grok_workflow` runs (see
    `VALIDATION.md`).
- **Test results:** PASS; GitHub Actions run `40176627051` passed Node 22/24, including watcher security tests, build-artifact consistency, and pack checks (51 tests).
- **Local runtime verified:** yes for plugin load, model route, completed
  caller-plan workflow, completed parallel timing workflow, completed
  planner-only workflow, fresh GitHub-installed workflow, a partial
  strict-failure workflow, and a live deadline cancellation.
- **Blockers:** none.
- **Next action:** independent re-review of the current head; optionally add a
  clean-profile install check to CI. Do not modify the active
  `/home/fish/dsh-layerfs` home; the verified install is isolated under the
  workspace `.dsh-home`.


## 2026-10-25 — Cloud homepage redesign

- **From:** cloud
- **To:** local
- **Task:** Beginner-friendly bilingual repository homepage.
- **Base commit:** `99454d1a830ca42ed051d232de4104161357b581`.
- **Branch:** `docs/beginner-friendly-bilingual-homepage`.
- **Changes:** Replaced root `README.md` with a shorter English quick-start homepage; added `README.zh-CN.md`; added separate English and Chinese SVG workflow illustrations; updated `package.json` files allowlist to include the Chinese README; installation command and DSH/Node requirements are derived from current project files.
- **Tests:** GitHub Actions run `40178081351` PASS on Node 22/24: `npm ci`, typecheck, lint, build, `git diff --exit-code -- lib/`, `npm test`, and `npm pack --dry-run`. No real DSH runtime is claimed for this documentation-only change.
- **PR:** https://github.com/free6589/dsh-grok-workflow/pull/16 (merged as `ea3e8e31`).
- **Next action:** PR merged. Local follow-up restored the compact configuration, disable/uninstall, testing, security, and compatibility sections in both READMEs, and corrected the install order: create a missing headless profile before `plugin add`. Keep the English and Chinese pages synchronized.

## 2026-11-03 — P0-5（首条消息不可见）已修复，等待复核与发布决定

- **做了什么**：定位并修复"`in-turn` 在 `agent/pre-step` 里 await 整个工作流 → 运行期间
  transcript 里没有 `user/message`"（`src/gate.ts`），新增回归测试，`lib/` 重建，真机前后截图入库。
  细节与命令见 [VALIDATION.md](VALIDATION.md) Round 17；源码事实见 [RESEARCH.md](RESEARCH.md) A13。
- **契约变化，接手前务必读**：`in-turn` 的 `enter.messages` 现在**只带报告**，被 claim 的用户消息
  由网关在等待前写入 surface（`commitClaimed` + `withoutClaimed`）。任何新的 pre-step 监听器
  都不要既 `session.append('user/message', …)` 又把它放进 `enter.messages`（会渲染两份）。
- **下一步（按优先级）**：
  1. 复核本次改动（单文件 `src/gate.ts` + 两个测试文件 + 文档）。
  2. 决定是否在 :3090 实例上做一次热重载验证 —— 注意会中断该实例上正在跑的运行（D-013），
     队长拍板后再做；本轮的 AFTER 证据来自隔离实例（同版本 `0.2.1-rc.2`）。
  3. `relay` / `append` 在长驻 GUI 的投递仍是 `NOT_RUN`（NR-1 剩余半边）。
- **未提交/未同步**：无。本轮未向 `[COORDINATION]` Issue 发状态块（`NOT_RUN`）。

## 2026-11-03 — route-concurrency 每路由并发上限收尾（待提交/PR）

- **做了什么**：`ModelRoute.maxInFlight?` + `HARD_LIMITS.routeInFlight={min:1,max:64}`；
  `resolveChain` 整数范围校验；script `normalizeChain` 保留/clamp 上限，
  `routeInFlight` 计数 + waiter 队列，`callRole` 选有空位的首条路由、全满等待，
  `traceRoute` 带 `skippedBusy`/`queuedMs`；report 校验透传 + `Route overflows …`
  单独渲染；records 台账透传溢出证据；`describeResolvedConfig` 显示 `(cap N)`；
  设置页每行第三框 + 中英 `capLabel/capPlaceholder/capHint` + `error.badCap`；
  导出 `GROK_WORKFLOW_ROUTE_INFLIGHT_MIN/MAX`；ARCHITECTURE 溢出-vs-回退小节 +
  CHANGELOG Unreleased + D-030 + 新手指南并发上限注记。
- **测试**：新增 `test/route-concurrency.spec.ts` 7 例（校验拒绝/溢出分流/排队峰值/
  clamp 钉死/预算不变/渲染与台账透传）；`test/client.spec.ts` bounds parity +
  `error.badCap` 双语 + 上限校验回归钉；`test/config.spec.ts` script clamp 钉。
- **下一步**：`npm run build` 重建 `lib/` → `git diff --exit-code -- lib/` 为 0 →
  `npm run ci` 全绿 → commit/push `origin feat/route-concurrency` → 开 PR
  `base:main`（标题见 STATE）→ 向 lead 回报 FROM/TO/TASK/BASE_COMMIT/WORK_COMMIT/
  CHANGES/TESTS_RUN/TEST_RESULTS/PR/BLOCKERS/NEXT_ACTION。

## 2026-11-06 — 跨轮上下文延续（v0.5，工作树内，未提交）

- **做了什么**：`src/carryover.ts`（新）+ `src/script.ts`（四角色提示词注入 + 脚本侧上限）+
  `src/run.ts` / `src/gate.ts`（只改 `runTeam` 注入，提问判定零改动）/ `src/index.ts`（工具路径注入）；
  测试 `test/carryover.spec.ts`（21 例）+ `test/gate.spec.ts`（+2 例）；
  `CHANGELOG.md [Unreleased]` 中英条目；`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE}.md`；
  证据 `docs/knowledge/evidence/carryover-e2e/`。
- **验证事实**：`npm test` 33 文件 / 568 测试 PASS；`npm run lint` 0 error（3 个既有 warning）；
  `lib/` 由 `npm test` 的 build 重建；真机两轮 PASS（Round 21），digest 在真子代理提示词里可见。
- **给下一个 agent 的三条硬约束**：
  1. 不要为了"跨轮"改 `src/records.ts` 或归档存储——那是独立任务；本轮只用读路径。
  2. `carryoverBounds` 复用 `historyTurns`/`historyChars`；若要新增配置键，必须同时改设置页
     投影断言（`test/settings-projection.spec.ts` 的封闭键清单）。
  3. 真机多轮验证不能靠"同一条命令里连发两条消息"（会被丢）；本轮的可行姿势是
     `--session-id` 续跑，且**首条消息必须先走一次 gate-off**（F1 未修）。
- **下一步**：提交 + 开 PR（`base:main`）；决定 F1 是否另立任务；`:3090` 升级仍需用户批准（D-013）。

## 2026-11-06 — 增量记忆归档：轮次结算即写入、单次会话可读回（v0.5，工作树内，未提交）

- **做了什么**：`src/memory/archive.ts` / `src/memory/recorder.ts` / `src/memory/cli.ts`（新）+
  `src/run.ts` 两处接线（引擎事件订阅、`finally` 轮次结算，另加 `runSingleCall` 成功路径的前台档
  归档）；测试 `test/memory-archive.spec.ts`（21 例）+ `vitest.config.ts`（测试期把
  `GROK_WORKFLOW_MEMORY_DIR` 指向 `tmpdir()`，避免单测写进操作者的 `$DSH_HOME`）；
  `CHANGELOG.md [Unreleased]` 中英条目；`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE}.md`；
  证据 `docs/knowledge/evidence/incremental-archive/`。
- **验证事实**：`npm test` 34 文件 / 589 测试 PASS；`npx tsc -p tsconfig.json --noEmit` 干净；
  `npm run lint` 0 error（3 个既有 warning）；`lib/memory/*` 由 `npm run build` 重建；
  真机：团队档一轮结算即写入 4 条（3 agent + 1 round），另起一个会话用
  `node lib/memory/cli.js recent` 直接读到该轮结果（Round 22）。
- **给下一个 agent 的四条硬约束**：
  1. **不要**把归档做成配置开关或挂到 `showProgress`：记忆不是展示偏好（D-036）。
  2. **不要**改成"会话收尾再写"或"dispose 钩子写"——那正是用户点名的失败模式。
  3. 读子代理产出必须走 `ctx.get('sessions')` 且在 **`agent-start`** 捕获会话对象，结论在
     `tool-call.arguments`（JSON 字符串）里而不是 assistant 文本（RESEARCH A15，三条都实测过）。
  4. 真机验证前先确认闸门开着（`grokDefault: "on"`），否则跑一整轮也不会有任何归档。
- **下一步**：提交 + 开 PR（`base:main`）；`:3090` 升级仍需用户批准（D-013）；
  两进程并发追加压测、换引擎的子代理形状复测仍是 `NOT_RUN`。

## 2026-11-08 — fix_completed_links 完成：已完成子任务保持可点击（真机 PASS，待复核/发布决定）

- **From:** 执行子代理（fix_completed_links）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD）
- **结论（`CONFIRMED`）**：已完成（及失败/取消/中断）子任务行在聊天任务列表恢复可点击并
  可打开子会话视图；真机验证见 `VALIDATION.md` Round 30，决策 `DECISIONS.md` D-040，
  机制 `RESEARCH.md` A17。改动全在插件客户端（`src/client/index.js` = `lib/client.js`），
  DSH core 零改动。
- **本轮改动**：`src/client/index.js` + `lib/client.js`（`mountPanel`，`priority: -1` 遮蔽）、
  `test/panel-links.spec.ts`（新，14 例）、`test/client.spec.ts`（+2 断言）、
  `package.json`（`test:unit` 收入新 spec）、`.gitignore`（`.v070-home/`）、
  `CHANGELOG.md` `[Unreleased]` 中英条目、`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE,HANDOFF}.md`、
  `docs/knowledge/evidence/panel-links-2026-11-08/`。
- **测试（`CONFIRMED`）**：`npm run ci` exit 0，**36 文件 / 638 测试 PASS**（typecheck 0 错，
  lint 4 warning / 0 error 基线）；`lib/` 重建幂等（md5 `3ae940ff…`，src/lib 逐字节一致）。
- **真机（`CONFIRMED`）**：隔离 `DSH_HOME=.v070-home/`，profile `panelcheck`（web 模板），
  插件 dev 安装 + `workflow-ptc` 启用 + v4-pro/agnes 模型 patch，实例 `127.0.0.1:3179`，
  headless Chromium；团队档跑到 `completed`，6/6 行可点击（含 `规划助手 已完成` 与
  `执行 failed`），点击规划助手打开 `任务团队 child 1` 子会话视图。运行中行同为按钮（对齐库存行为）。
- **诚实边界**：首轮真机 run（写文件任务）因 `/home` ro 挂载按预期 FAILED——恰好覆盖
  failed 行渲染与可点击（6/6 按钮）；`relay`/`append` 形态未单独验证（HYPOTHESIS 外推）；
  深色主题/移动端 NOT_RUN；live `:3090` 未动（D-013）。
- **并发注意**：工作树含 fix_child_names 任务的记忆条目（D-039/Round 27–29），随本轮 commit
  一并入库；`src/` 其余文件未触碰。
- **Next action**：①lead 复核 D-040/Round 30 后决定合入/发布节奏（未 bump 版本、未 tag）；
  ②`:3090` 升级仍待用户批准（D-013）——修复要在线上生效需升级 + 重载。

- **部署边界（本轮实测，`CONFIRMED`）**：本会话的 DSH 文件策略是 `workspace-write`，
  `cp -a lib/. /home/fish/dsh-layerfs/profiles/web/node_modules/dsh-grok-workflow/lib/`
  被沙箱拒绝（`Read-only file system`，含备份目录创建）。因此 live 安装副本**本轮未由我改动**；
  安装包已打到 `out/dsh-grok-workflow-0.6.0.tgz`（66 文件 / 309K，`npm pack --cache /tmp/...`，
  默认 `~/.npm` 只读）。用户执行安装 + 重启即可收口。Round 35 记录的「已装入 live 副本」
  只覆盖当时的 `lib/gate.js`，不含本轮 B 方案。

## 2026-11-13 — v0.8.0 发布后交接（给用户 / 后续代理）

- **已发布（`CONFIRMED`）**：PR #45 → `9c590f2`；Tag `v0.8.0` → 同 sha；Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.8.0 。`package.json` = `0.8.0`。
- **这次包含**：人话交付层、layered synthesis、checkpoint/resume（无用户可见面）。**不含**：
  Command Watchdog、Host Evidence Collector（记 `NOT_DONE`，没做就是没做）。
- **装到哪里了**：`~/.dsh/profiles/web` 已是 0.8.0；隔离 `v080verify` 也是 0.8.0（均从 Tag 装，未重启
  任何服务）。**没装到哪里**：`dsh-layerfs` 的 live `:3090` 还是旧版——`layerfs/.../node_modules/`
  下无此包。它要生效需两步（都由用户拍板，D-013）：①把 Tag 装入 layerfs 的 web profile；
  ②重启 `:3090`。只做其中一步不会变新人话。
- **Next action（用户）**：确认 layerfs 升级＋重启时机；`session-4c562307` 那类 PARTIAL 输出届时首行即
  人话结论（做成 N/M、没做成点名＋下一步），台账默认收起，`uncertainties` 保留。

## 2026-11-15 — wave1+wave2 收尾交接（未提交；版本与提交交 V 组）

- **From:** 收尾组 M · **To:** V 组 / lead / 后续代理 · **Base:** `HEAD = ee5e013`，`main...origin/main` 干净，
  工作树 **81 文件 / +7014 / −534** 全部未提交。
- **这条分支现在是什么**：v0.8.0 加上 wave1+wave2 —— 前台分诊（triage 四档）与 B01-B18 修复、
  人话交付层加固、checkpoint 契约对齐、以及**新增的进度 Tab**（`src/progress-tab.ts` +
  `src/client/index.js` 第三个 Tab）。`package.json` 工作树已是 `0.9.0`（V 组 bump）。
- **测过什么（`CONFIRMED`）**：`npm run ci` → `tsc` 0 错、`oxlint` 0 error / 4 warning、
  client bundle 186091 B、**48 文件 / 897 测试 PASS**，exit 0，40 s（`evidence/verify-H1/ci.txt`）。
  `npm pack --dry-run` 82 条，`lib/client.js` 与 `cordis.patch.yml` 在内，`docs/knowledge/**` 不外发。
- **真机测过什么（`CONFIRMED`）**：
  ①安装/加载/前台 —— 隔离 home + `gwverify`/`gwverify-hl` 双 profile，安装 PASS（3 bundles）、
  加载 PASS（含「关掉 `workflow-ptc` 就 pending」的对照）、`settings/describe` 23 命名空间含本插件、
  client bundle 逐字节投递、工具表含 `grok_workflow`；前台 chat 档真跑 PASS。
  ②进度 Tab —— 隔离 `dsh web` `:3210` + 真模型 + headless Chromium，**14 张截图**，
  `pending/doing/done/cancelled` 四态真机 `CONFIRMED`。
- **没测到什么（`BLOCKED` / `NOT_RUN`，别当已过）**：
  - 真模型**团队档端到端 = `BLOCKED`**：`models.fyrali.com` → `100.111.111.99`（bifrost）；
    tailnet 显示 active 但 `rx 0`、ping 100% 丢包、80/443/3000/3065/8000/8080/8888/9000/11434/4000 全关；
    DSH 原文 `Connect Timeout Error (attempted address: models.fyrali.com:443, timeout: 10000ms)`。
    备选 `127.0.0.1:3065/v1` 要网关 key（取 key = 读用户凭据，禁止）。团队档本轮用 mock 模型跑出
    `FAILED / format-error`，那是 mock 的性质，不是产品结论。
  - 进度 Tab 的 `blocked` / `failed` 两态**真机 `NOT_RUN`**（没构造失败子调用，不伪造），
    由 `test/progress-tab.spec.ts` + `test/client.spec.ts` 的 **93 个测试**覆盖。
  - live `:3080` / `:3086` / `:3090` 未部署、未重启（D-013，用户保留动作）。
- **复现命令（exact，可直接抄）**：

  ```bash
  cd /home/fish/projects_mine/dsh-grok-workflow
  npm run ci                       # 期望：48 files / 897 tests passed
  # 安装+加载（H1）
  npm run build
  export DSH_HOME=$PWD/.verify-gw/home
  dsh --profile gwverify --from-default-profile web --dump-config
  dsh plugin --profile gwverify add "$PWD"
  dsh --profile gwverify-hl --patch mock.patch.yml "你好"    # 前台 chat 档，无模型也能过
  # 进度 Tab（H2，需要本机模型网关）
  npm pack --cache .dsh-home/npm-cache --pack-destination .dsh-home/h2-pack
  dsh gwprog --from-default-profile web
  dsh plugin --profile gwprog add file:$PWD/.dsh-home/h2-pack/dsh-grok-workflow-0.8.0.tgz
  dsh gwprog --patch docs/knowledge/evidence/progress-tab-2026-11-15/gwprog.patch.yml \
      --port 3210 --host 127.0.0.1 --no-open
  cd docs/knowledge/evidence/progress-tab-2026-11-15 && node stage-a.mjs   # 然后 b/c/d/e
  ```

- **给 V 组的三条硬约束**：①节头已由你提升为 `## [0.9.0] - 2026-11-15`，M 组的 11 条条目原文躺在
  下面（1 Added + 10 Fixed，中英双语），提交时**别改文字**；②`engines.dsh` 是 `>=0.2.1-rc.2 <0.3.0`，
  与 `engines-dsh-B01.txt` 一致，别改窄也别放宽；③发布前 `npm run ci` 必须仍是 897 测试全绿——
  本轮没有为文档改动动过 `src`/`test`。
- **给用户的一句话**：本机 `:3080`/`:3090` 仍是旧版，进度 Tab 只有装新包并重启才看得见；
  `/grok` 开关在真机验证时请用**打包产物**装，别用 `link:`（会报
  `Receiver must be an instance of class Session.`，归因见 RESEARCH A20）。
- **Next action**：V 组 bump 已完成 → 填/确认 `[0.9.0]` 节头 → 提交（不 push 未授权前） → lead 决定合入与发布节奏。

## 2026-11-15 — v0.9.2 准备中：发版 HOLD、记忆已写、两条 gate 失败确认为基线既有

- **From:** 收尾组 agent-26 · **To:** lead / agent-27 / 后续代理 · **Base:** `main` = `4b92278`
  （v0.9.1 发布记录；`HEAD` = `origin/main`）。本轮**零源码改动**，只读 + 跑命令 + 写记忆。
- **现在工作树里有什么（`CONFIRMED`，`git status --porcelain`，本轮核数时）**：19 个修改文件——
  `src/` 4（`config.ts`、`index.ts`、`progress-tab.ts`、`client/index.js`）、`test/` 3
  （`client.spec.ts`、`config-limits-repair.spec.ts`、`progress-tab.spec.ts`）、`lib/` 12 个构建产物；
  未跟踪 `test/progress-connector.spec.ts`、`docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`、
  `.tmp/`。内容 = **B01/B02/B04** + 进度 Tab **脊椎整词绑定 / 详情协调块 / 连线填充+状态字形**。
  细节与行号锚点在 `STATE.md`「2026-11-15 — v0.9.2 准备中」与 `DECISIONS.md` D-047/D-048。
- **发版动作全部 HOLD（用户 2026-11-15 指令，经 lead 下达）**：`CHANGELOG.md` 未改、
  `package.json`/`package-lock.json` 仍 `0.9.1`、未 commit、未 push、未打 tag、未动 Issue #1。
  成因：用户看到 Round2 `05` 截图里的报告太机器（`stat`/`od`/`sha256`/路径/marker 直接贴给读者）。
- **写面划分（别撞车）**：人话报告改动归 **agent-27**——`src/answer.ts`、`src/report.ts`、
  `src/delivery/*`、`src/gate.ts` 调用点及其测试。收尾组不碰这四处；其余记忆文件由收尾组写。
- **测过什么（`CONFIRMED`，`TMPDIR=$PWD/.tmp`）**：`npm run ci` → typecheck 0 错；
  `oxlint` 4 warning / 0 error（4 条既有）；`npm run build` 幂等（67 个 `lib` 产物 sha256 全等，
  client bundle **204585 B**，`cmp lib/client.js src/client/index.js` 一致）；vitest
  **50 文件 / 934 测试 → 932 PASS / 2 FAIL**。
- **两条失败 = 基线既有（`CONFIRMED`，独立 worktree 对照）**：`git worktree add .dsh-home/baseline-wt
  4b92278` → `npx vitest run test/gate.spec.ts` = **2 failed | 53 passed**，与本轮同形
  （`refuses a message explicitly when the queue is full…` 稳定失败；
  `writes the answer into the session when the append strategy is selected` 基线失败、
  工作树单跑偶过）。**所以现在不能说"全绿"**：谁要在发布前说 PASS，必须先处置这两条。
- **真机证据路径（别人的成果，我只核对了目录与结论行）**：
  `docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`（隔离 `:3221`、`DSH_HOME=.dsh-home/r2`、
  profile `gwprog2`、装 `0.9.1` 打包产物、headless Chromium、13 PNG + 5 stage 日志 +
  `MANIFEST.sha256`；真机 `pending/doing/done/failed` 四态）；安装/加载/前台仍是
  `docs/knowledge/evidence/verify-H1/`。
- **复现命令（exact）**：

  ```bash
  cd /home/fish/projects_mine/dsh-grok-workflow
  export TMPDIR=$PWD/.tmp
  npm run build                                  # client bundle 204585 B；构建幂等
  npm run ci                                     # 50 files / 934 tests：932 pass / 2 fail
  git worktree add .dsh-home/baseline-wt 4b92278 # 基线对照（gitignored）
  ( cd .dsh-home/baseline-wt && TMPDIR=/home/fish/projects_mine/dsh-grok-workflow/.tmp \
      npx vitest run test/gate.spec.ts )
  npx vitest run test/progress-connector.spec.ts # 连线填充 + 状态字形 7 例
  ```

- **发版放行条件（checklist，逐条都要有证据）**：①`npm run ci` **全绿**——当前 2 条 `gate.spec`
  基线失败未处置前不放行，也不许写成 PASS；②`lib/` 幂等（build 后产物 sha256 全等 +
  `cmp lib/client.js src/client/index.js`）；③`CHANGELOG.md` 把 `[Unreleased]` 提成
  `## [0.9.2] - 2026-11-15`（Release workflow 要求该节存在、非空、且与 tag/`package.json` 同版本），
  `package.json` + `package-lock.json` 一起 bump；④真机证据：**human-only 默认形态**的截图
  （机器证据收起、Progress 详情/诊断开关里可查）——这条是用户点名的问题，没有截图不放行；
  ⑤tag 从 `main` 打，`git ls-remote --tags origin` 复核旧 tag（v0.9.1 `584dc22…` → `9103280`）未动；
  ⑥Issue #1 状态评论走 `AGENTS.md` 的 FROM/TO/TASK/BASE/WORK/CHANGES/TESTS/RESULTS/LOCAL/BLOCKERS/NEXT。
- **Next action**：①agent-27 把人话报告改完（默认只发 human 块 + 下一步，机器证据进 Progress 详情 /
  诊断开关），并说明两条 `gate.spec` 失败是否连带处理；②lead 验货后才允许 bump 0.9.2 +
  写 `[0.9.2]` 节头 + commit/push/tag + Issue 状态评论（模板见 `AGENTS.md`）；③live
  `:3080`/`:3086`/`:3090` 仍是用户动作（D-013）。
- **给用户的一句话**：这一版还没发——工作树里的东西能装能跑（真机截图在 Round2 目录），
  但报告文案要先改成"人话在前、机器证据收起来"，改完再一起发版。

## 2026-11-15 — v0.9.2 收尾发版：本地齐了（`5eb4942`），**push / tag / Issue 评论等人话真机截图**

- **From:** 收尾发版组 agent-30 · **To:** lead / 截图组 / 后续代理 · **Base:** `main` = `4b92278`
  （= `origin/main`，v0.9.1 发布记录）。**本地提交 `5eb4942`**（release-prep）+ 随后的 docs 提交
  （本段所在的记忆记录）。**远端未变**：`origin/main` 仍是 `4b92278`，没有 `v0.9.2` tag，没有
  GitHub Release，Issue #1 无新评论。
- **本轮做完了什么（`CONFIRMED`）**：
  1. `test/gate.spec.ts` 两条基线既有时序失败按 D-051 的最小改法修同步（**只改等待条件**，
     产品代码零改动）：单跑 **55/55**、全量 **51 文件 / 948 测试全 PASS**。
  2. `npm run ci`：typecheck 0 错、oxlint 5 warning / 0 error（4 既有 + 1 新）、build client bundle
     204585 B、build 幂等（`lib/` 67 产物哈希全等）+ `cmp lib/client.js src/client/index.js` 一致。
  3. `CHANGELOG.md`：`[Unreleased]` 提为 `## [0.9.2] - 2026-11-15`（94 行；Added 人话优先、
     Fixed 存量钳制 + B02/B04 + B01 + 进度 Tab 三条、Tests 两条同步修复）；**不写 layerfs 条目**（D-049）。
  4. `package.json` + `package-lock.json` 一起 bump 到 `0.9.2`（`npm version 0.9.2 --no-git-tag-version`）。
  5. Round2 真机证据（13 PNG + 5 stage 日志 + `MANIFEST.sha256` + `r2.patch.yml` + `run-state.json`）
     与新增 spec（`test/delivery.spec.ts`、`test/progress-connector.spec.ts`）一起入库；
     入库前对证据目录扫过密钥形状（`sk-…` / `Bearer …` 命中 0），`r2.patch.yml` 只写
     `apiKeyEnv: BIFROST_VIRTUAL_KEY` 名字、不含值。
- **现在卡在哪（`NOT_RUN`，唯一堵点）**：**human-only 默认形态的真机复拍**。仓库里最新真机证据止于
  11-15 12:09（`evidence/progress-tab-2026-11-15/Round2/`），全部早于 agent-27 的人话默认化改动；
  `Round2/05-chat-with-run-report.png` 就是用户点名「太机器」的那张。**需补的 6 项**见
  `VALIDATION.md` Round 40 §6（三 Tab 共存 / 默认消息只有人话块+下一步、无命令无路径无 sha 无 marker /
  `showDiagnostics` 关开对照 / ≤480 px + 深色 / 三 Tab 回归含点开子会话 / 会话事件旁证）。
- **复现命令（exact）**：

  ```bash
  cd /home/fish/projects_mine/dsh-grok-workflow
  export TMPDIR=$PWD/.tmp
  npm run ci                                        # 51 files / 948 tests PASS
  npx vitest run test/gate.spec.ts                  # 55 passed（修同步前是 2 failed）
  npm run build && git status --porcelain -- lib/   # 幂等、无未跟踪产物
  git log --oneline -2                              # 5eb4942 release: prepare v0.9.2 …
  ```

- **放行后要做的三步（照做，别改顺序、别 force-push）**：
  1. 截图组把 §6 的证据落盘（新建 `docs/knowledge/evidence/human-default-2026-11-15/`，与 Round2
     同构：PNG + stage 日志 + `MANIFEST.sha256`），并把结论补进 VALIDATION 的新 Round（状态词照
     `CONFIRMED` / `NOT_RUN` 用，别把单测结论写成真机结论）；
  2. `git push origin main` → 等 CI（Node 22 + 24）绿；再核对本地 `HEAD` 就是要发的那一个提交；
  3. `git tag -a v0.9.2 -m "v0.9.2: plain-language answer by default, one clamp table, progress tab spine/detail/connector"`
     → `git push origin v0.9.2` → 等 Release workflow 绿（它会校验 tag ↔ `package.json` ↔
     `CHANGELOG` 的 `[0.9.2]` 节、`lib/` 已提交且与构建一致、`npm test` 全绿）→ 复核
     `git ls-remote --tags origin` 里**旧 tag 未动**（`v0.9.1` → `9103280` 及更早），
     然后按 `AGENTS.md` 的 FROM/TO/TASK/BASE/WORK/CHANGES/TESTS/RESULTS/LOCAL/BLOCKERS/NEXT
     模板给 Issue #1 发状态评论。
- **写面提醒**：人话报告的源码（`src/answer.ts`、`src/delivery/index.ts`、`src/gate.ts` 调用点）本轮
  已冻结在 `5eb4942` 里；要再改就得走新的提交，别在工作树里改完直接打 tag（Release workflow 会因
  `lib/` 不同步而拦下，`git diff --exit-code -- lib/` 那一步会红）。
- **别碰**：已发布 tag（`v0.9.1` 及更早）、DSH core、live `:3080` / `:3086` / `:3090`（D-013）、
  npm 发布与仓库可见性。

## 2026-11-15 — v0.9.2 已发布（`5eb4942` / tag `v0.9.2`）；下一版从这里起

- **From:** 发版执行组 agent-38 · **To:** lead / 下一个代理。**远端已变**：`origin/main` = `98f26a8`，
  `tag v0.9.2` → `5eb4942`，GitHub Release published `2026-11-15T09:22:08Z`
  （`dsh-grok-workflow-0.9.2.tgz` 464,763 B）。CI `43698707930`（Node 22+24）与
  Release `43698836519` 均 success；旧 tag 全部未动（`v0.9.1` → `584dc22` / peel `9103280`）。
- **`5eb4942` 与 `98f26a8` 的关系**：`5eb4942` 是 release-prep 提交（tag 打在它上面），
  `a591817`、`4ab0cb3`、`98f26a8` 是它之后的三个人 docs 提交（记忆记录 / `.gitignore` / 人话证据）。
  所以 **Release 的源码树不含证据目录**，证据在 `main` 历史里 —— 这是刻意的，理由：tag 与
  `package.json`、`CHANGELOG [0.9.2]` 必须同版本，而证据是事后落盘的。
- **证据**：`docs/knowledge/evidence/human-default-2026-11-15/`（原名 `human-report-2026-11-15`，
  落盘改名，`LANDING.md` 逐项写明改了什么、没改什么）+ `MANIFEST.sha256`（85 文件 + 两个 `lib` 哈希，
  `sha256sum -c` 全 OK）。覆盖面与**三项缺口**见 VALIDATION Round 41 §2：人话块首轮 `CONFIRMED`、
  第 2/5 轮被反证；`showDiagnostics` 开态台账只在转写侧可拍；完成行点开子会话未在本实例重拍。
- **`.tmp` 已清空并 gitignore**：`TMPDIR=$PWD/.tmp` 仍是本仓库约定的测试临时目录，用法不变；
  清空时删掉的内容（13 MB / 97 项）与凭据布尔检查结果见 STATE 本轮段。下次要复现真机证据，
  照 `human-default-2026-11-15/README-r2.md` 的命令重建打包产物与隔离家即可。
- **复现命令（exact）**：

  ```bash
  cd /home/fish/projects_mine/dsh-grok-workflow
  export TMPDIR=$PWD/.tmp && mkdir -p .tmp
  gh run list --commit "$(git rev-parse HEAD)"        # CI 对当前提交
  git ls-remote --tags origin                          # 旧 tag 未动 + v0.9.2 peel 到 5eb4942
  ( cd docs/knowledge/evidence/human-default-2026-11-15 && \
    grep -vE '  lib/(client|progress-tab)\.js$' MANIFEST.sha256 | sha256sum -c - )
  ```

- **下一步（不做也不算欠账，但别假装做过）**：①用户把 live 实例升到 `v0.9.2` 并重启（D-013，用户动作）；
  ②若要关闭 §2 的三项缺口，需要新一次真机复拍 + 可能改交付层的 relay 文案（那是设计决定，先问用户）；
  ③D路/记忆侧若已写过「v0.9.2 = HOLD」的段落，以本轮 STATE / VALIDATION Round 41 为最新事实。
- **别碰**：已发布 tag（`v0.9.2` 及更早一律不动）、DSH core、live `:3080`/`:3086`/`:3090`、
  npm 发布与仓库可见性。

## 2026-11-15 — A/B/C 落地待收口（未提交/未push/未发版，`CONFIRMED` 本地绿）

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `main` = `129a92e`（v0.9.2 已发布，
  本轮在其上工作，未动 tag）。
- **做了什么**：答案置顶（delivery 首句答案、计数沉尾、4 类 scrub、关键证据块删除）、
  synthesizer HARD RULES + 宿主风格 guardrail、主会话先说话边聊边干（`receipt-then-relay` +
  首答现场写 + 模板兜底明说 + 整轮取消窄化重起）。`answerStrategy` 默认值、`full` 管线、
  全部上限与开关默认未动。CHANGELOG `[Unreleased]` + ARCHITECTURE 策略段已写。
- **验证**：`npm run ci` 全绿（typecheck 0 错 / lint 4w0e / 51 文件 948 测试 PASS），
  详见 VALIDATION Round 42；实现期抓到并修好 `$1` 注入与 `核验通过` 自杀两个 bug。
- **没做什么（`NOT_RUN`）**：commit / push / tag / Release（等用户指令）；真机 Web 长驻验证；
  headless e2e 回归。**不要**以"测试全绿"为由直接发版。
- **Next action（用户一步）**：先看行为是否对味（问一个天气类问题：首屏应是 `答案：…` 而不是
  `做完了 N 项…`；team 档应先回一句现场写的人话再后台跑）。对味了说一声，我再走提交→push→
  CI→发版流程；不对味直接说哪句别扭，我改。

## 2026-11-16 — 进度 Tab A+C 待收口（未提交/未push/未发版，`CONFIRMED` 本地绿 + 隔离真机绿）

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `main` = `129a92e`（v0.9.2 已发布）。
- **做了什么**：A/B/C（答案置顶 + 边聊边干，未提交）+ 进度 Tab A+C（七段脊 + 单展开分支 + 窄屏竖排，只改 `src/client/index.js` 渲染 + CSS，`test/client` + `test/progress-connector` 同步，CHANGELOG `[Unreleased]` +1 条）。`npm run ci` 全绿（51/951），隔离 `acgtest:3225` 真机全过。
- **验证证据**：`.dsh-home/acg/shots/`（`03/04/05/10/11/12/13/21/22/23` + DOM 日志）——注意该目录在 `.gitignore` 外？（`TMPDIR=$PWD/.tmp` 约定；`acg/` 是否入库由发版组定，默认不入库）。
- **没做什么（`NOT_RUN`）**：commit / push / tag / Release（等用户指令）；live `:3080` 更新（禁重启，见 D-053——新代码无已验证免重启路径，要么用户重启 DSH，要么接受文件换了进程仍跑旧模块）。
- **Next action（用户，两步）**：① 看一眼截图（`13-settled-wide`  settled 脊 / `11-spine-narrow` 窄屏竖排），对味了说"提交发版"；② live 更新方式二选一：等下次 DSH 重启自动生效，或用户亲手重启。

## 2026-11-16 — v0.9.3 已发布 + live 文件已换（待用户重启生效）

- **From:** lead · **To:** 用户 / 后续代理。**远端已变**：`origin/main` = `593f89e`，
  `tag v0.9.3` → `593f89e`，GitHub Release published（asset `dsh-grok-workflow-0.9.3.tgz`
  483122 B）。CI `43738470054`（Node 22 + 24）与 Release 均 success；旧 tag 全部未动。
- **内容**：CHANGELOG `## [0.9.3]` 两条 Added（答案置顶 + 边聊边干 / 进度脊手风琴），
  package 0.9.3。A/B/C + 进度 Tab A+C 全量（含测试 951、隔离真机复验 Round 43）。
- **live**：本机 `web` profile 包已换成 0.9.3（md5 与仓库一致），**但 `:3080` 进程没重启**，
  新 UI 在用户下次重启 DSH 后才生效 —— 这是唯一剩下的用户动作。
- **别碰**：已发布 tag（v0.9.3 及更早一律不动）、DSH core、live 进程的 kill/重启（用户亲手做）、
  npm 发布与仓库可见性。

## 2026-11-16 — 补交步 A 已实现未发布（`npm run ci` 绿，真机 NOT_RUN）

- **From:** lead · **To:** 用户 / 后续代理。**远端未变**：`origin/main` = `01f86de`，
  本轮 5 文件未提交（`src/script|report|types` + `test/failure-paths` + CHANGELOG `[Unreleased]`）。
- **做了什么**：失败 session `3c296b9a`/seq=5 落盘确证"数据全对、只缺交卷"后，
  按用户拍板 A 实现同 attempt 补交（D-054）：格式缺失补一次、不花重试额度，
  再缺才进正常重试；核验严格性零动。单测 3 例全绿。
- **没做什么（`NOT_RUN`）**：隔离真机复验（建议发版前 acgtest 跑一次三城天气）；
  B（失败行分类显示）；commit/push/tag/Release（等用户指令）。
- **Next action（用户）**：说"提交发版"就走 commit→push→CI→tag→Release→live 换文件
 （live 仍需用户重启 DSH 生效，沿 D-013/D-053）。

## 2026-11-17 — T4 测试迁移交接（agent-5 → lead）

- **状态**：T4 测试迁移完成。`npx tsc` 干净，`npx vitest run` 51/951 全绿（串行）。
- ** contract 提醒**：全量套件对并行负载敏感（deadline/fake-timer 用例在 CPU 争用下 flake）；
  复验请串行跑 `npx vitest run`，不要与其它 vitest 并行。
- **工作区状态**：70+ 文件未提交（含 T1/T2/T6 + T4 + sibling 的 in-turn 测试改写 + 本轮 STATE.md）。
  `lib/` 产物是旧的，发版前需重编。`settings-simple-mock.html`（??）是杂散文件，与 T4 无关。
- **Next action（lead）**：决定提交/发版节奏；T5（client 页面）仍可并行，不碰 src 契约。

## 2026-11-17 — 设置页瘦身 + supervisor 未提交（待用户验收，`CONFIRMED` 本地绿）

- **From:** lead · **To:** 用户 / 后续代理
- **状态**：工作树未提交（基线 `ae0c6d3` v0.9.4），`npm run typecheck` 0 错、
  `npx vitest run` **51 文件 / 951 测试全 PASS**、`npm run build` 成功、
  `cmp src/client/index.js lib/client.js` 一致。CHANGELOG `[Unreleased]` 有
  Added（supervisor）+ Changed（瘦身迁移）双语条目。
- **内容**：①设置页 3 卡（总开关 auto/full、执行模型 5 角色 × fallback + 监督、
  高级两数 1–100/def10），无 hint/Danger/只读区；②24 键删 + 固定值（见 D-055）；
  ③supervisor 第五角色（见 D-056）；④上限 100/默认 10（AGENTS.md 已同步）。
- **Next action（用户）**：看 `settings-simple-mock.html`（定稿 mock，可点）→
  若认可，回复"提交"，lead 即 commit（不 push/tag，发版另听指令）。
- **Next action（后续代理）**：先读本轮 STATE/DECISIONS D-055/D-056；
  真机验证 `NOT_RUN`（acgtest 新 profile + 新端口，老规矩）；live `:3090` 未动。

## 2026-11-17 — v0.10.0 发布（真机 acgtest95 / :3231 → push / tag / Release）

- **From:** agent-25（verify_push_release，lead 委派）· **Base:** `3d9275a`（T1–T6）·
  **发布准备提交：** 见本轮 `release: prepare v0.10.0 …`。
- **做了什么**：
  1. 真机验收（新 profile + 新端口，老规矩）：`DSH_HOME=.dsh-home/acgv095`、profile `acgtest95`、
     `:3231`、宿主 `dsh 0.2.2-rc.3`、本地网关 `127.0.0.1:18088`（键只在环境，不落盘）；
     `npm pack`（472,958 B）→ `dsh plugin add file:…` → 已装 `lib/client.js` md5 与仓库一致；
     `--dump-config` = 8 键 + `workflow-ptc disabled:false`；浏览器：client bundle 被请求、
     Plugins 页出现 Grok workflow、设置页 8 键 + 五角色链、两次真实工作流（7 段脊 / 首答 7s /
     后台 1/1 verified，台账 `archive.jsonl`）。完整命令与结果见 VALIDATION Round 47。
  2. `npm run ci` 全绿（typecheck 0 错、lint 4w/0e、51 文件 / 951 测试、build 幂等、
     `lib/` 无未提交差异）。
  3. 发版准备：`0.9.4 → 0.10.0`（`package.json` + `package-lock.json` 联动）、
     `CHANGELOG` 插入 `## [0.10.0] - 2026-11-17`、README 英/中配置参考按 8 键重写、
     `docs/LOCAL-TESTING.md` 配置段同步；`settings-simple-mock.html` 仍未跟踪、不入库。
  4. push（fast-forward，未 force）→ `v0.10.0` tag → Release 工作流（tag ↔ package.json ↔
     CHANGELOG ↔ `lib/` 四项校验后建 Release）。
- **版本选择的理由（D-057）**：24 个配置键被删除且旧补丁会被拒载 = 对 0.x 用户是破坏性变更，
  按 semver 走 minor（`0.10.0`），不用 patch。
- **没做（`NOT_RUN`）**：live `web` 运行实例（`:3080`）换装/重启 —— 用户保留动作（D-013）；
  Progress 页 Execute/Verify 段成员不渲染的定位（现象与台账矛盾，见 STATE/VALIDATION，
  下一个接手者优先查这个）。
- **接手提示**：本机隔离实例默认仍在 `127.0.0.1:3231` 上跑（`DSH_HOME=.dsh-home/acgv095`）；
  收尾已 kill 并删 `url.txt` 里的 token 文本；`.dsh-home/`、`.tmp/` 均 gitignore，不入库。

### 发布结果（同日，`CONFIRMED`）

`origin/main` = `b2c4515`（push `ae0c6d3..b2c4515`，fast-forward）；CI `43946211999` 双绿；
tag `v0.10.0` → `b2c4515`（object `63c04aa`），新 tag，旧 tag 快照对照未动；
Release `43946446721` 绿，published 2026-11-16T20:08:07Z，asset `dsh-grok-workflow-0.10.0.tgz`
472,274 B（包内 `package.json` = 0.10.0，`lib/client.js` md5 `d1e2df8c…` 与仓库一致）；
Issue #1 状态评论 issuecomment-6927842856。

## 2026-11-19 — RSI round 17 phase-1：Q5/F1 修完待发版（`0.11.16` 走 R6）

- **From:** lead · **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：round 17 四个验证片跑完（`.rsi/evidence/round-017/`）后，对两个
  FAIL 修了产品代码：`isLoopHeartbeat` 接受 DSH 包装形状（`src/loop.ts` + 回归 3 条）、
  设置面说法统一 11/13（`src/config.ts` / `settings.ts` / `client/index.js` 注释 +
  `describeSurface` 新文案 + 两处测试显式断言）、README 计数 62/1142、
  `CHANGELOG [Unreleased]` 补两条 Fixed（双语）。`npm run ci` exit 0 =
  **62 文件 / 1142 测试 PASS**。记忆：D-073、A28、VALIDATION Round 62、STATE 已更新。
- **没动**：`.rsi/ROUND.md` / `ledger.jsonl`（等 R6 写 round 17）、版本号（仍 `0.11.15`）、
  tag、Release。`src/index.ts:292` 注释未动（仍 HYPOTHESIS）。
- **Next action（phase-2，发版）**：跑 `npm run ci` 确认仍绿 → 走 R6（`finish-round.py --round 17
  --version 0.11.16`）→ `commit + tag v0.11.16 + push` → 看 Release workflow 建 Release →
  装 `…#v0.11.16` 验证。发版需用户授权——本轮任务文本已含“做完之后提交 tag”。
- **风险提示**：`.rsi/evidence/round-017/heartbeat-live/instance/` 下曾有三份凭证文件
  （`.token` / `.cookies.json` / `.dsh-home/.credentials.yaml`，审计只做存在性检查）。
  该片称收尾时已删；发版前用 `git status` + secret 扫描确认它们不在提交里
  （`finish-round.py` 自带 secret 扫描，红即拒）。

## 2026-11-19 — RSI round 17 发版落地：`v0.11.16` 已发布 + tag 安装验证 PASS

- **From:** lead · **To:** 用户 / 下一轮接手者
- **落地（`CONFIRMED`）**：R6 `finish-round.py --round 17 --version 0.11.16` 一次过——
  commit `63a4fbb`、`push origin main`、annotated tag `v0.11.16` 已推。
  远端 CI run `44440179151` = **success**；GitHub Release 已建（Latest，
  asset `dsh-grok-workflow-0.11.16.tgz`，`## [0.11.16]` 双语节全文展示）。
  `v0.11.14` 仍无 Release、原地未动；无 force-push；无 npm 发布。
- **tag 安装验证（`CONFIRMED`，本轮补做）**：`dsh plugin --profile tagcheck add
  github:free6589/dsh-grok-workflow#v0.11.16` exit 0（仅 peer 警告 F3）；
  bundle 行出现；实例干净启动（0 pending）；`settings/describe` 有 `grok-workflow`
 （`autoGenerate: true`，投影 **11 键**，与文档“11/13”说法一致）；
  假会话 id 的 `open` 被 Schedule admission 拒绝（`loop/schedule-refused`，
  行不落地——熔断语义本身）；真会话 id 的端到端已在 round-017 heartbeat-live
  片用本树构建验证过（`session-48df3c0a-…` open→投递→turn→close→删行）。
  残留已清（`.tmp/tagcheck-*` 全删）。真模型整轮 / GUI 点击 / rrule 定时到点仍 `NOT_RUN`。
- **Next action**：P3-01（设置页逐路由上限与死线字段文案）或 P3-02（进度页详情行）；
  `src/index.ts:292` 注释仍 HYPOTHESIS，改它要连 `lib/` 重建，留给下次动 `src/` 的人。

## 2026-11-19 — RSI round 19：载入校验的第五个角色（`CONFIRMED` 实现 + 验证，发版待 R6）

- **From:** agent-2（执行代理）· **To:** 用户 / 下一轮接手者
- **为什么做这个而不是 P3**：待办池里 P0/P1/P2 已清，P3-01/P3-02 是文案与面板详情行；
  但 `roles.supervisor` 不在载入校验里属于「说法与实测冲突 + 错误配置延迟到该任务干完才爆」，
  按 P0（错误行为 / 假陈述）优先于 P3。pool 里这条本来就是 `R5 PENDING`。
- **落地（`CONFIRMED`）**：`src/settings.ts` `ROLE_ORDER` 五角色；`test/config.spec.ts`
  五角色用例；`test/route-concurrency.spec.ts` 空 cap 提示覆盖 supervisor；README 中英、
  `docs/ARCHITECTURE.md`、`DECISIONS.md` D-075、`VALIDATION.md` Round 64、本文件与本轮
  STATE/CHANGELOG。`lib/` 只变 `settings.js`（+ `.map`）三个文件。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0，63 文件 / 1155 测试（基线 1154）；
  红→绿证据 `.rsi/evidence/round-019/`（`red-spec-run.txt` / `green-spec-run.txt` /
  两个探针 / `lib-build-idempotence.txt`）。
- **没动**：P3-01/P3-02 仍 OPEN；`src/index.ts:292` 注释仍是 HYPOTHESIS；没有碰任何 profile、
  Schedule 行、`cordis.patch.yml`、`.github/`。
- **Next action**：R6 发 patch `0.11.18`（`finish-round.py --round 19 --version 0.11.18`），
  然后把 P3-01/P3-02 之一作为下一轮主题。

## 2026-11-19 — RSI round 19 发版落地：`v0.11.18` 已发布（`CONFIRMED`）

- **From:** agent-2（执行代理）· **To:** 用户 / 下一轮接手者
- **落地（`CONFIRMED`）**：R6 `finish-round.py --round 19 --version 0.11.18` 一次过——
  commit `3b131c4`，`push origin main`（快进 `6ee2e68..3b131c4`），annotated tag `v0.11.18`
  （object `40be048`，peel `3b131c4`）已推。远端 CI run `44465623532` = success；Release run
  `44465627146` = success，Release 已建（非 draft/prerelease，asset
  `dsh-grok-workflow-0.11.18.tgz`，560685 B）。提交后 `npm run verify:lib` = `lib/ at 3b131c4
  is the build of src/ at 3b131c4 (149 files, byte-identical)`。老标签未动，无 force-push，
  无 npm 发布。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = 63 文件 / 1155 测试 PASS（基线 1154）；oxlint
  22 warnings / 0 errors；`npm run build` 两次产物 `diff -r` 为空。
- **评审**：R5 第 1 轮 FAIL（4 条文档准确性，全在“说法与实测”上：错误断言、会把 supervisor
  门悄悄关掉的迁移建议、README 里不可能成立的模型条件、把 per-task 说成整轮末尾），修完后
  第 2 轮 PASS。教训写进 `VALIDATION.md` Round 64：**迁移建议要对着运行时路径核一遍，不能
  只对着载入期注释写**。
- **Next action**：`src/delivery/index.ts:695` 与 `src/run.ts:141` 仍只列四个角色（同一类缺陷，
  review 顺带确认），各开一轮；P3-01/P3-02 仍未动；`src/index.ts:292` 注释仍 HYPOTHESIS。
