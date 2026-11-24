# Scenario 3 — a refused key is dispatched once per attempt and reported with its true cause

**Verdict: PASS** (with the `maxRetries: 0` premise corrected — see "One claim that had to be
restated").

Two runs: primary on the untouched build (`run-3.txt`), cross-check on the visibility-only copy
(`run-3-vis.txt`, which is the only way to see the `Dead routes` section at all, because
`showDiagnostics` is hardcoded off).

## Shape

```
./run.sh scenario-3.yml     prompt-3.txt run-3.txt       # untouched build       (21 s, exit=0)
./run.sh scenario-3-vis.yml prompt-3.txt run-3-vis.txt   # visibility copy only (23 s, exit=0)
```

* worker route = **the 401 endpoint only**: `soak-auth/soak/auth-bad`, whose every completion is
  `HTTP 401` with `{"error":{"message":"Incorrect API key provided: the virtual key presented to
  this provider was refused (soak fake provider, 401)","type":"invalid_request_error",
  "code":"invalid_api_key"}}`
* caller supplies one task; `Plan: caller; 1 task(s)`
* verifier / supervisor / synthesizer on live proxy routes

## Gateway request counts

`counters-3.txt` / `gateway-3.log`:

```
18492|soak/auth-bad   2  auth401=2 401=2
18493|soak/synth-live 1  proxy=1 200=1
```

Verbatim:

```
2026-11-24T01:46:47.762Z + 12698ms port=18492 model=soak/auth-bad n=1 mode=auth401 status=401
2026-11-24T01:46:48.108Z + 13044ms port=18492 model=soak/auth-bad n=2 mode=auth401 status=401
```

Two requests on the refused endpoint, 346 ms apart, and **nothing else** — no verifier call
(there was nothing to judge), no repeat inside the same attempt. The plugin's checkpoint shows
why there are two and not one:

```
run status failed | plan.source caller
   worker attempt 1 failed model-unavailable soak-auth/soak/auth-bad
   worker attempt 2 failed model-unavailable soak-auth/soak/auth-bad
   synthesizer attempt 0 ok  soak-pool/soak/synth-live
```

Two attempts, one dispatch each — i.e. **1 request per attempt**, which is the claim this build
can actually keep (see below).

## The report names the refusal in the provider's own words, and there is no `Dead routes` row

Visibility run, `run-3-vis.txt`:

```
Grok workflow: FAILED
Failures: 2 infrastructure
- task-1: failed (2 attempts) — 1000-378 的结论与验算
  attempt 1 flags: route=? passed=false resubmitted=false judgeRetried=false failure=model-unavailable/infrastructure
  attempt 2 flags: route=? passed=false resubmitted=false judgeRetried=false failure=model-unavailable/infrastructure
  incomplete (infrastructure): worker failed on every route: [model-unavailable] worker call produced no result:
    the child run ended abnormally (401: {"message":"Incorrect API key provided: the virtual key presented
    to this provider was refused (soak fake provider, 401)","type":"invalid_request_error", …
...
Route switches:
- worker attempt 1 via soak-auth/soak/auth-bad: model-unavailable — worker call produced no result: the child run ended abnormally (401: {"message":"Incorrect API key provided: …
- worker attempt 2 via soak-auth/soak/auth-bad: model-unavailable — worker call produced no result: …
Model routes: planner=soak-pool/soak/plan-live; worker=soak-auth/soak/auth-bad; verifier=soak-pool/soak/judge-live; …
Child budget: 90000 ms per call (the run stops waiting on one call after this long)
```

* failure class is **`model-unavailable`** (category `infrastructure`) — not `format-error`, and
  the reason is not "returned no valid structured result"
* the provider's own 401 text is quoted verbatim, including `invalid_api_key`
* `Route switches` has **exactly one row per attempt**, both naming the 401 — no second row in
  the same attempt, so no same-attempt resend
* the report contains **no `Dead routes …` section at all** (the section only renders when
  `report.deadRoutes` is non-empty). The refused key did not enter the dead-route table, which
  is what `fix/forward-model-unavailable` promises: `ROUTE_HEALTH_FAMILIES` still has four
  families and `model-unavailable` is not one of them.

The untouched build (`run-3.txt`) renders the same facts without the ledger block:

```
Grok workflow: FAILED
Failures: 2 infrastructure
- task-1: failed (2 attempts) — 1000-378 的结论与验算
  incomplete (infrastructure): worker failed on every route: [model-unavailable] worker call produced no
    result: the child run ended abnormally (401: {"message":"Incorrect API key provided: the virtual key
    presented to this provider was refused (soak fake provider, 401)", …
```

## The user-visible delivered sentence

`Final answer:` block of `run-3.txt`, verbatim:

> 结果： 这次运行没有通过。唯一一项任务失败，独立核验环节没有留下任何核验记录，所以没有任何一项被确认通过。执行这项任务的子运行在尝试的每条通道上都被中断，提供方以凭据被拒为由拒绝继续，始终没有产出结果，属于基础设施层面的故障。 怎么用： 这份结果目前不可用，请不要据此做后续判断或对外说明。需要先排除访问凭据方面的问题，换一条可用的通道重新执行，并让独立核验环节留下记录，再决定是否可以采信。

So the delivered sentence names the right cause — "提供方以凭据被拒为由拒绝继续" (the provider
refused because the credential was rejected), "属于基础设施层面的故障" (an infrastructure
fault) — and tells the reader to settle the access-credential problem before retrying. It does
not call it a format error and does not call the route dead.

## One claim that had to be restated

The brief asked for `maxRetries: 0` "so 'one dispatch' is a clean claim". That is not possible in
this build: `maxRetries` is in `REMOVED_CONFIG_KEYS` (an overlay carrying it is **rejected**, R-06)
and the value is fixed at `FIXED_MAX_RETRIES = 1`. Retries are a separate policy from the
same-attempt resubmit this branch fixes, so the measured claim is:

* **1 dispatch per attempt**, 2 attempts, 2 requests total;
* **no same-attempt resend** — the pre-fix code treated a 401 as `format-error` and spent a
  second call on a resubmit a refused key can only answer identically, i.e. 2 calls per attempt
  and 4 for this run. The branch's own `VALIDATION.md` records `resubmits(calls) === 0` for its
  403 seed; this run shows the same zero at the wire.

## What this does and does not prove

* Proves: one dispatch per attempt, the refusal reported in the provider's words with class
  `model-unavailable`, no dead-route row, and a delivered sentence that names the credential.
* Does not prove a single-attempt run (not configurable), and does not exercise the
  `[auth401, live]` chain shape, i.e. no evidence here about what the *next* route does after a
  401 — that is the `advances` half of the same decision and it is covered by
  `test/null-collapse.spec.ts` / `test/dead-routes.spec.ts`, not by this rig.
