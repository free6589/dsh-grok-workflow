# Verify — armed heartbeat row, round 40 (verification only, no mutation)

Captured 2026-11-20T19:12+08:00 (11:12Z) on branch `main...origin/main`. Tree carried pre-existing
uncommitted work in `CHANGELOG.md`, `src/checkpoint/schema.ts`, `src/delivery/index.ts`,
`lib/delivery/*`, `test/delivery-human-block.spec.ts` plus one untracked test and a dozen untracked
evidence files, all authored by other processes; this task touched none of them.

Method: read-only. Two commands only — `node .rsi/tools/iterate-plan.mjs --verify-row` (the tool's
read path: `readScheduleStore` "is read, never written, and the prompt of every row is reduced to its
length", `.rsi/tools/iterate-plan.mjs:429-430`) and a probe of `~/.dsh/storages/schedule.json` that
prints titles, rules and delivery timestamps but never prompt text. No `--record`, `--write`,
`--arm-spec` side effect, no build, test, fetch or push.

Mutation was **structurally unavailable**, not merely avoided: `schedule_list` (read-only, called as
a probe) returns `{"code":"subagent_session","message":"A delegated subagent cannot use scheduled
tasks."}`, so the whole `schedule_*` family — `schedule_edit` included — is refused for this
session. The store's mtime corroborates it: `2026-11-20 18:36:57.175 +0800` (10:36:57Z), the write
of the 10:36:57Z delivery, 36 minutes before this task started.

## 1. Verdict and full row output

Command: `node .rsi/tools/iterate-plan.mjs --verify-row` → **exit 21** (documented meaning at
`.rsi/tools/iterate-plan.mjs:46`: "`--verify-row` found the harness NOT_ARMED").

```text
verify status=NOT_ARMED title="RSI heartbeat" remaining=962
verify row=schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab COUNT=969 delivered=10 covered=959 last=2026-12-30T15:36:57.000Z
verify check title ok: row schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab carries the slot title
verify check rule-parsed ok: COUNT=969, INTERVAL=60
verify check within-row-maximum ok: COUNT=969 vs row maximum 1000
verify check covers-remaining-budget FAIL: 959 round(s) left in the row (COUNT 969 - 10 delivered) vs 962 remaining
verify check has-a-future-occurrence ok: last occurrence 2026-12-30T15:36:57.000Z vs now 2026-11-20T11:09:40.511Z
verify store=/home/fish/.dsh/storages/schedule.json
verify detail=row schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab does not cover the 962 rounds left: covers-remaining-budget
verify next: node .rsi/tools/iterate-plan.mjs --arm-spec --json   (then the one schedule call it names)
```

| quantity | value | source |
| --- | --- | --- |
| exit code | 21 (`NOT_ARMED`) | command above |
| status | `NOT_ARMED` | `verify status=…` |
| COUNT | 969 | row `rrule` |
| delivered (deliveryHistory records) | 10 | `delivered=10` |
| covered | 959 | `covered=959` |
| remaining budget | 962 | `remaining=962` |
| last occurrence | 2026-12-30T15:36:57Z | `last=…` |
| next occurrence (host `scheduledAt`) | 2026-11-20T11:36:57Z | store `record.scheduledAt` |
| budget used / total | 38 / 1000 | `--verify-row` reads the plan; `plan shape=single total=1000 used=38 remaining=962` |

`used=38` is `max(reportMax, ledgerMax)` (`.rsi/tools/iterate-plan.mjs:194-210`): `## Round 38` at
`.rsi/ROUND.md:1174` and the round-38 row at `.rsi/ledger.jsonl:34` agree, so 962 rounds of budget
remain. Four of five checks pass; only `covers-remaining-budget` fails, and it fails by 3
(959 vs 962).

## 2. Gap diagnosis — the 3-round shortfall is an accounting artifact, not a coverage hole

The stored rule is `DTSTART:20261120T073657Z` + `FREQ=MINUTELY;INTERVAL=60;COUNT=969`, i.e.
occurrence *n* = 07:36:57Z + (n−1)h, last one 07:36:57Z + 968h = **2026-12-30T15:36:57Z**.

The row's `deliveryHistory` holds **10** records spanning **two different rules**:

| # | scheduledAt (UTC) | rule it belongs to |
| --- | --- | --- |
| 1-6 | 01:01:50, 02:01:50, 03:01:50, 04:01:50, 05:01:50, 06:01:50 | **retired** `COUNT=10` rule, `DTSTART:20261120T010150Z` |
| 7-10 | 07:36:57, 08:36:57, 09:36:57, 10:36:57 | **current** `COUNT=969` rule — exactly occurrences 1, 2, 3, 4 |

`readScheduleStore` counts every record (`deliveries: … entry.deliveryHistory.records.length`,
`.rsi/tools/iterate-plan.mjs:455`) and `verifyArm` computes `covered = COUNT - deliveries`
(`:498`, used by the failing check at `:505`). So the tool subtracts **10** deliveries from a COUNT
whose clock only started at 07:36:57Z, where only **4** occurrences have actually been spent.

- tool's covered: 969 − 10 = **959**
- true occurrences still ahead: 969 − 4 = **965**
- remaining budget: **962**

965 ≥ 962 — the row genuinely covers the remaining budget with **3 occurrences to spare**. The
6-record undercount is exactly the six pre-re-arm deliveries, and COUNT=969 was itself set as
`963 + 6` last round precisely to satisfy this same check, so the inflation and the miscount cancel
except for the net 3 (6 undercount − 3 real surplus = the reported 3).

Second, independent fact worth naming — delivery→round conversion is 1 in 4 since the re-arm, and
that is what ate the 6-occurrence slack down to 3. Delivery 7 (07:36:57Z) became round 38 (ledger
`.rsi/ledger.jsonl:34`, report `.rsi/ROUND.md:1174`). The next three deliveries landed no round;
`.rsi/evidence/heartbeat-guard.log` records them:

```text
2026-11-20T16:37:18+08:00 verdict=SKIP code=dirty-tracked  next_round=39 dirty_tracked=10   (08:37:18Z)
2026-11-20T17:37:23+08:00 verdict=SKIP code=dirty-tracked  next_round=39 dirty_tracked=3    (09:37:23Z)
2026-11-20T18:37:10+08:00 verdict=STOP code=stall-unclosed next_round=39 dirty_tracked=8    (10:37:10Z)
```

Each unlanded delivery consumes one occurrence while `used` stays at 38, which is why the real
surplus fell 6 → 3 and why the tool's gap widened from 0 at re-arm time to 3 now. Unlanded
deliveries cost the *slack*, not the *budget*: no round was recorded, so 962 is still honest.

Net: **the row is delivering and would cover round 39..1000; the `NOT_ARMED` verdict is a false
negative produced by counting deliveries from a retired rule against the current COUNT.** The
tool's arithmetic is a valid lower bound only when a row has never been re-armed.

## 3. Re-arm condition

Two honest ways to make the check pass, plus one precondition. None was executed here.

1. **Precondition (blocking, guard side).** The 18:37:10Z `STOP code=stall-unclosed` must be cleared
   before any re-arm matters: round 39 is open in the guard's view and the working tree has dirty
   tracked files. If it is not, the next delivery at 11:36:57Z stops the same way and burns another
   occurrence, widening the gap by 1 per hour. Clearing it means closing round 39 or committing the
   concurrent writer's work — both outside this task's scope.
2. **Schedule-side (mutates the store, NOT done):** keep `DTSTART:20261120T073657Z` and set
   `COUNT ≥ remaining + delivered = 962 + 10 = 972`. The tool would then report
   `covered=962 ≥ remaining=962` → exit 0. Cost: true future occurrences become 972 − 4 = 968
   against a 962-round budget, i.e. up to 6 occurrences past round 1000, bounded only by the guard's
   `--max-rounds 1000` (`stop code=round-cap`). Repeating this each re-arm compounds the surplus.
3. **Tool-side (mutates repo code, NOT done — the correct fix):** in
   `.rsi/tools/iterate-plan.mjs:455` keep `scheduledAt` per delivery record and, at `:498`, subtract
   only records with `scheduledAt ≥ rule.startMs`. `covered` becomes 965 ≥ 962 → `ARMED` with no
   COUNT change and no overshoot. Until that lands, every `--verify-row` on a re-armed row will
   under-report by the number of pre-re-arm deliveries (6 today, growing by 1 per delivered round).

## 4. No mutation performed

- Store bytes unchanged: `sha256 5bc4d86d98fc80a5b1ae907a65bd202047aec9673b7eb8bf6977061a86f7ba34`
  before and after the `--verify-row` run (same digest, same file `~/.dsh/storages/schedule.json`).
- Store mtime `2026-11-20 18:36:57.175 +0800`, 36 minutes before this task; nothing in this run
  wrote it.
- `git status --porcelain` taken before this file existed (31 entries) and re-taken after: the only
  delta is this file, `?? .rsi/evidence/harness-round40.md`. No tracked file, schedule, or working
  tree change was made by this task.
- No `.rsi/STOP` file exists (checked), so the `stop-file` condition is not what ails the loop.

## 5. Honest limits

- The 11:36:57Z delivery was still in the future at capture time; whether it lands a round is
  `NOT_RUN` and unknowable from here.
- The claim "965 ≥ 962 therefore the row covers the budget" assumes the host keeps delivering every
  occurrence of the stored rule. The delivery history shows it has done so every hour since 07:36:57Z
  (10/10 records have `deliveredAt` within 0.3s of `scheduledAt`), but that is observation, not a
  guarantee.
- The guard STOP is reported from the guard's own log; I did not re-run `heartbeat-guard.sh` (that
  would write to the log).
