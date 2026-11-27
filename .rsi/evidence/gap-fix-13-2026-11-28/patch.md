# patch.md — 补丁摘要（gap-13：failed 汇总同腿补派 1 次）

分支：`fix/gap-redispatch-13`（HEAD `8e0fde3`）。只改 `src/script.ts`（+55/-1），新建 `test/synth-redispatch.spec.ts`（3 用例）。

1. `failureCategory`：`agent-start-failed` → `configuration`（配置类统一归 configuration；补派判据只看 category）。
2. `requestSummaryDraft` 两个出口同腿补派 1 次：
   - 全路由失败出口：`attempt === 0` 且可重试 → 同一条腿（synthesizer）补发一次（`requestSummaryDraft(prompt, 1)`）；配置类失败标人工（`manual: <class>, no auto-redispatch`），不自动补派。
   - 空稿出口（prose 未提交）：`attempt === 0` → 同腿补派 1 次。
3. `attempt` 索引即单元计数器：0=首发，≥1=已补派过，补派本身再失败即终结，不成环（有界）。
4. 新增 `isSynthRedispatchable`（非配置类可补派）/ `isSynthManualOnly`（setup 位 / `budget-exhausted` / `agent-start-failed` / category `configuration` → 人工）。
5. 新建 `test/synth-redispatch.spec.ts` 3 用例：可重试失败补派成功即交卷；配置类失败标人工不补派；补派再失败即终结。
