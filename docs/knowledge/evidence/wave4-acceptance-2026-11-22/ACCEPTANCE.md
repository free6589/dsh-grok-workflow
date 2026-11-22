# Wave 4 —— L1 × DAG 合流与 A1–A6 全量验收（2026-11-22）

- 结论：**合流可演示，A1–A5 `CONFIRMED`，A6 `CONFIRMED`**（`npm run ci` exit 0）；另记
  4 条已知边界与 3 条 `NOT_RUN`，逐条见 §5、§6。没有一条 A 项是靠推理写成 `CONFIRMED`。
- 验收口径：把**真实生成脚本** `WORKFLOW_SCRIPT`（`src/script.ts` 的 `String.raw` 产物）放进
  Node VM 跑，子代理用脚本化 agent 顶替；报告用 `renderReport` 渲染、再经 `parseReportRound`
  读回成轮次——即插件运行时那条 `报告消息 → 继承摘要 → 下一轮 planner 提示词` 的链路，不是
  摘要或重述。
- 本波只落**验收测试与证据**：`test/wave4-acceptance.spec.ts` 与目录内 6 个文件；Wave 1–3 的
  源码文件一个字节未动（`git status --short` 中 `src/` 下无本轮新增改动）。

## 1. 复跑

```bash
# 合流演示（打印 MERGE-DEMO.txt 的内容，需先 npm run build 出 lib/）
node docs/knowledge/evidence/wave4-acceptance-2026-11-22/capture-merge-demo.mjs

# 本波验收用例
npx vitest run test/wave4-acceptance.spec.ts

# 全量验收口径
npm run ci
```

`capture-merge-demo.mjs` 走 `lib/`（`verify:lib` 已证明与 `src/` 逐字节一致），所以演示结果
就是发出去的字节的行为；它自己内联了与 `test/helpers.ts` 相同的 VM 外壳，可独立运行。

## 2. A1–A6 台账

| 项 | 判定 | 证据定位 | 复跑 |
| --- | --- | --- | --- |
| A1 跑一半发新需求，旧轮 stopped，新轮带上一轮 verified 证据、不重做 | `CONFIRMED`（另有 2 条边界：§5 B1/B2） | `test/wave4-acceptance.spec.ts:87`（两波：wave 1 已验证、wave 2 失败 → 继承摘要含 `retain (generation 1): a` / `redrive (generation 2): b` → 下一轮只把 `b`、`c` 交给 worker，`a` 一次都不再出现）；`:145`（保留结论以 `detail a:` 进摘要）；`test/inheritance.spec.ts:181`、`:200`（会话消息编译、planner/worker 提示词都带继承块）；`MERGE-DEMO.txt` 第 1–2 节 | `npx vitest run test/wave4-acceptance.spec.ts test/inheritance.spec.ts` |
| A2 非法依赖 plan 被拒且指名 offending task | `CONFIRMED` | `test/waves.spec.ts:128` 五例：自指、未知 id、环、跨波指向、超过 8 波；拒绝理由分别命中 `/task a depends on itself/`、`/task a depends on unknown task ghost/`、`/dependency cycle: a -> b -> a/`、`/task b \(wave 2\) depends on c in wave 2/`、`/plan declares 9 waves; the limit is 8/`；`:143` 证明去掉违规边后同一 plan 被接受 | `npx vitest run test/waves.spec.ts` |
| A3 两波 DAG：第一波并行峰值 >1，第二波待其全部完成才启动 | `CONFIRMED` | `test/waves.spec.ts:156`：实测 `peak > 1`、第二波 worker 启动时 wave-1 两个任务都已 settle（`startedWave2Before === false`）、报告渲染 `Wave 1/2:` / `Wave 2/2:`；`:294`/`:316` 同时证明波内 `writesPaths` 重叠仍串行、不相交仍并行 | 同上 |
| A4 上游失败 → 下游 `blocked` 而非 `verified`，总状态不为 `completed` | `CONFIRMED` | `test/waves.spec.ts:210`（下游记 `blocked`、绝不 `verified`、轮次非 `completed`）、`:237`（`blocked` 不烧重试）、`:255`（verified 混 blocked 记 `partial`）、`:275`（两波连续传染）；本波补 `test/wave4-acceptance.spec.ts:126`（`blocked` 行回到下一轮是 `redrive`，理由是 `blocked in an earlier round`，不是 `retain`） | `npx vitest run test/waves.spec.ts test/wave4-acceptance.spec.ts` |
| A5 小任务不再被硬拆；单线报告带原因句 | `CONFIRMED` | `test/waves.spec.ts:421`（一个任务不被强拆且报告写原因）、`:430`（依赖链原因）、`:439`（写路径重叠原因）、`:448`（多波时不写多余句）、`:498`（caller plan 保持波前行为）；渲染点 `src/report.ts:841` → `Wave reason: …`，原因句表在 `src/waves.ts:100` | `npx vitest run test/waves.spec.ts` |
| A6 `npm run ci` 全绿；并发/重试上限不变（默认 10 / 硬上限 100、默认 1 / 硬上限 3） | `CONFIRMED` | CI 记录见 `CI-WAVE4.log`（**78 files / 1438 tests PASS，`EXIT=0`**，见 §3）；包络断言 `test/wave4-acceptance.spec.ts:177`（常量 10/1/100/3 与 `resolveConfig({})` 一致）、`:187`（存 101 直接抛 `between 1 and 100`）、`:191`（`maxRetries` 根本不是配置键）、`:197`（越界载荷 500/9 在脚本里被夹到 100/3）；`ENGINE_HOOK_LIMITS` 同一包络由 `test/checkpoint-schema.spec.ts:375` 钉住 | `npm run ci` |

## 3. 全量 CI（四次，都留档）

| 次 | 时刻 | 结果 | 日志 |
| --- | --- | --- | --- |
| #1（本波改动前基线） | 01:06 | `EXIT=0`，**77 files / 1429 tests PASS** | `CI-WAVE4-baseline.log` |
| #2（加入 `wave4-acceptance.spec.ts`） | 01:11→01:12 | **`EXIT=1`，78 files / 1422 tests**，失败原因是 `test/delivery.spec.ts` 在 01:12:30 被并发写入时处于半成品状态（`Expected ',' or ')' but found Identifier`，Q11 那条 `it(...)` 的字符串当时还没闭合）。该文件属另一路并行工作（Wave 1 Q11），不是本波改动 | `CI-WAVE4-first-run-exit1.log` |
| #3（同一工作树、等并发写落定后） | 01:13 | **`EXIT=0`，78 files / 1438 tests PASS** | `CI-WAVE4.log` |
| #4（复验，独立重跑同一工作树） | 01:33 | **`EXIT=0`，78 files / 1439 tests PASS**（+1 来自另一路并行工作给 `test/naming.spec.ts` 加的用例，非本波）；本波 spec 仍 8 例全绿 | `CI-WAVE4-attempt2.log` |

每份日志都是原样副本（`typecheck` → `lint` → `verify:lib` → `npm test` 四步全跑）。#2 不是被
"重跑到绿" 掩盖的：它的失败行留在档里，原因写明是共享工作树上另一路并行编辑的瞬时状态
（`test/delivery.spec.ts` mtime 01:12:30 晚于 #2 起始 01:11:44）；本波自己的用例在 #2 里也全部执行，
只有那一个文件没能被 transform。

#4 是收尾时的独立复验（不是 #3 的副本）：同一棵树上再跑一次 `npm run ci`，四步全过，
`78 files / 1439 tests`，`EXIT=0`。比 #3 多的 1 个用例来自并行工作对 `test/naming.spec.ts` 的改动
（Q10(b)：组标题不再截断），与本波无关；本波 `test/wave4-acceptance.spec.ts` 在该次仍是 8 例全绿。
`capture-merge-demo.mjs` 也在同一时刻重跑，输出与 `MERGE-DEMO.txt` 逐字节一致（`diff` 无输出）。

## 4. A6 为什么能说"没被放宽"

三处独立读数，方向一致，都不依赖我的口头结论：

1. 常量：`DEFAULT_MAX_CONCURRENCY = 10`（`src/config.ts:251`）、`FIXED_MAX_RETRIES = 1`
   （`src/config.ts:123`）、`HARD_LIMITS.maxConcurrency = 100`、`HARD_LIMITS.maxRetries = 3`
   （`src/config.ts:23-24`）。
2. 配置是 fail-closed 而不是"夹一下就算"：`maxConcurrency: 101` 由 `integer()` 直接抛
   `between 1 and 100`（`src/config.ts:1026`）；`maxRetries` 不在 `CONFIG_KEYS` 里，写进配置是
   `unknown configuration key`。
3. 脚本侧不信任入参：`Math.min(100, …)` / `Math.min(3, …)`（`src/script.ts:56-57`），本波实测
   把 `maxConcurrency: 500, maxRetries: 9` 的载荷夹回 100/3（`MERGE-DEMO.txt` 末节）。

> 文档差异（需 Lead 订正，本轮未改）：`docs/knowledge/PLAN-dynamic-steering-2026-11-21.md` §5 A6
> 写的是"默认 3/1，硬上限 6/3"，与 `AGENTS.md`「Architecture invariants」和代码的
> 10/100、1/3 不一致。**该行是计划文本陈旧，不是代码被放宽的依据**；本轮按
> `AGENTS.md` + 代码为准验收，没有据此动任何上限。

## 5. 已知边界（记录，不修饰）

- **B1 保留项不可被依赖**：下一轮的 plan 不能把 `dependsOn` 指向一个 retained 的 id——retained
  的工作不在新 plan 里，波次校验看不到它，于是整份 plan 按 fail-closed 被拒
  （`task d depends on unknown task a`），运行退化到 fallback plan。代价是一次重规划，**不是**偷偷
  重做 wave 1。演示见 `MERGE-DEMO.txt` 第 3 节，用例 `test/wave4-acceptance.spec.ts:154`。
- **B2 继承是提示词级约束**：planner 被明确告知"retained 已核验、不要重做、要做就在结果里说明"，
  但没有任何结构校验阻止一个 planner 把 retained 任务重新写进 plan 并再跑一遍。
- **B3 `reverify` / `replan` 与 `changedFields` 生产不可达**：唯一生产调用点
  `src/run.ts:625` 是 `inheritanceForSession(sessionOfAgent(agent))`，不传 `ResumeOptions`；
  因此线上只可能产出 `retain` / `redrive`，另外两态目前只有单测覆盖
  （`test/inheritance.spec.ts:94`、`:113`）。这一项按 Wave 2 的"resumeDecision 接生产调用者"
  只能算部分落地。
- **B4 摘要顺序与注释不一致（低）**：`buildInheritanceDigest` 注释称"已完成的先说"，但单轮内
  行序被 `decisions.slice().reverse()` 整体倒置，实测同一轮里 `redrive b` 排在 `retain a` 之前
  （`MERGE-DEMO.txt` 第 2 节）。不影响 A1 的完整性结论（verified 清单仍全在），属 Wave 2 代码，
  本轮只记录、不改。

## 6. NOT_RUN

- **N1 真实 DSH Web GUI 手点波次/blocked 呈现**：本波只在 Node VM 里跑真实脚本 + 真实渲染器，
  没有在 GUI 里点开一次多波运行的进度面板。`NOT_RUN`。
- **N2 真实模型端到端（含 planner 真按继承块重排）**：所有子代理都是脚本化的，因此"planner 会
  遵守继承块"这一点是提示词契约 + 脚本化复现，不是模型实测。`NOT_RUN`（成本与确定性考虑，
  且 A1 的机制部分不依赖模型）。
- **N3 Wave 1–3 各自的验收重跑**：本波只跑与合流、A1–A6 相关的用例；Wave 1 的显示层与 Wave 2 的
  超时/守卫按既有记录（`docs/knowledge/STATE.md`）为准，未在本轮逐条复验。`NOT_RUN`。
