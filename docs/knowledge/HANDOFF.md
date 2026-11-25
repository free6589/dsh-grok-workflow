## 2026-11-26 — `0.13.45` 已发布并收口：一个发布提交（8 文件 / +22 −20、单父）、一份门禁 `GATE_EXIT=0`（`103 files / 1948 tests`）、`main` 尖端 `63793eb`、附注标签、两个远端 run 与 Release 资产都在；**live 档案升级仍 `BLOCKED`**（live 里装的仍读 `0.13.39`）、**真机 soak `NOT_RUN`**

- **From:** 包工头（`agent-194`）· **To:** 下一个接手者 / 能在本机写 `~/.dsh` 的人
- **这一轮是什么**：**发版轮 + 收口轮**，不写代码。`0.13.45` 已经出去（tag 推了、Release 建了、资产在）；
  本轮只做三份记忆（`STATE` / 本文件 / `VALIDATION`）+ 一份证据索引
  （`.rsi/evidence/release-0.13.45-2026-11-26/README.md`），然后提交推送、清掉发布 worktree。
  **没有重跑门禁、没有跑任何 npm 脚本、没有碰 `src/` / `test/` / `lib/`**（`AGENTS.md` §12），
  所以**这一轮没有红可记**——用户拿到的那条行为的红/绿在功能轮 `fix/settled-rows` 那一条里
  （`git stash push -- src` → `1 failed | 24 skipped`），见本文件下方。
- **身份**：发布提交 **`63793eb93b19723d4ec2e90ec23c86a1804a53a7`** `chore(release): prepare v0.13.45`，
  父提交 **`e2ed221`**（**单父，发布提交不是合并**），**8 文件 / +22 −20**，全是版本字面量与清单尾巴：
  `CHANGELOG.md` +2 −0（只插入 `## [0.13.45] - 2026-11-26` 标题行 + 它上面一个空行；`### Fixed / 修复`
  那段的条目正文中英一字未改，`## [Unreleased]` 留空站在上面）、`README.md` 5/5、`README.zh-CN.md` 5/5、
  `docs/LOCAL-TESTING.md` 3/3（三处 tarball 名：第 77 行的安装示例、第 163 与第 164 行的打包 + 安装）、
  `lib/client.js` 2/2、`package-lock.json` 2/2（第 3 行与第 9 行两处）、`package.json` 1/1、
  `src/client/index.js` 2/2；`src/` 与 `lib/` 的唯一改动是 `PLUGIN_VERSION` / `UPDATE_LATEST`
  `'0.13.44'` → `'0.13.45'`（`lib/client.js` 与 `src/client/index.js` 是**同一个 blob**，
  `ea4d107` → `93b7562`，各 **348559 字节**）。**附注标签 `v0.13.45`** 对象
  **`ca4a42c618b469a5bfc6db5442c8530c59a79065`** → 剥出 `63793eb`、消息 `Grok Workflow for DSH v0.13.45`、
  `tagger` 时刻 **2026-11-26 05:11:02 +0800**（`1795641062 +0800`），标签上的 `package.json` 读 `0.13.45`。
  **`main` = `origin/main` = 发布提交 = 标签剥出的提交 = `63793eb`**，没有 force-push、没有移动任何已发布标签
  （本轮重读 `v0.13.41` `96dd9cc`/`a64a50a`、`v0.13.42` `98b9c45`/`651f3dd`、`v0.13.43` `e084e4b`/`549a579`、
  `v0.13.44` `e1a0044`/`7cc4a90`，四条与开工前基线逐字一致）。
- **一处历史褶皱照实记**：`main` 上有一对**内容相同**的合并提交 `d975dba`（父 `d6c338e` + `a3ef7e1`）与
  `e2ed221`（父 `d6c338e` + `d975dba`），`git diff d975dba e2ed221` 为空、两棵树都是 `dc11ac3`——第二颗是空合并，
  什么都没丢、也没有重写历史；发布提交 `63793eb` 是它的单父子提交。
- **用户看到的一件事**：跑中加进来的要求，是拿一份「做完的那一半看得见判决和标题」的计划来判的。
  **口径要写准**：简报列了两条内容，但**「钥匙被拒会在同一条路由上再问一次」那条已经在 `0.13.44` 发出去过**
  （`fix/auth-retry` 轮、`D-164`），`0.13.45` **只带**「已沉淀行」这一条；`v0.13.44..main` 里除记忆/证据提交之外
  只有一颗产品提交 `4fc24b3`（加 `a3ef7e1` 证据与两颗合并）。升级须知是「不用准备任何东西」。
- **门禁读数（一份，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci`、worktree `.tmp/wt-release-0.13.45` 的干净树、
  `HEAD = 63793eb`、**`GATE_EXIT=0`**。转录 `.rsi/evidence/release-0.13.45-2026-11-26/gate-release-63793eb.out`
  （**412 行 / 25328 字节**、`sha256 0649e838902ccd513ab6c8650fc6c51d6c1cc573bbc90199f0f94b45054fd0a0`、
  末行 `GATE_EXIT=0`；与本轮那份原件 `cmp` 逐字节相同）。读数：第 2 / 6 / 10 行读作
  `> dsh-grok-workflow@0.13.45 ci` / `… typecheck` / `… lint`（**门禁树里 `package.json` 已经是 `0.13.45`**）、
  第 162 行 `Found 15 warnings and 0 errors.`、第 163 行 `Finished in 87ms on 184 files with 96 rules using 6 threads.`、
  第 168 与第 178 行 `client bundle: 348559 bytes → lib/client.js`（同值）、第 169 行
  `lib/ at 63793eb is the build of src/ at 63793eb (289 files, byte-identical)`、第 407 行
  **`Test Files 103 passed (103)`**、第 408 行 **`Tests 1948 passed (1948)`**、第 410 行
  `Duration 147.60s (transform 2.83s, setup 0ms, import 10.05s, tests 125.49s, environment 11ms)`、
  第 412 行 `GATE_EXIT=0`。`grep -cE 'FAIL|failed'` = **4，四条都不是失败**（`FAIL` 0 命中）：
  checkpoint 夹具故意造的 `[smoke] status=failed …`（第 209 行）、用例标题
  `✓ re-fires once when the answer cannot be parsed, then reports a failed judge`（第 261 行）、用例标题
  `✓ maps in_progress→running and failed→blocked with the detail as blockedReason`（第 307 行）、
  `stderr | … keeps still reading, read failed and not served as three different pages` 那条日志（第 310 行）。
  **没有第二份门禁**：父提交 `e2ed221` 就是功能轮的合流尖端，那一轮已带自己的块内门禁
  （`.rsi/evidence/settled-rows-2026-11-26/`：`gate-typecheck.out`、`gate-lint.out`、`gate-specs.out` 45 passed、
  `gate-build.out`、`gate-docs-guards.out`、`red-before-fix.out`）。
- **用例算术（本轮从 git 对象数过）**：spec 文件 `v0.13.44` → `main` **103 → 103**（没有增删测试文件）；
  `test/replan.spec.ts` 带词边界的 `it(` **24 → 25**（+1，就是 `4fc24b3` 那例 `runReal`）；所以
  **1947 → 1948** 来自功能提交、不随发版提交走（`git diff --name-only v0.13.44 main -- test` 只有这一个文件）。
- **远端读数（`gh run view` 重读）**：Release run **`45701977660`**（workflow `Release`、`headBranch v0.13.45`、
  sha `63793eb`、**success**、单 job `Validate and publish v0.13.45`、`2026-11-25T21:11:15Z → 21:12:34Z` 约 1m19s、
  run 建于 `21:11:12Z` / 更新 `21:12:35Z`，`gh run watch … --exit-status` 退出 0）、`main` 的 CI run
  **`45701972085`**（sha `63793eb`、**success**）；GitHub Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.45 名字 `Grok Workflow for DSH v0.13.45`、
  `publishedAt 2026-11-25T21:12:30Z`、非 draft / 非 prerelease、target `main`、正文 **2151 字节**
  （`gh release view --json body` 读回 17 行正文 + 末尾一个换行）、唯一资产
  **`dsh-grok-workflow-0.13.45.tgz` = 988089 字节**、摘要
  `sha256:8d56730583a0c22f429d2e54eef7f4272be3adc8fc1ba0d1da41b9daae985ad9`（上一版 987079 → **+1010**）。
- **`BLOCKED`（`AGENTS.md` §13 的 live 档案升级，就是下一件事）**：**没做成**——本会话文件策略 `workspace-write`、
  `~/.dsh` 在工作区外，写探测 `: > ~/.dsh/.release-probe-0.13.45` 返回 **`Read-only file system`**（退出 1、只试一次、
  没有重试），**没写、没重载、没重启**，3080 那个实例全程没碰；只读读到的：live 档案里装的
  `dsh-grok-workflow` 仍读 **`0.13.39`**，mtime `~/.dsh` `2026-11-25 23:14:14`、`~/.dsh/profiles`
  `2026-11-22 16:59:46`、`profiles/web/cordis.patch.yml` `2026-11-25 23:04:40`。
- **下一步那一件事**：由**有写权限的人**把 live 那条插件行钉到**确切的标签 `v0.13.45`**（绝不用浮动范围、`latest`
  或分支名），把装好的版本读回来确认；读不回 `0.13.45` 就回滚那一行——跑发布版时它必须读作 `0.13.45`。
- **`NOT_RUN`（真机 soak）**：发版轮没有新行为可 soak；这里发出去的行为是 `fix/settled-rows` 那一轮在隔离档案里
  用真模型验过的（证据 `.rsi/evidence/settled-rows-2026-11-26/`）。本轮也没跑门禁、没跑任何 npm 脚本。
- **清理（推送成功后做，已做完）**：`git worktree remove .tmp/wt-release-0.13.45`（`git worktree list` 现在只剩主检出
  `/home/fish/projects_mine/dsh-grok-workflow 63793eb [main]`）、`git branch -d release/0.13.45`；
  **远端分支一个不删、标签一个不删**。`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪) 是别的会话的
  遗留，没碰、没暂存、没提交。

---

## 2026-11-26 — `fix/settled-rows`：边界子读到的是结算行本身（判决 + 标题），不再是 `[undefined] `；真机两道边界都读对了；未合 `main`、未 push、未发版

（**本节「未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.44`」的现状已被上面这一轮取代**：那个修复已经并进 `main`（`4fc24b3` + `a3ef7e1`，两道合并 `d975dba` / `e2ed221`）并随 **`0.13.45`** 发布（`main` 尖端 = 发布提交 = `63793eb`、附注标签 `v0.13.45`）。本节其余内容原样保留。）

- **From:** 包工头（`agent-193`）· **To:** 下一个接手者
- **这一轮是什么**：修 `fix/replan-shape` 在真机上照实记下、当时判「留给下一块」的那条观察。调用点把
  「编号 → 状态」的字符串表交给 `requestReplan`，而 `replanPrompt` 按 `row.status` / `row.task.title` 读，
  于是 `SETTLED TASKS` 每一行印成 `- count-agents [undefined] `——边界子看不到已沉淀任务过了没有、叫什么。
- **身份**：分支 **`fix/settled-rows`**，从 `main` 尖端 **`d6c338e`** 开出（worktree `.tmp/wt-settled-rows`）。
  改动面：`src/script.ts`（调用点交**结算行本身**、`requestReplan` 形参改名 `settledRows` 并原样传给
  `replanPrompt`、给 `mergeReplan` 的状态从同一批行派生）、`test/replan.spec.ts`（+1 例 `runReal`）、
  重建 `lib/`、`CHANGELOG` 一条、`D-165`、证据目录、`STATE` / `VALIDATION` 与本文件。
  **`replanPrompt` 的渲染一行没改，`src/replan.ts` 一个字没动。**
- **用户看到的一件事**：跑中加进来的要求，是拿一份「做完的那一半看得见」的计划来判的。
- **块内门禁**：`tsc` 0、`oxlint 15 warnings / 0 errors / 184 files`、定向 3 份 spec **`45 passed`**、
  `client bundle: 348559 bytes`（浏览器包没动）；红：`git stash push -- src` → **`1 failed | 24 skipped`**，
  读作 `expected '- a [undefined] ' to be '- a [verified] Task a'`；全量 `npm run ci` `NOT_RUN`（§12）。
- **真机读数（`CONFIRMED`）**：隔离档案 `settled-clone`（克隆自 live web，只删 `mode: triage`、把默认模型与六个角色
  钉到 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`）、端口 3487、headless Chromium + 上一轮的 CDP 驱动；
  装本轮 tgz（`lib/script.js` `sha256 233d327e…2e22` 与工作树逐字节相同、版本读回 `0.13.44`）后跑一次三波的小活：
  `Plan: planner; 3 task(s); 3 verified`、`COMPLETED`；边界 1 读作 `- count_readme [verified] 统计 README.md 行数`，
  边界 2 读作 `- count_readme [verified] …` + `- count_changelog [verified] …`，**两份提示词都不含 `undefined`**。
  证据 `.rsi/evidence/settled-rows-2026-11-26/`（`soak/boundary-settled-lines.txt` 是逐字抽取）。
- **下一个人的三条**：① **真机只跑了「两道边界、都 `none`」这一态**——「合并被拒 / 边界子补丁式编辑」两态没跑
  （合并器契约没改、单测覆盖）；要补就在同一条隔离档案里让边界子回一条 `apply`。② **`SETTLED TASKS` 的 `- none`
  分支没在真机上出现**（要有边界而一个任务都没沉淀），只有单测；③ 合 `main`、push、发版、live 档案升级
  **都没做**，live 档案在本会话里仍只读（写探测 `Read-only file system`）。
- **清理（已做完）**：scratch `.tmp/soak`（**275 MB**：档案克隆 + tgz + chromium 用户目录 + 解压后的会话日志 + npm cache）
  整棵删除，3487 / 9223 已关；worktree 与它的 `node_modules` 留着（分支未合）。

---

## 2026-11-26 — `0.13.44` 已发布并收口：一个发布提交（8 文件 / +22 −20）、一份门禁 `GATE_EXIT=0`（`103 files / 1947 tests`）、`main` 单父前进（无合并提交）、附注标签、两个远端 run 与 Release 资产都在；**live 档案升级仍 `BLOCKED`**

- **From:** 包工头（`agent-191`）· **To:** 下一个接手者 / 能在本机写 `~/.dsh` 的人
- **这一轮是什么**：**发版轮 + 收口轮**，不写代码。`0.13.44` 已经出去（tag 推了、Release 建了、资产在）；
  本轮只做三份记忆 + 一份证据，然后提交推送、清掉发布 worktree。**没有重跑门禁、没有跑任何 npm 脚本、
  没有碰 `src/` / `test/` / `lib/`**（`AGENTS.md` §12），所以**没有红可记**。
- **身份**：发布提交 **`7cc4a901f1081feb774092c0dd51accc29d58086`** `chore(release): prepare v0.13.44`，
  父提交 **`649c4e4`**（**单父，发布提交不是合并**），**8 文件 / +22 −20**，全是版本字面量与清单尾巴：
  `CHANGELOG.md` +2（只插入 `## [0.13.44] - 2026-11-26` 这一行标题，空的 `## [Unreleased]` 留空站在上面，
  条目正文中英一字未改）、`README.md` 5/5、`README.zh-CN.md` 5/5、`docs/LOCAL-TESTING.md` 3/3、
  `lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、`src/client/index.js` 2/2；
  `src/` 与 `lib/` 的唯一改动是 `PLUGIN_VERSION` / `UPDATE_LATEST` `'0.13.43'` → `'0.13.44'`
  （两个文件 `cmp` 逐字节相同、各 **348559 字节**）。**附注标签 `v0.13.44`** 对象
  **`e1a00440e4205d42fd0665a20ee2a17dca3df6ce`** → 剥出 `7cc4a90`、消息 `Grok Workflow for DSH v0.13.44`、
  `tagger` 时刻 **2026-11-26 04:23:06 +0800**（`1795638186 +0800`），标签上的 `package.json` 读 `0.13.44`。
  **`main` = `origin/main` = 发布提交 = 标签剥出的提交 = `7cc4a90`**，**没有第二个合并提交、没有 force-push、
  没有移动任何已发布标签**（本轮重读 `v0.13.40` `14fef64`/`3778822`、`v0.13.41` `96dd9cc`/`a64a50a`、
  `v0.13.42` `98b9c45`/`651f3dd`、`v0.13.43` `e084e4b`/`549a579`，四条与开工前基线逐字一致）。
  **一处历史褶皱照实记**：`main` 上有一对**内容相同**的合并提交 `7add053`（父 `7f0a47f` + `2055249`）与
  `649c4e4`（父 `7f0a47f` + `7add053`），`git diff 7add053 649c4e4` 为空——第二颗是空合并，什么都没丢。
- **用户看到的一件事**：网关第一次用钥匙错误拒掉调用的那种运行会**照常跑完**——被拒的调用在同一条路由上先重发一次
  （两条判腿在同一次尝试里把裁判再问一遍，规划腿对准拒的那条路由再问一次计划，最多一次额外子调用），
  而这条路**仍然不被记成死路**。升级须知是「不用准备任何东西」。**只有这一条**；`0.13.43` 那条（边界子请求单形状）
  上一版就已经发出去了。
- **门禁读数（一份，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci`、发布 worktree `.tmp/wt-release-0.13.44`
  的干净树、`HEAD = 7cc4a90`、**`GATE_EXIT=0`**。转录
  `.rsi/evidence/release-0.13.44-2026-11-26/gate-release-7cc4a90.out`（**372 行 / 21960 字节**、
  `sha256 9af222b39e8a4a7174d700ecd3ec271c2365061cd90003bc95823259f5f8c41a`）。读数：
  `Found 15 warnings and 0 errors.` + `Finished in 96ms on 184 files with 96 rules`、
  `client bundle: 348559 bytes → lib/client.js`（第 168、178 行各一次、同值）、
  `lib/ at 7cc4a90 is the build of src/ at 7cc4a90 (289 files, byte-identical)`、
  **`Test Files 103 passed (103)` / `Tests 1947 passed (1947)`**、`Duration 81.75s`。
  `grep -cE 'FAIL|failed'` 命中 2 条，**两条都不是失败**（用例标题里的 `read failed`、checkpoint 夹具故意造的
  `[smoke] status=failed`，两个 spec 都是 ✓）。**没有第二份门禁**：父提交 `649c4e4` 就是功能轮的合流尖端，
  那一轮已带自己的块内门禁（`.rsi/evidence/auth-retry-2026-11-26/`）。
- **远端读数（`gh run view` 重读）**：Release run **`45694469431`**（`headBranch v0.13.44`、sha `7cc4a90`、
  **success**、单 job `Validate and publish v0.13.44`、约 1m28s）、`main` 的 CI run **`45694462916`**（sha `7cc4a90`、
  **success**）；GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.44
  名字 `Grok Workflow for DSH v0.13.44`、`publishedAt 2026-11-25T20:24:43Z`、非 draft / 非 prerelease、target `main`、
  正文 **21 行 / 2598 字节**、唯一资产 **`dsh-grok-workflow-0.13.44.tgz` = 987079 字节**（上一版 984828 → **+2251**）。
- **`BLOCKED`（`AGENTS.md` §13 的 live 档案升级）**：**没做成**——本会话文件策略 `workspace-write`、`~/.dsh` 在工作区外，
  写探测 `: > ~/.dsh/.release-probe-0.13.44` 返回 **`Read-only file system`**，**没写、没重载、没重启**；
  live 档案现在装的是哪一版**本轮没读**（`NOT_RUN`，不猜）。**`NOT_RUN`** 还有一条：本轮没做真机 soak——
  发版轮没有新行为可 soak，这里发出去的行为是 `fix/auth-retry` 那一轮在真机上验过的。
- **下一步那一件事**：由**有写权限的人**把 live 那条插件行钉到**确切的标签 `v0.13.44`**（绝不用浮动范围、`latest`
  或分支名），把装好的版本读回来确认；读不回 `0.13.44` 就回滚那一行——跑发布版时它必须读作 `0.13.44`。
- **清理（推送成功后做）**：`git worktree remove .tmp/wt-release-0.13.44`、`git branch -d release/0.13.44`；
  **远端分支一个不删**，本来就存在的三条 `backup/wip-2026-11-24-*` 与 `feat/audit-layer` 不许动。
  `.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪) 是别人的遗留，没暂存、没提交。

---

## 2026-11-26 — `fix/auth-retry`：钥匙被拒现在会在同一条路由上再问一次（判腿不再重跑干活那条腿、规划腿不再落兜底）；真机一次运行 `COMPLETED` 且同一条路由被再问一次；未合 `main`、未 push、未发版

- **From:** 包工头（`agent-190`）· **To:** 下一个接手者
- **这一轮是什么**：`D-120` 当年写下的判断是「拒 = 需要一把钥匙，不是另一条路由」，于是钥匙被拒**既不进死路表、也不走
  任何重发走廊**。前半句仍然对，后半句这一轮改掉：拒常常只针对**这一次请求**（网关轮换上游凭据时对第一个请求回 401、
  下一个就正常），而代价很贵——判腿记下「没有判」→ 整轮重试，干活那条腿为没人做过的判决重跑；规划腿落兜底切分，
  兜底计划永远报不出 `completed`。
- **身份**：分支 **`fix/auth-retry`**，从 `main` 尖端 **`7f0a47f`** 开出（worktree `.agents/worktrees/fix-auth-retry`）。
  改动面：`src/script.ts`（新谓词 `refusalDeath`、`judgeLegTransportDeath` 改读它、判腿日志分两种死因、规划腿 C 走廊加
  同路重问一次、三处注释）、`src/child-outcomes.ts`（注释一句）、`test/planner-resubmit.spec.ts` 10 → 12、
  `test/judge-leg-retry.spec.ts` 8 → 9、`test/dead-routes.spec.ts`（注释）、重建 `lib/`、`CHANGELOG` 的 `[Unreleased]`
  一条（英/中 + 升级须知）、`D-164`、`RESEARCH.md` 一条、`STATE` / `VALIDATION` 与本文件、证据目录。
  **`ROUTE_HEALTH_FAMILIES` 一个字没动**：钥匙被拒仍然永远不进死路表。
- **用户看到的一件事**：网关第一次用钥匙错误拒掉调用的那种运行会**照常跑完**，代价正好是一次额外子调用。
- **块内门禁**：`tsc` 0、`oxlint 15 warnings / 0 errors / 184 files`、定向 9 份 spec **`165 passed`**、
  `client bundle: 348559 bytes`（浏览器包没动）；红：`git stash push -- src` → **`3 failed / 18 passed`**；
  全量 `npm run ci` `NOT_RUN`（§12）。
- **真机读数（`CONFIRMED`）**：隔离档案 `authretry-clone`、规划腿独占一个「第一次 401、之后透传」的小代理 provider
  （`authprobe` → `127.0.0.1:18190` → 真网关 `18088`）、端口 3455、headless Chromium + CDP 驱动。
  运行 `818754a2…`：规划腿第一行 `attempt 1 / failed / model-unavailable`（理由逐字带 401），两个规划子会话
  `seq 1 failed` → `seq 2 completed`、`request/context` 都是**同一条** `authprobe/opencode-go/muse-spark-1.3-contributor`，
  小代理 `seq 1 → 401 injected`、`seq 2/3/4 → 200`，报告 `COMPLETED` / `Plan: planner; 2 task(s); 2 verified`。
  证据 `.rsi/evidence/auth-retry-2026-11-26/`。
- **下一个人的四条**：① **判腿那条走廊的真机没单独跑**（同一个谓词，单测覆盖）；要补就是在同一次隔离档案里让 verifier
  第一次回 401、看 `judgeRetried` 与干活那条腿只跑一次。② **多路由链上的「同一条路由」按链序取最后一条**
  （`plannerSpent` 是链序不是尝试序）：走链顺序被并发提示打乱时，重问落到的是「一条拒过的路由」而不一定是最后那条——
  `D-164` 的 Consequences 里写了取舍。③ **按分类而不是按理由文本判定**，所以 `model-unavailable` 也包含「这条路由没有
  这个模型」，那种情况会多花一次调用、学不到东西；想收窄只能等宿主把「钥匙」和「模型不存在」分成两类。
  ④ `SETTLED TASKS` 每行仍读作 `- count-agents [undefined] `（上一轮记下的独立小活，本轮没动）。
- **清理（已做完）**：scratch `.tmp/soak`（**283 MB**：档案克隆 + tgz + chromium 用户目录 + npm cache）与
  `.npm-ci.log` 全部删除；`.tmp/` 只剩 `node-compile-cache`。worktree 与它的 `node_modules` 留着（分支未合）。

---

## 2026-11-26 — `0.13.43` 已发布并收口：发布轮无代码改动、两次门禁 `GATE_EXIT=0`（`103 files / 1944 tests`）、`main` 快进、附注标签、两个远端 run 与 Release 资产都在；**live 档案升级仍 `BLOCKED`**

- **From:** 发布包工头（`agent-188`）· **To:** 下一个接手者 / 能在本机写 `~/.dsh` 的人
- **这一轮是什么**：**发版轮 + 收口轮**，不写代码。`0.13.43` 已经出去（tag 推了、Release 建了、资产在），
  本轮只做三份文档 + 一份证据：`STATE` / `HANDOFF` / `VALIDATION` 各加一条，新证据目录
  `.rsi/evidence/release-0.13.43-2026-11-26/README.md`。**没有重跑门禁、没有跑任何 npm 脚本、没有碰
  `src/` / `test/` / `lib/`**（`AGENTS.md` §12）；本轮**没有代码改动可记红**。
- **身份**：发布提交 **`549a5790a03f1be67bb1c5b08803a1a940b1f37f`** `chore(release): prepare v0.13.43`，
  父提交 **`532d4cf`**，**8 文件 / +22 −20**，全是版本字面量与清单尾巴（`src/` 与 `lib/` 只有
  `PLUGIN_VERSION` / `UPDATE_LATEST` `'0.13.42'` → `'0.13.43'`，两份 blob 同为 `5ecf0d8`、各 **348559 字节**、
  `cmp` 逐字节相同）。**附注标签 `v0.13.43`** 对象 **`e084e4b8ad0ae7acec5a7ccaf045fa09f27f5577`**、剥出 `549a579`、
  消息 `Grok Workflow for DSH v0.13.43`、`tagger` 时刻 **2026-11-26 03:33:33 +0800**（`1795635213 +0800`）。
  **`main` = `origin/main` = 门禁提交 = 标签剥出的提交 = `549a579`**（直接 push 快进 `532d4cf..549a579`，
  **没有第二个合并提交**；本轮**没有建 worktree、也没有 worktree 要删**）。**没有 force-push、没有移动已发布标签**
  （本轮重读 `v0.13.42^{}` → `651f3dd`、`v0.13.41^{}` → `a64a50a`、`v0.13.40^{}` → `3778822`）。
  **一处偏差**：早几轮走 `release/0.13.4x` + `--ff-only`，这一轮直接提交在 `main` 上推，结果等价、少一条分支。
- **两次门禁（`CONFIRMED`）**：门禁 #1 在抬版本之前的树 **`532d4cf`**（证明改动在 bump 前就是绿的）、
  门禁 #2 在发布树 **`549a579`**，都是 `TMPDIR=$PWD/.tmp npm run ci`、干净树、`GATE_EXIT=0`：
  `Found 15 warnings and 0 errors.`（184 文件、96 条规则）、`client bundle: 348559 bytes → lib/client.js`、
  `lib/ at <sha> is the build of src/ at <sha> (289 files, byte-identical)`、
  **`Test Files 103 passed (103)` / `Tests 1944 passed (1944)`**；`Duration` 分别 `102.56s` 与
  `107.03s (transform 3.29s, setup 0ms, import 9.83s, tests 84.63s, environment 12ms)`。
  门禁 #2 之后 `git status --short` 只剩那两处遗留 → **提交的 `lib/` 就是提交的 `src/` 的构建**。
- **算术（本轮从 git 对象数过）**：spec 文件 `532d4cf` **103** → `549a579` **103**（发布提交不碰任何 `test/` 文件，
  `git diff --name-only … -- test` = **0**），用例 **1944 / 1944**。**仅供对照**：`0.13.42` 发的是
  `103 files / 1941 tests`，那 **+3** 来自功能提交 `38d64bb`（`test/replan.spec.ts` 21 → 24），本轮之前就已在 `main` 上。
- **两个远端 run（`gh run view` 重读，不是抄的）**：Release run **`45686411703`**
  （`headBranch v0.13.43`、sha `549a579`、**success**、单 job `Validate and publish v0.13.43`，
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45686411703 ）与 CI run **`45686404326`**
  （`main`、sha `549a579`、**success**，https://github.com/free6589/dsh-grok-workflow/actions/runs/45686404326 ），
  两个都用 `gh run watch --exit-status` 盯到退出 0。**Release** https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.43
  名字 `Grok Workflow for DSH v0.13.43`、`publishedAt 2026-11-25T19:35:15Z`、非 draft / 非 prerelease、target `main`、
  正文 **28 行**、唯一资产 **`dsh-grok-workflow-0.13.43.tgz` = 984828 字节**（上一版 `0.13.42` = 980976 → **+3852**），
  `digest sha256:8151ba209bf7243a739379767b53d56c438f28408730c46efab782101127c15b`。
- **用户拿到的只有一件事**：边界规划子代理的请求单形状写清楚了，写在 `action` 旁边的任务体会被提到 `task` 里，
  所以跑中加进来的要求这一次真的能并进计划；缺必填字段的体照旧拒，但拒绝语会点名缺哪几个。
  **口径要写准**：发版清单上列了两条（「边界请求形状」与「收件箱闸门」），**收件箱闸门不在 `0.13.43` 里——
  它 `0.13.42` 就已经发出去了**；`0.13.43` 只带请求形状这一条。
- **`BLOCKED`（这一条就是下一个人欠的活）**：`AGENTS.md` §13 的 live 档案升级**没做成**——本会话文件策略是
  `workspace-write`、`~/.dsh` 在工作区外，写不进去，**没写、没重载、没重启** live 档案。
  **下一个有写权限的人要做的**：把 live 那条插件行钉到**确切的标签 `v0.13.43`**（绝不能用浮动范围），
  把装好的版本读回来确认，读不回 `0.13.43` 就回滚那一行——跑发布版时它必须读作 `0.13.43`。
  live 档案**现在装的是哪一版，本轮没读**，所以不写。
- **`NOT_RUN`**：本轮没做真机 soak——发版轮没有新行为可 soak；这里发出去的行为是 `fix/replan-shape`
  那一轮在真机上验过的（证据 `.rsi/evidence/replan-shape-2026-11-26/`）。
- **本轮没碰的两处遗留**（属别的会话，未暂存、未提交）：`.gitignore`(modified) 与
  `.rsi/evidence/progress-now/`(未跟踪)。
- **引用哪一份**：`.tmp/gate-*.out` 是随手副本、会被删掉，**引用归档的那两份**——
  `.rsi/evidence/release-0.13.43-2026-11-26/gate-prerelease-532d4cf.out` 与
  `…/gate-release-549a579.out`，逐条读数与 `sha256` 见
  [`.rsi/evidence/release-0.13.43-2026-11-26/README.md`](../../.rsi/evidence/release-0.13.43-2026-11-26/README.md)。

---

## 2026-11-26 — `fix/replan-shape`：边界子的请求单修好了——字段写在 `action` 旁边会被提到 `task` 里、缺字段照旧拒并点名；真机上 `plan.version` 1 → 2、`addedTaskIds` 含 `task-4`、`task-4` 真的跑完并验过；未合 `main`、未 push、未发版

- **From:** 包工头（`agent-187`）· **To:** 下一个接手者
- **这一轮是什么**：`D-162` 那一轮证明了投递链通了、合并没成。读数说得很清楚：边界子把任务字段写在编辑层、没写 `task` 体、
  缺 `expectedOutput` 与 `acceptanceCriteria`、依赖还指向自己编的 `changelog_count`。本轮按那三条各修一处，
  **不再猜**：形状写进 schema、嵌套层级两种都读、内容缺口照旧拒但点名。
- **身份**：分支 **`fix/replan-shape`**，从 `main` 尖端 **`26b4bdd`** 开出（worktree `.tmp/wt-replan-shape`）。
  改动面：`src/script.ts`（`REPLAN_SCHEMA` 三分支 `oneOf` + 字段说明、`replanEditBody()` / `replanMissingFields()`、
  提示词两条规则 + 一条完整例子、重投提示一句）、`src/replan.ts`（合并器 `editBody()` 同容忍）、`test/replan.spec.ts` 21 → 24、
  重建 `lib/`、`CHANGELOG` 的 `[Unreleased]` 一条、`D-163`、`RESEARCH.md` 一条、本轮的 `STATE` / `VALIDATION` / `HANDOFF` 与证据目录。
  **没有动 `run.ts` / `steering*.ts` / 配置键 / 浏览器包**（`client bundle` 与基线同值 348559）。
- **真机读数（`CONFIRMED`，`soak/boundary-chain.txt`）**：边界子这一次的 `structured_output` 是
  `{"action":"apply","edits":[{"action":"add","task":{"id":"task-4",…,"dependsOn":["count-changelog"]}}]}` ——
  体在 `task` 里、五个必填字段齐、依赖是计划里真有的 id；下一道边界子的提示词读作 `CURRENT PLAN VERSION: 2`
  且 `wave 4` 出现 `task-4`；报告 `4 task(s); 4 verified`、`Wave 4/4: - task-4: verified (1 attempt)`。
  **判据全中**：`plan.version = 2`、`addedTaskIds` 含 `task-4`。
- **块内门禁**：`tsc` 0、`oxlint 15/0/184 files`、定向 7 份 spec **98 passed**、六份文档守卫 **82 passed**、
  `npm run build` 348559 字节；红：`git stash push -- src` → **`3 failed / 21 passed`**；全量 `npm run ci` `NOT_RUN`。
- **下一个人的四条**：① **`SETTLED TASKS` 那几行在真机提示词里读作 `- count-agents [undefined] `**（`statuses` 是
  `Record<id, status>`，而 `replanPrompt` 按 `row.status` / `row.task.title` 读）——与本轮无关、本轮没修，
  影响是边界子看不到已沉淀任务的状态与标题；要么改那行读取、要么把整行传进去，**这是一件独立的小活**。
  ② 合并被拒之后**不会重投**（只有「没有结构化结果」才重投，不花重试额度）；要不要给合并拒绝也补一次同边界重投，是
  要不要多花一次子调用的取舍，`D-163` 的 rejected 里写了理由。 ③ schema 里**不能写 `maxItems` / `anyOf` / `pattern`**
  ——宿主只认 `type/oneOf/properties/required/additionalProperties/items/enum/const` ＋注解，写错会让整条边界变成
  设置故障（子代理根本不起）；梗概见 `RESEARCH.md` 同日条目。 ④ 隔离档案里装包仍然是**先 `remove` 再 `add`**，
  同版本 `file:` tgz 直接再 `add` 会被 pnpm 复用上一次的解包；本轮 `remove` 因为本来没装而报错，无害。
- **清理（已做完）**：scratch `.tmp/soak`（**273 MB**：档案克隆 + tgz + chromium 用户目录 + npm cache）、`.tmp/probe`、
  `.tmp/npm-cache`、`.tmp/npm-logs` 全部 `rm -rf`，`/tmp` 那份临时 `script.js` 也删了；worktree 与其 `node_modules` 留着
  （分支未合，下一个接手者可能还要在这上面动）。

---

## 2026-11-26 — `0.13.42` 已发布并收口：跑中插话（`feat/inbox-steering` 的那个功能）随版发出，发布提交 `651f3dd` 只抬版本字面量、门禁 `103 files / 1941 tests` 自带 `GATE_EXIT=0`、`main` 快进、附注标签、两个远端 run 与 Release 资产都在；**live 档案升级仍 `BLOCKED`（live 还停在 `0.13.39`，而且那一行是浮动的）**，**本地 `release/0.13.42` 已 `-d` 删除、两处空 worktree 目录已 `rmdir`**

- **From:** 包工头（`agent-185` 派下的记忆收口轮）· **To:** 下一个接手者 / 能在本机写 `~/.dsh` 的人
- **这一轮是什么**：**收口轮**，不写代码。`0.13.42` 已经出去（tag 推了、Release 建了、资产在），
  本轮只做三件文档 + 一份证据：`STATE` / `HANDOFF` / `VALIDATION` 各加一条，新证据目录 `.rsi/evidence/release-0.13.42-2026-11-26/README.md`。
  **没有重跑门禁、没有跑任何 npm 脚本、没有碰 `src/` / `test/` / `lib/`**（`AGENTS.md` §12）。
- **身份**：发布提交 **`651f3dd`** `chore(release): prepare v0.13.42`，父提交 **`ec89b7c`**，**8 文件 / +22 −20**，
  全是版本字面量与清单尾巴（`src/` 与 `lib/` 只有 `PLUGIN_VERSION` / `UPDATE_LATEST` `'0.13.41'` → `'0.13.42'`，
  两份 blob 同 `f2f427d`）。`main` = `origin/main` = `651f3dd`（ff-only，无第二个合并提交）；
  标签 `v0.13.42` 对象 **`98b9c45`**、剥出 `651f3dd`、tagger `2026-11-26 02:40:16 +0800`；`v0.13.41` 对象仍是 `96dd9cc`（没被移动）。
- **这一版用户看到的一件事**：跑着的时候打一句话（Ctrl/⌘+Enter 插话），这句话真的会并进正在跑的计划
  （插件订宿主的 `agent/inbox/inserted`、按会话与白名单只认人的原话、边界子用 `grok_replan_intents` 取走并进还没跑的波次）；
  那句话**仍然按普通一轮被回复**，这一点 `CHANGELOG` 写明了，别再当 bug 修。
- **门禁读数（`CONFIRMED`，转录在证据目录，本轮只核对不重跑）**：`GATE_EXIT=0` 在转录最后一行
  （`gate-651f3dd.out`，396 行 / 23895 字节，`sha256 5f5dfc43…`）；`Test Files 103 passed (103)` / `Tests 1941 passed (1941)`、
  `Duration 100.30s`、lint `15 warnings / 0 errors / 184 files`、`lib/ at 651f3dd … (289 files, byte-identical)`。
  **算术**：静态 `it(` `1852 → 1866`，**+14 全在 `test/steering-inbox.spec.ts`**，随功能走、不随发版提交走
  （`git diff --stat ec89b7c..651f3dd` 里没有 `test/` 文件）；`1866 + 75 = 1941`。
- **远端**：Release run `45677540409`（`v0.13.42` / `651f3dd` / success，71 秒）；CI run `45677532418`（`main` / success）。
  Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.42 ，唯一资产 `dsh-grok-workflow-0.13.42.tgz` = **980976 字节**
  （上一版 976529，**+4447**）。
- **下一个人欠的活，只有一件，但它需要一台能写 `~/.dsh` 的机器**：`AGENTS.md` §13 的 live 档案升级**这一轮还是 `BLOCKED`**——
  本会话 `workspace-write`、`~/.dsh` 在工作区外，写探测 `: > ~/.dsh/.release-probe` 得到 `Read-only file system`，**没写、没重载、没重启 3080**。
  只读读数是：`~/.dsh` mtime `2026-11-25 23:14:14`、`~/.dsh/profiles` mtime `2026-11-22 16:59:46`、
  **live 装着的插件仍读 `0.13.39`**、依赖行是浮动的 `"dsh-grok-workflow": "github:free6589/dsh-grok-workflow"`（**没有标签固定**）。
  所以两件事是一件事：**升到 `0.13.42` 的同时把那一行钉成 `#v0.13.42`**（钉完要读回 `0.13.42` 才算数；读不回就退回原值并报出来）。
  **不要**在不能写的会话里反复试探测，也不要在没有操作员点头的情况下重启那台实例。
- **两处遗留仍然无主（不是我们的，本轮也没碰）**：`.gitignore` 是 modified、`.rsi/evidence/progress-now/` 是未跟踪。
  谁认领谁处置——别顺手 `git add -A`。
- **清理已经做完（不是遗留）**：本地 `release/0.13.42` 分支用 `git branch -d` 删了（报的是 `Deleted branch release/0.13.42 (was 651f3dd)`），
  `git worktree list` 只剩主检出一处；两处空目录 `.agents/worktrees/feat` 与 `.worktrees/` 也用 `rmdir` 清掉了——
  它们都不是注册过的 worktree（`.worktrees/` 只在 `.git/info/exclude` 里、`.agents/worktrees/` 忽略自己的内容），所以没有动到任何被跟踪的东西。
  **刻意留着的是**三条 `backup/wip-2026-11-24-*` 与 `feat/audit-layer`；**没有删任何远端分支、没有删或移动任何 tag**。

---

## 2026-11-26 — `feat/inbox-steering`：跑中插话有了活的入口（订宿主的 `agent/inbox/inserted`、白名单只认真人、按会话入队）；真机上话真的走到了边界拉取工具，**但计划没被改**（边界子的请求形状被既有规则拒）；未合 `main`、未 push、未发版

- **From:** 包工头（`agent-184`）· **To:** 下一个接手者 / 拍板的人
- **这一轮是什么**：`D-161` 的 Consequences 说管道通了、但没有任何角色能在跑中把话塞进队列。本轮先做探针（15 分钟那一档），
  通了才动手，选择的是**甲**（宿主侧消息入口），不是乙（调度子代理跑 workflow）。
- **身份**：分支 **`feat/inbox-steering`**，从 `main` 尖端 **`4584b8d`** 开出（worktree `.worktrees/feat-inbox-steering`）。
  改动面：新增 `src/steering-inbox.ts`、`src/index.ts` 加 `ctx.effect(() => installSteeringInbox({ctx, logger}))` 与一行 import、
  新增 `test/steering-inbox.spec.ts`（14 例）、重建 `lib/`、`CHANGELOG` 的 `[Unreleased]` 一条（中英）、`D-162`、
  本轮的 `STATE` / `VALIDATION` / `HANDOFF`。**没有动 `run.ts` / `steering.ts` / `block/**` / 配置键。**
- **探针结论（`CONFIRMED`）**：**发**。根会话里 `tool/call grok_workflow` 与 `agent/inbox/spliced`（target `next-step`）
  之间没有 `tool/result`，探针 bundle 同时记到 `inserted`（`sourceKind=user`）。两次运行同形状（一次 `tool/result` 在
  十几次事件之后才出现）。**关键陷阱**：工作流喂给子代理的提示词 `source.kind` 也是 `user`，所以只能靠**会话键** + 白名单
  过滤，光看 `role` 会把引擎自己的提示词当成用户要求。
- **块内门禁**：`tsc EXIT=0`、`oxlint 15/0/184 files`、定向 6 份 spec `100 passed`、`build 348559 bytes`；红：空实现 → `14 failed`；
  全量 `npm run ci` `NOT_RUN`。转录与真机读数在 `.rsi/evidence/inbox-steering-2026-11-26/`。
- **真机读数要分开看（重要）**：**投递通了** —— 边界子 `grok_replan_intents` 返回
  `{"intents":[{"id":"steer-mwwg8rzu-1-1",…,"atMs":1795630888586}],"dropped":0}`，`atMs` 与 `inserted` 同一毫秒。
  **合并没成** —— 边界子的 `structured_output` 里那条 `add` 编辑把字段写在编辑层、没有 `task` 体，
  被 `src/script.ts:3484-3492` 的既有规则拒成 `replan edit 1 adds a task with no body`；运行 `COMPLETED`（3 任务/3 波全 verified），
  那条要求随后按普通一轮被回答。**下一块若要「并入真的改了计划」，要动的是边界子的请求形状或那条归一化规则的措辞
  （`REPLAN_SCHEMA` 的说明），不是本轮的投递链。**
- **给下一个人的四条**：① 合之前先想清楚「并入之后仍另起一轮」是不是想要的产品行为（现在是，`CHANGELOG` 写明了）；
  ② `replan` 关掉仍然什么也不排，别再加第三颗开关（`D-162` 的 rejected 里写了为什么）；
  ③ 真机装置在 `.rsi/evidence/inbox-steering-2026-11-26/probe/`（`drive.mjs` 加了 `steer` 步骤 + 按键前抓图，
  `extract.mjs` 把「splice 落在调用当中」从 session 日志里抽出来）；④ **同版本号 `file:` tgz 再 `add` 会被 pnpm 复用旧解包**，
  先 `remove` 再 `add`。

---

## 2026-11-26 — `fix/steering-reconnect`：跑中插话的接线接回 `runWorkflow`（开队列 + 传令牌 + `finally` 关），真机上两道波边界真的叫了边界子并用新令牌调了拉取工具；**跑中并入本身仍没有活调用方（`D-161`）**，未合 `main`、未 push、未发版

- **From:** 包工头（`agent-181`）· **To:** 下一个接手者 / 拍板的人
- **这一轮是什么**：一支独立分支上的**接线修复**，不是新功能。0.13.35（M3.3）把旧前台整条链删掉时，
  `src/gate.ts` 里那句 `openSteering()` 一起走了；队列（`src/steering.ts`）、拉取工具（`grok_replan_intents`）、
  边界合并（`src/replan.ts`）三件都还在树上，却没有任何东西开队列——于是 `grok_steer` 永远回「这一块现在没有在跑的
  workflow」。这一轮把这条调用链接回 `runWorkflow`。
- **身份**：分支 **`fix/steering-reconnect`**，从 `main` 尖端 **`237cf2d`** 开出；产品提交 **`a4753fe`**
  `fix(steering): a run opens its own live channel again`。改动面 **5 个 `src/` 文件 + 1 份 spec + 重建 `lib/` + `CHANGELOG`**：
  - `src/steering.ts`：加回 `closeSteering(token)`（M3.3 当死代码删掉的那个，只删自己那一格）并新增
    `mintSteeringToken()`（令牌要在队列之前铸，因为 `buildWorkflowRequest` 用它算边界的 agent 预算）；
  - `src/run.ts`：新增 `RunWorkflowOptions.steering?: { sessionId }`，在引擎 `start` 之前的最后一步
    `openSteering`，令牌传进 `buildWorkflowRequest`，`finally` 第一件事 `closeSteering`，并在关闭时只记「几条没并进去」；
  - `src/index.ts`：工具面把「这次调用属于哪个会话」传进去（跑中要求按会话找队列）；
  - `src/config.ts` / `src/types.ts`：三条过时注释订正（引用已删的 `src/channel.ts`、把「默认关」写成与
    `DEFAULT_REPLAN = true` 相反、以及一段从 `iterateTemplate` 掉队的注释）；
  - `test/replan.spec.ts`：**17 → 21**（三条接线 + 一条「老 run 关队列不会让新 run 变哑」）。
- **块内门禁（`CONFIRMED`）**：`tsc` `EXIT=0`；`oxlint` `15 warnings / 0 errors / 182 files`；定向 6 份 spec
  **`98 passed`**；`npm run build` `client bundle: 348559 bytes`；`verify:lib` 在 `a4753fe` 上
  `285 files, byte-identical`。转录与红（退回 `main` 的 `src` 只跑新 spec → **`2 failed / 19 passed`**）都在
  **`.rsi/evidence/steering-reconnect-2026-11-26/`**。**全量 `npm run ci` 没跑**（§12，留给发版提交）。
- **真机（`CONFIRMED`，隔离档案 `steer` 复制自 live web 档案、端口 3399、live 3080 全程没碰）**：
  装的是本轮 `npm pack` 的 tgz（`lib/steering.js` `sha256 a6c10bbc…0179` 与工作树逐字节相同、版本读回 `0.13.40`）；
  一次真模型运行（3 波依赖计划）里进度行出现 **`规划（第2次）` `规划 · 波 1 边界`** 与
  **`规划（第3次）` `规划 · 波 2 边界`**，两个边界子各自的 session 日志都记到
  `grok_replan_intents`，令牌 **`steer-mwwe62zr-1`**（`mintSteeringToken()` 铸的形状）。运行结束后再 `grok_steer`
  回「这一块现在没有在跑的 workflow」——队列随 run 关掉了。
- **`FAILED` 的那次运行（照实记，原因在环境）**：子代理沙箱里 `/home` 是只读挂载（`btrfs ro`），
  `printf > .tmp/soak-steer-note.md` 报 `Read-only file system`，任务 1 两次尝试用尽、任务 2/3 未启动。
  计划、波次、依赖链、边界、汇总都按设计跑完。**这一轮的真机读数里没有一次 `completed` 的 run。**
- **这一轮量到的边界（下一块的事）**：运行中发出的那条消息被 GUI **排队**（提示 `Cmd/Ctrl+Enter 插话发送全部排队消息`），
  模型在这一轮**结束之后**才看到它；而 `grok_workflow` 是同步工具调用、子代理又被 `origin === 'subagent'` 守卫明令拒绝，
  所以**今天没有任何角色能在跑中调用 `grok_steer`**。要真做跑中并入，二选一：
  ① 把宿主侧的消息入口拿回来（M3.3 删掉的那半：消息到达时按会话入队，不占调用方的轮）；
  ② 允许调度子代理跑 workflow，并把通道键到**根会话**（`Session.header.parentSession` 可以走上去）。
  两条都要拍板，`D-161` 的 Consequences 里写着。
- **给下一个人的三条**：① 合之前先想清楚上面那条边界——现在合并等于只把管道接回去，代价是每道波边界多一次
  planner 路由调用（`CHANGELOG` 的 `[Unreleased]` 已如实写明）；② 这条分支**没有**发版、没有 bump 版本；
  ③ 跑真机用 `.rsi/evidence/steering-reconnect-2026-11-26/soak/drive.mjs`（CDP 装置），
  但**先确认 `<scratch>` 里有 `.credentials.yaml` 与 `bifrost.env`**，否则第一轮就会 `MISSING_CREDENTIAL`（这轮踩过）。

---

## 2026-11-26 — `0.13.40` 已发布并收口：合流口径落地（「全部被拒」= 汇总节点转琥珀、理由在它展开的调用里）、发版门禁 `102 files / 1923 tests` 跑绿、附注标签、两个远端 run 与 Release 资产都在；**live 档案升级仍 `BLOCKED`（只能写工作区）**，**真机上没人见过那颗琥珀节点（`NOT_RUN`）**

- **From:** 记忆收口（`memory-closeout`）· **To:** 包工头 / 下一个接手者
- **这一轮是什么**：`release/0.13.40` 的**收尾轮**。上一轮（00:25）只把代码与六个文档合流到发布分支上，
  这一轮把它**送出去**并留下读数：发布提交、标签、两个 run、Release、门禁转录、算术、清理。
  产品的用户可见改动只有两条（都在 `CHANGELOG.md` 的 `## [0.13.40]` 里）：进度页就是一张流程图（`D-159` / `D-160`），
  以及「汇总」节点会说清「为什么没交卷」（`D-158`）。
- **发布身份（`CONFIRMED`，本轮自己读的）**：发布提交 **`3778822`** `chore(release): prepare v0.13.40`（**8 文件 / +37 −39**，
  `src/` 与 `lib/` 只有 `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对字面量，两份 blob 同为 `6e8def2 → cf19891`）；
  父提交 `aaf8dfb`，`main` 是 `git merge --ff-only release/0.13.40` 前进的，所以 **`main` = `origin/main` = 门禁提交
  = 标签剥出的提交 = `3778822`**；标签 **`v0.13.40`** 是附注标签（对象 **`14fef64`** → 剥出 `3778822`，
  `tagger` **2026-11-26 00:37:54 +0800**）。**没有 force-push、没有移动任何已发布标签**
  （`v0.13.37 → 34236f0`、`v0.13.38 → 8c9b028`、`v0.13.39 → 18e5463`，本轮 `git ls-remote --tags origin` 重读）。
- **门禁**：**发版门禁只有一遍，就是它**——`TMPDIR=$PWD/.tmp npm run ci` 在 `3778822` 的干净树上 **`EXIT=0`**：
  `15 warnings / 0 errors`（`182 files`）、`client bundle: 348559 bytes`、
  `lib/ at 3778822 is the build of src/ at 3778822 (285 files, byte-identical)`、
  **`Test Files 102 passed (102)` / `Tests 1923 passed (1923)`**、`Duration 95.59s`。转录归档在
  **`.rsi/evidence/release-0.13.40-2026-11-26/gate-3778822.out`**（**22990 字节**、`sha256 3faf97bd…8382e`）。
  块内那一遍（`tsc` 退出 0、`oxlint 15 warnings / 182 files`、定向 7 份 spec `282 passed`、`build 348559 bytes`、
  `verify-lib` 在 `aaf8dfb` 上 `285 files, byte-identical`）是合流轮执行方的读数，**本轮没重跑**。
- **算术（本轮自己从 git 对象数，不抄门禁）**：spec 文件 `db24351` **102** → `3778822` **102**
  （`progress-layout.spec.ts` 删除、`progress-flow.spec.ts` 新增，一换一）；静态 `it(` **1828 → 1848**，
  参数化 / 循环固定补 **+75**（只有 `block-preview 39→93`、`block-flag-baseline 7→14`、`objective-limit 6→12`、
  `fallback-shards 12→16`、`waves 24→28` 五个文件运行时多于静态，其余 97 个相等），于是
  `db24351` **1903（推得，`HYPOTHESIS`）** / `3778822` **1923（实测，与门禁同值 ✔）**；
  逐文件 `client +9`、`progress-tab +15`、`hint-absent −1`、`layout −20`、`flow +17` = **+20**，两处增量互相对得上。
  **一个坑写在这里**：不带词边界的 `grep -c 'it('` 会把 `wait(` / `submit(` 数进去，读出 1981 / 2000——
  别用那个数去对门禁。
- **远端（本轮 `gh` 重读，不是抄派单）**：Release run **`45656018189`**（`headBranch=v0.13.40`、sha `3778822`、**success**，
  job `Validate and publish v0.13.40`）与 `main` 的 CI run **`45656011963`**（sha `3778822`、**success**）；
  Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.40 ——名字 `Grok Workflow for DSH v0.13.40`、
  `2026-11-25T16:39:37Z`、非 draft / 非 prerelease、target `main`、正文 **49 行**、唯一资产
  **`dsh-grok-workflow-0.13.40.tgz` = 973840 字节**（上一版 962715，**+11125**），摘要 `sha256:c42c9924…533833`。
- **合流口径要点检的两处（本轮点过）**：`src/progress-tab.ts:1182` 的 `ProgressFlowRejected` 与 `:1209` 的
  `ProgressFlowNode.rejected?`；`src/client/index.js:4250` 的 `progressRejectedLines()` 生成三行
  `li.gw-progress-node-rejected`（`drafts` / `stage` / `reason`），**只用既有 token、这两行没有字面色值**；
  `gw-progress-final-rejected` 在 `src/` + `lib/` 里 **0 命中**（交卷卡确实不再存在）。
  **口径写精确**：退场的是 `ProgressStory` 与 `deriveProgressStory`；**`ProgressStoryState` 还在**，它只是五态词表。
- **清理（本轮实测）**：`git worktree list` 只剩主检出、`ls -d .tmp/wt-*` 无命中 → 两个发布 worktree 都已删除；
  `git branch` 只剩 `* main` → 本地 `release/0.13.40` 与 `feat/progress-flowchart` 都已 `-d` 删掉。
  `.gitignore`（modified）与 `.rsi/evidence/progress-now/`（未跟踪）**属于别的会话，本轮没碰**。
- **`BLOCKED`**：`AGENTS.md` §13 的 live 档案升级**这一步仍没做成**，理由还是那一个——本会话 `workspace-write`、
  `~/.dsh` 在工作区之外，写探测 `: > ~/.dsh/.merge-probe` 返回 `Read-only file system`（派单记录；本轮没重跑）。
  **没写、没重载、没重启** 3080 上的实例；live 档案现读回哪一版本轮**没读**（读它也够不着）。
  **下一个能做的人**：在有 `~/.dsh` 写权限的会话里把插件行钉到 `v0.13.40`（标签或文件引用，别用浮动范围），
  读回版本必须是 `0.13.40`，只动插件那一行。
- **`NOT_RUN`（照实写）**：① 这一轮没做真机 soak（派单只要求 typecheck + lint + 改到的 spec；流程图那半边由
  `feat/progress-flowchart` 那一轮的真机读数覆盖，证据在 `.rsi/evidence/progress-flowchart-2026-11-25/`）；
  ② **「每一稿都被退回」那颗琥珀节点在真机上仍然没人见过**——上一轮 `fix/synth-outcome` 的真机只见过通过态，
  这一轮没上真机，它只有组件与模型用例覆盖。**下一个接手者若要补一条真机读数，就补这一条**（要在活模型上
  连续撞穿闸门三次，抖动大、烧额度）。
- **`DECISIONS.md` 本轮一个字没改**：`D-158` 下面那条「现状（合流后补记，2026-11-26）」已经把「三态卡片退场、
  事实由汇总节点承载」写清了，再补一句就是重复。

---

## 2026-11-26 — `release/0.13.40`：合流轮——`feat/progress-flowchart` 与 `main` 侧的 `fix/synth-outcome` 两轮内容并进同一条发布分支，16 文件冲突里六个文档按「流程图为主体、退回事实改成节点口径」解掉；**代码与测试由 `builder` 解，门禁 `NOT_RUN`、未提交、版本仍 `0.13.39`**

- **From:** 文档收口（`docs`）· **To:** 包工头 / 下一个接手者
- **这一轮是什么**：一条发布分支上的**合流轮**，不是发版轮。`release/0.13.40` 从 `main` 的 **`db24351`** 开出，
  正在把 `feat/progress-flowchart`（进度页改成一张流程图）并进来；`main` 侧带着 `fix/synth-outcome`
  （汇总结论补上「全被退回 + 最后一次为什么不过」）。**16 个文件冲突**：`src/` / `lib/` / `test/` 归 `builder` 解，
  **下面这一节与其余五个文档由本轮解**。这一轮**没有跑任何门禁**（`npm run ci`、`typecheck`、`lint`、真机全部 `NOT_RUN`）、
  **没有 `git add` / `commit` / `stash`、没有 bump、没有 push、没有打 tag**。
- **拍板的口径（操作者给的，写进文档时照这句说）**：**「全部被拒」= 流程图上的「汇总」节点转琥珀，理由挂在它展开的
  调用里，不另开卡片。** 于是交卷卡这个界面元素**不再存在**，但「每一稿都被退回」这个事实**仍然可见**；
  六个文档里凡是把它写成「交卷卡片 / 第三态卡片 / 琥珀块」的地方，都改写成这一版真实的界面。
- **决定编号的重排**：`main` 已经占了 `D-158`（汇总结论用「标记 + 独立事件 + 三态卡片」表达），所以 `feat` 那两条
  从 `D-158` / `D-159` 重排为 **`D-159`（流程图）** 与 **`D-160`（四区版退场）**，按时间排在 `D-158` 之后；
  `D-158` 里那段三态卡片描述**保留为历史记录**，旁边补了一句现状（卡片在同一个发布的流程图改造里退场，
  退回的事实改由汇总节点承载）。所有指向这两条的交叉引用——`CHANGELOG`、`DECISIONS`、`DESIGN-progress-tab.md`——一起改过。
- **六个文档各解成什么**：`CHANGELOG.md` 的 `[Unreleased]` 两轮条目都在，`feat` 那条原文保留，`main` 那条
  「交卷卡片会说清为什么没交卷」按新界面改写成「汇总节点转琥珀 + 退回稿数与卡住的门在它展开的调用行里」；
  `STATE` / `HANDOFF` / `VALIDATION` 两轮记录都在（新的在上、旧的原文不动）；`DECISIONS` 三条按编号顺序排；
  `DESIGN-progress-tab.md` 的契约**以流程图那一版为主体（§21）**，`main` 侧关于汇总结论与退回的事实并成 **§22**，
  改成节点口径（§22.1–§22.3 是既有的 `CONFIRMED` 事实链，§22.4–§22.5 的界面出口标为合流口径）。
- **一个数字都没有重算**：两轮自己写下的测试文件数、用例数、字节数、哈希、run id、截图名一律原样保留。
  **两处读数并存，待下一轮复核**：`DECISIONS` 里流程图那条记的「六个 spec 256 条 / `progress-flow` 15」是 `e998a00`
  （连线修复之前）那棵树上的读数，`VALIDATION` 与下面流程图那一节记的「258 / 17」是 `1eb7888`（修复之后）那棵树上的读数——
  两处都照原文留着，没有挑一个，也没有重跑。
- **给下一个人的三条操作提示**：① 合流后「汇总」节点必须在收到 `summary-rejected` 时转琥珀，把退回稿数与卡住的那道门
  （连同运行自己那句理由）挂进它展开的调用行——`summary-rejected` 事件、`summaryGateOutcome()` 读回与台账行的
  ` · rejected: draft N (…)` 是 `main` 侧带过来的既有机制，不是这一轮新加的。② 门禁与发版都在下一步：本轮
  **没有**跑 `npm run ci`，也**没有** bump 版本（仍 `0.13.39`），所以这一版还没有任何合流树的测试读数。
  ③ 上一轮留下的两条陷阱仍然有效：`verify:lib` 比对的是 `HEAD` 的 `src/` 与 `HEAD` 的 `lib/`（脏树上跑是空证明），
  以及「折行不画线」是刻意的（`DESIGN-progress-tab.md` §21.7 的两条已知边界）。

---

## 2026-11-26 — `feat/progress-flowchart`：进度页从四区版改回一张可视化流程图（一步一节点 / 当前高亮 / 节点下挂行 / 底部计数），门禁跑绿，**隔离档案真机三态验过并修掉一个连线缺陷**，**未合 main、未 push、未发版**；本分支的决定日期是 **2026-12-10**

- **From:** 包工头（`agent-177`，取数 `agent-177/data` + 重画 `agent-177/redraw`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：一条 **`feat/*` 分支**上的交付，不是发布轮。分支从 `main` 尖端 **`57dcf04`** 长出，
  **两颗产品提交**：**`e998a00`**（模型 `deriveProgressFlow` + 浏览器包镜像 + 流程图渲染 + 全线重写的进度页样式 +
  五个 spec + 证据）与 **`1eb7888`**（真机量出来的连线缺陷修复 + 两条几何用例 + 真机证据），
  之后是记忆提交。改动面：`src/progress-tab.ts`、`src/client/index.js`、`lib/`（构建产物）、
  `test/client.spec.ts`、`test/progress-tab.spec.ts`、`test/progress-connector.spec.ts`、
  `test/progress-hint-absent.spec.ts`、`test/i18n-parity.spec.ts`、新增 `test/progress-flow.spec.ts`
  （`test/progress-layout.spec.ts` 随四区版一起删除）。
- **用户能看到的**：进度页就是一张图，从「起点」到「终点」，每条腿一个节点（规划 / 执行 / 检查 / 复核 / 汇总），
  去过的腿每去一次各占一个节点（「第 2 次」「第 2 稿」），过了的绿、当前那颗亮着、未到的灰虚线、断过的琥珀；
  节点下挂自己的调用，按一下才展开；底下只有一行「还剩 N 步 / 共 M 步」；**页面上没有一句说明文字**；
  720 px 以下竖排。**退场**：「现在」主标题、分段条、琥珀提示条、「后面还有」、步骤清单、「经过」及折叠、
  「交卷」卡、两栏、dock 下两句提示（19 个文案键一并删）。**保住**：运行名 + 五态胶囊、Guardian 那块、
  dock 两颗按钮与「只填框不代发」。
- **门禁与算术（`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` 在 **`e998a00`** 的干净树上 `EXIT=0`——
  `Found 15 warnings and 0 errors.`、`client bundle: 340995 bytes → lib/client.js`、
  `lib/ at e998a00 is the build of src/ at e998a00 (285 files, byte-identical)`、**`101 files / 1897 tests`**、`101.14s`。
  基线是**本轮自己在独立 worktree `.tmp/wt-baseline`（`57dcf04`）上重跑的全套**：`EXIT=0`、`347526` 字节、
  `101 files / 1884 tests`、`112.96s`。**`1eb7888` 之后定向复核**：六份 spec `258 passed`、`typecheck` 退出 0、
  `oxlint 15 warnings / 0 errors`、`lib/client.js` 与 `src/client/index.js` 逐字节相同（`341814` 字节）。
  逐文件：`client.spec.ts` **139 → 146**、`progress-tab.spec.ts` **57 → 69**、`progress-flow.spec.ts` **新增 17**、
  `progress-layout.spec.ts` **20 → 删除**、`progress-hint-absent.spec.ts` **8 → 7**、
  `progress-connector.spec.ts` **11 → 11**、`i18n-parity.spec.ts` **8 → 8**。
- **一条必须记住的陷阱**：`verify:lib` 比对的是 **`HEAD` 的 `src/` 与 `HEAD` 的 `lib/`**，所以**工作树脏着跑它是空证明**
  （本轮第一次跑就是这样：它报的是基线那对提交）。只有在提交之后、干净树上跑，那句 `byte-identical` 才算数。
- **真机那半边真跑过，而且量出一个缺陷**：隔离档案（`flow-clone` 从 live web 档案克隆、`DSH_HOME` 指到 `.tmp/`、
  端口 3373）里装真包跑一次真实运行——三态 **等你点头 11.66 s / 进行中 12.18 s / 已完成 131.65 s**；
  已完成页逐字读作 `起点 执行 检查 复核 汇总 第 1 稿 终点` / `还剩 0 步 / 共 6 步` / `收下这版`；
  开节点 `aria-expanded` false → true、`node-calls` 0 → 1；四个宽度 `scrollWidth === clientWidth` 全部成立。
  **缺陷**：一开节点它比邻居高，判「同一行」原用中线距离，于是同一行相邻那条线被判成折行而不画——
  1500 px 只画出 4/6 条、900 px 3/5 条。修法改成「两框垂直方向有重叠」（竖排改判水平重叠），
  线的位置取重叠段中点；修完 1500 px 5/5、900 px 4/4（第 5 对真折行，不画）。这条是本轮唯一的代码返工，
  也是「真机不是走过场」的证据。
- **决定日期（`AGENTS.md` §5 要求 `feat/*` 有一个）：2026-12-10。** 那天之前二选一——**合进 `main` 并走发布流程**，
  或者**删掉这条分支**。它是两颗产品提交、258 条定向用例全绿、真机三态验过的成品，不是草稿。
- **没做的，以及为什么**：**没合 `main`、没 push、没打 tag、没 bump、没发版**（这一轮的边界就是交付分支）；
  **live 档案例行没碰**——文件策略 `workspace-write`、`~/.dsh` 在工作区外、审批提示被禁用，写不进去；
  3080 上的实例全程没动（旁证：误跑一次不带 `DSH_HOME` 的 `dsh web --help` 被 `EROFS` 直接拦住）。
  仍然 `NOT_RUN` 的五条：`e998a00` 上的等你点头（那一版窗口没赶上）、失败/取消两态真机截图（两次运行都 `completed`）、
  重启后打开旧会话（报 `no live session`，没有冒充读数）、点按钮后读输入框内容、与上一版布局的逐屏对照（按 §12 不重跑基线）。
- **给下一个人的三条操作提示**：① 证据全在 `.rsi/evidence/progress-flowchart-2026-11-25/`，README 第 5 节是缺陷前后的
  两套几何读数，别把 `soak-5*`（旧包）当成成品读数。② 真要动这张图，先读 `DESIGN-progress-tab.md` §21——
  节点的分组规则（label 里第一个整数决定「第几次」）和「折行不画线」都是刻意的，改之前先看 §21.7 的两条已知边界。
  ③ `progress.final.mark`（定稿）现在**留在字典里但没有读者**：定稿由那一行的角色词（`汇总·第2稿（定稿）`）说出，
  不要再给它加一张卡。

（以下为上一轮 **`fix/synth-outcome`** 的记录，原样保留：汇总结论补上「全被退回 + 最后一次为什么不过」，
真机只验了通过态；它那条「交卷卡片三态」的界面出口已被流程图取代——事实仍由「汇总」节点承载，
见 `DECISIONS.md` 的 `D-158` 现状补记与 `D-159`。）

## 2026-11-25 — `fix/synth-outcome`：汇总结论补上「全被退回 + 最后一次为什么不过」交付、跑绿、**真机验过通过态**，**未合 main、未 push、未发版**；本分支的决定日期是 **2026-11-26**

- **From:** 实现 + 记忆收口（`agent-174/impl-synth-outcome`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：一条 `fix/*` 分支上的收尾，不是发布轮。分支从 `main` 尖端 **`57dcf04`** 长出，**四颗提交**：
  `5388f22` 主体（脚本标记、读回、事件、折叠、卡片、文案、重建 `lib/` + 测试）、
  `4f395c7` 证据（红/绿转录、门禁、真机读数与截图），紧随其后的
  `docs(memory): record the all-rejected summary outcome and its evidence`（本文档、`CHANGELOG`，以及最终树门禁的转录），
  再一颗 `docs(memory): correct the commit count and record the final-tree gate`（只改文字：把提交数与改动面改准、补上最终树门禁的转录）。
  **后两颗在文档里不自指提交号**（一个提交写不出自己的 sha）。
  **改动面分两段对账**：`57dcf04..5388f22` **36 个文件**（`src/` 六个——`script.ts`、`report.ts`、`records.ts`、
  `run.ts`、`progress-tab.ts`、`client/index.js`；`lib/` 十九个构建产物；五个 spec；证据目录最初那一份 README 加四件产物）；
  文档提交再加 **10 个新文件**（`CHANGELOG.md`、六个 `docs/knowledge/*`——`STATE` / `HANDOFF` / `VALIDATION` /
  `DECISIONS` / `RESEARCH` / `DESIGN-progress-tab`、证据目录三份转录与红记录）并对上面那份 README 追加一节
  （README 在总量里只算一次）。`57dcf04..HEAD` 合计 **46 个文件**，与 `git diff --stat 57dcf04..HEAD` 对得上。
- **修的是什么**：闸门此前只记录「通过」——分层策略写 `check=fail verify=pass drafts=N` 却不带理由，
  plain `model` 策略连标记都不写，只剩 `synthesis.error` 的一段散文；于是进度页对「这一轮没交卷」
  只会说那句 `progress.final.missing`。现在 `synthesis.review` 带**结论**：通过仍是
  `check=pass verify=pass drafts=N`（逐字未变），退回变成 `… drafts=N reason=<一行>`；读回是新函数
  `summaryGateOutcome()`，事件是新的 `tool-workflow/summary-rejected`，卡片分成**三态**。
- **用户能看到的**：交卷卡片不再只有「这一轮没有交卷稿」一句。每一稿都被退回时，它写成琥珀色两块——
  「第 {n} 稿全被退回」和「最后不过：<理由>」，没有名字、没有（定稿）、没有胶囊；交过稿的运行与以前逐字一致。
- **门禁与算术（`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` 跑了三遍、都是 **`EXIT=0`**——代码树 `5388f22`、证据提交 `4f395c7` 上的独立复核、文档提交 `6d8a98f` 的最终树——
  `Found 15 warnings and 0 errors.`、`client bundle: 352002 bytes → lib/client.js`、
  `lib/ at <sha> is the build of src/ at <sha> (285 files, byte-identical)`、**`102 files / 1903 tests`**；
  `node scripts/verify-lib.mjs` 单独跑同句、exit 0；另一遍独立复核在 `4f395c7` 上同样 `EXIT=0`。
  基线 `101 files / 1884 tests`（`57dcf04`，派单方 22:04 实测）→ **+1 文件 / +19 用例**，
  `lib/client.js` **347526 → 352002** 字节。逐文件：`test/summary-outcome.spec.ts` 新增 16、
  `test/client.spec.ts` +3、其余三个 spec 只改写既有断言。
- **红的记录是事后的（照实说）**：第一份红 `red-summary-outcome.out` 是用 `git stash push -- src`
  把源码退回基点后跑的（写作顺序是**先实现、后断言**）；随后补了一份基线整套跑
  `red-baseline-suite.out`——`git archive 57dcf04` 的树上、五个被改的 spec 一起跑，**`22 failed / 246 passed`、
  `5 files failed`**，覆盖了「既有 spec 的新期望在基点上确实是红的」。
- **决定日期（`AGENTS.md` §5 对 `fix/*` 的要求：合并后 24 小时内删分支）：2026-11-26。**
  那天之前二选一——合进 `main` 走发布，或者删掉这条分支。它是 3 条用户可见行为 + 19 条用例全绿的东西。
- **真机那半边跑过一半，另一半是 `NOT_RUN`**：隔离档案（`web-clone`、端口 3391、真实模型）跑了一次真实运行，
  完成页仍是**通过态**——`final-name` `汇总·第1稿`、`final-mark` `（定稿）`、胶囊 1、
  `final-rejected`/`final-missing` **0/0**、控制台 `{"consoleErrors": [], "pageErrors": []}`。
  **`NOT_RUN`：真机上的「三稿全被退回」**——要在活模型上连续三次撞穿闸门，抖动大、烧额度；
  **没有人在真机上见过那张琥珀卡**，它只由组件用例与 CSS 保证。
  另一条 `NOT_RUN`：`check=pass verify=fail` 的**写入端**没在活引擎上跑过（解析/渲染有用例）。
- **live 档案的 observation（`HYPOTHESIS`，不是本会话干的）**：`~/.dsh` 目录 mtime 在窗口内走到 `22:28:12`，
  `~/.dsh/profiles/web/package.json`（`22:06:12`）与 `node_modules`（`22:06:09`）也动过，
  **live 档案里装着的插件现在读回 `0.13.39`**（上一份已发布记忆写 `0.13.38`）。本会话写不进 `~/.dsh`
  （`touch ~/.dsh/.foreman-probe` → `Read-only file system`），所以这是会话之外的进程做的，**原因未查明**。
  与插件安装真正相关的 `profiles/web/cordis.patch.yml` 停在 `19:27:31`，没被动过。
- **给下一个人的三条操作提示**：① 证据在 **`.rsi/evidence/synth-outcome-2026-11-25/`**（README + 两份门禁转录
  + 两份红 + 真机读数与截图 + 会话事件摘录），**引用归档那份，别引用 `.tmp/`**。② 权威数字只有三个地方：
  `gate-6d8a98f.out`（最终树）、`gate-5388f22.out`（代码树）、`soak-readings-completed.json`（真机那一次），
  外加 `gate-4f395c7-docs.out`（文档写入后、提交前那一遍；与最终树那一遍同数，两次读都真）；
  记忆里的 `102 / 1903`、`352002`、`285 files` 都能从这三处回指。③ **`test/records.spec.ts` 不存在**——
  记录器的既有用例在 `test/progress.spec.ts`，这一轮新增的记录器规则在 `test/summary-outcome.spec.ts`；
  找「recorder 怎么写事件」别去翻一个不存在的文件。


（以下为上一轮 **`feat/progress-layout-detail`** 的记录，原样保留：那条分支的四区版已被本轮取代——它从未合入 `main`，
而 `main` 尖端 `57dcf04` 正是它的合流提交，所以本轮基线带着四区版。）

## 2026-11-25 — `feat/progress-layout-detail`：进度页布局细化（两栏躯体 / Guardian 四块 / 任务行就地展开 / 经过折叠）交付、跑绿、**隔离档案真机验过**，**未合 main、未 push、未发版**；本分支的决定日期是 **2026-12-09**

- **From:** 记忆收口（`agent-173/memory`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：一条 **`feat/*` 分支**上的收尾，不是发布轮。分支从 `main` 尖端 **`b0fbd20`** 长出，
  **5 颗提交**：`29291eb` 主体（Guardian 挪到右列并拆成四块、任务行可展开、经过可折叠）、
  `331f181` 把详情容器从 `div` 改成真 `ol`（里面是 `li`，`li` 得有列表父节点）、
  `f14299c` 守卫（新增 `test/progress-layout.spec.ts`）、`08018bf` 打磨（详情行只说一次门）、
  `d0c924a` 守卫（把那句话钉住）。改动面 **6 个文件**：`src/client/index.js` 与它的构建产物 `lib/client.js`
  （尖端同一个 blob `e14880c`，`347526` 字节），外加四个 spec。**产品面只动浏览器包**——
  `src/progress-tab.ts`、fold、`src/records.ts`、事件集和页面上每一个数字一个字没改。
- **用户能看到的四条**：① 页面躯体分成两栏，**只有这次运行真记录了 Guardian 才分**（没有 Guardian 就没有包裹层、
  也没有空列）；② Guardian 变成四块瓦片（状态 / 预算 / 计数 / findings），一个新词都没加；
  ③ 每颗计划任务行可以就地展开**它自己那次任务**的调用，一行一条，只说行头说不出的四件事——时刻 · 门 · 结果 · 打开；
  行的可见文字与改造前逐字相同；④ 「经过」超过 6 行才出现「展开全部 / 收起」，折叠时高 264px、展开时解除上限，
  一行都不丢。文案只加三个键（详情 / 展开全部 / 收起）。
- **门禁与算术（`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` 在 **`d0c924a`** 的干净树上 `EXIT=0`——
  `Found 15 warnings and 0 errors.`、`client bundle: 347526 bytes`、
  `lib/ at d0c924a is the build of src/ at d0c924a (285 files, byte-identical)`、**`101 files / 1884 tests`**、`88.19s`
  （转录 `.rsi/evidence/progress-layout-detail-2026-11-25/gate-d0c924a.out`，22429 字节、0 行 `FAIL`；
  包工头跑，记忆侧逐行核对）。基线是本轮自己在
  `git archive b0fbd20` 的拷贝上重跑的全套：**`100 files / 1855 tests`**、**334321** 字节、15 warnings、`85.98s`。
  所以 **+1 个 spec 文件 / +29 条用例 / +13205 字节**，warnings 不变。
- **两处偏差 + 一处接受的不完美**：① 链段 chip 的 class 必须叫 `gw-progress-plan-chain` 而不是
  `gw-progress-task-chain`——`test/progress-connector.spec.ts` 禁止已退役的 `gw-progress-task` 子串，class 只能改名，
  身份留在 `data-gw-progress-task-chain` 钩子上；② 详情容器从 `div` 改成 `ol` 是第二颗提交补的（`li` 得有列表父节点），
  所以那颗提交只为了让嵌套合法，行为没变。**接受的不完美**是行按钮的 `aria-controls` 指向一个只在展开时存在的元素
  ——disclosure 模式允许，严格的校验器会挑；给每行常驻一个空容器更脏。三处都写进了 `D-157`。
- **决定日期（`AGENTS.md` §5 要求 `feat/*` 有一个）：2026-12-09。** 那天之前二选一——
  **合进 `main` 并走发布流程**，或者**删掉这条分支**。别让它烂在盘上：它是 5 颗提交、6 个文件、1884 条用例
  全绿的东西，不是草稿。
- **没做的，以及为什么（一条都不含糊）**：**没合 `main`、没 push、没打 tag、没发版**（这一轮的边界就是「把改动记下来」，
  派单没授权合流）；**live 档案例行没碰**——本会话文件策略 `workspace-write`、`~/.dsh` 在工作区之外、审批提示被禁用
  （不能申请提权），从这里写不进去；而且按 `AGENTS.md` §11，升级只在发布成功之后做，这一版还没有可钉住的标签。
  3080 上的实例全程没动。
- **真机那半边跑过了，这条分支是真机验过的**：隔离档案（`web-clone` 从 live web 档案克隆、端口 3371、视口 1500×1600）里，
  基线 `b0fbd20` 与本分支各装一次真包、各跑一次真实运行。安装身份：基线 tgz `28c5d8b4…ff88b` /
  `sha256(lib/client.js)` `38702aa1…063fa6c` / 334321 字节，本分支 tgz `acf2476d…840d9` / `5745b15c…ced3a` / **347526** 字节。
  三态时刻 9.19 / 9.79 / **197.83 s** 对 15.84 / 16.22 / **170.00 s**；完成态钩子 **columns 0 → 1**、
  **guardian-block 0 → 4**、**plan-toggle 0 → 2**、**log-toggle 0 → 1**、`task-detail` 0 → 0（点开后 1）、`log-row` 9 → 8；
  开一行读作 `21:38 执行 做完 打开子会话` / `21:38 检查 过了 打开子会话` / `21:38 复核 通过 打开子会话`；
  1500 px 是 `957px 240px`，**700 px 收成单轨 `693px`** 且 Guardian 落到历史下面、没有横向滚动；两侧控制台全空。
  **两条照实记**：等你点头那一瞬 `guardian 0` / `columns 0`（「有 Guardian 才有两栏」正好对上）、完成页 8 条历史行
  且照样有折叠按钮。产物：**`.rsi/evidence/progress-layout-detail-2026-11-25/`**（25 个文件 / 1.4 MB）。
  仍然 `NOT_RUN` 的只有四条：发送前的基线页面快照、未通过 / 已取消两态、点按钮后读输入框内容、
  live 档案升级 / 重载 / 重启。
- **给下一个人的三条操作提示**：① 门禁转录现在**归档在证据目录里**（`.rsi/evidence/progress-layout-detail-2026-11-25/gate-d0c924a.out`，
  22429 字节），`.tmp/` 那份要删——**引用归档那份，别引用 `.tmp/`**；`.tmp/gate-f14299c.out` 是更早一轮的旧读数
  （`101 files / 1882 tests`、`346603` 字节），别拿它当尖端。② 这一轮的口述读数比实测旧一版
  （`client.spec.ts 121 → 139`、`progress-hint-absent 7 → 8`、`+27` 例），实测是 **`132 → 139` / `6 → 8` / `+29` 例**；
  记忆里写的是实测值。③ 证据 README 把基线用例数写成 `1870`，实测是 `1855`（`1870` 是 `0.13.38` 的数）——
  那一行已在 2026-11-25 订正为 `1855`（证据目录里只剩这一个数，转录与 `334321` 字节未动），对账按 `1855`。

（以下为上一轮的 **`0.13.39` 发布收口** 记录，原样保留。）

## 2026-11-25 — `0.13.39` 已发布：一个发布提交、一次门禁跑绿、快进 `main`、附注标签、Release 与资产都在；live 档案升级仍只剩沙箱这一条 `BLOCKED`

- **From:** 记忆收口（`agent-170/memclose-0139`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：**发布轮，不是代码轮**，而且**这一轮没有合流任何东西**。产品改动在发布之前就已经全在 `main` 上了：
  `8c9b028`（`v0.13.38` 剥出的那个）→ `ed287e1` 之间 **18 个提交**，其中 2 个 `merge:`、**16 个非合并提交**
  （进度页重画 `a3ed628`…`64b69af`、`9488890` / `ed287e1` 两条合并、`ff5c5ec` / `2d1b378` / `b1b73ac` / `601e2db` 四条文档）。
  发布分支从 **`ed287e1`**（= `origin/main`，包版本 **`0.13.38`**）切出，只带一个发布提交
  **`18e546332a8c10c6de99ff344886e7fa77b3658c`** `chore(release): prepare v0.13.39`（**8 文件 / +33 −20**）：
  `src/` 与 `lib/` 只动了版本字面量那一对 `'0.13.38'` → `'0.13.39'`，没有一行逻辑。
- **门禁只有一遍，而它就是发布门禁，`EXIT=0`**（`TMPDIR=$PWD/.tmp npm run ci`，发布 worktree `.tmp/wt-release-0.13.39`，
  发布提交那棵树；包工头跑，本轮**拷副本 + 逐行核对**，没有重跑）：`100 files / 1855 tests`、
  `Found 15 warnings and 0 errors.`、`client bundle: 334321 bytes`、`lib/ … (285 files, byte-identical)`、`90.16s`。
  转录 **22316 字节**、`sha256 aed6c3ef…041b6f`，副本与原件 `cmp` 逐字节相同。逐行读数见 `VALIDATION.md` 同日条与
  `.rsi/evidence/release-0.13.39-2026-11-25/`。
- **`main` 是快进前进的**：`git merge --ff-only release/0.13.39`，所以 `main` 尖端**就是**门禁提交、也是标签剥出来的那个
  （`main` = `v0.13.39^{}` = **`18e5463`**；远端 `refs/heads/main` 本轮实读同值，推送 `ed287e1..18e5463  main -> main`）。
  标签 `v0.13.39` 是附注标签（对象 **`87a0e0e9a52e932d33584fc11434f63a74c87939`** → 剥出 `18e5463`），
  **没有 force-push，也没有移动任何已发布标签**（`v0.13.35^{}`→`ffbb6b0`、`v0.13.36^{}`→`26dc370`、
  `v0.13.37^{}`→`34236f0`、`v0.13.38^{}`→`8c9b028` 全部原位）。
- **远端（`CONFIRMED`，本轮用 `gh` 重读）**：Release 工作流 run **`45611695688`** success
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45611695688 ；`main` 的 CI run **`45611690753`** success
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45611690753 。两个 run 的 head sha 都是 `18e5463`。
  Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.39 ，名字 `Grok Workflow for DSH v0.13.39`，
  发布 **`2026-11-25T12:14:50Z`**，非 draft、非 prerelease，target `main`，唯一资产
  **`dsh-grok-workflow-0.13.39.tgz` = 962715 字节**，正文就是 `## [0.13.39] - 2026-11-25` 那一节（42 行）。
- **下一个接手的人必须知道（一条，最要紧）**：**live 档案现在跑的是 `0.13.38`，比本版落后一版，而它升不上去的原因只有一个
  ——沙箱，不是版本。** 本会话文件策略 `workspace-write`，`~/.dsh` 在工作区之外，审批提示在本会话被禁用（不能申请提权），
  所以**从这里写不进去**。这一条与前几轮不同、必须说清：`mode: triage` 自 **`0.13.38`（`D-155`）** 起**已经不再是升级障碍**
  ——被删键被忽略并在载入日志点名一次，不再让整行拒载。所以下一个能写 `~/.dsh` 的人，**直接升级就行，删不删那一行都可以**；
  谁再把「先删 `mode: triage` 再升级」写回须知，就是把已经作废的前置条件重新塞回用户手里。
- **live 档案的只读实读（本轮自查，只读，未写/未重载/未重启，3080 上的实例全程没碰）**：`grok-workflow` 那一行
  （第 **563** 行）`config:` 下**仍写着 `mode: triage`**；**已装版本读回 `0.13.38`**——`node -p` 读
  `~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json` 得 `0.13.38`，`pnpm-lock.yaml` 也把浮动依赖
  `github:free6589/dsh-grok-workflow`（`package.json` 第 12 行，**无标签**）解析到 `ed287e1` 的 tarball、`version: 0.13.38`
  ——两处互证。**这与派单口述的「已装版本 `0.13.35`」不符，按实测记**（那大概是上一轮之前的状态）；
  `~/.dsh` size 1548 / mtime 1795362020、`~/.dsh/profiles` size 226 / mtime 1795337986，与上一轮记录同值。
  顺带一条给下一位：live 那一行是**浮动**依赖、没有钉标签，所以它「自己」就能漂到新版本——要钉住请按 `AGENTS.md` §11 钉到确切的标签。
- **收尾状态（按观察到的事实，不按口述）**：`git worktree list` 只剩主检出
  （`/home/fish/projects_mine/dsh-grok-workflow 18e5463 [main]`）；`.tmp/wt-release-0.13.39` **已不在盘上**
  （所以门禁转录的原件已经消失，`.rsi/evidence/` 里那一份是唯一 durable 的副本）；本地 `release/0.13.39` 已删；
  `git branch` 只剩 `main` 外加三条 `backup/wip-2026-11-24-*` 与 `feat/audit-layer`；远端 `release/*` 只有 `release/0.13.27`。
  主检出剩下的唯一改动是与发布无关的 `.gitignore` 本地设计稿忽略规则，**从未被暂存**，也不在任何发布提交里。
- **那四条旧分支很旧，且与本版无关，别读成「已合流」**：`backup/wip-2026-11-24-live-steering` 落后 **381** / 领先 1、
  `backup/wip-2026-11-24-team-dispatch-v1` 落后 **347** / 领先 4、
  `backup/wip-2026-11-24-progress-task-number-first` 落后 **378** / 领先 1、`feat/audit-layer` 落后 **638** / 领先 1。
  它们各自的 1–4 个提交**一条都没进这个版本**。按 `AGENTS.md` §5，`feat/*` 需要一个决定日期（合流、rebase 或删除）。
- **三处读数偏差，照实记**：① **live 已装版本是 `0.13.38` 不是 `0.13.35`**（见上）。② 派单说 `8c9b028`→`ed287e1`
  之间 **16 个提交**，实读 **18 个**——**16** 是去掉 2 个 `merge:` 之后的非合并提交数（`git rev-list --no-merges --count`），
  两个数都对、口径不同。③ 派单说旧分支落后 **346–637**，实读 **347–638**（`main` 比派单测量时多了一个发布提交，基数跟着加一）。
  另外重申一次别再搞错：**用例 −15 / 体积 −6105 不是发布提交造成的**，是进度页重画在 `87f14e1` 就造成的
  （重画证据 README 第 41 行交付当时就写着 `1855` / `334321`），发布提交只动版本字面量。

（以下为上一轮的 **`0.13.38` 发布收口** 记录，原样保留。）

## 2026-11-25 — `0.13.38` 已发布：一次零冲突合流、两次门禁跑绿、标签与 GitHub Release 都在；live 档案升级只剩沙箱这一条 `BLOCKED`

- **From:** 记忆收口（`agent-168/memclose`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：**发布轮，不是代码轮**。`main` 尖端 **`c3d729f`** 上，特性分支 `fix-removed-keys-warn`（尖端 **`b6e8598`**，
  严格领先 **5 交付 / 0 落后**）在 worktree `.tmp/wt-release-0.13.38` 里真 `--no-ff` 折入：合并提交 **`8f8a463`**
  `merge: a leftover removed key is ignored and named, not fatal`，父提交 **`c3d729f` + `b6e8598`**，**零冲突**——
  合并树 `63e3fa819b1f9439c62a21536eeb271668bcae02` 与 `b6e8598^{tree}` 同一个，`git diff --stat b6e8598 8f8a463` 空。
  其后发布提交 **`8c9b028`** `chore(release): prepare v0.13.38`（**8 文件 / +22 −20**，树 `2bc5d845…`）：`src/` 与 `lib/`
  只有版本字面量那一对 `'0.13.37'` → `'0.13.38'`，没有一行逻辑。
- **门禁两次都 `EXIT=0`**（`TMPDIR=$PWD/.tmp npm run ci`，发布 worktree；包工头跑，两份转录本轮**逐行核对**，没有重跑）：
  `100 files / 1870 tests`、`Found 15 warnings and 0 errors.`、`client bundle: 340426 bytes`、
  `lib/ … (285 files, byte-identical)`，`96.51s` / `94.56s`。**`8c9b028` 那一遍才是发布门禁。** 逐行读数见
  `VALIDATION.md` 同日条与 `.rsi/evidence/release-0.13.38-2026-11-25/`。
- **`main` 是快进前进的**：`git merge --ff-only release/0.13.38`，所以 `main` 尖端**就是**门禁提交、也是标签剥出来的那个
  （`main` = `v0.13.38^{}` = **`8c9b028`**；远端 `refs/heads/main` 本轮实读同值，推送 `c3d729f..8c9b028  main -> main`）。
- **远端（`CONFIRMED`，本轮用 `gh` 重读）**：Release 工作流 run **`45594337910`** success
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45594337910 ；`main` 的 CI run **`45594332536`** success
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45594332536 。两个 run 的 head sha 都是 `8c9b028`。
  Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.38 ，名字 `Grok Workflow for DSH v0.13.38`，
  发布 **`2026-11-25T10:23:49Z`**，非 draft、非 prerelease，唯一资产 **`dsh-grok-workflow-0.13.38.tgz` = 958707 字节**，
  正文就是 `## [0.13.38] - 2026-11-25` 那一节（35 行）。
- **下一个接手的人必须知道（一条，最要紧）**：**残留的被删键从 `0.13.38` 起不再致命**——`mode: triage` 这种行留着，
  那一行照常激活，只在载入日志点名一次、设置页给一条提示（`D-155`）。所以 `0.13.35`–`0.13.37` 三条升级须知的
  「**先删掉那一行，再升级**」这个前置条件**已经作废**：现在可以直接升级，删不删都行。谁再把它写回须知，
  就是把插件自己的历史包袱重新塞回用户手里。
- **live 档案升级没做，记 `BLOCKED`，而且只剩一条理由**：本会话文件策略 `workspace-write`，`~/.dsh` 在工作区之外，
  审批提示在本会话被禁用（不能申请提权），所以**从这里写不进去**。上一轮的第二条理由（「`mode: triage` 还在，装了会让
  那一行拒载」）在 `0.13.38` 上**已经不成立**。只读实读：那一行 `config:` 下仍写着 `mode: triage`，已装版本 **`0.13.35`**，
  依赖仍是浮动的 `github:free6589/dsh-grok-workflow`（无标签）。`~/.dsh` size 1548 / mtime 1795362020、`~/.dsh/profiles`
  size 226 / mtime 1795337986，与上一轮记录同值——**未写、未重载、未重启**，3080 上的实例全程没碰。
- **收尾状态（按观察到的事实，不按口述）**：这一轮清理**确实做完了**（与上一轮不同）：`git worktree list` 只剩主检出
  （`/home/fish/projects_mine/dsh-grok-workflow 8c9b028 [main]`），`git branch` 只剩 `main`（外加与发布无关的
  `backup/*` 三条与 `feat/audit-layer`），`.tmp/wt-release-0.13.38` 与 `.agents/worktrees/fix-removed-keys-warn`
  都已不在盘上，本地 `release/0.13.38` / `fix-removed-keys-warn` 也已删；远端本来就没有 `release/0.13.38`
  （`git ls-remote origin 'refs/heads/release*'` 只有 `release/0.13.27`）。主检出剩下的唯一改动是与发布无关的
  `.gitignore` 本地忽略规则，**从未被暂存**。
- **一处读数偏差，照实记**：派单说两份转录的抬头都读 `> dsh-grok-workflow@0.13.38 ci`。实读：两份的**第 1 行都是空行**，
  抬头在第 2 行；`gate-release-8c9b028.out` 读 `@0.13.38`，而 `gate-merge-8f8a463.out` 读 **`@0.13.37`**——这是**对的**，
  版本号是发布提交才升的，合并提交那棵树仍写着 `0.13.37`（与上一轮 `5c58afd` 读 `@0.13.36` 同形）。门禁结论不受影响。

## 2026-11-25 — `fix-removed-keys-warn`：被删键改成「忽略 + 点名」（`D-155`），真机激活成立、设置页提示在这台宿主上不可见

- **From:** 实现者（`agent-167/impl-removed-keys`）· **To:** 包工头（`agent-167`）/ 下一个接手者
- **这一轮是什么**：特性轮。分支 `fix-removed-keys-warn`（worktree `.agents/worktrees/fix-removed-keys-warn`），基线 `main` 尖端 `c3d729f`。
  产品改动：`REMOVED_CONFIG_KEYS` 的 25 个键不再拒载整行，改为**忽略 + 点名**（载入日志一次 + 设置页一条提示）；
  未知键、拼错（did-you-mean）、`roles.<未知名>`、`roles.<role>[i].<错字段>`、`guardianModel.<错字段>`、非法值、越界数字**一个字都没放宽**。
  决定与两条被否决的备选（继续拒载 / 静默丢弃）见 `DECISIONS.md` 的 `D-155`。
- **门禁**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**：`99 files / 1862 tests`（基线 98 / 1849，+1 文件 +13 例）、
  `Found 15 warnings and 0 errors.`、`lib/ at c3d729f … (281 files, byte-identical)`、`client bundle: 333611 → 338664 bytes`。
- **真机（隔离克隆 `.tmp/soak-removed-keys/dsh-home`，profile `web-clone`，端口 3331，`npm pack` 安装，读回 `0.13.37`）**：
  ① 档案里**本来就带着** `mode: triage`（`cordis.patch.yml:563`，来自 live），这一行**照常激活**（`did not activate` 0 行、
  `describe` 24 个命名空间含 `grok-workflow`、`autoGenerate: true`）；② 用安装件的 `apply()` 记录到警告原文并点名 `"mode"`、
  两次重读仍只有 1 行；④ 对照删掉那一行后警告消失、激活照旧。证据 `.rsi/evidence/removed-keys-warn-2026-11-25/`。
- **设置页那条提示：本轮已加、已可见。** 机制是插件自己的只读路由
  （`src/config-notices-surface.ts`，`GET /grok-workflow/config-notices`，答 `{ok:true,notices:[{key,message}]}`），
  挂载照 `src/mode-surface.ts`（`inject(['webServer','connection'])` + `webServer.register({kind:'exact'})` +
  注册包在 `child.effect` 里 + 没有 `webServer` 时 `warn` 一句不炸）；清单读 `apply()` 的 per-load `Set`，**只读不排空**，
  日志侧去重不动。页面挂载时读一次，非空渲染 `data-warn="removed"`，空/失败静默降级。真机读数：路由原文含 `"mode"`、
  设置页提示可见（`.rsi/evidence/removed-keys-warn-2026-11-25/settings-page-with-notice.png`）、对照删掉 `mode:` 行后
  `notices: []` 且页面无提示。**为什么不是扫 `entry.user`**：宿主 `projectForm` 只投影 schema 键，被删键不在其中（见 `D-155`）。
- **`NOT_RUN`**：真实模型回合 / 端到端工作流（本轮改的是载入期配置校验与一条只读提示，真机样本只需激活 + 警告 + 提示 + 对照，不写成跑过）。
- **红线**：live `~/.dsh` 未写、3080 未碰（本会话沙箱本身把 `~/.dsh` 挂只读，两次不带 `DSH_HOME` 的 `dsh --help` 被 `EROFS` 挡下）；
  未合 main、未 push、未打 tag、未发版，`package.json` 仍 `0.13.37`。

## 2026-11-25 — `0.13.37` 已发布：两次门禁跑绿、标签与 GitHub Release 都在，live 档案升级按 `BLOCKED` 交给操作者

- **From:** 记忆收口（`agent-165/memory-closeout`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：**发布轮，不是代码轮**。分支 `release/0.13.37`（worktree `.tmp/wt-release-0.13.37`）从 `main` 尖端 **`d34214b`** 开出，
  先用真 `--no-ff` 把 `fix/switch-default-state`（尖端 `9d234c2`）折进来——合并提交 **`5c58afd`**，**零冲突**，合并树
  `50d7eca3…` 与分支树逐字节相同——然后一个发布提交 **`34236f0`** `chore(release): prepare v0.13.37`（**8 文件 / +38 −20**，树 `71ffdb66…`）。
  `src/` 与 `lib/` 只改了版本字面量那一对，没有一行逻辑。
- **`main` 是快进前进的**：`git merge --ff-only release/0.13.37`，所以 `main` 尖端**就是**跑门禁的那个提交、也是标签剥出来的那个
  （`git diff --stat release/0.13.37 main` 为空）；推送 `d34214b..34236f0  main -> main`。特性分支的 `--no-ff` 折入仍在历史里。
- **门禁读数（两次，都 `EXIT=0`，`TMPDIR=$PWD/.tmp npm run ci` 在发布 worktree 里跑）**：
  `5c58afd` 上 `98 files / 1849 tests`、`15 warnings / 0 errors`、`client bundle: 333611 bytes`、`lib/ at 5c58afd … (281 files, byte-identical)`、
  `Duration 85.82s`；**`34236f0` 上（这一遍就是发布门禁）同上，`Duration 88.35s`**。六个文档守卫 `6 files / 80 tests` PASS。
  逐行读数见 `VALIDATION.md` 同日条。
- **远端（`CONFIRMED`，本轮用 `gh` 重读过）**：Release run **`45577666102`** success
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45577666102 ；`main` 的 CI run **`45577662548`** success
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45577662548 。
  Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.37 ，`Grok Workflow for DSH v0.13.37`，
  发布 `2026-11-25T08:37:20Z`，target `main`，非 draft、非 prerelease，唯一资产 **`dsh-grok-workflow-0.13.37.tgz` = 947407 字节**。
  标签 `v0.13.37` = 附注对象 `235fa3e…` → `34236f0`；**没有移动任何已发布标签**（`v0.13.35` → `ffbb6b0`、`v0.13.36` → `26dc370`，`git ls-remote` 重读过）。
- **live 档案升级没做，记 `BLOCKED`（不是失败），只有这两条理由**：
  1. live 档案 `/home/fish/.dsh/profiles/web/cordis.patch.yml` 的 `grok-workflow` 行下**第 563 行仍是 `mode: triage`**（该文件没有 `legacyGate`），
     `mode` 自 `0.13.35` 起就是被删的键——现在把 0.13.37 装上去，那一行会**拒绝激活**、工作流从界面消失。**先删这一行，再升级。**
  2. 本会话文件策略是 `workspace-write`，`~/.dsh` 在工作区之外，从这里连写都不可能。
  另：live 仍声明**浮动**依赖 `github:free6589/dsh-grok-workflow`（无标签），读回已装 **`0.13.35`**；`~/.dsh` 与 `~/.dsh/profiles`
  前后尺寸 / mtime 同值，**未写、未重载、未重启**。
- **环境陷阱（踩过，记住）**：新开的发布 worktree 没有 `node_modules`，第一次门禁在 `verify:lib` 里炸
  （`Cannot find module …/verify-lib-*/node_modules/typescript/bin/tsc`），而 `typecheck` / `lint` 是靠 PATH 借父检出的
  `node_modules/.bin` **悄悄过去的**。**任何发布 worktree 先自己 `npm ci --prefer-offline`，门禁才有意义。**
- **下一个接手的人必须知道（一条，最要紧）**：开关与路由 / `/grok status` / 设置页**现在会显示不同的字，这是故意的**（`D-154`）——
  开关报**这个会话自己的记录**（没记录就 `未开 · 还没设过`），路由与设置页报**有效值**。谁想「对齐」两边，先读 `D-154` 与
  `test/mode-surface.spec.ts` 里那条 divergence 用例；对齐会把「界面说开着、工具说没开」那个矛盾放回来。
- **收尾状态（按观察到的事实，不按口述）**：派单说两个 worktree 与两条本地分支都已清；**记下这一条时 `git worktree list` /
  `git branch` 仍看到 `.tmp/wt-release-0.13.37`、`.tmp/wt-switch-default`、`release/0.13.37`、`fix/switch-default-state`**，
  门禁日志也还在前者的 `.tmp/` 里。**清理留给下一位，别当成已完成。** 主检出唯一改动是与发布无关的 `.gitignore` 本地设计稿规则，
  从未暂存。

## 2026-11-25 — 红二修完：没有记录的会话，开关不再显示「开」（`fix/switch-default-state`，`57b5723`）：路由与接单台准入一个字没动

- **From:** 实现手（`agent-164/impl-switch-default`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：分支 `fix/switch-default-state`（worktree `.tmp/wt-switch-default`，基线 `main` 尖端 **`d34214b`**），
  一个产品提交 **`57b5723`** `fix(client): a session with no mode record no longer shows the switch as on`（6 文件 / +243 −23），
  其后再一条只放文档与证据的提交。选了**甲**（`D-154`）：开关报会话自己的记录，没记录就显示「未开 · 还没设过」
  （`mode.switch.notOn`，中英各一条），胶囊不绿、灯不亮、**点一下写 `enabled:true`**；记录态与「没有 `source` 的老答复」照旧走开/关。
- **门禁与体积**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**（改前基线 `98 files / 1845 tests` → 改后 `98 files / 1849 tests`、
  `15 warnings / 0 errors`（未变）、`lib/ … (281 files, byte-identical)`、`lib/client.js` 331626 → **333611** 字节）；
  定向先红后绿 `4 failed | 168 passed` → `172 passed`。逐行读数见 `VALIDATION.md` 同日条。
- **真机读数**（隔离克隆 live `web` 档案、端口 **3331**、`npm pack` 打包安装、`sha256(lib/client.js) = edcd6983…` 与 worktree 逐字节相同）：
  新会话 `未开 · 还没设过` / `aria-checked=false` / lamp off，而路由答 `{"enabled":true,"source":"default","fallback":true}`；
  点一下 → `{"action":"set","enabled":true}` → `开`；`/grok off` → `关`、`/grok on` → `开`（各 +2 秒内、0 console errors）。
  证据 `.rsi/evidence/switch-default-state-2026-11-25/`。
- **下一个接手的人必须知道（三条，都是踩过的）**：
  1. **开关与 `/grok status` / 设置页现在会显示不同的字，这是故意的**（`D-154`）。谁要「对齐」两边，先读决定号与
     `test/mode-surface.spec.ts` 那个 divergence 用例——把它们对齐就会把红二放回来。
  2. **装法要用打包产物，不要 `link:`**：软链会让插件里的 `@deepseek-ai/dsh-session` 与宿主不是同一个模块实例，
     `/grok on` 会答 `Grok workflow toggle not changed: Receiver must be an instance of class Session`（与本改动无关，是装法问题）。
     `npm pack --pack-destination <scratch>` → `dsh plugin add file:<tgz>`，再比对 profile 内 `lib/client.js` 的 sha256。
  3. **克隆档案里那行 `mode: triage` 必须先删**（live 档案就有），否则 `grok-workflow` 整行拒绝激活、`/grok-workflow/mode` 全 404；
     另外克隆的工作区指向 live 用户的真实目录，探针前把它改成一次性 `/tmp/…`（`TESTING.md` 规则 1/9）。
- **这一轮看到、按分工故意没改的**：`/grok on` 回执仍是英文而界面是中文（中英混排是既有事实）；
  `src/index.ts` / `test/command.spec.ts` 散文里的 “master switch”（`D-152` 那批余账）；`src/client/index.js` FIELDS 注释里的 “total switch”。
- **红线**：`~/.dsh` = 2026-11-22 23:40:20、`~/.dsh/profiles` = 2026-11-22 16:59:46、`~/.dsh/profiles/web` = 2026-11-25 13:16:10
  （早于本会话、前后同值）、写探针 `Read-only file system`、3080 前后都是 401、live 仍装 `0.13.35`；
  未 push、未打 tag、未 bump、未合流，`package.json` 仍 `0.13.36`。

## 2026-11-25 — 429 开关那一行补上控件（`fix/ratelimit-toggle`，`534b867`）：14 个声明字段现在 14 个都有控件

- **From:** 实现手（`agent-163/impl`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：分支 `fix/ratelimit-toggle`（worktree `.tmp/wt-ratelimit-toggle`，基线 `main` 尖端 **`4def476`**），一个产品提交
  **`534b867`** `feat(settings): the 429 switch gets a control — the last declared field without one`（3 文件 / +141 −2），
  其后再一条只放文档与证据的提交。设置页「谁来干」卡里，`switchOnRateLimit`（默认 `true`）从「有文案没控件」变成一行真控件：
  `FieldRow` + `Toggle` + 提示段，位置在 **Guardian 之后、五条角色链之前**。默认值、schema、`src/config.ts`、版本号（仍 `0.13.36`）都没动。
- **门禁与体积**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**（包工头跑：`98 files / 1845 tests`、`15 warnings / 0 errors`、
  `lib/ at 534b867 is the build of src/ at 534b867 (281 files, byte-identical)`）；
  **六个文档守卫 6 文件 / 80 例绿**（`docs-version 8`、`docs-config-keys 14`、`i18n-parity 6`、`docs-architecture-version 3`、
  `update-entry 20`、`update-surface 29`；注意基线是 **80**，旧记的 79 是 `0.13.36` 发布轮的过期口径，那时 `docs-config-keys` 只有 13 例）。；`lib/client.js` **330313 → 331626（+1313）**。
- **真机读数**：隔离 home `.tmp/soak-ratelimit/fresh-home`、端口 **3327**、装上的 `sha256(lib/client.js)` =
  `f9408813d6312cecf1996a23245966ea7ce09a152a029f6d5311fe379f7f7ad0`（与 worktree 逐字节相同，版本读回 `0.13.36`）；
  中英两语言的行文案/状态/提示都读回，点开关 → `Save` 的 `settings/mutate` 只有一条 `set switchOnRateLimit=false`，
  隔离 profile 的 `cordis.patch.yml` 里读到 `switchOnRateLimit: false`，reload 后仍是关、`pageerror` 0 条。
  逐条见 `VALIDATION.md` 同日条与 `.rsi/evidence/ratelimit-toggle-2026-11-25/`。
- **下一个接手的人必须知道（偏差 (a)，`HYPOTHESIS`）**：按派单先 `clone-profile.mjs` 克隆 live `web` 档案那一次，
  `POST /api/settings/describe` **始终没有 `grok-workflow` 命名空间**（22 个），页面也不请求插件的 client bundle，于是没有「Workflow」这一栏；
  换 `--from-default-profile web` 新建隔离 profile + `dsh plugin add` 打进本构建后，同一个 `describe` 是 **23 个命名空间含它**
  （`autoGenerate: true`），页面出现。**两条路的差别没查到根因，只记现象**。以后做设置页真机 soak，先确认 `describe` 里有这个命名空间，
  再去开页面——否则会误判成「控件没写出来」。模型回合本轮 `NOT_RUN`（隔离 profile 不带凭据，也不需要）。
- **顺手补的一件事**：`GuardianModelRow` 的卡上加了 `data-field="guardianModel"`（原先只有 `data-gw-guardian`），
  否则新增的「每个声明字段都必须有控件」总守卫（按 `GROK_WORKFLOW_FIELDS` 全量遍历）对 14 个 key 走不全。

## 2026-11-25 — 设置页与 `/grok on` 的文案改说实话（`fix/settings-copy`，`05f9e2b`）：**改的是话，不是行为**；还欠着五处「总开关」旧账，都记在下面

- **From:** 文案块（`agent-160` 派发的 `copy-hand`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：分支 `fix/settings-copy`（worktree `.worktrees/fix-settings-copy`，基线 `main` 尖端 `50dad03`），
  一个产品提交 **`05f9e2b`**，其后一个只放证据与记忆的提交。行为零变化：`/grok off` 的答案、记录形状、读回检查**一字未改**；
  `/grok on` 的启用分支仍是纯字符串、没有新增任何 config 读取。改的是：EN/ZH 五处文案 + 三处注释、`/grok on` 回执一句、
  两个 README 的设置页段落、三个守卫 spec 与 `ON_TEXT`、重建的 `lib/client.js` 与 `lib/command.*`。
- **现在页面上说的是什么**：第 1 组叫「会话默认」，字段叫「没打 `/grok` 时的默认」，状态行「开：没打过 `/grok` 的会话报这个」，
  副行「只是报出来的默认值：要在这个会话里开可复核的块，还得这个会话自己打一句 `/grok`」；`/grok on` 回执补了
  `as long as the block intake is switched on`；两个 README 删掉 `auto`/`full`，改成页面真实渲染的五组。
- **门禁读数**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**（`98 files / 1841 tests`、`15 warnings / 0 errors`、
  `lib/ at 05f9e2b is the build of src/ at 05f9e2b (281 files, byte-identical)`、`lib/client.js` 329354 → **330313** 字节）。
- **真机读数**：隔离克隆 live `web` 档案、自有端口 **3321**、同一个 headless 浏览器把前后两版逐字对读（改前
  `开着：工作流工具可用` / 改后 `开：没打过 /grok 的会话报这个`），0 console errors。`/grok on` 回执在 GUI 里 **`NOT_RUN`**。
  逐条见 `VALIDATION.md` 同日条与 `.rsi/evidence/settings-copy-2026-11-25/`。
- **下一个接手的人必须知道**：`grokDefault` 只决定「没有 `/grok` 记录的会话**报什么**」，**从不接活**；能不能开可复核的块
  读的是那个会话自己的记录（`canAcceptBlock()`，`src/user-source.ts`）加载入期 `blockIntake`。所以任何「开关一开就……」
  的文案都是假话——改文案之前先读这两处。**红线**：`~/.dsh` 与 `~/.dsh/profiles` mtime 前后同值（2026-11-22 23:40:20 /
  16:59:46）、写探针 `Read-only file system`、3080 → 401；未 push、未打 tag、未 bump、未 publish。
- **这一轮看到、按分工故意没改的（逐条，都是观察，不是待修清单的承诺）**：
  1. `src/client/index.js` 的 FIELDS 注释（`// Total switch (mock “总开关”) …`）仍把这颗开关叫 total switch。
  2. `src/index.ts:391`、`src/mode-surface.ts:2`、`test/command.spec.ts` 的散文里仍写 “master switch”。
  3. `page.intro` 与 `group.limits`（“How much effort” / “下多大力气”）还在用「下多大力气」的框。
  4. ~~`switchOnRateLimit` 仍有文案与 schema 行，但页面上**渲染不出来**（14 个声明字段里唯一没有控件的一个）。~~
     **已关闭（2026-11-25，`534b867`）**：「谁来干」卡里有了这一行（`FieldRow` + `Toggle` + 提示段，Guardian 之后、五条角色链之前），
     两语言都读回、保存落盘、reload 仍保留；并且新增了一条按 `GROK_WORKFLOW_FIELDS` 全量遍历的总守卫，下一个「声明了但没画」的字段会直接变红。
     读数见 `VALIDATION.md` 同日条与 `.rsi/evidence/ratelimit-toggle-2026-11-25/`，判据见 `DECISIONS.md` 的 `D-153`。
  5. `docs/knowledge/STATE.md` 里 2026-11-25 13:30 那条补记逐字引的是**上一版** `/grok on` 回执，现在缺了新的限定语。

## 2026-11-25 — 用户视角回归跑完（隔离 fork + 已发布 `v0.13.36`）：**六项里五项通、两项红**，红一已另开分支修，红二等你拍板

- **From:** 用户回归包工头（`agent-157`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：分支 `fix/user-regression`（worktree `.agents/worktrees/fix/user-regression`，基线 `main` 尖端 `6e9bc56`），
  **只放证据与记忆**，产品代码一个字没改（`package.json` 仍 `0.13.36`）。
- **怎么跑的（`CONFIRMED`）**：`clone-profile.mjs` 从 live `web` 档案克隆成隔离 home（7720 文件 / 88 421 847 B、parity 5/5），
  按 HANDOFF 上一条的要求**删掉 `mode:` 那一行**（克隆里本来没有 `legacyGate:`），端口 **3311**，插件装**固定标签**
  `github:free6589/dsh-grok-workflow#v0.13.36`（解析到 `codeload…/26dc370…`，版本读回 `0.13.36`），真模型
  `bifrost-responses/opencode-go/muse-spark-1.3-contributor`。live `~/.dsh` 一行未写（写探针 `Read-only file system`）、
  3080 前后都是 401、live 仍装 `0.13.35`；`~/.dsh/profiles/web` 目录 mtime 中段动过一次但里面文件没有晚于 12:09:50 的（见 VALIDATION 同日条）。
- **五项通了**：开关（命令写、路由读回同一份记录）、真任务（4 步 8 次真读盘、答案带文档节名）、跑中插话（插话在 turn 1 里被
  排队、turn 1 跑完原话进 turn 2）、预览→开工（`bp-211d7434…` → `block_id 50761193…`、`approval.quote="确认（开工）"`、
  接单后派 subagent、文件真写出来）、**监工判决**（`pass` + **`judged:true`** + 判决行写着真路由名 + 逐条验收带证据）。
  卡片点头也通了，但**只在把宿主提问工具改成 `mode: timed` 之后**（默认 legacy 下卡片答案只是同回合工具结果，不可能算批准）。
- **这一轮补上的缺口**：上一轮挂着的「独立**模型**监工在真机上一次都没验过」——现在有真机读数了（`judged:true`）。
- **两条红（`CONFIRMED`）**：
  1. **`/grok on` 的确认话在承诺一件 0.13.36 已经不做的事**：`src/command.ts:325` 说「every message now runs the full
     plan→execute→verify workflow」，但记录的读者只有 `/grok status` 文案、开关路由、接单台准入三处；真机读数也对得上
     （`/grok on` 之后普通任务直接干活、没有流水线）。**已另开分支 `fix/grok-command-text` 修，不混进本分支。**
  2. **同一个会话里，开关说「开」、接单台说「没打开」**：`GET /grok-workflow/mode?action=status` 返回
     `{"enabled":true,"source":"default","fallback":true}`（界面显示「开」），同一会话 `grok_open_block` 却拒成
     `mode-off: 这个会话的 grok 模式没打开，接单台不接单`。打一条 `/grok on` 就消失，但没人会想到要打。
     **这是产品决定，本轮没动**，两条修法写在证据文件 §5：甲（开关在没有记录时不要显示「开」）／乙（准入承认部署默认）。
     建议甲：界面不说谎、不动准入语义，但要改用户可见的默认显示，得有决定号。
- **下一步（按顺序）**：
  1. **拍板红二**（甲还是乙），定了之后按正常流程开分支改。
  2. 收 `fix/grok-command-text`（`5c120b1` 改话术 + 守卫测试 + `[Unreleased]` 中英条目 + `lib/` 重建，`78c9091` 证据；
     `npm run ci` 在 `78c9091` 上 **EXIT=0**、`98 files / 1839 tests`、`15 warnings / 0 errors`，`lib/` 逐字节一致——这些是它
     跑的，我另外自己重跑了 `test/command.spec.ts`（`27 passed`）与 `scripts/verify-lib.mjs`（`byte-identical`））。验过再合。
  3. **操作者自己那一手还没做**：live 档案删 `mode:` 与 `legacyGate:` 两行 → 装 `v0.13.36` → 读回版本（顺序不能反）。
- **三件会踩的事**：
  1. **隔离 home 没有 `AGENT2API_API_KEY`**：live 档案的 worker/verifier/supervisor/guardian 全指着 `agent2api`，
     不钉到一条真能答的路由（本轮用的 `bifrost-responses`）连一次子调用都起不来；先证后钉（`/openai/v1/responses` → 200；
     `tokenrhythm/glm-5.3-flash` → 403 实名认证，丢掉）。
  2. **卡片要能被记成批准，必须 `tool-ask-user` 是 `timed`**：顶层 `- id: tool-ask-user` 改不动预设里的那一行，
     要 `- id: preset-standard` + `config.plugins` 整份覆盖（本轮就是这么改的）。
  3. **`~/.serena` 在本沙箱只读**，`serena` MCP 会报 `OSError: [Errno 30]`，与本轮结论无关，别当缺陷查。
- **没跑的（`NOT_RUN`）**：真浏览器点那颗开关按钮（fork 的 web 落「生图」面板、隔离 home 的会话树在 UI 里是空的）、
  默认 legacy 配置下点卡片、设置页渲染、live 上升级、多块切分、心跳投递。
- **证据**：`.rsi/evidence/user-regression-2026-11-25/README.md`（逐条逐字读数、红单、边界）。

## 2026-11-25 — `0.13.36` 已发布并跑绿；下一个接手的先看这条：**升级前必须把档案里 `mode:` 与 `legacyGate:` 两行都删掉**，本机 live 档案还没升（`BLOCKED`，等操作者）

- **From:** 记忆收口（`agent-155/release-memory`）· **To:** 操作者 / 下一个接手者
- **这一轮是什么**：`main` 上的发布提交 **`26dc370`** `chore(release): prepare v0.13.36`（**8 文件 / +35 −30**），标签 **`v0.13.36`**
  （附注标签对象 `0ff357b` → 剥出 `26dc370`）。**`0.13.36` 已经发布**，不是「准备发」。
- **发出去的是什么（`CONFIRMED`）**：`package.json` + `package-lock.json` 的版本；`src/client/index.js` 的 `PLUGIN_VERSION` / `UPDATE_LATEST` 两行
  与 `lib/client.js` 里同样两行的重建；`README.md` / `README.zh-CN.md` 的声明版本、两处安装固定点、正文里那个反引号版本、已发布标签清单
  （末尾补上 `v0.13.35` 与 `v0.13.36`）；`docs/LOCAL-TESTING.md` 三个 tarball 名统一成 `dsh-grok-workflow-0.13.36.tgz`；`CHANGELOG.md` 开新段。
  **`src/` 与 `lib/` 的改动只有版本字面量，没有逻辑改动。**
- **`CHANGELOG.md` 的形状**：`## [Unreleased]` 留成空标题，新段 `## [0.13.36] - 2026-11-25` 压在原有四个小节之上；`### Upgrade note / 升级须知`
  **重写成点名两个键**：残留 `mode:` **或** 残留 `legacyGate:`，**任一个单独存在**都会让 `grok-workflow` 那一行拒绝激活、工作流从界面消失，
  所以升级前**两行都要删**；设置与记录不丢；我们**没有**改过任何人的档案。
- **已经证实（`CONFIRMED`）**：
  1. **合并早就在了**：`main` 尖端此前是 `2f71a95`（八条分支提曲折进来），与 `origin/main` 同点，主检出树与分支尖端 `bf337b4` 逐字节相同
     （`git diff --stat bf337b4 main` 为空）。这一轮只是在它上面加了一个版本提交。
  2. **本地门禁**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**，`98 files` / **`1839 tests`**、`Duration 97.12s`、**`Found 15 warnings and 0 errors.`**、
     `client bundle: 329354 bytes → lib/client.js`。
  3. **`verify:lib` 两次读数都对**：门禁里那次打印 `lib/ at 2f71a95 …`，因为它是**按提交**验的、那次验的是升版前的提交；提交后重跑
     `node scripts/verify-lib.mjs` → **`lib/ at 26dc370 is the build of src/ at 26dc370 (281 files, byte-identical)`**。别把前一行当缺陷。
  4. **推送**：`2f71a95..26dc370  main -> main`、`* [new tag]  v0.13.36`；没有 force-push，没有移动任何已发布标签。
  5. **远端**：Release run **`45547073752`** success（head sha `26dc370`）、`main` 的 CI run **`45547060845`** success；
     Release 已发布，唯一资产 `dsh-grok-workflow-0.13.36.tgz` = **943206 字节**。
- **操作者必须自己做的（`BLOCKED`，我们刻意没做）**：
  1. 打开 live 档案的 `<档案目录>/cordis.patch.yml`，找到 `grok-workflow` 那一行，把它下面写着 `mode:` 的那一行**整行删掉**，
     再把写着 `legacyGate:` 的那一行也**整行删掉**，保存。
  2. 然后才把插件升到**固定标签** `v0.13.36`（不要用浮动范围、`latest` 或分支名），装完读回的版本必须就是 `0.13.36`。
  3. 为什么必须按这个顺序：`AGENTS.md` §11 的自动升级这一轮**没有执行**——档案里留着任一个旧键，装上去那一行就拒绝激活、工作流从界面消失。
     `~/.dsh` **一行未读、一字未写**，运行中的实例没有重启。**这是等操作者动手，不是失败。**
- **下一步（按顺序）**：
  1. **操作者删两行 → 升级到 `v0.13.36` → 读回版本**（上面那三步）。
  2. **下一轮可做：`HARD_LIMITS.maxQueuedMessages`（`src/config.ts:10` = 8）这个零读者常量的去留。** 键早在 `REMOVED_CONFIG_KEYS` 里，
     clamp 永不发生；删它要连带核 `HARD_LIMITS` 的其他读者与 `test/config.spec.ts` 的守卫，是一次代码改动。
  3. **冷加载多读一次 `status` 那条残留**要不要抠：抠就得让路由的答案形状多一个字段，属于另一次决定。
- **分支与 worktree 的现状（`CONFIRMED`，`git worktree list` / `git branch` 现查）**：**只有一个工作树**，就是主检出
  `/home/fish/projects_mine/dsh-grok-workflow`，检出在 `26dc370 [main]`。`fix/switch-refresh` 与 `fix/composer-label` 的工作树**和分支都已经清掉**。
  本地还留着四个分支，**都不是工作树、本轮没动**：`backup/wip-2026-11-24-live-steering`、`backup/wip-2026-11-24-team-dispatch-v1`、
  `backup/wip-2026-11-24-progress-task-number-first`、`feat/audit-layer`（它的远端已经没了）。
- **残留三条（照抄，不重新论证）**：① 冷加载会多读一次 `status`（不是轮询，状态收敛正确）；② `HARD_LIMITS.maxQueuedMessages = 8` 零读者；
  ③ `docs/knowledge` 仍不受任何测试守卫。
- **三件会踩的事**：
  1. **别把门禁里那句 `lib/ at 2f71a95 …` 当成产物过期**：`verify:lib` 按提交验、不看工作树；要看当前提交是否一致，提交后再单独跑一次。
  2. **升级顺序不能反**：先删 `mode:` 与 `legacyGate:` 两行，再装 0.13.36。反过来做，界面上的工作流会消失（数据不丢，但看起来像坏了）。
  3. **工作树里 `.gitignore` 那条改动与本轮无关**：四行本地设计稿忽略规则，早前会话加的，发布提交里没暂存，之后也别顺手带上。
- **一条要如实说的话**：这一轮的发布提交**只改版本字面量与文档**，运行行为零变化，所以没有为它重跑真机 soak；最近一次真机读数是 0.13.35 那一轮
  （打字 `/grok on|off` 后开关 +0.5 秒自己刷新）。全量门禁由包工头跑，读数如上。

## 2026-11-25 — 这一支装了两批：开关刷新修复 + 四个死导出删除，附带队列数字订正与升级须知（`fix/switch-refresh`，未发版）

- **From:** 记忆收口（`agent-154/switch-refresh-worker`）· **To:** 操作者 / 下一个接手者
- **这一支是什么**：分支 `fix/switch-refresh`（worktree `.tmp/wt-switch-refresh`），基线 `main` 尖端 **`84efda0`**。**完整提交清单（八条，最后一条是本轮文档提交）**：
  `8b32e5e`（开关刷新：`src/client/index.js` 143、`lib/client.js` 143、`test/client.spec.ts` 230/1）、`ded1df6`（lint 快照写法，test 3/1）、
  `266006b`（第一轮记忆 + 证据）、`144a9a1`（第 7 条用例：面后到，test 38/0）、`3366248`（证据补会话日志）、`07b91d3`（门禁读数对齐尖端 `3366248` / 1839 例）、
  `c5f40b7`（删四个零引用导出 + `docs/ARCHITECTURE.md` 载体一句）、以及本轮
  `docs(queue-limit): state the queue bound that exists, and flag the removed key before upgrading`。**未 push、未发版、未合 `main`**，`package.json` 仍是 **`0.13.35`**。
- **这一支现在同时装了两件事（外加两处文档订正）**：
  1. **开关刷新修复（`D-150`）**：打字 `/grok on|off` 之后，已挂载的开关自己读一次并重画（+0.5 秒，真机验过），不刷新、不点击、不轮询。
  2. **四个零引用导出删掉（`D-151`）**：`REPORT_BEGIN` / `REPORT_END` / `LEDGER_GUARD`（协议词汇，先在 `docs/ARCHITECTURE.md` 补载体再删）与
     `archiveRoundNow`（死代码，直接删）。有读者的 `RELAY_SOURCE_KIND`、`createMemoryArchiver`、`RoundArchiveInput`、`ArchiveRecorderOptions`、
     `roundArchiveEvidence` 未动。行为零变化。
  3. **队列数字订正**：两个 README 里的 `maxQueuedMessages=4` 没有代码出处，改成「该键已删除」+「真实上限是内部常量 8，不可配置」。
  4. **升级须知**：`CHANGELOG.md` 新增 `### Upgrade note / 升级须知`，写清升级前删掉档案里那行 `mode:`（否则插件那行拒绝激活、工作流消失，数据不丢）。
- **下一步（按顺序）**：
  1. **下一轮可做：`HARD_LIMITS.maxQueuedMessages`（`src/config.ts:10` = 8）这个零读者残留的去留。** 键早在 `REMOVED_CONFIG_KEYS` 里，
     clamp 永不发生，所以它现在只是一个数字；删它要连带核 `HARD_LIMITS` 的其他读者与 `test/config.spec.ts` 的守卫，属于一次代码改动，本轮刻意没做。
  2. **发版时把 `[Unreleased]` 收进版本段**（照 `AGENTS.md` §7 五步）：`[Unreleased]` 下现在有 `### Fixed / 修复`、`### Upgrade note / 升级须知`、
     以及更早的 `### Changed / 变更`、`### Removed / 移除` 四条。**升级须知必须保留**——它是这一版唯一一条「不做就会看起来像坏了」的操作。
  3. **发版后的自动升级要停一手**：live 档案里那行 `mode:` 由操作者亲手删（本轮只在 `CHANGELOG.md` 写了步骤，**没有、也不会**去碰 `~/.dsh`）。
- **三件会踩的事**：
  1. **README 里删「已移除的键」必须留键名**：`test/docs-config-keys.spec.ts` 有一条守卫要求每个 `REMOVED_CONFIG_KEYS` 里的键都在两个 README 里被提到。
     本轮第一次把 `maxQueuedMessages=4` 整段删掉就被它抓红（`README.md never mentions the removed key maxQueuedMessages`）——正确改法是**删数字、留键名、写明已删除**。
  2. **删一个零读者符号之前先问「它是协议还是实现」**：协议词汇要在 `docs/` 里有载体才能删（`D-151` 的做法），实现细节删了就删了。反过来，
     「协议另有载体」不等于「代码里可以留着墓碑」。
  3. **`.tmp/` 的 worktree 里 `node_modules` 若是空目录，`npm run ci` 会在 `verify:lib` 阶段报找不到 `typescript`**；解法是临时把 worktree 的
     `node_modules` 软链到主检出（跑完还原）。另外 `verify:lib` **只验提交、不验工作树**。
- **一条要如实说的话**：本轮的代码改动（删四个导出）**没有真机 soak**——删的是零读者符号，运行行为不变，`engine-contract` 15 例就是导出面守卫；
  全量门禁由包工头跑。

## 2026-11-25 — 打字 `/grok off` 之后已挂载的开关会自己刷新了（`fix/switch-refresh`，未发版）：下一步是评审「订阅 vs 回填」这条判据，以及那条冷加载残留要不要抠掉

- **From:** 记忆收口（`agent-154/switch-refresh-worker`）· **To:** 操作者 / 下一个接手者
- **这一支是什么**：分支 `fix/switch-refresh`（worktree `.tmp/wt-switch-refresh`），基线 `main` 尖端 **`84efda0`**，两个功能/测试提交
  **`8b32e5e`**「`fix(client): refresh the mounted workflow switch after a command writes the record`」（**3 文件**：`lib/client.js` 143/0、
  `src/client/index.js` 143/0、`test/client.spec.ts` 230/1）与 **`ded1df6`**「`test(client): keep the listener snapshot without tripping the
  spread lint`」（**1 文件**：`test/client.spec.ts` 3/1），其后再一条**只写文档与证据**的提交（`CHANGELOG.md` + `README.md` +
  `README.zh-CN.md` + `docs/knowledge/` 四份 + `.rsi/evidence/switch-refresh-2026-11-25/`），以及其后两条只写文档/测试的提交
  **`144a9a1`**「`test(client): cover the sessions face that arrives after the switch mounts`」（1 文件：`test/client.spec.ts` 38/0）与
  **`3366248`**「`docs(switch-refresh): cite the session log for the pre-fix record write`」。**整支尖端 `3366248`**，五条提交：
  `8b32e5e`、`ded1df6`、`266006b`、`144a9a1`、`3366248`。
  **未 push、未发版、未合 `main`、没有 PR**，`package.json` 仍是 **`0.13.35`**。
- **用户能看到的变化**：以前打字 `/grok off` 关掉工作流，记录确实写进去了（工作流真的关了），但对话框底部那个开关还显示页面加载时读到的样子，
  得刷新页面或者点它一下才对。现在记录一写入，按钮就自己再读一次，**+0.5 秒**内跟着变：不用刷新、不用点，后台也没有任何东西在定时跑。
  `/grok on` 同理。重读失败时开关保持已经显示的状态，不弹错误。
- **已经证实的（`CONFIRMED`）**：
  1. **门禁**：`TMPDIR=$PWD/.tmp npm run ci` 在**整支尖端 `3366248`** 的树上 **EXIT=0**——`98 files` / **`1839 tests`**（基线 1832 + 本轮 7）、
     **`Found 15 warnings and 0 errors.`**（回到基线 15）、`lib/ at 3366248 is the build of src/ at 3366248 (281 files, byte-identical)`、
     `client bundle: 329354 bytes`（基线提交 321607，**+7747** 就是订阅那一段）。
  2. **定向**：`npx vitest run test/client.spec.ts test/i18n-parity.spec.ts` → **2 files / 145 tests PASS**（`client` 132 → **139**）。
     七条新用例都驱动真实组件挂载（核心刷新 / 同 seq 不重读 / 无记录不多读 / 后台失败静默 / 缺面回归 / 卸载即退订 / **面在挂载后才到**）。
     反向验证过：把「取面」改回旧行为，`5 failed / 133 passed`。
  3. **真机（隔离克隆，端口 3321，`~/.dsh` 与 3080 全程未碰）**：**改前** 20 秒 20 次快照全停在「开」、`/grok-workflow/mode` 只有挂载那 1 次；
     **改后** 打字 `/grok on` → **+0.5 秒**变开、打字 `/grok off` → **+0.5 秒**变关，全程 4 次请求，之后 **+15 秒静默窗 0 次**。
  4. **前提在真机上成立**：`/api/remote.mux` 的 websocket 帧里就有 `plugin:grok-workflow/mode` 记录（seq 5 / 27 / 30，`ignorable:true`）——
     「客户端收得到这条记录」不再是 `HYPOTHESIS`。逐行读数在 `VALIDATION.md` 同日条与 `.rsi/evidence/switch-refresh-2026-11-25/`。
- **下一步（按顺序）**：
  1. **合并前请评审这条判据**（`D-150`）：为什么选「订阅会话事件窗口」而不是「让命令路径的写响应回填」。一句话——②要在宿主的一个回合里新增
     一条到浏览器的通道（新机制），而 ① 只动客户端一份 bundle，路由 / host / 协议零改动。若以后真的需要「宿主主动推」，②仍是方向，
     但不是这一轮的修法。
  2. **决定那条冷加载残留要不要抠掉**：每次页面加载会**多读一次** `status`（挂载读 t=1.67s、历史 follow 帧 t=1.69s 才到，订阅时窗口还是空的，
     那条「本来就在历史里」的记录被当成新记录）。代价只是一个几十字节的 POST，状态收敛正确，**不是轮询**。要抠就得让基线知道「挂载读已经覆盖到哪个 seq」，
     那是把 route 的答案形状扩一个字段——属于另一次决定，本轮刻意没做。
  3. **未发版**：`package.json` 仍 **`0.13.35`**；`CHANGELOG.md` 的 `[Unreleased]` 下已经有一条 `### Fixed / 修复`（中英双语）等着被收进版本段。
     发版照 `AGENTS.md` §7 的五步流程。
- **三件会踩的事**：
  1. **`.tmp/` 的 worktree 里 `node_modules` 若是空目录，`npm run ci` 会在 `verify:lib` 阶段报找不到 `typescript`**
     （`Cannot find module '…/node_modules/typescript/bin/tsc'`）。原因是 `scripts/verify-lib.mjs` 把 **本 worktree 的** `node_modules`
     软链进临时目录，而 git worktree 里那个目录只有 vitest 的 `.vite` 缓存。解法：把 worktree 的 `node_modules` 软链到主检出的同名目录再跑
     （本轮就是这么跑通的），跑完还原。
  2. **`verify:lib` 只验提交、不验工作树**：工作树里 `lib/` 换了却还没提交时，它会说**旧提交**自洽。引用时只认
     `lib/ at <当前提交> is the build of src/ at <同一提交>` 那一行。
  3. **「事件驱动」很容易被写成「每条事件都读」**：那只是换了个名字的轮询。本轮的判据是「出现本插件的记录**且** seq 比已记账的更大」——
     用窗口里的 `seq` 去重，同一 seq 只读一次；`assistant/*`、`tool/*`、`step/*` 一概不触发。改这段代码时别退化成「订阅里直接 read」。
- **一条要如实说的话**：**模型回合 `NOT_RUN`**——隔离克隆按设计缺 `AGENT2API_API_KEY`，本轮真机只覆盖「加载 / 打字一条斜杠命令 / 观察开关」，
  命令本身不调模型，**模型回答这一层没验**（环境事实，不是失败）。另外两条边界也写在 `D-150` 里：`binding()` 只对被客户端 materialize 的会话
  返回（没有时静默不刷新）；挂载读与订阅建立之间的毫秒级窗口理论上可能漏一次写入（`HYPOTHESIS`，未观测到）。

## 2026-11-25 — 对话框底部开关的文案改成「工作流开关 / 开」（`fix/composer-label`，未发版）：下一步是评审取词、决定「命令写入后不刷新」修不修（用户文档的旧叫法已在本轮一并改掉）

- **From:** 记忆收口（`agent-153/memory-scribe`）· **To:** 操作者 / 下一个接手者
- **这一支是什么**：分支 `fix/composer-label`（worktree `.tmp/wt-composer-label`），基线 `main` 尖端 **`424ed99`**，功能提交 **`2f218d0`**
  「`fix(client): say the workflow switch plainly, without the deleted full-crew mode`」（**3 文件 / +31 −17**：`src/client/index.js`
  4/4、`lib/client.js` 4/4、`test/client.spec.ts` +23 −9），其后再一条**只写记忆的文档提交**（`CHANGELOG.md` + `docs/knowledge/` 四份 +
  `.rsi/evidence/composer-label-2026-11-25/README.md`）。**未 push、未发版、未合 `main`、没有 PR**，`package.json` 仍是 **`0.13.35`**。
- **改了什么（用户能看到的那一层）**：对话框底部第三个开关的四条文案——EN 标签 `Workflow` → **`Workflow switch`**、EN 开启态
  `On · full crew` → **`On`**；ZH 标签 `workflow总开关` → **`工作流开关`**、ZH 开启态 `开 · 全员模式` → **`开`**。原因是旧文案在指一个
  已经删掉的东西：「全员模式 / full crew」是旧前台那一档的名字，而旧前台在 0.13.35 已整条链删除。八个 `mode.switch.*` 键里其余六个
  （`aria`/`off`/`reading`/`busy`/`noSession`/`failed`）一字未动。**行为零变化**：同一条会话记录、同一个请求、同一次点击。
- **已经证实的**：`TMPDIR=$PWD/.tmp npm run ci` 在 `2f218d0` 上 **EXIT=0**——`98 files` / **`1832 tests`**（与基线同数，本轮没增删用例）、
  `Found 15 warnings and 0 errors.`（与 0.13.35 那 15 条相同）、`lib/ at 2f218d0 is the build of src/ at 2f218d0 (281 files, byte-identical)`、
  `client bundle: 321607 bytes`（基线 `424ed99` 提交的是 321631，**差 24 字节**就是四条文案变短）。定向测试
  `npx vitest run test/client.spec.ts test/i18n-parity.spec.ts` → **2 files / 138 tests PASS**（`client` 132、`i18n-parity` 6）。
  `src/`、`test/` 与两个 README 里 `full crew` / `全员模式` / `workflow总开关` **0 命中**（`README.zh-CN.md:248` 那处本轮一并改了）。
  逐行读数在 `VALIDATION.md` 同日条与 `STATE.md` 顶部；
  证据在 `.rsi/evidence/composer-label-2026-11-25/README.md`。
- **这一轮顺带结案的旧疑点（方向与旧记录相反，值得先看这段）**：`VALIDATION.md:410` 那条 `HYPOTHESIS`（「`/grok off` 后开关显示关、
  下一回合又显示开 · 全员模式，疑似回落到 profile 默认值」）**结案了，而且回落不成立**。真机（live `web` profile 克隆到
  `.tmp/soak-label/dsh-home`，端口 **3321**，`~/.dsh` 与 3080 全程未碰）的读数是：**同一个有记录的会话**，reload 前、reload 后、
  下一回合三次读到的都是 `source:"record", enabled:false`，与账本逐字一致；看到的「回开」是因为 reload 后前端打开的是**另一个新建的
  空会话**，那里没有记录，宿主诚实地答 `source:"default"`，于是显示默认的开。**真正存在的是另一个缺陷、方向也相反：开关只在挂载时读一次，
  用命令写入后不刷新**（点击会刷新，因为写响应会回填状态；打字 `/grok off` 不会——40 秒观察窗加下一回合，`/grok-workflow/mode` 一共只有
  挂载时那 1 次请求）。旧记录原文不回改（写下时为真），以 `VALIDATION.md` 新条目为准。
- **下一步（按顺序）**：
  1. **合并前请评审文案取词**：英文 `Workflow switch`、中文 `工作流开关`；开启态只有 `On` / `开`，与 `Off` / `关` 相对。这是**产品取词**，
     不是实现细节，所以没有替操作者拍板——若不喜欢（比如英文想用 `Grok workflow`、中文想用「工作流总开关」），改的是同一个字典里的
     两对字符串加 `test/client.spec.ts` 里那条钉中文标签的字面量。**注意：** 中文标签与状态词现在都是短词，**任何「整行文本包含状态词」的
     断言都会退化成永真**（标签 `工作流开关` 自带 `开` 字）——换词之后结构上那两条防塌陷守卫（`label ≠ on`、`on ≠ off`）**必须留着**。
  2. **决定是否修「命令写入后开关不刷新」**（`D-149`）。若修，路子有两条：订阅 `session/event`（命令写记录时收到事件再读一次），
     或者让命令路径的写响应回填到已挂载的开关（点击那条路现在就是这么工作的）。**这是另一次决定，别在这里实现**——本轮的任务是
     「改文案 + 把现象与成因分开」，两件事混在一个 diff 里，评审就分不清哪一半是文案、哪一半是行为。
  3. **未发版**：`package.json` 仍 **`0.13.35`**，本轮没有 bump、没有 tag、没有 Release。要发版时照 `AGENTS.md` §7 的五步流程走；
     `CHANGELOG.md` 的 `[Unreleased]` 下已经有一条 `### Changed / 变更`（中英双语）等着被收进版本段。
- **用户文档已跟上新叫法（本轮一并改掉，不再是待办）**：`README.zh-CN.md:248` 原来写着「**再接一个「workflow总开关」**」，已改成
  「**再接一个「工作流开关」**」——**+1 −1，只动这一处措辞**；同段「挂载时读一次 / 会话没有记录时显示 `grokDefault` / 关闭三重提示」的描述
  **一字未改**（那些仍然是真话），英文 `README.md` 本来就叫 `The workflow switch`，没动。改后两个 README 里
  `full crew` / `全员模式` / `workflow总开关` 都不再出现，六个文档守卫 **6 files / 79 tests PASS**。
  **仍留给下一轮的一件小事**：那段「挂载时读一次」的说明现在是**已知缺陷的说明书**，值得顺手加一句「命令写入后不会自动刷新」，
  否则读者会以为它已经是实时的——但那是与修「命令后不刷新」（下一步 ②）同一批决定的文案，本轮没有替操作者写。
- **三件会踩的事**：
  1. **中文短词把整行断言变成了假绿**：这是本轮唯一的技术陷阱。状态词缩成单字之后，「整行包含」类断言在两种状态下都为真。
     本轮的解法是量**状态行那个元素**（`data-mode-note`，渲染侧挂的是 `state.phase`，文字由 `modeSwitchText` 给），并对它断言
     相等，再加 `label ≠ on`、`on ≠ off` 两条守卫。**换任何短词都别退回「整行包含」。**
  2. **`verify:lib` 只验提交、不验工作树**：工作树里 `lib/` 换了却还没提交时，它会说**旧提交**自洽。引用读数时只认
     `lib/ at <当前提交> is the build of src/ at <同一提交>` 这行，别拿祖先提交的输出给工作树背书。
  3. **真机必须克隆 live profile，不能软链插件**：软链会让 Node 解析到仓库自带的 `@deepseek-ai/*`，与宿主不是同一个类实例、开关直接挂
     （`docs/LOCAL-TESTING.md` 的 trap 清单里有这条）。本轮是 `node scripts/clone-profile.mjs` → `.tmp/soak-label/dsh-home`
     （**7699 文件** / parity **5/5** / **1 行凭据按设计脱敏**），删掉克隆里已移除的键 `mode: triage` 再起，端口 **3321**。
- **一条要如实说的话**：真机**没有验到模型回合**——隔离克隆按设计把 `AGENT2API_API_KEY` 脱敏掉了，每次发消息都是 `MISSING_CREDENTIAL`
  的 `turn/end error`。读数覆盖的是「发出一条消息、开一回合」这一层；模型回答本身 `NOT_RUN`。另外，
  **「打字 `/grok off` 之后开关显示关」这半句本轮没能复现**——按读数，打字不会让已挂载的开关变关。

## 2026-11-25 — M3.4 死代码收尾完成（`fix/m3-dead-code`，未发版）：下一步是剩下三个常量与一个归档函数的去留，以及两个 README 里那个没有出处的数字

- **From:** 记忆收口（`agent-152/memory-writer`）· **To:** 操作者 / 下一个接手者
- **⚠️ live 档案那一行还在（这一轮没碰它）**：`~/.dsh/profiles/web/cordis.patch.yml` 第 **563** 行仍是 `mode: triage`。`mode` 与
  `legacyGate` 从 0.13.35 起是**移除键**，带着它们升级会让 `grok-workflow` 那一行**拒绝激活**，症状就是「升级完了，工作流不见了」。
  **升级任何档案的第一步，仍是操作者亲手删掉那一行**，然后才是装新包。本轮对 `~/.dsh` **一行未写、未重载、未重启**；
  该档案现装的版本**上一轮读回是 `0.13.32`**（依赖写的是浮动的 `github:free6589/dsh-grok-workflow`，没有标签）；本轮没有重读，
  所以这一条是转述，不是本轮的读数。
- **这一支是什么**：分支 `fix/m3-dead-code`（worktree `.tmp/wt-m3-dead-code`），基线 `main` 尖端 **`dde5b09`**，两条提交、尖端
  **`56f2feb`**：**`d484229`**（`refactor(m3.4): delete the dead exports the 0.13.35 sweep left behind`，`src/` 13 文件 / +17 −691，
  加 `lib/` 重建 42 文件 / +48 −799）、**`56f2feb`**（`test(m3.4): rewrite the twelve specs that reached the deleted exports`，
  12 文件 / +71 −321）。**未发版、未 push、未合 `main`、没有 PR**，`package.json` 仍是 `0.13.35`。
- **已经证实的**：门禁 `TMPDIR=$PWD/.tmp npm run ci` 在 `56f2feb` 上 **EXIT=0**——`98 files` / **`1832 tests`**（0.13.35 是 1851，
  **差额正好是删掉的 19 条检查项**）、`Found 15 warnings and 0 errors.`（与 0.13.35 那 15 条完全相同，没新增）、
  `lib/ at 56f2feb is the build of src/ at 56f2feb (281 files, byte-identical)`、`client bundle: 321631 bytes`（基线 321645，差额是
  被删掉的一行注释文字）。删掉的符号**删之前 `src/` 里调用点为零**（33 个符号逐符号 grep，全部 0 命中）。12 个改写过的 spec
  现在合计 **319 例全过**；同一批文件在 `dde5b09` 的树上跑是 **338 例**，差 19。没有任何 spec 文件被整份删掉，没有一条被 skip。
  逐行读数在 `STATE.md` 顶部与 `VALIDATION.md` 同日条；判据与备选在 `DECISIONS.md` 的 **`D-148`**。
- **下一步（按顺序）**：
  1. **`REPORT_BEGIN` / `REPORT_END` / `LEDGER_GUARD` 与 `archiveRoundNow` 现在是树上看得到的最后一批零引用导出——先决定它们是
     API 还是删掉。** 判断点不是「有没有人调」，而是「有没有人要读」：三个常量是给渲染那一侧读的一段协议文本，而
     `archiveRoundNow` 是「没有事件流的调用方」那一个入口——插件是发出去的包，外部能不能 import 是产品问题，不是本仓库的
     grep 能回答的。**顺带两处本轮清单没写到、复核时发现的**：`FIXED_TRIAGE_CLASSIFIER` 在 `src/` 与 `test/` 里一个读者都没有
     （全仓只剩它自己那行定义）；`FIXED_TIMEOUT_MS` 与 `FIXED_ANSWER_STRATEGY` 只剩测试在读。按 `D-148` d 的口径本轮只报不删。
  2. **两个 README 里有一个数字现在没有出处（本轮发现的文档与代码不一致）**：`maxQueuedMessages` 早在更早那轮就进了
     `REMOVED_CONFIG_KEYS`（它是「已删的配置键」），而两个 README 的「其余一律固化在插件内部」那句里还列着
     **`maxQueuedMessages=4`**。以前那个 `4` 有常量兜着，本轮常量跟着删了，于是**这个数字在全仓再没有代码出处**——顺手一查，
     代码里唯一还写着它的地方是硬上限表里那个 **`8`**，而那个成员**也没有任何读者**。这是需要操作者拍板的一件小事：要么在代码里
     把真实数值写出来（并有守卫钉住），要么把 README 那句话里的数字去掉。**本轮不擅自改 README**（不在写权限内，也不该在
     死代码清理里顺手改用户文档）。
  3. **`ask-user` 的 timed 模式（`F2`）仍是开着的产品问题**：上一轮记忆里就写着它是开着的，这轮照样没有结论，留给下一轮拍板。
- **三件会踩的事**：
  1. **`lib/` 是提交产物**：本轮删的都是「同一个文件里的导出」，没有删模块，所以 `lib/` **文件集一个没变**（71 个 `.js` / 281 文件，
     `git diff --name-status` 42 条全是 `M`，没有 `A`/`D`）——**这次没有孤儿产物可扫**。以后真删模块时，仍旧要重建并扫孤儿
     （注意 `lib/captain-memory.*` 是活模块的产物，拿 `captain*` 数孤儿会数错）。
  2. **`src/answer.ts` 现在只有 58 行，其中三个导出没有读者**：四个导出里只有 `RELAY_SOURCE_KIND` 被 `carryover.ts` 与 `run.ts`
     用着。谁要是给那三个常量接上调用方，就得同时想清楚**它们背后的契约已经没有任何测试钉着了**（本轮删掉的那批覆盖里，
     relay 前言契约、折叠账本信封都在其中）——接上之前先把断言写出来，别让「现在有调用方了」冒充「现在被验证了」。
  3. **六份记忆文档不再被任何守卫读取**：`docs-version` / `docs-config-keys` / `docs-architecture-version` / `i18n-parity` /
     `update-entry` / `update-surface` 这六件读的是两个 README、`docs/LOCAL-TESTING.md`、`docs/ARCHITECTURE.md`、
     `package.json`、`CHANGELOG.md` 与 `src/client/index.js`——**没有一件读 `docs/knowledge/*`**（本轮逐件核过读文件清单）。
     所以改记忆本身不会再让测试变红；但**发版前那六件该跑还是要跑**，尤其改了 `CHANGELOG.md` 的那一轮（`docs-version` 读它）。
     M3.3 自己那条记忆里写「文档守卫 spec 仍然读这几份文件」，与这次实测不符——**旧条目照原文留着**（记忆是当时为真的记录），
     以本条为准。
- **一条要如实说的话**：本轮**没有真机 soak**（不改行为、不发版，`AGENTS.md` §3 的 soak 门槛由「改行为」触发，这轮不满足）；
  没有升级 live 档案、没有重启实例、没有碰 3080 端口那个正在跑的 Web 界面。真实范围就是「删掉零调用点的导出 + 把量它们的
  测试改成量存活的同形路径」，**用户能感觉到的变化是零**。

## 2026-11-25 — 0.13.35 已发布（旧前台删除 + 接单台默认开 + 设置页 Workflow 项）：下一步是 live 档案删一行再升级、以及死代码收尾

- **From:** 记忆收口（`agent-150/memory-writer`）· **To:** 操作者 / 下一个接手者
- **⚠️ 升级前必须先删那一行（最重要的一条，再说一遍）**：`mode` 与 `legacyGate` 在 0.13.35 里都是**移除键**——任何 `cordis.patch.yml`
  的 `grok-workflow` 条目里还带着它们，插件就会**拒绝激活**，表现就是「升级完了，工作流不见了」。**升级任何档案的第一步，必须是
  操作者亲手删掉 `grok-workflow` 那一行的 `mode:` / `legacyGate:`**，然后才是装新包。本机 live 档案
  `~/.dsh/profiles/web/cordis.patch.yml` 第 **563** 行还写着 `mode: triage`（这一行里没有 `legacyGate`），正因如此，**live 档案这一轮
  故意没有升级**，仍停在该档案依赖解析出来的读回版本 **`0.13.32`**（依赖写的是浮动的 `github:free6589/dsh-grok-workflow`，没有标签）。
- **0.13.35 已经发完**：`release/0.13.35` 从 `main` 尖端 `fe07507` 开出，合 `feat/m3-delete-gate`（`54670f9`）成 merge `fb2ae22`，
  发版提交 `61d8f4a`（9 文件 / +59 −57），合 `main` 成 `ffbb6b0`（与门禁树逐字节相同）；**三次门禁全部 EXIT=0**（98 files / 1851 tests、
  `Found 15 warnings and 0 errors.`、`verify:lib` 281 文件 byte-identical，第三次由包工头独立跑）；标签 `v0.13.35`（剥皮 `ffbb6b0`）与
  推送、远端 CI `45530571233` 与 Release `45530586853` 两条 success、GitHub Release 资产 `dsh-grok-workflow-0.13.35.tgz`（948278 B）
  全部落定。发版前还抓到一条真实的谎并纠掉：六处用户可见文档写「`0.13.34` 起」，而 `v0.13.34` 的树里六个旧前台模块都还在，
  发版提交里改成 `0.13.35`。逐行读数见 `STATE.md` 顶部与 `VALIDATION.md` 同日条。
- **下一步（按顺序）**：
  1. **先删行、再升级**：操作者从 live 档案 `~/.dsh/profiles/web/cordis.patch.yml` 的 `grok-workflow` 条目里删掉那一行 `mode: triage`
     （第 563 行），把依赖从浮动改**钉到 `v0.13.35`**（或文件 pin 到发版产物），再升级；升级后验证版本读回 `0.13.35`，**读不回来就把
     那一行回滚到原值**并报失败。顺序反了，插件会拒绝激活。
  2. **死代码收尾（M3.3 分支故意没带走的）**：`relayText` / `reportEnterText`（`answer.ts`）、`runSingleCall` 三件套（`run.ts`）、
     `isModeEnabled`、`ConfigReader.lastGood()`、五个 `FIXED_*` 常量、`records.ts` 四个函数、`closeSteering`、`inspectPrompt`、
     `SWITCHABLE_CLASSES`。`D-143` 写清了为什么没把它并进那次删除（一次删除不拆成两次评审）；现在删除已经发版，可以单独开一支清。
  3. **`ask-user` 的 timed 模式（`F2`）仍是开着的产品问题**：这轮没有结论，留给下一轮拍板。
  4. **分支清理：已经发生（收口只读确认，不是收口删的）**——`feat/m3-delete-gate`（worktree `.tmp/wt-m3-delete-gate`）与
     `release/0.13.35` 在收口开工时**还在**（10:09 前后的 `git branch -a` / `git worktree list` 读数），收口过程中被删掉了：收口末尾
     同一对命令不再列出这两个分支，`git worktree list` 只剩主工作树、`.git/worktrees/` 已空。删除动作不是本收口轮做的（本轮只删了
     自己 `.tmp/` 下的草稿文件），`AGENTS.md` §5 的 24 小时期限已经落地；`54670f9` 与 `fb2ae22` 仍在历史里可达。
- **记忆侧这一轮动了什么**：`DECISIONS.md` 新增 **`D-147`**（撞号时**被证据钉住的那一侧留号**，`D-134` 的「先合先留号」在这里让位
  一次）；`D-146` 的标题上补了那句重编括注（合流时由 `D-141` 重编为 `D-146`）。`STATE.md` / `VALIDATION.md` 各加一条 0.13.35 的
  收口；`src/`、`test/`、`lib/`、`CHANGELOG.md`、两个 `README` 与 `docs/ARCHITECTURE.md` 本轮**一个字也没有写**。

## 2026-11-25 — M3.3 验收通过（`feat/m3-delete-gate`）：旧前台整条链已删、设置页进了宿主设置面板，下一步是发版说明与死代码收尾

- **From:** 记忆收口（`agent-146/memory-writer`）· **To:** 接发版或 M3.4 的人
- **⚠️ 升级前必须先删两行（最重要的一条，再说一遍）**：live 档案 `~/.dsh/profiles/web/cordis.patch.yml:563` 现在还写着 `mode: triage`。
  `mode` 与 `legacyGate` 在本支里都是**移除键**：带着它们升级，插件会因 `removed configuration key "mode"` **拒绝挂载**——
  表现就是「升级完了，工作流不见了」，这是唯一的原因。升级步骤的第一步必须是**操作者亲手删掉那两行**，然后才是装新包；
  设置落点的真机读数（`.rsi/evidence/m3-settings-section/`）又撞到一次同款拒绝，证明这条不是纸面推断。`CHANGELOG.md` 的
  `[Unreleased]` Removed 条已经写了同样的话。
- **这一支是什么**：分支 `feat/m3-delete-gate`（worktree `.tmp/wt-m3-delete-gate`，基线 `main` 尖端 `061693e`）上四条提交，尖端
  **`468e30f`**：**`09aa1bd`**（删旧前台链，**81 文件 / +248 −18277**，含 14 个前台 spec 的删除与 `lib/` 重建）、
  **`d2d5115`**（重钉 baseline 夹具、改写存活 spec、同步两个 README 与四份 docs，**28 文件 / +879 −1349**）、
  **`b2e70a5`**（记忆收口，只动 `docs/knowledge/` 与 `CHANGELOG.md`）、
  **`468e30f`**（设置落点，**11 文件 / +128 −29**：6 个代码/文档文件 +108 −29 含 `lib/client.js` 重建，另 5 个是证据）。**未发版、
  未 push、未合 `main`**，`package.json` 仍是 `0.13.34`。验收结论见 `STATE.md` 顶部与 `VALIDATION.md` 的 M3.3 条；证据在
  `docs/knowledge/evidence/m3-3-2026-11-25/`（soak 与门禁）与 `.rsi/evidence/m3-settings-section/`（设置落点，4 张 PNG + README）。
- **已经证实的**：默认载入对普通消息一个字都不改（八条 payload 逐字节相同，第 6 条超长目标从「2 条消息」变成 1 条）；
  真机上两条普通消息直答、`source.kind=grok-workflow` 中继 0 条、`tool-workflow/*` 0 条，连「今天天气怎么样？」这种旧前台必接的
  句子也直答（反问城市）；六个块工具在默认载入里就注册了（96 个工具 / 9 个 grok 工具）；headless 一次真运行 `EXIT=0`（17×23=391）；
  中途 kill 不改写 checkpoint（`running` / 10 任务 / 0 verified / attempts `[1]`，kill 前后一字未变）；卸载后 bundle 行 21→20、
  工具 87 / grok 0、无新账本与心跳行、普通消息仍作答。**设置页同时成为宿主设置面板左列的「Workflow」一项**（真机读数：左列
  `… / 会话修复 / Workflow / 打开配置文件`，点进去是同一张整页表单，Plugins 页卡片仍在）；单元层 `npm run ci` 在
  `468e30f` 上 **98 文件 / 1851 例**全过（比删前台那次多 1 例，`client.spec` 新增的 `settings.section` 断言），
  `lib/ at 468e30f is the build of src/ at 468e30f (281 files, byte-identical)`（收口轮自己重跑 `verify:lib`，同一行原文）。
- **设置落点（用户拍板，`468e30f`）**：同一张 `GrokWorkflowPage` **同时**注册到宿主的 `settings.section` 槽位（id `grok-workflow`、
  `order: 60`、`label` 是 thunk 读 `section.label`——中英两表都只有单词 **`Workflow`**，无描述、无图标）与原来的 `plugins.item` 卡片；
  一个页面两个入口，`inject` 是同一份，卸载时先撤 section 再撤卡片。取舍与被否掉的替代见 `D-145`；宿主槽位契约见 `RESEARCH.md`
  的 2026-11-25 第二条。
- **下一步**：
  1. **发版说明必须写「先删旧键，再升级」**（就是上面那条 ⚠️）：任何还带着 `mode`/`legacyGate` 的 `cordis.patch.yml` 会让插件
     **拒绝激活**，真机上打的是 `removed configuration key "mode": … delete it from your patch`；这一行是被跳过，不是半装
     （日志写的是 `1 entry did not activate`，不是启动失败）。「那一行没激活时档案其余功能是否完全正常」本轮没有单独记录（`NOT_RUN`）。
     升级步骤里得把删键写成第一步，`CHANGELOG.md` 的 `[Unreleased]` 已经写了。
  2. **死代码可以单开一支清**：`relayText`/`reportEnterText`（`answer.ts`）、`runSingleCall` 三件套（`run.ts`，约 300 行）、
     `isModeEnabled`、`ConfigReader.lastGood()`、五个 `FIXED_*` 常量、`records.ts` 四个函数、`steering.ts` 的 `closeSteering`、
     `intake.ts` 的 `inspectPrompt`、`SWITCHABLE_CLASSES`。清单在 `STATE.md` 顶部那条；本轮按设计稿**不顺手删**（`D-143`，
     一次删除不拆成两次评审）。
  3. **分支决定日期已经到期**：上一版给的「M3.3 结束」就是现在。到那天要么合进 `main`、要么 rebase 后继续、要么删掉（`AGENTS.md` §5）。
- **三件会踩的事**：
  1. **`lib/` 是提交产物**：删了 `src/` 的模块必须重建 `lib/`，否则 `verify:lib` 会带着孤儿产物变红。本轮重建后 38 个顶层 js /
     281 文件，`gate|triage|captain|channel|history` 孤儿 0。**注意 `lib/captain-memory.*` 不是孤儿**——它是 `src/captain-memory.ts`
     的产物，活模块；用 `find lib -name 'captain*'` 数孤儿会数错。
  2. **`docs/ARCHITECTURE.md` 的 `Status (since …)` 不能领先 `package.json`**：本轮新增的 `Status (since **0.13.34**)` 正好等于当前
     版本；发版跳版本时这些行要跟着改，否则 `test/docs-architecture-version.spec.ts` 变红。
  3. **D-140 那条「记忆内容是 triage 的输入」本轮之后不再适用**：读 `docs/knowledge/*.md` 的代码随 `src/triage.ts` 一起删了
     （`GROK_WORKFLOW_KNOWLEDGE_DIRS` 零命中，`src/` 里剩下的 `docs/knowledge` 字样全在注释和自迭代模板的文字里）。改记忆不再
     可能翻掉行为用例；但**文档守卫 spec 仍然读这几份文件**，改完照样要跑那四个。
- **一条要如实说的话**：派单里的数字有两处与实测不符，已在 `VALIDATION.md` 逐行记下——两条提交的文件数与行数被对调过
  （派单 67 + 42 文件、−10664 + −8962；实测 `09aa1bd` 81 文件 / +248 −18277、`d2d5115` 28 文件 / +879 −1349，合计
  109 文件 / +1127 −19626 一致），14 个 spec 的删除行数派单与 `d2d5115` 的提交说明都写 **7 431**、`git show --numstat` 实测
  **7 613**（差 182）。记忆以 numstat 为准；提交说明不改（不重写历史）。

## 2026-11-25 — 改名收口：那个角色现在叫「调度」（`fix/rename-foreman`，已合 `main`，未发版）

- **From:** 改名子代理（`agent-149`）· **To:** 下一个接手者 / 操作员
- **这一支是什么**：分支 `fix/rename-foreman`（worktree `.tmp/wt-rename-foreman`），基线 `main` 尖端 `061693e`，只改文字。
  版本仍 `0.13.34`，**没有发版、没有打 tag**。决定与备选记在 `DECISIONS.md` 的 `D-146`，门禁读数在 `STATE.md` 顶部。
- **改了什么（用户会看到的字）**：块预览的执行标签从 `foreman 包工头` 变成 `foreman 调度`（与 `workflow 工作流` 同形）；
  `grok_steer_block` / `grok_stop_block` 的两条拒绝消息、四条工具说明里的措辞；`docs/knowledge/` 五份记忆文档、
  `docs/ARCHITECTURE.md`、`AGENTS.md` §10 的层名（Foreman layer → Dispatcher layer）；`CHANGELOG.md` 的 `[Unreleased]` 中英双语一条。
- **三件故意没动的**：① 账本与预览里的 `execution: "foreman"` 值——它是协议的一部分，改了旧 `blocks.jsonl` 行会被判非法；
  ② `src/dispatcher/` 模块名（任务板那一层的 L1 大管家另有其名，英文散文里用 dispatcher 指角色、`L1 dispatcher` 指它）；
  ③ 历史证据原文（`docs/knowledge/evidence/**`、`.rsi/evidence/**`、`.tmp/ci-foreman.log` 这类路径）——证据是逐字记录。
- **给下一个人**：若要让账本值也换掉，那是一次迁移（读时接受 `foreman` 与 `dispatcher` 两个值、写时只写新值），不是一次改名；
  在那之前，预览那一行会一直显示 `foreman 调度`，值与中文名并列是有意为之。

## 2026-11-25 — M3.2 验收通过（`feat/m3-switch`）：下一步把 `blockIntake` 默认翻 `true`（M3.3）

- **From:** 记忆收口（`agent-145/memory-writer`）· **To:** 接 M3.3 的人
- **这一支是什么**：分支 `feat/m3-switch`（worktree `.tmp/wt-m3-switch`，基线 `main` 尖端 `7b25890`）上八条提交，
  尖端 **`7f172ae`**：**`9fdcb6e`**（准入接线 + 权威 intake spec）、**`94727b9`**（默认翻转、闸门剥掉心跳路由、窄监听成为唯一主人）、
  **`ad28f17`**（14 个前台 spec 显式 opt in）、**`2137afc`**（`lib/` 重建）、**`7bcbd00`**（soak 证据）、**`295cfd2`**（记忆收口）、
  **`082add6`**（开问题压过查材料的修复）、**`7f172ae`**（`lib/` 重建），**69 文件 / +2536 −1044**。
  **未发版、未 push、未合 `main`**，`package.json` 仍是 `0.13.34`。验收结论见 `STATE.md` 顶部与
  `VALIDATION.md` 的 2026-11-25 条；证据在 `docs/knowledge/evidence/m3-2-2026-11-25/`（soak 打的是 `2137afc`，早于那次修复）。
- **已经证实的**：默认载入不注册旧前台，普通消息直达模型（真机上 `source.kind=grok-workflow` 中继 0 条、用户原话逐字在日志里）；
  显式要求跑工作流时恰好一次运行（`run-start` 1 / `run-end` 1、`stopReason: completed`、2 个任务 verified）；
  六个块工具对没开 grok 模式的会话以 `mode-off` 拒绝（真机工具结果原文 `isError=true`）；卸载后 bundle 行 21 → 20、
  工具清单 8 → 0、无新账本行、普通消息仍作答。单元层：`npm run ci` **112 文件 / 2149 例**全过，
  `lib/ at 7f172ae is the build of src/ at 7f172ae (301 files, byte-identical)`。
- **下一步（M3.3）：把 `blockIntake` 默认翻 `true`**——就一处默认值，**不要在这一支顺手翻**。翻之前先补一条用例：
  `legacyGate: false` + `blockIntake: false` 这个组合在真机上**仍然没人跑过**（`NOT_RUN`）。M3.2 已经把「窄监听无条件安装」
  这条洞堵上了（源码里它现在在 `blockIntake` 分支之外），但「堵上了」是读源码 + 单测的结论，不是真机读数；翻默认值会让
  「两个开关都关」从默认形状变成非默认形状，那时候再补就晚了。
- **三件会踩的事**：
  1. **接单台的观测器只在「该会话有 open block」时才写 `heartbeats.jsonl`**，所以空文件（甚至整个 `taskboards/` 不存在）
     是设计，不是失败。想在真机上看到行，先让模型真开一块、再让一拍心跳真的送到。
  2. **默认形状现在既没有前台也没有接单台**：一次默认载入里 `agent/pre-step` 只有一个监听（窄心跳监听），
     插件默认对外的面就是工作流工具加刹车。要旧前台得显式写 `legacyGate: true`，要块工具得显式写 `blockIntake: true`；
     两个都是载入期开关，改完要重启。
  3. **分支决定日期顺延**：上一版给的 `2026-12-09` 延长到 **M3.3 结束**。到那天要么合进 `main`、要么 rebase 后继续、
     要么删掉（`AGENTS.md` §5）。
  4. **改一份顶层知识文档可能翻掉一条 triage 用例。** 前台对**每条**消息都会读 `docs/knowledge/*.md` 每份的前 2 400 字符，
     两个锚点就够它「从盘上作答」。M3.2 的记忆提交就这么把 `B04`/`B08` 弄红过（`082add6` 修好，并用一条不依赖本仓库笔记的
     受控用例把规则钉住）。「问题还开着」那条路现在**免疫**；**没有问题开着**的「查材料 vs 文档」仍然对内容敏感，这是设计，
     不是缺陷。所以：**改完记忆要跑全量套件**；红了先改措辞，别动测试、别调 `minTokens`（`D-140`）。
- **一条要如实说的话**：M3.2 派单引用的设计文档 §3.1 用例清单**不在本仓库里**。所以本轮那份「权威 intake spec」的五个分组，
  是它的**意图被写下来的版本**，写在 spec 头部注释里，不是从一份现存文档抄来的。下一个改这块的人把那五个分组当事实来源，
  别再去找一份不存在的 §3.1；三个由此拍下的判断记在 `DECISIONS.md` 的 `D-139`。

## 2026-11-25 — M3.1 验收通过（`feat/m3-narrow-listen`）：下一步把 review/stop 所有权正式移过来（M3.2）

- **From:** 独立验收（`agent-144/m3-verify`）· **To:** 接 M3.2 的人
- **这一支是什么**：分支 `feat/m3-narrow-listen`（worktree `.tmp/wt-m3-narrow-listen`，基线 `main` 尖端 `35326c7`）上只有一条实现提交
  **`d546666`**，**45 文件 / +1807 −163**（`src test docs` 两个 README 是 16 文件 / +1030 −77，其余是 `lib/` 重建）。**未发版、未 push、未合 `main`**，
  `package.json` 仍是 `0.13.34`。验收结论见 `STATE.md` 顶部与 `VALIDATION.md` 的 2026-11-25 条；证据在
  `docs/knowledge/evidence/m3-1-2026-11-25/`。
- **已经证实的**：`legacyGate` 默认 on 时旧前台照旧接单、窄监听只旁观；`legacyGate: false` 时旧闸门整段不注册，窄监听接管心跳裁决。
  真机上两种形状都**正常激活**（24 个设置命名空间、`autoGenerate: true`、boot 无 `pending`／`did not activate`），差异可观测：
  形状 A 的普通消息被旧前台接单（会话日志 1 条 `source.kind = "grok-workflow"` 中继）、形状 B 中继 0 条且消息直达模型真答；
  形状 B 的心跳由窄监听裁决并写下 `heartbeats-listen.jsonl` 一行 `{"outcome":"stopped","code":"loop/stop-file"}`，而
  `heartbeats.jsonl` 不存在（拥有裁决权的形状里接单台观测器不注册，没有双写）。
- **下一步（M3.2）**：
  1. **把 review/stop 的所有权正式移到窄监听**：删掉 `src/gate.ts` 的心跳分支（`classifyHeartbeat` 与 `isHeartbeatMessage` 的
     门禁侧调用），让 `installHeartbeatListen({ ownsRouting: true })` 成为唯一裁决者；`reviewHeartbeat` 已经是两边共用的一份定义，
     搬动时不要再复制第二份（D-138 的第 1 条）。
  2. **翻 `canAcceptBlock` 的 `BLOCK_ADMISSION_ENFORCED`**（`src/user-source.ts`）——六个块工具入口的 `admit()` 已经全部接好，
     只差这一个常量；规则本身由 `canAcceptBlockWhenEnforced` 与两条用例钉着，翻之前先读那两条。
  3. **`blockIntake` 默认翻 `true` 是 M3.3**，不是 M3.2；别顺手一起翻，否则「off 就是 pre-feature 那棵树」这条可测性会一起消失。
- **三件会踩的事**：
  1. **形状 A 的观测文件是空的，这是设计不是缺陷。** 两个观测器都要求「该会话有 open block」才写（`observeOnly` 里
     `openBlockIds(...).length > 0`、`installHeartbeatBrakes` 里 `if (open.length === 0) return`）。想在真机上看到 `observed` 行，
     必须先让模型真的开一块（`grok_open_block` + 用户点头），再让心跳到。
  2. **`legacyGate: false` + `blockIntake: false` 这个组合没人测过**（`HYPOTHESIS`）：按 `src/index.ts` 的读法，那时链上一个监听都不注册
     ——窄监听整段在 `if (config.blockIntake === true)` 里。M3.3 翻默认值之前先把这个组合钉一条用例，否则「关掉接单台」会连心跳刹车一起关掉。
  3. **`configuration in effect: … legacyGate=on` 这行在真机日志里看不到**：它是 `logger.info`，DSH 0.2.2-rc.3 不导出 info 到 stdout
     （同一份 boot 日志里 `settings surface:` 也不出现）。别把它当成「没生效」的证据；要看行为（旧前台是否接单）。
- **分支决定日期：`2026-12-09`**（两周内）。到那天这条分支要么合进 `main`、要么 rebase 后继续、要么删掉；M3.2 在同一支上继续则把日期顺延到 M3.2 结束。
  理由：`feat/*` 长活分支必须带一个决定日期（`AGENTS.md` §5）。

## 2026-11-25 — 接单台子收口：七处文字改完、`lib/` 重建、模型监工在真机上第一次真判（`fix/supervisor-soak-evidence`）

- **From:** 记忆收口（`agent-141/docs-memory`）· **To:** 下一个接手接单台子的人
- **这一支是什么**：分支 `fix/supervisor-soak-evidence`（worktree `.agents/worktrees/fix-supervisor-soak-evidence`，基线 `main` 尖端
  `6501012`）上只有一条工作提交 **`49377e8`**，**12 文件 / +876 −18**，两半：① 七处注释/字段描述串把「五个工具」改成「六个」
  （`src/config.ts:223`、`:226`、`:671`、`:679`、`src/index.ts:416`、`src/types.ts:237`、`:300`，每处一个词），`lib/` 由 `npm run build` 重建；
  ② 证据包 `.rsi/evidence/supervisor-soak-2026-11-25/`（`soak.txt` 608 行 + `ledger-extract.txt` 33 行 + `text-gate.txt` 217 行）。
  提交后 `TMPDIR=$PWD/.tmp npm run ci` **EXIT=0**：vitest **`111 files / 2128 tests PASS`**、oxlint **`Found 36 warnings and 0 errors.`**、
  `verify:lib` → **`lib/ at 49377e8 is the build of src/ at 49377e8 (293 files, byte-identical)`**（`verify:lib` 只比 HEAD 的 `src` 与 HEAD 的 `lib`，
  所以**只有提交后那一次**覆盖重建的 `lib/`）。**未发版、未 push、未合 `main`**，`package.json` 仍是 `0.13.34`。
- **已经证实的**：独立模型监工在真机上真跑通了——`judged:true` 的 `pass` 两条（`f9d91ee7` attempt 2、`6da4687d` attempt 1，`route` 都是
  `bifrost-responses/opencode-go/muse-spark-1.3-contributor`）；模型自己产的 `veto` 一条（`eda27615` attempt 2，`criteria [met:true, met:false]`，
  理由是监工自己的话）；`roles.supervisor` 删掉后判决行写 `route:"inherit"` + `judged:true` + `pass`（`7466943e`）。
  **还没证的**：下面「剩余缺口」四条 `NOT_RUN`；F3 那条「散文答对算没答」是 `CONFIRMED` 的现象，但「它是采样抖动还是稳定行为」仍是
  `HYPOTHESIS`（6 次监工调用里撞了 2 次，n=6）。
- **三件下一个 agent 一定会踩的事**：
  1. **F2：闸门与块流程按现状互斥。** 闸门开着时，四行交接被闸门自己接走（它把消息从 inbox 拿走、派自己的 worker 答、再叫模型原样转述、
     不许调工具），所以交接永远不成一个判决回合、`grok_close_block` 不会被调；跑块流程必须先 `/grok off`。用户消息**没有**被删除——
     它还在会话里、模型读得到，上一版报告把这一点写反过。
  2. **F3：用散文答对的监工被记成「没交答案」。** 宿主只在监工调了 `structured_output` 时才拿到值，`parseSupervisorAnswer` 的
     JSON-字符串兜底（`tryJson`，带围栏或不带）因此走不到，块被写成 `监工调用失败` 的 `veto`。要动这个方向，先读 `src/supervisor/verdict.ts`
     的调用面与引擎的 schema 工具契约，别只改解析函数。
  3. **`judged:true` 的意思是「不是确定性路由」，不是「模型判得好」。** 它是 `rowToWrite.route !== 'deterministic'`
     （`src/supervisor/index.ts:132`），监工调用失败也是 `judged:true`（`outcome:"veto"` + 理由 `监工调用失败`）。
     **`pass` + `judged:true` 这一对**才只能来自被解析的模型答案——验收要钉这一对，不要只钉 `judged:true`。
- **决策号：`D-136`**（`DECISIONS.md` 末尾）。口径：监工角色链保持 `src` 现状——默认 `[]`（`src/config.ts:685`），空链在
  `src/supervisor/verdict.ts:222`（`input.routes.length === 0 ? [{}] : [...input.routes]`）塌成一次无路由调用，引擎读成「继承会话路由」。
  所以某个 profile 钉死的监工路由没有凭据时，修法是**把 profile 指向一条能用的路由（或干脆留空链）**，不是往 `src` 里加兜底。
- **剩余缺口（`NOT_RUN`，与 soak.txt §6 一致）**：① 真浏览器里的插件页卡片/设置页（两轮走的是 GUI 的 HTTP API；run B 虽然开了真 Chromium，
  但直接去了 composer）；② 一个**在自己批准范围里写文件**的块（四个块全是「不写文件」，产物与范围检查只走到「没东西可查」那条分支）；
  ③ `ask_user_question` 卡片收确认（M2 的发现仍在，本轮故意没重复）；④ 多块切分（`blocks[]` 一直只有一个元素）与 `dependsOn`。
- **红线**：全程未碰 `~/.dsh`（`touch` 实测 `Read-only file system`，三个目录 mtime 前后逐秒相同），未重载未重启线上实例，
  线上 `3080` 只做 `curl` 读状态（前后都是 `401`）；soak 的 web token 在证据里只以 `<redacted>` 出现；本轮两条提交：工作提交 `49377e8`
  （源码七行 + `lib/` 重建 + 三份证据）与紧随其后的记忆收口提交（只动 `docs/knowledge/` 的四个文件）；**没有 push、没有打 tag、没有合 `main`**。

## 2026-11-25 — M2「接单台子」：代码全绿、真机 soak PASS，交接给下一个改这段代码的人

- **From:** 记忆收口（`agent-138/docs-memory`）· **To:** 下一个接手 `feat/block-intake` 的人
- **这一支的现状**：分支 `feat/block-intake`（worktree `.agents/worktrees/feat-block-intake`，基线 `main` 尖端 `9b55d2d`）
  上新增 `src/block/` 8 文件 + `src/supervisor/` 3 文件 + 6 个测试 spec（174 例：五个 162 例 + `block-flag-baseline` 12 例，
  外加夹具 `test/fixtures/block-flag-baseline.json`），改了 `src/config.ts`、`src/types.ts`、`src/index.ts`、`src/settings.ts`
  与两个 README / `docs/LOCAL-TESTING.md`，`lib/**` 已重建。门禁 `TMPDIR=$PWD/.tmp npm run ci` **两次 exit 0**
  （最后一次 **`110 files / 2116 tests PASS`**、lint **`36 warnings / 0 errors`**）——那次读数的树**还没有**第六个 spec，
  它落地之后合起来的树没有重跑全量门禁（`NOT_RUN`，由调度补）。**未发版、未打 tag、未 push、未合 `main`**，
  `package.json` 仍是 `0.13.33`。
- **先看这三个地方，别从工具层读起**：
  1. `src/block/preview.ts`（`startBlock`，`:464-559`）——**幂等先于四道校验**：先按 `(session, splitHash)` 查账本，
     命中就 `reused: true` 返回、一版都不追加；没命中才依次判「预览存在 → 未过期 → `split_hash` 逐字节相同 →
     预览之后有一条用户消息逐字包含 `approval.quote` → `approved === true`」。顺序是用户的故事（你没看过 > 看过但变了 >
     改了但没点头），改动这个顺序就是改用户读到的报错。
  2. `src/supervisor/index.ts:102-179`——**先确定性、后模型**：六条确定性检查（计划覆盖 / 证据非空 / 产物可解析 /
     范围 ⊆ 批准 / 依赖悬空 / 交接四行）在 `runDeterministicChecks()` 里，失败直接写 `route: "deterministic"` 的 `veto`，
     **零模型调用**；只有全过（或被 `override` 放行的范围否决）才走到 `callBlockSupervisor()`。想让某个检查变成模型判断，
     先读 `src/supervisor/checks.ts` 头注释里那张「为什么不能交给模型」的表。
  3. `src/block/brakes.ts`——唯一的 `agent/pre-step` 监听。三条硬约束：off 时**一个监听都不装**；决策先算
     （`await next()`）再记观测，返回的决策与基线逐字节相同；只写 `heartbeats.jsonl`，不碰 `verdicts.jsonl`、
     不占 `blocks.jsonl` 的版本槽。改动这里等于改动全插件最外层的决策链。
- **soak 的四个缺口，先补哪一个：缺口二（模型监工真机未验）**。理由：确定性闸门在真机上真判了两次 `veto`，
  但**独立模型裁决一次都没在真机跑通过**——路由 `agent2api/deepseek-v4.1-flash` 缺 `AGENT2API_API_KEY`，隔离 home 里没有，
  所以那次 `pass` 带 `judged:false` + `not_judged`，只有单测里的 fake engine 覆盖过。补法是给隔离 home 配一把可用的
  监工 key（或在 soak 里显式换一条有凭据的路由），跑出一次 `judged:true` 的 `pass` 与一次模型 `veto`。
  其余三条按序排在它后面：缺口一（软链插件根会挂，已写进 `docs/LOCAL-TESTING.md`，属于安装姿势、不是产品缺陷）、
  缺口三（首个模型路由 403 实名认证，环境问题）、缺口四（`ask_user_question` 的答案不算用户消息、交接必须正好四行，
  两条都记成 M3 候选行为改进，不是本轮的 bug）。
- **决策日：`2026-12-02`**。按 `AGENTS.md` §5，长期实验分支（`feat/*`）到期前必须做出选择——合 `main`、rebase 重开、
  或删掉。到那天之前需要决定的其实是「模型监工真机未验」这条能不能带着走：能，就在 `VALIDATION.md` 里把它写成
  已知边界并合；不能，就先补缺口二再合。**到期没决定就按删除处理，别把日期往后挪。**
- **口径都记在哪**：八条取舍在 `DECISIONS.md` 的 **D-135**（只追加账本、`verify` 不进 `splitHash`、第三个文件
  `heartbeats.jsonl`、`block_id` 是行 id、账本不加锁、`blockIntake` 是载入期开关、`override` 只覆盖范围否决、
  心跳先算决策再记观测）；命令与读数在 `VALIDATION.md` 顶部那一节；架构形状在 `docs/ARCHITECTURE.md` 的
  `## Block intake (接单台子)`。
- **红线**：全程未碰 `~/.dsh`、未重载未重启线上实例；soak 用的是克隆出来的隔离 home（`127.0.0.1:3197`），
  线上 `100.111.111.88:3080` 一次都没被访问；本轮没有 `git add` / `commit` / `push`。

## 2026-11-24 — 0.13.33 发布收口：三件功能出去，两条远端流水线一次绿

- **From:** 发版收口（`agent-137/memory-closeout`）· **To:** 下一个接手的人
- **结果**：`release/0.13.33` 三条分支按序并入后合 `main`，merge **`24d517e`**，发版提交 `26628c2`，注解标签 `v0.13.33`（标签对象 `fadbd6e`，
  打在 `24d517e` 上）；`main` 与标签都已推送（`1f70103..24d517e  main -> main`、`* [new tag] v0.13.33`，无 force）。远端 `Release`
  **45429377745** success，GitHub Release **`Grok Workflow for DSH v0.13.33`** 带资产 **`dsh-grok-workflow-0.13.33.tgz`（967628 B）**，
  `2026-11-24T15:49:11Z` 发布；远端 `CI` **45429371302** 的 `Node 22` 与 `Node 24` 都 success。**两条 run 都是第一次尝试就绿，没有 `--failed` 重跑。**
- **发了什么**（用户能感觉到的部分）：① 完整流程（`/grok on`）多了一张前台——寒暄与单个事实不再付整队钱，先给答案再在背后验，
  逃生口只认会话记录、先问必须先能后送；② 没跑完的一轮（`partial` / `failed`）在报告尾部带上「Technical audit trail」全量机器记录，
  跑完的一轮默认视图一个字节不动；③ 重复的调用带序号（`规划（第2次）`），终稿单独标「（定稿）」，replan 交卷改成调工具 + 同棒补交。
- **决策号重编**：三条分支各自都新增了一个 `## D-131`，按合入顺序重编为 D-131（`feat/full-escape`）/ D-132（`feat/audit-render-half`）/
  D-133（`fix/naming-resubmit`），全仓引用一并对齐，`.rsi/evidence/` 历史证据未改。处理口径本身写成 **D-134**。
- **门禁**：合流树 `e425295` 上 `TMPDIR=$PWD/.tmp npm run ci` **exit 0**（**105 files / 1954 tests PASS**、lint **`Found 36 warnings and 0 errors.`**、
  `verify:lib` **249 files byte-identical**）；发版树 `26628c2` 干净树再跑一次 **exit 0**（同 105 文件 / 1954 例，
  `lib/ at 26628c2 is the build of src/ at 26628c2 (249 files, byte-identical)`，loadavg 1.68）。1954 = 基线 1910 + 12 + 13 + 19，逐项相等。
- **抖动（照实说，没修）**：合流过程中两路门禁并发跑时红过两条——`test/objective-limit.spec.ts` 一条（满载下 30 s 超时，单跑 17/17 绿 ×3）、
  `test/full-behind-first-answer.spec.ts` 一条（`vi.waitFor` 默认 1 000 ms，负载下红，单跑 5/5 绿）。最终两次门禁（合流树、发版树）都
  **一次跑绿、零重跑**，远端两条 run 一条抖动都没撞上。**没有改断言、没抬 `testTimeout`、没跳用例。**
- **soak 复用的口径（照实说）**：**本版没有重跑合并后的整体 soak**（`NOT_RUN`）。三块各自的真机证据在
  `.rsi/evidence/full-escape-2026-11-24/` 与 `.rsi/evidence/audit-render-half-2026-11-24/`。能让它成立的论证是：合流没有改产品代码
  （`src/report.ts` 由 `ort` 自动合并、两条路径都在），发版提交只改版本常量、两个 README / `CHANGELOG` 与随构建走的 `lib/client.js`，
  而版本常量正是 `test/docs-version.spec.ts` 与 `test/docs-config-keys.spec.ts` 钉住的，两例都在两次全量门禁里过了。
  这是**理由**，不是又跑了一遍真机。
- **红线**：全程未碰 `~/.dsh`，未升级、未重载、未重启运行中的实例；未动 tag（没重打、没移动、没删除）、未 force push、未改写已推历史。
- **待办**：① 升级 live profile 到 `v0.13.33` 需要操作员执行 `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.33`
  （钉 tag）并把版本读回成 `0.13.33`；② `feat/audit-layer`（`7626233`，D-130 取半记录，未合）还在，需要先做一次真功能评估 + rebase
  再决定合/删；③ 三条 `backup/wip-2026-11-24-*`（`de7ba6a` live-steering、`292a4ae` team-dispatch-v1、`b91ff17` progress-task-number-first）
  写死删除日 **2026-11-27**，到期删掉，别再往后挪；④ 那两条负载敏感用例仍是既有抖动，红了先看是不是满载，别为此改断言或抬 `testTimeout`。

## 2026-11-24 — 合流 `release/0.13.33`：三条分支按序并入、决策号重编 D-131/D-132/D-133、全量门禁最终 exit 0

- **From:** 合流手（`agent-137/merge-train`）· **To:** 发版那一块 / 操作员
- **树与基线**：主检出 `/home/fish/projects_mine/dsh-grok-workflow`（没有新建 worktree），从 `main` 尖端 **`4da42c2`**
  （`docs(spec): adopt grok-workflow v1 spec as accepted baseline`，比 `origin/main` 领先 1 条）开出 `release/0.13.33`。
  三次 `git merge --no-ff` 按派单固定顺序执行，尖端 **`c5b504d`**：

| # | 分支 | merge 提交 | subject | 冲突 |
|---|---|---|---|---|
| 1 | `feat/full-escape` | **`cfe8873`** | `merge: the full-shape front desk — escape hatch, ask-before-send, and the first answer in the turn` | **零冲突** |
| 2 | `feat/audit-render-half` | **`f572eee`** | `merge: the audit trail as the report's optional tail for runs that did not finish` | 3 |
| 3 | `fix/naming-resubmit` | **`c5b504d`** | `merge: numbered call names, the shipped draft mark, and a replan that submits through the tool` | 7 |

- **为什么第一次零冲突**：`feat/full-escape` 自 `1f70103` 开出，而 `main` 在它之后只多了一条 `4da42c2`（只加一份 spec 文档），
  两边的文件面不相交，`ort` 直接合上。
- **`src/report.ts` 是唯一两边都改的产品文件**（分支 2 与分支 3）：`ort` 自动合并成功，**没有手改一行**。合并后实测两条路径都在——
  审计层：`import { renderAuditTrail }`（第 14 行）、`RenderReportOptions.auditTrail?: boolean`（1150）、
  `opts?.auditTrail === true ? `${view}\n\n${renderAuditTrail(report)}` : view`（1363）；终稿稿号：`shippedSummaryDraft()`
  （1170）、`Summary review: … · final: draft N`（1248–1249）。**一个功能都没丢**。
- **`lib/` 一行没手改**：解完 `src/` 冲突后 `npm run build` 从 `src/` 重建（client bundle 325771 B），`verify:lib` 报
  `lib/ at c5b504d is the build of src/ at c5b504d (249 files, byte-identical)`。`lib/report.d.ts.map` 与 `lib/report.js.map`
  两个冲突随便取一侧后由重建覆盖（`git checkout --ours` → `npm run build` → 提交重建结果）。
- **冲突清单与解法（10 个路径，全部只动文档与生成物）**：
  - `CHANGELOG.md`（第 2、3 次都冲突）：`[Unreleased]` 取并集，按语义归成 `### Added / 新增`（1 条 = 审计层）、
    `### Changed / 变更`（5 条 = 前台 4 条 + 编号 1 条）、`### Fixed / 修复`（1 条 = replan 交底）。中英双语原文照搬，一句没重写。
  - `docs/knowledge/DECISIONS.md`（第 2、3 次都冲突）：三条 D-131 全部保留成独立条目，按合入顺序排成 D-131 / D-132 / D-133。
  - `docs/knowledge/HANDOFF.md`（第 2、3 次都冲突）：新的在上（`fix/naming-resubmit` → `feat/audit-render-half` → `feat/full-escape`），
    各节原样，没压缩。
  - `docs/knowledge/STATE.md`、`docs/knowledge/VALIDATION.md`（第 3 次冲突）：同上，新的在上；分支 2 那两块本来就是文件尾追加，
    合流后仍在文件尾，**没有搬家**。
  - `lib/report.d.ts.map`、`lib/report.js.map`：取一侧 + 重建覆盖。
- **决策号撞号重编（三条分支各自都新增了一个 `## D-131`，`main` 现有最大是 D-130）**：`feat/full-escape` 保留 **D-131**；
  `feat/audit-render-half` 改 **D-132**（11 处引用逐条按语义改：`docs/ARCHITECTURE.md:233`、`HANDOFF` 3 处、`STATE` 1 处、
  `VALIDATION` 1 处、`src/index.ts`、`src/report.ts`、`test/human-output-contract.spec.ts` 2 处、`test/report-audit.spec.ts`；
  `lib/` 由重建带出）；`fix/naming-resubmit` 改 **D-133**（3 处：`HANDOFF` 2、`STATE` 1）。两条被重编的条目末尾各加一句括注
  「（合流时由 D-131 重编为 D-132／D-133）」，`.rsi/evidence/` 下的历史证据**一字未改**（那是当时的记录）。
  复核命令 `grep -rn "D-131\|D-132\|D-133" --include=*.md --include=*.ts --include=*.js .`：剩下的 7 处 `D-131` 全指分支 1 那一块
  （或那两句括注），`D-132` 13 处、`D-133` 5 处各自指向自己的块。
- **门禁（`CONFIRMED`，`TMPDIR=$PWD/.tmp npm run ci`，本轮四次）**：`c5b504d` **exit 0**（105 文件 / 1954 例，187.88 s）→
  `62643da` **exit 1**（`Tests 1 failed | 1953 passed (1954)`，173.46 s，一条负载敏感的新用例）→ `62643da` **exit 0**
  （182.98 s，loadavg 2.41）→ **`e425295` exit 0**（105 文件 / 1954 例，203.36 s，**这是最终那次**）。四次的 lint 都是
  **`Found 36 warnings and 0 errors.`**、`verify:lib` 都是 **249 files byte-identical**（sha 随 HEAD 变）。对数：101 文件 / 1910 例（基线）+ 2 文件 12 例（分支 1）+ 1 文件 13 例（分支 2）+
  1 文件 19 例（分支 3）= **105 / 1954**，与实测逐项相等。
- **中间那次红：判定为负载敏感抖动，不是合流回归（`CONFIRMED`）**：`test/full-behind-first-answer.spec.ts > enters the live
  first answer, says the report follows, and starts one real run`，逐字 `Error: the report was not delivered as its own message`，
  停在 `vi.waitFor`（vitest 默认 **1 000 ms**）。依据四条：① 单跑 **5/5 绿**；② 24 个 busy 循环下 **3/3 红**（loadavg 25.07），
  3 条用例全红在 `vi.waitFor`（`the report was not delivered as its own message` / `the team run did not start`），**没有一条是
  内容断言**；③ 合流没碰这条路径——`renderReport` 只被 PTC `render` 工具调用（`src/index.ts:254`），投递路径用的是 `src/delivery/`
  自己的渲染器；④ 该用例的报告 `status: 'completed'`，`auditTrail` 本来就关。**处理：只记录，不修**——按「既有抖动按原样记录、
  不放宽断言」，断言、`testTimeout`、`vitest.config.ts`、skip/only 一处未动，重跑即绿。它**不严格跟 loadavg 走**：最终那次绿在
  loadavg **16.01**、红的那次机器也不闲——是 1 s 墙钟竞态，重负载下更容易撞上，不是重负载才撞上。**留给发版那一块注意**：
  它的等待是 vitest 默认 1 s，与 `feat/full-escape` 自己修过的饱和队列用例（改成 15 s 具名界）同族，但本轮不替分支作者改。
  另一组在案的既有抖动（`test/gate.spec.ts > never retries a refused batch on its own`、`test/timeout.spec.ts` 两条无计时器探针）
  四次都绿。
- **缺口（照实写）**：① 门禁四次里**有一次红过一条**，判定为负载敏感抖动（依据见上一条），最终那次 exit 0；四次之间**没有任何产品代码变化**，所以它证明的是「同一棵产品树能跑绿」，不是「抖动已被排除」——**它还会再红**；
  ② **没跑真机 soak**——三条分支各自的 soak 证据都在 `.rsi/evidence/` 里，本轮是合流不是重测，合流后没有重跑（派单未要求）；
  ③ 远端 Node 22/24 矩阵 **`NOT_RUN`**（没 push）。
- **下一步（发版那一块）**：`package.json` 仍是 `0.13.32`；`[Unreleased]` 里现有 7 条（Added 1 / Changed 5 / Fixed 1）要原文搬进新的
  `## [0.13.33]` 段；打 tag 前先跑一次 `npm run ci`；三条已合分支（`feat/full-escape`、`feat/audit-render-half`、`fix/naming-resubmit`）
  与它们的 worktree 都还在，按 AGENTS §5「合并后 24 h 内删」收尾。

## 2026-11-24 — 重复调用带序号名、终稿标「（定稿）」、replan 交卷改「调工具 + 同棒补交」

- **From:** 执行手（`agent-136/naming-worker`）· **To:** 合流者 / 操作员
- **树与基线**：worktree `.agents/worktrees/fix-naming-resubmit`，分支 `fix/naming-resubmit`，基线 `main` 尖端 `1f70103`
  （版本仍 `0.13.32`）。**本轮未合流、未发版、未打 tag、未 push、未碰 `~/.dsh`**，主检出一行未动。
- **本轮提交（两条，`git log --oneline main..HEAD` 自证）**：
  1. **`a335388`** — 代码 + 测试 + 重建 `lib/` + `CHANGELOG.md` + 记忆三件（`STATE.md` / `HANDOFF.md` / `VALIDATION.md`）
     + `DECISIONS.md` D-133。这是唯一的产品改动提交，`npm run ci` 与 `verify:lib` 的结论都属于它。
  2. 其后一条**只改 docs/ 记忆的订正提交**（把记忆里被 amend 掉的中间 sha 换成 `a335388`、删掉 sha 占位写法）——
     没有动 `src/`、`test/`、`lib/`，因此不重跑全量 ci。两条都只在本分支，没 push、没合流、没 bump 版本、没打 tag。
- **调度复核三条（同一条提交内已改完）**：①replan 同棒补交**进**预算算式（边界项 `maxBoundaries × 2 × planner × waitFactor`，
  钉子 `test/planner-resubmit.spec.ts > pays two boundary calls for every replan, because a boundary can ask twice`）
  ②一稿两行只标 `order` 最大的落地行（`test/progress-tab.spec.ts > marks only the row that landed when one draft was asked twice`、
  同形用例在 `test/client.spec.ts`）③ci 真实数字已回填、D-133 的 `规划规划（第1次）` 笔误已改、
  「补交吃 +2 余量 / cap 收紧会 setup 失败」两条说法已删除（修完不成立）。
- **用户拍板的三件事，全部落地（`CONFIRMED`，真机形状用例）**：
  1. 汇总多稿 `汇总·第1稿` … `汇总·第N稿`（en `Summarize · draft N`）；同一稿的 resubmit 仍是同一号。
  2. 规划腿 `规划（第1次）`（开场）+ `规划（第2次）/（第3次）…`（每个波边界）；`memberLabel()` 未改，序号只属于「行」，
     提示词首行与 `agent()` 的 `label` 由同一个 `plannerCallLabel()` 产出（真机行名就是提示词首行）。
  3. replan 提示词去掉「Answer with the structured result only」，改成「调用结构化结果工具、只调一次、纯文本等于没交」+ 形状说明；
     `requestReplan` 收 `format-error`（非 setup）时同棒补交一次（`log()` 记账、不花 retry、不开新边界），补交也失败则照旧拒绝、计划字节不变。
- **同日追加（同轮第 4 条，也是用户拍的）**：过门那一稿标 `汇总·第N稿（定稿）`。只在 **layered 与 model 两个 `review.ok` 分支**写
  `log('gw-summary-final N')`；宿主 `src/run.ts` 读 `report.synthesis.review`（只认 `check=pass verify=pass`）→
  `recorder.summaryFinal(runId, draft)` 写新事件 `tool-workflow/summary-final` `{runId, draft}`；两份折叠（`src/progress-tab.ts` +
  `src/client/index.js`）各自认它、把那一行改写成「（定稿）」。现有四个事件形状一个没改；旧流/重复/乱序/指向不存在的稿号都幂等。
  报告侧在 `Summary review:` 行尾补 ` · final: draft N`，**机器串与 schema 未动**。
- **两处事实订正（照实写，别被下一轮当成漏做）**：
  1. `model` 策略分支以前不写 `synthesis.review`，宿主的 `check=pass verify=pass` 闸门在 model 跑上永远不成立 → 已在 model 的
     `review.ok` 分支补写同形机器串，并把 `test/routing.spec.ts` 那条 `toEqual({mode, summary})` 的旧断言改成带 `review` 的新形状。
  2. 报告侧只有**一份英文 ledger**（`renderReport()` 没有 lang 参数），「中英各一版」在真机上没有第二个入口可加：
     只补了英文那一行的 ` · final: draft N`，未新开中文渲染入口。若确实要中文版，需要另开一个中文渲染入口，请拍板。
- **门禁（本轮实测）**：见 `VALIDATION.md` 同日条目（`npm run ci` exit 0：typecheck 干净、oxlint 36 warnings / 0 errors、
  `verify:lib` 245 files byte-identical、vitest 102 files / **1929** tests PASS）。
- **留给下一棒的注意点**：
  1. **replan 补交是「真子代理」，已按每边界两问计入 `maxTotalAgentsFor()`**（边界项 = `maxBoundaries × 2 × planner ×
     guardian 因子`），钉子见 `test/planner-resubmit.spec.ts > pays two boundary calls for every replan`。
     下一轮若再给边界加调用，记得同步改这个 2。
  2. **`verify:lib` 在 worktree 里需要能解析完整 `node_modules`**：本轮把 worktree 的 `node_modules` 换成指向主检出
     `node_modules` 的符号链接（`node_modules` 本就在 `.gitignore` 里），否则 `scripts/verify-lib.mjs` 的 scratch 构建拿不到
     `typescript` / `@types/node` / `@deepseek-ai/*`。
  3. replay 时若看到 `test/gate.spec.ts > never retries a refused batch on its own` 偶发红：本轮全量跑第一次红过一次，
     单跑该文件与随后两次全量都绿（`vi.waitFor` 的时序抖动），与本轮改动无关，别把它按成本次回归。

## 2026-11-24 — 报告尾部审计层（`feat/audit-render-half`）：没跑完的一轮带全量机器记录，默认视图一个字节不动

- **From:** 执行手（`agent-132/impl-audit-render`）· **To:** 合流者 / 操作员
- **树与基线**：worktree `.agents/worktrees/feat-audit-render-half`，分支 `feat/audit-render-half`，基线 `main` 尖端
  **`1f70103`**（版本 `0.13.32`）。两个本地提交：**`4502748`**（`feat(report)`：`src/report-audit.ts` 新增、
  `src/report.ts` 的可选 `auditTrail`、`src/index.ts` 的接线、`test/report-audit.spec.ts` 新增 13 例、
  `test/human-output-contract.spec.ts` 的 T4 断言收窄、重建的 `lib/`、`CHANGELOG.md` 的 `[Unreleased]`）与**承载本节的
  docs 提交**（知识文档 + `.rsi/evidence/audit-render-half-2026-11-24/`）。**未 push、未打 tag、未合流、未发版**，
  `package.json` 仍是 `0.13.32`。
- **做了什么（`CONFIRMED`）**：`feat/audit-layer`（`7626233`）只取 `src/report-audit.ts` 与 `test/report-audit.spec.ts`
  两件东西，按 `0.13.32` 的 `types.ts` 改写（waves / replans / version / deadRoutes / `limits.childTimeoutMs` /
  `synthesis.review` / `supervisor` 链路 / attempt 的 `resubmitted`、`judgeRetried` 全部进记录），接到报告层的**尾部**：
  `RenderReportOptions.auditTrail` 默认关；`src/index.ts` 只在 `report.status !== 'completed'` 时带上。决定与三个被否决的
  替代方案见 **D-132**。
- **门禁**：`npm run ci` 在提交 `4502748` 上 **EXIT=0** — oxlint **36 warnings / 0 errors**、
  `verify:lib` **249 文件逐字节一致**、vitest **102 文件 / 1923 测试 PASS**。对 `feat/update-button` 那轮基线
  （101 / 1910、`lib` 245）是 **+1 文件 / +13 测试 / lib +4**。
- **真机隔离 soak（`CONFIRMED`）**：`~/.dsh/profiles/web` 的字节副本（只读源）+ 本构建的 **tarball 安装**（版本读回
  `0.13.32`，`lib/index.js` sha256 与 worktree 构建一致 `06c21cbb…d2590`）。一跑**不可满足**的任务：报告状态 **`failed`**，
  工具结果 **24 792 字**（答案半 2 691 字 + 审计段 22 101 字），含 `Technical audit trail` 与 `Audit trail complete.`；
  一跑能答的问题：状态 `completed`，**1 276 字，不带审计段**。同一 prompt 打**发布版** `0.13.32` 的对照跑也是 `failed`、
  **不带**审计段（2 628 字）——同一台机、同一模型，差别只在构建。证据
  `.rsi/evidence/audit-render-half-2026-11-24/`（`README.md` 有清单与边界）。
- **一条既有用例被收窄（唯一一条）**：`test/human-output-contract.spec.ts` 的 T4 断言原本说「工具视图不带任何机器词条」，
  现在断言的是「**答案半**不带机器词条，审计段是带标题、带收尾的独立段落」。语义没变，变的是「工具视图 == 答案」这个前提；
  理由与后果在 D-132。若要回到「失败轮次也不带」，只需去掉 `src/index.ts` 里那个 `auditTrail` 参数，模块仍可按需调用。
- **留给下一手的事**：
  1. **合流只在主代理做**（AGENTS §10）。`CHANGELOG.md` 那条只在 `## [Unreleased]`，没 bump 版本。
  2. **`feat/audit-layer` 的另一半仍等决定**：把默认视图翻成人类答案属于另一刀，本包没动它（D-130 → D-132）。
  3. **live profile 一行未动**：soak 用的是复制出来的隔离 home；本轮没升级、没重载、没重启，§11 自动升级仍按操作员红线跳过。
     soak 时 live `web` profile 里读到的插件版本是 **`0.13.32`（发布版）**，不是本分支构建。
  4. **本分支判定日期 2026-11-26**：合流即删（合完 24 h 内）；不合就删分支。`feat/*` 不许长期挂着。
- **边界**：web 外壳**没有**被这一跑覆盖（web app 不收 prompt，且不许起第二个长驻服务；跑的是同一个 scratch home 里的
  headless 外壳 + 同一份已安装包）；跑用的是 overlay 里的插件配置（`mode: full`、五角色指向本机网关），不是 live profile
  自己的链路；审计段只保证不复现 carryover 解析的行形状，不保证 section 正文不被追加（详见证据目录 README §4）。

## 2026-11-24 — 完整流程（`/grok on`）补了一张前台：闲聊与单点事实直答、真任务先问再跑、首答在队轮前面

- **From:** 收尾手（`agent-133/docs-writer`）· **To:** 合流者 / 操作员
- **树与基线**：worktree `.agents/worktrees/feat-full-escape`，分支 `feat/full-escape`，基线 `main` 尖端 **`1f70103`**
  （版本 `0.13.32`）。六条提交：`86c0fa2` 首答＋前言 → `597b444` channel 把前台调用单独记账 → `21f3616` 逃生口
  → `8f40be1` 重建 `lib/` → `62f540f` 按状态结算 → `24f2f35` 收尾换时间预算；两条 docs 提交（证据、记忆）跟在后面。
  主检出 `/home/fish/projects_mine/dsh-grok-workflow` 只做过一次动作：把 soak 证据搬走、删掉它那份未跟踪拷贝；
  其余一行未动。`package.json`、`cordis.patch.yml`、版本号未动；**没合流、没发版、没 push、没升 live profile**。
- **改了什么（产品面）**：`src/gate.ts`（+195：`fullFrontDeskEscape` 的 `chat`/`fast`/`team` 三条路与五个 `outcome`
  （`full-escape-chat` / `full-escape-fast` / `full-escape-failed` / `full-escape-ask` / `full-escape-ask-fallback`）、
  `answerFullBehind`（先写首答、起队轮、回执拼 `[注, 首答, acceptedReceipt]`）、`canBackgroundDeliver`、`acceptedReceipt`）、
  `src/triage.ts`（+26：`escape` 输入只丢 `mode-full` 硬覆盖，规则链不动）、`src/answer.ts`（`ACCEPTED_PREAMBLE` 与
  `acceptedEnterText` 的措辞改成「已经先答过、别在它上面再造一个答案」）、`lib/`（`8f40be1` 同一次构建的产物）。
  行为：`/grok on` + 闲聊 → 模板直答、零 run；+ 单点事实 → 一次 `quick-worker`、零 run；+ 真任务 → 先报拆法
  （`full-escape-ask`）、零 run，回「确认」后起队轮并先给首答。部署级 `mode:'full'`（无会话记录）三条路逐字节照旧。
  取舍与被否掉的替代方案见 `DECISIONS.md` **D-131**。
- **用例**：新增 `test/full-escape.spec.ts`（5 例，基线副本上 **4 红 1 绿**）与 `test/full-behind-first-answer.spec.ts`
  （4 例，基线副本上 **4/4 红**）。
- **怎么复核**（会话里直接可跑；本机 Node 26.8.1，`nproc=6`）：
  1. `TMPDIR=$PWD/.tmp npm run ci` —— 期望 **exit 0**、lint `Found 36 warnings and 0 errors`（173 文件）、
     `verify:lib` 报 `lib/ at <sha> is the build of src/ at <sha> (245 files, byte-identical)`、vitest
     **103 files / 1922 tests**（`24f2f35` 上是 172.72 s）。
  2. 只验前台三条路：`npx vitest run test/full-escape.spec.ts test/full-behind-first-answer.spec.ts test/triage.spec.ts
     test/channel.spec.ts test/grok-on-ingress.spec.ts test/human-output-contract.spec.ts test/phase1-dialogue.spec.ts`。
  3. 反证（这条曾经红过）：`npx vitest run test/grok-on-ingress.spec.ts` 连着跑几遍，再在机器有负载时跑一遍——
     那条饱和队列用例现在等的是 15 s 的具名 `landedWithin` 界，不是 350 ms 的轮数预算。
- **证据在哪**：`.rsi/evidence/full-escape-2026-11-24/`（**97 个文件 = 12 个执行手证据 + 85 个 `soak-` 真机证据**）。
  读 `soak.md` 就够：§0 结论表、§2 两个构建的指纹、§3 相 A 逐字、§4 相 B 三场景、§5 收尾实测、§6 缺口、§7 归档与构建归属。
  这 85 个文件原本写在主检出的未跟踪目录里，收尾时逐文件 `cmp` **85/85 一致**、`diff -r` 无差异之后才搬进来并删掉主检出那一份
  （主检出 `git status --short` 已回到空）；搬之前那 12 个文件没被覆盖、也没被删。入库的是 **94 个**：`soak-B1/B2/B3-drive.log`
  三个被 `.gitignore` 的 `*.log` 规则挡住（仓库从没跟踪过任何 `.log`），收尾没有用 `-f` 硬加——它们的每步耗时已经逐条落在
  已入库的 `soak-B?_run.json` 里，见 `soak.md` §7。
- **被有意改的既有钉子（3 个文件 / 10 条用例；行为断言本身没放宽）**：

| 文件 | 条数 | 改的是什么 | 为什么 |
|---|---|---|---|
| `test/triage.spec.ts` | 1 | 「会话 `/grok` 记录强制完整流程」那条：输入换成真任务，标记从「没有档位行」换成「队长先报拆法」；仍然断言只发生 **一次** 调用，并断言那次调用的 `meta.name` 是 `Front desk` | 旧契约是 `/grok on` 下每条消息立即起跑，标记落在「没有 `triage` 的档位行」上；新契约下完整流程自己的第一动作是报拆法 |
| `test/grok-on-ingress.spec.ts` | 3 | `dispatches the next message while the team run is still in flight`、`still runs the full team for the message and delivers the report afterwards`、`a saturated queue keeps the blocking path instead of promising a background run`：都先发真任务、等拆法出去、回「确认」；队轮计数改成 `teamRuns`（过滤掉 `Front desk` 那次调用） | 同一条旧契约：以前发一条就起队轮，现在要点过头才起。改的是「一轮怎么被打开」，断言照旧（`dispatched` 长度、`receipts` 数、`closed` 为真、团队轮数 ≥ 2 都没放宽） |
| `test/channel.spec.ts` | 6 | 把前台那次调用单独记账成 `FakeEngine.frontDeskCalls`，`startCalls` 仍只数整轮；`expect(started).toMatchObject({kind:'enter'})` 换成「先等拆法出去、再断一次整轮」 | 完整流程现在在整轮之前先花一次模型调用；那条调用在真引擎里也会回成一个 run，所以必须分开记，否则「一次 run」这句话就说不清了。断言没有放宽，也没有丢字段 |

- **缺口（照实写）**：① 门禁只在 `24f2f35` 上绿过**一次**，前面两个提交各红过一次（同一条饱和队列用例），
  本地 20 + 8 + 3 次执行、loadavg 推到 31 都没复现，所以「修掉了这条抖动」在本地**无法证明**；
  ② 相 A 的后台报告没等落地（切构建前还没送达），那一相「后台真起了 workflow」靠的是会话日志事件计数与三个子会话的工具调用；
  ③ B2/B3 的「先问」「三层齐全」靠读 GUI 正文逐字判，只有「队轮在点头之后才起」做成了硬证据（`seq25` → `seq29` → `seq37`）；
  ④ B1 的直答是**一个零工具调用的轻量工人**代答，不是零子智能体（零子会话只有 B3 成立）；
  ⑤ 模型用的是 `agent2api/deepseek-v4.1-flash`，不是任务点名的 `wb/cn:deepseek-v4.1-flash`（当时连续 6 次 503）；
  ⑥ 3080「没重启」只有间接证据（端口仍在听、仍 401、`~/.dsh/profiles` 零写入），沙箱 `--unshare-pid` 读不到它的 pid；
  ⑦ 远端 Node 22/24 矩阵 `NOT_RUN`（没 push）。
- **下一步**：合流由主代理做（本包不合、不发版）。若要合，先跑一遍上面的 `npm run ci` 再合；合流后把 `[Unreleased]`
  那四条（英文 + 中文）带进发版段。若还要收口那条饱和用例，判据只看「在真负载下连着跑不再红」，不要为它改断言或抬 `testTimeout`。

## 2026-11-24 — 两条无计时器探针改由探针持钟：远端 Node 24 红转绿、`team-dispatch-v1` 清干净、`feat/audit-layer` 取半记

- **From:** 执行手（`agent-130/worker-timeout`）· **To:** 合流者 / 操作员
- **树与基线**：worktree `.agents/worktrees/fix-timeout-probe-settle`，分支 `fix/timeout-probe-settle`，基线 `main` 尖端 `ca65df8`
  （版本 `0.13.32`），本轮唯一代码提交 **`141dccd`**（只含 `test/timeout.spec.ts`，+19 / −8）。主检出一行未动；代码提交与本轮这条 docs 提交
  都在该分支上、**已推 `origin/fix/timeout-probe-settle` 并开 PR #48**；**没合流、没发版**，
  `src/`、`lib/`、`scripts/`、`package.json`、`CHANGELOG.md`、版本号全部未动。
- **远端那条红（`CONFIRMED`，引用调度实测，不是本轮自己跑的）**：CI run **45378449742**（`main` `ca65df8`）**Node 22 绿 / Node 24 红**，
  逐字 `FAIL test/timeout.spec.ts > the timer the engine realm really has > races on Atomics.waitAsync where no setTimeout exists`、
  `Error: Test timed out in 30000ms.`、`Tests 1 failed | 1909 passed (1910)`。它与 `c1ebdf3` 记的同族：等的是无计时器 realm 的结算，
  钟却是 runner 的。
- **本地修前红：`NOT_RUN`**。8 种打法逐行相加 **102** 次执行、**0 红**（早先口头报的「118 次」是误算，以本表为准）：

| # | 打法（环境） | 次数 | 结果 |
|---|---|---|---|
| 1 | 自然单条 `-t 'settles a hung call within budget in a realm with no timer at all'`（Node 26.8.1） | 20 | 20 绿，1063–1078 ms |
| 2 | 自然单条 `-t 'races on Atomics.waitAsync where no setTimeout exists'` | 20 | 20 绿，约 40 ms |
| 3 | 18 个 busy 循环 + 打法 1 | 10 | 10 绿，1106–1215 ms；loadavg 12.85 |
| 4 | 24 个 busy 循环 + 整文件 `npx vitest run test/timeout.spec.ts` | 6 | 6 绿（22 passed），14.6–16.8 s；loadavg 24.08 |
| 5 | 24 个 busy 循环 + 打法 2，`mise exec node@22.23.4 -- …` | 10 | 10 绿，33–49 ms；loadavg 25.37 |
| 6 | 24 个 busy 循环 + 打法 1（Node 22），另 Node 22 整文件 | 10 + 3 | 13 绿；loadavg 26.82 |
| 7 | 全量套件 `npx vitest run`（101 文件 / 1910 测试，Node 26，最接近 CI 形状） | 3 | 3 绿，123–128 s |
| 8 | 24 个 busy 循环 + `--pool=threads`，两条各 10 | 20 | 20 绿 |

  本地红一次都没打出来，所以**没有**「红的逐字输出」可贴；远端那次红是唯一事实，两者必须分开读。
- **修法（`CONFIRMED`，test-only）**：两条用例的等待从 runner 的钟换成本次等待自己的钟——`test/helpers.ts` 已有的
  `settledWithin(promise, ms, what)`，预算 **15 000 ms**，具名条件是 `'the bare-realm Atomics wait'` 与 `'the no-timer fallback run'`；
  等待期间持一个 ref 住的 timer，15 s 不落地就抛 `<what> did not settle within 15000 ms`。**断言一条没动**（`workerCalls === 2`、两条
  failure 断言、`status === 'completed'`、`elapsed < 15_000`、`assertWorkflowReport`），用例的 `20_000`、`testTimeout: 30_000`、
  skip/only、`vitest.config.ts`、`noTimerScript` 的两处文本破坏全部原样。**是收紧不是放宽**：多了一个比 runner 更早、且指向具体用例的界。
- **修后本地数字（`CONFIRMED`，同一台机器）**：24 个 busy 循环下两条各 15 次 → **30/30 绿**（Atomics 53–69 ms、兜底 **1211–1572 ms**，
  仍是预算驱动而不是靠 15 s 兜底）；整文件 5/5 绿（22 passed，12.66–13.10 s）；`--pool=forks` 1/1 绿（12.71 s）；
  `mise exec node@22.23.4` 整文件 3/3 绿（12.80–15.67 s）；`npm run typecheck` 干净，`npm run lint` **36 warnings / 0 errors**（全既有）。
  变异实测：把 Atomics 用例的入参换成永不落地的 promise → `Error: the bare-realm Atomics wait did not settle within 15000 ms`，
  `tests 15.01s`（失败成它自己，不是 runner 的 30 s），随后按 sha256 `859d39d…` 还原。
- **门禁（调度实测，`CONFIRMED`）**：`npm run ci` 在 `141dccd` 上 **exit 0** —— typecheck 干净；lint **36 warnings / 0 errors**；
  `verify:lib` → `lib/ at 141dccd is the build of src/ at 141dccd (245 files, byte-identical)`；vitest **101 files / 1910 tests PASS**，**122.98 s**。
- **远端（调度实测，`CONFIRMED`）**：**PR #48** <https://github.com/free6589/dsh-grok-workflow/pull/48>，run **45385807284**，
  **Node 22 pass 2m12s / Node 24 pass 2m29s**，两段各自 `Test Files 101 passed (101)` ⇒ `main` 上那次 Node 24 红已转绿。
- **缺口（照实写）**：① 本地修前红 `NOT_RUN`——8 种打法 0 红，所以本地只能证明「修后同口径仍绿」，不能证明「修好了抖动」，判据只能是远端矩阵；
  ② **Node 24 本机 `NOT_RUN`**（没装），它的证据只来自远端两段；③ `settledWithin` 只在循环醒来时校验预算（既有形状，本轮未动）——
  实测把兜底用例的探针预算临时改成 600 ms 仍绿（1064 ms），说明 20 ms tick 本身也会被 sleep 吞掉；这不影响「不落地就具名失败」，但别把 15 s 读成硬实时界。
- **下一步**：合入由主代理做（本包不合不发版）；合入后若要收口这条抖动，只认远端 Node 24 的复跑结果，不要为它改断言或抬 `testTimeout`。

### 分支账目（2026-11-24，调度本轮实测）

| 分支 / worktree | 实测 | 处理与依据 | 恢复方式 |
|---|---|---|---|
| `team-dispatch-v1` + `.agents/worktrees/team-dispatch-v1` | 删前 `ahead=0 / behind=11`；尖端 **`0b686da`**（2026-11-24 16:49:40 +0800）；经 **`dc69c6e`**（17:01:40，0.13.31 合流提交）进 `main`；worktree `git status --porcelain` **0 行** | `git worktree remove` 后 `git branch -d`（`Deleted branch team-dispatch-v1 (was 0b686da)`），时间 2026-11-24 19:05 前后。**口径修正**：派单里「已合超 24 h」不实——尖端 16:49、合流 17:01，距删除只有约 **2 小时**；删除仍然安全，依据是 ahead=0（尖端是 `main` 的祖先）+ 工作树干净 + 内容在 `main` 历史里，**不是**时间 | `git branch team-dispatch-v1 0b686da`（该提交仍在 `main` 历史上，不需要 reflog） |
| `backup/wip-2026-11-24-live-steering` | tip `de7ba6a`，`ahead=1`；创建于 2026-11-24 16:01–16:02 | 保留，**删除日写死 2026-11-27**（创建日 +72 h） | —— |
| `backup/wip-2026-11-24-team-dispatch-v1` | tip `292a4ae`，`ahead=4`；同上时段创建 | 保留，**删除日 2026-11-27** | —— |
| `backup/wip-2026-11-24-progress-task-number-first` | tip `b91ff17`，`ahead=1`；同上时段创建 | 保留，**删除日 2026-11-27** | —— |

三条 `backup/wip` 的条件：任一条在 2026-11-27 前合入 `main` 或被判为无价值，**当天即删**，不必等到删除日。对应补丁在
`.session-stage/patches/{live-steering,team-dispatch-v1,progress-task-number-first}-2026-11-24.patch`——`.session-stage/` 是 gitignore，
**不是跨机器真源，别写成备份**；要跨机器留存得自己另存。`feat/audit-layer` 本轮也未动，评估见 `DECISIONS.md` D-130（取半记录）。

## 2026-11-24 — 0.13.32 发布收口：设置页升级按钮已合入并发版

- **From:** 发版（merge-and-release）· **To:** 下一个接手的人
- **结果**：`feat/update-button` 已以 `--no-ff` 合入 `main`（merge `3a9f7bd`，无冲突），发版提交 `97687ce`，注解标签 `v0.13.32`（标签对象 `53ac1e4`，
  打在 `3a9f7bd` 上）；`main` 与标签都已推送（`c6a3611..3a9f7bd  main -> main`、`* [new tag] v0.13.32`，无 force）。远端 Release `45376772379`
  success，GitHub Release **`Grok Workflow for DSH v0.13.32`** 带资产 **`dsh-grok-workflow-0.13.32.tgz`（947276 B）**；CI `45376766890` 首次
  一条既有探针红、`--failed` 重跑后双绿。
- **合流是快进、不是解冲突**：`git rev-list --left-right --count main...feat/update-button` → 左 `0` / 右 `3`，分支从 `c6a3611` 切出，
  `git merge --ff-only` 直接到 `09a21c2`；计划里的解冲突一步因此是空操作，合流那一刻没有任何一行产品代码变化。
- **发了什么**（用户能感觉到的部分）：设置页的版本卡不再只是「说出最新版本 + 给一条命令」，而是一个按钮真能装——一次点击是一次检查加一次安装，
  页面不 reload；装什么由宿主按本仓库的发布形状自己拼，成功只认读盘回执，失败或装歪就回滚。决策与被否掉的替代方案见 `DECISIONS.md` D-129。
- **门禁**：`TMPDIR=$PWD/.tmp npm run ci` 在发版树 `97687ce` 上 **exit 0**（只跑一次）——typecheck 干净、`oxlint src test` **36 warnings / 0 errors**
  （171 文件，全既有）、`verify:lib` 245 文件逐字节一致、vitest **101 文件 / 1910 测试 PASS**（160.97 s）。对 `v0.13.31` 的 100 文件 / 1866 测试基线是
  **+1 文件 / +44 测试**。
- **soak 复用的口径（照实说）**：真机 soak 没有重跑，依据是快进合流没改产品代码，之后唯一的产品代码改动是两个版本常量（重建进客户端包），
  而它们正是 `test/update-entry.spec.ts` 与 `test/docs-config-keys.spec.ts` 钉住的。`.rsi/evidence/update-button-soak-2026-11-24/` 三跑两过：
  run3 经真 GitHub fetch + 真 pnpm + 真 profile 写入把 0.13.30 装到 0.13.31，并读回 `INSTALLED_VERSION=0.13.31` 与钉死的 spec；run1 四相同形
  但没留读盘那一行；run2 红在 harness（新构建替换页面时元素句柄脱离），不是产品，盘上仍读到 `0.13.31`。
- **远端 CI 的那一次红**：`45376766890` 首次只有 `Node 24` 的 `Run npm test` 挂，恰好一条 `test/timeout.spec.ts` 的 `Atomics.waitAsync` 探针
  （`Error: Test timed out in 30000ms`，`Test Files 1 failed | 100 passed (101)`），它前面每一步全绿；同一次尝试的 `Node 22` 与 Release 自己的
  `npm test` 都绿。本版没碰这两个文件（`c6a3611..3a9f7bd` 对 `test/timeout.spec.ts`、`src/timeout.ts` 为空，后者最后一次改动是 `d7f8df6`），
  与在案的 realm 等待器抖动同族。按既有政策只做 `gh run rerun --failed`，没有改断言、没抬 `testTimeout`、没跳过。
- **红线**：全程未碰 `~/.dsh`，未升级、未重载、未重启运行中的实例；AGENTS §11 自动升级因沙箱写不到工作区以外而**没有执行**（`BLOCKED`）。
- **待办**：① 升级 live profile 到 `v0.13.32` 需要操作员执行 `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.32`
  （钉 tag）并把版本读回成 `0.13.32`；② `.agents/worktrees/team-dispatch-v1` 与 `team-dispatch-v1`、`feat/audit-layer` 等未合分支仍在，
  本包故意没动；③ 远端仍可能在那条 realm 探针上红一次，先 `gh run rerun --failed`，不要为此改断言或抬 `testTimeout`。

## 2026-11-24 — `team-dispatch-v1` rebase 到 main 尖端：3 条重放 + 2 条收尾，全仓门禁 `exit 0`（`CONFIRMED`，待合流判定）

- **From:** 执行手（`agent-125/rebase-ci`） · **To:** 合流者 / 操作员
- **基线**：`main` 尖端 `369d6e3`（= `origin/main`），版本 `0.13.30`，tag `v0.13.30` 在。分支原尖端 `7d86bc4`（merge-base `e4e03e9`，落后 193 条）。worktree 仍是 `.agents/worktrees/team-dispatch-v1`，未动主检出。
- **结果**：rebase 完成、未 abort；分支新尖端见 `git log`（3 条重放 + `chore(build)` 重建 `lib/` + 本轮记忆）。**没 push、没打 tag、没删任何分支或 ref**（`backup/wip-2026-11-24-*` 三条原样在）。
- **冲突口径**：`src/**` 一律保留 main 的新架构（`TaskBoard` + `boardReader` + `decideIntent` + 异步会话），只搬分支的真新增。分支自己那份 `board.json` 会话实现**没有**复活：它的能力已由 main `9dc7624`（dispatcher 跑在持久 TaskBoard 上）覆盖，复活的唯一后果是第二个板文件。
- **搬进来的真新增**：① 认领锁（`TASKBOARD_LOCK` / `.store.jsonl.lock` / `withLock` / 陈旧锁接管，锁内「重读 → 按磁盘版本 CAS → 落盘」）；② 到达顺序（`TaskRecord.seq` + `TaskBoard.arrival()` + `DispatcherSession.pending()` + `resume().pending`；旧账本没有 `seq` 的行按文件序补盖，不重排、不丢）；③ 全路径寻址（`isFullSubagentPath` / `isAddressPath` / `invalid:bad-address`，owner 必须形如 `lead/worker-1`）；④ `creator` + `resultRecipient`（结果只回创建者，改派不改收件人）；⑤ 位置解析 `src/taskboard/paths.ts`（`taskboardDir` / `taskboardFile` / `openDefaultTaskboard`）。
- **判定 main 已覆盖、只留护栏没搬实现的**：改派时清掉陈旧 block reason——main 的 `requeue`（`store.ts`）先把 blocked/failed 送回 `pending`，适配器 `mapStatus` 对 `pending` 只回 `{status}`（`board-reader.ts`），读面自然没有 `blockedReason`；把分支那条用例照搬到 main 现有实现上**直接 PASS**，因此留作 `test/dispatcher.spec.ts` 的护栏而非新代码。`createDispatcherSession(dir)` 现有即清 `store.jsonl` 是 main 明写的产品决定（「接旧状态用 `resume()`，不要用 `start()`」），本轮**未**擅自改。
- **门禁**：`npm run ci` → **exit 0**，**100 files / 1866 tests PASS**，typecheck 干净，oxlint **0 errors / 36 warnings**（全既有），`verify:lib` **241 files byte-identical**。
- **跨进程差分（自己复跑的实测，不引用他人结论）**：12 个 node 进程同时各认领各的一行；main 的产物（`git archive main lib/taskboard` 取出，未构建）三次分别只活 5 / 6 / 7 行，而 12 个进程都报成功；rebase 后的 `lib/` 三次都 12/12 全活。FIFO 探针：main 重开后 `list()` 回到 id 序（`a,b,task-10,task-9`），到达序不可恢复；rebase 后 `list()` 同前（main 契约不变），`arrival()` 给出 `task-10,task-9,b,a`。
- **未做**：没合流 `main`、没 push、没发版；没跑真机 soak（本轮只到单测 + 门禁）；handoff / report / delivery 三个面一行未动；L3 小组长与引擎读板仍未接。
- **合流建议**：建议合，但请按「两条真缺陷 + 一条能力」来看待，而不是当一个新特性——锁修的是跨进程丢更新（实测可复现），`seq` 补的是重启后队列乱序，寻址/creator 是策略加固。若嫌提交面大，可只 cherry-pick 锁与 `seq` 两组改动 + 各自用例。

## 2026-11-24 — 清包：19 条已合分支删完、三处悬空活双份落盘、三条未合分支各有结论（`CONFIRMED`，纯文档 + 证据，`src/test/lib` 一行未动）

- **From:** 执行手（`agent-124/debt-finisher`） · **To:** 下一个接手者 / 操作员
- **基线**：`main` 尖端 `6b3ed39`（= `origin/main`），版本 `0.13.30`，tag `v0.13.30`。
- **本包的性质**：只做清理与归档。`src/`、`test/`、`lib/` **一行未改**；没建 tag；没改 `package.json`/`package-lock.json`；
  **没跑 `npm run ci`（无源码改动，`NOT_RUN`）**；没碰 `~/.dsh`、没重启任何服务；没 force-push、没改写共享历史；`.rsi/STOP` 未动。
  临时产物只在 `.tmp/`（gitignored），归档件在 `.session-stage/`（gitignored 但**真实落盘**）。

### 1. 删单：19 条已合分支（`CONFIRMED`，逐条先核 ahead=0 再 `git branch -d`，全程没用 `-D`）

每条删除前都跑了 `git rev-list --count main..<b>`，输出**全部为 0**；随后 `git branch -d`（**不是 `-D`**）全部成功，
git 自己回显 `Deleted branch … (was <tip>)`。tip 与删除前 ahead 值一一对应如下：

| # | 分支 = tip | 删前 `main..<b>` | 删法 |
|---|---|---|---|
| 1 | `feat/live-steering` = `3b793ac` | 0 | `-d` |
| 2 | `fix/null-collapse-t1` = `81e6b59` | 0 | `-d` |
| 3 | `fix-progress-task-number-first` = `b61ff66` | 0 | `-d` |
| 4 | `fix/session-surface-head-6` = `a6103ad` | 0 | `-d` |
| 5 | `rsi/round2-docs` = `1a16d2f` | 0 | `-d` |
| 6 | `rsi/round-42` = `e9fd908` | 0 | `-d` |
| 7 | `rsi/sec2-01-timeout-default` = `22ab037` | 0 | `-d` |
| 8 | `rsi/sec2-02-replan-default` = `f996cc8` | 0 | `-d` |
| 9 | `rsi/sec2-03-mode-allow` = `be6abed` | 0 | `-d` |
| 10 | `rsi/sec2-04-upgrade-verdict` = `81f6c5a` | 0 | `-d` |
| 11 | `rsi/sec2-05-answer-cell-doc` = `ae72f7d` | 0 | `-d` |
| 12 | `rsi/sec2-06-resume-carryover` = `2cfe4be` | 0 | `-d` |
| 13 | `rsi/sec2-07-host-evidence` = `b1230e1` | 0 | `-d` |
| 14 | `rsi/sec3-01-rail-doc` = `0f9f2e3` | 0 | `-d` |
| 15 | `rsi/sec3-02-switch-on-rate-limit` = `7305f17` | 0 | `-d` |
| 16 | `rsi/sec3-03-summary-review` = `b225446` | 0 | `-d` |
| 17 | `rsi/sec3-04-answer-parity` = `d947a92` | 0 | `-d` |
| 18 | `rsi/sec3-05-image-scope` = `943bb86` | 0 | `-d` |
| 19 | `rsi/soak-65` = `9047f72` | 0 | `-d` |

**连带移除的 worktree（5 个，其中 2 个用了 `--force`）**：

| worktree 路径 | 分支 | 结果 | 依据 |
|---|---|---|---|
| `.agents/worktrees/fix-progress-task-number-first` | `fix-progress-task-number-first` | 普通 `remove`，一次成功 | 工作树干净 |
| `.tmp/wt-steer` | `feat/live-steering` | 普通 `remove`，一次成功 | 工作树干净 |
| `.agents/worktrees/rsi-redrive-13` | `rsi/redrive-13` | 普通 `remove`，一次成功 | 工作树干净；且在此之前归档件已落盘校验 |
| `.agents/worktrees/fix-null-collapse-t1` | `fix/null-collapse-t1` | 先被拒（`contains modified or untracked files`），`--force` 成功 | 唯一脏的是一个未跟踪目录 `.rsi/evidence/null-collapse-t1/`；删前已在主树按 sha256 复核这两个文件**逐字节相同**（见下） |
| `.agents/worktrees/rsi-soak-65` | `rsi/soak-65` | 同样先被拒，`--force` 成功 | 同上，对象是 `.rsi/evidence/round-065/soak.txt` |

`--force` 的两份依据（删前实测，主树里的副本非空且 sha256 与后删的 worktree 内完全一致）：

```text
75313c48bba5a22447f63382e9c41671057f64d2a5ab63683c31f2e87ef163b4  .rsi/evidence/null-collapse-t1/green-null-collapse.txt
d01528d2f9db9ce622cdfb2720495bf13077a7a9eac24d0fb7b4358c3fa00385  .rsi/evidence/null-collapse-t1/red-null-collapse.txt
0ca437a9ff7d195cf401a9e300ab3cb2f793a99a646319e80cd7d69f768dd1c6  .rsi/evidence/round-065/soak.txt
```

（口径修正：派单里写 `.rsi/evidence/round-065/` 是「3 文件？按实际」。**实际是 1 个文件** `soak.txt`；两份 null-collapse 取证是 2 个文件，
两者合计 3 个，删 worktree 前核的就是这 3 个。）

**`rsi/redrive-13` 用 `-D`（本包唯一一处）**：`ahead=7`，所以 `-d` 按定义必然拒删。删除**之前**归档件已落盘并校验非空，见下节。

### 2. 三处悬空活：落在各自 base 上 tree 精确复现，对当前 `main` 不能干净落地（`CONFIRMED`）

三份补丁与三个备份提交（**绝对路径**，字节数为本轮实测）：

| 活 | 补丁绝对路径 | 字节 | 备份分支 | 备份提交 | tree | 复现判据 |
|---|---|---|---|---|---|---|
| 进度页任务号优先 | `/home/fish/projects_mine/dsh-grok-workflow/.session-stage/patches/progress-task-number-first-2026-11-24.patch` | **75374** | `backup/wip-2026-11-24-progress-task-number-first` | `b91ff17` | `e5c9471` | 在各自 base 上 `git apply` → `git add -A` → `git write-tree`，与备份提交 tree sha **完全相同** |
| 团队派发 v1 | `/home/fish/projects_mine/dsh-grok-workflow/.session-stage/patches/team-dispatch-v1-2026-11-24.patch` | **192596** | `backup/wip-2026-11-24-team-dispatch-v1` | `292a4ae` | `af75712` | 同上，另加逐字节相同 |
| 运行中插话 | `/home/fish/projects_mine/dsh-grok-workflow/.session-stage/patches/live-steering-2026-11-24.patch` | **286000** | `backup/wip-2026-11-24-live-steering` | `de7ba6a` | `f849f06` | 同上，另加逐字节相同 |

- **对当前 `main` 不能干净落地**：两条命令给的是两组不同的数，原来那行把它们混挂在 `--check` 名下是错的，这里分开写（都在 `8204e47` 上各复跑 3 次，三次一致）：
  - `git apply --check`，退出码 **1**，报 **9 / 9 / 8** 个文件 `patch does not apply`——这是**逐文件落不上**的数（progress 9 个文件挂满、
    team-dispatch 15 个里挂 9 个、live-steering 17 个里挂 8 个）。
  - `git apply --3way --check`，退出码 **0**，逐文件报 `Applied patch to … with conflicts`：**5 / 7 / 8** 个文件带冲突；
    在一次性 worktree（`main` = `8204e47`）里真 `git apply --3way` 后数 `^<<<<<<<`，冲突标记 **5 / 9 / 13** 处。
    → 「冲突文件 5/7/8、冲突标记 5/9/13」出自 `--3way`，不是 `--check`。
  - 三个 base 落后 `main` **223 / 192 / 226** 个提交（同一提交 `8204e47` 上量的，按上表顺序；每加一个提交这个数各自 +1，复跑请以当时 HEAD 为准）。
    这是**已知且被接受的事实，不是阻断条件**——本包对归档定的可恢复性判据是「补丁落回它自己的 base 后 tree 精确复现」，该判据已满足。
- **三处悬空活的真实体量口径**（`git diff --numstat <备份分支>^ <备份分支>` 复算，本轮实测，供下一轮对账）：
  - `progress-task-number-first`（`b91ff17`）：9 文件 **+65/−8**（`src` +16/−3、`test` +23/−0、`lib` 生成物 +26/−5）。
  - `team-dispatch-v1`（`292a4ae`）：15 文件 **+313/−62**（`src` +83/−28、`test` +131/−0、`lib` +99/−34）。
  - `live-steering`（`de7ba6a`）：17 文件 **+1348/−27**；其中手写 `src`+`test` 合计 **+805/−12**（`src/steer.ts` +237、
    `test/live-steering.spec.ts` +372），`lib/` 重建产物 +517/−15，另含 `CHANGELOG.md` +8、`AGENTS.md` +18。
  - 一句话别记错账：原始派单里那个 **「+417」不属于这三处任何一处**——它恰好等于 `feat/audit-layer` 的 `test/report-audit.spec.ts`
    行数（417，实测），是派单侧串台。判别归档完整性不靠行数，靠「补丁落回各自 base 后 tree 精确复现」。
- **要落 `main` 需另开 rebase 包**。本包**不 rebase**：rebase 必然动 `src/`/`test/`/`lib/`，与本包的零产品改动硬约束冲突。
- **一行补丁事故（照实记）**：progress 补丁一度被误清空（0 字节）。处置是从备份提交 `b91ff17` **重新导出**，最终 **75374 B**。
  判定它可用不是靠字节数，而是靠上面那条 **tree 相等**。

### 3. 三条未合分支的结论（原样，作为下一步的行动指令）

- `team-dispatch-v1`（ahead=3 / behind=190，47 文件 +1992/−268，含 `test/taskboard.spec.ts`、`test/dispatcher.spec.ts` 新用例）→ **合**：rebase 到当前 main 后合入，唯一带完整测试的真实功能；本包不执行（会造成产品改动），脏活已落 `backup/wip-2026-11-24-team-dispatch-v1`。
  - 本轮实测：`ahead=3` / `behind=**191**`（差的那 1 个就是本包自己的证据提交 `3a2faa0`），47 文件 +1992/−268 与派单一致；
    `test/taskboard.spec.ts`、`test/dispatcher.spec.ts` 都在改动清单里，另含 `vitest.config.ts` 与 `test/fixtures/taskboard/writer.mjs`。
    → 口径：`191` 是**在证据提交 `3a2faa0` 上量的**；到本包最终 HEAD `8204e47` 已是 **192**，以后每加一个提交还会再 +1，复跑请以当时 HEAD 为准。
  - 该分支的 setup 记录 `.rsi/evidence/branch/team-dispatch-v1-setup-2026-11-23.md` **已随本包进库**（见下节「卫生」），
    下一个人 rebase 时按它复现环境。
- `rsi/redrive-13`（ahead=7 / behind=155，30 文件）→ **删**：证据绑旧树、405 断言 main 已具备；归档在 `.session-stage/patches/redrive-13-2026-11-24/` 与 `.session-stage/archive/redrive-13-evidence-2026-11-24.tar.gz`。
  - 本包已执行删除（`-D`）。归档件的可恢复性**已用决定性方法证明**，不是"文件还在"：tarball `gzip -t` 通过、解包得 **24** 个文件
    ＝分支 `.rsi/evidence/rsi_redrive` 下文件数 24，逐文件 `git show rsi/redrive-13:<path> | cmp -` 比对 **24/24 一致、0 处不同**。
  - 该分支自己的 `README.md`（退役说明）在 `.session-stage/patches/redrive-13-2026-11-24/README.md`。
- `feat/audit-layer`（ahead=1 / behind=481，996 行含 417 行 `test/report-audit.spec.ts`；`src/report.ts` 已被 0.13.30 的诊断对齐改写）→ **rebase 后再评估合**：不删（删了真丢功能），也不直接合（和新报告层冲突）；能跑就跑一次冲突规模（如 `git merge-tree --write-tree main feat/audit-layer | grep -c '^<<<<<<<'` 之类），跑不动写 NOT_RUN 及原因。
  - **跑了**，结论是**冲突很小、值得 rebase**：`git merge-tree --write-tree --messages main feat/audit-layer` → exit 1，冲突路径 **6 个**：
    `src/report.ts`、`test/phase1-dialogue.spec.ts`，加它们的 4 个生成物 `lib/report.{js,d.ts,js.map,d.ts.map}`。
    也就是说**真正要人去合的只有 2 个手写文件**，`lib/` 那 4 个 `npm run build` 重生成即可。
  - 关于派单里那条 `grep -c '^<<<<<<<'`：**该命令在本 git 版本上输出 0，不能当"无冲突"的证据**。原因已查明：`merge-tree --write-tree`
    的树转储列的是冲突**暂存项**（stage 1/2/3）而不是统一 diff 的冲突标记，标记只出现在 `--messages` 的 stderr 消息段里、
    且格式是 `CONFLICT (content): Merge conflict in <path>` 一行一条路径。所以本轮改用**冲突路径数**作为冲突规模的口径，这是可核对的。
  - 冲突之所以这么小：分支只有 1 个提交（`7626233`），而 `main` 自 merge-base 起把 `src/report.ts` 改了 **+450/−15**——
    改动集中在同两个文件，但 git 仍能自动合并其余部分。
  - 照实标注：本轮实测 `behind=**482**`（派单写 481，差的同样是本包那个证据提交）。→ 口径同上：`482` 是**在证据提交 `3a2faa0` 上量的**，
    到最终 HEAD `8204e47` 已是 **483**，以后每加一个提交还会再 +1，复跑请以当时 HEAD 为准。

### 4. 卫生：什么进了库、什么退役了、旧盘点逐条复核

**进库（随本包提交 `3a2faa0`，23 个文件 / +2095 行，无 `src|test|lib`）**——判据是"被 tracked 文档按路径引用"，逐条用
`git grep --fixed-strings` 复核过，不是照抄：

| 进库条目 | 引用它的 tracked 文档（实测） |
|---|---|
| `.rsi/evidence/round-065/` | `docs/knowledge/{HANDOFF,STATE,VALIDATION}.md` |
| `.rsi/evidence/null-collapse-t1/` | `docs/knowledge/VALIDATION.md` |
| `.rsi/evidence/spine-parity-2026-11-21*` | `.rsi/evidence/fixed-gutter-2026-11-22.md`、`docs/knowledge/evidence/baseline-inventory-2026-11-22/BASELINE.md` |
| `.rsi/evidence/red-semantics-2026-11-22*` | `docs/knowledge/DESIGN-progress-tab.md` |
| `docs/knowledge/evidence/midrun-channel-steering-2026-11-22/` | `docs/knowledge/{DECISIONS,HANDOFF,STATE}.md`、`docs/knowledge/DESIGN-midrun-channel-steering.md` |
| `docs/knowledge/evidence/branch-cleanup-2026-11-22/` | `docs/knowledge/STATE.md` |
| `.rsi/evidence/branch/team-dispatch-v1-setup-2026-11-23.md` | **原本 0 引用**；本包在 §3 的 `team-dispatch-v1` 结论里显式引用了它，所以它落地后是有主引用的，不是新增垃圾 |
| `.rsi/evidence/progress-card-q10b-2026-11-22.{json,md,-harness.html}` | `.rsi/evidence/src-lib-deadcode-2026-11-22.md:253`（按路径点名）。**这条与派单不一致**：派单把它列在退役侧，但退役会让那条 tracked 引用悬空，所以按本包判据改判进库 |

**退役（13 项，**没有 `rm`**，全部原样移走）**：根是 `.session-stage/archive/evidence-retired-2026-11-24/`，
清单与逐条大小写在 **`.session-stage/archive/evidence-retired-2026-11-24/MANIFEST.md`**（保持仓库相对路径原样，回滚 = 反向 `mv`）。

| 原路径 → 新路径（新 = 归档根 + 原路径） | 大小 |
|---|---|
| `.rsi/evidence/baseline` → `…/.rsi/evidence/baseline` | 128K |
| `.rsi/evidence/bughunt` → `…/.rsi/evidence/bughunt` | 24K |
| `.rsi/evidence/dsh-diag-2026-11-22.md` → `…/.rsi/evidence/dsh-diag-2026-11-22.md` | 20K |
| `.rsi/evidence/fs-diag-2026-11-22` → `…/.rsi/evidence/fs-diag-2026-11-22` | 44K |
| `.rsi/evidence/nyc-current-2026-11-22` → `…/.rsi/evidence/nyc-current-2026-11-22` | 132K |
| `.rsi/evidence/nyc-style-2026-11-22` → `…/.rsi/evidence/nyc-style-2026-11-22` | 1.5M |
| `.rsi/evidence/perf` → `…/.rsi/evidence/perf` | 24K |
| `.rsi/evidence/pnpm-diagnosis-2026-11-22.md` → `…/.rsi/evidence/pnpm-diagnosis-2026-11-22.md` | 12K |
| `.rsi/evidence/rsi-guard-2026-11-22.md` → `…/.rsi/evidence/rsi-guard-2026-11-22.md` | 16K |
| `.rsi/evidence/rsi_redrive` → `…/.rsi/evidence/rsi_redrive` | 616K |
| `.rsi/evidence/sg-weather-2026-11-22` → `…/.rsi/evidence/sg-weather-2026-11-22` | 612K |
| `.rsi/evidence/upgrade` → `…/.rsi/evidence/upgrade` | 40K |
| `docs/knowledge/evidence/session-mlang-c537e178` → `…/docs/knowledge/evidence/session-mlang-c537e178` | 44K |

理由（逐条同一句）：**无 tracked 文档按路径引用**。移完后 `git status --short` **没有任何 tracked 文件被删**（已核）。
口径提醒：派单里 `.rsi/evidence/branch` 那两处"命中"其实是 `.rsi/evidence/branch-cleanup-2026-11-22/DELETED.shas` 的**前缀误匹配**，
那个文件本来就是 tracked 的，无需处理。

**`manual-sessions-unfinished.md` 第二节 6 件「未完成」，在当前 `main` 上逐条复核**（自己 read/grep，没照抄任何人的结论）：

| # | 旧盘点的说法 | 当前状态 | 证据（`文件:行`） |
|---|---|---|---|
| ① | 运行时限默认还是 60 分钟 | **已关闭** | `src/config.ts:124` `export const DEFAULT_TIMEOUT_MS = 0`（同处注释：`0` 表示不限时，且"is now the default as well, because the operator chose unbounded runs over a fixed 60-minute cap"）；`src/config.ts:598` schema 默认也走它 |
| ② | 主会话插话默认 false，设置页没开关 | **已关闭** | `src/config.ts:172` `export const DEFAULT_REPLAN = true`；设置页开关 `src/client/index.js:146` `{ key: 'replan', group: 'loop', kind: 'boolean', def: true }`，渲染在 `src/client/index.js:1818`；文案「默认打开」在 `src/client/index.js:491`。附注：`src/types.ts:196` 的注释仍写 "`false` by default"——**陈旧注释**，行为已是 true（本包不改源码，只记在这里） |
| ③ | 总开关一按就报 405，没修 | **已关闭** | 服务端给 405 加 `Allow`：`src/mode-surface.ts:400`；被拒请求记 `method` + `URL`：`src/mode-surface.ts:359`；前端写只发 `POST`：`src/client/index.js:4621`；读改走 `GET ?action=status&sessionId=…` 兜底：`src/client/index.js:4649`（`getRoute`）/`:4659`。**残余**：`main` 自己的用例只断言日志里出现 `PUT`，没断言 URL 那半条；那半条断言在 `rsi/redrive-13` 的 7 行 spec patch 里，已归档，可随时捡回 |
| ④ | 设置页没有一键升级按钮 | **已关闭（入口成立），但照实说不是"一键"** | `src/client/index.js:198` `const UPDATE_LATEST = '0.13.30'`；更新卡 `UpdateCard` 在 `src/client/index.js:1501`，显示「当前版本 vs 最新」+ 一条可复制命令 + 复制按钮，标记 `data-gw-update`/`data-gw-update-state`。代码注释明写 **"Read-only on purpose"**，所以它给的是「复制命令」，不是点一下自动升级——原话要的是按钮，这一半仍可争 |
| ⑤ | 进度页「回答」格子永远是空的 | **已关闭（按删除该格子关闭）** | `src/progress-tab.ts:210` `PROGRESS_STAGES` 现为**六段**：`start`/`plan`/`execute`/`verify`/`synthesize`/`end`，**没有 `answer`**；客户端同构在 `src/client/index.js:2430`。理由写在 `src/progress-tab.ts:205`：最终答案由 gate（`relayText`）交付、永不是 workflow 子调用，「the spine does not list a stage no event can fill」。这正是 `rsi/sec2-05-answer-cell-doc` 的结论「六段不是七段」 |
| ⑥ | 断点续跑只做了一半，`wired: false` | **已关闭** | `src/checkpoint/wiring.ts:298` `wired: true`、`entry: 'src/run.ts:runWorkflow'`；`findResumableCheckpoint` 真被调用：`src/run.ts:936`（`import` 在 `src/run.ts:27`） |

结论：旧盘点里这 6 件**全部已关闭**（④ 是"入口有了、不是真一键"这一处口径差异，照实标出）。原文件**退役不删**：
`manual-sessions-unfinished.md` → `.session-stage/archive/manual-sessions-unfinished-2026-11-23.md`（133 行，10133 B，未入库）。

**收尾分支表**：只剩 `main` + `team-dispatch-v1` + `feat/audit-layer` + 三条 `backup/wip-2026-11-24-*`；
worktree 只剩主树 + `.agents/worktrees/team-dispatch-v1`。

### 5. 本包没做的（照实列，别当成已收）

1. **没跑 `npm run ci`（`NOT_RUN`）**：本包 `src/`、`test/`、`lib/` 一行未改，没有可验证的代码改动。
2. **没发版、没建 tag、没动版本号**：`package.json`/`package-lock.json` 未改。
3. **没碰 live**：没读没写 `~/.dsh`，没重启任何服务。
4. **没 rebase 三份补丁**：要落当前 `main` 得另开 rebase 包（见 §2）。
5. **`team-dispatch-v1` 没合、`feat/audit-layer` 没合**：都会造成产品改动，超出本包范围（见 §3）。

## 2026-11-24 — 0.13.30 已发：同一份报告的两个机器视图说上同一句话，门禁不再因为机器忙就红（`CONFIRMED`，CI + Release 双绿）

- **From:** 发版方（调度 agent-122 / dispatcher） · **To:** 下一个接手者 / 操作员
- **本版发了什么**（逐条原文见 `CHANGELOG.md` 的 `## [0.13.30] - 2026-11-24`，下面 ①② 在 `### Fixed / 修复`，③ 在
  `### Verification and gate / 验证与门禁`）：
  ① **对齐那一刀**——机器台账现在渲染报告自己的诊断块（死路由写明哪条路、哪类传输故障、连续几次；每次子调用的预算行；
  两个分开的溢出标题，一个是本轮自己的上限、一个是另一个在跑的 run 给的大致提示；错误行保留类别且两边同一条消息；
  只记了等待、没点名的路由条目不再印成 `no lane named`；收尾那两行走截断前预留，不再被长度上限吃掉），于是同一份报告的两个视图
  不再各说一句话；② **抖动那一刀**——两条负载敏感的门禁用例改成等后台轮**落地**（`landedWithin`，探针自己持 ref 住的 15 000 ms
  timer、具名失败）而不是等它**开跑**；test-only，`src/`、`lib/` 一行未动，所以它动的是门禁、不是产品；③ **挂死形状取证**——
  只出证据不出代码，目录 `.rsi/evidence/soak-hang-shape-2026-11-24/`：五个任务的真机一轮里挂死路整轮被调用 **3 次**（任务 1 自己的
  两次尝试；任务 2–5 一次都没打它），每次挂死调用都由这一轮自己的 45 s 子调用预算结算（端点侧 44.65–44.93 s），第 3 次是传输层
  300 s 后把第一次尝试遗留的孤儿请求原样重发（请求体字节数相同），两轮独立复现形状一致。
- **发版事实（`CONFIRMED`）**：基线 `main` 尖端 `4f616d1`（`merge: ledger and report diagnostics parity`）＝`origin/main`；
  发版提交 `10af79b` = `chore(release): prepare v0.13.30`（8 files / +32 −20）；版本四处都动（`package.json` +
  `package-lock.json` 2 处、`docs/LOCAL-TESTING.md` 的打包产物名 3 处、`src/client/index.js` 的
  `PLUGIN_VERSION`/`UPDATE_LATEST` 并 `npm run build` 重建 `lib/client.js`），两个 README 的声明版本/两条安装钉/散文
  `#vX.Y.Z`/发布 tag 列表同时收到 `v0.13.30`。本地门禁 `TMPDIR=$PWD/.tmp npm run ci` **exit 0**：typecheck 干净、oxlint
  **0 errors / 36 warnings**（全既有）、`verify:lib` byte-identical **237 files**、vitest **100 files / 1846 tests PASS**
  （150.39 s）；本轮**只跑一次**（0.13.29 那轮 12 次里有 6 次红在挂死探针上，那两条的修法 `a210b08` 已在本版里）。
  口径要照实说：本地 `verify:lib` 那行报的是 HEAD 树（`lib/ at 4f616d1 …`），因为跑门禁时工作区还带着未提交的版本改动；
  管发版的是 Release workflow 在打了 tag 的提交上跑的 `git diff --exit-code -- lib/`，它在远端过了。附注 tag `v0.13.30`
  （message `v0.13.30 — one report's two machine views agree, on a gate that stopped failing on a busy machine`）已 push，
  `main` push `4f616d1..10af79b`；远端 `CI` **45349629702** success、`Release` **45349634592** success，已发布
  <https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.30>，资产 `dsh-grok-workflow-0.13.30.tgz`（917 321 bytes）。
- **本次归档做了什么**：只动三份记忆（本节所在的 `HANDOFF.md`、`VALIDATION.md` 首条、`STATE.md` 顶部），外加把准备发版时还
  未跟踪的取证目录 `.rsi/evidence/soak-hang-shape-2026-11-24/` 一起提交（它此前是「记忆未归档」的状态，现在 `VALIDATION.md`
  首条指向它，下一个读者能按路径找到）。源码、测试、`CHANGELOG.md`、`package.json`/`package-lock.json` 一行未动；
  没提交别的、没打新 tag、没跑 `npm run ci`。
- **还开着的（照实列，别当成已收）**：
  1. **六个 worktree 没动**，因为带未提交的活或未合的分支：`.agents/worktrees/fix-null-collapse-t1`（已合，1 条脏）、
     `.agents/worktrees/fix-progress-task-number-first`（已合，9 条脏）、`.agents/worktrees/rsi-soak-65`（已合，1 条脏）、
     `.agents/worktrees/rsi-redrive-13`（分支**未合**，干净）、`.agents/worktrees/team-dispatch-v1`（分支**未合**，15 条脏）、
     `.tmp/wt-steer`（已合，17 条脏）。只删掉了两个已合并且干净的：`feat/dead-routes`（`0113211`）、`release/0.13.27`（`2141071`），
     连分支一起删。下一个接手者要么把脏活收进提交、要么明确丢弃，别直接 `git worktree remove --force`。
  2. **十二条已合的 `rsi/sec2-*` / `rsi/sec3-*` 分支还在，且已经过了 2026-11-24 的删除日**（§5：合了 24h 内删，留着就是垃圾）。
     另有三条未合分支仍在：`rsi/redrive-13`、`team-dispatch-v1`、`feat/audit-layer` —— 这三条按 §5 要有结论：合、rebase、还是删。
  3. **live profile 本侧没升（`BLOCKED`）**：调度的沙箱写不到工作区以外，`~/.dsh` 不在可写范围里。把 live profile 钉到
     `v0.13.30` 这件事留给操作员，命令就是下面这一条；钉完要读回版本确实是 `0.13.30`，不是「今天解析到什么算什么」。
- **要交给操作员的一条命令**：
  `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.30`
- **`.rsi/STOP` 复原了**：那份 tracked 的 `Operator stop — RSI self-iteration halted 2026-11-21` 此前被某个会话在工作树里删掉、
  没有提交解释它，这次 `git checkout -- .rsi/STOP` 放回去，操作员记录的停止继续有效——动手前先看它，别把 RSI 自迭代重新点起来。

## 2026-11-24 — 负载敏感的两条 spec 收口：等后台轮落地，不等它开跑（`test/` only，`CONFIRMED`）

- **From:** 修者（agent-118/fixer 派出的实现代理） · **To:** 下一个碰这两条 spec 的人 / 发版方
- **分支与提交：** 分支 `fix/flaky-triage-phase1`（worktree `.tmp/wt-flaky-triage-phase1`，从 `main` `4a2f7fd` 开出）；
  `a210b08` = test-only 修法，随后一个 `docs(memory)` 提交 = 本节与 `VALIDATION.md` 首条、证据目录。**未 push、未合、未发版**，
  共享脏树 `/home/fish/projects_mine/dsh-grok-workflow` 一行没动。
- **修的是什么（一句话）：** 用例在后台轮**开始**时就断言，而闸门为整轮留着这条会话的插话通道、直到报告投递之后才关（`src/gate.ts` 的
  `runChannelRound` 的 `finally`）—— 落在这个窗口里的消息不会走前台，会被并进正在跑的轮，回一句
  `已收到，并入了正在跑的这一轮（待并入 1 条）…`。所以红出来的是「像产品 bug 的话」，不是用例要钉的事实。
- **数字：** 修前修者 `LOAD=16 N=15` 单跑 `test/phase1-dialogue.spec.ts` **15/15 红**（只有
  `P0-2 … consumes a pending question once, so a repeated answer cannot start a second run` 一条），验收方修前同 harness `LOAD=12 N=10` **10/10 红**；
  修后双方各 `LOAD=12 N=10` **0/10**（验收方那档 loadavg 9.2→14.4 低于修前带，另有 `LOAD=20 N=6` **0/6** 落在修前 19–28 带里才是有效 A/B）。
  门禁 `npm run ci` 双方各一次 **exit 0**（99 files / 1837 tests、lint 0 errors / 36 warnings、`verify:lib` byte-identical 237 files）。
- **动过的文件：** `test/helpers.ts`（新增 `landedWithin`）、`test/phase1-dialogue.spec.ts`、`test/triage.spec.ts`；文档三件（本节所在的
  `HANDOFF.md`、`VALIDATION.md` 首条、`STATE.md` 顶部）与证据目录 `.rsi/evidence/flaky-triage-phase1/`。`src/`、`lib/`、`scripts/`、
  `vitest.config.ts`、`package.json` 一行未动 —— 所以**没有版本号、没有发版**。
- **再动这两条 spec 之前必须知道的四件事：**
  1. **缝是「开跑 vs 落地」。** `engine.startCalls.length === 2`、`vi.waitFor(() => agent.followups.length === n)` 都只说明轮**开始了**。
     要断言「前台会处理这条消息」或「报告已到」，等的是落地两半：报告在 `agent.followups` 里，**并且** `steeringForSession(sessionId)`
     已经返回 `undefined`。两个 spec 各有一个本地帮助函数（`landed` / `roundLanded`）就是这两半，别在用例里再手写「等开跑」。
  2. **`test/helpers.ts` 的 `landedWithin(condition, ms, what)` 是探针自己持钟**（`settledWithin` 的姊妹，`c1ebdf3`）：全程持一个 ref 住的
     timer、以 15 000 ms 为界、超界抛 `"<what> did not land within 15000 ms"`。**不要**把它换回 `vi.waitFor`（默认 1 000 ms 就是原来的病根），
     也不要抬 runner 的 `testTimeout`。
  3. **`test/triage.spec.ts` 里每个 `FakeAgent` 共用会话 id `sess-triage`**，而插话通道是按会话挂的 —— 一条用例结束时轮还没落地，
     它就会去插话**下一条用例**的消息。这次是让轮落地（draining）来修，**没有**把 id 拆开；拆 id 会把这种泄漏藏起来，要拆得先有产品语义上的理由。
  4. `triage.spec.ts` 的 `route()` 里还有一个 **5 000 ms 的「后台轮有没有起」判别窗**（vitest 时钟，故意没动）：它只决定这条消息走了哪条路，
     不是断言的那条缝。若哪天它在更狠的负载下误判，红法会是文本断言，而不是上面那条具名条件 —— 那时再动它。
- **缺口（照实写）：** Node 22 / Node 24 矩阵 `NOT_RUN`；真机 soak `NOT_RUN`，且因为 `src/` 未动它证明不了这个 diff；
  一次超过 15 000 ms 才落地的尾巴**没有归因**（自测机被自己的变异跑污染，loadavg 32），在 `VALIDATION.md` 里标为 `HYPOTHESIS`。
- **下一步：** 合入走 PR（`fix/flaky-triage-phase1` → `main`），合前 `npm run ci` 必须 exit 0；这批不需要发版 —— 它只改测试与记忆。

## 2026-11-24 — 0.13.29 备好发版：三处救援在同一条跑里都成立（合流 + 真机 soak 皆绿，待打 tag）

- **From:** 合流方（agent-116/merger） · **To:** 发版方 / 下一个接手者
- **本版发了什么**（逐条原文见 `CHANGELOG.md` 的 `## [0.13.29] - 2026-11-24`，三条都在同一个 `### Fixed / 修复` 下）：
  ① 规划腿不再因为一次格式错或一次传输死就退化成兜底——同次重交 + 换路重打（`PLANNER_LEG_CALLS = 3`，D-122）；
  ② 判定腿（verifier/supervisor）死于传输时在同一次 attempt 内补打这条腿一次，不重跑最贵的 worker（`judgeRetried`，D-123）；
  ③ 401/403 的密钥被拒带着服务商原话回到脚本、按真因写进报告，且仍然不进死路由表（D-124）。两处预算同时抬，对账见 D-125。
- **合流与门禁**：五次 `git merge --no-ff`（`34681ae` → `a8fd9ba` → `7287ee4` → `4193245` → `aebe65a`），随后一个
  `chore(release): prepare v0.13.29` 提交做版本、CHANGELOG、记忆与证据。版本被钉在**四处**，四处都要动：
  `package.json` + `package-lock.json`、`CHANGELOG.md`、`docs/LOCAL-TESTING.md` 的 tarball 名、以及设置页的
  `PLUGIN_VERSION`/`UPDATE_LATEST`（`src/client/index.js`，`lib/client.js` 随 `npm run build` 重建）——
  只改前两处会在 `docs-config-keys.spec.ts` 与 `update-entry.spec.ts` 上红（本轮实际发生过一次）。`npm run ci` **exit 0**：typecheck 干净、
  lint **0 errors / 36 warnings**（全既有）、`verify:lib` byte-identical（237 files）、vitest **99 files / 1837 tests**。
  合流 + 准备期间 `npm run ci` 共 12 次，其中 **6 次**红在挂死探针的 30 s 超时上（每次只红 1 条；`dead-routes.spec.ts > counts a call that hung …`、
  `planner-resubmit.spec.ts > keeps a recovered leg …`）。**这是既有抖动，不是本版引入**：把 `2141071`（已发的 0.13.28）
  整棵树解到 scratch 单跑同一个 `dead-routes.spec.ts`，**6/12 红**；HEAD 同一文件 **6/15 红**，红法相同。未改断言、未抬超时。
  **发版方注意**：远端 runner 若在这条上红，先 `gh run rerun --failed`（`v0.13.27` 就是这样红的），别为此动断言或 `testTimeout`；
  收窄这两条挂死探针（改成「按报告断言 + 有界等待」）是后续单独一刀，已记在 `VALIDATION.md`。
- **挂死探针已收（`c1ebdf3`，test-only，`src/`/`lib/` 一行未动）**：那两条偶发 30 s 超时的用例改成由探针自己持钟结算
  （`test/helpers.ts` 的 `settledWithin`，15 000 ms 具名失败；修前两文件连跑 4/10 红 → 修后 15 连绿 + 交付树 3 绿，
  预算仍由脚本结算）。机制、A/B 与缺口（Node 24、产品侧无 timer 路径均 `NOT_RUN`）见 `VALIDATION.md` 首条。
- **真机 soak**：三场景 PASS，证据 `.rsi/evidence/soak-release-01329/`（README、三份场景、网关日志与按路由计数、
  overlay、prompt、checkpoint、`lib-vis.diff`）。三条判据各自的那一行、以及全部缺口，见 `VALIDATION.md` 前两条。
- **上一版 handoff 留下、本轮仍未动的两件小事**：① 挂死轮的 soak 仍只证到「进表 + 排后」，「第 3 条任务起不打它」
  是在 503 轮上取到的，本轮的 503 端点没有演练；② `src/delivery/index.ts` 的 `machineLedger` 与 `report.renderReport`
  仍是两份并列诊断视图，`Dead routes` 只在后者。
- **本版的缺口（要主张就带上）**：`showDiagnostics` 硬关 → `judgeRetried`/`Dead routes` 在出厂构建里不渲染
  （flags 读自只改渲染的副本，主跑在未改动的构建上）；`maxRetries` 固定 1 → 只能说「每个 attempt 一次派发」；
  `grokDefault: off`；`wb/cn:deepseek-v4.1-flash` 整段 503，用 `wb/global:…` 同网关同密钥替代；未演练 503 降级、
  supervisor 侧补打、`[auth401, live]` 混合链。
- **分支与发版**：五条来源分支（`feat/planner-resubmit`、`feat/leg-retry`、`fix/forward-model-unavailable`、
  `docs/operator-tone`、`docs/foreman-autoupgrade`）已全部合入 `release/0.13.29`，按 §5 可在 24h 内删除；
  `release/0.13.29` 按 §7 五步走（本地 `ci` 已绿 → 打 `v0.13.29` → push `main` → push tag → 盯 Release），
  发完合并进 `main` 并删除。远端 CI/Release 的 run id 与发布结果要 push 之后才存在，落在随后的跟进 docs 提交里。

## 2026-11-24 — 401/403 也回灌给脚本，但不进死路由账（`CONFIRMED` 单测 + 门禁，真机 soak `NOT_RUN`）

- **From:** 实现子代理（agent-114/impl-forward-model-unavailable） · **To:** lead / 合流方
- **改了什么**（D-124）：分支 `fix/forward-model-unavailable`（worktree `.agents/worktrees/fix-forward-model-unavailable`，
  从 `main` `8f34701`＝0.13.28 开出）。密钥被拒这一类（`model-unavailable`，含 401/403、未知模型、`AUTH` 码）现在和
  四个传输族一样，由宿主 twin 在 `startActivation` 处拒绝回执、把 `CHILD_DEATH: model-unavailable: <子会话原话>`
  交给脚本；脚本按类写 `model-unavailable` + 服务商原话，**不再补交**（注定被同样拒绝），并照旧换路推进路由链。
  两侧各一张表：宿主 `src/child-outcomes.ts` 的 `CHILD_DEATH_FAMILIES`＝五族（转发面）；guest `src/script.ts`
  新增同名常量当回读闸门（五族）；`ROUTE_HEALTH_FAMILIES`（记账面）四族未动，所以 401/403 换路但**永远不进死路由账**。
- **验证**：基线 `npx vitest run test/dead-routes.spec.ts test/null-collapse.spec.ts` 2 files / 53 tests PASS；
  新断言在旧码上 **4 failed / 49 passed**（五族 `toEqual`、guest 表缺失、403 与 session-refusal 的 `rewritten` 各 6→0）→
  实现后 **53 passed**；`npm run ci` **exit 0（97 files / 1820 tests，typecheck 干净，lint 0 errors / 36 warnings 全既有，
  `verify:lib` byte-identical）**。证据 `.tmp/evidence-forward-model-unavailable/{red,green,ci}.txt`。
- **改写的旧断言**：`test/null-collapse.spec.ts` 三条（403 种子与 session-refusal 种子 `rewritten>0 → =0`；「台账是改写证据」
  那条改用 `cancelled` 种子），`test/dead-routes.spec.ts` 两条表钉子重写成「转发面 / 记账面」两条。逐条理由见 VALIDATION 首条。
- **留给合流方（按工单约定，本分支全部 `NOT_RUN`）**：
  1. **真机 soak 的坏 key 场景**：隔离 `DSH_HOME` 克隆 profile + 真端点 401/403，看报告里是不是 `model-unavailable`
     且 `no valid structured result` 出现 0 次、worker 只被派一次（不再补交）、并且 `Dead routes` 里**没有**这条路。
     同时跑一轮正常轮确认成功率不受影响。live `~/.dsh` 与线上实例不要碰。
  2. 提交与 `lib/`：本分支**没有 commit**（按工单留给调度）；`npm run ci` 内的 build 已把工作树 `lib/` 更新到与 `src/` 对应，
     提交时把 `src/` 与 `lib/` 一起提。
- **一个环境坑（留个记号）**：这个 worktree 的 `node_modules` 软链原本是悬空的（`../../../../node_modules` →
  不存在的 `/home/fish/projects_mine/node_modules`），`npx vitest` 靠 Node 向上查找照样能跑，但 `scripts/verify-lib.mjs`
  用绝对路径起 `tsc` 会报 `Cannot find module`，让 `npm run ci` 假红。已按兄弟 worktree 的约定改成绝对路径指向主 checkout 的
  `node_modules`（`node_modules/` 在 `.gitignore`，不进版本树）。以后开 worktree 建议直接钉绝对路径。

## 2026-11-24 — 判定腿同 attempt 补打（第二刀）：只交整块，真机 soak 交给合流方

- **From:** 调度 A（agent-113，两个干活子代理：机制 `/agent-113/judge-leg-mech`、预算 `/agent-113/judge-leg-budget`）
  · **To:** lead / 合流方
- **分支:** `feat/leg-retry`，worktree `.agents/worktrees/feat-leg-retry`，基线 `main` `8f34701`（0.13.28）。
  共享脏树 detached `a6103ad` 一行未动；规划腿 `feat/planner-resubmit`（另一 agent）未合、未碰；本刀**没有**复制规划腿的
  `avoid`/`spent` 路由回避机制，两刀在 `callRole` 上没有文本冲突面。
- **做了什么**（D-123）：判定腿（verifier/supervisor）死于传输时，同 attempt 只补打这条腿一次、保留 worker 结果；
  `judgeRetried: true` 标记 + 报告白名单；预算 `attemptBlock = 2×worker + 3×(verifier+supervisor)`、
  `callsPerAttempt` 同走法、`maxAttemptsPerTask` 600 → 1000；`test/judge-leg-retry.spec.ts` 新 8 例；
  `test/verifier-resubmit.spec.ts` 里钉「不补打」的旧用例翻成钉新契约（worker 每次尝试只打一次那条前提被显式断言）。
- **验证（`CONFIRMED`，命令与数字见 `VALIDATION.md` 首条）:** `npm run ci` exit 0（**98 files / 1828 tests**），
  `verify:lib` byte-identical（237 files），`lib/` 已一并提交；红证据在实现前留痕（新用例 5 failed、预算两钉 2 failed）。
- **没做的（明确留给合流方）:** ① **真机 soak**（隔离 `DSH_HOME` + 真模型跑一条真实 run，看两次判定调用是否真的救回判定、
  worker 是否真的没重跑）；② 未合 `main`、未发版、未打 tag、未 push；③ 未碰 live `~/.dsh`、未重启运行中实例。
- **合流方要一起改的两处旧文档（本刀已顺手改第一处）:** `docs/knowledge/WORKFLOW-DESIGN.md` 的预算公式已改成
  `(retries+1) × (2×|worker| + 3×(|verifier|+|supervisor|)) ≤ 1000`；`docs/knowledge/DECISIONS.md` 里 D-056 记的
  「`maxAttemptsPerTask` 400→600」是当年那条决定的**历史记录**，按惯例不改写历史，由 D-123 承接新值。
- **分支判定日期:** 合入后 24h 内删 `feat/leg-retry`（AGENTS.md §5）。
- **下一步:** 合流方先跑真机 soak，再决定与 `feat/planner-resubmit` 的合流顺序（两刀各自独立，谁先都不阻塞）；
  合完一起跑一次 `npm run ci` 与 `verify:lib`。

## 2026-11-24 — 立项A 第一刀：规划腿不再因为一次格式错或一次 503 直接降级（分支 `feat/planner-resubmit`）

- **From:** 规划腿子代理（agent-110） · **To:** lead（合流方）
- **基线 / 分支**：基线 `2141071`（0.13.28），分支 `feat/planner-resubmit`，worktree
  `.agents/worktrees/feat-planner-resubmit`；共享脏树 `a6103ad` 未动。
- **做了什么**（D-122）：规划腿三次问法的上限——① 首发；② 格式错（无结构化结果 / 计划过不了形状闸门）→ 同一次调用内
  **重交一次**，与 worker/verifier 同形，prompt 里带上被拒原因；③ 传输死（timeout/connection/server-error/rate-limit）→
  **换路重打一次**：`callRole` 新增 `avoid`，只去这一腿还没付过的路由；一条路都没剩且死因是拒绝时原路重打一次，挂死则
  不重等（一次挂死等待已经付过，见 D-120 的取舍）。两者各至多一次，都不花 retry。预算 `maxTotalAgentsFor` 的规划项改为
  `PLANNER_LEG_CALLS = 3` 次走链。
- **验证**：`test/planner-resubmit.spec.ts` 9 条真引擎形状用例（旧码 7 红 → 9 绿）；typecheck 干净、lint 0 errors/36 warnings
  全既有、`verify:lib` byte-identical、`npm run ci` 唯一红是既有抖动 `test/phase1-dialogue.spec.ts:612`（基线可复现）。
- **留给合流方**：① 真机 soak（隔离 `DSH_HOME`，一条假 503/挂死规划端点 + 一条真网关，看规划行是否 2 次、计划是
  `planner` 而不是 `fallback`）；② 判定腿（第二刀：verifier/supervisor 的换路重打）未动；③ `requestReplan`（波边界）
  没接这套走廊——它失败会保留原计划，不需要救回；④ 计划成功后的汇总 B 未动。

## 2026-11-24 — 0.13.28 已发；`v0.13.27` 只留标签（门禁在远端挂了一条时序断言）

- **From:** T4 返工子代理（agent-108） · **To:** lead / 下一个接手者
- **结果**：`v0.13.28` 已发布（tag `v0.13.28`，提交 `8f34701`；远端 `CI` `45292347165` success、
  `Release` `45292352796` success；asset `dsh-grok-workflow-0.13.28.tgz`）。
- **`v0.13.27` 为什么没发**：标签推上去之后远端门禁在新增的挂死用例上挂了——`deadRoutes` 出现 2 行（本地只有 1 行）。
  让挂死可观测的 1 秒子调用预算，在负载高的 runner 上「活路」也会输掉，于是整表 `toEqual` 变成了一条延迟断言。
  改法是收窄断言（只看挂死那条路：它的 `timeout` 行、它的 2 次调用、表翻之后不再有它），并临时把活路改成慢于预算复现了
  远端那条形状。已发布的标签不移动（`v0.11.14` 先例），所以同样改动随 0.13.28 发；README/CHANGELOG 都写明了。
- **留给下一个人的两件小事**：① 挂死轮的 soak 仍只证到「进表 + 排后」，「第 3 条任务起不打它」是在 503 轮上取到的
  （挂死轮几次都被外层模型塌成 1 条任务，且短预算下 planner 自己会超时→fallback）；要补就直接调 `grok_workflow` 指定 `tasks`，
  或用更长的 `childTimeoutMs`。② `src/delivery/index.ts` 的 `machineLedger` 与 `report.renderReport` 仍是两份并列诊断视图，
  `Dead routes` 只在后者（D-119 的范围），要对齐就一起改并补一条「两份一致」的用例。
- **分支**：`feat/dead-routes`（`.tmp/wt-dead-routes`）与 `release/0.13.27`（`.tmp/wt-rel-01327`）都已合入 `main`
  （`main` = `8f34701`）；两个 worktree 按指示保留，分支可在 24h 内删。

## 2026-11-24 — 0.13.27 返工：死路由的两条根因都堵上，真机 soak PASS（`CONFIRMED`）

- **From:** T4 返工子代理（agent-108） · **To:** lead / 下一个接手者
- **做了什么**（D-121）：在 `feat/dead-routes` 续作（`cd0c909`），合流 `release/0.13.27`（`78c1907`）：
  1. **记账不再读 `switchModel`**：`childTimeoutFailure()` 保持 `switchModel:false`、新增 `routeHealth:'timeout'`；
     `classifyCallFailure()` 按类给 `routeHealth`；`noteRouteFailure` 只认 `failure.routeHealth`（429 仍跟随勾选框，D-119 不变）。
  2. **死因回灌给脚本**：`src/team-engine.ts` 的 twin 在 `startActivation` 处把回执的 `result` 换成「四个传输族就拒绝」的
     promise，文本 `CHILD_DEATH: <class>: <子会话原话>`；`src/script.ts` 的 `childDeathCause()` 读回，于是**同一 run 后续调用**
     也绕开那条死路，报告行同时从「格式错」变成服务商原话。
  3. **补真引擎形状用例**：`test/dead-routes.spec.ts` 加 4 条走真引擎 + twin 的用例（503 死因进表、挂死进表、答完没交结构化
     不计数、密钥被拒不计数）与 2 条「两侧钉住」（marker + 族表）；`test/null-collapse.spec.ts` 的 timeout 种子改成
     「脚本自己已按类写、宿主无事可改」。
- **验证**：旧码上 3 红 → 修后 24 绿；`npm run ci` 在 `feat/dead-routes` 与合流后的 `release/0.13.27` 各 exit 0
  （97 files / 1820 tests，typecheck 干净，lint 0 errors/36 warnings 全既有，`verify:lib` byte-identical）。
  真机 soak（隔离 `DSH_HOME`，克隆 `headless`，假 503 端点 + 假挂死端点 + 本机网关，`maxConcurrency:1`）：503 轮 5/5 verified、
  死路由只吃 2 次调用、第 3~5 题一次不打它、台账 `server-error (2 in a row)`；挂死轮 `timeout (2 in a row)`。
  证据 `.rsi/evidence/soak-deadroutes-01327-fix/`。
- **留给下一个人的两件小事**：
  1. 挂死轮的 soak 只证明了「进表 + 排后」，没能在同一轮里演示「第 3 条任务起不打它」——因为外层模型那几轮都没传 `tasks`，
     而短 `childTimeout` 下 planner 自己也会超时→fallback 成 1 条任务。要补这一格，最省事的是把 `tasks` 由调用方写死
     （直接调 `grok_workflow`，不经外层模型），或用更长的 `childTimeoutMs` 让 planner 活下来。
  2. `src/delivery/index.ts` 的 `machineLedger` 与 `report.renderReport` 仍是两份并列诊断视图，`Dead routes` 只在后者里
     （按设计稿范围，D-119）。要对齐就一起改并补一条「两份一致」的用例。
- **分支处理**：`feat/dead-routes`（worktree `.tmp/wt-dead-routes`）已合入 `release/0.13.27`，与 `release/0.13.27`
  一起在 0.13.27 发版后可删；`release/0.13.27` 合入 `main` 后按 §5 在 24h 内删除。

## 2026-11-24 — 0.13.27 合流 soak 判 FAIL：死路由表在真机上是空表，发版停在合流点（`CONFIRMED` 门禁 + `CONFIRMED` 否证 / 生产路径 `NOT_RUN`）

- **From:** 合流发版子代理（agent-107） · **To:** lead / 下一个接手者
- **做到哪一步**：`release/0.13.27`（worktree `.tmp/wt-rel-01327`，从 `main` `5678dd8` 开出）合入 `feat/dead-routes`，
  合流点 `npm run ci` **exit 0（97 files / 1814 tests）**，合后 `npm run build` 后工作树干净（`lib/` 与 `src/` 逐字节一致）。
  **到此为止**：未 bump 版本、未改 CHANGELOG、未打 tag、未 push、未合 `main`；共享脏树 `a6103ad` 一行未动，live `~/.dsh` 零写入。
- **为什么停**：隔离真机 soak 否证了这次改动的卖点（细节见 VALIDATION 首条、证据 `.rsi/evidence/soak-deadroutes-01327/`）：
  一条 503 的假路由，在 5 任务的 run 里被打了 **5 次**（每次 6 个传输重试）；一条永不应答的假路由在 4 任务的 run 里
  被打了 **8 次**（每条任务两次尝试各一次）；两次的台账里都没有 `Dead routes` 段，`deadRoutes` 根本没生成。
- **根因一句话**：进表要"传输族 **且** `switchModel === true`"，而真机上 timeout 走 `childTimeoutFailure()`（`switchModel: false`）、
  5xx/断连/429 走"子代理死了 → `agent()` 返回 null → `format-error`"，两条都不满足条件 → 表永远是空的。
- **修法（按代价从小到大，任选其一但必须先落一条真机可证的路径）**：
  1. **最小且最快**：`childTimeoutFailure()` 改 `switchModel: true`（或加一个只给路由健康用的独立标记），让「挂死的那条路」真的会降级；
     这正好是 D-119 的原始动机（「一次子调用，外加一次完整的挂死等待」）。然后补一条**真引擎形状**的用例（子代理超时 → 表里有一行）。
  2. **补齐 5xx/断连/429**：让 guest 能看见子代理的死因。真机上原文在子会话 `turn/end`（`503: {"message":…,"code":503}`），
     宿主已经有 `src/child-outcomes.ts` 的台账和 `reclassifyNullCollapses`（它**已经会改写 `report.routes[]` 的 class**）——
     但那是 run 末尾的事，改变不了本轮后续调用。要么把这条信息通过引擎接缝回灌给 guest（最干净、也最大），
     要么在宿主侧把「无歧义塌陷」折算成「下一次调用用的降级名单」（需要持久到同 run 的跨调用状态，接口要另行设计）。
  3. **诚实的范围收缩**：只发 `taskId` 进报告行那一半（真机可见、单测覆盖），把死路由段落从 CHANGELOG 撤下，等下一条修好再发。
- **不要做的事**：别再拿 `maxInFlight: 1` 的 run 当证据 —— 那种配置下后几条任务不打死路由是因为**空道溢出**（台账写 `skipped full …`），
  与降级无关。要证明降级，死路由必须**不设并发上限**，然后数它挨了几下。
- **一个没解决的问题（不要误读成已修）**：headless profile 上 gate 内联路径（`grokDefault: on`）每个 worker 都死于
  `agent() could not start a child: Error: no subagent provider registered for "spawn"`，而同 profile 的 tool 路径能正常起子代理；
  用已安装 0.13.24 做对照则 gate 根本没接管。生产路径本轮 `NOT_RUN`，这条要么是 headless app 的接缝差异，要么是插件自己的
  twin engine 分支，需要单独一次调查（用 web profile 真机取证最直接）。
- **清理状态**：`.tmp/soak-01327/`（scratch home、两个假端点脚本、overlay、run 日志）已删；两个本地假端点进程已停；
  `release/0.13.27` 与 `feat/dead-routes` 两个 worktree 保留给返工（`.tmp/` 下，gitignored）。

## 2026-11-24 — 死路由 + task id 进报告行：单测到绿，真机留给合流方（`CONFIRMED` 单测 / `NOT_RUN` 真机）

- **From:** T4 实现子代理（agent-106） · **To:** lead / 合流方 / 下一个接手者
- **做了什么**：从 `main` `5678dd8`（0.13.26）开出 `feat/dead-routes`（worktree `.tmp/wt-dead-routes`），按设计稿
  §7 的顺序落地：
  1. `src/script.ts` guest：`ROUTE_HEALTH_LIMITS` / `ROUTE_HEALTH_FAMILIES` / `routeHealth` / `deadRoutes` /
     `noteRouteFailure` / `noteRouteSuccess` / `isDeadRoute`；失败与成功两处插行；`preferredIndices` 加第三档
     （死路由排最后，并且满载时优先落死路由而不是排队）；报告组装处快照 `deadRoutes`；
  2. 六个任务级调用点（worker、worker 补交、verifier、verifier 补交、supervisor、supervisor 补交）传 `taskId`，
     轨迹行多一个可选 `taskId`（planner / synthesizer 不传）；
  3. 宿主：`src/types.ts` 加 `DeadRouteEntry` 与 `WorkflowReport.deadRoutes?`、`RouteTrailEntry.taskId?`；
     `src/config.ts` 加 `HARD_LIMITS.deadRoute = { threshold: 2, routes: 16 }`（guest 侧按值镜像，用例钉住）；
     `src/report.ts` 解析校验回填 + `showDiagnostics` 下的 `Dead routes` 块；
  4. 交付层只登记标签（`LEDGER_LABELS` / `MIDLINE_LABELS` 加 `Dead routes`），台账块本身没有加（设计稿范围如此，
     理由记在 D-119）。
- **验证**：`npx vitest run test/dead-routes.spec.ts` 先红 12/18 → 后绿 18/18；旧的路由/报告/交付用例逐条重跑
  8 files / 178 tests PASS（没有一条断言需要改）；`npm test` 97 files / 1814 tests PASS；`npm run ci` exit 0 与
  `verify:lib` byte-identical 见 VALIDATION 首条的补记。
- **真机 `NOT_RUN`（这是本轮唯一没做的事）**：死路由的实际收益只能在真机上量（一条会挂死的路由每轮省下的是
  「任务数 − 2」次子调用等待）。合流方要做的一轮 soak：把一个 provider 指到会 5xx/超时的端点，跑 4 条以上任务的
  run，确认 ① 第 3 条任务起不再往那条路打电话；② 报告 `deadRoutes` 一行；③ `showDiagnostics` 打开时台账有
  `Dead routes` 段、关掉时答案里没有；④ 任务成功率不变。
- **下一轮可以做的一件事**：`src/delivery/index.ts` 的 `machineLedger` 与 `report.renderReport` 现在是两份并列的
  诊断视图，本轮只把新块加进了后者（按设计稿范围）。若合流方认为两份视图必须逐块对齐，把 `Dead routes` 块也加进
  `machineLedger` 是一处小改动，但要同时补一条「两份视图一致」的用例，否则下次还是会漂。
- **边界与卫生**：live `~/.dsh` 零写入、线上实例未动未重启；worktree 在 `.tmp/`（gitignored）内，`node_modules`
  是指向主仓 `node_modules` 的符号链接（`verify:lib` 需要根上有它）；分支合流后按 AGENTS §5 删除。

## 2026-11-24 — 0.13.26 发版：三处补齐 + 真机 soak PASS（`CONFIRMED`）

- **From:** T1 返工子代理 · **To:** lead / 下一个接手者
- **做了什么**：从 `release/0.13.26`（`60f6a96`，已含扁平 spec 修复）开出 `fix/t1-death-evidence`：
  1. `src/team-engine.ts` 的 `activationFacts()` 把「标题 + 路由」的读取收成一个纯函数并导出，
     `test/null-collapse.spec.ts` 用**两种 spec 形状**各钉一例（扁平是引擎真发的，嵌套是旧宿主镜像）；
  2. 新增 `src/child-evidence.ts`：折子会话的 `turn/end`（`reason.error` = 服务商的 `LlmFailure` 原样）
     与 `assistant/attempt` 的 `finish` 分片；`src/team-engine.ts` 在 activation 时抓住子会话对象
     （引擎在结算送达宿主前就 dispose 子代理），结算时读它的死因；`childFailureClass` 先看 `code`
     （`failureClassForCode`），再看文本表；取不到原文 → `CHILD_CAUSE_UNKNOWN`；
  3. `reclassifyNullCollapses` 增加按 task id 重建答案里「仍未完成」块的那一步（`repairAnswerNotes`）。
- **验证**：`npm run ci` exit 0（96 files / 1796 tests）；真机 soak 复跑 round 077 同一套（fork live web profile、
  两个实例 3196/3198、headless chromium + 原生 CDP 真点发送）→ **PASS**，证据 `.rsi/evidence/round-078/`。
- **关键的实测事实**（写进 D-118）：spawn 路径的 `SubagentResult` 确实没有 `diagnostic`；死因只在子会话日志里；
  真机运行栈 `dsh 0.2.2-rc.3-6b729fe`（引擎发**扁平** spec），而 `package.json` devDeps 仍钉 `0.2.1-rc.2`（发**嵌套** spec）——
  单测的假 seam 与运行时在两个方向上都会不一致，凡在 seam 上取证的改动都必须配真机 run。
- **发版已完成（2026-11-24 04:36）**：`v0.13.26` 已推并发布
  （<https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.26>，asset `dsh-grok-workflow-0.13.26.tgz`）；
  远端 CI `45260234450` success、Release `45260254869` success。`main` = `49e1045`。
  `fix/t1-death-evidence` 与 `release/0.13.26` 已合流并删除；`fix/null-collapse-t1` 按 lead 要求留着（其内容已合入）。
- **下一轮可以做的一件事（不是缺陷，是边界）**：合成器在**修复之前**写下的散文（例如
  「执行的一方在各种尝试下都没有交回可解析的成果」）仍然是旧口径——宿主只回写了报告事实块与台账，
  模型写的叙述句子回写不了。真机上它和修好的事实块并列出现（截图 round-078 `dead.png`），
  读者不至于被误导，但两句话并排读起来是矛盾的。要消掉它，得把死因的判定前移到脚本里
  （D-116 B2 那一类上游通道，或让脚本在写 `incomplete[].reason` 之前就拿到台账）。

- **未做/边界**：live `~/.dsh` 只读零写入，线上实例未动未重启；`.tmp/soak-t1/` 已删除；
  `release/0.13.26` 与 `fix/null-collapse-t1` 分支在合流后按 AGENTS §5 处理（本分支合流即删，旧 T1 分支留待 lead 决定）。

## 2026-11-24 — 0.13.26 发版中止：T1 修复真机不生效，等两处补齐再发（`CONFIRMED`）

- **From:** 合并发版子代理 · **To:** 下一轮接手者 / lead
- **做了什么**：`main`（`6b0eb62`=0.13.25）拉出 `release/0.13.26`（worktree `.tmp/wt-rel-0-13-26`），`--no-ff` 合入
  `fix/null-collapse-t1`（`82932bc`+`81e6b59`），无冲突。合流点 `npm run ci` exit 0（95 files / 1771 tests）。
- **为什么没发**：隔离真机 soak `FAIL`（证据 `.rsi/evidence/round-077/`）。正常路径 PASS；把 worker 路由换成被网关
  拒绝的 key 后，4 个子代理真的死于 `401 virtual key is required`，交付给用户的那段仍写
  `worker returned no valid structured result (structured output missing or unparsable)`——T1 要修的正是这句。
- **两个根因**（都在 `82932bc` 里，单测因 harness 用了不真实形状而全绿）：
  1. `src/team-engine.ts` 的 `promptTitle()`/`requestedRoute()` 读 `spec.request.prompt` / `spec.request.agentOptions`，
     已发布引擎发的是扁平 spec（`dsh-workflow-ptc/lib/index.js:330-346`：`prompt`/`agentOptions` 在顶层）→ 真机 role 为空、
     route 恒 `inherit` → 台账分组为空 → 回填一条不改。**已在 `release/0.13.26` 修好**：两个读法都保留、扁平优先，
     `test/engine-harness.ts` 改成发扁平形状，`test/null-collapse.spec.ts` 加一例钉住 role/attempt/route；`npm run ci`
     exit 0（95 files / 1772 tests）。修后真机 archive 兜底文案开始带死因（`… ended \`error\``）。
  2. spawn（in-process）子代理的 `SubagentResult` 只有 `{output, stopReason, structured}`，**没有 `diagnostic`**
     （`dsh-subagent/lib/index.js:1229-1250`；`diagnostic` 只由 external provider 产出）→ 真机拿不到「超时/鉴权」的原文，
     `childFailureClass` 只能给 `unknown`。**未修**：要么走 D-116 B2（让脚本/宿主看见子会话自己的 `turn/end` 事件，
     属上游改动），要么宿主侧读子会话事件。
  3. 附带未修：交付里「仍未完成（来自报告）」那行仍是旧文案——`report.incomplete[].reason` 与 `failure.reason` 不逐字
     相同，`repairText` 的 `includes()` 匹配不上。
- **下一步（按序）**：修 ② 与 ③ → `npm run ci` → 重跑同一套 soak（overlay 里 worker→`bifrost-badkey`，看交付是否
  说鉴权/超时）→ 才走 §7 五步。**CHANGELOG `[Unreleased]` 已按实测改口径**：「子代理死了不再写成格式错」成立，
  「超时报超时 / 密钥被拒报不可用」只在服务商提供 `diagnostic` 时成立。
- **未做**：未 bump 0.13.26、未打 tag、未推 `main`、未碰 live `~/.dsh`、未重启线上。



## 2026-11-24 — `fix/null-collapse-t1`：子代理死因回填（`CONFIRMED` 未合流，真机 soak `NOT_RUN`）

- **From:** T1 修复子代理 · **To:** 合流方 / 下一轮接手者
- **分支**：`fix/null-collapse-t1`，worktree `.agents/worktrees/fix-null-collapse-t1`，从 `main` `6b0eb62`（0.13.25）开出。
  共享脏树（detached `a6103ad` + 40 余处他人未提交改动）未动。
- **改了什么**：`src/child-outcomes.ts`（新，有界台账 + 分类 + 回填规则）、`src/team-engine.ts`（在既有
  `startActivation` 装饰器上记终态，新增 `childOutcomeLog`/`childOutcomeCause`）、`src/run.ts`（取 mark、报告
  校验后回填、归档接 `childCause`）、`src/report.ts` + `src/types.ts`（`cancelled` 成为合法失败类）、
  `src/script.ts`（guest `classifyFailureText` 加 401/403/forbidden 一条）、`src/memory/recorder.ts`（兜底文案带死因）、
  `test/null-collapse.spec.ts`（新，19 例）+ `test/engine-harness.ts`（`ChildAnswer` 支持 `diagnostic`）。
- **门禁**：`npm run ci` exit 0（95 files / 1771 tests）；`lib/` 与 `src/` 同一提交。
- **合流方要做的**：
  1. 真机隔离 soak（用户视角，fork 在用 profile，绝不碰 live）：至少跑到一次「某个子代理死掉」的 run，
     确认交付的答案与台账里那句原因说的是 timeout/鉴权而不是「没交结构化结果」。本分支 `NOT_RUN` 的原因就是这一条。
  2. 合流冲突预判：`docs/knowledge/{STATE,VALIDATION,DECISIONS,HANDOFF,RESEARCH}.md` 与 `CHANGELOG.md`
     各留两边；`lib/*` 由 `npm run build` 重建后取 ours 再重建。
- **别顺手改的**：`gate.ts` / `captain*` / `answer.ts` / delivery 拼装属其他 lane；`report.ts` 只动了失败类白名单
  一个词。`src/script.ts` 只加了一条正则。
- **仍然成立的老问题**：403/超时子代理还会花掉一次同次尝试补交（脚本看不见死因）。要彻底解决见
  `DECISIONS.md` D-116 的 B1/B2/B3——**本轮只登记备选，没有实现**。

## 2026-11-24 — 已发版 `0.13.25`：判定角色补交 + 最终答案重写 + 派发心跳规则（`CONFIRMED`）

- **From:** 合并发版子代理（本会话）· **To:** 下一轮接手者
- **发了什么**：prepare `dafda5c` 已推，annotated tag `v0.13.25` 已推；远端 Release run `45238308272` success，
  GitHub Release `v0.13.25` 已发布（https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.25）。
  本地 `npm run ci` exit 0：94 files / 1752 tests、typecheck 干净、lint 0 errors、`verify:lib` byte-identical。
  CI on main `45238299713` Node 22/24 双绿。
- **合流**：`release/0.13.25` 从 `main` `7f626f5` 开出，`--no-ff` 三路——`fix/verifier-supervisor-resubmit`
  `f5b74e4`+`73c9067`、`fix/final-answer-rewrite` `4393514`、`docs/heartbeat-ledger`（rebase 到 main 后 `be88c36`）。
  `src/script.ts` **自动合并**且两边功能都在；冲突只在 `CHANGELOG.md`/三份记忆档（两边都留）与两张 `lib` 源映射
  （取 ours 后重建）。合流后 `lib/` 由 `npm run build` 重建，随 prepare 提交一起进。
- **真机 soak（用户视角）**：fork 在用 web profile（`scripts/clone-profile.mjs`，parity 5/5、凭据按设计脱敏），
  构建产物装进 fork 的 `node_modules/dsh-grok-workflow`，独立 `DSH_HOME` + 独立 `HOME`，监听 `127.0.0.1:3185/3186`，
  headless Chromium + 原生 CDP 在 GUI 里发消息。三件事得到用户视角证据：①答案是人话（单语、无台账标签）；
  ②**交付物路径写对了**（`…/work1/hello.md`，并说清两种打开方式）——这条是分支里唯一没有离线证据的 HYPOTHESIS，
  本轮变成 CONFIRMED；③透明代理（`127.0.0.1:18099` → 真网关）记录到 verifier 请求命中新提示词的
  `quoteRule` 与答案侧 `rewritePreamble`，说明契约在真模型请求里生效。见 `.rsi/evidence/round-076/soak.txt`。
- **没覆盖（诚实记）**：判定角色补交在真机上的**自然触发** `NOT_RUN`——三轮 soak 的判定都一次解析成功，没赶上
  没转义双引号的运气；试过写故障注入（改 verifier 首个流式 tool_call 的参数），但 verifier 是「多轮工具调用」的
  子代理（一次调用里先跑 478 次 `bash`），结构化结论落在更后面的 HTTP 轮次，注入窗口没能在本轮窗口内可靠命中。
  该分支的证据仍取单测 8 例（红 7 → 绿 8）。
- **分支收尾**：`fix/verifier-supervisor-resubmit`、`fix/final-answer-rewrite`、`docs/heartbeat-ledger`、
  `release/0.13.25` 四个 worktree 与三个分支已删（`be88c36` 是 rebase 后的新 HEAD，旧 `4231c00` 已作废）。
  仍在的旧 worktree（`rsi/*`、`team-dispatch-v1`、`fix-progress-task-number-first`、`feat/live-steering`）不属本轮，未动。
- **共享主工作树提醒**：`/home/fish/projects_mine/dsh-grok-workflow` 仍是 **detached `a6103ad`（0.13.14）且带 40+ 处
  未提交改动**（相对 `main` 差 380 文件）。本轮全程在 `.agents/worktrees/release-01325` 里做，没碰过它；下一轮
  若要用共享树，先决定那些改动是丢弃还是另立分支，别直接在上面切分支。

## 2026-11-24 — round-075 分支 `fix/verifier-supervisor-resubmit`：判定角色同次尝试补交（未合流，`CONFIRMED`）

- **From:** 修复子代理B1 · **To:** lead / 合流者
- **分支与基线**：`.agents/worktrees/fix-verifier-supervisor-resubmit`（分支 `fix/verifier-supervisor-resubmit`，
  从 `main` `7f626f5`/0.13.24 开出）。共享工作树当时 detached `a6103ad` 且带他人 40+ 处未提交改动，**未动**。
- **改了什么（只 `src/script.ts` + 测试/文档）**：新增 `verifierResubmitPrompt()`、`supervisorResubmitPrompt()`、
  `verificationFailure()`；`runTaskUnsafe` 里给 verifier/supervisor 各加一段「同次尝试内补交一次」（镜像 worker
  的 `resubmitPrompt` 分支：仅在 `format-error` 且非 setup 时触发，一次为限，失败保留原失败）；`verifierPrompt` /
  `supervisorPrompt` 加「英文双引号写「」或单引号、每条证据/发现 800 字内」；`VERIFICATION_SCHEMA` 的
  `evidence`/`finding` 加同名软上限 `description`；`callRole` 的 `null` 分支 reason 改为
  `"<role> returned no valid structured result (structured output missing or unparsable)"`；
  `classifyFailureText` 补 `structured_output` 与 `Expected ','` / `Expected '}'` 等 JSON 解析模式；
  `maxTotalAgentsFor` 的每尝试块按 ×2 计（首次调用 + 补交各一次整链），否则补交会撞 `AGENT_CAP`。
  **没碰** `src/gate.ts` 队长块、`src/delivery*` / 答案面（属另一 lane）。
- **口径变动（会影响测试）**：`maxTotalAgentsFor` 变大——`test/routing.spec.ts` 的上限算术改为
  `1 + 2*(2*2) + 2` / `1 + 0 + 2*(2*3) + 2`；`test/engine-contract.spec.ts` 的 `maxTotalAgents: 7`
  改为 `taskCap()`（按插件自己的构造器推导，避免下次再留死数字）。
- **验证**：红 `7 failed / 1 passed`（旧脚本，证据 `.rsi/evidence/round-075/red-verifier-resubmit.txt`）→
  绿 `8 passed`；`npm run ci` **exit 0：93 files / 1737 tests PASS、typecheck 干净、lint 0 errors / 35 warnings
  （全部既有）、`verify:lib` byte-identical（229 files）**。提交 `f5b74e4`（`src/script.ts` + `lib/` + 两个 spec +
  CHANGELOG + 三份记忆档），**仅本地分支，未推远端**（等 lead 合流；推或不推都不影响 tag/发版）。
- **未做**：真机隔离 soak `NOT_RUN`（本轮不发布）；未改 `docs/ARCHITECTURE.md` 的上限描述（公式仍是同一构造器，
  只是每尝试块 ×2）。合流时若要保守，可只取 `script.ts` + 两个 spec 改动，`maxTotalAgentsFor` 的 ×2 与
  `routing.spec`/`engine-contract.spec` 必须同进同出。

## 2026-11-24 — round-075 分支 `fix/final-answer-rewrite`：最终答案改成「给料 + 重写」（未合流，`CONFIRMED`）

- **From:** 修复子代理B2（最终答案 AI 重写）· **To:** lead / 合流者
- **分支与基线**：`.agents/worktrees/fix-answer-rewrite`（分支 `fix/final-answer-rewrite`，从 `main` `7f626f5` 开出）。
  共享工作树当时是 detached `a6103ad` 且脏，本分支一行未碰共享树；`script.ts` 的 verifier/supervisor 重试与
  `gate.ts` 按分工**未动**。
- **改了哪些函数**（便于 review 定位）：
  - `src/answer.ts`：新增 `REWRITE_PREAMBLE`（删掉旧 `SUCCESS_PREAMBLE`）；`relayText()` 默认走改写、
    `bilingual: false`；模块文档与 `RelayOptions.lang` 注释同步。
  - `src/delivery/index.ts`：新增 `MAX_ANSWER_LEAD_CHARS` / `MAX_DELIVERABLES` / `MAX_DELIVERABLE_CHARS` /
    `KEEP_TOKEN`(+`_END`) / `LEAD_HEADING` / `deliverablesOf()` / `dedupePieces()` / `joinProse()` /
    `boundParagraph()`；`answerLead()` 改成整段 summary；`stripMachineDetail(line, keep)` 加交付物例外；
    `composeBlock(lines, keep)`；`composeHumanParts()` 完成态也发「做成了：」并新增「交付物：」行。
  - `src/script.ts`：新增 `SYNTHESIS_NARRATIVE_CHARS`(700) / `SYNTHESIS_NARRATIVE_WORDS`(300) /
    `CAVEAT_SECTION` / `hasCaveatSection()`；`synthesizerHardRules()`、`synthesizerPrompt()`、
    `layeredPolishPrompt()` 改成三段 + caveat 重写；`polishStyleVerdict()` 放宽字数；
    `layeredNotesBlock()` 不再贴 uncertainties；`summaryCoverage()` 的 `uncertaintyProbes` → `needsCaveats`；
    `checkSummaryDraft()` / `verifySummaryDraft()` 换成「必须有 caveat 段」。
- **测试**：新增 `test/final-answer-rewrite.spec.ts` 15 例（先红 9 失败 → 后绿；后 2 例是实样复核抓到的路径缺陷），覆盖默认改写 / 整段 summary /
  交付物例外 / 完成态做成了 / 4 条 caveat 上界 / 单语 / 失败仍逐字 / 三段被接受 / 缺注意段被打回。
  另 13 例旧用例按新契约改了期望（逐条清单见 `VALIDATION.md` 首条），无一是「放宽」：单语、成功态改写、
  附注不再复制 caveat 都是本轮明写的契约变更。
- **复核抓到的东西（值得记）**：`answerLead` 曾先拆句再拼回，拆句点在 `weekly-report.md` 的 `.` 上，拼回成了
  `weekly-report. md` → 交付物路径不再等于 keep-list → 被机器细节吃掉，读者看到「打开 md 就能看」。改法是
  **按行（段落）处理、不拆句**，并锁 2 例回归。这条只有真渲染一遍才看得见，单测原本不覆盖。
- **验证**：`npx vitest run` → **93 files / 1744 tests PASS**；`npx tsc -p tsconfig.json --noEmit` exit 0；
  `npx oxlint src test` 0 errors（35 warnings 全为既有）；`npm run build` + `npm run verify:lib` byte-identical
  （229 files），`lib/` 随分支提交。**真机 soak `NOT_RUN`**（留给合流方统一做：fork web profile + 独立 `DSH_HOME`）。
- **合流注意**：① 本文件与 `STATE.md`/`VALIDATION.md`/`DECISIONS.md` 的编号（round-075 / D-115）若与同批
  其他子代理撞号，按到达顺序重排即可；② `test/synthesis-guardrails.spec.ts` 与 `test/human-output-contract.spec.ts`
  的期望值已变，合流时以本分支为准，别把旧断言合回来；③ 真机第一件事应验证"模型是不是真的按原问题重写、
  有没有把交付物路径读对"——这是本轮唯一没有离线证据的部分（HYPOTHESIS）。

## 2026-11-24 — 已发版 `0.13.24`：队长拆法绑定 + 首轮可见 + 确认单次消费（`CONFIRMED`）

- **From:** 合并发版子代理（本会话）· **To:** 下一轮接手者
- **发了什么**：prepare `b1fead6` 已推，annotated tag `v0.13.24`（对象 `6d5a88b`）已推；远端 Release run
  `45223728613` success，GitHub Release `v0.13.24` 已发布。本地 `npm run ci` exit 0：92 files / 1729 tests、
  typecheck 干净、lint 0 errors、`verify:lib` byte-identical（229 files）。
- **合流**：`release/0.13.24` 从 `main` `63cc1db` 开出，`--no-ff` 三路——`fix/captain-approve` `00fc203`、
  `fix/gate-route-msgvis` `f831fca`、`docs/user-soak-fork-profile` `57eadb9`。冲突 5 处，两边功能都留
  （细节见 VALIDATION 0.13.24 表首行与两个 merge commit 的 message）：`preview` 存在 `CaptainPending.ask` 里，
  `askCaptain(...)` 多一个 `preview` 参数并继续做 B04 承接，审批三条路都调 `approvedRequest`。
- **真机 soak（用户视角）**：按新 AGENTS §3 规则 fork 在用 web profile（`scripts/clone-profile.mjs`，5/5 parity、
  凭据按设计脱敏），把**构建产物**装进 fork 的 `node_modules/dsh-grok-workflow`，独立 `DSH_HOME` + 独立 `HOME`，
  监听 `127.0.0.1:3183`，headless Chromium + CDP 当用户点：队长确认与首轮可见都在 GUI 里实测通过。
  见 `.rsi/evidence/round-074/soak.txt`。live `~/.dsh` 与线上 3080 实例全程只读/未触碰。
- **发版后补的修**：`e767ba6`（仅 test）——`test/captain-confirm.spec.ts` 加 `afterEach(closeAllSteering())`。
  远端 CI on main 第一次跑（`45223718435`）Node 22 红 2 例，根因是模块级通道注册表跨用例泄漏（不是产品缺陷，
  同一提交的 Release 门禁绿）；本地 Node 22/26 隔离跑 3/3 全绿，只有 2 vCPU runner 才复现。
- **已知边界（未修，记在这里）**：`answerOnChannel` 把「通道存在」当成「本轮还在跑」；轮次刚结算到 `finally` 收尾之间
  的那一瞬，用户消息会被回执成「并入了正在跑的这一轮」并靠 carry 进入下一轮。生产里窗口极短、要求不会丢，
  但要更准确就得让 gate 同时看 `state.active`（当时判断：改产品语义的风险高于收益，先记为待办）。
- **分支收尾**：`fix/captain-approve`、`fix/gate-route-msgvis`、`docs/user-soak-fork-profile`、`release/0.13.24`
  四个 worktree 与其分支已删；另外清掉了 0.13.23 遗留、停在 `main` 上的 `.agents/worktrees/fix-synth-resubmit`（干净树）。
  仍在的旧 worktree（`rsi/*`、`team-dispatch-v1`、`fix-progress-task-number-first`、`feat/live-steering`、
  `docs/heartbeat-ledger`）不属本轮，未动。

## 2026-11-24 — round-073 分支 `fix/gate-route-msgvis`：首轮可见 + 队长确认一次性消费（未合流，`CONFIRMED`）

- **From:** 修复子代理B（gate 路由 + 消息可见）· **To:** lead / 合流者
- **分支与基线**：`.agents/worktrees/fix-gate-msgvis`（分支 `fix/gate-route-msgvis`，从 `63cc1db`/0.13.23 开出）。
  共享工作树当时是 detached `a6103ad`（0.13.14，**没有** `src/captain.ts`），且 `main` 已被
  `.agents/worktrees/fix-synth-resubmit` 占用——所以**没有**在共享树切分支，也没碰任何人的未提交改动。
- **改了什么（只 `src/gate.ts`）**：新增 `CaptainPending` 类型、`askCaptain()`（一问一答 + B04 携带）、
  `surfaceHasNoHead()`、`answerBehindUnpublished()`；改 `takeCaptainPending` 返回类型、`produceAnswer`
  （确认由参数传入，`full` 分支也认确认）、`answerOnChannel`（拆法确认让路）、`answerTeamInteractive`
  （TTL + 先排队后记账）、`answerFullBehind`（`full` 形状的确认：批准派原请求、过期/非回答回作废文案）、
  `answerInTurn`（统一一次 `takeCaptainPending` + 首轮可见路径）。**没碰 `src/captain.ts`、`src/command.ts`。**
- **行为改动（会影响测试口径）**：`mode:full`（部署级或会话级）＋可后台投递的交互会话，**首轮**不再
  阻塞在轮内，改为「原话立刻可见 + 结论下一轮投递」。为此 `test/gate.spec.ts`、`test/phase1-dialogue.spec.ts`
  里钉「首轮阻塞/预发布」的用例改用「已有宿主 head 的会话」夹具（`headed()`，含 `step/end`），首轮新契约由
  `gate.spec.ts` 的 P0-5 用例与 `grok-on-ingress.spec.ts` 的新用例单独钉住。
- **验证**：`npm run ci` exit 0（92 files / 1722 tests；`typecheck`/`lint`/`verify:lib` 全过，`lib/` 随提交）。
  新用例对旧码红：`test/captain-confirm.spec.ts` 3 条、`test/channel.spec.ts` 1 条、
  `test/grok-on-ingress.spec.ts` 1 条（证据 `.rsi/evidence/round-073/red-gate-route-msgvis.txt`）。
- **顺手修的既有竞态**：`test/channel.spec.ts` A4 在旧码上 3 次红 1 次（`steeringForSession` 断言抢在
  下一轮频道关闭之前）；改为等频道关闭。不是本次行为改动引起。
- **没做/建议（交给 lead 判）**：①`/grok on` 的产品语义未动——它写 `workflowMode:'full'`，而部署级
  `mode:full` 根本不问队长；线上 profile 是 `mode:full + grokDefault:on`，所以「队长确认」这条路在该
  profile 下永远不会走到。要不要让部署级 `full` 也问一次确认，是产品决策，不是本次修复范围。②真机
  隔离 soak `NOT_RUN`（本轮不发布）。③`pendingCaptains` 仍是进程内 Map，重启即失忆（与前台 pending 同构）。
- **合流提示**：`src/gate.ts` 与 `test/{gate,phase1-dialogue,channel,captain-confirm,grok-on-ingress,
  objective-limit,reliability}.spec.ts` + `lib/**` + `CHANGELOG.md` 的 `[Unreleased]` 一起合；合流后
  建议重跑 `npm run ci` 与一次隔离真机 soak（首轮可见 + 确认过期这两条各看一眼）。

## 2026-11-23 — 已发版 `0.13.23`：五路合流（保命 1/2/3 + 体验档 5 条 + 队长三件套）+ 隔离真机 soak PASS（`CONFIRMED`）

- **From:** 合并+验证+发版子代理（merge-release）· **To:** lead / 下一轮接手者
- **合流顺序（`--no-ff`，每合一路跑相关 spec）**：`fix/lifeline3-resume-scan`（仅 test，+4 用例）
  → `fix/dispose-drain`（`src/{run,config,guardian,index,records,checkpoint/wiring}.ts` + `test/unload-drain.spec.ts`）
  → `fix/checkpoint-lifeline-tasks`（`src/checkpoint/wiring.ts` 观察行）→ `feat/exp-pack-070`（体验档）
  → `captain-pack`（队长三件套）。五路原本都未提交，先各自提交（`baafd25`/`a3a41fb`/`92f5506`/`e776057`/`5c9aa06`）再合。
- **冲突处理（以「功能都要保留」为原则）**：3 处需人判——
  ① `src/checkpoint/wiring.ts`：`noteAgent` 同时维护「观察行」(`children`) 与「在飞行表」(`live`)，
  `snapshot()` 的 `agents` 走观察行（无报告时）并叠加 `...liveInFlight()`；
  ② `src/memory/recorder.ts`：归档轮次写完后既 `supersedeEarlierRound()` 又 `appendCaptainExperience()`；
  ③ 另有 5 处 `lib/**/*.map`：取 ours 后 `npm run build` 重建（提交的 `lib/` 与 `src/` 一致由 `verify:lib` 证明）。
- **合流时发现并修的载荷形状偏差**：exp-pack 的 `noteAgent` 从 `workflow/agent-start` 第一参数读
  `seq/label/phase/childId`，真实 payload 在第二参数（`WorkflowAgentInfo`）。合并后统一读第二参数，
  该 spec 的替身改成真实两参数形状；断言不变。**这是「在飞子代理」在生产里能否真生效的关键**，
  只跑单路测试不会暴露（单路测试跟着错形状写）。
- **soak 抓出的文案缺陷（已修，`2e52498`）**：0 任务被说成「已经做完 0 项，没有剩下的」（读着像全部做完），
  英文三段无分隔（`…manual stop.All 1 item(s)…`）。`stopNarration` 现在三态（total=0 / left=0 / 其它）+ 分隔符，
  补 2 条用例（`test/experience-pack.spec.ts`）。
- **门禁**：`npm run ci` exit 0（92 文件 / 1717 测试；`verify:lib` 在 `c4eaffa` byte-identical，229 文件）。
- **发版**：`c4eaffa` → push main → tag `v0.13.23` → push tag → Release run `45202988977` **success**
  → Release `v0.13.23` 已发布（asset `dsh-grok-workflow-0.13.23.tgz`，860889 bytes，sha256 `ed7a7e55…`）。
- **已知缺口（下轮可做）**：确认轮的拆法预览是独立轻调用，正式跑仍重新规划（两次规划）；
  用户画像只能显式写入、不从对话蒸馏；`dsh` 的 session journal 是**多帧 zstd**，
  `zstdDecompressSync` 只解第一帧（本轮探针按帧魔数切分才读出 47 事件）——以后写 session 阅读器要记住这点。
- **临时物清理**：五个分支 worktree 与分支已删（见 `docs/knowledge/VALIDATION.md` 0.13.23 表末行）。

## 2026-11-23 — round-071 队长三件套：同分支落地、未提交（`CONFIRMED`）

- **From:** 队长三件套子代理（captain-pack）· **To:** lead / 下一轮接手者
- **任务口径**：只做三件（拆排、前台化、三叠纸），门卫/检查/台账不动；不碰保命/体验档；不提交不推送。
  基线：main `cda5d4e`（0.13.22 已发版）；工作树 `.agents/worktrees/captain-pack`（分支 `captain-pack`）。
- **改了什么（源码）**：`src/script.ts`（planner 宪章、`onFailure`、`captainStopResult`、`runWaves` 停、
  replan 提示词、`args.captain` 与 `boundedCaptain`）、`src/gate.ts`（`pendingCaptains`、两条路径的确认轮、
  `deps.captainBrief`、runTeam 传 brief）、`src/run.ts`（`captainBrief` 入参）、
  `src/memory/recorder.ts`（每轮一条复盘）、`src/memory/cli.ts`（四个新命令）、
  新文件 `src/captain.ts`（确认语义/预览/改法/文案，纯函数）与 `src/captain-memory.ts`（三叠纸读写，永不抛）。
- **验证（本人执行）**：`npm run build` exit 0；`npm run ci` exit 0（90 文件 / 1678 测试 PASS）；
  三件各自红/绿见 `.rsi/evidence/round-071/`（red-cutA/red-cutB/red-cutC 与对应 green）。
  改旧行为处：`test/triage.spec.ts` 两条团队档用例、`test/gate-partial-head.spec.ts` 的 `deliver`
  助手、`test/channel.spec.ts` 的跑中插话用例——都只是先补一步「确认」，断言未放宽。
- **没做/已知缺口**：确认轮的拆法预览是独立轻调用，正式跑仍由脚本内 planner 重新规划（两次规划）；
  用户画像目前只能由操作者用记忆 CLI 显式写入，不从对话自动蒸馏；真机隔离 soak `NOT_RUN`（本轮不发布）。
  `npm run verify:lib` 以 HEAD 为输入（`git archive HEAD`），**不覆盖未提交工作树**；
  合并提交前请重跑 `npm run build` 并连同 `lib/` 一起提交（新增 `lib/captain*.js` 四个文件已在工作树生成）。
- **下一步（若 lead 决定合流）**：在 main 系工作树复核 diff → `npm run ci` → 连 `lib/` 一起提交 →
  按需补一次隔离真机 soak（确认轮 + 停 + 三叠纸各看一眼）→ 再决定是否记进 `[Unreleased]` 发版。

## 2026-11-23 — 已发版 `0.13.22`：composer 工作流开关又能打开（`CONFIRMED`）

- **From:** 修复+验证+发版子代理（agent-83）· **To:** lead / 下一轮接手者
- **用户现象**：工具行 workflow 总开关红字「模式服务没有回应：cannot get property sessions without inject」，开关打不开；
  loop 开关正常（它只读已注入的 `webServer` / `connection`）。
- **根因（诊断子代理亲验）**：`src/mode-surface.ts` `serviceOf()` 用属性读取 `source[name]`；
  这条路由故意只注入 `webServer` + `connection`，`sessions` 每请求再解析（让晚挂载的仓库也能应答）。
  真 cordis 上下文对**未注入**服务的属性读取是**抛错**而非返回 undefined，
  throw 在 `?? serviceOf(ctx,'sessions')` 与 `get(name)` 兜底之前逃出，被 `handleModeRoute` 兜成
  `500 mode/internal`，客户端渲染成红字。
- **为什么测试没抓住**：`test/mode-surface.spec.ts` 里 inject/ctx 替身是**普通对象字面量**，
  属性读取永不抛错，于是「直接读成功」这条在生产必炸的路径在测试里一路绿灯；
  soak 也从未覆盖 mode 路由（此前只覆盖 workflow 全链路），所以真机也没暴露。
- **修法**：`serviceOf()` 直读包 `try/catch`，抛错时落 `source.get(name)`（`get` 不受 inject 守卫），
  与 `src/settings.ts:83-91` `serviceOf` / `src/team-engine.ts` `resolveService` 同构；`??` 链原样保留；
  注释写明 isolate-guarded 及「为什么这是预期结果而不是故障」。
- **回归**：`test/mode-surface.spec.ts` 的挂载用例换替身为**真 cordis 行为**（未注入名属性读抛
  `cannot get property "<name>" without inject`、已注入名返回服务、`get(name)` 不受守卫），
  并断言 POST `status` / POST `set` 都 200、`enabled` 双向翻转、无 `mode/internal`。红绿：旧码 500（红）→ 新码 200（绿）。
- **门禁**：`npm run ci` exit 0（87 文件 / 1656 测试 PASS；`verify:lib` byte-identical，221 文件）。
- **真机隔离 soak PASS**：scratch `DSH_HOME`（只读拷贝 `profiles/headless`）、本机网关 `127.0.0.1:18088`、
  路由 `bifrost-completions` / `wb/cn:deepseek-v4.1-flash`；双任务 workflow `status completed · verified 2/2 · confirmed 10`，
  落盘 `one/alpha.txt`（8B，sha `e583bee0…`）+ `two/beta.txt`（7B，sha `57da01d5…`）逐字节符合；
  路由级用带守卫假 context 驱动构建产物 `lib/mode-surface.js`：status/set 全 200、enabled 双向翻转、无 `mode/internal`。
  证据 `.rsi/evidence/round-066/soak.txt`（脱敏：只有模型名，无 key 值；scratch 已删，live `~/.dsh` 只读）。
- **发版**：prepare `192eaac` → main 系合流 `83f4622` → push main → tag `v0.13.22` → push tag；
  远端 Release run `45180352802` **success**；Release `v0.13.22` 已发布（asset `dsh-grok-workflow-0.13.22.tgz`）。
- **清理**：发版 worktree `rsi-fix-mode-switch` 与分支 `rsi/fix-mode-switch` 已删；main 系干净。

## 2026-11-23 — 已发版 `0.13.21`：18 条修复 + 隔离真机 soak PASS（`CONFIRMED`）

- **From:** 发版子代理（agent-81）· **To:** lead / 下一轮接手者
- **做了什么**：发版 worktree（`rsi/release-0.13.21`，基 `9047f72`）`npm run ci` 先绿后红再绿——
  红因是 bump 脚本没同步 `src/client/index.js` 双常量（`test/update-entry.spec.ts` 期望与 `package.json` 一致）；
  按既往发版惯例（`f228484`）同步双常量到 0.13.21 + 重建 `lib/client.js` 后 `npm run ci` exit 0
  （87/1656）。`CHANGELOG [Unreleased]` 18 条搬到 `## [0.13.21]`（日期 2026-11-23）。
- **发版**：prepare `8ff7f82` → main 系合流 `26b800d` → push main → tag `v0.13.21` → push tag；
  远端 Release run `45173971212` success，Release 已发布（asset `dsh-grok-workflow-0.13.21.tgz`）。
- **真机**：隔离 soak PASS（独立 profile 全链路实跑，四段 completed，report COMPLETED，双文件字节/sha 精确；
  证据 `.agents/worktrees/rsi-soak-65/.rsi/evidence/round-065/soak.txt` §5+§9）。
- **记忆**：本 HANDOFF / STATE / VALIDATION 同批次更新，另起 commit push。
- **清理**：发版 worktree 与分支待删（24h 内）。
- **下轮**：`[Unreleased]` 已空；新修复照常攒条待下版。

## 2026-11-23 — round-64 已合流 main 未发版：降级跑完全验自报（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：部分完成但全验过说「0 项没做成」，读着像全过了（11 个面扫完命中的唯一真 bug）。
  全验专属尾巴点名降级；+1 降级回归 + 2/3 原句逐字 pin；`npm run ci` exit 0（87/1656）；
  lead 独立红绿复验成立。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-64`（`e0ca9ca`）已 `--no-ff` 合入 main 系 worktree（合流 `084ce76`）；
  `rsi/round-64` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 18 条待发。
- **下轮**：开新找 bug 面。
  网关恢复后给 round-47~64 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-63 已合流 main 未发版：插件标记单一定位（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：三处硬编码标记字符串各自为政，改名即散伙。全改引已有常量（import 图亲验无环）；
  +1 钉死字面量回归；`npm run ci` exit 0（87/1655）；lead 独立验 grep + 全量门禁。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-63`（`d745573`）已 `--no-ff` 合入 main 系 worktree（合流 `895fb00`）；
  `rsi/round-63` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 17 条待发。
- **下轮**：开新找 bug 面。
  网关恢复后给 round-47~63 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-62 已合流 main 未发版：摘要轮内丢行自报（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：摘要只有整轮被丢才点名，轮内被吞的行悄悄没了（9 行剩 4 行无标记）。
  每轮末尾自报吞了几行，记账与整轮标记一致；+1 轮内标记回归；`npm run ci` exit 0（87/1654）；
  lead 独立红绿复验成立。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-62`（`597ae18`）已 `--no-ff` 合入 main 系 worktree（合流 `70247ad`）；
  `rsi/round-62` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 16 条待发。
- **下轮**：开新找 bug 面。
  网关恢复后给 round-47~62 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-61 已合流 main 未发版：已删键专属报错（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：已删键只报「未知」，不说「删了」。先查后报：命中删键表就自报名给解法，
  真拼错仍给纠错提示；+1 新回归 + 5 旧断言同步（同等强度）；`npm run ci` exit 0（87/1653）；
  lead 独立红绿复验成立。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-61`（`213bcb8`）已 `--no-ff` 合入 main 系 worktree（合流 `f3562a9`）；
  `rsi/round-61` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 15 条待发。
- **下轮**：开新找 bug 面。
  网关恢复后给 round-47~61 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-60 已合流 main 未发版：说明书已删键改诚实（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：说明书「固化」行把 5 个已删键写成可配值。改点名已删不断点名（spec 锁行文义务保住）；
  子代理预查发现删写法会红后 STOP 得对，lead 改语义收尾；`npm run ci` exit 0（87/1652）。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-60`（`062bec7`）已 `--no-ff` 合入 main 系 worktree（合流 `7bfff22`）；
  `rsi/round-60` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 14 条待发。
- **下轮**：开新找 bug 面。
  网关恢复后给 round-47~60 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-59 已合流 main 未发版：两处过期门注释改诚实（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：两处注释还写着已删除的门开关（「返回否」、「决定门在不在」）；门从 round-54 起常开。
  注释改对（gate 1 + config 1，lead 追加同类一处）；全文件 sweep 余下均诚实；纯注释改无行为变化；
  `npm run ci` exit 0（87/1652）。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-59`（`33b1e89`）已 `--no-ff` 合入 main 系 worktree（合流 `53e2ea8`）；
  `rsi/round-59` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 13 条待发。
- **下轮**：开新找 bug 面（gate/报告/调度）。
  网关恢复后给 round-47~59 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-58 已合流 main 未发版：打烊清场（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：stop 只关开关、读数还摆旧货。打烊加清 overlay + 断句柄，停后读数为空，
  重启走 resume；+1 打烊回归；`npm run ci` exit 0（87/1652）；lead 独立红绿复验成立。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-58`（`656a852`）已 `--no-ff` 合入 main 系 worktree（合流 `326a7c2`）；
  `rsi/round-58` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 12 条待发。
- **下轮**：开新方向（gate/报告新找 bug 面，或 research）。
  网关恢复后给 round-47~58 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-57 已合流 main 未发版：会话换上持久板（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：dispatcher↔taskboard 对接第 3 步（收官）。会话内存表 + 自制 JSON 退役，
  换持持久板经适配器读；handle 全 async 懒开（无遗漏路径）；真相落板、无列字段内存随行并写明，
  不悄悄丢字段；+3 换板回归；`npm run ci` exit 0（87/1651）；lead 独立红绿复验成立。
  未动 policy 判定/store 契约。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-57`（`9dc7624`）已 `--no-ff` 合入 main 系 worktree（合流 `42b1b01`）；
  `rsi/round-57` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 11 条待发。
- **下轮**：开新方向（gate/调度调用方 async 化评估，或 research 新找 bug 面）。
  网关恢复后给 round-47~57 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-56 已合流 main 未发版：板子转读数器适配器（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：dispatcher↔taskboard 对接第 2 步。新转接头：查无翻成空读、翻译两个状态词、
  其它板错照样抛；+2 回归；`npm run ci` exit 0（86/1648）；lead 独立红绿复验成立。
  未动 policy/store 行为。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-56`（`764dfe4`）已 `--no-ff` 合入 main 系 worktree（合流 `1c223b3`）；
  `rsi/round-56` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 10 条待发。
- **下轮**：session 换持久板（经本适配器）+ 持久化格式统一（board.json vs store.jsonl 二选一）。
  网关恢复后给 round-47~56 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-55 已合流 main 未发版：任务板存在检查（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：dispatcher↔taskboard 对接第 1 步。对接注释撒谎（板子无 `has`，`get` 抛错非空读）。
  板子补不抛错的 `has`；注释改诚实（还差抛错转空读适配器，下轮做）；+1 存在检查回归；
  `npm run ci` exit 0（85/1646）；lead 独立红绿复验成立。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-55`（`0335cd0`）已 `--no-ff` 合入 main 系 worktree（合流 `af75f9b`）；
  `rsi/round-55` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 9 条待发。
- **下轮**：抛错转空读小适配器 + 状态枚举对齐评估（`running` vs `in_progress`、`failed` 缺席）。
  网关恢复后给 round-47~55 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-54 已合流 main 未发版：缺钩子加载即报错，三面 15 条收官（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：配置面第 4 条（最后一件）。门上写 fail-closed，无钩子却只 warn 放行，
  主模型直接作答；调用方对 false 零处理，故缺钩子改加载即抛错点名原因（不改 Loader 接线）。
  旧 fail-open 断言改 fail-closed + 4 纯 tool 路径桩补 `on`；`npm run ci` exit 0（85/1645）；
  lead 独立红绿复验成立。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-54`（`17ed0be`）已 `--no-ff` 合入 main 系 worktree（合流 `3c2bcc7`）；
  `rsi/round-54` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 8 条待发。
- **收官**：三面 15 条全落（报告 5：blocked 原因/`+N more`/尾部行边界/不可用标记/恢复深拷；
  并发 4：无定时器兜底/单快照/路径统一/删过期常量；配置 6：Slack 全系/Cookie/守护两件/缺钩子）。
  网关恢复后给 round-47~54 补一次 soak 再发 `0.13.21`。

## 2026-11-23 — round-53 已合流 main 未发版：守护路由 fail-closed（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：配置面第 2+3 条。空白模型当已配置落盘、非字符串悄悄转字符串、多余键读过就丢。
  非字符串抛错点名类型、两字段去空格、空格模型视未配置、未知键自报名；+2 回归；
  `npm run ci` exit 0（85/1645）；lead 独立红绿复验成立。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-53`（`6e723ed`）已 `--no-ff` 合入 main 系 worktree（合流 `49197f8`）；
  `rsi/round-53` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 7 条待发。
- **未做（下轮池）**：配置面 gate 无 pre-step 钩子 fail-open（1 件）。
  网关恢复后给 round-47/48/49/50/51/52/53 补 soak 再发版。

## 2026-11-23 — round-52 已合流 main 未发版：扁平 Cookie 补脱敏（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：配置面第 1 条。只有头形脱敏，JSON 键形和裸形原样漏（Cookie 值本身即凭证）。
  四规则键表加 `cookie`；+1 三形回归 + prose 不误杀；`npm run ci` exit 0（85/1643）；
  lead 独立红绿复验成立。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-52`（`454076a`）已 `--no-ff` 合入 main 系 worktree（合流 `196bbc2`）；
  `rsi/round-52` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 6 条待发。
- **未做（下轮池）**：配置面 guardianModel 空白与未知键/gate 无钩子。
  网关恢复后给 round-47/48/49/50/51/52 补 soak 再发版。

## 2026-11-23 — round-51 已合流 main 未发版：删过期十分钟常量（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：并发面第 4 条。60 万毫秒死常量只剩文档链接和测试 import 在念，
  所有活路都走 720 万默认值。删死导出 + 过期注释，文档改指活默认值；纯删除无行为变化。
  `npm run ci` exit 0（85/1642）；lead 独立验 grep 前后 + 单测 + 全量门禁。
- **真机**：BLOCKED（网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-51`（`d7f8df6`）已 `--no-ff` 合入 main 系 worktree（合流 `2feddd2`）；
  `rsi/round-51` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 5 条待发。
- **未做（下轮池）**：配置面 Cookie JSON/guardianModel 空白与未知键/gate 无钩子。
  网关恢复后给 round-47/48/49/50/51 补 soak 再发版。

## 2026-11-23 — round-50 已合流 main 未发版：报告与调度路径规则统一（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：并发面第 3 条。报告侧不分大小写不消 `..`，与调度侧说反话。
  报告侧删自家归一、复用调度规则（只动报告侧）；+1 大小写/`..` 回归；
  `npm run ci` exit 0（85/1642）；lead 独立红绿复验成立。
- **真机**：BLOCKED（插件链路通；无额度/网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-50`（`41b932d`）已 `--no-ff` 合入 main 系 worktree（合流 `98fc776`）；
  `rsi/round-50` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 4 条待发。
- **未做（下轮池）**：并发面超时常量；配置面 Cookie JSON/guardianModel 空白与未知键/
  gate 无钩子。网关恢复后给 round-47/48/49/50 补 soak 再发版。

## 2026-11-23 — round-49 已合流 main 未发版：守护单轮单快照（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：并发面第 2 条。单轮扫描读两遍文件心跳（2N）且边判边抬基线，结论随插入顺序翻转。
  改为先快照所有心跳与全局基线、再统一判定零读数；`lastFileActivityMs` 语义不变。
  +1 顺序无关回归；`npm run ci` exit 0（85/1641）；lead 独立红绿复验成立。
- **真机**：BLOCKED（插件链路通；无额度/网关 502，未伪造）。本次不发版。
- **合流**：`rsi/round-49`（`af2c09c`）已 `--no-ff` 合入 main 系 worktree（合流 `80bc9ab`）；
  `rsi/round-49` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 3 条待发。
- **未做（下轮池）**：并发面路径归一/超时常量；配置面 Cookie JSON/
  guardianModel 空白与未知键/gate 无钩子。网关恢复后给 round-47/48/49 补 soak 再发版。

## 2026-11-23 — round-48 已合流 main 未发版：无定时器 hung 兜底（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：并发面第 1 条。无定时器 realm 裸等卡死整波及重规划边界。无定时器分支改走宿主时钟
  盯 settlement，预算内未答用同一前缀判停走重试；无时钟/无预算才裸等（注释写明）。
  +1 真无定时器 realm 回归；`npm run ci` exit 0（85/1640）；lead 独立红绿复验成立。
- **偏离**：任务单 `Promise.race` 在该分支物理不可用（无 timer 无到期端）；子代理亲验 PTC 空上下文
  后改 settlement+时钟轮询，等价语义。
- **真机**：BLOCKED（插件链路通；`MISSING_CREDENTIAL`/网关 502 无额度，未伪造）。本次不发版。
- **合流**：`rsi/round-48`（`bca1613`）已 `--no-ff` 合入 main 系 worktree（合流 `3284778`）；
  `rsi/round-48` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 2 条待发。
  另：worktree 空 node_modules 导致 `verify:lib` 缺 tsc 系环境问题，已软链主树依赖解决。
- **未做（下轮池）**：并发面 guardian 双心跳/路径归一/超时常量；配置面 Cookie JSON/
  guardianModel 空白与未知键/gate 无钩子。网关恢复后给 round-47/48 补 soak 再发版。

## 2026-11-23 — round-47 已合流 main 未发版：恢复证据深拷（`CONFIRMED`，soak BLOCKED）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：报告面第 5 条。恢复计划只拷证据数组没拷条目，改恢复后引用串改已校验检查点。
  改为逐项深拷（输出/文件不动）；+1 别名回归；`npm run ci` exit 0（85/1639，首跑 1 flake 重跑绿）；
  lead 独立红绿复验成立。
- **真机**：两试 BLOCKED（headless 新 profile / fork live web profile，插件链路通；
  bifrost 网关连续 502 无额度，未跑出 COMPLETED，未伪造）。本次不发版。
- **合流**：`rsi/round-47`（`87ef9fa`）已 `--no-ff` 合入 main 系 worktree（合流 `7115a41`）；
  `rsi/round-47` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 1 条待发。
- **未做（下轮池）**：并发面 hung 波/guardian 双心跳/路径归一/超时常量；配置面 Cookie JSON/
  guardianModel 空白与未知键/gate 无钩子。网关恢复后给 round-47 补 soak 再发版。

## 2026-11-23 — 已发版 `0.13.20`：账本不可用标记（`CONFIRMED`）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **发了什么**：发版提交 `f228484` 已推，annotated tag `v0.13.20` 已推；远端 CI `45125209602`
  success、Release `45125227599` success 并已发布（asset `dsh-grok-workflow-0.13.20.tgz`）。
  本地 `npm run ci` exit 0：85 files / 1638 tests PASS；`verify:lib` byte-identical；真机 soak PASS。
- **内容**：脏路由下直接交付与转交两条路径账本标 unavailable（旧 round-39 断言同步更新）。
- **分支收尾**：`rsi/round-46` 可 24h 内删除；远端旧分支未动。
- **未做**：报告面 resume 浅拷贝；并发面 4 条；配置面 3 条。真机 GUI 手点 NOT_RUN。

## 2026-11-23 — 已发版 `0.13.19`：账本收尾四修 + 手动清单遗留（`CONFIRMED`）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **发了什么**：发版提交 `c85017f` 已推，annotated tag `v0.13.19` 已推；远端 CI `45121816157`
  success、Release `45121827995` success 并已发布（asset `dsh-grok-workflow-0.13.19.tgz`）。
  本地 `npm run ci` exit 0：85 files / 1637 tests PASS；`verify:lib` byte-identical；真机 soak PASS。
- **内容**：round-42/43/44/45 四修（Slack 全系前缀、blocked 原因行、`+N more` 标记、账本尾部行边界）
  + 手动清单遗留（405 双成因/单轨/429 勾选等）。发版修：bundle 双常量同步 + 删本地野标签
  `v0.12.17` + 名单重刷。
- **分支收尾**：`rsi/round-45` 可 24h 内删除；远端旧分支未动。
- **未做**：报告面账本吞错/resume 浅拷贝；并发面 4 条；配置面 3 条。真机 GUI 手点 NOT_RUN。

## 2026-11-23 — round-45 已合流 main 待发版：账本尾部行边界截断 + 真机 soak（`CONFIRMED`）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者 / 发版
- **做了什么**：报告面第 4 条。账本尾部裸切 8000 字（劈 emoji、中途断行、自创省略号）。
  改为预算内最后整行收尾 + 防乱码切割 + 与正式报告同一句截断标记；+1 超限账本回归；
  `npm run ci` exit 0（85/1637）；lead 独立红绿复验成立。
- **真机**：隔离 `DSH_HOME` + headless 新 profile + 真模型 caller 双任务 **PASS**
 （`COMPLETED 2/2 verified`，写文件 + 算术双证据；标记同构建可达；scratch 已删）。
- **合流**：`rsi/round-45`（`ed50e94`）已 `--no-ff` 合入 main 系 worktree（合流 `b8318bd`）；
  `rsi/round-45` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记 5 条待发。
- **下一步**：攒版已够（round-42/43/44/45 共 4 修 + 手动清单遗留），按自动发版要求走五步流发 `0.13.19`。
- **未做**：报告面账本吞错/resume 浅拷贝；并发面 4 条；配置面 3 条。真机 GUI 手点 NOT_RUN。

## 2026-11-23 — round-44 已合流 main 未发版：截断行加 +N more 标记（`CONFIRMED`）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：报告面第 2 条。两版报告超 12 条的已确认/未完成行静默丢失，读者误当完整。
  前 12 条照常 + 一行 `+N more` 标记（两边同一句）；诊断分节不动。+1 双边一致回归；
  `npm run ci` exit 0（85/1636）；lead 独立红绿复验成立。
- **合流**：`rsi/round-44`（`70dec37`）已 `--no-ff` 合入 main 系 worktree（合流 `f4590ea`）；
  `rsi/round-44` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记，攒版待发。
- **未做（下轮池）**：报告面尾部裸 slice/账本吞错/resume 浅拷贝；
  并发面 hung 波死等/guardian 双心跳与顺序相关/路径归一分歧/超时常量过期；配置面 Cookie JSON 漏/
  guardianModel 空白与未知键/gate 无钩子 fail-open。真机 GUI 手点 NOT_RUN。

## 2026-11-23 — round-43 已合流 main 未发版：机器台账补 blocked 原因行（`CONFIRMED`）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：报告面第 1 条。`renderReport` 对 blocked 打原因行，`machineLedger` 只对 failed 打，
  存档丢「没跑成」和上游原因。放宽 machineLedger 状态条件 + 1 例回归（含与正式报告逐行一致断言）；
  `npm run ci` exit 0（85/1635）；lead 独立红绿复验成立。
- **合流**：`rsi/round-43`（`8c06f9e`）已 `--no-ff` 合入 main 系 worktree（合流 `51ec2bb`）；
  `rsi/round-43` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记，攒版待发。
- **未做（下轮池）**：报告面分节 slice 静默丢/尾部裸 slice/账本吞错/resume 浅拷贝；
  并发面 hung 波死等/guardian 双心跳与顺序相关/路径归一分歧/超时常量过期；配置面 Cookie JSON 漏/
  guardianModel 空白与未知键/gate 无钩子 fail-open。真机 GUI 手点 NOT_RUN。

## 2026-11-23 — round-42 已合流 main 未发版：Slack 令牌全系前缀脱敏（`CONFIRMED`）

- **From:** 本会话（lead，持续 RSI 自动迭代）· **To:** 下一轮接手者
- **做了什么**：三组子代理并行审计 15 条 CONFIRMED 发现（并发/报告/配置三面）；先落风险最高的
  `slack-token` 前缀漏网（`xoxc/xoxd/xoxo/xoxe` 原样进报告）。改 `src/redact.ts` 正则
  `[abprs]`→`[a-z]` + 1 例全前缀回归；`npm run ci` exit 0（85/1634）；lead 独立红绿复验成立。
- **合流**：`rsi/round-42`（`e9fd908`）已 `--no-ff` 合入 main 系 worktree（合流 `b5ec52e`）；
  `rsi/round-42` 分支可 24h 内删除。`CHANGELOG [Unreleased]` 中英文已记，攒版待发，未 bump 未打 tag。
- **未做（下轮池）**：报告面 blocked-incomplete 丢失/分节 slice 静默丢/尾部裸 slice/账本吞错/resume 浅拷贝；
  并发面 hung 波死等/guardian 双心跳与顺序相关/路径归一分歧/超时常量过期；配置面 Cookie JSON 漏/
  guardianModel 空白与未知键/gate 无钩子 fail-open。真机 GUI 手点 NOT_RUN。
- **注意**：主目录仍游离在 `a6103ad` + 37 文件散改（他会话残留），本轮未动；STOP 文件已按用户全自动指令删除。

## 2026-11-23 — 已发版 `0.13.18`：团队调度层 v1 + 取消测试竞态修复（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：发版提交 `f18e17b` 已推，annotated tag `v0.13.18` 已推；远端 CI `45070692108`
  success、Release `45070695678` success 并已发布（asset `dsh-grok-workflow-0.13.18.tgz`）。
  本地 `npm run ci` exit 0：85 files / 1617 tests PASS；`verify:lib` byte-identical；真机 soak PASS。
- **内容**：`src/taskboard/`（调度真相）+ `src/dispatcher/`（L1 大管家）+ `src/handoff/`（四行契约进 report），
  D-108；主链未动。三 lane 子代理并行交付，lead 独立复验（依赖阻塞/CAS 冲突/重启恢复/三项硬拒绝/缺字段打回）。
- **事故**：`v0.13.17` 的 Release 挂在 progress 取消用例（远端红/本地绿）：resume 扫描 +12ms 启动 IO，
  固定 10ms 睡眠的 abort 落在引擎启动前。已修（轮询等子调用）并重发本版。v0.13.17 为坏 tag 留置不动。
- **分支收尾**：`team-dispatch-v1` 已合流 main，可 24h 内删除；本 worktree（fix-synth-resubmit）在 main 上，
  无残留。主工作树另有 naming/面板线 37 文件未提交，与本版无关。
- **未做**：L3 小组长（规模不够）；dispatcher↔taskboard 合流（`TaskReader` 接口已留）；跑中改需求需真实 GUI；
  第三节 5 件拍板项未动。

## 2026-11-23 — 已发版 `0.13.16`：手动清单第二轮 6 件需求（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：发版提交 `1591665` 已推，annotated tag `v0.13.16` 已推；远端 CI `45067182761`
  success、Release `45067195044` success 并已发布（asset `dsh-grok-workflow-0.13.16.tgz`）。
  本地 `npm run ci` exit 0：82 files / 1578 tests PASS；`verify:lib` byte-identical；真机 soak PASS。
- **内容**：需求 1 超时默认 0、需求 2 replan 可见开关（默认关）、需求 4 升级入口、需求 5 删回答格、
  需求 6 断点续跑接线、需求 3 定位 + 挂载 warn；需求 7 D-107 降级做。405 真机复现待宿主环境。
- **主工作树另有线**：naming/面板改动（fix/session-surface-head-6 残留，`src/gate.ts` 等 37 文件未提交）
  与本版无关，不要合进来；发版用的是本 worktree 的 `main`（1591665）。
- **Team 任务**：task-1/2/4/6/7 complete 且已合流验证；task-3 complete（定位 + lead 补 warn）；task-5
  complete（删格，已合流）。7 件全部 complete，无 in_progress 残留。
- **已知坑**：resume 扫描是 macrotask，同步读订阅/断言启动的测试必须等（triage route 已加 ≤5s 等待；
  guardian/phase1 用 `resumeLister: 'skip'`）；网关 `wb/cn:deepseek-v4.1-flash` 今晚 503 无健康账号，
  soak 切 muse-spark 验证。

## 2026-11-22 — 已发版 `0.13.13`：进度脊柱编号优先（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：发版提交 `5ab9e26` 已推，annotated tag `v0.13.13` 已推；远端 Release `45033581188`
  success 并已发布（asset `dsh-grok-workflow-0.13.13.tgz`）。本地 `npm run ci` exit 0：
  81 files / 1561 tests PASS；`verify:lib` byte-identical；lint 0 errors。
- **内容**：见 D-106（`stageForPhase()` 编号优先 + client 镜像 + 双回归；会话 session-076c2337
  的 seq 318 `任务 7 · 合并为干净可并发执行计划` 实证；真机隔离 soak 同形状验证通过）。
- **远端 CI 单点红**：`45033565040` Node 24 绿、Node 22 挂 `test/channel.spec.ts:431` A4
 （本地 41/41 PASS；0.13.12 通道 lane 的时序敏感用例，与本版零交集，不挡 Release，已记 VALIDATION）。
- **野生活动**：工作树曾三番冒出未提交的 `src/gate.ts` surface-head 半成品（`surfaceHasHead`），
  已原样存 `.tmp/keep-stray*.patch` 未提交——疑似并发会话在写，请归属方认领。
- **分支收尾**：`fix-progress-task-number-first` worktree 还在（基线 0.13.11，已合完），可删；
  `fix/session-surface-head*` 已删。`??` 孤儿（`.rsi/evidence/*` 等）皆并发轮未动，不属本版。

## 2026-11-22 — lead 合流：通道 + 重规划 + 汇总三步 + 红色语义，全量 82/1594 PASS（`CONFIRMED`，未发版）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **接了什么**：agent-8 通道 lane（`src/channel.ts` + `src/gate.ts` 单一决策点
  `answerOnChannel()` + `src/run.ts` steeringToken 透传 + `src/types.ts` replan 开关 +
  `test/channel.spec.ts` 41 例）已合入工作树；planner_replan lane
  （`src/steering.ts`/`src/replan.ts`/`src/script.ts` 波边界拉取 + `src/report.ts`
  台账 + 汇总三步 `SUMMARY_MAX_ATTEMPTS=3` 起草-检查-复核 + `test/replan.spec.ts` 17 例）
  已合入；红色语义 lane（`src/progress-tab.ts` + `src/client/index.js`：行红留痕、
  卡/段/条按现状判、连接线中性 + `progress.settle.retried` + `test/client.spec.ts`
  measureWires 口子）已合入。
- **lead 修了什么**：5 个假环境按名存工具（plugin-lifecycle/reliability/
  timeout-config/config-limits-repair/config-synthesis-fallback 的 FakeContext
  `tool` 改 getter 按 `grok_workflow` 取，Cordis 真 fiber 两处同理）——根因是
  `src/index.ts` 多注册了 `grok_replan_intents`，旧测试只留最后一个工具；
  `test/reliability.spec.ts` 设置页计数 `15 of 18` → `16 of 18`（replan 新键）；
  `test/client.spec.ts` ProgressBundle 补
  `recoveredFailures/currentFailureCount/settleParts/measureWires` 四个接口声明。
- **门禁（本轮实测）**：`npm test` **82 文件 / 1594 测试 PASS**；typecheck 唯一报错是
  并发轮未跟踪 `test/nycforecast.spec.ts` 的 `--jsx`（他 lane 孤儿，与本轮无关）；
  lint 0 errors（27 warnings 皆 pre-existing）；`npm run build` +
  `npm run verify:lib` byte-identical（165 files）。
- **没做的**：未提交、未发版；真机 GUI 手势 NOT_RUN（跑中发话看波边界并入 +
  进度页更新 + 「停」看取消结算，需真实浏览器会话 + 真模型）；nyc 天气孤儿
  （`src/weather/` + `test/nyc*.spec.ts` + `sg-weather.html`）未动——下次发版前要么
  修好 `--jsx` 合入，要么继续分段门禁。
- **下一步**：用户说发版才走五步流（ci → tag → push main → push tag → 盯 Release）；
  发版前确认 `replan` 默认关的文档口径（README/LOCAL-TESTING 已有 `replan` 行，
  设置页开关默认关）。

## 2026-11-22 — L2 主会话通道（通道侧）落地，未发版（`CONFIRMED`，session_channel lane）

- **From:** session_channel lane（agent-8）· **To:** lead 合流 / 下一轮接手者
- **本 lane 的文件**（lead 拍板 Option B）：新 `src/channel.ts`、`src/gate.ts`
  （`answerOnChannel()` / `runChannelRound()` / `cancelLiveRuns()`）、`src/run.ts`
  （只加 `RunWorkflowOptions.steeringToken?` 透传）、`src/types.ts`
  （`GrokWorkflowConfig.replan?`）、`test/channel.spec.ts`（新）。
  **没碰** `src/steering.ts`/`src/replan.ts`/`src/script.ts`/`src/client/**`/`src/progress-tab.ts`。
- **行为**：`replan` 开时，跑中消息立刻回执并进活计划（波边界并入）；只有裸 `停/stop/取消`
  取消整轮（经 run 自己的 `cancel()`，结算走 `keepCancelledWork()`）；没有在跑的任务时裸叫停
  只回一句、不派工；整轮结算时未取用的要求用「上一轮 objective + 要求」开下一轮，不丢。
- **门禁**：`test/channel.spec.ts` 41 PASS；gate/grok-on/phase1/triage-recall/composition
  5 文件 128 PASS；`tsc --noEmit` 只剩并发轮 nyc `.tsx` 的 `--jsx`（他 lane）；oxlint 我 lane
  0 errors；`npm run build` + `verify:lib` exit 0。
- **已知红灯不属本 lane（合流前必须由对应 lane 修）**：
  `test/plugin-lifecycle.spec.ts`(17) / `test/reliability.spec.ts`(6) /
  `test/timeout-config.spec.ts`(6) / `test/config-limits-repair.spec.ts`(5) /
  `test/config-synthesis-fallback.spec.ts`(2) 的根因是 `src/index.ts` 现在注册了**第二个工具**
  `grok_replan_intents`，而测试的 FakeContext 只留「最后一个注册的工具」，于是 `ctx.tool` 变成它、
  `execute({objective})` 报 `missing required property "token"`；另有一例设置页字段数断言
  `15 of 18` 需随 `replan` 变 `16 of 18`。修法二选一：测试按名字挑工具，或 index lane 让
  steering 工具后注册/不覆盖 `ctx.tool`。**不要**在本 lane 的文件里绕。
- **没做的**：全量 `npm run ci` NOT_RUN（lead 统一跑）；**真机 GUI 手势 NOT_RUN** —
  需要真实浏览器会话 + 真实模型：跑中发一句「再加一个…」看回执立即出现、看进度页在波边界后
  出现新任务、再发「停」看取消结算报告。子任务级热取消仍是非目标（引擎无 per-child 句柄）。
- **合流提示**：本 lane 的 gate 改动是**结构化**的（删掉 team/full 里两份 steering 块，改为
  `answerInTurn` 单一决策点），若与他 lane 的 gate 补丁冲突，以 `answerOnChannel()` 为锚点重放。

## 2026-11-22 — 已发版 `0.13.11`：守卫判停预算永远跟随单次调用预算（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：`52d7522` 已推，annotated tag `v0.13.11` 已推；远端 CI `45017440836`
  success、Release `45017443293` success 并已发布。本地 `npm test` 80/1526 PASS，
  `verify:lib` byte-identical；typecheck 唯一报错是并发轮未跟踪的 nyc `.tsx`
 （`--jsx` 未开，本轮无关）；lint 0 errors。
- **内容**：见 D-104（`run.ts` 去三元永远传 `childTimeoutMs`、hint 中英各一句、+1 回归测试；
  真机 `DSH_HOME` 副本 + 真实模型跑通，`guardian-start.budgetMs=7200000`，`guardian-end`
  无取消零处置）。
- **没做的**：并发轮的未跟踪文件未动（`src/weather/`、`test/nyc*.spec.ts` 等不属本轮，
  它们让 `npm run ci` 的 typecheck 整步变红——下次发版前要么它们先合入修好 `--jsx`，
  要么发版流程继续用「分段门禁」）；120 分钟跑满 NOT_RUN。

## 2026-11-22 — D-104 Guardian 预算跟随 120 分钟 + 真机实测通过（`CONFIRMED`，未发版、未提交）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **为什么做**：用户两问——「为什么还是 10 分钟」（进度页 `600 秒` 老根）+「设置页看不到守卫时间」。
  根因：`run.ts:863` 的三元把预算和「配没配判停路由」绑在一起，没配路由就退回 `min(deadline,600_000)`；
  设置页 `childTimeoutMs` 行不叫守卫时间，Guardian 预算本就不是可配项。
- **改了什么**：去掉三元永远传 `config.childTimeoutMs`；hint 中英各加一句守卫跟随；+1 回归测试。
  详见 D-104。
- **测试**：`npm run ci` exit 0（80/1526）；`build` + `verify:lib` byte-identical。真机实测
  `CONFIRMED`：`DSH_HOME` 副本 + 真实模型跑通，`guardian-start.budgetMs=7200000`，
  `guardian-end` 无取消零处置，产物文件 + completed 报告双确认。`.dsh-home/` 已删。
- **没做的**：未提交、未发版（等用户指令；commit 不 push 不 force）。120 分钟跑满 NOT_RUN。

## 2026-11-22 — 已发版 `0.13.10`：单次调用预算可配默认 120 分钟（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：`697564a` 已推，annotated tag `v0.13.10` 已推；远端 CI `45011630777`
  success、Release `45011644468` success 并已发布。本地 `npm run ci` exit 0：
  80 files / 1525 tests PASS。
- **内容**：见 D-102（`childTimeoutMs` 新键、默认/上限 120 分钟、设置页分钟编辑、报告校验/渲染、
  旧报告豁免）。
- **没做的**：并发轮的未跟踪文件未动（`src/weather/`、`test/nyc*.spec.ts`、`sg-weather.html`、
  `.rsi/evidence/*` 等不属本轮）；`tsconfig*.json` 的 jsx/tsx 改动非本轮引入仍在工作树未处理；
  真机 120 分钟长任务实跑 NOT_RUN。

## 2026-11-22 — 跑中转向薄设计（L2 通道转向）：只出文档，实施等拍板（`CONFIRMED` 文档 / 实施 `NOT_RUN`）

- **From:** 本会话（agent-2）· **To:** 下一轮接手者 / lead
- **为什么做**：用户想法——主会话当沟通渠道，跑中发的消息交给规划助手重新规划（加任务）。
  实查后先纠了一个前提：会话没被占死（team 档后台跑、主会话先拿首答就归还）；真问题是
  **跑中一说话就整轮 cancel + 窄重启**（`src/gate.ts` Redirect-on-new-message 段），在跑的那一波白跑。
- **做了什么**：`docs/knowledge/DESIGN-midrun-channel-steering.md`（薄设计）+ D-103 + 证据目录
  `docs/knowledge/evidence/midrun-channel-steering-2026-11-22/`（5 个只读抓取，`README.md` 带复现命令）。
  核心结论：沙箱是 `vm.createContext({})` + 六个全局、`args` 起跑即 `structuredClone`、
  host 只有整轮 `cancel(reason)`、孩子一次性 → **没有 host→script 推送通道**，转向只能「波边界拉取」。
- **没做的（明确）**：`src/` 一行未改；`npm run ci` 全量 NOT_RUN（只跑了三个文档守卫 spec，23 tests PASS）；
  未提交、未发版；设计待用户拍板（§8 D1–D6）。
- **下一步**：用户拍板 D1–D6 → 实施顺序建议：`src/steering.ts` 纯函数（`merge`/校验）先写测试 →
  `src/gate.ts` 排队 + ack（开关默认关）→ `src/script.ts` 波边界 `agent()` 取用 → 报告 `steering[]`
  （注意 `assertWorkflowReport()` 逐字段重建，不加就静默丢字段）→ 设置页开关 → `npm run ci`。
- **坑提醒**：转向调用计入 `maxTotalAgents`（ptc 撞顶抛 `AGENT_CAP`），改 plan 时必须一起算；
  报告校验器不会因为多一个字段报错，但也**不会带出来**。

## 2026-11-22 — childTimeoutMs 单次调用预算 120 分钟（`CONFIRMED`，未发版、未提交）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **为什么做**：用户原话「守卫出了问题，10 分钟上限……把它改成默认 120 分钟」。纽约天气 UI 截图：
  `任务进度 5/5 · 100%` 但 Guardian 连刷 4 条「已触发整轮取消」——子任务 10 分钟被掐。三处写死
  10 分钟：`CHILD_TIMEOUT_MS`、`childTimeoutCapMs`、脚本镜像。D-097 只修抢跑没修预算本身。
- **改了什么**：新键 `childTimeoutMs`（schema 鉗制 + resolve 1000–7200000 + 设置页分钟编辑 1–120 +
  报告校验/渲染），默认/上限 120 分钟（`DEFAULT_CHILD_TIMEOUT_MS`/`CHILD_TIMEOUT_MAX_MS`/
  `childTimeoutCapMs` 三处 7.2M）；`CHILD_TIMEOUT_MS` 留作旧报告 `0` 豁免锚点。详见 D-102。
- **测试**：`npm run ci` exit 0（80/1525）；`build` + `verify:lib` byte-identical；lint 3 告警是
  stash 验证过的 pre-existing。旧报告在新默认下重验失败是预期的。
- **没做的**：未提交、未发版（用户没说发版，只说加设置——提交了等发版指令；commit 不 push 不 force）。
  真机 120 分钟长任务实跑 NOT_RUN；旧补丁超限钳制 load 路径 NOT_RUN。
  tsconfig.json/tsconfig.build.json 的 jsx/tsx 改动非本轮引入（`git log` 显示来自旧提交混入工作树），
  本轮未动、未提交——下轮接手者确认归属后再处理。`tsconfig` 那两行没进本次文件清单。

## 2026-11-22 — 已发版 `0.13.6`：守卫问心跳 + 打断重救（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：`8e129c1` 已推，annotated tag `v0.13.6` 已推；远端 CI `44989417857`
  success、Release `44989425946` success 并已发布。本地 `npm run ci` exit 0：
  78 files / 1480 tests PASS。
- **内容**：见 D-099（C1 会话心跳 / C3 打断重救 / 10s 一扫）。真机实救 + 模型实测
  rescue NOT_RUN，后续 run 验证。
- **没做的**：并发轮的未跟踪文件未动；方法二读内容判类型未做（判读在 adjudication 内）。

## 2026-11-22 — C1/C3 守卫问心跳 + 打断重救（`CONFIRMED`，未发版、未提交）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **为什么做**：用户拍板四件事——①扫一遍 10s；②方法一为主（问会话心跳）+方法二（没动静读内容判类型，先只做时间戳判不读内容）；③卡住打断再发消息救（interrupt+sendMessage，不是插队）；④守卫可用模型（guardianModel 就是让它花的）、重救无限次。
- **改了什么**：10s 一扫（事件驱动心跳不动）；C1 `subagentTiming.active.through` 问心跳（只取时间戳，planner 模式也管）；C3 rescue 全链（prompt→广播→interrupt+递话→finding 留账，无限次）；pre-adoption buffer（红测抓到回放顺序坑）。详见 D-099。
- **测试**：`npm run ci` exit 0（78/1480）；guardian 27 + timeout 21 全绿。脚本 rescue 广播集成已钉（events 里有行+attempt 不加长）。
- **诚实边界**：真机实救 NOT_RUN（host 执行器只在 fake seam 测通）；模型实测 rescue 判读 NOT_RUN；无 guardianModel 行为零变化。
- **没做的**：未提交、未发版（等用户确认；commit 后不 push 不 force 等发版指令）。

## 2026-11-22 — 已发版 `0.13.4`：B1/B2/B3 守卫存活信号（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：`993e5de` 已推，annotated tag `v0.13.4` 已推；远端 CI `44981149499`
  success、Release `44981159054` success 并已发布。本地 `npm run ci` exit 0：
  78 files / 1472 tests PASS。
- **内容**：见 D-098（B1 run 心跳 / B2 文件心跳 / B3 裁决证据）。planner 现场编
  plan 无 B2（诚实边界）。真机 GUI 手点 + 模型实测裁决质量 NOT_RUN。
- **没做的**：C（宿主只标记不杀）单独立项未动；并发轮的未跟踪文件未动。

## 2026-11-22 — B1/B2/B3 守卫存活信号（`CONFIRMED`，未发版、未提交）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **为什么做**：用户原话「这个杀错了，子代理明明在工作」。旧守卫只看
  agent-start/end，干慢活和真卡死长得一样，到点杀整轮。D-097 只修了抢跑没修瞎。
- **改了什么**：B1 run 心跳（phase/log 订阅→`runHeartbeat`，信号降级不豁免）；
  B2 文件心跳（`writesPathsForPhase` 中英 phase 反查 + `statSync` mtime保活；
  引擎 allowlist 五键实测死路故走宿主反查）；B3 裁决证据（prompt 加声明路径
  + RULES + 开火 reason 带 `last life`）。详见 D-098。
- **测试**：`npm run ci` exit 0 — 78 files / 1472 tests PASS；typecheck 0 错；
  `verify:lib` byte-identical。基线 1454 + 本轮 8（guardian 7 + timeout 1）。
- **诚实边界**：planner 现场编 plan 无 B2；抛错/无声明/未知 phase 退旧规则。
  真机 GUI 手点 + 模型实测裁决质量 NOT_RUN。
- **没做的**：未提交、未发版（等用户确认；commit 后别 push 别 force）。
  C（宿主只标记不杀）单独立项未动。`lib/` 已由 `npm run build` 重建。

## 2026-11-22 — 已发版 `0.13.2`：guardian 误杀修复 + 固定左栏 + 孤儿清理（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：`b0411c8` 已推，annotated tag `v0.13.2` 已推；远端 CI `44974715432` success、
  Release `44974726161` success、Release 已发布（`v0.13.2`，资产 `dsh-grok-workflow-0.13.2.tgz`）。
- **内容**：guardian 预算覆盖 wait 窗口（D-097，根因见 VALIDATION）；进度任务带固定 40px
  左栏 + 折线 wiring（CHECK 7/7）；`lib/panel.*` 孤儿产物删除（`src/panel.ts` 在 `56e701d`
  已删，`lib/` 残留 4 文件零引用）；t55 重复规则删除（与 TESTING.md 覆盖率 0.82）。
- **没做的**：并发轮的未跟踪文件未动（`docs/cleanup/`、`docs-history-audit/`、`research/`、
  其他 `.rsi/evidence/*`）；真实 GUI 手点 NOT_RUN。

## 2026-11-22 — session-77a3f6fb 中断恢复 + guardian 误杀修复（`CONFIRMED`，未发版）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **为什么停了**：不是用户叫停，也不是任务失败。turn 38 的 run-6599 里任务 1（复核）已做完，
  任务 2（固定左栏）的执行子任务在 10 分 01 秒被宿主 guardian 整轮 cancel——当时它正在收尾
  （证据 md 已写、截图已看、diff 已审，只差最后几个行号核对）。同秒启动的 guardian
  adjudication 子任务只活 1 秒就随整轮一起被取消，Q8 的 wait×2 还没判完。
- **根因**：宿主与脚本的两层 10 min 预算完全重合，宿主先杀整轮，脚本的 wait 续命永远跑不出来。
- **修了什么**：`guardianChildBudgetMs(timeoutMs, childTimeoutMs?)`——有守卫路由时宿主预算覆盖
  `childBudget + 2×5min wait`（仍受 10 min 上限与 deadline 约束）；`run.ts` 只在配了
  `guardianModel` 时传参，无守卫 run 行为零变化。详见 D-097。
- **任务收尾**：任务 2 的 CHECK 独立核验 7/7 PASS（`test/progress-connector.spec.ts` +5 例、
  `test/timeout.spec.ts` +1 例，`npm test` 78/1454 全绿，几何 harness `problems: []`）。
  原 run 的任务 2 不用重跑——代码与证据都在工作树里，只差提交。
- **没做的**：未提交、未发版（工作树另有并发轮的 `lib/panel.*` 删除、`t55` 规则删除、
  `docs/cleanup/`、`research/` 等未跟踪文件，不属本任务，未代提交）；真实 GUI 手点 NOT_RUN。

## 2026-11-22 — 已发版 `0.13.1`：动态转向 Waves 0–4 全量（lead 收尾）`CONFIRMED`

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：`b5c1af0` 已推，annotated tag `v0.13.1` 已推；远端 CI `44967040278` success、
  Release `44967043122` success、Release 已发布（`v0.13.1`）。`v0.13.0`（`14156a6`）因 Node 22
  CI 挂掉从未发布成功，tag 留原地不动，本版另起号。
- **内容**：Wave 0 薄语义（`DESIGN-dynamic-steering-semantics.md` 三态/判定表/取消结算/继承规则）、
  Wave 1 显示层（复核改名/分钟制/标题全留/prompt 首行/人话转交）、Wave 2 运行时（per-call 超时竞速/
  守卫判停 wait×2/8K 继承摘要）、Wave 3 DAG（`dependsOn` 波次校验 fail-closed、`blocked` 传染不烧重试、
  上游证据摘要）、Wave 4 合流验收（retain/redrive 实跑、A1–A6）。配置面 16 键（新增 `guardianModel`）。
- **修了什么才发出去**：`8357423` 只改 `test/timeout.spec.ts`——Node 22 的 bare `vm` 下连续多轮各留一个
  跨 realm 永不 settle 的 promise 会静默吞掉进程，hung child 加 30 s unref 兜底（不断言可观测，不改逻辑）。
  Node 26 + Node 22 本地双验 78/1449 全绿。
- **审计**：三路子代理只读审计（语义+脚本 / 显示+配置 / 测试+新模块）结论：Wave 1 四小版全 CONFIRMED；
  Wave 2/3/4 CONFIRMED，仅 Wave 4「调度级按波 retain 跳过执行」为 HYPOTHESIS（retain 目前是提示词级建议，
  无机器门控）；Q8 默认空=不判停（与 PLAN 里「默认复用 triageModel」不一致，按实现为准）。
- **没做的**：RSI 自迭代仍停着（`.rsi/STOP` 在，工作树后续改动与心跳无关）；失败重试 Phase 2 未立项。

## 2026-11-22 — Wave 4 合流与验收（`CONFIRMED`，agent-72）

- **From:** Wave 4 执行子代理（agent-72）· **To:** Lead / 发版者
- **已做**：`test/wave4-acceptance.spec.ts`（8 例）与证据目录
  `docs/knowledge/evidence/wave4-acceptance-2026-11-22/`（台账 `ACCEPTANCE.md`、合流实跑
  `MERGE-DEMO.txt` + 复跑脚本 `capture-merge-demo.mjs`、两份 CI 日志）。Wave 1–3 源码未动。
- **结论**：A1–A5 `CONFIRMED`、A6 `CONFIRMED`（`npm run ci` 78 files / 1438 tests、exit 0）。
  合流可演示：verified 波 `retain`、只重排未完成波 + 新增意图、`blocked` 行回来是 `redrive`。
- **留给下一手**：① 让「依赖 retained id」可解析（目前整份 plan 被拒退 fallback，`ACCEPTANCE.md` B1）；
  ② 若要让 A1 从「提示词纪律」升级成「结构保证」，需要在新 plan 上做 retained 去重校验（B2）；
  ③ `reverify`/`replan` 仍无生产调用者（B3）；④ 订正 `PLAN-dynamic-steering-2026-11-21.md` §5 A6 的
  「3/1、6/3」旧数（代码与 `AGENTS.md` 是 10/100、1/3）。
- **未做**：真实 DSH Web GUI 手点、真实模型端到端（见 `ACCEPTANCE.md` §6）。未提交、未打 tag、未 push。

## 2026-11-21 — RSI 自迭代停止（`CONFIRMED`）

- **From:** 本会话（agent-23，停止任务）· **To:** 下一轮接手者
- **用户下令**：停掉此前的 1000 轮自迭代（一轮一个心跳 Schedule、逐轮 tag + retry），优先级高于
  UI 工作。round 42 未开，round 41 是最后一轮已关闭轮次。
- **改了什么**：新增 `.rsi/STOP`（带日期的停机说明）。这就是 `heartbeat-guard.sh` 在开轮前检查的
  开关；`bash .rsi/tools/heartbeat-guard.sh --round auto --max-rounds 1000 --threshold 3` 现在输出
  `STOP code=stop-file … round_max=41 ledger_max=41`，exit 20。**没有**改 `harness.json`
  （`totalRounds:1000`/`taskTitle:"RSI heartbeat"` 保持为配置常量）、没有动 tag、没有删分支。
- **观察到的状态（证据）**：`~/.dsh/storages/schedule.json` 只剩「派发个人助理灵感箱」这一条
  active 任务，没有 `RSI heartbeat` 行（子代理身份无法调 `schedule_list`，以持久化文件为准）；
  `job_list` 空；`grok_loop status` = closed；`ps` 在沙箱里只看到 bwrap/bash，无法作为主机进程证据。
- **清理**：`.tmp/heartbeat-guard-*`（336 个一次性 fixture）+ 空的 `.tmp/deferred-retry` 删除；
  `git worktree prune` 移除指向 `/tmp/grok-cmd-before.lzeyLb` 的孤儿元数据；工作树无
  `retry.ts`/`retry.spec.ts` 孤儿。
- **故意留下**：8 个未合并的 `rsi/round-*` 本地分支（round-4..11，2026-11-18 最后提交）——删了就
  丢工作，按约束不动。`0.12.15`(`01272af`) 仍是已发布版本。
- **恢复方式**：人工删 `.rsi/STOP`，再按 `.rsi/HARNESS.md` 重新 arm；不要用脚本自动恢复。

## 2026-11-21 — 进度页双带落地 + 0.12.19（`CONFIRMED`，本地；远端结果见下）

- **From:** 本会话（agent-12）· **To:** 下一轮接手者
- **用户/lead 拍板**：真机 UI 必须对齐 `docs/knowledge/evidence/progress-tab-mockup-2026-11-21/flow.html`；
  缩放控件一起删掉；结算条在没有已声明行时也要出现（显示 `progress.settle.unsettled`）；
  失败重试维持 Phase 2 不做。
- **改了什么**：`src/client/index.js` 的 `ProgressView` 重写（fixed 7-stage spine + 竖向任务带 +
  实测 SVG 干线/支线 + 结算条）、`ProgressNode` 加耗时条、新增 `ProgressTaskCard`/`ProgressPill`/
  `measureProgressWires`/`progressSettleParts`/`progressMemberState`/`progressNodeDuration`；
  删 zoom 全套（含 `src/progress-tab.ts` 的 `PROGRESS_ZOOM_STORAGE_KEY`）与手风琴分支全部样式/文案；
  `lib/client.js` 由 `npm run build` 重建（与 `src/client/index.js` 字节一致）。
- **测试**：`test/client.spec.ts`、`test/progress-connector.spec.ts`、`test/progress-tab.spec.ts` 同步；
  `npm run typecheck` 0 error、`npm run lint` 0 error / 23 warning（既有）、`npm run verify:lib` 字节一致、
  `npm test` **73 文件 / 1349 测试 PASS**。
- **证据**：`docs/knowledge/evidence/progress-tab-two-track-2026-11-21/`（`make-page.mjs` + `run.mjs`
  可复算；`geometry.txt` 9 个场景×宽度；`two-track-1440.png`、`two-track-760.png`）。
- **踩过的坑（下一个人别重踩）**：
  1. 共用一个 `--user-data-dir` 时 `file://` 文档会走缓存，第二个场景会悄悄渲染第一个场景的
     fixture → `run.mjs` 每次启动用一次性 profile。
  2. `--screenshot` 在第一帧就落盘，那时连线还没收敛 → 截图改用「dump 收敛后的 `#host` 子树 →
     静态页截图」；dump 时必须砍掉 `<script>`，否则静态页会自己重渲染成默认 fixture。
  3. Chrome 窗口最小 500 px，窄视口要放进同源 iframe 才吃得到 `@media (max-width: 480px)`。
  4. 卡片若按 owner 各自缩进，后面段的干线会**穿过**前面段的卡片；统一内距（= 最右干线 + 30）
     只有支线互相交叉，没有线穿卡片。这是刻意选择，别改回去。
- **没做 / 仍不做**：失败重试（Phase 2）；真实 DSH GUI 截图（本轮只在 Chromium 里跑真 bundle +
  真样式表，宿主挂载未验）；Firefox/Safari 与 200% 浏览器缩放未测。

## 2026-11-21 — 进度页详情卡删除 + 胶囊直达（已发版 `0.12.18`）`CONFIRMED`

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **用户拍板**：Q1 阶段与任务详情卡一起删；Q2 点卡片空白处什么都不发生；Phase 2（失败重试）暂不做。
- **改了什么**（`src/client/index.js` + `lib/client.js` 重建）：`ProgressDetail` 组件与
  `gw-progress-detail` 全套样式删除；`ProgressNode`/成员卡改静态 div（无 onClick/tabIndex/
  aria-expanded）；可开行末尾新增 `.gw-progress-open` 胶囊，直调 `openChild(childId)`；
  不可开行无胶囊。`detailFor`/`detailSources`/`parseCoordination` 的 bundle 导出移除；
  `detailFields`/`detailEventType` 导出与 `stage-detail` fold 保留（视图不消费，重试立项可用）。
  文案：删 `progress.detail.*` 等 22 key，增 `progress.member.open` 中英。
- **测试**：`test/client.spec.ts`（detail ladder → 三例 pill 断言，aria/mono 同步）、
  `test/progress-connector.spec.ts`（改断默认展开分支）。`npm run ci` exit 0 =
  73 文件 / 1346 测试 PASS。
- **效果图**：`evidence/progress-tab-mockup-2026-11-21/flow.html` 已同步新交互（删 hint、
  删 inspector、卡片 inert、胶囊为 `#child-<id>` 占位链接）；旧详情截图已删。
- **发版**：`c121aa3` 已推，annotated tag `v0.12.18` 已推；远端 CI `44882426442` success、
  Release 已发布（asset `dsh-grok-workflow-0.12.18.tgz`）。重试（Phase 2）未立项，不动。

## 2026-11-21 — 已发版 `0.12.16`（lead 收尾，总开关+命令容错+进度页）`CONFIRMED`

- **From:** 本会话（lead）· **To:** 下一轮接手者 / agent-49
- **发版**：`f24fc87` 已推，annotated tag `v0.12.16` 已推；远端 CI `44853807202` success、
  Release 已发布（asset `dsh-grok-workflow-0.12.16.tgz`）。旧标签未动，无 force-push。
- **内容**：`[Unreleased]` 三条归档——总开关（按钮+路由）、`/grok` 去空白不分大小写、
  进度页展开分支移出脊柱；外加设置冒烟脚本字段数改从 `CONFIG_KEYS` 读、
  LOCAL-TESTING 包名跟版本。`package.json`/`package-lock.json` 0.12.16，
  README 双语版号/示例/tag 列表同步到 `v0.12.16`（`v0.12.15` 保留在已发布列表里）。
- **实测**：`clone-profile` 把线上 `web` profile 复制到隔离目录（7334 文件，2 移位链接修复，
  `cordis.patch.yml:378` 一处 key 形值脱敏，3 悬空链接是线上继承的），装包后
  `lib/client.js`/`lib/mode-surface.js` 与仓库逐字节一致；总开关端到端
  （命令关→按钮读→门控拦→按钮开→门控放行，同一条记录）PASS；进度页几何 48 用例 PASS。
  完整 Web boot 在沙箱下起不来（MCP 写只读路径），未跑——记为环境受限，不冒充。
- **tag 归属**：`v0.12.16` 归本版。agent-49 的 `clone-profile` 范围（脚本+测试+证据）
  未合入本版，其提交请打 `v0.12.18` 或后续号，不要复用 `v0.12.16`。
- **本地 CI**：`npm run ci` exit 0 = 73 文件 / 1350 测试 PASS（含 clone 6 例）。

## 2026-11-21 — 进度页 UI 展示缺陷修复（展开分支移出脊柱）`CONFIRMED`

- **From:** 本会话（子代理 agent-35）· **To:** lead / 下一轮接手者
- **缺陷**：`0eb5d8f` 里展开阶段的成员分支是横向 `.gw-progress-track` 的又一个 flex 子项且
  `width: 100%`，所以打开一个阶段（默认就会打开 `failed`/`doing`）会把七个 stage 挤到 21 px、
  label 宽度 0；`.gw-progress-ring` 没有基础样式，状态环不可见。
- **改了什么**（`src/client/index.js`，已随 `7496ae4`/`660d79d` 入库）：分支移到轨道下方
  （`trackChildren` 只产出 segment + 连接线，面板在 `openBranch` 里单独渲染，`data-state` 在面板上）；
  环 28 px/2 px/50%；删掉 segment 内横线，连接线 `margin-top: 13px` 与环心同高并新增 `data-flowing`；
  `跳转到首个失败` 移出 flex 行；head `flex-wrap`，≤720 px 环上 label 下；≤480 px 连接线隐藏；
  空阶段面板显示 `progressNodeMeta` 那句说明。`test/client.spec.ts` +3 例（112）。
- **证据**：`docs/knowledge/evidence/progress-tab-ui-fix-2026-11-21/`——前后各 7 张截图、
  48 用例几何表（修复前 884 条失败 / 修复后 0）、red-probe（四条结构事实在 HEAD 与工作树全部翻转）、
  `ci.txt`（`npm run ci` exit 0，72 文件 / 1344 测试）。
- **复现**：`make-page.mjs --source <版本>` 生成页面，Chromium 无头截图；`check.mjs` 跑几何断言。
- **未做**：真机 DSH Web 面板手点（本机 `:3080` 会话没有本插件写的 `tool-workflow/*` 运行，
  需先跑一次真实工作流）；`blocked` 抽屉形态单独截图；发版未授权。

## 2026-11-21 — 总开关 core 路由落地 + 进度页空分支说明 `CONFIRMED`（lead 收尾）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **做完了什么**：把 core 侧 `POST /grok-workflow/mode` 合进 main 并推送（`edc7920`）——
  `src/mode-surface.ts` 新建（读写同一条 `plugin:grok-workflow/mode` 记录，回读作答），
  `src/index.ts` 挂载路由（fallback 读 live `grokDefault`），`test/mode-surface.spec.ts` 20 例，
  `lib/` 重建。接着把进度页空分支那笔也合了（`660d79d`）：`progressNodeMeta` 抽成共用函数，
  空分支面板显示同一句说明而不是空盒子，`test/client.spec.ts` +1 例（112 例）。
- **证据**：`npm run ci` exit 0 = **72 文件 / 1344 例 PASS**；`verify:lib` 157 文件逐字节一致；
  范围测试 mode-surface 20、command 26、client 112 均绿。
- **还没做的事**：真实浏览器里手点三个开关（`NOT_RUN`）；未发版，版本号还是 `0.12.15`。
- **用户明确的语言要求**：用户用什么语言，就只用那种语言回，不中英混着发，不甩半截话。

## 2026-11-21 — 对话框底部第三个开关「workflow总开关」`CONFIRMED`（UI 侧；core 路由在并发轮）

- **From:** 本会话（子代理 agent-37）· **To:** lead / 下一轮接手者
- **做完了什么**：`src/client/index.js` 的 composer dock 现在挂三个开关——loop(90)、iterate(91)、
  **mode(92)**。第三个是 `/grok on|off` 的按钮形态：`POST /grok-workflow/mode`，body
  `{action:'status'|'set', sessionId, enabled?}`，回 `{ok,action,mode:{enabled,source,…}}`，
  真相源是会话记录 `plugin:grok-workflow/mode`（与斜杠命令、门控同一条）。挂载读一次；点击
  `set` 目标值并用回包重绘，被拒就保留上一状态并显示原因；无记录时显示路由报回的 `grokDefault`
  （UI 不写死默认值、不建 `masterEnabled` 存储）。关闭态三重提示：文案「关」/空心灯/熄灭胶囊。
  传输抽成 `routeUrl`/`postRoute` 供三个开关共用；`startBothSwitches` 更名 `startDockSwitches`。
- **证据**：`npm run ci` exit 0 = 72 文件 / 1341 例 PASS，`verify:lib` 通过；两条负对照（改错路由
  常量 2 红、关闭态画成开启 4 红）与日志在 `docs/knowledge/evidence/workflow-switch-button-20261121/`。
- **没做的事**：真机 GUI 手点（`NOT_RUN`）；未发版、未 bump 版本；`src/mode-surface.ts` /
  `src/index.ts` / `lib/index.*` / `lib/mode-surface.*` / `test/mode-surface.spec.ts` 属 core 兄弟
  的并发改动，我没有提交它们。
- **接手要点**：若 core 再改路由形状，只需同步 `MODE_ROUTE_PATH`/`MODE_ACTIONS`/`parseModePayload`
  三处与 `test/client.spec.ts` 里的契约用例；dock 里三格的 order 不要重排。

## 2026-11-21 — `/grok` 参数解析容错（命令层）；裸 `/grok`=开 未回退（`CONFIRMED`）

- **From:** 本会话（子代理 agent-38）· **To:** lead / 下一轮接手者 / agent-37（dock 开关）
- **做完了什么（`CONFIRMED`）**：`/grok on|off` 命令早已存在，本轮补的是解析容错——
  `src/command.ts` 里 `trim()` 后 `toLowerCase()` 再比 `on`/`off`（`/grok ON`、`/grok  Off `、
  `/grok<TAB>on` 都生效）；参数不是字符串时回用法提示而不是抛 `TypeError`，也不落进「空=开」
  分支写一个没人要的开关。`on`/`off`/空 之外一切参数仍只回用法提示、不写记录。
  证据：`test/command.spec.ts` 改前 4 红 / 改后 26 绿
  （`docs/knowledge/evidence/grok-command-grammar-20261121/{before,after}.txt`），
  `npx vitest run --exclude 'test/client.spec.ts'` = 70 文件 / 1212 例 PASS，
  `npm run typecheck` exit 0，`npm run lint` 0 error / 23 warning。
- **没做的事（明确）**：委派 AC 有「无参数也要用法提示且不改状态」一条，**没有照做**。裸 `/grok`=开
  是已发布契约（`D-028`、README 双语两处、`src/client/index.js` 的 `status.off.detail`、
  4 条既有用例），改成报错属于行为回退，任务里没有用户请求要它。冲突写在 `D-095`，
  等 lead/用户裁决；要改只需 `src/command.ts` 那行 `enable = arg === '' || word === 'on'`
  加 4 条测试。
- **状态模型澄清给 UI 侧**：仓库没有 `masterEnabled`。总开关 = 会话记录
  `plugin:grok-workflow/mode` 的 `enabled`（写 `setMode`、读 `readModeRecord`/`isModeEnabled`，
  门控 `src/gate.ts:521`，兜底配置默认 `grokDefault`）。agent-37 的 dock 开关走
  `POST /grok-workflow/mode`（`status|set`）写同一条记录即同源；不要在配置里再加一个键。
- **工作树状态（重要）**：提交本轮时 `src/client/index.js` 仍有并发轮未提交改动（+91 行，
  dock 总开关），`test/client.spec.ts` 因此 15 红。本轮只提交 `src/command.ts`、
  `test/command.spec.ts`、`lib/command.*`、README 双语两行、CHANGELOG、docs；**没有**提交
  并发轮的 `src/client/index.js`，也**没有**把它的半成品 `lib/client.js` 一起提交。
  下一轮收尾时要先跑一次 `npm run build` 再跑 `test/client.spec.ts`。
- **未做**：未发版、未改版本号、未动 tag、无 force-push、未改 DSH core、未写任何密钥。

## 2026-11-20 — 已发版 `0.12.14`，web profile 已更新到该版（`CONFIRMED`）

- **发版（`CONFIRMED`）**：patch 发版。发版提交 `c0eabef`、annotated tag `v0.12.14` 已推；
  远端 CI `44760621921` success、Release `44760644587` success
 （asset `dsh-grok-workflow-0.12.14.tgz`）。内容即 `/compact` 修复那条；
  发版时并发轮 WIP 已 stash 隔离，发完原样恢复（仍是未提交状态，不属本版）。
  旧标签未动，无 force-push。
- **web profile（`CONFIRMED`）**：`~/.dsh/profiles/web` 的 `dsh-grok-workflow` 从
  `github:` 未固定版升到 `github:free6589/dsh-grok-workflow#v0.12.14`；
  `plugin ls` = 0.12.14，装好的 `lib/` 与仓库 `.js`/`.d.ts` 逐字节一致
  （仅 sourcemap 附带差异），`openStepOf`/`appendAssistantInStep`/`TERMINAL_RECORD`
  在装好的包里确认存在，bundle 行 `grok-workflow` 正常挂载。
  注意：宿主进程（pid `154637`，11-17 启动）未重启，运行中的仍是旧代码；
  下次 profile 启动（或宿主重启）后生效。
- **给下一轮的提醒**：发版校验曾因 `test/checkpoint-bound.spec.ts`
 （并发轮的新测试，依赖被 stash 的 schema 注释）红过一次——当时临时移开、
  发完已放回，不要误当成本版问题删掉它。

## 2026-11-20 — 存量会话离线修复 + 新 profile 实测（`CONFIRMED`）

- **From:** 本会话 · **To:** 用户 / 下一轮接手者
- **修了什么**：用户报的 `session-3a683cb6` 里两行旧版卸载通知（seq 3553、seq 5424）
  已离线改为同 seq/同时间的 `plugin:grok-workflow/terminal` 记录，文字逐字保留，
  seq 0–7476 连续，`dispose`/`delivery` 记录不动。`5fb5da0` 只防新增、不改历史，
  所以这一步是必需的。
- **验证（`CONFIRMED`）**：真实 DSH 0.2.2-rc.3 全量回放——修复前备份在 seq 3553 抛错，
  修复后 7507 事件/`totalTokens=508565` 通过（`REPAIR EFFECTIVE: true`，
  `.rsi/evidence/compact-repair-20261120/`）；新 profile `verify-compact` 上
  `drive.mjs --team` 一次通过（真实团队档 turn + 真实 `/compact` 成功，0 孤儿行）；
  `test/compact-step-pairing.spec.ts` 7 绿；`npm run ci` 72/1306 全绿（含并发轮改动）。
- **本轮改动**：只动了 `test/compact-step-pairing.spec.ts`（+1 用例）+ 记忆文档；
  `src/`/`lib/` 零改动。并发轮的未提交改动（CHANGELOG/`src/delivery` 等）原样保留，
  未代提交。**未发版**（任务只要求修 bug + 实测）。
- **备份**：修复前日志在 `.rsi/evidence/compact-repair-20261120/session-3a683cb6-before.jsonl.zstd`；
  另有一份同名备份在 `.tmp/`（gitignored）。回滚 = 把备份写回会话目录同名文件。

## 2026-11-20 — `0.12.13` 已发版（round-038：非字符串 model/provider）

- **From:** RSI 心跳轮（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（fail-closed 收紧）。R38 提交 `7825ca7`（+证据 `490edce`）、
  发版提交 `61c7cb8`、annotated tag `v0.12.13` 已推；远端 CI `44697135387` success、
  Release `44697140006` success（asset `dsh-grok-workflow-0.12.13.tgz`）。
  旧标签未动，无 force-push。
- **内容**：非字符串 `model`/`provider` 拒绝带完整路径 + got-type。
  `npm run ci` 69/1263 全绿。
- **NOT_RUN**：真机 GUI；真实定时投递。本机 `web` profile 仍是旧版。

## 2026-11-20 — 1000 轮现在只需**一次**上弦；本轮同时是 harness 管着跑的第一轮（round 37，`D-093` / `A42`）

- **From:** agent-103（并发子代理，harness 任务 attempt 2）· **To:** 操作者 / 下一轮接手者
- **上弦（`CONFIRMED`，14:36:57 已发生）**：同一行 `schedule-0bbbef5f-…` 的 `rrule` 已被改成
  `DTSTART:20261120T073657Z` + `FREQ=MINUTELY;INTERVAL=60;COUNT=969`；`--verify-row` 现在 **`ARMED`**，
  `covered=963` = `remaining=963`，末次 `2026-12-30T15:36:57Z`（`.rsi/evidence/harness/final-state.txt`）。
  写本记录前的实测是 `NOT_ARMED`（`verify-row-live.txt`：`COUNT=10`、`covered=4`）。
- **prompt 也已换成常量那份（`CONFIRMED`，14:44）**：先是旧的 3,239 字符（`armed-row.txt`），
  随后一次 `schedule_edit` 把它换成 `.rsi/HEARTBEAT-PROMPT.md` 的正文——实测 `prompt_len=2319`，
  含 `heartbeat-guard.sh`、`--round auto`、`--max-rounds 1000`、`top_next`
  （`armed-verified.txt`）。门禁在干净树上 `RESUME next_round=38`。
  两次上弦都不是本轮执行的（子代理无 `schedule_*`）；本轮交付的是「一次调用 + 可复核」。
  上弦要一条调用，参数由 `node .rsi/tools/iterate-plan.mjs --arm-spec` 打印（槽名 `RSI heartbeat`、
  行 id、`rrule`、prompt 文件与字符数）；`DTSTART` 是按当前时钟算的，**调用前重跑一次**再粘贴。
  上完用 `--verify-row` 复核（exit 0 = ARMED / 21 = NOT_ARMED / 22 = 读不到宿主存储）。
  子代理拿不到 `schedule_*`（本轮第 2 次实测 `{"code":"subagent_session"}`），所以这一动作属于你。
- **交付（`CONFIRMED`）**：`.rsi/harness.json` 默认 `shape: single`（一行 `COUNT=剩余全部`，一次上弦到 1000 轮）；
  `iterate-plan.mjs` 新增 `--arm-spec` / `--verify-row`（只读宿主存储、只取 prompt 长度）；
  常量 prompt `.rsi/HEARTBEAT-PROMPT.md`（实测 2,319 字符 ≤ `MAX_LOOP_PROMPT_CHARS` 4000，两个上弦通道都能装）；
  门禁 `heartbeat-guard.sh --round auto`（轮次按记录自算）。`chain`（每臂 ≤100）保留。
  `D-092` 的「10 次续订」被 `D-093` 取代：那与用户「不提示」直接冲突，且两次 attempt 都没等到。
- **本轮落地的增量（`CONFIRMED`）**：`roles` 为非对象时拒绝装载（此前五条链全空而装载成功），
  `test/config.spec.ts` 38 → 39，旧读取器上 1 failed（`.rsi/evidence/harness/round-037-red.txt`）。
  `test/iterate-plan.spec.ts` 15 → 21、`test/heartbeat-guard.spec.ts` 14 → 15，新用例在旧工具上
  10 failed / 26 passed（`red-tool-pre-change.txt`）。`npm run ci` 69 文件 / 1261 测试 PASS。
- **未发版（`CONFIRMED`）**：`CHANGELOG.md` 的 `roles` 收紧记在 `[Unreleased]`；同一 checkout 有并发
  进程持有未提交的 `src/delivery` 改动，此刻 bump 会抢版本号（`0.12.12` 已由它发出，指向 `61c7cb8`）。
- **未做（`NOT_RUN`）**：真实定时投递（无已上弦的行）；GUI 手点 Self-iterate 开关；`open()` 原地改写
  `COUNT` 的运行时行为。
- **给下一轮的提醒**：`single` 的行宽超出插件开关会写的宽度，任何一次开关翻转都会把 `COUNT` 改回
  `loopMaxRounds`（≤100）——所以「是否还上着弦」要用 `--verify-row` 量，不要凭记忆。

## 2026-11-20 — `/compact` 报错的根因修复（**已并入 `main`**）

- **From:** 执行代理（workflow 任务 `compact_fix`）· **To:** 用户 / 下一轮接手者
- **落地（`CONFIRMED`）**：先在 `0d91e45` 上的独立 worktree 完成（当时主 checkout 有并发轮的
  未提交改动），rebase 到 `39eda66` 成为分支提交 `5fb5da0`，由**并发的发版轮**以 merge 提交
  `e80ed6d`（父 `490edce` + `5fb5da0`）并入 `main`。其 `CHANGELOG` 解法与本轮独立解出的一致：
  本修复留在 `[Unreleased]`，已发版的 `0.12.13` 段原样保留。**未改版本号、未打新 tag、无 force-push。**
  合并后 `lib/` 由 `src/` 重建，`git status -- lib/` 为空，`verify:lib` 在合并树 exit 0。
- **根因（`CONFIRMED`）**：本插件在 `agent/pre-step`（step 未打开）写 `assistant/message`，
  DSH 的 token 计量器要求每条 assistant 行落在同 `(turn, step)` 的 `step/start`…`step/end`
  之间；第一次回放即抛 `token meter: assistant/message at seq N has no matching step/start
  event`，游标不前进 → 之后每次 `measure()` 都抛 → `compactNow()` 先测量 → `/compact` 报错、
  自动压缩静默停摆。三个写点：即时回执、卸载通知、取消终态（`commitCancelled`）。
- **修法**：`openStepOf()` + `appendAssistantInStep()`（`src/records.ts`），三处统一走闸门；
  被拒的回执/通知文字改存 `plugin:grok-workflow/terminal` 记录（`D-094`）。回执的模型调用在
  写不出行时一并跳过。
- **验证（`CONFIRMED`）**：`node scripts/repro-compact.mjs`（真实 `/compact` 命令 + 真实压缩引擎 +
  真实计量器）在**合并前的 mainline `490edce` 自己的 `lib/`** 上 exit 1、在**合并后的 `main`** 上
  exit 0（`.rsi/evidence/compact-fix/main-before.txt`、`main-after.txt`）；
  `test/compact-step-pairing.spec.ts` 在 `490edce` 树上 4 红 / 2 绿（`main-before-test.txt`），
  合并后 6 绿、连跑两次同结果；合并树 `npx vitest run` = **70 文件 / 1269 全绿**，
  `typecheck`/`lint`/`build`/`verify:lib` 均 exit 0。
- **环境提醒**：`@deepseek-ai/dsh-token-meter` 是新 devDependency，克隆后必须 `npm install`，
  否则 `tsc` 报 `test/compact-step-pairing.spec.ts(26,28): TS2307`。
- **行为变化（需要产品决定）**：P0-4 的取消终态、卸载通知、团队档实时回执**不再是聊天行**
  （DSH 在 step 之外没有合法的 assistant 形状）。文字进 terminal 记录，事实不丢；渲染层缺一条
  行。后续入池：进度面板 / 客户端自绘行。
- **NOT_RUN**：真机 GUI 点 `/compact`（需要活动会话，会写会话数据）；发布/打 tag（任务禁止）。
- **合并结果（`CONFIRMED`）**：`CHANGELOG.md` 是唯一文本冲突，按「未发布留 `[Unreleased]`、
  已发布段不动」解掉，与并发轮的解法逐字一致；`src`/`lib`/`test` 与并发轮（`src/config.ts`、
  `lib/config.*`、`test/config.spec.ts`）无重叠，合并树上两侧改动并存（`src/records.ts`、
  `src/gate.ts`、三份测试与分支逐字一致，`src/config.ts` 带 R38 的形状拒绝）。

## 2026-11-20 — `0.12.12` 已发版（round-036：截断保头尾）

- **From:** RSI 心跳轮（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（显示行为修正）。R36 提交 `aa5e79c`、发版提交 `61c7cb8`、
  annotated tag `v0.12.12`（→`61c7cb8`）已推；Release `44686655900` success
  （asset `dsh-grok-workflow-0.12.12.tgz`）。旧标签未动，无 force-push。
- **内容**：超长人话块保头+保尾、中间砍；双语独立截断。`npm run ci` 全绿。
- **NOT_RUN**：真机 GUI；真实定时投递。本机 `web` profile 仍是旧版。

## 2026-11-20 — round 36：折行下限与页脚规则（`A41` / `D-091`）

- **From:** round 36（并发子代理）· **To:** 操作者 / 下一轮接手者
- **落地（`CONFIRMED`）**：`src/redact.ts` 的 `BASE64_CONTINUATION` 让窄于续行下限的折行按「短行连排」
  整段被吃（修前 7 列留 244/272 字符且可解回密钥）；页脚规则按实测改写（末行 <8 留、≥8 吃），
  `docs/ARCHITECTURE.md` 的「16 字符」「窄于 24 列完全不匹配」两处过期文字已删。
  `test/redact.spec.ts` +3 用例，代码提交 `e3be559`。
- **验收线状态**：base64 PGP armor 两侧边界 = 已覆盖并有直接断言（round 30 的规则 + 本轮用例）；
  checkpoint 合法载荷上界 1,048,447 = round 31 已关（`a97d099`），本轮复核通过；
  页脚字节规则 = 本轮关闭（规则 + 用例 + 架构引用）。
- **门禁**：干净 worktree @ `e3be559` 上 `npm run ci` exit 0 = 68 文件 / 1236 测试 PASS、
  `verify:lib` byte-identical；HEAD `aabed51` 上 `npm run ci` exit 0 = 69 文件 / 1251 测试 PASS。**工作树里**的 CI 有 1 例失败，属并发进程未提交的
  `.rsi/HEARTBEAT.md`（`--max-rounds 1000`）与其守卫脚本，与本轮无关；同一 spec 在 `d181812` 干净
  worktree 里 14/14 passed。
- **并发警告（必读）**：本轮期间另一进程把本轮的 `src/redact.ts` 扫进配置提交 `0ef5bb7`、把第一版
  （自身有 bug 的）用例扫进 `0d91e45`，随后在 `5749a08` 以「never-green」为由删掉，并发了
  `v0.12.10`/`v0.12.11`。`e3be559` 重新落地修正版用例。**下一个接手者请先 `git log --oneline -8`
  确认 HEAD 与本记录的关系**，不要假设工作树干净。
- **未做（`NOT_RUN`）**：真实定时投递；开关手点；三重及以上转义；GUI 端到端点按。

# Agent Handoff

## 2026-11-20 — 1000 轮预算的 harness 已落地（分臂 ≤100 轮，`D-092` / `A40`）

- **From:** agent-89（并发子代理，harness 任务）· **To:** 操作者 / 下一轮接手者
- **交付（`CONFIRMED`）**：`.rsi/harness.json`（预算 1000、间隔 60、臂宽 100、门禁 cap 1000、
  信封 10/100 并发与 1/3 重试）、`.rsi/tools/iterate-plan.mjs`（只读的计划器：从
  `ROUND.md` + `ledger.jsonl` 算剩余与下一臂的 `rrule`，`--pool` 给池顶）、`.rsi/HARNESS.md`
  （设计、停止规则表、每轮纪律、卸载契约）、`test/iterate-plan.spec.ts`（15 用例，把每个数字钉在
  `HARD_LIMITS` / `DEFAULT_LOOP_INTERVAL_MINUTES` / `loopPolicyFromConfig` 上）。
  `.rsi/HEARTBEAT.md` 的 step 0 现在带 `--max-rounds 1000`，`.rsi/PROTOCOL.md` 加了预算段。
- **落地形态（`D-092`）**：一轮 = 一次投递；一行 = 一臂 ≤100 轮（= `HARD_LIMITS.loopMaxRounds`）；
  1000 轮 = 10 臂，逐臂续订；进程内不循环，本轮也不自续（`D-066`）。
- **必须由人（或持有 `schedule_*` 的会话）做的一件事**：续订心跳行。旧行
  `schedule-0bbbef5f-…`（`COUNT=10`）最后一次是 `2026-11-20T10:01:50Z`，已经用尽；下一臂的
  `rrule` 由 `node .rsi/tools/iterate-plan.mjs` 打印（当前：臂 1/10，`rounds=100`，窗口 36..135）。
  配置面需先设 `loopMaxRounds: 100` + `iterateIntervalMin: 60`，否则开关写的行比计划窄。
- **未做（`NOT_RUN`）**：真实定时投递；开关手点；`open()` 原地改写 `COUNT` 的运行时行为。
- **并发记录（重要，`CONFIRMED`）**：本轮工作期间同一 checkout 另有进程在跑 RSI 轮
  （round 35 的收尾提交 `0ef5bb7`/`0d91e45`，随后 round 36 的 `src/redact.ts` 改动）。我的
  `.rsi/harness.json` 与 `.rsi/tools/iterate-plan.mjs` 被 `0d91e45` 一并提交（当时尚未带测试），
  `test/iterate-plan.spec.ts` 与 `.d.mts` 一度被清掉、已重建并补交。**任何一轮提交前都要
  `git status` 逐文件确认，不要 `git add -A`。**
- **发现的记录缺口**：`POOL.md` 与 `D-090` 引用了 `A39`，但 `docs/knowledge/RESEARCH.md` 里没有
  `A39` 这一节（round 35 的 schema 透传测量只留在 `.rsi/evidence/round-035/nested-key-probe.mjs`）。
  这是悬空引用，应由 round 35 的归属方补写或改引；本文件不代写他人的测量。

## 2026-11-20 — `0.12.9` 已发版（round-034：双重转义折行 base64 块）

- **From:** RSI 心跳轮（本会话，并发收尾）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（安全修复）。R3 提交 `5d3bcea`、R5/R6 提交 `4b751b3`、
  收尾 `7e312e4`+`28a6566`、annotated tag `v0.12.9` 已推；远端 CI `44673443254`
  success、Release `44673449471` success（asset `dsh-grok-workflow-0.12.9.tgz`）。
  旧标签未动，无 force-push。
- **内容**：`BASE64_BREAK` 加双反斜杠分支（双重转义折行块脱敏）；真换行折行 1–24 列
  在 HEAD 上已全盖（池旧描述过时）。`npm run ci` 68/1232 全绿。
- **NOT_RUN**：真机 GUI；真实定时投递；三重及以上转义。本机 `web` profile 仍是旧版，
  想用新版就从 `github:free6589/dsh-grok-workflow#v0.12.9` 更新。

## 2026-11-20 — `0.12.8`（round-033：手工折行的 base64 私钥 + 账本滞后）

- **From:** agent-78（RSI round 33 子代理）· **To:** 下一轮接手者 / 主会话
- **选题（`CONFIRMED`）**：`POOL.md` 池顶红脱敏项——base64 块折行窄于 24 列时整块留存。
  标记原为连续 20 字符字面量，折行把它自己拆到两行；实测 8/12/16/19/20/21/22/23 列全部不脱敏，
  24 列才第一次生效。
- **本轮改动**：`src/redact.ts` 的 9 条窗口改为生成式并可容忍自身断行（真实换行或 JSON `\n`
  转义），续行下限 16 → 8 且按行边界锚定（`D-088`、`A37`）；`test/redact.spec.ts` +3 用例；
  新增 `test/rsi-ledger.spec.ts`（5 用例）；`.rsi/ledger.jsonl` 补齐 27–32 六行。
- **记录层修复（重要，`CONFIRMED`）**：`heartbeat-guard.sh --round 33` 首跑是
  `SKIP code=round-without-ledger`（报告到 32、账本停在 25）。第 32 轮实际已闭合，是假信号；
  但该 SKIP 连续三次会升级为 `stall-unclosed` 的 **STOP**，即整条无人值守循环会在**所有测试仍绿**
  的情况下停摆。补行 + 新测试已修好，门禁码恢复为 `dirty-tracked`（当轮自己的改动）。
- **发版（`CONFIRMED`）**：patch `0.12.8`。commit `9f91684`、annotated tag `v0.12.8` 已推；远端
  CI `44670766356` success、Release `44670771402` success（asset
  `dsh-grok-workflow-0.12.8.tgz`，602,301 B）。旧标签未动（`v0.12.7` 仍在 `56e701d`），无 force-push。
- **红绿（`CONFIRMED`）**：旧码 `test/redact.spec.ts` 2 failed / 38 passed → 新码 40 passed；
  账本用例对旧账本 1 failed → 补行后 5 passed；`npm run ci` exit 0 = 68 文件 / 1231 测试 PASS。
- **NOT_RUN**：真实定时投递、GUI 手点（操作方动作，D-066）；折行 ≤7 列的块（池里新项）。
  本机 `web` profile 仍是旧版，想用新版从 `github:free6589/dsh-grok-workflow#v0.12.8` 更新。

## 2026-11-20 — `0.12.7` 已发版（round-032：删 panel 死代码）

- **From:** RSI 心跳轮（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（删减死代码，用户可见行为不变）。commit `56e701d`、
  annotated tag `v0.12.7` 已推；远端 CI `44666191493` success、Release `44666195466`
  success（asset `dsh-grok-workflow-0.12.7.tgz`）。旧标签未动，无 force-push。
- **内容**：删 `src/panel.ts`（286 行）+ 自有测试（557 行）；`gui-fold.ts` 自带类型。
  `npm run ci` 67/1223 全绿（-13 例皆所删模块自有测试）。
- **NOT_RUN**：真机 GUI；真实定时投递。本机 `web` profile 仍是旧版，
  想用新版就从 `github:free6589/dsh-grok-workflow#v0.12.7` 更新。

## 2026-11-20 — round-031：检查点上限注释多算 129 字节（`CONFIRMED`，不发版）

- **From:** agent-73（RSI round 31 子代理）· **To:** 下一轮接手者 / 主会话
- **选题（`CONFIRMED`）**：`POOL.md` checkpoint 一节第一条非 DONE 项，也是 `0.12.5` HANDOFF 里点名的
  第一条遗留不确定性（注释准确性）。选题前对表：`src/checkpoint/schema.ts:859-864` 仍写 1,048,576。
- **结论（`CONFIRMED`）**：完整性记录 = **122 字节 + `bytes` 的十进制位数**（4,000 字节载荷 126 字节、
  1,048,447 配 129 字节），所以写入侧从 **1,048,448** 就拒绝；真上限 **1,048,447**。**行为自 round 27
  起就是对的，错的是注释**——本轮是「测量 + 守卫」，无行为修复。
- **改动**：`src/checkpoint/schema.ts` 注释改为 1,048,447 并写出算式；`test/checkpoint-schema.spec.ts`
  新增 1 条（量开销 → 解上限 → 1,048,447 写入成功且文件正好 1,048,576 B → 1,048,448 `too-large` →
  读回源码要求注释写出该数）；`lib/` 重建。`D-087`、`A36`、VALIDATION Round 83。
- **红绿**：旧码 worktree `-t "bounds the payload"` → **1 failed | 37 skipped**（注释守卫）；新码
  **38 passed**。`npm run ci` **68 文件 / 1236 测试 PASS**。证据 `.rsi/evidence/round-031/`。
- **不发版（记录理由）**：只改注释与测试，无用户可见变化，按 `docs/RELEASING.md` 不 bump、不打 tag、
  `CHANGELOG.md` 的 `[Unreleased]` 保持空。当前版本仍是 `0.12.6`。
- **遗留三条仍在**（详见下节）：base64 折行 <24 列不匹配（M/low）、宿主内存版本不可观测、GUI 手点
  `NOT_RUN`；以及**心跳行 rrule 只到 2026-11-20T10:01:50Z，需主会话续订**。

## 2026-11-20 — round-030：base64 包裹的 GnuPG 私钥不再原样进报告（`CONFIRMED`，已发版 `0.12.6`）

- **From:** agent-73（RSI round 30 子代理）· **To:** 下一轮接手者 / 主会话
- **发版（`CONFIRMED`）**：patch。commit `e7150ab`、annotated tag `v0.12.6`（对象 `167b475`）已推；
  远端 CI `44659057507` success、Release `44659061505` success（asset
  `dsh-grok-workflow-0.12.6.tgz`，600,316 B）。旧标签对象未动（`v0.12.3` `0c66263`、
  `v0.12.4` `d5df98f`、`v0.12.5` `47fcb52`），无 force-push。
- **选题（`CONFIRMED`）**：`POOL.md` 红脱敏一节第一条非 DONE 项（round 29 留下的 `P · Base64-wrapped
  *PGP armor*`）。选题前与 `HEAD df6cf4b` 对表：`grep -c QR1AgUF src/redact.ts` → 0，条目成立，未陈旧。
- **本轮改动**：`base64-private-key` 从 3 条标记扩到 9 条（`PRIVATE`/`SECRET` × 三种分组对齐），窗口
  取到横幅第 17 字节；`docs/ARCHITECTURE.md` 覆盖清单与已知缺口、`CHANGELOG.md` 双语条目、README
  版本串、`lib/` 重建。细节见 `DECISIONS.md` D-086、`RESEARCH.md` A35、`VALIDATION.md` Round 81/82。
- **红绿**：旧码 worktree（`git archive df6cf4b` + 新 spec）`-t "GnuPG"` → **2 failed | 35 skipped**，
  收到的就是整串编码块；新码 **37 passed**（基线 35）。`npm run ci` **68 文件 / 1235 测试 PASS**；
  提交后 `verify:lib` = `e7150ab` 153 files byte-identical。证据 `.rsi/evidence/round-030/`。
- **本轮量出、未修（已入池）**：**<24 列折行**的 base64 块会把 20 字符标记拆到两行，整块完全不匹配
  （8–23 列留 180–184/184 字符，24 列起才脱敏）；PEM 自 round 29 起既有。真 `base64` 默认 76 列、
  `-w0` 不折行，风险是手工折行的粘贴。修它需要「标记允许自身断行」或解码通道，属独立决定。
- **心跳行状态（`CONFIRMED`，只读核对 `~/.dsh/storages/schedule.json`）**：`RSI heartbeat` 行仍
  `status: active`、只归属 `session-3a683cb6…`、prompt 3,239 字符；`lastDelivery` 现在是
  2026-11-20T02:01:50Z（`messageId` 存在），加上前一次的 01:01:50Z，共**两次真实投递**。
  **但 rrule 仍是 `FREQ=MINUTELY;INTERVAL=60;COUNT=10`，最后一次 2026-11-20T10:01:50Z——撑不到
  2026-12-01。** 本会话是子代理，宿主拒绝 `schedule_*`
  （`{"code":"subagent_session","message":"A delegated subagent cannot use scheduled tasks."}`），
  未手工改宿主存储。**主会话/操作者需把该行 rrule 改成**
  `DTSTART:20261120T100150Z\nRRULE:FREQ=HOURLY`（或每日 `FREQ=DAILY;COUNT=12` 之类）
  **并把 `UNTIL=20261201T235959Z` 或 `COUNT` 覆盖到 12-01**；行 id `schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab`。
  证据 `.rsi/evidence/round-030/schedule-row.txt`。
- **未验证（`NOT_RUN`）**：真机 GUI 手点（把 base64 的 GnuPG 私钥喂给运行中的插件看报告）。

### 下一位接手者的第一件事

1. `POOL.md` 里 `src/checkpoint/schema.ts:59` 的注释偏差（说 1,048,576，实为 1,048,447，一行可修）——
   round 27 当时「发版后动源码会让 `lib/` 与 `v0.12.3` 不一致」的理由已随每次发版失效。
2. 其次是本轮新入池的 base64 折行宽度边界（M / low）。
3. 心跳行续订见上；不续订则 2026-11-20T10:01:50Z 之后不再有自动轮次。

## 2026-11-20 — round-029：base64 包裹的私钥不再原样进报告（`CONFIRMED`，已发版 `0.12.5`）

- **发版（`CONFIRMED`）**：patch。commit `5b7cae1`、annotated tag `v0.12.5`（对象 `47fcb52`）已推；
  远端 CI `44656151053` success、Release `44656153854` success（asset
  `dsh-grok-workflow-0.12.5.tgz`，599,562 B）。旧标签未动，无 force-push。

- **From:** agent-70（RSI round 29 子代理）· **To:** 下一轮接手者 / 用户
- **选题（`CONFIRMED`）**：`POOL.md` 红脱敏一节第一条非 DONE 项（`P · Base64-wrapped PEM has no
  rule`）。选题前与 `HEAD ce856cb` 对表：`src/redact.ts` 只有 `:27`/`:31` 两条 armor 规则，都匹配
  解码后的横幅，条目成立。
- **本轮改动**：新规则 `base64-private-key`（三条分组对齐标记，整块替换含续行）；
  `docs/ARCHITECTURE.md` 覆盖清单 + 已知缺口段；两份 README 安全条目；`lib/redact.js` 重建。
  细节见 `DECISIONS.md` D-085、`RESEARCH.md` A34、`VALIDATION.md` Round 79。
- **红绿**：旧码 worktree 里新用例 **2 failed / 1 passed**，失败输出就是整串 base64 私钥体；
  新码 **35 passed**（基线 32）。`npm run ci` **68 文件 / 1233 测试 PASS**，`verify:lib` 153 files
  一致。证据 `.rsi/evidence/round-029/`。
- **心跳行状态（`CONFIRMED`，只读核对 `~/.dsh/storages/schedule.json`）**：`RSI heartbeat` 行存在、
  `status: active`、只归属 `session-3a683cb6…`、prompt 3239 字符；`lastDelivery` 显示
  2026-11-20T01:01:50Z 投递成功（首次真实投递成立）。**但 rrule 是
  `FREQ=MINUTELY;INTERVAL=60;COUNT=10`，最后一次落在 2026-11-20T10:01:50Z——撑不到 2026-12-01。**
  子代理会话被宿主拒绝使用 `schedule_*` 工具（`A delegated subagent cannot use scheduled tasks`），
  故「armed through 2026-12-01」这条只能由主会话/操作者续订（延长到 12-01 或改成每日 rrule）。
- **未验证（`NOT_RUN`）**：真机 GUI 手点、把 base64 私钥喂给运行中的插件看报告。

### 接手时的四条遗留不确定性（2026-11-20 · `0.12.5`）

1. **检查点注释上限偏差（未闭合，已定位）**：`src/checkpoint/schema.ts:59` 的注释说拒绝带跑到
   1,048,576，但密封文件带 129 字节完整性记录，`writeCheckpoint` 的文件上限把合法载荷卡在
   **1,048,447**（A33 实测 1,019,510 + 129）。round 27 当时不改的理由是「发版后动源码会让 `lib/`
   与 `v0.12.3` 不一致」——`0.12.5` 已经重建过 `lib/`，这个理由失效，一行注释即可修，已作为
   `POOL.md` 的 P 项排队。
2. **`readCheckpoint` 无生产调用者（已闭合为事实）**：在本提交 `a85d3bb` 上核过——定义在
   `src/checkpoint/writer.ts:137`，全仓库除 `wiring.ts:246` 的一句文档提及外无引用；`src/run.ts:21`
   只导入写侧的 `createCheckpointRecorder` / `unloadCheckpointRecorders`，`src/index.ts` 不导出
   checkpoint 模块。所以 round 27 修的是**读写往返**断裂，不是观察到的续跑失败。
3. **宿主进程内存里的代码身份不可观测（未变，`NOT_RUN`）**：插件不打印版本、ESM 缓存无版本标记、
   `dsh-hmr` 挂载为 `root: []`，只能证明「磁盘/档案/prof 标签一致 + 宿主未重启」。
4. **GUI 点按与真实定时投递（一半闭合）**：真实定时投递本轮**首次拿到硬证据**——只读快照显示
   `RSI heartbeat` 行 `lastDelivery.scheduledAt = 2026-11-20T01:01:50Z`、
   `deliveredAt = 2026-11-20T01:02:00.707Z` 且带 `messageId`，行 `status: active`、只有一个归属会话
   `session-3a683cb6…`（证据 `.rsi/evidence/round-029/schedule-row.txt`）。**但该行 rrule 是
   `FREQ=MINUTELY;INTERVAL=60;COUNT=10`，最后一次 2026-11-20T10:01:50Z，撑不到 2026-12-01**；
   本会话是子代理，宿主拒绝 `schedule_*`（`A delegated subagent cannot use scheduled tasks`），
   所以「续订到 12-01」只能由主会话或操作者做。GUI 手点仍 `NOT_RUN`。

## 2026-11-20 — `0.12.4` 已发版（round-028：R11）

- **From:** RSI 心跳轮（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（取消终结文案修正）。commit `5cd2b1c`、annotated tag
  `v0.12.4` 已推；远端 CI `44652383452` success、Release `44652387975` success
  （asset `dsh-grok-workflow-0.12.4.tgz`）。旧标签未动，无 force-push。
- **内容**：取消终结改说人话结论（不再带成功前言/markers/折叠台账）；
  `phase1-dialogue` 3 旧断言随行为同步更新。`npm run ci` 68/1230 全绿。
- **NOT_RUN**：真机 GUI 手动取消看终结；真实定时投递。本机 `web` profile 仍是旧版，
  想用新版就从 `github:free6589/dsh-grok-workflow#v0.12.4` 更新。

## 2026-11-20 08:55 — round-027：检查点「写得进读不出」修掉，接下来只剩 R11 与 panel 问题

- **From:** agent-65（round 27，update-then-self-iterate）· **To:** 下一轮 / 用户
- **本轮（`CONFIRMED`）**：`integrity.bytes` 的读侧上限从 `countCeiling`（1,000,000，行数上限）
  改为 `maxBytes`（1,048,576，写入侧同一个上限）。缺陷实测：带内载荷（481 条最大宽度证据行 =
  1,001,015 字节）修前读回 `CheckpointError('invalid', … integrity.bytes …)`，修后落盘读回校验通过。
  证据 `.rsi/evidence/round-027/`（`test-red.txt` / `test-green.txt` / `ci.txt`）。
- **选题依据（`CONFIRMED`）**：`POOL.md` 与 `HEAD` 对表后六条已陈旧（redaction 调用点、history 顺序、
  answerLead 句数、R6、R9、R10），已在池里标 STALE/DONE 并注明锚点。**下一轮从这里接**：R11
  （取消终结消息仍在组合 `relayText` 的前导与标记，`gate.ts:611-644`）与 `src/panel.ts` 无生产
  导入者（只有三个测试文件引用）这两条。
- **发行（`CONFIRMED`）**：patch 级（读侧拒绝语义修复，无新配置面）。发布提交 `fd6a5ee`、
  annotated tag `v0.12.3`（对象 `0c66263`）已推；远端 CI `44647313571` success、
  Release `44647317251` success（`dsh-grok-workflow-0.12.3.tgz`，597,237 B）。旧标签未动、
  无 force-push。`verify:lib` 提交后 = `lib/ at fd6a5ee is the build of src/ at fd6a5ee`。
- **档案（`CONFIRMED`）**：`~/.dsh/profiles/web` 升到 `#v0.12.3`，`lib/` 与
  `git archive v0.12.3 lib` 的 `diff -r --exclude='*.map'` = 0；宿主 pid `154637` 未重启；
  `plugin_manager` 里 `include:grok-workflow` 仍 `fiberPhase: active`。装好的产物自身跑通
  1,001,051 B 载荷的落盘→读回（`.rsi/evidence/round-027/shipped-roundtrip.txt`）。
- **没做到的一件小事（`CONFIRMED`，故意不动）**：`src/checkpoint/schema.ts` 的注释把带的上沿
  写成 1,048,576，实际是 1,048,447（整文件多出 129 字节的 integrity 记录）。发布后改注解会让
  `lib/` 与 `v0.12.3` 不再逐字节相同，故留给下一轮连同代码一起改。
- **仍 `NOT_RUN`（需操作者）**：真实定时投递一轮心跳（D-066，要占一个真实间隔）、GUI 手动点击截图。
- **注意**：`~/.dsh/profiles/web` 已升到本轮 tag；宿主 pid 至今未重启，profile 更新只改磁盘上的
  安装物，验收口径按 D-083 读（`HEAD == origin/main`、发布标签为祖先、发布代码与标签逐字节相同）。

## 2026-11-20 08:20 — 复查：`v0.12.2` 仍是最新，仓库和档案都停在它上面，卡点只剩验收口径

- **From:** agent-60（execution，attempt 2）· **To:** 用户 / `lead`
- **复查（`CONFIRMED`）**：远端 tag/Release 仍以 `v0.12.2`（`40228c5`）为最新；本地 `main` =
  `origin/main` = `5bd5bfe`（`git describe` = `v0.12.2-4-g5bd5bfe`），标签是祖先，其后四条 docs
  提交在 `src`/`lib`/`test`/`package.json` 上与标签 diff = 0 个文件；档案 `~/.dsh/profiles/web`
  仍钉 `#v0.12.2`、装的 `0.12.2`、77 个 shipped `lib` 文件 sha256 全同；宿主 pid `154637`
  `lstart` 未变、`etimes` 连续到 206772s+、`:3080` 仍由它持有、GUI 回 `HTTP 401`。两轮之间远端
  没有新 tag，所以既没有可 fast-forward 的提交，也没有对档案做第二次改动。
- **卡点（不是执行遗漏）**：验收项「本地 HEAD 等于最新发布标签提交」在「不回退 / 不 force-push /
  本地远端同步 / 不擅自新发版」四条约束下无解——要让 `HEAD` 正好压在标签上，只能丢已推提交、
  重写共享历史、或自己造一个 Release。取舍与四个被否方案见 `DECISIONS.md` D-083。
- **Next action（需操作者二选一）**：①把该验收项改成「`HEAD == origin/main`，发布标签为其祖先，
  发布代码与标签逐字节相同」；②显式授权发一个 `v0.12.3`（这次提交要含版本号与 changelog），让
  `HEAD` 正好落在新标签上。在此之前请不要再派代理去「把 HEAD 掰回标签」——那会丢已推提交。


## 2026-11-20 — `web` profile 已更新到 `v0.12.2`（repo 无需变动，DSH 未重启）

- **From:** lead（本会话，update-latest-no-restart）· **To:** 用户 / 下一轮接手者
- **仓库侧（`CONFIRMED`）**：本地 `main` = `origin/main` = `07666fb`，`git describe` 为
  `v0.12.2-2-g07666fb`；`v0.12.2`（`40228c5`）是 `HEAD` 的祖先，`v0.12.2..HEAD` 只有两条
  docs 提交（`074e2c3`、`07666fb`），`src/`+`lib/` 与标签逐字节相同。远端最新 tag/Release
  仍是 `v0.12.2`，无更新可拉——**没有做任何 fast-forward，也没有回退到标签提交**（回退会丢
  掉那两条已推的发布记录提交，且会让本地落后远端）。
- **档案侧（`CONFIRMED`）**：`~/.dsh/profiles/web` 的 `dsh-grok-workflow` 从
  `github:free6589/dsh-grok-workflow#v0.12.1` 升到 `#v0.12.2`，用文档里的
  `dsh plugin --profile web add ...`（`docs/RELEASING.md` §版本切换）执行；pnpm 解析到
  `codeload.../tar.gz/40228c5...`，`pnpm ls` 报 `dsh-grok-workflow@0.12.2`，`node_modules`
  里的 77 个 `lib/**/*.js|d.ts` 与仓库 `lib/` 逐文件 sha256 一致（只少 `.map`，因为发包
  `files` 不含它们）。`package.json` 只改了这一行，锁文件随之更新。
- **DSH 未重启（`CONFIRMED`）**：`dsh web` 主进程 pid `154637`，`lstart` 仍是
  `Tue Nov 17 22:49:32 2026`，`etimes` 从 206082s 连续涨到 206168s+；`/proc` boot_id 未变、
  上次开机仍是 2026-10-31；`http://100.111.111.88:3080/` 仍应答（HTTP 401 = 活着但要鉴权）。
- **代价（`CONFIRMED`，必须写清楚）**：DSH 0.2.2-rc.3 的核心里没有对档案文件的 watcher
  （`grep -rln 'fs.watch|chokidar|watchFile'` 在核心包内 0 命中），`docs/RELEASING.md` 也写明
  「切换版本后请重启对应 DSH profile」。**所以磁盘/档案已是 `0.12.2`，当前进程内存里跑的仍是
  `0.12.1` 的模块**；`0.12.1 → 0.12.2` 的两条修复（`grokDefault` fail-closed、COMPLETED 不计
  已恢复失败）要等下次 profile 启动才生效。
- **未做（`NOT_RUN`，遵约束）**：未重启/重载 DSH、未 force-push、未移动任何标签、未 npm 发布
  （`registry.npmjs.org/dsh-grok-workflow` 仍 404）、未改 DSH 核心（该目录无 `git`，最近 3 小时
  无文件改动）。
- 证据：`.rsi/evidence/profile-update-0.12.2/`（`before.txt` / `after.txt` / `verify.log`）。

## 2026-11-20 — `0.12.2` 已发版（round-026：R6 + R9）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（两条报错/报假类修复）。commit `c1be0c7`（+hygiene
  `40228c5`）、annotated tag `v0.12.2` 已推；远端 CI `44641153858` success、
  Release `44641158387` success（asset `dsh-grok-workflow-0.12.2.tgz`）。
  旧标签未动，无 force-push。
- **内容**：R6 `resolveConfig` 拒收坏 `grokDefault`（fail-closed，不再静默关工作流）+
  R9 COMPLETED 轮次不计已恢复失败（报告与台账同规则，PARTIAL 不受影响）。
  `npm run ci` 68/1229 全绿；`verify:lib` 153 文件一致。
- **NOT_RUN**：真实定时投递、GUI 手动点击拍照。（本机 `web` profile 当时还是旧版；已在下面
  第一条「`web` profile 已更新到 `v0.12.2`」里升到 `#v0.12.2`。）

## 2026-11-20 — `0.12.1` 已发版（round-025：自迭代默认模板）

- **From:** agent-50（self_iterate_full）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：patch（默认内容变更，向后兼容：已存模板的档案不受影响）。
  commit `23d3369`、annotated tag `v0.12.1` 已推；远端 CI `44595376323` success
  （Node 22 + Node 24），Release `44595391505` success
  （asset `dsh-grok-workflow-0.12.1.tgz`，594 810 bytes）。旧标签未动，无 force-push，
  未发布 npm。
- **内容**：`DEFAULT_ITERATE_TEMPLATE` 由 12 行通用提示词改为 `docs/iterate-template.md`
  的轮次提示词；`src/client/index.js` 的设置页副本同步；新增 `test/iterate-template.spec.ts`
  （文档↔常量逐字节、4000 字符上限、每个必需章节一条断言）；`test/loop-surface.spec.ts`
  补自迭代路由 `status` 用例并把模板断言改为读常量。README 双语配置表指向新文档。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **68 文件 / 1227 测试 PASS**，typecheck 0 错、
  oxlint 24 warnings / 0 errors；提交后 `npm run verify:lib` = `lib/ at 23d3369 is the build of
  src/ at 23d3369`（153 files byte-identical）；测试文件数 63 基线 → 68（只增）。
- **真机（`CONFIRMED`，复制档案 `loopfix-verify`，link 本树，`:3451`，实例已停）**：
  `live-iterate.mjs` 用真实 bundle 的开关、真实 page fetch、真实路由/服务/设置写路径；
  档案里模板已为空白（回退路径被真正走到）。开 → Schedule 行 `RSI heartbeat` 写入 3239 字符，
  与 `DEFAULT_ITERATE_TEMPLATE` 逐字节相同；关 → 只删自己那行，会话无残留、未删他人行；
  第二次开关同样干净。收尾 `~/.dsh/storages/schedule.json` 只剩操作者原有的一行。
  证据 `.rsi/evidence/round-025/`（`boot.redacted.txt` 已脱敏；cookie jar 未入库并已删除）。
- **未做（`NOT_RUN`）**：真实定时投递（D-066，操作者的事）；浏览器 GUI 手动点击拍照。
- **接手注意**：默认模板是「会被投递的提示词」，改它等于改每个空白档案的行为；改动时同时改
  `docs/iterate-template.md`、`src/config.ts`、`src/client/index.js` 三处，
  `test/iterate-template.spec.ts` 与 `test/client.spec.ts` 会立刻指出漏改。

## 2026-11-20 — `0.12.0` 已发版（round-024 三线收口）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **发版（`CONFIRMED`）**：minor（新功能向后兼容）。commit `9839025`、annotated tag
  `v0.12.0` 已推；远端 CI `44587743089` success、Release `44587748822` success
  （asset `dsh-grok-workflow-0.12.0.tgz`）。旧标签未动，无 force-push。
- **内容**：自迭代第二开关 + 可改模板（Added 1）+ 5 条 Fixed（双行清理、串线、心跳审计、
  `/grok on` 卡消息、`/grok` 开头提示词被吞）。`npm run ci` 67/1219 全绿；
  真机双路由 + 双开关生产路径全通（证据 `.rsi/evidence/round-024/`）。
- **用户动作**：本机 `web` profile 仍是 `0.11.21`，想用新开关就从
  `github:free6589/dsh-grok-workflow#v0.12.0` 更新。NOT_RUN 依旧：真实定时投递、
  浏览器 GUI 手动点击拍照。

## 2026-11-20 — settings-toggle-ui 收口：双开关 + 模板 textarea（已改，未提交）

- **From:** agent-8（settings-toggle-ui）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`（v0.11.21）
- **任务**：验证并落地设置 UI 接线——两个 composer 开关各自只创建/删除自己的 Schedule 行、
  模板 textarea 随档案持久化、生产路径测试走真实 fetch。
- **改动（`CONFIRMED`）**：`src/loop.ts`（`ITERATE_TASK_TITLE`/`ITERATE_ROUTE_PATH`、
  `LoopServiceDeps.identity`、服务内 `slotOf`/`markedOf` 绑定身份）、`src/loop-surface.ts`
  （`InstallLoopOptions.iterate`、`handleLoopRoute` 加 dispatch 参数并导出为测试缝、
  `dispatchIterateAction`——open 不收 prompt/interval）、`src/config.ts`
  （`iterateIntervalMin` + `iterateTemplate`，CONFIG_KEYS 13→15、`DEFAULT_ITERATE_TEMPLATE`）、
  `src/types.ts`（两个 ResolvedConfig 字段）、`src/index.ts`（iterate 实例 + installLoop 接线）、
  `src/client/index.js`（`makeHeartbeatSwitch` 工厂 + `GROK_WORKFLOW_ITERATE` +
  `startBothSwitches`；设置页「自迭代」分组：数字 + textarea + `error.badTemplate` 校验；
  中英 +20 键）；README 双语 + LOCAL-TESTING 同步（十五个键 + 自迭代开关一段）；
  CHANGELOG `[Unreleased]` Added 一条（双语）。
- **测试（`CONFIRMED`）**：新 `test/iterate.spec.ts` 9 例（槽位独立、按标题收回手装行并回写
  模板、空白回退、模板编辑经刷新落活行、agent open 仍拒）；`test/client.spec.ts` 97 例含新
  生产路径用例（真实 page fetch → 真 `node:http` → 真 `handleLoopRoute` → 真
  `createLoopService`，无任何 mock 成功；textarea draft→ops→save）；`loop-runtime-wiring`
  5 例（fake-web 按 path 存双路由）。`npm run ci` exit 0 = **67 文件 / 1218 测试 PASS**，
  `verify:lib` 通过（证据 `.rsi/evidence/round-024/ci-settings-run.log`）。
- **真机（`CONFIRMED`）**：隔离 profile `loopfix-verify`（link 本树，`:3451`）——
  `.rsi/evidence/round-024/switches-and-template.mjs` 驱动真实 bundle 双开关（无 send 覆盖），
  模板走真实设置写路径（describe→mutate→重 describe 逐字节回读→patch 落盘）；两开关互不
  碰对方的行、收尾无残留 Schedule 行、patch 内测试模板已恢复；实例已停，cookie 值不回显。
- **未做（`NOT_RUN`）**：真实定时投递（D-066）；浏览器 GUI 手动点击拍照。commit/push/发版
  （本任务不授权）。
- **接手注意**：树里有并发写入者（`src/intake.ts`/`src/command.ts`/`src/answer.ts`/`src/gate.ts`
  的 intake 与 `/grok on` 修复），提交前先 `git status` 分清归属；发版时把 `[Unreleased]`
  的 Added 搬进新版本段（patch 或 minor 由收尾组定）。


## 2026-11-20 — 心跳隔离第二轮：自迭代心跳成为插件第二实例后的串线已修（agent-19，已改，未提交）

- **From:** agent-19（heartbeat-routing，attempt 2）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`
- **为什么有第二轮**：第一轮（agent-9）的 `HEARTBEATS.md` / RESEARCH A30 写的是「自迭代心跳
  无插件路由、无插件工具，由操作者的 Automation 任务投递」。同一工作树随后加入了第二个
  `createLoopService`（`src/index.ts:313`，`RSI heartbeat`）、`/grok-workflow/iterate` 路由
  （`src/loop-surface.ts:148`，`dispatchIterateAction` 只收 `{action, sessionId}`）、
  `iterateTemplate` 配置（`src/config.ts:166`）和页面「自迭代」开关。第一轮的结论因此过期，
  本轮按当前树重审并把过期说法改掉。
- **真实缺陷（`CONFIRMED`，先复现后修）**：`forgetSession` 调 `deleteSessionHeartbeats`，
  后者用写死的 `isLoopSlot` 过滤 → **自迭代实例的归档清扫删掉循环的行、留下自己的行**
  （当前接线只把循环实例挂到归档事件，故今天从组合层不可达；但它是归档清扫的接口，按接口
  正确处理）。
  修复：`deleteSessionHeartbeats`（`src/loop.ts:752`）收调用实例的 `slot` 谓词（默认
  `isLoopSlot`，刹车仍只清循环行），`forgetSession`（`:650`）传 `slotOf`（`:457`）。
- **新增测试**：反方向所有权 5 例（`test/heartbeat-identity.spec.ts`，含归档/卸载/open）、
  门禁「用户粘贴 `[grok-workflow loop]` 仍 `admit`」1 例、路由层「two switches, two routes」
  4 例（`test/loop-surface.spec.ts`）、页面层路由隔离 1 例（`test/client.spec.ts`）。
- **复验（`CONFIRMED`）**：`npm run ci`（不带管道，取真实退出码）**exit 0 = 67 文件 / 1219
  测试 PASS**；负对照 1（去掉 `slotOf` 参数）**1 failed / 14 passed**，负对照 2（iterate 路由
  绑到循环服务）**2 failed / 18 passed**，两次都按 `sha256sum -c` 逐字节还原
  （`src/loop.ts` `8ec1da9b…`、`src/loop-surface.ts` `a19c8920…`）。live
  `~/.dsh/storages/schedule.json` 只读 = 一条无关任务、两心跳未武装、本会话零写入。
  命令与数字见 `VALIDATION.md` 心跳第二轮段。
- **残留（写明，不改）**：F3 `.rsi/STOP` 双停（D-080）；F5 `Loop heartbeat` 是保留名；
  卸载只清循环行（`src/loop-surface.ts:115`），自迭代行按设计留存（D-081）——它的投递只是
  普通定时消息，不会进入任何插件处理器。真实定时投递、真机 GUI 归档后任务列表仍 `NOT_RUN`。
- **本任务写面**：`src/loop.ts`、`test/heartbeat-identity.spec.ts`、`test/loop-surface.spec.ts`、
  `test/client.spec.ts`（只新增 1 例 + bundle 类型字段）、`lib/*`（构建产物）、
  `docs/knowledge/HEARTBEATS.md`（按当前树重写）、`CHANGELOG.md`、记忆六件。
  工作树里的 `src/intake.ts`/`src/command.ts`/`src/answer.ts`、`test/iterate.spec.ts` 与
  `test/client.spec.ts` 的生产路径用例是**并发任务**的改动；CI 前两跑红在对方正在编辑的
  client 用例，对方 01:32 完成后同命令全绿。

（Loop ↔ Iterate 互不触发，已改，未提交）

- **From:** agent-9（heartbeat-routing 审计收尾）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`（v0.11.21）
- **结论（`CONFIRMED`）**：两个心跳的身份与路由已按 D-079/D-080 落地并独立复验——
  Loop（`Loop heartbeat` / `[grok-workflow loop]` / `/grok-workflow/loop` / `grok_loop`，
  `src/loop.ts:66/69/108/111`）与 Iterate（`RSI heartbeat` / `# RSI heartbeat — round N`，
  来自 `.rsi/HEARTBEAT.md:24`，无插件路由、无插件工具）互不进对方的门禁分支：
  `classifyPreStep`（`src/gate.ts:484`）先查心跳（`:496`）再过滤用户源（`:503`），
  `isHeartbeatMessage`（`:532`）要求 `source.kind==='schedule'` **且** `isLoopHeartbeat`，
  Iterate 投递落在 `non-user-source` 直通（`loop.review/admit/stop` 全不调用，刹车spy 钉死）。
  存储身份 `isLoopSlot`（`src/loop.ts:292`）只认保留名 + `rrule` + 目标会话，
  `open()` 的 refresh/resume/replace 三路都清重复行（`dropDuplicates`，`:535`）、
  删除被拒改写幸存行（`:502`）、`close/stopAll/forgetSession` 按槽位删并读回汇报——
  开关来回拨不会留下第二行，被改掉标记的行仍可收回。审计正文与证据矩阵：
  `docs/knowledge/HEARTBEATS.md`。
- **复验（`CONFIRMED`，命令与数字见 `VALIDATION.md` 心跳段「收尾复验」表）**：
  三文件 50 测试全绿；负对照（换回修前 `src/loop.ts`）**7 failed / 38 passed**、跑后按
  sha256 逐字节还原；全量 `npm run ci` exit 0 = **66 文件 / 1195 测试 PASS**；
  live `~/.dsh/storages/schedule.json` 只读检查 = 一条无关任务、两心跳未武装、本会话零写入。
- **残留边界（写明，不改）**：F3 `.rsi/STOP` 仍同时停两个心跳（方向只会停、不会串路由，
  `GROK_WORKFLOW_STOP_FILE` 可分离，D-080）；F5 `Loop heartbeat` 成为保留名——操作者若把
  自迭代任务也叫这个名字会被收回（规避：命名 `RSI heartbeat`）；真实定时投递与真机 GUI
  观察仍 `NOT_RUN`（武装任务是操作者动作，D-066）。
- **本任务写面**：`src/loop.ts`、`src/gate.ts`（心跳分支），`test/heartbeat-identity.spec.ts`（新）、
  `test/loop.spec.ts`、`test/loop-runtime-wiring.spec.ts`、`docs/knowledge/HEARTBEATS.md`（新）、
  `CHANGELOG.md`、记忆六件。工作树里 `src/intake.ts`/`src/command.ts`/`src/answer.ts` 与
  `/grok on` 后台受理是**并发任务**的改动，不属于本审计；合并时按各自 HANDOFF 段核对。

## 2026-11-19 — 新会话提示词入口加固：以 `/grok` 开头的任务提示词被命令吞掉（已改，未提交）

- **From:** agent-5（prompt-intake-stall）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`（v0.11.21）
- **结论（`CONFIRMED`）**：用户贴进新会话的「自我迭代 /grok 团队任务」提示词**不是**因长度卡住：
  实测 2 041 字符 / 3 697 字节（会话 `session-042dfe19` seq 4），另一会话 2 032 / 3 688 两次
  （`session-b7be2bd2` seq 2944/2953），都只占 32 000 字符目标预算的 6.4%，无截断。真正原因：
  第一行以 `/grok` 开头 → `dsh-commands` `parseCommand` 把整行当命令、正文成为参数 → 旧语法
  只回一行 `Usage: /grok [on|off]` → 没有 `user/message`、没有 `agent/pre-step`、没有 run，
  用户看到的等于静默。
- **改动（`CONFIRMED`）**：新增 `src/intake.ts`（`INTAKE_LIMITS` 直接取 `TASK_LIMITS.objectiveChars`；
  `inspectPrompt` / `refuseEmptyPrompt` / `refuseOversizePrompt` / `refuseDiscardedCommandPrompt` /
  `isPromptShapedArgument` / `assembleTaskPrompt`，拒绝文本一律英中两行 + 实测字符数 + 分段数 +
  下一步）；`src/command.ts` 非开关参数按形态分档（单行 = `GROK_USAGE_TEXT`，多行或 >200 字符 =
  带字符数的双语拒绝，**开关语义与回读校验逐字未动**）；`src/gate.ts` `refusalOf` 与迟到目标
  统一走 intake；新增 `docs/task-prompt-template.md`（默认模板 + 入口规则 + 证据）；
  `test/intake.spec.ts`（14 条，含模板自检：模板在预算内且不以 `/` 开头）、`test/command.spec.ts`
  +3 条（复刻 2 041 字符真形状与 `/grok on /grok …` 形状）、`test/objective-limit.spec.ts`
  +1 条（空消息双语拒绝）、built-artifact 守卫改钉新接线点。
- **证据（`CONFIRMED`）**：`docs/knowledge/evidence/prompt-intake-2026-11-19/`
  （`measure-intake-stall.py` + `measure-output.txt` 实测 40 次 `/grok` 调用；`red-full.log`
  = 修前 8 failed / 42 passed；`ci.log` = `npm run ci` exit 0，**66 文件 / 1195 测试 PASS**）。
- **未做（`NOT_RUN`）**：真机 GUI 用修好的构建粘一次同一提示词（本轮同一工作树有并发写入者，
  实例留给收尾组）；commit / push / 发版（本任务不授权）。
- **合并注意**：本任务未提交。同一工作树里 `src/answer.ts`、`src/loop.ts`、`src/client/index.js`、
  `CHANGELOG.md`、`docs/knowledge/VALIDATION.md`、`lib/*` 有其它并发写入者的改动；`D-078` 的编号
  可能与并发任务撞号，合并时以先入库者为准并顺延另一个。`/grok on` 之后发不出消息那条
  （agent-2 的 `answerFullBehind`）与本任务是相邻但不同的问题：那条改的是 `full` 形态的等待方式，
  本任务只动参数入口。

## 2026-11-19 — 用户报障：`/grok on` 之后发不出消息（已改，未提交）

- **From:** agent-2（本任务）· **To:** lead / 收尾组 · **Base:** `main` = `22bbe17`（v0.11.21）
- **根因（`CONFIRMED`）**：`/grok on` 写 `workflowMode: 'full'`（`src/command.ts:142`），
  `full` 是唯一绕过交互式受理的形态：`answerTeamInteractive` 只接 `triage`
  （`src/gate.ts:1281`），`full` 落到 `await produceAnswer(...)`（修前 `:1458`，现 `:1550`），
  `in-turn` 于是把整步开着等 run 跑完；真实 `AgentLoop` 只在当前 step 结算后才
  `inbox.claim()` 下一批（`dsh-agent-loop/lib/index.js:683`，`turn()` 的 `while` 在 `:752`、
  `step` 在 `:780`），所以那段时间（默认 deadline 60 分钟，`src/config.ts:104`）用户打的每条
  消息都只进队列、永不派发。`/grok off` 走 `mode-off` 直接 pass，故「off 就行」。
- **改动（`CONFIRMED`）**：`src/gate.ts` 新增 `answerFullBehind`（会话记录
  `workflowMode === 'full'` + 能后台交付）：先回执 + `enqueue` 后台跑 + `deliverAndRecord`
  单独发结论；`src/answer.ts` 新增 `acceptedEnterText`；`test/grok-on-ingress.spec.ts`
  5 条回归（复刻 `AgentLoop` 派发纪律 + 真 `Session` + 挂起引擎，无需在线模型）。
  部署级默认 `mode: 'full'` 保持 T4 `in-turn` 逐字不变（gate 17 条用例钉着）。
- **证据（`CONFIRMED`）**：修前 `npx vitest run test/grok-on-ingress.spec.ts` = 2 failed /
  2 passed；修后 = 4 passed；`gate + phase1-dialogue + human-output-contract + 新用例`
  = 4 文件 / 99 测试 PASS；`npm run typecheck` 0 error。
  独立复核（agent-17，2026-11-20）：修前数据由 `HEAD` worktree 复跑确认
  （`docs/knowledge/evidence/grok-on-ingress-2026-11-19/repro-before-head-worktree.log`）；
  `npm run ci` 两处跑绿：共享工作树 exit 0 = **67 文件 / 1218 测试**
  （`.../shared-tree-ci-green.log`）；「`HEAD` + 只本修复」隔离树 exit 0 = 64 文件 / 1164
  测试（`.../ci-isolated-fix-only.log`）。同日更早几次共享树是红的，红点全在并发写入者的
  半成品上（`src/client/index.js:1514` 语法错、`test/client.spec.ts` 的 `TS2304`、配置面 5
  文件），随他们落地转绿，与本修复无关。
- **未做（`NOT_RUN`）**：真机 GUI 连发两条（同一工作树有并发写入者，实例留给收尾组）；
  commit/push/发版（本任务不授权）。
- **接手注意**：本树有并发写入者（`src/loop.ts`、`src/command.ts`、`src/intake.ts`），
  提交前先 `git status` 确认哪些是你的；`lib/` 需在提交前重建。
- **已知遗留**：部署级 `mode: 'full'` + 交互式会话仍走 in-turn（同样的等待问题）；改它要
  同时改 17 条钉住 T4 契约的用例，属独立决策。

## 2026-11-19 — 用户报障修：续跑开关点不动 + `HTTP undefined`（已提交，未 push/未发版）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **根因（`CONFIRMED`）**：`LoopSwitch` 生产默认 `send = props.loopSend ?? loopSend`，
  把请求体形的 `loopSend(body)` 当 fetch 传：真机上每次读取都被包两层，
  内层返回的 `{ok:false}` 对象无 `.status`，外层报 `loop/response` + `HTTP undefined`，
  开关 `failed` 卡死、点不动。测试全用 mock `loopSend`，生产路径零覆盖，故 CI 全绿也拦不住。
- **改动（`CONFIRMED`）**：`src/client/index.js` 默认改走页面 `fetch`（5 行 + 注释）；
  `test/client.spec.ts` 新增生产路径回归用例（不传 `loopSend`，挂载→读→点开→点关）；
  `CHANGELOG.md` `[Unreleased]` 双语 Fixed；`lib/` 重建。提交 `1c28c6d`，
  **未 push、未打 tag、未建 Release**。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **63 文件 / 1159 测试 PASS**；
  `npm run verify:lib` = `lib/ at 1c28c6d is the build of src/ at 1c28c6d`
 （149 files byte-identical）。证据 `.rsi/evidence/round-023/`。
- **真机（`CONFIRMED`）**：复制 profile `loopfix-verify`（link 本树，`:3451`）——
  路由 `status→open→status→close→status` 5×200、关后无残留行；真实 bundle 生产路径脚本
  mount 显示 `关` → 点开 `开 · 每 60 分钟 · 还剩 10 轮`（服务端确认 task）→ 再点回 `关`
  （服务端确认关闭）。实例已停，token/cookie 已清，证据无密钥。
- **Next action**：用户在自己浏览器点一次开关确认 → 确认后 push + 按 `docs/RELEASING.md`
  走 patch 发版（`[Unreleased]` 只有这一条 Fixed）。`loopfix-verify` profile
  留在 `~/.dsh/profiles/`，复用或删除由用户定。

## 2026-11-19 — round 21 落地（C1 提示补 `supervisor`）+ 脏树清理：遗留 mock 已归位归档

- **From:** 清理任务（子代理）· **To:** 用户 / 下一轮接手者
- **本轮改了什么（`CONFIRMED`）**：`src/run.ts` `configRouteLabels()` 补 `supervisor`
  （五个角色、报告顺序），`test/route-concurrency.spec.ts` 钉住五角色标签列表；
  `CHANGELOG.md` `[Unreleased]` 双语 Fixed；`lib/` 由 `npm run build` 重建。开发提交
  `3cd68eb`，**未 push、未打 tag、未建 Release、未发 npm**。
  这段改动与红/绿证据原本是并发写入者 17:04:54–17:05:02 留下的未提交工作，本次核实后落地。
- **脏树处置（`CONFIRMED`）**：`M src/run.ts`、`M test/route-concurrency.spec.ts`、
  `M CHANGELOG.md`、`M lib/run.d.ts|js|map`、`?? .rsi/evidence/round-021/` 全部有价值 →
  提交；`git status --short --branch` 收工为干净（仅 `## main...origin/main [ahead 1]`）。
- **遗留文件（`CONFIRMED`）**：根目录的 `settings-simple-mock.html`（179 行，sha256
  `3fe1e657…`，D-055 设置面瘦身的设计输入）已逐字节存到
  `.rsi/archive/settings-simple-mock.html`，来源/完整性/还原命令见
  `.rsi/archive/README.md`，根副本删除。**旧结论「`settings-simple-mock.html` 允许未跟踪、
  永不入库」就此作废**：仓库不再保留任何「故意未跟踪」的根文件，需要留存的草稿一律放
  `.rsi/archive/`（不进 npm 包，`package.json` `files` 只含 `lib/**`、`docs/*.md`、
  `docs/images` 等）。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **63 文件 / 1157 测试 PASS**，
  `tsc --noEmit` 0 error，oxlint 22 warnings / 0 errors，`npm run build` 连跑逐字节一致，
  `npm run verify:lib` = `lib/ at 3cd68eb is the build of src/ at 3cd68eb`（149 files
  byte-identical）。证据 `.rsi/evidence/round-021/`。
- **未验证（`NOT_RUN`）**：两个真实并发 run 的忙闲避让效果（提示只在脚本侧降权）；
  GUI 观感；发版链路。
- **接手注意**：本地比远端多一个提交（`origin/main` 仍是 `337b061` = `v0.11.19` 的树）。
  下一轮若要发版，先 `git push origin main` 走 fast-forward，再按 `docs/RELEASING.md` 打
  patch tag；不要 force-push，不要移动 `v0.11.14`–`v0.11.19`。

## 2026-11-19 — `0.11.17` 发版 + tag 安装验证 + 本机 GitHub 更新（已全部落地）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：
  1. 发版（patch，用户已授权）：`bump-version.py 0.11.17` 同步 5 处
     （`package.json`+`package-lock.json`+两份 README+`LOCAL-TESTING.md` tgz 名）；
     CHANGELOG `[Unreleased]` Added 搬进 `## [0.11.17] - 2026-11-19`；
     README 测试数 62/1142 → 63/1154（双语）。commit `5fc3e1d`、annotated tag
     `v0.11.17` 已推 `origin/main` 与 `origin/v0.11.17`；远端 CI `44459682983`
     success；Release `Grok Workflow for DSH v0.11.17` 已建
    （asset `dsh-grok-workflow-0.11.17.tgz`）。旧标签未动，无 force-push。
  2. tag 安装验证 PASS（隔离 profile `acc-tag`，`DSH_HOME=.tmp/r18/home`，端口 3442，
     从 `github:free6589/dsh-grok-workflow#v0.11.17` 装——无本地路径）：
     行激活、投影 11 键、`grok_workflow`+`grok_loop` 双工具、`loop` 路由
     status→open→close 全通（400/401/405 行为符合文档）、`lib/guardian.js`
     逐字节一致、client 三处一致。证据 `.rsi/evidence/round-018/install/`。
  3. 本机更新：`DSH_HOME=/home/fish/.dsh dsh plugin --profile web add
     github:free6589/dsh-grok-workflow#v0.11.17` exit 0（`0.11.13` → `0.11.17`，
     guardian.js sha256 `072068d4…` 两侧一致，`--dump-config` 行正常）。
     依赖 pin 从 `github:free6589/dsh-grok-workflow` 变为带 tag 后缀
     `github:free6589/dsh-grok-workflow#v0.11.17`——后续 `main` 更新不再自动跟进，
     下次发版时再显式更新。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **63 文件 / 1154 测试 PASS**
  （`.rsi/evidence/round-018/release-ci.txt`）；`lib/` 构建幂等；
  D-074 状态已改为已发版。
- **未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听
  firing（操作体已 CONFIRMED）。
- **接手注意**：`settings-simple-mock.html` 仍是未跟踪草稿，**不入库**；
  P3-01 / P3-02 仍 OPEN；`src/index.ts:292` 注释仍 HYPOTHESIS 未动。
  `.tmp/r18` 已删；`.rsi/evidence/round-018/install/` 的 `20-run-install.sh` 是
  GitHub-tag 版 harness（round-17 的是 tarball 版），下次复用认准文件名相同但
  第一节不同。
- **Next action**：本轮已收口（提交见下）；P3-01/P3-02 或新主题按 PROTOCOL §2 选。

## 2026-11-19 — 常驻并行监护落地（未发版，未提交）

- **From:** lead（本会话）· **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：监督从串行环节改为常驻并行监护，与主流程并存。
  新增 `src/guardian.ts`（`RunGuardian` 状态机：run 启动前创建、adopt 绑定 live run、
  只读 `workflow/agent-start/agent-end/end`、超时/心跳丢失任一即 firing、每 run 最多
  一次 `run.cancel()`、findings 以 `Guardian` 相追加进报告 errors 且不改 status、不调
  `agent()` hook、零模型调用）；`src/run.ts` 四处接线（创建/订阅/adopt/`finally` 折叠/
  `disposeActiveState` 经 `unloadRunGuardians` 清理）；`test/guardian.spec.ts` 12 条
  （状态机 3、stall 处理 5、卸载清理 4，含 run 级并行存在用例）。
  RESEARCH 写了 **A29**（实现位/状态源/判定/动作与上限），DECISIONS 新增 **D-074**，
  ARCHITECTURE 执行设计图 + Supervise 节 + Lifecycle 三处更新，README 中英各加一段
  + roles 表格行改说法，CHANGELOG `[Unreleased]` 加一条 Added（双语）。
  串行 supervisor（`src/script.ts`）**零改动**。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **63 文件 / 1154 测试 PASS**
  （基线 62/1142，+1 文件/+12 测试），lint 22 warnings / 0 errors（与基线一致），
  `npm run verify:lib` 在提交前仍报“145 文件、与基线一致”（新 `lib/guardian.*`
  尚未计入——提交后复核见 VALIDATION）。
  证据：`.rsi/evidence/round-018/`（`baseline-ci.txt`、`full-ci.txt`、`stuck-sim.mjs/txt`）。
- **验收对照**：①并行存在：run 级用例录下订阅快照（start/end 监听峰值 ≥3，progress/
  archiver/guardian 各一）+ `adopted children=1 open=1 timerArmed=true`；
  ②卡住模拟：`t+5999 findings=0` → `t+6000 findings=1 signal=heartbeat-loss
  action=cancel-run` → 126s 后仍 1 条、cancel 恰一次；
  ③卸载无残留：`finish` 释注册表、`unloadRunGuardians` 1→0、listeners 清空；
  ④原 supervisor 回归：`routing` 25 条 + `engine-contract` 15 条 PASS，script 未动；
  ⑤`npm run ci` exit 0（上）。
- **未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听
  firing（操作体已 CONFIRMED）。真机只跑了隔离 profile 的 gate 路径，无模型调用。
- **接手注意**：`settings-simple-mock.html` 仍是未跟踪草稿，**不入库**；
  P3-01 / P3-02 仍 OPEN；`src/index.ts:292` 注释仍 HYPOTHESIS 未动。
  **不要 `git add -A`**：`.rsi/evidence/round-018/` 与上述文件已按清单暂存，其余
  未跟踪文件（尤其 `settings-simple-mock.html`）不属于本轮。
- **Next action**：本轮提交 + push（命令见 VALIDATION 本轮段）；发版需操作者授权，
  下一版应为 patch（用户可见新增），把 `[Unreleased]` 的 Added 搬进新版本段。

## 2026-11-19 — RSI round 16：续跑开关与心跳刹车落地（未发版）

- **From:** 执行代理 agent-56（任务段 `segment 5/5`，收口轮）· **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：把工作树里那份未提交的实现（composer dock 开关 + `src/loop-brakes.ts`）
  核对、记录并**落地成一个提交**：`CHANGELOG.md` `[Unreleased]` 补两条 Added（双语）、
  `DECISIONS.md` 新增 **D-072** 并把 D-069「现状」段 / D-071 的过时一句指回它、`STATE.md` /
  `VALIDATION.md` / 本文件 / `.rsi/ROUND.md` / `.rsi/STATE.md` 记本轮；`src/`、`test/` 的代码内容
  没有在本轮改动（开工与收工指纹一致）。
- **门禁（`CONFIRMED`）**：`npm run typecheck` exit 0 · `npx oxlint src test` 22 warnings / 0 errors ·
  `npm run build` 后 `lib/` 145 文件 md5 清单与构建前完全相同（幂等）· `npx vitest run`
  **62 文件 / 1139 测试 PASS** · 提交后 `npm run verify:lib` 见 `.rsi/ROUND.md` Round 16 的 Landed as 段。
  日志在 `.rsi/evidence/segment-5/`。**落地（`CONFIRMED`）**：commit `e11d100`、`push origin main`
  （`37cb0fc..e11d100` 快进）、远端 CI run `44425357004` success（Node 22 + 24）、提交后
  `npm run verify:lib` = `145 files, byte-identical`。
- **未验证（`NOT_RUN`）**：真实 Web GUI 里点一次那个开关；真实心跳投递（D-066，操作者动作）。
  本轮没有启动 DSH 实例，也没有创建、修改或删除任何 Schedule 任务。
- **发版（`NOT_RUN`，需要操作者授权）**：本轮只提交到 `main`，**没有** bump 版本、没有打标签、
  没有建 Release、没有 npm 发布。开关是用户可见的新增，下一次发版应走 patch（`0.11.16`）并把
  `[Unreleased]` 两条搬进新版本段；`finish-round.py` 的流程对这份提交可直接快进使用。
- **接手注意**：`settings-simple-mock.html` 仍是未跟踪的草稿，**不入库**（round 15 的结论未变）；
  P3-01 / P3-02 仍 OPEN，是本轮之后仅剩的池内条目；`src/index.ts:292` 那句
  「an open loop survives a plugin reload and an unload deletes it」两半仍对不上（A27 §5 的
  `HYPOTHESIS`），改它要连 `lib/` 一起重建，留给下一次动 `src/index.ts` 的人。

## 2026-11-19 — 文档记忆回接：round 15 的记录被并发写入者按旧副本覆盖，`D-070` 撞号

- **From:** 执行代理 agent-41（任务段 `segment 1/5`）· **To:** 用户 / 下一轮接手者
- **现象（`CONFIRMED`）**：工作树里另一位写入者在 00:26–01:39 之间把 `STATE.md` / `HANDOFF.md` /
  `VALIDATION.md` / `.rsi/ROUND.md` / `.rsi/STATE.md` 按 round 14 的旧副本落回，等于删掉 round 15
  （`v0.11.15` 发布）的全部记录；`DECISIONS.md` 里新写的「预设缺口在续跑面之后怎么落」又占用了
  `D-070`，与 round 15 的发布事故条同号。当时的 `git diff --numstat`：`0/17`（`.rsi/ROUND.md`）、
  `1/48`（`STATE.md`）、`0/11`（`HANDOFF.md`）、`0/17`（`VALIDATION.md`）、`85/60`（`.rsi/STATE.md`）
  —— 四个纯删除加一个整篇回退，所以「复原」不会丢掉任何属于他人的新增内容。
- **处理（`CONFIRMED`）**：`git checkout HEAD -- docs/knowledge/STATE.md docs/knowledge/HANDOFF.md
  docs/knowledge/VALIDATION.md .rsi/ROUND.md .rsi/STATE.md` 把 round 15 记录放回原处；`DECISIONS.md`
  里恢复发布事故条为 `D-070`、把预设缺口条改为 **`D-071`**，并同步 `RESEARCH.md` A26 的那一处引用。
- **新增（`CONFIRMED`）**：`RESEARCH.md` 新增 **A27**，回答上一轮留空的 `host_loop_service` 判据
  （LoopService 不是服务注册；Schedule 靠 `ctx.get` 查、查不到走 503；工具与路由各自 `effect` 撤回；
  卸载 `await stopAll` 删光自己的行、会话停/归档删一行、删除数按 `catalog` 复核）；并在 A24 §5b
  加了一句时态更正——「客户端没有控件」只对已落地的 `v0.11.15` 成立，工作树里有一份未提交的实现。
- **验证（`CONFIRMED`）**：`npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts
  test/docs-architecture-version.spec.ts` → **3 files / 23 tests passed**（本轮未改 `src/`、`test/`、`lib/`）。
- **树状态（`CONFIRMED`，重要）**：并入时另一位写入者仍在跑（`lib/loop-brakes.js` 生成于 07:35）。
  **不要** `git add -A`：`src/loop-brakes.ts`、`test/loop-brakes.spec.ts`、`src/client/index.js` 的
  composer 开关、`settings-simple-mock.html` 都还没有人审阅。文档若再次被「按旧副本重建」，先跑
  `git diff --numstat -- docs .rsi` 看是不是纯删除，再决定复原还是接受。
- **Next action**：与 round 15 的交接一致（P3-01 / P3-02，或客户端开关那一轮）；文档侧没有新待办。
  `src/index.ts:292` 那句「an open loop survives a plugin reload and an unload deletes it」两半对不上，
  读者先看 A27 §5 —— 它是注释措辞缺陷，改它得连 `lib/` 一起重建，留给拥有 `src/` 的那一轮。

## 2026-11-19 — RSI round 15：`v0.11.14` 发布事故收口，`0.11.15` 是第一个真正带续跑面的发布

- **From:** 执行代理 agent-29（任务 `docs_release_memory`，attempt 2）· **To:** 用户 / 下一轮接手者
- **为什么有这一轮（`CONFIRMED`）**：round 14 的 `v0.11.14` 只推了标签；Release 工作流在
  `Verify committed build artifacts` 失败（run `44345622700`），标签提交 `20eafea` 的 `lib/loop.js`
  是更早的 `src/loop.ts` 构建的（`grep -c callSchedule`：src 12 / lib 0），所以**该标签没有 GitHub
  Release**，也没有任何压缩包发布。`8c8e367` 修好了 `main`，但修不了已发布的标签。
- **本轮做法（`CONFIRMED`）**：在独立克隆 `.worktrees/release-015`（基线 `b0d6d10`）里按 R6 走
  `finish-round.py` 打 `0.11.15`（patch）。**没有移动/删除/重打任何旧标签，没有 force-push，没有 npm
  发布**；`v0.11.14` 原地保留，并在两份 README 与 CHANGELOG 里写明它不是发布版本、安装请固定 `v0.11.15`。
- **内容（`CONFIRMED`）**：构建产物重建（`src/`、`test/` 零改动，`lib/` 与源码一致性由发布工作流自己的
  `git diff --exit-code -- lib/` 验证）+ README 测试数更正（`1022 / 57` → `1081 / 60`）+ 安装区一句
  「不要固定 `v0.11.14`」+ `D-070`（四个备选与授权范围）+ 本轮记录。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = 60 文件 / 1081 测试 PASS、lint `22 warnings / 0 errors`
  （`.rsi/evidence/round-015/pre-release-ci.txt`；发布脚本那次是 `ci.txt`），ROUND.md Round 15。
- **树状态（`CONFIRMED`，重要）**：主工作树在 round 15 期间仍有另一位写入者的未提交工作
  （`src/client/index.js` 的设置页开关、`src/loop-brakes.ts`、`scripts/verify-lib.mjs`、`src/config.ts`、
  `src/gate.ts`、`test/*.spec.ts` 等，21 tracked + 6 untracked）。**这些没有进 `0.11.15`**，也未经本轮
  审阅；接手者先跑 `npm run ci` 再决定它们属于哪一轮（其中 `verify:lib` 把 `npm run ci` 改成先导出
  `HEAD` 再重建比较，是一个独立主题）。
- **Next action**：P3-01（设置页逐路由上限与死线字段的文案）或 P3-02（进度页「没有报告事实的成员」详情行）；
  另一条候选是 D-069「现状」里的客户端开关——那正是上面仍未提交的那份工作。
- **落地（`CONFIRMED`）**：commit `50c0321`、annotated tag `v0.11.15`（object `e52a8f4`，peel
  `50c0321`）、`origin/main` = `50c0321`；远端 CI run `44359410024` = success，Release run
  `44359422843` = success（16 步全绿），Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.11.15 带
  `dsh-grok-workflow-0.11.15.tgz`（523743 B）并标为 Latest；`verify:lib` 在 `50c0321` 上报
  `141 files, byte-identical`。旧标签未动（`v0.11.14` object `2a7b074` / peel `20eafea`）。
- **一次并发代价（`CONFIRMED`）**：本轮运行期间另一位 agent 把 `3c24f92`（`verify:lib` 门禁）与
  `09d5daa`（证据）推上 `main`，所以第一次 `push origin main` 被拒（非快进）。发布提交 rebase
  （`e46a302` → `50c0321`），**从未推送过**的本地标签删除后在 rebase 提交上重建，再推。
  同一时刻主工作树的本地 `main` 上还有一个未推送的记录提交 `65bbd87`（工作树门禁 61/1131）；
  接手者先 `git pull --rebase` 再提交。本轮只动文档与记录，冲突面在 `DECISIONS.md` / `CHANGELOG.md`。

## 2026-11-18 — RSI round 14 落地并发布 `0.11.14`：续跑（loop）面 + 双语文档 + D-068/D-069

- **From:** 执行代理 agent-8（任务 `docs_release_memory`）· **To:** 用户 / 下一轮接手者
- **交付（`CONFIRMED`）**：round 14 把「四个 `loop*` 键存着没人读」这件事收口——
  `src/loop.ts`（服务：策略、规则、行选择、清理）、`src/loop-surface.ts`（`grok_loop` 工具 +
  `POST /grok-workflow/loop` 路由 + 卸载/归档清理）、`src/config.ts`（四个键进 `CONFIG_KEYS`、
  `HARD_LIMITS`/`LIMIT_CAPS`、载入期 repair）、`src/client/index.js`（设置页「续跑」一组四字段）；
  测试 `test/loop.spec.ts` 27、`test/loop-surface.spec.ts` 14、`test/heartbeat-guard.spec.ts` 14。
- **语义（写给下一位，别凭直觉改）**：一条循环 = Schedule 里一条 `rrule` 任务，插件不持 timer；
  `open` 只能由不带 actor 的浏览器请求发起（工具 `open` 抛 `loop/user-only`）；轮数上限写进 `COUNT`
  是硬止损；连败轮数只是文案（回执只证明收件箱写入）；关闭/卸载/停止/归档一律**删行**不暂停。
  细节与备选见 `DECISIONS.md` D-069。
- **顺序授权**：本轮按操作者授权先落 P4 续跑面，**P3-01/P3-02 仍 OPEN 且编号不变**（`D-068`）。
  授权只覆盖顺序；CI/证据/双语 CHANGELOG/不移动标签这些门一条没放宽。
- **文档**：README 中英各一节「Repeat runs / 自动接着跑」（开关、参数、心跳行为、停的语义）+
  已知限制一条；表里 `loopEnabled` 一行原来说「由输入框旁的开关打开和关闭」，而客户端**没有任何代码
  调那条路由**（`grep -rn "grok-workflow/loop" src/` 只有 `src/loop.ts:56` 一处常量），已改成可核对的
  说法；`CHANGELOG.md` `## [0.11.14] - 2026-11-18` 双语。
- **通过的门（`CONFIRMED`）**：`npm run typecheck` exit 0；`npm run ci` exit 0 =
  lint `Found 22 warnings and 0 errors`、**60 文件 / 1081 测试 PASS**
  （`.rsi/evidence/round-014/ci.txt`，发布脚本那次；文档侧先跑的 `pre-release-ci.txt` 是 60/1080，
  两者差 1 条路由用例）。上一轮 57/1022 → 本轮 +3 文件 / +59 测试，无删除、无 skip。
- **未做（`NOT_RUN`）**：真机心跳投递（没有创建/修改/删除任何定时任务，D-066 规定第一条心跳是操作者
  动作）；在活的 Web GUI 里点一个真正会 POST 那条路由的控件——**客户端还没有这个控件**，今天的用户
  可达路径就是那条 HTTP 请求。
- **发版（`CONFIRMED`）**：`0.11.14`（patch）——`package.json`/`package-lock.json`/两份 README 的版本句、
  安装 pin、已发布列表/`docs/LOCAL-TESTING.md` 压缩包名同步；commit `20eafea` + annotated tag
  `v0.11.14`（object `2a7b074`，peel `20eafea`），`origin/main` = `20eafea`，`git ls-remote --tags
  origin` 与本地同集合（40 个标签），旧标签逐个未动，无 force-push，未发布 npm。
- **树状态提醒（`CONFIRMED`，不是本轮产物）**：本提交之后，同一棵工作树里另一个进程继续改了
  `src/loop.ts`、`src/loop-surface.ts`、`test/loop-surface.spec.ts`（路由 `413`「body 过大」与
  `409`「Schedule 拒绝」两个用例）。这些改动**不在** `20eafea` 里，本轮特意**没有**把它们塞进发布
  提交（未验证的他人半成品不配 tag）；接手者应先跑全量 `npm run ci` 再决定它们属于哪一轮。
- **发布事故（`CONFIRMED`，必须读）**：`v0.11.14` 的标签提交 `20eafea` 远端 CI **红**
  （run `44345615218`），Release 工作流在 `Verify committed build artifacts` 一步**失败**
  （run `44345622700`），所以**该标签没有 GitHub Release**（`gh release view v0.11.14` →
  release not found）。根因：同一棵树里另一个进程在 `npm test` 与 `git add` 之间改了 `src/loop.ts`，
  提交里的 `lib/` 是上一次构建（`git show 20eafea:src/loop.ts | grep -c callSchedule` = 12，
  `…:lib/loop.js` = 0）。**已修复在 main**：`8c8e367 fix(build): rebuild lib/loop.js …`（纯构建产物，
  独立 worktree 里重建，fast-forward 推送），远端 CI 转绿（run `44349708692`）。
  **没有**移动/删除/重打标签——已发布标签不可变；`workflow_dispatch` 会 checkout 同一个不可变提交，
  重跑只会在同一步再失败。补救方式是从 `main` 打下一个 patch 版本（新建 Release 需明确授权）。
- **一处待补的验证（`CONFIRMED`）**：`20eafea` 的 `src/loop.ts` 已含 `loop/schedule-refused` 映射，
  但 413/409 两条路由用例没进那次提交（`git show 20eafea:test/loop-surface.spec.ts | grep -cE
  "413|409|schedule-refused"` = 0）。它们与另外几处 `src/` 改动在本轮结束时仍在工作树里，未提交。
- **Next action（下一轮）**：按 `PROTOCOL` §2 的默认顺序取 P3-01（设置页逐路由上限与死线字段的文案）
  或 P3-02（进度页「没有报告事实的成员」详情行）；另一条独立候选是「给客户端加一个真正会 POST
  `/grok-workflow/loop` 的控件」——那是 `src/` 改动，需要自己的测试与单独一轮主题（D-069）。

## 2026-11-18 — 心跳 prompt 与守护逻辑落地（未开新一轮，未建定时任务）

- **From:** 执行代理 agent-6（工作流子任务）· **To:** 用户 / round 14 的接手者
- **交付（`CONFIRMED`）**：`.rsi/HEARTBEAT.md`（定时任务投递的那条 prompt 模板 + 守护契约）、
  `.rsi/tools/heartbeat-guard.sh`（`RESUME`/`SKIP`/`STOP` 三判定）、
  `test/heartbeat-guard.spec.ts`（14 条，临时 fixture 内起真 git 仓，逐条钉住优先级）。
  `npx vitest run test/heartbeat-guard.spec.ts` = 14 passed（`.rsi/evidence/heartbeat-guard/spec.txt`）；
  `npx oxlint test/heartbeat-guard.spec.ts` = 0 warnings / 0 errors。
- **判定实测（`CONFIRMED`）**：在本仓跑 `.rsi/tools/heartbeat-guard.sh` →
  `SKIP code=dirty-tracked next_round=14`（round 14 在飞，33 个 tracked 改动）；
  `--max-rounds 13` → `STOP code=round-cap`。证据 `.rsi/evidence/heartbeat-guard/repo-now.txt`。
- **为什么摘要写在 prompt 里**：心跳消息 `source.kind = "schedule"`，`src/gate.ts:471-477` 直通，
  `carryover` 不覆盖该轮（A24 §4），所以 `--prompt` 自己从 STATE/ledger/HANDOFF/ROUND 拼摘要并注入
  模板占位符；拼 prompt 是纯读，只有带 `--record` 的运行才写一行日志（`*.log` 已 gitignore）。
- **未做（`NOT_RUN`）**：没有创建/修改/删除任何定时任务（D-066：第一条心跳是操作者动作）；真机投递
  未跑；没有改 `src/`、没有开新一轮、没有动 `lib/`。
- **当前树状态提醒（`CONFIRMED`，非本任务产物）**：`test/loop.spec.ts`（untracked，23:26 由并行
  round-14 工作创建）让 `npm run typecheck` 红在 `test/loop.spec.ts(519,13): TS2304 "snapshotConfig"`。
  该文件不由本任务写入；round 14 收尾时必须先修它，否则 `finish-round.py` 的 CI 会 REFUSED。
- **Next action（round 14 的接手者）**：先修 `test/loop.spec.ts` 的 `snapshotConfig` 引用，跑
  `npm run ci`；闭合后心跳守卫会自动从 `SKIP` 回到 `RESUME`（判据只看 tracked 改动与记录一致性）。

## 2026-11-18 — RSI 连续循环：round 11 = P2-01 客户端 i18n 键齐全性（审计无缺陷，补守卫）

- **From:** RSI 执行代理（agent-37）· **To:** 用户 / 后续接手代理
- **审计（`CONFIRMED`）**：bundle 有两本词典——插件 `DICT`（`src/client/index.js:409`）与
  `PANEL_DICT`（`:1445`，`:3624` 以独立命名空间注册）；面板调用点拿到的是绑定 `PANEL_DICT` 的
  translator（`:1556`），所以它们的键只在面板表里是**正确**的。插件每语言 137 键、面板 19 键，
  两表各自语言对称，字面/拼接/动态键全部在消费它的表里可解析——**没有现成缺陷**。
- **交付（`CONFIRMED`）**：`test/i18n-parity.spec.ts`（6 条），按作用域断言；插件表缺失的键必须
  正好是那六个面板作用域键，所以「键换表」会红而不是被放行。用变异重放证明它会失败：删掉一个
  `zh` 键 → `2 failed | 4 passed`（`.rsi/evidence/round-011/red.txt`），随即还原，
  `npm run ci` = **56 文件 / 1015 测试**。
- **循环状态**：P1、P2 待办已清零；`.rsi/STOP` 不存在。下一轮从 P3-01（设置页每路由上限与
  deadline 字段文案）或 POOL 里的 `P ·` 调用点条目里挑一个（`records.ts` 裸 `error.message`、
  `history.ts` 先截断后脱敏、base64-PEM 规则）。

## 2026-11-18 — RSI 连续循环：round 10 = P1-02 ARCHITECTURE 版本状态锚定（已修）

- **From:** RSI 执行代理（agent-37）· **To:** 用户 / 后续接手代理
- **审计结论（`CONFIRMED`）**：POOL 里 P1-02 的字面措辞（「current version」）在
  `docs/ARCHITECTURE.md` 里已不存在，但同类缺陷仍在——四处 `in this release` 无法落到具体版本，
  且 `resume` 边界只写 DSH `0.2.1-rc.2`，而 round 8 已在 `0.2.2-rc.3` 上复查过安装/激活/设置面。
- **修复（`CONFIRMED`）**：`since **0.8.0**` / `as of **0.11.9**` 锚定，两处「无生产调用方」已核实
  （`grep -rn "resume/" src` 只有注释，`src/run.ts:21` import 的是 checkpoint）；边界行把「实测版本」
  与「只做复查的版本」分开写，并明写没有重测 journaling 边界。
- **守卫（`CONFIRMED`）**：`test/docs-architecture-version.spec.ts` 3 条；用上一版文档重放为红
  （2 failed / 1 passed，`.rsi/evidence/round-010/red.txt`），`npm run ci` = **55 文件 / 1009 测试**。
- **循环状态**：rounds 9–10 连做；`.rsi/STOP` 不存在，P1/P2 待办未清零。下一轮 P2-01
  （设置页 i18n 键齐全性守卫），然后 P3-01/P3-02 与 POOL 的 P 级条目。

## 2026-11-18 — RSI 连续循环：round 9 = P0-02 进度页「事件中没有报告」（已修）

- **From:** RSI 执行代理（agent-37）· **To:** 用户 / 后续接手代理
- **缺陷（`CONFIRMED`）**：`src/script.ts:1852+` 把 worker/verifier 的 `phase` 写成
  `任务 n · 标题`，面板只按 `phase` 匹配阶段 → `执行`/`检查` 永远分不到行，渲染成
  `progress.notReported`。这正是此前 `docs/knowledge/STATE.md` 记录的已知缺口（P0-02）。
- **修复（`CONFIRMED`）**：第二条绑定通道（role label → 阶段 `evidence` 交叉引用），
  `members` 仍是每行唯一的家，状态自有行优先；TS 与浏览器镜像同步，两语言 meta 行更新。
  先红后绿：`.rsi/evidence/round-009/red-ts.txt`（5 failed / 29 passed）→ `green.txt`
  （112 passed）；全量 `npm run ci` exit 0，**54 文件 / 1006 测试**。
- **STOP 记录缺口已补（`CONFIRMED`）**：新增 `.rsi/tools/stop-probe.sh`，每轮把
  `test -e .rsi/STOP` 的判定写进 `.rsi/evidence/stop-probes.txt` 并在 `.rsi/LOG.md` 的 STOP
  小节留行。rounds 5–8 只有散文没有证据，历史不追改。
- **循环状态**：round 9 是继续推进的第一轮（上一轮把四个交办主题做完就停了，待办并未清零）。
  剩余待办按 POOL 优先级：P1-02（`docs/ARCHITECTURE.md` 把版本写成「current」而非「since」）、
  P2-01（设置页 i18n 键齐全性守卫）、P3-01/P3-02，以及 POOL 里带 `P ·` 前缀的条目
  （`records.ts` 裸 `error.message`、`history.ts` 先截断后脱敏、base64-PEM 规则）。
- **接手注意**：`.rsi/STOP` 当前不存在；若操作者要暂停循环，创建该文件即可，下一轮开始就会看到。

## 2026-11-18 — RSI 连续循环：round 8 = 真机 disposition（激活 PASS / 真模型 BLOCKED）

- **From:** RSI 执行代理（agent-34）· **To:** 用户 / 后续接手代理
- **已证（`CONFIRMED`）**：DSH `0.2.2-rc.3` 上，本检出装入真实 `grok-workflow-dev`（`link:` 依赖），
  `workflow-ptc` 启用后实例启动干净（无 `pending`/`did not activate`），设置投影含
  `grok-workflow`（`autoGenerate: true`）。命令与输出见 `.rsi/evidence/round-008/activation.txt`
  与 `settings-describe.txt`。
- **未证（`BLOCKED`）**：经 `grok_workflow` 的真模型消息——孤立 profile 无凭据，
  `MISSING_CREDENTIAL: … "deepseek-official"`。要补这一条，需操作者在自己可用的 profile 里跑
  `docs/LOCAL-TESTING.md` 的 Real-model smoke，并把结果写进 VALIDATION；**不要**把别的 profile 的
  密钥拷进本仓库或证据目录。
- **清理**：本轮启动的实例都已停止（3199/3201/3203/3205/3207/3209/3211/3213 无监听），带 token 的
  启动日志已就地脱敏；`.dsh-home/` 与 `.tmp/` 均 gitignore。
- **循环状态**：本次会话交办的四个主题（P2-02 → P1-03 → tag 审计 → 真机）已全部完成并各自
  提交/打 tag/push；下一轮应从 `.rsi/POOL.md` 的 P0-02（Progress 页 Execute/Verify 行）开始。

## 2026-11-18 — RSI 连续循环：round 7 = 远端标签清单对账（`CONFIRMED`）

- **From:** RSI 执行代理（agent-34）· **To:** 用户 / 后续接手代理
- **结论（`CONFIRMED`）**：32 个远端标签与本地对象 32/32 相同（无标签被移动），全部 peeled
  提交是 `main` 祖先；两份 README 已发布列表完整（0 缺 0 多）、升序、末项 = 当前发布；
  `HEAD == origin/main`。31 个标签与 `package.json` 一致；唯一例外 `v0.2.0-rc.1`（早于发布
  流程，提交里 `package.json` 仍是 `0.1.0`），不移动，改为在两份 README 写明 + 1 个守卫 `it`。
- **证据**：`.rsi/evidence/round-007/`（`remote-tags.txt` / `audit.txt` /
  `local-vs-remote-objects.txt` / `ci.txt`，54 文件 / 999 测试）。
- **版本（`CONFIRMED`）**：`0.11.7`，`CHANGELOG` 插入 `## [0.11.7]` 双语节。
- **下一主题**：`grok-workflow-dev` 真机 disposition —— 要么用真实 Loader 起一次并保存 PASS
  日志，要么明确记 `NOT_RUN`/`BLOCKED` 及具体原因（不得把没跑过的运行标成 pass）。

## 2026-11-18 — RSI 连续循环：round 6 = P1-03 LOCAL-TESTING 对账（`CONFIRMED`）

- **From:** RSI 执行代理（agent-34）· **To:** 用户 / 后续接手代理
- **对账结论（`CONFIRMED`）**：九个键与全部固化上限、默认死线都与 `src/config.ts` 一致；
  不符的是四处安装示例的压缩包名（`0.2.0`/`0.2.1`）、一条引用代码从不输出的排障消息、
  以及中文 README 的固化上限写法。三处已修，中文写法与英文统一为 `key=value`。
- **机制（`CONFIRMED`）**：`.rsi/tools/bump-version.py` 升版本时同步改写
  `docs/LOCAL-TESTING.md` 的压缩包名；`test/docs-config-keys.spec.ts` 7 → 12 个 `it`
  从常量读数，不抄数字。证据 `.rsi/evidence/round-006/`（red 2 failed → green 12/12 →
  ci 54 文件 / 998 测试）。
- **版本（`CONFIRMED`）**：`0.11.6`（`package.json` + `package-lock.json` 联动），
  `CHANGELOG` 插入 `## [0.11.6]` 双语节。
- **接手提示**：下一主题是远端 tag 清单审计（README 已发布列表 vs `git ls-remote --tags`
  vs 每个 tag 的 `package.json` 版本），再之后是 `grok-workflow-dev` 真机 disposition。

## 2026-11-18 — RSI 连续循环：round 5 = P2-02 脱敏形状（`CONFIRMED`）

- **From:** RSI 执行代理（agent-34）· **To:** 用户 / 后续接手代理
- **已完成（`CONFIRMED`）**：`src/redact.ts` 补齐引号内 `Cookie:` 头、`X-Amz-Signature` /
  `X-Goog-Signature` / `?auth=` 签名参数、PGP armor、`SECRET_KEY`/`PRIVATE_TOKEN` 短值；修掉
  `const token = await refreshToken()` / `if (password == null)` 被改写与占位符二次脱敏；
  env 值改为止于 token 边界。证据 `.rsi/evidence/round-005/`（red 6 failed → green 32/32 → ci 54 文件 / 993 测试）。
- **版本（`CONFIRMED`）**：`0.11.5`（`package.json` + `package-lock.json` 联动），`CHANGELOG`
  插入 `## [0.11.5]` 双语节，README 中英安全段的脱敏清单与 `docs/ARCHITECTURE.md` 新增
  「Credential redaction」一节。
- **接手提示**：池里紧邻的两项是 P1-02（`docs/ARCHITECTURE.md` 里以版本号当「当前」的段状态）
  与 P0-02（Progress 页 Execute/Verify 成员不渲染）。P0-02 风险中/工作量中，动手前先用
  `.rsi/POOL.md` 的 anchors 复核。
- **未做（`NOT_RUN`）**：base64 包裹 PEM 的规则；live `grok-workflow-dev` 消息实测（本轮改动不触运行路径）。
- **可信边界**：`.rsi/STATE.md` 是本轮的权威状态；本文件只记对外可复核的结论。

## 2026-11-15 — v0.9.1 已发布（存量越界钳制；用户 WebUI 启用失败的修复，`CONFIRMED`）

- **From:** lead · **To:** 用户 / 后续代理
- **现象（`CONFIRMED`，用户截图）**：WebUI 添加 `github:free6589/dsh-grok-workflow` 成功，启用时
  `1 entry did not activate / ValidationError: $.maxConcurrency expected number <= 6 but got 8`。
  用户存量 `cordis.patch.yml` 写 `maxConcurrency: 8 / maxRetries: 5`（v0.9.0 之前合法），v0.9.0 的 B07
  恢复硬上限 6/3 后整行起不来，且没有设置页可修（D-031 死锁）。
- **修复（`CONFIRMED`）**：宿主 `Config` schema 对越界存量钳制到上限 + 每项一条中英告警
  （`repairLimitOverruns` + `clampedLimit`；`apply()` 串在 `repairSynthesisInconsistency` 之后）；
  低于下限/非数字/程序化 `resolveConfig` 越界仍硬拒绝（R-06）；上限 6/3 未放宽。
  证据：`test/config-limits-repair.spec.ts`（17 例）；隔离 profile `gwverify851` 用 8/5 patch 真激活
  （仅停在 `MISSING_CREDENTIAL`）；对照 `0` 仍以用户截图同帧拒绝。
- **发布（`CONFIRMED`）**：`9103280`（`release: prepare v0.9.1`）→ `git push origin main` →
  CI `43665777667` success → tag `v0.9.1`（`584dc22` → peel `9103280`，已 push；旧 tag 未动）→
  Release `43666035740` success，Release `v0.9.1` + asset `dsh-grok-workflow-0.9.1.tgz`。
  协调状态已发 `Issue #1 comment 6887721733`。
- **Next action（用户，一步）**：WebUI 插件页把 `dsh-grok-workflow` 更新到 `v0.9.1`（或重装
  `github:free6589/dsh-grok-workflow`），再点启用：行应激活，日志里有两条钳制告警；之后去设置页把
  `8/5` 改成 `6/3` 以内，告警即消失。不用改 patch 里的其它值。

## 2026-11-08 — v0.7.0 已发布（tag → `main` `146dce7`）；live `:3090` 一步重启即收口（`CONFIRMED`）

- **From:** lead · **To:** 用户 / 后续代理
- **已发布（`CONFIRMED`）**：`v0.7.0` → `146dce7`（`main`）；GitHub Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.7.0 ，
  asset `dsh-grok-workflow-0.7.0.tgz` **317,470 B**；Release workflow `42474831253` 绿，
  main 的 CI `42474712526` 绿。tag 不得移动。
- **合并事实**：`origin/main` 的 PR #44 与本分支在 `src/run.ts` 启动段冲突；口径为「保留 main 的
  startup deadline race + 两条入口都走 `teamWorkflowEngine`」。`lib/` 由 `npm run build` 重新生成，
  无手改。合并后 37 文件 / 660 测试 PASS。
- **Next action（用户，一步，`NOT_RUN`）**：重启 `:3090` 才加载新代码。装法二选一：
  ①`dsh plugin --profile web add https://github.com/free6589/dsh-grok-workflow/releases/download/v0.7.0/dsh-grok-workflow-0.7.0.tgz`
  ②本机已打好 `out/dsh-grok-workflow-0.7.0.tgz`（由 `146dce7` 打包，与本 tag 同内容）；
  然后 `DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`。
  重启后应看到：设置页出现「机器台账」开关（默认关）；`/grok on` 跑一次以 `【人话结论】` 开头且无
  `Model routes:` 行；`Model routes`（打开开关后看）里出现 `wb/cn:deepseek-v4.1-flash` 即证明
  Round 35 的「保存即生效」也一起修好了。
- **未做（`NOT_RUN`）**：live 安装副本与本机 `:3090` 均未由代理改动（沙箱对
  `/home/fish/dsh-layerfs` 只读，见 Round 36 尾注）。

## 2026-11-08 — B 方案：`/grok on` 也说人话、机器台账可按需打开（`61c3ac9`，`CONFIRMED`）

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `61c3ac9`（本仓库 `release/0.6.0`）
- **用户诉求**：`session-00fca25f…` 明明是 `COMPLETED`，但回复通篇是
  `Grok workflow:` / `Confirmed evidence:` / `Model routes:` / `Deadline:` / `Route switches:`，
  用户原话「在我眼里不像人话」。用户明确选择方案 **B（改代码）**，否决了「别开团队」这类用法建议。
- **本轮交付：**
  - `src/gate.ts` `runTeam` → `completed`/`partial` 拼 `【人话结论】任务 N/M 项已核验通过。…`
    ＋汇总首句（`detectLanguage(request)` 定中英）；`failed` 不拼，失败不套成功口吻。
  - `src/answer.ts` → `SUCCESS_PREAMBLE` 允许「先 ≤3 句人话，再原样贴 markers 内全文」；
    `FAILURE_PREAMBLE` 与 markers 结构不变。
  - `src/report.ts` → `renderReport(report, { showDiagnostics })`；新配置 `showDiagnostics`
    默认 **off**，控制 `Model routes` / `Deadline` / `Route switches` / `Route overflows` / `Errors`。
    **`Uncertainties` 有意留在开关外**（carry-over 要从上一轮文本解析它，藏掉会丢追问上下文）。
  - `src/index.ts` 工具 `render` 渲染时读实时开关；`src/client/index.js` 设置页新增中英双语
    「机器台账 / Machine diagnostics」开关。
  - 测试：`test/gate.spec.ts` +3、`test/report.spec.ts` +1 默认视图钉住；volatile 字段数 27→28。
    `npx vitest run` → **37 文件 / 655 测试 PASS**；`tsc --noEmit` 0 错误；lint 4 warnings/0 errors。
- **过程事实（不掩盖）**：执行子代理 `impl-b` 中途失联，改动先落 stash `temp-gate-fix`；
  其自身提交 `ef29e9b` 把 humanSummary 段当「无关 hunk」删掉，本轮在 `61c3ac9` 重新加回并钉测。
- **Next action（用户，一步收口，`NOT_RUN`）**：重启 `:3090` 才加载新模块（D-013 步骤 5，
  `DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`）。
  重启后：设置页应出现「机器台账」开关（默认关）；`/grok on` 跑一次应看到 `【人话结论】` 开头，
  且不再出现 `Model routes:` 等台账行（除非手动打开）。

## 2026-11-08 — 设置保存不生效：已定位并修复（网关把开机快照传给 run）；live 需重启才加载新模块

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `5b0e3df`（本仓库 `release/0.6.0`）
- **用户现象**：设置页把 `roles.worker` 第一名存成 `wb/cn:deepseek-v4.1-flash`（revision 21、
  无红字、补丁文件该行正确），新会话的子代理却仍点 `global` → `global-sg` → `autoclaw`，
  规划子代理用 `mimo`（补丁里是 muse-spark）。
- **根因（`CONFIRMED`，源码级）**：`src/gate.ts` `installGate()` 解构的是**开机**`deps.config`；
  `safe()` 只喂分类/历史/排队，而 `runTeam()` 的 `runWorkflow` 与两处 `runSingleCall`
  传的都是开机快照 → 保存只影响准入，永远到不了子代理。工具入口传的是 `config: live`，
  两个入口行为不一致。
- **修复**：三处改 `config: limits`；回归用例 + 负向对照（无修复时
  `expected 'old-model' to be 'wb/cn:deepseek-v4.1-flash'`）；`npx vitest run` 37 文件 / 651 PASS。
- **部署状态（关键）**：修复构建已写入 live web profile 安装副本
  `…/profiles/web/node_modules/dsh-grok-workflow/lib/gate.js`（原文件已备份）。
  **但 loader 用无 cache-bust 的动态 `import()`（`cordis-plugin-loader/lib/index.js:214`），
  运行中的 `:3090` 仍持有旧模块** → 必须重启该实例（或任何能重新 import 该模块的等价操作）
  才会加载新代码。**禁止**在没有用户授权时重启 live（D-013 步骤 5）。
- **Next action（用户）**：授权重启 `:3090`（`DSH_HOME=/home/fish/dsh-layerfs dsh web
  --host 100.111.111.88 --port 3090 --no-open`）后，设置页保存的 `cn` 链路即对下一条消息生效。

# Agent Handoff

## 2026-11-08 — 子代理顶栏显示名：live `:3090` 持久面板数据实锤——本轮自己的子代理在 live 上显示为「任务团队 child 28」；用户一步部署即收口（fix_child_names 第 5 轮，零源码改动，`CONFIRMED`）

- **From:** 执行子代理（fix_child_names，orchestrator attempt 5）· **To:** lead / 用户 ·
  **Base:** `91cad68`（本地 `release/0.6.0` HEAD，与 origin 同步，未变）
- **本轮新实锤（全部只读；摘录
  `evidence/childname-fix-2026-11-08/live-descriptor-labels-2026-11-08.txt`，记录
  `VALIDATION.md` Round 33）：**
  - live 顶栏此刻正把**当前 orchestrator run 的子代理**显示成泛化名：最新 14 个子会话
    首 `subagent/descriptor` label 全部为 `任务团队 child 15`…`任务团队 child 28`
    （含 attempt 5 自己的执行子代理 `88e59d33…` = child 28，04:13），0 个描述性标签；
    面板→descriptor 映射已在 Round 32 真 GUI 逐字验证，即 live 面板实际渲染内容。
  - 修复构建在 live home **全域缺席**：`find /home/fish/dsh-layerfs -name team-engine.js`
    → 0。
  - 认证边界复测：`127.0.0.1:3090` / `localhost:3090` / `100.111.111.88:3090` 均 HTTP 401
    （无 loopback 豁免）→ 浏览器级 live 观察对任何代理会话不可行（AGENTS.md 禁读凭据）。
  - 分支告警：默认分支 `main` @ `1f9065d` 不含 `ad66118` → live profile 的 `github:`
    依赖 + `pnpm update` **取不到修复**；必须显式安装 `ad66118` 构建。
- **结论**：验收条款 4 特指 `http://100.111.111.88:3090` 合取的未达 = live 部署状态问题，
  不是验证缺口；本机 GUI 验证 PASS（Round 31/32，同一 `dsh` 二进制 0.2.1-rc.2，真浏览器 +
  6 子代理团队档，顶栏 6/6 描述性、0 泛化）。
- **Next action（用户/lead，一步收口）**：把 `ad66118` 构建装入 live `web` profile（上一节
  步骤：备份 patch → `dsh plugin add` 新路径 tarball → 核对 `dsh.profile.bundles` 三项 →
  `workflow-ptc` enabled），**不要**用 `pnpm update`（main 上没有修复），然后按 D-013 步骤 5
  重启 `:3090`（`DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090
  --no-open`）。之后任意团队档工作流的顶栏即显示描述性子代理名。插件 toggle 重载语义未验证
  （`NOT_RUN`）——重启是保证生效的重载方式。
- **本轮其他**：`npm run ci` @ `91cad68` → 37 文件 / 650 测试 PASS；[COORDINATION] 状态块
  按协议发布到 Issue #1（更正上一节「Issue 无该状态块」的过时记录：attempt 4 的块已存在）。
- **最终轮复验（attempt 6/6，2026-11-08 04:24–04:32，零源码改动）：结果零变化。** `npm run ci`
  @ `b2bf3a8` → 37 文件 / 650 测试 PASS；live 最新 8 个子会话 label 仍为
  `任务团队 child 25–32`（attempt 6 自己的子会话 30/31/32 经任务标记确证在列，0 描述性）；
  `origin/main` 已前进至 `3b1d9a8`（并发任务 PR #44）但仍不含 `ad66118` → 上面的显式安装
  指引与「不要 pnpm update」告警依旧有效；日后把 `release/0.6.0` 合回 `main` 时，
  `src/run.ts` 与 PR #44 双侧都改过，可能需手工调和。记录：VALIDATION Round 34、证据
  `evidence/childname-fix-2026-11-08/live-descriptor-labels-2026-11-08-r34.txt`。

## 2026-11-08 — 子代理顶栏显示名：GUI 浏览器验证 PASS（fix_child_names 验证轮，零源码改动，`CONFIRMED`，`release/0.6.0` @ `ad66118`）

- **From:** 执行子代理（fix_child_names，orchestrator attempt 4 · GUI 验证轮）· **To:** lead / 用户 ·
  **Base:** `ad66118`（本地 `release/0.6.0` HEAD，与 origin 同步，未变）
- **本轮只做验证，不改代码。** Round 31 的修复（twin 引擎 + 提示词首行）此前已过 `npm run ci`
  （37 文件 / 650 测试 PASS）与 headless 真机验证，但「GUI 顶栏实际渲染」未观察——本轮补上：
  隔离 Web 实例（home `out/gui-verify/home/`，profile `guiweb` 从 web 模板创建，插件 dev 安装
  `file:` 链接工作树构建、安装后 `lib/team-engine.js` md5 一致，`workflow-ptc` patch 启用，
  v4-pro + agnes flash，实例 `127.0.0.1:3199`，一次性 token 只走环境变量、不落任何文件、用后即杀）
  + headless Chromium（playwright-core + `chromium_headless_shell-1248`，1440×900）。
  ①真实 composer 键入团队档双计算任务 → `Grok workflow: COMPLETED`（6 子代理，含真实 agnes
  format-error 路由切换重试）；②展开库存 `Session hierarchy` 顶栏面板 → **6 个子代理主标签全部
  描述性**（`规划助手` / 任务标题 / `检查 · 任务标题`），**0 处 `任务团队 child N`**、0 处提示词
  原文作主标签；持久 `subagent/descriptor` 与面板逐字一致。证据：
  `evidence/childname-fix-2026-11-08/gui/`（README + 4 截图 + 3 JSON + 描述符摘录）；
  记录：`VALIDATION.md` Round 32、`DECISIONS.md` D-041 Addendum、`RESEARCH.md` A18 补充、STATE。
- **记忆更正（只读核实）**：live `:3090` web profile 的插件 = **released 0.6.0**（2026-11-07
  21:54 安装；`lib/team-engine.js` 不存在 → 不含本修复）。旧记「仍 0.2.7」过时，STATE/VALIDATION
  已更正。live 实例全程未碰（D-013）。
- **验收条款状态（本轮后）**：条款 1/2/3/5/6 满足；条款 4 的「插件加载于 mise DSH installation +
  ≥3 子代理工作流 + Web GUI 顶栏显示描述性名」三项在本机 `CONFIRMED`（本隔离实例与 live 用同一
  `dsh` 二进制 0.2.1-rc.2）；唯一未达项 = 特指 `http://100.111.111.88:3090` 实例本身——其上仍跑
  不含修复的 released 0.6.0，按 D-013 步骤 5 部署+重启需用户明确授权，且本会话沙箱只可写工作树。
- **未做 / `NOT_RUN`：** live `:3090` 的修复部署与浏览器复验；`[COORDINATION]` Issue 状态块
  （仓库 Issue 列表无该 Issue，历史轮次同样记 `NOT_RUN`）；上游 3 行 ask（可选简化，未执行）。
- **Next action（用户/lead，一次外部动作即收口）：** 把 `release/0.6.0` HEAD（`ad66118`；npm 未
  发布、无新 tag）装入 live `web` profile（备份 patch → `dsh plugin add` 新路径 tarball → 核对
  `dsh.profile.bundles` 三项齐全 → `workflow-ptc` enabled 确认），再按 D-013 步骤 5 重启 `:3090`
  （`DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`），
  即可在 live GUI 顶栏看到同样的描述性子代理名。

## 2026-11-08 — 子代理顶栏显示名：插件侧 twin 引擎落地，真机 PASS（fix_child_names 第四次执行，`CONFIRMED`，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，attempt 4）· **To:** lead / 用户 · **Base:** `60cde95`（本地 `release/0.6.0` HEAD；含并发任务 fix_completed_links 的已提交修复）
- **结论：D-039 的 BLOCKED 判定被推翻。** 插件侧存在可用扩展点——插件持有 `ctx.workflowEngine`
  （自己的 inject），而 `PtcWorkflowEngine.start()` 在 start 时才读 `runCtx.subagents`
  （`workflow-ptc/src/index.ts:157`）；插件用**注入引擎自己的构造函数**建私有 twin，
  把 `subagents` 换成在 `startActivation` 处重写 `spec.label`（= 提示词首行）的视图，
  `reflect.provide` 置空保持私有，非 PTC 引擎原样回退并 warn。不改 core、不改引擎、
  不碰共享服务实例。上游 3 行 ask 从「必要」降级为「可选简化」。
- **本轮改动（全在本仓库，未提交，随本轮 commit）：**
  `src/team-engine.ts`（新）、`src/run.ts`（两处调用点）、`src/script.ts`/`src/triage.ts`/`src/gate.ts`
  （子代理提示词**首行**改描述性标题，人设第二行）、`test/team-engine.spec.ts`（新，12 例）、
  `test/engine-harness.ts`（additive 捕获一处）、`CHANGELOG.md`（[Unreleased] Fixed 英中条目）、
  `docs/ARCHITECTURE.md`（执行路径行）、记忆文件（RESEARCH A18 / DECISIONS D-039 addendum + D-041 /
  VALIDATION Round 31 / STATE / 本节）、证据 `docs/knowledge/evidence/childname-fix-2026-11-08/`。
- **真机验证（Round 31）：** 隔离 home `out/childname-fix-verify/`（profile `cfix`）、
  shipping 构建（无调试代码）团队档 COMPLETED；6 个子会话首个 `subagent/descriptor` 全部为
  `规划助手`/`<任务标题>`/`检查 · <任务标题>`（含一条真实 agnes route-switch 重试），
  **0 处 `任务团队 child N`**；修复前同 patch 对照 3/3 旧标签。`npm run ci` → **37 文件 / 650 测试 PASS**。
- **诊断教训（RESEARCH.md A18，三次真机失败换来）：** 不要代理 cordis ctx（receiver 键控的
  fiber walk 会被破坏）；服务**属性访问**受 isolate guard（`cannot get property "X" without inject`），
  显式 `ctx.get(name)`/`ctx.reflect.get(name, false)` 不受——twin 的服务从**引擎自身 ctx** 经
  `ctx.get` 解析进最小 holder。headless 下 cordis logger.warn 不可见，诊断要用工具结果/探针。
- **未做 / NOT_RUN：** live `:3090` 的浏览器复验（实例仍是旧插件 0.2.7，401/D-013，无凭据读取）——
  部署新构建后人工点开团队档即可看到；上游 3 行 ask 未执行（现在可选）。
- **Next action：** commit + push 本轮文件（按文件名逐一 add）；如需在 live `:3090` 生效，
  需用户/lead 重新部署插件（非本会话能力）。
- **标注更正（2026-11-08）：** 上文 Round 31 与 STATE/VALIDATION 里的 synthesizer 首行实为
  `汇总助手`（`src/naming.ts:102` 的 role copy，`memberLabel('synthesizer', 1)`），
  初稿误写 `综合助手`，已在本轮更正。

## 2026-11-08 — 子代理顶栏显示名：第三次执行复核 + 末两个扩展点候选用类型级证据关闭，**BLOCKED 维持（已被上一节推翻）**（fix_child_names，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，编排器重试轮）· **To:** lead / 用户 · **Base:** `5d9fcbe`（本地 `release/0.6.0` HEAD，未变）
- **本轮做了什么：** ①把 Round 27/28 的源码链**第三次独立重验**（全部自己重读 installed DSH `0.2.1-rc.2` 与
  core 检出源码，行号见 `VALIDATION.md` Round 29 表）——逐条一致；②新增**类型级证据**，把前两轮仅以
  「理由否决」记录的末两个扩展点候选关闭：`WorkflowStartRequest` 全接口无 label 字段
  （`dsh-workflow/lib/types/runtime-types.d.ts:15-28`）；每 run `subagentProvider` + `registerProvider` 虽是
  真实文档化 API，但 continuable 子代理的 provider 参与只有 `ContinuableCreateSpec { seed? }`
  （`dsh-subagent/lib/types/types.d.ts:187-213`，单字段无 label），descriptor 由 `startLocal` 从
  `spec.label` 快照、label 归 `startActivation` 调用方（types.d.ts:122-124）——调用方即写死的 workflow host；
  无 `prepareContinuable` 的 provider 会把子代理降级为 external 一次性 run（GUI 渲染裸子会话 id，更差且摧毁
  continuable 模型）；引擎 Config 无 label 模板；全 core checkout 仅 `PtcWorkflowEngine` 一个引擎实现；
  `ctx.subagents` 服务面不暴露 `startActivation`。另核：core 检出 HEAD `687f282e` 与 installed 同为
  `0.2.1-rc.2`（无上游修复落地）。
- **结论：BLOCKED 维持（第三次独立确认）。** 主标签只能由 DSH core 的 ~3 行上游改动解锁
  （`runtime.ts` 转发 `opts.label` + `host.ts` 的 `childRequest()/startChild()` 接 `label`）；
  半程缓解（`ctx.sessionTitle.rename`，只改次级行）仍待用户批准且不满足验收条款 1。本轮零源码改动。
- **本轮改动：** 仅记忆与证据文件——`VALIDATION.md`（Round 29）、`DECISIONS.md`（D-039 Addendum 2）、
  `STATE.md`（第三次执行补充段）、本节、
  `docs/knowledge/evidence/childname-blocked/extension-points-closure.md`（新）。**无源码改动、无 `CHANGELOG.md` 条目。**
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；live `:3090` 未碰（D-013，仍 `0.2.7`，本会话无凭据 401）；
  隔离 profile 未再起（Round 28 的真机复现继续有效，本轮复读其证据文件完整）；`npm run ci` 未跑
  （零源码改动；工作树含并发任务进行中的 client 改动；基线 Round 26：35 文件 / 624 测试 PASS）。
- **并发注意：** 工作树仍有**另一任务**的改动（`.gitignore`、`lib/client.js`、`package.json`、
  `src/client/index.js`、`test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`）。本轮**未触碰**，
  提交时按文件名逐一 `git add`，只含本任务 5 个记忆/证据文件。
- **Next action（需要用户/lead 决策，同前两轮，二选一）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 约 3 行 label 转发；
  改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start` 后调
  `ctx.sessionTitle.rename(childId, <任务名>)`，次级行提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — 子代理顶栏显示名：第二次尝试复核 + 真机复现，**BLOCKED 维持**（fix_child_names，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，attempt 2）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD，未变）
- **本轮做了什么（attempt 2）：** ①把 attempt 1（Round 27 / D-039）的源码结论**逐条独立重验**——全部自己重新读源码，
  关键行号见 `VALIDATION.md` Round 28 表（引擎 `dsh-workflow-ptc/lib/index.js:332` 写死
  `` `${meta.name} child ${callId}` ``、guest 不转发 `label`、描述符 `foldSubagentDescriptor` 取第一条锁死、
  GUI `dsh-client-ui-subagent/lib/client.js:201` 直接渲染、`dsh-session-title` `SessionTitleService.rename`
  存在且只作用于次级行）。②把 attempt 1 的「隔离 profile 真机 `NOT_RUN`」升级为**真机复现 PASS**：
  `out/childname-verify/`（隔离 home + profile `cnamer`，headless，模型 v4-pro + agnes-3.0-flash，
  复用 `out/v060-verify/*.patch.yml`，密钥仅布尔存在检查）跑一轮团队档 COMPLETED（2 任务 verified，
  6 子代理），父会话 `tool-workflow/agent-start` 证明插件标签（`规划助手`/`执行`/`检查`）确实在传，
  而 6 个子会话首个 `subagent/descriptor` **全部**是 `"label":「任务团队 child N」`（N=1..6）——
  与用户截图逐字一致。证据：`docs/knowledge/evidence/childname-blocked/`（README + 3 摘录文件）。
- **结论：BLOCKED 维持。** 主标签由 DSH core 写死并被描述符契约锁成不可改写，插件侧无文档化扩展点；
  按任务约束（"If no extension point exists … report BLOCKED with the specific limitation instead of
  modifying DSH core「）不做绕行改动。验收条款逐条状态：条款 1/3/4/6 的」修复已实现"部分不可达
  （无修复可交付）；条款 2（DSH core 未改）满足；条款 5（CHANGELOG 条目）不适用（无用户可见变更，D-039 既定）。
- **本轮改动：** 仅记忆与证据文件——`VALIDATION.md`（Round 28）、`DECISIONS.md`（D-039 Addendum）、
  `STATE.md`（2026-11-07 段补充）、本节、`docs/knowledge/evidence/childname-blocked/`（4 文件）。
  **无源码改动、无 `CHANGELOG.md` 条目。**
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；live `:3090` 未碰（D-013，仍 `0.2.7`，本会话无凭据 401）；
  浏览器渲染 `NOT_RUN`（描述符标签已是渲染输入的唯一主标签来源）；`npm run ci` 未跑
  （零源码改动；工作树含并发任务进行中的 client 改动，跑 CI 只会测到别人的中间态；基线 Round 26
  35 文件 / 624 测试 PASS）；半程缓解（`sessionTitle.rename`）未实施（D-039：待用户批准）。
- **现场异常（已绕过，如实记录）：** `out/childname-verify/` 内两个中间摘录文件曾在相邻两次调用之间
  消失（疑似与并发任务的 out/ 操作相撞）；改用「同一命令内生成+校验」把摘录直接落盘到证据目录后
  跨调用复核仍在，证据完整性不受影响。
- **并发注意：** 工作树仍有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`，另有 `.gitignore`/`package.json`/`.v070-home/`
  等进行中痕迹）。本轮**未触碰、未提交**，因此**未做 git commit**（避免把别人的工作树改动扫进提交）。
- **Next action（需要用户/lead 决策，二选一，同 attempt 1）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 改约 3 行——
  `runtime.ts` 把 `opts.label` 放进 `startAgent(...)`，`host.ts` 的 `childRequest()` 接收 `label`、
  `startChild()` 用 `` label: request.label ?? `${this.meta.name} child ${callId}` ``；改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start`（事件带 `childId`）后调
  `ctx.sessionTitle.rename(session, <任务名>)`，把顶栏**次级行**的提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — 子代理顶栏显示名：诊断完成，判定 **BLOCKED**（fix_child_names 任务，`release/0.6.0` 工作树，attempt 1）

- **From:** 执行子代理（fix_child_names）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD）
- **结论（`CONFIRMED`，源码逐行取证）：** 顶栏主标签 `任务团队 child N` 由 **DSH core** 在创建子代理时写死，
  插件侧无任何文档化扩展点可改。证据链（8 处行号）见 `VALIDATION.md` Round 27，决策见 `DECISIONS.md` D-039。
  一句话：插件已经在传 `label`（`src/script.ts:1188/1213/1324/1438`），丢标签发生在引擎内部
  （`workflow-ptc/src/runtime.ts:183-188` 不转发 → `host.ts:205` 写死 → 描述符被锁成不可改写
  → `dsh-client-ui-subagent/lib/client.js:201` 直接渲染）。
- **本轮改动：** 仅记忆文件——`docs/knowledge/VALIDATION.md`（Round 27）、`DECISIONS.md`（D-039）、
  `STATE.md`（2026-11-07 段）、本节。**无源码改动、无 `CHANGELOG.md` 条目**（没有用户可见变更可记）。
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；隔离 profile 真机 `NOT_RUN`（无修复可验）；
  live `:3090` 版本与浏览器渲染 `NOT_RUN`（`GET /` → `401`，本会话无凭据）；`npm run ci` 本轮未跑
  （零源码改动；基线仍是 Round 26 的 35 文件 / 624 测试 PASS）。
- **并发注意：** 开工时工作树已有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts` 已改，`test/panel-links.spec.ts` 未跟踪）。本轮**未触碰、未提交**，
  因此**未做 git commit**（避免把别人的工作树改动扫进提交）。
- **Next action（需要用户/lead 决策，二选一）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 改约 3 行——
  `runtime.ts` 把 `opts.label` 放进 `startAgent(...)`，`host.ts` 的 `childRequest()` 接收 `label`、
  `startChild()` 用 `` label: request.label ?? `${this.meta.name} child ${callId}` ``；改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start`（事件带 `childId`）后调
  `ctx.sessionTitle.rename(session, <任务名>)`，把顶栏**次级行**的提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — v0.6.0 发布 + 隔离验证收尾（release-runner，`release/0.6.0` 分支）

- **From:** release-runner · **To:** lead · **Base:** `ca040e4`（`release/0.6.0` release-prep；`main` 已合入为 `1f9065d`，PR #43）
- **发布（CONFIRMED）：** PR #43 CI Node 22 + 24 pass（run `42362505851`）→ merge `1f9065d` →
  tag `v0.6.0` → 同 sha（`git ls-remote --tags origin` CONFIRMED）→ Release workflow run
  `42362674837` success → GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.6.0`
  published **2026-11-07T10:09:17Z**，asset `dsh-grok-workflow-0.6.0.tgz` **299,146 B**。
  minor 理由：C1 向后兼容（hint 只重排未试路由，孤立 run 逐字节一致），按 RELEASING.md 走 minor。
- **本地检查（CONFIRMED）：** `npm ci` / typecheck 0 errors / lint **4 warnings / 0 errors**
  （3 既有 + 1 新增 `src/run.ts:29` 未使用 `RoleName`，本版未修）/ build（client 84123 B）/
  `git diff --exit-code -- lib/` = 0 / vitest **35 files / 624 PASS** /
  `npm pack --dry-run` 64 files / 299.1 kB（npm 缓存只读，改用 workspace-local cache 重跑）。
- **隔离验证 Round 26（CONFIRMED）：** 新鲜 profile `v060r` + 隔离 `DSH_HOME=out/v060-verify/home`，
  模型 v4-pro + agnes flash（v4.1-flash 当天 cooldown，如实记录）；单轮团队档双任务双路由
  （各 cap 1）→ COMPLETED，2 verified，报告含本地 `Route overflows` 行 + 双 worker 路由；
  工作区仅 sum.txt/prod.txt（611），无外写。跨 run hint 行本轮未产出（单 run），由单测覆盖。
  证据：`docs/knowledge/evidence/v060-route-cap/`（README + report-full + session 52 事件）。
- **诚实边界：** 未动 DSH core；未重启/未碰 live `:3090`（仍 `0.2.7`，D-013）；未动已发布 tag；
  operator `DSH_HOME` 未写；`warn.emptyCap` 浏览器渲染 `NOT_RUN`（单测覆盖）。
- **本轮归档（release 分支，不进 main）：** `docs/knowledge/evidence/v060-route-cap/`（4 文件，
  已删冗余 excerpt 只留 report-full + session-events + README）+ STATE（`0.6.0` released）+
  VALIDATION.md Round 26 + 本节；随本轮 commit push 到 `origin release/0.6.0`。
- **Next action：** lead 确认后可关闭本轮；`:3090` 升级到 `v0.6.0` 待用户批准（D-013），不自行执行。

## 2026-11-07 — 路由 Cap B组+C1 收尾归档（route-cap-closer，`release/0.5.1` 工作分支）

- **From:** route-cap-closer · **To:** lead · **Base:** `df34ac0`（本地 `release/0.5.1` HEAD，本轮 commit 前）
- **变更文件（`git add -A` 入库，未 bump 版本、未打 tag、未发布 npm）：**
  实现（既有工作树改动，本轮只重建 `lib/` 确认同步）：`src/settings.ts`（`validateRoutes` 空 Cap notes）、
  `src/client/index.js`（`warn.emptyCap` 中英 + 黄字横幅，不拦 Save）、`docs/ARCHITECTURE.md`（单 run 作用域）、
  `src/script.ts`（`busyRoutes` 快照 + 重排未试顺序 + `'(cross-run hint)'` 标记）、`src/run.ts`（run 级路由标签快照）、
  `src/report.ts` + `src/records.ts`（`Route overflows (cross-run hint)` 分开渲染 + 透传）、
  `docs/knowledge/RESEARCH.md`（A16，C2-spike 已写入）、`CHANGELOG.md`（条目已由实现任务写入）、
  `test/route-concurrency.spec.ts` + `test/client.spec.ts`、`lib/` 编译产物（`build-client` 84123 B，二次重建 md5 幂等）；
  归档（本轮新增）：`docs/knowledge/DECISIONS.md` D-038、`docs/knowledge/VALIDATION.md` Round 25、
  `docs/knowledge/STATE.md`（Last updated 行 + Next priority 段）、本节。
- **ci 结果（CONFIRMED）：** `npm run build` PASS；`npx vitest run test/route-concurrency.spec.ts test/client.spec.ts`
  **47/47 PASS**（route-concurrency 13/13，client 34/34）；`npm run ci` **624/624 PASS**（35 文件，typecheck 0 errors，
  lint 3 warnings / 0 errors 既有基线）；DSH core 未改；live `:3090` 未重启（D-013）；真机 live `NOT_RUN`。
- **诚实边界：** B组+C1 已合入工作树、随本轮 commit 进 `origin release/0.5.1`；未发布、未打 tag；
  `task-3` 只读确认 completed（未 claim）。push 结果见本轮回复。
- **Next action：** lead 复核 D-038 / Round 25 后决定是否合入 `main`、走发布流程、升级 `:3090`（需用户批准）。

## 2026-11-07 — v0.5.0/v0.5.1 收尾 + Round 24 诊断交接（release-closer，`release/0.5.1` 工作分支）

- **From:** release-closer · **To:** lead / next agent · **Base:** local `release/0.5.1` HEAD `720eeb6`
  (merge second-parent); `origin/main` = `5cc66be` (Merge PR #42); tag `v0.5.1` → `5cc66be`
  (far-end sha matches `origin/main`, `git ls-remote --tags origin` CONFIRMED); GitHub Release
  `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.5.1` published
  **2026-11-07T02:08:32Z**, asset `dsh-grok-workflow-0.5.1.tgz` **294,363 B**.
- **现状（CONFIRMED）：** `package.json` + `package-lock.json` = `0.5.1`；`CHANGELOG.md` 有双语
  `## [0.5.1] - 2026-11-07`（PR #41 / `45d721a`）；`npm run ci` PASS（typecheck 0 errors /
  lint 3 warnings 0 errors / vitest **35 files / 617 tests**；`git diff --exit-code -- lib/` 无 diff）。
- **本轮归档（CONFIRMED）：** `docs/knowledge/VALIDATION.md` +39 行 Round 24 只读诊断；
  `docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md`（已 chmod 644）+
  `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（已 chmod 644）入库；
  `docs/knowledge/evidence/v051-fast-context/`（13 文件）入库；`.gitignore` 追加
  `.v050-home/` `.v051-home/` `.v051-verify/` `out/`（本地隔离目录不入库）。
- **Round 24 结论（CONFIRMED，只读诊断，未改代码）：** session-3361cd6e 团队档即时回执
  （seq 2339，step 之外的 `assistant/message`）使 `tokenMeter.measure()` 每次在同处抛错，
  turn 4 之后自动压缩永久停摆，GUI 百分比照常 92–95%；`/compact` 实测 NOT_RUN（会写会话），
  Web GUI API 取数 BLOCKED（401，不读凭据）。修复方案留给用户决策，未执行。
- **诚实边界：** 未动 `main`、未打 tag、未重启 `:3090`（D-013；`:3090` 仍跑 `0.2.7`，
  reload/upgrade 待用户批准）；未删本地目录。CHANGELOG/package.json 版本号本轮未改。
- **Next action：** lead 确认本 commit 内容后由 release-closer `git push origin release/0.5.1`；
  用户决策 Round 24 修复方案（receipt 写时点 / token-meter 容忍孤儿 / 新会话 `instantReceipt: false`）。

## 2026-11-06 — 先回捞后提问（`history_first_no_reask`，v0.5 未发布，工作树内）

- **From:** workflow execution agent · **To:** next agent / verifier · **Base commit:** `ac28a41`
- **做了什么（`CONFIRMED`）：** `src/triage.ts` 新增 `recallFromPrior()`（去停用词的双字/词锚点 ≥2，
  或指针式引用「刚才那份/上面说的/the above」+ 有实质材料 ≥120 字符）、`RECALL_LIMITS`、
  `TriageInput.prior`、`DETAIL.recalled`、`recallPrompt()`、`recalledNote()`、`missingNote()`；
  `classifyTriage()` 里 4 处 ask 判定统一改为 `ambiguousVerdict()`——`prior` 为命中则返回
  `fast/recalled`，否则返回与改动前完全相同的 `ask`/`ambiguous-escalate`。
  `src/gate.ts` 新增 `memoryDocRoots()`（默认 `<cwd>/docs/knowledge`，`GROK_WORKFLOW_KNOWLEDGE_DIRS`
  可改）、`readMemoryDocs()`（只读、有界、过 `redactSecrets`、永不抛）、`collectRecallSources()`
  （会话上文 + 前序轮次 digest + 记忆文件，**剔除本轮消息**），并在 `produceAnswer()` 的 ask 档前接线：
  命中→快手档据材料作答；未命中且查过→提问后追加「先查后问，还缺 X」；无任何来源→提问逐字节不变。
- **测试（`CONFIRMED`）：** `npm run ci` **35 文件 / 617 测试 PASS**、`Found 3 warnings and 0 errors`
  （3 个既有 warning）；本轮新增 `test/triage-recall.spec.ts` **28 例**（命中/未命中/指针式/确定性/
  上限/脱敏/默认根/逐字节回归/`session-7e079b80` 形态回放成对用例）。证据：
  `docs/knowledge/evidence/history-first/{ci-summary,recall-spec,regression-suite}.txt`。
- **决策：** D-037（提问前先读；只读、有界、无新配置键；`ask:false` 时命中仍走快手档）。
- **现场发现（`CONFIRMED`，已修）：** 首版把本轮消息也算作「历史」（`relay` 在 `produceAnswer()` 前
  就 `commitClaimed()`），导致任何追问都「命中自己」——现在 `collectRecallSources(…, exclude)` 按
  `textOf(message) === request` 剔除，`before the fix` 用例守着它。
- **诚实边界：** 真机在线模型回放 `NOT_RUN`（本轮未起隔离 profile）；语义同义改写不会命中，
  会退化为提问；只读 `docs/knowledge/*.md`，不读 `archive.jsonl`。
- **Next action：** ①等 verifier 复核判据 1/2/4；②若要真机收敛，按 VALIDATION Round 21/22 的隔离
  home + `wb/cn:deepseek-v4.1-flash` 跑一次「先研究、后追问」两轮，确认追问不再要求重述；
  ③`:3090` 未热加载（D-013），不要自行重启。

## 2026-11-06 — PR #37 merged + v0.4.0 released (GitHub Release only, no npm)

- **From:** release operator (local) · **To:** next agent / operator
- **Base commit:** `e89daf9` (PR #37 feature on `feat/triage-history-hybrid`); **merge commit** `9438b3d` (PR #37 merge);
  **release commit** `708c315` (PR #38 merge); **tag** `v0.4.0` → `708c315`.
  `package.json` and `package-lock.json` both read `0.4.0`;
  `CHANGELOG.md` carries the bilingual `## [0.4.0] - 2026-11-06` section with a fresh empty
  `## [Unreleased]` above it; `docs/releases/RELEASE-NOTES-0.4.0.md` exists.
- **Feature (CONFIRMED):** history-aware follow-up (`FOLLOW_UP` + `historyNonEmpty`, `fast/followup`,
  never `chat`; `triageFollowupAsFast` opt-out) + hybrid classifier opt-in (`triageClassifier`
  `rules|hybrid`, default `rules`, one `runSingleCall` only for `ask`/ambiguous or `chat`+history,
  fallback to rules) + team-tier instant receipt (`appendInstantReceipt`) + deterministic
  `【人话结论】 verified/total` lead-in (`humanSummary`, zero extra calls).
  `npm run ci` 32 files / 545 tests PASS (incl. new `test/triage-followup.spec.ts` 5 cases);
  `npm run typecheck` clean; `npm run lint` 3 warnings / 0 errors (pre-existing);
  `npm run build` clean; `git diff --exit-code -- lib/` exit 0; `npm pack --dry-run` 56 files / 250.7 kB.
- **Merge of the feature (CONFIRMED):** `gh pr merge 37 --merge` after `gh pr checks 37` showed
  Node 22 `pass` / Node 24 `pass` (run `42074144133`); merge commit `9438b3d`;
  `origin/main:src/gate.ts` contains `triageClassifier === 'hybrid'` branch and `humanSummary` block.
- **Release (CONFIRMED):** branch `release/0.4.0` → PR #38 green on Node 22/24 (run `42075028625`)
  → merge `708c315`. `git tag v0.4.0 708c315` + `git push origin v0.4.0`. Release workflow run
  [42075318386](https://github.com/free6589/dsh-grok-workflow/actions/runs/42075318386) green end
  to end. GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.4.0` with
  `dsh-grok-workflow-0.4.0.tgz` (250,693 B, sha256 `e10802ca…`).
- **Tags:** `git ls-remote --tags origin` taken before and after; `diff` over the pre-existing
  tags = no changes. `v0.1.0`–`v0.3.0` untouched; only `refs/tags/v0.4.0` is new.
- **Decisions:** D-032 (history-aware follow-up) + D-033 (hybrid opt-in) + D-034 (receipt +
  deterministic summary, model-rewrite variant rejected after breaking 4 engine-count assertions).
- **Honest boundary:** `humanSummary` model-rewrite variant was built then reverted (extra engine
  call broke P0-2 ×3 + triage count ×1); shipped version is deterministic. Live multi-turn
  follow-up (`说人话` with history in one session) is covered by deterministic unit tests, not by
  one-shot headless (each headless turn is a fresh session). Isolated-profile live verification
  (Round 20): greeting `chat` + fast `30` PASS on `wb/cn:deepseek-v4.1-flash`; team tier ran and
  reported honestly (FAILED on an unresolvable `run.ts` path in an empty `/tmp` workspace — the
  gate/report path itself PASS, not a model-quality claim).
- **Next action (needs the operator, not an agent):** the live DSH service on `:3090` still runs
  `dsh-grok-workflow@0.2.7`; upgrading the `web` profile to `v0.4.0` (and any profile reload)
  still awaits explicit user approval (D-013). Do not restart the service on your own.

## 2026-11-03 — PR #35 merged + v0.3.0 released (GitHub Release only, no npm)

- **From:** release operator (local) · **To:** next agent / operator
- **Base commit:** `af0394a` (PR #35 merge on `main`); **release commit** `3f5ad0a` (PR #36 merge);
  **tag** `v0.3.0` → `3f5ad0a`. `package.json` and `package-lock.json` both read `0.3.0`;
  `CHANGELOG.md` carries the bilingual `## [0.3.0] - 2026-11-03` section with a fresh empty
  `## [Unreleased]` above it; `docs/releases/RELEASE-NOTES-0.3.0.md` exists.
- **Merge of the feature (CONFIRMED):** `gh pr merge 35 --merge` after `gh pr checks 35` showed
  Node 22 `pass` / Node 24 `pass` (run
  `https://github.com/free6589/dsh-grok-workflow/actions/runs/41659656218`); merge commit
  `af0394a`; `origin/main:src/config.ts` contains `repairSynthesisInconsistency`.
- **Release (CONFIRMED):** branch `release/0.3.0` → PR #36 (`https://github.com/free6589/dsh-grok-workflow/pull/36`)
  green on Node 22/24 (run `41664791714`) → merge `3f5ad0a`. `git tag v0.3.0 3f5ad0a` +
  `git push origin v0.3.0`. Release workflow run
  [41665410667](https://github.com/free6589/dsh-grok-workflow/actions/runs/41665410667) green end
  to end (tag↔`package.json` validation, typecheck, lint, build, `lib/` consistency, tests, package
  checks, bilingual changelog extraction, release creation). GitHub Release
  `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.3.0` with
  `dsh-grok-workflow-0.3.0.tgz` (246,493 B, sha256 `3a8bf81b…`).
- **Local checks on the release commit** (`f8cb09e`, identical tree to the merge `3f5ad0a`):
  `npm ci` PASS; `npm run typecheck` PASS; `npm run lint` 3 warnings / 0 errors (pre-existing
  baseline); `npm run build` PASS; `git diff --exit-code -- lib/` exit 0; `npm test` 31 files /
  540 tests PASS; `npm pack --dry-run` 56 files / 246.5 kB / `dsh-grok-workflow-0.3.0.tgz`.
- **Tags:** `git ls-remote --tags origin` taken before and after; `diff` over the pre-existing
  tags = no changes. `v0.1.0`–`v0.2.7` untouched; only `refs/tags/v0.3.0` is new.
- **Honest boundary:** real-machine coverage of the shipped change is **partial** (isolated
  instance alive with a bad config; boot warn line not captured; `/api/settings/describe` + page
  `401`, same as VALIDATION Round 16 item 8; settings-page render/save-back `NOT_RUN`).
- **Next action (needs the operator, not an agent):** the live DSH service on `:3090` still runs
  `dsh-grok-workflow@0.2.7`; the `web/cordis.patch.yml` `synthesis: model` line and the `0.3.0`
  upgrade both take effect only after a profile reload/`plugin add …#v0.3.0`, and **that reload
  still awaits explicit user approval (D-013)**. Do not restart the service on your own.

## 2026-11-03 — P0 web fix + PR #35 synthesis fallback (lead-reviewed, not merged)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `1024b1c` (`origin/main`); work commit `7c4a05e` on `feat/synthesis-fallback`
  (local `main` reset back to `1024b1c` after review; work lives on the feature branch + PR).
- **P0 (CONFIRMED, operator machine):** `web/cordis.patch.yml` `grok-workflow.config` +1 line
  `synthesis: model` (line 1029, 4-space indent, same level as `grokDefault: on`).
  Backup: `~/dsh-profile-backups/cordis.patch.yml.20261103-222020-pre-synthesis-model`.
  `diff -u` = +1 line only; `grep -n -A16 "id: grok-workflow"` shows the line; `plugin list`
  still `dsh-grok-workflow@0.2.7`. No service restarted (D-013 rule 1); live `:3090`
  reload still needs operator approval.
- **P1–P3 (lead-verified, PR #35):** `https://github.com/free6589/dsh-grok-workflow/pull/35`
  closes #34. `repairSynthesisInconsistency(raw)` in `src/config.ts` (pure, only shapes
  (a)/(b)); `apply()` in `src/index.ts` load-time catch → `logger.warn`（含"已按…生效，
  请在设置页确认"）→ `resolveConfig(repaired)` must pass → activate with
  `synthesisRepaired: true` (`describeResolvedConfig` renders `synthesis=<mode> (repaired)`).
  Settings page (`src/client/index.js` `validate()`) red-blocks Save on the same two
  mismatches (`error.synthesisChainUnused`/`Missing`, bilingual). R-06 unchanged.
- **Tests run (lead, on `7c4a05e` before reset):** `npm run typecheck` PASS; `npm run lint`
  3 warnings 0 errors (pre-existing — base `1024b1c` also 3, `GROUPS_WITH_FIELDS`/`field`/
  `redact.ts:155` escape); `npx vitest run test/config-synthesis-fallback.spec.ts
  test/client.spec.ts test/config.spec.ts test/routing.spec.ts` 4 files / 93 PASS;
  `npm run ci` **31 files / 540 tests PASS**; `git diff --exit-code -- lib/` = 0.
  Secret grep over changed src/test = only benign `task-failed`/`id:` matches.
- **Local runtime (partial, honest boundary):** `DSH_HOME=/tmp/p1-verify-home`, profile `p1web`,
  `127.0.0.1:3297`, bad-config instances stayed alive, but boot stdout had only URL lines
  (warn/signature not captured); `/api/settings/describe` + page fetch = 401 (same known
  dead-end as Round 16 item 8). Settings-page render + save-back `NOT_RUN`.
- **Next action:** review/merge PR #35 (lead-verified, 1 commit ahead of `origin/main`);
  then plan release per `docs/RELEASING.md`; live `:3090` reload only with approval.

## 2026-11-03 — web profile upgraded 0.2.6 → 0.2.7 (operator machine)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `16a11b7` (`origin/main`, `v0.2.7` tag; `package.json` `0.2.7`)
- **Action (CONFIRMED):** `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.2.7`
  (pnpm Done in 8.8s); `dsh plugin --profile web list | grep grok` →
  `dsh-grok-workflow@0.2.7`; `why` → single copy under `dsh-profile-web (dependencies)`.
- **Note:** D-013 respected — running `:3090` service was not restarted/reconfigured by this
  task; new bundle code applies on next profile (re)load per DSH plugin semantics.
- **Next action:** none required for the upgrade itself; restart/reload of `:3090` only with
  operator approval if live verification is wanted.

## 2026-11-03 — v0.2.7 released (per-route concurrency + P0-5 first-message fix)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `16a11b7` (`origin/main`, PR #33 merge = the v0.2.7 release commit; tag `v0.2.7`
  已打，Release 已建：`https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.7`，
  资产 `dsh-grok-workflow-0.2.7.tgz`)
- **What landed since v0.2.6:** P0-5 首条消息先发布再跑 (`d8cc6cc`)；按路由并发上限
  `maxInFlight` + 打满让路 (`1b5ad75`, PR #32, D-030)；发版准备 (`0e8a7e7`, PR #33)。
- **Install:** `dsh plugin --profile <p> add github:free6589/dsh-grok-workflow#v0.2.7`，装完重启该 profile。

## 2026-11-01 — v0.2.4 install matrix recorded: 8 PASS + 2 NOT_RUN (memory only)

- **From:** matrix-memory · **To:** lead
- **Base commit:** `7357e5e` (`origin/main`, PR #28 merge = the v0.2.4 release commit; tag `v0.2.4`
  已打，Release 已建：`https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.4`，
  资产 `dsh-grok-workflow-0.2.4.tgz`)
- **Work commit:** the docs-only commit carrying this section on `docs/matrix-024-memory`. No
  `src/`, `lib/` or `test/` file changed (`git diff --stat 7357e5e HEAD -- src lib test` is empty);
  this branch exists only to record the result.
- **Matrix result (read-only evidence, not committed):**
  `.workflow-artifacts/matrix-024/EVIDENCE.md` + `logs/` (item1~item8). Items 1–7 **PASS**,
  item 8 部分通过（composition + boot 确认；`settings`/`describe` 经 query-token + Bearer 均
  `401 unauthorized`，namespace 未确认），items 9–10 **NOT_RUN**（本环境无浏览器自动化；
  Round 15 已在真 GUI 上覆盖设置页与 web 聊天）。
- **Anomaly on record:** item 7 run3 首轮 EXIT 0 直接答 `apple, banana, cherry` 无报告
  (`logs/item7-run3.jsonl`，563 bytes)；同 prompt 重跑 `COMPLETED` verified
  (`logs/item7-run3-rerun.jsonl`，3667 bytes)；异常之后连续 3 个 EXIT 0 + 报告。样本保留，
  未掩盖。原文引用见 `VALIDATION.md` Round 16 §2。
- **Details:** `VALIDATION.md` Round 16（逐项 1–10 + 异常原文引用 + `EVIDENCE.md` 路径）；
  `STATE.md` 已对齐（Current phase = v0.2.4 已发布，Next priority = 下一版规划，
  NR-1/7/8 与 Round 15/16 对齐）。
- **Tests run this round:** no source test suite was executed (docs-only change). Read-only checks:
  `git status`, `git diff --stat`, secret grep over the three files (0 hits). `npm run ci` on
  `main` `7357e5e` is still `NOT_RUN` — the last full run (27 files / 487 tests) was on the
  PR #26 branch, see Round 13.
- **Next action:** merge `docs/matrix-024-memory` into `main`, then plan the next version scope
  (`relay`/`append` 投递、item 8 的 API 认证、质量矩阵、U-6 chain editor 候选）.

## 2026-11-01 — real Web GUI verified: `/grok` switch + settings card (memory only)

- **From:** local (gui-verify-memory) · **To:** lead / captain / next local agent
- **Base commit:** `6806426` (`origin/main`, PR #27 merge — the tree this verification ran against)
- **Work commit:** the docs-only commit carrying this section on `docs/gui-verify-memory`. No
  `src/`, `lib/` or `test/` file changed (`git diff --stat 6806426 HEAD -- src lib test` is empty);
  this branch exists only to record the result.
- **What is now `CONFIRMED`** (previously `NOT_RUN` since Round 14 §5): on an isolated instance
  (`DSH_HOME=.workflow-artifacts/gui-verify/dsh-home`, profile `gw-gui` from the stock `web`
  template, `127.0.0.1:3199`, real Chromium, live `:3090` untouched):
  1. **`/grok` is switchable in the real GUI** — default `off` gives a plain answer with no report;
     `/grok` gives the command row, the `3 subagents` badge and a full `GROK-WORKFLOW-REPORT`
     (`COMPLETED`, 1 verified, model routes, 3600000 ms deadline) in 1m41s; `/grok off` in the same
     session returns to plain chat in 11s. Command events, `plugin:grok-workflow/mode` events and
     the report text were each re-read from `session.v4.jsonl.zstd` this round.
  2. **The settings card renders and saves** — Plugins → `Grok workflow` card → generated page with
     `Grok mode default` / `grokDefault` `off | on`; edit → `Save (1)` → save takes `revision 0` to
     `revision 1`; a full page reload keeps `revision 1` / `on`; the write lands in the profile's
     `cordis.patch.yml` (md5 `d7830129…` → `1f628a0c…`) as `grokDefault: on`; and a **new** session
     with no `/grok` runs the workflow (fast lane, 1 subagent, 30s), so the value is functional.
- **Boundaries to repeat whenever this result is quoted:** the browser was **offscreen (headless)
  Chromium** (no X11 display on this host) and the model was **`wb/cn:glm-5.3-flash`** because the
  suggested `wb/cn:deepseek-v4.1-flash` returned `400 model_unavailable` (per-model cooldown) on
  2026-11-01. Delivery verified is the default **`in-turn`**; `relay`/`append` in a long-lived GUI
  session remain `NOT_RUN`. No quality/per-model claim follows. Five environment deviations are
  listed in `VALIDATION.md` Round 15 §4.
- **Evidence:** `.workflow-artifacts/gui-verify/README.md`, `shots/` (20 PNGs), `logs/`
  (`stepB2.log`, `stepC.log`, `stepD.log`, `stepE.log`, `dumpconfig-step*.txt`,
  `patch-before-settings.md5`), `scripts/` (the Playwright scripts). **These artifacts are not
  committed** — `.workflow-artifacts/` is untracked; only the paths and the quoted text are in the
  memory files.
- **Tests run this round:** no source test suite was executed (docs-only change); the verification
  evidence is the GUI run above. `npm run ci` on `main` `6806426` is still `NOT_RUN` — the last full
  run (27 files / 487 tests) was on the PR #26 branch, see Round 13.
- **Repository state:** `main` = `6806426` with PR **#23** (`2e9c26a`, Phase 1 dialogue reliability),
  **#24** (`334daf6`, task-grouped progress panel), **#25** (`54083ea`, 32,000-char objective
  limit), **#26** (`a000983`, segmented fallback) and **#27** (`6806426`, `/grok` switch) merged.
  `v0.2.3` is released (tag `538d1ab`); `package.json` still reads `0.2.3`.
- **Next action:** merge this docs branch, then prepare the **`0.2.4`** release from `main`
  (`npm run ci` + `git diff --exit-code -- lib/` on `main`, move `[Unreleased]` under
  `## [0.2.4]`, bump `package.json`/`package-lock.json` together). Do not tag, publish or restart
  the running service without the captain.

## 2026-11-01 — PR #26 review close-out (three fallback findings)

- **From:** local (pr26-closer) · **To:** lead / next local agent
- **Base commit:** `2e9c26a` (`origin/main` after PR #23; the branch was rebased onto it, originally
  cut from `334daf6`)
- **Work commit:** `68f3d15` on `fix/fallback-shards` (rebased: `6e902e0` → `bba5dc9`, `5cbccf2` → `68f3d15`)
- **Changed:** `src/shards.ts` (new: one splitter, rendered into the script and reused by host
  validation), `src/script.ts`, `src/report.ts`, `test/fallback-shards.spec.ts` (16 cases),
  `test/helpers.ts` (`taskFromPrompt`), `test/objective-limit.spec.ts`, `test/report.spec.ts`,
  `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `lib/**`.
- **Tests:** `npm run ci` = exit 0, **27 files / 487 tests** (post-rebase, includes the PR #23 specs);
  `npm run build && git diff --exit-code -- lib/` = exit 0.
- **Not found:** the "1 medium test gap + 1 low boundary issue" an earlier review round was said to
  have recorded is **not** in `.workflow-artifacts/` (that directory holds the objective-limit round
  only: `baseline/`, `limit-core*`, `test-report.md`, `github-recon.md`, `pr-fallback-shards.md`), nor
  in `docs/knowledge/`, `.agent-teams/`, or `.session-stage/`. Closest but unconfirmed:
  `test-report.md` §9 items 1–3 (fallback sharding not yet implemented; the generated script has no
  `objectiveChars` enforcement point; upstream boundary tests incomplete).
- **Open, not fixed here:** the generated script still does not enforce `TASK_LIMITS.objectiveChars`
  itself (`src/script.ts` declares it, nothing reads it); the host enforces it at gate/tool/input, so
  bypassing the host a 32,001-character objective still yields a `partial` fallback.
- **Next action:** review `68f3d15` on `origin/fix/fallback-shards`, then decide on merging PR #26
  (merge is the lead's call). PR #26 is rebased on `2e9c26a` and no longer conflicts.

## 2026-10-27 — v0.2.0 released and installed on the operator machine

- **Released:** `v0.2.0` tag + GitHub Release (tgz 42 files / 108,428 B, sha256 recorded by GitHub). CI and Release workflows green. `v0.1.0` untouched.
- **Installed:** real profiles `headless` and `web` (layerfs root), locked to `#v0.2.0`. Web GUI service restarted with the plugin composed.
- **Test matrix:** 8/10 PASS on real installs with real models (VALIDATION.md "0.2.0 real-profile install matrix"); 2 NOT_RUN are GUI-interactive checks for the operator (settings page rendering in browser, web chat behavior).
- **Rollback:** `dsh plugin --profile <p> remove dsh-grok-workflow`; backups under `~/dsh-profile-backups/`.
- **Operator checklist (morning):** send a chat message in the GUI and confirm a workflow report (not a direct answer); open Settings and confirm the auto-generated `grok-workflow` page renders; judge in-turn latency comfort (adjust timeoutMs/maxTasks or request progress hints per U-9).
- **Next action:** fix loop per D-011 on any failure (patch bump, new tag, reinstall, retest); backlog: chain-editor UI (Phase 9), streaming progress, relay/append GUI evidence (NR-1 half).
- **Then (0.2.1):** the Web GUI settings page (plugin-owned browser bundle) and the documented
  activation prerequisite are prepared on `main`; `v0.2.1` is created by the captain after the
  acceptance pass. `v0.2.0` stays where it is.


## 2026-10-26 — Security observation (captain integration note)

- During t15's writesPaths experiment a workflow subagent inherited session tools including git and committed `docs/plan-a.md` as `e38ac8e` (`dsh-agent@localhost`) without authorization. Artifacts removed in the v0.2.0 release batch; history kept intact deliberately (audit trail).
- Risk: subagents of the workflow inherit the parent session's toolset — including VCS write access. Operators running the workflow in profiles with git-capable tools should treat this as a documented limitation (see WORKFLOW-DESIGN limits). Mitigation options for future versions: tool pre-execute deny list for subagents, or documented operator guidance.
- The plugin's own recursion guard blocks workflow re-entry in subagents, but it cannot (and does not) restrict which unrelated tools a workflow subagent may call.


## 2026-10-26 — Round 2 (phases 1–7): mandatory entry, routing, settings, reliability, release prep

- **From:** local team (AgentTeams dshgw-workflow-planning), implementer + independent reviewers
- **To:** captain / next local agent / independent reviewer
- **Base commit:** `bd1f261` (U-4 write-path isolation; phase 6 landed in `32a7f4a`)
- **Package version:** `0.2.0` — **released** as `v0.2.0` on 2026-10-26 (tag on `f7a244c`,
  GitHub Release 2026-10-26T17:10:16Z, 42 files / 108,428 B). This section was written before that
  tag existed; the version in the tree today is `0.2.1` (its tag is still pending).
- **Release-readiness artefacts:**
  - `docs/releases/RELEASE-NOTES-0.2.0.md` — the announcement as published, artifact table
    (`0.1.0`: 33 files / 61,281 B → `0.2.0`: 42 files / 108,428 B as released) and operator steps
    pointing at [RELEASING](../RELEASING.md). (`0.2.1` has its own notes file next to it.)
  - `scripts/smoke-settings-identity.mjs` — feeds the **built** plugin the descriptor produced by
    the DSH installation's own `dsh-settings` projection and prints the diagnostics line; the
    end-to-end check for the t31/F1 identity fix.
  - `test/settings-fixture.ts` + `test/settings-projection.spec.ts` — the settings descriptor is
    no longer hand-shaped: the runtime's projection rules are applied, the measured facts are
    pinned, and the transcription is cross-checked against the real module when discoverable.
- **What is now true:**
  - The gate claims every user message through `agent/pre-step` and answers it
    from a validated report in the same turn (`in-turn`, the default;
    `enforceGate: true` is the default, `gateRequired` turns a missing hook into a
    load error).
  - Per-role ordered fallback chains (`roles.{planner,worker,verifier,synthesizer}`,
    ≤3 routes), a `switchOn` whitelist, and routing recorded in the report.
  - Failure `class` + `category` (`infrastructure`/`quality`/`configuration`/
    `cancelled`/`unknown`) end to end, including a rendered `Failures:` line.
  - A live settings surface derived from the exported `Config`: unknown keys
    rejected with a suggestion, chains validated against the runtime's providers,
    edits apply to the next message with a last-good fallback.
  - Write-path isolation (U-4): `writesPaths` per task, conflict-aware pool,
    normalized lexical overlap, echoed in the report.
  - Documentation set synchronized: README (EN + zh), CHANGELOG (bilingual
    `0.2.0`), DESIGN (DD-1..DD-9b + NR ledger), ROADMAP (phases marked), STATE,
    DECISIONS (D-009..D-012), ARCHITECTURE, VALIDATION.
- **Tests run:** `npm run ci` — PASS: typecheck, lint 0/0, build, **264 tests / 18
  files**. `lib/` reproducible (identical md5 before/after rebuild). Clean-copy
  `npm ci` + `npm run ci` PASS. `npm pack` contents verified. Isolated-profile
  install of the packed tarball PASS.
- **Local runtime verified:** real headless one-shot run with a live model passes
  the delivery assertion (`scripts/e2e-headless-in-turn.sh`: PASS, `Grok workflow:
  COMPLETED`), and the explicit-refusal path was measured twice in t14.
- **Honest gaps (do not read these as done):** NR-1 (GUI/long-lived delivery
  half), NR-5 (real provider failure texts), NR-6 (real-provider route switching
  end to end), NR-7 (stock form rendering of `roles`), NR-8 (in-place settings
  `update()` against a live holder), NR-9 (planner fill-rate for `writesPaths`).
- **Blockers:** none technical. The remaining release steps need the captain:
  create `v0.2.0`, publish the GitHub Release, and never move `v0.1.0`.
- **Next action:** t16 final acceptance on the packed artifact, then tag + Release
  per `docs/RELEASING.md`.

## 2026-10-25 — Workflow planning round 1 (audits → synthesis → review → revision)

- **From:** local team lead (AgentTeams dshgw-workflow-planning)
- **To:** cloud reviewer / next local agent
- **Base commit:** b231660 → **work commit:** 2403a10 (see git log for the round's commits: 023887d criterion fix, d82c245 synthesis, 0672de6 revision, 2403a10 QA-2 batch)
- **Changes:** Four independent read-only audits (architecture / DSH 0.2.1-rc.2 API / model routing / security+testing) with source-line evidence; two live experiments (t18 B-1 delivery routes, t19 H-1..H-5 API capability probes); synthesis + independent review (21 findings) + revision of WORKFLOW-ROADMAP.md and WORKFLOW-DESIGN.md; QA batch: criterion normalization fix (t20, 023887d) and report validation/redaction/engine-contract batch (t21, 2403a10).
- **Tests run:** `npm run ci` PASS — 106 tests / 9 files (was 56); clean-copy `npm ci` + `npm run ci` PASS; t20 independently re-verified with isolated-snapshot mutation testing (t22, PASS on t20 portion).
- **Local runtime verified:** t18/t19 experiments ran against real installed DSH 0.2.1-rc.2 in isolated DSH_HOME profiles (enter/reject/relay/source.kind/plugin-record behaviors). NOT_RUN: web long-lived keep-alive, relay multi-sample, (a') write ordering, settings nested write to disk (NR-1..NR-4 in WORKFLOW-DESIGN).
- **Key verdict:** mandatory entry is **partially feasible** as an external plugin (4 guarantees runtime-verified, 4 only conditional). See WORKFLOW-ROADMAP §5.3 and DESIGN A-14 for the exact split and the minimal upstream changes if unconditional guarantees are required.
- **Blockers:** none technical. U-1..U-7 product tradeoffs await user decision (answer route, retry ownership, synthesizer, shared-dir policy, strict-mode cost, YAML-first, enforcement scope).
- **Next action:** user decides U-1..U-7; then implement in the agreed phase order (gate+delivery unit first if the user keeps entry-first priority). QA-2 independent re-review (t22b) runs in parallel.


## 2026-10-25 — First release v0.1.0

- **From:** local release operator
- **To:** cloud reviewer / next local agent
- **Base commit:** `7904e23` (PR #18 merge)
- **Work commit:** `a7d5a62` (`fix: correct changelog section regex in release workflow`)
- **Tag:** `v0.1.0` (tag object `f175ada8a7533a5f61c06a75e5a457e32b37579b`) → `a7d5a6267c471a6ed73e44ac02092f59942c508a`
- **Changes:**
  - Created and pushed the annotated `v0.1.0` tag after PR #18 merged and main CI passed.
  - First release run `40182588171` failed because the changelog-boundary regex had an extra backslash from YAML/heredoc escaping; fixed `a7d5a62`, then recreated the tag before any release existed.
  - Final release run `40182751006` created the GitHub Release and attached `dsh-grok-workflow-0.1.0.tgz`.
- **Tests run:** release workflow `40182751006` — PASS on Node 22 only, including typecheck, lint, build, `lib/` consistency, tests, package checks, and attachment. Main CI `40182707932` covered Node 22/24.
- **Test results:** PASS.
- **Local runtime verified:** yes for tag-pinned installation/config composition in an isolated `DSH_HOME`; a real `grok_workflow` model call was **NOT_RUN**. Release publication is confirmed by GitHub.
- **Blockers:** none.
- **Next action:** optionally smoke-test `dsh plugin ... add github:free6589/dsh-grok-workflow#v0.1.0` in an isolated profile; do not move the published tag.

## 2026-10-25 — Issue #17 fallback partial validation

- **From:** local agent (watcher wake for issue #17)
- **To:** cloud reviewer / next local agent
- **Base commit:** `a2b2f9f`
- **Work commit:** `9c2cc29` (`fix: accept verified fallback reports as partial`)
- **Changes:**
  - Host validation now permits a fallback plan whose single task is verified
    to remain `partial`, provided the planning error is present.
  - Non-fallback `partial` still requires both verified and failed tasks;
    fallback plans can never be `completed`; `partial` still requires at least
    one verified task.
  - Added a host-validation regression test using the real generated fallback
    report, plus the existing orchestrator coverage.
- **Tests run:**
  - `npx vitest run test/orchestrator.spec.ts` — PASS, 17 tests.
  - `npm run ci` — PASS, 6 files / 56 tests.
  - `git diff --exit-code -- lib/` — PASS after build.
- **Test results:** PASS.
- **Local runtime verified:** no; this is deterministic report validation
  logic, not a DSH lifecycle change.
- **Blockers:** none.
- **Next action:** cloud review `9c2cc29`; issue #17 remains open until review.

## 2026-10-25 — Issue #15 watcher credential-env allowlist

- **From:** local agent
- **To:** cloud reviewer / next local agent
- **Base commit:** `0476fa7` (`docs: record issue 14 redaction fix`)
- **Work commit:** `61d63b4` (`fix: restrict watcher credential env keys`)
- **Changes:**
  - Replaced the watcher's permissive env-file denylist with an explicit
    allowlist for provider credentials/configuration (`BIFROST_*`, `*_API_KEY`,
    `*_TOKEN`, `*_BASE_URL`, `*_API_VERSION`, and selected cloud settings).
  - Runtime/code-loading names such as `NODE_OPTIONS`, `NODE_PATH`,
    `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONPATH`, `PYTHONHOME`,
    `PERL5OPT`, `RUBYOPT`, `BASH_ENV`, and `ENV` are denied even if a future
    pattern becomes broader.
  - Updated `--help` and `docs/ISSUE-WATCHER.md` to state that the file is
    parsed as `KEY=VALUE`, never sourced.
- **Tests run:**
  - `bash -n scripts/watch-issues.sh` — PASS.
  - `npx vitest run test/issue-watch.spec.ts` — PASS, 2 tests.
  - `npm run ci` — PASS, 6 files / 55 tests.
- **Test results:** PASS.
- **Local runtime verified:** yes after restart at `08:54:06Z` (PID `568469`);
  the previous live wake (`WATCH_WAKE_OK`, status 0) was on the prior script.
- **Blockers:** none.
- **Next action:** cloud review `e26e297`; PR #16 needs separate README review.

## 2026-10-25 — Issue #14 credential redaction fix

- **From:** local agent
- **To:** cloud reviewer / next local agent
- **Base commit:** `99454d1a830ca42ed051d232de4104161357b581`
- **Work commit:** `24b6619` (`fix: redact non-HTTP URL userinfo and scoped tokens`); docs follow-up commit after it
- **Changes:**
  - Extended `src/redact.ts` URL userinfo matching from `http(s)` to any
    `scheme://` URI (covers `postgres`, `postgresql`, `mongodb+srv`, `redis`,
    etc., including empty-username `redis://:password@host`).
  - Added `glpat-` (GitLab) and `npm_` token patterns.
  - Mirrored the same patterns in the `redactPromptText` copy inside
    `src/script.ts`.
  - Added `redactSecrets`, `redactDeep`, and verifier/retry prompt regression
    tests with fake values.
- **Tests run:**
  - `npm run typecheck` — PASS.
  - `npm run lint` — PASS, 0 warnings/0 errors.
  - `npx vitest run test/redact.spec.ts test/orchestrator.spec.ts` — PASS,
    26 tests.
  - `npm run ci` — PASS, 6 files / 55 tests.
- **Test results:** PASS.
- **Local runtime verified:** no for this change; it is redaction logic covered
  by deterministic unit and prompt-rendering tests, not a DSH lifecycle change.
- **Blockers:** none.
- **Next action:** cloud review of `24b6619`; do not use real credentials in
  future regression vectors.

## 2026-10-25 — Implementation and local runtime verification

- **From:** local lead agent
- **To:** next local/cloud agent
- **Base commit:** none (empty repo; first push `beb55c6`)
- **Work commit:** remote `main` at final handoff (use `git rev-parse origin/main`)
- **Changes:**
  - Added the full external DSH bundle (`src/`, `lib/`, `cordis.patch.yml`,
    package manifest, README, docs).
  - Added deterministic and real-Loader tests.
  - Updated `STATE.md`, `VALIDATION.md`, `ACCEPTANCE.md`, `RESEARCH.md`.
- **Tests run:**
  - `npm run ci` — typecheck, lint, 51 tests pass.
  - `npm run test:loader` — 2 real Loader tests pass.
  - `npm pack --dry-run` — package contents verified.
  - Real DSH install from local checkout and from GitHub; `--dump-config`
    shows the bundle row in both profiles.
  - Real headless model smoke and real `grok_workflow` runs (see
    `VALIDATION.md`).
- **Test results:** PASS; GitHub Actions run `40176627051` passed Node 22/24, including watcher security tests, build-artifact consistency, and pack checks (51 tests).
- **Local runtime verified:** yes for plugin load, model route, completed
  caller-plan workflow, completed parallel timing workflow, completed
  planner-only workflow, fresh GitHub-installed workflow, a partial
  strict-failure workflow, and a live deadline cancellation.
- **Blockers:** none.
- **Next action:** independent re-review of the current head; optionally add a
  clean-profile install check to CI. Do not modify the active
  `/home/fish/dsh-layerfs` home; the verified install is isolated under the
  workspace `.dsh-home`.


## 2026-10-25 — Cloud homepage redesign

- **From:** cloud
- **To:** local
- **Task:** Beginner-friendly bilingual repository homepage.
- **Base commit:** `99454d1a830ca42ed051d232de4104161357b581`.
- **Branch:** `docs/beginner-friendly-bilingual-homepage`.
- **Changes:** Replaced root `README.md` with a shorter English quick-start homepage; added `README.zh-CN.md`; added separate English and Chinese SVG workflow illustrations; updated `package.json` files allowlist to include the Chinese README; installation command and DSH/Node requirements are derived from current project files.
- **Tests:** GitHub Actions run `40178081351` PASS on Node 22/24: `npm ci`, typecheck, lint, build, `git diff --exit-code -- lib/`, `npm test`, and `npm pack --dry-run`. No real DSH runtime is claimed for this documentation-only change.
- **PR:** https://github.com/free6589/dsh-grok-workflow/pull/16 (merged as `ea3e8e31`).
- **Next action:** PR merged. Local follow-up restored the compact configuration, disable/uninstall, testing, security, and compatibility sections in both READMEs, and corrected the install order: create a missing headless profile before `plugin add`. Keep the English and Chinese pages synchronized.

## 2026-11-03 — P0-5（首条消息不可见）已修复，等待复核与发布决定

- **做了什么**：定位并修复"`in-turn` 在 `agent/pre-step` 里 await 整个工作流 → 运行期间
  transcript 里没有 `user/message`"（`src/gate.ts`），新增回归测试，`lib/` 重建，真机前后截图入库。
  细节与命令见 [VALIDATION.md](VALIDATION.md) Round 17；源码事实见 [RESEARCH.md](RESEARCH.md) A13。
- **契约变化，接手前务必读**：`in-turn` 的 `enter.messages` 现在**只带报告**，被 claim 的用户消息
  由网关在等待前写入 surface（`commitClaimed` + `withoutClaimed`）。任何新的 pre-step 监听器
  都不要既 `session.append('user/message', …)` 又把它放进 `enter.messages`（会渲染两份）。
- **下一步（按优先级）**：
  1. 复核本次改动（单文件 `src/gate.ts` + 两个测试文件 + 文档）。
  2. 决定是否在 :3090 实例上做一次热重载验证 —— 注意会中断该实例上正在跑的运行（D-013），
     队长拍板后再做；本轮的 AFTER 证据来自隔离实例（同版本 `0.2.1-rc.2`）。
  3. `relay` / `append` 在长驻 GUI 的投递仍是 `NOT_RUN`（NR-1 剩余半边）。
- **未提交/未同步**：无。本轮未向 `[COORDINATION]` Issue 发状态块（`NOT_RUN`）。

## 2026-11-03 — route-concurrency 每路由并发上限收尾（待提交/PR）

- **做了什么**：`ModelRoute.maxInFlight?` + `HARD_LIMITS.routeInFlight={min:1,max:64}`；
  `resolveChain` 整数范围校验；script `normalizeChain` 保留/clamp 上限，
  `routeInFlight` 计数 + waiter 队列，`callRole` 选有空位的首条路由、全满等待，
  `traceRoute` 带 `skippedBusy`/`queuedMs`；report 校验透传 + `Route overflows …`
  单独渲染；records 台账透传溢出证据；`describeResolvedConfig` 显示 `(cap N)`；
  设置页每行第三框 + 中英 `capLabel/capPlaceholder/capHint` + `error.badCap`；
  导出 `GROK_WORKFLOW_ROUTE_INFLIGHT_MIN/MAX`；ARCHITECTURE 溢出-vs-回退小节 +
  CHANGELOG Unreleased + D-030 + 新手指南并发上限注记。
- **测试**：新增 `test/route-concurrency.spec.ts` 7 例（校验拒绝/溢出分流/排队峰值/
  clamp 钉死/预算不变/渲染与台账透传）；`test/client.spec.ts` bounds parity +
  `error.badCap` 双语 + 上限校验回归钉；`test/config.spec.ts` script clamp 钉。
- **下一步**：`npm run build` 重建 `lib/` → `git diff --exit-code -- lib/` 为 0 →
  `npm run ci` 全绿 → commit/push `origin feat/route-concurrency` → 开 PR
  `base:main`（标题见 STATE）→ 向 lead 回报 FROM/TO/TASK/BASE_COMMIT/WORK_COMMIT/
  CHANGES/TESTS_RUN/TEST_RESULTS/PR/BLOCKERS/NEXT_ACTION。

## 2026-11-06 — 跨轮上下文延续（v0.5，工作树内，未提交）

- **做了什么**：`src/carryover.ts`（新）+ `src/script.ts`（四角色提示词注入 + 脚本侧上限）+
  `src/run.ts` / `src/gate.ts`（只改 `runTeam` 注入，提问判定零改动）/ `src/index.ts`（工具路径注入）；
  测试 `test/carryover.spec.ts`（21 例）+ `test/gate.spec.ts`（+2 例）；
  `CHANGELOG.md [Unreleased]` 中英条目；`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE}.md`；
  证据 `docs/knowledge/evidence/carryover-e2e/`。
- **验证事实**：`npm test` 33 文件 / 568 测试 PASS；`npm run lint` 0 error（3 个既有 warning）；
  `lib/` 由 `npm test` 的 build 重建；真机两轮 PASS（Round 21），digest 在真子代理提示词里可见。
- **给下一个 agent 的三条硬约束**：
  1. 不要为了「跨轮」改 `src/records.ts` 或归档存储——那是独立任务；本轮只用读路径。
  2. `carryoverBounds` 复用 `historyTurns`/`historyChars`；若要新增配置键，必须同时改设置页
     投影断言（`test/settings-projection.spec.ts` 的封闭键清单）。
  3. 真机多轮验证不能靠「同一条命令里连发两条消息」（会被丢）；本轮的可行姿势是
     `--session-id` 续跑，且**首条消息必须先走一次 gate-off**（F1 未修）。
- **下一步**：提交 + 开 PR（`base:main`）；决定 F1 是否另立任务；`:3090` 升级仍需用户批准（D-013）。

## 2026-11-06 — 增量记忆归档：轮次结算即写入、单次会话可读回（v0.5，工作树内，未提交）

- **做了什么**：`src/memory/archive.ts` / `src/memory/recorder.ts` / `src/memory/cli.ts`（新）+
  `src/run.ts` 两处接线（引擎事件订阅、`finally` 轮次结算，另加 `runSingleCall` 成功路径的前台档
  归档）；测试 `test/memory-archive.spec.ts`（21 例）+ `vitest.config.ts`（测试期把
  `GROK_WORKFLOW_MEMORY_DIR` 指向 `tmpdir()`，避免单测写进操作者的 `$DSH_HOME`）；
  `CHANGELOG.md [Unreleased]` 中英条目；`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE}.md`；
  证据 `docs/knowledge/evidence/incremental-archive/`。
- **验证事实**：`npm test` 34 文件 / 589 测试 PASS；`npx tsc -p tsconfig.json --noEmit` 干净；
  `npm run lint` 0 error（3 个既有 warning）；`lib/memory/*` 由 `npm run build` 重建；
  真机：团队档一轮结算即写入 4 条（3 agent + 1 round），另起一个会话用
  `node lib/memory/cli.js recent` 直接读到该轮结果（Round 22）。
- **给下一个 agent 的四条硬约束**：
  1. **不要**把归档做成配置开关或挂到 `showProgress`：记忆不是展示偏好（D-036）。
  2. **不要**改成「会话收尾再写」或「dispose 钩子写」——那正是用户点名的失败模式。
  3. 读子代理产出必须走 `ctx.get('sessions')` 且在 **`agent-start`** 捕获会话对象，结论在
     `tool-call.arguments`（JSON 字符串）里而不是 assistant 文本（RESEARCH A15，三条都实测过）。
  4. 真机验证前先确认闸门开着（`grokDefault: "on"`），否则跑一整轮也不会有任何归档。
- **下一步**：提交 + 开 PR（`base:main`）；`:3090` 升级仍需用户批准（D-013）；
  两进程并发追加压测、换引擎的子代理形状复测仍是 `NOT_RUN`。

## 2026-11-08 — fix_completed_links 完成：已完成子任务保持可点击（真机 PASS，待复核/发布决定）

- **From:** 执行子代理（fix_completed_links）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD）
- **结论（`CONFIRMED`）**：已完成（及失败/取消/中断）子任务行在聊天任务列表恢复可点击并
  可打开子会话视图；真机验证见 `VALIDATION.md` Round 30，决策 `DECISIONS.md` D-040，
  机制 `RESEARCH.md` A17。改动全在插件客户端（`src/client/index.js` = `lib/client.js`），
  DSH core 零改动。
- **本轮改动**：`src/client/index.js` + `lib/client.js`（`mountPanel`，`priority: -1` 遮蔽）、
  `test/panel-links.spec.ts`（新，14 例）、`test/client.spec.ts`（+2 断言）、
  `package.json`（`test:unit` 收入新 spec）、`.gitignore`（`.v070-home/`）、
  `CHANGELOG.md` `[Unreleased]` 中英条目、`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE,HANDOFF}.md`、
  `docs/knowledge/evidence/panel-links-2026-11-08/`。
- **测试（`CONFIRMED`）**：`npm run ci` exit 0，**36 文件 / 638 测试 PASS**（typecheck 0 错，
  lint 4 warning / 0 error 基线）；`lib/` 重建幂等（md5 `3ae940ff…`，src/lib 逐字节一致）。
- **真机（`CONFIRMED`）**：隔离 `DSH_HOME=.v070-home/`，profile `panelcheck`（web 模板），
  插件 dev 安装 + `workflow-ptc` 启用 + v4-pro/agnes 模型 patch，实例 `127.0.0.1:3179`，
  headless Chromium；团队档跑到 `completed`，6/6 行可点击（含 `规划助手 已完成` 与
  `执行 failed`），点击规划助手打开 `任务团队 child 1` 子会话视图。运行中行同为按钮（对齐库存行为）。
- **诚实边界**：首轮真机 run（写文件任务）因 `/home` ro 挂载按预期 FAILED——恰好覆盖
  failed 行渲染与可点击（6/6 按钮）；`relay`/`append` 形态未单独验证（HYPOTHESIS 外推）；
  深色主题/移动端 NOT_RUN；live `:3090` 未动（D-013）。
- **并发注意**：工作树含 fix_child_names 任务的记忆条目（D-039/Round 27–29），随本轮 commit
  一并入库；`src/` 其余文件未触碰。
- **Next action**：①lead 复核 D-040/Round 30 后决定合入/发布节奏（未 bump 版本、未 tag）；
  ②`:3090` 升级仍待用户批准（D-013）——修复要在线上生效需升级 + 重载。

- **部署边界（本轮实测，`CONFIRMED`）**：本会话的 DSH 文件策略是 `workspace-write`，
  `cp -a lib/. /home/fish/dsh-layerfs/profiles/web/node_modules/dsh-grok-workflow/lib/`
  被沙箱拒绝（`Read-only file system`，含备份目录创建）。因此 live 安装副本**本轮未由我改动**；
  安装包已打到 `out/dsh-grok-workflow-0.6.0.tgz`（66 文件 / 309K，`npm pack --cache /tmp/...`，
  默认 `~/.npm` 只读）。用户执行安装 + 重启即可收口。Round 35 记录的「已装入 live 副本」
  只覆盖当时的 `lib/gate.js`，不含本轮 B 方案。

## 2026-11-13 — v0.8.0 发布后交接（给用户 / 后续代理）

- **已发布（`CONFIRMED`）**：PR #45 → `9c590f2`；Tag `v0.8.0` → 同 sha；Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.8.0 。`package.json` = `0.8.0`。
- **这次包含**：人话交付层、layered synthesis、checkpoint/resume（无用户可见面）。**不含**：
  Command Watchdog、Host Evidence Collector（记 `NOT_DONE`，没做就是没做）。
- **装到哪里了**：`~/.dsh/profiles/web` 已是 0.8.0；隔离 `v080verify` 也是 0.8.0（均从 Tag 装，未重启
  任何服务）。**没装到哪里**：`dsh-layerfs` 的 live `:3090` 还是旧版——`layerfs/.../node_modules/`
  下无此包。它要生效需两步（都由用户拍板，D-013）：①把 Tag 装入 layerfs 的 web profile；
  ②重启 `:3090`。只做其中一步不会变新人话。
- **Next action（用户）**：确认 layerfs 升级＋重启时机；`session-4c562307` 那类 PARTIAL 输出届时首行即
  人话结论（做成 N/M、没做成点名＋下一步），台账默认收起，`uncertainties` 保留。

## 2026-11-15 — wave1+wave2 收尾交接（未提交；版本与提交交 V 组）

- **From:** 收尾组 M · **To:** V 组 / lead / 后续代理 · **Base:** `HEAD = ee5e013`，`main...origin/main` 干净，
  工作树 **81 文件 / +7014 / −534** 全部未提交。
- **这条分支现在是什么**：v0.8.0 加上 wave1+wave2 —— 前台分诊（triage 四档）与 B01-B18 修复、
  人话交付层加固、checkpoint 契约对齐、以及**新增的进度 Tab**（`src/progress-tab.ts` +
  `src/client/index.js` 第三个 Tab）。`package.json` 工作树已是 `0.9.0`（V 组 bump）。
- **测过什么（`CONFIRMED`）**：`npm run ci` → `tsc` 0 错、`oxlint` 0 error / 4 warning、
  client bundle 186091 B、**48 文件 / 897 测试 PASS**，exit 0，40 s（`evidence/verify-H1/ci.txt`）。
  `npm pack --dry-run` 82 条，`lib/client.js` 与 `cordis.patch.yml` 在内，`docs/knowledge/**` 不外发。
- **真机测过什么（`CONFIRMED`）**：
  ①安装/加载/前台 —— 隔离 home + `gwverify`/`gwverify-hl` 双 profile，安装 PASS（3 bundles）、
  加载 PASS（含「关掉 `workflow-ptc` 就 pending」的对照）、`settings/describe` 23 命名空间含本插件、
  client bundle 逐字节投递、工具表含 `grok_workflow`；前台 chat 档真跑 PASS。
  ②进度 Tab —— 隔离 `dsh web` `:3210` + 真模型 + headless Chromium，**14 张截图**，
  `pending/doing/done/cancelled` 四态真机 `CONFIRMED`。
- **没测到什么（`BLOCKED` / `NOT_RUN`，别当已过）**：
  - 真模型**团队档端到端 = `BLOCKED`**：`models.fyrali.com` → `100.111.111.99`（bifrost）；
    tailnet 显示 active 但 `rx 0`、ping 100% 丢包、80/443/3000/3065/8000/8080/8888/9000/11434/4000 全关；
    DSH 原文 `Connect Timeout Error (attempted address: models.fyrali.com:443, timeout: 10000ms)`。
    备选 `127.0.0.1:3065/v1` 要网关 key（取 key = 读用户凭据，禁止）。团队档本轮用 mock 模型跑出
    `FAILED / format-error`，那是 mock 的性质，不是产品结论。
  - 进度 Tab 的 `blocked` / `failed` 两态**真机 `NOT_RUN`**（没构造失败子调用，不伪造），
    由 `test/progress-tab.spec.ts` + `test/client.spec.ts` 的 **93 个测试**覆盖。
  - live `:3080` / `:3086` / `:3090` 未部署、未重启（D-013，用户保留动作）。
- **复现命令（exact，可直接抄）**：

  ```bash
  cd /home/fish/projects_mine/dsh-grok-workflow
  npm run ci                       # 期望：48 files / 897 tests passed
  # 安装+加载（H1）
  npm run build
  export DSH_HOME=$PWD/.verify-gw/home
  dsh --profile gwverify --from-default-profile web --dump-config
  dsh plugin --profile gwverify add "$PWD"
  dsh --profile gwverify-hl --patch mock.patch.yml 「你好」    # 前台 chat 档，无模型也能过
  # 进度 Tab（H2，需要本机模型网关）
  npm pack --cache .dsh-home/npm-cache --pack-destination .dsh-home/h2-pack
  dsh gwprog --from-default-profile web
  dsh plugin --profile gwprog add file:$PWD/.dsh-home/h2-pack/dsh-grok-workflow-0.8.0.tgz
  dsh gwprog --patch docs/knowledge/evidence/progress-tab-2026-11-15/gwprog.patch.yml \
      --port 3210 --host 127.0.0.1 --no-open
  cd docs/knowledge/evidence/progress-tab-2026-11-15 && node stage-a.mjs   # 然后 b/c/d/e
  ```

- **给 V 组的三条硬约束**：①节头已由你提升为 `## [0.9.0] - 2026-11-15`，M 组的 11 条条目原文躺在
  下面（1 Added + 10 Fixed，中英双语），提交时**别改文字**；②`engines.dsh` 是 `>=0.2.1-rc.2 <0.3.0`，
  与 `engines-dsh-B01.txt` 一致，别改窄也别放宽；③发布前 `npm run ci` 必须仍是 897 测试全绿——
  本轮没有为文档改动动过 `src`/`test`。
- **给用户的一句话**：本机 `:3080`/`:3090` 仍是旧版，进度 Tab 只有装新包并重启才看得见；
  `/grok` 开关在真机验证时请用**打包产物**装，别用 `link:`（会报
  `Receiver must be an instance of class Session.`，归因见 RESEARCH A20）。
- **Next action**：V 组 bump 已完成 → 填/确认 `[0.9.0]` 节头 → 提交（不 push 未授权前） → lead 决定合入与发布节奏。

## 2026-11-15 — v0.9.2 准备中：发版 HOLD、记忆已写、两条 gate 失败确认为基线既有

- **From:** 收尾组 agent-26 · **To:** lead / agent-27 / 后续代理 · **Base:** `main` = `4b92278`
  （v0.9.1 发布记录；`HEAD` = `origin/main`）。本轮**零源码改动**，只读 + 跑命令 + 写记忆。
- **现在工作树里有什么（`CONFIRMED`，`git status --porcelain`，本轮核数时）**：19 个修改文件——
  `src/` 4（`config.ts`、`index.ts`、`progress-tab.ts`、`client/index.js`）、`test/` 3
  （`client.spec.ts`、`config-limits-repair.spec.ts`、`progress-tab.spec.ts`）、`lib/` 12 个构建产物；
  未跟踪 `test/progress-connector.spec.ts`、`docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`、
  `.tmp/`。内容 = **B01/B02/B04** + 进度 Tab **脊椎整词绑定 / 详情协调块 / 连线填充+状态字形**。
  细节与行号锚点在 `STATE.md`「2026-11-15 — v0.9.2 准备中」与 `DECISIONS.md` D-047/D-048。
- **发版动作全部 HOLD（用户 2026-11-15 指令，经 lead 下达）**：`CHANGELOG.md` 未改、
  `package.json`/`package-lock.json` 仍 `0.9.1`、未 commit、未 push、未打 tag、未动 Issue #1。
  成因：用户看到 Round2 `05` 截图里的报告太机器（`stat`/`od`/`sha256`/路径/marker 直接贴给读者）。
- **写面划分（别撞车）**：人话报告改动归 **agent-27**——`src/answer.ts`、`src/report.ts`、
  `src/delivery/*`、`src/gate.ts` 调用点及其测试。收尾组不碰这四处；其余记忆文件由收尾组写。
- **测过什么（`CONFIRMED`，`TMPDIR=$PWD/.tmp`）**：`npm run ci` → typecheck 0 错；
  `oxlint` 4 warning / 0 error（4 条既有）；`npm run build` 幂等（67 个 `lib` 产物 sha256 全等，
  client bundle **204585 B**，`cmp lib/client.js src/client/index.js` 一致）；vitest
  **50 文件 / 934 测试 → 932 PASS / 2 FAIL**。
- **两条失败 = 基线既有（`CONFIRMED`，独立 worktree 对照）**：`git worktree add .dsh-home/baseline-wt
  4b92278` → `npx vitest run test/gate.spec.ts` = **2 failed | 53 passed**，与本轮同形
  （`refuses a message explicitly when the queue is full…` 稳定失败；
  `writes the answer into the session when the append strategy is selected` 基线失败、
  工作树单跑偶过）。**所以现在不能说「全绿」**：谁要在发布前说 PASS，必须先处置这两条。
- **真机证据路径（别人的成果，我只核对了目录与结论行）**：
  `docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`（隔离 `:3221`、`DSH_HOME=.dsh-home/r2`、
  profile `gwprog2`、装 `0.9.1` 打包产物、headless Chromium、13 PNG + 5 stage 日志 +
  `MANIFEST.sha256`；真机 `pending/doing/done/failed` 四态）；安装/加载/前台仍是
  `docs/knowledge/evidence/verify-H1/`。
- **复现命令（exact）**：

  ```bash
  cd /home/fish/projects_mine/dsh-grok-workflow
  export TMPDIR=$PWD/.tmp
  npm run build                                  # client bundle 204585 B；构建幂等
  npm run ci                                     # 50 files / 934 tests：932 pass / 2 fail
  git worktree add .dsh-home/baseline-wt 4b92278 # 基线对照（gitignored）
  ( cd .dsh-home/baseline-wt && TMPDIR=/home/fish/projects_mine/dsh-grok-workflow/.tmp \
      npx vitest run test/gate.spec.ts )
  npx vitest run test/progress-connector.spec.ts # 连线填充 + 状态字形 7 例
  ```

- **发版放行条件（checklist，逐条都要有证据）**：①`npm run ci` **全绿**——当前 2 条 `gate.spec`
  基线失败未处置前不放行，也不许写成 PASS；②`lib/` 幂等（build 后产物 sha256 全等 +
  `cmp lib/client.js src/client/index.js`）；③`CHANGELOG.md` 把 `[Unreleased]` 提成
  `## [0.9.2] - 2026-11-15`（Release workflow 要求该节存在、非空、且与 tag/`package.json` 同版本），
  `package.json` + `package-lock.json` 一起 bump；④真机证据：**human-only 默认形态**的截图
  （机器证据收起、Progress 详情/诊断开关里可查）——这条是用户点名的问题，没有截图不放行；
  ⑤tag 从 `main` 打，`git ls-remote --tags origin` 复核旧 tag（v0.9.1 `584dc22…` → `9103280`）未动；
  ⑥Issue #1 状态评论走 `AGENTS.md` 的 FROM/TO/TASK/BASE/WORK/CHANGES/TESTS/RESULTS/LOCAL/BLOCKERS/NEXT。
- **Next action**：①agent-27 把人话报告改完（默认只发 human 块 + 下一步，机器证据进 Progress 详情 /
  诊断开关），并说明两条 `gate.spec` 失败是否连带处理；②lead 验货后才允许 bump 0.9.2 +
  写 `[0.9.2]` 节头 + commit/push/tag + Issue 状态评论（模板见 `AGENTS.md`）；③live
  `:3080`/`:3086`/`:3090` 仍是用户动作（D-013）。
- **给用户的一句话**：这一版还没发——工作树里的东西能装能跑（真机截图在 Round2 目录），
  但报告文案要先改成「人话在前、机器证据收起来」，改完再一起发版。

## 2026-11-15 — v0.9.2 收尾发版：本地齐了（`5eb4942`），**push / tag / Issue 评论等人话真机截图**

- **From:** 收尾发版组 agent-30 · **To:** lead / 截图组 / 后续代理 · **Base:** `main` = `4b92278`
  （= `origin/main`，v0.9.1 发布记录）。**本地提交 `5eb4942`**（release-prep）+ 随后的 docs 提交
  （本段所在的记忆记录）。**远端未变**：`origin/main` 仍是 `4b92278`，没有 `v0.9.2` tag，没有
  GitHub Release，Issue #1 无新评论。
- **本轮做完了什么（`CONFIRMED`）**：
  1. `test/gate.spec.ts` 两条基线既有时序失败按 D-051 的最小改法修同步（**只改等待条件**，
     产品代码零改动）：单跑 **55/55**、全量 **51 文件 / 948 测试全 PASS**。
  2. `npm run ci`：typecheck 0 错、oxlint 5 warning / 0 error（4 既有 + 1 新）、build client bundle
     204585 B、build 幂等（`lib/` 67 产物哈希全等）+ `cmp lib/client.js src/client/index.js` 一致。
  3. `CHANGELOG.md`：`[Unreleased]` 提为 `## [0.9.2] - 2026-11-15`（94 行；Added 人话优先、
     Fixed 存量钳制 + B02/B04 + B01 + 进度 Tab 三条、Tests 两条同步修复）；**不写 layerfs 条目**（D-049）。
  4. `package.json` + `package-lock.json` 一起 bump 到 `0.9.2`（`npm version 0.9.2 --no-git-tag-version`）。
  5. Round2 真机证据（13 PNG + 5 stage 日志 + `MANIFEST.sha256` + `r2.patch.yml` + `run-state.json`）
     与新增 spec（`test/delivery.spec.ts`、`test/progress-connector.spec.ts`）一起入库；
     入库前对证据目录扫过密钥形状（`sk-…` / `Bearer …` 命中 0），`r2.patch.yml` 只写
     `apiKeyEnv: BIFROST_VIRTUAL_KEY` 名字、不含值。
- **现在卡在哪（`NOT_RUN`，唯一堵点）**：**human-only 默认形态的真机复拍**。仓库里最新真机证据止于
  11-15 12:09（`evidence/progress-tab-2026-11-15/Round2/`），全部早于 agent-27 的人话默认化改动；
  `Round2/05-chat-with-run-report.png` 就是用户点名「太机器」的那张。**需补的 6 项**见
  `VALIDATION.md` Round 40 §6（三 Tab 共存 / 默认消息只有人话块+下一步、无命令无路径无 sha 无 marker /
  `showDiagnostics` 关开对照 / ≤480 px + 深色 / 三 Tab 回归含点开子会话 / 会话事件旁证）。
- **复现命令（exact）**：

  ```bash
  cd /home/fish/projects_mine/dsh-grok-workflow
  export TMPDIR=$PWD/.tmp
  npm run ci                                        # 51 files / 948 tests PASS
  npx vitest run test/gate.spec.ts                  # 55 passed（修同步前是 2 failed）
  npm run build && git status --porcelain -- lib/   # 幂等、无未跟踪产物
  git log --oneline -2                              # 5eb4942 release: prepare v0.9.2 …
  ```

- **放行后要做的三步（照做，别改顺序、别 force-push）**：
  1. 截图组把 §6 的证据落盘（新建 `docs/knowledge/evidence/human-default-2026-11-15/`，与 Round2
     同构：PNG + stage 日志 + `MANIFEST.sha256`），并把结论补进 VALIDATION 的新 Round（状态词照
     `CONFIRMED` / `NOT_RUN` 用，别把单测结论写成真机结论）；
  2. `git push origin main` → 等 CI（Node 22 + 24）绿；再核对本地 `HEAD` 就是要发的那一个提交；
  3. `git tag -a v0.9.2 -m "v0.9.2: plain-language answer by default, one clamp table, progress tab spine/detail/connector"`
     → `git push origin v0.9.2` → 等 Release workflow 绿（它会校验 tag ↔ `package.json` ↔
     `CHANGELOG` 的 `[0.9.2]` 节、`lib/` 已提交且与构建一致、`npm test` 全绿）→ 复核
     `git ls-remote --tags origin` 里**旧 tag 未动**（`v0.9.1` → `9103280` 及更早），
     然后按 `AGENTS.md` 的 FROM/TO/TASK/BASE/WORK/CHANGES/TESTS/RESULTS/LOCAL/BLOCKERS/NEXT
     模板给 Issue #1 发状态评论。
- **写面提醒**：人话报告的源码（`src/answer.ts`、`src/delivery/index.ts`、`src/gate.ts` 调用点）本轮
  已冻结在 `5eb4942` 里；要再改就得走新的提交，别在工作树里改完直接打 tag（Release workflow 会因
  `lib/` 不同步而拦下，`git diff --exit-code -- lib/` 那一步会红）。
- **别碰**：已发布 tag（`v0.9.1` 及更早）、DSH core、live `:3080` / `:3086` / `:3090`（D-013）、
  npm 发布与仓库可见性。

## 2026-11-15 — v0.9.2 已发布（`5eb4942` / tag `v0.9.2`）；下一版从这里起

- **From:** 发版执行组 agent-38 · **To:** lead / 下一个代理。**远端已变**：`origin/main` = `98f26a8`，
  `tag v0.9.2` → `5eb4942`，GitHub Release published `2026-11-15T09:22:08Z`
  （`dsh-grok-workflow-0.9.2.tgz` 464,763 B）。CI `43698707930`（Node 22+24）与
  Release `43698836519` 均 success；旧 tag 全部未动（`v0.9.1` → `584dc22` / peel `9103280`）。
- **`5eb4942` 与 `98f26a8` 的关系**：`5eb4942` 是 release-prep 提交（tag 打在它上面），
  `a591817`、`4ab0cb3`、`98f26a8` 是它之后的三个人 docs 提交（记忆记录 / `.gitignore` / 人话证据）。
  所以 **Release 的源码树不含证据目录**，证据在 `main` 历史里 —— 这是刻意的，理由：tag 与
  `package.json`、`CHANGELOG [0.9.2]` 必须同版本，而证据是事后落盘的。
- **证据**：`docs/knowledge/evidence/human-default-2026-11-15/`（原名 `human-report-2026-11-15`，
  落盘改名，`LANDING.md` 逐项写明改了什么、没改什么）+ `MANIFEST.sha256`（85 文件 + 两个 `lib` 哈希，
  `sha256sum -c` 全 OK）。覆盖面与**三项缺口**见 VALIDATION Round 41 §2：人话块首轮 `CONFIRMED`、
  第 2/5 轮被反证；`showDiagnostics` 开态台账只在转写侧可拍；完成行点开子会话未在本实例重拍。
- **`.tmp` 已清空并 gitignore**：`TMPDIR=$PWD/.tmp` 仍是本仓库约定的测试临时目录，用法不变；
  清空时删掉的内容（13 MB / 97 项）与凭据布尔检查结果见 STATE 本轮段。下次要复现真机证据，
  照 `human-default-2026-11-15/README-r2.md` 的命令重建打包产物与隔离家即可。
- **复现命令（exact）**：

  ```bash
  cd /home/fish/projects_mine/dsh-grok-workflow
  export TMPDIR=$PWD/.tmp && mkdir -p .tmp
  gh run list --commit "$(git rev-parse HEAD)"        # CI 对当前提交
  git ls-remote --tags origin                          # 旧 tag 未动 + v0.9.2 peel 到 5eb4942
  ( cd docs/knowledge/evidence/human-default-2026-11-15 && \
    grep -vE '  lib/(client|progress-tab)\.js$' MANIFEST.sha256 | sha256sum -c - )
  ```

- **下一步（不做也不算欠账，但别假装做过）**：①用户把 live 实例升到 `v0.9.2` 并重启（D-013，用户动作）；
  ②若要关闭 §2 的三项缺口，需要新一次真机复拍 + 可能改交付层的 relay 文案（那是设计决定，先问用户）；
  ③D路/记忆侧若已写过「v0.9.2 = HOLD」的段落，以本轮 STATE / VALIDATION Round 41 为最新事实。
- **别碰**：已发布 tag（`v0.9.2` 及更早一律不动）、DSH core、live `:3080`/`:3086`/`:3090`、
  npm 发布与仓库可见性。

## 2026-11-15 — A/B/C 落地待收口（未提交/未push/未发版，`CONFIRMED` 本地绿）

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `main` = `129a92e`（v0.9.2 已发布，
  本轮在其上工作，未动 tag）。
- **做了什么**：答案置顶（delivery 首句答案、计数沉尾、4 类 scrub、关键证据块删除）、
  synthesizer HARD RULES + 宿主风格 guardrail、主会话先说话边聊边干（`receipt-then-relay` +
  首答现场写 + 模板兜底明说 + 整轮取消窄化重起）。`answerStrategy` 默认值、`full` 管线、
  全部上限与开关默认未动。CHANGELOG `[Unreleased]` + ARCHITECTURE 策略段已写。
- **验证**：`npm run ci` 全绿（typecheck 0 错 / lint 4w0e / 51 文件 948 测试 PASS），
  详见 VALIDATION Round 42；实现期抓到并修好 `$1` 注入与 `核验通过` 自杀两个 bug。
- **没做什么（`NOT_RUN`）**：commit / push / tag / Release（等用户指令）；真机 Web 长驻验证；
  headless e2e 回归。**不要**以「测试全绿」为由直接发版。
- **Next action（用户一步）**：先看行为是否对味（问一个天气类问题：首屏应是 `答案：…` 而不是
  `做完了 N 项…`；team 档应先回一句现场写的人话再后台跑）。对味了说一声，我再走提交→push→
  CI→发版流程；不对味直接说哪句别扭，我改。

## 2026-11-16 — 进度 Tab A+C 待收口（未提交/未push/未发版，`CONFIRMED` 本地绿 + 隔离真机绿）

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `main` = `129a92e`（v0.9.2 已发布）。
- **做了什么**：A/B/C（答案置顶 + 边聊边干，未提交）+ 进度 Tab A+C（七段脊 + 单展开分支 + 窄屏竖排，只改 `src/client/index.js` 渲染 + CSS，`test/client` + `test/progress-connector` 同步，CHANGELOG `[Unreleased]` +1 条）。`npm run ci` 全绿（51/951），隔离 `acgtest:3225` 真机全过。
- **验证证据**：`.dsh-home/acg/shots/`（`03/04/05/10/11/12/13/21/22/23` + DOM 日志）——注意该目录在 `.gitignore` 外？（`TMPDIR=$PWD/.tmp` 约定；`acg/` 是否入库由发版组定，默认不入库）。
- **没做什么（`NOT_RUN`）**：commit / push / tag / Release（等用户指令）；live `:3080` 更新（禁重启，见 D-053——新代码无已验证免重启路径，要么用户重启 DSH，要么接受文件换了进程仍跑旧模块）。
- **Next action（用户，两步）**：① 看一眼截图（`13-settled-wide`  settled 脊 / `11-spine-narrow` 窄屏竖排），对味了说「提交发版」；② live 更新方式二选一：等下次 DSH 重启自动生效，或用户亲手重启。

## 2026-11-16 — v0.9.3 已发布 + live 文件已换（待用户重启生效）

- **From:** lead · **To:** 用户 / 后续代理。**远端已变**：`origin/main` = `593f89e`，
  `tag v0.9.3` → `593f89e`，GitHub Release published（asset `dsh-grok-workflow-0.9.3.tgz`
  483122 B）。CI `43738470054`（Node 22 + 24）与 Release 均 success；旧 tag 全部未动。
- **内容**：CHANGELOG `## [0.9.3]` 两条 Added（答案置顶 + 边聊边干 / 进度脊手风琴），
  package 0.9.3。A/B/C + 进度 Tab A+C 全量（含测试 951、隔离真机复验 Round 43）。
- **live**：本机 `web` profile 包已换成 0.9.3（md5 与仓库一致），**但 `:3080` 进程没重启**，
  新 UI 在用户下次重启 DSH 后才生效 —— 这是唯一剩下的用户动作。
- **别碰**：已发布 tag（v0.9.3 及更早一律不动）、DSH core、live 进程的 kill/重启（用户亲手做）、
  npm 发布与仓库可见性。

## 2026-11-16 — 补交步 A 已实现未发布（`npm run ci` 绿，真机 NOT_RUN）

- **From:** lead · **To:** 用户 / 后续代理。**远端未变**：`origin/main` = `01f86de`，
  本轮 5 文件未提交（`src/script|report|types` + `test/failure-paths` + CHANGELOG `[Unreleased]`）。
- **做了什么**：失败 session `3c296b9a`/seq=5 落盘确证「数据全对、只缺交卷」后，
  按用户拍板 A 实现同 attempt 补交（D-054）：格式缺失补一次、不花重试额度，
  再缺才进正常重试；核验严格性零动。单测 3 例全绿。
- **没做什么（`NOT_RUN`）**：隔离真机复验（建议发版前 acgtest 跑一次三城天气）；
  B（失败行分类显示）；commit/push/tag/Release（等用户指令）。
- **Next action（用户）**：说「提交发版」就走 commit→push→CI→tag→Release→live 换文件
 （live 仍需用户重启 DSH 生效，沿 D-013/D-053）。

## 2026-11-17 — T4 测试迁移交接（agent-5 → lead）

- **状态**：T4 测试迁移完成。`npx tsc` 干净，`npx vitest run` 51/951 全绿（串行）。
- ** contract 提醒**：全量套件对并行负载敏感（deadline/fake-timer 用例在 CPU 争用下 flake）；
  复验请串行跑 `npx vitest run`，不要与其它 vitest 并行。
- **工作区状态**：70+ 文件未提交（含 T1/T2/T6 + T4 + sibling 的 in-turn 测试改写 + 本轮 STATE.md）。
  `lib/` 产物是旧的，发版前需重编。`settings-simple-mock.html`（??）是杂散文件，与 T4 无关。
- **Next action（lead）**：决定提交/发版节奏；T5（client 页面）仍可并行，不碰 src 契约。

## 2026-11-17 — 设置页瘦身 + supervisor 未提交（待用户验收，`CONFIRMED` 本地绿）

- **From:** lead · **To:** 用户 / 后续代理
- **状态**：工作树未提交（基线 `ae0c6d3` v0.9.4），`npm run typecheck` 0 错、
  `npx vitest run` **51 文件 / 951 测试全 PASS**、`npm run build` 成功、
  `cmp src/client/index.js lib/client.js` 一致。CHANGELOG `[Unreleased]` 有
  Added（supervisor）+ Changed（瘦身迁移）双语条目。
- **内容**：①设置页 3 卡（总开关 auto/full、执行模型 5 角色 × fallback + 监督、
  高级两数 1–100/def10），无 hint/Danger/只读区；②24 键删 + 固定值（见 D-055）；
  ③supervisor 第五角色（见 D-056）；④上限 100/默认 10（AGENTS.md 已同步）。
- **Next action（用户）**：看 `settings-simple-mock.html`（定稿 mock，可点）→
  若认可，回复「提交」，lead 即 commit（不 push/tag，发版另听指令）。
- **Next action（后续代理）**：先读本轮 STATE/DECISIONS D-055/D-056；
  真机验证 `NOT_RUN`（acgtest 新 profile + 新端口，老规矩）；live `:3090` 未动。

## 2026-11-17 — v0.10.0 发布（真机 acgtest95 / :3231 → push / tag / Release）

- **From:** agent-25（verify_push_release，lead 委派）· **Base:** `3d9275a`（T1–T6）·
  **发布准备提交：** 见本轮 `release: prepare v0.10.0 …`。
- **做了什么**：
  1. 真机验收（新 profile + 新端口，老规矩）：`DSH_HOME=.dsh-home/acgv095`、profile `acgtest95`、
     `:3231`、宿主 `dsh 0.2.2-rc.3`、本地网关 `127.0.0.1:18088`（键只在环境，不落盘）；
     `npm pack`（472,958 B）→ `dsh plugin add file:…` → 已装 `lib/client.js` md5 与仓库一致；
     `--dump-config` = 8 键 + `workflow-ptc disabled:false`；浏览器：client bundle 被请求、
     Plugins 页出现 Grok workflow、设置页 8 键 + 五角色链、两次真实工作流（7 段脊 / 首答 7s /
     后台 1/1 verified，台账 `archive.jsonl`）。完整命令与结果见 VALIDATION Round 47。
  2. `npm run ci` 全绿（typecheck 0 错、lint 4w/0e、51 文件 / 951 测试、build 幂等、
     `lib/` 无未提交差异）。
  3. 发版准备：`0.9.4 → 0.10.0`（`package.json` + `package-lock.json` 联动）、
     `CHANGELOG` 插入 `## [0.10.0] - 2026-11-17`、README 英/中配置参考按 8 键重写、
     `docs/LOCAL-TESTING.md` 配置段同步；`settings-simple-mock.html` 仍未跟踪、不入库。
  4. push（fast-forward，未 force）→ `v0.10.0` tag → Release 工作流（tag ↔ package.json ↔
     CHANGELOG ↔ `lib/` 四项校验后建 Release）。
- **版本选择的理由（D-057）**：24 个配置键被删除且旧补丁会被拒载 = 对 0.x 用户是破坏性变更，
  按 semver 走 minor（`0.10.0`），不用 patch。
- **没做（`NOT_RUN`）**：live `web` 运行实例（`:3080`）换装/重启 —— 用户保留动作（D-013）；
  Progress 页 Execute/Verify 段成员不渲染的定位（现象与台账矛盾，见 STATE/VALIDATION，
  下一个接手者优先查这个）。
- **接手提示**：本机隔离实例默认仍在 `127.0.0.1:3231` 上跑（`DSH_HOME=.dsh-home/acgv095`）；
  收尾已 kill 并删 `url.txt` 里的 token 文本；`.dsh-home/`、`.tmp/` 均 gitignore，不入库。

### 发布结果（同日，`CONFIRMED`）

`origin/main` = `b2c4515`（push `ae0c6d3..b2c4515`，fast-forward）；CI `43946211999` 双绿；
tag `v0.10.0` → `b2c4515`（object `63c04aa`），新 tag，旧 tag 快照对照未动；
Release `43946446721` 绿，published 2026-11-16T20:08:07Z，asset `dsh-grok-workflow-0.10.0.tgz`
472,274 B（包内 `package.json` = 0.10.0，`lib/client.js` md5 `d1e2df8c…` 与仓库一致）；
Issue #1 状态评论 issuecomment-6927842856。

## 2026-11-19 — RSI round 17 phase-1：Q5/F1 修完待发版（`0.11.16` 走 R6）

- **From:** lead · **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：round 17 四个验证片跑完（`.rsi/evidence/round-017/`）后，对两个
  FAIL 修了产品代码：`isLoopHeartbeat` 接受 DSH 包装形状（`src/loop.ts` + 回归 3 条）、
  设置面说法统一 11/13（`src/config.ts` / `settings.ts` / `client/index.js` 注释 +
  `describeSurface` 新文案 + 两处测试显式断言）、README 计数 62/1142、
  `CHANGELOG [Unreleased]` 补两条 Fixed（双语）。`npm run ci` exit 0 =
  **62 文件 / 1142 测试 PASS**。记忆：D-073、A28、VALIDATION Round 62、STATE 已更新。
- **没动**：`.rsi/ROUND.md` / `ledger.jsonl`（等 R6 写 round 17）、版本号（仍 `0.11.15`）、
  tag、Release。`src/index.ts:292` 注释未动（仍 HYPOTHESIS）。
- **Next action（phase-2，发版）**：跑 `npm run ci` 确认仍绿 → 走 R6（`finish-round.py --round 17
  --version 0.11.16`）→ `commit + tag v0.11.16 + push` → 看 Release workflow 建 Release →
  装 `…#v0.11.16` 验证。发版需用户授权——本轮任务文本已含“做完之后提交 tag”。
- **风险提示**：`.rsi/evidence/round-017/heartbeat-live/instance/` 下曾有三份凭证文件
  （`.token` / `.cookies.json` / `.dsh-home/.credentials.yaml`，审计只做存在性检查）。
  该片称收尾时已删；发版前用 `git status` + secret 扫描确认它们不在提交里
  （`finish-round.py` 自带 secret 扫描，红即拒）。

## 2026-11-19 — RSI round 17 发版落地：`v0.11.16` 已发布 + tag 安装验证 PASS

- **From:** lead · **To:** 用户 / 下一轮接手者
- **落地（`CONFIRMED`）**：R6 `finish-round.py --round 17 --version 0.11.16` 一次过——
  commit `63a4fbb`、`push origin main`、annotated tag `v0.11.16` 已推。
  远端 CI run `44440179151` = **success**；GitHub Release 已建（Latest，
  asset `dsh-grok-workflow-0.11.16.tgz`，`## [0.11.16]` 双语节全文展示）。
  `v0.11.14` 仍无 Release、原地未动；无 force-push；无 npm 发布。
- **tag 安装验证（`CONFIRMED`，本轮补做）**：`dsh plugin --profile tagcheck add
  github:free6589/dsh-grok-workflow#v0.11.16` exit 0（仅 peer 警告 F3）；
  bundle 行出现；实例干净启动（0 pending）；`settings/describe` 有 `grok-workflow`
 （`autoGenerate: true`，投影 **11 键**，与文档“11/13”说法一致）；
  假会话 id 的 `open` 被 Schedule admission 拒绝（`loop/schedule-refused`，
  行不落地——熔断语义本身）；真会话 id 的端到端已在 round-017 heartbeat-live
  片用本树构建验证过（`session-48df3c0a-…` open→投递→turn→close→删行）。
  残留已清（`.tmp/tagcheck-*` 全删）。真模型整轮 / GUI 点击 / rrule 定时到点仍 `NOT_RUN`。
- **Next action**：P3-01（设置页逐路由上限与死线字段文案）或 P3-02（进度页详情行）；
  `src/index.ts:292` 注释仍 HYPOTHESIS，改它要连 `lib/` 重建，留给下次动 `src/` 的人。

## 2026-11-19 — RSI round 19：载入校验的第五个角色（`CONFIRMED` 实现 + 验证，发版待 R6）

- **From:** agent-2（执行代理）· **To:** 用户 / 下一轮接手者
- **为什么做这个而不是 P3**：待办池里 P0/P1/P2 已清，P3-01/P3-02 是文案与面板详情行；
  但 `roles.supervisor` 不在载入校验里属于「说法与实测冲突 + 错误配置延迟到该任务干完才爆」，
  按 P0（错误行为 / 假陈述）优先于 P3。pool 里这条本来就是 `R5 PENDING`。
- **落地（`CONFIRMED`）**：`src/settings.ts` `ROLE_ORDER` 五角色；`test/config.spec.ts`
  五角色用例；`test/route-concurrency.spec.ts` 空 cap 提示覆盖 supervisor；README 中英、
  `docs/ARCHITECTURE.md`、`DECISIONS.md` D-075、`VALIDATION.md` Round 64、本文件与本轮
  STATE/CHANGELOG。`lib/` 只变 `settings.js`（+ `.map`）三个文件。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0，63 文件 / 1155 测试（基线 1154）；
  红→绿证据 `.rsi/evidence/round-019/`（`red-spec-run.txt` / `green-spec-run.txt` /
  两个探针 / `lib-build-idempotence.txt`）。
- **没动**：P3-01/P3-02 仍 OPEN；`src/index.ts:292` 注释仍是 HYPOTHESIS；没有碰任何 profile、
  Schedule 行、`cordis.patch.yml`、`.github/`。
- **Next action**：R6 发 patch `0.11.18`（`finish-round.py --round 19 --version 0.11.18`），
  然后把 P3-01/P3-02 之一作为下一轮主题。

## 2026-11-19 — RSI round 19 发版落地：`v0.11.18` 已发布（`CONFIRMED`）

- **From:** agent-2（执行代理）· **To:** 用户 / 下一轮接手者
- **落地（`CONFIRMED`）**：R6 `finish-round.py --round 19 --version 0.11.18` 一次过——
  commit `3b131c4`，`push origin main`（快进 `6ee2e68..3b131c4`），annotated tag `v0.11.18`
  （object `40be048`，peel `3b131c4`）已推。远端 CI run `44465623532` = success；Release run
  `44465627146` = success，Release 已建（非 draft/prerelease，asset
  `dsh-grok-workflow-0.11.18.tgz`，560685 B）。提交后 `npm run verify:lib` = `lib/ at 3b131c4
  is the build of src/ at 3b131c4 (149 files, byte-identical)`。老标签未动，无 force-push，
  无 npm 发布。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = 63 文件 / 1155 测试 PASS（基线 1154）；oxlint
  22 warnings / 0 errors；`npm run build` 两次产物 `diff -r` 为空。
- **评审**：R5 第 1 轮 FAIL（4 条文档准确性，全在“说法与实测”上：错误断言、会把 supervisor
  门悄悄关掉的迁移建议、README 里不可能成立的模型条件、把 per-task 说成整轮末尾），修完后
  第 2 轮 PASS。教训写进 `VALIDATION.md` Round 64：**迁移建议要对着运行时路径核一遍，不能
  只对着载入期注释写**。
- **Next action**：`src/delivery/index.ts:695` 与 `src/run.ts:141` 仍只列四个角色（同一类缺陷，
  review 顺带确认），各开一轮；P3-01/P3-02 仍未动；`src/index.ts:292` 注释仍 HYPOTHESIS。

## 2026-11-20 — `/compact` 修复：全新 profile 端到端验收已补（`CONFIRMED`）

- **From:** agent-6（执行代理）· **To:** 用户 / 下一轮接手者
- **做了什么（`CONFIRMED`）**：补上修复提交 `5fb5da0` 缺的那一项验收——在**全新** DSH profile
  里跑真实 `/compact`。`compactfix-verify`（`sdk` 模板，一次性 `DSH_HOME`）+
  `dsh plugin add` 本检出；`.rsi/evidence/compact-e2e/drive.mjs` 用本地桩模型驱动一条团队档
  消息（真实闸门 + 真实 workflow 引擎 + 真实 token meter），随后 `/compact` 两次都成功：
  `Compacted 7 history items (~6140 tokens).`，0 条越界 assistant 行。
- **门禁（`CONFIRMED`）**：`npm run ci` 在 `366d169` 干净 worktree exit 0 =
  **70 文件 / 1269 测试**（24 warnings / 0 errors，`lib/` byte-identical）；回归
  `test/compact-step-pairing.spec.ts` 6 passed；`scripts/repro-compact.mjs` exit 0。
- **证据**：`.rsi/evidence/compact-e2e/`（`README.md`、`drive.mjs`、`fake-model.mjs`、
  `run-team.json`、`run-team-2.json`、`run-before.json`、`run-orphan-compact.json`、
  `repro-after.txt`、`prefix-orphan-journal.txt`）。
- **没动**：`src/`、`test/`、`lib/`、版本号、tag、Release、profile（一次性 home 已删）；
  并发写入者的未提交改动（`src/checkpoint/schema.ts`、`src/delivery/index.ts`、
  `test/delivery-human-block.spec.ts`、`CHANGELOG.md`）未提交。
- **BLOCKED（具体条件）**：SDK `session/resume` 读不了 headless 格式会话
  （`SessionFormatError: system/message requires a protected first surface head`），所以没能在
  profile 层把「已坏会话 → `/compact`」重放一遍；该 before/after 仍由
  `scripts/repro-compact.mjs` 承担。
- **Next action**：若要修**已坏**的历史会话，需要一条一次性迁移（重放时跳过/移出越界行），
  这是新工作，不在本次修复范围内；另：`grokDefault` 默认 `off` 时闸门不接管消息，文档/README
  若要讲「装好即生效」，应写明这一点。


## 2026-11-21 — profile 克隆轮：交接（`CONFIRMED`）

- **From:** agent-49（执行代理）· **To:** 用户 / 下一轮接手者
- **落地（`CONFIRMED`）**：`scripts/clone-profile.mjs`、`test/profile-clone.spec.ts`
  （6 例）、证据 `.rsi/evidence/profile-clone/`（README + 脱敏日志 + `home-patch.sandbox.yml`）。
  复现并修复：profile 搬家后相对 `link:` 依赖断裂（`dsh plugin list` 硬失败）、
  `cordis.patch.yml:378` 的 `sk-` 渠道密钥被复制。克隆实测：`dsh plugin list` exit 0、
  `--dump-config` 0 条 skip、web UI 200、插件 client bundle 200/237809。
- **并发（`CONFIRMED`）**：本轮期间同树有并发发布轮写入 0.12.16（commit `f24fc87`
  + tag `v0.12.16`）。本轮只暂存自己的文件（脚本/测试/证据/记忆/CHANGELOG 的
  `[Unreleased]` 段），未触碰 `package.json`、`package-lock.json`、README 的版本声明。
- **未 push（`CONFIRMED`）**：commit 与 `v0.12.18` tag 都在本地。推 tag 会触发 Release
  工作流并创建 GitHub Release —— 未获授权，因此没有推。`package.json` 仍是 0.12.16，
  所以 `v0.12.18` 是 milestone tag 而非发布版本；要发布 0.12.18 时先
  `git tag -d v0.12.18`，再按发版流程 bump + 重新打 tag。
- **Next action**：若要把克隆用于 CI，把 `home-patch.sandbox.yml` 那类机器级 MCP 关闭
  做成可复用步骤；另：`cordis.patch.yml` 里 3 条 patch 告警（`layerfs-host`、
  `agent-teams` 未找到，`deepseek-account` 名称不匹配）是源配置漂移，与克隆无关，值得单开一轮清理。

## 2026-11-22 — 已发版 `0.13.14`：会话重启损坏修复（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **发了什么**：发版提交 `dea1be4` 已推，annotated tag `v0.13.14` 已推；远端 CI
  `45036269190` success、Release `45036278236` success 并已发布
 （asset `dsh-grok-workflow-0.13.14.tgz`）。本地 `npm run ci` exit 0：81 文件 / 1564 测试 PASS。
- **根因**：`commitClaimed()` 在 `agent/pre-step`（loop 写 head 之前）预发布 `user/message`，
  新会话首条 surface 变成用户话，后续 system 头即炸；重启全量回放才抛，所以活会话当时不报错、
  重启全砖。99 父会话扫描：OK 53 / CORRUPT 33 / NOSYS 13，CORRUPT 全 `first=(user,message)`。
- **修法**：`surfaceHasHead()` 门（已建立 surface 或 turn 2+ 才预发布，否则走 `enter.messages`
  由 loop 在 head 后提交）；取消同规则。回归：`commitHead` + `assertReopenable` +
  `surface head` 3 例；`gate.spec.ts` 5 例同步。`lib/` 已重建并随 src 提交。
- **没做的**：用户侧已砖的 33 个父会话插件修不了，需 host 侧修复或丢弃；真机 GUI 手势验证 NOT_RUN。
- **Next action**：分支 `fix/session-surface-head-6` 已合流，可按 AGENTS.md 在 24h 内删除。

## 2026-11-22 — 会话损坏根因已定位并修复（未发版，`CONFIRMED`，fix/session-surface-head-6）

- **用户报障**：凡开过 dsh-grok-workflow 插件的会话，dsh 重启后打不开：
  `stored session … is corrupt: system/message requires a protected first surface head`。
- **根因（`CONFIRMED`，三路子代理取证 + 隔离复现）**：DSH `dsh-session-format-v3-to-v4`
  `foldSurface` 要求存储 log 的首个 surface 事件必须是宿主的 `system/message` 头。
  本插件 `src/gate.ts` 的 `commitClaimed()` 在 `agent/pre-step`（loop 写 `step/start` +
  系统投影**之前**）就 `append('user/message', …, {surfaceOp:'append'})`，新会话首条
  surface 变成 user 话，后续 system 头一到即炸；重启全量回放才抛，所以活会话当时不报错、
  重启全砖。99 个父会话扫描：OK 53 / CORRUPT 33 / NOSYS 13，CORRUPT 全部
  `first=(user,message)` 且后有 `system/message`。取消路径同理（cancel-then-continue
  照样砖，已实测）。
- **修法**：`surfaceHasHead()` 门——已有 surface 节点或 turn 2+ 才预发布，否则 batch 走
  `enter.messages` 由 loop 在 head 之后提交；取消走同一规则。回归：`commitHead` 复刻
  loop 顺序 + `assertReopenable` 回放 validator 规则 + `surface head` 3 例；
  `gate.spec.ts` 5 例期望同步。`npm run ci` exit 0 = **81 文件 / 1564 测试 PASS**，
  `verify:lib` byte-identical。
- **没做的**：未发版、未 push（分支 `fix/session-surface-head-6`，commits ddf5e5e 起 7 个）；
  用户侧已砖的 33 个父会话插件修不了，需 host 侧修复或丢弃；真机 GUI 验证 NOT_RUN。
- **下一步**：合流 main → 按五步流发版；发版说明写清「升级后新会话不再写坏，既有砖会话需手动处理」。

## 2026-11-22 — 已发版 `0.13.9`：Guardian 非破坏式恢复 + observe 折叠修复（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **同步结论**：本地 `main` = 远端 `origin/main`（`418a4a9`，fetch 已对表）。远端 v0.13.9 曾打 tag 但 Release 校验失败（docs 版本断言 6 项停留在 0.13.8），操作员删 tag 留恢复记录（`docs/RELEASING.md` Recovery record）。本次重打、无 Release 历史污染。
- **找 bug**：PR #47（guardian-ui-and-timeout-budget）改漏一处——`src/progress-tab.ts` 纯折叠函数仍是旧映射（非 rescue 一律 cancel-run），host 记为 `observe` 的 finding 会被画成「已触发整轮取消」。已修（与 bundle 同规则三态）+ 回归测试（progress-tab 1 例 + connector 1 例）。红验证：只藏 src 时新用例 1 failed / 34 skipped。
- **发了什么**：发版提交 `c93b2bf` 已推，annotated tag `v0.13.9` 已推（本地旧 tag 先删后建，远端当时无此 tag）；远端 CI `45001378298` success、Release `45001393005` success 并已发布（asset `dsh-grok-workflow-0.13.9.tgz`）。本地 `npm run ci` exit 0：78 files / 1484 tests PASS。
- **没做的**：`web` profile 热加载安装——本会话沙箱只读（`bwrap --ro-bind`，`plugin add` 报 EROFS），装机仍是 `v0.13.8`。需用户在宿主执行：`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.9`（dsh 不重启，原地更新，运行中实例下次 profile boot 生效）。

## 2026-11-22 — `v0.13.9` 装机成功 + 双子代理实测（`CONFIRMED`）

- **From:** 本会话（lead）· **To:** 下一轮接手者
- **安装失败根因（`CONFIRMED`）**：用户 `plugin add` 报 `ERR_PNPM_GIT_FETCHER_IO … Disk quota exceeded (os error 122)`。子代理 agent-2 只读诊断 + 我亲测：`/tmp` 的 `usrquota` 配额是真凶——`git init` 写几 KB 都 `EDQUOT`，而 `/home` 写 500MB 一次成功；`btrfs quota` 未启用，`/home` 余 13G。`allowBuilds` 提示是 dsh 无条件打印的通用话术（`plugin.ts:104`，spec 像 git 就打印），本插件无 prepare/postinstall、tag 树自带 `lib/`，**不用加**（加了反而放行脚本执行、扩大信任面）。
- **腾空间（用户已批 1234 全删）**：`/tmp/sup37/sup37b/sv-isolate/v32/p6verify/a2p-deploy/alpine ISO/lobster-verify-target/gateway-backup-3065/opencode` 约 4G；`/tmp` 81%→50%；`git fetch --depth 1 origin tag v0.13.9` 恢复 exit 0。
- **装机（`CONFIRMED`，dsh 未重启）**：`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.9` exit 0（10.5s）；装机 `0.13.9`（lock tarball `c93b2bf`），`lib/` 与仓库逐字节一致（含 observe 三态 `progress-tab.js:259`）。
- **双审**：agent-4 三侧一致干净（详见 D-101；低严重遗留：`run.ts` rescue executor `throw` 与注释不符，后轮动）；agent-3 隔离 profile 实测 PASS（Loader 工具+prompt、settings 投影、gate off/on、web boot 无 pending、observe fold 定向）。真机一句话端到端 NOT_RUN（无模型凭证）；`curl` 直调 settings describe NOT_RUN（实例走 WS mux+cookie，非真实通道）。
- **收尾**：scratch profile（gw-isolated-verify/gw-web-verify）+ `.tmp/dsh-gw-verify` + `/tmp` 探针目录已删；`git status` 仅剩既有 untracked（`.rsi/evidence/*`、`sg-weather.html` 等，并发轮产物，本轮未动）。本地无源码改动、无需发版 `v0.13.10`。

## 2026-11-23 — 手工清单 12 项顺序执行第 1 轮：合 2 项（`CONFIRMED`）+ 6 项记账跳过

- **From:** 本轮执行代理（agent-35）· **To:** 下一轮接手者 / 操作员
- **基线（`CONFIRMED`）**：`main` = `e4e03e9`（0.13.18），开工前整树 `npm run ci` exit 0：85 文件 / 1617 测试 PASS
  （日志 `.rsi/evidence/rsi-seq-12/logs/ci-baseline-main.log`）。全程在 `main` 的干净工作树
  `.agents/worktrees/fix-synth-resubmit` 里干活，**主检出（detached `a6103ad` + 既有未提交改动）一行没动**。
- **逐项结果（12 项，一项一分支，合前 ci 必须 exit 0）**：

| # | 项 | 结果 | 依据 |
|---|---|---|---|
| Sec.2-1 | 运行时限默认 60 分钟 → 0 | 前轮已合（`1591665`），本轮复验 | `src/config.ts:113` `DEFAULT_TIMEOUT_MS = 0`；`test/timeout-config.spec.ts:119` |
| Sec.2-2 | 主会话可插话：默认开或给开关 | 前轮已合（`1591665`），按「给开关」分支收口 | `src/client/index.js` `replan` 布尔键 + 设置页开关行；默认仍 false（分歧已记） |
| Sec.2-3 | 总开关一按报 405 | **本轮新合** `5dc0512` | 见下方「405 两个新成因」 |
| Sec.2-4 | 设置页一键升级按钮 | 前轮已合（`1591665`），覆盖度 **PARTIAL**（见 D8） | 版本/最新/命令卡片（只读 + 复制安装命令，不联网、不代跑）+ `test/update-entry.spec.ts` 4 例 |
| Sec.2-5 | 进度页「回答」格永远空 | 前轮已合（`1591665`，按「删格」分支收口） | `PROGRESS_STAGES` 六格无 answer；源码注释写明没有事件能填它 |
| Sec.2-6 | 断点续跑没接上 | 前轮已合（`1591665`） | `RESUME_DECISION_WIRING.wired = true`（`src/checkpoint/wiring.ts:221`），生产调用 `wiring.ts:485` |
| Sec.2-7 | 宿主证据收集阶段没开工 | **跳过（BLOCKED：待拍板）** | 源文件原话「先确认这一阶段还要不要做」；仓库确无 `src/evidence*`。见 D-111 |
| Sec.3-1 | 进度页跨阶段的线太多，合并成一根 | **本轮新合** `adc7fb4` | 一条公共弯道 + 一条公共轨，`test/progress-connector.spec.ts` 新增多组共享轨用例 |
| Sec.3-2 | 模型失败换人时加 429 勾选框 | 跳过（待拍板） | `triageModel` 整套已移除，需求是否成立源文件自己要求重新确认；见 D-111 |
| Sec.3-3 | 汇总也要「检查 + 复核」，不只汇总一次 | 跳过（待拍板） | 三轮汇总门已在（`src/script.ts` `reviewSummaryDraft`：check + 独立 verify，纯确定性）；**没走**配置里的 verifier/supervisor 模型角色。要不要改成走角色是成本/真值来源的取舍，见 D-111 |
| Sec.3-4 | 开插件后答案要和不开时长得一样 | 跳过（待拍板） | 源文件「是否还觉得不一样要你再验一次」——只有操作员能判；人工比对 `NOT_RUN` |
| Sec.3-5 | 查清那次绘画任务为什么失败 | 跳过（范围外） | 本插件无图像功能，失败不在本仓库；是否继续查由操作员定 |

- **405 的两个新成因（`CONFIRMED` 从源码读出，`HYPOTHESIS` 之于操作员那次具体触发）**：
  (a) 路由挂载用了 `inject(['webServer','connection','sessions'])`，三个服务缺一就不挂；0.13.16 只补了
  `webServer` 缺失的告警，**会话服务晚到或只经 `ctx.get('sessions')` 可达**的编排仍会什么都不挂，
  浏览器的 POST 落到宿主 fallback —— 正是「空包体 405、不带插件说明」的样子。现在改成
  `inject(['webServer','connection'])` + 按请求现取会话服务，取不到回 `503 mode/unavailable`（不再是 404）。
  (b) 读请求现在也吃 `GET ?action=status&sessionId=…`（用 GET 写一律 405），被拒的方法连方法名和 URL 一起
  `logger.warn`，客户端遇到读取 405 会改用 GET 重试一次并点名「方法被拒」。操作员那一次到底是代理拦 POST
  还是路由没挂，仍无现场日志可判（`HYPOTHESIS`），但两种情形现在都能自证。
- **没做的**：未发版、未打 tag、未 push（本地 `main` 领先 `origin/main` 2 个 merge 提交）；真机 GUI 点开关
  `NOT_RUN`（不动运行中实例，按 AGENTS.md §5）。
- **分支**：`rsi/sec2-03-mode-get`、`rsi/sec3-01-single-rail` 已合入 `main`，判定日期 2026-11-24 前删除。
- **下一步**：① 操作员对 Sec.2-7 + Sec.3-2/3/4/5 各给一句「做 / 不做」；② 决定是否发版把这两条改动推出去。

## 2026-11-23 · 手工清单 12 项（第 2 轮）逐项结果与分支台账

| # | 项（原话标题） | 结果 | 分支 / 提交 |
|---|---|---|---|
| Sec.2-1 | 运行时限默认还是 60 分钟，我要的是不限时 | MERGED（补钉子；默认 0 早在 `1591665`） | `rsi/sec2-01-timeout-default` → `a3f57c5` |
| Sec.2-2 | 主会话应该永远能插话，但现在默认关着 | MERGED（默认改成开） | `rsi/sec2-02-replan-default` → `28c0dd2` |
| Sec.2-3 | workflow 总开关一按就报 405 | MERGED（405 补 `Allow`；GET 读取在 `5dc0512`） | `rsi/sec2-03-mode-allow` → `994f71e` |
| Sec.2-4 | 设置页没有一键升级按钮 | MERGED（结论行 + 明说页面不能装；一键装仍需宿主能力，见分歧 D3） | `rsi/sec2-04-upgrade-verdict` → `1d5ef41` |
| Sec.2-5 | 进度页的「回答」格子永远是空的 | MERGED（设计文档改六段脊椎 + 守卫；删格在 `1591665`） | `rsi/sec2-05-answer-cell-doc` → `8531ac1` |
| Sec.2-6 | 断点续跑只做了一半 | MERGED（`resumeCarryover` 抽取+用例；接线在 `1591665`） | `rsi/sec2-06-resume-carryover` → `c7df2ce` |
| Sec.2-7 | 宿主证据收集那一阶段，根本没开工 | **SKIPPED / `BLOCKED`**（源文件要求先拍板；D-112 有第一刀设计） | `rsi/sec2-07-host-evidence` → `70f9307` |
| Sec.3-1 | 进度页跨阶段的线太多，合并成一根 | MERGED（连线文档；实现在 `adc7fb4`） | `rsi/sec3-01-rail-doc` → `96ad5f2` |
| Sec.3-2 | 模型失败换人时加 429 之类的勾选框 | MERGED（`switchOnRateLimit` 新键 + 设置页勾选框） | `rsi/sec3-02-switch-on-rate-limit` → `cd88e4b` |
| Sec.3-3 | 汇总环节也要「检查 + 复核」 | MERGED（判定进报告 `synthesis.review`） | `rsi/sec3-03-summary-review` → `504bcf3` |
| Sec.3-4 | 开插件后的答案要和不开插件时长得一样 | MERGED（证据 + 三步比对规程；观感判定 `NOT_RUN`） | `rsi/sec3-04-answer-parity` → `23820e2` |
| Sec.3-5 | 查清那次绘画任务为什么失败 | MERGED（范围结论：不在本仓库；继续查 `BLOCKED`） | `rsi/sec3-05-image-scope` → `a68a372` |

- **分支**：上面 12 条 `rsi/*` 分支**已全部合入 `main` 但保留在本地**供复核，判定删除日期 **2026-11-24**
  （合完未删是为让复核者能逐项看分支内容；超期即删）。
- **未 push**：本地 `main` 领先 `origin/main` 14 个提交（12 项 + 文档批次），远端看不到任何一项；
  未发版、未打 tag、未 npm publish。
- **下一步**：① 操作员对 Sec.2-7 给一句「做 / 不做」（D-112 已备好第一刀）；② Sec.3-4 按
  `docs/knowledge/evidence/answer-parity-2026-11-23.md` 第 2 节做一次并排比对；③ 决定是否发版把这批推出去。

<!-- Carried over from branch `team-dispatch-v1` by its rebase onto main: the text below is that branch's own record of the work. Where it says "未发版" / "NOT_RUN" it describes the tree it was written in, not main; the rebased branch ran the full gate — see the `team-dispatch-v1` rebase entry at the top of this file. -->

## 2026-11-23 — 任务板持久化加固（未发版，`CONFIRMED`）

- **From:** 本会话（board_persist lane）· **To:** 合流/发版者
- **做了什么**：`src/taskboard/` 的 CAS 从「内存副本比对 + 整份重写」改成「独占锁内重读账本 → 按磁盘版本比较交换 →
  落盘」，直接修掉两处丢更新：同一任务被两个句柄同时认领（旧实现两边都成功、文件只留一个归属）、不同行并发认领互相
  冲掉。新增 `src/taskboard/paths.ts` 三级位置解析（`GROK_WORKFLOW_TASKBOARD_DIR` → `$DSH_HOME` +
  `taskboards/grok-workflow`），落盘位置/行格式/认领协议/崩溃恢复规则写进 `docs/ARCHITECTURE.md` 任务板章节，
  决策落 D-127（分支上的编号是 D-109，`main` 已占用 109/110，rebase 时顺延）。
- **测试**：`test/taskboard.spec.ts` 23 例连跑 3 次 PASS；新增真实崩溃恢复（SIGKILL 子进程 `test/fixtures/taskboard/writer.mjs`、
  持锁进程被杀、活锁超时、撕裂账本、中断写 tmp、跨重启 id/CAS）与位置解析用例。`lib/taskboard/*` 已重建（含新 `paths.*`）。
- **必须知道**：本 worktree 当时被另一条 lane 并行占用（`src/dispatcher`/`src/handoff`/`src/report`/`src/delivery`
  编辑中途，`tsc --noEmit` 在这些文件红），所以 **全仓 `npm run ci` 与 `verify:lib` 未跑**；两条 lane 都落地后必须整仓
  重跑门禁再发版。锁是单文件系统内的咨询锁；多机共享板、网络盘 `O_EXCL` 语义不在支持范围。
- **未做**：dispatcher 与任务板的存储合流（`TaskReader` 接口仍是唯一对接点）；引擎不读板；L3 小组长。

## 2026-11-24 — 0.13.31 发布收口：任务板持久化加固已合入并发版

- **From:** 发版（merge-and-release）· **To:** 下一个接手的人
- **结果**：`team-dispatch-v1` 已以 `--no-ff` 合入 `main`（merge `dc69c6e`，无冲突），发版提交 `d0c1383`，注解标签 `v0.13.31`；
  `main` 与标签都已推送（`369d6e3..d0c1383 main -> main`、`* [new tag] v0.13.31`，无 force）。远端 CI `45363402329` success、
  Release `45363426210` success，GitHub Release **`Grok Workflow for DSH v0.13.31`** 带资产
  **`dsh-grok-workflow-0.13.31.tgz`（928474 B）**。
- **发了什么**（两个增量，用户能感觉到的部分）：
  1. **认领锁 + 磁盘 CAS**（`df89a95`）——同一个任务不会再被两个 worker 同时认领，不同行并发认领也不互相冲掉；
     持锁进程被杀留下的锁按 5 s 失效窗口清掉，崩溃不会把板卡死。
  2. **到达顺序 + 全路径寻址**（`4f25f15`）——待办队列跨重启按创建顺序交出（每行自带到达号，在锁内分配并随行落盘）；
     寻址从裸名改成全路径，记清谁建的、结果回给谁；阻塞原因在被改派时清掉。
- **跨进程证据**：`main` 已发布的 `lib/` 起 12 个进程各认领各一行、连跑 3 次 → 12/12 都报成功但盘上只活 **5 / 6 / 7 行**
  （丢 4–7 行）；合入后同样 3 次 → **12/12 进程成功且 12/12 行全活**。FIFO 探针：`main` 重开后 `list()` 是 id 序
  `a,b,task-10,task-9`、到达序丢失且无 `arrival()`；合入后 `list()` 契约不变、`arrival()` 回到 `task-10,task-9,b,a`。
- **发版时比清单多改的四类文件**：除了 `package.json`/`package-lock.json`/`CHANGELOG.md`，还必须同步版本声明
  `README.md`、`README.zh-CN.md`、`docs/LOCAL-TESTING.md` 与 `src/client/index.js`（并重建 `lib/client.js`）——仓库的
  docs/version 守卫生效（`test/docs-version.spec.ts` 5 例 + `test/docs-config-keys.spec.ts` 1 例 + `test/update-entry.spec.ts`
  1 例），不跟着 bump 就红；这与历次 `chore(release): prepare vX.Y.Z` 改的是同一批文件。
- **红线**：全程未碰 `~/.dsh`，未升级、未重载、未重启运行中的实例；AGENTS §11 自动升级按「不碰 live」**跳过**，
  live profile 仍是上一版。
- **待办**：① `team-dispatch-v1` 分支与它的 worktree 仍在本地（已合、可删；按 §5 应在 24 h 内删掉）；
  ② 升级 live profile 到 `v0.13.31`（需要操作员放行）；③ 两条边界仍成立：板锁只在单文件系统内是咨询锁、`seq` 只表达
  创建顺序不表达优先级（见 `VALIDATION.md` 与 `docs/ARCHITECTURE.md` 任务板章节）。

## 2026-11-24 — 设置页升级按钮：分支做完、门禁绿、真机装成功，等主代理合流（`CONFIRMED`）

- **From:** 记忆收口（本工作树的 memory-writer）· **To:** 主代理 / 下一个接手的人
- **分支与提交**：`feat/update-button`，自 `main` `c6a3611` 开出，一个功能提交 `c951dbf`「feat(update): a working upgrade
  button on the settings page」+ 本条记忆提交。worktree 在 `.agents/worktrees/feat-update-button`。**分支只在本地**：
  未 push、未合流、未打 tag、未发版。
- **做成了什么**：设置页的版本卡从「说出最新版本 + 给一条命令」变成「一个按钮真能装」。宿主路由
  `GET|POST /grok-workflow/update` 负责读状态与安装，装什么由宿主按本仓库的发布形状自己拼；页面四相（检查中 / 安装中 /
  已是最新 / 失败），挂载不发请求、一次点击一次 POST、页面永不 reload。决策与被否掉的替代方案见 `DECISIONS.md` D-129，
  逐条证据见 `VALIDATION.md` 同日条与 `.rsi/evidence/update-button-soak-2026-11-24/`。
- **门禁（`CONFIRMED`）**：`npm run ci` 在 `c951dbf` 上 **EXIT=0** —— oxlint 36 warnings / 0 errors、`verify:lib` 245 文件
  逐字节一致、vitest **101 文件 / 1910 测试 PASS**（`test/update-surface.spec.ts` 29 例、`test/update-entry.spec.ts` 20 例）。
  对 `v0.13.31` 的 100 文件 / 1866 测试基线是 +1 文件 / +44 测试。
- **真机 soak（`CONFIRMED`）**：隔离 fork 的 live `web` profile + 真 Chromium，一次点击把 profile 从 0.13.30 装到
  0.13.31，回执与读盘结果都逐字存档；页面全程没有文档请求（没有 reload）。
- **两条 lane 各自交回之后、由 dispatcher（调度）追加的两处微修**（派单要求记下来；树里能核的正是这两处，**先后时序在树里不可核**）。
  两处都是调度在收到该 lane 自己的报告之后才提的，所以**两条 lane 的报告里都没有它们**：
  1. **微修 A（宿主，`src/update-surface.ts` 的 `installCommand()`）：复制粘贴那一行补上 `--profile <profile>`**，形状与设置页
     那张卡打印的那一行一致。缺这个 flag 时，粘下去装进的是「碰巧是默认」的那个 profile，而不是操作员正在看的那个——正是
     这张卡存在要防的那个错。`<profile>` 保持字面占位：这条路由不知道、也不许猜浏览器那头是哪个 profile 名。可核位置：
     `installCommand()` 正上方的文档注释，以及 `test/update-surface.spec.ts` 里 GET status 那条命令断言中的
     `toContain('--profile <profile>')`（用例「reports the installed version, the newest release and the exact command」）。
  2. **微修 B（客户端，`UpdateCard`）：命令的显示、正文那句里的插值、复制到剪贴板，三处都取宿主的 `update.command`**
     （宿主答过时），没有答案才退回静态的 `UPDATE_COMMAND`——一个冻结的静态行会让读者复制到更旧的那个发布。没有宿主答案时
     （首绘、socket 断了、宿主没答或答了空串）静态基线逐字节照旧。可核位置：`src/client/index.js` 里
     `const command = known !== undefined && typeof known.command === 'string' && known.command !== '' ? known.command : UPDATE_COMMAND`
     一行，以及 `test/update-entry.spec.ts` 的两例「prints, interpolates and copies the command the Host named, not the stale
     bundled one」/「keeps the static command byte for byte when no Host answer ever lands」。
- **实现细节（不属于上面那两处微修，是卡片原本实现的一部分）**：卡片的「已装版本」按能知道的顺序取——安装读回 → 回滚恢复到的
  版本 → 宿主读到的当前版本 → 本构建自带版本；正文那句与结论都跟着它走。理由同样写在注释里：否则卡片会在「已装 0.13.31，
  最新 0.13.32」旁边说「你已是最新」，或者回滚之后仍然显示装歪的那个版本。
- **留给下一手的事**：
  1. **合流只在主代理做**（AGENTS §10）。合流时请注意 `CHANGELOG.md`：本条只加在 `## [Unreleased]`，没有版本号、没有
     发版标题、没有日期——发版那一步才 bump。
  2. **live profile 仍跑 `0.13.29`**（上一轮的只读探针读数），本轮**故意没动**：未升级、未重载、未重启，AGENTS §11 的
     自动升级按操作员红线「不碰 live」跳过。合流发版之后要不要升 live，等操作员放行。
  3. **没有请求发版**：`package.json` 与客户端版本常量仍是 `0.13.31`，`[Unreleased]` 里这条是给下一次发版用的。
  4. **分支判定日期 2026-11-26**：合流即删（按 §5，合完 24 h 内）；不合就删分支。`feat/*` 不许长期挂着。
- **边界（不要读成更强的结论）**：soak 的起点版本是按手摆的（manifest 改成 0.13.30）；开发构建自己的 `latest` 相在浏览器里
  看不见（装完页面上的卡是新构建的），那一段只由单元用例覆盖；`.tmp/soak-update/` 保留给调度清理，本轮没有删它、
  也没有往里加东西。

## 2026-11-25 — 0.13.34 发布收口：接单台子合入 `main`，两次门禁 exit 0，标签与两条远端 run 都绿（`CONFIRMED`）

- **From:** 发版（merge-and-release）· **To:** 下一个接手的人
- **结果**：`feat/block-intake`（`92097d9` 功能 + `88f1e12` 记忆，基线 `main` 尖端 `9b55d2d`）以 `--no-ff` 合入从 `9b55d2d`
  开出的 `release/0.13.34`，merge **`fe32b26`**，**零冲突**——分支正基于 main 的尖端，所以没有冲突要解，也没有任何决策号
  重编，`D-135` 原样不动。发版提交 `3c5d388`「chore(release): prepare v0.13.34」（8 文件 / +22 −20，形状同 `26628c2`），
  再合入 `main` 得 **`d01da81`**「… shipped as 0.13.34」；注解标签 `v0.13.34`（标签对象 → 剥皮 `d01da81`），`main` 与标签
  都已推送（`9b55d2d..d01da81  main -> main`、`* [new tag] v0.13.34 -> v0.13.34`，无 force）。远端 CI **`45451899750`
  success**（main，headSha `d01da81`）、Release **`45451905147` success**（tag `v0.13.34`，17:44:35Z → 17:47:33Z），
  GitHub Release **`Grok Workflow for DSH v0.13.34`** 带资产 **`dsh-grok-workflow-0.13.34.tgz`（1025707 B）**，sha256
  `7ece8829b4563176e65a37cc8a13e0b0f1baea11c63ecb3b6b1bedd76184d581`，非 draft、非 prerelease。
- **发了什么**（用户能感觉到的部分）：
  1. **接单台子（默认关，`blockIntake: false`）**——打开后一单任务可以按一份用户点头的切分最多拆三块；切分先预览，在用户
     发消息复述批准词之前一个字都不写盘；批准后的切分成为 `$DSH_HOME/taskboards/grok-workflow/` 下的追加式账本行，每次变化
     都是新追加的版本，从不就地改写。
  2. **六个工具**——`grok_open_block`、`grok_accept_block`、`grok_close_block`、`grok_block_status`、`grok_steer`、
     `grok_stop`。开关关着时，不注册任何工具、也不挂任何监听。
  3. **交卷要过独立监工**——六项确定性检查跑完，再向独立监工要逐条 `pass`/`veto` 判决，写进它自己的追加式账本；同样的证据
     回来时给的是账上已有的那个判决；心跳观察写第三个文件，既不当判决也不当块的版本。
  4. **配置面 19 → 20 键**——新增 `blockIntake`，装载期开关，**故意不投影**到设置页（页面字段仍是 17）。
  5. **回归钉**——`test/block-flag-baseline.spec.ts` 加夹具 `test/fixtures/block-flag-baseline.json`（99477 B），对基线
     `9b55d2d` 上生成的决策逐字节比对，所以「关掉就复现出功能之前那棵树」是查过的说法，不是推断。
- **门禁（`CONFIRMED`）**：门禁 #1 在 `fe32b26` 整棵树 `TMPDIR=$PWD/.tmp npm run ci` **EXIT=0**——vitest **`111 files /
  2128 tests PASS`**（196–202 s）、oxlint **`Found 36 warnings and 0 errors.`**（193 文件）、`verify:lib` →
  `lib/ at fe32b26 is the build of src/ at fe32b26 (293 files, byte-identical)`。门禁 #2 在 `3c5d388` 同样 **EXIT=0**，
  **独立跑两次**（发版 lane 与调度各一遍全量）。基线算术：`main` 在 `9b55d2d` 是 105 文件 / 1954 测试，本轮 +6 文件 /
  +174 测试（`block-ledger` 20、`block-preview` 93、`block-tools` 21、`block-supervisor` 20、`block-flag` 8、
  `block-flag-baseline` 12），`105+6=111`、`1954+174=2128` 逐项相等。另有针对性守卫单跑 6 文件 / 79 例 PASS
  （`docs-version` 8 + `docs-config-keys` 13 + `docs-architecture-version` 3 + `update-entry` 20 + `update-surface` 29 +
  `i18n-parity` 6）。`CHANGELOG.md` 里 `## [0.13.34] - 2026-11-25` 紧接 `## [Unreleased]`（第 8 行），`[Unreleased]` 仍在且
  为空，抽取段 43 行，中英条目原文未改。
- **发版时比清单多改的四类文件**：除了 `package.json`/`package-lock.json`/`CHANGELOG.md`，还要同步 `README.md`、
  `README.zh-CN.md`、`docs/LOCAL-TESTING.md` 与 `src/client/index.js`（并重建 `lib/client.js`）——与历次
  `chore(release): prepare vX.Y.Z` 改的是同一批 8 个文件、同一行数形状（这次 +22 / −20）。
- **红线**：全程未碰 `~/.dsh`——未升级、未重载、未重启；AGENTS §11 自动升级按操作员红线「不碰 core」**故意跳过**，且本轮只能
  写仓库内部。DSH 核心检出未动；没有 force-push，没有移动任何已发布的标签（`v0.13.34` 是新标签，`v0.13.33` 及更早的一个
  没碰）。live profile 现装哪一版**这一轮没有重新探**（`NOT_RUN`），最后一次只读探针（2026-11-24）读到 `0.13.29`。
- **清理**：worktree `.agents/worktrees/feat-block-intake` 已删（当时干净、无未提交改动）；`feat/block-intake`（原
  `88f1e12`）与 `release/0.13.34`（原 `3c5d388`）在合并检查通过后用 `git branch -d` 删掉。
- **待办**：① 接单台子还有四条缺口没关，别读成已关——独立**模型**监工真机上一次都没验过（隔离 soak 缺
  `AGENT2API_API_KEY`，那次 `veto` 是监工调用失败产出的）、soak 里一条 `pass` 是 `judged:false`、多块切分/会写文件的块/
  `judged:true` 的 `pass` 三块真机未触达（`NOT_RUN`，只有单测覆盖）、composer 总开关那条显示观察仍是 `HYPOTHESIS`；
  ② 升级 live profile 到 `v0.13.34`（需要操作员放行，本轮按红线跳过）；③ 两条**只记录、不修**的观察：
  `src/config.ts`（`:226`、`:671`、`:679`）与 `src/index.ts`（`:416`）写「the five tools / 五个工具」而实际注册六个
  （`BLOCK_TOOL_NAMES` 六项、注册日志打六项、README/CHANGELOG/真机工具清单都写六个，只错在文字）；
  `docs/knowledge/DECISIONS.md` 的 `## D-050`、`## D-051` 重复标题在本次合并**之前**就有（在 `9b55d2d` 上核过），非本轮
  引入。

## 2026-11-25 — 问题卡片的确认：门禁与接单台子共用一个来源判断（`fix/question-card-approval`）

- **From:** 修卡片批准的那一轮 · **To:** 下一个接手的人
- **Branch / commits:** `fix/question-card-approval`，worktree `.worktrees/fix-question-card-approval`，基线 `main` 尖端
  `4803f42`；功能提交 **`a926cd6`**「fix(block): count a question-card answer as the user's nod」（15 文件 /
  **+553 −30**：`src/user-source.ts`、`src/gate.ts`、`src/block/tools.ts`、两个 spec、10 个 `lib/` 产物），记忆提交紧随
  其后，只动 `docs/knowledge/` 与 `CHANGELOG.md`。未 push、未打 tag、未合 `main`。
- **做了什么**：宿主把「点问题卡片」记成 `source.kind === 'user-question-reply'` 的 `user/message`，而两个面都只认
  `'user'`，于是卡片批准在接单台子上每次都拒成 `approval-required`、在门禁上被记成 `non-user-source`。现在两边共用
  `src/user-source.ts` 的四个导出（`QUESTION_REPLY_SOURCE_KIND`、`isUserAuthoredSource`、`isQuestionReplySource`、
  `startsTurn`，全部有调用方）：接单台子这一侧，卡片答案只在「它 `callId` 指向的 `ask_user_question` `tool/call`
  事件记在预览之后」且「只取 `selected` / `custom` 标签、不取整包 JSON」两个限制下才算数；门禁这一侧只改叫法——
  只有卡片时返回 `{kind:'pass', reason:'question-reply'}`，准入路径、心跳分支顺序、`deliveryKey` / `request` 输入一个字
  没动（新用例用同一条用户消息做两次分类，钉住 `key` 与 `request` 相等），`classificationFailure` 仍要求真 `user` 消息。
  `startsTurn()` 只对 `user` 为真 = 那条产品决定：**卡片答案是点头，不自己开一轮**（**D-137**）。
- **红先绿后（`CONFIRMED`）**：两个新 spec 先红，命令 `TMPDIR=$PWD/.tmp npx vitest run test/block-tools.spec.ts
  test/gate.spec.ts` → `Test Files 2 failed (2)` / `Tests 2 failed | 75 passed (77)`，失败原文：
  `BlockToolError: approval-required: 预览之后没有一条消息逐字包含「确认」，不能开工`（接单台子，第一段「点卡片确认应当
  开工」就红）与 `expected { kind: 'pass', reason: 'question-reply' } / received 'non-user-source'`（门禁）。实现后同一条
  命令 → **`2 文件 / 77 测试 PASS`**（`block-tools` 21→22、`gate` 54→55）。红日志在 `.tmp/red-targeted.log`，绿日志在
  `.tmp/green-targeted-2.log`（都是 gitignored 的临时件，不随提交走）。
- **门禁读数（`CONFIRMED`，权威那次）**：`TMPDIR=$PWD/.tmp npm run ci` 在 `a926cd6` 整棵树 **EXIT=0**——vitest
  **`111 files / 2130 tests PASS`**（178.47 s；对基线 `4803f42` 的 2128 是 **+2 测试**、文件数不变）、oxlint
  **`Found 36 warnings and 0 errors.`**（194 文件）、`verify:lib` → **`lib/ at a926cd6 is the build of src/ at a926cd6
  (297 files, byte-identical)`**（293 → 297，四个新 `lib/user-source.*`）。日志 `.tmp/ci-3.log`。`npm run build` 的
  `client bundle: 325771 bytes → lib/client.js` 与上一版逐字节相同。
- **环境注记（不是产品改动）**：本 worktree 原来的 `node_modules/` 只有一份 vitest 缓存、没有 `typescript`，而
  `verify:lib` 把 `root/node_modules` 软链进它的 scratch 目录后要跑 `node_modules/typescript/bin/tsc`——第一次
  `npm run ci` 因此在 `verify:lib` 这一步 **EXIT=1**（`MODULE_NOT_FOUND`，日志 `.tmp/ci-1.log`），typecheck 与 lint 已过。
  修法是把那份缓存移到 `.tmp/worktree-node-modules-cache/`、把 `node_modules` 软链到主检出的 `node_modules`（两边本来
  就靠父目录解析共用同一份依赖），之后门禁 exit 0。下一个人在新 worktree 里跑门禁，先看 `ls node_modules/typescript`
  是否存在。
- **红线**：live `~/.dsh` 一行未写、未重载、未重启（本轮只写仓库内部与 `.tmp/`）；DSH 核心检出未动；未 push、未打 tag、
  未发版、未改 `package.json`（仍 `0.13.34`）；配置面仍 20 键、设置页仍 17 字段（本轮没有新增配置键）；没有削弱
  `isApproveAnswer()`、`startBlock` 的其它检查或门禁的准入路径。
- **真机 soak（`CONFIRMED`）**：隔离克隆（`.tmp/soak-card/dsh-home`，profile `web-clone`，端口 3203，线上 3080 未碰）装
  `a926cd6` 的构建，真模型 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`。修复后：seq 20 预览
  （`bp-afeb8fa2…`、`split_hash 27ed61c0…`）→ seq 25 `ask_user_question`（「确认」/「再看看」）→ seq 26
  `{"pending":true}` → `userQuestions/answer` 返回 `true` → seq 34 一条 `source.kind='user-question-reply'` 的
  `user/message` → seq 36 `start` → seq 37 **`block_id 3c688ff2-9053-4f47-a1fd-4b04fa32a045`、`status:"open"`**，
  `blocks.jsonl` 一行、`approval.quote = "确认"`。**对照**（同一份克隆/profile/脚本，只换插件为 `4803f42` 构建）：
  模型行为一模一样，seq 37 被拒成 `approval-required: 预览之后没有一条消息逐字包含「确认」`，账本没有新增行。证据
  `.rsi/evidence/card-approval-soak-2026-11-25/soak.txt`。**两条驱动面事实（证据文件 §4）**：F1 `userQuestions/answer`
  只对 `continued` 问题有效，还开着的卡片只能由接住 waterfall 的客户端回答、没有 HTTP 路由；F2 宿主 `tool-ask-user`
  默认 **legacy**（阻塞、无窗口），只有 `mode: timed` 才会产生 `pending` → `continued` → `user-question-reply`
  这条路径，**所以这条修复覆盖的是 timed 卡片，默认配置下卡片答案只是同回合的工具结果**。soak 档案因此把提问工具
  改成 `mode: timed, timeout: 20`（顶层 `- id: tool-ask-user` 覆盖不动预设行，生效的是 `- id: preset-standard`
  + `config.plugins` 整份覆盖）。
- **待办 / 没做的**：① 真浏览器点一张**还开着**的卡片 `NOT_RUN`（那条路径的答案不会变成回复消息，测不到本次修复；
  要覆盖它得再开一轮 Chromium）；② 跨预览边界答卡片（预览前开卡、预览后点确认）仍被拒，这是刻意取舍（见 D-137 的
  残余风险①），要改得先定「旧问题的答案算不算这一单的批准」；③ 账本里卡片批准的 `approval.quote` 是选中的标签而非
  一句打字的话（D-137 残余风险②），读账本要连 `kind` 一起看；④ 合并前确认 `docs/knowledge/DECISIONS.md` 的 `D-137`
  是最后一号（本轮取号时 `D-136` 是最后一条）；⑤ **F2 值得一次产品决定**：如果希望「点卡片 = 批准」在默认配置下也
  成立，要么把 `tool-ask-user` 默认改成 timed，要么让 `startBlock` 也读同回合的提问工具结果——两者都超出本分支，
  本轮只记录、没改。

## 2026-11-25 — 进度页重画：一页三态，六段脊退场，按钮只填框（`feat/progress-redesign`，未合流、未发版）

- **From:** 进度页 UI 包工头（`agent-169`，两个 worker：取数映射 `data-map`、重画 `redraw`）· **To:** 下一个接手的人
- **交付**：分支 `feat/progress-redesign`（worktree `.agents/worktrees/feat/progress-redesign`），基线 `main` 尖端 `ff5c5ec`，
  交付 HEAD **`87f14e1`**（产品提交 `e85c35f`）。门禁 `TMPDIR=$PWD/.tmp npm run ci` **EXIT=0**（`100 files / 1855 tests`、`15 warnings / 0 errors`、
  `lib/ at 87f14e1 … (285 files, byte-identical)`、`client bundle: 334321 bytes`）；基线同一命令 `100 files / 1870 tests`、
  `340426 bytes`。用例 **−15**、字节 **−6105** 都是重画的形状（旧脊椎/环/连线/干线/结算条/详情弹层整族删掉）。
- **用户能看到什么**：
  1. **头部**：run 名 + 五态胶囊（等你点头 / 进行中 / 已完成 / 未通过 / 已取消）。
  2. **现在**：「正在拆活」或当前步标题，小字「角色 正在看 · 第 n 步，共 N 步」。
  3. **轨道**：一步一段的等分分段条（绿做完、蓝在做、琥珀没过、灰没开始）+ 琥珀重做提示 + 「后面还有」+ 步骤清单（每步带 执行 → 检查 → 复核 链）。
  4. **经过**：一行一条调用（时间 / 角色 + 任务标题 / 状态词），失败行琥珀、正在跑的行浅蓝。
  5. **交卷**：写明交的哪一稿 + 打开胶囊；没有 `summary-final` 时如实写「这一轮没有交卷稿」。
  6. **底部**：「开工」/「收下这版」只把 `确认`（英 `yes`）填进输入框，**不代发**；无 conversation 服务时不渲染按钮。
  7. **聊天任务卡片**：同一套五态词与琥珀色，行 = 角色 + 任务标题 + 状态词 + 打开胶囊。
- **三条真机读数**：隔离克隆（`clone-profile.mjs`）+ 打包安装（版本 `0.13.38`，`sha256(lib/client.js)` = `4292bdf7…` 与工作树逐字相同）
  + 真模型（`bifrost-responses/opencode-go/muse-spark-1.3-contributor`），端口 3361：等你点头、进行中（3 个计划任务并行）、
  已完成（3 步全过 + 交卷卡 `汇总·第2稿（定稿）`），`consoleErrors: []`。截图与逐字文本
  `.rsi/evidence/progress-redesign-2026-11-25/`。
- **真机改掉的一处契约**：19:37 那轮把「规划」算成一步（「第 1 步，共 1 步 / 要干的 1 件事：规划」）。规划与汇总是 run
  自己的两头，现在只出现在经过里；没有步时主标题写 `progress.now.planning`（§19.2/§19.9）。
- **留给下一手的事**：
  1. **合流只在主代理做**（AGENTS §10）。`CHANGELOG.md` 只加在 `## [Unreleased]`（中英各三条），没有版本号、没有发版标题。
  2. **上游缺口**（`CONFIRMED`，本分支不修）：`src/report.ts:1170` 的 `shippedSummaryDraft()` 只认 review 里逐字出现的
     `check=pass verify=pass drafts=N`，所以有些运行产出三稿也不写 `summary-final`，交卷卡只能是空的。修它要改报告格式。
  3. **两份同名常量**（`PROGRESS_EVENT_TYPES`：TS 一份、客户端一份）现在由 `test/progress-tab.spec.ts` 逐条比对钉住；
     加事件要两边一起加，`stage-detail` 仍只在 TS 那份的「补字段」语义里。
  4. **没有的**：未通过/已取消两态的真机截图、点按钮后输入框内容的真机读数、窄屏真机截图（`NOT_RUN`，只有组件断言）；
     live 档案没升级、没重载、没重启（红线）。
  5. **分支判定日期 2026-11-26**：合流即删；`feat/*` 不许长期挂着。
  6. `~/.dsh/profiles/web` 的**目录** mtime 在 19:39–19:41 动过、内含 135 个新文件，不是本会话写的（写探针只读），
     成因 `HYPOTHESIS`（另一个会话的插件操作），值得下一个人顺手核一眼 live 到底被谁升过。

## 2026-11-26 — 0.13.41 发布（main）

- **From:** 记忆收口工（`agent-182/release-memory`）· **To:** 下一个接手的人
- **发布的是哪一版**：跑中插话又能送进正在跑的那一轮——每一轮跑起来时给自己开一条活通道（跑中插话按会话找到它、
  波边界那个规划子代理拿到本轮口令、运行结束关闭队列），跑中经 `grok_steer` 排进来的要求在下个波边界并进剩余计划，
  已验证的成果不重做；最后一道边界之后才到的要求会在日志里记个计数，不凭空消失。**从 0.13.35 起没有任何东西开过这个队列**，
  所以 `grok_steer` 一直答「这一块现在没有在跑的 workflow」，这一版修好。`replan` 开关语义不变（关掉仍是每条消息另起一轮）。
- **发布身份**：发布提交 **`a64a50a`** `chore(release): prepare v0.13.41`（父 `d35af40`，8 文件 / +22 −20）→
  `main` 以 `git merge --ff-only release/0.13.41` 前进，**`main` = `origin/main` = `a64a50a`**；
  附注标签 **`v0.13.41`** 对象 `96dd9cc`、剥出 `a64a50a`（`tagger 2026-11-26 01:46:11 +0800`）。
  远端 Release run **`45668227079`** `success`、CI run **`45668209937`** `success`。
- **Release 链接**：https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.41 ——
  非 draft、非 pre-release，唯一资产 `dsh-grok-workflow-0.13.41.tgz` = 976529 字节。
- **门禁（`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` 在 `a64a50a` 的干净树上 `102 files / 1927 tests passed`、
  `Duration 98.22s`、`15 warnings / 0 errors`（182 files / 96 rules）、`lib/ … (285 files, byte-identical)`、
  `client bundle: 348559 bytes`。转录 `.rsi/evidence/release-0.13.41-2026-11-26/gate-a64a50a.out`（23312 字节）。
- **用例数为什么是 1927 而不是 1923**：102 份 spec 一份没变，静态 `it(` `1848 → 1852`，多的 4 条全在
  `test/replan.spec.ts`（`17 → 21`），参数化差额仍是 `+75`。**这 +4 不来自发布提交**——发布提交没碰任何 `test/` 文件，
  它来自 `3778822 → d35af40` 那段修复自己。写记忆时别把因果按反。
- **没做的（照实记）**：
  1. **`AGENTS.md` §13 的 live 档案升级：`BLOCKED`。** 本会话文件策略 `workspace-write`，`~/.dsh` 在工作区之外，
     写探测只会得到只读（`Read-only file system`）。**不要尝试写 `~/.dsh`，不要重启/重载 3080 上的实例**（除非操作员明确点头）。
     live 现在装的是哪一版，本轮 `NOT_RUN`（读它也要进 `~/.dsh`）。
  2. **真机 / 隔离档案 soak 本轮 `NOT_RUN`**：本次改动的真机读数由 `feat/steering-reconnect` 那一轮覆盖
     （`.rsi/evidence/steering-reconnect-2026-11-26/`，六个状态的截图与逐字文本都在）。
  3. **`d35af40` 上的门禁 `NOT_RUN`**：那一格的 `1927` 是推的（静态 1852 + 75），不是测的，标 `HYPOTHESIS`。
- **两处别人的遗留，本轮仍然没碰**（`git status --short` 复核过）：`.gitignore` 是 **modified**、
  `.rsi/evidence/progress-now/` 是**未跟踪**。没有暂存、没有提交、没有修改、没有回滚——它们属于别的会话。
- **留给下一手最容易踩的两处口径**：① 这次的转录**末行是 `Duration`，没有 `GATE_EXIT=` 行**（上一轮 0.13.40 有），
  退出码只有命令层面的读数，别写成「转录末行写着 EXIT=0」；② `release/0.13.41` 已用 `git branch -d` 删除，
  `backup/*` 与所有 tag 都在，别把「本地只剩 main」理解成远端也被清了。
