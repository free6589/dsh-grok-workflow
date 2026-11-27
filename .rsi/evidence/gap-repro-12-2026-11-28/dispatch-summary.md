# B缺口复现 dispatch-summary（包工头合交）

- 分支：fix/gap-repro-12 @ 9977211f71db8c6afec8d137b1dd6a5ea33967d1（worktree .tmp/wt-gap-12）
- 红线遵守：只读复现+草稿验证；src/lib/test 零改动（git diff --stat 无输出）；未merge；未碰live；未force-push；未动tag
- 三小工模型：agent2api/deepseek-v4.1-flash

## 1. 复现（repro-worker）— 复现成功
- run 686af548 task30「汇总助手」seq3044 outcome=failed 后20行（line 3047–3066）0 个 agent-start/补派；2行后 run-end stopReason=error，delivery=partial
- 全run 62事件：agent-start 30 / agent-end 30，每task仅派1次；task17/19/21/22/24/26 有「尝试2」，唯独无「汇总（尝试2）」

## 2. 逻辑（logic-worker）— 是，耗尽即终结、无补派分支
- 锚点纠偏：782是classifyFailureText分支；bounded-retry主体在 runTaskUnsafe（4014 maxAttempts=maxRetries+1；4346 return failed）
- 耗尽后：下游 blockedResult（3908）、stopOnFailure 写stopped+break、replan只改未开始波（settled never re-run）；child-outcomes纯report-only
- seq30是汇总腿单次调用（3164–3186），与任务行耗尽不同路，但同样无重发
- HYPOTHESIS另案：该run run-end=error却仍交付report，基线run.ts解释不了（2026-11-20会话代码与基线不一致），需另案

## 3. 补丁（patch-worker）— 红→绿，7/7 PASS，未合入
- 规则：仅failed终结单元候选；setup/配置类标人工；redispatchCount≥1标人工；其余同一条腿补派1次到备用队列（有界不成环）
- 本人独立复跑：候选 7/7 PASS；基线 3/7 FAIL（C1/C3/C4/C6红，C2/C5/C7绿）— 绿是真判出来的
- 声明：未合入源码；备用队列入口是否存在未查；接进L4346/L4682/L4768真实行为 NOT_RUN

## 记忆建议行
- B缺口CONFIRMED：bounded-retry/汇总腿耗尽后无补派通道（基线9977211实测行号对账）；补派规则草稿7/7验证通过但未合入；另案HYPOTHESIS：run-end=error仍交付report与基线run.ts矛盾，待查2026-11-20会话代码差
