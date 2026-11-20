# Baseline reconcile — round 40 (clean snapshot for iteration)

Task: `baseline_reconcile` · **From:** agent-169 (subagent, round-40 baseline) · **To:** lead / next round
Repo: `/home/fish/projects_mine/dsh-grok-workflow` · Method: deterministic local git/stat/grep only.

**Side effects:** the only file written by this task is this report. No `src/`, `lib/`, `test/`,
`CHANGELOG.md`, `POOL.md`, `STATE.md` touched; no commit, push, tag, fetch, build or test run;
no `schedule_*` call. Every number below is a local measurement, not a claim carried from memory.

Snapshot window: first command `2026-11-20T11:00:25Z` (19:00:25 +08:00), stability re-probe
`2026-11-20T11:01:50Z`, post-report re-measurement `2026-11-20T11:09:49Z`–`11:10:19Z`.

> **Read §9 first if you only read one section.** The tree was quiet at the §1–§3 snapshot and then
> **grew again at 19:08–19:09 +08:00** while this report was being written: a live concurrent writer
> is still extending `src/delivery/index.ts` and `test/delivery-human-block.spec.ts`. §3 is the
> 19:00 snapshot, §9 is the 19:09 re-measurement and the current state. This is the same live-growth
> failure mode that made the previous baseline attempt report `partial`; the difference here is that
> the growth is measured and dated rather than asserted away.

---

## 1. Branch and status (`CONFIRMED`, verbatim)

```
$ git status --short --branch
## main...origin/main
 M CHANGELOG.md
 M lib/delivery/index.d.ts
 M lib/delivery/index.d.ts.map
 M lib/delivery/index.js
 M lib/delivery/index.js.map
 M src/checkpoint/schema.ts
 M src/delivery/index.ts
 M test/delivery-human-block.spec.ts
?? .rsi/evidence/baseline-reconcile-round39.md
?? .rsi/evidence/baseline-round39-attempt2.md
?? .rsi/evidence/baseline-round39.md
?? .rsi/evidence/checkpoint-comment-fix.md
?? .rsi/evidence/ci-health-round39.md
?? .rsi/evidence/ci-lib-consistency-round39-attempt1.md
?? .rsi/evidence/delivery-bilingual-edge.md
?? .rsi/evidence/harness/verify-round39-armed-row-refresh.txt
?? .rsi/evidence/harness/verify-round39-live.txt
?? .rsi/evidence/harness/verify-round39.md
?? .rsi/evidence/harness/verify-row-endstate-round39-attempt2.txt
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

```
$ git log --oneline -5
366d169 docs(rsi): compact fix — npm run ci output at 91d4361 (exit 0, 70 files / 1269 tests)
91d4361 docs(rsi): compact fix — integrated-state validation rows (merge e80ed6d) and merge attribution
65cab43 docs(rsi): compact fix — mainline before/after evidence, integrated status
f56b244 docs(rsi): handoff for 0.12.13 release
e80ed6d docs(rsi): record 0.12.13 release (CI + Release refs)
```

- `HEAD` = `366d169e98a681e84875d8d798f91d68f608e660`
- `main` = `origin/main` = `366d169` (all three `rev-parse` outputs identical)
- Tree is **dirty**: 8 tracked modifications, 20 untracked files.
- `git diff --stat`: 8 files changed, 509 insertions(+), 45 deletions(-).

### 1a. Sync vs `origin/main` — local refs only, **remote UNKNOWN**

| check | value | source |
|---|---|---|
| `git rev-list --left-right --count origin/main...main` | `0	0` | local refs |
| `.git/refs/remotes/origin/main` mtime | `2026-11-20 15:54:11.425722548 +0800` | `stat` |
| `.git/FETCH_HEAD` mtime | `2026-11-20 14:35:10.547065390 +0800` | `stat` |

`CONFIRMED`: local `main` and the local `origin/main` ref agree exactly (0 ahead / 0 behind).
**Remote state is UNKNOWN**: no `fetch` was run by this task, and the remote-tracking ref was last
written at 15:54 +08:00 (FETCH_HEAD 14:35 +08:00) — 3+ hours before this snapshot. A push by the
concurrent writer after that time would not be visible here. Treat "in sync with GitHub" as
`NOT_RUN`, not as verified.

---

## 2. HEAD vs tag `v0.12.13` (`CONFIRMED`)

| fact | value |
|---|---|
| tag object | `1566e18021a55738e3acc6f573240aeba35442e9` (type `tag` = annotated) |
| peels to commit | `490edce392a0ec96c8d1864e7208120c021e7eff` |
| `merge-base --is-ancestor v0.12.13 HEAD` | yes |
| `git rev-list --left-right --count v0.12.13...HEAD` | `0	6` → tag has 0 commits HEAD lacks; HEAD is **6 ahead** |
| `git describe --tags --long HEAD` | `v0.12.13-6-g366d169` |
| `package.json` version | `0.12.13` |
| `CHANGELOG.md` sections | `[Unreleased]` (line 6), `[0.12.13] - 2026-11-20` (line 51), `[0.12.12]` (63), `[0.12.11]` (107), `[0.12.10]` (144), `[0.12.9]` (164) |

The 6 commits between the tag and HEAD:

```
5fb5da0 fix(compact): an out-of-step assistant row stalled the token meter and broke /compact
e80ed6d docs(rsi): record 0.12.13 release (CI + Release refs)
f56b244 docs(rsi): handoff for 0.12.13 release
65cab43 docs(rsi): compact fix — mainline before/after evidence, integrated status
91d4361 docs(rsi): compact fix — integrated-state validation rows (merge e80ed6d) and merge attribution
366d169 docs(rsi): compact fix — npm run ci output at 91d4361 (exit 0, 70 files / 1269 tests)
```

Consequence worth carrying: the `/compact` fix (`5fb5da0`, merged by `e80ed6d`) is **not inside the
`v0.12.13` release** — it landed after the tag and sits in `[Unreleased]`. Anything claiming
"0.12.13 contains the compact fix" would be wrong.

---

## 3. Dirty-path inventory (tracked, `CONFIRMED`)

mtimes are `stat -c %y` (local +08:00); hashes are `sha256sum` first 16 hex chars.

| # | path | mtime (+08:00) | size (B) | sha256[:16] | diff |
|---|---|---|---|---|---|
| 1 | `CHANGELOG.md` | 2026-11-20 18:17:23.823778468 | 235024 | `be525d25a3e021de` | +15 |
| 2 | `lib/delivery/index.d.ts` | 2026-11-20 18:20:41.170731155 | 7790 | `a4d4d5dc6b695a71` | +21 |
| 3 | `lib/delivery/index.d.ts.map` | 2026-11-20 18:20:41.170731155 | 1696 | `ed1e3c3f2a577868` | 2 |
| 4 | `lib/delivery/index.js` | 2026-11-20 18:20:41.166731154 | 39801 | `3e44786f4bd55cad` | 128 |
| 5 | `lib/delivery/index.js.map` | 2026-11-20 18:20:41.165731154 | 25097 | `645d2da73179b6cf` | 2 |
| 6 | `src/checkpoint/schema.ts` | 2026-11-20 16:07:57.856099100 | 46125 | `df9bfa9bdde1ce45` | 10 |
| 7 | `src/delivery/index.ts` | 2026-11-20 18:13:18.140664151 | 40986 | `fb4af3fe5c2006a0` | 125 |
| 8 | `test/delivery-human-block.spec.ts` | 2026-11-20 16:53:32.104699288 | 30227 | `2033fe066c446dbf` | 251 |

Three distinct writers are visible in the mtimes: 16:07 / 16:53 (`checkpoint` comment + delivery
test) and 18:13 / 18:17 / 18:20 (`src/delivery` + `CHANGELOG` + rebuilt `lib/`).

What each dirty hunk actually is (`CONFIRMED` by reading the diffs):

- **#6 `src/checkpoint/schema.ts`** — adds a doc comment on `CHECKPOINT_LIMITS.maxBytes` explaining
  it bounds the *file*, not the payload (payload ceiling 1,048,447; integrity record 122 B + decimal
  digits of `bytes`), naming `test/checkpoint-bound.spec.ts`. Comment only, no behaviour change.
  Round 31's committed fix (`a97d099`, ancestor of HEAD) states the same fact at a *different*
  location — `src/checkpoint/schema.ts:866` inside `assertCheckpoint`. So this is a second,
  not-yet-committed copy of the same fact, not a revert.
- **#7 `src/delivery/index.ts`** — bilingual human-block budget split (`pairCaps`, line-boundary cut,
  astral-safe truncation); hunks at `+174`, `+193`, `+519`, `+528`, `+530`, `+605`, `+635`, `+693`.
- **#8 `test/delivery-human-block.spec.ts`** — +251 lines of regression coverage for the above.
- **#1 `CHANGELOG.md`** — adds the bilingual entry to `[Unreleased]` above the already-present
  `/compact` entry.
- **#2–#5 `lib/delivery/*`** — build output of #7. Verified consistent rather than independent drift:
  the marker comment `lone surrogate behind, which renders as a replacement box. Every clamp in this`
  is at `src/delivery/index.ts:179` and `lib/delivery/index.js:130`. `verify:lib` was **not** run
  (no builds allowed) → byte-identity is `NOT_RUN`.

### 3a. Untracked inventory (20 files, `CONFIRMED`)

| path | mtime (+08:00) | size (B) |
|---|---|---|
| `.rsi/evidence/baseline-reconcile-round39.md` | 2026-11-20 18:27:53 | 18109 |
| `.rsi/evidence/baseline-round39-attempt2.md` | 2026-11-20 18:13:32 | 14395 |
| `.rsi/evidence/baseline-round39.md` | 2026-11-20 16:09:25 | 15197 |
| `.rsi/evidence/checkpoint-comment-fix.md` | 2026-11-20 16:09:31 | 7651 |
| `.rsi/evidence/ci-health-round39.md` | 2026-11-20 16:15:28 | 6429 |
| `.rsi/evidence/ci-lib-consistency-round39-attempt1.md` | 2026-11-20 18:23:49 | 13323 |
| `.rsi/evidence/delivery-bilingual-edge.md` | 2026-11-20 18:22:55 | 18783 |
| `.rsi/evidence/harness/verify-round39-armed-row-refresh.txt` | 2026-11-20 16:34:43 | 840 |
| `.rsi/evidence/harness/verify-round39-live.txt` | 2026-11-20 16:39:14 | 6218 |
| `.rsi/evidence/harness/verify-round39.md` | 2026-11-20 16:37:50 | 10259 |
| `.rsi/evidence/harness/verify-row-endstate-round39-attempt2.txt` | 2026-11-20 18:31:44 | 12289 |
| `.rsi/evidence/harness/verify-row-endstate-round39.txt` | 2026-11-20 18:16:03 | 12840 |
| `.rsi/evidence/heartbeat-rearm/05-arm-cross-check.md` | 2026-11-20 13:16:24 | 3904 |
| `.rsi/evidence/heartbeat-rearm/06-attempt2-verification.txt` | 2026-11-20 13:46:01 | 9719 |
| `.rsi/evidence/heartbeat-rearm/07-handoff-one-call.md` | 2026-11-20 13:46:18 | 5957 |
| `.rsi/evidence/runtime-audit-2026-11-20.md` | 2026-11-20 13:32:27 | 13632 |
| `.rsi/evidence/triage-round39-reattempt.md` | 2026-11-20 18:19:03 | 28325 |
| `.rsi/evidence/triage-round39.md` | 2026-11-20 16:10:30 | 18338 |
| `test/checkpoint-bound.spec.ts` | 2026-11-20 16:06:55 | 7009 |
| `test/config-chain-types.spec.ts` | 2026-11-20 18:19:44 | 11111 |

Every untracked item is either an evidence note (two cohorts: the round-37 harness/arming notes at
13:16–13:46, and the round-39 notes at 16:06–18:31) or a test belonging to one of the dirty source
hunks — nothing untracked is a source file, and nothing untracked is committed.

---

## 4. Tree stability probe (`CONFIRMED`)

Two identical fingerprints 45 s apart, so this snapshot is of a quiet tree and not of a mid-write
tree:

| probe | `git status --porcelain \| sort \| sha256sum` | dirty-file content hash |
|---|---|---|---|
| pass 1 (19:00:5x +08:00) | `f041a0c14902c846ebbbebdbc1d42dd7f0c356ecffb757e0d23b0b34c225700f` | `6f774790326c032a64f82d23e40930f12d53140b347a801f9d90974a02c5327d` |
| pass 2 (19:01:50 +08:00) | `f041a0c14902c846ebbbebdbc1d42dd7f0c356ecffb757e0d23b0b34c225700f` | `6f774790326c032a64f82d23e40930f12d53140b347a801f9d90974a02c5327d` |

Newest dirty mtime in the tree is 18:31:44, i.e. **~29 minutes before** this snapshot — the
16:07–16:53 growth that made the previous baseline attempt report `partial` is not continuing here.
The snapshot is stable; it is not clean.

**Superseded within 8 minutes**: the writer resumed at 19:08–19:09 +08:00 (see §9). The stability
result above is a true statement about 19:00:25–19:01:50 only; it is not a statement about the tree
now.

---

## 5. Gate state (`CONFIRMED`)

`.rsi/STOP` — **ABSENT** (`test -e .rsi/STOP` false).

`.rsi/evidence/heartbeat-guard.log`, last three rows:

```
2026-11-20T16:37:18+08:00 verdict=SKIP code=dirty-tracked next_round=39 blocked_streak=0 dirty_tracked=10
2026-11-20T17:37:23+08:00 verdict=SKIP code=dirty-tracked next_round=39 blocked_streak=0 dirty_tracked=3
2026-11-20T18:37:10+08:00 verdict=STOP code=stall-unclosed  next_round=39 blocked_streak=0 dirty_tracked=8
```

So the loop's own gate read **STOP / stall-unclosed for round 39** at 18:37:10 — three consecutive
probes on the same round with a dirty tree (10 → 3 → 8 tracked files). The stall is a dirty-tree
stall, not a `.rsi/STOP` stop; the gate's own verdict is what a round-40 start must clear, and only a
commit (or a documented decision to leave the tree dirty) clears it.

---

## 6. Memory vs tree reconciliation

Legend: `CONFIRMED` = observed in this run; `CONTRADICTION` = memory text is false against the tree
as measured here. Nothing in memory was edited by this task.

### 6.1 `.rsi/STATE.md` (mtime 2026-11-20 14:34:10, 9773 B, 111 lines)

| # | memory claim | observed | verdict |
|---|---|---|---|
| S1 | `:1` "Updated: 2026-11-20T14:20+08:00 · round 37 … no release this round (`0.12.12` was published by the concurrent agent on `61c7cb8`)" | `package.json` = `0.12.13`; tag `v0.12.13` → `490edce`; `CHANGELOG.md:51` `[0.12.13] - 2026-11-20`; `ROUND.md` has a `## Round 38` section (line 1174); `.rsi/ledger.jsonl` last row is round 38 | **CONTRADICTION (stale)**: STATE.md is one round and one release behind. It names round 37 as current and knows nothing of `0.12.13`. |
| S2 | `:3` release list stops at `0.12.8`/`9f91684` | tags/CHANGELOG carry `0.12.9` … `0.12.13` | **CONTRADICTION (stale)**: five releases missing from the list. |
| S3 | `:79` test-count line ends `→ 68/1230` | `.rsi/LOG.md:80` records `ci 69/1263` for round 38; `HEAD` commit message records `70 files / 1269 tests`; `docs/knowledge/STATE.md:13` records `70 文件 / 1269 测试` | **CONTRADICTION (stale)**: three different counts, and the STATE line predates all of them. |
| S4 | `:83-86` "`~/.dsh/profiles/web` carries `dsh-grok-workflow` at the newest published tag; the shipped `lib/` is byte-identical to the tag's" | installed profile `~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json` = **`0.12.9`**, while newest published tag is `v0.12.13` | **CONTRADICTION**: installed profile is four releases behind the newest tag. `docs/knowledge/HANDOFF.md:10` says exactly this ("本机 `web` profile 仍是旧版"), so STATE.md is the outlier. |
| S5 | `:97-102` pool "still open and next in line" includes "the bare `TypeError` on a non-string `model`/`provider`" | closed by round 38: commit `7825ca7 fix(config): non-string model/provider refused with path and shape (RSI round 38)` (ancestor of HEAD), `src/config.ts:726` carries the "used to fall through to `?.trim()`" comment, `.rsi/LOG.md:80` row 38 records it | **CONTRADICTION (stale)**: an item listed as open is shipped. |
| S6 | `:6-20` round 37 `roles`-shape fact, code commit `eb61ac8`, harness commit `621f2ab` | both are ancestors of HEAD (`merge-base --is-ancestor` yes) | **CONFIRMED** — the only round-level claims in STATE.md that still hold. |
| S7 | `:110` "Consecutive failed rounds: 0. Consecutive no-value rounds: 0." | `.rsi/evidence/heartbeat-guard.log` 18:37:10 `verdict=STOP code=stall-unclosed` | **HYPOTHESIS at best**: the counter fields are untouched by the gate's STOP, but a stall-unclosed STOP on round 39 is not a "no failures" signal. Do not quote S7 as evidence the loop is healthy. |

### 6.2 `.rsi/LOG.md` (mtime 2026-11-20 15:41:36, 18141 B, 80 lines)

| # | memory claim | observed | verdict |
|---|---|---|---|
| L1 | `:80` newest row is round 38 (`2026-11-20T15:40+0800`, "OK — 40/40，ci 69/1263") | ledger row 38 matches (`round: 38`, same CI string) | **CONFIRMED** for round 38 itself. |
| L2 | no row exists for anything after round 38 | tree carries round-39 work: 8 tracked dirty files + 18 round-39 evidence notes + 2 new untracked tests | **CONTRADICTION (gap)**: the round currently in the tree (39) has no LOG row, no `ROUND.md` section, no ledger row. `.rsi/ROUND.md` newest section is `## Round 38` at line 1174; `.rsi/ledger.jsonl` newest row is round 38. |
| L3 | no row records the `0.12.13` release | `v0.12.13` tag exists and `CHANGELOG.md:51` has the section | **CONTRADICTION (gap)**: a shipped release with no LOG row. `ledger.jsonl` row 38 has `"tag": ""` and `"commit": ""` — the release that shipped round 38 is invisible in the ledger. |
| L4 | `:79` round-37 row says "**未发版**（并发进程持有未提交改动）" | correct at the time; `0.12.12` is `61c7cb8` | **CONFIRMED**. |
| L5 | table layout | rows 12–14 (lines 51–52, 60) and rows 60–79 sit outside the markdown table, after the `## Correction` section (line 54) | **Pre-existing formatting defect**, not a content contradiction: rows were appended after the table's end, so a table parser sees rows 0–11 plus stragglers. Worth knowing before anyone regenerates this file. |

### 6.3 `docs/knowledge/HANDOFF.md` (newest entry, mtime 2026-11-20 15:51:59, 198711 B, 2251 lines)

Newest entry = lines 1–10 (`## 2026-11-20 — 0.12.13 已发版（round-038：非字符串 model/provider）`).
The file is newest-first at the top; a second `# Agent Handoff` heading appears at line 106.

| # | memory claim | observed | verdict |
|---|---|---|---|
| H1 | `:4` "R38 提交 `7825ca7`（+证据 `490edce`）" | `7825ca7` = round-38 code commit; `490edce` = `docs(rsi): round 38 release CI evidence`; both ancestors of HEAD | **CONFIRMED**. |
| H2 | `:5` "发版提交 `61c7cb8`、annotated tag `v0.12.13` 已推" | `61c7cb8` = `chore(release): v0.12.12 — clamp keeps verdict (RSI round 36)`, and `v0.12.12` → `61c7cb8`; `v0.12.13` → `490edce` | **CONTRADICTION**: the release commit named for `0.12.13` is `0.12.12`'s release commit. The tag does not sit on `61c7cb8`. The correct pairing is `v0.12.13` → `490edce`. |
| H3 | `:7-8` "`npm run ci` 69/1263 全绿" | matches `.rsi/LOG.md:80` round-38 row | **CONFIRMED as a memory-to-memory match**; this task ran no CI, so the count against the *current* tree is `NOT_RUN` (the current tree adds untracked tests and dirty source). |
| H4 | `:10` "本机 `web` profile 仍是旧版" | installed = `0.12.9` | **CONFIRMED** (and it contradicts `.rsi/STATE.md:83-86`, see S4). |
| H5 | `:44-75` `/compact` root-cause entry: merged by `e80ed6d` (parents `490edce` + `5fb5da0`), `lib/` rebuilt, `verify:lib` exit 0 on the merged tree | `e80ed6d` and `5fb5da0` are both in `v0.12.13..HEAD`; `git log` shows `e80ed6d` immediately above `5fb5da0` | **CONFIRMED** for ancestry; the `verify:lib`/CI results are `NOT_RUN` here (no builds). |
| H6 | `:12-42` one-arming entry: `--verify-row` was `ARMED`, `covered=963` = `remaining=963`, last occurrence `2026-12-30T15:36:57Z` | not re-measured by this task (constraint: no `schedule_*`, no model/network); `.rsi/evidence/harness/verify-round39-*.txt` are untracked round-39 measurements whose content was not re-derived here | `NOT_RUN` — carried, not verified. |
| H7 | `:33-34` "同一 checkout 有并发进程持有未提交的 `src/delivery` 改动" (round 37 entry) | still true at this snapshot: `src/delivery/index.ts` + `test/delivery-human-block.spec.ts` + `CHANGELOG.md` + `lib/delivery/*` dirty | **CONFIRMED** — the warning is still live, now 2.5 h older. |

### 6.4 Cross-file / provenance inconsistencies (no single owner file)

| # | observation | evidence |
|---|---|---|
| X1 | The untracked note for the bilingual work labels itself **round 37, attempt 2**, while its siblings label the same body of work **round 39** | `.rsi/evidence/delivery-bilingual-edge.md:1` = "# Delivery: bilingual truncation edges (round 37, attempt 2)" vs `.rsi/evidence/ci-health-round39.md:1`, `.rsi/evidence/triage-round39.md`, `baseline-round39*.md` |
| X2 | The same 1,048,447 fact now exists in two places: committed at `src/checkpoint/schema.ts:866` (round 31, `a97d099`) and uncommitted at the `CHECKPOINT_LIMITS.maxBytes` doc comment (dirty, pins `test/checkpoint-bound.spec.ts`) | `git show HEAD:src/checkpoint/schema.ts` lines 858–872 vs `git diff src/checkpoint/schema.ts` |
| X3 | Two untracked test files belong to dirty/uncommitted work: `test/checkpoint-bound.spec.ts` (16:06:55, paired with the schema comment) and `test/config-chain-types.spec.ts` (18:19:44, imports `resolveConfig`/`snapshotConfig` from `src/config.ts`) | `head -3` of each; neither is referenced by any committed source |
| X4 | Memory's newest round is 38; the tree's newest work is 39; this task is the round-40 baseline | `ROUND.md:1174`, `ledger.jsonl` last row, `LOG.md:80`, `heartbeat-guard.log` `next_round=39` |

---

## 7. What a round-40 start inherits

1. **A dirty tree with a live writer.** 8 tracked + 20 untracked at 19:00, quiet for 45 s then quiet
   for ~29 min, then **growing again at 19:08–19:09** (`§4`, `§9`). Any claim about the tree's test
   state is `NOT_RUN` until the writer stops, the change set is committed, and CI is run. `lib/` is
   stale relative to `src/delivery/index.ts` (`§9a`).
2. **An open stall.** The gate said `STOP code=stall-unclosed` for round 39 at 18:37:10 (`§5`).
   `.rsi/STOP` does not exist, so the stall is "same round, dirty tree, three probes" — it clears by
   committing the round-39 change set or by recording a decision, not by waiting.
3. **A memory layer that is one round and one release behind** (`.rsi/STATE.md`), with two concrete
   falsehoods (S4 installed-profile, S5 open item that shipped) and one misattributed commit
   (H2). `.rsi/LOG.md` and `.rsi/ledger.jsonl` have no round-39 row and no `0.12.13` release row.
4. **Avoid list for parallel writers** (all currently dirty; do not touch without coordinating):
   `src/delivery/index.ts`, `test/delivery-human-block.spec.ts`, `CHANGELOG.md`,
   `lib/delivery/*` (build output of the former), `src/checkpoint/schema.ts`,
   `test/checkpoint-bound.spec.ts`, `test/config-chain-types.spec.ts`.
5. **Release reality**: `v0.12.13` is an annotated tag on `490edce`, HEAD is 6 commits past it, and
   the `/compact` fix is unreleased in `[Unreleased]`.

---

## 8. Verification of this report

| check | command | result |
|---|---|---|
| status/log/HEAD | `git status --short --branch`, `git log --oneline -5`, `git rev-parse HEAD` | `CONFIRMED` (§1) |
| tag relation | `git cat-file -t v0.12.13`, `git rev-parse v0.12.13^{commit}`, `git merge-base --is-ancestor`, `git rev-list --left-right --count v0.12.13...HEAD`, `git describe --tags --long HEAD` | `CONFIRMED` (§2) |
| sync | `git rev-list --left-right --count origin/main...main` (local refs, no fetch) | `0 0`; remote `UNKNOWN` (§1a) |
| dirty inventory | `stat -c %y`, `stat -c %s`, `sha256sum`, `git diff --stat` per path | `CONFIRMED` (§3) |
| stability | two `git status --porcelain \| sort \| sha256sum` passes 45 s apart | identical at 19:01:50 (§4); **superseded** — writer resumed, re-measured in §9 |
| gate | `test -e .rsi/STOP`, `tail .rsi/evidence/heartbeat-guard.log` | `STOP ABSENT`, last verdict `STOP/stall-unclosed` (§5) |
| memory files | read `.rsi/STATE.md` (111 lines), `.rsi/LOG.md` (80 lines), `docs/knowledge/HANDOFF.md` head/headings, `.rsi/ledger.jsonl` tail, `.rsi/ROUND.md` headings | `CONFIRMED` (§6) |
| installed profile | `grep '"version"' ~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json` | `0.12.9` (§6 S4) |
| `npm run ci` / `typecheck` / `verify:lib` | not run (constraint: no builds) | `NOT_RUN` |
| fetch / push / tag / commit | not run (constraint) | `NOT_RUN` |

Snapshot by agent-169, 2026-11-20T11:01:50Z (19:01:50 +08:00), working tree unchanged by this task
apart from this file.

---

## 9. Post-report re-measurement — the writer resumed (`CONFIRMED`)

Re-hashing the dirty set after writing §1–§8 showed two files had changed under me. Re-measured at
`2026-11-20T11:09:49Z` (19:09:49 +08:00):

| path | mtime (+08:00) | size (B) | sha256[:16] | vs §3 |
|---|---|---|---|---|
| `CHANGELOG.md` | 2026-11-20 18:17:23.823778468 | 235024 | `be525d25a3e021de` | unchanged |
| `lib/delivery/index.d.ts` | 2026-11-20 18:20:41.170731155 | 7790 | `a4d4d5dc6b695a71` | unchanged |
| `lib/delivery/index.d.ts.map` | 2026-11-20 18:20:41.170731155 | 1696 | `ed1e3c3f2a577868` | unchanged |
| `lib/delivery/index.js` | 2026-11-20 18:20:41.166731154 | 39801 | `3e44786f4bd55cad` | unchanged |
| `lib/delivery/index.js.map` | 2026-11-20 18:20:41.165731154 | 25097 | `645d2da73179b6cf` | unchanged |
| `src/checkpoint/schema.ts` | 2026-11-20 16:07:57.856099100 | 46125 | `df9bfa9bdde1ce45` | unchanged |
| `src/delivery/index.ts` | **2026-11-20 19:08:17.880696170** | **43651** | **`3fd973fc03aa675d`** | **grew**: was 40986 B @ 18:13:18, `fb4af3fe5c2006a0` |
| `test/delivery-human-block.spec.ts` | **2026-11-20 19:09:41.822926329** | **36780** | **`d7137dfee0593345`** | **grew**: was 30227 B @ 16:53:32, `2033fe066c446dbf` |

`git diff --stat` moved from `8 files changed, 509 insertions(+), 45 deletions(-)` to
`8 files changed, 701 insertions(+), 48 deletions(-)` — `src/delivery/index.ts` +125 → +186,
`test/delivery-human-block.spec.ts` +251 → +385. Tracked-dirty count is still 8; untracked count is
21 (20 + this report).

Stability re-probe across 30 s at 19:09:49–19:10:19: `git status --porcelain | sort | sha256sum` =
`654c407deb18e09c2b1d5ce1546276552c250636c052a4cf8d55732408c37fef` on both passes — quiet again as of
19:10:19, but that is a 30-second window, not a guarantee.

### 9a. What this changes for the round-40 start

- **The 19:00 snapshot in §3 is stale for two paths.** Use the §9 numbers for
  `src/delivery/index.ts` and `test/delivery-human-block.spec.ts`; everything else in §3 still holds.
- **`lib/delivery/*` is now out of date relative to `src/delivery/index.ts`.** The `lib/` files still
  carry the 18:20 build of the 18:13 source. A rebuild (which this task may not run) would change all
  four `lib/` files again. So `verify:lib` on this tree is `NOT_RUN` *and* expected to fail — do not
  read the dirty `lib/` as "in sync with `src/`".
- **A concurrent writer is live, not finished.** Its work spans 16:07 → 19:09 with a gap and then a
  resumption, so the round-39 change set is still being authored while round-39 records do not exist
  (§6 L2). Any baseline taken before that writer stops is a snapshot, not a clean state.
- **The stall diagnosis stands and is now sharper.** The gate's `STOP code=stall-unclosed`
  (`§5`, 18:37:10, `dirty_tracked=8`) was correct: the tree has been dirty for 3+ hours across three
  probes, and the dirty content is still growing. Committing it, or explicitly quarantining the
  writer, is the only thing that closes the stall.

Re-measurement by agent-169, 2026-11-20T11:10:19Z (19:10:19 +08:00). This task wrote only this file.

### 9b. Third data point — the writer is still going (`CONFIRMED`)

A final integrity check at `2026-11-20T11:13:40Z` (19:13:40 +08:00) found the test file changed a
**second** time after §9:

| path | mtime (+08:00) | size (B) | sha256[:16] | trajectory |
|---|---|---|---|---|
| `test/delivery-human-block.spec.ts` | 2026-11-20 19:12:10.494869787 | 37138 | `cc405beb5b1a8874` | 30227 B @16:53:32 → 36780 B @19:09:41 → **37138 B @19:12:10** |
| `src/delivery/index.ts` | 2026-11-20 19:08:17.880696170 | 43651 | `3fd973fc03aa675d` | 40986 B @18:13:18 → 43651 B @19:08:17 (unchanged since) |

`git diff --stat` at 19:13:40: `8 files changed, 705 insertions(+), 48 deletions(-)`
(`src/delivery/index.ts` +164/−22; `test/delivery-human-block.spec.ts` +387/−2). Tracked-dirty count
is still 8; the only added path is this report.

**Conclusion, stated plainly:** the round-39 change set was still being appended to 13 minutes after
this task started, so no hash of `src/delivery/index.ts` or `test/delivery-human-block.spec.ts` in
this file should be treated as final. What is stable and worth carrying is the part that does not
depend on those files: HEAD `366d169`, the `v0.12.13` → `490edce` relation with HEAD 6 ahead, the
8-tracked-file / 20-untracked shape, the `STOP code=stall-unclosed` gate verdict, and the
memory-versus-tree contradictions in §6 — none of which the writer's growth changes. Re-run the
`§3`/`§9` commands (they are all read-only) for a fresh hash set before acting on any single hash.

### 9c. Round-40 siblings are writing too (`CONFIRMED`)

The untracked set grew from 21 to **24** while this report was being finished. The three additions are
**not** this task's writes — they are sibling tasks of the same round-40 workflow:

| path | mtime (+08:00) | size (B) | self-description (line 1) |
|---|---|---|---|
| `.rsi/evidence/checkpoint-round40.md` | 2026-11-20 19:08:18 | 10217 | (checkpoint comment task) |
| `.rsi/evidence/harness-round40.md` | 2026-11-20 19:13:00 | 8943 | `# Verify — armed heartbeat row, round 40 (verification only, no mutation)` |
| `.rsi/evidence/triage-round40.md` | 2026-11-20 19:14:47 | 21717 | `# POOL triage, round 40 — open-item inventory, anchors, file-disjoint themes` |

Consequences: (a) the "20 untracked" figure in `§1`/`§3a` and the "21" in `§9` are both historical —
read 24 as of 19:14:47; (b) three of the eight tracked-dirty files are being edited by more than one
task's writer at once, so a `git add`/commit by any single task right now would capture another
task's half-finished work; (c) the harness verify-row evidence lives in `harness-round40.md`, owned by
a different task — this report deliberately does not duplicate or adjudicate its numbers.

### 9d. At delivery: 12 tracked dirty, not 8 (`CONFIRMED`)

Final state check `2026-11-20T11:17:27Z` (19:17:27 +08:00). A rebuild ran at ~19:15, so the tracked
dirty set grew from 8 to **12** — four `lib/checkpoint/*` artifacts joined it, produced from the
dirty `src/checkpoint/schema.ts` comment:

```
 M CHANGELOG.md
 M lib/checkpoint/schema.d.ts          <- new since §3
 M lib/checkpoint/schema.d.ts.map      <- new since §3
 M lib/checkpoint/schema.js            <- new since §3
 M lib/checkpoint/schema.js.map        <- new since §3
 M lib/delivery/index.d.ts
 M lib/delivery/index.d.ts.map
 M lib/delivery/index.js
 M lib/delivery/index.js.map
 M src/checkpoint/schema.ts
 M src/delivery/index.ts
 M test/delivery-human-block.spec.ts
```

`git diff --stat`: `12 files changed, 784 insertions(+), 54 deletions(-)` (was 8/509/45 at 19:00, 8/701/48
at 19:10). Note this **weakens** `§9a`'s "`lib/` is stale relative to `src/`" for the checkpoint pair —
that pair was just rebuilt — while `lib/delivery/*` still carries the 18:20 build of an 18:13 source
against a 19:08 source, so the delivery pair is still stale. Do not generalize either way without
re-measuring: `lib/` freshness here changes minute by minute because the writer rebuilds.

**Bottom line for the round-40 start:** every hash in `§3`, `§9`, `§9b` is a timestamped snapshot of a
tree that was under active concurrent modification for the whole 17 minutes of this task (19:00 →
19:17). The durable findings are `§2` (HEAD/tag relation), `§5` (gate verdict), and `§6` (memory vs
tree contradictions) — the dirty-path numbers must be re-read, not quoted, before use.

Delivered by agent-169, 2026-11-20T11:17:27Z. Only file written by this task: this report.
