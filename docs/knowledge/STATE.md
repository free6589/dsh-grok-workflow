Last updated: 2026-11-26 05:52 +08:00（**`fix/judge-leg-soak` 上，判腿被一次 401 拒掉之后整轮付多少代价，真机读数拿到了——五条判据全中；顺带把两份 README 里过期的门禁数字改成实测的 `103 个文件 / 1948 条`。未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.45`**：分支从 `main` 尖端 **`c7975cc`**（`0.13.45` 发版收口后的记忆提交）开出，worktree `.tmp/wt-judge-leg`、独立 `npm ci`。**没有产品代码改动**——`src/` / `test/` / `lib/` / `package.json` 一个字没动，改的只有 `README.md` 第 355 行与 `README.zh-CN.md` 第 337 行那两行数字（`1850 / 98` → `**1948 deterministic tests across 103 files**` / `**103 个文件 / 1948 个确定性测试**`，各 +1 −1；全仓只这两处带这两个数）。**这一轮补的是上一轮留白的那一格子**：`D-164`（`0.13.44` 发出）「钥匙被拒就在同一条路由上再问一次」的真机读数**当时只有规划腿那一份**（`auth-retry-2026-11-26`），判腿那一半只有单测；本轮把**判腿单独**指到一个拒一次的小代理上，其余四条腿直连。**装置**：`clone-profile` 克隆 live web（`parity 5/5 equal after redaction`、`0 unresolved`）→ 删残留的 `mode: triage`（被删键）→ 五角色 + `agent-default-model` + `guardianModel` 全钉 `bifrost-responses / opencode-go/muse-spark-1.3-contributor` → **新增只给判腿的 provider `authprobe`**（`baseURL 127.0.0.1:18190`，第一次 `POST …/responses` 回 401、之后透传真网关 `18088`）→ 装本轮 `npm pack` 的 `0.13.45`（`lib/script.js` `233d327e…2e22` 与工作树逐字节相同、`dsh plugin list` 读回 `0.13.45`）→ `DSH_HOME=.tmp/soak/dsh-home dsh --profile judgeleg-clone --port 3517`（live 3080 全程没碰）+ headless Chromium/CDP 按真人视角发一句话。**绿的那一跑 `bcd45b43`**（`05:37:05` 起、`161324 ms`、12 条子腿）：判腿第一条腿 `检查 · 任务 1`（child `b76ef3b2`）死在 `authprobe` 上（`authprobe API error (401) …`、`code AUTH`、小代理 `seq 1 -> 401 injected`）→ **同一次尝试里的第二条 `检查` 腿（child `2128a20e`）回到同一条路由、`completed`**（小代理 `seq 2 -> forwarded 200`）→ 任务 1 的 `执行` 腿**只出现一次**、checkpoint `attempts 1` → 报告 `Grok workflow: COMPLETED` / `Plan: planner; 2 task(s); 2 verified` / 两行 `verified (1 attempt)`、checkpoint `run.status completed`、`plan.source planner` → 路由台账**只有一行** `verifier / chainIndex 0 / attempt 1 / failed / model-unavailable`、**没有 `chainIndex > 0` 的行**（那条被拒的路由没被记成死路，也没有跨到第二条路由）。**红的那一跑 `d7c1017c`**（同装置 + `PROBE_ALWAYS=1` 每次都拒，`93328 ms`、10 条腿、4 次 401、整轮 `FAILED`）**只为一件事**：字面量 `judge re-fired` 挂在技术审计尾上，而审计尾只随**非 `completed`** 的报告附出（`src/index.ts:282`），所以绿跑读不到它、红的这跑两次尝试各打印一行 `Attempt N — route … — judge re-fired — not passed`；它同时给了「不记死路」第二份读数——台账 4 行**全部 `chainIndex 0`**。**一个口径要记住**：审计尾 `Attempt N — route …` 写的是这次尝试的**主路由**（干活那条腿的 `bifrost-responses`），裁判走哪条要看同一份审计尾的 `Calls` 段（`verifier chain 0 … via authprobe/…`）。**门禁**：这一轮**只跑了一截** `TMPDIR=$PWD/.tmp npx vitest run`（就是为了 README 那两个数），读数 **`Test Files 103 passed (103)` / `Tests 1948 passed (1948)`**、`Duration 101.60s`、`VITEST_EXIT=0`，与 `0.13.45` 发版门禁完全一致（这棵树没有漂）；**全量 `npm run ci` `NOT_RUN`**（§12），typecheck / lint / build / `verify:lib` 也 `NOT_RUN`（没有代码改动）。**红也要照实留**：这次 soak 的**第一次尝试是装置故障**——小代理的模型条目漏了 `reasoningEfforts`，判腿在 provider 层就死（`UNSUPPORTED_REASONING_EFFORT`，**一个 HTTP 都没发出**），那一轮 `7f6292d1` `failed` 并作废，补上同一份表后重跑。**红线**：`~/.dsh`（`2026-11-25 23:14:14`）、`profiles`（`2026-11-22 16:59:46`）、`profiles/web` 与 `cordis.patch.yml`（`2026-11-25 23:04:40`）、`.credentials.yaml`（`2026-11-14 22:47:23`）的 mtime 全在本会话（05:27 起）之前，写探测 `Read-only file system`，live 3080 前后都是 401；密钥只用布尔存在性判断、没有读值，小代理从不记 `Authorization` 头，scratch 令牌只落在 `.tmp/soak/token.txt`（0600，随 scratch 删除）；scratch 用完整棵删除。证据 `.rsi/evidence/judge-leg-soak-2026-11-26/`（含 `rig/` 可重放五件套：`proxy.mjs` / `pin-config.mjs` / `drive.mjs` / `chrome.sh` / `plan.json`）。

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 05:16 的 **`0.13.45` 发版收口**那一轮——它写的「`main` 尖端 = `63793eb`、`0.13.45` 已发布、附注标签与两个远端 run 都在、live 档案升级仍 `BLOCKED`、真机 soak `NOT_RUN`」本轮重读仍然成立，本轮正是从这个尖端开的分支；它记的门禁读数 **`103 files / 1948 tests`** 也正是本轮 README 那两处改成的新数字。再往下是 05:10 的 `fix/settled-rows`、04:28 的 `0.13.44` 发版收口、04:10 的 `fix/auth-retry`（判腿本轮的走廊就是那一轮加的），等等。）

Last updated: 2026-11-26 05:16 +08:00（**`0.13.45` 已发布并收口**——发版轮 + 收口轮，**这一轮没有写一行源码、没有改一个测试**：用户拿到的那一条行为在发布之前就已经在 `main` 上；发布提交 **`63793eb93b19723d4ec2e90ec23c86a1804a53a7`** `chore(release): prepare v0.13.45` 只把版本字面量从 `0.13.44` 抬到 `0.13.45`，**8 文件 / +22 −20**（`git show --numstat 63793eb` 逐文件数过：`CHANGELOG.md` +2 −0、`README.md` +5 −5、`README.zh-CN.md` +5 −5、`docs/LOCAL-TESTING.md` +3 −3、`lib/client.js` +2 −2、`package-lock.json` +2 −2、`package.json` +1 −1、`src/client/index.js` +2 −2），父提交 **`e2ed221`**、**单父、发布提交不是合并**；`src/` 与 `lib/` 的 diff 只有 `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对 `'0.13.44'` → `'0.13.45'`（`lib/client.js` 与 `src/client/index.js` 是**同一个 blob**，`ea4d107` → `93b7562`，各 **348559 字节**）；`package.json` 与 `package-lock.json` 现在都读 `0.13.45`（锁文件两处，第 3 行与第 9 行）；**`main` = `origin/main` = 发布提交 = 标签剥出的提交 = `63793eb`**；`CHANGELOG.md` 的 diff **只有 +2 行**：插入 `## [0.13.45] - 2026-11-26` 标题行加它上面一个空行，`### Fixed / 修复` 那一段的条目正文中英**一字未改**；`## [Unreleased]` 现在是空的；新版那一节只带**一条**——「The boundary planner now sees what already settled, with each verdict and title / 波边界那个规划子现在真的看得到已经沉淀的任务，连判决和标题一起」，升级须知是「不用准备任何东西——没有键、schema、默认值或已存记录变化」。**口径要写准**：操作者的简报列了两条内容，但**「钥匙被拒会在同一条路由上再问一次」那条已经在 `0.13.44` 发出去过**（`fix/auth-retry` 轮、`D-164`），`0.13.45` **只带**「已沉淀行」这一条；`v0.13.44..main` 里除记忆/证据提交之外只有**一颗产品提交** **`4fc24b3`** `fix(replan): the boundary planner reads each settled row's verdict and title`，加它后面那颗 **`a3ef7e1`** `docs(memory): record the settled-rows readout, its red/green, and the real-machine boundaries` 与**两个合并提交**。**一处历史褶皱照实记**：`main` 上有一对**内容完全相同**的合并提交——`d975dba`（父 `d6c338e` + `a3ef7e1`）与 `e2ed221`（父 `d6c338e` + `d975dba`），`git diff d975dba e2ed221` **为空**、两棵树都是 **`dc11ac3`**，即第二颗是**空合并**；什么都没丢、没有重写历史。**用例算术（本轮自己从 git 对象数过）**：spec 文件 `v0.13.44` → `main` **103 → 103**（没有新增或删除任何测试文件；`git diff --name-only v0.13.44 main -- test` 只有 `test/replan.spec.ts` 一个文件）；`test/replan.spec.ts` 带词边界的 `it(` **24 → 25**（+1，就是 `4fc24b3` 加的那一例 `runReal`）；所以门禁的 **1947 → 1948** 来自**功能提交**，**不来自发版提交**。**门禁只有一份，就是发布提交自带的那一份**——`TMPDIR=$PWD/.tmp npm run ci`、worktree `.tmp/wt-release-0.13.45` 的干净树、`HEAD = 63793eb`、**`GATE_EXIT=0`**；转录 `.rsi/evidence/release-0.13.45-2026-11-26/gate-release-63793eb.out`（**412 行 / 25328 字节**、`sha256 0649e838902ccd513ab6c8650fc6c51d6c1cc573bbc90199f0f94b45054fd0a0`、末行 `GATE_EXIT=0`；它与本轮那份原件 `cmp` 逐字节相同，原件所在的 worktree 已随清理消失）；读数：第 2 / 6 / 10 行读作 `> dsh-grok-workflow@0.13.45 ci` / `… typecheck` / `… lint`（**跑门禁的那棵树里 `package.json` 已经是 `0.13.45`**）、第 162 行 `Found 15 warnings and 0 errors.`、第 163 行 `Finished in 87ms on 184 files with 96 rules using 6 threads.`、第 168 与第 178 行 `client bundle: 348559 bytes → lib/client.js`（同值）、第 169 行 `lib/ at 63793eb is the build of src/ at 63793eb (289 files, byte-identical)`、第 407 行 **`Test Files 103 passed (103)`**、第 408 行 **`Tests 1948 passed (1948)`**、第 410 行 `Duration 147.60s (transform 2.83s, setup 0ms, import 10.05s, tests 125.49s, environment 11ms)`、第 412 行 `GATE_EXIT=0`；`grep -cE 'FAIL|failed'` = **4**（`FAIL` 0 命中、`failed` 4 命中），**四条都不是失败**：第 209 行 checkpoint 夹具**故意**造的 `[smoke] status=failed …`（同一份 spec 的上一例是 `status=completed`，第 212 行读作 `✓ test/checkpoint-engine-wire.spec.ts (6 tests) 1820ms`）、第 261 行用例标题 `✓ re-fires once when the answer cannot be parsed, then reports a failed judge`、第 307 行用例标题 `✓ maps in_progress→running and failed→blocked with the detail as blockedReason`、第 310 行 `stderr | test/client.spec.ts > … > keeps still reading, read failed and not served as three different pages` 那条日志；**没有第二份门禁**——父提交 `e2ed221` 就是功能轮的合流尖端，那一轮自己的块内门禁归档在 `.rsi/evidence/settled-rows-2026-11-26/`（`gate-typecheck.out`、`gate-lint.out`、`gate-specs.out` 45 passed、`gate-build.out`、`gate-docs-guards.out`、`red-before-fix.out`）。**标签 `v0.13.45`** 是附注标签，对象 **`ca4a42c618b469a5bfc6db5442c8530c59a79065`** → 剥出 `63793eb`、消息 `Grok Workflow for DSH v0.13.45`、`tagger` 时刻 **2026-11-26 05:11:02 +0800**（`1795641062 +0800`）、标签上的 `package.json` 读 `0.13.45`；**没有 force-push、没有移动任何已发布标签**（本轮重读 `v0.13.41` `96dd9cc`/`a64a50a`、`v0.13.42` `98b9c45`/`651f3dd`、`v0.13.43` `e084e4b`/`549a579`、`v0.13.44` `e1a0044`/`7cc4a90`，四条与开工前基线逐字一致）。**推送**：`e2ed221..63793eb  main -> main` 与 `* [new tag]  v0.13.45 -> v0.13.45`；远端现在是 `refs/heads/main = 63793eb`、`refs/tags/v0.13.45 = ca4a42c…`、剥出 `63793eb`。**远端两个 run（`gh run view` 重读）**：Release run **`45701977660`**——workflow `Release`、`headBranch v0.13.45`、sha `63793eb`、**conclusion success**、单 job `Validate and publish v0.13.45`、`2026-11-25T21:11:15Z → 21:12:34Z`（约 **1m19s**）、run 建于 `21:11:12Z`、更新于 `21:12:35Z`，派单时用 `gh run watch … --exit-status` 盯到退出 0；`main` 的 CI run **`45701972085`**（sha `63793eb`、**success**）；GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.45 名字 `Grok Workflow for DSH v0.13.45`、`publishedAt 2026-11-25T21:12:30Z`、非 draft / 非 prerelease、target `main`、正文就是 `## [0.13.45] - 2026-11-26` 那一节（**2151 字节**；`gh release view --json body` 读回 17 行正文 + 末尾一个换行）、唯一资产 **`dsh-grok-workflow-0.13.45.tgz` = 988089 字节**、摘要 `sha256:8d56730583a0c22f429d2e54eef7f4272be3adc8fc1ba0d1da41b9daae985ad9`（上一版 `0.13.44` = 987079 → **+1010**）。**清理（推送成功后做，已做完）**：`git worktree remove .tmp/wt-release-0.13.45`（`git worktree list` 现在只剩主检出 `/home/fish/projects_mine/dsh-grok-workflow 63793eb [main]`）、`git branch -d release/0.13.45`（`Deleted branch release/0.13.45 (was 63793eb)`）；**远端分支一个没删、标签一个没删**；**两处别的会话的遗留没碰、没暂存、没提交**：`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪)。**`BLOCKED`（`AGENTS.md` §13 的 live 档案升级，这就是下一件事）**：**没做成**——本会话文件策略 `workspace-write`、`~/.dsh` 在工作区外，写探测 `: > ~/.dsh/.release-probe-0.13.45` 返回 **`Read-only file system`**（退出 1，只试一次、没有重试），**没写、没重载、没重启**，3080 那个实例全程没碰；只读读到的：live 档案里装的 `dsh-grok-workflow` 仍读 **`0.13.39`**，mtime `~/.dsh` `2026-11-25 23:14:14`、`~/.dsh/profiles` `2026-11-22 16:59:46`、`profiles/web/cordis.patch.yml` `2026-11-25 23:04:40`。**下一个人（有写权限的）要做的一件事**：把 live 那条插件行钉到**确切的标签 `v0.13.45`**（绝不用浮动范围、`latest` 或分支名），把装好的版本读回来确认；读不回 `0.13.45` 就把那一行回滚。**`NOT_RUN`**：这一轮没有真机 soak——发版轮没有新行为可 soak，这里发出去的行为是 `fix/settled-rows` 那一轮在真机上验过的（证据 `.rsi/evidence/settled-rows-2026-11-26/`）。`DECISIONS.md` **一个字没改**：这一版没有新决定，`D-165` 已经把「边界子读结算行本身」写好了。）

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 05:10 的 **`fix/settled-rows`** 那一轮——它开头那句「未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.44`」**已经被本轮取代**：那个修复已经并进 `main`（`4fc24b3` + `a3ef7e1`，两道合并 `d975dba` / `e2ed221`）并随 **`0.13.45`** 发布（`main` 尖端 = 发布提交 = `63793eb`、附注标签 `v0.13.45`），所以凡它写「版本仍 `0.13.44`」「未发版」的地方，都按本轮读：**版本是 `0.13.45`，已发布**；它写的「分支从 `main` 尖端 `d6c338e` 开出」仍然对，那个 `d6c338e` 就是当时的 `main` 尖端。再往下是 04:28 的 `0.13.44` 发版收口、04:10 的 `fix/auth-retry`、03:36 的 `0.13.43` 发版收口，等等。）

Last updated: 2026-11-26 05:10 +08:00（**`fix/settled-rows` 上，边界子终于看得见已沉淀任务了——提示词里每行现在读作 `- count_readme [verified] 统计 README.md 行数`，不再是 `- count-agents [undefined] `；未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.44`**：分支从 `main` 尖端 **`d6c338e`** 开出（worktree `.tmp/wt-settled-rows`、独立 `node_modules` 拷贝）。**这一轮修的是上一轮 `fix/replan-shape` 在真机上照实记下、当时判定「与本轮无关、留给下一块」的那条观察**：调用点先拼一份 `statuses`（`Record<id, string>`）再交给 `requestReplan`，而 `replanPrompt` 按 `row.status` / `row.task.title` 读，字符串上两个字段都是 `undefined`。**改动面只有 `src/script.ts` 的调用点与签名、一份 spec 里新增一例 `runReal`、重建 `lib/`、`CHANGELOG` 一条、`D-165`**：调用点改成**交结算行本身**（那份 `statuses` 投影删掉），`requestReplan` 形参改名 `settledRows` 并注明形状、原样传给 `replanPrompt`（**渲染一行没改**），而 `mergeReplan` 要的「编号 → 状态」改在 `requestReplan` 里**从同一批行派生**——**`src/replan.ts` 一个字没动**，合并器契约照旧。**用户看到的**：跑中加进来的要求，是拿一份「做完的那一半看得见判决和标题」的计划来判的，不再对着空白判。**块内门禁**：`tsc` `TSC_EXIT=0`、`oxlint 15 warnings / 0 errors / 184 files`、定向 3 份 spec **`45 passed`**（`replan` 25 + `naming-sequence` 6 + `steering-inbox` 14）、`npm run build` `client bundle: 348559 bytes`（`lib/script.js` 265049 字节、`sha256 233d327e…2e22`）；**红有记录、而且是先红后绿**：写用例时先 `git stash push -- src` 退回基线跑新用例 → **`1 failed | 24 skipped`**、读作 `expected '- a [undefined] ' to be '- a [verified] Task a'`（真机原样症状，`red-before-fix.out`）。**全量 `npm run ci` `NOT_RUN`**（§12）。**真机（隔离档案 `settled-clone` 克隆自 live web、`DSH_HOME=.tmp/soak/dsh-home`、端口 3487、live 3080 全程没碰、真模型 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`）**：装本轮 tgz（`lib/script.js` `sha256 233d327e…2e22` 与工作树逐字节相同、版本读回 `0.13.44`），headless Chromium + 上一轮那份 CDP 驱动跑「三波数行数」：根会话 `tool/call` seq 19、`run-end stopReason completed`、报告 `Plan: planner; 3 task(s); 3 verified`，**两道边界子（`规划（第2次）` / `规划（第3次）`）的提示词分别读作 `- count_readme [verified] 统计 README.md 行数` 与再加一行 `- count_changelog [verified] 统计 CHANGELOG.md 行数`，两份提示词里都不出现 `undefined`**。**红线**：`~/.dsh`（`2026-11-25 23:14:14`）、`profiles`（`2026-11-22 16:59:46`）、`profiles/web` 与 `cordis.patch.yml`（`2026-11-25 23:04:40`）、`.credentials.yaml`（`2026-11-14 22:47`）mtime 全在本会话之前，写探测 `Read-only file system`，3080 前后 401；scratch **275 MB** 用完整棵删除、3487 与 9223 已关；证据 `.rsi/evidence/settled-rows-2026-11-26/`。）

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 04:28 的 **`0.13.44` 发版收口**那一轮——它写「`main` 尖端 = `7cc4a90`」仍然对，本轮就是从这个尖端开的分支；再往下是 04:10 的 `fix/auth-retry`、03:36 的 `0.13.43` 发版收口、03:25 的 `fix/replan-shape`（那条「`SETTLED TASKS` 每行仍读作 `- count-agents [undefined] `，留给下一块」正是本轮修掉的那条）以及更早的条目。）

Last updated: 2026-11-26 04:28 +08:00（**`0.13.44` 已发布**——发版轮 + 收口轮；**发布提交本身没有代码改动**，用户拿到的那一条行为来自它前面刚落进 `main` 的功能合流 `649c4e4`：发布提交 **`7cc4a90`** `chore(release): prepare v0.13.44` 只把版本字面量从 `0.13.43` 抬到 `0.13.44`，`src/` 与 `lib/` 的 diff 只有 `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对 `'0.13.43'` → `'0.13.44'`（两个文件 `cmp` **逐字节相同**、各 **348559 字节**），父提交 **`649c4e4`**、**单父、发布提交不是合并**，**8 文件 / +22 −20**：`CHANGELOG.md`(+2 −0：只插入 `## [0.13.44] - 2026-11-26` 标题、空的 `## [Unreleased]` 留空站在上面、条目正文中英一字未改)、`README.md`(5/5)、`README.zh-CN.md`(5/5)、`docs/LOCAL-TESTING.md`(3/3)、`lib/client.js`(2/2)、`package-lock.json`(2/2)、`package.json`(1/1)、`src/client/index.js`(2/2)；`package.json` 与 `package-lock.json` 现在都读 `0.13.44`；**`main` = `origin/main` = 发布提交 = 标签剥出的提交 = `7cc4a90`**（没有第二个合并提交，也没有 force-push）；**这一版回到了「worktree + 本地发布分支」的做法**（`.tmp/wt-release-0.13.44` / `release/0.13.44`，HEAD 与 `main` 同值），本轮收口在**推送成功后**清理它们（`git worktree remove .tmp/wt-release-0.13.44`、`git branch -d release/0.13.44`），**远端分支一个不删**；**标签 `v0.13.44`** 是附注标签，对象 **`e1a00440e4205d42fd0665a20ee2a17dca3df6ce`**、剥出 `7cc4a90`、消息 `Grok Workflow for DSH v0.13.44`、`tagger` 时刻 **2026-11-26 04:23:06 +0800**（`1795638186 +0800`）、标签上的 `package.json` 读 `0.13.44`；**没有移动任何已发布标签**（本轮自己重读 `v0.13.40` `14fef64`/`3778822`、`v0.13.41` `96dd9cc`/`a64a50a`、`v0.13.42` `98b9c45`/`651f3dd`、`v0.13.43` `e084e4b`/`549a579`，四条与开工前基线逐字一致）；**门禁只有一份，就是发布提交自带的那一份**——`TMPDIR=$PWD/.tmp npm run ci`、发布 worktree 的干净树、`HEAD = 7cc4a90`、**`GATE_EXIT=0`**，转录 `.rsi/evidence/release-0.13.44-2026-11-26/gate-release-7cc4a90.out`（**372 行 / 21960 字节**、`sha256 9af222b39e8a4a7174d700ecd3ec271c2365061cd90003bc95823259f5f8c41a`、末行 `GATE_EXIT=0`），读数 `Found 15 warnings and 0 errors.` 与 `Finished in 96ms on 184 files with 96 rules using 6 threads.`、`client bundle: 348559 bytes → lib/client.js`（第 168、178 行各一次、同值）、`lib/ at 7cc4a90 is the build of src/ at 7cc4a90 (289 files, byte-identical)`、**`Test Files 103 passed (103)` / `Tests 1947 passed (1947)`**、`Duration 81.75s (transform 2.38s, setup 0ms, import 9.96s, tests 59.78s, environment 11ms)`；**没有第二份门禁**，因为父提交 `649c4e4` 就是功能轮的合流尖端、那一轮已经带自己的块内门禁（`.rsi/evidence/auth-retry-2026-11-26/`：定向 9 份 spec `165 passed`、红 `3 failed / 18 passed`），抬版本之前重跑一遍不多证明一件事（§12）；**`grep -cE 'FAIL|failed'` 命中 2 条，两条都不是失败**——第 182 行是 `test/client.spec.ts` 用例**标题**里的 `read failed`（该 spec 第 188 行读作 `✓ test/client.spec.ts (151 tests)`），第 299 行是 `test/checkpoint-engine-wire.spec.ts` 夹具**故意**造的 `[smoke] status=failed`（该 spec 第 301 行读作 `✓ … (6 tests)`）；**算术本轮从 git 对象数过、与门禁同值**：spec 文件 `649c4e4` **103** → `7cc4a90` **103**（发布提交不碰任何 `test/` 文件，`git diff --name-only … -- test` = **0**），用例 `0.13.43` 门禁 **1944** → 本轮 **1947**，那 **+3** 来自功能提交 **`8dccf67`**（`test/planner-resubmit.spec.ts` 10 → 12、`test/judge-leg-retry.spec.ts` 8 → 9，带词边界数 `it(` 在 `8dccf67^` 与 `7cc4a90` 各复核一次），**不随发版提交走**，也别与 `0.13.43` 的 +3（`38d64bb` 的 `test/replan.spec.ts` 21 → 24）混算；**远端两个 run 本轮用 `gh run view` 重读**——Release run **`45694469431`**（`headBranch v0.13.44`、sha `7cc4a90`、**success**、单 job `Validate and publish v0.13.44`、`20:23:17Z → 20:24:49Z` 约 1m28s）与 `main` 的 CI run **`45694462916`**（sha `7cc4a90`、**success**）；GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.44 名字 `Grok Workflow for DSH v0.13.44`、`publishedAt 2026-11-25T20:24:43Z`、非 draft / 非 prerelease、target `main`、正文 **21 行 / 2598 字节**、唯一资产 **`dsh-grok-workflow-0.13.44.tgz` = 987079 字节**（上一版 `0.13.43` = 984828 → **+2251**）、`digest sha256:b6b1b6a0…6cc1df`；**用户拿到的只有一件事**（`CHANGELOG` 的 `## [0.13.44]` 已写好，这里只是转述）：网关第一次用钥匙错误拒掉调用的那种运行会**照常跑完**——被拒的调用在同一条路由上先重发一次（两条判腿在同一次尝试里把裁判再问一遍，规划腿对准拒的那条路由再问一次计划，最多一次额外子调用），而这条路**仍然不被记成死路**，死路表照旧只数超时、掉线、5xx 和留在原路由上的 429；升级须知是「不用准备任何东西」（没有键、schema、默认值或已存记录变化）。**口径要写准**：这一版只带这一条，`0.13.43` 那条（边界子请求单形状）上一版就已经发出去了；**历史褶皱照实记**：`main` 上有一对**内容相同**的合并提交 `7add053`（父 `7f0a47f` + `2055249`）与 `649c4e4`（父 `7f0a47f` + `7add053`），`git diff 7add053 649c4e4` **为空**——第二颗是空合并，什么都没丢、也没重写历史；**`NOT_RUN`**：本轮没做真机 soak（发版轮没有新行为可 soak，这里发出去的行为是 `fix/auth-retry` 那一轮在真机上验过的，证据 `.rsi/evidence/auth-retry-2026-11-26/`）；**`BLOCKED` 一条**：`AGENTS.md` §13 的 live 档案升级**没做成**——本会话文件策略 `workspace-write`、`~/.dsh` 在工作区外，写探测 `: > ~/.dsh/.release-probe-0.13.44` 返回 **`Read-only file system`**，**没写、没重载、没重启**；live 档案现在装的是哪一版**本轮没读**（`NOT_RUN`）；下一个人（有写权限的）要做的：把 live 那条插件行钉到**确切的标签 `v0.13.44`**（绝不用浮动范围），把装好的版本读回来确认，读不回 `0.13.44` 就回滚那一行；**本轮没碰的两处遗留**（属别的会话）：`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪)；**记忆提交只有一次**（`STATE` / `HANDOFF` / `VALIDATION` + 新证据目录 `README.md`），**`DECISIONS.md` 一个字没改**（这一版没有新决定，`D-164` 功能轮就写好了），读到的每个数都能在 `.rsi/evidence/release-0.13.44-2026-11-26/README.md` 里回指到一条命令。）

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 04:10 的 **`fix/auth-retry`** 那一轮——它开头那句「未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.43`」已经被本轮取代：那个修复已经并进 `main` 并随 **`0.13.44`** 发布（`main` 尖端 `7cc4a90`、附注标签 `v0.13.44`），它写的「分支从 `7f0a47f` 开出」仍然对，那个 `7f0a47f` 就是当时的 `main` 尖端。再往下是 03:36 的 `0.13.43` 发版收口、03:25 的 `fix/replan-shape`、02:47 的 `0.13.42` 发版收口，等等。凡这几条里写「版本仍 `0.13.4x`」「未发版」「未合 main」的地方，都按本轮读：**版本是 `0.13.44`，已发布**。）

Last updated: 2026-11-26 04:10 +08:00（**`fix/auth-retry` 上，钥匙被拒现在会在同一条路由上再问一次——判腿不再为「没人做过的判决」重跑干活那条腿，规划腿也不再直接落兜底；未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.43`**：分支从 `main` 尖端 **`7f0a47f`** 开出（worktree `.agents/worktrees/fix-auth-retry`，独立 `npm ci`）。**这一轮修的是 `D-120` 当年故意留下的那一条**：拒 = 需要一把钥匙、不是需要另一条路由，于是拒既不进死路表、也不走任何重发走廊；但拒常常只针对**这一次请求**（网关在轮换上游凭据那一下会对第一个请求回 401、下一个就正常），而代价落得很实——判腿把「没有判」记下来、整轮重试，干活那条腿被重跑一遍只为拿一个谁都没做过的判决；规划腿问不出计划就落兜底切分，而兜底计划永远报不出 `completed`。改动面 **2 个 `src/` 文件 + 三份 spec + 重建 `lib/` + `CHANGELOG` 一条 + `D-164` + `RESEARCH` 一条**：`src/script.ts` 新增独立谓词 **`refusalDeath(failure)`**（`class === 'model-unavailable'` 且非设置故障），**`judgeLegTransportDeath` 改读它**（`routeHealthFamily(...) !== '' || refusalDeath(failure)`），两条判腿因此在**同一次尝试里**把裁判再问一次；规划腿 **C 走廊**加一条 `else if (!plan && refusalDeath(planFailure))`，用 `repeatAvoid`（避开这次调用已付过的路由、只留最后那条）**只重问一条**，最多再花一个子调用、绝不顺着链再走一遍；日志按死因分两种说法（`judgeLegDeathWord`：`a transport death` / `a refusal`，运输类那句逐字未变）。**`ROUTE_HEALTH_FAMILIES` 一个字没动**：钥匙被拒仍然永远不进死路表。**用户看到的**：网关第一次用钥匙错误拒掉调用的那种运行会照常跑完（`Plan: planner; 2 task(s); 2 verified`），代价正好一次额外子调用。**块内门禁**：`tsc` `TSC_EXIT=0`、`oxlint 15 warnings / 0 errors / 184 files`、定向 9 份 spec **`165 passed`**、`npm run build` `client bundle: 348559 bytes`（浏览器包没动）；**红有记录**：`git stash push -- src` 退回基线只跑三份 spec → **`3 failed / 18 passed`**（`red-before-fix.out`）。**全量 `npm run ci` `NOT_RUN`**（§12）。**真机（隔离档案 `authretry-clone` 克隆自 live web、`DSH_HOME=.tmp/soak/dsh-home`、端口 3455、live 3080 全程没碰、真模型）**：规划腿**独占**一个只在小代理处生效的 provider `authprobe`（`baseURL 127.0.0.1:18190`，**第一次 `POST /openai/v1/responses` 回 401、之后原样透传到真网关 18088**），其余角色直连 `bifrost-responses`；装本轮 tgz（`sha256 13607a3c…25756`，`lib/script.js` `ada7a58f…97b0a` 与工作树逐字节相同、版本读回 `0.13.43`），headless Chromium + 上一轮那份 CDP 驱动按真人视角发一句话。运行 `818754a2-115b-409a-96a2-e1dbf93a3283` 的读数：`routing` 里规划腿路由是 `authprobe/opencode-go/muse-spark-1.3-contributor`，`switches` 第一行 **`role planner / chainIndex 0 / attempt 1 / outcome failed / failureClass model-unavailable`**（理由里逐字带 `401 Unauthorized: virtual key is required`），两个规划子会话 `seq 1 failed` → `seq 2 completed` 且 `request/context` 都是**同一条** `authprobe/opencode-go/muse-spark-1.3-contributor`，小代理日志 `seq 1 → 401 injected`、`seq 2/3/4 → 200`（同路径同模型），报告 **`COMPLETED` / `Plan: planner; 2 task(s); 2 verified`**，会话读作「已完成，用时 3分21秒」；**没有任何子代理提示词带 `RESUBMISSION`**，所以第二次问是 C 走廊的同路重问、不是 B 走廊的同次重交。**判据全中：运行 `completed`（2/2 verified、计划来自 planner）+ 同一条路由被再问一次。** **红线**：`~/.dsh` mtime **`2026-11-25 23:14:14`**、`~/.dsh/profiles` **`2026-11-22 16:59:46`**、`~/.dsh/profiles/web` 与 `cordis.patch.yml` **`2026-11-25 23:04:40`** —— 全在本会话（03:47 起）之前；写探测 `Read-only file system`；live 3080 前后都 401。scratch `.tmp/soak`（**283 MB**）用完删除，证据 `.rsi/evidence/auth-retry-2026-11-26/`。）

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 03:36 的 **`0.13.43` 发版收口**那一轮——它写的「`main` = `origin/main` = `549a579`、`0.13.43` 已发布」本轮重读仍然成立（本轮正是从这个 `7f0a47f` 之后开出分支，未合入）；再往下是 `fix/replan-shape`、`0.13.42` 发版收口等更早的条目。）

Last updated: 2026-11-26 03:36 +08:00（**`0.13.43` 已发布**——发版轮，**这一版没有任何代码改动**：发布提交 **`549a579`** `chore(release): prepare v0.13.43` 只把版本字面量从 `0.13.42` 抬到 `0.13.43`，`src/` 与 `lib/` 的 diff 只有 `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对字面量 `'0.13.42'` → `'0.13.43'`（两份 blob 同为 **`5ecf0d8`**、各 **348559 字节**、`cmp` 报逐字节相同），父提交 **`532d4cf`**，**8 文件 / +22 −20**：`CHANGELOG.md`(+2 −0，空的 `## [Unreleased]` 标题留着、新的 `## [0.13.43] - 2026-11-26` 把既有条目原文搬过来)、`README.md`(5/5)、`README.zh-CN.md`(5/5)、`docs/LOCAL-TESTING.md`(3/3)、`lib/client.js`(2/2)、`package-lock.json`(2/2)、`package.json`(1/1)、`src/client/index.js`(2/2)；`package.json` 与 `package-lock.json` 现在都读 `0.13.43`；**`main` 是直接 push 快进的**（推送输出 `532d4cf..549a579  main -> main`，随后 `* [new tag]  v0.13.43 -> v0.13.43`），所以 **`main` = `origin/main` = 门禁提交 = 标签剥出的提交 = `549a579`**、没有第二个合并提交；**一处偏差照实记**：早几轮都是从 `release/0.13.4x` 分支 `--ff-only` 合进来，这一轮直接提交在 `main` 上推（结果等价、少一条分支），本轮**没有建 worktree、也没有 worktree 要删**；**标签 `v0.13.43`** 是附注标签，对象 **`e084e4b8ad0ae7acec5a7ccaf045fa09f27f5577`**、剥出 `549a579`、消息 `Grok Workflow for DSH v0.13.43`、`tagger` 时刻 **2026-11-26 03:33:33 +0800**（`1795635213 +0800`），标签上的 `package.json` 读 `0.13.43`；**没有 force-push、没有移动任何已发布标签**（本轮自己重读 `v0.13.42^{}` → `651f3dd`、`v0.13.41^{}` → `a64a50a`、`v0.13.40^{}` → `3778822`，对象仍是 `98b9c45` / `96dd9cc` / `14fef64`）；**两次门禁都在干净树上 `GATE_EXIT=0`**——门禁 #1 是抬版本之前的树 **`532d4cf`**（证明改动在 bump 前就是绿的）：`Found 15 warnings and 0 errors.`（184 文件、96 条规则）、`client bundle: 348559 bytes → lib/client.js`、`lib/ at 532d4cf is the build of src/ at 532d4cf (289 files, byte-identical)`、**`Test Files 103 passed (103)` / `Tests 1944 passed (1944)`**、`Duration 102.56s`，转录 `.rsi/evidence/release-0.13.43-2026-11-26/gate-prerelease-532d4cf.out`（**396 行 / 23898 字节**、`sha256 44e7f893a8b2b6e1dc95398afc58a6e4c69027b77ddd1370e60572e19cf4ca1c`，末行 `GATE_EXIT=0`、`FAIL` 0 命中）；门禁 #2 是发布树 **`549a579`**：同样的 `Found 15 warnings and 0 errors.`、`client bundle: 348559 bytes → lib/client.js`、`lib/ at 549a579 is the build of src/ at 549a579 (289 files, byte-identical)`、**`Test Files 103 passed (103)` / `Tests 1944 passed (1944)`**、`Duration 107.03s (transform 3.29s, setup 0ms, import 9.83s, tests 84.63s, environment 12ms)`，转录 `gate-release-549a579.out`（**394 行 / 23572 字节**、`sha256 a67cd0390fd126a76ffc22ed6c6efae08eda1d3b6b0669c517ce2635541331cf`、末行 `GATE_EXIT=0`），门禁后 `git status --short` 只剩那两处遗留 → **提交的 `lib/` 就是提交的 `src/` 的构建**；**算术本轮自己从 git 对象数过**：spec 文件 `532d4cf` **103** → `549a579` **103**（发布提交不碰任何 `test/` 文件，`git diff --name-only … -- test` = **0**），用例 **1944 / 1944**，**仅供对照**：`0.13.42` 发的是 **`103 files / 1941 tests`**，那 **+3** 来自功能提交 **`38d64bb`**（`test/replan.spec.ts` 21 → 24）、本轮之前就已经在 `main` 上；**两个 run 本轮用 `gh run view` 重读**——Release run **`45686411703`**（`headBranch v0.13.43`、sha `549a579`、**success**、单 job `Validate and publish v0.13.43`）与 `main` 的 CI run **`45686404326`**（sha `549a579`、**success**），两个都用 `gh run watch --exit-status` 盯到退出 0；GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.43 名字 `Grok Workflow for DSH v0.13.43`、`publishedAt 2026-11-25T19:35:15Z`、非 draft / 非 prerelease、target `main`、正文 **28 行**、唯一资产 **`dsh-grok-workflow-0.13.43.tgz` = 984828 字节**（上一版 `0.13.42` = 980976 → **+3852**），`digest sha256:8151ba209bf7243a739379767b53d56c438f28408730c46efab782101127c15b`；**用户拿到的只有一件事**（`CHANGELOG` 的 `## [0.13.43]` 里已经写好，这里只是转述）：边界规划子代理的请求单形状现在写清楚了，写在 `action` 旁边的任务体会被提到 `task` 里，所以跑中加进来的要求这一次真的能并进计划；缺必填字段的体照旧拒，但拒绝语会点名缺哪几个。**口径要写准**：发版清单上列的是两条（「边界请求形状」与「收件箱闸门」），**收件箱闸门（跑中打的话并进那次运行）不在 `0.13.43` 里——它 `0.13.42` 就已经发出去了**，`0.13.43` 只带请求形状这一条；**`NOT_RUN`**：本轮没做真机 soak（发版轮没有新行为可 soak，这里发出去的行为是 `fix/replan-shape` 那一轮在真机上验过的，证据 `.rsi/evidence/replan-shape-2026-11-26/`）；**`BLOCKED` 一条**：`AGENTS.md` §13 的 live 档案升级**没做成**——本会话文件策略是 `workspace-write`、而 `~/.dsh` 在工作区外，从这里写不进去，**没写、没重载、没重启** live 档案；下一个人（有写权限的）要做的：把 live 那条插件行钉到**确切的标签 `v0.13.43`**（绝不能用浮动范围），把装好的版本读回来确认，读不回 `0.13.43` 就回滚那一行——跑发布版时它必须读作 `0.13.43`；**本轮没碰的两处遗留**（属别的会话）：`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪)；**记忆提交只有一次**（`STATE` / `HANDOFF` / `VALIDATION` + 新证据目录 `README.md`），**`DECISIONS.md` 一个字没改**（这一版没有新决定），读到的每个数都能在 `.rsi/evidence/release-0.13.43-2026-11-26/README.md` 里回指到一条命令。）

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 03:25 的 **`fix/replan-shape`** 那一轮——它开头那句「未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.42`」已经被本轮推翻：那个功能已经随 `0.13.43` 发布（`main` 尖端 `549a579`、附注标签 `v0.13.43`）。再往下是 02:47 的 `0.13.42` 发版收口、02:45 的 `feat/inbox-steering`、01:35 的 `fix/steering-reconnect`、00:47 的 `0.13.40` 发版收口，等等。凡这几条里写「版本仍 `0.13.4x`」「未发版」「未合 main」的地方，都按本轮读：**版本是 `0.13.43`，已发布**。）

Last updated: 2026-11-26 03:25 +08:00（**`fix/replan-shape` 上，边界子的请求单修好了——真机上跑中加的那条要求这一次真的并进了计划（`plan.version` 1 → 2、`addedTaskIds` 含 `task-4`、`task-4` 随后跑完并验过）；未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.42`**：分支从 `main` 尖端 **`26b4bdd`** 开出（worktree `.tmp/wt-replan-shape`、独立 `npm ci`）。**这一轮修的是一件已经被真机钉死的小事**：上一轮（`feat/inbox-steering`）证明投递链通了，但边界子把任务字段写在编辑层、没写 `task` 体、也缺 `expectedOutput` 与 `acceptanceCriteria`，宿主按 `replan edit 1 adds a task with no body` 整条拒掉。改动面 **2 个 `src/` 文件 + 一份 spec + 重建 `lib/` + `CHANGELOG` 一条 + `D-163` + `RESEARCH` 一条**：`src/script.ts` 的 `REPLAN_SCHEMA` 把 `edits.items` 从一团 `{type:'object'}` 换成三分支 `oneOf`（`add` 必须带 `task` 且 `task` 必填 `id/title/objective/expectedOutput/acceptanceCriteria`，每个字段带说明）、新增 `replanEditBody()` 把写在 `action` 旁边的任务字段提到 `task` 里（`add` 连 `id` 一起提、`update` 不提）、拒绝语点名缺的字段、`replanPrompt()` 的 RULES 多两条（字段属于 `task`；`dependsOn` 只写本提示词印出来的 id）并加一条**逐字可抄的完整 `apply` 例子**；`src/replan.ts` 的合并器源码加同一份字段表与 `editBody(edit, keepId)` 提层。**用户看到的**：跑中加进来的要求不再因为「少一层大括号」被扔掉；缺内容仍然拒，但会点名缺哪一个。**块内门禁**：`tsc` `TSC_EXIT=0`、`oxlint 15 warnings / 0 errors / 184 files`、定向 7 份 spec **`98 passed`**、六份文档守卫 **`82 passed`**、`npm run build` `client bundle: 348559 bytes`；**红有记录**：`git stash push -- src` 退回基线只跑这份 spec → **`3 failed / 21 passed`**（`red-before-fix.out`）。**全量 `npm run ci` `NOT_RUN`**（§12）。**真机（隔离档案 `replan-clone` 克隆自 live web、`DSH_HOME=.tmp/soak/dsh-home`、端口 3413、live 3080 全程没碰、真模型 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`）**：装本轮 tgz（`sha256 f4a9a0f7…eed22`，`lib/script.js` `2f37be12…f7bdb`、`lib/replan.js` `db776e66…f7f73` 与工作树逐字节相同），headless Chromium + 上一轮那份 CDP 驱动跑「三波数行数」并按 **Ctrl+Enter** 插话：根会话 `tool/call` seq 19 与 `spliced`（target `next-step`）seq 33 之间没有 `tool/result`，边界子 `grok_replan_intents` 返回非空（`atMs` 与 splice 差 1 ms），**它的 `structured_output` 这一次是 `{"action":"apply","edits":[{"action":"add","task":{…五个必填字段…,"dependsOn":["count-changelog"]}}]}`**（真 id，不是编的 `changelog_count`），下一道边界子的提示词读作 **`CURRENT PLAN VERSION: 2`** 且 `wave 4` 出现 `task-4`，报告 `4 task(s); 4 verified`、`Wave 4/4: - task-4: verified`；那条被并进去的话仍按普通一轮被回答（`4287 − 396 = 3891`）。**一条观察照实记（不是本轮改的）**：提示词里 `SETTLED TASKS` 每行读作 `- count-agents [undefined] `——脚本传的是 `statuses`（`Record<id, status>` 字符串），而 `replanPrompt` 按 `row.status` / `row.task.title` 读，边界子因此看不到已沉淀任务的状态与标题；留给下一块。**红线**：`~/.dsh`（`2026-11-25 23:14:14`）、`profiles`（`2026-11-22 16:59:46`）、`profiles/web` 与 `cordis.patch.yml`（`2026-11-25 23:04:40`）、`.credentials.yaml`（`2026-11-14 22:47`）mtime 全在本会话之前，写探测 `Read-only file system`，3080 前后 401；scratch **273 MB** 用完整棵删除；证据 `.rsi/evidence/replan-shape-2026-11-26/`。）

Last updated: 2026-11-26 02:47 +08:00（**`0.13.42` 已发布**——发版轮，也是「跑中插话」这条线的收尾轮；**这一版没有任何代码改动**：门禁提交 `651f3dd` 只把版本字面量从 `0.13.41` 抬到 `0.13.42`，功能本来就已经在 `main` 上，所以下面的「发布提交」= 8 个非测试文件的 `+22 −20`，`src/` 与 `lib/` 的 diff 只有 `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对字面量 `'0.13.41'` → `'0.13.42'`（两份 blob 同为 **`f2f427d`**，逐字相同）。**发布提交 `651f3dd`** `chore(release): prepare v0.13.42`，父提交 **`ec89b7c`**，`CHANGELOG.md`(+2)、`README.md`(5/5)、`README.zh-CN.md`(5/5)、`docs/LOCAL-TESTING.md`(3/3)、`lib/client.js`(2/2)、`package-lock.json`(2/2)、`package.json`(1/1)、`src/client/index.js`(2/2)；`package.json` 与 `package-lock.json` 现在都读 `0.13.42`；**`main` 是 `git merge --ff-only release/0.13.42` 前进的**，所以 **`main` = `origin/main` = `651f3dd`**、没有第二个合并提交（本地 `release/0.13.42` 已用 `git branch -d` 删掉，`git branch -vv` 只报 `Deleted branch release/0.13.42 (was 651f3dd)`）；**标签 `v0.13.42`** 是附注标签，对象 **`98b9c458de07458f474ff25aa649347bba339c51`**、剥出 `651f3dd`、`tagger` 时刻 **2026-11-26 02:40:16 +0800**（`1795632016 +0800`），**没有 force-push、没有移动任何已发布标签**（`v0.13.41` 对象仍是 `96dd9cc`）；**发版门禁 `TMPDIR=$PWD/.tmp npm run ci` 在 `651f3dd` 的干净树上 `GATE_EXIT=0`**——**这一份转录自带退出码**（`gate-651f3dd.out` 第 396 行就是 `GATE_EXIT=0`、`grep -nE 'FAIL'` 0 命中），补上了 0.13.41 缺的那一格：`Found 15 warnings and 0 errors.` / `Finished in 99ms on 184 files with 96 rules`、`client bundle: 348559 bytes → lib/client.js`、`lib/ at 651f3dd is the build of src/ at 651f3dd (289 files, byte-identical)`、**`Test Files 103 passed (103)` / `Tests 1941 passed (1941)`**、`Duration 100.30s (transform 3.42s, setup 0ms, import 9.63s, tests 78.10s, environment 11ms)`、`Start at 02:38:20`，转录 **396 行 / 23895 字节**、`sha256 5f5dfc4315a9b372b406a816671dff5c9e8d691ea5002a209bcddfff02427f95`（本轮自己 `wc -lc` + `sha256sum` + `tail -1` 各读一次）；**算术本轮自己从 git 对象数过**：spec 文件 `a64a50a` **102** → `ec89b7c` **103** → `651f3dd` **103**，静态 `it(` **`1852` → `1866`**，**+14 全在新增的 `test/steering-inbox.spec.ts`**（`git grep -c` 该文件 = 14），参数化差额仍是同一个 **+75**（口径沿用 0.13.41 那一轮逐文件量到的五个文件，本轮只做总数验算），于是 `1866 + 75 = 1941` 与门禁同值 ✔、`1852 + 75 = 1927` 与 0.13.41 门禁同值 ✔；**那 +14 随功能走、不随发版提交走**——`git diff --stat ec89b7c..651f3dd` 里没有任何 `test/` 文件；**两个 run 本轮用 `gh` 重读**——Release run **`45677540409`**（`headBranch v0.13.42`、sha `651f3dd`、**success**，单 job `Validate and publish v0.13.42` `18:40:28Z → 18:41:39Z` 约 **71 秒**、非 success 步骤 0 个）与 `main` 的 CI run **`45677532418`**（sha `651f3dd`、**success**）；GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.42 名字 `Grok Workflow for DSH v0.13.42`、`publishedAt 2026-11-25T18:41:34Z`、非 draft / 非 prerelease、target `main`、唯一资产 **`dsh-grok-workflow-0.13.42.tgz` = 980976 字节**（`digest sha256:e6efe5eefbc17e225308ca32a87a5df723ddc065e264764451e4919759f714c5`），上一版 `0.13.41` = 976529 → **+4447**；**`CHANGELOG.md` 的形状**是 `## [Unreleased]` 空着、紧跟新的 `## [0.13.42] - 2026-11-26`，那条已经写好的「跑中插话」条目（英、中两半 + 升级说明）挂在它下面、**正文一字未改**（发布提交对它只有 +2），两份 README 的已发布清单尾巴读作英文「`v0.13.40`, `v0.13.41` and `v0.13.42`」/ 中文「、`v0.13.41`、`v0.13.42`」；**清理**：`git worktree list` 只剩主检出一处（`[main]`，门禁跑在主检出，没有 `.tmp/wt-release-*`）、**本地 `release/0.13.42` 已用 `git branch -d` 删除**（`was 651f3dd`）、两处空目录 `.agents/worktrees/feat` 与 `.worktrees/` 用 `rmdir` 清掉（都不是注册过的 worktree——`.worktrees/` 只在 `.git/info/exclude` 里、`.agents/worktrees/` 忽略自己的内容——所以没有动到任何被跟踪的东西），**刻意留着的是**三条 `backup/wip-2026-11-24-*` 与 `feat/audit-layer`，没删任何远端分支、没删任何 tag，`.gitignore`(modified) 与 `.rsi/evidence/progress-now/`(未跟踪) 是别人的遗留、没暂存没提交；**`BLOCKED` 一条，而且这一条就是下一个人欠的活**：`AGENTS.md` §13 的 live 档案升级**没做成**——本会话 `workspace-write`、`~/.dsh` 在工作区外，写探测 `: > ~/.dsh/.release-probe` 返回 `Read-only file system`，**没写、没重载、没重启** 3080 上的实例（本轮**没有重试**探测）；只读读数照实记：`~/.dsh` mtime `2026-11-25 23:14:14`、`~/.dsh/profiles` mtime `2026-11-22 16:59:46`、live 装着的插件仍读 **`0.13.39`**、依赖行是浮动的 `github:free6589/dsh-grok-workflow`（**没有标签固定**）——所以下一个人不只是升到新版，还要把那一行钉到 `#v0.13.42`；**历史褶皱一句话记清**：`ec89b7c` 是合并，它的第二父 `1243ca7` 本身又是把 `4584b8d` 并进功能尖端 `f809728` 的合并，功能分支与 `main` 互并留了一对多余的合并，什么都没丢（`git diff --stat 4584b8d..ec89b7c` = 37 文件 / +2284 −2）；**记忆提交只有一次**（`STATE` / `HANDOFF` / `VALIDATION` + 新证据目录 `README.md`），**`DECISIONS.md` 一个字没改**（发布本身不是产品决定），本轮**没跑门禁、没跑 npm、没碰 `src/` / `test/` / `lib/`**，读到的每个数都能在 `.rsi/evidence/release-0.13.42-2026-11-26/README.md` 里回指到一条命令。）

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 02:45 的 **`feat/inbox-steering`** 那一轮——**它那句「未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.41`」已经被本轮推翻**：那个功能已经并进 `main`（`96ef27e` + `f809728`，合并 `1243ca7` / `ec89b7c`）并随 `0.13.42` 发布；它写「分支从 `4584b8d` 开出」仍然对，那个 `4584b8d` 就是 `main` 当时的尖端。再往下是 01:35 的 `fix/steering-reconnect` 那一轮（同样写着未合 main / 未发版，也已被取代）、00:47 的 `0.13.40` 发版收口，等等。凡这几条里写「版本仍 `0.13.4x`」「未发版」的地方，都按本轮读：**版本是 `0.13.42`，已发布**。）

Last updated: 2026-11-26 02:45 +08:00（**`feat/inbox-steering` 上，跑中插话终于有了活的入口——探针在真机上证明宿主的 `agent/inbox/inserted` 在工具调用跑着的时候就发，插件据此把话排进那次运行的队列；未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.41`**：分支从 `main` 尖端 **`4584b8d`** 开出（worktree `.worktrees/feat-inbox-steering`）；改动面 **1 个新 `src/` 文件 + `src/index.ts` 挂载 + 1 份新 spec + 重建 `lib/` + `CHANGELOG` 一条 + `D-162`**：`src/steering-inbox.ts` 订事件、按白名单只认真人一句话、按会话入队、返回 disposer；`src/index.ts` 用 `ctx.effect()` 挂载；`test/steering-inbox.spec.ts` **14 例**（10 条订阅器 + 2 条寿命 + 2 条接线，含 `replan` 开/关两向显式断言）。**用户看到的**：跑着的时候打一句话（Ctrl+Enter 插话），这句话现在真的会走到波边界的拉取工具、被交给边界规划子代理；这句话**仍然按普通一轮被回复**（两处都会出现，`CHANGELOG` 写明了）。**块内门禁**：`tsc` `EXIT=0`、`oxlint 15 warnings / 0 errors / 184 files`、定向 6 份 spec **`100 passed`**、`npm run build` `client bundle: 348559 bytes`；**红有记录**：把 `installSteeringInbox` 换成空实现 → 新 spec **`14 failed`**；**全量 `npm run ci` `NOT_RUN`**（§12）；**真机（隔离档案、真模型、端口 3461，live 3080 全程没碰）**：装本轮 tgz（`lib/steering-inbox.js` `sha256 8dbce218…685b` 与工作树逐字节相同），一次三波运行里跑中打话并按 Ctrl+Enter → 根会话 `tool/call`(seq 18) 与 `spliced next-step`(seq 29) 之间没有 `tool/result`、探针同毫秒记到 `inserted`，边界子 `grok_replan_intents`（token `steer-mwwg8rzu-1`）**返回非空**（`{"intents":[{"id":"steer-mwwg8rzu-1-1",…,”atMs":1795630888586}],"dropped":0}`）——**投递链通了**；**但计划没被改**：边界子的 `apply` 编辑没带 `task` 体，被既有规则拒（与本轮改动无关），运行本身 `COMPLETED`（3 任务/3 波全 verified），那条要求随后按普通一轮被回答（02:26 给出 `4263 − 396 = 3867`）；**这一轮证明的是投递，不是合并成功**；**红线**：`~/.dsh`、`profiles`、`profiles/web`、`cordis.patch.yml`、`.credentials.yaml` 的 mtime 全在本会话之前，写探测 `Read-only file system`，3080 前后 401；scratch 293 MB 用完删除；证据 `.rsi/evidence/inbox-steering-2026-11-26/`。）

Last updated: 2026-11-26 01:35 +08:00（**`fix/steering-reconnect` 上，跑中插话的接线接回去了——未合 `main`、未 push、未打 tag、未发版，版本仍 `0.13.40`**：分支从 `main` 尖端 **`237cf2d`** 开出、**一颗产品提交** **`a4753fe`** `fix(steering): a run opens its own live channel again`（`src/steering.ts` 加回 `closeSteering` 并新增 `mintSteeringToken`、`src/run.ts` 用 `steering?: { sessionId }` 自己开队列/传令牌/`finally` 关、`src/index.ts` 把"哪个会话"传进去、`src/config.ts` 与 `src/types.ts` 三条过时注释订正、`test/replan.spec.ts` +4、重建 `lib/`、`CHANGELOG` 一条）；**用户看到的**：跑起来的每一轮又有自己的活通道了——边界规划子代理拿得到令牌、`grok_steer` 排进来的要求能在下个波边界并入，队列随运行关闭；`replan` 关掉仍然没有通道，调用方不传会话也没有通道（payload 逐字节不变）；**块内门禁**：`tsc` `EXIT=0`、`oxlint 15 warnings / 0 errors / 182 files`、定向 6 份 spec **`98 passed`**、`npm run build` `client bundle: 348559 bytes`、`verify:lib` 在 `a4753fe` 上 `285 files, byte-identical`，转录 `.rsi/evidence/steering-reconnect-2026-11-26/gate-*.out`；**红有记录**：把 `src/` 退回 `main` 只跑新 spec 得 **`2 failed / 19 passed`**（`red-before-fix.out`）；**全量 `npm run ci` `NOT_RUN`**（`AGENTS.md` §12，留给发版提交）；**真机（隔离档案、真模型、端口 3399，live 3080 全程没碰）**：复制 live web 档案装本轮 tgz（`lib/steering.js` `sha256 a6c10bbc…0179` 与工作树逐字节相同、版本读回 `0.13.40`），一次真模型运行里进度行出现 **`规划（第2次）` `规划 · 波 1 边界`** 与 **`规划（第3次）` `规划 · 波 2 边界`**，两个边界子各自在自己的 session 日志里记到 `grok_replan_intents` 且令牌是 **`steer-mwwe62zr-1`**——通道在真机上真的活了（修之前 `args` 里没有 `replan`，这两条腿根本不发生）；运行结束后 `grok_steer` 回「这一块现在没有在跑的 workflow」= 队列随 run 关掉；**那次运行本身 `FAILED`，原因是环境**：子代理沙箱里 `/home` 是只读挂载，`printf > .tmp/…` 报 `Read-only file system`，计划/波次/依赖/边界/汇总都跑完、只有文件没落地；**这一轮同时量到了它的边界**：运行中发出的消息被 GUI 排队（`Cmd/Ctrl+Enter 插话发送全部排队消息`），模型在这一轮结束后才看到它，所以**今天没有任何角色能在跑中调用 `grok_steer`**——`grok_workflow` 是同步工具调用、子代理又被明令禁止调用它；这一条写进 `D-161` 的 Consequences，下一块二选一（拿回宿主侧消息入口 / 允许调度子代理跑 workflow 并把通道键到根会话），本轮**不假装跑中并入成功**；**红线**：`~/.dsh`、`~/.dsh/profiles`、`profiles/web` 与 `cordis.patch.yml`、`.credentials.yaml` 的 mtime 全在本会话之前，写探测 `Read-only file system`，3080 前后都 401；scratch 档案（105 MB + 97 MB 档案副本）用完删除；`DECISIONS.md` 只加 `D-161` 一条。）

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 00:47 的 **`0.13.40` 发版收口**——发布提交 `3778822`、附注标签 `v0.13.40`、两个远端 run 与 Release 资产都在，live 档案升级仍 `BLOCKED`；再往下是 00:25 的合流轮、00:10 的流程图那一轮、2026-11-25 23:00 的汇总结论三态那一轮。那几条里凡是写「`main` 尖端 = `3778822`」的地方，本轮读到的 `main` 尖端是 **`237cf2d`**（发版后又落了一颗 docs 提交）。）

Last updated: 2026-11-26 00:47 +08:00（**`0.13.40` 已发布**——发版轮，也是这条发布分支的收尾轮；上一轮（00:25）只到合流，这一轮把它送出去并收了口：**发布提交 `3778822`** `chore(release): prepare v0.13.40`，**8 文件 / +37 −39**（`CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`docs/LOCAL-TESTING.md`、`lib/client.js`、`package-lock.json`、`package.json`、`src/client/index.js`；`src/` 与 `lib/` 的 diff 只有 `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对字面量 `'0.13.39'` → `'0.13.40'`，两份 blob 同为 `6e8def2 → cf19891`），父提交 `aaf8dfb`，`main` 是 `git merge --ff-only release/0.13.40` 前进的，所以 **`main` 尖端 = 门禁提交 = 标签剥出的提交 = `3778822`**（`git rev-parse main origin/main` 同值）；**标签 `v0.13.40`** 是附注标签，对象 **`14fef642e0de26fa3ca030cdb6dc467067f2b556`**、剥出 `3778822`、`tagger` 时刻 **2026-11-26 00:37:54 +0800**（`1795624674 +0800`），**没有 force-push、没有移动任何已发布标签**（`git ls-remote --tags origin` 本轮重读：`v0.13.37 → 34236f0`、`v0.13.38 → 8c9b028`、`v0.13.39 → 18e5463`、`v0.13.40 → 3778822`，对象 `235fa3e` / `2f3e548` / `87a0e0e` / `14fef64` 各一行）；**两个 run 本轮用 `gh run view` 重读过**——Release run **`45656018189`**（`headBranch=v0.13.40`、sha `3778822`、**success**，job `Validate and publish v0.13.40`；派单记录 `gh run watch --exit-status` 退出 0）与 `main` 的 CI run **`45656011963`**（sha `3778822`、**success**）；GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.40 名字 `Grok Workflow for DSH v0.13.40`、`publishedAt 2026-11-25T16:39:37Z`、非 draft / 非 prerelease、target `main`、正文 **49 行**、唯一资产 **`dsh-grok-workflow-0.13.40.tgz` = 973840 字节**（上一版 `0.13.39` = 962715，**+11125**），`gh` 报的摘要 `sha256:c42c9924…533833`；**发版门禁 `TMPDIR=$PWD/.tmp npm run ci` 在 `3778822` 上 `EXIT=0`**：`Found 15 warnings and 0 errors.` / `Finished in 55ms on 182 files with 96 rules`、`client bundle: 348559 bytes → lib/client.js`、`lib/ at 3778822 is the build of src/ at 3778822 (285 files, byte-identical)`、**`Test Files 102 passed (102)` / `Tests 1923 passed (1923)`**、`Duration 95.59s`（runner `v4.1.12`），转录归档在 **`.rsi/evidence/release-0.13.40-2026-11-26/gate-3778822.out`**（**22990 字节**、`sha256 3faf97bd9b5438c68fe09bf137d0f45b992eaf2b8d956ed203f3a1cc0728382e`，本轮自己 `sha256sum` + `wc -c` 各读一次）；**算术本轮自己从 git 对象数过、与门禁对得上**：spec 文件 `db24351` **102** → `3778822` **102**（`progress-layout.spec.ts` 删除、`progress-flow.spec.ts` 新增，一换一），静态 `it(` **1828 → 1848**（带词边界的 `git grep -h -c -E '(^|[^A-Za-z0-9_.$])it\('`，不加边界会被 `wait(` / `submit(` 骗到 1981 / 2000），参数化与循环固定补 **+75**（只有 5 个文件运行时多于静态：`block-preview 39→93`、`block-flag-baseline 7→14`、`objective-limit 6→12`、`fallback-shards 12→16`、`waves 24→28`，其余 97 个相等、没有一个反向），于是推得 `db24351` **1903**（**推的，`HYPOTHESIS`，那一格没有门禁转录**）与 `3778822` **1923**（**实测，与门禁第 381 行同值** ✔）；逐文件 `client 142→151 (+9)`、`progress-tab 57→72 (+15)`、`hint-absent 8→7 (−1)`、`layout 20→删除 (−20)`、`flow 新增 (+17)`，`9+15−1−20+17 = +20`，与两处总数增量同值；**合流口径（上一轮拍板）在这一版里落地并被点检过**——`src/progress-tab.ts:1182` 的 `ProgressFlowRejected {drafts, stage:'check'|'verify', reason}`、`:1209` 的 `ProgressFlowNode.rejected?`、`src/client/index.js` 的 `progressRejectedLines()`（`:4250`，三行 `li.gw-progress-node-rejected[data-gw-progress-node-rejected="drafts|stage|reason"]`，只用 `--dsw-alias-label-secondary` / `--dsw-alias-state-warn-primary` 两个既有 token、**这两行没有字面色值**）、中英各三条文案含新增 `progress.final.rejectedStage`（`:384` / `:618`），`gw-progress-final-rejected` 在 `src/` + `lib/` 里 **0 命中**（那张交卷卡与新钩子确实不再存在）；**口径要写精确**：退场的是 `ProgressStory` 与 `deriveProgressStory`，**`ProgressStoryState` 这个五态联合类型名还在**（它只是词表）；`CHANGELOG` 的 `## [0.13.40]` 里**没有**布局细化（`D-157`）那一条——`db24351` 的 `[Unreleased]` 有、`3778822` 的 `[0.13.40]` 里 `grep -c D-157` = **0**，因为那个中间布局在同一个发布里就被流程图取代、从未发布，原文留在 git 历史（`db24351` / `60d1a35`）与 `D-157` 里；**清理本轮实测**：`git worktree list` 只剩主检出、`ls -d .tmp/wt-*` 无命中 → `.tmp/wt-release-0.13.40` 与 `.tmp/wt-progress-flowchart` 都已删除，`git branch` 只剩 `* main` → 本地 `release/0.13.40`（was `3778822`）与 `feat/progress-flowchart`（was `60d1a35`）都已 `-d` 删掉；**`BLOCKED` 一条**：`AGENTS.md` §13 的 live 档案升级**没做成**——本会话 `workspace-write`、`~/.dsh` 在工作区外，写探测 `: > ~/.dsh/.merge-probe` 返回 `Read-only file system`（派单记录；本轮**没有重跑**这个探测，也不写 `~/.dsh`），**没写、没重载、没重启 3080 上的实例**，live 档案现读回哪一版本轮**没读**（`NOT_RUN`）；**`NOT_RUN` 两条照实写**：① 这一轮没做真机 soak（派单只要求 typecheck + lint + 改到的 spec，流程图本身由 `feat/progress-flowchart` 那一轮的真机读数覆盖）；② **「每一稿都被退回」那张琥珀节点在真机上仍然没人见过**——上一轮只见过通过态，这一轮没上真机，它只有组件与模型用例覆盖；**本轮没碰的两处遗留**：`.gitignore` 是 modified、`.rsi/evidence/progress-now/` 是未跟踪，都属别的会话，未暂存、未提交；**记忆提交只有一次**（`STATE` / `HANDOFF` / `VALIDATION` + 新证据目录 `README.md`），**`DECISIONS.md` 一个字没改**——`D-158` 下面那条「现状（合流后补记）」已经把「卡片退场、事实由汇总节点承载」写清了，重复写就是噪声；本轮**没有编造任何读数**，推导值单独标了 `HYPOTHESIS`。）

（以下为本轮之前的记录，原样保留、一字未改：紧接下面是 2026-11-26 00:25 的**合流轮**——它在 `release/0.13.40` 上把 `feat/progress-flowchart` 与 `main` 侧的 `fix/synth-outcome` 两轮内容并进同一条发布分支、解掉 16 文件冲突里的六个文档，当时门禁仍是 `NOT_RUN`、版本仍 `0.13.39`；再往下是 00:10 的流程图那一轮，以及 2026-11-25 23:00 的汇总结论三态那一轮。这三条里凡是写「未合 main / 未 push / 未发版 / 版本仍 0.13.39」的地方，都已被本轮取代。）

Last updated: 2026-11-26 00:25 +08:00（**`release/0.13.40` 合流轮：`feat/progress-flowchart`（进度页流程图）与 `main` 侧的 `fix/synth-outcome`（汇总结论三态）两轮内容并进同一条发布分支——16 文件冲突，代码与测试那半由 `builder` 解，六个文档由本轮解掉；**门禁、`typecheck`、`lint`、真机一律 `NOT_RUN`，没有 `git add` / `commit` / `stash`，没有 bump（版本仍 `0.13.39`）、没有 push、没有打 tag**：分支从 `main` 的 **`db24351`** 开出；**拍板口径**是操作者给的——**「全部被拒」= 流程图上的「汇总」节点转琥珀，理由挂在它展开的调用里，不另开卡片**，所以交卷卡这个界面元素不再存在，而「每一稿都被退回」这个事实仍然可见；**编号重排**：`main` 先占了 `D-158`（汇总结论用「标记 + 独立事件 + 三态卡片」表达），`feat` 那两条从 `D-158` / `D-159` 重排为 **`D-159`（流程图）** 与 **`D-160`（四区版退场）**，按时间排在 `D-158` 之后，`D-158` 里那段三态卡片描述**保留为历史记录**、旁边补一句现状（那张卡在同一个发布的流程图改造里退场，退回的事实改由汇总节点承载）；**六个文档各解成什么**：`CHANGELOG` 的 `[Unreleased]` 两轮条目都在，`feat` 那条原文保留，`main` 那条「交卷卡片会说清为什么没交卷」按新界面改写成「汇总节点转琥珀 + 理由在它展开的调用行里」；`DECISIONS` 三条按编号排（`D-158` 汇总结论 / `D-159` 流程图 / `D-160` 四区版退场）；`DESIGN-progress-tab.md` 的契约**以流程图那一版为主体（§21）**，`main` 侧关于汇总结论与退回的事实并成 **§22** 并改成节点口径（§22.1–§22.3 是既有的 `CONFIRMED` 事实链，§22.4–§22.5 的界面出口是合流口径，验证留给合流后的门禁与真机）；`VALIDATION` 与 `HANDOFF` 两轮记录都在、新的在上；**一个数字都没有重算**；**两处读数并存，待下一轮复核**——`DECISIONS` 流程图那条记的「六个 spec 256 条 / `progress-flow` 15」是 `e998a00`（连线修复之前）那棵树的读数，`VALIDATION` 与 `HANDOFF` 记的「258 / 17」是 `1eb7888`（修复之后）那棵树的读数，两处都照原文留着。本轮**没有编造任何读数，也没有把没跑过的命令写成跑过**。）

（以下为本轮之前的两条记录，原样保留、一字未改：先是 `feat/progress-flowchart` 的流程图那一轮（2026-11-26 00:10），它的基线带着四区版——`feat/progress-layout-detail` 那条分支从未合入 `main`，而 `main` 尖端 `57dcf04` 已经是它的合流提交；再往下是 `main` 侧 `fix/synth-outcome` 的汇总结论三态那一轮（2026-11-25 23:00）。这两条里若提到流程图与四区版退场的决定，号按本轮重排后读：流程图是 `D-159`、四区版退场是 `D-160`。）

Last updated: 2026-11-26 00:10 +08:00（**`feat/progress-flowchart` 上，进度页从四区版改回一张可视化流程图——未合 `main`、未 push、未打 tag、未发版**：分支从 `main` 尖端 **`57dcf04`** 长出，**两颗产品提交**——`e998a00` `feat(progress): the page is one flow chart — every step a node, the current one lit, the rest counted`（模型 + 镜像 + 渲染 + 样式 + 五个 spec + 证据）、`1eb7888` `fix(progress): a node that opens its calls keeps the wire to its neighbour`（真机上量出来的连线缺陷：一开节点就比邻居高，判「同一行」用的是中线距离，于是同一行相邻的那条线被判成折行而不画，1500 px 只画出 4/6 条），本文件与后面的记忆是第三颗；**产品面动了两处**：`src/progress-tab.ts`（新增 `deriveProgressFlow`，删掉整块故事模型）与 `src/client/index.js`（浏览器包镜像 + 流程图渲染 + 全线重写的进度页样式 + 文案增删），`lib/` 是它们的构建产物（`341814` 字节，与 `src/client/index.js` 逐字节相同，`sha256 5300934e…4087c2`）；**用户看到的一件事**：进度页就是一张图——从 `起点` 到 `终点`，这次运行真的记录过的每条腿一个节点（`规划`/`执行`/`检查`/`复核`/`汇总`），去过的腿每去一次各占一个节点并写「第 N 次」「第 N 稿」，过了的绿、正在做的那颗亮着、还没到的灰着虚线、断过的琥珀；每个节点下挂它自己的调用，按一下才展开（`时刻 门词 任务名 结果词 [打开子会话]`）；底下只有一行「还剩 N 步 / 共 M 步」；**页面上没有一句说明文字**；720 px 以下竖排；节点之间的线是渲染后**实测**的，同一行画横线、竖排画竖线、**折行那一对不画**（画了就是主张一条读者看不见的路）；**跟着四区版退场的**：「现在」主标题、等分分段条、琥珀提示条、「后面还有」、步骤清单、「经过」及其折叠、「交卷」卡、两栏躯体、dock 下两句提示，连同 19 个文案键一起消失；**保住的**：运行名 + 五态胶囊、Guardian 那块（四块瓦片、钩子、词一字未改，只是不再占一列）、dock 两颗按钮与「只填框不代发」机制、行胶囊；**门禁**：`TMPDIR=$PWD/.tmp npm run ci` 在 **`e998a00`** 的干净树上 `EXIT=0`（`Found 15 warnings and 0 errors.`、`client bundle: 340995 bytes → lib/client.js`、`lib/ at e998a00 is the build of src/ at e998a00 (285 files, byte-identical)`、**`101 files / 1897 tests`**、`101.14s`），基线是本轮自己在独立 worktree `.tmp/wt-baseline`（`57dcf04`）上重跑的全套（`EXIT=0`、`347526` 字节、`101 files / 1884 tests`、`112.96s`）——注意这一遍 `verify:lib` 比对的是 `HEAD` 的 src 与 lib，所以**只有在提交之后跑才不是空证明**；`1eb7888` 那棵树上的定向复核是六份 spec **`258 passed`**、`typecheck` 退出 0、`oxlint 15 warnings / 0 errors`、`lib/client.js` 与 `src/client/index.js` 逐字节相同；**真机那半边跑过了**（隔离档案 `flow-clone` 从 live web 档案克隆、`DSH_HOME=.tmp/soak-flow/dsh-home`、端口 3373）：三态 **等你点头 11.66 s / 进行中 12.18 s / 已完成 131.65 s**，已完成页逐字读作 `起点 执行 检查 复核 汇总 第 1 稿 终点` / `还剩 0 步 / 共 6 步` / `收下这版`；开一颗节点 `aria-expanded` false → true、`node-calls` 0 → 1、行读作 `0:01 执行 任务 1 · 写 notes.md 安装步骤 做完 打开子会话`；四个宽度 1500/900/700/480 的 `scrollWidth === clientWidth` 全部成立，1500 一行 6 节点 5 条线、900 折成 `[4,2]` 且跨行那对没有线、700 与 480 竖排 5 条竖线；两侧控制台 `{"consoleErrors": [], "pageErrors": []}`；红线守住（`~/.dsh` 与 `~/.dsh/profiles` mtime 前后逐字相同、3080 前后都是 401、误跑的 `dsh web --help` 被 `EROFS` 拦住、scratch `.tmp/soak-flow/` 186 MB 整棵删除）；产物在 **`.rsi/evidence/progress-flowchart-2026-11-25/`**（含缺陷前后的两套几何读数，README 逐条注明出处）；**仍然 `NOT_RUN` 的五条**：`e998a00` 上的等你点头（那一版的窗口没赶上）、失败/取消两态真机截图、重启后打开旧会话（报 `no live session`，没有冒充读数）、点按钮后读输入框内容、与上一版布局的逐屏对照（按 `AGENTS.md` §12 不重跑基线）—

Last updated: 2026-11-25 23:00 +08:00（**`fix/synth-outcome` 上，汇总结论补上「全被退回 + 最后一次为什么不过」——未合 `main`、未 push、未打 tag、未发版**：分支从 `main` 的 **`57dcf04`** 长出、**四颗提交**（**`5388f22`** `fix(progress): record the all-rejected gate outcome, not just the shipped draft`——源码 + 重建的 `lib/` + 测试；**`4f395c7`** `docs(evidence): capture the summary-outcome red/green, gate and real-machine soak`——证据目录；紧随其后的 `docs(memory): record the all-rejected summary outcome and its evidence`——本文档与 `CHANGELOG`；最后一颗只改文字——把提交数与最终树门禁改准，见 `VALIDATION.md` 的「最终树门禁」一行。**后两颗在文档里不自指提交号**）；**此前只有「通过」被记录**：分层策略写 `check=fail verify=pass drafts=N` 不带理由、`model` 策略连标记都不写（只剩 `synthesis.error` 的一段散文），所以进度页对「这一轮没交卷」只能说那句 `progress.final.missing`。现在 **`synthesis.review` 带结论**——通过仍是 `check=pass verify=pass drafts=N`（**逐字未变**），退回变成 `check=fail verify=pass drafts=N reason=<一行>` / `check=pass verify=fail …`，理由经 `summaryReviewReason()` 控制字符→空格、空白折叠、`clip(…,300)`，**理由为空就不写 `reason=`**；`review === null`（一稿都没写出来）与「确定性叙述自己没过闸」照旧不写标记，**「一稿都没写出来」与「每一稿都被退回」是两个事实**；**读回**是 `src/report.ts` 新加的 `summaryGateOutcome(review)` → `{kind:'shipped',draft}` \| `{kind:'rejected',drafts,stage,reason}` \| `undefined`（`drafts<1`、两段同词、理由缺失或空白一律 `undefined`，理由取行尾剩余所以里面出现 `drafts=` 不会误判；`shippedSummaryDraft` 一字未改）；**台账行**通过仍 ` · final: draft N`、退回追加 ` · rejected: draft N (<stage>: <reason>)`，理由读解析值、另限 160 字——`synthesis.review` 在 schema 里是无上限 `string()`，长标记不会让报告非法；**事件**是新的 `tool-workflow/summary-rejected`（`{runId,drafts,stage,reason}`，与 `summary-final` 同规则：只写本 recorder 宣布过的 run、`drafts≥1`、stage 二选一、理由非空 ≤300、append 被拒就丢掉这个 run），与 `summary-final` **故意分开**——退回的运行没有 final 稿，硬塞进去就得让 `draft` 一会儿是「第几稿」一会儿是「几稿」；**跑、折、看三处一起改**：`src/run.ts` 完成路径与取消/保留路径各发一次（`shippedSummaryDraft` 的调用不变），fold 收进 `run.summaryRejected`（第一条有效声明胜出，坏载荷丢），`ProgressStory.final` 变成判别式 `{kind:'shipped',…} \| {kind:'rejected',drafts,stage,reason}`（**两种都在时通过优先**），浏览器镜像连重放与 `buildViewNode` 一起带（否则下一次 `run-end` 一重折就抹掉）；**卡片三态**：通过=今天的绿卡逐字（名字 +（定稿）+ 一个胶囊）、退回=琥珀块（`data-gw-progress-final-rejected` / `-drafts` / `-reason`，`data-state="failed"`，用既有 `--dsw-alias-state-warn-primary`，**没有字面色值**，没有名字/（定稿）/胶囊）、都没记录=`progress.final.missing` 原句；**文案只加两条**（`progress.final.rejected` 第 {n} 稿全被退回 / Every draft was rejected: {n}、`progress.final.rejectedReason` 最后不过：{reason} / Last failure: {reason}，中英两本字典与 `REDESIGN_COPY` 表逐字同步）；**门禁 `TMPDIR=$PWD/.tmp npm run ci` 跑了三遍、都是 `EXIT=0`**——代码树 `5388f22`（`gate-5388f22.out`）、证据提交 `4f395c7` 上的独立复核、以及**文档提交 `6d8a98f` 的最终树**（`gate-6d8a98f.out`，22235 字节）；三遍读数一致：`Found 15 warnings and 0 errors.`、`client bundle: 352002 bytes → lib/client.js`、`lib/ … (285 files, byte-identical)`、**`102 files / 1903 tests`**；`node scripts/verify-lib.mjs` 单独跑同句、exit 0；**算术**：基线 **`101 files / 1884 tests`**（`57dcf04`，本轮 22:04 实测）→ **`102 / 1903`**，即 **+1 文件 / +19 用例 / `lib/client.js` 347526 → 352002 字节（+4476）**——逐文件 `test/summary-outcome.spec.ts` 新增 **16**、`test/client.spec.ts` **+3**、`report.spec.ts` / `progress-tab.spec.ts` / `i18n-parity.spec.ts` 改写既有断言 **0 增**；**红的记录照实记**：`red-summary-outcome.out` 是**事后**用 `git stash push -- src` 把源码退回基点再跑出来的（写作顺序是**先实现、后断言**，不改写这个事实），另做一次 `git archive 57dcf04` 的基线整套跑（五个被改的 spec 一起）得 **`22 failed / 246 passed`、`5 files failed`**（`red-baseline-suite.out`）；**真机（隔离档案 `web-clone`、端口 3391）**跑了一次真实运行，完成页仍是**通过态**：`chip 未通过`（0/2 过，属实）、`final-section/final` 1/1、`final-name` `汇总·第1稿`、`final-mark` `（定稿）`、胶囊 1、`final-rejected`/`final-missing` **0/0**、历史末行 `22:28 汇总·第1稿 汇总 交卷`、控制台 `{"consoleErrors": [], "pageErrors": []}`；安装身份 tgz `849469e7…77ef60`、版本读回 `0.13.39`、`sha256(lib/client.js)` `f681b1d0…293bc7`；**`NOT_RUN` 的一条是「真机上的三稿全被退回」**——要在活模型上连续三次撞穿闸门，抖动大、烧额度，**没有人在真机上见过那张琥珀卡**；另一条是 `check=pass verify=fail` 的**写入端**没在活引擎上跑过（解析/渲染有用例，写入端复用既有的阶段三元表达式）；**红线**：`~/.dsh/profiles` mtime 未变（`2026-11-22 16:59:46`）、`profiles/web/cordis.patch.yml` 停在 `19:27:31`、3080 前后都 401、写探测 `: > ~/.dsh/.soak-write-probe` → `Read-only file system`、scratch 106 MB 整棵删除；**一条 observation 照实记（`HYPOTHESIS`，不是我们干的）**：`~/.dsh` 目录 mtime 在窗口内走到 `22:28:12`，`~/.dsh/profiles/web/package.json`（`22:06:12`）与 `node_modules`（`22:06:09`）也动过，**live 档案里装着的插件现在读回 `0.13.39`**（上一份已发布记忆写的是 `0.13.38`）——本会话写不进 `~/.dsh`（EROFS 已证），所以这是会话之外的进程做的，原因未查明）—

（以下为本轮之前的记录，原样保留：先是 **`feat/progress-layout-detail` 的布局细化**（两栏躯体 / Guardian 四块 / 任务行就地展开 / 经过折叠，`b0fbd20` → `d0c924a`，未合 main），它的内容一字未改；再往下是 `0.13.39` 发布收口、`0.13.38` 发布收口、未发版的 `fix-removed-keys-warn`、`0.13.37` 发布收口和更早的条目。）

Last updated: 2026-11-25 21:50 +08:00（**`feat/progress-layout-detail` 上，进度页的布局细化做完了——未合 `main`、未 push、未打 tag、未发版**：分支从 `main` 的 **`b0fbd20`** 长出、**5 颗提交**（`29291eb` `feat(progress): guardian moves to a right column as blocks, task rows open, history folds`、`331f181` `fix(progress): the opened row's lines sit in a real list`（详情容器 `div` → 真 `ol`，`li` 才有合法父节点）、`f14299c` `test(progress): pin the two-column layout, the guardian blocks, the row detail and the history fold`、`08018bf` `fix(progress): an opened row's line names its gate once`、`d0c924a` `test(progress): pin the opened line to one gate word`）；**产品面只动了浏览器包**——`src/progress-tab.ts`、fold、`src/records.ts`、事件集以及页面上每一个数字一个字没改，`lib/client.js` 与 `src/client/index.js` 在尖端是同一个 blob（`e14880c`，`347526` 字节）；**四条用户可见的事**：① **躯体分两栏**——步骤清单、「经过」、「交卷」在左列 `div.gw-progress-main`，Guardian 在右列 `aside.gw-progress-side`，**只有这次运行真的记录了 Guardian（`run.guardian.started === true`）才渲染 `div.gw-progress-columns`**，没有 Guardian 就三个 section 直接是页面的流（没有包裹层、没有空列），头部 / 「现在」 / 分段条 / 琥珀条 / 「后面还有」都在网格之上、dock 在网格之下；② **Guardian 由「标题 + 一条清单」变成四块瓦片**（`data-gw-progress-guardian-block` = `status` / `budget` / `count` / `findings`，两两一行、findings 横跨整行），**一个新词都没加**，四块里每个字都是既有的 `progress.guardian.*`；③ **每颗计划任务行就地展开自己的调用**——行里那颗 `button.gw-progress-plan-toggle`（序号 + 标题 + 可达的门，`aria-expanded` / `aria-controls` / `title` = 详情）只多一个「看的方式」，**行的可见文字逐字不变**，展开后 `ol.gw-progress-plan-detail` 挂在同一行里、一行一条该任务成员，**由历史行同一个渲染器（`ProgressLogRow` + `progressStoryLogRow()`）画出**，一行只说行头说不出的四件事——**时刻 · 门 · 结果 · [胶囊]**（链段 chip 顶替角色词、标题不再重印，角色点不到槽位时词留下），历史行一字不动、也不加胶囊；④ **「经过」超过 6 行（`PROGRESS_LOG_FOLD_AT = 6`）才出现一颗折叠按钮**，折叠态 `max-height: 264px; overflow-y: auto`、展开态解除上限，**一行都不丢、一行都不概括**，两个词各管一个方向（`progress.log.more` ↔ `progress.log.less`）；**文案只加三个键**（`progress.task.detail` 详情 / Detail、`progress.log.more` 展开全部 / Show all、`progress.log.less` 收起 / Collapse，中英两本字典与 `REDESIGN_COPY` 表同步），**没有第四句解释**；**门禁 `TMPDIR=$PWD/.tmp npm run ci` 在 `d0c924a` 的干净树上 `EXIT=0`**（`Found 15 warnings and 0 errors.`、`client bundle: 347526 bytes → lib/client.js`、`lib/ at d0c924a is the build of src/ at d0c924a (285 files, byte-identical)`、**`101 files / 1884 tests`**、`88.19s`；转录 `.rsi/evidence/progress-layout-detail-2026-11-25/gate-d0c924a.out` **22429 字节**、0 行 `FAIL`，包工头跑，记忆侧逐行核对；同一棵树本轮自己又跑了一遍 `npx vitest run`，也是 `101 files / 1884 tests`）；基线不是抄的，是**本轮自己在 `git archive b0fbd20` 的拷贝上重跑的全套**（**`100 files / 1855 tests`**、`lib/client.js` **334321** 字节、warnings **15**、`85.98s`），所以本分支 **+1 个 spec 文件 / +29 条用例 / +13205 字节**，逐文件 **`test/client.spec.ts 132 → 139`、`test/progress-hint-absent.spec.ts 6 → 8`、`test/i18n-parity.spec.ts 8 → 8`（表里多 3 行键，diff 4 行含 1 行注释）、新增 `test/progress-layout.spec.ts` 20**，而 `progress-tab` 57 与 `progress-connector` 11 一个没动（7 + 2 + 20 = 29，与总数对得上；此前口述的 `121 → 139` / `7 → 8` / `+27` 是 `f14299c` 那一版的旧读数，已被这两颗打磨提交取代）；**两处偏差照实记**——链段 chip 的 class 必须叫 `gw-progress-plan-chain` 而不是 `gw-progress-task-chain`（`test/progress-connector.spec.ts` 禁止已退役的 `gw-progress-task` 子串，身份靠 `data-gw-progress-task-chain` 钩子），行按钮的 `aria-controls` 指向一个只在展开时存在的元素（disclosure 允许，严格校验器会挑）；**没做的**：没合 `main`、没 push、没打 tag、没发版，**live 档案例行没碰**（`workspace-write` 策略 + `~/.dsh` 在工作区外 + 审批提示被禁用，写不进去；而且这一版没有可钉住的标签），真机那半边**已经跑过**：隔离档案（`.tmp/soak-layout/dsh-home`、`web-clone` 克隆自 live web 档案、端口 3371、视口 1500×1600）里，基线 `b0fbd20` 与本分支各装一次真包、各跑一次真实运行——基线 tgz `28c5d8b4…ff88b` / `sha256(lib/client.js)` `38702aa1…063fa6c` / 334321 字节，本分支 tgz `acf2476d…840d9` / `5745b15c…ced3a` / **347526** 字节；三态时刻 9.19 / 9.79 / **197.83 s** 对 15.84 / 16.22 / **170.00 s**；完成态钩子 **columns 0 → 1**、`main`/`side` 0/0 → 1/1、**guardian-block 0 → 4**、**plan-toggle 0 → 2**、**log-toggle 0 → 1**、`task-detail` 0 → 0（点开后 1）、`log-row` 9 → 8、`plan-row` 2 → 2；开一行读作 `21:38 执行 做完 打开子会话` / `21:38 检查 过了 打开子会话` / `21:38 复核 通过 打开子会话`；折叠 `展开全部 → 收起`、`data-expanded` false → true、`264px/auto → none/visible`；**1500 px 是 `957px 240px`、700 px 收成单轨 `693px` 且 Guardian 落到历史下面、`scrollWidth 700 = clientWidth 700`**；两侧控制台 `{"consoleErrors": [], "pageErrors": []}`；红线全程守住（`~/.dsh` 与 `~/.dsh/profiles` mtime 未变、`touch ~/.dsh/.soak-probe` → `Read-only file system`、3080 前后都是 401、scratch 140 MB 整棵删除）；**两条照实记**：等你点头那一瞬 `guardian 0` / `columns 0`（「有 Guardian 才有两栏」正好对上），完成页 8 条历史行且照样有折叠按钮（条数是这次运行自己的性质）；产物归档在 **`.rsi/evidence/progress-layout-detail-2026-11-25/`**（25 个文件 / 1.4 MB，`gate-d0c924a.out` 22429 字节、与本轮读的 `.tmp` 原件 `cmp` 逐字节相同、密钥扫描无命中）；仍然是 `NOT_RUN` 的只有四条——发送前的基线页面快照（空会话不挂载进度 Tab）、未通过 / 已取消两态（两次都 `completed`）、点按钮后读输入框内容（只验到存在与文案）、live 档案升级 / 重载 / 重启（红线））—

（以下为本轮之前的记录，原样保留：先是 **`0.13.39` 发布收口**（一个发布提交、一次门禁、快进 `main`、附注标签、Release 与资产都在、live 档案升级仍 `BLOCKED`），它的内容一字未改；再往下是 `0.13.38` 发布收口、未发版的 `fix-removed-keys-warn`、`0.13.37` 发布收口和更早的条目。）

Last updated: 2026-11-25 20:20 +08:00（**`0.13.39` 已发布**——发布轮，不是代码轮，而且**这一轮没有合流任何东西**：产品改动在发布之前就全在 `main` 上了（`8c9b028` → `ed287e1` 之间 **18 个提交**，其中 2 个 `merge:`、**16 个非合并提交**：进度页重画 `a3ed628`…`64b69af`、`9488890` / `ed287e1` 两条合并、`ff5c5ec` / `2d1b378` / `b1b73ac` / `601e2db` 四条文档），所以发布分支从 `ed287e1`（= `origin/main`，包版本 `0.13.38`）切出、**只带一个发布准备提交** **`18e546332a8c10c6de99ff344886e7fa77b3658c`** `chore(release): prepare v0.13.39`（**8 文件 / +33 −20**：`CHANGELOG.md` +13 −0、`README.md` 5/5、`README.zh-CN.md` 5/5、`docs/LOCAL-TESTING.md` 3/3、`lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、`src/client/index.js` 2/2；`src/` 与 `lib/` 的唯一改动是版本字面量那一对 `PLUGIN_VERSION` / `UPDATE_LATEST` `'0.13.38'` → `'0.13.39'`，**没有一行逻辑**，两份 diff 的 blob `4cbff67` → `30252a2` 同一个、即 `lib/client.js` 与 `src/client/index.js` 逐字相同）；**门禁只有一遍，就是发布门禁，`EXIT=0`**（`TMPDIR=$PWD/.tmp npm run ci` 在发布 worktree `.tmp/wt-release-0.13.39` 里、发布提交那棵树上，包工头跑，本轮**拷副本 + 逐行核对**而非重跑：`> dsh-grok-workflow@0.13.39 ci`、`Found 15 warnings and 0 errors.`、`client bundle: 334321 bytes → lib/client.js`、`lib/ at 18e5463 is the build of src/ at 18e5463 (285 files, byte-identical)`、`Test Files 100 passed (100)` / **`Tests 1855 passed (1855)`**、`Duration 90.16s`；转录 **22316 字节**、`sha256` **`aed6c3ef42ba4e16977a9bb91309d324c5dd8e797399792526ac8c69d9041b6f`**，副本与原件 `cmp` 逐字节相同）；`main` 用 `git merge --ff-only release/0.13.39` 前进，推送 `ed287e1..18e5463  main -> main`，所以 **`main` 尖端 = 门禁提交 = 标签剥出的提交 = `18e5463`**（远端 `refs/heads/main` 本轮实读同值）；标签 **`v0.13.39`** 是附注标签（对象 **`87a0e0e9a52e932d33584fc11434f63a74c87939`** → 剥出 `18e5463`，`tagger` 时刻 2026-11-25 20:13:13 +0800，`git show v0.13.39^{}:package.json` 读 `0.13.39`），**没有移动任何已发布标签、没有 force-push**（`v0.13.35^{}`→`ffbb6b0`、`v0.13.36^{}`→`26dc370`、`v0.13.37^{}`→`34236f0`、`v0.13.38^{}`→`8c9b028`，四条与上一轮记录逐字同值）；远端 Release 工作流 run **`45611695688`**（`headBranch=v0.13.39`、sha `18e5463`、**success**，job `Validate and publish v0.13.39` **1m26s**，含 `Create GitHub Release`）与 `main` 的 CI run **`45611690753`**（`headBranch=main`、sha `18e5463`、**success**）本轮都用 `gh run watch` / `gh run view` 重读过，GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.39 名字 `Grok Workflow for DSH v0.13.39`、发布 **`2026-11-25T12:14:50Z`**、非 draft / 非 prerelease、target `main`、唯一资产 **`dsh-grok-workflow-0.13.39.tgz` = 962715 字节**（上一版 958707，+4008），正文就是 `## [0.13.39] - 2026-11-25` 那一节（**42 行**）；**读者能自己算的算术**：spec 文件 **100 → 100**（本轮从 git 对象数，`git diff --name-status` 只有 6 个既有 spec 被改、零增零删），用例 **1870 → 1855（−15）**，`lib/client.js` **340426 → 334321** 字节（**−6105**），warnings 仍 **15**——**这 −15 / −6105 不是发布提交造成的**：重画证据 `.rsi/evidence/progress-redesign-2026-11-25/README.md` **第 41 行**在交付当时（`87f14e1`）就写着 `1855` / `334321`，同表基线 `ff5c5ec` 是 `1870` / `340426`，发布提交只是把它带出去；**唯一对用户有意义的改动**是进度页从六段脊椎变成**一页三态**（失败用琥珀不用红、两个批准按钮只填框不代发，`D-156`），`### Upgrade note / 升级须知` 明说**这次升级前不用准备任何东西**——没有键、schema、默认值或已存记录变化；**live 档案升级记 `BLOCKED`，只剩一条理由**：本会话文件策略 `workspace-write`、`~/.dsh` 在工作区之外、审批提示被禁用（不能申请提权），**从这里写不进去**，`mode: triage` 自 `0.13.38` 起**已不再是障碍**（被删键被忽略并点名，`D-155`）；只读实读 `grok-workflow` 那一行的 `config:` 下**仍写着 `mode: triage`**（第 563 行）、**已装版本读回 `0.13.38`**（`node -p` 与 `pnpm-lock.yaml` 两处互证：浮动依赖 `github:free6589/dsh-grok-workflow` 被解析到 `ed287e1` 的 tarball、`version: 0.13.38`——**即 live 档案现在跑的是发布前的那个 main 尖端，落后本版一版**，与派单口述的 `0.13.35` 不符，按实测记），`~/.dsh` size 1548 / mtime 1795362020、`~/.dsh/profiles` size 226 / mtime 1795337986 与上一轮记录同值——**未写、未重载、未重启**，3080 上的实例全程没碰）— 

（以下为本轮之前的记录，原样保留：先是 **`0.13.38` 发布收口**（零冲突合流、两次门禁、快进 `main`），它的内容一字未改；再往下是**未发版**的特性轮 `fix-removed-keys-warn`，以及 `0.13.37` 发布收口和更早的条目。）

Last updated: 2026-11-25 18:30 +08:00（**`0.13.38` 已发布**——发布轮，不是代码轮：`main` 尖端 **`c3d729f`** 上，特性分支 `fix-removed-keys-warn`（尖端 **`b6e8598`**，严格领先 **5 交付 / 0 落后**）在 worktree `.tmp/wt-release-0.13.38` 里真 `--no-ff` 折入，合并提交 **`8f8a463`** `merge: a leftover removed key is ignored and named, not fatal`，父提交 **`c3d729f` + `b6e8598`**、**零冲突**——合并树 **`63e3fa819b1f9439c62a21536eeb271668bcae02`** 等于 `b6e8598^{tree}`，`git diff --stat b6e8598 8f8a463` **空**；随后发布提交 **`8c9b028`** `chore(release): prepare v0.13.38`（**8 文件 / +22 −20**，树 **`2bc5d84529ee8a44bdaef54c1c58f548fa1fb29c`**；`src/` 与 `lib/` 的唯一改动是版本字面量那一对 `PLUGIN_VERSION` / `UPDATE_LATEST` `'0.13.37'` → `'0.13.38'`，**没有一行逻辑**）；**两次门禁都 `EXIT=0`**（`TMPDIR=$PWD/.tmp npm run ci` 在发布 worktree 里，包工头跑，两份转录本轮**逐行核对**而非重跑：`Found 15 warnings and 0 errors.`、`client bundle: 340426 bytes → lib/client.js`、`lib/ … (285 files, byte-identical)`、`Test Files 100 passed (100)` / **`Tests 1870 passed (1870)`**、`96.51s` / `94.56s`；**`8c9b028` 那一遍才是发布门禁**）；`main` 用 `git merge --ff-only release/0.13.38` 前进，推送 `c3d729f..8c9b028  main -> main`，远端 `refs/heads/main` 本轮实读 **`8c9b028`**；标签 **`v0.13.38`** 是附注标签（对象 **`2f3e548bcbc029c7e534ad52556058a09361eeef`** → 剥出 `8c9b028`，`git show v0.13.38^{}:package.json` 读 `0.13.38`），**没有移动任何已发布标签**（`v0.13.35^{}`→`ffbb6b0`、`v0.13.36^{}`→`26dc370`、`v0.13.37^{}`→`34236f0`，`git ls-remote --tags origin` 重读过）；远端 Release 工作流 run **`45594337910`** 与 `main` 的 CI run **`45594332536`** 都是 **success**、head sha `8c9b028`（`gh run view` 重读），GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.38 名字 `Grok Workflow for DSH v0.13.38`、发布 **`2026-11-25T10:23:49Z`**、非 draft / 非 prerelease、唯一资产 **`dsh-grok-workflow-0.13.38.tgz` = 958707 字节**，正文就是 `## [0.13.38] - 2026-11-25` 那一节（**35 行**）；**读者能自己算的算术**：spec 文件 **98 → 100**（本轮自己从 git 对象数：`git ls-tree -r --name-only <commit> -- test`，+2 就是 `test/config-removed-keys.spec.ts` 7 例 + `test/config-notices-route.spec.ts` 8 例），用例 **1849 → 1870（+21）**，`lib/client.js` **333611 → 340426** 字节（**+6815**），warnings 与基线同数仍 15；这一版唯一对用户有意义的改动就是 `D-155`——档案里残留的被删键（最常见 `mode: triage`）**不再让整行拒载**，改为忽略 + 点名，**所以上一轮升级须知的「先删那一行，再升级」这个前置条件从 `0.13.38` 起作废**；**live 档案升级记 `BLOCKED`，而且只剩一条理由**：本会话文件策略 `workspace-write`、`~/.dsh` 在工作区之外、审批提示被禁用（不能申请提权），**从这里写不进去**；只读实读 `grok-workflow` 那一行的 `config:` 下**仍写着 `mode: triage`**、已装版本读回 **`0.13.35`**、依赖仍是浮动的 `github:free6589/dsh-grok-workflow`（无标签），`~/.dsh` size 1548 / mtime 1795362020、`~/.dsh/profiles` size 226 / mtime 1795337986 与上一轮记录同值——**未写、未重载、未重启**，3080 上的实例全程没碰）— 

（以下为本轮之前的记录，原样保留：先是**未发版**的特性轮 `fix-removed-keys-warn`（它那句「未合 main、未 push、未打 tag、未发版」已被上面这一轮取代），再往下是 `0.13.37` 发布收口以及更早的条目。）

Last updated: 2026-11-25 18:12 +08:00（**`fix-removed-keys-warn` 分支上，`D-155` 把「被删键」从拒载改成忽略 + 点名：25 个键不再让整行不激活，载入日志点名一次、`resolveConfig` 不留任何值，未知键/拼错/非法值/越界数字照旧拒载；门禁 `EXIT=0`（`100 files / 1870 tests`、`15 warnings / 0 errors`、`client bundle: 340426 bytes`、`lib/ … (285 files, byte-identical)`）；隔离真机证明**档案留着 `mode: triage` 也照常激活**（`did not activate` 0 行、`describe` 24 个命名空间含 `grok-workflow`、`autoGenerate: true`），对照删掉那一行警告消失；**未合 main、未 push、未打 tag、未发版，版本仍 `0.13.37`**；设置页那条提示**本轮已可见**：新增插件自己的只读路由 `src/config-notices-surface.ts`（`GET /grok-workflow/config-notices`，清单读 per-load `Set`、只读不排空），页面挂载时读一次、非空渲染、失败静默；因为宿主 `describe` 的 `user` 层按 schema 投影，被删键根本不在其中——扫 `entry.user` 那版已废弃）— 

（以下为上一轮 **0.13.37 发布收口** 的记录，原样保留。）

分支 **`release/0.13.37`**（worktree `.tmp/wt-release-0.13.37`），从 `main` 尖端 **`d34214b`** 开出。**合流提交 `5c58afd`**
`merge: a session with no mode record no longer shows the switch as on`：真 `--no-ff` 合并，父提交 **`d34214b` + `9d234c2`**
（`fix/switch-default-state` 尖端），**零冲突**——特性分支严格领先于 `main`。身份证明：合并树 **`50d7eca335b182d548b8a8bdab02d3ba10dd4e00`**
等于 `fix/switch-default-state^{tree}`，且 `git diff --stat 9d234c2 5c58afd` 为空（本轮重跑过，空）。
**发布提交 `34236f0`** `chore(release): prepare v0.13.37`——**8 文件 / +38 −20**：`CHANGELOG.md` +18、`README.md` 5/5、
`README.zh-CN.md` 5/5、`docs/LOCAL-TESTING.md` 3/3、`lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、
`src/client/index.js` 2/2；树 **`71ffdb665bc6196e8b91c6bf3f455ad24cff8ee5`**。**`src/` 与 `lib/` 的改动只有版本字面量那一对，没有一行逻辑。**
**`main` 是 `git merge --ff-only release/0.13.37` 前进的，不是第二个合并提交**：所以 `main` 尖端**就是**跑门禁的那个提交、
也就是标签剥出来的那个；`git diff --stat release/0.13.37 main` 为空。推送 `d34214b..34236f0  main -> main`（`origin/main` 现读为 `34236f0`）。
**标签 `v0.13.37`** 是附注标签：标签对象 **`235fa3e3ab2b1f1f7815ba16b905d53c60da8d3f`** → 剥出提交 **`34236f0`**，
`git show v0.13.37^{}:package.json` 读 `0.13.37`；推送 `* [new tag] v0.13.37 -> v0.13.37`。**没有 force-push，也没有移动任何已发布标签**：
`v0.13.35` 仍剥到 `ffbb6b0`、`v0.13.36` 仍剥到 `26dc370`（`git ls-remote --tags origin`，本轮重读过）。
**门禁两次，都是 `TMPDIR=$PWD/.tmp npm run ci` 在发布 worktree 里跑（`CONFIRMED`，两份转录的逐字副本在
`.rsi/evidence/release-0.13.37-2026-11-25/`——`gate-merge-5c58afd.out` 与 `gate-release-34236f0.out`，原件随发布 worktree 收尾）**：`5c58afd` 上 `EXIT=0`、`Found 15 warnings and 0 errors.`、`client bundle: 333611 bytes → lib/client.js`、
`lib/ at 5c58afd is the build of src/ at 5c58afd (281 files, byte-identical)`、`Test Files 98 passed (98)` / **`Tests 1849 passed (1849)`**、
`Duration 85.82s`；`34236f0` 上（包工头自己跑的那一遍，**这一遍就是发布门禁**）同样 `EXIT=0`、`15 warnings / 0 errors`、`333611 bytes`、
`lib/ at 34236f0 is the build of src/ at 34236f0 (281 files, byte-identical)`、`98 files / 1849 tests`、
`Duration 88.35s (transform 1.91s, setup 0ms, import 7.44s, tests 69.46s, environment 11ms)`。
**读者能只靠 git 自己算的算术**：`d34214b` 与 `34236f0` 各有 **98 个 spec 文件**（一个没增、没删，改的是其中两个）；
`test/client.spec.ts` 的 `it(` **144 → 147**、`test/mode-surface.spec.ts` **24 → 25**，即 **+4 例**、**1845 → 1849**；
`lib/client.js` **331626 → 333611** 字节（特性分支的 +1985）；warnings 与基线同数，仍 15。**六个文档守卫**（发布准备块跑）：
`6 files / 80 tests` PASS（`update-entry 20`、`update-surface 29`、`docs-config-keys 14`、`docs-version 8`、`i18n-parity 6`、
`docs-architecture-version 3`）。
**用户拿到的四条（全部此前未发布）**：① 从没打过 `/grok` 的会话不再显示「开」——读 `Not on · not set yet` /「未开 · 还没设过」，
点一下真把这个会话打开（`{"action":"set","enabled":true}`）；路由、`/grok status` 与设置页仍报有效值，**两边可以显示不同的字，
这是故意的（`D-154`）**；② 限流（429）那个开关补上了设置页控件（`D-153`）；③ `/grok on` 说它真做的事；④ 设置页与两个 README
说这颗开关真做的事。**随包带走的升级须知**：**升级前删掉 `<档案>/cordis.patch.yml` 里残留的 `mode:` 与 `legacyGate:` 两行**——
任一行单独存在，插件那一行就拒绝激活，工作流随后从界面消失（设置与记录不丢）；须知中英双语，因为文件要求双语。
**发布面（`CONFIRMED`，本轮用 `gh` 重读过）**：Release 工作流 run **`45577666102`**（标签 `v0.13.37`、head sha `34236f0`、结论 success）
https://github.com/free6589/dsh-grok-workflow/actions/runs/45577666102 ；`main` 上的 CI run **`45577662548`**（head sha `34236f0`、结论 success）
https://github.com/free6589/dsh-grok-workflow/actions/runs/45577662548 。GitHub Release https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.37 ，
名字 `Grok Workflow for DSH v0.13.37`，发布 `2026-11-25T08:37:20Z`，target `main`，不是 draft、不是 prerelease，**唯一资产
`dsh-grok-workflow-0.13.37.tgz` = 947407 字节**；正文就是 `## [0.13.37] - 2026-11-25` 那一节，**30 行**。
**三条刻意偏差，照实记**：① **`main` 是快进、不是 `--no-ff` 合流**——于是 `main` 尖端与门禁提交、标签指向是同一个提交（上一轮 0.13.36
也是标签落在发布提交上）；特性分支的 `--no-ff` 折入仍在历史里（`5c58afd`），所以「功能是怎么进来的」有账可查。② **环境陷阱（合流块发现，
`CONFIRMED`）**：新开的发布 worktree 没有 `node_modules`，第一次门禁在 `verify:lib` 里炸
（`Cannot find module …/verify-lib-*/node_modules/typescript/bin/tsc`），而 `typecheck` 与 `lint` 是靠 PATH 借了父检出的
`node_modules/.bin` **悄悄过去**的；解法是给 worktree 自己一份 `npm ci --prefer-offline`，之后门禁的读数才算数。
**以后任何发布 worktree，先自己装依赖，再谈门禁有没有意义。** ③ `CHANGELOG.md` 的 `## [Unreleased]` 保留成**空标题**，
`## [0.13.37]` 插在 `## [0.13.36]` 之上、四条逐字搬过去（`CHANGELOG.md` 的 `+18 −0`，**零删除行**）；两个 README 的已发布标签清单是
**延伸**（加上 `v0.13.37`），不是替换。
**没做的，以及为什么（`BLOCKED`，不是失败）**：`AGENTS.md` §11 的 live 档案升级**没有执行**，两条独立的具体理由：
**(a)** live 档案 `/home/fish/.dsh/profiles/web/cordis.patch.yml` 的 `grok-workflow` 那一行下仍写着 `mode: triage`（**第 563 行**，
本轮自己读到；该文件**没有** `legacyGate` 行），而 `mode` 自 `0.13.35` 起就是被删的键——把 `0.13.37` 装上去会让那一行拒绝激活、
工作流从 UI 消失。**顺序必须是操作者先删那一行，再升级。** **(b)** 本会话文件策略是 `workspace-write`，`~/.dsh` 在工作区之外，
从这里连写都不可能。另：live 档案仍声明**浮动**依赖 `github:free6589/dsh-grok-workflow`（无标签），读回已装版本 **`0.13.35`**。
**live home 未写、未重载、未重启**，前后尺寸与 mtime 同值（`~/.dsh` size 1548 / mtime 1795362020；`~/.dsh/profiles` size 226 /
mtime 1795337986）。
**收尾卫生（按观察到的事实写，不按口述）**：派单说两个 worktree（`.tmp/wt-release-0.13.37`、`.tmp/wt-switch-default`）已删、
本地分支 `release/0.13.37` 与 `fix/switch-default-state` 已删；**本记录写下时 `git worktree list` 与 `git branch` 仍看到它们**
（`CONFIRMED`），上面那些门禁日志也还在前者的 `.tmp/` 里可读——清理动作留给下一位，别把它记成已经做过。
主检出剩下的唯一改动是与发布无关的 `.gitignore` 本地设计稿忽略规则，**从未被暂存**，也不在任何发布提交里。
**一处顺序走样，照实记一句**：`fix/switch-default-state` 那条 16:10 的条目在**文件最底下**，它比上面 15:32 那条更新——
这个文件的排序在那里出过一次序，**不改动、不搬动**，读者按时间找时自己留意。

Last updated: 2026-11-25 15:32 +08:00（**设置页「谁来干」卡里那个 429 开关补上了控件：`switchOnRateLimit` 之前是 14 个声明字段里唯一「有文案、有 schema、就是不画」的一个，现在有一行 `FieldRow` + `Toggle` + 提示段，位置在 Guardian 之后、五条角色链之前；默认值仍是 `on`，行为一个字没改，没加任何文案键、没动 schema、没动版本号 `0.13.36`，未 push、未发版** —
分支 **`fix/ratelimit-toggle`**，worktree `.tmp/wt-ratelimit-toggle`，基线 `main` 尖端 **`4def476`**。**代码与测试提交 `534b867`**
`feat(settings): the 429 switch gets a control — the last declared field without one`（**3 文件 / +141 −2**：`lib/client.js` 21/1、
`src/client/index.js` 21/1、`test/client.spec.ts` 99/0；`test/client.spec.ts` 的 `it(` 由 **140 → 144**），其后再一条**只放文档与证据**的提交。
**改了什么**：状态词复用页面已有的那一对 On/Off（`option.replan.on` / `option.replan.off`），**没有**新增 `option.switchOnRateLimit.*`——
页面每种语言已经有一份 On/Off，新增两条等于把同一句话写第二遍，而本轮规定不加文案键（`D-153`）；`GuardianModelRow` 的卡上补了一个
`data-field="guardianModel"`（原先只有 `data-gw-guardian`），否则「每个声明字段都必须有控件」那条总守卫对 14 个 key 走不全。
**门禁（包工头跑，`CONFIRMED`，`534b867` 这棵树）**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**：
`Found 15 warnings and 0 errors.`、`client bundle: 331626 bytes → lib/client.js`、
`lib/ at 534b867 is the build of src/ at 534b867 (281 files, byte-identical)`、`Test Files 98 passed (98)` / **`Tests 1845 passed (1845)`**、
`Duration 92.12s (transform 2.68s, setup 0ms, import 8.07s, tests 72.87s, environment 11ms)`。基线算术（包工头核过）：全量 **1845 − 4 = 1841**，
`Found 15 warnings` 与基线同数。**本轮记录者自己跑的定向四条**：`TMPDIR=$PWD/.tmp npx vitest run test/client.spec.ts test/i18n-parity.spec.ts
test/config.spec.ts test/settings-projection.spec.ts` → **EXIT=0，`4 files / 204 tests`**。
**构建体积**：`lib/client.js` **330313 → 331626 字节（+1313）**；重跑 `npm run build` 后 `git status` 仍干净，即提交里的产物就是提交里 `src/` 的构建。
**真机读数（隔离实例，`CONFIRMED`）**：`DSH_HOME` 用的是 `.tmp/soak-ratelimit/fresh-home`（profile `web-clone`），端口 **3327**，
`sha256(lib/client.js)` = **`f9408813d6312cecf1996a23245966ea7ce09a152a029f6d5311fe379f7f7ad0`**（与 worktree 逐字节相同，拷进 profile 不是软链）、
`sha256(lib/index.js)` = `d7db20f2…`、版本读回 **`0.13.36`**。英文行 `Switch model on 429` / `aria-checked="true"` / On，中文行
`限流（429）时换模型` / `aria-checked="false"` / 关，两语言提示文字与 `field.switchOnRateLimit.hint` 逐字一致；点开关后 `Save` 发出
`settings/mutate` → `ops=[{"op":"set","path":["switchOnRateLimit"],"value":false}]`，隔离 profile 的 `cordis.patch.yml` 出现
`switchOnRateLimit: false`；reload 后仍是关，`pageerror` 全程 **0** 条。**live `~/.dsh` 与 3080 上的实例全程未写、未重载**（包工头在 soak
前后各量一次：`~/.dsh` size **1548** / mtime **1795362020**，`~/.dsh/profiles/web/cordis.patch.yml` size **21606** / mtime **1795530213**，两次完全一致）。
**三条如实残留，都不掩盖**：**(a)** 派单要求克隆 live `web` 档案那一次（`clone-profile.mjs`，`files 7720 -> 7720`、`parity 5/5`、1 行凭据按设计脱敏），
`POST /api/settings/describe` **始终没有 `grok-workflow` 命名空间**（22 个），页面也没有请求插件的 client bundle，因而没有「Workflow」这一栏可打开；
改用 `--from-default-profile web` 新建隔离 profile 再 `dsh plugin add` 打进本构建后，同一个 `describe` 是 **23 个命名空间含它**
（`autoGenerate: true`），页面出现——**两条路的差别未查到根因，记 `HYPOTHESIS`，只写现象不写结论**，本轮真机读数全部来自后者。
**(b)** 模型回合 **`NOT_RUN`**：隔离 profile 按设计不带凭据，本轮也不需要。**(c)** `GuardianModelRow` 的卡上补 `data-field="guardianModel"`
（属 `src/client/index.js` 内一行属性 + 一段 docstring，已含在 `534b867`），理由见上；**(d)** 状态词复用 `option.replan.on/off`，没有新增文案键。
**这一轮的守卫**：`test/client.spec.ts` 新增四条（两语言的行与提示、按 `GROK_WORKFLOW_FIELDS` 全量遍历的「每个声明字段都有控件」总守卫、
一次点击写一条 `set` op、`aria-checked` 跟着存值走）；反向验证做过——把控件块临时摘掉重建后，`-t "429 switch"` 的两条与 `-t "declared field"`
的总守卫一起变红（`zh switchOnRateLimit has no row`），恢复后转绿。已有用例一条没改、一条没放宽。
**六个文档守卫（本轮自查）**：`TMPDIR=$PWD/.tmp npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts test/i18n-parity.spec.ts
test/docs-architecture-version.spec.ts test/update-entry.spec.ts test/update-surface.spec.ts` → **EXIT=0，6 files / 80 tests**
（`update-entry 20`、`update-surface 29`、`docs-config-keys 14`、`docs-version 8`、`i18n-parity 6`、`docs-architecture-version 3`）。
**文档守卫的基线是 80，不是 79**：79 是 `0.13.36` 发布轮的过期口径，那一轮 `docs-config-keys` 只有 13 例，设置文案那轮加了一条；
不要拿 79 去算漂移（出处：`4def476` 与当前树逐文件数 `it(` 都是 8/14/6/3/20/29）。

Last updated: 2026-11-25 12:33 +08:00（**`0.13.36` 已经发出去了：本地门禁跑绿（`Test Files 98 passed (98)` / `Tests 1839 passed (1839)` / `Found 15 warnings and 0 errors.`），`main` 与标签 `v0.13.36` 都推上去了，远端 Release 跑绿（run **`45547073752`**）、`main` 上的 CI 也绿（run **`45547060845`**），GitHub Release 已发布、唯一资产 `dsh-grok-workflow-0.13.36.tgz` **943206 字节**；**唯一没做的是本机 live 档案的自动升级**——档案里可能还留着 `mode:` 或 `legacyGate:` 两行，先删再升，否则那一行拒绝激活、工作流从界面消失，所以这一条记 **`BLOCKED`（等操作者动手），不是失败**；版本 `0.13.36`** —
分支 **`main`**，发布提交 **`26dc370`** `chore(release): prepare v0.13.36`（**8 文件 / +35 −30**），标签 **`v0.13.36`** 是附注标签，标签对象 **`0ff357b`**、剥出的提交正是 **`26dc370`**。
**发的是哪些字**：`package.json` 与 `package-lock.json` 的版本、`src/client/index.js` 里 `PLUGIN_VERSION` 与 `UPDATE_LATEST` 两行、`lib/client.js` 里同样那两行的重建、两个 README 的声明版本 / 两处安装固定点 / 正文里那个反引号版本 / 已发布标签清单（英文尾部是 `v0.13.34`, `v0.13.35` 与 `v0.13.36`；中文尾部是 `v0.13.34`、`v0.13.35`、`v0.13.36`）、`docs/LOCAL-TESTING.md` 三个 tarball 名（全部都是 `dsh-grok-workflow-0.13.36.tgz`）、以及 `CHANGELOG.md`。**`src/` 与 `lib/` 的改动只有那两行版本字面量，没有一行逻辑。**
**`CHANGELOG.md` 的形状（`CONFIRMED`，翻过文件）**：`## [Unreleased]` 保留成一个**空标题**，新段 `## [0.13.36] - 2026-11-25` 压在原有四个小节之上；其中 `### Upgrade note / 升级须知` **重写成点名两个键**——档案里残留一行 `mode:` **或** 残留一行 `legacyGate:`，**任一个单独存在**都会让 `grok-workflow` 那一行拒绝激活、症状是工作流从界面上消失，所以升级前**两行都要删**；设置与记录不丢；结尾写明「两行都没有就什么都不用做」与「我们**没有**替你改过任何档案」。
**合并不是这一轮做的**：`main` 尖端此前就已经是 **`2f71a95`**（`merge: refresh mounted switch after command writes record`，把 `8b32e5e` / `ded1df6` / `266006b` / `144a9a1` / `3366248` / `07b91d3` / `c5f40b7` / `bf337b4` 八条折进来），且与 `origin/main` 同点；主检出树与分支尖端 `bf337b4` 逐字节相同（`git diff --stat bf337b4 main` 为空）。**这一轮只是在它上面打了一个版本提交。**
**本地门禁（包工头在升版后的树上跑，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**：`Test Files 98 passed (98)` / **`Tests 1839 passed (1839)`**、
`Duration 97.12s (transform 2.37s, setup 0ms, import 7.78s, tests 78.51s, environment 10ms)`、**`Found 15 warnings and 0 errors.`**（与基线同数）、
`client bundle: 329354 bytes → lib/client.js`（与 0.13.35 那一轮同数——本轮只改版本字面量，体积不变是对的）。
**`verify:lib` 的两次读数如实记（这不是缺陷）**：它是**按提交**验的，不看工作树；所以门禁那一次打印的是 `lib/ at 2f71a95 …`——那一次验的是升版**之前**的提交。
提交之后包工头又单独跑了一次 `node scripts/verify-lib.mjs` → **`lib/ at 26dc370 is the build of src/ at 26dc370 (281 files, byte-identical)`**。**两条读数都记下来，因为它们测的是两个不同的提交。**
**推送（`CONFIRMED`）**：`git push origin main` → `2f71a95..26dc370  main -> main`；`git push origin v0.13.36` → `* [new tag]`。**没有 force-push，没有移动任何已发布的标签。**
**远端（`gh`，`CONFIRMED`；这一轮我自己又用 `gh run list` 与 `gh release view` 重读过一遍）**：Release 工作流 run **`45547073752`**，标签 `v0.13.36`、head sha `26dc370`、conclusion **success**
（https://github.com/free6589/dsh-grok-workflow/actions/runs/45547073752 ）；`main` 上的 CI run **`45547060845`**、head sha 同为 `26dc370`、conclusion **success**
（https://github.com/free6589/dsh-grok-workflow/actions/runs/45547060845 ）。
**GitHub Release（`CONFIRMED`）**：https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.36 ，名字 `Grok Workflow for DSH v0.13.36`，
target `main`，发布时间 `2026-11-25T04:30:10Z`，唯一资产 `dsh-grok-workflow-0.13.36.tgz` = **943206 字节**（`sha256:cac9aa40…`）。
**没做的，以及为什么（`BLOCKED`，不是失败）**：`AGENTS.md` §11 要求的 **live 档案自动升级没有执行**。理由具体：live 档案里**可能仍然留着**被删掉的 `mode:` / `legacyGate:` 两行，
把 0.13.36 装上去会让插件那一行**拒绝激活**、工作流直接从界面消失——那比不升级更糟。**顺序必须是操作者先删那两行，再升到固定标签。**
`~/.dsh` **一行未读、一字未写**，运行中的实例也没有重启。**这条记在操作者身上**：删两行 → 再升级。
**残留（照抄上一轮，不重新论证）**：① 冷加载会**多读一次** `status`（多一个几十字节的 POST，状态收敛正确，不是轮询）；② `HARD_LIMITS.maxQueuedMessages = 8`
（`src/config.ts:10`）仍是**零读者**常量，下一轮决定去留；③ `docs/knowledge` **仍不受任何测试守卫**，改记忆不会让测试变红。
**工作树里那条无关改动**：`.gitignore` 有四行本地设计稿忽略规则（早前会话加的），发布提交里**没有**被暂存，本轮也不碰它。
**这一轮我自己跑过的守卫（`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts test/i18n-parity.spec.ts
test/docs-architecture-version.spec.ts test/update-entry.spec.ts test/update-surface.spec.ts` → **EXIT=0，`6 files / 79 tests` PASS**。下面那条 12:16 的旧记录原样留在历史里，
它写着「未发版」是对的——那时确实还没发。

Last updated: 2026-11-25 12:16 +08:00（**这一支现在同时装了四件事：① 打字 `/grok off` 后已挂载的开关自己刷新（真机验过）；② 删掉四个零引用导出、并按拍板先给协议词汇补了载体；③ 两个 README 里那个没有出处的队列数字订正成写现状；④ `CHANGELOG.md` 补了旧键 `mode:` 的升级须知。运行行为零变化（除①之外），门禁由包工头跑，未发版、未 push、未合 `main`，版本仍 `0.13.35`** —
分支 **`fix/switch-refresh`**，worktree `.tmp/wt-switch-refresh`，基线 `main` 尖端 **`84efda0`**。**完整提交清单（八条，最后一条是本轮文档提交）**：
`8b32e5e` `fix(client): refresh the mounted workflow switch after a command writes the record`（3 文件：`lib/client.js` 143/0、
`src/client/index.js` 143/0、`test/client.spec.ts` 230/1）→ `ded1df6` `test(client): keep the listener snapshot without tripping the spread lint`
（1 文件 3/1）→ `266006b` `docs(switch-refresh): record the command-write refresh, its gate and the live soak`（文档 + 证据）→
`144a9a1` `test(client): cover the sessions face that arrives after the switch mounts`（1 文件 38/0，第 7 条用例）→
`3366248` `docs(switch-refresh): cite the session log for the pre-fix record write`（证据修正）→ `07b91d3`
`docs(switch-refresh): close out the gate reading at the branch tip`（门禁读数对齐尖端 `3366248`、1839 例）→ `c5f40b7`
`refactor(dead-code): drop the four zero-reference exports the front desk left behind`（`src/answer.ts` 0/14、`src/memory/recorder.ts` 0/22、
`docs/ARCHITECTURE.md` 5/0、`lib/` 对应产物）→ 本轮 `docs(queue-limit): state the queue bound that exists, and flag the removed key before upgrading`。
**① 开关刷新（`D-150`，`CONFIRMED`）**：挂载读一次 + 订阅会话事件窗口，**只在出现 seq 更新的 `plugin:grok-workflow/mode` 记录时**再读一次
（同一 seq 只读一次；例外是冷加载历史晚于订阅到达会多读一次），无定时器、无轮询，后台读失败不落失败态，缺面静默退化。真机：改前 20 秒 20 次快照
全停在「开」；改后两次打字各 **+0.5 秒**自动变，静默 15 秒 0 次新请求；`/api/remote.mux` 帧里确有那条记录。用例 132 → **139**。
**② 四个零引用导出（`D-151`，`CONFIRMED`）**：`REPORT_BEGIN` / `REPORT_END` / `LEDGER_GUARD`（协议词汇，**先**在 `docs/ARCHITECTURE.md`
补一条载体 bullet 说明「信封是历史词汇、当前无生产者、解析器只按分节签名读、容忍性由 `test/carryover.spec.ts` 的字面量用例钉着」，**再**删常量）
与 `archiveRoundNow`（死代码，直接删）。有读者的 `RELAY_SOURCE_KIND`、`createMemoryArchiver`、`RoundArchiveInput`、`ArchiveRecorderOptions`、
`roundArchiveEvidence` 一律未动；`src/` + `test/` 里这四个名字 **0 命中**。定向六个 spec **120 例通过**（`engine-contract` 15 例）、
`oxlint` **15 warnings / 0 errors**、`lib/ at c5f40b7 is the build of src/ at c5f40b7 (281 files, byte-identical)`、`lib/client.js` 仍 **329354 字节**。
**③ 队列数字（用户点名，`CONFIRMED`）**：两个 README 原本写着 `maxQueuedMessages=4`，而 `4` 的出处（旧常量）已被删——**全仓没有代码出处**，
键本身早在 `REMOVED_CONFIG_KEYS` 里（`src/config.ts:471`，存了值会被当未知键拒绝）。改法：固定值清单里**删数字、保留键名并写明「已删除」**
（`test/docs-config-keys.spec.ts` 有一条守卫要求每个移除键都在两个 README 里被提到——第一次整段删掉就被它抓红），正文那句改成写现状：
一个 run 待处理的插入需求由**内部固定上限**封顶（`STEERING_LIMITS.maxQueued` = `REPLAN_LIMITS.maxIntents` = **8**），**不可配置**。
`src/config.ts:10` 的 `HARD_LIMITS.maxQueuedMessages = 8` **零读者**，**本轮刻意没动**（下一轮决定）。
**④ 升级须知（用户点名，`CONFIRMED`）**：`CHANGELOG.md` 的 `[Unreleased]` 下新增 `### Upgrade note / 升级须知`（中英双语）：升级**之前**
打开 `<档案目录>/cordis.patch.yml`，把 `grok-workflow` 那一行下面写着 `mode:` 的那一行**整行删掉**、保存、再升级；原因是这个键在 0.13.35
随旧前台一起删了，留着会让插件那一行**拒绝激活**、症状是工作流从界面消失（**记录与数据不丢**）；并写明「没有这一行就什么都不用做」与
「我们**没有**替你改过任何档案」。**live `~/.dsh` 一行未读未写**，那一行由操作者亲手删。
**六个文档守卫（本轮自己跑，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts
test/i18n-parity.spec.ts test/docs-architecture-version.spec.ts test/update-entry.spec.ts test/update-surface.spec.ts` → **EXIT=0，6 files / 79 tests PASS**。

Last updated: 2026-11-25 11:58 +08:00（**打字 `/grok off` 之后，对话框底部那个开关现在会自己跟着变了：不刷新、不点击、不轮询——它只在会话记录被写入时多读一次；真机改前 / 改后各量了一遍，`CONFIRMED`；残留一条「冷加载多读一次」；未发版、未 push、未合 `main`，版本仍 `0.13.35`** —
分支 **`fix/switch-refresh`**，worktree `.tmp/wt-switch-refresh`，基线 `main` 尖端 **`84efda0`**，两个功能/测试提交 **`8b32e5e`**
（`fix(client): refresh the mounted workflow switch after a command writes the record`，**3 文件**：`lib/client.js` 143/0、
`src/client/index.js` 143/0、`test/client.spec.ts` 230/1）与 **`ded1df6`**（`test(client): keep the listener snapshot without tripping the
spread lint`，**1 文件**：`test/client.spec.ts` 3/1），其后三条只写文档与证据的提交。**整支尖端 `3366248`**，五条提交：
`8b32e5e`、`ded1df6`、`266006b`、`144a9a1`、`3366248`。
**改的是什么（用户能看到的那一层）**：以前打字 `/grok off`，记录确实写进去了（工作流真的关了），慢的是屏幕——那个开关只在页面加载时读一次会话，
之后不再看，所以它还写着「开」，得刷新页面或者点它一下才对。现在只要这条记录被写入，按钮就会被告知，并**自己再问一次**，
**+0.5 秒**内就跟着变：不用刷新、不用点，后台也没有任何东西在定时跑；`/grok on` 同理。万一这次重读失败，开关保持它已经显示的状态，
不会弹出一条你没做错什么却要看的错误。
**怎么做到的（`D-150`，`CONFIRMED`）**：走 `D-149` 留的候选 ①——订阅会话事件窗口。`src/client/index.js` 里复用**已有的**
`ctx.inject(['uiConversation','sessions'], …)` 拿 `sessions.binding(id).eventSource`（`getSnapshot()` + `subscribe()`），
**只在窗口里出现 seq 更新的 `plugin:grok-workflow/mode` 记录时**才向 `/grok-workflow/mode` 发一次 `status`，同一 seq 只读一次；
面是**可选、后到**的（缺面 / 无 `binding` / 绑不到会话 / 窗口不完整，四种都静默退化，不报错、不 pending、不挡挂载），
晚到的面由一个小集合兜住，所以订阅不取决于注入顺序。**路由、host、动作列表、答案形状零改动；没有新增必需依赖；没有定时器、没有轮询。**
否决了候选 ②（让命令路径的写响应回填）——那要在宿主的一个回合里新增一条到浏览器的通道，是新机制。
**读数（定向，代码轮自己在 `8b32e5e` / `144a9a1` 的树上跑，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npx vitest run test/client.spec.ts test/i18n-parity.spec.ts`
→ **EXIT=0，`2 files / 145 tests PASS`**（`client` **139**、`i18n-parity` 6）；基线 132 + 6 + 6 = **138**，本轮 **+7** 条用例：
核心刷新、同 seq 不重读、无记录不多读、后台失败静默、缺面回归、卸载即退订、**面在挂载后才到**——七条都驱动**真实组件挂载**。反向验证：把「取面」临时改成旧行为后
重跑，`Tests 5 failed | 133 passed (138)`，失败的正是那四条会变的（两条「断言不存在」的按设计仍通过）。
**门禁（包工头在整支尖端 `3366248` 的树上跑，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**：`Test Files 98 passed (98)` /
**`Tests 1839 passed (1839)`**（基线 1832 + 7）、`Duration 94.89s (transform 3.30s, setup 0ms, import 8.69s, tests 75.41s, environment 11ms)`、
**`Found 15 warnings and 0 errors.`**（回到基线 15——`8b32e5e` 曾把它抬到 16，`ded1df6` 用
`[...listeners]` → `Array.from(listeners)` 消掉并保留「先取快照再派发」的语义）、
`lib/ at 3366248 is the build of src/ at 3366248 (281 files, byte-identical)`、`client bundle: 329354 bytes`（基线提交 321607，**+7747**）。
**真机（包工头跑，隔离克隆，端口 3321，live `~/.dsh` 与 3080 全程未碰，`CONFIRMED`）**：环境是 `node scripts/clone-profile.mjs` →
`.tmp/soak-switch/dsh-home`（profile `web-clone`，**7699 文件**、parity **5/5**、**1 行凭据按设计脱敏**），插件用**拷进 profile 的构建产物**
（不是软链），`sha256(lib/client.js)` = `52cdace8…`，与本 worktree **逐字节相同**。**改前**（克隆里原本的 0.13.32 构建）：
挂载读默认值 → `workflow总开关 | 开 · 全员模式`，打字 `/grok off` 后 **20 秒 × 20 次快照全部停在「开」**、`/grok-workflow/mode` **只有 1 次请求**。
**改后**：加载读到记录 `{"enabled":false,"source":"record","setBy":"command:/grok off"…}` → `工作流开关 | 关`；打字 `/grok on` → 自动一次 `status`
答复 `{"enabled":true,"source":"record","setBy":"command:/grok","workflowMode":"full"}` → **+0.5 秒**变 `开`；再打字 `/grok off` → 又一次自动
`status` → **+0.5 秒**变 `关`；之后 **+15 秒静默窗 0 次新请求**（全程 4 次 = 加载 2 + 两次写入各 1）。**没有点击、没有 reload、没有定时器。**
**前提在真机上成立**：`/api/remote.mux` 的 websocket 帧里就有 `plugin:grok-workflow/mode` 记录（seq **5 / 27 / 30**，`"ignorable":true`），
`ignorable` 只挡模型一侧，不挡浏览器——这条不再是 `HYPOTHESIS`。证据在 `.rsi/evidence/switch-refresh-2026-11-25/`。
**残留如实记**：**冷加载会多读一次** `status`（挂载读 t=1.67s、历史 follow 帧 t=1.69s 才到，订阅时窗口还是空的，那条「本来就在历史里」的记录被当成
新记录又读一次，相隔约 20 ms）——后果只是每次加载多一个几十字节的 POST，状态收敛正确，**不是轮询**；所以措辞是「同一 seq 只读一次；
**例外**是冷加载时历史记录晚于订阅到达」。另有两条边界：`binding()` 只对被客户端 materialize 的会话返回（真机上成立，没有时静默不刷新）；
挂载读与订阅建立之间的毫秒级窗口理论上可能漏一次写入（**`HYPOTHESIS`**，未观测到）。
**没做的**：**模型回合 `NOT_RUN`**（隔离克隆按设计缺 `AGENT2API_API_KEY`；本轮真机只覆盖「加载 / 打字一条斜杠命令 / 观察开关」，
命令本身不调模型）；未发版（`package.json` 仍 **`0.13.35`**）、未 push、未合 `main`、没有 PR。用户文档那两句
「挂载时读一次」本轮改成「挂载时读一次，之后只在会话记录被写入（比如打字 `/grok on|off`）时再读一次、不轮询」——`README.md:262` 与
`README.zh-CN.md:248` 各一处；`README.zh-CN.md:244` 那是**另一个开关**（轮数/间隔那个 `grok-workflow-loop`），一个字没动。

Last updated: 2026-11-25 11:22 +08:00（**对话框底部那个开关改文案：「全员模式」这个词随旧前台一起没了，现在开就是开、关就是关，标签叫「工作流开关 / Workflow switch」；门禁 EXIT=0；真机读数不是「回落」，而是两件事叠加——开关挂在另一个没有记录的空会话上 + 命令写入后已挂载的开关不刷新，`CONFIRMED`；未发版、未 push、未合 `main`，版本仍 `0.13.35`** —
分支 **`fix/composer-label`**，worktree `.tmp/wt-composer-label`，基线 `main` 尖端 **`424ed99`**，功能提交 **`2f218d0`**
（`fix(client): say the workflow switch plainly, without the deleted full-crew mode`，**3 文件 / +31 −17**：`src/client/index.js` 4/4、
`lib/client.js` 4/4、`test/client.spec.ts` +23 −9），文档提交待包工头做。
**改的是四条文案（`mode.switch.*` 八个键里只动 `label` 与 `on`，两个语言各一对，其余六个一字未动）**：EN `label` `Workflow` → **`Workflow switch`**、
EN `on` `On · full crew` → **`On`**；ZH `label` `workflow总开关` → **`工作流开关`**、ZH `on` `开 · 全员模式` → **`开`**。理由是旧文案在指一个已经删掉的东西：
「全员模式 / full crew」是旧前台那一档的叫法，0.13.35 把旧前台整条链删了，开关却还挂着那个名字。
**测试面为什么跟着改（这一轮唯一有技术含量的地方）**：中文状态词从「开 · 全员模式」缩成一个字 `开`，而新标签 `工作流开关` 自己就含 `开`——原来那 7 处
「整行文本 `toContain`（包含）状态词」的断言会因此**永远为真**（关着的时候整行里也有 `开` 字），成了绿得没意义的守卫。改法是读**状态行那个元素**
（`data-mode-note`，`src/client/index.js` 里挂的就是 `state.phase`，文字由 `modeSwitchText` 给）并对它 `toBe` 相等：新增两个小帮手
`noteIn` / `noteText`（`test/client.spec.ts:920-921`），7 处 `toContain` → `toBe`（`:3252`、`:3259`、`:3274`、`:3324`、`:3440`、`:3446`、`:3452`），
那条「关着时整行不许出现开的文案」的负向断言（`:3277-3280`）也改成量状态行；钉死中文标签的那条字面量改成 `工作流开关`（`:3373`），
另加两条**防塌陷守卫**：`label ≠ on`、`on ≠ off`（`:3376-3377`）——任何一个塌了，状态检查都会在两种状态下同时为真，那是假绿。
**读数（定向，收口轮自己在 `2f218d0` 的树上重跑，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npx vitest run test/client.spec.ts test/i18n-parity.spec.ts`
→ **EXIT=0，`2 files / 138 tests PASS`**（`client` 132、`i18n-parity` 6），`Duration 939ms`。用例总数与基线一样（**1832**，全量门禁读数），
本轮**没增删一条用例**，只把 7 处断言收紧、加两条守卫。
**门禁（包工头在 `2f218d0` 的树上跑，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**：`Test Files 98 passed (98)` /
`Tests 1832 passed (1832)` / `Duration 93.03s (transform 2.45s, setup 0ms, import 7.88s, tests 74.22s, environment 10ms)`、
`Found 15 warnings and 0 errors.`（177 文件 / 96 规则，与 0.13.35 那 15 条相同，没有新增）、
`lib/ at 2f218d0 is the build of src/ at 2f218d0 (281 files, byte-identical)`、`client bundle: 321607 bytes`。
**体积差额对得上**：基线 `424ed99` 提交的 `lib/client.js` 是 **321631 bytes**（`git show 424ed99:lib/client.js | wc -c`），
现在 **321607**，**差 24 字节**，就是四条文案变短。
**这一轮最值钱的是复现，结论把一条旧 `HYPOTHESIS` 结案了，而且方向与原来记的相反（`CONFIRMED`）**：环境是 `node scripts/clone-profile.mjs`
把 live `web` profile 克隆到 scratch `.tmp/soak-label/dsh-home`（profile 名 `web-clone`，**7699 文件**、parity **5/5**、
**1 行凭据按设计脱敏**），端口 **3321**，线上 3080 与 `~/.dsh` **全程未碰**；克隆里那条已移除的键 `mode: triage` 删掉，插件用**拷进 profile 的构建产物**
（不是软链——软链会挂，`docs/LOCAL-TESTING.md` 的 trap 清单里记着），克隆里 `grokDefault: on`（与 live 一致）；用 headless Chromium（Playwright）真操作
并抓 `/grok-workflow/mode` 的每条请求与响应。三条读数：
① **打字 `/grok off` 写了记录，但已挂载的开关不会刷新**——会话里确实出现 `grok / Grok workflow OFF — normal chat.`，会话日志里**只有一条** mode 记录
`{"v":1,"enabled":false,"turn":0,"setBy":"command:/grok off"}`（seq 5，`ignorable:true`，落盘可读）；但整个 90 秒观察窗加下一回合
`/grok-workflow/mode` **一共只有挂载时那 1 次请求**，41 次快照全部停在 `workflow总开关 | 开 · 全员模式`。**它只在挂载时读一次，没有轮询、没有事件订阅**。
② **看到的「回开」是两个会话，不是同一个开关来回跳**——reload 后前端打开的是**另一个新建的空会话**（`session-f259f6a0-…`，那时 `user/message` 计数为 0），
它没有记录，宿主诚实地答 `source:"default"`，于是显示默认的开；点回上一条对话（`session-2abe70e6-…`）后重挂载读一次
→ `{"enabled":false,"source":"record","setBy":"command:/grok off",…,"fallback":true}` → `关`，下一回合仍是 `关`。
③ **记录权威（route 一侧是对的）**：同一个有记录的会话，reload 前、reload 后、下一回合三次读到的都是 `source:"record", enabled:false`，与账本逐字一致；
**没有任何一次对「有记录的会话」读回 `source:"default"`**——所以这**不是回落 bug**，旧 `VALIDATION.md:410` 那条「疑似回落到 profile 默认值」
（写下时为真的记录，不回改）由本轮订正为「一次性读取 + 命令写入后不刷新，叠加开关挂在另一个空会话上」。真正存在的客户端缺陷是前一半，
方向也相反：**点击会刷新（写响应回填状态），打字不会**。
**新文案的真机核对（换成本轮构建后重启同一隔离实例，`CONFIRMED`）**：新会话挂载 → `工作流开关 | 开`；点开关 → POST `{"action":"set","enabled":false}`
→ 响应 `{"enabled":false,"source":"record","setBy":"switch:mode",…}` → `工作流开关 | 关`；再发一回合、reload 之后仍然 `关`（读到 `source:"record"`）；
整页文本不再出现 `全员模式` / `full crew`（检查为 `true`）。两次装的构建不是同一份：probe1/2 跑的是主检出 0.13.35 的 `lib/client.js`
（`1455d91e…`，含 `workflow总开关`、不含 `工作流开关`，与那两次快照里的旧文案对得上），probe3 重装后是**本轮构建** `4ce107e1…`
（与本 worktree 的 `lib/client.js` 逐字节相同）。
**没做的 / 如实记**：**模型回合 `NOT_RUN`**——隔离克隆把 `AGENT2API_API_KEY` 脱敏掉了，每次发消息都是 `MISSING_CREDENTIAL` 的 `turn/end error`，
读数覆盖的是「发出一条消息、开一回合」这一层，模型回答本身没验；**「命令后不刷新」本轮只记录不修**（见 `D-149`）；用户文档已跟上新叫法——
`README.zh-CN.md:248` 那句 `workflow总开关` 本轮**一并改成「工作流开关」**（只动这一处措辞，同段「挂载时读一次 / 会话没有记录时显示 `grokDefault` /
关闭三重提示」的描述一字未改，那些仍然是真话；英文 `README.md` 本来就叫 `The workflow switch`，没动），改后六个文档守卫
**6 files / 79 tests PASS**；没有 push、没有打 tag、没有改版本号
（`package.json` 仍是 `0.13.35`）、没有创建 PR；`~/.dsh` 一行未写、未重载、未重启，`~/.dsh/profiles/web/cordis.patch.yml:563` 那条 `mode: triage` 仍在。

Last updated: 2026-11-25 10:55 +08:00（**M3.4 死代码收尾：把 0.13.35 遗留的一批零引用导出删掉，并改写 12 个够到它们的 spec；门禁通过，`CONFIRMED`；未发版、未 push、未合 `main`，版本仍 `0.13.35`** —
分支 **`fix/m3-dead-code`**，worktree `.tmp/wt-m3-dead-code`，基线 `main` 尖端 **`dde5b09`**，两条提交：**`d484229`**
（`refactor(m3.4): delete the dead exports the 0.13.35 sweep left behind`，`src/` **13 文件 / +17 −691**，加 `lib/` 重建
**42 文件 / +48 −799**，合计 **55 文件 / +65 −1490**）、**`56f2feb`**（`test(m3.4): rewrite the twelve specs that reached the
deleted exports`，**12 文件 / +71 −321**）。这是 **`D-143`** 明确推迟的那一刀——那条决定说「删掉的模块」与「因它失去调用者的模块」
是两次删除；第二次现在做完了，判据与被否掉的替代见 **`D-148`**。）
**删了什么（逐文件 `wc -l` 实测，括号里是 `git show --numstat` 的 +/−）**：`src/answer.ts` **222 → 58**（+4 −168）——`relayText`、
`reportEnterText`、`RelayOptions`，以及私有的 `REWRITE_PREAMBLE`/`FAILURE_PREAMBLE`/`DIAGNOSTICS_RULE`/`SUCCESS_DIAGNOSTICS_PREAMBLE`/
`FAILURE_DIAGNOSTICS_PREAMBLE`/`foldedLedger`；`src/run.ts` **2014 → 1692**（+1 −323，净 −322）——`runSingleCall`、`SingleCallOptions`、
`SingleCallOutcome`、`singleCallScript`、`TRIAGE_RUN_LABEL`，以及 `archiveRoundNow` 那个 import 名字；`src/mode.ts` **135 → 130**（−5）——
`isModeEnabled`；`src/config.ts` **1334 → 1301**（+3 −36）——`ConfigReader.lastGood()` 连同它的闭包缓存、`FIXED_INSTANT_RECEIPT`、
`FIXED_MAX_QUEUED_MESSAGES`、`FIXED_TRIAGE_ASK`、`FIXED_TRIAGE_FOLLOWUP_AS_FAST`、`FIXED_GATE_ON`、`SWITCHABLE_CLASSES`；
`src/records.ts` **952 → 832**（+1 −121）——`alreadyRouted`、`appendInstantReceipt`、`deliveryKey`、`recordDelivery`，外加级联走的
`readDeliveries`、`isDeliveryRecord`、`DELIVERY_RECORD`、`DeliveryPhase`、`DeliveryRecord` 与 `PluginRecordMap` 增强里
`plugin:grok-workflow/delivery` 那个成员；`src/steering.ts` **169 → 159**（+1 −12）——`closeSteering`；`src/intake.ts`
**200 → 183**（−17）——`inspectPrompt`。**删之前这些符号在 `src/` 里调用点为零**——本轮逐符号 grep 复核，**33 个符号全部 0 命中**。
**枚举之外的两处，都是后果不是扩大范围**：① `createConfigReader` 的 `logger` 参数跟着 `lastGood()` 走了（它唯一的消费者就是
`lastGood` 的兜底告警），唯一调用点 `src/index.ts:62` 一起改，现在读作 `createConfigReader(rawConfig as Record<string, unknown>)`；
② 六处点名已删符号的注释改写为描述存活代码（`src/memory/recorder.ts`、`src/progress-tab.ts`、`src/client/index.js`、
`src/supervisor/verdict.ts`、`src/delivery/index.ts`、`src/answer.ts`）——改法是**只摘掉符号名**，散文里「前台那一档」的描述还在：
`archiveRoundNow` 的文档注释现在写「The front-desk tier is one `agent()` call in its own run」，而它自己仍然没有调用者。
**测试面（12 文件 / +71 −321）**：**19 条检查项删除**，每条都是因为量的那个机制没了；**没有整份删掉任何 spec 文件，没有一条被
`skip` 或标 `todo`**。基线算术是把同一批 12 个文件在 `dde5b09` 的树上再跑一遍：**338 → 319，差 19**。逐文件（基线 → 现在）：
`delivery` 21→15（−6）、`intake` 14→9（−5）、`final-answer-rewrite` 15→12（−3）、`mode` 18→16（−2）、`memory-archive` 21→20、
`reliability` 20→19、`records-redaction` 4→3（各 −1）；`delivery-human-block` 46、`client` 132、`command` 27、`docs-config-keys` 13、
`compact-step-pairing` 7 不变。12 个文件现在合计 **319 例**。
**替换用的是存活的生产路径，不是测试里重造的仿制品（`D-148` a）**：relay 标记切片 → `deliverReport(report).text`（诊断关掉时
逐字节相同的那个块，断言一字未改）；`isModeEnabled` → `readModeRecord(s)?.enabled`；`appendInstantReceipt` →
`appendAssistantInStep` 按那个包装器原来的实参调；`inspectPrompt` → 存活的 `refuseOversizePrompt` / `refuseEmptyPrompt`；
`SWITCHABLE_CLASSES` 的比较删掉，「bundle 不导出可切换类」保留。`docs-config-keys.spec.ts` 丢掉的那一条是 `maxQueuedMessages`
这个事实，**没有拿 `4` 硬写上去**（`D-148` b）。
**丢掉的那部分覆盖，如实记**：relay 前言契约（默认改写、失败逐字、禁机器词）、折叠账本的信封与跨轮往返、「in-turn 与 relay
一种措辞」、即时回执自己那一轮归档、last-good 快照、投递记录脱敏、准入五行矩阵、mode 兜底值。`parseReportRound` 仍有活覆盖
（`carryover.spec.ts`、`report-audit.spec.ts`）。
**门禁（dispatcher 亲自在 `56f2feb` 这棵树上跑，`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**：
`Test Files 98 passed (98)` / `Tests 1832 passed (1832)` / `Duration 108.89s`、`Found 15 warnings and 0 errors.`（177 个文件，与
0.13.35 门禁记的那 15 条**完全相同**，本轮没有新增一条）、`verify:lib` →
**`lib/ at 56f2feb is the build of src/ at 56f2feb (281 files, byte-identical)`**，同一条命令的输出里还有
**`client bundle: 321631 bytes`**（基线 321645，差额就是 `src/client/index.js` 里被删掉的那行注释文字）。基线算术对得上：
0.13.35 的门禁是 **1851** 例，**1851 − 19 = 1832**；spec 文件数仍是 **98**（本轮没有删文件，所以文件数不动）。
`lib/` 重建后 **71 个 `.js` / 281 文件**，**文件集与基线逐个相同**（`git diff --name-status dde5b09 HEAD -- lib/` 42 条**全是 `M`**，
没有一条 `A`/`D`），两次连续构建逐字节相同。
**死代码本体现在还剩什么（都是报出来、没有顺手删的，`D-148` d）**：① `REPORT_BEGIN`/`REPORT_END`/`LEDGER_GUARD`（`src/answer.ts`）——
仍然导出、`src/` 内零引用；`answer.ts` 现在只剩 **58 行**，四个导出里只有 `RELAY_SOURCE_KIND` 有读者（`carryover.ts` 与 `run.ts`
各一处），其余三个就是这三个常量；② `archiveRoundNow`（`src/memory/recorder.ts:674`）——唯一的调用者正是本轮删掉的 `runSingleCall`；
③ 仍有读者的 `FIXED_*` 常量（`FIXED_SWITCH_ON`、`FIXED_SHOW_DIAGNOSTICS`、`FIXED_UNLOAD_DRAIN_*`、`FIXED_MAX_ACTIVE_RUNS` 等，
喂 `script.ts`、`run.ts`、`checkpoint/schema.ts` 与配置签名行），它们不是死代码。**复核时顺手发现的两类残余，本轮清单没写到**：
`FIXED_TIMEOUT_MS` 与 `FIXED_ANSWER_STRATEGY` 只剩测试在读，`FIXED_TRIAGE_CLASSIFIER` 在 `src/` 与 `test/` 里**一个读者都没有**
（全仓只剩它自己那行定义）；按 `D-148` d 的口径不扩大范围，留给下一轮。
**上一轮那份清单已经清空**：M3.3 条目末尾那段「按设计稿仍留在树上的死代码（下一轮候选，本轮不删，`D-143`）」——`relayText` /
`reportEnterText` / `runSingleCall` 三件套 / `isModeEnabled` / `ConfigReader.lastGood()` / 五个 `FIXED_*` / `records.ts` 四函数 /
`closeSteering` / `inspectPrompt` / `SWITCHABLE_CLASSES`——**本轮全部清掉**。那段原文不回改（一条记忆是「写下时为真」的记录），
只在这里交叉引用。
**没做的 / 如实记（`NOT_RUN`）**：本轮**没有真机 soak**（不改行为、不发版，`AGENTS.md` §3 的触发条件不满足）；没有升级 live 档案
（`~/.dsh` 一行未写、未重载、未重启，`~/.dsh/profiles/web/cordis.patch.yml:563` 那条 `mode: triage` **仍在**）；没有 push、没有打
tag、没有改版本号（`package.json` 仍是 `0.13.35`）；没有创建 PR。

Last updated: 2026-11-25 10:20 +08:00（**0.13.35 已发布**：`release/0.13.35` 从 `main` 尖端 `fe07507` 开出，合 `feat/m3-delete-gate` 成 merge `fb2ae22`，发版提交 `61d8f4a`，合回 `main` 成 `ffbb6b0`；三次门禁全部 EXIT=0，标签与 Release 已推；live 升级故意留一手，须由操作者先删一行）
**发布**：`release/0.13.35` 从 `main` 尖端 **`fe07507`** 开出；合 `feat/m3-delete-gate`（`54670f9`）成 merge **`fb2ae22`**；发版提交
**`61d8f4a`**「chore(release): prepare v0.13.35」（**9 文件 / +59 −57**）；合 `main` 成 **`ffbb6b0`**——`git diff --stat release/0.13.35 main`
为空，即 main 的树与被门禁的那棵树**逐字节相同**。
**冲突**：`git merge-tree --write-tree main feat/m3-delete-gate` 实测只有**四个冲突**，全是记忆文档（`DECISIONS.md` / `HANDOFF.md` /
`STATE.md` / `VALIDATION.md`），解法是两侧内容**原样拼接**、不做 `--ours/--theirs`；`CHANGELOG.md`、`docs/ARCHITECTURE.md`、
`test/block-tools.spec.ts` 是自动合并、逐行核过——改名没被回退，`execution: "foreman"` 这个账本值仍在。合并后 `lib/` 与 `src/`
已经自洽，`npm run build` 没有产生任何 `lib/` 差异，没有为产物 amend。
**门禁（三次读数，全部 `EXIT=0`）**：① **`fb2ae22`**（merge 树）`TMPDIR=$PWD/.tmp npm run ci`：vitest **`98 files / 1851 tests PASS`**、
oxlint **`Found 15 warnings and 0 errors.`**、`verify:lib` → **`lib/ at fb2ae22 is the build of src/ at fb2ae22 (281 files, byte-identical)`**；
② **`61d8f4a`**（发版树，发版侧跑的同一命令）：同样 **98 / 1851**、15 warnings / 0 errors、
`lib/ at 61d8f4a is the build of src/ at 61d8f4a (281 files, byte-identical)`；
③ **包工头自己独立跑的第三次**（同一命令、同一棵 `61d8f4a` 树）：`FOREMAN_CI_EXIT=0`、98 files / 1851 tests、
`Found 15 warnings and 0 errors.`、`lib/ at 61d8f4a is the build of src/ at 61d8f4a (281 files, byte-identical)`，日志 `.tmp/ci-foreman.log`。
基线算术：`main`（`fe07507`）是 **112 个 spec 文件**，`feat` 删了 14 个、没加新的，**112−14=98** 与读数相等；测试数从上一版
（`0.13.34` 的 2128、`a926cd6` 的 2130）落到 **1851**，差额来自那 14 个文件连同它们的用例一起被删。
**文档守卫**：`00720ad` 上跑全套六件 = **6 文件 / 79 测试 PASS**（`update-entry` 20、`update-surface` 29、`docs-config-keys` 13、
`docs-version` 8、`i18n-parity` 6、`docs-architecture-version` 3）；把版本口径改对之后在 `61d8f4a` 上重跑其中四件 =
**4 文件 / 30 测试 PASS**。
**发版前抓到一个真实的谎**（细节在 `VALIDATION.md` 同日条，这里一句话）：`feat` 分支把六处用户可见文档写成「`0.13.34`（M3.3）起
消息前面什么都不放」，但 `v0.13.34` 的树里 `src/gate.ts`、`src/mode.ts`、`src/triage.ts`、`src/captain.ts`、`src/channel.ts`、
`src/history.ts` **都还在**（`git ls-tree --name-only v0.13.34 src/` 实测），M3.3 是 `0.13.35` 才发。发版提交里改成 `0.13.35`
（`README.md` 三处、`README.zh-CN.md` 三处、`docs/ARCHITECTURE.md:331` 的 `Status (since **0.13.35**)`）。
**标签与推送**：注解标签 `v0.13.35` → 标签对象 `bedf8ba2…` → 剥皮 **`ffbb6b0`**；`git show v0.13.35^{}:package.json` 读到 `0.13.35`。
推送无 force：`fe07507..ffbb6b0  main -> main`、`* [new tag] v0.13.35 -> v0.13.35`。
**远端 run**：CI **`45530571233` success**（main，headSha `ffbb6b0`，创建 2026-11-25T02:06:32Z → 更新 02:07:43Z）、
Release **`45530586853` success**（tag `v0.13.35`，headSha `ffbb6b0`，02:06:40Z → 02:08:12Z）。
**GitHub Release**：`Grok Workflow for DSH v0.13.35`（https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.35），
资产 **`dsh-grok-workflow-0.13.35.tgz`（948278 B）**，sha256 `b5a4d96b3c6e887cd0348cc67e03668b1c77e18f8fe914ce6415559a36c95eb5`，
非 draft、非 prerelease；发布正文就是 `CHANGELOG.md` 里 `## [0.13.35]` 那一段（88 行），含「升级前先删 `mode:` / `legacyGate:`」
两语言各一处。`v0.13.34` 的标签与 Release 一个字节没动（剥皮仍是 `d01da81`）。
**用户能感觉到的变化**：旧前台连同它背后的分流/队长/通道/历史四个模块整个删掉，普通消息不再被转述；`legacyGate` 与 `mode` 成了
移除键，补丁还带着就会让那一行**拒绝激活**；接单台 `blockIntake` 默认 `true`，六个块工具默认载入就注册；设置页同时成为宿主
设置面板左列的「Workflow」一项；「包工头」改叫「调度」。配置面 **19 键**、设置页 **16 字段**。
**没做的 / 需要操作者动手的（`BLOCKED`，必须写清）**：`AGENTS.md` §11 的「发版后把 live profile 升到新标签」这一轮**故意没做**，
理由是做了会把插件弄坏：live 档案 `/home/fish/.dsh/profiles/web/cordis.patch.yml` 第 **563** 行仍写着 `mode: triage`（这一行这个
档案里没有 `legacyGate`），而 `mode` 在 0.13.35 里是移除键——先升级会让 `grok-workflow` 那一行**拒绝激活**，症状就是「工作流
不见了」。正确顺序是操作者先删那一行，再升级。同一份档案的依赖写的是**浮动**的 `github:free6589/dsh-grok-workflow`（没有标签），
现装的版本读回是 **`0.13.32`**；这一轮对 `~/.dsh` **一行未写**、未重载、未重启。
**一条刻意偏离既有口径的决定**：撞号时 `feat` 的 `D-141`–`D-145` 保留原号，把 `main` 上那条「角色改名」从 `D-141` 改成
**`D-146`**，与 `D-134`「最早合入的那一支留号」相反；理由是被证据文件钉住的号不能动（`docs/knowledge/evidence/m3-3-2026-11-25/README.md`
逐字引用 `D-141`–`D-144`，而本仓明写证据改字即伪造）。这条偏离本身记成 **`D-147`**（见 `DECISIONS.md`）。

Last updated: 2026-11-25 08:55 +08:00（**角色改名「包工头」→「调度」：只动面向用户的字，合 `main`、未发版** —
分支 **`fix/rename-foreman`**（worktree `.tmp/wt-rename-foreman`），基线 `main` 尖端 **`061693e`**；版本仍 **`0.13.34`**）
**做了什么**：操作员拍板把那个角色改叫「调度」——把一块活拆给子代理、收结果、自己不写代码的那一个。改的是**用户会看到的字**：
块预览的执行标签（`foreman 调度`，与 `workflow 工作流` 同形）、`src/block/tools.ts` 里两条拒绝消息与四条工具说明的措辞、
`docs/knowledge/` 五份记忆文档与 `docs/ARCHITECTURE.md`、`AGENTS.md` §10 的层名（Foreman layer → Dispatcher layer），
`CHANGELOG.md` 的 `[Unreleased]` 中英双语一条。**三样东西故意没动**：账本与预览里的 `execution: "foreman"` 值（协议的一部分，
改它等于让旧 `blocks.jsonl` 行读取时变非法）、`src/dispatcher/` 模块名（L1 大管家另有其名）、历史证据原文
（`docs/knowledge/evidence/**`、`.rsi/evidence/**`、`.tmp/ci-foreman.log` 这类路径）——证据是逐字记录，改字就是伪造。理由与备选见 `D-146`。
**门禁（`CONFIRMED`）**：`TMPDIR=$PWD/.tmp npm run ci` → **exit 0**：typecheck 干净；`oxlint src test` → `Found 36 warnings and 0 errors.`；
vitest **112 files / 2149 tests PASS**；`verify:lib` → `lib/ at 061693e is the build of src/ at 061693e (301 files, byte-identical)`
（**注意**：`verify:lib` 校验的是 HEAD，提交前它只能证明基线自洽，不能替本轮工作树的 `lib/` 背书）。
**没做的事**：没有发版、没有打 tag、没有碰 live profile（`BLOCKED`：本侧沙箱是 `workspace-write`，`~/.dsh` 不在可写范围）；
没有改 `lib/` 以外任何构建产物、没有动变量名（`foreman` 在测试里仍是局部变量名与 fixture）。

Last updated: 2026-11-25 09:30 +08:00（**M3.3「旧前台整条链删除 + 两个路由键移除 + `blockIntake` 默认打开 + 设置页成为宿主设置面板的 `Workflow` 一项」：独立验收通过，`CONFIRMED`；未发版、未 push、未合 `main`** —
分支 **`feat/m3-delete-gate`**，worktree `.tmp/wt-m3-delete-gate`，基线 `main` 尖端 **`061693e`**，四条提交：
**`09aa1bd`**（`refactor(m3.3): delete the old front desk chain`，**81 文件 / +248 −18277**：`src` 17 文件 +97 −4997、
14 个前台 spec −7613、`lib/` 50 文件 +151 −5667）、**`d2d5115`**（`test(m3.3): delete the front-desk specs, re-pin the baseline,
sync the doc guards`，**28 文件 / +879 −1349**：20 个 spec 改写、baseline 夹具重钉、两个 README 与四份 docs、`package.json` 的
`test:unit` 去掉两个已删文件名）、**`b2e70a5`**（记忆收口，只动 `docs/knowledge/` 与 `CHANGELOG.md`）、
**`468e30f`**（`feat(settings): the page is also a Workflow section in the Host settings panel`，**11 文件 / +128 −29**：
6 个代码/文档文件 +108 −29——`src/client/index.js` 与 `lib/client.js` 重建 37+8−8、`test/client.spec.ts` 30+10−10、两个 README 各 1+1−1、
`docs/LOCAL-TESTING.md` 2+1−1——另 5 个是证据文件 `.rsi/evidence/m3-settings-section/` 下的 4 张 PNG + 1 份 README）。
版本仍 **`0.13.34`**。
**设置落点（`468e30f`，用户拍板）**：插件设置页**同时**注册到宿主的 `settings.section` 槽位——id `grok-workflow`（新鲜 id，不占用宿主
自带五节的任何 id，所以是「旁边加一项」不是替换）、`order: 60`、`label` 是一个 thunk 读 `section.label`（中英两表都是单词 **`Workflow`**，
无描述、无图标）；同一个 `GrokWorkflowPage` 组件、同一份 `inject`、`plugins.item` 的卡片**保留**（一个页面两个入口）；卸载时先撤 section
再撤卡片。判据与被否掉的替代见 `D-145`；宿主槽位契约（`list`/`root`/`replaceRisk: 'none'`、label thunk 逐次投影、`settings.section.icon`
是另一个独立槽位）见 `RESEARCH.md` 的 2026-11-25 第二条。
**做了什么（四句）**：① 删掉旧前台整条链——`src/gate.ts`(2466) + `src/triage.ts`(1323) + `src/captain.ts`(261) +
`src/channel.ts`(293) + `src/history.ts`(229) = **4572 行 5 文件**，`src/index.ts` 不再注册 `installGate`（`src/` 里 `installGate`
零命中）；② `src/answer.ts` 314 → 222，删 `FRONT_DESK_PREAMBLE`/`frontDeskText`/`ACCEPTED_PREAMBLE`/`acceptedEnterText`/
`NOTICE_PREAMBLE`/`noticeEnterText`/`noticeText`；③ `src/config.ts` 删 `mode` 与 `legacyGate` 两键（都进 `REMOVED_CONFIG_KEYS`，
旧补丁拿到的是 `removed configuration key "X": … delete it from your patch` 而不是 `unknown`），`DEFAULT_BLOCK_INTAKE` 翻 `true`，
配置面 **21→19 键、投影 17→16**，签名行同时去掉 `gate=on`/`mode=`/`legacyGate=` 三行（`describeResolvedConfig`）；④
`src/client/index.js` 删 `modeCards()` 与只服务它的文案/样式（`status.triage*`/`status.full*` → `status.on`/`status.on.detail`，
中英对称），另清 7 个删前台后零引用的符号：`ScalarField`、`ClassPicker`、`TriageModelPicker`、`enumRow`、`parseSingleRoute`、
`resolveSwitchOn`、`run.ts` 的 `RoleName` import。
**测试面**：**14 个 spec 整份删除**（`gate`、`triage`、`triage-recall`、`triage-followup`、`channel`、`captain-confirm`、
`captain-plan`、`history`、`phase1-dialogue`、`grok-on-ingress`、`full-escape`、`full-behind-first-answer`、`gate-partial-head`、
`human-output-contract`，判据是「主题随旧链一起消失」，见 `D-141`；派单说 6 个，实测 14 个）；**20 个 spec 改写**（`classifyPreStep`
在 `test/` 与 `src/` 里零命中，全部换真 `ctx.waterfall`；`composition` 改成「有/无插件决策逐字节相同」；`objective-limit`
删 gate 那条路保留 tool/fallback；`reliability`/`inheritance` 删 history 三函数那几组；`client.spec` 可见字段 15→14；
另有 `test/helpers.ts` 与夹具）；`test/fixtures/block-flag-baseline.json` 重钉为 **`format: 2`**——钉的对象从「pre-feature 树」
改成「删完后默认载入对八条 payload 一个字都不改」，第 6 条（超长目标）从 2 条消息（32001 用户 + 723 字 `grok-workflow` 通告）
变成 **1 条**；反自证三条保留（改一字 / source 换 `plugin` / `blockIntake:true` 载入逐条等于默认），见 `D-142`。
**门禁（dispatcher 亲自跑，原文 `docs/knowledge/evidence/m3-3-2026-11-25/ci-gate.txt`）**：`TMPDIR=$PWD/.tmp npm run ci` →
**exit 0**，`Test Files 98 passed (98)` / `Tests 1850 passed (1850)`、`Found 15 warnings and 0 errors.`、
`lib/ at d2d5115 is the build of src/ at d2d5115 (281 files, byte-identical)`；`npm run typecheck` exit 0、`npm run lint` exit 0。
**在 `468e30f` 上重跑：98 文件 / `Tests 1851 passed (1851)`（比上一条多 1 例，`client.spec` 新增的 `settings.section` 断言）/ 15 warnings、0 errors、
`lib/ at 468e30f is the build of src/ at 468e30f (281 files, byte-identical)`**（client bundle 320233 → **321645** 字节——新槽位注册进 bundle）。
收口轮自己重跑 `npm run verify:lib` → exit 0，原文 `lib/ at 468e30f is the build of src/ at 468e30f (281 files, byte-identical)`。
`lib/` 重建后 **38 个顶层 js / 281 文件**，`gate|triage|captain|channel|history` 孤儿产物 **0**（`lib/captain-memory.*` 不是孤儿，
它是活模块）。
**真机 soak（四条，全部 `CONFIRMED`；DSH 0.2.2-rc.3、Node v26.8.1、scratch home `.tmp/m3-soak-3/dsh-home`（clone 7699 文件 /
parity 5/5 / 脱敏 1 行）、端口 3311、`~/.dsh` 前后 size `1548` mtime `1795362020` 完全一致）**：① GUI（真 Chromium headless
跑真 web app）两条消息——普通消息 8 秒直答、`source.kind=user` 原文逐字、`grok-workflow` 中继 **0**、`tool-workflow/*` **0**；
旧前台必接的典型句「今天天气怎么样？」也被直答（31 秒，反问城市），中继 0、运行 0；默认载入向模型提供 96 个工具、其中
**9 个 grok 工具**（六个块工具默认注册了）；② headless（兄弟 profile `m33h`，只换 app bundle）→ `EXIT=0`，真跑出 17×23=391
并独立验算；③ 中途 kill：checkpoint `running` / 10 任务 / 0 verified / attempts `[1]`，kill 后与重启后**一字未变**，重启起的是
新运行（新 checkpoint），算出 5×6=30，`EXIT=0`；④ 卸载：bundle 行 **21→20**、依赖消失、boot 干净（0 条 `did not activate`）、
工具 **87 / grok 0**、普通消息仍 7 秒作答、无 `taskboards/`、无新心跳行、checkpoint 未变（最新 08:58 早于 09:00 的卸载）。
**一条迁移发现（已进 CHANGELOG 与 `HANDOFF.md`）**：clone 带着 live profile 的 `mode: triage`，第一次 boot 时插件**拒绝激活**
并打出 `removed configuration key "mode": it was removed in an earlier release and is no longer accepted; delete it from your patch`
（`assertKnownKeys` → `resolveConfig` → `readConfig` → `apply`）；删掉那一行后干净激活。**live 档案的同款行还在**
（`~/.dsh/profiles/web/cordis.patch.yml:563`，设置落点的真机读数再次撞到同一条，见下），所以**升级前必须先由操作者从
`cordis.patch.yml` 删掉 `mode` 与 `legacyGate`**，否则升级后插件拒绝挂载——「工作流直接不出现」的唯一原因。
**边界（如实记）**：GUI 用的是 headless Chromium 不是可见窗口；四条 MCP（serena/mdcg/phone/mobile）在沙箱里写不了家目录、
boot 时有 traceback，与本插件无关；**热卸载 `NOT_RUN`**（先停实例再移除）；**引擎级恢复 `NOT_RUN`**（引擎无 journal，`resume`
是新运行 + checkpoint seed；`--session-id` 采纳仍是 M3.2 记的 `BLOCKED`，未重试）；路由重指到
`bifrost-responses/opencode-go/muse-spark-1.3-contributor`（只换谁回答，不动被测行为），先用一条 200 验活。
**按设计稿仍留在树上的死代码（下一轮候选，本轮不删，`D-143`）**：`relayText`/`reportEnterText`（`answer.ts`，src 内已无调用者，
只有测试在调）、`runSingleCall`+`SingleCallOptions`+`SingleCallOutcome`（`run.ts` 约 300 行前台单调用机制，只剩
`test/memory-archive.spec.ts` 在用）、`isModeEnabled`、`ConfigReader.lastGood()`（这两个也是只有测试在调）、`FIXED_INSTANT_RECEIPT`/
`FIXED_MAX_QUEUED_MESSAGES`/`FIXED_TRIAGE_ASK`/`FIXED_TRIAGE_FOLLOWUP_AS_FAST`/`FIXED_GATE_ON`、`records.ts` 的
`alreadyRouted`/`appendInstantReceipt`/`deliveryKey`/`recordDelivery`、`steering.ts` 的 `closeSteering`、`intake.ts` 的
`inspectPrompt`、`SWITCHABLE_CLASSES`（测试在用）。
**设置落点的真机验证（新 scratch home `.tmp/m3-settings-soak/dsh-home`、端口 3317、headless Chromium，`CONFIRMED`）**：
设置左列实际读出 `通用设置 / 模型 / 内置插件 / 生图配置 / Agent 预设 / 按模型配置提示词 / LLM 错误重试 / 会话修复 / **Workflow** /
打开配置文件`；点进 Workflow 是整页表单（总开关、五条角色链、14 个可见字段、模板 textarea，页脚是固定的 保存 / 放弃修改 / revision）；
Plugins 页卡片仍在。那次读数顺手又撞到同一条迁移发现（clone 带着同样的 `mode` 旧键、首 boot 拒绝激活、删行后干净激活）。
live `~/.dsh` 与 3080/3065/3086/3109 未触碰，scratch 已删。
**证据**：`docs/knowledge/evidence/m3-3-2026-11-25/`（`ci-gate.txt`、`soak-all.txt` 与四条 soak transcript、README 的场景表与结论表）
与 `.rsi/evidence/m3-settings-section/`（4 张 1500×1000 PNG + 该目录的 README，已随 `468e30f` 入库）。

Last updated: 2026-11-25 07:45 +08:00（**M3.2「默认不拦截 + 刹车只有一个主人 + 准入生效」：独立验收通过，`CONFIRMED`；未发版、未 push、未合 `main`** —
分支 **`feat/m3-switch`**，worktree `.tmp/wt-m3-switch`，基线 `main` 尖端 **`7b25890`**，代码尖端 **`7f172ae`**
（本条记忆提交紧随其后，只动 `docs/knowledge/` 与 `CHANGELOG.md`，不碰源码、测试与 `lib/`），八条提交 **`9fdcb6e`**
（准入接线 + 权威 intake spec）、**`94727b9`**（默认翻转、闸门剥掉心跳路由、监听成为唯一主人）、**`ad28f17`**（14 个前台 spec 显式 opt in）、
**`2137afc`**（`lib/` 重建）、**`7bcbd00`**（soak 证据）、**`295cfd2`**（记忆收口）、**`082add6`**（开问题优先于查材料的修复）、
**`7f172ae`**（`lib/` 重建），合计 **69 文件 / +2536 −1044**（`src` 7 文件 +152 −222、`test` 21 文件 +865 −494、
`lib/` 24 文件 +227 −287、`docs` 与两个 README 16 文件 +1269 −29、`CHANGELOG.md` 1 文件 +23 −12）。版本仍 **`0.13.34`**。
**做了什么（四句）**：① `DEFAULT_LEGACY_GATE` 改成 `false`——默认载入不注册旧前台，普通用户消息不再被拦截；
② 闸门彻底不再路由心跳（`classifyHeartbeat`、它里面的 `isHeartbeatMessage` 调用、`installGate` 的刹车口、
`Classification` 的 `loop-stop` 与对应 handler 全删），`installHeartbeatListen` 去掉 `ownsRouting` 与 `observeOnly` 并
**无条件安装**（放在 `blockIntake` 分支之外），所以接单台关掉时刹车仍有主人；③ `BLOCK_ADMISSION_ENFORCED = true`，
六个块工具对没有 `/grok on` 记录的会话以 `mode-off` 拒绝；④ `legacyGate: true` 作为显式 opt-in 保留，只把旧前台装回来管
用户消息路由。
**红→绿（独立跑，不信实现者自报）**：重写后的 intake spec 放进 `git archive 7b25890` 的一次性解包 → **exit 1**，
`15 failed | 3 passed (18)`，15 条全是行为红（准入仍失效、六个工具照样作答、`legacyGate` 缺省仍 on、写 `observed` 而不是
`continued`、pre-M3.2 的注册矩阵、闸门仍在分类一拍心跳），**整份 transcript 没有一处 "cannot find module"**
（`red-spec-on-baseline.out`）；分支上同一批五个 spec → **5 files / 174 tests PASS**（`m3-intake` 18、`block-tools` 23、
`block-ledger` 20、`block-preview` 93、`block-supervisor` 20），绿的那次把另一名工人源文件的 sha256 钉在 transcript 里
（`green-spec.out`）。
**门禁（`7f172ae`，调度重跑）**：`TMPDIR=$PWD/.tmp npm run ci` → **exit 0**，`Test Files 112 passed (112)` /
`Tests 2149 passed (2149)`、`Found 36 warnings and 0 errors.`、
`lib/ at 7f172ae is the build of src/ at 7f172ae (301 files, byte-identical)`；单独 `npm run verify:lib` → exit 0、同一行原文；
`npm run typecheck` → exit 0。
**一条真事故（记忆自己把分支弄红）**：`295cfd2` 那轮**只改文档**的记忆提交让 `B04`/`B08` 变红，而 `src`/`test`/`lib` 的字节一个没动。
原因不在文档写错，在于**前台把本仓库的笔记当输入**：它在决定一句含糊消息怎么处理之前，会把这句消息的锚点拿到每份顶层
`docs/knowledge/*.md` 的前 2 400 字符里找，命中两个就认为「答案已经在盘上」、直接作答。新写的 `HANDOFF.md` 条目正好把那句
测试消息的两个锚点写进了那个窗口，于是档位从「问」翻成「快手档／已回忆」，待答的那个问题被作废而不是被带走；基线是绿的，
因为它的窗口里只有一个锚点。`082add6` 把规则写成显式的一条：**问题还开着时，查材料的命中不得改写档位**（查照跑，只有命中被拒），
并在 `test/phase1-dialogue.spec.ts` 加了一条不依赖本仓库笔记的用例（scratch 知识目录里放两个锚点）；变异验证：去掉这道闸，
三条用例失败（变异读数见 `082add6` 的提交说明，`VALIDATION.md` 记了这条转述）。教训：记忆内容是 triage 的输入，改记忆就是改行为（`D-140`）。
**真机 soak（DSH 0.2.2-rc.3、Node v26.8.1、scratch home、自有端口 3311、live `~/.dsh` 前后 size 与 mtime 完全一致、未写入）**：
打的是 **`2137afc`**，早于 `082add6`；四条场景跑的是 `legacyGate` 缺省的形状，旧前台没注册，所以那次修复动的 triage／查材料路径
一次都没进入——soak 的结论不受它影响。① 真 Chromium 在 GUI 上，
一条普通消息被直接作答、`source.kind=grok-workflow` 中继 **0** 条且用户原话逐字在日志里，显式要求跑工作流则**恰好一次**运行
（`run-start` 1 / `run-end` 1、`stopReason: completed`、2 个任务 verified）；② headless——任务书那条字面命令被拒
（`too many arguments`），同配置的兄弟 profile `dsh-headless` 跑完一次真工作流到 `COMPLETED`；③ 重启/续跑——在 `synthesize` 里 kill，
checkpoint `running`、10 次尝试，采纳同一会话的重启被一条**先于本块**的 harness 拒收挡住（未知事件
`tool-workflow/guardian-start`，来自 `891b8a2`，不是 M3.2 回归），能继续的那次起了插件自己播 resume seed 的运行、只带 1 个任务、
attempts 10 → 10、没有被重复计费，被 kill 的 checkpoint 老老实实留在 `running`；④ 卸载——bundle 行 21 → 20、
请求头里的 grok 工具 **8 → 0**、普通消息仍被作答、没有新账本行也没有心跳行、没有存活的后台活，一处残留如实记下
（pnpm 留下了 `node_modules/dsh-grok-workflow` 软链）。真机上的准入 **`CONFIRMED`**（`grok_open_block` 返回 `isError=true`、
`mode-off: …`）。
**两条边界**：窄监听在真机上的心跳行 **`NOT_RUN`**（四个场景都没开块，所以一拍都没送到；所有权这条结论靠单测与 M3.1 的真机先例），
运行中热卸载 **`NOT_RUN`**（先把实例停了）。
**证据**：`docs/knowledge/evidence/m3-2-2026-11-25/`（红/绿 spec 原文、`soak-all.txt` 与四条 soak transcript、README 的场景表）。

Last updated: 2026-11-25 05:15 +08:00（**M3.1「窄心跳监听 + legacyGate + 准入判断」：独立验收通过，`CONFIRMED`；未发版、未 push、未合 `main`** —
分支 **`feat/m3-narrow-listen`**，worktree `.tmp/wt-m3-narrow-listen`，基线 `main` 尖端 **`35326c7`**，实现提交 **`d546666`**
（`feat(intake): the narrow heartbeat listener, legacyGate and the admission predicate`），**45 文件 / +1807 −163**
（其中 `src/` + `test/` + `docs/` + 两个 README 是 **16 文件 / +1030 −77**，其余 29 个是 `lib/` 重建产物）。
**做了什么**：① 新增 `src/heartbeat-listen.ts`（398 行）——接单台自己的第二个 `agent/pre-step` 监听，`ownsRouting: false` 时只观测
（算出决策先 `await next()`，再把同一个对象原样返回，然后写一行 `observed`），`ownsRouting: true` 时才自己复核刹车、自己 `reject`；
观测写自己的 `heartbeats-listen.jsonl`，绝不碰接单台的 `heartbeats.jsonl`／`verdicts.jsonl`／`blocks.jsonl`。② `isHeartbeatMessage` 与
`reviewHeartbeat` 从 `src/gate.ts` 搬到这个模块，门禁改成 import 它们——一份定义，两种形状不会漂。③ `src/index.ts` 读一次
`legacyGate`，两种形状互斥：`legacyGate: false` 时整段不注册 `installGate`，且不注册接单台自己的观测器（避免一拍两写）。
④ `src/user-source.ts` 新增 `BLOCK_ADMISSION_ENFORCED = false` 与 `canAcceptBlock` / `canAcceptBlockWhenEnforced`，六个块工具在入口
（`accept`/`stop` 两处是**入参解析之前**就调）都接上 `admit()`，当前恒为「可以」，M3.2 只翻一个常量。⑤ 配置面二十 → **二十一**键
（`legacyGate` 默认 `true`，载入期，不投影到设置页）。
**红→绿（自己跑，不信实现者自报）**：基线 `35326c7` 的一次性拷贝里放同一个 spec → **exit 1**，
`Error: Cannot find module '../src/heartbeat-listen.js' imported from …test/m3-intake.spec.ts`，`Tests no tests`；
把本分支 `src/` 放进去 → **10 passed**；两次变异都咬住了：去掉 `observeOnly` 的观测写入 → **1 failed | 9 passed**
（`expected [] to have a length of 1 but got +0`，第 257 行），把 `ownsRouting` 恒为 false → **2 failed | 8 passed**
（`expected "reject" received "enter"`、`expected [] to deeply equal [ 'sess-m3-continue' ]`）。
**门禁**：`npm run ci` **EXIT=0**——oxlint `Found 36 warnings and 0 errors.`、`verify:lib` →
`lib/ at d546666 is the build of src/ at d546666 (301 files, byte-identical)`、vitest **`112 files / 2140 tests PASS`**；
单独再跑一次 `npm run verify:lib` 同样 exit 0、同一行原文。
**真机隔离双形状（DSH 0.2.2-rc.3，scratch home，自有端口 3299，live 一行未写）**：同一份克隆 profile、同一份装进去的构建
（`link:` 到本 worktree，版本读回 `0.13.34`），只差一个键。**形状 A（`legacyGate` 缺省 on）**：插件激活（24 个设置命名空间、
`grok-workflow` `autoGenerate: true`、boot 无 `pending`／`did not activate`）；普通用户消息**被旧前台接单**——会话日志里出现 1 条
`source.kind = "grok-workflow"` 的中继消息（`The front desk of the mandatory workflow gate handled this message…`，档位直答档）；
真 Schedule 心跳投递后 `turn/end reason blocked`（刹车 `loop/stop-file`，因为仓库里 `.rsi/STOP` 在），账本目录**根本没被创建**——
两个观测器都只在「有 open block」时才写，本 soak 没开块，所以两文件都空，这是设计行为。**形状 B（`legacyGate: false` + `blockIntake: true`）**：
插件**仍然激活**（同样 24 个命名空间、`autoGenerate: true`）；同一条普通用户消息**不再被前台接单**——`grok-workflow` 中继消息 **0 条**，
用户消息直达模型、assistant 真答 `你好！`；同一拍心跳由窄监听接管，`heartbeats-listen.jsonl` 出现 1 行原文
`{"code":"loop/stop-file","kind":"heartbeat-listen","outcome":"stopped",…}`，而 `heartbeats.jsonl` **不存在**（拥有裁决权的形状里接单台观测器不注册，
没有双写）。模型路由可用（`bifrost-responses/opencode-go/muse-spark-1.3-contributor`）；另一条 `bifrost-completions/agnes-3.0-flash`
首字 180s 超时（`TIMEOUT`），属上游网关，没有被当作任何形状的证据。
**未达项**：`configuration in effect: … legacyGate=on` 这行是 `logger.info`，DSH 0.2.2-rc.3 不把 info 导出到 stdout（整份 boot 日志里
`settings surface:` 那行同样不出现），所以「日志里 legacyGate=on」按字面 **NOT_OBSERVED**，改用行为证据（旧前台确实接单了）顶替。
**证据**：`docs/knowledge/evidence/m3-1-2026-11-25/`（绿/红/两次变异/ci/verify:lib 原文、双形状 boot 行与设置投影、两份会话抽取、
`heartbeats-listen.jsonl` 原文、`soak-dual-shape.txt` 全过程）。

Last updated: 2026-11-25 02:37 +08:00（**接单台子收口：注释里的「五个工具」改成「六个」（七处，不是六处）、`lib/` 重建、提交后全量门禁 exit 0，独立模型监工在真机隔离 soak 上第一次真判出结果，`CONFIRMED`；未发版、未 push、未合 `main`** —
分支 **`fix/supervisor-soak-evidence`**，worktree `.agents/worktrees/fix-supervisor-soak-evidence`，基线 `main` 尖端 **`6501012`**
（`docs(memory): close out the 0.13.34 release — merge, both gates, tag, and both remote runs`）；本轮唯一一条工作提交 **`49377e8`**
「fix(block): say six tools, not five, and land the model-supervisor soak evidence」，**12 文件 / +876 −18**：七个源文件行
（`src/config.ts` 8、`src/index.ts` 2、`src/types.ts` 4）+ 六个 `lib/` 产物（`config.d.ts` / `config.js` / `config.js.map` /
`index.js` / `index.js.map` / `types.d.ts`）+ 三份证据（`.rsi/evidence/supervisor-soak-2026-11-25/` 下的 `soak.txt`、
`ledger-extract.txt`、`text-gate.txt`）。
**文字订正：七处，不是派单最初说的六处。** `src/config.ts:223`、`:226`、`:671`、`:679`、`src/index.ts:416`、`src/types.ts:237`、`:300`，
每处只换一个词（`five`→`six`、`五个`→`六个`）；`git diff --stat 6501012 49377e8 -- src/` → **3 文件 / 7 增 7 删**，一行一个词，
没有重排、没有动别的字。第七处 `:223` 是调度追加批准的：它与 `:226` 在**同一段 doc comment** 里，留着就会让那段话四行后自相矛盾。
`lib/` 由 `npm run build` 重建（`lib/client.js` 未变——浏览器包不带这些注释）。**按派单留在范围外、仍写「five」的四处**：
`src/block/tools.ts:2`、`test/block-tools.spec.ts:2`、`test/block-flag.spec.ts:50`、`:52`。
**门禁：提交后那一次才是覆盖本轮改动的那一次。** `TMPDIR=$PWD/.tmp npm run ci` 在 **`49377e8`** 上 **EXIT=0**（日志 `.tmp/ci-foreman.log`）：
vitest **`111 files / 2128 tests PASS`**（183.97 s）、oxlint **`Found 36 warnings and 0 errors.`**、`verify:lib` →
**`lib/ at 49377e8 is the build of src/ at 49377e8 (293 files, byte-identical)`**。
**先前那两次不算覆盖**：`.tmp/ci-text-gate.log` 与 `.tmp/ci-text-gate-2.log` 的读数形状一样（111 / 2128、36 warnings / 0 errors），
但 `verify:lib` 都写 `lib/ at 6501012 is the build of src/ at 6501012 (293 files, byte-identical)`——它比的是 **HEAD 的 `src` 与 HEAD 的 `lib`**，
当时什么都没提交，所以那两次比的是旧 `lib/`，**没有覆盖重建后的 `lib/`**。
**真机隔离 soak（模型监工那条腿第一次真跑通）：`PASS`。** 从线上 `web` profile 克隆到 `.tmp/soak-sup/`（独立 `DSH_HOME` + 独立 `HOME`；
克隆 7699 文件、parity 5/5、1 行凭据按设计脱敏），实例在 `127.0.0.1:3199`，真 `dsh` 0.2.2-rc.3、真模型
`bifrost-responses` / `opencode-go/muse-spark-1.3-contributor`（`reasoningEffort: high`）；线上 `3080` 只做 `curl` 读状态（前后都是 `401`），
`~/.dsh` 零写入（三个目录 `stat` 前后 mtime 逐秒相同，`touch ~/.dsh/…` → `Read-only file system`），线上实例未重载未重启。
两份交付物都拿到：`f9d91ee7` attempt 2 与 `6da4687d` attempt 1 各一条 **`judged:true` 的 `pass`**（`route` 都是那条模型路由，`criteria` 全 `met:true`，
证据是交接原话）；`eda27615` attempt 2 一条**模型自己产的 `veto`**，`criteria [met:true, met:false]`，理由是监工自己的话
「监工认为这条验收没有被交接里的证据满足」——同一份交接先过了全部六条确定性检查，所以那行**不是** `deterministic`。
加时赛把 `roles.supervisor` 从克隆 profile 里删掉、同一端口重启后再开一单：`7466943e` attempt 1 的判决行写 **`route:"inherit"`** + `judged:true` + `outcome:"pass"`，
**「空链=继承会话路由」从假设变成实测**。账本在 `.tmp/soak-sup/dsh-home/taskboards/grok-workflow/`：`verdicts.jsonl` **6 行**
（`deterministic` veto → 模型 pass → 模型 pass → 监工调用失败 veto → 模型 veto → `inherit` pass），`blocks.jsonl` **11 行** = 四个块的版本（3/3/2/3），
`approval.quote` 每行都是用户那条纯文本 `确认`；原始行在 `ledger-extract.txt`，七条发现（F1–F7）的全文在 `soak.txt` §7。
**三条要带进产品的发现**：
① **F2（`CONFIRMED`）——闸门开着时四行交接不会变成判决回合，所以「开块流程」与「闸门」按现状互斥。** 闸门没有删掉用户消息
（消息还在会话里，模型读得到），它把消息从 inbox 拿走、自己派一个 worker 作答、再叫模型「只把标记之间的文字原样回给用户，不要自己回答，也不要调工具」；
`grok_open_block` 的**预览**能漏过去（run A 里模型没听话、照样调了），但**关单**漏不过去，所以块流程必须在 `/grok off` 下跑。
② **F3（`CONFIRMED`）——监工用散文答对、没有调 `structured_output` 时，宿主按「没交答案」处理，块被判成 `监工调用失败` 的 `veto`。**
`parseSupervisorAnswer` 其实能解析 JSON **字符串**（`tryJson`，带围栏或不带），但引擎只在 schema 工具被调用时才交出值，那条解析路径走不到；
`eda27615` attempt 1 就这样丢了一次真判断，attempt 2 换了措辞重交才拿到真判决。
③ **F1（本轮已订正）——「`/grok` 在 composer 里调不动」是传输方式造成的假象，不是产品缺陷。** run A 用 `POST /api/session/prompt` 发的是**消息**，
命令层不跑，所以那句被闸门当普通聊天处理（`triaged-chat`）；run B 用真 Chromium 把 `/grok on` 打进 composer 再回车，
`command/run` → `plugin:grok-workflow/mode` → `command/done` 三次都齐（seq 4–6 / 7–9 / 12–14）。
**本段按名字取代 0.13.34 收口那段的两条「故意没修」观察之一**：那段记的是「`src/config.ts` 的 `:226`、`:671`、`:679` 与 `src/index.ts:416`
写『the five tools / 五个工具』，实际注册六个」——本轮把它关掉了，而且关的范围比当时记的大（`src/types.ts:237`、`:300` 当时没被点名，
`:223` 是调度追加的）。另一条（`DECISIONS.md` 的 `D-050`/`D-051` 重复标题）**不在本轮范围，仍未修**。

Last updated: 2026-11-25 01:15 +08:00（**M2「接单台子」：代码写完、门禁两次全绿、真机隔离 soak `PASS`，`CONFIRMED`（两次 `TMPDIR=$PWD/.tmp npm run ci` 都 exit 0，最后一次 **`110 files / 2116 tests PASS`**，lint **`Found 36 warnings and 0 errors.`**；soak 四步走完、账本 3 行 v1→v2→v3、判决 3 行 `veto/veto/pass` 全部落盘）；**未发版、未 push、未合 `main`**）—
分支 **`feat/block-intake`**，worktree `/home/fish/projects_mine/dsh-grok-workflow/.agents/worktrees/feat-block-intake`，
基线是 `main` 尖端 **`9b55d2d`**（`docs(memory): close out the 0.13.33 release — merge, gate, tag, and both remote runs`）；
`node_modules` 是软链，所以 `npx vitest` / `npm run ci` 都在这棵树里跑。
**新增产品文件 11 个**：`src/block/` 8 个——`types.ts`(220) / `paths.ts`(60) / `store.ts`(439) / `preview.ts`(559) /
`approval.ts`(71) / `index.ts`(70) / `tools.ts`(740) / `brakes.ts`(238)；`src/supervisor/` 3 个——`index.ts`(214) /
`checks.ts`(254) / `verdict.ts`(321)。**新增测试 6 个 spec + 1 个夹具**：`test/block-ledger.spec.ts`(20 例) / `block-preview.spec.ts`(93 例) /
`block-tools.spec.ts`(21 例) / `block-supervisor.spec.ts`(20 例) / `block-flag.spec.ts`(8 例)，这五个合计 **162 例**
（`TMPDIR=$PWD/.tmp npx vitest run test/block-ledger.spec.ts test/block-preview.spec.ts test/block-tools.spec.ts test/block-supervisor.spec.ts test/block-flag.spec.ts` 单跑复核：**5 files / 162 tests PASS**，13.49 s）；
第六个是 `test/block-flag-baseline.spec.ts`（**12 例**，单跑 **1 file / 12 tests PASS**）+ 夹具
`test/fixtures/block-flag-baseline.json`（99477 B，由基线 `9b55d2d` 的源码跑同一批八个载荷生成，`id` 归一化，其余逐字节比对），
六个合计 **174 例**。**这个第六个 spec 是在那两次门禁之后才落地的**（写盘时间 01:12–01:13，见下面「读数的时间点」一段）。
**改动 9 个既有文件**：`src/config.ts`（`blockIntake` 进 `CONFIG_KEYS`，默认 `false`，**载入期**开关、不进 `volatile()`）、
`src/types.ts`（`GrokWorkflowConfig.blockIntake?` / `ResolvedConfig.blockIntake`）、`src/index.ts`（`blockIntake === true` 时才装
一个 `agent/pre-step` 窄监听 + 注册六个块工具，都在 `installGate` 之前）、`src/settings.ts`（投影过滤加 `blockIntake`，
页面字段 **16→17**）、`test/config.spec.ts`、`test/docs-config-keys.spec.ts`（键数 **19→20**）、`README.md`、
`README.zh-CN.md`、`docs/LOCAL-TESTING.md`；`lib/**` 由 `npm run build` 重建（新增 `lib/block/`、`lib/supervisor/`）。
**门禁（真跑过两次，都 exit 0）**：`TMPDIR=$PWD/.tmp npm run ci`，最后一次 **`110 files / 2116 tests PASS`**，
lint **`Found 36 warnings and 0 errors.`**（与基线同量、零新增），`verify:lib` 报
`lib/ at 9b55d2d is the build of src/ at 9b55d2d (249 files, byte-identical)`。**基线是 `105 files / 1954 tests`**，
所以那一次读数对应 **+5 文件 / +162 例**（1954 + 162 = 2116，逐项相等）。
**读数的时间点（照实说）**：`110 / 2116` 是 `test/block-flag-baseline.spec.ts` 落地**之前**那棵树上的读数；
之后这棵树多了那个 spec（12 例）与它的夹具，现在 `find test -name '*.spec.ts' | wc -l` = **111**，
两个新 spec 的单跑读数都是绿的（162 例 + 12 例）。**合起来的那棵树没有重跑全量门禁（`NOT_RUN`）**——
提交前/提交后那一次由调度跑，届时文件数会是 **111**、例数在 2116 上再加那 12 例（算术上是 2128），
**以实跑读数为准，别引用这里的推算**。
**`verify:lib` 这条读数要按字面读**：它比的是 **HEAD 的 `src` 与 HEAD 的 `lib`**，249 文件说的是「基线仍然一致」，
**还没覆盖**本轮新增的 `lib/block/**` 与 `lib/supervisor/**`；提交后 `lib/` 共 **293 个文件**，那一次复验由调度补（`NOT_RUN` 在本文件这一版）。
**红→绿**：五个 spec 都是先红后绿（第六个 `block-flag-baseline` 是对基线夹具的比对，没有单独的红阶段），
红证据在 `.tmp/red-block-*.txt`——四个是模块不存在
（`Cannot find module '../src/block/index.js'`），两个是行为红：基线载入器逐字拒绝 `unknown configuration key "blockIntake"`，
以及预览在基线树上 89 例全红（`block-preview` 现在 93 例）。
**真机隔离 soak（`/grok off` + 普通聊天 + 开块 + 交工）：`PASS`，四条缺口照实记**：
① 环境——`scripts/clone-profile.mjs` 从线上 `web` profile 克隆到 `.tmp/soak-m2/dsh-home`（7699 文件、parity 5/5、
1 行凭据按设计脱敏），独立 `HOME`，实例在 `127.0.0.1:3197`；线上 `100.111.111.88:3080` 全程未碰，`~/.dsh` 零写入
（`touch` 实测 `Read-only file system`）。
② 四项激活核对全过；会话 `request/header` 里六个块工具全在（`tools: 101`），模型随后真的调了其中四个。
③ 用户四步：`/grok off` 写入 `enabled:false`（全会话唯一一条 mode 记录）→ 普通聊天（无接单回执、无后台 run）→
`grok_open_block` 预览（`split_hash 8c3ad606…`）+ 回「确认」后 `mode:start` 拿到 `block_id` → `grok_close_block` 三次判决
`veto`（确定性闸门 5 条理由）→ `veto`（监工调用失败）→ **`pass`**，块走到 `accepted`。
④ 账本：`blocks.jsonl` 3 行 = 同一个块的 3 个版本（v1→v2→v3，追加式版本化），`splitHash` 64 位小写十六进制，
`approval.quote` 与用户原话逐字一致（`kind: user`）；`verdicts.jsonl` 3 行（`veto/veto/pass`，`by: plugin:block-supervisor`）。
证据：`.rsi/evidence/block-intake-2026-11-25/soak.txt` 与 `ledger-extract.txt`。
**缺口一（安装方式偏离）**：把插件软链到 worktree 根会挂——Node 解析真实路径后加载仓库自带的 `@deepseek-ai/*` 0.2.1-rc.2，
与宿主的 0.2.2-rc.3 不是同一个 `Session` 类，`/grok off` 报 `Receiver must be an instance of class Session`。改成把构建产物
拷进 profile（真实 `dsh plugin add` 的形态）后正常，拷进去的 `lib/index.js` 与 worktree 逐字节相同
（sha256 `4f362620…`）。这条已写进 `docs/LOCAL-TESTING.md` 的 trap 清单。
**缺口二（模型监工没跑起来）**：路由 `agent2api/deepseek-v4.1-flash` 缺 `AGENT2API_API_KEY`，隔离 home 里没有，所以那次
`pass` 带 `judged:false` + `not_judged`。**确定性闸门是真判了**（两次 `veto`），**独立模型裁决在真机上未验到**
（单测里用 fake engine 覆盖）——这是下一轮必须先补的那条。
**缺口三（模型路由）**：首个路由 `GLM 5.3 Flash (tokenrhythm)` 返回 `403 请先完成实名认证`，聊天改用 `muse-spark-1.3(oc)`
才通；那次失败回合留在会话里（`turn/end {kind:error}`）。
**缺口四（两条行为发现，记成 M3 候选、不是本轮的 bug）**：① 模型用 `ask_user_question` 卡片收确认时，用户点「提交」的
答案**不算用户消息**，`grok_open_block(start)` 会以 `approval-required` 被拒，必须另发一条纯文本「确认」；② 交接必须
**正好四行**，写成一行用「/」分隔会被 `veto`（确定性检查如实拒绝）。
**疑点（`HYPOTHESIS`，与本轮改动无关）**：composer 上的总开关在 `/grok off` 后显示「关」，下一回合又显示「开 · 全员模式」，
而会话账本里始终只有 `enabled:false`——开关显示疑似回落到 profile 默认值（`grokDefault: on`），本轮未深挖。
**`blockIntake` 默认 `off`**：off 时一个工具不注册、一个监听不装，`test/block-flag.spec.ts` 8 例钉住「决策与基线逐字节相同」。
**没做的事**：未发版（`package.json` 仍是 `0.13.33`）、未打 tag、未 push、未合 `main`、未删分支/worktree；
提交后 `verify:lib` 的 293 文件复验由调度补。

Last updated: 2026-11-24 23:56 +08:00（**已发版 `0.13.33`：完整流程补了一张前台、报告带上可选审计尾段、重复调用带序号，三件一起出去，`CONFIRMED`（本地两次门禁 exit 0 + 远端 `Release` 绿 + GitHub Release 已发布 + 远端 `CI` 双绿；两条远端 run 都是**第一次尝试就绿、零重跑**）** —
基线 `origin/main` 尖端 `1f70103`；本轮合流前本地 `main` 领先它 1 条且此前未推：`4da42c2`（`docs(spec): adopt grok-workflow v1 spec as accepted baseline`），
`git rev-list --left-right --count 1f70103...4da42c2` → 左 `0` / 右 `1`。从 `4da42c2` 开出 `release/0.13.33`，三次 `git merge --no-ff` 按派单固定顺序并入
**`feat/full-escape`**（merge `cfe8873`，**零冲突**，分支门禁 103 文件 / 1922 例）、**`feat/audit-render-half`**（merge `f572eee`，3 个冲突，102 文件 / 1923 例）、
**`fix/naming-resubmit`**（merge `c5b504d`，7 个冲突，102 文件 / 1929 例），另加合流记忆 `0645a7a`
（`docs(memory): record the 0.13.33 merge train — the D-131/132/133 renumbering, and the gate readings`），尖端 `0645a7a`。
冲突全在文档与 `lib/report*.map`：`CHANGELOG.md`、`docs/knowledge/{DECISIONS,HANDOFF,STATE,VALIDATION}.md` 与 `lib/report.d.ts.map`、`lib/report.js.map`，
一律取并集或重建覆盖。`src/report.ts` 是唯一两边都改的产品文件，由 `ort` **自动合并**、一行没手改；合完两条路径实测都在——审计尾段
`import { renderAuditTrail }`（`src/report.ts:14`）、`RenderReportOptions.auditTrail?: boolean`（`:1150`）、
`opts?.auditTrail === true ? … ${renderAuditTrail(report)} … : view`（`:1363`），与终稿稿号 `shippedSummaryDraft()`（`:1170`）、
`Summary review: … · final: draft N`（`:1248-1249`）。
**决策号撞号已重编**：三条分支各自都新增了一个 `## D-131`（`main` 当时最大是 D-130），按合入顺序重编为 **D-131**（`feat/full-escape` 保留）/
**D-132**（`feat/audit-render-half`）/ **D-133**（`fix/naming-resubmit`），全仓引用一并对齐（`docs/`、`CHANGELOG.md`、`src/` 与 `test/` 里的引用和注释），
两条被重编的条目末尾各留一句「（合流时由 D-131 重编为 D-13x）」括注，`.rsi/evidence/` 下的历史证据**一字未改**（那是当时的记录）。
撞号的处理口径本身补成 **D-134**（按合入顺序重编、最早那一支留号；被否掉的是 `D-131a/b/c` 后缀制、全部外移、只改新引用、回头改历史证据）。
**合流后门禁**（`TMPDIR=$PWD/.tmp npm run ci`，合流树 `e425295`——`git diff --stat e425295 0645a7a` 只差三个记忆文件，源码/测试/`lib` 一字节未变）：
**exit 0**，**`105 files / 1954 tests PASS`**，lint **`Found 36 warnings and 0 errors.`**，`verify:lib` **249 files byte-identical**。
1954 = 基线 1910 + 12（`feat/full-escape`）+ 13（`feat/audit-render-half`）+ 19（`fix/naming-resubmit`），**逐项相等**。
发版提交 `26628c2` = `chore(release): prepare v0.13.33`，**8 files / +22 −20**（与 `0.13.32` 的 `97687ce` 同构）：`package.json`(1/1)、`package-lock.json`(2/2)、
`src/client/index.js`(2/2，`PLUGIN_VERSION` / `UPDATE_LATEST`)、`lib/client.js`(2/2，随构建重建)、`CHANGELOG.md`(2/0，只加 `## [0.13.33] - 2026-11-24`
标题 + 空行，条目一字未改，`[Unreleased]` 留空)、`docs/LOCAL-TESTING.md`(3/3，tarball 名)、`README.md`(5/5)、`README.zh-CN.md`(5/5)。
**发版树自己那次门禁**（干净树，`TMPDIR=$PWD/.tmp npm run ci`）同样 **exit 0**：lint `36 warnings / 0 errors`、
`lib/ at 26628c2 is the build of src/ at 26628c2 (249 files, byte-identical)`、**`105 files / 1954 tests PASS`**（loadavg 1.68）。
合流与发版：`git merge --no-ff release/0.13.33 -m "merge: the full-shape front desk, the report's audit tail, and numbered call names"` → merge 提交 **`24d517e`**
（父 `4da42c2` + `26628c2`），`git diff --stat 26628c2 24d517e` **空**（两棵树完全相同，即 `main` 与 `release/0.13.33` 树相同）；附注 tag `v0.13.33` 打在
`24d517e`，标签对象 **`fadbd6e`**，message
`v0.13.33 — a greeting no longer pays for the whole team, a run that did not finish carries its machine record, and a repeated call says which one it is`；
推送**无 force**：`1f70103..24d517e  main -> main`、`* [new tag] v0.13.33 -> v0.13.33`；`git ls-remote origin refs/heads/main refs/tags/v0.13.33` 读回
`24d517e4f4290468733239c0e140adbfaa387710  refs/heads/main` 与 `fadbd6e195c6d8e49aca3a3f4d07d9632ab67d5f  refs/tags/v0.13.33`。
远端两条 run **一次绿、零重跑**：`Release` **45429377745**（event push，headBranch `v0.13.33`）**success**，唯一 job `Validate and publish v0.13.33`
15:46:29Z → 15:49:15Z（**2 分 46 秒**），16 个步骤全绿，已发布 <https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.33>，
标题 `Grok Workflow for DSH v0.13.33`，资产 `dsh-grok-workflow-0.13.33.tgz` = **967628 bytes**（`state=uploaded`，`sha256:165f2543…`），
`publishedAt` **2026-11-24T15:49:11Z**（＝本地 23:49:11 +08:00），非 draft、非 pre-release；`CI` **45429371302**（main push）**success**，
`Node 22` 15:46:27Z → 15:49:01Z（**2 分 34 秒**）、`Node 24` 15:46:27Z → 15:48:53Z（**2 分 26 秒**），两个 job 的 typecheck / lint / build /
`git diff --exit-code -- lib/` / `npm test` / `npm pack --dry-run` 全绿。
**合并后的整体 soak 没有重跑（`NOT_RUN`）**：三块各自的真机证据在 `.rsi/evidence/full-escape-2026-11-24/` 与 `.rsi/evidence/audit-render-half-2026-11-24/`，
能复用它的论证是「合流没改产品代码（`src/report.ts` 由 `ort` 自动合并）+ 发版提交只改版本常量、两个 README / `CHANGELOG` 与随构建走的 `lib/client.js`」，
而那两个版本常量正是 `test/docs-version.spec.ts` 与 `test/docs-config-keys.spec.ts` 钉住的，两例都在两次全量门禁里过了。
合流期间两路门禁并发跑时红过两条**既有负载敏感抖动**（`test/objective-limit.spec.ts` 一条，满载 30 s 超时，单跑 17/17 绿 ×3；
`test/full-behind-first-answer.spec.ts` 一条，`vi.waitFor` 默认 1 000 ms，负载下红，单跑 5/5 绿）——**未修、未改断言、未抬 `testTimeout`、未跳用例**，
最终两次门禁都一次跑绿、零重跑，远端两条 run 这次一条都没撞上。
收尾：四个 worktree（`feat-full-escape`、`feat-audit-render-half`、`fix-naming-resubmit`、`fix-timeout-probe-settle`）已 `git worktree remove`，
五个分支已 `git branch -d`（前三条 `ahead=0`、`fix/timeout-probe-settle` 也是 0、`release/0.13.33` 曾在 `26628c2`），
`git worktree list` 现在只剩主检出；`git status --short --branch` → `## main...origin/main`。**未删**：`feat/audit-layer`（D-130 取半记录，未合）与三条
`backup/wip-2026-11-24-*`（写死删除日 2026-11-27）。**本侧没有升 live profile（`BLOCKED`）**：调度与收口手的沙箱都只能写到工作区
（`workspace-write`），`~/.dsh` 不可写、审批提示被关掉，所以一行未写、未重载、未重启；留给操作员
`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.33`（钉 tag）并把版本读回成 `0.13.33`。）

Last updated: 2026-11-24 23:30 +08:00（**合流 `release/0.13.33`：三条分支按序并入、决策号重编为 D-131 / D-132 / D-133、全量门禁最终 exit 0（中间红过一次负载敏感的新用例），`CONFIRMED`；未发版、未打 tag、未 push、未删分支/worktree** —
从 `main` 尖端 `4da42c2` 开出 `release/0.13.33`，三次 `git merge --no-ff` 按序并入 **`feat/full-escape`**（merge `cfe8873`，**零冲突**）、
**`feat/audit-render-half`**（merge `f572eee`，3 个冲突）、**`fix/naming-resubmit`**（merge `c5b504d`，7 个冲突）；尖端 `c5b504d`。
`src/report.ts` 是唯一两边都改的产品文件：合并后 `auditTrail`（`src/report.ts:1150` 选项、`:1363` 尾部拼接、`import { renderAuditTrail }`）
与 `shippedSummaryDraft`（`:1170`）+ `Summary review: … · final: draft N`（`:1248-1249`）**两条路径都在**，自动合并干净、没有手改产品代码。
`lib/` 一律由 `src/` 重建（`npm run build`），`verify:lib` 报 **249 文件逐字节一致**。冲突全在文档与 `lib/*.map`：`CHANGELOG.md` 的
`[Unreleased]` 按语义归成 `### Added`（1 条，审计层）/ `### Changed`（5 条，前台 4 + 编号 1）/ `### Fixed`（1 条，replan 交底），
中英原文照搬；`docs/knowledge/{STATE,HANDOFF,VALIDATION}.md` 取并集（HANDOFF/STATE/VALIDATION 新的在上，`feat/audit-render-half`
那份 STATE/VALIDATION 块本来就是文件尾追加，保持原样）；`lib/report.d.ts.map` 与 `lib/report.js.map` 随便取一侧后重建覆盖。
**决策号撞号已重编**：`feat/full-escape` 保留 **D-131**（5 处引用未动），`feat/audit-render-half` 改 **D-132**（11 处引用：
`docs/ARCHITECTURE.md` 1、`HANDOFF` 3、`STATE` 1、`VALIDATION` 1、`src/index.ts` 1、`src/report.ts` 1、`test/human-output-contract.spec.ts` 2、
`test/report-audit.spec.ts` 1），`fix/naming-resubmit` 改 **D-133**（3 处：`HANDOFF` 2、`STATE` 1）；两条被重编的条目末尾各加了一句
「（合流时由 D-131 重编为 D-13x）」的括注，`.rsi/evidence/` 下的历史证据一字未改。**门禁**（`TMPDIR=$PWD/.tmp npm run ci`）本轮跑**四次**：`c5b504d` **exit 0**（105 文件 / 1954 例，187.88 s）→ `62643da` **exit 1**
（105 文件，`Tests 1 failed | 1953 passed (1954)`，173.46 s）→ `62643da` **exit 0**（182.98 s，loadavg 2.41）→ **`e425295` exit 0**
（105 文件 / 1954 例，203.36 s，**这是最终那次，也是本段所记录的树**）。四次的 lint 都是 **`Found 36 warnings and 0 errors.`**、
`verify:lib` 都是 **249 files byte-identical**（sha 随 HEAD 变）。
**中间那次红是一条负载敏感的新用例，不是合流回归**：`test/full-behind-first-answer.spec.ts > enters the live first answer…`，逐字
`Error: the report was not delivered as its own message`，停在 `vi.waitFor`（vitest 默认 1 000 ms）。判定依据四条：单跑 **5/5 绿**；
24 个 busy 循环下 **3/3 红**（3 条用例全红在 `vi.waitFor`，**没有一条是内容断言**）；`renderReport` 只被 PTC `render` 工具调用
（`src/index.ts:254`）、投递路径用 `src/delivery/` 自己的渲染器；该用例的报告 `status: 'completed'`，`auditTrail` 本来就关。
**断言、`testTimeout`、`vitest.config.ts`、skip/only 一律未动**——按「既有抖动按原样记录、不放宽断言」只记录。
它**不严格跟 loadavg 走**：红的那次与最终绿的那次（loadavg **16.01**）机器都不闲，说明这是一个 1 s 墙钟竞态，重负载下更容易撞上、
不是重负载才撞上。本段写入后只再改过三个记忆文档，`src/`、`test/`、`lib/`、`package.json` 一行未动，所以 `verify:lib` 那行的 sha
会随 HEAD 前进，但被校验的那对 `src/`↔`lib/` 逐字节关系不变。
对数：基线 101 文件 / 1910 例 + 分支1 的 2 文件 12 例 + 分支2 的 1 文件 13 例 + 分支3 的 1 文件 19 例 = **105 / 1954**，与实测逐项相等。
另一组在案的既有抖动（`test/gate.spec.ts` 的 refused-batch、`test/timeout.spec.ts` 两条无计时器探针）三次都绿。
**没做的（留给发版那一块）**：`package.json` 仍 `0.13.32`、`[Unreleased]` 未搬进发版段、未打 tag、未 push、未删三条分支与 worktree、
`~/.dsh` 一行未写、未重载、未重启。

Last updated: 2026-11-24 22:20 +08:00（**重复调用带序号名 + 终稿标「（定稿）」+ replan 交卷改「调工具 + 同棒补交」** —
worktree `.agents/worktrees/fix-naming-resubmit`，分支 `fix/naming-resubmit`，基线 `main` 尖端 `1f70103`（`0.13.32`），
本轮提交见 `HANDOFF.md` 顶部（一条，含 `src/`、`test/`、`lib/`、`CHANGELOG.md`、`docs/`）。三件事都是用户拍的：
①汇总多稿 `汇总·第1稿/第2稿/第3稿`（同一稿的 resubmit 仍是同一号）②规划腿 `规划（第1次）/（第2次）…`（开场 + 每个波边界）
③replan 提示词不再写「Answer with the structured result only」，改成明确要调结构化结果工具，并在 `format-error` 时同棒补交一次。
当天追加的第四条：过门那一稿在进度 Tab 标 `汇总·第N稿（定稿）`，走**新事件** `tool-workflow/summary-final`（载荷 `{runId, draft}`），
聊天面板不做（引擎对 `agent-start` 只 append 一行、`agent-end` 只按 seq 改状态、从不改 label）——这是拍板前提，不是本轮限制。
名字仍只有 `src/naming.ts` 一个真源，`namingSource()` 的 guest 副本同步加了 `plannerCallLabel` / `synthesisDraftLabel` /
`SYNTHESIS_FINAL_MARK`，`test/naming.spec.ts` 的一致性矩阵已覆盖；`parseMemberLabel` 新旧名字都认（含未来 `（定稿）` 后缀）；
`roleOfChildTitle` 改成先试整行再试 `·` 头。两份角色表（`src/progress-tab.ts` / `src/client/index.js`）各补 `规划` / `汇总`。
新真机用例 `test/naming-sequence.spec.ts`（6 条，`createEngineHarness` + `teamWorkflowEngine` + `settledWithin`）；
先红后绿：首轮 **11 failed / 187 passed（198）** 覆盖 4 个文件，实现后全绿。调度复核三条已落地：①replan 同棒补交
**进** `maxTotalAgentsFor()`（边界项 = `maxBoundaries × 2 × planner × waitFactor`，钉子见 planner-resubmit 的 cap 用例）
②「同一稿两行」只标 `order` 最大的那一行（两份折叠各一条用例）③文档里「补交吃 +2 余量、未进算式」的说法已作废。
门禁（本轮实测；提交与 sha 见 `HANDOFF.md` 顶部，回填 sha 前后只动过记忆文件）`npm run ci` **exit 0**：typecheck 干净、oxlint **36 warnings / 0 errors**、
`verify:lib` **245 files byte-identical**、vitest **102 files / 1929 tests PASS**。
`DECISIONS.md` 记 **D-133**（含被否决的「一稿/定稿二名制」「拆活/问改两名」「只改提示词不加兜底」「硬解析纯文本 JSON」与原因）；
`VALIDATION.md`、`HANDOFF.md` 同日各一条。没合流、没发版、没碰 `~/.dsh`；主检出一行未动。）

Last updated: 2026-11-24 21:34 +08:00（**完整流程（`/grok on`）补了一张前台：闲聊与单点事实直答、真任务先问再跑、首答在队轮前面；门禁在 `24f2f35` 上 exit 0，真机 soak 两相四场景全过，`CONFIRMED`** —
worktree `.agents/worktrees/feat-full-escape`，分支 `feat/full-escape`，基线 `main` 尖端 `1f70103`（`0.13.32`），本包六条提交：
`86c0fa2` 首答＋前言 → `597b444` channel 把前台调用单独记账 → `21f3616` 逃生口 → `8f40be1` 重建 `lib/` → `62f540f` 按状态结算
→ `24f2f35` 收尾换时间预算。产品面只动 `src/gate.ts`、`src/triage.ts`、`src/answer.ts` 与同一次构建的 `lib/`；
`package.json`、`cordis.patch.yml`、版本号一行未动。
`/grok on` 之下三条路：闲聊 → chat 模板直答、零 run；单点事实 → 一次 `quick-worker` 直答、零 run；真任务 → 先报拆法
（`full-escape-ask`）、零 run，回「确认」后由 `answerFullBehind` 起队轮并先给首答 +「已接单：上面这一两句是先答…」。
部署级 `mode:'full'`（没有会话记录）三条路逐字节照旧——逃生口只认会话记录 `workflowMode:'full'`（D-131）。
门禁 `TMPDIR=$PWD/.tmp npm run ci` 在 `24f2f35` 上 **exit 0**：typecheck 干净；lint `Found 36 warnings and 0 errors`（173 文件）；
`verify:lib` → `lib/ at 24f2f35 is the build of src/ at 24f2f35 (245 files, byte-identical)`；vitest **103 files / 1922 tests PASS**（172.72 s）。
**这条门禁在前面两个提交上各红过一次**（`8f40be1`、`62f540f`，都是 `test/grok-on-ingress.spec.ts` 那条饱和队列用例的
「the blocking step never settled」／`expected false to be true`，`1 failed | 1921 passed`）；执行手在 loadavg 31 下也没能复现，
最后把「有界轮数 × 50 ms」的收尾预算换成 `landedWithin(…, 15_000, 'the blocking step')`——按状态结算所有未结算的 run，不依赖 `at(-1)`，
断言未放宽。用例红→绿：`test/full-escape.spec.ts` 在基线副本上 **4 红 1 绿**、`test/full-behind-first-answer.spec.ts` 在基线副本上 **4/4 红**。
真机 soak 两相四场景（证据 `.rsi/evidence/full-escape-2026-11-24/soak.md`）：相 A 在基线 `1f70103` 上复现旧行为（回合只有禁言模板，
`run-start=1 agent-start=3 guardian-start=1`，裂出规划/执行/核验三个子会话，worker 真跑 `curl open-meteo`、`curl wttr.in`、`web_search`）；
相 B 三场景 PASS（B1 天气直答、`run-start=0 agent-start=0`，但**派了一个零工具调用的轻量工人**，不是零子智能体；
B2 `seq25` 问 → `seq29` turn=2「确认」→ `seq37` 才 `run-start`，回执三层齐全；B3 闲聊直答、零子会话零工具）。
缺口照实：相 A 的后台报告没等落地；B2/B3 部分判据靠读 GUI 正文 + 会话序号；模型用的是 `agent2api/deepseek-v4.1-flash`
（点名的 `wb/cn:deepseek-v4.1-flash` 当时连续 6 次 503）；3080「没重启」只有间接证据（端口仍在听、仍 401、`~/.dsh/profiles` 零写入）。
soak 证据的 85 个 `soak-` 前缀文件已在收尾时逐字节核对后从主检出搬进本分支（其中 3 个 `soak-B?-drive.log` 被 `.gitignore`
的 `*.log` 挡住、未入库，耗时数字另有入库的 `soak-B?_run.json` 覆盖），主检出那一份已删、它那边 `git status --short` 回到空。
**没合流、没发版、没 push、没升 live profile**；远端 Node 22/24 矩阵 `NOT_RUN`。）

Last updated: 2026-11-24 19:45 +08:00（**两条无计时器探针改由探针持钟：远端 Node 24 那次红转绿；同包清掉 `team-dispatch-v1` 分支与 worktree；`feat/audit-layer` 记为 D-130 取半记录；三条 `backup/wip` 写死 2026-11-27 删除日** —
worktree `.agents/worktrees/fix-timeout-probe-settle`，分支 `fix/timeout-probe-settle`，基线 `main` 尖端 `ca65df8`（`0.13.32`），代码提交 **`141dccd`**
只含 `test/timeout.spec.ts`（+19 / −8）。病是 `c1ebdf3` 记过的同一条：两条用例等的是无计时器 realm 的结算，钟却是 runner 的——
远端 CI run **45378449742**（`main` `ca65df8`）里 **Node 24 红**（`races on Atomics.waitAsync where no setTimeout exists`，
`Error: Test timed out in 30000ms.`，`Tests 1 failed | 1909 passed (1910)`），Node 22 绿。修法是让等待自己持钟：
`settledWithin(…, 15_000, <具名>)`，不落地就抛 `<what> did not settle within 15000 ms`——**收紧不是放宽**，断言、用例 `20_000`、
`testTimeout: 30_000`、skip/only、`vitest.config.ts`、`noTimerScript` 的文本破坏全没动，`src/`/`lib/`/版本号一行未动。
本地修前红 **`NOT_RUN`**：8 种打法逐行相加 **102** 次执行 **0 红**（自然单条各 20、18/24 个 busy 循环下的单条与整文件、Node 22.23.4、
全量套件 3 次、`--pool=threads` 20 次），所以本地只能证「修后同口径仍绿」；**Node 24 本机 `NOT_RUN`**，它的证据只来自远端。
修后本地：24 个 busy 循环下两条各 15 次 → **30/30 绿**（Atomics 53–69 ms、兜底 1211–1572 ms，仍是预算驱动）；整文件 5/5；`--pool=forks` 1/1；
Node 22.23.4 整文件 3/3；typecheck 干净、lint **36 warnings / 0 errors**。门禁（调度实测）`npm run ci` 在 `141dccd` 上 **exit 0**：
`verify:lib` **245 files byte-identical**、vitest **101 files / 1910 tests PASS**（122.98 s）。远端 **PR #48** run **45385807284**
**Node 22 pass 2m12s / Node 24 pass 2m29s**，两段各自 `Test Files 101 passed (101)` ⇒ `main` 上那次 Node 24 红**已转绿**。
同包清账：`team-dispatch-v1` 删前 `ahead=0 / behind=11`、尖端 `0b686da`（经 `dc69c6e` 进 `main`）、worktree `git status --porcelain` 0 行，
`git worktree remove` + `git branch -d` 成功（**口径修正**：派单说「已合超 24 h」不实，尖端 16:49、合流 17:01，距删除约 2 小时；
安全依据是 ahead=0 + 工作树干净 + 内容在 `main` 里）。三条 `backup/wip-2026-11-24-*`（`de7ba6a` ahead=1、`292a4ae` ahead=4、`b91ff17` ahead=1，
创建于 16:01–16:02）保留并**写死删除日 2026-11-27**，任一提前合入或判无价值则当天即删；对应补丁在 `.session-stage/patches/`（gitignore，不是跨机器真源）。
`feat/audit-layer` 本轮**不合**，只按「取半记录」进 `DECISIONS.md` D-130：git 侧实测 `CONFIRMED`（`7626233`、ahead=1 / behind=500、
12 files +996/−94、`merge-tree` 6 个冲突路径），功能评估 `NOT_RUN`（没跑它的 417 行用例、没 rebase）。本包已推 `origin/fix/timeout-probe-settle`
并开 **PR #48**（run **45385807284** 双绿），**没合流、没发版**，
主检出与 `~/.dsh` 一行未动。）

Last updated: 2026-11-24 18:48 +08:00（**已发版 `0.13.32`：设置页的升级按钮装进了产品，`CONFIRMED`（本地门禁 exit 0 + 远端 Release 绿 + GitHub Release 已发布；远端 CI 首次一条既有探针红、`--failed` 重跑后双绿）** —
基线 `main` 尖端 `c6a3611`（＝`origin/main`），分支 `feat/update-button`（worktree `.agents/worktrees/feat-update-button`）3 条领先 / 0 条落后：
`git rev-list --left-right --count main...feat/update-button` → 左 `0` / 右 `3`，三条是 `c951dbf` feat(update) 设置页升级按钮、`a0bed98` 与 `09a21c2` docs(memory)。
从 `c6a3611` 开出 `release/0.13.32` 后 `git merge --ff-only feat/update-button` **快进到 `09a21c2`，没有用到解冲突那一步**——分支本来就是从当前尖端切出来的，
所以计划里的冲突处理是空操作。功能体：`src/update-surface.ts`（新增，802 行）、`src/index.ts`（+8）、`src/client/index.js`（396 改动行）、
`test/update-surface.spec.ts`（新增，752 行）、`test/update-entry.spec.ts`（+549）、证据 `.rsi/evidence/update-button-soak-2026-11-24/`、`DECISIONS.md` D-129。
发版提交 `97687ce` = `chore(release): prepare v0.13.32`，8 files / +22 −20：`package.json`、`package-lock.json`（2 处）、`src/client/index.js`
（`PLUGIN_VERSION` + `UPDATE_LATEST`）、重建的 `lib/client.js`、`docs/LOCAL-TESTING.md`（3 个 tarball 名）、`README.md` 与 `README.zh-CN.md`
（安装钉、声明版本、“current release” 说明、已发布 tag 列表收到 `v0.13.32`）、`CHANGELOG.md`（分支的 `[Unreleased]` 条目原文搬到新的
`## [0.13.32] - 2026-11-24` 下，`[Unreleased]` 留空）。残留的 `0.13.31` 字样都是正当历史：`## [0.13.31]` 标题、两个 README 的 tag 列表、
客户端包里把 0.13.31/0.13.32 当「陈旧构建 vs 更新发布」举例的注释散文。
本地门禁 `TMPDIR=$PWD/.tmp npm run ci` 在发版树 `97687ce` 上 **exit 0**（只跑一次）：typecheck 干净、`oxlint src test` →
`Found 36 warnings and 0 errors`（171 文件，全是既有）、`verify:lib` → `lib/ at 97687ce is the build of src/ at 97687ce (245 files, byte-identical)`、
vitest **101 files / 1910 tests PASS**（160.97 s）。真机 soak **没有重跑**，照实说：合流是快进，合流那一刻没有一行产品代码变化；
之后唯一的产品代码改动是 `src/client/index.js` 的两个版本常量（重建进 `lib/client.js`），而这两个常量正是 `test/update-entry.spec.ts` 与
`test/docs-config-keys.spec.ts` 钉住的。soak 证据三跑两过：run3（`run3.out`、`run3-result.json`、四张相屏幕截图）经真 GitHub fetch + 真 pnpm +
真 profile 写入把 0.13.30 装到 0.13.31，并读回 `INSTALLED_VERSION=0.13.31` / `PROFILE_SPEC="github:free6589/dsh-grok-workflow#v0.13.31"`；
run1（`run1-result.json`）四相同形、没留读盘那一行；run2 红在 harness（新构建替换页面时元素句柄已脱离）而不是产品，盘上仍读到 `INSTALLED_VERSION=0.13.31`。
合流与发版：`git merge --no-ff release/0.13.32 -m "merge: settings-page upgrade button — one click checks and installs the newest release"` → merge 提交
`3a9f7bd`，`git diff --stat main release/0.13.32` **空**（两棵树完全相同）；附注 tag `v0.13.32` 打在 `3a9f7bd`，标签对象 `53ac1e4`，message
`v0.13.32 — the settings page can install its own update`；推送无 force：`c6a3611..3a9f7bd  main -> main`、`* [new tag] v0.13.32 -> v0.13.32`，
`git ls-remote --tags origin v0.13.32` → `53ac1e4529d3f3e0d6a2a0e6977eab0df39fc645  refs/tags/v0.13.32`。
远端 `Release` run **45376772379**（event push，headBranch `v0.13.32`）**success**：已发布 <https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.32>，
标题 `Grok Workflow for DSH v0.13.32`，资产 `dsh-grok-workflow-0.13.32.tgz` = **947276 bytes**，`2026-11-24T10:41:30Z` 发布；发布说明是从
`## [0.13.32] - 2026-11-24` 段抽出来的，说明升格后的锚点被接住了。远端 `CI` run **45376766890**（main push）首次**红**：只有 `Node 24` 的
`Run npm test` 挂，恰好一条 `test/timeout.spec.ts > the timer the engine realm really has > races on Atomics.waitAsync where no setTimeout exists`
（`Error: Test timed out in 30000ms`，`Test Files 1 failed | 100 passed (101)`），它前面每一步全绿（typecheck、lint、build、`git diff --exit-code -- lib/`）；
同一次尝试的 `Node 22` 绿，Release 自己跑的 `npm test`（Node 22）也绿。来源核查：`git log --oneline -1 -- test/timeout.spec.ts` → `d7f8df6`；
`git log --oneline c6a3611..3a9f7bd -- test/timeout.spec.ts src/timeout.ts` → **空**，本版没碰过这两个文件——与在案的 vitest realm 等待器抖动同族
（guest realm 没有 `setTimeout`，`Atomics.waitAsync` 的等待器不被服务，只有 runner 的 30 s 超时能收尾），既有、非本版引入。按既有政策只做了
`gh run rerun 45376766890 --failed`（没改断言、没抬 `testTimeout`、没跳过），两个 job 都 **success**，run **completed/success**。
收尾：`git worktree remove .agents/worktrees/feat-update-button`；`git branch -d feat/update-button`（曾在 `09a21c2`）与
`git branch -d release/0.13.32`（曾在 `97687ce`）；`git status --short --branch` → `## main...origin/main`，树干净；
`.agents/worktrees/team-dispatch-v1`（未合分支）故意没动。**本侧没有升 live profile（`BLOCKED`）**：AGENTS §11 没有执行——调度的沙箱只能写到
工作区（`workspace-write`），`~/.dsh` 不可写、审批提示被关掉，所以一行未写、未重载、未重启；留给操作员
`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.32`（钉 tag）并把版本读回成 `0.13.32`。）

Last updated: 2026-11-24 16:50 +08:00（**`team-dispatch-v1` 已 rebase 到 `main` `369d6e3`：认领锁与到达顺序保住、旧 `board.json` 未复活，全仓门禁 `exit 0`，`CONFIRMED`** —
3 条提交重放（`df89a95` taskboard 锁 + 磁盘 CAS → `4f25f15` dispatcher 队列/寻址 → `1fddad2` 记忆），另加两条收尾（`77d05f8` 重建 `lib/`、本轮记忆提交）。口径是「保留 main 的新架构、只搬真新增」：`src/dispatcher/session.ts`、`dispatcher.ts` 整份取 main（分支那份自带 `board.json` 的会话被 main `9dc7624` 的 `TaskBoard`/`boardReader`/`decideIntent` 取代，复活它会重新引入第二个板文件），`policy.ts` 取分支（main 从未改过该文件），`src/taskboard/store.ts` 由三方合并自动同时保住 main 的 `has()` 与分支的锁。分支的「到达顺序」按 main 的结构重做：`TaskRecord.seq`（落盘、锁内取 `max+1`）+ `TaskBoard.arrival()` + `DispatcherSession.pending()` + `resume().pending`，没搬分支那份 v2 板文件。门禁 `npm run ci` **exit 0**：typecheck 干净、oxlint **0 errors / 36 warnings**、`verify:lib` **241 files byte-identical**、vitest **100 files / 1866 tests PASS**。新增用例 21 例（taskboard 13 例、其中 1 例替换 main 旧的竞态断言；dispatcher 8 例）。跨进程差分实测：main `lib` 12 个进程各认领各一行 → 12/12 都报成功，盘上只活 5 / 6 / 7 行（连跑 3 次，丢 4–7 行）；rebase 后 3 次都 12/12 全活。FIFO 探针：main 重开后 `list()` 是 id 序、到达序丢失；rebase 后 `list()` 不变、`arrival()` 回到创建序。未合流、未 push、未打 tag、未碰 `~/.dsh`；主检出工作树一行未动；探针只在 `.tmp/` 且已删。）

Last updated: 2026-11-24 16:12 +08:00（**清包收口：19 条已合分支删净、三处悬空活双份落盘、三条未合分支各有结论，`CONFIRMED`（逐条 ahead=0 与 tree 相等均为实测；纯文档 + 证据，`src`/`test`/`lib` 一行未动，`npm run ci` 因无源码改动 `NOT_RUN`）** — 19 条删前 `main..<b>` 全为 0、全部用 `-d`；连带移除 5 个 worktree，其中 `fix-null-collapse-t1`、`rsi-soak-65` 因未跟踪取证目录被拒后才 `--force`（删前已按 sha256 复核主树副本逐字节相同）；`rsi/redrive-13` 用 `-D`（`ahead=7`），归档在 `.session-stage/patches/redrive-13-2026-11-24/` 与 `.session-stage/archive/redrive-13-evidence-2026-11-24.tar.gz`（解包 24/24 逐字节一致）；三份补丁 75374 / 192596 / 286000 B 落在各自 base 上 tree 精确复现、对当前 `main` 不能干净落地（`git apply --check` 报 9/9/8 个文件落不上；`git apply --3way` 才是冲突文件 5/7/8、冲突标记 5/9/13），要落 `main` 需另开 rebase 包、本包不 rebase；`feat/audit-layer` 冲突实测只有 6 个路径（2 个手写文件 + 4 个 `lib/` 生成物）→ rebase 后再评估合，`team-dispatch-v1` → rebase 后合；13 项无 tracked 引用的取证退役进 `.session-stage/archive/evidence-retired-2026-11-24/`（`MANIFEST.md` 逐条记原路径/大小/理由），23 个被引用文件进库；旧盘点 `manual-sessions-unfinished.md` 第二节 6 件在当前 `main` 上**全部已关闭**（④ 只是"入口成立、非真一键"），原文件退役不删。详见 `HANDOFF.md` 顶部本节
Last updated: 2026-11-24 16:05 +08:00（**已发版 `0.13.30`：同一份报告的两个机器视图说上同一句话，门禁不再因为机器忙就红，`CONFIRMED`（本地门禁 exit 0 + 远端 CI/Release 双绿 + GitHub Release 已发布）** —
基线 `main` 尖端 `4f616d1`（`merge: ledger and report diagnostics parity`）＝`origin/main`，合流分支已经并进去了；发版提交 `10af79b`
= `chore(release): prepare v0.13.30`，8 files / +32 −20（`CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`docs/LOCAL-TESTING.md`、
`lib/client.js`、`package-lock.json`、`package.json`、`src/client/index.js`）。本版三件：① **两条机器视图对齐**——台账现在渲染报告
自己的诊断块（死路由、每次子调用的预算、两个分开的溢出标题、错误行保留类别、收尾两行在截断之前预留），于是同一份报告的两个视图
不再各说一句话；② **门禁不再因为机器忙就红**——两条负载敏感用例改成等后台轮「落地」（`landedWithin`，探针自己持 ref 住的
15 000 ms timer）而不是等它「开跑」，test-only，`src/`、`lib/` 一行未动，动的是门禁不是产品（修法在 `a210b08`，已随本版出去）；
③ **挂死形状取证**——只出证据不出代码，`.rsi/evidence/soak-hang-shape-2026-11-24/` 记的是五个任务的真机一轮：挂死路整轮被调用
**3 次**（任务 1 自己两次尝试；任务 2–5 一次没打它，全落在活路），每次挂死调用都由这一轮自己的 45 s 子调用预算结算（端点侧
44.65–44.93 s，差额是子代理自己的启动开销），第 3 次是传输层 300 s 后把第一次尝试遗留的孤儿请求原样重发（请求体字节数相同），
两轮独立复现形状一致。版本被钉在**四处**，四处都动了：`package.json` + `package-lock.json`（2 处）、`docs/LOCAL-TESTING.md`
的打包产物名（3 处）、`src/client/index.js` 的 `PLUGIN_VERSION`/`UPDATE_LATEST`（`lib/client.js` 随 `npm run build` 重建）；
两个 README 也一起走（声明版本、两条安装钉、散文里的 `#vX.Y.Z`、发布 tag 列表收到 `v0.13.30`）。本地门禁
`TMPDIR=$PWD/.tmp npm run ci` 在发版树上 **exit 0**：typecheck 干净、oxlint **0 errors / 36 warnings**（全既有）、
`verify:lib` byte-identical **237 files**、vitest **100 files / 1846 tests PASS**（150.39 s）；本轮 `npm run ci` 只跑**一次**
（0.13.29 那轮跑了 12 次、其中 6 次红在挂死探针的 30 s 超时上——那些探针的修法 `a210b08` 就在本版里）。一句要照实说的口径：
本地 `verify:lib` 那行报的是 HEAD 那棵树（`lib/ at 4f616d1 …`），因为跑门禁时工作区还带着未提交的版本改动；真正管发版的那条是
Release workflow 在**打了 tag 的提交**上跑的 `git diff --exit-code -- lib/`，它在远端过了。打的是**附注** tag `v0.13.30`，message
`v0.13.30 — one report's two machine views agree, on a gate that stopped failing on a busy machine`，已 push；`main` push
`4f616d1..10af79b`。远端两条 run 都 **success**：`CI` **45349629702**（main push）、`Release` **45349634592**（tag push），
已发布 <https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.30>，资产 `dsh-grok-workflow-0.13.30.tgz`
（917 321 bytes）。取证目录 `.rsi/evidence/soak-hang-shape-2026-11-24/` 在准备发版时还是未跟踪的（「记忆未归档」），
**已随本次归档一起提交**，`VALIDATION.md` 首条指向它。收尾：两个已合并且干净的 worktree 连分支删掉
（`feat/dead-routes` 在 `0113211`、`release/0.13.27` 在 `2141071`）；另**六个**没敢动（带未提交的活或未合的分支）：
`.agents/worktrees/fix-null-collapse-t1`（已合，1 条脏）、`.agents/worktrees/fix-progress-task-number-first`（已合，9）、
`.agents/worktrees/rsi-soak-65`（已合，1）、`.agents/worktrees/rsi-redrive-13`（分支**未合**，干净）、
`.agents/worktrees/team-dispatch-v1`（分支**未合**，15 脏）、`.tmp/wt-steer`（已合，17 脏）；`rsi/redrive-13`、
`team-dispatch-v1`、`feat/audit-layer` 仍是未合分支，十二条已合的 `rsi/sec2-*`/`rsi/sec3-*` 还在、且已经过了 2026-11-24 的删除日。
`.rsi/STOP`（tracked，`Operator stop — RSI self-iteration halted 2026-11-21`）此前被某个会话在工作树里删掉、没有提交解释，
这次 `git checkout -- .rsi/STOP` 复原，操作员记录的停止仍然有效。**本侧没有升 live profile（`BLOCKED`）**：调度的沙箱写不到
工作区以外，把 live profile 钉到 `v0.13.30` 留给操作员，
`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.30`。）

Last updated: 2026-11-24 14:20 +08:00（**两条负载敏感 spec 改成等后台轮「落地」再断言，`test/` only，`CONFIRMED`（修者与验收方各自实测），未发版、未 push** —
分支 `fix/flaky-triage-phase1`，两个提交：`a210b08`（test-only 修法）+ 随后一个 `docs(memory)`。抖的是「开跑 ≠ 落地」这条缝：
`phase1-dialogue.spec.ts` 等 `startCalls.length === 2`、`triage.spec.ts` 的 `route()` 用 vitest 默认 1 000 ms 的 `vi.waitFor` 等 `agent.followups`，
而闸门为整轮留着这条会话的插话通道、直到报告投递之后才在 `runChannelRound` 的 `finally` 关掉（`src/gate.ts`），于是窗口里到的消息被并进正在跑的轮 ——
前台该给答案的位置出现了 `已收到，并入了正在跑的这一轮（待并入 1 条）…`。修前：修者 `LOAD=16 N=15` 单跑 `phase1-dialogue` **15/15 红**
（只有 `P0-2 … consumes a pending question once…` 一条，33 个负载样本里没有第二条；另外四个 `P0-2` 用例等的是同一个缝，一并改了），
`LOAD=12 N=8` 单跑 `triage` **0/8 红**（要两个文件一起压才现形；验收方 10 次混合跑里 1 次红，4 条，级联来自共用会话 id `sess-triage`、
队列计数 `1 条 → 2 条 → 3 条`），验收方修前同 harness **10/10 红**（loadavg 19–28）。修法只在测试侧：`test/helpers.ts` 新增
`landedWithin(condition, ms, what)`（`settledWithin` 的姊妹，持 ref 住的 timer、以 15 000 ms 为界、具名失败
`"<what> did not land within 15000 ms"`），两个 spec 各一个本地等待（报告已投递 **且** 插话通道已消失）替换全部「等开跑」的站点；
断言、`testTimeout`、`skip`/`only`、配置、`package.json` 一律没动。修后：修者 `LOAD=12 N=10` **0/10**（loadavg 22.6→26.4）、
`LOAD=16 N=5` **0/5**；验收方 `LOAD=12 N=10` **0/10**（loadavg 9.2→14.4，低于修前那档，不能单独当 A/B）、
`LOAD=20 N=6` **0/6**（loadavg 20.0→21.9，落在修前带里，是有效 A/B）。门禁 `npm run ci` 双方各一次 **exit 0**：
99 files / 1837 tests、lint 0 errors / 36 warnings、`verify:lib` 在 `4a2f7fd`（修者）与 `a210b08`（验收方）都 byte-identical（237 files）。
**`src/`、`lib/` 一行未动**，所以没有版本号变动、没有发版、没有 CHANGELOG 条目；机制、变异测试、`HYPOTHESIS`（一次超 15 s 未落地的尾巴没归因）
与缺口（Node 22/24 `NOT_RUN`；真机 soak `NOT_RUN` 且证明不了这个 diff）见 `VALIDATION.md` 首条，证据 `.rsi/evidence/flaky-triage-phase1/`。）

Last updated: 2026-11-24 10:05 +08:00（**已备好发版 `0.13.29`：三处救援在同一条跑里都成立，`CONFIRMED`（真机 soak 三场景 PASS + 本地门禁 exit 0）** —
本提交是 `chore(release): prepare v0.13.29`（版本 0.13.28 → 0.13.29，CHANGELOG 的三条 `Fixed` 从 `[Unreleased]` 移入
`## [0.13.29] - 2026-11-24`，`[Unreleased]` 留空）。五条来源分支按序合入 `release/0.13.29`（`2141071` →
`34681ae` planner → `a8fd9ba` judge → `7287ee4` key → `4193245` AGENTS §9 → `aebe65a` AGENTS §10/§11）。
版本不是只改一处：`package.json` + `package-lock.json`、`CHANGELOG.md`、`docs/LOCAL-TESTING.md` 的 tarball 名、
设置页的 `PLUGIN_VERSION`/`UPDATE_LATEST`（`src/client/index.js`，`lib/client.js` 随构建重建）四处必须同步，
漏一处 `docs-config-keys.spec.ts`/`update-entry.spec.ts` 就红。三处救援：① 规划腿不再因为一次格式错或一次传输死就退化成兜底（同次重交 + 换路重打，`PLANNER_LEG_CALLS = 3`，D-122）；
② 判定腿（verifier/supervisor）死于传输时在同一次 attempt 内补打这条腿一次，不重跑最贵的 worker（`judgeRetried`，D-123）；
③ 401/403 的密钥被拒带着服务商原话回到脚本、按真因写进报告，且仍然不进死路由表（D-124）。合流期两条预算同时抬，
对账见 D-125。本地门禁 `npm run ci` **exit 0**：typecheck 干净、lint **0 errors / 36 warnings**（全既有）、
`verify:lib` byte-identical（237 files）、vitest **99 files / 1837 tests PASS**（128.05 s）。合流 + 发版准备期间 `npm run ci` 共跑 **12 次：6 次**被挂死探针的 30 s 超时打红（每次只红 1 条），5 次绿，1 次因版本
钉在四处而红（已修）
（`dead-routes.spec.ts > counts a call that hung …`、`planner-resubmit.spec.ts > keeps a recovered leg …`）。**这不是本版引入的**，
已测过：把 `2141071`（已发的 0.13.28）整棵树解到 scratch 里，同一个 `dead-routes.spec.ts` 单跑 **6/12 红**；HEAD 上同一文件
单跑 **6/15 红**——同一个 30 s 挂死，基线一样。两次全量红的额外墙钟就是这两次 30 s 超时本身（tests 段 130–161 s vs 绿轮 ~103 s）。
**没有**改断言、没有抬 `testTimeout`、没有跳过用例；门禁跑到绿为止（数字见上）。**发版风险**：远端 runner 若在这条上红，
先 `gh run rerun --failed`（`v0.13.27` 就是这样红的），不要为此改断言或抬 `testTimeout`；这两条挂死探针的收窄是后续单独一刀。真机 soak（隔离 `DSH_HOME` + 假端点 + 本机网关，`maxConcurrency: 1`、`childTimeoutMs: 90000`）
三场景 PASS，证据 `.rsi/evidence/soak-release-01329/`：规划腿换路重打（死路只付 1 次、`Plan: planner`）、判定腿补打
（worker 1 行、verifier 同行 2 行、`judgeRetried=true`）、被拒密钥（每 attempt 1 次请求、`model-unavailable` 带
服务商原话、报告无 `Dead routes`）。**远端 CI/Release 的 run id 与发布结果不在本提交里**：它们要 push 之后才存在，
落在随后的跟进 docs 提交。
本版另带第二笔提交（`c1ebdf3`，test-only，`src/`、`lib/` 一行未动）：两条挂死探针（`dead-routes` 的「counts a call that hung」
与 `planner-resubmit` 的「keeps a recovered leg」）在 vitest worker 里偶发不上结算 —— guest realm 没有 `setTimeout`，脚本的
子调用预算由 `Atomics.waitAsync` 送，那个延迟任务会一直不被服务，整次跑于是只剩 runner 的 30 s 超时能收尾（`f803b48` 上两文件
连跑 **4/10 红**、逐字 `Test timed out in 30000ms`；更早样本 1/6）。修法是换「谁持钟」：`test/helpers.ts` 的
`settledWithin(promise, ms, what)` 在等待期间保持一个 ref 住的 timer，以探针自己的 **15 000 ms** 为界、超界报
`"<what> did not settle within 15000 ms"`，断言/超时/`skip`/`only`/配置一律没动；修后两文件连跑 15 次全绿、交付树上再 3 次绿，
预算仍由脚本结算（挂死例 2 025 ms、救回例 1 012 ms）。**值得在打 tag 前做，就因为它正是 `v0.13.27` 远端挂掉的那一条**：
留着它，发版门禁就是在抛硬币。机制、A/B、变异测试与缺口见 `VALIDATION.md` 首条（Node 24 `NOT_RUN`；产品侧无 timer 的预算路径
`NOT_RUN`，要靠真机 soak）。本轮未 push、未打 tag、未发版，按 §7 由发版方接手。）

Last updated: 2026-11-24 08:44 +08:00（**401/403 也回灌给脚本了，但它不把路由记成死路，`CONFIRMED`（单测 + 门禁），未发版、未合流** —
分支 `fix/forward-model-unavailable`（worktree `.agents/worktrees/fix-forward-model-unavailable`，从 `main` `8f34701`＝0.13.28 开出；
共享脏树 `a6103ad` 一行未动）。之前只有四个传输族的死因会带着 `CHILD_DEATH: <class>: <原话>` 回到脚本，密钥被拒（401/403、
未知模型，代码里的 `AUTH` 都归 `model-unavailable`）仍旧被写成「格式不对」，而且脚本还会为它白补交一次。现在两侧各一张表：
宿主 `CHILD_DEATH_FAMILIES` = 五族（转发面，多一个 `model-unavailable`），guest 新增同名常量当回读闸门（同样五族），而
`ROUTE_HEALTH_FAMILIES`（记账面）保持四族——所以密钥被拒会换路、永远不会被记成死路（换 key 才是解法）。代价：401/403 不再补交，
路由台账那一行由脚本自己按类写、宿主不再事后改写。门禁：`npm run ci` exit 0（**97 files / 1820 tests**，typecheck 干净、
lint 0 errors / 36 warnings 全既有、`verify:lib` byte-identical）；新断言在旧码上 4 红 → 修后 53 绿。隔离真机 soak（坏 key 场景）
`NOT_RUN`，留给合流方。取舍与被改写的三条旧断言见 D-124 与 VALIDATION 首条。）

Last updated: 2026-11-24 09:05 +08:00（**判定腿同 attempt 补打（第二刀）：`CONFIRMED`（单测 + 全量门禁），未合流、未发版** —
分支 `feat/leg-retry`（worktree `.agents/worktrees/feat-leg-retry`，从 `main` `8f34701`＝0.13.28 开出；共享脏树 detached
`a6103ad` 一行未动；规划腿 `feat/planner-resubmit` 未合、未碰）。verifier/supervisor **死于传输**（timeout / connection /
server-error / 勾选框允许换人的 429）时，同一次 attempt 内只补打这条腿一次、保留 worker 已产出的执行结果：不新增 attempt 行、
不花重试额度、不重跑最贵的 worker。`format-error` 仍归既有补交通道（一次尝试一次补交），`verification-failed`（判定自己说了 no）
不补打，`setup` 硬故障仍直接停。attempt 记录加 `judgeRetried: true`（`src/report.ts` 白名单同步放行）。预算同步抬：
`attemptBlock = 2×worker + 3×(verifier+supervisor)`、载入期 `callsPerAttempt` 同走法、`HARD_LIMITS.maxAttemptsPerTask`
**600 → 1000**（最坏合法 50+50+50 链路 800/task，不抬会被载入期总闸拒掉）。门禁：`npm run ci` **exit 0：98 files / 1828 tests**
（基线 97/1820 → +1 文件 +8 用例），typecheck 0 错，lint 0 errors / 36 warnings（全既有），`verify:lib` byte-identical（237 files），
`lib/` 一并提交。**真机 soak 留给合流方（`NOT_RUN`）**：本刀未碰 live `~/.dsh`、未重启运行中实例、未发版、未 push。取舍见 D-123，
验证表见 `VALIDATION.md` 首条，交接见 `HANDOFF.md` 首条。）

Last updated: 2026-11-24 08:40 +08:00（**立项A 第一刀：规划腿不再因为一次格式错或一次 503 直接降级，`CONFIRMED`（真引擎用例），未发版** —
分支 `feat/planner-resubmit`（基线 `2141071`，0.13.28；共享脏树 `a6103ad` 未动）。规划腿现在有三次问法的上限，都不算 retry：
① 首发；② 格式错（没有结构化结果，或计划过不了形状闸门）→ 同一次调用内重交一次（与 worker/verifier 同形，prompt 里写明
被拒原因）；③ 传输死（timeout/connection/server-error/rate-limit）→ 换路重打一次——`callRole` 新增 `avoid`，只去这一腿
还没付过的路由；一条路都没剩且死因是拒绝时原路重打一次，挂死则不重等（贵的是等待，不是调用）。`maxTotalAgentsFor` 的
规划项按 `PLANNER_LEG_CALLS = 3` 计，否则救回会在中途被 AGENT_CAP 掐死。新用例 9 条走真引擎 + twin（旧码 7 红 → 9 绿）。
门禁：typecheck 干净、lint 0 errors / 36 warnings（全既有）、`verify:lib` byte-identical、`npm run ci` 唯一红是既有抖动
`test/phase1-dialogue.spec.ts:612`（基线 `2141071` 单独跑同一文件同样失败）。真机 soak、判定腿第二刀、汇总 B、发版均未做。）

Last updated: 2026-11-24 08:00 +08:00（**已发版 `0.13.28`：死路由在真机上真的进表了，`CONFIRMED`** —
发版提交 `8f34701`（返工 `cd0c909` → 合流 `78c1907` → 用例修 `0113211` → 发版准备）+ tag `v0.13.28` 已推；
远端 `CI` `45292347165` success、`Release` `45292352796` success，已发布 asset `dsh-grok-workflow-0.13.28.tgz`
（<https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.28>）。`v0.13.27` 只留标签没发：它的门禁在远端
挂在一条对时序敏感的新用例上（让挂死可观测的 1 秒预算，在负载高的 runner 上「活路」也会输掉，整表断言就变成了延迟断言），
修的是用例，随 0.13.28 发。D-120 的两条根因都堵上：① 记账改用专用 `routeHealth`（挂死也进表，`switchModel` 仍 false）；
② 5xx/断连/429 的死因经宿主 twin 以 `CHILD_DEATH: <class>: <原话>` 拒绝回灌脚本。真机 soak（隔离 `DSH_HOME`、假 503 端点 +
假挂死端点 + 本机网关、`maxConcurrency:1`）：503 轮 5/5 verified、死路由只吃 2 次调用、第 3~5 题一次不打它、台账
`server-error (2 in a row)`；挂死轮 `timeout (2 in a row)`。证据 `.rsi/evidence/soak-deadroutes-01327-fix/`。
门禁：`npm run ci` exit 0（97 files / 1820 tests）。live `~/.dsh` 与线上实例全程未动。）

Last updated: 2026-11-24 07:20 +08:00（**0.13.27 返工：死路由在真机上真的进表了，`CONFIRMED`（单测 + 真机 soak），待发版** —
上一轮合流 soak 判 FAIL 的两条根因都堵上了（D-121）。① 记账不再拿 `switchModel` 当闸门，挂死的路用专用
`routeHealth:'timeout'` 进表（`switchModel` 仍为 false，任务仍改写措辞重试）；② 5xx/断连/429 的死因由宿主 twin
以「拒绝」回灌给 guest（`CHILD_DEATH: <class>: <子会话原话>`），脚本读回后记真类，本轮后续调用因此会绕开那条路。
两条都配了**真引擎形状**的用例（旧码上 3 红 → 修后 24 绿），不再是手工喂 `{class, switchModel}` 的假 seam。
门禁：`npm run ci` exit 0（**97 files / 1820 tests**，typecheck 干净、lint 0 errors / 36 warnings 全既有、
`verify:lib` byte-identical），合流后 `release/0.13.27` 再跑一次仍 exit 0。隔离真机 soak（克隆 `headless`，独立
`DSH_HOME`/`HOME`，插件行指向本 worktree 的 `lib/`，worker 链 = [假 503/挂死端点, 本机网关]，`maxConcurrency:1`）：
**503 轮 PASS** —— 5 题 5 verified、死路由只吃 2 次调用、第 3~5 题一次不打它、台账
`Dead routes: soak-dead/soak/dead-model: server-error (2 in a row)`；**挂死轮 PASS（记账那一条）** ——
`timeout (2 in a row)` 且有行。真机证据 `.rsi/evidence/soak-deadroutes-01327-fix/`。live `~/.dsh` 与线上实例未动。）

Last updated: 2026-11-24 06:10 +08:00（**0.13.27 不发：合流后真机 soak 判 FAIL —— 死路由这条账在真机上一条都记不住** —
`release/0.13.27`（worktree `.tmp/wt-rel-01327`，从 `main` `5678dd8`＝0.13.26 开出）已把 `feat/dead-routes` 合入，
合流点 `npm run ci` **exit 0（97 files / 1814 tests）**、`lib/` 与 `src/` 逐字节一致；隔离真机 soak（`headless` profile 克隆进
`.tmp/soak-01327/headless-home`，`DSH_HOME`/`HOME` 全隔离，两条真路由 + 两个假端点 503 / 挂死）给出否定结论：
**503 路由无并发上限时 5 次 worker 调用一次不落地打在它上面（30 次 HTTP = 5×6 重试），台账 5 行 `format-error`，`Dead routes` 段 0 行；
挂死路由（`childTimeoutMs 20000`）4 条任务的 attempt 1/2 也全部打在它上面，8 行 `timeout`，`Dead routes` 仍是 0 行。**
根因：表要 `class ∈ {timeout, connection, server-error, rate-limit}` **且** `switchModel === true`，而真机上
`childTimeoutFailure()` 把 `switchModel` 定成 `false`，spawn 引擎又把「子代理死了」塌成 `null`→`format-error`（不在族表里），
于是四个族在真机上没有任何一条路径能进表 —— 不是渲染没开，是表里没行。单测 18 例全绿是因为它们手工构造
`{class:'server-error', switchModel:true}` 直接喂 `noteRouteFailure`，从不经过真引擎的失败形状（与 round 077 同类的假 seam 教训）。
上一轮 `maxInFlight 1` 时「只打了 2 次」是**空道溢出**（台账写着 `skipped full …`），不是降级 —— 别把那条当证据。
生产形状（gate 内联路径）在 headless profile 上每个 worker 都死于 `no subagent provider registered for "spawn"`（环境/接缝问题，
`NOT_RUN`）。未 bump 版本、未打 tag、未 push、未合 `main`、未碰 live；共享脏树 `a6103ad` 一行未动。
取舍与修法见 VALIDATION 首条与 HANDOFF，D-120 记这次否证。）

Last updated: 2026-11-24 05:40 +08:00（**死路由：连续两次传输失败的那条路排到最后，`CONFIRMED`（单测），未合流** —
分支 `feat/dead-routes`（worktree `.tmp/wt-dead-routes`，从 `main` `5678dd8`＝0.13.26 开出，一任务一分支；共享脏树
detached `a6103ad` 一行未动）。一条路由连续两次栽在同一类传输故障（timeout / connection / server-error / rate-limit）后，
本轮把它排到所有活着的路后面：不再从它开始，但仍然留着、别的路都试过之后仍会试，答上来就复活。计数用脚本已有的
`failure.switchModel` 当闸门，所以 429 跟随操作员的勾选框；鉴权、没交结构化结果、引擎启动失败、unknown、inherit 一律不计数。
满载时若只有死路由有空位，这一次调用直接落死路由，不排队等 drain（取舍写在 `preferredIndices` 注释里）。
报告新增可选 `deadRoutes`（封顶 16 丢最旧），诊断台账多一块 `Dead routes`；交付层只登记标签，答案默认看不到。
同时给 worker / verifier / supervisor 六个调用点加 `taskId`，报告行终于写明「这一行是为哪件事打的」。
门禁：`npm run ci` exit 0（**97 files / 1814 tests**，新增 `test/dead-routes.spec.ts` 18 例，红 12 → 绿 18），
typecheck 干净、lint 0 errors（36 warnings 全既有）、`verify:lib` byte-identical。真机 soak `NOT_RUN`（留合流方）。
三处取舍与否决理由见 D-119，过程中被用例抓住的「`dead` 忘了拼进扫描顺序 → 整轮挂死」记在 VALIDATION 首条。）

Last updated: 2026-11-24 04:36 +08:00（**已发版 `0.13.26`：子代理死掉，报告说的是服务商原话，`CONFIRMED`** —
发版提交 `49e1045`（修复 `019921c` + 发版准备）+ tag `v0.13.26` 已推；远端 CI `45260234450` success、
Release `45260254869` success 并已发布（asset `dsh-grok-workflow-0.13.26.tgz`，
<https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.26>）。本地门禁：`npm run ci` exit 0
（96 files / 1796 tests PASS，含新增 `test/child-evidence.spec.ts` 15 例与扁平/嵌套 spec 两例），lint 0 errors，
`verify:lib` byte-identical。三处修复（D-118）：① 两种 activation spec 形状都读；② 死因从子会话
`turn/end`/`assistant/attempt` 取（spawn 路径的 `SubagentResult` 没有 `diagnostic`），拿不到原文就说
"cause unknown"；③ 交付「仍未完成」行按 task id 重建。真机 soak PASS：`.rsi/evidence/round-078/`。
仍有一处边界如实留着：合成器在修复之前写下的散文（如「没有交回可解析的成果」）不会被回写，
只有报告事实块与台账是修好的；改写它需要把修复时机前移到脚本里，见 HANDOFF。）

分支 `fix/t1-death-evidence`（从 `release/0.13.26` 开出）+ `release/0.13.26` 合流。三处修完：① 扁平/嵌套两种
activation spec 都读（`activationFacts`，单测钉住两种形状）；② 死因从**子会话自己的 `turn/end`** 取
（`src/child-evidence.ts`；spawn 路径的 `SubagentResult` 没有 `diagnostic` 这件事由真机确认），分类先看服务商
`code` 再看原话；拿不到原文就写 `the child ended abnormally (cause unknown)`，不再写「格式不对」；③ 交付里
「仍未完成」那行按 task id 重建。门禁：`npm run ci` exit 0（96 files / 1796 tests，typecheck 干净，lint 0 errors，
`verify:lib` byte-identical）。真机 soak 复跑 round 077 同一套形状：正常路径「已完成，用时 9秒」，坏 key 路径
4 个 worker 真的死于 `401 virtual key is required`、交付写服务商原话、`no valid structured result` 出现 0 次
（`.rsi/evidence/round-078/`）。细节见 D-118 与 VALIDATION 首条。）

Last updated: 2026-11-24 03:50 +08:00（**0.13.26 暂停发布：合流后的 T1 修复在真机上不生效，soak `FAIL`** —
`release/0.13.26`（worktree `.tmp/wt-rel-0-13-26`，从 `main` `6b0eb62` 开出）已无冲突合入 `fix/null-collapse-t1`
（`npm run ci` exit 0，95 files / 1771 tests），隔离真机 soak 却把这条修复判死：worker 路由换成被网关拒绝的 key 之后，
4 个子代理真实的 `401 virtual key is required` 死亡，交付给用户那段仍写 `worker returned no valid structured result`。
两个根因（`CONFIRMED`）：① `src/team-engine.ts` 读 `spec.request.prompt`/`spec.request.agentOptions`，真引擎发的是**扁平**
spec（`prompt`/`agentOptions` 在顶层）→ role 解析为空 → 回填一条不改（harness 的假 seam 用了嵌套形状，把差异挡住，19 例全绿）；
② spawn 子代理的 `SubagentResult` 根本没有 `diagnostic`（只有 external provider 有），所以真机只能拿到 `stopReason=error`，
给不出「超时/鉴权」的分类。①已在本分支修好（+1 例钉住扁平 spec，`npm run ci` exit 0 / 95 files / 1772 tests），②与
`report.incomplete[].reason` 文案没被 `repairText` 覆盖这两处未修。**未打 tag、未推 main、未发版**；修法与证据见
VALIDATION 首条与 `.rsi/evidence/round-077/`。

Last updated: 2026-11-24 03:10 +08:00（**T1 null 语义塌陷：报告不再把「子代理死了」写成格式错，`CONFIRMED` 未合流** —
分支 `fix/null-collapse-t1`（worktree `.agents/worktrees/fix-null-collapse-t1`，从 `main` `6b0eb62` 开出，一任务一分支；
共享脏树 detached `a6103ad` 未动）。引擎 guest 把 `stopReason !== 'completed'` 和"`completed` 但没交结构化结果"
都折成 `null`，宿主 `childResult()` 又丢掉 `diagnostic`，所以 `src/script.ts` 的 `callRole` 只能一律写
`format-error`（agent-99：3691 次子调用里 530 次传输/鉴权/超时被写成格式错，真格式错 25 次）。
修法全在插件侧：twin 的 `startActivation` 记每条子代理真实终态进有界台账（`src/child-outcomes.ts`），
`src/run.ts` 在报告校验后、脱敏前按「无歧义」规则回填 class/reason/category，连带改掉 `incomplete`/`errors` 里的
同一句文案；新增失败类 `cancelled`；401/403 归 `model-unavailable`（guest 与宿主两张表由用例钉成一张）；
归档兜底文案带真实死因。门禁：`npx vitest run` **95 files / 1771 tests PASS**（新增 `test/null-collapse.spec.ts`
19 例，红 4 failed/1 passed → 绿 19），`npm run ci` **exit 0**，typecheck 干净，lint 0 errors / 35 warnings（全既有），
`verify:lib` byte-identical。真机 soak `NOT_RUN`（留给合流方）。**已知边界**：回填只改报告，403 子代理仍会花掉
一次同次尝试补交、仍走完路由链——「不烧链路」要等让脚本看见死因的结构性第二步（`DECISIONS.md` D-116 B1/B2/B3
只登记未实现）。详见 VALIDATION 首条。）

Last updated: 2026-11-24 02:30 +08:00（**已发版 `0.13.25`：三路合流（判定角色补交 + 最终答案重写 + 派发心跳规则），隔离真机 soak PASS，`CONFIRMED`** —
三路各自从 `main` `7f626f5`（0.13.24）开出，`--no-ff` 依次合入 `release/0.13.25`：`fix/verifier-supervisor-resubmit`
`f5b74e4`+`73c9067` → `fix/final-answer-rewrite` `4393514` → `docs/heartbeat-ledger` `4231c00`（先 rebase 到 `main`
成为 `be88c36`，只动 `AGENTS.md`）。冲突 6 处：`CHANGELOG.md` + 三份记忆档（两边都留）、`lib/script.d.ts.map` 与
`lib/script.js.map`（取 ours 后 `npm run build` 重建）；**`src/script.ts` 自动合并且两边功能都在**——判定角色的补交
在 `3583`/`3652` 两个调用点，汇总补交 `2827`/`2845`，答案侧 `REWRITE_PREAMBLE` + `answerLead` 整段 summary。
本地门禁：`npm run ci` **exit 0（94 文件 / 1752 测试 PASS**；typecheck 干净；lint 0 errors；`verify:lib` byte-identical）。
发版：prepare `dafda5c` → push main → annotated tag `v0.13.25` → push tag → 远端 Release run `45238308272`
**success**，GitHub Release `v0.13.25` 已发布；CI on main `45238299713` **Node 22 与 Node 24 双绿**（0.13.24
事后补的那条 flake 修有效）。
真机隔离 soak **PASS**（`scripts/clone-profile.mjs` fork 在用 web profile，parity 5/5，独立 `DSH_HOME` 与独立 `HOME`，
headless Chromium + 原生 CDP 当用户在 GUI 里打字；本机网关 `wb/cn:deepseek-v4.1-flash`）：交付出去的答案是
两段中文散文、单语、无 `答案：`/`下一步：` 标签，**交付物那条真实绝对路径写对了并说清怎么打开**
（`…/work1/hello.md`，`hello. md` 拆句缺陷未复现）；透明代理记录到真模型请求里命中 `quoteRule` 与
`rewritePreamble`，即新提示词契约确实发出去了。**未覆盖**：判定角色补交在真机上的自然触发（三轮 soak 的判定
都一次解析成功），证据仍取 `test/verifier-resubmit.spec.ts` 8 例（真脚本 + 真引擎，只替身模型边界）。
证据：`.rsi/evidence/round-076/soak.txt` + 三张 GUI 截图、`docs/knowledge/VALIDATION.md` 的 0.13.25 表。）

Last updated: 2026-11-24 01:35 +08:00（**判定角色的引号错误不再让整件事重做，`CONFIRMED` 未合流** —
分支 `fix/verifier-supervisor-resubmit`（worktree `.agents/worktrees/fix-verifier-supervisor-resubmit`，从 `main`
`7f626f5` 开出）：session-6cd6053d 的检查/复核子代理 structured_output 里有未转义英文双引号 → 宿主返回 `null`
→ 判定其实是 pass 却整任务重做（19.5 分钟）。worker 早有同次尝试补交，verifier/supervisor 没有，现在补上
（同样一次、不花 retry）；提示词与结果结构加引号/800 字规范；空结构原因点名角色、`structured_output` 与
`Expected ','` 归 format-error；`maxTotalAgentsFor` 的每尝试块 ×2 以容纳补交。门禁：`npx vitest run`
**93 files / 1737 tests PASS**（新增 `test/verifier-resubmit.spec.ts` 8 例，红→绿证据
`.rsi/evidence/round-075/red-verifier-resubmit.txt`），`npm run ci` **exit 0**，typecheck 干净，lint 0 errors /
35 warnings（全部既有），`verify:lib` byte-identical（229 files），`lib/` 与 `src/` 同提交 `f5b74e4`。
真机 soak `NOT_RUN`（本轮不发布）。详见 VALIDATION 首条。）

Last updated: 2026-11-24 01:50 +08:00（**分支 `fix/final-answer-rewrite`：最终答案从「逐字复述台账」改成「给料 + 重写」，`CONFIRMED` 未合流** —
用户诉求：跑完拿到的是一段电报体、而且只取了第一句。改四处（都只在本分支）：
① `src/answer.ts` 默认 relay 换 `REWRITE_PREAMBLE`（按用户原问题重写、说清交付物在哪怎么打开、
禁台账标签/字段名），失败态仍逐字（改写会软化失败）；
② `src/delivery/index.ts` 的 `answerLead` 吃整段 summary（上界 zh 700 / en 1400 字）不再是第一句，
完成态补「做成了：…」+「交付物：<路径>」，`MACHINE_DETAIL` 对交付物 locator 开显式例外（占位符进出），
其余路径照旧删；
③ 默认单语：`relayText` 传 `bilingual: false`，跟随 `opts.lang`（用户请求语言）；
④ `src/script.ts` 的 synthesizer 笼子放宽：允许「结果：/怎么用：/注意：」三段（禁别的标题、禁列表、禁 Markdown），
叙事上界 700 字 / 300 词，**caveats 由它重写**——`layeredNotesBlock` 不再原文贴 uncertainties，
门禁把「每条原句必须出现」换成「必须有 caveat 段」（`hasCaveatSection`，check + verify 两侧都查）。
验证：`npx vitest run` → **93 files / 1744 tests PASS**（含新增 `test/final-answer-rewrite.spec.ts` 15 例，
先红后绿）；`npx tsc -p tsconfig.json --noEmit` exit 0；`npx oxlint src test` 0 errors（35 warnings 皆既有）；
`npm run build` + `npm run verify:lib` byte-identical（229 files）。真机 soak NOT_RUN（本分支只做离线契约 + 全量单测）。
证据与逐条口径见 `VALIDATION.md` 首条、`DECISIONS.md` D-115、`HANDOFF.md` 首条。）

Last updated: 2026-11-24 01:30 +08:00（**已发版 `0.13.24`：三路合流（队长拆法绑定 + 首轮消息立刻可见 + 确认单次消费），隔离真机 soak PASS，`CONFIRMED`** —
三路各自从 `main` `63cc1db`（0.13.23）开出，`--no-ff` 依次合入 `release/0.13.24`：`fix/captain-approve` `00fc203` →
`fix/gate-route-msgvis` `f831fca` → `docs/user-soak-fork-profile` `57eadb9`。冲突 5 处（`src/gate.ts` ×4 + `test/captain-confirm.spec.ts` 导入）
按「两边功能都要」手工合：`CaptainPending` 既保持单次消费（TTL 只判一次）又携带 `preview`；`askCaptain()` 既保留 B04 承接又记录预览文本；
审批三条路（交互 / 完整阻塞 / 完整后台）统一走 `approvedRequest(request, preview)`；`lib/` 取 ours 后 `npm run build` 重建，
另加 1 条断言钉住「完整形状也带批准拆法」。
本地门禁：`npm run ci` exit 0（**92 文件 / 1729 测试 PASS**；typecheck 干净；lint 0 errors；`verify:lib` byte-identical，229 文件）。
发版：prepare `b1fead6` → push main → annotated tag `v0.13.24`（tag 对象 `6d5a88b`）→ push tag → 远端 Release run
`45223728613` **success**，GitHub Release `v0.13.24` 已发布。
真机隔离 soak **PASS**（fork 出来的 web profile + 独立 `DSH_HOME` 与独立 `HOME`，浏览器里当用户用；本机网关
`wb/cn:deepseek-v4.1-flash`）：队长报拆法 → 回「确认」→ 派出去的目标里带 `USER APPROVED THIS SPLIT` 与原拆法三行，
收尾 `status completed · verified 2/2`；新会话首句（`我想。。` 形状）**立刻可见**，`session-ea28b24e` 的「空转一轮」未复现。
**发版后补一条**：远端 CI on main `45223718435` 的 Node 22 红了 2 例，根因是 `test/captain-confirm.spec.ts` 的通道状态跨用例泄漏
（`src/steering.ts` 是模块级注册表，用例共用同一 session id，前一用例的后台轮 `finally` 晚于该用例断言收尾 → 下一用例看到「有通道但没活轮」），
修法 `afterEach(closeAllSteering())`，提交 `e767ba6`（同一提交的 Release 门禁本身是绿的）。
证据：`.rsi/evidence/round-074/soak.txt` + 三张 GUI 截图、`docs/knowledge/VALIDATION.md` 的 0.13.24 表。）

Last updated: 2026-11-24 00:1x +08:00（**round-073 分支 `fix/gate-route-msgvis` 落地，未合流未发版，`CONFIRMED`** —
两个症状同一分支：①**首轮消息不可见**：新会话第一句在 `in-turn` 里既不能预发布（`commitClaimed` 依
`surfaceHasHead` 拒绝——写在宿主 `system/message` 之前会占 surface 位置 0、把存档写坏，0.13.14 前提），
又要等整轮结束才由 loop 提交，于是 26 行日志里 `step/start=0`、`user/message=0`。修法：`full` 形状 +
可后台投递 + 表面可读且为空时，先 `enter` 只带原话让 loop 立刻开 step 提交，团队在后台跑，结论走
`deliverRelay` 下一轮投递（`answerBehindUnpublished`；不写任何抢先位置的东西）。②**队长确认多处走歪**：
交互路径用 `pendingCaptains.get` 无 TTL（过期确认照样派活）、`record(started)` 早于 `enqueue`（队列满留假账）、
`full` 形状没人读这个确认（「确认」自己成了一轮的目标）。修法：`answerInTurn` 在 replan 通道检查之前
`takeCaptainPending` 一次并把值传给 `answerOnChannel`/`answerTeamInteractive`/`answerFullBehind`/`produceAnswer`；
过期不派活；`other` 由阻塞路径统一作废并单独分流；频道在「这是拆法确认」时让路；先 `enqueue` 成功再 `record`。
`/grok on` 语义未动（F7 只出建议）。门禁 `npm run ci` **exit 0：92 files / 1722 tests**；
新用例对旧码 5 红（`.rsi/evidence/round-073/red-gate-route-msgvis.txt`）。真机 soak `NOT_RUN`（不发布）。）

Last updated: 2026-11-23 23:1x +08:00（**已发版 `0.13.23`：五路合流（保命 3 条 + 体验档 5 条 + 队长三件套），
隔离真机 soak PASS，`CONFIRMED`** — 五路各自在 `cda5d4e` 开出、`--no-ff` 依次合入 main 系 worktree
`.agents/worktrees/fix-synth-resubmit`：`fix/lifeline3-resume-scan`（仅 test）→ `fix/dispose-drain`（卸载排水）→
`fix/checkpoint-lifeline-tasks`（没报告也记子代理行）→ `feat/exp-pack-070`（体验档）→ `captain-pack`（队长三件套）。
冲突共 3 处需要人判：`src/checkpoint/wiring.ts`（工作区状态 × 观察行 × 在飞行表）与
`src/memory/recorder.ts`（归档后既写更正链接又写经验行）——按「功能都要保留」手工合；
另 5 处只是 `lib/**/*.map` 源映射，取 ours 后 `npm run build` 重建。合流中修一处**载荷形状**：
exp-pack 原从 `workflow/agent-start` 第一参数读 `seq/label/phase/childId`，真实形状是第二参数
（`WorkflowAgentInfo`，见 `emitWorkflowEvent('workflow/agent-start', info, agent)`），合并后统一按真实形状读，
该 spec 替身改为两参数（断言未放宽）。`npm run ci` exit 0（**92 文件 / 1717 测试 PASS**；
`verify:lib` 在 `c4eaffa` byte-identical，229 文件）。
真机隔离 soak **PASS**（scratch `DSH_HOME` + `file://<worktree>/lib/index.js` overlay + 本机网关
`127.0.0.1:18088`，四角色同路由 `wb/cn:deepseek-v4.1-flash`）：双任务 workflow `status completed · verified 2/2`、
10 criterion，两文件字节/sha 精确；`/grok status` 在真实 journal + 真实恢复点上答出 run 状态/守卫/可续跑/未完成；
卸载通知（"waited 402ms for 1 subagent call(s) in flight"）与停下文案、守卫结论行都出自构建产物。
soak 顺带抓出一处文案缺陷并修掉（0 任务被说成「全部做完」、英文三句无分隔），补 2 条用例。
发版：prepare `c4eaffa` → push main → tag `v0.13.23` → push tag → 远端 Release run `45202988977` **success**，
Release `v0.13.23` 已发布（asset `dsh-grok-workflow-0.13.23.tgz`，860889 bytes，sha256 `ed7a7e55…`）。
证据：`.rsi/evidence/round-072/soak.txt`（脱敏，仅模型名）、`docs/knowledge/VALIDATION.md` 的 0.13.23 表。）

Last updated: 2026-11-23 22:35 +08:00（**round-071 队长三件套已落地，未提交、未推送（分支 `captain-pack`），`CONFIRMED`** —
三件同分支：①拆排交给模型——`planPrompt()` 改队长宪章、计划新增 `onFailure: continue|stop`
（`normalizePlan` 归一，非法值=continue）、`runWaves` 在波边界执行「停」（`captainStopResult`）；
replan 通道本来就在（默认开），只在 `replanPrompt()` 补「停/改」一句。②前台确认——新增 `src/captain.ts`，
gate 的 `pendingCaptains`（同 10 分钟 TTL）接在交互后台与阻塞两条路径，批准/明确改法才派活，
其它消息作废；`/grok` 完整形状与「前台问完选团队」不重复问。③三叠纸——新增 `src/captain-memory.ts`
（`profile.md` / `experience.md` 与台账同目录），recorder 每轮结算写一条复盘（runId 去重），
gate 组 brief → `args.captain` → planner/replan 提示词；记忆 CLI 增 `captain`/`profile`/`profile add`/`experience`。
红绿：每件各一条「旧码红、新码绿」（`.rsi/evidence/round-071/red-cut*.txt` / `green-cut*.txt`）；
`npm run build` exit 0；`npm run ci` exit 0（**90 文件 / 1678 测试 PASS**，基线 87/1656）。
缺口：预览是独立轻调用，正式跑仍重新规划；画像只能显式写入（不自动蒸馏）；真机 soak `NOT_RUN`。
`verify:lib` 以 HEAD 为输入，不覆盖未提交的 lib——提交时需再跑一次并连同 `lib/` 一起提交。）

Last updated: 2026-11-23 21:10 +08:00（**已发版 `0.13.22`：composer 工作流开关 500 修复，`CONFIRMED`** —
用户现象：工具行 workflow 总开关红字「模式服务没有回应：cannot get property sessions without inject」，开关打不开。
根因：`src/mode-surface.ts` `serviceOf()` 用属性读取取 `sessions`；真编排只注入 `webServer`+`connection`，
cordis 对未注入服务的属性读取直接抛错（不是返回 undefined），throw 在 `ctx.get(name)` 兜底之前逃出，
被 `handleModeRoute` 兜成 `500 mode/internal`。测试没抓住：替身是普通对象字面量，属性读取不抛。
修法：直读包 try/catch，抛错落 `source.get(name)`，与 `src/settings.ts` / `src/team-engine.ts` 同构。
红绿：新用例在旧码 `500`（红）/新码 `200`（绿）。`npm run ci` exit 0（87 文件 / 1656 测试 PASS；
`verify:lib` byte-identical）。真机隔离 soak **PASS**（`DSH_HOME` 副本 + `wb/cn:deepseek-v4.1-flash`：
双任务 workflow `status completed · verified 2/2`，两文件字节/sha 精确；路由级 status/set 全 200、enabled 双向翻转；
证据 `.rsi/evidence/round-066/soak.txt`）。发版：prepare `192eaac` → 合流 `83f4622` → push main → tag `v0.13.22`
→ push tag → 远端 Release run `45180352802` **success**，Release `v0.13.22` 已发布
（asset `dsh-grok-workflow-0.13.22.tgz`，818677 bytes，sha256 `bc8d456e…`）。）

Last updated: 2026-11-23 20:30 +08:00（**已发版 `0.13.21`：18 条修复 + 隔离真机 soak PASS，`CONFIRMED`** —
发版提交 `8ff7f82` 经 `26b800d` 合入 main 系 worktree 并推 main；tag `v0.13.21` 已推；远端 Release run
`45173971212` success 并已发布（asset `dsh-grok-workflow-0.13.21.tgz`）。本地门禁：`npm run ci` exit 0
（87 文件 / 1656 测试 PASS）。发版修：`src/client/index.js` + `lib/client.js` 双常量同步到 0.13.21
（无此则 `test/update-entry.spec.ts` 红）。真机 soak PASS：隔离 profile 全链路实跑，A 轮 planner 换
`wb/cn:deepseek-v4.1-flash` 后 planner/worker/verifier/synthesizer 四段全 completed，report COMPLETED，
双文件字节/sha 精确（证据 `.agents/worktrees/rsi-soak-65/.rsi/evidence/round-065/soak.txt` §5+§9）。）

Last updated: 2026-11-23 19:15 +08:00（**round-64 已合流 main 未发版：降级跑完全验自报，`CONFIRMED`，soak BLOCKED** —
合流提交 `084ce76`（main `171b95b` + `e0ca9ca`）；`npm run ci` exit 0（87 文件 / 1656 测试 PASS，+1 降级回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 18 条待发，不发版。）

Last updated: 2026-11-23 19:00 +08:00（**round-63 已合流 main 未发版：插件标记单一定位，`CONFIRMED`，soak BLOCKED** —
合流提交 `895fb00`（main `7b410f0` + `d745573`）；`npm run ci` exit 0（87 文件 / 1655 测试 PASS，+1 常量钉死回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 17 条待发，不发版。）

Last updated: 2026-11-23 18:50 +08:00（**round-62 已合流 main 未发版：摘要轮内丢行自报，`CONFIRMED`，soak BLOCKED** —
合流提交 `70247ad`（main `b9fb34d` + `597ae18`）；`npm run ci` exit 0（87 文件 / 1654 测试 PASS，+1 轮内标记回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 16 条待发，不发版。）

Last updated: 2026-11-23 18:35 +08:00（**round-61 已合流 main 未发版：已删键专属报错，`CONFIRMED`，soak BLOCKED** —
合流提交 `f3562a9`（main `348b284` + `213bcb8`）；`npm run ci` exit 0（87 文件 / 1653 测试 PASS，+1 新回归 + 5 旧断言同步）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 15 条待发，不发版。）

Last updated: 2026-11-23 18:25 +08:00（**round-60 已合流 main 未发版：说明书已删键改诚实，`CONFIRMED`，soak BLOCKED** —
合流提交 `7bfff22`（main `ed06760` + `062bec7`）；`npm run ci` exit 0（87 文件 / 1652 测试 PASS，锁行文 spec 13 项保住）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 14 条待发，不发版。）

Last updated: 2026-11-23 18:15 +08:00（**round-59 已合流 main 未发版：两处过期门注释改诚实，`CONFIRMED`，soak BLOCKED** —
合流提交 `53e2ea8`（main `1bdda54` + `33b1e89`）；`npm run ci` exit 0（87 文件 / 1652 测试 PASS，纯注释改无行为变化）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 13 条待发，不发版。）

Last updated: 2026-11-23 18:05 +08:00（**round-58 已合流 main 未发版：打烊清场，`CONFIRMED`，soak BLOCKED** —
合流提交 `326a7c2`（main `a89152a` + `656a852`）；`npm run ci` exit 0（87 文件 / 1652 测试 PASS，+1 打烊回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 12 条待发，不发版。）

Last updated: 2026-11-23 18:00 +08:00（**round-57 已合流 main 未发版：会话换上持久板，`CONFIRMED`，soak BLOCKED** —
合流提交 `42b1b01`（main `8f8f8f3` + `9dc7624`）；`npm run ci` exit 0（87 文件 / 1651 测试 PASS，+3 换板回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 11 条待发，不发版；
dispatcher↔taskboard 对接三步走完。）

Last updated: 2026-11-23 17:28 +08:00（**round-56 已合流 main 未发版：板子转读数器适配器，`CONFIRMED`，soak BLOCKED** —
合流提交 `1c223b3`（main `ac2851a` + `764dfe4`）；`npm run ci` exit 0（86 文件 / 1648 测试 PASS，+2 适配器回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 10 条待发，不发版；
session 换持久板是下步。）

Last updated: 2026-11-23 17:20 +08:00（**round-55 已合流 main 未发版：任务板存在检查，`CONFIRMED`，soak BLOCKED** —
合流提交 `af75f9b`（main `8a9f138` + `0335cd0`）；`npm run ci` exit 0（85 文件 / 1646 测试 PASS，+1 存在检查回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 9 条待发，不发版；
对接走了一半（`has` 有了，抛错转空读适配器下轮）。）

Last updated: 2026-11-23 17:05 +08:00（**round-54 已合流 main 未发版：缺钩子加载即报错，三面 15 条收官，`CONFIRMED`，soak BLOCKED** —
合流提交 `3c2bcc7`（main `2de6b78` + `17ed0be`）；`npm run ci` exit 0（85 文件 / 1645 测试 PASS，改 1 断言 + 4 桩）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 8 条待发，不发版；
报告 5 + 并发 4 + 配置 6 共 15 条至此全落。）

Last updated: 2026-11-23 16:50 +08:00（**round-53 已合流 main 未发版：守护路由 fail-closed，`CONFIRMED`，soak BLOCKED** —
合流提交 `49197f8`（main `71e13b2` + `6e723ed`）；`npm run ci` exit 0（85 文件 / 1645 测试 PASS，+2 回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 7 条待发，不发版。）

Last updated: 2026-11-23 16:35 +08:00（**round-52 已合流 main 未发版：扁平 Cookie 补脱敏，`CONFIRMED`，soak BLOCKED** —
合流提交 `196bbc2`（main `95ad6b2` + `454076a`）；`npm run ci` exit 0（85 文件 / 1643 测试 PASS，+1 三形回归）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 6 条待发，不发版。）

Last updated: 2026-11-23 16:25 +08:00（**round-51 已合流 main 未发版：删过期十分钟常量，`CONFIRMED`，soak BLOCKED** —
合流提交 `2feddd2`（main `65544af` + `d7f8df6`）；`npm run ci` exit 0（85 文件 / 1642 测试 PASS，纯删除无行为变化）。
真机 BLOCKED（网关 502，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 5 条待发，不发版。）

Last updated: 2026-11-23 16:15 +08:00（**round-50 已合流 main 未发版：报告与调度路径规则统一，`CONFIRMED`，soak BLOCKED** —
合流提交 `98fc776`（main `55ab9a2` + `41b932d`）；`npm run ci` exit 0（85 文件 / 1642 测试 PASS，+1 归一回归）。
真机 BLOCKED（网关 502/无额度，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 4 条待发，不发版。）

Last updated: 2026-11-23 15:55 +08:00（**round-49 已合流 main 未发版：守护单轮单快照，`CONFIRMED`，soak BLOCKED** —
合流提交 `80bc9ab`（main `8eefaac` + `af2c09c`）；`npm run ci` exit 0（85 文件 / 1641 测试 PASS，+1 顺序无关回归）。
真机 BLOCKED（网关 502/无额度，未伪造）；`CHANGELOG [Unreleased]` 中英文已记 3 条待发，不发版。）

Last updated: 2026-11-23 15:45 +08:00（**round-48 已合流 main 未发版：无定时器 hung 兜底，`CONFIRMED`，soak BLOCKED** —
合流提交 `3284778`（main `974a3f6` + `bca1613`）；`npm run ci` exit 0（85 文件 / 1640 测试 PASS，+1 真无定时器回归；
worktree 空依赖软链后 `verify:lib` 通过）。真机 BLOCKED（网关 502/无额度，未伪造）；
`CHANGELOG [Unreleased]` 中英文已记 2 条待发，不发版。）

Last updated: 2026-11-23 14:55 +08:00（**round-47 已合流 main 未发版：恢复证据深拷，`CONFIRMED`，soak BLOCKED** —
合流提交 `7115a41`（main `43cdc1f` + `87ef9fa`）；`npm run ci` exit 0（85 文件 / 1639 测试 PASS，+1 别名回归；
首跑 1 flake 偶发挂后重跑全绿）。真机两试 BLOCKED（bifrost 网关 502 无额度，插件链路通，未伪造）；
`CHANGELOG [Unreleased]` 中英文已记，不发版，待网关恢复补 soak。）

Last updated: 2026-11-23 14:35 +08:00（**已发版 `0.13.20`：账本不可用标记，`CONFIRMED`** —
发版提交 `f228484` + tag `v0.13.20` 已推；远端 CI `45125209602` success、Release `45125227599`
success 并已发布（asset `dsh-grok-workflow-0.13.20.tgz`）。本地门禁：`npm run ci` exit 0（85 文件 / 1638 测试
PASS），真机 soak PASS，lint 0 errors，`verify:lib` byte-identical。）

Last updated: 2026-11-23 14:05 +08:00（**已发版 `0.13.19`：账本收尾四修 + 手动清单遗留，`CONFIRMED`** —
发版提交 `c85017f` + tag `v0.13.19` 已推；远端 CI `45121816157` success、Release `45121827995`
success 并已发布（asset `dsh-grok-workflow-0.13.19.tgz`）。本地门禁：`npm run ci` exit 0（85 文件 / 1637 测试
PASS），真机 soak PASS，lint 0 errors，`verify:lib` byte-identical。发版修：bundle 双常量同步 + 删本地野标签
`v0.12.17` + 名单重刷。）

Last updated: 2026-11-23 13:55 +08:00（**round-45 已合流 main 待发版：账本尾部行边界截断 + 真机 soak PASS，`CONFIRMED`** —
合流提交 `b8318bd`（main `fcb7ecf` + `ed50e94`）；`npm run ci` exit 0（85 文件 / 1637 测试 PASS，+1 超限账本回归），
lint 0 errors，`verify:lib` byte-identical。隔离 soak PASS（headless 新 profile + 真模型 caller 双任务 2/2 verified）。
`CHANGELOG [Unreleased]` 中英文已记 5 条待发；真机+门禁双绿，具备发版条件。）

Last updated: 2026-11-23 13:05 +08:00（**round-44 已合流 main 未发版：截断行加 +N more 标记，`CONFIRMED`** —
合流提交 `f4590ea`（main `598afb6` + `70dec37`）；`npm run ci` exit 0（85 文件 / 1636 测试 PASS，+1 双边一致回归），
lint 0 errors，`verify:lib` 217 文件 byte-identical。`CHANGELOG [Unreleased]` 中英文已记，攒版待发。）

Last updated: 2026-11-23 12:45 +08:00（**round-43 已合流 main 未发版：机器台账补 blocked 原因行，`CONFIRMED`** —
合流提交 `51ec2bb`（main `e27d0b6` + `8c06f9e`）；`npm run ci` exit 0（85 文件 / 1635 测试 PASS，+1 blocked 回归），
lint 0 errors，`verify:lib` 217 文件 byte-identical。`CHANGELOG [Unreleased]` 中英文已记，攒版待发。）

Last updated: 2026-11-23 12:30 +08:00（**round-42 已合流 main 未发版：Slack 令牌全系前缀脱敏补齐，`CONFIRMED`** —
合流提交 `b5ec52e`（main `d525fb2` + `e9fd908`）；`npm run ci` exit 0（85 文件 / 1634 测试 PASS，+1 全前缀回归），
lint 0 errors，`verify:lib` 217 文件 byte-identical。`CHANGELOG [Unreleased]` 中英文已记，攒版待发。
子代理三面 15 条发现中先落风险最高的 1 条；其余 14 条见 POOL/下一轮。）

Last updated: 2026-11-23 05:15 +08:00（**已发版 `0.13.18`：团队调度层 v1 + 取消测试竞态修复，`CONFIRMED`** —
发版提交 `f18e17b` + tag `v0.13.18` 已推；远端 CI `45070692108` success、Release `45070695678`
success 并已发布（asset `dsh-grok-workflow-0.13.18.tgz`）。本地门禁：`npm run ci` exit 0（85 文件 / 1617 测试
PASS），真机 soak PASS（MODEL_OK + 两任务依赖链 + 任务板 fail→重试→pass→重启恢复），lint 0 errors，
`verify:lib` byte-identical。`v0.13.17` 的 Release 曾挂在 progress 取消用例时序竞态（resume 扫描 +12ms），
修测试后重发本版双绿；v0.13.17 属坏 tag 留置。L3 小组长未做（规模不够）；跑中改需求待真实 GUI 验证。）

Last updated: 2026-11-23 04:40 +08:00（**已发版 `0.13.16`：手动清单第二轮 6 件需求，`CONFIRMED`** —
发版提交 `1591665` + tag `v0.13.16` 已推；远端 CI `45067182761` success、Release `45067195044`
success 并已发布（asset `dsh-grok-workflow-0.13.16.tgz`）。本地门禁：`npm run ci` exit 0（82 文件 / 1578 测试
PASS，含 resume/triage/guardian/report/mode-surface 新增与同步断言），真机 soak PASS（MODEL_OK + 西湖一句话），
lint 0 errors，`verify:lib` byte-identical。7 件中 6 件落地（405 只做插件侧 warn，真机复现待宿主环境）；第 7 件（证据收集）D-107 降级做。
主工作树另有 naming/面板线（fix/session-surface-head-6 残留）未动，与本版无关。）

Last updated: 2026-11-22 23:10 +08:00（**已发版 `0.13.14`：装了插件的会话重启不再损坏，`CONFIRMED`** —
发版提交 `dea1be4` + tag `v0.13.14` 已推；远端 Release `45036278236` success 并已发布
（asset `dsh-grok-workflow-0.13.14.tgz`）。本地门禁：`npm run ci` exit 0（81 文件 / 1564 测试 PASS），
lint 0 errors，`verify:lib` byte-identical。远端 CI `45036269190` success。根因：`commitClaimed()`
在无头首轮抢写 `user/message` 到 surface 位置 0，后续 system 头一到即砖（99 父会话：OK 53 /
CORRUPT 33 / NOSYS 13）；修法是 `surfaceHasHead()` 门 + 取消同规则 + 3 例回归。
用户侧已砖的旧会话本版修不了，需 host 侧处理；新会话不再写坏。）

Last updated: 2026-11-22 23:00 +08:00（**会话损坏修复已合流并发版中，`CONFIRMED`** —
分支 `fix/session-surface-head-6` 已合流 main；以下为合流前记录。

Last updated: 2026-11-22 22:55 +08:00（**会话损坏根因已定位并修复，未发版，`CONFIRMED`** —
分支 `fix/session-surface-head-6`：`src/gate.ts` 的 `commitClaimed()` 不再在无头 turn-1 预发布
`user/message`（`surfaceHasHead()` 门：已有 surface 节点或 turn 2+ 才发布，否则走 `enter.messages`
由 loop 在 head 之后提交）；取消路径同规则（cancel-then-continue 同样会砖）。回归：
`test/phase1-dialogue.spec.ts` 新增 `surface head` 3 例 + `commitHead`/`assertReopenable`  harness；
`test/gate.spec.ts` 5 例期望同步（batch rides enter）。`npm run ci` exit 0 = **81 文件 / 1564 测试 PASS**，
`verify:lib` byte-identical。未提交发版；用户侧已砖的 33 个父会话只能由 host 侧修复或丢弃，
插件不再写坏新会话。根因取证见 HANDOFF 末条。）

Last updated: 2026-11-22 22:40 +08:00（**已发版 `0.13.13`：带编号的计划任务即使标题含阶段词也独立成卡，`CONFIRMED`** —
发版提交 `5ab9e26` + tag `v0.13.13` 已推；远端 Release `45033581188` success 并已发布
（asset `dsh-grok-workflow-0.13.13.tgz`）。本地门禁：`npm run ci` exit 0（81 文件 / 1561 测试 PASS），
lint 0 errors，`verify:lib` byte-identical。根因见 D-106：`任务 7 · 合并为干净可并发执行计划`被脊柱
`执行` token 误收；修法是编号优先于阶段词（双实现同步 + 双回归）。真机隔离 soak `CONFIRMED`
（同形状 phase 成卡、spine 为空）。远端 CI `45033565040` Node 24 绿、Node 22 在 channel A4 单点红
（本地 41/41 PASS，0.13.12 带过来的时序敏感用例，与本版无关，不挡 Release）。）

Last updated: 2026-11-22 21:30 +08:00（**已发版 `0.13.12`：主会话通道 + 波边界重规划 + 汇总三步 + 红色语义，`CONFIRMED`** —
发版提交 `9220b51` + tag `v0.13.12` 已推；远端 CI `45027528312` success、Release
`45027541442` success 并已发布（asset `dsh-grok-workflow-0.13.12.tgz`）。本地门禁：
`npm run ci` exit 0（80 文件 / 1553 测试 PASS，停车场移出 nyc 孤儿后 typecheck 干净），
lint 0 errors，`verify:lib` byte-identical。发货内容见 CHANGELOG `[0.13.12]` 四条：
通道、重规划合并、汇总三步、红语义。工作树剩余 `??` 皆并发轮孤儿未动。）
接 agent-8 通道 lane 与 planner_replan lane；lead 修 5 个假环境按名存工具 +
reliability 计数 15→16 + client.spec Bundle 口子。`npm test` 82 文件 / 1594 测试 PASS；
typecheck 仅剩 nyc `--jsx` 孤儿一错；lint 0 errors；build + verify:lib byte-identical。
红色语义四处按「当前还坏着才红、历史只留行级痕迹、结构线中性」收敛，258 例专项全绿。
未提交未发版；真机 GUI 手势与 nyc 孤儿 NOT_RUN。详见 HANDOFF 首条。）

Last updated: 2026-11-22 21:00 +08:00（**主会话通道（L2 通道侧）落地，`CONFIRMED` 未发版** —
用户原始诉求：主会话永远可对话，不等工作流跑完，跑中改需求不掐整轮、不白跑。本轮只做**通道侧**
（lead 拍板 Option B：`src/channel.ts` + `src/gate.ts` + `src/run.ts` 归本 lane；
`src/steering.ts`/`src/replan.ts`/`src/script.ts` 归 planner_replan lane，接口冻结）。

产出：
- 新 `src/channel.ts`（纯函数 + 文案）：`classifyChannelMessage()` 只认裸 `停/stop/取消`
  为 stop（问题句、含 stop 字的长任务一律 forward，非对称是安全边界）；
  `composeIntentText()` 把用户原话 + 有界对话快照装进一条 intent；`composeCarriedRequest()`
  用「上一轮 objective + 未取用要求」开下一轮；`steerReceipt/stopNote/idleStopNote/carriedNote`
  中英成对；`CHANNEL_OUTCOMES` 四个台账标签。
- `src/gate.ts`：**单一决策点** `answerOnChannel()`（在 team/full 两条接纳之前，收掉了原先
  两处重复 steering 块）：有活通道 → stop 走 `cancelLiveRuns()`（唯一合法取消，经 run 自己的
  `cancel()`，结算走 `keepCancelledWork()`），其余 `push(composeIntentText(...))` 后立刻回执；
  无活通道 + 裸停 → 回「没有在跑的任务」而不派工；其余返回 `undefined` 走原路。
  `runChannelRound()` 是每轮的唯一执行壳：开通道（`openSteering`）→ `runTeam(steeringToken)` →
  交付 → `finally` 里先 `take()` 再 `closeSteering()`，未取用要求用 `composeCarriedRequest()`
  递归开下一轮（`steer-carried-to-next-round`），所以要求只会「并入」或「带入下一轮」，不会两头都占或都不占。
  team/full 两条后台接纳改走 `runChannelRound`。
- `src/run.ts`：只加 `RunWorkflowOptions.steeringToken?` 与 `buildWorkflowRequest(..., token)`
  透传（通道开关归 gate，run 自身早退不会泄漏队列）；`src/types.ts` 补 `GrokWorkflowConfig.replan?`。

验证（本轮实测）：`npx vitest run test/channel.spec.ts` → **41 tests PASS**；
`npx vitest run test/gate.spec.ts test/grok-on-ingress.spec.ts test/phase1-dialogue.spec.ts
test/triage-recall.spec.ts test/composition.spec.ts` → **128 tests PASS**；
`npx tsc -p tsconfig.json --noEmit` 仅剩并发轮 nyc `.tsx` `--jsx` 一错（他 lane）；
`npx oxlint src/channel.ts src/gate.ts src/run.ts test/channel.spec.ts` → 0 errors / 2 warnings
（`cancelledText` 既有 spread、`run.ts` 既有 `RoleName` 未用，均非本轮）；
`npm run build` + `npm run verify:lib` exit 0。**全量 `npm run ci` NOT_RUN**（lead 统一跑）。
**真机 GUI 手势验证 NOT_RUN**（改的是 host 侧循环，需真实浏览器会话双击；见 HANDOFF 待办）。
证据：`docs/knowledge/evidence/session-channel-2026-11-22/`。）

Last updated: 2026-11-22 19:30 +08:00（**已发版 `0.13.11`：守卫判停预算永远跟随单次调用预算，`CONFIRMED`** —
发版提交 `52d7522` + tag `v0.13.11` 已推；远端 CI `45017440836` success、Release `45017443293`
success 并已发布。本地门禁：typecheck（除并发轮 nyc/--jsx 单错外干净）、lint 0 errors、
`npm test` 80 文件 / 1526 测试 PASS、`verify:lib` byte-identical。）
用户提「主会话当沟通渠道 + 规划助手跑中重规划」。实查：会话没被占死（team 档后台跑，
`src/gate.ts answerTeamInteractive()`），真问题是跑中新消息走整轮 cancel + 窄重启
（`gate.ts` Redirect-on-new-message 段，`CONFIRMED`）。地基四条（`CONFIRMED`，证据在
`docs/knowledge/evidence/midrun-channel-steering-2026-11-22/`）：realm 是 `vm.createContext({})` +
`agent/parallel/pipeline/phase/log/args` 六个全局；`args` 起跑即 `structuredClone`；host 只有整轮
`cancel(reason)`；孩子一次性。结论：没有 host→script 推送通道，转向只能由脚本在**波边界**拉取。
产出 `docs/knowledge/DESIGN-midrun-channel-steering.md`（三件套 + 六条语义 + A1–A6 + D1–D6 + 附录取证）、
D-103。`npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts
test/docs-architecture-version.spec.ts` → 23 tests PASS（docs-only 不破文档守卫）。
**未改任何 src、未跑全量 `npm run ci`、未提交**；实施与真机验证 NOT_RUN。）

Last updated: 2026-11-22 18:20 +08:00（**已发版 `0.13.10`：单次调用预算可配默认 120 分钟，`CONFIRMED`** —
发版提交 `697564a` + tag `v0.13.10` 已推；远端 CI `45011630777` success、Release `45011644468`
success 并已发布。本地 `npm run ci` exit 0：80 文件 / 1525 测试 PASS。）

Last updated: 2026-11-22 14:00 +08:00（**已发版 `0.13.7`：任务带缩进+排序+三链常显，`CONFIRMED`** —
前人已把三件套写完躺在工作树（`src/progress-tab.ts` 固定三链 PROGRESS_CHAIN + taskNumber 排序 +
guardian 判别，`src/client/index.js` 镜像 + 16px 缩进 + pending 虚线胶囊），我接手收尾：
补 4 个 i18n key（chain.execute/check/review/pendingHint 中英）→ 修旧测试
（按「每行一胶囊」写的改按「固定三链」断言）→ 重建 lib → 全量 CI exit 0
（78 文件 / 1480 测试）。发版提交 `5d31383` + tag `v0.13.7` 已推；远端 CI `44991529208`
success、Release `44991531822` success 并已发布。）

Last updated: 2026-11-22 13:28 +08:00（**已发版 `0.13.6`：守卫问心跳 + 打断重救，`CONFIRMED`** —
`8e129c1` 已推，annotated tag `v0.13.6` 已推；远端 CI `44989417857` success、
Release `44989425946` success 并已发布。本地 `npm run ci` exit 0：78 文件 /
1480 测试 PASS。）

Last updated: 2026-11-22 13:16 +08:00（**C1/C3 守卫问心跳 + 打断重救落地 `CONFIRMED` 未发版** —
10s 一扫 + C1 会话心跳（`subagentTiming.active.through` 只取时间戳，planner 模式也管）+
C3 rescue 全链（adjudicator 判 rescue→脚本广播→host interrupt+递引导语→finding 留账，
无限次；pre-adoption buffer + start→rescue→end 回放顺序红测抓坑已修）。`npm run ci`
exit 0：78 files / 1480 tests PASS。`CHANGELOG [Unreleased]` 一修两变、D-099、
VALIDATION、HANDOFF 已记。真机实救 + 模型实测 rescue NOT_RUN。未提交未发版。）

Last updated: 2026-11-22 12:45 +08:00（**已发版 `0.13.5`：三个开关搬到模型选择器左边，`CONFIRMED`** —
前人已把 slot 搬迁写完躺在工作树（`src/client/index.js` + `lib/client.js` + 测试同步，逻辑零改动），
我接手验证：`test/client.spec.ts` 119 例全过 → 全量 CI exit 0（78 文件 / 1472 测试）→ 修了 sed
吃掉 `#` 的两个 README 散文 tag（`docs-version.spec.ts` 钉死 `` `#vX.Y.Z` `` 格式）→ 重跑 CI 全绿。
发版提交 `eedc135` + tag `v0.13.5` 已推；远端 CI `44986288540` success、Release `44986290567`
success 并已发布（tgz 681K）。`??` 未跟踪文件未动，不属本轮。）

Last updated: 2026-11-22 11:34 +08:00（**已发版 `0.13.4`：B1/B2/B3 守卫存活信号，`CONFIRMED`** —
`993e5de` 已推，annotated tag `v0.13.4` 已推；远端 CI `44981149499` success、
Release `44981159054` success 并已发布。本地 `npm run ci` exit 0：78 文件 /
1472 测试 PASS。`??` 未跟踪文件（并发轮的 `.rsi/evidence/*`、
`docs/knowledge/evidence/branch-cleanup-2026-11-22/`）未动，不属本轮。）

Last updated: 2026-11-22 11:00 +08:00（**已发版 `0.13.3`：7 个 RSI 分支全收 + 分支清零，`CONFIRMED`** —
前人已把 7 个 `rsi/round-*` cherry-pick 进 main（12 提交 `fff56c4..f3fd972`，`src/redact`/`delivery`/`gate`
+ 3 测试修复 + 4 测试补钉；4 块源码 main 已有等价实现故只收测试——验证过行为一致），我接手验证：
定向 7 文件 230 例全绿 → `npm run build`（`lib/` 与 `src/` 字节一致）→ `npm run ci` exit 0
（78 文件 / 1464 测试）。发版提交 `5d614f3` + tag `v0.13.3` 已推；远端 CI `44978408473` success、
Release `44978415364` success 并已发布。7 个 rsi 分支本地已删（SHA 已记 DELETED.shas），远端本就
没有。现本地仅 `feat/audit-layer` + `feat/user-delivery`（真未合，另议），远端仅
`cloud/harden-issue-watcher` + `fix/token-meter`（远端独有，另议）。open PR 0。）
本地 40→10、远端 35→4。删的都是 `merge-base --is-ancestor` 确认已进 main 的（26 个本地 `branch -d`
全过、无需 `-D`；远端 24 个 MERGED + 2 个复核后确认已合的）。剩下本地 9 + 远端独有 2：
`rsi/round-4..8,10,11`（7 个真未合：round-4 Authorization 全 scheme 脱敏等安全修复都不在 main 里，
删了丢工作——留着）、`feat/audit-layer` + `feat/user-delivery`（本地：report-audit.ts /
22 文件 user-delivery 层，main 里没有——留着）、远端独有 `cloud/harden-issue-watcher`（11 提交）
+ `fix/token-meter`（4 提交，main 有等价 Round 22 但提交不同——留着）。另删 4 个已超期本地
（`release/0.5.1` PR #42 后 2 提交被 0.6.0 取代、`wip/grok-switch` 被 rebased 版取代、
`fix/fallback-shards` 本地是旧镜像、`feat/layered-synthesis` 已随 0.8.0 发版）与远端
`feat/user-delivery`/`release/0.5.1` 镜像。删除记录 `.rsi/evidence/branch-cleanup-2026-11-22/DELETED.shas`，
未提交。open PR 0 个。）

Last updated: 2026-11-22 10:15 +08:00（**已发版 `0.13.2`：guardian 超时误杀修复 + 固定左栏 + 孤儿产物清理，`CONFIRMED`** —
`b0411c8` 已推，tag `v0.13.2` 已推；远端 CI `44974715432` success、Release `44974726161` success
并已发布。本地 `npm run ci` exit 0：78 文件 / 1454 测试 PASS。）

Last updated: 2026-11-22 01:17 +08:00（**Wave 4 合流与 A1–A6 验收：合流可演示，A1–A5 `CONFIRMED`，A6 `CONFIRMED`（`npm run ci` 01:13 78 files / 1438 tests、01:33 复验 78/1439、两次 exit 0）；未改 Wave 1–3 源码** —
新增验收件 `test/wave4-acceptance.spec.ts`（8 例：L1×DAG 合流 4 例、A6 包络 4 例）与证据目录
`docs/knowledge/evidence/wave4-acceptance-2026-11-22/`（`ACCEPTANCE.md` 逐项台账、`MERGE-DEMO.txt`
合流实跑、`capture-merge-demo.mjs` 可复跑、`CI-WAVE4.log` 绿灯与 `CI-WAVE4-first-run-exit1.log`
首次非绿原样留档、`CI-WAVE4-attempt2.log` 收尾复验）。合流实跑：第一轮两波 DAG（wave 1 `a` 已验证、wave 2 `b` 失败 → PARTIAL）→ 插件
报告消息读回成轮次 → 继承摘要 `retain (generation 1): a` + `redrive (generation 2): b` → 第二轮只把
`b`、`c` 交给 worker（`a` 一次未重跑），波结构保留、COMPLETED。A4 补一条：`blocked` 行回到下一轮是
`redrive`（理由 `blocked in an earlier round`），不是 `retain`。边界如实记 4 条：① 下一轮 plan 不能把
`dependsOn` 指向 retained id（波次校验看不见它，整份 plan 被拒、退 fallback）；② 继承是提示词级约束，
无结构校验阻止 planner 重做 retained 工作；③ `reverify`/`replan`/`changedFields` 生产不可达（唯一调用点
`src/run.ts:625` 不传 `ResumeOptions`）；④ `buildInheritanceDigest` 单轮内行序被 `reverse()` 整体倒置，
与注释「已完成先说」相反（低，未改）。A6 上限未被放宽：常量 10/1/100/3、配置 `maxConcurrency:101` 直接
抛错且 `maxRetries` 不是配置键、脚本把 500/9 夹回 100/3，三处读数一致；`PLAN-dynamic-steering` §5 A6
写的「默认 3/1、硬上限 6/3」是陈旧计划文本，未据其改代码，待 Lead 订正。）

Last updated: 2026-11-21 18:05 +08:00（**RSI 自迭代已停止，`CONFIRMED`** — 用户下令停掉此前的
1000 轮自迭代（每轮一个心跳 Schedule、逐轮 tag + retry）；round 42 从未开，round 41 是最后一轮
已关闭的轮次。停止动作：新建 `.rsi/STOP`（guard 在开轮前测它），`bash .rsi/tools/heartbeat-guard.sh
--round auto --max-rounds 1000 --threshold 3` 现在返回 `STOP code=stop-file … round_max=41
ledger_max=41`（exit 20），即任何重建的心跳行也开不出新轮。Schedule 持久化文件
`~/.dsh/storages/schedule.json` 里只剩无关的每日任务「派发个人助理灵感箱」，没有 `RSI heartbeat`
行（本会话是子代理，`schedule_list` 工具对子代理直接拒绝，故以持久化文件为证据）；后台任务
`job_list` 为空，`grok_loop status` 报本会话 heartbeat closed。清理：`.tmp/` 下 336 个
`heartbeat-guard-*` 一次性 fixture 与空的 `.tmp/deferred-retry` 已删；`git worktree prune` 清掉
指向已消失 `/tmp/grok-cmd-before.lzeyLb` 的孤儿 worktree 元数据。工作树无 `retry.ts`/`retry.spec.ts`
孤儿（`find` + `git ls-files | grep retry` 均无）。**未动**：8 个未合并的 `rsi/round-*` 本地分支
（round-4..11，最后提交 2026-11-18）按「不重写历史、不丢工作」原样保留；`0.12.15`(`01272af`)
仍是已发布版本，未移 tag。`harness.json` 的 `totalRounds:1000`/`taskTitle:"RSI heartbeat"` 是
配置常量，未改；恢复迭代 = 人工删 `.rsi/STOP` 再按 `HARNESS.md` 重新 arm。）

Last updated: 2026-11-21 16:45 +08:00（**已发版 `0.12.19`：进度页改成效果图的双带 = 固定七段脊 + 竖向任务带** —
`src/client/index.js` 的 `ProgressView` 重写为三段结构：`.gw-progress-settle`（按 outcome 分段的
结算条，有运行就一直在）+ `.gw-progress-track`（**只有** 7 个模板段，`kind:'extra'` 的计划任务
不再进脊）+ `.gw-progress-tasks`（每组行一张 inert 卡片，行胶囊直调 `openChild`）。
新增 `measureProgressWires`：量出每个 owner 段的环心 x 与卡片中线 y，画一条干线 + 每卡一支带箭头
的支线（相对 `.gw-progress-flow` 坐标；`ResizeObserver` + `window.resize` 重画，实测相同则不
重渲染）；`progressNodeDuration`/`progressSettleParts`/`progressMemberState` 一并导出给测试。
删除：手风琴分支面板与 `+N` 行、跳到首个失败按钮、缩放控件（`PROGRESS_ZOOM_*`、
`readProgressZoom`/`writeProgressZoom`、三颗按钮、三条文案、`--gw-zoom`；`src/progress-tab.ts`
的 `PROGRESS_ZOOM_STORAGE_KEY` 同时删除）、`.gw-progress-member/open/more/branch/stem/source`
全套样式。文案：删 `progress.jumpToFirstFailure`/`progress.branch.showMore`/`progress.zoom*`，
增 `progress.settle.{aria,ok,bad,warn,open,unsettled}` 与 `progress.tasks.aria`（中英齐）。
测试：`test/client.spec.ts`（胶囊三例扩成四例：每行一颗、直达自己的 child、不可开行仍显示但
inert、点阶段/卡片空白无反应；三条样式断言重写）与 `test/progress-connector.spec.ts`（A+C 分支
三例换成双带五例：脊恒 7 段、owner 挂线、带在脊下方、被删元素缺席、每行一颗胶囊）同步。
`npm run ci` exit 0 = **73 文件 / 1349 测试 PASS**。几何证据（9 个场景×宽度 + 两张图）
`docs/knowledge/evidence/progress-tab-two-track-2026-11-21/`（1440 px 单行 7 列、owner 干线
x=446=执行环心、支线落卡片左边、`removed` 全 0、点阶段/卡片 `openedDelta:0`、逐颗胶囊打开
自己的 child）。**Phase 2（失败重试）仍不做**，`details`/`detailFor` 保留供将来立项。
`test/progress-tab.spec.ts` 同步删掉 zoom 常量断言。效果图 `flow.html` 也同步删了缩放胶囊。）

Last updated: 2026-11-21 16:00 +08:00（**已发版 `0.12.18`：进度页详情卡删除、胶囊直达子会话** —
Q1/Q2 按用户拍板落地：阶段与任务的详情浮层一起删除，点卡片空白处什么都不发生；
Phase 2（失败重试）暂不做。`src/client/index.js`：`ProgressDetail` 与详情样式/
选中/复制/roving-tabindex 全删，`ProgressNode` 与成员卡改为静态 div，唯一动作是
可开行末尾的「打开子会话」胶囊（直调 `openChild`，不可开行无胶囊）。文案删
`progress.detail.*` 等 22 key，新增 `progress.member.open`。测试：detail ladder 整块
替换为三例 pill 断言，手风琴/aria/mono 断言同步；`test/progress-connector.spec.ts`
两例改断默认展开分支。`npm run ci` exit 0 = **73 文件 / 1346 测试 PASS**。
CHANGELOG `[Unreleased]` 已记中英双语条目。**已发版**：`v0.12.18` 已推，远端 CI `44882426442` success、Release 已发布（asset `dsh-grok-workflow-0.12.18.tgz`）。）

Last updated: 2026-11-21 10:05 +08:00（**已发版 `0.12.16`** —
`v0.12.16`（annotated tag → `f24fc87`）已推，远端 CI `44853807202` success、
Release 已发布（asset `dsh-grok-workflow-0.12.16.tgz`）。
内容：对话框底部 workflow 总开关（按钮+`POST /grok-workflow/mode` 路由）、
`/grok` 开关词去空白不分大小写、进度页展开分支移出脊柱；另修设置冒烟脚本字段数写死
（`CONFIG_KEYS` 为准）与 LOCAL-TESTING 包名。`npm run ci` 本地 73 文件 / 1350 测试 PASS。
实测：线上 `web` profile 用 `clone-profile` 复制到隔离目录（7334 文件，2 链接修复，
1 处 key 形值脱敏），装包后字节与仓库一致；总开关端到端（命令关→按钮读→门控拦→
按钮开→门控放行）PASS，进度页几何 48 用例 PASS。完整 Web boot 在沙箱下受限未跑。
agent-49 的 `clone-profile` 脚本+测试+证据是并发范围，未合入本版。）

Last updated: 2026-11-21 08:40 +08:00（**进度页 UI 展示缺陷已修：展开分支移出脊柱（Chromium 实测 48 用例 0 问题）** —
`0eb5d8f` 的发布形态里，展开阶段的成员面板是横向 `.gw-progress-track` 的又一个 flex 子项并带
`width: 100%`，1200 px 下把每个 stage 挤到 21 px、label 计算宽度 0；默认展开（failed 优先、
其次 doing）意味着任何进行中的运行都会散架。`.gw-progress-ring` 当时只有 reduced-motion 引用、
没有基础规则，环是 8–9×17–19 px 无边框内联 span。现分支渲染在轨道**下方**（`data-state` 在面板上），
环补齐 28 px/2 px 几何，segment 内横线删除、连接线压到环心 13 px 并新增 `data-flowing`，
head 可换行、≤720 px 环上 label 下、≤480 px 连接线随竖排隐藏，空阶段面板写同一句说明。
几何断言 48 例（6 场景 × 8 宽度）修复前 40 例/884 条失败、修复后 0 条；`npm run ci` exit 0 =
**72 文件 / 1344 测试 PASS**，`verify:lib` 157 文件逐字节一致。证据
`docs/knowledge/evidence/progress-tab-ui-fix-2026-11-21/`。**未发版**（0.12.15 未动）。
NOT_RUN：真机 DSH Web 面板手点；`blocked` 抽屉形态单独截图。）

Last updated: 2026-11-21 08:35 +08:00（**总开关 core 路由已落地并推送（`edc7920`），进度页空分支说明已合（`660d79d`）** —
`src/mode-surface.ts` 新建：`POST /grok-workflow/mode` 读写同一条 `plugin:grok-workflow/mode`
记录（按钮和 `/grok` 同源，门控 `gate.ts:521` 读同一条），回读作答；`src/index.ts` 挂载，
fallback 读 live `grokDefault`。`test/mode-surface.spec.ts` 20 例（状态读写、拒绝码、门控联动、
重启可恢复、同源保证）。进度页：`progressNodeMeta` 抽成共用，空分支面板显示同一句说明。
`npm run ci` exit 0 = **72 文件 / 1344 测试 PASS**，typecheck 0 错，oxlint 0 error，
`verify:lib` 157 文件逐字节一致。**未发版**，版本号仍 `0.12.15`。NOT_RUN：真实浏览器手点三开关。
另记：**用户要求回消息只用用户用的语言，不中英双语、不发半截话**。）

Last updated: 2026-11-21 08:10 +08:00（**对话框底部第三个开关：workflow 总开关（`/grok on|off` 的按钮形态），未发版** —
`src/client/index.js` 新增 `MODE_ROUTE_PATH='/grok-workflow/mode'`、`MODE_ACTIONS=['status','set']`、
`MODE_SWITCH_ORDER=92`、`makeModeSwitch` 形态的 `ModeSwitch` 组件与 `GROK_WORKFLOW_MODE` 导出；
dock 三挂载（`startBothSwitches` 改名 `startDockSwitches`，loop 90 / iterate 91 / mode 92）。
传输层抽成共享 `routeUrl`/`postRoute`，loop/iterate 的 `send` 改用它（行为与错误码不变）。
按钮读写的是 `src/mode-surface.ts`（agent-36）已落地的 `POST /grok-workflow/mode`：body
`{action,sessionId,enabled?}`，回 `{ok,action,mode:{enabled,...}}`，真相源 = 会话记录
`plugin:grok-workflow/mode`；UI **不硬编码默认值**（无记录时显示路由报回的 `grokDefault`），
也不新增 `masterEnabled` 存储。关闭态三重提示：文案「关」、空心指示灯、熄灭胶囊。
`npm run ci` exit 0 = **72 文件 / 1341 测试 PASS**、typecheck 0 错、oxlint 23 warnings / 0 errors、
`verify:lib` 通过；`lib/client.js` 随 `src/` 重建。红证据：改错路由常量 → 2 failed；
把关闭态画成开启 → 4 failed（`docs/knowledge/evidence/workflow-switch-button-20261121/`）。
**未发版**：只加 UI 与测试，版本号未动。NOT_RUN：真实浏览器 GUI 手点（需在真机 profile 里
装载后点一次，prod 路径证据止于「真 client bundle → 真 `node:http` → 真 `handleModeRoute` →
真 `Session` 记录回读」）。**工作树其余改动属并发轮**：`src/index.ts`、`src/mode-surface.ts`、
`lib/index.*`、`lib/mode-surface.*`、`test/mode-surface.spec.ts` 是 core 兄弟（agent-36）的，
本轮未提交它们。）

Last updated: 2026-11-21 08:05 +08:00 (**`/grok` 开关词改为「去空白 + 不分大小写」** —
任务「实现 /grok on|off 斜杠命令」派到我名下；实测该命令**早已存在**（`src/command.ts` +
`src/mode.ts` + `src/gate.ts:521`，D-028/D-029/D-078 已定），本轮只补真实缺口：`rawInput` 解析。
改法：`trim()` 后 `toLowerCase()` 再比 `on`/`off`（`trim` 覆盖空格/制表符/换行/U+00A0/U+3000），
非字符串参数直接回用法提示（旧代码在那里抛 `TypeError`），`on`/`off`/空之外仍不写任何记录。
**裸 `/grok` 仍然=开**：委派 AC 里「无参数也要用法提示」与本仓库已发布契约（D-028、README 双语、
客户端 `status.off.detail`、4 条既有测试）相反，未按 AC 回退，冲突写进 `D-095` 与交接待裁决。
状态字段澄清：不存在 `masterEnabled`；唯一总开关是会话记录 `plugin:grok-workflow/mode.enabled`
（兜底配置默认值 `grokDefault`），命令与 Agent-37 的 dock 开关（`POST /grok-workflow/mode`，
`status|set`）读同一条记录。
**测试**：`test/command.spec.ts` 19→26 例（+7），改前 4 红 / 改后 26 绿（证据
`docs/knowledge/evidence/grok-command-grammar-20261121/`）；`npx vitest run --exclude
'test/client.spec.ts'` = **70 文件 / 1212 例 PASS**；`npm run typecheck` exit 0；`npm run lint`
0 error / 23 warning。`test/client.spec.ts` 当前 **15 红**，来自并发轮未提交的
`src/client/index.js`（+91 行，dock 总开关），不由本轮引入、也未提交其文件。
**未发版、未改版本号、无 force-push；未改 DSH core、未写密钥。**

Last updated: 2026-11-20 23:15 +08:00 (**已发版 `0.12.14`，web profile 已更新** —
`v0.12.14`（annotated tag → `c0eabef`）已推，远端 CI `44760621921` success、
Release `44760644587` success（asset `dsh-grok-workflow-0.12.14.tgz`）。
内容即 `[Unreleased]` 里那条 `/compact` 修复；发版提交只含版本号+CHANGELOG+README
版本联动（`package.json`/`package-lock.json` 0.12.14，README 双语版号/示例/tag 列表
同步到 v0.12.14，`v0.12.13` 保留在已发布列表里）。
`~/.dsh/profiles/web` 的 `dsh-grok-workflow` 已从 `github:` 未固定版升到
`github:free6589/dsh-grok-workflow#v0.12.14`（`plugin ls` = 0.12.14，`lib/` 的
`.js`/`.d.ts` 与仓库逐字节一致，闸门三件套在装好的包里确认存在）。
**工作树仍有并发轮未提交改动**（CHANGELOG 双语条目第二条、`src/delivery`、
`src/checkpoint/schema`、`test/delivery-human-block`、`test/checkpoint-bound`、
`test/config-chain-types`），发版时已 stash 隔离、发完原样恢复；`test/checkpoint-bound`
依赖被 stash 的 schema 注释改动，发版校验时曾临时移开、已放回。
未改版本号之外的东西，无 force-push，旧标签未动。

Last updated: 2026-11-20 22:45 +08:00 (**存量会话离线修复 + 新 profile 实测** —
用户报的 `session-3a683cb6` 的 `/compact` 报错已修好：该会话两行旧版卸载通知
（seq 3553、seq 5424，无 `step/start` 的 `assistant/message`）已在离线改为同 seq/同时间的
`plugin:grok-workflow/terminal` 记录，文字逐字保留，seq 0–7476 连续；真实 DSH 0.2.2-rc.3
`Session.create` + `TokenMeter.measure` 全量回放从「seq 3553 抛错」变为
"7507 事件、`totalTokens=508565` 通过"（`REPAIR EFFECTIVE: true`）。
`test/compact-step-pairing.spec.ts` +1 用例（7 绿）钉住「terminal 形状过 meter」。
新 profile `verify-compact`（`sdk` 模板、插件 `link:` 安装）上 `drive.mjs --team`：
真实团队档 turn + 真实 `/compact` 一次通过
（`Compacted 7 history items`，0 孤儿行，`ok: true`）。
`npm run ci` 在含并发轮改动的全树上 72 文件 / 1306 测试 PASS。
备份 `.rsi/evidence/compact-repair-20261120/`（before 日志 + 测量输出）。
工作树仍有并发轮未提交改动（CHANGELOG/`src/delivery` 等），本轮只动了测试文件，未发版。

Last updated: 2026-11-20 15:50 +08:00 (**compact 修复已并入 main** —
用户报 `/compact` 报错，根因是回执/通知/取消终态三处都在没有打开 step 时写 assistant 行，DSH 的
token 计量器回放第一次就抛 `token meter: assistant/message at seq N has no matching step/start
event`，游标不前进 → 此后每次测量都抛，`compactNow()` 先测量 → `/compact` 报错、自动压缩静默失效。
修复：新增 `openStepOf()` 闸门（`src/records.ts`），三个写点统一走 `appendAssistantInStep()`；被拒的
回执/通知文字改存 `plugin:grok-workflow/terminal` 记录（`D-094`）。
**并入方式**：分支 `fix-compact-orphan-receipt`（`5fb5da0`，base `39eda66`）由**并发的发版轮**以 merge
提交 `e80ed6d`（父 `490edce` + `5fb5da0`）并入 `main`；其 `CHANGELOG` 解法与本轮独立解出的一致——
修复留在 `[Unreleased]`、`0.12.13` 已发版段原样保留。**未改版本号、未打新 tag、无 force-push。**
`lib/` 由合并后的 `src/` 重建，`git status -- lib/` 为空（分支提交的 `lib/` 就是合并后源码的构建产物，
`verify:lib` 在合并树上 exit 0：153 files byte-identical）。`@deepseek-ai/dsh-token-meter` 是本轮新增 devDependency，主 checkout 原先没装
（`tsc` 报 TS2307，`npm install` 后 exit 0）。
**合并树上实测**：`npx vitest run` = **70 文件 / 1269 测试 PASS**（`39eda66` 上 1262 + 本修复 6 +
R38 1）；`npm run typecheck` / `lint`（0 error、24 warning）/ `build` / `verify:lib` 均 exit 0。
**之前 / 之后同一条命令**：`scripts/repro-compact.mjs` 在合并前的 mainline `490edce` 自己的 `lib/` 上
exit 1（计量器错误直达 `/compact` handler），在合并后的 `main` 上 exit 0 并答
`No compactable history yet.`；`test/compact-step-pairing.spec.ts` 在 `490edce` 树上 4 红 / 2 绿，
在合并后 6 绿、连跑两次同结果。证据 `.rsi/evidence/compact-fix/{main-before,main-after,main-before-test}.txt`。
GUI 手点 `/compact` 仍属 NOT_RUN（会真的压缩一个活动会话）。

Last updated: 2026-11-20 13:38 +08:00 (**round-036：base64 折行低于续行下限时整块留下；checkpoint 上界文档复核** —
折到 7 列及以下的 base64 私钥块，窗口能匹配但没有任何一行够长当续行，于是 272 字符里留 244 个，
解回去就是横幅与密钥本体（round 33/34 的断言只解码 ≥4 字符碎片，看不见）。新增
`BASE64_CONTINUATION`：≥8 行逐行吃 + 连续 ≥2 行短行整段吃（可选，否则宽折行整体失配，第一版踩过）。
页脚规则按实测改写（末行 <8 留、≥8 吃），`ARCHITECTURE` 的「16 字符 / 窄于 24 列不匹配」两处过期文字
删除；`test/redact.spec.ts` +3 用例（折行 1–7 两侧、页脚 7/8 两侧、base64 PGP 两侧边界）。
checkpoint 上界 1,048,447 的注释与用例属 round 31（`a97d099`），本轮复核通过、未改动（`A41`、`D-091`）。
代码提交 `e3be559`；干净 worktree 上 `npm run ci` exit 0 = **68 文件 / 1236 测试 PASS**、
`verify:lib` 153 files byte-identical；HEAD `aabed51`（含并发 harness 轮）上 `npm run ci` exit 0 =
**69 文件 / 1251 测试 PASS**。**未发版**（`0.12.10`/`0.12.11` 由并发进程发出，规则随 `0.12.10` 已在线上）。

Last updated: 2026-11-20 12:05 +08:00 (**round-033：手工折行的 base64 私钥整块落进报告；顺带修好账本滞后** —
`base64-private-key` 的窗口原是连续 20 字符字面量，任何窄于它的折行都把标记自身拆开，实测
8/12/16/19/20/21/22/23 列全部整块留存、24 列才第一次生效。窗口改为生成式、字符间可容忍一个断行
（真实换行或 JSON `\n` 转义），续行下限 16→8 并按行边界锚定（`D-088`、`A37`）；折行 ≤7 列仍留，
并入池。同轮修掉记录层缺陷：`.rsi/ledger.jsonl` 停在 25、`ROUND.md` 已到 32，门禁读到
`round-without-ledger`（三轮 SKIP 会升级成 STOP），补 27–32 六行并新增 `test/rsi-ledger.spec.ts`。
`npm run ci` exit 0 = **68 文件 / 1231 测试 PASS**。**已发版 `0.12.8`**：commit `9f91684`、annotated
tag `v0.12.8` 已推；远端 CI `44670766356` success、Release `44670771402` success
（asset `dsh-grok-workflow-0.12.8.tgz`，602,301 B）。）

Last updated: 2026-11-20 11:10 +08:00 (**round-032：删零调用的面板投影模块，未发版** —
`src/panel.ts`（286 行）零生产导入者（`src/` 零引用、`src/index.ts` 不导出、bundle 不用），
活面板走 `progress-tab.ts` + bundle 渲染器。删模块 + 自有测试（557 行）；
`test/gui-fold.ts` 自带 `PanelEvent` 类型供 `test/progress.spec.ts`。
`npm run ci` exit 0 = **67 文件 / 1223 测试 PASS**（-13 例皆所删模块自有测试）；
`npm run verify:lib` 153 files byte-identical。**已发版 `0.12.7`**：commit `56e701d`、annotated tag `v0.12.7` 已推，远端 CI `44666191493` success、Release `44666195466` success（asset `dsh-grok-workflow-0.12.7.tgz`）。）

Last updated: 2026-11-20 12:10 +08:00 (**round-034：双重转义的折行 base64 块，未发版** —
HEAD 上真换行折行 1–24 列已全盖（round 33），活缺口是已带字面 `\n` 的日志行再包一层 JSON
（反斜杠加倍，单反斜杠断行分支对不上）。`BASE64_BREAK` 加双反斜杠分支 +1 用例；
报告/提示词两边界同走 `REDACTION_RULES`，无分叉。
`npm run ci` exit 0 = **68 文件 / 1232 测试 PASS**（基线 68/1231，+1）；
`lib/redact.*` 随 `src/` 重建。**已发版 `0.12.9`**：R3 提交 `5d3bcea`（并发轮落地）+ R5/R6 提交 `4b751b3`、annotated tag `v0.12.9` 已推，远端 CI `44673443254` success、Release `44673449471` success（asset `dsh-grok-workflow-0.12.9.tgz`）。）

Last updated: 2026-11-20 15:40 +08:00 (**round-038 收口：非字符串 model/provider，未发版** —
`entry?.model?.trim()` 对非字符串抛 bare TypeError。现在拒绝带完整路径 + got-type；
`{model: null}` 从「空字符串」分支改走「类型错」分支。`npm run ci` exit 0 =
**69 文件 / 1263 测试 PASS**（+1 用例）；`lib/` 随 `src/` 重建。
**已发版 `0.12.13`**：R38 提交 `7825ca7`（+证据 `490edce`）、annotated tag `v0.12.13` 已推，远端 CI `44697135387` success、Release `44697140006` success（asset `dsh-grok-workflow-0.12.13.tgz`）。）

Last updated: 2026-11-20 14:10 +08:00 (**round-036 收口：2400 截断保头尾，未发版** —
超长人话块从尾砍，结论行被砍、双语时第二语言全没。现在保头（答案）+保尾（结论），
从中间砍；双语每块独立截。`test/delivery-human-block.spec.ts` +3 用例（旧码 1 failed）。
`npm run ci` exit 0（69/1262，含并发轮测试）。**已发版 `0.12.12`**：R36 提交 `aa5e79c`、发版提交 `61c7cb8`、annotated tag `v0.12.12`（→`61c7cb8`）已推，Release `44686655900` success（asset `dsh-grok-workflow-0.12.12.tgz`）。）

Last updated: 2026-11-20 13:05 +08:00 (**round-035 收口：嵌套未知键，未发版** —
`roles.reviewer` 与路由字段手误 `maxInflight` 曾被静默丢弃（补丁留着、运行忽略）。
`assertKnownKeys` 走三层（顶层/角色名/路由字段），拒绝报完整路径 + 最接近可用键；
合法补丁不受影响（迁移：删掉点名的键，无替代值）。
`npm run ci` exit 0 = **68 文件 / 1233 测试 PASS**；`lib/` 随 `src/` 重建。
**已发版 `0.12.10`**：R3 提交 `0ef5bb7` + 构建 `0d91e45`、annotated tag `v0.12.10` 已推（远端 CI 红：并发轮塞入的 2 个窄折行测试与源码不一致，见 Round 89）；**已发版 `0.12.11`**：回退提交 `5749a08` + 发版提交 `d181812`、annotated tag `v0.12.11`（→`d181812`）已推，远端 CI `44681025399` success、Release `44681029703` success（asset `dsh-grok-workflow-0.12.11.tgz`）。）

Last updated: 2026-11-20 10:20 +08:00 (**round-031：检查点「拒绝带」上限的注释多算了 129 字节** —
行为自 round 27 起就是对的（写入侧双向按 `maxBytes` 收敛），错的是注释：完整性记录不是固定 129 字节，
而是 **122 字节 + `bytes` 的十进制位数**（4,000 字节载荷配 126 字节、1,048,447 配 129 字节），所以
`writeCheckpoint` 从 **1,048,448** 就拒绝，真上限是 **1,048,447**。注释改正并点名守卫；
`test/checkpoint-schema.spec.ts` 新增 1 条：从真实封存文件量出开销→解出上限→在 1,048,447 处写入成功
（文件正好 1,048,576 字节、读回完整）→1,048,448 处 `too-large`→把 `src/checkpoint/schema.ts` 读回来
要求注释写出该上限。`npm run ci` exit 0 = **68 文件 / 1236 测试 PASS**（基线 1235，+1）；typecheck 0 错、
oxlint 24w/0e。红绿：旧码 worktree 里该用例 **1 failed**（注释守卫），新码 **38 passed**。
文档：`DECISIONS.md` D-087、`RESEARCH.md` A36、`VALIDATION.md` Round 83。证据 `.rsi/evidence/round-031/`。
**不发版**：只改注释与测试，无用户可见变化，按 `docs/RELEASING.md` 不 bump、不打 tag、`[Unreleased]` 保持空。
上一版仍是 `0.12.6`（commit `e7150ab`、tag `v0.12.6`、CI `44659057507`、Release `44659061505`）。）

Last updated: 2026-11-20 10:13 +08:00 (**round-030：base64 包裹的 GnuPG 私钥不再原样进报告** —
round 29 只堵了 PEM 这一半，`base64` 过的 GnuPG 钥匙串导出/JSON 字段里的密钥整块进报告、诊断和
复查/重试提示词，因为编码形态里根本不存在解码后的横幅。`base64-private-key` 从 3 条标记扩到 9 条
（`PRIVATE` 与遗留 `SECRET` × 三种分组对齐），窗口取到横幅第 17 字节——`PRI`/`SEC` 与 `PUB` 正是在
那里分开，实测「共享前缀 `-----BEGIN PGP ` 的标记」会连 base64 公钥一起脱敏，故不采用。
`npm run ci` exit 0 = **68 文件 / 1235 测试 PASS**（基线 1233，+2）；typecheck 0 错、oxlint 24w/0e；
`verify:lib` 在提交后复核 `e7150ab` 153 files byte-identical。红绿：旧码 worktree 里
`-t "GnuPG"` → 2 failed | 35 skipped，失败输出就是整串编码后的块；新码 37 passed。
文档：`DECISIONS.md` D-086、`RESEARCH.md` A35、`VALIDATION.md` Round 81/82、`ARCHITECTURE.md`
覆盖清单与已知缺口、`CHANGELOG.md` 双语条目。证据 `.rsi/evidence/round-030/`。
**已发版 `0.12.6`**：commit `e7150ab`、annotated tag `v0.12.6`（对象 `167b475`）已推，
远端 CI `44659057507` success、Release `44659061505` success（asset
`dsh-grok-workflow-0.12.6.tgz`，600,316 B）；旧标签对象未动，无 force-push。
顺带量出并**未修**的边界：**<24 列折行**的 base64 块会把 20 字符标记拆到两行，整块完全不匹配
（8/12/16/19/20/21/22/23 列留 180–184/184 字符；24 列起才脱敏）——PEM 自 round 29 起既有，已入池。
NOT_RUN：真机 GUI 手点；2026-11-20T10:01:50Z 之后的真实定时投递（子代理被拒 `schedule_*`，
心跳行 `COUNT=10` 仍撑不到 12-01，需主会话续订）。）

Last updated: 2026-11-20 09:45 +08:00 (**round-029：base64 包裹的私钥不再原样进报告** —
每条 armor 规则匹配的都是解码后的横幅，所以 `base64 -w0` 的密钥文件、或藏在 JSON 字段/blob 里的
base64 私钥整块进报告；旧代码只在前面恰好有敏感名标签（`PRIVATE_KEY=`）时才被 `key-value` 顺手
挡住。新规则 `base64-private-key` 匹配横幅的编码形态，三种分组对齐全盖，整块替换含换行续行；
base64 `CERTIFICATE` 与被 base64 包裹的 PGP armor 有意不动（后者仍是池里的缺口）。
`npm run ci` exit 0 = **68 文件 / 1233 测试 PASS**（基线 1230，+3）；typecheck 0 错、oxlint 24w/0e、
`verify:lib` 153 files byte-identical。红绿：旧码 worktree 里新用例 2 failed / 1 passed，失败输出
就是整串 base64 私钥体。文档：`DECISIONS.md` D-085、`RESEARCH.md` A34、`VALIDATION.md` Round 79、
`ARCHITECTURE.md` 覆盖清单与已知缺口、两份 README 安全条目。证据 `.rsi/evidence/round-029/`。
**已发版 `0.12.5`**：commit `5b7cae1`、annotated tag `v0.12.5`（对象 `47fcb52`）已推，
远端 CI `44656151053` success、Release `44656153854` success（asset
`dsh-grok-workflow-0.12.5.tgz`，599,562 B）。
NOT_RUN：真机 GUI 手点、真实定时投递（子代理被拒 `schedule_*`；现有心跳行 `COUNT=10` 只到
2026-11-20T10:01:50Z，撑不到 12-01，需主会话续订）。）

Last updated: 2026-11-20 09:10 +08:00 (**round-028 收口：R11，CI 全绿，未发版** —
取消终结不再走 `relayText`（成功前言+markers+折叠台账），改说人话结论；
`phase1-dialogue` 3 个旧断言随行为同步更新（行为断言未动）。
`npm run ci` exit 0 = **68 文件 / 1230 测试 PASS**；`lib/` 随 `src/` 重建。
**已发版 `0.12.4`**：commit `5cd2b1c`、annotated tag `v0.12.4` 已推，远端 CI `44652383452` success、Release `44652387975` success（asset `dsh-grok-workflow-0.12.4.tgz`）。）

# Project State

Last updated: 2026-11-20 08:55 +08:00 (**round-027：读侧字节上限跟着写入侧走，载荷越界不再「写得进读不出」** —
`assertCheckpoint` 把 `integrity.bytes` 卡在 `countCeiling`（1,000,000，行数上限），而
`sealCheckpoint` 接受载荷到 `maxBytes`（1,048,576）：落在这两者之间的检查点封装、落盘都成功，
读回即 `invalid`，续跑永远起不来。一行上限改为 `maxBytes` + 注释；新用例把载荷顶过边界再落盘读回
（一条最大宽度证据行 2,055 字节，481 行 = 1,001,015 字节；503 行仍在上限内，故带内至少 22 行宽）。
`npm run ci` exit 0 = **68 文件 / 1230 测试 PASS**（基线 1229，只增不减），typecheck 0 错、
oxlint 24w/0e、`verify:lib` 提交后复核 153 files byte-identical。**选题前先把 `POOL.md` 与树对表**：
六条已陈旧（`records.ts` 全 `redactError`、`history.ts` 先脱敏后截断、`answerLead` 三段候选、
R6/R9 随 0.12.2、R10 随 0.11.20），R11 仍成立（`gate.ts:611-644` 仍组合 `relayText`）。
文档：`DECISIONS.md` D-084、`RESEARCH.md` A33、`VALIDATION.md` Round 76、`ARCHITECTURE.md`
的字节上限句。证据 `.rsi/evidence/round-027/`。NOT_RUN：真实定时投递（D-066）、GUI 手动点击拍照。
发版见 `docs/RELEASING.md`。**已发版 `0.12.3`**：commit `fd6a5ee`、annotated tag
`v0.12.3`（对象 `0c66263`）已推，远端 CI `44647313571` success、Release `44647317251`
success（asset `dsh-grok-workflow-0.12.3.tgz`，597,237 B）。档案 `~/.dsh/profiles/web`
升到 `#v0.12.3`（`lib/` 与标签 `diff -r` = 0），宿主 pid `154637` 未重启；装好的产物自身
跑通 1,001,051 B 载荷落盘→读回。独立复查 `reviewer-027` = `ACCEPT`（worktree 里改回旧上限
复现 1 failed / 36 passed）。NOT_RUN：运行中进程内存里的代码身份、复制档案实例的 GUI 交互。


Last updated: 2026-11-20 08:20 +08:00 (**`web` profile 已到最新发布 `v0.12.2`，仓库无需变动，DSH 未重启** —
远端最新 tag/Release 仍是 `v0.12.2`（`40228c5`），本地 `main` = `origin/main` = `5bd5bfe`
（`git describe` = `v0.12.2-4-g5bd5bfe`）：标签是祖先，其后只有四条 docs 提交
（`074e2c3`/`07666fb`/`09c2bc9`/`5bd5bfe`），`git diff --name-only v0.12.2..HEAD -- src lib test
package.json` = 0 个文件，发布代码与标签逐字节相同——故无提交可 fast-forward、也没有回退到标签
提交（回退会丢已推记录并让本地落后远端）。档案侧 `~/.dsh/profiles/web` 的 `dsh-grok-workflow`
由 `#v0.12.1` 升到 `#v0.12.2`（`dsh plugin --profile web add`，锁文件解析到 `40228c5` tarball，
`dsh plugin ls` = `0.12.2`，`node_modules` 内 77 个 `lib/**/*.js|*.d.ts` 与仓库 `lib/` sha256
全同）。DSH 主进程 pid `154637` 的 `lstart`/boot_id 未变、`etimes` 206082→206772+、GUI 仍应答
——**未重启**；核心无档案 watcher，运行中的进程仍是 `0.12.1` 代码，两条修复要等下次 profile
启动。**验收口径冲突（`CONFIRMED`）**：「HEAD 等于最新发布标签提交」在「不回退、不 force-push、
本地远端同步、不擅自新发版」四条约束下无解，取舍与被否方案见 `DECISIONS.md` D-083。
NOT_RUN（遵约束）：重启/重载、force-push、移动标签、npm 发布、改 DSH 核心。证据
`.rsi/evidence/profile-update-0.12.2/`。）

Last updated: 2026-11-20 (**round-026 收口：R6 + R9，CI 全绿，未发版** —
`resolveConfig` 传错 `grokDefault` 现在直接拒绝（不再静默按 off 跑）；
COMPLETED 轮次不再把重试救回来的失败印进 `Failures:`（两处渲染器同规则，
PARTIAL 的行不受影响）。`npm run ci` exit 0 = **68 文件 / 1229 测试 PASS**，
typecheck 0 错、lint 24w/0e；`lib/` 10 文件随 `src/` 重建。**已发版 `0.12.2`**：commit `c1be0c7`（+hygiene `40228c5`）、annotated tag `v0.12.2` 已推，远端 CI `44641153858` success、Release `44641158387` success（asset `dsh-grok-workflow-0.12.2.tgz`）。NOT_RUN：真实定时投递、GUI 手动点击拍照。）


Last updated: 2026-11-20 (**0.12.1 已发版：自迭代默认模板 = 仓库自己的轮次提示词** —
`DEFAULT_ITERATE_TEMPLATE` 从 12 行通用提示词换成 `docs/iterate-template.md` 的轮次提示词
（POOL 优先选题→TODO/失败行/GitHub/论文、每轮至少一项、小修不研究 vs 大改需 RESEARCH 且
池内获批且不编造来源、R1–R6、三重评审含复制档案真机、四道刹车、禁区），`src/client/index.js`
的 bundle 副本同步；`test/iterate-template.spec.ts` 钉住「文档 ↔ 常量」逐字节一致并逐项检查
必需章节，`test/loop-surface.spec.ts` 补自迭代路由 `status` 用例。`npm run ci` exit 0 =
**68 文件 / 1227 测试 PASS**，typecheck 0 错、lint 24w/0e；`verify:lib` = `lib/ at 23d3369 is
the build of src/ at 23d3369`（153 files byte-identical）。真机（复制档案 `loopfix-verify`
`:3451`，实例已停）：真实 bundle 的自迭代开关开→Schedule 行写入 3239 字符、与默认模板逐字节
相同；关→只删自己那行，会话无 Schedule 残留、未误删他人行；二次开关同样干净。证据
`.rsi/evidence/round-025/`（`boot.redacted.txt` 已脱敏，无 token/cookie）。**已发版
`0.12.1`**：commit `23d3369`、annotated tag `v0.12.1` 已推；远端 CI `44595376323` success
（Node 22/24），Release `44595391505` success（asset `dsh-grok-workflow-0.12.1.tgz`）。旧标签
未动、无 force-push。NOT_RUN：真实定时投递、GUI 手动点击拍照。

Last updated: 2026-11-20 (**round-024 收口：三线合一，真机复核过** —
`/grok on` 后台受理（`answerFullBehind`，5 例）+ intake 提示词入口加固（14 例）
+ 双开关/模板（9+97 例）三条并发线合在同一工作树；`npm run ci` exit 0 =
**67 文件 / 1219 测试 PASS**，typecheck 0 错、lint 24w/0e、`verify:lib` 通过。
真机（`loopfix-verify` `:3451`）：loop/iterate 双路由各走各的全 200、taskId 不同；
真实 bundle 双开关生产路径 mount/开/关全通、各建各删各；实例已停、证据无密钥。
**已发版 `0.12.0`**：commit `9839025`、annotated tag `v0.12.0` 已推，远端 CI `44587743089` success、Release `44587748822` success（asset `dsh-grok-workflow-0.12.0.tgz`）。NOT_RUN：真实定时投递、GUI 手动点击拍照。）


Last updated: 2026-11-20 (**settings-toggle-ui 收口：双开关 + 模板 textarea 全链路真机过** —
上一轮落地的自迭代实例/路由之上，本轮补齐了任务的全部验收面：设置页新增「自迭代」分组
（`iterateIntervalMin` 数字 + `iterateTemplate` textarea，`error.badTemplate` 4000 上限校验，
中英字典 +20 键），`iterateTemplate`/`iterateIntervalMin` 进 schema/CONFIG_KEYS（13→15 键），
`src/index.ts` 的 iterate 实例 `defaultPrompt` 读 live 模板、空白回退内置默认；客户端开关
重构为 `makeHeartbeatSwitch` 工厂，`GROK_WORKFLOW_ITERATE` 导出、`startBothSwitches` 双挂载。
生产路径测试走真实 page fetch → 真 `node:http` → 真 `handleLoopRoute` → 真
`createLoopService`（不传任何 send 覆盖，v0.11.21 教训不复现），并新增 textarea
draft→ops→save 持久化用例。真机验证（隔离 profile `loopfix-verify` `:3451`，lib 重建后重启
实例，结束后已停）：两开关独立开/关、互不碰对方的行；模板经**真实设置写路径**
（describe→mutate 带 expectedRevision→重 describe 逐字节读回→cordis.patch.yml 落盘）持久
且刷新后开关仍能刷新活行；循环 close 不带走自迭代行，收尾 schedule 存储无残留行、
patch 里的测试模板已恢复。`npm run ci` exit 0 = **67 文件 / 1218 测试 PASS**、
`verify:lib` 通过；证据 `.rsi/evidence/round-024/`（`ci-settings-run.log`、
`switches-and-template.mjs/.txt`）。**未发版、未提交**：树里另有 intake/`/grok on`
两个并发任务的未提交修复。**NOT_RUN**：真实定时投递（D-066）、浏览器 GUI 手动点击拍照。)

Previous update: 2026-11-20 (**心跳隔离第二轮：自迭代心跳成为插件第二个实例后的真实串线已修** —
`src/index.ts:313` 的第二个 `createLoopService`（`RSI heartbeat`）+ `src/loop-surface.ts:148`
的 `/grok-workflow/iterate` 路由落地后，第一轮「自迭代心跳无插件路由」的记录过期，本轮按当前树
重审并修正文档。真实缺陷：`forgetSession` 走写死的 `isLoopSlot`，**自迭代实例的归档清扫会删掉
循环的行、留下自己的行**（先复现后修；当前接线只挂循环实例，故今天从组合层不可达，
但它是归档清扫的接口、两实例都暴露）；`deleteSessionHeartbeats`（`src/loop.ts:752`）改为接受
调用实例的 `slot` 谓词（默认 `isLoopSlot`，刹车语义不变），`forgetSession` 传 `slotOf`。
新增测试：反方向所有权 5 例、门禁「用户粘贴标记仍 admit」1 例、路由层「两开关两路由」4 例、
页面层路由隔离 1 例。负对照：去掉 `slotOf` 参数 → **1 failed / 14 passed**；iterate 路由绑到
循环服务 → **2 failed / 18 passed**（两文件按 sha256 逐字节还原）。`npm run ci` **exit 0 =
67 文件 / 1219 测试 PASS**（`lib/loop.js:552` 已带新参数，`verify:lib` 通过）。live
`~/.dsh/storages/schedule.json` 只读 = 一条无关任务、两心跳未武装、本会话零写入。
**未验证（`NOT_RUN`）**：真实定时投递（D-066）、真机 GUI 归档后任务列表。**残留**：
F3 `.rsi/STOP` 双停（D-080）、F5 保留名、卸载只清循环行（自迭代行按设计留存）。
改动未提交：`M src/loop.ts`、`M test/heartbeat-identity.spec.ts`、`M test/loop-surface.spec.ts`、
`M test/client.spec.ts`、`M lib/*`、`docs/knowledge/HEARTBEATS.md`（重写）+ 记忆六件；
工作树里 intake/command/answer 与 `test/iterate.spec.ts` 是并发任务的改动。)

Previous update: 2026-11-20 (**心跳身份与路由隔离审计收口** — Loop（`Loop heartbeat` /
`[grok-workflow loop]` / `/grok-workflow/loop` / `grok_loop`）与 Iterate（`RSI heartbeat` /
`# RSI heartbeat — round N`，`.rsi/HEARTBEAT.md`）身份拆成两个谓词（D-079）：
路由身份 `isLoopHeartbeat` 只认标记（`src/gate.ts:532` 门禁唯一入口），存储身份 `isLoopSlot`
只认保留名 + `rrule` + 目标会话；`open()` 三路清重复行、删除被拒改写幸存行，
Iterate 投递走 `non-user-source` 直通、`loop.review/admit/stop` 零调用（刹车 spy 钉死，
`test/heartbeat-identity.spec.ts` 10 例）。负对照：修前 `src/loop.ts` 上同两文件
**7 failed / 38 passed**（跑后 sha256 逐字节还原）；`npm run ci` exit 0 =
**66 文件 / 1195 测试 PASS**；live `schedule.json` 只读核对 = 一条无关任务、零写入。
改动未提交：`M src/loop.ts`、`M src/gate.ts`、`M test/loop*.spec.ts`、
`?? test/heartbeat-identity.spec.ts`、`?? docs/knowledge/HEARTBEATS.md` + 并发任务的
`src/intake.ts`/`src/command.ts`/`src/answer.ts`。**未验证（`NOT_RUN`）**：真实定时投递
（D-066）、真机 GUI 改写提示词观察投递；**残留**：F3 `.rsi/STOP` 双停（D-080）、
F5 保留名 `Loop heartbeat`（见 `HEARTBEATS.md` F5）。）

Last updated: 2026-11-19 (**用户报障修：续跑开关又能点了** — `LoopSwitch` 生产默认把
请求体形的 `loopSend` 当 fetch 用，真机上每次读取都只剩 `HTTP undefined`。
现默认走页面自己的 fetch + 新增生产路径回归用例；`npm run ci` exit 0 =
**63 文件 / 1159 测试 PASS**；复制 profile `loopfix-verify`（link 本树，端口 3451）
真机实测：路由 5×200 + 生产路径脚本 mount/开/关全通、服务端确认 task 落地与关闭、
实例已停、证据无密钥。改动未提交：`M src/client/index.js`、`M test/client.spec.ts`、
`M lib/client.js`、`M CHANGELOG.md`、`M docs/knowledge/VALIDATION.md`、
`?? .rsi/evidence/round-023/`。**已发版 `0.11.21`**：commit `73cbd4b`、annotated tag `v0.11.21` 已推，远端 CI `44543705967` success、Release `44543712011` success（asset `dsh-grok-workflow-0.11.21.tgz`）。用户已授权自动打 tag/push/发版（今后同类发版不再逐次请示）。）

Last updated: 2026-11-19 (**`0.11.17` 已发布并从 GitHub 更新到本机** — 常驻并行监护
（guardian）走 patch 发版：`package.json`/`package-lock.json`/`README×2`/
`docs/LOCAL-TESTING.md` 同步到 `0.11.17`，CHANGELOG `[Unreleased]` Added 搬进
`## [0.11.17]`；commit `5fc3e1d`、annotated tag `v0.11.17` 已推，远端 CI
`44459682983` success、Release 已建（asset `dsh-grok-workflow-0.11.17.tgz`）。
tag 安装验证 PASS（隔离 profile 从 `github:…#v0.11.17` 装：行激活、投影 11 键、
双工具、`loop` 路由开/关全通、`lib/guardian.js` 逐字节一致）。
本机 `web` profile 已从 GitHub 更新到 `#v0.11.17`（`0.11.13` → `0.11.17`，
guardian.js sha256 两侧一致，`--dump-config` 行正常）。
`npm run ci` exit 0 = **63 文件 / 1154 测试 PASS**。
**未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听 firing
（操作体已 CONFIRMED）。
**剩余待办**：P3-01、P3-02 仍 OPEN；`src/index.ts:292` 注释仍 HYPOTHESIS 未动。）

Previous update: 2026-11-19 (**RSI round 17 完成 · `0.11.16` 已发布** — 主题：Q5 心跳识别修 + F1 设置面说法统一。
R6 一次过：commit `63a4fbb`、tag `v0.11.16` 已推、远端 CI `44440179151` success、GitHub Release 已建（Latest，asset `dsh-grok-workflow-0.11.16.tgz`）。
tag 安装验证 PASS：`…#v0.11.16` 装得上、行激活、投影 11 键与文档一致、假会话 open 被 admission 拒绝（行不落地）。
`npm run ci` exit 0 = **62 文件 / 1142 测试 PASS**。
**未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听 firing（操作体已 CONFIRMED）。
**剩余待办**：P3-01、P3-02 仍 OPEN；`src/index.ts:292` 注释仍 HYPOTHESIS 未动。)

Previous update: 2026-11-19 (**RSI 连续循环 round 15 完成 · `0.11.15`** — 主题：收口 `v0.11.14` 的发布事故。
round 14 的标签提交 `20eafea` 的 `lib/` 落后于它的 `src/`（`lib/loop.js` 里没有 `callSchedule`），远端 CI 红、
Release 工作流停在 `Verify committed build artifacts`，所以那个标签**没有 GitHub Release**，也从未产出压缩包；
`main` 上的 `8c8e367` 只重建了产物。本轮按 D-070 从 `main` 打 **`0.11.15`**（patch）：只含构建产物重建 +
文档更正（两份 README 的测试数 1022/57 → 1081/60、新增「`v0.11.14` 不是发布版本、请固定 `v0.11.15`」一句）+
本轮记录，`v0.11.14` 标签原地不动、未 force-push、未发布 npm。`npm run ci` exit 0 =
**60 文件 / 1081 测试 PASS**、lint 22 warnings / 0 errors（`.rsi/evidence/round-015/pre-release-ci.txt`）；
新标签的 Release 由既有工作流创建，commit 与 run id 见 `.rsi/ROUND.md` Round 15 与 `VALIDATION.md` Round 61。
**剩余待办**：P3-01、P3-02 仍 OPEN（D-068 只改了顺序）；「客户端还没有真正会 POST `/grok-workflow/loop` 的
控件」仍是候选主题（D-069「现状」）。)

Previous update: 2026-11-18 (**RSI 连续循环 round 14 完成 · `0.11.14`** — 主题：续跑（repeat-run / loop）
面落地并发版。四个 `loop*` 键从「存着没人读」变成有驱动：一个循环 = Host Schedule 里一条 `rrule`
持久任务（标题 `Loop heartbeat`、文案前缀 `[grok-workflow loop]`、目标=本会话），插件自己不设 timer；
打开只走 `POST /grok-workflow/loop`（用户侧，路由在组合的 Host/Origin + 浏览器认证闸门后），
面向模型的 `grok_loop` 只有 `status`/`close`，`open` 以 `loop/user-only` 拒绝。停的语义：轮数上限写进
规则 `COUNT`（跑满行留 `ended`，下次 open 替换）、连败轮数只是文案提示（回执只证明收件箱写入）、
间隔取 `max(60, ceil(timeoutMs/60000), loopIntervalMin)` 封顶七天、关闭/卸载/停止/归档一律**删行**。
设置页多一组「续跑」（四字段，边界 100/20/10080，默认 false/10/3/0）。**文档**：README 中英各新增
「Repeat runs」一节 + 已知限制一条 + 表格行改为可核对的说法；CHANGELOG `## [0.11.14]` 双语；
DECISIONS **D-068**（操作者授权先落 P4 续跑面、P3-01/P3-02 保持 OPEN）与 **D-069**（续跑面归谁、
谁能开、靠什么停、关闭是什么）。`npm run ci` exit 0：typecheck 0 错、lint 22w/0e、
**60 文件 / 1081 测试 PASS**（发布脚本那次；文档侧先跑的一次是 60/1080，其间多了 1 条路由用例；
上一轮 57/1022，+3 文件/+59 测试，无删除无 skip）；commit `20eafea`、annotated tag `v0.11.14`，
`origin/main` = `20eafea`，旧标签未动。
证据 `.rsi/evidence/round-014/`、`VALIDATION.md` Round 60。
**剩余待办**：P3-01、P3-02（按 D-068 仍是 OPEN，顺序由下一位接手者按 PROTOCOL §2 决定）。

Previous update: 2026-11-18 (**RSI 连续循环 round 11 完成 · `0.11.11`** — 主题 P2-01：客户端 i18n 键
齐全性。bundle 有两本词典（插件 `DICT` 与面板 `PANEL_DICT`），此前没有任何检查把它们与代码实际请求的
键对起来。审计结论是**当前无缺陷**（插件每语言 137 键、面板 19 键，两表语言对称；字面/拼接/动态键全部
在消费它的那张表里可解析），因此本轮交付的是守卫：`test/i18n-parity.spec.ts` 6 条，按作用域断言，
并用一次变异重放证明它确实会红（删掉一个 `zh` 键 → `2 failed | 4 passed`，随即还原）。
`npm run ci` exit 0：typecheck 0 错、lint 22w/0e、**56 文件 / 1015 测试 PASS**；tag `v0.11.11`。
证据 `.rsi/evidence/round-011/`、`VALIDATION.md` Round 59、`D-065`。
**P1/P2 待办已清零**；剩余 P3-01/P3-02 与 POOL 里带 `P ·` 的调用点条目。

Previous update: 2026-11-18 (**RSI 连续循环 round 10 完成 · `0.11.10`** — 主题 P1-02：
`docs/ARCHITECTURE.md` 的版本状态。审计发现 POOL 的字面措辞（「current version」）已不存在，但同类
缺陷仍在：四处 `in this release` 无法落到版本，「resume 边界」只写了 DSH `0.2.1-rc.2` 而 round 8 已在
`0.2.2-rc.3` 上复查过。现改为 `since **0.8.0**` / `as of **0.11.9**`，并把「实测版本」与「只做复查的
版本」分开写、明写没有重测那条 journaling 边界。新增 `test/docs-architecture-version.spec.ts`（3 条）
钉住结构。`npm run ci` exit 0：typecheck 0 错、lint 22w/0e、**55 文件 / 1009 测试 PASS**；
tag `v0.11.10`。证据 `.rsi/evidence/round-010/`、`VALIDATION.md` Round 58、`D-064`。
**剩余待办**：P2-01（设置页 i18n 键齐全性守卫）、P3-01/P3-02、POOL 里的 P 级条目。

Previous update: 2026-11-18 (**RSI 连续循环 round 9 完成 · `0.11.9`** — 主题 P0-02：Progress 页
`执行`/`检查` 恒显示「事件中没有报告」。根因：脚本把 worker/verifier 的 `phase` 写成计划任务组
标题（`任务 n · 标题`），而面板只按 `phase` 匹配阶段，于是每次运行都必然发生的两个阶段永远空着。
修法：phase 命中不了阶段时再按**角色 label**（`执行`/`检查`、`Execute`/`Check`）判归属，并交叉
引用到阶段新增的 `evidence` 列表；`members` 仍是每行唯一的家（轨道与百分比统计同一批行），状态
自有行优先。role token 只匹配 label，标题含 `check` 的任务不会变成「检查」。两语言 meta 行改为
「N 行在下方任务节点中执行」/「N rows ran inside the plan tasks below」。`npm run ci` exit 0：
typecheck 0 错、lint 22w/0e、**54 文件 / 1006 测试 PASS**（上轮 54/999）；tag `v0.11.9`。
证据 `.rsi/evidence/round-009/`、`VALIDATION.md` Round 57、`D-063`。
**本轮起 STOP 判定强制留痕**：`.rsi/tools/stop-probe.sh` → `.rsi/evidence/stop-probes.txt`
+ `.rsi/LOG.md` 的 STOP 小节。**剩余待办**：P1-02、P2-01、P3-01/P3-02 与 POOL 里的 P 级条目。

Previous update: 2026-11-18 (**RSI 连续循环 round 8 完成 · `0.11.8`** — 主题：真机 disposition。
在 DSH `0.2.2-rc.3` 上用仓库内 `DSH_HOME`（沙箱下 `dsh` 写不了 `~/.dsh`，实测 EROFS）把本检出
`dsh plugin add` 进 `grok-workflow-dev`，`workflow-ptc` 改回启用后在 `127.0.0.1:3199` 起真实实例：
启动只有一行 URL（无 `pending`、无 `did not activate`），`POST /api/settings/describe` 投出 23 个
命名空间且 `grok-workflow` `autoGenerate: true`。**真模型消息 BLOCKED**：
`MISSING_CREDENTIAL … "deepseek-official"`，未把未跑过的运行标成 pass。顺手记下两处坑（`web` 模板
profile 无 `headless` 命令；`--from-default-profile web` 会启动并可能 EADDRINUSE）。`npm run ci`
exit 0：typecheck 0 错、lint 22w/0e、**54 文件 / 999 测试 PASS**；tag `v0.11.8`。
证据 `.rsi/evidence/round-008/`、`VALIDATION.md` Round 56、`D-062`。

Previous update: 2026-11-18 (**RSI 连续循环 round 7 完成 · `0.11.7`** — 主题：远端标签清单对账。
`git ls-remote --tags` 全量 32 个标签逐条对 README 中英列表与各标签所在提交的 `package.json`：
32/32 本地与远端对象相同（没有被移动过的标签）、每个 peeled 提交都是 `main` 祖先、两份列表
升序无重复无缺失且末项 = 当前发布、`HEAD == origin/main`。31 个标签版本一致；唯一例外
`v0.2.0-rc.1` 早于发布流程（所在提交 `package.json` 仍为 `0.1.0`），已发布标签不移动，改为在两份
README 写明并加 1 个守卫 `it`。`npm run ci` exit 0：typecheck 0 错、lint 22w/0e、
**54 文件 / 999 测试 PASS**；tag `v0.11.7`。证据 `.rsi/evidence/round-007/`、
`VALIDATION.md` Round 55、`D-061`。

Previous update: 2026-11-18 (**RSI 连续循环 round 6 完成 · `0.11.6`** — 主题 P1-03：
`docs/LOCAL-TESTING.md` 与 `src/config.ts` 对账。九个键、`maxRetries=1`、`maxActiveRuns=2` /
每进程 `8`、`timeoutMs` 默认 `3600000` 全部与代码一致；三处不符已修——四处安装示例指向
`0.2.0`/`0.2.1` 压缩包（发布线 0.11.x）、排障条目把「被修复的 `synthesis: deterministic`」写成
载入期拒绝、中文 README 的固化上限换了写法。`bump-version.py` 现在同步改写压缩包名；
`test/docs-config-keys.spec.ts` 7 → 12 个 `it`；`npm run ci` exit 0：typecheck 0 错、
lint 22w/0e、**54 文件 / 998 测试 PASS**（上一轮 54/993）；tag `v0.11.6`。
细节见 `.rsi/ROUND.md` round 6、`VALIDATION.md` Round 54、`D-060`。
**已知缺口（未修）**：Progress 页 Execute/Verify 段 `Not reported in the events`（P0-02）。

Previous update: 2026-11-18 (**RSI 连续循环 round 5 完成 · `0.11.5`** — 主题 P2-02：
`src/redact.ts` 的形状缺口与两处误伤。改前八条探针里五条是漏或损坏（引号内 `Cookie:`、
`X-Amz-Signature`/`X-Goog-Signature`/`?auth=`、PGP armor、`SECRET_KEY`/`PRIVATE_TOKEN`、
`const token = await refreshToken()` 被改写、`db_pass=hunter2;user=app` 丢尾部、占位符被二次脱敏）。
修复 = 引号感知的 cookie 规则 + 签名链接查询参数 + PGP 规则 + env 值 token 边界/比较符/关键字守卫 +
占位符守卫 + `isSensitiveKey` 连字符归一化。`npm run ci` exit 0：typecheck 0 错、lint 22w/0e（基线）、
**54 文件 / 993 测试 PASS**（基线 54/985）；tag `v0.11.5`。细节见 `.rsi/ROUND.md` round 5、
`docs/knowledge/VALIDATION.md` Round 53、`D-059`。**已知缺口（未修）**：仍无形状清单能穷尽；
base64 包裹的 PEM 无规则；Progress 页 Execute/Verify 段 `Not reported in the events`（P0-02，未修）。

Previous update: 2026-11-17 (**v0.10.0 发布准备完成 + 真机验收通过** —
基线 `main` = `ae0c6d3`（v0.9.4 已发布），工作提交在前一条 `3d9275a` 之上。
本轮 = 真机验收（**新 profile `acgtest95` / 新端口 `:3231`**，打包安装 `0.9.4` tgz、
md5 与仓库一致，Plugins 页出现 Grok workflow、8 键设置页、两次真实工作流运行：
7 段进度脊 + 首答 7s + 后台收尾 1/1 verified）→ `npm run ci` 全绿（typecheck 0 错、
lint 4w/0e、**51 文件 / 951 测试 PASS**、`lib/` 构建幂等且 `lib/client.js` 与
`src/client/index.js` 逐字节相同）→ 版本 `0.9.4` → **`0.10.0`**（`package.json` +
`package-lock.json` 联动）→ `CHANGELOG` 插入 `## [0.10.0] - 2026-11-17` →
README 中英配置参考按 8 键重写、`docs/LOCAL-TESTING.md` 同步 → push / tag / Release。
**已知缺口（未修）**：Progress 页 `Execute`/`Verify` 段报
`Not reported in the events`（成员事实没进该会话进度流），台账证明任务确实执行并核验
（见 VALIDATION Round 47）。

Previous update: 2026-11-17 (**设置页瘦身 + supervisor 第五角色，未提交** —
基线 `main` = `ae0c6d3`（v0.9.4）。工作树 50+ 文件；`npm run typecheck` 0 错、
`npx vitest run` **51 文件 / 951 测试全 PASS**、`npm run build` 成功且
`cmp src/client/index.js lib/client.js` 一致（191404 B）。
内容 = T1/T2/T3/T6 supervisor 贯通（五角色、预算 600、上限 100/默认 10）+
T4 删 24 键（CONFIG_KEYS 8 键、REMOVED 24 键、FIXED 写死、门控恒开、in-turn 恒定、
humanSummary 恒 true、markdown 直出）+ T5 设置页重写（4 标量 + 5 角色链、
无 hint/Danger/只读区、client 72 例绿）。CHANGELOG `[Unreleased]` 有 Added +
Changed 双语条目。**未提交 / 未 push / 未打 tag / 未发版**，等用户验收真机后再定。
`settings-simple-mock.html`（用户定稿 mock）未跟踪，不入库。

Previous update: 2026-11-15 (**v0.9.2 已发布** — `tag v0.9.2` → `5eb4942`，`origin/main` = `98f26a8`，
GitHub Release 已建（`dsh-grok-workflow-0.9.2.tgz` 464,763 B）。CI `43698707930`（Node 22+24）绿、
Release `43698836519` 绿；旧 tag 复核未动。发文细节与边界见文末
「2026-11-15 — v0.9.2 已发布：push / CI / tag / Release / Issue #1 闭环」。)

Previous update: 2026-11-15 (**v0.9.2 已本地提交 — 未 push / 未打 tag / 未发 GitHub Release**；
基线 `main` = `4b92278`。本轮内容 = B01/B02/B04 + 进度 Tab 脊椎/详情/连线 + 人话报告默认化
（agent-27）+ 两条基线既有 `test/gate.spec.ts` 失败的同步修复（只动测试等待条件）。工作树 30+ 文件；
`package.json` + `package-lock.json` = **`0.9.2`**；`CHANGELOG.md` 有 `## [0.9.2] - 2026-11-15`（中英
双语，含 `### Tests / 测试`）。本机 `npm run ci`：typecheck 0 错、oxlint **5 warning / 0 error**
（4 条既有 + `src/delivery/index.ts:264` 1 条新）、build client bundle **204585 B**、vitest
**51 文件 / 948 测试全 PASS**；build 幂等（`lib/` 67 产物 sha256 前后全等）+ `cmp lib/client.js
src/client/index.js` 一致。**push 与 tag 依 lead 2026-11-15 (B) 指令 HOLD**：等「human-only 默认
形态」真机复拍（`NOT_RUN`，需补图清单见 VALIDATION Round 40）；layerfs 借鉴结论为**只读评估、
本轮零用户可见落地**（D-049），故 CHANGELOG 不写 layerfs 条目。详见文末
「2026-11-15 — v0.9.2 收尾发版（本地已提交，push/tag HOLD）」。)

Previous update: 2026-11-15 (**v0.9.2 准备中 — 未提交 / 未 bump / 未发布**; 基线 `main` = `4b92278`。
工作树 19 文件（`src/` 4、`test/` 3、`lib/` 12）+ 未跟踪 `test/progress-connector.spec.ts` 与 Round2
真机证据；内容 = B01/B02/B04 + 进度 Tab 脊椎/详情/连线；人话报告默认化由 agent-27 进行中，
`src/answer.ts`/`report.ts`/delivery/`gate` 调用点不在收尾组写面。`package.json` 仍 `0.9.1`，
`CHANGELOG.md` 未动（发版 HOLD，用户 2026-11-15 指令）。`npm run ci`：50 文件 / 934 测试，
**932 PASS / 2 FAIL**，两条失败在 `test/gate.spec.ts` 且基线 `4b92278` 独立 worktree 同样失败（预存）。
详见文末「2026-11-15 — v0.9.2 准备中」。)

Previous update: 2026-11-15 (**v0.9.1 released** — tag `v0.9.1` → `9103280` on `main`; Release
green, asset `dsh-grok-workflow-0.9.1.tgz`; CI `43665777667` + Release `43666035740` success.
Fixes the user-reported WebUI enable failure: pre-v0.9.0 patch `maxConcurrency: 8 /
maxRetries: 5` now clamps to `6 / 3` with bilingual warnings instead of failing the row.
`package.json`+`package-lock.json` = `0.9.0`; `CHANGELOG.md` carries bilingual `## [0.9.1] - 2026-11-15`.
Evidence: `test/config-limits-repair.spec.ts` (17); isolated profile `gwverify851` with the 8/5
patch activates; control `0` still refuses with user-identical frames.)

Earlier update: 2026-11-15 (**wave1+wave2 已落盘、未提交** — 基线 `ee5e013`，工作树 dirty；
`package.json` = `0.9.0`（V 组 bump，未提交）；本轮 = B01-B18 清点 + 进度 Tab + 真机验证 H1/H2。
版本号与提交由 V 组做，M 组只写记忆与 CHANGELOG 的 `[Unreleased]`。详见文末
「2026-11-15 — wave1+wave2 收尾」。下降级保留的上一条 11-08 记录仍有效，未被覆盖。)

Previous update: 2026-11-08 (**v0.7.0 released** — tag `v0.7.0` → `146dce7` on `main`; Release
`42474831253` green, asset `dsh-grok-workflow-0.7.0.tgz` 317,470 B. Round 37: merged `origin/main`
(PR #44) resolving the `src/run.ts` startup conflict by keeping main's deadline race **and** routing
both entry points through `teamWorkflowEngine`; 37 files / 660 tests PASS; `[Unreleased]` promoted to
`## [0.7.0] - 2026-11-08`; `package.json`+`package-lock.json` = `0.7.0`. Content of the release:
Round 36's B plan — `full` mode now opens with `【人话结论】` (completed/partial only), `showDiagnostics`
(default off) gates Model routes/Deadline/Route switches/overflows/Errors, `Uncertainties` stays
visible; and Round 35's fix — a saved role/model setting now actually reaches the run. Live `:3090`
still needs a restart to load any of it — user-reserved, `NOT_RUN`)

## Prompt intake harden — 2026-11-19（agent-5，未提交）

- **CONFIRMED**：用户贴进新会话的「自我迭代 /grok 团队任务」提示词**不是**因长度卡住。实测
  2 041 字符 / 3 697 字节（`session-042dfe19` seq 4）与 2 032 / 3 688 两次
  （`session-b7be2bd2` seq 2944/2953），占 32 000 目标预算 6.4%，无截断；三条都结算成
  `Usage: /grok [on|off]`，且无 `user/message` / `agent/pre-step` / run。
- **根因（CONFIRMED，源码级）**：`dsh-commands` `parseCommand` 把消息第一行当命令、其余作
  `rawInput`；存档提示词第一行就是 `/grok 团队任务：…`，于是正文成了参数，旧语法只回一行用法
  就返回 → 用户侧等于静默。
- **改动**：`src/intake.ts`（新，入口上限与双语拒绝的唯一生成处）、`src/command.ts`（非开关参数
  按形态分档，开关语义未动）、`src/gate.ts`（`refusalOf` + 迟到目标走 intake）、
  `docs/task-prompt-template.md`（新，默认模板 + 规则）、`test/intake.spec.ts`（新，14 条）、
  `test/command.spec.ts` +3、`test/objective-limit.spec.ts` +1。
- **验证**：`npm run ci` exit 0 = **66 文件 / 1195 测试 PASS**；红证据 8 failed（
  `docs/knowledge/evidence/prompt-intake-2026-11-19/red-full.log`）。
- **NOT_RUN**：真机 GUI 粘贴同一条提示词（并发写入者在同一工作树）；commit/push。

## Repository

- Local path: `/home/fish/projects_mine/dsh-grok-workflow`
- Branch: `main`
- Git history: initial commit `beb55c6`; planner/recursion update `7b78db9`; remote evidence updates follow on `main`
- Remote: `origin` = https://github.com/free6589/dsh-grok-workflow.git (main pushed)
- Target GitHub repository: `https://github.com/free6589/dsh-grok-workflow`
- Target repository: **CONFIRMED public and reachable** after creation on 2026-10-25; it was confirmed absent immediately before creation.
- GitHub CLI: **CONFIRMED authenticated** as `free6589` with `repo` scope.

## Reference environments

- DSH checkout: `/home/fish/projects_mine/deepseek-harness` at `687f282e8625c6b8d11ff58211a90524be2e4317` (release `0.2.1-rc.2`).
- Installed DSH: `/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh` version `0.2.1-rc.2`.
- Grok Build checkout: `/home/fish/dsh-tasks/grok-build` at `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`.

## Current phase

Last updated 2026-11-07 v0.6.0 released（`origin/main` = `1f9065d`，PR #43；tag `v0.6.0` 同 sha；见 VALIDATION Round 26 隔离验证）。

`0.6.0` **released**. Base of this state: **`origin/main` = `1f9065d`** (Merge PR #43,
release `0.6.0`; tag `v0.6.0` points at the same sha).

`v0.6.0` **is released** (tag `v0.6.0` → `1f9065d`, `git ls-remote --tags origin` CONFIRMED;
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.6.0`
published **2026-11-07T10:09:17Z**, asset `dsh-grok-workflow-0.6.0.tgz` **299,146 B**,
Release workflow run `42362674837` green). `package.json` + `package-lock.json` both
read `0.6.0`; `CHANGELOG.md` carries bilingual `## [0.6.0] - 2026-11-07` (B-group empty-cap
heads-up + single-run scope + C1 cross-run hint; C2 ruled out per A16). Minor rationale:
C1 is backward-compatible (hint only reorders untried routes; solitary runs byte-identical),
so minor per RELEASING.md.

`v0.5.1` **is released** (tag `v0.5.1` → `5cc66be`, `git ls-remote --tags origin` CONFIRMED;
far-end sha matches `origin/main`; GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.5.1`
published **2026-11-07T02:08:32Z**, asset `dsh-grok-workflow-0.5.1.tgz` **294,363 B**).
`v0.5.0` **is released** (tag `v0.5.0` → `af82a34`). `package.json` + `package-lock.json` both
read `0.5.1`; `CHANGELOG.md` carries bilingual `## [0.5.1] - 2026-11-07` (PR #41 / `45d721a`:
quick-worker receives bounded conversation/carry-over context).

Authoritative numbers for this state (measured, not planned):

- `npm run ci` on `release/0.6.0` HEAD `ca040e4` (release-prep commit): **PASS** —
  typecheck 0 errors, lint **4 warnings / 0 errors** (3 pre-existing + 1 new unused `RoleName` import in `src/run.ts:29`, not fixed in this release), vitest
  **35 files / 624 tests PASS**; `git diff --exit-code -- lib/` = exit 0; build client bundle 84123 B; `npm pack --dry-run` 64 files / 299.1 kB. CI on PR #43 (run `42362505851`) Node 22 + 24 both pass.
- Round 26 (2026-11-07) is the **v0.6.0 isolated verification** (`CONFIRMED`): fresh profile `v060r`, models `wb/cn:deepseek-v4-pro` + `agnes-3.0-flash` (v4.1-flash was in per-model cooldown that day, stated not hidden); one gated team round with 2 tasks + 2-route worker chain (cap 1 each) → `Grok workflow: COMPLETED`, 2 verified, report carries `Route overflows (full lane yielded, not failures):` with `skipped full …` and both worker routes in `Model routes:`. Cross-run `(cross-run hint)` kind stays unit-covered (`test/route-concurrency.spec.ts`), no second concurrent live run staged. Evidence: `docs/knowledge/evidence/v060-route-cap/` (README + report-full + session-events 52 events).
- `v0.5.1` live check (Round 23, `CONFIRMED`): isolated profile `v051f`, model
  `wb/cn:deepseek-v4.1-flash`; session A follow-up answered `391` from the bounded context
  block without restatement; session B team round PASS then resume BLOCKED by the
  orphan-receipt defect (F3, same orphan class as Round 24). Evidence:
  `docs/knowledge/evidence/v051-fast-context/` (13 files).
- Round 24 (2026-11-07) is a **read-only diagnosis, no code change** (`CONFIRMED`):
  instant receipt written outside any step breaks `tokenMeter.measure()` from seq 2339 on,
  so auto-compaction never fires again after turn 4 while the GUI percentage keeps climbing
  92–95%. Full report `docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md` +
  replay script `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`;
  `/compact` live test `NOT_RUN` (would mutate the session); Web GUI API fetch `BLOCKED`
  (endpoint 401, no credential read per policy). Fix left to user decision.
- Operator `web` profile on `:3090` runs released `dsh-grok-workflow@0.6.0` (read-only check
  2026-11-08: installed 2026-11-07 21:54, `lib/team-engine.js` absent → **without** the
  fix_child_names build; corrects the earlier `0.2.7` note). Any deployment of the fix build
  plus profile reload awaits explicit user approval (D-013), not done.
  Round 33 (2026-11-08) sharpens this: the fix build is absent from the whole live home
  (`find /home/fish/dsh-layerfs -name team-engine.js` → 0), the live GUI is 401-guarded on
  loopback too (no loopback bypass), and the durable panel data of the current orchestrator
  run shows generic `任务团队 child 15–28` labels for all 14 newest children — including
  attempt 5's own executor child (28). Round 34 (attempt 6/6 final, 2026-11-08) re-extracted
  the 8 newest children: labels `任务团队 child 25–32`, zero descriptive; attempt 6's own
  children (identified via the task marker in their logs) are among them. `origin/main` has
  since advanced to `3b1d9a8` (Merge PR #44, a different task's P1 fix) and still does not
  contain `ad66118`, so `pnpm update` on the live profile still will not fetch the fix.

Prior releases (unchanged): `v0.4.0` → `708c315` (PR #38, Round 20: 32 files / 545 tests);
`v0.3.0` → `3f5ad0a`; `v0.2.7` → `16a11b7`. `0.4.0`-era detail below is history, not the
current baseline.

History (unchanged detail, kept for reference): `v0.4.0` was released (tag `v0.4.0` on `708c315`, Release workflow run
[42075318386](https://github.com/free6589/dsh-grok-workflow/actions/runs/42075318386) green,
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.4.0`, asset
`dsh-grok-workflow-0.4.0.tgz` 250,693 B, sha256 `e10802ca…`). At that time `package.json` read `0.4.0` and `CHANGELOG.md` carried
`## [0.4.0] - 2026-11-06` (Round 20). Prior: `v0.3.0` **is released** (tag `v0.3.0` on `3f5ad0a`, Release green
[41665410667](https://github.com/free6589/dsh-grok-workflow/actions/runs/41665410667), asset
`dsh-grok-workflow-0.3.0.tgz` 246,493 B). Earlier: `v0.2.7` **is released** (tag `v0.2.7` on `16a11b7`,
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.7`, asset
`dsh-grok-workflow-0.2.7.tgz`), after `v0.2.6` (`f6ec5f1`), `v0.2.5` (`bf853ac`),
`v0.2.4` (`7357e5e`), `v0.2.3` (`538d1ab`). Operator `web` profile on
`/home/fish/dsh-layerfs` runs `dsh-grok-workflow@0.2.7` (upgraded 2026-11-03
from `0.2.6` via tag-pinned `add`; `CONFIRMED` in `plugin list`/`why`).

Merged into `main` since `v0.2.3` (each `CONFIRMED` in `git log`):

| PR | Merge commit | What it landed |
| --- | --- | --- |
| #25 | `54083ea` | the 32,000-character objective limit |
| #24 | `334daf6` | task-grouped progress panel (per-task groups, locale-following copy) |
| #23 | `2e9c26a` | Phase 1 dialogue reliability (P0) |
| #26 | `a000983` | segmented planner-failure fallback (`src/shards.ts`); review close-out is Round 13 |
| #27 | `6806426` | `/grok` session switch (mode/command/gate, D-028/D-029) |
| #28 | `7357e5e` | release `0.2.4` (prepare: opt-in `/grok` switch, Phase 1, sharded fallback, task panel, 32000 limit, GUI notes; Round 15 memory) |
| #29 | `bf853ac` | novice settings page + relaxed limits (v6: `grokDefault` off, 50-route chains, single-locale UI) |
| #30 | `e6d434d` | settings visual polish R1–R3 (hierarchy, rhythm, details; live screenshots) |
| P0-5 | `d8cc6cc` | first user message published before the run (no longer hidden) |
| #32 | `1b5ad75` | per-route concurrency cap (`maxInFlight`) + overflow to next route (D-030) |
| #33 | `16a11b7` | release `0.2.7` (per-route concurrency + first-message fix) |
| #35 | `af0394a` | synthesis/synthesizer mismatch warns + repairs instead of deactivating (D-031; closes #34) |
| #36 | `3f5ad0a` | release `0.3.0` (bump + bilingual changelog + `RELEASE-NOTES-0.3.0.md`; Round 19) |
| #37 | `9438b3d` | history-aware follow-up + hybrid classifier + instant receipt/summary (D-032/D-033/D-034; Round 20) |
| #38 | `708c315` | release `0.4.0` (bump + bilingual changelog + `RELEASE-NOTES-0.4.0.md`; Round 20) |

So the `0.2.4` cut carries the `/grok` switch, the task-grouped progress panel, the
32,000-character objective limit and the segmented fallback — all four are on `main` and tagged.

Authoritative numbers for this state (measured, not planned):

- `npm test` on the `0.4.0` release commit `472d043` (identical tree to the merge `708c315`):
  **32 files / 545 tests PASS**, exit 0 (Round 20); the Release workflow re-ran the same suite on
  `v0.4.0` and passed (run `42075318386`, step `Test` success). `npm run ci` on `472d043` = PASS
  (typecheck clean, lint 3 warnings / 0 errors pre-existing baseline, build clean, `lib/` in sync).
- `npm run ci` — last full run before this release was `npm run ci` on `472d043` (Round 20):
  32 files / 545 tests PASS, exit 0; quoted `main` number is the CI-script figure, not `npm test` alone.
- `lib/` reproducible: `npm run build && git diff --exit-code -- lib/` = exit 0 on `472d043`
  (Round 20, client bundle 81,835 B).
- Real-instance evidence, newest first: `VALIDATION.md` Round 16 (v0.2.4 install matrix on
  `7357e5e`: 8 PASS + 2 NOT_RUN, item 7 anomaly on record, item 8 partial), Round 15 (real Web
  GUI on `6806426`: `/grok` switch + settings card, isolated instance), Round 14 (real-model E2E,
  two bugs + fixes), Round 13 (PR #26 close-out); `docs/knowledge/evidence/t42`…`t49` cover the
  0.2.2 era. `src`/`lib`/`test` are identical between `6806426` and `7357e5e` (`git diff --stat
  6806426 7357e5e -- src lib test` is empty), so Round 15's GUI result carries over to `v0.2.4`.
- **Quality claims are bounded by measurement**: Round 8's 1 `COMPLETED` in 12 reports was the
  verifier-decision defect (fixed in 0.2.2), and Round 15's GUI round plus Round 16's matrix ran
  `glm-5.3-flash`, not `deepseek-v4.1-flash`. None of these results may be generalised into "the
  workflow accepts what it did not accept", nor into a per-model quality claim.

## Where the open questions live

- `docs/knowledge/VALIDATION.md` — Rounds 1–20. Round 6 row (g) is annotated: stability 5/5,
  accepted results 0/5, root cause fixed in 0.2.2. Round 7 closed the notice/route/deadline
  questions; Round 8 answers the quality question and records the operational caveat that the
  Plugins-page switch — not `cordis.patch.yml` — is what says whether the gate is armed. Round 13
  closed the PR #26 review, Round 14 the real-model E2E, and **Round 15 the two GUI checks that had
  been `NOT_RUN` since Round 14** (`/grok` switchable in the real GUI, settings card rendering and
  saving). Round 17 is the P0-5 first-message root cause, Round 18 the synthesis-mismatch fix,
  Round 19 records the PR #35 merge plus the `0.3.0` release checks and workflow run, and
  Round 20 records the PR #37 feature (`follow-up`/`hybrid`/receipt/summary) plus the `0.4.0`
  release checks, workflow run and isolated-profile live verification.
- `docs/knowledge/DECISIONS.md` — D-016…D-019 (per-session caps, 60-minute default, plugin-owned
  deadline, notice downgrade). D-020 covers the verifier-decision rule.
- Deferred to 0.2.3: rendering a plugin-authored chat row (needs a DSH-side API), see D-019.

## What `0.2.0` changed (short form)

| Area | State |
|---|---|
| Mandatory entry (gate on `agent/pre-step`) | implemented and the default (`enforceGate: true`); one-shot delivery measured (E-38/E-41); **long-lived GUI half measured in Round 15 for `in-turn`** (real Web GUI, gate claims the message, report rendered in the same turn) — `relay`/`append` in a long-lived GUI remain NOT_RUN (NR-1) |
| Per-role model routing + ordered chains | implemented (L1 in the generated script, U-2); real-provider switching NOT_RUN (NR-6) |
| Failure taxonomy (class + category) | implemented, rendered in the answer; real provider texts NOT_RUN (NR-5) |
| Settings surface (live values, validation) | implemented; the generated page is identified by the runtime; **a live GUI edit is measured — t32 for the 21-key page, and Round 15 re-measured it on `6806426`** (card renders, `grokDefault` `off`→`on`, revision 0→1, survives reload, applies to a new session) — NR-7/NR-8 |
| Write-path isolation (U-4) | implemented (`src/paths.ts` + `mapLimitIsolated`); planner fill-rate NOT_RUN (NR-9) |
| Reliability and safety set | implemented (cancellation, deadline, concurrency, duplicates, recursion, context bounds, redaction, partial, unload/reload) |

## Completed

- External bundle (`src/`, `cordis.patch.yml`, `package.json`), `lib/` output,
  composed by a real DSH Loader.
- Bounded plan → parallel execute → independent verify → bounded retry →
  synthesis, with report validation, cancellation/deadline handling, active-run
  caps, credential redaction and a routing/delivery ledger.
- The gate: `agent/pre-step` interception, `in-turn`/`relay`/`append` delivery,
  per-message de-duplication, queue bounds, explicit refusal, live configuration.
- Configuration surface: 26 keys (+`showProgress` since t44, +`maxActiveRunsTotal` since t45,
  +`mode`, `triageAsk`, `triageModel` since t52),
  unknown-key rejection, `configVersion` gate,
  route shorthand migration, chain validation against the live runtime.
- Documentation set kept in step with the code: DESIGN (DD-1..DD-9b, A/E/R/NR
  ledgers), ROADMAP (phases, U ledger, D-009 decisions), ARCHITECTURE, ACCEPTANCE,
  LOCAL-TESTING, RELEASING, VALIDATION, this STATE, HANDOFF, DECISIONS.
- `0.1.0` was published (tag `v0.1.0` → `a7d5a62`, Release run `40182751006`).

## Remaining / optional

- A clean-DSH-profile install check in CI (currently a local scripted smoke).
- **NR-1, NR-7 and NR-8 are no longer open GUI questions** — Round 15 measured all three on a real
  Web GUI against `6806426` (isolated instance `127.0.0.1:3199`, real Chromium), and Round 16's
  install matrix (against `7357e5e`, identical `src`/`lib`/`test`) leaves the GUI halves exactly
  where Round 15 put them: items 9–10 are `NOT_RUN` in the matrix **because** Round 15 already
  covered settings-page render and web-chat behaviour on the same code. What remains, and
  what must be stated with the result: the browser was **offscreen (headless) Chromium** because the
  host has no X11 display, and the model was **`wb/cn:glm-5.3-flash`** because the suggested
  `wb/cn:deepseek-v4.1-flash` answered `400 model_unavailable` (per-model cooldown) that day. So the
  GUI halves are verified for `in-turn` delivery and for the plugin settings card; **`relay` /
  `append` delivery in a long-lived GUI session is still NOT_RUN** (NR-1's remaining half), and no per-model quality claim
  follows from either round. Round 16's own boundaries: item 7's one direct-answer anomaly is on
  record (Rerun + run4 + run5 = 3 consecutive EXIT 0 + reports after it); item 8's web-profile
  check stopped at HTTP `401 unauthorized` on `settings`/`describe` (composition + boot
  `CONFIRMED`, API namespace not confirmed).
- L2 host-level routing (registering `agent/request-error` consumers) stays out
  of scope for `0.2.0` by decision U-2.
- Client-side chain editor (settings UI with model dropdowns) is Phase 9 / U-6.

## Blockers

None.

## Next priority

**`0.6.0` is released; nothing is blocked on review.** PR #43 was merged (`1f9065d`) and the
release went out as tag `v0.6.0` + GitHub Release (Round 26 isolated verification PASS).
The one open action is outside this repo: the live DSH service on `:3090` runs released
`dsh-grok-workflow@0.6.0` (2026-11-08 read-only check), which predates the fix_child_names build
(`ad66118` on `release/0.6.0`, unpublished); deploying that build awaits explicit user
approval (D-013); it is not done. Round 33 adds two deploy notes: the repo default branch is
`main` @ `1f9065d`, which lacks `ad66118`, so `pnpm update` of the live profile's
`github:` dependency will NOT fetch the fix — install the `ad66118` build explicitly
(HANDOFF); until then the live top panel keeps rendering generic `任务团队 child N` labels
for every new orchestrator run (durable descriptor data, Round 33).

B组+C1 已合入工作树、未发布（2026-11-07，route-cap-closer 收尾）：设置页 `warn.emptyCap`
黄字提醒不拦 Save + `validateRoutes` notes + 单 run 作用域（ARCHITECTURE），C1 `busyRoutes`
run 级估计重排未试顺序 + `skippedBusy '(cross-run hint)'` 标记 + 报告分开渲染，C2 按 A16 不做；
`npm run ci` 35 文件 / 624 测试 PASS（Round 25）；随本轮 commit 进 `origin release/0.5.1`，
未 bump 版本、未打 tag、未发布 npm、未重启 live。D-038 / VALIDATION.md Round 25 为准。

Older candidates — none decided, all `HYPOTHESIS` until the captain picks:
`relay`/`append` delivery in a long-lived GUI session (NR-1's remaining half), item 8's
API-side auth/namespace confirmation, a quality matrix (not a 1-run claim), and the
client-side chain editor (Phase 9 / U-6).

Any future live matrix must follow [docs/knowledge/TESTING.md](TESTING.md) (isolated workspace, one
turn at a time; Round 16's isolation proof is in `.workflow-artifacts/matrix-024/EVIDENCE.md`).
`v0.2.0` was released on 2026-10-26, `v0.2.1` on 2026-10-27, `v0.2.2` and `v0.2.3` on 2026-10-28.

## Homepage redesign — merged

- **Status:** PR #16 merged to `main` as `ea3e8e31`; GitHub Actions runs `40178081351`, `40178539805`, and `40178848058` PASS on Node 22 and Node 24.
- **Scope:** English quick-start landing page, complete Simplified Chinese README, matching SVG workflow illustrations, and `README.zh-CN.md` in package files.
- **Local follow-up:** Restored the compact reference sections required for configuration, disable/uninstall, testing, security, and exact compatibility, in both languages. Corrected the install order so a missing headless profile is created before `plugin add`; running `--from-default-profile` afterward would remove the installed plugin. Added local SVG XML and pack checks.
- **Validation:** SVG XML parsing PASS for both diagrams; current `npm pack --dry-run` lists 33 files and both READMEs. Detailed DSH runtime behavior is unchanged and covered by the existing 56-test suite.
- **Next action:** Keep `README.md` and `README.zh-CN.md` synchronized for future changes; do not remove the reference sections when editing the landing page.


## Release/versioning rollout — merged and released

- **Status:** PR #18 merged as `7904e23`; `v0.1.0` tag points to `a7d5a62`; GitHub Release published on 2026-10-25.
- **Release workflow:** first run `40182588171` failed on a JavaScript regex escaping bug in the changelog extractor; fixed in `a7d5a62`. The tag was recreated at the fixed commit before any Release existed. Run `40182751006` passed and created the Release.
- **Artifact:** `dsh-grok-workflow-0.1.0.tgz` (61,281 bytes) attached to the GitHub Release; URL `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.1.0`. Tag-pinned install from `#v0.1.0` was smoke-tested in an isolated profile; config row present, real model call NOT_RUN.
- **Validation:** main CI `40182707932` PASS on Node 22/24; release workflow `40182751006` PASS on Node 22 only, including typecheck, lint, build, committed `lib/`, tests, package checks, and release creation.
- **Backup boundary:** Git history/Releases are version recovery, not independent disaster-recovery backup. Repository mirror and local DSH data backups remain a separate operational task.
- **Next action:** follow `docs/RELEASING.md` for future versions; do not move the published `v0.1.0` tag.

## Mandatory workflow, model routing, fallback — implemented

- **Status:** implemented and merged (phases 1–6); the design discussion below is
  history, not a plan.
- **Requirement:** every user message, including greetings and trivial
  questions, goes through the full workflow; the gate never silently falls back
  to ordinary direct answering (`enforceGate: true`, `gateRequired` for
  deployments that must fail instead of warn).
- **Capabilities delivered:** per-role model selection, ordered fallback chains
  per role, a switch policy (`switchOn`), failure classification with categories,
  a live settings surface, and write-path isolation for parallel tasks.
- **Persistent notes:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) (evidence ledger
  A/E/R + decisions DD + NOT_RUN ledger NR); decisions in
  [DECISIONS.md](DECISIONS.md) D-009/D-010/D-011.
- **Delivered after the first draft (2026-10-27, t32):** a plugin-owned settings page in
  the Web GUI — all 26 keys, per-role chain editing, validation, save applied to the next
  message. This closes NR-7 and NR-8 as *measured*; see
  [VALIDATION.md](VALIDATION.md) Round 3 and WORKFLOW-DESIGN.md DD-9c.
- **Activation (t33/t32, D-014):** installing the bundle puts the row into the composed
  graph, but the plugin only activates when a workflow provider is enabled — the web app
  ships `workflow-ptc` disabled. `docs/LOCAL-TESTING.md#enable` now carries the four
  checks that prove activation.
- **What is deliberately not delivered:** L2 host routing (U-2), model dropdowns in the
  chain editor (free-text provider/model fields today), and the long-lived GUI delivery
  measurement NR-1. 运维两条硬规则见 **D-013**（不重启在跑的 dsh 服务；队长只计划、实施交给子代理）。

## Overall roadmap — round 2 (phases 1–7), 2026-10-26

- **Roadmap:** [WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md) is the project-wide plan and phase order.
- **Design record:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) holds the confirmed
  requirements, the evidence ledger (A/E/R), the decisions (DD) and the NOT_RUN
  ledger (NR).
- **Decisions:** U-1..U-9 are answered in [DECISIONS.md](DECISIONS.md) **D-009**
  (user-approved 2026-10-26); the `0.2.0` breaking boundary is **D-011**; overnight
  execution and release discipline are **D-010**; the post-install strict-testing
  loop is **D-012**.
- **Version (t35, corrected in t37):** `0.2.1` — an **incremental** release on top of the published
  `0.2.0`; the changelog carries `## [0.2.0] - 2026-10-26` (unchanged history) and a separate
  `## [0.2.1] - 2026-10-27` section that only lists what is new. The evidence chain is stated as a
  **client-bundle invariant**, not as a tarball hash (a repack changes the tarball md5 whenever a
  shipped file such as `README`/`CHANGELOG` changes): `src/client/index.js` = `lib/client.js` =
  `package/lib/client.js` inside the tarball = the copy installed in the debug profile =
  **`68324a754a54ce36e6775618314592c5`** (`docs/knowledge/VALIDATION.md`, Round 3).
- **Known gap (t35):** the settings page validates the *shape* of a chain (bounds, missing model,
  duplicates, three-route limit), while *catalog membership* is enforced by the Host at load — a
  saved model the provider does not enumerate stops the row from activating and the boot line
  names it. A provider-aware model picker is not in 0.2.1.
- **Risk register (t35):** the settings page binds to whichever Loader row projects the plugin's
  fields, so a renamed row moves the page instead of losing it, and the console names the case
  when no row projects them (DD-9d). The entry point itself is the plugin manager's `plugins.item`
  slot — a Host-side contract, deliberately depended on and registered as a risk, not discovered
  later.
- **Release preparation:** the announcement for the current release lives in
  [docs/releases/RELEASE-NOTES-0.2.1.md](../releases/RELEASE-NOTES-0.2.1.md), and the text the
  release workflow publishes is the `## [0.2.1]` section of [CHANGELOG.md](../../CHANGELOG.md).
  The **published** `0.2.0` announcement is kept as
  [docs/releases/RELEASE-NOTES-0.2.0.md](../releases/RELEASE-NOTES-0.2.0.md) (tag `v0.2.0` on
  `f7a244c`, GitHub Release 2026-10-26T17:10:16Z, 42 files / 108,428 B).
- **Phase status:** 1 (environment/API audit), 2 (target design), 3–4 (role
  routing + ordered chains), 5 (configuration + settings surface), 6 (reliability
  and safety) and 7 (documentation, compatibility, release preparation) are
  implemented and `0.2.0` shipped on 2026-10-26; only the `0.2.1` tag and its GitHub Release
  remain, and they are created after the final acceptance pass.
- **Implementation boundary:** code changes go through the team's single-writer
  implementer with an independent review per batch; DSH core and global installs
  remain out of bounds.

## 2026-11-01 — PR #26 review close-out (`fix/fallback-shards`, work commit `68f3d15`, base `2e9c26a`)

- **Status:** the three codex P2 findings on the segmented planner-failure fallback are
  `CONFIRMED` and fixed (surrogate-adjusted segment count, JSON-escape aggregate false
  rejection, arbitrary-slice segments). Details and numbers: VALIDATION.md Round 13.
- **Shape:** `src/shards.ts` is now the only splitter — the generated script runs it, host
  validation re-derives the expected segments with it, and a fallback plan carrying anything
  else is rejected.
- **Verification (after rebasing onto `origin/main` `2e9c26a`):** `npm run ci` exit 0, **27 files /
  487 tests**; committed `lib/` matches a fresh build (`git diff --exit-code -- lib/` = 0). The
  rebase left `src/gate.ts`, `src/run.ts` and `src/triage.ts` (PR #23 P0 semantics) untouched.
- **Still open:** the generated script does not enforce `TASK_LIMITS.objectiveChars` itself; the
  host does (gate/tool/input). Not a regression, not fixed in this branch.

## 2026-11-02/03 — P0-5 首条消息不可见：根因 `CONFIRMED` + 修复（工作提交见 `git log`）

- **缺陷**：默认 `in-turn` 策略在 `agent/pre-step` 里 `await` 整个工作流之后才返回 `enter`，
  而 `AgentLoop.step()` 是被 claim 批次的唯一写入者 —— 运行期间会话里没有 `user/message`，
  GUI 只剩「正在分析请求 / 深度求索中」。真实会话 `session-d3d9375f-…`（qqbot，「机器猫人格」）
  的 transcript 51 条事件里 `user/message` = 0，`turnOutline.turns[0].prompt = ""`，
  `titleInput.count = 0`，首轮 1h41m 未关闭。
- **修复**：`src/gate.ts` `answerInTurn()` 在等待运行**之前**先 `commitClaimed()` 把原消息写进
  surface（同 id/source，保留 `rpcId`），并先取历史快照；运行结束后 `enter.messages` 只带报告
  （`withoutClaimed` 剔除已发布批次），`commitCancelled(..., alreadySurfaced)` 避免重复写。
- **验证**：新增回归测试（修复前 FAIL / 修复后 PASS，离线确定性）；`npm run ci` exit 0，
  **29 files / 522 tests**；`git diff --exit-code -- lib/` = 0；真机 Web GUI 前后对比截图见
  [VALIDATION.md](VALIDATION.md) Round 17 与 `docs/knowledge/evidence/first-message-visible/`。
- **契约变化（对后续 agent 重要）**：`in-turn` 的 `enter.messages` **不再**包含被 claim 的用户消息；
  P0-1 的准确表述改为「用户原话在会话 surface 里恰好一次」，写入者随策略不同而不同
  （`in-turn` 在等待前写、`relay`/`append` 在 reject 后写）。
- **未做**：`:3090` 实例未热加载（D-013）；`relay`/`append` 长驻 GUI 投递仍 `NOT_RUN`。

## 2026-11-03 — route-concurrency 每路由并发上限（`feat/route-concurrency`，未合并）

- **分支**：worktree `.worktrees/route-concurrency`，分支 `feat/route-concurrency`，基线
  `origin/main` `d8cc6cc`（v0.2.6 之后）。
- **设计（D-030）**：`ModelRoute.maxInFlight?`（1–64，留空=不限）；
  `HARD_LIMITS.routeInFlight={min:1,max:64}` 单一来源；打满=溢出到下一条未试路由，
  全满才排队等腾位（`queuedMs`）；溢出不算失败，不推进备用链、不耗重试、不动 `switchOn`；
  证据 `skippedBusy`/`queuedMs` 进 trail（`Route overflows …` 单独渲染）与台账。
- **验证**：`npm run ci` 全绿（待本轮最终跑）；回归 `test/route-concurrency.spec.ts`
  7 例（校验/溢出分流/排队峰值/预算不变/渲染与台账透传），`test/client.spec.ts`
  bounds parity + `error.badCap` 双语，`test/config.spec.ts` script clamp 钉；
  `git diff --exit-code -- lib/` 必须为 0（`src` 改必重建 `lib/`）。
- **交付**：push 到 `origin feat/route-concurrency`，开 PR `base:main`
  标题 `feat(routing): per-route concurrency with overflow to next route`。

## 2026-11-06 — 跨轮上下文延续：有界 digest 注入每一轮子代理（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm test` **33 文件 / 568 测试 PASS**，`npm run lint`
  0 error / 3 个既有 warning），真机两轮实测 PASS（VALIDATION.md Round 21）。**未提交、未发布**。
- **做了什么**：新增 `src/carryover.ts`（从会话里插件自己写的报告编译轮次 → 有界结构化 digest，
  脱敏、双向预算、超限保留最新轮并写明丢弃数、无前序信息时返回空）；`src/script.ts`
  在 planner/worker/verifier/synthesizer 四个提示词里注入 `args.carryover` 并自带
  `CARRYOVER_MAX_CHARS` 夹取；`src/run.ts`/`src/gate.ts`（仅 `runTeam`）/`src/index.ts`（工具路径）
  各加一层注入。首轮不带该键，payload 与此前逐字节一致（`test/carryover.spec.ts` 钉住）。
- **测试**：`test/carryover.spec.ts` 21 例（解析/脱敏/降级/上限 6 档/轮数上限/代理对切割/
  真实脚本第 1 轮→第 2 轮提示词含研究结果/首轮不变/脚本 clamp/请求 payload）；
  `test/gate.spec.ts` 新增 2 例（真 Session + 真网关：第 2 轮 `args.carryover` 含第 1 轮证据、
  而 `args.objective` 不含；首轮无该键）。
- **真机**：隔离 home（`.carryover-e2e/home`，用后即删）+ 隔离工作区 `.carryover-e2e/work`，
  `headless` 模板 profile，模型 `wb/cn:deepseek-v4.1-flash`；第 1 轮 391 已验证，第 2 轮
  「再加 9」 直接答 `391 + 9 = 400`，未要求用户重述；3 个第 2 轮子代理日志出现 `PRIOR ROUNDS`，
  第 1 轮子代理 0 次（`docs/knowledge/evidence/carryover-e2e/`）。
- **新发现（未修，`CONFIRMED`）**：会话首条消息被 `in-turn` 在 `pre-step` 抢先写成
  `user/message` 后，`--session-id` 恢复报
  `SessionFormatError: system/message requires a protected first surface head`（F1）。
  与本次改动无关（P0-5 语义），已记入 VALIDATION Round 21 与 D-035。
- **未做**：`:3090` 未热加载（D-013）；未 bump 版本、未 tag、未发 npm；`relay`/`append` 长驻 GUI
  投递仍 `NOT_RUN`（NR-1 剩余半边）。

## 2026-11-06 — 增量记忆归档：轮次结算即写入、单次会话可读回（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm test` **34 文件 / 589 测试 PASS**，`npm run lint`
  0 error / 3 个既有 warning），真机「团队档真跑 + 另一会话读回」实测 PASS（VALIDATION.md Round 22）。
  **未提交、未发布**。
- **做了什么**：新增 `src/memory/archive.ts`（只追加 JSONL 存储：`$DSH_HOME/memory/grok-workflow/
  archive.jsonl`，`GROK_WORKFLOW_MEMORY_DIR` 可改；`ARCHIVE_LIMITS` 全部有界；`appendArchiveEntry()`
  返回 `{written,id,reason}` 永不抛；`readArchive()` 新到旧 + 按 id 去重 + 4 MiB 尾部扫描），
  `src/memory/recorder.ts`（引擎事件 → `run:<runId>:agent:<seq>` 与 `run:<runId>` 条目；
  `agent-start` 捕获子会话、结算时读其 `ownEvents()`；子代理发现优先取结构化提交，退而取散文；
  `archiveRoundNow()` 给前台档用），`src/memory/cli.ts`（`node lib/memory/cli.js recent|path`，
  零依赖读回，不需要 DSH/插件在线）。`src/run.ts` 两处接线：引擎事件订阅与 `finally` 里的轮次
  结算（都**不**受 `showProgress` 控制），以及 `runSingleCall` 成功路径的前台档归档。
- **测试**：`test/memory-archive.spec.ts` 21 例——写入时刻（真引擎 harness 中途读只见 agent 条目
  且 `runSettled === false`，结束后出现 round 条目）、独立进程读回（`node --input-type=module -e`
  + 随包 CLI）、幂等/只追加（旧字节逐字节保留）、脱敏、写入失败不拖垮运行、子代理发现三形态
  （`plan: N task(s)` / 申报结果 / `verdict pass · N criteria`）、`agent-start` 捕获语义、
  会话服务不可达时的降级。
- **真机**：隔离 home `.workflow-artifacts/incr-archive-e2e/home`（`headless` 模板 + patch
  `grokDefault: "on"`）+ 隔离工作区 `…/work`，模型 `wb/cn:deepseek-v4.1-flash`；一轮两步骤任务
  结算后归档 4 条（3 agent + 1 round），随后**新起一个会话**跑 CLI 直接读到该轮条目与
  `verdict pass · 8 criterion/criteria checked`（`docs/knowledge/evidence/incremental-archive/`）。
- **新发现（`CONFIRMED`，见 RESEARCH A15）**：①`ctx.sessions` 在插件 fiber 上抛
  `cannot get property "sessions" without inject`，须用 `ctx.get('sessions')`；②引擎在
  `agent-end` 送达宿主前就 dispose 子会话，必须在 `agent-start` 捕获；③结构化子代理不产出
  assistant 文本，结论在 `tool-call.arguments`（JSON 字符串）；④`grokDefault` 默认 `off`，
  闸门没开时根本没有轮次可归档。
- **未做**：`:3090` 未热加载（D-013）；未 bump 版本、未 tag、未发 npm；两进程并发追加同一文件的
  压测 `NOT_RUN`；换引擎的子代理形状复测 `NOT_RUN`。

## 2026-11-06 — 先回捞后提问：ask 档提问前先读上文与磁盘记忆（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm run ci` **35 文件 / 617 测试 PASS**，`Found 3 warnings and
  0 errors`，3 个均为既有 warning）；真机在线回放 `NOT_RUN`。**未提交、未发布**。
- **做了什么**：`src/triage.ts` 加 `recallFromPrior()`（双字/词锚点 ≥2，或指针式引用 + ≥120 字符实质
  材料）、`RECALL_LIMITS`、`TriageInput.prior`、`DETAIL.recalled`、`recallPrompt()`、`recalledNote()`、
  `missingNote()`，并把 4 处 ask 判定收敛成 `ambiguousVerdict()`（无 `prior` 时行为不变）；
  `src/gate.ts` 加 `memoryDocRoots()` / `readMemoryDocs()` / `collectRecallSources()` 并在
  `produceAnswer()` 的 ask 档前接线：命中→快手档据材料作答（回答注明出处），未命中且查过→提问后追加
  「先查后问，还缺 X」，无来源→提问逐字节不变。
- **测试**：新增 `test/triage-recall.spec.ts` 28 例（命中/未命中/指针式/确定性/摘录上限/脱敏/默认根目录
  与环境变量/ask 与 chat 逐字节回归/`session-7e079b80` 形态的回放成对用例/`readMemoryDocs` 降级）。
  全量套件从 34 文件 589 测试 → **35 文件 617 测试**，既有 triage/gate/followup 89 例全绿。
- **现场发现（`CONFIRMED`，已修）**：`relay` 在 `produceAnswer()` 之前就 `commitClaimed()`，首版召回把
  本轮消息读成「历史」→ 自命中；`collectRecallSources(…, exclude)` 修复。
- **决策**：D-037。**证据**：`docs/knowledge/evidence/history-first/`。
- **未做**：真机在线模型两轮回放、`:3090` 热加载（D-013）、版本号与发布。

## 2026-11-07 — 子代理顶栏显示名：诊断完成（当时判定 BLOCKED；**2026-11-08 已被第四次执行推翻并落地**，见下一节）

- **状态**：只读源码取证诊断，**无插件源码改动、无 DSH core 改动、未起隔离 profile、未碰 live `:3090`**。
  用户目标（顶栏每个子代理显示具体任务名、不出现 `任务团队 child N` / 提示词原文）在当前约束下不可达。
- **根因（`CONFIRMED`，行号即证据）**：插件已经传了标签
  （`src/script.ts:1188/1213/1324/1438` → `规划助手`/`执行`/`检查`/`汇总助手`），DSH 自己的工具文档也把
  `label` 写作 "(display)"（`dsh-tool-workflow/lib/index.js:143`）；但引擎运行时
  `packages/workflow/workflow-ptc/src/runtime.ts:183-188` 不把 `label` 转给 `startAgent`，
  宿主 `host.ts:200-205` 直接写死 `` `${this.meta.name} child ${callId}` ``，
  该值落成子会话首个 `subagent/descriptor`（`dsh-subagent/lib/index.js:1404,1800`）并被
  `foldSubagentDescriptor` 锁成不可改写（同文件 `:686-698`），GUI 顶栏主标签直接取它
  （`dsh-client-ui-subagent/lib/client.js:201`）。
- **否决的绕行**：追加描述符 / 自定义 `SubagentProvider` / 改 `meta.name` / 插件自建 `startActivation` / 改 core，
  逐条理由见 `DECISIONS.md` D-039 与 `VALIDATION.md` Round 27。
- **上游 ask（`NOT_RUN`）**：`runtime.ts` 转发 `opts.label` + `host.ts` 的 `childRequest()/startChild()`
  接 `label`（约 3 行），改完插件零改动即生效。
- **未做**：`CHANGELOG.md` 不加条目（无用户可见变更）；live `:3090` 版本查询 `NOT_RUN`
  （`GET /` → `401`，本会话无凭据）；真机 GUI 复验 `NOT_RUN`。
- **并发注意**：开工时工作树已有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`），本轮未触碰、未提交。
- **第二次尝试补充（2026-11-07 晚，Round 28，`CONFIRMED`）**：结论**维持 BLOCKED**。上一轮的两项 `NOT_RUN`
  升级——①源码链逐条**独立重验**（本轮自己读的行号见 `VALIDATION.md` Round 28 表）；
  ②**隔离 profile 真机复现成功**：`out/childname-verify/`（profile `cnamer`，headless，模型
  v4-pro + agnes-3.0-flash，密钥仅布尔存在检查）跑一轮团队档 COMPLETED（2 任务 verified，6 个子代理），
  父会话 `tool-workflow/agent-start` 证明插件标签（`规划助手`/`执行`/`检查`）确实在传，
  而 6 个子会话首个 `subagent/descriptor` **全部**是 `"label":「任务团队 child N」`（N=1..6）——
  与用户截图逐字一致。证据：`docs/knowledge/evidence/childname-blocked/`。上游 ask 内容不变。
- **第三次执行补充（2026-11-08，Round 29，`CONFIRMED`）**：结论**维持 BLOCKED**。Round 27/28 链路第三次独立
  重验逐条一致；并新增**类型级证据**关闭末两个扩展点候选（每 run `subagentProvider` 覆盖 +
  `ctx.subagents.registerProvider`：continuable 子代理的 provider 参与只有 `ContinuableCreateSpec { seed? }`、
  无 label 字段；`WorkflowStartRequest` 全接口无 label；引擎 Config 无 label 模板；仅
  `PtcWorkflowEngine` 一个引擎实现）。core 检出 HEAD `687f282e` 与 installed 同为 `0.2.1-rc.2`，上游 ask
  仍必要。插件源码零改动。证据：`docs/knowledge/evidence/childname-blocked/extension-points-closure.md`；
  详见 `VALIDATION.md` Round 29 与 `DECISIONS.md` D-039 Addendum 2。

## 2026-11-08 — 子代理顶栏显示名：插件侧 twin 引擎落地，真机 PASS（fix_child_names 第四次执行，`CONFIRMED`）

- **状态**：实现 + 确定性测试 + 真机验证完成。`npm run ci` **37 文件 / 650 测试 PASS**
  （typecheck 0 错；lint 4 warning / 0 error，与 HEAD 基线一致）；隔离 profile `cfix`
  真机 PASS（Round 31）。**未提交（随本轮 commit）、未 bump 版本、未打 tag、未发布、
  live `:3090` 未动（仍 `0.2.7`，D-013）；DSH core 检出全程 clean（`687f282e`）**。
- **做了什么**：①`src/team-engine.ts`（新增）——用注入引擎**自己的构造函数**建私有 twin
  （static-inject 判别、WeakMap 按 ctx 缓存、`reflect.provide` 置空、引擎 config 镜像），
  twin 的 subagents 视图在 `startActivation` 处把 `spec.label` 重写为提示词首行
  （48 码点截断）；构造失败/非 PTC 引擎原样回退并 `logger.warn` 一次性。
  ②`src/script.ts`/`src/triage.ts`/`src/gate.ts`——每个子代理提示词**首行**改为描述性标题
  （`规划助手`/`<任务标题>`/`检查 · <任务标题>`/`汇总助手`/`快速应答`/`前台直答`/`前台任务`/`任务分类`），
  人设行保持第二行。③`src/run.ts`——两处 `ctx.workflowEngine.start` 改走
  `teamWorkflowEngine(ctx, logger)`。测试 `test/team-engine.spec.ts` 12 例 +
  `test/engine-harness.ts` 一处 additive 捕获。
- **关键机制（RESEARCH.md A18 / DECISIONS.md D-041）**：`PtcWorkflowEngine.start()` 在 start
  时读 `runCtx.subagents`，故插件可在交 run 前替换 subagents 视图——`startActivation` 的
  调用方变成插件，label 归调用方的契约站在插件这边。真机两次失败定位了 cordis 硬事实：
  代理 cordis ctx 会破坏 receiver 键控的服务解析；服务属性访问受 isolate guard，
  显式 `ctx.get(name)` 不受——twin 的服务从引擎自身 ctx 经 `ctx.get` 解析。
- **真机验证（Round 31）**：终验团队档 COMPLETED，6 个子会话首个 `subagent/descriptor`
  全部为描述性标签（规划助手 / 任务标题 / 检查 · 任务标题，含一条真实 agnes route-switch 重试），
  **0 处 `任务团队 child N`**；修复前同 patch 对照 3/3 为旧标签。GUI 主名判定 =
  `client.js:201` 源码链 + 描述符事件；浏览器点开 live `:3090` 验证 NOT_RUN（401，D-013）。
  证据：`docs/knowledge/evidence/childname-fix-2026-11-08/`。
- **未做**：live `:3090` 的浏览器复验（实例仍是旧插件 0.2.7，需重新部署后人工确认）；
  上游 3 行 ask 从「必要」降级为「可选简化」，未执行。
- **CHANGELOG**：`[Unreleased]` Fixed 增加英中双语条目"Task-team children are named after
  their work / 任务团队子代理按其工作命名"。
- **并发注意**：本节与 Round 30 的 fix_completed_links（D-040，已入库 `60cde95`）不冲突；
  本轮触碰的文件与其零交集（除 `CHANGELOG.md`/记忆文件的追加）。

## 2026-11-08 — 子代理顶栏显示名：GUI 浏览器验证 PASS（fix_child_names 验证轮，零源码改动，`CONFIRMED`）

- **状态**：Round 31 修复的浏览器观察轮完成（Round 32）。工作树基点 `ad66118`（`release/0.6.0`，
  与 origin 同步）；基线 `npm run ci` **37 文件 / 650 测试 PASS**；本轮零源码改动。
- **做了什么**：隔离 home `out/gui-verify/home/`（web 模板 profile `guiweb`，插件 dev 安装自
  工作树构建）起 Web 实例 `127.0.0.1:3199`（一次性 token 只走环境变量、不落盘、用后即杀），
  headless Chromium 两遍驱动：①真实 composer 键入团队档双计算任务 → `Grok workflow: COMPLETED`
  （6 子代理，含真实 agnes format-error 路由切换重试）；②展开库存 `Session hierarchy` 顶栏面板 →
  **6 个子代理主标签全部描述性**（`规划助手`/`计算并验算 919 + 27`/`检查 · 计算并验算 919 × 3` 等），
  **0 处 `任务团队 child N`**、0 处提示词原文作主标签；持久 `subagent/descriptor` 与面板逐字一致。
  证据：`evidence/childname-fix-2026-11-08/gui/`（README + 4 截图 + 3 JSON + 描述符摘录）。
- **记忆更正（只读核实）**：live web profile 的插件 = **released 0.6.0**（2026-11-07 21:54 安装，
  `lib/team-engine.js` 不存在 → 不含本修复；旧记「仍 0.2.7」过时，本文件与 VALIDATION 已更正）。
- **验收条款状态**：条款 1/2/3/5/6 满足；条款 4 的「DSH installation 加载 + ≥3 子代理工作流 +
  GUI 顶栏显示描述性名」三项在本机 `CONFIRMED`，唯一未达项 = 特指 live `:3090` 实例本身
  （仍跑不含修复的 released 0.6.0；部署需用户授权，D-013 步骤 5，本会话沙箱只可写工作树）。
- **未做**：live `:3090` 的修复部署与浏览器复验（用户授权动作）；上游 3 行 ask（可选，未执行）；
  无 CHANGELOG 变更（无新用户可见变更）。

## 2026-11-08 — 已完成子任务保持可点击：客户端重注册 workflow-run 节点（v0.6.0 工作树，未发布）

- **状态**：实现 + 确定性测试 + 真机验证完成（`npm run ci` **36 文件 / 638 测试 PASS**；
  隔离 profile `panelcheck` 真机 PASS，Round 30）。**未提交（随本轮 commit）、未 bump 版本、
  未打 tag、未发布、live `:3090` 未动（仍 `0.2.7`，D-013）**。
- **做了什么**：`src/client/index.js`（= `lib/client.js`）新增 `mountPanel`——经
  `conversation.chat.node` 键控槽位以 `key: 'workflow-run'`、`priority: -1` 重注册聊天任务
  列表渲染器；成员行可开性只看「子会话能否打开」（`panelMemberMode`），不看状态——运行中、
  已完成、失败、取消、中断全部是链接，点击即开子会话（`uiWorkspace.openSession`，可选注入）。
  测试 `test/panel-links.spec.ts` 14 例 + `test/client.spec.ts` 断言更新；
  `package.json` `test:unit` 收入新 spec。
- **硬约束（新发现，A17/D-040）**：键控槽位同键**同优先级**会让另一个注册者整条 boot fiber
  失败（首轮实测库存 `dsh-client-ui-workflow-run` "1 entry did not activate"、整页错误屏）；
  静态客户端路径无自动优先级分配，跨插件复用键控键**必须**显式 `priority: -1`。
- **真机验证（Round 30）**：隔离 home `.v070-home/`、web 模板 profile、headless Chromium；
  boot 干净后团队档真跑到 `completed`（6 子代理，含一条真实 agnes route-switch 的 failed 行），
  **6 行全部 `<button data-member-openable="true">`、0 行 inert**；点击已完成的 `规划助手` 行
  打开子会话视图（面包屑 `… / 任务团队 child 1`）。证据
  `docs/knowledge/evidence/panel-links-2026-11-08/`。
- **未做**：`relay`/`append` 形态的任务列表渲染（HYPOTHESIS 外推）、深色主题/移动端视觉
  （NOT_RUN）、CHANGELOG 之外的 README/ARCHITECTURE 更新（本轮认为无必要）。
- **并发注意**：工作树同时含 fix_child_names 任务的记忆条目（D-039/Round 27–29），本轮
  commit 一并入库（均为已完成的记录）；`src/` 其余文件本轮未触碰。

## 2026-11-13 — v0.8.0 已发布（PR #45 → 9c590f2；Tag v0.8.0 → 同 sha；Release 已建）

- **状态（`CONFIRMED`，lead 独立核验）**：`main = origin/main = 9c590f2`（ahead/behind 0/0）；
  `package.json` = `0.8.0`；Tag `v0.8.0` peel 到 `9c590f2`（本地与远端 `ls-remote` 一致）；
  PR #45 MERGED 2026-11-13T01:26:25Z（CI Node22+24 双绿）；Release published 2026-11-13T01:27:54Z
 （`dsh-grok-workflow-0.8.0.tgz`，Release workflow 绿）。Aggressive `git fsck` 悬空对象仅为历史
  dangling，无 WIP 丢失。
- **内容**：人话交付层（`src/delivery/` + `humanHead` 统一三态 + `showDiagnostics` 默认关）＋
  `synthesis: layered`（`SynthesisPolicy` 三值，报告 `mode` 仍两值，digest/guardrail/fallback 有界）＋
  checkpoint/resume（`src/checkpoint/` 原子写入校验 + `src/resume/` 校验恢复策略 + `src/run.ts` 接线，
  无用户可见面）。Watchdog 与 Evidence Collector 明确 `NOT_DONE`（工作树无实现，未伪装）。
- **安装验证**：隔离 profile `v080verify` 从 Tag 安装成功（`package.json` 0.8.0；headless 真跑
  `BLOCKED`——需模型调用，100s 无输出，不算通过）；`~/.dsh/profiles/web` 从 Tag 装到 0.8.0
 （`lib/delivery|checkpoint|resume` 齐，`config.js` 含 layered×10）。**`dsh-layerfs` 的 live
  `:3090`（pid 4003162，自 11-12 运行）未装、未重启**——`layerfs/profiles/web/node_modules/`
  下无此包、`pnpm-lock` 无记录；release-080 澄清其“live”仅指 `~/.dsh`，`layerfs` 生效记
  `UNVERIFIED`。重启仍是用户动作（D-013）。
- **测试诚实边界**：本版相关 12 spec / 198 PASS；全量 778 passed / 3 failed——`gate.spec` 2 失败在
  baseline `84e6894` 同样复现（预存/环境性），`human-output-contract` 全量时 1 flaky、单跑 9/9 过。
- **遗留**：工作树未跟踪（`.audit-scratch/`、`.tmp-largefiles/`、`RENDERING-STUDY.md`、
  `evidence/checkpoint-*`、`survey`）未入库；STATE/HANDOFF/VALIDATION 本轮未更新（写范围外）；
  `release/0.8.0` 分支未删；已发布 Tag 未动。

## 2026-11-15 — wave1+wave2 收尾（**未提交**）：B01-B18 清点 + 进度 Tab + 真机验证 H1/H2

- **From:** 收尾组 M · **To:** V 组（版本提交）/ lead · **可写面:** 六个 `docs/knowledge/*.md` +
  `CHANGELOG.md` 的 `[Unreleased]` 节 + `DESIGN-progress-tab.md` 追加收尾节；不碰
  `src/` `lib/` `test/` `package*.json` `README*` `cordis.patch.yml`，不 commit、不打 tag、不 push。
- **基线（`CONFIRMED`）**：`git status --short --branch` → `## main...origin/main`；`HEAD = ee5e013`
  （v0.8.0 发布记录 `docs(memory): v0.8.0 release record`）。工作树 **81 文件 / +7014 / −534**
  全部未提交：`src/` **13** 文件、`test/` **15** 文件、`lib/` **46** 个构建产物（+ 4 个新增
  `progress-tab.*`）、`docs/` 3 文件 + `README`/`README.zh-CN` + `CHANGELOG`（`git diff --name-only`
  逐区计数）。
  未跟踪新增：`src/progress-tab.ts`、`lib/progress-tab.js`（+ `.d.ts`/`.map`）、
  `test/progress-tab.spec.ts`、`test/delivery-human-block.spec.ts`、`docs/knowledge/DESIGN-progress-tab.md`、
  `docs/knowledge/evidence/{verify-H1,progress-tab-2026-11-15,checkpoint-engine-wire-2026-11-12,recovery-kill-restart-2026-11-12}/`。
- **版本（`CONFIRMED`）**：`package.json` 工作树已是 `0.9.0`（V 组的 bump，未提交）。本轮 M 组
  **不 bump**，只往 `[Unreleased]` 写内容（1 条 Added + 10 条 Fixed，中英双语）；写完后 V 组把节头
  提升为 `## [0.9.0] - 2026-11-15`，条目原文未动。`## [0.8.0] - 2026-11-13` 及以下未触碰。
- **环境（`CONFIRMED`，见 `evidence/verify-H1/ci.txt`）**：host `omarchy`，`node v26.8.1`、
  `npm 11.19.0`、`dsh 0.2.2-rc.3`。

### B01-B18 状态清单

状态词只用 `CONFIRMED` / `HYPOTHESIS` / `NOT_RUN` / `BLOCKED`。`CONFIRMED` 的行都有源码锚点
（本轮 grep 复核过行号）或证据文件，**逐行核过源码注释**（`src` 内以 `B<n>` 标注的注释即是审计
锚点）—— 例外是 B11/B16/B17：这三条在源码里没有编号锚点，映射是推断，见本节末「B11/B16/B17
的边界」。

| 编号 | 锚点（文件:行号） | 一句话 | 状态 |
| --- | --- | --- | --- |
| B01 | `package.json:39`（`engines.dsh: ">=0.2.1-rc.2 <0.3.0"`；同时删掉旧 `dsh.compatibility` 块） | 引擎兼容声明改成真 semver 区间，旧的手写兼容表撤除 | **CONFIRMED** — `evidence/verify-H1/engines-dsh-B01.txt`：真机 runtime `0.2.2-rc.3` → 判定 `null`（无未满足要求）；对照 `engines.dsh:"<0.2.0"` → REFUSED，证明检查非空转 |
| B02 | `src/triage.ts:249,291-294,356` | 分诊信号扫描有界（`TRIAGE_LIMITS.signalChars`），32k 粘贴不再按秒计 | **CONFIRMED** — 锚点注释 + `test/triage.spec.ts:84` |
| B03 | `src/command.ts:68-127`（`toggleFailureText` + 读回校验） | `/grok` 的写入没落地时只报失败、绝不用成功措辞 | **CONFIRMED** — `test/command.spec.ts:100-150`（拒绝写入 / 接受但读不回 / 无 session 三形态 + 健康路径） |
| B04 | `src/gate.ts:745,945` | 前台第二个问题到来时，未作答的上一个请求不被丢掉 | **CONFIRMED** — `test/phase1-dialogue.spec.ts:510` |
| B05 | `src/triage.ts:115,142,735,990` | 「先回答再派新活」的一条消息不再把答复当任务目标 | **CONFIRMED** — `test/triage.spec.ts:550,645` |
| B06 | `src/gate.ts:1238`、`src/history.ts`（排除自写批次的 id）、`test/history.spec.ts:61` | `relay`/`append` 自己是写者时，紧随的历史读不能把刚写的消息重复喂回 | **CONFIRMED** — `test/gate.spec.ts:592`、`test/history.spec.ts:61-75` |
| B07 | `src/config.ts:22,35`（`maxConcurrency` 6 / `maxRetries` 3 / `maxAttemptsPerTask` 400）、`test/routing.spec.ts:73`、`test/route-concurrency.spec.ts:102` | 并发/重试硬上限回到 AGENTS.md 的文档契约（3/6、1/3），脚本侧传入的超限被夹紧 | **CONFIRMED** — 见下「maxAttemptsPerTask = 400 的推导」 |
| B08 | `src/gate.ts:769,935` | 确认后复述的请求裁到 objective 预算内，而不是拒绝整轮 | **CONFIRMED** — `test/phase1-dialogue.spec.ts:536` |
| B09 | `src/triage.ts:233,237,277,363` | 顿号/全角逗号写的三件事不再被当成「一件事」压成单个 quick worker | **CONFIRMED** — `test/triage.spec.ts:230,243` |
| B10 | `src/delivery/index.ts:88,137,182,209,335,362` | 人话块里的失败原因被台账关键词的裸子串扫描误删；改成锚定/整词，且 `incomplete[].reason`/`task.error` 不再逐字段洗 | **CONFIRMED** — `test/delivery-human-block.spec.ts:114,154`（含「守卫没被删掉」的反向断言） |
| B11 | `src/client/index.js:714`（状态色改 design token `var(--dsw-alias-state-business-primary, …)`） | 状态点不再写死浅色 hex，跟随主题 | **HYPOTHESIS**（内容 CONFIRMED：`docs/task-progress-panel.md` §Client-surface hardening 第 1 条 + 锚点；**编号→条目映射**未获审计清单确认，见本节末「B11/B16/B17 的边界」） |
| B12 | `src/checkpoint/wiring.ts:775,933` | 检查点的任务身份取自引擎 `meta.name` 且脱敏有界；`stages`/`agents` 永不为 `undefined` | **CONFIRMED** — `test/checkpoint-wiring.spec.ts:212,228,239` |
| B13 | `src/checkpoint/wiring.ts:315` | 陈旧判定用自有区间 1 s–24 h，不借用写间隔 | **CONFIRMED** — `test/checkpoint-wiring.spec.ts:539,556` |
| B14 | `src/checkpoint/wiring.ts:828` | 同一 run 文件单飞写入；两个清洗后同名的 id 分开存 | **CONFIRMED** — `test/checkpoint-wiring.spec.ts:255`、`test/checkpoint-schema.spec.ts:379` |
| B15 | `src/checkpoint/wiring.ts:517,907` | 缺省 limits 按契约默认值记录；放弃写入时只说一次且可见 | **CONFIRMED** — `test/checkpoint-wiring.spec.ts:430,649`、`test/checkpoint-schema.spec.ts:339` |
| B16 | `src/client/index.js:690`（`guardedTranslator`）、`:1665,1688,1714`（`status.unknown`） | 字典缺注册时 key id 不上屏；面板不认识的状态说「状态未知」而不是把引擎原词塞进中文句子 | **HYPOTHESIS**（内容 CONFIRMED：同上 §Client-surface hardening 第 2、3 条；编号映射未确认） |
| B17 | `src/client/index.js:987,1005,1412`（设置页 `loading`/`error`/`unavailable` 三态）、`:945`（≤560px `.gw-row` 单列） | 失败不再永远显示「读取中…」；窄窗不再横向溢出 | **HYPOTHESIS**（内容 CONFIRMED：同上第 4、5 条；编号映射未确认） |
| B18 | `src/gate.ts:186,870` | 可选混合分类器给出的档位带**它自己**的理由句，不冒充规则句 | **CONFIRMED** — `test/phase1-dialogue.spec.ts:1073-…` |

**B11/B16/B17 的边界（`HYPOTHESIS`，不冒充）**：这三条在本仓库全树（`src/`、`test/`、`lib/`、
`docs/`、`.dsh-home/`、`.agent-teams/`）**没有任何 `B11`/`B16`/`B17` 源码注释锚点**，
审计清单也没有落盘文件。因此上表按「本轮客户端加固的实际改动」给出 `文件:行号` 与证据，
但**编号与条目的对应关系是推断**。lead 若持有清单原文，补一行即可把状态改成 `CONFIRMED`；
在此之前不得把它们当作「审计编号已核对」。

### H1 — 安装 / 加载 / 交互（真机，`evidence/verify-H1/`）

环境：隔离 `DSH_HOME=<repo>/.verify-gw/home`（跑完已删）、profile `gwverify`（自 `web` 模板）与
`gwverify-hl`（自 `headless`）、运行时 `dsh 0.2.2-rc.3`。命令与输出原文见该目录 `README.md`。

- **安装 PASS（`CONFIRMED`）**：
  `npm run build` → exit 0，client bundle **186091 B** → `lib/client.js`；
  `DSH_HOME=$PWD/.verify-gw/home dsh plugin --profile gwverify add "$PWD"` → pnpm 写入
  `dsh-grok-workflow link:../../../..`，安装后 manifest 版本 `0.8.0`（工作树基线），
  `dsh.profile.bundles` 变 **3 条**（`profile-bundles.json`）。同法在 `gwverify-hl` 重复，exit 0。
- **加载 PASS（`CONFIRMED`，不是「没报错就算过」）**：启用时 boot 只有 URL 一行
  （`boot-enabled.txt`），无 `pending` / `did not activate` / `skipping profile bundle`；
  **对照**：`--patch` 关掉 `workflow-ptc` → `dsh: warning: 1 entry did not activate` +
  `grok-workflow (dsh-grok-workflow): pending (waiting for service: workflowEngine)`
  （`boot-control-workflow-ptc-disabled.txt`）。对照存在，说明干净那行不是静默假象。
- **活实例三查（`CONFIRMED`）**：`POST /api/settings/describe` → 23 个命名空间，其中
  `grok-workflow`（`autoGenerate: true`、`applies: live`、28 投影字段、无 secret 槽）；
  首页把 `dsh-grok-workflow/client.js` 打进 `/plugins/??…` 批，取回字节 = `lib/client.js`
  加一行 `sourceMappingURL`（`client-bundle-serving.txt`）；真实会话出站请求的工具表
  **24 个含 `grok_workflow`**（`mock-boundary.txt`）。
- **前台（chat 档）PASS（`CONFIRMED`）**：
  `DSH_HOME=.verify-gw/home dsh --profile gwverify-hl --patch mock.patch.yml 「你好」` → exit 0，
  stdout 由插件自己产出：`档位：直答档 — 因为：这是问候/寒暄，没有要做的事，前台直接回答。`
  且该裁决同时写进了会话日志（`session-dcf8b852…` 的 `user/message` seq 12，`front-desk-relay-message.txt`）。
- **团队档 model-BLOCKED（`BLOCKED`，不报 PASS）**：同一命令换成
  `「用团队跑一个小任务：…」` → exit 0，但 run `FAILED`：
  `task-1: failed (2 attempts) — worker failed on every route: [format-error] child returned no valid structured result`
  （`interact-team-tier.txt`）。档位行本身正确（`档位：团队档 — 因为：你的消息里点名了团队…`），
  规划/工人子会话都真的起来了；失败点是**被 mock 的模型给不出结构化结果**。
  真模型路径本轮**不可达**，原文如下（`model-boundary-BLOCKED.txt`）：

  ```text
  命令：DSH_HOME=.verify-gw/home dsh --profile gwverify-hl --patch .verify-gw/model.patch.yml "Reply with exactly: MODEL_OK"
  EXIT=1
  stderr: dsh: TIMEOUT: Request timed out.: Connect Timeout Error
          (attempted address: models.fyrali.com:443, timeout: 10000ms) (UND_ERR_CONNECT_TIMEOUT)

  getent hosts models.fyrali.com -> 100.111.111.99
  tailscale status: 100.111.111.99 bifrost active; relay "sin", tx 10764 rx 0
  ping 100.111.111.99: 2 packets transmitted, 0 received, 100% packet loss
  TCP 80/443/3000/3065/8000/8080/8888/9000/11434/4000 on 100.111.111.99: all closed/timeout
  备选本机网关 http://127.0.0.1:3065/v1 (agent2api) 列出模型，但
  POST /v1/chat/completions -> HTTP 401 model_api_key_required（取网关 key 需读用户凭据库，AGENTS.md 禁止）
  ```

  即 **`100.111.111.99` 不可达 = BLOCKED 的成因**：tailnet 侧显示 active 但 `rx 0`、
  100% 丢包、所有探测端口关闭；备选网关要凭据。**没有伪造任何 PASS**。
- **engines 上界边界（`CONFIRMED`）**：`evaluatePluginCompatibility` 用
  `semver.satisfies(runtime, range, { includePrerelease: true })`（`dsh-app-boot/lib/index.js`），
  所以 `<0.3.0` 实际**放行 `0.3.0-rc.*`** —— 实测 `0.3.0-rc.1` → compatible。
  即「上界 0.3.0」在当前实现里不构成对 rc 的围栏；安装从未因 `engines.dsh` 被拦。
  这是记录，不是缺陷：要不要收窄留给下次改 `engines` 时决定（见 DECISIONS D-043）。

### H2 — 进度 Tab 真机（14 帧，`evidence/progress-tab-2026-11-15/`）

隔离 `dsh web` 实例 `127.0.0.1:3210`、`DSH_HOME=<repo>/.dsh-home`、profile `gwprog`（自 `web` 模板）、
插件用**打包产物**装入、模型走 `127.0.0.1:18088` 真网关、headless Chromium 1440×900 / 480×900。
收尾：杀进程 + 删 token 日志（`PORT_3210_CLOSED` / `TOKEN_LOG_REMOVED`），`:3080`/`:3086`/`:3065` 未触碰。

| 状态 | 真机结论 | 证据 |
| --- | --- | --- |
| `pending` | **CONFIRMED** | `03`、`04`：7 个未命中的模板阶段保持 pending，`title="Not reported in the events"`，不借邻居状态 |
| `doing` | **CONFIRMED** | `03`；`TIMELINE` T+0 / +4s / +21s 三帧 |
| `done` | **CONFIRMED** | `03`（Start）、`04`（`3/3 · 100%`）、`06`（`规划 Done`） |
| `cancelled` | **CONFIRMED** | `12`/`13`/`14`：跑到 doing 时点 composer 停止（真实动作），`FINAL_STATES=["done","pending","cancelled"]`，引擎原话，未由「没结算」派生 |
| `blocked` | **NOT_RUN**（真机未触发） | 本轮没有真实触发条件（abort 给的是 `cancelled`）。单元覆盖：`test/progress-tab.spec.ts`、`test/client.spec.ts` |
| `failed` | **NOT_RUN**（真机未触发） | 未构造失败子调用（不伪造真机）。单元覆盖同上 |

- 三 Tab 共存且默认落对话：`A2_TABS=[Chat(selected), Trajectory, Progress]`、`A2_TAB_COUNT=3`（`01`）。
- 空态：有标题与「No rows declared yet」，无轨道/节点/百分比（`02`）。
- 详情三段：`DETAIL_HEADINGS=["Engine facts","Stage report"]`，7 字段全 `—` + `Source: not reported`
  （L3 落点，符合设计 §7），`Copy coordination block` 在无协调块时 `disabled=true`（`06`、`stage-d.log.txt`）。
- 窄屏 480 / 深色：详情变底部抽屉、字段单列；环色全来自 token（`07`、`08`）。
- 零回归：对话含任务原文 + 报告 + `/grok on` 回执、无 `TypeError`/`Cannot read`；轨迹 6132 字符含
  events / workflow；已完成行可点开真实子会话（`09`、`10`、`11`）。
- **`blocked`/`failed` 的补充是单元快照，不冒充真机**：
  `npx vitest run test/progress-tab.spec.ts test/client.spec.ts` → **2 文件 / 93 测试 PASS**
  （`unit-supplement.log.txt`）。
- **单 run 展示**：`selectActiveRun` 取 `anchorSeq` 最大的 run，故 `04` 之后只剩最新轨道（与设计 §3 一致）。

### `maxAttemptsPerTask = 400` 的推导（`CONFIRMED`）

`src/config.ts:35` 把上界从 `1100` 降到 `400`，`test/routing.spec.ts:73` 把它钉成等式：

```text
worker 链上限 50（HARD_LIMITS.chainLength）
+ verifier 链上限 50
= 每次尝试 100 次子调用
× 尝试次数（maxRetries 硬上限 3 → 3+1 = 4）
= 400
```

守卫是 `>`，所以**最坏的合法组合恰好等于 400 且能通过**；只有「将来把某个上限放宽却忘了 revisit」
才会撞到它。普通组合（3+3 链、默认 1 重试 = (3+3)×2 = 12）远在界内。
性质变了：旧值 1100 只是「足够大」，新值 400 是「最坏合法值」，等式由测试固定。

### link: 安装 / `grok on`（现象 `CONFIRMED`，归因 `HYPOTHESIS`）

- **`CONFIRMED`**：`dsh plugin --profile gwprog add link:<repo>` 装的实例里 `/grok on` 回
  `Failed / Grok workflow toggle not changed: Receiver must be an instance of class Session.`
  （`probes/probe-after-grok-on.png`）；换成同目录**打包产物**安装，同一条命令成功
  `Grok workflow ON — every message now runs the full plan→execute→verify workflow.`
  （`probes/probe-grok-on-existing.png`、`stage-e.log.txt` 的 `GROK_ON=true`）。
- **`HYPOTHESIS`（未插桩验证模块身份）**：`link:` 时插件解析到工作树自己的
  `node_modules/@deepseek-ai/dsh-session` **0.2.1-rc.2**（devDependencies），运行时是
  **0.2.2-rc.3**；`appendPluginRecord` 落在旧副本的私有方法上，跨副本 brand check 抛错。
  打包安装的 profile 里只有 `cosmokit`/`schemastery`，没有第二份，故正常。
- **影响面（`CONFIRMED` 的边界）**：只影响「把工作树 `link:` 进 profile 做真机验证」；
  不影响打包/npm 安装形态。**验证 `/grok` 开关必须用打包产物。**
- 附带 `CONFIRMED` 限制：会话首页（尚无 session）里发 `/grok on` 不执行，必须先有一条普通消息建会话。

### 本轮 `NOT_RUN` / `BLOCKED` 汇总

- `BLOCKED`：真模型团队档端到端（`100.111.111.99` 不可达，原文见上）；因此「团队档答案质量」本轮无结论。
- `NOT_RUN`：live `:3080` / `:3086` / `:3090` 的部署与重启（用户保留动作，D-013）；
  进度 Tab 的 `blocked`/`failed` 真机触发；`README`/`ARCHITECTURE` 之外的文档连带改动。
- 未提交、未 push、未打 tag、未 bump（版本由 V 组做）。

## 2026-11-15 — v0.9.2 准备中：B01/B02/B04 + 进度 Tab 脊椎/详情/连线（未提交、未 bump、未发布）

- **From:** 收尾组 agent-26 · **To:** lead / agent-27 / 后续代理 · **Base:** `main` = `4b92278`
  （v0.9.1 发布记录；`HEAD` 与 `origin/main` 同 sha）。工作树 dirty（本轮核数时；agent-27 的人话
  报告改动随后进入同一工作树，故这个数字会变）：**19 文件**
  （`src/` 4：`config.ts`/`index.ts`/`progress-tab.ts`/`client/index.js`；`test/` 3；
  `lib/` 12 个构建产物）+ 未跟踪 `test/progress-connector.spec.ts`、
  `docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`、`.tmp/`（测试用 TMPDIR）。
- **发布动作全部 HOLD（`CONFIRMED`，用户 2026-11-15 指令，经 lead 下达）**：不写 `CHANGELOG.md`、
  不 bump `package.json`/`package-lock.json`（仍 `0.9.1`）、不 commit、不 push、不打 tag、不动 Issue。
  原因：用户反馈 Round2 的 `05` 截图里报告太机器（`stat`/`od`/`sha256`/路径/marker 全贴给用户，
  非技术读者看不懂）——截图逐字内容与判定见 `VALIDATION.md` Round 39 §6。
  人话报告改动归 **agent-27**（写面：`src/answer.ts`、`src/report.ts`、
  `src/delivery/*`、`src/gate.ts` 调用点及其测试），收尾组不碰这四处；等 agent-27 回齐 + lead 验货
  后统一发版。要求的默认形态：只发 human 块 + 下一步，机器证据收进 Progress 详情 / 诊断开关。
- **B01（`CONFIRMED`）**：设置页超限横幅读**用户层**，不读钳制后的生效值。锚点
  `src/client/index.js:862`（注释与取值）、`:1444`（`describe()` 投影里把 `user` 层带出来）。
  理由：`describe()` 发布的是**生效值**，横幅若读它，用户存的 `8` 被钳成 `6` 后被显示成 `6`，
  等于替用户改口。测试：`test/config-limits-repair.spec.ts`
  `reads the stored user layer, not the clamped projected value (B01)`。
- **B02（`CONFIRMED`）**：全部数值硬上限收敛到**一张表** `LIMIT_CAPS`（`src/config.ts:53` 起，
  值一律读 `HARD_LIMITS`），schema 侧 `clampedLimit(field, min)` 与载入期 `repairLimitOverruns`
  共用同一张表：新增上限只加一行，两侧不再各写一个界。表内 10 个字段：`maxConcurrency`、
  `maxRetries`、`maxQueuedMessages`、`historyTurns`、`historyChars`、`maxTasks`、`timeoutMs`、
  `maxActiveRuns`、`maxActiveRunsTotal`、`recordLimit`。**不在表内是刻意的**：每路由
  `maxInFlight`（在链内判，界是 `HARD_LIMITS.routeInFlight`）与 `configVersion`（线上契约，
  不匹配必须拒载而非改写）。低于下限、非数字、程序化 `resolveConfig` 越界仍硬拒（R-06 不变）。
- **B04（`CONFIRMED`）**：钳制告警**每次载入一条**。两层钳制都只记账
  （`recordOverrun()`：schema 没有 logger；repair 跑在一个仍可能因别的缺陷抛错的读里），
  由 `src/index.ts` 的 `announceOverruns()` 用一个 set 按 `field:stored` 去重后统一 `logger.warn`；
  `repairLimitOverruns` 自己的 `warnings` 仍决定「确实修过」。旧写法的问题：那条读路径**每条消息**
  走一次，只要补丁还在超限就会每消息刷一条告警。
- **进度 Tab 三处（`CONFIRMED`，`src/progress-tab.ts` 与 `src/client/index.js` 双侧同构）**：
  - **脊椎整词绑定**：拉丁字母 token 只在**词边界**命中，CJK token 仍按子串（`规划` 在
    `任务 1 · 规划` 里就是词）。松匹配的三个真实误报：`ui` 读进 `build`、`tag` 读进
    `stage`/`target`、`sync` 读进 `async`——旧脊椎因此报出没人跑过的阶段。
  - **详情协调块**：`parseCoordinationBlock` 只认三种形态（`json`/`grok-coordination` 围栏、
    任意围栏里的 `LABEL: value` 七字段块、无围栏的同款标签块），糊散文一律不认；来源阶梯
    `stage-detail` → 子会话协调块 → `not-reported`，块内值标 `Source: child coordination block`，
    只有拿到原文才允许 `Copy coordination block`（否则保持 disabled）。
  - **连线填充 + 状态字形**：连线只在**左侧节点自己 `done`** 时填充（`data-filled="true"`，
    否则属性**缺席**而不是 `"false"`）；`failed`/`blocked` 故意留空——线是证据，不是装饰。
    节点环里一个状态字形；节点聚合多行时用**行数**替换字形（可核对的数字优先于符号）。
    钉住：新 spec `test/progress-connector.spec.ts`（7 例，直接渲染 `lib/client.js`，含
    `blocked` 派生节点与「两行→计数、单行→字形」）。
- **测试（`CONFIRMED`，`TMPDIR=$PWD/.tmp`）**：`npm run ci` → `tsc` **0 错**；`oxlint`
  **4 warning / 0 error**（4 条均为既有：`src/run.ts` 未用 `RoleName`、`src/redact.ts` 多余转义、
  `src/client/index.js` 的 `GROUPS_WITH_FIELDS` 与 `field`）；`npm run build` **幂等**——构建前后
  67 个 `lib` 产物 sha256 全等，client bundle **204585 B**，`cmp lib/client.js src/client/index.js`
  一致；全量 vitest **50 文件 / 934 测试 → 932 PASS / 2 FAIL**。
- **两条失败是基线既有（`CONFIRMED`，独立 worktree 对照）**：`git worktree add .dsh-home/baseline-wt
  4b92278` 后在同一 worktree 跑 `npx vitest run test/gate.spec.ts` → **2 failed | 53 passed**，与本轮
  工作树失败项相同：`refuses a message explicitly when the queue is full and never retries it on its
  own`（单跑也复现）与 `writes the answer into the session when the append strategy is selected`
  （全量跑复现、单跑偶过）。本轮未改 `src/gate.ts`。**既不写成「已修」，也不写成「产品 PASS」**：
  发版前由 agent-27 或用户决定是否连带处理。
- **真机证据（Round2，`CONFIRMED`）**：`docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`
  ——隔离 `dsh web` `127.0.0.1:3221`、`DSH_HOME=<repo>/.dsh-home/r2`、profile `gwprog2`（自 web 模板）、
  插件装**打包产物** `dsh-grok-workflow-0.9.1.tgz`（sha256 `ac51b89a…`）、模型走本机网关
  `127.0.0.1:18088`（`wb/cn:deepseek-v4.1-flash`）、headless Chromium 1440×900 / 480×900；
  **13 张 PNG** + 5 份 stage 日志 + `MANIFEST.sha256`；token 只经环境变量、收尾删日志与 envfile，
  目录内 token 形状字符串扫描 = 0。真机 `pending`/`doing`/`done`/`failed` 四态 `CONFIRMED`
  （`failed` 来自真实沙箱边界那一次运行，不是构造）；`blocked`/`cancelled` 本轮 `NOT_TRIGGERED`
  （不伪造，单测覆盖在 Round 38 记的 93 例里）。安装/加载/前台半边的证据仍是
  `docs/knowledge/evidence/verify-H1/`（`CONFIRMED`，含"关掉 `workflow-ptc` → pending"的对照）。
- **诚实边界**：`blocked`/`cancelled` 的真机补充 `NOT_RUN`；live `:3080`/`:3086`/`:3090` 未部署
  未重启（D-013）；版本号、节头、commit、push、tag、Issue 评论全部 HOLD，本段**不是发布记录**。

## 2026-11-15 — v0.9.2 收尾发版（本地已提交 `5eb4942`；push / tag / Issue 评论 HOLD）

- **From:** 收尾发版组 agent-30 · **To:** lead · **Base:** `main` = `4b92278`（`HEAD` = `origin/main`
  = v0.9.1 发布记录）。**本地提交 `5eb4942`**（release-prep：`src` 7 / `test` 9 / `lib` 40+ /
  `CHANGELOG.md` / `package.json` / `package-lock.json` / Round2 证据；72 文件 `+5135 −1021`）。
  记忆文件随本段之后的一个 docs 提交入库。**未 push、未打 tag、未发 GitHub Release、未动 Issue**
  （lead 2026-11-15 (B) 口径：等 human-only 真机复拍）。
- **内容（`CONFIRMED`，每条都有源码锚点）**：
  - **B01** — `src/client/index.js` 设置页超限横幅读**用户层**，不读钳制后的生效值（理由见 D-047）。
  - **B02** — `src/config.ts` `LIMIT_CAPS` 是唯一钳制表（10 个字段，界一律读 `HARD_LIMITS`），schema
    侧 `clampedLimit` 与载入期 `repairLimitOverruns` 共用同一张表。
  - **B04** — 两层钳制只记账，唯一发声点是 `src/index.ts` 的 `announceOverruns()`，按 `field:stored`
    去重，补丁仍超限时不再每条消息刷一条告警。
  - **进度 Tab** — `src/progress-tab.ts` 与 `src/client/index.js` 同构：脊椎拉丁 token 只在词边界命中
    （CJK 仍按子串）、详情七字段来源阶梯（`stage-detail` → 子会话协调块 → `not-reported`，只认三种
    显式块形态）、连线只在左侧节点自己 `done` 时填充、节点环一个状态字形（聚合多行换行数）。见 D-048。
  - **人话报告默认化**（agent-27；`src/answer.ts` + `src/delivery/index.ts`，调用点 `src/gate.ts`）——
    标记之间是人话块（中英双语），机器台账折到结束标记**之后**并有一行 `LEDGER_GUARD` 明说
    「这是内部上下文，不许引用」；`showDiagnostics` 打开时台账回到标记内；人话行剥掉机器细节
    （`MACHINE_DETAIL` 12 类：shell 命令、摘要/hex、路径、裸文件名、代码、relay 标记），整行都是
    机器细节的直接丢弃；失败原因保留措辞。台账仍随消息留存，供 Progress 详情与跨轮延续读回。
- **测试与构建（`CONFIRMED`，本机；证据见 VALIDATION Round 40）**：`npm run ci` → typecheck **0 错**；
  oxlint **5 warning / 0 error**（4 条既有 + `src/delivery/index.ts:264` 新增 1 条）；build client
  bundle **204585 B**；vitest **51 文件 / 948 测试全 PASS**；build 幂等（`lib/` 67 个产物 sha256
  前后全等）+ `cmp lib/client.js src/client/index.js` 一致。
- **两条 `test/gate.spec.ts` 同步修复（`CONFIRMED`，只动测试的等待条件，产品行为未变）**：队列满那条
  等的是「一条 relay follow-up」，而拒绝通知本身就满足它 → 在被受理的批次排空之前重发、又被同一个
  满队列拒绝；append 那条等「两条 session append」，而 run 自己的进度事件就满足它 → 断言早于
  `assistant/message` 落盘。两条在 `4b92278` 的独立 worktree 上同样失败（本机红、同一提交在 CI 的
  Node 22/24 绿 → 时序敏感，不是 CI 带红发版）。改法：分别等「拒绝通知 + 该 run 自己的答复」与
  `assistant/message`；单跑 **55/55**，全量 **948/948**。规则记入 D-051。
- **layerfs 借鉴结论（`CONFIRMED` = 只读评估；`NOT_RUN` = 移植与真机）**：agent-28（UI）与 agent-29
  （多 Agent）对 `/home/fish/projects_mine/layerfs`（本地检出 `87bd986`，UI = `dsh/packages`）做了
  **只读评估**：UI 8 条可借鉴 / 9 条不可搬，多 Agent 8 条可借鉴 / 7 条不可搬，逐条理由见 D-049。
  **本轮零用户可见落地**（进度 Tab 的 token 色 / 窄屏抽屉 / 百分比空态与交付层人话块都是 v0.9.0
  既有实现，不是照 layerfs 搬的），故 `CHANGELOG.md` 的 `[0.9.2]` **不写 layerfs 条目**。
- **放行的真实缺口（`NOT_RUN`）**：「human-only 默认形态」的**真机复拍**。仓库内最新真机证据止于
  11-15 12:09 的 `evidence/progress-tab-2026-11-15/Round2/`，全部是**人话默认化之前**的形态
  （`05-chat-with-run-report.png` 正是用户点名太机器的那张）。需补图清单见 VALIDATION Round 40 §6。
- **边界**：`v0.9.2` 目前只是本地提交——远端 `origin/main` 仍是 `4b92278`，没有 tag，因此没有 GitHub
  Release，Issue #1 无新评论；live `:3080`/`:3086`/`:3090` 未部署未重启（D-013）。


## 2026-11-15 — v0.9.2 已发布：push / CI / tag / Release / Issue #1 闭环

- **From:** 发版执行组 agent-38 · **To:** lead / 后续代理 · **Base:** `origin/main` = `4b92278`
  （= 上一版发布记录）→ 本轮推送后 `origin/main` = `98f26a8`。
- **结果（`CONFIRMED`，逐条可复核）**：
  - **push**：`git push origin main` → `4b92278..98f26a8`（fast-forward，**未 force**，exit 0）。
    两个提交：`4ab0cb3`（`.gitignore` 收 `.tmp/`）、`98f26a8`（人话默认形态真机证据落盘）。
  - **CI**：run `43698707930`，commit `98f26a8`，Node 22 + Node 24 **both success**（`gh run view`）。
  - **tag**：`git tag -a v0.9.2 5eb4942 -m "v0.9.2: plain-language answer by default, one clamp table,
    progress tab spine/detail/connector"` → `git push origin v0.9.2`（`* [new tag]`，exit 0）；
    `git merge-base --is-ancestor 5eb4942 origin/main` 通过。
  - **Release**：run `43698836519` success（tag ↔ `package.json` ↔ `CHANGELOG [0.9.2]` 校验、
    `lib/` 已提交且与构建一致、`npm test` 全绿）；GitHub Release published
    **2026-11-15T09:22:08Z**，asset `dsh-grok-workflow-0.9.2.tgz` **464,763 B**。
  - **旧 tag 复核**：`git ls-remote --tags origin` 前后对照 —— `v0.9.1` → `584dc22`（peel `9103280`）、
    `v0.9.0` → `936e625`、`v0.8.0` → `9c590f2` 及更早**全部未动**；新 `v0.9.2` → `38ef237`（peel `5eb4942`）。
  - **Issue #1**：状态评论
    [issuecomment-6892286461](https://github.com/free6589/dsh-grok-workflow/issues/1#issuecomment-6892286461)，
    `TEST_RESULTS: PASS`，模板 11 字段齐全。
- **证据落盘（`CONFIRMED`）**：`docs/knowledge/evidence/human-default-2026-11-15/`（8 PNG + stage 脚本/日志 +
  probes + `MANIFEST.sha256` 覆盖 85 个文件 + `lib/client.js`、`lib/progress-tab.js` 哈希；取自 agent-32
  的补拍，原名 `human-report-2026-11-15`，落盘时只改仪器脚本路径，结果 JSON/堆栈原文未改写，见 `LANDING.md`）。
- **`.tmp` 处置（`CONFIRMED`）**：按「可再生」判据整体清空（13 MB / 97 项：测试 checkpoints、隔离家
  `human-home`/`human-home-r2`、`npm pack` 产物、chromium 临时 profile、编译/npm 缓存、probe 日志），
  删前对两份 `.credentials.yaml`（各 161 B）做了布尔检查：只含 `client-connection/browser-session`
  一条记录，**provider key 标记 0 处**；`.gitignore` 增 `.tmp/`。副作用如实记录：证据 README 引用的
  `.tmp/r2-dump-booted.yml` 与打包 tgz 已随之删除（均可用文中命令重建）。
- **未做（`NOT_RUN`）**：live `:3080`/`:3086`/`:3090` 的部署与重启（D-013，用户动作）；证据集自陈的
  三项缺口（`showDiagnostics` 开态台账在答案里不可拍、完成行点开子会话未在本实例重拍、
  人话块后几轮仍漏 `od -c`/命令片段——见 VALIDATION Round 41 §2）。


## 2026-11-15 — 答案置顶 + 边聊边干（A/B/C 落地，未提交；`CONFIRMED` 代码 + 测试，`NOT_RUN` 真机）

- **基线**：`main` = `129a92e`（v0.9.2 已发布）。本轮工作树：`src/delivery/index.ts`、`src/script.ts`、
  `src/gate.ts`、`src/triage.ts` + 8 个测试文件 + `lib/` 构建产物 + `CHANGELOG.md[Unreleased]` +
  `docs/ARCHITECTURE.md` 策略段。
- **A（答案为本）**：`headline()`→`statusTail()`（计数只进尾巴），新增 `answerLead()`（summary
  首完整句→转述回落→绝不回落 ledger），`composeHuman()` 重排（答案→下一步→做成/没做成→caveats→尾巴），
  删除「关键证据：」逐字块；`MACHINE_DETAIL` 新增站号/坐标/Model链/计数施工句 4 类；`answerLead` 回落
  句自带 `核验通过` 被自家 MIDLINE 误杀→改「有一项已得出可用结论。」；`stripIds` 单字符 lookbehind
  无捕获组导致 `Task a：`→`Task $1`→修替换串为空。
- **S（synthesizer 硬约束）**：`synthesizerPrompt` + `layeredPolishPrompt` 追加 HARD RULES（中英各一）；
  `polishVerbatimSources` + `polishStyleVerdict` 宿主校验（首句状态行/机器 token/逐字引用/反引号/
  中英复读/标题列表/>200词），`polishGuardrail` 第 5 步；`layeredFallbackSummary` confirmed 段改转述；
  `layeredPolishPrompt` 旧「照抄加反引号」指示改为「转述不抄」（否则 prompt 与 guardrail 自相矛盾）。
- **B/C（边聊边干 + 首答现场写）**：`triage.ts` 新增 `firstAnswerPrompt`（四要素信息结构 + FORBIDDEN）/
  `sanitizeFirstAnswer` / `firstAnswerFallback`（明说模板兜底）/`FIRST_ANSWER_LIMITS`；`gate.ts` 新增
  `canBackgroundDeliver`（whenIdle+followup+session 三探针，失败回落）/`produceFirstAnswer`/
  `answerTeamInteractive`（首答 enter + 后台 enqueue runTeam + `record admitted-team-background`）；
  `instantReceipt` 固定句删除、函数作写入通道保留、语义改为「是否写首答行」（默认仍 true）。
- **测试（`CONFIRMED`）**：`npm run ci` → typecheck 0 错、oxlint **4 warning / 0 error**（基线 5，
  修掉 2 个自带 useless-escape，另 1 个基线 warning 被重写带走）、build 产物一致、
  vitest **51 文件 / 948 测试全 PASS**。29 个旧断言按新行为更新（delivery 4 套件、gate、
  gate-partial-head、triage、phase1-dialogue、synthesis-guardrails、human-output-contract）；
  另修 2 个实现 bug（`$1` 注入、`核验通过` 自杀）。
- **不变量（`CONFIRMED`）**：并发 3/6、重试 1/3、maxActiveRuns 2/4、Total 8/16、核验独立/证据链/
  fail-closed/脱敏/unload 取消、`humanSummary` on、`showDiagnostics` off、`/grok` 开关、mode 语义、
  `answerStrategy` 默认 `in-turn`、`full` 管线字节——全部保留，仅 delivery 渲染与 team 走法变更。
- **未做（`NOT_RUN`）**：真机 Web 长驻验证（首答现场措辞、进度节点、中断重定向）、headless e2e
  回归（`scripts/e2e-headless-in-turn.sh`）、commit/push（等用户指令）。

## 2026-11-16 — 进度 Tab A+C 落地（`CONFIRMED` 代码 + 单测 + 隔离真机；未提交）

- **From:** lead · **Base:** `129a92e`（v0.9.2）+ 未提交 A/B/C（33 文件）。
- **做了什么**：只改 `src/client/index.js`（i18n +8 key 中英、`PROGRESS_CSS` 脊/段/分支/成员卡/jump/legend、link 规则补回、`ProgressNode`→段渲染、`ProgressMemberCard` 新增、`ProgressView` 手风琴状态机 + 跳转 + 分支渲染 + 键盘 Enter/Esc/↑↓）+ `test/client.spec.ts`（scope 断言改脊 + `aria-expanded` 默认开段）+ `test/progress-connector.spec.ts`（meta 计数断言 + 手风琴 3 例新测）。折叠/百分比/blocked/事件契约/5 状态色/详情阶梯/子会话打开——一律未动。
- **实现期抓到的真 bug（`CONFIRMED`，真机复现）**：
  1. 段头 meta 被 seg-line 穿过 → seg-head 加背景 + z-index，line 置后。
  2. 运行中分支把其他段挤扁 → branch/members/li 加 max-width + overflow hidden，label 补回 min-width:0（补回时发现旧 label 规则被删，标题裸奔）。
  3. 我的 python 行号替换把 link 规则弄丢 → link 宽 0，补回。
  4. `label-inverse, #fff` 字面色被 lint 规则抓 → 改 `inherit` 回退（token 保留）。
- **验证（`CONFIRMED`）**：`npm run ci` → typecheck 0 错、lint 4w/0e、**51 文件 / 951 测试 PASS**（948+3 新）；隔离 profile `acgtest`（`:3225`，打包安装，md5 校验）真机：脊 7 段 / 单展开 / +N / jump / scrollW==innerW（宽+窄）/ 深色 token / 详情三段 / Open child session 真开 / Chat 回归；窄屏竖排 + 详情抽屉 fixed 生效。
- **未做（`NOT_RUN`）**：commit/push/tag/Release（等用户指令）；live 更新（禁重启，需用户定夺路径）。

## 2026-11-16 — v0.9.3 已发布：push / CI / tag / Release / Issue #1 闭环 + live 文件已换（未重启）

- **From:** lead · **Base:** `origin/main` = `593f89e`（release-prep）→ 本轮推送后 `origin/main` = `593f89e`（已是最新，无新提交）。
- **结果（`CONFIRMED`，逐条可复核）**：
  - **push**：`git push origin main` → `7a31218..593f89e`（fast-forward，未 force，exit 0）。两个提交：`7a31218`（A+C 实现 + A/B/C + 测试 + 记忆）与 `593f89e`（bump 0.9.3 + CHANGELOG 节头；`lib/` 构建幂等无变化）。
  - **CI**：run `43738470054`（commit `593f89e`），Node 22 + Node 24 **both success**（`gh run view`）。
  - **tag**：`git tag -a v0.9.3 593f89e` → `git push origin v0.9.3`（`* [new tag]`，exit 0）；`git merge-base --is-ancestor 593f89e origin/main` 通过。
  - **Release**：`v0.9.3` run success；GitHub Release published，asset `dsh-grok-workflow-0.9.3.tgz` **483122 B**（与本地 `npm pack` 同字节一致）。
  - **旧 tag 复核**：`git ls-remote --tags origin` 推前后对照 —— `v0.9.1` → `584dc22`（peel `9103280`）、`v0.9.2` → `38ef237`（peel `5eb4942`）**全部未动**；新 `v0.9.3` → `f63bb7c`（peel `593f89e`）。
- **tag 可用性（`CONFIRMED`）**：`gh release download v0.9.3` 得 tgz（483122 B），解包 `package.json` = `0.9.3`，`lib/client.js` 含脊规则 31 处，md5 `6a797b90…` 与仓库 `lib/client.js` **逐字节一致**。
- **live 安装（`CONFIRMED` 文件已换，生效待重启）**：`dsh plugin --profile web add file:…0.9.3.tgz`（danger-full-access 审批后执行，exit 0），live `web` profile 内包版本 `0.9.2 → 0.9.3`，`lib/client.js` md5 `6a797b90…` 与仓库一致。**进程未重启**（D-013 用户保留动作）：运行中实例仍跑旧模块，新脊/首答渲染在用户下次重启 DSH 后生效。`~/.dsh/profiles/web` 在本会话沙箱下只读，安装经审批提权执行，未读未写任何凭据。
- **杂散清理**：删 `?? .tmp-weather/`（12 项天气抓取产物，与任务无关，不在 `.gitignore` 内）。
- **隔离实例**：`acgtest/:3225`（四轮 bundle 复验用）在收尾时仍在听；验证结束即 kill + 删 `dsh-url.env`，保留 `.dsh-home/acg/shots/` 与驱动脚本作复现证据（`.dsh-home/` 已 gitignore，不入库）。

## 2026-11-16 — 补交步 A 落地（未提交；`npm run ci` 全绿 51/954）

- **From:** lead · **Base:** `01f86de`（v0.9.3 已发布，live 文件已换待重启）。
- **起因（`CONFIRMED`，落盘对证）**：用户 session `3c296b9a` 任务 4（东北部天气）首跑 seq=5 被标失败，
  但子会话 `2d7bd1e7`（60 行）显示 TinyFish 4 连挂后 worker 绕道 `web_fetch`+`curl` 把数据全拿到了
  （S06 25.9°C/97.2%/1.5kn/226°、24h 预报、2h 临报），只是**没调 `structured_output` 就
  `turn/end completed`**。插件侧 `callRole` 只拿到 null → format-error → attempt 失败 → 整轮重试
  （seq=8，118 行转录）重跑全部 curl。浪费的是一整轮 worker，不是数据。
- **做了什么**：`src/script.ts`（模板内）+ `src/report.ts` + `src/types.ts` + `test/failure-paths.spec.ts`。
  worker 循环在 `execution == null && attemptFailure.class === 'format-error' && !setup` 时，
  同 attempt 内追加一次 `resubmitPrompt` 的 `callRole`（禁重做已完成工作、只取还缺的、立刻交卷）；
  成功则填 execution、清失败、标 `resubmitted: true`，正常进 verifier；再缺则按原失败路径走重试。
  report 白名单透传 `resubmitted`，types 加可选字段。
- **诚实边界**：补交是**新 child**（engine 无续会话通道，`agent()` 契约已确认），无原会话记忆，
  工具调用省不了，只能省试错（prompt 禁 exploratory search + 直接给最短路径习惯）。
  传输/模型失败、setup 故障不触发补交；每次 attempt 最多补一次；核验严格性零动
  （`checkVerification` 未碰，无 structured 仍是什么都核验不了）。
- **验证**：`npm run ci` → typecheck 0 错、lint 4w/0e、51 文件 / 954 测试 PASS
  （951 + 补交 3 例：补交成功 verified 且 attempts=1/resubmitted 真；补交再缺记 format-error；
  传输失败不补交）。真机复验 `NOT_RUN`（逻辑纯单测覆盖 + 模板文本变更；发版前建议走一次 acgtest）。
- **没做**：B（失败行分类显示）用户没点，`NOT_RUN`；push/tag/Release（等用户指令）。

## 2026-11-17 — T4 测试迁移完成（未提交；全量 vitest 51/951 绿 + typecheck 干净）

- **From:** agent-5 (lead T4) · **Base:** `ae0c6d3`（v0.9.4），worktree 延续 T1/T2/T6 未提交改动。
- **做了什么（`CONFIRMED`）**：T4 schema 瘦身后的测试套件迁移。src 侧 T4 改动（8 键 schema、
  24 键 unknown-key 拒载、FIXED_* 固定值、in-turn 唯一投递、hybrid/append/relay 删除）已由
  同 worktree 协作完成；本轮修复测试侧 ~60 处语义漂移：
  - 恢复被批量 strip 误删的 `carryoverBounds({historyTurns, historyChars})`、
    `routeBudgetFor(config)` 预算窗（T6 修复）、report wire `maxRetries`、
    `engine-harness` 超时透传；
  - `checkpoint-schema/wiring` 按 T6 数值（并发默认 10/上限 100、重试 1/3）重写过期期望；
  - `human-output/delivery/gate/phase1` 按固定输出重写（human 恒开、ledger 恒折叠、
    in-turn enter 断言）；`plugin-lifecycle`/`phase1` deadline 测试改 fake timer
   （`FIXED_TIMEOUT_MS` 60min 不可实等）；`triage.spec` route helper 按 in-turn 改写
    （entered 首答 + background followup 拼接；首答 markers 非终局判据用 ledger 行区分）；
  - `settings.ts` `distinctive` 键 `switchOn`→`synthesis`（删键后 value 匹配失效的根因）。
- **验证**：`npx tsc -p tsconfig.json --noEmit` 0 错；`npx vitest run` **51 文件 / 951 测试全绿**
  （20.4s，串行跑；并行跑曾因 CPU 争用出现 flake，单跑即绿）。
  注意全量 951（vs 之前 954）是 sibling 改写增删用例后的净数，非回归。
- **没做**：commit/push（等 lead 指令）；`lib/` 构建产物未重编；真机 live 验证 `NOT_RUN`。

## 2026-11-17 — v0.10.0：真机验收（acgtest95 / :3231）→ push / tag / Release

- **From:** agent-25（verify_push_release）· **Base:** `3d9275a`（T1–T6 实现提交，本地未 push）
  → 发布准备提交 → push。
- **真机验收（`CONFIRMED`，细节见 VALIDATION Round 47）**：`DSH_HOME=<repo>/.dsh-home/acgv095`、
  新 profile `acgtest95`、新端口 `:3231`、宿主 `dsh 0.2.2-rc.3`、本地网关模型路由。
  `npm pack` → `dsh-grok-workflow-0.9.4.tgz`（472,958 B）安装成功，已装 `lib/client.js`
  md5 `d1e2df8c…` 与仓库一致；`--dump-config` 显示 grok-workflow 8 键 + `workflow-ptc`
  由 overlay 重新启用；`curl http://127.0.0.1:3231/` → 401（围栏）。
  浏览器真实加载：`dsh-grok-workflow/client.js` 被请求、无失败无 console error；Plugins 页
  出现 Grok workflow 行；设置页 = 开关/模式/五角色链（含 Supervisor）/两数字 + Save，
  `scrollW == innerW`。两次真实对话：三城介绍（4 subagents，7 段脊，3/3 100%）、
  三城天气（04:00 首答 7s、04:02 后台收尾「1/1 项任务已由独立检查核验」，
  台账 `archive.jsonl` = `run:eef1f4b7-…` completed / verified 1/1 / confirmed 6）。
- **已知缺口（`CONFIRMED` 现象，归因 `HYPOTHESIS`）**：两次运行的 Execute/Verify 段都渲染为
  `Not reported in the events`（`members=0`、`branches=0`），与台账/答案中的「已执行并核验」
  矛盾；`deriveTrack` 成员来自 `run.members.phase`，即成员事实未进该会话进度流。
  是否为 supervisor 插入或 in-turn 后台投递引入，**未定位**，未写进 Release notes。
- **验证（`CONFIRMED`）**：`npm run ci` → typecheck 0 错、oxlint 4w/0e、build 成功、
  vitest 51 文件 / 951 测试 PASS；`git status --porcelain lib/` 为空（提交产物 = 全新构建）。
- **发版动作（`CONFIRMED`）**：`package.json` + `package-lock.json` = `0.10.0`；
  `CHANGELOG` 插入 `## [0.10.0] - 2026-11-17`（`[Unreleased]` 保留为空节）；
  README（英/中）配置参考与闸门说明按 8 键与恒开门控重写，`docs/LOCAL-TESTING.md` 同步；
  push（fast-forward，无 force）→ tag `v0.10.0` → Release（工作流校验 tag ↔ package.json ↔
  CHANGELOG ↔ `lib/` 后建）。远端 SHA / CI / Release 结论见 HANDOFF 与 VALIDATION。
- **未做（`NOT_RUN`）**：live `web` profile（`:3080`）换装与重启（D-013 用户动作）；
  进度 Execute/Verify 成员渲染缺口的定位与修复。

### 2026-11-17 — v0.10.0 发布结果（`CONFIRMED`，逐条可复核）

- **push**：`git fetch origin` → `origin/main` = `ae0c6d3`（= 本地 base，`merge-base --is-ancestor`
  通过）→ `git push origin main` → `ae0c6d3..b2c4515  main -> main`（fast-forward，未 force，exit 0）。
- **CI**：run `43946211999`（`headSha` = `b2c4515`）→ `conclusion: success`，`Node 22` +
  `Node 24` 两个 job 均 success（`gh run view --json jobs`）。
- **tag**：`git tag -a v0.10.0 b2c4515` → `git push origin v0.10.0`（`* [new tag]`，exit 0）；
  `git merge-base --is-ancestor b2c4515 origin/main` 通过；远端 `v0.10.0` object
  `63c04aa` / peel `b2c4515`。
- **old tags**：推前快照 `.tmp/v095/tags-before.txt` 与推后 `git ls-remote --tags origin`
  对照（剔除 `v0.10.0`）**逐行相同** → `v0.9.4`（`8ca2c1a`/peel `ae0c6d3`）、`v0.9.3`、`v0.9.2`、
  `v0.9.1` 及更早全部未动。
- **Release**：run `43946446721` success（tag ↔ `package.json` ↔ `CHANGELOG [0.10.0]` ↔ 已提交
  `lib/` 四项校验 + `npm test` + `npm pack`）；GitHub Release `Grok Workflow for DSH v0.10.0`
  published **2026-11-16T20:08:07Z**，非 draft 非 prerelease，asset
  `dsh-grok-workflow-0.10.0.tgz` **472,274 B**。
- **asset 可核**：`gh release download v0.10.0` → 包内 `package.json` = `0.10.0`，
  包内 `lib/client.js` md5 `d1e2df8c…` 与仓库 `lib/client.js` **一致**。
- **Issue #1**：状态评论 [issuecomment-6927842856](https://github.com/free6589/dsh-grok-workflow/issues/1#issuecomment-6927842856)，
  `TEST_RESULTS: PASS`、`LOCAL_RUNTIME_VERIFIED: yes`，模板 11 字段齐全。
- **凭证边界**：全程未读写任何 key/token（`BIFROST_VIRTUAL_KEY` 只在环境里，仅做过布尔/长度检查）；
  隔离实例的访问 token 只留在 `.tmp/v095/url.txt`（`.tmp/` gitignore），收尾删除。

## 2026-11-18 — RSI round 14：续跑（repeat-run / loop）面落地 + `0.11.14` 发版（`CONFIRMED`）

- **主题**：四个 `loop*` 键自设置面落地起只被存储、没有被任何驱动读取。本轮把驱动写出来（`src/loop.ts`
  536 行、`src/loop-surface.ts` 350 行），并把它按发布纪律写进文档、版本与 CHANGELOG。
- **代码（`CONFIRMED`）**：一条循环 = Host Schedule 里**一条** `rrule` 持久任务（标题 `Loop heartbeat`、
  文案前缀 `[grok-workflow loop]`、目标 `session` = 本会话）。插件不自持 timer，只调
  `create`/`catalog`/`edit`。`open` 对任何已定义 actor 抛 `loop/user-only`（浏览器请求天然不带 actor，
  所以路由能开、工具不能）；`grok_loop` 只有 `status`/`close`；路由 `POST /grok-workflow/loop` 在组合
  自己的 `connection.requestRejection` 闸门之后；无 Schedule 服务 → `loop/unavailable`（503）。
  规则 = `DTSTART` + `FREQ=MINUTELY;INTERVAL=<分钟>;COUNT=<轮数>`；间隔下限
  `max(60, ceil(timeoutMs/60000), loopIntervalMin)`、封顶 10080；`close`/`stopAll`/`forgetSession`
  一律删行；一个会话重复 open 只刷新同一行（串行化，避免两行）。
- **配置面**：`CONFIG_KEYS` 9 → 13（`loopEnabled`/`loopMaxRounds`/`loopFailStreak`/`loopIntervalMin`），
  `HARD_LIMITS` 100/20/10080，默认 false/10/3/0，`LIMIT_CAPS` 参与存值 clamp 与载入期 repair。
- **文档**：README（中英）新增「Repeat runs (the loop heartbeat) / 自动接着跑（循环心跳）」一节——
  开关、参数、心跳行为、停的语义四块；表格里 `loopEnabled` 一行与表后段落改成可核对的说法
  （原句写「由输入框旁的开关打开和关闭」，而本仓库客户端**没有任何代码去调那条路由**，
  `grep -rn "grok-workflow/loop" src/` 只有 `src/loop.ts:56` 一处常量），并在「已知限制」加一条；
  `CHANGELOG.md` `## [0.11.14]` 双语；`docs/LOCAL-TESTING.md` 键数与压缩包名随 bump 同步。
- **决定**：`DECISIONS.md` **D-068** 记录操作者授权「先落 P4 续跑面、P3-01/P3-02 保持 OPEN」，
  并写清授权只覆盖顺序、不放宽任何质量门；**D-069** 记录续跑面的四项归属选择与「客户端暂无开关控件」
  这一现状。
- **验证（`CONFIRMED`）**：`npm run typecheck` exit 0；`npm run ci` exit 0 = lint 22 warnings / 0 errors、
  **60 文件 / 1081 测试 PASS**（`.rsi/evidence/round-014/ci.txt`，发布脚本那次；文档侧先跑的
  `pre-release-ci.txt` 是 60/1080，两者差 1 条路由用例）。新增测试：`test/loop.spec.ts` 27、`test/loop-surface.spec.ts` 14、
  `test/heartbeat-guard.spec.ts` 14；`test/client.spec.ts` 与 config/settings 相关用例扩展。
  上一轮基线 57/1022，本轮 +3 文件 / +59 测试，无删除、无 skip。
- **未验证（`NOT_RUN`）**：真机心跳投递（需要 Host 常驻与真实额度，本轮没有创建任何定时任务——
  与 D-066 一致）；真实 Web GUI 里点一个会 POST 那条路由的控件（客户端还没有这个控件）。
- **发版（`CONFIRMED`）**：commit `20eafea`、annotated tag `v0.11.14`（object `2a7b074`，peel =
  `20eafea`），`origin/main` = `20eafea`（`merge-base --is-ancestor` 通过），`git ls-remote --tags
  origin` 与本地 `git tag -l 'v*'` 同集合（40 个），旧标签逐个未动（`v0.11.13` object `bac26e3` /
  peel `7a79efb`），未 force-push。`package.json` + `package-lock.json` + 两份 README 的版本句/安装 pin/已发布
  列表 + `docs/LOCAL-TESTING.md` 压缩包名 = `0.11.14`；`CHANGELOG` 有 `## [0.11.14] - 2026-11-18`；
  一个提交 + annotated tag `v0.11.14`，未移动任何旧标签、未 force-push、未发布 npm。

## 2026-11-19 — RSI round 15：`v0.11.14` 发布事故收口 + `0.11.15`（`CONFIRMED`）

- **前提（`CONFIRMED`）**：主工作树 `git status --short --branch` = `## main...origin/main`、HEAD = `b0d6d10`，
  但树上有 21 个 tracked 改动 + 6 个未跟踪条目（另一个写入者正在做客户端开关与 `verify:lib`）。本轮**不碰**
  这些文件：发版在独立克隆 `.worktrees/release-015`（从本地仓 `--no-hardlinks` 克隆、`origin` 改回 GitHub）
  里做，基线 = `b0d6d10`；`npm ci` 后 `npm run build`，`git diff --stat -- lib/` 为空——即 `main` 的产物与
  它自己的源码一致，事故只在那个已发布的标签里。
- **事故复述（`CONFIRMED`）**：`v0.11.14` 标签提交 `20eafea` 的 `src/loop.ts` 有 12 处 `callSchedule`，
  提交里的 `lib/loop.js` 为 0；远端 CI run `44345615218` = failure，Release run `44345622700` 在
  `Verify committed build artifacts` 失败，其后步骤（含 `Create GitHub Release`）全部 skipped；
  `gh release view v0.11.14` = release not found（最新发布仍是 `v0.11.13`）。
- **决定**：`DECISIONS.md` **D-070** —— 四个备选（移动标签 / `workflow_dispatch` 重跑 / 手工
  `gh release create` / 从 `main` 打 patch）逐一写明并选第四个；授权范围 = 一次 patch 标签 + 既有工作流
  创建的 Release，不含 npm 发布、不含移动标签、不含修改发布门禁。
- **改动（`CONFIRMED`）**：`src/`、`test/` 零改动（`git diff --stat -- src/ test/` 为空），本版本是「同一份
  源码、正确的构建产物」；README 中英把测试数 `1022 / 57` 改成 `1081 / 60`，并在「已发布」一句后写明
  `v0.11.14` 不是发布版本、安装请固定 `v0.11.15`；`CHANGELOG.md` `## [0.11.15]` 双语；
  `package.json` / `package-lock.json` / 两份 README 的版本句与 pin / `docs/LOCAL-TESTING.md` 压缩包名
  随 `bump-version.py` 同步。
- **门禁（`CONFIRMED`）**：`npm run typecheck` exit 0；`npm run ci` exit 0 = **60 文件 / 1081 测试 PASS**、
  lint `Found 22 warnings and 0 errors`（`.rsi/evidence/round-015/pre-release-ci.txt`；发布脚本那次的
  `ci.txt` 由 ROUND 引用）。与 `v0.11.13` 基线 57 / 1022 相比 +3 文件 / +59 测试，无删除、无 skip。
- **发版**：`finish-round.py --round 15 --version 0.11.15 --resume` → 单次提交 → annotated tag `v0.11.15` →
  `push origin main` → `push origin v0.11.15`；未移动任何旧标签、未 force-push、未发布 npm。
- **未验证（`NOT_RUN`）**：npm 发布（未授权）；真机心跳投递（D-066，操作者动作）；主工作树里另一位写入者的
  客户端开关改动（不属于本轮，未提交、未审阅）。
- **落地（`CONFIRMED`）**：commit `50c0321`、annotated tag `v0.11.15`（object `e52a8f4`，peel
  `50c0321`），`origin/main` = 该提交；远端 CI run `44359410024` = success，Release run
  `44359422843` = success（16 步全绿，含 `Verify committed build artifacts` 与
  `Create GitHub Release`）；https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.11.15
  带资产 `dsh-grok-workflow-0.11.15.tgz`（523743 B）并标为 Latest。`npm run verify:lib` 在
  `50c0321` 上报 `141 files, byte-identical`（`.rsi/evidence/round-015/ci-committed.txt`）。
  首次 push 因远端在运行期间前进（`3c24f92` / `09d5daa`）被拒；发布提交 rebase 为 `50c0321`，
  从未推送过的本地标签删除后在 rebase 提交上重建，再推。旧标签逐个未动。


## 2026-11-19 — RSI round 16：续跑开关 + 心跳刹车落地（未发版，`CONFIRMED`）

- **前提（`CONFIRMED`）**：`HEAD` = `37cb0fc` = `origin/main`；开工时树上 46 条 dirty 条目
  （round 14 之后另一位写入者的客户端开关、`src/loop-brakes.ts`、`scripts/verify-lib.mjs` 等），
  全部其它代理已 `inactive`、`src/` 最后修改停在 07:35:02，本轮在**静止的树**上工作。开工指纹
  （sha256 前 16 位）`src/loop.ts 55483a52622f0f46`、`src/loop-surface.ts 6543545e5e3f6310`、
  `src/loop-brakes.ts 34f56e7095abf6cd`、`src/client/index.js d290765594d62a3b`、
  `src/gate.ts 332d23134642460c`、`src/config.ts c4d053572df36194`，收工前重算未变。
- **做了什么（`CONFIRMED`）**：把「有开关、能提前停」这两件事从**未提交的实现**变成**落地的提交**：
  ① `CHANGELOG.md` 的 `[Unreleased]` 补两条 Added（dock 开关、心跳刹车，双语）；
  ② `DECISIONS.md` 新增 **D-072**（开关放哪儿、不带数字、停=拒绝+删行、六道刹车的输入是既有事实、
  token 是预算不是计量、失败轮=没写出助手消息），并把 D-069「现状」段与 D-071 的过时一句指向 D-072；
  ③ `README`（中英）与 `docs/LOCAL-TESTING.md` 的 dock 开关说明此前已由并发写入者写好，本轮只核对与
  代码一致；④ 本文件、`VALIDATION.md`、`HANDOFF.md`、`.rsi/ROUND.md`、`.rsi/STATE.md` 记本轮。
- **代码归属（不是本轮新写，是本轮核对并落地）**：`src/client/index.js` 的 `startLoopSwitch`
  （`:3730-3743`，id `grok-workflow-loop`、order 90、`slots.inject` + `slots.register` 追加注册）、
  `LoopSwitch` 组件（`:3665-3718`）、文案键（`:260-262` 等）、路径常量 `:3527`；
  `src/loop-brakes.ts` 六道刹车与 `plugin:grok-workflow/loop-round` 记录（`:210`）；
  `src/gate.ts:1535-1575` 的挂载与 `loop-stop` 处理；`src/config.ts:388-399` 四键边界与 `:792-795` clamp。
- **门禁（`CONFIRMED`，命令与结果见 `VALIDATION.md` Round 62）**：`npm run typecheck` exit 0；
  `npx oxlint src test` = 22 warnings / 0 errors（107 文件）；`npm run build` = `client bundle: 224412 bytes`，
  构建前后 `lib/` 145 个文件 md5 清单完全相同（幂等，diff 为空）；`npx vitest run` =
  **62 文件 / 1139 测试 PASS**（24.21s）。与 `v0.11.15` 的 60/1081 相比 +2 文件 / +58 测试，无删除、无 skip。
- **未验证（`NOT_RUN`）**：真实 Web GUI 里点一次那个开关、真实心跳投递一次（需要常驻 Host 与真实
  profile，且 D-066 把第一跳定为操作者动作）；本轮没有创建、修改或删除任何 Schedule 任务。

## 2026-11-19 — RSI round 19：载入期路由校验补上 `supervisor`（`CONFIRMED`）

- **缺陷（`CONFIRMED`，修前探针）**：`src/settings.ts` 的 `ROLE_ORDER` 只有四个角色，
  `validateRoutes` 漏掉 `roles.supervisor`。错误 provider / 未宣告模型在 supervisor 上
  载入通过，跑到那个任务核验之后才失败；README/ARCHITECTURE 当时都写「每个配置的
  路由都校验」。探针：四角色各 1 条 error，supervisor 0 条。
- **改动**：`ROLE_ORDER` 补 `supervisor`（与 `src/report.ts` `ROLE_NAMES` 同序，注释写明
  它同时供两个循环使用）；`test/config.spec.ts` 新用例（五角色 × 三种配置）；
  `test/route-concurrency.spec.ts` 补 supervisor 的空 cap 提示 2 条；README 中英、`ARCHITECTURE`、
  `DECISIONS` D-075、`VALIDATION` Round 64。
- **门禁（`CONFIRMED`）**：修前 `npm run ci` 63/1154 → 只 stash 源码时 2 failed / 49 passed
  → 恢复后 51 passed → 全量 `npm run ci` exit 0，**63 文件 / 1155 测试 PASS**，oxlint 22
  warnings / 0 errors，`npm run build` 两次产物一致（`client bundle: 224525 bytes`）。
- **未验证（`NOT_RUN`）**：在真实 profile 的 patch 里放错 supervisor 路由看装载被拒（操作者
  环境，本轮不碰）；真模型整轮。
- **迁移**：supervisor 链指向未注册 provider 的 profile 现在装载失败 → 改为已注册 provider /
  已宣告模型，或只把该路由的 `provider` 留空（视为继承 run 的 provider）；**不要**删整条
  链（空链 = 监督门不跑，`src/script.ts:1945`）。

## 2026-11-19 — RSI round 21：C1 跨 run 路由提示补上 `supervisor`；脏树清理与遗留文件归位（`CONFIRMED`）

- **缺陷（`CONFIRMED`）**：`src/run.ts` 的 `configRouteLabels()` 只摊平
  `planner/worker/verifier/synthesizer` 四个角色。有 `roles.supervisor` 链的 run，其
  supervisor 路由从不进入 C1 跨 run 忙闲快照，于是另一个 run 打满的 supervisor 通道对下一次
  run 不可见，不会先避让。这是 round 19（`settings.ts` `ROLE_ORDER`）、round 20（诊断台账）
  同一遗漏类的第三处。
- **改动**：`src/run.ts` 角色元组四改五（`planner, worker, verifier, supervisor,
  synthesizer`，即 `src/report.ts` `ROLE_NAMES` / `src/settings.ts` `ROLE_ORDER` 的顺序）；
  `test/route-concurrency.spec.ts` 新增五角色标签列表用例；`CHANGELOG.md` `[Unreleased]`
  双语 Fixed 一条；`lib/` 由 `npm run build` 重建。版本号未动（开发提交，不发版）。
- **红→绿（`CONFIRMED`）**：仅加用例时该文件 **1 failed / 14 passed**（实收缺
  `"sup/watcher"`，`.rsi/evidence/round-021/red-spec-run.txt`）；补上角色后 **15 passed**
  （`green-spec-run.txt`）。
- **门禁（`CONFIRMED`）**：`npm run typecheck` exit 0；`npm run ci` exit 0，**63 文件 /
  1157 测试 PASS**，oxlint 22 warnings / 0 errors；`npm run build` 连跑逐字节一致
  （`client bundle: 224525 bytes`）；`npm run verify:lib` = `lib/ at 3cd68eb is the build of
  src/ at 3cd68eb`（149 files byte-identical）。证据 `.rsi/evidence/round-021/`。
- **来源**：改动与红/绿证据由并发写入者在 17:04:54–17:05:02 留下、未提交；本次清理任务核实
  后落地为 `3cd68eb`（未 push、未打 tag、未建 Release）。
- **脏树与遗留文件处置（`CONFIRMED`）**：`M src/run.ts`、`M test/route-concurrency.spec.ts`、
  `M CHANGELOG.md`、`M lib/run.*`、`?? .rsi/evidence/round-021/` 全部有价值 → 已提交。
  根目录遗留的 `settings-simple-mock.html`（179 行，sha256 `3fe1e657…`，D-055 的设计输入）
  逐字节存到 `.rsi/archive/settings-simple-mock.html`，来源与还原命令见
  `.rsi/archive/README.md`，根目录副本已删除；`.rsi/` 不在 `package.json` `files` 内，不会随包发布。
  「允许未跟踪文件」白名单就此作废（原为 `settings-simple-mock.html`）。
- **未验证（`NOT_RUN`）**：两个真实并发 run 的避让行为（提示只在脚本侧降权）；GUI 观感。
- **受保护对象（`CONFIRMED`）**：`package.json`、`package-lock.json` 未改（sha256 与开工一致）；
  `CHANGELOG.md` 只增 `[Unreleased]` 段；`lib/` 只经 `npm run build` 重建；`.git` 与
  `v0.11.14`–`v0.11.19` 等已发布 tag 及其 peel 未动；无 force-push、无新 tag、不发布 npm。

## 2026-11-19 — `/grok on` 之后发不出消息：会话级 full 改走后台受理（`CONFIRMED`，未提交）

- **缺陷**：`/grok on` 写 `workflowMode: 'full'`（`src/command.ts:142`），`full` 是唯一
  绕过交互式受理的形态（`answerTeamInteractive` 只接 `triage`，`src/gate.ts:1281`），于是
  落到 `await produceAnswer(...)`（修前 `src/gate.ts:1458`，现 `:1550`）：`in-turn` 把整步
  开着等 workflow 跑完，而 `AgentLoop` 只在 step 结算后才 claim 下一批
  （`dsh-agent-loop/lib/index.js:683` `inbox.claim`，`turn()` 的 `while` 在 `:752`、`step` 在 `:780`），
  这段时间（默认 60 分钟，`src/config.ts:104`）用户发的消息全部只进队列、永不派发 ——
  用户原话「`/grok on` 就无法发消息，`/grok off` 就可以」。
- **修复**：`src/gate.ts` 新增 `answerFullBehind`（`:1386`，条件 `:1398` = 会话记录
  `workflowMode === 'full'` + 可后台交付）：先回执 `acceptedEnterText`（`src/answer.ts:182`）
  再后台 `runTeam` + `deliverAndRecord`；部署级默认 `mode:'full'` 保持 T4 `in-turn` 不变。
- **证据**：`test/grok-on-ingress.spec.ts`（5 例，修前 3 failed → 修后 5 passed；修前的数
  据由 `HEAD` worktree 独立复跑，见 `docs/knowledge/evidence/grok-on-ingress-2026-11-19/repro-before-head-worktree.log`）。
  `npm run ci` 两处跑绿：共享工作树 exit 0 = **67 文件 / 1218 测试**
  （24 warnings / 0 errors，`verify:lib` byte-identical，`shared-tree-ci-green.log`）；
  「`HEAD` + 只本修复」隔离树 exit 0 = 64 文件 / 1164 测试（`ci-isolated-fix-only.log`）。
  同日更早几次共享树是红的，红点全在并发写入者的半成品（设置页语法错、`test/client.spec.ts`
  的 `TS2304`、配置面 5 文件），与本修复无关。
- **未做**：真机 GUI 连发两条（`NOT_RUN`，本树有并发写入者，留给收尾组）；commit/push/发版未授权。

## 2026-11-20 — `/compact` 修复在「全新 DSH profile」里的端到端验收（`CONFIRMED`）

- **前提（`CONFIRMED`）**：`HEAD` = `366d169`（0.12.13）；本机 `dsh --version` = `0.2.2-rc.3`，
  Node 26.8.1。工作树里 `src/checkpoint/schema.ts`、`src/delivery/index.ts`、
  `test/delivery-human-block.spec.ts`、`CHANGELOG.md` 是并发写入者的未提交改动，本轮
  **没有**提交它们；测试在 `.tmp/verify-head`（`366d169` 的干净 worktree，`node_modules` 软链）
  里跑，避开这些半成品。
- **做了什么（`CONFIRMED`）**：新建 `compactfix-verify`（`sdk` 模板 + 一次性 `DSH_HOME`
  `.tmp/e2e-home`），`dsh plugin add` 把本检出装成 bundle 行；用
  `.rsi/evidence/compact-e2e/drive.mjs` 起一个本地 OpenAI-completions 桩模型（唯一 mock 边界），
  经 SDK 的 `session/query` 发一条团队档消息（真实 `agent/pre-step` 闸门 → 真实 workflow 引擎），
  再发真实 `/compact`。两次运行都 exit 0：`Compacted 7 history items (~6140 tokens).`，
  日志里 0 条越界 `assistant/message`。激活不是推断：`request/header.tools` 含
  `grok_workflow`，且出现 `tool-workflow/run-start|agent-start|agent-end`。
- **门禁（`CONFIRMED`）**：`npm run ci` 在 `366d169` 干净 worktree exit 0 —— typecheck 0、
  oxlint 24 warnings / 0 errors、`lib/ at 366d169 … (153 files, byte-identical)`、
  **70 文件 / 1269 测试 PASS**；`npx vitest run test/compact-step-pairing.spec.ts` 6 passed；
  `node scripts/repro-compact.mjs` exit 0（writer `refused`，`/compact` success）。
- **对照（`CONFIRMED`）**：pre-fix 构建（`39eda66`）的 `headless` profile 跑同一条消息，
  日志里留下越界行 `session-01125c86-…` seq 40、`session-d86b5415-…` seq 25
  （`source=workflow-notice`）——正是计量器拒绝的那一类；修复后的 fresh-profile 运行没有。
  修复构建的 `headless` 同形跑法同样 0 条越界行（`session-abeab5ac-…`，26 事件，
  `headless-after-journal.txt`）；该次没走到通知写入点，故「拒绝写入」本身仍由
  `test/compact-step-pairing.spec.ts` 证明。
- **未验证 / `BLOCKED`**：想用 SDK `session/resume` 把那条 pre-fix 日志直接喂给 `/compact`，
  被拒：`SessionFormatError: system/message requires a protected first surface head`
  （headless 会话格式与 SDK 读取器不兼容）。因此「命令层 before/after」仍以
  `scripts/repro-compact.mjs` 为准，不是 profile 重放。
- **边界**：修复只防新增越界行，**不修复**已经写坏的历史会话（无迁移，未声称有）；
  `grokDefault` 必须为 `on`，否则闸门 `pass: mode-off`（首次尝试即如此，工具已注册但消息没被接管）。


## 2026-11-21 — profile 克隆 + 新 profile 专项测试（`CONFIRMED`，未发版）

- **做了什么（`CONFIRMED`）**：新增 `scripts/clone-profile.mjs`，把当前 `web` profile
  克隆到一次性 `DSH_HOME`（`.tmp/profile-clone/dsh-home`，gitignored），profile 名
  `web-clone`；在该克隆里做专项测试并修复复现出的两处问题。逐条证据见
  `.rsi/evidence/profile-clone/README.md`。
- **复现缺陷 1（`CONFIRMED`）**：`cp -a` 手工复制出的 profile 不解析。`node_modules/dsh-system-prompt-design`
  与 `dsh-token-usage` 是指向 `../../../../projects_mine/…` 的相对符号链接，只从
  `~/.dsh/profiles/web/` 深度成立。后果不是降级而是硬失败：
  `DSH_HOME=<clone> dsh plugin --profile web-clone list` **exit 1**
  （`cannot resolve profile bundle "dsh-system-prompt-design"`），
  `dsh --profile web-clone --dump-config` 静默 `skipping profile bundle` 1 条。
  修复后同一命令 exit 0、`15 packages`、skipping 0 条。
- **复现缺陷 2（`CONFIRMED`）**：`~/.dsh/profiles/web/cordis.patch.yml` 第 378 行
  `channelSecrets` 下是一条 `sk-` 开头的真实渠道密钥（`sk-` + 39 字符）。逐字节复制等于
  把活凭据再复制一份到没人审计的目录。脚本对 profile 自有文件就地脱敏（占位符
  `sk-REDACTED-BY-CLONE-PROFILE`），报告只记「文件 + 行号 + 模式名」，并以
  `redact(source) == target` 逐字节证明 5/5 parity。`node_modules` 内的 4 处命中属依赖自带
  测试样例，标 `vendored` 不动（改写依赖内容会破坏包完整性）。
- **实测（`CONFIRMED`）**：克隆 `7422` 文件 / `85582807` 字节；链接 7 条，relink 2 条，
  源里本来就悬空 3 条（`node_modules/git`、`.bin/openwrite-*`）按继承上报而非克隆损伤；
  依赖 15 条 0 未解析；20 条 bundle 行中 8 条由 DSH 安装体解析。克隆内 web app 起得来：
  `dsh web: http://127.0.0.1:32997/`，UI `http_code=200 bytes=45259`
  （`<title>DeepSeek Harness</title>`），`__DSH_BOOT__.entries` 88 条且含
  `dsh-grok-workflow`，其 `client.js&rev=5ed443a5559d` 经该服务器取到 `200 / 237809` 字节。
- **门禁（`CONFIRMED`）**：新增 `test/profile-clone.spec.ts` 6 例全绿（`npx vitest run
  test/profile-clone.spec.ts`）；`npm run ci` 本树 exit 0 = **73 文件 / 1350 测试**，
  oxlint 0 errors，`verify:lib` byte-identical。
- **沙箱边界（`CONFIRMED`）**：本会话 `~/.dsh` 只读，故源 profile 的 `--dump-config`
  无法执行（`EROFS … /home/fish/.dsh/profiles/web/cordis.yml`，`--dump-config` 会重写
  `cordis.yml`），parity 因此以 5 个界定文件的 sha256 为准；克隆里的机器级 MCP
  （serena / phone-use）在沙箱内写外部路径被拒，用 home 级 patch
  `.rsi/evidence/profile-clone/home-patch.sandbox.yml` 关掉后 boot 日志零 traceback。
- **未做（`NOT_RUN`）**：未 push、未建 GitHub Release、未改仓库可见性；`v0.12.18` 是本地
  milestone tag（`package.json` 仍是 0.12.16），推它会因 tag≠package 版本被 Release 工作流
  拦下（fail-closed，按设计）。

- **追加（`CONFIRMED`）**：专项测试期间第三处复现——`test/iterate-plan.spec.ts` 的守卫用例在
  仓库文档化的 `TMPDIR=$PWD/.tmp` 跑法下，只要本树有未提交改动就 `expected 10 to be +0`
  （`fixtureRepo()` 没 `git init`，守卫的 `git -C` 往上找到本检出）。已在 `fixtureRepo()` 里
  `git init -q` 修复：修前 1 failed/20 passed → 修后 21 passed（两种 TMPDIR 都是）。
  `npm run ci` 复跑 exit 0 = **73 文件 / 1350 测试**。

Last updated: 2026-11-22 08:33 +08:00（**已发版 `0.13.1`：动态转向全量 Wave 0–4 + Node 22 超时测试修复** —
`14156a6`（0.13.0 内容：Wave 0 薄语义设计、Wave 1 显示层四小版、Wave 2 运行时三件套、Wave 3 DAG、Wave 4 合流验收）因 Node 22 CI 失败未发布；
`8357423` 修测试（hung child 30 s backstop，不改逻辑）；`b5c1af0` 发版 0.13.1。远端 CI `44967040278` success、
Release `44967043122` success、`v0.13.1` 已发布。本地 `npm run ci`：78 文件 / 1449 测试 PASS（Node 26 + Node 22 双验），
`verify:lib` 169 文件逐字节一致。`v0.13.0` tag 留在原提交不动（immutable，未发布成功也不复用）。）

Last updated: 2026-11-22 16:10 +08:00（**已发版 `0.13.9`：Guardian 非破坏式恢复 + observe 折叠修复，`CONFIRMED`** —
远端本就领先（PR #47，guardian 不再打断子代理/不取消整轮）；本地 `main` = `origin/main` = `418a4a9`，
旧 `v0.13.9` tag 因 Release 校验失败已被删（RELEASING 有恢复记录）。本轮抓到 PR #47 改漏：
`src/progress-tab.ts` 纯折叠把 `observe` 误标成 `cancel-run`（bundle 侧已对，纯侧没跟）。
发版提交 `c93b2bf`（8 文件：src+2 测试+CHANGELOG 0.13.9 并入 observe 条+`lib/` 重建）已推；
annotated tag `v0.13.9` 已推；远端 CI `45001378298` success、Release `45001393005` success 并已发布。
本地 `npm run ci` exit 0（78 文件 / 1484 测试）。`web` profile 仍是 `v0.13.8`（沙箱只读装不上，待宿主执行安装命令）。）

Last updated: 2026-11-22 17:00 +08:00（**`v0.13.9` 已装进 `web` profile 并实测，`CONFIRMED`** —
安装失败根因是 `/tmp` 的 `usrquota` 配额（git 连 `init` 写几 KB 都 `EDQUOT`，同盘 `/home` 写 500MB 一次成功），
不是 `/home` 空间不足；`allowBuilds` 提示是 dsh 无条件打印的通用话术，本插件无构建脚本、tag 树自带 `lib/`，
**不用加**。按用户批准删 `/tmp` 旧验证目录+ISO（sup37/sup37b/sv-isolate/v32/p6verify/a2p-deploy/
alpine ISO/lobster-verify-target/gateway-backup-3065/opencode，约 4G），`/tmp` 81%→50%，
git fetch 恢复。`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.9` exit 0：
装机 `0.13.9`（lock tarball `c93b2bf`），`lib/` 与仓库逐字节一致。dsh 未重启，运行中实例下次 boot 生效。
子代理双审：agent-4 三侧一致性干净（observe/rescue/cancel-run 对齐，历史 cancel-run 显示正确，
`cancelled===true` 均为历史兼容展示分支；附带低严重观察：`src/run.ts` rescue executor `catch` 后
`throw` 与"Never throws"注释不符，v0.13.8 即有，后轮再动）；
agent-3 隔离 profile 实测（Loader 注册工具+prompt、settings 投影 14 字段、gate off放行/on接管、
web 模板 boot 无 pending、observe fold 定向 PASS）。本地无源码改动、无需发版。scratch profile 与
`.tmp/dsh-gw-verify` 已清。详情见 D-101。）


Last updated: 2026-11-23 09:10 +08:00（**手工清单 12 项顺序执行（第 1 轮）/ RSI 顺序跑批，`CONFIRMED`** —
源文件 `manual-sessions-unfinished.md`（工作区根，未纳入版本库）：第二节 7 件 + 第三节 5 件，严格按顺序、
一项一分支、合前 `npm run ci` 必须 exit 0。本轮开工前先把 `main`（`e4e03e9`，0.13.18）整树跑了一遍
`npm run ci`：85 文件 / 1617 测试 PASS，exit 0 —— 这就是「前轮已合项」的绿灯基线（日志 `.rsi/evidence/rsi-seq-12/logs/ci-baseline-main.log`）。
**已合（前轮）4 项复验通过**：Sec.2-1 `DEFAULT_TIMEOUT_MS = 0`（`src/config.ts:113`，`test/timeout-config.spec.ts:119`
断言 `resolveConfig({}).timeoutMs === 0`）；Sec.2-4 设置页版本/升级入口（`test/update-entry.spec.ts` 4 例）；
Sec.2-5 进度页不再有「回答」格（`PROGRESS_STAGES` 只有 start/plan/execute/verify/synthesize/end，源码注释明写
"no `回答` event can ever reach this track"）；Sec.2-6 续跑接线（`RESUME_DECISION_WIRING.wired = true`，
`src/checkpoint/wiring.ts:221`，生产入口在 `wiring.ts:485` 调 `resumeDecision`）；Sec.2-2 replan 可见开关
（`src/client/index.js` 的 `loop` 组布尔键 + 设置页行，默认仍 false）。**本轮新合 2 项**：
Sec.2-3 405 路由（merge `5dc0512`，分支 `rsi/sec2-03-mode-get`）、Sec.3-1 进度页连线合并成一根
（merge `adc7fb4`，分支 `rsi/sec3-01-single-rail`），两项各自 ci exit 0，合完 `main` 再跑一次 exit 0（85/1623 PASS）。
**跳过 6 项并记账**：Sec.2-7 宿主证据收集（源文件自己要求「先确认这一阶段还要不要做」，是拍板项而非实现项，
见 D-111）；Sec.3-2/3/4/5 四项源文件都写明「是否成立要重新确认 / 要你再验一次 / 你定」（见 D-111 与分歧日志）。
两条 `rsi/*` 分支已合入 `main`，未 push（本地 `main` 领先 `origin/main` 2 个 merge 提交）。）

Last updated: 2026-11-23 10:20 +08:00（**手工清单 12 项顺序执行（第 2 轮）/ RSI 顺序跑批，`CONFIRMED`** —
源文件 `manual-sessions-unfinished.md`（工作区根，未纳入版本库）。本轮与第 1 轮不同的是**每一项都有自己的分支**：
十二项各自从合完的 `main` 尖端开分支、跑 `npm run ci` exit 0、再合回 `main`，逐项日志在
`.rsi/evidence/rsi-seq-12/logs/ci-r2-*.log`。
**本轮新实现**：Sec.2-2 replan 默认打开（`f996cc8`，合 `28c0dd2`）；Sec.2-3 405 补 `Allow: GET, POST`
（`be6abed`，合 `994f71e`）；Sec.2-4 升级卡直接给「要不要升级」的结论（`81f6c5a`，合 `1d5ef41`）；
Sec.3-2 `switchOnRateLimit` 429 勾选框（`7305f17`，合 `cd88e4b`）；Sec.3-3 汇总门判定进报告
`synthesis.review` + `Summary review:` 行（`b225446`，合 `504bcf3`）。
**代码已在、本轮补钉子**：Sec.2-1 宿主工具死线 + 双 README 默认值（`22ab037`，合 `a3f57c5`）；
Sec.2-5 设计文档六段脊椎 + 守卫（`ae72f7d`，合 `8531ac1`）；Sec.2-6 `resumeCarryover` 抽取+用例
（`2cfe4be`，合 `c7df2ce`）；Sec.3-1 单轨连线文档（`0f9f2e3`，合 `96ad5f2`）。
**记账**：Sec.2-7 `BLOCKED`（D-112，第一刀设计已写）；Sec.3-4 证据+操作规程（判定 `NOT_RUN`，只有人能判，
`d947a92`，合 `23820e2`）；Sec.3-5 范围结论（不在本仓库，`943bb86`，合 `a68a372`）。
**ci 计数**：baseline 1623 → 本轮末 1633（12 次逐项绿 + 末次合并树绿）。未发版、未打 tag、未 push。
分支 12 条保留供复核，判定删除日期 2026-11-24。分歧 9 条见 `.rsi/evidence/rsi-seq-12/ROUND2.md` §5。）

<!-- Carried over from branch `team-dispatch-v1` by its rebase onto main: the text below is that branch's own record of the work. Where it says "未发版" / "NOT_RUN" it describes the tree it was written in, not main; the rebased branch ran the full gate — see the `team-dispatch-v1` rebase entry at the top of this file. -->

Last updated: 2026-11-23 08:16 +08:00（**任务板持久化加固，未发版，`CONFIRMED`** —
`src/taskboard/` 的 CAS 改为对着磁盘校验：每次改动在独占锁文件内「重读→按磁盘版本比较交换→落盘」，修掉旧实现按内存
整份重写导致的同任务双认领与跨行丢更新。新增 `src/taskboard/paths.ts`（`taskboardDir`/`taskboardFile`/
`openDefaultTaskboard` 三级解析，落盘位置写进 `docs/ARCHITECTURE.md`）。新增真实崩溃恢复用例：SIGKILL 子进程、
持锁进程被杀后锁按 5 s 失效窗口清掉、撕裂账本拒读、中断写 tmp inert、跨重启 id 唯一与 CAS 守卫。任务板套件
23 例连跑 3 次 PASS；模块范围 typecheck exit 0；`lib/taskboard/*` 已重建（含 `paths.*`）。全仓 `npm run ci` /
`verify:lib` **NOT_RUN**：本 worktree 被并行 lane 占用，其 `src/dispatcher`/`src/handoff`/`src/report`/`src/delivery`
编辑中途（`tsc --noEmit` 在这些文件红），门禁需等其落地后整仓重跑。行为变更：旧竞态用例"两个写者都成功"改为
"恰好一个赢家"。主链 plan → execute → verify → retry → synthesize 未动。）

Last updated: 2026-11-24 17:22 +08:00（**0.13.31 已发布：任务板持久化加固随 `team-dispatch-v1` 合入 `main` 并发版，`CONFIRMED`** —
`team-dispatch-v1` 以 `--no-ff` 合入（merge `dc69c6e`，无冲突），发版提交 `d0c1383`，注解标签 `v0.13.31`（标签对象
`c8339cf` → 剥皮 `d0c1383`）。`CHANGELOG.md` 里那条被 rebase 追到文件末尾的 staging 块（`## Task board durability - 2026-11-23 …`）
整块剪出、升格成 `## [0.13.31] - 2026-11-24`，落在 `## [Unreleased]`（第 6 行）之后、`## [0.13.30]`（第 48 行）之前；条目原文
一字未改，只挪位置，`## [Unreleased]` 仍保留且为空。对基线 `369d6e3` 的 `CHANGELOG.md` 差分是 **40 增 / 0 删**——已发布历史
一个字符都没动。本次只发两个增量：认领锁 + 磁盘 CAS（`df89a95`）、到达顺序 + 全路径寻址（`4f25f15`）。
本地门禁在发版提交 `d0c1383` 上 `npm run ci` **EXIT=0**：oxlint **36 warnings / 0 errors**、`verify:lib` **241 文件逐字节一致**、
vitest **100 files / 1866 tests PASS**。远端 CI `45363402329` **success**（2m21s）、Release `45363426210` **success**（2m39s），
GitHub Release `Grok Workflow for DSH v0.13.31` 带 `dsh-grok-workflow-0.13.31.tgz`（928474 B）。跨进程证据：`main` 已发布
`lib/` 起 12 进程各认领各一行连跑 3 次 → 12/12 报成功但盘上只活 5 / 6 / 7 行；合入后 3 次 → 12/12 全活。按操作员红线「不碰 live」，
`~/.dsh` 一行未动、未升级未重载未重启，AGENTS §11 自动升级**故意跳过**；live profile 现装哪一版**未核对**。）

补记（2026-11-24 17:24，`CONFIRMED`，**只读探针**）：上面写的「live profile 现装哪一版未核对」已被一次只读检查替掉——
`~/.dsh` 目录 mtime 仍是 **2026-11-22 23:40:20**（本轮任何时刻都不等于今天），live 的 `web` profile 里
`node_modules/dsh-grok-workflow/package.json` 读到 **`0.13.29`**（另有四个历史验证 profile 分别停在 0.12.9 / 0.8.0 / 0.8.0 / 0.12.19）。
也就是说 `0.13.30` 与 `0.13.31` 都没有装进 live——§11 自动升级在上一轮同样没有执行、本轮按红线继续跳过。没有任何写入、重载或重启。

Last updated: 2026-11-24 18:30 +08:00（**设置页升级按钮做出来了：一次点击在隔离 profile 里真装上最新发布版，`CONFIRMED`，未发版** —
分支 `feat/update-button`（自 `main` `c6a3611` 开），一个功能提交 `c951dbf`「feat(update): a working upgrade button on the
settings page」。**宿主**：新增 `src/update-surface.ts`（`GET|POST /grok-workflow/update`），挂载形状照抄 `src/mode-surface.ts`
（`inject(['webServer','connection'])`、注册进 `child.effect`、信任闸走 `connection.requestRejection`、`handleUpdateRoute`
当测试缝）；装什么只在宿主侧拼（`github:free6589/dsh-grok-workflow#vX.Y.Z`），浏览器带 `spec` 一律拒，tag 必须匹配严格
`vX.Y.Z`、必须在本仓库真发布过的标签清单里、必须严格新于已装版本；写盘用 `installBundle(spec,{saveExact:true,expected})`，
回执里的 `to` 是读回来的版本，失败或装歪回滚到装前 spec 并只说第二次读盘能证明的事。**客户端**：`UpdateCard` 四相
（`check`/`installing`/`latest`/`failed`）以 `data-gw-update-phase` 渲染，挂载不发任何请求、一次点击一次 POST、页面永不
reload（只说「刷新页面新版本才生效」）。**门禁**：`npm run ci` 在 `c951dbf` 上 **EXIT=0** — oxlint 36 warnings / 0 errors、
`verify:lib` 245 文件逐字节一致、vitest **101 文件 / 1910 测试 PASS**（含 `test/update-surface.spec.ts` 29 例、
`test/update-entry.spec.ts` 20 例）；对 `v0.13.31` 的 100 文件 / 1866 测试基线是 **+1 文件 / +44 测试**。**真机 soak**（隔离
fork 的 live `web` profile，真 Chromium，真 GitHub fetch + 真 pnpm）：卡片打开时 `phase=check` 说「已是最新」，点「检查」
后 `canInstall` 变 yes 并给出「安装 0.13.31」，点下去 `phase=installing` 且按钮 disabled，落地后页面**没有**任何文档请求
（无 reload）；一次 GET + 一次 POST，回执逐字为 `{"ok":true,"action":"install","installed":{"from":"0.13.30","to":"0.13.31",
"spec":"github:free6589/dsh-grok-workflow#v0.13.31","saveExact":true}}`，装后盘上 `package.json` 的依赖正好是
`github:free6589/dsh-grok-workflow#v0.13.31`，而 `pnpm-lock.yaml` 里解析到的是
`codeload…/tar.gz/d0c1383e91efb0440463a3e9482ef93490b3eb7c`（= `v0.13.31` 的发版提交，见上一条），`node_modules` 里读到
`0.13.31`——装上去的是那个标签的树，不是"当天解析到什么算什么"。证据目录 `.rsi/evidence/update-button-soak-2026-11-24/`。**红线**：live `~/.dsh` 一行未写、未重载、未重启
（soak 用的是从它复制出来的隔离 home）；**未发版、未打 tag、未 push、未合流**，分支只在本地，`package.json` 仍 0.13.31，
`[Unreleased]` 里记了这条用户可见变化。）

Last updated: 2026-11-24 21:00 +08:00（**报告尾部审计层：没跑完的一轮带全量机器记录，默认视图零变化，`CONFIRMED`，未发版** —
分支 `feat/audit-render-half`（自 `main` `1f70103` 开），两个本地提交：`4502748`（feat）+ 承载知识文档与证据的 docs 提交。
`feat/audit-layer`（`7626233`）只取 `src/report-audit.ts` 与 `test/report-audit.spec.ts` 两件，按 `0.13.32` 的 `types.ts`
改写后接到报告层**尾部**：`RenderReportOptions.auditTrail` 默认关，为真时 `renderReport` 先算 base view（含它自己的
8000 字上限）再在守卫行之后接 `\n\n` + `renderAuditTrail(report)`；`src/index.ts` 的 PTC `render` 只在
`report.status !== 'completed'` 时带上。决定、三个被否决的替代方案与后果见 **D-132**；分支的另一半（默认视图翻成人类答案）
**没取**，留在 `feat/audit-layer` 上等另一次决定。**门禁**：`npm run ci` 在 `4502748` 上 **EXIT=0** — oxlint 36 warnings /
0 errors、`verify:lib` 249 文件逐字节一致、vitest **102 文件 / 1923 测试 PASS**（对 `feat/update-button` 的 101 / 1910
基线是 +1 文件 / +13 测试；`lib` 245 → 249）。**红先绿后**：`test/report-audit.spec.ts` 先红两次（模块缺失 → 选项/入口缺失），
实现后 13/13 绿；唯一既有用例改动是 `test/human-output-contract.spec.ts` 的 T4 断言收窄（答案半不带机器词条，审计段是
独立带标题段落）。**真机隔离 soak**（复制 live `web` profile 的 scratch home + tarball 安装，版本读回 `0.13.32`、
`lib/index.js` sha256 与 worktree 构建一致）：不可满足任务 **`failed`**，工具结果 24 792 字并含
`Technical audit trail` + `Audit trail complete.`；能答的问题 **`completed`**，1 276 字**不带**审计段；同 prompt 打发布版
构建的对照跑也是 `failed` 但**不带**审计段。证据 `.rsi/evidence/audit-render-half-2026-11-24/`。**红线**：live `~/.dsh`
一行未写（本进程对它是只读的，`dsh --profile web` 直接 EROFS）、未重载、未重启；**未 push、未打 tag、未合流、未发版**，
`package.json` 仍 0.13.32。分支判定日期 2026-11-26。）

Last updated: 2026-11-25 01:49 +08:00（**0.13.34 已发布：接单台子随 `feat/block-intake` 合入 `main`，两次全量门禁都 exit 0，`CONFIRMED`** —
`feat/block-intake`（`92097d9` 功能 + `88f1e12` 记忆，基线 `main` 尖端 `9b55d2d`）以 `--no-ff` 合入从 `9b55d2d` 开出的
`release/0.13.34`，merge **`fe32b26`**「merge: the block intake — a durable block ledger, six tools, and an independent
supervisor」，**零冲突**——分支正基于 main 的尖端，所以没有冲突要解，也没有任何决策号重编，`D-135` 原样不动。门禁 #1 在
`fe32b26` 整棵树 `TMPDIR=$PWD/.tmp npm run ci` **EXIT=0**：vitest **`111 files / 2128 tests PASS`**（196–202 s）、oxlint
**`Found 36 warnings and 0 errors.`**（193 文件）、`verify:lib` → **`lib/ at fe32b26 is the build of src/ at fe32b26 (293
files, byte-identical)`**。基线算术：`main` 在 `9b55d2d` 是 **105 文件 / 1954 测试**，本轮 **+6 文件 / +174 测试**（六个新
block spec：`block-ledger` 20、`block-preview` 93、`block-tools` 21、`block-supervisor` 20、`block-flag` 8、
`block-flag-baseline` 12），`105+6=111`、`1954+174=2128`，两边逐项相等。发版提交 `3c5d388`「chore(release): prepare
v0.13.34」**8 文件 / +22 −20**，文件面与行数形状同 `26628c2`（0.13.33 那次 prep）：`CHANGELOG.md`、`README.md`、
`README.zh-CN.md`、`docs/LOCAL-TESTING.md`、`lib/client.js`、`package-lock.json`、`package.json`、`src/client/index.js`。
`CHANGELOG.md` 里 `## [0.13.34] - 2026-11-25` 插在 `## [Unreleased]` 之后（第 8 行，索引 7），`[Unreleased]` 仍在且为空，
发版工作流抽取的那一段 **43 行**，中英条目原文一个字没改。门禁 #2 在 `3c5d388` **EXIT=0**（vitest `111 files / 2128
tests`、oxlint 36/0、`verify:lib` → `lib/ at 3c5d388 is the build of src/ at 3c5d388 (293 files, byte-identical)`），
**独立跑了两次**（发版 lane 与调度各跑一遍全量，两次都 exit 0）；针对性守卫另单跑 `docs-version` 8 + `docs-config-keys`
13 + `docs-architecture-version` 3 + `update-entry` 20 + `update-surface` 29 + `i18n-parity` 6 = **6 文件 / 79 测试
PASS**。合 `main` 得 **`d01da81`**「merge: the block intake — a durable block ledger, six tools, and an independent
supervisor, shipped as 0.13.34」，`git diff --stat release/0.13.34 main` 为空，即 main 的树与被门禁的那个发版提交逐字节
相同。注解标签 `v0.13.34` → 标签对象 → 剥皮 `d01da81`，`git show v0.13.34^{}:package.json` 读到 `0.13.34`。推送无
force：`9b55d2d..d01da81  main -> main`、`* [new tag] v0.13.34 -> v0.13.34`。远端 CI run **`45451899750` success**
（main，headSha `d01da81`）、Release run **`45451905147` success**（tag `v0.13.34`，headSha `d01da81`，创建
2026-11-24T17:44:35Z → 更新 17:47:33Z）。GitHub Release **`Grok Workflow for DSH v0.13.34`**
（https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.34），资产
**`dsh-grok-workflow-0.13.34.tgz`（1025707 B）**，sha256
`7ece8829b4563176e65a37cc8a13e0b0f1baea11c63ecb3b6b1bedd76184d581`，非 draft、非 prerelease。`v0.13.33` 在发版前已确认
在册（资产 `dsh-grok-workflow-0.13.33.tgz`，967628 B），所以 README 已发布清单里新加的 `v0.13.33` 是真话。用户能感觉到
的变化：接单台子**默认关**（`blockIntake: false`），打开后一单任务可以按一份用户点头的切分最多拆三块，切分先预览、在
用户发消息复述批准词之前一个字都不写盘；批准后的切分成为 `$DSH_HOME/taskboards/grok-workflow/` 下的追加式账本行（每次
变化都是新追加的版本，从不就地改写）；六个工具驱动它（`grok_open_block`、`grok_accept_block`、`grok_close_block`、
`grok_block_status`、`grok_steer`、`grok_stop`）；交卷跑六项确定性检查，再向独立监工要逐条 `pass`/`veto` 判决、写进
自己的追加式账本，同样的证据回来时给的是账上已有的那个判决；心跳观察写第三个文件，既不当判决也不当块的版本。开关关着
时，不注册任何工具、也不挂任何监听。配置面 **19 → 20 键**，`blockIntake` 是装载期开关、故意不投影到设置页（页面字段
**17**）。回归钉：`test/block-flag-baseline.spec.ts` 加夹具 `test/fixtures/block-flag-baseline.json`（99477 B）逐字节比对
基线 `9b55d2d` 上生成的决策，所以「关掉就复现出功能之前那棵树」是查过的说法。）

补记（2026-11-25 01:49，`CONFIRMED`）：**live profile `~/.dsh` 一行未动** —— 未升级、未重载、未重启，AGENTS §11 的自动升级
按操作员红线「不碰 core」**故意跳过**（本轮也只能写仓库内部）；live profile 现装哪一版**这一轮没有重新探**（`NOT_RUN`），
最后一次只读探针（2026-11-24）读到的仍是 `0.13.29`。DSH 核心检出未动；没有 force-push，没有移动任何已发布的标签
（`v0.13.34` 是新标签，`v0.13.33` 及更早的一个没碰）。接单台子那边**还没关的缺口照旧成立**（不挡这次发版，但不能读成已
关）：独立**模型**监工在真机上一次都没验过（隔离 soak 缺 `AGENT2API_API_KEY`，那次尝试的 `veto` 是监工调用失败产出的）；
soak 里有一条 `pass` 是 `judged:false`；多块切分、会写文件的块、`judged:true` 的 `pass` 三块真机未触达（`NOT_RUN`，只有
单测覆盖）；composer 总开关那条显示观察仍是 `HYPOTHESIS`。清理已做：worktree `.agents/worktrees/feat-block-intake` 已删
（当时干净、无未提交改动），`feat/block-intake`（原 `88f1e12`）与 `release/0.13.34`（原 `3c5d388`）在合并检查通过后用
`git branch -d` 删掉。两条本轮看到、**故意没修**的观察（记成观察，不是已关的缺陷）：① `src/config.ts` 两处注释 + 一处字段
描述串（`:226`、`:671`、`:679`）与 `src/index.ts` 一处注释（`:416`）写「the five tools / 五个工具」，实际注册六个
（`BLOCK_TOOL_NAMES` 列六项、注册日志行打六项，README、CHANGELOG 与真机工具清单都写六个）——只错在文字，行为无影响；
② `docs/knowledge/DECISIONS.md` 里 `## D-050`、`## D-051` 两个重复标题在本次合并**之前**就有（在 `9b55d2d` 上核过：
`:899`/`:934` 与 `:916`/`:956`），不是这里引入的，也没有修。

Last updated: 2026-11-25 03:10 +08:00（**问题卡片的确认在接单台子上不再无效：门禁与接单台子共用一个来源判断，`CONFIRMED`** —
分支 `fix/question-card-approval`（worktree `.worktrees/fix-question-card-approval`，基线 `main` 尖端 `4803f42`），功能提交
**`a926cd6`**「fix(block): count a question-card answer as the user's nod」**15 文件 / +553 −30**（3 个 `src/` 文件、2 个
spec、10 个 `lib/` 产物，其中 `src/user-source.ts` 与它的 4 个产物是新文件），记忆提交只动 `docs/knowledge/` 与
`CHANGELOG.md`。**缺陷**：宿主把「点问题卡片」记成 `source.kind === 'user-question-reply'` 的 `user/message`，而
`src/block/tools.ts` 的 `userMessagesSince()` 与 `src/gate.ts` 的 `classifyPreStep()` 都只认 `'user'`——于是卡片批准在
接单台子上每次都拒成 `approval-required`（`startBlock` 第 4 道检查找不到批准词），在门禁上被记成 `non-user-source`，
一个字都没说明它是用户发的。**修法**：新模块 `src/user-source.ts` 定义唯一口径（`QUESTION_REPLY_SOURCE_KIND`、
`isUserAuthoredSource`、`isQuestionReplySource`、`startsTurn`，四个导出都有调用方），`startsTurn()` 只对 `user` 为真
= 那条产品决定「卡片答案是点头，不自己开一轮」（**D-137**）；接单台子这一侧卡片答案只在两个限制下算数——它
`callId` 指向的 `ask_user_question` `tool/call` 事件必须在预览之后记进会话，且返回的文本只是 `selected` + `custom`
标签、不是整包 JSON（否则 payload 里模型自己写的问题文字就能让批准词自己出现）；门禁这一侧只改叫法不改准入——只有卡片
时返回 `{kind:'pass', reason:'question-reply'}`，外来来源仍是 `non-user-source`，心跳分支顺序与 `deliveryKey` /
`request` 输入一个字没动（新用例用同一条用户消息做两次分类，钉住 `key` 与 `request` 相等），`classificationFailure`
仍要求真 `user` 消息。**红先绿后**：两个新 spec 先红，失败原文分别是
`approval-required: 预览之后没有一条消息逐字包含「确认」，不能开工` 与
`expected { kind: 'pass', reason: 'question-reply' } / received 'non-user-source'`；实现后定向
`npx vitest run test/block-tools.spec.ts test/gate.spec.ts` → **`2 文件 / 77 测试 PASS`**（`block-tools` 21→22、
`gate` 54→55）。**门禁**：`TMPDIR=$PWD/.tmp npm run ci` 在 `a926cd6` 上 **EXIT=0**——vitest **111 文件 / 2130 测试
PASS**（对 `4803f42` 的 2128 是 **+2 测试**，文件数不变）、oxlint **`Found 36 warnings and 0 errors.`**（194 文件）、
`verify:lib` → **`lib/ at a926cd6 is the build of src/ at a926cd6 (297 files, byte-identical)`**（293 → 297，四个新
`lib/user-source.*`）。`npm run build` 的 `client bundle: 325771 bytes → lib/client.js` 与上一版逐字节相同（浏览器包不带
这半边）。**红线**：live `~/.dsh` 一行未写、未重载、未重启；未 push、未打 tag、未发版，`package.json` 仍 `0.13.34`；
配置面仍是 20 键、设置页仍是 17 字段（本轮没有新增配置键）。**没做的**：真机 soak（`NOT_RUN`）——卡片路径本轮只有单测
覆盖，上一轮 M2 的真机观察（卡片答案不算用户消息）仍是这条缺陷的现场来源；跨预览边界答卡片、`custom` 文本参与匹配这两条
只有推理与单测，没有真机读数。**环境注记**：本 worktree 原来的 `node_modules/` 只有一份 vitest 缓存、没有 `typescript`，
`verify:lib` 的 scratch 目录把 `root/node_modules` 软链进去后找不到 `tsc`（第一次 `npm run ci` 因此 EXIT=1）；已把那份缓存
移到 `.tmp/worktree-node-modules-cache/`、把 `node_modules` 软链到主检出的 `node_modules`（两边本来就靠父目录解析共用
依赖），之后的全量门禁都 exit 0——`a926cd6` 那次是权威读数，另有一次跑在后来被 amend 掉的 `63e1010` 上
（`111 文件 / 2130 测试`，同样 exit 0）。这条只影响本 worktree 的运行环境，不是产品改动。）

补记（2026-11-25 04:05，`CONFIRMED`）：**真机 soak 跑通了——卡片答案真的开了一块。** 隔离克隆
（`.tmp/soak-card/dsh-home`，profile `web-clone`，端口 3203，线上 3080 全程未碰）里装 `a926cd6` 的构建
（`lib/gate.js e9de01e0…`、`lib/block/tools.js 0cc6394a…`、`lib/user-source.js` 在，插件目录无符号链接，
版本读回 `0.13.34`），真模型 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`：seq 20 预览
（`bp-afeb8fa2…`、`split_hash 27ed61c0…`）、seq 25 `ask_user_question` 问「确认」/「再看看」、seq 26 拿到
`{"pending":true}`、宿主自己的 `userQuestions/answer` 第 1 次就 `true`、seq 34 一条
`source.kind='user-question-reply'` 的 `user/message`、seq 36 `start`、seq 37 **`block_id
3c688ff2-9053-4f47-a1fd-4b04fa32a045`、`status:"open"`**，`blocks.jsonl` 一行且 `approval.quote = "确认"`。
**对照**：同一份克隆/profile/脚本，只把插件换成 `4803f42` 构建的那份，模型行为一模一样，seq 37 被拒成
`approval-required: 预览之后没有一条消息逐字包含「确认」`，账本没有新增行——「同一个动作，修复前拒、修复后开」
是查过的。**这一轮最重要的发现（F2，写进证据文件 §4）**：宿主 `tool-ask-user` 默认是 **legacy**（阻塞、
只认前台客户端），只有 `mode: timed` 才会在窗口过期后把结果写成 `{pending:true}`、让问题变 `continued`，
答案才会以 `user-question-reply` 的 `user/message` 进会话；**默认配置下卡片答案只是同回合的工具结果，永远不会
变成「用户消息」**，所以这条修复覆盖的是 timed 卡片（或任何窗口过期后仍可答的卡片）。soak 档案因此把提问工具
改成 `mode: timed, timeout: 20`（顶层 `- id: tool-ask-user` 覆盖不动预设里的那一行，生效的是
`- id: preset-standard` + `config.plugins` 整份覆盖）。第二条发现（F1）：`userQuestions/answer` 只对
`continued` 问题有效，还开着的卡片只能由接住 waterfall 的客户端回答，没有 HTTP 路由可答。证据
`.rsi/evidence/card-approval-soak-2026-11-25/soak.txt`（含逐字账本行）。**没跑**：真浏览器点一张还开着的卡片
（`NOT_RUN`，那条路径的答案不会变成回复消息）、跨预览边界答卡片与 `custom` 匹配（`NOT_RUN`，只有单测）。
**红线**：`~/.dsh` 三个目录 mtime 前后逐秒相同、写探针 `Read-only file system`、线上 3080 前后都是 401；
未 push、未打 tag、未发版，`package.json` 仍 `0.13.34`。清理：`.tmp/soak-card` 整棵（含克隆 home 与两份
tarball）跑完即删，仓库里只留证据文件。

Last updated: 2026-11-25 15:10 +08:00（**用户视角回归：隔离 fork 的 live web 档案 + 已发布 `v0.13.36` 固定标签，六项里五项通、两项红，`CONFIRMED`，本分支只放证据与记忆** — 分支
`fix/user-regression`（worktree `.agents/worktrees/fix/user-regression`，基线 `main` 尖端 `6e9bc56`）。隔离：`clone-profile.mjs` 从
`~/.dsh/profiles/web` 克隆成 `web-clone`（7720 文件 / 88 421 847 B、parity 5/5、0 未解析依赖、抹掉 1 行生图渠道密钥），删掉
`mode: triage` 那一行（克隆里本来没有 `legacyGate:`），端口 **3311**，插件按固定标签装
`github:free6589/dsh-grok-workflow#v0.13.36` → pnpm 解析到 `codeload…/26dc370…`（= 发版提交），版本读回 **0.13.36**。
**为什么改角色路由**：本机 shell 没有 `AGENT2API_API_KEY`，live 档案的 worker/verifier/supervisor/guardian 全指着 `agent2api`；
先把候选路由证活（`POST /openai/v1/responses` → **200**、6.4 s），再把五个角色 + guardianModel 钉到
`bifrost-responses/opencode-go/muse-spark-1.3-contributor`；顺手证了一条死路由 `tokenrhythm/glm-5.3-flash` → **403
IDENTITY_VERIFICATION_REQUIRED**，丢掉不写。为了让卡片答案变成「用户消息」，`preset-standard.plugins` 整份覆盖、只把
`tool-ask-user` 改成 `mode: timed, timeout: 20`。**测到的**：激活三项（无 `pending`/`did not activate`、24 命名空间、
`grok-workflow` 在且 `mode` 字段已不存在、`blockIntake` 不投影、`request/header` 96 工具、六个块工具齐）；开关（命令写记录、
路由读回 `source:record`）；真任务（4 步 8 次真读盘，带文档节名）；跑中插话（seq 24 在 turn 1 里被 `agent/inbox/spliced`
接住、turn 1 跑到 seq 145 才收尾、turn 2 原话读进去）；卡片点头（`pending:true` → `userQuestions/answer` 返回 **true** →
`source.kind='user-question-reply'` 的 `user/message`）；预览→开工（`bp-211d7434…` / `3e9170ee…` → `block_id 50761193…`、
`approval.quote="确认（开工）"`、`grok_accept_block`、派出 subagent、`notes.md` 真写出来）；**监工判决**
（`outcome:pass`、**`judged:true`**、判决行 `route:"bifrost-responses/opencode-go/muse-spark-1.3-contributor"`、逐条验收各带证据；
同一块再交一次 `evidenceUnchanged`、不写第二行）。**这一条补上了 0.13.34 那一轮挂着的缺口**——「独立模型监工在真机上
一次都没验过」现在有了真机读数。**两条红**：① `src/command.ts:325` 的 `/grok on` 确认话仍承诺「every message now runs the
full plan→execute→verify workflow」，而 0.13.36 里没有任何东西按这条记录导流（记录的读者只有 `/grok status` 文案、开关路由、
`src/user-source.ts` 的准入），真机读数也对得上：`/grok on` 之后普通任务直接干活、无流水线；② 同一个会话里开关
`GET /grok-workflow/mode?action=status` 返回 `enabled:true, source:default, fallback:true`（界面显示「开」），而
`grok_open_block` 拒成 `mode-off: 这个会话的 grok 模式没打开，接单台不接单`——界面说开着、工具说关着，打一条 `/grok on`
就消失，但没人会想到要打；两条修法（甲：开关没有记录时不要显示「开」；乙：准入承认部署默认）写进证据文件，**本轮没有动**，
是产品决定。**边界**（`NOT_RUN`，照实列）：真浏览器点那颗开关按钮（fork 的 web 落「生图」面板、隔离 home 的会话树在 UI 里是空的，
headless 没把聊天面板点出来，0 console errors 是唯一读数）、默认 legacy 配置下点卡片、设置页渲染、在 live 档案上升级、
多块切分、心跳。**红线**：`~/.dsh` = 2026-11-22 23:40:20、`~/.dsh/profiles` = 2026-11-22 16:59:46（前后同值）、写探针
`Read-only file system`、线上 3080 前后都是 401、live 仍装 **0.13.35**（依赖仍浮动、锁解析到 `84efda0`）。一处要说准：
`~/.dsh/profiles/web` 这个**目录**的 mtime 中段动过一次（12:09:52 → 13:16:10），但里面的文件没有一个晚于 12:09:50，
本进程对它只读（EROFS），成因 `HYPOTHESIS`（别的东西的临时条目），没有查到底；未 push、未打 tag、未发版、未合流，
`package.json` 仍 `0.13.36`，`src/` `test/` `lib/` 一个字未改。证据 `.rsi/evidence/user-regression-2026-11-25/README.md`。
红一另开分支 `fix/grok-command-text` 修，不混进本分支。）

补记（2026-11-25 13:30，`CONFIRMED`）：**红一已经修好了，在另一条分支上。** `fix/grok-command-text`（worktree
`.agents/worktrees/fix/command-text`，基线 `6e9bc56`）两个提交 `5c120b1`（fix，9 文件 / +24 −15，含 `lib/command.js`
重建）+ `78c9091`（只加证据）。新话两句：`Grok workflow ON — the model may commission reviewed blocks of work in this
session. Messages themselves are not turned into a workflow.`；`/grok off` 的答案、记录形状、路由、接单台准入都没动。
**我自己复核过的**：`npx vitest run test/command.spec.ts` → `27 passed (27)`；`node scripts/verify-lib.mjs` →
`lib/ at 78c9091 is the build of src/ at 78c9091 (281 files, byte-identical)`；全量门禁是它跑的 `npm run ci` **EXIT=0**
（`98 files / 1839 tests`、`15 warnings / 0 errors`）。它顺手把两个 README 里「`grokDefault: on` 认领每条用户消息」改成实话
（`on` 只是没有记录时会话报出来的回退值，本身不让接单台接活）——**这句改动把红二的矛盾写实了，而准入规则没动**。
红二没修：开关认部署默认、接单台只认会话记录，两处设计撞在一起，修哪个都改用户可见行为，要决定号。

Last updated: 2026-11-25 14:10 +08:00（**设置页与 `/grok on` 的文案改说实话，`CONFIRMED`，未发版、未改行为** — 分支
`fix/settings-copy`（worktree `.worktrees/fix-settings-copy`，基线 `main` 尖端 `50dad03`），产品提交 **`05f9e2b`**。
设置页第 1 组现在写「会话默认 / 没打 `/grok` 时的默认」，状态行写「开：没打过 `/grok` 的会话报这个」，副行写明
「只是报出来的默认值……还得这个会话自己打一句 `/grok`」；`/grok on` 回执补了 `as long as the block intake is
switched on`（纯字符串，无新增 config 读取）；两个 README 的设置页段落删掉 `auto`/`full` 模式选择器、改成页面真实
渲染的五组。**门禁**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**（`98 files / 1841 tests`、`15 warnings / 0 errors`、
`lib/ at 05f9e2b is the build of src/ at 05f9e2b (281 files, byte-identical)`、`lib/client.js` 329354 → **330313 B**）。
**隔离真机**：克隆 live `web` 档案（7720 文件 / 88 421 847 B、parity 5/5、0 未解析依赖、抹 1 行生图渠道密钥），端口 **3321**，
同一个浏览器里前后两版逐字对读：改前 `开着：工作流工具可用` / `总开关` / `默认下大力气`，改后 `开：没打过 /grok 的会话报这个`
/ `会话默认` / `没打 /grok 时的默认`（0 console errors）。**红线**：`~/.dsh` = 2026-11-22 23:40:20、
`~/.dsh/profiles` = 2026-11-22 16:59:46（前后同值）、写探针 `Read-only file system`、3080 → 401、未 push / 未打 tag / 未 bump；
`/grok on` 回执在 GUI 里 **`NOT_RUN`**（克隆落地页是生图工作台，新会话要先选模型）。证据
`.rsi/evidence/settings-copy-2026-11-25/`。)

Last updated: 2026-11-25 16:10 +08:00（**红二修完：没有记录的会话，开关不再显示「开」，`CONFIRMED`，未发版、未合流** — 分支
`fix/switch-default-state`（worktree `.tmp/wt-switch-default`，基线 `main` 尖端 `d34214b`），产品提交 **`57b5723`**
（6 文件 / +243 −23），其后再一条只写文档与证据的提交。操作员拍板走**甲**：开关报**会话自己的记录**，没有记录就显示
「未开 · 还没设过」（`mode-switch` 的第三个状态词 `mode.switch.notOn`，中英各一条）；`source: 'record'` 与 `source` 缺失仍走
`开`/`关`。**视觉与点击同源**：一个 `modeShownOn(mode)` 同时喂文案、`aria-checked`、胶囊、指示灯与 `flip()`，于是「未开」时
点一下写的是 `{"action":"set","enabled":true}`（把这个会话真正打开），不再是「把部署默认取反写成 `false`」；写失败保留上次状态
那条路径一字未改。**路由、`/grok status`、设置页、`src/gate.ts`、`src/block/**`、`src/mode-surface.ts` 一个字未改**——两边
从此可以显示不同的字，这是**故意的**（`D-154`），单测两处钉住（`test/mode-surface.spec.ts` 的 divergence 用例 +
`test/client.spec.ts` 的反向钉住），用例注释写明「想对齐先读 D-154」。**门禁**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**
（改前基线 `d34214b`：`98 files / 1845 tests`；改后：`98 files / 1849 tests`、`Found 15 warnings and 0 errors.`（未变）、
`lib/ … (281 files, byte-identical)`、`lib/client.js` 331626 → **333611** 字节）；先红后绿：定向 `4 failed | 168 passed (172)` →
`172 passed (172)`。**隔离真机（用户视角，`CONFIRMED`）**：克隆 live `web` 档案（7720 文件 / 88 421 847 B、parity 5/5、
抹 1 行生图渠道密钥）、删掉克隆里那行 `mode: triage`、`npm pack` 打包后 `dsh plugin add file:<tgz>`（**不是 `link:`**——软链会让
插件里那份 `@deepseek-ai/dsh-session` 与宿主不是同一个模块实例，`/grok on` 会答 `Receiver must be an instance of class Session`，
那是装法问题）、版本读回 `0.13.36`、`sha256(lib/client.js)` = `edcd6983…` 与 worktree 逐字节相同（真拷贝）、端口 **3331**、
工作区指向一次性 `/tmp/wtsw-work`。读数：① 新会话开关 `未开 · 还没设过` / `aria-checked=false` / lamp off，而旁路路由答复
**`{"enabled":true,"source":"default",…,"fallback":true}`**（界面与工具从此不再互相打脸）；② 从「未开」点一下 → 请求体
`{"action":"set","enabled":true}`、答复 `setBy:"switch:mode"`、开关 `开`；③ `/grok off` → 关、`/grok on` → 开，各在 +2 秒内；
全程 `console_errors: []` / `page_errors: []`。**红线**：`~/.dsh` = 2026-11-22 23:40:20、`~/.dsh/profiles` = 2026-11-22 16:59:46、
`~/.dsh/profiles/web` = 2026-11-25 13:16:10（早于本会话，前后同值）、写探针 `Read-only file system`、3080 前后都是 401、
live 仍装 `0.13.35`、真实工作区目录 `~/Documents/deepseek-harness/default-workspace` mtime 前后都是 2026-11-15 13:42:07；
未 push、未打 tag、未 bump、未合流。scratch `.tmp/soak-switch-default`（105 MB）跑完整棵删除。证据
`.rsi/evidence/switch-default-state-2026-11-25/`。**没跑**：模型回合、点卡片、真任务、监工判决（`NOT_RUN`，与本改动无关）。）

Last updated: 2026-11-25 20:00 +08:00（**进度页重画成一页三态，`CONFIRMED`，未发版、未合流** — 分支
`feat/progress-redesign`（worktree `.agents/worktrees/feat/progress-redesign`，基线 `main` 尖端 `ff5c5ec`），交付 HEAD
**`87f14e1`**。六段固定脊椎、环、连接线、实测 SVG 干线、结算条、百分比与详情弹层**整体退场**；换成头部（run 名 + 五态胶囊）、
「现在」主标题 + 一行小字、一步一段的分段条 + 琥珀重做提示 + 「后面还有」、步骤清单（每步 执行 → 检查 → 复核 链）、
「经过」逐行日志（一行一条调用）、「交卷」卡（稿名 + 打开胶囊，没有 `summary-final` 就如实写缺口）、底部只填框不代发的按钮，
聊天任务卡片同一套五态词与琥珀色。**门禁**：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**（`100 files / 1855 tests`、
`15 warnings / 0 errors`、`lib/ at 87f14e1 … (285 files, byte-identical)`、`client bundle: 334321 bytes`；基线 `ff5c5ec`
是 `100 files / 1870 tests` / `340426 bytes`）。**真机**（隔离克隆 + 打包 `0.13.38` + 真模型，端口 3361）：等你点头 / 进行中 /
已完成三态都拍到了，`consoleErrors: []`，第二次运行的交卷卡真机渲染出「汇总·第2稿（定稿）」。**真机改掉的契约**：规划不再算一步
（§19.2 改成只把工作腿算作步骤，没有步时主标题写「正在拆活」）。**上游缺口**：`src/report.ts:1170` 只认
`check=pass verify=pass drafts=N`，有些运行因此不写 `summary-final`，交卷卡只能是空的——本轮不修，记在 HANDOFF。**红线**：
`~/.dsh` / `~/.dsh/profiles` 前后同值、写探针 `Read-only file system`、3080 前后 401、live 仍装 `0.13.38`；未 push、未打 tag、
未 bump、未发布。证据 `.rsi/evidence/progress-redesign-2026-11-25/`。**没跑**：未通过/已取消两态的真机截图、点按钮后输入框内容、
窄屏真机截图（`NOT_RUN`，只有组件断言）。）

Last updated: 2026-11-26 01:49 +08:00（**0.13.41 已发布：跑中插话又能送进正在跑的那一轮，`CONFIRMED`** — 发布提交
**`a64a50a`** `chore(release): prepare v0.13.41`，父提交 `d35af40`，**8 文件 / +22 −20**（`CHANGELOG.md`、`README.md`、
`README.zh-CN.md`、`docs/LOCAL-TESTING.md`、`lib/client.js`、`package-lock.json`、`package.json`、`src/client/index.js`），
`src/` 与 `lib/` 只有 `PLUGIN_VERSION` / `UPDATE_LATEST` `'0.13.40'` → `'0.13.41'`（两份 blob 同为 `cf19891 → 4c4132d`，
即仍逐字相同）；`main` 用 `git merge --ff-only release/0.13.41` 前进，**`main` = `origin/main` = `a64a50a`**，没有第二个合并提交。
附注标签 **`v0.13.41`**，标签对象 **`96dd9cce3434734213eee281037ccca9ef605e57`**，剥出 **`a64a50a`**，
`tagger 1795628771 +0800` = **2026-11-26 01:46:11 +0800**；已发布标签没被移动（`v0.13.40` 对象仍是 `14fef64`、
`v0.13.39` `87a0e0e`、`v0.13.38` `2f3e548`、`v0.13.37` `235fa3e`，`git ls-remote --tags origin` 重读）。
**发版门禁** `TMPDIR=$PWD/.tmp npm run ci` 在 `a64a50a` 的干净树上：`Test Files 102 passed (102)` / **`Tests 1927 passed (1927)`**、
`Duration 98.22s`、lint `Found 15 warnings and 0 errors.`（`182 files`、`96 rules`）、
`lib/ at a64a50a is the build of src/ at a64a50a (285 files, byte-identical)`、`client bundle: 348559 bytes`。
**一处诚实边界**：这一份转录**末行是 `Duration`，没有 `GATE_EXIT=` 行**（`grep -c EXIT` = 0；上一轮 `0.13.40` 的转录末行确实
有 `GATE_EXIT=0`），所以「跑完且全绿」有转录为证、「退出码 0」是执行方那条命令的读数，本轮没重跑门禁。
**用例数为何从 0.13.40 的 `1923` 变成 `1927`（`CONFIRMED`）**：102 份 spec 一份没增没减，静态 `it(` 由 `1848` 涨到 `1852`，
多的 4 条全在 **`test/replan.spec.ts`（`17 → 21`）**，参数化/循环差额仍是 `+75`（`block-preview 39→93`、`block-flag-baseline 7→14`、
`objective-limit 6→12`、`fallback-shards 12→16`、`waves 24→28`），`1852 + 75 = 1927` 与门禁逐字对上；
**这 +4 不是发布提交带来的**——`git diff --stat d35af40..a64a50a` 里没有任何 `test/` 文件，它落在 `3778822 → d35af40`
那段「跑中插话」修复自己的提交族里（`git diff --stat 3778822..d35af40` 有 `test/replan.spec.ts | 157 ++++++++++-`），
随版发布。**远端**：Release run **`45668227079`** `success`（`headSha a64a50a`，job `Validate and publish v0.13.41` 16 步全绿）、
CI run **`45668209937`** `success`（`main` / `a64a50a`）；Release
https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.41 ——`isDraft false`、`isPrerelease false`、
`publishedAt 2026-11-25T17:47:46Z`、正文 23 行，唯一资产 **`dsh-grok-workflow-0.13.41.tgz` = 976529 字节**
（`sha256:22a79233…0ecdee`），比上一版 **+2689**。**清理**：`release/0.13.41` 用 `git branch -d` 删了（只删这一个本地分支，
没删远端分支、没删 `backup/*`、没删任何 tag），`git worktree list` 只剩主检出；`.gitignore`（modified）与
`.rsi/evidence/progress-now/`（未跟踪）是别人的遗留，本轮仍然没碰。**没做成**：`AGENTS.md` §13 的 live 档案升级 `BLOCKED`
（本会话 `workspace-write`、`~/.dsh` 在工作区外，写探测只会得到只读）——**没写、没重载、没重启** 3080 上的实例，live 装哪一版本轮 `NOT_RUN`；
真机 soak 本轮也没跑（改动的真机读数由 `.rsi/evidence/steering-reconnect-2026-11-26/` 覆盖）。证据
`.rsi/evidence/release-0.13.41-2026-11-26/`（`gate-a64a50a.out` 23312 字节、`sha256 9ad02f92…420da6`）。）
