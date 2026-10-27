# Technical Decisions

Each entry records the decision, evidence, alternatives, and status.

## D-001 — Build an external DSH bundle, not a DSH core patch

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** Ship `dsh-grok-workflow` as an external npm-style bundle with a
  `dsh.bundle.patch` manifest, installed into a DSH profile with
  `dsh plugin --profile <name> add <package>`.
- **Evidence:** DSH `docs/user/develop/basic/publish.md` and
  `docs/architecture.md` define bundles, profiles, patch layers, and
  `dsh plugin`. The user also requires that DSH core is not modified.
- **Alternatives rejected:** Forking `deepseek-harness`; patching the DSH
  installation; requiring a privileged global install.
- **Consequences:** The plugin can only use documented DSH services and must
  remain compatible with the declared DSH version range.

## D-002 — Execute the strategy as a DSH workflow script, not a new agent engine

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** The `grok_workflow` tool will generate a deterministic
  plain-JavaScript orchestration script and run it through
  `ctx.workflowEngine.start()`. Child agents are created by the engine's
  `agent()` hook, which delegates through DSH's subagent capability.
- **Evidence:** `packages/workflow/workflow/src/runtime-types.ts` defines
  `WorkflowStartRequest`/`WorkflowRun`; `packages/workflow/workflow-ptc`
  executes scripts with `agent()`, `parallel()`, and bounded child caps;
  `packages/subagent/subagent` owns child lifetime and cleanup.
- **Alternatives rejected:**
  - Porting Grok Build's Rust/Rhai workflow runtime (large, incompatible, duplicates DSH).
  - Implementing a new subagent scheduler inside the plugin (would duplicate DSH lifetime/admission logic).
  - Only emitting prompt advice with no executable workflow (would not meet the acceptance criteria).
- **Consequences:** Planning, verification, retry, status aggregation, and
  evidence validation live in the generated script and host-side validation,
  while execution and child lifecycle stay with DSH.

## D-003 — Bound concurrency and retries in the plugin contract

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** `maxConcurrency` defaults to 3 and is schema-capped at 6;
  `maxRetries` defaults to 1 and is schema-capped at 3; `maxTasks` defaults to
  6 and is capped at 12.
- **Evidence:** User requirements; DSH workflow engine's own caps are
  deployment-level, so the generated script must enforce the tighter per-run
  contract itself.
- **Consequences:** The script uses a bounded worker pool and a bounded attempt
  loop. Exceeding a cap must fail validation, never silently increase it.

## D-004 — Verification is criterion-based and requires evidence

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** A task is reported as `verified` only when the independent
  verifier returns `verdict: pass`, every acceptance criterion is marked met
  with non-empty evidence, and the verifier reports at least one concrete
  checked-evidence item. Missing/invalid evidence is a failure and consumes a
  retry.
- **Evidence:** User requires independent verification, not restating the
  executor's success claim; Grok Build's deep-research workflow independently
  re-checks claim IDs and sources.
- **Alternatives rejected:** Trusting the worker's `status` field; counting a
  verifier's bare `pass` without evidence.
- **Consequences:** Some legitimate results may be marked partial when a
  verifier cannot produce traceable evidence. That is the intended fail-closed
  behavior.

## D-005 — Do not embed Grok Build's Rhai runtime

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** Reuse Grok Build's workflow *strategy* (plan → bounded fan-out →
  independent verification → synthesis), not its Rust implementation.
- **Evidence:** Grok Build's workflow manager is tightly coupled to
  `xai_grok_shell`, `xai_workflow`, journals, Rust cancellation tokens, and
  Grok-specific subagent/task hooks. DSH already provides a sandboxed workflow
  engine and subagent seam.
- **Consequences:** Pause/resume/journaling and Grok's budget leases are out of
  scope for the MVP; cancellation/unload and per-run bounds remain in scope.


## D-006 — README landing page and language toggle

- **Status:** CONFIRMED; PR #16 merged as `ea3e8e31`.
- **Date:** 2026-10-25.
- **Decision:** Keep root `README.md` as the English landing page and add `README.zh-CN.md` as the complete Simplified Chinese version. Add reciprocal language links near the top of both pages. Include a simple workflow illustration in each language; keep detailed configuration, architecture and acceptance material in `docs/`.
- **Reason:** New users should see the purpose, exact prerequisites, one-command GitHub installation, one natural-language example, workflow stages and troubleshooting before advanced implementation detail.
- **Alternatives:** Keep one long bilingual README (harder to scan); move English to another filename (would remove the default GitHub landing page); use remote screenshots (adds external image dependency).
- **Impact:** Adds a second README and two small SVG assets; package `files` allowlist includes the Chinese README. Install compatibility requirements are unchanged.

## D-007 — Allow a verified fallback task to remain `partial`

- **Status:** CONFIRMED; fixes issue #17.
- **Date:** 2026-10-25.
- **Decision:** Host report validation permits `partial` with all tasks verified
  when `plan.source === 'fallback'`, provided the plan error is non-empty. A
  fallback plan still can never be `completed`. For `caller` and `planner`
  plans, `partial` retains the stricter mixed verified/failed requirement.
- **Reason:** The generated script deliberately degrades planning to a
  single-task fallback and reports `partial` even when that task verifies. The
  host invariant previously assumed every `partial` report had a failed task,
  so it rejected a legitimate, intentionally conservative result. Verification
  success and planning provenance are independent signals.
- **Alternatives rejected:** Reporting the fallback run as `completed` (hides
  degraded planning); dropping the fallback task's verification (discards real
  evidence); accepting `partial` with no planning error (loses provenance).
- **Consequences:** The canonical report can be `partial` with
  `verifiedCount === tasks.length` only for a fallback plan; every other
  all-verified `partial` report remains invalid.


## D-008 — Publish version-tagged GitHub Releases with preflight checks

- **Status:** CONFIRMED; `v0.1.0` released on 2026-10-25.
- **Date:** 2026-10-25
- **Decision:** Release only from a version tag `vMAJOR.MINOR.PATCH` after the matching release commit has been merged to `main` and CI passes. Use one bilingual changelog and keep `package.json` and `package-lock.json` in sync.
- **Preflight:** Release Actions checks the tag/package version match, requires a changelog section for that version, runs typecheck/lint/build/tests, checks committed `lib/` artifacts, and validates the package file list before attaching an npm-format tarball to a GitHub Release.
- **Reason:** The project currently has Git commits and CI but no GitHub Releases, so end users have no named, easy-to-install release version or curated release notes.
- **Alternatives rejected:** Release every development commit automatically (exposes intermediate states); publish to npm (not the project's current distribution model).
- **Consequences:** A published tag must never be moved or overwritten. GitHub Release/version history is not an independent backup mirror.

## D-009 — U 决策定案（用户 2026-10-26 批准 U-1..U-7，U-8/U-9 采安全默认）

- U-1 答案路线：in-turn 为默认（t25/t26 真实 headless A/B 证据在用户批准 (a) relay 建议后升级了默认形态）；relay/append 保留给长驻 UI。
- U-2 重试所有权：v1 仅脚本层 L1 备用链，不注册 agent/request-error，不与 dsh-llm-retry 争所有权。
- U-3 synthesizer：确定性聚合为默认，synthesis:'model' 为可选开关（失败自动回落，不丢已验证内容）。
- U-4 并行写路径：planner 任务声明 writesPaths，重叠任务串行化（**已实施**：t29 / `bd1f261`，判定函数 `src/paths.ts`、调度 `mapLimitIsolated`、文档 DD-8a + ROADMAP §11；规划器真实填充率仍为 NR-9）。
- U-5 严格模式成本：用户接受每消息完整工作流的延迟与调用开销。
- U-6 设置：YAML/配置层先行；带模型下拉的链编辑器（client module）= Phase 9 backlog。
- U-7 强制范围：preset 作用域（gateScope/gatePreset 白名单），非全进程。
- U-8 拦截面：维持 source.kind='user' 边界并显式文档化（不扩拦 user-question-reply/team-message/webhook/schedule 等）。
- U-9 时长体感：维持 timeoutMs 默认（30 分钟）；流式进度提示入 backlog。

## D-010 — 夜间自主执行与发布纪律（用户 2026-10-26 授权）

- 计划执行无需逐步批准；实施→测试→独立复查→修复→重测的循环照旧，严格验收标准。
- 每个批次整合后即时 push 同步 GitHub；版本里程碑设 tag：v0.2.0-rc.1（功能收口）→ v0.2.0 + GitHub Release（阶段 7 验收后）。v0.1.0 tag 永不移动。
- 模型：wb/cn:deepseek-v4.1-flash 优先，wb/global:deepseek-v4.1-flash 全局并发 ≤2；模型故障即换（成员重指派/换路由）。

## D-011 — 0.2.0 的破坏性边界（阶段 7 定稿）

- **Status:** CONFIRMED（随 0.2.0 发布说明一并发布）
- **Date:** 2026-10-26
- **Decision:** `0.2.0` 把强制入口（`enforceGate`）默认设为 `true`，即"每条用户消息走完整工作流"成为默认行为；`0.1.0` 的"仅模型主动调用工具"改为需要显式 `enforceGate: false`。
- **Reason:** 用户核心需求 A 就是"每条消息强制完整工作流"；把它做成默认关闭的可选项，等于交付了一个不满足需求的默认形态。
- **Compatibility:** 报告为纯增量扩展（`writesPaths`、失败 `class`/`category`），但配置面收紧（未知键拒绝、链校验、`switchOn` 白名单），且验收标准归一化去重会拒绝部分旧输入——这三点必须在更新日志的 breaking notes 明写。
- **Alternatives rejected:** 默认关闭（默认不满足需求）；一次性大版本 `1.0.0`（内部仍有 L2 路由、链编辑器未做，版本号会虚高）。
- **Consequences:** 升级者若不想要强制入口必须显式关闭；要求"绝不静默降级"的部署需再加 `gateRequired: true`。

## D-012 — 安装后严格测试与修复发布闭环（用户 2026-10-26 指示）

- 安装到真实 profiles 后执行严格功能测试矩阵（强制入口/幂等/失败路径/设置页渲染/组合共存/递归防护/secrets/稳定性），逐 profile 逐项记录通过与否。
- 发现 bug 即修：单写者修复 → npm run ci 全绿 → 独立复查 → 整合 push → bump patch 版本 → 新 tag + GitHub Release → 重新安装新 tag → 重跑全部用例。
- 已发布 tag 永不移动（v0.2.1/v0.2.2… 递增）；安装一律锁 tag；每步证据进 docs/knowledge；可随时回滚上一 tag。

## D-013 — 运维两条硬规则（用户 2026-10-27 要求，t32 落地）

- **Status:** CONFIRMED
- **Date:** 2026-10-27
- **Decision 1（服务不重启）:** 不得重启、杀死或改动正在运行的本机 `dsh web` 服务（当前 live 实例 `:3090`，PID 825935，`DSH_HOME=/home/fish/dsh-layerfs`）。任何验证都在**新建 profile + 新端口的新实例**上做；live 的重新加载只能由用户批准后执行，实施者只提供步骤清单。
- **Decision 2（队长只计划不实施）:** 队长（captain）只做计划、派单、验收与整合，**一切实现由子代理完成**；队长不得亲自写代码/改文件。
- **Reason（规则 1）:** live 实例承载用户的真实会话与工作区；重启会中断在跑的任务、丢掉内存态（而"设置写入只影响下一条消息"的语义正是为了不打断在跑的任务）。t32 的一次 `pkill -f "profile web-grok-debug"` 差点匹配到自己的命令行并波及无关进程，说明"按模式杀进程"本身就不安全——改为按 `ss -ltnp` 解析出的 PID 精确 kill。
- **Reason（规则 2）:** 实施与验收必须分离，否则"自测自过"；独立子代理 + 单写者 + 队长验收是本项目已经跑通的模式（t15/t29/t32）。
- **Evidence:** t32 全程在 `/home/fish/dsh-layerfs/profiles/web-grok-debug` + `127.0.0.1:3199` 上取证，结束后仅 kill 自己启动的 PID；live `PID 825935` 全程存活（多次 `ps -o pid -p 825935` 校验）。
- **Alternatives rejected:** 直接重启 live 观察效果（违反用户边界）；用 `pkill -f` 省事（t32 已出现自伤）。

## D-014 — 激活前提：图形/工具面出现 `grok_workflow` 需要"工作流 provider 行是启用的"（t32/t33 实测，t35 修正）

- **Status:** CONFIRMED
- **Date:** 2026-10-27（t35 补充实测口径）
- **Decision:** 任何安装说明都必须包含"在 profile 的 `cordis.patch.yml` 里把 `workflow-ptc` 的 `disabled` 置为 `false`（`provider: spawn`）"这一步，并把"激活"定义成四条可检验事实（启动无 pending 警告、`settings/describe` 有命名空间、GUI 有 Grok workflow 卡片、真实会话 `request/header.tools` 含 `grok_workflow`）。
- **Reason（逐层实测，不是推断）:** `@deepseek-ai/dsh-base/cordis.patch.yml`（第 397-406 行）把 `ptc-runtime`、`workflow-ptc`（`config.provider: spawn`）、`tool-workflow` 作为**启用**行插进基础组合；`@deepseek-ai/dsh-web-app/cordis.patch.yml`（第 567-568 行）随后把 `workflow-ptc` 与 `tool-workflow` 一起置 `disabled: true`。所以：
  - **headless / tui（只叠 base）本来就带引擎** —— 这解释了阶段 3 以来所有 headless 端到端运行不需要任何额外步骤；
  - **只有 web 需要补这一行**；`agent preset` 与 `dsh --preset` 在 0.2.1-rc.2 里都不重新启用它（无此 CLI 参数，`dsh-agent-preset` 也不 patch cordis），能启用它的是"去掉 web-app 层"或"任意后置层写 `- id: workflow-ptc / disabled: false`"——即 t34/F6 所记的"重新启用"实质由 **base 层 / 显式 patch** 完成，不是某个 preset。
- **Reason（同源风险）:** `dsh plugin add` 只把包放进 `dsh.profile.bundles`（`--dump-config` 能看到行），**装包 ≠ 激活**；服务缺失时 Cordis 让插件长期 `pending`，`apply()` 永不执行 → 无工具、无设置面、无门禁。t33 的 92,716 字符系统提示里 0 次 `grok_workflow` 正是这个原因。
- **Evidence:** t32 在新 profile 上对比同一配置：`workflow-ptc.disabled: true` → 启动打印 `grok-workflow (dsh-grok-workflow): pending (waiting for service: workflowEngine)`，`settings/describe` 无该命名空间；改为 `disabled: false` 后启动干净，`settings/describe` 出现 `grok-workflow`（`autoGenerate: true`，17 字段），真实 GUI 会话 `request/header.tools` 出现 `grok_workflow` 并触发门禁。t35 在 0.2.1 上重复该结论（`docs/knowledge/VALIDATION.md` Round 3、`docs/knowledge/evidence/t32/`）。
- **Consequences:** 0.2.0/0.2.1 的安装/升级说明新增一步；`subagentProvider` 只接受 DSH 子代理提供者名（`spawn`/`fork`），填 LLM 供应商名会让每次运行 fail-closed（`no subagent provider registered for "<id>"`）。
- **Addendum（t35/F7）— `plugin add` 与 `dsh.profile.bundles` 的真实边界:** `dsh plugin add` 结尾走 `reconcile()`（`@deepseek-ai/dsh-plugin-manager/lib/index.js:326-341`）：非依赖的层条目（如 `@deepseek-ai/dsh-base`）无条件保留；是依赖的条目**仅当其安装包仍声明 `dsh.bundle`** 时保留；新装依赖只有声明 `dsh.bundle` 才追加为层，否则只当普通依赖并打印 `<name> declares no dsh.bundle — installed as a plain dependency, not a profile layer`。所以"覆盖 bundles"的准确说法是"按依赖与 `dsh.bundle` 元数据对账"：t32 里层条目消失的真因是安装包清单的 `dsh` 字段被脚本重写成只剩 `client`（`dsh.bundle` 丢失），而不是"新包挤掉旧包"。安装后必须核对 `dsh.profile.bundles` 仍在（见 `docs/LOCAL-TESTING.md` 的 live 生效步骤第 4 步）。
