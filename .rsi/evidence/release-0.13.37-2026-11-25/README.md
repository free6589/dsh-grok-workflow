# `0.13.37` 发布轮的两份门禁转录（2026-11-25）

发布分支 **`release/0.13.37`**（worktree **`.tmp/wt-release-0.13.37`**，从 `main` 尖端 **`d34214b`** 开出）上两次
`TMPDIR=$PWD/.tmp npm run ci` 的**完整转录，逐字未改**。原文件是那个 worktree 里的 scratch
（`.tmp/ci-second.log`、`.tmp/ci-release-34236f0.log`）；worktree 收尾要删掉，所以副本落在这里，
`docs/knowledge/VALIDATION.md` 的引用指向本目录，而不是一个会消失的 scratch 路径。
口径：`AGENTS.md` §2 的四个状态词。每条结论都能回指下面的一份日志或一行读数。

## 清单

| 文件 | 跑在哪棵树上 | 是什么 | 结论 |
| --- | --- | --- | --- |
| `gate-merge-5c58afd.out` | 合并提交 **`5c58afd`**（`merge: a session with no mode record no longer shows the switch as on`，父 `d34214b` + `9d234c2`） | 合流之后的**第一遍**门禁 | `EXIT=0`，`98 files / 1849 tests`，`15 warnings / 0 errors`，`333611` 字节，`lib/ at 5c58afd … byte-identical` |
| `gate-release-34236f0.out` | 发布提交 **`34236f0`**（`chore(release): prepare v0.13.37`，8 文件 / +38 −20，树 `71ffdb66…`） | **发布门禁——这一遍才算数** | `EXIT=0`，同样 `98 files / 1849 tests`、`15 warnings / 0 errors`、`333611` 字节，`lib/ at 34236f0 … byte-identical` |

两次的 cwd 都是 `.tmp/wt-release-0.13.37`，命令都是 `TMPDIR=$PWD/.tmp npm run ci`
（即 `npm run typecheck && npm run lint && npm run verify:lib && npm test`）。
**发布门禁是 `34236f0` 那一遍**：它跑在即将打标签的那个提交上，`main` 随后用 `git merge --ff-only` 前进到同一个提交，
所以 `main` 尖端、门禁提交、标签 `v0.13.37` 剥出的提交是同一个。

## 一、`5c58afd`（合流后第一遍）

```
Found 15 warnings and 0 errors.
client bundle: 333611 bytes → lib/client.js
lib/ at 5c58afd is the build of src/ at 5c58afd (281 files, byte-identical)
 Test Files  98 passed (98)
      Tests  1849 passed (1849)
   Start at  16:27:02
   Duration  85.82s (transform 2.23s, setup 0ms, import 7.73s, tests 67.08s, environment 10ms)
```

## 二、`34236f0`（发布门禁）

```
Found 15 warnings and 0 errors.
client bundle: 333611 bytes → lib/client.js
lib/ at 34236f0 is the build of src/ at 34236f0 (281 files, byte-identical)
 Test Files  98 passed (98)
      Tests  1849 passed (1849)
   Start at  16:34:00
   Duration  88.35s (transform 1.91s, setup 0ms, import 7.44s, tests 69.46s, environment 11ms)
```

**两份日志的抬头不一样，这是对的**：`5c58afd` 那棵树的 `package.json` 还写着 `0.13.36`（版本号是下一条提交才升的），
所以它的第一行是 `> dsh-grok-workflow@0.13.36 ci`；`34236f0` 那一份是 `> dsh-grok-workflow@0.13.37 ci`。

**退出码**：转录本身**没有** `EXIT=` 这一行（退出码写在执行方那一层），日志以绿的 vitest 摘要收尾，
全文 `FAIL` / `✗` **0 行**（唯一的 `does not exist` 命中是某条用例断言里的既有诊断文案，不是失败）。
`EXIT=0` 是发布执行方跑完报回的读数，`VALIDATION.md` 与 `STATE.md` 按 `CONFIRMED` 记录，来源是那一方。
**Node / npm 版本行不在转录里**：记录这一份时本机读到 `node -v` = `v26.8.1`、`npm -v` = `11.19.0`，
但那是记录这一份时的读数，**不是从日志里读出来的**，不当门禁运行时的证据。

## 三、这两遍对应的远端运行（`CONFIRMED`，用 `gh` 重读过）

- Release 工作流 run **`45577666102`**，标签 `v0.13.37`、head sha `34236f0`、conclusion **success**
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45577666102
- `main` 上的 CI run **`45577662548`**，head sha `34236f0`、conclusion **success**
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45577662548
- GitHub Release：https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.37 ，发布 `2026-11-25T08:37:20Z`，
  唯一资产 `dsh-grok-workflow-0.13.37.tgz` = **947407 字节**。

## 四、副本的可核对性

两份副本与源文件逐字节相同（拷贝完成后立刻比对，两个 sha256 各自相等）：

```
51f8b524556cb4b803fc96461e80dc8377403675bc14706e4a91179bd86f17dd  ci-second.log            → gate-merge-5c58afd.out     (22105 字节)
d539c03c8ce93f6e003ea6605c53b8cba8ac763caa5224864c8650e0756e2852  ci-release-34236f0.log   → gate-release-34236f0.out   (21907 字节)
```

日志里没有密钥：全文唯一的 `secret` 命中是 oxlint 密钥检测规则**自己的正则字面量**（lint 输出里那行 `pattern:`），
没有 token、没有凭据；因此删掉 `.tmp/wt-release-0.13.37` 之后，这两份副本足以独立支撑发布轮的门禁结论。
