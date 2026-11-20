# Baseline reconcile — round 39 (read-only pass)

- **Task:** `baseline_guard` attempt 2 (reconcile tree + memory baseline before a parallel round)
- **Observed at:** 2026-11-20T18:25:34+08:00 → 18:27:0x +0800 (all commands run from `/home/fish/projects_mine/dsh-grok-workflow`)
- **Writes by this task:** exactly one new file, this one (`?? .rsi/evidence/baseline-reconcile-round39.md`)
- **Status vocabulary:** this document separates observed (`CONFIRMED`), inferred (`HYPOTHESIS`), and not-run (`NOT_RUN`) — the same vocabulary `AGENTS.md` requires.

---

## 1. Tree state — `git status --short --branch` (verbatim)

```text
## main...origin/main
 M CHANGELOG.md
 M lib/delivery/index.d.ts
 M lib/delivery/index.d.ts.map
 M lib/delivery/index.js
 M lib/delivery/index.js.map
 M src/checkpoint/schema.ts
 M src/delivery/index.ts
 M test/delivery-human-block.spec.ts
?? .rsi/evidence/baseline-round39-attempt2.md
?? .rsi/evidence/baseline-round39.md
?? .rsi/evidence/checkpoint-comment-fix.md
?? .rsi/evidence/ci-health-round39.md
?? .rsi/evidence/ci-lib-consistency-round39-attempt1.md
?? .rsi/evidence/delivery-bilingual-edge.md
?? .rsi/evidence/harness/verify-round39-armed-row-refresh.txt
?? .rsi/evidence/harness/verify-round39-live.txt
?? .rsi/evidence/harness/verify-round39.md
?? .rsi/evidence/harness/verify-row-endstate-round39.txt
?? .rsi/evidence/heartbeat-rearm/05-arm-cross-check.md
?? .rsi/evidence/heartbeat-rearm/06-attempt2-verification.txt
?? .rsi/evidence/heartbeat-rearm/07-handoff-one-call.md
?? .rsi/evidence/runtime-audit-2026-11-20.md
?? .rsi/evidence/triage-round39-reattempt.md
?? .rsi/evidence/triage-round39.md
?? test/checkpoint-bound.spec.ts
?? test/config-chain-types.spec.ts
```

Timestamp of the block above: **2026-11-20 18:25:37 +0800**, i.e. *before* this document existed — that is
why this file is not in its own `??` list. `git status --short` run after the write shows the same 8 `M`
lines plus 19 `??` lines (the 18 above and `?? .rsi/evidence/baseline-reconcile-round39.md`). Every `M`
path and every other `??` path in the quote is reproduced verbatim from the command output in this run.

Counts: **8 tracked modifications**, **18 untracked paths** (16 under `.rsi/evidence/`, 2 test files).
The branch line `## main...origin/main` carries no `[ahead N]`/`[behind N]` marker, so the local branch
does not diverge from the last-fetched remote-tracking ref.

### 1a. HEAD identity and relation to `origin/main`

| Observation | Value |
| --- | --- |
| `git rev-parse HEAD` | `366d169e98a681e84875d8d798f91d68f608e660` |
| `git rev-parse origin/main` | `366d169e98a681e84875d8d798f91d68f608e660` (identical) |
| `git rev-list --left-right --count origin/main...HEAD` | `0	0` (0 behind, 0 ahead) |
| `git describe --tags --always` | `v0.12.13-6-g366d169` |
| `grep -m1 '"version"' package.json` | `"version": "0.12.13"` |
| `git rev-list -n1 refs/tags/v0.12.13` | `490edce392a0ec96c8d1864e7208120c021e7eff` (annotated object `1566e180`) |
| `git log --oneline -S'"version": "0.12.13"' -- package.json` | `7825ca7` |

**Caveat (`CONFIRMED` as a limitation):** no `git fetch` was run. "HEAD == origin/main" is a statement
about the last-fetched remote-tracking ref, not about the live remote tip.

### 1b. `git log --oneline -5`

```text
366d169 docs(rsi): compact fix — npm run ci output at 91d4361 (exit 0, 70 files / 1269 tests)
91d4361 docs(rsi): compact fix — integrated-state validation rows (merge e80ed6d) and merge attribution
65cab43 docs(rsi): compact fix — mainline before/after evidence, integrated status
f56b244 docs(rsi): handoff for 0.12.13 release
e80ed6d docs(rsi): record 0.12.13 release (CI + Release refs)
```

Latest tag-bearing commit is `490edce` (`docs(rsi): round 38 release CI evidence`); everything above it
on `main` is either the round-38 release record or the concurrent agent's `/compact` fix (`5fb5da0`
merged in `e80ed6d`). `HEAD` is therefore **6 commits past the `v0.12.13` tag**.

### 1c. Diff shape of the dirty tracked set

`git diff --stat` → **8 files changed, 509 insertions(+), 45 deletions(-)**:

```text
 CHANGELOG.md                      |  15 +++
 lib/delivery/index.d.ts           |  21 ++++
 lib/delivery/index.d.ts.map       |   2 +-
 lib/delivery/index.js             | 128 +++++++++++++++----
 lib/delivery/index.js.map         |   2 +-
 src/checkpoint/schema.ts          |  10 +-
 src/delivery/index.ts             | 125 ++++++++++++++++---
 test/delivery-human-block.spec.ts | 251 +++++++++++++++++++++++++++++++++++++-
```

Per-path mtime and size (taken in this run):

| Path | mtime | bytes |
| --- | --- | --- |
| `CHANGELOG.md` | 2026-11-20 18:17:23 | 235024 |
| `lib/delivery/index.d.ts` | 2026-11-20 18:20:41 | 7790 |
| `lib/delivery/index.d.ts.map` | 2026-11-20 18:20:41 | 1696 |
| `lib/delivery/index.js` | 2026-11-20 18:20:41 | 39801 |
| `lib/delivery/index.js.map` | 2026-11-20 18:20:41 | 25097 |
| `src/checkpoint/schema.ts` | 2026-11-20 16:07:57 | 46125 |
| `src/delivery/index.ts` | 2026-11-20 18:13:18 | 40986 |
| `test/delivery-human-block.spec.ts` | 2026-11-20 16:53:32 | 30227 |
| `test/checkpoint-bound.spec.ts` (untracked) | 2026-11-20 16:06:55 | 7009 |
| `test/config-chain-types.spec.ts` (untracked) | 2026-11-20 18:19:44 | 11111 |

`lib/*` was rebuilt at **18:20:41**, i.e. two minutes before this pass started: an external process is
actively building in this checkout. Any list in this document is a snapshot with a minutes-scale shelf life.

---

## 2. Heartbeat row — `node .rsi/tools/iterate-plan.mjs --verify-row`

Command and output, verbatim:

```text
$ node .rsi/tools/iterate-plan.mjs --verify-row
verify status=NOT_ARMED title="RSI heartbeat" remaining=962
verify row=schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab COUNT=969 delivered=9 covered=960 last=2026-12-30T15:36:57.000Z
verify check title ok: row schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab carries the slot title
verify check rule-parsed ok: COUNT=969, INTERVAL=60
verify check within-row-maximum ok: COUNT=969 vs row maximum 1000
verify check covers-remaining-budget FAIL: 960 round(s) left in the row (COUNT 969 - 9 delivered) vs 962 remaining
verify check has-a-future-occurrence ok: last occurrence 2026-12-30T15:36:57.000Z vs now 2026-11-20T10:25:43.553Z
verify store=/home/fish/.dsh/storages/schedule.json
verify detail=row schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab does not cover the 962 rounds left: covers-remaining-budget
verify next: node .rsi/tools/iterate-plan.mjs --arm-spec --json   (then the one schedule call it names)
EXIT=21
```

| Field | Observed value |
| --- | --- |
| exit code | **21** (`--verify-row` contract: `0` ARMED / `21` NOT_ARMED / `22` store unreadable — `.rsi/tools/iterate-plan.mjs:44-47`) |
| status | **NOT_ARMED** |
| row id | `schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab` (`title="RSI heartbeat"`) |
| COUNT | 969 |
| delivered | 9 |
| covered | **960** |
| remaining | **962** |
| last occurrence | **2026-12-30T15:36:57.000Z** (future; `has-a-future-occurrence` passes) |
| failing check | `covers-remaining-budget` |
| store | `/home/fish/.dsh/storages/schedule.json` |

**Honest reading.** The row is *alive and future-dated* but *under-booked by 2 rounds*. This is not a dead
schedule and not a store-read failure. Per the task constraints, this pass did **not** arm, edit, or touch
the row (`schedule_edit` was not called; a subagent session cannot call `schedule_*` anyway).

### 2a. The shortfall is arithmetic, and the remedy is one call

`buildPlan` computes `remaining = config.totalRounds - used` (`.rsi/tools/iterate-plan.mjs:265-266`) with
`totalRounds=1000` (`.rsi/harness.json`) and `used=38` (ledger rounds 1-38) → `remaining=962`. The live row
materialises `covered = COUNT - delivered = 969 - 9 = 960`. The two-round gap exists because two
occurrences were delivered without a matching ledger row, so `used` lags `delivered`.

`node .rsi/tools/iterate-plan.mjs --arm-spec` (read-only; prints, exits `0`) names the exact fix:

```text
$ node .rsi/tools/iterate-plan.mjs --arm-spec
arm-spec status=OPEN title="RSI heartbeat" mode=edit id=schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab
arm-spec rounds=962 window=39..1000 interval=60 remaining=962 used=38
arm-spec rrule=DTSTART:20261120T112614Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=962
arm-spec prompt=.rsi/HEARTBEAT-PROMPT.md chars=2319/4000 fits=yes
arm-spec live-row=schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab COUNT=969 delivered=9
arm-spec next: row schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab carries the slot title with COUNT covering 9 delivered occurrence(s); edit its rrule to the one above, keep the title and prompt
ARMspec_EXIT=0
```

So the recorded ARMED end-state would be `covered == remaining == 962` after `COUNT` becomes 962 (or the
`used` count catches up). **`DTSTART` is computed from the current clock — it must be regenerated at the
moment the call is made**, not pasted from this file. Because the task forbids `schedule_edit`, this pass
records the gap and the recipe; it does not close it.

---

## 3. Gate — `bash .rsi/tools/heartbeat-guard.sh` (read-only, no `--record`)

```text
STOP code=stall-unclosed next_round=39 threshold=3 max_rounds=0 blocked_streak=0 round_max=38 ledger_max=38 dirty_tracked=8 report_open=0 unclosed_skips=2
first uncommitted: CHANGELOG.md
GUARD_EXIT=20
```

- `verdict=STOP`, `code=stall-unclosed`, **exit 20** — the same unclosed round has now been skipped
  `unclosed_skips=2` time(s) against `threshold=3`; the guard promotes SKIP→STOP at that boundary
  (`.rsi/tools/heartbeat-guard.sh:204`).
- `round_max=38` (from `.rsi/ROUND.md`) and `ledger_max=38` (from `.rsi/ledger.jsonl`) agree, so the
  disagreement is **not** "ledger lags ROUND.md"; it is that round 39 has not been opened at all.
- `dirty_tracked=8` — the count grew from 3 earlier today to 8 as the concurrent writer's `lib/` rebuild
  and `CHANGELOG.md` entry landed. `first uncommitted` is now `CHANGELOG.md`, not a `src/` file.
- `max_rounds=0` / `blocked_streak=0`: no `--max-rounds` argument was passed (task said read-only, no
  `--round auto`), and the ledger tail carries no BLOCKED rows.

**Consequence:** a parallel round cannot open from this tree while the verdict is STOP. The guard is a
*measurement* here; nothing was appended to the guard log (`--record` is required for that,
`.rsi/tools/heartbeat-guard.sh:263-266`), and no `.rsi/STOP` file was created.

---

## 4. Locks, extra worktrees, stop flags

```text
$ ls -la .git/index.lock .git/HEAD.lock .rsi/STOP
ls: cannot access '.git/index.lock': No such file or directory
ls: cannot access '.git/HEAD.lock': No such file or directory
ls: cannot access '.rsi/STOP': No such file or directory
```

```text
$ git worktree list
/home/fish/projects_mine/dsh-grok-workflow                                              366d169 [main]
/home/fish/projects_mine/dsh-grok-workflow/.agents/worktrees/fix-compact-orphan-receipt 5fb5da0 [fix-compact-orphan-receipt]
```

There is **no git lock to clear** and **no `.rsi/STOP`**. The second worktree shares the same object
database, so a commit made from either place is visible to the other; a `git gc`/prune from the main
checkout can still race a build there.

---

## 5. Scopes to avoid — the parallel-round avoid-list

Any parallel task should stay out of these. All are held by a live concurrent writer whose mtimes move.

1. `src/delivery/index.ts` — tracked `M`, 18:13:18. Bilingual delivery fix in flight.
2. `test/delivery-human-block.spec.ts` — tracked `M`, 16:53:32. +251 lines in the current diff.
3. `src/checkpoint/schema.ts` — tracked `M`, 16:07:57. Comment/limit edit, untouched since 16:07 but still uncommitted.
4. `lib/delivery/*` (5 files) — tracked `M`, 18:20:41. **Build output** of (1); editing these by hand would be overwritten by the next `npm run build`.
5. `CHANGELOG.md` — tracked `M`, 18:17:23. `[Unreleased]` entry for (1)+(2). A version bump here would collide.
6. `test/checkpoint-bound.spec.ts`, `test/config-chain-types.spec.ts` — untracked tests from the concurrent writer; not yet committed, so a `git add -A` would sweep them.
7. `.rsi/evidence/*` — 16 untracked evidence files from round 39's parallel tasks. Treat as other tasks' output, not as scratch space.
8. Worktree `/home/fish/projects_mine/dsh-grok-workflow/.agents/worktrees/fix-compact-orphan-receipt` at `5fb5da0` — shares the object DB; do not `git gc`/`prune`/`rebase` across it.

Not avoid-list, but worth knowing: there is **no repo-root `POOL.md`**; the pool is `.rsi/POOL.md`
(17878 bytes, mtime 15:45) — `ls POOL.md` → `No such file or directory`.

---

## 6. Memory vs. tree — reconciliation table

Baseline question asked by the task: do `.rsi/STATE.md`, `.rsi/LOG.md`, and the newest
`docs/knowledge/HANDOFF.md` agree with `git log` and `git status`?

| # | Memory claim | Observed tree | Verdict |
| --- | --- | --- | --- |
| 1 | `.rsi/STATE.md:1` header says `round 37`, `code commit eb61ac8`, `harness commit 621f2ab` | Round 38 landed: `7825ca7` (code) + `490edce` (evidence), tagged `v0.12.13` | **STALE by one round.** `.rsi/STATE.md` has no round-38 section (`grep -c "Round 38" .rsi/STATE.md` → `0`) while `docs/knowledge/STATE.md` has one (`→ 1`). |
| 2 | `.rsi/LOG.md` last row = round 38, `OK — 40/40, ci 69/1263; 建议 patch` | Round 38 shipped as **`0.12.13`**, tag → `490edce` | **INCOMPLETE.** The LOG row still reads "suggest patch", not "released `0.12.13`"; it carries no tag/commit for the release. |
| 3 | `.rsi/ledger.jsonl` round 38 `commit: ""`, `tag: ""` | Commit is `7825ca7`; tag `v0.12.13` → `490edce` | **EMPTY FIELDS.** Mechanically readable but uninformative; the guard ignores `commit`/`tag` so it does not break the gate. |
| 4 | `docs/knowledge/HANDOFF.md:5` — "R38 提交 `7825ca7`（+证据 `490edce`）、**发版提交 `61c7cb8`**、annotated tag `v0.12.13` 已推" | `git log --oneline -1 61c7cb8` → `chore(release): v0.12.12 — clamp keeps verdict (RSI round 36)`; `git rev-list -n1 refs/tags/v0.12.13` → `490edce`; the `0.12.13` bump lives in `7825ca7` (`git log -S'"version": "0.12.13"' -- package.json`) | **WRONG SHA.** `61c7cb8` is the **0.12.12** release commit. There is no separate `chore(release)` commit for 0.12.13 — the bump rode in the round-38 code commit, and the tag sits on the evidence commit `490edce`. Two separate misreadings in one sentence (release-commit identity *and* tag target); the same wrong pairing appears at `HANDOFF.md:38`. |
| 5 | `docs/knowledge/HANDOFF.md:38` — "`0.12.12` 已由它发出，指向 `61c7cb8`" | `61c7cb8` **is** v0.12.12's release commit (that pairing is right) | **CORRECT** — recorded here only to show the two `61c7cb8` uses in HANDOFF disagree with each other; line 5 is the wrong one. |
| 6 | `.rsi/ROUND.md` top section = `## Round 38` | `## Round 38` present, no round 39 | **CONSISTENT** with `round_max=38`. |
| 7 | `docs/knowledge/VALIDATION.md:2981` "Round 39 (2026-11-15)" | Unrelated: a v0.9.2 prep record from 2026-11-15, five days before this round 39 | **NAME COLLISION, not a stale fact.** No action; do not "fix" it as if it described today. |

Net: the memory baseline lags the tree in three places (`rsi/STATE.md` one round, `rsi/LOG.md` release
status, `rsi/ledger.jsonl` commit/tag) and is **factually wrong** in one (`HANDOFF.md` 0.12.13 release SHA).
None of these block a commit; all of them mislead the next reader, and item 4 is the kind of error that
sends someone to the wrong commit during a rollback.

**Do not treat this table as authorization to edit those files** — the task bar forbids writing them.

---

## 7. Proof that this pass touched nothing else

`sha256sum` taken **before** this file was written and re-run **after**:

```text
be525d25a3e021de1d32ecbf8dcccd549cc07f81825f8810b9697dab5b30c770  CHANGELOG.md
3b956ab7e8565f1ad7b26e3cf66e0d4377a316586ab993097f957846da94c1b1  .rsi/POOL.md
a15b362643955439f317e6629310d8e875bc6353b50ad944b82ee38b24b1a3ba  .rsi/STATE.md
5192e2fd84bbfabf79372342f89edbe7810a1b171163993307e2713da49e9218  .rsi/LOG.md
2487964257c52741b22290ad3e092bb7ed7bbca544dca958aa06468fa8935f9c  .rsi/ROUND.md
0c7930352ffc556cc08a81ee8dc569623e89c0ed2db9c87a04914df601a103f5  .rsi/ledger.jsonl
cdfc9727e423d8d33022352a01ce0bdc1af707cc5ffa53e82380e7d0e4b4754e  .rsi/harness.json
0543a6759b5682c91e77a022316a56f6576ae7154efa48ea896fc80aed4696bd  docs/knowledge/STATE.md
ac873b9ad9be24693818e616586358fa8644f20be8d90a5d303a8e0b21a2d533  docs/knowledge/HANDOFF.md
ad59b808da25c181a65a423ecf86fab2f9fc9e0f3687b44f7d47b5d51bcced8b  docs/knowledge/VALIDATION.md
df9bfa9bdde1ce451eceac93f4b521d767d849ac1bf9401e0de982d1834f3c7d  src/checkpoint/schema.ts
fb4af3fe5c2006a0ffc585a5340425af7d11505b82aef3496a64c398881db082  src/delivery/index.ts
2033fe066c446dbfe5b477c53c52f74052c65a7e9eaf47db014e8bc1b08ef229  test/delivery-human-block.spec.ts
232943eb3c82cbee4d62274bec6c591be91985e2fe655340e98482d964e4c7e9  test/checkpoint-bound.spec.ts
```

The re-run reproduces every line above byte-for-byte. No file under `src/`, `lib/`, `test/`,
`CHANGELOG.md`, `.rsi/POOL.md`, `.rsi/STATE.md`, `.rsi/LOG.md` or `docs/knowledge/` was written by this
task. The only new path is `?? .rsi/evidence/baseline-reconcile-round39.md` (this document).
`lib/` shows as dirty solely from the concurrent writer's 18:20:41 rebuild.

---

## 8. What a parallel round should do with this

- **Do not** open a round from this checkout while the gate reads `STOP code=stall-unclosed`
  (`round_max=38`, `next_round=39`, `unclosed_skips=2` of `threshold=3`).
- **Do not** treat the heartbeat as armed: `--verify-row` exits 21, `covered=960` vs `remaining=962`.
  The one-call remedy is printed by `--arm-spec` and belongs to the operator / a session holding
  `schedule_*`.
- **Do** keep out of the eight scopes in §5, especially the `lib/delivery/*` build output.
- **Do** re-measure (`git status`, `--verify-row`, `heartbeat-guard.sh`) at the start of the next round —
  this snapshot was already stale in `dirty_tracked` within minutes of being written.
