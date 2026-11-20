# Cross-check: the arm the repository's own planner prints

`04-rearm-plan.md` was written before this file appeared in the tree. Round 35's continuation
committed `.rsi/tools/iterate-plan.mjs` (commit `0d91e45`) plus `.rsi/harness.json`, which computes
the next arm from the ledger instead of from judgement. Its answer is larger than my hand
computation because the harness budget is 1000 rounds (`.rsi/harness.json` `totalRounds`), not the
251 rounds needed to reach 2026-12-01. Prefer it — it is the repository's own convention, and
`test/iterate-plan.spec.ts` pins its bounds against `src/config.ts` / `src/loop.ts`.

```
$ node .rsi/tools/iterate-plan.mjs
plan shape=single total=1000 used=35 remaining=965
arms=1 interval=60 guard_args="--max-rounds 1000 --threshold 3" status=OPEN
arm 1/1 rounds=965 rounds_window=36..1000
arm 1/1 rrule=DTSTART:20261120T060828Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=965
```

Coverage of that arm (computed here, not copied): anchor `2026-11-20T06:08:28Z`, 965 hourly
occurrences, last one `2026-12-30T10:08:28Z` = **2026-12-30T18:08:28+08:00**, i.e. 714.1 h past the
2026-12-01T00:00+08:00 boundary. `rowMaxRounds: 1000` is why `COUNT=965` is legal:
Schedule accepts it even though the plugin's own `loopMaxRounds` config ceiling is 100
(`src/config.ts:42`) — the ceiling governs what a composer switch re-open would write, not what a
direct `schedule_edit` may store.

## The one operator action

```
schedule_edit(
  id: "schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab",
  rrule: "DTSTART:20261120T060828Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=965",
)
```

Keep the title `RSI heartbeat` and keep the prompt; only the timing patch changes. The title is what
the plugin's row predicates match — `isLoopSlot` at `src/loop.ts:338-340` (`task.title !== LOOP_TASK_TITLE`)
and the per-instance `slotOf` at `src/loop.ts:457` — so a renamed row would stop being the plugin's
slot (selectable/closeable) even though Schedule would keep delivering it. Two caveats:

- `DTSTART` must still be in the future when the edit lands; if it is not, re-run the planner and
  paste its new anchor — the tool prints one derived from the current clock.
- The plugin's own policy is unchanged, so any later Self-iterate flip rewrites the rule back to
  `loopMaxRounds` (≤100) and coverage collapses to ~2026-11-24. If the switch will be used, set
  `loopMaxRounds`/`iterateIntervalMin` first (see `04-rearm-plan.md`, Option A).

Anchor correction for `04-rearm-plan.md`: that file cites `src/loop.ts:338` as `slotOf`; `:338-340` is
`isLoopSlot` and the service's own `slotOf` is `:457`. The statement it supports (title, not prompt,
identifies the slot) is unchanged.

## Verification (independent of any report)

Row shape right after the edit:

```
python3 -c "import json,os;d=json.load(open(os.path.expanduser('~/.dsh/storages/schedule.json')));\
v=d['tables']['tasks']['schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab'];\
print(v['record']['rrule']);print(v['record']['scheduledAt'])"
```

First beat after the anchor (two independent host-written places, either one is sufficient):

```
zstd -dc ~/.dsh/sessions/--home-fish-projects_mine-dsh-grok-workflow--/session-3a683cb6-1eaa-4b33-9eb9-57e1ef0b955b/session.v4.jsonl.zstd \
  | grep -o '"occurrence_at": "[^"]*"' | tail -3
```

plus `deliveryHistory` / `lastDelivery` in the store gaining a record whose `scheduledAt` is after
the edit and whose `messageId` is new. `02-delivery-proof.txt` shows what that pair looks like for
the five pre-re-arm beats.

## What this attempt still did not do

The edit above was **not** executed here: a delegated subagent is refused the whole `schedule_*`
family (`03-blocker.txt` §1), and the product's own arm path is user-only (`§2`). Nothing in this
directory is a claim that the heartbeat now covers 2026-12-01 — it does not; it still ends at
2026-11-20T18:01:50+08:00.
