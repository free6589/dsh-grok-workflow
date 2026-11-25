# `0.13.46` 发布证据索引（2026-11-26）

这一份是 **`0.13.46` 这次发布**的读数档案：一份门禁转录、发布身份、远端两个 run、Release 与它的资产、清理、
两处别人的遗留，以及一条做不到的事（live 档案升级）。目录里唯一的原始文件是那份门禁转录
`gate-release-84f64c8.out`（没有改动过它），其余每一条读数在下面都写了**是哪条命令读出来的**。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 亲手在命令 / 转录里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。

**本轮的角色**：只做记忆收口，**没有重跑门禁、没有跑任何 npm 脚本、没有碰 `src/` / `test/` / `lib/`**。
门禁是包工头这一轮在发布 worktree `.tmp/wt-release-0.13.46` 里跑的那一遍，转录就在本目录；本轮对它只做读取
（`wc -lc`、`sha256sum`、`tail`、`grep`、`sed -n`），一个字没改。

**这一版只有文档和证据，没有行为变化**：`[Unreleased]` 本来就是空的，这一版把两份 README 里过期的门禁数字
（`98 files / 1850 tests`）改成实测的 `103 test files / 1948 deterministic tests`，并把判腿 401 soak 的证据
（`.rsi/evidence/judge-leg-soak-2026-11-26/`）落进仓库。所以本轮**没有红可记**——用户拿到的那条行为
（0.13.44 的「钥匙被拒就在同一条路由上再问一次」）的红/绿在 `fix/judge-leg-soak` 那一轮，
见 `.rsi/evidence/judge-leg-soak-2026-11-26/README.md`。

## 1. 门禁（`CONFIRMED`，唯一一份）

`TMPDIR=$PWD/.tmp npm run ci`，发布 worktree `.tmp/wt-release-0.13.46` 的干净树（`git status --short` 空——
那两处别人的遗留只在主检出里，不在这个 worktree 里），`HEAD = 84f64c8`，**`GATE_EXIT=0`**。
门禁跑完那棵树仍然是干净的：包工头这一轮读过 `git status --short`（空、`lib/` 没有改动残留），
那棵 worktree 随清理删掉之后本目录无法再复核这一条，所以这里记的是那一轮读到的结果。

**为什么只有一份**：`AGENTS.md` §12 说全量门禁只在发布提交上跑一次。这一版改的是文档与证据，`test/` 一个文件没动，
所以抬版本之前再跑一遍不会多证明一件事。

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| 行数 / 字节 | **388 行 / 23373 字节** | `wc -lc .rsi/evidence/release-0.13.46-2026-11-26/gate-release-84f64c8.out` |
| 摘要 | **`sha256 96c5797419e4786edec252636f4b2050dbc60273224df03c448ccaf154a0bc1f`** | `sha256sum` 同一份文件 |
| 末行 | **`GATE_EXIT=0`**（全文只出现这一次，第 388 行） | `tail -1`；`grep -n GATE_EXIT` |
| 失败词 | `grep -c FAIL` = **0**；`grep -c 'failed'` = **3**，三条都是词命中（判读见下表） | `grep -c` 两次 |
| 脚本身份 | 第 2 / 6 / 10 行读作 `> dsh-grok-workflow@0.13.46 ci` / `… typecheck` / `… lint`，**跑门禁的那棵树里 `package.json` 已经是 `0.13.46`** | `sed -n '2p;6p;10p'` |
| lint | 第 162 行 `Found 15 warnings and 0 errors.`；第 163 行 `Finished in 64ms on 184 files with 96 rules using 6 threads.` | `sed -n '162,163p'` |
| 浏览器包 | 第 168 与第 178 行 `client bundle: 348559 bytes → lib/client.js`（**同值，各打一次**） | `sed -n '168,169p;178p'` |
| `lib/` 与 `src/` | 第 169 行 `lib/ at 84f64c8 is the build of src/ at 84f64c8 (289 files, byte-identical)` | 同上 |
| spec 与用例 | 第 383 行 **`Test Files 103 passed (103)`**、第 384 行 **`Tests 1948 passed (1948)`** | `sed -n '383,386p'` |
| 起止与耗时 | 第 385 行 `Start at 05:59:35`、第 386 行 `Duration 94.99s (transform 2.37s, setup 0ms, import 8.49s, tests 75.09s, environment 11ms)` | 同上 |
| 跑在哪棵树 | 第 307 行的 checkpoint 夹具路径逐字带 `.tmp/wt-release-0.13.46/.tmp/dsh-grok-workflow-test-checkpoints/…` | `grep -n 'failed'` |

**`grep -c 'failed'` 那三条的判读（逐行读过，三条都不是失败）**：

| 行 | 原文片段 | 判读 |
| --- | --- | --- |
| 182 | `stderr \| test/client.spec.ts > client settings page: reading, failure and retry > keeps still reading, read failed and not served as three different pages` | 用例**标题**里的 `read failed`——这条用例要分辨「还在读」「读失败」「没给」三种页面 |
| 307 | `[smoke] status=failed file=…/.tmp/wt-release-0.13.46/.tmp/dsh-grok-workflow-test-checkpoints/checkpoint-f8b8fae1-…-f23d8559.json resume=resume unfinished=a` | checkpoint 夹具**故意**造的「被拒的运行」那一例（同一份 spec 的上一例读作 `status=completed`） |
| 381 | `✓ maps in_progress→running and failed→blocked with the detail as blockedReason  685ms` | 用例**标题**里的 `failed→blocked`，这一例断言的是状态映射 |

三条所在的两份 spec 在转录里都是 ✓，`103 files / 1948 tests` 全过——所以这 3 个命中是**词命中，不是红**。

## 2. 发布身份（`CONFIRMED`，本轮自查）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| 发布提交 | **`84f64c8cd5868aeddf8d39e006456310c546c871`** `chore(release): prepare v0.13.46` | `git log -1 --format='%H %s' 84f64c8` |
| 父提交 | **`3a0e859e77ce9b20de360ee85f0aa3f7a3b514aa`**（**单父，本提交不是合并**） | `git rev-list --parents -n1 84f64c8` |
| 改动面 | **8 文件 / +47 −20** | `git show --stat --oneline 84f64c8` |
| 逐文件 | `CHANGELOG.md` +27 −0、`README.md` 5/5、`README.zh-CN.md` 5/5、`docs/LOCAL-TESTING.md` 3/3、`lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、`src/client/index.js` 2/2 | `git show --numstat --format= 84f64c8` |
| 与上一版的形状 | `v0.13.45` 那颗 `63793eb` 逐文件增删合计 2/10/10/6/4/4/2/4，同一个八文件骨架 | 上一版证据索引 `.rsi/evidence/release-0.13.45-2026-11-26/README.md` §2 |
| `src/` 与 `lib/` 的唯一改动 | `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对 `'0.13.45'` → `'0.13.46'`（`src/client/index.js` 第 213 / 214 行，`lib/client.js` 同两行） | `git diff 3a0e859 84f64c8 -- src lib` |
| 两份客户端文件 | **同一个 blob**：`93b7562` → `d2f330e`；`cmp src/client/index.js lib/client.js` 退出 **0**，各 **348559 字节** | `cmp`、`wc -c` |
| `lib/` 的其余文件 | **一个都没动**（`git diff --name-only 3a0e859 84f64c8 -- lib` 只有 `lib/client.js`） | 同一条 `git diff` |
| 版本字面量 | `package.json` 读 `0.13.46`；`package-lock.json` 的 `version`（第 3 行）与 `packages[""].version`（第 9 行）都读 `0.13.46` | `grep -n '"version"' package.json package-lock.json` |
| 两份 README 的 `0.13.46` | 各 **5 处**；各自还剩**恰好一处** `0.13.45`，就是「已发布标签」清单里那一条（`README.md` 第 346 行、`README.zh-CN.md` 第 328 行） | `grep -c '0\.13\.46'`、`grep -n '0\.13\.45'` |
| `docs/LOCAL-TESTING.md` | **3 处** `0.13.46`（第 77 行的安装示例、第 163 与第 164 行的打包 + 安装），没有 `0.13.45` | `grep -n '0\.13\.4[56]' docs/LOCAL-TESTING.md` |
| `README` 里那两个数 | `README.md` 第 355 行 `**1948 deterministic tests across 103 files**`、`README.zh-CN.md` 第 337 行 `**103 个文件 / 1948 个确定性测试**` | `grep -n '1948' README.md README.zh-CN.md` |
| `CHANGELOG.md` 的形状 | 第 6 行 `## [Unreleased]`（**空**）、第 8 行 `## [0.13.46] - 2026-11-26`、第 35 行 `## [0.13.45] - 2026-11-26`；新节正文 **26 行**（第 9–34 行，含末尾一个空行），远高于发布流程要求的 4 行下限；节内只有**一个** `### Fixed / 修复` 子标题，条目以 `**升级须知：不用准备任何东西——没有键、schema、默认值或已存记录变化。**` 收尾；diff 是 **+27 −0**，更早的节一个字没动 | `sed -n '1,40p' CHANGELOG.md`、`git show --numstat --format= 84f64c8`、`sed -n '9,34p' CHANGELOG.md \| wc -l` |
| 附注标签 | **`v0.13.46`**，对象 **`a1f0f85d85dde0877801f9ac20db28a6163608f4`** | `git rev-parse v0.13.46`、`git ls-remote origin 'refs/tags/v0.13.4*'` |
| 剥出的提交 | **`84f64c8cd5868aeddf8d39e006456310c546c871`** | `git rev-parse v0.13.46^{}` |
| 标签消息 | `Grok Workflow for DSH v0.13.46` | `git cat-file -p v0.13.46` |
| `tagger` 时刻 | **2026-11-26 06:01:30 +0800**（`1795644090 +0800`） | `git cat-file -p v0.13.46` |
| 标签上的版本 | `package.json` 读 `0.13.46` | `git show v0.13.46^{}:package.json` |
| `main` | `git rev-parse main origin/main` 两处都是 **`84f64c8`**；远端 `refs/heads/main` 同值 | `git rev-parse main origin/main`、`git ls-remote origin refs/heads/main` |
| 已发布标签零漂移 | `v0.13.44` 对象 `e1a00440…` → 剥出 **`7cc4a901f1081feb774092c0dd51accc29d58086`**、`v0.13.45` 对象 `ca4a42c6…` → 剥出 **`63793eb93b19723d4ec2e90ec23c86a1804a53a7`**，两条与开工前基线逐字一致 | `git ls-remote origin 'refs/tags/v0.13.4*'` |
| 集成方式 | `git merge --ff-only 84f64c8`，推送输出 `3a0e859..84f64c8  main -> main`，所以 **`main` = `origin/main` = 门禁提交 = 标签剥出的提交 = `84f64c8`**，没有第二个合并提交 | 派单记录（推送输出）；本轮用 `git rev-parse` / `git ls-remote` 重读 |
| 推送标签 | `* [new tag]  v0.13.46 -> v0.13.46` | 派单记录；远端 `refs/tags/v0.13.46` 已在（见上表「附注标签」） |

**基线（`CONFIRMED`）**：开工前 `main` = `origin/main` = **`3a0e859`**（`merge: judge-leg soak evidence and README counts`），
它的远端 CI run **`45708168320`** 是 `success`（`gh run view 45708168320 --json …` 本轮重读：workflow `CI`、
`headBranch main`、sha `3a0e859`）；上一个发布标签 `v0.13.45` → `63793eb`。

## 3. `v0.13.45..84f64c8` 里是什么（`CONFIRMED`）

- **七颗提交**（`git log --oneline v0.13.45..84f64c8`）：`84f64c8` 发布提交、`3a0e859` 与 `de4aaad` 两颗合并、
  `772eb5e` 与 `4343b84` 两颗记忆/文档提交、`c7975cc` 与 `92d3a42` 两颗更早的记忆提交。
- **`test/` 一个文件都没动**：`git diff --name-only v0.13.45 84f64c8 -- test` 输出为空。
- **`src/` 只有一个文件**：`git diff --name-only v0.13.45 84f64c8 -- src` 只有 `src/client/index.js`——
  就是那两行版本字面量（见 §2）。整个区间的 `git diff --stat` 是 **47 文件 / +2500 −22**，多出来的是证据与文档。
- 所以这一版**没有行为变化**；`spec 文件 103 / 用例 1948` 与 `0.13.45` 发版门禁报的是同一个数，
  因为这一版没有增删任何测试文件——它只订正了 README 里印出来的那个数。

## 4. 远端两个 run（`CONFIRMED`，`gh run view` 重读）

- Release run **`45709634480`**——workflow `Release`、`headBranch v0.13.46`、sha `84f64c8`、
  **conclusion `success`**、单 job `Validate and publish v0.13.46`、`2026-11-25T22:01:43Z → 22:03:18Z`（约 **1m35s**）；
  派单时用 `gh run watch --exit-status` 盯到退出 0。
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45709634480
- `main` 的 CI run **`45709629770`**——workflow `CI`、`headBranch main`、sha `84f64c8`、**conclusion `success`**。
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45709629770

## 5. GitHub Release（`CONFIRMED`，`gh release view v0.13.46 --json …`）

https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.46

| 项 | 值 |
| --- | --- |
| 名字 | `Grok Workflow for DSH v0.13.46` |
| `publishedAt` | `2026-11-25T22:03:13Z` |
| draft / prerelease | 都不是（`isDraft false`、`isPrerelease false`） |
| target | `main` |
| 正文 | **27 行**（`gh release view --json body -q .body \| wc -l`），内容就是仓库里 `## [0.13.46]` 那一节 |
| 唯一资产 | **`dsh-grok-workflow-0.13.46.tgz` = 989319 字节**（上一版 `0.13.45` = 988089 → **+1230**） |
| 资产摘要 | `sha256:a74e51855b8f0c89ab73d63d7ec8f630446ad6a2de1e2ad6228d0be5ac9635a9` |
| 状态 | `uploaded` |

## 6. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | `11.19.0` | `npm -v` |
| 内核 | `Linux 7.2.11-arch1-1 x86_64` | `uname -srm` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`） | `git worktree list` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

## 7. 清理、遗留，与做不到的那件事

- **清理（推送成功后做，已做完）**：`git worktree remove .tmp/wt-release-0.13.46` 成功；
  `git branch -d release/0.13.46` 报 `was 84f64c8`；`git worktree list` 现在只剩主检出
  `/home/fish/projects_mine/dsh-grok-workflow 84f64c8 [main]`；`ls -d .tmp/wt-*` 什么也没找到。
  **远端分支一个没删、标签一个没删。**
- **本轮没碰的两处遗留**（属别的会话，未暂存、未提交）：`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪)。
  本轮只按显式路径 `git add` 了三份记忆、本目录的 `README.md` 与 `gate-release-84f64c8.out`。
- **`BLOCKED`（`AGENTS.md` §13 的 live 档案升级，就是下一件事）**：**没做成**。本会话文件策略 `workspace-write`、
  `~/.dsh` 在工作区外，所以这一行写不进来；**没写、没重载、没重启**，3080 那个实例全程没碰。
  只读读到的：live 档案里装的 `dsh-grok-workflow` 仍读 **`0.13.39`**；`~/.dsh` 的 mtime 是 **`2026-11-25 23:14:14`**。
  本轮另记一条自己的读数：连「读一遍」这条路也走不通——`dsh --profile web plugin list` 返回
  `Error: EROFS: read-only file system, open '/home/fish/.dsh/profiles/web/cordis.yml'`，即这个 CLI 连读都要打开那个文件写。
  **下一个有写权限的人要做的**：把 live 那条插件行钉到**确切的标签 `v0.13.46`**（绝不用浮动范围、`latest` 或分支名），
  把装好的版本读回来确认；读不回 `0.13.46` 就回滚那一行。
- **`NOT_RUN`（真机 soak）**：这一版没有可 soak 的行为变化——CHANGELOG 里写的那条行为是 `fix/judge-leg-soak` 那一轮
  在隔离档案里用真模型验过的，它的证据这一版才落进仓库（`.rsi/evidence/judge-leg-soak-2026-11-26/`）。
- **`NOT_RUN`（任何 npm 脚本）**：记忆轮一条 npm 脚本都没跑。门禁只跑过一次，在打标签之前，就是本目录这份转录。

## 8. 哪一份算数

`.tmp/wt-release-0.13.46` 那棵 worktree 与本轮一起清掉了；**这个目录是归档记录**，转录是它留下的原件。
引用门禁读数请引 `gate-release-84f64c8.out`（行数、字节数、`sha256` 见 §1），不要凭本文件转述。
引用远端与 Release 的读数请按 §4 / §5 里写的 `gh` 命令重读一次。
