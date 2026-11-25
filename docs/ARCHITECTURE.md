# Architecture

## Goal

`dsh-grok-workflow` adds one thing to DSH, using only documented capabilities:
a model-facing tool, `grok_workflow`, that turns a complex objective into a
bounded, verifiable multi-subagent workflow, plus a block intake that lets the
model commission that work in reviewed pieces. It does not implement a new agent
loop, model adapter, sandbox, or subagent runtime, and since M3.3 it no longer
puts anything in front of a user message: the entry gate that used to intercept
every message was deleted with the front desk it belonged to.

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

## Report view: answer by default, full record on demand

`renderReport` (`src/report.ts`) renders the concise, reader-facing view. The
complete machine record lives in the validated report object itself; the display
layer prints all of it only when asked.

- **One module, one entry point.** `renderAuditTrail(report)`
  (`src/report-audit.ts`) is the only renderer of the full record: plan
  provenance and splits, the wave partition, the boundary ledger, limits and all
  five chains, every recorded child call, synthesis (mode, summary, error,
  review), stop cause and guard settlement, then per task every attempt with its
  executor payload (deliverables, evidence, tests, files, uncertainties) and its
  verifier payload (criteria, checked evidence, commands, issues), and finally
  dead routes, confirmed evidence, incomplete items, errors and uncertainties.
- **Attached, not duplicated.** `renderReport(report, { auditTrail: true })`
  appends that text as the report's tail, after the guard line; the tool entry
  (`src/index.ts`) asks for it exactly when `report.status !== 'completed'`, so a
  completed run's text is byte-identical to what it always was.
- **Two independent bounds.** The answer keeps `MAX_RENDER_CHARS`; the trail
  keeps `AUDIT_MAX_CHARS` and, when it fires, ends with a line naming the bound
  and pointing at the structured result instead of cutting silently.
- **Pure read.** Rendering never mutates the record and never writes a second
  copy: the structured result stays canonical (see D-132).
- **Carry-over safe by shape.** The trail never emits a line matching the
  prefixes `src/carryover.ts` parses (`Grok workflow: …`, `Objective:`,
  `Confirmed evidence:`, `Incomplete:`, `Uncertainties:`, `Final answer:`, and
  `- id: status (N attempts) — title`), so appending it cannot fabricate a
  section or a task row in the cross-round digest.
- **The report envelope is history, not a protocol.** The
  `<<<GROK-WORKFLOW-REPORT>>>` markers this pipeline once wrapped the answer in
  have no producer in the current build; `parseReportRound` reads sections by
  their signatures (the prefixes above), and `test/carryover.spec.ts` keeps a
  literal envelope case, so tolerance for one stays pinned without a constant.

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
activates normally (tool, intake and settings surface all start) and carries
`synthesisRepaired: true`, which `describeResolvedConfig()` renders as
`synthesis=<mode> (repaired)` so the load log is self-proving. The same
fallback runs on every later `readConfig()`, so a bad settings save repairs
the same way.

Everything else is **irrecoverable** and still fails hard at load (R-06):
unknown keys (including misspellings, with a closest-key suggestion),
`configVersion` out of range, out-of-range numbers, malformed/duplicated/over-long chains,
unknown providers, models the provider enumerates but does not declare,
and budget-backstop violations. R-06 no longer covers a **removed** key: see
D-155 below. The settings page
mirrors the recoverable pair client-side (`src/client/index.js` `validate()`):
chain non-empty + deterministic, or `model` + empty chain, is a red
`error.synthesisChainUnused` / `error.synthesisChainMissing` finding (both
languages) that disables Save; only a legal combination may be written.

### Removed keys are ignored and named, not fatal (D-155)

A key in `REMOVED_CONFIG_KEYS` (twenty-five: the T4 slim-down's twenty-three plus
`mode` and `legacyGate` from M3.3) is **not** a load failure any more. The row
activates, the stored value reaches nothing, and the leftover is named twice:

| Half | Where | What a reader sees |
|---|---|---|
| Load log | `assertKnownKeys()` records the key in a module buffer; `apply()`'s `readConfig()` drains it through `takeRemovedKeys()` and logs `removedKeyWarning(key)` once per key per load | `configuration key "mode" was removed in an earlier release: its stored value is ignored, and the rest of the row loads normally (delete that line when convenient).` |
| Settings page | `GET /grok-workflow/config-notices` (`src/config-notices-surface.ts`, read-only, registered in `child.effect`, absent without a `webServer`) answers `{ok:true,notices:[{key,message}]}` from the same per-load set — read, never drained, so the log's one-line-per-key announcement is untouched. `src/client/index.js` reads it once on mount and renders one line per leftover key in a `data-warn="removed"` banner; an empty list or a failed request renders nothing | `warn.removed.title` / `warn.removed.detail`, both languages, key named in the sentence |

The page cannot read this from the settings document: `settings/describe` publishes `user` **projected through the namespace's schema** (`projectForm` walks the schema's `dict`), and a removed key is by definition not in that schema — a `entry.user` scan is correct code over data that never exists. The plugin is the only party that still sees the leftover (in the raw config the Host hands `apply()`), which is why the list travels over its own route, the same mechanism `src/mode-surface.ts` and `src/update-surface.ts` use.

Mechanism notes, because both halves have a trap:

- **Record, then announce.** The check runs inside `resolveConfig`, which the host
  may reach before `apply()` and which has no logger; a read happens per message.
  So the buffer is the announcement channel (same shape as the limit-overrun
  buffer, B04), and `apply()` keeps a per-load `Set` so a patch that keeps the line
  warns once, not once per message. `resolveConfig`'s result carries nothing for a
  removed key: `resolveConfig({ mode: 'triage' })` deep-equals `resolveConfig({})`.
- **The page cannot import the list.** `src/client/index.js` is a browser bundle
  served verbatim, so it ships `GROK_WORKFLOW_REMOVED_KEYS`; `test/client.spec.ts`
  pins it equal to `REMOVED_CONFIG_KEYS` in both directions.

Nothing else about R-06 moved: a key this build never knew still fails the load
with `unknown configuration key "…" (did you mean "…"?)`, and the nested levels
(`roles.<unknown>`, `roles.<role>[i].<wrong field>`, `guardianModel.<wrong field>`)
still throw with their full path. A removed key written *inside* a route object is
a nested unknown and still throws.

## Message entry (the front desk was deleted in M3.3)

Status (since **0.13.35**): the `agent/pre-step` chain carries no admission decision at all.
The old front desk is gone — `src/gate.ts` with its classifier, plus `src/triage.ts`,
`src/captain.ts`, `src/channel.ts` and `src/history.ts` — and with it the two configuration
keys that used to select its shape, `mode` and `legacyGate` (both are now removed keys).

What a user message meets on that chain:

- **the narrow heartbeat listener** (`src/heartbeat-listen.ts`): it acts only on a
  `source.kind === 'schedule'` delivery that also carries the Loop marker, and every other
  batch goes straight to `next()`;
- **the intake's own observer** (`installHeartbeatBrakes`), which records a beat *after* the
  decision and never changes it.

So a user message is never claimed, refused, shortened, annotated or routed: it reaches the
model exactly as the loop claimed it. The gate's over-long and empty-text refusals went with
it, and the 32,000-character bound now applies only where work is actually commissioned. The
pass-through is pinned as bytes: `test/block-flag-baseline.spec.ts` dumps the decision for
eight payload shapes from a default load, including a 32,001-character prompt that must arrive
unchanged and with no notice appended.

A workflow starts only from an explicit `grok_workflow` call (the model's, or the intake's).
That is the whole entry surface.

### Objective length boundary

The objective limit is defined once as `TASK_LIMITS.objectiveChars` (`32_000`)
in `src/input.ts`, mirrored by the generated script in `src/script.ts`, and
enforced on the two paths that commission work: the direct `grok_workflow` tool
call (`src/index.ts`) and the fallback plan the script builds when planning
fails.

| Objective length | Direct tool call | Result |
|---|---|---|
| 4,000 characters | accept | run starts; the objective is kept whole |
| 4,001 characters | accept | run starts; the objective is kept whole |
| 32,000 characters | accept | run starts; the objective is exactly 32,000 characters |
| 32,001 characters | reject | no run starts; the refusal names the 32,000-character limit |

Every length from 4,001 through 32,000 characters is accepted; 32,001 is the
first rejected length. A user *message* of any length is still delivered to the
model untouched — the bound is on the objective a run is given, not on what a
person may type.

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

## Block intake (接单台子)

`src/block/` and `src/supervisor/` implement an optional intake desk: one user-approved split
of an objective into 1–3 blocks, a ledger recording what was approved and what was judged,
and a narrow observer for the one clock a block has. It is on by default since M3.3
(`blockIntake: true`); `false` is the opt-out. It claims no message: the intake desk is a set
of tools the model calls, so no message is claimed, no run starts by itself, and no delivery
decision changes because this feature exists.

### Location

One directory, three append-only files, resolved by the same three-step rule as the task
board and the checkpoint recorder (explicit `dir` → `GROK_WORKFLOW_BLOCK_LEDGER_DIR` →
`$DSH_HOME`, else `~/.dsh`, + `taskboards/grok-workflow`):

| file | one line is | written by |
| --- | --- | --- |
| `blocks.jsonl` | one **version** of one intake row | `appendBlockRow` only |
| `verdicts.jsonl` | one supervisor verdict | `appendVerdictRow` only |
| `heartbeats.jsonl` | one observed heartbeat | the `agent/pre-step` observer only |

Nothing rewrites a line. A row that changes is appended again with `version + 1`, and the
earlier versions stay byte-identical, so "who accepted what, when" survives every restart.
The writer owns the version (`previous + 1`) and refuses a caller that reports any other
number, which is what makes the 20-version cap a checkable bound instead of a convention.
Each file is written through the task board's recipe — current body plus the new line into a
hidden `*.tmp`, `fsync`, then `rename` — so a reader never sees a half-written file.

### Row shape

A `blocks.jsonl` line carries `v: 1`, a random row `id`, `sessionId`, `objective`,
`splitHash`, `approval` (`kind`, verbatim `quote`, `at`, optional `sourceMessageId`),
`blocks[]`, optional `verify`, `version`, `createdAt`, `updatedAt` and `rowHash`. Each block
holds `id` (`blk-1`.., unique inside the row only), `title`, `objective`, `deliverable`,
`acceptance[]`, `writesPaths[]`, `dependsOn[]` (sibling titles), `execution`
(`foreman` | `workflow`), optional `owner`, `status` (`open` | `vetoed` | `accepted`),
`tasks[]`, and the `planId` / `runId` / `checkpoint` ids the caller reported.

`splitHash` is the sha-256 of the canonical JSON of the **normalized** split (objective,
blocks, constraints, non-goals; trimmed text, no blank entries, write paths normalized), so
two previews of the same split hash identically and any real edit changes the hash. `verify`
is deliberately outside it: the hash answers "is this the work the user approved?", and the
supervisor switch is an execution policy. Folding it in would make "the user turned the
judge off" read as "the user changed the order", and `startBlock` would refuse a preview
nobody edited. The switch still survives on the row (`BlockRow.verify`), beside the
fingerprint rather than inside it.

`rowHash` is the sha-256 of the row's own canonical JSON without `rowHash`; the write path
validates it and the read path re-derives it, so a hand-edited or torn line is detectable.
Reads skip a bad line into `skipped` (line number, reason, first 200 characters) instead of
failing the whole ledger; writes refuse before a byte lands.

### Starting a block: idempotency first, then four checks

`grok_open_block` has two modes. `preview` is pure: it computes the text the user reads,
remembers it in memory for `previewTtlMs` (ten minutes), and writes nothing — a preview is a
question, not a decision. `start` is the only writer here, and it looks the split up by
`(sessionId, splitHash)` **before** validating anything: a split already in the ledger is
returned with `reused: true` and appends no line, so a retry after a crash, after the
preview expired, or after the plugin restarted still hands back the block that exists.

Only for a split that is new do the four checks run, in this order, because the order is the
user's story:

| # | check | refusal code |
| --- | --- | --- |
| 1 | the preview exists in this session | `not-found` |
| 2 | it has not expired | `preview-expired` |
| 3 | the submitted `splitHash` is byte-identical to the preview's | `split-changed` |
| 4 | one message after the preview contains `approval.quote` verbatim | `approval-required` |

and then `approved === true`, else `not-approval`. "You never saw this" outranks "you saw it
but it changed", which outranks "you changed it but did not say yes", so a caller that gets
`approval-required` knows the words are missing rather than that the split moved underneath
it. Check 4 reads two kinds of message as the user's own words: a typed turn, and a
question-card answer — the card only when the `ask_user_question` call it names was logged
after the preview, and then only for the labels the user picked, never the model's question
text in the same payload (`src/user-source.ts`, D-137).

### Handing in: deterministic first, the model only for judgement

`grok_close_block` runs six checks before the supervisor is asked anything
(`src/supervisor/checks.ts`), because a model asked these questions answers them plausibly
instead of correctly: every acceptance item is claimed by a task or a handoff line; the
evidence line is real text, not blanks; declared artifacts exist and their pointers parse;
every written path is inside the approved scope; `dependsOn` names a sibling that is really
accepted; and the handoff carries its four non-empty lines (做了什么 / 证据 / 没做 / 下一步 —
four lines, not four labels on one line). A failure here writes a `veto` with
`route: "deterministic"` and spends **zero** model calls.

The supervisor returns one of two outcomes — `pass` or `veto` — with per-criterion
`met`/`evidence` and named reasons. There is no third state: a judge call that cannot be
parsed after two attempts becomes a `veto` that says so, never a silent pass, and the same
evidence resubmitted returns the verdict already on file instead of writing a second line. A
veto changes nothing but the verdict row; a pass appends a new block version with the block
`accepted`.

`override` is the one human escape hatch and it covers the scope criterion only: a veto is
overridable when *every* failing reason is `范围 ⊆ 批准`, and the overruling is recorded in
the verdict row (`who`, `why`). The other five checks and a model veto are not overridable —
a person can authorise a wider scope, not make a missing file exist.

### The heartbeat observer

A block outlives a turn, and the only clock the host gives this plugin is the heartbeat
delivery it already schedules. `installHeartbeatBrakes` observes that delivery and nothing
else:

- with the switch off it registers **no listener at all** — not one that returns early — so
  the `agent/pre-step` chain is exactly the chain the profile had before the module existed;
- the handler computes the decision first (`const decision = await next()`), then records the
  observation, then returns that same object. A failure in the observation is warned about
  and swallowed, so a full disk cannot refuse a turn. Returning `undefined` from a cordis
  waterfall handler would drop the whole chain's decision, which is why the order is not
  negotiable; `test/block-flag.spec.ts` pins the decision bytes against a load that never
  heard of the key;
- it appends to `heartbeats.jsonl` only — never a verdict (a heartbeat is not a judgement),
  never a `blocks.jsonl` version (20 version slots per block, and an hourly beat would retire
  a real block), and it stops at `HEARTBEAT_OBSERVATION_LIMIT` (200 lines) with one warning;
- it is installed *after* the narrow listener, so a beat the narrow listener stopped never
  reaches it, and that is intended — a stopped beat is recorded once, by the listener that
  stopped it.

#### One brake owner, and three registrations

Since M3.2 the narrow listener, `installHeartbeatListen` (`src/heartbeat-listen.ts`), is the
only thing that decides a heartbeat's fate, and `src/index.ts` installs it **unconditionally** —
outside the `blockIntake` switch. Tying it to the intake would leave a profile with the intake
off and no brake owner at all: a loop the brakes stopped would keep running with nobody left to
stop it. The registrations, in the order they go on the chain:

| registration | installed when | decides a heartbeat? | what it writes about one |
| --- | --- | --- | --- |
| the narrow heartbeat listener | always | yes — runs `reviewHeartbeat`, charges the round, or answers `reject` | `heartbeats-listen.jsonl`: `continued`, or `stopped` + the brake code |
| the intake's own observer (`installHeartbeatBrakes`) | `blockIntake: true` (the default) | no — it observes the beat after the decision | `heartbeats.jsonl`: which blocks this beat found open |

Two listeners, and since M3.3 no third. A default load carries both; `blockIntake: false`
leaves exactly one, the narrow listener, which is why turning the intake off can never take
the brake owner with it. Two properties make that hold by construction rather than by
convention:

- **One owner, installed outermost.** The narrow listener goes in before the intake observer,
  and it answers `reject` without calling `next()`. A beat it stops therefore never reaches the
  observer, and a second review cannot charge the same round twice.
- **One definition of the review.** `isHeartbeatMessage` and `reviewHeartbeat` live in
  `src/heartbeat-listen.ts`, and nothing else on the chain reviews a beat.
- **Two files, one writer each.** `heartbeats.jsonl` answers "which blocks did this beat find
  open"; `heartbeats-listen.jsonl` answers "what did this beat do". One file would put two lines
  under one beat and make the count unanswerable, so each file has exactly one writer and neither
  writes the other's.

`observed` is the third outcome the listener used to write in M3.1, when it only watched the
front desk. It is still read — `readHeartbeatListenObservations` returns those lines, so an
existing file stays readable — and it is never written again.

### What this desk does not do

- It takes no lock. The writer is one session's tool layer and the `(session, splitHash)`
  idempotency means a retry does not append; two processes appending at the same instant
  would race, and a multi-writer deployment needs the task board's lock rather than a second
  one invented here.
- It does not run the work. `grok_accept_block` returns the split, the write scope and the
  plan id; sending a block to a dispatcher or to a workflow script is the caller's step, and the ledger
  records only the ids it was handed.
- It does not project onto the settings page. `blockIntake` is read at load time because both
  halves are registrations (six tools and one listener), and a registration cannot appear
  without a reload.

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
`answerStrategy` or the DSH version:

```bash
npm run build
E2E_MODEL_PATCH=scripts/e2e-model-patch.yml scripts/e2e-headless-in-turn.sh
```

It boots one real `dsh headless` turn with this plugin overlaid by file URL (nothing is
installed into a profile) and fails unless the validated report actually reaches the user
in that single turn. The delivery contract itself needs no model and is covered in CI by
`test/delivery.spec.ts`, `test/delivery-human-block.spec.ts` and
`test/final-answer-rewrite.spec.ts`.

The script still understands `E2E_EXPECT=refusal`, which inverted the assertion for the
gate's over-long-message refusal. Since M3.3 no message is refused, so that variant describes
a path the plugin no longer has: an over-long prompt is delivered to the model unchanged and
`E2E_EXPECT=refusal` would fail. The positive run is also the check that the real Loader hands
`.volatile()` configuration over as holders and the plugin unwraps them (DESIGN E-40).

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

1. A refused restore is spoken out loud with its reason and detail. Silence is not an
   acceptable outcome for "we found a checkpoint but would not use it".
2. Restore is never silent or automatic: a *plan* is the only thing the policy produces, and
   it names each task's action (`retain` / `redrive` / `reverify` / `replan`), so a reader can
   see what would be kept and what would run again.
3. The `detail` strings are written to be shown to a human verbatim (they name the offending
   field and value), so the failure path needs no separate copy.
4. Checkpoints hold no secrets: every free-text field is redacted at build time through
   `src/redact.ts` (`src/checkpoint/schema.ts:33`), which is also what makes a checkpoint
   safe to attach to an Issue.

## Task board (durable scheduling truth / 调度真相)

Status (since **0.13.18**): `src/taskboard/` is the durable truth layer for two-level team
management — the upper level (dispatcher/lead) creates rows with dependency wiring, workers move
them through the state machine, and the file on disk, never memory, decides who owns what. It is
additive: the main chain (plan → execute → verify → retry → synthesize) never reads the board and
is unchanged, and nothing opens a board unless a caller asks for one. The L1 dispatcher docks on it
through the `TaskReader` interface (`get`/`has`/`list`) that `board-reader.ts` adapts from a
`TaskBoard`; its session persists to the same `store.jsonl`, so there is one durable store rather
than two parallel board files (see the honest boundary below).

### Location / 位置

- One board is one directory holding exactly one store file: `store.jsonl`. Rows are one
  checksummed JSON object per line; there is no second file a reader has to know about.
- `taskboardDir()` (`src/taskboard/paths.ts`) resolves, in order: an explicit `dir` from the
  caller, `GROK_WORKFLOW_TASKBOARD_DIR`, then `$DSH_HOME` (else `~/.dsh`) +
  `taskboards/grok-workflow`. `taskboardFile()` appends `store.jsonl`, and
  `openDefaultTaskboard()` opens that location. This is deliberately the same three-step shape
  as `checkpointDir()` and `archiveDir()`, so tests and e2e lanes redirect the board without a
  configuration key and never write into a real operator home.
- The claim lock is `<dir>/.store.jsonl.lock`: created with `O_EXCL` for the duration of one
  mutation and removed afterwards. It is host state, not configuration — there is no setting for
  either path.

### Row schema v1 / 行格式

`schema = grok-workflow.taskboard/v1` (`TASKBOARD_SCHEMA`), rewritten as a whole on every
mutation. One row carries: `id` (unique on the board, enforced against the store at create
time), `title`, `status` (`pending` → `in_progress` → `completed` | `failed` | `blocked`),
`owner` (or `null`), `blocked_by` (predecessor ids), `version` (starts at 1, +1 per mutation),
`createdAt`, `updatedAt`, `detail`. `assertTaskRecord` refuses any other shape on read, and each
line carries a sha-256 over its canonical payload, so a forged or truncated row fails with
`TaskboardError('integrity')` instead of being loaded.

### Claim protocol / 认领协议

- Every mutation runs under the board lock: **re-read the store → check → apply → persist**. The
  CAS guard is therefore checked against the file, not against a stale in-memory copy. Two
  workers that both read version *n* cannot both win: one gets `version-conflict` carrying both
  versions. Claims on different rows cannot erase each other, which a whole-file rewrite without
  the lock would allow.
- `claim` moves `pending → in_progress` and assigns `owner`; it refuses while any `blocked_by`
  predecessor is missing or not `completed` (`dependency-blocked`, naming every unmet id).
  `assign` sets an owner without starting the row. `complete` requires `in_progress`.
  `failed`/`blocked` rows `requeue` to `pending` (owner cleared) and re-check dependencies on
  the next claim. A `completed` row is immutable and refuses every mutation.
- `get`/`list` serve the last loaded snapshot; a read-only observer calls `reload()` to see rows
  another handle wrote.

### Durability and crash recovery / 落盘与崩溃恢复

- Writes are atomic: the serialized board goes to a hidden `*.tmp` file in the board directory,
  is fsynced, and only then renamed over `store.jsonl`. A reader never sees a half-written store,
  and a failed write leaves the previous store intact.
- A process killed between the temp write and the rename leaves the previous store authoritative
  and one hidden temp file behind; no reader ever opens it, and it is inert forever after.
- A process killed while holding the lock leaves the lock behind. The next writer treats an
  unreleased lock older than `lockStaleMs` (default 5 s) as abandoned, removes it, and proceeds;
  a younger lock is respected and the mutation waits up to `lockTimeoutMs` (default 5 s) before
  failing with `io`. Both knobs are per-board `TaskboardOptions`, so a test can shorten them.
- A store whose line was torn by a non-atomic writer is refused (`integrity`) rather than
  silently dropping the row.

### Limits / 上限

| Bound | Value |
|---|---|
| whole store (writer **and** reader) | 1,048,576 B |
| tasks per board | 1,024 |
| task id / title / owner | 200 / 600 / 200 chars |
| dependency ids per task | 64 |
| failure/block detail | 2,000 chars |

### Proof / 证据

`test/taskboard.spec.ts` covers schema and CRUD, the full state machine, `completed`
immutability, duplicate ids, dependency gating, CAS conflicts with both versions reported, the
two-handle same-row race (exactly one winner), concurrent claims on different rows (no lost
update), restart recovery, and crash recovery: a real `node` child SIGKILLed mid-mutation
(`test/fixtures/taskboard/writer.mjs`), a worker killed while holding the lock, an abandoned lock
broken by the stale window, a fresh lock respected until the wait runs out, orphan `*.tmp` files,
a torn store, duplicate ids across a restart, and a stale CAS guard across a restart. The location
tests pin the three-step resolution and `store.jsonl` placement.

### Honest boundary / 已知边界

- Not wired: the engine does not read the board, and no run is driven from it. The L1 dispatcher
  does reach it (its session holds a `TaskBoard` through `boardReader`), so the docking is done
  for the dispatcher only; L3 and the engine remain out of scope.
- The lock is advisory within one filesystem. It does not defend against a hostile writer that
  ignores it, nor against a network filesystem whose `O_EXCL`/rename semantics differ; a
  multi-host board is out of scope.
- The post-rename directory fsync is best-effort (some platforms refuse to open a directory), so
  a power loss immediately after a successful mutation can still lose that last write.

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
