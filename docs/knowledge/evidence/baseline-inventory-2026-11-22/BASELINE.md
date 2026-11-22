# 仓库基线冻结与 RSI 停止快照

> 只读核查产物。任务 `baseline_inventory`。不产生 commit / tag / release，不改 `schedule`，
> 不改源码与测试。本文件是后续任务的共同参照点。

采样时间：`2026-11-22T00:50:54+08:00`（Asia/Singapore）
仓库：`/home/fish/projects_mine/dsh-grok-workflow`

## 1. 分支与 HEAD

| 项 | 值 |
| --- | --- |
| 当前分支 | `main` |
| HEAD | `bd32506e127fbf585de95a0b05925610594a0ec2` |
| HEAD 提交 | `bd32506 stop(rsi): operator stop switch for the self-iteration loop` |
| HEAD 作者 / 时间 | fish / 2026-11-21 18:13:29 +0800 |
| 上游 | `origin/main` |
| 未推送提交 | 0 |

## 2. 283577a 之后的新增提交

`283577a` 是 tag `v0.12.19` 指向的提交。

```
$ git rev-list --count 283577a..HEAD
1

$ git log --oneline 283577a..HEAD
bd32506 stop(rsi): operator stop switch for the self-iteration loop
```

> 结论：**新增 1 个提交**（`bd32506 stop(rsi): operator stop switch for the self-iteration loop`）。
> 该提交就是停止开关，不是自动迭代产物；自迭代循环本身已停止（见 §4、§5）。

## 3. 工作树状态

### 3.1 概览

| 项 | 值 |
| --- | --- |
| 已修改（tracked，` M`） | 51 个文件 |
| 未跟踪（`??`） | 24 项（写前快照）＋本报告目录 1 项 = 25 |
| diff 行数 | files=51, +2842 / -252 |

### 3.2 已修改文件（tracked，含测试）

```
README.md
README.zh-CN.md
docs/LOCAL-TESTING.md
docs/knowledge/evidence/progress-tab-mockup-2026-11-21/README.md
lib/carryover.d.ts
lib/carryover.d.ts.map
lib/carryover.js
lib/carryover.js.map
lib/client.js
lib/config.d.ts
lib/config.d.ts.map
lib/config.js
lib/config.js.map
lib/naming.d.ts
lib/naming.d.ts.map
lib/naming.js
lib/naming.js.map
lib/report.d.ts.map
lib/report.js
lib/report.js.map
lib/run.d.ts.map
lib/run.js
lib/run.js.map
lib/script.d.ts
lib/script.d.ts.map
lib/script.js
lib/script.js.map
lib/settings.d.ts.map
lib/settings.js
lib/settings.js.map
lib/types.d.ts
lib/types.d.ts.map
src/carryover.ts
src/client/index.js
src/config.ts
src/naming.ts
src/report.ts
src/run.ts
src/script.ts
src/settings.ts
src/types.ts
test/client.spec.ts
test/config.spec.ts
test/docs-config-keys.spec.ts
test/failure-paths.spec.ts
test/helpers.ts
test/naming.spec.ts
test/reliability.spec.ts
test/route-concurrency.spec.ts
test/settings-projection.spec.ts
test/team-engine.spec.ts
```

### 3.3 未跟踪文件 / 目录

```
.rsi/evidence/interaction-nav-20261121.md
.rsi/evidence/spine-parity-2026-11-21-harness-narrow.html
.rsi/evidence/spine-parity-2026-11-21-harness.html
.rsi/evidence/spine-parity-2026-11-21-ui-1440.png
.rsi/evidence/spine-parity-2026-11-21-ui-760.png
.rsi/evidence/spine-parity-2026-11-21.json
.rsi/evidence/spine-parity-2026-11-21.md
docs/knowledge/DESIGN-dynamic-steering-semantics.md
docs/knowledge/PLAN-dynamic-steering-2026-11-21.md
docs/knowledge/evidence/baseline-inventory-2026-11-22/
docs/knowledge/evidence/progress-tab-mockup-2026-11-21/RESPONSIVE.md
lib/timeout.d.ts
lib/timeout.d.ts.map
lib/timeout.js
lib/timeout.js.map
lib/waves.d.ts
lib/waves.d.ts.map
lib/waves.js
lib/waves.js.map
research/
src/timeout.ts
src/waves.ts
test/inheritance.spec.ts
test/timeout.spec.ts
test/waves.spec.ts
```

> 说明：未跟踪的 `src/timeout.ts`、`src/waves.ts`、`lib/timeout.*`、`lib/waves.*`、
> `test/inheritance.spec.ts`、`test/timeout.spec.ts`、`test/waves.spec.ts` 与
> `docs/knowledge/DESIGN-dynamic-steering-semantics.md`、`docs/knowledge/PLAN-dynamic-steering-2026-11-21.md`
> 属动态转向（dynamic steering）工作树的进行中改动，非本任务范围，未暂存、未提交。

## 4. RSI 停止快照

### 4.1 停止开关文件

`.rsi/STOP` 存在：

```
-rw------- 1 fish fish 828 Nov 21 18:07 .rsi/STOP
--- 内容 ---
Operator stop — RSI self-iteration halted 2026-11-21T18:0x+08:00

Reason: the operator ordered the 1000-round self-iteration (one scheduled heartbeat per round,
per-iteration tag + retry) stopped. Round 42 was never opened; round 41 is the last closed round.

This file is the switch `.rsi/tools/heartbeat-guard.sh` tests before it opens a round: with it
present the guard returns `STOP code=stop-file` (exit 20) and opens nothing, even if a heartbeat
Schedule row is recreated. Remove this file only when a human deliberately resumes the loop.

State at stop:
- RSI heartbeat Schedule row: absent from the Schedule store (only the unrelated daily
  "派发个人助理灵感箱" task remains).
- Background jobs / workflow runs: none.
- Published release: 0.12.15 (01272af) — unchanged; no tag moved, no history rewritten.
```

### 4.2 心跳守卫日志尾行

文件：`.rsi/evidence/heartbeat-guard.log`（共 16 行）

```
2026-11-20T21:37:22+08:00 verdict=SKIP code=dirty-tracked next_round=39 blocked_streak=0 dirty_tracked=4
2026-11-20T22:37:22+08:00 verdict=STOP code=stall-unclosed next_round=39 blocked_streak=0 dirty_tracked=13
2026-11-21T02:15:18+08:00 verdict=SKIP code=dirty-tracked next_round=40 blocked_streak=0 dirty_tracked=1
2026-11-21T07:33:41+08:00 verdict=RESUME code=none next_round=41 blocked_streak=0 dirty_tracked=0
2026-11-21T07:50:27+08:00 verdict=RESUME code=none next_round=42 blocked_streak=0 dirty_tracked=0
```

> 最后一条守卫判定：`2026-11-21T07:50:27+08:00 verdict=RESUME code=none next_round=42 blocked_streak=0 dirty_tracked=0`。
> 守卫本身未触发 STOP；循环之所以停，是靠 `.rsi/STOP` 运行时开关（guard 第 10/173 行：
> `STOP exit 20`，`.rsi/STOP` 存在即返回 `code=stop-file`）以及 Schedule 存储中已无 RSI heartbeat 行。

### 4.3 Schedule 持久化存储

存储：`/home/fish/.dsh/storages/schedule.json`（本机唯一 schedule 存储）。

```
$ grep -c -i heartbeat /home/fish/.dsh/storages/schedule.json
0

$ python3 -c "列出全部 schedule 标题（计数 + 标题）"
1
'派发个人助理灵感箱'
```

> 结论：存储内**没有**任何 `RSI heartbeat` / `self-iter` 行（`grep -c -i heartbeat` 返回 0）；
> 唯一一条计划任务是无关的「派发个人助理灵感箱」。

## 5. CI 基线引用

| 项 | 值 |
| --- | --- |
| CI 定义文件 | `.github/workflows/ci.yml` |
| CI 定义提交 | `b6b649b` (fix: harden workflow validation and payload limits) |
| Release 定义文件 | `.github/workflows/release.yml` |
| 当前包版本 | `0.12.19` |

CI 流水线（`.github/workflows/ci.yml`）：Node 22 / 24 矩阵，依次执行
`npm ci` → `npm run typecheck` → `npm run lint` → `npm run build` → `git diff --exit-code -- lib/` → `npm test` → `npm pack --dry-run`。

历史基线参考（来自既有证据文件，非本轮执行）：`docs/knowledge/evidence/test-baseline-2026-11-18/REPORT.md`
记录当时 54 files / 984 tests；本任务上下文所述「CI 曾达 76 文件 1402 测试 PASS」为工作树规模口径，
本轮**未**重跑完整测试，故记为 `NOT_RUN`（基线引用，不作为通过证据）。

## 6. 只读声明与后续参照

- 本任务只读核查 git / schedule 存储 / 心跳日志 / 分支；未修改源码与测试，未创建 commit、tag、release，未改 schedule。
- 唯一写入：本目录（`docs/knowledge/evidence/baseline-inventory-2026-11-22/`）。
- 后续任务可把 `bd32506`（`v0.12.19` 之后唯一提交 = 停止开关）与上述工作树清单作为基线对照。
