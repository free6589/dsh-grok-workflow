# 契约冻结：wave-contract-2026-11-27

> 只写冻结了什么，不改产品行为。改行为的活一律记"没做"。
> 钉子：`test/contract-freeze.spec.ts`（17 tests）。基线：`c049388`。

## 1. progress 事件名（冻结值）

冻结 9 项 lifecycle（顺序固定，`tool-workflow/` 前缀）：

`run-start` / `agent-start` / `agent-end` / `summary-final` / `summary-rejected`
/ `guardian-start` / `guardian-finding` / `guardian-end` / `run-end`

位置：

- typed 侧：`src/progress-tab.ts` → `PROGRESS_EVENT_TYPES`（第 52–62 行）。
- records 侧：`src/records.ts` → `PROGRESS_RUN_START/AGENT_START/AGENT_END/RUN_END`
  + `PROGRESS_SUMMARY_FINAL/REJECTED`（第 354–382 行）；前四项与上游
  `@deepseek-ai/dsh-tool-workflow` 同形同名，后两项是本插件唯一增量（可选，
  旧 reader 忽略即得旧渲染）。
- client 侧：`src/client/index.js` → `PROGRESS_EVENT_TYPES`（第 2737–2746 行，
  通过 `GROK_WORKFLOW_PROGRESS.eventTypes` 对外）。

T2/T3/T4 引用 stub：`import { PROGRESS_EVENT_TYPES } from '../src/progress-tab.js'`
直接复用；client 侧读 `bundle.GROK_WORKFLOW_PROGRESS.eventTypes`；加事件必须
两边一起加（已有 `test/progress-tab.spec.ts` 逐条比对，本钉子再钉一次）。

## 2. progress-tab 读端键（冻结值）

| 键 | 冻结值 | 位置 |
| --- | --- | --- |
| 3 个事件常量 | `stage-detail` / `summary-final` / `summary-rejected`（`tool-workflow/` 前缀）；`stage-detail` 不在 9 项白名单内 | `src/progress-tab.ts` 第 73/85/96 行；client 镜像第 2801/2811/2821 行 |
| `DETAIL_FIELDS` 7 项（顺序固定） | `workCommit, changes, testsRun, results, localRuntimeVerified, blockers, nextAction` | `src/progress-tab.ts` 第 111–119 行；client 镜像第 2866 行 |
| 别名折叠 | `workcommit/changes/change/testsrun/tests/results/result/testresults/localruntimeverified/blockers/blocker/nextaction/next` → 7 键；首拼写获胜 | `src/progress-tab.ts` 第 133–147 行；client `PROGRESS_DETAIL_ALIASES` 第 2876 行 |
| `VIEW_TARGET` | `grok-progress` | `src/progress-tab.ts` 第 99 行；client `PROGRESS_TARGET` 第 2716 行 |
| `NODE_KIND` | `grok-progress-run` | `src/progress-tab.ts` 第 102 行；client `PROGRESS_KIND` 第 2718 行 |

T2/T3/T4 引用 stub：读端只认上表拼写；`WORK_COMMIT/TEST_RESULTS` 等大写与
`next_action` 下划线都经别名折到同一键（钉子未逐个别名断言，只钉 7 键，
别名全表以源码为准）。

## 3. records 的 plugin 键（冻结值）

| 常量 | 冻结值 |
| --- | --- |
| `TERMINAL_RECORD` | `plugin:grok-workflow/terminal` |
| `ROUTING_RECORD` | `plugin:grok-workflow/routing` |
| `DISPOSE_RECORD` | `plugin:grok-workflow/dispose` |

位置：`src/records.ts` 第 27/38/72 行；`PluginRecordMap` 同文件第 240–249 行。
三键互不相同。`progressStopReason` 现状：`completed+completed→completed`，
其余 report 状态→`error`，`cancelled/error` 原样透传（`src/records.ts` 第 459 行，
钉子快照）。

T2/T3/T4 引用 stub：`import { TERMINAL_RECORD, ROUTING_RECORD, DISPOSE_RECORD }
from '../src/records.js'`；读 session 记录时按此三键过滤。

## 4. delivery / carryover 扩展表（冻结现状快照）

delivery（`src/delivery/index.ts`）：

- `DEFAULT_DIAGNOSTICS = false`；`diagnosticsEnabled(undefined)→false`，
  坏 switch 降级为 `false`（第 91/198 行）。
- `deliverReport(report, opts)` 签名冻结（第 1301 行）：默认只出 `human` 块
  （`diagnostics:false`，`text===human`）；`{ diagnostics: true }` 才附加
  `---` + `ledger`。`DeliveryView { diagnostics, human, ledger?, text }`（第 79 行）。
- `statusTail/dedupeBilingual/answerLead/pairCaps/humanConclusion/machineLedger/
  deliveryHeadline` 存在（T4 引用点，不钉内部算法）。

carryover（`src/carryover.ts`）：

- `CARRYOVER_LIMITS = { rounds:24, chars:12_000, objectiveChars:300, itemChars:240,
  summaryChars:400, itemsPerSection:6, locators:6, locatorChars:200, tasks:32 }`
  （第 52 行）；`INHERITANCE_LIMITS.chars = 8_000, taskChars = 2_000`（第 79 行）。
- 扩展表函数冻结：`parseReportRound`（认 `Grok workflow: COMPLETED|PARTIAL|FAILED`
  签名行，无签名返回 `null`）、`clampBounds/carryoverBounds/collectCarryoverRounds/
  buildCarryoverDigest/carryoverForSession`、`resumeDecisions/buildInheritanceDigest/
  inheritanceForSession`、`INHERITANCE_HEADER/PREFIX`（第 624/633 行）。
- locator 正则现状：绝对路径 + URL + 裸文件名（含 CJK，扩展名白名单
  `ts|tsx|js|…|zip|gz`）；**office 扩展名（docx/xlsx/pptx/pdf）当前不在白名单内，
  属现状快照，不引入**（T3 若需先提案，不在本块改）。

T2/T3/T4 引用 stub：delivery 侧 `import { deliverReport, diagnosticsEnabled }`；
carryover 侧 `import { parseReportRound, buildCarryoverDigest, buildInheritanceDigest }`；
只调现状函数，不新增行为。

## 5. soak 读数 JSON 顶层字段（冻结值）

- `.rsi/evidence/task-panel-2026-11-26/soak/readings.json` 顶层 4 键：
  `note, entries, console, mermaidTruthCheck`；`entries` 为数组（12 条）。
- `raw-readings-phone.json` / `raw-readings-desktop.json` 顶层为按 key 索引的对象
 （如 `phone-390-running`, `desktop-1500-done`）。
- 钉子策略：文件存在才断言顶层字段；缺失则跳过并记 `NOT_RUN`（不因环境缺文件变红）。

T2/T3/T4 引用 stub：读 `entries[].key/nodeCalls/traceActive/traceDim/chip` 口径；
`phone-390-running` 错键（desktop 文件内等于 `desktop-1500-done`）只登记不修，
见 `test/overlap-readings-name.spec.ts`。

## 6. 登记不修的三处不一致（只登记）

- I1：`src/progress-tab.ts` 第 4 行注释"四个 session 事件"为旧数，实际 9 项。
- I2：`src/records.ts` 第 348 行注释"same four types"为旧数，实际 recorder 六常量。
- I3：`src/client/index.js` 第 2731 行注释"eight progress and Guardian"为旧数，
  实际白名单 9 项。
- 处理：注释/文案层可在后续块订正；运行时逻辑一律不动（本块未改）。

## 7. 没做（改行为的活）

- 未改任何运行时逻辑：`git diff --stat` 应只含新增 2 文件（spec + 本文）及证据目录。
- 未跑全量 ci、未跑 soak（记 `NOT_RUN`）。
- 未 merge、未动其他分支/worktree、未写密钥。
