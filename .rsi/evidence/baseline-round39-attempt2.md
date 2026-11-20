# Baseline for parallel iteration — round-39 tree, attempt 2 (2026-11-20 ~18:12 +0800)

Reconciliation only. **This file is the only write.** Nothing under `src/`, `lib/`, `test/`,
`CHANGELOG.md`, `.rsi/POOL.md`, `.rsi/STATE.md`, `.rsi/LOG.md`, `docs/knowledge/` was edited by
this task — §6 hashes it. No `schedule_*` call was made; the heartbeat row was read through
`--verify-row` and `heartbeat-guard.sh` without `--record`, both of which print counts only.

Two things a parallel round needs from this run, stated up front because they contradict the
round-39 record:

1. **The heartbeat row is `NOT_ARMED` now, not `ARMED`** — `--verify-row` exits **21**
   (`covered=960` vs `remaining=962`). Round 39 observed `ARMED`/exit 0 with `delivered=7`;
   it is now `delivered=9` against the same `COUNT=969`, so the row is two rounds short. §3.
2. **The guard verb is `STOP`, not `SKIP`** — exit **20**, `code=stall-unclosed`,
   `unclosed_skips=2` at `threshold=3`, `round_max=38 ledger_max=38`. Round 39 recorded
   `unclosed_skips=0`. §4.

## 1. Tree and branch — observed at 18:11:47 +0800 (`CONFIRMED`)

`git status --short --branch` on `/home/fish/projects_mine/dsh-grok-workflow`:

```text
## main...origin/main
 M src/checkpoint/schema.ts
 M src/delivery/index.ts
 M test/delivery-human-block.spec.ts
?? .rsi/evidence/baseline-round39.md
?? .rsi/evidence/checkpoint-comment-fix.md
?? .rsi/evidence/ci-health-round39.md
?? .rsi/evidence/delivery-bilingual-edge.md
?? .rsi/evidence/harness/verify-round39-armed-row-refresh.txt
?? .rsi/evidence/harness/verify-round39-live.txt
?? .rsi/evidence/harness/verify-round39.md
?? .rsi/evidence/heartbeat-rearm/05-arm-cross-check.md
?? .rsi/evidence/heartbeat-rearm/06-attempt2-verification.txt
?? .rsi/evidence/heartbeat-rearm/07-handoff-one-call.md
?? .rsi/evidence/runtime-audit-2026-11-20.md
?? .rsi/evidence/triage-round39.md
?? test/checkpoint-bound.spec.ts
```

- HEAD = `366d169e98a681e84875d8d798f91d68f608e660`, branch `main` (`## main...origin/main`, no
  ahead/behind markers → tracking, in sync).
- `git rev-parse origin/main` = `366d169e98a681e84875d8d798f91d68f608e660` → **HEAD == origin/main**.
- `git rev-list --left-right --count origin/main...HEAD` → `0	0` (no local-only commit, no remote-only
  commit). **No `git fetch` was run**, so "origin/main" is the remote-tracking ref as last fetched.
- `git describe --tags --always` → `v0.12.13-6-g366d169`: six commits past the release tag.
- Annotated tag `v0.12.13` = tag object `1566e18021a55738e3acc6f573240aeba35442e9` → commit
  `490edce`; `git merge-base --is-ancestor v0.12.13 HEAD` → **yes** (release is in main's history).
  Tag date `2026-11-20 15:43:59 +0800`, subject `v0.12.13 — non-string model/provider refused with
  path (RSI round 38)`. `package.json` at HEAD is `"version": "0.12.13"`.
- `git log --oneline -5`:

```text
366d169 docs(rsi): compact fix — npm run ci output at 91d4361 (exit 0, 70 files / 1269 tests)
91d4361 docs(rsi): compact fix — integrated-state validation rows (merge e80ed6d) and merge attribution
65cab43 docs(rsi): compact fix — mainline before/after evidence, integrated status
f56b244 docs(rsi): handoff for 0.12.13 release
e80ed6d docs(rsi): record 0.12.13 release (CI + Release refs)
```

`git diff --stat` over the three tracked edits: `src/checkpoint/schema.ts | 10 +-`,
`src/delivery/index.ts | 125 +++++---`, `test/delivery-human-block.spec.ts | 251 +++++++++++-`
→ 3 files, 364 insertions, 22 deletions. **None of it is this task's work.**

## 2. Tree has been moving under every run (`CONFIRMED`)

The concurrent round-39 writer is still editing as of this observation. mtimes (`full-iso`):

| path | mtime | state |
| --- | --- | --- |
| `src/checkpoint/schema.ts` | 16:07:57 | ` M` — unchanged since round 39's T2 (16:07:55) |
| `src/delivery/index.ts` | **16:51:38** | ` M` — grew from 0 to 125 changed lines since round 39's T2 |
| `test/delivery-human-block.spec.ts` | **16:53:32** | ` M` — grew from +61 to +251 since round 39's T2 |
| `test/checkpoint-bound.spec.ts` | 16:06:55 | `??` — untracked since 16:06 |

So the round-39 diff described in `baseline-round39.md` §1 (70 insertions over 2 files) no longer
describes this tree: the delivery pair is three to four times larger. Any round that reads
`git diff` here reads a moving target. This is the same writer, still live.

## 3. Heartbeat row — `NOT_ARMED` in this run (`CONFIRMED`)

`node .rsi/tools/iterate-plan.mjs --verify-row` → **exit code 21** (per the tool's own contract:
`0` = ARMED, `21` = NOT_ARMED, `22` = host store unreadable):

```text
verify status=NOT_ARMED title="RSI heartbeat" remaining=962
verify row=schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab COUNT=969 delivered=9 covered=960 last=2026-12-30T15:36:57.000Z
verify check title ok: row schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab carries the slot title
verify check rule-parsed ok: COUNT=969, INTERVAL=60
verify check within-row-maximum ok: COUNT=969 vs row maximum 1000
verify check covers-remaining-budget FAIL: 960 round(s) left in the row (COUNT 969 - 9 delivered) vs 962 remaining
verify check has-a-future-occurrence ok: last occurrence 2026-12-30T15:36:57.000Z vs now 2026-11-20T10:11:52.459Z
verify store=<home>/.dsh/storages/schedule.json
verify detail=row schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab does not cover the 962 rounds left: covers-remaining-budget
verify next: node .rsi/tools/iterate-plan.mjs --arm-spec --json   (then the one schedule call it names)
```

| field | value in this run | round-39 record |
| --- | --- | --- |
| status | **NOT_ARMED** | ARMED |
| exit code | **21** | 0 |
| row id | `schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab` | same |
| COUNT | 969 | 969 |
| delivered | **9** | 7 |
| covered | **960** | 962 |
| remaining | 962 | 962 |
| last occurrence | `2026-12-30T15:36:57.000Z` (future vs now) | same |
| failing check | `covers-remaining-budget` | none |

Why it regressed without anyone re-arming: the budget side is
`remaining = config.totalRounds - used` (`.rsi/tools/iterate-plan.mjs:266`, `265`), and
`totalRounds=1000` (`.rsi/harness.json`), `used=38` → `962`; the coverage side is
`covered = COUNT - deliveries` (`:498`). Rounds 39 and later turns were delivered by the row, so
`deliveries` 7→9 while `COUNT` stayed 969, i.e. the row now owes 960 but the ledger still wants 962.
`used` is still 38 because **no round-39 row exists in the ledger** (§5). This is a bookkeeping
gap, not a lost schedule: the occurrence stream is live and future, only the count is short by two.

Read-only: this invocation prints counts and the store path. It does not print prompt text, does not
write the store, and no `schedule_edit` was called.

## 4. Iteration guard — verb is `STOP` (`CONFIRMED`)

`bash .rsi/tools/heartbeat-guard.sh` (no `--record`) → **exit 20**:

```text
STOP code=stall-unclosed next_round=39 threshold=3 max_rounds=0 blocked_streak=0 round_max=38 ledger_max=38 dirty_tracked=3 report_open=0 unclosed_skips=2
first uncommitted: src/checkpoint/schema.ts
```

Reading: the verdict started as `SKIP` (a round is already open — 3 dirty tracked files). The
streak rule at `.rsi/tools/heartbeat-guard.sh:204` promotes it — `unclosed_skips=2` previous
consecutive skips plus this one reaches `threshold=3`, so `code=stall-unclosed`, exit 20.

**Consequence for a parallel round: the harness will not open round 40 until round 39 is closed**
(report row + ledger row + clean tree, or the operator clears it). This is the state the operator
needs to see; it is not this task's to fix, and fixing it would require committing another writer's
in-flight work.

## 5. Memory vs tree (`CONFIRMED` where compared)

| record | claim | observed | verdict |
| --- | --- | --- | --- |
| `.rsi/STATE.md` (mtime 14:34) | header: `Updated: 2026-11-20T14:20+08:00 · round 37 … no release this round (0.12.12 …)` | HEAD carries round-38 code `7825ca7`, tag `v0.12.13`, `package.json` 0.12.13 | **STALE** — two rounds behind (round 38 released, round 39 in flight) |
| `.rsi/LOG.md` (mtime 15:41) | last row = round 38, `ci 69/1263`, evidence `.rsi/evidence/round-038/` | `git log` has the round-38 commits; `.rsi/evidence/round-038/` exists | MATCH for 38; no round-39 row (consistent with "in flight") |
| `.rsi/ROUND.md` | last section `## Round 38` (line 1174) | no `## Round 39` section | MATCH — round 39 has no report yet |
| `.rsi/ledger.jsonl` (tail) | round 38 present with `"commit": ""`, `"tag": ""` | rounds 1–38; round-38 commit/tag fields empty although `7825ca7`/`v0.12.13` shipped; guard reads `round_max=38 ledger_max=38` | **stale fields** (carried from round 39's finding, still true) |
| `.rsi/POOL.md` (mtime 15:45) | the pool source; repo-root `POOL.md` does not exist | `ls POOL.md` → No such file; `.rsi/POOL.md` is the only one | OK, but note the path: **`.rsi/POOL.md`**, not `POOL.md` |
| `docs/knowledge/HANDOFF.md` §1 (2026-11-20, top of file) | "R38 提交 `7825ca7`（+证据 `490edce`）、**发版提交 `61c7cb8`**、annotated tag `v0.12.13` 已推" | `git log --oneline -1 61c7cb8` = `chore(release): v0.12.12 — clamp keeps verdict (RSI round 36)`; `git log --oneline --all --grep=0.12.13` finds no release commit; the 0.12.13 version bump rode in the code commit `7825ca7` (`git log -S'"version": "0.12.13"' -- package.json`) | **WRONG FIELD** — copy-forward from the 0.12.12 section; unchanged at HEAD, so round 39 did not fix it either |
| `docs/knowledge/HANDOFF.md` §2 (round-37 arming) | row re-armed to `COUNT=969`, `covered=963 = remaining=963`, guard `RESUME next_round=38` | today `delivered=9`, `covered=960`, `remaining=962`, guard `STOP next_round=39` | MATCH modulo consumed rounds, but its `covered = remaining` invariant **no longer holds** (§3) |
| `docs/knowledge/VALIDATION.md` line 2981 | `## Round 39 (2026-11-15) … v0.9.2 准备` | that is an **old** round 39 from 2026-11-15 (v0.9.2), unrelated to today's round-39 attempt | naming collision to watch — two different "round 39" records |

Net: code, tag and remote all agree; what disagrees is memory. `.rsi/STATE.md` is two rounds stale,
ledger row 38 has empty `commit`/`tag`, `HANDOFF.md` §1 names the wrong release commit, and the
guard's own arming invariant (`covered` ≥ `remaining`) is broken by two unrecorded deliveries.

## 6. Dirty / locked scopes to avoid — and the proof this task touched nothing

### Avoid (owned by the concurrent round-39 writer, still being edited)

1. **`src/delivery/index.ts`** — ` M`, mtime 16:51:38, +125/−? lines. Active.
2. **`test/delivery-human-block.spec.ts`** — ` M`, mtime 16:53:32, +251 lines. Active.
3. **`src/checkpoint/schema.ts`** — ` M`, mtime 16:07:57, +10/−1 (the `CHECKPOINT_LIMITS.maxBytes`
   comment block; also the guard's `first uncommitted`).
4. **`test/checkpoint-bound.spec.ts`** — `??` untracked, 7,009 bytes, mtime 16:06:55.
5. Untracked evidence written by parallel rounds — read-only for others, do not rewrite:
   `baseline-round39.md`, `checkpoint-comment-fix.md`, `ci-health-round39.md`,
   `delivery-bilingual-edge.md`, `runtime-audit-2026-11-20.md`, `triage-round39.md`,
   `harness/verify-round39-{armed-row-refresh.txt,live.txt,md}`,
   `heartbeat-rearm/{05,06,07}-*`.

### Locks

- `git worktree list`: `/home/fish/projects_mine/dsh-grok-workflow` at `366d169 [main]` and
  `.agents/worktrees/fix-compact-orphan-receipt` at `5fb5da0 [fix-compact-orphan-receipt]` — the
  second worktree exists and shares the object database; do not run repo-wide destructive git
  commands (`gc`, `prune`, `reset --hard`) here while it is checked out.
- `.git/index.lock`, `.git/HEAD.lock`, `.rsi/STOP`: **absent** (`ls` → "No such file or directory").
  No stale lock to clear; writers are serializing on nothing, which is why the diff moves.

### Protected paths — unchanged by this task

`git status --short -- CHANGELOG.md .rsi/POOL.md .rsi/STATE.md .rsi/LOG.md docs/knowledge/ src/ lib/ test/`
returns only the four concurrent-writer paths listed above; `lib/` is empty (clean) and no memory
file appears. sha256 at 18:12, before and after this file was written (identical):

```text
c17dc2d57e111d36aacecda8e8f74fbf51d5fa3b54757c91a7e1cfe045b65cef  CHANGELOG.md
3b956ab7e8565f1ad7b26e3cf66e0d4377a316586ab993097f957846da94c1b1  .rsi/POOL.md
a15b362643955439f317e6629310d8e875bc6353b50ad944b82ee38b24b1a3ba  .rsi/STATE.md
5192e2fd84bbfabf79372342f89edbe7810a1b171163993307e2713da49e9218  .rsi/LOG.md
0543a6759b5682c91e77a022316a56f6576ae7154efa48ea896fc80aed4696bd  docs/knowledge/STATE.md
ac873b9ad9be24693818e616586358fa8644f20be8d90a5d303a8e0b21a2d533  docs/knowledge/HANDOFF.md
```

And the concurrent writer's four files were also unchanged by this task (same before/after):

```text
df9bfa9bdde1ce451eceac93f4b521d767d849ac1bf9401e0de982d1834f3c7d  src/checkpoint/schema.ts
fb4af3fe5c2006a0ffc585a5340425af7d11505b82aef3496a64c398881db082  src/delivery/index.ts
2033fe066c446dbfe5b477c53c52f74052c65a7e9eaf47db014e8bc1b08ef229  test/delivery-human-block.spec.ts
232943eb3c82cbee4d62274bec6c591be91985e2fe655340e98482d964e4c7e9  test/checkpoint-bound.spec.ts
```

## 7. Handoff for whoever runs next

- Base commit for any branch: **`366d169`** (== `origin/main`, tag `v0.12.13` six commits back).
- Do **not** stage or commit `src/delivery/index.ts`, `test/delivery-human-block.spec.ts`,
  `src/checkpoint/schema.ts`, `test/checkpoint-bound.spec.ts` — another agent is mid-edit there.
- Round 40 cannot start from this tree (`STOP code=stall-unclosed`, exit 20). Round 39 needs its
  report row, ledger row and clean tree first.
- Re-arming is **not** done here and is not mine to do: `--verify-row` says
  `node .rsi/tools/iterate-plan.mjs --arm-spec --json` then the single `schedule_edit` it names
  (subagent sessions cannot call `schedule_*`). Note the current row would need `COUNT ≥ 971` to
  clear `covered ≥ 962` at `delivered=9`, and more if further occurrences deliver first — recompute
  with `--arm-spec` rather than pasting a number.
- Memory fixes pending (not touched, listed only): `.rsi/STATE.md` → round 38/39, `ledger.jsonl`
  round-38 `commit`/`tag` fields, `HANDOFF.md` §1 `61c7cb8` → the truth (version bump in `7825ca7`,
  tag on `490edce`, no separate release commit).

设备=wala-subagent(agent-140)，时间 2026-11-20
