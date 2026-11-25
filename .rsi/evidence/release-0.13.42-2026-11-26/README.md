# `0.13.42` 发布收口证据（2026-11-26）

这一份是 **`0.13.42` 这次发布**的读数档案：发布身份、门禁、算术（用例数为什么从 `1927` 变成 `1941`）、
远端两个 run 与 Release、清理，以及一条**没做成**的事（`BLOCKED` 的 live 档案升级）。
目录里唯一的原始文件是 `gate-651f3dd.out`（发版门禁转录，**396 行 / 23895 字节**，
`sha256 5f5dfc4315a9b372b406a816671dff5c9e8d691ea5002a209bcddfff02427f95`
——本轮自己用 `wc -lc` 与 `sha256sum` 各读一次）。其余读数的出处写在下面每一行里。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 本轮亲手在源码 / 命令 / 转录里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。

**本轮的角色**：只做记忆收口，**没有重跑门禁**（转录是发版执行方留下的，本轮只核对）。
凡标「派单记录」的读数，本轮都在能便宜复核的地方用 `git` / `gh` 复核过一次；复核到的地方单独注明「本轮自查」。

## 1. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | `11.19.0` | `npm -v` |
| DSH CLI | `0.2.2-rc.3` | `dsh --version` |
| 内核 | `Linux 7.2.11-arch1-1 x86_64` | `uname -srm` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`） | `git rev-parse main` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

门禁转录是在**主检出**里产生的（转录第 180 行的 runner 是
`RUN  v4.1.12 /home/fish/projects_mine/dsh-grok-workflow`，不是 `.tmp/wt-release-*` worktree），
所以这次的清理没有 worktree 要删（`git worktree list` 本轮复核：只剩主检出）。

## 2. 发布身份（`CONFIRMED`，本轮自查）

- **发布提交** **`651f3dd27873bcd9728001858e02bf77385af8ab`**，消息 `chore(release): prepare v0.13.42`，
  父提交 **`ec89b7cb5aeac443b99ce00b4de017a4d5d7c0b2`**（`git rev-parse 651f3dd^`），
  提交时刻 `Thu Nov 26 02:36:55 2026 +0800`（`git show --stat 651f3dd`）。
- **8 文件 / +22 −20**（`git diff --stat ec89b7c..651f3dd`），逐文件增删（`--numstat`）：

  | 文件 | + | − |
  | --- | --- | --- |
  | `CHANGELOG.md` | 2 | 0 |
  | `README.md` | 5 | 5 |
  | `README.zh-CN.md` | 5 | 5 |
  | `docs/LOCAL-TESTING.md` | 3 | 3 |
  | `lib/client.js` | 2 | 2 |
  | `package-lock.json` | 2 | 2 |
  | `package.json` | 1 | 1 |
  | `src/client/index.js` | 2 | 2 |

  **这份文件集里没有任何 `test/` 文件**——发布没有带测试（见 §4 的因果）。
- **版本字面量只改了一对**：`PLUGIN_VERSION` 与 `UPDATE_LATEST` 都由 `'0.13.41'` → `'0.13.42'`
  （`git show 651f3dd -- src/client/index.js`，四行 diff 就是这两对）。两份文件的 blob 由
  **`4c4132d` → `f2f427d`**，即 `src/client/index.js` 与 `lib/client.js` 在发布提交上是同一个 blob
  **`f2f427d18e1fe2bbf0efea837f840ec197370317`**（`git rev-parse 651f3dd:src/client/index.js 651f3dd:lib/client.js`，两行同值）。
  那一对字面量以外的 `src/` 与 `lib/` 一行没动——**这一版没有代码改动，只是把已经在 `main` 上的功能发了出去**。
- `git show 651f3dd:package.json` 的 `version` 是 **`0.13.42`**（`package-lock.json` 同步，2/2）。
- **`main` 是 `git merge --ff-only release/0.13.42` 前进的**，没有第二个合并提交：
  `main` = `origin/main` = **`651f3dd`**（`git rev-parse main origin/main`，两行同值），
  本地 `release/0.13.42` 也停在 `651f3dd`（`git branch -vv`）——快进的证据就是「分支与 `main` 同 sha、`main` 上没有新提交」。

### 2.1 标签（附注标签，`CONFIRMED`）

`git cat-file -p v0.13.42` 原样：

```
object 651f3dd27873bcd9728001858e02bf77385af8ab
type commit
tag v0.13.42
tagger fish <free6589@users.noreply.github.com> 1795632016 +0800

Grok Workflow for DSH v0.13.42
```

- 标签**对象** **`98b9c458de07458f474ff25aa649347bba339c51`**（`git rev-parse v0.13.42`，`git cat-file -t` = `tag`），
  剥出 **`651f3dd27873bcd9728001858e02bf77385af8ab`**（`git rev-parse v0.13.42^{}`）。
- `tagger … 1795632016 +0800` = **2026-11-26 02:40:16 +0800**（`date -d @1795632016`）。
- **已发布标签没被移动**（`git ls-remote --tags origin` 本轮重读）：

  | 标签 | 对象 | 备注 |
  | --- | --- | --- |
  | `v0.13.42` | `98b9c45` | 本次，新（剥出 `651f3dd`） |
  | `v0.13.41` | `96dd9cc` | 未动（对象 `96dd9cce3434734213eee281037ccca9ef605e57`，与上一轮记录同值） |

## 3. 发版门禁（发布提交 `651f3dd`，`CONFIRMED`，转录在本目录）

`TMPDIR=$PWD/.tmp npm run ci`，在 `651f3dd` 的干净树上跑一遍整套。逐条从 `gate-651f3dd.out` 读到：

| 行 | 转录里的原话（行号） |
| --- | --- |
| 包与阶段 | `> dsh-grok-workflow@0.13.42 ci` → `npm run typecheck && npm run lint && npm run verify:lib && npm test`（1–2 行） |
| typecheck | `> dsh-grok-workflow@0.13.42 typecheck` → `> tsc -p tsconfig.json --noEmit`（无输出、无错误） |
| lint | `Found 15 warnings and 0 errors.`（162）+ `Finished in 99ms on 184 files with 96 rules using 6 threads.`（163） |
| verify:lib | `client bundle: 348559 bytes → lib/client.js`（168）+ `lib/ at 651f3dd is the build of src/ at 651f3dd (289 files, byte-identical)`（169） |
| build | `client bundle: 348559 bytes → lib/client.js`（178） |
| tests | `Test Files  103 passed (103)`（391）/ `Tests  1941 passed (1941)`（392） |
| 时长 | `Start at  02:38:20`（393）/ `Duration  100.30s (transform 3.42s, setup 0ms, import 9.63s, tests 78.10s, environment 11ms)`（394） |
| runner | `RUN  v4.1.12 /home/fish/projects_mine/dsh-grok-workflow`（180） |
| 退出码 | **`GATE_EXIT=0`**（396 行，**转录的最后一行**） |

**退出码这一格这次可以直接引用转录**：`GATE_EXIT=0` 就在转录里（`grep -n GATE_EXIT` = 第 396 行，`tail -1` 同句），
**这是上一轮（0.13.41）缺的那一格**——那一份转录里 `grep -c "EXIT"` = 0，退出码只有命令层面的读数。这一轮不再有这个缺口。
另外 `grep -nE 'FAIL'` 在整份转录里 **0 命中**。

**转录的指纹**：**23895 字节 / 396 行**、
`sha256 5f5dfc4315a9b372b406a816671dff5c9e8d691ea5002a209bcddfff02427f95`（`wc -lc` + `sha256sum`）。

与上一轮同名的四项读数对照（说明这次发布没把任何一项搞坏）：

| 读数 | `0.13.41`（`a64a50a`） | `0.13.42`（`651f3dd`） |
| --- | --- | --- |
| lint | `15 warnings / 0 errors`，182 files | 同，**184 files**（多一份新 spec） |
| `verify:lib` | `285 files, byte-identical` | 同，**289 files**（多一个 `src/steering-inbox.ts` 及其产物） |
| `client bundle` | `348559` 字节 | 同（客户端逻辑一字未改，只有版本字面量） |
| 用例 | `1927` | **`1941`（+14）** |

## 4. 算术：用例数为什么从 `1927` 变成 `1941`（本轮自己从 git 对象数）

**份数**：`git ls-tree -r --name-only <sha> -- test | grep -c '\.spec\.ts$'`

| 树 | spec 文件 |
| --- | --- |
| `a64a50a`（0.13.41 发布提交） | **102** |
| `ec89b7c`（0.13.42 的父提交） | **103** |
| `651f3dd`（0.13.42 发布提交） | **103** |

份数在 `a64a50a → ec89b7c` 之间 **+1**，在发布提交上没有变化。

**用例数**：静态计数用
`git grep -h -c -E '(^|[^A-Za-z0-9_.$])it\(' <sha> -- 'test/*.spec.ts'` 求和
（**必须带词边界**，否则 `wait(` / `submit(` 会被误数）。

| 树 | 静态 `it(` | 参数化 / 循环补的 | 推得的运行时用例数 | 门禁实测 |
| --- | --- | --- | --- | --- |
| `a64a50a`（0.13.41） | **1852** | +75 | **1927** | `1927`（0.13.41 转录）✔ |
| `ec89b7c`（父提交） | **1866** | +75 | **1941** | 同树 = 发布提交，见下一行 |
| `651f3dd`（发布提交） | **1866** | +75 | **1941** | **`1941`**（本目录转录）✔ 对得上 |

**那个 +14 落在哪儿，说准确**：全落在新增的 **`test/steering-inbox.spec.ts`**（`git grep -c -E '(^|[^A-Za-z0-9_.$])it\(' 651f3dd -- test/steering-inbox.spec.ts` = **14**）。
但它**不是发布提交改的**——`git diff --stat ec89b7c..651f3dd` 里没有任何 `test/` 文件（发布提交只动那 8 个非测试文件）。
`+14` 发生在更早的 `a64a50a → ec89b7c` 那段，也就是「跑中插话」这个功能自己的提交族里。
所以正确的因果是：**0.13.42 这一版的内容（跑中发出的那句话真的并进正在跑的计划）带来 +14，随版发布；
发版提交带来的是 0 条用例。** `ec89b7c` 与 `651f3dd` 的静态数逐字相同（都是 `1866`，本轮各读一次）就是这条因果的直接证据。

**+75 这个参数化差额不是估的，但这一轮没有重数**：它是 `0.13.41` 那一轮拿转录里 102 行 `✓ test/x.spec.ts (N tests)`
与同一棵树逐文件静态数相减量到的，只有 5 个文件运行时多于静态、和正好 75
（`block-preview 39→93`、`block-flag-baseline 7→14`、`objective-limit 6→12`、`fallback-shards 12→16`、`waves 24→28`）。
本轮只用它做一次交叉验算，**没有**把本目录转录的 103 行逐文件读数重做一遍减法——
所以「`+75` 在这一棵树上仍成立」是**沿用上一轮的逐文件读数**（`CONFIRMED`@0.13.41 口径），
而 `1866 + 75 = 1941` 与门禁实测同值 ✔、`1852 + 75 = 1927` 与 0.13.41 门禁同值 ✔，两处交叉都对得上。

## 5. 本次内容（`CONFIRMED`）

`CHANGELOG.md` 现在的形状是：`## [Unreleased]` **空着**，紧接着新的 `## [0.13.42] - 2026-11-26`（`sed -n '1,8p'`）。
挂在它下面的就是那条已经写好的「跑中插话」条目（英、中两半 + 升级说明），**正文一个字没动**——
发布提交对 `CHANGELOG.md` 的贡献只有 **+2**，即那一行标题和它下面的空行。

用户可见的那一件事：**跑着的时候打一句话（Ctrl/⌘+Enter 插话），这句话真的会并进正在跑的计划**——
插件订宿主自己的收件箱事件（`agent/inbox/inserted`），按会话与白名单只认人的原话，
把文本排给这个会话里正在跑的那一轮；边界规划子代理用 `grok_replan_intents` 取走它，并进还没跑的波次，
已验证的成果不重做。**并入的那句话仍然按普通一轮被回复**（它在对话里也还在，两处都会出现，`CHANGELOG` 写明了）。
定时心跳、卡片回答、注入的上下文、子代理的提示词、这一版认不出的来源一律不算；
没有运行在跑的会话直接把这句话忽略。

两份 `README` 的 `5/5` 全是版本字面量：两处安装示例的 `#v0.13.41` → `#v0.13.42`、
那句「`#v0.13.41` is / 是 current release」、那句「package version in this repository is `0.13.41`」，
以及已发布清单的尾巴——英文读作「…… `v0.13.40`, `v0.13.41` and `v0.13.42`」、
中文读作「……、`v0.13.41`、`v0.13.42`」。`docs/LOCAL-TESTING.md` 的 `3/3` 是另一批同样的字面量：
两处 `dsh-grok-workflow-0.13.41.tgz` → `0.13.42.tgz`（本地包安装的例子）。

## 6. 远端两个 run 与 Release（`CONFIRMED`，本轮用 `gh` 重读，不是抄派单）

| run | id | headBranch | headSha | 结论 |
| --- | --- | --- | --- | --- |
| Release | **`45677540409`** | `v0.13.42` | `651f3dd` | **`success`** |
| CI（`main`） | **`45677532418`** | `main` | `651f3dd` | **`success`** |

Release run 细节（`gh run view 45677540409 --json …`）：`displayTitle` = `chore(release): prepare v0.13.42`，
`createdAt 2026-11-25T18:40:26Z`；单个 job **`Validate and publish v0.13.42`** `startedAt 18:40:28Z` → `completedAt 18:41:39Z`
（约 **71 秒**），job `conclusion = success`，**非 success 的步骤 0 个**（按 `conclusion!="success"` 过滤后为空）。

**GitHub Release**：https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.42

- 名字 `Grok Workflow for DSH v0.13.42`、`tagName v0.13.42`、`targetCommitish main`、
  `publishedAt 2026-11-25T18:41:34Z`、`isDraft` **`false`**、`isPrerelease` **`false`**。
- 唯一资产 **`dsh-grok-workflow-0.13.42.tgz` = `980976` 字节**（`gh` 报 `size`），
  摘要 **`sha256:e6efe5eefbc17e225308ca32a87a5df723ddc065e264764451e4919759f714c5`**（`gh` 报 `digest`）。
- 上一版资产 `0.13.41` = **`976529`** 字节（本轮 `gh` 重读）→ **+4447 字节**（`980976 − 976529`）。

**三条判据同时成立才写「已发布」，本轮三条都成立**：run `conclusion=success` ✔、Release 非 draft ✔、
带 `.tgz` 资产 ✔（资产名与字节数见上）。

## 7. 清理（`CONFIRMED`，本轮实测）

- `git worktree list` **只剩主检出一处**（`[main]`；门禁跑在主检出，不存在 `.tmp/wt-release-*`）。
- **本地 `release/0.13.42` 已用 `git branch -d` 删除**（报的是 `Deleted branch release/0.13.42 (was 651f3dd)`）——
  快进合入过的分支才能 `-d`，所以这一步本身也是一次「它确实进了 `main`」的旁证。
- **两处空目录用 `rmdir` 清掉**：`.agents/worktrees/feat` 与 `.worktrees/`。两者**都不是注册过的 worktree**
  （`.worktrees/` 只出现在 `.git/info/exclude` 里、`.agents/worktrees/` 忽略自己的内容），所以**没有动到任何被跟踪的东西**；
  `.agents/worktrees/` 目录本身与它自己的 `.gitignore` 还在。
- **刻意留着的是**三条 `backup/wip-2026-11-24-*` 与 `feat/audit-layer`（历史快照，不是这一版的分支）。
- **没有删任何远端分支**、**没有删 `backup/*`**、**没有删或移动任何 tag**
  （`v0.13.42` 与 `v0.13.41` 都在，见 §2.1）。
- **本节刻意没碰的两处遗留**（都属于别的会话）：`.gitignore` 是 modified、`.rsi/evidence/progress-now/` 是未跟踪
  ——没有暂存、没有提交、没有修改、没有回滚（`git status --short` 复核过）。
- 收尾时 `git status --short` 里没有 `*.log`、`*.tgz`、`*.bak`、`*.orig`、`*~` 之类测试垃圾；
  本目录只有两个文件（`README.md` 与 `gate-651f3dd.out`）。

## 8. `BLOCKED`：live 档案升级（`AGENTS.md` §13 这一步没做成）

**没写、没重载、没重启 3080 上的实例。** 理由：本会话文件策略 `workspace-write`，`~/.dsh` 在工作区之外，
写探测 `: > ~/.dsh/.release-probe` 返回 **`Read-only file system`**（派单记录）。
本轮**没有重试这个探测**——纪律要求不写 `~/.dsh`，重跑一次只是再撞一次同一面墙。

只读的读数（**这些本轮用 `stat` / `grep` 只读复核过一次，没有写任何东西**）：

| 项 | 值 | 怎么读到 |
| --- | --- | --- |
| `~/.dsh` 目录 mtime | `2026-11-25 23:14:14 +0800` | `stat -c '%y' ~/.dsh` |
| `~/.dsh/profiles` mtime | `2026-11-22 16:59:46 +0800` | `stat -c '%y' ~/.dsh/profiles` |
| live 装着的插件版本 | **`0.13.39`** | `grep '"version"' ~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json` |
| 那一行的写法 | `"dsh-grok-workflow": "github:free6589/dsh-grok-workflow"`（**浮动，没有标签固定**） | `~/.dsh/profiles/web/package.json` |

也就是说：**已经发布到 `0.13.42`，live 档案还停在 `0.13.39`，而且那一行是浮动的**——
下一个人要做的事不只是「升到新版」，还要顺手把那一行**钉到 `#v0.13.42`**，
否则它永远跟着 `main` 漂，读回来也不是确定的版本（`AGENTS.md` §13 的要求）。
**下一个人不要尝试写 `~/.dsh`、也不要重启/重载 3080 上的实例**，除非操作员明确点头。

## 9. `NOT_RUN`（照实写，不包装）

| 没做的事 | 为什么 / 现在靠什么覆盖 |
| --- | --- |
| 门禁重跑 | 转录已存在且**自带 `GATE_EXIT=0`**（§3），纪律（`AGENTS.md` §12）是不重跑。 |
| `ec89b7c` 上单独的门禁 | 它与 `651f3dd` 的静态用例数、spec 份数逐字相同，但那一格**没有门禁转录**，所以只有 `651f3dd` 的实测；`ec89b7c` 那一行是靠同树同数推的。 |
| 真机 / 隔离档案 soak（这一轮） | 本轮只做门禁与发布。这个功能的真机读数由 `feat/inbox-steering` 那一轮覆盖（`.rsi/evidence/inbox-steering-2026-11-26/`：投递链通了、但计划没被改的那一次）。 |
| live 档案升级 / 读回新版本 | 见 §8，`BLOCKED`；写不进 `~/.dsh`，所以 live 上没有任何 0.13.42 的痕迹（只有只读读数）。 |
| 逐文件 103 行的运行时数减法 | §4 的 `+75` 沿用 0.13.41 那一轮的逐文件读数，本轮只做总数交叉验算，没有重做减法。 |

## 10. 每条读数能回指哪里

| 读数 | 回指 |
| --- | --- |
| Node / npm / DSH / 内核 | 本轮 `node -v`、`npm -v`、`dsh --version`、`uname -srm` |
| 发布提交 `651f3dd`、父提交 `ec89b7c`、8 文件 / +22 −20、提交时刻 | `git show --stat --numstat 651f3dd`、`git rev-parse 651f3dd^` |
| 版本字面量一对、两份 blob 同 `f2f427d` | `git show 651f3dd -- src/client/index.js`、`git rev-parse ec89b7c:src/client/index.js ec89b7c:lib/client.js 651f3dd:src/client/index.js 651f3dd:lib/client.js` |
| `version: 0.13.42` | `git show 651f3dd:package.json` |
| `main` = `origin/main` = `651f3dd`（ff-only，无第二个合并提交） | `git rev-parse main origin/main`、`git branch -vv`（删除前 `release/0.13.42` 与 `main` 同 sha；删除时报 `was 651f3dd`） |
| 标签对象 `98b9c45` / 剥出 `651f3dd` / tagger 时刻 | `git cat-file -p v0.13.42`、`git rev-parse v0.13.42 v0.13.42^{}`、`date -d @1795632016` |
| 旧标签没被移动 | `git ls-remote --tags origin \| grep 'v0.13.4[12]'`（`v0.13.41 → 96dd9cc`） |
| 门禁全部读数 | `gate-651f3dd.out`（本目录）：1–2 行（包与阶段）、`Found 15 warnings and 0 errors.`(162) 与 `184 files with 96 rules`(163)、`client bundle: 348559 bytes`(168)、`lib/ at 651f3dd … (289 files, byte-identical)`(169)、`RUN  v4.1.12 …`(180)、`Test Files 103 passed (103)`(391) / `Tests 1941 passed (1941)`(392)、`Start at 02:38:20`(393)、`Duration 100.30s`(394)、`GATE_EXIT=0`(396) |
| 转录里没有 FAIL | `grep -nE 'FAIL' gate-651f3dd.out` → **0 命中** |
| 转录指纹 | `wc -lc gate-651f3dd.out`、`sha256sum gate-651f3dd.out` |
| 份数 102 / 103 / 103 | `git ls-tree -r --name-only <sha> -- test \| grep -c '\.spec\.ts$'` |
| 静态用例 1852 / 1866、新 spec 14 条 | `git grep -h -c -E '(^|[^A-Za-z0-9_.$])it\(' <sha> -- 'test/*.spec.ts'` 求和；单文件 `-- test/steering-inbox.spec.ts` |
| `+14` 不在发布提交里 | `git diff --stat ec89b7c..651f3dd`（无 `test/` 文件） |
| +75 的 5 个文件 | `0.13.41` 那一轮：转录 102 行 `✓ … (N tests)` 与 `a64a50a` 逐文件静态数相减（本轮沿用，未重数） |
| 两个 run 的结论与 sha | `gh run view 45677540409 --json …`、`gh run view 45677532418 --json …` |
| Release 名字 / 时刻 / 资产 / 摘要 | `gh release view v0.13.42 --json name,isDraft,isPrerelease,targetCommitish,publishedAt,assets` |
| 上一版资产 976529 / +4447 | `gh release view v0.13.41 --json assets` |
| `CHANGELOG` 形状（`[Unreleased]` 空 → `[0.13.42]`） | `sed -n '1,8p' CHANGELOG.md`、`git show --numstat 651f3dd`（`CHANGELOG.md 2 0`） |
| README 两份的清单尾巴 | `grep -n 'v0\.13\.40' README.md README.zh-CN.md` |
| 清理 | `git worktree list`、`git branch -vv`、`ls -d .worktrees .agents/worktrees/feat`、`git status --short` |
| live 档案只读读数 | `stat -c '%y' ~/.dsh ~/.dsh/profiles`、`grep '"version"' ~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json`、`~/.dsh/profiles/web/package.json` 的依赖行 |

## 11. 红线与偏差，照实记

1. **没有 force-push，没有移动任何已发布标签**：`git ls-remote --tags origin` 本轮重读，
   `v0.13.41` 对象仍是 `96dd9cc`，`v0.13.42` 是新增。
2. **这一轮没有改 `CHANGELOG.md`、`README*`、`src/`、`test/`、`lib/` 的任何一行**：记忆收口只写文档（§7 的两个遗留也没碰）。
3. **`BLOCKED` 不是失败**：live 档案升级缺的是「能写 `~/.dsh`」这一个能力，不是步骤走错；
   而且那次升级的失败模式已经写清——浮动行 + 停在 `0.13.39`。
4. **两处口径要说准**：① 这一份转录**有** `GATE_EXIT=0`（与 0.13.41 相反，§3）；
   ② `+14` 不来自发布提交，来自「跑中插话」这个功能自己（§4）。
5. **一条历史褶皱，一句话记清**：`ec89b7c` 是一颗合并提交，它的第二父 `1243ca7` 本身又是把 `4584b8d`（`main`）
   并进功能尖端 `f809728` 的合并——**功能分支把 `main` 并进自己、`main` 再把分支并进来**，于是留了一对多余的合并。
   什么都没丢：`git diff --stat 4584b8d..ec89b7c` = **37 文件 / +2284 −2**（功能、它的测试、它的证据与记忆文档），
   这一版的全部内容都在里面。
6. **环境读数有变化不是回退**：lint 从 `182 files` 到 `184`、`verify:lib` 从 `285 files` 到 `289`，
   都因为这一版多了 `test/steering-inbox.spec.ts` 与 `src/steering-inbox.ts`（及 `lib/` 产物），不是口径漂移。
