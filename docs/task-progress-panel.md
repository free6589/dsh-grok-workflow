# Task-grouped progress panel

This document covers Issue #22 **Phase 2**: how one workflow run is presented in the DSH Web
GUI's progress panel, why it looks that way, and what is deliberately *not* claimed. It also
records the feasibility check that decided P1-2 could not be implemented here.

The panel is not drawn by this plugin. It is the stock `workflow-run` chat node of
`@deepseek-ai/dsh-client-ui-workflow-run`, folding the four `tool-workflow/*` session events
this plugin already wrote before Phase 2. Everything below follows from that one fact.

## P1-1: one task is one group

A run used to be grouped by *role* — one group called `Execute`, one called `Verify` — so five
tasks and their verifiers were interleaved in two long lists. A run is now grouped by *task*:
the worker and verifier calls for a task share a group header, and the next task gets its own.

| Before | After |
| --- | --- |
| group `Execute`, rows `grok-worker-t1-a1`, `grok-worker-t2-a1` | group `任务 1 · 修复登录接口`, row `执行` |
| group `Verify`, row `grok-verifier-t1-a1` | group `任务 1 · 修复登录接口`, row `检查` |
| retry row `grok-worker-t1-a2` | row `执行（尝试 2）` |
| fallback row `grok-worker-t1-a1-r2` | row `执行` (the fallback route is in the report, never in the row) |

Rules that make the grouping usable:

- **The header is `任务 <n> · <title>`**, where `<n>` is the task's 1-based position in the plan.
  The position comes from the plan, not from the group's arrival order, so it is stable across
  renders and reloads.
- **Two tasks with the same title never merge.** The position is part of the header string, and
  the panel groups by the exact string, so `任务 1 · 修复登录` and `任务 2 · 修复登录` stay apart.
- **A long title is truncated to 24 characters plus `…`** (`TASK_TITLE_DISPLAY_LIMIT` in
  `src/naming.ts`). Only the header is shortened: `report.plan.tasks[].title` keeps the whole
  title, so the report and the answer always name the real task.
- **No machine identifiers are visible.** No `grok-` prefix, no `-a<n>` attempt suffix, no
  `-r<n>` fallback suffix, no internal task id, no child run id. They all still exist where they
  belong: `report.tasks[].id`, `report.tasks[].attempts[]`, `report.routes[].chainIndex`.
- **The attempt count is the only difference between two attempts of one task.** `执行` and
  `执行（尝试 2）` are the same task; a reader can see the retry without being told a route index.

## P1-3: the panel speaks the user's language

Every user-visible string comes from one table, `src/naming.ts`:

| Meaning | `zh` | `en` |
| --- | --- | --- |
| run title, count unknown | `任务团队` | `Task team` |
| run title, 3 tasks | `任务团队 · 3 个任务` | `Task team · 3 tasks` |
| planner row | `规划助手` | `Planner` |
| worker row | `执行` | `Execute` |
| worker row, second attempt | `执行（尝试 2）` | `Execute (attempt 2)` |
| verifier row | `检查` | `Check` |
| synthesizer row | `汇总助手` | `Summarizer` |
| task group | `任务 1 · <标题>` | `Task 1 · <title>` |
| phases | `规划` / `执行` / `检查` / `汇总` | `Plan` / `Execute` / `Verify` / `Synthesize` |
| a finished call (never a verdict) | `执行代理已结束` / `检查调用已结束` | `Execute agent ended` / `Check call ended` |
| a task verdict (report only) | `任务通过` / `任务未通过` | `Task verified` / `Task not verified` |

The table is compiled twice from the same source: the Host half is TypeScript, and
`namingSource()` emits the identical function bodies for the workflow script realm, so the panel's
words and the report's words cannot drift. `test/naming.spec.ts` renders both halves over the same
inputs and fails on any difference.

`zh` is the default. `en` is selected from the DSH locale setting (`locale` namespace, field
`preference`, read through the same settings projection the plugin already uses for its settings
page), and nothing else — there is no new configuration key and no per-run naming input. An unset
preference means "delegate to the browser", which a Host cannot observe, so it renders `zh`.

**Known limitation, by construction:** a group header and a row label are *written into the event*
when the child call starts, and the stock panel renders those strings verbatim. Changing the
language therefore affects the next run, not the run already on screen; that run cannot be
retranslated in place without a renderer of our own.

## P1-4: only facts the Host actually holds

The panel shows: the task's group header, the role of the child call, the attempt number when it
is above one, and the call's own status (`running` / `completed` / `failed` / `cancelled` /
`interrupted`, folded by the stock component from the events). The run title adds the total task
count *when the Host knows it* — a supplied plan. When the script plans first, the count does not
exist yet and the title carries no count rather than a guess.

It does **not** show a percentage, a token count, an ETA, a "files remaining" counter, or any
narrative of activity nobody measured. There is no honest source for those numbers in the current
engine, so there is no code that renders them, and `test/naming.spec.ts` asserts the copy table
contains no such vocabulary.

### A completed call is not a passed task

`agent-end: completed` means the child process finished; it says nothing about whether the work
was accepted. A verifier can finish cleanly and still reject the work. Three separate guarantees
keep that distinction intact, because a row that read as a passed task would be a promise the row
cannot keep:

1. **A row is worded as a call.** `src/naming.ts` words a finished call
   `执行代理已结束` / `检查调用已结束` (`callStateText`), and the only pass wording in the plugin is
   `任务通过` / `任务未通过` (`taskVerdictText`), which is produced from a task-level result and from
   nothing else. There is no input — no role, no attempt, no call state in either language — that
   turns a finished call into a verdict; `test/naming.spec.ts` enumerates the whole cross product
   to prove it.
2. **The run node is closed with the task-level result.** `run-end` is the one progress payload
   this plugin authors, and the stock panel turns it straight into the node's status word
   (`statusFromStopReason`, `…/dsh-client-ui-workflow-run/lib/client.js:508-514`: `completed` →
   `已完成`). A rejected run ends the *program* normally, so the engine's own stop reason is
   `completed` — forwarding it unchanged is exactly how a failed task came to read `已完成`.
   `progressStopReason()` (`src/records.ts`) therefore closes the node with the report:
   every task verified → `completed`; `partial` or `failed` → `error` (the node reads `失败`);
   no report at all → `error`; `cancelled` / `error` from the engine stay verbatim. `partial` has
   no word of its own in the stock dictionary, so it is reported as a failure: a team where one
   task failed must never read as a finished one.
3. **The two are compared, not described.** `src/panel.ts` folds the same four events with the
   same grouping rule and produces the panel a reader sees, including row wording and (only when
   the report supplies it) a per-task verdict. `panelMatchesReport()` compares the projected run
   status with the final report, and `test/panel.spec.ts` asserts the agreement for a verified run
   and for a rejected one, plus a hand-built divergence that must be detected. A mismatch fails the
   suite instead of being written down as a known issue.

`src/panel.ts` also documents, in code, the two places where it is deliberately stricter than the
stock transcription in `test/gui-fold.ts`: a settlement that arrives before its own start still
settles its row (the stock `updateAgentEnd` maps over members that already exist, so it would drop
it), and a duplicated event cannot add a row or change an outcome twice. The recorder writes one
append per engine event and preserves arrival order, so both folds agree on a real run — and the
"waiting" case needs neither: a task that has not started has **no row and no group**, because a
row there would mean inventing a subagent that does not exist.

## P1-2: task-level progress states — feasibility, and why it is not implemented

**Verdict: BLOCKED (NOT_RUN) in this engine version.** The rendering side can be extended; the
emission side cannot.

Verified against DSH **`0.2.1-rc.2`**
(`@deepseek-ai/dsh` at `~/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh/`),
all paths below relative to its nested `node_modules/@deepseek-ai/`:

1. **What the stock panel consumes.** `dsh-client-ui-workflow-run/lib/client.js` matches exactly
   four event types — `tool-workflow/run-start`, `tool-workflow/agent-start`,
   `tool-workflow/agent-end`, `tool-workflow/run-end` (match/update at lines 596-616) — and folds
   them into one node. Grouping is `workflowPhaseKey(phase)` = the *exact* `phase` string
   (lines 505-508, used at 541-548); a row is the member's raw `label` with its `outcome`
   (lines 549-558). Nothing in the component renames, re-groups by task, or accepts a task-level
   state. So the only lever a plugin has is what it puts in `label` and `phase` when it starts a
   child call — which is what P1-1 uses.
2. **What a workflow script may emit.** The script realm exposes six globals —
   `agent`, `parallel`, `pipeline`, `phase`, `log`, `args` — and nothing else
   (`dsh-workflow-ptc/lib/types/guest-source.d.ts`, `WORKFLOW_GUEST_SOURCE`;
   `runtime.ts` builds `const globals = { agent, parallel, pipeline, phase, log, args }`).
   `agent()` options are validated against
   `SUPPORTED_AGENT_OPTIONS = new Set(['label','phase','schema','provider','model'])`, and any
   other key fails the child call with `UNSUPPORTED_OPTION`. The progress batch the guest may
   send has exactly four shapes: `phase`, `log`, `agent-start`, `agent-end`. There is **no**
   channel for a task-level state, a task id, an attempt count, a verdict, or a custom node.
3. **What the plugin-side UI API offers.** A plugin *can* contribute a chat node: a
   `ConversationNodeDefinition` registered through the conversation node registries
   (`dsh-client-ui-conversation/lib/types/client/conversation/assembly.d.ts:41`,
   `…/conversation/event-registry.d.ts`, `…/conversation/definition-registry.d.ts`) with a
   keyed slot injection and a localized dictionary, and the chat renderer documents its payload
   map as the "public merge surface for Chat renderer payloads contributed by other plugins"
   (`dsh-client-ui-chat/lib/types/client/index.d.ts:31`). That is a *renderer* extension: it can
   draw whatever data it is given, but the data still has to arrive from the engine as session
   events, and the engine emits none for task progress.

**Therefore the nine states this issue asks for** (`queued`, `executing`,
`awaiting-verification`, `verifying`, `retrying`, `verified`, `failed`, `blocked`, `cancelled`,
keyed by run id + task id) **cannot be produced truthfully from the current event stream**: a
plugin could only *infer* them by guessing from `agent-start`/`agent-end` pairs, which is exactly
the kind of invented progress P1-4 forbids. No half-fabricated state machine was shipped.

### Host extension proposal (what would unblock P1-2)

Upstream, in `@deepseek-ai/dsh-workflow-ptc` + `@deepseek-ai/dsh-client-ui-workflow-run`:

1. Extend the guest progress batch with one typed event, e.g.
   `{ type: 'task-progress', taskId, phase: 'queued'|'executing'|'awaiting-verification'|'verifying'|'retrying'|'verified'|'failed'|'blocked'|'cancelled', attempt, at }`,
   and expose a matching guest global (`task(...)` / `taskProgress(...)`) validated the same way
   `agent()` options are.
2. Persist it as a session event, e.g. `tool-workflow/task-progress`, recorded by the run
   observer next to `agent-start`/`agent-end`.
3. Teach the stock fold to key groups by `taskId` (falling back to `phase`) and to render the
   task state instead of, or above, the per-call rows — plus the localized labels for those nine
   states, so no plugin has to bake copy into event payloads.

Until 1-3 exist, a custom node renderer alone would move the problem, not solve it: it would still
have to guess. This plugin's own position is unchanged: P1-1 shipped on the stock node, P1-2 is
BLOCKED on the engine, and the proposal above is the smallest change that would make it honest.

## The scenario matrix

`test/panel.spec.ts` drives the **real** engine (`test/engine-harness.ts`) into a **real**
`Session`, reads the recorded `tool-workflow/*` events back, and asserts both folds:

| Scenario | What is asserted |
| --- | --- |
| Three tasks at three stages (`maxConcurrency: 2`) | Task 1 executing, task 2 verifying, task 3 waiting: two groups in plan order, one row `执行` running and the rows `执行` ended + `检查` running, **no group and no row for the waiting task**, and a title that states the known total (`任务团队 · 3 个任务`). Then the run finishes and all three groups carry `执行`/`检查`, all ended. |
| A rejected verification that retries | One group with `执行`, `检查`, `执行（尝试 2）`, `检查（尝试 2）`; the report carries two attempts; the group verdict is `任务通过` because the *task* was finally verified, while every row still words a call. |
| Reload / replay | A JSON round trip of `session.snapshotEvents()` and a `Session.create(id, snapshot)` replay both project to the same panel as the live run, and still match the report. |
| Two concurrent runs | Interleaved events from two recorders land in two sessions; each session folds only its own rows, with its own run status, even though both runs use the same human-readable header. |
| Duplicated events | The recorder appends once per engine event; the projection is idempotent for a duplicated start or settlement, so no second row appears. |
| Out-of-order events | A settlement that arrives before its start still settles its row in the projection (and is shown to be dropped by the stock fold, which is why the recorder preserves arrival order); a settlement for a sequence that never started creates no row. |
| Cancellation | The node closes as `cancelled` and the fold reads `已取消` (also covered by `test/progress.spec.ts`). |

## Verification

- `test/naming.spec.ts` (15 tests) pins: group header format and uniqueness, identical titles not
  merged, truncation with the full title kept in the report, the role/attempt label table, the
  absence of `grok-`/`-a<n>`/`-r<n>` in any label while internal ids remain in the report, the
  `agent-end: completed` ≠ task-verified boundary with its call-vs-verdict wording, the `zh`/`en`
  tables with no Chinese in `en`, `locale.preference` handling, Host/guest copy parity, and
  grouping under the real child pool.
- `test/panel.spec.ts` (11 tests) is the scenario matrix above plus the `progressStopReason` rule
  and the panel-vs-report agreement.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run ci`, `npm run build` (with `lib/`
  committed and byte-identical on rebuild; `lib/client.js` stays byte-identical to
  `src/client/index.js`).
- **GUI screenshots: NOT_RUN.** The DSH Web GUI at `http://100.111.111.88:3090` answers
  `401 dsh web authentication required` in this environment and no launch token was available, so
  no real-GUI screenshot of the new panel exists. The unit tests above fold the recorded events
  with the same rules the stock component uses, but they are not a substitute for a screenshot and
  are not presented as one.
