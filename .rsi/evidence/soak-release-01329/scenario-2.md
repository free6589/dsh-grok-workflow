# Scenario 2 — judge re-fire without re-running the worker (corridor D, same attempt)

**Verdict: PASS.**

Two runs: the primary run on the **untouched** build (`run-2.txt`) and one cross-check run on
the visibility-only copy (`run-2-vis.txt`, see README gap 5). Both produced the same shape.

## Shape

```
./run.sh scenario-2.yml     prompt-2.txt run-2.txt       # untouched build       (177 s, exit=0)
./run.sh scenario-2-vis.yml prompt-2.txt run-2-vis.txt   # visibility copy only (181 s, exit=0)
```

* `grokDefault: 'off'`, `maxConcurrency: 1`, `childTimeoutMs: 90000`, `maxRetries` fixed at 1
* caller supplies **exactly one task** (`tasks` param), so `Plan: caller; 1 task(s)`
* worker route `soak-pool/soak/work-live` (proxied, counted)
* verifier route = **one** route, `soak-hang/soak/judge-hang`: request #1 hangs forever,
  request #2+ proxies to the live gateway — so a re-fire gets a real verdict
* supervisor / synthesizer on proxy routes

## Gateway request counts

Primary run, `counters-2.txt` / `gateway-2.log`:

```
18491|soak/judge-hang   3  hang=1 proxy=2 hang-opened=1 hang-closed=0 200=2
18493|soak/work-live    2  proxy=2 200=2
18493|soak/sup-live     2  proxy=2 200=2
18493|soak/synth-live   4  proxy=4 200=4
```

Verbatim:

```
2026-11-24T01:39:03.953Z + 17226ms port=18493 model=soak/work-live  n=1 mode=proxy status=200 dur=2178ms
2026-11-24T01:39:07.092Z + 20365ms port=18493 model=soak/work-live  n=2 mode=proxy status=200 dur=1798ms
2026-11-24T01:39:10.801Z + 24074ms port=18491 model=soak/judge-hang n=1 mode=hang opened bytes=43750 (socket held, no response)
2026-11-24T01:40:43.210Z +116483ms port=18491 model=soak/judge-hang n=2 mode=proxy status=200 dur=2346ms
2026-11-24T01:40:47.759Z +121032ms port=18491 model=soak/judge-hang n=3 mode=proxy status=200 dur=2596ms
```

Reading it honestly: `soak/work-live` counts **model calls**, not dispatches — the single worker
child made 2 completions in this run (4 in the visibility run). The dispatch count comes from the
plugin's own checkpoint below. What the gateway proves is the judging side: the hung judge is
paid once (n=1), the re-fire comes 92 s later and really answers (n=2, 2 346 ms), and there is no
second *worker* burst after the dead judgement — the worker's last call is at 20 365 ms, the
judge dies at 24 074 ms and the re-fire answers at 116 483 ms, after which `work-live` never
appears again.

## The plugin's own run record — the dispatch counts

Primary run, `checkpoints-s2/`:

```
run status completed | plan.source caller | tasks 1
   worker   attempt 1 ok        soak-pool/soak/work-live
   verifier attempt 1 failed timeout soak-hang/soak/judge-hang
   verifier attempt 1 ok        soak-hang/soak/judge-hang
   supervisor attempt 1 ok      soak-pool/soak/sup-live
   synthesizer attempt 0 ok     soak-pool/soak/synth-live
   synthesizer attempt 1 ok     soak-pool/soak/synth-live
   synthesizer attempt 2 ok     soak-pool/soak/synth-live
```

* worker dispatched **exactly once** (one `worker attempt 1` row; no `attempt 2`, no second
  `attempt 1` row)
* verifier dispatched **twice**, both rows on **attempt 1**: the first `timeout` on the hang
  route, the second `ok` on the same route
* the attempt ends verified, i.e. the re-fire's verdict is the one that counts

The visibility run's checkpoint (`checkpoints-s2-vis/`) is the same shape:
one `worker attempt 1 ok`, then `verifier attempt 1 failed timeout` + `verifier attempt 1 ok`.

## The report text — `judgeRetried` visible

Visibility run, `run-2-vis.txt` (untouched build renders the same report without the two
visibility lines):

```
Grok workflow: COMPLETED
Objective: 算出 17+25 并写出一行可复核的验算。
Plan: caller; 1 task(s); 1 verified
- task-1: verified (1 attempt) — 17+25 的结论与验算
  attempt 1 flags: route=soak-pool/soak/work-live passed=true resubmitted=false judgeRetried=true failure=none
...
Route switches:
- verifier attempt 1 via soak-hang/soak/judge-hang: timeout — verifier call exceeded the 2 minute child budget and was settled as a timeout; retry with a smaller step
Model routes: planner=soak-pool/soak/plan-live; worker=soak-pool/soak/work-live; verifier=soak-hang/soak/judge-hang; supervisor=soak-pool/soak/sup-live; synthesizer=soak-pool/soak/synth-live
Child budget: 90000 ms per call (the run stops waiting on one call after this long)
```

* `judgeRetried=true` on attempt 1 — the flag the branch adds (`AttemptReport.judgeRetried`,
  whitelisted through `src/report.ts`) is really set at run time, and `resubmitted=false` shows
  it was not the format-resubmit corridor that did it
* `verified (1 attempt)` — same attempt, no retry spent, no second attempt row
* the dead judgement is named as what it was: `verifier attempt 1 via soak-hang/soak/judge-hang:
  timeout`

The untouched build's own report (`run-2.txt`) says the same thing in the words it does render:

```
Plan: caller; 1 task(s); 1 verified
- task-1: verified (1 attempt) — 17+25 的结论与验算
```

## Where the literal "re-fired" wording lives

`lib/script.js` writes the phrase ` (re-fired: same attempt, no retry spent)` into the *prompt it
sends* on the re-fire call (`routeDeath === true` branch of the verifier/supervisor resubmit
prompt), and logs `task <id> attempt <n> verifier re-fired after a transport death` to the plugin
logger. Neither reaches the rendered report, and the logger runs at `info` level, which the
headless CLI does not print. The report-side evidence of the same fact is `judgeRetried=true`
(above) plus the two verifier rows on one attempt. The re-fire prompt body itself was **not
captured** — that would need a gateway that logs request bodies, which this rig deliberately does
not do.

## What this does and does not prove

* Proves: with a judge leg that dies of transport, the same attempt is re-judged instead of the
  worker being re-run; the attempt ends verified; `judgeRetried` is set; one worker dispatch.
* Does not prove the supervisor-side corridor (no run ever had a dead supervisor), and does not
  prove the "re-fire dies again" fallback (the second judge call always answered here).
