# `0.13.39` 发布轮：一次门禁、快进 `main`、附注标签、Release 与资产（2026-11-25）

发布轮，不是代码轮。`main` 尖端 **`ed287e1ff55cc6b049bd746d2415bb35d9cf6c9a`**（= `origin/main`，包版本 **`0.13.38`**，
即上一版标签 `v0.13.38` 剥出的 `8c9b028` 之后那 18 个提交的终点）上切出发布 worktree
**`.tmp/wt-release-0.13.39`**（分支 `release/0.13.39`，先自己跑 `npm ci --prefer-offline`，`EXIT=0`），
那上面只有一个发布提交 **`18e546332a8c10c6de99ff344886e7fa77b3658c`** `chore(release): prepare v0.13.39`。

**这个目录里只有一份转录**，就是发布门禁的完整原文，**逐字未改**。原件是那个 worktree 里的 scratch，worktree 收尾要删掉，
所以副本落在这里——本轮实读 `.tmp/wt-release-0.13.39` **已不在盘上**，这一份就是 durable 的那一份。
口径：`AGENTS.md` §2 的四个状态词。每条结论都能回指下面的一份日志或一行读数。

## 清单

| 文件 | 跑在哪棵树上 | 是什么 | 结论 |
| --- | --- | --- | --- |
| `gate-18e5463.out` | 发布提交 **`18e5463`**（`chore(release): prepare v0.13.39`，**8 文件 / +33 −20**） | **发布门禁——唯一一遍，也是最权威的一遍** | `EXIT=0`，`100 files / 1855 tests`，`15 warnings / 0 errors`，`334321` 字节，`lib/ at 18e5463 … (285 files, byte-identical)` |

cwd 是 `.tmp/wt-release-0.13.39`，命令是 `TMPDIR=$PWD/.tmp npm run ci`
（即 `npm run typecheck && npm run lint && npm run verify:lib && npm test`）。
**这一遍跑在即将打标签的那个提交上**，`main` 随后用 `git merge --ff-only release/0.13.39` 前进到同一个提交，
所以 `main` 尖端、门禁提交、标签 `v0.13.39` 剥出的提交是**同一个**（三值本轮实读都是 `18e5463`）。

## 一、`18e5463`（发布门禁）

指纹（本轮自查）：**22316 字节**，`sha256sum` =
**`aed6c3ef42ba4e16977a9bb91309d324c5dd8e797399792526ac8c69d9041b6f`**。
与主检出 `.tmp/gate-18e5463.out` 用 `cmp` 比过，**逐字节相同**。

逐行读数（行号是这一份里的真实行号）：

| 行 | 原文 |
| --- | --- |
| 2 | `> dsh-grok-workflow@0.13.39 ci` |
| 162 | `Found 15 warnings and 0 errors.` |
| 168 | `client bundle: 334321 bytes → lib/client.js` |
| 169 | `lib/ at 18e5463 is the build of src/ at 18e5463 (285 files, byte-identical)` |
| 178 | `client bundle: 334321 bytes → lib/client.js`（`npm test` 里的 `npm run build` 又构建一次，同字节数） |
| 369 | ` Test Files  100 passed (100)` |
| 370 | `      Tests  1855 passed (1855)` |
| 372 | `   Duration  90.16s (transform 2.05s, setup 0ms, import 8.32s, tests 70.67s, environment 11ms)` |

转录以绿的 vitest 摘要收尾，全文 `FAIL` / `✗` **0 行**。
**`334321` 出现两次是正常的**：`verify:lib` 先算一次，`npm test` 里的 `npm run build` 再构建一次，两次同值正好说明重建可复现；
门禁跑完发布 worktree 的工作树是干净的（重建没有留下差异）。**`CONFIRMED`**

## 二、读者能自己算的算术（只读 git 对象，本轮自查）

| 量 | `8c9b028`（`v0.13.38` 发布提交） | `18e5463`（本轮发布提交） | 差 |
| --- | --- | --- | --- |
| spec 文件（`git ls-tree -r --name-only <commit> -- test \| grep -c '\.spec\.ts$'`） | **100** | **100** | **0**（一个没增、没删） |
| 用例（转录里 vitest 自己报的） | 1870 | **1855** | **−15** |
| `lib/client.js`（`git cat-file -s <commit>:lib/client.js`） | **340426** 字节 | **334321** 字节 | **−6105** |
| oxlint 告警 | 15 | **15** | **0** |

`git diff --name-status 8c9b028 18e5463 -- test` 只有 **6 个既有 spec 被改**（`client.spec.ts`、`i18n-parity.spec.ts`、
`panel-links.spec.ts`、`progress-connector.spec.ts`、`progress-hint-absent.spec.ts`、`progress-tab.spec.ts`），
**没有新增、没有删除任何 spec 文件**——所以「−15 例 / −6105 字节」不是发布提交干的。

**是谁干的，证据在这里**：进度页重画的证据 `.rsi/evidence/progress-redesign-2026-11-25/README.md`
**第 41 行**（那张两行对照表里「交付 `87f14e1`（产品 `e85c35f`）」那一行）在**交付当时**就已经写着
`Tests 1855 passed (1855)` 与 `client bundle: 334321 bytes → lib/client.js`，同表上一行基线 `ff5c5ec` 写着
`1870` / `340426`。也就是说这 −15 例、−6105 字节在 `87f14e1` 就发生了，本轮的发布提交只是**把它带出去**，
既没加重也没回收。spec 文件数 100 → 100 与那份证据的「未变」也一致。**`CONFIRMED`**

## 三、`main`、推送与标签

| 项 | 读数 | 命令 |
| --- | --- | --- |
| `main` 尖端 = 门禁提交 = 标签剥出 | 三值同为 **`18e546332a8c10c6de99ff344886e7fa77b3658c`** | `git rev-parse main v0.13.39^{}` |
| 远端 `refs/heads/main` | **`18e546332a8c10c6de99ff344886e7fa77b3658c`** | `git ls-remote origin refs/heads/main` |
| 推送原文 | `ed287e1..18e5463  main -> main` | 包工头跑；**没有 force-push** |
| 标签类型与对象 | **`tag 87a0e0e9a52e932d33584fc11434f63a74c87939`** → 剥出 **`18e5463`** | `git rev-parse v0.13.39 v0.13.39^{}`；`git cat-file -p v0.13.39` |
| 标签里的版本 | `git show v0.13.39^{}:package.json` 读 **`0.13.39`** | 同左 |
| 标签创建时刻 | `tagger fish <…> 1795608793 +0800` = **2026-11-25 20:13:13 +0800** | `git cat-file -p v0.13.39` |
| 标签推送 | `* [new tag] v0.13.39 -> v0.13.39` | 包工头跑 |

**已发布标签一个都没被移动**（`git ls-remote --tags origin`，本轮重读）：

| 标签 | 远端标签对象 | 剥出的提交 |
| --- | --- | --- |
| `v0.13.35` | `bedf8ba2ede944bec9156d114a57f3a7d70444b3` | **`ffbb6b0`** |
| `v0.13.36` | `0ff357bcac653fc3a91ca1f7fb269335be6c2ea5` | **`26dc370`** |
| `v0.13.37` | `235fa3e3ab2b1f1f7815ba16b905d53c60da8d3f` | **`34236f0`** |
| `v0.13.38` | `2f3e548bcbc029c7e534ad52556058a09361eeef` | **`8c9b028`** |
| `v0.13.39` | `87a0e0e9a52e932d33584fc11434f63a74c87939` | **`18e5463`** |

前四行与上一轮的记录**逐字同值**。**`CONFIRMED`**

## 四、两条远端 run

| run | 工作流 | head | 结论 | URL |
| --- | --- | --- | --- | --- |
| **`45611695688`** | `Release` | 分支 `v0.13.39`、sha `18e5463` | **`success`** | https://github.com/free6589/dsh-grok-workflow/actions/runs/45611695688 |
| **`45611690753`** | `CI` | 分支 `main`、sha `18e5463` | **`success`** | https://github.com/free6589/dsh-grok-workflow/actions/runs/45611690753 |

Release run 的 job `Validate and publish v0.13.39` **1m26s** 内全绿，步骤逐条：`Set up job`、`Check out the version tag`、
`Fetch main branch`、`Verify tag commit is on main`、`Set up Node.js`、`Install dependencies`、`Typecheck`、`Lint`、`Build`、
`Verify committed build artifacts`、`Verify no untracked build artifacts`、`Test`、`Check package file list`、
`Verify tag, package version, and changelog; prepare release notes`、`Package release artifact`、**`Create GitHub Release`**，
外加三个 `Post …` 与 `Complete job`。本轮用 `gh run watch 45611695688 --exit-status --interval 20` 等到结束（`WATCH_EXIT=0`），
随后用 `gh run view` 复核两条的 `status=completed` / `conclusion=success`。**`CONFIRMED`**

两条 run 在 GitHub 上带 **11 条 annotation**（`gh api …/check-runs/<job>/annotations` 实读）：**1 条** runner 弃用提示
（`Node.js 20 is deprecated`），**10 条** oxlint 提示（`test/delivery.spec.ts:394` 两条、`test/timeout-config.spec.ts:252`、
`test/iterate.spec.ts:7`、`test/progress-hint-absent.spec.ts:197`、`test/replan.spec.ts:9`、`test/unload-drain.spec.ts:50`、
`src/client/index.js:1587` / `:933`、`src/redact.ts:290`）。
**10 与门禁的 `15 warnings` 不是矛盾**：annotation 是 GitHub 侧的展示，不是完整告警清单；权威计数是本地门禁那 15 条
（与基线同数，本轮没新增）。**`CONFIRMED`**

## 五、GitHub Release 与资产

| 字段 | 值 |
| --- | --- |
| 名字 | **`Grok Workflow for DSH v0.13.39`** |
| `tagName` | `v0.13.39` |
| 发布时刻 | **`2026-11-25T12:14:50Z`**（= 20:14:50 +0800） |
| `isDraft` / `isPrerelease` | **`false` / `false`** |
| `targetCommitish` | `main` |
| 唯一资产 | **`dsh-grok-workflow-0.13.39.tgz`**，`size=`**`962715`** 字节，`state=uploaded` |
| 资产 digest | `sha256:30d639274778134521856ae7ad6da212dac988b5797f9a59b59e756f2d126d0d` |
| 正文 | 首行 `## [0.13.39] - 2026-11-25`，**42 行** |
| URL | https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.39 |

命令：`gh release view v0.13.39 --json name,tagName,isDraft,isPrerelease,publishedAt,targetCommitish,assets,body,url`。
资产只有一个，**没有多余的上传件**。与上一版比：`0.13.38` 的资产 **958707** 字节 → 本轮 **962715** 字节（**+4008**），
同期 `lib/client.js` 减了 6105 字节——包变大主要是服务端 `lib/` 与文档的净变化，不是客户端 bundle。**`CONFIRMED`**

## 六、收尾状态与 live 档案（只读）

- `git worktree list` 只剩主检出 **`/home/fish/projects_mine/dsh-grok-workflow 18e5463 [main]`**；
  `.tmp/wt-release-0.13.39` **已不在盘上**（`ls` 报 `No such file or directory`）；本地分支只剩 `main`
  与三条 `backup/wip-2026-11-24-*`、`feat/audit-layer`；本地 `release/0.13.39` 已删；
  远端 `release/*` 只有 `release/0.13.27`（`git ls-remote origin 'refs/heads/release*'`）。**`CONFIRMED`**
- 那四条分支**很旧，且与本版无关**：`backup/wip-2026-11-24-live-steering` 落后 **381** / 领先 1、
  `backup/wip-2026-11-24-team-dispatch-v1` 落后 **347** / 领先 4、
  `backup/wip-2026-11-24-progress-task-number-first` 落后 **378** / 领先 1、
  `feat/audit-layer` 落后 **638** / 领先 1。它们各自的提交**一条都没进这个版本**——不要读成「已合流」。
- live 档案 `/home/fish/.dsh/profiles/web/cordis.patch.yml` 的 `grok-workflow` 那一行（第 **563** 行）`config:` 下
  **仍写着 `mode: triage`**；已装版本读回 **`0.13.38`**（`node -p` 读
  `~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json` 的 `version`）；依赖是**浮动**的
  `github:free6589/dsh-grok-workflow`（`package.json` 第 12 行，**无标签**），`pnpm-lock.yaml` 把它解析到
  `codeload…/tar.gz/ed287e1ff55cc6b049bd746d2415bb35d9cf6c9a`、`version: 0.13.38`。
  `~/.dsh` size **1548** / mtime **1795362020**、`~/.dsh/profiles` size **226** / mtime **1795337986**，与上一轮记录**同值**。
  **未写、未重载、未重启**，3080 上的实例全程没碰。**`CONFIRMED`（未打印任何凭据值）**
- `AGENTS.md` §11 的 live 档案升级：**`BLOCKED`**。本会话文件策略 `workspace-write`，`~/.dsh` 在工作区之外，
  审批提示在本会话被禁用（不能申请提权），**从这里写不进去**。这是等外部能力，不是升级失败。

## 七、这一份能证明什么、不能证明什么

**能证明**：`18e5463` 这一棵树上，`TMPDIR=$PWD/.tmp npm run ci` 一次跑完 `EXIT=0`，读数是上表那些数字；
所以打标签的那个提交是通过门禁的，`main` 快进到它之后也没有再变。谁都可以用 `sha256sum` 对这里的副本，
确认它与 `VALIDATION.md` 引用的指纹是同一份。

**不能证明**：① 它**不是**本轮重跑的结果——转录是发布执行方跑出来的，本轮做的是**拷副本 + 逐行核对**，不是复跑；
② 它**只覆盖 `18e5463` 这一棵树**，不覆盖 `ed287e1`（基线），也不覆盖远端 runner 上的 `Test` 步骤（那一遍读数在 run
`45611695688` 的日志里，不在这个文件里）；③ 转录里的 `lib/ at 18e5463 …` 是**跑那一刻的 HEAD 名字**，不是内容指纹，
内容指纹要看 `sha256`；④ 它不证明 live 档案跑的是这一版——live 那件事是 `BLOCKED`，见上一节。
