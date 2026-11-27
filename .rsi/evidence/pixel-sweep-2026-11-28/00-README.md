# pixel-sweep 证据包（COMPLETE）

> 状态：COMPLETE。补零小工（agent-1，完工 2026-11-27T17:17:19Z）与门禁小工（agent-2）
> 均已交付；04-gate-results.md 已补齐逐字命令 + EXIT + 通过数（来源注明 agent-2）。
> 禁止 merge / push。本目录是唯一证据目录，不分散。

- HEAD（棚内，2026-11-28T01:16+08:00 快照）：`02e54ca47b09b2938bbe17898a617fdd2c3186e4`
- rebase 前（ORIG_HEAD）：`c0493883184367cb8bedb5298583ca72d4828992`
- rebase 目标基线：`02e54ca`（docs(memory): record round4 four-block wrap）
- 主检出：干净，无落盘（见 05-main-clean.txt）
- 棚内：`fix/pixel-sweep`，有未提交改动（见 01）

## 文件清单与用途

| 文件 | 用途 |
|---|---|
| 00-README.md（本文件） | 清单/用途/HEAD/主检出与棚内 status 摘要 |
| 01-sha-log-status.txt | rebase 前后 SHA、`git log --oneline -3`、棚内 `git status --short --branch` 快照 |
| 02-diff-summary.txt | 棚内 `git diff --stat` + `--name-only` + 关键 hunk 摘要（src/client/index.js 与 lib/client.js 同构） |
| 03-ol-zeroing-grep.txt | ol 归零 grep 证据：src/lib 内 `250px` 零命中、`margin: 0` / `list-style: none` 命中行（含 pnodes 与 sheet 规则） |
| 04-gate-results.md | 门禁逐字命令 + EXIT + 通过数（tsc / lint / 三件套 74/74 / 窄屏 390）。PENDING：向门禁小工（agent-2）结果引用，来源注明后补齐 |
| 05-main-clean.txt | 主检出干净证明（`git status --short --branch` 为空输出，仅剩分支行） |

## 缺口（无）
无缺口。补零（agent-1）与门禁（agent-2）均已交付落盘。
