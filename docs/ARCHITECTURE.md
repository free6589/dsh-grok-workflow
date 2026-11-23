# Architecture

## Goal

`dsh-grok-workflow` adds two things to DSH, using only documented capabilities:
a model-facing tool, `grok_workflow`, that turns a complex objective into a
bounded, verifiable multi-subagent workflow; and — since `0.2.0`, on by default —
an **entry gate** on `agent/pre-step` that makes that workflow mandatory for user
messages instead of opt-in. It does not implement a new agent loop, model
adapter, sandbox, or subagent runtime.

## Reused DSH capabilities

| Capability | DSH package/service | How this plugin uses it |
|---|---|---|
| Workflow execution | `ctx.workflowEngine` (`@deepseek-ai/dsh-workflow`) via `src/team-engine.ts` | Starts a generated plain-JavaScript orchestration script; awaits `run.result`; always disposes. For task-team runs the engine is a private twin of the runtime's own PTC engine whose `subagents` view derives each child's durable display label from its prompt's first line; on any non-PTC engine the injected engine is used unchanged. |
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
        |         supervisor agent (serial) -> can only fail the attempt, never pass it
        |         if failed and attempts remain: worker retry -> verifier
        |
        +--> Resident parallel supervision (host side, `src/guardian.ts`):
        |       one `RunGuardian` per run, created before the engine starts and
        |       adopted with the live run. It observes only
        |       `workflow/agent-start` / `workflow/agent-end` / `workflow/end`,
        |       judges liveness (never quality), and on a stall
        |       (per-child timeout or run-wide heartbeat loss) cancels the run
        |       at most once and records a bounded `Guardian` finding that the
        |       terminal path folds into the report's errors. It never calls the
        |       engine's `agent()` hook: zero model calls, no new agent role.
        |       See `docs/knowledge/RESEARCH.md` A29 and `DECISIONS.md` D-074.
        |
        +--> Synthesize: deterministic host/script report
        |
        v
redact credentials recursively -> tool canonical JSON -> text render
```

The script is static; the objective, caller tasks, and limits cross the sandbox
as `args` JSON data. No user text is interpolated into code.

### Plan

The plan is the captain's call (round-071): the planner prompt states the shape
limits (task count, field sizes, wave ceiling) as a gate and leaves the split, the
order and the continue/stop policy to the model. A plan may carry
`onFailure: "continue" | "stop"`; `stop` ends the run after a wave with an
unverified task, reporting every task that did not run as a stopped row. Unset or
unknown values read as `continue`, which is the pre-round-071 behaviour. Mid-run
plan changes go through the existing boundary channel (`src/replan.ts`,
`src/steering.ts`), which is on by default (`replan`).

The planner returns object-rooted structured output:

- `id`, `title`, `objective`, `expectedOutput`
- `acceptanceCriteria` (non-empty list)
- `context`, `constraints`
- optional `dependsOn` is intentionally rejected in the MVP: tasks must be
  independent so concurrency and partial status are well-defined.

Host/script validation enforces unique IDs, non-empty required fields, at most
`maxTasks` tasks, no dependency graph, a **32,000-character workflow objective**,
and a 48,000-character aggregate serialized task budget. Each task's own
`objective`, `expectedOutput`, and `context` stay capped at 4,000 characters
(`taskTextChars`) — those task-level limits are unchanged. A planner failure or invalid plan falls back to segmented tasks covering the original objective verbatim: the objective is split into contiguous segments of at most 4,000 characters (`taskTextChars`), as close to equal as the bound allows and cut on a nearby paragraph, sentence or word break, concatenating the segment objectives reproduces the original byte for byte, every segment carries the same `origin_goal_id`, and the segment count follows the splitter (`src/shards.ts`) rather than `maxTasks`; the report records `planning.source: "fallback"` and cannot claim fully clean completion.

`acceptanceCriteria` is a non-empty list whose entries must stay distinct under
the comparison used to match a verifier's answer: trailing sentence punctuation,
collapsed whitespace, and letter case are ignored. A task whose criteria collide
after that normalization is rejected (host input validation and planner output
alike) because two criteria that compare equal cannot each be confirmed by
exactly one verifier entry. This makes some inputs that were previously accepted
invalid, for example `["Do X.", "do x"]` or `["alpha works", "alpha works!"]`;
write each requirement once, with distinct wording.

### Execute

Tasks run through a bounded worker pool implemented in the script. The pool size
is `maxConcurrency` (default 3, hard maximum 6). The script calls `agent()`
only from a pool worker, so at most that many child agents are in flight.
`maxTotalAgents` is also passed to the engine as a second backstop.

### Per-route concurrency: overflow, not fallback

Each route in a role's chain may carry an optional `maxInFlight` (1–64, blank =
unlimited). The counter is per route **inside one workflow run**: while a capped route is full,
a new call overflows to the next untried route in chain order instead of waiting
on the full one. Only when every untried route is full does the call wait for a
drain, and the wait is recorded as `queuedMs`. Counters live in the generated
script's per-run state and are never shared across runs, so a `Route overflows …`
entry can only ever describe yielding inside the run that produced it. Blank =
unlimited = never yields: a chain whose routes are all blank can never overflow.

A full lane is never a failure: it advances no fallback, costs no retry attempt,
and leaves the failure policy (`switchOn`) untouched. The distinction is visible
where it matters — the child's trail entry carries `skippedBusy` (which lanes
were yielded) and `queuedMs`, rendered as `Route overflows …` (separate from
`Route switches:`) and kept in the routing ledger — so "used route B because
route A was full" never reads as "route A failed".

### Verify

Every worker result is followed by a fresh verifier agent that receives the
task and the worker's structured result. The verifier must:

- inspect actual files/commands/sources rather than accept the worker summary;
- return one criterion result per acceptance criterion with non-empty evidence;
- return at least one concrete checked-evidence item;
- mark `pass` only when every criterion is met.

The host validates these conditions. A malformed or evidence-free `pass` is
converted to a failed verification and triggers a bounded retry.

### Supervise (two layers, orthogonal)

Supervision answers two different questions in two different places:

- **Serial supervisor (quality):** after verification and before synthesis, one
  `supervisor` agent call per task attempt — but only when a supervisor chain
  is configured. It can only fail an attempt, never pass one: a verifier
  failure stands even when supervision passes. This is the D-056 semantic and
  it is unchanged.
- **Resident parallel guardian (liveness):** one `RunGuardian` per run, alive
  from before the engine starts until the run settles (`src/guardian.ts`). It
  observes only `workflow/agent-start` / `workflow/agent-end` /
  `workflow/end`, judges whether children are still alive (never what they
  said), and on a stall — a per-child timeout or a run-wide heartbeat loss
  against a budget derived from the run's own deadline (`min(deadline, 600s)`,
  disarmed for `timeoutMs: 0`) — cancels the run at most once and records a
  bounded `Guardian` finding that the terminal path folds into the report's
  errors without changing its status. It never calls the engine's `agent()`
  hook: zero model calls, no new agent role, no second scheduler. Plugin
  unload disposes every live guardian with the runs it watches, so no timer,
  listener, or registry entry outlives the unload. See `RESEARCH.md` A29 and
  `DECISIONS.md` D-074.

One sentence: the supervisor answers "is the work right", the guardian
answers "is the work still alive".

### Retry

Each task has at most `maxRetries` retries after the initial attempt (default 1,
hard maximum 3). Retry attempts receive the prior result and verifier issues.
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
  or unresolved failure exists. A fallback or unavailable plan can never be
  `completed`.
- `partial` when at least one task is verified but the workflow is not fully
  clean, or when planning degraded to fallback. A fallback plan whose shards
  verify successfully is still `partial`; the report keeps the fallback
  provenance and the planning error. For non-fallback plans, `partial` requires
  a mix of verified and failed tasks.
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
- The resident guardian owns one `unref()`ed 1-second interval per live run
  plus its three engine-event listeners and its instance-registry entry; all
  three are released on `finish()`/`dispose()`, and `disposeActiveState`
  disposes every live guardian with the runs it watches.
- There are no other plugin-owned timers, sockets, or listeners beyond the effect
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

### Settings surface

The exported `Config` schema is the settings surface. DSH's `ctx.settings`
(`SettingsForms`) projects every Loader entry's own schema into a form keyed by
the entry id (`grok-workflow`), reports `applies: 'live'` and `autoGenerate`
(default true), and writes edits through `update`/`replace`/`mutate` with a
revision check (`SETTINGS_CONFLICT`) into the profile patch file. The plugin
declares `ctx.settings.configure({ auto: true })` in `apply()` (soft failure on
runtimes without the hook) and validates its own configuration at load:
unknown keys are refused at every level the reader accepts — the top level, a
role name under `roles`, and a field of a route object (`assertKnownNestedKeys()`,
`ROLE_KEYS` / `ROUTE_KEYS`; the exported schema passes unknown *nested* keys
through to `apply()` unchanged, measured in RESEARCH A39, so the reader is where
that refusal has to happen) —, `configVersion` is bounded, and every configured
route — all five routed roles, `supervisor` included, since its route is read
from the same table and it runs per task after that task's verifier — is checked
against `llm.listProviders()` plus, where the provider enumerates them, its
declared model ids. Nothing here is decorative: the
generated fields are the fields `resolveConfig()` reads. A bespoke chain editor
with model dropdowns would be a client-half package (`dsh.client`), not a core
change (see ROADMAP §9.2).

### Recoverable vs irrecoverable configuration (P1)

Only two configuration shapes are **recoverable** — a `synthesis` /
`roles.synthesizer` mismatch whose intent is unambiguous:

| # | Raw shape | Effective value | Log |
|---|---|---|---|
| (a) | synthesizer chain non-empty + `synthesis: deterministic` | `model` | `warn` names `model` + `已按 model 生效，请在设置页确认` |
| (b) | `synthesis: model` + empty synthesizer chain | `deterministic` | `warn` names `deterministic` + `已按 deterministic 生效，请在设置页确认` |

Mechanism: `repairSynthesisInconsistency(raw)` in `src/config.ts` is a pure
function — it returns `{ repaired, warnings[] }`, mutates nothing, validates
nothing, and matches only the two shapes above (anything else returns
unchanged with no warnings). `apply()` in `src/index.ts` calls
`reader.read()` at load as before; only when that throws does it snapshot the
raw config, run the repair, and re-resolve the repaired shape. The repaired
shape must itself resolve cleanly before any warning is emitted — so a second,
non-repairable defect behind the mismatch still fails hard. A repaired config
activates normally (tool + gate + settings surface all start) and carries
`synthesisRepaired: true`, which `describeResolvedConfig()` renders as
`synthesis=<mode> (repaired)` so the load log is self-proving. The same
fallback runs on every later `readConfig()`, so a bad settings save repairs
the same way. The run-time gate path (`gate.safe()` / `lastGood` in
`src/gate.ts`) is untouched.

Everything else is **irrecoverable** and still fails hard at load (R-06):
unknown keys, `configVersion` out of range, `gateScope: preset` without a
preset name, out-of-range numbers, malformed/duplicated/over-long chains,
unknown providers, models the provider enumerates but does not declare,
unknown `switchOn` classes, and budget-backstop violations. The settings page
mirrors the recoverable pair client-side (`src/client/index.js` `validate()`):
chain non-empty + deterministic, or `model` + empty chain, is a red
`error.synthesisChainUnused` / `error.synthesisChainMissing` finding (both
languages) that disables Save; only a legal combination may be written.

## Mandatory entry (the gate)

```
user message ──► agent/pre-step ──► classify
                                     ├─ not ours (subagent, non-user source, empty batch, out of scope, already routed) ──► pass through
                                     ├─ unusable (empty text, over 32000 chars) ──► refuse out loud, nothing runs
                                     └─ admit ──► run the workflow ──► deliver the validated report in this turn
```

- **Classification is a whitelist** (`src/gate.ts`): only `source.kind === 'user'`
  messages for the scoped agents are claimed. Subagent prompts, team messages,
  webhooks, schedules, user-question replies and empty batches pass through — a
  gate that claims everything would recurse.
- **Claiming is recorded, not guessed.** A per-message delivery record is written
  into the session, so a re-dispatched batch cannot start a second run and an
  interrupted delivery is not silently re-run.
- **Delivery is in-turn by default.** The turn stays open, the report is entered
  as the step's message, and the main model finalises it in the same turn. The
  alternatives (`relay`, `append`) deliver after the turn closes and therefore
  need a long-lived surface.
- **A triage-team message on an interactive surface speaks first, then works in
  the background (`receipt-then-relay`).** The pre-step writes one live first
  answer into the turn (one light model call over the `triageModel` route; the
  information structure is fixed, the wording is composed fresh every time, and
  a failed call degrades to a plainly-labelled template fallback), then admits
  the workflow into the per-agent queue; the result is delivered by `relay`
  when it settles and the progress board stays live meanwhile. Anything that
  cannot deliver in the background — headless one-shot (no `followup` turn),
  `full` mode, a full queue, or any throw inside the interactive path — falls
  back to the blocking `in-turn` run, so the final answer is never lost. The
  `answerStrategy` configured value is unchanged (`in-turn` default); what
  changed is the triage-team walk on a surface that can deliver later.
  Cancelling is whole-round: a new message for the same session cancels the
  in-flight run (`run.cancel` + `commitCancelled`) and restarts narrowed
  (`carriedPendingRequest` / `resumedTarget`); V1 offers no subtask-level
  redirect.
- **The team tier confirms the split before dispatching (round-071).** The front
  desk decides *how much* a message costs; the captain decides *what the work
  becomes*. Before any child runs, the gate spends one cheap call (`captain-preview`)
  asking the planner for a short split, states it to the user, and records a pending
  confirmation (`src/captain.ts`, `pendingCaptains` in `src/gate.ts`, ten-minute TTL).
  The next message is read against that entry: an unmistakable approval dispatches
  the request as previewed, an explicit edit dispatches the original request with the
  change folded in (`amendRequest`), and anything else voids the entry and is routed
  on its own. Two paths skip the round by design — a session whose `/grok` record
  forces the full shape, and the message that just answered the front desk's own
  quick-or-team question. Mid-run messages are unchanged: they still join the live
  plan through `src/channel.ts` / `src/steering.ts`.
  The preview is advisory: the dispatched run plans again, and the gap is recorded
  in `docs/knowledge/RESEARCH.md` (round-071).
  Round-072 closed three ways one confirmation could go wrong: the entry is
  consumed exactly once per batch (`takeCaptainPending`, TTL applied) and the
  consumed value is handed to every path, so an expired question can never dispatch
  its plan; a message that is not an answer is voided *and* routed on its own by the
  path that states the note, never silently dropped; and the batch is queued before
  it is recorded, so a full queue leaves no delivery record for a run that never
  started. The channel steps aside for a confirmation (`src/channel.ts`
  `classifyChannelMessage` would read "确认" as a demand for the live plan), and the
  full shape — which has no front desk — reads the same entry instead of handing the
  word "确认" to the planner as the objective.
- **The first turn of a session never waits for the run to be visible (0.13.24).**
  A claimed batch may only be published once the host's first surface node exists
  (`system/message` first, or the stored log can never be reopened), so on a fresh
  session the gate cannot echo the message ahead of the run — and `in-turn` commits
  it only when the step opens, i.e. after the workflow settles. A first-turn message
  in the `full` shape therefore answers with the words alone
  (`answerBehindUnpublished`): the loop opens the step and commits them at once, the
  team runs behind them, and the report is delivered as its own message through the
  same relay path every deferred answer uses. Nothing is written ahead of the host
  head, so the position-0 rule is untouched; a session whose surface cannot be read,
  and any shape with a front desk, keep the blocking path unchanged.
- **The gate reads the live configuration** on every decision (holders, see the
  settings section), so an edit applies to the next message while an in-flight
  run keeps its snapshot; an invalid edit refuses that message with its reason
  and delivery falls back to the last good snapshot.
- **Failure modes are bounded:** the queue per agent is capped
  (`maxQueuedMessages`), the run is bounded (`maxActiveRuns`, `timeoutMs`), and a
  broken configuration is reported rather than swallowed.

### Objective length boundary

The objective limit is defined once as `TASK_LIMITS.objectiveChars` (`32_000`)
in `src/input.ts`, mirrored by the generated script in `src/script.ts`, and
enforced on the gate path (`src/gate.ts`), the direct `grok_workflow` tool call
(`src/index.ts`), and `composeObjective()` (`src/history.ts`).

| User message length | Gate (`agent/pre-step`) | Direct tool call | Result |
|---|---|---|---|
| 4,000 characters | admit | accept | run starts; the whole message is kept |
| 4,001 characters | admit | accept | run starts; the whole message is kept |
| 32,000 characters | admit | accept | run starts; the `Current request:` label is dropped and no history is attached, so the objective is exactly 32,000 characters |
| 32,001 characters | refuse | reject | no run starts; the refusal names the 32,000-character limit |

Every length from 4,001 through 32,000 characters is admitted; 32,001 is the
first refused length.

`composeObjective()` never shortens the current message. It returns `undefined`
only when the message itself exceeds the limit; when the 17-character
`Current request:\n` label would push the composed objective over the limit, it
returns the message unchanged instead of trimming it. Only the history block is
truncated. `historyChars` (default 20,000, hard maximum 1,000,000) and
`taskTextChars` (4,000 per task field) are unchanged.

**Planner-failure fallback.** When planning fails, `fallbackPlan()` splits the
whole objective into contiguous segments of at most `taskTextChars` characters;
concatenating the segment objectives reproduces the original objective byte for
byte. The segments are as close to equal as the bound allows — a 4,001-character
objective becomes two ~2,000-character segments, never a 4,000-character one plus
a one-character stub — and a cut that lands near a paragraph break, a sentence end
or a word break is moved onto it, so a segment ends where the text already ends.
Every segment carries the same `origin_goal_id`, so the fallback is traceable to
the one original goal, and each segment's acceptance criterion names the segment
it covers, so a verifier confirms the piece it was handed and no shard stands in
for the whole objective. `src/shards.ts` is the single implementation of that
split: the generated script runs it, and host validation re-derives the expected
segments with it and rejects a fallback plan carrying anything else. The segment
count therefore follows the splitter — not `maxTasks`, and not
`ceil(objectiveChars / taskTextChars)` either, because a boundary that backs off a
surrogate pair adds a segment. Host validation accepts a fallback plan over the
configured task cap (a fallback must not be rejected a second time) while still
enforcing the per-task text bound, and it does not apply the authored-text
aggregate budget to the fallback: that budget bounds task text a planner or caller
wrote, and the fallback's text is the caller's own objective, whose JSON escaping
can inflate the serialized plan past the budget without adding a character of
work. The run reports `partial` with `planning.source: "fallback"` and the
planner error.

## Non-interference

When the bundle is not installed or its row is disabled:

- no tool is registered;
- no prompt section is added;
- no `agent/pre-step` listener exists, so no message is claimed;
- no workflow runs exist;
- ordinary DSH sessions behave exactly as before.

Setting `enforceGate: false` keeps the tool and drops the listener, which is the
`0.1.0` behaviour.

## CI versus local-only tests

CI can run:

- TypeScript typecheck, lint, unit tests with a fake workflow engine and fake
  agent boundary;
- engine contract tests (`test/engine-contract.spec.ts`) that run the generated
  script against the **real** `@deepseek-ai/dsh-workflow-ptc` engine with a fake
  subagent provider — the real `dsh-ptc-runtime`, `dsh-sandbox`, `dsh-scope`,
  `dsh-session` and `dsh-workflow-ptc` devDependencies exist for that suite, not
  for the published plugin;
- mandatory-entry tests (`test/gate.spec.ts`, `test/history.spec.ts`) that drive
  `agent/pre-step` through a fake agent boundary, including the refusal paths;
- composition tests (`test/composition.spec.ts`) that dispatch `agent/pre-step`
  through a **real cordis waterfall** shared with faithful reproductions of the
  in-tree listeners (provenance in `test/composition-listeners.ts`), so the
  ordering, `prepend` placement and veto semantics are the runtime's own;
- build and package-content checks;
- a Loader integration test using the real DSH Loader and real DSH tool
  registry, with only the subagent boundary faked.

CI cannot prove a real model-produced workflow, a real DSH UI session, or that the
in-tree reproductions still match the installed DSH; re-run the audit command in
`docs/knowledge/PRE-STEP-COMPOSITION.md` after a DSH upgrade.
Those must be run locally with a real DSH profile and are recorded separately
as local runtime evidence.

For the delivery path there is one local check worth running after any change to
`answerStrategy`, the gate, or the DSH version:

```bash
npm run build
E2E_MODEL_PATCH=scripts/e2e-model-patch.yml scripts/e2e-headless-in-turn.sh
```

It boots one real `dsh headless` turn with this plugin overlaid by file URL (nothing is
installed into a profile) and fails unless the validated report actually reaches the user
in that single turn. The `in-turn` timing itself needs no model and is covered in CI by
the `in-turn delivery` suite in `test/gate.spec.ts`.

Two variants are worth knowing:

```bash
# a message the gate refuses on purpose must be refused OUT LOUD, with no run
E2E_EXPECT=refusal E2E_PROMPT="$(cat /tmp/over-32000-chars.txt)" \
  E2E_MODEL_PATCH=scripts/e2e-model-patch.yml scripts/e2e-headless-in-turn.sh
```

`E2E_EXPECT=refusal` inverts the assertion: the refusal text (and its reason) must appear,
and no `Grok workflow:` status line and no task lines may appear — the user sees why nothing
ran instead of a silent no-op (V-2). The positive run is also the check that the real Loader
hands `.volatile()` configuration over as holders and the plugin unwraps them (DESIGN E-40).

## Checkpoint and resume (record + re-drive policy)

Status (since **0.8.0**): `src/checkpoint/` (schema, atomic writer,
engine wiring) and `src/resume/` (validator, restore policy) ship since **0.8.0** and are
exercised by `test/checkpoint-schema.spec.ts`, `test/checkpoint-wiring.spec.ts` and
`test/resume-validator.spec.ts`. The wiring *is* called: `src/run.ts` creates one recorder per
run, adopts it with the engine's run object and finalises it on the terminal path,
while `disposeActiveState` writes one `cancelled`
checkpoint per live run before it aborts. No user-visible surface changed — a run gains a JSON file on disk and, on
failure, a warning line. This section is the contract the code implements.

Boundary (D-013, measured on DSH **0.2.1-rc.2**; the install, activation and settings
projection of this bundle were re-verified on **0.2.2-rc.3** in RSI round 8, which did *not*
re-measure this journaling boundary): `resume` never means engine-level resume — the shipped
engine journals nothing and states it as a limitation. `resumeDecision` answers a host
question ("should a new run re-drive the unfinished tasks from this file?") and has had no
production caller since **0.8.0** (as of **0.11.9** `src/resume/` is imported only by tests).
Recording never terminates a run: recording is best-effort and unload-bounded, and a refused
disk costs a warning line, never the report. There is no Command Watchdog and no Host Evidence
Collector as of **0.11.9** (NOT_DONE, no implementation in the tree) — those names must not
appear as shipped features in release notes.

### Location / 位置

- The writer never chooses a directory: `writeCheckpoint(filePath, input)` takes the final
  path from the caller and creates the parent directories (`src/checkpoint/writer.ts:71`).
- Filename policy is `checkpointFileName(runId)`: `checkpoint-<runId>.json`, every character
  outside `[A-Za-z0-9._-]` replaced by `_`, truncated to `CHECKPOINT_LIMITS.idChars` (120),
  and the degenerate `''` / `.` / `..` cases folded to `checkpoint-run.json`
  (`src/checkpoint/writer.ts:59`). Filename derivation is total: any run id yields exactly
  one safe name.
- Default directory (wiring): `checkpointDir()` resolves an explicit `options.dir`, then
  `GROK_WORKFLOW_CHECKPOINT_DIR`, then `$DSH_HOME` (else `~/.dsh`) +
  `checkpoints/grok-workflow` (`src/checkpoint/wiring.ts:125`), and `checkpointFile(runId)`
  joins that with `checkpointFileName(runId)` (`:135`). The three-step shape is deliberately
  the one the incremental memory archive already uses (`src/memory/archive.ts:141`). There is
  **no setting** for it: the path is host state, not a display preference, so no configuration
  key selects a policy — an integration that wants a different directory passes `dir` (or the
  environment variable) at the call site.

### Version policy / 版本策略

Two independent versions, each refused rather than migrated:

- run document: `CHECKPOINT_VERSION = 'grok-workflow.checkpoint/v1'`
  (`src/checkpoint/schema.ts:46`);
- restore document: `RESUME_CHECKPOINT_VERSION = 1` with envelope kind
  `grok-workflow.resume-checkpoint` (`src/resume/validator.ts:28`).

The validator accepts exactly the version it was built with; anything else is
`version-mismatch` and restore is denied (`src/resume/validator.ts:208`). There is no
migration path and no "best effort" read: a checkpoint written by a newer build is refused
by an older one, by design. Bumping either number is a new document kind, not an in-place
edit.

### Limits / 上限

Bounded at write time and re-checked at read time (`src/checkpoint/schema.ts:53`):

| Bound | Value |
|---|---|
| whole file (writer **and** reader) | 1,048,576 B |
| plan / task rows | 128 |
| agent rows | 512 |
| stage rows | 16 |
| evidence rows | 1,024 |
| recorded attempts per task | 0–16 |
| objective / min-context objective | 4,000 chars |
| task title, acceptance criterion | 600 chars |
| error / failure reason, evidence claim | 1,000 chars |
| evidence locator | 400 chars |
| min-context digest | 12,000 chars (64 rows per section) |
| run id, session id | 120 chars |
| route label, branch name | 200 chars |
| declared write paths per task | 16 items × 300 chars |
| structural numbers (counts, timeouts) | 1,000,000 |

Overflow is handled three ways and they must not be confused: free **text** is truncated
with an explicit ellipsis marker (so the file is always writable), a **count** above a
ceiling is a hard `invalid` refusal, and a **whole file** above 1 MiB is `too-large` in both
directions — the writer refuses before touching the disk and the reader `stat`s first, so a
hostile or torn file is never parsed (`src/checkpoint/writer.ts:75`, `:132`).

Limits *observed in a run* are recorded, not policed: the schema stores whatever `limits`
the run actually used, and `limitContractViolations` only reports `maxConcurrency > 6` /
`maxRetries > 3` against the AGENTS.md envelope (`src/checkpoint/schema.ts:105`, `:845`).
The configuration now matches that envelope exactly — defaults `maxConcurrency: 3` /
`maxRetries: 1`, hard caps `6` / `3` (`src/config.ts:22`) — so a checkpoint of a default
run records no violation. The former wider defaults (`4` / `2`, caps `1_000_000` / `10`)
are why the read side stays lenient: a file written by an older build must still load,
and `limitContractViolations` is how a caller reports one that is out of envelope.

Two ceilings, deliberately different: `countCeiling` (1,000,000) bounds structural counts,
while `msCeiling` (604,800,000 = 7 days) bounds durations and timeouts so that any
`HARD_LIMITS.timeoutMs` the plugin accepts stays recordable (`src/checkpoint/schema.ts:95`,
`:101`; `src/config.ts:14`). A byte count is neither of those: `integrity.bytes` describes a
payload the *writer* already accepted, so both sides bound it by `maxBytes`
(`src/checkpoint/schema.ts:859`). The read side used `countCeiling` there until round 27, which
refused every legal payload between 1,000,000 and 1,048,576 bytes — sealed and written fine,
then read back as `invalid`. The wiring adds a second rule on top of that: a deadline above the
recording ceiling is **omitted, never clamped** — `deadlineMs: 1000000` for a week-long run
would be a number describing no real bound — and the same value gates `time.deadlineAtMs` and
the derived `watchdog.deadlineHit` (`src/checkpoint/wiring.ts:455`).

Wiring's own bounds are about *rate* and *retention*, never content
(`src/checkpoint/wiring.ts:76`): a periodic rewrite every 1–300 s (default 30 s, timer
`unref()`ed so a checkpoint never keeps the process alive), at most 3 consecutive failed
writes before that run's recorder stops retrying, at most 4 remembered run ids per recorder,
and a 3 s bound on the unload write (an abandoned write is dropped, never retried).

Cleanup may never mask the coded refusal: both `catch` blocks in `writeCheckpoint` swallow a
failing `rm` (`src/checkpoint/writer.ts:91`, `:97`), so a caller that hits a bad path receives
`CheckpointError('io')` rather than a raw filesystem error. That property regressed once during
this round (a bare `rm` replaced the coded error on the `ENOTDIR` path) and is now pinned by
`test/checkpoint-schema.spec.ts` — see `docs/knowledge/VALIDATION.md` Round 38.

### Refusals / 拒绝语义

Run-document side — `CheckpointError.reason` is exactly one of
`invalid | too-large | integrity | io` (`src/checkpoint/schema.ts:296`):

- `invalid` — the object does not satisfy the schema (missing section, wrong type,
  `plan.taskCount` ≠ `plan.tasks.length`, count above a ceiling).
- `too-large` — the canonical payload or the file on disk exceeds 1 MiB.
- `integrity` — the recomputed sha-256 over the canonical payload (or its byte count) does
  not match the stored `integrity` record: the bytes were modified or torn after sealing.
- `io` — stat/read/write/rename failed, or the path is not a regular file.

Restore-document side — `RefusalReason` is exactly one of
`version-mismatch | corruption | conflict` (`src/resume/validator.ts:50`):

- `corruption` — unparsable JSON, wrong `kind`, missing or invalid digest, malformed record,
  bad field type, or a digest that no longer matches the body.
- `version-mismatch` — sealed with a format version this build does not restore.
- `conflict` — structurally intact and correctly sealed, yet its claims contradict the
  restore contract: unknown task status, duplicate task id, duplicate seq, or a `runId`
  other than the one the caller pinned.

Both sides fail closed: `evaluateResumeCheckpoint` refuses with the validator's reason and
never returns a plan (`src/resume/policy.ts:168`), so corruption, a foreign version, or a
wrong run can never trigger an automatic restore.

Recording never fails a run. Every write goes through `writeCheckpoint`, and a refusal
(`invalid` / `too-large` / `integrity` / `io`) is counted and logged as a warning, never
propagated into the work being recorded; after 3 consecutive failures the recorder stops
retrying that run, so a read-only or full disk costs one warning rather than one per tick
(`src/checkpoint/wiring.ts:47`, `:754`). The unload path bounds itself to 3 s and logs
`checkpoint unload hook failed: …` instead of blocking disposal (`src/run.ts:309`).

Retention is the other half of that policy: exactly five journaled states are retained —
`completed`, `interrupted`, `failed`, `gated`, `evidence-incomplete` — with their outputs,
files and evidence carried over verbatim, while a bare `success` mark is **never** retained
because a self-report is not verification; that task goes back to the planner
(`src/resume/policy.ts:35`, `:95`). Restore therefore never re-runs completed work and never
discards what an interrupted attempt already produced.

### What the user sees / 用户可见面

Since **0.8.0**: a run writes `checkpoint-<runId>.json` under
`~/.dsh/checkpoints/grok-workflow` (or `$DSH_HOME` / `GROK_WORKFLOW_CHECKPOINT_DIR`) — one file
rewritten every 30 s, a terminal one at the end, and one `cancelled` shape on plugin unload.
There is **no restore UI, no resume button, no setting** and no line in a normal report: the
only trace a user could notice is a `logger.warn` line when a write fails. `resumeDecision`
answers a *host* question — "should a new run start from this file, and with which unfinished
tasks?" — in a reason string, and never claims engine-level resume: the shipped engine
journals nothing (stated limitation), so `resume` here means starting a new run that
re-drives the unfinished tasks from the recorded context. Two consequences belong in the same breath, because they are what a reader
will actually meet: **nothing prunes the directory** (one file per run id, rewritten in place
while the run lives, never deleted — the cost of retention is the user's disk), and **nothing
consumes the files** (`resumeDecision` has no production caller; `src/resume/` is imported only
by tests). The UX commitments an integration inherits:

1. A refused restore is spoken out loud with its reason and detail — the same rule the gate
   already follows for refused messages (see `## Mandatory entry (the gate)`). Silence is not
   an acceptable outcome for "we found a checkpoint but would not use it".
2. Restore is never silent or automatic: a *plan* is the only thing the policy produces, and
   it names each task's action (`retain` / `redrive` / `reverify` / `replan`), so a reader can
   see what would be kept and what would run again.
3. The `detail` strings are written to be shown to a human verbatim (they name the offending
   field and value), so the failure path needs no separate copy.
4. Checkpoints hold no secrets: every free-text field is redacted at build time through
   `src/redact.ts` (`src/checkpoint/schema.ts:33`), which is also what makes a checkpoint
   safe to attach to an Issue.

## Credential redaction (`src/redact.ts`)

One ordered rule table, applied to every model-facing report, diagnostic, checkpoint field,
and prompt-side worker output. `src/script.ts` renders the same table into the workflow
script (`redactionRulesSource`), so a rule added here protects both boundaries; the parity
test compares the two implementations over one corpus.

Covered shapes, in table order:

1. `PRIVATE KEY` blocks — PEM and PGP armor (`BEGIN PGP PRIVATE KEY BLOCK`, plus the legacy
   `SECRET KEY BLOCK` spelling) — replaced whole. The same block also when it is itself base64: a
   `base64 -w0`'d key file, or one sitting in a JSON field or a larger blob, carries no banner
   until it is decoded, so the rule matches either banner's *encoded* form at all three base64
   group alignments and replaces the whole blob. The PGP match reaches byte 17 of the banner,
   where `PRI`/`SEC` diverge from `PUB`, so a base64 public key is not caught by accident.
2. Provider tokens by prefix: JWT, `sk-`/`rk-`/`pk-`, `ghp_`/`github_pat_`, `glpat-`, `npm_`,
   `xox*`, `AKIA`/`ASIA`, `AIza`, `ya29.`, Telegram bot tokens, Slack webhooks.
3. `Cookie` / `Set-Cookie` header values — including the form written inside a quoted shell
   argument (`curl -H 'Cookie: …'`), where the header is not at the start of a line. The value
   stops at the closing quote so the rest of the command survives.
4. `Bearer` and `Basic` authorization, header or JSON form.
5. URL-borne credentials: `userinfo` in any scheme, and signature query parameters — `sig`,
   `signature`, `sharedaccesssignature`, `X-Amz-Signature`, `X-Goog-Signature`, `auth` — plus
   the `token`/`key`/`secret` query family. The signature alone grants access, so a presigned
   URL is a bearer credential.
6. Secret-named assignments (`token`, `password`, `SECRET_KEY`, `client_secret`, …) in JSON,
   env and quoted form. By name in `redactDeep`, whose key normalisation treats `x-api-key`
   and `accessToken` alike.

Two deliberate asymmetries:

- **Under-redaction is a leak, over-redaction is noise.** A value that continues into a call
  (`refreshToken()`), a comparison (`password == null`) or a code keyword (`await`) is not
  redacted at all: rewriting source costs more than the missed shape, because the rewrite is
  itself reported as fact.
- **A value ends at a token boundary** — whitespace, end of line, or one of `,;}&|<>})]`. An
  unterminated value used to swallow `;user=app` and `Path=/` from the same line.

Known gaps, and the rule behind each:

- **Footer bytes.** A wrapped base64 block is consumed line by line while a line is at least
  eight characters long, so a final line shorter than that — the end of the encoding, i.e. the
  armor's footer — survives: at most seven characters, five decoded bytes, and nothing decodable
  on its own, because the material it belongs to is gone. The threshold is the continuation
  floor, not a separate constant: one character more is a continuation line and is consumed
  with the block (`src/redact.ts` `BASE64_CONTINUATION`; pinned by `test/redact.spec.ts`
  "keeps exactly one footer line", both sides of 7/8).
- **Folds below that floor.** A blob folded to 1–7 columns has no line long enough to be a
  continuation line, so it is consumed as a *run*: two or more consecutive lines that are only
  base64 characters are read as one narrow fold. That is the shape a fold leaves, and it is
  also the only reading under which such a block is covered at all — before this rule a
  seven-column fold kept 244 of its 272 encoded characters, which decoded back to the banner and
  the key body (`docs/knowledge/RESEARCH.md` A41).
  The cost is stated rather than hidden: two consecutive one-word lines directly after a matched
  encoded banner are consumed with it, where a single one is not. What can remain of a
  sub-floor fold is at most its first line (≤4 characters, because the match starts where the
  banner's own base64 alignment starts), never the block.
- **Public material by design.** base64 `CERTIFICATE` blocks and base64 `PGP PUBLIC KEY BLOCK`
  blocks are left alone: the encoded windows reach byte 17 of the banner, where `PRI`/`SEC`
  separate from `PUB` (`D-086`), so a public blob cannot be caught by accident and a private one
  is not missed for it.
- No list of shapes is complete. Redaction is a safety net, not a guarantee (see the README
  security section).

## Known architecture limits (MVP)

- No pause/resume, journaling, or cross-process resume. Checkpoints are written (see above),
  but the engine journals nothing: `resumeDecision` is a host-side decision over a file, not an
  engine restart, and no code path re-enters a run from one.
- No background job mode; the tool runs in the foreground and uses `exec.signal`.
- Model routing is **script-level (L1) only**: each call passes
  `{ provider, model }` from the role's chain, but the plugin does not register
  `agent/request`/`agent/request-error` consumers, so host-level (L2) rerouting
  and any interaction with `dsh-llm-retry` stay out of scope (decision U-2).
- No dependency graph between tasks; tasks are independent by design.
- Verification is independent-agent plus evidence validation, not a formal
  proof of correctness.
- All child agents in one workflow share the DSH session `cwd`. Parallel
  workers/verifiers are not filesystem-isolated; concurrent writers can
  clobber each other and a verifier can see another task's partial state.
  Declaration-driven mitigation exists (`writesPaths`, DESIGN DD-8a): tasks whose
  declared paths overlap are serialized. It is a mitigation, not a sandbox —
  a task that writes outside its declaration is invisible to the scheduler, so
  keep write scopes disjoint or set `maxConcurrency: 1` for write-heavy work.
