# Round 39 triage — POOL split into file-disjoint parallel themes

Read-only triage. This file is the only thing this task wrote; no source, `POOL.md`, `STATE.md`,
`CHANGELOG.md` or `lib/` byte was touched by it.

**The working tree is not quiet.** The triage started on a tree whose only extra paths were four
`.rsi/evidence/*` files; by the end of the run two *other* workers had in-flight changes in the
tree: `src/checkpoint/schema.ts`, `src/delivery/index.ts`, `test/delivery-human-block.spec.ts`
(modified) and `test/checkpoint-bound.spec.ts`, `.rsi/evidence/checkpoint-comment-fix.md`,
`.rsi/evidence/baseline-round39.md` (new). Those are the dedicated checkpoint-comment and
delivery-bilingual tasks, not this one — which is exactly the evidence the candidate list is built
around: the reserved areas were live at the same time and are excluded here.

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, HEAD `366d169`
  (`docs(rsi): compact fix — npm run ci output at 91d4361`), tree synced with `origin/main`.
- Package version at HEAD: `0.12.13` (`package.json:3`).
- Status vocabulary: `CONFIRMED` = read in source or measured by a command in this run;
  `HYPOTHESIS` = plausible, unmeasured; `NOT_RUN` = deliberately not executed.

## 1. Inputs read

| Source | What was taken from it |
| --- | --- |
| `.rsi/POOL.md` (232 lines) | the open backlog; every `P ·` entry below is cited by line |
| `.rsi/ledger.jsonl` (34 rows) | landed rounds; row 38 = `non-string model/provider refused…` |
| `.rsi/ROUND.md` (1187 lines) | round record for 38 (`:1174-1187`), reporting conventions (`:1-11`) |
| `.rsi/STATE.md` (111 lines) | HEAD state, open-item list (`:97-102`), standing `NOT_RUN` (`:110-111`) |
| `src/`, `test/`, `docs/`, `README*.md` | anchor verification (line numbers below are at HEAD `366d169`) |

## 2. Round-038 is landed — excluded from every candidate list

`POOL.md:90-93` marks it `R38 DONE`; `.rsi/ROUND.md:1174-1187` records the change
(`resolveChain` type check, `test/config.spec.ts` +1 case, `69 files / 1263 tests` PASS);
`.rsi/ledger.jsonl` row `round: 38` carries `status: OK`. The two remaining `src/config.ts`
items ([C1] and the coverage entry) are *different* defects in the same file and are not round 38.
`src/config.ts:705-760` is the landed round-38 code; no candidate below re-opens it.

## 3. Open `P` inventory (every open entry, with its live anchor)

`STALE` = the tree no longer shows the defect; `RESERVED` = out of scope for this triage by the
task's own carve-out (`src/checkpoint/schema.ts`, `src/delivery/index.ts`, checkpoint-comment,
delivery-bilingual).

| POOL lines | Item (short) | Live anchor at HEAD | Verdict |
| --- | --- | --- | --- |
| 94-96 | `repairLimitOverruns` clamps seven removed keys and announces a wrong cap | `src/config.ts:893-904` (`LEGACY_LIMIT_CAPS`), `:910-912` (`legacyRecordOverrun`), `:933-944` (legacy loop), `:420-423` (warning text), `:26` vs `:254`; caller `src/index.ts:99` | OPEN → **[C1]**; POOL's `:612-636` has drifted |
| 97-98 | six fail-closed branches untested (`config.ts:654`, `:444`, `:462`, `:438`, `:680`, `:826`) | cited lines 438/444/462/826 are now comments; live throws at `:599, :606, :645, :656, :681, :705-760` | OPEN, anchors stale; coverage-only |
| 114-115 | "bilingual" mirror repeats one sentence under English labels | `src/answer.ts:111-114`, `src/delivery/index.ts:611` | RESERVED (delivery-bilingual) |
| 120-121 | duplicate `Synthesis: <mode>` label | `src/delivery/index.ts` route line | RESERVED (`src/delivery/index.ts`) |
| 125-126 | fallback partial says `0 项没做成`, never names the degraded plan | `src/delivery/index.ts:387-392`, `src/script.ts:2160` | RESERVED (`src/delivery/index.ts`) |
| 127-128 | `dedupeBilingual` deletes a deliberately repeated sentence | `src/delivery/index.ts:429` | RESERVED (delivery + bilingual) |
| 138-139 | `progress.notReported` cannot distinguish "declared, no rows" | `src/progress-tab.ts`, `src/client/index.js` | OPEN; collides with [C4] on `src/client/index.js` |
| 143-147 | terminal/回执 texts exist as records but have no panel rendering | `src/client/index.js`, `src/records.ts` | OPEN; collides with [C4]; M/medium |
| 156-157 | Edge nodes print "not reported" although `run-start`/`run-end` arrived | `src/client/index.js:2185-2191`, `:2576-2582`, `:2618`, `:2953-2967`, `:3111`, `:301`/`:503` (copy) | OPEN → **[C4]**; POOL's `:2669/:2673` has drifted |
| 158-160 | `meta.phases` dropped at `run-start` | `src/records.ts:503` (signature), `:612-616` (append) | OPEN; POOL's `:597` has drifted |
| 161-162 | fixtures feed a stream shape the recorder cannot produce | `test/progress-tab.spec.ts:247`, `:54` | OPEN, unselected (test-shape work) |
| 185-187 | `recordableTimeoutMs` upper guard is vacuous | `src/checkpoint/wiring.ts:541-549`, `:591-593`, `:745`; `src/checkpoint/schema.ts:114` | OPEN → **[C2]** |
| 188-189 | a `git` provider returning `head: ''` fails every write | `src/checkpoint/wiring.ts:757` region | OPEN; same file as [C2] |
| 190-191 | restore decisions drop `title`, `attempt`, `updatedAt` while claiming `retain` | `src/resume/policy.ts:62-71`, `:137-145` | OPEN → **[C3]** |
| 192-193 | integrity verified over the normalized rebuild (`git.head` case) | `src/checkpoint/writer.ts:160`, `src/checkpoint/schema.ts:812`, `:685` | RESERVED (`src/checkpoint/schema.ts`) |
| 194-195 | five validator refusal branches untested | `src/resume/validator.ts:274`, `:277`, `:280` + two more | OPEN; shares `test/resume-validator.spec.ts` with [C3] |
| 196-197 | `completed` retained with no evidence vs bare `success` refused | `src/resume/policy.ts:96-99` vs `:116-119` | OPEN; same file as [C3]; intent is `H` |
| 210-211 | README "Models per role" example is a patch the loader refuses (`synthesis: deterministic`) | `README.md:176`, `README.zh-CN.md:169` now say `synthesis: layered` | **STALE** |
| 212-214 | README validation bullet says "more than three routes" / unknown `switchOn` class | `README.md:182`, `README.zh-CN.md:175` say "more than 50 routes"; `switchOn` appears only in the fixed-key list (`README.md:247`, `README.zh-CN.md:237`) | **STALE** |
| 215-216 | `DESIGN-progress-tab.md` §4 old spine, §12 never records the Execute/Verify gap | `:63` (§4.1 backfill, round 9) and `:211` (§12 item 6 records exactly that gap) | **STALE** |

Also `STALE` already in POOL itself and not re-litigated here: `:15-17`, `:18-19`, `:103`, `:173-175`.

## 4. Ranked file-disjoint candidates

Ranked by user value first, cost second. Each candidate owns a **disjoint file set**; none touches
`src/checkpoint/schema.ts` or `src/delivery/index.ts`.

| # | POOL | File anchor | Rationale | Estimate | Scoped test file |
| --- | --- | --- | --- | --- | --- |
| 1 | `POOL.md:185-187` | `src/checkpoint/wiring.ts:541-549` (+`:530-540` comment, `:591-593`, `:745`); bound at `src/checkpoint/schema.ts:114` — read only, not edited | A **config-legal** `timeoutMs` up to `Number.MAX_SAFE_INTEGER` (`src/config.ts:486`) passes the guard, so `deadlineAtMs = startedAtMs + timeoutMs` overflows and `buildCheckpoint` refuses with `time.deadlineAtMs must be a safe integer` — every snapshot of such a run is unwritable. The recorder is on the production path (`src/run.ts:773`). | S/M — 8-12 lines + comment; risk medium (the omit-never-clamp policy at `:530-540` must survive) | `test/checkpoint-wiring.spec.ts` |
| 2 | `POOL.md:94-96` | `src/config.ts:893-904`, `:910-912`, `:933-944`, `:420-423`, `:26`/`:254`; caller `src/index.ts:99` | Measured: `repairLimitOverruns({maxActiveRuns: 10})` emits `maxActiveRuns is 10, over the hard maximum 4: it now takes effect as 4 (repaired) … 请在设置页确认`, while the plugin's fixed value is `FIXED_MAX_ACTIVE_RUNS = 2` and the key is absent from the settings page; and the repaired document still fails `resolveConfig` (`unknown configuration key "maxActiveRuns"`), so `src/index.ts:100-102` can never announce it. A dead branch with a false sentence. | S — ~35-40 lines deleted (or the cap re-pointed to `FIXED_*`); risk low; one decision: delete vs re-point | `test/config-limits-repair.spec.ts` |
| 3 | `POOL.md:156-157` | `src/client/index.js:2576-2582` (`edgeState`), `:2618` (node push), `:2953-2967` (tip/meta), `:3111` (detail source line), copy at `:301`/`:503` | Edge nodes compute their state from `run-start`/`run-end`, then report `progress.notReported` in both the tooltip, the meta line and the detail panel, because their `members`/`evidence` lists are empty by construction. The two nodes whose facts are known are the two that claim nothing was reported. | M — 30-45 "lines" including two dict entries; risk medium (i18n parity guard; client bundle must be rebuilt) | `test/client.spec.ts` (parity also enforced by `test/i18n-parity.spec.ts`) |
| 4 | `POOL.md:190-191` | `src/resume/policy.ts:62-71` (decision type), `:137-145` (literal) | `retain` promises "the task as-is" in its own reason string (`:98`) while the decision carries only `id/seq/status/action/retained/preserve/reason`; `title`, `attempt`, `updatedAt` (declared at `src/resume/validator.ts:72-77` and preserved by the validator at `:322-324`) are dropped, so a restored task loses the journaled title and attempt count. | S — ~10-14 lines; risk low, but latent: no production importer (only `test/recovery-*.spec.ts`, `test/resume-validator.spec.ts` import `src/resume/`) | `test/resume-validator.spec.ts` |

### Per-candidate plan

**[C1] Wiring: the timeout guard cannot bite.** Verify first, then fix: write a failing case that
records a run with `timeoutMs = Number.MAX_SAFE_INTEGER - 10` and asserts either an omitted deadline
or a write that lands; today it throws/refuses on every snapshot (measured half: `buildCheckpoint`
refuses `deadlineAtMs` overflow, §5). Fix: bound by representability (`Number.isSafeInteger(startedAtMs
+ timeoutMs)`) or by `msCeiling - startedAtMs`, keep "omit, never clamp", update the B07 comment, and
cover both sides (largest accepted, one over). Do **not** edit `src/checkpoint/schema.ts`.

Two live caveats for the worker who takes this theme: (a) the `msCeiling` citation
(`src/checkpoint/schema.ts:114`) is *read-only* context and will shift by roughly +8 lines once the
concurrent checkpoint-comment change lands (their diff rewrites the `maxBytes` comment block only;
`msCeiling` itself is untouched) — re-read the constant, do not trust the line number; (b) the name
`test/checkpoint-bound.spec.ts` is already taken by that concurrent worker, so this theme's case
belongs in `test/checkpoint-wiring.spec.ts` and nowhere else.

**[C2] `repairLimitOverruns` legacy branch.** Reproduce with one case : `repairLimitOverruns({maxActiveRuns:
10})` returns a warning naming cap 4 while `FIXED_MAX_ACTIVE_RUNS === 2` and the repaired document is
still refused — then either delete `LEGACY_LIMIT_CAPS`/`legacyRecordOverrun`/the legacy loop, or clamp
to the fixed values and drop the "please confirm on the settings page" clause for keys the page cannot
show. `test/config-limits-repair.spec.ts:202` (REMOVED_CONFIG_KEYS → no warnings for value `1`) must
stay green either way.

**[C3] Edge-node copy.** Give the two edge nodes their own copy (run started at seq N / ended with
`stopReason`), used by tip, meta line and detail source line; add the key to **both** dictionaries
(`DICT` zh near `:301`, en near `:503`) so `test/i18n-parity.spec.ts`'s symmetry check passes; rebuild
the client bundle. Keep the change client-side (`src/client/index.js`) — carrying the fact through
`src/progress-tab.ts:673` would pull `test/progress-tab.spec.ts` in and weaken disjointness.

**[C4] Resume policy fields.** Add `title?`, `attempt?`, `updatedAt?` to `TaskRestoreDecision` and copy
them in the literal; test that a retained task keeps all three and that a `replan` task keeps them too
(the decision describes the task, not what is preserved). No `src/checkpoint/*` edit.

## 5. Disjointness matrix

`●` = file written by that theme, `○` = file read but not written, `—` = untouched.

| File | [C1] wiring | [C2] config repair | [C3] edge copy | [C4] resume policy | Reserved for other tasks |
| --- | --- | --- | --- | --- | --- |
| `src/checkpoint/wiring.ts` | ● | — | — | — | — |
| `test/checkpoint-wiring.spec.ts` | ● | — | — | — | — |
| `src/config.ts` | — | ● | — | — | — |
| `test/config-limits-repair.spec.ts` | — | ● | — | — | — |
| `src/client/index.js` | — | — | ● | — | — |
| `test/client.spec.ts` | — | — | ● | — | — |
| `src/resume/policy.ts` | — | — | — | ● | — |
| `test/resume-validator.spec.ts` | — | — | — | ● | — |
| `lib/**` (rebuilt artifacts) | — | — | ● (client bundle) | — | — |
| `test/i18n-parity.spec.ts` | — | — | ○ (guard runs, not edited) | — | — |
| `src/checkpoint/schema.ts` | ○ (bound read only) | — | — | — | **checkpoint-comment task** |
| `src/delivery/index.ts` | — | — | — | — | **delivery-bilingual task** |
| `CHANGELOG.md`, `POOL.md`, `STATE.md` | — | — | — | — | integration step only |

Pairwise: C1∩C2 = ∅, C1∩C3 = ∅, C1∩C4 = ∅, C2∩C3 = ∅, C2∩C4 = ∅, C3∩C4 = ∅. Every set is also
disjoint from `src/checkpoint/schema.ts` and `src/delivery/index.ts`.

### Unselected open items and why (collision map)

- `POOL.md:188-189` (git provider `head: ''`) — same file as [C1] → run after, not beside.
- `POOL.md:196-197`, `:194-195` — same files as [C4] (`policy.ts`, `test/resume-validator.spec.ts`).
- `POOL.md:97-98` (six untested branches) — same file as [C2], and its anchors are stale; needs re-anchoring first.
- `POOL.md:138-139`, `:143-147`, `:161-162` — `src/client/index.js` / `progress-tab.ts` / `test/progress-tab.spec.ts` collide with [C3].
- `POOL.md:158-160` — `src/records.ts` is free, but the fix needs a typed session-event decision first (`H` that the extra key is safe); good round-40 candidate once that is settled.
- `POOL.md:114-128`, `:192-193` — reserved (`src/delivery/index.ts`, `src/checkpoint/schema.ts`).

**A 5th concurrent worker would have no clean file set.** Three or four is the real ceiling for this
backlog snapshot; the four above are the whole file-disjoint frontier except `src/records.ts`.

## 6. Measurements run in this task (commands and what they show)

All run from the repo root at HEAD `366d169`; `lib/` is the committed build of this `src/`.

1. `node --input-type=module -e "import {repairLimitOverruns, HARD_LIMITS, FIXED_MAX_ACTIVE_RUNS} from './lib/config.js'; …"`
   → `maxActiveRuns is 10, over the hard maximum 4: it now takes effect as 4 (repaired). 已按 4 生效（原值 10 超过上限 4），请在设置页确认`;
   `HARD_LIMITS.maxActiveRuns: 4`, `FIXED: 2` → **CONFIRMED** [C2]'s false sentence.
2. Same harness, `resolveConfig({maxActiveRuns: 4})` → `unknown configuration key "maxActiveRuns"` — **CONFIRMED** the key is a removed key the reader refuses.
3. `repairLimitOverruns({maxActiveRuns: 10})` then `resolveConfig(repaired)` → `unknown configuration key "maxActiveRuns"` — **CONFIRMED** the repair cannot save the row, so `src/index.ts:100-102` never announces it (the branch is dead on the load path).
4. `CHECKPOINT_LIMITS.msCeiling === Number.MAX_SAFE_INTEGER` → `true` (9007199254740991) — **CONFIRMED** [C1]'s guard is vacuous against the config's own ceiling (`src/config.ts:486` allows the same `MAX_SAFE_INTEGER`).
5. `buildCheckpoint({… time: { deadlineAtMs: Number.MAX_SAFE_INTEGER + 2 } …})` → refused, `checkpoint time.deadlineAtMs must be a safe integer` — **CONFIRMED** the second half: a recorded overflowing deadline makes the write refuse.
6. Anchor reads: `sed -n`/`grep -n` over `src/config.ts`, `src/checkpoint/wiring.ts`, `src/resume/policy.ts`,
   `src/resume/validator.ts`, `src/client/index.js`, `src/records.ts`, `README.md`, `README.zh-CN.md`,
   `docs/knowledge/DESIGN-progress-tab.md` — the line numbers in §3 are those reads (**CONFIRMED**).
7. `grep -rn "from '../src/resume" src/ test/` → only `test/recovery-kill-restart.spec.ts`,
   `test/recovery-artifacts.spec.ts`, `test/resume-validator.spec.ts` — **CONFIRMED** [C4] has no
   production importer today (it is latent value, which is why it ranks last).

## 7. POOL corrections this triage found (for whoever owns `POOL.md`)

- `:210-216` — the three README/DESIGN entries are stale (evidence in §3). They should be marked
  `STALE (round 39 triage)` rather than carried as open work.
- `:94-96`, `:97-98`, `:156-157`, `:158-160` — anchors have drifted; the defect persists in all four,
  the cited line numbers do not. Re-anchoring is cheap but must happen before a worker trusts them.
- **New, not in POOL:** `README.md:360` advertises "1154 deterministic tests across 63 files"; the last
  recorded full run (`.rsi/ledger.jsonl` round 38, `.rsi/ROUND.md:1174-1187`) is `69 files / 1263 tests`,
  and no guard compares the README count with the suite. `HYPOTHESIS` that a docs-only worker could pin
  it (would need a real run to re-derive the count — `NOT_RUN` here).

## 8. Not done in this task (`NOT_RUN`)

- No `npm run ci`, no `npm test`, no build: this task changed no code, and never claims a green suite.
  The suite numbers quoted above are read from the ledger/round record, not re-measured here.
- No fix attempted for any candidate — the four themes are proposals, not landed work.
- No GUI/real-device check of the progress panel ([C3]); the copy defect is source-read only.
- `POOL.md`, `STATE.md`, `CHANGELOG.md`, `src/`, `lib/` left untouched by design; §7's corrections are
  recommendations for the integration step, not edits made here.

## 9. Files written by this task

- `.rsi/evidence/triage-round39.md` (this file) — the only write.

Every other path that appears in `git status --short` at the end of the run belongs to a concurrent
worker (`src/checkpoint/schema.ts`, `src/delivery/index.ts`, `test/delivery-human-block.spec.ts`,
`test/checkpoint-bound.spec.ts`, `.rsi/evidence/checkpoint-comment-fix.md`,
`.rsi/evidence/baseline-round39.md`) or pre-dated this task (`.rsi/evidence/heartbeat-rearm/*`,
`.rsi/evidence/runtime-audit-2026-11-20.md`). None of them was touched here.
