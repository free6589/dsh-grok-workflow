# `0.13.41` 发布收口证据（2026-11-26）

这一份是 **`0.13.41` 这次发布**的读数档案：发布身份、门禁、算术（用例数为什么从 `1923` 变成 `1927`）、
远端两个 run 与 Release、清理，以及一条**没做成**的事（`BLOCKED` 的 live 档案升级）。
目录里唯一的原始文件是 `gate-a64a50a.out`（发版门禁转录，**23312 字节**，
`sha256 9ad02f9218a258e7c07f1c27d76d2b49954c7ab37daf5023d7507b23b6420da6`
——本轮自己用 `wc -c` 与 `sha256sum` 各读一次）。其余读数的出处写在下面每一行里。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 本轮亲手在源码 / 命令 / 转录里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。

**本轮的角色**：只做记忆收口，**没有重跑门禁**（转录是发版执行方留下的，本轮只核对）。凡标「派单记录」的读数，
本轮都在能便宜复核的地方用 `git` / `gh` 复核过一次，复核到的地方单独注明。

## 1. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | `11.19.0` | `npm -v` |
| DSH CLI | `0.2.2-rc.3` | `dsh --version` |
| 内核 | `Linux 7.2.11-arch1-1 x86_64` | `uname -srm` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`） | `git rev-parse main` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

门禁转录是在**主检出**里产生的（转录里的 runner 行是 `RUN  v4.1.12 /home/fish/projects_mine/dsh-grok-workflow`，
不是上一轮那种 `.tmp/wt-release-*` worktree），所以这次的清理没有 worktree 要删。

## 2. 发布身份（`CONFIRMED`）

- **发布提交** **`a64a50a35457c7b9579f45a9a59ce1a4385567d0`**，消息 `chore(release): prepare v0.13.41`，
  父提交 **`d35af407c190878f92706f8e78fd9d52d15dae96`**（`git rev-parse a64a50a^`）。
- **8 文件 / +22 −20**（`git diff --stat d35af40..a64a50a`），逐文件增删（`--numstat`）：

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

- **版本字面量只改了一对**：`PLUGIN_VERSION` 与 `UPDATE_LATEST` 都由 `'0.13.40'` → `'0.13.41'`
  （`git show a64a50a -- src/client/index.js lib/client.js`）。两份文件的 blob 都是
  **`cf19891` → `4c4132d`**，即 `src/client/index.js` 与 `lib/client.js` 在发布提交上仍然逐字相同
  （`git rev-parse a64a50a^:lib/client.js a64a50a:lib/client.js a64a50a^:src/client/index.js a64a50a:src/client/index.js`）。
- `git show a64a50a:package.json` 的 `version` 是 **`0.13.41`**。
- **`main` 是 `git merge --ff-only release/0.13.41` 前进的**，没有第二个合并提交：`main` = `origin/main` = **`a64a50a`**
  （`git rev-parse main origin/main`），且 `git merge-base --is-ancestor a64a50a main` 退出 0。

### 2.1 标签（附注标签，`CONFIRMED`）

`git cat-file -p v0.13.41` 原样：

```
object a64a50a35457c7b9579f45a9a59ce1a4385567d0
type commit
tag v0.13.41
tagger fish <free6589@users.noreply.github.com> 1795628771 +0800

Grok Workflow for DSH v0.13.41
```

- 标签**对象** **`96dd9cce3434734213eee281037ccca9ef605e57`**（`git rev-parse v0.13.41`，`git cat-file -t` = `tag`），
  剥出 **`a64a50a35457c7b9579f45a9a59ce1a4385567d0`**（`git rev-parse v0.13.41^{}`）。
- `tagger … 1795628771 +0800` = **2026-11-26 01:46:11 +0800**（`date -d @1795628771`）。
- **已发布标签没被移动**（`git ls-remote --tags origin`，本轮重读；对象值与前几轮记录同值）：

  | 标签 | 对象 | 备注 |
  | --- | --- | --- |
  | `v0.13.41` | `96dd9cc` | 本次，新 |
  | `v0.13.40` | `14fef64` | 未动（上一轮记的就是 `14fef642e0de…`） |
  | `v0.13.39` | `87a0e0e` | 未动 |
  | `v0.13.38` | `2f3e548` | 未动 |
  | `v0.13.37` | `235fa3e` | 未动 |

## 3. 发版门禁（发布提交 `a64a50a`，`CONFIRMED`，转录在本目录）

`TMPDIR=$PWD/.tmp npm run ci`，在 `a64a50a` 的干净树上跑一遍整套。逐条从 `gate-a64a50a.out` 读到：

| 行 | 转录里的原话 |
| --- | --- |
| 包与阶段 | `> dsh-grok-workflow@0.13.41 ci` → `npm run typecheck && npm run lint && npm run verify:lib && npm test` |
| typecheck | `> tsc -p tsconfig.json --noEmit`（无输出、无错误） |
| lint | `Found 15 warnings and 0 errors.` + `Finished in 149ms on 182 files with 96 rules using 6 threads.` |
| verify:lib | `client bundle: 348559 bytes → lib/client.js` / `lib/ at a64a50a is the build of src/ at a64a50a (285 files, byte-identical)` |
| build | `client bundle: 348559 bytes → lib/client.js` |
| tests | `Test Files  102 passed (102)` / `Tests  1927 passed (1927)` |
| 时长 | `Start at  01:42:48` / `Duration  98.22s (transform 3.24s, setup 0ms, import 9.44s, tests 76.66s, environment 11ms)` |
| runner | `RUN  v4.1.12 /home/fish/projects_mine/dsh-grok-workflow` |

**退出码这一格要说明白（诚实边界）**：`EXIT=0` 是**发版执行方那条命令的退出码**（派单记录），
**它不在转录里面**——`grep -c "EXIT" gate-a64a50a.out` = **0**，转录的末行是上面那条 `Duration`。
上一轮（0.13.40）的转录末行确实有一行 `GATE_EXIT=0`（`tail -4 gate-3778822.out`），这一轮没有。
所以「跑完了、全部通过」有转录为证；「退出码 0」是命令层面的读数，读者要复核得自己重跑。
本轮**没有重跑门禁**（纪律：转录已存在，不重跑）。

**转录的指纹**：**23312 字节**、**389 行**、
`sha256 9ad02f9218a258e7c07f1c27d76d2b49954c7ab37daf5023d7507b23b6420da6`（`wc -lc` + `sha256sum`）。

与上一轮同名的四项读数对照（说明这次发布没有把任何一项搞坏）：

| 读数 | `0.13.40`（`3778822`） | `0.13.41`（`a64a50a`） |
| --- | --- | --- |
| lint | `15 warnings / 0 errors`，182 files | 同 |
| `verify:lib` | `285 files, byte-identical` | 同 |
| `client bundle` | `348559` 字节 | 同（客户端逻辑一字未改，只有版本字面量） |
| 用例 | `1923` | **`1927`（+4）** |

## 4. 算术：用例数为什么从 `1923` 变成 `1927`（本轮自己从 git 对象数）

**份数**：`git ls-tree -r --name-only <sha> -- test | grep -c '\.spec\.ts$'`

| 树 | spec 文件 |
| --- | --- |
| `3778822`（0.13.40 发布提交） | **102** |
| `d35af40`（0.13.41 的父提交） | **102** |
| `a64a50a`（0.13.41 发布提交） | **102** |

份数没变——这次发布**没有增删任何 spec 文件**。

**用例数**：静态计数用
`git grep -h -c -E '(^|[^A-Za-z0-9_.$])it\(' <sha> -- 'test/*.spec.ts'` 求和
（**必须带词边界**，否则 `wait(` / `submit(` 会被误数，第一遍就会读到虚高的数）。

| 树 | 静态 `it(` | 参数化 / 循环补的 | 推得的运行时用例数 | 门禁实测 |
| --- | --- | --- | --- | --- |
| `3778822`（0.13.40） | **1848** | +75 | **1923** | `1923`（上一轮转录，本轮未重跑） |
| `d35af40`（父提交） | **1852** | +75 | **1927** | `NOT_RUN`（这一格没有门禁转录） |
| `a64a50a`（发布提交） | **1852** | +75 | **1927** | **`1927`**（本目录转录）✔ 对得上 |

**那个 +4 落在哪儿，说准确**：落在 **`test/replan.spec.ts`**，静态数 **`17 → 21`**。
但它**不是发布提交改的**——`git diff --stat d35af40..a64a50a` 里没有任何 `test/` 文件（发布提交只动那 8 个非测试文件）。
`+4` 发生在 **`3778822 → d35af40`** 之间，也就是「跑中插话」那颗修复自己的提交族里
（`git diff --stat 3778822..d35af40` 能看到 `test/replan.spec.ts | 157 ++++++++++-`）。
所以正确的因果是：**0.13.41 这一版的内容（跑中插话又能送进正在跑的那一轮）带来 +4，随版发布，而不是发版提交带来 +4。**

**+75 这个参数化差额不是估的**：拿转录里 102 行 `✓ test/x.spec.ts (N tests)` 的逐文件运行时数，
与同一棵树（`a64a50a`）逐文件静态数相减，**只有 5 个文件**运行时多于静态，和正好 75：

| 文件 | 静态 | 运行时 | 差 |
| --- | --- | --- | --- |
| `test/block-preview.spec.ts` | 39 | 93 | +54 |
| `test/block-flag-baseline.spec.ts` | 7 | 14 | +7 |
| `test/objective-limit.spec.ts` | 6 | 12 | +6 |
| `test/fallback-shards.spec.ts` | 12 | 16 | +4 |
| `test/waves.spec.ts` | 24 | 28 | +4 |

其余 **97 个文件相等**，**没有任何文件运行时少于静态**。转录 102 行逐文件求和 = **`1927`**，
静态求和 = **`1852`**，`1852 + 75 = 1927` ✔。这 5 个文件在 `3778822` / `d35af40` / `a64a50a` 三棵树里的静态数逐字相同，
所以同一个 +75 在 0.13.40 上成立（`1848 + 75 = 1923` ✔）。

## 5. 本次内容（`CONFIRMED`）

`CHANGELOG.md` 的 `## [0.13.41] - 2026-11-26` **只有一条**（中英同段）：
**跑中插话又能送进正在跑的那一轮** —— 每一轮跑起来时给自己开一条活通道（按会话找到它、波边界规划子代理拿到本轮口令、
运行结束时关闭队列），跑中经 `grok_steer` 排进来的要求在下个波边界并进剩余计划（已验证的成果不重做），
最后一道边界之后才到的要求会在日志里记个数。**从 0.13.35 起没有任何东西开过这个队列**，
所以 `grok_steer` 一直回答「这一块现在没有在跑的 workflow」，这一版修好。`replan` 开关语义不变。

## 6. 远端两个 run 与 Release（`CONFIRMED`，本轮用 `gh` 重读，不是抄派单）

| run | id | headBranch | headSha | 结论 |
| --- | --- | --- | --- | --- |
| Release | **`45668227079`** | `v0.13.41` | `a64a50a` | **`success`** |
| CI（`main`） | **`45668209937`** | `main` | `a64a50a` | **`success`** |

Release run 细节（`gh run view 45668227079 --json …`）：`displayTitle` = `chore(release): prepare v0.13.41`，
单个 job **`Validate and publish v0.13.41`**（job id `139396088423`），`createdAt 2026-11-25T17:46:14Z`，
job `startedAt 17:46:17Z` → `completedAt 17:47:50Z`（约 93 秒）。job 内 16 个有效步骤**全部 `success`**，
包括 `Verify tag commit is on main`、`Verify committed build artifacts`、`Verify tag, package version, and changelog`、
`Package release artifact`、`Create GitHub Release`。

**GitHub Release**：https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.41

- 名字 `Grok Workflow for DSH v0.13.41`、`tagName v0.13.41`、`targetCommitish main`、
  `publishedAt 2026-11-25T17:47:46Z`、`isDraft` **`false`**、`isPrerelease` **`false`**、正文 **23 行**
  （`gh release view v0.13.41 --json body -q .body | wc -l`）。
- 唯一资产 **`dsh-grok-workflow-0.13.41.tgz` = `976529` 字节**（`gh` 报 `size`），
  摘要 **`sha256:22a7923303b253141e618d072ef16b9051830361a0d9bcbe38f2910a660ecdee`**（`gh` 报 `digest`）。
- 上一版资产 `0.13.40` = **`973840`** 字节（本轮 `gh` 重读）→ **+2689 字节**。

**三条判据同时成立才写「已发布」，本轮三条都成立**：run `conclusion=success` ✔、Release 非 draft ✔、
带 `.tgz` 资产 ✔（资产名与字节数见上）。

## 7. 清理（`CONFIRMED`，本轮实测）

- `git worktree list` **只剩主检出**：`/home/fish/projects_mine/dsh-grok-workflow a64a50a [main]`。
- 本地 `release/0.13.41` 用 `git branch -d`（已 ff 合入 `main` 才允许）删除 → **已删除**。
  **只删了这一个本地分支**：**没有删任何远端分支**、**没有删 `backup/*`**（三条 `backup/wip-2026-11-24-*` 仍在）、
  **没有删任何 tag**（`v0.13.41` 与四个旧标签都在，见 §2.1）。
- **本轮刻意没碰的两处遗留**（都属于别的会话）：`.gitignore` 是 modified、`.rsi/evidence/progress-now/` 是未跟踪
  ——没有暂存、没有提交、没有修改、没有回滚（`git status --short` 复核过）。
- 收尾时 `git status --short` 里没有 `*.log`、`*.tgz`、`*.bak`、`*.orig`、`*~` 之类测试垃圾。

## 8. `BLOCKED`：live 档案升级（`AGENTS.md` §13 这一步没做成）

**没写、没重载、没重启 3080 上的实例。** 理由：本会话文件策略 `workspace-write`，`~/.dsh` 在工作区之外，
写探测只会得到只读（`Read-only file system`）。本轮**没有重试这个探测**——纪律要求不写 `~/.dsh`，
重跑一次只是再撞一次同一面墙。所以 live 档案现在读回哪一版，本轮**没有读**（那也要在 `~/.dsh` 里读文件），
标 `NOT_RUN`。**下一个人不要尝试写 `~/.dsh`，也不要重启/重载 3080 上的实例**，除非操作员明确点头。

## 9. `NOT_RUN`（照实写，不包装）

| 没做的事 | 为什么 / 现在靠什么覆盖 |
| --- | --- |
| 门禁重跑 | 转录已存在（§3），纪律是不重跑；而且**转录里没有 `EXIT=` 行**，退出码只有命令层面的读数。 |
| `d35af40` 上的门禁 | 那一格用例数是推的（静态 `1852` + 75），不是测的，标 `HYPOTHESIS`。 |
| 真机 / 隔离档案 soak（这一轮） | 本轮的改动（跑中插话进队）由 `feat/steering-reconnect` 那一轮的真机读数覆盖（`.rsi/evidence/steering-reconnect-2026-11-26/`：六个状态截图 + 逐字文本）。发布轮只做门禁与发布。 |
| 从 `~/.dsh` 读回已装版本 | 见 §8，读不到。 |

## 10. 每条读数能回指哪里

| 读数 | 回指 |
| --- | --- |
| Node / npm / DSH / 内核 | 本轮 `node -v`、`npm -v`、`dsh --version`、`uname -srm` |
| 发布提交 `a64a50a`、父提交 `d35af40`、8 文件 / +22 −20 | `git diff --stat d35af40..a64a50a`、`git diff --numstat d35af40..a64a50a`、`git rev-parse a64a50a^` |
| 版本字面量一对、两份 blob `cf19891 → 4c4132d` | `git show a64a50a -- src/client/index.js lib/client.js`、`git rev-parse a64a50a^:lib/client.js a64a50a:lib/client.js …` |
| `version: 0.13.41` | `git show a64a50a:package.json` |
| `main` = `origin/main` = `a64a50a`（ff-only，无第二个合并提交） | `git rev-parse main origin/main`、`git merge-base --is-ancestor a64a50a main` |
| 标签对象 `96dd9cc` / 剥出 `a64a50a` / tagger 时刻 | `git cat-file -p v0.13.41`、`git rev-parse v0.13.41^{}`、`date -d @1795628771` |
| 旧标签没被移动 | `git ls-remote --tags origin`（本轮重读，五行对象值） |
| 门禁全部读数 | `gate-a64a50a.out`（本目录）：第 2-3 行（包与阶段）、`Found 15 warnings and 0 errors.` 与 `182 files with 96 rules`、`client bundle: 348559 bytes`、`lib/ at a64a50a … (285 files, byte-identical)`、`Test Files 102 passed (102)` / `Tests 1927 passed (1927)`、`Duration 98.22s` |
| 转录里没有 `EXIT=` 行 | `grep -c "EXIT" gate-a64a50a.out` → `0`；对照片 `tail -4 .rsi/evidence/release-0.13.40-2026-11-26/gate-3778822.out` 的最后一行 `GATE_EXIT=0` |
| 转录指纹 | `wc -lc gate-a64a50a.out`、`sha256sum gate-a64a50a.out` |
| 份数 102 / 102 / 102 | `git ls-tree -r --name-only <sha> -- test \| grep -c '\.spec\.ts$'` |
| 静态用例 1848 / 1852、`replan.spec.ts 17 → 21` | `git grep -h -c -E '(^\|[^A-Za-z0-9_.$])it\(' <sha> -- 'test/*.spec.ts'` 求和；单文件用 `-- test/replan.spec.ts` |
| `+4` 不在发布提交里 | `git diff --stat d35af40..a64a50a`（无 `test/` 文件）vs `git diff --stat 3778822..d35af40`（有 `test/replan.spec.ts`） |
| +75 的 5 个文件 | 转录里 102 行 `✓ … (N tests)` 与 `a64a50a` 逐文件静态数相减 |
| 两个 run 的结论与 sha | `gh run view 45668227079 --json …`、`gh run list --workflow ci.yml --limit 5 --json …` |
| Release 名字 / 时刻 / 资产 / 摘要 / 正文行数 | `gh release view v0.13.41 --json …`、`gh release view v0.13.41 --json body -q .body \| wc -l` |
| 上一版资产 973840 / +2689 | `gh release view v0.13.40 --json assets` |
| 清理 | `git worktree list`、`git branch -vv`、`git status --short` |

## 11. 红线与偏差，照实记

1. **没有 force-push，没有移动任何已发布标签**：`git ls-remote --tags origin` 本轮重读，
   `v0.13.37/38/39/40` 四组对象值与上一轮记录同值，`v0.13.41` 是新增。
2. **`CHANGELOG.md` 一个字没改**：它在发布提交里已经是 `0.13.41` 的成品，本轮只读。
3. **`BLOCKED` 不是失败**：live 档案升级缺的是「能写 `~/.dsh`」这一个能力，不是步骤走错。
4. **两处口径要说准**：① `EXIT=0` 不在转录里（§3）；② `+4` 不来自发布提交，来自「跑中插话」修复自己（§4）。
   这两处都是读者最容易按想当然写错的地方。