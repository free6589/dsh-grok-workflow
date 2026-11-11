# 用户交付层（user-delivery layer）六个场景的前后对照样例

- 生成日期：2026-11-11
- 分支：`feat/user-delivery`（基于 `origin/main` = `84e6894`）
- 「before」= 交付层落地前的默认输出：正文是 `renderReport()` 的机器台账
  （`src/report.ts`，改动前它整体位于 `<<<GROK-WORKFLOW-REPORT>>>` 标记内，由主模型逐字复述）；
  取消文案是改动前的 `cancelledText()` 原文。
- 「after」= 交付层落地后的默认输出：`deliveryForReport()`（新 `src/delivery.ts`）渲染的
  自然交付文案，位于标记内；机器台账整体移到收尾标记之后，仅作为后续轮次 carry-over
  解析的内部记录（主模型被明确要求不得复述它）。
- 生成方式（真实运行，非手写）：`npm run build` 后执行
  `node out/gen-delivery-samples.mjs`（一次性生成脚本，位于 gitignore 的 `out/`，
  报告构造与 `test/delivery.spec.ts` 的 fixture 一致；英文镜像由同一实现按
  `lang: 'en'` 渲染，形态与中文一一对应，见 `test/delivery.spec.ts` 的逐字钉测）。

## 1 · 代码修复（code fix）

### before

```text
Grok workflow: COMPLETED
Objective: 修复登录重试循环
Plan: caller; 1 task(s); 1 verified
- task-7: verified (1 attempt) — 修复登录重试循环
Confirmed evidence:
- task-7: 重试不超过三次 → npm test 通过，重试计数为 2
Final answer:
登录重试循环已修复，重试间隔按指数退避。
Uncertainties:
- task-7: 旧会话的 token 未回归测试
```

### after

```text
已完成 1 项任务并通过核验：修复登录重试循环。
改动落在：src/auth/login.ts。
验证命令已全部通过：npm test。
结论：登录重试循环已修复，重试间隔按指数退避。
依据：
- 重试不超过三次 — npm test 通过，重试计数为 2
仍不确定：
- 旧会话的 token 未回归测试
```

## 2 · 调研（research）

### before

```text
Grok workflow: COMPLETED
Objective: 调研重试风暴的根因
Plan: caller; 1 task(s); 1 verified
- task-3: verified (1 attempt) — 重试风暴根因调研
Confirmed evidence:
- task-3: 给出根因 → 缺失指数退避导致雪崩（docs/research/retry.md）
Final answer:
重试风暴由指数退避缺失引起。
```

### after

```text
结论：重试风暴由指数退避缺失引起。
以上结论来自 1 项已核验的任务：重试风暴根因调研。
依据：
- 给出根因 — 缺失指数退避导致雪崩（docs/research/retry.md）
```

## 3 · 纯问答（pure Q&A）

### before

```text
Grok workflow: COMPLETED
Objective: 计算 919 + 27
Plan: caller; 1 task(s); 1 verified
- task-1: verified (1 attempt) — 计算 919 + 27
Confirmed evidence:
- task-1: 计算正确 → 逐位验算一致
Final answer:
919 + 27 = 946。
```

### after

```text
919 + 27 = 946。
依据：
- 计算正确 — 逐位验算一致
```

## 4 · 部分完成（partial）

### before

```text
Grok workflow: PARTIAL
Objective: 修复重试循环并补回归测试
Plan: caller; 2 task(s); 1 verified
Failures: 1 quality
- task-7: verified (1 attempt) — 修复登录重试循环
- task-8: failed (1 attempt) — 编写重试回归测试
  incomplete: 
Confirmed evidence:
- task-7: 重试不超过三次 → npm test 通过，重试计数为 2
Incomplete:
- task-8 (quality): 验证命令失败：npm test 有 2 个断言未过
Final answer:
登录重试循环已修复，重试间隔按指数退避。
Uncertainties:
- task-7: 旧会话的 token 未回归测试
```

### after

```text
部分完成：1/2 项任务已通过核验：修复登录重试循环。
未完成：编写重试回归测试——验证命令失败：npm test 有 2 个断言未过。
已核验部分的结论：登录重试循环已修复，重试间隔按指数退避。
改动落在：src/auth/login.ts。
验证命令已全部通过：npm test。
依据：
- 重试不超过三次 — npm test 通过，重试计数为 2
仍不确定：
- 旧会话的 token 未回归测试
```

## 5 · 失败（failed）

### before

```text
Grok workflow: FAILED
Objective: 修复登录重试循环
Plan: unavailable; 0 task(s); 0 verified
Failures: 1 infrastructure
Incomplete:
- workflow (infrastructure): 引擎在启动规划子代理时失败：provider unreachable
```

### after

```text
未能完成：这次运行没有可交付的结果。
原因：引擎在启动规划子代理时失败：provider unreachable。
```

## 6 · 取消（cancelled split：未派工即取消 / 中途取消）

### 6a · before（未派工即取消，旧 `cancelledText` 原文）

```text
运行已取消（cancelled）：这条消息没有完成，也没有可交付的结果。
没有可保留的核验报告；未完成的部分不再继续，要接着做请把任务重新发一次。
```

### 6a · after

```text
运行已取消：这条消息没有完成，也没有可交付的结果。
还没有派工，没有启动任何工人；要接着做，请把任务重新发一次。
```

### 6b · before（中途取消，旧 `cancelledText` + 标记内整份机器报告）

```text
运行已取消（cancelled）：工作流在全部任务完成前停止。
取消前已有 1/2 项任务核验通过；下方保留核验结果、未完成项和证据。总体状态仍为取消，不代表全部完成。
原因：用户停止了这一轮

取消前保留的工作流报告：
Grok workflow: PARTIAL
Objective: 修复重试循环并补回归测试
Plan: caller; 2 task(s); 1 verified
Failures: 1 quality
- task-7: verified (1 attempt) — 修复登录重试循环
- task-8: failed (1 attempt) — 编写重试回归测试
  incomplete: 
Confirmed evidence:
- task-7: 重试不超过三次 → npm test 通过，重试计数为 2
Incomplete:
- task-8 (quality): 验证命令失败：npm test 有 2 个断言未过
Final answer:
登录重试循环已修复，重试间隔按指数退避。
Uncertainties:
- task-7: 旧会话的 token 未回归测试
```

### 6b · after

```text
运行已取消：工作流在全部任务完成前停止，取消前 1/2 项任务已通过核验。
已核验的部分保留在下面；未完成的部分不再继续，要接着做请把任务重新发一次。总体状态仍为取消，不代表全部完成。
原因：用户停止了这一轮
已核验：修复登录重试循环。
改动落在：src/auth/login.ts。
验证命令已全部通过：npm test。
依据：
- 重试不超过三次 — npm test 通过，重试计数为 2
结论：登录重试循环已修复，重试间隔按指数退避。
仍不确定：
- 旧会话的 token 未回归测试

取消前保留的工作流报告：
Grok workflow: PARTIAL
（机器台账原样附着，作取消前运行的审计副本；内容与 6b before 的报告段相同）
```

## 对照要点

1. 结果先行：after 的第一句直接说清做成了什么（或为什么没做成），不再以
   `Grok workflow: COMPLETED` 台账开头。
2. 无内部信息泄漏：任务 id（`task-7`）、状态枚举（`COMPLETED/PARTIAL/FAILED`）、
   路由/尝试计数、deadline、limits 都不再出现在用户可见文案里。
3. 事实保真：改动位置、验证命令、证据指针、未完成原因、不确定性全部保留，
   全部来自已核验的 `WorkflowReport` 字段，无一编造；`partial` 不写成完成，
   `failed` 不套成功口吻，取消始终声明「总体状态仍为取消」。
