# `0.13.48` 发版证据（release evidence）

repo: `dsh-grok-workflow` · release: **`v0.13.48`** → 提交 `391e0a694c96d06910bf5b0f6c7c8f35ddf0656b` · 2026-11-26 (Asia/Singapore)

本目录只收这一版的发布读数。三份文件是发布轮（`agent-206/rel-publish`）与门禁留下的原件；
本索引由收口轮（`agent-206/rel-memory`）写，**只补出处、不改原件**。下面的行数 / 字节数、末行 `GATE_EXIT`、
`grep -c FAIL` 都是收口轮自己读的（`wc -lc`、`tail`、`grep -c`），不是转述。

## 1. 文件

| 文件 | 行 / 字节 | 是什么 |
| --- | --- | --- |
| `gate-2be3c06.out` | 533 / 30110 | **红的那一遍**门禁转录：`TMPDIR=$PWD/.tmp npm run ci` 在第一颗发布提交 `2be3c06` 上，`GATE_EXIT=1` |
| `gate-391e0a694c96.out` | 408 / 24994 | **绿的那一遍**门禁转录：同一命令在 amend 后的发布提交 `391e0a6` 上，`GATE_EXIT=0` |
| `publish-391e0a6.txt` | 76 / 4053 | 推送、标签、远端 run、Release 资产、远端 ref 与清理的逐条记录（发布轮写） |

## 2. 两遍门禁（`CONFIRMED`，读的是上面两份转录）

| | `2be3c06`（红） | `391e0a6`（绿） |
| --- | --- | --- |
| 退出码（末行） | `GATE_EXIT=1` | `GATE_EXIT=0` |
| `Test Files` | `2 failed \| 102 passed (104)` | `104 passed (104)` |
| `Tests` | `6 failed \| 2007 passed (2013)` | `2013 passed (2013)` |
| `Duration` | `96.73s` | `107.21s` |
| lint | `Found 15 warnings and 0 errors.` | `Found 15 warnings and 0 errors.` / `185 files` / `96 rules` |
| `verify:lib` | `lib/ at 2be3c06 … (289 files, byte-identical)` | `lib/ at 391e0a6 … (289 files, byte-identical)` |
| `client bundle` | `372480 bytes` | `372480 bytes` |
| `grep -c FAIL` | 6 | 0 |

红的那六条全是**过期的 `0.13.47` 文档版本钉子**：`test/docs-version.spec.ts` 五条、`test/docs-config-keys.spec.ts` 一条。
修法是把 13 处钉子（`README.md` 5、`README.zh-CN.md` 5、`docs/LOCAL-TESTING.md` 3）抬到 `0.13.48` 并
`git commit --amend` 并回同一颗发布提交，因此 **`2be3c06` 从未到过 `main`**（`git merge-base --is-ancestor` 退出 1）。

## 3. 发布身份（`CONFIRMED`；`git` 侧收口轮自己读，远端 run / Release 见 `publish-391e0a6.txt` §5–§6）

- 发布提交 `391e0a6` `chore(release): prepare v0.13.48`，**单父 `db3184a`**，8 文件 / +22 −20。
- 合流：`feat/flowchart-v2`（尖端 `db3184a`、11 颗提交）从 `main` `e772cd6` **`--ff-only`** 折进 `release/0.13.48`，零冲突。
- 区间 `e772cd6..391e0a6` = 12 颗提交 / 175 文件 / +15337 −320。
- 附注标签 `v0.13.48` 对象 `d3d98b94026b1017ab1f16e434a8b36599a019f4` → 剥出 `391e0a6`、`tagger` `1795662028 +0800`（2026-11-26 11:00:28 +0800）。
- 推送：`e772cd6..391e0a6  main -> main`、`* [new tag]  v0.13.48 -> v0.13.48`；没有 force-push、没有移动已发布标签。
- 远端 run：Release `45746151586` `success`（19 步全过）、CI `45746139472` `success`。
- Release 资产：`dsh-grok-workflow-0.13.48.tgz` = 997062 字节（上一版 990561 → +6501）。

## 4. 没做到的（别升级成「验过」）

- **`NOT_RUN`**：这一版没有真机 soak——行为由功能分支的证据 `.rsi/evidence/flowchart-v2-2026-11-26/` 覆盖
  （六态、截图、逐 lane 0.00 px 对齐、窄屏折行）；那里 `verify:lib` 标 `BLOCKED` 是因为跑在 `/tmp` 副本上没装
  `typescript`，**同一条检查在 `391e0a6` 上是绿的**。
- **`NOT_RUN`**：npm publish（这一版没发 npm，只发 GitHub Release 资产）；`gh` 的任何写操作（只用来读）。
- **`BLOCKED`**：`AGENTS.md` §13 的 live 档案升级——写探测 `: > ~/.dsh/.release-probe-0.13.48` 打印
  `Read-only file system`，没写、没重载、没重启；只读读到 live 读 `0.13.47`、依赖行仍浮动。
