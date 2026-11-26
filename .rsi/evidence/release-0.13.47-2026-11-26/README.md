# `0.13.47` 发布证据索引（2026-11-26）

这一份是 **`0.13.47` 这次发布**的读数档案：一份门禁转录、发布身份、远端两个 run、Release 与它的资产、清理、
两处别人的遗留，以及一条做不到的事（live 档案升级）。目录里唯一的原始文件是那份门禁转录
`gate-release-63d039b.out`（没有改动过它，`mtime 2026-11-26 08:26:49`），其余每一条读数在下面都写了
**是哪条命令读出来的**。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 亲手在命令 / 转录里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。

**本轮的角色**：只做记忆收口，**没有重跑门禁、没有跑任何 npm 命令、没有跑 `gh`、没有碰 `src/` / `test/` / `lib/`**。
门禁是包工头这一轮在发布 worktree `.tmp/wt-release-0.13.47` 里跑的那一遍，转录就在本目录；本轮对它只做读取
（`wc -lc`、`sha256sum`、`tail -1`、`grep -c`、`sed -n`），一个字没改。

**这一版只有证据和记忆，没有行为变化**：`v0.13.46` 之后 `main` 上多出来的全是证据与文档，**产品代码零行**。
它发出去的是**三种失败页面的真机读数**（`.rsi/evidence/failure-states-2026-11-26/`，62 个文件）：琥珀汇总节点
（胶囊仍 `已完成`、第三颗汇总节点琥珀、`aria-label="汇总 第 3 稿 没过"`、展开三行 `第 3 稿全被退回` / `卡在检查` /
`最后不过：…`）、整轮 `未通过` 页（`检查` 与 `终点` 琥珀、没有按钮）、`已取消` 页（`规划 没做` / `终点 没做` 琥珀、
没有按钮），三态各带一张 1500 宽的截图、逐字的文本与钩子读数，另有可重放的 `rig/` 与 `soak/`。三态逐字读下来
**没有一处产品缺陷**，所以没有行为改动，CHANGELOG 的升级须知是「不用准备任何东西」。所以本轮**没有红可记**——
这一版没有新行为可红。

**一处口径订正（照实记）**：本轮的派单记录把这一版说成「判腿证据 + 三态证据」。**历史不是这样**——
**判腿证据（`.rsi/evidence/judge-leg-soak-2026-11-26/`）是随 `v0.13.46` 一起发出去的**
（`git ls-tree -d --name-only v0.13.46 .rsi/evidence/` 里就有它），`0.13.47` 只带三态这一套。

## 1. 门禁（`CONFIRMED`，唯一一份）

`TMPDIR=$PWD/.tmp npm run ci`，发布 worktree `.tmp/wt-release-0.13.47` 的干净树，`HEAD = 63d039b`，
**`GATE_EXIT=0`**。那一棵树按 0.13.37 的教训单独跑过 `npm ci --prefer-offline`。起跑时树是干净的
（`git status --short` 空）；**门禁跑完之后那棵树的状态这一轮没有读数**——那棵 worktree 随清理已经删掉，
本目录无法再复核，所以这里只记起跑时的干净与那份转录本身，不替它说「跑完仍干净」。

**为什么只有一份**：`AGENTS.md` §12 说全量门禁只在发布提交上跑一次。这一版改的是证据与文档，`test/` 一个文件没动，
所以抬版本之前再跑一遍不会多证明一件事。

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| 行数 / 字节 | **381 行 / 22779 字节** | `wc -lc .rsi/evidence/release-0.13.47-2026-11-26/gate-release-63d039b.out` |
| 摘要 | **`sha256 42fee211950be38fe2c56be088a4c6677e31996ff0622e85985214be4f8cb569`** | `sha256sum` 同一份文件 |
| 末行 | **`GATE_EXIT=0`** | `tail -1` |
| 失败词 | `grep -c FAIL` = **0**；`grep -c 'failed'` = **3**，三条都是词命中（判读见下表） | `grep -c` 两次 |
| 脚本身份 | 第 2 / 6 / 10 行读作 `> dsh-grok-workflow@0.13.47 ci` / `… typecheck` / `… lint`，**跑门禁的那棵树里 `package.json` 已经是 `0.13.47`** | `sed -n '2p;6p;10p'` |
| lint | 第 162 行 `Found 15 warnings and 0 errors.`；第 163 行 `Finished in 129ms on 184 files with 96 rules using 6 threads.` | `sed -n '162,163p'` |
| 浏览器包 | 第 168 与第 178 行 `client bundle: 348559 bytes → lib/client.js`（**同值，各打一次**） | `sed -n '168,169p;178p'` |
| `lib/` 与 `src/` | 第 169 行 `lib/ at 63d039b is the build of src/ at 63d039b (289 files, byte-identical)` | 同上 |
| spec 与用例 | 第 376 行 **`Test Files 103 passed (103)`**、第 377 行 **`Tests 1948 passed (1948)`** | `sed -n '376,379p'` |
| 耗时 | 第 379 行 `Duration 90.30s (transform 2.72s, setup 0ms, import 9.84s, tests 67.72s, environment 12ms)` | 同上 |
| 跑在哪棵树 | 第 304 行的 checkpoint 夹具路径逐字带 `…/dsh-grok-workflow/.tmp/wt-release-0.13.47/.tmp/dsh-grok-workflow-test-checkpoints/checkpoint-19562da7-…-8b5028cc.json` | `grep -n 'failed'` |

**`grep -c 'failed'` 那三条的判读（逐行读过，三条都不是失败）**：

| 行 | 原文片段 | 判读 |
| --- | --- | --- |
| 182 | `stderr \| test/client.spec.ts > client settings page: reading, failure and retry > keeps still reading, read failed and not served as three different pages` | 用例**标题**里的 `read failed`——这条用例要分辨「还在读」「读失败」「没给」三种页面 |
| 225 | `✓ failed rows requeue to pending and keep their dependency gate  381ms` | 用例**标题**里的 `failed rows`，这一例断言的是失败任务重新排队 |
| 304 | `[smoke] status=failed file=…/.tmp/wt-release-0.13.47/.tmp/dsh-grok-workflow-test-checkpoints/checkpoint-19562da7-…-8b5028cc.json resume=resume unfinished=a` | checkpoint 夹具**故意**造的「被拒的运行」那一例；那行路径逐字带发布 worktree，正好说明门禁跑在 `.tmp/wt-release-0.13.47` 里 |

`103 files / 1948 tests` 全过——所以这 3 个命中是**词命中，不是红**。

**用例算术（`CONFIRMED`，从 git 对象数过）**：spec 文件 **103**、用例 **1948**，与 `0.13.46` 发版门禁报的是
**同一个数**——这一版**没有增删任何测试文件**（`git diff --name-only v0.13.46 63d039b -- test` 输出为空、
`-- src` 只有 `src/client/index.js` 一个文件），所以不是「长了」，是**没动**。

## 2. 发布身份（`CONFIRMED`，本轮自查）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| 发布提交 | **`63d039b6c9717fbab90d0afefab0a602e6206be4`** `chore(release): prepare v0.13.47` | `git log -1 --format='%H %s' 63d039b` |
| 父提交 | **`dd348327875e829bd38e6314724b47a69f30aaa4`**（**单父，本提交不是合并**） | `git rev-list --parents -n1 63d039b` |
| 改动面 | **8 文件 / +48 −20** | `git show --stat --oneline 63d039b` |
| 逐文件 | `CHANGELOG.md` +28 −0、`README.md` 5/5、`README.zh-CN.md` 5/5、`docs/LOCAL-TESTING.md` 3/3、`lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、`src/client/index.js` 2/2 | `git show --numstat --format= 63d039b` |
| `src/` 与 `lib/` 的唯一改动 | `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对 `'0.13.46'` → `'0.13.47'` | `git diff dd34832 63d039b -- src lib` 的可见行只有这四行（两份文件各两行） |
| 两份客户端文件 | **同一个 blob**：`d2f330e` → `0a30dd2`；`cmp src/client/index.js lib/client.js` 退出 **0**，各 **348559 字节** | `git rev-parse 63d039b:src/client/index.js` / `…:lib/client.js`、`cmp`、`wc -c` |
| `lib/` 的其余文件 | **一个都没动**（`git diff --name-only dd34832 63d039b -- lib` 只有 `lib/client.js`） | 同一条 `git diff` |
| 版本字面量 | `package.json` 第 3 行读 `0.13.47`；`package-lock.json` 的 `version`（第 3 行）与 `packages[""].version`（第 9 行）都读 `0.13.47` | `grep -n '"version"' package.json package-lock.json` |
| `CHANGELOG.md` 的形状 | 第 6 行 `## [Unreleased]`（**空**）、第 8 行 `## [0.13.47] - 2026-11-26`、第 36 行 `## [0.13.46]`；新节只有**一个** `### Changed / 变更`（第 10 行）子标题、条目以 `**升级须知：不用准备任何东西——没有键、schema、默认值或已存记录变化。**` 收尾，diff 是 **+28 −0**，更早的节一个字没动 | `sed -n '1,40p' CHANGELOG.md`、`git show --numstat --format= 63d039b` |
| 附注标签 | **`v0.13.47`**，对象 **`d74e06eedf610cdf2323967970b37345236c379f`** | `git rev-parse v0.13.47`、`git ls-remote --tags origin 'refs/tags/v0.13.47*'` |
| 剥出的提交 | **`63d039b6c9717fbab90d0afefab0a602e6206be4`** | `git rev-parse v0.13.47^{}` |
| 标签消息 | `Grok Workflow for DSH v0.13.47` | `git cat-file -p v0.13.47` |
| `tagger` 时刻 | **2026-11-26 08:24:47 +0800**（`1795652687 +0800`） | `git cat-file -p v0.13.47`（**偏差见下**） |
| 标签上的版本 | `package.json` 读 `0.13.47` | `git show v0.13.47^{}:package.json` |
| `main` | `git rev-parse main origin/main` 两处都是 **`63d039b`**；远端 `refs/heads/main` 同值 | `git rev-parse main origin/main`、`git ls-remote origin refs/heads/main` |
| 已发布标签零漂移 | `v0.13.45` 对象 **`ca4a42c618b469a5bfc6db5442c8530c59a79065`** → 剥出 **`63793eb93b19723d4ec2e90ec23c86a1804a53a7`**、`v0.13.46` 对象 **`a1f0f85d85dde0877801f9ac20db28a6163608f4`** → 剥出 **`84f64c8cd5868aeddf8d39e006456310c546c871`**，两条与开工前基线**逐字一致** | `git ls-remote --tags origin 'refs/tags/v0.13.4*'` |
| 集成方式 | `git merge --ff-only release/0.13.47`，推送输出 `dd34832..63d039b  main -> main`，所以 **`main` = `origin/main` = 门禁提交 = 标签剥出的提交 = `63d039b`**，没有第二个合并提交 | 派单记录（推送输出）；本轮用 `git rev-parse` / `git ls-remote` 重读 |
| 推送标签 | `* [new tag]         v0.13.47 -> v0.13.47` | 派单记录；远端 `refs/tags/v0.13.47` 已在（见上表「附注标签」） |

**一处偏差照实记**：派单记录写的 `tagger` 时刻是 `1795652476 +0800`（08:21:16）。**标签对象里不是这个数**——
`git cat-file -p v0.13.47` 读作 `tagger fish <free6589@users.noreply.github.com> 1795652687 +0800`，即
**2026-11-26 08:24:47 +0800**；对象的 SHA 正是 `d74e06e`，所以以对象为准，本文件全篇按 `08:24:47` 记。

## 3. `v0.13.46..63d039b` 里是什么（`CONFIRMED`）

- **五颗提交**（`git log --oneline v0.13.46..63d039b`）：`63d039b` 发布提交、`dd34832` 与 `9400c20` 两颗
  `merge: failure-states soak evidence, no product change`、`1183b59`
  `docs(evidence): the three failure states, photographed on a real machine`（新增
  `.rsi/evidence/failure-states-2026-11-26/`，62 个文件）、`f7dda97` `docs(memory): record the 0.13.46 release`
  （`0.13.46` 的记忆与 `.rsi/evidence/release-0.13.46-2026-11-26/`）。
- **`test/` 一个文件都没动**、**`src/` 只有 `src/client/index.js`**（就是那两行版本字面量）——见 §2。
  所以这个区间里 `main` 长的只有证据与文档，**产品代码零行**。
- 于是这一版**没有行为变化**，`spec 文件 103 / 用例 1948` 与 `0.13.46` 发版门禁同值（见 §1「用例算术」）。
- **判腿证据不在这一版里**：`.rsi/evidence/judge-leg-soak-2026-11-26/` 在 `v0.13.46` 就已经进仓库
  （`git ls-tree -d --name-only v0.13.46 .rsi/evidence/` 列出它）——见开头的「一处口径订正」。

## 4. 远端两个 run（`CONFIRMED`，派单记录里 `gh run view` 的读数）

- Release run **`45728561278`**——workflow `Release`、`headBranch v0.13.47`、sha `63d039b`、
  **conclusion `success`**、单 job `Validate and publish v0.13.47`、`2026-11-26T00:24:56Z → 00:26:18Z`
  （约 **82 秒**）、**非 success 步骤 0 个**；派单时用 `gh run watch --exit-status` 盯到退出 **0**。
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45728561278
- `main` 的 CI run **`45728550814`**——workflow `CI`、sha `63d039b`、**conclusion `success`**，
  job `Node 22` 与 `Node 24` **两个都 success**。
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45728550814

**这一格本轮为什么是转述**：本轮按规则**没跑 `gh`**（记忆轮只读仓库与本地文件），所以远端的四个数
（两个 run 号、`publishedAt`、资产字节与摘要）照派单记录写；下一轮任何时候都可以用 §4 / §5 里的
`gh run view` / `gh release view` 重读一次核对。

## 5. GitHub Release（`CONFIRMED`，`gh release view v0.13.47 --json …`）

https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.47

| 项 | 值 |
| --- | --- |
| 名字 | `Grok Workflow for DSH v0.13.47` |
| `publishedAt` | `2026-11-26T00:26:13Z` |
| draft / prerelease | 都不是（`isDraft false`、`isPrerelease false`） |
| target | `main` |
| 正文 | **28 行** |
| 唯一资产 | **`dsh-grok-workflow-0.13.47.tgz` = 990561 字节**（上一版 `0.13.46` = 989319 → **+1242**） |
| 资产摘要 | `sha256:520cb409eda07e88bfd01e0533c0541b52f3702c2c6374be39525347e499ff0d` |

## 6. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | **`NOT_RUN`**（本轮一条 npm 命令都没跑，连 `npm -v` 也没跑） | —— |
| 内核 | `Linux 7.2.11-arch1-1 x86_64` | `uname -srm` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`，`63d039b`） | `git worktree list` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

## 7. 清理、遗留，与做不到的那件事

- **清理（推送成功后做，已做完）**：`git worktree remove .tmp/wt-release-0.13.47` 成功；
  `git branch -d release/0.13.47` 报 `was 63d039b`；`git worktree list` 现在只剩主检出
  `/home/fish/projects_mine/dsh-grok-workflow 63d039b [main]`；`ls -d .tmp/wt-*` 什么也没找到。
  **远端分支一个没删、标签一个没删。**
- **本轮没碰的两处遗留**（属别的会话，未暂存、未提交，`git status --short` 里还在）：`.gitignore`(modified)
  与 `.rsi/evidence/progress-now/`(未跟踪)。另外三条 `backup/wip-2026-11-24-*` 分支与 `feat/audit-layer`
  也刻意留着，没有删。本轮只按显式路径 `git add` 了三份记忆、本目录的 `README.md` 与 `gate-release-63d039b.out`。
- **`BLOCKED`（`AGENTS.md` §13 的 live 档案升级，就是下一件事）**：**没做成**。写探测
  `: > ~/.dsh/.release-probe-0.13.47` 返回 **`Read-only file system`**（本会话文件策略 `workspace-write`、
  `~/.dsh` 在工作区外，审批提示被禁用所以没有升级路径）。**没写、没重载、没重启**，3080 那个实例全程没碰。
  只读读到的三条：live 档案里装的 `dsh-grok-workflow` 现读 **`0.13.46`**
  （`node -p require('/home/fish/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json').version`）；
  插件行是 `~/.dsh/profiles/web/cordis.patch.yml` 第 **561** 行 `name: dsh-grok-workflow`，它上面第 560 行是
  `- id: grok-workflow`；`~/.dsh` 的 mtime **`2026-11-25 23:14`**、`~/.dsh/profiles` 的 mtime
  **`2026-11-22 16:59`**——两个都在本会话之前，说明这一轮一个字没写进去。
  另记一条本轮自己读到的（`CONFIRMED`）：那一行**仍是浮动依赖**——`~/.dsh/profiles/web/package.json` 第 12 行读
  `"dsh-grok-workflow": "github:free6589/dsh-grok-workflow"`，没有钉到任何标签。
- **下一个有写权限的人要做的**：把 live 那条插件行钉到**确切的标签 `v0.13.47`**（绝不用浮动范围、`latest`
  或分支名），把装好的版本读回来确认；读不回 `0.13.47` 就把那一行回滚到原值并说明。
- **`NOT_RUN`（真机 soak）**：这一版没有可 soak 的行为变化——三态读数本身就是真机证据，它在
  `fix/failure-states` 那一轮用隔离档案 + 真模型拍下来的（证据 `.rsi/evidence/failure-states-2026-11-26/`），
  这一版只是把它发出去。
- **`NOT_RUN`（任何 npm 命令 / `gh`）**：记忆轮一条都没跑。门禁只跑过那一次，在打标签之前，就是本目录这份转录。

## 8. 哪一份算数

`.tmp/wt-release-0.13.47` 那棵 worktree 与本轮一起清掉了；**这个目录是归档记录**，转录是它留下的原件。
引用门禁读数请引 `gate-release-63d039b.out`（行数、字节数、`sha256` 见 §1），不要凭本文件转述。
引用远端与 Release 的读数请按 §4 / §5 里写的 `gh` 命令重读一次。三态的内容请引
`.rsi/evidence/failure-states-2026-11-26/README.md`，本文件不替它说话。