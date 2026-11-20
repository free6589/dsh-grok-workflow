# Verify — armed heartbeat row, round 39 (verification only, attempt 2)

Captured 2026-11-20T16:32:09+08:00 (08:32:09Z) at commit `366d169`, tree `main...origin/main`,
with pre-existing uncommitted work in `src/`, `lib/`, `test/` that another process authored and
this task did not touch.

Method: read-only. The commands were `node .rsi/tools/iterate-plan.mjs --arm-spec` and
`--verify-row` (both documented read-only: the store "is read, never written, and the prompt of
every row is reduced to its length", `.rsi/tools/iterate-plan.mjs:429-430`, `readScheduleStore` at
`:434`), plus a
separate read-only probe of `/home/fish/.dsh/storages/schedule.json` that never prints prompt text.

No `schedule_edit` / `schedule_create` call was made. Mutation was **structurally unavailable**, not
merely avoided: the whole `schedule_*` family is refused for a delegated subagent
(`schedule_list` → `{"code":"subagent_session","message":"A delegated subagent cannot use scheduled tasks."}`).
The store's own mtime corroborates it — `2026-11-20 15:36:57.110 +0800`, i.e. the 07:36:57Z delivery
write, hours before this task ran.

Raw capture: [verify-round39-live.txt](verify-round39-live.txt).

## 1. Slot title unchanged

- Live row id `schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab`, `record.title` = `"RSI heartbeat"`.
- Slot key the tool matches on: `.rsi/tools/iterate-plan.mjs:83` → `taskTitle: 'RSI heartbeat'`,
  used at `:368` (`store.rows.filter(row => row.title === config.taskTitle)`).
- `--verify-row` check: `verify check title ok: row schedule-0bbbef5f-… carries the slot title`.
- `--arm-spec` agrees: `arm-spec status=OPEN title="RSI heartbeat" mode=edit id=schedule-0bbbef5f-…`.

CONFIRMED — title is the slot key, unaltered.

## 2. rrule COUNT=969, `--verify-row` exit 0 → ARMED

Live rule, read from the store:

```
DTSTART:20261120T073657Z
RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=969
```

`--verify-row`, verbatim:

```
verify status=ARMED title="RSI heartbeat" remaining=962
verify row=schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab COUNT=969 delivered=7 covered=962 last=2026-12-30T15:36:57.000Z
verify check title ok: row schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab carries the slot title
verify check rule-parsed ok: COUNT=969, INTERVAL=60
verify check within-row-maximum ok: COUNT=969 vs row maximum 1000
verify check covers-remaining-budget ok: 962 round(s) left in the row (COUNT 969 - 7 delivered) vs 962 remaining
verify check has-a-future-occurrence ok: last occurrence 2026-12-30T15:36:57.000Z vs now 2026-11-20T08:32:09.926Z
VERIFY_EXIT=0
```

- `VERIFY_EXIT=0` ⇒ `ARMED` (`iterate-plan.mjs:665`: `0` ARMED, `21` NOT_ARMED, `22` unreadable store).
- All five checks `ok`; `out.status` is `ARMED` only when every check passes (`:511`).
- Last occurrence recomputed **fresh from `DTSTART`**, not reused from any stored string:
  `2026-11-20T07:36:57Z + 968 × 60 min = 2026-12-30T15:36:57.000Z` (= 2026-12-30 23:36:57
  Asia/Singapore). It matches the tool's value — `matches_tool true`.

### Why covered/remaining is 962, not the 963 the task expected

The task context expected 963. That figure was true at the 14:45 capture
([armed-verified.txt](armed-verified.txt): `delivered=6 covered=963 remaining=963`). One **real
delivery has since fired**, and it is the row working, not the row drifting:

- `deliveryHistory.records` = 7; the last entry is `deliveredAt 2026-11-20T07:36:57.106Z` against
  `scheduledAt 2026-11-20T07:36:57.000Z` — its own first slot under the new `DTSTART`.
- Table `status` = `active`; `record.scheduledAt` advanced to `2026-11-20T08:36:57.000Z`.
- `COUNT` is still `969`. Only `delivered` moved (6 → 7), so `covered = 969 − 7 = 962`, and the
  plan's `remaining` is `962`. The check is `covered >= remaining` → `962 >= 962`, pass.

Two honest caveats about that arithmetic:

1. `covered = COUNT − deliveries` counts **all** historical deliveries, including the 6 that
   belonged to the pre-arm rule. Under the current `DTSTART` only one occurrence has elapsed, so
   the row truly has 968 occurrences left while the tool reports 962. The tool is therefore
   *conservative* here, not optimistic — the pass stands either way.
2. The rule ends at `2026-12-30T15:36:57Z` by construction. Reaching round 1000 depends on a future
   arming, which is deliberately the operator's call (`D-066`, `D-093`).

CONFIRMED — ARMED, exit 0, `COUNT=969`, covered 962 / remaining 962, last occurrence
`2026-12-30T15:36:57.000Z`.

## 3. Prompt is the 2319-char harness block

- `--arm-spec prompt=.rsi/HEARTBEAT-PROMPT.md chars=2319/4000 fits=yes`.
- Live `record.prompt.length` = `2319`.
- The block between `<!-- arm-prompt:start -->` (`.rsi/HEARTBEAT-PROMPT.md:11`) and
  `<!-- arm-prompt:end -->` (`:53`), `.trim()`-ed exactly as `readPrompt` does
  (`iterate-plan.mjs:344`), measures `2319`.
- **Byte-identical**: extracted block `===` live prompt → `true`. The legacy 3239-char prompt is gone
  (`legacy_header false` — no `self-iteration round` heading).
- All three required markers are present in the live prompt, plus `top_next`:
  `heartbeat-guard.sh` = true, `--round auto` = true, `--max-rounds 1000` = true, `top_next` = true.

Marker excerpt from the live block (first lines, the guard call, the arming boundary):

```
# RSI heartbeat

This message was delivered by a schedule (`source.kind = "schedule"`), not by the operator.
Nobody will answer inside this turn: do not ask questions, do not wait for approval, decide and
record. Work in `dsh-grok-workflow` only.

## Step 0 — guard first

    .rsi/tools/heartbeat-guard.sh --round auto --max-rounds 1000 --record
…
- Do not arm, extend or delete the heartbeat row: `.rsi/tools/iterate-plan.mjs --arm-spec` prints
  the one call, and arming stays the operator's (`D-066`, `D-093`).
- Never write a secret into a record; `NOT_RUN` where nothing was executed.
```

The block's own text forbids arming from inside a delivered round, which is consistent with this
task being verification-only.

CONFIRMED.

## 4. Evidence-file consistency — `armed-row.txt` is stale (one criterion unmet)

Two files in this directory claim to record the armed row. They disagree with each other, and only
one of them agrees with the live row.

**[armed-verified.txt](armed-verified.txt)** (mtime `14:45:14`, captured at `695672f`) — **consistent**:

```
verify status=ARMED title="RSI heartbeat" remaining=963
verify row=schedule-0bbbef5f-… COUNT=969 delivered=6 covered=963 last=2026-12-30T15:36:57.000Z
row prompt_len     2319
prompt mentions 'heartbeat-guard.sh': True
prompt mentions '--round auto': True
prompt mentions '--max-rounds 1000': True
```

Every field matches the live row except `delivered=6 / remaining=963`, which the 07:36:57Z delivery
has since moved to 7 / 962. That is a superseded counter, not a contradiction.

**[armed-row.txt](armed-row.txt)** (mtime `14:40:18`, 603 bytes) — **NOT consistent**. It is a
pre-arm snapshot and still carries the legacy prompt:

```
id             schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab
title          RSI heartbeat
rrule          DTSTART:20261120T073657Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=969
scheduledAt    2026-11-20T07:36:57.000Z
deliveries     6
prompt_len     3239
prompt first line: # RSI heartbeat — self-iteration round
prompt mentions 'heartbeat-guard.sh': False
prompt mentions '--round auto': False
prompt mentions '--max-rounds 1000': False
```

Against the live row it is wrong on four fields: `prompt_len` 3239 vs **2319**, and all three
markers `False` vs **True**, and `deliveries` 6 vs **7**. Its `COUNT=969` and `title` happen to
match, which is exactly what makes the file dangerous to skim: it looks current while describing the
prompt that was replaced at 14:44.

Why it is stale is documented, and it is not a regression: `.rsi/ROUND.md:1163` and
`docs/knowledge/HANDOFF.md:19` both describe `armed-row.txt` as the **3,239-char pre-swap** capture.
The file was written at 14:40; the prompt swap landed at 14:44. It was never re-captured.

**This is the one acceptance criterion this task does not meet**, and I did not repair it. The
task's write scope is `.rsi/evidence/harness/verify-*.txt/md`; `armed-row.txt` is outside it. The
stricter reason is that this is a verification task: rewriting the artifact under verification would
erase the finding that the arm's evidence trail has a stale file in it. Reporting it is the correct
output; silently refreshing it would have produced a green check over a real gap.

## 5. The one-command fix (not applied here)

The exact content `armed-row.txt` should hold is staged read-only, in scope, at
[verify-round39-armed-row-refresh.txt](verify-round39-armed-row-refresh.txt). To apply it:

```
cp .rsi/evidence/harness/verify-round39-armed-row-refresh.txt .rsi/evidence/harness/armed-row.txt
```

That is a file-only operation — it touches no schedule row, no title, no rrule and no prompt. After
it, `armed-row.txt` and `armed-verified.txt` agree with the live row on every field except the
`deliveries` counter, which is expected to keep moving each hour.

## What is NOT established

- I did not and could not create, edit or delete a schedule row; the `schedule_*` family is refused
  for a delegated subagent. The row's behaviour after `2026-12-30T15:36:57Z` is unverified by
  construction — the rule ends there, and the next arm is the operator's call.
- The 07:36:57Z beat is confirmed only as a record in the host's `deliveryHistory`. What that
  delivered turn did inside its own session is out of scope here.
- `--arm-spec` prints a **different** rule than the live one (`DTSTART:20261120T093210Z`,
  `COUNT=962`) because the plan re-derives a fresh anchor from the current clock and the
  now-smaller remaining budget, and its `next:` line proposes an edit. That is the tool proposing
  the *next* arming, not evidence that the live row deviates from its intent. No arming was
  performed, and none should be performed while the row is ARMED.
- The `src/`, `lib/`, `test/` modifications in `git status` are a concurrent build by another
  process in this shared checkout. This task ran read-only node scripts and wrote three evidence
  files under `.rsi/evidence/harness/`.
