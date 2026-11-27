# report-mismatch 红先绿后转录（2026-11-27，`fix/report-mismatch`，已合 `main`）

三份转录来自 `wt-report-mismatch` 工作树 `.rsi/evidence/report-mismatch/`（拷贝改名：`.log` → `.out`，避开 `*.log` 忽略规则，内容逐字节相同）：

| 文件 | 来源 | 内容 |
| --- | --- | --- |
| `gate.out` | `gate.log`（8925 字节） | `typecheck EXIT 0` + `lint 17w0e`（198 files / 96 rules）转录 |
| `red-fail.log` → `red-fail.out` | `red-fail.log`（4029 字节） | 红：`carryover 1 failed / 22 passed`（`keeps bare deliverable file names`，receipt 3/3 缺一） |
| `green-173.log` → `green-173.out` | `green-173.log`（1625 字节） | 绿：`7 files / 173 passed`（修后全绿） |

`wt-report-mismatch` 棚内另有一份 `scripts/repro-r17-release-cache.mjs`（133 行临时草稿，未进 `main`，不随证据提交）。
