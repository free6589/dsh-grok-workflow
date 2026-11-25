# `0.13.43` 发布证据索引（2026-11-26）

这一份是 **`0.13.43` 这次发布**的读数档案：两次门禁转录、发布身份、远端两个 run 与 Release 资产。
目录里唯一的原始文件是两份门禁转录，其余读数的出处在下面每一行里写清了命令。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 亲手在命令 / 转录里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。

**本轮的角色**：只做记忆收口，**没有重跑门禁、没有跑任何 npm 脚本、没有碰 `src/` / `test/` / `lib/`**。
下面每一条读数都在本轮用 `wc -lc` / `sha256sum` / `git` / `gh` 复核过一次。
**这一版没有代码改动**，所以本轮**没有红可记**。

## 1. 两份门禁转录（`CONFIRMED`）

两次都是 `TMPDIR=$PWD/.tmp npm run ci`、干净树、`GATE_EXIT=0`。

### `gate-prerelease-532d4cf.out` —— 门禁 #1

证明 **改动在抬版本之前就是绿的**：树 **`532d4cf`**（发布提交的父提交，版本字面量还是 `0.13.42`）。

- **396 行 / 23898 字节**
- `sha256 44e7f893a8b2b6e1dc95398afc58a6e4c69027b77ddd1370e60572e19cf4ca1c`
- 末行 `GATE_EXIT=0`；`grep -c FAIL` = **0**
- 读数：`Found 15 warnings and 0 errors.`（184 文件 / 96 条规则）、`client bundle: 348559 bytes → lib/client.js`、
  `lib/ at 532d4cf is the build of src/ at 532d4cf (289 files, byte-identical)`、
  `Test Files 103 passed (103)` / `Tests 1944 passed (1944)`、
  `Duration 102.56s (transform 3.63s, setup 0ms, import 10.43s, tests 79.26s, environment 12ms)`

### `gate-release-549a579.out` —— 门禁 #2（真正的发版门禁）

证明 **打标签那个提交自己是绿的**：树 **`549a579`**（发布提交，版本字面量 `0.13.43`）。

- **394 行 / 23572 字节**
- `sha256 a67cd0390fd126a76ffc22ed6c6efae08eda1d3b6b0669c517ce2635541331cf`
- 末行 `GATE_EXIT=0`；`grep -c FAIL` = **0**
- 读数：`Found 15 warnings and 0 errors.`、`client bundle: 348559 bytes → lib/client.js`、
  `lib/ at 549a579 is the build of src/ at 549a579 (289 files, byte-identical)`、
  `Test Files 103 passed (103)` / `Tests 1944 passed (1944)`、
  `Duration 107.03s (transform 3.29s, setup 0ms, import 9.83s, tests 84.63s, environment 12ms)`
- 这道门禁之后 `git status --short` 只剩那两处遗留（`.gitignore` modified、`.rsi/evidence/progress-now/` 未跟踪），
  所以 **`verify:lib` 比对之后没有残留**——**提交的 `lib/` 就是提交的 `src/` 的构建**。

## 2. 发布身份（`CONFIRMED`，本轮自查）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| 发布提交 | `549a5790a03f1be67bb1c5b08803a1a940b1f37f` `chore(release): prepare v0.13.43` | `git log -1 --format=… 549a579` |
| 父提交 | `532d4cf1978d822d67fa653ff16b129d2a921980` | `git rev-parse 549a579^` |
| 改动面 | **8 文件 / +22 −20** | `git diff --stat 532d4cf..549a579` |
| `src/` 与 `lib/` 的唯一改动 | `PLUGIN_VERSION` / `UPDATE_LATEST` `'0.13.42'` → `'0.13.43'`（blob `f2f427d` → `5ecf0d8`，各 348559 字节，`cmp` 逐字节相同） | `git diff 532d4cf..549a579 -- src/ lib/`、`cmp` |
| 标签对象 | **`e084e4b8ad0ae7acec5a7ccaf045fa09f27f5577`**（附注） | `git rev-parse v0.13.43` |
| 剥出的提交 | `549a5790a03f1be67bb1c5b08803a1a940b1f37f` | `git rev-parse v0.13.43^{}` |
| 标签消息 | `Grok Workflow for DSH v0.13.43` | `git cat-file -p v0.13.43` |
| `tagger` 时刻 | **2026-11-26 03:33:33 +0800**（`1795635213 +0800`） | `git cat-file -p v0.13.43` |
| 标签上的版本 | `package.json` 读 `0.13.43` | `git show v0.13.43:package.json` |
| `main` | `549a579` = `origin/main`（直接 push 快进，**没有第二个合并提交**） | `git rev-parse main origin/main` |
| 已发布标签 | 未移动、未 force-push（`v0.13.42^{}` → `651f3dd`、`v0.13.41^{}` → `a64a50a`、`v0.13.40^{}` → `3778822`） | `git rev-parse` / `git for-each-ref` |

**一处偏差照实记**：早几轮都是从 `release/0.13.4x` 分支 `--ff-only` 合进 `main`，这一轮直接提交在 `main` 上推
（结果等价、少一条分支）。本轮**没有建 worktree、也没有 worktree 要删**。

**算术（本轮从 git 对象数过）**：spec 文件 `532d4cf` **103** → `549a579` **103**
（`git ls-tree -r --name-only <sha> -- test | grep -c '\.spec\.ts$'`；发布提交不碰任何 `test/` 文件，
`git diff --name-only 532d4cf..549a579 -- test | wc -l` = **0**），用例 **1944 / 1944**，与两份转录同值。
**仅供对照**：`0.13.42` 发的是 `103 files / 1941 tests`，那 **+3** 来自功能提交 `38d64bb`
（`test/replan.spec.ts` 21 → 24），本轮之前就已在 `main` 上，不随这次发版提交走。

## 3. 远端两个 run（`CONFIRMED`，`gh run view` 重读）

- Release run **`45686411703`**——`headBranch v0.13.43`、sha `549a579`、**conclusion `success`**、
  单 job `Validate and publish v0.13.43`，https://github.com/free6589/dsh-grok-workflow/actions/runs/45686411703
- CI run **`45686404326`**——`main`、sha `549a579`、**conclusion `success`**，
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45686404326

两个都用 `gh run watch --exit-status` 盯过，**退出 0 各一次**。

## 4. GitHub Release（`CONFIRMED`，`gh release view`）

https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.43

| 项 | 值 |
| --- | --- |
| 名字 | `Grok Workflow for DSH v0.13.43` |
| `publishedAt` | `2026-11-25T19:35:15Z` |
| draft / prerelease | 都不是 |
| target | `main` |
| 正文 | **28 行** |
| 唯一资产 | **`dsh-grok-workflow-0.13.43.tgz` = 984828 字节**（上一版 `0.13.42` = 980976 → **+3852**） |
| 资产摘要 | `sha256:8151ba209bf7243a739379767b53d56c438f28408730c46efab782101127c15b` |

## 5. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | `11.19.0` | `npm -v` |
| 内核 | `Linux 7.2.11-arch1-1 x86_64` | `uname -srm` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`） | `git rev-parse --abbrev-ref HEAD` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

## 6. 用户拿到的只有一件事

边界规划子代理的请求单形状写清楚了，写在 `action` 旁边的任务体会被提到 `task` 里，所以跑中加进来的要求
这一次真的能并进计划；缺必填字段的体照旧拒，但拒绝语会点名缺哪几个。
**口径要写准**：发版清单上列了两条（「边界请求形状」与「收件箱闸门」），**收件箱闸门不在 `0.13.43` 里——
它 `0.13.42` 就已经发出去了**；`0.13.43` 只带请求形状这一条。

## 7. 没做的与做不到的

- **`NOT_RUN`**：本轮没做真机 soak——发版轮没有新行为可 soak；这里发出去的行为是 `fix/replan-shape`
  那一轮在真机上验过的（证据 `.rsi/evidence/replan-shape-2026-11-26/`）。本轮也没跑门禁、没跑任何 npm 脚本。
- **`BLOCKED`**：`AGENTS.md` §13 的 live 档案升级**没做成**——本会话文件策略是 `workspace-write`、
  `~/.dsh` 在工作区外，写不进去，**没写、没重载、没重启** live 档案。**下一个有写权限的人要做的**：
  把 live 那条插件行钉到**确切的标签 `v0.13.43`**（绝不能用浮动范围），把装好的版本读回来确认，
  读不回 `0.13.43` 就回滚那一行——跑发布版时它必须读作 `0.13.43`。live 档案现在装的是哪一版**本轮没读**，不写。
- **本轮没碰的两处遗留**（属别的会话，未暂存、未提交）：`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪)。

## 8. 哪一份算数

`.tmp/gate-*.out` 是随手副本、**会被删掉**；**这个目录是归档记录**。引用门禁读数请引
`gate-prerelease-532d4cf.out` 与 `gate-release-549a579.out` 这两份（行数、字节数、`sha256` 见 §1）。
