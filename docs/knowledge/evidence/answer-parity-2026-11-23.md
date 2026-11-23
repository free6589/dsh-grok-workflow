# 答案长相一致：能由机器证明的部分与只能由人判的部分（2026-11-23）

- **来源**：`manual-sessions-unfinished.md` 第三节第 4 行「开插件后的答案要和不开插件时长得一样」
  （会话 `session-417aae3b`，2026-11-06「改 dsh-grok-workflow：答案为本」）。
- **状态词汇**：`CONFIRMED` / `HYPOTHESIS` / `NOT_RUN`（AGENTS.md §2）。

## 1. 机器侧已经证明的（`CONFIRMED`）

默认交付（`showDiagnostics` 关闭）下，读者看到的是**一段人话结论**，而不是工作流的过程：

| 断言 | 证据 |
|---|---|
| 默认视图只有人话块，relay 标记之内不夹机器台账 | `test/human-output-contract.spec.ts`「hides every internal term in the default view of a partial report」 |
| 台账折叠在闭合标记之下，只给模型看，不进回复 | 同文件「folds the ledger below the closing marker」 |
| 任何 run 状态都不把台账词漏进可见块 | 同文件「never leaks a ledger term into the visible block, whatever the run status」 |
| 失败轮不会穿成功句式的衣服 | 同文件「never dresses a FAILED run in the success sentence」 |
| 人话块由 `src/delivery/index.ts` 一个模块产出（`deliverReport` / `humanConclusion`），门层不再自带措辞 | `src/gate.ts` `humanHead` 的注释与实现；`src/answer.ts` 的 preamble 明写"print no marker line, add nothing before or after" |
| 答案本体是「模型复述已经核验的结果」，不是工作流自造文本 | `src/answer.ts` 模块头注释（gate 只交付已校验的报告） |

也就是说：**插件不会在答案前后加标题、阶段名、状态词或机器字段**——这些是"长得不一样"最常见的来源，且都有断言钉住。

## 2. 只能由人判的（`NOT_RUN`）

原话问的是主观观感：「和不开插件时长得一样」。同一句话，开插件时走的是
"规划 → 执行 → 检查 → 汇总 → 模型复述"这条链，关插件时是模型直答。**内容详略、语气、
是否带小标题，取决于模型在这一轮写了什么**，没有任何断言能替代人眼并排比对。

操作员三步可比（每次一分钟）：

1. 关掉插件（或 `mode` 设 `off`），问一个需要动手的小任务，例如「把 README 里过期的
   Node 版本号找出来并改掉」。记下回答。
2. 打开插件，问同一个任务。记下回答。
3. 只比三件事：**有没有多出来的开场白/小标题/阶段名；结论是不是第一段就给出；
   有没有出现 `code=`、`src/…:行号`、`ledger` 这类机器词**。三件都没有，即"长得一样"。

若第 3 步发现多出来的包装，退回的证据链是：`src/delivery/index.ts` 的人话块 →
`src/answer.ts` 的 preamble → 本文件第 1 节对应的断言，三者任一被改都会让断言先红。

## 3. 本轮结论

- 代码侧：`CONFIRMED`，且由既有断言守住，本轮无需改动（本轮只补这份比对规程）。
- 观感侧：`NOT_RUN`，等操作员按第 2 节做一次并排比对。这是本项唯一未闭合的部分。
