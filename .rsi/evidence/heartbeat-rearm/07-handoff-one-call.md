# Handoff — the exact re-arm call, and the two decisions that go with it

This file is the actionable half of attempt 2. It records **no** re-arm. The row still ends
2026-11-20T18:01:50+08:00 (06-attempt2-verification.txt §2). What follows is the single call
that fixes it, plus the two things that make a naive version of that call fail.

## Decision 1 — the shape. The default plan cannot satisfy the criterion.

`.rsi/harness.json` currently says `shape: "chain"`, `armCapRounds: 100`. In that shape the
first arm is 100 hourly rounds, whose last occurrence is 2026-11-24T17:43:07+08:00 — 174 h
short of 2026-12-01. A chain reaches December only by arming arm 2 after arm 1 expires, so at
no instant does a single row cover through 2026-12-01. Criterion 1 asks for exactly that, so
the re-arm must use the planner's `single` shape:

    $ node .rsi/tools/iterate-plan.mjs --shape single
    plan shape=single total=1000 used=35 remaining=965
    arms=1 interval=60 guard_args="--max-rounds 1000 --threshold 3" status=OPEN
    arm 1/1 rounds=965 rounds_window=36..1000
    arm 1/1 rrule=DTSTART:20261120T064307Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=965

`COUNT=965` is legal for a Schedule row even though the plugin's config ceiling is 100: the
ceiling governs what a composer-switch re-open writes (`src/config.ts:42` HARD_LIMITS.loopMaxRounds,
`:992` load clamp); `loopPolicyFromConfig` clamps a row to 1..1000. `.rsi/HARNESS.md`
"Arming an arm" documents `single` as the shape for "an operator who has decided not to
touch the switch again".

**Recompute the rrule at the instant you edit it.** `rruleFor()` sets
`DTSTART = ceil(now) + 60 min` (`.rsi/tools/iterate-plan.mjs:197-200`), so the anchors printed
above and in 05 are already in the past by the time you read this. Run the command again and
paste its line; a stale `DTSTART` is refused by Schedule. First beat lands ~1 h after the edit.

## Decision 2 — round 36 is unaccounted, so `COUNT=965` over-spends by one

Round 36 landed (code `e3be559`, harness `13d2273`, records `aabed51`, report
`.rsi/ROUND-036.md`, evidence `.rsi/evidence/round-036/`) but it has **no** row in
`.rsi/ledger.jsonl` (max round 35) and **no** `## Round 36` section in `.rsi/ROUND.md`
(trailing section is Round 35 at `:1072`). The guard does not read `ROUND-036.md`, so it
reports `round_max=35 ledger_max=35` and treats the tree as clean — the plan then hands out
`rounds_window=36..1000`, re-issuing round 36.

Pick one before arming:

- **Close round 36 first** — append the `## Round 36` section to `.rsi/ROUND.md` and its
  ledger row, re-run `--shape single`, and paste the new rrule (`used` becomes 36, so
  `COUNT=964`, window `37..1000`). Correct, and it repairs a real bookkeeping gap.
- **Arm narrow** — use `COUNT=275`, the measured minimum that covers the whole of
  2026-12-01 SGT from a `06:43:07Z` anchor (last occurrence 2026-12-02T00:43:07+08:00). It
  leaves 690 rounds of budget headroom and sidesteps the numbering collision entirely.

Either satisfies criterion 1; the first is what the repository's own convention asks for.

## The call

```
schedule_edit(
  id: "schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab",
  rrule: "<paste the `--shape single` arm line recomputed now>",
)
```

Send **only** `rrule` (timing). Do not touch `title` — `RSI heartbeat` is the slot key
(`src/loop.ts:338-340` `isLoopSlot`, `:457` `slotOf`); a renamed row stops being the plugin's
slot even though Schedule keeps delivering it. Do not touch `prompt` in this task's scope.

**Precondition if the switch will ever be used.** The live profile grok-workflow block
(`/home/fish/.dsh/profiles/web/cordis.patch.yml:555-579`) sets neither `loopMaxRounds` nor
`iterateIntervalMin`, so both take defaults — `DEFAULT_LOOP_MAX_ROUNDS = 10`
(`src/config.ts:139`). One flip of the Self-iterate switch rewrites the rule to `COUNT=10`
(10 hours) and the coverage collapses. Set `loopMaxRounds: 100` and `iterateIntervalMin: 60`
before any switch use; even then a flip yields 100 h, not December.

## Proof after the edit — two host-written artifacts, no self-report

```bash
# 1. the row itself
python3 -c "import json,os;d=json.load(open(os.path.expanduser('~/.dsh/storages/schedule.json')));\
r=d['tables']['tasks']['schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab'];\
print(r['record']['rrule']);print(r['record']['scheduledAt']);print(len(r['deliveryHistory']['records']))"

# 2. the delivery the Host actually relayed
zstd -dc ~/.dsh/sessions/--home-fish-projects_mine-dsh-grok-workflow--/session-3a683cb6-1eaa-4b33-9eb9-57e1ef0b955b/session.v4.jsonl.zstd \
 | python3 -c "
import sys,json
for i,l in enumerate(sys.stdin,1):
    try: o=json.loads(l)
    except: continue
    s=(o.get('data') or {}).get('source') or {}
    if s.get('kind')=='schedule': print(i, s.get('occurrence_at'))"
```

Accept the re-arm only when all three hold: the stored `rrule` carries the new `COUNT` and its
computed last occurrence is past 2026-12-01T23:59:59+08:00; `deliveryHistory` gains a record
whose `scheduledAt` is after the edit with a messageId not among the five in
06-attempt2-verification.txt §3; and the transcript shows a matching `occurrence_at`. That
triple is the shape the pre-re-arm beats already demonstrate — five for five — so the method is
proven even though the post-re-arm instance does not yet exist.

## Ledger record — after a real re-arm, not before

Criterion 3 wants a ledger row whose commit tag and CI reference describe the re-arm. That row
can only be written once an edit has landed and been pushed, so attempt 2 wrote none: a row
now would carry an empty tag and an invented CI string, which is the fabrication criterion 3
is worded to catch. When it is real, record it the way `.rsi/HARNESS.md` "When a round ends
BLOCKED" / `finish-round.py` prescribe — `.rsi/ROUND.md` section plus one `ledger.jsonl` line
with the same round, commit and tag, and the evidence path.
