# Harness — 1000 rounds, one arming action

The loop's budget is **1000 rounds**. This file is the contract that makes that number real
without turning any single run into a long loop: one scheduled delivery is one round, one
heartbeat row carries the whole remaining budget, and the guard refuses round 1001. Nothing in
this repository counts to 1000 inside a process.

Read this together with `.rsi/HEARTBEAT.md` (the per-round contract), `.rsi/HEARTBEAT-PROMPT.md`
(the constant prompt a row stores), `.rsi/PROTOCOL.md` (what one round must contain) and
`.rsi/harness.json` (the numbers).

## The numbers, and where each one comes from

| number | value | source | pinned by |
| --- | --- | --- | --- |
| budget | 1000 rounds | `.rsi/harness.json` `totalRounds` | `test/iterate-plan.spec.ts` (plan sums to the budget) |
| cadence | 60 min | `src/loop.ts` `DEFAULT_LOOP_INTERVAL_MINUTES` | the same test, against that constant |
| row maximum | 1000 rounds | `src/loop.ts` `loopPolicyFromConfig` clamp `1..1000` | the same test, against that clamp |
| plugin-switch arm width | 100 rounds | `src/config.ts` `HARD_LIMITS.loopMaxRounds` | the same test, against that constant |
| round ceiling | 1000 | `.rsi/harness.json` `stop.roundCap` | `heartbeat-guard.sh --max-rounds` behaviour, run by that test |
| row title | `RSI heartbeat` | `src/loop.ts` `ITERATE_TASK_TITLE` | the same test, against that constant |
| prompt bound | 4000 chars | `src/loop.ts` `MAX_LOOP_PROMPT_CHARS` | the same test, against that constant, and the real prompt file's size |
| concurrency | 10, hard max 100 | `src/config.ts` `DEFAULT_MAX_CONCURRENCY` / `HARD_LIMITS.maxConcurrency` | the same test |
| retries | 1, hard max 3 | `src/config.ts` `FIXED_MAX_RETRIES` / `HARD_LIMITS.maxRetries` | the same test |

Three of those numbers are *not* interchangeable, and the difference is measured rather than
assumed (`A40`, `A42`): `loopRrule` formats whatever `COUNT` it is handed, so the 1000 ceiling
lives in `loopPolicyFromConfig`; the configuration key `loopMaxRounds` is refused above **100** at
load (`src/config.ts:992`), so the plugin's own switch cannot ask for a wide row; and the plugin's
`open()` accepts a prompt of at most 4000 characters, which is why the arm prompt is a constant
file and not this round's filled-in numbers.

## One delivery, one round, one row

- A delivery is a message with `source.kind = "schedule"`; the round it opens is the only work that
  turn does. Deliveries do not stack: a delivery that arrives while the previous round is open is
  refused or merged, and after a Host restart only the latest missed occurrence is delivered.
- A row is an `RRULE` with `INTERVAL=60` and a finite `COUNT`. In the default shape (`single`) that
  `COUNT` is the whole remaining budget, so **reaching round 1000 costs exactly one arming
  action** and nothing after it (`D-093`). The `chain` shape stays available for an operator who
  wants every row inside the width the plugin's own switch writes: arms of at most 100 rounds,
  each armed when its predecessor ends, which costs one arming action per arm.
- Rows are sequential, never parallel: two rows would mean two rounds per hour against one POOL.

## The arm plan

`.rsi/tools/iterate-plan.mjs` reads the durable state (`.rsi/ROUND.md` sections and
`.rsi/ledger.jsonl` rows, taking the higher round the way the guard does), subtracts it from the
budget, and prints what to arm — read-only, no timer, no state of its own:

```text
$ node .rsi/tools/iterate-plan.mjs
plan shape=single total=1000 used=36 remaining=964
arms=1 interval=60 guard_args="--max-rounds 1000 --threshold 3" status=OPEN
arm 1/1 rounds=964 rounds_window=37..1000
arm 1/1 rrule=DTSTART:20261120T070000Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=964
envelope maxConcurrency=10/100 retries=1/3
```

`--arm-spec` turns that plan into the one call — the slot title, whether to edit an existing row or
create one, the exact `rrule`, and the prompt with its size checked against the plugin's bound:

```text
$ node .rsi/tools/iterate-plan.mjs --arm-spec
arm-spec status=OPEN title="RSI heartbeat" mode=edit id=schedule-0bbbef5f-…
arm-spec rounds=964 window=37..1000 interval=60 remaining=964 used=36
arm-spec rrule=DTSTART:20261120T070000Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=964
arm-spec prompt=.rsi/HEARTBEAT-PROMPT.md chars=2319/4000 fits=yes
arm-spec live-row=schedule-0bbbef5f-… COUNT=10 delivered=5
arm-spec next: row schedule-0bbbef5f-… carries the slot title with COUNT covering 5 delivered
occurrence(s); edit its rrule to the one above, keep the title and prompt
```

`--verify-row` answers the question the loop cannot ask itself: **is the harness armed?** It reads
the host's schedule store (`$DSH_SCHEDULE_STORE`, default `~/.dsh/storages/schedule.json`), never a
row's prompt text — only its length — and compares `COUNT - deliveries` (the rounds the row still
owes) with the budget's remaining rounds:

```text
$ node .rsi/tools/iterate-plan.mjs --verify-row
verify status=NOT_ARMED title="RSI heartbeat" remaining=964
verify row=schedule-0bbbef5f-… COUNT=10 delivered=5 covered=5 last=2026-11-20T10:01:50.000Z
verify check covers-remaining-budget FAIL: 5 round(s) left in the row (COUNT 10 - 5 delivered) vs 964 remaining
verify next: node .rsi/tools/iterate-plan.mjs --arm-spec --json   (then the one schedule call it names)
```

Exit codes: `0` ARMED, `21` NOT_ARMED, `22` the store could not be read (armed state unknown).
The other flags: `--json` prints the same plan as one object, `--pool` prints the open POOL items in
file order and marks the next one, `--shape chain` plans arms of at most 100 rounds, `--now` sets
the clock the `DTSTART` anchor is derived from.

## Arming the row

Arming is **not** something a round can do, and not something a delegated subagent can do (`D-066`;
measured again 2026-11-20: `schedule_list` answers `{"code":"subagent_session"}`). It is one
action, by the operator or by a session whose preset mounts `schedule_*`:

1. **The plugin's own switch** — the composer *Self-iterate* control, or
   `POST /grok-workflow/iterate` on a browser-authenticated connection. `open()` refuses every
   caller that carries an actor (`src/loop.ts`, `loop/user-only`), so this is a user action. It
   writes the row from `loopIntervalMin` (floor 60) and `loopMaxRounds` (≤100) and the configured
   `iterateTemplate`; set `loopMaxRounds: 100`, `iterateIntervalMin: 60` and paste
   `.rsi/HEARTBEAT-PROMPT.md`'s marked block as `iterateTemplate` if that channel is the one used.
   **Its row is at most 100 rounds**, so that channel alone reaches round 1000 only in `chain`
   shape.
2. **A session that holds Schedule tools** — one `schedule_create`, or one `schedule_edit` on the
   existing row id, with the `rrule` that `--arm-spec` prints. This is the channel that spends the
   whole budget in one call, and the one the default shape assumes.

Whichever channel arms it, the call is the same three values: `title` = `RSI heartbeat` (the
storage identity — a renamed row stops being the plugin's slot), `rrule` = the line `--arm-spec`
prints (recompute it at the instant of the call: the `DTSTART` anchor is derived from the clock and
a stale one is refused), `prompt` = the marked block of `.rsi/HEARTBEAT-PROMPT.md`. Then prove it
with `--verify-row` — not with a self-report.

**Caveat, measured in `src/loop.ts`.** A row wider than `loopMaxRounds` is legal for Schedule but
outside what the plugin's switch writes, and a later flip of the switch adopts the row and rewrites
its `COUNT` down to the configured cap (`open()`'s in-place refresh), collapsing coverage. `single`
is therefore the shape for an operator who will not touch the switch again; `chain` is the shape
for one who might. Either way `--verify-row` reports what is actually armed.

## Stop rules (the loop ends itself; a person clears the cause)

The guard (`.rsi/tools/heartbeat-guard.sh`) is the first thing every heartbeat runs, with
`--round auto --max-rounds 1000 --threshold 3`. `--round auto` derives the round from the records
(the higher of `ROUND.md` and `ledger.jsonl`, plus one), so one constant prompt opens every round
of the budget. Its first word decides the turn:

| code | what happened | who clears it, and how |
| --- | --- | --- |
| `stop-file` | `.rsi/STOP` exists | the operator removes `.rsi/STOP` once the cause is gone |
| `round-cap` | the next round would be above 1000 | nobody: the budget is spent |
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
- A row's `COUNT` must not exceed the plan's `rounds` and must not exceed the row maximum: a wider
  row would spend budget after the last round the plan promised, and `--verify-row` reports such a
  row as `NOT_ARMED`.
- The budget is a ceiling, not a target: `PROTOCOL.md`'s stop conditions end the loop before 1000
  rounds if the pool has nothing worth doing. "Keep going because rounds remain" is the failure this
  budget exists to prevent, not a goal.
- **A round counts when it is recorded.** Both the plan and the guard read `.rsi/ROUND.md` and
  `.rsi/ledger.jsonl`, so a round that landed code and wrote neither is invisible to both — the one
  gap this accounting cannot see (observed twice on 2026-11-20: round 36's fix `e3be559` reached
  `main` before its records did, and round 35's ledger row carried an empty `commit`). The record is
  the round's own last act, and a missing one is what step 1 of the next heartbeat is there to find.

## One round, inside the harness

- **Theme = POOL top-next.** The open items in `.rsi/POOL.md` are in priority order as curated by
  hand; `--pool` names the next one and never re-ranks. A round picks exactly that item (or records
  why it cannot) — `PROTOCOL.md` step 2.
- **Code plus test, in the same round.** A behaviour change arrives with a test that fails on the
  old source and passes on the new one; a test count that drops without a deleted behaviour is a
  redline (`PROTOCOL.md` §"red lines").
- **Independent verification.** The round's report is not its own verification: the evidence it cites
  is inspected (files, commands, real logs), a child's self-report is treated as a claim (AGENTS.md
  "Truth rules for tests"), and `NOT_RUN` is written where nothing was executed. A round that cannot
  show a failing-then-passing pair has not landed a change.

## Envelope: concurrency and retries

The harness inherits the plugin's envelope and does not widen it: 10 concurrent child calls by
default and 100 as the hard maximum, 1 retry by default and 3 as the hard maximum
(`.rsi/harness.json` `envelope`, refused by the tool if either pair is exceeded). Across rounds the
concurrency is **1**: the guard skips a heartbeat when the previous round is still open, so two
rounds never share the tree.

## Plugin unload

The harness adds no timer, no listener and no background task: `iterate-plan.mjs` is a read-only CLI
that exits, and the only durable thing it touches is the heartbeat row Schedule owns. The invariant
it must not break is the plugin's: unload cancels and disposes active runs, releases every
registration, and leaves no ownerless work — pinned by `test/plugin-lifecycle.spec.ts` ("cancels and
disposes active runs during plugin unload", "cancels a run that arrives after plugin unload during
startup") and by `test/client.spec.ts` ("drops every registration on unbind instead of rebuilding
them in a dead scope"). A stopped loop's row is the operator's to pause or delete; nothing in this
repository keeps waking it.

## Not verified here (`NOT_RUN`)

- A real delivery under an armed harness row: arming needs a user action or a session with Schedule
  tools, and both attempts so far were delegated subagents (refused, measured twice). What *is*
  verified: the plan, the arm spec, `--verify-row` against the live store, the guard's `round-cap`
  at 1001 and `--round auto`'s derivation.
- A GUI click-through of the *Self-iterate* switch.
- The row's real edit path when a `COUNT` is patched by hand: `open()`'s in-place refresh is read
  from `src/loop.ts`, not exercised.

## The first increment under this discipline

Round 37 (POOL item at `POOL.md:85`, commit in `.rsi/ROUND.md`) is the first round that ran
*inside* the harness: `--pool` named the item, the plan named the arm, the guard opened the round,
and the round landed one theme with code plus test — a `roles` value that is not an object is
refused instead of loading five empty chains. Its test fails on the pre-change reader and passes on
the landed one; the red run is `.rsi/evidence/harness/round-037-red.txt`, the green
`.rsi/evidence/harness/green-round-037.txt`.

The harness built before that round (round 35's planner, round 36's records) supplied the ceiling
and the accounting; round 37 supplied the thing the design exists to produce — one bounded round
that landed and was verified.

## Evidence

`.rsi/evidence/harness/` — `plan-single.txt` (the one-arm plan), `arm-spec.txt` / `arm-spec.json`
(the one call), `verify-row-live.txt` (`NOT_ARMED` against this host's real store), `guard-auto.txt`
(`--round auto` in a fixture repository), `green-iterate-plan.txt` (21 cases),
`green-heartbeat-guard.txt` (15 cases), `red-tool-pre-change.txt` (the new cases against the
pre-change tool), `round-037-red.txt` (the pre-change reader failing round 37's test),
`ci.txt` (`npm run ci`).
