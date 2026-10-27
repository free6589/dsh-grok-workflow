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
