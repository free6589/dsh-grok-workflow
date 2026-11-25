# `release/0.13.40` 发布收口证据（2026-11-26）

这一份是 **`0.13.40` 这次发布**的读数档案：合流面、口径、发布身份、门禁、算术、清理，以及两条**没做成**的事
（`BLOCKED` 的 live 档案升级、`NOT_RUN` 的真机）。目录里唯一的原始文件是 `gate-3778822.out`
（发版门禁转录，22990 字节，`sha256 3faf97bd9b5438c68fe09bf137d0f45b992eaf2b8d956ed203f3a1cc0728382e`
——本轮自己用 `sha256sum` 与 `wc -c` 各读一次）。其余读数的出处写在下面每一行里。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 本轮亲手在源码 / 命令 / 转录里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。**标「派单记录」的行是发布执行方写下的读数，
本轮没有重跑**，只在能便宜核对的场合用 git / `gh` 复核过一次（复核到的地方单独注明）。

## 1. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | `11.19.0` | `npm -v` |
| DSH CLI | `0.2.2-rc.3` | `dsh --version` |
| 内核 / 发行版 | `Linux 7.2.11-arch1-1 x86_64` / `Omarchy` | `uname -srm`、`/etc/os-release` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`） | `git rev-parse main` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

门禁转录是在发布 worktree `.tmp/wt-release-0.13.40` 里产生的（转录第 180 行的 `RUN v4.1.12 … .tmp/wt-release-0.13.40`）；
那个 worktree 已在收尾时删除（见 §8）。

## 2. 合流与冲突面（`CONFIRMED`）

- 发布分支 `release/0.13.40` 从 `main` 尖端 **`db24351`** 开出，`git merge --no-ff feat/progress-flowchart`
  （特性分支尖端 **`60d1a35`**），合并提交 **`aaf8dfb`**，消息
  `merge: the progress page is one flow chart; an all-rejected run turns its summary node amber`。
- 父提交与树：`git cat-file -p aaf8dfb` 读出 `parent db24351…` + `parent 60d1a35…`，
  树 `b28c9b92e03013a4e92b4e1eb44b4a7025ba0b20`。
- **16 个文件冲突**，本轮**自己用 git 对象复核**过这个数：两条分支各自的合流基点（`git merge-base db24351 60d1a35`
  = `57dcf04`）到各自尖端都改过的文件，交集正好 16 个，逐个列出与派单给的那份一致：

  `CHANGELOG.md`、`docs/knowledge/{DECISIONS,DESIGN-progress-tab,HANDOFF,STATE,VALIDATION}.md`、
  `lib/{client.js,progress-tab.js,progress-tab.d.ts,progress-tab.js.map,progress-tab.d.ts.map}`、
  `src/progress-tab.ts`、`src/client/index.js`、`test/{client,progress-tab,i18n-parity}.spec.ts`

  命令：`comm -12 <(git diff --name-only 57dcf04 db24351 | sort) <(git diff --name-only 57dcf04 60d1a35 | sort)`。
  这是「冲突面」的可核对上界——实际冲突集等于它，因为合流轮报告的 16 个与它逐个同名。
- 冲突的归属：`src/` / `lib/` / `test/` 由 `builder` 解；六个文档由合流轮的文档作者解。

## 3. 拍板的口径与落地形态

**口径（操作者给的）**：**「全部被拒」= 汇总节点转琥珀，理由挂在它展开的调用里，不另开卡片。**

落地形态（`src/` 侧由派单记录给出，本轮只做了**点检**，见每行末尾）：

| 事实 | 读到的位置 | 本轮点检 |
| --- | --- | --- |
| 四区模型退场，`deriveProgressFlow` 胜出 | `src/progress-tab.ts` | `ProgressStory` / `deriveProgressStory` 全仓 0 命中；**`ProgressStoryState` 这个五态联合类型名仍在**（它只是「等你点头 / 进行中 / 已完成 / 失败 / 取消」的词表） |
| 新增 `ProgressFlowRejected {drafts, stage:'check'\|'verify', reason}` 与 `ProgressFlowNode.rejected?` | `src/progress-tab.ts:1182`、`:1209` | 两行都读到 |
| 有汇总行 → 最后一次汇总访问的节点 `state:'failed'` 并挂裁决；没有汇总行（`model` 策略在父会话里合成）→ 补一颗无成员的 `summarize` 节点承载 | `deriveProgressFlow` | 派单记录，本轮未逐行复读 |
| `run.summaryFinalDraft` 存在时**通过优先**，裁决不参与显示 | 同上 | 派单记录 |
| 浏览器镜像同一段裁决；`[data-gw-progress-node-calls]` 尾部追加三行 `li.gw-progress-node-rejected[data-gw-progress-node-rejected="drafts\|stage\|reason"]` | `src/client/index.js:4257-4258` | 读到；三条行由 `['stage', t('progress.final.rejectedStage', …)]` 等组成（`:4253`） |
| 只用既有 token、无字面色值 | `src/client/index.js:3934-3935`（`--dsw-alias-label-secondary`、`--dsw-alias-state-warn-primary`） | 读到；这两行的 `var()` 回退值不是颜色（`inherit`）。**注意**：同一文件里进度页别处的 `var(--x, #hex)` 写法仍然存在（`:796-800`），那是既有的五态色表，不是这张裁决行 |
| `data-gw-progress-final-rejected*` 那张卡与新钩子全部消失 | 全仓 grep | 0 命中；`progress.final.rejected` / `-rejectedReason` / 新增 `progress.final.rejectedStage` 三条文案在中英两本字典里各有（`:384` 英文 `Held at {stage}`、`:618` 中文 `卡在{stage}`） |
| 数据通道（`summaryRejected`、两处发送、`summaryGateOutcome`、事件 `tool-workflow/summary-rejected`、`foldProgressRuns`、镜像折叠）一行未改 | —— | 派单记录（合流时是干净带进来的） |
| 决定编号：`D-158` 保留、`feat` 侧重排为 `D-159`（流程图）/ `D-160`（四区版退场） | `docs/knowledge/DECISIONS.md:4469`、`:4525` | 读到，两条各自的「编号说明」也在 |
| `CHANGELOG.md` 的 `## [0.13.40]` 里**删掉了**布局细化（`D-157`）那一条 | `db24351` 的 `[Unreleased]` 有那一段（`See D-157.`），`3778822` 的 `[0.13.40]` 里 `grep -c D-157` = **0** | 读到，两棵树对照过。理由照原文记：那个中间布局在同一个发布里就被流程图取代、从未发布，写进去会让人去找不存在的界面；作者原文留在 `db24351` / `60d1a35` 与 `D-157` 里 |

## 4. 块内门禁（`CONFIRMED`，派单记录；发版门禁在同一个提交族上重跑过同名命令）

只跑碰到的（`AGENTS.md` §12），都在合流树上：

| 命令 | 结果 |
| --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | 退出 0 |
| `npx oxlint src test` | `Found 15 warnings and 0 errors.` / 182 files |
| `npx vitest run test/progress-flow … test/progress-hint-absent`（7 份 spec） | `7 passed (7)` / `282 passed (282)` |
| `npm run build` | `client bundle: 348559 bytes → lib/client.js` |
| `node scripts/verify-lib.mjs`（合流提交 `aaf8dfb` 上） | `lib/ at aaf8dfb is the build of src/ at aaf8dfb (285 files, byte-identical)`，退出 0 |

**这五条本轮没有重跑**；下面 §5 在发布提交 `3778822` 上重跑了 `typecheck` / `lint` / `verify:lib` / `build`，
读数与这五条一致或更强（`348559` 字节、`15 warnings / 0 errors`、`182 files`、`285 files, byte-identical`）。

## 5. 发版门禁（发布提交 `3778822`，`CONFIRMED`，转录在本目录）

`TMPDIR=$PWD/.tmp npm run ci`，在 `3778822` 的干净树上跑一遍整套，**`GATE_EXIT=0`**（转录末行）。
逐条从 `gate-3778822.out` 读到：

| 行 | 转录里的原话 |
| --- | --- |
| 包与阶段 | `> dsh-grok-workflow@0.13.40 ci` → `npm run typecheck && npm run lint && npm run verify:lib && npm test` |
| typecheck | `> tsc -p tsconfig.json --noEmit`（无输出、无错误） |
| lint | `Found 15 warnings and 0 errors.` + `Finished in 55ms on 182 files with 96 rules using 6 threads.` |
| verify:lib | `client bundle: 348559 bytes → lib/client.js` / `lib/ at 3778822 is the build of src/ at 3778822 (285 files, byte-identical)` |
| build | `client bundle: 348559 bytes → lib/client.js` |
| tests | `Test Files  102 passed (102)` / `Tests  1923 passed (1923)` |
| 时长 | `Duration  95.59s (transform 4.50s, setup 0ms, import 10.64s, tests 72.97s, environment 11ms)` |
| runner | `RUN  v4.1.12 /home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-release-0.13.40` |

**转录的指纹**：22990 字节、`sha256 3faf97bd9b5438c68fe09bf137d0f45b992eaf2b8d956ed203f3a1cc0728382e`。

## 6. 算术：份数与用例数（本轮自己从 git 对象数，不抄门禁）

**份数**：`git ls-tree -r --name-only <sha> -- test | grep -c '\.spec\.ts$'`

| 树 | spec 文件 | 说明 |
| --- | --- | --- |
| `db24351`（合流前 `main`） | **102** | 含 `test/progress-layout.spec.ts`（四区版布局，20 条） |
| `3778822`（发布提交） | **102** | 同上但 `progress-layout.spec.ts` **删除**、`progress-flow.spec.ts` **新增**（17 条）——一换一，所以份数不变 |

命令可复核：`comm -12`/`comm -3` 两份 `ls-tree` 的结果，差集就这两个文件。

**用例数**：静态计数用 `git grep -h -c -E '(^|[^A-Za-z0-9_.$])it\(' <sha> -- 'test/*.spec.ts'` 求和
（带词边界，否则 `wait(` / `submit(` 会被误数——第一遍就是被这个坑骗了：不加边界读到 1981 / 2000）。

| 树 | 静态 `it(` | 参数化 / 循环补的 | 推得的运行时用例数 | 门禁实测 |
| --- | --- | --- | --- | --- |
| `db24351` | **1828** | +75 | **1903** | `NOT_RUN`（这一格没有门禁转录，是推的，标 `HYPOTHESIS`；上一轮在 `5388f22` 上的门禁读过同一个 `1903`） |
| `3778822` | **1848** | +75 | **1923** | **`1923`**（转录第 381 行）✔ 对得上 |

那个 **+75** 不是估的：拿转录里 102 行 `✓ test/x.spec.ts (N tests)` 的逐文件运行时数，与同一棵树逐文件静态数相减，
只有 5 个文件运行时多于静态，和正好 75：`block-preview 39→93 (+54)`、`block-flag-baseline 7→14 (+7)`、
`objective-limit 6→12 (+6)`、`fallback-shards 12→16 (+4)`、`waves 24→28 (+4)`；其余 97 个文件相等，
没有任何文件运行时**少于**静态。这 5 个文件在两棵树里的静态数逐字相同，所以在 `db24351` 上同一个 +75 成立。

**逐文件增减（静态计数，`db24351 → 3778822`）**：`client.spec.ts 142 → 151 (+9)`、
`progress-tab.spec.ts 57 → 72 (+15)`、`progress-hint-absent.spec.ts 8 → 7 (−1)`、
`progress-layout.spec.ts 20 → 删除 (−20)`、`progress-flow.spec.ts 新增 (+17)`；`9 + 15 − 1 − 20 + 17 = +20`
——与 `1828 → 1848`、`1903 → 1923` 两处增量同值。

## 7. 发布身份（`CONFIRMED`）

- **发布提交** `3778822` `chore(release): prepare v0.13.40`：**8 文件 / +37 −39**（`git show --stat`）——
  `CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`docs/LOCAL-TESTING.md`、`lib/client.js`、`package-lock.json`、
  `package.json`、`src/client/index.js`。`src/` 与 `lib/` 的 diff 只有版本字面量那一对
  （`PLUGIN_VERSION` / `UPDATE_LATEST` `'0.13.39'` → `'0.13.40'`，两处 blob 都是 `6e8def2 → cf19891`，即两份逐字相同）；
  `git show 3778822:package.json` 的 `version` 是 `0.13.40`。父提交是 `aaf8dfb`（`main` 是 `git merge --ff-only` 前进的，
  所以没有第二个合并提交）。
- **标签** `v0.13.40` 是附注标签：对象 **`14fef642e0de26fa3ca030cdb6dc467067f2b556`**，`type commit`，
  剥出 **`377882221018a53d0a17227183f7c84c78692e92`**；`tagger … 1795624674 +0800` = **2026-11-26 00:37:54 +0800**。
- **远端**：`main`、`origin/main`、标签剥出的提交三者同值 `3778822`（`git rev-parse main origin/main`）。
  `git ls-remote --tags origin` 本轮重读：`v0.13.40` 对象 `14fef64` / 剥出 `3778822`；已发布标签没被移动——
  `v0.13.37 → 34236f0`、`v0.13.38 → 8c9b028`、`v0.13.39 → 18e5463`（对象 `235fa3e` / `2f3e548` / `87a0e0e` 也同值）。
- **两个 run**（本轮用 `gh run view <id> --json …` 重读，不是抄派单）：

  | run | id | headBranch | sha | 结论 |
  | --- | --- | --- | --- | --- |
  | Release | **`45656018189`** | `v0.13.40` | `3778822` | `success`（job `Validate and publish v0.13.40`；派单记录 `gh run watch --exit-status` 退出 0） |
  | CI（`main`） | **`45656011963`** | `main` | `3778822` | `success` |

- **GitHub Release**：https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.40
  ——名字 `Grok Workflow for DSH v0.13.40`、`publishedAt 2026-11-25T16:39:37Z`、`isDraft false`、`isPrerelease false`、
  `targetCommitish main`、正文 **49 行**（`gh release view … -q .body | wc -l`）。
  唯一资产 **`dsh-grok-workflow-0.13.40.tgz` = 973840 字节**（`gh` 报 `size`），摘要
  `sha256:c42c9924748745197947905a27ea0b0d49b90e239d1bfde43d0e4d5df4538383`（`gh` 报 `digest`）。
  上一版资产 `0.13.39 = 962715` 字节（本轮 `gh` 重读），所以 **+11125 字节**。

## 8. 清理（`CONFIRMED`，本轮实测）

- `git worktree list` 只剩主检出 `/home/fish/projects_mine/dsh-grok-workflow 3778822 [main]`；
  `ls -d .tmp/wt-*` 无命中 → `.tmp/wt-release-0.13.40` 与 `.tmp/wt-progress-flowchart` 都不在了。
- `git branch` 只剩 `* main`（外加仅远端的 `origin/main` 等引用与三条 `backup/*`）→
  本地 `release/0.13.40`（was `3778822`）与 `feat/progress-flowchart`（was `60d1a35`）都已删除，
  且它们是用 `git branch -d`（已合入才允许）删的。
- **本轮刻意没碰的两处遗留**：工作区里 `.gitignore` 是 modified、`.rsi/evidence/progress-now/` 是未跟踪
  ——都属于别的会话，与本轮无关，**没有暂存、没有提交、没有修改**（`git status --short` 复核过）。

## 9. `BLOCKED`：live 档案升级（`AGENTS.md` §13 这一步没做成）

**没写、没重载、没重启 3080 上的实例。** 理由（派单记录里的实测）：本会话文件策略 `workspace-write`，
`~/.dsh` 在工作区之外，写探测 `: > ~/.dsh/.merge-probe` 返回 **`Read-only file system`**。
本轮**没有重跑这个探测**——纪律要求不写 `~/.dsh`，重跑一次只是再撞一次同一面墙。所以 live 档案现在读回哪一版，
本轮**没有读**（那也需要在 `~/.dsh` 里读文件；上一轮记录的是 `0.13.39`），标 `NOT_RUN`。

## 10. `NOT_RUN`（照实写，不包装）

| 没做的事 | 为什么 / 现在靠什么覆盖 |
| --- | --- |
| 真机 / 隔离档案 soak（这一轮） | 派单只要求「typecheck + lint + 改到的 spec」。流程图本身由 `feat/progress-flowchart` 那一轮的真机读数覆盖（`.rsi/evidence/progress-flowchart-2026-11-25/`，三态 + 四宽度 + 开节点）。 |
| **「每一稿都被退回」那张琥珀节点在真机上的样子** | **仍然没人见过。** 上一轮 `fix/synth-outcome` 的真机只见过通过态，这一轮没做真机；它只有组件与模型用例覆盖（`test/progress-flow.spec.ts` 里退回态的节点断言、`test/client.spec.ts` 的三行 `li` 断言）。 |
| `db24351` 上的门禁 | 那一格用例数是推的（静态 1828 + 75，见 §6），不是测的。 |
| 从 `~/.dsh` 读回已装版本 | 见 §9，读不到。 |

## 11. 每条读数能回指哪里

| 读数 | 回指 |
| --- | --- |
| Node / npm / DSH / 内核 | 本轮 `node -v`、`npm -v`、`dsh --version`、`uname -srm`、`/etc/os-release` |
| 合流提交 `aaf8dfb`、双父 | `git cat-file -p aaf8dfb` |
| 16 文件冲突面 | `comm -12 <(git diff --name-only 57dcf04 db24351 \| sort) <(git diff --name-only 57dcf04 60d1a35 \| sort)` |
| `deriveProgressFlow` / `ProgressFlowRejected` / `rejected?` | `src/progress-tab.ts:1182`、`:1209`（`grep -n`） |
| 三行 `li.gw-progress-node-rejected` 与两个 token | `src/client/index.js:3934-3935`、`:4253`、`:4257-4258` |
| 三条文案（中英） | `src/client/index.js:384`（英）、`:618`（中）、`:4253`（拼装） |
| `final-rejected*` 钩子 0 命中 | 全仓 `grep -rn 'gw-progress-final-rejected' src lib` |
| `D-159` / `D-160` 与编号说明 | `docs/knowledge/DECISIONS.md:4469`、`:4525`、`:4471`、`:4527` |
| `[0.13.40]` 里没有 `D-157` 那一条 | `git show db24351:CHANGELOG.md` 的 `[Unreleased]`（有）vs `git show 3778822:CHANGELOG.md` 的 `[0.13.40]`（`grep -c D-157` = 0） |
| 块内五条门禁读数 | 派单记录（`builder` 跑；本轮未重跑）；其中 `348559` / `15 warnings` / `182 files` / `285 files` 在 §5 的转录里同名重现 |
| 发版门禁全部读数 | `gate-3778822.out`（本目录）第 2-3、6、10、162、168-169、178、380-383、385 行 |
| 转录指纹 | `sha256sum gate-3778822.out`、`wc -c` |
| 份数 102 / 102 | `git ls-tree -r --name-only <sha> -- test \| grep -c '\.spec\.ts$'` |
| 用例 1848 / 1923、+75 的 5 个文件 | `git grep -h -c -E '(^\|[^A-Za-z0-9_.$])it\(' <sha> -- 'test/*.spec.ts'` 求和；逐文件运行时数取自转录的 `✓ … (N tests)` 行 |
| 发布提交 8 文件 / +37 −39、版本字面量 | `git show --stat 3778822`、`git show 3778822 -- src/client/index.js lib/client.js`、`git show 3778822:package.json` |
| 标签对象 / 剥出 / tagger 时刻 | `git cat-file -p v0.13.40`、`git rev-parse v0.13.40^{}`、`date -d @1795624674` |
| `main` = `origin/main` = `3778822` | `git rev-parse main origin/main` |
| 旧标签没被移动 | `git ls-remote --tags origin`（本轮重读，四组对象 + 剥出各一行） |
| 两个 run 的结论与 sha | `gh run view 45656018189 --json …`、`gh run view 45656011963 --json …` |
| Release 名字 / 时刻 / 资产 / 摘要 / 正文行数 | `gh release view v0.13.40 --json …`、`gh release view v0.13.40 --json body -q .body \| wc -l` |
| 上一版资产 962715 | `gh release view v0.13.39 --json assets` |
| 清理 | `git worktree list`、`ls -d .tmp/wt-*`、`git branch` |

## 12. 红线与偏差，照实记

1. **没有 force-push，没有移动任何已发布标签**：`git ls-remote --tags origin` 本轮重读，`v0.13.37/38/39/40`
   四组对象与剥出都和上一轮记录同值。
2. **`BLOCKED` 不是失败**：live 档案升级缺的是「能写 `~/.dsh`」这一个能力，不是步骤走错。
3. **一处口径要说明**：§6 里 `db24351` 的 `1903` 是**推的**（静态 1828 + 参数化 75），不是测的；
   它与上一轮 `5388f22` 门禁记录的 `1903` 数值相同，但那是另一个提交上的实测，**不能当成 `db24351` 的实测**。
4. **§4 的块内门禁不是本轮跑的**：出处是派单记录；本轮只核对了 §5 那一遍转录，两处的 `348559` / `15` / `182` / `285` 一致。
5. **`ProgressStoryState` 还在**：派单说「四区模型退场」，准确的说法是 `ProgressStory` 与 `deriveProgressStory`
   退场、`ProgressStoryState` 这个五态联合类型名留下当词表用。写记忆时按这个精确口径写。
