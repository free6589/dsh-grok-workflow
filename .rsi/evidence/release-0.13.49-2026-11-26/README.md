# `0.13.49` 发版证据（**released**：`v0.13.49` 已发布，发布提交 **`88adda8`**）

repo: `dsh-grok-workflow` · 附注标签 **`v0.13.49`**（对象 **`639c6c8cb6d4ec0651bc4f57a0e7752e693b96ee`** → 剥出 **`88adda8`**）·
`main` = `origin/main` = **`88adda8`**（从 `a5dfc75` 快进）· 发布 **2026-11-26T05:38:06Z** ·
<https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.49>

**`v0.13.49` 已经发出去了。** GitHub Release 上的唯一资产是 `dsh-grok-workflow-0.13.49.tgz`，
**1009915** 字节、`digest sha256:efc951b2…`；非 draft、非 prerelease；两个远端 run（Release `/actions/runs/45762717002`、
CI `/actions/runs/45762713170`）都 success。
**发布门禁是本目录的 `gate-88adda8.out`**——在**已发布的树**上跑的、也是这一版唯一一次在发布提交上跑的整份门禁。
本目录原本收的是**被扣住那一轮**（尖端 `772ac32`，`main` 停在 `a5dfc75`）的三份转录：
**那三份现在被它取代、只作历史留着**（行不删、数不改）。那一轮为什么被扣住、后来怎么放行的，
见 `docs/knowledge/VALIDATION.md` 与 `.rsi/evidence/force-team-cut-2026-11-26/`。

## 1. 文件

| 文件 | 行 / 字节 | `sha256`（前 16） | 是什么 |
| --- | --- | --- | --- |
| `gate-6f31e749.out` | 372 / 21966 | `3f700e29b49ab108…` | 抬版本提交 **`6f31e74`** 上的 `TMPDIR=$PWD/.tmp npm run ci`——被扣住那一轮，**已被下面第三行取代** |
| `gate-22a72d3.out` | 380 / 22729 | `4aad17c9605aae2e…` | **修复的初版** **`22a72d3`** 上的同一条命令（这一版随后被 amend 掉）——被扣住那一轮，**已被下面第三行取代** |
| `gate-772ac32.out` | 410 / 25140 | `2cdc56b635daebbf…` | **分支尖端**（被扣住那一轮）**`772ac32`** 上的同一条命令——当轮被记为「决定性的发布门禁」，**现已被下面第三行取代** |
| **`gate-88adda8.out`** | **395 / 23752** | **`6ec3e6ae0ec20d93…`** | **发布提交 `88adda8`** 上的同一条命令——**末行 `GATE_EXIT=0`**；`Found 15 warnings and 0 errors.`、`lib/ at 88adda8 is the build of src/ at 88adda8 (293 files, byte-identical)`、`client bundle: 372480 bytes → lib/client.js`、`Test Files 105 passed (105)` / `Tests 2034 passed (2034)` / `Duration 97.57s`。**这一份是发布门禁，取代上面三份** |

四份都是原件；本索引只补出处。行数 / 字节数 / `sha256` 是写字的人自己 `wc -lc`、`sha256sum` 读的（末一行是发布门禁，随发版收口一起补记）。

## 2. 被扣住那一轮的三遍门禁（`CONFIRMED`，读的就是上面那三份转录）

| 读数 | `6f31e74` | `22a72d3` | `772ac32` |
| --- | --- | --- | --- |
| `package.json` 版本（第 2 行） | `0.13.49` | `0.13.49` | `0.13.49` |
| `Test Files` | `105 passed (105)` | `105 passed (105)` | `105 passed (105)` |
| `Tests` | `2041 passed (2041)` | `2049 passed (2049)` | `2049 passed (2049)` |
| `Duration` | `72.49s` | `90.26s` | `128.61s` |
| lint | `Found 15 warnings and 0 errors.` | 同值 | 同值 |
| `verify:lib` | `lib/ at 6f31e74 … (293 files, byte-identical)` | `… at 22a72d3 … (293 files, byte-identical)` | `… at 772ac32 … (293 files, byte-identical)` |
| `client bundle` | `372480 bytes → lib/client.js` | 同值 | 同值 |

**`2041 → 2049` 那 +8 全在 `test/force-team.spec.ts`**：带词边界的 `it(` 在 `6f31e74` 是 **28**、在 `772ac32` 是 **36**
（写字的人自己 `grep -c` 两个 rev 的该文件读的）。修复提交自己的说法是先红后绿：红 `4 failed / 32 passed`、
绿 `36 passed`。

### 2.1 一份要写清的口径：三份转录里**没有** `GATE_EXIT` 行

`sessions` 那两份（同级的 `force-team-routing-2026-11-26/`）**有**这条末行，本目录这三份**没有**——
转录在 `Duration` 那一行就结束了，跑命令的 shell 那一层没有把退出码追加进来。
**写字的人没有为此重跑门禁**（`AGENTS.md` §12），也**不把「没有这一行」写成「退出码未知就默认 0」**：

- 能直接读到的：`npm run ci` 是 `typecheck && lint && verify:lib && test` 的**与串联**，
  三份转录都走到了最后一步的 `Duration` 行，vitest 三份都报 `105 passed (105)` / `2041` 或 `2049 passed`，
  **一个 `failed` 计数都没有**；`Found 15 warnings and 0 errors.` 与 `verify:lib` 的 `byte-identical` 也都在。
  任何一步非 0 都不会走到这里。
- 不能读到的：字面上的 `EXIT=0`。这一格**照实留空**，编号与 `.rsi/evidence/release-0.13.41-2026-11-26/README.md`
  里同一条口径（那一轮也缺这一行，索引里写明缺、不补）。

### 2.2 发布那颗提交上的门禁（`CONFIRMED`，`gate-88adda8.out`）

| 读数 | `88adda8`（发布提交） |
| --- | --- |
| `package.json` 版本 | `0.13.49` |
| `Found 15 warnings and 0 errors.` | 第 162 行 |
| `client bundle` | `372480 bytes → lib/client.js` |
| `verify:lib` | `lib/ at 88adda8 is the build of src/ at 88adda8 (293 files, byte-identical)` |
| `Test Files` | `105 passed (105)` |
| `Tests` | `2034 passed (2034)` |
| `Duration` | `97.57s` |
| **末行** | **`GATE_EXIT=0`** |
| `FAIL` 命中 | **0**（三处 `failed` 字样分别是两条用例标题与一行 `[smoke] status=failed` 的夹具日志） |

**与上面三份的关系**：这一份是**唯一一份在已发布的树上跑的整份门禁**，所以它是发布门禁的判据。上面三份仍然有效，它们证明的是「被扣住那一轮代码是绿的」；被这一份取代的只是「哪一遍算发布门禁」。它**自带 `GATE_EXIT` 行**，补上的是 §2.1 缺的那一格——**补的是新一轮的读数，不是给那三份补写退出码**，§2.1 的口径不变。

## 3. 三颗提交（`CONFIRMED`，`git` 侧）

| 提交 | 父 | stat | 内容 |
| --- | --- | --- | --- |
| `3ec12d5` `merge: a team keyword buys a hard instruction, and a lone turn is refused once` | `a5dfc75` + `e9a48b9` | 40 文件 / +2100 −72 | 合流；门禁转录在 `force-team-routing-2026-11-26/gate-3ec12d5.out` |
| `6f31e74` `chore(release): prepare v0.13.49` | `3ec12d5`（**单父**） | 8 文件 / +37 −22 | 抬版本：`CHANGELOG.md` +15 −0、`README.md` 6/6、`README.zh-CN.md` 6/6、`docs/LOCAL-TESTING.md` 3/3、`lib/client.js` 2/2、`package-lock.json` 2/2、`package.json` 1/1、`src/client/index.js` 2/2；`src/` 与 `lib/` 的 diff **只有** `PLUGIN_VERSION` / `UPDATE_LATEST` 那一对 `'0.13.48'` → `'0.13.49'` |
| `772ac32` `fix(force-team): a block the turn opened counts as the team it started` | `6f31e74`（**单父**） | 9 文件 / +274 −50 | 闸门证据放宽 + 两份 README 的用例数字 `2041` → `2049` |

**一次 amend 的痕迹照实记**：修复先以 **`22a72d3`** 提交（同一标题、同一父 `6f31e74`），随后 amend 成 `772ac32`。
两者之差 `git diff --stat 22a72d3 772ac32` = **`README.md | 2 +-` / `README.zh-CN.md | 2 +-`**，即只补了两份 README 的
测试数字；**`22a72d3` 从未进 `main`，也从未是本分支的尖端**，它的门禁转录之所以留着，是为了说明「代码已经绿过一次」。

## 4. 被扣住那一轮「没发生的」（`NOT_RUN`，**当时**的读数；后来发了，见 §1 / §2.2）

- **`NOT_RUN`** — 附注标签 `v0.13.49`：`git tag --points-at HEAD` 与 `git tag --points-at 3ec12d5` 都是空，
  `git tag -l 'v0.13.4*'` 里最新的仍是 `v0.13.48`。
- **`NOT_RUN`** — `git push`（`main` 与远端仍是 `a5dfc75`，`git rev-parse main origin/main` 同值）、远端 Release run、npm publish。
- **`BLOCKED`** — `AGENTS.md` §13 的 live 档案升级：本会话 `workspace-write`、`~/.dsh` 在工作区外，写不进去。
  另有一条要记住的读数（不是本会话干的）：`~/.dsh/profiles/web` 的 mtime 在 **11:22:40** 被**另一个施工者**改过，
  live 里装的 `dsh-grok-workflow` 读作 **`0.13.48`**，而那一版**不含** `lib/force-team.js`——
  所以 live 上现在跑的是「没有强制路由」的那一版，与本目录无关。
- **真机 soak 不在本目录**：两轮读数在 `.rsi/evidence/force-team-soak-2026-11-26/`。
- **后来发了（本轮补记，`CONFIRMED`）**：上面三条现在都发生过——附注标签 `v0.13.49` 对象 `639c6c8c…` → `88adda8`、`main` 快进到 `88adda8`、Release run `45762717002` 与 CI run `45762713170` 都 success、GitHub Release 资产 1009915 字节。**这一节保留的是那一轮的原始读数**，不是现状。
- **仍然 `BLOCKED` 的只有一条**：`AGENTS.md` §13 的 live 档案升级（`~/.dsh` 在工作区外、收口这一轮同样是 `workspace-write`，**没写、没重载、没重启**，3080 前后各读一次都是 401）——要做的人把 live 那条插件行钉到确切的 `v0.13.49`、读回 `0.13.49`，读不回就回滚那一行。