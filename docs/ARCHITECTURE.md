# Architecture

## Goal

`dsh-grok-workflow` adds one model-facing tool, `grok_workflow`, that turns a
complex objective into a bounded, verifiable multi-subagent workflow using DSH
capabilities. It does not implement a new agent loop, model adapter, sandbox, or
subagent runtime.

## Reused DSH capabilities

| Capability | DSH package/service | How this plugin uses it |
|---|---|---|
| Workflow execution | `ctx.workflowEngine` (`@deepseek-ai/dsh-workflow`) | Starts a generated plain-JavaScript orchestration script; awaits `run.result`; always disposes. |
| Script sandbox and child fan-out | `@deepseek-ai/dsh-workflow-ptc` | Executes the script in DSH's PTC runtime; `agent()` delegates to subagents. |
| Subagent lifecycle | `ctx.subagents` (`@deepseek-ai/dsh-subagent`) | Provides child admission, cancellation, structured output, and teardown through the engine. |
| Tool registration | `ctx.tools` (`@deepseek-ai/dsh-tools`) | Registers `grok_workflow` with typed parameters and a JSON canonical result. |
| Prompt guidance | `ctx.systemPrompt` | Adds a short usage section explaining when the tool applies. |
| Plugin lifecycle | Cordis effects and `ctx.effect()` | Unregisters the tool/prompt and disposes active workflow runs on unload. |
| Profile installation | DSH bundle/profile patch layers | The bundle inserts one plugin row; disabling/removing the bundle removes the plugin. |

## Borrowed Grok Build strategy

Grok Build's deep-research workflow establishes a useful pattern:

1. **Plan** a small set of independent questions, bounded by breadth.
2. **Execute** structured research jobs in parallel.
3. **Verify** claims independently, validating exact IDs and rejecting malformed
   verifier output.
4. **Synthesize** a report whose status is partial when coverage or verification
   is incomplete.

This plugin adopts the strategy and the fail-closed evidence discipline, not
the implementation. Grok Build's Rhai scripts, Rust manager, journal, budget
leases, and pause/resume statuses are not ported. DSH's workflow engine already
provides sandboxed script execution, bounded child counts, cancellation, and
cleanup; the plugin adds the domain-specific plan/verify/retry/report policy.

## Execution design

```text
grok_workflow tool call
        |
        v
validate objective + optional caller-supplied tasks
        |
        v
build a static JS workflow script + args JSON
        |
        v
ctx.workflowEngine.start({ script, meta, args, parent, signal })
        |
        +--> Plan: planner agent (if no tasks supplied) with JSON schema
        |
        +--> Execute + Verify + Retry: bounded worker pool
        |       for each task:
        |         worker agent -> structured execution result
        |         verifier agent -> criterion evidence
        |         if failed and attempts remain: worker retry -> verifier
        |
        +--> Synthesize: deterministic host/script report
        |
        v
redact credentials recursively -> tool canonical JSON -> text render
```

The script is static; the objective, caller tasks, and limits cross the sandbox
as `args` JSON data. No user text is interpolated into code.

### Plan

The planner returns object-rooted structured output:

- `id`, `title`, `objective`, `expectedOutput`
- `acceptanceCriteria` (non-empty list)
- `context`, `constraints`
- optional `dependsOn` is intentionally rejected in the MVP: tasks must be
  independent so concurrency and partial status are well-defined.

Host/script validation enforces unique IDs, non-empty required fields, at most
`maxTasks` tasks, and no dependency graph. A planner failure or invalid plan
falls back to one task containing the original objective; the report records
`planning.source: "fallback"` and cannot claim fully clean completion.

### Execute

Tasks run through a bounded worker pool implemented in the script. The pool size
is `maxConcurrency` (default 3, schema maximum 6). The script calls `agent()`
only from a pool worker, so at most that many child agents are in flight.
`maxTotalAgents` is also passed to the engine as a second backstop.

### Verify

Every worker result is followed by a fresh verifier agent that receives the
task and the worker's structured result. The verifier must:

- inspect actual files/commands/sources rather than accept the worker summary;
- return one criterion result per acceptance criterion with non-empty evidence;
- return at least one concrete checked-evidence item;
- mark `pass` only when every criterion is met.

The host validates these conditions. A malformed or evidence-free `pass` is
converted to a failed verification and triggers a bounded retry.

### Retry

Each task has at most `maxRetries` retries after the initial attempt (default 1,
schema maximum 3). Retry attempts receive the prior result and verifier issues.
Attempt counts are reported; failures are never collapsed into success.

### Synthesize

The final report contains:

- `status`: `completed`, `partial`, or `failed`
- original objective and plan (source + tasks)
- per-task execution, verification, attempts, and errors
- confirmed findings/evidence
- incomplete items, errors, and uncertainties
- applied limits

Status rules:

- `completed` only when every planned task is verified and no planning fallback
  or unresolved failure exists.
- `partial` when at least one task is verified but the workflow is not fully
  clean, or when planning degraded to fallback.
- `failed` when no task is verified.

## Lifecycle and cancellation

- The tool passes `exec.signal` to the workflow engine and also maps a
  configurable deadline to `run.cancel()`.
- Every `execute` path awaits `run.result` and calls `run.dispose()` in
  `finally`; partial output is never presented as success.
- The plugin tracks live runs in a `Set`. A plugin-level `ctx.effect()` aborts
  its controller and disposes every live run during unload, then returns after
  cleanup settles.
- Tool and prompt registrations are Cordis effects, so unload removes them.
- There are no plugin-owned timers, sockets, or listeners beyond the effect
  cleanup and the deadline timer, which is cleared on every path.

## Registration and composition

The bundle patch inserts one row:

```yaml
- insert:
    - id: grok-workflow
      name: dsh-grok-workflow
```

The plugin exports `name`, `inject`, `Config`, and `apply`. It requires
`tools`, `workflowEngine`, and `systemPrompt`; the DSH base/web/headless
compositions provide the workflow engine and a subagent provider (`spawn`).
If they are absent, the plugin remains pending/fails loudly rather than
silently degrading.

## Non-interference

When the bundle is not installed or its row is disabled:

- no tool is registered;
- no prompt section is added;
- no listeners or workflow runs exist;
- ordinary DSH sessions behave exactly as before.

## CI versus local-only tests

CI can run:

- TypeScript typecheck, lint, unit tests with a fake workflow engine and fake
  agent boundary;
- build and package-content checks;
- a Loader integration test using the real DSH Loader and real DSH tool
  registry, with only the subagent boundary faked.

CI cannot prove a real model-produced workflow or a real DSH UI session.
Those must be run locally with a real DSH profile and are recorded separately
as local runtime evidence.

## Known architecture limits (MVP)

- No pause/resume, journaling, or cross-process resume.
- No background job mode; the tool runs in the foreground and uses `exec.signal`.
- No per-task model/provider routing; children inherit the parent/deployment
  route.
- No dependency graph between tasks; tasks are independent by design.
- Verification is independent-agent plus evidence validation, not a formal
  proof of correctness.
