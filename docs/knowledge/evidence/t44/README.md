# t44 — workflow progress visible in the Web GUI (provenance)

What this set proves: a user message now produces a **live workflow-run node** in the
conversation — present ~60 ms after the turn opens, with a member row per subagent that
appears and settles as the run proceeds, and a terminal status (`Completed` / `Cancelled` /
`Failed`) when it ends. Before t44 the same interval was **empty**: the plugin called the
engine directly, so the stock panel had no `tool-workflow/*` events to fold and the only
visible effect was child sessions appearing (t43 measured that gap).

## Where it was taken

| fact | value |
| --- | --- |
| instance | own debug profile `web-grok-debug` (`DSH_HOME=/home/fish/dsh-layerfs`), `http://127.0.0.1:3199` |
| launched as | `dsh --profile web-grok-debug --host 127.0.0.1 --port 3199 --no-open` |
| plugin source | `npm pack` of this tree → `dsh plugin --profile web-grok-debug add file:/tmp/t44-pack/dsh-grok-workflow-0.2.1.tgz` |
| installed host build | `lib/records.js` `c614861b8e0a51bb466d197527a79372`, `lib/run.js` `1a875ad01023d2ce9f1324c23c508b39` — byte-identical to the repo build (`md5sum` compared) |
| model | `bifrost-completions / wb/cn:deepseek-v4.1-flash` for every role; `synthesis: deterministic`, `maxTasks: 1`, `maxRetries: 0` (a short run, so the observation finishes in ~90 s) |
| browser | Playwright 1.64.1, Chromium, viewport 1500×1000 |
| live `:3090` | **not touched** — no restart, no install, no config write |

## What was observed

Three separate GUI sessions (one message each), plus the server's own session log, which is
the ground truth: `session-timeline.txt` is decompressed straight out of
`$DSH_HOME/sessions/…/session.v4.jsonl.zstd`, so its `time` column is the **host clock** —
no browser timing involved.

Completed run (`session-timeline.txt`, run 2):

```
seq=  4        Δ      0 ms  turn/start                      (the message opens the turn)
seq=  7        Δ     60 ms  tool-workflow/run-start          {"name": "grok-workflow"}
seq=  9        Δ    450 ms  tool-workflow/agent-start        {seq:1, label:"grok-planner",       phase:"Plan"}
seq= 10        Δ  9_951 ms  tool-workflow/agent-end          {seq:1, outcome:"completed"}
seq= 12        Δ 10_149 ms  tool-workflow/agent-start        {seq:2, label:"grok-worker-…-a1",   phase:"Execute"}
seq= 13        Δ 35_316 ms  tool-workflow/agent-end          {seq:2, outcome:"completed"}
seq= 15        Δ 35_390 ms  tool-workflow/agent-start        {seq:3, label:"grok-verifier-…-a1", phase:"Verify"}
seq= 16        Δ 78_598 ms  tool-workflow/agent-end          {seq:3, outcome:"completed"}
seq= 17        Δ 78_651 ms  tool-workflow/run-end            {stopReason:"completed"}
seq= 19        Δ 78_653 ms  step/start                       ← the step opens only now (in-turn)
seq= 21..23    Δ 78_655 ms  user/message ×3                   ← the user's own message lands now
```

Note the ordering: **`run-start` is written at turn level, ~78 s before any `step/start`** —
the risk t43 flagged ("does a node anchored before the step still render?"). It renders.

Cancelled run (`session-timeline.txt`, run 3; the GUI's stop button was clicked at ~8 s):

```
seq=  7   tool-workflow/run-start   {"name": "grok-workflow"}
seq=  9   tool-workflow/agent-start {seq:1, label:"grok-planner"}
seq= 10   tool-workflow/agent-end   {seq:1, outcome:"cancelled"}
seq= 11   tool-workflow/run-end     {stopReason:"cancelled"}
```

## Files

| file | what it shows |
| --- | --- |
| `session-timeline.txt` | three runs, event by event, from the **session log** (server clock): order, payload fields, and the `run-start` ↔ `step/start` relationship |
| `run.log` | pass 1: the node's first paint (~0.26 s after the send click), member growth 0 → 1 → 2 → 3, terminal `completed`, plus the `rAF` sampler log |
| `samples.json` | pass 1 raw sampler: `{t, status, text}` per change, page-relative milliseconds |
| `11-node-appeared.png` | the node while only the planner exists (header "1 member", phase "Plan") |
| `13-members-growing.png` | the same node with Plan + Execute rows visible |
| `12-node-final.png` | the finished node: `Completed`, 3 members |
| `16-cancelled-or-terminal.png` | a run stopped from the GUI: `data-run-status="cancelled"` |
| `run2.log`, `samples-cancel.json`, `conversation*.txt` | pass 2/3 logs and the conversation text, so a reviewer can grep copy without OCR |

## What a screenshot cannot prove, and what does

- The GUI only *renders*; it does not say who wrote the events. `test/progress.spec.ts` pins
  the writer: the four payload shapes field-for-field (a DSH upgrade that renames one fails a
  test), the `run-start → agent-start/end* → run-end` order, own-run-id isolation, containment
  of a refusing session, the pre-adoption buffer, and the `showProgress` switch — plus four
  tests that run the **real** `dsh-workflow-ptc` engine through `runWorkflow`, one of which
  gives the run a session that rejects every `tool-workflow/*` append and asserts the workflow
  still returns a validated `completed` report.
- The run name in these screenshots is the bare `grok-workflow`, **not** `… · N tasks`: the
  gate plans first, so the task count does not exist at the moment the node appears. The
  counted form is emitted whenever the caller supplies a plan (the tool path), pinned by
  `workflowRunName()` tests; the panel's live member count covers the gate path instead.
- A **failed** run was not produced live (the short objective verified). The `error → failed`
  mapping is the stock fold's (`statusFromStopReason`) and the cancelled case above exercises
  the same "leave `running`" path. Registered as NOT_RUN rather than claimed.
