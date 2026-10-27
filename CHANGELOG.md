# Changelog / 更新日志

Notable user-facing changes are recorded here in English and Simplified Chinese.
用户可见的功能和修复会在这里以英文和简体中文记录。

## [Unreleased] / 未发布

### Added / 新增
- (nothing yet) / （暂无）

## [0.2.1] - 2026-10-27

Incremental release on top of the published `0.2.0`: everything below is **new since** that tag —
nothing in this section restates a change that `0.2.0` already shipped.

`0.2.0` 之上的增量版本：本节全部是**自该 tag 以来新增**的内容，不重复 `0.2.0` 已经发布过的改动。

### English

#### Added
- **Settings page in the Web GUI / Web 图形界面的设置页。** The plugin now ships its own
  browser bundle, so the Plugins page shows a **Grok workflow** card with all 21
  configuration keys: the 17 live fields (gate, context and concurrency limits,
  synthesis, failure classes, run records) and the 4 structural keys read-only with
  their reason. Per-role fallback chains are edited in place (add / remove / edit a
  route, up to three per role), invalid input is refused before it reaches the Host,
  and a save applies to the **next** message. The page appears only while the Host
  serves the namespace, so an inactive plugin shows no card instead of a dead form.
  / 插件自带浏览器端 bundle：插件页出现 **Grok workflow** 卡片，渲染全部 21 个配置键
  （17 个可编辑的活动字段 + 4 个只读结构性字段并给出原因），支持按角色链的增删改
  （每角色最多 3 条），非法输入在提交前被拦下并列出原因，保存后对**下一条消息**生效；
  命名空间未提供时整页不出现，而不是显示一个坏掉的表单。
- **Activation prerequisite documented / 记录激活前提。** `@deepseek-ai/dsh-web-app` ships
  `workflow-ptc` disabled, so installing the bundle puts the row in the graph while the
  plugin stays `pending (waiting for service: workflowEngine)`. The install steps now
  include re-enabling a workflow provider, plus the four checks that prove activation
  (clean boot, served namespace, GUI card, `grok_workflow` in a real session's tool
  list). / `dsh-web-app` 层默认禁用 `workflow-ptc`，装包只让行进入组合图而插件停在
  `pending`；安装步骤已补上"启用一个工作流 provider"和四条激活校验。

### 简体中文

#### 新增
- **Web 图形界面的设置页。** 插件自带浏览器端 bundle：插件页出现 **Grok workflow** 卡片，
  渲染全部 21 个配置键（17 个可编辑的活动字段 + 4 个只读结构性字段并给出原因），支持按角色
  链的增删改（每角色最多 3 条），非法输入在提交前被拦下并列出原因，保存后对**下一条消息**
  生效；命名空间未提供时整页不出现，而不是显示一个坏掉的表单。
- **记录激活前提。** `@deepseek-ai/dsh-web-app` 层默认禁用 `workflow-ptc`，装包只让行进入
  组合图而插件停在 `pending (waiting for service: workflowEngine)`；安装步骤已补上"启用一个
  工作流 provider"和四条激活校验。

## [0.2.0] - 2026-10-26

### English

#### Added

- **Mandatory entry (the gate).** The plugin now claims every user message
  through `agent/pre-step`, runs the full plan → execute → verify → synthesise
  workflow, and delivers the result inside the same turn (`answerStrategy:
  in-turn`, the default). Turning a message away is a stated decision: an empty
  or over-long message (over 4000 characters) is refused with its reason
  printed, and nothing is executed. Delivery is de-duplicated per message, so
  re-dispatching a batch cannot start a second run, and the queue per agent is
  bounded (`maxQueuedMessages`).
- **Per-role model routing with ordered fallback chains.** `roles.planner`,
  `roles.worker`, `roles.verifier` and `roles.synthesizer` each take up to three
  routes (`{ provider, model }`, or a bare model id as shorthand). Every child
  call is routed by role, and a route-level failure advances that role's chain.
  The routes actually used are recorded in the report (`routing`) and rendered in
  the answer, so a chain that never took effect cannot look like routing that
  works.
- **Switch policy you can inspect.** `switchOn` lists the failure classes that
  advance a chain (default: the built-in policy). Content failures
  (`task-failed`, `verification-failed`) never advance — a different model would
  be looking at the same evidence — and a typo in `switchOn` is refused at load
  instead of silently never switching.
- **Failure class and category in every report.** Each failure carries what
  happened (`class`, e.g. `rate-limit`, `timeout`, `verification-failed`) and
  who has to fix it (`category`: `infrastructure`, `quality`, `configuration`,
  `cancelled`, `unknown`). The rendered answer adds a `Failures:` line, so a
  provider outage is not read as poorly done work.
- **A settings surface that is the same truth as the runtime.** The exported
  `Config` is projected into the standard DSH settings UI; fields are live
  (an edit reaches the next message, an invalid edit is refused with its reason
  while delivery keeps the last valid snapshot). Unknown configuration keys are
  rejected with the closest accepted key instead of being ignored, and
  `roles`/`synthesis` are validated against the providers the runtime actually
  has. Run records (`recordRuns`, `recordLimit`) can be turned off or capped.
- **Write-path isolation for parallel tasks.** A plan task may declare
  `writesPaths`; tasks whose declared paths overlap run one after another, and
  everything else keeps running in parallel. `[]` means "writes nothing";
  declaring nothing means "unknown" and is treated conservatively. Overlap is
  decided lexically (`.`, `..`, separators, case) with segment-wise prefixes, so
  `src` covers `src/a.ts` while `src/a` does not cover `src/ab`.
- **A real-engine contract test base and a reliability suite.** The tests drive
  the actual `@deepseek-ai/dsh-workflow-ptc` engine (script VM, guest program,
  `agent()` contract, result materialization) with a scripted subagent provider,
  and cover cancellation, deadlines, the concurrency cap, duplicate starts,
  recursion refusal, context bounds, secret redaction, partial results, unload
  and reload. 264 deterministic tests across 18 files; no online model is needed.
  Process confinement, sandbox policy and capability gating remain out of scope.

#### Changed
- **`enforceGate` is `true` by default: every user message now goes through the
  workflow.** This is the point of the release and also the biggest visible
  change from `0.1.0`, where the tool only ran when a model chose to call it.
  Set `enforceGate: false` to get the `0.1.0` behaviour back (the tool stays
  available, the gate does not intercept).
- The answer is delivered inside the turn by default (`answerStrategy:
  in-turn`). `relay` and `append` remain selectable for long-lived surfaces; on a
  one-shot headless run they deliver after the process has begun tearing down.
- Acceptance criteria must stay distinct after normalization (trailing sentence
  punctuation, collapsed whitespace and case are ignored when matching a
  verifier result), so `["Do X.", "do x"]` is now rejected.
- The planner prompt receives the objective as redacted JSON data rather than
  raw interpolated text, matching how worker and verifier prompts are built.
- The report validator now enforces what it documented: deep-checked attempt
  payloads against closed unions, confirmed evidence traceable to the task's
  last attempt, unique task ids, `limits.maxTotalAgents` inside the request
  builder's window, and every failed task present exactly once in `incomplete`.
- The package version is `0.2.0`, the changelog keeps one bilingual section per
  version, and `npm run ci` runs typecheck, lint, build and the full suite.

#### Fixed
- An infrastructure failure no longer escapes as a raw exception. Every
  transport-level failure (429, timeout, connection reset, missing model, a
  crashed child) now produces a structured report with
  `category: infrastructure`; the worst case is one failed row per task.
- Redaction rules have a single source (`REDACTION_RULES`) and the workflow
  script's prompt-side redactor is generated from it. Added Azure SAS
  (`sig`/`signature`) and `Authorization: Basic` coverage.
- Verification no longer compares acceptance-criterion text byte-for-byte, so a
  verifier that copies a criterion with a trailing period, different spacing or
  different case no longer fails every attempt.
- A run-level failure (deadline, cancellation, an unvalidatable report) now
  prints its `Failures:` line from the run-level error categories instead of
  showing none.
- A malformed routing record no longer discards the whole ledger, and the
  delivery fallback keeps the last valid configuration instead of the load-time
  one, so a later invalid edit cannot silently undo an edit that had taken
  effect.

#### Breaking notes (`0.1.0` → `0.2.0`)
- **Mandatory entry is on by default.** If you want the old opt-in behaviour,
  set `enforceGate: false`. A deployment that must never degrade silently should
  also set `gateRequired: true`, which turns "this runtime has no `agent/pre-step`
  hook" into a load error instead of a warning.
- **The report is additive but extended:** task rows gain `writesPaths` (array or
  `null`), failures gain `class` and `category`, and `plan.tasks` must match
  `tasks` field for field. Consumers that reject unknown fields must be updated;
  consumers that ignore them keep working.
- **Configuration keys are validated.** Unknown keys are rejected at load with a
  suggestion, and `roles` chains are refused when empty models, duplicate routes
  or more than three routes are present. A configuration that loaded under
  `0.1.0` because a key was silently ignored may now fail loudly — that is
  intentional.
- **Criteria distinctness** can reject input that `0.1.0` accepted.
- Requires DSH `0.2.1-rc.2` and Node.js 22 or newer; the `0.1.0` peer set is not
  supported.

### 简体中文

#### 新增

- **强制入口（闸门）**：插件现在通过 `agent/pre-step` 认领每一条用户消息，执行完整的
  规划 → 执行 → 验证 → 汇总工作流，并在**同一轮**内交付结果（`answerStrategy:
  in-turn` 为默认）。拒绝一条消息也是明示决定：空消息或超过 4000 字符的消息会被打印
  拒绝原因且不执行任何工作。每个消息的交付做了去重，同一批被重复派发也不会启动第二次
  运行；每个 agent 的等待队列有上限（`maxQueuedMessages`）。
- **按角色模型路由 + 有序备用链**：`roles.planner`、`roles.worker`、`roles.verifier`、
  `roles.synthesizer` 各自最多三条路由（`{ provider, model }`，也接受裸模型 id 简写）。
  每次子代理调用按角色取路由，路由级失败会推进该角色的链。实际用到的路由写进报告
  (`routing`) 并渲染在答案里，因此"配了但没生效"不会被误当成"配好了"。
- **可检视的切换策略**：`switchOn` 列出允许推进备用链的失败类别（默认=内置策略）。
  内容类失败（`task-failed`、`verification-failed`）永不推进——换模型看到的是同样的
  证据；`switchOn` 里写错类别会在载入时被拒绝，不会变成"永不切换"。
- **每份报告都带失败类别与归类**：每个失败同时给出发生了什么（`class`，例如
  `rate-limit`、`timeout`、`verification-failed`）和该谁修（`category`：
  `infrastructure`、`quality`、`configuration`、`cancelled`、`unknown`）。渲染的答案
  增加 `Failures:` 行，provider 故障不会被读成"活干得不好"。
- **设置面与运行时同一真相**：导出的 `Config` 会被投影成 DSH 标准设置页；字段是活值
  （编辑对下一条消息生效，非法编辑以原因被拒绝，投递继续使用上一次合法快照）。未知
  配置键会被拒绝并给出最接近的合法键，而不是被静默忽略；`roles`/`synthesis` 会对照
  运行时实际拥有的 provider 校验。运行记录可用 `recordRuns`/`recordLimit` 关闭或封顶。
- **并行任务的写路径隔离**：计划任务可声明 `writesPaths`，声明路径重叠的任务依次执行，
  其余保持并行。`[]` 表示"不写文件"；什么都不声明表示"未知"，按保守方式处理。重叠判定
  是词法的（`.`、`..`、分隔符、大小写）且按段比较前缀，因此 `src` 覆盖 `src/a.ts`，
  而 `src/a` 不覆盖 `src/ab`。
- **真实引擎契约测试基座与可靠性套件**：测试直接驱动真正的
  `@deepseek-ai/dsh-workflow-ptc` 引擎（脚本 VM、guest 程序、`agent()` 契约、结果
  物化），配合脚本化的子代理 provider，覆盖取消、超时、并发上限、重复启动、递归拒绝、
  上下文边界、密钥脱敏、部分完成、卸载与重载。264 个确定性测试 / 18 个文件，无需在线
  模型。进程隔离、沙箱策略与能力门禁仍不在覆盖范围内。

#### 变更
- **`enforceGate` 默认 `true`：每条用户消息都会走完整工作流。** 这正是本版本的目的，
  也是相对 `0.1.0` 最大的可见变化——`0.1.0` 只有模型主动调用工具时才运行。若想恢复
  `0.1.0` 的行为，设 `enforceGate: false`（工具仍可用，闸门不再拦截）。
- 答案默认在同一轮内交付（`answerStrategy: in-turn`）。`relay`、`append` 仍可选用，
  适用于长驻界面；在一次性 headless 运行中它们在进程开始销毁后才投递。
- 验收标准归一化后必须互不相同（匹配验证结果时忽略结尾句读、多余空白与大小写），
  `["Do X.", "do x"]` 这类输入现在会被拒绝。
- 规划提示词接收经脱敏的 JSON 形式目标，与 worker、verifier 提示词的构造方式一致。
- 报告校验器补齐了声明的约束：逐次尝试载荷按闭合枚举深度校验、confirmed 证据必须可追溯
  到该任务最后一次验证、任务 id 唯一、`limits.maxTotalAgents` 落在请求构造器取值区间、
  每个失败任务在 `incomplete` 中恰好出现一次。
- 版本号改为 `0.2.0`；更新日志每个版本保持中英对照；`npm run ci` 运行 typecheck、
  lint、build 与完整测试。

#### 修复
- 基础设施故障不再以裸异常逃逸。所有传输层故障（429、超时、连接重置、模型不存在、
  子代理崩溃）都会产出结构化报告并标注 `category: infrastructure`；最坏情况是每个任务
  一行失败。
- 脱敏规则改为单一来源（`REDACTION_RULES`），工作流脚本内的提示词脱敏器由它生成；
  新增 Azure SAS（`sig`/`signature`）与 `Authorization: Basic` 覆盖。
- 验证不再逐字比较验收标准文本，验证者抄错结尾句号、空白或大小写不会再导致每次尝试失败。
- 运行级失败（超时、取消、报告无法校验）也会打印 `Failures:` 行（取自运行级错误类别），
  而不是什么都不显示。
- 单条畸形路由记录不再毁掉整份台账；投递回落改取**上一次合法配置**，因此后续非法编辑
  无法静默撤销已经生效的编辑。

#### 破坏性说明（`0.1.0` → `0.2.0`）
- **强制入口默认开启。** 需要旧的可选行为请设 `enforceGate: false`。要求"绝不静默降级"
  的部署还应收紧 `gateRequired: true`：把"运行时没有 `agent/pre-step` 钩子"从警告变成
  载入错误。
- **报告为纯增量但已扩展**：任务行新增 `writesPaths`（数组或 `null`），失败新增 `class`
  与 `category`，且 `plan.tasks` 必须与 `tasks` 逐字段一致。拒绝未知字段的消费方需要
  适配；忽略未知字段的消费方不受影响。
- **配置键会校验**：未知键在载入时被拒绝并给出建议；`roles` 链出现空模型、重复路由或
  超过三条会被拒绝。`0.1.0` 下因键被静默忽略而"能用"的配置，现在可能直接报错——这是
  有意为之。
- **验收标准去重**可能拒绝 `0.1.0` 曾接受的输入。
- 需要 DSH `0.2.1-rc.2` 与 Node.js 22 及以上；`0.1.0` 的 peer 集合不再受支持。

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
