# Isolated real-machine soak for release/0.13.29 — planner rescue / judge re-fire / refused key

**Result: PASS on all three scenarios**, with six honest gaps listed at the end: one gate
condition that did not hold literally, one upstream-model substitution, one config substitution
(`grokDefault`), one premise the build does not support (`maxRetries: 0`), one visibility aid,
and one list of shapes not exercised.

Build under test (read only — no edit, no `git checkout`, no `npm run build` in that worktree):

| | |
| --- | --- |
| worktree | `/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-rel-0.13.29` (branch `release/0.13.29`) |
| head sha | `aebe65a7a75c12be194ad1adf74003edffd0f910` — matches the sha in `.tmp/merge-ci-ok.md` |
| marker | `# Merge gate OK — release/0.13.29`, `npm run ci` exit 0, 99 files / 1837 tests, `verify:lib` byte-identical (237 files) |
| `lib/index.js` at HEAD | git blob `0bd502ba2e8086dbc976a6d7655c1f877f7a0eed`, sha256 `3e014bd1f8f469ed…` |
| tree state | `git status --short` = 0 lines (clean) |

## Gate

Nothing ran against the build until `.tmp/merge-ci-ok.md` existed. `wait-marker.sh` was the
gate check — `for i in $(seq 1 60) … sleep 30`, plus one upstream-health probe every 10
intervals; no high-frequency polling. It found the marker after 29 intervals
(`wait.log`; the marker itself is `marker.txt`).

Two of the three gate conditions held exactly:

* `git -C .tmp/wt-rel-0.13.29 rev-parse HEAD` = `aebe65a7a75c12be194ad1adf74003edffd0f910`,
  equal to the marker's release head — **CONFIRMED**.
* `lib/index.js` is a committed blob at that same HEAD and the three merged features are in
  it (`judgeRetried` 4 hits in `lib/script.js`, `PLANNER_LEG_CALLS`, `model-unavailable`,
  `re-fired: same attempt`) — **CONFIRMED**.
* "`lib/index.js` newer than `.tmp/merge-ci-ok.md`" — **does not hold as a timestamp**: the
  build was written at 09:17:54 and the marker at 09:20:58, because the merging agent ran
  `npm run build` inside `ci` and wrote the marker after `ci` finished. Same commit, clean
  tree, `verify:lib` byte-identical at that sha. Treated as satisfied by identity rather than
  by mtime; recorded here rather than papered over.

## Rig

```
node scripts/clone-profile.mjs --src ~/.dsh/profiles/headless \
  --home .tmp/soak-01329/dsh-home --name headless-soak
# → parity 4/4 equal after redaction; dependencies 0 declared, 0 unresolved (2/2 from the installation);
#   credentials redacted: 0 line(s) in 0 file(s)

node .tmp/soak-01329/gateway.mjs .tmp/soak-01329/gateway.log     # fake endpoints
.tmp/soak-01329/run.sh <overlay.yml> <prompt.txt> <out.txt>      # one soak run
```

`run.sh` sets, for every `dsh` invocation, `DSH_HOME=.tmp/soak-01329/dsh-home` **and**
`HOME=.tmp/soak-01329/home`, sources `BIFROST_VIRTUAL_KEY` from the machine's existing
`~/.dsh/bifrost.env` into the process environment only, and runs from
`.tmp/soak-01329/work/`. Nothing under `~/.dsh` was written; the instance on port 3080 was
neither touched nor restarted; no key was printed, echoed, copied, minted or changed.

Fake endpoints (`gateway.mjs`) — every completion is counted per `(port, model)` and each
count line carries a timestamp, the model, the per-model request number, the mode and the
duration. `/models` answers are counted separately (route resolution, not calls).

| port | model ids | behaviour |
| --- | --- | --- |
| 18491 | `soak/hang-always` | never answers: holds the socket, no response, ever |
| 18491 | `soak/plan-hang`, `soak/judge-hang` | request **#1 hangs**, request **#2+ proxies** to `127.0.0.1:18088` |
| 18492 | `soak/auth-bad` | every completion → HTTP 401, provider-shaped body, `code: invalid_api_key` |
| 18493 | `soak/plan-live`, `soak/work-live`, `soak/judge-live`, `soak/sup-live`, `soak/synth-live` | proxies to `127.0.0.1:18088`, response passed through |

Proxied requests have `body.model` rewritten to the upstream id, so a per-role model id gives a
per-role counter without disturbing anything else. `503` and `hang-always` modes exist in the
gateway; only `hang-always` was needed. Ports 18491/18492/18493 are this round's; the old
round's 18471/18472 were not reused.

Overlays: `gen-patch.mjs` renders them from one table; the ones actually used are next to this
file (`scenario-1.yml`, `scenario-2.yml`, `scenario-2-vis.yml`, `scenario-3.yml`,
`scenario-3-vis.yml`). Each `insert`s the plugin row pointing at the worktree's `lib/index.js`,
`mode: full`, `maxConcurrency: 1`, `loopEnabled: false`, and takes every role chain from the
overlay. No `lib/` patch was needed for the primary runs (see the visibility note below).

## Budget

`childTimeoutMs = 90000` (90 s), chosen from one throwaway live run
(`scenario-timing.yml`, 10-minute budget, planner leg on the proxy route only,
`run-timing.txt` / `gateway-0-timing.log`):

| leg | calls (completions) in that run | wall span |
| --- | --- | --- |
| planner | 2 | 7 723 ms |
| worker | 4 | 6 242 ms |
| verifier | 12 | 64 181 ms across all twelve (each 1.9–4.9 s) |
| supervisor | 3 | 10 069 ms |
| synthesizer | 2 | 10 409 ms |

A live planner call costs ~8 s and the slowest single judging call ~5 s, so 90 s is roughly an
11× margin: a live call can always finish, a hung one always dies. Cost of the margin: each
hang leg pays 90 s of wall time (observable in the logs as a ~93 s gap between the hung
request and the re-fire).

Note on the wording: the plugin renders this budget as "the **2 minute** child budget"
(`Math.round(90000 / 60000) = 2` in `lib/script.js`). The report's own
`Child budget: 90000 ms per call` line is the exact number.

## The three scenarios

| # | shape | verdict | one-line proof |
| --- | --- | --- | --- |
| 1 | planner rescue (corridor C) | **PASS** | dead route paid **1** time, re-fire on the live route, `Plan: planner; 1 task(s); 1 verified` |
| 2 | judge re-fire, worker not re-run (corridor D) | **PASS** | worker row **1**, verifier rows **2** on the same attempt, `judgeRetried=true`, `verified (1 attempt)` |
| 3 | refused key dispatched per attempt, true cause | **PASS** | **1** request per attempt on the 401 route, `model-unavailable` + provider's own words, **no** `Dead routes` |

Each scenario has its own file below (`scenario-1.md`, `scenario-2.md`, `scenario-3.md`) with
the command, the environment, the gateway lines and the report lines.

## Honest gaps

1. **Gate mtime condition.** `lib/index.js` is 3 minutes *older* than the marker (build ran
   inside `ci`, marker written after). Identity holds (same sha, clean tree, `verify:lib`
   byte-identical at that sha); the literal "newer than" check does not. Claimed on identity,
   stated plainly.
2. **Upstream model substitution.** The brief's model id `wb/cn:deepseek-v4.1-flash` was **down
   for the whole session** on the machine's gateway: `{"status_code":503,"error":{"code":
   "no_healthy_account","message":"all accounts are temporarily unavailable"}}` — probed at
   09:06, 09:11, 09:16 (`wait.log`) and again at 09:22 before the first run, same answer every time, and it is the same upstream outage the
   0.13.27 round hit (`upstream-503-abort.txt` there). The runs therefore used
   **`wb/global:deepseek-v4.1-flash`** — the same model id served by the same gateway with the
   same existing key, different routing group. Same gateway, same key, one model id over. The
   gateway logs record `upstream=127.0.0.1:18088/wb/global:deepseek-v4.1-flash` at startup.
3. **`grokDefault: 'off'` instead of `on`.** With `on`, the plugin's intake gate starts a
   workflow of its own for the same user turn, concurrently with the model's explicit
   `grok_workflow` call. The first scenario-1 attempt shows exactly that: two runs in one
   session (checkpoints `b5d60c05` = auto intake run, objective `Current request: …`, and
   `a42054be` = the tool call), and the auto run cannot finish inside a one-shot headless turn
   (`run status failed`, cause `the plugin was unloaded while the run was in flight`). Two
   concurrent runs make per-route counters unattributable, so every scenario turns the gate off
   and drives the tool explicitly: one run per session, one set of counters. Evidence for the
   auto-run behaviour: `checkpoints-1-first-attempt/` (two runs in one session — the auto run
   `b5d60c05` with objective `Current request: …`, `status: failed`, cause `the plugin was
   unloaded while the run was in flight`; and the tool call `a42054be`, `completed`) and
   `gateway-1-first-attempt.log`.
4. **`maxRetries: 0` is not a thing in this build.** `maxRetries` is in
   `REMOVED_CONFIG_KEYS` (a patch carrying it is rejected) and is fixed at 1
   (`FIXED_MAX_RETRIES`). Scenario 3 therefore cannot claim "one dispatch, full stop"; it claims
   and shows "exactly one dispatch per attempt, no same-attempt resend" — 2 requests total over
   2 attempts, not the 4 the pre-fix code would have paid (2 per attempt: dispatch + a resubmit
   that a refused key can only answer the same way).
5. **Visibility aid (not a behaviour change).** `judgeRetried` and `Dead routes` are canonical
   report fields that the shipped renderer never prints, and `showDiagnostics` is hardcoded
   off (`FIXED_SHOW_DIAGNOSTICS`). For two cross-check runs only, a copy of `lib/` under
   `.tmp/soak-01329/lib-vis/` (inside my scratch, not the worktree) differs by **two**
   additions, both in the rendering path: `renderReport(value)` →
   `renderReport(value, { showDiagnostics: true })` in `index.js`, and one extra loop in
   `report.js` that prints the per-attempt flags the canonical object already carries
   (`attempt N flags: route=… passed=… resubmitted=… judgeRetried=… failure=…`). Routing,
   retry, budget and reporting decisions are byte-identical; the whole diff is in
   `lib-vis.diff`. Every scenario was **also** run on the untouched build, and the untouched
   runs are the primary evidence — the visibility runs only make the two already-present facts
   readable.
6. **What was not exercised.** The `503` endpoint mode, `soak/plan-hang`'s second leg, the
   dead-route table's two-in-a-row downgrade, and the supervisor-side re-fire (the supervisor
   never died in any run). No claim in this directory depends on them.
