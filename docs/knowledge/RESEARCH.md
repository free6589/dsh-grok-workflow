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

- HYPOTHESIS: `engines.dsh: ">=0.2.1-rc.2 <0.3.0"` will satisfy DSH's own
  SemVer evaluator for the installed prerelease. Must verify by actual install.
- NOT_VERIFIED: headless profile with a Bifrost model route can run a real
  end-to-end `grok_workflow` call on this host. Must test without logging keys.
- NOT_VERIFIED: GitHub Actions runner can install DSH `0.2.1-rc.2` packages
  from the public npm registry. Must verify in CI.

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
