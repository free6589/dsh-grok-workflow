# `0.13.53` 发布收口证据（2026-11-26）

这一份是 **`0.13.53` 这次发布**的读数档案：发布身份、门禁、算术（用例数为什么从 `2060` 变成 `2030`）、
真机 soak 与它那两条**必须照实读的缺口**、远端 run 与 Release、以及一条**没做成**的事（`BLOCKED` 的 live 档案升级）。
目录里唯一的原始文件是 `gate-50b3341.out`（发版门禁转录，**392 行 / 24016 字节**，
`sha256 533602edcf215bf0853b62b511325e3d2d5a7253ff559536269092274ac60a69`
——本轮自己用 `wc -lc` 与 `sha256sum` 各读一次）。其余读数的出处写在下面每一行里。

**状态词汇**（按 `AGENTS.md` §2）：`CONFIRMED` = 本轮亲手在源码 / 命令 / 转录 / `gh` 里读到；`HYPOTHESIS` = 推的、没验；
`NOT_RUN` = 这一轮刻意没跑；`BLOCKED` = 缺一个外部能力，跑不了。

**本轮的角色**：只做记忆收口，**没有重跑门禁、没有重跑 soak**（转录与真机目录都是发版执行方留下的，本轮只核对）。
凡标「本轮自查」的读数，本轮都用 `git` / `gh` / `wc` / `sha256sum` / `stat` 复核过一次；
**凡标「派单记录」的读数，本轮没有独立的第二来源**——只有一份派单记录，照录不升格。

## 1. 环境（本轮实测）

| 项 | 值 | 怎么读到的 |
| --- | --- | --- |
| Node | `v26.8.1` | `node -v` |
| npm | `11.19.0` | `npm -v` |
| DSH CLI | `0.2.2-rc.3` | `dsh --version` |
| 内核 | `Linux 7.2.11-arch1-1 x86_64` | `uname -srm` |
| 仓库 | `/home/fish/projects_mine/dsh-grok-workflow`（`main`） | `git rev-parse main` |
| 会话文件策略 | `workspace-write`，审批提示被禁用 | 会话环境声明 |

门禁转录是在**主检出**里产生的（转录第 170 行的 runner 是
`RUN  v4.1.12 /home/fish/projects_mine/dsh-grok-workflow`，不是 `.tmp/wt-release-*` worktree），
所以这次的清理没有 worktree 要删（`git worktree list` 本轮复核：只剩主检出 `50b3341 [main]`）。

## 2. 发布身份（`CONFIRMED`，本轮自查）

- **发布分支** `release/0.13.53`，从 `main` 的 **`e44e26a2edc62d28a6eee14c246cc6570ce33b74`** 切出
  ——这一点本轮是用合并提交的**第一父**证实的（见下一条），**分支本身现在已经不在了**
  （`git branch -a | grep release/` 本轮只读到一条早先的 `origin/release/0.13.27`），
  也就是收口时它已经被删掉；本轮没有删它，也没有为它做任何动作。
- **合并提交** **`c698a360a9ba3cbd84f8c46b5f1f2caa782f8a8e`**，消息 `Merge branch 'feat/task-panel' into release/0.13.53`，
  两个父：**`e44e26a`**（`main`）与 **`ae4d4c1`**（`feat/task-panel` 尖端），提交时刻 `2026-11-26 19:15:19 +0800`。
  **这是 `git merge --no-ff`，零冲突——而且要说得干净：这一轮根本没有冲突要解**：
  `git merge-base --is-ancestor e44e26a ae4d4c1` 成立，即 `main` 本来就是功能分支的祖先；
  合并树 `a5a895efb3b2d24f282b386ec5ea185179b11e63` **与 `ae4d4c1` 的树逐字相同**，
  `git diff --stat ae4d4c1 c698a36` **0 行**。所以「零冲突」不是「解得很顺利」，而是**没有需要解的东西**。
- **发布提交** **`50b334116f234a085b5557d298eda82ffc17ceba`**，消息 `chore(release): prepare v0.13.53`，
  父提交 `c698a36`，提交时刻 `2026-11-26 19:20:30 +0800`（`git show --stat --numstat 50b3341`）。
- **8 文件 / +24 −22**，逐文件增删（`--numstat`）：

  | 文件 | + | − |
  | --- | --- | --- |
  | `CHANGELOG.md` | 2 | 0 |
  | `README.md` | 6 | 6 |
  | `README.zh-CN.md` | 6 | 6 |
  | `docs/LOCAL-TESTING.md` | 3 | 3 |
  | `lib/client.js` | 2 | 2 |
  | `package-lock.json` | 2 | 2 |
  | `package.json` | 1 | 1 |
  | `src/client/index.js` | 2 | 2 |

  **这份文件集里没有任何 `test/` 文件**（`git diff --name-only c698a36..50b3341 -- test` = **0 行**）——
  发布没有带测试（见 §4 的因果）。
- `git show 50b3341:package.json` 的 `version` 是 **`0.13.53`**（`package-lock.json` 同步，2/2）。
- `src/client/index.js` 与 `lib/client.js` 在发布提交上仍然**逐字节相同**：
  两者都是 **`399448`** 字节、`sha256 1fb003f3f608d0fb7b053504456defdc476c59f88f68b753a3357196f2c1b81f`（本轮 `cmp` + `sha256sum`）。
  改动只有那一对版本字面量 `PLUGIN_VERSION` / `UPDATE_LATEST`（各 2/2 行）。
- **`main` 是用 `git merge --ff-only release/0.13.53` 前进的**，没有第二个合并提交：
  `main` = `origin/main` = **`50b3341`**（`git rev-parse main origin/main`，两行同值），
  `git merge-base --is-ancestor 50b3341 main` 成立，`git describe --tags 50b3341` 读作 **`v0.13.53`**（不是 `v0.13.52-1-g…`）。

### 2.1 标签（附注标签，`CONFIRMED`）

`git cat-file -p v0.13.53` 原样：

```
object 50b334116f234a085b5557d298eda82ffc17ceba
type commit
tag v0.13.53
tagger fish <free6589@users.noreply.github.com> 1795692450 +0800

Grok Workflow for DSH v0.13.53
```

- 标签**对象** **`8a0f9be0fc1371d2ebb0580d623b12b1df4be82c`**（`git rev-parse v0.13.53`，`git cat-file -t` = `tag`），
  剥出 **`50b334116f234a085b5557d298eda82ffc17ceba`**（`git rev-parse v0.13.53^{}`）。
- `tagger … 1795692450 +0800` = **2026-11-26 19:27:30 +0800**（`date -d @1795692450`）。
- **已发布标签没被移动**（`git ls-remote --tags origin` 本轮重读）：

  | 标签 | 对象 | 剥出 | 备注 |
  | --- | --- | --- | --- |
  | `v0.13.53` | `8a0f9be0…` | `50b3341` | 本次，新 |
  | `v0.13.52` | `9c7ebe3c…` | `9cc2e43` | 未动 |
  | `v0.13.51` | `a2c7eeab…` | `16453c4` | 未动 |

## 3. 发版门禁（发布提交 `50b3341`，`CONFIRMED`，转录在本目录）

`TMPDIR=$PWD/.tmp npm run ci`，在 `50b3341` 的干净树上跑一遍整套。逐条从 `gate-50b3341.out` 读到：

| 行 | 转录里的原话（行号） |
| --- | --- |
| 包与阶段 | `> dsh-grok-workflow@0.13.53 ci` → `npm run typecheck && npm run lint && npm run verify:lib && npm test`（2–3 行） |
| typecheck | `> dsh-grok-workflow@0.13.53 typecheck` → `> tsc -p tsconfig.json --noEmit`（6–7 行，无输出、无错误） |
| lint | `Found 14 warnings and 0 errors.`（152）+ `Finished in 90ms on 187 files with 96 rules using 6 threads.`（153） |
| verify:lib | `client bundle: 399448 bytes → lib/client.js`（158）+ `lib/ at 50b3341 is the build of src/ at 50b3341 (293 files, byte-identical)`（159） |
| build | `client bundle: 399448 bytes → lib/client.js`（168） |
| tests | `Test Files  105 passed (105)`（387）/ `Tests  2030 passed (2030)`（388） |
| 时长 | `Start at  19:20:51`（389）/ `Duration  106.86s (transform 2.62s, setup 0ms, import 9.02s, tests 85.28s, environment 12ms)`（390） |
| runner | `RUN  v4.1.12 /home/fish/projects_mine/dsh-grok-workflow`（170） |
| 退出码 | **`GATE_EXIT=0`**（392 行，**转录的最后一行**） |

**退出码这一格可以直接引用转录**：`grep -n GATE_EXIT` = 第 392 行、`tail -1` 同句，与 `0.13.42` 那份一致
（`0.13.41` 那一份缺的就是这一格）。另外 `grep -cE 'FAIL'` 在整份转录里 **0 命中**。

**转录的指纹**：**24016 字节 / 392 行**、
`sha256 533602edcf215bf0853b62b511325e3d2d5a7253ff559536269092274ac60a69`（`wc -lc` + `sha256sum`）。
转录**一个字没改**（本轮只读）。

跑完 `git status --short` 里没有 `src/` 与 `lib/` 的改动（派单记录）——即这次构建是可复现的、`verify:lib` 不是空证明。

### 3.1 块内的轻门禁（`AGENTS.md` §12，bump 之前；**派单记录，本轮未见转录**）

这一组读数本轮**没有找到第二来源**（本目录只有发版门禁那一份转录），所以照录、不升格：

| 项 | 读数 |
| --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | `TYPECHECK_EXIT=0` |
| `npm run lint` | `Found 14 warnings and 0 errors.`，187 文件 / 96 规则 |
| 六份被改到的 spec | `Test Files 6 passed (6)` / `Tests 240 passed (240)`：`client.spec.ts` **153**、`progress-panel.spec.ts` **25**、`progress-panel-model.spec.ts` **31**、`progress-connector.spec.ts` **15**、`progress-hint-absent.spec.ts` **8**、`i18n-parity.spec.ts` **8**（`153+25+31+15+8+8 = 240`，自洽） |

与发版门禁的 lint 读数（`14 warnings`、`187 files`、`96 rules`）逐字相同，这是这一组唯一能交叉核对的地方
——**但它不能证明那 240 条真的跑过**，只能说两者不矛盾。

## 4. 算术：用例数为什么从 `2060` 变成 `2030`（`CONFIRMED`，本轮自己从 git 对象数）

**份数**：`git ls-tree -r --name-only <sha> -- test | grep -c '\.spec\.ts$'`

| 树 | spec 文件 |
| --- | --- |
| `e44e26a`（`main`，发布分支的起点） | **105** |
| `c698a36`（合并之后） | **105** |
| `50b3341`（发布提交） | **105** |

**份数从头到尾没变**，变的只是里面装的东西。

**用例数是 −30，而且它落在合并里，不落在发布提交里**（`git diff --stat e44e26a..c698a36 -- test | grep progress`，本轮实读）：

| 文件 | 行数 | 用例 |
| --- | --- | --- |
| 删除 `test/progress-flow.spec.ts` | **−1626** | 旧画法（一条腿一列的流程）连同它的断言一起退场 |
| 删除 `test/progress-lanes.spec.ts` | **−1312** | 旧画法（腿 × 任务的泳道矩阵）同上 |
| 新增 `test/progress-panel.spec.ts` | **+1157** | **25** |
| 新增 `test/progress-panel-model.spec.ts` | **+1135** | **31** |
| 改写 `test/progress-connector.spec.ts` | 388 行变动 | 15（定向门禁读数） |
| 改写 `test/progress-hint-absent.spec.ts` | 40 行变动 | 8（定向门禁读数） |

**正确的因果**：`2060 → 2030` 这 **−30** 是**两份旧进度 spec 合并成两份新 spec** 的净差额
（净 −30 用例、文件数一换一所以仍是 105 份）；
**它不是丢了某个不相干领域的覆盖，也不是发布提交造成的**——发布提交一行 `test/` 都没碰（§2）。
两份 `README` 在发布提交里把 `2060` 改成 `2030`（各 6/6 行），改的就是这个数：
`git show 50b3341 -- README.md README.zh-CN.md | grep -E '^[-+].*(2060|2030)'` 四条 diff 行，中英各一对，`2060 → 2030`。

**这一节本轮的边界**：`2060` 这个「前值」本轮**只能从发布提交自己的 diff 反读**
（`README` 的 `-` 行写着 `2060`），本目录里**没有** `e44e26a` 上的门禁转录；
`2030` 有门禁实测（388 行）✔。所以「`2060` 是合并前那棵树上的实测」这一句是**派单记录**，
本轮没有第二来源；「合并后与发布提交都是 `105` 份」是**本轮自查**。

## 5. 这次发出去的是什么（`CONFIRMED`，`CHANGELOG` 与 Release 正文实读）

`CHANGELOG.md` 现在的形状：`## [Unreleased]` **空着**，紧接着新的 `## [0.13.53] - 2026-11-26`（`sed -n '5,9p'`）。

用户可见的一件事：**进度页从「泳道矩阵」变成一块任务面板**——

- **上面一句话**：这一轮走到第几步、一共几步；只有当**这一轮自己的耗时能量出来**时，才再补半句「还剩约 N」。
  一个数字都不编：页面上没有百分比、也没有通过率；一步都还没量到的时候，那半句干脆不出现（它的悬停提示写明了算法：
  已跑完步骤的平均耗时 × 还剩几步）。
- **中间一张分支树**：每一步一颗节点；每一步走过的计划任务各成一条分支；**每次尝试一颗小圆点**，
  **没过的那一次和下一次之间连一小段虚线**。这张图是从一份标准 Mermaid `flowchart TD` 文本生成的
  （挂在页面上、读回来自己排版），所以图和文字不会各说各话，那份文本原样贴进任何 Mermaid 渲染器都能画；
  **没有为此新增画图库**。
- **底下一句话**：**只在真的卡住时才出现**——有一次没过、有一步一直没回报、或者守门把所有稿子都退回来了。
  没有卡住的时候，那里什么都不画。
- **点击**：点一颗节点摊开这一步调过的调用；点一条分支，跟它有关的线亮起来、其余退到后面；再点一次或点空白处取消。
- **跟着旧版一起退场的**：等宽步骤条、手机上的两列网格、步骤上那个圆形的「展开」小箭头，以及「还剩 N 步」那一行
  ——最后这一行由顶上那一句话接替。

**升级须知（原文）**：不用准备任何东西——没有设置、存储格式或默认值变化，变的只是这个页签怎么画。

两份 `README` 的 `6/6` 全是版本字面量与那个用例数字；`docs/LOCAL-TESTING.md` 的 `3/3` 是本地包安装示例里的
`0.13.52.tgz → 0.13.53.tgz`。

## 6. 远端 run 与 Release（`CONFIRMED`，本轮用 `gh` 重读，不是抄派单）

| run | id | headBranch | headSha | 结论 |
| --- | --- | --- | --- | --- |
| Release | **`45810786218`** | `v0.13.53` | `50b3341` | **`success`** |
| CI（`main`） | **`45810749356`** | `main` | `50b3341` | **`success`** |

Release run 细节（`gh run view 45810786218 --json …`）：`displayTitle` = `chore(release): prepare v0.13.53`、
`createdAt 2026-11-26T11:27:42Z`、`updatedAt 11:29:21Z`；单个 job **`Validate and publish v0.13.53`**
`startedAt 11:27:44Z` → `completedAt 11:29:20Z`（约 **96 秒**），`conclusion = success`，
**19 个步骤里非 success 的 0 个**（按 `conclusion not in (success, skipped)` 过滤后为空）；
含 `Verify tag commit is on main`、`Verify committed build artifacts`、`Verify no untracked build artifacts`、
`Verify tag, package version, and changelog; prepare release notes`、`Create GitHub Release`。

**本轮自己先看了一遍这个 run**：`gh run view` 第一次读到时它还在 `in_progress`（`Test` 那一步在跑，
前 11 步已 success），等了约一分钟再读才变成 `completed / success`——**结论是等出来的，不是假设的**。

**GitHub Release**：https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.53

- 名字 `Grok Workflow for DSH v0.13.53`、`tagName v0.13.53`、`targetCommitish main`、
  `publishedAt 2026-11-26T11:29:16Z`、`isDraft` **`false`**、`isPrerelease` **`false`**，正文 **35 行**。
- 唯一资产 **`dsh-grok-workflow-0.13.53.tgz` = `1027274` 字节**（`gh` 报 `size`），
  摘要 **`sha256:35485d31c6abbc3e233aae6364e9924edc3d2386bd5dda62cb4feeb20dcb3a13`**（`gh` 报 `digest`）。
- 上一版资产 `0.13.52` = **`1021062`** 字节（本轮 `gh` 重读）→ **+6212 字节**（`1027274 − 1021062`）。

**三条判据同时成立才写「已发布」，本轮三条都成立**：run `conclusion=success` ✔、Release 非 draft ✔、
带 `.tgz` 资产 ✔（资产名与字节数见上）。

## 7. 真机 soak：一次，复用，这一版没有重跑（`CONFIRMED`，本轮核对目录与读数）

目录 **`.rsi/evidence/task-panel-2026-11-26/`**：从 live web 档案克隆出来的隔离档案、打包安装、真模型、端口 **3411**，
桌面 **1500 px** 一遍加 Chromium 窄屏三档（**390 / 360 / 700**）。本轮独立复核过，复核的结论是**这份证据站得住**：

| 项 | 读数 | 怎么读到的 |
| --- | --- | --- |
| 截图 | **10 张** | `ls soak/*.png \| wc -l` |
| 1500 px 那张图 | **16 节点 / 21 条边**，一句话 + 一颗状态胶囊 | `soak/readings.json` 的 `pnodes` / `edges` |
| 390 px 那张图 | **6 节点 / 7 条边** | 同上（`phone-390-running`） |
| 读数与图对得上 | `nodeCountsAgree` / `edgeCountsAgree` 全 `true` | `soak/readings.json` |
| Mermaid 真值 | 首行 `flowchart TD`、**16 行节点 / 21 行边 / 共 38 行**，与 JSON 对得上 | `soak/mermaid-done.txt`（`head -1`、`wc -l`、`grep -c -- '-->'`） |
| 控制台 | `{"consoleErrors": [], "pageErrors": []}`（桌面与手机两份） | `soak/raw-console-desktop.json`、`soak/raw-console-phone.json` |
| 构建可复现 | `cmp src/client/index.js lib/client.js` 通过，**399448** 字节 | 本轮 `cmp` + `sha256sum`（§2） |

**这份 soak 覆盖的是发布树，不是别的树**：产品代码在被 soak 的那个提交 `45909bb` 与发布 HEAD 之间**逐字未变**——
`git diff 45909bb c698a36 -- src lib test package.json package-lock.json` **0 行**（本轮实读），
且 `git merge-base --is-ancestor 45909bb c698a36` 成立。所以「soak 是在旧树上跑的」这一条不成立。

### 7.1 两条缺口，照实记，不软化

**① 卡住那一句在真机上零像素证据。** 它在 10 张截图里**一次都没有渲染**——
这是**对的**（那几次运行一路顺利，按设计它就不该出现；12 条读数的 `stuckPresent` 全是 `false`，本轮逐条读过）；
但「没画出来是因为不该画」和「画得出来」是两件事。同样地：

- `等你点头` / `未通过` / `已取消` / `出错` 这几颗胶囊在真机上**一次都没拍到**；
- **重试装饰（那段虚线）在真机上一次都没出现**——每条节点的尝试都只有一次，
  `mermaid-done.txt` 里 `-.->`（虚线边）**0 条**，21 条边全是实线（本轮 `grep -cF -- '-.->'` = **0**）。

**这几条路径现在靠的是确定性组件用例（`progress-panel.spec.ts` 25 条 + `progress-panel-model.spec.ts` 31 条）
和读代码，不是真机截图。** 不要把「真机过了」这句话用在这些状态上。

**② 已知的窄屏瑕疵与两处取证瑕疵。**

- **手机宽度有一处版面碰撞**：`phone-390-trace.png` 里摊开的调用卡片与下一颗任务节点**叠在一起**
  （节点画在卡片上面；文字仍然读得清）。同样是 390 px 那一档，**第三颗任务被输入框那块圆角面板裁掉**，
  而 `收下这版` 那颗按钮落在**折叠线以下**（要滚动才看得到）。
- **360 与 700 那两张是滚过顶部拍的**：顶上一句话与状态胶囊不在画面里，所以这两档的这两项
  **只有 DOM 读数、没有照片**。
- **两处取证 / 出处瑕疵**：`raw-readings-phone.json` 里 `phone-360-done` 与 `tablet-700-done` 两行**仍是过期的
  `nodeCalls/traceActive/traceDim = 1 / 5 / 19`**，与发出去的 `readings.json`（**`0 / 0 / 0`**）和重新拍过的图**互相矛盾**
  ——本轮两边逐条比对过，矛盾确实存在（`raw` 六行里 `phone-390-trace / phone-360-done / tablet-700-done` 都是 `1/5/19`，
  后两行在 `readings.json` 里是 `0/0/0`）；`desktop-1500-trace.png` 这个**名字会骗人**：
  它实际拍的是**轨迹没开**的状态，`readings.json` 里那条 `desktop-1500-trace` 也是 `0 / 0 / 0`，
  真正「轨迹开着」的是 `desktop-1500-node-open.png`（`1 / 5 / 19`）。

**这四条都记成已知项**：三条是取证 / 出处的瑕疵、一条是窄屏的版面磕碰，**都不是这次发布的拦路石**，
下一块顺手修（见 `HANDOFF.md`）。本轮**没有**改这些文件里的任何一个字。

## 8. `BLOCKED`：live 档案升级（`AGENTS.md` §13 这一步没做成）

**没写、没重载、没重启 3080 上的实例。** 理由：本会话文件策略 **`workspace-write`**，而 `~/.dsh` 在工作区之外，
写入不可能；本轮**没有做写探测**（纪律：不写 `~/.dsh`，探测一次只是再撞一次同一面墙）。

只读的读数（本轮用 `stat` / `grep` **只读**复核过一次，没有写任何东西）：

| 项 | 值 | 怎么读到 |
| --- | --- | --- |
| `~/.dsh` 目录 mtime | `2026-11-25 23:14:14 +0800` | `stat -c '%y' ~/.dsh` |
| `~/.dsh/profiles` mtime | `2026-11-22 16:59:46 +0800` | `stat -c '%y' ~/.dsh/profiles` |
| **`~/.dsh/profiles/web` mtime** | **`2026-11-26 19:20:42 +0800`** | `stat -c '%y' ~/.dsh/profiles/web` |
| live 装着的插件版本 | **`0.13.52`** | `grep '"version"' ~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json` |
| 那一行的写法 | `"dsh-grok-workflow": "github:free6589/dsh-grok-workflow"`（**浮动，没有标签固定**） | `~/.dsh/profiles/web/package.json` 第 12 行 |

也就是说：**已经发布到 `0.13.53`，live 档案还在 `0.13.52`，而且那一行是浮动的**。
升级需要**一个对 `~/.dsh` 有写权限的操作员上下文**；顺手要把那一行**钉到 `#v0.13.53`**，
否则它永远跟着 `main` 漂，读回来也不是确定的版本（`AGENTS.md` §13 的要求）。

**一条只读观察，照实记、不追责**：`~/.dsh/profiles/web` 的 mtime 落在今天 **19:20:38–42** 这个窗口里
（派单记录的时间窗是 19:20:38–42，本轮实读的 mtime 是 `19:20:42.728`），而 live 现在读回的插件版本是 **`0.13.52`**
——即**另一个进程在这个窗口里往 `~/.dsh/profiles/web` 装了东西**。**这不是本块的写入**（本块写不进 `~/.dsh`，
也从未申请过），成因**未查明**（`HYPOTHESIS`）。

## 9. `NOT_RUN`（照实写，不包装）

| 没做的事 | 为什么 / 现在靠什么覆盖 |
| --- | --- |
| 门禁重跑 | 转录已存在且**自带 `GATE_EXIT=0`**（§3），纪律（`AGENTS.md` §12）是不重跑。 |
| 真机 soak 重跑 | 这一版**没有重跑**，复用 `.rsi/evidence/task-panel-2026-11-26/` 那一次（§7）；产品代码在两个提交之间逐字相同，所以覆盖成立。 |
| 卡住态 / 重试虚线 / `等你点头` / `未通过` / `已取消` / `出错` 的真机截图 | **零像素证据**（§7.1 ①）；只有组件与模型用例覆盖，**不冒充真机**。 |
| 块内轻门禁的第二来源 | §3.1 那组读数是**派单记录**，本轮在本目录里没有找到对应的转录。 |
| `e44e26a` 上单独的门禁 | 那一格没有转录；`2060` 是从发布提交的 `README` diff 反读的（§4），不是测的。 |
| live 档案升级 / 读回新版本 | 见 §8，`BLOCKED`；写不进 `~/.dsh`，所以 live 上没有任何 0.13.53 的痕迹（只有只读读数）。 |
| 1000 / 700 px 以上宽度的重拍 | `NOT_RUN`：这一轮不重跑 soak，也就没有补拍。 |
| README / CHANGELOG / `src` / `test` / `lib` 的任何改动 | **本块不改**：这一块只写文档。 |

## 10. 每条读数能回指哪里

| 读数 | 回指 |
| --- | --- |
| Node / npm / DSH / 内核 | 本轮 `node -v`、`npm -v`、`dsh --version`、`uname -srm` |
| 发布提交 `50b3341`、父 `c698a36`、8 文件 / +24 −22、`19:20:30` | `git show --stat --numstat --format=… 50b3341` |
| `version: 0.13.53` | `git show 50b3341:package.json` |
| `main` = `origin/main` = `50b3341`、ff-only、`describe` = `v0.13.53` | `git rev-parse main origin/main`、`git merge-base --is-ancestor 50b3341 main`、`git describe --tags 50b3341` |
| 合并 `c698a36` 两个父、零冲突（`main` 是祖先、树与功能尖端相同） | `git cat-file -p c698a36`、`git merge-base --is-ancestor e44e26a ae4d4c1`、`git rev-parse c698a36^{tree} ae4d4c1^{tree}`（同 `a5a895e`）、`git diff --stat ae4d4c1 c698a36`（0 行） |
| 标签对象 `8a0f9be0…` / 剥出 `50b3341` / tagger `19:27:30` | `git cat-file -p v0.13.53`、`git rev-parse v0.13.53 v0.13.53^{}`、`date -d @1795692450` |
| 旧标签没被移动 | `git ls-remote --tags origin \| grep -E 'v0\.13\.5[123]'` |
| 门禁全部读数与行号 | `gate-50b3341.out`（本目录）：2–3（包与阶段）、152（`14 warnings`）、153（`187 files with 96 rules`）、158/168（`399448 bytes`）、159（`293 files, byte-identical`）、170（runner）、387/388（`105` / `2030`）、389/390（`19:20:51` / `106.86s`）、392（`GATE_EXIT=0`） |
| 转录里没有 FAIL | `grep -cE 'FAIL' gate-50b3341.out` → **0** |
| 转录指纹 | `wc -lc gate-50b3341.out`、`sha256sum gate-50b3341.out` |
| 份数 105 / 105 / 105 | `git ls-tree -r --name-only <sha> -- test \| grep -c '\.spec\.ts$'` |
| 两份旧 spec 删除、两份新 spec 新增（行数）、`progress-connector` / `progress-hint-absent` 改动 | `git diff --stat e44e26a..c698a36 -- test \| grep progress` |
| 发布提交不碰 `test/` | `git diff --name-only c698a36..50b3341 -- test` → 0 行 |
| `2060 → 2030` | `git show 50b3341 -- README.md README.zh-CN.md \| grep -E '^[-+].*(2060\|2030)'` |
| 两个 run 的结论与 sha | `gh run view 45810786218 --json …`、`gh run list --limit 6 --json …`（`45810749356` 也在里面） |
| Release 名字 / 时刻 / 资产 / 摘要 / 正文行数 | `gh release view v0.13.53 --json name,isDraft,isPrerelease,targetCommitish,publishedAt,assets`、`gh release view v0.13.53 --json body \| wc -l` |
| 上一版资产 `1021062` / `+6212` | `gh release view v0.13.52 --json assets` |
| `CHANGELOG` 形状 | `sed -n '5,9p' CHANGELOG.md` |
| `src` 与 `lib` 逐字节相同、`399448` 字节 | `cmp src/client/index.js lib/client.js`、`sha256sum` 两者同值 |
| soak 覆盖发布树 | `git diff --stat 45909bb c698a36 -- src lib test package.json package-lock.json`（0 行）、`git merge-base --is-ancestor 45909bb c698a36` |
| soak 的 10 张图、16/21 与 6/7、Mermaid 真值、控制台、`stuckPresent` 全 `false`、过期 `raw` 两行 | `ls .rsi/evidence/task-panel-2026-11-26/soak/*.png \| wc -l`、`soak/readings.json`、`soak/mermaid-done.txt`（`grep -cF -- '-.->'` = 0）、`soak/raw-console-*.json`、`soak/raw-readings-phone.json` 与 `readings.json` 逐条比对 |
| 清理 | `git worktree list`（只剩主检出 `50b3341 [main]`）、`git branch -a \| grep release/`（只剩 `origin/release/0.13.27`） |
| live 档案只读读数 | `stat -c '%y' ~/.dsh ~/.dsh/profiles ~/.dsh/profiles/web`、`grep '"version"' ~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json`、`~/.dsh/profiles/web/package.json` 第 12 行 |

## 11. 红线与偏差，照实记

1. **没有 force-push，没有重写历史，没有移动任何已发布标签**：`git ls-remote --tags origin` 本轮重读，
   `v0.13.52 → 9c7ebe3c…`、`v0.13.51 → a2c7eeab…` 与上一轮记录同值，`v0.13.53` 是新增。
2. **本块只写文档**：没有 `git add` / `commit` / `push`，没有建或移动任何标签，没有改 `CHANGELOG.md`、`README*`、
   `src/`、`test/`、`lib/` 的任何一行，也没有改本目录的 `gate-50b3341.out`（只读）。
3. **两处别的会话的遗留没碰**：`.gitignore` 是 modified、`.rsi/evidence/progress-now/` 是未跟踪
   ——没有暂存、没有提交、没有修改、没有回滚（`git status --short` 复核过）。
   本目录 `.rsi/evidence/release-0.13.53-2026-11-26/` 自己也是**未跟踪的新目录**，等操作员提交。
4. **`BLOCKED` 不是失败**：live 档案升级缺的是「能写 `~/.dsh`」这一个能力，不是步骤走错（§8）。
5. **一处口径要说准**：`0.13.52` 的 soak 是**复用的**，这一版**没有重跑真机**；「soak 覆盖发布树」的根据是
   产品代码在两个提交之间逐字相同（§7），不是又跑了一遍。
6. **合并那句话要说准**：「`git merge --no-ff`、零冲突」的真相是**没有冲突可解**（`main` 是功能分支的祖先，
   合并树与功能尖端逐字相同），不是「解得很顺」（§2）。
