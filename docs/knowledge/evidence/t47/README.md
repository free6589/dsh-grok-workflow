# t47 — v0.2.2 closeout: the notice row, the routes ledger, and the deadline

Three questions t46 left open, plus one it answered wrongly. Everything below was measured on the
test instance (`127.0.0.1:3100`, `DSH_HOME=/home/fish/dsh-v022-home`, profile `web-v022-test`,
DSH 0.2.1-rc.2); live `:3090` was not touched. Facts about the instance, the exact `lib/*.js` md5s
and the profile patch used are in `instance-facts.txt`.

## 1. The unload notice has no surface — proven, downgraded, and why

| artefact | what it shows |
|---|---|
| `E5-notice-event.json` | the persisted event: `seq 10`, `assistant/message`, `turn 1 step 0`, **`surfaceOp: "append"`**, `source {provider: grok-workflow, model: workflow-notice}` |
| `E3-conversation-after-unload.txt`, `.png` | the transcript of that same session after the plugin was switched off mid-run: **no notice row** (`notice text visible in the transcript: false`) |
| `E5-report-relay.txt` | what the user does see: the relayed report names the unload as the cause of the cancellation |
| `E4-notice.log` | the probe: run live → switch off → conversation → switch back on |

t46 recorded "the event carries no `surfaceOp` field". That was wrong: the field is there, as a
top-level sibling of `data`. The real cause is the client's projection rule:

* `@deepseek-ai/dsh-client-ui-chat/lib/client.js:8094-8108` — the assistant node's `match` maps
  `step/start` to `start` and `assistant/message` (+`surfaceOp: append`) to `update`. An `update`
  cannot create the node, and `buildViewNode` (same region) needs the step node's
  `publishedAssistantData` to render anything.
* In the persisted session the notice lands at `turn 1 step 0`, and the turn's first
  `step/start` is written *later* (`seq 14`, `turn 1 step 1`) — so `1:0` never has a node and the
  row is dropped, exactly as t46's §6 observed.

Paths a plugin does have, and why each is closed in this DSH build:

* `assistant/message` inside a live step — the only shape that renders — is written by the agent
  loop for a step it opened. A plugin that fabricates `step/start` would put a step in the log that
  the loop never opened: the loop derives its own numbering, `turn-process` grouping, and the next
  request's context from that log.
* `system/message` renders as the **system-prompt card**
  (`dsh-client-ui-chat/lib/client.js:9947-9966`, `systemMessageDefinition`), not as a notice; using
  it would claim the prompt changed.
* `conversation.chat.node` is a **keyed renderer seat** (`client.js:7180-7215`, keys `user`,
  `steering`, `context`, `turn-trigger`, `system-prompt`, `assistant-step`, …). A plugin can add a
  key, but it cannot create a node: nodes come from the chat package's own projections, whose
  `chatNode()` helper is module-private.
* No toast/notice API ships in the packages (`workspace.toast` is a slot for a component, and a
  bundle that is being unloaded is the wrong author for a transient toast).

**Downgrade (as the task allowed):** the notice stays in the ledger and keeps its second, deliberate
role — it enters the surface, so the *next* turn's context knows the mandatory workflow is off —
while the **report remains the only user-facing channel**. The report was verified to carry the cause
in the same run (`E5-report-relay.txt`). A real fix needs a public way for a plugin to contribute a
chat node (or a notice event with a projection); that is a DSH-side API, proposed for 0.2.3.

## 2. `Model routes:` — the ambiguity is gone, and one real defect behind it

t46's discrepancy: the line appeared only after a settings-page save. Three facts, in order:

1. **The chains do reach the runtime.** A temporary env-gated dump of the argument the loader hands
   to `apply()` shows a holder per field whose `get()` returns the chains:
   `raw-config.json` → `roles = {holder: true, got: {planner: [bifrost-completions/wb/cn:deepseek-v4.1-flash], worker: [same], verifier: [same], synthesizer: []}}`,
   next to `timeoutMs = 60000`, `maxTasks = 1`.
2. **The live report names them.** `B1-deadline-report.txt` (the session log's relayed text):
   `Model routes: planner=bifrost-completions/wb/cn:deepseek-v4.1-flash; worker=…; verifier=…; synthesizer=inherit`
   plus `Deadline: 60000 ms per run (enforced by the plugin)`. This is patch-only configuration, no
   settings save involved.
3. **Two code paths silently printed nothing**, and both are fixed:
   `src/report.ts` skipped the line whenever every configured chain was empty (so "nothing
   configured" and "line omitted" looked identical), and `failureReport()` hard-coded
   `routing: {planner: [], worker: [], verifier: [], synthesizer: []}` — so a timeout or unload
   report claimed `inherit` even when the run had been handed a chain. That second one is a real
   defect, not an ambiguity: it is now derived from the config
   (`renderReport(failureReport(...))` shows `worker=bifrost-completions/wb/cn:deepseek-v4.1-flash`).

t46's exact pre-save observation can no longer be reproduced, because the code that could skip the
line is gone; what is now guaranteed is that the line is always present and always the runtime's own
resolution, with `inherit` spelled out.

## 3. A deliberately broken first route never switches — it refuses to load

`A2-load-rejection.txt` (boot log of the instance whose worker chain started with a model the
provider does not enumerate):

```
grok-workflow (dsh-grok-workflow): Error: roles.worker names model "wb/cn:no-such-model-probe",
which provider "bifrost-completions" does not enumerate; declared: agnes-3.0-flash, …
```

The entry fails to load, so **that configuration never ran** — which is why t46 saw the second route
used with no `Route switches:` entry: it was not a silent switch, it was never that config at all.
The fail-fast is deliberate (a silently ignored chain looks like routing that works). A switch does
happen for *runtime* failure classes on routes the provider does have, and it is traced:
`test/config.spec.ts` (a 429 on the first route advances to the second; the trail records
`w1` failed then `w2`), and the line had no test at all until t47 added one —
`test/report.spec.ts` `Route switches:` renders `- worker attempt 1 via …: rate-limit — 429 Too Many
Requests`, and stays silent when nothing failed.

## 4. The deadline: the engine does not settle, and the plugin now enforces its own bound

t46: a 60 000 ms deadline saved through the settings page did not stop a run that was still working
minutes later, with two candidate causes. The verdict, from `B1-deadline-report.txt` (a clean boot
with `timeoutMs: 60000` written in the profile patch, no settings page involved):

```
Incomplete: - workflow (infrastructure): workflow exceeded the 60000 ms deadline and was cancelled;
the engine had not settled, so this report is the authoritative result
Model routes: … / Deadline: 60000 ms per run (enforced by the plugin)
Errors: - Timeout: workflow exceeded the 60000 ms deadline and was cancelled; …
```

and the UI side (`A-run.log`, `A1-deadline-run.png`): the run node leaves `running` at **61.5 s**
(`statuses ["cancelled"]`, measured from the send).

So: **the setting reached the runtime** (60 000 in force, not the 3 600 000 default) and **the engine
ignored the abort** — the second hypothesis. `src/run.ts` aborted a signal and then waited for the
engine to settle; it now races the run's result against the plugin's own deadline, cancels with a
reason that names the deadline (it used to say "cancelled by its caller", which pointed at the wrong
actor), and returns the timeout report without waiting. Regression test: a stubborn engine whose
`cancel()` is a no-op — `test/reliability.spec.ts` "reports the deadline on time even when the engine
ignores the cancel" (returns in ~1.0 s for a 1 000 ms deadline; it would hang before the fix).

## File map

* `instance-facts.txt` — home, listeners, pids, package source, every `lib/*.js` md5, profile patch.
* `A-run.log`, `A1-deadline-run.png`, `A1-conversation.txt` — the deadline run in the UI (60 s).
* `A2-load-rejection.txt` — the load-time refusal of a non-enumerated model.
* `B1-deadline-report.txt` — the report the session log carries for that run (routes + deadline).
* `E1-before-toggle.png`, `E2-after-toggle.png`, `E3-conversation-after-unload.{png,txt}`,
  `E4-notice.log` — the unload probe: live run → plugin switch off → transcript.
* `E5-notice-event.json`, `E5-report-relay.txt` — the notice event as persisted, and the report the
  user actually receives in the same session.
* `raw-config.json` — what the loader hands `apply()` (temporary env-gated diagnostic; the hook was
  removed before the final build, see `notes.txt`).
