# repro.md — 复现结论（gap-13：failed 汇总零补派）

- 结论：run `686af548` task 30（`汇总助手`）seq 3044 `outcome=failed` 后 20 行零补派、2 行后 `run-end stopReason=error`，全档无延后补派。
- 关键行（jsonl 行号；`line = seq + 2`）：
  - line 3045 / seq 3043 `agent-start`（汇总助手最后一次发出）
  - line 3046 / seq 3044 `agent-end outcome=failed`
  - line 3047 / seq 3045 `routing`（空转，无补派）
  - line 3048 / seq 3046 `run-end stopReason=error`
  - line 3049 / seq 3047 `delivery outcome=partial`
  - line 3047–3066（后 20 行）：0 个 `agent-start`/补派动作
- 证据源（只读引用，未拷贝大文件）：`wt-gap-12/.rsi/evidence/gap-repro-12-2026-11-28/`
  - `repro-seqs.md`（复现结论全文）、`dispatch-summary.md`（含本 run 一句话摘要）
  - `window-lines-3045-3072.txt`（窗口逐行）、`run-686af548-all-events.txt`（该 run 全部 62 条事件）
  - `session-3a683cb6-before.jsonl(.zstd)` 大文件仅引用 sha（zstd `9e82a087…`, jsonl `21bde5f9…`），未复制
- 备注：向 dispatcher-gap-fix/agent-1 索要复现报告未果，本结论直接采用上述 gap-12 证据目录已知结论。
