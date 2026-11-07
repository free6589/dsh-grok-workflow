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
  `{kind:'error', text:'Usage: /grok [on|off]'}` with the toggle untouched. `setBy` =
  `command:/grok` / `command:/grok off`. `turn` is informational (finite agent turn else 0); the
  gate reads only `enabled`.
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
