# Baseline for parallel iteration — round 39 (2026-11-20)

Reconciliation only. No source, memory-doc, or changelog file was edited by this task; the only
write is this file. Two observation windows on `/home/fish/projects_mine/dsh-grok-workflow`:
**T1 = 16:05–16:07** (clean) and **T2 = 16:07:55–16:08:09** (a concurrent writer's changes landed).
Both are reported because the tree changed under this run — that *is* the baseline fact a parallel
round needs.

## 1. Tree and branch

### T1 — tracked tree clean, branch synced (`CONFIRMED`)

`git status --short --branch`:

```text
## main...origin/main
?? .rsi/evidence/heartbeat-rearm/05-arm-cross-check.md
?? .rsi/evidence/heartbeat-rearm/06-attempt2-verification.txt
?? .rsi/evidence/heartbeat-rearm/07-handoff-one-call.md
?? .rsi/evidence/runtime-audit-2026-11-20.md
```

- HEAD = `366d169e98a681e84875d8d798f91d68f608e660`, branch `main`, commit date `2026-11-20 15:54:04 +0800`.
- `git rev-parse origin/main` = `366d169e98a681e84875d8d798f91d68f608e660` → `HEAD == origin/main`.
- `git rev-list --left-right --count origin/main...HEAD` → `0	0` (no divergence, no local-only commit; no fetch was run).
- The four untracked evidence files have mtimes 13:16–13:46, older than HEAD — they predate the last
  commit and were never committed by it, they are not new writes.

`git log --oneline -5`:

```text
366d169 docs(rsi): compact fix — npm run ci output at 91d4361 (exit 0, 70 files / 1269 tests)
91d4361 docs(rsi): compact fix — integrated-state validation rows (merge e80ed6d) and merge attribution
65cab43 docs(rsi): compact fix — mainline before/after evidence, integrated status
f56b244 docs(rsi): handoff for 0.12.13 release
e80ed6d docs(rsi): record 0.12.13 release (CI + Release refs)
```

### T2 — dirty: a concurrent writer opened a fix in this checkout (`CONFIRMED`)

`git status --short --branch` at 16:08:09:

```text
## main...origin/main
 M src/checkpoint/schema.ts
 M test/delivery-human-block.spec.ts
?? .rsi/evidence/baseline-round39.md
?? .rsi/evidence/heartbeat-rearm/05-arm-cross-check.md
?? .rsi/evidence/heartbeat-rearm/06-attempt2-verification.txt
?? .rsi/evidence/heartbeat-rearm/07-handoff-one-call.md
?? .rsi/evidence/runtime-audit-2026-11-20.md
?? test/checkpoint-bound.spec.ts
```

- `git diff --stat` → `src/checkpoint/schema.ts | 10 ++++++-`, `test/delivery-human-block.spec.ts | 61 ++++++++++` (2 files, 70 insertions, 1 deletion).
- mtimes: `test/checkpoint-bound.spec.ts` 16:06:55, `test/delivery-human-block.spec.ts` 16:07:35,
  `src/checkpoint/schema.ts` 16:07:55 — all after T1 and after HEAD. **Not authored by this task.**
- The `src/` change is a comment block on `CHECKPOINT_LIMITS.maxBytes` (file bound vs payload bound,
  the 1,048,447 / 1,048,576 distinction that has been an open comment-accuracy item since round 27),
  pinned by the new `test/checkpoint-bound.spec.ts`. A parallel round must treat that as someone
  else's in-flight work.
- HEAD and `origin/main` unchanged across T1→T2 (`366d169`), so nothing was committed during the window.
- Verdict: **clean at T1, dirty at T2.** Any claim of "tree clean" written before 16:07 is already stale.

### T3 — the target moved again while this report was being written (`CONFIRMED`, 16:08:30–16:08:56)

```text
## main...origin/main
 M src/checkpoint/schema.ts
?? .rsi/evidence/baseline-round39.md
?? .rsi/evidence/checkpoint-comment-fix.md
?? .rsi/evidence/heartbeat-rearm/05-arm-cross-check.md
?? .rsi/evidence/heartbeat-rearm/06-attempt2-verification.txt
?? .rsi/evidence/heartbeat-rearm/07-handoff-one-call.md
?? .rsi/evidence/runtime-audit-2026-11-20.md
?? test/checkpoint-bound.spec.ts
```

- `test/delivery-human-block.spec.ts` was **reverted** (mtime 16:08:30, no longer in `git diff`); only
  `src/checkpoint/schema.ts` remains modified (`git diff --stat` → 1 file, 9 insertions, 1 deletion,
  mtime 16:07:57).
- The writer added its own evidence file `.rsi/evidence/checkpoint-comment-fix.md` (16:08:35).
- Guard re-run: `SKIP code=dirty-tracked … dirty_tracked=1 … first uncommitted: src/checkpoint/schema.ts`, exit 10.
- HEAD still `366d169`; nothing committed.
- Reading: a concurrent round is **actively in progress** in this checkout — its working set is not
  stable for even a minute. The T1/T2 rows below are snapshots, not a state you can plan against;
  re-run `git status --short --branch` and the guard immediately before opening round 39.
- T4 (16:09:19, for completeness only): dirty set back to three tracked files —
  `src/checkpoint/schema.ts`, `src/delivery/index.ts`, `test/delivery-human-block.spec.ts` — with
  `test/checkpoint-bound.spec.ts` and `.rsi/evidence/checkpoint-comment-fix.md` still untracked.
  The writer is mid-flight by construction; no further snapshot in this report can be current, which
  is why §6 makes a fresh guard read a precondition rather than a citation.

## 2. HEAD vs tag `v0.12.13` (`CONFIRMED`)

- `v0.12.13` is an **annotated tag object** `1566e18021a55738e3acc6f573240aeba35442e9`;
  `git rev-parse v0.12.13^{commit}` → `490edce392a0ec96c8d1864e7208120c021e7eff`
  ("docs(rsi): round 38 release CI evidence"). Tag message: `v0.12.13 — non-string model/provider refused with path (RSI round 38)`.
- `git merge-base --is-ancestor v0.12.13 HEAD` → yes. `git rev-list --count v0.12.13..HEAD` = 6,
  `v0.12.13..HEAD` behind-count = 0. `git describe --tags HEAD` → `v0.12.13-6-g366d169`.
- So HEAD is **6 commits ahead of the release tag, 0 behind**; the six are `5fb5da0` (round-38 code),
  `e80ed6d` (merge), `f56b244`, `65cab43`, `91d4361`, `366d169` — docs/evidence only.
- Remote: `git ls-remote --tags origin v0.12.13` → `1566e18…	refs/tags/v0.12.13`, identical to the
  local object ⇒ the published tag was not moved.
- Release corroboration, read-only over the network: `gh run view 44697135387` → CI `success`,
  headSha `490edce…`; `gh run view 44697140006` → Release `success`, headSha `490edce…`;
  `gh release view v0.12.13` → published, not draft/prerelease, asset
  `dsh-grok-workflow-0.12.13.tgz` (609,485 B).
- Version: `package.json` at HEAD = `0.12.13`, same at the tag. The bump rode in `7825ca7`
  ("fix(config): non-string model/provider refused …"), so **there is no `chore(release): v0.12.13`
  commit**: `git log --grep='chore(release)'` shows `61c7cb8` as the newest and it is
  "chore(release): v0.12.12 — clamp keeps verdict (RSI round 36)", 2026-11-20 14:13.

## 3. Heartbeat

### T1 — `RESUME` (`CONFIRMED`)

`bash .rsi/tools/heartbeat-guard.sh` → **exit 0**:

```text
RESUME code=none next_round=39 threshold=3 max_rounds=0 blocked_streak=0 round_max=38 ledger_max=38 dirty_tracked=0 report_open=0 unclosed_skips=0
```

### T2 — `SKIP` (`CONFIRMED`)

`bash .rsi/tools/heartbeat-guard.sh` → **exit 10**:

```text
SKIP code=dirty-tracked next_round=39 threshold=3 max_rounds=0 blocked_streak=0 round_max=38 ledger_max=38 dirty_tracked=2 report_open=0 unclosed_skips=0
first uncommitted: src/checkpoint/schema.ts
```

The verb flipped for exactly one reason: the concurrent writer's two tracked edits. `blocked_streak=0`
and `unclosed_skips=0`, so nothing is at risk yet — but `threshold=3` means three consecutive
heartbeat turns over the same unclosed dirty tree turn `SKIP` into `STOP`.

### ARMED row — unchanged in both windows (`CONFIRMED`)

`node .rsi/tools/iterate-plan.mjs --verify-row` → **exit 0** at T1 and again at T2:

```text
verify status=ARMED title="RSI heartbeat" remaining=962
verify row=schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab COUNT=969 delivered=7 covered=962 last=2026-12-30T15:36:57.000Z
verify check title ok / rule-parsed ok (COUNT=969, INTERVAL=60) / within-row-maximum ok (969 vs 1000)
verify check covers-remaining-budget ok (962 left vs 962 remaining) / has-a-future-occurrence ok
verify store=<home>/.dsh/storages/schedule.json
```

| field | value |
| --- | --- |
| status | ARMED |
| row id | `schedule-0bbbef5f-602e-4700-a5ff-806009cff4ab` |
| COUNT | 969 |
| delivered | 7 |
| covered | 962 |
| remaining | 962 |
| last occurrence | 2026-12-30T15:36:57.000Z (future vs now 2026-11-20T08:05:27Z) |

Both tools are read-only in these invocations: `heartbeat-guard.sh` without `--record` appends
nothing, `--verify-row` reads the host store and prints counts only — no prompt text, no credentials.

## 4. Memory vs tree — consistency verdict

| record | claim | tree | verdict |
| --- | --- | --- | --- |
| `.rsi/LOG.md` | last row = round 38 `OK`, ci 69/1263, evidence `.rsi/evidence/round-038/` | `.rsi/ROUND.md:1174` has `## Round 38 …`; `.rsi/evidence/round-038/` holds `ci-mine.txt`, `ci-release.txt` | MATCH |
| `.rsi/ledger.jsonl` | rounds 1–38 | guard reads `round_max=38 ledger_max=38`, round-38 row present | MATCH on max, but the round-38 row carries `"commit": ""` and `"tag": ""` while v0.12.13 shipped — **stale fields** |
| `.rsi/STATE.md` | header `Updated: 2026-11-20T14:20+08:00 · round 37 … no release this round (0.12.12 …)` | HEAD contains round-38 code `7825ca7`, tag `v0.12.13`, release records | **STALE** — file stops at round 37 while the tree is at released round 38 |
| `docs/knowledge/STATE.md` (top, 15:50) | `/compact` fix merged by `e80ed6d` (parents `490edce` + `5fb5da0`); `git status -- lib/` empty; devDependency `@deepseek-ai/dsh-token-meter` added | `e80ed6d` is the merge commit; `git status -- lib/` empty at T1; `package.json` has the devDependency (`^0.2.1-rc.2`) | MATCH |
| `docs/knowledge/HANDOFF.md` §1 (0.12.13) | "R38 提交 `7825ca7`（+证据 `490edce`）、**发版提交 `61c7cb8`**、annotated tag `v0.12.13` 已推；CI `44697135387`、Release `44697140006`" | `7825ca7` and `490edce` real; **`61c7cb8` is `chore(release): v0.12.12`** — the file's own line 80–81 says so; no 0.12.13 release commit exists; both workflow runs name headSha `490edce` | **WRONG FIELD** — copy-forward from the 0.12.12 section; tag, CI, Release and asset all check out |
| `docs/knowledge/HANDOFF.md` §2 (round-37 arming) | row `schedule-0bbbef5f-…` re-armed to `COUNT=969`, `covered=963 = remaining=963`, guard `RESUME next_round=38` | today `COUNT=969`, `covered=962`, `remaining=962`, guard `next_round=39` | MATCH modulo the two rounds consumed since |

Overall: **one memory defect, two stale fields, no code or tag problem.** The tree, the tag object,
the remote tag, CI and the Release all agree with each other. What is wrong is memory: `.rsi/STATE.md`
is a round behind, ledger row 38 has empty `commit`/`tag`, and the `0.12.13` hand-off names the
`0.12.12` release commit. All three are memory-only edits and are **not** part of this task.

`NOT_RUN` by design (would write `lib/` or spend budget): `npm run ci`, `npm run verify:lib`,
`npm test`. `lib/` byte-identity therefore rests on `git status` being clean at T1, not on a rebuild
by me.

## 5. Avoid list — dirty or concurrency-owned scopes

Live, as of T2 — do not touch without coordinating:

1. `src/checkpoint/schema.ts` — modified 16:07:55 by the concurrent writer (comment block on
   `CHECKPOINT_LIMITS.maxBytes`).
2. `test/delivery-human-block.spec.ts` — modified 16:07:35 by the same writer (+61 lines).
3. `test/checkpoint-bound.spec.ts` — new untracked test from the same writer (16:06:55).

Standing, not dirty:

4. `lib/` — all 149 files carry mtime `16:00`, after HEAD (`15:54`): another process rebuilt the
   committed artifacts in this checkout after the last commit. Content matched HEAD at T1 (tree
   clean), so nothing was lost, but a parallel round that runs `npm run build` / `npm run ci` here
   writes `lib/` under that process's feet. No build/test process was alive at 16:05–16:12
   (`ps` showed only the DSH hosts) — treat `lib/` as recently touched, not locked.
5. Untracked evidence: `.rsi/evidence/heartbeat-rearm/05-arm-cross-check.md`,
   `06-attempt2-verification.txt`, `07-handoff-one-call.md`, `.rsi/evidence/runtime-audit-2026-11-20.md`.
6. Worktree `/home/fish/projects_mine/dsh-grok-workflow/.agents/worktrees/fix-compact-orphan-receipt`
   on branch `fix-compact-orphan-receipt` at `5fb5da0` — already merged into `main` by `e80ed6d`.
   Leave it alone; do not reuse it as scratch space.
7. No `.git/*.lock`, no `*.lock` in the working tree, no in-flight git operation observed at T1.
8. `.rsi/POOL.md` (mtime 15:45) is the round-39 candidate source: `pool open=19 total=49`,
   `top_next=line 94` (`P · repairLimitOverruns still clamps seven removed keys through LEGACY_LIMIT_CAPS`).
   Memory doc — read it; do not edit it from a round that is not closing an item.

## 6. Parallel-iteration instruction

The heartbeat is ARMED for 962 more rounds and `next_round=39` is the open slot, but the **guard's
verdict is `SKIP` at T2 (`dirty_tracked=2`) and still `SKIP` at T3 (`dirty_tracked=1`)**: round 39
cannot be opened in this checkout while the concurrent writer holds
`src/checkpoint/schema.ts` / `test/checkpoint-bound.spec.ts`. Concretely:

- Re-run `git status --short --branch` and `bash .rsi/tools/heartbeat-guard.sh` **at the moment you
  start**, require `RESUME` (exit 0) plus `dirty_tracked=0`, and only then open round 39. The tree
  changed three times inside four minutes of this run (16:05 clean → 16:07:55 two edits → 16:08:30
  one reverted, one evidence file added), so a snapshot older than a couple of minutes is worthless.
- If you work in parallel anyway, use a separate worktree off `366d169` — never the
  `fix-compact-orphan-receipt` worktree, and never the same three files.
- Expect `lib/` mtimes newer than HEAD; re-check `git status -- lib/` after any build.
- Do not "clean up" the four untracked evidence files or the three stale memory fields as a side
  effect of a code round.

## 7. No-touch proof for this task

Digests of the protected set, taken at T1 before writing this file and re-taken at T2 after
(`sha256sum`):

| path | T1 | T2 |
| --- | --- | --- |
| `CHANGELOG.md` | `c17dc2d5…b65cef` | `c17dc2d5…b65cef` |
| `.rsi/POOL.md` | `3b956ab7…94c1b1` | `3b956ab7…94c1b1` |
| `.rsi/STATE.md` | `a15b3626…41a3ba` | `a15b3626…41a3ba` |
| `docs/knowledge/STATE.md` | `0543a675…d4696bd` | `0543a675…d4696bd` |
| `docs/knowledge/HANDOFF.md` | `ac873b9a…b21a2d533` | `ac873b9a…b21a2d533` |
| `docs/knowledge/VALIDATION.md` | `ad59b808…5bcced8b` | `ad59b808…5bcced8b` |
| `docs/knowledge/DECISIONS.md` | `ef0acf6d…33d373639` | `ef0acf6d…33d373639` |
| `package.json` | `eab480c2…5c52e` | `eab480c2…5c52e` |

`src/` + `lib/` (recursive digest of sorted per-file hashes) moved from
`891b8d0fa6943d77d0168a5057671a796753ab35effb5d8a8719fff33035bed5` (T1) to
`5e9ef1eea8c03a406476760b29c9756dadb4d16c69a20293be5257c27c8185ab` (T2). That change is the
concurrent writer's `src/checkpoint/schema.ts` edit at 16:07:55 — this task opened no file under
`src/`, `lib/`, `CHANGELOG.md`, `.rsi/POOL.md`, `.rsi/STATE.md` or `docs/knowledge/` for writing at
any point; the only file created is `.rsi/evidence/baseline-round39.md`.

No commit, tag, push, pull, merge, or release action was performed by this task.

设备=dsh-grok-workflow subagent agent-114，时间 2026-11-20
