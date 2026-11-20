# RSI round-39 verify A1 — delivery change set (read-only)

Env: repo `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, HEAD `bffd0b4` (v0.12.14). All commands run via bash in that cwd unless noted. Labels per AGENTS.md.

## 1. src/delivery/index.ts — symbols present (CONFIRMED)

Command: `git diff HEAD -- src/delivery/index.ts` (worktree, dirty) → 259-line diff, all hunks inside `src/delivery/index.ts`; plus `grep -n` on worktree file. Result: every requested symbol found at:

- `cutCodeUnits` — def `src/delivery/index.ts:184` (`function cutCodeUnits(text, max)`); used by `oneLine` (:195), `clampHumanBlock` (:635, :638, :643). Docblock states it is the human-block cut entry and never splits an astral character.
- `composeHumanParts` — def `:532` (returns `{ block, tail }`); replaces old `composeHuman`. Called by `humanConclusion` (:695, :698).
- `clampHumanBlock` — def `:630` (`(block, tail, cap)`); body reserves tail first (`keepTail`, :634), shrinks head (`headKeep`, :638), cuts middle at line break (`lastIndexOf('\n')`, :642) with `…` marker. Called `:696`, `:699`, `:709-710`.
- `pairCaps` — `export function pairCaps` at `:667` (CONFIRMED exported). Sole caller `humanConclusion` `:708`. Docblock notes it is exported to pin the arithmetic.
- `ROUTE_ROLES` — `:715` (`['planner','worker','verifier','supervisor','synthesizer']`).
- `gotType` — def `:723` (names `null`/`array` besides `typeof`).
- `routeChains` — def `:749` (`(routing: unknown)`); throws `roles must be a record…`, `roles.<role> must be an array…`, `roles.<role>[<i>] must be a "provider/model" string…` (:751, :759, :763).
- `machineLedger` uses `routeChains` — `export function machineLedger` at `:804`; call `const configured = routeChains(report.routing)` at `:857`, replacing the old inline role list. Same line builds `Model routes:` from the checked pairs (:858).
- `deliverReport` try/catch drops ledger not answer — `export function deliverReport` at `:901`; `human` at `:905`, guarded ledger at `:910-917` (`try { ledger = machineLedger(report) } catch { ledger = undefined }`), `const text = ledger === undefined ? human : …` at `:918`, return omits `ledger` key when undefined (`:922`). So on a refused chain `text === human` (CONFIRMED by code read).
- Red comparison (CONFIRMED): detached worktree `git worktree add --detach /tmp/rsi39-A1 bffd0b4` → `grep -c pairCaps /tmp/rsi39-A1/src/delivery/index.ts` = 0 (absent at HEAD); old routing at HEAD `:713-714` (`.map(role => [role, report.routing[role]])` + bare `chain.join`); old `deliverReport` at HEAD `:761-763` (`const ledger = diagnostics ? machineLedger(report) : undefined`, no try/catch). Worktree removed afterwards (`git worktree remove --force /tmp/rsi39-A1`, exit 0).

Single-theme (CONFIRMED): the src diff touches only the human-block clamp path + route-chain refusal + ledger guard; no other `src/` file is modified (`git diff HEAD --stat` shows only `src/delivery/index.ts` under `src/`).

## 2. test/delivery-human-block.spec.ts — additions only (CONFIRMED)

- Strict `it(` (line-start): `git show HEAD:test/delivery-human-block.spec.ts | grep -cE "^[[:space:]]*it\("` → **13**; `grep -cE "^[[:space:]]*it\(" test/delivery-human-block.spec.ts` → **39**; added `git diff HEAD -- … | grep -cE "^\+\s*it\("` → **26**. (CONFIRMED)
- Loose substring `it(`: HEAD **15** vs worktree **46**; the +5 gap over strict is false positives (`text.split(`, `human.split(`, etc. at lines 137,180,452,517,526,534,715 — CONFIRMED by inspection).
- `grep -n "\.skip\|\.only\|\.todo" test/delivery-human-block.spec.ts` → no match (CONFIRMED, none).
- Deleted/weakened asserts: `git diff HEAD -- test/delivery-human-block.spec.ts | grep "^-[^-]"` returns exactly **2** lines, both import lines (`-import { deliverReport, humanConclusion, machineLedger }…`, `-import type { WorkflowReport }…`); every other diff line is `+` additions plus those two import-line replacements (which widen the import to `pairCaps` and `RoleName`). No `expect(` deletion. (CONFIRMED)
- The 3 groups (pins / pairCaps-direct / guards), counts from `spec.json`+`state-draft.md` reconciled against `red-at-bffd0b4.txt` (34 tests = 39 minus 5 pairCaps-direct removed for the red run; 14 failed / 20 passed; 20 = 13 pre-existing + 7 guards):
  - **pins: 14** — behavior tests that fail on the pre-change module (13 in the first red capture, +1 when the `deliverReport`-drops-ledger case was added; the red evidence file records 14 failed).
  - **pairCaps direct: 5** — `describe('round 37: the pair budget is split…')` at spec `:462` (5 its: 2399/2399 split, 4801-window, fits-unchanged, slack handoff, non-negative).
  - **regression guards: 7** — pass on old and new (under-cap byte-equality `:559` 2 its, single-pass-cap charges `:449` 1 it, well-formed/inherit `:665` 1 it, human-readable-on-bad-chain `:670` 1 it, 2400-clamp short-block `:284` 1 it, bilingual short `:292` 1 it). 14+5+7=26. (CONFIRMED arithmetic; grouping HYPOTHESIS-free per spec authorship — labels come from round-39 `spec.json`/`state-draft.md`.)

## 3. POOL.md + preserved bytes (CONFIRMED)

- `git diff HEAD -- .rsi/POOL.md` → +27 lines: one `R39 DONE` entry (pair-budget/`cutCodeUnits`/routeChains/ledger-guard, "Red 13 failed / 20 passed… green 38 passed", evidence `.rsi/evidence/round-039/`) and one `PRESERVED (round 39)` entry (checkpoint docblock + 2 spec `.txt`s + restore commands). (CONFIRMED)
- `.rsi/evidence/stop-probes.txt` diff is one appended STOP-ABSENT line for round 39 (CONFIRMED, unrelated to theme, probe-only).
- Preserved files exist: `ls .rsi/evidence/round-039/preserved/` → `checkpoint-bound.spec.ts.txt` (156 lines), `checkpoint-docblock.patch` (21 lines), `config-chain-types.spec.ts.txt` (188 lines); timestamps `2026-11-21_00:08:33`. (CONFIRMED)
- `git apply --check --verbose .rsi/evidence/round-039/preserved/checkpoint-docblock.patch` → exit **0**, stderr `Checking patch src/checkpoint/schema.ts...` (CONFIRMED, read-only check, nothing applied).

## 4. lib/ rebuild matches src (CONFIRMED, no rebuild run)

- `git diff HEAD --stat -- lib/ src/` → `lib/delivery/index.d.ts` 21+, `index.d.ts.map` 2+-, `index.js` 205+-, `index.js.map` 2+-, `src/delivery/index.ts` 201+-. `grep` on `lib/delivery/index.js` finds `clampHumanBlock` (:559), `pairCaps` export (:598), `routeChains` (:677), and the try/catch ledger guard; `lib/delivery/index.d.ts:103` declares `pairCaps`. Content parity by inspection, not by rebuild (CONFIRMED).
- mtimes `ls -la --time-style=+%F_%T`: `src/delivery/index.ts` `2026-11-21_00:30:22`, all four `lib/delivery/*` files `2026-11-21_01:28:13` (lib newer than src — consistent with src-then-build order). No `npm run ci/build/test` executed by this audit (NOT_RUN by task order).
- Full tracked diff `git diff HEAD --stat` = exactly 8 files: `.rsi/POOL.md`, `.rsi/evidence/stop-probes.txt`, 4× `lib/delivery/*`, `src/delivery/index.ts`, `test/delivery-human-block.spec.ts`. No other `src/` or `test/` file modified. (CONFIRMED)

## 4b. Scope creep

- Tracked diff: **none** — every modified file belongs to the delivery theme, its test, its rebuild, or its round record/probe. (CONFIRMED)
- Untracked leftovers (NOT part of the diff, merger handles, do NOT delete per task): `test/tmp-ledger-probe.spec.ts` plus `?? .rsi/evidence/*.md`, `?? .rsi/evidence/{compact-audit,heartbeat-rearm,harness}/`, `?? .rsi/evidence/round-039/` files. They are evidence/probes, not shipped code. `git status --short --branch` at audit time: `main...origin/main`, 8 modified + ~20 untracked as listed. (CONFIRMED)

## 5. round-039 spec files exist (CONFIRMED via `ls -R .rsi/evidence/round-039/` + `head`)

- `spec.json` — claims: bilingual 4801-off-by-one + line-break/surrogate edges fixed by `pairCaps`/`clampHumanBlock`/`cutCodeUnits`; `Model routes:` coerced-join fixed by `routeChains` with ledger-dropped-not-answer; red 14/20 → green 39; 26 = 14 pins + 5 direct + 7 guards; checkpoint/config leftovers preserved not shipped.
- `changelog-body.md` — claims: the two bilingual+ledger bilingual `Fixed` entries (EN+ZH) proposed for `[Unreleased]`/0.12.15.
- `state-draft.md` — claims: round-39 STATE paragraph (4801 arithmetic, measured `pairCaps` values, red→green, 70 files/1296 tests, provenance = inherited uncommitted 23:14:35 mtimes) plus 0.12.15 release framing.
- `red-at-bffd0b4.txt` — claims: detached-worktree red run of the new spec on unmodified `bffd0b4` = 34 tests, 14 failed / 20 passed.
- `ci-preliminary.txt` — claims: `npm run ci` exit 0, 70 files / 1296 tests PASS, `verify:lib` byte-identical (captured 00:32).
- `green-delivery-config.txt` — claims: scoped `delivery + config` green = 78 passed (38 delivery + 40 config). NOTE: stale by one — worktree now has 39 delivery its; the 39th (`deliverReport` drops ledger) was added after the 00:07:57 capture per `spec.json`. (CONFIRMED mismatch, HYPOTHESIS on timing: author-stated.)

## Verdict

Single-theme CONFIRMED: delivery clamp + route refusal + ledger guard, with matching test additions, lib rebuild, and round record. No scope creep in the tracked diff. Caveats: (a) green evidence file predates the final test (38 vs 39 delivery its); (b) full `npm run ci` NOT_RUN by this audit — cited from `ci-preliminary.txt`; (c) red/green behavior NOT_RUN here (no test execution per read-only order) — cited from `red-at-bffd0b4.txt` / `green-delivery-config.txt` / `spec.json`.
