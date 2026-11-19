# Round 17 · Go / No-Go 清单（attempt 2）

基线：`HEAD` = `origin/main` = `git ls-remote` = `4db78f41f00416abe55baa1ec9403c4fa1a63379`。
本版判定时间 2026-11-19T08:49–08:53+08:00。上一版（attempt 1）快照停在 08:42:50；
本版把全部只读命令重跑了一遍，并复核了 `heartbeat-live` 在 08:43–08:49 之间新增的产物，
所以片 B 的结论从「还不能判」推进到「机制可判、更强的宣称仍不可判」。

## 一、四道共同门（重测于 08:50:06）

| 门 | 标准 | 实测 | 判定 |
| --- | --- | --- | --- |
| G1 基线唯一 | `HEAD` 与 `origin/main` 同一个 SHA，且远端确认 | `git rev-parse HEAD`、`git rev-parse origin/main`、`git ls-remote origin refs/heads/main` 三者都是 `4db78f4` | **PASS** |
| G2 树干净 | 已跟踪文件 0 改动 | `git status --porcelain --untracked-files=no` = 0 行；`git diff --stat HEAD` 空 | **PASS**（dirty 只在未跟踪的 `.rsi/evidence/`、`segment-5` 遗留、被明文豁免的 `settings-simple-mock.html`） |
| G3 产物不 stale | `lib/` 是当前 `src/` 的构建 | 工作树 `lib/loop.js` / `lib/loop-brakes.js` 的 blob 与 `HEAD:` 同名 blob 相同（`33f3cb3b…` / `3adb6cce…`），**且这两个文件在 08:47 被 `ci` 片重建过之后仍然相同**；`callSchedule` 11 vs 11 且逐项对齐 | **PASS** |
| G4 记忆与代码对得上 | 点名的 6 条记忆存在且能在代码里找到对应 | 见 `memory-vs-code.md`：A24 `:511-665`、D-066 `:1185-1256`、D-068 `:1303-1345`、D-069 `:1346-1396`、D-071 `:1437-1525`、D-072 `:1526-1579`，全部存在 | **PASS** |

## 二、本片（baseline）：GO — 已完成

交付物在本目录：`NOTES.md`、`git-state.txt`、`memory-vs-code.md`、`loop-artifacts.md`、
`go-no-go.md`、`fingerprints.sha256`。写操作全部落在这里，`git status` 里是 6 个 `??`；
已跟踪文件 0 改动。13 个关键文件的 sha256 与 attempt 1 逐位相同（重建过 `lib/` 也没变）。

## 三、其他三片

本轮的片没有计划文件可查：在仓库的 `*.md` / `*.txt` 里排除 `.worktrees/`、`.dsh-home/`、`.tmp/`、
`out/` 与 `.rsi/evidence/` 后，`grep -rni 'round.17'` 只剩 5 行 0.2.x 时代的老记录
（`docs/knowledge/VALIDATION.md:1458` 与 `:1754`、`STATE.md:325` 与 `:526`、`HANDOFF.md:1082`，
讲的是 2026-11-02/03 的 P0-5），没有任何本轮分片清单。
能按证据目录命名的只有两片，第三片只能按其留在树上的唯一线索判。

### 片 A — `ci`（`.rsi/evidence/round-017/ci/`）：**GO**

| 判据 | 实测值 | 出处 |
| --- | --- | --- |
| `npm run ci` | `CI-EXIT=0` | `ci/ci.txt` 末行 |
| 测试 | 62 文件 / 1139 测试全通过，24.35s | `ci/ci.txt:359-362` |
| lint / typecheck | 22 warnings / 0 errors；tsc 无诊断 | `ci/assertions.txt` §1-§2 |
| `verify:lib` | `lib/ at 4db78f4 is the build of src/ at 4db78f4 (145 files, byte-identical)` | `ci/verify-lib.txt` |
| 构建幂等 | 两次 build 的 `lib/` 清单 diff 均为 `DIFF-EXIT=0` | `ci/lib-idempotence-diff*.txt` |
| 跑完不弄脏树 | `TRACKED-PORCELAIN-LINES=0` | `ci/git-state-post.txt` |

我复核的是它的原始输出，没有重跑（`npm run ci` 会重写 `lib/`，与本片写权冲突）。
独立复核两点：① `lib/` 两个文件在它 08:47 重建后 blob 仍等于 `HEAD`；② 它标红的 README
测试数问题我用自己的命令复现了（见 §五-1）。

### 片 B — `heartbeat-live`（`.rsi/evidence/round-017/heartbeat-live/`）：**GO（机制）/ NO-GO（“真实操作者心跳”这一更强宣称）**

这一片在 08:43–08:49 之间真的跑出了一次投递，证据链完整可查（下面是文件坐标，不是转述）。
**它到 08:53:47 仍在写、仍在重启探测插件**（08:49 之后又出现 `res-12`…`res-21`、两条新的 Schedule 行，
以及 `probe.log` 的新 `probe applied`），所以下面的是 08:54 的快照判定，最终结论仍归该片自己的收尾。

| 环节 | 证据 | 内容 |
| --- | --- | --- |
| 隔离实例 | `instance/dsh-home/`、`instance/dump-config.yml` | 独立 `DSH_HOME`（A23 的做法），profile `live-verify` |
| 测试插件是真插件 | `probe/index.js:1-20`、`:16-17` | 注释写明 “mocks nothing”；它 `inject: ['schedule','sessionController']`，动态 import 的是仓库 `lib/loop.js` 与 `lib/loop-surface.js` |
| 用户独占门（真机） | `qa/res-6.json`、`qa/res-7.json` | 模型工具开循环 → `refused / loop/user-only`；带 actor 开 → 同样 `loop/user-only`。与 D-066/D-069 的约束一致 |
| 行被开出来 | `instance/dsh-home/storages/schedule.json`（08:49 读取时） | 1 条 `kind: rrule`、title `Loop heartbeat`、`RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=10`、`status: active`、target = 本会话。该文件随后被该片继续改写（08:53 已有新行），所以这是投递时刻的快照 |
| 投递发生 | 同上 `lastDelivery` | `deliveredAt: 2026-11-19T00:49:06.884Z`，`messageId: 8193fbae-a85b-400c-adc5-06b30755749f` |
| 投递进了会话 | `instance/dsh-home/sessions/…/session.v4.jsonl.zstd` 第 25-32 行 | `turn/start turn=2` → `user/message` 的 `source = {"kind":"schedule"}`、`id = 8193fbae…`（与 `lastDelivery.messageId` 同一个）→ `request/header reason=resume` → `assistant/message`（stub 回 `STUB_HEARTBEAT_ROUND_OK`）→ `turn/end completed` |
| 真模型调用形状 | `stub/stub-requests.jsonl` 第 2 条 | `POST /v1/chat/completions`，`messageCount=8`、`toolCount=33`、工具表里有 `grok_loop` —— 这一轮确实把插件的工具面交给了模型 |

**能判的**：投递 → `kind: 'schedule'` 的会话消息 → 新一轮（turn 2）→ 模型调用 → 轮次正常闭合，
这条链路在隔离实例里跑通了；用户独占开循环的限制在真机上也拦住了两次代理尝试。
这正是 A24/D-066/D-071 一直缺的那一段证据。

**判 NO-GO 的部分**（都是这一片**没有**证明的，不能替它写成 PASS）：

1. **不是定时器到点**。任务 `scheduledAt = 2026-11-19T01:46:43Z`，而 `lastDelivery.scheduledAt = 00:49:06.754Z`
   —— 投递发生在计划时刻之前，是 probe 调 `schedule.run({id})` 手动触发的（`probe/index.js:72-73`，
   `qa/probe.log` 的 `op=run seq=9/11`）。rrule 自己到点那条路径仍未观测。
2. **不是真模型轮**。模型是 `probe-stub`，回复是固定串；`assistant/message` 的 `usage` 是 `inputTokens: 1`。
3. **不是操作者的第一跳**。行是 probe 以「无 actor」调 `service().open()` 开出来的（`probe/index.js:78-85`），
   与 HTTP 路由同一条路径、同一套授权，但动作不是人在 GUI 上点的；D-066 把真实环境里的第一跳定为操作者动作。
4. **收尾跑的是用例，不是最终态**。08:50:45 的 `forget`（`res-17`，`deleted: 1`，日志
   `loop archived with session …: deleted 1 heartbeat`）与 08:50:56 的 `stopall`（`res-19`，`deleted: 1`，
   `loop cleanup (probe unload)`）都成功了，`res-14` / `res-18` 的 catalog 随后为空；但紧接着又建了
   新行（`res-16` 的 `schedule-2bc37113…`、`res-21` 的 `schedule-81b3fabb…`），说明它在连续跑用例。
   它到 08:53:47 还在重启探测插件（`probe.log` 的 `probe applied`），**仍在运行**。本审计跑在
   `bwrap --unshare-pid` 里，看不到那个实例的进程，所以「有没有留后台活」我不能判——只能记「它此刻还在动」。

**一条待该片解释的观测**：`qa/res-12.json` 的 `heartbeat-probe` 对一段 `[SCHEDULE REMINDER]` 文本返回
`isLoopHeartbeat: false`。这段文本里内嵌的是 `reminder_prompt_json: "[grok-workflow loop] Loop heartbeat…"`，
而 `isLoopHeartbeat` 是按前缀判定的；到底是 probe 取样方式（把包装后的提醒文本当成心跳正文）还是判定函数
对包装文本不认，要看该片的结论。本片只登记现象，不判它成立或不成立。

**凭证卫生（必须处理）**：`instance/.token`、`instance/.cookies.json`、`instance/dsh-home/.credentials.yaml`
三份都**非空存在**（我只做了存在性检查，没有读取、没有回显任何内容）。按 `AGENTS.md`
「Never write … tokens … into … logs, or reports」，这个目录不能 `git add`；该片收尾时应删掉这三份
并轮换对应凭证，`.rsi/evidence/round-017/heartbeat-live/` 才能进入任何提交。

### 片 C — 第三片：**NO-GO（不可判定；若它就是 ci 片引用的 phase-2，当前也不具备 GO 条件）**

树上的实况：没有第三个证据目录、没有 round 17 的片名清单。唯一指向它的线索是 `ci` 片自己的
两句话（`ci/NOTES.md` §1 末行与 §4 末段）：它按「phase-2 的『门禁红则不发版』」与
「phase-2 时文档数字与实测一致」在自我约束——说明存在一个 tree 外的 phase-2 计划，但计划文本
不在仓库里，我不能替它命名。

所以这一片给两个判定，按它最可能的身份分：

- **身份不明时：NO-GO（不可判定）**。没有片名或证据目录就没有验收对象，判 GO 等于编证据。
- **若它就是 phase-2（发版/文档收口）：NO-GO**。两条硬理由，都可复核：
  1. `README.md:345` 仍写 “1081 deterministic tests across 60 files”、`README.zh-CN.md:334` 仍写
     “60 个文件 / 1081 个确定性测试”，实测是 **62 文件 / 1139 测试**（`ls test/*.spec.ts | wc -l` = 62，
     测试数见 `ci/ci.txt:359-362`）；且两份 README 都没有提到 `ci` 链里的 `verify:lib`
     （`grep -c verify:lib README.md README.zh-CN.md` = 0 / 0）。带这种数字发版就是把失真写进版本。
  2. 发版本身要授权：`AGENTS.md` 要求显式用户授权，D-070 只授权了 `0.11.15` 那一次；
     round 16 之后按版本纪律下一个应是 patch（`0.11.16`），但本轮没有任何授权记录。

补判条件很简单：给出片名（或它应产出的证据目录），我按上面同样的四道门 + 该片自己的验收项重判。

## 四、一句话

四道共同门全 PASS；`baseline` 与 `ci` 两片 GO；`heartbeat-live` 的**机制** GO、**“真实操作者心跳”** NO-GO；
第三片无名，NO-GO；它若真是 phase-2，先修 README 两处数字并拿到发版授权，才谈得上 GO。

## 五、本版新增的两条树上事实（都不在本片写权内，只记录）

1. **README 测试数失真（P1 文档/版本不一致）**：`README.md:345` / `README.zh-CN.md:334` 写 60 文件 / 1081 测试，
   实测 62 文件 / 1139 测试；差的两个文件正是 round 16 新增的 `test/loop-brakes.spec.ts`、
   `test/loop-runtime-wiring.spec.ts`。`docs/knowledge/STATE.md:11` 记的是 62/1139，所以过期的只有 README。
   修复动作属于 docs 写权，本片只读。
2. **证据目录里有凭证**：见片 B 的「凭证卫生」。这不影响基线判定（未跟踪、未提交），但影响「能不能提交这一轮」。

## 六、与 attempt 1 的差异

| 项 | attempt 1（08:42:50） | attempt 2（08:53） |
| --- | --- | --- |
| `heartbeat-live` | 只有 profile 配置与脚本，`results/` 空，判「不能由代理自证通过」 | 有一次手动投递的完整链（`schedule.json` + transcript turn 2 + stub 请求），机制可判 GO |
| 第三片 | 完全不可判定 | 仍不可判定，但补出了唯一线索（ci 片的 phase-2）与「若是发版则 NO-GO」的两条可复核理由 |
| README 失真 | 未记 | 已实测记录（§五-1） |
| 凭证 | 未记 | 已做存在性检查并记录（不读取内容） |
