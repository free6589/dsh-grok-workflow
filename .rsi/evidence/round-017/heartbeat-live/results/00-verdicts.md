# Round 17 — heartbeat live verification: verdicts

Instance: isolated DSH 0.2.2-rc.3, `DSH_HOME=.rsi/evidence/round-017/heartbeat-live/instance/dsh-home`,
profile `live-verify`, plugin built from this repository at `4db78f4` (`npm run verify:lib` →
"lib/ at 4db78f4 is the build of src/ at 4db78f4 (145 files, byte-identical)").
Only the remote model is stubbed (`127.0.0.1:3197`, see `stub/stub-llm.mjs`).
Vocabulary: CONFIRMED / HYPOTHESIS / NOT_RUN / NOT_VERIFIED / BLOCKED (AGENTS.md).

---

## Q1 — does POST /grok-workflow/loop open a loop for real?

**CONFIRMED.** `results/01-core-chain.txt` §2–§4.

- `POST /grok-workflow/loop {"action":"status",…}` → `200
  {"ok":true,"action":"status","loop":{"open":false,…}}`
- `POST /grok-workflow/loop {"action":"open","sessionId":"session-48df3c0a-…"}` → `200
  {"ok":true,"action":"open","loop":{"open":true,"taskId":"schedule-d03411f5-…",
  "taskStatus":"active","intervalMinutes":60,"rounds":10,"nextAt":"2026-11-19T02:06:59.000Z"}}`
- the row in the real Schedule catalog: `kind:"rrule"`, `title:"Loop heartbeat"`,
  `rrule:"DTSTART:20261119T020659Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=10"`,
  `target:{kind:"session",sessionId:"session-48df3c0a-…"}`
- the durable domain `instance/dsh-home/storages/schedule.json` holds that record.

The request went through the shipped browser fence (`connection.requestRejection`), the
shipped route handler (`src/loop-surface.ts`, `LOOP_ROUTE_PATH` at `src/loop.ts:70`), the
shipped service (`src/loop.ts:373 open`), and Schedule's own management API.

## Q2 — is `open` refused for an actor-carrying caller (`loop/user-only`)?

**CONFIRMED** on both non-user paths; the route is user-only by construction.

- model-facing tool: `results/01-core-chain.txt` §5 → `{"outcome":"refused",
  "code":"loop/user-only","message":"a loop heartbeat can be opened only by the user from
  the composer switch; an agent cannot open one on the user's behalf"}` — the real
  `createLoopTool` from `lib/loop-surface.js` (`src/loop-surface.ts:193`).
- service with an actor: §6 → the same `loop/user-only` from `LoopService.open(request,
  actor)` (`src/loop.ts:373-378`).
- the route cannot carry an actor at all: `dispatchLoopAction` (`src/loop-surface.ts:291`)
  builds `loop.open({sessionId, …})` with no second argument, so a body field named `actor`
  is not forwarded. Measured: `results/10-route-actor-field.txt` posts
  `{"action":"open","sessionId":"…","actor":"session-actor-probe"}` to the route and gets
  `200 open:true` — the field is ignored, the request stays a user action. That is not a
  bypass: the route is fenced by the browser session cookie (`connection.requestRejection`,
  `src/loop-surface.ts:249-252`), which an Agent does not hold; the Agent-attributed paths are
  the tool and the service, and both refuse.
- §7: after both refusals the catalog still holds exactly one row (no side effect).

## Q3 — does `status` read back the same session's row?

**CONFIRMED.** Same session, same task id:

- `results/01-core-chain.txt` §3 (open) and §12 (status after close) — both address
  `session-48df3c0a-…`; §12 answers `{"open":false}` with the same id.
- `results/08-reload-semantics.txt` §"boot 2 after SIGTERM" — `status` answers
  `{"open":true,"taskId":"schedule-81b3fabb-…","nextAt":"2026-11-19T01:51:25.000Z"}`, i.e.
  the row that was opened before the reboot, read back for the same session.

## Q4 — does a heartbeat delivery produce a receipt and actually run a round?

**Q4a CONFIRMED** (delivery + receipt + the session's own turn):
`results/01-core-chain.txt` §8, `results/05-delivery-receipt.json` (the same receipt as a
machine-readable artifact), `results/02-session-trace.txt`.

- receipt from Schedule: `"lastDelivery":{"scheduledAt":"2026-11-19T01:07:01.365Z",
  "deliveredAt":"2026-11-19T01:07:01.691Z","messageId":"8700badd-6e6a-4b6e-85c0-b2f9a0e4c1f7",
  "targetSessionId":"session-48df3c0a-…"}`, `"executionActive":true`
- the same `messageId` in the session log: `results/02-session-trace.txt:13` →
  `11  user/message  schedule  [SCHEDULE REMINDER] This is a scheduled message from the user …`
- the turn really ran and produced an assistant message:
  `results/02-session-trace.txt:7` `5 turn/start`, `:20` `18 assistant/message STUB_HEARTBEAT_ROUND_OK`,
  `:22` `20 turn/end`; the stub logged the model request
  (`stub/stub-requests.jsonl:4` → `POST /v1/chat/completions`, `"model":"probe-stub"`,
  `tools=33`, `reply=text`, `has grok_loop`).

So: open → delivery → next round, end to end, on a real Schedule timer surface (delivery
triggered with Schedule's own `run`/`runNow`, `dsh-schedule/src/runtime.ts:140`, because the
loop's interval floor is 60 minutes and no verification may wait an hour).

**Q4b BLOCKED for anything past the delivery** when the model has no credential:
`results/04-model-boundary-blocked.txt` shows the delivery accepted and the round failing
closed: `assistant/attempt` → `finish.reason.kind:"error"`, `code:"MISSING_CREDENTIAL"`,
`llm-pi-ai: no credential for provider route "probe-stub"`. No fake round is claimed from
that run; the completed round in Q4a is the one with the local stub that returns text.

## Q5 — does the gate classify the delivery by `source.kind = 'schedule'` and run a loop-brakes verdict?

**CONTRADICTED for the heartbeat branch; the source kind itself is observed.**

`results/09-classify-and-minimal.txt` §A and `results/01-core-chain.txt` §10:

- the delivered message in the Session log carries `"source":{"kind":"schedule"}`
  (`results/02-session-trace.txt:13`, raw object in
  `results/schedule-delivery-message.json`).
- the shipped `classifyPreStep` (`src/gate.ts:483`), fed that exact message object, answers
  `{"kind":"pass","reason":"non-user-source"}` — **not** `loop-continuation` and **not**
  `loop-stop`. The heartbeat branch was never entered, so no brake verdict was produced and
  nothing was charged to the loop's round records.
- the reason is the second half of `isHeartbeatMessage` (`src/gate.ts:531-535`):
  `source.kind === 'schedule'` holds, then `isLoopHeartbeat(textOf(message))`
  (`src/loop.ts:56`, `text.trimStart().startsWith('[grok-workflow loop]')`) is **false**.
- `results/09-classify-and-minimal.txt` §A prints the same verdict directly:
  `{"op":"heartbeat-probe", … "isLoopHeartbeat": false}` for the delivered text.
- why: DSH wraps every delivered prompt in its own framing —
  `renderReminderFraming` (`@deepseek-ai/dsh-schedule/lib` ← `src/domain.ts:1159-1169`,
  called at `src/runtime.ts:157`) returns `"[SCHEDULE REMINDER]\n" + SCHEDULED_MESSAGE_FRAMING
  + "\nschedule_id_json: …\noccurrence_at: …\nreminder_prompt_json: \"<the loop prompt>\""`.
  The loop marker exists only inside `reminder_prompt_json`, never at the start of the text
  the gate reads.

Consequence, observed: `results/03-stop-file-unreachable.txt` creates the operator stop
marker the brakes read (`workspace/.rsi/STOP`, `src/loop-brakes.ts:203 loopStopFile`) **before**
a delivery; the delivery is accepted, the round runs, and the heartbeat row is still stored
afterwards (`stored rows: ["schedule-6c7eb04d-…"]`). A tripped brake would have answered
`loop-path` `stop` and deleted the row (`src/loop-brakes.ts:386-392`). It did not.

Verdict: heartbeat recognition — **NOT_VERIFIED on a real delivery, and falsified for this
DSH version**; loop-brakes verdict — **NOT_RUN** (unreachable) with the cause above. The
brake machinery itself is covered by `test/loop-brakes.spec.ts` and `test/gate.spec.ts`; what
these live runs add is that a real delivery never reaches it.

## Q6 — does `close` delete the row so that nothing is delivered afterwards?

**CONFIRMED.** `results/01-core-chain.txt` §11–§15.

- `POST {"action":"close",…}` → `200 {"open":false,…}`
- `POST {"action":"status",…}` → `{"open":false,…}` (H4: read back, not asserted)
- catalog → `[]`; `storages/schedule.json` → `stored rows: []`
- Schedule's own delivery attempt on the deleted id → `{"code":"schedule_not_found"}`, i.e.
  the row that would have to exist for another beat is gone.

## Q7 — minimal composition without Schedule: `loop/unavailable` (503), not a silent failure?

**CONFIRMED.** `results/09-classify-and-minimal.txt` §B.

Profile `live-verify-minimal` composes the web template with the `schedule` row disabled
(`instance/dump-config-minimal.yml:476-478`, `disabled: true`) — no Schedule service, hence no
`schedule_*` tools. Both requests answer, with a body:

```
POST /grok-workflow/loop {"action":"open",…}   -> HTTP 503
{"ok":false,"code":"loop/unavailable","error":"the Host Schedule service is not composed; a loop heartbeat needs it"}
POST /grok-workflow/loop {"action":"status",…} -> HTTP 503   (same body)
```

`src/loop.ts:349-351` throws `loop/unavailable`; `src/loop-surface.ts:315` maps it to 503.
No request hangs, no 200, no empty body.

## Q8 — does unload's `stopAll` delete every row this plugin owns?

**Split verdict.**

- the operation against the real Schedule service: **CONFIRMED**.
  `results/07-reopen-for-stopall.txt` — open creates `schedule-c21cce6e-…`;
  `LoopService.stopAll('probe unload')` (`src/loop.ts:460`) returns `{"deleted":1}`; the
  catalog is `[]` afterwards.
- the *unload hook* that calls it (`src/loop-surface.ts:105-111`, `loop.stopAll('plugin
  unload')` inside `ctx.effect`): **HYPOTHESIS / NOT_RUN**. The host exposes no graceful
  unload surface I could drive: `results/08-reload-semantics.txt` shows SIGTERM leaving the
  row in place (`stored heartbeat rows: ["schedule-81b3fabb-…"]` before and after), i.e. the
  fiber tree is not disposed on process termination, and the CLI has no "reload this plugin"
  command. So the disposer body is proven, its firing is not.

## Q9 — does archive's `forgetSession` delete that session's row?

**Same split.** `results/06-reopen-for-forget.txt` — after re-opening
(`schedule-2bc37113-…`), `forgetSession(sessionId)` (`src/loop.ts:477`) returns
`{"deleted":1}` and the catalog is `[]`. The listener that calls it
(`src/loop-surface.ts:95-103`, on `workspace/session-stop` and `workspace/session-archived`) was
not driven through the GUI archive action — that path stays **NOT_RUN** here, and Schedule
itself also deletes its rows on `workspace/session-stop`
(`@deepseek-ai/dsh-schedule/src/index.ts`, `schedule.archiveAdmission()`), so a GUI-archive
test would not cleanly attribute the deletion.

## Q10 — reload semantics (open loop across a restart)

**Observed, not generalised.** `results/08-reload-semantics.txt`:

| Step | Stored rows |
| --- | --- |
| open | `["schedule-81b3fabb-…"]` |
| SIGTERM (child exits) | `["schedule-81b3fabb-…"]` |
| boot 2, `status` | `{"open":true,"taskId":"schedule-81b3fabb-…"}` |
| SIGKILL | `["schedule-81b3fabb-…"]` |
| boot 3, `status` | `{"open":true,…}` |
| `close` | `[]` |

So the first half of the comment at `src/index.ts:292` ("an open loop survives a plugin
reload") is **CONFIRMED** for a process restart; the second half ("an unload deletes it")
remains **HYPOTHESIS** here (Q8). No comment was changed.

---

## The task creator's question: who creates the schedule row — the host, or the looping session?

**Answered by observation: the Host, inside the plugin's loop service. The session never
creates it, and the model never calls a `schedule_*` tool for it.**

- in `results/01-core-chain.txt` the row appears in §3/§4 immediately after the HTTP `open`,
  while the session has no event at all yet (its first events in
  `results/02-session-trace.txt` start at `turn/start` seq 5, caused by the delivery);
- the stub logged **text** replies only (`stub/stub-requests.jsonl`, `"reply":"text"`), so no
  tool call happened, and `schedule_create` was never used;
- in the minimal composition (no Schedule service) no row can be created at all — the request
  is answered `503 loop/unavailable` (Q7);
- consistent with D-066 (`docs/knowledge/DECISIONS.md:1185`, invariant paragraph at
  `:1216` "循环会话本身不得被假设能建定时任务"): the switch is the operator's action, the
  Host owns the durable row, and a heartbeat only gives the session a turn.

## Repo/state hygiene

- `git status --short` shows no modification to any tracked file; the only new paths are under
  `.rsi/evidence/round-017/` (plus pre-existing untracked files of other work in this
  worktree: `.rsi/evidence/segment-5/…`, `settings-simple-mock.html`, and three root files
  `cookies.txt`, `describe.json`, `pid` that appeared at 09:04–09:05 and are not produced by
  this harness — my cookie jar lived at `instance/.cookies.json` and was deleted).
- No persistent schedule: the durable domain ends with `stored rows: []`, and every test row
  was created, exercised and deleted inside this run (D-066's cleanup rule).
- No token in any kept file: every boot log is scrubbed to `token=[REDACTED]`, and
  `instance/.token`, `instance/.cookies.json` were deleted. The instance's launch token is a
  per-process local value, never printed and never stored.
- Nothing pushed, tagged, released, or published; no DSH core or shipped profile touched.
