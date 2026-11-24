# Scenario 1 — planner rescue (corridor C): a planning leg that died in transport is re-fired on a route it has not paid

**Verdict: PASS.**

## Shape

```
./run.sh scenario-1.yml prompt-1.txt run-1.txt        # DSH_HOME + HOME isolated; key sourced into env only
```

* plugin row: worktree `lib/index.js` @ `aebe65a`, `mode: full`, `grokDefault: 'off'`,
  `maxConcurrency: 1`, `timeoutMs: 1800000`, `childTimeoutMs: 90000`, `loopEnabled: false`
* planner chain = `[soak-hang/soak/hang-always, soak-pool/soak/plan-live]` — the first route
  never answers, so a re-fire that lands back on it is visible as a second hung request
* worker / verifier / supervisor / synthesizer on `soak-pool` proxy routes
* objective `17+25 等于多少？给出算式和一步验算。`, **no caller-supplied tasks**, so the
  planner leg really runs
* elapsed 157 s, `exit=0`

## Gateway request counts (own instrument, not the child's self-report)

`counters-1.txt`, from `gateway-1.log`:

```
18491|soak/hang-always        1  hang=1 hang-opened=1 hang-closed=0
18493|soak/plan-live          1  proxy=1 200=1
18493|soak/work-live          2  proxy=2 200=2
18493|soak/judge-live         2  proxy=2 200=2
18493|soak/sup-live           2  proxy=2 200=2
18493|soak/synth-live         1  proxy=1 200=1
```

The two planner lines, verbatim:

```
2026-11-24T01:35:24.556Z + 25200ms port=18491 model=soak/hang-always n=1 mode=hang opened bytes=42161 (socket held, no response)
2026-11-24T01:36:57.889Z +118533ms port=18493 model=soak/plan-live n=1 mode=proxy status=200 dur=3205ms
```

* the dead route was paid **exactly once** — one hang request, and it never answered. The
  gateway records no second request on `soak/hang-always` at any point in the run, so the plugin
  did not re-wait on that route
* the next planner request is **93 s later** (the 90 s budget running out) and lands on the
  other route, which answers in 3 205 ms
* a re-fire that had gone back to the spent route would show a second `mode=hang` line. There
  is none.

## The plugin's own run record (`dsh-home/checkpoints/grok-workflow/`, copied to `checkpoints-s1/`)

```
run status completed | plan.source planner | tasks 1
   planner attempt 0 failed timeout soak-hang/soak/hang-always  planner call exceeded the 2 minute child budget and was settled as a timeout; retry with a …
   planner attempt 0 ok  soak-pool/soak/plan-live
   worker attempt 1 ok  soak-pool/soak/work-live
   verifier attempt 1 ok  soak-pool/soak/judge-live
   supervisor attempt 1 ok  soak-pool/soak/sup-live
   synthesizer attempt 0 ok  soak-pool/soak/synth-live
limits: {'maxConcurrency': 1, 'maxRetries': 1, 'maxTasks': 10, 'timeoutMs': 1800000}
```

(The "2 minute" wording is this build's rounding of my 90 000 ms budget:
`Math.round(90000 / 60000) = 2`. The report's `Child budget: 90000 ms per call` is exact.)

## The report text the plugin handed back (`run-1.txt`)

```
Grok workflow: COMPLETED
Objective: 17+25 等于多少？给出算式和一步验算。
Plan: planner; 1 task(s); 1 verified
Wave reason: Single wave because the objective is one indivisible unit: splitting it would only add a hand-off.
- arith-1: verified (1 attempt) — 计算 17+25，给出算式并做一步验算
Confirmed evidence: …
Summary review: check=pass verify=pass drafts=1
Guard: 0 finding(s), no subagent was terminated; nobody cancelled this round (it finished on its own).
```

* `Plan: planner;` — a real plan from the planner leg, and `1 verified`
* the string `fallback` does not occur anywhere in the run output (`grep -c -i fallback run-1.txt` → `0`)
* no `Plan failure:` line, no fallback plan, run status `COMPLETED`

## Cross-check against the old behaviour (from the branch docs, not guessed)

`docs/knowledge/DECISIONS.md`, D-122 on `feat/planner-resubmit` (merged here as
`53d28ec`), "事实（改前）":

> 规划腿只有一次问法。`callRole` 在 `format-error` 上会走完整条链，但一旦链走完（**或挂死让链断在第一条**），
> 脚本立刻 `fallbackPlan()`（`src/script.ts` 规划腿）。而 fallback 计划**永远不可能报告目标已完成**
> （`src/report.ts` 拒它）……

So the code that would have given up is the pre-`53d28ec` planner leg in `src/script.ts`: a hang
broke the chain at its first entry, `callRole` returned without a plan, and the script called
`fallbackPlan()` — this run would have rendered `Plan: fallback;` and could never have reported
the objective completed. Its `VALIDATION.md` row records the same shape red on the old code
(`plan.source` landing on `fallback`, planner sub-call count `1`).

## What this does and does not prove

* Proves: with the shipped `lib/` at `aebe65a`, a planning call that dies by timeout on a dead
  route is re-fired on a different route, the run gets a real planner plan, and it proceeds to a
  verified task.
* Does not prove which internal bookkeeping chose that route (`options.avoid` / `spent`): that
  would need the canonical report fields, and the shape is exactly what a "re-fire on the
  un-spent route" and a plain "try the next route in the chain" would both produce here. The
  distinguishing case — a chain whose only route is dead after a hang — is
  `test/planner-resubmit.spec.ts`'s, not this rig's.
