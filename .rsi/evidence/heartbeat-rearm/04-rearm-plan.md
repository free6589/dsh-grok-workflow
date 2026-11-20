# Re-arm plan for the `RSI heartbeat` row (not executed here)

This attempt could not perform the re-arm (see `03-blocker.txt`). What follows is the action
the operator — or the root agent if it holds Schedule tools — must take, with the numbers
computed from the stored rule and the shipped policy ceilings rather than remembered.

## Current state (`CONFIRMED`, read from `~/.dsh/storages/schedule.json`)

| field | value |
| --- | --- |
| id | `schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab` |
| title | `RSI heartbeat` |
| rrule | `DTSTART:20261120T010150Z` + `RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=10` |
| status | `active` |
| target session | `session-3a683cb6-1eaa-4b33-9eb9-57e1ef0b955b` |
| deliveries so far | 5 of 10 (`01:01:50Z` … `05:01:50Z`, each with a `messageId`) |
| last occurrence | `2026-11-20T10:01:50Z` = **2026-11-20T18:01:50+08:00 — the loop dies today** |
| coverage to 2026-12-01 | **NO** — short by ~246 h |

## The ceilings that shape any fix

- `src/config.ts:42` `HARD_LIMITS.loopMaxRounds = 100`; `src/config.ts:139` default `10`.
- `src/config.ts:45,47` interval ceilings `loopIntervalMin` / `iterateIntervalMin` = 10 080 min (7 d).
- `src/loop.ts:383-386` `loopPolicyFromConfig` clamps rounds to 1..1000 and the interval to the floor
  `max(60, ceil(timeoutMs/60 000), configured)`.
- `src/loop.ts:412-421` `loopRrule` (called at `:515` with the live policy's rounds) anchors `DTSTART` one interval ahead of the next whole second, so
  every stored occurrence is still in the future and `COUNT` is not silently spent on the anchor.

Consequence: **hourly + 100 rounds reaches only 2026-11-24T17:30+08:00.** An hourly heartbeat that
survives to 2026-12-01 needs `COUNT >= 251`, which the shipped policy cannot store. Two ways out,
both needing a user-level action:

## Option A — stay inside the shipped policy (cadence becomes 3-hourly)

1. Set the plugin config in the running profile (`~/.dsh/profiles/web/cordis.patch.yml`, the
   `id: grok-workflow` block) to `loopMaxRounds: 100`, `iterateIntervalMin: 180`.
2. Flip the composer **Self-iterate** switch off and on (or on if it reads off). `open()`
   (`src/loop.ts:522-541`) sees `intervalMinutesOf` / `roundsOf` differ from the live policy and edits
   the existing row **in place** — same id, same title, same target.
3. Expected rule for a flip at 13:30+08:00:
   `DTSTART:20261120T083000Z` + `RRULE:FREQ=MINUTELY;INTERVAL=180;COUNT=100`
   → last occurrence `2026-12-02T17:30Z` = **2026-12-03T01:30+08:00** (84 rounds is the minimum).

Trade-off: 8 rounds/day instead of 24.

## Option B — keep the hourly cadence (drifts on the next switch flip)

`schedule_edit` the row directly, keeping the title so `slotOf` (`src/loop.ts:338`) still owns it:

```
id:    schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab
rrule: DTSTART:20261120T063000Z
       RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=280
```

→ last occurrence `2026-12-01T21:30Z` = **2026-12-02T05:30+08:00**. `DTSTART` must be a future
occurrence (or the first beat is skipped). Drift: the next Self-iterate flip recomputes `COUNT` from
`loopMaxRounds` (≤100) and drops coverage back to 2026-11-24, so Option A is the durable one and this
one should be paired with, or replaced by, it.

## Verification that does not rely on a self-report

Before the first post-re-arm occurrence (row shape):

```
python3 -c "import json,os;d=json.load(open(os.path.expanduser('~/.dsh/storages/schedule.json')));\
v=d['tables']['tasks']['schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab'];\
print(v['record']['rrule']);print(v['record']['scheduledAt']);print(v.get('lastDelivery'))"
```

After it (real delivery, two independent places):

```
zstd -dc ~/.dsh/sessions/--home-fish-projects_mine-dsh-grok-workflow--/session-3a683cb6-1eaa-4b33-9eb9-57e1ef0b955b/session.v4.jsonl.zstd \
  | grep -o '"occurrence_at": "[^"]*"' | tail -5      # host-written transcript
```
plus the same store read: `deliveryHistory` must gain a record whose `scheduledAt` is after the
re-arm and whose `messageId` is new. Either one alone is enough to show a beat really landed; a
report claiming delivery with neither is not evidence (`02-delivery-proof.txt` is what that pair
looks like for the pre-re-arm beats).

## Side observation

The store also holds `schedule-12eadb13-49c0-4479-9ac2-0d0e8e7ff1d0` ("派发个人助理灵感箱",
`FREQ=DAILY;BYHOUR=9,13,18,22;BYMINUTE=0`, no `COUNT`/`UNTIL`) — that row's recurrence does run past
2026-12-01, but it delivers the personal-assistant dispatch prompt to a different session
(`session-a52a4e1d-…`) and drives no RSI round. It cannot stand in for the heartbeat.
