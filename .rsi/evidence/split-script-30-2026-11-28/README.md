# split-script-30 证据（2026-11-28）

分支：`fix/split-script-30`（基线 `main bdea52e`，只提交到本分支，未合并、未 push）

目标：把 `src/script.ts`（5306 行）做"搬家式"拆分，功能一个字不变。

## 拆成了几块

`src/script.ts` 现为 14 行转发壳（重导出旧符号 + 组装后的 `WORKFLOW_SCRIPT`），
旧 import 路径全部继续可用。9 个功能块搬到 `src/script-parts/`：

| 文件 | guest 行区间（原 script.ts） | 行数 | 内容 |
|---|---|---|---|
| `params.ts` | 59–150 + 原 host 头 1–57 | 143 | 参数解析、守卫/重排通道、host 常量与 `redactionRulesSource` |
| `routing.ts` | 151–1067 | 921 | 计时器/竞速、路由链、失败分类、dead-route 健康 |
| `plan-norm.ts` | 1068–1643 | 579 | 任务归一化、依赖/DAG、waves 分层 |
| `prompts.ts` | 1644–2010 | 372 | fallbackPlan、上游/captain/carryover prompt 块 |
| `schemas.ts` | 2011–2289 | 282 | PLAN/EXECUTION/VERIFICATION/SUMMARY schema |
| `synthesize.ts` | 2290–3305 | 1019 | 摘要合成、summary gate、layered 策略 |
| `waves.ts` | 3306–3465 | 163 | mapLimit 并发池、blocked/captain-stop 行 |
| `replan.ts` | 3466–3889 | 424 | 中途重排 merge + schema + prompt |
| `main.ts` | 3890–4931 + host 尾 4934–5306 | 1445 | runTask/waves 执行、报告聚合、`buildWorkflowRequest` 等 host API |
| `assemble.ts` | — | 3 | 按原顺序拼接 9 块 |

`main.ts` 内含 `assembleWorkflowScript()`（唯一拼接顺序），`assemble.ts` 与
`script.ts` 都只是调用它——无循环 import。

## 没改逻辑的证明

- `WORKFLOW_SCRIPT` 逐字节一致：
  - 基线 `bdea52e`：len `278918`，sha256 `4a6b56da5778eb9176ac89f40553b8116fa93a9c2cedadb1b0caab7344c32070`
  - 拆分后（`lib/script.js` / `lib/script-parts/assemble.js` 实测）：len `278918`，sha256 相同 → **IDENTICAL**
- 未改名、未改逻辑；唯一随拆分而变的测试是构建产物形状断言：
  `test/objective-limit.spec.ts` 的 `lib/script.js carries …` 改为读取
  `lib/script-parts/routing.js + prompts.js`（lib/script.js 现为转发壳，
  guest 文本天然不在其中；`WORKFLOW_SCRIPT` 本体的断言未动，仍通过）。

## 验证命令与结果（本机实测）

- `npx tsc --noEmit` → PASS（0 error）
- `npx oxlint src/script.ts` → 0 warnings, 0 errors
  （注：oxlint 1.81.0 对含连字符目录 `src/script-parts/` 按路径传参时返回
  "No files found"，属工具路径处理问题；已对每个新文件用点名复制到
  无连字符临时代理路径逐个 lint，`params.ts` 修掉 24 个未使用 import 后全 0。
  仓库 `npm run lint`（`oxlint src test`）在本分支与其他分支共享工作区时会被
  另一个工人（client-31）的未提交文件干扰，此处以点名 lint 为准。）
- `npx vitest run test/objective-limit.spec.ts` → 12 passed
- 相关文件批量：
  `test/criterion, fallback-shards, route-concurrency, orchestrator` → 62 passed；
  `engine-contract, null-collapse, synthesis-guardrails, judge-leg-retry, planner-resubmit, synth-redispatch, waves, replan, timeout, dead-routes` → 185 passed
- `npm test`（先 build 再全量 vitest）→ **Test Files 124 passed (124)，Tests 2176 passed (2176)**

## 提交记录（本分支，未 push）

1. `84bc656` move guest-script blocks to src/script-parts（纯搬家）
2. `b3499d8` rewire src/script.ts as re-export shell（转发壳）
3. `23fd6a1` trim unused imports in script-parts/params.ts（去 24 个 lint 警告）
4. `2703c88` point built-artifact assertion at lib/script-parts（产物形状断言跟随）
5. `98b50b5` rebuild lib（lib/script-parts bundle；lib 被仓库跟踪）

`git status` 干净（除本目录证据文件待提交）。下一步：提交本 README 后收工，
不合并、不 push。
