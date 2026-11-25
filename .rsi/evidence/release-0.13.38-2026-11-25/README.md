# `0.13.38` 发布轮的两份门禁转录（2026-11-25）

`main` 尖端 **`c3d729f`** 上，特性分支 `fix-removed-keys-warn`（尖端 **`b6e8598`**）在 worktree
**`.tmp/wt-release-0.13.38`** 里真 `--no-ff` 折入（合并提交 **`8f8a463`**），随后一个发布提交
**`8c9b028`** `chore(release): prepare v0.13.38`。这个 worktree 上两次 `TMPDIR=$PWD/.tmp npm run ci` 的
**完整转录，逐字未改**；原件是那个 worktree 里的 scratch，worktree 收尾要删掉，所以副本落在这里——
`.tmp/wt-release-0.13.38` 本轮实读**已不在盘上**，这两份就是仅存的副本。
口径：`AGENTS.md` §2 的四个状态词。每条结论都能回指下面的一份日志或一行读数。

## 清单

| 文件 | 跑在哪棵树上 | 是什么 | 结论 |
| --- | --- | --- | --- |
| `gate-merge-8f8a463.out` | 合并提交 **`8f8a463`**（`merge: a leftover removed key is ignored and named, not fatal`，父 `c3d729f` + `b6e8598`，树 `63e3fa81…`） | 合流之后的**第一遍**门禁 | `EXIT=0`，`100 files / 1870 tests`，`15 warnings / 0 errors`，`340426` 字节，`lib/ at 8f8a463 … byte-identical` |
| `gate-release-8c9b028.out` | 发布提交 **`8c9b028`**（`chore(release): prepare v0.13.38`，8 文件 / +22 −20，树 `2bc5d845…`） | **发布门禁——这一遍才算数** | `EXIT=0`，同样 `100 files / 1870 tests`、`15 warnings / 0 errors`、`340426` 字节，`lib/ at 8c9b028 … byte-identical` |

两次的 cwd 都是 `.tmp/wt-release-0.13.38`，命令都是 `TMPDIR=$PWD/.tmp npm run ci`
（即 `npm run typecheck && npm run lint && npm run verify:lib && npm test`）。
**发布门禁是 `8c9b028` 那一遍**：它跑在即将打标签的那个提交上，`main` 随后用 `git merge --ff-only` 前进到同一个提交，
所以 `main` 尖端、门禁提交、标签 `v0.13.38` 剥出的提交是同一个（三值本轮实读都是 `8c9b028`）。

## 一、`8f8a463`（合流后第一遍）

```
Found 15 warnings and 0 errors.
client bundle: 340426 bytes → lib/client.js
lib/ at 8f8a463 is the build of src/ at 8f8a463 (285 files, byte-identical)
 Test Files  100 passed (100)
      Tests  1870 passed (1870)
   Start at  18:14:08
   Duration  96.51s (transform 2.24s, setup 0ms, import 9.09s, tests 76.02s, environment 11ms)

EXIT=0
```

## 二、`8c9b028`（发布门禁）

```
Found 15 warnings and 0 errors.
client bundle: 340426 bytes → lib/client.js
lib/ at 8c9b028 is the build of src/ at 8c9b028 (285 files, byte-identical)
 Test Files  100 passed (100)
      Tests  1870 passed (1870)
   Start at  18:19:55
   Duration  94.56s (transform 2.37s, setup 0ms, import 7.98s, tests 75.31s, environment 11ms)

EXIT=0
```

**两份日志的抬头确实不一样，这是对的**：`8f8a463` 那棵树的 `package.json` 还写着 `0.13.37`（版本号是下一条提交才升的），
所以它读 `> dsh-grok-workflow@0.13.37 ci`；`8c9b028` 那一份读 `> dsh-grok-workflow@0.13.38 ci`。
**另外：两份文件的第 1 行都是空行，抬头在第 2 行**——派单口述「两份的第 1 行都必须读 `@0.13.38`」与实测不符，
按实测记录；这一点不影响任何门禁结论（上一轮 `5c58afd` 也是读 `@0.13.36`）。

**退出码**：两份转录都以 `EXIT=0` 收尾，全文 `FAIL` / `✗` **0 行**。
**这两遍都不是本轮跑的**：`EXIT=0` 是发布执行方跑完写进日志的读数，本轮做的是**逐行核对**（读数、`lib/` 自证行、
vitest 摘要、退出行），核对不等于复跑。

**没有凭据**：两份全文各有一处 `secret` 命中，都是 oxlint 密钥检测规则**自己的正则字面量**
（`pattern: /(?<![A-Za-z0-9])…secret[_-]access[_-]key…/`），不是 token、不是密钥。

## 三、这两遍对应的远端运行与发布面（`CONFIRMED`，本轮用 `gh` 重读过）

- Release 工作流 run **`45594337910`**，head sha `8c9b028`、`conclusion=success`、`status=completed`
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45594337910
- `main` 上的 CI run **`45594332536`**，head sha `8c9b028`、`conclusion=success`、`status=completed`
  https://github.com/free6589/dsh-grok-workflow/actions/runs/45594332536
- GitHub Release：https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.38 ，
  名字 `Grok Workflow for DSH v0.13.38`，发布 `2026-11-25T10:23:49Z`，非 draft、非 prerelease，
  唯一资产 `dsh-grok-workflow-0.13.38.tgz` = **958707 字节**（`digest=sha256:7996dd66…`），
  正文就是 `## [0.13.38] - 2026-11-25` 那一节（35 行）。

## 四、副本的可核对性

两个指纹是**本轮**量的（原件随 worktree 删除，无法再与源文件比对，所以这里只给这两份副本自己的读数）：

```
0d6bb97de12f342380e290cef00e57440b0b90c37189cc0dfe672c4b5726e984  gate-merge-8f8a463.out     (23490 字节)
2f2398167a6026f302d2b2d9a71d77a9a18f993262bf48ea9cb4ed38c189c9da  gate-release-8c9b028.out   (23239 字节)
```

`docs/knowledge/VALIDATION.md` 与 `docs/knowledge/STATE.md` 的引用指向本目录，而不是一个会消失的 scratch 路径。
