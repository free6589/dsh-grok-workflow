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

## D-015 — 设置页文案跟随 DSH 语言设置（t42）

- **Status:** CONFIRMED
- **Date:** 2026-10-27
- **Decision:** 设置页的**全部**文案（卡片标题/简介、分组标题、字段标签、数值范围、角色链编辑器、只读行、保存/放弃、保存结果、全部校验错误）经由组合自带的 `@deepseek-ai/dsh-client-locale` 解析：bundle 用 `ctx.locale.register('grok-workflow', { zh, en })` 注册字典，并给 `plugins.item` 槽声明 `locale: 'grok-workflow'` 以取得框架的 `t` 座位。**不**读 `navigator.language`，不做自己的语言探测。
- **Reason:** 用户要求"随 DSH 设置的中/英文变化，与 DSH 原生设置页一致"；该包正是 Settings → General → Language 与 `<html lang>` 的所有者，且渲染器在每次 locale revision 上重算 `t` 座位（`useLocaleRevision`），所以页面、卡片标题与简介都能就地换语言，无需重载。
- **Reason（为何不把 `locale` 写进 `inject`）:** Cordis 没有可选注入，`inject` 里的名字即硬依赖；缺服务会让插件停在 `pending`，而 DSH 把 pending 当作**整个 web 客户端启动失败**上报。为一个"最坏也只是英文"的页面换取 GUI 启动失败不划算，因此 `apply()` 先以自带 translator 挂载，再用嵌套 `ctx.inject(['locale'], …)` 取得服务后注册字典并重挂（带着 `locale`）。`inject` 仍为 `['slots','configForms']`。
- **Reason（`ctx.get('locale')` 不是替代）:** `Context#_getImpl` 走本 fiber 的 isolate 映射，未注入的服务对它同样不可见，随后的属性读取会抛 `cannot get property "locale" without inject`（实测，本任务第一版即踩此坑）。
- **Evidence:** `test/client.spec.ts` 结构性钉住（两字典键集相同、数据派生键双语且不退化、每条 finding 两种语言不同、`apply()` 注册双语字典并声明 `locale`、无 locale 服务时仍可挂载）；GUI 双语取证见 `docs/knowledge/evidence/t42/`（经 Settings → Language 切换，`<html lang>` 由 `en` → `zh-CN`，重载后保持）；`npm run ci` 全绿（19 文件 / 293 测试）。
- **Alternatives rejected:** 硬编码中英混排（0.2.1 的做法：视觉噪音、无法把值嵌进句子、无视用户所选语言）；读 `navigator.language`（与 DSH 设置不同源，用户改了设置页不变，正是本次要修的偏差）；自建 i18n 表（与原生设置页不一致，且会与 locale 插件抢"当前语言"这个唯一事实）。
- **Consequences:** 新增文案必须同时写 `zh` 与 `en`，否则测试失败；校验结果保持 `{key, params}` 数据形态（新增错误码需同步两语言）；`docs/knowledge/evidence/t42/` 成为页面文案的取证基线。

## D-016 — 并发槽位按会话计，另设进程级总量兜底（t45，修 t41 实证的"一会话饿死所有会话"）

- **Status:** CONFIRMED
- **Date:** 2026-10-27
- **Decision:** `maxActiveRuns` 的语义改为**每会话**（默认仍 2），新增 `maxActiveRunsTotal`（默认 8，硬上限 16）作为**进程级**兜底；两条限额分别校验，拒绝文案必须写明**谁占着槽**（run id + 已跑时长；总量拒绝则列 session + 该会话 run 数与最老 run 时长）。
- **Reason:** t41 在三个不同 workspace 记录到 4 次 `start-failed`，全部发生在"已有 2 个 run 并存"的时刻，而 `createActiveState()` 在 `apply` 作用域里被全进程共享——即**一个会话的两个长 run 可以饿死所有其它会话**，用户在一个窗口发问会收到"already has 2 active run(s)"这种无法自救的英文拒绝。日记账（`plugin:grok-workflow/delivery` 8 条）可复现：2a7c7254 t7 + 08daa48b t64 两个长 run 期间，3335d3d3/0b073299/2ef91d3e 三个会话各被拒。
- **Reason（为何不是 per-workspace）:** 会话是 DSH 的配额与审计单位（`session.id` 在 gate/records/routing 里已经是身份），workspace 只是 cwd 分组；一个 workspace 里可以有多个并行会话，按 workspace 计会让"同一个文件夹开两个会话"互相挤占，且我们拿不到稳定的 workspace 身份（只有 cwd 字符串，软链/重命名都会漂移）。
- **Reason（为何仍要保留全局兜底）:** 没有总量限制时，N 个会话就可能有 2N 个 run、每个 run `maxConcurrency` 个 spawn 子代理，进程级 fd/内存/模型配额会先崩掉；8 个并发 run 是实测下仍可控的量级，且它只在**多会话同时长跑**这种罕见场景触发。
- **Evidence:** `test/lifecycle-disposal.spec.ts` 三例：①同一会话 2 个长 run 后第 3 个被拒且文案含 `maxActiveRuns is 2 per session` 与 `holding: run run-1 (running …)`，同时**另一个会话照常起跑**（修复前这里会被拒，即回归复现）；②"已 admit 未 start"的 run 只计入本会话、不影响其它会话；③`maxActiveRunsTotal` 达上限时拒绝并列出占槽会话。变异验证：把按会话计数改回 `state.runs.size + state.pending`，上述三例全部失败。
- **Consequences:** 设置页把 `maxActiveRuns` 标签改为"每会话活跃运行上限 / Active runs per session"，并新增"全部会话活跃运行上限 / Active runs across all sessions"；`CONFIG_KEYS` 22 → 23，volatile 投影 18 → 19（`test/settings-projection.spec.ts` 与 `test/config.spec.ts` 同步钉住）。行为变化对既有安装是**放宽**（原来被全局挤占的会话现在能跑），不会让之前能跑的场景变失败。

## D-017 — 单次工作流 deadline 默认 30 分钟 → 60 分钟（t45，按实测改，不做按任务数自适应）

- **Status:** CONFIRMED
- **Date:** 2026-10-27
- **Decision:** `timeoutMs` 默认值改为 `3_600_000`（60 分钟），硬上限保持 `86_400_000`；工具注册时的 `timeoutMs` 仍为 `min(timeoutMs + 60_000, 86_400_000)`，跟随该值。**不**引入"按任务数自适应"的默认算方式。
- **Reason:** t41 实测两次被杀在 `30m00s` 与 `30m01s`（2a7c7254 t6、cb452931 t39），报告的失败行是 `workflow exceeded the 1800000 ms deadline and was cancelled`；而真跑完的四任务工作流用时 878 s / 1148 s / 1801 s。即 30 分钟是**贴着真实工作量**的刀口，不是安全边际：四任务 + 一条慢 provider 链就会撞线。60 分钟给观测到的最坏情况约 2x 余量，同时仍保住"挂死的 run 不会永远占着槽"这一性质。
- **Reason（为何不做自适应）:** 任务数在 planner 返回前未知（门禁路径先规划后执行），而 deadline 必须在启动时定；用 `maxTasks` 猜上限等于把"最多 12 个任务"当成"必然 12 个任务"，在常见 1-2 任务场景下给出 6 小时的荒唐上限。需要更长 deadline 的用户可以在 profile patch 里显式写（该值已能被 `configVersion` 前的 schema 校验），把"要多长"留给人而不是公式。
- **Evidence:** `test/lifecycle-disposal.spec.ts`：默认值断言 `3_600_000`、硬上限仍可设到 `86_400_000`、以及一次真实超时报告里写出"`1000 ms deadline`"（证明报告用的是**实际生效**的值而不是硬编码文案）；`test/input.spec.ts` 与 `test/client.spec.ts` 同步钉住默认值与设置页范围。变异验证：把默认值改回 `1_800_000`，两处断言立即失败。
- **Consequences:** 设置页 `timeoutMs` 的默认值显示为 `3600000`（范围 1000–86400000 不变）；t42 取证截图里的 `default 1800000` 属于**历史基线**，不再代表当前默认值。仍遗留一条真实缺口：deadline 临近没有进度事件（t41 的 P1-3/U-9），本决策不覆盖，记在 WORKFLOW-DESIGN 的 DD-13 与 VALIDATION Round 5 的 NOT_RUN 里。

## D-018 — deadline 由插件自己强制执行（t47，修 t46 实证的"引擎不收 abort"）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `runWorkflow` 的 deadline 不再"abort 一个 signal 然后等引擎收尾"，而是**插件自己的硬上限**：一次 `Promise.race([run.result, deadline])`，deadline 先到就 `run.cancel('workflow deadline exceeded after N ms')` 并当场返回超时报告；`config.timeoutMs` 同时进入运行报告（`Deadline: <n> ms per run (enforced by the plugin)`）。
- **Reason:** t46 在设置页保存 60 000 ms 后，运行在 2 分 40 秒、5 分钟时仍在工作；本轮用**干净重启 + profile patch 直写 60 000**复现并定性：报告自己说 `workflow exceeded the 60000 ms deadline and was cancelled; the engine had not settled`，UI 上运行节点在 **61.5 s** 离开 `running`。即**设置到达了运行时，是引擎在长子调用中不响应 abort**——t46 的两个候选原因里是第二个。原实现只能"请求取消"，上限的可靠性等于引擎的合作度。
- **Reason（为何报告里要写 deadline）:** t46 无法回答"到底哪个值在生效"——该值只存在于内存。现在它与路由链一起写进报告，会话日志即可自证。
- **Reason（为何同时改取消原因）:** 原代码把 deadline 触发的取消写成 `workflow cancelled by its caller`，把责任指向用户；现在写 `workflow deadline exceeded after N ms`，与 unload（`plugin unloaded`）、用户中止（`by its caller`）三分为三。
- **Evidence:** `test/reliability.spec.ts` 新增"stubborn engine"用例：`cancel()` 是 no-op 的引擎下，1 000 ms deadline 约 1.0 s 返回 Timeout 报告（修复前会一直等），并断言 cancel 原因含 `workflow deadline exceeded` 且不含 `by its caller`；`test/report.spec.ts` 断言 `Deadline:` 行与 `limits.timeoutMs` 不符即拒收；真机取证 `docs/knowledge/evidence/t47/B1-deadline-report.txt`、`A-run.log`。
- **Alternatives rejected:** 只改文档、把"引擎不合作"留作已知问题（用户拿不到按时报告，且下一次仍会被误判为"设置没生效"）；在引擎侧修 abort（属 DSH 核心，越界）。
- **Consequences:** 超时报告可能先于引擎真正停下出现——报告文案已明说 `the engine had not settled, so this report is the authoritative result`；被杀掉的 run 仍走既有 `run.dispose()` 路径。

## D-019 — 卸载提示行：只入台账 + 报告是唯一用户可见通道（t47，插件侧无渲染路径）

- **Status:** CONFIRMED（0.2.3 提案挂在末尾）
- **Date:** 2026-10-28
- **Decision:** 卸载时写入的提示行**保持** `assistant/message`（`source: grok-workflow/workflow-notice`，带 `surfaceOp: 'append'`）不变；**不再**把它当作 transcript 通道承诺。用户告知由报告承担，提示行的第二个作用（把"强制工作流已关闭"写进下一轮上下文）保留。
- **Reason:** 该行位于 `turn=1 step=0`，而客户端只为 `step/start` 开节点（`dsh-client-ui-chat/lib/client.js:8094-8108`：`step/start → start`，`assistant/message` + `surfaceOp: append → update`），`buildViewNode` 又需要该 step 节点的 `publishedAssistantData`；本会话第一个 `step/start` 出现在提示行之后（`seq 14`，`turn 1 step 1`），故 `1:0` 永远没有节点，行被丢弃。可选路径逐条被堵：伪造 `step/start` 会往日志里塞一个 agent loop 从未开启的 step（loop 的编号、`turn-process` 分组与下一轮上下文都从日志推导）；`system/message` 渲染成**系统提示卡**（`client.js:9947-9966`），用它等于宣称提示词变了；`conversation.chat.node` 是**按 key 的渲染座位**（`client.js:7180-7215`，key 为 user/steering/context/turn-trigger/system-prompt/assistant-step…），节点只能由 chat 包自己的投影创建（`chatNode()` 是模块私有）；包里没有任何 toast/notice API。
- **Reason（为何不改成 plugin 事件）:** 提示行现在会进入 surface，下一轮上下文因此知道"强制工作流已关闭"——这是 t45 的设计意图；改成不可渲染的 `plugin:*` 事件会丢掉这个作用，而换不来任何用户可见性。
- **Evidence:** `docs/knowledge/evidence/t47/`：`E5-notice-event.json`（事件含 `surfaceOp: "append"`，`turn 1 step 0`）、`E3-conversation-after-unload.{png,txt}`（同一会话的 transcript 里没有该行）、`E5-report-relay.txt`（同一 run 的报告写明因卸载被取消）。同时纠正 t46 的错误结论：该事件**带** `surfaceOp`，t46 是在 `data` 里找的。
- **Alternatives rejected:** 写成 `user/message`（t45 已测：非 `user` source 的用户行不被渲染，且会伪造用户发言）；写进当前 step 的 `assistant/message`（会把模型回复覆盖掉）；在卸载瞬间发 toast（bundle 正在被销毁，且 toast 是瞬时的，不构成可回溯的告知）。
- **Consequences (0.2.3 提案):** 要让插件写出"能看见的一行"，需要 DSH 侧提供其一：①公开的 chat node 贡献 API（插件自带 key + 自己的投影），或 ②带投影的 notice 事件类型。两者都在"外部插件、不改核心"的边界之外，故本版如实降级，未静默丢弃。

## D-020 — 任务判定只认结构化判断，散文字段不参与（t49，修 8/12 报告的质量失败）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `checkVerification` 的判定依据是 verifier 的**结构化判断**：`verdict`、每条验收标准一条 `criteria`（含 `met` 与非空 `evidence`）、以及 `checkedEvidence` 非空、criteria 条数与任务一致。散文字段 `issues` **不参与判定**：已通过任务的 `issues` 以 `verifier note: …` 进入报告 `Uncertainties`。`verdict: fail` 或任一 `met: false` 仍然判失败。
- **Reason:** 测试 home 12 份报告里 **8 份**失败的 reason 全是 `verifier reported issues: …`，而该字符串由 `checkVerification` 里**晚于** verdict 检查的分支产出 ⇒ 这 8 次 verifier 的 `verdict` 都是 `pass`，任务只因它写了句备注就判失败。备注自己的措辞是"non-blocking"、"minor observation rather than a failure"、"does not affect any acceptance criterion"、"判定为满足"。即这是**我方判定缺陷**，不是"flash 当 verifier 太严"也不是"worker 太弱"：同一批数据里 verifier 从未把某条标准判为不满足。
- **Reason（为何不让散文否决结构）:** 两个权威并存时弱者胜出，等于要求模型"不许有任何意见"才能通过；模型对散文的用词不可控（本次是提示词从未定义 `issues` 的含义，只要求该字段存在）。判定的可解释性也要求单一权威：`met`/`evidence` 可逐条核对，散文不可。
- **Reason（为何补提示词）:** 只改代码会让 `issues` 变成陷阱（模型以为写了有用、实际被降级为备注）。提示词现明确：`issues` 只放**阻塞性问题**，且必须与 `verdict: fail` / `met: false` 一致；残余疑虑写 `confidence`。
- **Evidence:** `test/config.spec.ts` 新增三例（不含阻塞项、只用**真机原文**当 `issues` → `COMPLETED` 且备注进 `Uncertainties`；`met: false` → 仍失败；`verdict: fail` → 仍失败）；变异验证：恢复 `if (issues.length > 0) return …` 后 3 例中 2 例失败。真机：同一 flash 三链、同一批目标句（t46 第 1/4 轮曾失败）在修复后两次 `COMPLETED`（`docs/knowledge/evidence/t49/Q2-report.txt`、`Q4-report.txt`）。逐份归类的分析见 VALIDATION Round 8 与 `evidence/t49/README.md`。
- **Alternatives rejected:** 保留 `issues ⇒ fail`，靠换更强模型绕过（用户仍会因一句备注丢弃整轮工作，且把产品缺陷伪装成模型能力问题）；只改提示词不改代码（散文仍能否决结构化判断，模型换个说法就又失败）；把 `issues` 全部删掉（丢掉真实观察，报告里就看不到"这次取证是间接的"这类重要限定）。
- **Consequences:** 发布说明不得把"质量"说成提升——这是判定缺陷的修复，不是模型变强；0.2.2 的报告会把非阻塞备注放在 `Uncertainties`，读者仍能看到限定语。想更严/更松的验证属于 `roles.verifier` 的模型选择。`maxRetries: 0` 下真实质量问题仍是一次即失败、不重试。

## D-021 — 每条消息必过"前台"，前台公开分流四档（t52，语义变更）

- **Status:** CONFIRMED（用户明确授权，方案 C）
- **Date:** 2026-10-28
- **Decision:** 需求 A 的原文"每条用户消息强制走完整工作流"改为"**每条用户消息必过前台（front desk），前台公开给出档位与理由，绝不偷懒跳过**"。前台把消息分成四档：`chat`（直答档，模板秒回）、`fast`（快手档，单工人一次调用）、`team`（团队档，完整工作流 + 开工迎宾 + 进度面板）、`ask`（确认档，反问一句"这个要动用团队吗？可回复：简单 / 团队"）。配置 `mode: 'triage' | 'full'`，`full` 逐字节复现 0.2.2 之前的行为（每条消息都走团队，无档位行、无迎宾语、无轻量调用），旧模式的用户不受影响。
- **Reason:** 铁律的代价是每条"你好"都付一次规划+干活+检查；用户要的是"该省的省、该认真时认真，但**不许偷偷降级**"。因此判据从"是否走完整工作流"变成"是否公开档位并给出理由"：直答与快手档都在回答里写明"档位：X — 因为：…"，且直答档明说"这条没有动用团队"、快手档明说"只派了一个工人"。偷懒（不说明就单干）仍是被禁止的。
- **Reason（判据必须便宜）:** 分流是纯字符串判定（`src/triage.ts`，无时钟、无 I/O、无模型调用），因为一次分类用模型会给每条消息加一次成本与延迟——包括本该"秒回"的问候。规则判不准的部分交给用户：这正是 `ask` 档存在的意义，比"猜"便宜也比"猜"诚实。
- **Reason（直答档用模板而非一次调用）:** 实测在 :3100 上，直答档的一次模型调用返回 `{"reply":null}`（`agentsStarted=1 value={"reply":null}`），而同一脚本的快手档正常返回答案；模板同时满足"秒回"这一档位承诺，且没有失败模式。见 VALIDATION Round 9。
- **Reason（档位文字跟随消息语言而非 DSH 界面语言）:** 用户可能界面是英文而用中文提问，此时中文迎宾语才是他要的；消息语言同步可得。设置页的中英双语仍跟随 DSH 语言（那是浏览器端的 i18n 契约）。
- **Evidence:** `test/triage.spec.ts`（t52 交付时 22 例，t53 F1 修复后 **26 例**：分类表、彩蛋与回答语境、强制升级、`full` 回退、各档行为、措辞双语、14 条定向样本回归）；`npm test` 22 文件 / **366** 例（336 → 358 → 362 → 365 → 366，不回退）；真机矩阵见 VALIDATION Round 9/10 与 `docs/knowledge/evidence/t52/`、`evidence/t54/`。
- **Alternatives rejected:** 继续铁律（每条消息都付团队成本，用户已明确否决）；纯模型分类器（每条消息多一次调用/延迟，且判定依据进了不可审计的地方）；静默降级（不告诉用户走了哪档——这正是需求要禁的"偷懒"）；把 `ask` 档做成"猜一个"（用户明确要"拿不准就问"）。
- **Consequences:** 新增 3 个配置键（`mode`、`triageAsk`、`triageModel`），配置键总数 23 → **26**；`mode: 'full'` 是回退通道，`triageAsk: false` 让拿不准直接升级到团队档。既有测试里凡测"门禁/运行"的用例显式写 `mode: 'full'`，语义不变。

## D-022 — 前台判据是规则，档位文字跟随消息语言（t52）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `classifyTriage()` 只读消息文本与两项策略（`mode`、`triageAsk`）；语言由消息是否含 CJK 决定（`detectLanguage`）。优先级：`full` 模式 → 上一轮"确认档"的回答 → 显式升级（"用团队"）→ 寒暄词典 → 指向型模糊（"把这个弄一下"）→ 长度/信号计分（`deliverables` 计数、多步连接词、分句数）。
- **Reason:** 规则可测、可解释、零延迟；每条规则都在 `test/triage.spec.ts` 里有正反例。CJK 判定是为了让"双语措辞"落在用户读得懂的语言上（见 D-021）。
- **Evidence:** 分类表在 t52 交付时 21 例通过，t53 F1 追加后 `test/triage.spec.ts` 共 26 例；`full` 模式回归：既有 336 例在 `mode: 'full'` 下全部保持（t52 后 358，t53 F1 后 362，t56 后 365，t58 后 366）。
- **Alternatives rejected:** 读 DSH 的 `locale` 偏好作为唯一依据（它是浏览器偏好，可能与消息语言不一致，且需经 `settings.describe()` 重读整个命名空间）；英文动词不加词边界（实测 `run.ts` 被当成动词 `run`，把重构任务压到快手档——已修，测试钉住）。
- **Consequences:** 规则漏判由 `ask` 档承接，不会静默降级；新增词汇需要同时补测试与 `DETAIL` 文案。

## D-023 — 快手档一次调用走引擎，不走旁路（t52）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `fast` 档用 `workflowEngine.start()` 跑一段"只有一个 `agent()`"的脚本（`runSingleCall`），不直接调 provider，也不复用完整工作流脚本。该调用分两次形态：**主调用不带 schema**（子代理的自然语言回答就是答案），只有在主调用拿不到任何文本时才**重试一次带 schema 的结构化调用**（`{"reply": …}`）。
- **Reason:** 直接调 provider 会绕开引擎已经做对的三件事：把子 agent 归属到父 agent、计入子 agent 上限、发出 `workflow/agent-start` 供进度面板显示；而完整工作流会给"简单任务"强加规划与复核的成本。失败时不静默升级为团队档（否则档位行就是谎话），而是如实告知"快手档没答出来"。
- **Evidence:** `test/triage.spec.ts`（快手档 1 次调用、失败不改档位）；真机 :3100 快手档返回"30"并带"只派了一个工人"（`evidence/t52/M2-fast.txt`）。
- **Alternatives rejected:** 复用完整脚本（两次以上调用、分钟级延迟）；直连 provider（丢失归属/上限/进度）；失败后自动升级（档位行失真，且用户以为"很快"却等了几分钟）。
- **Consequences:** 快手档模型由 `triageModel` 覆盖，留空即用本次运行的路线；一次调用失败就是失败，需要重发或说"用团队"。

## D-024 — 确认档的记忆在插件内存里，10 分钟、用后即弃（t53 F1，明确披露）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `ask` 档问出的那句"这个要动用团队吗？"以及用户随后回答的"简单/团队"，存在 `installGate` 内的 `pendingAsks: Map<agentId, askedAt>` 里：**进程内存**、TTL 10 分钟、取值即删（`takePending`）。不做会话持久化。
- **Reason:** 持久化需要把"本会话正等待一次分档回答"写进会话事件再读回来；本插件能**写**自己的记录（`plugin:grok-workflow/delivery`），但没有在真机上验证过的"读回自己历史记录"的接口，猜一个 API 会在运行期变成新的失败面——这比一次可以说明白的遗忘更糟。因此选择"诚实降级"：过期或重载后的裸"简单/团队"落 `chat` 档并明说原因（`stale-choice`），绝不静默开跑用户没配对任务的活儿，也不崩。
- **Reason（为什么不能靠猜）:** 没有 pending 时把裸"团队"当强制升级，会让一句回答过期的"团队"启动一次完整工作流，花的钱和"这条消息要干什么"完全无关；把裸"简单"当快手档则会让一个工人去执行一个不存在的任务。两种都比"问回一句"更糟。
- **Evidence:** `test/triage.spec.ts`「does not crash on a bare choice word with no question waiting」（4 个裸词 → `chat`/`stale-choice`，且回答里说明了原因；`pending: true` 时同样四个词正确读作回答）；真机 t54 矩阵把这四个词逐条发过（`evidence/t54/`）。用户可见披露：README「The front desk」小节与 `DETAIL['stale-choice']`。
- **Consequences:** 插件重载、或隔了十分钟以上再回"简单/团队"，会收到"上一轮没有待回答的分流问题…"的回答，需要把任务和选择写在一起（例如"用团队：把 X 改成 Y"）。这是记录在 README 的限制，不是缺陷。
- **Alternatives rejected:** 会话持久化（无验证过的读回接口，风险高于收益，见上）；永不失效（一句隔夜的"团队"启动一次完整工作流）；静默把裸词当强制升级（见上）。

## D-025 — 档位判定的顺序就是它的正确性：短路规则必须让位给强信号（t53 F1 blocker）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `classifyTriage` 的规则顺序固定为：`full` 模式 → 上一轮确认档的回答 / 裸选词 → 点名团队 → 寒暄词典 → 插件自述 → **指向模糊** → 长目标 → **多步（先…然后/序号/顿号/分号/并+动词）** → 团队计分 → **已识别的问句形态（≥ 快手档，绝不用模板）** → **短而惰性（模板）** → 冲突反问 → 快手 → 反问/升级。两条硬约束：①任何"廉价短路"（模板直答）必须排在全部强信号之后；②带锚点（路径/文件名/错误码/代码片段）的"这个报错"不算模糊，直接派工。
- **Reason:** t53 验收 blocker 的根因不是某条规则写错，而是**顺序**：`len<=40 && 无交付物 && 无动作动词 && 单句` 这条"短即寒暄"的短路排在多步与提问之前，于是"为什么天空是蓝的""先备份然后升级""这个报错 src/x.ts:42"全被模板答成寒暄，活儿一点没干。同时"模糊即反问"过宽，把带路径的真实报错也拦下来反问了一遍。
- **Reason（为什么提问单独成信号）:** 问句往往短、没有动作动词、没有交付物名词——按词汇计分永远落在"惰性"一侧，而它恰恰是**一定要去查证**的一类消息。把它作为独立信号提到短路之前，"短问句"就不再依赖长度或动词表。
- **Evidence:** `test/triage.spec.ts` 新增 4 组回归（14 条 t53 定向样本 + 中英对照若干）：短问句中/英各 3-4 条 → `fast`/`question`；短两步"先…然后/再"、"备份数据库并通知我"、`1) 2)`、`一、二、`、分号分隔 → `team`；带路径/错误码/片段的"这个报错" → 不止反问（`fast`），而"改一下那个"仍反问；裸词 → `chat`/`stale-choice`。全量 `npm run ci`：22 文件 / **362** 例（此后 365、366，见 D-026/D-027）。真机 :3100 逐条复验见 VALIDATION Round 10 与 `docs/knowledge/evidence/t54/`。
- **Alternatives rejected:** 只加提问词典、不改顺序（多步仍被短路吃掉）；把"短"阈值调小（治不了"先备份然后升级"这种 7 字两步）；用模型判断"这是不是问句"（又是每条消息一次调用，见 D-022）；把模糊判定整体删掉（"改一下那个"就没人问了）。
- **Consequences:** 规则顺序从此是**被测试钉住的产品契约**：新增短路规则必须排在多步/提问之后，否则回归测试会失败。`TriageSignals` 增加 `question` 与 `concrete` 两个字段，供后续规则复用。

## D-026 — t56 收尾：两条契约缺口按「改实现」补齐，并记下英文问句的教训

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** 三处缺口一律**改实现**而不是改契约文字（D-025 已经承诺过它们）：
  1. **句尾"几"**：`QUESTION` 从 `几[个号年月天时分秒]` 放宽为 `几(?![十百千万乎])`，于是 `等于几`、`得几`、
     `几台`、`几条记录`、`是几`、`剩几`、`几核` 都算问句（"几十/几百/几乎/几何"不算）。
  2. **纯顿号列表**：新增 `COMMA_LIST = /(?:[^\s、，。；;:：]{1,10}、){2,}/`——**三个及以上**顿号项算多步
     （`改配置、重启、验证` → 团队档）。两个项（`读、写`）不算：那通常是一个动作的两种说法，判成团队是浪费。
  3. **`并+动词`**：动词表补 `回滚|回退|重启|验证|灰度`。
  另外 `vague`（模糊即反问）**让位给提问**：带指向词的问句（`这个得几`）是"要去查一下"，不是"线索不足"，因此
  `vague` 规则加了 `&& !question`；无对象的指向（`改一下那个`）仍然反问。
- **Reason（为什么改实现）:** 契约文字是产品承诺，实现在它后面；如果为了省事改文字，就等于把"用户以为有保护"变成
  "文档承认没保护"。这三条都在 D-025 里写明承诺过，所以必须让代码追上文字。
- **Reason（英文的教训）:** t56 真机复验抓到一条单测没覆盖的误判——`is this repo using esm or cjs` 既没有 `?`，
  也不含任何 wh-词，于是被判成 `确认档`，前台对一个问题反问了一遍。英文是非问句的形态是**助动词前置**，不是问号；
  规则据此补 `\b(?:is|are|was|were|does|do|did|can|could|should|would|will|have|has)\s+(?:it|this|that|…)\b`。
  同时给 `MULTI_STEP` 补英文顺序词（`then`/`first…then`/`afterwards`/`finally`），保证 `do this then that` 仍先被
  判成多步，不会被"助动词前置"吃成问句。
- **Evidence:** `test/triage.spec.ts` 追加 3 组共 5 个断言块（句尾"几"8 例、顿号/回滚、英文是非问句 5 例 + `do this
  then that` 反例），全量 **22 文件 / 365 例**；真机 44 条矩阵在隔离工作区 `/tmp/t56-work` 上跑（VALIDATION Round 11，
  `evidence/t56/`）。误判修好前后的真机证据：同一句 `is this repo using esm or cjs` 修前 `Tier: confirm`（会话日志
  `session-b2159958…` 第 6 条），修后 `档位：快手档`。
- **Consequences:** 分类器的"问句"面更宽了（更多短消息落在快手档），这是有意的：问句是最不能省的一类消息。
  两个不变量因此可写死为测试断言：**多步永不吃模板、已识别的问句形态永不用模板**。
- **Alternatives rejected:** 只补中文顿号（英文是非问句继续误判）；把"三个顿号项"降成两个（`读、写` 会被判团队）；
  用模型判断问句（每条消息一次调用，见 D-022）。

## D-027 — 问句按**形态**识别，不按词表；"绝不用模板"只对**已识别的形态**承诺（t58）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** 三条通用问句形态进 `QUESTION` 信号的判定（**不是再往词表里加词**）：
  1. **`A不A` / `A没A`**：`/([\u4e00-\u9fff])[不没]\1/u`——任意单字动词/形容词在 不/没 两侧重复即问句
     （`多不多`、`是不是`、`能不能`、`有没有`、`对不对`…）。一个字的上下文就够，不需要枚举。
  2. **`还是` 二选一**：`/(?<![但可仍依])还是(?!觉|认|想|喜|倾)/u`，再用 `STATEMENT_CHOICE`
     排除副词用法（`还是` + `觉得/认/想/喜/倾/没/不/未/无/要/是`，或 4 字内出现 `了`）：
     `我该用 yarn 还是 pnpm` 是问句，`他还是走了` / `他还是没有提交` / `我还是觉得应该用 pnpm` 不是。
  3. **`谁`**：`/谁/u`，再用 `WHO_REPORTED`（`问/说/告诉/知道` 后 6 字内出现 `谁`）排除转述：
     `端口 8080 被谁占了` 是问句，`他问是谁负责发布` 不是。
  口径同时收紧：文档与测试里"问句永不用模板"改为"**已识别的问句形态**永不用模板"——规则没认出来的形态
  （例如纯陈述式的偏好表达）不在这条承诺之内，落 `直答档` 也不算违反契约。
- **Reason（为什么形态化）:** t57 的三个对抗探针——`端口 8080 被谁占了`、`logs 里 500 多不多`、
  `我该用 yarn 还是 pnpm`——对任何读者都是明显问句，却一个词典词都不含。逐词打补丁会一直输给这类句子
  （上一轮刚补了 `几`，这一轮又冒出三个），所以改成"识别问句的**构造**"：重复动词、二选一、疑问代词。
  这三条覆盖了汉语是非问句与选择问句的主要形态，且不依赖任何领域词。
- **Reason（为什么必须同时写边界）:** 形态规则天然会误伤陈述：`他还是走了`（副词"还是"）、
  `他还是没有提交`（副词 + 否定）、`他问是谁负责发布`（转述）。所以每条形态都配一条**排除规则**，
  并且把边界写成测试断言——否则"修好一个问题问句"会换回"把陈述句当问句"。
- **Evidence:** `test/triage.spec.ts`「recognises A不A / A没A, 还是 and 谁 as question shapes」：8 条问句
  全部 `fast`/`question`（含 t57 三条原句），4 条陈述句断言 `reason !== 'question'`，另加 `备份还是升级`
  （真二选一）仍为问句；`npm run ci` **22 文件 / 366 例**全绿。**这一轮只做规则级验证，没有跑真机矩阵**：
  改动全在分类器规则内，单测是权威证据，真机只会重复 Round 11 已经证明的"档位行照常出现"。
- **Consequences:** "问句"这条不变量从"永远成立"变成"**对已识别形态成立**"，并且是被排除规则钉住的可测边界。
  以后再遇到新形态（例如 `V 不 V` 之外的 `要不要/行不行`——已被同一规则覆盖），应先写形态再写排除，而不是加词。
- **Alternatives rejected:** 继续加词（`谁`/`还是`/`多不多` 各加一条，下一批探针照样漏）；不写排除规则
  （陈述句被当成问句反问一遍，比漏判更烦人）；用模型判断问句（每条消息一次调用，见 D-022）。

## D-028 — `/grok` 会话级开关：默认关、正交于 `enforceGate`/`mode`、用插件记录持久化（整值替换）

- **Status:** CONFIRMED（设计已定；phase 1 落地中：`src/mode.ts` 已测通，config/gate 接线在跑）
- **Date:** 2026-10-28
- **Decision:** 把"每条用户消息强制走工作流"从硬闸门改造成**会话级、运行时可用命令随时切**的 `/grok` 开关：
  1. `/grok` 开（= 该会话走完整工作流）、`/grok off` 关（= 不拦，回普通聊天）。
  2. **默认关**（`grokDefault: 'off'`）：装好是普通聊天，`/grok` 才开。
  3. 状态存成一条插件记录 `plugin:grok-workflow/mode`（`{v:1, enabled, turn, setBy}`），
     **整值替换**（后写覆盖先写），挺过 fork/resume/重启，读回走 `session.ownEvents()`。
  4. 与现有三层**正交**：`enforceGate`（全局拦不拦）／`/grok`（本会话开不开）／`mode: full|triage`
     （开了之后走全套还是前台分诊）。
  5. 落点：`classifyPreStep` 新增一条 `pass, reason:'mode-off'` 放行分支（复用现成放行通道，
     与 `subagent`/`out-of-scope`/`already-routed` 同路），只在"本会被认领"的批次上触发。
- **Reason:** 用户要"可控、能命令随时切、别每条都硬拦"，同时保留"不静默降级"（默认关→开后仍走完整流程）。
  plan-mode 式心智（命令 + 持久状态）比硬钩子更贴 DSH 原生、冲突更少。
- **Evidence:** `src/mode.ts` + `test/mode.spec.ts`（13 例：读写、整值替换、坏记录不覆盖、fallback、写失败 warn-and-continue），
  持久机制实测见 RESEARCH.md「plugin-record persistence」。config/gate 接线 + 全套回归由集成轮补证。
- **Consequences:** 失去"每条消息都强制验证"的**默认**保证（默认关，靠用时 `/grok` 开）；换来可控、少冲突、好懂。
  "状态跨重启/翻记录不丢"由插件记录天然提供，无需新机制。
- **Alternatives rejected:** 保留硬闸门（不可控、易与其它插件/团队消息/webhook 冲突）；改成工具呈现模式
  （native/ptc，语义错位，grok-workflow 本就跑在 PTC 运行时上）；状态只存内存（重启/翻记录就丢，违反"不静默降级"）。
- **Follow-up (2026-10-28):** config/gate 接线落地（`grokDefault:'off'` 默认 + `classifyPreStep`
  新增 `pass, reason:'mode-off'`，复用现成放行通道）；`npm run ci` **385 例 / 23 文件**全绿
  （+4 gate、+2 config）。`/grok` 命令模块随后补，之后停给用户验收。
- **Follow-up (2026-10-28, feature complete):** `/grok`、`/grok off` 命令落地（懒 `commands` 挂载，
  plan-mode 同款；无命令面的 headless/ACP 退回 `grokDefault`）。阶段 1 全齐：`mode.ts` 开关 +
  `grokDefault:'off'` 默认 + `mode-off` 放行 + `/grok` 命令。`npm run ci` **396 例 / 24 文件**全绿
  （mode 13 + command 11 + gate 4 + config 2，其余为既有测试 opt-in 调整），零回归、零削弱。

## D-029 — 自报状态是承认：只有 `completed` 的执行才可被验证通过；`/grok` 显式选择 `full`

- **Status:** CONFIRMED（t59 真模型 E2E 发现并修复；`npm run ci` 400 例）
- **Date:** 2026-10-29
- **Decision:**
  1. `checkVerification` 从"`execution.status === 'failed'` 才否决"改为"**必须 `completed` 才可通过**"。
     自报 `partial`/`failed` 是执行者的承认，任何 verifier 的 pass 都不能把它翻成 verified。
  2. planner 提示词禁止把目标改写成"尝试 X 并如实报告"/"预期失败"；验收标准必须是目标要求的**终态**。
     verifier 提示词：executor 说被阻塞/拒绝/未达成时，verdict 必须 fail。
  3. `ModeRecord` 增加可选 `workflowMode`；`/grok` 写入 `'full'`，闸门用它覆盖部署 `mode`。
     配置级 `grokDefault: 'on'` 仍尊重 `mode`（部署方选择分诊还是全流程）。
- **Reason:** T5（真模型）里 `/proc` 写入必然失败、worker 自报 BLOCKED，却因 planner 把目标软化 +
  `partial` 不被拦而报 `COMPLETED`。这与插件存在的理由（"不把'做完了'当完成"）直接冲突，
  属于最高优先级缺陷。`/grok` 文案承诺完整流程，但 `mode: triage` 会静默改走前台分诊，同样是"说假话"。
- **Evidence:** `test/orchestrator.spec.ts`（partial + 通过 verifier → failed）；`test/triage.spec.ts`
  （会话记录 → 无档位行）；`test/mode.spec.ts`（形状校验）；`test/command.spec.ts`（写入形状）。
  真机：T5 → `COMPLETED`（修前）/ `FAILED`（修后 T5b），T6 `PARTIAL`，见 VALIDATION Round 12。
- **Consequences:** 更严：执行者自报未完成的活不能再被"验收标准改写"洗白；代价是 worker 用词偏保守时
  会更多地落 `partial`/`failed`（这与"绝不静默降级"一致；重试一次仍可救回）。
- **Alternatives rejected:** 只拦 `failed`（`partial` 仍可洗白，T5 就是这个口子）；只在提示词里劝
  planner（模型会漂移，必须有机械兜底）；把 `/grok` 文案改软（用户要的是完整流程，不是改文案）。

## D-030 — 路由并发上限是溢出，不是降级：打满就让路，不算失败

- **Status:** CONFIRMED（`npm run ci` 全绿；`test/route-concurrency.spec.ts` 离线确定性回归）
- **Date:** 2026-11-03
- **Decision:**
  1. 每条路由可选 `maxInFlight`（1–64，留空=不限）：`HARD_LIMITS.routeInFlight`
     单一来源，`resolveChain` 校验整数范围，设置页第三框 + `error.badCap` 中英双语。
  2. 打满的路由是让路，不是失败：按链顺序溢出到下一条未试过的路由；全部打满才等腾位
     （`queuedMs` 累加），不推进备用链、不消耗重试、不触动 `switchOn`。
  3. 证据与失败分离：`skippedBusy` / `queuedMs` 进 trail（`Route overflows …` 单独渲染，
     不进 `Route switches:`），台账 `recordRouting` 同步透传并做截断/取整。
- **Reason:** 并发上限与失败是两回事：前者是"这条路正忙"，后者是"这条路不通"。混为一谈会把
  正常的负载分流读成故障切换，污染失败统计与重试预算。
- **Evidence:** `test/route-concurrency.spec.ts`（7 例：校验拒绝、溢出分流、`skippedBusy`、
  全满排队峰值=1、clamp 钉死 `HARD_LIMITS`、预算不变、渲染与台账透传）；
  `test/client.spec.ts`（bounds parity + `error.badCap` 双语）；`test/config.spec.ts`
  （script clamp 钉）。
- **Consequences:** 上限只收窄并发，不改变调用总数（`routeBudgetFor` 不变）；报告多一行
  `Route overflows …`，台账多两个可选字段（旧记录不受影响）。
- **Alternatives rejected:** 打满当失败推进备用链（把忙碌误报为故障，消耗重试）；
  打满直接报错（把可分流的负载变成失败）；排队等同一条（浪费空闲的下一条）。

## D-031 — 可恢复的合成配置不一致只告警不致停：配错也能起，设置页再改

- **Status:** CONFIRMED（lead 独立复核 `7c4a05e`：`npm run ci` 31 文件 / 540 测试 PASS，
  PR #35 待合；`resolveConfig` 硬规则未动，见 `test/config.spec.ts`/`routing.spec.ts` 钉）
- **Date:** 2026-11-03
- **Decision:** 只有两种 `synthesis` / `roles.synthesizer` 不一致是**可恢复**的，
  load（含每次 `readConfig`）时 warn + 按修后值生效，工具/门禁/设置面照常激活：
  (a) 链非空 + `deterministic` → 按 `model` 生效；(b) `synthesis: model` + 链空 →
  按 `deterministic` 生效。warn 文案含"已按…生效，请在设置页确认"，有效配置签名带
  `synthesis=<mode> (repaired)` 自证。其它（未知键/provider/模型、越界、畸形链、
  `switchOn`、budget）一律仍 hard fail（R-06 不动）；修后形状若还带第二缺陷，
  以第二缺陷为准抛错（修不掩错）。设置页对同样两种不一致红字拦 Save
  （`error.synthesisChainUnused`/`Missing`，中英双语）；合法组合才放行。
- **Reason:** 配错一行就整行 `did not activate`，连设置页都没了，等于"没地方改"的死锁
  （本轮 oper 现场：`synthesis` 缺省 `deterministic` + 配了 synthesizer 链）。
  这两形的用户意图是明确的（有链≈想要模型重写；要模型重写但链空≈先按规则跑），
  修完意图不变；其它错误意图不明，一修就是"看起来能跑实际路由是错的"。
- **Evidence:** `test/config-synthesis-fallback.spec.ts`（8 例：a/b 双向修复、
  一致不动、未知键/越界数/畸形链不动、可恢复形下藏第二缺陷仍抛、`apply()` 三例、
  `(repaired)` 标记）；`test/client.spec.ts` 跨字段拦 Save（含空行不算链）；
  `npm run ci` 31 文件 / 540 测试；`lib/` 同步。
- **Consequences:** `ResolvedConfig` 增可选 `synthesisRepaired?: boolean`
 （仅修后置位，`resolveConfig` 本身不置）；`ARCHITECTURE` 增"可恢复 vs 不可恢复"小节；
  `CHANGELOG [Unreleased]` 中英双语。
- **Alternatives rejected:** 全局 lenient 默认（吞掉拼错 provider 这类真错误）；
  只修 load 不修运行期 save（坏 save 仍杀下次启动）；只 host 修不加设置页联动
  （用户下次手写 YAML 还会撞同一面墙）。

## D-032 — 追问可接上文：有历史的跟进绝不进寒暄模板（v0.4.0）

- **Status:** CONFIRMED（`npm run ci` 32 文件 / 545 测试 PASS；新增 `test/triage-followup.spec.ts` 5 例）
- **Date:** 2026-11-06
- **Decision:** `TriageInput` 新增 `historyNonEmpty?` + `followupAsFast?`；`FOLLOW_UP`
  （说人话|人话|通俗|白话|接着说|继续|详细点|再讲|再说说|展开）有历史且开关开时判
  `fast/followup`；无历史时短惰性分支判 `ask/ambiguous-escalate`，永不进 `chat`。
  网关复用 in-turn 历史快照（relay 才重读），`triageFollowupAsFast: false` 可关。
- **Reason:** “说人话”被当寒暄是前台无历史分类的必然结果；补正则不如先给历史。
- **Evidence:** `test/triage-followup.spec.ts`（有历史→fast；无历史→非chat；其它短语全覆盖；`你好`仍chat）。
- **Alternatives rejected:** 全量模型分诊默认（每条多 1-3s + 成本 + 不可审计）；无限补 FOLLOW_UP 词表。

## D-033 — 混合分诊默认关、只兜不确定的（v0.4.0）

- **Status:** CONFIRMED（默认 `rules` 路径逐字节不变；hybrid 仅 ask/ambiguous 或 chat+有历史时多花一次 `runSingleCall`，失败回退）
- **Date:** 2026-11-06
- **Decision:** 新增 `triageClassifier: rules|hybrid`（默认 rules）+ `triageModel` 复用；
  hybrid prompt 只传历史前 2000 字 + 本条前 2000 字，要求 `{"tier":"chat|fast|team"}`，解析失败回退规则结果。
- **Consequences:** 设置页 enum 双语；27 字段投影断言更新。
- **Alternatives rejected:** 全量模型分诊（寒暄也变慢变贵）。

## D-034 — 团队档即时回执 + 确定性人话导读，零额外调用（v0.4.0）

- **Status:** CONFIRMED（`instantReceipt`/`humanSummary` 默认双开；`humanSummary` 为确定性 `verified/total` 拼接，不调模型）
- **Date:** 2026-11-06
- **Decision:** 团队档先 `appendInstantReceipt` 写档位行（失败只丢回执不丢运行）；
  报告头加 `【人话结论】任务 verified/total` + synthesis 首两行（400 字截断）。
  曾试过模型重写版，因多一次 engine 调用打爆 3 个 P0-2 单测 + triage 单测计数，已回退为确定性版。
- **Reason:** 白屏是因为 `in-turn` await 整轮 + 最终 `relayText` 被勒令逐字复述；回执解决“运行时空白”，导读解决“只剩机器语言”。
- **Alternatives rejected:** 模型重写人话总结（多调用、串改单测计数、预算不可控）；切 `relay` 全局（one-shot 会丢答案）。

## D-035 — 跨轮上下文：从 transcript 编译有界 digest，不新增存储、不新增配置键（v0.5 未发布）

- **Status:** CONFIRMED（`npm test` 33 文件 / 568 测试 PASS；真机两轮见 VALIDATION.md Round 21）
- **Date:** 2026-11-06
- **Decision:** ①轮次信息只从会话里**插件自己写的报告**（`source.kind='grok-workflow'`）编译，
  不读模型复述，不新增记录类型/归档文件（归档是独立任务）；②预算复用既有
  `historyTurns`/`historyChars`，硬上限 `CARRYOVER_LIMITS = { rounds: 24, chars: 12000 }`，
  超限保留最新一轮并写明丢弃轮数；③注入点为 `args.carryover` → 四个角色提示词，
  首轮不带该键（payload 与此前逐字节一致）；④无前序信息时完全静默，不占位、不编造。
- **Reason:** 用户可见失败是"我这轮是单次进来的，看不到刚才上面的研究结果"——子代理确实看不到，
  所以修的是"让它看到"，而不是"让它别这么说"。改 records/归档会撞独立任务的写路径。
- **Consequences:** 新增 `src/carryover.ts`；`src/script.ts`、`src/run.ts`、`src/gate.ts`
  （仅 `runTeam` 注入，提问判定逻辑零改动）、`src/index.ts`（工具路径同样注入）各加薄薄一层。
- **Alternatives rejected:** 新增持久 digest 记录（跨轮存储在 records/归档，属独立任务，且会多一份
  可能与报告不一致的副本）；把整段上一轮报告塞进 objective（无界、且会把历史与指令混在一起）；
  让子代理自己回读会话文件（`session.v4.jsonl.zstd` 是 zstd 二进制，子代理没有会话读取工具）。
- **已知副作用（不在本次范围）：** 会话首条消息被 `in-turn` 在 `pre-step` 抢先写成
  `user/message` 时，`--session-id` 恢复会因"system/message 必须是首个 surface head"失败
  （VALIDATION.md Round 21 的 F1，`CONFIRMED` 且仍开放）。

## D-036 — 存档不设开关、不分档：写入随轮次发生，读回不依赖插件（v0.5 未发布）

- **Status:** CONFIRMED（`npm test` 34 文件 / 589 测试 PASS；真机见 VALIDATION.md Round 22）
- **Date:** 2026-11-06
- **Decision:** ①归档**不是配置项**，也不受 `showProgress` 控制——进度面板是展示，记忆是事实，
  展示关掉不该等于历史消失；②前台档（`runSingleCall` 快手档）同样写轮次条目：快手档的回答
  就是一轮真实结果，跳过它等于把用户最常走的那条路重新变成「查了记忆，最近也没有存档」；
  ③位置 `$DSH_HOME/memory/grok-workflow/archive.jsonl`，`GROK_WORKFLOW_MEMORY_DIR` 可改，
  idempotent（`run:<runId>` / `run:<runId>:agent:<seq>`）+ 只追加；④读回走随包 CLI
  （`node lib/memory/cli.js recent`），**不需要** DSH 与插件在线，任何单次会话都能用。
- **Reason:** 用户可见失败是「查了记忆，最近也没有存档」——根因是存档动作挂在会话收尾的人工步骤上。
  把写入挂到轮次结算、把读取做成零依赖 CLI，这个失败形态才真正消失。
- **Consequences:** 新增 `src/memory/{archive,recorder,cli}.ts`；`src/run.ts` 两处接线
  （引擎事件订阅与轮次结算；`runSingleCall` 成功路径一处）。跨轮 digest（D-035）保持不变，
  归档不替代它：digest 服务同一会话的下一轮，归档服务「单次进来」的新会话。
- **Alternatives rejected:** 复用 `src/records.ts` 的记录类型（那是会话内 transcript 记录，
  新会话不加载插件就读不到）；挂在 `dispose`/会话退出钩子（用户明确点名的失败模式）；
  做成 `memory: on/off` 开关（记忆缺口不是偏好问题）；把条目写进 `STATE.md`（人读文件，
  并发写会互相覆盖，且无法机器检索）。

## D-037 — 提问前先回捞：ask 档先读会话上文与磁盘记忆，命中即作答（v0.5 未发布）

- **Status:** CONFIRMED（`npm run ci` 35 文件 / 617 测试 PASS；`test/triage-recall.spec.ts` 28 例；
  证据 `docs/knowledge/evidence/history-first/`；真机在线回放 `NOT_RUN`）
- **Date:** 2026-11-06
- **Decision:** ①`ask` 档（前台准备向用户要澄清）之前，先由 gate 读**既有**材料：会话上文（6 轮 /
  3000 字符）、插件自己写的前序轮次 digest（4 轮 / 4000 字符，只读复用 D-035 的编译结果）、磁盘
  `docs/knowledge/*.md`（12 文件 / 每个 2400 / 合计 16000 字符，`GROK_WORKFLOW_KNOWLEDGE_DIRS` 可改）；
  ②判定在 `src/triage.ts` 内保持纯函数（`recallFromPrior(text, sources)`）：**≥2 个去停用词锚点**，
  或**指针式引用**（刚才/上面那/the above…）**且**有 ≥120 字符的实质材料才命中；命中返回
  `tier:'fast', reason:'recalled'`，未命中返回与改动前**逐字节相同**的 `ask`；
  ③`ask:false`（不问就升级团队）时命中同样走快手档——材料已在手，一个工人就能答，没必要开团队；
  ④未命中且**本例会话里已经说过话**时，提问下方追加一行「先查后问：查了 N 处，还缺 X」，只要一项；还没说过话的新会话不追加——那句原样提问本身就是最诚实的形式，因此逐字节不变；
  ⑤只读、有界、脱敏、**不新增配置键、不新增记录类型、不新增归档**。
- **Reason:** 用户可见失败是 `session-7e079b80` 型：研究结果就在会话里，追问却被要求重述。根因不是
  "记忆不存在"，而是**提问前没查**。把"查"插在提问这一步之前，既修掉失败形态，又不改任何其他档位。
- **Consequences:** `src/triage.ts`（召回判定/说明/提示词）、`src/gate.ts`（磁盘读取 + 接线 +
  `GateDeps.memoryDocRoots`）。`src/config.ts`、`records.ts`、`carryover.ts` 未改。
- **Alternatives rejected:** 让模型自己判断"要不要再问"（不确定、每次多一次调用、单测无法钉）；
  把整段会话硬塞进 ask 判定（无界，且必然自命中）；用向量/语义检索（本轮约束是确定性单测，且会引入
  依赖与在线能力）；改 `expiredAskNote`/`unusedAskNote`（那是 P0-2 的档位选择语义，与"知识是否存在"
  无关，改它会削弱既有断言）。
- **已知缺陷（本轮发现并已修，`CONFIRMED`）：** 首版把本轮消息当历史（`relay` 先 `commitClaimed()`
  再 `produceAnswer()`），任何追问都会命中自己；`collectRecallSources(…, exclude=request)` 剔除后修复，
  `test/triage-recall.spec.ts` 的 `before the fix` 用例守着。

## D-038 — 路由 Cap 空陷阱提示 + 单 run 作用域 + 跨 run hint（C1），C2 精确锁证伪

- **Status:** CONFIRMED（`npm run ci` 35 文件 / 624 测试 PASS；
  `test/route-concurrency.spec.ts` 13 例、`test/client.spec.ts` 34 例；见 VALIDATION.md Round 25）
- **Date:** 2026-11-07
- **Decision:** ①B组：设置页 `warn.emptyCap`（≥2 路由全空 Cap 黄字提醒、**不拦 Save**）+
  `validateRoutes` notes（`src/settings.ts` load-time note，非 error）+ ARCHITECTURE 写明单 run 作用域
  （只有填了上限的路由才会在单次 run 内打满时让路，计数跨 run 不共享）；②C1：run 准入快照
  `busyRoutes`（run 级估计，来源 `ActiveState` 的 run 级占用、经 `routeBudgetFor` 估算，非精确子调用级）
  重排**未试**顺序（已试/失败语义 `switchOn`/重试不动）、无 hint 时逐字节不变；`skippedBusy`
  复用 `'(cross-run hint)'` 标记（`src/script.ts:400-421`），报告分开渲染
  （`Route overflows (cross-run hint)`，`src/records.ts`/`src/report.ts` 透传）；③C2 不做——
  精确全局信号量不可行（A16：`ctx.workflowEngine.start` 不接受 host 回调注入、`bindings()` 写死 6 键、
  脚本全局表只注入 `agent/parallel/pipeline/phase/log/args`，沙箱封闭）。
- **Reason:** 用户可见失败是"配了多条路由却永远只走第一条"——根因是全空 Cap = 不限 = 永不让路，
  且计数只活在单次 run 内。B组把空陷阱摆到台面上（提醒不拦），C1 用廉价 run 级 hint 做近似分流，
  精确锁（C2）经 spike 证伪后不再追。
- **Consequences:** `src/settings.ts`（`validateRoutes` notes）、`src/client/index.js`
  （`warn.emptyCap` 中英 + `emptyCapWarn` + 黄字横幅）、`docs/ARCHITECTURE.md`（单 run 作用域）、
  `src/script.ts`（`busyRoutes` 快照 + 重排 + `(cross-run hint)` 标记）、`src/run.ts`
  （run 级路由标签快照）、`src/report.ts`/`src/records.ts`（分开渲染 + 透传）。
- **Alternatives rejected:** C2 精确全局信号量（spike 按 A16 证伪：须改 harness + 脚本注入面，
  本次不做）；打满当失败（拒：溢出不是失败，不耗重试、不动 `switchOn`，D-030 既定语义）；
  排队等同一条（拒：有空闲路由时等是浪费，全满才排队等腾位 `queuedMs`）。

## D-039 — 子代理顶栏显示名不改 DSH core：判定为 BLOCKED，只记证据与上游改动清单

- **Status:** BLOCKED（历史判定，2026-11-08 已被 D-041 推翻并落地；原判定依据：源码级 `CONFIRMED`，见 VALIDATION.md Round 27 的 8 处行号，当时结论"插件侧无文档化扩展点"）
- **Date:** 2026-11-07
- **Decision:** 用户要求"顶栏每个子代理显示具体任务名，不出现 `任务团队 child N` 或提示词原文"。
  经逐行取证，主标签由 DSH core 在创建子代理时写死
  （`packages/workflow/workflow-ptc/src/host.ts:205` 的 `` `${this.meta.name} child ${callId}` ``），
  并作为子会话首个 `subagent/descriptor` 事件持久化、被 `foldSubagentDescriptor` 锁成**不可改写**
  （`dsh-subagent/lib/index.js:686-698`）；GUI 顶栏主标签直接取它（`dsh-client-ui-subagent/lib/client.js:201`）。
  **本轮不做任何绕行改动**：不改 DSH core，也不做未文档化的描述符/日志改写，只把证据与上游改动清单落到记忆里。
- **Reason:** 插件已经做对了它这一层——每次 `agent()` 都传 `label`（`src/script.ts:1188/1213/1324/1438`），
  DSH 自己的工具文档也把 `label` 写成 "(display)"（`dsh-tool-workflow/lib/index.js:143`），
  丢标签发生在引擎内部（`runtime.ts:183-188` 不转发、`host.ts:205` 写死）。
  在这种情况下，插件侧任何"修复"都只能是绕过契约的脏补，风险大于收益，且违反 AGENTS.md 的
  "never modify the DSH core repository … use documented extension points only"。
- **Consequences:** 无源码改动；`CHANGELOG.md` 不加条目（没有用户可见变更可记）。
  记录：`VALIDATION.md` Round 27、本节、`STATE.md`、`HANDOFF.md`。
- **Alternatives rejected:** 见 VALIDATION.md Round 27 的「已否决的绕行方案」表（追加描述符、自定义
  SubagentProvider、改 `meta.name`、插件自建 `startActivation`、改 core）。
- **可选的半程缓解（未实施，待用户批准）：** 顶栏**次级行**是子会话自动标题，来源是提示词首行
  （`You are the planning agent…`）。插件可在 `workflow/agent-start`（事件里带 `childId`）后调用文档化服务
  `ctx.sessionTitle.rename(session, <任务名>)`（`@deepseek-ai/dsh-session-title` 的 `SessionTitleService.rename`）
  把次级行改成任务名。**但这只去掉提示词原文，`任务团队 child N` 主标签仍在**，因此不满足本任务验收条款 1，
  本轮不做；若用户接受"主标签保留、次级行变任务名"，可作为独立小任务实施。
- **Upstream ask（NOT_RUN）：** `runtime.ts` 把 `opts.label` 放进 `startAgent`；`host.ts` 的 `childRequest()`
  接收 `label` 且 `startChild()` 用 `label: request.label ?? \`${meta.name} child ${callId}\``。约 3 行，改完插件零改动即生效。
- **Addendum（2026-11-07 晚，第二次尝试，Round 28）：** 状态维持 **BLOCKED**。Round 27 的判定由第二次尝试
  **独立重验**（源码链逐条重读）并用**隔离 profile 真机复现**坐实：复用 `out/v060-verify/*.patch.yml`，
  在 `out/childname-verify/`（profile `cnamer`）跑一轮团队档（COMPLETED，2 任务 verified，6 子代理），
  6 个子会话首个 `subagent/descriptor` 全部为 `"label":"任务团队 child N"`（N=1..6），而父会话
  `tool-workflow/agent-start` 证明插件标签（`规划助手`/`执行`/`检查`）确实随每次 `agent()` 传入——
  与用户截图逐字一致，且 live `:3090`、operator `DSH_HOME`、DSH core 均未触碰。
  证据：`docs/knowledge/evidence/childname-blocked/`（README + `child-descriptor-events.txt` +
  `parent-agent-start-excerpts.txt` + `parent-run-start-excerpt.txt`）；命令与边界见 `VALIDATION.md` Round 28。
  半程缓解与上游 ask 维持原判：前者仍待用户批准（改次级行，不满足验收条款 1），后者仍 `NOT_RUN`（约束禁止改 core）。
- **Addendum 2（2026-11-08，第三次执行，Round 29）：** 状态维持 **BLOCKED**。Round 27「Alternatives rejected」里
  仅以理由否决的**自定义 `SubagentProvider`** 与**插件自建 `startActivation`** 两条，本轮补上**类型级证据**关闭：
  ①`WorkflowStartRequest` 全接口（`dsh-workflow/lib/types/runtime-types.d.ts:15-28`）无 label 字段；
  ②每 run `subagentProvider` 覆盖与 `ctx.subagents.registerProvider()`（`dsh-subagent/lib/types/index.d.ts:288`）
  虽为真实文档化 API，但 continuable 子代理的 provider 参与**只有**
  `prepareContinuable → ContinuableCreateSpec { seed? }`（`dsh-subagent/lib/types/types.d.ts:187-213`，单字段无
  label），descriptor 由 `startLocal` 从 `spec.label` 快照、而 `startActivation` 契约明说 label 归调用方
  （types.d.ts:122-124）——调用方即写死的 workflow host；③无 `prepareContinuable` 的 provider 会把子代理
  降级为 external 一次性 run（`SubagentRunInfo` 无 label、无会话目录条目，GUI 渲染裸子会话 id），摧毁
  continuable 任务团队模型；④引擎 Config 无 label 模板，全 core checkout 仅 `PtcWorkflowEngine` 一个
  `WorkflowEngine` 实现；⑤`ctx.subagents` 服务面不暴露 `startActivation`（在 `SubagentRuntime` 类上，
  index.d.ts:135,145），host 侧直调将绕过引擎 `agent()` 钩子，违反架构不变量。另核：core 检出 HEAD
  `687f282e` 与 installed 同为 `0.2.1-rc.2`，`host.ts:205`/`runtime.ts:183-188` 逐字一致——上游 ask 仍必要。
  完整定位：`docs/knowledge/evidence/childname-blocked/extension-points-closure.md`；命令与边界见
  `VALIDATION.md` Round 29。

## D-040 — 已完成子任务保持可点击：客户端重注册键控 `workflow-run` 节点 + `priority: -1` 遮蔽

- **Status:** CONFIRMED（真机 PASS，Round 30；单测钉死）
- **Date:** 2026-11-08
- **Decision:** 用户报告聊天任务列表里运行中的子任务行是链接、已完成行（`规划助手已完成` 等）
  是死文字。修复选择**插件客户端重注册**：经 `conversation.chat.node` 键控槽位（契约原文
  "reusing a key replaces that node renderer"）以 `key: 'workflow-run'`、`priority: -1` 注册
  自绘渲染器；行可开性 = 子会话存在 + `parentId` 匹配本 run + `subagent.mode` 为
  `continuable`/`one-shot`，**不读成员状态**（运行中/已完成/失败/取消/中断一视同仁）。
- **Reason:** ①库存渲染器把链接钉在 `member.status === 'running'`（可开性其实与状态无关，
  子会话与投影在结束后依然在）；②渲染器层是唯一同时满足"不改 DSH core"与"恢复链接"的
  文档化扩展点（`dsh-client-ui-workflow-run` 无任何配置可放宽该条件）。
- **优先级遮蔽（本轮实测学到的硬约束）**：键控槽位同键同优先级会让**另一个注册者**整条
  boot fiber 失败（首轮实测：库存 `dsh-client-ui-workflow-run` 报 "1 entry did not activate"，
  整页错误屏；A/B 对照锁定冲突源）。静态客户端路径没有自动优先级分配，必须显式
  `priority: -1`（低于库存默认 0，lowest renders）；库存条目保持 live 被遮蔽，插件卸载即恢复。
  详见 RESEARCH.md A17。
- **Consequences:** 插件此后负责所有 `workflow-run` 节点的外观（含非本插件工作流的 run；
  投影与文案与库存一致，差异只在可开性判据与简化版 disclosure）；`uiWorkspace` 缺席的
  组合不注册面板、库存渲染器继续工作（设置页不受影响）；单测
  `test/panel-links.spec.ts`（14 例）+ `test/client.spec.ts` 断言钉死注册形态。
- **Alternatives rejected:** ①改 DSH core 放宽 `navigableMembers` 条件——明令禁止；
  ②只改插件让 `tool-workflow/*` 事件带额外数据——渲染器根本不读它，无扩展点；
  ③注册不设 priority 靠加载顺序——实测会让库存客户端 boot 失败，不可接受。

## D-041 — 任务团队子代理显示名：插件侧 twin 引擎在 `startActivation` 写入描述性 label（fix_child_names 第四次执行）

- **Status:** CONFIRMED（真机 PASS，Round 31；12 例单测钉死；`npm run ci` 37 文件 / 650 测试 PASS）
- **Date:** 2026-11-08
- **Decision:** 顶栏主名改为描述性任务名，落点有三处，全部在本仓库：
  ①`src/team-engine.ts`——用注入引擎**自己的构造函数**建私有 twin（static-inject 判别 +
  WeakMap 按 ctx 缓存），twin 的 subagents 视图在 `startActivation` 处把 `spec.label` 重写为
  提示词首行（`childLabelFromPrompt`，48 码点截断），`reflect.provide` 置空保持私有，
  非 PTC 引擎原样返回并 warn；②`src/script.ts` + `src/triage.ts` + `src/gate.ts`——
  每个子代理提示词的首行改为描述性标题（规划助手/任务标题/检查 · 任务标题/快速应答/前台直答等），
  人设行保持第二行；③`src/run.ts` 两处 `ctx.workflowEngine.start` 改走 `teamWorkflowEngine(ctx, logger)`。
- **Reason:** D-039 的三次执行把"逐调用扩展点"逐个排除了，但漏掉一个服务级扩展点：
  插件本来就持有 `ctx.workflowEngine`（自己的 inject），而 `PtcWorkflowEngine.start()`
  在 start 时才读 `runCtx.subagents`（`workflow-ptc/src/index.ts:157`）——把 run 起在
  "同一引擎 + 装饰过的 subagents"上，`startActivation` 的调用方就变成了插件，
  label 归调用方的契约（types.d.ts:122-124）站在插件这边。不改 core、不改引擎、
  不碰共享服务实例；上游 3 行 ask（D-039）从"必要"降级为"可选的简化"。
- **Consequences:** 子代理描述符（GUI 主名）= 提示词首行；twin 构造失败/非 PTC 引擎时
  原样回退并 `logger.warn` 一次性（可观测的静默降级）；cordis 解析的硬事实沉淀为 A18。
  真机证据：`docs/knowledge/evidence/childname-fix-2026-11-08/`（终版 6/6 描述性、
  0 个 `任务团队 child N`；前缀对照 3/3 旧标签）。
- **Alternatives rejected:** ①代理 cordis ctx（插件 ctx 或引擎 ctx）——两次真机失败：
  receiver 键控的 fiber walk 被破坏 + 属性访问受 isolate guard（A18）；
  ②从引擎 ctx 属性读服务——同一 isolate guard 失败，最终用 `ctx.get(name)` 显式解析；
  ③自定义 SubagentProvider / 直接调 `startActivation`——D-039 Addendum 2 的类型级证据仍成立；
  ④改 `meta.name` 模板——仍是 `<name> child N` 模式，不满足验收条款 1；
  ⑤`sessionTitle.rename` 半程缓解（D-039）——只改次级行，主名不变，不再需要；
  ⑥改 DSH core——明令禁止。
- **边界：** live `:3090` 未触碰（D-013，仍跑 0.2.7）；DSH core 检出全程 clean（`687f282e`）；
  GUI 渲染判定由 `client.js:201` 源码链 + 描述符事件钉死，浏览器点开验证 NOT_RUN。
- **Addendum（Round 32，2026-11-08）：GUI 浏览器验证 PASS（`CONFIRMED`）。** 在隔离 Web 实例
  （`127.0.0.1:3199`，web 模板 profile + headless Chromium）上由 GUI composer 驱动团队档跑完
  （6 子代理，含真实 agnes format-error 路由切换重试）：顶栏 `Session hierarchy` 面板 6 个子代理
  主标签全部为描述性任务名（`规划助手`/任务标题/`检查 · 任务标题`），**0 处 `任务团队 child N`**；
  持久 `subagent/descriptor` 与面板逐字一致。详见 VALIDATION.md Round 32 与
  `evidence/childname-fix-2026-11-08/gui/`。live `:3090` 只读核实为 **released 0.6.0**
  （2026-11-07 21:54 安装，`lib/team-engine.js` 不存在 → 不含本修复；更正上行的旧记 0.2.7），
  部署修复构建待用户授权（D-013 步骤 5）。

## D-042 — `full` 模式补人话头；机器台账改为按需显示（用户选择方案 B，2026-11-08）

- **Status:** CONFIRMED（`61c3ac9`）
- **Date:** 2026-11-08
- **Decision:** 三项：
  1. `src/gate.ts` 的 `runTeam` 在 `completed`/`partial` 时拼与 triage 同款的
     `【人话结论】任务 N/M 项已核验通过。…` 头；`failed` 不拼。
  2. `src/answer.ts` 的 `SUCCESS_PREAMBLE` 允许「先 ≤3 句人话，再原样贴 markers 内全文」，
     不再一律禁止评论；`FAILURE_PREAMBLE`（如实失败、不得谎报成功）不变。
  3. 新增配置 `showDiagnostics`（默认 `false`），只控制 `Model routes` / `Deadline` /
     `Route switches` / `Route overflows` / `Errors`。**`Uncertainties` 不进这个开关。**
- **Reason（用户现象）:** `session-00fca25f…` 是 `COMPLETED`，但用户看到的只有台账并评价「不像人话」。
  源码层面 `full` 在 `produceAnswer` 里直接 `return runTeam(...)`，绕开了 triage 分支里唯一拼
  `humanSummary` 的那段；再叠加 `SUCCESS_PREAMBLE` 的「不许总结」，主模型连润色都不被允许。
- **Reason（为何 Uncertainties 不藏）:** 两条独立理由：①它是给读者的诚实限定语（"这项只在一台机器测过"），
  不是路由台账；②`src/carryover.ts` 的 `parseReportRound` 从上一轮**渲染文本**里解析
  `Uncertainties:`，藏掉会让每一轮追问都静默丢失该上下文。`test/carryover.spec.ts` 的既有用例
  在误藏时会 FAIL（`expected '' to contain 'only measured on one host'`），构成回归保护。
- **Reason（为何默认关而不是默认开）:** 用户的原话是这些行「不像人话」；默认开的台账等于把问题留在默认路径上。
  需要排障的人打开开关即可，报告的结构化 JSON 始终完整（渲染只是视图）。
- **Alternatives rejected:** 只改文档教用户「别开团队」（用户明确否决：他是专门拿小活做测试）；
  把台账整段删除（排障能力归零，且 t47 的契约「报告自证路由与时限」会被破坏）；
  让主模型自由改写报告（会失去「已验证内容逐字交付」这一 fail-closed 保证）。
- **Consequences:** 新增 1 个配置键（总数 27→28 volatile）；`renderReport` 多一个可选参数，
  既有调用点默认隐藏台账，老测试需显式索取 `{ showDiagnostics: true }`。

## D-043 — `engines.dsh` 用真 semver 区间替代手写兼容表；`0.3.0-rc.*` 的放行被接受并记录（2026-11-15）

- **Status:** CONFIRMED（`package.json:39`，证据 `docs/knowledge/evidence/verify-H1/engines-dsh-B01.txt`）
- **Date:** 2026-11-15
- **Decision:** 两项：
  1. `engines.dsh` 从固定字符串 `0.2.1-rc.2` 改成区间 `>=0.2.1-rc.2 <0.3.0`，并**删除**旧的手写
     `dsh.compatibility`（`{dsh:"…", profiles:[…], dshReleases:{…}}`）整块 —— 兼容性只有一个来源。
  2. 上界 `0.3.0` 保持现状，**不为 `0.3.0-rc.*` 加 `includePrerelease` 排除逻辑**；该行为写进
     STATE/RESEARCH，等真的需要支持或阻断 0.3 线时再一起改。
- **Reason（为何要 B01）:** 旧声明是一个等式字符串，只有那一个版本被判兼容，而真机运行的是
  `0.2.2-rc.3`；同时手写兼容表与 `engines` 是两份可能互相矛盾的声明。区间化让「哪个运行时可以装」
  由 semver 一处回答。
- **Reason（为何不改上界）:** DSH 的判定是
  `semver.satisfies(runtime, range, { includePrerelease: true })`（`dsh-app-boot/lib/index.js`），
  实测 `0.3.0-rc.1` 判 compatible。这是上游的区间语义，不是本插件漏判；为了排除 rc 去写负向
  前瞻正则（`<0.3.0-0`）会把「区间」变成「技巧」，且真到 0.3 线时仍要重新决策。**记录边界比假装
  边界不存在更诚实。**
- **Alternatives rejected:** 保留 `dsh.compatibility` 与新 `engines` 并存（两份真源，必然漂移）；
  直接把上界写成 `<0.3.0-0`（提前替上游决定 rc 语义，且未经验证）；把上界放到 `<0.2.3`
  （会把使用者锁死在补丁版本，与「插件只依赖文档化扩展点」的定位冲突）。
- **Consequences:** 安装判定对 `0.2.1-rc.2`…`<0.3.0` 全区间为 `null`（无未满足要求），
  对照 `engines.dsh:"<0.2.0"` 仍 REFUSED（证明检查非空转）。README 徽章随之从 `DSH 0.2.1-rc.2`
  改为 `DSH 0.2.x`。**没有**版本豁免（exemption）参与任何一步。

## D-044 — 并发/重试回到文档契约（3/6、1/3），`maxAttemptsPerTask` 取「最坏合法值」400（2026-11-15）

- **Status:** CONFIRMED（`src/config.ts:22,35`、`test/routing.spec.ts:73`、`test/route-concurrency.spec.ts:102`）
- **Date:** 2026-11-15
- **Decision:** 三项一起改，任何一项单独改都是错的：
  1. `HARD_LIMITS.maxConcurrency: 1_000_000 → 6`，`maxRetries: 10 → 3`，默认值 `4/2 → 3/1`，
     并新增 `DEFAULT_MAX_CONCURRENCY` / `DEFAULT_MAX_RETRIES` 单一声明（schema 默认值、
     checkpoint recorder、配置解析都读它）。
  2. `HARD_LIMITS.maxAttemptsPerTask: 1100 → 400`，取值 = 最坏合法组合
     `(chainLength 50 + 50) × (maxRetries 3 + 1)`；守卫仍是 `>`，所以等式成立时**能通过**。
  3. checkpoint 侧的 `ENGINE_HOOK_LIMITS` 从这两个常量派生，`buildCheckpoint` 拒绝越界行；
     run 路径对「绕过 schema 直接给 recorder 更宽值」只 warn 一次且可见。
- **Reason（为何是 B07）:** 代码里 `maxConcurrency` 的硬上限是 `1_000_000`、`maxRetries` 是 `10`，
  与 AGENTS.md 的「默认 3 / 硬上限 6，默认 1 / 硬上限 3」直接冲突；后果是 checkpoint 对**默认配置
  的一次运行**都会记录成「超出引擎契约」，`limitContractViolations` 天天报假警。
  上限不是防呆，是配额：每个单位都是一次真实 provider 调用。
- **Reason（为何 400 而不是继续留 1100）:** `1100` 只是「足够大」，它不表达任何契约；一旦有人把
  链长上限提到 500，1100 仍会静默放行。400 = 最坏合法值，让**上限与合法空间对齐**，只有「放宽某处
  却忘了 revisit」才会撞到。等式由 `test/routing.spec.ts` 用常量表达式钉死，改任一侧都会红。
- **Alternatives rejected:** 只改默认值不改硬上限（`1_000_000` 仍可被 profile 写进配置）；
  把 `maxAttemptsPerTask` 留在 1100 并加注释（注释不参与判定）；把守卫改成 `>=`（等于最坏合法值时
  会误拒合法配置）。
- **Consequences:** 默认运行的 checkpoint 不再记录越界；旧文件仍能读（读侧保持宽松，靠
  `limitContractViolations` 报告越界，不迁移、不改写历史）。ARCHITECTURE §Limits 的「standing
  divergence」段落已改为「配置已对齐，读侧仍宽松」的原因说明。设置页两个数值范围同步为
  `maxConcurrency` 1–6、`maxRetries` 0–3，默认 3 / 1，表单不再能提供 Host 会拒绝的值。

## D-045 — 进度 Tab 是第三个 Tab，轨道由 `tool-workflow/*` 事件折叠；`blocked`/`failed` 只由单测覆盖（2026-11-15）

- **Status:** CONFIRMED（`src/progress-tab.ts`、`src/client/index.js`、`evidence/progress-tab-2026-11-15/`）
- **Date:** 2026-11-15
- **Decision:** 四项：
  1. Tab 集合 `Chat / Trajectory / Progress`，默认落 `Chat`；进度 Tab **不默认选中**、不加设置项、
     不改既有 Tab 的注册。
  2. 轨道**只从插件自己记录的四个 `tool-workflow/*` 事件折叠**，未命中的模板阶段保持 `pending`
     并给 `title="Not reported in the events"`，不借邻居状态、不推断百分比分子的计划数。
  3. 详情三段（头部 / Engine facts / Stage report）保留三级来源阶梯；本 recorder 不写
     `stage-detail`，视图也拿不到子会话正文，所以**真实落点是 L3**（7 字段全 `—` +
     `Source: not reported`），阶梯已实现并有单测，将来接入无需改 UI。
  4. `blocked`/`failed` 两态**不构造真机**：`blocked` 由「运行结束仍留下未结算行」派生、
     `failed` 优先于一切；两者由 `test/progress-tab.spec.ts` + `test/client.spec.ts`（93 例）覆盖，
     报告里与真机截图分开列。
- **Reason:** 进度必须是**可核对的观测**，不是「看起来像在跑」。折叠模型的代价是「引擎没报的行
  永远 pending」，收益是任何一帧都能回溯到具体事件；把未触发状态伪装成真机截图会让后续读者
  无法分辨「测过」与「没测过」。
- **Alternatives rejected:** 按任务计划数算百分比（计划与事件不同源，会出现 >100% 或空跑 100%）；
  为 `blocked`/`failed` 造一个假子调用（伪造证据）；把详情字段猜一个来源（`Source:` 徽标失去意义）。
- **Consequences:** 真机 14 帧覆盖 `pending/doing/done/cancelled`（含「跑到一半点停止」→
  `cancelled` 用引擎原话）；`blocked`/`failed` 的覆盖只有单测。设计文档 §12.5 的「真机截图
  `NOT_RUN`」已由收尾节回填为「H2 组已做」，其余限制不变。

## D-046 — `/grok` 开关的真机验收一律用打包产物安装；`link:` 形态只作诊断（2026-11-15）

- **Status:** 现象 CONFIRMED / 归因 HYPOTHESIS（`evidence/progress-tab-2026-11-15/README.md` §2）
- **Date:** 2026-11-15
- **Decision:** 真机验证 `/grok on|off` 时，插件用 `dsh plugin add file:<repo>/…tgz`（打包产物）
  安装，**不用** `dsh plugin add link:<repo>`；`link:` 下出现的
  `Grok workflow toggle not changed: Receiver must be an instance of class Session.` 记录为
  安装形态限制，不作为产品缺陷。
- **Reason（现象 `CONFIRMED`）:** 同一台机、同一个 profile、同一条命令，`link:` 安装报上述失败，
  打包安装成功（`Grok workflow ON — …`，`GROK_ON=true`）。差别只在安装形态。
- **Reason（归因 `HYPOTHESIS`）:** 未插桩验证模块身份。最可能：`link:` 时插件解析到工作树自己的
  `node_modules/@deepseek-ai/dsh-session` 0.2.1-rc.2（devDependencies），而运行时是 0.2.2-rc.3；
  `appendPluginRecord` 落在旧副本的私有方法上，跨副本 brand check 抛错。打包 profile 里只有
  `cosmokit`/`schemastery`，没有第二份。
- **Alternatives rejected:** 把 `dsh-session` 从 devDependencies 去掉（会破坏本仓库的类型与测试）；
  在插件里 duck-type 绕过 brand check（等于绕开上游不变量，且真因未证）。
- **Consequences:** 验证流程多一步 `npm pack`；`link:` 仍可用于「看加载是否 pending」这类诊断，
  但任何「开关是否生效」的结论必须在打包安装下取得。若将来要支持 `link:` 真机验证，先做
  模块身份插桩（`require.resolve` 两份路径 + `instanceof` 实测），再改这条决定。

## D-047 — 数值硬上限只用一张钳制表；钳制告警每次载入一条（2026-11-15）

- **Status:** CONFIRMED（源码 + 单测；`test/config-limits-repair.spec.ts` 的 `LIMIT_CAPS` 与 `B04` 两组）
- **Date:** 2026-11-15
- **Decision:** ① `src/config.ts` 的 `LIMIT_CAPS` 是**唯一**的"哪些数值键按硬上限钳制、界是多少"的
  声明，值一律读 `HARD_LIMITS`；schema 侧 `clampedLimit(field, min)` 与载入期
  `repairLimitOverruns()` 都从这张表取界，新增上限只加一行。② 两层钳制都**只记账**
  （`recordOverrun()`），唯一发声点是 `src/index.ts` 的 `announceOverruns()`，按 `field:stored`
  用 set 去重后 `logger.warn`。③ 设置页横幅读 `entry.user`（用户层），不读 `entry.value`（生效值）。
- **Reason:** 旧实现把 `maxConcurrency`/`maxRetries` 的界写了两处（schema 与 repair），第二个界
  永远落后一步；而报错路径那条读**每条消息**走一次，原来的逐条 `logger.warn` 会在补丁仍超限时
  每消息刷一行，用户看到的是刷屏而不是"一次修复"。横幅读生效值则更糟：用户存 `8`、生效 `6`，
  横幅若显示 `6` 等于替用户改口，用户无法知道自己的补丁被改了。
- **Alternatives rejected:** 把界放进每个 schema 字段字面量（两处界会再次漂移）；在 repair 里直接
  `logger.warn`（那条读可能因别的缺陷抛错，且没有去重锚点）；把 `configVersion` 也纳入钳制
  （它是线上契约，不匹配必须拒载，改写会造出"版本对得上"的假象）；把每路由 `maxInFlight` 纳入
  （它的界属于链内判定 `HARD_LIMITS.routeInFlight`，与顶层标量不是同一类）。
- **Consequences:** 表内 10 个字段的越界都在载入时按上限生效、并只警告一次；低于下限、非数字、
  程序化 `resolveConfig` 越界仍硬拒（R-06 不变）；因此"存量补丁不再让整行起不来"覆盖面从 2 个
  键扩到 10 个键，但**上限本身一个都没放宽**。真机复核这半边 = Round2 §1 的产物身份，
  行为面仍由单测覆盖（`test/config-limits-repair.spec.ts`）。

## D-048 — 进度 Tab：脊椎按整词绑定、详情走来源阶梯、连线填充只陈述"已走过"（2026-11-15）

- **Status:** CONFIRMED（`src/progress-tab.ts` + `src/client/index.js` 同构实现；
  `test/progress-tab.spec.ts`、`test/progress-connector.spec.ts`）
- **Date:** 2026-11-15
- **Decision:** ① 阶段 token 里含拉丁字母的一律按**词边界**匹配，CJK token 才用子串；
  ② 详情七字段的来源阶梯固定为 `stage-detail` 事件 → 子会话协调块 → `not-reported`，
  块内值标 `Source: child coordination block`，只有解析到原文才允许复制；
  ③ 连线只在**左侧节点自己 `done`** 时填充，`failed`/`blocked` 留空；节点环内一个状态字形，
  聚合多行时用行数替换字形。
- **Reason:** 松匹配在真实 phase 头上产生了三次误报（`ui`→`build`、`tag`→`stage`/`target`、
  `sync`→`async`），把没人跑过的阶段画成"跑过了"——进度视图一旦会撒谎就没有观测价值。协调块
  只认显式块（围栏 json/`grok-coordination`、围栏内 `LABEL: value`、无围栏的同款标签块），
  是因为把散文猜成字段等于伪造证据；连线与字形的语义同理：填充=已走过，不是"看起来在跑"。
- **Alternatives rejected:** 把连线做成"运行到这里就亮"（流里没有这个事实）；用模糊/编辑距离
  匹配阶段名（误报只会更隐蔽）；把协调块从散文里正则抽字段（无法区分"报告了"与"提到了"）；
  聚合多行时仍显示单个字形（行数是更可核对的事实）。
- **Consequences:** 未命中的模板阶段永远 `pending` 并标"事件里没有报告"；一次真实运行若中途失败，
  线上的填充状态停在最后一个 `done` 节点，与引擎结局一致。`blocked`/`cancelled` 的真机触发仍是
  `NOT_RUN`（单测覆盖），不因为改了这一层就升级为真机结论。

## D-049 — layerfs 借鉴：只读评估留下可搬/不可搬两张清单，本轮**零移植**（2026-11-15）

- **Status:** 评估本身 **CONFIRMED**（只读）；每条 idea 在本仓库的适配性 **HYPOTHESIS**（未落地、
  未测）；移植与真机 **NOT_RUN**。
- **Date:** 2026-11-15
- **Decision:** 继续把 layerfs 当作**可选借鉴源**而不是依赖：本轮只产出两张清单（UI、多 Agent 各
  一组「可借鉴 / 不可搬」），**一行代码都不从 layerfs 搬**，也不改 layerfs 检出。可借鉴条目留给后续
  轮次逐条立项，每条都要有自己的证据与验收；不可搬条目连同理由一并记录，避免下一轮重新讨论。
- **评估对象（`CONFIRMED`）**：`/home/fish/projects_mine/layerfs`，本地检出
  `87bd986`（`Merge pull request #409 …`，工作树带其自身既有改动，与本仓库无关）。LayerFS 的 UI
  即它自己的 DSH 插件（`dsh/packages/{client,host,view,model,mock,dsh-layerfs,dsh-layerfs-demo}`），
  多 Agent 面在 `dsh/scenarios/*` 与 `core/crates/*`。执行者：agent-28（UI）、agent-29（多 Agent）；
  两份报告经 lead 汇总，故本条的结论口径来自 lead，不是逐条重跑的推理。
- **UI 侧（8 条可借鉴）**：①空态三档拆分；②错误降级 `note`；③失败给下一步 + 复制重跑；
  ④窄屏避让 composer；⑤深色零写死色并测试化；⑥百分比 `null` / indeterminate + `aria`；
  ⑦人话摘要行；⑧间距 token 表、零视觉改动。
- **UI 侧（不可搬，lead 计数 9 条 / 枚举 10 项——计数差异如实保留，不合并两条冒充 9）**：
  ①女仆皮肤；②自研渲染引擎；③`data-theme` 反射；④按时钟推断停止；⑤加权分数；⑥Stop-Run 按钮；
  ⑦portal 座位；⑧轮询；⑨字节格式化；⑩双 Tab。成组理由：**风格冲突**（①）、**渲染所有权**（②③⑦）、
  **无主后台**（④⑧）、**断言强度**（⑤⑨）、**能力边界**（⑥⑩）。
- **多 Agent 侧（8 条可借鉴）**：①关闭三段式；②未尝试不耗重试；③惰性获取、空闲释放；④容量拒绝带
  `code` + `next`；⑤短锁；⑥零进展出口；⑦证据禁转抄；⑧后挡板预算命名——**第 ⑧ 条是 HYPOTHESIS**：
  要先观测 twin 引擎的 `maxTotalAgents` 真实取值，才谈得上命名预算。
- **多 Agent 侧（不可搬 7 条）**：①无拷贝分叉；②sealed 哈希容器；③无超时；④废弃队列数值；
  ⑤verifier 格式错误全不重试；⑥`main` 发布权限；⑦任务分解算法削弱。理由与其自身产品边界有关，
  挪到本插件会与「有界并发/有界重试/独立验证」三条硬契约冲突（AGENTS.md 架构不变量）。
- **Alternatives rejected:** 直接把某条 idea 当本轮改动落进 `src/`（无法给出「照 layerfs 做的」
  证据——进度 Tab 的 token 色、≤480 px 抽屉、百分比空态与交付层人话块都是 v0.9.0 既有实现）；
  把评估结论写进 `CHANGELOG`（它不是用户可见变更，写进去等于冒认）；把 layerfs 列为依赖或镜像其
  实现（它的 UI 是它自己产品的界面，渲染所有权不在本仓库）。
- **Consequences:** 后续若立项移植，起点是上面两张清单 + 各自的验收证据；`CHANGELOG.md` 的
  `[0.9.2]` 不含任何 layerfs 条目（lead 2026-11-15 口径：不冒认）；本轮记忆只记评估，不记「已借鉴」。

## D-050 — v0.9.2 的 push/tag 卡在「human-only 默认形态」的真机证据上（2026-11-15）

- **Status:** CONFIRMED（lead 2026-11-15 口径 (B)）
- **Date:** 2026-11-15
- **Decision:** 本地把发版准备做齐（改测试同步、写 `CHANGELOG` 的 `[0.9.2]` 节、`package.json` +
  `package-lock.json` bump 到 `0.9.2`、全量绿、提交），但 **`push origin main`、`git tag v0.9.2`、
  GitHub Release、Issue #1 状态评论全部停住**，等新派的截图组补出「人话默认形态」的真机截图再放行。
- **Reason:** 用户对 v0.9.1 的不满**正是**报告形态（`evidence/progress-tab-2026-11-15/Round2/05`
  那张：`stat -c` / `od` / `sha256` / 绝对路径 / relay marker 全贴给读者），而仓库里**所有**真机证据
  都早于 agent-27 的人话默认化改动——即「改后到底长什么样」只有单测证据、没有真机证据。tag 一旦
  发布就不能移动（AGENTS.md 发布纪律），所以这一步必须等证据，而不是先发再补。
- **Alternatives rejected:** 直接 push+tag，把真机复拍记成事后补（用户点名的就是可见形态，凭单测
  就说改好了等于让用户替我们验收）；只本地留着不提交（记忆与 `CHANGELOG` 会漂在工作树里，下一轮
  容易把已完成的发版准备当成没做）。
- **Consequences:** 远端 `origin/main` 在放行前仍是 `4b92278`，没有 `v0.9.2` tag，也没有 Release；
  谁要接手，先读 `VALIDATION.md` Round 40 §6 的补图清单；旧 tag（`v0.9.1` → `9103280`）本轮未被触碰。

## D-051 — 测试的等待条件必须等于它断言的那件事实（2026-11-15）

- **Status:** CONFIRMED（`test/gate.spec.ts` 两条；见 VALIDATION Round 40 §2）
- **Date:** 2026-11-15
- **Decision:** `waitFor` 的条件写成**被断言的事实本身**（那一条答复落盘、那个 `assistant/message`
  出现），不写「某个计数 ≥ n」——计数会被别的消息提前满足。
- **Reason:** 两条 `test/gate.spec.ts` 失败都是这一条：队列满那条等「一条 relay follow-up」，而
  队列满**通知**本身就满足它，于是在被受理的批次还在排空时重发、又被同一个满队列拒绝；append 那条
  等「两条 session append」，而 run 自己的进度事件就满足它，于是断言早于 `assistant/message` 落盘。
  两者在 `4b92278` 上同样红，而在 CI 的 Node 22/24 上绿——**同一个测试在两个环境里给出不同结论**，
  这本身就是缺陷：一个只在快机器上过的用例，不能算证据。
- **Alternatives rejected:** 把 5 ms 的 `setTimeout` 调大（把时钟依赖藏得更深，只是把概率挪小）；
  加 `retry`/`testTimeout`（掩盖竞态）；给产品代码加同步点（产品不欠测试一个钩子）。
- **Consequences:** 该文件单跑 **55/55**、全量 **948/948**；今后新增「等某条消息/某个事件」的用例，
  条件写成那条消息/事件，不写成计数；重跑发现的时序敏感用例按本决定处理，不按「重跑一次就过」放过。



## D-050 — 答案置顶 + 边聊边干（A/B/C 的取舍结论）

- **Status:** CONFIRMED（代码+测试落地，未发布）
- **Date:** 2026-11-15
- **Decision:**
  1. 答案渲染与执行管线解耦：`full` 的"逐字节复现旧行为"指 plan/execute/verify/report 管线，
     不包括 delivery 渲染。A 对 `full`/`triage` 一视同仁；要旧机器原文开 `showDiagnostics` 或
     关 `humanSummary`。
  2. `SUCCESS_PREAMBLE` 逐字复述保留（实测只有逐字复述稳定），顺序问题在 delivery 层解，不在
     preamble 解（否决"让模型先说答案再贴 markers"）。
  3. 默认行为变更声明：`answerStrategy` 配置默认值不动（仍 `in-turn`）；改变的是 triage-team
     在可交互运行时的走法（`receipt-then-relay`），不可交互（one-shot/headless）回落 `in-turn`。
  4. 取消语义定为"整轮取消 + 窄化重起"，V1 不做子任务级定向取消（engine 无 per-task cancel）。
  5. B10 vs scrub 边界：失败原因行豁免 `tainted` 整行丢弃，只过 `stripMachineDetail`
     （保语义、去标识符）；`[infrastructure/timeout]` 类 `[a/b]`  bracket 永不进路由模式。
- **Evidence:** `src/delivery/index.ts`（answerLead/statusTail/scrub）、`src/script.ts`
  （synthesisHardRules/polishStyleVerdict）、`src/gate.ts`（canBackgroundDeliver/
  answerTeamInteractive）、`test/*` 29 断言更新 + 948 全绿。
- **Alternatives rejected:** 改 preamble 放行自由发挥（实测不稳定）；动 `answerStrategy`
  默认值（会静默改变 headless 语义）；子任务级取消（engine 不支持，虚假承诺）。
- **Consequences:** 旧 headline 断言全部重写；`instantReceipt` 固定句删除；真机验证待补。

## D-051 — 首答信息结构固定、措辞每次现写（禁固定话术的执行口径）

- **Status:** CONFIRMED
- **Date:** 2026-11-15
- **Decision:** 固定的是四要素信息结构（①听懂 ②已知/未知 ③后台查哪几方向 ④怎么打断），
  每句话现场组织；首答走一次轻量 `runSingleCall`（复用 `triageModel` 快手链路，不为首答开团队），
  失败降级为简短模板且明说"模板兜底"。`triageLine` 档位声明保留（可审计性），`greetingLine`
  固定写法不再作首答。
- **Evidence:** `src/triage.ts`（firstAnswerPrompt/sanitizeFirstAnswer/firstAnswerFallback）、
  `src/gate.ts`（produceFirstAnswer/answerTeamInteractive）。
- **Consequences:** 测试钉"两次同输入首答不逐字重复"方向待补（本轮未加）；模板句全文匹配即失败。

## D-052 — 进度 Tab A+C：七段脊 + 单展开分支 + 窄屏竖排（只改渲染 + CSS）

- **Status:** CONFIRMED（代码 + 单测 + 隔离真机）
- **Date:** 2026-11-16
- **Decision:** 采用 session-0ee2a233 的 10 路结论（方案A主推 + C窄屏形态，不做B泳道）：
  ①脊 7 等分占满宽，自身永不横滚；②横管时间、竖管归属；③手风琴同时只开一段（默认首个失败→首个 doing→全收）；④展开段默认 3 卡 + 实数 `+N`（N=M-3），分支 ≤4 行；⑤失败只标一处（2px 左红条 + 列头红点 + badge），阻塞灰虚边，running 蓝流动虚线绝不用绿；⑥有失败才有"跳到首个失败"按钮；⑦<480px 转竖排（Ant 竖排语义）；⑧默认露出 3 个；⑨颜色只用 5 状态色全走 token，色盲靠图标 + 文字。
- **Reason:** 宽度只花一次（窄面板永不横滚）；两根轴抢同一语义感知是反的（CHI/Timeline）；下游没 succeeded 就点亮绿线会骗人（Argo）。
- **Alternatives rejected:** B 横向泳道（高度随成员数爆炸，无真实日期退化成空轴；成员常年 >10 再议）；多层缩进树（层级伪造）；新依赖/daisyUI 引入（抄思路不引包）。
- **Consequences:** `test/client.spec.ts` 的 96px/snap/`aria-expanded` 全收断言、`progress-connector.spec.ts` 的 count-glyph 断言按新行为更新；`DESIGN-progress-tab.md §4` 的 9 段旧模板文字已漂移（待改文档，不在施工面）。
- **Evidence:** `src/client/index.js`（diff）、`lib/client.js`（同字节）、隔离 `acgtest:3225` 截图 `03/04/05/10/11/12/13/21/22/23` + DOM 断言。

## D-053 — live 免重启更新：新代码无已验证的免重启生效路径

- **Status:** CONFIRMED（现象） / HYPOTHESIS（归因 loader 无 cache-bust import）
- **Date:** 2026-11-16
- **Decision:** 新构建进运行中 live 进程**无已验证的免重启路径**（`dsh plugin add` 只换文件，进程仍跑旧模块；设置页改值无需重启，但那是值不是代码）。验证一律新 profile + 新端口（`acgtest/:3225` 标准路径）。live 更新等用户指令：要么用户重启 DSH，要么用户接受"只换文件不生效"的现状。
- **Evidence:** agent-11 只读侦察（HANDOFF 段）；`docs/LOCAL-TESTING.md §Activate` 步骤 5；HANDOFF 2026-11-08 loader 根因。

## D-054 — 补交步 A：格式缺失同 attempt 补一次，不花重试额度

- **Status:** CONFIRMED（代码 + 单测 3 例；真机 NOT_RUN）
- **Date:** 2026-11-16
- **Decision:** worker 调用无 structured 结果且失败分类是 format-error（非 setup）时，
  同 attempt 内追加一次 resubmit 调用（`resubmitPrompt`：禁重做、只取还缺的、立刻交卷），
  成功则正常进 verifier，attempts 仍一条并标 `resubmitted: true`；再缺则按原路径失败进重试。
- **Reason:** seq=5 式浪费（数据全对、只缺交卷格式，却烧一整轮重试）是真实落盘案例；
  补交是最短路径重试，不动核验严格性，不给 prose 开口子。
- **Alternatives rejected:** 启发式从 prose 提取字段（拆 verification 地基，t59 口子重开）；
  engine 续原 child 会话（`agent()` 契约无此通道，CONFIRMED 不支持）；补交计入 maxAttempts
  （违背用户"便宜"的原意；attempts 语义是"第几次尝试"，补交不是新尝试）。
- **Evidence:** `src/script.ts`（`resubmitPrompt` + worker 循环）、`src/report.ts` 白名单、
  `src/types.ts`、`test/failure-paths.spec.ts`（same-attempt resubmit 3 例）。

## D-055 — 设置页瘦身：8 键保留、24 键删除并固化行为（2026-11-17）

- **Status:** CONFIRMED（代码+测试落地，未发布；`npx vitest run` 51 文件 / 951 测试 PASS，typecheck 0 错）
- **Date:** 2026-11-17
- **Decision:**
  1. 配置表面只留 8 键：`toolName/mode/grokDefault/roles/synthesis/maxConcurrency/maxTasks/configVersion`；
     24 键删除（`REMOVED_CONFIG_KEYS`），旧补丁携带按 unknown-key 拒载（R-06）。
  2. 固定值：`maxRetries=1`（`FIXED_MAX_RETRIES`）、`timeoutMs=3600000`（`FIXED_TIMEOUT_MS`）、
     `humanSummary=true`、`showDiagnostics=false`、`answerStrategy=in-turn` 恒定、
     门控恒开（`enforceGate/gateRequired/gateScope/gatePreset` 删除）、triage 全固定
     （inherit/rules/双 true）、history 20/20000、队列 4、双记录恒开、recordLimit 256、
     `switchOn=[]` 内置策略、`subagentProvider` 空。
  3. 设置页只渲染 4 标量 + 5 角色链（9 叶键），无 hint、无用途说明、无 Danger、无只读区；
     `mode` 页上显示 `auto/full`（`auto`=triage 语义）；输出为模型直出的 markdown。
- **Reason:** 用户原话"设置页好多选项，小白看不懂，不要介绍每个选项的用途，要简单明了"。
  mock（`settings-simple-mock.html`）三轮定稿：总开关 / 执行模型（5 角色 × fallback + 监督）/ 高级（两数）。
- **Evidence:** `src/config.ts`（CONFIG_KEYS/REMOVED/FIXED_*）、`src/client/index.js`
  （4 卡片渲染）、`test/client.spec.ts`（72 例）、CHANGELOG `[Unreleased]` 双语迁移说明。
- **Alternatives rejected:** 隐藏键保留 schema 可配（用户选了 schema 也删除，干净但破坏兼容，
  以迁移说明 + R-06 拒载覆盖）；页上限 100 但硬上限保持 6（"填了不生效"的落差不可接受）。
- **Consequences:** 旧补丁含 24 键任一即拒载，需手动删除；`relay/append` 投递删除（one-shot 下丢答案）；
  1h deadline 单测不可真等，改静态断言（reliability/memory-archive）。

## D-056 — 第五角色 supervisor：每 task 每 attempt 一次，只能判失败（2026-11-17）

- **Status:** CONFIRMED（代码+测试落地，未发布；supervisor 预算计入，全量绿）
- **Date:** 2026-11-17
- **Decision:**
  1. `RoleName` 加 `supervisor`，调用门在 verify 之后、synthesize 之前，每 task 每 attempt 一次，
     仅当 supervisor 链已配置才跑；只能 fail 不能 pass（verifier 已 fail 则保持）。
  2. 预算：`routeBudgetFor` 加 supervisor 项（空链=0，保持旧预算不变），
     `maxTotalAgentsFor` 计入；`maxAttemptsPerTask` 400→600，公式
     `(50+50+50)×4=600`（`test/routing.spec.ts` 钉死）。
  3. 上限同步放宽：`maxConcurrency/maxTasks` 默认 10/10、上限 100/100
     （用户定值；AGENTS.md 不变量同步更新）。
- **Reason:** 用户要求"每个步骤可以选多个模型 fallback" + "监督可以监督每个环节"。
- **Evidence:** `src/script.ts`（`supervisorPrompt`/调用门/预算）、`src/report.ts`/`records.ts`/
  `naming.ts`（监督/监督调用/Supervisor）/`checkpoint` 五元组、`test/routing.spec.ts`
  backstop 公式、`npm run ci` 级全量 951 绿。
- **Alternatives rejected:** 监督映射到 verifier（用户选了独立第五角色，全链路贯通）；
  per-run 60000 守卫（per-task 语义下永不触发，否决，见 T6 讨论）。

## D-057 — v0.10.0 用 minor 而非 patch：删键属于 0.x 破坏性变更（2026-11-17）

- **Status:** CONFIRMED（本轮发版执行）
- **Date:** 2026-11-17
- **Decision:** T4 瘦身把配置面从 32 键砍到 8 键、24 键按 unknown-key 拒载，版本按
  `0.9.4 → 0.10.0`（minor）发布，不用 `0.9.5`（patch）。
- **Reason:** 对 0.x 用户而言，旧 profile 补丁带着被删键会在载入时被拒 —— 不是缺陷修复，
  是行为契约变更；semver 的 0.x 惯例把破坏性变更放在 minor 位。patch 位只留给
  不改变配置契约的修复（如 v0.9.4 的补交步）。
- **Evidence:** `src/config.ts`（`CONFIG_KEYS` 8 / `REMOVED_CONFIG_KEYS` 24）、
  `package.json`+`package-lock.json` = `0.10.0`、`CHANGELOG` `## [0.10.0] - 2026-11-17`
  迁移段、`.github/workflows/release.yml`（tag ↔ package.json 校验）。
- **Alternatives rejected:** `0.9.5`（把破坏性变更放进 patch 位，用户按 patch 语义升级会踩坑）；
  `1.0.0`（配置面之外的 API 还在动，太早）。
- **Consequences:** 用户升级前必须清理补丁；README 配置表与 `docs/LOCAL-TESTING.md`
  已按 8 键重写，CHANGELOG 给出迁移清单。
