# Research Notes

Status labels: `CONFIRMED`, `HYPOTHESIS`, `NOT_VERIFIED`.

## Reference revisions

- DSH: `687f282e8625c6b8d11ff58211a90524be2e4317`, package version `0.2.1-rc.2`.
- Grok Build: `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`, checked out under `/home/fish/dsh-tasks/grok-build`.

## DSH workflow capability (CONFIRMED)

Source: `/home/fish/projects_mine/deepseek-harness`

- `packages/workflow/workflow/src/index.ts` defines the `ctx.workflowEngine`
  service, `workflow/*` lifecycle events, and `WorkflowError` codes. The engine
  is a capability seam, not an agent loop.
- `packages/workflow/workflow/src/runtime-types.ts` defines
  `WorkflowStartRequest` (`script`, `meta`, `args`, optional
  `subagentProvider`, optional `maxTotalAgents`, required `parent`, optional
  `signal`) and `WorkflowRun` (`id`, `meta`, `result`, `cancel`, `dispose`).
- `packages/workflow/workflow-ptc/src/index.ts` implements the engine over the
  Node PTC sandbox. Scripts get `agent()`, `parallel()`, `pipeline()`,
  `phase()`, `log()`; `maxTotalAgents` and `maxConcurrentAgents` are engine
  config. `agent()` uses the configured `ctx.subagents` provider.
- `packages/workflow/tool-workflow/src/index.ts` is a model-facing consumer. It
  starts a run, awaits `run.result`, and always disposes in `finally`. This is
  the lifecycle pattern to mirror.
- `packages/workflow/workflow/README.md` states ordinary child failure makes
  `agent()` resolve `null`; misuse/caps throw fatal `WorkflowError`s. The
  result never rejects and carries a closed `stopReason`
  (`completed | cancelled | error`).

## DSH subagent capability (CONFIRMED)

Source: `/home/fish/projects_mine/deepseek-harness`

- `packages/subagent/subagent/src/index.ts` defines `ctx.subagents` and
  `startActivation(spec)`.
- `packages/subagent/subagent/src/types.ts` defines `delivery: 'caller'`
  (workflow consumers await without parent notices), `request.parent`,
  `signal`, `outputSchema`, and `SubagentResult.structured`.
- `dispose()` cancels the exact activation and waits for descendants/resource
  cleanup; the result settles after teardown. This is the cleanup contract the
  workflow engine already uses.
- `packages/bundle/base/cordis.patch.yml` mounts `subagent`,
  `subagent-spawn-in-process` (provider `spawn`), `workflow-ptc`,
  `tool-workflow`, and `tool-subagent`.

## DSH plugin loading and installation (CONFIRMED)

Source: DSH docs and source.

- A bundle is an npm package with `dsh.bundle.patch`; a profile has
  `dsh.profile.bundles` and an ordered patch stack.
- `dsh plugin --profile <name> add <package>` forwards to pnpm in the profile
  and adds the installed bundle to the profile list.
- `docs/user/develop/basic/publish.md` documents local checkout, tarball, npm,
  and GitHub installs. Git installs fetch sources and need a `prepare` build;
  shipping built `lib/` avoids that requirement.
- Bundle compatibility is checked from `engines.dsh` when present, otherwise
  from `@deepseek-ai/dsh*` peer ranges
  (`packages/boot/app-boot/README.md`).
- The real Loader API is in `@deepseek-ai/cordis-plugin-loader`; DSH profile
  tests mount `Context` + `Loader` + `Include` and load a `cordis.yml`.

## DSH tool and lifecycle APIs (CONFIRMED)

Source: DSH docs.

- `defineTool({ name, description, parameters, output, execute })` from
  `@deepseek-ai/dsh-tools`; `output.schema: { type: 'json' }` accepts a
  canonical JSON value and `output.render` turns it into model text.
- `ctx.tools.register(...)` is an effect and is removed when the owning plugin
  fiber unloads.
- `ctx.effect(() => disposer)` handles resources outside built-in registries;
  async disposers are awaited by `fiber.dispose()`.
- `ctx.systemPrompt.section(...)` is an effect.

## Grok Build workflow strategy (CONFIRMED, source-level)

Source: `/home/fish/dsh-tasks/grok-build`

- Built-in workflows are Rhai scripts registered from
  `crates/codegen/xai-grok-shell/src/session/workflow/registry.rs`; the current
  built-in is `deep-research`.
- `crates/codegen/xai-grok-shell/src/session/workflows/deep_research.rhai`
  implements Plan → Research → Verify → Report. Plan breadth defaults to 4 and
  is capped at 6. Research claims are structured, verifier shards are used, and
  exact claim-ID validation rejects malformed verifier output. Report status is
  partial when coverage/verification is incomplete.
- `manager.rs` has a per-session active-run cap of 4, an agent budget, journal
  paths, cancellation tokens, and pause/resume statuses.
- `schema_contract.rs` appends a structured-output contract prompt with
  `SCHEMA_CONTRACT_RETRIES = 1`, validates a JSON fenced block, and rejects
  external schema refs.
- **Portability conclusion:** the strategy is reusable; the Rhai/Rust runtime,
  Grok session store, budget leases, and pause/resume journal are not directly
  portable to DSH. DSH's workflow engine + subagent seam is the replacement.
  The detailed source map above records exactly which limits and validation
  rules were borrowed and which were not.

## Open questions / not verified

- CONFIRMED: `engines.dsh: "0.2.1-rc.2"` (exact, matching the exact DSH peer
  dependency set) installs successfully in the isolated local profile and from
  GitHub.
- CONFIRMED: a headless profile with a Bifrost model route ran real end-to-end
  `grok_workflow` calls on this host without logging keys.
- CONFIRMED: GitHub Actions installed DSH `0.2.1-rc.2` packages from the public
  npm registry and passed on Node 22 and Node 24.

## Grok Build deep-research specifics (CONFIRMED, detailed)

The following facts were independently re-read from `2bdd1d6a` by a read-only
research subagent. Paths use `xai-workflow/` for `crates/codegen/xai-workflow/`
and `xai-grok-shell/` for `crates/codegen/xai-grok-shell/`.

### Plan and scheduling

- `deep_research.rhai` defaults `breadth` to 4 and accepts only 2–6
  (`xai-grok-shell/src/session/workflows/deep_research.rhai:29-32`). The planner
  returns `questions`; the script caps them and falls back to `[query]` when the
  planner fails (34-76). There is no separate plan record; a journaled planner
  response is the durable copy.
- Research tasks are submitted through `parallel(jobs)` (140), a barrier
  fan-out, not a DAG. There are no dependencies, work queue, or per-item retry.
- Per-run live children are controlled by a semaphore (`max_concurrent_agents`,
  default 32, clamped to at least 2 CPUs) in
  `xai-grok-shell/src/session/workflow/host_service.rs:24-46,115`.
- Active runs per session are capped at 4 in
  `xai-grok-shell/src/session/workflow/manager.rs:22,156-160`.
- The default agent budget is 128, capped at 1024; every `agent()`/`parallel()`
  item consumes a slot (`xai-workflow/src/lib.rs:17-18`;
  `xai-grok-tools/src/implementations/grok_build/workflow/mod.rs:179,203-212`).

### Verification and status

- `verifier_count = 2`, reduced to the candidate count; claims are sharded
  round-robin by `claim_idx % verifier_count`, so each claim is checked once
  (deep_research.rhai:215-233).
- A shard is accepted only when the result exists, succeeded, has the exact
  expected verdict count, and every expected claim ID appears exactly once
  (281-314). Any mismatch invalidates the whole shard.
- A claim is retained only when its shard is valid, `supported == true`, and
  verifier evidence/title/locator are non-empty after trimming (333-348).
- There is no verifier retry loop; the only retry is the host-level schema
  contract retry (`SCHEMA_CONTRACT_RETRIES = 1`, maximum two attempts) in
  `xai-grok-shell/src/session/workflow/schema_contract.rs:1-98`.
- Research status is `verified` only when no researcher failure, uncertainty,
  dropped claim, invalid shard, rejected claim, or zero-claim condition occurred
  (389-390). `partial` is a result field; the outer workflow can still finish
  normally (`tracker.rs:493-540`).

### Lifecycle and security

- Pause/cancel/stop cancel the run token and child agents; stop retains the
  journal and is resumable in the same process. Resume is not exactly-once
  (`manager.rs:628-706`, `tracker.rs:50-53`, user-guide 328-330).
- The journal is append-only JSONL under
  `<session_dir>/workflows/<run_id>/journal.jsonl`, fsynced, capped at 64 MiB /
  10,000 entries, with replay-divergence detection
  (`xai-workflow/src/journal.rs:6-7,174-229,300-366`).
- Cleanup cancels children by run id with a 20 s drain; the watcher waits 25 s
  and marks a failed drain as Interrupted (`host_service.rs:57,726-756`;
  `manager.rs:386-405`).
- All deep-research agents use `capability_mode:"read-only"`; read-only is a
  ToolKind allowlist and custom/MCP tools without a kind are preserved
  unconditionally — a caveat, not a guarantee (`xai-tool-types/src/task.rs:270-289`;
  `xai-grok-tools/src/implementations/grok_build/task/types.rs:305-345`).
- Prompts mark query/question/source content as untrusted data and require
  researchers to cite only inspected sources (deep_research.rhai:50-53,123-130,
  261-269).

### Mapping used by this plugin

| Grok Build | DSH mapping | MVP status |
|---|---|---|
| `parallel(jobs)` barrier | bounded worker pool inside a DSH workflow script | implemented |
| per-run semaphore | plugin `maxConcurrency` (default 3, hard 6) + engine slots | implemented |
| planner `output_schema` | `agent({ schema })` object-rooted schema | implemented |
| exact claim-ID set equality | exact acceptance-criterion matching in verifier output | implemented |
| schema-contract retry once | verifier/worker result validation triggers task retry | implemented (bounded) |
| journal/pause/resume | none; DSH engine cancellation + run disposal | out of scope |
| read-only capability mode | prompt instruction only in MVP; no DSH capability mode | NOT_IMPLEMENTED |
| citation marker validation | verifier evidence requirement; no report-marker synthesis | implementation differs |
| 4 active runs/session | plugin `maxActiveRuns` default 2, hard 4 | implemented |

## DSH plugin-record persistence — grok-mode toggle seam (CONFIRMED)

Source: installed DSH `0.2.1-rc.2` (`dsh-session`), mirrored by `src/records.ts` and the
new `src/mode.ts` (`test/mode.spec.ts`, 13 tests green; wired into gate/config next).

- `appendPluginRecord(session, type, data)` writes an `ignorable` session event that never
  enters the model-visible surface and survives fork/resume. It calls
  `session.#appendRecord(type, data)` — a private method of the real `Session` class — so
  passing a non-`Session` throws `TypeError: Receiver must be an instance of class Session`
  before any `append` is touched. The `typeof session.append !== 'function'` guard in
  `setMode`/`recordDelivery` is a capability check, not the throw source.
- `#appendRecord` snapshots data with `snapshotJsonValue` (throws on non-JSON: NaN, functions,
  undefined), builds a frozen event `{ type, seq, time, data, ignorable: true }`, enforces the
  `plugin:` type grammar (`/^plugin:[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/`), and
  commits to `session.log` — it never calls `session.append`, so overriding `append` does not
  break plugin-record writes.
- `pluginRecordOf(event)` returns `undefined` unless `event.ignorable === true` and the type
  matches the grammar; otherwise `{ type, seq, time, data: unknown }`. `data` is `unknown` at
  runtime, so owner-side revalidation (`isModeRecord`-style) is mandatory.
- Read-back is `session.ownEvents()` filtered by `pluginRecordOf`. The grok-mode toggle is
  whole-value-replace: the LAST valid record is the current state (survives restart because
  `session.log` is the durable conversation record that `ownEvents()` replays).
- `PluginRecordMap` declaration merging across files is fine: `records.ts` and `mode.ts` both
  augment `@deepseek-ai/dsh-session`; TS merges them and the literal const key type-checks.
- Test-harness convention (gate/routing/lifecycle specs): tests use the REAL
  `@deepseek-ai/dsh-session` (real `Session.create(id as never)`, real
  `appendPluginRecord`/`pluginRecordOf`); plain-object stubs only for failure paths; inject
  malformed payloads with `data as never` (compile-time cast; runtime JSON check passes).
- Build: `tsconfig.build.json` compiles ALL `src/**/*.ts` into `lib/` regardless of
  reachability from `index.js`; `lib/` is git-tracked and Release verifies it, so each new src
  file adds untracked `lib/<name>.*` to commit at release (`lib/mode.*` for this feature).

## Adding a `grokDefault`-style volatile config key — the full ripple (CONFIRMED)

Verified while landing `grokDefault` (`npm run ci` 385 tests / 23 files green). One key touches
every key-enumerating surface:
1. `src/config.ts`: zod schema (`.volatile()`), the `CONFIG_KEYS` list (schema order), the
   `resolveConfig` return, and `describeResolvedConfig`'s one-line signature.
2. `src/types.ts`: the field on BOTH `GrokWorkflowConfig` (optional) and `ResolvedConfig`
   (required; inline union e.g. `'on' | 'off'`; no alias; no configVersion bump / migration).
3. `src/client/index.js`: a `FIELDS` entry + `field.<key>` + `field.<key>.hint` in BOTH the zh and
   en dicts (the settings-page bundle enumerates every key; bilingual-copy tests require both
   dicts and equal key sets).
4. Tests that pin the key set / descriptor: `test/settings-projection.spec.ts` (exact sorted
   volatile list + count via `realSettingsDescriptor()`), `test/config.spec.ts` (page field
   count), `test/client.spec.ts` (FIELDS + roles + read-only == CONFIG_KEYS sorted; numeric
   bounds == HARD_LIMITS; dict parity; `lib/client.js` byte-identical to `src/client/index.js`).

Semantics ripple for a default-OFF gate toggle: every test that asserts a batch is ADMITTED must
opt in — `grokDefault: 'on'` in its apply config, or a `setMode(enabled:true)` record on a real
`Session.create` session (FakeSession stubs can't hold mode records since `ownEvents→[]`).
`classifyPreStep` pass-reason order is contract: empty-batch → non-user-source → subagent →
out-of-scope → mode-off → already-routed; reason labels are asserted only via direct
`classifyPreStep(deps,payload)` + `toEqual`, not through the dispatch handler.

## `/grok` command — lazy `commands` mount + handler contract (CONFIRMED)

- Mount exactly like `dsh-plan-mode` mounts `/plan`: lazy `ctx.inject(['commands'], cb)` only;
  `'commands'` is deliberately ABSENT from the plugin's static `inject` (plan-mode's static
  inject = `["tools","systemPrompt","sessionProjections"]`, no `commands`). Where no `commands`
  service is composed (headless/ACP) the callback never runs and the command does not exist —
  `grokDefault` governs there. `test/loader.spec.ts` stays green with the lazy mount pending.
- `dsh-commands` register contract (its README, CONFIRMED): lowercase `name`;
  `input: { hint }` (+ optional `attachments`/`recordInput`); `handler: ({ agent, rawInput }) =>
  { kind: 'success' | 'error', text }`, runs directly against the agent (no model message);
  `rawInput` = everything after the name incl. separator whitespace; duplicate names in one
  scope throw. `dsh-commands` is NOT a bundle dependency, so `src/command.ts` types the
  register/handler surface STRUCTURALLY (no import).
- `/grok` grammar (pinned by tests): trim → `''`/`'on'` enable, `'off'` disable, anything else
  is an error with the toggle untouched. That error is explicit in every case: a one-line
  argument settles as `GROK_USAGE_TEXT` ("Usage: /grok [on|off]. This text was not sent as a
  prompt, so nothing ran."), a prompt-shaped argument (multi-line, or over
  `INTAKE_LIMITS.commandPromptChars` = 200 characters) settles as the measured bilingual refusal
  from `src/intake.ts` (`refuseDiscardedCommandPrompt`). `setBy` =
  `command:/grok` / `command:/grok off`. `turn` is informational (finite agent turn else 0); the
  gate reads only `enabled`. The boundary exists because `dsh-commands` `parseCommand`
  (`/^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u`) turns the whole first line into a command and hands
  the rest over as `rawInput`: a stored task prompt whose first line is `/grok 团队任务：…`
  therefore arrives here as its own argument (`docs/task-prompt-template.md`).
- Cordis test seam (CONFIRMED): `ctx.provide('commands', value)` works outside a fiber on
  `new Context()`; `ctx.inject(['commands'], cb)` fires cb async with `cb-ctx.commands === value`
  and PENDS (never fires) until the service appears. `registerGrokCommand` carries a
  `typeof ctx.inject === 'function'` guard so hand-rolled test fakes (no cordis registry) stay
  inert without edits.

## A13 — 谁把被 claim 的批次写进 transcript（P0-5，2026-11-02，`CONFIRMED`）

- **`AgentLoop.step()` 是唯一写入者**：`dsh-agent-loop/lib/index.js` 的 `step()` 在真正开始一步时
  逐条 `session.append("user/message", message, { surfaceOp: "append" })`（`source.kind ===
  "runtime-context"` 的走 context 分支）。`preStep()` 之前已把批次从 inbox `claim` 走，所以
  **"claim 之后、step 开始之前"这段时间里，这条消息在会话中完全不存在**。
- **`enter.messages` 的写入时机 = 监听器返回之后**。任何在 `agent/pre-step` 里 `await` 长时间
  操作的监听器（本插件 `in-turn` 就是等整个工作流），都会把用户消息的可视化推迟到那一刻。
  这不是 GUI bug，也不是持久化 bug：`session.append` 随时可写，缺的只是"先写"这一步。
- **session 没有按 message id 去重**：同一 message 既 `session.append` 又放进 `enter.messages`
  会渲染两份；两个写入者必须二选一（`withoutClaimed` 就是为此）。
- **GUI 的乐观回显是本地状态**：`dsh-api-session-controller/lib/client.js`
  `pendingSubmissions` 里的 `PendingSubmissionBubble` 只在**发起它的那个页面**里存在，
  持久 `user/message` 到达或页面刷新即退场。所以"发送瞬间看得见、刷新后消失"是同一缺陷的两种表象。
- **副作用**：先写消息再跑工作流时，`collectHistory()` 会把这条新消息当成"Conversation so far"，
  令 objective 重复携带请求。历史快照必须在写入**之前**取（`answerInTurn` 现在这样做）。

## A14 — 跨轮上下文的唯一可信来源是插件自己写的报告（v0.5，2026-11-06，`CONFIRMED`）

- **每一轮的子代理都是全新上下文**：`ctx.workflowEngine` 执行的脚本经 `agent()` hook 创建子代理，
  它们看不到父会话对话，也看不到前序轮次。所谓"跨轮"只在**宿主侧**存在：会话 transcript 里有前几轮
  的 `user/message` 和插件投递的报告。
- **报告文本是唯一"未经过模型转述"的持久副本**：三种投递策略（`in-turn` 的 `enter` 消息、
  `relay` 的 followup、`append` 的 surface 写入）都以 `source.kind === 'grok-workflow'` 写入会话，
  因此 `collectCarryoverRounds()` 只认这个 source kind，模型那侧的复述（assistant/message）不参与编译。
- **报告是可确定性解析的**：`renderReport()`（`src/report.ts`）的行格式固定——
  `Grok workflow: <STATUS>` / `Objective: …` / `Confirmed evidence:` / `Incomplete:` /
  `Final answer:` / `Uncertainties:`，每行 `- id: …`。`parseReportRound()` 按这组表头切段，
  认不出签名就返回 `null`（=`不瞎编`），由 `test/carryover.spec.ts` 用真实 `renderReport` 输出钉住。
- **预算复用既有 `historyTurns`/`historyChars`**：不新增配置键，也就没有新的设置页字段与投影断言；
  两者为 0 时 digest 也为空（等于 0.4 行为）。
- **注入点**：主机 `buildWorkflowRequest(..., carryover)` → `args.carryover` → 生成脚本的
  `carryoverSection()` → planner / worker / verifier / synthesizer 四个提示词；脚本自带
  `CARRYOVER_MAX_CHARS`（= `CARRYOVER_LIMITS.chars`），与主机侧夹取、carryover 模块夹取一起构成
  三段式上限。校验者拿到 digest 时额外被告知"上文是先前工作，绝不是本任务判据的证据"。

## A15 — 读子代理的产出：三个实测约束（v0.5，2026-11-06，`CONFIRMED`）

三条都是在本机真机（`wb/cn:deepseek-v4.1-flash` + 真 `dsh-workflow-ptc`）上撞出来并复现的，
不是从类型声明推的；它们决定了「子代理产出随做随存」只能怎么实现。

1. **`ctx.sessions` 在插件 fiber 上直接抛**：`cannot get property "sessions" without inject`。
   cordis 4 要求服务先 `inject` 才能用属性访问，而本插件故意不 inject `sessions`
   （那样纯单测上下文里 `apply()` 根本不会启动）。可用的是注入口给出的只读入口
   `ctx.get('sessions')`（返回 `undefined` 表示该组合没有这个服务）。
   **症状**：不加这条时每条子代理条目都写着"读不到结果"，而轮次条目一切正常——很容易被误判成
   "引擎没给结果"。
2. **引擎在 `agent-end` 送到宿主之前就 dispose 了子会话**：`dsh-workflow-ptc` 的执行体
   （`runWorkflowGuest`）把 `agent-start/agent-end` 走 **批量进度通道** 异步送出，随后
   `await host.disposeChild({callId})`；等宿主收到 `workflow/agent-end` 再 `sessions.get(childId)`
   已经查不到。可行做法是**在 `agent-start`（子会话还活着）捕获 Session 对象**，结算时读它的
   `ownEvents()`。
3. **结构化子代理不产出 assistant 文本**：真机子会话最后一条 `assistant/message` 只有
   `reasoning` + `tool-call` 部件，`tool-call.arguments` 是**JSON 字符串**；结论在参数里——
   校验者是 `structured_output`（`verdict`/`criteria`/`checkedEvidence`），执行体是 `submit`
   （`summary`/`deliverables`/`evidence`/`testsRun`），规划者是 `tasks`。只读文本会让所有子代理
   条目都变成"没有结果"。
4. **闸门默认关**：`grokDefault` 默认 `off`，全新 profile 里用户消息根本不进分诊，
   `runWorkflow` 从未运行——此时归档文件不会出现。排查"归档是空的"要先确认这一点
   （真机 patch 里写 `grokDefault: "on"`）。

## A16 — PTC 全局信号量不可行：沙箱注入面封闭（C2-spike，2026-11-07，`CONFIRMED`）
- **结论：不可行（不改行为前提下）**：`ctx.workflowEngine.start` 不接受 agent 钩子之外的 host 回调/共享原语注入；脚本内 `callRole` 调不到 host 侧全局计数。想做必须改 harness + 本仓库脚本（= 改行为），本次 spike 不做。
- **请求面封闭**：`WorkflowStartRequest` 只有 `script/meta/args/subagentProvider/maxTotalAgents/parent/signal`（`packages/workflow/workflow/src/runtime-types.ts:19-34`）；`PtcWorkflowEngine.start` 只组装 `WorkerInit{meta,body,args,limits}`（`packages/workflow/workflow-ptc/src/index.ts:149-154`），无额外绑定参数（`index.ts:134-189`）。
- **绑定面封闭**：`PtcWorkflowRun.bindings()` 写死 6 键 `begin/startChild/childResult/disposeChild/progress`（`packages/workflow/workflow-ptc/src/host.ts:178-189`），`drive()` 只暴露一个 namespace `workflowHost`（`host.ts:290-297`，程序模板 `host.ts:27`）。Guest 类型 `WorkflowGuestHost` 仅 5 方法（`src/guest-types.ts:27-59`），`runWorkflowGuest` 的 `ChildPort` 仅 `startAgent`（`src/guest.ts:49-66`）。
- **脚本全局表封闭**：`WorkflowExecution` 只注入 `agent/parallel/pipeline/phase/log/args`（`packages/workflow/workflow-ptc/src/runtime.ts:85-93`）；`agent()` opts 白名单 `label/phase/schema/provider/model`（`runtime.ts:32-33,237-258`），未知 key 抛 `UNSUPPORTED_OPTION`；跨 realm 值须过 `materializeFromRealm`，函数不可过（`src/realm.ts:85-86`）。PTC 层 `PtcBindingFunction` 本是 `(args) => Promise<PtcJsonValue>`、支持多 namespace（`packages/ptc-runtime/ptc-runtime/src/types.ts:20,88-89`），但 workflow-ptc 只用了一个。
- **本仓库侧无计数通道**：`buildWorkflowRequest` 的 `args` 只有 objective/tasks/并发重试上限/roles/switchOn/carryover 等（`src/script.ts:1543-1604`）；`callRole` 唯一出口是 `agent(prompt, call)`（`src/script.ts:390`），`routeInFlight`（`src/script.ts:297-313`）是单 run 内存计数，跨 run 不共享。
- **最小注入点（HYPOTHESIS，未做）**：`guest-types.ts` 加 `semAcquire/semRelease` → `host.ts bindings()` 实现进程级 `Map<key,{permits,waiters}>` → `guest.ts` 透传 `SemaphorePort` → `runtime.ts globals` 注册冻结函数 → `index.ts WorkerInit` + 本仓库 `args` 下发 key（纯 JSON）。安全要求：状态只活 host 侧、acquire 与 `controller.signal` 联动可取消（仿 `host.ts:231-247`）、key 命名空间化、unload 时清等待队列（仿 `host.ts:307-317`）、返回仅纯 JSON。
- **替代方向**：不碰沙箱，在 host 侧（`src/run.ts` 的 `activeCountOfSession`/cap 检查，`run.ts:116-119,509-535`）做 run 级准入排队；粒度是 run 不是 task/role，且已有 per-session/total 两层上限。Task 级写冲突已有脚本内串行化（`mapLimitIsolated`，`src/script.ts:1037-1105`），与全局信号量无关。

## A17 — 键控槽位的替换机制是优先级遮蔽，不是去重替换（2026-11-08，`CONFIRMED`）

- **契约**：`conversation.chat.node` 的声明注释写"Reusing a key replaces that node renderer"
  （`dsh-client-ui-chat/lib/types/client/contract/slots.d.ts:326-336`）。
- **运行时实现**（`dsh-web-frontend/dist/assets/index-*.js` 内 `SlotCore.register`，静态客户端
  路径无优先级分配器、`options.priority` 原样透传）：同键**同优先级**（默认 `?? 0`）注册直接抛
  `keyed slot "…" already has an entry for key "…" — register at a different priority to shadow it
  (lowest renders)`；渲染时 `entriesOfSlot` 按优先级升序对键控条目去重、**最低优先级者渲染**，
  其余条目保持 live 但被遮蔽（`isLive` 仍真，插件卸载后自然恢复）。
- **实测后果**：两个客户端插件都注册 `workflow-run`（都无 priority → 都 0）时，**后注册者整条
  plugin fiber 失败**——web boot 报 "N entries did not activate"、整页只剩错误屏，失败方是库存
  `dsh-client-ui-workflow-run`。动态包路径（`dsh-cordis-client-runner` 的 guarded
  `allocatePriority: () => --this.nextPriority`）会自动递减，不撞此坑；**静态客户端路径会撞**。
- **正确姿势**：跨插件复用键控键必须显式 `priority: -1`（或任何 < 库存默认的值）。本仓
  `src/client/index.js` `mountPanel` 已按此实现并有单测钉死（`test/panel-links.spec.ts`
  `expect(options['priority']).toBe(-1)`）。
- **可开性与状态解耦**：workflow 子代理由 `startLocal` 以 `mode: "continuable"` 落描述符
  （`dsh-subagent/lib/index.js`）；`values.subagent.mode` 与 `sessions.byId[childId]` 在结束后
  依然可解析，库存渲染器只是用 `member.status === "running"` 把它挡住了
  （`dsh-client-ui-workflow-run/lib/client.js:176-179`）。

## A18 — 子代理显示名链路与 cordis 服务解析的硬事实（fix_child_names 第四次执行，2026-11-08，`CONFIRMED`）

**显示名链路（逐行重验，行号为 installed `0.2.1-rc.2`）**：

1. Guest 的 `agent()` 会为**观察者事件**算 `label = opts.label ?? defaultLabel(prompt)`
   （`dsh-workflow/lib/runtime.js:183-188`），但 `startAgent` 转发体只有
   `prompt/schema/provider/model`（`runtime.js` 构造 `children.startAgent` 处）——label 到不了 host。
2. Host `startChild` 写死 `` label: `${this.meta.name} child ${callId}` ``（`workflow-ptc/src/host.ts:205`），
   经 `startActivation(spec)` → `startLocal`（`dsh-subagent/lib/index.js:1391-1411`）快照
   `snapshotSubagentDescriptor({label: spec.label})`，写入子会话**首个** `subagent/descriptor`
   事件并被 `foldSubagentDescriptor`（:697）锁成 first-wins；`establishCatalogChild`（:816）把 label
   带进目录；GUI 主名 `entry.label ?? entry.id`（`dsh-client-ui-subagent/lib/client.js:201`），
   次级行 `summary?.title · mode · activity`（:205-209）。**改主名的唯一插件侧控制点 =
   `startActivation` 收到的 spec.label**（契约明说 label 归调用方，types.d.ts:122-124）。
3. `PtcWorkflowEngine.start()` 在 **start() 时**读 `runCtx.subagents`（`workflow-ptc/src/index.ts:157`），
   所以插件可以在把 run 交给引擎前，用**同一个引擎构造函数**建一个私有 twin，
   换上装饰过的 subagents 视图（`src/team-engine.ts`）。

**cordis 解析硬事实（三次真机失败换来，都是 `CONFIRMED`）**：

- 插件 fiber 只能看到自己 `inject` 的服务名 + 非隔离祖先；对插件 ctx 直接读
  `ctx.subagents`/`ctx.ptcRuntime` 抛 `cannot get property "X" without inject`。
- 在**任何** cordis ctx 上，服务的**属性访问**走 isolate-guarded 的祖先 fiber walk；
  `ctx.get(name)` 与 `ctx.reflect.get(name, false)` 能解析同一服务（真机探针实证：
  同一 ctx 上 `readSubagents` 抛错而 `getSubagents`/`reflectGet` 返回 'object'）。
- **不要代理 cordis ctx**：其 get handler 以 receiver 为键做 shadow/fiber walk，
  `Reflect.get(target, prop, target)` 直接破坏解析（第一次真机失败的根因）。
- cordis `Service` 基类构造时经 `this.ctx.reflect.provide(name, self)` 注册；
  私有实例必须把它换成 `provide: () => {}`（否则污染运行时服务面）。
- cordis 每次属性访问可能返回派生视图 → 以 ctx 为键缓存 twin（WeakMap），
  不能以注入的引擎实例为键。
- TS 6：对没有调用签名的对象类型写 `typeof x !== 'function'` 会把 else 分支收窄成
  `never`——判别构造函数的 static inject 要先经 `unknown` 转型再取 `.inject`。

**运维事实**：隔离 home 的子会话目录是**裸 uuid**（`sessions/<workspace-key>/<childId>/`，
无 `session-` 前缀；父会话才有）；`/tmp` 在部分执行通道间不保证留存，证据要当场拷进
`docs/knowledge/evidence/`。插件 headless 输出里 cordis logger.warn 不可见，
需要诊断落点时用工具结果/会话日志，别指望 stderr。

**GUI 渲染链实证补充（Round 32，真 Chromium，`CONFIRMED`）**：顶栏触发器 aria-label 为计数
（运行中 `1 subagent running`，完成态 `6 subagents`）；展开后的菜单行主标签 = `entry.label ?? entry.id`
（client.js:201），次级行 = `summary?.title · mode · activity`——子会话 title 由 DSH 从子代理
提示词派生，修复后提示词首行即描述性标题，故次级行同样以任务名开头（不再是裸人设行开头）。
团队档子会话的 descriptor label 与面板渲染逐字一致（真机交叉核对）。隔离 Web 实例的 boot
stdout 形如 `dsh web: http://127.0.0.1:3199/?token=…`——token 只走环境变量进驱动，不落盘；
首次 boot 前必须 `--from-default-profile`（REPLACE 语义），插件用 `dsh plugin add file://<checkout>`
dev 安装（pnpm store 可落仓库内 `.pnpm-store/`）。

## A19 — DSH 插件兼容判定的真实语义：`includePrerelease`，`<0.3.0` 会放行 `0.3.0-rc.*`（2026-11-15，`CONFIRMED`）

证据：`evidence/verify-H1/engines-dsh-B01.txt`（直接调用 DSH 自己的 `evaluatePluginCompatibility`）。

实测矩阵（插件 `engines.dsh: ">=0.2.1-rc.2 <0.3.0"`）：

| runtime | 判定 |
| --- | --- |
| `0.2.1-rc.2` | compatible |
| `0.2.2-rc.3`（本机真实运行时） | compatible → `null`，无需版本豁免 |
| `0.2.2` | compatible |
| `0.3.0-rc.1` | **compatible** |
| 对照 `engines.dsh:"<0.2.0"` | **REFUSED**，附完整不兼容警告 + `allow-version` 提示 |

原因是上游用 `semver.satisfies(runtime, range, { includePrerelease: true })`
（`dsh-app-boot/lib/index.js`）：prerelease 的 `0.3.0-rc.1` 排序低于 `0.3.0`，因此在排除上界之外
仍满足区间。两条推论值得记住：

1. 「上界」在插件侧不能用来阻断 rc 线。要阻断必须写成 `<0.3.0-0` 这类形式——那是语义技巧，
   不该为一个未发生的事故提前写进清单。
2. 兼容表（旧 `dsh.compatibility.dshReleases`）与 `engines` 并存时，前者是纯文档、后者才参与判定；
   两份真源必然漂移，已在 D-043 收成一份。

`package.json` 现在只有 `engines`（`>=0.2.1-rc.2 <0.3.0` + `node >=22`），旧的
`dsh.compatibility`（`dsh` / `profiles` / `dshReleases`）整块删除，`npm pack` 与安装均未因此报错。

## A20 — `link:` 安装会带出第二份 `@deepseek-ai/dsh-session`：`/grok on` 的 brand check 失败（现象 `CONFIRMED`，归因 `HYPOTHESIS`）

现象（隔离实例，headless Chromium，`probes/`）：

```text
link: 安装 → /grok on
  Failed
  grok
  Grok workflow toggle not changed: Receiver must be an instance of class Session.
  In this session no toggle was recorded.

打包产物安装 → /grok on
  Grok workflow ON — every message now runs the full plan→execute→verify workflow.
```

这是 B03 修复（`src/command.ts` 读回校验）**正确工作的样子**：写入没落地时它报失败、并说出当前
真实状态，而不是继续印成功文案。失败本身来自安装形态，不是判定逻辑。

归因（`HYPOTHESIS`，未插桩验证模块身份）：`link:` 让插件解析到工作树自己的
`node_modules/@deepseek-ai/dsh-session`（devDependencies，`0.2.1-rc.2`），而运行时是 `0.2.2-rc.3`；
`appendPluginRecord` 是宿主 session 实例上的方法，跨副本 `instanceof` brand check 直接抛
`Receiver must be an instance of class Session`。打包安装的 profile 只有 `cosmokit` /
`schemastery`，不存在第二份 session 包。

运维结论（已进 D-046）：真机验 `/grok` 开关用打包产物；`link:` 只用于「加载是否 pending」这类诊断。
若要证伪该归因，最小插桩是打印两份 `require.resolve('@deepseek-ai/dsh-session')` 与一次
`instanceof` 实测——本轮没做，所以状态停在 `HYPOTHESIS`。

附带 `CONFIRMED` 限制：**尚无会话的首页里发 `/grok on` 不会执行**（命令需要已存在的 session），
必须先有一条普通消息把会话建出来。这不是缺陷，是命令面的事实，写进验证流程避免重复踩。

## A21 — 进度 Tab 的数据源与视图能力边界（2026-11-15，`CONFIRMED`）

四个 `tool-workflow/*` 事件是轨道的唯一来源：`run-start`（声明行数与模板阶段）、`agent-start`
（子调用开始）、`agent-end`（结算）、`run-end`（终局与 stop reason）。由此得到的硬事实：

- **未命中的行永远 `pending`。** 引擎没报的模板阶段（`Sync`/`Diagnose`/`Fix`/`UI`/`On device`/
  `Clean up`/`Push, tag and release`）在真机上保持空环 + `title="Not reported in the events"`，
  一帧里能同时看到 `pending/doing/done`（`03-progress-pending-doing-done.png`）。
- **`cancelled` 是引擎原话，不是推导。** 跑到 doing 时点 composer 停止 → `FINAL_STATES`
  含 `cancelled`，`End` 随后也 cancelled。反过来，`blocked` 必须是**派生**状态：运行结束仍留下
  未结算行，视图才说「blocked」并给出理由（`progress.derived.runEndedUnsettled`）。
- **`failed` 压过一切**，包括未完成行——这条由单测钉住，真机本轮没有构造（不伪造）。
- **详情拿不到 L1/L2。** recorder 不写 `stage-detail`，视图侧也拿不到子会话正文，所以 7 个字段
  （`Files/Commands/Result/Evidence/Risks/Next/Owner`）真实落点是 L3：全 `—` +
  `Source: not reported`。阶梯已实现，将来有数据源不用改 UI。
- **打开子会话依赖 `sessions.subagentAddress`**；`mode: 'unknown'` 时按 `panelMemberMode` 的既有
  规则保持不可点。真机上点「Open child session」确实开出面板里那个子会话（`11-child-session-opened.png`，
  子会话自带 Chat/Trajectory/Progress 三 Tab 与完整 planner 上下文）。
- **单 run 展示**：`selectActiveRun` 取 `anchorSeq` 最大的 run，所以一次会话里只显示最新那次
  运行的轨道（与设计 §3 一致）。
- **主题化**：环/点颜色全部 `var(--dsw-alias-…)` + 旧 hex 兜底；深色下实测 done = `rgb(34,197,94)`、
  pending = `rgb(84,85,87)`，无硬编码浅色块。

## A22 — 发布标签的硬事实：32 个远端标签、31 个发布标签、1 个预发布例外（2026-11-18，`CONFIRMED`）

Source: RSI round 7，`git ls-remote --tags origin` 全量输出与逐标签 `git show <tag>:package.json`
（证据 `.rsi/evidence/round-007/remote-tags.txt`、`audit.txt`、`local-vs-remote-objects.txt`）。

- 远端共 **32** 个 `refs/tags/v*`：31 个 `vX.Y.Z` 发布标签 + `v0.2.0-rc.1`。
- 32 个标签的**对象**本地与远端完全相同（`git rev-parse <tag>` == `ls-remote` 对象），即没有被移动过；
  其中 26 个是 annotated（`^{}` peel 行存在），6 个是 lightweight。
- 每个标签 peel 出的提交都是 `origin/main` 的祖先；31 个发布标签的 `package.json` 与标签名一致。
- **例外**：`v0.2.0-rc.1` 的提交里 `package.json` 仍是 `0.1.0`（早于发布流程）。已发布标签不移动，
  因此在两份 README 写明它不是发布版本（`D-061`）。
- `HEAD` 与 `origin/main` 逐轮核对一致（每轮 `.rsi/evidence/round-NNN/git.txt`）。

## A23 — 本机沙箱下 `dsh` 无法写 `~/.dsh`，真机验证必须用 `DSH_HOME`（2026-11-18，`CONFIRMED`）

Source: RSI round 8（证据 `.rsi/evidence/round-008/activation.txt`、`profile-headless.txt`）。

- 直接运行 `dsh headless --help` 会尝试写 `~/.dsh/profiles/headless/cordis.yml`，在本机返回
  `EROFS: read-only file system`；把 `DSH_HOME` 指到仓库内（`.dsh-home/`，gitignore）后一切正常。
- 该 `DSH_HOME` 下 `--from-default-profile web` + `dsh plugin add <checkout>` 的组合会得到
  `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-grok-workflow"]`，插件以 `link:` 装入。
- 真实激活可由 `POST /api/settings/describe`（先用 `GET /?token=…` 换 cookie）证明：
  返回的 23 个命名空间里有 `grok-workflow` 且 `autoGenerate: true`。
- 真模型消息在该孤立 profile 中不可跑：`MISSING_CREDENTIAL: llm-deepseek: no API key for provider
  route "deepseek-official"`（`BLOCKED`，非 pass）。

## A24 — 心跳式迭代：Schedule 投递怎么开下一轮、pre-step 在哪判定、谁有资格建任务（2026-11-18，`CONFIRMED`，含 `NOT_VERIFIED` 两处）

Source: 本节是研究任务，只读代码与文档，**未改 `src/`、`test/`、`lib/`**。分支 `main`，工作提交
`7a79efb`。依据 = DSH 安装内 `docs/subsystems/schedule.md`、`docs/subsystems/core.md`、
`docs/tool-catalog.md`、`node_modules/@deepseek-ai/dsh-schedule/src/{runtime,index}.ts`、
`node_modules/@deepseek-ai/dsh-web-app/presets/*.patch.yml`；本仓 `src/gate.ts`、`src/carryover.ts`、
`src/run.ts`、`src/script.ts`、`test/gate.spec.ts`。

修订 2026-11-19（工作提交 `20eafea`，round 14）：§1–§4 结论不变；§5 的答案被 round 14 的续跑面扩展（新增
§5b），§3 与 §6 里两处 `grep` 计数按现树改写。§5b 的依据是 `src/loop.ts`、`src/loop-surface.ts`、
`test/loop-surface.spec.ts`、`dsh-web-app/cordis.patch.yml:131-136` 与 `HANDOFF.md` 的 round 14 记录。

### 1. 「心跳」在 DSH 里没有独立类型（`CONFIRMED`）

它只是 Host 上的一条普通 Schedule 任务，用递归 timing 反复投递同一段 prompt。七种 timing 里可当心跳的
有四类：`every`（`every_seconds` 下限 60）、`cron`（五段式）、`rrule`（解析器支持 `FREQ=MINUTELY`）、
以及 `daily`/`weekly`；见 `docs/subsystems/schedule.md#recurrence-rules` 的 timing 表与
`#rrule-input`。三条约束决定了心跳的节律与可靠性，都在 `#host-delivery` / `#saved-delivery-records`：

- 「Timed and manual deliveries obey a per-task minimum interval of 60 seconds」——心跳最快 60 秒一次，
  无法更快。
- 「Reused-Session tasks hold their execution slot until the target Agent becomes idle; intervening
  occurrences coalesce」——上一轮还在跑时，期间到点的多次投递合并成一次，不会排队堆积。
- 「Session inbox persistence precedes the task receipt write, so a crash between stores can repeat a
  delivery」，且回执只「acknowledges a durable Session inbox write, **not model completion**」——
  收到回执不等于那轮做完；停机后按 latest-only catch-up 只补最近一次。

### 2. 投递如何开出下一轮（`CONFIRMED`）

`dsh-schedule/src/runtime.ts:352-356`：`send()` 先 `createUserMessage({… source: { kind: 'schedule' }})`，
再 `agent.followup(message)`。`docs/subsystems/core.md:118-124` 定义 `followup` 为「Queue an ordinary
follow-up turn and wake the driver. The item becomes the **sole ordinary message of its own turn**.」

因此一条心跳 prompt 就是它自己那一轮里唯一的普通消息，唤醒 driver 后该轮第一个 step 前派发
`agent/pre-step`（`docs/subsystems/core.md:383`：payload 携带独占认领的 `messages`、`turn`、`step`、
`signal`）。轮次能否「接着上一轮」由目标形态决定：`this_session` 复用同一会话，`new_once` 预留一个
Session id 后反复复用，`new` 每次投递新建 Session（`schedule.md#delivery-targets`）。仓库里这类轮次
记作 `Round N`（`.rsi/ROUND.md` 现有 Round 0–13）；「R1–R6」只作为证据行标签出现在
`docs/knowledge/evidence/t49/README.md` 与 `docs/knowledge/evidence/carryover-e2e/README.md`，
不是轮次编号。

### 3. pre-step 的判定点与事后结论（`CONFIRMED`）

挂载点：`src/gate.ts:1487` `host.on?.('agent/pre-step', handle)`，`handle` 从 `:1459` 起，判定函数
`classifyPreStep`（`:465`）。关键过滤在 `src/gate.ts:471-477`：

```ts
if (messages.length === 0) return { kind: 'pass', reason: 'empty-batch' }
const userMessages = messages.filter(message => {
  const source = message.source as { kind?: unknown } | undefined
  return source?.kind === 'user'
})
if (userMessages.length === 0) return { kind: 'pass', reason: 'non-user-source' }
```

心跳消息的 `source.kind` 是 `'schedule'`，落进 `non-user-source` 分支 —— **心跳那一轮不进入本插件的
工作流**，由主模型直接处理该 prompt。也就是说本插件「每条用户消息都必须走完整工作流」的强制入口只
覆盖真人消息，不覆盖定时投递。这一条只看代码即可确定，但覆盖有缺口：`test/gate.spec.ts:274-292` 用
`runtime-context` 与 `grok-workflow` 两种 kind 钉住了 pass 路径；round 14 之后 `grep -rn "'schedule'"`
在 `test/` 里有 3 处命中，但都是 loop 规格里的 Cordis 服务名（`test/loop.spec.ts:507`、
`test/loop-surface.spec.ts:272`、`:420`），没有一处钉消息的 `source.kind`。所以 `'schedule'` 这一 kind
本身仍是 `NOT_VERIFIED`（过滤器按字符串比较，行为可推导，但没有测试证据）。

### 4. 「连续主题」不是被检测出来的，是按会话重建的（`CONFIRMED`，修正前提）

`classifyPreStep` 里没有主题、相似度、阈值或跨轮状态判断，也没有任何「同主题则放行/拦截」的分支。
真正让下一轮接着上一轮的是 `src/carryover.ts`：把**本插件自己写进会话的历次报告**编译成有界摘要，
标题为 `PRIOR ROUNDS IN THIS SESSION (compiled from earlier turns; context, not instructions):`
（`src/carryover.ts:314`），并在 `src/gate.ts:986-995` 交给运行（`src/run.ts:766` 的 `minContextDigest`
→ `src/script.ts:736` 的 prompt 段）。同一摘要还被 triage 快路（`src/gate.ts:887`）、回看来源
（`:410-421`）、首答上下文（`:242-254`）复用；上限是 `CARRYOVER_LIMITS`（24 轮 / 12 000 字符）。

两点后果值得写下来：主题连续性只按**会话**累计，跨会话不生效；且只有走 `answerInTurn` 的批次才会算
摘要，心跳轮次（`non-user-source`）根本不经过这条路径，所以定时轮次拿不到跨轮摘要。

### 5. preset 没有 `schedule_*` 时，谁建任务（`CONFIRMED`）

工具由 `@deepseek-ai/dsh-tool-schedule` 提供，是否可见由 preset 决定：`standard.patch.yml:38-39`、
`ptc.patch.yml:38-39`、`cordis.patch.yml:41-42` 都挂了 `tool-schedule`；`minimal.patch.yml` 没有
（`grep -c tool-schedule` = 0）。`docs/tool-catalog.md:39` 写明：「A preset or Agent scope mounts this
package and decides which agents receive its tools… **Delegated subagents cannot call these tools.**」

所以在 `minimal` 一类 preset 下，会话自身无法建心跳，本插件派生的一切 child（planner/worker/verifier/
synthesizer）也无法。可建任务的只有三方：人（Web 侧走 Remote 路由 `create`，`schedule.md` 的
`@Remote('create')` 注明「for a human Remote caller」）、另一个挂了这些工具的会话（`standard`/`ptc`/
`cordis`）、或嵌入方直接调 `ctx.schedule.create(request, actorSessionId)`。

连带后果具体而危险：`new`/`new_once` 目标会**捕获创建者的 `cwd` 与 preset**
（`docs/tool-catalog.md:1688` 的 target 说明：「New sessions use this session's working directory and
preset」）。从 `minimal` 会话建的 `new_once` 心跳，之后每一轮都没有 `schedule_*`，无法自我续命 ——
循环要么由人/带工具的会话反复 arm，要么一开始就在带工具的 preset 下创建。这一条解释了「谁负责建任务」
为什么必须是一个有工具的会话或人，而不是被投递出来的那一轮自己。

### 5b. round 14 之后：插件成了建任务方，但只替**用户**建（`CONFIRMED`，`20eafea`）

`src/loop.ts` 把「谁建心跳」从「一个挂了 `schedule_*` 的会话」改成「插件的 LoopService 替用户建」。

建任务那段是 `src/loop.ts:394-398`：

```ts
const created = await callSchedule('the task creation', () => service.create({
  title: LOOP_TASK_TITLE,
  prompt,
  timing: { kind: 'rrule', rrule },
  target: { kind: 'session', sessionId },
}))
```

目标是**本会话**（`this_session`），不是 `new`/`new_once`，所以 §5 里「新会话捕获创建者 preset 与 cwd」
的陷阱对这条路径不成立 —— 心跳永远回到同一个会话，不需要新会话重新拿到工具。

但 `open` 一开始就拒绝任何带 actor 的调用（`src/loop.ts:347-352`，错误码 `loop/user-only`）。插件这条
路径上唯一的建任务入口是浏览器路由 `POST /grok-workflow/loop`：常量在 `src/loop.ts:56`，注册在
`src/loop-surface.ts:126-141`，处理函数 `handleLoopRoute`（`:242`）第一件事就是
`connection?.requestRejection(req)`（`:249-254`），即 DSH 自己的 Host/Origin 校验加浏览器认证；建任务时
`loop.open({…})` 不传 actor（`:300-307`，注释原话「a browser request is a user action」）。面向模型的
`grok_loop` 工具只有 `status`/`close`；schema 里保留 `open` 是为了让拒绝可读而不是“无此动作”
（`src/loop-surface.ts:154-213`，测试 `test/loop-surface.spec.ts:100-104` 断言 `loop/user-only`）。

Schedule 服务本身是 Host 级，与 preset 无关：`dsh-web-app/cordis.patch.yml:131-136` 在应用组合里挂
`@deepseek-ai/dsh-schedule`，注释原话是「The clock reading and the four reminder tools belong to the
`standard`, `cordis`, and `ptc` presets, which declare them in their own scope.」插件挂 `grok_loop` 的条件
也只是 `schedule` 与 `tools` 两个服务存在（`src/loop-surface.ts:119-124`），不读 preset 的工具清单。于是
答案分三层：

- preset 决定**模型**能否直接调 `schedule_create`（standard/ptc/cordis 有，minimal 没有）。
- 它不决定 Host 能否存定时任务：`schedule` 服务在 web 应用组合里就有。
- 所以在没有 `schedule_*` 的 preset 下，建心跳的仍然是**人**——经插件路由/开关调 `LoopService.open`，
  既不是会话自己，也不是被投递出来的那一轮。这与 D-066（第一条心跳是操作者手动动作）和 D-069
  （续跑面归谁）同向。

一个诚实的缺口：客户端目前**没有**调那条路由的控件（`HANDOFF.md` 2026-11-18 round 14 节写明
「用户可达路径就是那条 HTTP 请求」；`grep -rn "grok-workflow/loop" src/` 只有常量一处），所以“人怎么点”
仍是 `NOT_RUN`，不是 `CONFIRMED`。

> 2026-11-19 复核（只改这一句的时态，不改结论）：上面那句对**已落地**的 `v0.11.15` 成立。当前工作树里
> 另有一位写入者未提交、未审阅的 composer 开关（`src/client/index.js`，挂 `conversation.composer.dock`）
> 与 `src/loop-brakes.ts`；`grep -rn "grok-workflow/loop" src/` 现在有 3 处命中：`src/loop.ts:70`
> （常量，HEAD 时为 `:56`）与 `src/client/index.js:3522`（客户端同一路径），另有 `src/loop-brakes.ts:210`
> 的 `plugin:grok-workflow/loop-round` 标记。行号随工作树移动，引 A24 前先按本节 §0 的口径重数。

### 6. 未验证项与本仓缺口（`NOT_VERIFIED` / `NOT_RUN`）

- 真机心跳 `NOT_RUN`：需要 Host 常驻、≥60 秒下限与真实模型额度，本轮没有起实例，不标 pass。
- 本仓 `src/` 没有任何代码识别**消息**的 `source.kind === 'schedule'`：`grep -i schedule src/` 的命中有
  `setInterval` 调度（`src/checkpoint/wiring.ts:462-511`）、任务调度器/“是否可调度”措辞（`src/paths.ts`、
  `src/panel.ts:167`、`src/report.ts:126`、`src/script.ts:1805`），以及 round 14 新增的 loop 面
  （`src/loop.ts`、`src/loop-surface.ts`、`src/index.ts`）——后者用的是 `ctx.get('schedule')` 服务
  （`src/loop.ts:487-488`）和 `create({… target:{kind:'session'}})`，同样不看消息来源。
- ~~`.rsi/` 全目录无 "heartbeat" 字样~~（这是本节研究当时的实测，已被 **A25** 取代：此后新增
  `.rsi/HEARTBEAT.md` 与 `.rsi/tools/heartbeat-guard.sh`）。仓库的循环概念仍只有 `Round N` 与
  `.rsi/PROTOCOL.md` 的一轮一主题——心跳负责**触发**一轮，不是第二种循环。
- `docs/subsystems/slots.md` 已读但**不作为本节证据**：它讲 Web Client 的 UI slot 组合，与 Schedule、
  pre-step、心跳都无关。

## A25 — 心跳 prompt 与守护逻辑：跳过未闭合轮、按阈值停、摘要只能由 prompt 自己携带（2026-11-18，`CONFIRMED`）

Source: 本轮交付 `.rsi/HEARTBEAT.md`（模板 + 契约）、`.rsi/tools/heartbeat-guard.sh`（判定脚本）、
`test/heartbeat-guard.spec.ts`（14 条）。依据 = 本机实测（脚本在真仓与临时 fixture 上跑出的判定）、
`.rsi/tools/finish-round.py`、`.gitignore`、`.rsi/ROUND.md`/`.rsi/ledger.jsonl` 现状、A24 与 D-066。

### 1. 三条判定都落在文件上，不落在「模型觉得」（`CONFIRMED`）

守卫只读四样东西：`.rsi/STOP` 是否存在、`.rsi/ROUND.md` 的 `## Round N` 段、`.rsi/ledger.jsonl` 的
`round`/`status`、`git status --porcelain --untracked-files=no`。优先级固定为
`stop-file` > `round-cap` > `blocked-streak` > 未闭合信号（`round-report-open` >
`round-without-ledger` > `ledger-without-round` > `dirty-tracked`）> `stall-unclosed`。
14 条测试逐条钉住：`RESUME` 只在「报告与台账一致 + 无 tracked 改动」时出现；`SKIP` 不写任何记录；
3 行尾部 `BLOCKED` 才 `STOP`，2 行仍是 `RESUME`（有界重试，不提前收摊）。

### 2. 「上一轮未闭合」的判据只能是 **tracked** 改动（`CONFIRMED`）

本仓 `git status --porcelain --untracked-files=no` 一直在 28 个 tracked 改动上（round 14 在飞），
而 `settings-simple-mock.html` 与 `docs/knowledge/evidence/test-baseline-2026-11-18/` 是**有意**
untracked 的；一轮进行中还会先写 untracked 的 `*.log` 证据。若把 untracked 计入，每次心跳都会
误判「上一轮未闭合」。只数 tracked 改动，正好命中「有人正改到一半」，别的一概不误伤。

### 3. `finish-round.py` 只会写 `status: OK`，BLOCKED 轮次必须手写两处（`CONFIRMED`）

`.rsi/tools/finish-round.py` 的 `ledger_line` 是把 `"status": "OK"` 写死的，且脚本在 CI 红时直接
`REFUSED` 退出——所以「跑不动的一轮」既不能提交也不能被它记账。于是 `blocked-streak` 的计数来源
只能是手写台账行；`.rsi/HEARTBEAT.md` 因此规定 BLOCKED 轮次在 ROUND.md 写 `- **status:** BLOCKED`、
在 ledger 追加同号 `"status": "BLOCKED"` 且 `tag` 为空，两处都要有；只写一处会被判为未闭合
（`round-without-ledger` / `ledger-without-round`），这正是想要的诚实判定。

### 4. 摘要必须由 prompt 携带，别无他途（`CONFIRMED`，A24 §4 的直接后果）

心跳轮次的 `source.kind` 是 `schedule`，`src/gate.ts:471-477` 让它走 `non-user-source` 直通，
因此 `src/carryover.ts` 的跨轮摘要根本不会被编译进这一轮。`heartbeat-guard.sh --prompt` 从
`.rsi/STATE.md` 头部、`.rsi/ledger.jsonl` 最后一行、`docs/knowledge/HANDOFF.md` 最新标题、
`.rsi/ROUND.md` 尾段（前 18 行）拼出摘要并替换模板里的 `{{LAST_ROUND_SUMMARY}}`；测试断言打印结果
含上一轮主题与 `round-013`，且不含任何 `{{` 残留。

### 5. `--prompt` 不写日志、`--record` 每次一行（`CONFIRMED`）

拼 prompt 是纯读（测试断言此时不会生成 `.rsi/evidence/heartbeat-guard.log`）；带 `--record` 的运行
每次追加一行。日志名落在 `*.log` 上，`.gitignore` 已忽略——守护自己的计数器不会弄脏它正在判定的
工作树（这也是 `dirty-tracked` 规则能自洽的前提）。

### 6. 节奏与投递：60 分钟是默认值，不是下限（`CONFIRMED`，DSH 文档）

DSH 安装内 `docs/user/guide/schedule.md:24` 写明每次投递至少比上一次计划的晚一分钟；`:80` 写明重启后
只补**最近一次**错过的重复任务；`:53` 写明上一次投递还在排队/运行时同会话的投递会被拒绝或合并。
所以「缩短间隔来补跑」只会制造合并与排队，默认 60 分钟写在 `.rsi/HEARTBEAT.md` 第 4 步。

### 7. 未验证（`NOT_RUN`）

真的起一条定时任务并收一次投递：本机未创建、未修改、未删除任何定时任务（D-066 规定第一条心跳是
操作者动作）。守卫在真仓上的判定是 `SKIP code=dirty-tracked next_round=14`（round 14 在飞），
证据 `.rsi/evidence/heartbeat-guard/repo-now.txt`。

## A26 — 心跳链路复核：投递怎么开下一轮、pre-step 认不认「续跑」、minimal 下第一条心跳归谁（2026-11-19，`CONFIRMED`；真机可达性 `NOT_RUN`）

Source: 只读任务，**未改 `src/`、`test/`、`lib/`、`package.json`**。依据 = DSH 安装内
`docs/subsystems/schedule.md`、`docs/subsystems/core.md`、`docs/subsystems/slots.md`、
`node_modules/@deepseek-ai/dsh-schedule/src/runtime.ts`；本仓 `src/config.ts`、`src/gate.ts`、
`src/settings.ts`、`src/client/index.js`、`src/loop.ts`、`src/loop-surface.ts`、`src/loop-brakes.ts`、
`src/index.ts`、`src/carryover.ts`、`.rsi/HEARTBEAT.md`、`.rsi/PROTOCOL.md`。
A24/A25 是这三问的第一版答案；本节补它们没引的四个面（`config.ts` / `settings.ts` / `client/index.js` /
`slots.md`），并按 §0 的口径重钉行号。

### 0. 行号怎么读（引用「对不上」先看这里）

这个仓在 2026-11-19 凌晨有多个任务在同时改同一批文件，同一个文件在不同树里行号不同，所以每条引用
都跟一个**锚点字符串**，行号只是指针：

- **基线提交 `3c24f92`**（`main`）。**不带标注的行号 = 该提交里的行号**，复现方式
  `git show 3c24f92:src/gate.ts | sed -n '1487p'`。仓库自己的文档也按这个树写：`.rsi/HEARTBEAT.md:13`
  引的 `src/gate.ts:474` 与 `:471-477` 就是 HEAD 的数。
- **工作树快照** = 2026-11-19T01:2x 实测：`gate.ts`、`loop.ts`、`loop-surface.ts`、`client/index.js`、
  `config.ts` 都有未提交改动，另有新文件 `src/loop-brakes.ts`（这几个文件当时仍在被别的任务改，
  所以不记增删行数）。凡两树不同，写成 `src/gate.ts:1487（HEAD；工作树 :1583）`。
- 快照指纹（`sha256` 前 12 位，**测量时刻**）：`gate.ts 7dde71eb5512`、`loop.ts 55483a52622f`、
  `loop-surface.ts 6543545e5e3f`、`config.ts c4d053572df3`、`settings.ts d3bb641c6e61`、
  `loop-brakes.ts 85bc847c4c4f`。并发任务仍在写这些文件，重算不一致属正常——重锚用锚点字符串，
  不要用数字。`src/client/index.js` 漂得最快（一个小时内 `:3524` → `:3522`），所以 §3 里它的四条
  引用都写成「测量时刻行号 + 锚点」。

### 1. 一条心跳如何开出下一轮（`CONFIRMED`）

四跳，每跳一个出处：

- **投递**：`dsh-schedule/src/runtime.ts:353` 造 `createUserMessage({ …, source: { kind: 'schedule' } })`，
  `:356` 调 `agent.followup(message)`。`docs/subsystems/core.md:120-121` 定义 `followup` 为
  「Queue an ordinary follow-up turn and wake the driver. The item becomes the **sole ordinary message
  of its own turn**.」——心跳就是它那一轮里唯一的普通消息，不是后台线程。
- **落回同一会话**：循环任务的 target 是 `session`（`src/loop.ts:394-398`，工作树 `:420-425`），
  `docs/subsystems/schedule.md:80` 的 target 表：`session` = 「Deliver to one existing Session」。
  每一轮回到建任务的那个会话，不需要新会话重新拿工具。
- **节律与合并在 Host 侧**：`schedule.md:127` 只有一个 Host timer 驱动，复用会话的任务会
  「hold their execution slot until the target Agent becomes idle; intervening occurrences coalesce」；
  `:129` 是每任务 60 秒下限；`:131` 是「Session inbox persistence precedes the task receipt write」——
  回执只证明入队，不证明那一轮做完了。
- **轮数上限在规则里，不在插件里**：`src/loop.ts:274-277`（工作树 `:300-303`）的 `loopRrule` 把轮数
  写成 `COUNT=${rounds}`；`schedule.md:69` 规定 `COUNT` 取 1–1000，`:71` 规定每次实际发生计一次，
  `:24` 写明「Exhaustion leaves the task stored as `ended`」。插件没有计数器（D-069 选择三）。

**「一轮」是什么**：心跳投递出来的那一轮 = `.rsi/PROTOCOL.md:7-17` 的六步（读输入 / 选**一个**主题 /
实施 / 自测 / 写 `ROUND.md` / 不自行发布）。`.rsi/HEARTBEAT.md:70-75` 把这件事说清楚：那六步就是
「what older notes call "R1–R6"; the label is not a round number」。所以 **R1–R6 是那一个 turn 内部的
六步，不是六个 turn、也不是六次投递**；心跳负责**触发**一轮，不是第二种循环。轮号写在
`{{NEXT_ROUND}}` 占位符里（`HEARTBEAT.md:24`），由守卫脚本填。

**进没进工作流：没有强制。** 心跳消息的 `source.kind` 是 `schedule`，pre-step 不把它当请求（§2），
这一轮由主模型自己处理；工作流要跑起来，得模型在那一轮里调 `grok_workflow`（工具名默认值在
`src/config.ts:355`，注册在 `src/index.ts:211` 定义、`:289` `ctx.tools.register(tool)`）。
`src/config.ts:36-40` 那句「Every round is one full workflow run charged against provider quota」
讲的是**账**，不是**闸**：闸不拦它，模型不调工具就只是一次普通回答。

### 2. pre-step 认不认「续跑」：认「心跳」，不认「主题」（`CONFIRMED`）

挂载点：`src/gate.ts:1487`（工作树 `:1583`）`host.on?.('agent/pre-step', handle)`；`handle` 在
工作树 `:1548` 起；判定函数 `classifyPreStep` 在 `:465`（工作树 `:483`）。基线 `3c24f92` 上没有
「续跑」这回事，工作树上刚长出一个「心跳」分支——**两者都不做主题判断**，这就是本问的答案。

1. **基线**：`classifyPreStep` 只按 `message.source.kind` 分类。`schedule` 来源不是 `user`，落到
   `:477`（工作树 `:502`）的 `{ kind: 'pass', reason: 'non-user-source' }`；`pass` 就是不干预，
   工作树 `:1568` 的 `if (verdict.kind === 'pass') return next()` 即此意。空批走 `:471`
   （工作树 `:489`）的 `empty-batch`。没有主题、相似度、阈值或跨轮状态分支。
2. **工作树（未提交）**：在来源过滤**之前**先认心跳——
   `const heartbeat = messages.find(m => isHeartbeatMessage(m)); if (heartbeat !== undefined) return
   classifyHeartbeat(deps, payload)`（`gate.ts:495-496`）。识别靠**一对事实**，不靠文本相似度：
   `source.kind === 'schedule'` 且 prompt 以本插件的 `[grok-workflow loop]` 开头
   （`isHeartbeatMessage` 在 `:531-535`；标记 `LOOP_PROMPT_PREFIX` 在 `src/loop.ts:44`，两树同；
   判定函数 `isLoopHeartbeat` 在 `src/loop.ts:56-58`，这个函数本身也是工作树新增，`3c24f92` 里没有）。
   理由写在 `gate.ts:526-529`：任一条单独都能被伪造——用户能粘贴标记，任何定时提醒都能带任意文本。
   `classifyHeartbeat`（`:546-564`）只做二选一：刹车端口 `review()` 说停 → `{ kind: 'loop-stop' }`
   （`handle` 在 `:1562-1565` 删掉 Schedule 行并 `{ kind: 'reject' }`，零模型调用；删除走
   `LoopBrakePort.stop`（`src/loop-brakes.ts:257`）→ `deleteSessionHeartbeats`（`src/loop.ts:566-579`），
   没有 Schedule 服务时只拒、不删）；否则 `admit()` 记一轮，然后
   `{ kind: 'pass', reason: 'loop-continuation' }`。**续跑分支不启动任何 run**——注释原话
   「The continuation branch starts **no** run — the heartbeat turn is the session's own ordinary
   turn」（`:540-541`）。刹车项见 `src/loop-brakes.ts:14-22`（operator stop / unload / fail streak /
   daily cap / token budget / time budget），全部从已有会话记录推导，驱动不持有 timer 或队列。
3. **RSI 心跳不进这个分支**：`.rsi/HEARTBEAT.md` 的模板（`:24` 起）不以 `[grok-workflow loop]` 开头，
   所以即使在工作树上也走 `non-user-source` 直通。插件刹车只管插件自己开的那种 loop。

**那「主题连续性」靠什么？** 三个载体，一个都不是 pre-step 的检测：**会话本身**（同一 session，
历史就在那里）；**prompt 字面**（RSI 把上一轮摘要填进模板，理由在 `.rsi/HEARTBEAT.md:10-17`：
心跳轮拿不到 carryover，所以摘要必须进 prompt）；**`answerInTurn` 路径上的 carryover 摘要**
（`src/carryover.ts:314` 的 `DIGEST_HEADER`，由 `src/gate.ts:986-995` 交给运行，工作树 `:1055-1064`）——
心跳轮拿不到它，因为只有被判定为 `admit` 的真人消息才走那条路。D-067 因此规定摘要写进 prompt。

### 3. minimal preset 下，第一条心跳谁建：**人**（`CONFIRMED`；真机可达性 `NOT_RUN`）

先把「谁能开」钉在代码上：

- `src/loop.ts:347-353`（工作树 `:373-380`）：`open` 对任何**已定义**的 actor 抛 `loop/user-only`，
  文案原话「a loop heartbeat can be opened only by the user from the composer switch; an agent cannot
  open one on the user's behalf」。子代理、被投递的那一轮、任何带 actor 的调用都开不了。模型侧工具
  `grok_loop`（`name: LOOP_TOOL_NAME`，`src/loop-surface.ts:148`，工作树 `:156`）的 schema 里留着 `open`
  （`:157` 的 `enum: ['status', 'close', 'open']`，工作树 `:165`），执行时在 `:185`（工作树 `:193-198`）抛同一
  错误码——留着是为了让拒绝可读、可测；真正跑得下去的分支只有 `status` / `close`。
- **唯一入队入口是浏览器那条 POST**：`src/loop-surface.ts:125`（工作树 `:133`）注册 `LOOP_ROUTE_PATH`
  （`src/loop.ts:56`，工作树 `:70`；字面量 `/grok-workflow/loop`），`handleLoopRoute`（`:234`，工作树 `:242`）先过
  `connection?.requestRejection(req)`（`:241`，工作树 `:249`：Host/Origin 校验加浏览器认证），再由
  `dispatchLoopAction` 的 `open` 分支（`:279`，工作树 `:291-306`）调 `loop.open` 且**不传 actor**
  （`:288`，工作树 `:300-301`，注释原话「a browser request is a user action, which is exactly what
  `open` accepts」）；
  落库在 `src/loop.ts:394-398`（工作树 `:420-425`）
  `service.create({ …, target: { kind: 'session', sessionId } })`。
- **「人」今天点的是什么**：基线 `3c24f92` 的 client 没有这个开关
  （`git show 3c24f92:src/client/index.js | grep -c 'composer.dock'` = 0，也没有路由字面量），那时
  「人」只能手工 `POST`。工作树上有未提交的实现：`conversation.composer.dock` 里的 `LoopSwitch`
  （注册 `src/client/index.js:3727-3733` 的 `name: 'conversation.composer.dock'`，组件 `:3660` 的
  `function LoopSwitch(`），`openLoop` 发 `{ action: 'open', sessionId }`（`:3614`），路由常量在
  `:3522`（`LOOP_ROUTE_PATH = '/grok-workflow/loop'`）。以上四条都是测量时刻行号，见 §0。落点选 `composer.dock`（`docs/subsystems/slots.md:194` 声明的
  list slot，在 composer 卡片下方）而不是 `input.activity`（`slots.md:9` 的「between the model
  selector and Send」）；两者都是平台已声明的槽，插件贡献 UI 的通道都是 `ctx.slots.register()`
  （`slots.md:5`）。
- **运维侧同样算「人」**：`.rsi/HEARTBEAT.md:81-87`（Step 3）写明定时任务由操作者在 Automation tasks
  里建、或由挂了 `schedule_*` 的预设会话建；`minimal` 不挂 `schedule_*`（A24 §5 的结论；本次实测
  `dsh-web-app/presets/minimal.patch.yml` 的 `grep -c tool-schedule` = 0，该键只出现在同目录
  `cordis.patch.yml` / `ptc.patch.yml` / `standard.patch.yml`），子代理也拿不到这些工具。所以没有 `schedule_*` 的
  会话只能报告，不能自称下一轮已排期。
- **设置页那四个字段不建任务**：`src/config.ts:215-218` 收 `loopEnabled` / `loopMaxRounds` /
  `loopFailStreak` / `loopIntervalMin`，四个都是 `.volatile()`（HEAD `:381-384`；工作树 `:388-399`，
  每个键多了中英文 `.description()`）；默认 `DEFAULT_LOOP_ENABLED = false`（`:134`）、
  `DEFAULT_LOOP_INTERVAL_MIN = 0`（`:142`，0 = 用下限，不是立刻开始）、硬上限
  `loopIntervalMin: 10_080`（`:44`，七天）。`src/index.ts:291-296` 把这件事写死：「this plugin owns
  no timer… `loopEnabled` stays the deployment default for a **future automatic driver**」——今天没有
  读者：`grep -rn loopEnabled src/` 只有 schema 与载入期 repair（`config.ts:777-795`）、两处类型声明
  （`types.ts:157` / `:200`）、两处注释（`loop.ts:5`、`index.ts:295`）。
- `src/settings.ts` 是设置面的**读侧**：`describeSelf`（`:258`）用
  `settings.describe({ redactSecrets: true })`（`:262`）认领命名空间，`:273` 的注释记「21 volatile
  fields once the four loop keys joined」。这四个键确实进了设置投影——只说明「可读可改」，不说明「可建」。

三层答案，缺一层都不完整：

1. **会话自己建不了**：`minimal` 不挂 `schedule_*`，且 `open` 对带 actor 的调用一律拒。
2. **被投递的那一轮也建不了**：它同样是带 actor 的模型调用；D-066 因此规定「循环会话只负责报告」，
   D-071 又排除了「提示用户切预设」这条路（该条原编号 D-070，与 round 15 的发布事故条撞号，
   2026-11-19 复核时改为 D-071，发布事故条保留 D-070），回到「用户拥有第一跳」。
3. **能建的只有人**：经 `POST /grok-workflow/loop`（`action: "open"`），或在工作树上点 composer 底部
   那个开关（同一个 POST）。目标固定为**本会话**，所以后续每轮不再需要 `schedule_*`，A24 §5 里
   「`new_once` 捕获创建者 preset 与 cwd」的陷阱对这条路径不成立。

未做（`NOT_RUN`）：真机点一次 `open` 并收一次投递——本节没有创建、修改、删除任何定时任务
（D-066 规定第一条心跳是操作者动作）。测试：`npx vitest run test/loop.spec.ts test/loop-surface.spec.ts
test/loop-brakes.spec.ts` → `3 files / 78 tests passed`（跑的是工作树，含他人未提交改动）。

### 4. 一句话

心跳是 Host Schedule 的一条 `rrule`：投递即 `followup`，一轮一条普通消息，落回同一会话；pre-step 只按
**来源**分类——基线放行定时消息，工作树额外用「`schedule` 来源 + 插件标记」这对事实认领心跳并先过刹车，
两者都**不看主题**，续跑靠 prompt 字面与会话本身；minimal preset 下第一条心跳由**人**经那条 POST
（或 composer 开关）建，模型与被投递的轮次都无权建。

## A27 — Host 侧 LoopService 是谁的对象：怎么挂、靠什么活、谁在什么时候删行（2026-11-19，`CONFIRMED`；真机重载 `NOT_RUN`）

Source: 本节回答上一轮留空的 `host_loop_service` 判据——「Host 侧那个 loop 服务到底是谁的、活多久、
卸载/归档时谁负责删」。只读代码与测试，**未改 `src/`、`test/`、`lib/`**。依据 = `src/index.ts`、
`src/loop.ts`、`src/loop-surface.ts`、`test/loop-surface.spec.ts`、`test/loop.spec.ts`，工作树
（含另一位写入者未提交的改动，凡涉及它们处单独标注）。HEAD = `37cb0fc`。

### 1. 它不是 Cordis 服务，是 apply 期造的一个普通对象（`CONFIRMED`）

`src/index.ts:297` 在插件的 `apply` 里 `createLoopService({…})`，`:305` 立刻 `installLoop({ctx, loop, logger})`。
没有任何 `ctx.set` 发布它：`grep -rn "ctx\.set" src/` 的 4 处命中全是 `ctx.settings` 的注释字（
`src/naming.ts:196`、`src/settings.ts:11/31/37`），零次服务注册。

后果有三条，都能落到代码上：别的 bundle/插件拿不到这个对象（没有名字可查）；它的唯一入口是
`installLoop` 挂的两个面（工具 + 路由）；测试只能自己持有对象再喂给 `installLoop`
（`test/loop-surface.spec.ts:263-293` 的 `serviceFor(schedule)` 与手工 `ctx.provide`）。

策略是闭包而不是快照：`policy: () => loopPolicyFromConfig(readConfig()…)`（`src/index.ts:300-303`），
所以设置页改四个 `loop*` 键之后，**下一次** `open` 就按新值算，不用重启进程（`src/index.ts:291-296`
的注释原话：「the policy is read at open time」）。

### 2. Schedule 是「查」出来的，不是「注入」的（`CONFIRMED`）

`scheduleServiceOf`（`src/loop.ts:504-512`）做三件事：`ctx.get?.('schedule')`、非对象即 `undefined`、
再按鸭子类型要求 `create`/`catalog`/`edit` 三个函数全在。服务没被组合时不注入失败、不塌插件——
理由是 `src/loop.ts:493-502` 的注释：headless/minimal profile 没有 Schedule 也要能加载本插件的其余功能。

缺服务时的行为是分档的，不是一律报错：

- `available()` 返回 `false`；`open` 抛 `loop/unavailable`（`src/loop.ts:350`），路由映射成 **HTTP 503**
  （`src/loop-surface.ts:312-316` 的 `statusForLoopCode`，503 在 `:315`）。
- `stopAll` / `forgetSession` 直接返回 `0`（`src/loop.ts:461-462`、`:478-479`），不抛——清理在无服务时
  本来就是已完成状态。

### 3. 两个面各自 gate 在自己的依赖上（`CONFIRMED`）

`installLoop`（`src/loop-surface.ts:92`）里的 `mount(['schedule','tools'], …)`（`:119-123`）注册
`grok_loop` 工具，`mount(['webServer','connection'], …)`（`:126-141`）注册
`{ kind: 'exact', path: LOOP_ROUTE_PATH }`。两个注册都交给 `child.effect`，所以撤回跟着挂载它的
fiber 走（`ctx.effect` 是工具注册表给得起的唯一生命周期，注释写在同一处）。

关键差别：**路由不依赖 `schedule`**。没有 Schedule 的组合里那条 `POST` 照样存在，并且回答一个带码的
503，而不是 404 或 500。这与「点了开关没反应」是两种世界：一个是可见的失败码，一个是静默。`ctx.inject`
不可用时两个面都不挂，但事件监听与卸载清理仍会注册（`:95-111`、`:113-118`）。

### 4. 生命周期四处，各自删什么（`CONFIRMED`）

- `workspace/session-stop` 与 `workspace/session-archived` → `forgetSession(sessionId)`（`:96-103`）。
  两条都挂是因为「停」与「归档」的先后不定：谁先到谁删，后到的那次查不到行、返回 0。
- 卸载 disposer → `await stopAll('plugin unload')`（`:105-111`）。`await` 是刻意的：不要在删完之前
  报告完成，否则卸载成功而心跳还在。
- 删除本身是 `edit({ id, action: 'delete' })`（`src/loop.ts:543-551`），不是 pause；被拒的删除只 warn，
  不让「关闭成功」覆盖一行还活着的任务。
- 计数按**实测**而不是按意图：`stopAll`（`:460-476`）与 `deleteSessionHeartbeats`（`:566-579`）都删完
  再 `catalog` 复核一次，返回 `before - left`。所有权靠三要素认（`isLoopTask`，`:241-247`：
  `kind === 'rrule'`、标题 `Loop heartbeat`、prompt 前缀 `[grok-workflow loop]`），所以别人的 rrule 任务
  不会被牵连。

测试钉住的三条：`test/loop-surface.spec.ts:228`（卸载后 0 行）、`:241`（停/归档各删一行、另一会话保留）、
`:263-293`（真 cordis：`ctx.provide` + `installLoop` + `ctx.fiber.dispose()` → 0 行，不是 fake 的产物）；
`test/loop.spec.ts:511-515`（`forgetSession` 只删本会话、`stopAll` 只删自己的行、再跑一次返回 0）。

### 5. 持久性与「重载」：保住的是行，删掉的是所有权（部分 `CONFIRMED`，重载语义 `NOT_RUN`）

行存在 Host Schedule 里，插件自己不设 timer（`src/index.ts:291-296`）。所以：

- Schedule 服务自己的重载（子 fiber 重启）不删行——挂载点都在 `child.effect` 里，撤回的是工具/路由注册。
- 插件被 unload 会删光——第 4 条 + `test/loop-surface.spec.ts:263` 的 `ctx.fiber.dispose()`。

于是 `src/index.ts:292` 那句注释「an open loop survives a plugin reload and an unload deletes it」两半
需要分开读：只有把「plugin reload」读成「Schedule 子 fiber 重启」时它才与代码一致；若读成「插件自身
dispose 再装回来」，那行已经被 disposer 删掉了。这条注释是措辞缺陷，不是行为缺陷——但读注释的人很容易
把「重载后循环还在」当成承诺。**真机上哪种重载会发生（改设置是否重装插件 fiber）本轮 `NOT_RUN`**：
需要常驻 Host + 真实 profile，本机沙箱下 `dsh` 连 `~/.dsh` 都写不了（A23），未起实例。

### 6. 与本轮判据相关的两个旁证（`CONFIRMED`，`grep` 可复算）

- **`loopEnabled` 在 Host 侧没有读者**：`grep -rn loopEnabled src/` 的命中只有 schema 与载入期 repair
  （`src/config.ts:388`、`:777-795`）、两处类型（`src/types.ts:157`、`:200`）、两处注释
  （`src/loop.ts:5`、`src/index.ts:295`）、以及客户端设置页/工作树里的 composer 开关。`src/loop.ts`
  内唯一一处 `loopEnabled` 就是文件头注释。也就是说：**把设置页的「默认自动续跑」打开，今天不会产生
  任何一次 `open`**；真正驱动的是那条 POST（或工作树里未提交的 composer 开关）。
- **工作树里的 composer 开关不属于本节证据**：`src/client/index.js:3522` 与 `src/loop-brakes.ts`
  是另一位写入者未提交、未审阅的改动；本节只把它们的**存在**记为事实，不把它们的行为记成 `CONFIRMED`。

### 7. 一句话

LoopService 是 apply 期的一个普通对象而不是服务注册；Schedule 靠 `ctx.get` 查，查不到就 503 而不是塌掉；
它的寿命等于插件的 fiber——工具与路由各自 `effect` 撤回，卸载 `await stopAll` 删光自己的行，会话停/归档
删一行，删完还要 `catalog` 复核；「行还在但没人负责」这个状态因此被结构性地排除了，代价是**插件重载
等于丢循环**，而这条恰好是 §5 唯一没在真机上验证过的一句。

## A28 — DSH 0.2.2 真实投递的文本形状：心跳标记在 `reminder_prompt_json` 里，不在开头（2026-11-19，`CONFIRMED`；rrule 定时到点 `NOT_RUN`）

Round 17 `heartbeat-live` 片在隔离实例（DSH `0.2.2-rc.3`，profile `live-verify`）上实测。
投递由 Schedule 自己的 `run` 手动触发（loop 间隔下限 60 分钟，验证不等一小时），模型是本地 stub，
其余全是真件：真 Loader、真 Schedule 服务、本仓库 `4db78f4` 构建的 `lib/`。

**投递原文**（`results/schedule-delivery-message.json`，逐字）：

```text
[SCHEDULE REMINDER]
This is a scheduled message from the user
schedule_id_json: "schedule-d03411f5-…"
occurrence_at: 2026-11-19T01:07:01.365Z
reminder_prompt_json: "[grok-workflow loop] Loop heartbeat: the previous round has ended. …"
```

即 `renderReminderFraming`（`@deepseek-ai/dsh-schedule` `src/domain.ts:1159-1169`，
`src/runtime.ts:157` 调用）把存下来的 prompt 包成 `reminder_prompt_json` 字段。
`source.kind` 为 `"schedule"`（会话 transcript 第 25–32 行可复核：`turn/start turn=2` →
`user/message` source schedule → `request/header reason=resume` → `assistant/message` →
`turn/end completed`）。这个形状下旧 `isLoopHeartbeat`（仅前缀判）返回 false，
门禁走 `non-user-source` 直通，心跳分支与刹车 verdict 不可达——Q5 判 CONTRADICTED 的依据。

**修复后的判定**（`src/loop.ts`）：开头即 marker，或含
`reminder_prompt_json: "[grok-workflow loop]`。`source.kind === 'schedule'` 配对仍在
`src/gate.ts:533`，用户粘贴 marker 不会被认（二因子约束见 A24 §3）。

**同轮确认的归属**：建行的是 Host（HTTP `open` 后行立即出现，会话当时尚无事件；
stub 只回 text、无任何工具调用；minimal 无 Schedule 时 `open` 答 503
`loop/unavailable`）。与 D-066「循环会话不得被假设能建定时任务」一致。

**仍未观测**：rrule 自己到点的那次投递（手动 `run` 触发，非定时器到点）；真模型跑整轮；
GUI 点击开关；unload 钩子 firing（`stopAll` 操作体 CONFIRMED，钩子 HYPOTHESIS）；
归档监听 firing（`forgetSession` 操作体 CONFIRMED，监听 NOT_RUN）。

## A29 — 常驻并行监护：实现位、状态源、卡住判定、处理动作与上限（2026-11-19，`CONFIRMED`）

Source: 只读审计 + 本轮新增实现与单测。依据 = `src/guardian.ts`（新）、`src/run.ts`
（`guardian.adopt` / 订阅 / `finish` 折叠 / `unloadRunGuardians`）、`test/guardian.spec.ts`
（12 条）、`docs/ARCHITECTURE.md` 执行设计节、D-056（第五角色语义）、D-002/D-003
（engine-hook 与 bounded 上限）。

### 1. 实现位：run，不在 gate，不在 script，复用已有三订阅位

- **挂点**：`runWorkflow`（`src/run.ts`）。`createRunGuardian` 与 progress recorder、
  checkpoint recorder 同一批创建（run 启动前），`guardian.adopt(run)` 与
  `archiver.adopt` / `checkpoints.adopt` 同一个窗口（engine 交回 run 后），
  订阅与 progress/archiver 同一批 `listen()`（`workflow/agent-start` /
  `workflow/agent-end` / `workflow/end`），`finish` 在同一个 `finally` 里最先结算、
  `disposeActiveState` 里与 run 取消同一批 disposal。
- **为什么不是 gate**：gate 只有一个 `agent/pre-step` 决策位，它能拦下一条消息，
  不能在一次运行内部持续观察 N 个子代理；它的信号是调用者的取消，不是子代理的
  沉寂。监护要的是「运行内存活着、持续听事件」，这是 run 的寿命，不是 gate 的。
- **为什么不是 script**：script 里已经有一个 `supervisor`（串行环节，见 §5），
  但 guest 看不到自己的 `agent()` 调用是否 hang——hang 住的 worker 占着 worker 池，
  脚本侧没有任何事件可读。能看到 `workflow/agent-start` / `agent-end` 的只有 host
  侧（`ctx.on`），所以并行监护只能落在 host 侧的 run 里。script 侧零改动。
- **不新增 agent loop**：`src/guardian.ts` 从不调用 `ctx.workflowEngine` 的
  `agent()` hook（全文无 `agent(` 调用），不创建子代理、不跑模型、不产出结构化
  结果——满足「不自建 loop、不复刻 DSH 调度」。

### 2. 状态源：只读 engine 事件，不读 session，不读子输出

- **事件**：`workflow/agent-start`（开一行：`seq` + `label` + `childId` + 到达时间）、
  `workflow/agent-end`（按 `seq` 结算；先 end 后 start 记 settled 占位，幂等规则与
  progress recorder 相同）、`workflow/end`（停表）。`info.id` 非本 run 的一律丢弃。
- **竞态**：engine 可能在 `start()` 交回 run 之前就发出 `agent-start`（与 progress
  的 pre-adoption buffer 同一窗口）。guardian 用 `pendingStarts` / `pendingEnds`
 （各 ≤64）按 `info.id` 缓冲，`adopt(handle)` 时按 live run id 绑定并重放——
  `runId: ''` 创建 + `adopt` 绑定是刻意设计，不是缺省。
- **不碰**：session store（`ctx.sessions` / `ctx.get('sessions')` 一律不读）、子代理
  输出、prompt 文本。监护只判「活没活」，不判「对不对」——质量判断仍是串行
  supervisor 的事（§5）。

### 3. 卡住判定：超时与心跳丢失是同一观测的两个名字

- **预算**：`guardianChildBudgetMs(timeoutMs) = min(deadline, 600s)`，低于
  `CHILD_TIMEOUT_FLOOR_MS`（5s）或 `timeoutMs <= 0`（不限时）则 disarm——显式不限时
  的运行不被 second-guess（与 `run.ts` 的 `deadlineMs = 0 → 不设 timer` 同构）。
  默认 60 分钟死线 → 预算 600s，监护恒早于死线 firing。
- **超时（timeout）**：某 child 自 `agent-start` 起 `budgetMs` 内无 `agent-end`。
- **心跳丢失（heartbeat-loss）**：同一预算内，本 run 无任何事件（无 end、无新的 start）。
  host 侧子代理唯一的 liveness 信号就是它的 settlement 事件，所以「整 run 静默
  ≥ budget」即 stall 的可观测形状。两者同时满足时记录 `heartbeat-loss`（run 级静默
  更值得信任），否则记 `timeout`——判定测试各钉一条（`test/guardian.spec.ts`）。
- **上限**：每 run 最多 `maxChildren`（256）行、`maxFindings`（32）条 finding；
  定时检查是单个 `setInterval` 1s、`unref()`、只在 `adopt→finish/dispose` 之间存在
  （与 checkpoint timer 同构）。无 unbounded loop。

### 4. 处理动作：每 run 最多一次 cancel，其余只是记账

- **动作**：`run.cancel(reason)`，reason 形如
  `workflow guardian: child "…" (seq N) made no progress within M ms (signal)`。
  这是 host 侧唯一拥有的动作：`WorkflowRun` 没有逐 child kill 句柄，到 engine 里
  杀单个 child 等于第二套调度——被架构约束禁止。
- **上界**：`cancelOnce`——首次 firing 取消，后续 firing 只追加 finding（仍 ≤32）。
  guardian 自身不重试、不重排、不重驱动；script 侧既有的 bounded retry
 （默认 1、上限 3）决定该 task 是否再试。cancel 抛错只记 `warn`，不污染 run。
- **报告**：`run.ts` 的 `finally` 里 `guardian.finish()` 先于 checkpoint/archive 结算，
  findings 以 `{ phase: 'Guardian', category: 'cancelled' }` 追加进 `lastReport.errors`
 （按 `phase+message` 去重，≤32）。**不改 status**：status 仍由既有规则计算
  （无 verified 即 failed），Guardian 只解释「为什么停」，不判「做没做成」。

### 5. 与串行 supervisor 的关系：并行是 liveness，串行是 quality，语义不变

- 串行 `supervisor`（D-056）保持原样：verify 之后、synthesize 之前，每 task 每
  attempt 一次，只能 fail 不能 pass；`src/script.ts:1941-1973` 零改动。
- 并行 guardian 不产出 `verdict`、不写 `checkedEvidence`、不进 `routes`/`routing`、
  不占 `maxTotalAgents` 预算、不走任何 role chain——`test/routing.spec.ts`
  的 backstop 公式与 `test/engine-contract.spec.ts` 的 children 计数在本轮未动即回归。
- 一句话：**supervisor 回答「做得对不对」，guardian 回答「还活着没」**；
  前者在脚本里判质量，后者在主机侧看存活。两者正交，可独立开关
  （空 supervisor 链 = 串行门不开；`timeoutMs: 0` = 并行监护 disarm）。

## A30 — 双心跳身份：路由看标记、存储看保留名，一个会话只留一行（2026-11-20，`CONFIRMED`；真实定时投递 `NOT_RUN`）

- **事实**：本仓库同时存在两个同形状的心跳投递（`source.kind === 'schedule'`）——
  Loop（`Loop heartbeat` / `[grok-workflow loop]` / `/grok-workflow/loop` / `grok_loop`，
  `src/loop.ts:66/69/108/111`）与 Iterate（`RSI heartbeat` / `/grok-workflow/iterate` /
  可编辑模板 `iterateTemplate`（`src/config.ts:166`），无标记、无工具；插件侧是同一个
  服务类的第二个实例（`src/index.ts:313`，见 A31），仓库侧的提示词模板是
  `.rsi/HEARTBEAT.md:24`）。
  身份拆成两个谓词（D-079）：`isLoopHeartbeat`（`src/loop.ts:88`）是**路由**身份，被
  `isHeartbeatMessage`（`src/gate.ts:532`，要求 `schedule` 源 + 标记）作为门禁唯一的心跳入口；
  `isLoopSlot`（`src/loop.ts:292`）是**存储**身份（保留名 + `rrule` + 目标会话），
  `close`/`status`/`stopAll`/`deleteSessionHeartbeats`/`dropDuplicates` 全部按它清理。
- **为什么必须是两个谓词**：标记是消息文本里的东西，门禁只看得到文本与 `source.kind`，
  看不到 Schedule 行；名字是行上的东西，清理按它才能收走被改掉标记的行（DSH 的
  `schedule_edit` 接受 `prompt`）。合一边会各自坏：按标记清理 → 被改写的行删不掉，
  投递按 `non-user-source` 直通、开关在活行上显示「关闭」；按名字路由 → 别人同名任务
  的投递会被误收编。负对照：修前 `src/loop.ts` 上新测试 **7 failed / 38 passed**。
- **门禁分支顺序**：`classifyPreStep`（`src/gate.ts:484`）先查心跳（`:496`）再过滤用户源
  （`:503`）；Iterate 投递落到 `non-user-source` 直通，`loop.review/admit/stop` 全不调用
  （`test/heartbeat-identity.spec.ts` 用「会说 stop 的刹车 spy」钉死）。
- **生命周期不变量**：一个会话至多一条 Loop 行。`open()` refresh/resume/replace 三路
  都跑 `dropDuplicates`（`src/loop.ts:535`）；删除被拒留下活行时改写幸存行（`:502`）；
  `close` 与 `stopAll` 读回汇报真实剩余。`Loop heartbeat` 因此成为保留名（F5，规避见
  `HEARTBEATS.md` §1）。
- **残留共享面**：`.rsi/STOP` 同时停两个心跳（只会停、不会串路由，`GROK_WORKFLOW_STOP_FILE`
  可分离，D-080）。真实定时投递、真机 GUI 改写提示词观察投递 `NOT_RUN`（武装任务是操作者
  动作，D-066）。

## A31 — 两个心跳是同一个服务类的两个实例，清理谓词随实例走（2026-11-20，`CONFIRMED`）

- **事实**：`src/index.ts:299` 与 `:313` 各建一个 `createLoopService`：循环实例用默认身份
  （`Loop heartbeat` / `[grok-workflow loop]`），自迭代实例用 `identity: { title:
  'RSI heartbeat', defaultPrompt: () => iterateTemplate }`（`src/loop.ts:119`）。
  `installLoop`（`src/loop-surface.ts:148`）为第二个实例注册 `/grok-workflow/iterate`
  这条 exact 路由，dispatch 是 `dispatchIterateAction`（`:352`）：只接受
  `{ action, sessionId }`，忽略 `prompt` / `intervalMinutes`，所以档案里的模板是提示词
  的唯一来源。工具只有一个（`grok_loop`），自迭代心跳没有模型面入口。
- **所有权**：每个实例的存储谓词是闭包 `slotOf`（`src/loop.ts:457`，按 `identity.title`
  匹配 `rrule` + 目标会话）；`close`/`status`/`stopAll`/`forgetSession`/`dropDuplicates`
  都用它。`deleteSessionHeartbeats`（`src/loop.ts:752`）把谓词做成参数（默认
  `isLoopSlot`，刹车仍只清循环行），`forgetSession` 传自己的 `slotOf`。
- **为什么**：写死谓词会让一个实例删掉另一个的行。实测修前 `iterate.forgetSession()`
  在同时有两行的会话上删掉 `Loop heartbeat`、留下 `RSI heartbeat`（F6）。修后反方向
  5 例测试通过；负对照（只把 `slotOf` 参数去掉）1 failed / 14 passed。
- **路由隔离的另一半**：两条 exact 路由各自绑定自己的服务；把 iterate 路由改成绑循环
  服务，`test/loop-surface.spec.ts` 的「two switches, two routes」块 2 例失败——说明
  这组测试真的能发现串线。页面开关的 `routePath` 与 Host 常量一致（`test/client.spec.ts`）。
- **残留**：卸载只清循环行（`src/loop-surface.ts:115`），自迭代行按设计留存；归档清扫
  按实例各自正确（D-081）。真实定时投递与真机 GUI 观察仍 `NOT_RUN`。

## A32 — The self-iteration default template, and the three copies that must agree

- **Facts (`CONFIRMED`, 2026-11-20):** `DEFAULT_ITERATE_TEMPLATE` (`src/config.ts:166`) is the
  schema default for `iterateTemplate` and the whitespace fallback `src/index.ts:319-320` hands
  to the iterate service's `identity.defaultPrompt`; the service stores it verbatim as the
  `RSI heartbeat` Schedule task's prompt (`src/loop.ts` `open`, `promptOf`). The hand-written
  settings bundle keeps its own literal copy (`src/client/index.js:44`) because it has no host
  import, and `test/client.spec.ts` pins it to the constant. `MAX_LOOP_PROMPT_CHARS = 4000`
  (`src/loop.ts:112`) is enforced both by the schema (`src/config.ts:842`) and by the service
  (`src/loop.ts:796`), and the textarea mirrors it (`max: 4000`).
- **Why the document is a fourth copy, not a comment:** the template is what a round is judged
  by, so the reasons for each section (POOL-first selection, the small/big split, R1–R6, the
  triple review, four brakes, the forbidden zones) belong somewhere a reader can check.
  `docs/iterate-template.md` holds the text between markers and
  `test/iterate-template.spec.ts` asserts it equals the constant, so a change in either place
  without the other fails the suite.
- **Measured on the live path:** on the copied profile (`loopfix-verify`, `:3451`) the switch's
  open wrote a 3 239-character prompt byte-equal to the default, and close left no Schedule row
  (`.rsi/evidence/round-025/live-iterate.txt`). The profile's stored template was blank, so the
  fallback itself was exercised, not a leftover test string.
- **Boundary that remains:** a real scheduled delivery was not run (one interval of real time;
  arming it is the operator's action, D-066).

## A33 — POOL re-verification against the tree (2026-11-20, round 27), and the checkpoint byte window

- **Why this entry exists:** `.rsi/POOL.md` was last rewritten for the 2026-11-18 audits and six of
  its open entries describe code that has since been fixed. A round that trusts a stale entry
  re-does finished work, which the protocol forbids, so the pool was re-checked line by line against
  `HEAD fd241c8` before choosing this round's theme.
- **Now stale, with anchors (`CONFIRMED`):**
  - "`src/records.ts` lines ~292, ~664, ~756 log `error.message` raw" — every logger site in that
    file redacts: `:292`, `:375`, `:554`, `:663`, `:688`, `:754` all call `redactError`.
  - "`src/history.ts` ~78-80 truncates before redacting" — `renderHistory` now redacts a bounded
    window first and truncates after (`src/history.ts:97-109`, comment states the reason and the call site follows it).
  - "the delivered answer is only the FIRST sentence" — `answerLead` (`src/delivery/index.ts:440`)
    walks up to three sentence pieces (`tried >= 3`) before falling back.
  - R6, R9, R10 are shipped fixes (`c1be0c7` for R6/R9 in `0.12.2`; `durationMs` uses `msCeiling`
    in `src/checkpoint/wiring.ts:784-790`), yet the pool still marks them PENDING.
- **Still open after the same check:** R11 (the cancelled terminal still composes `relayText`,
  which prepends `SUCCESS_PREAMBLE` and the `REPORT_BEGIN/END` markers, `src/gate.ts:611-644` +
  `src/answer.ts:106-130`) and the `src/panel.ts` importer question (no `src/` module imports it;
  only `test/panel.spec.ts`, `test/panel-links.spec.ts`, `test/gui-fold.ts`).
- **Measured for this round's fix (`CONFIRMED`, this tree):** one maximum-width evidence row costs
  **2,055 bytes** in the canonical payload. 481 rows → **1,001,015 bytes** (above `countCeiling`
  1,000,000, below `maxBytes` 1,048,576); 503 rows still fit under the file bound with the integrity
  record. So the write-then-unreadable band is ~22 rows wide, and the new test lands in the middle
  of it rather than at an exact byte. The upper edge is **1,048,447**, not 1,048,576: an
  independent probe measured the sealed file at payload + **129** bytes (1,019,510 → 1,019,639),
  so `writeCheckpoint`'s file bound is what caps a legal payload. The comment added to
  `src/checkpoint/schema.ts` says "…and 1,048,576" — 129 bytes loose, cosmetic only, left
  untouched because editing shipped source after the tag would make `lib/` differ from `v0.12.3`.

## A34 — How a base64-wrapped key hides from every armor rule, and what detects it (2026-11-20, round 29)

- **Why this entry exists:** `.rsi/POOL.md` carried one redaction entry (`P · Base64-wrapped PEM has
  no rule`) since the 2026-11-18 audits. Re-checked against `HEAD ce856cb` before choosing the round:
  it was still true — `src/redact.ts` has exactly two armor rules (`private-key` `:27`,
  `pgp-private-key` `:31`) and both match the literal banner, which a base64 blob does not contain.
- **Why the wrap defeats the table (`CONFIRMED`, measured this round):** base64 encodes independent
  3-byte groups into 4 characters, so the banner only exists after decoding. Two consequences: (a)
  the name-based rules are the only accidental catch, and they fire only when a secret-named label
  precedes the blob — `PRIVATE_KEY=<blob>` *was* redacted before this round (by `key-value`, as
  `[REDACTED]`), which is exactly why the defect hides: a neutral label (`tool result: <blob>`) or a
  JSON key such as `k` left the whole key in the report; (b) the same PEM embedded at source byte
  offset 0, 1 or 2 of a larger blob starts its banner in a different 4-character group, so one literal
  is not enough.
- **The three encodings (`CONFIRMED`):** for `-----BEGIN PRIVATE KEY`, bytes 3..17
  (`---BEGIN PRIVATE`) encode as `LS1CRUdJTiBQUklWQVRF` (offset 0), `LUJFR0lOIFBSSVZBVEUg`
  (offset 1) and `QkVHSU4gUFJJVkFURSBL` (offset 2). Probe: blobs built with 0/1/2/5/10 leading bytes
  each hit exactly one marker, and the alignment follows `prefix length mod 3`.
- **Boundaries measured, not assumed:** a base64 `CERTIFICATE` blob, base64 PGP armor, a PNG-encoded
  blob, a JWT and prose are all unchanged by the new rule; one 1 MB single-run base64 blob redacts in
  **8.5 ms** and 12,000 short runs (492 KB) in **5.3 ms**, so the lookbehind plus greedy-run shape is
  linear enough for report-sized text. A wrapped blob is consumed line by line while each continuation
  carries at least 16 characters; a final line shorter than that keeps a fragment of the block's
  footer (public bytes), which is documented in `docs/ARCHITECTURE.md` rather than papered over.
- **Why the mirror stays free:** `src/script.ts` builds `WORKFLOW_SCRIPT` from `REDACTION_RULES` at
  module load, so the new rule reaches the prompt-side redactor with no second edit — `lib/script.js`
  is byte-identical after the rebuild while `lib/redact.js` changes. `test/redact.spec.ts`'s parity
  corpus gained one base64 sample, so host/script equality is pinned over the new shape too.

## A35 — The GnuPG half of the encoded-armor gap: which windows survive alignment, and which ones over-reach (2026-11-20, round 30)

- **Why this entry exists:** `A34` closed base64-wrapped *PEM* and recorded the PGP half as a known
  gap ("the two banners diverge at byte 11, so it needs its own three markers"). Re-checked against
  `HEAD df6cf4b` before choosing the round: `src/redact.ts` matched only the three PEM encodings, so a
  `base64`d GnuPG keyring export reached reports, diagnostics and verifier/retry prompts verbatim.
  The pool entry was true and not stale.
- **The divergence is at byte 15, not byte 11 (`CONFIRMED`):** `-----BEGIN PGP PRIVATE KEY BLOCK-----`
  and `-----BEGIN PGP SECRET KEY BLOCK-----` agree through byte 14 (`-----BEGIN PGP `) and split at
  15 (`P` vs `S`); the *public* banner splits one byte later (`PU` vs `PR`). A 15-byte window
  therefore has to reach byte 17 to separate `PRI`/`SEC` from `PUB` — a window anchored at byte 0 is
  shared with the public armor.
- **The six encodings (`CONFIRMED`, computed and then pinned by test):** for
  `-----BEGIN PGP PRIVATE KEY BLOCK`, bytes 3..17, 4..18 and 5..19 encode as
  `LS1CRUdJTiBQR1AgUFJJ`, `LUJFR0lOIFBHUCBQUklW` and `QkVHSU4gUEdQIFBSSVZB`; the `SECRET` banner
  yields `LS1CRUdJTiBQR1AgU0VD`, `LUJFR0lOIFBHUCBTRUNS` and `QkVHSU4gUEdQIFNFQ1JF`.
  The derivation reproduces the three round-29 PEM literals exactly, which is the cross-check that the
  window method was applied the same way.
- **Over-reach measured, not assumed:** the 20-character group that encodes bytes 0..14 is
  `LS0tLS1CRUdJTiBQR1Ag` for the private blob, and a base64 `PGP PUBLIC KEY BLOCK` blob starts with
  that same literal (`startsWith` → `true`). A shared-prefix marker would redact public keys. The
  shipped windows do not: `test/redact.spec.ts` asserts a base64 public key blob comes back unchanged,
  next to the existing `CERTIFICATE` case.
- **Cost measured at HEAD (`CONFIRMED`, min of 5 runs, Node 26.8.1):** the rule alone takes 12.1 ms on
  a 1 MB single-run blob with no marker (the worst case: the greedy run is consumed once, then nine
  alternatives are retried at every backtrack position), 3.7 ms on a 1 MB blob that does carry a
  marker, and 1.9 ms on 12,000 short runs (287 KB). The full table on the same 1 MB blob is 62.1 ms,
  so the enlarged alternation is not what dominates a large input.
- **Narrow wraps measured, and this is a real gap (`CONFIRMED`):** the marker is a 20-character
  contiguous literal, so a blob wrapped below 20 columns splits it across lines and nothing matches.
  Measured on a 184-character encoded GnuPG block: wrap widths 8, 12, 16, 19, 20, 21, 22 and 23
  leave 180–184 of 184 encoded characters in the output (no redaction at all), 24 is the first width
  that redacts (marker contiguity 20 plus the ≥16-character continuation rule), and 24/29 leave a
  10–12-character tail — the documented footer fragment. The same floor applies to PEM since round
  29: it is the marker width, not the new PGP literals, that sets it. Real `base64` wraps at 76
  columns and `-w0` does not wrap, so the exposure is a hand-wrapped paste; pooled as its own item
  rather than papered over.
- **Boundaries unchanged:** a wrapped blob is still consumed line by line while each continuation
  carries at least 16 characters; base64 `CERTIFICATE` and `PGP PUBLIC KEY BLOCK` stay untouched;
  `lib/script.js` remains byte-identical because `src/script.ts` renders `REDACTION_RULES` at module
  load, so the prompt-side redactor picked the new literals up with no second edit.

## A36 — The integrity record is 122 bytes plus the decimal digits of the byte count (2026-11-20, round 31)

- **Why this entry exists:** the number a reader was given for the writer's payload ceiling was
  "`maxBytes - 129`", and 129 only holds for a 7-digit `integrity.bytes`. Measured this round on real
  sealed files: the record is `,"integrity":{"algorithm":"sha256","checksum":"<64 hex>","bytes":<n>}`,
  i.e. **122 bytes plus the digits of `n`** — 126 bytes for a 4,000-byte payload, 129 at 1,048,447.
  A constant "129" is right at the ceiling it is quoted for and wrong everywhere else, which is why a
  comment that quotes it must quote the ceiling too.
- **The ceiling itself (`CONFIRMED`, at the ceiling):** the largest payload whose file still fits
  `maxBytes` satisfies `payload + 122 + digits(payload) ≤ 1,048,576`; the self-consistent solution is
  **1,048,447** (7 digits, 129 bytes of record, file exactly 1,048,576). Writing that payload produces
  a file of exactly `maxBytes` and reads back intact; 1,048,448 is refused `too-large`.
- **What was actually wrong:** the behaviour, not the comment. Round 27 already bounded both sides by
  `maxBytes`, so the writer accepted exactly 1,048,447 before this round too — the defect was a comment
  that said the refused band ran to 1,048,576, i.e. it claimed 129 bytes of headroom that no caller can
  use. The round therefore lands *measurement plus a guard*, and the red/green is over the comment, not
  over behaviour: `test/checkpoint-schema.spec.ts` now derives the record size from a sealed file,
  solves for the ceiling, writes at it and one byte over, then reads `src/checkpoint/schema.ts` back and
  requires the comment to name that ceiling. On the pre-round source the same test fails on the last
  assertion (the comment said 1,048,576).
- **Exact payload sizing is possible (`CONFIRMED`), and cheap:** evidence rows move a payload in
  ~2,055-byte steps, but `minContext.digest` is copied verbatim at one byte per character (capped by
  `digestChars`), so rows set the bulk and the digest trims the remainder. Five `buildCheckpoint` calls
  plus two real writes size the boundary exactly, in ~570 ms.

## A37 — 折行把 base64 标记自己拆开：哪些宽度能修、哪些不能（2026-11-20，round 33，`CONFIRMED`）

**测量**：把一个 `-----BEGIN PRIVATE KEY-----` 与一个 `-----BEGIN PGP PRIVATE KEY BLOCK-----` 的
编码块按 `w` 列折行后交给 round 32 的 `base64-private-key`，`w ∈ {8,12,16,19,20,21,22,23}`
**全部整块留存**（输出里既没有占位符，也没有任何字符被替换），`w = 24` 是第一个整块被替换的
宽度。原因不是 PGP 那六条新字面量，而是标记本身的宽度：20 字符的连续字面量在任何 `< 20` 列的
折行里必然跨行，而 `.` 在不带 `s` 标志时也不匹配换行；续行规则另需每行 ≥16 字符，窄折行的续行
（8–22 字符）连它也不满足。

**修法实测（round 33，`CONFIRMED`）**：窗口字符之间允许一个断行（真实换行或 JSON 的 `\n` 转义）
后，8/12/16/19/20/21/22/23 列 × PEM/PGP 八种宽度全部整块脱敏，折行公钥、折行证书与普通 base64
块保持原样（`test/redact.spec.ts`）。

**边界一（`CONFIRMED`，保留）**：折行 ≤7 列仍不脱敏。把续行下限压到 1 会让 `\nnext line stays`
被当成一行宽 4 的折行吃掉首词（实测：`tail`、`next` 这类行会消失），所以下限取 8——`w >= 8` 的
折行每行正好不少于 8 字符，而更窄的折行与散文在字符集上不可区分。

**边界二（`CONFIRMED`，实测数值）**：同一条规则在 116 KB 散文上的耗时从 1.23 ms 升到 7.86 ms
（每字符 2–3 个可选分支使失败路径变长）；284 KB、含 4 000 个「近失配」窗口的对抗输入 38.6 ms。
报告体量（`redactSecrets` 整表在 116 KB 上 43 ms）远低于此，按可接受记录在案。

**记录层（`CONFIRMED`）**：`.rsi/ledger.jsonl` 与 `.rsi/ROUND.md` 的轮次必须同步——门禁
`heartbeat-guard.sh` 的「上一轮未闭合」判据之一就是 `round_max > ledger_max`（`code=round-without-ledger`），
而账本停在 25、报告已到 32 时它会一直 SKIP，第三次升级为 `stall-unclosed` 的 STOP。表现为
「所有测试都绿、循环却停摆」，因此该不变式必须由测试而非人工看住（`test/rsi-ledger.spec.ts`）。

## A38 — 折行的三种断行形态各覆盖到什么程度，代价多少（2026-11-20，round 34，`CONFIRMED`）

**覆盖矩阵（`reach-probe.mjs`，已入库 `.rsi/evidence/round-034/`）**：把一个
`-----BEGIN PGP PUBLIC KEY BLOCK-----`、一个 `-----BEGIN CERTIFICATE-----` 与一个
`-----BEGIN PRIVATE KEY-----` 的编码块按 24 列折行，断行分别用真实换行、`\n`（单转义）、
`\\n`（双转义）三种形态：

| 材料 | 真换行 | `\n` | `\\n` |
|---|---|---|---|
| PGP 公钥 | 不脱敏 | 不脱敏 | 不脱敏 |
| 证书 | 不脱敏 | 不脱敏 | 不脱敏 |
| 私钥 | 整块脱敏 | 整块脱敏 | 整块脱敏 |

私钥三种形态脱敏后输出仍是合法 JSON（可 `JSON.parse`）；带 `\\n` 的散文原样返回。
round 33 记录过「折行 ≤7 列不处理」，但那是**修前旧码**的测量：在 HEAD 上真换行折行
**1–24 列全部脱敏**，池里那条描述已过时，round 34 把它改写成「三重及以上转义」。

**性能（`perf-probe.mjs`，同机 A/B：HEAD 的 `lib/redact.js` vs 当前）**：174,000 B 散文
**9.14 ms → 9.08 ms（×0.99）**；42,039 B 对抗输入（4,000 个近失配窗口 + 双转义断行）2.48 ms。
round 33 那次把 1.23 ms 抬到 7.86 ms 的代价没有被再放大：新增的是一个字面量分支，失败路径只多
一次比较。

**为什么不能更宽**：把断行放宽成「任意反斜杠 + n」会开始吃正常转义文本，而 `BASE64_BLOB_END`
只锚续行、管不到断行位置（`D-089`）。这是本规则的宽度上限，不是实现遗漏。
