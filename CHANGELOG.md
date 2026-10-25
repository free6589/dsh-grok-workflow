# Changelog / 更新日志

Notable user-facing changes are recorded here in English and Simplified Chinese.
用户可见的功能和修复会在这里以英文和简体中文记录。

## [Unreleased] / 未发布

### Added / 新增
- A real-engine contract test base: the tests now drive the actual
  `@deepseek-ai/dsh-workflow-ptc` engine (script VM, guest program, `agent()`
  contract, result materialization) with a scripted subagent provider, so the
  JavaScript contract is verified without a model. Process confinement, sandbox
  policy and capability gating remain out of scope.
  / 新增真实引擎契约测试基座：测试直接驱动真正的 `@deepseek-ai/dsh-workflow-ptc`
  引擎（脚本 VM、guest 程序、`agent()` 契约、结果物化），配合脚本化的子代理 provider，
  无需模型即可验证 JavaScript 契约。进程隔离、沙箱策略与能力门禁仍不在覆盖范围内。
- Redaction rules now have a single source (`REDACTION_RULES`), and the workflow
  script's prompt-side redactor is generated from it instead of being a second
  hand-maintained copy. Added Azure SAS (`sig`/`signature`) and
  `Authorization: Basic` coverage.
  / 脱敏规则改为单一来源（`REDACTION_RULES`），工作流脚本内的提示词脱敏器由它生成，
  不再手工维护第二份副本；新增 Azure SAS（`sig`/`signature`）与
  `Authorization: Basic` 覆盖。

### Changed / 变更
- **Behaviour change (can reject previously valid input):** acceptance criteria
  must stay distinct after normalization (trailing sentence punctuation,
  collapsed whitespace, and case are ignored when matching a verifier result).
  Inputs such as `["Do X.", "do x"]` or `["alpha works", "alpha works!"]` are now
  rejected instead of accepted, because two criteria that compare equal cannot
  each be confirmed by exactly one verifier entry.
  / **行为变更（可能拒绝此前合法的输入）**：验收标准在归一化后必须互不相同（匹配
  验证结果时忽略结尾句读、多余空白与大小写）。`["Do X.", "do x"]`、
  `["alpha works", "alpha works!"]` 这类输入现在会被拒绝，因为比较相等的两条标准
  无法各自被恰好一条验证条目确认。
- The planner prompt receives the objective as redacted JSON data rather than raw
  interpolated text, matching how worker and verifier prompts are built.
  / 规划提示词改为接收经脱敏的 JSON 形式目标，与 worker、verifier 提示词的构造方式一致。

### Fixed / 修复
- Verification no longer compares acceptance-criterion text byte-for-byte. A
  verifier that copies a criterion with a trailing period, different spacing, or
  different case used to fail every attempt, exhaust the retry budget, and report
  a correct result as `failed`; the comparison now normalizes those formatting
  differences while still requiring the same requirement wording.
  / 验证不再逐字比较验收标准文本。验证者若把标准抄成结尾多一个句号、空白或大小写不同，
  过去会导致每次尝试都失败、重试耗尽，并把正确的结果报成 `failed`；现在比较会归一化这些
  格式差异，但仍要求同一需求措辞。
- The report validator now enforces what it documented: attempt-level executor and
  verifier payloads are deep-checked against closed unions (`verdict`,
  `status`, `confidence`, command status), confirmed evidence must trace to the
  task's last attempt verification with byte-identical evidence, a task may not
  have zero acceptance criteria, `tasks` may not exceed `maxTasks`, task ids must
  be unique, `limits.maxTotalAgents` must match the request builder's window, and
  every failed task must appear exactly once in `incomplete` with a non-empty
  reason.
  / 报告校验器补齐了它自己声明的约束：逐次尝试的执行/验证载荷按闭合枚举深度校验
  （`verdict`、`status`、`confidence`、命令状态）；confirmed 证据必须能追溯到该任务
  最后一次尝试的验证记录且证据逐字相同；任务不得没有任何验收标准；`tasks` 不得超过
  `maxTasks`；任务 id 必须唯一；`limits.maxTotalAgents` 必须落在请求构造器的取值区间内；
  每个失败任务必须在 `incomplete` 中恰好出现一次且原因非空。
- `npm run test:unit` now includes the criterion-comparison suite.
  / `npm run test:unit` 现在包含验收标准比较测试。

## [0.1.0] - 2026-10-25

### English

#### Added
- Initial version of Grok Workflow for DSH, an external DSH bundle exposing the `grok_workflow` tool.
- Bounded plan, parallel execution, independent verification, limited retries, and a structured final report.
- Configurable limits for concurrency, retries, task count, execution deadline, and active workflow runs.
- English and Simplified Chinese setup documentation, architecture notes, acceptance checks, tests, and an optional GitHub Issue watcher.

#### Fixed and hardened
- Validate workflow reports before presenting them as results, including explicit `completed`, `partial`, and `failed` invariants.
- Bound task input and report payload sizes, and redact common credential formats from model-facing diagnostics.
- Treat GitHub Issue content as untrusted input and restrict credential variables passed to watcher wake processes.
- Test the committed `lib/` build output so a stale compiled package cannot silently pass CI.

### 简体中文

#### 新增
- Grok Workflow for DSH 首个版本：作为 DSH 外部 bundle，提供 `grok_workflow` 工具。
- 支持有限规划、并行执行、独立验证、有限重试和结构化结果汇总。
- 支持配置并发数、重试次数、任务数、执行时限和同时运行的工作流数量。
- 提供英文与简体中文文档、架构说明、验收清单、自动化测试，以及可选的 GitHub Issue 监控脚本。

#### 修复与安全加固
- 在展示结果前校验工作流报告，明确约束 `completed`、`partial` 和 `failed` 状态。
- 限制任务输入和报告大小，并对模型可见的诊断信息中的常见凭据格式进行脱敏。
- 将 GitHub Issue 内容视为不可信输入，并限制监控脚本唤醒进程可继承的凭据环境变量。
- 在 CI 中检查已提交的 `lib/` 构建产物，避免过期编译文件在测试通过后被错误打包。
