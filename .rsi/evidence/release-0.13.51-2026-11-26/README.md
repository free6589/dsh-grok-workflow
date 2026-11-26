# `0.13.51` 发版证据（**released**：`v0.13.51` 已发布，发布提交 **`16453c4`**）

repo: `dsh-grok-workflow` · 合并提交 **`e38d5cc`**（`Merge branch 'fix/supervisor-paths' into release/0.13.51`，两父 `c6248f8` + `8d8e60a`）→
发布提交 **`16453c4`** · 附注标签 **`v0.13.51`**（对象 **`a2c7eeab91ce715bdc481bed38d2c959a9ebfbab`** → 剥出 **`16453c4`**）·
`main` = `origin/main` = **`16453c4`**（从 `c6248f8` **快进**）· 发布 **2026-11-26T08:18:47Z** ·
<https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.51>

**`v0.13.51` 已经发出去了。** GitHub Release 上的唯一资产是 `dsh-grok-workflow-0.13.51.tgz`，
**1019833** 字节、`digest sha256:1520964cb19805be910e65f7b9602a91d1852767fea6af95750b0deaad855f6e`；
非 draft、非 prerelease、`tagName` = `v0.13.51`、`targetCommitish` = `main`；两个远端 run
（`/actions/runs/45781883093` 是 `main` 的 CI、`/actions/runs/45781886669` 是 `v0.13.51` 的 Release）都 **success**。
**发布门禁是本目录的 `gate-release-16453c4.out`**——在**已发布的树**上跑的、也是这一版唯一一次完整门禁。

## 1. 文件

| 文件 | 行 / 字节 | `sha256`（前 16） | 是什么 |
| --- | --- | --- | --- |
| **`gate-release-16453c4.out`** | **401 / 24285** | **`51f497cbac00b5d7…`** | **发布提交 `16453c4`** 上的 `TMPDIR=$PWD/.tmp npm run ci`——**末行 `GATE_EXIT=0`**（第 401 行）；`Found 15 warnings and 0 errors.`（第 162 行）、`lib/ at 16453c4 is the build of src/ at 16453c4 (293 files, byte-identical)`（第 169 行）、`client bundle: 386534 bytes → lib/client.js`（第 168 / 178 行）、`Test Files 105 passed (105)`（第 396 行）、`Tests 2057 passed (2057)`（第 397 行）、`Duration 99.74s`（第 399 行）。**这一份是发布门禁** |

原件一份；本索引只补出处。行数 / 字节数 / `sha256` 是写这一份时自己 `wc -lc`、`sha256sum` 读的，
与派单 foreman 交付时报的值逐字相同（`401 / 24285 / 51f497cb…`）。**转录文件本身没有改动、没有移动。**

## 2. 门禁读数（`CONFIRMED`，读的就是 `gate-release-16453c4.out`）

| 读数 | 值 | 行号 |
| --- | --- | --- |
| `Found N warnings and 0 errors.` | `15 warnings and 0 errors` | 162 |
| `verify:lib` | `lib/ at 16453c4 is the build of src/ at 16453c4 (293 files, byte-identical)` | 169 |
| `client bundle` | `386534 bytes → lib/client.js` | 168（`verify:lib` 那一步）、178（`npm run build` 那一步） |
| `Test Files` | `105 passed (105)` | 396 |
| `Tests` | `2057 passed (2057)` | 397 |
| `Duration` | `99.74s`（`transform 2.24s` / `import 8.22s` / `tests 79.78s`） | 399 |
| **末行** | **`GATE_EXIT=0`** | **401** |

这条命令是**唯一一次**完整门禁，`AGENTS.md` §12 不允许在同一个版本里重跑第二遍——写这一份的这一轮**没有重跑任何套件**，
只逐行复核了这份转录。

**与上一版（`0.13.50`）的算术**：用例 `2045 → 2057`（**+12**），测试文件 `105 → 105`（不变），
`lib/` 文件数 `293 → 293`（不变），客户端 bundle `386534 → 386534` 字节（**这一版没动浏览器包**，
`lib/client.js` 那两行只是版本字符串替换）。lint 读数与 `0.13.50` 同值（`15 warnings / 0 errors`）。

## 3. 交付链条（`CONFIRMED`，`git` 侧）

| 提交 | 父 | stat | 内容 |
| --- | --- | --- | --- |
| `c6248f8` | — | — | `main` 的发版基线（= `0.13.50` 收口那一颗记忆提交） |
| `08dd95d` | `c6248f8` | 8 文件 / +572 −19 | 源码 + 用例：关单按「批准时的目录」读产物，空拆法硬拒 |
| `3598eaa` | `08dd95d` | 22 文件 / +242 −25 | `lib/` 重建（`lib/ at 3598eaa … byte-identical`） |
| `8d8e60a` | `3598eaa` | 5 文件 / **+165** | 记忆：`docs(memory): record the approval-directory fix (D-171)`（`CHANGELOG.md` 20、`DECISIONS.md` 58、`HANDOFF.md` 23、`STATE.md` 26、`VALIDATION.md` 38） |
| **`e38d5cc`** | `c6248f8` + `8d8e60a` | 35 文件 / +979 −44 | `Merge branch 'fix/supervisor-paths' into release/0.13.51`（**零冲突**） |
| **`16453c4`** | `e38d5cc`（**单亲**） | 8 文件 / **+24 −22** | `chore(release): prepare v0.13.51`：`CHANGELOG.md` 2/0、`README.md` 6/6、`README.zh-CN.md` 6/6、`docs/LOCAL-TESTING.md` 3/3、`lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、`src/client/index.js` 2/2 |

**合流是快进、发布本身没有 merge 提交**：`main` 从 `c6248f8` 用 `git merge --ff-only release/0.13.51` 走到 `16453c4`；
唯一的合并提交是功能分支入 release 那一颗 `e38d5cc`。推送输出 `c6248f8..16453c4  main -> main`（**派单记录**；
写这一份的这一轮自己读到的是 `git reflog show main` → `16453c4 main@{0}: merge release/0.13.51: Fast-forward`）。

**这一版用户看到的两件事**（`CHANGELOG.md` 的 `## [0.13.51] - 2026-11-26` 那一节）：批准一块活时插件记住**你在哪个文件夹批准的**，
交工时去那个文件夹核对报上来的文件（而不是插件进程碰巧站的地方），两边都规范化，所以同一个文件夹绕一次符号链接不再被读成块外，
换会话、重启之后答案也一样；以及**交工一条任务都没拆的，现在直接退回**，不再放过去。升级不用准备：没有设置、存储格式或默认值变化。

## 4. 远端两个 run（`CONFIRMED`，`gh run view` 只读读的）

| run | id | 触发 | 头分支 / sha | 结论 |
| --- | --- | --- | --- | --- |
| CI | **`45781883093`** | `push` | `main` / `16453c4` | `completed` / **`success`** |
| Release | **`45781886669`** | `push` | `v0.13.51` / `16453c4` | `completed` / **`success`**（`08:17:17Z` → `08:18:49Z`） |

**没有 `--force`、没有移动任何已发布的标签**：推标签输出 `* [new tag] v0.13.51 -> v0.13.51`、以及「`v0.13.51` 推之前在本地与远端都不存在
（`git tag -l` 与 `git ls-remote --tags origin 'refs/tags/v0.13.51*'` 各读一次）」——**这三句是派单记录**，推送当场没有留转录、
写这一份的这一轮也无法回读；**这一轮推后自己读**到的是远端 `refs/tags/v0.13.51` = 对象 `a2c7eeab…`、其 `^{}` = `16453c4…`，
**远端只有这一条**。

## 5. 资产与上一版的差（`CONFIRMED`）

| 版本 | 资产 | 字节 | `digest sha256` |
| --- | --- | --- | --- |
| `0.13.50` | `dsh-grok-workflow-0.13.50.tgz` | `1015152` | `50b191cd…`（见 `release-0.13.50-2026-11-26/README.md`） |
| **`0.13.51`** | **`dsh-grok-workflow-0.13.51.tgz`** | **`1019833`** | **`1520964cb19805be910e65f7b9602a91d1852767fea6af95750b0deaad855f6e`** |

**差值 +4681 字节**（`1019833 − 1015152`）。Release 正文非空：**22 行 / 2364 字节**（`gh release view … -q .body` 自己 `wc -lc` 读的），
内容就是 `CHANGELOG.md` 的 `## [0.13.51] - 2026-11-26` 那一节。

## 6. 本轮「没发生的」（照实）

- **`NOT_RUN`** — 写这一份的这一轮**没有重跑整份门禁的第二遍**（`AGENTS.md` §12），也**没有重跑真机 soak**：
  `0.13.51` 只证明确定性那六道检查 + 空拆法硬拒看得见批准目录、判得出范围；
  监工的**模型判断**那条腿（`src/supervisor/verdict.ts`）**至今一次都没有在真机上跑过**，也没有在隔离 `DSH_HOME` 里走完
  一次「批准→交工→判词」的完整回合——这条缺口随这一版原样带下去，见 `HANDOFF.md` 同日条目。
- **`NOT_RUN`** — `src/supervisor/verdict.ts` 那句 `（这次交工没有报任务拆法）` **已不可达但仍在**（第 1 道检查先否决），
  因为导出的 `supervisorPrompt` 仍可被塞空拆法，**故意留着、没有删**；删它不在本轮范围。
- **`BLOCKED`** — `AGENTS.md` §13 的 live 档案升级：这一轮是 `workspace-write`、`~/.dsh` 在工作区外、审批提示被禁用。
  做了一次探测 `: > ~/.dsh/.release-probe-0.13.51`，被拒（`Read-only file system`），
  **没有重试绕过、没有重载、没有重启、没有写 `~/.dsh`、3080 端口没碰**。
  live 里那一行读作浮动的 `github:free6589/dsh-grok-workflow`，装着的副本读作 **`0.13.48`**。
  要做的人把它钉到确切的 `v0.13.51`、读回 `0.13.51`，读不回就回滚那一行并报出回滚后的版本。
- **`NOT_RUN`** — npm publish：本仓库不发 npm，发布面只有 GitHub Release。
