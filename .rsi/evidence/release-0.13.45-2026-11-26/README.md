# `0.13.45` 发布证据索引（2026-11-26）

这一份是 **`0.13.45` 这次发布**的读数档案：一份门禁转录、发布身份、远端两个 run、Release 与它的资产、清理、
两处别人的遗留，以及一条做不到的事（live 档案升级）。目录里的原始文件就是那份门禁转录
`gate-release-63793eb.out`，其余每一条读数在下面都写了**是哪条命令读出来的**。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 亲手在命令 / 转录里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。

**本轮的角色**：只做记忆收口，**没有重跑门禁、没有跑任何 npm 脚本、没有碰 `src/` / `test/` / `lib/`**。
每一条读数都在本轮用 `wc -lc` / `sha256sum` / `git` / `gh` 复核过一次。
**这一版没有代码改动**（发布提交只抬版本字面量；用户拿到的那条行为来自它前面已经在 `main` 上的功能提交
`4fc24b3`，那一轮的红/绿记录在 `.rsi/evidence/settled-rows-2026-11-26/`），所以本轮**没有红可记**。

## 1. 一份门禁转录（`CONFIRMED`）

**这一轮只有一份门禁，就是发布提交自带的那一份**：`TMPDIR=$PWD/.tmp npm run ci`、发布 worktree
`.tmp/wt-release-0.13.45` 的干净树（`git -C .tmp/wt-release-0.13.45 status --short` **空**：那两处别人的遗留只在主检出里）、
`HEAD = 63793eb`、`GATE_EXIT=0`。

**为什么只有一份**：父提交 **`e2ed221`** 就是功能轮的合流尖端——`fix/settled-rows` 那一轮已经带着自己的块内门禁
并进 `main`（证据 `.rsi/evidence/settled-rows-2026-11-26/`：`gate-typecheck.out`、`gate-lint.out`、
`gate-specs.out`（定向 3 份 spec `45 passed`）、`gate-build.out`、`gate-docs-guards.out`、`red-before-fix.out`）；
在抬版本之前把同一棵树再跑一遍不会多证明一件事（`AGENTS.md` §12：全量门禁只在发布提交上跑一次）。

### `gate-release-63793eb.out` —— 唯一的门禁（发布树）

- **412 行 / 25328 字节**（`wc -lc .rsi/evidence/release-0.13.45-2026-11-26/gate-release-63793eb.out`）
- `sha256 0649e838902ccd513ab6c8650fc6c51d6c1cc573bbc90199f0f94b45054fd0a0`（`sha256sum`）
- 末行 `GATE_EXIT=0`（`tail -1`）；`grep -cE 'FAIL|failed'` = **4**（`grep -c 'FAIL'` = 0），四条都不是失败（判读见下表）
- 读数（行号是转录里的行号）：第 2 / 6 / 10 行 `> dsh-grok-workflow@0.13.45 ci` / `… typecheck` / `… lint`、
  第 162 行 `Found 15 warnings and 0 errors.`、第 163 行 `Finished in 87ms on 184 files with 96 rules using 6 threads.`、
  `client bundle: 348559 bytes → lib/client.js`（**第 168 与第 178 行各打一次、同值**）、
  第 169 行 `lib/ at 63793eb is the build of src/ at 63793eb (289 files, byte-identical)`、
  第 407 行 `Test Files 103 passed (103)` / 第 408 行 `Tests 1948 passed (1948)`、
  第 410 行 `Duration 147.60s (transform 2.83s, setup 0ms, import 10.05s, tests 125.49s, environment 11ms)`、
  第 412 行 `GATE_EXIT=0`
- 脚本身份也印在转录里：第 2 / 6 / 10 行读作 `> dsh-grok-workflow@0.13.45 …`，所以**跑门禁的那棵树里
  `package.json` 已经是 `0.13.45`**，与标签上的版本一致。

**这份转录是怎么来的**：包工头在本轮开工前，于 worktree `.tmp/wt-release-0.13.45` 的干净树上跑了那一条命令，
转录原件留在那棵 worktree 里；本轮把它**逐字节复制**到本目录（`cp` 后 `cmp` 报干净、记 `CMP_OK`），
复制之后那棵 `.tmp/wt-release-0.13.45` 随清理一起删掉（`git worktree list` 现在只剩主检出）。

**`grep -cE 'FAIL|failed'` 那四条的判读（逐行读过，四条都不是失败）**：

| 行 | 原文片段 | 判读 |
| --- | --- | --- |
| 209 | `[smoke] status=failed file=…/.tmp/dsh-grok-workflow-test-checkpoints/checkpoint-9e831d78-…-50d65c06.json resume=resume unfinished=a` | checkpoint 夹具**故意**造的「被拒的运行」那一例（同一份 spec 的上一例读作 `status=completed`）；第 212 行读作 `✓ test/checkpoint-engine-wire.spec.ts (6 tests) 1820ms` |
| 261 | `✓ re-fires once when the answer cannot be parsed, then reports a failed judge  1070ms` | 用例**标题**里的 `failed judge`——这一例本身就是「答案解析不出来时，判腿被判失败」 |
| 307 | `✓ maps in_progress→running and failed→blocked with the detail as blockedReason  808ms` | 用例**标题**里的 `failed→blocked`，断言的是状态映射 |
| 310 | `stderr \| test/client.spec.ts > client settings page: reading, failure and retry > keeps still reading, read failed and not served as three different pages` | 用例**标题**里的 `read failed`——这条用例要分辨「还在读」「读失败」「没给」三种页面 |

四条所在的三份 spec 在转录里都是 ✓，`103 files / 1948 tests` 全过——这 4 个命中是**词命中，不是红**。

## 2. 发布身份（`CONFIRMED`，本轮自查）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| 发布提交 | **`63793eb93b19723d4ec2e90ec23c86a1804a53a7`** `chore(release): prepare v0.13.45` | `git log -1 --format='%H %s' 63793eb` |
| 父提交 | **`e2ed221f93aa5c455df2f6eb23818b3bd0b789e2`**（**单父，本提交不是合并**） | `git rev-list --parents -n1 63793eb` |
| 改动面 | **8 文件 / +22 −20** | `git show --stat --oneline 63793eb` |
| 逐文件 | `CHANGELOG.md` +2 −0、`README.md` +5 −5、`README.zh-CN.md` +5 −5、`docs/LOCAL-TESTING.md` +3 −3、`lib/client.js` +2 −2、`package-lock.json` +2 −2、`package.json` +1 −1、`src/client/index.js` +2 −2 | `git show --numstat --format= 63793eb` |
| `CHANGELOG.md` 的形状 | diff **只有 +2 行**：插入 `## [0.13.45] - 2026-11-26` 标题行 + 它上面一个空行；`## [Unreleased]` 现在是空的；`### Fixed / 修复` 那段的条目正文中英**一字未改** | `git show 63793eb -- CHANGELOG.md`、`sed -n '/^## \[0.13.45\]/,/^## \[0.13.44\]/p' CHANGELOG.md` |
| `docs/LOCAL-TESTING.md` 的三处 tarball 名 | 第 77 行的安装示例、第 163 与第 164 行的打包 + 安装 | `git show 63793eb -- docs/LOCAL-TESTING.md` |
| `src/` 与 `lib/` 的唯一改动 | `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对 `'0.13.44'` → `'0.13.45'`（各 2 行 2 处） | `git diff e2ed221..63793eb -- src lib` |
| `lib/client.js` 与 `src/client/index.js` | **同一个 blob**：`ea4d107` → `93b7562`，各 **348559 字节** | `git rev-parse 63793eb:lib/client.js 63793eb:src/client/index.js`、`git cat-file -s` |
| 版本字面量 | `package.json` 与 `package-lock.json` 都读 `0.13.45`（锁文件两处：第 3 行与第 9 行） | `git show main:package.json \| grep -n '"version"'`、`git show main:package-lock.json \| grep -n '"version"'` |
| 标签对象 | **`ca4a42c618b469a5bfc6db5442c8530c59a79065`**（附注） | `git rev-parse v0.13.45`、`git cat-file -p v0.13.45` |
| 剥出的提交 | **`63793eb93b19723d4ec2e90ec23c86a1804a53a7`** | `git rev-parse v0.13.45^{}` |
| 标签消息 | `Grok Workflow for DSH v0.13.45` | `git cat-file -p v0.13.45` |
| `tagger` 时刻 | **2026-11-26 05:11:02 +0800**（`1795641062 +0800`） | `git cat-file -p v0.13.45` |
| 标签上的版本 | `package.json` 读 `0.13.45` | `git show v0.13.45:package.json` |
| `main` | `63793eb` = `origin/main`（`git rev-parse main origin/main` 同值）；远端 `refs/heads/main` 同值 | `git rev-parse main origin/main`、`git ls-remote origin refs/heads/main` |
| 已发布标签零漂移 | `v0.13.41` `96dd9cce…`/`a64a50a3…`、`v0.13.42` `98b9c458…`/`651f3dd2…`、`v0.13.43` `e084e4b8…`/`549a5790…`、`v0.13.44` `e1a00440…`/`7cc4a901…`，四条与开工前基线**逐字一致** | `git ls-remote --tags origin`、`git rev-parse v0.13.4x v0.13.4x^{}` |
| 推送 | `e2ed221..63793eb  main -> main` 与 `* [new tag]  v0.13.45 -> v0.13.45` | `git push origin main`、`git push origin v0.13.45` 的输出 |

**一处历史褶皱照实记（不改写）**：`main` 上有一对**内容完全相同**的合并提交——`d975dba`（父 `d6c338e` +
`a3ef7e1`）与 `e2ed221`（父 `d6c338e` + `d975dba`），`git diff d975dba e2ed221` **为空**（`git diff --stat` 读到
0 行）、两棵树都是 **`dc11ac30186d7ebeef86f7fe29bce580dadbc42f`**（`git rev-parse d975dba^{tree} e2ed221^{tree}`）。
第二颗是**空合并**：什么都没丢，也没有重写历史。发布提交 `63793eb` 是它的**单父子提交**。

**`v0.13.44..main` 里有什么**（`git log --oneline v0.13.44..main`，六颗）：`63793eb` 发布提交、
`e2ed221` 与 `d975dba` 两颗合并、`a3ef7e1` 记忆/证据提交、**`4fc24b3`** `fix(replan): the boundary planner reads
each settled row's verdict and title`（**唯一的产品提交**）、`d6c338e` `docs(memory): record the 0.13.44 release`。

**算术（本轮从 git 对象数过，与转录同值）**：

- spec 文件 `v0.13.44` **103** → `main` **103**（`git ls-tree -r --name-only <ref> -- test | grep -c '\.spec\.ts$'`）；
  `v0.13.44..main` 只动过 **1 个** `test/` 文件（`git diff --name-only v0.13.44 main -- test` → `test/replan.spec.ts`）；
  发布提交本身**不碰任何** `test/` 文件。
- `test/replan.spec.ts` 带词边界的 `it(` **24 → 25**（`grep -cE '(^|[^A-Za-z0-9_.$])it\('`，在 `v0.13.44` 与
  `main` 各数一次）；那 **+1** 就是 **`4fc24b3`** 加的 `runReal` 那一例。
- 用例 `0.13.44` 门禁 **1947** → 本轮 **1948**，即 **+1**。**这 +1 不随发版提交走**，它来自功能提交 `4fc24b3`，
  在发布提交之前就已经在 `main` 上。

## 3. 远端两个 run（`CONFIRMED`，`gh run view` 重读）

- Release run **`45701977660`**——workflow `Release`、`headBranch v0.13.45`、sha `63793eb`、
  **conclusion `success`**、单 job `Validate and publish v0.13.45`、`2026-11-25T21:11:15Z → 21:12:34Z`（约 **1m19s**）、
  run 建于 `2026-11-25T21:11:12Z` / 更新于 `21:12:35Z`；派单时用 `gh run watch 45701977660 --exit-status` 盯到退出 0。
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45701977660
- CI run **`45701972085`**——workflow `CI`、`headBranch main`、sha `63793eb`、**conclusion `success`**。
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45701972085

## 4. GitHub Release（`CONFIRMED`，`gh release view v0.13.45 --json …`）

https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.45

| 项 | 值 |
| --- | --- |
| 名字 | `Grok Workflow for DSH v0.13.45` |
| `publishedAt` | `2026-11-25T21:12:30Z` |
| draft / prerelease | 都不是 |
| target | `main` |
| 正文 | `## [0.13.45] - 2026-11-26` 那一节，**2151 字节**（`gh release view --json body` 读回：17 个换行、末尾带一个换行） |
| 唯一资产 | **`dsh-grok-workflow-0.13.45.tgz` = 988089 字节**（上一版 `0.13.44` = 987079 → **+1010**） |
| 资产摘要 | `sha256:8d56730583a0c22f429d2e54eef7f4272be3adc8fc1ba0d1da41b9daae985ad9` |

## 5. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | `11.19.0` | `npm -v` |
| 内核 | `Linux 7.2.11-arch1-1 x86_64` | `uname -srm` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`） | `git rev-parse --abbrev-ref HEAD` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

## 6. 用户拿到的只有一件事

`CHANGELOG` 那条「**The boundary planner now sees what already settled, with each verdict and title /
波边界那个规划子现在真的看得到已经沉淀的任务，连判决和标题一起**」就是这一版**唯一**对用户可见的改动：
一次运行走到波边界时，边界子拿到的「已沉淀任务」列表以前由「编号 → 状态」的纯字符串表拼出来，而提示词读的是每一行的
判决与标题，于是真机上每行都印成 `- count-agents [undefined] `；现在传给它的**就是结算行本身**，所以每行读作
`- count-agents [verified] Count the agents`。用户看到的：跑中加进来的要求，是拿一份「做完的那一半看得见判决和标题」
的计划来判的。升级须知那一句是「**不用准备任何东西**——没有键、schema、默认值或已存记录变化」。

**口径要写准**：操作者的简报列了两条内容，但**「钥匙被拒时会在同一条路由上再问一次」那条已经在 `0.13.44` 发出去过**
（`fix/auth-retry` 轮、`D-164`，证据 `.rsi/evidence/auth-retry-2026-11-26/`），`0.13.45` **只带**「已沉淀行」这一条。

## 7. 清理、遗留，与做不到的那件事

- **清理（推送成功后做，已做完）**：`git worktree remove .tmp/wt-release-0.13.45`——`git worktree list` 现在只剩
  主检出 `/home/fish/projects_mine/dsh-grok-workflow 63793eb [main]`；`git branch -d release/0.13.45` 报
  `Deleted branch release/0.13.45 (was 63793eb)`。**远端分支一个没删、标签一个没删。**
- **本轮没碰的两处遗留**（属别的会话，未暂存、未提交）：`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪)。
  本轮只按显式路径 `git add` 了这三份记忆、本目录的 `README.md` 与 `gate-release-63793eb.out`。
- **`BLOCKED`（`AGENTS.md` §13 的 live 档案升级，就是下一件事）**：**没做成**——本会话文件策略 `workspace-write`、
  `~/.dsh` 在工作区外，写探测 `: > ~/.dsh/.release-probe-0.13.45` 返回 **`Read-only file system`**
  （退出 1，只试一次、没有重试）；**没写、没重载、没重启**，3080 那个实例全程没碰。只读读到的：live 档案里装的
  `dsh-grok-workflow` 仍读 **`0.13.39`**；mtime `~/.dsh` `2026-11-25 23:14:14`、`~/.dsh/profiles`
  `2026-11-22 16:59:46`、`profiles/web/cordis.patch.yml` `2026-11-25 23:04:40`。**下一个有写权限的人要做的**：
  把 live 那条插件行钉到**确切的标签 `v0.13.45`**（绝不用浮动范围、`latest` 或分支名），把装好的版本读回来确认；
  读不回 `0.13.45` 就回滚那一行。
- **`NOT_RUN`（真机 soak）**：发版轮没有新行为可 soak——这里发出去的行为是 `fix/settled-rows` 那一轮在真机上验过的
  （证据 `.rsi/evidence/settled-rows-2026-11-26/`：隔离档案 `settled-clone`、端口 3487、真模型、
  `Plan: planner; 3 task(s); 3 verified`、两道边界提示词都不含 `undefined`）。本轮也没跑门禁、没跑任何 npm 脚本。

## 8. 哪一份算数

`.tmp/wt-release-0.13.45` 那棵 worktree 与本轮一起清掉了；**这个目录是归档记录**。
引用门禁读数请引 `gate-release-63793eb.out` 这一份（行数、字节数、`sha256` 见 §1）——它是原件在删除前的
**逐字节副本**（`cmp` 干净）。引用远端与 Release 的读数请按 §3 / §4 里写的 `gh` 命令重读一次，
不要凭本文件的数字转述。
