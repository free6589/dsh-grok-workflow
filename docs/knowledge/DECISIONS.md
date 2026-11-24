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
- U-8 拦截面：维持 source.kind='user' 边界并显式文档化（不扩拦 user-question-reply/team-message/webhook/schedule 等）——这条边界**没有变**；D-137 只是让卡片答案在门禁里被**点名**成一次 `question-reply` 直通，它仍然不算请求、不启动任何一轮。
- U-9 时长体感：维持 timeoutMs 默认（30 分钟）；流式进度提示入 backlog。

## D-010 — 夜间自主执行与发布纪律（用户 2026-10-26 授权）

- 计划执行无需逐步批准；实施→测试→独立复查→修复→重测的循环照旧，严格验收标准。
- 每个批次整合后即时 push 同步 GitHub；版本里程碑设 tag：v0.2.0-rc.1（功能收口）→ v0.2.0 + GitHub Release（阶段 7 验收后）。v0.1.0 tag 永不移动。
- 模型：wb/cn:deepseek-v4.1-flash 优先，wb/global:deepseek-v4.1-flash 全局并发 ≤2；模型故障即换（成员重指派/换路由）。

## D-011 — 0.2.0 的破坏性边界（阶段 7 定稿）

- **Status:** CONFIRMED（随 0.2.0 发布说明一并发布）
- **Date:** 2026-10-26
- **Decision:** `0.2.0` 把强制入口（`enforceGate`）默认设为 `true`，即「每条用户消息走完整工作流」成为默认行为；`0.1.0` 的「仅模型主动调用工具」改为需要显式 `enforceGate: false`。
- **Reason:** 用户核心需求 A 就是「每条消息强制完整工作流」；把它做成默认关闭的可选项，等于交付了一个不满足需求的默认形态。
- **Compatibility:** 报告为纯增量扩展（`writesPaths`、失败 `class`/`category`），但配置面收紧（未知键拒绝、链校验、`switchOn` 白名单），且验收标准归一化去重会拒绝部分旧输入——这三点必须在更新日志的 breaking notes 明写。
- **Alternatives rejected:** 默认关闭（默认不满足需求）；一次性大版本 `1.0.0`（内部仍有 L2 路由、链编辑器未做，版本号会虚高）。
- **Consequences:** 升级者若不想要强制入口必须显式关闭；要求「绝不静默降级」的部署需再加 `gateRequired: true`。

## D-012 — 安装后严格测试与修复发布闭环（用户 2026-10-26 指示）

- 安装到真实 profiles 后执行严格功能测试矩阵（强制入口/幂等/失败路径/设置页渲染/组合共存/递归防护/secrets/稳定性），逐 profile 逐项记录通过与否。
- 发现 bug 即修：单写者修复 → npm run ci 全绿 → 独立复查 → 整合 push → bump patch 版本 → 新 tag + GitHub Release → 重新安装新 tag → 重跑全部用例。
- 已发布 tag 永不移动（v0.2.1/v0.2.2… 递增）；安装一律锁 tag；每步证据进 docs/knowledge；可随时回滚上一 tag。

## D-013 — 运维两条硬规则（用户 2026-10-27 要求，t32 落地）

- **Status:** CONFIRMED
- **Date:** 2026-10-27
- **Decision 1（服务不重启）:** 不得重启、杀死或改动正在运行的本机 `dsh web` 服务（当前 live 实例 `:3090`，PID 825935，`DSH_HOME=/home/fish/dsh-layerfs`）。任何验证都在**新建 profile + 新端口的新实例**上做；live 的重新加载只能由用户批准后执行，实施者只提供步骤清单。
- **Decision 2（队长只计划不实施）:** 队长（captain）只做计划、派单、验收与整合，**一切实现由子代理完成**；队长不得亲自写代码/改文件。
- **Reason（规则 1）:** live 实例承载用户的真实会话与工作区；重启会中断在跑的任务、丢掉内存态（而「设置写入只影响下一条消息」的语义正是为了不打断在跑的任务）。t32 的一次 `pkill -f "profile web-grok-debug"` 差点匹配到自己的命令行并波及无关进程，说明「按模式杀进程」本身就不安全——改为按 `ss -ltnp` 解析出的 PID 精确 kill。
- **Reason（规则 2）:** 实施与验收必须分离，否则「自测自过」；独立子代理 + 单写者 + 队长验收是本项目已经跑通的模式（t15/t29/t32）。
- **Evidence:** t32 全程在 `/home/fish/dsh-layerfs/profiles/web-grok-debug` + `127.0.0.1:3199` 上取证，结束后仅 kill 自己启动的 PID；live `PID 825935` 全程存活（多次 `ps -o pid -p 825935` 校验）。
- **Alternatives rejected:** 直接重启 live 观察效果（违反用户边界）；用 `pkill -f` 省事（t32 已出现自伤）。

## D-014 — 激活前提：图形/工具面出现 `grok_workflow` 需要「工作流 provider 行是启用的」（t32/t33 实测，t35 修正）

- **Status:** CONFIRMED
- **Date:** 2026-10-27（t35 补充实测口径）
- **Decision:** 任何安装说明都必须包含"在 profile 的 `cordis.patch.yml` 里把 `workflow-ptc` 的 `disabled` 置为 `false`（`provider: spawn`）「这一步，并把」激活"定义成四条可检验事实（启动无 pending 警告、`settings/describe` 有命名空间、GUI 有 Grok workflow 卡片、真实会话 `request/header.tools` 含 `grok_workflow`）。
- **Reason（逐层实测，不是推断）:** `@deepseek-ai/dsh-base/cordis.patch.yml`（第 397-406 行）把 `ptc-runtime`、`workflow-ptc`（`config.provider: spawn`）、`tool-workflow` 作为**启用**行插进基础组合；`@deepseek-ai/dsh-web-app/cordis.patch.yml`（第 567-568 行）随后把 `workflow-ptc` 与 `tool-workflow` 一起置 `disabled: true`。所以：
  - **headless / tui（只叠 base）本来就带引擎** —— 这解释了阶段 3 以来所有 headless 端到端运行不需要任何额外步骤；
  - **只有 web 需要补这一行**；`agent preset` 与 `dsh --preset` 在 0.2.1-rc.2 里都不重新启用它（无此 CLI 参数，`dsh-agent-preset` 也不 patch cordis），能启用它的是「去掉 web-app 层」或"任意后置层写 `- id: workflow-ptc / disabled: false`"——即 t34/F6 所记的「重新启用」实质由 **base 层 / 显式 patch** 完成，不是某个 preset。
- **Reason（同源风险）:** `dsh plugin add` 只把包放进 `dsh.profile.bundles`（`--dump-config` 能看到行），**装包 ≠ 激活**；服务缺失时 Cordis 让插件长期 `pending`，`apply()` 永不执行 → 无工具、无设置面、无门禁。t33 的 92,716 字符系统提示里 0 次 `grok_workflow` 正是这个原因。
- **Evidence:** t32 在新 profile 上对比同一配置：`workflow-ptc.disabled: true` → 启动打印 `grok-workflow (dsh-grok-workflow): pending (waiting for service: workflowEngine)`，`settings/describe` 无该命名空间；改为 `disabled: false` 后启动干净，`settings/describe` 出现 `grok-workflow`（`autoGenerate: true`，17 字段），真实 GUI 会话 `request/header.tools` 出现 `grok_workflow` 并触发门禁。t35 在 0.2.1 上重复该结论（`docs/knowledge/VALIDATION.md` Round 3、`docs/knowledge/evidence/t32/`）。
- **Consequences:** 0.2.0/0.2.1 的安装/升级说明新增一步；`subagentProvider` 只接受 DSH 子代理提供者名（`spawn`/`fork`），填 LLM 供应商名会让每次运行 fail-closed（`no subagent provider registered for "<id>"`）。
- **Addendum（t35/F7）— `plugin add` 与 `dsh.profile.bundles` 的真实边界:** `dsh plugin add` 结尾走 `reconcile()`（`@deepseek-ai/dsh-plugin-manager/lib/index.js:326-341`）：非依赖的层条目（如 `@deepseek-ai/dsh-base`）无条件保留；是依赖的条目**仅当其安装包仍声明 `dsh.bundle`** 时保留；新装依赖只有声明 `dsh.bundle` 才追加为层，否则只当普通依赖并打印 `<name> declares no dsh.bundle — installed as a plain dependency, not a profile layer`。所以「覆盖 bundles」的准确说法是"按依赖与 `dsh.bundle` 元数据对账"：t32 里层条目消失的真因是安装包清单的 `dsh` 字段被脚本重写成只剩 `client`（`dsh.bundle` 丢失），而不是「新包挤掉旧包」。安装后必须核对 `dsh.profile.bundles` 仍在（见 `docs/LOCAL-TESTING.md` 的 live 生效步骤第 4 步）。

## D-015 — 设置页文案跟随 DSH 语言设置（t42）

- **Status:** CONFIRMED
- **Date:** 2026-10-27
- **Decision:** 设置页的**全部**文案（卡片标题/简介、分组标题、字段标签、数值范围、角色链编辑器、只读行、保存/放弃、保存结果、全部校验错误）经由组合自带的 `@deepseek-ai/dsh-client-locale` 解析：bundle 用 `ctx.locale.register('grok-workflow', { zh, en })` 注册字典，并给 `plugins.item` 槽声明 `locale: 'grok-workflow'` 以取得框架的 `t` 座位。**不**读 `navigator.language`，不做自己的语言探测。
- **Reason:** 用户要求「随 DSH 设置的中/英文变化，与 DSH 原生设置页一致」；该包正是 Settings → General → Language 与 `<html lang>` 的所有者，且渲染器在每次 locale revision 上重算 `t` 座位（`useLocaleRevision`），所以页面、卡片标题与简介都能就地换语言，无需重载。
- **Reason（为何不把 `locale` 写进 `inject`）:** Cordis 没有可选注入，`inject` 里的名字即硬依赖；缺服务会让插件停在 `pending`，而 DSH 把 pending 当作**整个 web 客户端启动失败**上报。为一个「最坏也只是英文」的页面换取 GUI 启动失败不划算，因此 `apply()` 先以自带 translator 挂载，再用嵌套 `ctx.inject(['locale'], …)` 取得服务后注册字典并重挂（带着 `locale`）。`inject` 仍为 `['slots','configForms']`。
- **Reason（`ctx.get('locale')` 不是替代）:** `Context#_getImpl` 走本 fiber 的 isolate 映射，未注入的服务对它同样不可见，随后的属性读取会抛 `cannot get property "locale" without inject`（实测，本任务第一版即踩此坑）。
- **Evidence:** `test/client.spec.ts` 结构性钉住（两字典键集相同、数据派生键双语且不退化、每条 finding 两种语言不同、`apply()` 注册双语字典并声明 `locale`、无 locale 服务时仍可挂载）；GUI 双语取证见 `docs/knowledge/evidence/t42/`（经 Settings → Language 切换，`<html lang>` 由 `en` → `zh-CN`，重载后保持）；`npm run ci` 全绿（19 文件 / 293 测试）。
- **Alternatives rejected:** 硬编码中英混排（0.2.1 的做法：视觉噪音、无法把值嵌进句子、无视用户所选语言）；读 `navigator.language`（与 DSH 设置不同源，用户改了设置页不变，正是本次要修的偏差）；自建 i18n 表（与原生设置页不一致，且会与 locale 插件抢「当前语言」这个唯一事实）。
- **Consequences:** 新增文案必须同时写 `zh` 与 `en`，否则测试失败；校验结果保持 `{key, params}` 数据形态（新增错误码需同步两语言）；`docs/knowledge/evidence/t42/` 成为页面文案的取证基线。

## D-016 — 并发槽位按会话计，另设进程级总量兜底（t45，修 t41 实证的「一会话饿死所有会话」）

- **Status:** CONFIRMED
- **Date:** 2026-10-27
- **Decision:** `maxActiveRuns` 的语义改为**每会话**（默认仍 2），新增 `maxActiveRunsTotal`（默认 8，硬上限 16）作为**进程级**兜底；两条限额分别校验，拒绝文案必须写明**谁占着槽**（run id + 已跑时长；总量拒绝则列 session + 该会话 run 数与最老 run 时长）。
- **Reason:** t41 在三个不同 workspace 记录到 4 次 `start-failed`，全部发生在「已有 2 个 run 并存」的时刻，而 `createActiveState()` 在 `apply` 作用域里被全进程共享——即**一个会话的两个长 run 可以饿死所有其它会话**，用户在一个窗口发问会收到"already has 2 active run(s)"这种无法自救的英文拒绝。日记账（`plugin:grok-workflow/delivery` 8 条）可复现：2a7c7254 t7 + 08daa48b t64 两个长 run 期间，3335d3d3/0b073299/2ef91d3e 三个会话各被拒。
- **Reason（为何不是 per-workspace）:** 会话是 DSH 的配额与审计单位（`session.id` 在 gate/records/routing 里已经是身份），workspace 只是 cwd 分组；一个 workspace 里可以有多个并行会话，按 workspace 计会让「同一个文件夹开两个会话」互相挤占，且我们拿不到稳定的 workspace 身份（只有 cwd 字符串，软链/重命名都会漂移）。
- **Reason（为何仍要保留全局兜底）:** 没有总量限制时，N 个会话就可能有 2N 个 run、每个 run `maxConcurrency` 个 spawn 子代理，进程级 fd/内存/模型配额会先崩掉；8 个并发 run 是实测下仍可控的量级，且它只在**多会话同时长跑**这种罕见场景触发。
- **Evidence:** `test/lifecycle-disposal.spec.ts` 三例：①同一会话 2 个长 run 后第 3 个被拒且文案含 `maxActiveRuns is 2 per session` 与 `holding: run run-1 (running …)`，同时**另一个会话照常起跑**（修复前这里会被拒，即回归复现）；②「已 admit 未 start」的 run 只计入本会话、不影响其它会话；③`maxActiveRunsTotal` 达上限时拒绝并列出占槽会话。变异验证：把按会话计数改回 `state.runs.size + state.pending`，上述三例全部失败。
- **Consequences:** 设置页把 `maxActiveRuns` 标签改为「每会话活跃运行上限 / Active runs per session」，并新增「全部会话活跃运行上限 / Active runs across all sessions」；`CONFIG_KEYS` 22 → 23，volatile 投影 18 → 19（`test/settings-projection.spec.ts` 与 `test/config.spec.ts` 同步钉住）。行为变化对既有安装是**放宽**（原来被全局挤占的会话现在能跑），不会让之前能跑的场景变失败。

## D-017 — 单次工作流 deadline 默认 30 分钟 → 60 分钟（t45，按实测改，不做按任务数自适应）

- **Status:** CONFIRMED
- **Date:** 2026-10-27
- **Decision:** `timeoutMs` 默认值改为 `3_600_000`（60 分钟），硬上限保持 `86_400_000`；工具注册时的 `timeoutMs` 仍为 `min(timeoutMs + 60_000, 86_400_000)`，跟随该值。**不**引入「按任务数自适应」的默认算方式。
- **Reason:** t41 实测两次被杀在 `30m00s` 与 `30m01s`（2a7c7254 t6、cb452931 t39），报告的失败行是 `workflow exceeded the 1800000 ms deadline and was cancelled`；而真跑完的四任务工作流用时 878 s / 1148 s / 1801 s。即 30 分钟是**贴着真实工作量**的刀口，不是安全边际：四任务 + 一条慢 provider 链就会撞线。60 分钟给观测到的最坏情况约 2x 余量，同时仍保住「挂死的 run 不会永远占着槽」这一性质。
- **Reason（为何不做自适应）:** 任务数在 planner 返回前未知（门禁路径先规划后执行），而 deadline 必须在启动时定；用 `maxTasks` 猜上限等于把「最多 12 个任务」当成「必然 12 个任务」，在常见 1-2 任务场景下给出 6 小时的荒唐上限。需要更长 deadline 的用户可以在 profile patch 里显式写（该值已能被 `configVersion` 前的 schema 校验），把「要多长」留给人而不是公式。
- **Evidence:** `test/lifecycle-disposal.spec.ts`：默认值断言 `3_600_000`、硬上限仍可设到 `86_400_000`、以及一次真实超时报告里写出"`1000 ms deadline`"（证明报告用的是**实际生效**的值而不是硬编码文案）；`test/input.spec.ts` 与 `test/client.spec.ts` 同步钉住默认值与设置页范围。变异验证：把默认值改回 `1_800_000`，两处断言立即失败。
- **Consequences:** 设置页 `timeoutMs` 的默认值显示为 `3600000`（范围 1000–86400000 不变）；t42 取证截图里的 `default 1800000` 属于**历史基线**，不再代表当前默认值。仍遗留一条真实缺口：deadline 临近没有进度事件（t41 的 P1-3/U-9），本决策不覆盖，记在 WORKFLOW-DESIGN 的 DD-13 与 VALIDATION Round 5 的 NOT_RUN 里。

## D-018 — deadline 由插件自己强制执行（t47，修 t46 实证的「引擎不收 abort」）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `runWorkflow` 的 deadline 不再「abort 一个 signal 然后等引擎收尾」，而是**插件自己的硬上限**：一次 `Promise.race([run.result, deadline])`，deadline 先到就 `run.cancel('workflow deadline exceeded after N ms')` 并当场返回超时报告；`config.timeoutMs` 同时进入运行报告（`Deadline: <n> ms per run (enforced by the plugin)`）。
- **Reason:** t46 在设置页保存 60 000 ms 后，运行在 2 分 40 秒、5 分钟时仍在工作；本轮用**干净重启 + profile patch 直写 60 000**复现并定性：报告自己说 `workflow exceeded the 60000 ms deadline and was cancelled; the engine had not settled`，UI 上运行节点在 **61.5 s** 离开 `running`。即**设置到达了运行时，是引擎在长子调用中不响应 abort**——t46 的两个候选原因里是第二个。原实现只能「请求取消」，上限的可靠性等于引擎的合作度。
- **Reason（为何报告里要写 deadline）:** t46 无法回答「到底哪个值在生效」——该值只存在于内存。现在它与路由链一起写进报告，会话日志即可自证。
- **Reason（为何同时改取消原因）:** 原代码把 deadline 触发的取消写成 `workflow cancelled by its caller`，把责任指向用户；现在写 `workflow deadline exceeded after N ms`，与 unload（`plugin unloaded`）、用户中止（`by its caller`）三分为三。
- **Evidence:** `test/reliability.spec.ts` 新增"stubborn engine"用例：`cancel()` 是 no-op 的引擎下，1 000 ms deadline 约 1.0 s 返回 Timeout 报告（修复前会一直等），并断言 cancel 原因含 `workflow deadline exceeded` 且不含 `by its caller`；`test/report.spec.ts` 断言 `Deadline:` 行与 `limits.timeoutMs` 不符即拒收；真机取证 `docs/knowledge/evidence/t47/B1-deadline-report.txt`、`A-run.log`。
- **Alternatives rejected:** 只改文档、把「引擎不合作」留作已知问题（用户拿不到按时报告，且下一次仍会被误判为「设置没生效」）；在引擎侧修 abort（属 DSH 核心，越界）。
- **Consequences:** 超时报告可能先于引擎真正停下出现——报告文案已明说 `the engine had not settled, so this report is the authoritative result`；被杀掉的 run 仍走既有 `run.dispose()` 路径。

## D-019 — 卸载提示行：只入台账 + 报告是唯一用户可见通道（t47，插件侧无渲染路径）

- **Status:** CONFIRMED（0.2.3 提案挂在末尾）
- **Date:** 2026-10-28
- **Decision:** 卸载时写入的提示行**保持** `assistant/message`（`source: grok-workflow/workflow-notice`，带 `surfaceOp: 'append'`）不变；**不再**把它当作 transcript 通道承诺。用户告知由报告承担，提示行的第二个作用（把「强制工作流已关闭」写进下一轮上下文）保留。
- **Reason:** 该行位于 `turn=1 step=0`，而客户端只为 `step/start` 开节点（`dsh-client-ui-chat/lib/client.js:8094-8108`：`step/start → start`，`assistant/message` + `surfaceOp: append → update`），`buildViewNode` 又需要该 step 节点的 `publishedAssistantData`；本会话第一个 `step/start` 出现在提示行之后（`seq 14`，`turn 1 step 1`），故 `1:0` 永远没有节点，行被丢弃。可选路径逐条被堵：伪造 `step/start` 会往日志里塞一个 agent loop 从未开启的 step（loop 的编号、`turn-process` 分组与下一轮上下文都从日志推导）；`system/message` 渲染成**系统提示卡**（`client.js:9947-9966`），用它等于宣称提示词变了；`conversation.chat.node` 是**按 key 的渲染座位**（`client.js:7180-7215`，key 为 user/steering/context/turn-trigger/system-prompt/assistant-step…），节点只能由 chat 包自己的投影创建（`chatNode()` 是模块私有）；包里没有任何 toast/notice API。
- **Reason（为何不改成 plugin 事件）:** 提示行现在会进入 surface，下一轮上下文因此知道「强制工作流已关闭」——这是 t45 的设计意图；改成不可渲染的 `plugin:*` 事件会丢掉这个作用，而换不来任何用户可见性。
- **Evidence:** `docs/knowledge/evidence/t47/`：`E5-notice-event.json`（事件含 `surfaceOp: "append"`，`turn 1 step 0`）、`E3-conversation-after-unload.{png,txt}`（同一会话的 transcript 里没有该行）、`E5-report-relay.txt`（同一 run 的报告写明因卸载被取消）。同时纠正 t46 的错误结论：该事件**带** `surfaceOp`，t46 是在 `data` 里找的。
- **Alternatives rejected:** 写成 `user/message`（t45 已测：非 `user` source 的用户行不被渲染，且会伪造用户发言）；写进当前 step 的 `assistant/message`（会把模型回复覆盖掉）；在卸载瞬间发 toast（bundle 正在被销毁，且 toast 是瞬时的，不构成可回溯的告知）。
- **Consequences (0.2.3 提案):** 要让插件写出「能看见的一行」，需要 DSH 侧提供其一：①公开的 chat node 贡献 API（插件自带 key + 自己的投影），或 ②带投影的 notice 事件类型。两者都在「外部插件、不改核心」的边界之外，故本版如实降级，未静默丢弃。

## D-020 — 任务判定只认结构化判断，散文字段不参与（t49，修 8/12 报告的质量失败）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `checkVerification` 的判定依据是 verifier 的**结构化判断**：`verdict`、每条验收标准一条 `criteria`（含 `met` 与非空 `evidence`）、以及 `checkedEvidence` 非空、criteria 条数与任务一致。散文字段 `issues` **不参与判定**：已通过任务的 `issues` 以 `verifier note: …` 进入报告 `Uncertainties`。`verdict: fail` 或任一 `met: false` 仍然判失败。
- **Reason:** 测试 home 12 份报告里 **8 份**失败的 reason 全是 `verifier reported issues: …`，而该字符串由 `checkVerification` 里**晚于** verdict 检查的分支产出 ⇒ 这 8 次 verifier 的 `verdict` 都是 `pass`，任务只因它写了句备注就判失败。备注自己的措辞是"non-blocking"、"minor observation rather than a failure"、"does not affect any acceptance criterion"、「判定为满足」。即这是**我方判定缺陷**，不是「flash 当 verifier 太严」也不是「worker 太弱」：同一批数据里 verifier 从未把某条标准判为不满足。
- **Reason（为何不让散文否决结构）:** 两个权威并存时弱者胜出，等于要求模型「不许有任何意见」才能通过；模型对散文的用词不可控（本次是提示词从未定义 `issues` 的含义，只要求该字段存在）。判定的可解释性也要求单一权威：`met`/`evidence` 可逐条核对，散文不可。
- **Reason（为何补提示词）:** 只改代码会让 `issues` 变成陷阱（模型以为写了有用、实际被降级为备注）。提示词现明确：`issues` 只放**阻塞性问题**，且必须与 `verdict: fail` / `met: false` 一致；残余疑虑写 `confidence`。
- **Evidence:** `test/config.spec.ts` 新增三例（不含阻塞项、只用**真机原文**当 `issues` → `COMPLETED` 且备注进 `Uncertainties`；`met: false` → 仍失败；`verdict: fail` → 仍失败）；变异验证：恢复 `if (issues.length > 0) return …` 后 3 例中 2 例失败。真机：同一 flash 三链、同一批目标句（t46 第 1/4 轮曾失败）在修复后两次 `COMPLETED`（`docs/knowledge/evidence/t49/Q2-report.txt`、`Q4-report.txt`）。逐份归类的分析见 VALIDATION Round 8 与 `evidence/t49/README.md`。
- **Alternatives rejected:** 保留 `issues ⇒ fail`，靠换更强模型绕过（用户仍会因一句备注丢弃整轮工作，且把产品缺陷伪装成模型能力问题）；只改提示词不改代码（散文仍能否决结构化判断，模型换个说法就又失败）；把 `issues` 全部删掉（丢掉真实观察，报告里就看不到「这次取证是间接的」这类重要限定）。
- **Consequences:** 发布说明不得把「质量」说成提升——这是判定缺陷的修复，不是模型变强；0.2.2 的报告会把非阻塞备注放在 `Uncertainties`，读者仍能看到限定语。想更严/更松的验证属于 `roles.verifier` 的模型选择。`maxRetries: 0` 下真实质量问题仍是一次即失败、不重试。

## D-021 — 每条消息必过「前台」，前台公开分流四档（t52，语义变更）

- **Status:** CONFIRMED（用户明确授权，方案 C）
- **Date:** 2026-10-28
- **Decision:** 需求 A 的原文「每条用户消息强制走完整工作流」改为「**每条用户消息必过前台（front desk），前台公开给出档位与理由，绝不偷懒跳过**」。前台把消息分成四档：`chat`（直答档，模板秒回）、`fast`（快手档，单工人一次调用）、`team`（团队档，完整工作流 + 开工迎宾 + 进度面板）、`ask`（确认档，反问一句「这个要动用团队吗？可回复：简单 / 团队」）。配置 `mode: 'triage' | 'full'`，`full` 逐字节复现 0.2.2 之前的行为（每条消息都走团队，无档位行、无迎宾语、无轻量调用），旧模式的用户不受影响。
- **Reason:** 铁律的代价是每条「你好」都付一次规划+干活+检查；用户要的是「该省的省、该认真时认真，但**不许偷偷降级**」。因此判据从「是否走完整工作流」变成「是否公开档位并给出理由」：直答与快手档都在回答里写明「档位：X — 因为：…」，且直答档明说「这条没有动用团队」、快手档明说「只派了一个工人」。偷懒（不说明就单干）仍是被禁止的。
- **Reason（判据必须便宜）:** 分流是纯字符串判定（`src/triage.ts`，无时钟、无 I/O、无模型调用），因为一次分类用模型会给每条消息加一次成本与延迟——包括本该「秒回」的问候。规则判不准的部分交给用户：这正是 `ask` 档存在的意义，比「猜」便宜也比「猜」诚实。
- **Reason（直答档用模板而非一次调用）:** 实测在 :3100 上，直答档的一次模型调用返回 `{"reply":null}`（`agentsStarted=1 value={"reply":null}`），而同一脚本的快手档正常返回答案；模板同时满足「秒回」这一档位承诺，且没有失败模式。见 VALIDATION Round 9。
- **Reason（档位文字跟随消息语言而非 DSH 界面语言）:** 用户可能界面是英文而用中文提问，此时中文迎宾语才是他要的；消息语言同步可得。设置页的中英双语仍跟随 DSH 语言（那是浏览器端的 i18n 契约）。
- **Evidence:** `test/triage.spec.ts`（t52 交付时 22 例，t53 F1 修复后 **26 例**：分类表、彩蛋与回答语境、强制升级、`full` 回退、各档行为、措辞双语、14 条定向样本回归）；`npm test` 22 文件 / **366** 例（336 → 358 → 362 → 365 → 366，不回退）；真机矩阵见 VALIDATION Round 9/10 与 `docs/knowledge/evidence/t52/`、`evidence/t54/`。
- **Alternatives rejected:** 继续铁律（每条消息都付团队成本，用户已明确否决）；纯模型分类器（每条消息多一次调用/延迟，且判定依据进了不可审计的地方）；静默降级（不告诉用户走了哪档——这正是需求要禁的「偷懒」）；把 `ask` 档做成「猜一个」（用户明确要「拿不准就问」）。
- **Consequences:** 新增 3 个配置键（`mode`、`triageAsk`、`triageModel`），配置键总数 23 → **26**；`mode: 'full'` 是回退通道，`triageAsk: false` 让拿不准直接升级到团队档。既有测试里凡测「门禁/运行」的用例显式写 `mode: 'full'`，语义不变。

## D-022 — 前台判据是规则，档位文字跟随消息语言（t52）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `classifyTriage()` 只读消息文本与两项策略（`mode`、`triageAsk`）；语言由消息是否含 CJK 决定（`detectLanguage`）。优先级：`full` 模式 → 上一轮「确认档」的回答 → 显式升级（「用团队」）→ 寒暄词典 → 指向型模糊（「把这个弄一下」）→ 长度/信号计分（`deliverables` 计数、多步连接词、分句数）。
- **Reason:** 规则可测、可解释、零延迟；每条规则都在 `test/triage.spec.ts` 里有正反例。CJK 判定是为了让「双语措辞」落在用户读得懂的语言上（见 D-021）。
- **Evidence:** 分类表在 t52 交付时 21 例通过，t53 F1 追加后 `test/triage.spec.ts` 共 26 例；`full` 模式回归：既有 336 例在 `mode: 'full'` 下全部保持（t52 后 358，t53 F1 后 362，t56 后 365，t58 后 366）。
- **Alternatives rejected:** 读 DSH 的 `locale` 偏好作为唯一依据（它是浏览器偏好，可能与消息语言不一致，且需经 `settings.describe()` 重读整个命名空间）；英文动词不加词边界（实测 `run.ts` 被当成动词 `run`，把重构任务压到快手档——已修，测试钉住）。
- **Consequences:** 规则漏判由 `ask` 档承接，不会静默降级；新增词汇需要同时补测试与 `DETAIL` 文案。

## D-023 — 快手档一次调用走引擎，不走旁路（t52）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `fast` 档用 `workflowEngine.start()` 跑一段"只有一个 `agent()`"的脚本（`runSingleCall`），不直接调 provider，也不复用完整工作流脚本。该调用分两次形态：**主调用不带 schema**（子代理的自然语言回答就是答案），只有在主调用拿不到任何文本时才**重试一次带 schema 的结构化调用**（`{"reply": …}`）。
- **Reason:** 直接调 provider 会绕开引擎已经做对的三件事：把子 agent 归属到父 agent、计入子 agent 上限、发出 `workflow/agent-start` 供进度面板显示；而完整工作流会给「简单任务」强加规划与复核的成本。失败时不静默升级为团队档（否则档位行就是谎话），而是如实告知「快手档没答出来」。
- **Evidence:** `test/triage.spec.ts`（快手档 1 次调用、失败不改档位）；真机 :3100 快手档返回"30"并带「只派了一个工人」（`evidence/t52/M2-fast.txt`）。
- **Alternatives rejected:** 复用完整脚本（两次以上调用、分钟级延迟）；直连 provider（丢失归属/上限/进度）；失败后自动升级（档位行失真，且用户以为「很快」却等了几分钟）。
- **Consequences:** 快手档模型由 `triageModel` 覆盖，留空即用本次运行的路线；一次调用失败就是失败，需要重发或说「用团队」。

## D-024 — 确认档的记忆在插件内存里，10 分钟、用后即弃（t53 F1，明确披露）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `ask` 档问出的那句「这个要动用团队吗？」以及用户随后回答的「简单/团队」，存在 `installGate` 内的 `pendingAsks: Map<agentId, askedAt>` 里：**进程内存**、TTL 10 分钟、取值即删（`takePending`）。不做会话持久化。
- **Reason:** 持久化需要把「本会话正等待一次分档回答」写进会话事件再读回来；本插件能**写**自己的记录（`plugin:grok-workflow/delivery`），但没有在真机上验证过的「读回自己历史记录」的接口，猜一个 API 会在运行期变成新的失败面——这比一次可以说明白的遗忘更糟。因此选择「诚实降级」：过期或重载后的裸「简单/团队」落 `chat` 档并明说原因（`stale-choice`），绝不静默开跑用户没配对任务的活儿，也不崩。
- **Reason（为什么不能靠猜）:** 没有 pending 时把裸「团队」当强制升级，会让一句回答过期的「团队」启动一次完整工作流，花的钱和「这条消息要干什么」完全无关；把裸「简单」当快手档则会让一个工人去执行一个不存在的任务。两种都比「问回一句」更糟。
- **Evidence:** `test/triage.spec.ts`「does not crash on a bare choice word with no question waiting」（4 个裸词 → `chat`/`stale-choice`，且回答里说明了原因；`pending: true` 时同样四个词正确读作回答）；真机 t54 矩阵把这四个词逐条发过（`evidence/t54/`）。用户可见披露：README「The front desk」小节与 `DETAIL['stale-choice']`。
- **Consequences:** 插件重载、或隔了十分钟以上再回「简单/团队」，会收到「上一轮没有待回答的分流问题…」的回答，需要把任务和选择写在一起（例如「用团队：把 X 改成 Y」）。这是记录在 README 的限制，不是缺陷。
- **Alternatives rejected:** 会话持久化（无验证过的读回接口，风险高于收益，见上）；永不失效（一句隔夜的「团队」启动一次完整工作流）；静默把裸词当强制升级（见上）。

## D-025 — 档位判定的顺序就是它的正确性：短路规则必须让位给强信号（t53 F1 blocker）

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** `classifyTriage` 的规则顺序固定为：`full` 模式 → 上一轮确认档的回答 / 裸选词 → 点名团队 → 寒暄词典 → 插件自述 → **指向模糊** → 长目标 → **多步（先…然后/序号/顿号/分号/并+动词）** → 团队计分 → **已识别的问句形态（≥ 快手档，绝不用模板）** → **短而惰性（模板）** → 冲突反问 → 快手 → 反问/升级。两条硬约束：①任何「廉价短路」（模板直答）必须排在全部强信号之后；②带锚点（路径/文件名/错误码/代码片段）的「这个报错」不算模糊，直接派工。
- **Reason:** t53 验收 blocker 的根因不是某条规则写错，而是**顺序**：`len<=40 && 无交付物 && 无动作动词 && 单句` 这条「短即寒暄」的短路排在多步与提问之前，于是「为什么天空是蓝的」「先备份然后升级」「这个报错 src/x.ts:42」全被模板答成寒暄，活儿一点没干。同时「模糊即反问」过宽，把带路径的真实报错也拦下来反问了一遍。
- **Reason（为什么提问单独成信号）:** 问句往往短、没有动作动词、没有交付物名词——按词汇计分永远落在「惰性」一侧，而它恰恰是**一定要去查证**的一类消息。把它作为独立信号提到短路之前，「短问句」就不再依赖长度或动词表。
- **Evidence:** `test/triage.spec.ts` 新增 4 组回归（14 条 t53 定向样本 + 中英对照若干）：短问句中/英各 3-4 条 → `fast`/`question`；短两步「先…然后/再」、「备份数据库并通知我」、`1) 2)`、`一、二、`、分号分隔 → `team`；带路径/错误码/片段的「这个报错」 → 不止反问（`fast`），而「改一下那个」仍反问；裸词 → `chat`/`stale-choice`。全量 `npm run ci`：22 文件 / **362** 例（此后 365、366，见 D-026/D-027）。真机 :3100 逐条复验见 VALIDATION Round 10 与 `docs/knowledge/evidence/t54/`。
- **Alternatives rejected:** 只加提问词典、不改顺序（多步仍被短路吃掉）；把「短」阈值调小（治不了「先备份然后升级」这种 7 字两步）；用模型判断「这是不是问句」（又是每条消息一次调用，见 D-022）；把模糊判定整体删掉（「改一下那个」就没人问了）。
- **Consequences:** 规则顺序从此是**被测试钉住的产品契约**：新增短路规则必须排在多步/提问之后，否则回归测试会失败。`TriageSignals` 增加 `question` 与 `concrete` 两个字段，供后续规则复用。

## D-026 — t56 收尾：两条契约缺口按「改实现」补齐，并记下英文问句的教训

- **Status:** CONFIRMED
- **Date:** 2026-10-28
- **Decision:** 三处缺口一律**改实现**而不是改契约文字（D-025 已经承诺过它们）：
  1. **句尾「几」**：`QUESTION` 从 `几[个号年月天时分秒]` 放宽为 `几(?![十百千万乎])`，于是 `等于几`、`得几`、
     `几台`、`几条记录`、`是几`、`剩几`、`几核` 都算问句（「几十/几百/几乎/几何」不算）。
  2. **纯顿号列表**：新增 `COMMA_LIST = /(?:[^\s、，。；;:：]{1,10}、){2,}/`——**三个及以上**顿号项算多步
     （`改配置、重启、验证` → 团队档）。两个项（`读、写`）不算：那通常是一个动作的两种说法，判成团队是浪费。
  3. **`并+动词`**：动词表补 `回滚|回退|重启|验证|灰度`。
  另外 `vague`（模糊即反问）**让位给提问**：带指向词的问句（`这个得几`）是「要去查一下」，不是「线索不足」，因此
  `vague` 规则加了 `&& !question`；无对象的指向（`改一下那个`）仍然反问。
- **Reason（为什么改实现）:** 契约文字是产品承诺，实现在它后面；如果为了省事改文字，就等于把「用户以为有保护」变成
  「文档承认没保护」。这三条都在 D-025 里写明承诺过，所以必须让代码追上文字。
- **Reason（英文的教训）:** t56 真机复验抓到一条单测没覆盖的误判——`is this repo using esm or cjs` 既没有 `?`，
  也不含任何 wh-词，于是被判成 `确认档`，前台对一个问题反问了一遍。英文是非问句的形态是**助动词前置**，不是问号；
  规则据此补 `\b(?:is|are|was|were|does|do|did|can|could|should|would|will|have|has)\s+(?:it|this|that|…)\b`。
  同时给 `MULTI_STEP` 补英文顺序词（`then`/`first…then`/`afterwards`/`finally`），保证 `do this then that` 仍先被
  判成多步，不会被「助动词前置」吃成问句。
- **Evidence:** `test/triage.spec.ts` 追加 3 组共 5 个断言块（句尾「几」8 例、顿号/回滚、英文是非问句 5 例 + `do this
  then that` 反例），全量 **22 文件 / 365 例**；真机 44 条矩阵在隔离工作区 `/tmp/t56-work` 上跑（VALIDATION Round 11，
  `evidence/t56/`）。误判修好前后的真机证据：同一句 `is this repo using esm or cjs` 修前 `Tier: confirm`（会话日志
  `session-b2159958…` 第 6 条），修后 `档位：快手档`。
- **Consequences:** 分类器的「问句」面更宽了（更多短消息落在快手档），这是有意的：问句是最不能省的一类消息。
  两个不变量因此可写死为测试断言：**多步永不吃模板、已识别的问句形态永不用模板**。
- **Alternatives rejected:** 只补中文顿号（英文是非问句继续误判）；把「三个顿号项」降成两个（`读、写` 会被判团队）；
  用模型判断问句（每条消息一次调用，见 D-022）。

## D-027 — 问句按**形态**识别，不按词表；「绝不用模板」只对**已识别的形态**承诺（t58）

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
  口径同时收紧：文档与测试里「问句永不用模板」改为「**已识别的问句形态**永不用模板」——规则没认出来的形态
  （例如纯陈述式的偏好表达）不在这条承诺之内，落 `直答档` 也不算违反契约。
- **Reason（为什么形态化）:** t57 的三个对抗探针——`端口 8080 被谁占了`、`logs 里 500 多不多`、
  `我该用 yarn 还是 pnpm`——对任何读者都是明显问句，却一个词典词都不含。逐词打补丁会一直输给这类句子
  （上一轮刚补了 `几`，这一轮又冒出三个），所以改成「识别问句的**构造**」：重复动词、二选一、疑问代词。
  这三条覆盖了汉语是非问句与选择问句的主要形态，且不依赖任何领域词。
- **Reason（为什么必须同时写边界）:** 形态规则天然会误伤陈述：`他还是走了`（副词「还是」）、
  `他还是没有提交`（副词 + 否定）、`他问是谁负责发布`（转述）。所以每条形态都配一条**排除规则**，
  并且把边界写成测试断言——否则「修好一个问题问句」会换回「把陈述句当问句」。
- **Evidence:** `test/triage.spec.ts`「recognises A不A / A没A, 还是 and 谁 as question shapes」：8 条问句
  全部 `fast`/`question`（含 t57 三条原句），4 条陈述句断言 `reason !== 'question'`，另加 `备份还是升级`
  （真二选一）仍为问句；`npm run ci` **22 文件 / 366 例**全绿。**这一轮只做规则级验证，没有跑真机矩阵**：
  改动全在分类器规则内，单测是权威证据，真机只会重复 Round 11 已经证明的「档位行照常出现」。
- **Consequences:** 「问句」这条不变量从「永远成立」变成「**对已识别形态成立**」，并且是被排除规则钉住的可测边界。
  以后再遇到新形态（例如 `V 不 V` 之外的 `要不要/行不行`——已被同一规则覆盖），应先写形态再写排除，而不是加词。
- **Alternatives rejected:** 继续加词（`谁`/`还是`/`多不多` 各加一条，下一批探针照样漏）；不写排除规则
  （陈述句被当成问句反问一遍，比漏判更烦人）；用模型判断问句（每条消息一次调用，见 D-022）。

## D-028 — `/grok` 会话级开关：默认关、正交于 `enforceGate`/`mode`、用插件记录持久化（整值替换）

- **Status:** CONFIRMED（设计已定；phase 1 落地中：`src/mode.ts` 已测通，config/gate 接线在跑）
- **Date:** 2026-10-28
- **Decision:** 把「每条用户消息强制走工作流」从硬闸门改造成**会话级、运行时可用命令随时切**的 `/grok` 开关：
  1. `/grok` 开（= 该会话走完整工作流）、`/grok off` 关（= 不拦，回普通聊天）。
  2. **默认关**（`grokDefault: 'off'`）：装好是普通聊天，`/grok` 才开。
  3. 状态存成一条插件记录 `plugin:grok-workflow/mode`（`{v:1, enabled, turn, setBy}`），
     **整值替换**（后写覆盖先写），挺过 fork/resume/重启，读回走 `session.ownEvents()`。
  4. 与现有三层**正交**：`enforceGate`（全局拦不拦）／`/grok`（本会话开不开）／`mode: full|triage`
     （开了之后走全套还是前台分诊）。
  5. 落点：`classifyPreStep` 新增一条 `pass, reason:'mode-off'` 放行分支（复用现成放行通道，
     与 `subagent`/`out-of-scope`/`already-routed` 同路），只在「本会被认领」的批次上触发。
- **Reason:** 用户要「可控、能命令随时切、别每条都硬拦」，同时保留「不静默降级」（默认关→开后仍走完整流程）。
  plan-mode 式心智（命令 + 持久状态）比硬钩子更贴 DSH 原生、冲突更少。
- **Evidence:** `src/mode.ts` + `test/mode.spec.ts`（13 例：读写、整值替换、坏记录不覆盖、fallback、写失败 warn-and-continue），
  持久机制实测见 RESEARCH.md「plugin-record persistence」。config/gate 接线 + 全套回归由集成轮补证。
- **Consequences:** 失去「每条消息都强制验证」的**默认**保证（默认关，靠用时 `/grok` 开）；换来可控、少冲突、好懂。
  「状态跨重启/翻记录不丢」由插件记录天然提供，无需新机制。
- **Alternatives rejected:** 保留硬闸门（不可控、易与其它插件/团队消息/webhook 冲突）；改成工具呈现模式
  （native/ptc，语义错位，grok-workflow 本就跑在 PTC 运行时上）；状态只存内存（重启/翻记录就丢，违反「不静默降级」）。
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
  2. planner 提示词禁止把目标改写成「尝试 X 并如实报告」/「预期失败」；验收标准必须是目标要求的**终态**。
     verifier 提示词：executor 说被阻塞/拒绝/未达成时，verdict 必须 fail。
  3. `ModeRecord` 增加可选 `workflowMode`；`/grok` 写入 `'full'`，闸门用它覆盖部署 `mode`。
     配置级 `grokDefault: 'on'` 仍尊重 `mode`（部署方选择分诊还是全流程）。
- **Reason:** T5（真模型）里 `/proc` 写入必然失败、worker 自报 BLOCKED，却因 planner 把目标软化 +
  `partial` 不被拦而报 `COMPLETED`。这与插件存在的理由（「不把'做完了'当完成」）直接冲突，
  属于最高优先级缺陷。`/grok` 文案承诺完整流程，但 `mode: triage` 会静默改走前台分诊，同样是「说假话」。
- **Evidence:** `test/orchestrator.spec.ts`（partial + 通过 verifier → failed）；`test/triage.spec.ts`
  （会话记录 → 无档位行）；`test/mode.spec.ts`（形状校验）；`test/command.spec.ts`（写入形状）。
  真机：T5 → `COMPLETED`（修前）/ `FAILED`（修后 T5b），T6 `PARTIAL`，见 VALIDATION Round 12。
- **Consequences:** 更严：执行者自报未完成的活不能再被「验收标准改写」洗白；代价是 worker 用词偏保守时
  会更多地落 `partial`/`failed`（这与「绝不静默降级」一致；重试一次仍可救回）。
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
- **Reason:** 并发上限与失败是两回事：前者是「这条路正忙」，后者是「这条路不通」。混为一谈会把
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
  按 `deterministic` 生效。warn 文案含「已按…生效，请在设置页确认」，有效配置签名带
  `synthesis=<mode> (repaired)` 自证。其它（未知键/provider/模型、越界、畸形链、
  `switchOn`、budget）一律仍 hard fail（R-06 不动）；修后形状若还带第二缺陷，
  以第二缺陷为准抛错（修不掩错）。设置页对同样两种不一致红字拦 Save
  （`error.synthesisChainUnused`/`Missing`，中英双语）；合法组合才放行。
- **Reason:** 配错一行就整行 `did not activate`，连设置页都没了，等于「没地方改」的死锁
  （本轮 oper 现场：`synthesis` 缺省 `deterministic` + 配了 synthesizer 链）。
  这两形的用户意图是明确的（有链≈想要模型重写；要模型重写但链空≈先按规则跑），
  修完意图不变；其它错误意图不明，一修就是「看起来能跑实际路由是错的」。
- **Evidence:** `test/config-synthesis-fallback.spec.ts`（8 例：a/b 双向修复、
  一致不动、未知键/越界数/畸形链不动、可恢复形下藏第二缺陷仍抛、`apply()` 三例、
  `(repaired)` 标记）；`test/client.spec.ts` 跨字段拦 Save（含空行不算链）；
  `npm run ci` 31 文件 / 540 测试；`lib/` 同步。
- **Consequences:** `ResolvedConfig` 增可选 `synthesisRepaired?: boolean`
 （仅修后置位，`resolveConfig` 本身不置）；`ARCHITECTURE` 增「可恢复 vs 不可恢复」小节；
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
- **Reason:** 用户可见失败是「我这轮是单次进来的，看不到刚才上面的研究结果」——子代理确实看不到，
  所以修的是「让它看到」，而不是「让它别这么说」。改 records/归档会撞独立任务的写路径。
- **Consequences:** 新增 `src/carryover.ts`；`src/script.ts`、`src/run.ts`、`src/gate.ts`
  （仅 `runTeam` 注入，提问判定逻辑零改动）、`src/index.ts`（工具路径同样注入）各加薄薄一层。
- **Alternatives rejected:** 新增持久 digest 记录（跨轮存储在 records/归档，属独立任务，且会多一份
  可能与报告不一致的副本）；把整段上一轮报告塞进 objective（无界、且会把历史与指令混在一起）；
  让子代理自己回读会话文件（`session.v4.jsonl.zstd` 是 zstd 二进制，子代理没有会话读取工具）。
- **已知副作用（不在本次范围）：** 会话首条消息被 `in-turn` 在 `pre-step` 抢先写成
  `user/message` 时，`--session-id` 恢复会因「system/message 必须是首个 surface head」失败
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
  「记忆不存在」，而是**提问前没查**。把「查」插在提问这一步之前，既修掉失败形态，又不改任何其他档位。
- **Consequences:** `src/triage.ts`（召回判定/说明/提示词）、`src/gate.ts`（磁盘读取 + 接线 +
  `GateDeps.memoryDocRoots`）。`src/config.ts`、`records.ts`、`carryover.ts` 未改。
- **Alternatives rejected:** 让模型自己判断「要不要再问」（不确定、每次多一次调用、单测无法钉）；
  把整段会话硬塞进 ask 判定（无界，且必然自命中）；用向量/语义检索（本轮约束是确定性单测，且会引入
  依赖与在线能力）；改 `expiredAskNote`/`unusedAskNote`（那是 P0-2 的档位选择语义，与「知识是否存在」
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
- **Reason:** 用户可见失败是「配了多条路由却永远只走第一条」——根因是全空 Cap = 不限 = 永不让路，
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

- **Status:** BLOCKED（历史判定，2026-11-08 已被 D-041 推翻并落地；原判定依据：源码级 `CONFIRMED`，见 VALIDATION.md Round 27 的 8 处行号，当时结论「插件侧无文档化扩展点」）
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
  在这种情况下，插件侧任何「修复」都只能是绕过契约的脏补，风险大于收益，且违反 AGENTS.md 的
  "never modify the DSH core repository … use documented extension points only"。
- **Consequences:** 无源码改动；`CHANGELOG.md` 不加条目（没有用户可见变更可记）。
  记录：`VALIDATION.md` Round 27、本节、`STATE.md`、`HANDOFF.md`。
- **Alternatives rejected:** 见 VALIDATION.md Round 27 的「已否决的绕行方案」表（追加描述符、自定义
  SubagentProvider、改 `meta.name`、插件自建 `startActivation`、改 core）。
- **可选的半程缓解（未实施，待用户批准）：** 顶栏**次级行**是子会话自动标题，来源是提示词首行
  （`You are the planning agent…`）。插件可在 `workflow/agent-start`（事件里带 `childId`）后调用文档化服务
  `ctx.sessionTitle.rename(session, <任务名>)`（`@deepseek-ai/dsh-session-title` 的 `SessionTitleService.rename`）
  把次级行改成任务名。**但这只去掉提示词原文，`任务团队 child N` 主标签仍在**，因此不满足本任务验收条款 1，
  本轮不做；若用户接受「主标签保留、次级行变任务名」，可作为独立小任务实施。
- **Upstream ask（NOT_RUN）：** `runtime.ts` 把 `opts.label` 放进 `startAgent`；`host.ts` 的 `childRequest()`
  接收 `label` 且 `startChild()` 用 `label: request.label ?? \`${meta.name} child ${callId}\``。约 3 行，改完插件零改动即生效。
- **Addendum（2026-11-07 晚，第二次尝试，Round 28）：** 状态维持 **BLOCKED**。Round 27 的判定由第二次尝试
  **独立重验**（源码链逐条重读）并用**隔离 profile 真机复现**坐实：复用 `out/v060-verify/*.patch.yml`，
  在 `out/childname-verify/`（profile `cnamer`）跑一轮团队档（COMPLETED，2 任务 verified，6 子代理），
  6 个子会话首个 `subagent/descriptor` 全部为 `"label":「任务团队 child N」`（N=1..6），而父会话
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
  子会话与投影在结束后依然在）；②渲染器层是唯一同时满足「不改 DSH core」与「恢复链接」的
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
- **Reason:** D-039 的三次执行把「逐调用扩展点」逐个排除了，但漏掉一个服务级扩展点：
  插件本来就持有 `ctx.workflowEngine`（自己的 inject），而 `PtcWorkflowEngine.start()`
  在 start 时才读 `runCtx.subagents`（`workflow-ptc/src/index.ts:157`）——把 run 起在
  「同一引擎 + 装饰过的 subagents」上，`startActivation` 的调用方就变成了插件，
  label 归调用方的契约（types.d.ts:122-124）站在插件这边。不改 core、不改引擎、
  不碰共享服务实例；上游 3 行 ask（D-039）从「必要」降级为「可选的简化」。
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
- **Reason（为何 Uncertainties 不藏）:** 两条独立理由：①它是给读者的诚实限定语（「这项只在一台机器测过」），
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
- **Decision:** ① `src/config.ts` 的 `LIMIT_CAPS` 是**唯一**的「哪些数值键按硬上限钳制、界是多少」的
  声明，值一律读 `HARD_LIMITS`；schema 侧 `clampedLimit(field, min)` 与载入期
  `repairLimitOverruns()` 都从这张表取界，新增上限只加一行。② 两层钳制都**只记账**
  （`recordOverrun()`），唯一发声点是 `src/index.ts` 的 `announceOverruns()`，按 `field:stored`
  用 set 去重后 `logger.warn`。③ 设置页横幅读 `entry.user`（用户层），不读 `entry.value`（生效值）。
- **Reason:** 旧实现把 `maxConcurrency`/`maxRetries` 的界写了两处（schema 与 repair），第二个界
  永远落后一步；而报错路径那条读**每条消息**走一次，原来的逐条 `logger.warn` 会在补丁仍超限时
  每消息刷一行，用户看到的是刷屏而不是「一次修复」。横幅读生效值则更糟：用户存 `8`、生效 `6`，
  横幅若显示 `6` 等于替用户改口，用户无法知道自己的补丁被改了。
- **Alternatives rejected:** 把界放进每个 schema 字段字面量（两处界会再次漂移）；在 repair 里直接
  `logger.warn`（那条读可能因别的缺陷抛错，且没有去重锚点）；把 `configVersion` 也纳入钳制
  （它是线上契约，不匹配必须拒载，改写会造出「版本对得上」的假象）；把每路由 `maxInFlight` 纳入
  （它的界属于链内判定 `HARD_LIMITS.routeInFlight`，与顶层标量不是同一类）。
- **Consequences:** 表内 10 个字段的越界都在载入时按上限生效、并只警告一次；低于下限、非数字、
  程序化 `resolveConfig` 越界仍硬拒（R-06 不变）；因此「存量补丁不再让整行起不来」覆盖面从 2 个
  键扩到 10 个键，但**上限本身一个都没放宽**。真机复核这半边 = Round2 §1 的产物身份，
  行为面仍由单测覆盖（`test/config-limits-repair.spec.ts`）。

## D-048 — 进度 Tab：脊椎按整词绑定、详情走来源阶梯、连线填充只陈述「已走过」（2026-11-15）

- **Status:** CONFIRMED（`src/progress-tab.ts` + `src/client/index.js` 同构实现；
  `test/progress-tab.spec.ts`、`test/progress-connector.spec.ts`）
- **Date:** 2026-11-15
- **Decision:** ① 阶段 token 里含拉丁字母的一律按**词边界**匹配，CJK token 才用子串；
  ② 详情七字段的来源阶梯固定为 `stage-detail` 事件 → 子会话协调块 → `not-reported`，
  块内值标 `Source: child coordination block`，只有解析到原文才允许复制；
  ③ 连线只在**左侧节点自己 `done`** 时填充，`failed`/`blocked` 留空；节点环内一个状态字形，
  聚合多行时用行数替换字形。
- **Reason:** 松匹配在真实 phase 头上产生了三次误报（`ui`→`build`、`tag`→`stage`/`target`、
  `sync`→`async`），把没人跑过的阶段画成「跑过了」——进度视图一旦会撒谎就没有观测价值。协调块
  只认显式块（围栏 json/`grok-coordination`、围栏内 `LABEL: value`、无围栏的同款标签块），
  是因为把散文猜成字段等于伪造证据；连线与字形的语义同理：填充=已走过，不是「看起来在跑」。
- **Alternatives rejected:** 把连线做成「运行到这里就亮」（流里没有这个事实）；用模糊/编辑距离
  匹配阶段名（误报只会更隐蔽）；把协调块从散文里正则抽字段（无法区分「报告了」与「提到了」）；
  聚合多行时仍显示单个字形（行数是更可核对的事实）。
- **Consequences:** 未命中的模板阶段永远 `pending` 并标「事件里没有报告」；一次真实运行若中途失败，
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
  1. 答案渲染与执行管线解耦：`full` 的「逐字节复现旧行为」指 plan/execute/verify/report 管线，
     不包括 delivery 渲染。A 对 `full`/`triage` 一视同仁；要旧机器原文开 `showDiagnostics` 或
     关 `humanSummary`。
  2. `SUCCESS_PREAMBLE` 逐字复述保留（实测只有逐字复述稳定），顺序问题在 delivery 层解，不在
     preamble 解（否决「让模型先说答案再贴 markers」）。
  3. 默认行为变更声明：`answerStrategy` 配置默认值不动（仍 `in-turn`）；改变的是 triage-team
     在可交互运行时的走法（`receipt-then-relay`），不可交互（one-shot/headless）回落 `in-turn`。
  4. 取消语义定为「整轮取消 + 窄化重起」，V1 不做子任务级定向取消（engine 无 per-task cancel）。
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
  失败降级为简短模板且明说「模板兜底」。`triageLine` 档位声明保留（可审计性），`greetingLine`
  固定写法不再作首答。
- **Evidence:** `src/triage.ts`（firstAnswerPrompt/sanitizeFirstAnswer/firstAnswerFallback）、
  `src/gate.ts`（produceFirstAnswer/answerTeamInteractive）。
- **Consequences:** 测试钉「两次同输入首答不逐字重复」方向待补（本轮未加）；模板句全文匹配即失败。

## D-052 — 进度 Tab A+C：七段脊 + 单展开分支 + 窄屏竖排（只改渲染 + CSS）

- **Status:** CONFIRMED（代码 + 单测 + 隔离真机）
- **Date:** 2026-11-16
- **Decision:** 采用 session-0ee2a233 的 10 路结论（方案A主推 + C窄屏形态，不做B泳道）：
  ①脊 7 等分占满宽，自身永不横滚；②横管时间、竖管归属；③手风琴同时只开一段（默认首个失败→首个 doing→全收）；④展开段默认 3 卡 + 实数 `+N`（N=M-3），分支 ≤4 行；⑤失败只标一处（2px 左红条 + 列头红点 + badge），阻塞灰虚边，running 蓝流动虚线绝不用绿；⑥有失败才有「跳到首个失败」按钮；⑦<480px 转竖排（Ant 竖排语义）；⑧默认露出 3 个；⑨颜色只用 5 状态色全走 token，色盲靠图标 + 文字。
- **Reason:** 宽度只花一次（窄面板永不横滚）；两根轴抢同一语义感知是反的（CHI/Timeline）；下游没 succeeded 就点亮绿线会骗人（Argo）。
- **Alternatives rejected:** B 横向泳道（高度随成员数爆炸，无真实日期退化成空轴；成员常年 >10 再议）；多层缩进树（层级伪造）；新依赖/daisyUI 引入（抄思路不引包）。
- **Consequences:** `test/client.spec.ts` 的 96px/snap/`aria-expanded` 全收断言、`progress-connector.spec.ts` 的 count-glyph 断言按新行为更新；`DESIGN-progress-tab.md §4` 的 9 段旧模板文字已漂移（待改文档，不在施工面）。
- **Evidence:** `src/client/index.js`（diff）、`lib/client.js`（同字节）、隔离 `acgtest:3225` 截图 `03/04/05/10/11/12/13/21/22/23` + DOM 断言。

## D-053 — live 免重启更新：新代码无已验证的免重启生效路径

- **Status:** CONFIRMED（现象） / HYPOTHESIS（归因 loader 无 cache-bust import）
- **Date:** 2026-11-16
- **Decision:** 新构建进运行中 live 进程**无已验证的免重启路径**（`dsh plugin add` 只换文件，进程仍跑旧模块；设置页改值无需重启，但那是值不是代码）。验证一律新 profile + 新端口（`acgtest/:3225` 标准路径）。live 更新等用户指令：要么用户重启 DSH，要么用户接受「只换文件不生效」的现状。
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
  （违背用户「便宜」的原意；attempts 语义是「第几次尝试」，补交不是新尝试）。
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
- **Reason:** 用户原话「设置页好多选项，小白看不懂，不要介绍每个选项的用途，要简单明了」。
  mock（`settings-simple-mock.html`）三轮定稿：总开关 / 执行模型（5 角色 × fallback + 监督）/ 高级（两数）。
- **Evidence:** `src/config.ts`（CONFIG_KEYS/REMOVED/FIXED_*）、`src/client/index.js`
  （4 卡片渲染）、`test/client.spec.ts`（72 例）、CHANGELOG `[Unreleased]` 双语迁移说明。
- **Alternatives rejected:** 隐藏键保留 schema 可配（用户选了 schema 也删除，干净但破坏兼容，
  以迁移说明 + R-06 拒载覆盖）；页上限 100 但硬上限保持 6（「填了不生效」的落差不可接受）。
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
- **Reason:** 用户要求「每个步骤可以选多个模型 fallback」 + 「监督可以监督每个环节」。
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

## D-058 — 运行死线改为可配置，默认仍是 60 分钟，`0` = 不限时（2026-11-18）

- **Status:** CONFIRMED（本地 `npm run ci` 全绿 + 全量 959 测试）
- **Date:** 2026-11-18
- **Decision:** `timeoutMs` 回到配置面（第 9 键）：默认 `3600000`（60 分钟），
  接受 `0 … MAX_SAFE_INTEGER`，`0` = 不设 timer；非法值 fail closed（R-06），
  不做钳制。超过 `setTimeout` 上限（`MAX_TIMER_DELAY_MS = 2^31-1`）的值内部按不限时
  处理，但报告与 checkpoint 记录配置值本身。checkpoint 的 `msCeiling` 随之从
  "镜像 `HARD_LIMITS.timeoutMs`" 改成 `MAX_SAFE_INTEGER`，不再因为「记录不了」而丢掉
  真实死线。
- **Reason:** t45 实测过一次「改死线要改代码」的成本：30 分钟默认在同一个下午杀掉两次
  真实四任务运行（30m00s / 30m01s），而真实运行耗时为 878 s / 1148 s / 1801 s ——
  默认值必须是可调参数而不是常量，才能在不重新发版的情况下适配更长的任务。
  但默认值仍是 60 分钟而不是不限时：AGENTS.md 的不变量是「有界」，
  不限时必须由调用方显式选择（`0`），不能成为默认。
- **Evidence:** `src/config.ts`（`DEFAULT_TIMEOUT_MS`/`MAX_TIMER_DELAY_MS`/
  `timeoutInteger`/`CONFIG_KEYS` 9 键）、`src/run.ts`（`deadlineArmed` 两处入口）、
  `src/index.ts`（`defineTool` 只在有界时传 `timeoutMs`）、`src/checkpoint/wiring.ts`
  （`recordableTimeoutMs`）、`test/config.spec.ts` 新增 4 例、
  `test/checkpoint-engine-wire.spec.ts`/`test/checkpoint-wiring.spec.ts` 记录真实死线、
  README 中英配置表、`docs/LOCAL-TESTING.md`。
- **Alternatives rejected:** 默认 `0`（不限时）：与「有界工作流」的项目不变量冲突，
  一次卡住的运行会一直挂着；把上限钉在 `HARD_LIMITS.timeoutMs`（原 604,800,000）：
  用户明确要「没有实际上限」，且报告/checkpoint 现在都按配置值记录。
- **Consequences:** 设置页从两个数字变成三个数字；`REMOVED_CONFIG_KEYS` 从 24 变 23；
  旧补丁里写 `timeoutMs` 不再被拒载，而是生效。

## D-059 — 脱敏宁可多遮，也不改写代码；值必须在 token 边界结束（2026-11-18 · RSI round 5）

- **背景**：`key-value-env` 无值终止符，`db_pass=hunter2;user=app` 会连 `;user=app` 一起吞；
  同一规则把 `const token = await refreshToken()` 改写成 `const token = [REDACTED] refreshToken()`，
  把 `if (password == null)` 改写成 `if (password =[REDACTED] null)`；对已脱敏的
  `[REDACTED AWS ACCESS KEY]` 还会二次脱敏成 `[REDACTED] AWS ACCESS KEY]`。
- **选择**：值必须止于 token 边界（空白、行尾、`,;}&|<>})]`）；比较运算符（`==`/`===`）与代码关键字
  （`await`/`new`/`process`/…）一律不匹配；`[`、引号、`{` 开头的值不匹配。
- **替代方案**：a) 保持贪婪（会继续吞掉同一行其余内容并改写代码）；b) 引入 AST/语言感知
  （成本远超一个正则安全网）。选 a 的反面：**漏掉一个形状是漏，改写代码是把猜测写成事实**。
- **代价（明确接受）**：`token=getSecret()` 这类「值延续成调用」的赋值不会被脱敏；已记录在
  `docs/ARCHITECTURE.md` 的两条有意失衡里，并由 `test/redact.spec.ts` 钉住。
- **连带影响**：`test/phase1-dialogue.spec.ts` 的 `[REDACTED]` 断言改为 `[REDACTED API KEY]`（更严）。

## D-060 — 文档守卫绑定的是常量，不是文档里抄下来的数字（2026-11-18 · RSI round 6）

- **背景**：`docs/LOCAL-TESTING.md` 的键数、固化上限、默认死线当时都是对的，但同一份文档里
  四处安装示例指向 `0.2.x` 压缩包，排障条目引用一条代码从不输出的消息，中文 README 又把固化
  上限换了写法——数字对、事实错，正好是「没有守卫的文档」的典型腐烂方式。
- **选择**：守卫从 `src/config.ts` 读数（`CONFIG_KEYS`、`FIXED_*`、`DEFAULT_TIMEOUT_MS`），
  而不是把文档里的数字再抄一遍；压缩包名与 `package.json` 版本绑定，并由
  `.rsi/tools/bump-version.py` 在升版本时同步改写，所以「满足守卫」和「升版本」是同一次动作。
- **替代方案**：a) 只改文档不加守卫（下一版又会漂）；b) 守卫里写死 0.11.6（升版本即红）。
  取 a/b 的反面：数字由常量派生，改名由工具派生。
- **代价（明确接受）**：中文 README 的表述被拉平为 `key=value` 形式，可读性略降，但两份 README
  现在可以共用一条断言。

## D-061 — 已发布的预发布标签不移动：改为在文档里写明例外（2026-11-18 · RSI round 7）

- **背景**：`v0.2.0-rc.1` 是远端真实存在的标签，但它早于发布流程，所在提交的 `package.json`
  仍是 `0.1.0`。按「tag 必须等于 package.json」的现行规则它不合法；按「不得移动已发布标签」
  它又不能修。
- **选择**：不动标签、不改历史；在两份 README 的已发布列表后写明它不属于发布版本，并由
  `test/docs-version.spec.ts` 钉住这句说明。列表本身仍只列 `vX.Y.Z` 发布标签。
- **替代方案**：a) 删远端标签（违反 AGENTS.md，且会让旧引用失效）；b) 把它塞进已发布列表
  （列表语义变成「所有标签」，会破坏升序/发布语义与守卫）；c) force-update 标签指向
  0.2.0 提交（重写共享历史，明确禁止）。三条都被排除。
- **代价（明确接受）**：文档里多一句历史例外；将来若真的删除该标签，这句话与该 `it` 需同步删除。

## D-062 — 真机结论分两级：激活可证即记 PASS，真模型消息无凭据记 BLOCKED（2026-11-18 · RSI round 8）

- **背景**：任务要求「要么真实执行并保存 PASS 日志，要么记 NOT_RUN/BLOCKED 及具体原因；不得把没跑过的
  运行标成 pass」。本机沙箱下 `dsh` 写不了 `~/.dsh`，且操作者的凭据在别的 profile 里。
- **选择**：把「安装 → 组合 → 激活 → 设置投影」作为可独立证明的一级（用一个仓库内 `DSH_HOME` 起真实实例，
  用 `/api/settings/describe` 证明命名空间存在且 `autoGenerate: true`），把「真模型消息」作为另一级，
  无凭据时记 BLOCKED 并附上原始 `MISSING_CREDENTIAL` 行。文档按这两级分别表述。
- **替代方案**：a) 从别的 profile 复制密钥（违反任务红线与 AGENTS.md）；b) 只写「已真机验证」而不分级
  （把未跑过的东西说成通过）；c) 完全不测运行时（继续保留「NOT_RUN」）。三条都排除。
- **代价（明确接受）**：结论读起来更啰嗦，但每一句都能对到命令与输出；也解释了为什么 `:3199` 上
  的实例必须在本轮结束前关掉。

## D-063 — 阶段归属用两条通道，evidence 只做交叉引用不做第二个家（2026-11-18 · RSI round 9）

**背景**：`agent-start` 的 `phase` 有两种含义——角色调用所属阶段（`执行`/`检查`），和 worker/verifier
在任务内部运行时的计划任务组标题（`任务 n · 标题`）。只按 `phase` 匹配，两个必然发生的阶段
永远是空的（P0-02）。

**选择**：phase 未命中时，再按 **label**（角色名，`naming.ts` 产出）判一次归属，并把该行以
`evidence` 交叉引用到阶段节点；`members` 仍是每行唯一归属，状态自有行优先。

**备选与不选的理由**：
1. *把任务行直接塞进 `execute`/`verify` 的 `members`* — 会让同一条行出现在两个节点，轨道与
   百分比从此可以不一致（现有不变量测试会红），且计划任务分组消失，看不到哪个任务失败。
2. *把 `check` 加进 `verify` 的 phase token* — 任务标题 `check the build` 会被误绑到 `检查`；
   role token 只对 label 生效即可避免。
3. *删掉阶段模板行* — 会丢掉「声明了但没报告」与「根本没有这一段」的区别，等于用沉默掩盖缺口。

**代价**：节点模型多一个 `evidence` 字段（TS 与浏览器镜像各一份，`test/client.spec.ts` 对齐）；
一个阶段可能同时有自有行和 evidence，此时只由自有行决定状态（已在测试里钉住）。

## D-064 — 文档状态只写「since X.Y.Z」与「as of X.Y.Z」，不写「in this release」（2026-11-18 · RSI round 10）

**背景**：`docs/ARCHITECTURE.md` 用 `in this release` 描述已交付能力。读者（以及下一个代理）无法
判断它指装到的那个版本还是仓库当前 HEAD；DSH 边界一行也只写了一个版本，而复查发生在更新的版本上。

**选择**：①能力上线写 `since **X.Y.Z**`（首次交付版本）；②「现在仍然如此」的断言写
`as of **X.Y.Z**`（本轮核实的版本）；③如果之后在不同 DSH 版本上做过**别的**测量，把两种测量分开写，
并明写哪条**没有**重测。

**备选与不选的理由**：*只写最新版本号*——会把旧测量伪装成新测量（这正是要避免的）；*完全不写版本*——
状态无法被复核，等于散文。

**代价**：每次发布若要更新 `as of` 就要改文档；`test/docs-architecture-version.spec.ts` 只钉住结构
（有无相对措辞、有无 `since` 及其不超前于包版本），不钉具体日期，所以不会在版本 bump 时误红。

## D-065 — i18n 守卫按「作用域」断言，不用「某处存在」放行（2026-11-18 · RSI round 11）

**背景**：bundle 有两本词典（插件 `DICT` 与面板 `PANEL_DICT`），面板调用点拿到的是绑定
`PANEL_DICT` 的 translator。若守卫只断言「键在任一表存在」，那么把一个键从插件表挪进面板表也能通过，
而它实际会被错误的 translator 解析成原始键。

**选择**：①两表各自语言对称；②插件表缺失的键必须**正好**等于六个面板作用域键（
`member.empty`/`member.open`/`phase.empty`/`phase.unassigned`/`run.empty`/`statusCount.completed` 一类），
多一个少一个都红；③拼接键与动态展开在**消费它的表**里断言；④加一条自检，证明比较函数在不对称输入
下会返回差异（否则「两边都空」也能过）。

**代价**：新增面板作用域键时需要同步更新白名单常量——这是有意的：那种改动必须被看见。

## D-066 — 预设缺口：第一条心跳由操作者手动建，循环会话不得假设自己能建定时任务（2026-11-18 · preset gap）

- **Status:** CONFIRMED（证据为本地实测；本条记录的是选择本身，本机未创建任何定时任务，
  见「操作者授权」）

**背景**：无人值守循环要靠一条定时任务（心跳）把下一轮推起来，而「跑循环的那个会话」往往是最省的
`minimal` 预设，它既不声明 `dsh-tool-schedule`，也不声明 `time-context`。缺口有两条候选解法：
①操作者在有能力的环境里手动建第一条心跳（Automation tasks 页「Create manually」，或
`standard`/`cordis`/`ptc` 会话）；②打开循环开关时先提示切到带 `schedule_*` 的预设，再由本会话自己建。
（同轮另有一份实现在给配置面加 `loopEnabled`/`loopMaxRounds`——见 `src/config.ts` 的 `CONFIG_KEYS`；
本条约束的正是那个开关在会话缺 `schedule_*` 时该怎么做。）

**选择**：选 ①。循环会话只负责**报告**——有工具时报缺心跳/心跳到期，没工具时明说自己建不了，然后停下。
建第一条心跳是操作者的动作，不是循环的动作。

**理由**：

1. **插件改不了预设。** 工具注册在挂载作用域上，预设决定哪个作用域被注册
   （`dsh-tool-schedule/src/index.ts:4`："a preset decides which…"）。本仓库只能通过 bundle patch 挂载
   自身，不能替别的预设加工具，AGENTS.md 也禁止改 DSH core。所以 ② 的「提示」永远只是提示，最终动手的
   仍是人——它比 ① 多一道拒绝，没少一次人工。
2. **② 会把「没人拥有」留在开着的状态。** 开关显示 ON，而没有任何人能建、能读、能停那条心跳，
   与 AGENTS.md 的「No ownerless background work」直接冲突。
3. **预设是继承的，第一跳决定整条链。** 模型创建的会话沿用创建者的 cwd 与预设
   （`dsh-tool-schedule/src/index.ts:244` 的工具描述、`docs/tool-catalog.md:1688`、
   `docs/user/guide/schedule.md`）。跳错一次就是
   永久错：`minimal` 连 `schedule_list` 都没有，链条没有自愈通道。① 的第一跳落在**默认预设**上
   （同文档：手动创建的会话「uses the default preset」），天然是有能力的那一档。
4. **① 是唯一可审计的。** Automation tasks 页跨会话列出全部任务，可创建、编辑、运行、暂停、恢复、
   删除；② 把「能不能调度」变成会话的一个属性，在事件流里查不到。

**循环会话本身不得被假设能建定时任务**（这一条是给未来实现的约束，任一条成立即不得假设）：

- (a) `minimal` 预设既无 `tool-schedule` 也无 `time-context`。实测 DSH `0.2.2-rc.3` 的
  `node_modules/@deepseek-ai/dsh-web-app/presets/minimal.patch.yml`（78 行）只有
  persona / fs / compaction / persistent-shell 四组，`schedule` 与 `clock` 均无命中；
  `presets/standard.patch.yml:19,38` 才有 `time-context` 与 `tool-schedule`。
- (b) 委派子代理即使预设暴露了这四个工具，每个工具都会拒绝它
  （`dsh-tool-schedule/src/index.ts:292`："A delegated subagent cannot use scheduled tasks…"）。
- (c) 没有 `time-context` 就没有当前时间与浏览器时区，模型连「下一次什么时候」都不该猜。

正确行为是**报缺口并停**，不是换个说法假装建好了。

**一条必须写明的边界**：心跳送达的消息不是用户消息——它带 `source: { kind: 'schedule' }`
（`dsh-schedule/src/index.ts:723`、`dsh-schedule/src/runtime.ts:353`），而本插件的 gate 只认
`source.kind === 'user'`（`src/gate.ts:474`；`docs/ARCHITECTURE.md` 的分类白名单同样把 schedules 列为
pass through）。所以心跳本身不会启动一次 workflow，它只给会话一个回合，跑不跑由该回合的模型调用决定。
**「开关 ON」永远不等于「循环在跑」**——这正是 ① 必须由人显式拥有、而不是由插件猜的原因。

**操作者授权**：本条只记录「二选一 + 理由」，由本轮任务文本授权；**手动创建第一条心跳属于操作者动作，
本轮不代为执行**（`NOT_RUN`，与 `.rsi/PROTOCOL.md`「需要操作者授权的步骤一律跳过并记录」一致）——
本机本轮没有创建、修改或删除任何定时任务。若将来把 ① 写进产品（循环开关在缺工具时直接给出
「去 Automation tasks 建一条」的指引），那段文案是 `src/` 改动，需要自己的测试与单独一轮主题，
不在本条范围内。

**备选与不选的理由**：②「提示切预设」被排除，理由见上 1–4。第三条备选「插件自带一个调度器」违反
AGENTS.md（不得 fork 或重实现 DSH 的循环与生命周期），并会在宿主之外多出一个没人拥有的定时器——
ownerless 的反面不是「插件拥有一切」。第四条备选「用 `new` 目标每跳新建会话」只改投递语义、不改预设
继承：每一跳照样继承创建者的预设，还让每轮换工作目录与会话，审计面更大。

**代价（明确接受）**：① 让无人值守的启动多一步人工动作，表面上与「无人值守」相反；但那一步恰好是唯一
能被看见、能被撤销的一步。② 的「顺滑」是错觉——省下的那次点击，会在第一次心跳缺失时以「循环静默停摆」
的形式还回来，而停摆时没有日志、没有报错，只有一份写着 ON 的开关。

**失效条件**：若 DSH 将来给 `minimal` 加上 `tool-schedule` 与 `time-context`，(a) 失效，应新开一条
supersede 本条，而不是就地改这条——理由与证据必须留在同一条记录里。

**证据索引**：本节的事实细节与同轮的研究记录 `docs/knowledge/RESEARCH.md` **A24**（心跳式迭代）逐条
一致；其中 preset 清单、`source.kind`、目标继承三处，本轮用各自的 `grep`/`sed` 在 DSH `0.2.2-rc.3`
安装内自测过（不是转抄）。A24 另外记了两条本条没有依赖、但同样成立的结论：心跳最快 60 秒一次；
定时轮次不经过 `carryover`，所以拿不到跨轮摘要。

## D-067 — 心跳轮次：摘要写进 prompt、上一轮未闭合就跳过、BLOCKED 达阈值就带摘要停（2026-11-18 · heartbeat）

- **Status:** CONFIRMED（判定逻辑与 14 条测试为本地实测；真机投递 `NOT_RUN`，见「边界」）

**背景**：RSI 循环要无人值守地继续，而「谁来推下一轮」有现成答案——一条定时任务（心跳）。A24 已经把
投递事实测清了：定时消息带 `source.kind = "schedule"`，本插件 gate 让它直通，`carryover` 不覆盖它，
所以心跳轮次既不会自动跑 workflow，也拿不到跨轮摘要。剩下四个必须做的选择是本文的范围。

**选择一：上一轮的摘要由 prompt 自己携带，不改 carryover。** 心跳模板里 `{{LAST_ROUND_SUMMARY}}`
由守卫从 `.rsi/STATE.md` 头、`.rsi/ledger.jsonl` 末行、`HANDOFF.md` 最新标题、`.rsi/ROUND.md` 尾段
拼出。备选是把 `schedule` 轮次也纳入 `carryover`——被排除：那摘要的语义是「本会话此前的轮次」，而循环
的连续性按**仓库记录**算，会话归档既可能被 compaction 截断，也会把心跳自己写进去形成自指。

**选择二：上一轮未闭合就 `SKIP`，不开新一轮。** 「未闭合」= 尾部 `## Round N` 段没有
`- **status:**`，或报告/台账互不对应，或有 tracked 改动。备选是「接着把上一轮做完」——被排除：
PROTOCOL 的一轮一主题不允许两个主题共用一份报告，而且「把别人的半成品改完」正是 Git 里最容易
把未验证改动当已验证提交的动作。跳过只花一次心跳，不花一轮。

**选择三：连续 3 轮 `BLOCKED`（或同一未闭合信号被跳过 3 次）就带摘要停。** 阈值来自
`DEFAULT_LOOP_FAIL_STREAK = 3`；`--max-rounds` 默认 **0（不设上限）**，因为插件的
`DEFAULT_LOOP_MAX_ROUNDS = 10` 属于它的 repeat-run 面，拿来卡本循环会在第 11 轮把它停掉——那是
一个安静的错误。备选「不限次数地跳过」被排除：60 分钟一次的心跳在无人处理时正是最贵的形态，
停必须是一次能被看见的事件，所以停的时候要打印摘要（轮次、主题、code、人的下一个动作）。

**选择四：默认 60 分钟。** DSH 的投递下限是一分钟（`docs/user/guide/schedule.md:24`），排队中/运行中
的投递会被拒绝或合并（`:53`），重启后只补最近一次（`:80`）。60 分钟既不触发合并，也让一轮
（自测 + 写记录）有时间落地。

**边界（本轮不做的事）**：不实现循环——没有新的 `setInterval`、没有嵌套 workflow、没有改 `src/`；
不创建定时任务（D-066 ①）；不在日志里写文件内容（守卫只写 verdict/code/计数）。`finish-round.py`
只会记 `OK`，所以 BLOCKED 轮次的两处手写（ROUND.md 的 `- **status:** BLOCKED` 与 ledger 的
`"status": "BLOCKED"`、`tag` 为空）写进了模板，缺一处守卫就判未闭合。

**代价（明确接受）**：① 跳过意味着「上一轮没闭合」会以一次心跳的空转形式暴露，而不是被自动修掉——
这正是想要的可见性；② 阈值停会让循环在真正卡住时彻底停下、需要人来重启，比「一直重试」少烧额度；
③ 摘要限行（18 行 + 末行台账 + 标题）意味着极长的轮次只能被部分引用，但 prompt 要求本轮先去
读 STATE/LOG/HANDOFF 原文，摘要不是唯一信息源。

**失效条件**：若将来 `carryover` 明确覆盖 `schedule` 轮次，选择一应被新条 supersede；若
`finish-round.py` 学会记 `BLOCKED` 并打标签，选择三里的「两处手写」段落应删去而不是留着。

**证据索引**：`docs/knowledge/RESEARCH.md` A25（判定优先级、tracked-only 判据、`status: OK` 写死、
`--prompt` 纯读、60 分钟三条文档依据）；实现 `.rsi/HEARTBEAT.md`、
`.rsi/tools/heartbeat-guard.sh`、`test/heartbeat-guard.spec.ts`（14 条）。


## D-068 — 操作者授权：先落 P4 的续跑面，再回头做 P3 的两条 UX（2026-11-18 · 顺序授权）

- **Status:** CONFIRMED（授权来源是本轮任务文本；被授权的工作已在本轮落地并可复核。本条只记录
  **顺序**，不记录任何质量门的放宽）
- **决策类型:** 顺序 / 授权边界

**背景**：本轮开始时在册的待办只有两类——P3 的两条 UX（P3-01 设置页逐路由上限与死线字段的文案、
P3-02 进度页「没有报告事实的成员」详情行），以及续跑（repeat-run）面。续跑在
`.rsi/incoming/github-demand-audit-2026-11-18.md:92` 的分级里属 **P4**（原话：
「**P4** deferred by explicit decision or blocked on an external surface」）：它要 Host 的 Schedule
服务才能存在，而本插件不拥有、也不能替宿主实现那条能力（AGENTS.md 禁止 fork DSH 的循环与生命周期）。
按 `.rsi/PROTOCOL.md` 第 2 条的优先级（P0 > 文档/版本 > 测试 > UX > **新功能** > 删减/重构），
P3-01/P3-02 本应先做，续跑这一条本应排在它们之后。

**选择**：本轮**先做 P4 的续跑面，P3-01/P3-02 保持 OPEN**，并在 `.rsi/STATE.md` 的待办池里保留原编号
与状态，不因本轮落地而改写它们的优先级。

**授权**：顺序由操作者通过本轮任务文本显式授权（任务标题「Docs changelog memory update and release」、
目标「Write bilingual README and CHANGELOG, record P4-before-P3 operator authorization in DECISIONS,
refresh STATE/HANDOFF/VALIDATION, then commit push and tag」）。授权的**范围只有顺序**：

- 它没有放宽任何质量门：`npm run ci` 全绿、逐条证据、双语 CHANGELOG、README 中英同步、
  不移动/不覆盖已发布 tag、不发布 npm——全部照旧（本轮执行结果见 `.rsi/ROUND.md` Round 14）。
- 它没有把 P3 判为不需要，也没有授权跳过 P3：两条仍在池里，编号不变。
- 它没有授权「以后都按这个顺序」。下一轮若没有新的顺序授权，`PROTOCOL` §2 的默认优先级重新生效。

**为什么不选另一条路（先做 P3-01/P3-02）**：本轮任务已经点名要落续跑面，而续跑面的代码、测试与
研究记录（`src/loop.ts`、`src/loop-surface.ts`、`test/loop.spec.ts` 27 条、`test/loop-surface.spec.ts`
13 条、`docs/knowledge/RESEARCH.md` A24/A25、DECISIONS D-066/D-067）已经在本轮之前的同一棵工作树里
写完且未提交。把它们晾着、转去做两条 P3 文案，会让「已验证但未提交」的改动继续压在树上——那正是
`.rsi/tools/heartbeat-guard.sh` 判 `dirty-tracked` 的原因，也是 AGENTS.md「结束时留下 working state」
要避免的形态。第三条备选「拆成两轮、先提交代码再补文档」被排除：发布纪律要求用户可见变更与它的
CHANGELOG/版本在同一次发布里（AGENTS.md「Release and version discipline」）。

**代价（明确接受）**：P3 的两条 UX 缺陷多存在一个发布周期；续跑面先落地意味着它的文档必须先写好
（本轮 README 两语种新增「Repeat runs」一节，就是为了不让「代码有了、说法没有」成为新的 P1 文档缺陷）。

**失效条件**：操作者若改为「P3 优先」，本条应被新条 supersede；本条不构成对之后任何轮次顺序的约束。

**证据索引**：分级定义 `.rsi/incoming/github-demand-audit-2026-11-18.md:92`；协议优先级
`.rsi/PROTOCOL.md` §2；P3 两条的原编号 `.rsi/STATE.md`「Pool」；本轮落地与门禁
`.rsi/ROUND.md` Round 14、`.rsi/evidence/round-014/`。

## D-069 — 续跑面归谁：一行 Schedule、用户才能开、上限靠 `COUNT`、关闭靠删除（2026-11-18 · round 14）

- **Status:** CONFIRMED（服务语义、路由与工具的 40 条测试为本地实测；真机投递 `NOT_RUN`，
  没有创建任何定时任务）

**背景**：四个 `loop*` 键自设置面落地起就「存着但没人读」。把它们接上一个驱动时，有四个
DSH 不会替我们决定的问题：**归谁**（定时器由谁持有）、**谁能开**、**什么数量算停**、**关闭是什么**。
本轮把它们一次定死，以免下一个人按自己的直觉补出第二套语义。

**选择一：归 Host 的 Schedule，本插件不持有 timer。** 一条循环 = 一条 `rrule` 任务（标题
`Loop heartbeat`、文案前缀 `[grok-workflow loop]`、目标 `session` = 本会话）。理由：AGENTS.md 的
「No ownerless background work」与「不得重实现 DSH 生命周期」；DSH 的 Schedule 已拥有持久记录、
timer、准入、投递、补投与归档策略。`src/loop.ts` 因此只有 `create`/`catalog`/`edit` 三个调用，
不开任何 interval。备选「插件自带一个 setInterval 驱动」被排除：它会在宿主之外多出一个没人拥有、
也无法被 Automation tasks 页看见的定时器。

**选择二：只有用户能开。** 判定不是权限字符串，而是 DSH 自己的调用形态：浏览器请求不带
`actorSessionId`，工具的 `execute` 一定带。于是 `open(request)` 对任何**已定义**的 actor 抛
`loop/user-only`，路由（`POST /grok-workflow/loop`）不带 actor 所以能开，`grok_loop` 工具的
`open` 在设计上被拒绝，只留 `status`/`close`。备选「让模型也能开」被排除：那等于让被投递出来的
那一轮给自己续命，循环将没有外部主人（与 D-066 同一条理由的另一种形态）。

**选择三：停靠三样东西，只有一样是宿主强制的。** ① 轮数上限写进 RRULE 的 `COUNT`——调度自己结束，
行留 `ended`，下次 open 替换；② 连败轮数是文案里的指令，因为投递回执只证明收件箱写入、不证明这一轮
做成了，所以不假装有计数器；③ 间隔取 `max(60, ceil(timeoutMs/60000), loopIntervalMin)` 并封顶七天，
`loopIntervalMin` 只能抬高下限（`0` = 用下限，不是「立刻」）。备选「插件自己记账失败轮数」被排除：
它必须从投递回执推断成败，那是猜测而不是事实。

**选择四：关闭 = 删行，不是暂停。** 暂停的行仍是一条存着的心跳，仍需要一个主人；卸载时
`stopAll`、会话停止/归档时 `forgetSession` 都会删掉自己拥有的行，删除被宿主拒绝时只记 warn，
不把它报成干净的关闭。备选「关闭 = `active: false`」被排除，理由同上。

**一条必须写明的现状（不是选择，是事实；已被 `D-072` / round 16 supersede）**：本轮（round 14）落地时，
本仓库的客户端 bundle 只渲染设置页的四个字段，**没有任何已发布的 UI 代码去调那条路由**
（当时 `grep -rn "grok-workflow/loop" src/` 只有一处命中：`src/loop.ts:56` 的常量；路由注册在
`src/loop-surface.ts:125` 引用该常量，`src/client/index.js` 没有任何 `fetch`/路由调用点）。所以当时
的用户可达路径就是那条 POST；输入框旁的开关是**未实现的后续工作**，README 与 CHANGELOG 因此都不写
「已有开关」。**这一段在 round 16 失效**：composer dock 里的开关已经落地并被测试钉住，见 `D-072`。

**代价（明确接受）**：① 用户要打开循环得走一条 API 请求，直到那个控件出现；② 连败停在宿主侧不可
强制，只能靠文案，模型不遵守就不会停——轮数上限是唯一的硬止损，所以它必须存在；③ 删行意味着
「暂停一下」不提供，重开就是重新算锚点。

**失效条件**：DSH 若给 Schedule 增加「失败轮数」或「投递结果」的持久字段，选择三的 ② 应被新条
supersede，而不是就地改成计数器；客户端出现真正的开关控件时，本条「现状」一段应删去并指向那条
控件所在的轮次。

**证据索引**：`src/loop.ts`（策略、规则、行选择、清理）、`src/loop-surface.ts`（工具 + 路由 +
生命周期）、`test/loop.spec.ts`（27 条）、`test/loop-surface.spec.ts`（13 条）、
`test/heartbeat-guard.spec.ts`（14 条，守卫侧）、README「Repeat runs」、CHANGELOG `[Unreleased]`。

## D-070 — `v0.11.14` 的发布事故用 `0.11.15` 这个 patch 版本收口，不移动标签、不手工补 Release（2026-11-19 · round 15）

- **Status:** CONFIRMED（远端标签/Release/CI 状态为 `git ls-remote` 与 `gh` 实测；新标签的 Release
  由既有 release 工作流产生，结果见 `.rsi/ROUND.md` Round 15 与 `VALIDATION.md` Round 61）

**背景**：round 14 推出 `v0.11.14` 后，标签提交 `20eafea` 的 `lib/` 落后于它的 `src/`
（`git show 20eafea:src/loop.ts | grep -c callSchedule` = 12，`…:lib/loop.js` = 0），远端 CI 红
（run `44345615218`），Release 工作流在 `Verify committed build artifacts` 失败（run `44345622700`），
因此该标签**没有 GitHub Release**，也没有产出任何压缩包。标签已在远端公开。`main` 上的 `8c8e367`
只重建了构建产物并把远端 CI 转绿（run `44349708692`），那修好的是 `main`，不是那个已发布的标签。

**四个备选**：

1. **移动/重打 `v0.11.14`**（`git tag -f` 加强推）——被 AGENTS.md「Never move or overwrite a published
   tag」与 PROTOCOL 红线直接禁止；已被他人 fetch 的标签会分叉，且无法证明本地历史就是别人看到的那个。
2. **`workflow_dispatch` 重跑 Release**——它 checkout 同一个不可变提交，会在同一步（构建产物检查）
   再失败，不产生任何修复。
3. **`gh release create v0.11.14` 手工补一个 Release**——会发布一个**不是它源码构建**的产物，等于绕过
   发布门禁，并让 README/CHANGELOG 里「这个版本带续跑面」的说法变成假的。
4. **从 `main` 打一个 patch 版本（本次选择）**——新标签、重跑全部门禁、Release 由既有工作流创建；
   `v0.11.14` 保持原样，并在两份 README 与 CHANGELOG 里写明它不是发布版本、安装请固定 `v0.11.15`。

**授权**：本任务（`docs_release_memory`，attempt 2）的目标与约束要求「commit push and tag via R6 flow
without forcing or moving old tags」「patch/minor tag only per rules」，并把上一轮遗留的发布失败收口；
据此把**一次 patch 发布**视为本任务范围内的授权。范围：一个 patch 标签 + 由既有 release 工作流创建的
GitHub Release。**不包含** npm 发布、不包含移动/删除任何标签、不包含修改 `.github/` 的发布门禁或
放宽 CI；若门禁再次红，本轮只记录失败，不改门禁。

**代价（明确接受）**：发布线多一个 patch 版本；`v0.11.14` 这个标签会长期存在但没有 Release，而 README
的「已发布」列表由 `git tag` 生成、无法把它摘掉，所以两份 README 都在那一句后面补了「它不是发布版本、
请用 `v0.11.15`」的说明，并让 `docs-version` 守卫继续覆盖这个列表。

**失效条件**：若操作者要求「不要为构建产物单独发版」，本条应被 supersede，改为在下一轮功能版本里
带上修复（`v0.11.14` 依然没有 Release，README 的说明继续有效）。

**证据索引**：`gh run list`（CI `44345615218` failure、Release `44345622700` failure、`8c8e367` CI
`44349708692` success、`b0d6d10` CI `44351065108` success）；`gh release view v0.11.14` → release not
found；`.rsi/evidence/round-014/lib-stale.txt`；本轮发版结果 `.rsi/ROUND.md` Round 15、
`.rsi/evidence/round-015/`。

## D-071 — 预设缺口在续跑面之后怎么落：仍选「用户拥有第一跳」，方案②（提示切预设）被排除（2026-11-19 · preset gap · round 14 之后）

- **Status:** CONFIRMED（代码与 DSH `0.2.2-rc.3` 安装内的预设文件、工具源码、用户指南逐条实测；
  真实 Web GUI 与真机心跳投递 `NOT_RUN`——本轮没有创建、修改或删除任何定时任务）

**背景**：D-066 面对的问题是「跑循环的会话往往是最省的 `minimal`，它没有 `schedule_*`，谁来建第一条
心跳」，当时给了两个方案并选了 ①（操作者在有能力的环境里手动建第一条心跳），排除 ②（打开循环开关时
先提示切到带 `schedule_*` 的预设）。round 14（`20eafea`）把续跑面落了地，① 的执行面因此变了：
用户在浏览器 POST 一条路由，插件的 LoopService 用 **Host 的 Schedule 服务**建那行任务，**不经过任何
会话的 `schedule_*` 工具**。于是同一个问题要在现树上重答一次——目标会话是 `minimal` 时，第一跳归谁、
由谁执行、缺工具时说什么。本条只回答这三问，不改 D-066 的选择本身（它的失效条件未被触发）。

**选择：方案①——第一跳归用户，循环会话永远不是创建者。** ① 现在有两种执行形态，都属 ①：

1. 在 Automation tasks 页「Create manually」手动建；新建会话「uses the default preset」
   （`docs/user/guide/schedule.md:30`），天然是有能力的那一档。
2. 用户（或其浏览器里的一个请求）POST `POST /grok-workflow/loop`（`src/loop.ts:56` 的
   `LOOP_ROUTE_PATH`）；插件在**自己的挂载作用域**里 `ctx.get('schedule')`（`src/loop.ts:495-500`）
   拿到 Host 服务后 `service.create(...)`（`src/loop.ts:401-406`）。

两者的共同点不是「在哪儿点」，而是**动手的是用户**：`open` 对任何已定义 actor 抛 `loop/user-only`
（`src/loop.ts:354-359`），所以模型、子代理、以及被投递出来的那一轮都不能给自己续命。
D-066 里的「手动建」应读作「用户动作」，不是「必须去 Automation tasks 页面」——那是 ① 在
round 14 之前的唯一形态，不是它的定义。

**方案②「打开循环开关时先提示切到带 `schedule_*` 的预设」被排除**，四条理由：

1. **它解决的不是真正的问题。** 建行的是 Host 的 Schedule 服务，不是 `schedule_*` 工具；工具只在
   挂载作用域里注册（`dsh-tool-schedule/src/index.ts:4`：「a preset decides which agents receive
   them」），而插件是通过服务查找建行的。切预设换来的能力，插件用不上——② 让用户先做一次迁移，
   去做一件插件已经能做的事。
2. **插件改不了预设。** 预设决定哪个作用域被注册（同上），本仓库只能通过 bundle patch 挂载自身，
   AGENTS.md 也禁止改 DSH core。所以 ② 的「提示」永远只是提示，最终动手的仍是人——比 ① 多一道拒绝，
   没少一次人工。
3. **② 的失败态是 ownerless。** 开关显示 ON，而没有任何人能建、能读、能停那条心跳，与 AGENTS.md 的
   「No ownerless background work」直接冲突；① 的失败态是「没建」，那是一眼能看见的。
4. **① 可审计。** Automation tasks 页跨会话列出全部任务，可创建、编辑、运行、暂停、恢复、删除；
   ② 把「能不能调度」变成会话的一个属性，在事件流里查不到。

**循环会话不得被假设能建定时任务**（`schedule_*` 缺失时，任一条成立即不得假设）：

- (a) `minimal` 预设既无 `tool-schedule` 也无 `time-context`：DSH `0.2.2-rc.3` 的
  `dsh-web-app/presets/minimal.patch.yml`（78 行）只有 persona / tool-fs / compaction / persistent-shell
  四组，`grep -cE "schedule|time-context"` = **0**；`presets/standard.patch.yml` 的 `time-context` 在
  :19、`tool-schedule` 在 :38，`cordis`/`ptc` 同档（`docs/user/guide/schedule.md:22`）。
- (b) 委派子代理即使预设暴露了这四个工具也会被拒（`dsh-tool-schedule/src/index.ts:292` 的注释与
  :307 的 `subagent_session` 拒绝）。
- (c) 没有 `time-context` 就没有当前时间与浏览器时区，模型连「下一次什么时候」都不该猜。

正确行为是**报缺口并停**：有 `grok_loop` 时报「缺心跳 / 心跳到期」，没有时报「我建不了，请用
Automation tasks 或那条路由」，然后停下——不换说法假装建好了，也不把「开关 ON」说成「循环在跑」。

**UX 影响**：

- 目标会话是 `minimal` 时，用户用那条 POST 打开循环**看不到任何预设相关的提示**——没有「请切换预设」
  对话框，也没有「已开启」的假确认。成功就是那行任务真的出现在 Automation tasks 里；失败是明确的码：
  无 Schedule 服务 → `loop/unavailable`（HTTP 503，`src/loop.ts:331`、`src/loop-surface.ts:315`），
  宿主拒绝 → `loop/schedule-refused`（`src/loop.ts:345` 的 `callSchedule` 包装）。
- 会话缺工具不影响第一跳，但影响**会话自己读/停**那行任务：`grok_loop` 只有 `status`/`close`，
  且只在插件被挂载、Host 组合了 Schedule 时注册（`src/loop-surface.ts:123`）；本条不断言它在
  `minimal` 会话里一定可见，只断言它**不能 open**。
- 客户端的开关控件在 round 14 时还没有（D-069「现状」段）：当时的用户可达路径就是那条 POST。
  round 16 已把它补上（composer dock，`conversation.composer.dock`，id `grok-workflow-loop`），
  见 `D-072`；它发的仍然是同一条 POST，所以本条「打开只走浏览器请求」的判断保持不变。

**实现影响**：

- 插件不注册 `schedule_*` 工具、不注入、不 patch 任何预设；只做服务查找（`scheduleServiceOf`，
  `src/loop.ts:494-500`），查不到就 `loop/unavailable`，插件其余功能照常加载。
- 建行必须带 `target: { kind: 'session', sessionId }`（`src/loop.ts:401-406`），目标就是收到心跳的
  那个会话；因此目标会话的预设与「能不能建」无关。
- 将来若真的加一个 UI 控件，它也只能发那条 POST，**不得**给模型补 `open`——否则 ① 的所有权当场失效
  （与 D-069「选择二」同一条理由）。

**代价（明确接受）**：① 让无人值守的启动多一步人工动作，表面上与「无人值守」相反；但那一步恰好是
唯一能被看见、能被撤销的一步。② 的「顺滑」是错觉——省下的那次点击，会在第一次心跳缺失时以
「循环静默停摆」的形式还回来，而停摆时没有日志、没有报错，只有一份写着 ON 的开关。

**失效条件**：若 DSH 将来给 `minimal` 加上 `tool-schedule` 与 `time-context`，(a) 失效；若 DSH 允许
第三方 bundle 修改他人预设，② 的第 2 条理由失效。两种情况都应新开一条 supersede 本条（以及 D-066），
不就地改。

**证据索引**：`src/loop.ts`（`LOOP_TASK_TITLE`、`LOOP_ROUTE_PATH`、`open` 的 user-only、
`service.create`、`scheduleServiceOf`、`loop/unavailable`、`loop/schedule-refused`）、
`src/loop-surface.ts`（工具与路由注册、503 映射）、`src/gate.ts:472-477`（心跳不是用户消息，
`non-user-source` 直通）、`README.md:246-268`（Repeat runs）、DSH `0.2.2-rc.3`：
`presets/minimal.patch.yml`、`presets/standard.patch.yml:19,38`、`dsh-tool-schedule/src/index.ts:4,292,307`、
`docs/user/guide/schedule.md:22,30,62`；前一条 D-066（方案二选一的出处）、D-069（续跑面归谁）。

## D-072 — 续跑的开关放进 composer dock，停 = 拒绝并删行；预算与「失败轮」的定义写进模块而不是留给读者猜（2026-11-19 · round 16）

- **Status:** CONFIRMED（代码、测试与本机门禁实测；真实 Web GUI 点击与真机心跳投递 `NOT_RUN`——
  本轮没有起 DSH 实例，也没有创建、修改或删除任何定时任务，与 D-066 一致）

**背景**：round 14 落地的续跑面只有一条 `POST /grok-workflow/loop`（`D-069`），round 15 把它作为
`0.11.15` 发布出去；当时 D-069 明确写了「客户端没有控件」是**现状**而不是选择。round 16 把那个控件
和「提前停」两件事一起做掉，本条记录三处归属选择：开关放哪儿、停是什么、以及两个会被人误读的量。

**选择一：开关进 `conversation.composer.dock`，不进设置页。** 设置页的四个 `loop*` 键是**部署**配置
（存下、校验、投影），而开关是**这个会话这一次**的动作；把两者放进同一个面板，会让「存了一个默认值」
和「现在开了一个循环」看起来像同一件事。dock 是会话作用域的，平台自己声明的槽位是
`{ kind: 'list', scope: 'session' }`，`sessionId` 由会话插件按 `SessionStandardProps` 注入
（`src/client/index.js:3730-3743`，id `grok-workflow-loop`、order 90、注册是**追加**的，替换任何既有
控件都不做）。备选「设置页加一个按钮」被排除：设置页是 profile 级、跨会话，按错了会替别的会话开循环。

**选择二：开关不带数字。** 点击只发 `open` / `close` / `status`，规则永远按**存下来的**
`loopIntervalMin`、`loopMaxRounds`、`loopFailStreak` 生成（`src/client/index.js:3527` 的路径常量，
与 `src/loop.ts` 的 `LOOP_ROUTE_PATH` 同源，`test/client.spec.ts` 把两边钉住）。备选「开关自己收一组
数字」被排除：那等于在 UI 里再实现一次策略，两套数字迟早不一致。拒绝的点击**不翻面**：403
（`loop/user-only`）、503（`loop/unavailable`）、非 JSON 回答分别显示原因，状态停在最后一次已知值。

**选择三：停 = 拒绝这一步 + 删掉那行，不是暂停。** 沿用 D-069 选择四的理由：暂停的行仍是一条
存着的心跳，仍需要一个主人。`src/gate.ts:1541-1575` 在 `agent/pre-step` 上先分类：`loop-stop` 时
`await loop.stop(...)` 删行**再** `{ kind: 'reject' }`，所以那一轮零次模型调用，且下一次到点不会再回来。

**选择四（本条的实质）：刹车的输入全部是已存在的事实，不新增 timer / 队列 / 计数器。**
`src/loop-brakes.ts` 每次心跳只回答「继续还是停」，依据是：操作者停止文件（`.rsi/STOP`，可用
`GROK_WORKFLOW_STOP_FILE` 改位置，`:52`/`:55`）、插件已被卸载（`ActiveState.disposed`）、连续多少轮
没写出助手消息、当天已放行轮数（上限 24，`:58`）、token 预算（每轮预留 200 000，上限 2 000 000，
`:67`/`:70`）、当天第一轮以来的耗时。这些数从会话自己的记录里读回（`plugin:grok-workflow/loop-round`，
`:210`），所以 Host 重启后仍然算得清。备选「进程内计数器」被排除：它随进程一起消失，重启即失忆。

**两个量必须写清定义，不许读者猜**（写在模块头部，不是只写在文档里）：
① token 是**预算不是计量**——没有任何用量记录能在 `pre-step` 拿到，所以按固定预留扣，它约束「最多能花
多少」，不声称等于账单；
② 一轮「失败」的定义是**没有写出任何助手消息**——写出错误报告的一轮不算失败，这个刹车是给静默停摆
用的，不是给「产出内容不合我意」用的。

**代价（明确接受）**：① 开关只能在浏览器里点，无人值守仍然需要一次人工动作，这正是 D-066/D-071 的
选择；② token 预算偏保守（预留 20 万/轮），长期循环会先撞预算而不是先撞账单；③ 失败轮靠「有没有写出
助手消息」判断，一轮写了半句然后卡住仍算成功，这个误差被显式接受而不是被掩盖。

**失效条件**：若 DSH 的 `pre-step` 或会话记录将来能提供每轮真实用量与结局，选择四的 ①② 两条应被新条
supersede（改成计量与真实结局），而不是就地把注释改一改；若平台把 `conversation.composer.dock` 改成
`single` 槽位或取消 `sessionId` 注入，选择一的挂载方式必须重做。

**证据索引**：`src/client/index.js`（`:260-262` 文案键、`:3527-3530` 路径/id/order、`:3665-3718` 组件、
`:3730-3743` 注册、`:3935` 挂载、`:4115-4120` 导出面）、`src/loop-brakes.ts`（整篇，含 `:52`/`:55`/
`:58`/`:67`/`:70`/`:210`）、`src/gate.ts:1535-1575`（刹车在 gate 里的唯一入口与 `loop-stop` 的处理）、
`src/loop.ts:303`（`COUNT` 写进规则）、`test/client.spec.ts`（92 条，含「只挂 dock、追加、不碰
model selector」）、`test/loop-brakes.spec.ts`（35 条）、`test/loop-runtime-wiring.spec.ts`（5 条，
真 Loader + 记录型 Schedule）、README「Repeat runs」的 *The dock switch* 段、`docs/LOCAL-TESTING.md`
「Repeat runs (the composer switch)」节、CHANGELOG `[Unreleased]`。

## D-073 — 真机投递把心跳标记包进 `reminder_prompt_json`，识别按嵌入判；设置面说法统一为 11/13（2026-11-19 · round 17）

- **Status:** CONFIRMED（round 17 真机证据 + 回归测试；改动已落地，未发版）
- **背景**：round 17 的 `heartbeat-live` 片在隔离实例里跑通了 open→投递→turn→close 全链，
  但 Q5 判了 CONTRADICTED：真实投递的文本是 DSH 的包装
  `[SCHEDULE REMINDER] … reminder_prompt_json: "[grok-workflow loop] …"`，
  而 `isLoopHeartbeat` 只认文本开头，导致真心跳掉进 `non-user-source` 直通，六道刹车一次没跑。
  同一轮的 `install` 片另发现 F1：13 个 accepted 键 vs 11 个投影键，
  但 `src/config.ts:199` 注释写“settings page exposes 13 keys”、
  `describeSurface` 报 “13 field(s)”、`src/client/index.js:4` 写 “21 volatile fields”——三处各说各的。
- **选择一：识别按“开头或嵌入”判，不动双因子。** `isLoopHeartbeat` 接受两种形状：
  文本开头即 marker，或包含 `reminder_prompt_json: "[grok-workflow loop]`。
  `source.kind === 'schedule'` 的配对要求不变（`src/gate.ts:533`），所以用户在聊天里粘贴
  marker 仍不会被当成心跳。备选「gate 里拆 `reminder_prompt_json` 再判」被排除：
  识别是 `src/loop.ts` 的职责，gate 只配对；拆 JSON 会引入解析失败面，而子串判定的误判
  已被 source 配对封住。
- **选择二：设置面说法统一为“13 接受、11 投影”。** `describeSurface` 报
  `11 of 13 field(s) on the page`；三处注释同步；`test/config.spec.ts` 与
  `test/reliability.spec.ts` 的计数断言改成显式新文案（原来恰好包含 “13 field(s)”
  子串，是巧合通过，不是诚实钉住）。备选「把 `toolName`/`configVersion` 改成 volatile」
  被排除：那是行为变更（多两个可编辑控件），且 `test/settings-projection.spec.ts`
  已把 11 键投影钉死，改那边等于改契约。
- **代价**：`isLoopHeartbeat` 现在依赖 DSH 的包装字段名（`reminder_prompt_json`）；
  若将来 DSH 改包装，本函数需同步（回归测试用真实投递形状钉住，改包装会先红测试）。
- **证据索引**：`.rsi/evidence/round-017/heartbeat-live/results/00-verdicts.md` Q5、
  `results/schedule-delivery-message.json`（真实投递原文）、`test/loop.spec.ts`
  （framing 用例）、`test/gate.spec.ts`（`heartbeat classification` 2 条）、CHANGELOG
  `[Unreleased]` Fixed 两条。

## D-074 — 常驻并行监护：run 侧 guardian 与串行 supervisor 正交（2026-11-19）

- **Status:** CONFIRMED（已发版 `0.11.17`：`test/guardian.spec.ts` 12 条；
  `npm run ci` 63 文件 / 1154 测试 PASS；tag `v0.11.17` 从 GitHub 装到隔离
  profile 验证 PASS，见 VALIDATION Round 63 与 `.rsi/evidence/round-018/install/`）
- **Date:** 2026-11-19
- **Decision:**
  1. 新增 `src/guardian.ts`（`createRunGuardian` + 实例级 `UnloadRegistry` 复刻
     checkpoint 模式）：run 启动前创建、adopt 时绑定 live run id 并重放
     pre-adoption 缓冲、单个 `unref()`ed `setInterval`（1s）只在
     adopt→finish/dispose 之间存在；只订阅 `ctx.on('workflow/agent-start' /
     'agent-end' / 'end')`，从不调用 `agent()` hook——零模型调用、零新角色。
  2. 卡住判定走 `guardianChildBudgetMs(timeoutMs)`：`min(deadline, 600s)`，
     低于 5s 或 `timeoutMs: 0` 则 disarm；超时（child 无 end）与心跳丢失
     （整 run 静默）任一即 firing，每 run 最多一次 `run.cancel()`，后续只记账
     （`maxFindings: 32`）。
  3. 结算在 `run.ts finally` 最先：findings 以
     `{ phase: 'Guardian', category: 'cancelled' }` 追加进 `lastReport.errors`，
     不改 status；卸载经 `disposeActiveState` → `unloadRunGuardians(state)` 与
     run 取消同一批 disposal，无残留 timer/listener/registry。
  4. 串行 `supervisor` 语义不变（D-056）：verify 之后、synthesize 之前、只能 fail
     不能 pass；`src/script.ts` 零改动。guardian 回答「活没活」，supervisor 回答
     「对不对」——两者正交。
- **Reason:** 用户要求监督是常驻并行监护者：run 一开始就在线、盯每个子代理的
  存活、卡住能处理（取消/标记/汇总原因）。串行环节只能在 attempt 结束后判失败，
  看不见 hang 住的 worker——并行 guardian 补的正是这个盲区。
- **Evidence:** `src/guardian.ts`（模块头约束表）、`src/run.ts`（创建/订阅/adopt/
  finish 折叠/unload 四处接线）、`test/guardian.spec.ts`（状态机 3、stall 处理 5、
  卸载清理 4，含 run 级并行存在用例）、`docs/knowledge/RESEARCH.md` A29、
  `docs/ARCHITECTURE.md` 执行设计节新增段。
- **Alternatives rejected:**
  1. 在 script 里加心跳 child（guest 看不见 hang，hang 占住 worker 池且无事件；
     且每个心跳都是模型调用，违反零成本与 bounded 上限）。
  2. 在 gate 里做监护（gate 只有 pre-step 决策位，无 run 内持续观察位；它的信号
     是调用者取消，不是子代理沉寂）。
  3. 杀单个 child 而非 cancel 整 run（`WorkflowRun` 无逐 child kill 句柄；进 engine
     杀等于第二套调度，违反架构约束）。
  4. guardian 改 status 或判 quality（与 D-056 串行语义冲突；status 仍由既有规则
     计算，guardian 只解释为什么停）。
- **Consequences:** 默认 60 分钟死线 → 每 child 600s 预算，恒早于死线 firing；
  `timeoutMs: 0` 的运行 disarm（显式不限时不被 second-guess）；空 supervisor 链的
  运行仍有并行监护（两者独立开关）。

## D-075 — 载入期路由校验覆盖「每个被路由的角色」，`supervisor` 不再豁免（2026-11-19 · round 19）

- **Status:** CONFIRMED（`src/settings.ts` 的 `ROLE_ORDER` 五角色；`test/config.spec.ts`
  新增「checks every routed role, the supervisor included」；红→绿见
  `.rsi/evidence/round-019/red-spec-run.txt` / `green-spec-run.txt`）
- **Date:** 2026-11-19
- **Decision:** `src/settings.ts` 的 `ROLE_ORDER` 由
  `['planner','worker','verifier','synthesizer']` 改为
  `['planner','worker','verifier','supervisor','synthesizer']`（与 `src/report.ts`
  的 `ROLE_NAMES` 同序）。该常量有两个读者：`validateRoutes` 的逐路由目录校验，和
  2+ 条路由却全空 `maxInFlight` 的提示。漏掉一个角色等于同时豁免这两件事。
- **Reason:** `supervisor` 按任务、按 attempt 在**该任务的核验之后**跑
  （`src/script.ts:1945`，D-056）；综合（synthesizer）也在核验之后，所以「唯一在核验
  之后跑的环节」不是它的特征，「此前唯一没被载入校验覆盖的角色」才是。它的路由写错
  provider、或写了 provider 目录里没有的模型时，旧实现载入通过，直到那个任务的执行
  与核验孩子调用都付过费之后才失败——用户看到的是「活干完了却没被判」。README 与
  `docs/ARCHITECTURE.md` 当时都写「每个配置的路由都校验」，代码只校验四个角色：说法
  与实测冲突，按「记忆不覆盖实测」以实测为准。
- **Evidence:** 修前探针 `.rsi/evidence/round-019/probe-supervisor-route.mjs` 对五个角色
  各给一次错误 provider / 错误模型：planner/worker/verifier/synthesizer 各 1 条 error，
  supervisor 0 条（`probe-supervisor-route-RED.txt`）。修后同一探针五角色各 1 条
  （`probe-supervisor-route-GREEN.txt`）。spec 级红→绿：只 stash `src/settings.ts`
  时 `test/config.spec.ts` + `test/route-concurrency.spec.ts` = 2 failed / 49 passed，
  恢复后 51 passed。
- **Alternatives rejected:**
  1. 只在校验错误里补一句 supervisor 特例（把豁免写进注释）——等于承认「文档说全查、
     代码只查四个」，仍然让错配置跑到最后一步。
  2. 在校验处额外维护第二份角色表——两份表必然漂移，`ROLE_NAMES` 与 `ROLE_ORDER`
     同序才是唯一的稳定做法。
  3. 只补 `supervisor` 的目录校验、不补空 cap 提示——同一常量同一循环，拆开改反而
     制造新的不一致。
- **Consequences:** 参数错误的 supervisor 链现在在载入期就被拒（fail-closed，与
  `validateRoutes` 自己的判据一致——只有**确定性**答案才拦载入：provider 在注册表
  里、模型在 provider 目录里，都属确定性答案）。真机上若某 profile 的 supervisor 链指向注册表外的 provider，
  该行现在会装载失败，而不是静默跑到那个任务核验之后才失败。
  **迁移**：把该路由改成已注册的 provider、已宣告的模型；或只把该路由的 `provider`
  留空——`validateRoutes` 把它当「继承 run 的 provider」，只校验模型 id
  （`src/settings.ts:211`）。**不要**把整条 supervisor 链删掉：空链等于关掉监督门
  （`src/script.ts:1945` 的 `length > 0`、`:2418` 的「No inherit fallback」），那与
  「行为不变」是两件事。

## D-076 — 诊断台账漏掉的 `supervisor`（2026-11-19 · round 20）

- **Status:** CONFIRMED（`src/delivery/index.ts` 角色表四改五；`test/delivery.spec.ts`
  新增 parity 守卫；红→绿见 `.rsi/evidence/round-020/red-spec-run.txt` / `green.txt`）
- **Date:** 2026-11-19
- **Decision:** `machineLedger()` 的 `Model routes:` 行由四角色
  `['planner','worker','verifier','synthesizer']` 改为五角色
  `['planner','worker','verifier','supervisor','synthesizer']`（与 `src/report.ts`
  `ROLE_NAMES`、`src/settings.ts` `ROLE_ORDER` 同序），并与 `renderReport` 的
  同行做逐行相等断言；同时 `MACHINE_DETAIL` 的角色赋值剥离正则补上
  `supervisor`。只做这两处：`Synthesis:` 双行标签（`rsi/round-8` 分支
  `644897b` 的第二改动）不在本轮范围内——它改的是用户可见的行标签，不是
  「漏掉角色」同一类问题。
- **Reason:** 与 round 19 同一类遗漏：载入校验修好了（D-075），但交付层的
  machine ledger 仍只渲染四个角色。有 supervisor 链的 run 在台账里读成
  「无监督」——`inherit` 在这里是「没配链」的意思，不是「省略显示」。这是一份
  durable copy（carry-over 回解析、`reportEnterText` 的机器面），说法必须与
  `renderReport` 同一种方言。
- **Reason（为什么 parity 断言，而不是只断言 `toContain`）:** 旧分支 `rsi/round-8`
  的 `644897b` 当年已经修过同一处（red 2 failed → green 14/14），但它从未合入
  `main`——`git merge-base --is-ancestor 644897b HEAD` 为空，那条分支的守卫也
  一起被遗弃了。这次不断言两行相等，下一次加第六个角色时还是同一出戏。
- **Alternatives rejected:**
  1. 只加 `supervisor=` 的 `toContain`（角色顺序漂移照样过，例如 supervisor
     跑到 synthesizer 后面——旧分支当年断言过顺序，这次保留）。
  2. 把 `Synthesis:` 也一起拆成两个标签（`644897b` 的第二改动；超出单轮单主题，
     且改的是用户可见行标签，应独立成轮并单独评估 carry-over 解析影响）。
  3. 把两个渲染点的角色表抽成共享常量（`delivery/index.ts` 头部设计约束：只做
     类型导入，运行时导入会打破「人话层零依赖」的隔离；parity 测试是既定做法，
     D-075 的 Alternatives (2) 也是同一结论）。
- **Consequences:** 有 supervisor 链的 run 在 ledger 里如实具名；无链时仍是
  `supervisor=inherit`（与 `renderReport` 一致）。`run.ts:141`
  `configRouteLabels` 仍是四角色——那是 C1 跨 run 忙闲提示的输入，不是本轮主题，
  留给下一轮按单主题处理。

## D-077 — checkpoint `durationMs` 按毫秒上限记，不按行数上限丢（2026-11-19 · round 22）

- **Status:** CONFIRMED（`src/checkpoint/wiring.ts:786` `countCeiling` 改 `msCeiling`；
  `test/checkpoint-wiring.spec.ts` 新增 48h 用例；红→绿见
  `.rsi/evidence/round-022/red-spec-run.txt` / `green.txt`）
- **Date:** 2026-11-19
- **Decision:** `snapshot()` 里 `time.durationMs` 的上限由
  `CHECKPOINT_LIMITS.countCeiling`（1e6，行数上限）改为
  `CHECKPOINT_LIMITS.msCeiling`（读侧 `schema.ts:624` 接受的同一上限），与读侧对齐。
  「超限则省略、永不截断」不变：写不下的时长仍然缺席，不写截断数。
- **Reason:** 写侧用行数上限卡毫秒时长，读侧用毫秒上限收：16 分 40 秒以上的 run
  （默认死线 60 分钟的 run 全在此列）写成功但没有 `durationMs`——恰恰是「跑了多久」
  这个唯一字段丢了。`POOL.md` R10 原文把因果写反了（说读侧卡 `countCeiling`），实测是
  写侧 `wiring.ts:786`，以实测为准。
- **Alternatives rejected:**
  1. 读侧也改 `countCeiling`（等于把 16m40s 以上的时长判非法，与 `msCeiling`
     接受 `timeoutMs` 到 `MAX_SAFE_INTEGER` 的设计矛盾）。
  2. 超限截断到上限（注释写明不截断的原因：截断数是 run 没跑过的时长，会撒谎）。
  3. 顺手修 `integrity.bytes` 的读写上限差（`schema.ts:59/:859`）——同一文件不同
     字段，超出单轮单主题，留给下一轮。
- **Consequences:** 超过 16m40s 的 run 首次记下真实时长；旧 checkpoint 里缺
  `durationMs` 的照常读（字段本来就是可选的）。`maxBytes`/`countCeiling` 的其它
  用法不动。

## D-078 — 提示词进门的拒绝一律双语且带实测数字；`/grok` 的参数是提示词入口，不是只认拼写（2026-11-19 · 会话入口加固）

- **Status:** CONFIRMED（`src/intake.ts` 新增；`src/command.ts` 非开关参数改走它；
  `src/gate.ts` `refusalOf` + 迟到目标走它；`test/intake.spec.ts` 新增 14 条；
  红→绿见 `docs/knowledge/evidence/prompt-intake-2026-11-19/red-full.log` 与
  `ci.log`）
- **Date:** 2026-11-19
- **Decision:** 入口拒绝文本只在一个模块里生成（`src/intake.ts`），并且
  ①英文一行 + 简体中文一行，永远两行都出；②写出实测字符数、上限、需要分成几段；
  ③写出下一步动作（拆分重发 / 去掉开头 `/grok` 重发）。`/grok` 的非开关参数按
  **形态**分档：单行短参数 = 拼写错误 → 一行 `GROK_USAGE_TEXT`（明确写出「这段文字
  没有作为提示词发出」）；多行或超 200 字符 = 被命令吞掉的提示词 → 带字符数的双语
  拒绝。开关语义（空/`on` 开、`off` 关、`setBy`、回读校验）逐字不动。
- **Reason:** 用户把存档任务提示词贴进新会话，会话毫无反应。实测根因不是长度
  （2 041 字符 / 3 697 字节，仅占 32 000 目标预算 6.4%，无截断），而是第一行以
  `/grok` 开头：`dsh-commands` `parseCommand` 把整行当命令，正文成了参数，旧语法
  只回一行 `Usage: /grok [on|off]` 就返回——没有 `user/message`、没有 `agent/pre-step`、
  没有 run，用户看到的等于静默。同一个「静默」也存在于门禁：超长/空消息的拒绝
  只有英文，读者既不知道上限也不知道收到多少。
- **Alternatives rejected:**
  1. 把 `/grok` 的未知参数直接当普通消息投递（命令 handler 拿不到「发送一条消息」
     的写入口，只能伪造 `user/message`——与 P0-5 的单一写入者纪律冲突，且会绕过门禁）。
  2. 只把门禁的拒绝翻成中文、不动命令（实测那三条真实失败根本没走到门禁，
     修了等于没修）。
  3. 无条件拒绝所有非开关参数（单行拼写错误会得到四行报告，噪音大于信息）。
  4. 把上限从 32 000 调大（问题不是上限；调大只会让「谁在拦」更难看出）。
- **Consequences:** 任何被入口拒绝的提示词都能在文本里核对「我发了多少、上限多少、
  下一步做什么」；`INTAKE_LIMITS.promptChars` 直接取 `TASK_LIMITS.objectiveChars`，
  一个数字只有一个含义（`test/intake.spec.ts` 钉住）。默认模板落到
  `docs/task-prompt-template.md`，由 `assembleTaskPrompt` 组装并用测试证明模板自己
  在预算内、且不以 `/` 开头。未覆盖：短于一行的提示词仍只得到一行明确拒绝（不测量，
  因为无内容可测）。

## D-079 — 心跳身份拆成两个谓词：路由看标记、存储看保留名；一个会话只留一行（2026-11-20 · 心跳隔离审计）

- **Status:** CONFIRMED（`src/loop.ts:292` `isLoopSlot` 新增，`isLoopTask`
  改为「槽位 + 标记」；`open()` 在刷新/恢复后调 `dropDuplicates`（`src/loop.ts:535`），
  删除被拒留下活行时改写该行（`src/loop.ts:502`）；`close`/`status`/`stopAll`/
  `deleteSessionHeartbeats` 改按槽位；`test/loop.spec.ts` 新增 4 条，红→绿见
  `docs/knowledge/HEARTBEATS.md` §5）
- **Date:** 2026-11-20
- **Decision:** 心跳的身份分两半，两个谓词各管一半，互不替代：
  `isLoopHeartbeat`（标记 `[grok-workflow loop]` + `source.kind==='schedule'`）是**路由**
  身份，只有门禁用它；`isLoopSlot`（保留名 `Loop heartbeat` + `rrule` + 目标会话）是
  **存储**身份，只有清理用它。清理不再要求标记，`open()` 会把标记写回它收回的那一行。
- **Reason:** 标记不是所有权证明，提示词是可改文本（DSH 自己的 `schedule_edit` 收
  `prompt`）。按标记清理时，一行被改掉标记就既刷不了也删不掉：它的投递按普通非用户消息
  穿过门禁（不进刹车、不进账），开关却在一条活行上显示「关闭」——这正是「一个心跳压住
  会话」的形态。反过来，按名字清理又必须保证别的心跳不被误删：RSI 自迭代任务的
  `RSI heartbeat` 行、任何别的名字或 `kind` 的行，两个谓词都不匹配（`test/heartbeat-identity.spec.ts`）。
- **Alternatives rejected:**
  1. 继续只按标记清理（D-069 的原文），另加「标记丢失即视为陌生行」——那会把一条仍在
     投递的行永久留在库里，且无人能停。
  2. 把 RSI 任务名也写进插件常量做联合判断——插件不拥有那个任务，它的名字是操作者在
     「自动化任务」里定的；写死等于伪造事实。
  3. 给 `.rsi/STOP` 换成循环专用停止文件——见 D-080 的取舍。
- **Consequences:** 一个会话最多一条循环行；被改写的行恢复路由且可关闭；`Loop heartbeat`
  这个名字成为保留名（若操作者把自迭代任务也叫这个名字，会被当成循环槽位收回，已在
  `HEARTBEATS.md` F5 写明）。

## D-080 — `.rsi/STOP` 继续同时停掉两个心跳，不拆成两个开关（2026-11-20 · 心跳隔离审计）

- **Status:** CONFIRMED（`src/loop-brakes.ts:52` `LOOP_STOP_MARKER = .rsi/STOP`；
  `.rsi/PROTOCOL.md` 把同一文件定义为 RSI 的暂停开关；`loop/stop-file` 见
  `src/loop-brakes.ts:122`）
- **Date:** 2026-11-20
- **Decision:** 保持共享，不拆。一个文件同时是循环刹车和自迭代暂停开关；要分开的部署用
  `GROK_WORKFLOW_STOP_FILE` 指到别处。
- **Reason:** 这是**只能停**的方向：写了它两个心跳都停，任何情况下都不会把一个心跳的
  投递导到另一个的处理器。它还是本部署操作者已经记住的开关（`PROTOCOL.md` §7），改位置
  等于把「我知道怎么停」这条隐性契约改掉。身份隔离要防的是「压住会话」和「互相触发」，
  不是「一键全停」。
- **Alternatives rejected:**
  1. 循环专用 `.rsi/LOOP-STOP`：能分开，但操作者写 `.rsi/STOP` 时会以为全停而循环还在跑，
     失败方向更坏。
  2. 只靠 `GROK_WORKFLOW_STOP_FILE` 环境变量区分：默认值仍共享，等于没解决。
- **Consequences:** 「停自迭代」会顺带停循环，这是有意为之，写进 `HEARTBEATS.md` F3；
  要独立停循环就用 `grok_loop close`（删行，不写标记）。

## D-081 — 两个心跳是两个服务实例；清理谓词随实例走，不写死（2026-11-20 · 心跳隔离审计第二轮）

- **Status:** CONFIRMED（`src/index.ts:313` 第二个 `createLoopService`（`RSI heartbeat`），
  `src/loop-surface.ts:148` 注册 `/grok-workflow/iterate`，`src/loop.ts:457` 每实例
  `slotOf`；`deleteSessionHeartbeats`（`src/loop.ts:752`）新增 `slot` 参数，默认
  `isLoopSlot`；回归测试 `test/heartbeat-identity.spec.ts` 反方向 4 例）
- **Date:** 2026-11-20
- **Decision:** 自迭代心跳不再只是「操作者的 Automation 任务」：插件用同一个
  `createLoopService` 再实例化一次，身份是 `RSI heartbeat` + `/grok-workflow/iterate` +
  可编辑模板 `iterateTemplate`（无标记、无工具、无卸载清扫）。**所有权与清理必须绑定到实例**：
  任何「删这个会话的心跳」的入口都传自己实例的槽位谓词，绝不使用写死的
  `isLoopSlot`（除刹车，它只拥有循环）。
- **Reason:** 两个开关、两套路由、两个槽位共存后，一个写死的谓词就是跨心跳写：
  实测 `iterate.forgetSession()` 在同时存在两行的会话上删掉了 `Loop heartbeat` 行、留下
  `RSI heartbeat` 行——一个心跳删了另一个的任务，还让旧行活过归档。这属于「互相触发」，
  不是命名偏好。可达性如实记：当前接线只把循环实例挂到归档事件，所以组合层今天走不到；
  但 `forgetSession` 是归档清扫的接口、两个实例都暴露它，按「接口必须正确」处理。
- **Alternatives rejected:**
  1. 让自迭代服务复用 `isLoopSlot` 并按提示词标记区分——它故意没有标记（模板可编辑），
     标记无法承担所有权。
  2. 给 `deleteSessionHeartbeats` 加一个 `title` 字符串参数——调用方仍需知道别人的槽位规则；
     传谓词才是「谁拥有谁清理」。
  3. 归档时两个实例都清扫一次（先循环后自迭代）——会先删错行，方向不对；正确做法是各清各的。
- **Consequences:** 归档清扫按实例正确；卸载仍只清循环行（自迭代心跳按设计活过卸载，
  `src/loop-surface.ts:73`），因此自迭代行不会变成「无主后台工作」——它的投递只是普通
  定时消息，不进入任何插件处理器。回归测试与负对照见 `HEARTBEATS.md` F6 与 §5。

## D-082 — The self-iteration default template is this repository's round prompt, documented as the source of truth

- **Status:** CONFIRMED
- **Date:** 2026-11-20
- **Decision:** `DEFAULT_ITERATE_TEMPLATE` is the text in `docs/iterate-template.md`
  (between its markers), byte for byte: POOL-first topic selection with TODO/failure rows,
  GitHub issues and papers as the fallback order; at least one item per round; a small fix
  without research and a big change with a `RESEARCH` entry plus pool approval and no invented
  sources; R1–R6; the triple review (self-review, `npm run ci` + `npm run verify:lib`, a copied
  profile live run); four brakes; the forbidden zones.
- **Reason:** the previous default was a twelve-line generic prompt. A fresh profile armed a
  heartbeat that did not know how a round here is chosen or judged, so the first delivery could
  only improvise. The rules already existed in the operator's protocol; shipping them as the
  default makes the switch useful without a hand-written template, and the settings textarea
  still lets a profile override every word of it.
- **Alternatives rejected:**
  1. Keep the generic default and document the round prompt separately — a fresh profile would
     still arm the wrong prompt, and the document would be advice rather than the default.
  2. Point the default at a file read at runtime — the template is delivered as a Schedule
     prompt and must not depend on the working directory the host happens to run in.
  3. Only change the settings-page copy — the schema default and the fallback would then
     disagree with the page, which is exactly the drift `test/client.spec.ts` exists to catch.
- **Consequences:** three copies must move together (`docs/iterate-template.md`,
  `src/config.ts`, `src/client/index.js`); `test/iterate-template.spec.ts` and
  `test/client.spec.ts` fail if one is left behind. A profile that already stores a template is
  untouched — only unset or whitespace-only templates see the new default, so no existing
  heartbeat changes behaviour on upgrade. The 4000-character cap is unchanged and the shipped
  default uses 3 239 of it.

## D-083 — An upgrade lands on the `origin/main` tip with the release tag as an ancestor; `HEAD` is never rewound onto the tag

- **Status:** CONFIRMED
- **Date:** 2026-11-20
- **Decision:** after updating the checkout and the installed profile to the latest published
  release, "up to date" means: `git ls-remote` and the Releases API name the same newest tag, that
  tag is an ancestor of `HEAD`, `HEAD == origin/main`, `src`/`lib`/`test`/`package.json` are
  byte-identical to the tag, and the profile manifest pins that tag. `HEAD` is not moved back onto
  the tag commit, and the tag is never moved forward onto `HEAD`.
- **Reason:** `v0.12.2` is followed on `main` by four docs commits (`074e2c3`, `07666fb`,
  `09c2bc9`, `5bd5bfe`) that this repository's own memory cadence requires. Making `HEAD` equal the
  tag commit would mean discarding pushed history; moving the tag would mean rewriting a published
  release. Both break rules that outrank an exact-sha match, and neither makes the installed code
  any newer.
- **Alternatives rejected:**
  1. `git reset --hard v0.12.2` — deletes four pushed commits locally, leaves `main` behind
     `origin/main`, and drops tracked evidence files from the worktree.
  2. `git push --force origin v0.12.2:main` — rewrites shared history to make `HEAD` equal the tag;
     forbidden outright.
  3. Cut a fresh `v0.12.3` at `HEAD` so the tip itself is a release tag — manufactures a release
     nobody authorized (`AGENTS.md` requires explicit authorization) and needs a version bump plus
     matching changelog notes for a docs-only change.
  4. `git checkout v0.12.2` — reports the right sha while silently detaching the branch; the next
     commit would land on no branch.
- **Consequences:** an acceptance check worded as "`HEAD` equals the release tag commit" cannot be
  satisfied while the other constraints hold; the reachable end state is "`HEAD == origin/main`,
  tag is an ancestor, shipped code byte-identical". Future verification must read the check that
  way, or the operator must authorize a new release.

## D-084 — A read-side bound mirrors the bound the writer enforces, never a neighbouring ceiling

- **Status:** CONFIRMED
- **Date:** 2026-11-20 (round 27)
- **Decision:** when the validator bounds a field that records something the writer produced, its
  ceiling is the writer's own ceiling. `integrity.bytes` records the byte length of a canonical
  payload the writer accepted, so the read side now bounds it with `CHECKPOINT_LIMITS.maxBytes`
  (1,048,576) — the same number `sealCheckpoint` and `writeCheckpoint` enforce — instead of
  `countCeiling` (1,000,000).
- **Why `countCeiling` was wrong here, and not merely tight:** `countCeiling` is the backstop for
  *row counts* (tasks, agents, evidence rows). A byte count is not a row count, so the two ceilings
  describe different things and picking the smaller one silently narrowed what the writer would
  accept: a checkpoint whose payload landed between them sealed, wrote, and then failed
  `assertCheckpoint` with `integrity.bytes must be between 1 and 1000000`, i.e. a resume that could
  never happen. Measured: one maximum-width evidence row costs 2,055 bytes, so 481 rows produce a
  1,001,015-byte payload and 503 rows still fit under the file bound — the broken window is about
  22 rows wide, not a corner case reachable only by hand-made input.
- **What the wider bound does not do:** it does not accept a corrupt file. `verifyCheckpointIntegrity`
  recomputes both the byte length and the sha-256 of the canonical payload and refuses any mismatch,
  and `readCheckpoint` `stat`s the file against `maxBytes` before parsing, so a value above the
  writer's bound (1,048,577+) still dies; only the 1,000,001–1,048,576 band changes verdict, from
  `invalid` to readable-and-verified.
- **Alternatives rejected:**
  1. Raise `maxBytes` to match the schema — separate decision, changes what the writer stores; the
     defect is the disagreement, not the value.
  2. Drop the `inRange` bound on `integrity.bytes` entirely — loses the early, readable refusal for
     an absurd number before the checksum work runs.
  3. Keep the read side and make the writer refuse payloads above 1,000,000 — shrinks a documented
     public bound (1 MiB) to fix a read-side mistake, and would refuse files earlier builds wrote.
- **Consequences:** a rule for future fields — *a validator bound on a writer-produced quantity is
  read off the writer*, and a test that only builds a small payload cannot see this class of defect.
  `test/checkpoint-schema.spec.ts` now sizes a payload across the boundary instead of shrinking it.

## D-085 — An encoded credential is matched in its encoded form; the rule table stays pure regex

- **Status:** CONFIRMED
- **Date:** 2026-11-20 (round 29)
- **Decision:** the base64-wrapped PEM gap is closed by a *rule in the existing table*
  (`base64-private-key`) that matches the banner's base64 encoding, not by a decode-and-inspect
  pass inside `redactSecrets`. The rule spells out the banner's three possible encodings, one per
  base64 group alignment, and replaces the whole blob including the continuation lines of a
  wrapped blob.
- **Why the rule table and not a decode pass:** `src/script.ts` renders `REDACTION_RULES` into the
  generated workflow script (`redactionRulesSource`), so prompt-side redaction and report-side
  redaction share one table by construction and `test/redact.spec.ts` pins them equal over a
  corpus. A decode pass would live in `redactSecrets` only, leaving the prompt boundary weaker
  than the report boundary — the opposite of what the boundary needs — unless the pass were also
  emitted as a source snippet into the script template, which adds a second hand-maintained copy —
  the failure mode `A32` records for the iteration template's three copies.
- **Why three encodings and not one:** base64 emits independent 4-character groups of 3 source
  bytes, so the same PEM text embedded at byte offset 0/1/2 of a larger blob starts its banner in a
  different group and produces three different encoded forms. Measured in round 29: prefixes of 0,
  1, 2, 5 and 10 bytes each hit exactly one marker of the three. Matching bytes 3..17 (i.e.
  `---BEGIN PRIVATE`) rather than bytes 0.. keeps each marker independent of the bytes before it.
- **What is deliberately not covered:** base64 *PGP armor* (the two banners diverge at byte 11, so
  it needs its own three markers — pooled), base64 `CERTIFICATE` blocks (public material, and the
  rule must not turn ordinary log noise into a false redaction), and a wrapped blob whose final
  line is shorter than 16 characters, which keeps a fragment of the block's *footer*, not key
  material, because the tail of the encoding is the end of the block.
- **Alternatives rejected:**
  1. Decode every ≥N-character base64 run and inspect the bytes — linear and exact, but host-only
     (see above) and it turns redaction into a parser, which the module's "safety net, not a
     license" framing does not support.
  2. One marker only, for the aligned case — misses the embedded blob, which is the shape that
     occurs when a key file sits inside a larger dump.
  3. Loosen the continuation threshold to catch short final lines — swallows the first word of the
     next line when that word is base64-shaped (`next`), i.e. over-redaction of prose; and the
     fragment it recovers is public footer bytes.
- **Consequences:** adding an encoded shape costs three literals, and the doc-family test now pins
  `base64` in both READMEs and `docs/ARCHITECTURE.md` so the promise cannot rot. `redactSecrets`
  stays a table walk, so rule order still decides overlaps.

## D-086 — The second armor's encoded form is six more literals in the same rule, and the window must reach byte 17

- **Status:** CONFIRMED
- **Date:** 2026-11-20 (round 30)
- **Decision:** the base64-wrapped *GnuPG* private-key gap (left open by `D-085`) is closed inside the
  existing `base64-private-key` rule: six literals instead of three — the encoded form of the
  `PRIVATE` and the legacy `SECRET` spelling, each at all three base64 group alignments. No second
  rule, no decode pass, unchanged replacement text.
- **Why the same rule and not a second one:** both armors are the same fact at the same boundary
  (*encoded armor must not reach a report*), they share the replacement, and the leading-run /
  continuation-line semantics are identical. A second rule would duplicate those semantics and split
  one audit story into two that can drift; keeping one rule also keeps rule order — which still
  decides overlaps — unchanged for every other shape.
- **Why the PGP window reaches byte 17 of the banner:** `-----BEGIN PGP ` (bytes 0..14) is shared by
  the private and the *public* armor, so a marker built from it cannot tell them apart. Measured this
  round: the 20-character group encoding bytes 0..14 of a private blob is
  `LS0tLS1CRUdJTiBQR1Ag` and a base64 `PGP PUBLIC KEY BLOCK` blob **starts with exactly that literal**
  (`pubBlob.startsWith(sharedMarker) === true`). Windows at bytes 3..17, 4..18 and 5..19 include
  `PRI`/`SEC` vs `PUB`, which is the first byte triple where the two banners diverge.
- **Why `SECRET` is included:** `BEGIN PGP SECRET KEY BLOCK` is the legacy spelling of the same
  material, three more literals cost nothing, and leaving it out would reopen the same leak for old
  keyrings.
- **Alternatives rejected:**
  1. One marker on the shared `-----BEGIN PGP P` prefix — measured above to redact base64 *public*
     keys as well, i.e. exactly the over-redaction `D-085` refused for `CERTIFICATE`.
  2. A decode-and-inspect pass — host-only, so the prompt boundary would stay weaker than the report
     boundary (the argument in `D-085` still holds).
  3. A separate `base64-pgp-private-key` rule — two rules with identical replacement and identical
     leading-run semantics; the only gain is a distinct diagnostic name, which the round does not
     need and no consumer reads.
- **Consequences:** the alternation is now nine literals, and the worst case for the rule scales with
  it — measured at HEAD: 12.1 ms for a 1 MB single-run blob with no marker (the greedy run is
  consumed once, then each of the nine alternatives is tried at each backtrack position), 3.7 ms for
  a 1 MB blob that does carry a marker, 1.9 ms for 12,000 short runs. Report-sized text is far below
  that; the full table on the same 1 MB blob takes 62.1 ms, so the base64 rule is not the cost driver.

## D-087 — A comment that quotes a measured constant is guarded by the test that measures it

- **Status:** CONFIRMED
- **Date:** 2026-11-20 (round 31)
- **Decision:** when a source comment states a number that the surrounding code and tests can measure,
  the test that measures it also reads the source back and requires the comment to name the measured
  value. `test/checkpoint-schema.spec.ts` derives the writer's 1,048,447-byte payload ceiling from a
  real sealed file and then asserts that `src/checkpoint/schema.ts` says so.
- **Why:** the round-27 comment claimed the refused band ran to 1,048,576 while the writer refuses from
  1,048,448 up; the behaviour was correct and the prose was not, so no behavioural test could catch it,
  and the wrong number was carried as an uncertainty through four rounds. A comment is a claim a reader
  acts on; leaving it untested makes every "documented bound" a candidate for the same drift.
- **Why not a docs-only fix:** the same drift would return with the next edit. The guard costs one
  `readFile` and one `toContain`, and it fails loudly (`1,048,447` vs `1,048,576`) with a message that
  says which constant moved.
- **Alternatives rejected:**
  1. Export the ceiling as a constant and comment "see the constant" — a comment that points at code
     still drifts in the *other* direction (a reader quoting it from memory), and it hides the arithmetic
     (122 bytes plus the digits of the byte count) that makes 1,048,447 non-obvious.
  2. Fold the ceiling into `CHECKPOINT_LIMITS` as a second bound — a new public number that callers
     would have to keep in step with `maxBytes`; the writer's real bound is the file bound.
  3. Rewrite the comment to avoid numbers — the ceiling is the actionable part of the contract (how big
     a payload a caller may hand the writer), so removing it would remove the reason to read it.
- **Scope:** this is a documentation guard, not a policy switch. It applies where a comment quotes a
  constant the suite can measure; prose that explains *why* is left alone.

## D-088 — 折行的 base64 私钥用「容忍自身断行的标记」堵，不用解码复核（2026-11-20，round 33）

**背景**：`base64-private-key` 的 9 条窗口是连续 20 字符字面量，折行窄于它就把标记自身拆开，
于是 8–23 列的手工折行块整块落进报告（round 33 实测）。池里给了两条路：容忍断行的标记，或
解码后再查。

**决定**：选容忍断行的标记。`REDACTION_RULES` 是纯正则表，`src/script.ts` 按
`pattern.source` + `replacement` 把它逐条镜像进生成的 workflow 脚本；因此「同一份声明同时保护
报告边界与复查/重试提示词」这条既有不变式（`D-085`）只在纯正则下成立。解码复核无法被这样镜像，
一旦引入就会得到两套实现，而 `test/redact.spec.ts` 的 host↔script 语料一致性检查也就失去意义。

**具体做法**：窗口由 `BASE64_PRIVATE_KEY_WINDOWS.map(foldable)` 生成，字符之间允许一个
`BASE64_BREAK`——真实换行，或 JSON 字符串序列化后的 `\n` 两个字符（否则 JSON 字段里的折行块依然
漏）；续行下限从 16 降到 **8**（`w >= 8` 的折行每行正好不少于 8 字符），并用 `BASE64_BLOB_END`
要求续行之后必须是行边界、字符串引号或输入结束。

**代价与边界（都写进池与注释）**：① 折行 ≤7 列仍不处理——那种宽度下续行与散文单词无法区分，
要覆盖只能引宽度感知或解码复核，另作一项；② 续行下限定在 8 会吃掉紧跟私钥块、整行都是
base64 字符且长度 ≥8 的行（安全方向的过度脱敏），但 `BASE64_BLOB_END` 挡住了「吃掉散文下一个
单词」这一实际风险（`tail`、`ERROR` 这类 4–5 字符行不再被吃）；③ 块尾最后一行若短于 8 字符会
留下几个编码字符——那是编码尾部即 armor 页脚，不含密钥材料（round 30 记录过同一取舍）。

## D-089 — 双重转义的折行块用第三个断行分支堵，不放宽成「任意反斜杠」（2026-11-20，round 34）

**背景**：round 33 让 `BASE64_BREAK` 容忍两种断行——真实换行，或 JSON 字符串里的 `\n` 两字符转义。
但一条**已经带字面 `\n`** 的日志行再被 `JSON.stringify` 包一层，反斜杠会加倍成 `\\n`（三字符），
单反斜杠分支对不上，整块 base64 私钥原文落进报告。实测（把 `src/redact.ts` 换回 round 33 的版本）：
新用例 **1 failed**，输出里留着 `nIEtFWS0tLS0tCk1NTU1NTU1N` 这类 20+ 字符片段。

**决定**：给 `BASE64_BREAK` 再加**一个**分支，精确匹配「双反斜杠 + n」。不放宽成 `[\\]+n`
或任意数量反斜杠。

**备选与取舍**：
1. **放宽成「n 个反斜杠 + n」**——能一次覆盖任意层数，但会把正常转义文本（`C:\\new` 这类路径、
   散文里本来就有的 `\\n`）当成断行；`BASE64_BLOB_END` 只锚续行的行边界，约束不了断行落在哪，
   所以误伤风险直接落在「报告里出现不该有的 `[REDACTED]`」这一侧。
2. **引入解码复核统一处理任意层**——违反 `D-088` 的纯正则约束：`src/script.ts` 按
   `pattern.source` + `replacement` 镜像 `REDACTION_RULES`，两套实现会让报告边界与复查/重试
   提示词边界分叉。
3. **不修，把双重转义记进已知不覆盖**——但「日志行本就带 `\n` 转义、再被转发进另一层 JSON」
   是真实存在的形态（本轮正是从这种日志里取到样本），安全方向的漏比安全方向的误伤更贵。

**代价与边界**：三层及以上转义（`\\\\\\n` ……）不覆盖，没有实测形状，作为残留并入池。新增分支
在 A/B 上无可测耗时变化（174,000 B 散文 9.14 ms → 9.08 ms，`A38`）。

**Scope**：只影响 base64 私钥编码块的断行识别。折行的 PGP 公钥、证书、普通 base64 块与带 `\\n`
的散文在探针里全部保持原样（`.rsi/evidence/round-034/reach.txt`）。

## D-090 — 深一层的未知键在读取侧拒绝，schema 保持透传（2026-11-20，round 35）

**背景**：配置面只在最外层拒绝未知键。`roles.reviewer` 与路由字段手误（`maxInflight`）
被静默丢弃，而补丁里留着它们——「设了也不生效」的失败模式换了一层又回来了（`POOL.md` R35）。

**测量**：`@deepseek-ai/schemastery` 的 `z.object` 对未知键**透传**（`Config({roles:{reviewer:[…]}})`
的输出仍带 `reviewer`，`A39`），所以宿主路径上这些键确实会到 `apply()`；而 `Config` 对
`roles` 传非对象会报 `expected object`（同一探针）。**结论**：读取侧是唯一能拒的地方。

**选择**：
- (a) 在 `Config` 上加 `.strict()` / 手写拒绝——拒绝发生在宿主解析阶段，整行 `did not activate`，
  且 settings 页生成的表单要跟着改；否。
- (b) 在 `assertKnownKeys` 里加两层（角色名、路由字段），报错与最外层同形（`unknown configuration
  key 「<完整路径>」 … (did you mean …?)` + 可用集合）；采。
- (c) 只加一层（角色名）——路由字段的手误正是池里点名的第二个例子；否。

**代价与迁移**：这是**更严格**的载入，一份带多余键的存量补丁会从「静默忽略」变成「载入失败并点名」。
失败信息给出完整路径与最接近的可用键，因此按 patch 发布并在 `CHANGELOG` 写明迁移（删掉被点名的键，
它没有替代值）。与最外层未知键一直以来的行为一致，不是新的失败类别。

**不做**：`roles` 传非对象时纯程序化路径仍被读成「五个空链」（schema 已挡住宿主路径），入池。

## D-092 — 1000 轮预算分臂推进：每臂 ≤100 轮，进程内不循环（2026-11-20，harness）

**背景**：用户要求「不提示、自动迭代 1000 次」。插件自带的 loop 面每次只写一条 `RRULE`，配置面
`loopMaxRounds` 在载入时拒绝 >100（`src/config.ts:992`，`HARD_LIMITS.loopMaxRounds`），而
`loopPolicyFromConfig` 的钳位是 `1..1000`（`src/loop.ts:383-386`）——即「一行能表达 1000 轮」是
政策允许、配置面不允许的形态。门禁 `heartbeat-guard.sh` 早有 `--max-rounds`，但默认 `0`（无上限）。

**选择**（三条候选）：

- (a) 一个进程内 `for`/`while` 跑 1000 轮——否。AGENTS.md 禁止无界/长循环，崩溃即丢中间态，且与
  「卸载即取消」的契约冲突。
- (b) 一条 `COUNT=1000` 的行——合法（政策钳位允许），但超出插件自己会写的宽度；`open()` 的原地刷新
  会按配置的 `loopMaxRounds`（≤100）把 `COUNT` 改回去，任何一次开关翻转都会把预算缩回 100 轮。
- (c) **分臂**：每臂 ≤100 轮（= `HARD_LIMITS.loopMaxRounds`，插件自己会写的最大宽度），预算 1000
  由 `.rsi/ledger.jsonl` + `.rsi/ROUND.md` 推算剩余，门禁 `--max-rounds 1000` 封顶，下一臂由人
  （或持有 `schedule_*` 的会话）按 `.rsi/tools/iterate-plan.mjs` 打印的 `rrule` 续订——采。

**理由**：每一臂都落在插件自己的边界内（不存在「插件不会写、只有脚本会写」的行）；行跑完自动停，
不留无主后台；预算与停止条件都从既有记录（ledger/ROUND）推算，没有第二份状态文件；续订是复制一行
`rrule`，不是一次判断。

**代价**：1000 轮需要 10 次续订动作，不能「一次性无人值守 41 天」。这是刻意的：一条跑满 1000 轮的
行在跑偏时也会跑满 41 天，而分臂让跑偏最多损失一臂（≤100 轮），且停止后没有人会继续唤醒会话。
`--shape single` 仍可用（政策允许 1000），只给「不再动开关」的操作者，理由与漂移写在 `.rsi/HARNESS.md`。

**不做**：本轮不得自己续订心跳（D-066）；不在插件里加定时器或自续机制（卸载契约、无主工作）；
不改 `loopMaxRounds` 的硬上限 100，也不改 `loopPolicyFromConfig` 的 1000 钳位。

## D-091 — 低于续行下限的折行按「短行连排」整段吃掉，不把下限降到 1（2026-11-20，round 36）

**背景**：`base64-private-key` 的续行规则只吃 ≥8 字符的行。折行窄于 8 列时，横幅仍能匹配（窗口
容忍自身断行），但没有任何一行够长，于是**整块编码留下**：272 字符的块在 7 列折行下留 244 个，
解回去就是横幅与密钥本体（`A41`）。round 33/34 没看出来，是因为断言只解码「≥4 字符的残留片段」，
而窄折行把材料切成每行 ≤7 字符的碎片，逐片解码必然是垃圾。

**选择**：
- (a) 把续行下限降到 1——每一行散文都能当续行（`the`/`quick`/`end` 全是 base64 字符），代价从
  「横幅后两行」扩到「任意一行」；否。
- (b) 增加一个「短行连排」分支：连续 ≥2 行「只有 base64 字符」的行整段吃掉，整条分支可选
  （`(?:…){2,}` 外面再包一层 `?`，否则整条正则在该分支不适用时整体失配——本轮第一版就踩了这个坑，
  宽度 ≥8 的块反而全不匹配）；采。
- (c) 解码复核（把候选块解码后看有没有横幅）——正则表变成两套机制，`src/script.ts` 的镜像渲染不了；
  否（`D-085` 已定「规则表保持纯正则」）。

**代价（实测，已写进 `ARCHITECTURE`）**：紧跟在一个已匹配编码横幅之后的**两个**单行单词会被一起
吃掉，单个不会。这是「宁可多删」的一侧，且只在横幅之后。宽 1–4 时折行的**第一行**（≤4 字符）仍留，
因为匹配从横幅自身 base64 对齐处开始；它单独不可解，与页脚同理。

**页脚边界同时钉住**：末行 <8 字符留下（≤7 字符、≤5 解码字节），8 字符即被吃掉；两侧（报告与提示词）
都测。

## D-093 — 1000 轮只需一次上弦：默认一行覆盖剩余全部，并给门禁加自算轮次与上弦复核（2026-11-20，harness，round 37）

**背景**：D-092 选了「分臂」并把代价写成「1000 轮需要 10 次续订动作」。用户的原始要求是
「不提示、自动迭代 1000 次」——十次人工续订与「不提示」直接冲突，且第一次上弦之后每一臂都要有人
记得回来粘贴 `rrule`，漏一次就是永久停摆。同时 round 37 实测到另一处硬约束：仓库自己的心跳 prompt
是 6,964 B，超过 `MAX_LOOP_PROMPT_CHARS = 4000`（`src/loop.ts:112`），所以插件自己的开关
（iterate 模板）连这一段 prompt 都装不下——两个上弦通道因此不可能共用同一段文本。

**选择**：

- 默认 `shape: single`：一行 `INTERVAL=60`、`COUNT=剩余全部轮数`，**一次上弦走到 1000 轮**。
  1000 是 `loopPolicyFromConfig` 的钳位（A40），Schedule 接受这条行；门禁 `--max-rounds 1000`
  在轮次上封顶，`COUNT` 有限，所以「无界循环」不存在：驱动它的是定时器，不是进程。
- 上弦复核工具化：`iterate-plan.mjs --arm-spec` 打印槽名 / 行 id / `rrule` / prompt 字符数与
  4000 上限的比对，`--verify-row` 读宿主 schedule 存储（只读长度，不读 prompt 文本）并比较
  `COUNT - 已投递` 与剩余轮数，给 `ARMED` / `NOT_ARMED` / `UNKNOWN` 三个结论。上弦之后能**测量**
  是否真的上弦了，而不是靠报告自述。
- 心跳 prompt 改成常量文件 `.rsi/HEARTBEAT-PROMPT.md`（实测 2,319 字符，落在 4000 内），门禁新增
  `--round auto`：轮次由 `ROUND.md` 与 `ledger.jsonl` 取高者 +1 自算，所以同一段字节开完预算的
  每一轮。两个上弦通道（操作者的 Automation 任务、插件开关）从此可以共用同一段 prompt。
- `chain` 保留：每臂 ≤100 轮、落在插件开关自己会写的宽度内，代价是每臂一次上弦。愿意让开关随时
  可用的操作者选它。

**否掉的候选**：

- (a) 让每一轮自己上弦下一臂（自续链）——最接近「完全自动」，但这是把「谁拥有心跳」从操作者手里
  拿走（D-066），而且一条能自己延长的链，其边界只剩「它自己算出来的剩余数」：算错一次就是真正的
  无界循环，而本轮没有任何运行时证据表明自续会按预算停。不做。
- (b) 进程内 `for` 1000 轮——AGENTS.md 禁止，崩溃即丢中间态，与卸载契约冲突。不做。
- (c) 只保留 `chain` 并把十次续订写成「操作者会做的事」——与用户的「不提示」冲突，且实测已证明
  这类动作在两次 attempt 里都没发生。不做。

**代价（写清，不掩盖）**：`single` 的行宽超出插件开关会写的宽度，`open()` 的原地刷新会把 `COUNT`
改回配置的 `loopMaxRounds`（≤100）——任何一次开关翻转都会把覆盖缩到 ~100 小时。缓解：`--verify-row`
把这件事变成可测状态（不是记忆），`HARNESS.md`「Arming the row」写明该注意，`chain` 作为退路保留。
另：上弦本身仍是操作者/持 `schedule_*` 会话的一次动作，子代理被拒（本轮再次实测
`schedule_list` → `{"code":"subagent_session"}`），所以「零动作」不成立，「一次动作」成立。

**不做**：不改 `HARD_LIMITS.loopMaxRounds` 的 100、不改 `loopPolicyFromConfig` 的 1000 钳位、
不在插件里加定时器或自续机制、不写宿主 schedule 存储（那是绕过工具策略，也是 AGENTS.md 的红线）。

## D-094 — 插件不再在 step 之外写 `assistant/message`；渲染不了的终态改存记录（2026-11-20）

**背景**：用户报 `/compact` 报错。根因不在命令：本插件在 `agent/pre-step`（step 尚未打开）写
`assistant/message`，DSH 的 token 计量器回放时要求每条 `assistant/message` 都落在同一
`(turn, step)` 的 `step/start`…`step/end` 之间，第一次回放即抛
`token meter: assistant/message at seq N has no matching step/start event`，且折叠游标不越过该
seq，此后每次都抛在同一处。`compactNow()` 先测量再选范围 → `/compact` 报错，自动压缩同样失效
（`agent/pre-step` 只 warn 后继续）。三个写点同源：即时回执（`src/records.ts`）、卸载通知、
取消终态（`src/gate.ts` 的 `commitCancelled`）。实测 120 个归档会话里 10 个中招
（4 回执 / 4 通知 / 6 模型署名 + 1 其他）。

**选择**：
- (a) 保留行、给回执补一对合成 `step/start`…`step/end`——对计量器合法，但等于在日志里伪造
  agent loop 从未发生的 step，违背「日志即事实」；否。
- (b) 延后到下一次 `step/start` 再写——合法且能渲染，但那一行会作为**模型自己的话**进入下一轮
  的请求面（源是模型身份），把插件文字塞进模型发言；否。
- (c) 改成 `user/message`——不触发配对规则，但 t45 已实测：非 `user` 源的 user 行在 stock Web
  会话里**不渲染**，等于静默丢弃；否。
- (d) 加闸门 `openStepOf()`：没有打开的 step 就不写；被拒的回执/通知文字改存
  `plugin:grok-workflow/terminal` 记录（可读、可审计）；采。

**代价（明确记录）**：P0-4 的取消终态、卸载通知、团队档实时回执不再是聊天行。事实不丢：终态与
通知文字进 terminal 记录，`DISPOSE_RECORD`/`DELIVERY_RECORD` 仍在。回执的模型调用在写不出行时
一并跳过，不为一条注定被拒的行付钱。**后续入池**：用合法通道渲染它们（进度面板 / 客户端自绘行）。

**测量与回归**：`node scripts/repro-compact.mjs` 驱动真实 `/compact`
（`dsh-command-compact` + `dsh-compaction-basic` + `dsh-token-meter`，本机安装版）：
修前 exit 1 且 `/compact` 抛上述错误，修后 exit 0 且 `/compact` 答
`No compactable history yet.`。`test/compact-step-pairing.spec.ts` 用真实计量器回放：
修前 4 例红（`expected true to be false`、孤儿行存在），修后 6 例全绿。

**另一处纠正**：`docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md` §R5 推断手动压缩会
被包成 `ManualCompactionError('busy')`；实测**不会**——`compactNow()` 的外层 `try/catch` 包不住
`async` 回调的 rejection，原始计量器错误直接落到命令处理器。文档已在该报告旁注明。

## D-095 — `/grok` 的开关词「去空白 + 不分大小写」；裸 `/grok` 仍然=开；状态字段是 mode 记录的 `enabled`，不新造 `masterEnabled`（2026-11-21）

**Status:** `CONFIRMED`（`src/command.ts` 已改，`test/command.spec.ts` 26 例在改后全绿、改前 4 红）

**Decision:**
1. 开关词解析：`rawInput.trim()` 后统一小写再比对 `on`/`off`。`trim` 覆盖空格、制表符、换行、
   U+00A0、U+3000，所以 `/grok ON`、`/grok  Off `、`/grok<TAB>on` 与全小写无空格等价。
2. **裸 `/grok`（空参数）仍然=开**，不改成用法提示（见下方「与委派 AC 的冲突」）。
3. `on`/`off`/空 之外一切参数仍只回 `Usage: /grok [on|off]. This text was not sent as a prompt,
   so nothing ran.`，**不写任何记录**；提示词形状的参数仍走 `src/intake.ts` 的实测双语拒绝（D-078）。
4. 参数不是字符串（畸形调用）时直接回用法提示：既不落进「空=开」分支写一个没人要的开关，
   也不抛未捕获异常。`@deepseek-ai/dsh-commands` 的 `parseCommand` 本身总是切出字符串，这一条是
   对宿主差异的防御，不是猜测新契约。

**Reason:** 命令是给人按的；大小写和首尾空白属于键盘，不属于意图。旧实现把它当拼写考试：
`/grok ON` 得到用法提示且 `enabled` 不动，用户看到的却是「命令没听懂」。

**与委派 AC 的冲突（明确记录，不静默）：** 本轮任务 JSON 的验收项写「无参数或非法参数时返回
用法提示且不改变状态」。其中「非法参数」完全成立；「无参数」与本仓库已发布契约相反：
`D-028` 定「`/grok` 开、`/grok off` 关」，README 双语两处、`README.md:29`、
`src/client/index.js` 的 `status.off.detail`（"Send /grok for one serious run"）、
`test/command.spec.ts` 的 4 条既有用例都按「裸 `/grok` 开启」写，且仓库里存量的团队任务提示词
普遍以 `/grok` 开头。把空参数改成报错是一次**已发布行为的回退**，任务里没有任何一个用户请求
要它。因此本轮保留 D-028，把冲突写进这里与交接，交由 lead/用户裁决；若裁决要改，改动点只有
`src/command.ts` 的 `enable = arg === '' || word === 'on'` 一行加 4 条测试。

**`masterEnabled` 不存在，也不新增：** 仓库里唯一的总开关状态是会话插件记录
`plugin:grok-workflow/mode` 的 payload（`src/mode.ts` 的 `ModeRecord`，字段 `enabled`），
写 `setMode(...)`、读 `readModeRecord`/`isModeEnabled`，门控在 `src/gate.ts:521` 读它并以
`grokDefault` 为兜底；设置页「总开关」写的是配置默认值 `grokDefault`。`grep -r masterEnabled`
全仓零命中。再引入一个 `masterEnabled` 会让「命令说的」和「门控读的」变成两份真相，正是任务
约束要避免的。

**Evidence:**
- `test/command.spec.ts`「case and whitespace tolerance」：10 个 on 变体 / 10 个 off 变体逐个
  断言写入后的 `enabled` 与 `setBy`；`onn`、`OF`、`ON please`、`off.`、`on;off`、`ON OFF` 逐个
  断言用法提示且开关保持原值；`undefined`/`null`/`42`/`{}` 断言不抛、不写。
- `test/command.spec.ts`「grok command and the master switch read one state」：用真实
  `classifyPreStep` 验证 `/grok on` 在 `grokDefault: 'off'` 下被承认、`/grok off` 在
  `grokDefault: 'on'` 下读作 `pass/mode-off`，round trip 回到默认。
- 改前/改后：`docs/knowledge/evidence/grok-command-grammar-20261121/{before,after}.txt`
  （改前 4 failed / 22 passed，改后 26 passed）。

## D-096 — profile 克隆用「重算相对链接 + 就地脱敏」，不用 `pnpm install` 重装（2026-11-21）

**背景**：把一个 pnpm 管理的 DSH profile 复制到另一个 `$DSH_HOME` 时，`link:` / `file:`
依赖与个人配置里的渠道密钥同时搬家。

**选型**：
- 链接：复制后按**克隆自己的位置**重算每条相对符号链接（`path.relative` 到源解析出的绝对
  目标）。保留相对形态，所以日后 `pnpm install` 的解析语义不变。
  放弃「改成绝对路径」（可移植性更差）与「在克隆里 `pnpm install` 重装」（要网络/要 store，
  且会掩盖「复制本身是否忠实」这一被测点）。
- 密钥：profile 自有文件**就地脱敏**并把判定写成 `redact(source) == target` 的逐字节 parity；
  报告只留文件、行号、模式名。
  放弃「只报告不脱敏」（复制品里仍有活凭据）与「拒绝克隆」（克隆本身是正当操作）。
- 只把**克隆引入**的悬空链接算缺陷；源里本来就悬空的（`node_modules/git`、
  `.bin/openwrite-*`）按继承上报。否则脚本会在最需要审计的 profile 上直接失败。
- `node_modules` 内的密钥形状命中标 `vendored` 不动：那是依赖自带测试样例，改写会破坏包内容。

**代价**：脱敏后的克隆不能直接拿真实凭据跑模型；要真跑需要自己回填，这是有意的。

## D-097 — 宿主 guardian 预算覆盖脚本 wait 窗口（2026-11-22，已发版 `0.13.2`）

**背景**：session-77a3f6fb turn 38，执行子任务在 10 分 01 秒被宿主 guardian 整轮 cancel，
当时它正在收尾（写证据 md、截图已看完、diff 已审完）；同秒启动的 guardian adjudication
子任务只活 1 秒就随整轮一起被取消。宿主与脚本的两层 10 min 预算完全重合，Q8 的
wait×2 adjudication 还没判完宿主已经杀了整轮。

**Decision:**
1. `guardianChildBudgetMs(timeoutMs, childTimeoutMs?)`：有守卫路由时宿主预算 =
   `min(deadline, max(旧预算, childBudget + GUARDIAN_MAX_WAITS × GUARDIAN_WAIT_MS))`，
   仍受 10 min 上限与 run deadline 约束；无守卫/无限 deadline 时与旧版逐字相同。
2. 常量只读 `src/timeout.ts` 的 `GUARDIAN_MAX_WAITS`/`GUARDIAN_WAIT_MS`
  （脚本里的镜像由 `test/timeout.spec.ts` 钉住相等，不做第二份拷贝）。
3. `src/run.ts` 只在 `config.guardianModel` 已配时传入 `CHILD_TIMEOUT_MS`。

**Reason:** 裁决权属于先看到超时的那一层。旧行为里两层同时看到超时，宿主的 cancel
整轮先生效，脚本的 wait 续命永远跑不出来——等于 Q8 的 adjudication 被自己的看门狗
杀了。新行为让脚本先判（wait 则续命，kill 则走重试），宿主只在脚本也放弃后才杀整轮。

**Evidence:** `test/timeout.spec.ts`「covers the script wait window」7 断言；
`test/guardian.spec.ts` 12 例与 `npm test` 78/1454 全绿；typecheck 0 错。

**代价**：配了 guardian 的 run 上，最坏单子任务多等 10 min（两次 wait）才整轮 cancel；
不配 guardian 的 run 行为零变化。

## D-098 — 守卫看三个存活信号，不再只看开始/结束（2026-11-22，未发版）

**背景**：用户原话「这个杀错了，子代理明明在工作」。旧守卫只订阅
`workflow/agent-start`/`agent-end`/`workflow/end`，到预算没结算就杀整轮；
干慢活的孩子和真卡死的一模一样。D-097 只修了宿主抢跑（宿主等脚本判完），
没修「瞎」本身。

**Decision:**
1. **B1 run 心跳**：宿主新增订阅 `workflow/phase` + `workflow/log`
   → `guardian.runHeartbeat`。run 在叙述 = run 在推进；安静的孩子 + 新鲜的
   run 叙述 = 该孩子自己的 timeout，不再是 heartbeat-loss（信号降级，不豁免）。
2. **B2 文件心跳**：`agent-start` 事件只带 `{seq,label,phase,childId}`
   （引擎 `SUPPORTED_AGENT_OPTIONS` 写死五键，多一个就抛 `UNSUPPORTED_OPTION`，
   脚本侧带不上），宿主用 `writesPathsForPhase(tasks, phase)` 从 caller plan
   按 `任务 n`/`Task n` 反查声明路径，再 `statSync` 看 mtime。新鲜（预算内）
   = 活着，直接保活；stale 或读不到 = 无信号，走旧规则。planner 现场编的
   plan（`args.tasks === null`）无映射——旧规则，不做假保活。
3. **B3 裁决证据**：`adjudicateStall` prompt 加 `task-declared write paths`
   一行 + RULES 加一条（有声明路径 + run 在叙述 = 更可能活着；有声明但
   run 沉默 = 更可疑）。宿主开火 reason 带 `last life: file Xs ago` /
   `run narration Xs ago`，终端报告里能读到当时看到了什么。

**Reason:** 杀错的根因是信息不够，不是预算不对。调大预算只会把误杀推迟，
三个正交信号（run 在说话、文件在动、裁决者知道该看什么文件）才是对症。
“无信号 = 按旧规则杀”是故意的：保活必须有证据，沉默永远不算活着。

**Evidence:** `test/guardian.spec.ts` 18 例（含 B1/B2/runHeartbeat/
writesPathsForPhase 中英映射/不可读降级/未知 phase 旧规则 7 例）；
`test/timeout.spec.ts` +1（prompt 带声明路径钉住）；`npm run ci`
78 files / 1472 tests PASS。

**代价**：`check()` 每轮对有声明路径的 open child 做 `statSync`（B2，路径数
≤16，有上限）；B1/B3 零新增调用。planner 模式的 run 无 B2（宿主看不到现场
编的 plan），这是诚实边界不是缺陷——B1 对两种 plan 都有效。

**被否决的备选**：脚本 `agent()` call 里带 `writesPaths`（引擎 allowlist
直接抛错，实测确认死路）；轮询子会话 `ownEvents`（`ctx.session` 是 lookup，
但子会话归引擎的 subagent 域管，宿主跨域读要走未公开的 seam，架构上越界）；
全局扫 cwd mtime（所有 child 共享一个 cwd，扫全目录会把别的 task 的写算到
这个孩子头上——B2 按声明路径盯正是为了避开这个）。C（宿主只标记不杀）
单独立项：它改变“挂死的 run 什么时候结算”这个用户可见语义。

## D-099 — 守卫问心跳 + 拉回来不杀（2026-11-22，未发版）

**背景**：用户要三件事——①扫一遍 10 秒（嫌 1 秒太费）；②守卫定期查子会话活没活（方法一为主，没动静再读内容方法二）；③卡住的打断再发消息救（停了再救，不是插队）；守卫可以用模型（设置页配了 `guardianModel` 就是让它花的）；重救无限次。

**Decision:**
1. **10 秒一扫**：`GUARDIAN_LIMITS.checkIntervalMs` 1s→10s。轮询只比内存时间戳，省的是调度；B1/B2/C1 心跳全是事件驱动（事件到立刻刷新），发现卡死最多晚 10 秒——10 分钟预算面前是噪音。
2. **C1 问会话心跳**：host 侧 `sessionHeartbeat` 读孩子自己会话的 `subagentTiming.active.through`（`ctx.sessionProjections.stateOf`，同步读内存），预算内有动静=活着，不管文件。只取时间戳不看内容；stale/读不到/无 open turn→无信号退老规则。这也覆盖 planner 现场 plan（B2 无映射的短板补上）。
3. **C3 打断+重救**：判停模型可答 `rescue` + `guidance`（prompt 加规则+schema）；脚本 `raceChildCall` 收到 rescue 就 `log('guardian rescue seq=N … guidance=…')` 广播+按 wait 续一格；host 订阅 `workflow/log` 收到就 `interrupt(childId, {kind:'ancestor', agent})` 打断 + `sendMessage` 递引导语。孩子上下文保留，醒来继续干。无限次（用户拍板），每次一条 `rescue` finding 留账。递不进去（未知 seq/已结算/无引导语/无执行器/抛错）一律 containment，无 warn 外无影响。
4. **pre-adoption buffer**：真机上 log 可能比 adopt 先到（fake 引擎 microtask 实测复现），`pendingRescues` 按 run id 缓存，adopt 回放顺序 start→rescue→end（rescue 必须在 end 前，否则 settled 挡掉——这个坑是红测抓出来的）。
5. **`timeout.ts` 同步**：`GuardianVerdict` 加 `rescue`，`parseGuardianVerdict` 认三态，`guardianDecision('rescue')`=wait（同 wait 规则：次数+deadline 双约束，不是无脑续）。

**Reason:** 判和救必须分家——脚本有模型能判但无 seam 不能救，host 有 seam 能救但无模型不能判。`guardian rescue` log 行是两者唯一的交接点：脚本只判+广播，host 只执行+留账，host 不编内容（引导语是 adjudicator 写的，host 原样转发）。“睡死型”（等 IO/等锁）interrupt 能叫醒（cancel 信号）；真醒不来的下一轮预算照杀，不无底洞。

**Evidence:** `test/guardian.spec.ts` 27 例（含 session 心跳 3 + rescue 单元 3 + host 接线 2）；
`test/timeout.spec.ts` +rescue 解析/决策/prompt 广播钉；脚本 rescue 广播集成（adjudicator 答 rescue→events 里有 `guardian rescue` 行→attempt 不加长）。`npm run ci` 78 files / 1480 tests PASS；typecheck 0 错。

**代价**：重救走 `guardianModel`（用户已批无限次，finding 留账可查）；无 guardianModel 的 run 行为零变化（adjudication 不跑，rescue 不存在）。D-098 的被否决项「读子会话 ownEvents」被 C1 的 `subagentTiming` 投影取代——读投影不读 log，不碰内容，O(1) 不扫全 log。

**被否决的备选**：host 侧直接调模型判类型（host 无调模型先例，`ctx.llm` 只用来列 provider；判读放脚本 adjudication，多一种 verdict 而已）；B1 升级为保活（“run 在说话=孩子活着”会把真死孩子和 run 噪音混在一起，B1 保持降级不定罪）；C（只标记不杀）仍单独立项。

## D-100 — `observe` finding 的三侧一致：bundle 已对，纯折叠跟上（2026-11-22，已发版 0.13.9）

**背景**：PR #47 把 Guardian 从「取消整轮」改成「非破坏式」（rescue 排队恢复指引 / observe 只记录不打扰），
改了 host（`guardian.ts` action 三态）、脚本（`script.ts`/`timeout.ts` 文案）、bundle（`client/index.js`
三态渲染 + i18n），但纯折叠侧 `src/progress-tab.ts` 没跟：类型仍是 `'cancel-run' | 'rescue'`，
fold 仍是 `rescue → rescue else cancel-run`。

**Decision:** 纯侧跟 bundle 对齐：fact 类型加 `| 'observe'`，fold 用 bundle 同规则
（`rescue → rescue`，`cancel-run → cancel-run`，else `observe`）。`cancel-run` 分支保留——旧会话
journal 里可能还有历史 `cancel-run` finding，fold 不能把它吃成 observe。

**Evidence:** 新回归 2 例（fold 级 + connector 渲染级）；红验证旧码 1 failed；`npm run ci`
78/1484 全绿；远端 CI + Release 双绿。

**Reason（为什么保留已死的 `cancel-run`）：** fold 读的是历史 journal，不是只读新代码的输出。
删分支等于改写历史显示——旧 finding 会从「取消过」变成「观察」，这是事实篡改。类型与映射都保留三元。

## D-101 — 安装失败根因：`/tmp` usrquota 配额，不是 `/home` 空间；allowBuilds 不用加（2026-11-22，`CONFIRMED`）

**背景**：用户 `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.9`
报 `ERR_PNPM_GIT_FETCHER_IO … Disk quota exceeded (os error 122)` + dsh 通用提示
"add the exact key under allowBuilds"。

**Decision:**
1. **真凶是 `/tmp` 的 `usrquota` 配额**：`/tmp`（tmpfs 16G）挂载带 `usrquota`；`git init` 写几 KB
   即 `error: copy-fd: write returned: Disk quota exceeded`，而 `/home`（btrfs 198G，余 13G，
   quota 未启用）写 500MB 一次成功。pnpm git fetcher 的临时 clone 走 `/tmp`，撞配额即
   `os error 122`。`EDQUOT=122`（`ENOSPC=28` 另有所指），dsh 的 disk-full 分类只认
   `ENOSPC|no space left`，故本次按 unknown 透出 pnpm 原生行。
2. **`allowBuilds` 不加**：dsh `plugin.ts:104` 对一切形如 git 的 spec 在 exit≠0 时无条件打印该提示，
   与本次 fetcher 失败无关；pnpm 真正的 prepare-block 是另一个错误码。本插件无
   prepare/postinstall，tag 树自带 `lib/`，历史同类安装零 allowBuilds 全绿。加了反而按 README
   语义「以用户权限放行脚本执行」，扩大信任面。
3. **修法**：删 `/tmp` 确认无用的旧验证目录 + ISO（用户批 1234，约 4G，81%→50%），
   不碰 `/home` 应用数据；原样重试安装命令。

**Evidence:** agent-2 只读诊断（pnpm.log 事后只有 85 字节摘要是设计使然，CLI 模式 stdout
inherit 不进 buffer；profile mtime/lockfile 与「失败还原」行为一致）；我亲测
`git fetch --depth 1 origin tag v0.13.9` 修前 `EDQUOT` 修后 exit 0；
`plugin add` exit 0（10.5s），装机 `0.13.9` lock tarball `c93b2bf`，`lib/` 逐字节一致。

**Consequences:** 今后装机先看 `df -h /tmp` + 试 `git init` 写小文件；`allowBuilds` 只在报错变为
`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` / `Ignored build scripts` 时才加，且只加 pnpm 当时打印的
exact key。重试安装建议用 `script` 留全量终端（事后 pnpm.log 只有摘要）。

**遗留低严重（非本轮引入）**：`src/run.ts` rescue executor `catch` 后 `logger.warn` 再 `throw error`，
注释写 "Never throws into the run"——实际靠 `guardian.ts` 的 try/catch 兜住，run 不受影响。
v0.13.8 已是这样。属历史小瑕疵 + 双重 warn，后轮把 `throw` 改吞掉以符注释（agent-4 审出）。

## D-102 — 单次子调用预算可配，默认 120 分钟（2026-11-22，未发版）

**背景**：用户原话「守卫出了问题，10 分钟上限」：纽约天气 UI 那轮（截图：`任务进度 5/5 · 100%` 但
Guardian 连续 4 条「已触发整轮取消」）里子任务 10 分钟被掐。根因是三处写死的 10 分钟——
`src/timeout.ts` `CHILD_TIMEOUT_MS=600_000`（脚本竞速回退）、脚本镜像 `return 600000` /
`Math.min(3600000,…)`、`src/guardian.ts` `childTimeoutCapMs=600_000`（宿主预算上限）。D-097 只修了
宿主抢跑（宿主等脚本判完），没修「预算本身太小」。D-098 已论证「调大预算只会推迟误杀」——但那是
「杀错」语境；本轮用户要的是「别掐正常慢任务」，10 分钟对 UI 打磨类任务本就不够，这是预算不足不是误判。

**Decision:**
1. 新键 `childTimeoutMs`：schema（`clampedLimit('childTimeoutMs', 1000)` 走 `LIMIT_CAPS` 钳制通道，
   超限存值钳制不断行）+ `resolveConfig`（`integer(..., 1000, 7200000)`）+ 设置页（分钟编辑 1–120，
   `NUMBER_SCALES`/`unit.childMinutes`/中英 hint/第四行控件）+ 报告（`limits.childTimeoutMs`
   校验 + 渲染 `Child budget` 行）。键总数 16→17（README 中英 + LOCAL-TESTING + 三个 spec 的拼写表同步）。
2. 默认 **120 分钟**（`DEFAULT_CHILD_TIMEOUT_MS=7_200_000`，`src/timeout.ts` 与 `src/config.ts`
   各一份，`config.ts` 的 schema 默认读自 `CHILD_TIMEOUT_MAX_MS` 同源）：旧 `CHILD_TIMEOUT_MS=600_000`
   保留为「旧报告兼容锚点」——校验里 `childTimeoutMs===0 && config===600_000` 的旧脚本豁免分支要它
   讲清楚 0 是哪来的，不再做任何人默认值。
3. 上限 = 默认 = 120 分钟（`CHILD_TIMEOUT_MAX_MS` 3.6M→7.2M，`childTimeoutCapMs` 600s→7200s，
   脚本镜像同步）。超限存值钳制到默认本身，等价于「没配过」。
4. 脚本回退值与上限同步（`return 7200000` / `Math.min(7200000,…)`），host 传参
   `config.childTimeoutMs` 替代写死的 `CHILD_TIMEOUT_MS`（`src/run.ts`）。
5. 旧报告兼容：`limits.childTimeoutMs` 缺失不校验（旧报告没这字段）；`0` 只在
   配置仍是旧 10 分钟默认（`600_000`）时豁免——新默认下 0 是非法值，`resolveConfig`
   本来就拒收。新旧报告永远走同一条校验臂，不分叉。

**Reason（为什么上限不开放）：** 单次调用无上限 = 挂死的孩子永远占着 worker 池，
`maxRetries` 的重试也永远等不到。120 分钟是「UI 打磨类任务够用」与「挂死止损」的折中；
真要更长应该调 `timeoutMs`（整轮死线）而不是把单次竞速也放开——两者是父子关系（rule B），
不是同一个旋钮。

**Evidence:** `npm run ci` exit 0 — **80 files / 1525 tests PASS**（基线 1480 + 本轮 45：
timeout 9 处同步 + config/guardian/client/settings/docs/orchestrator/routing/engine 旧断言 + 新钳制断言）；
`npm run build` + `verify:lib` byte-identical。真机长任务实测 NOT_RUN。

**代价**：无 guardian 的 run 行为变化（10→120 分钟竞速）；旧 10 分钟报告在新默认下重验会失败
（字段 0 ≠ 7200000），这是预期的——旧预算本来就不是现在的预算。

## D-104 — Guardian 预算永远跟 `childTimeoutMs`，配没配判停路由只决定 adjudication 不决定预算（2026-11-22，未发版）

**背景**：用户截图「子任务存活判断预算 · 600 秒」：0.13.10 把脚本侧竞速改成 120 分钟，
但 `src/run.ts:863` 传 Guardian 预算时写了 `config.guardianModel === undefined ? undefined : config.childTimeoutMs`——
没配判停路由（默认空）的 run 退回旧预算 `min(deadline, 600_000)`，600 秒老根还在。设置页也找不到「守卫时间」：
`childTimeoutMs` 行叫「单次调用上限（分钟）」，Guardian 预算从来不是可配项（`GUARDIAN_LIMITS.childTimeoutCapMs` 写死）。

**Decision:**
1. `run.ts` 去掉三元，永远传 `config.childTimeoutMs`（默认 120 分钟）。配没配 `guardianModel`
   只决定卡住时是否走 adjudication 等一等，不决定预算是多少。
2. 设置页 `childTimeoutMs` 中英 hint 各加一句「守卫判停预算同样跟这个数」——一行文案，不新增键。
3. 回归钉死：`test/guardian.spec.ts` 加一例 `guardianChildBudgetMs(7_200_000, 7_200_000) === 7_200_000`
   且 `guardianChildBudgetMs(3_600_000, 7_200_000) === 3_600_000`（「有无路由预算一致」）。

**Evidence:** `npm run ci` exit 0 — **80 files / 1526 tests PASS**（+1 新例）；`build` + `verify:lib`
byte-identical。真机实测 `CONFIRMED`（见 VALIDATION D-104 段）：`DSH_HOME` 副本 + `bifrost-completions`
真实模型 `agent2api/deepseek-v4.1-flash`（chat 探活 200），`guardian-start.budgetMs=7200000`，
`guardian-end {cancelled:false, findingCount:0}`，`artifact.txt` 含 `GW-SMOKE-OK` 且报告 completed 1/1 verified。

**代价**：无——之前没配路由的 run 预算从 600 秒变成 120 分钟，正是用户要的「默认 120 分钟」。

## D-103 — 跑中转向只能是「波边界拉取」，不能是「host 推送」（2026-11-22，设计待拍板）

**背景**：用户 2026-11-22 提的想法——主会话当沟通渠道，跑中发的消息转给规划助手重新规划、加任务。
实查后真问题不是「会话被占死」（team 档后台跑时本来就能聊），而是「跑中一说话就整轮取消 + 窄重启」：
`src/gate.ts` 的 Redirect-on-new-message 路径把 live run 掐掉，靠 `carriedPendingRequest()` 拼需求重开。
正在跑的那一波白跑，planner 也可能把已 retained 的活重规划一遍。

**Decision:**
1. 跑中消息在通道侧**排队不取消**（显式 `/stop` 仍立即取消），立即回一句 ack 说明会在下一波边界并入。
2. 取用只能由脚本在**波边界**发起一次 `agent()` 完成（`runWaves()` 每波结算后），
   因为沙箱里 host→script 没有通道：realm 是 `vm.createContext({})` + 六个全局（`agent/parallel/pipeline/phase/log/args`），
   `args` 起跑即 `structuredClone`，`WorkflowRun` 只有整轮 `cancel(reason)`，孩子一次性（见
   `docs/knowledge/evidence/midrun-channel-steering-2026-11-22/`）。
3. 合流判定写成纯函数（`src/steering.ts`，尚未创建）：只许改未启动的波与任务，已结算任务终态只读；
   校验与 planner 首轮同一套 fail-closed（依赖只认 verified、禁环、波数 ≤ 8、总数 ≤ `maxTasks`）；
   非法即拒、整轮不动、台账记 rejected。
4. 开关 `channelSteering` 默认关；关时与今天逐字节一致。转向不延长 deadline、不改 objective。
5. 没并完的 intent 走 `carriedPendingRequest()` 进下一轮，与 L1 继承同一条路，不丢不重放。

**Reason:** 不改 DSH core 是 `AGENTS.md` 硬约束；「留一个常驻规划孩子让脚本随时问」不成立（孩子一次性、脚本无 fs 无定时器）；
引擎级注入接口不存在，`dsh-agent-teams` 同样做不到（`PLAN` §10.2 X1）。拉取是唯一不碰 core 的通道。

**Alternatives rejected:** (a) 改 core 加注入接口；(b) 脚本轮询文件（realm 无 fs）；(c) 宿主改 `args`（起跑即克隆）；
(d) 保持「取消 + 重启」（用户抱怨的正是这个：丢在跑的一波）。

**Evidence:** 设计 `docs/knowledge/DESIGN-midrun-channel-steering.md`（附录 A 逐条 `CONFIRMED`）；
`npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts test/docs-architecture-version.spec.ts`
→ 23 tests PASS（docs-only 改动不破文档守卫）。实施 NOT_RUN（本决策只到设计，用户未拍板）。

**Cost / open:** 每边界一次 cheap 模型调用（上限 `min(波数,4)`，计入 `maxTotalAgents`，撞 `AGENT_CAP` 要一起算）；
无 intent 也付一次调用。省钱的「搭车」变体与其余五个选择见设计 §8 D1–D6。

## D-105 — 通道侧收敛成「一个决策点 + 每轮一个通道生命周期」；取消只认裸叫停（2026-11-22，未发版）

**背景**：D-103 定了「波边界拉取」的地基，实施被拆成两个 lane。本 lane 只做**通道侧**
（`src/channel.ts` + `src/gate.ts` + `src/run.ts`），合流与 boundary 拉取属 planner_replan lane
（`src/steering.ts`/`src/replan.ts`/`src/script.ts`）。实施中发现三个必须定死的问题，每条都写进代码。

**Decision:**
1. **单一决策点**：通道接纳只有 `answerOnChannel()` 一处，放在 `answerInTurn` 里、team/full 两条
   接纳之前。理由：跑中消息是「对活计划的补充」，不是新请求；它的 tier 不该由它自己的长短决定
   （实测：一句「再加一条…」在 triage 档会被判 fast，从而绕过 team 接纳，永远进不了计划）。
   收掉了 team 接纳与 full 接纳里各一份的重复 steering 块。
2. **取消只认裸叫停**：`classifyChannelMessage()` 只把裸 `停/停下/取消/stop/cancel…`（或短句里的强祈使）
   判为 stop；带问号、含 stop 字的长任务（`停止旧的缓存策略`、`写一个停车位管理页面`）一律 forward。
   非对称是安全边界：「猜你想停」花掉全部在飞的活，「多排一条要求」只花一个边界。
   没有在跑的任务时，裸叫停回一句「没有在跑的任务」，**不派工**（否则「停」会花掉 planner+worker+verifier）。
3. **每轮一个通道生命周期**：`runChannelRound()` 开通道 → `runTeam(steeringToken)` → 交付 → `finally`
   里先 `take()` 再 `closeSteering()`。开关放在 gate 而不是 `runWorkflow`：run 自身的早退
   （per-session cap、启动前取消、请求构建失败）不会漏一个队列在 `bySession` 里吞掉下一条消息。
   `run.ts` 只加 `steeringToken?` 透传，不持有通道状态。
4. **未取用即带入下一轮**：`finally` 里 take 到的 intent 用 `composeCarriedRequest(上一轮 objective, 要求)`
   递归开下一轮（台账 `steer-carried-to-next-round`）。所以一条要求只有两种结局：被边界并进活计划，或开下一轮；
   不会两头都占（take 是唯一消费点），也不会丢。
5. **intent 带对话上下文**：`composeIntentText()` 把用户原话 + 有界对话快照（`collectHistory` +
   `firstAnswerContext`）装进同一条 intent，请求优先不截断、上下文被截时标 `…`。
   理由是边界子只看得见「剩余波 + 已结算摘要」，一句「改成 C」单独出现是不可解释的。

**Reason:** 通道的正确性只能靠「只有一个消费者 + 只有一个取消入口 + 只有一个决策点」保证；
分散实现会重演本次实测抓到的两个坑（tier 绕过、idle-stop 抢在 live-run 判断之前）。

**Alternatives rejected:** (a) 在 team/full 接纳里各写一份通道块——tier 依赖，已证会漏；
(b) 在 `runWorkflow` 里开通道——早退路径泄漏队列；(c) 让 stop 也走「并入」——用户叫停就变成加任务；
(d) 未取用 intent 直接丢——用户的话消失，正是要消灭的失败模式。

**Evidence:** `test/channel.spec.ts`（41 例，含 A1–A5 逐条）+ 证据目录
`docs/knowledge/evidence/session-channel-2026-11-22/`；`npx vitest run test/gate.spec.ts
test/grok-on-ingress.spec.ts test/phase1-dialogue.spec.ts test/triage-recall.spec.ts
test/composition.spec.ts` → 128 PASS。全量 `npm run ci` 与真机 GUI 手势 NOT_RUN。

**Cost / open:** 通道只在 `replan: true` 时打开（默认关，见 D-104 相邻的配置口径）；
`replan` 关闭时行为与发版版一致，跑中消息仍旧各自成轮。子任务级热取消仍是非法（引擎无 per-child 句柄）。


## D-106 — 进度脊柱：带编号的计划任务永远优先于阶段关键词（2026-11-22，未发版）

**背景**：用户报 session-076c2337 的进度页：规划下面的「执行」行是任务 1–6 跑完后加上去的，
问「它为什么在规划下面，而不是任务 7」。实查会话事件：那一行的 phase 是
`任务 7 · 合并为干净可并发执行计划`，标题里带了「执行」二字，被 `stageForPhase()`
按 `执行` token 收进脊柱的 `执行` 段，而不是任务带里的任务 7 卡片。任务没丢，
是显示分错了筐。

**Decision:**
1. `stageForPhase()` 先看 `taskNumberIn()`：phase 带 `任务 N` / `Task N` 前缀的一律
   返回 undefined（不进脊柱），由任务带按编号成卡。脊柱只收真正的阶段行
   （`规划`、`执行`、`检查`…）与英文阶段词。
2. 双实现同步：`src/progress-tab.ts`（TS 纯函数）与 `src/client/index.js` 手写镜像
   （`progressStageForPhase` + 前置的 `progressTaskNumber`，同作用域函数声明提升可用）
   同改；共用同一回归用例形状（任务 7 标题含「执行」，断 spine 为空、extra 为 1）。
3. 导出性变化：`stageForPhase` 由模块私有改为 `export`，供测试与将来复用；行为上
   只收窄（带编号的不再进脊柱），不带编号的行与之前逐字节一致。

**Reason:** 编号是引擎写死的（`taskGroupTitle`），标题是 planner 现场编的；
用编号判定永远不会被标题里的阶段词污染。用「后来者优先」修标题黑名单是补不完的。

**Alternatives rejected:** (a) 标题避开阶段词——靠人记住，不可靠；(b) 脊柱关键词加白名单——
标题空间无界，拦不住「执行回归」这类正常词。

**Evidence:** 会话 session-076c2337 事件（seq 318 `任务 7 · 合并为干净可并发执行计划`）；
`test/progress-tab.spec.ts` + `test/client.spec.ts` 各 +1 回归（任务 7 形状）；
真机隔离 soak（见 VALIDATION）：live headless 跑出同形状 phase，fold 后任务 7 成卡、
spine 为空，pre-fix 形状会进脊柱。

## D-128 — 到达顺序写在行上（`TaskRecord.seq`），不再靠文件序；旧账本按文件序补盖（2026-11-24，未发版）

- **Status:** CONFIRMED
- **Date:** 2026-11-24
- **Decision:** 任务板每行带一个到达号 `seq`：`create` 时在认领锁内取「盘上最大值 + 1」，落盘保存；队列读
  `TaskBoard.arrival()`（按 `seq`，同号再按 id），调度器的待办队列读 `DispatcherSession.pending()`，`resume()`
  额外回 `pending`（队列长度）。`list()` 保持 id 序不动。旧账本（没有 `seq` 的行）在读取时按**文件序**补盖，下一次
  落盘写回，等价于一次就地升级，不重排、不丢行。
- **Why:** 落盘时行是**按 id 排序**写的，所以文件序不是到达序。用 id 序当队列序会真的排错队（`task-10` 排在
  `task-9` 前、`b` 排在 `a` 前），而且这个错误在重启后才显形——正是「重启后队列顺序变了」这一类最难查的偏差。
  把序号写在行上，顺序就随行一起持久化，重启前后同一个队列。
- **Alternatives considered:**
  1. 用 `createdAt` 排序：时间戳只有毫秒精度，同一毫秒创建的两行无法定序，测试里连建三行就会撞上（否）。
  2. 改落盘顺序按到达序写：等于让文件序承担语义，而 `list()` 的 id 序是既有契约，两套顺序会互相污染（否）。
  3. 恢复分支原来的 `board.json` v2（自带 `queueSeq`）：那是与 `store.jsonl` 并行的第二个板文件，正是 main 在
     `9dc7624` 里拆掉的东西（否）。
  4. 不做：调度器现在还没有真正消费队列的调用方，但「重启后顺序变了」是可观测行为，留缺陷等消费方接入时再修更贵（否）。
- **Consequences:** 行多一个可选字段，行格式向后兼容（老行没有 `seq` 也能读、能升级）。到达号只在 `create` 时分配、
  永不复用，删行不会回收（`max + 1` 取自盘上现存最大值，删掉最大值那行后，下一个新行可能复用该号——同号时按 id
  定序，行为仍确定）。**`seq` 只表达创建顺序，不表达优先级**；要优先级得另加字段，不要复用 `seq`。
- **Evidence:** `test/taskboard.spec.ts` 的 `keeps arrival order across a restart, which id order does not`、
  `opens a store written without arrival numbers without reordering it, and appends new rows after`；
  `test/dispatcher.spec.ts` 的 `resume restores every pending task in arrival order, losing none`；
  跨进程/FIFO 探针实测见 `VALIDATION.md` 2026-11-24 条目（main 产物重开后回到 id 序，rebase 后 `arrival()` 回到创建序）。

## D-127 — 任务板的 CAS 必须对着磁盘校验，改动期间持独占锁；结构性冲突之外不做分布式协调（2026-11-23，未发版）

- **Status:** CONFIRMED
- **Date:** 2026-11-23
- **Decision:** `src/taskboard/` 的每次改动（create/claim/assign/setDependencies/complete/fail/block/requeue）都在
  独占锁文件 `<dir>/.store.jsonl.lock` 内执行「重读账本 → 按磁盘版本做比较交换 → 落盘」。CAS 的比对对象是磁盘上的
  行，不是句柄里可能过期的内存副本。
- **Why:** 旧实现按内存整份重写 `store.jsonl`：两个句柄读到同一版本后各自认领同一行，两边都返回成功，文件只留最后
  一个归属（同任务双认领）；同时认领不同行时会互相冲掉（丢更新）。对「调度真相」层来说这是致命缺陷——认领协议存在
  的意义就是防止两个 worker 抢到同一件事。
- **Alternatives considered:**
  1. 只加锁不重读：锁内仍用旧内存副本，跨进程丢更新依旧存在（否）。
  2. 改成 append-only 单行追加日志（`O_APPEND` 小于 PIPE_BUF 的写近似原子）：不丢更新且无需锁，但要改行格式与
     读取语义（按 id 取最后一条），与已发布的 v1 行格式和「原子整体替换」文档冲突，且无法在锁内同时保证
     「重复 id」「依赖前置」这类跨行不变式（否，留作后续演进）。
  3. 引入真正的分布式协调（租约服务、文件系统 flock）：超出单机插件范围，网络盘语义不可控（否）。
- **Consequences:** 每次改动多一次读盘 + 一次锁的 open/unlink；板最多 1024 行、1 MB，代价可忽略。锁是单文件系统内的
  咨询锁，不防恶意绕过；`O_EXCL`/rename 语义在网络盘上不保证，多机共享板不在支持范围。持锁进程被杀留下的锁按
  `lockStaleMs`（默认 5 s）判废弃并清掉，因此崩溃不会永久卡死板（代价：真并发下最长等 5 s 才接管）。
- **Evidence:** `test/taskboard.spec.ts`（rebase 到 `main` 后 26 例：同任务双句柄单赢家、不同行不互相冲掉、SIGKILL 子进程恢复、
  持锁进程被杀后锁清掉、活锁尊重到超时、撕裂账本拒读、中断写 tmp inert、跨重启 id 唯一与 CAS 守卫、位置解析、到达顺序）；
  `docs/ARCHITECTURE.md` 任务板章节；`docs/knowledge/VALIDATION.md` 2026-11-23 条目。

## D-108 — 团队调度层三件套：任务板真相 + 大管家白名单 + 交接契约四行（2026-11-23，未发版）

- **Status:** CONFIRMED（本轮三 lane 落地，85 文件 / 1617 测试 PASS，独立复验通过）
- **Decision:**
1. 调度真相独立于执行：`src/taskboard/` 落盘任务板（原子 jsonl + checksum，CAS 认领，completed 不可变，依赖前置检查），与现有 checkpoint（运行快照）分开——板是「要做什么」，checkpoint 是「跑成什么样」。
2. L1 只做记事分派回收：`src/dispatcher/` 纯决策层，白名单四项放行、三项（改已完成/改正在跑/改 verdict）硬拒绝；verdict 只能 verifier 写，大管家不能改分。
3. 交接契约固定四行（结论/证据指针/未决问题/下一步），证据必须带可复验指针（路径 + checksum/行号），裸文字自述打回；`src/report.ts` 只做增量 append，不动主流程。
- **Alternatives rejected:** (a) 复用 checkpoint 当任务板——checkpoint 是运行快照语义，无 CAS/依赖/不可变约束，硬套会污染恢复语义；(b) gate 里直接写调度逻辑——gate 已够复杂，独立模块可测，大管家以后常驻化也有地方放；(c) 契约放宽允许空未决问题——「无未决」本身也是一条有效信息，显式写 `none` 比空着更诚实。
- **Evidence:** `test/taskboard.spec.ts` 13 例 + 独立复验（依赖阻塞/CAS 冲突/重启恢复）；`test/dispatcher.spec.ts` 11 例；`test/handoff.spec.ts` 15 例（缺字段/裸文字打回）。

## D-109 · 405 的插件侧第二成因：挂载靠三个服务、读请求只能 POST

- **时间**：2026-11-23 · **状态**：`CONFIRMED`（源码与测试）· **来源**：`manual-sessions-unfinished.md` Sec.2-3
- **问题**：设置页总开关按一下就报「模式服务没有回应：the mode route answered HTTP 405」。0.13.16 只补了
  「缺 webServer 就打 warn」，没解决另两种同样静默的情形。
- **读到的源码事实（`CONFIRMED`）**：`src/mode-surface.ts` 的 `installModeRoute` 用
  `inject(['webServer','connection','sessions'])` —— 三个服务同时可用才回调，缺一个就整条路由不挂；
  该回调里 `handleModeRoute` 对非 POST 一律 `ModeError('mode/method','POST only')` → 405；
  客户端 `parseModePayload` 只有在响应体带 `error` 时才显示服务端那句，空包体 405 就退化成
  "the mode route answered HTTP 405"。所以「空包体 405」必然来自**不是本插件**的应答（宿主 fallback）。
- **选定的做法**：挂载只要求 `webServer` + `connection`；会话服务改成按请求 `resolveSessions()`（先 `ctx['sessions']`，
  再 `ctx.get('sessions')`），取不到回 `503 mode/unavailable`。读请求同时接受
  `GET ?action=status&sessionId=…`（写一律拒绝，URL 不留状态变更）；被拒的方法带方法名与 URL 记 warn。
  客户端：读取遇 405 用 GET 重试一次，失败时用 `mode/method` 码并点名「方法被拒」。
- **没选的替代**：① 让客户端只发 GET（写就得靠别的通道，且状态变更进 URL 会留下 prefetch 触发的风险）；
  ② 改宿主让它接住未知路由（AGENTS.md §4/§5 禁止碰核心）；③ 给插件加第二个状态存储（会破坏「只有一条真相」）。
- **验证**：`test/mode-surface.spec.ts` 24 例（含「GET 读成功」、「GET 写被拒 405」、「PUT 被拒且 warn 带方法名」、
  "没有 sessions 服务但 `get('sessions')` 可达时仍挂载并读成功"、「完全没有会话服务回 503」）；
  `test/client.spec.ts` 新增两例（405 后 GET 重试成功；两路都被拒时报 `mode/method` 且写不重试）。
- **仍然未知（`HYPOTHESIS`）**：操作员当时那一次究竟是「路由没挂」还是「前置代理只放行 GET」，现场无日志可判。

## D-110 · 进度页跨阶段连线：一条公共弯道 + 一根公共轨（按 2026-11-21 原话收口）

- **时间**：2026-11-23 · **状态**：`CONFIRMED`（源码与测试）· **来源**：`manual-sessions-unfinished.md` Sec.3-1
- **原话**：「进度页跨阶段的线太多，合并成一根」。当时只看了效果图，没有开工。
- **做法**：`measureProgressWires` 保留每个环节自己的圆点下垂段与每张卡的短接线，但把
  「每环节一条弯道 + 一条竖槽」改成整带共用一条弯道与一条竖槽，竖线只画一次、成为一根连到最深卡片的 `rail`。
  卡片左边距、槽宽、状态色（连线永远不带状态色）全部不变。
- **代价**：两个环节共用竖槽后，肉眼靠「线在哪一条槽」分辨归属不再可能——归属改由各自的圆点下垂段和卡片短线承载。
  这是原话要求的直接结果，已记入分歧日志供操作员复核。
- **验证**：`test/progress-connector.spec.ts` 19 例，新增「两个环节只画一根轨、共用同一弯道与同一竖槽」；
  `test/client.spec.ts` 连线中性用例改为断言 `['trunk','branch','rail']`。

## D-111 · Sec.2-7 与 Sec.3-2/3/4/5：本轮记账不实现（待操作员一句话）

- **时间**：2026-11-23 · **状态**：Sec.2-7 `BLOCKED`（待拍板）；Sec.3-2/3/4/5 `BLOCKED`（待拍板/越界）
- **口径**：本轮任务允许「严格按原话执行并记分歧」，但源文件对这五项写的不是「去做」，是「要不要做/要不要重新确认/你定」。
  在操作员没有给一句话之前硬做，等于替操作员拍板——尤其 Sec.3-3 会改变汇总的**真值来源**（从确定性检查改成
  模型角色复核），成本与误拒后果都要人认。
- **逐项**：
  - Sec.2-7 宿主证据收集：仓库确无 `src/evidence*`（`CONFIRMED`）。建议第一刀做成"一份去密钥的宿主事实快照
    （插件版本/宿主版本/运行时/生效配置摘要/本轮任务数）随报告一起落盘"，接进 `renderReport` 的可选段，
    不新建独立通道。等一句话即可开工。
  - Sec.3-2 429 勾选框：`triageModel` 整套已被移除（`CONFIRMED`，`src/triage.ts` 只剩命名/角色解析）。
    需求描述的是被删掉的那套机制，原样实现等于复活已删的架构；要不要以「角色链失败后的显式换人条件」重做需拍板。
  - Sec.3-3 汇总走检查/复核角色：现状是 `src/script.ts` `reviewSummaryDraft`（check + 独立 verify，纯确定性，
    失败回退确定性叙述而绝不回退模型文本）。改成走配置的 verifier/supervisor 模型角色会花额度、并把
    「假通过」的风险重新引入模型自评；要么确认现状即满足原意，要么明确「要模型角色复核」再改。
  - Sec.3-4 答案长相一致：只有操作员能判，需要一次开/不开插件的人工并排比对（`NOT_RUN`）。
  - Sec.3-5 绘画任务失败：本插件无图像功能（`CONFIRMED`），失败不在本仓库；继续查需要操作员授权范围。

## D-112 · Sec.2-7 宿主证据收集：仍是 `BLOCKED`，但第一刀已经画好（2026-11-23）

- **时间**：2026-11-23 · **状态**：`BLOCKED`（等操作员一句话：做 / 不做）
- **背景**：源会话 `session-7fed81c2` 的原话是「第三阶段：为 dsh-grok-workflow 实现 Host Evidence Collector
  （宿主侧证据收集与核验）」。仓库里确实没有 `src/evidence*`（`CONFIRMED`，`ls src` 无该模块），这一阶段从未开工。
- **为什么不在本轮开工**：源文件自己的「差什么」写的是「先确认这一阶段还要不要做」，不是「去做」。
  这一项与 Sec.3 的五件不同——那五件是「要不要这么做」的取舍，这一件是「还要不要这个阶段」的存废。
  在没有那句话之前写代码，等于替操作员决定要不要维护一条新的证据通道。
- **第一刀（等一句话即可开工，成本约一天）**：
  1. `src/evidence.ts`：纯函数 `collectHostEvidence(input)` —— 输入是宿主已有的值（插件版本、DSH/config 版本、
     运行时与平台、生效配置摘要 `describeResolvedConfig`、本轮任务数与并发上限、checkpoint 接线标记），
     输出 `{label, value}[]`，只读、无 shell、无网络、无密钥；`renderHostEvidence()` 渲染成单段，字符数封顶。
  2. 接线：作为 `renderReport` 的**可选段**（`showDiagnostics` 打开时才出现）与诊断台账的一行，
     不进人话块、不进 relay 标记内文本——证据是给维护者看的，不是给读者看的。
  3. 核验：`test/evidence.spec.ts` 钉住「只含白名单字段 / 字符串封顶 / 无密钥形状 / 同一输入两次渲染逐字节一致」。
- **不做也可以**：现有 `renderReport` + checkpoint + 进度节点已经覆盖了「这一轮到底跑了什么」；
  宿主侧证据额外回答的是「跑在什么样的宿主上」。若操作员认为这层不需要，本条直接结案、不再排期。

## D-113 · 手工清单 12 项顺序执行（第 2 轮）：逐项落地或记账（2026-11-23）

- **时间**：2026-11-23 · **状态**：11 项落地 / 1 项 `BLOCKED`（Sec.2-7）
- **口径**：`manual-sessions-unfinished.md` 第二节 7 件 → 第三节 5 件；一项一分支（自合完的 `main` 尖端开），
  合前 `npm run ci` 必须 exit 0。十二项**每一项**都有自己的分支与绿日志：`.rsi/evidence/rsi-seq-12/logs/ci-r2-*.log`。
- **决定 1（Sec.2-2）：replan 默认改成开。** 原话是「主会话应该永远能插话，但现在默认关着」，
  上一轮选了「给开关、默认关」，只满足了原话里的「或者」分支，没解决「默认关着」。本轮改成默认开：
  只有跑中真的来消息才花一次规划调用（每轮至多 4 次），设置页开关保留。代价写进 CHANGELOG 与 README。
- **决定 2（Sec.3-2）：只把操作员点名的 429 做成勾选框，不复活整套 `switchOn`。** T4 已把按类别配置删除，
  整表复活等于推翻既有瘦身；新增 `switchOnRateLimit`（默认开）只暴露「429 要不要换人」这一个判断，
  关掉时脚本收到其余六类白名单。方向由操作员原话决定，范围是本轮的取舍。
- **决定 3（Sec.3-3）：汇总门保持确定性，但把判定写进报告。** 改成走 verifier/supervisor 模型角色会花额度、
  并把「假通过」重新交给模型自评；本轮不动真值来源，改为让两道门的判定可见（`synthesis.review` +
  报告 `Summary review:` 行）。若操作员要的是「真要模型复核」，那是新决定，代价照实说。
- **决定 4（Sec.2-1 / 2-5 / 2-6 / 3-1）：代码已在，补的是钉子。** 这四项的实现分别在 `1591665`、`adc7fb4`，
  本轮不为「再合一次」而重写；每项仍走自己的分支，落地的是能让它不再退化的东西：
  Sec.2-1 宿主工具死线与双 README 默认值、Sec.2-5 设计文档六段脊椎守卫、Sec.2-6 `resumeCarryover` 抽取+用例、
  Sec.3-1 连线模型文档。
- **决定 5（Sec.2-7）：`BLOCKED`，见 D-112。** 源文件自己要求先确认阶段存废；第一刀设计已写清。
- **分歧日志（9 条）**：见 `.rsi/evidence/rsi-seq-12/ROUND2.md` §5，供操作员最终复核。
- **未做**：未发版、未打 tag、未 push、未 npm publish；12 条 `rsi/*` 分支保留在本地供复核，判定删除日期 2026-11-24。

## D-114 · round-071 队长三件套：确认归 triage、停/改归模型、记忆归台账旁（2026-11-23）

- **时间**：2026-11-23 · **状态**：代码落地、未提交（分支 `captain-pack`）
- **决定 1（确认轮的开关位置）**：确认轮只属于前台（`mode: triage`），不新增配置键。
  理由：`/grok on` 已承诺「完整工作流」，再问一遍拆法是违背承诺；部署级 `full` 也不该被塞进一层问询。
  代价：想关掉确认只能用 full 模式（较粗）；若操作员要单独开关，那是下一个决定。
- **决定 2（「停/改」放计划字段）**：模型通过 `onFailure: "stop"` 表达「某项没过验收就别往下跑」，
  脚本只执行、不解释；非法值按 `continue`，旧计划含义不变。未做「边界再问一次模型」的版本：
  它会在每次失败边界多花一次 planner 调用，且与 `replan` 的边界调用叠加，代价不划算。
- **决定 3（三叠纸落在台账旁）**：`profile.md` / `experience.md` 与 `archive.jsonl` 同目录
  （`archiveDir()` 同一解析链），不新建目录、不写 live 家目录以外的地方；画像只由显式写入方
  （记忆 CLI）维护，不从对话自动抽取——「什么值得长期记」是要模型判断的，本轮不扩大。
- **决定 4（旧用例只补一步、不放宽）**：团队档改为「先确认」，三条既有用例（triage 两条、
  partial-head 的 `deliver`、channel 的跑中插话）都只是先发一条「确认」，原断言原样保留。
- **代价/缺口**：确认轮的预览是一次独立轻调用，正式跑仍重新规划（两次规划）；`verify:lib` 不覆盖未提交
  工作树，提交前须重跑 build 并连 `lib/` 一起提交；真机 soak `NOT_RUN`。

## D-115 · 最终答案：块是原料、主模型重写；synthesizer 允许三段、caveat 自己写（2026-11-24）

**问题**（`CONFIRMED`，session-d5c5f541-3a07-40ba-8e49-f334d710a32f）：交付出去的答案是台账摘要，
200 字电报体，而且只取了第一句。四处成因：默认 relay 让主模型逐字复述块内文本（块即答案）、
`answerLead` 只取第一句（400 字上界）、`relayText` 硬编码双语、synthesizer 被限死 200 字无标题
且 uncertainties 由附注原文贴。

**决定**（四条，落地在 `src/answer.ts` / `src/delivery/index.ts` / `src/script.ts`）：
1. 默认 relay 是**改写**：`REWRITE_PREAMBLE` 要按用户原问题作答、说清交付物在哪怎么打开、
   禁台账标签与字段名；标记线内是**原料**（整段 summary + 交付物路径 + 最多 4 条 caveat）。
   失败态**仍逐字复述**——改写是自由的，一个读起来像答案的失败报告比没有答案更糟。
2. `answerLead` 吃整段 summary（zh 700 / en 1400 字上界，断在句/词边界），完成态补
   「做成了：…」+「交付物：<路径>」；`MACHINE_DETAIL` 对**交付物 locator** 开显式例外
   （占位符进出，仍只放行这一份清单），其它路径/命令/摘要照旧删。
3. 默认**单语**：`relayText` 传 `bilingual: false`，语言跟随 `opts.lang`（请求语言）。
4. synthesizer 笼子放宽：允许「结果：/怎么用：/注意：」三段（别的标题、列表、Markdown 仍拒），
   叙事上界 700 字 / 300 词；**caveats 由它重写**，`layeredNotesBlock` 不再原文贴 uncertainties，
   门禁把「每条原句必须出现」换成「必须有 caveat 段」（`hasCaveatSection`，check 与 verify 两侧都查；
   确定性回退的 `待确认`/`Open questions` 也算）。

**取舍与代价**（写清，供复核）：
- 丢掉的是「逐字覆盖」这条最强保证：模型现在可以重写 caveat，理论上可以写得很淡。换来的结构保证是
  **caveat 段必须存在**（缺段直接打回，三次后落确定性回退），以及 `polishGuardrail` 原有的
  否认/编造/机器 token 拦截全部保留。为什么接受：逐字贴原文正是「电报体 + 重复」的来源，而且它把
  报告腔直接搬进答案。
- 单语的代价：语言猜错时读者会拿到一种陌生语言（旧的双语镜像就是为这个）。取舍依据是
  `TriageLang` 现在来自请求本身而不是空话，且双语让每条答案都长一倍、只为了让其中一半可读。
- 交付物路径开了例外，其余路径仍删：路径是「东西在哪」的答案，删掉等于把结论挖个洞；
  但报告里随手引用的 `src/x.ts:12` 对读者无用，照旧删。

**备选（未采纳）**：① 只把 `FIXED_SHOW_DIAGNOSTICS` 打开——那会把台账塞进可见块，正是要修的病；
② 让 delivery 层直接写最终答案、不要主模型参与——拿不到「按用户原问题重写」这一步；
③ 保留「逐字覆盖」只提高字数——电报体的根因是指令形状，不是长度。

## D-116 · T1 null 语义塌陷：宿主侧后置回填（已实现，未合流）；哨兵包只留备选（2026-11-24）

- **Status:** CONFIRMED（实现 + 单测）；真机 soak `NOT_RUN`（留给合流方）
- **Date:** 2026-11-24
- **分支:** `fix/null-collapse-t1`（worktree `.agents/worktrees/fix-null-collapse-t1`，从 `main` `6b0eb62` 开出）
- **问题（`CONFIRMED`）:** 引擎把「子代理死掉」和「没交结构化结果」折成同一个 `null`（证据见
  `RESEARCH.md` 2026-11-24 条）。`src/script.ts` 的 `callRole` 只能一律记 `format-error`；
  agent-99 的 3691 次子调用里有 530 次传输/鉴权/超时被写成格式错，真格式错 25 次（误标率按那批样本算约 95%）。
- **决定:** 不碰引擎、不改脚本路由，在插件自己的 seam 上取证、在报告层回填：
  1. `src/team-engine.ts` 的 twin 装饰 `subagents.startActivation`（本来就为 label 存在），把 run handle 的
     `result` 结算值（`stopReason` + `diagnostic`）连同 `childId`、从提示词首行解析出的 role/attempt、route
     记进 `src/child-outcomes.ts` 的有界台账（`CHILD_OUTCOME_LIMIT = 512`，FIFO）；拒绝也算一条（`stopReason:
     'rejected'`）。台账按 `ctx` 一份，`mark()`/`since(mark)` 让证据按 run 切。
  2. `src/run.ts` 在报告通过 `assertWorkflowReport` 之后、`redactDeep` 之前调
     `reclassifyNullCollapses`：只改"class 仍是 `format-error` 且原因含 `no valid structured result`"的行，
     并且**只在证据无歧义时**改——该角色（优先精确到 attempt）的所有子代理必须死因同类，
     且同组里不能有真的"`completed` 但没交结构化结果"的子代理。改 class/reason/category，
     连带把 `incomplete` / `errors` / `task.error` / `plan` 里那句同文改成新类（否则文案还留着旧结论）。
  3. 新增失败类 `cancelled`（`types.ts` + `report.ts` 白名单），归 `cancelled` 类别：被取消既不是格式错，
     也不能被读成「重发就有用」。
  4. `classifyFailureText` 两个表（guest 与宿主镜像）都加了 401/403/unauthorized/forbidden/permission denied
     → `model-unavailable`：403 以前落 `unknown`，读起来像「不知道发生了什么」。两表由
     `test/null-collapse.spec.ts` 从 `WORKFLOW_SCRIPT` 里把 guest 函数抠出来逐条比对，钉成一张表。
  5. `src/memory/recorder.ts` 的兜底文案接一个 `childCause(childId)`：子代理没留下任何文字时，
     归档不再只说「它的 transcript 里既没有文本也没有结构化提交」，而是补上真实死因。
- **为什么不上「让引擎抛错」这条更彻底的路:** 剧本能把 `AGENT_RESULT` 的 message 分类成真因（并且天然
  不会触发同次补交），但 rejection 要跨 PTC 的进程边界，错误文本能否完整带过去在 `engine-harness.ts`
  的 in-process 运行时上**证不出来**（harness 自己的注释就写了它证明不了进程隔离）。按 AGENTS.md 的
  「证据说不清就不许写 CONFIRMED」，本轮不做。
- **已知边界（诚实记账）:** 回填只改**报告**。脚本那次决定已经做完了，所以一个 403 子代理仍会花掉一次
  「同次尝试补交」、仍会走完路由链——「403 不烧链路」这句在行为上还不成立，只有「403 不再被写成格式错」成立。
  同一 run 内并发另一个 run 的子代理也会落进同一个台账窗口，靠「同 role/attempt 且死因一致」的收敛规则兜住
  （不一致就不改，宁可保留旧文案也不新增一处分不清的标签）。
- **备选（结构性第二步，本轮只登记、不实现）:**
  - **B1 哨兵包（首选）:** 引擎的 `null` 换不成哨兵，那就换一层——把「子代理终态」作为 `agent()` 的**返回值旁路**
    传给脚本：插件在 twin 里给每个 activation 分配一个 run 内单调序号，宿主侧维护 `seq → {stopReason,
    diagnostic}`，并把这张表作为 `args` 的一部分随**下一次** `start()` 注入（同一 run 内不行），
    即「下一轮知道上一轮的死因」；只适合跨轮预算/路由调整，不适合当次尝试决策。
  - **B2 让脚本看见死因:** 需要引擎在 `childResult` 里带上 `diagnostic`（上游改动/提 issue），或
    允许脚本注册一个「子代理终态回调」。这是唯一能让「403 不烧链路」自然成立的路，属于上游改动。
  - **B3 宿主主动降级路线:** 一个 route 在 run 内连续 `N` 次同类死亡后，宿主把这条 route 标记为
    「本轮不可用」，后续 run 的 `buildWorkflowRequest` 直接不派给它（`busyHint` 已有类似通道：跨 run 提示）。
    比 B1 简单，但同样管不到当次尝试。
- **Consequences:** 误标消失（报告/答案/记忆三处都说真因）；分类表一处改两处生效；`cancelled` 进入失败类
  词表；已知边界写进 `VALIDATION.md`，不是悄悄省略。

## D-117 · 子代理终态台账要读引擎**真正发的** spec 形状；spawn 路径没有 diagnostic（2026-11-24）

- **Status:** ① CONFIRMED（已修，`release/0.13.26` 未发）；② CONFIRMED（实测与引擎源码都确认），未修
- **来源:** `release/0.13.26` 的隔离真机 soak（round 077，`.rsi/evidence/round-077/soak.txt`）
- **① spec 形状（已修）:** 原实现按 `spec.request.prompt` / `spec.request.agentOptions` 读标题与路由，但已发布引擎
  `dsh-workflow-ptc` 传给 `subagents.startActivation` 的是扁平 spec（`prompt`/`agentOptions` 在顶层，
  `lib/index.js:330-346`）。后果：真机每次运行的 `role` 解析为空、`route` 恒 `inherit`，`child-outcomes` 的分组为空，
  `reclassifyNullCollapses` 一条也不改——功能在单测里全绿、在用户面前等于不存在。修法：两种形状都读、扁平优先
  （`src/team-engine.ts` 的 `promptBlocks`/`specRouteOptions`），并把 `test/engine-harness.ts` 的假 seam 改成发扁平形状
  （它原来恰好发嵌套形状，正是把差异挡住的原因），`test/null-collapse.spec.ts` 加一例钉住 role/attempt/route。
- **② 没有 diagnostic（未修）:** `spawn`（in-process）子代理的 `SubagentResult` 只有 `{output, stopReason, structured}`
  （`dsh-subagent/lib/index.js:1229-1250` 的 `captureLocalResult`），`diagnostic` 只由 external provider 产出。所以真机上
  一次 401 死亡只能拿到 `stopReason: 'error'`，`childFailureClass` 落到 `unknown`，给不出「超时/鉴权/传输」的细分。
  可选的下一步：读子会话自己的 `turn/end` 事件（宿主侧新增一条读取，或 D-116 B2 的上游通道）。
- **备选（本轮未采纳）:** 在报告里对 `unknown` 加一句「服务商没有给出失败原文」——能让读者知道这是信息缺失而不是
  分类器的疏忽，但会加长每条失败行，留待与 ② 一起做。
- **Consequences:** 任何「在引擎 seam 上取证」的改动，验证必须包含一次**真机** run；单测跑在自制 harness 上，
  harness 的 spec 形状一旦与真引擎不同，功能可以整体失效而不报警。

## D-118 · 死因只能从子代理自己的会话记录里取；取不到就说「原因未知」；交付那行按 task id 重建（2026-11-24）

- **Status:** ① CONFIRMED（真机 round 078 PASS）；② CONFIRMED；③ CONFIRMED
- **来源:** `release/0.13.26` 的隔离真机 soak 复跑（`.rsi/evidence/round-078/soak.txt`）
- **① 死因的证据位置:** 引擎在 spawn（in-process）路径交回的 `SubagentResult` 只有
  `{output, stopReason, structured}`，没有 `diagnostic`（D-117 ②）。但死因并没有消失，它在**子会话自己的日志**里：
  `turn/end` 的 `reason.error` 就是服务商的 `LlmFailure` 原样（`{message, code, status}`），
  而死在 turn 收尾之前的子代理，`assistant/attempt` 的 `finish` 分片里也有同一份事实。
  于是 `src/child-evidence.ts` 只折这两个形状，`src/team-engine.ts` 在 **activation 时**抓住子会话对象
  （引擎在结算送到宿主之前就 dispose 子代理，事后查 `sessions.get` 查不到——`src/memory/recorder.ts` 早就因为同一原因在
  `agent-start` 抓会话），结算时再读。分类先看服务商的 `code`（`AUTH`/`RATE_LIMIT`/`TIMEOUT`/`HTTP_5xx`…，
  见 `failureClassForCode`），再看原话文本表；代码表只列没有歧义的映射，其余回落到文本，免得给未知代码编一个类。
- **备选（未采纳）:** 只读引擎结果里的 `stopReason` —— 那就是 0.13.25 的行为，真机上只能说 `error`，
  读者拿不到「密钥被拒」这一层；等上游给 spawn 结果补 `diagnostic` 属上游改动，本版不阻塞。
- **② 取不到就诚实:** 一条死亡如果哪儿都没记下原文，报告写
  `the child ended abnormally (cause unknown)`（`CHILD_CAUSE_UNKNOWN`），不再写「没有返回有效的结构化结果」。
  旧句子的毛病是它在描述「少交了一份表」，读者会去重发；而重发对一次鉴权失败毫无用处。
- **③ 交付那行不能靠句子匹配:** 答案里的「仍未完成（来自报告）」块由脚本在**修复之前**抄进
  `report.synthesis.summary`，交付层逐字打印它。round 077 的修法用 `includes(failure.reason)` 去替换，
  在真机上一条也匹配不上（同一件事的两种写法：`report.incomplete[].reason` 带
  `failed on every route: [format-error]` 前缀并会被 `clip(…,160)` 截断）。所以改成**按 task id 重建**：
  认识那行块标记（中文/英文两种），取 `- 任务 <id>：` / `- task <id>:` 里的 id，用修好的行重新拼一条
  （同样的 160 字上限），块外一个字符不动。逐字替换仍然先跑一遍，覆盖措辞没漂移的行。
- **Consequences:** 报告、答案、归档三处说同一个原因；`format-error` 只留给真的没交结果
  或服务商自己说格式不对的子代理；任何「在引擎 seam 上取证」的改动都必须配一次真机 run，
  因为单测的假 seam 与真引擎在两个方向上都可能不一致（本轮又见一例：devDeps 钉 `0.2.1-rc.2` 发嵌套 spec，
  运行时 `0.2.2-rc.3` 发扁平 spec）。

## D-119 · 死路由（满载/记表/429 三处取舍）与 task id 进报告行（2026-11-24）

- **Status:** ① CONFIRMED（`test/dead-routes.spec.ts` 18 例，红 12 → 绿 18）；② CONFIRMED；③ CONFIRMED；
  `npm run ci` exit 0 / `verify:lib` byte-identical。真机 soak `NOT_RUN`（留给合流方）。
- **来源:** 设计稿（agent-105）默认三条 + 本轮实现。分支 `feat/dead-routes`
  （worktree `.tmp/wt-dead-routes`，从 `main` `5678dd8`＝0.13.26 开出，一任务一分支；共享脏树 detached
  `a6103ad` 一行未动）。
- **① task id 进报告行：可选字段，不加新行。** `src/script.ts` 的 worker / verifier / supervisor 六个调用点
  （含三个补交点）都传 `taskId: task.id`，`traceRoute` 把它写进轨迹行；planner / synthesizer 是跑级角色，不写。
  - **否决：另起一张「每任务 × 每路由」的表。** 同一件事在报告里出现第二份表，就有第二份会漂移的真值；
    轨迹行本来就记录「谁在哪条路上失败」，缺的只是「为哪件事」。字段可选，所以旧报告与跑级行形状不变。
- **② 满载：走死路由，省时间。** 扫描顺序三档：活着且不忙 → 活着但别家忙（C1 提示）→ 死路由。
  当活着的路都到并发上限、只有死路由有空位时，这一次调用直接落在死路由上，而不是等一条道空出来。
  - **否决：继续排队等 drain。** 等待没有上界（要等某个子调用自己结束，可能是分钟级），而死路由只是「证据」不是
    「判决」——表里的行会在它答上来的那一刻消失；拿一次尝试换不掉队的推进更便宜。这条取舍写在
    `preferredIndices` 的注释里，不是隐含行为。
  - **否决：把死路由从链里删掉。** 删掉就等于在一轮里永久放弃一条可能恢复的路，而且失败报告再也说不清
    「这条链本来有三条路」。现在的做法是排到最后、仍然会试。
- **③ 429 留在表内，但跟随开关闸门。** 家族表只收 `timeout` / `connection` / `server-error` / `rate-limit`；
  计数条件用 `failure.switchModel`，那是脚本已有的「这一类失败要不要换人」判据，所以操作员把 429 勾选框关掉时，
  429 也就自动不计数（那条路会被留着、由任务重试）——不另写一份开关表。
  - **否决：把 `rate-limit` 移出表外。** 默认开关下 429 就是要换人，而「这条路今天不通」最常见的表现就是 429；
    移出表外等于把最该省的那次调用留着。跟随开关比复制开关更少一处会漂移的真值。
  - **否决（顺带记）：把鉴权/格式/引擎启动失败也算进去。** 401/403 再试一次还是被拒——把它记成死路由只会把
    「要改的是密钥」这件事藏起来；没交结构化结果是子代理的形态问题，`agent-start-failed` 根本没到服务商，
    `unknown` 不是证据。这四类既不计数也不清零（只有「答上来」清零）。
- **④ 报告与呈现边界。** 报告新增可选 `deadRoutes`（`{route, class, streak}`，按死亡顺序，封顶 16 丢最旧；
  空则不出现，所以健康报告逐字节不变）。宿主 `assertWorkflowReport` 复检阈值（`streak >= 2`）与类名，不信任脚本。
  诊断台账（`renderReport` + `showDiagnostics`）多一块 `Dead routes`；交付层只登记标签
  （`LEDGER_LABELS` / `MIDLINE_LABELS` 加 `Dead routes`），**没有**在 `src/delivery/index.ts` 的 `machineLedger`
  里再加一遍同样的块——那是设计稿明确的范围（诊断行只在 `report.ts`），而台账与报告视图的措辞现在靠标签表对齐。
- **Consequences:** 一条死路由每轮最多省下「任务数 − 2」次子调用（以及这些调用各自的挂死等待）；代价是
  「死的路在第 3 次之前仍会被试一次」。峰值并发上限与跨 run 提示（C1）语义未变：空道仍是溢出、不是失败。
  任何改动家族表或阈值的提交必须同时改 `HARD_LIMITS.deadRoute`（`test/dead-routes.spec.ts` 把两侧钉成一处）。

## D-120 · 死路由表在真机上是空表（D-119 被否证）与两条修法（2026-11-24）

- **Status:** ① CONFIRMED（真机 5 次 503 调用 / 8 次挂死调用，台账无 `Dead routes` 行）；② CONFIRMED（读码：两个产出点都进不了表）。
- **来源:** 合流方 soak（`release/0.13.27`，`main` `5678dd8` + `feat/dead-routes`），证据
  `.rsi/evidence/soak-deadroutes-01327/`，记录见 `VALIDATION.md` 首条。
- **事实：** D-119 的三条取舍本身没被推翻（排最后而不删、满载落死路由、429 跟开关），被推翻的是它的**前提**——
  「连续两次传输故障会被记下来」。真机上没有路径能给 `noteRouteFailure` 一个
  `{class ∈ {timeout, connection, server-error, rate-limit}, switchModel: true}` 的失败：
  `childTimeoutFailure()` 给 `switchModel: false`（挂死不算换模型的证据），而 5xx / 断连 / 429 在 spawn 引擎里表现为
  「子代理死了 → `agent()` 返回 `null` → `format-error`」（家族外）。于是表为空、`deadRoutes` 不出现、路由永不降级。
- **修法一（推荐，最小）：** 把 `childTimeoutFailure()` 的 `switchModel` 打开（或另加一个只供路由健康使用的标记），
  让「挂死的那条路」真的会排到最后 —— 这正是 D-119 自己举的动机（一次子调用 + 一次完整挂死等待）。
  代价：任务从「改措辞重试同一路由」变成「先换路由」，要在 D-119 里把这条语义变化写明。
- **修法二（补齐 5xx / 断连 / 429）：** 把子代理的死因回灌给 guest。原文已经在子会话 `turn/end`，宿主也已有台账
  （`src/child-outcomes.ts`）与末尾改写 `report.routes[]` 的 `reclassifyNullCollapses`；缺的是「本轮后续调用也能用」的跨调用通道。
  否决「只在宿主侧补记一张表」：宿主的改写发生在 run 收尾，对同一 run 剩下的调用没有任何作用，而需求恰恰是**省掉后续调用**。
- **否决"把 `format-error` 也算进族表"：** 名不副实会让真格式错（子代理 JSON 写坏、重发一次即可）也降级一条好路由，
  与 D-119 的窄表理由冲突；如果走这条路，必须只对「宿主台账证明是传输死因」的塌陷记账，而不是对 `format-error` 记账。
- **教训（与 D-118 同类）：** 单测把 `{class:'server-error', switchModel:true}` 手工喂进 `noteRouteFailure`，测的是「表怎么记」，
  不是「引擎会不会给出这种失败」。任何依赖「某类失败会带着某个标志抵达」的改动，必须配一条**真引擎形状**的用例或一次真机 run。

## D-121 · 死路由的记账改成「失败自己声明」，并把传输死因回灌给脚本（D-120 两条修法都做）与真机取证（2026-11-24）

- **Status:** ① `CONFIRMED`（真机 soak：503 路由与挂死路由各自进表，`Dead routes` 有行，第 3 条任务起不再打那条路）；
  ② `CONFIRMED`（真引擎形状用例：红灯在旧码上 3 failed，修后绿）。
- **来源:** T4 返工子代理（agent-108），分支 `feat/dead-routes` 续作（`cd0c909`），合流 `release/0.13.27`（`78c1907`）；
  证据 `.rsi/evidence/soak-deadroutes-01327-fix/`，记录见 `VALIDATION.md` 首条。
- **决定一（修法一，改成专用标记而不是打开 `switchModel`）：** `childTimeoutFailure()` 保持 `switchModel: false`，
  另加 `routeHealth: 'timeout'`；`classifyCallFailure()` 同样按类给出 `routeHealth`；`noteRouteFailure` 只读
  `failure.routeHealth`，不再拿 `switchModel` 当闸门。
  - **理由：** 两个问题本来不同。`switchModel` 答「这件事现在要不要换一条路」，`routeHealth` 答「这条路该不该排到最后」。
    挂死对第二问答「是」（一次挂死等待已经付过），对第一问答「否」（任务改写措辞重试更划算）。用 `switchModel` 当代理，
    于是真机上 8 行 timeout 一次也没进表。
  - **代价（比 D-120 修法一原文更小）：** D-120 写的修法是「把 `switchModel` 打开」，代价是「任务从改措辞重试同一路由变成先换路由」。
    走专用标记没有这个代价：挂死仍然 break 链、任务仍然改写措辞重试，只是那条路在本轮剩下的时间里排到最后。
  - **429 例外保留：** `rate-limit` 的 `routeHealth` 仍按操作员的勾选框给（D-119：勾选框关掉时这条路由留着，429 意思是「现在忙」）。
- **决定二（修法二，用拒绝当跨调用通道）：** 宿主 twin 在 `startActivation` 处把回执的 `result` 换成一个「传输死因就拒绝」的
  promise，拒绝文本形如 `CHILD_DEATH: <class>: <子会话原话>`；引擎把它渲染进 guest 的 `AGENT_RESULT` 错误，脚本
  `childDeathCause()` 再把它读回来，于是**本轮后续调用**也能知道这条路刚死于 503／断连／429。
  - **为什么只能是拒绝：** 引擎的 `childResult()` 只投影 `{output, stopReason, structured}`，`args` 在 run 开始时
    `structuredClone`，guest 的全局只有 `agent/parallel/pipeline/phase/log/args`，没有回程通道。拒绝（→ 引擎抛
    `AGENT_RESULT`）是唯一能带着文本回到脚本腹地的一条缝。否决「宿主末尾改写报告」：那只改交付，省不下任何后续调用。
  - **范围故意窄：** 只拒绝四个传输族。密钥被拒（`model-unavailable`）、被取消、真格式错（答完没交结构化结果）仍然走原来的
    `null` → `format-error`，由 `reclassifyNullCollapses` 在宿主侧按台账改写——这样「格式错算不算这条路的问题」这条
    D-120 的否决原样保留，也不会把子代理自己写坏 JSON 的账算到路由头上。
- **被这条通道改写的一处旧断言：** `test/null-collapse.spec.ts` 的 timeout 种子原本断言「宿主改写了 >0 行」，现在脚本自己
  就把类写成 `timeout` 了，宿主无事可改（`rewritten === 0`），断言改成「脚本已按类写、路由行里没有 format-error」。
  这不是放宽标准：同一格证据换到了它该在的那一层。
- **真机取证（同一套 fork/profile 形状）：** 隔离 `DSH_HOME`（`scripts/clone-profile.mjs` 克隆 `headless`，凭据 0 行），
  两条假端点（`127.0.0.1:18471` 一律 503、`:18472` 连上不应答），worker 链 = [死路, 本机网关 `wb/cn:deepseek-v4.1-flash`]，
  `maxConcurrency: 1`，插件行指向本 worktree 的 `lib/`；`DSH_HOME`/`HOME` 都是 scratch，live `~/.dsh` 与线上实例未动。
  503 轮：5 题 5 verified，死路由只吃到 2 次调用（`server-error`），第 3~5 题一次都不打它，台账
  `Dead routes: soak-dead/soak/dead-model: server-error (2 in a row)`。挂死轮：`timeout (2 in a row)`，那条路同样被排到最后。
- **教训（写进下一轮的规矩）：** 诊断行只在 `renderReport(..., {showDiagnostics:true})` 里出现，而 `showDiagnostics` 是
  T4 定死的 false；取证时必须用**只翻可见性**的 lib 副本（本轮：`renderReport(value)` → `renderReport(value,{showDiagnostics:true})`，
  一处），并把「路由逻辑用的是真 lib」这一点在记录里写清。运行本身用未改动的 `lib/` 复跑一遍即可交叉验证。

## D-122 · 规划腿补两次问法（同次重交 + 换路重打）与预算同步抬（2026-11-24）

- **Status:** ① `CONFIRMED`（真引擎形状用例：旧码 7 红 → 修后 9 绿）；② 真机 soak `NOT_RUN`（留给合流方）。
- **来源:** 立项A 第一刀，规划腿子代理（agent-110），基线 `2141071`，分支 `feat/planner-resubmit`；
  证据见 `VALIDATION.md` 首条。
- **事实（改前）：** 规划腿只有一次问法。`callRole` 在 `format-error` 上会走完整条链，但一旦链走完（或挂死让链断在第一条），
  脚本立刻 `fallbackPlan()`（`src/script.ts` 规划腿）。而 fallback 计划**永远不可能报告目标已完成**（`src/report.ts` 拒它），
  所以「子代理答完只说了话 / 引号写坏」和「规划那条路 503 或挂死」这两种与规划质量无关的事故，代价都是整轮降级。
  worker 与 verifier 早已有同次重交（`resubmitPrompt` / `verifierResubmitPrompt`），规划腿是最后一个缺口。
- **决定一（A：格式错同次重交）：** 规划调用没有可用结果时——引擎给 `null`（没有结构化结果），或计划过不了形状闸门
  （`planRejection` 非空）——在**同一次调用内**再问一次，label/phase/attempt 全部不变（面板上仍是一个规划成员），
  重交 prompt 带上被拒原因（那是第二个子代理唯一能用的信息），并禁止从零重规划。一次为限。
- **决定二（C：传输死换路重打）：** 传输类死亡（`timeout`/`connection`/`server-error`/`rate-limit`）后再打一次。
  **换路**是真的换路：`callRole` 新增 `options.avoid` 与返回值 `spent`，这一腿把已经付过的路由标签传回去，
  重打只落在还没被问过的路上——挂死的那条不会被重等（一次挂死等待已经付过一次，D-120 的成本理由照旧）。
  一条路都不剩时：死因是**拒绝**（5xx/断连，一次调用很便宜也常常是瞬时）才原路重打一次，死因是**挂死**就不重打、
  直接落 fallback（再等一个完整子调用预算换不到任何新信息）。同样一次为限。
- **`rate-limit` 仍跟操作员勾选框：** `switchOnRateLimit` 关掉时那条路由不进入重打走廊（脚本给 `routeHealth: ''`），
  与 D-119「429 是现在忙，不是这条路死了」一致。
- **决定三（预算同步抬）：** `maxTotalAgentsFor` 的规划项按 `PLANNER_LEG_CALLS = 3` 次走链计。两次补救都是**真实子调用**，
  只算一次走链的 cap 会在救回正发生的时候以 `AGENT_CAP` 掐断（`budget-exhausted` 是 setup 类，会直接停链）。
  波边界的 replan 仍按一次走链计：它失败保留原计划，没有救回走廊要付。
- **否决的备选：**
  1. **只做 A、不做 C**：挂死（最常见的真实故障）仍然一次就落 fallback，等于把本刀的重点丢掉。
  2. **把 `childTimeoutFailure` 的 `switchModel` 打开**：那是 D-120 已经否掉的改法，会改变**任务**的重试语义
     （任务从「改措辞重试同一路由」变成「先换路由」）；本刀只要规划腿换一次路，不动任务。
  3. **在 `callRole` 里给所有角色统一的同次重交**：worker/verifier 已有各自成形的重交语义（worker 禁止重做已完成的工作、
     verifier 要求同一裁决同一证据），通用化会改掉它们的失败计数与报告文案。
  4. **预算不抬，靠引擎默认 `maxTotalAgents` 兜底**：宿主下发的 cap 就是本插件算的那个数，兜不住自己。
- **代价：** 一次 run 最多多两次规划调用（每次最多走完一条链）；挂死且无别的路可走时不额外等待。
- **教训（与 D-118/D-120 同源）：** 依赖「某类失败会带着某个形状抵达」的改动，必须配**真引擎**用例：本刀的 9 条用例走
  `createEngineHarness` + 本插件 twin，失败形状是引擎真给的（答完没交结构化、`CHILD_DEATH` 拒绝、脚本自己的预算结算）。

## D-123 · 判定腿同 attempt 补打：verifier/supervisor 死于传输错时只重打这条腿，不重跑 worker（2026-11-24）

- **Status:** CONFIRMED（代码 + 单测；真机 soak 留给合流方，`NOT_RUN`）
- **Date:** 2026-11-24
- **Decision:** 判定腿（verifier / supervisor）**死于非格式错**时——该次调用在传输上死掉，没给出任何判定——
  在同一次 attempt 内**只补打这条腿一次**，保留 worker 已产出的执行结果；不新增 attempt 行、不消耗重试额度、
  不改重试策略。attempt 记录新增可选标记 `judgeRetried: true`（「这次尝试花过一次判定补打」，说事实不说成败；
  成败仍由 `passed` 与 `failure` 表达）。预算同步抬：
  - 脚本 `attemptBlock` 从 `2 × (worker + verifier + supervisor)` 改为 `2 × worker + 3 × (verifier + supervisor)`；
  - 载入期 `callsPerAttempt` 从 `max(1,worker) + max(1,verifier) + supervisor` 改为 `2×max(1,worker) + 3×max(1,verifier) + 3×supervisor`；
  - `HARD_LIMITS.maxAttemptsPerTask` 600 → 1000（最坏合法组合 50+50+50 路由：`2×50 + 3×(50+50) = 400` 次/attempt × 2 attempts = **800** 次/task，1000 留余量）。
- **闸门（复用 D-120/D-121 的既有词汇，不新造类）：** 只认 `judgeLegTransportDeath(failure, role)` ——
  `failure.role` 是该腿、`class ∉ {format-error, verification-failed}`、`setup !== true`、且 `routeHealthFamily(failure) !== ''`
  （失败自己声明的路由证据：`timeout` / `connection` / `server-error` / `rate-limit`）。
  - **为什么排除 format-error：** 那是补交通道（B/C，D-054 一脉）的本职，一次尝试只给一次补交，不能因为改叫「补打」就多要一次。
  - **为什么排除 `verification-failed`：** 判定说了「不通过」，那是答案，不是死亡；再问同一个判定只会得到同一个 no。
  - **为什么排除 `setup`：** `AGENT_CAP`／schema／option 类硬故障按定义会重复，烧掉剩余尝试只会多付钱。
  - **429 的取舍：** 沿用 D-119/D-121 —— 勾选框说「限流就换人」时 429 算路由证据（可补打，补打有可能落在别的活路上）；
    勾选框把 429 留在原路时它声明不了路由证据，因此不补打，仍由任务改写措辞重试。这不是新规矩，是复用同一条声明。
- **顺序即预算：** 补打放在 B/C 之前。所以「补打回来了但不是可解析的结构化结果」会记成 `format-error`，
  随后 B/C 仍可再打一次 —— 每条判定腿每 attempt **最多 3 次调用**（首打 + 传输补打 + 格式补交），预算按 3 计入。
  把补打挪到 B/C 之后会让第三趟不可达，预算那一行就变成谎话。
- **Reason:** 判定腿死在传输上时，活是好的、缺的只是一个判定，而现有路径让这次 attempt 失败、重试把**最贵的 worker**
  整条重跑。判定调用比重跑 worker 便宜一个量级；这就是 D-054 的原意（便宜的最短路径重试）在判定腿上的镜像。
- **Alternatives rejected:**
  - 维持现状（失败 → 重试重跑 worker）：为一个没到手的判定付一次全量重做；
  - engine 续原 child 会话（`agent()` 无此通道，D-054 已否决，无新证据）；
  - 429 无条件补打：与 D-119/D-121 的「勾选框关掉时 429 = 现在忙」直接冲突；
  - 补打放到 B/C 之后（第三趟不可达、预算撒谎）；
  - 只抬 `maxTotalAgents` 不抬 `maxAttemptsPerTask`：50+50+50 的合法链路会被载入期总闸拒掉（实测 800 > 600）。
- **Consequences / 已知风险（都写进 VALIDATION）：**
  1. 单路由且真的挂死的链上，一次 attempt 会花 2 次判定调用（首打 + 补打）才判失败；换来的是 worker 不重跑。
  2. 死路由表要连续两次（streak 2）才降级，所以同 attempt 内的补打仍可能打到刚死的那条路（与 B/C 同形，不是新问题）。
  3. 补打是**新子代理**、不是续会话，判定要重新检一遍现场 —— 这是「便宜一个量级」不是「免费」。
- **被这条改动翻掉的一处旧钉子：** `test/verifier-resubmit.spec.ts` 里「不补打 verifier 传输失败」那条用例钉的是
  **本特性的缺席**（`verifierCalls === 2`）。本刀把它改成钉新契约（每次尝试首打 + 一次补打 = 2，`maxRetries` 1 时共 4，
  且 worker 每次尝试只打一次），不是放宽标准。
- **Evidence:** `src/script.ts`（`judgeLegTransportDeath` + 两条补打走廊 + 两个 `*ResubmitPrompt` 的 `routeDeath` 参数 +
  `maxTotalAgentsFor` 的 `attemptBlock`）、`src/types.ts`（`AttemptReport.judgeRetried`）、`src/report.ts`（白名单）、
  `src/config.ts`（`maxAttemptsPerTask` 1000、`callsPerAttempt` 2/3 走法）、
  `test/judge-leg-retry.spec.ts`（新，8 例）、`test/routing.spec.ts`（预算两钉）、`test/verifier-resubmit.spec.ts`（翻钉）。
- **来源:** 包工头 A（agent-113）第二刀，分支 `feat/leg-retry`（worktree `.agents/worktrees/feat-leg-retry`，基线 `main` `8f34701`）；
  规划腿在第一刀（`feat/planner-resubmit`，另一 agent），两刀互不越界：本刀没有复制规划腿的 `avoid`/`spent` 路由回避机制。

## D-124 · model-unavailable（401/403）也回灌给脚本，但不进死路由账（2026-11-24）

- **Status:** `CONFIRMED`（读码 + 单测：新断言在旧码上 4 红，改后 53 绿）；真机 soak `NOT_RUN`（留给合流方）
- **Date:** 2026-11-24
- **来源:** 本分支 `fix/forward-model-unavailable`（worktree `.agents/worktrees/fix-forward-model-unavailable`，
  从 `main` `8f34701`＝0.13.28 开出；共享脏树 `a6103ad` 一行未动）
- **问题（`CONFIRMED`）:** 0.13.27/0.13.28 只把四个传输族的死因回灌给脚本（宿主 `childDeathRejection()` 抛
  `CHILD_DEATH: <class>: <子会话原话>`，guest `childDeathCause()` 读回），`model-unavailable`（401/403/未知模型，
  `AUTH` 等码都归它）仍旧走老口径：seam 不转发 → guest 写 `format-error` + 「returned no valid structured result」→
  宿主 `reclassifyNullCollapses` 事后改写散文。于是**当次尝试**里脚本已经把一次「同次补交」花在一个注定被同样拒绝的
  重发上，而报告也要等 run 收尾才说对。
- **决定（两侧各一张表，回答两个不同的问题）:**
  1. 宿主 `src/child-outcomes.ts` 的 `CHILD_DEATH_FAMILIES`（转发面）= 五族，末尾加 `model-unavailable` 并保持既有顺序；
     `childDeathRejection()` 用它决定要不要拒绝这条激活回执。
  2. guest `src/script.ts` 新增 `CHILD_DEATH_FAMILIES`（回读闸门，同样五族），`childDeathCause()` 改用它判定；
     `ROUTE_HEALTH_FAMILIES`（记账面）**保持四族一字不动**。
  3. `routeHealthFamilyOf('model-unavailable', …)` 因为不在记账表里自然返回 `''`，所以 401/403 不会把路由记成死路；
     `advances` 仍按 `switchOn`（默认空 = 换路），与旧的 `format-error` 路径一样推进路由链。
- **为什么密钥被拒不记死账:** 换 key 才是解法，换路只是让这一轮别在同一个 key 上再撞一次。把它写进死路由表会把
  「要改的是密钥」这件事藏起来（D-119 ③ 的否决原样保留），而且那张表的语义是「这条路今天不通」——被拒的密钥
  并没有说这条路的服务商不通。
- **代价（三处，如实记）:**
  1. 401/403 不再触发同次补交：脚本按类走进换路分支，省下那一次注定被同样拒绝的调用。
  2. 路由台账那一行现在由**脚本自己**按类写（`model-unavailable` + 服务商原话），宿主 `reclassifyNullCollapses`
     对它无事可改（`rewritten === 0`）——与 D-121 改写 timeout 种子是同一种「同一格证据换到它该在的那一层」。
  3. 取消（`aborted`）与真格式错（答完没交结构化结果）仍然走 `null` → `format-error` → 宿主事后改写；
     D-120「格式错算不算这条路的问题」那条否决不变。
- **被这条改动改写的旧断言（逐条理由见 VALIDATION 首条）:** `test/null-collapse.spec.ts` 的
  `runSeed('forbidden')` 与 `runSeed('session-refusal')` 两条原本断言「宿主改写了 >0 行」（实测 6），
  现在是 `rewritten === 0` + 「脚本已按类写、路由行里没有 format-error、`resubmits()` 为 0」；
  `captures the stop reason and the diagnostic of a refused child` 原来拿 403 当「台账是改写证据」的样本，
  现在改用 `cancelled` 种子（`stopReason` + `diagnostic` 都在、仍由宿主改写）。这不是放宽标准：
  每一格都换成了更靠前的证据，而不是删掉断言。
- **钉法:** `test/dead-routes.spec.ts` 把两张表各自钉一遍——宿主五族 `toEqual`；guest 的
  `const CHILD_DEATH_FAMILIES` 键序等于五族、`const ROUTE_HEALTH_FAMILIES` 键序等于四族，并断言两表
  只差一个类（五族减去四族 = `['model-unavailable']`）。两条用例的标题分别写明「转发面」与「记账面」。
- **Consequences:** 401/403 在报告与路由台账里立刻是真因，且不再白烧一次补交；死路由表仍是四族，
  「一条路被记成死路」的门槛没有变。任何调这两张表的提交必须同时改上面这两条钉子。

## D-125 · 合流期预算对账：两条救援各自的容量都保留，钉旧算式的三条用例改成钉合成后的算式（2026-11-24）

- **Status:** `CONFIRMED`（真引擎用例 + 全量门禁 exit 0；真机 soak 三场景 PASS）
- **Date:** 2026-11-24
- **背景:** 0.13.29 把两条各自加宽子调用上限的分支合到同一条 release 上——D-122 给规划腿加了两次救援问法
  （`PLANNER_LEG_CALLS = 3` 次走链），D-123 给判定腿加了同 attempt 补打（每 attempt `2*worker + 3*(verifier+supervisor)`）。
  两条改的是 `maxTotalAgentsFor` 的不同项，但落点相邻，合流时 `attemptBlock` 那一段直接冲突。
- **Decision:** 两项**都保留**，谁也不许为了「合成一个数」被丢掉，因为它们是两条不同救援的真实子调用：
  ```
  planLeg      = PLANNER_LEG_CALLS * planner          // 每 attempt 之前，规划腿最坏 3 趟
  attemptBlock = 2 * worker + 3 * (verifier + supervisor)
  maxTotalAgentsFor = planLeg * waitFactor + synthesizer * waitFactor
                    + replans * planner * waitFactor
                    + tasks * (retries + 1) * attemptBlock * waitFactor + 2
  ```
  载入期总闸 `HARD_LIMITS.maxAttemptsPerTask = 1000`（D-123）只算任务级的 worker/判定调用，规划腿按 run 级 cap 计，
  两者不重复、不互相抵消。
- **被这条决定改掉的三条用例（钉的是旧算式，必须跟着行为走，行为不动）:**
  1. `test/routing.spec.ts` —— cap 用例改成合成后的数字：plain `3 + 2*(2*1 + 3*1) + 2 = 15`、routed `3 + 0 + 2*(2*2 + 3*1) + 2 = 19`；
  2. `test/planner-resubmit.spec.ts` —— 仍钉「规划腿按 `PLANNER_LEG_CALLS` 计」，但每 attempt 的块改为 `2*w + 3*(v+s)`（期望 38，原 32）；
  3. `test/judge-leg-retry.spec.ts` —— cap 用例的规划项改为 `PLANNER_LEG_CALLS * planner`（期望 15/19，原 13/17）；
     它存在的性质没变：块仍从 5 抬到 7，routed−plain 仍为 4。
- **Evidence:** `src/script.ts`（`maxTotalAgentsFor` 的两项并存）、`test/routing.spec.ts`、`test/planner-resubmit.spec.ts`、
  `test/judge-leg-retry.spec.ts`、`test/planner-resubmit.spec.ts > keeps a recovered leg inside the walks the cap pays for`
  （真引擎：被救回的规划腿确实落在 cap 之内，不会以 `budget-exhausted` 收场）；真机 soak 三场景 PASS（`.rsi/evidence/soak-release-01329/`）。
- **Alternatives rejected:**
  1. 取两者较大值（`2*worker + 3*(v+s)` 已盖住规划腿）——错的：两项计价对象不同，盖住任务块不等于盖住规划腿的 3 趟；
  2. 只留规划项、把判定块退回 `2*(w+v+s)`——等于把 D-123 的补打从预算里删掉，补打会在救回时以 `AGENT_CAP` 掐断；
  3. 抬全局 `maxTotalAgents` 的魔数兜住——cap 是公式算出来的，抬魔数只会掩盖下一次同样的冲突。
- **Consequences:** 同一个 run 的 cap 比任何单条分支都大（plain 13 → 15、routed 17 → 19，量级不变）；任何再动
  `maxTotalAgentsFor` 或 `PLANNER_LEG_CALLS` 的提交，必须同时改这三条用例，否则它们会先红——这正是它们的作用。

## D-126 · 诊断块由两个视图各自渲染：D-119 ④「不再抄一遍」被取代，溢出拆两块、错误行带类别、截断预留尾巴（2026-11-24）

- **Status:** `CONFIRMED`（`test/report-ledger-parity.spec.ts` 8 例 + `test/delivery.spec.ts` 新增一条截断用例；
  红灯 8 条落在旧码上（含「`Stop:` 整行被切掉」与「4 块 vs 8 块」），修后 8 文件 / 195 例全绿；
  `npm run ci` 与 `verify:lib` 均 exit 0。真机 soak `NOT_RUN`——本刀只动呈现层，无引擎/路由/判定语义变化）。
- **Date:** 2026-11-24
- **来源:** 现场反馈（运维同时打开两个视图做诊断，对不上）+ 本轮实现。分支 `fix/ledger-report-parity`
  （worktree `.tmp/wt-ledger-parity`，从 `main` `ff7fb97` 开出，一任务一分支）。
- **背景:** 同一份 `WorkflowReport` 有两个机器视图：`renderReport(report, { showDiagnostics: true })`（工具界面）
  与 `machineLedger(report)`（交付层在诊断开关打开时带的那份）。两边的措辞此前只靠 `LEDGER_LABELS` / `MIDLINE_LABELS`
  对齐，块本身各写一遍，于是漂移成四件事：
  1. 台账**没有** `Dead routes` 块（D-119 ④ 明确把这块只放进 `report.ts`）；
  2. 台账**没有** `Child budget:` 行，于是「子代理挂住」和「整轮时限到了」在台账里分不开；
  3. 台账把「这一轮自己满载」与「另一个 run 说这条忙」并进一个 `Route overflows (a lane was full …)`，
     行文本是 `w1 skipped full; queued 40 ms`；报告是两个标题、`skipped full w1 (waited 40 ms)`；
  4. 同一个 error 在报告里是 `- Verify: …`（丢了类别）、在台账里是 `- Verify (infrastructure): …`（留类别，正文封顶 300）。
- **Decision:**
  1. **诊断块由两个视图各自渲染，措辞与行文本逐字节相同**：`machineLedger` 现在自己渲染
     `Dead routes (two consecutive transport failures; live routes are tried first):` 块（不切片——报告不切，长度由下面的封顶兜）、
     `Child budget: … ms per call (the run stops waiting on one call after this long)` 行（紧贴 `Deadline:` 之后）、
     以及报告的两个溢出标题（`Route overflows (full lane yielded, not failures):` / `Route overflows (cross-run hint):`，
     各行 `skipped full …` / `skipped busy …`，等待后缀 ` (waited N ms)` 只在 `queuedMs > 0` 时出现，每块同样 `slice(0, 12)`）。
     标签表仍然保留（人话块的清理闸门靠它），但它不再是「两个视图怎么对齐」的唯一手段。
  2. **错误行两边同一形状：**`- ${phase}${category === undefined ? '' : ` (${category})`}: ${oneLine(message, 500)}`。
     报告**补上类别**，台账的正文上限从 300 抬到 500，于是同一行在两边逐字节相同。
  3. **只排队、没点名任何道的路由条目不再出行。**台账过去写 `- worker attempt 2 via w1: no lane named; queued 5 ms`，
     报告从来不显示它（报告只收 `skippedBusy` 非空的条目）。对账就是这个目的，所以丢掉这一行，台账不再为它编一行。
  4. **截断预留尾巴。**`MAX_LEDGER_CHARS = 8_000` 与标记常量不动，但 `Stop:` 叙事行与守卫行先组成 trailer，
     正文 + trailer 超预算时先按 `8000 - trailer 长度 - 标记长度 - 1` 算出空间，用 `cutCodeUnits` 在最后一个换行处切正文，
     再接标记、再接 trailer。旧写法从尾部整段切，超长台账**正好丢掉收尾那两行**（谁停的、守卫看到了什么）。
     无 trailer 时输出仍是 `head\n<marker>`（head ≤ 8000），`test/delivery.spec.ts` 原有的截断用例一字未改。
- **取代 D-119 ④ 的哪一句:** D-119 ④ 写「交付层只登记标签（`LEDGER_LABELS` / `MIDLINE_LABELS` 加 `Dead routes`），
  **没有**在 `machineLedger` 里再加一遍同样的块——那是设计稿明确的范围（诊断行只在 `report.ts`），而台账与报告视图的
  措辞现在靠标签表对齐」。**这一句作废**，理由是它要保护的「一份真值」在标签表方案下并不成立：标签表能对齐
  「哪些词不许进人话块」，但一个字也管不住块的**存在性、顺序和行文本**，所以现场看到的是「报告有、台账没有」。
  重复渲染两块**同一形状**的代码，代价是两处要一起改（`test/report-ledger-parity.spec.ts` 把这条约束钉成用例：
  任何一边多一块、少一块、换个行文本，逐块对账立刻红）；收益是运维同时打开的两个视图对得上。D-119 ④ 的其余三条
  （排最后而不删、满载落死路由、429 跟开关）与死路由的记账规则全部不变。
- **Evidence:** `src/delivery/index.ts`（`machineLedger` 的诊断块与 trailer）、`src/report.ts`（errors 行补类别）、
  `test/report-ledger-parity.spec.ts`（一份带全部诊断事实的报告：五个角色的路由、两条预算、一次失败换路、
  一次本地满载、一次跨 run 提示、两条死路由、带类别与不带类别的两条 error、stop + guard、6 行任务；逐块对账 +
  「健康报告两边都不出现这些标题」的镜像用例 + 回声用例）、`test/delivery.spec.ts`（截断保留收尾两行）、
  `test/delivery-human-block.spec.ts` / `test/human-output-contract.spec.ts`（标签表补 `Child budget:`）。
- **Alternatives rejected:**
  1. **只补台账缺的两块，溢出保持一个标题。**两个标题的差异是语义（这一轮自己的上限 vs 另一个 run 的大致提示），
     并成一个就是让读者自己猜；而且报告不会跟着改，对账用例仍然红。
  2. **让 `renderReport` 去掉类别去迎合台账。**类别是「服务商挂了」和「活没干好」的分界，删掉它等于把报告降级；
     台账那边抬上限才是不丢信息的改法。
  3. **保留 `no lane named` 行、给报告也加一行。**那会在报告里凭空造一条「没有道被跳过」的记录，
     而报告是读者/解析器的主要视图（`src/carryover.ts` 回读它）；静默丢一行比新增一种行安全。
  4. **截断改成从中间切。**台账的头部（状态、任务行）和尾部（谁停的、守卫）都是读者要的，中间才可弃；
     但中间切需要新的标记措辞，而「预留 trailer」用现有标记就够，且不动已钉住的截断用例。
- **Consequences:** 台账与报告的诊断块从此必须一起改——`test/report-ledger-parity.spec.ts` 会让任何单边改动先红；
  台账在同样的 8,000 字预算下正文略短（约 56 字的标记预留），换来收尾两行必然存在；`Dead routes` 块不切片，
  但 `deadRoutes` 已由宿主按 `HARD_LIMITS.deadRoute.routes` 封顶，报告侧同理。任何再动诊断块措辞的提交，
  必须同时改这条用例，否则它会先红——这正是它的作用。

## D-129 · 升级按钮走宿主路由：装什么由宿主按本仓库的发布形状自己拼，成功只认读盘回执，失败或装歪就回滚（2026-11-24）

- **Status:** `CONFIRMED`（`test/update-surface.spec.ts` 29 例 + `test/update-entry.spec.ts` 20 例；`npm run ci` 在
  `c951dbf` 上 EXIT=0 = 101 文件 / 1910 测试；真机 soak 一次完整跑通并留下逐字回执与读盘结果）
- **Date:** 2026-11-24
- **来源:** 设置页升级卡此前只能「说出最新版本 + 给一条命令让人贴到终端」，操作员要的是「按钮自己装」。分支
  `feat/update-button`（worktree `.agents/worktrees/feat-update-button`，自 `main` `c6a3611` 开出），功能提交 `c951dbf`。
  两条 lane 各自先红后绿（宿主：模块缺失红 → 29/29；客户端：12 失败 / 5 通过 → 全绿）——这组红绿数是两条 lane 当轮的
  记录，**树里无法复现**，能复现的是上面那条全量门禁与下面列的文件。
- **Decision:**
  1. **升级按钮骑在宿主路由上**，不在浏览器里想办法：新增 `src/update-surface.ts`，`GET|POST
     /grok-workflow/update`（`UPDATE_ROUTE_PATH`）。挂载形状照抄 `src/mode-surface.ts`——`ctx.inject(['webServer',
     'connection'])`、注册写在 `child.effect` 里（卸载即撤路由，不留下一个「装进了一个已经没装本插件的 profile」的按钮）、
     信任闸先走 `connection.requestRejection`、`handleUpdateRoute` 导出当测试缝、`serviceOf` 走 isolate 保护的服务查表。
     读走 `GET ?action=status`，装走 `POST {action:'install',tag}`。
  2. **装什么由宿主自己拼，浏览器永远不能指定包。** spec 只在宿主侧生成（`releaseSpec()` →
     `github:free6589/dsh-grok-workflow#v<x.y.z>`）；请求体只要带任何 `spec` 一类字段就拒（`update/spec`），tag 必须匹配
     `RELEASE_TAG_PATTERN`（严格 `vX.Y.Z`、无前导零），**并且**必须出现在注入的探测从 GitHub 读到的发布标签里
     （`v9.9.9` → `update/unknown-tag`），还必须是严格新于已装版本（`update/not-newer`）。`inspect()` 只看 git spec 的
     形状（见 `RESEARCH.md`），所以「这个标签是不是真的发布过」只能靠标签清单来判——探测就是这么来的。
  3. **写盘用 `saveExact` + `expected`，成功只认读盘回执。** `installBundle(spec, {saveExact:true,
     expected:{name:'dsh-grok-workflow', version:<去掉 v 的 tag>}})`：管理器自己的事务守卫会在「装完这个包不在/版本不对，
     或者顺手改了别的直接依赖」时回滚并把这次安装判成 `unexpected-package`。回执里的 `to` **不是**请求里那个版本，而是
     事后 `listBundles()` 读回来的版本——装成功与否只由这一次读盘决定。
  4. **失败或装歪就退回装前那个 spec，回执只说第二次读盘能证明的事。** 回滚用装前那一行的 `source`（没有就用那条版本
     的发布 spec；开发链接这种没有标签可退的，直接报「没回滚」，不猜一个版本去装），回滚后再读一次盘，只有读回来真的等于
     装前版本才写 `rolledBack:true` + `restored`，否则就是 `rolledBack:false`。错误码到状态码是定死的表：
     方法 405（带 `allow`）、包体 400/413、action 400、spec 400、tag 400、unknown-tag 409、not-newer 409、
     current/discover/unavailable 503、install/readback 502、internal 500。
  5. **不自动升级，不静默刷新。** 页面打开时不发任何 GET/POST；一次点击一次 POST，安装中再点是无操作；装完只把
     「刷新页面新版本才生效」写出来，页面自己绝不 reload、不跳转。静态的 `PLUGIN_VERSION`/`UPDATE_LATEST` 与可复制那一行
     保留为基线（没有路由的合流里读者拿到的就是它），但宿主答过之后，三处命令文本一律换成宿主的 `update.command`。
- **被否决的替代方案:**
  1. **让浏览器把 spec 发上来。** 那是把一个可以装任意包的入口开到网页上（CSRF/社工点一下就装别人的包）；宿主自己拼
     spec 是这条路由唯一能收窄的地方。
  2. **信 `installBundle` 的 resolve。** 解析成功不等于 profile 上真的是那个版本（npm 别名、意外满足的范围、另一个
     直接依赖被顺手改动）；`expected` 让管理器自己回滚，读盘让回执说真话，两者都要。
  3. **装完自动刷新页面。** 刷新会打断读者正在看的东西，也可能把一个还在跑的任务页刷掉；而且「新构建何时生效」是宿主
     装载的事，不是这一页能保证的。说清楚比替人决定好。
  4. **有更新就自动装（不用点）。** 装包会改 profile、会联网、会动依赖；把这件事做成不需要人按的动作，等于让一次
     背景请求决定环境状态。开关式自动升级是另一条产品决定，本轮不做。
  5. **静态常量继续当唯一真值。** 冻结在页面里的那一行会过期：当页面说「有 0.13.32」而命令还写着 `#v0.13.31` 时，
     复制粘贴装的是**旧**版本——正是这个按钮要终结的那个错误。
- **Evidence:** `src/update-surface.ts`（spec/标签/回滚/错误码全在这里）、`src/index.ts`（`installUpdateRoute` 紧跟
  `installModeRoute`）、`src/client/index.js` 的 `UpdateCard`（四相 + 命令跟随宿主 + 挂载不发请求）、
  `test/update-surface.spec.ts`（29 例）、`test/update-entry.spec.ts`（5 → 20 例）、
  `.rsi/evidence/update-button-soak-2026-11-24/`（真机 soak：一次点击把隔离 profile 从 0.13.30 装到
  0.13.31，两个路由回执逐字存档、装后从盘上读回 `github:free6589/dsh-grok-workflow#v0.13.31` 与 `0.13.31`）、
  `docs/knowledge/VALIDATION.md`（同日条目）。
- **Consequences:** 装一次需要网络 + 一个真的发布过的标签，所以「离线也能升级」不存在，只能退化成那句命令；
  没有插件管理器的合流不再报错，而是 `canInstall:false` + `reason:'update/unavailable'` + 可复制命令；没有 `webServer`
  就不注册任何东西并告警；连 `ctx.inject` 都没有时整块静默。卡片的命令从此跟着宿主的答案走——任何只改静态常量、以为
  那行就是「页面上显示的命令」的改动都会读错。

## D-130 · `feat/audit-layer` 本轮不合：**取半记录**——git 冲突是实测的，功能评估没做（2026-11-24）

- **Status:** **取半（half-recorded）** —— 只有 git 侧实测是 `CONFIRMED`；**功能评估 `NOT_RUN`**（没跑它的用例、没读实现细节、
  没做 rebase）。本节刻意取半：只记**决定**与**实测**两半，不把一次库存测量写成一次评审。
- **Date:** 2026-11-24
- **Decision:** `feat/audit-layer` 本轮**不合**，也不删，保持原样待在本地；下一轮要不要合，先做完功能评估与 rebase 再决定。
- **实测（`CONFIRMED`，包工头本轮现跑，三条命令都只读）:**
  - 尖端 **`7626233`**（2026-11-12 00:40:06 +0800），`git rev-list --left-right --count main...feat/audit-layer` → 左 **500** / 右 **1**
    （`main` 独有 500 条、分支独有 1 条 ⇒ 分支 **ahead=1 / behind=500**；这一行由写记忆的这轮用同一命令只读复核过，左右两数是 `main` 在前）。
  - `git diff --stat main...feat/audit-layer` → **12 files / +996 −94**：`src/report-audit.ts` **+208（新增文件）**、
    `src/report.ts` **88 行改动**、`test/report-audit.spec.ts` **+417（新增文件）**、`test/phase1-dialogue.spec.ts` **10 行**，
    其余是 `lib/` 生成物。
  - `git merge-tree --write-tree --messages main feat/audit-layer` → **exit=1**，冲突路径 **6 个**：手写 2 个
    （`src/report.ts`、`test/phase1-dialogue.spec.ts`）+ `lib/` 生成物 4 个（`report.d.ts`、`report.d.ts.map`、`report.js`、`report.js.map`）。
- **被否决的替代方案:**
  1. **直接合。** `main` 自 `0.13.30` 起在报告层做过诊断对齐（D-126 那一路：两个视图各自渲染、溢出拆块、错误行带类别、截断预留尾巴），
     分支恰好也改 `src/report.ts`——冲突就落在这一层，直接合会把两条各自成立的语义硬拼在一起；而且本包是 timeout 探针那一包的尾巴，
     **没有产品改动授权**，不该顺手把一个产品面合进来。
  2. **删。** 分支带的是真功能（`src/report-audit.ts` 208 行 + 417 行用例），删掉等于真丢东西；`ahead=1` 说明它只有一条提交，
     留着不占维护成本。
- **缺口（照实写）:** ① 它的用例**没跑**（`test/report-audit.spec.ts` 一条都没执行）；② **没做功能评估**——那份 audit 层到底该不该进产品、
  与 D-126 的语义谁取代谁，本轮没有立场；③ **没 rebase**（`behind=500`，rebase 后冲突面可能变，6 个路径只是当前 `main` 上的读数）。
- **Consequences:** 这条记录的用处是「别再重新盘一遍库存」——ahead/behind、diffstat、冲突路径已经量过；它也明确挡掉「顺手合了它」这种动作。
  下一轮做它时，起点是 rebase 到当时尖端 + 跑它的 417 行用例 + 对 D-126 做取舍，而不是从「这分支是干什么的」重新开始。

## D-131 · 完整流程（`/grok on`）补一张前台：逃生口只认会话记录、先问必须先能后送、首答盖在接单回执前面（2026-11-24，未发版）

- **Status:** `CONFIRMED`（`test/full-escape.spec.ts` 5 例、`test/full-behind-first-answer.spec.ts` 4 例，两例在基线副本上
  分别 4 红 1 绿 / 4 红；门禁 `TMPDIR=$PWD/.tmp npm run ci` 在 `24f2f35` 上 exit 0 = 103 文件 / 1922 测试；真机 soak 两相
  四场景，见 `.rsi/evidence/full-escape-2026-11-24/soak.md`）
- **Date:** 2026-11-24
- **来源:** `/grok on` 的既有契约是「每条消息都在回合内跑完整套流程」，用户读到的只有一句接单模板：问候也付一个规划助手、
  一个工人、一个核验者，「今天天气怎么样？」拿到的是「已接单：这条消息正在按整套流程（拆解 → 执行 → 核验）运行。…」，
  真正的话要等后面那条。相 A 在基线 `1f70103` 上逐字复现了这个形状（主会话 `run-start=1 agent-start=3 guardian-start=1`，
  裂出规划/执行/核验三个子会话）。分支 `feat/full-escape`（worktree `.agents/worktrees/feat-full-escape`，自 `main`
  `1f70103` 开出），功能提交 `86c0fa2` 首答＋前言、`597b444` channel 记账、`21f3616` 逃生口、`8f40be1` 重建 `lib/`、
  `62f540f` 与 `24f2f35` 只动门禁用例。
- **Decision:**
  1. **逃生口只认会话记录。** 判据是 `readModeRecord(agent.session)?.workflowMode === 'full'`——只有 `/grok on` 会写这条记录，
     也就只有用户亲手打开形态时才有前台（`fullFrontDeskEscape`：`chat` 模板直答、`fast` 一次 `quick-worker`、
     `team` 先报拆法）。部署级 `limits.mode === 'full'`**一个字节都不走这条路**：那是「一轮跑完」的既有契约，被
     `gate` / `phase1` / `reliability` / `human-output-contract` 等用例钉着（`src/gate.ts` 的注释自己记着「17 条 gate 用例
     钉着它」）。要做的是**收窄产品行为**，不是改那些钉子。
  2. **「先问」必须先能后送。** `team` 档要报拆法、等用户点头才起队轮，所以 `fullFrontDeskEscape` 在派拆法之前先过
     `canBackgroundDeliver(agent)`（`whenIdle`、`followup` 都是函数且会话在，任一不满足即 `false`）：不满足就返回
     `undefined`，交回原来的阻塞路径。一次性/headless 运行没有后续回合，问了没人答，任务会被那句问话吞掉。
  3. **首答盖在接单回执前面。** `answerFullBehind` 先用一次 `first-answer` 轻量调用写下这一两句人答，再拼
     `[注, 首答, acceptedReceipt(lang)]` 用 `acceptedEnterText` 送进回合；`ACCEPTED_PREAMBLE` 随之从「已接单、别自己答」
     改成「已经先答过、别在它上面再造一个答案」（保留了「不重答、不调工具、标记内逐字照抄」这三条约束），
     `acceptedReceipt` 的措辞也跟着改：它现在说的是「上面这一两句是先答」，而不是「这条消息正在跑」。首答那次调用与队轮
     解耦——慢、失败、空回都只落到模板兜底（`firstAnswerFallback`），绝不把队轮推回回合里。
- **被否决的替代方案:**
  1. **让部署级 `mode: 'full'` 也走前台。** 会顺手改掉「每条消息都在回合内跑完」这个既有契约，而钉它的是别的用例组；
     一次为了体验的修复不该连带重写别人的钉子。要改那个形状，是另一条决定。
  2. **一次性/headless 也先问。** 没有后续回合可读「确认」，用户看不到问句也答不了，任务等于被吞——比「多花一次队轮」坏得多。
  3. **继续用「接单模板 + 让主模型别自己答」。** 用户读到的还是一条禁言回执；这正是相 A 复现的那个病。
  4. **队轮仍在回合内跑完再答（旧 `in-turn`）。** 回合被整个跑动占住，期间用户发的消息被领取后不派发，转写看着像坏了
     ——`/grok off` 能过、`/grok on` 不能，正是用户报的那个对照。
  5. **首答那次调用失败就把队轮拉回回合里跑。** 一次慢/失败的轻量调用会拖住整轮；失败就照实写模板兜底，队轮照旧在后台。
  6. **在 `full` 的 `chat`/`fast` 档加档位行。** `full` 从来没有档位行，前台也不该给它加一句（`triage` 形状才有）。
- **Evidence:** `src/gate.ts`（`fullFrontDeskEscape` 五个 `outcome`：`full-escape-chat` / `full-escape-fast` /
  `full-escape-failed` / `full-escape-ask` / `full-escape-ask-fallback`；`answerFullBehind`；`canBackgroundDeliver`；
  `acceptedReceipt`）、`src/triage.ts`（`escape` 输入：只丢 `mode-full` 硬覆盖，规则链不动）、
  `src/answer.ts`（`ACCEPTED_PREAMBLE`、`acceptedEnterText`）、
  `test/full-escape.spec.ts`（5 例：基线副本上 4 红 1 绿，唯一绿的是「部署级 `full` 立刻起队轮」——它本来就该绿）、
  `test/full-behind-first-answer.spec.ts`（4 例，基线副本上 4/4 红）、
  `.rsi/evidence/full-escape-2026-11-24/soak.md`（真机两相四场景）、`docs/knowledge/VALIDATION.md` 同日条目。
- **Consequences:**
  - **`/grok on` 下的「直答」不一定零子智能体。** 闲聊是模板直答（B3：零子会话、零工具、零队轮），单个问题是**一个零工具
    调用的轻量工人**代答（B1 实测如此，回答自己括注「只派了一个工人」）。周报里写「零子智能体」只对闲聊成立。
  - **回合结束得早，结论是另一条消息。** 任何「等这一回合完成就当作拿到结论」的调用方（脚本、自动化、上游编排）在
    `/grok on` 下都会读到首答而不是结论；要结论得等后台那条，且它**可能纠正**首答。
  - **被有意改动的既有钉子**（行为断言本身没放宽，改的是「一轮怎么被打开」）：`test/triage.spec.ts` 1 条
    （`/grok` 记录强制完整流程那条改用真任务并把标记从档位行换成「队长先报拆法」，仍然断言只发生一次调用）、
    `test/grok-on-ingress.spec.ts` 3 条（`dispatches the next message…`、`still runs the full team…`、
    `a saturated queue keeps the blocking path…`：都先发真任务、等拆法、回「确认」，队轮计数改看 `teamRuns`）、
    `test/channel.spec.ts` 6 条（前台那次调用单独记账成 `frontDeskCalls`，`startCalls` 仍只数整轮；
    `expect(started).toMatchObject({kind:'enter'})` 换成先等拆法出去、再断一次整轮）。
  - 一次 `/grok on` 下的真任务现在固定多花一次调用（拆法预览），点头后还多花一次（首答）——换来的是用户在回合里就能读到人话。

## D-132 · 审计层入口 = 报告尾部的**可选段**：默认视图一个字节不动，只有「没跑完」的那一轮把全量记录接在后面（2026-11-24）

- **Status:** `CONFIRMED`（`npm run ci` 在 `feat/audit-render-half` 上 EXIT=0；真机隔离 soak 两跑都按此语义落地）
- **Date:** 2026-11-24
- **Decision:** `feat/audit-layer`（`7626233`，ahead 1 / behind 503）只取两件东西——`src/report-audit.ts` 与
  `test/report-audit.spec.ts`——并把它接到报告层的**尾部**，作为可选段：
  1. `RenderReportOptions.auditTrail?: boolean`，**默认关**。为真时 `renderReport` 先照旧算出 base view（含
     `MAX_RENDER_CHARS` 截断），再在**守卫行之后**接 `\n\n` + `renderAuditTrail(report)`。base view 的截断只管 base
     view，审计段自带 `AUDIT_MAX_CHARS` 上限。
  2. `src/index.ts` 的 PTC 工具 `render` 路径传 `auditTrail: report.status !== 'completed'`——**没跑完的一轮**回来时
     带着完整机器记录，**跑完的一轮**文字与今天逐字节相同。
  3. `renderAuditTrail` 保持导出，作为任何其它调用方的按需直接入口。
- **为什么（默认输出必须是恒等的）:** 这份文本被 `src/carryover.ts` 反向解析成跨轮摘要，并被大量用例逐字断言。任何
  「把全量记录塞进默认视图」的做法都会同时改掉摘要源与断言面——那是另一个决定，不该由这一刀顺手做掉。
- **被否决的替代方案:**
  1. **设置页开关。** 说得通，但只为一个显示便利就要新增一个配置键 + 客户端 UI + `docs-config-keys` 守卫的三件套；
     而且它把「你有没有权限看自己的记录」变成了一个配置问题。显示便利不值得一次 schema 变更。
  2. **在用户可见的中转里接（`src/answer.ts` / `src/delivery/`）。** 那条路径正被 D-126 的报告↔账本对账契约钉着
     （两个视图各自渲染同一行形状），再塞一段机器记录进去等于把对账面弄脏，且中转消息的长度预算本来就不是给记录用的。
  3. **直接合 `feat/audit-layer` 整条分支。** 分支的另一半是「默认视图改成人类答案、机器账本挪到 `showDiagnostics`
     后面」，与本包无关；`main` 自 0.13.30 起在报告层做过 D-126 那一路改动，`src/report.ts` 正面冲突（D-130 已实测
     6 个冲突路径）。整条合会把两个各自成立的决定硬拼在一起。
- **Consequences:**
  - **没跑完的一轮，文本会长很多。** 真机 soak 里一条 `failed` 报告的工具结果从 **2 691 字**（答案半）涨到
    **24 792 字**（整条消息），审计段占 22 101 字。这是有意的：跑失败的人需要全量记录；但它也意味着**失败轮次的
    上下文成本显著上升**，长跑失败时尤其明显（上限 96 000 字，触到上限会以一行「已截断 + 指向结构化结果」收尾）。
  - **跑完的一轮零变化**：`auditTrail` 缺省/`false` 时 `renderReport` 的返回值与改前逐字节相同。除用例钉住
    `renderReport(r) === renderReport(r, {auditTrail:false})` 之外，本包还把基线提交 `1f70103` 的 `lib/` 当第二个模块
    实例做了一次真正的老新对照：completed / partial / `failureReport` 三种报告 × 「无选项 / `showDiagnostics` / 带 guard」
    = **10 次比较、0 处差异**（`.rsi/evidence/audit-render-half-2026-11-24/default-view-parity.out`）。
  - **`test/human-output-contract.spec.ts` 的 T4 断言被收窄**（唯一一条既有用例改动）：它原本断言「工具视图不带任何
    机器词条」，现在断言的锚点仍是这句话，但**只针对答案半**——审计段被切成单独一半，并被断言为「带标题、带收尾句的
    独立段落」。语义没变（答案里仍然一个内部词条都没有），变的是「工具视图 == 答案」这个前提：它不再成立，这是本决定
    的正面后果。
  - **分支另一半仍留在 `feat/audit-layer` 上，等待另一次决定**（默认视图是否翻成人类答案）。本包没有、也不该顺手
    决定它；那条分支的 `HANDOFF.md` 判定日期顺延到下一次合流动作，而不是这次。
  - **校验器会丢掉 `plan.tasks[].dependsOn` / `wave`**（见 `RESEARCH.md` 同日条），所以「全量记录」里这两项在生产
    报告上恒为空——渲染器已经支持，缺的是校验器那一步；本包不改判定语义，故只记录。

（合流时由 D-131 重编为 D-132：`feat/full-escape` 的决策块占住 D-131，本节顺延为 D-132。）

## D-133 · 用户可见名字：重复的调用带序号、终稿单独标「（定稿）」、replan 交卷改「调工具」+ 同棒补交（2026-11-24）

- **Status:** 已落地（`CONFIRMED`：`npm run ci` 在 `fix/naming-resubmit` 上 exit 0，见 `VALIDATION.md` 同日条目）。
- **Date:** 2026-11-24
- **背景（实测）:** 同一次 run 里两处「同名不同次」的调用在进度板上分不清：
  1. 汇总门最多写 `SUMMARY_MAX_ATTEMPTS = 3` 稿（首稿 + 两次重写），每稿还各有一次同稿 `summaryResubmitPrompt` 补交，
     但所有汇总调用的 `agent()` label 与提示词首行都是 `汇总助手`；
  2. 规划腿开场拆活一次、每个波边界 replan 一次，两次的 label 都是 `规划助手`，而 replan 提示词首行是 `REPLAN: …`
     （所以真机上行名连角色都认不出来）。`src/team-engine.ts` 的 `rewriteActivationLabel` 只从提示词首行生成行名，
     `agent()` 的 `label` 选项被 guest 丢掉——**行名与提示词首行必须同源同串**，这是这条决策的硬约束。
  3. replan 提示词末行是 `Answer with the structured result only: {...}`，而本运行时只在子代理**调用结构化结果工具**时
     才拿得到值。按字面理解的子代理纯文本交卷 → 引擎给 null → `format-error` → 边界被记为拒绝、刚并进计划的新需求白丢，
     而整棒 replan 的开销已经花了。
- **Decision（三条）:**
  1. **汇总多稿用序号名**：`汇总·第1稿`…`汇总·第N稿`（en `Summarize · draft N`）；同一稿的补交仍是同一号。
     真机只在 `review.ok` 那一刻知道「哪一稿是交卷的那一稿」，所以**另发一条可选事件** `tool-workflow/summary-final`
     （载荷 `{runId, draft}`），由 `src/progress-tab.ts` 的折叠与 `src/client/index.js` 的手写折叠各自认它，把该行改写成
     `汇总·第N稿（定稿）`。旧流（没有这条事件）渲染结果一字不变；重复/乱序/指向不存在的稿号都幂等。
  2. **规划两棒统一叫「第N次」**：开场 `规划（第1次）`，波边界 `规划（第2次）`、`规划（第3次）`…（en `Plan (call N)`）。
     新增独立的 `plannerCallLabel()` / `synthesisDraftLabel()`，**不改** `memberLabel()`——它仍是提示词正文与散文里的
     角色名（`规划助手` / `汇总助手`），序号只属于「行」。
  3. **replan 交卷**：提示词改成明确「调用结构化结果工具交卷、只调一次、纯文本等于没交」并给出
     `{"action":"none"|"apply",…}` 形状；兜底是 `requestReplan` 收到 `format-error`（且非 setup）时在**同一棒**用
     「补交提示词」重问一次（与 worker / 汇总稿的 resubmit 同形：不重做分析、不花 retry 预算、`log()` 记账），
     补交也失败则照原逻辑拒绝、计划字节不变。**不伪造纯文本 JSON 解析**：`callRole(..., {schema})` 的纯文本答案拿不到结构化值。
- **被否决的替代方案:**
  1. **「一稿 / 定稿」二名制**（首稿叫 `汇总`、交卷那稿叫 `定稿`）：名字里不携带稿号，重写一次就分不清是第几稿；
     而且「交卷」只有过门那一刻才知道，事后改行在聊天面板做不到（面板对 `agent-start` append 一行、`agent-end` 只按
     `seq` 改状态、从不改 label），硬要改就得改引擎事件形状。用了「序号 + 可选事件 + 折叠时标注」，聊天面板不动。
  2. **「拆活 / 问改」两名制**（开场规划与边界 replan 用两个不同名字）：同一棒内会连着出现「拆活、拆活（补交）、
     问改、问改（补交）」，读者仍不知道是第几个边界；而且 replan 的补交与首问是同一棒，换名字会让同一次调用看起来像两次。
     统一成「第N次」后，序号与波边界一一对应：`规划（第1次）→ 波1 → 规划（第2次）→ 波2 → 规划（第3次）`。
  3. **只改提示词、不加兜底**：实测口径下「子代理照样可能纯文本」不是假设——planning 腿早有同棒 resubmit（A 走廊），
     worker/verifier/supervisor 也各有；replan 唯独没有，等于把一次措辞误解变成一次边界白费。所以两者都做。
  4. **把纯文本答案硬解析成 JSON 当结构化结果**：`callRole` 的 `schema` 通道拿不到纯文本，伪造解析等于绕过引擎契约、
     也让 `format-error` 这条诊断失效。改成「同棒补交」既不伪造，也不花 retry。
- **附带（同轮、有据可查的两处小改）:**
  - `model` 策略分支以前不写 `report.synthesis.review`，只有 layered 写。宿主标注只认 `check=pass verify=pass`，
    所以 model 跑会永远标不出终稿。已在 model 的 `review.ok` 分支写同形机器串（`check=pass verify=pass drafts=N`），
    并把 `test/routing.spec.ts` 里那条 `toEqual({mode, summary})` 的旧断言改成带 `review` 的新形状。机器串格式与
    `synthesis.review` 的 schema 都没变（它是可选字段），只是 model 跑现在也会带上它。
  - 报告侧只有**一份英文 ledger**（`renderReport` 没有 lang 参数，`Summary review:` 两语共用这一行），所以
    「中英各一版」在真机上没有第二个入口可加：只在那一行后补 ` · final: draft N`，未新开中文渲染入口。
- **Consequences:** 名字的单一真源仍是 `src/naming.ts`；`namingSource()` 生成的 guest 副本同步加了
  `plannerCallLabel` / `synthesisDraftLabel` / `SYNTHESIS_FINAL_MARK`，`test/naming.spec.ts` 的 host↔guest 一致性矩阵覆盖它们。
  `parseMemberLabel` 既认新名字（含未来 `（定稿）` 后缀）也照旧认 `规划助手` / `汇总助手`；`roleOfChildTitle` 先试整行再试
  `·` 之前的头，否则 `汇总·第1稿` 会被拆成认不出的 `汇总`。`src/progress-tab.ts` 与 `src/client/index.js` 两份角色表都补了
  `规划` / `汇总` 两个词。边界的补交是**真子代理**，**已经进算式**：`maxTotalAgentsFor()` 的边界项按「每个边界 2 次
  调用（首问 + 同棒补交）× 规划链路 × guardian 因子」计，`test/planner-resubmit.spec.ts` 有一条只钉这两项之差的用例
  （带 replan 的 cap 减不带 replan 的 cap = `maxBoundaries × 2 × planner`）。理由与 `PLANNER_LEG_CALLS` 同一条：
  引擎的 AGENT_CAP 是 fatal，少算一次真调用就会在刚好救回来的那一刻杀掉整次 run。

（合流时由 D-131 重编为 D-133：`feat/full-escape` 的决策块占住 D-131、`feat/audit-render-half` 占住 D-132，本节顺延为 D-133。）

## D-134 · 三条分支撞同一个决策号时，按合入顺序重编、最早那一支留号（2026-11-24）

- **Status:** `CONFIRMED`（重编结果在 `main` 上可查：`## D-131` / `## D-132` / `## D-133` 各一条，收口轮计数 `D-131` 17 处、`D-132` 26 处、`D-133` 14 处，
  各自指向自己的块；`npm run ci` 在合流树与发版树各 exit 0 一次）。
- **Date:** 2026-11-24
- **Context:** `release/0.13.33` 合流时，三条待合分支（`feat/full-escape`、`feat/audit-render-half`、`fix/naming-resubmit`）**各自都新增了一个 `## D-131`**
  ——它们都从 `main` 当时的 D-130 往下编号，彼此看不见对方，撞号是结构性的、不是谁写错。合流后同一个文件里出现三个 `## D-131`，
  全仓还有十几处 `D-131` 引用，读者无法判断哪一处指哪一条。
- **Decision:** 按 `git merge` 的**合入顺序**重编：第一支（`feat/full-escape`）保留 **D-131**，第二支改 **D-132**，第三支改 **D-133**。
  重编时把全仓引用逐条按语义改到位（`docs/ARCHITECTURE.md`、`docs/knowledge/*.md`、`CHANGELOG.md`、`src/index.ts`、`src/report.ts`、
  `test/human-output-contract.spec.ts`、`test/report-audit.spec.ts`；`lib/` 由 `npm run build` 重建带出），
  两条被重编的条目末尾各留一句「（合流时由 D-131 重编为 D-13x）」括注，`.rsi/evidence/` 下的历史证据**一字未改**。
- **被否决的替代方案:**
  1. **保留三个 `D-131`，用后缀区分**（`D-131a/b/c`）：号本身就不再唯一，`grep D-131` 仍然命中三处不同决定；以后引用要写 `D-131b`，
     与全仓既有的 `D-<数字>` 单一形态不一致，等于给一个例外开先例。
  2. **三条全部外移**（都挪到 D-134 起）：最早合入的那一支没有理由让号，白白多改一批引用；而且下次三条再撞，还会再挪一次。
  3. **只改新引用的号、不改条目正文里的自指**：正文里的「见 D-131」会指向别人的决定，比撞号本身更难查。
  4. **回头改 `.rsi/evidence/` 里的历史证据**：那是当时的记录，改了就变成伪造证据。
- **Consequences:** 「谁先合谁留号」是一条可以照抄的口径，下次三条分支再撞号按同一规则办，不需要重新讨论。
  代价是**合流顺序变成了决策号的一部分**——中途调整合入顺序，已改好的号要跟着再改一遍，所以派单里固定顺序是必要的、不是随意的。
  重编后的全仓复核命令是 `grep -rn "D-131\|D-132\|D-133" --include=*.md --include=*.ts --include=*.js .`。

## D-135 · 接单台子的账本只追加、指纹只认用户批的那单活、心跳单独记账（2026-11-25，未发版）

- **Status:** `CONFIRMED`（六个新 spec 共 174 例：五个 162 例在两次 `TMPDIR=$PWD/.tmp npm run ci` 的 exit 0 里跑过，
  第六个 `block-flag-baseline` 12 例在它落地后单跑绿——它落地晚于那两次门禁，合起来的树的全量门禁是 `NOT_RUN`；
  真机隔离 soak `PASS`——账本 3 行是同一个块的 v1→v2→v3、判决 3 行 `veto/veto/pass`，证据在
  `.rsi/evidence/block-intake-2026-11-25/soak.txt` 与 `ledger-extract.txt`）
- **Date:** 2026-11-25
- **Context:** 分支 `feat/block-intake`（worktree `.agents/worktrees/feat-block-intake`，基线 `main` 尖端 `9b55d2d`）新增
  `src/block/` 8 个文件与 `src/supervisor/` 3 个文件：一条「用户批准一份切分 → 块落到账本 → 交工时被判」的窄通道。
  它要在三件互相拉扯的事上同时成立：① 事后能读出「谁在什么时候批了什么、谁否了什么」，重启也不丢；② 用户批的那单活
  必须可指纹化，任何真实改动都要被 `startBlock` 抓住；③ 一个块的生命周期跨回合，唯一的时钟是宿主的心跳投递，
  而心跳既不是判决也不是进度。下面八条是这条通道的口径，每条都写清被否掉的是什么。
- **Decision:**
  1. **判决账只追加、块行追加式版本化。** `verdicts.jsonl` 一行一次判决，模块里没有 update/delete 路径
     （`src/block/store.ts` 只导出 `appendVerdictRow` / `readVerdictRows`），同一 `evidenceHash` 重交不写第二行，
     直接回上一条并标 `evidenceUnchanged: true`（`src/supervisor/index.ts:111-123`）；`blocks.jsonl` 一个块一行一版，
     重开同一行只追加 `version + 1`，而 `version` 由写者算（`上一版 + 1`）：调用方报的号不连续就 `invalid`，
     超过 `versionsPerBlock`（20）就 `version-limit`。soak 实测 3 行 = 同一 `id` 的 v1→v2→v3（`open` / `open` /
     `accepted`），判决 3 行 `veto/veto/pass`，没有一行被就地改写过。
  2. **`verify` 不进 `splitHash`。** 指纹只对归一化后的 `{objective, blocks, constraints, nonGoals}` 取 sha-256
     （`normalizeSplit` → `splitHashOf`，`src/block/preview.ts:276-302`）；监工开关挂在行上（`BlockRow.verify?`），
     与指纹并排、不在指纹里。指纹回答的是「这是用户批的那单活吗」，监工开关是**执行策略**；折进去会让「用户把监工关了」
     被 `startBlock` 读成「用户改了单子」，从而以 `split-changed` 拒绝一份没人改过的预览。
  3. **第三个文件 `heartbeats.jsonl`。** 心跳观测既不写 `verdicts.jsonl`（判决是对活儿的判断，心跳不是），也不占
     `blocks.jsonl` 的版本槽（一个块 20 个槽，按源码注释「心跳至少隔一小时一次」的口径，一小时一记会把真块在 20 小时后
     顶退休），所以单独一个只追加文件，上限 `HEARTBEAT_OBSERVATION_LIMIT = 200` 行，到顶只 `warn` 一次、不再写
     （`src/block/brakes.ts:37-47`、`:213-219`）。soak 那轮该文件不存在——没有心跳投递，这是预期形状。
  4. **`block_id` 是行 id，块内用可选 `block` 选中。** `startBlock` 回的是**行** id，一行最多 3 块；所以 `accept` /
     `close` / `status` / `steer` / `stop` 都收一个可选 `block`（`blk-2` 或标题），省略时取第一个仍 `open` 的块
     （`blockOf()`，`src/block/tools.ts:144-166`）。两个概念不压成一个参数：`block_id` 若做成块级 id，账本行和工具参数
     就对不上；块内不给选择器，「一单三块」在第二次调用时无从指认。
  5. **账本不加锁，这是显式边界不是遗漏。** `src/taskboard/store.ts` 用 `O_EXCL` 锁，块账本不抄：写者是单写者
     （一个会话的工具层），`startBlock` 的 `(session, splitHash)` 幂等让重试根本不追加；两个进程同时追加会各自读到
     同一个「最后一版」，第二次 rename 赢、第一行丢。这段写在模块头（`src/block/store.ts:35-42`）。
  6. **`blockIntake` 是载入期开关、不做 `volatile()`。** 工具只注册一次（`src/index.ts:425`
     `if (config.blockIntake === true)`），投影到设置页会承诺一个「保存即生效」而实际要重载的实时编辑，所以
     `src/settings.ts:375` 把它和 `toolName` / `configVersion` 一起从投影里滤掉——键从 19 到 20，页面字段从 16 到 17。
     代价写在明处：它只能写 profile patch，不出现在设置页。
  7. **`override` 只覆盖「范围」类否决。** `scopeOnly = checks.failures.every(f => f.criterion === SCOPE_CRITERION)`
     （`SCOPE_CRITERION = '范围 ⊆ 批准'`），只有**全部**失败项都是范围、且调用方给了 `override`，才继续往下走
     （`src/supervisor/index.ts:150-152`）；其余五条确定性检查（计划覆盖、证据非空、产物可解析、依赖悬空、交接四行）
     与模型否决都不可覆盖。范围是「人在范围上拍板」这一件事；其余是事实性记账，人能授权，不能让不存在的文件存在。
  8. **心跳窄监听先算决策再记观测。** cordis 的 `agent/pre-step` 是 waterfall，handler 返回 `undefined` 会把整条链的
     决策丢掉，所以实现是 `const decision = await next()` → 观测（失败只 `warn`，不抛）→ `return decision`
     （`src/block/brakes.ts:223-234`）；`enabled !== true` 时**一个监听都不装**，不是装了再早退（`:198`）。
     `test/block-flag.spec.ts` 8 例钉住「决策与基线逐字节相同」。监听装在 `installGate` **之前**，因此是链上最外层：
     闸门自己拒掉的那次心跳它也记得到，而它返回的决策原样不动。
- **Alternatives rejected:**
  1. **判决行就地更新成最新状态**：被覆盖的那条否决会消失，而否决恰恰是审计要查的那条；soak 里 attempt 2 的「监工调用
     失败」若被 attempt 3 的 `pass` 覆盖，事后就看不出「这一块曾经因为环境缺 key 而没被独立判过」。
  2. **同一份证据重判写第二行**：白烧一次监工调用，`attempt` 号也失去「换过几份证据」的含义。现在第二条明确回
     `evidence-unchanged`，调用方知道是同一份证据被重交，不是又被否了一次。
  3. **`blocks.jsonl` 每块一行、就地覆盖**：丢掉「第几版是 accepted」，20 版上限也无处可算（上限是数行数，不是数字段）。
  4. **心跳写进 `verdicts.jsonl`，或占 `blocks.jsonl` 的版本槽**：前者让判决文件里混进非判决，后者让真块被心跳顶退休。
  5. **`verify` 折进 `splitHash`**：见决定 2，关监工会被读成改单子。
  6. **账本抄 taskboard 那把 `O_EXCL` 锁**：单写者路径上的第二套锁语义；真要多写者部署，正确做法是照抄 taskboard 的锁，
     而不是在这里发明一套，现在加锁只是把「还没到的并发」提前付费。
  7. **`blockIntake` 做成 `volatile()` 实时开关**：注册面做不到——工具注册不能热插拔，做成实时开关等于让设置页承诺一件
     只有重载才成立的事。
  8. **让 `override` 覆盖任意否决**：等于把确定性检查降级成建议。`override` 连同 `who` / `why` 记进判决行
     （`VerdictRow.override`），事后读得出「这次是谁把范围放过去的」。
- **Consequences:** 读侧宽容、写侧严格：坏行/被手改的行跳过并记进 `skipped`（行号、原因、前 200 字符），不合法的新行在
  落盘前拒绝，`rowHash` 是这条线的检测手段。追加式版本化让「一个块」在文件里是 N 行，读侧三处都按 `version` 取最新
  （`latestById`、`findBlockBySplit`、`openBlockIds`），新增读路径必须照办，否则会读到旧版本的状态。上限集中在一个常量
  `BLOCK_INTAKE_LIMITS`（3 块 / 10 分钟预览 TTL / 20 个活预览 / 20 版 / 200 条心跳），改口径只改一处。
  未发版：本轮不动 `package.json`、不打 tag、不推 `main`。

## D-136 · 监工走哪条路由留在 profile 里：`src` 不给路由兜底，空链就是继承会话路由（2026-11-25，未发版）

- **Status:** `CONFIRMED`（真机实测：把 `roles.supervisor` 从隔离 profile 里删掉后，判决行写 `route:"inherit"`、`judged:true`、`outcome:"pass"`；
  同一份账本里还有一条模型路由上的 `judged:true` `pass` 与一条模型自己产的 `veto`。证据
  `.rsi/evidence/supervisor-soak-2026-11-25/{soak.txt,ledger-extract.txt}`）
- **Date:** 2026-11-25
- **Context:** 上一轮（M2）的 soak 里独立模型监工一次都没在真机跑通：profile 钉死的监工路由
  `agent2api/deepseek-v4.1-flash` 需要 `AGENT2API_API_KEY`，这台机器上没有，于是那次 `pass` 带 `judged:false` + `not_judged`。
  问题因此变成二选一：让 `src` 在钉死的路由不可用时自己找一条退路，还是让「用哪条路由」继续留在 profile 里、由部署的人负责？
  这一轮先把「空链到底会发生什么」量出来，再定口径。
- **Decision:** 监工角色链保持 `src` 现状不变——默认 `[]`（`src/config.ts:685`），空链在
  `src/supervisor/verdict.ts:222` 塌成一次无路由调用（`input.routes.length === 0 ? [{}] : [...input.routes]`），
  引擎把「没有 provider/model」读成**继承会话的路由**，与其它角色完全一致。这不是推断：删掉链之后判决行写
  `route:"inherit"`、`judged:true`、`outcome:"pass"`。**所以一个 profile 的钉死监工路由没有凭据时，修法是把 profile 指向一条能用的路由
  （或干脆把链留空），不是往 `src` 里加兜底。**
- **Alternatives rejected:**
  1. **让 `src` 在钉死路由失败时回落到会话路由**：那「监工跑在你配的那条路由上」这句话就不再成立，一条死路由会被悄悄绕过、
     永远没人发现；而「继承」已经是空链的显式写法，想要继承就留空。
  2. **要求部署方必须有 `AGENT2API_API_KEY`**：那是一条机器的能力，不是一个代码决定；写进要求会把所有没有这个 provider 的部署挡在门外。
  3. **在插件的配置默认值里塞一条能用的路由**：把一个操作员的 provider 烤进产品，别人的 profile 拿到一条自己没凭据的默认值——
     正是本轮要解决的那种坏形状。
  4. **直接改线上 profile 的 `roles.supervisor`**：越出这一支的范围，而且动的是线上 home（`~/.dsh` 只读、实例不能重载重启）；
     真要改也该由操作员在自己那一侧改。
- **Consequences:** `judged` 是算出来的：`rowToWrite.route !== 'deterministic'`（`src/supervisor/index.ts:132`），
  所以 **`judged:true` 单独一条不说明模型判得好**——监工调用失败也是 `judged:true`，判决行写 `outcome:"veto"` + 理由 `监工调用失败`。
  **`pass` + `judged:true` 这一对**才只能来自被解析的模型答案（`parseSupervisorAnswer`），验收要钉这一对。
  另一面：监工用散文答对、没调 `structured_output` 时会被记成「没交答案」（soak.txt 的 F3），这条未修，属于行为面而不是路由面；
  它不影响本决定——无论走哪条路由，解析面都是同一个。空链继承也因此不是「免费」的：它把「监工跑在哪」这件事的责任明确交给了
  profile，出问题时要先看 profile，而不是先怀疑插件。

## D-137 · 问题卡片的答案是「点头」不是「一轮对话」：门禁与接单台子共用一个来源判断（2026-11-25，未发版）

- **Status:** `CONFIRMED`（两个新 spec 先红后绿——红时的失败分别是
  `approval-required: 预览之后没有一条消息逐字包含「确认」，不能开工` 与
  `expected { kind: 'pass', reason: 'question-reply' } / received 'non-user-source'`；实现后定向
  `npx vitest run test/block-tools.spec.ts test/gate.spec.ts` → **`2 文件 / 77 测试 PASS`**，全量门禁在功能提交
  `a926cd6` 上 `TMPDIR=$PWD/.tmp npm run ci` **EXIT=0**：vitest **111 文件 / 2130 测试 PASS**、oxlint
  **`Found 36 warnings and 0 errors.`**、`verify:lib` → `lib/ at a926cd6 is the build of src/ at a926cd6 (297 files,
  byte-identical)`；真机隔离 soak **PASS**——卡片答案真的开了一块 `3c688ff2…`（`approval.quote = "确认"`），
  同一动作打在修复前的构建上被拒成 `approval-required`，证据
  `.rsi/evidence/card-approval-soak-2026-11-25/soak.txt`）
- **Date:** 2026-11-25
- **Context:** 用户用问题卡片点头时，宿主记下的是一条 `source.kind === 'user-question-reply'` 的 `user/message`
  （真实形状与事件字段见 RESEARCH 的 2026-11-25 条）。两处代码只认 `'user'`：`src/block/tools.ts` 的
  `userMessagesSince()` 把卡片答案滤掉，于是 `startBlock` 的第 4 道检查永远找不到批准词——「点卡片确认」在接单台子上
  是死的，每次都拒成 `approval-required`；`src/gate.ts` 的 `classifyPreStep()` 把同一条消息记成 `non-user-source`，
  一个字都没说明它是用户发的。同一个字面量写了两遍，这正是它们能同时错、又没人发现的原因。
- **Decision:**
  1. **一个模块定义唯一口径。** 新文件 `src/user-source.ts` 导出 `QUESTION_REPLY_SOURCE_KIND`
     （`'user-question-reply'`）、`isUserAuthoredSource()`（`user` 或卡片）、`isQuestionReplySource()`（只卡片）、
     `startsTurn()`（只 `user`）。门禁与接单台子都从这里 import，字面量不再有第二份；该模块没有依赖，`src/gate.ts`
     不从 `src/block/` import 任何东西。四个导出都有调用方：`userMessagesSince()` 先用 `isUserAuthoredSource()` 过一遍
     （「两种都算用户说的话」这条规则落在这里），再按 `startsTurn()` / `isQuestionReplySource()` 分支。
  2. **卡片答案是点头，不自己开一轮对话。** `startsTurn()` 只对 `user` 为真，这就是那条产品决定：卡片答案默认不启动
     任何工作流，只在「用户说了什么」这一面被看见。要改它是产品决定，得有自己的一条记录，不能当代码整理顺手改掉。
  3. **接单台子这一侧，卡片答案在两个限制下才算数。** 它 `source.callId` 指向的 `ask_user_question` `tool/call`
     事件必须在**预览之后**记进会话（该事件自己的 `time` 比预览的 `createdAtMs` 晚）；答的是预览之前问的问题、或者
     callId 压根没被问过，都不算。算数时返回的文本只是用户选的 `selected` 标签加 `custom` 文本，不是整包 JSON。
  4. **门禁这一侧只改「叫法」，不改「准入」。** 没有 `user` 消息、但有卡片答案时返回
     `{kind:'pass', reason:'question-reply'}`；真正外来的来源仍是 `non-user-source`；心跳分支的顺序、`deliveryKey`
     与 `request` 的输入一个字没动，所以既有的纯用户批次决策与键逐字节相同（新用例用同一条用户消息做两次分类，
     钉住 `key` 与 `request` 相等）。`classificationFailure` 仍要求一条真 `user` 消息——卡片答案不能被当成
     「用户请求」来拒绝。
- **Alternatives rejected:**
  1. **把门禁放宽成「卡片答案也起一轮」**：点一下卡片就等于发了一条指令，用户没打字却看到一整轮工作流跑起来；这与
     `startsTurn()` 的语义冲突，也超出修这个 bug 的范围。
  2. **拿整包 JSON 去做逐字匹配**：payload 里带着模型自己写的问题文字，一句「用户说了「确认」吗？」就能让批准词自己
     出现，等于把模型的话当成用户的许可。新用例 (c) 专门钉这一条。
  3. **两处各自判断、不共用模块**：这正是缺陷的成因——两个 `kind === 'user'` 各写一遍，谁都不知道对方漏了哪一类。
  4. **只按「预览之后收到过一张卡片」判断、不比对 callId**：答的是上一个问题的卡片会变成这一单的批准；用例 (a)(b)
     钉住这个边界（问题问在预览之前、callId 没被问过）。
- **Consequences:** 读侧多了一个可解释的标签 `question-reply`，事后从会话里能看出「这轮没跑工作流，是因为用户只点了
  一张卡片」。残余风险四条，都写在这里而不是留给下一个人发现：① 跨预览边界答的卡片仍被拒——用户在预览之前打开卡片、
  预览之后才点确认，`tool/call` 早于预览，于是这单仍要用户再打一句（这是刻意的，宁可多问一句，也不把旧问题的答案当成
  这一单的批准）；② 卡片批准写进账本的 `approval.quote` 是用户选中的标签（例如「确认」），不是一句打字的话，所以账本
  里这一类批准看起来比手打的那类短，事后读账本要按 `kind` 一起看；③ 卡片答案的可用性依赖 `tool/call` 事件留在会话里
  且带数值 `time`——会话被裁剪、或宿主不再记这条事件时，卡片批准会退回 `approval-required`，好在这是响亮且具名的失败，
  不会静默开工；④ payload 解析不出 `answers` 时按约定回落到原文，这种退化 payload 里模型的问题文字仍可能命中批准词，
  但真实卡片每条问题都必须带一条答案（宿主侧校验），所以只在坏数据下成立，接受了。未发版：不动 `package.json`、
  不打 tag、不 push。
