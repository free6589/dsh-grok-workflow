# Dead-route soak for 0.13.27 (rework) — D-120 修法一 + 修法二 on a real engine

The 0.13.27 merge soak (`../soak-deadroutes-01327/`) found the dead-route table empty on a
real machine: five dead 503 calls and eight dead hangs, `Dead routes` never appeared. This
directory is the re-run after `feat/dead-routes` was repaired (`cd0c909`, merged as
`78c1907`).

## Rig

Isolated home, nothing of the running instance touched:

```
node scripts/clone-profile.mjs --src ~/.dsh/profiles/headless \
  --home .tmp/soak-01327r/dsh-home --name headless-soak          # parity 4/4, 0 credentials
node gateway.mjs .tmp/soak-01327r/gateway.log                    # two fake endpoints
DSH_HOME=.tmp/soak-01327r/dsh-home HOME=.tmp/soak-01327r/home \
  dsh --profile headless-soak --patch <scenario>.patch.yml "<prompt>"
```

* `127.0.0.1:18471` → `soak-dead/soak/dead-model`: `/models` OK, every completion 503.
* `127.0.0.1:18472` → `soak-hang/soak/hang-model`: connects, never answers.
* `soak-live/wb/cn:deepseek-v4.1-flash` → the machine's own gateway (`127.0.0.1:18088`).
* Worker chain = `[dead route, live route]`, `maxConcurrency: 1`, caller-supplied plan.
* `model.template.yml` is the overlay; the plugin row is `insert`ed and points at that
  worktree's `lib/index.js`.

The diagnostics block (`Model routes:` / `Route switches:` / `Dead routes:`) is only
rendered when `showDiagnostics` is true, and T4 fixes that flag to false. This round used a
copy of `lib/` with **one** line flipped — `renderReport(value)` →
`renderReport(value, { showDiagnostics: true })` — so the routing code is byte-identical to
the shipped build and only the visibility changes.

## 503 scenario (`dead-ledger.txt`, `run-dead.txt`)

```
Plan: caller; 5 task(s); 5 verified
Route switches:
- worker attempt 1 via soak-dead/soak/dead-model: server-error — worker call produced no
  result: the child run ended abnormally (503: {"message":"service unavailable (soak
  endpoint: this provider is down)","type":"server_error","code":503}) …
- worker attempt 1 via soak-dead/soak/dead-model: server-error — (same)
Dead routes (two consecutive transport failures; live routes are tried first):
- soak-dead/soak/dead-model: server-error (2 in a row)
```

Two child calls landed on the dead route (tasks 1 and 2); tasks 3–5 never touched it and all
five verified. Before the fix the same rig produced five dead calls and an empty table.

## Hang scenario (`hang-ledger.txt`, `run-hang.txt`)

```
Route switches:
- worker attempt 1 via soak-hang/soak/hang-model: timeout — worker call exceeded the 1
  minute child budget and was settled as a timeout; retry with a smaller step
- worker attempt 2 via soak-hang/soak/hang-model: timeout — (same)
Dead routes (two consecutive transport failures; live routes are tried first):
- soak-hang/soak/hang-model: timeout (2 in a row)
```

This is the row the previous soak could never produce: a hung call now counts even though
`switchModel` stays false (the task still retries with new wording).

**Honest gap.** Both hang rounds collapsed to a one-task plan (the outer model did not pass
`tasks`, and with a short child budget the planner itself timed out into the fallback plan),
so "the third task no longer pays for it" is demonstrated in this directory for the 503 shape
only. For the hang shape it is covered by `test/dead-routes.spec.ts`'s real-engine case
(`workerModels === ['w1','w1','w2']`) and by the identical scan-order path the 503 run
exercised. A later round with a longer `childTimeoutMs` (or a plan handed straight to
`grok_workflow`) would close it on the machine too.

`upstream-503-abort.txt` is the third attempt: the machine's own gateway answered
`no_healthy_account` for every model, so the CLI aborted before any workflow ran. That is an
upstream outage, not this change.
