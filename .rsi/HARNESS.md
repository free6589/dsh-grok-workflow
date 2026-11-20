# Harness — 1000 rounds as bounded arms

The loop's budget is **1000 rounds**. This file is the contract that makes that number real without
turning any single run into a long loop: one scheduled delivery is one round, one heartbeat row is
one arm of at most 100 rounds, and the arm after it is armed by a person (or a session that holds
Schedule tools) from a plan the repository computes — never by a `while` that counts to 1000.

Read this together with `.rsi/HEARTBEAT.md` (the per-round prompt), `.rsi/PROTOCOL.md` (what one
round must contain) and `.rsi/harness.json` (the numbers).

## The numbers, and where each one comes from

| number | value | source | pinned by |
| --- | --- | --- | --- |
| budget | 1000 rounds | `.rsi/harness.json` `totalRounds` | `test/iterate-plan.spec.ts` (plan sums to the budget) |
| cadence | 60 min | `src/loop.ts` `DEFAULT_LOOP_INTERVAL_MINUTES` | the same test, against that constant |
| arm width | 100 rounds | `src/config.ts` `HARD_LIMITS.loopMaxRounds` | the same test, against that constant |
| row maximum | 1000 rounds | `src/loop.ts` `loopPolicyFromConfig` clamp `1..1000` | the same test, against that clamp |
| round ceiling | 1000 | `.rsi/harness.json` `stop.roundCap` | `heartbeat-guard.sh --max-rounds` behaviour, run by that test |
| concurrency | 10, hard max 100 | `src/config.ts` `DEFAULT_MAX_CONCURRENCY` / `HARD_LIMITS.maxConcurrency` | the same test |
| retries | 1, hard max 3 | `src/config.ts` `FIXED_MAX_RETRIES` / `HARD_LIMITS.maxRetries` | the same test |

Two of those numbers are *not* interchangeable, and the difference is measured rather than assumed
(`A40`): `loopRrule` formats whatever `COUNT` it is handed, so the 1000 ceiling lives in
`loopPolicyFromConfig`, while the configuration key `loopMaxRounds` is refused above **100** at load
(`src/config.ts:992`). The plugin's own switch therefore cannot ask for more than 100 rounds in one
row — which is why an arm is 100 rounds and the budget is spent in arms.

## One delivery, one round, one row

- A delivery is a message with `source.kind = "schedule"`; the round it opens is the only work that
  turn does. Deliveries do not stack: a delivery that arrives while the previous round is open is
  refused or merged, and after a Host restart only the latest missed occurrence is delivered.
- A row is an `RRULE` with `INTERVAL=60` and `COUNT=<arm size>`; when its occurrences are spent the
  row ends and the loop is stopped until somebody arms the next arm. There is no in-process loop,
  no nested workflow, and no round that arms its own successor (`D-066`, `D-092`).
- Arms are sequential, never parallel: two rows would mean two rounds per hour against one POOL.

## The arm plan

`.rsi/tools/iterate-plan.mjs` reads the durable state (`.rsi/ROUND.md` sections and
`.rsi/ledger.jsonl` rows, taking the higher round the way the guard does), subtracts it from the
budget, and prints the arms — read-only, no timer, no state of its own:

```text
$ node .rsi/tools/iterate-plan.mjs
plan shape=chain total=1000 used=35 remaining=965
arms=10 interval=60 guard_args="--max-rounds 1000 --threshold 3" status=OPEN
arm 1/10 rounds=100 rounds_window=36..135
arm 1/10 rrule=DTSTART:20261120T061844Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=100
arm 2/10 rounds=100 rounds_window=136..235
arm 2/10 rrule=(armed when arm 1 ends; COUNT=100, INTERVAL=60)
…
arm 10/10 rounds=65 rounds_window=936..1000
envelope maxConcurrency=10/100 retries=1/3
```

That output was captured from this repository at round 35 (`.rsi/evidence/harness/plan.txt`). Only
the arm being armed now carries a `DTSTART`: the later arms are armed when their predecessor ends,
so a `DTSTART` for them would be a guess. The `rrule` text is byte-identical to `loopRrule`'s output
for the same inputs — the test compares them rather than trusting the comment.

`--json` prints the same plan as one object (for a script or a report), `--pool` prints the open
POOL items in file order and marks the next one, `--shape single` plans one row of up to 1000
rounds for the case where the row is armed outside the plugin's switch (see the caveat below).

## Arming an arm

The arming action is **not** something a round can do, and not something a delegated subagent can do
(`D-066`; measured again in `.rsi/evidence/heartbeat-rearm/03-blocker.txt`: `schedule_list` answers
`{"code":"subagent_session"}`). Two channels exist:

1. **The plugin's own switch** — the composer *Self-iterate* control, or `POST /grok-workflow/iterate`
   on a browser-authenticated connection. `open()` refuses every caller that carries an actor
   (`src/loop.ts`, `loop/user-only`), so this is a user action. The row it writes is
   `title: "RSI heartbeat"`, `INTERVAL` from `loopIntervalMin` (floor 60), `COUNT` from
   `loopMaxRounds` (≤100).
2. **A session that holds Schedule tools** — `schedule_create` / `schedule_edit` on the existing row
   id, keeping the title so `slotOf` still owns the row. The plan's `rrule` line is what to paste.

The row this loop actually used was `schedule-0bbbef5f-…`, `COUNT=10`, last occurrence
`2026-11-20T10:01:50Z` (`.rsi/evidence/heartbeat-rearm/04-rearm-plan.md`); it is spent, so the
successor is whatever arm 1 above is armed as. Before arming, set `loopMaxRounds: 100` and
`iterateIntervalMin: 60` in the profile's `grok-workflow` block, otherwise the switch writes a
narrower row than the plan expects.

**Caveat on `single`.** A row wider than `loopMaxRounds` is legal for Schedule but outside what the
plugin itself would create, and the next `open()` — any flip of the switch — rewrites the row's
`COUNT` back down to the configured cap (`src/loop.ts`, the in-place refresh). `chain` is the
default for that reason; `single` is for an operator who has decided not to touch the switch again.

## Stop rules (the loop ends itself; a person clears the cause)

The guard (`.rsi/tools/heartbeat-guard.sh`) is the first thing every heartbeat runs, with
`--max-rounds 1000 --threshold 3`. Its first word decides the turn:

| code | what happened | who clears it, and how |
| --- | --- | --- |
| `stop-file` | `.rsi/STOP` exists | the operator removes `.rsi/STOP` once the cause is gone |
| `round-cap` | the next round would be above 1000 | nobody: the budget is spent (see below) |
| `blocked-streak` | 3 consecutive `BLOCKED` rounds at the ledger tail | the operator unblocks the theme named in `.rsi/ROUND.md` |
| `stall-unclosed` | 3 consecutive skips of the same unclosed round | whoever owns that round closes it (commit it or record `BLOCKED`) |
| `budget-exhausted` | the ledger already accounts for 1000 rounds | nobody: the budget is spent |
| `protocol-stop` | `PROTOCOL.md` §"stop conditions": no theme above its risk, 2 failed rounds, a redline breach | the operator re-ranks the POOL or resolves the breach |

A `STOP` also names the one action left: **pause or delete the heartbeat row** before the summary is
written, so a stopped loop does not keep waking a session that will only print the same summary
(AGENTS.md "no ownerless background work"). A skip is not a stop: it costs one heartbeat, and the
stall rule bounds even that.

## Budget rules

- **Used** = the higher of the highest round in `.rsi/ROUND.md` and the highest row in
  `.rsi/ledger.jsonl` — a round recorded in one place was still spent.
- **Remaining** = 1000 − used. The plan refuses to arm when remaining is 0 (`exit 20`,
  `stop code=budget-exhausted`) and prints no arms.
- A round spends **one** budget unit whatever its outcome (`OK` or `BLOCKED`); re-running a round
  because it failed is the same round, not a new one.
- An arm's `COUNT` must not exceed 100 while the row is written by the plugin's switch, and must not
  exceed the plan's `rounds` otherwise: a wider row silently spends budget after the last round the
  plan promised.
- The budget is a ceiling, not a target: `PROTOCOL.md`'s stop conditions end the loop before 1000
  rounds if the pool has nothing worth doing. "Keep going because rounds remain" is the failure this
  budget exists to prevent, not a goal.

## One round, inside the harness

- **Theme = POOL top-next.** The open items in `.rsi/POOL.md` are in priority order as curated by
  hand; `--pool` names the next one and never re-ranks. A round picks exactly that item (or records
  why it cannot) — `PROTOCOL.md` step 2.
- **Code plus test, in the same round.** A behaviour change arrives with a test that fails on the
  old source and passes on the new one; a test count that drops without a deleted behaviour is a
  redline (`PROTOCOL.md` §"red lines").
- **Independent verification.** The round's report is not its own verification: the evidence it cites
  is inspected (files, commands, real logs), a child's self-report is treated as a claim
  (AGENTS.md "Truth rules for tests"), and `NOT_RUN` is written where nothing was executed. A round
  that cannot show a failing-then-passing pair has not landed a change.

## Envelope: concurrency and retries

The harness inherits the plugin's envelope and does not widen it: 10 concurrent child calls by
default and 100 as the hard maximum, 1 retry by default and 3 as the hard maximum
(`.rsi/harness.json` `envelope`, refused by the tool if either pair is exceeded). Across rounds the
concurrency is **1**: the guard skips a heartbeat when the previous round is still open, so two
rounds never share the tree.

## Plugin unload

The harness adds no timer, no listener and no background task: `iterate-plan.mjs` is a read-only CLI
that exits, and the only durable thing it touches is the heartbeat row Schedule owns. The invariant it
must not break is the plugin's: unload cancels and disposes active runs, releases every registration,
and leaves no ownerless work — pinned by `test/plugin-lifecycle.spec.ts` ("cancels and disposes active
runs during plugin unload", "cancels a run that arrives after plugin unload during startup") and by
`test/client.spec.ts` ("drops every registration on unbind instead of rebuilding them in a dead
scope"). A stopped loop's row is the operator's to pause or delete; nothing in this repository keeps
waking it.

## Not verified here (`NOT_RUN`)

- A real delivery under an armed harness row: arming needs a user action or a session with Schedule
  tools, and this attempt is a delegated subagent (refused, see above). The plan, the guard's
  `round-cap` behaviour and the row format are verified; the delivery is not.
- A GUI click-through of the *Self-iterate* switch.
- The row's real edit path when a `COUNT` is patched by hand: `open()`'s in-place refresh is read from
  `src/loop.ts` and from the prior round's evidence, not exercised here.

## The first increment under this discipline

Round 35 (POOL item `R35`, commit `0ef5bb7`) is the increment the harness was built around: one
theme, code plus test, red first. Verified independently here rather than taken from that round's
report — a throwaway worktree at the pre-fix commit `91ed287` with the round's own test file copied
in fails with `expected [Function] to throw an error` (the nested key was accepted silently), while
the landed source passes; the run is `.rsi/evidence/harness/round-035-red-independent.txt`.

What the harness adds around that cadence is the *selection* and the *ceiling*: `--pool` names the
next item (`top_next=line 72`, the `roles`-not-an-object entry, at the time of writing), the plan
names the arm and its round window, and the guard refuses round 1001.

## Evidence

`.rsi/evidence/harness/` — `plan.txt` (the plan above), `pool.txt` (open items and `top_next`),
`guard-cap.txt` (the guard at round 1000 and 1001), `red-pin.txt` (the constants drifted → 9
failures), `green.txt` (the test file green), `ci.txt` (`npm run ci`: 69 files / 1251 tests, exit 0),
`round-035-red-independent.txt` (the pre-fix source failing the landed test).
