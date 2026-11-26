# `0.13.50` 发版证据（**released**：`v0.13.50` 已发布，发布提交 **`55a8afd`**）

repo: `dsh-grok-workflow` · 附注标签 **`v0.13.50`**（对象 **`8d07914432851377ad460aa85d296f11296b77c9`** → 剥出 **`55a8afd`**）·
`main` = `origin/main` = **`55a8afd`**（从 `33c170b` 快进）· 发布 **2026-11-26T07:27:38Z** ·
<https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.50>

**`v0.13.50` 已经发出去了。** GitHub Release 上的唯一资产是 `dsh-grok-workflow-0.13.50.tgz`，
**1015152** 字节、`digest sha256:50b191cdec86d338efa063a6088896bb00c1e05ca2800ec9ce9664f8edbf5719`；
非 draft、非 prerelease、`tagName` = `v0.13.50`、`targetCommitish` = `main`；两个远端 run
（`/actions/runs/45775313465` 是 `main` 的 CI、`/actions/runs/45775329492` 是 `v0.13.50` 的 Release）都 **success**。
**发布门禁是本目录的 `gate-release-55a8afd.out`**——在**已发布的树**上跑的、也是这一版唯一一次在发布提交上跑的整份门禁。

## 1. 文件

| 文件 | 行 / 字节 | `sha256`（前 16） | 是什么 |
| --- | --- | --- | --- |
| **`gate-release-55a8afd.out`** | **373 / 22004** | **`07bdb64d43652bb5…`** | **发布提交 `55a8afd`** 上的 `TMPDIR=$PWD/.tmp npm run ci`——**末行 `GATE_EXIT=0`**；`Found 15 warnings and 0 errors.`（第 162 行）、`client bundle: 386534 bytes → lib/client.js`（第 168 / 178 行）、`lib/ at 55a8afd is the build of src/ at 55a8afd (293 files, byte-identical)`（第 169 行）、`Test Files 105 passed (105)`（第 368 行）、`Tests 2045 passed (2045)`（第 369 行）、`Duration 86.34s`（第 371 行）。**这一份是发布门禁** |

原件一份；本索引只补出处。行数 / 字节数 / `sha256` 是收口这一轮自己 `wc -lc`、`sha256sum` 读的，
与 integrator 交付时报的值逐字相同（`373 / 22004 / 07bdb64d…`）。

**一份作废的转录没有收进本目录**：同一 `TMPDIR` 下还有 `gate-release-c2f2abc.out`（22389 字节），那是
**amend 前**的 `c2f2abc` 上跑的；`55a8afd` 是 amend 后的提交，`c2f2abc` 从未是尖端、也从未进 `main`，
所以它**不归档、不算发布门禁**（留在 `.tmp/` 里随 worktree 一起删）。

## 2. 门禁读数（`CONFIRMED`，读的就是 `gate-release-55a8afd.out`）

收口这一轮**自己逐行读的原件**，不是转述 integrator 的话：

| 读数 | 值 | 行号 |
| --- | --- | --- |
| `package.json` 版本（`npm run ci` 打的 banner） | `dsh-grok-workflow@0.13.50` | 第 1 行起，五处 |
| `Found N warnings and 0 errors.` | `15 warnings and 0 errors` | 162 |
| `client bundle` | `386534 bytes → lib/client.js` | 168（`verify:lib` 那一步）、178（`npm run build` 那一步） |
| `verify:lib` | `lib/ at 55a8afd is the build of src/ at 55a8afd (293 files, byte-identical)` | 169 |
| `Test Files` | `105 passed (105)` | 368 |
| `Tests` | `2045 passed (2045)` | 369 |
| `Duration` | `86.34s` | 371 |
| **末行** | **`GATE_EXIT=0`** | **373** |

**收口这一轮另外自己跑了一遍 `node scripts/verify-lib.mjs`**（不是整份门禁，按 `AGENTS.md` §12 只跑这一条），
在发布 worktree 的 `55a8afd` 干净树上：`client bundle: 386534 bytes → lib/client.js` /
`lib/ at 55a8afd is the build of src/ at 55a8afd (293 files, byte-identical)` / `VERIFY_LIB_EXIT=0`。
跑完 `git status --short` 仍是空（`verify:lib` 重建出的 `lib/client.js` 与提交里的字节相同，不留 diff）。

**与上一版（`0.13.49`）的算术**：用例 `2034 → 2045`（**+11**），测试文件 `105 → 105`（不变），
客户端 bundle `372480 → 386534` 字节（**+14054**）。`lib/` 的文件数 `293 → 293` 不变。

## 3. 三颗提交（`CONFIRMED`，`git` 侧）

| 提交 | 父 | stat | 内容 |
| --- | --- | --- | --- |
| `4278ccd` `feat(progress): the phone figure is a tree — two rails, wrapping names, fork and rejoin wires` | `33c170b`（**单父**） | 36 文件 / +2491 −90 | 手机树排版 + 四份 spec + 记忆四件 + 本目录旁边的 `mobile-tree-2026-11-26/` 证据 |
| `55a8afd` `chore(release): prepare v0.13.50` | `4278ccd`（**单父**） | 8 文件 / **+24 −22** | 抬版本：`CHANGELOG.md` 2/0、`README.md` 6/6、`README.zh-CN.md` 6/6、`docs/LOCAL-TESTING.md` 3/3、`lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、`src/client/index.js` 2/2 |

**合流是快进、没有 merge 提交**：`main` 从 `33c170b` 直接走到 `4278ccd` 再走到 `55a8afd`
（`fh/flowchart-mobile-tree` 的唯一提交就是 `4278ccd`）。推送输出 `33c170b..55a8afd  release/0.13.50 -> main`。
`CHANGELOG.md` 里 `## [Unreleased]` 是空的，下面是 `## [0.13.50] - 2026-11-26`；两份 README 的安装固定行
与「已发布」清单都抬到了 `#v0.13.50` / `v0.13.50`，测试计数改成 `2045` / `105` 文件。

## 4. 远端两个 run（`CONFIRMED`，`gh run view` 逐条读的）

| run | id | 触发 | 头分支 / sha | 结论 |
| --- | --- | --- | --- | --- |
| CI | **`45775313465`** | `push` | `main` / `55a8afd` | `completed` / **`success`**（07:26:20Z → 07:27:54Z） |
| Release | **`45775329492`** | `push` | `v0.13.50` / `55a8afd` | `completed` / **`success`**（07:26:28Z → 07:27:41Z） |

**收口这一轮没有用 `--force`、没有移动任何已发布的标签**：推之前读的 `git ls-remote --tags origin` 里
`v0.13.45` / `.46` / `.47` / `.48` / `.49` 五个标签的对象与剥出 sha，与推之后重读的**逐个相同**
（`ca4a42c6…` / `a1f0f85d…`→`84f64c8c…` / `d74e06ee…`→`63d039b6…` / `d3d98b94…`→`391e0a69…` / `639c6c8c…`→`88adda89…`），
只多出 `v0.13.50`（对象 `8d079144…` → 剥出 `55a8afd`）。

## 5. 资产与上一版的差（`CONFIRMED`）

| 版本 | 资产 | 字节 | `digest sha256` |
| --- | --- | --- | --- |
| `0.13.49` | `dsh-grok-workflow-0.13.49.tgz` | `1009915` | `efc951b2…`（见 `release-0.13.49-2026-11-26/README.md`） |
| **`0.13.50`** | **`dsh-grok-workflow-0.13.50.tgz`** | **`1015152`** | **`50b191cdec86d338efa063a6088896bb00c1e05ca2800ec9ce9664f8edbf5719`** |

**差值 +5237 字节**（`1015152 − 1009915`）。Release 正文非空：**29 行 / 3234 字节**（`gh release view … -q .body`
自己 `wc -lc` 读的），内容就是 `CHANGELOG.md` 的 `## [0.13.50] - 2026-11-26` 那一节。

## 6. 本轮「没发生的」（照实）

- **`NOT_RUN`** — 收口这一轮**没有重跑真机 soak**，也没有重跑整份门禁的第二遍（`AGENTS.md` §12）。
  手机上看得见的那点行为，读数来自上一块的 `.rsi/evidence/mobile-tree-2026-11-26/`（三张手机屏 + 一张 360px 窄屏；
  `shots.json` 里 `30-done` 是 9 格 / 20 根线 / `cardsCut 0` / `crossings 0` / `scroll [390,390]`，
  `40-narrow-360` 也 `scroll` 无横向溢出），**不是**本目录量的。
- **`BLOCKED`** — `AGENTS.md` §13 的 live 档案升级：收口这一轮是 `workspace-write`、`~/.dsh` 在工作区外，写不进去。
  做了一次探测 `: > ~/.dsh/.release-probe-0.13.50`，被拒（`Read-only file system`），**没有重试绕过、没有重启、没有动 `~/.dsh`**。
  live 里那一行读作浮动的 `github:free6589/dsh-grok-workflow`（只读看的 `~/.dsh/profiles/web/package.json`），
  要做的人把它钉到确切的 `v0.13.50`、读回 `0.13.50`，读不回就回滚那一行。
- **`NOT_RUN`** — npm publish：本仓库不发 npm，发布面只有 GitHub Release。
