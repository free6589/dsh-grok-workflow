# `feat/force-team-routing` 合流门禁证据（merge gate evidence）

repo: `dsh-grok-workflow` · 分支 `release/0.13.49` · 合流提交 **`3ec12d5`**（父 `a5dfc75` + `e9a48b9`）· 2026-11-26 (Asia/Singapore)

本目录只收**合并那一刻**的两次门禁转录。两份都是原件，本索引只补出处、不改原件；
下面的行数 / 字节数 / `sha256` 与表格里的读数都是写字的人自己用 `wc -lc`、`sha256sum`、`grep -nE` 读的。

## 1. 文件

| 文件 | 行 / 字节 | `sha256`（前 16） | 是什么 |
| --- | --- | --- | --- |
| `gate-3ec12d5.out` | 395 / 23980 | `fd20cbda86feede8…` | 合流提交 **`3ec12d5`** 上的 `TMPDIR=$PWD/.tmp npm run ci`；**末行 `GATE_EXIT=0`** |
| `gate-d88eac3.out` | 397 / 24059 | `744b4beb8bc1ac29…` | **第一次**合流尝试 **`d88eac3`** 上的同一条命令；末行也是 `GATE_EXIT=0`；这一版**没有**进分支 |

## 2. 两次合流尝试（`CONFIRMED`，全部来自 `git` 与本目录两份转录）

| 读数 | `d88eac3`（先） | `3ec12d5`（后，进分支） |
| --- | --- | --- |
| 父提交 | `a5dfc75` + `e9a48b9` | `a5dfc75` + `e9a48b9` |
| 提交标题 | `merge: a team keyword buys a hard instruction, and a lone turn is refused once` | 同左（**提交体为空，只有标题**） |
| 提交时刻 | `2026-11-26 11:21:36 +0800` | `2026-11-26 11:25:31 +0800` |
| 门禁 `Test Files` / `Tests` | `105 passed (105)` / `2041 passed (2041)` | 同值 |
| 门禁 `Duration` | `101.21s` | `95.43s` |
| `lib/ at … is the build of src/` | `d88eac3 … (293 files, byte-identical)` | `3ec12d5 … (293 files, byte-identical)` |
| 退出码 | 转录第 **397** 行 `GATE_EXIT=0` | 转录第 **395** 行 `GATE_EXIT=0` |

两次尝试的差：`git diff --stat d88eac3 3ec12d5` → **`docs/knowledge/VALIDATION.md | 2 ++`**，只多两句话
（`lib/` 与 `src/` 的逐字一致那一条当轮没被 `verify-lib` 证明，能证明的是 `npm run build` 在尖端上 `EXIT=0`
且工作树干净）。`git merge-base --is-ancestor d88eac3 3ec12d5` 退出 **1**——`d88eac3` **不是** `3ec12d5` 的祖先，
它是被重做掉的第一次尝试，**从未在分支上出现过**。

两遍门禁的公共读数（两份转录逐字同值，行号指 `gate-3ec12d5.out`）：第 162 行 `Found 15 warnings and 0 errors.`、
第 168 / 178 行 `client bundle: 372480 bytes → lib/client.js`、第 169 行
`lib/ at 3ec12d5 is the build of src/ at 3ec12d5 (293 files, byte-identical)`；
第 2 行 `> dsh-grok-workflow@0.13.48 ci`——**合流那一刻版本号还是 `0.13.48`**，抬版本是后面 `6f31e74` 干的。

## 3. 合并本身（`CONFIRMED`，`git` 侧）

- `git show --stat 3ec12d5`：**40 文件 / +2100 −72**（其中 `test/force-team.spec.ts` 新增 506 行）。
- 提交体为空字符串（`git log -1 --format='%B'` 只有标题一行），所以**「解了哪几处冲突」在 git 里没有记录**；
  本索引不补、也不猜。
- 合流后 `lib/force-team.js` = `23a4ab3e4f6955c67cb0bd027088d1f636cdbfb1091706cb366732aca089040b`（**21096 字节**），
  `lib/client.js` = `055bbadf7b93a0ac6f50cbee0ecdda4aea46ad029f67ef8c35fecc87a7923b00`（**372480 字节**），
  后者与基线 `a5dfc75` 的 blob **逐字节相同**（`git show a5dfc75:lib/client.js | sha256sum` 同值）——
  **浏览器包没被这一版改过**，所以它不能当版本判别器，判据是 `lib/force-team.js` 那一行。

## 4. 本目录**不含**什么

- **不含真机 soak**：两轮真机读数在 `.rsi/evidence/force-team-soak-2026-11-26/`。
- **不含发布动作**：没有 tag、没有 push、没有远端 run——`0.13.49` **预备但没发**，
  理由记在 `docs/knowledge/VALIDATION.md` 顶部那一条与 `.rsi/evidence/release-0.13.49-2026-11-26/README.md`。