# `0.13.44` 发布证据索引（2026-11-26）

这一份是 **`0.13.44` 这次发布**的读数档案：一份门禁转录、发布身份、远端两个 run 与 Release 资产。
目录里唯一的原始文件就是那份门禁转录，其余读数的出处在下面每一行里写清了命令。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 亲手在命令 / 转录里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。

**本轮的角色**：只做记忆收口，**没有重跑门禁、没有跑任何 npm 脚本、没有碰 `src/` / `test/` / `lib/`**。
下面每一条读数都在本轮用 `wc -lc` / `sha256sum` / `git` / `gh` 复核过一次。
**这一版没有代码改动**（发布提交只抬版本字面量；用户拿到的那条行为来自它前面刚落进 `main` 的功能合流
`649c4e4`，那一轮的红/绿记录在 `.rsi/evidence/auth-retry-2026-11-26/`），所以本轮**没有红可记**。

## 1. 一份门禁转录（`CONFIRMED`）

**这一轮只有一份门禁，就是发布提交自带的那一份**：`TMPDIR=$PWD/.tmp npm run ci`、发布 worktree
`.tmp/wt-release-0.13.44` 的干净树（`git -C .tmp/wt-release-0.13.44 status --short` 空）、`HEAD = 7cc4a90`、
`GATE_EXIT=0`。

**为什么只有一份**：父提交 **`649c4e4`** 就是功能轮的合流尖端——`fix/auth-retry` 那一轮已经带着自己的块内门禁
并进 `main`（证据 `.rsi/evidence/auth-retry-2026-11-26/`：`tsc` 0、`oxlint 15 warnings / 0 errors / 184 files`、
定向 9 份 spec `165 passed`、`client bundle: 348559 bytes`、红 `3 failed / 18 passed`）；在抬版本之前把同一棵树再跑一遍
不会多证明一件事（`AGENTS.md` §12 也是这个口径：全量门禁只在发布提交上跑一次）。`0.13.43` 那轮记了两份
（`gate-prerelease-532d4cf.out` + `gate-release-549a579.out`）是当时的做法，**不是这一版的必需品**。

### `gate-release-7cc4a90.out` —— 唯一的门禁（发布树）

- **372 行 / 21960 字节**（`wc -lc`）
- `sha256 9af222b39e8a4a7174d700ecd3ec271c2365061cd90003bc95823259f5f8c41a`（`sha256sum`）
- 末行 `GATE_EXIT=0`；`grep -cE 'FAIL|failed'` = **2**，两条都不是失败（判读见下表）
- 读数（行号是转录里的行号）：`Found 15 warnings and 0 errors.`（第 162 行）+ `Finished in 96ms on 184 files with 96 rules using 6 threads.`（第 163 行）、
  `client bundle: 348559 bytes → lib/client.js`（**第 168 与第 178 行各打一次、同值**）、
  `lib/ at 7cc4a90 is the build of src/ at 7cc4a90 (289 files, byte-identical)`（第 169 行）、
  `Test Files 103 passed (103)`（第 367 行） / `Tests 1947 passed (1947)`（第 368 行）、
  `Duration 81.75s (transform 2.38s, setup 0ms, import 9.96s, tests 59.78s, environment 11ms)`（第 370 行）
- 脚本身份也一并印在转录里：第 2 / 6 / 10 行读作 `> dsh-grok-workflow@0.13.44 ci` / `… typecheck` / `… lint`，
  所以**跑门禁的那棵树里 `package.json` 已经是 `0.13.44`**，与标签上的版本一致。

**`grep -cE 'FAIL|failed'` 那两条的判读（逐行读过，两条都不是失败）**：

| 行 | 原文片段 | 判读 |
| --- | --- | --- |
| 182 | `stderr \| test/client.spec.ts > client settings page: reading, failure and retry > keeps still reading, read failed and not served as three different pages` | 用例**标题**里的 `read failed`——这条用例本身就是要分辨「还在读」「读失败」「没给」三种页面；同一份 spec 在第 188 行读作 `✓ test/client.spec.ts (151 tests) 467ms` |
| 299 | `[smoke] status=failed file=…/.tmp/dsh-grok-workflow-test-checkpoints/checkpoint-db63f96f-…-17cdc6e5.json` | checkpoint 夹具**故意**造的「被拒的运行」那一例（它上一行同一条用例集的另一例是 `status=completed`）；同一份 spec 在第 301 行读作 `✓ test/checkpoint-engine-wire.spec.ts (6 tests) 650ms` |

两条所在的 spec 文件在转录里都是 ✓，`103 files / 1947 tests` 全过——所以这 2 个命中是**词命中，不是红**。

## 2. 发布身份（`CONFIRMED`，本轮自查）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| 发布提交 | `7cc4a901f1081feb774092c0dd51accc29d58086` `chore(release): prepare v0.13.44` | `git log -1 --format=… 7cc4a90` |
| 父提交 | `649c4e4eed70c934a08249de8da2426c921182dc`（**单父，本提交不是合并**） | `git rev-list --parents -n1 7cc4a90` |
| 改动面 | **8 文件 / +22 −20** | `git diff --stat 649c4e4..7cc4a90` |
| 逐文件 | `CHANGELOG.md` +2 −0、`README.md` 5/5、`README.zh-CN.md` 5/5、`docs/LOCAL-TESTING.md` 3/3、`lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、`src/client/index.js` 2/2 | 同上 |
| `src/` 与 `lib/` 的唯一改动 | `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对 `'0.13.43'` → `'0.13.44'`；两个文件 `cmp` **逐字节相同**，各 **348559 字节** | `git diff 649c4e4..7cc4a90 -- src/ lib/`、`cmp` |
| `CHANGELOG.md` 的形状 | diff **只有 +2 行**：插入 `## [0.13.44] - 2026-11-26` 标题，空的 `## [Unreleased]` 留空站在上面，条目正文中英一字未改 | `git diff 649c4e4..7cc4a90 -- CHANGELOG.md` |
| 标签对象 | **`e1a00440e4205d42fd0665a20ee2a17dca3df6ce`**（附注） | `git rev-parse v0.13.44` |
| 剥出的提交 | `7cc4a901f1081feb774092c0dd51accc29d58086` | `git rev-parse v0.13.44^{}` |
| 标签消息 | `Grok Workflow for DSH v0.13.44` | `git cat-file -p v0.13.44` |
| `tagger` 时刻 | **2026-11-26 04:23:06 +0800**（`1795638186 +0800`） | `git cat-file -p v0.13.44` |
| 标签上的版本 | `package.json` 读 `0.13.44` | `git show v0.13.44:package.json` |
| `main` | `7cc4a90` = `origin/main`（**没有第二个合并提交**） | `git rev-parse main origin/main` |
| 已发布标签零漂移 | `v0.13.40` `14fef642…`/`37788222…`、`v0.13.41` `96dd9cce…`/`a64a50a3…`、`v0.13.42` `98b9c458…`/`651f3dd2…`、`v0.13.43` `e084e4b8…`/`549a5790…`，四条与本轮开工前基线**逐字一致** | `git rev-parse v0.13.4x v0.13.4x^{}` |

**一处历史褶皱照实记（不改写）**：`main` 上有一对**内容相同**的合并提交——`7add053`（父 `7f0a47f` + `2055249`）
与 `649c4e4`（父 `7f0a47f` + `7add053`），`git diff 7add053 649c4e4` **为空**（本轮 `git diff --stat` 读到 0 行）。
第二颗是**空合并**：什么都没丢，也没有重写历史。发布提交 `7cc4a90` 是这颗空合并的**单父子提交**。

**一处偏差照实记**：这一版回到了「worktree + 本地发布分支」的做法（`.tmp/wt-release-0.13.44` /
`release/0.13.44`，HEAD 与 `main` 同值 `7cc4a90`），不像 `0.13.43` 那样直接提交在 `main` 上；所以本轮**有一个 worktree
和一个本地分支要清理**（清理在推送成功之后做，`git worktree remove` + `git branch -d`）。

**算术（本轮从 git 对象数过，与转录同值）**：

- spec 文件 `649c4e4` **103** → `7cc4a90` **103**（`git ls-tree -r --name-only <sha> -- test | grep -c '\.spec\.ts$'`）；
  发布提交不碰任何 `test/` 文件（`git diff --name-only 649c4e4..7cc4a90 -- test | wc -l` = **0**）。
- 用例 `0.13.43` 门禁 **1944** → 本轮 **1947**，即 **+3**。**这 +3 不随发版提交走**：它来自功能提交
  **`8dccf67`** `fix(routing): a refused key gets one same-route re-ask, and never a dead route`——那份提交把
  `test/planner-resubmit.spec.ts` **10 → 12**、`test/judge-leg-retry.spec.ts` **8 → 9**（本轮用带词边界的
  `grep -cE '(^|[^A-Za-z0-9_.$])it\('` 在 `8dccf67^` 与 `7cc4a90` 各数一次：10 / 8 → 12 / 9，`2 + 1 = 3`）。
  这两个文件在**发布提交之前**就已经在 `main` 上了。
- 一条口径：`0.13.43` 那 **+3**（`38d64bb` 的 `test/replan.spec.ts` 21 → 24）与这一轮的 **+3** 是**两笔不同**的账，
  别把它们加在一起。

## 3. 远端两个 run（`CONFIRMED`，`gh run view` 重读）

- Release run **`45694469431`**——`headBranch v0.13.44`、sha `7cc4a90`、**conclusion `success`**、
  workflow `Release`、标题 `chore(release): prepare v0.13.44`、单 job `Validate and publish v0.13.44`，
  `startedAt 2026-11-25T20:23:17Z` → `updatedAt 2026-11-25T20:24:49Z`（约 **1m28s**），
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45694469431
- CI run **`45694462916`**——`main`、sha `7cc4a90`、**conclusion `success`**，
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45694462916

## 4. GitHub Release（`CONFIRMED`，`gh release view`）

https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.44

| 项 | 值 |
| --- | --- |
| 名字 | `Grok Workflow for DSH v0.13.44` |
| `publishedAt` | `2026-11-25T20:24:43Z` |
| draft / prerelease | 都不是 |
| target | `main` |
| 正文 | **21 行 / 2598 字节**（`gh release view --json body -q .body \| wc -lc` 读作 `21 2599`，多的那 1 字节是 `wc` 补的换行） |
| 唯一资产 | **`dsh-grok-workflow-0.13.44.tgz` = 987079 字节**（上一版 `0.13.43` = 984828 → **+2251**） |
| 资产摘要 | `sha256:b6b1b6a03daa72aebec1477fc16d82db65c31697dc100cc5b3f4e7b1a56cc1df` |

## 5. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | `11.19.0` | `npm -v` |
| 内核 | `Linux 7.2.11-arch1-1 x86_64` | `uname -srm` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`） | `git rev-parse --abbrev-ref HEAD` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

## 6. 用户拿到的只有一件事

`CHANGELOG` 那条「**A refused key is asked once more on the same route before the run pays for it /
钥匙被拒时，运行会先在同一条路由上再问一次**」就是这一版**唯一**对用户可见的改动：
供应商回 401/403（钥匙被拒、虚拟密钥过期、网关自己换上游凭据）以前会把这通调用彻底结束——判腿记成「没有判」于是整轮重试、
干活那条腿为一纸没人做过的判决重跑，规划腿退到兜底切分、永远报不出「已完成」；现在被拒的调用**在同一条路由上先重发一次**再谈别的开销
（两条判腿同一次尝试里把裁判再问一遍，规划腿对准拒的那条路由再问一次计划，最多一次额外子调用），
而**这条路仍然不会被记成「死路」**——死路表照旧只数超时、掉线、5xx 和操作员开关留在原路由上的 429。
升级须知那一句是「**不用准备任何东西**」：没有键、schema、默认值或已存记录变化。

**口径要写准**：这一版只有这一条；`0.13.43` 那条（边界子的请求单形状）**不在这一版里**，它上一版就已经发出去了。

## 7. 没做的与做不到的

- **`NOT_RUN`（真机 soak）**：发版轮没有新行为可 soak——这里发出去的行为是 `fix/auth-retry` 那一轮在真机上验过的
  （证据 `.rsi/evidence/auth-retry-2026-11-26/`：一次运行 `818754a2…`，规划腿同一路由 `seq 1 failed → seq 2 completed`、
  小代理 `seq 1 → 401 injected`、报告 `COMPLETED / Plan: planner; 2 task(s); 2 verified`）。本轮也没跑门禁、没跑任何 npm 脚本。
- **`BLOCKED`（`AGENTS.md` §13 的 live 档案升级）**：**没做成**——本会话文件策略 `workspace-write`、`~/.dsh` 在工作区外，
  写探测 `: > ~/.dsh/.release-probe-0.13.44` 返回 **`Read-only file system`**，**没写、没重载、没重启** live 档案；
  live 档案现在装的是哪一版**本轮没读**（`NOT_RUN`，不猜）。**下一个有写权限的人要做的**：把 live 那条插件行钉到
  **确切的标签 `v0.13.44`**（绝不能用浮动范围、`latest` 或分支名），把装好的版本读回来确认，
  读不回 `0.13.44` 就回滚那一行——跑发布版时它必须读作 `0.13.44`。
- **本轮没碰的两处遗留**（属别的会话，未暂存、未提交）：`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪)。

## 8. 哪一份算数

`.tmp/wt-release-0.13.44` 那棵 worktree 与本轮一起清掉了；**这个目录是归档记录**。
引用门禁读数请引 `gate-release-7cc4a90.out` 这一份（行数、字节数、`sha256` 见 §1）。
