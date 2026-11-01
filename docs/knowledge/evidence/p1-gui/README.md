# p1-gui — real DSH GUI evidence for Issue #22 Phase 1

This directory is **GUI evidence from a real DSH web instance**, not unit tests.
Every screenshot is a browser capture of `dsh web` serving *this branch's build*
(`lib/`), driven by `gui.mjs` with Playwright and a model that really answered.

Owner: Phase 1 (P0-1 … P0-4). Nothing here overrides the automated suites; both
kinds of evidence are listed separately in the PR.

## 0. Instance and isolation

| Item | Value |
|---|---|
| Host / port | `127.0.0.1:3111` (evidence run), `127.0.0.1:3112` (P0-3 probe) |
| `DSH_HOME` | `<worktree>/.dsh-home` (throwaway; deleted with the worktree, ignored by git) |
| Profile | `phase1-gui`, booted from the shipped `web` template, plugin linked to this worktree |
| Plugin build | `npm run build` output of this branch (`lib/gate.js`, `lib/run.js`, `lib/triage.js`, …) |
| Session workspace | `<worktree>/.dsh-home/workspace` — **throwaway, not a user project** (TESTING.md rule 1); the quick worker itself names this path in `p02sim.log.txt` |
| Model | `bifrost-completions` / `wb/cn:deepseek-v4.1-flash` via `apiKeyEnv: BIFROST_VIRTUAL_KEY` (key stays in the environment, never on disk or in a screenshot) |

The live instance on `:3090` was **not** touched: it answers `401` without the
token printed by its own `dsh web` and `docs/knowledge/DECISIONS.md` (D-013
Decision 1) forbids restarting or reconfiguring it. Instead a second, isolated
instance was booted from this branch, which is what the acceptance criterion asks
for ("以本分支构建产物加载插件").

Reproduce:

```bash
cd <worktree>
npm run build
DSH_HOME=$PWD/.dsh-home dsh --profile phase1-gui --port 3111 --host 127.0.0.1 --no-open
# copy the printed http://127.0.0.1:3111/?token=… into DSH_URL
DSH_URL='http://127.0.0.1:3111/?token=…' node docs/knowledge/evidence/p1-gui/gui.mjs p01
DSH_URL='…' node docs/knowledge/evidence/p1-gui/gui.mjs p02sim
DSH_URL='…' node docs/knowledge/evidence/p1-gui/gui.mjs p02team
DSH_URL='http://127.0.0.1:3112/?token=…' node docs/knowledge/evidence/p1-gui/gui.mjs p03
```

The access token is read from `DSH_URL` on purpose and is never written into the
repository. `gui-profile.patch.yml` is the profile layer used for `:3111`;
`p03-probe.patch.yml` is the `--patch` overlay used for `:3112`.

## 1. P0-1 — the user's own message is in the transcript (`01`, `02`)

`p01.log.txt`:

```
REPORT_SEEN=true
ORIGINAL_IN_TRANSCRIPT=true
REPORT_IN_TRANSCRIPT=true
AFTER_RELOAD_ORIGINAL=true
AFTER_RELOAD_REPORT=true
AFTER_RELOAD_OCCURRENCES=1
```

`01-p01-before-reload.png` — the session shows `用一句话解释什么是二分查找` as the
user's message at 13:50, then the workflow report (`档位：快手档 …`), i.e. the report
*follows* the original message instead of replacing it.
`02-p01-after-reload.png` — after a full page reload and reopening the same session
from the sidebar, the same two things are still there, in the same order, and the
user's sentence occurs exactly once (the transcript was re-read from the persisted
session, not from page memory).

## 2. P0-2 — the confirmation keeps the original request (`03`, `04`, `05`)

`p02sim.log.txt` — vague message `把这个改一下`, then the front desk asks:

```
<<<GROK-WORKFLOW-REPORT>>> 档位：确认档 — 因为：信号互相矛盾或线索不足，前台不猜。
这个要动用团队吗？可回复：简单 / 团队。 <<<END-GROK-WORKFLOW-REPORT>>>
```

(`03-p02-question.png`). The user answers `简单`; the quick tier answers:

```
档位：快手档 — 因为：你刚才回答「简单」，按你的选择走快手档。
当前工作区 …/.dsh-home/workspace 是空目录 …
本会话没有带上「这个」所指的代码、文件或上下文；「简单模式」只是对上一个确认档
问题的回答，不是新的任务目标。
```

(`04-p02-simple-answer.png`). That is the P0-2 property seen from the outside: the
quick worker received the **original request** *and* the choice, and it states that
the choice word is not the goal.

`p02team.log.txt` — the same vague message answered with `团队` starts the team
(`05-p02-team-running.png`: `grok-workflow 2 members / Plan Completed 1 / Execute
Running 1 / grok-worker-pin-change-target-a1`), so the team tier also ran against
the remembered request rather than against the word `团队`.

## 3. P0-4 — stopping a run leaves a real terminal (`06`, `07`)

Pressing the composer's stop control (`Stop generating`, clicked once, logged as
`STOP_BUTTONS=1 CLICKED_STOP` in `p02team.log.txt`) ends the turn and the transcript
gains a visible terminal:

```
Stopped
运行已取消（cancelled）：这条消息没有完成，也没有可交付的结果。
已完成的部分保留，未完成的部分不再继续；要接着做，请把任务重新发一次。
```

`06-p04-cancelled.png` is that screen; `07-p04-cancelled-after-reload.png` shows it
survives a reload (`RELOAD_HAS_ORIGINAL=true`, `RELOAD_HAS_CANCEL=true`), with the
user's `把这个改一下` still above it.

**This is where the GUI run found a real defect that the unit suites had missed.**
Before the fix in this branch (`src/gate.ts`, `commitCancelled`, commit "…"), the
same click produced a session with **no `user/message` event at all** and no reason
for the stop: the in-turn path had already taken the batch out of the inbox
(`inbox.claim`), returned `reject` on abort, and never committed anything. Session
`session-919f1a63-…` of the first probe run is that evidence:

```
agent/inbox/spliced  inserted  [在 NOTES.md 里写三行待办…]
agent/inbox/spliced  removed=1 []
tool-workflow/run-start / agent-start ×3 / agent-end cancelled / run-end cancelled
turn/end {"kind":"aborted","reason":{"kind":"user"}}
```

— no `user/message`, no report. The fix commits the claimed batch plus one
assistant message with `cancelledText(...)` on both abort paths, and the two new
cases in `test/phase1-dialogue.spec.ts` ("P0-4: a cancelled turn keeps the message
and states the terminal") pin it.

## 4. P0-3 — an internal error is visible, never a fake success (`08`)

`p03.log.txt` (instance `:3112`, `p03-probe.patch.yml`): the workflow roles point at a
provider whose endpoint is dead (`probe-broken`), while the assistant's own model
still works, so the failure happens **inside the plugin** rather than at a policy
boundary. Result:

```
TERMINAL_SEEN=true
HAS_ORIGINAL=true
HAS_SUCCESS_WORDING=false
```

`08-p03-error-terminal.png` shows the user message, then `Incomplete:` with the
measured reason and the route table
(`planner=probe-broken/…; worker=probe-broken/…`), and `Engine error: WorkflowError:
…`, inside the report markers. No `已开启` / `已关闭` / `COMPLETED` appears
(`HAS_SUCCESS_WORDING=false`). Note the honest detail: the engine surfaced the first
failure as a JSON-materialisation `WorkflowError` rather than the raw connection
error — that is the message the user actually saw, so it is the one recorded here.

## 5. What this directory is *not*

* Not a substitute for the automated suites — those are listed separately in the PR.
* Not a run on the live `:3090` profile (see §0).
* The screenshots are full-page-less viewport captures of the real browser; no
  pixel was produced by a test double.
