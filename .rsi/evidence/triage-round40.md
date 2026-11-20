# POOL triage, round 40 — open-item inventory, anchors, file-disjoint themes

Task: `pool_triage` · **From:** agent-170 (subagent, round 40) · **To:** lead / next round
Repo: `/home/fish/projects_mine/dsh-grok-workflow` · Method: deterministic local `git` / `stat` /
`grep` / `sed` only. No network, no model, no build, no test run, no commit.

**Side effects:** the only file written by this task is this report. No `src/`, `lib/`, `test/`,
`CHANGELOG.md`, `POOL.md` or `STATE.md` byte was touched; nothing was committed, built, or pushed.

Status vocabulary follows `AGENTS.md`: `CONFIRMED` = read in source or measured by a command in this
run; `HYPOTHESIS` = plausible, unmeasured; `NOT_RUN` = deliberately not executed.

---

## 1. The snapshot this report describes

| Fact | Value | How measured |
| --- | --- | --- |
| Branch | `main...origin/main` (no divergence) | `git status --short --branch` |
| `HEAD` | `366d169` — `docs(rsi): compact fix — npm run ci output at 91d4361` | `git rev-parse HEAD`, `git log --oneline -5` |
| Version | `0.12.13` | `node -e "require('./package.json').version"` |
| `POOL.md` | 232 lines, **19** open `- P ·` entries | `wc -l`, `grep -c "^- P ·"` |
| `POOL.md` identity | sha256 `3b956ab7e8565f1ad7b26e3cf66e0d4377a316586ab993097f957846da94c1b1`, mtime `2026-11-20 15:45:09`, last commit `e80ed6d` | `sha256sum`, `stat`, `git log -1 -- .rsi/POOL.md` |
| `POOL.md` vs `HEAD` | unmodified (`git diff --stat HEAD -- .rsi/POOL.md` prints nothing) | same |
| Wall clock | first command `19:00:25 +08:00`; §2 anchors measured ~`19:07`; delivery re-verified after the 19:08:17 write; last measurement `19:10:25` | `date -Is` |

### 1.1 Paths held by other workers (the tree is not quiet)

`git status --short` merged across this run, 19:07:30 → 19:15:30 (`CONFIRMED`, verbatim subset; the
mtimes and numstat are mine, `git status` does not print them):

```
 M CHANGELOG.md                       (18:17:23, +15)
 M lib/checkpoint/schema.{js,d.ts,*.map}  (19:15:06, +9/−1 — rebuilt by the round-40 checkpoint worker)
 M lib/delivery/index.{js,d.ts,*.map}  (rebuilt output of the dirty src below)
 M src/checkpoint/schema.ts            (16:07:57, +9/−1)
 M src/delivery/index.ts               (18:13:18 → 19:08:17 during this run, +164/−22)
 M test/delivery-human-block.spec.ts   (16:53:32 → 19:09:41 during this run, +383/−2)
?? test/checkpoint-bound.spec.ts       (round-40 checkpoint worker's spec)
?? test/config-chain-types.spec.ts     (round-39 config worker's spec)
?? .rsi/evidence/{baseline-round40.md, checkpoint-round40.md}   (appeared during this run)
```

Two round-40 workers are live and their own headers state their scope, which I read rather than
assumed: `.rsi/evidence/checkpoint-round40.md:3-5` claims "one docblock (`schema.ts`), one spec file
(`checkpoint-bound.spec.ts`), this note"; `.rsi/evidence/baseline-round40.md:5-6` claims it wrote only
its report. Neither claims `src/delivery/index.ts`, `src/config.ts`, `src/client/index.js`,
`src/records.ts`, `src/resume/*` or `src/checkpoint/wiring.ts` — those are free.

`src/delivery/index.ts` was stable at 18:13:18 from 19:00 to 19:07, then **wrote again at 19:08:17**
(diff grew +125/−22 → +164/−22) and its spec at 19:09:41 (+251 → +383/−2). I re-verified the delivery
anchors after that write (§2 rows 3–5): `statusTail` `:396`, the partial branch `:403-408`,
`dedupeBilingual` `:436` and `humanConclusion` `:688` all held, because the new lines landed below
them. That is luck, not a guarantee — see §4.2.

---

## 2. Full open-item inventory — one row per open `P`

All 19 open entries, in `POOL.md` order. "Cited anchor" is what `POOL.md` says; "live anchor" is what
I measured at `HEAD` plus the dirty tree. `POOL.md` line ranges are inclusive.

| # | `POOL.md` | Item (abbrev.) | Cited anchor | Live anchor (measured) | Anchor status | Claim | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `:94-96` | `repairLimitOverruns` still clamps removed keys; announces `maxActiveRuns` cap 4 where the fixed value is 2 | `config.ts:612-636` | `LEGACY_LIMIT_CAPS` `config.ts:893-903`; `repairLimitOverruns` `:914-941`; legacy loop `:933-941` | **DEAD** (+302; file clean, so stale from the 2026-11-18 audit) | HOLDS | **W3** |
| 2 | `:97-98` | Six fail-closed branches have no test | `config.ts:654, :444, :462, :438, :680, :826` | `:656` throw (route key), `:681` throw (`switchOn`); `:444` = `*/`, `:462` / `:438` = doc text, `:826` = `* @param` | **4 of 6 DEAD**, 2 land one line short of a throw | HOLDS as a coverage gap; the count *six* is **NOT_RUN** (needs a mutation/coverage run) | **W3** |
| 3 | `:114-115` | The "bilingual" mirror repeats the same sentence under English labels | `answer.ts:111-114`, `delivery/index.ts:611` | `answer.ts:111-114` **exact** (the caller passing `bilingual: true` unconditionally); mirror itself `delivery/index.ts:688-710` (`humanConclusion`), early return `:695`, second pass `:696` | **MIXED** — one exact, one +77 (restructured by the uncommitted rewrite) | HOLDS | **RESERVED-A** |
| 4 | `:125-126` | A fallback partial that verified everything says `0 项没做成` and never mentions the degraded plan | `delivery/index.ts:387-392`, `script.ts:2160` | `statusTail` `delivery/index.ts:396-412`, partial branch `:403-408` (`unfinished = total - verified`); `planningFallback` `script.ts:2159`, used only at `:2161` to force `status !== 'completed'` | **DRIFTED** +16 / −1 | HOLDS — nothing carries `planningFallback` into delivery | **RESERVED-A** |
| 5 | `:127-128` | `dedupeBilingual` deletes a deliberately repeated sentence | `delivery/index.ts:429` | `dedupeBilingual` `:436-452` (`if (!kept.includes(half)) kept.push(half)`) | **DRIFTED** +7 | HOLDS | **RESERVED-A** |
| 6 | `:138-139` | `progress.notReported` is still right for a stage with no rows and no evidence; a "declared but not started" state needs `meta.phases` | none (implies `client/index.js`) | `client/index.js:3111` (source rows), `:2959` / `:2966` (tooltip) | no anchor given; live sites exist | HOLDS as a note — it is a dependency on item 9, not a defect | **W4** |
| 7 | `:143-147` | 团队档「实时回执」/取消终态/卸载通知 are no longer chat rows (`D-094`); text is in the terminal record, rendering is missing | `src/client/index.js` (prose) + evidence `.rsi/evidence/compact-fix/` | `TERMINAL_RECORD = 'plugin:grok-workflow/terminal'` at `records.ts:51`, schema at `:241`; evidence dir has 7 files (incl. `README.md`, `main-before.txt`, `main-after.txt`) | anchor is prose; the named evidence **exists** | HOLDS | **W4** |
| 8 | `:156-157` | Edge nodes (Start/End) print the same `Not reported in the events` copy although `run-start`/`run-end` arrived | `client/index.js:2669`, `:2673` | `edgeState` `client/index.js:2576-2582`; edge branch `:2601`; edges declared `:2185`, `:2191`; the copy `:2959`, `:2966`, `:3111` | **DEAD** (cited lines sit inside `progressJsonFields`) | HOLDS — `edgeState` computes a state, but `rows` is empty so every text surface falls back to `notReported` | **W4** |
| 9 | `:158-160` | `meta.phases` is dropped at `run-start`, so "declared, no rows yet" is indistinguishable from "never planned" | `records.ts:597` | `records.ts:616` — `append(target, PROGRESS_RUN_START, { runId: run.id, name: run.meta.name })`; the declared type at `:503` is `meta: { readonly name: string }` | **DEAD** (+19; file clean) | HOLDS — `grep -n phases src/records.ts` returns **no** match at all | **W4** |
| 10 | `:161-162` | Fixtures feed the panel a stream shape the recorder cannot produce (`phase: '执行'`) | `test/progress-tab.spec.ts:247`, `:54` | fixture rows `:244` (`member(2, '执行', …)`) and explicit `phase: '执行'` at `:541`, `:543`, `:565`, `:581`; `:54` is `label: \`执行 ${seq}\`` | **DRIFTED** −3 / `:54` points at the label template, not a phase | HOLDS | **W4** |
| 11 | `:185-187` | `recordableTimeoutMs`'s upper guard is vacuous (`msCeiling === MAX_SAFE_INTEGER`) | `wiring.ts:541-593` | guard `wiring.ts:541-546` (`<= CHECKPOINT_LIMITS.msCeiling`); `CHECKPOINT_LIMITS.msCeiling: Number.MAX_SAFE_INTEGER` at `schema.ts:114`; consumer `wiring.ts:592-593` | **EXACT** | HOLDS — the guard cannot fail | **W1** |
| 12 | `:188-189` | A caller-supplied `git` provider returning `head: ''` makes every write fail; provider untested | `wiring.ts:757`, `schema.ts:686` | `const git = options.git?.()` `wiring.ts:757` **exact**; refusal `schema.ts:691-693` (`validateHead`, `/^[0-9a-f]{7,64}$/`) | wiring **EXACT**; schema 7–8 short (the +8 uncommitted docblock) | HOLDS | **W1** |
| 13 | `:190-191` | Restore decisions drop `title`, `attempt`, `updatedAt` while claiming `retain` keeps the task as-is | `resume/policy.ts:137-145` | `preserve` ternary `resume/policy.ts:130-136` — only `outputs` / `files` / `evidence`; the `completed` reason at `:96-99` | **DEAD** (−7; file clean) | HOLDS | **W2** |
| 14 | `:192-193` | Integrity is verified over the validator's normalized rebuild, so changing `git.head`'s case after sealing still verifies | `writer.ts:160`, `schema.ts:812`, `:685` | `verifyCheckpointIntegrity(checkpoint)` `writer.ts:160` **exact**; digest over `canonicalJson(stripIntegrity(checkpoint))` `schema.ts:468-482`; `validateHead` lowercases at `:692` | writer **EXACT**; schema +8 both (matches the docblock shift) | HOLDS | **RESERVED-B** |
| 15 | `:194-195` | Five validator refusal branches are untested | `resume/validator.ts:231, :274, :290, :296, :308` | refusals are `return refuse(...)`, not throws — **27** such sites; cited lines map to `:232` (workflowId), `:275` (title), `:291` (evidence not array), `:297` (`evidence[j]` not object), `:309` (note not string) | **DRIFTED** +1…+6; the file has **no** `throw new` at all | HOLDS as a coverage gap; count **NOT_RUN** (no coverage run in scope) | **W2** |
| 16 | `:196-197` | `completed` is retained with no evidence, while a bare `success` is refused as a self-report | `resume/policy.ts:96-99` vs `:116-119` | `completed: { action: 'retain', … }` `:96-99` **exact**; `success: { action: 'replan', reason: 'a bare success mark is a self-report…' }` `:116-119` **exact** | **EXACT** | HOLDS | **W2** |
| 17 | `:210-211` | Both README "Models per role" examples are patches the loader refuses: `synthesis: deterministic` and the removed `switchOn` key | EN ~176-177, zh ~169-170 | EN `README.md:166-177` now shows `synthesis: layered` and carries **no** `switchOn`; zh `README.zh-CN.md:169` likewise | anchors land on the right region | **SUPERSEDED** — `grep -n "synthesis: deterministic" README.md README.zh-CN.md` returns nothing | **STALE** |
| 18 | `:212-214` | README validation bullet still says "more than three routes" and "an unknown `switchOn` class" | EN ~183, zh ~176 | `README.md:182` says "more than 50 routes" and lists `synthesis: model` without a synthesizer — no `switchOn` class claim; zh `README.zh-CN.md:175` says "超过 50 条路由" | anchors land on the right region | **SUPERSEDED** — `grep -n "more than three routes"` returns nothing | **STALE** |
| 19 | `:215-216` | `docs/knowledge/DESIGN-progress-tab.md` §4 documents the old delivery-template spine and §12 never records the Execute/Verify gap | doc prose | §4 at `:45-61` does describe the early spine, but **§4.1** `:63-82` is an explicit "实现回填：两条绑定通道（RSI round 9）" naming `PROGRESS_STAGES` and the role-label channel; **§12 item 6** `:211-214` records the Execute/Verify gap and its closure | anchors land on the right region | **SUPERSEDED** — the second half is false; the first is corrected in place by §4.1 | **STALE** (cosmetic §4 header note only) |

**Coverage check:** `grep -c "^- P ·" .rsi/POOL.md` = 19; this table has 19 rows; every open entry
appears exactly once.

### 2.1 Why anchors drifted — three separate causes, not one

The task context says "concurrent edits kept shifting anchors". That is only one of three causes, and
conflating them would mis-rank the work:

1. **Uncommitted rewrite of `src/delivery/index.ts`** (+125/−22 when §2 was measured; +164/−22 by
   19:10 as the worker kept writing). Insertions are non-uniform, so the
   offset is not constant: `:387-392 → :403-408` (+16), `:429 → :436` (+7), `:611 → :688-710`
   (+77, because `clampHumanBlock`/`pairCaps` were added as new functions). Rows 3–5.
2. **Uncommitted docblock in `src/checkpoint/schema.ts`** (+9/−1, net +8, at `:55-63` — the
   round-31/40 `maxBytes` comment). Every anchor after line 58 shifts **exactly +8**: `:685 → :693`,
   `:812 → :820`. Rows 12 and 14. This is mechanical and predictable.
3. **Anchors that were already stale when `POOL.md` was written.** `POOL.md` (15:45:09) postdates the
   last change to `src/config.ts` (15:39:07), `src/records.ts` and `src/resume/policy.ts` — all three
   are clean in `git status` — yet their anchors point 7 to 302 lines away from the code they name.
   Rows 1, 2, 9, 13 (and 8, 10 in `src/client/index.js` / the spec). These are carried from the
   2026-11-18 audit and were never re-measured.

Cause 3 matters most for planning: it will **not** be fixed by waiting for the concurrent writers, and
four themes would otherwise be planned against line numbers that never existed in this file.

---

## 3. Carried prior opens vs newly pooled items

The acceptance criteria ask for this split explicitly, and it is not the same axis as §2.

### 3.1 Prior-carried opens (from round 39; **not** all POOL items)

| Prior open | On-disk evidence at 19:07 | State | Effect on this triage |
| --- | --- | --- | --- |
| delivery edge / **bilingual truncation** | `.rsi/evidence/delivery-bilingual-edge.md` (mtime **18:22:55**, moved again after round 39's 18:16 read); `src/delivery/index.ts` +164/−22 and `test/delivery-human-block.spec.ts` +383/−2, both rewritten **during this run** (19:08:17 / 19:09:41); `lib/delivery/*` rebuilt, `CHANGELOG.md` +15 | **open, unlanded, and still moving** | holds `src/delivery/index.ts` + `test/delivery-human-block.spec.ts` + `CHANGELOG.md` + `lib/delivery/*` → **RESERVED-A**; rows 3, 4, 5 |
| **harness verify** | `.rsi/evidence/harness/verify-round39.md`, `-live.txt`, `-armed-row-refresh.txt`, `verify-row-endstate-round39{,-attempt2}.txt` (18:16:03) | carried, **read-only** — a harness `--verify-row` run, no code file | not a code theme; touches no path in any scope below |
| **heartbeat re-arm** | `.rsi/evidence/heartbeat-rearm/07-handoff-one-call.md` (13:46:18) | carried; blocked on one `schedule_edit` an operator must issue | not a code theme |
| `compact_fix` / `auto_iter` | landed earlier (`HEAD` chain `65cab43 → 91d4361 → 366d169`) | closed | not re-opened here |

### 3.2 Newly pooled items: **none**

No item was added to `POOL.md` in round 39 or 40. Evidence: `POOL.md` is byte-identical to `HEAD`
(`git diff --stat HEAD -- .rsi/POOL.md` is empty), its mtime is `15:45:09` — before round 39's first
triage file (16:10:30) — and its last touching commit is `e80ed6d` (the 0.12.13 release record).
All 19 rows in §2 are **pre-existing backlog**; rounds 39–40 only changed where they point.

Consequently the "prior vs new" split cannot be drawn *within* the 19 rows. What the split does change
is the frontier: of the four carried opens, exactly one (delivery/bilingual) removes files, and it
removes the three rows that sit in `src/delivery/index.ts`.

---

## 4. Proposed themes — file-disjoint

Ranking criterion is scope isolation first: how much of each edit set sits in files no other worker
holds. A value column follows so the integrator can trade isolation against payoff.

| # | Theme | `POOL.md` rows | Files written | Isolation | Why it is worth doing | Test scope | Size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **W1** | Checkpoint wiring guards | 11, 12 (`:185-189`) | `src/checkpoint/wiring.ts`; `test/checkpoint-wiring.spec.ts` | **highest** — 1 clean src + 1 clean spec; the only outward need is `CHECKPOINT_LIMITS.msCeiling` / `validateHead`, **read-only** | a config-legal `timeoutMs` near `MAX_SAFE_INTEGER` makes every checkpoint write `invalid`, i.e. such a run can never be resumed | 2 files | S/M |
| **W2** | Resume restore decisions | 13, 15, 16 (`:190-197`) | `src/resume/policy.ts`; `test/resume-validator.spec.ts` | **high** — 1 clean src + 1 clean spec; no bundle, no i18n, no `lib/` rebuild | the `retain` promise and the actual `preserve` disagree, and `completed` is kept while a bare `success` is refused | 2 files | S |
| **W3** | Config legacy repair | 1, 2 (`:94-98`) | `src/config.ts`; `test/config.spec.ts`; **new** `test/config-limits-repair.spec.ts` | **high, with one exclusion** — must **not** touch `test/config-chain-types.spec.ts` (untracked, created 18:14:42 by the round-39 config worker) | dead path that also prints a wrong cap (`maxActiveRuns` says 4, `FIXED_MAX_ACTIVE_RUNS` is 2) | 3 files | S |
| **W4** | The panel tells the truth about both ends and about declared-not-started | 6, 7, 8, 9, 10 (`:138-162`) | `src/client/index.js`; `src/records.ts`; `lib/client.js` (**rebuild output**); `test/client.spec.ts`; `test/progress.spec.ts`; `test/progress-tab.spec.ts` | **medium** — 2 clean src, but one is a served bundle that must stay byte-identical to its build, and item 9 needs a record-type decision | five user-visible defects at once; the fixtures that hid them are part of the fix | 6 files + rebuild | M |

### 4.1 Disjointness check

| Path | W1 | W2 | W3 | W4 | RESERVED-A | RESERVED-B |
| --- | --- | --- | --- | --- | --- | --- |
| `src/checkpoint/wiring.ts` | **edit** | | | | | |
| `src/checkpoint/schema.ts` | read | | | | | **edit** |
| `src/checkpoint/writer.ts` | | | | | | **edit** |
| `src/resume/policy.ts` | | **edit** | | | | |
| `src/resume/validator.ts` | | read | | | | |
| `src/config.ts` | | | **edit** | | | |
| `src/client/index.js` | | | | **edit** | | |
| `src/records.ts` | | | | **edit** | | |
| `src/delivery/index.ts` | | | | | **edit** | |
| `test/checkpoint-wiring.spec.ts` | **edit** | | | | | |
| `test/checkpoint-schema.spec.ts` | | | | | | **edit** |
| `test/resume-validator.spec.ts` | | **edit** | | | | |
| `test/config.spec.ts` | | | **edit** | | | |
| `test/client.spec.ts` / `progress.spec.ts` / `progress-tab.spec.ts` | | | | **edit** | | |
| `test/delivery-human-block.spec.ts` | | | | | **edit** | |
| `lib/client.js` | | | | **rebuild** | | |
| `lib/delivery/*` | | | | | **rebuild** | |

No path is written by two themes. Two read-only crossings are deliberate and safe: W1 reads
`schema.ts` (`msCeiling`, `validateHead`) without writing it, and W2 reads `validator.ts` without
writing it (its refusals are the *subjects* of new tests, not edits).

### 4.2 Reserved paths and why

**RESERVED-A — delivery (rows 3, 4, 5).** `src/delivery/index.ts` is +164/−22 and unlanded;
`test/delivery-human-block.spec.ts` is +383/−2; `CHANGELOG.md` and `lib/delivery/*` carry the same
change. Both source files were rewritten **while this report was being written** (19:08:17 and
19:09:41, after the 18:13:18 state all of §2 was measured against), and the evidence file moved too
(18:22:55). My anchors survived this write by luck — the new lines landed below them — which is
exactly why a parallel worker must not enter here: the next write may not be so kind, and rows 3–5
already carry non-uniform offsets. **Unblocks when** the round-39 delivery worker commits.

**RESERVED-B — checkpoint integrity normalization (row 14).** `src/checkpoint/schema.ts` is dirty
(+9/−1: the 8-line docblock at `:55-63`) and a live round-40 worker claims that docblock plus
`test/checkpoint-bound.spec.ts` (`.rsi/evidence/checkpoint-round40.md:3-5`); it rebuilt
`lib/checkpoint/schema.*` at **19:15:06**, after my snapshot, so it is landing right now. The fix for
row 14 (`validateHead` lowercases at `:692`, and the digest is taken over the normalized rebuild at
`:468-482`) lands in the same file. **Unblocks when** `schema.ts` is committed.

**STALE — docs (rows 17, 18, 19).** Already correct in the tree. Recommended follow-up is a
`POOL.md` edit marking them `DONE`/`STALE` with the measurements above; I did not make it, because
this task's constraints forbid editing `POOL.md`.

### 4.3 Suggested execution order

W1 and W2 are independent, single-file-src, and touch nothing dirty — start both together. W3 can run
beside them provided its worker is told to stay out of `test/config-chain-types.spec.ts`. W4 is the
largest and the only one needing a bundle rebuild, so it should start last and alone. RESERVED-A and
RESERVED-B enter the frontier only after their current owners commit.

---

## 5. What this report did and did not establish

**Established by measurement in this run:** the snapshot identity and the 19-row count (§1); every
live anchor in §2 (each read with `sed`/`grep` at the line named); the three drift causes, including
the exact +8 shift in `schema.ts` and the non-uniform offsets in `delivery/index.ts` (§2.1); the
absence of any newly pooled item (§3.2); the read-only nature of the harness/heartbeat carried opens
(§3.1); the file-disjointness matrix (§4.1).

**Not established — `NOT_RUN`:**

- Whether the counts *six* (row 2) and *five* (row 15) are accurate. Both are coverage claims that
  need a mutation or coverage run; the task forbids running the suite. I re-anchored the branches and
  left the counts as they were.
- Whether the dirty `src/delivery/index.ts` and `src/checkpoint/schema.ts` are correct. I read them
  only as anchor targets, never reviewed the concurrent workers' in-flight edits.
- Any behavioural effect of the proposed fixes. No test was run, no build was made.
- Whether `POOL.md`'s `H` (hypothesis) markers on rows 5 and 16 should be promoted. I confirmed the
  *code shape* each row describes; the *intent* question ("is dropping the repeated sentence wrong?")
  is a product decision, not something a read can settle.
